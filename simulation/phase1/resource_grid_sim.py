"""
resource_grid_sim.py
====================
5G NR Resource Grid Simulator & Visualizer

参考标准：
    3GPP TS 38.211 v15.7.0  §4.4  — Resource Grid / RB / BWP 定义
    3GPP TS 38.213 v15.7.0  §12   — locationAndBandwidth 解码
    3GPP TS 38.101-1 v15.7.0       — ARFCN / 频率转换

核心功能：
    1. ARFCN ↔ 频率转换（FR1 / FR2）
    2. Point A 计算（从 SSB GSCN + offsetToPointA + k_SSB）
    3. locationAndBandwidth 编解码
    4. BWP / SSB / CORESET#0 / 载波的频域位置可视化
    5. 多 BWP 并存场景（Initial / Active / Dormant）演示

依赖：pip install numpy matplotlib
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from dataclasses import dataclass, field
from typing import Optional
import warnings
import os
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ─────────────────────────────────────────────────────────────────────────────
# 全局常量
# ─────────────────────────────────────────────────────────────────────────────

DARK_BG   = '#0d1117'
DARK_AX   = '#161b22'
DARK_GRID = '#30363d'
DARK_TEXT = '#e6edf3'
DARK_MUTED= '#8b949e'

# SCS 参考值（FR1 / FR2 基准，38.211 §4.4.4.2）
REF_SCS_FR1_KHZ = 15
REF_SCS_FR2_KHZ = 60


# ─────────────────────────────────────────────────────────────────────────────
# 模块 1：ARFCN ↔ 频率转换
# 参考：38.101-1 Table 5.4.2.1-1
# ─────────────────────────────────────────────────────────────────────────────

def arfcn_to_freq_mhz(arfcn: int) -> float:
    """
    ARFCN → 频率（MHz）
    覆盖 FR1（0~6 GHz）和 FR2（24.25~100 GHz）

    38.101-1 Table 5.4.2.1-1:
        频段 1  (<3 GHz)   : F = 0.005 × ARFCN                     (ARFCN: 0~599999)
        频段 2  (3~24.25GHz): F = 3000 + 0.015 × (ARFCN - 600000)  (ARFCN: 600000~2016666)
        频段 3  (FR2)       : F = 24250.08 + 0.060 × (ARFCN - 2016667) (ARFCN: 2016667~3279165)
    """
    if arfcn < 600_000:
        return 0.005 * arfcn
    elif arfcn < 2_016_667:
        return 3000.0 + 0.015 * (arfcn - 600_000)
    else:
        return 24250.08 + 0.060 * (arfcn - 2_016_667)


def freq_mhz_to_arfcn(freq_mhz: float) -> int:
    """
    频率（MHz）→ ARFCN（取最近整数）
    """
    if freq_mhz < 3000.0:
        return round(freq_mhz / 0.005)
    elif freq_mhz < 24250.08:
        return round((freq_mhz - 3000.0) / 0.015) + 600_000
    else:
        return round((freq_mhz - 24250.08) / 0.060) + 2_016_667


# ─────────────────────────────────────────────────────────────────────────────
# 模块 2：locationAndBandwidth 编解码
# 参考：38.213 §12
# ─────────────────────────────────────────────────────────────────────────────

def encode_lab(start_rb: int, n_rb: int) -> int:
    """
    编码 locationAndBandwidth

    公式（38.213 §12）：
        LAB = 37 × startRB + nRB - 1
    """
    assert 1 <= n_rb <= 275, f"nRB 超出范围：{n_rb}"
    assert 0 <= start_rb < 2750, f"startRB 超出范围：{start_rb}"
    return 37 * start_rb + n_rb - 1


def decode_lab(lab: int) -> tuple[int, int]:
    """
    解码 locationAndBandwidth → (startRB, nRB)

    反解公式：
        startRB = floor(LAB / 37)
        nRB     = (LAB mod 37) + 1
    """
    start_rb = lab // 37
    n_rb     = (lab % 37) + 1
    return start_rb, n_rb


def lab_info(lab: int) -> str:
    """打印 locationAndBandwidth 解码信息"""
    s, n = decode_lab(lab)
    return f"LAB={lab} → startRB={s}, nRB={n}（重新编码验证：{encode_lab(s, n)}）"


# ─────────────────────────────────────────────────────────────────────────────
# 模块 3：频域配置数据类
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CarrierConfig:
    """
    载波频域配置（对应 SCS-SpecificCarrier + FrequencyInfoDL）

    Attributes:
        mu              : Numerology（0~4）
        n_rb_total      : 载波总 RB 数（对应 carrierBandwidth）
        point_a_arfcn   : Point A 的 ARFCN（absoluteFrequencyPointA）
        offset_to_carrier: 从 Point A 到载波起点的 RB 偏移（offsetToCarrier）
        label           : 显示标签
    """
    mu: int
    n_rb_total: int
    point_a_arfcn: int
    offset_to_carrier: int = 0
    label: str = "Carrier"

    @property
    def scs_khz(self) -> float:
        return (2 ** self.mu) * 15.0

    @property
    def rb_bw_mhz(self) -> float:
        """单个 RB 的带宽（MHz）"""
        return 12 * self.scs_khz / 1000.0

    @property
    def point_a_mhz(self) -> float:
        return arfcn_to_freq_mhz(self.point_a_arfcn)

    @property
    def carrier_low_mhz(self) -> float:
        """载波实际起点频率"""
        return self.point_a_mhz + self.offset_to_carrier * self.rb_bw_mhz

    @property
    def carrier_high_mhz(self) -> float:
        """载波实际终点频率"""
        return self.carrier_low_mhz + self.n_rb_total * self.rb_bw_mhz

    @property
    def carrier_bw_mhz(self) -> float:
        return self.n_rb_total * self.rb_bw_mhz


@dataclass
class BWPConfig:
    """
    BWP 配置（对应 genericParameters in BWP-Downlink-Common）

    Attributes:
        start_rb    : BWP 相对于 Point A 的起始 CRB（CRB 坐标）
        n_rb        : BWP 的 RB 数
        mu          : BWP 的 SCS（可与载波 SCS 不同）
        bwp_id      : BWP 编号（0~4）
        bwp_type    : 'initial' / 'active' / 'dormant' / 'default'
        label       : 显示标签
    """
    start_rb: int
    n_rb: int
    mu: int
    bwp_id: int = 0
    bwp_type: str = 'active'
    label: str = ""

    def __post_init__(self):
        if not self.label:
            self.label = f"BWP#{self.bwp_id} ({self.bwp_type})"

    @property
    def scs_khz(self) -> float:
        return (2 ** self.mu) * 15.0

    @property
    def rb_bw_mhz(self) -> float:
        return 12 * self.scs_khz / 1000.0

    @property
    def location_and_bandwidth(self) -> int:
        return encode_lab(self.start_rb, self.n_rb)

    def freq_range_mhz(self, point_a_mhz: float) -> tuple[float, float]:
        low  = point_a_mhz + self.start_rb * self.rb_bw_mhz
        high = low + self.n_rb * self.rb_bw_mhz
        return low, high


@dataclass
class SSBConfig:
    """
    SSB 频域配置

    Attributes:
        offset_to_point_a   : offsetToPointA（参考 SCS 的 RB 数，FR1=15kHz）
        k_ssb               : ssb-SubcarrierOffset（子载波粒度，15kHz SCS 步长）
        mu_ssb              : SSB 使用的 SCS
        is_fr2              : 是否 FR2（影响参考 SCS）
    """
    offset_to_point_a: int
    k_ssb: int
    mu_ssb: int
    is_fr2: bool = False

    @property
    def ref_scs_khz(self) -> float:
        return REF_SCS_FR2_KHZ if self.is_fr2 else REF_SCS_FR1_KHZ

    @property
    def ssb_scs_khz(self) -> float:
        return (2 ** self.mu_ssb) * 15.0

    def ssb_low_mhz(self, point_a_mhz: float) -> float:
        """SSB 最低子载波频率"""
        # offsetToPointA 单位：参考 SCS 的 RB
        offset_mhz = self.offset_to_point_a * 12 * self.ref_scs_khz / 1000.0
        # k_SSB 单位：参考 SCS 的子载波（15 kHz for FR1）
        k_offset_mhz = self.k_ssb * self.ref_scs_khz / 1000.0
        return point_a_mhz + offset_mhz + k_offset_mhz

    def ssb_high_mhz(self, point_a_mhz: float) -> float:
        """SSB 最高子载波频率（SSB = 20 RB = 240 子载波）"""
        ssb_bw_mhz = 20 * 12 * self.ssb_scs_khz / 1000.0
        return self.ssb_low_mhz(point_a_mhz) + ssb_bw_mhz

    def ssb_center_mhz(self, point_a_mhz: float) -> float:
        return (self.ssb_low_mhz(point_a_mhz) + self.ssb_high_mhz(point_a_mhz)) / 2


# ─────────────────────────────────────────────────────────────────────────────
# 模块 4：Point A 计算器
# 参考：38.211 §4.4.4.2，ShareTechnote Example
# ─────────────────────────────────────────────────────────────────────────────

def calculate_point_a(
    gscn_arfcn: int,
    k_ssb: int,
    offset_to_point_a: int,
    ssb_scs_khz: float = 30.0,
    ref_scs_khz: float = 15.0,
    verbose: bool = True,
) -> dict:
    """
    从已知参数计算 Point A

    参数：
        gscn_arfcn      : absoluteFrequencySSB 的 ARFCN
        k_ssb           : ssb-SubcarrierOffset（子载波数，参考 SCS 步长）
        offset_to_point_a: offsetToPointA（参考 SCS 的 RB 数）
        ssb_scs_khz     : SSB 的 SCS（kHz）
        ref_scs_khz     : 参考 SCS（FR1=15, FR2=60）

    推导路径（38.211 §4.4.4.2）：
        Step 1: GSCN → SSB 中心频率 f_ssb_center
        Step 2: f_ssb_center → SSB 最低子载波 f_ssb_rb0
                  f_ssb_rb0 = f_ssb_center - 10 × 12 × SCS_SSB
        Step 3: f_ssb_rb0 → Point A
                  f_PointA = f_ssb_rb0 - k_ssb × SCS_ref - offsetToPointA × 12 × SCS_ref
    """
    # Step 1
    f_ssb_center_mhz = arfcn_to_freq_mhz(gscn_arfcn)

    # Step 2
    ssb_half_bw_mhz = 10 * 12 * ssb_scs_khz / 1000.0   # 10 RB（SSB = 20 RB，取一半）
    f_ssb_rb0_mhz = f_ssb_center_mhz - ssb_half_bw_mhz

    # Step 3
    k_offset_mhz = k_ssb * ref_scs_khz / 1000.0
    ota_offset_mhz = offset_to_point_a * 12 * ref_scs_khz / 1000.0
    f_point_a_mhz = f_ssb_rb0_mhz - k_offset_mhz - ota_offset_mhz
    point_a_arfcn = freq_mhz_to_arfcn(f_point_a_mhz)

    result = {
        "gscn_arfcn"       : gscn_arfcn,
        "f_ssb_center_mhz" : f_ssb_center_mhz,
        "f_ssb_rb0_mhz"    : f_ssb_rb0_mhz,
        "k_ssb"            : k_ssb,
        "offset_to_point_a": offset_to_point_a,
        "f_point_a_mhz"    : f_point_a_mhz,
        "point_a_arfcn"    : point_a_arfcn,
    }

    if verbose:
        sep = "─" * 55
        print(f"\n{sep}")
        print(f"Point A 计算（38.211 §4.4.4.2）")
        print(sep)
        print(f"  输入 ARFCN (GSCN)         = {gscn_arfcn}")
        print(f"  SSB 中心频率 (Step 1)      = {f_ssb_center_mhz:.4f} MHz")
        print(f"  SSB 最低子载波 (Step 2)    = {f_ssb_rb0_mhz:.4f} MHz")
        print(f"  k_SSB 偏移                = {k_offset_mhz:.4f} MHz")
        print(f"  offsetToPointA 偏移       = {ota_offset_mhz:.4f} MHz")
        print(f"  Point A 频率 (Step 3)     = {f_point_a_mhz:.4f} MHz")
        print(f"  Point A ARFCN             = {point_a_arfcn}")
        print(sep)

    return result


# ─────────────────────────────────────────────────────────────────────────────
# 模块 5：资源网格可视化
# ─────────────────────────────────────────────────────────────────────────────

# BWP 类型颜色方案
BWP_COLORS = {
    'initial' : ('#58a6ff', 0.25),   # 蓝，半透明
    'active'  : ('#3fb950', 0.30),   # 绿，半透明
    'dormant' : ('#d2a8ff', 0.25),   # 紫，半透明
    'default' : ('#ffa657', 0.20),   # 橙，半透明
}
SSB_COLOR     = '#ff7b72'
CARRIER_COLOR = '#8b949e'
PA_COLOR      = '#f0e68c'   # Point A 标注颜色


def visualize_resource_grid(
    carrier: CarrierConfig,
    bwps: list[BWPConfig],
    ssb: Optional[SSBConfig] = None,
    title: str = "",
    show_rb_grid: bool = True,
):
    """
    可视化资源网格：载波、BWP、SSB、Point A 的频域关系

    参数：
        carrier       : 载波配置
        bwps          : BWP 配置列表（支持多 BWP 并存）
        ssb           : SSB 配置（可选）
        title         : 图表标题
        show_rb_grid  : 是否绘制 RB 网格线
    """
    fig, axes = plt.subplots(
        2, 1, figsize=(16, 9),
        gridspec_kw={'height_ratios': [2, 1]},
        facecolor=DARK_BG
    )
    fig.suptitle(
        title or f'5G NR Resource Grid · μ={carrier.mu} · SCS={carrier.scs_khz:.0f}kHz · '
                 f'{carrier.carrier_bw_mhz:.0f}MHz Carrier',
        color=DARK_TEXT, fontsize=13, fontweight='bold'
    )

    # ── 上图：频域结构全景 ──────────────────────────────────────────────────
    ax = axes[0]
    ax.set_facecolor(DARK_AX)

    f_low  = carrier.point_a_mhz - 2 * carrier.rb_bw_mhz
    f_high = carrier.carrier_high_mhz + 2 * carrier.rb_bw_mhz
    ax.set_xlim(f_low, f_high)
    ax.set_ylim(0, 1)
    ax.axis('off')

    def freq_to_x(f):
        return (f - f_low) / (f_high - f_low)

    # 载波背景
    x0 = freq_to_x(carrier.carrier_low_mhz)
    x1 = freq_to_x(carrier.carrier_high_mhz)
    carrier_rect = mpatches.FancyBboxPatch(
        (x0, 0.05), x1 - x0, 0.90,
        boxstyle="round,pad=0.005",
        facecolor='#1c2230', edgecolor=CARRIER_COLOR,
        linewidth=1.5, transform=ax.transAxes, clip_on=False
    )
    ax.add_patch(carrier_rect)
    ax.text(
        (x0 + x1) / 2, 0.95,
        f'{carrier.label}  {carrier.carrier_bw_mhz:.0f} MHz  '
        f'({carrier.n_rb_total} RB @ {carrier.scs_khz:.0f}kHz)',
        ha='center', va='center', color=CARRIER_COLOR, fontsize=9,
        transform=ax.transAxes, fontweight='bold'
    )

    # RB 网格线
    if show_rb_grid and carrier.n_rb_total <= 100:
        for rb_idx in range(carrier.n_rb_total + 1):
            f_rb = carrier.carrier_low_mhz + rb_idx * carrier.rb_bw_mhz
            xrb  = freq_to_x(f_rb)
            ax.axvline(xrb, ymin=0.05, ymax=0.88,
                       color=DARK_GRID, linewidth=0.3, alpha=0.5)

    # BWP 绘制（从高到低叠放，高优先级在上）
    bwp_levels = [0.08, 0.20, 0.32, 0.44]   # y 起点
    for i, bwp in enumerate(bwps):
        color, alpha = BWP_COLORS.get(bwp.bwp_type, ('#ffffff', 0.2))
        f_bwp_low, f_bwp_high = bwp.freq_range_mhz(carrier.point_a_mhz)

        xb0 = freq_to_x(f_bwp_low)
        xb1 = freq_to_x(f_bwp_high)
        y_level = bwp_levels[i % len(bwp_levels)]

        bwp_rect = mpatches.FancyBboxPatch(
            (xb0, y_level), xb1 - xb0, 0.10,
            boxstyle="round,pad=0.003",
            facecolor=color, alpha=alpha,
            edgecolor=color, linewidth=1.8,
            transform=ax.transAxes, clip_on=False
        )
        ax.add_patch(bwp_rect)
        ax.text(
            (xb0 + xb1) / 2, y_level + 0.05,
            f'{bwp.label}\n{bwp.n_rb} RB @ {bwp.scs_khz:.0f}kHz  '
            f'LAB={bwp.location_and_bandwidth}\n'
            f'{f_bwp_low:.2f}~{f_bwp_high:.2f} MHz',
            ha='center', va='center', color=color, fontsize=7,
            transform=ax.transAxes, fontweight='bold'
        )

    # SSB 绘制
    if ssb is not None:
        f_ssb_low  = ssb.ssb_low_mhz(carrier.point_a_mhz)
        f_ssb_high = ssb.ssb_high_mhz(carrier.point_a_mhz)
        xs0 = freq_to_x(f_ssb_low)
        xs1 = freq_to_x(f_ssb_high)

        ssb_rect = mpatches.FancyBboxPatch(
            (xs0, 0.60), xs1 - xs0, 0.22,
            boxstyle="round,pad=0.003",
            facecolor=SSB_COLOR, alpha=0.30,
            edgecolor=SSB_COLOR, linewidth=2.0,
            transform=ax.transAxes, clip_on=False
        )
        ax.add_patch(ssb_rect)
        ax.text(
            (xs0 + xs1) / 2, 0.71,
            f'SSB\n20RB @ {ssb.ssb_scs_khz:.0f}kHz\n'
            f'k_SSB={ssb.k_ssb}  OTA={ssb.offset_to_point_a}',
            ha='center', va='center', color=SSB_COLOR, fontsize=7,
            transform=ax.transAxes, fontweight='bold'
        )

    # Point A 标注
    xpa = freq_to_x(carrier.point_a_mhz)
    ax.axvline(xpa, ymin=0.0, ymax=1.0,
               color=PA_COLOR, linewidth=1.5, linestyle='--', alpha=0.8)
    ax.text(xpa, 1.02, f'Point A\n{carrier.point_a_mhz:.2f} MHz\nARFCN={carrier.point_a_arfcn}',
            ha='center', va='bottom', color=PA_COLOR, fontsize=7,
            transform=ax.transAxes,
            bbox=dict(boxstyle='round,pad=0.3', facecolor=DARK_AX, alpha=0.85))

    # 频率刻度
    tick_freqs = np.linspace(carrier.carrier_low_mhz, carrier.carrier_high_mhz, 7)
    for tf in tick_freqs:
        xt = freq_to_x(tf)
        ax.text(xt, -0.02, f'{tf:.1f}', ha='center', va='top',
                color=DARK_MUTED, fontsize=7, transform=ax.transAxes)
    ax.set_title(
        f'频域资源结构  |  Point A = {carrier.point_a_mhz:.2f} MHz  '
        f'|  载波范围: {carrier.carrier_low_mhz:.2f}~{carrier.carrier_high_mhz:.2f} MHz',
        color=DARK_TEXT, fontsize=9, pad=8
    )

    # ── 下图：BWP 参数汇总表 ───────────────────────────────────────────────
    ax2 = axes[1]
    ax2.set_facecolor(DARK_AX)
    ax2.axis('off')

    header = ['BWP', 'Type', 'SCS(kHz)', 'startRB', 'nRB', 'LAB', '频率范围(MHz)']
    rows   = []
    for bwp in bwps:
        fl, fh = bwp.freq_range_mhz(carrier.point_a_mhz)
        rows.append([
            f'BWP#{bwp.bwp_id}', bwp.bwp_type,
            f'{bwp.scs_khz:.0f}', str(bwp.start_rb), str(bwp.n_rb),
            str(bwp.location_and_bandwidth), f'{fl:.2f} ~ {fh:.2f}'
        ])
    if ssb:
        fl = ssb.ssb_low_mhz(carrier.point_a_mhz)
        fh = ssb.ssb_high_mhz(carrier.point_a_mhz)
        rows.append(['SSB', '—', f'{ssb.ssb_scs_khz:.0f}',
                     f'OTA={ssb.offset_to_point_a}', '20',
                     f'k_SSB={ssb.k_ssb}', f'{fl:.2f} ~ {fh:.2f}'])

    table = ax2.table(
        cellText=rows, colLabels=header,
        cellLoc='center', loc='center',
        bbox=[0.02, 0.05, 0.96, 0.90]
    )
    table.auto_set_font_size(False)
    table.set_fontsize(8.5)
    for (row, col), cell in table.get_celld().items():
        cell.set_edgecolor(DARK_GRID)
        if row == 0:
            cell.set_facecolor('#1f3355')
            cell.get_text().set_color(DARK_TEXT)
            cell.get_text().set_fontweight('bold')
        else:
            cell.set_facecolor(DARK_AX)
            cell.get_text().set_color(DARK_MUTED)
    ax2.set_title('BWP 参数详解  |  (locationAndBandwidth 解码验证)',
                  color=DARK_TEXT, fontsize=9, pad=5)

    # 图例
    legend_items = [
        mpatches.Patch(facecolor=c, alpha=a+0.3, edgecolor=c, label=t)
        for t, (c, a) in BWP_COLORS.items()
    ] + [
        mpatches.Patch(facecolor=SSB_COLOR, alpha=0.5, edgecolor=SSB_COLOR, label='SSB'),
        mpatches.Patch(facecolor=PA_COLOR, alpha=0.9, label='Point A'),
    ]
    axes[0].legend(
        handles=legend_items, loc='upper right',
        fontsize=7.5, facecolor=DARK_AX, labelcolor=DARK_TEXT,
        framealpha=0.85, ncol=len(legend_items)
    )

    plt.tight_layout(rect=[0, 0, 1, 0.96])


# ─────────────────────────────────────────────────────────────────────────────
# 模块 6：locationAndBandwidth 编解码批量验证
# ─────────────────────────────────────────────────────────────────────────────

def verify_lab_codec():
    """批量验证 LAB 编解码的正确性"""
    print("\n" + "=" * 55)
    print("locationAndBandwidth 编解码验证（38.213 §12）")
    print("=" * 55)
    test_cases = [
        (0,   25,  24),     # 最小 BWP
        (29,  27,  1099),   # ShareTechnote 示例
        (0,   106, 105),    # 典型 Active BWP
        (100, 52,  3751),   # 高偏移 BWP
        (0,   275, 274),    # 最大单载波
    ]
    print(f"{'startRB':>8}  {'nRB':>5}  {'LAB(编码)':>10}  {'startRB(解码)':>14}  {'nRB(解码)':>10}  {'验证':>6}")
    print("-" * 65)
    for start, n, expected_lab in test_cases:
        lab      = encode_lab(start, n)
        s_dec, n_dec = decode_lab(lab)
        ok = "✅" if (s_dec == start and n_dec == n and lab == expected_lab) else "❌"
        print(f"{start:>8}  {n:>5}  {lab:>10}  {s_dec:>14}  {n_dec:>10}  {ok}")
    print("=" * 55)


# ─────────────────────────────────────────────────────────────────────────────
# 主程序：三个演示场景
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    # ── 1. LAB 编解码验证 ───────────────────────────────────────────────────
    verify_lab_codec()

    # ── 2. Point A 计算（ShareTechnote Example 02 完全复现）────────────────
    print("\n【场景 A】ShareTechnote Example 02 复现")
    result = calculate_point_a(
        gscn_arfcn        = 629952,   # GSCN=7811
        k_ssb             = 0,
        offset_to_point_a = 30,
        ssb_scs_khz       = 30.0,
        ref_scs_khz       = 15.0,
    )
    print(f"  预期 Point A ARFCN = 629352，实际 = {result['point_a_arfcn']}")
    assert result['point_a_arfcn'] == 629352, "Point A 计算结果不匹配！"
    print("  ✅ 验证通过")

    # ── 3. 可视化场景 A：典型 FR1 100MHz 载波，多 BWP 并存 ─────────────────
    print("\n【场景 A 可视化】FR1 100MHz 载波，μ=1（30kHz SCS），多 BWP")

    carrier_a = CarrierConfig(
        mu                = 1,
        n_rb_total        = 275,
        point_a_arfcn     = 629352,
        offset_to_carrier = 0,
        label             = "FR1 Carrier",
    )
    bwps_a = [
        BWPConfig(start_rb=30,  n_rb=50,  mu=1, bwp_id=0, bwp_type='initial',
                  label='BWP#0 Initial\n(开机接入)'),
        BWPConfig(start_rb=20,  n_rb=106, mu=1, bwp_id=1, bwp_type='active',
                  label='BWP#1 Active\n(高速业务)'),
        BWPConfig(start_rb=40,  n_rb=25,  mu=1, bwp_id=2, bwp_type='dormant',
                  label='BWP#2 Dormant\n(待机省电)'),
    ]
    ssb_a = SSBConfig(
        offset_to_point_a = 30,
        k_ssb             = 0,
        mu_ssb            = 1,   # 30 kHz SSB for FR1
    )
    visualize_resource_grid(
        carrier_a, bwps_a, ssb_a,
        title="5G NR FR1 Resource Grid · 100MHz · 多 BWP 场景  (38.211 §4.4)"
    )
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_resource_grid_fr1.png'), dpi=150,
                bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ FR1 资源网格图已保存：output_resource_grid_fr1.png")

    # ── 4. 可视化场景 B：FR2 400MHz 载波，μ=3（120kHz SCS）────────────────
    print("\n【场景 B 可视化】FR2 400MHz 载波，μ=3（120kHz SCS）")

    carrier_b = CarrierConfig(
        mu                = 3,
        n_rb_total        = 264,    # FR2 @ 120kHz, ~400MHz
        point_a_arfcn     = 2054166,  # 对应约 28.0 GHz
        offset_to_carrier = 0,
        label             = "FR2 mmWave Carrier",
    )
    bwps_b = [
        BWPConfig(start_rb=0,   n_rb=24,  mu=3, bwp_id=0, bwp_type='initial',
                  label='BWP#0 Initial'),
        BWPConfig(start_rb=0,   n_rb=264, mu=3, bwp_id=1, bwp_type='active',
                  label='BWP#1 Active\n(全带宽)'),
    ]
    ssb_b = SSBConfig(
        offset_to_point_a = 20,
        k_ssb             = 0,
        mu_ssb            = 3,      # 120 kHz SSB for FR2
        is_fr2            = True,
    )
    visualize_resource_grid(
        carrier_b, bwps_b, ssb_b,
        title="5G NR FR2 Resource Grid · 400MHz · mmWave  (38.211 §4.4)",
        show_rb_grid=False   # RB 太多，关闭网格线
    )
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_resource_grid_fr2.png'), dpi=150,
                bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ FR2 资源网格图已保存：output_resource_grid_fr2.png")

    # ── 5. 实验指导 ─────────────────────────────────────────────────────────
    print("\n" + "=" * 55)
    print("🔬 推荐实验")
    print("=" * 55)
    print("""
实验 1：修改 offset_to_carrier
  将 CarrierConfig 的 offset_to_carrier 从 0 改为 10，
  观察载波起点右移但 Point A 保持不动的效果。
  思考：这在哪些实际部署中会出现？

实验 2：混合 SCS BWP
  将 bwps_a 中的 BWP#2 改为 mu=2（60kHz SCS），
  观察不同 SCS 的 BWP 在同一载波上的尺寸对比。
  注意：rb_bw_mhz 从 0.36 MHz 变为 0.72 MHz！

实验 3：验证 Wireshark 抓包值
  已知 locationAndBandwidth = 1099，subcarrierSpacing = kHz30，
  absoluteFrequencyPointA = 629352 (ARFCN)，
  用 decode_lab(1099) 和 CarrierConfig / BWPConfig 还原出频率范围。
  预期：startRB=29, nRB=27, BWP 约 3450~3460 MHz。

实验 4：Point A 不在载波内
  设置 offset_to_carrier = 30（Point A 在载波起点左侧 30 RB），
  验证载波图是否正确偏移，而 Point A 标注仍在载波范围之外。
    """)
    print("=" * 55)
