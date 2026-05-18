"""
pdcch_sim.py
============
5G NR PDCCH & DCI Simulator

参考标准：
    3GPP TS 38.211 v15.7.0  §7.3  — CORESET / PDCCH RE 映射
    3GPP TS 38.212 v15.7.0  §7.3  — PDCCH 传输处理 / DCI 格式
    3GPP TS 38.213 v15.7.0  §10   — Search Space / 盲检
    3GPP TR 38.821 v17.3.0        — NTN K-offset

核心功能：
    1. CORESET 时频资源可视化
    2. CCE 起始索引计算（含 UE 专属哈希 Y_p）
    3. PDCCH 盲检状态机（多 SS / 多 AL）
    4. DCI format 1_1 字段打包 / 解包
    5. NTN K-offset 对 HARQ 时序影响分析
    6. 盲检次数统计与容量分析

依赖：pip install numpy matplotlib
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum, auto
import os

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ─────────────────────────────────────────────────────────────────────────────
# 主题
# ─────────────────────────────────────────────────────────────────────────────
DARK_BG   = '#0d1117'
DARK_AX   = '#161b22'
DARK_GRID = '#30363d'
DARK_TEXT = '#e6edf3'
DARK_MUTED= '#8b949e'

COLORS = {
    'coreset'  : '#3a6a8f',
    'pdcch'    : '#ff7b72',
    'pdsch'    : '#58a6ff',
    'dmrs'     : '#3fb950',
    'empty'    : '#21262d',
    'cce_used' : '#8a6bbf',
    'cce_free' : '#2a2a3a',
}

def ax_style(ax):
    ax.set_facecolor(DARK_AX)
    ax.tick_params(colors=DARK_MUTED, labelsize=8)
    for sp in ax.spines.values():
        sp.set_edgecolor(DARK_GRID)
    ax.grid(True, alpha=0.2, color=DARK_GRID)
    ax.xaxis.label.set_color(DARK_MUTED)
    ax.yaxis.label.set_color(DARK_MUTED)


# ─────────────────────────────────────────────────────────────────────────────
# 模块 1：CORESET 配置
# 参考：38.211 §7.3.2 / 38.331 ControlResourceSet
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CORESETConfig:
    """
    CORESET 配置（对应 38.331 ControlResourceSet IE）

    frequencyDomainResources：45 bit bitmap，每 bit = 6 RB
    duration：1/2/3 个 OFDM 符号
    """
    coreset_id: int
    freq_bitmap: str          # 45 bit 字符串，如 '111111111111111110000...'
    duration: int             # 1/2/3
    mapping_type: str = 'nonInterleaved'   # 'interleaved' / 'nonInterleaved'
    dmrs_scrambling_id: Optional[int] = None  # 若 None 则使用 NID_cell

    def __post_init__(self):
        assert len(self.freq_bitmap) == 45, "bitmap 必须是 45 bit"
        assert self.duration in [1, 2, 3], "duration 必须是 1/2/3"

    @property
    def n_rb(self) -> int:
        """CORESET 频域 RB 数"""
        return self.freq_bitmap.count('1') * 6

    @property
    def rb_start_indices(self) -> list[int]:
        """各个 6-RB 块的起始 RB 索引"""
        result = []
        for i, b in enumerate(self.freq_bitmap):
            if b == '1':
                result.append(i * 6)
        return result

    @property
    def n_reg(self) -> int:
        """CORESET 内总 REG 数（= n_rb × duration）"""
        return self.n_rb * self.duration

    @property
    def n_cce(self) -> int:
        """CORESET 内总 CCE 数（= n_reg / 6）"""
        return self.n_reg // 6

    def info(self):
        print(f"\nCORESET#{self.coreset_id}:")
        print(f"  频域 RB 数：{self.n_rb} RB（{self.freq_bitmap.count('1')} 个 6-RB 块）")
        print(f"  时域符号数：{self.duration}")
        print(f"  总 REG：{self.n_reg}，总 CCE：{self.n_cce}")
        print(f"  映射类型：{self.mapping_type}")
        for al in [1, 2, 4, 8, 16]:
            max_ue = self.n_cce // al
            print(f"  AL={al:2d}：最多同时调度 {max_ue} 个候选")


@dataclass
class SearchSpaceConfig:
    """Search Space 配置（对应 38.331 SearchSpace IE）"""
    ss_id: int
    coreset_id: int
    monitoring_period: int        # sl1/sl2/sl4/... → 这里用整数
    monitoring_offset: int        # 0~period-1
    monitoring_symbols: str       # 14 bit bitmap（哪些符号开始盲检）
    n_candidates: dict            # {al: n} 如 {1:0, 2:4, 4:2, 8:1, 16:0}
    ss_type: str = 'ue-Specific'  # 'common' / 'ue-Specific'
    dci_formats: list = field(default_factory=lambda: ['1_1', '0_1'])


# ─────────────────────────────────────────────────────────────────────────────
# 模块 2：CCE 起始索引计算
# 参考：38.213 §10.1
# ─────────────────────────────────────────────────────────────────────────────

def compute_Y_p(rnti: int, slot_idx: int, n_ci: int = 0,
                A_p: int = 39827) -> int:
    """
    UE 专属 CCE 哈希值 Y_p（38.213 §10.1）

    Y_{-1} = RNTI
    Y_p = (A_p × Y_{p-1}) mod D，D = 65537（质数）

    作用：不同 UE 的 PDCCH 候选位置错开，避免系统性碰撞
    """
    D   = 65537
    Y_p = rnti % D
    for _ in range(slot_idx + 1):
        Y_p = (A_p * Y_p) % D
    return Y_p


def compute_cce_start(
    al: int,
    candidate_idx: int,
    n_cce: int,
    Y_p: int,
    n_ci: int = 0,
) -> int:
    """
    第 candidate_idx 个 AL=al 候选的 CCE 起始索引
    参考：38.213 §10.1 Eq.(11-1)

    CCE_start = AL × { (Y_p + floor(m × N_CCE / (AL × M_L)) + n_CI) mod floor(N_CCE/AL) }
    """
    M_L       = max(1, n_cce // al)   # 该 AL 下最大候选数
    floor_val = n_cce // al
    inner     = (Y_p + (candidate_idx * n_cce) // (al * M_L) + n_ci) % floor_val
    return al * inner


# ─────────────────────────────────────────────────────────────────────────────
# 模块 3：PDCCH 盲检状态机
# 参考：38.213 §10.1
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class BlindDecodingResult:
    """单次盲检尝试的结果"""
    al: int
    candidate_idx: int
    cce_start: int
    dci_format: str
    crc_pass: bool
    rnti_match: bool


def blind_decode_slot(
    coreset: CORESETConfig,
    ss: SearchSpaceConfig,
    slot_idx: int,
    rnti: int,
    n_ci: int = 0,
    target_cce_start: Optional[int] = None,   # 已知 gNB 发送位置（仿真用）
    target_al: Optional[int] = None,
    verbose: bool = True,
) -> tuple[bool, list[BlindDecodingResult]]:
    """
    单个 slot 的 PDCCH 盲检过程

    仿真简化：若 target_cce_start 已知，则在该位置"发现" DCI

    返回：(是否找到 DCI, 所有盲检记录)
    """
    Y_p     = compute_Y_p(rnti, slot_idx)
    results = []
    total_attempts = 0
    found   = False

    if verbose:
        print(f"\n[slot={slot_idx}] 盲检 CORESET#{coreset.coreset_id}，SS#{ss.ss_id}")
        print(f"  Y_p = {Y_p}，C-RNTI = 0x{rnti:04X}")

    for al, n_cand in ss.n_candidates.items():
        if n_cand == 0:
            continue
        for m in range(n_cand):
            total_attempts += 1
            cce_start = compute_cce_start(al, m, coreset.n_cce, Y_p, n_ci)

            # 判断该候选是否命中（仿真：若位置匹配则 CRC 通过）
            if target_cce_start is not None and target_al is not None:
                crc_pass    = (cce_start == target_cce_start and al == target_al)
                rnti_match  = crc_pass
            else:
                crc_pass    = False
                rnti_match  = False

            result = BlindDecodingResult(
                al=al, candidate_idx=m, cce_start=cce_start,
                dci_format=ss.dci_formats[0],
                crc_pass=crc_pass, rnti_match=rnti_match
            )
            results.append(result)

            if crc_pass and not found:
                found = True
                if verbose:
                    print(f"  ✅ 盲检命中！AL={al}，候选#{m}，CCE起点={cce_start}")

    if verbose:
        print(f"  总盲检次数：{total_attempts}（上限 44 次/slot）")
        if total_attempts > 44:
            print(f"  ⚠️  超出盲检次数上限！")
        if not found:
            print(f"  ❌ 本 slot 未检测到 DCI")

    return found, results


# ─────────────────────────────────────────────────────────────────────────────
# 模块 4：DCI format 1_1 字段打包 / 解包
# 参考：38.212 §7.3.1.2.2
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DCI_1_1:
    """
    DCI format 1_1 关键字段（下行调度）
    完整字段见 38.212 §7.3.1.2.2，这里实现常用子集
    """
    identifier: int    = 1    # 1 bit，1=DL
    bwp_indicator: int = 0    # 0~2 bits
    freq_domain_ra: int = 0   # Variable（RIV 或 bitmap）
    time_domain_ra: int = 0   # 4 bits（行索引）
    vrb_prb_mapping: int = 0  # 1 bit
    mcs_cw0: int = 0          # 5 bits（0~31）
    ndi_cw0: int = 1          # 1 bit（1=新传，0=重传）
    rv_cw0: int = 0           # 2 bits（0/1/2/3）
    harq_process: int = 0     # 4 bits（0~15）
    dai: int = 0              # 1~2 bits
    tpc_pucch: int = 0        # 2 bits
    pucch_res_ind: int = 0    # 3 bits
    pdsch_to_harq_timing: int = 1  # 3 bits（K1 = 1~8）
    antenna_ports: int = 0    # 4~6 bits
    tci: int = 0              # 3 bits（TCI state）

    def pack(self) -> dict:
        """返回字段字典（用于打印和分析）"""
        return {
            'identifier'            : (self.identifier,           1,  'DL=1/UL=0'),
            'bwp_indicator'         : (self.bwp_indicator,        2,  'BWP 切换'),
            'freq_domain_ra'        : (self.freq_domain_ra,      'V', 'RIV（起始+长度）'),
            'time_domain_ra'        : (self.time_domain_ra,       4,  'SLIV 行索引'),
            'vrb_to_prb_mapping'    : (self.vrb_prb_mapping,      1,  '0=非交织'),
            'mcs'                   : (self.mcs_cw0,              5,  '0~28（查 Table 5.1.3.1-1）'),
            'ndi'                   : (self.ndi_cw0,              1,  '1=新传 0=重传'),
            'rv'                    : (self.rv_cw0,               2,  '0→2→3→1'),
            'harq_process'          : (self.harq_process,         4,  '0~15'),
            'pdsch_to_harq_timing'  : (self.pdsch_to_harq_timing, 3,  f'K1={self.pdsch_to_harq_timing} slot'),
            'antenna_ports'         : (self.antenna_ports,        5,  'DMRS 端口'),
            'tci'                   : (self.tci,                  3,  'TCI state（波束）'),
        }

    def print_fields(self, k_offset: int = 0):
        print(f"\nDCI format 1_1 字段（38.212 §7.3.1.2.2）")
        print(f"{'─'*55}")
        print(f"{'字段':<22} {'值':>6}  {'bit':>4}  {'说明'}")
        print(f"{'─'*55}")
        for name, (val, bits, desc) in self.pack().items():
            print(f"  {name:<20} {val:>6}  {str(bits):>4}  {desc}")
        if k_offset > 0:
            eff_k1 = self.pdsch_to_harq_timing + k_offset
            print(f"\n  [NTN] K_offset = {k_offset} slots")
            print(f"  [NTN] 有效 K1 = {self.pdsch_to_harq_timing} + {k_offset} = {eff_k1} slots")
        print(f"{'─'*55}")


# ─────────────────────────────────────────────────────────────────────────────
# 模块 5：NTN K-offset 分析
# 参考：38.213 §9.2.3，38.821 §6.3
# ─────────────────────────────────────────────────────────────────────────────

def compute_k_offset(
    altitude_km: float,
    elevation_deg: float,
    mu: int,
    processing_ms: float = 2.0,  # gNB + UE 处理时间（ms）
) -> dict:
    """
    计算 NTN 场景所需的 K-offset

    K_offset = ⌈RTT_total / T_slot⌉

    RTT_total = 2 × 单程时延 + 处理时间
    """
    RE_KM   = 6371.0
    r_km    = RE_KM + altitude_km
    cos_e   = np.cos(np.radians(elevation_deg))
    sin_e   = np.sin(np.radians(elevation_deg))
    d_km    = np.sqrt(r_km**2 - (RE_KM * cos_e)**2) - RE_KM * sin_e
    tau_ms  = d_km / 300.0       # 单程时延（ms）
    rtt_ms  = 2 * tau_ms + processing_ms

    slot_ms = 1.0 / (2 ** mu)
    k_offset = int(np.ceil(rtt_ms / slot_ms))

    return {
        'altitude_km'   : altitude_km,
        'elevation_deg' : elevation_deg,
        'mu'            : mu,
        'tau_ms'        : tau_ms,
        'rtt_ms'        : rtt_ms,
        'slot_ms'       : slot_ms,
        'k_offset_min'  : k_offset,
        'k_offset_rec'  : k_offset + 5,  # 推荐值（+5 slots 余量）
    }


def analyze_ntn_harq_timeline(
    altitude_km: float = 550.0,
    elevation_deg: float = 30.0,
    mu: int = 1,
    k1_base: int = 4,
    k_offset: int = 0,
):
    """
    可视化 NTN HARQ 时序：DCI → PDSCH → HARQ-ACK
    对比有/无 K-offset 的情形
    """
    slot_ms = 1.0 / (2 ** mu)
    RE_KM   = 6371.0
    r_km    = RE_KM + altitude_km
    cos_e   = np.cos(np.radians(elevation_deg))
    sin_e   = np.sin(np.radians(elevation_deg))
    d_km    = np.sqrt(r_km**2 - (RE_KM * cos_e)**2) - RE_KM * sin_e
    tau_ms  = d_km / 300.0

    # 事件时刻（ms）
    t0_dci_tx    = 0.0
    t1_dci_rx    = t0_dci_tx + tau_ms
    t2_pdsch_tx  = t0_dci_tx
    t3_pdsch_rx  = t2_pdsch_tx + tau_ms
    t4_harq_tx_no = t3_pdsch_rx + k1_base * slot_ms         # 无 K-offset
    t4_harq_tx_ok = t3_pdsch_rx + (k1_base + k_offset) * slot_ms  # 有 K-offset
    t5_harq_rx_no = t4_harq_tx_no + tau_ms
    t5_harq_rx_ok = t4_harq_tx_ok + tau_ms

    fig, ax = plt.subplots(figsize=(14, 5), facecolor=DARK_BG)
    ax.set_facecolor(DARK_AX)

    # 绘制时序线
    y_gnb, y_ue = 1.0, 0.0
    max_t = max(t5_harq_rx_no, t5_harq_rx_ok) + 2

    ax.axhline(y_gnb, color=DARK_GRID, lw=0.5, ls='--')
    ax.axhline(y_ue,  color=DARK_GRID, lw=0.5, ls='--')
    ax.text(-1, y_gnb, 'gNB', color=DARK_TEXT, ha='right', va='center', fontsize=10)
    ax.text(-1, y_ue,  'UE',  color=DARK_TEXT, ha='right', va='center', fontsize=10)

    def draw_arrow(t_start, y_start, t_end, y_end, color, label, ls='-'):
        ax.annotate('', xy=(t_end, y_end), xytext=(t_start, y_start),
                    arrowprops=dict(arrowstyle='->', color=color,
                                    lw=1.8, linestyle=ls))
        mid_t = (t_start + t_end) / 2
        mid_y = (y_start + y_end) / 2
        ax.text(mid_t, mid_y + 0.06, label, ha='center', va='bottom',
                color=color, fontsize=8,
                bbox=dict(boxstyle='round,pad=0.2', fc=DARK_AX, alpha=0.8))

    # DCI + PDSCH（同时发送）
    draw_arrow(t0_dci_tx, y_gnb, t1_dci_rx, y_ue, '#58a6ff', 'DCI + PDSCH\n（同时传播）')

    # UE 处理 PDSCH
    ax.barh(y_ue, 1.0, left=t3_pdsch_rx, height=0.08,
            color='#3fb950', alpha=0.7)
    ax.text(t3_pdsch_rx + 0.5, y_ue - 0.12, 'LDPC 解码', ha='center',
            color='#3fb950', fontsize=7.5)

    # HARQ-ACK 无 K-offset（错误情形）
    draw_arrow(t4_harq_tx_no, y_ue, t5_harq_rx_no, y_gnb,
               '#ff7b72', f'HARQ-ACK\n(K1={k1_base}, K_offset=0)\n❌ 过早', ls='--')

    # HARQ-ACK 有 K-offset（正确情形）
    if k_offset > 0:
        draw_arrow(t4_harq_tx_ok, y_ue, t5_harq_rx_ok, y_gnb,
                   '#3fb950', f'HARQ-ACK\n(K1={k1_base}+{k_offset}={k1_base+k_offset})\n✅ Rel-17')

    ax.set_xlim(-1.5, max_t)
    ax.set_ylim(-0.3, 1.3)
    ax.set_xlabel('时间 (ms)', fontsize=9, color=DARK_MUTED)
    ax.set_title(
        f'NTN HARQ 时序分析  |  LEO {altitude_km}km，仰角{elevation_deg}°，μ={mu}\n'
        f'单程时延 = {tau_ms:.2f}ms，RTT ≈ {2*tau_ms:.2f}ms  (3GPP TR 38.821 Rel-17)',
        color=DARK_TEXT, fontsize=10
    )
    for sp in ax.spines.values():
        sp.set_edgecolor(DARK_GRID)
    ax.tick_params(colors=DARK_MUTED, labelsize=8)
    ax.set_yticks([])
    ax.grid(True, axis='x', alpha=0.2, color=DARK_GRID)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_ntn_harq_timeline.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_ntn_harq_timeline.png")


# ─────────────────────────────────────────────────────────────────────────────
# 模块 6：CORESET 时频资源可视化
# ─────────────────────────────────────────────────────────────────────────────

def visualize_coreset(
    coreset: CORESETConfig,
    bwp_n_rb: int = 52,
    n_symbols: int = 14,
    pdsch_rb_start: int = 0,
    pdsch_rb_size: int = 52,
    pdsch_sym_start: int = 3,
    pdsch_sym_size: int = 11,
):
    """
    可视化 CORESET 在 BWP 内的时频位置
    同时展示 PDSCH 数据区域和 CORESET 控制区域
    """
    fig, ax = plt.subplots(figsize=(14, max(6, bwp_n_rb // 6)),
                            facecolor=DARK_BG)
    ax.set_facecolor(DARK_AX)
    n_sc = bwp_n_rb * 12

    grid = np.zeros((n_sc, n_symbols, 3))
    # 背景：空
    grid[:] = np.array([0x21/255, 0x26/255, 0x2d/255])

    # PDSCH 区域（蓝）
    pdsch_sc_lo = pdsch_rb_start * 12
    pdsch_sc_hi = (pdsch_rb_start + pdsch_rb_size) * 12
    for sym in range(pdsch_sym_start, pdsch_sym_start + pdsch_sym_size):
        if sym < n_symbols:
            grid[pdsch_sc_lo:pdsch_sc_hi, sym] = np.array([0x58/255, 0xa6/255, 0xff/255])

    # CORESET 区域（控制信道颜色）
    coreset_color = np.array([0xff/255, 0x7b/255, 0x72/255])
    dmrs_color    = np.array([0x3f/255, 0xb9/255, 0x50/255])
    for rb_start in coreset.rb_start_indices:
        sc_lo = rb_start * 12
        sc_hi = min(sc_lo + 72, n_sc)  # 6 RB × 12 = 72 子载波
        for sym in range(coreset.duration):
            for sc in range(sc_lo, sc_hi):
                # DMRS：每 4 个子载波 1 个（简化）
                if (sc - sc_lo) % 4 == 1:
                    grid[sc, sym] = dmrs_color
                else:
                    grid[sc, sym] = coreset_color

    ax.imshow(grid, origin='lower', aspect='auto',
              extent=[-0.5, n_symbols - 0.5, -0.5, n_sc - 0.5])

    # 网格线
    for rb in range(0, bwp_n_rb + 1, 6):
        ax.axhline(rb * 12 - 0.5, color=DARK_GRID, lw=0.5, alpha=0.6)
    for sym in range(n_symbols + 1):
        ax.axvline(sym - 0.5, color=DARK_GRID, lw=0.4, alpha=0.5)

    # CORESET 边框
    for rb_start in coreset.rb_start_indices:
        ax.add_patch(plt.Rectangle(
            (-0.5, rb_start * 12 - 0.5),
            coreset.duration, 72,
            fill=False, edgecolor='#ff7b72', lw=1.5, ls='--'
        ))

    ax.set_xlabel('OFDM Symbol Index', fontsize=9, color=DARK_MUTED)
    ax.set_ylabel('Subcarrier Index', fontsize=9, color=DARK_MUTED)
    ax.set_xticks(range(n_symbols))
    ax.set_xticklabels([f'#{i}' for i in range(n_symbols)],
                        fontsize=7, color=DARK_MUTED)
    ax.set_title(
        f'CORESET#{coreset.coreset_id} 时频资源可视化  |  '
        f'{coreset.n_rb} RB × {coreset.duration} sym，{coreset.n_cce} CCE\n'
        f'BWP: {bwp_n_rb} RB  (3GPP TS 38.211 §7.3.2)',
        color=DARK_TEXT, fontsize=10
    )

    legend_items = [
        mpatches.Patch(facecolor='#ff7b72', label=f'CORESET#{coreset.coreset_id}（PDCCH）'),
        mpatches.Patch(facecolor='#3fb950', label='PDCCH DMRS'),
        mpatches.Patch(facecolor='#58a6ff', label='PDSCH 数据区'),
        mpatches.Patch(facecolor='#21262d', label='空 RE'),
    ]
    ax.legend(handles=legend_items, loc='upper right', fontsize=8.5,
              facecolor=DARK_AX, labelcolor=DARK_TEXT, framealpha=0.85)

    for sp in ax.spines.values():
        sp.set_edgecolor(DARK_GRID)
    ax.tick_params(colors=DARK_MUTED, labelsize=7)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_coreset_visualization.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_coreset_visualization.png")


# ─────────────────────────────────────────────────────────────────────────────
# 模块 7：盲检次数分析
# ─────────────────────────────────────────────────────────────────────────────

def analyze_blind_decoding_capacity(
    coreset_list: list[CORESETConfig],
    ss_list: list[SearchSpaceConfig],
    limit: int = 44,
):
    """
    统计并可视化各 AL 的盲检次数分布
    对比 38.213 §10.1 中的 44 次/slot 上限
    """
    al_counts = {1: 0, 2: 0, 4: 0, 8: 0, 16: 0}
    total = 0

    print(f"\n{'═'*55}")
    print(f"盲检次数分析（38.213 §10.1，上限 {limit} 次/slot）")
    print(f"{'─'*55}")

    for ss in ss_list:
        coreset = next(c for c in coreset_list if c.coreset_id == ss.coreset_id)
        print(f"\nSearch Space #{ss.ss_id}（CORESET#{ss.coreset_id}，{ss.ss_type}）")
        for al, n in ss.n_candidates.items():
            if n > 0:
                al_counts[al] += n
                total += n
                max_for_al = coreset.n_cce // al
                print(f"  AL={al:2d}：{n} 候选（CORESET 最大支持 {max_for_al}）")

    print(f"\n总盲检次数：{total}/{limit} "
          f"{'✅ 在上限内' if total <= limit else '❌ 超出上限！'}")
    print(f"{'═'*55}")

    # 可视化
    fig, axes = plt.subplots(1, 2, figsize=(13, 5), facecolor=DARK_BG)
    fig.suptitle('PDCCH 盲检次数分析  |  38.213 §10.1',
                 color=DARK_TEXT, fontsize=12)

    # 左图：各 AL 盲检次数条形图
    ax = axes[0]
    ax_style(ax)
    als    = [1, 2, 4, 8, 16]
    counts = [al_counts[al] for al in als]
    colors = ['#58a6ff', '#3fb950', '#ffa657', '#d2a8ff', '#ff7b72']
    bars = ax.bar([f'AL={a}' for a in als], counts, color=colors, alpha=0.85,
                  edgecolor=DARK_GRID)
    for bar, cnt in zip(bars, counts):
        if cnt > 0:
            ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.1,
                    str(cnt), ha='center', va='bottom',
                    color=DARK_TEXT, fontsize=10, fontweight='bold')
    ax.axhline(0, color=DARK_GRID, lw=0.5)
    ax.set_ylabel('盲检候选数量', fontsize=9)
    ax.set_title('各聚合级别的盲检候选数', color=DARK_TEXT, fontsize=10)

    # 右图：总盲检次数 vs 上限（饼图风格）
    ax2 = axes[1]
    ax2.set_facecolor(DARK_AX)
    ax2.axis('off')

    used_pct = min(total / limit * 100, 100)
    free_pct = max(0, 100 - used_pct)
    wedge_colors = ['#3fb950' if total <= limit else '#ff7b72', '#2a2a3a']
    ax2.pie([used_pct, free_pct], colors=wedge_colors,
            startangle=90, counterclock=False,
            wedgeprops=dict(width=0.5, edgecolor=DARK_AX, linewidth=2))
    ax2.text(0, 0, f'{total}\n/{limit}', ha='center', va='center',
             fontsize=18, fontweight='bold',
             color='#3fb950' if total <= limit else '#ff7b72')
    ax2.set_title(f'总盲检次数（上限 {limit} 次/slot）',
                  color=DARK_TEXT, fontsize=10, pad=12)
    status = '✅ 在上限内' if total <= limit else '❌ 超出上限！'
    ax2.text(0, -0.65, status, ha='center', va='center',
             fontsize=12, color='#3fb950' if total <= limit else '#ff7b72')

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_blind_decoding_analysis.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_blind_decoding_analysis.png")


# ─────────────────────────────────────────────────────────────────────────────
# 主程序
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    print("=" * 60)
    print("5G NR PDCCH & DCI Simulator")
    print("3GPP TS 38.211/38.212/38.213 · Rel-15/17")
    print("=" * 60)

    # ── 1. CORESET 配置与信息打印 ────────────────────────────────────────────
    print("\n【1】CORESET 配置分析")
    # 对应 ShareTechnote 示例：前 18 个 6-RB 块 = 108 RB
    coreset1 = CORESETConfig(
        coreset_id   = 1,
        freq_bitmap  = '111111111111111110000000000000000000000000000',
        duration     = 2,
        mapping_type = 'nonInterleaved',
    )
    coreset1.info()

    # CORESET#0（由 MIB 决定，较小）
    coreset0 = CORESETConfig(
        coreset_id   = 0,
        freq_bitmap  = '111111100000000000000000000000000000000000000',
        duration     = 1,
        mapping_type = 'interleaved',
    )
    coreset0.info()

    # ── 2. Search Space 配置 ─────────────────────────────────────────────────
    print("\n【2】Search Space 配置")
    ss_common = SearchSpaceConfig(
        ss_id=1, coreset_id=0,
        monitoring_period=1, monitoring_offset=0,
        monitoring_symbols='10000000000000',
        n_candidates={1: 0, 2: 0, 4: 4, 8: 0, 16: 0},
        ss_type='common',
        dci_formats=['1_0', '0_0'],
    )
    ss_ue = SearchSpaceConfig(
        ss_id=2, coreset_id=1,
        monitoring_period=1, monitoring_offset=0,
        monitoring_symbols='10000000000000',
        n_candidates={1: 0, 2: 4, 4: 2, 8: 1, 16: 0},
        ss_type='ue-Specific',
        dci_formats=['1_1', '0_1'],
    )

    # ── 3. 盲检次数分析 ──────────────────────────────────────────────────────
    print("\n【3】盲检次数分析（对比 44 次/slot 上限）")
    analyze_blind_decoding_capacity(
        coreset_list=[coreset0, coreset1],
        ss_list=[ss_common, ss_ue],
    )

    # ── 4. 盲检状态机演示 ────────────────────────────────────────────────────
    print("\n【4】PDCCH 盲检状态机演示")
    rnti       = 0xC1A3
    slot_idx   = 42
    target_al  = 4
    Y_p        = compute_Y_p(rnti, slot_idx)
    target_cce = compute_cce_start(target_al, 0, coreset1.n_cce, Y_p)

    print(f"  gNB 在 AL={target_al}，CCE#{target_cce} 发送 DCI（C-RNTI=0x{rnti:04X}）")
    found, results = blind_decode_slot(
        coreset=coreset1, ss=ss_ue, slot_idx=slot_idx,
        rnti=rnti, target_cce_start=target_cce, target_al=target_al,
    )

    # ── 5. DCI format 1_1 字段打包 ───────────────────────────────────────────
    print("\n【5】DCI format 1_1 字段示例")
    dci = DCI_1_1(
        mcs_cw0=16, freq_domain_ra=0b1100000111111,
        time_domain_ra=2, harq_process=3,
        ndi_cw0=1, rv_cw0=0,
        pdsch_to_harq_timing=4,
        tci=1,
    )
    dci.print_fields(k_offset=0)   # 无 K-offset（地面）
    dci.print_fields(k_offset=15)  # 有 K-offset（NTN）

    # ── 6. CORESET 时频资源可视化 ─────────────────────────────────────────────
    print("\n【6】CORESET 时频资源可视化")
    visualize_coreset(
        coreset=coreset1, bwp_n_rb=52, n_symbols=14,
        pdsch_rb_start=0, pdsch_rb_size=52,
        pdsch_sym_start=2, pdsch_sym_size=12,
    )

    # ── 7. NTN K-offset 分析 ─────────────────────────────────────────────────
    print("\n【7】NTN K-offset 需求分析")
    print(f"\n{'─'*55}")
    print(f"{'场景':<25} {'τ(ms)':>8} {'RTT(ms)':>9} {'K_offset':>10}")
    print(f"{'─'*55}")
    for alt, elev, mu in [
        (550,  90, 1), (550,  30, 1), (550,  10, 1),
        (1200, 45, 1), (550,  30, 0),
    ]:
        r = compute_k_offset(alt, elev, mu)
        label = f"LEO{alt}km θ={elev}° μ={mu}"
        print(f"  {label:<23} {r['tau_ms']:>8.2f} {r['rtt_ms']:>9.2f} {r['k_offset_rec']:>10}")
    print(f"{'─'*55}")

    # ── 8. NTN HARQ 时序可视化 ───────────────────────────────────────────────
    print("\n【8】NTN HARQ 时序分析（有/无 K-offset 对比）")
    analyze_ntn_harq_timeline(
        altitude_km=550, elevation_deg=30, mu=1,
        k1_base=4, k_offset=15,
    )

    print("\n🎉 所有模块完成。输出文件：")
    print("  output_coreset_visualization.png   — CORESET 时频资源")
    print("  output_blind_decoding_analysis.png — 盲检次数分析")
    print("  output_ntn_harq_timeline.png       — NTN HARQ 时序对比")
