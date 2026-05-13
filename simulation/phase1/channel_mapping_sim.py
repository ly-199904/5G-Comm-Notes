"""
channel_mapping_sim.py
======================
5G NR Channel Mapping Simulator

参考标准：
    3GPP TS 38.211 v15.7.0  — 物理信道与信号
    3GPP TS 38.212 v15.7.0  — 信道编码（LDPC / Polar Code）
    3GPP TS 38.214 v15.7.0  — TBS 计算

核心功能：
    1. QAM 调制器 / 解调器（QPSK / 16QAM / 64QAM / 256QAM）
    2. PDSCH 扰码（基于 RNTI + Cell ID）
    3. 层映射（1~4 层）
    4. PDCCH RNTI 掩码模拟
    5. ZC 序列（PRACH Preamble）生成与相关检测
    6. 资源网格 RE 占用可视化
    7. BER vs SNR 曲线（多 MCS 对比）

依赖：pip install torch numpy matplotlib
"""

import torch
import torch.nn as nn
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from dataclasses import dataclass
from typing import Optional
import os
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ─────────────────────────────────────────────────────────────────────────────
# 全局主题
# ─────────────────────────────────────────────────────────────────────────────
DARK_BG   = '#0d1117'
DARK_AX   = '#161b22'
DARK_GRID = '#30363d'
DARK_TEXT = '#e6edf3'
DARK_MUTED= '#8b949e'

CHANNEL_COLORS = {
    'PDCCH' : '#ff7b72',   # 红：控制信道，最重要
    'PDSCH' : '#58a6ff',   # 蓝：数据信道
    'DMRS'  : '#3fb950',   # 绿：解调参考信号
    'SSB'   : '#ffa657',   # 橙：同步广播块
    'CSIRS' : '#d2a8ff',   # 紫：CSI 参考信号
    'EMPTY' : '#21262d',   # 暗：空 RE
}


# ─────────────────────────────────────────────────────────────────────────────
# 模块 1：QAM 调制器（支持 QPSK / 16QAM / 64QAM / 256QAM）
# 参考：38.211 §7.3.1.2（下行），§6.3.1.2（上行）
# ─────────────────────────────────────────────────────────────────────────────

class QAMModulator(nn.Module):
    """
    Gray 编码 QAM 调制器（可微分，支持批处理）

    调制阶数 Qm 与每符号比特数：
        QPSK  : Qm = 2
        16QAM : Qm = 4
        64QAM : Qm = 6
        256QAM: Qm = 8
    """
    SUPPORTED = {2: 'QPSK', 4: '16QAM', 6: '64QAM', 8: '256QAM'}

    def __init__(self, modulation_order: int = 2):
        super().__init__()
        assert modulation_order in self.SUPPORTED, \
            f"不支持的调制阶数 {modulation_order}，可选：{list(self.SUPPORTED)}"
        self.qm   = modulation_order
        self.name = self.SUPPORTED[modulation_order]
        self.M    = 2 ** modulation_order     # 星座点总数
        self._build_constellation()

    def _build_constellation(self):
        """构建 Gray 编码星座图（归一化到单位平均功率）"""
        M = self.M
        Qm = self.qm
        half = int(M ** 0.5)   # 每维的电平数

        # 1D PAM 坐标（Gray 编码）
        pam = torch.arange(half, dtype=torch.float32)
        # Gray 编码映射：奇数位翻转
        pam_int = pam.to(torch.int32) 
        gray = pam_int ^ (pam_int >> 1)
        gray = gray.to(torch.float32)
        # 中心化
        levels = 2 * gray - (half - 1)

        # 2D QAM：笛卡尔积
        real_pts = levels.repeat(half)
        imag_pts = levels.repeat_interleave(half)
        const = torch.complex(real_pts, imag_pts)

        # 归一化（平均功率 = 1）
        power = (const.abs() ** 2).mean()
        const = const / power.sqrt()

        self.register_buffer('constellation', const)

    def forward(self, bits: torch.Tensor) -> torch.Tensor:
        """
        Args:
            bits: 比特流，shape (..., N)，N 必须是 Qm 的倍数
        Returns:
            symbols: 复数符号，shape (..., N // Qm)
        """
        assert bits.shape[-1] % self.qm == 0, \
            f"比特数 {bits.shape[-1]} 不是 Qm={self.qm} 的倍数"

        bits_reshaped = bits.view(*bits.shape[:-1], -1, self.qm)
        # 将每组 Qm bits 转为十进制索引
        powers = 2 ** torch.arange(self.qm - 1, -1, -1,
                                    device=bits.device, dtype=torch.long)
        indices = (bits_reshaped.long() * powers).sum(dim=-1)
        return self.constellation[indices]

    def demodulate(self, symbols: torch.Tensor) -> torch.Tensor:
        """硬判决解调：最近邻星座点 → 比特"""
        const = self.constellation    # (M,)
        # 计算每个接收符号到所有星座点的距离
        dist = (symbols.unsqueeze(-1) - const).abs()   # (..., M)
        indices = dist.argmin(dim=-1)                   # (...,)
        # 索引 → 比特（MSB first）
        bits_out = torch.zeros(*indices.shape, self.qm,
                                device=symbols.device, dtype=torch.long)
        for i in range(self.qm):
            bits_out[..., self.qm - 1 - i] = (indices >> i) & 1
        return bits_out.view(*indices.shape[:-1], -1)

    def plot_constellation(self, ax=None, received: Optional[torch.Tensor] = None):
        """绘制星座图（可选：叠加接收点）"""
        if ax is None:
            _, ax = plt.subplots(figsize=(5, 5), facecolor=DARK_BG)
        ax.set_facecolor(DARK_AX)

        const = self.constellation.cpu().numpy()
        ax.scatter(const.real, const.imag,
                   c=CHANNEL_COLORS['PDSCH'], s=80, zorder=5, label='Ideal')

        if received is not None:
            rx = received.detach().cpu().numpy()
            ax.scatter(rx.real, rx.imag, c=DARK_MUTED,
                       s=5, alpha=0.4, zorder=3, label='Received')

        ax.axhline(0, color=DARK_GRID, lw=0.5)
        ax.axvline(0, color=DARK_GRID, lw=0.5)
        ax.set_title(f'{self.name} Constellation', color=DARK_TEXT, fontsize=10)
        ax.tick_params(colors=DARK_MUTED)
        ax.legend(fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT)
        for sp in ax.spines.values():
            sp.set_edgecolor(DARK_GRID)
        return ax


# ─────────────────────────────────────────────────────────────────────────────
# 模块 2：PDSCH 扰码（38.212 §7.2.7）
# ─────────────────────────────────────────────────────────────────────────────

def generate_prbs(length: int, c_init: int) -> torch.Tensor:
    """
    伪随机二进制序列（PRBS）生成器
    基于 38.212 §5.2.1 的 Gold 序列

    参数：
        length : 所需序列长度
        c_init : 初始化值（由 RNTI + Cell ID 决定）
    """
    # 初始化两个 m-序列寄存器
    Nc = 1600
    x1 = np.zeros(length + Nc + 31, dtype=np.int8)
    x2 = np.zeros(length + Nc + 31, dtype=np.int8)

    # x1 初始化（固定）
    x1[0] = 1

    # x2 初始化（由 c_init 决定）
    for i in range(31):
        x2[i] = (c_init >> i) & 1

    # 递推生成
    for n in range(length + Nc):
        x1[n + 31] = (x1[n + 3] + x1[n]) % 2
        x2[n + 31] = (x2[n + 3] + x2[n + 2] + x2[n + 1] + x2[n]) % 2

    seq = (x1[Nc:Nc + length] + x2[Nc:Nc + length]) % 2
    return torch.tensor(seq, dtype=torch.long)


def pdsch_scramble(bits: torch.Tensor, rnti: int, cell_id: int,
                   q: int = 0, data_scrambling_id: Optional[int] = None) -> torch.Tensor:
    """
    PDSCH 加扰（38.212 §7.3.1.1）

    公式：cinit = nRNTI × 2^15 + q × 2^14 + nID
        nID = dataScramblingIdentityPDSCH（若配置），否则 = cell_id
    """
    n_id = data_scrambling_id if data_scrambling_id is not None else cell_id
    c_init = (rnti * (2 ** 15) + q * (2 ** 14) + n_id) % (2 ** 31)
    prbs = generate_prbs(len(bits), c_init)
    return (bits + prbs) % 2


# ─────────────────────────────────────────────────────────────────────────────
# 模块 3：层映射（38.211 §7.3.1.3）
# ─────────────────────────────────────────────────────────────────────────────

def layer_map(symbols: torch.Tensor, n_layers: int) -> torch.Tensor:
    """
    单码字层映射（38.211 Table 7.3.1.3-1）

    Args:
        symbols  : 调制符号，shape (M_symb,)，复数
        n_layers : 层数（1~4 for single codeword）
    Returns:
        mapped   : shape (n_layers, M_symb // n_layers)
    """
    assert symbols.shape[0] % n_layers == 0, \
        f"符号数 {symbols.shape[0]} 不能被层数 {n_layers} 整除"
    return symbols.view(n_layers, -1)   # 轮询分配到各层


def layer_demap(mapped: torch.Tensor) -> torch.Tensor:
    """层解映射"""
    return mapped.view(-1)


# ─────────────────────────────────────────────────────────────────────────────
# 模块 4：PDCCH RNTI 掩码模拟（38.212 §7.3.2）
# ─────────────────────────────────────────────────────────────────────────────

def pdcch_rnti_mask(crc_bits: torch.Tensor, rnti: int) -> torch.Tensor:
    """
    用 RNTI 掩码 CRC 后 16 bit（38.212 §7.3.2）
    UE 通过此掩码验证"这条 DCI 是给我的"
    """
    assert len(crc_bits) >= 16
    rnti_bits = torch.tensor(
        [(rnti >> (15 - i)) & 1 for i in range(16)],
        dtype=torch.long
    )
    result = crc_bits.clone()
    result[-16:] = (crc_bits[-16:] + rnti_bits) % 2
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 模块 5：ZC 序列（PRACH Preamble）
# 参考：38.211 §6.3.3
# ─────────────────────────────────────────────────────────────────────────────

def generate_zc_sequence(u: int, N_zc: int = 839) -> torch.Tensor:
    """
    Zadoff-Chu 序列（PRACH Preamble 基础）

    公式（38.211 §6.3.3.1）：
        x_u(n) = exp(-j·π·u·n·(n+1) / N_ZC),  n = 0,...,N_ZC-1

    关键特性：
        · 恒包络（PAPR = 0 dB）
        · 完美自相关（循环自相关为 δ 函数）
        · 不同根 u 之间低互相关（|R_uv(τ)| = 1/√N_ZC for u≠v）
    """
    n = torch.arange(N_zc, dtype=torch.float64)
    phase = -torch.pi * u * n * (n + 1) / N_zc
    seq = torch.complex(torch.cos(phase), torch.sin(phase))
    return seq.to(torch.cfloat)


def detect_prach_preamble(
    rx_signal: torch.Tensor,
    root_u: int,
    N_zc: int = 839,
    snr_db: float = 10.0,
) -> dict:
    """
    PRACH Preamble 检测（相关法）

    gNB 侧检测步骤：
        1. 生成本地 ZC 参考序列
        2. 计算接收信号与参考序列的循环相关
        3. 找到相关峰，确定 Preamble 序号和时延估计
    """
    reference = generate_zc_sequence(root_u, N_zc)

    # 加 AWGN 噪声
    snr_linear = 10 ** (snr_db / 10)
    signal_power = rx_signal.abs().pow(2).mean()
    noise_power = signal_power / snr_linear
    noise = torch.randn_like(rx_signal.real) + 1j * torch.randn_like(rx_signal.imag)
    noise = noise * (noise_power / 2).sqrt()
    rx_noisy = rx_signal + noise

    # 循环相关（频域实现：FFT 乘法）
    freq_rx  = torch.fft.fft(rx_noisy[:N_zc])
    freq_ref = torch.fft.fft(reference)
    corr = torch.fft.ifft(freq_rx * freq_ref.conj()).abs()

    peak_val, peak_idx = corr.max(dim=0)
    noise_floor = corr.mean()
    detection_threshold = noise_floor * 10  # 简单阈值

    return {
        "detected"        : peak_val > detection_threshold,
        "peak_value"      : peak_val.item(),
        "noise_floor"     : noise_floor.item(),
        "timing_offset"   : peak_idx.item(),   # TA 估计（采样数）
        "snr_estimate_db" : float(20 * np.log10(peak_val.item() / noise_floor.item() + 1e-10)),
        "correlation"     : corr.cpu().numpy(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 模块 6：资源网格 RE 占用可视化
# ─────────────────────────────────────────────────────────────────────────────

def visualize_resource_grid_allocation(
    n_rb: int = 52,
    n_symbols: int = 14,
    coreset_rb_start: int = 0,
    coreset_rb_size: int = 48,   # CORESET 频域大小（必须为 6 的倍数）
    coreset_symbols: int = 2,
    pdsch_rb_start: int = 0,
    pdsch_rb_size: int = 52,
    pdsch_sym_start: int = 2,
    pdsch_sym_size: int = 12,
    ssb_rb_start: int = 10,      # SSB 位置（若在 BWP 内）
    ssb_in_bwp: bool = False,
    title: str = "",
):
    """
    可视化资源网格的 RE 占用分布：
    PDCCH（含 DMRS）/ PDSCH（含 DMRS）/ SSB / 空 RE

    X 轴：OFDM 符号（时域），0~13
    Y 轴：子载波编号（频域），每 RB = 12 子载波
    """
    fig, ax = plt.subplots(
        figsize=(16, max(8, n_rb // 6)),
        facecolor=DARK_BG
    )
    ax.set_facecolor(DARK_AX)

    n_sc = n_rb * 12   # 总子载波数

    # 初始化网格（每个 RE 的类型标签）
    grid = np.full((n_sc, n_symbols), 'EMPTY', dtype=object)

    # ── PDCCH（CORESET 内，前 coreset_symbols 个符号）──────────────────────
    for sym in range(coreset_symbols):
        for rb in range(coreset_rb_start, coreset_rb_start + coreset_rb_size):
            sc_low = rb * 12
            for sc in range(sc_low, sc_low + 12):
                if sc < n_sc:
                    # PDCCH DMRS 占每 4 个子载波的 1 个（简化模型）
                    if sc % 4 == 1:
                        grid[sc, sym] = 'DMRS'
                    else:
                        grid[sc, sym] = 'PDCCH'

    # ── SSB（若在 BWP 内）──────────────────────────────────────────────────
    if ssb_in_bwp:
        for rb in range(ssb_rb_start, ssb_rb_start + 20):
            sc_low = rb * 12
            for sym in [0, 1, 2, 3]:
                for sc in range(sc_low, sc_low + 12):
                    if sc < n_sc and sym < n_symbols:
                        grid[sc, sym] = 'SSB'

    # ── PDSCH（含 DMRS Type A）──────────────────────────────────────────────
    dmrs_sym = pdsch_sym_start   # DMRS 在 PDSCH 第一个符号（Type A pos2）
    for rb in range(pdsch_rb_start, pdsch_rb_start + pdsch_rb_size):
        sc_low = rb * 12
        for sym in range(pdsch_sym_start, pdsch_sym_start + pdsch_sym_size):
            for sc in range(sc_low, sc_low + 12):
                if sc < n_sc and sym < n_symbols:
                    if grid[sc, sym] == 'EMPTY':   # 不覆盖 PDCCH
                        # DMRS：在 DMRS 符号的每 2 个 RB 放置（Type 1 Port 0）
                        if sym == dmrs_sym and sc % 2 == 0:
                            grid[sc, sym] = 'DMRS'
                        elif sym == dmrs_sym:
                            grid[sc, sym] = 'DMRS'
                        else:
                            grid[sc, sym] = 'PDSCH'

    # ── 转换为颜色矩阵并绘图 ────────────────────────────────────────────────
    color_map = {k: np.array(plt.matplotlib.colors.to_rgb(v))
                 for k, v in CHANNEL_COLORS.items()}

    img = np.zeros((n_sc, n_symbols, 3))
    for sc in range(n_sc):
        for sym in range(n_symbols):
            img[sc, sym] = color_map[grid[sc, sym]]

    ax.imshow(img, origin='lower', aspect='auto',
              extent=[-0.5, n_symbols - 0.5, -0.5, n_sc - 0.5])

    # 网格线（RB 边界）
    for rb in range(0, n_rb + 1):
        ax.axhline(rb * 12 - 0.5, color=DARK_GRID, linewidth=0.3, alpha=0.6)
    for sym in range(n_symbols + 1):
        ax.axvline(sym - 0.5, color=DARK_GRID, linewidth=0.3, alpha=0.6)

    # CORESET 边界高亮
    ax.add_patch(plt.Rectangle(
        (-0.5, coreset_rb_start * 12 - 0.5),
        coreset_symbols, coreset_rb_size * 12,
        fill=False, edgecolor=CHANNEL_COLORS['PDCCH'],
        linewidth=1.5, linestyle='--'
    ))

    # 轴标签
    ax.set_xlabel('OFDM Symbol Index (within slot)', color=DARK_MUTED, fontsize=9)
    ax.set_ylabel('Subcarrier Index (frequency domain)', color=DARK_MUTED, fontsize=9)
    ax.set_xticks(range(n_symbols))
    ax.set_xticklabels([f'#{i}' for i in range(n_symbols)],
                        fontsize=7, color=DARK_MUTED)

    # Y 轴只显示 RB 编号
    rb_ticks = [rb * 12 + 6 for rb in range(0, n_rb, max(1, n_rb // 10))]
    rb_labels = [f'RB{rb * 12 // 12}' for rb in
                 range(0, n_rb, max(1, n_rb // 10))]
    ax.set_yticks(rb_ticks)
    ax.set_yticklabels(rb_labels, fontsize=7, color=DARK_MUTED)

    # 标注关键符号
    ax.text(pdsch_sym_start, n_sc + n_sc * 0.01, '↑ DMRS', ha='center',
            color=CHANNEL_COLORS['DMRS'], fontsize=7)

    # 图例
    legend_items = [
        mpatches.Patch(facecolor=c, label=name)
        for name, c in CHANNEL_COLORS.items() if name != 'EMPTY'
    ]
    ax.legend(handles=legend_items, loc='upper right', ncol=3,
              fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT,
              framealpha=0.85)

    ax.set_title(
        title or f'NR Resource Grid RE Allocation  |  '
                 f'{n_rb} RB × {n_symbols} symbols per slot\n'
                 f'CORESET: {coreset_rb_size} RB × {coreset_symbols} sym  |  '
                 f'PDSCH: {pdsch_rb_size} RB × {pdsch_sym_size} sym  (38.211)',
        color=DARK_TEXT, fontsize=10, pad=8
    )

    for sp in ax.spines.values():
        sp.set_edgecolor(DARK_GRID)
    ax.tick_params(colors=DARK_MUTED)

    plt.tight_layout()
    return fig, ax


# ─────────────────────────────────────────────────────────────────────────────
# 模块 7：BER vs SNR（多调制方案对比）
# ─────────────────────────────────────────────────────────────────────────────

def run_ber_vs_snr(
    modulation_orders: list = [2, 4, 6, 8],
    snr_range_db: np.ndarray = np.arange(-5, 30, 1),
    n_symbols: int = 10000,
) -> dict:
    """
    AWGN 信道下的 BER vs SNR（QPSK / 16QAM / 64QAM / 256QAM）

    注意：此处不含 FEC（无编码），反映调制方案本身的功率效率
    实际系统中 LDPC 编码增益约 3~7 dB
    """
    results = {}

    for qm in modulation_orders:
        mod = QAMModulator(qm)
        ber_list = []
        mod_name = mod.SUPPORTED[qm]

        for snr_db in snr_range_db:
            torch.manual_seed(42)
            # 生成随机比特
            bits = torch.randint(0, 2, (n_symbols * qm,))
            # 调制
            symbols = mod(bits)
            # AWGN
            snr_linear = 10 ** (snr_db / 10)
            power = symbols.abs().pow(2).mean()
            noise_std = (power / (2 * snr_linear)).sqrt()
            noise = noise_std * (torch.randn_like(symbols.real) +
                                  1j * torch.randn_like(symbols.imag))
            rx = symbols + noise
            # 解调
            bits_rx = mod.demodulate(rx)
            # BER
            ber = (bits != bits_rx).float().mean().item()
            ber_list.append(max(ber, 1e-6))

        results[mod_name] = {'snr': snr_range_db, 'ber': np.array(ber_list), 'qm': qm}
        print(f"  {mod_name}: 完成")

    return results


def plot_ber_curves(ber_results: dict):
    """绘制 BER vs SNR 曲线"""
    fig, ax = plt.subplots(figsize=(12, 7), facecolor=DARK_BG)
    ax.set_facecolor(DARK_AX)

    colors = ['#58a6ff', '#3fb950', '#ffa657', '#ff7b72']
    markers= ['o', 's', '^', 'D']

    for i, (name, data) in enumerate(ber_results.items()):
        c = colors[i % len(colors)]
        m = markers[i % len(markers)]
        ax.semilogy(data['snr'], data['ber'],
                    color=c, marker=m, ms=4, lw=2, markevery=3,
                    label=f"{name} (Qm={data['qm']})")

    # 典型门限线
    for ber_thresh, label in [(1e-1, '10% BLER\n(PUSCH 灵敏度门限)'),
                               (1e-2, '1% BLER\n(PUCCH 门限)')]:
        ax.axhline(y=ber_thresh, color=DARK_MUTED, ls=':', lw=1, alpha=0.7)
        ax.text(snr_range_db[-3] if 'snr_range_db' in dir() else 25,
                ber_thresh * 1.5, label,
                color=DARK_MUTED, fontsize=7, ha='right')

    ax.set_xlabel('SNR (dB)', color=DARK_MUTED, fontsize=10)
    ax.set_ylabel('Bit Error Rate (BER)', color=DARK_MUTED, fontsize=10)
    ax.set_title(
        'BER vs SNR  |  AWGN  |  无 FEC（实际系统 LDPC 编码增益 ≈ 3~7 dB）\n'
        '(3GPP TS 38.211/38.212 · Rel-15)',
        color=DARK_TEXT, fontsize=11
    )
    ax.legend(fontsize=9, facecolor=DARK_AX, labelcolor=DARK_TEXT, framealpha=0.85)
    ax.set_ylim([1e-5, 1.1])
    ax.set_xlim([snr_range[0], snr_range[-1]])
    ax.tick_params(colors=DARK_MUTED)
    for sp in ax.spines.values():
        sp.set_edgecolor(DARK_GRID)
    ax.grid(True, alpha=0.2, color=DARK_GRID, which='both')
    return fig


# ─────────────────────────────────────────────────────────────────────────────
# 模块 8：ZC 序列与 PRACH 相关检测可视化
# ─────────────────────────────────────────────────────────────────────────────

def visualize_prach_detection(snr_db: float = 5.0):
    """
    可视化 ZC 序列的相关特性（PRACH Preamble 检测原理）
    演示：不同根序列的低互相关 + AWGN 下的检测能力
    """
    N_zc = 839
    u1, u2 = 1, 37   # 两个不同的根序列

    seq_u1 = generate_zc_sequence(u1, N_zc)
    seq_u2 = generate_zc_sequence(u2, N_zc)

    # 模拟接收：传输 u1，加噪
    result = detect_prach_preamble(seq_u1, root_u=u1, N_zc=N_zc, snr_db=snr_db)
    corr_match    = result['correlation']   # u1 vs u1（匹配）

    # 错误根序列（u1 vs u2，不匹配）
    freq_u1 = torch.fft.fft(seq_u1)
    freq_u2 = torch.fft.fft(seq_u2)
    corr_mismatch = torch.fft.ifft(freq_u1 * freq_u2.conj()).abs().numpy()

    fig, axes = plt.subplots(1, 2, figsize=(14, 5), facecolor=DARK_BG)
    fig.suptitle(
        f'PRACH Preamble Detection — ZC Sequence Correlation  |  SNR={snr_db}dB\n'
        f'N_ZC={N_zc}  (3GPP TS 38.211 §6.3.3)',
        color=DARK_TEXT, fontsize=12
    )

    for ax, corr, label, c in zip(
        axes,
        [corr_match, corr_mismatch],
        [f'✅ 匹配：接收 u={u1}，检测用 u={u1}',
         f'❌ 不匹配：接收 u={u1}，检测用 u={u2}'],
        [CHANNEL_COLORS['PDSCH'], CHANNEL_COLORS['PDCCH']]
    ):
        ax.set_facecolor(DARK_AX)
        ax.plot(corr, color=c, lw=1.5, alpha=0.9)
        peak = corr.max()
        floor= corr.mean()
        ax.axhline(floor, color=DARK_MUTED, ls='--', lw=1, alpha=0.6,
                   label=f'Noise floor={floor:.3f}')
        ax.axhline(peak, color=c, ls=':', lw=1, alpha=0.7,
                   label=f'Peak={peak:.3f}')
        ax.set_xlabel('Time offset (samples = TA estimate)', color=DARK_MUTED, fontsize=9)
        ax.set_ylabel('Correlation magnitude', color=DARK_MUTED, fontsize=9)
        ax.set_title(label, color=c, fontsize=10)
        ax.legend(fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT)
        ax.tick_params(colors=DARK_MUTED)
        for sp in ax.spines.values():
            sp.set_edgecolor(DARK_GRID)
        ax.grid(True, alpha=0.2, color=DARK_GRID)

    plt.tight_layout()
    return fig


# ─────────────────────────────────────────────────────────────────────────────
# 主程序
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    print("=" * 60)
    print("5G NR Channel Mapping Simulator")
    print("3GPP TS 38.211 / 38.212 / 38.214 · Rel-15")
    print("=" * 60)

    # ── 1. QAM 星座图对比 ────────────────────────────────────────────────────
    print("\n【模块 1】QAM 调制器验证...")
    fig, axes = plt.subplots(1, 4, figsize=(16, 4.5), facecolor=DARK_BG)
    fig.suptitle('NR QAM Constellations  |  Ideal + AWGN (SNR=15dB)',
                 color=DARK_TEXT, fontsize=12)

    for ax, qm in zip(axes, [2, 4, 6, 8]):
        mod = QAMModulator(qm)
        bits = torch.randint(0, 2, (1024 * qm,))
        symbols = mod(bits)
        snr_db = 15.0
        noise_std = (symbols.abs().pow(2).mean() / (2 * 10**(snr_db/10))).sqrt()
        rx = symbols + noise_std * (torch.randn_like(symbols.real) +
                                     1j * torch.randn_like(symbols.imag))
        mod.plot_constellation(ax, received=rx)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_constellations.png'), dpi=150,
                bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("  ✅ 星座图已保存：output_constellations.png")

    # ── 2. 加扰验证 ──────────────────────────────────────────────────────────
    print("\n【模块 2】PDSCH 加扰验证...")
    bits  = torch.randint(0, 2, (100,))
    scr1  = pdsch_scramble(bits, rnti=12345, cell_id=1, data_scrambling_id=None)
    scr2  = pdsch_scramble(bits, rnti=12345, cell_id=1, data_scrambling_id=None)
    desc  = pdsch_scramble(scr1, rnti=12345, cell_id=1, data_scrambling_id=None)
    print(f"  加扰两次 = 原始？{torch.all(desc == bits).item()} "
          f"（XOR 自逆性验证）✅")
    scr3  = pdsch_scramble(bits, rnti=99999, cell_id=1)
    diff  = (scr1 != scr3).float().mean().item()
    print(f"  不同 RNTI 的扰码差异：{diff*100:.1f}%（预期约 50%）"
          f"{'✅' if 0.4 < diff < 0.6 else '⚠️'}")

    # ── 3. 资源网格可视化 ────────────────────────────────────────────────────
    print("\n【模块 3】资源网格 RE 分配可视化...")
    fig, _ = visualize_resource_grid_allocation(
        n_rb=52, n_symbols=14,
        coreset_rb_start=0, coreset_rb_size=48, coreset_symbols=2,
        pdsch_rb_start=0, pdsch_rb_size=52, pdsch_sym_start=2, pdsch_sym_size=12,
    )
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_re_allocation.png'), dpi=150,
                bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("  ✅ RE 分配图已保存：output_re_allocation.png")

    # ── 4. BER vs SNR ────────────────────────────────────────────────────────
    print("\n【模块 4】BER vs SNR 计算（多 MCS）...")
    snr_range = np.arange(-5, 30, 1)
    ber_results = run_ber_vs_snr(
        modulation_orders=[2, 4, 6, 8],
        snr_range_db=snr_range,
        n_symbols=5000,
    )
    fig = plot_ber_curves(ber_results)
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_ber_curves.png'), dpi=150,
                bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("  ✅ BER 曲线已保存：output_ber_curves.png")

    # ── 5. PRACH 相关检测 ─────────────────────────────────────────────────────
    print("\n【模块 5】PRACH ZC 序列相关检测...")
    fig = visualize_prach_detection(snr_db=5.0)
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_prach_detection.png'), dpi=150,
                bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("  ✅ PRACH 检测图已保存：output_prach_detection.png")

    # ── 6. 综合实验报告 ───────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("🔬 推荐实验")
    print("=" * 60)
    print("""
实验 1：RNTI 掩码的工程意义
  修改 pdsch_scramble 的 rnti 参数，
  观察两个不同 RNTI 的扰码序列的差异率。
  思考：为什么 RNTI 掩码能防止 UE 误收其他 UE 的 DCI？

实验 2：DMRS 密度对信道估计的影响
  修改 visualize_resource_grid_allocation 中的 dmrs_sym 参数，
  增加 DMRS 符号数（addl_dmrs），观察 PDSCH 可用 RE 的减少量。
  计算：增加 1 个额外 DMRS 符号，吞吐量损失百分比是多少？

实验 3：ZC 序列的时延估计精度
  在 detect_prach_preamble 中引入人工时延（循环移位），
  观察相关峰位置是否精确跟踪时延变化。
  NTN 扩展：时延 = 2328746 ns，对应多少个 ZC 序列采样点？

实验 4：256QAM 对相位噪声的敏感性
  在 QAMModulator(8) 的接收信号上叠加相位噪声，
  观察 BER 相比 QPSK 恶化的幅度差异。
  思考：这为什么是 FR2 使用 PT-RS 的根本原因？
    """)
    print("=" * 60)
    print("\n🎉 所有模块运行完毕。输出文件：")
    print("  output_constellations.png  — QAM 星座图")
    print("  output_re_allocation.png   — 资源网格 RE 分配")
    print("  output_ber_curves.png      — BER vs SNR 曲线")
    print("  output_prach_detection.png — PRACH 相关检测")
