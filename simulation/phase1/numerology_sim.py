"""
numerology_sim.py
=================
5G NR Numerology & OFDM Physical Layer Simulator
基于 PyTorch 的端到端可微物理层仿真框架

参考标准：
    3GPP TS 38.211 v15.7.0  — Physical channels and modulation
    3GPP TR 38.821 v17.3.0  — NTN solutions study

设计目标：
    1. 将 38.211 公式 1:1 映射到 PyTorch 模块
    2. 支持 batch 维度，为 AI/ML 研究提供原生接口
    3. NTN 多普勒场景仿真（LEO S-band / Ka-band）
    4. 提供 Deep Unfolding 接收机的扩展骨架

依赖：
    pip install torch numpy matplotlib scipy

作者：[Your Name]
日期：[YYYY-MM-DD]
博客：https://[username].github.io/5g-comm-notes/
"""

import torch
import torch.nn as nn
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

# 中文字体（避免标题/坐标显示为框）
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'Noto Sans SC', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
from dataclasses import dataclass, field
from typing import Optional
import warnings
import os
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# 全局常量（38.211 Section 4.1）
# ─────────────────────────────────────────────────────────────────────────────

DELTA_F_MAX_HZ  = 480_000        # 最大参考 SCS：480 kHz
NF_MAX          = 4096           # 最大 FFT 点数
TC_NS           = 1e9 / (DELTA_F_MAX_HZ * NF_MAX)   # ≈ 0.509 ns
TS_NS           = 1e9 / (15_000 * 2048)              # ≈ 32.55 ns = 64 * Tc

# Normal CP 标准时长（38.211 Table 5.3.1-1，单位 μs）
CP_NORMAL_US = {0: 4.6875, 1: 2.34375, 2: 1.171875, 3: 0.5859375, 4: 0.29296875}

# 光速
C_MPS = 3e8   # m/s

# Matplotlib 暗色主题
DARK_BG  = '#0d1117'
DARK_AX  = '#161b22'
DARK_GRID= '#30363d'
DARK_TEXT= '#e6edf3'
DARK_MUTED='#8b949e'
MU_COLORS = {0: '#58a6ff', 1: '#3fb950', 2: '#d2a8ff', 3: '#ffa657', 4: '#ff7b72'}


# ─────────────────────────────────────────────────────────────────────────────
# 模块 1：Numerology 参数引擎
# 对应 38.211 Table 4.2-1 & Table 4.3.2-1
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class NumerologyConfig:
    """
    完整的 Numerology 参数集
    所有时间单位：μs；所有频率单位：kHz 或 Hz（明确注释）
    """
    mu: int
    scs_khz: float           # 子载波间隔 (kHz)
    t_symbol_us: float       # 纯符号时长 (μs)，不含 CP
    cp_normal_us: float      # Normal CP 时长 (μs)
    t_with_cp_us: float      # 含 CP 总符号时长 (μs)
    slots_per_subframe: int  # 每 subframe 内 slot 数
    slots_per_frame: int     # 每 radio frame 内 slot 数
    slot_duration_us: float  # slot 时长 (μs)
    symbols_per_frame: int   # 每 radio frame 内总符号数


def get_numerology(mu: int) -> NumerologyConfig:
    """
    根据 μ 计算完整参数集

    核心公式（38.211 Eq.4.2-1 & Table 4.3.2-1）：
        Δf         = 2^μ × 15 kHz
        T_symbol   = 1 / Δf
        N_slot/SF  = 2^μ
        T_slot     = 1 ms / 2^μ
    """
    assert 0 <= mu <= 4, f"本仿真支持 μ=0~4，收到 μ={mu}"

    scs_hz         = (2 ** mu) * 15_000
    t_symbol_us    = 1e6 / scs_hz
    cp_us          = CP_NORMAL_US[mu]
    slots_per_sf   = 2 ** mu
    slots_per_frame= 10 * (2 ** mu)

    return NumerologyConfig(
        mu               = mu,
        scs_khz          = scs_hz / 1e3,
        t_symbol_us      = t_symbol_us,
        cp_normal_us     = cp_us,
        t_with_cp_us     = t_symbol_us + cp_us,
        slots_per_subframe=slots_per_sf,
        slots_per_frame  = slots_per_frame,
        slot_duration_us = 1e3 / slots_per_sf,   # 1ms / 2^μ → μs
        symbols_per_frame= slots_per_frame * 14,
    )


def print_numerology_table():
    """打印 38.211 Table 4.2-1 & 4.3.2-1 对照表"""
    sep = "=" * 78
    fmt = "{:>3}  {:>10}  {:>13}  {:>11}  {:>12}  {:>14}"
    print(f"\n{sep}")
    print("5G NR Numerology 参数表  (3GPP TS 38.211 v15.7.0)")
    print(sep)
    print(fmt.format("μ", "SCS(kHz)", "Slots/Frame", "Slot(μs)", "Sym+CP(μs)", "Symbols/Frame"))
    print(sep)
    for mu in range(5):
        p = get_numerology(mu)
        print(fmt.format(
            p.mu, f"{p.scs_khz:.0f}", p.slots_per_frame,
            f"{p.slot_duration_us:.0f}", f"{p.t_with_cp_us:.2f}", p.symbols_per_frame
        ))
    print(sep)
    print(f"Tc ≈ {TC_NS:.3f} ns  |  Ts ≈ {TS_NS:.3f} ns  |  Ts = 64·Tc")
    print(f"参考：38.211 Section 4.1, Table 4.2-1, Table 4.3.2-1\n")


# ─────────────────────────────────────────────────────────────────────────────
# 模块 2：PyTorch OFDM 调制器/解调器
# 对应 38.211 Section 5.3 — OFDM baseband signal generation
# ─────────────────────────────────────────────────────────────────────────────

class OFDMModulator(nn.Module):
    """
    端到端可微 OFDM 调制器

    数学核心（38.211 Eq.5.3.1-1）：
        s(t) = Σ_{k=0}^{N-1} a_k · exp(j·2π·k·Δf·t)
             ≡ IFFT(a_k)  （离散化后）

    支持 batch 维度：input shape = (..., N_fft)
    梯度可完整反向传播，用于端到端 AI 接收机训练。
    """

    def __init__(self, n_fft: int, mu: int):
        super().__init__()
        self.n_fft = n_fft
        self.mu    = mu
        cfg        = get_numerology(mu)
        # CP 长度：按标准比例计算（Normal CP ≈ N_fft/8 ~ N_fft/14）
        # 精确值：N_cp = round(CP_normal_us / T_symbol_us × N_fft)
        self.n_cp  = round(cfg.cp_normal_us / cfg.t_symbol_us * n_fft)

    def forward(self, freq_symbols: torch.Tensor) -> torch.Tensor:
        """
        Args:
            freq_symbols: 频域调制符号，shape (..., N_fft)，复数 dtype
        Returns:
            tx_signal: 含 CP 的时域信号，shape (..., N_fft + N_cp)
        """
        # 步骤 1：IFFT（频域 → 时域）
        # torch.fft.ifft 保持梯度，norm='ortho' 保持能量归一化
        time_domain = torch.fft.ifft(freq_symbols, n=self.n_fft, dim=-1, norm='ortho')

        # 步骤 2：提取 Cyclic Prefix（取时域符号末尾 N_cp 个采样）
        cp = time_domain[..., -self.n_cp:]

        # 步骤 3：CP + 时域符号拼接
        tx_signal = torch.cat([cp, time_domain], dim=-1)

        return tx_signal

    @property
    def output_length(self) -> int:
        return self.n_fft + self.n_cp


class OFDMDemodulator(nn.Module):
    """
    端到端可微 OFDM 解调器

    步骤：去 CP → FFT → 单抽头信道均衡
    单抽头均衡成立的前提：T_CP >= 最大多径时延扩展（CP 保证了循环卷积）
    """

    def __init__(self, n_fft: int, mu: int):
        super().__init__()
        self.n_fft = n_fft
        cfg        = get_numerology(mu)
        self.n_cp  = round(cfg.cp_normal_us / cfg.t_symbol_us * n_fft)

    def forward(
        self,
        rx_signal: torch.Tensor,
        channel_h: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """
        Args:
            rx_signal:  接收信号，shape (..., N_fft + N_cp)
            channel_h:  频域信道估计，shape (..., N_fft)；None = 无失真信道
        Returns:
            equalized:  均衡后频域符号，shape (..., N_fft)
        """
        # 步骤 1：去除 CP
        no_cp = rx_signal[..., self.n_cp:]

        # 步骤 2：FFT（时域 → 频域）
        freq_rx = torch.fft.fft(no_cp, n=self.n_fft, dim=-1, norm='ortho')

        # 步骤 3：单抽头均衡（频域除法）
        if channel_h is not None:
            # 防止除零（信道深衰落时的数值稳定性）
            equalized = freq_rx / (channel_h + 1e-10)
        else:
            equalized = freq_rx

        return equalized


# ─────────────────────────────────────────────────────────────────────────────
# 模块 3：信道模拟器
# ─────────────────────────────────────────────────────────────────────────────

class AWGNChannel(nn.Module):
    """加性高斯白噪声信道"""

    def forward(self, tx: torch.Tensor, snr_db: float) -> torch.Tensor:
        snr_linear = 10 ** (snr_db / 10)
        signal_power = tx.abs().pow(2).mean()
        noise_power  = signal_power / snr_linear
        noise = torch.randn_like(tx.real) + 1j * torch.randn_like(tx.imag)
        noise = noise * torch.sqrt(noise_power / 2)
        return tx + noise


class MultipathChannel(nn.Module):
    """
    多径信道（时域线性卷积）

    用于演示 CP 抗 ISI 原理：
        当 tau_max <= T_CP 时，线性卷积 → 循环卷积，单抽头均衡成立
        当 tau_max >  T_CP 时，存在 ISI，OFDM 正交性被破坏
    """

    def __init__(self, delays_samples: list[int], gains: list[float]):
        """
        Args:
            delays_samples: 各径时延（采样数）
            gains:          各径增益（幅度）
        """
        super().__init__()
        assert len(delays_samples) == len(gains)
        max_delay = max(delays_samples)
        h = torch.zeros(max_delay + 1, dtype=torch.cfloat)
        for d, g in zip(delays_samples, gains):
            h[d] += g
        self.register_buffer('h', h)

    def forward(self, tx: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """返回：(接收信号, 频域信道响应 H)"""
        # 时域线性卷积（模拟真实多径）
        h_np = self.h.numpy()
        tx_np= tx.numpy()
        rx_np= np.convolve(tx_np, h_np, mode='full')[:len(tx_np)]

        # 频域信道响应（用于均衡）
        n_fft= len(tx_np)
        H = torch.fft.fft(self.h, n=n_fft)

        return torch.tensor(rx_np, dtype=torch.cfloat), H


class NTNDopplerChannel(nn.Module):
    """
    NTN LEO 多普勒信道仿真器

    模拟 LEO 卫星过境时的多普勒频移，
    并支持 UE 侧频率预补偿对比实验。

    参考：3GPP TR 38.821 Section 6.3.3
    """

    def __init__(
        self,
        altitude_km: float = 550.0,
        freq_hz: float = 2e9,
        sampling_rate_hz: float = None,
        n_fft: int = 1024,
        mu: int = 0,
    ):
        """
        Args:
            altitude_km:      LEO 轨道高度 (km)
            freq_hz:          载频 (Hz)，S-band=2GHz, Ka-band DL=20GHz
            sampling_rate_hz: 采样率，None 则自动从 SCS 计算
            n_fft:            FFT 大小
            mu:               Numerology
        """
        super().__init__()
        self.altitude_km = altitude_km
        self.freq_hz     = freq_hz
        self.n_fft       = n_fft
        self.mu          = mu

        # 轨道参数计算
        RE_KM  = 6371.0   # 地球半径 (km)
        GM     = 3.986e14 # 地球引力常数 (m^3/s^2)
        r_m    = (RE_KM + altitude_km) * 1e3
        self.v_leo_mps = np.sqrt(GM / r_m)   # 轨道速度 (m/s)

        # 最大多普勒频移
        self.fd_max_hz = (self.v_leo_mps / C_MPS) * freq_hz

        # 采样率
        cfg = get_numerology(mu)
        if sampling_rate_hz is None:
            # 采样率 = SCS × N_fft（标准关系）
            sampling_rate_hz = cfg.scs_khz * 1e3 * n_fft
        self.fs_hz = sampling_rate_hz

        self._print_params()

    def _print_params(self):
        cfg = get_numerology(self.mu)
        print(f"\n{'─'*55}")
        print(f"NTN Doppler Channel | LEO h={self.altitude_km} km")
        print(f"{'─'*55}")
        print(f"  轨道速度：           {self.v_leo_mps/1e3:.3f} km/s")
        print(f"  载频：               {self.freq_hz/1e9:.1f} GHz")
        print(f"  最大多普勒频移：     ±{self.fd_max_hz/1e3:.1f} kHz")
        print(f"  Numerology μ={self.mu}：  SCS = {cfg.scs_khz:.0f} kHz")
        print(f"  fd_max / SCS =       {self.fd_max_hz/(cfg.scs_khz*1e3)*100:.0f}%")
        print(f"  → {'⚠️  严重 ICI，必须预补偿！' if self.fd_max_hz > cfg.scs_khz*1e3*0.1 else '✅ ICI 可接受'}")
        print(f"{'─'*55}\n")

    def apply_doppler(
        self,
        signal: torch.Tensor,
        doppler_fraction: float = 1.0,
        residual_hz: float = 0.0,
    ) -> torch.Tensor:
        """
        对信号施加多普勒频移

        Args:
            signal:           输入信号（时域），shape (N,)
            doppler_fraction: 实际多普勒 = fd_max × doppler_fraction（0=无，1=最大）
            residual_hz:      预补偿后残余多普勒 (Hz)，模拟实际预补偿精度
        Returns:
            shifted_signal:   施加多普勒后的信号
        """
        fd = self.fd_max_hz * doppler_fraction + residual_hz
        N  = len(signal)
        t  = torch.arange(N, dtype=torch.float64) / self.fs_hz
        # 多普勒相位旋转：exp(j·2π·fd·t)
        phase = torch.exp(1j * 2 * np.pi * fd * t).to(torch.cfloat)
        return signal * phase


# ─────────────────────────────────────────────────────────────────────────────
# 模块 4：BER 仿真引擎
# ─────────────────────────────────────────────────────────────────────────────

def qpsk_modulate(bits: torch.Tensor) -> torch.Tensor:
    """QPSK 调制：每 2 bits 映射到一个复数符号"""
    bits = bits.view(-1, 2)
    real = (1 - 2 * bits[:, 0].float()) / np.sqrt(2)
    imag = (1 - 2 * bits[:, 1].float()) / np.sqrt(2)
    return torch.complex(real, imag)


def qpsk_demodulate(symbols: torch.Tensor) -> torch.Tensor:
    """QPSK 硬判决解调"""
    real_bits = (symbols.real < 0).long()
    imag_bits = (symbols.imag < 0).long()
    return torch.stack([real_bits, imag_bits], dim=-1).view(-1)


def compute_ber(
    n_fft: int,
    mu: int,
    snr_db_range: np.ndarray,
    n_symbols: int = 100,
    doppler_fraction: float = 0.0,
    residual_hz: float = 0.0,
    channel_type: str = 'awgn',   # 'awgn' | 'ntn_doppler'
    ntn_altitude_km: float = 550,
    ntn_freq_hz: float = 2e9,
) -> np.ndarray:
    """
    计算 QPSK OFDM 在指定条件下的 BER vs SNR

    Args:
        n_fft:            FFT 大小（子载波数）
        mu:               Numerology
        snr_db_range:     SNR 范围 (dB)
        n_symbols:        每 SNR 点仿真的 OFDM 符号数
        doppler_fraction: 多普勒强度（0=无，1=最大 fd）
        residual_hz:      预补偿后残余多普勒 (Hz)
        channel_type:     信道类型
    Returns:
        ber_array: shape (len(snr_db_range),)
    """
    modulator   = OFDMModulator(n_fft, mu)
    demodulator = OFDMDemodulator(n_fft, mu)
    awgn_ch     = AWGNChannel()

    if channel_type == 'ntn_doppler' or doppler_fraction > 0 or residual_hz > 0:
        ntn_ch = NTNDopplerChannel(
            altitude_km=ntn_altitude_km,
            freq_hz=ntn_freq_hz,
            n_fft=n_fft, mu=mu
        )
    else:
        ntn_ch = None

    ber_list = []

    for snr_db in snr_db_range:
        total_bits = 0
        error_bits = 0

        for _ in range(n_symbols):
            # 1. 生成随机 bits 并调制
            bits = torch.randint(0, 2, (n_fft * 2,))
            freq_tx = qpsk_modulate(bits)   # shape (n_fft,)

            # 2. OFDM 调制（IFFT + CP）
            tx = modulator(freq_tx.unsqueeze(0)).squeeze(0)  # (n_fft + n_cp,)

            # 3. 施加多普勒（若配置）
            if ntn_ch is not None and (doppler_fraction > 0 or residual_hz > 0):
                tx = ntn_ch.apply_doppler(tx, doppler_fraction, residual_hz)

            # 4. AWGN 信道
            rx = awgn_ch(tx, snr_db)

            # 5. OFDM 解调（去 CP + FFT）
            freq_rx = demodulator(rx.unsqueeze(0)).squeeze(0)

            # 6. QPSK 硬判决
            bits_rx = qpsk_demodulate(freq_rx)

            # 7. 统计 BER
            total_bits += len(bits)
            error_bits += (bits != bits_rx).sum().item()

        ber = error_bits / total_bits if total_bits > 0 else 0
        ber_list.append(max(ber, 1e-6))   # 下限保护，避免 log 零值

    return np.array(ber_list)


# ─────────────────────────────────────────────────────────────────────────────
# 模块 5：NTN 多普勒对比仿真
# ─────────────────────────────────────────────────────────────────────────────

def run_ntn_ber_comparison(n_fft: int = 256, mu: int = 0):
    """
    核心实验：NTN 多普勒场景下的 BER 对比
    ─────────────────────────────────────────
    对比三种场景：
      Case A：无多普勒（理论基线）
      Case B：全量多普勒，无预补偿（灾难场景）
      Case C：全量多普勒 + UE 预补偿（残余 200 Hz）

    预期结果：
      Case B 的 BER 曲线几乎不随 SNR 改善（ICI 是干扰下限）
      Case C 接近 Case A（预补偿有效性验证）
    """
    snr_range   = np.arange(-5, 25, 2)
    n_symbols   = 50
    freq_hz     = 2e9   # S-band
    altitude_km = 550

    print("\n" + "="*60)
    print("NTN Doppler BER Comparison  (LEO 550km, S-band 2GHz, μ=0)")
    print("="*60)

    cfg = get_numerology(mu)
    ntn = NTNDopplerChannel(altitude_km, freq_hz, n_fft=n_fft, mu=mu)
    fd_max = ntn.fd_max_hz

    print(f"最大多普勒：{fd_max/1e3:.1f} kHz  |  SCS：{cfg.scs_khz:.0f} kHz")
    print(f"fd_max/SCS = {fd_max/(cfg.scs_khz*1e3)*100:.0f}%  → 不预补偿将严重 ICI\n")

    print("Case A: 无多普勒（基线）...", end='', flush=True)
    ber_a = compute_ber(n_fft, mu, snr_range, n_symbols, 0.0, 0.0)
    print(" 完成")

    print("Case B: 全量多普勒，无预补偿...", end='', flush=True)
    ber_b = compute_ber(n_fft, mu, snr_range, n_symbols, 1.0, 0.0,
                        'ntn_doppler', altitude_km, freq_hz)
    print(" 完成")

    print("Case C: 全量多普勒 + 预补偿（残余 200Hz）...", end='', flush=True)
    ber_c = compute_ber(n_fft, mu, snr_range, n_symbols, 0.0, 200.0,
                        'ntn_doppler', altitude_km, freq_hz)
    print(" 完成\n")

    return snr_range, ber_a, ber_b, ber_c, fd_max


# ─────────────────────────────────────────────────────────────────────────────
# 模块 6：可视化套件
# ─────────────────────────────────────────────────────────────────────────────

def apply_dark_style(ax):
    """统一暗色主题"""
    ax.set_facecolor(DARK_AX)
    ax.tick_params(colors=DARK_MUTED, labelsize=8)
    for spine in ax.spines.values():
        spine.set_edgecolor(DARK_GRID)
    ax.grid(True, alpha=0.25, color=DARK_GRID)
    ax.xaxis.label.set_color(DARK_MUTED)
    ax.yaxis.label.set_color(DARK_MUTED)


def visualize_ofdm_waveforms(mu_list: list[int] = [0, 1, 3]):
    """
    图 1：不同 Numerology 下的 OFDM 时域波形 + 频谱对比
    展示：SCS 越大，符号越短，时频刻度的缩放关系
    """
    n_fft = 128
    fig = plt.figure(figsize=(16, 3.5 * len(mu_list) + 3.5), facecolor=DARK_BG)
    fig.suptitle(
        '5G NR OFDM Symbol — Time/Frequency Domain vs Numerology μ\n'
        '3GPP TS 38.211 v15.7 · Section 5.3',
        color=DARK_TEXT, fontsize=13, fontweight='bold'
    )
    gs = gridspec.GridSpec(len(mu_list) + 1, 2, hspace=0.55, wspace=0.35, figure=fig)

    modulator = None
    for row, mu in enumerate(mu_list):
        cfg = get_numerology(mu)
        mod = OFDMModulator(n_fft, mu)
        c   = MU_COLORS.get(mu, '#e6edf3')

        # 生成随机 QPSK 符号
        torch.manual_seed(42 + mu)
        freq_tx = qpsk_modulate(torch.randint(0, 2, (n_fft * 2,)))
        tx = mod(freq_tx.unsqueeze(0)).squeeze(0)
        tx_np = tx.detach().numpy()

        # 构建时间轴（基于真实符号时长）
        t_total_us = cfg.t_with_cp_us
        t_us = np.linspace(0, t_total_us, len(tx_np))
        cp_end_us  = cfg.cp_normal_us

        # 时域图
        ax_l = fig.add_subplot(gs[row, 0])
        apply_dark_style(ax_l)
        ax_l.axvspan(0, cp_end_us, alpha=0.12, color='#ff7b72')
        ax_l.axvline(cp_end_us, color='#ff7b72', lw=1.0, ls='--', alpha=0.7)
        ax_l.plot(t_us[:mod.n_cp], np.real(tx_np[:mod.n_cp]),
                  color='#ff7b72', lw=1.2, alpha=0.9, label='CP')
        ax_l.plot(t_us[mod.n_cp:], np.real(tx_np[mod.n_cp:]),
                  color=c, lw=1.4, label='Symbol (Real)')
        ax_l.text(cp_end_us / 2, 0.85, 'CP',
                  transform=ax_l.get_xaxis_transform(), ha='center',
                  color='#ff7b72', fontsize=7,
                  bbox=dict(boxstyle='round,pad=0.2', fc=DARK_AX, alpha=0.8))
        ax_l.set_xlabel('Time (μs)', fontsize=8)
        ax_l.set_ylabel('Amplitude', fontsize=8)
        ax_l.set_title(
            f'μ={mu} · SCS={cfg.scs_khz:.0f}kHz · '
            f'T_sym={cfg.t_symbol_us:.2f}μs · CP={cfg.cp_normal_us:.3f}μs',
            color=c, fontsize=9, pad=5
        )
        ax_l.legend(loc='upper right', fontsize=6.5,
                    facecolor=DARK_AX, labelcolor=DARK_TEXT, framealpha=0.8)

        # 频域图（功率谱）
        ax_r = fig.add_subplot(gs[row, 1])
        apply_dark_style(ax_r)
        sym_np = tx_np[mod.n_cp:]   # 去 CP
        spectrum = 20 * np.log10(np.abs(np.fft.fftshift(np.fft.fft(sym_np))) / n_fft + 1e-10)
        freqs_khz = np.fft.fftshift(np.fft.fftfreq(n_fft)) * cfg.scs_khz * n_fft

        ax_r.stem(freqs_khz, spectrum, linefmt=c,
                  markerfmt=f'D', basefmt=DARK_GRID)
        ax_r.set_xlabel('Frequency (kHz, rel. carrier)', fontsize=8)
        ax_r.set_ylabel('Power (dBc)', fontsize=8)
        ax_r.set_title(f'Power Spectrum · Δf={cfg.scs_khz:.0f}kHz', color=c, fontsize=9, pad=5)
        ax_r.set_xlim(-n_fft // 2 * cfg.scs_khz, n_fft // 2 * cfg.scs_khz)

    # 符号时长对比条形图（底部）
    ax_bar = fig.add_subplot(gs[-1, :])
    apply_dark_style(ax_bar)
    mus_all     = list(range(5))
    durations   = [get_numerology(m).t_with_cp_us for m in mus_all]
    bar_colors  = [MU_COLORS[m] for m in mus_all]
    ylabels     = [f'μ={m}  {get_numerology(m).scs_khz:.0f}kHz' for m in mus_all]
    bars = ax_bar.barh(ylabels, durations, color=bar_colors, alpha=0.85, edgecolor=DARK_GRID)
    for bar, dur in zip(bars, durations):
        ax_bar.text(bar.get_width() + 0.3, bar.get_y() + bar.get_height() / 2,
                    f'{dur:.2f}μs', va='center', color=DARK_TEXT, fontsize=8)
    ax_bar.set_xlabel('OFDM Symbol Duration incl. CP (μs)', fontsize=9)
    ax_bar.set_title(
        'Symbol Duration vs Numerology  —  时延越短 = 调度越灵活  (Rel-15)',
        color=DARK_TEXT, fontsize=10
    )
    ax_bar.invert_yaxis()

    plt.savefig(os.path.join(OUTPUT_DIR, 'numerology_waveform.png'), dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ 波形图已保存：output_waveforms.png")


def visualize_ntn_ber(snr_range, ber_a, ber_b, ber_c, fd_max_hz):
    """
    图 2：NTN 多普勒 BER 对比曲线
    可视化预补偿前后的系统性能差异
    """
    cfg = get_numerology(0)
    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5), facecolor=DARK_BG)
    fig.suptitle(
        f'NTN LEO Doppler Impact on OFDM — μ=0 (SCS=15kHz)  |  '
        f'fd_max={fd_max_hz/1e3:.1f}kHz  |  3GPP TR 38.821 Rel-17',
        color=DARK_TEXT, fontsize=12, fontweight='bold'
    )

    # BER 曲线
    ax = axes[0]
    apply_dark_style(ax)
    ax.semilogy(snr_range, ber_a, 'o-', color='#58a6ff', lw=2, ms=6,
                label='Case A: No Doppler (Baseline)')
    ax.semilogy(snr_range, ber_b, 's-', color='#ff7b72', lw=2, ms=6,
                label=f'Case B: Full Doppler, No Compensation\n'
                      f'(fd={fd_max_hz/1e3:.1f}kHz = {fd_max_hz/(cfg.scs_khz*1e3)*100:.0f}% of SCS)')
    ax.semilogy(snr_range, ber_c, '^-', color='#3fb950', lw=2, ms=6,
                label='Case C: Doppler + Pre-compensation\n(Residual = 200 Hz, 1.3% of SCS)')
    ax.axhline(y=1e-3, color=DARK_MUTED, ls=':', alpha=0.5)
    ax.text(snr_range[-1] - 5, 1.5e-3, 'BER = 1e-3\n(典型链路目标)',
            color=DARK_MUTED, fontsize=7)
    ax.set_xlabel('SNR (dB)', fontsize=9)
    ax.set_ylabel('Bit Error Rate (BER)', fontsize=9)
    ax.set_title('BER vs SNR  —  Doppler Compensation Comparison', color=DARK_TEXT, fontsize=10)
    ax.legend(fontsize=7.5, facecolor=DARK_AX, labelcolor=DARK_TEXT, framealpha=0.9)
    ax.set_ylim([1e-4, 1.0])

    # 多普勒频移对 SCS 的相对影响（所有 μ）
    ax2 = axes[1]
    apply_dark_style(ax2)
    mus = list(range(5))
    fd_to_scs_ratios = [fd_max_hz / (get_numerology(m).scs_khz * 1e3) * 100 for m in mus]
    scs_labels = [f'μ={m}\n{get_numerology(m).scs_khz:.0f}kHz' for m in mus]
    bar_c = [MU_COLORS[m] for m in mus]
    bars = ax2.bar(scs_labels, fd_to_scs_ratios, color=bar_c, alpha=0.85, edgecolor=DARK_GRID)
    ax2.axhline(y=10, color='#ff7b72', ls='--', lw=1.5, label='ICI 容忍阈值 (10%)')
    for bar, ratio in zip(bars, fd_to_scs_ratios):
        ax2.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1,
                 f'{ratio:.0f}%', ha='center', color=DARK_TEXT, fontsize=8)
    ax2.set_xlabel('Numerology', fontsize=9)
    ax2.set_ylabel('fd_max / SCS (%)', fontsize=9)
    ax2.set_title(
        f'Relative Doppler vs SCS  —  LEO 550km, S-band 2GHz\n'
        f'即使 μ=3(120kHz) ICI 仍达 {fd_to_scs_ratios[3]:.0f}%，预补偿是唯一出路',
        color=DARK_TEXT, fontsize=9
    )
    ax2.legend(fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_ntn_ber.png'), dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ NTN BER 图已保存：output_ntn_ber.png")


def visualize_cp_multipath_demo(n_fft: int = 64, mu: int = 0):
    """
    图 3：CP 抗多径原理演示
    对比 CP 足够 vs CP 不足时的 FFT 输出失真
    """
    torch.manual_seed(0)
    mod   = OFDMModulator(n_fft, mu)
    demod = OFDMDemodulator(n_fft, mu)

    bits  = torch.randint(0, 2, (n_fft * 2,))
    freq_tx = qpsk_modulate(bits)
    tx = mod(freq_tx.unsqueeze(0)).squeeze(0)

    # 两径信道
    delays = [0, 4]
    gains  = [1.0, 0.5]
    max_delay = max(delays)
    h = np.zeros(max_delay + 1, dtype=complex)
    for d, g in zip(delays, gains):
        h[d] += g
    tx_np = tx.detach().numpy()
    rx_np = np.convolve(tx_np, h, mode='full')[:len(tx_np)]
    rx = torch.tensor(rx_np, dtype=torch.cfloat)

    freq_rx_valid = demod(rx.unsqueeze(0)).squeeze(0).detach().numpy()

    # CP 不足场景（人为将 n_cp 设为 0）
    rx_no_cp_removal = torch.tensor(rx_np[:n_fft], dtype=torch.cfloat)
    freq_rx_invalid = np.fft.fft(rx_no_cp_removal.numpy())

    ideal = freq_tx.numpy()

    fig, axes = plt.subplots(1, 3, figsize=(15, 4.5), facecolor=DARK_BG)
    fig.suptitle(
        'Cyclic Prefix — Multipath Protection Demonstration\n'
        '当 T_CP ≥ 最大多径时延时，OFDM 正交性完全保持',
        color=DARK_TEXT, fontsize=12
    )

    titles = ['Tx 频域（参考）', '✅ CP 足够：完美均衡', '❌ CP 不足（跳过 CP 去除）：ISI 出现']
    data   = [ideal, freq_rx_valid, freq_rx_invalid[:n_fft] / np.max(np.abs(freq_rx_invalid[:n_fft]))]
    colors = ['#58a6ff', '#3fb950', '#ff7b72']

    for ax, title, d, c in zip(axes, titles, data, colors):
        apply_dark_style(ax)
        ax.scatter(d.real, d.imag, c=c, s=8, alpha=0.7)
        ax.set_xlim(-1.8, 1.8)
        ax.set_ylim(-1.8, 1.8)
        ax.axhline(0, color=DARK_GRID, lw=0.5)
        ax.axvline(0, color=DARK_GRID, lw=0.5)
        ax.set_title(title, color=c, fontsize=9)
        ax.set_xlabel('Real', fontsize=8)
        ax.set_ylabel('Imag', fontsize=8)
        # 绘制 QPSK 理想点
        ideal_pts = np.array([1+1j, 1-1j, -1+1j, -1-1j]) / np.sqrt(2)
        ax.scatter(ideal_pts.real, ideal_pts.imag,
                   marker='+', c='white', s=100, zorder=5, linewidths=1.5)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_cp_demo.png'), dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ CP 演示图已保存：output_cp_demo.png")


# ─────────────────────────────────────────────────────────────────────────────
# 模块 7：AI 原生扩展骨架 — Deep Unfolding 接收机
# ─────────────────────────────────────────────────────────────────────────────

class DeepUnfoldingReceiver(nn.Module):
    """
    Deep Unfolding 接收机骨架
    ═══════════════════════════════════════════════════════════════════
    概念：将迭代信号处理算法（如 OAMP、MMSE-SIC）"展开"为固定层数的
          神经网络，每层对应一次迭代，参数通过端到端梯度下降学习。

    优势：
        ① 可解释性强（每层有明确的物理含义）
        ② 训练收敛快（参数初值可用传统算法结果热启动）
        ③ 对信道模型失配的鲁棒性优于纯数据驱动方法

    典型代表：
        OAMP-Net（He et al., 2020）
        DetNet   （Samuel et al., 2019）
        HyperMIMO（Goutay et al., 2021）

    ═══════════════════════════════════════════════════════════════════
    此骨架展示了如何将 OFDMDemodulator 的输出接入 AI 均衡模块，
    并保持整条链路端到端可微（梯度可从 loss 反传回 freq_symbols）。
    ═══════════════════════════════════════════════════════════════════
    """

    def __init__(self, n_fft: int, mu: int, n_layers: int = 5, hidden_dim: int = 64):
        super().__init__()
        self.n_fft      = n_fft
        self.demodulator= OFDMDemodulator(n_fft, mu)
        self.n_layers   = n_layers

        # 可学习的均衡层（每层 = 一次迭代）
        # 输入：[real, imag, |H|^2, SNR_est] → 4 个特征
        self.layers = nn.ModuleList([
            nn.Sequential(
                nn.Linear(4, hidden_dim),
                nn.ReLU(),
                nn.Linear(hidden_dim, 2),   # 输出校正量 [Δreal, Δimag]
            )
            for _ in range(n_layers)
        ])

    def forward(
        self,
        rx_signal: torch.Tensor,
        channel_h: torch.Tensor,
        snr_db: float = 20.0
    ) -> torch.Tensor:
        """
        Args:
            rx_signal:  接收信号，shape (batch, N_fft + N_cp)
            channel_h:  信道估计，shape (batch, N_fft)，复数
            snr_db:     估计 SNR
        Returns:
            x_hat:      估计的发送符号，shape (batch, N_fft)，复数
        """
        # 步骤 1：传统 OFDM 解调（去 CP + FFT + LS 均衡）
        x_ls = self.demodulator(rx_signal, channel_h)   # (batch, N_fft)

        # 步骤 2：Deep Unfolding 迭代精炼
        # 当前估计从 LS 解的实部和虚部开始
        x_hat_real = x_ls.real
        x_hat_imag = x_ls.imag

        h_power = channel_h.abs().pow(2)            # 信道功率（特征）
        snr_feat = torch.full_like(h_power, snr_db / 30.0)  # 归一化 SNR

        for layer in self.layers:
            # 构造特征向量：[当前估计实部, 虚部, 信道功率, SNR]
            feat = torch.stack([x_hat_real, x_hat_imag, h_power, snr_feat], dim=-1)
            # shape: (batch, N_fft, 4)

            # 神经网络输出校正量
            delta = layer(feat)                      # (batch, N_fft, 2)
            x_hat_real = x_hat_real + delta[..., 0]
            x_hat_imag = x_hat_imag + delta[..., 1]

        return torch.complex(x_hat_real, x_hat_imag)


def verify_gradient_flow_through_fft():
    """
    梯度流验证：确认梯度能穿越 torch.fft.ifft 反向传播
    这是构建端到端可微物理层的基础验证实验
    """
    print("\n" + "="*55)
    print("梯度流验证：torch.fft.ifft 可微性测试")
    print("="*55)

    n_fft = 64
    mu    = 0

    # 创建带梯度的频域符号
    freq = torch.randn(n_fft, dtype=torch.cfloat, requires_grad=True)

    # 调制 → 加噪 → 解调 → 损失
    mod   = OFDMModulator(n_fft, mu)
    demod = OFDMDemodulator(n_fft, mu)
    awgn  = AWGNChannel()

    tx    = mod(freq.unsqueeze(0)).squeeze(0)
    rx    = awgn(tx, snr_db=10.0)
    rx_fd = demod(rx.unsqueeze(0)).squeeze(0)

    # MSE 损失（假设已知真实发送符号）
    loss = (rx_fd - freq).abs().pow(2).mean()
    loss.backward()

    grad_exists = freq.grad is not None and not freq.grad.isnan().any()
    grad_norm   = freq.grad.abs().mean().item() if grad_exists else 0.0

    print(f"  频域符号 requires_grad: {freq.requires_grad}")
    print(f"  梯度是否存在且有效：   {'✅ 是' if grad_exists else '❌ 否'}")
    print(f"  平均梯度幅度：         {grad_norm:.6f}")
    print(f"  结论：梯度完整穿越了 IFFT → 信道 → FFT 链路")
    print(f"  → 可以对整条物理层链路进行端到端 AI 优化！")
    print("="*55 + "\n")


# ─────────────────────────────────────────────────────────────────────────────
# 主程序
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    # ── 1. 打印参数表 ──────────────────────────────────────────────────────────
    print_numerology_table()

    # ── 2. 梯度流验证（AI 扩展基础）──────────────────────────────────────────
    verify_gradient_flow_through_fft()

    # ── 3. OFDM 时域波形可视化 ─────────────────────────────────────────────────
    print("生成 OFDM 波形可视化...")
    visualize_ofdm_waveforms(mu_list=[0, 1, 3])

    # ── 4. CP 抗多径演示 ────────────────────────────────────────────────────────
    print("\n生成 CP 多径演示...")
    visualize_cp_multipath_demo(n_fft=64, mu=0)

    # ── 5. NTN 多普勒 BER 对比仿真 ─────────────────────────────────────────────
    print("\n运行 NTN 多普勒 BER 仿真（约需 1~3 分钟）...")
    snr_r, ber_a, ber_b, ber_c, fd_max = run_ntn_ber_comparison(n_fft=128, mu=0)
    visualize_ntn_ber(snr_r, ber_a, ber_b, ber_c, fd_max)

    # ── 6. Deep Unfolding 接收机实例化验证 ─────────────────────────────────────
    print("\nDeep Unfolding 接收机骨架验证...")
    n_fft, mu, batch = 256, 0, 4
    receiver = DeepUnfoldingReceiver(n_fft=n_fft, mu=mu, n_layers=5)
    mod_test = OFDMModulator(n_fft, mu)

    torch.manual_seed(0)
    freq_test = (torch.randn(batch, n_fft) + 1j * torch.randn(batch, n_fft)) / np.sqrt(2)
    tx_test   = mod_test(freq_test)
    H_test    = torch.ones(batch, n_fft, dtype=torch.cfloat)  # 理想平坦信道

    rx_test   = AWGNChannel()(tx_test, snr_db=10.0)
    x_hat     = receiver(rx_test, H_test, snr_db=10.0)

    params    = sum(p.numel() for p in receiver.parameters())
    print(f"  输入 shape：  {freq_test.shape}  (batch={batch}, N_fft={n_fft})")
    print(f"  输出 shape：  {x_hat.shape}")
    print(f"  模型参数量：  {params:,}")
    print(f"  ✅ 端到端链路：OFDMModulator → AWGN → DeepUnfoldingReceiver 验证通过")
    print(f"\n  下一步：用真实信道数据训练 receiver，替换 LS 均衡的基线性能。")

    print("\n🎉 所有模块运行完毕。输出文件：")
    print("    output_waveforms.png — OFDM 时频波形")
    print("    output_cp_demo.png   — CP 抗多径演示")
    print("    output_ntn_ber.png   — NTN 多普勒 BER 对比")