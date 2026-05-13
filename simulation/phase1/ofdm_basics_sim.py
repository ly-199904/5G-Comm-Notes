"""
ofdm_basics_sim.py
==================
5G NR OFDM Waveform Simulator

参考标准：
    3GPP TS 38.211 v15.7.0  §5.3  CP-OFDM baseband signal generation
    3GPP TS 38.211 v15.7.0  §6.3  DFT-s-OFDM uplink waveform
    3GPP TR 38.821 v17.3.0        NTN coverage enhancement

核心功能：
    1. CP-OFDM 收发链路（完整 IFFT/CP/FFT 流程）
    2. DFT-s-OFDM 收发链路（DFT 扩频 + IFFT）
    3. PAPR CCDF 曲线（标准评估指标）
    4. 载波频率偏差（CFO/ICI）仿真
    5. DMRS-based 信道估计 + 线性插值均衡
    6. BER vs SNR（多场景对比）

依赖：pip install torch numpy matplotlib scipy
"""

import torch
import torch.nn as nn
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from dataclasses import dataclass
from typing import Optional
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
    'cp_ofdm' : '#58a6ff',
    'dfts'    : '#3fb950',
    'pi2bpsk' : '#ffa657',
    'cfo_bad' : '#ff7b72',
    'ideal'   : '#d2a8ff',
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
# 模块 1：QAM 调制器（复用自 channel_mapping_sim）
# ─────────────────────────────────────────────────────────────────────────────

def qpsk_mod(bits: torch.Tensor) -> torch.Tensor:
    """QPSK：2 bits → 1 complex symbol"""
    b = bits.view(-1, 2).float()
    r = (1 - 2 * b[:, 0]) / np.sqrt(2)
    i = (1 - 2 * b[:, 1]) / np.sqrt(2)
    return torch.complex(r, i)

def qpsk_demod(syms: torch.Tensor) -> torch.Tensor:
    rb = (syms.real < 0).long()
    ib = (syms.imag < 0).long()
    return torch.stack([rb, ib], dim=-1).view(-1)

def pi2bpsk_mod(bits: torch.Tensor) -> torch.Tensor:
    """
    π/2-BPSK（38.211 §6.3.1.2）
    每个 bit 映射后相位旋转 k×π/2，实现近似恒包络
    """
    n = len(bits)
    symbols = (1 - 2 * bits.float())   # BPSK: {+1, -1}
    phase_rot = torch.exp(1j * torch.arange(n, dtype=torch.float32) * np.pi / 2)
    return (symbols * phase_rot).to(torch.cfloat)

def pi2bpsk_demod(syms: torch.Tensor) -> torch.Tensor:
    n = len(syms)
    phase_rot = torch.exp(1j * torch.arange(n, dtype=torch.float32) * np.pi / 2)
    derotated = syms * phase_rot.conj()
    return (derotated.real < 0).long()


# ─────────────────────────────────────────────────────────────────────────────
# 模块 2：CP-OFDM 调制器 / 解调器
# 参考：38.211 §5.3.1
# ─────────────────────────────────────────────────────────────────────────────

class CPOFDMModulator(nn.Module):
    """
    CP-OFDM 调制器

    核心操作：
        time_domain = IFFT(freq_symbols)          # 38.211 Eq.5.3.1-1
        cp          = time_domain[-N_cp:]          # 循环前缀
        tx          = concat(cp, time_domain)
    """
    def __init__(self, n_fft: int, n_cp: int):
        super().__init__()
        self.n_fft = n_fft
        self.n_cp  = n_cp

    def forward(self, freq_syms: torch.Tensor) -> torch.Tensor:
        """
        freq_syms: shape (..., N_fft)，复数
        returns:   shape (..., N_fft + N_cp)
        """
        time = torch.fft.ifft(freq_syms, n=self.n_fft, dim=-1, norm='ortho')
        cp   = time[..., -self.n_cp:]
        return torch.cat([cp, time], dim=-1)


class CPOFDMDemodulator(nn.Module):
    """CP-OFDM 解调器：去 CP → FFT → 信道均衡"""
    def __init__(self, n_fft: int, n_cp: int):
        super().__init__()
        self.n_fft = n_fft
        self.n_cp  = n_cp

    def forward(self, rx: torch.Tensor,
                channel_h: Optional[torch.Tensor] = None) -> torch.Tensor:
        no_cp = rx[..., self.n_cp:]
        freq  = torch.fft.fft(no_cp, n=self.n_fft, dim=-1, norm='ortho')
        if channel_h is not None:
            freq = freq / (channel_h + 1e-9)
        return freq


# ─────────────────────────────────────────────────────────────────────────────
# 模块 3：DFT-s-OFDM 调制器 / 解调器
# 参考：38.211 §6.3.1
# ─────────────────────────────────────────────────────────────────────────────

class DFTsOFDMModulator(nn.Module):
    """
    DFT-s-OFDM 调制器

    追加步骤（在 CP-OFDM 之前）：
        spread = FFT(qam_symbols, M)     # M 点 DFT（扩频）
        mapped[k] = spread[k - k_start]  # 映射到 OFDM 子载波子集
        → 之后与 CP-OFDM 相同

    关键性质：
        当 M = N 时，IFFT(FFT(x)) = x → 等效单载波
        → PAPR 与单载波相同，比 CP-OFDM 低约 4~6 dB
    """
    def __init__(self, n_fft: int, n_cp: int, M: int, k_start: int = 0):
        super().__init__()
        assert M <= n_fft, f"扩频因子 M={M} 不能超过 N_FFT={n_fft}"
        self.n_fft   = n_fft
        self.n_cp    = n_cp
        self.M       = M
        self.k_start = k_start   # 子载波起始偏移

    def forward(self, qam_syms: torch.Tensor) -> torch.Tensor:
        """
        qam_syms: shape (..., M)
        returns:  shape (..., N_fft + N_cp)
        """
        # Step 1: M 点 DFT 扩频
        spread = torch.fft.fft(qam_syms, n=self.M, dim=-1, norm='ortho')

        # Step 2: 子载波映射（映射到 OFDM 网格的 M 个连续子载波）
        freq = torch.zeros(*qam_syms.shape[:-1], self.n_fft,
                            dtype=torch.cfloat, device=qam_syms.device)
        freq[..., self.k_start:self.k_start + self.M] = spread

        # Step 3: N 点 IFFT + CP
        time = torch.fft.ifft(freq, n=self.n_fft, dim=-1, norm='ortho')
        cp   = time[..., -self.n_cp:]
        return torch.cat([cp, time], dim=-1)


class DFTsOFDMDemodulator(nn.Module):
    """DFT-s-OFDM 解调器：去 CP → FFT → 子载波解映射 → IDFT"""
    def __init__(self, n_fft: int, n_cp: int, M: int, k_start: int = 0):
        super().__init__()
        self.n_fft   = n_fft
        self.n_cp    = n_cp
        self.M       = M
        self.k_start = k_start

    def forward(self, rx: torch.Tensor,
                channel_h: Optional[torch.Tensor] = None) -> torch.Tensor:
        no_cp = rx[..., self.n_cp:]
        freq  = torch.fft.fft(no_cp, n=self.n_fft, dim=-1, norm='ortho')

        if channel_h is not None:
            freq = freq / (channel_h + 1e-9)

        # 子载波解映射
        mapped = freq[..., self.k_start:self.k_start + self.M]

        # M 点 IDFT 解扩频
        return torch.fft.ifft(mapped, n=self.M, dim=-1, norm='ortho')


# ─────────────────────────────────────────────────────────────────────────────
# 模块 4：信道模型
# ─────────────────────────────────────────────────────────────────────────────

class AWGNChannel(nn.Module):
    def forward(self, tx: torch.Tensor, snr_db: float) -> torch.Tensor:
        snr = 10 ** (snr_db / 10)
        pwr = tx.abs().pow(2).mean()
        std = (pwr / (2 * snr)).sqrt()
        n   = torch.randn_like(tx.real) + 1j * torch.randn_like(tx.imag)
        return tx + std * n


class MultipathAWGNChannel(nn.Module):
    """
    多径信道 + AWGN

    用于验证 CP 有效性：
        tau_ratio < 1 → CP 足够 → ISI 消除 → 正常 BER
        tau_ratio > 1 → CP 不足 → ISI 出现 → BER 跳升
    """
    def __init__(self, n_cp: int, tau_ratio: float = 0.5,
                 secondary_gain: float = 0.5):
        super().__init__()
        self.n_cp     = n_cp
        self.tau_samples = max(1, int(tau_ratio * n_cp))
        self.secondary_gain = secondary_gain

    def forward(self, tx: torch.Tensor, snr_db: float) -> torch.Tensor:
        # 主径
        rx = tx.clone()
        # 延迟径（循环延迟，模拟多径）
        delay = self.tau_samples
        echo  = torch.roll(tx, delay, dims=-1) * self.secondary_gain
        rx    = rx + echo
        # AWGN
        return AWGNChannel()(rx, snr_db)


class CFOChannel(nn.Module):
    """
    载波频率偏差（CFO）信道
    模拟 NTN 残余多普勒的 ICI 效应
    """
    def __init__(self, cfo_hz: float, scs_hz: float, n_fft: int, n_cp: int):
        super().__init__()
        self.cfo_normalized = cfo_hz / (scs_hz * n_fft)   # 归一化 CFO
        self.n_fft = n_fft
        self.n_cp  = n_cp

    def forward(self, tx: torch.Tensor, snr_db: float) -> torch.Tensor:
        # 时域相位旋转（CFO 的时域表现）
        n   = torch.arange(len(tx), dtype=torch.float32, device=tx.device)
        rot = torch.exp(1j * 2 * np.pi * self.cfo_normalized * n).to(torch.cfloat)
        rx  = tx * rot
        return AWGNChannel()(rx, snr_db)


# ─────────────────────────────────────────────────────────────────────────────
# 模块 5：PAPR 计算与 CCDF
# ─────────────────────────────────────────────────────────────────────────────

def compute_papr_db(signal: torch.Tensor) -> float:
    """单符号 PAPR（dB）"""
    peak = signal.abs().pow(2).max().item()
    avg  = signal.abs().pow(2).mean().item()
    return 10 * np.log10(peak / (avg + 1e-12))


def compute_papr_ccdf(
    n_fft: int = 1024,
    n_cp_ratio: float = 0.072,    # Normal CP ≈ 7.2%
    n_symbols: int = 10000,
    M: int = None,                 # DFT-s-OFDM 扩频因子（None = CP-OFDM）
    modulation: str = 'QPSK',
) -> np.ndarray:
    """
    计算 PAPR 的 CCDF（互补累积分布函数）

    CCDF(x) = P(PAPR > x) ← 标准 PAPR 评估指标
    x 轴：PAPR 阈值（dB）；y 轴：超过阈值的概率
    """
    n_cp = int(n_fft * n_cp_ratio)
    papr_list = []

    if M is None:
        mod_fn = CPOFDMModulator(n_fft, n_cp)
    else:
        mod_fn = DFTsOFDMModulator(n_fft, n_cp, M)

    n_in = M if M else n_fft

    for _ in range(n_symbols):
        bits = torch.randint(0, 2, (n_in * 2,))
        if modulation == 'pi2BPSK':
            syms = pi2bpsk_mod(torch.randint(0, 2, (n_in,)))
        else:
            syms = qpsk_mod(bits)[:n_in]

        tx   = mod_fn(syms.unsqueeze(0)).squeeze(0)
        papr_list.append(compute_papr_db(tx))

    return np.array(papr_list)


# ─────────────────────────────────────────────────────────────────────────────
# 模块 6：BER vs SNR
# ─────────────────────────────────────────────────────────────────────────────

def run_ber_comparison(
    n_fft: int = 256,
    n_cp_ratio: float = 0.072,
    snr_range: np.ndarray = np.arange(-5, 25, 2),
    n_trials: int = 50,
    scenarios: dict = None,
) -> dict:
    """
    多场景 BER vs SNR 对比

    scenarios 格式：
        {'name': {'type': 'cp_ofdm'|'dfts'|'cfo', 'params': {...}}}
    """
    n_cp = int(n_fft * n_cp_ratio)
    awgn = AWGNChannel()
    results = {}

    default_scenarios = {
        'CP-OFDM (理想)': {
            'type': 'cp_ofdm',
            'channel': awgn,
            'n_in': n_fft,
        },
        'DFT-s-OFDM (理想)': {
            'type': 'dfts',
            'channel': awgn,
            'n_in': n_fft // 4,
            'M': n_fft // 4,
        },
        f'CP-OFDM + CFO 200Hz (NTN 残余)': {
            'type': 'cp_ofdm',
            'channel': CFOChannel(200, 30e3, n_fft, n_cp),
            'n_in': n_fft,
        },
        f'CP-OFDM + CFO 5kHz (未补偿)': {
            'type': 'cp_ofdm',
            'channel': CFOChannel(5000, 30e3, n_fft, n_cp),
            'n_in': n_fft,
        },
    }
    if scenarios is None:
        scenarios = default_scenarios

    for name, cfg in scenarios.items():
        ber_list = []
        mod_type = cfg['type']
        channel  = cfg['channel']
        n_in     = cfg.get('n_in', n_fft)
        M        = cfg.get('M', None)

        if mod_type == 'cp_ofdm':
            mod  = CPOFDMModulator(n_fft, n_cp)
            demod= CPOFDMDemodulator(n_fft, n_cp)
        else:
            mod  = DFTsOFDMModulator(n_fft, n_cp, M)
            demod= DFTsOFDMDemodulator(n_fft, n_cp, M)

        for snr_db in snr_range:
            total, errors = 0, 0
            for _ in range(n_trials):
                torch.manual_seed(42)
                bits = torch.randint(0, 2, (n_in * 2,))
                syms = qpsk_mod(bits)[:n_in]
                tx   = mod(syms.unsqueeze(0)).squeeze(0)
                rx   = channel(tx, snr_db)
                if mod_type == 'cp_ofdm':
                    rx_syms = demod(rx.unsqueeze(0)).squeeze(0)[:n_in]
                else:
                    rx_syms = demod(rx.unsqueeze(0)).squeeze(0)
                bits_rx = qpsk_demod(rx_syms)
                total  += len(bits)
                errors += (bits != bits_rx).sum().item()
            ber_list.append(max(errors / total, 1e-6))

        results[name] = np.array(ber_list)
        print(f"  {name}: 完成")

    return results


# ─────────────────────────────────────────────────────────────────────────────
# 模块 7：DMRS 信道估计演示
# ─────────────────────────────────────────────────────────────────────────────

def demo_dmrs_channel_estimation(n_fft: int = 128, snr_db: float = 15.0):
    """
    演示 DMRS-based 信道估计流程：
    1. 在 DMRS 子载波位置做 LS 估计
    2. 线性插值到所有数据子载波
    3. 单抽头均衡
    """
    n_cp = n_fft // 8
    torch.manual_seed(0)

    # 随机多径信道
    h_time = torch.zeros(n_cp // 2, dtype=torch.cfloat)
    h_time[0] = 1.0
    h_time[3] = 0.5 * torch.exp(1j * torch.tensor(0.7))
    h_time[7] = 0.3 * torch.exp(1j * torch.tensor(2.1))
    H_true = torch.fft.fft(h_time, n=n_fft)

    # 生成 DMRS（每 4 个子载波一个，Type 1 简化）
    dmrs_positions = list(range(0, n_fft, 4))
    dmrs_values    = torch.exp(1j * torch.randn(len(dmrs_positions)))

    # 发射：数据子载波用随机 QPSK，DMRS 子载波用 DMRS
    freq_tx = qpsk_mod(torch.randint(0, 2, (n_fft * 2,)))[:n_fft]
    for i, k in enumerate(dmrs_positions):
        freq_tx[k] = dmrs_values[i]

    # 通过多径信道 + AWGN
    mod  = CPOFDMModulator(n_fft, n_cp)
    tx   = mod(freq_tx.unsqueeze(0)).squeeze(0)
    # 时域线性卷积（多径）
    h_np = h_time.numpy()
    tx_np = tx.numpy()
    rx_conv = np.convolve(tx_np, h_np, mode='full')[:len(tx_np)]
    rx      = torch.tensor(rx_conv, dtype=torch.cfloat)
    rx      = AWGNChannel()(rx, snr_db)

    # 解调
    demod   = CPOFDMDemodulator(n_fft, n_cp)
    freq_rx = demod(rx.unsqueeze(0)).squeeze(0)

    # LS 信道估计（DMRS 位置）
    H_est_dmrs = freq_rx[dmrs_positions] / dmrs_values

    # 线性插值到所有子载波
    k_all    = np.arange(n_fft)
    H_interp = np.interp(
        k_all,
        np.array(dmrs_positions, dtype=float),
        H_est_dmrs.numpy().real
    ) + 1j * np.interp(
        k_all,
        np.array(dmrs_positions, dtype=float),
        H_est_dmrs.numpy().imag
    )
    H_interp = torch.tensor(H_interp, dtype=torch.cfloat)

    # 均衡
    equalized = freq_rx / (H_interp + 1e-9)

    # 只看数据子载波
    data_idx = [k for k in range(n_fft) if k not in dmrs_positions]

    return {
        'H_true'    : H_true.numpy(),
        'H_interp'  : H_interp.numpy(),
        'dmrs_pos'  : dmrs_positions,
        'H_est_dmrs': H_est_dmrs.numpy(),
        'equalized' : equalized[data_idx].numpy(),
        'freq_tx'   : freq_tx[data_idx].numpy(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 模块 8：可视化
# ─────────────────────────────────────────────────────────────────────────────

def plot_papr_ccdf(papr_results: dict, title: str = ""):
    """PAPR CCDF 曲线（主力评估图）"""
    fig, ax = plt.subplots(figsize=(10, 6), facecolor=DARK_BG)
    ax_style(ax)

    thresholds = np.linspace(0, 20, 500)
    c_list = list(COLORS.values())

    for i, (name, papr_arr) in enumerate(papr_results.items()):
        ccdf = np.array([(papr_arr > t).mean() for t in thresholds])
        ax.semilogy(thresholds, ccdf + 1e-5,
                    color=c_list[i % len(c_list)], lw=2,
                    label=f'{name}  (P10={np.percentile(papr_arr, 90):.1f}dB)')

    # 1% 概率线
    ax.axhline(0.01, color=DARK_MUTED, ls='--', lw=1, alpha=0.6)
    ax.text(17, 0.013, 'CCDF = 1%\n(设计参考点)',
            color=DARK_MUTED, fontsize=7, ha='right')

    ax.set_xlabel('PAPR 阈值 (dB)', fontsize=9)
    ax.set_ylabel('P(PAPR > 阈值)', fontsize=9)
    ax.set_title(
        title or 'PAPR CCDF 曲线\nCP-OFDM vs DFT-s-OFDM vs π/2-BPSK+DFT-s',
        color=DARK_TEXT, fontsize=11
    )
    ax.set_xlim([0, 18])
    ax.set_ylim([1e-4, 1.1])
    ax.legend(fontsize=8.5, facecolor=DARK_AX, labelcolor=DARK_TEXT, framealpha=0.85)
    ax.grid(True, which='both', alpha=0.15, color=DARK_GRID)
    return fig


def plot_channel_estimation(results: dict):
    """信道估计质量可视化"""
    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5), facecolor=DARK_BG)
    fig.suptitle('DMRS 信道估计  |  LS 估计 + 线性插值  (38.211)',
                 color=DARK_TEXT, fontsize=12)

    k = np.arange(len(results['H_true']))
    H_true  = results['H_true']
    H_interp= results['H_interp']
    dp      = results['dmrs_pos']
    H_dmrs  = results['H_est_dmrs']

    for ax, (attr, title) in zip(axes, [('real', '实部（频率响应）'), ('imag', '虚部')]):
        ax_style(ax)
        true_vals = H_true.real if attr == 'real' else H_true.imag
        interp_vals = H_interp.real if attr == 'real' else H_interp.imag
        dmrs_vals   = H_dmrs.real if attr == 'real' else H_dmrs.imag

        ax.plot(k, true_vals, color=COLORS['ideal'], lw=1.5,
                label='真实信道 H[k]', zorder=3)
        ax.plot(k, interp_vals, color=COLORS['cp_ofdm'], lw=1.5,
                ls='--', label='插值估计 H_est[k]', zorder=4)
        ax.scatter(dp, dmrs_vals, color=COLORS['dfts'], s=30, zorder=5,
                   label='DMRS 测量点')

        ax.set_xlabel('子载波索引 k', fontsize=9)
        ax.set_ylabel('幅度', fontsize=9)
        ax.set_title(f'信道估计 — {title}', color=DARK_TEXT, fontsize=10)
        ax.legend(fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT)

    plt.tight_layout()
    return fig


def plot_ber_comparison(ber_results: dict,
                         snr_range: np.ndarray = np.arange(-5, 25, 2)):
    """BER vs SNR 多场景对比"""
    fig, ax = plt.subplots(figsize=(11, 6.5), facecolor=DARK_BG)
    ax_style(ax)

    colors  = list(COLORS.values())
    markers = ['o', 's', '^', 'D', 'v']

    for i, (name, bers) in enumerate(ber_results.items()):
        c = colors[i % len(colors)]
        m = markers[i % len(markers)]
        ax.semilogy(snr_range, bers, color=c, marker=m, ms=5, lw=2,
                    markevery=2, label=name)

    ax.set_xlabel('SNR (dB)', fontsize=9)
    ax.set_ylabel('BER', fontsize=9)
    ax.set_title(
        'BER vs SNR  |  QPSK  |  CP-OFDM / DFT-s-OFDM / CFO 影响对比\n'
        '（含 NTN 残余多普勒 200 Hz @ SCS=30kHz → 1.3% — 可忽略）',
        color=DARK_TEXT, fontsize=10
    )
    ax.legend(fontsize=8.5, facecolor=DARK_AX, labelcolor=DARK_TEXT, framealpha=0.85)
    ax.grid(True, which='both', alpha=0.15, color=DARK_GRID)
    return fig


def plot_time_domain_waveform(n_fft: int = 64):
    """CP-OFDM vs DFT-s-OFDM 时域波形包络对比"""
    n_cp = n_fft // 8
    M    = n_fft // 2
    torch.manual_seed(7)

    bits  = torch.randint(0, 2, (n_fft * 2,))
    syms  = qpsk_mod(bits)[:n_fft]

    mod_cp   = CPOFDMModulator(n_fft, n_cp)
    mod_dfts = DFTsOFDMModulator(n_fft, n_cp, M)
    mod_pi2  = DFTsOFDMModulator(n_fft, n_cp, M)

    tx_cp   = mod_cp(syms.unsqueeze(0)).squeeze(0)
    tx_dfts = mod_dfts(syms[:M].unsqueeze(0)).squeeze(0)
    tx_pi2  = mod_pi2(pi2bpsk_mod(torch.randint(0, 2, (M,))).unsqueeze(0)).squeeze(0)

    fig, axes = plt.subplots(3, 1, figsize=(14, 8), facecolor=DARK_BG,
                              sharex=True)
    fig.suptitle('时域信号包络对比  |  PAPR 直观展示  (N_FFT=' + str(n_fft) + ')',
                 color=DARK_TEXT, fontsize=12)

    waveforms = [
        (tx_cp,   'CP-OFDM',         COLORS['cp_ofdm']),
        (tx_dfts, 'DFT-s-OFDM',     COLORS['dfts']),
        (tx_pi2,  'π/2-BPSK DFT-s', COLORS['pi2bpsk']),
    ]

    for ax, (tx, name, c) in zip(axes, waveforms):
        ax_style(ax)
        env = tx.abs().detach().numpy()
        n   = np.arange(len(env))
        ax.fill_between(n, env, alpha=0.3, color=c)
        ax.plot(n, env, color=c, lw=1.2, label=f'{name}')
        peak = env.max()
        avg  = env.mean()
        papr = 20 * np.log10(peak / (avg + 1e-9))
        ax.axhline(avg, color=DARK_MUTED, ls='--', lw=0.8, alpha=0.7)
        ax.axhline(peak, color=c, ls=':', lw=0.8, alpha=0.8)
        ax.text(len(env) - 5, peak * 1.02,
                f'Peak={peak:.2f}  PAPR≈{papr:.1f}dB',
                ha='right', color=c, fontsize=8)
        ax.set_ylabel('|s[n]|', fontsize=8, color=DARK_MUTED)
        ax.legend(loc='upper left', fontsize=8.5, facecolor=DARK_AX,
                  labelcolor=DARK_TEXT, framealpha=0.8)

    axes[-1].set_xlabel('采样点 n', fontsize=9, color=DARK_MUTED)
    plt.tight_layout()
    return fig


# ─────────────────────────────────────────────────────────────────────────────
# 主程序
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 62)
    print("5G NR OFDM Basics Simulator")
    print("3GPP TS 38.211 v15.7 · Rel-15/17")
    print("=" * 62)

    N_FFT = 256
    N_CP  = int(N_FFT * 0.072)

    # ── 1. 时域波形包络对比 ─────────────────────────────────────────────────
    print("\n【1】生成时域波形包络...")
    fig = plot_time_domain_waveform(n_fft=64)
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_ofdm_waveforms.png'), dpi=150,
                bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("   ✅ output_ofdm_waveforms.png")

    # ── 2. PAPR CCDF ────────────────────────────────────────────────────────
    print("\n【2】计算 PAPR CCDF（约需 30 秒）...")
    papr_results = {}
    for label, M, mod_type in [
        ('CP-OFDM (QPSK)',         None,       'QPSK'),
        ('DFT-s-OFDM (QPSK)',      N_FFT // 2, 'QPSK'),
        ('DFT-s-OFDM (π/2-BPSK)', N_FFT // 2, 'pi2BPSK'),
    ]:
        print(f"   {label}...", end='', flush=True)
        papr_arr = compute_papr_ccdf(
            n_fft=N_FFT, n_symbols=3000, M=M, modulation=mod_type
        )
        papr_results[label] = papr_arr
        print(f" P10={np.percentile(papr_arr, 90):.1f} dB")

    fig = plot_papr_ccdf(papr_results)
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_papr_ccdf.png'), dpi=150,
                bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("   ✅ output_papr_ccdf.png")

    # ── 3. 信道估计演示 ──────────────────────────────────────────────────────
    print("\n【3】DMRS 信道估计演示...")
    ch_results = demo_dmrs_channel_estimation(n_fft=128, snr_db=15.0)
    fig = plot_channel_estimation(ch_results)
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_channel_estimation.png'), dpi=150,
                bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("   ✅ output_channel_estimation.png")

    # ── 4. BER vs SNR ────────────────────────────────────────────────────────
    print("\n【4】BER vs SNR 仿真（约需 2~3 分钟）...")
    snr_range = np.arange(-4, 22, 2)
    ber_results = run_ber_comparison(
        n_fft=N_FFT, n_cp_ratio=0.072,
        snr_range=snr_range, n_trials=30
    )
    fig = plot_ber_comparison(ber_results, snr_range)
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_ber_ofdm.png'), dpi=150,
                bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("   ✅ output_ber_ofdm.png")

    # ── 5. 实验汇总 ─────────────────────────────────────────────────────────
    print("\n" + "=" * 62)
    print("🔬 推荐实验")
    print("=" * 62)
    print("""
实验 1：CP 长度 vs 多径时延
  修改 MultipathAWGNChannel 的 tau_ratio：
    tau_ratio = 0.5 → CP 足够，BER 正常
    tau_ratio = 1.5 → CP 不足，BER 跳升
  → 直观验证 T_CP ≥ τ_max 条件的工程含义

实验 2：DFT 扩频因子 M 对 PAPR 的影响
  在 compute_papr_ccdf 中尝试不同 M：
    M = N_FFT     → 等效单载波，PAPR 最低
    M = N_FFT//2  → 折中
    M = N_FFT//8  → 多载波特性明显，PAPR 较高
  → 理解"扩频越大 PAPR 越低"的直觉

实验 3：CFO 容忍度 vs Numerology
  对比 mu=0 (SCS=15kHz) 和 mu=1 (SCS=30kHz) 下
  相同 CFO = 1000 Hz 的 BER 差异：
    mu=0: CFO/SCS = 6.7% → 明显 ICI
    mu=1: CFO/SCS = 3.3% → ICI 减半
  → 解释为什么大 SCS 对频偏更鲁棒

实验 4：DMRS 密度对信道估计质量的影响
  修改 dmrs_positions 的间隔：
    every 2 subcarriers → 高密度，低速场景
    every 8 subcarriers → 低密度，静止场景
  计算估计误差 |H_interp - H_true| 的均方误差
    """)
    print("=" * 62)
    print("\n🎉 完毕。输出文件：")
    print("  output_ofdm_waveforms.png      — 时域包络对比")
    print("  output_papr_ccdf.png           — PAPR CCDF 曲线")
    print("  output_channel_estimation.png  — 信道估计演示")
    print("  output_ber_ofdm.png            — BER vs SNR 对比")
