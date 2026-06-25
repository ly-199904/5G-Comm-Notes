"""
mimo_sim.py
===========
5G NR MIMO & Beamforming Simulator

参考标准：
    3GPP TS 38.211 v15.7.0  §7.3.1  — 层映射 / 预编码 / 天线端口映射
    3GPP TS 38.212 v15.7.0  §7.3.1.2.2 — DMRS 天线端口配置表
    3GPP TS 38.214 v15.7.0  §5.2.2  — Codebook-based / Non-codebook 预编码

核心功能：
    1. MIMO 信道生成（瑞利衰落 / LOS 莱斯衰落）
    2. 层映射 + Type I 码本预编码
    3. MMSE 检测器
    4. 容量 vs SNR（SISO / 2x2 / 4x4 / 8x8 对比）
    5. DMRS Type 1 / Type 2 频域 RE 占用可视化
    6. CDM 组数对 PDSCH RE 损失的影响分析

依赖：pip install numpy matplotlib scipy
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.gridspec as gridspec
from dataclasses import dataclass
from typing import Optional
import os

# 中文字体
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'Noto Sans SC', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
os.makedirs(OUTPUT_DIR, exist_ok=True)

DARK_BG   = '#0d1117'
DARK_AX   = '#161b22'
DARK_GRID = '#30363d'
DARK_TEXT = '#e6edf3'
DARK_MUTED= '#8b949e'

COLORS = {
    'siso'  : '#8b949e',
    '2x2'   : '#58a6ff',
    '4x4'   : '#3fb950',
    '8x8'   : '#ffa657',
    'ntn'   : '#e3b341',
    'dmrs'  : '#ff7b72',
    'pdsch' : '#58a6ff',
    'pdcch' : '#d2a8ff',
    'empty' : '#21262d',
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
# 模块 1：MIMO 信道模型
# ─────────────────────────────────────────────────────────────────────────────

def generate_rayleigh_channel(N_R: int, N_T: int,
                               rng: np.random.Generator) -> np.ndarray:
    """
    i.i.d. 瑞利衰落信道矩阵（富散射，地面典型场景）
    H[i,j] ~ CN(0, 1)，shape (N_R, N_T)
    """
    real = rng.standard_normal((N_R, N_T)) / np.sqrt(2)
    imag = rng.standard_normal((N_R, N_T)) / np.sqrt(2)
    return real + 1j * imag


def generate_rician_channel(N_R: int, N_T: int,
                             K_factor: float,
                             aod_deg: float = 0.0,
                             aoa_deg: float = 0.0,
                             rng: Optional[np.random.Generator] = None) -> np.ndarray:
    """
    莱斯衰落信道矩阵（LOS 主导，NTN 典型场景）

    K_factor = 0   → 纯瑞利（无 LOS）
    K_factor → ∞  → 纯 LOS（H 秩 = 1）

    参数：
        K_factor : 莱斯 K 因子（线性，非 dB）
        aod_deg  : 发射端离开角（度）
        aoa_deg  : 接收端到达角（度）
    """
    if rng is None:
        rng = np.random.default_rng(0)

    # LOS 分量（ULA 阵列响应）
    def ula_response(n_ant, angle_deg):
        angles = np.arange(n_ant) * np.pi * np.sin(np.radians(angle_deg))
        return np.exp(1j * angles) / np.sqrt(n_ant)

    a_T = ula_response(N_T, aod_deg).reshape(-1, 1)  # (N_T, 1)
    a_R = ula_response(N_R, aoa_deg).reshape(-1, 1)  # (N_R, 1)
    H_los = a_R @ a_T.conj().T                       # (N_R, N_T)

    # NLOS 分量
    H_nlos = generate_rayleigh_channel(N_R, N_T, rng)

    # 组合（功率归一化）
    H = np.sqrt(K_factor / (K_factor + 1)) * H_los + \
        np.sqrt(1 / (K_factor + 1)) * H_nlos
    return H


def channel_rank(H: np.ndarray, threshold_db: float = -20.0) -> int:
    """
    估计信道矩阵的有效秩
    （奇异值超过最大奇异值的 -threshold_db 的个数）
    """
    sv = np.linalg.svd(H, compute_uv=False)
    sv_norm = sv / sv[0]
    threshold = 10 ** (threshold_db / 20)
    return int(np.sum(sv_norm > threshold))


# ─────────────────────────────────────────────────────────────────────────────
# 模块 2：层映射（38.211 §7.3.1.3）
# ─────────────────────────────────────────────────────────────────────────────

def layer_map(symbols: np.ndarray, nu: int) -> np.ndarray:
    """
    单码字层映射（38.211 §7.3.1.3）

    Args:
        symbols : 调制符号序列，shape (M,)
        nu      : 层数（1~8）
    Returns:
        x       : 层映射后，shape (nu, M//nu)
    """
    M = len(symbols)
    assert M % nu == 0, f"符号数 {M} 不能被层数 {nu} 整除"
    # 轮询分配：x^(i)(k) = d(i + k*nu)
    x = np.zeros((nu, M // nu), dtype=complex)
    for k in range(M // nu):
        for i in range(nu):
            x[i, k] = symbols[i + k * nu]
    return x


def layer_demap(x: np.ndarray) -> np.ndarray:
    """层解映射：将 (nu, M//nu) 还原为 (M,)"""
    nu, K = x.shape
    d = np.zeros(nu * K, dtype=complex)
    for k in range(K):
        for i in range(nu):
            d[i + k * nu] = x[i, k]
    return d


# ─────────────────────────────────────────────────────────────────────────────
# 模块 3：Type I 码本（38.214 §5.2.2.2.1）
# ─────────────────────────────────────────────────────────────────────────────

def type1_codebook_1layer(n_ports: int, pmi: int) -> np.ndarray:
    """
    Type I 单面板码本，单层（ν=1）

    简化实现：DFT 码本
    W[:,pmi] = 1/sqrt(N) × [1, e^(j2π·pmi/N), ..., e^(j2π·pmi·(N-1)/N)]^T

    Args:
        n_ports : 天线端口数（2, 4, 8）
        pmi     : 预编码矩阵索引（0 ~ n_ports-1）
    Returns:
        W       : shape (n_ports, 1)
    """
    W = np.zeros((n_ports, 1), dtype=complex)
    for i in range(n_ports):
        W[i, 0] = np.exp(1j * 2 * np.pi * pmi * i / n_ports)
    return W / np.sqrt(n_ports)


def type1_codebook_multilayer(n_ports: int, nu: int) -> np.ndarray:
    """
    Type I 单面板码本，多层（简化版）

    使用 DFT 矩阵的前 nu 列，归一化

    Args:
        n_ports : 天线端口数
        nu      : 层数（≤ n_ports）
    Returns:
        W       : shape (n_ports, nu)，满足功率归一化
    """
    assert nu <= n_ports
    W = np.zeros((n_ports, nu), dtype=complex)
    for col in range(nu):
        for row in range(n_ports):
            W[row, col] = np.exp(1j * 2 * np.pi * col * row / n_ports)
    return W / np.sqrt(n_ports)


def identity_precoder(nu: int) -> np.ndarray:
    """恒等预编码矩阵（Non-codebook 等效或无预编码）"""
    return np.eye(nu, dtype=complex) / np.sqrt(nu)


# ─────────────────────────────────────────────────────────────────────────────
# 模块 4：MMSE 检测器
# ─────────────────────────────────────────────────────────────────────────────

def mmse_detector(H_eff: np.ndarray, r: np.ndarray,
                  snr_linear: float) -> np.ndarray:
    """
    MMSE 线性检测器

    x_hat = (H_eff^H H_eff + σ² I)^{-1} H_eff^H r

    Args:
        H_eff      : 等效信道，shape (N_R, nu)
        r          : 接收信号，shape (N_R,)
        snr_linear : 信噪比（线性）
    Returns:
        x_hat      : 检测后符号，shape (nu,)
    """
    nu    = H_eff.shape[1]
    sigma2 = 1.0 / snr_linear
    A     = H_eff.conj().T @ H_eff + sigma2 * np.eye(nu)
    x_hat = np.linalg.solve(A, H_eff.conj().T @ r)
    return x_hat


# ─────────────────────────────────────────────────────────────────────────────
# 模块 5：MIMO 容量计算
# ─────────────────────────────────────────────────────────────────────────────

def mimo_capacity(H: np.ndarray, snr_db: float) -> float:
    """
    MIMO 信道容量（均等功率分配，香农公式）

    C = log2 det(I + SNR/N_T × H H^H)  bit/s/Hz

    Args:
        H      : 信道矩阵，shape (N_R, N_T)
        snr_db : 每根发射天线的 SNR（dB）
    Returns:
        C      : 容量（bit/s/Hz）
    """
    N_R, N_T = H.shape
    snr = 10 ** (snr_db / 10)
    I   = np.eye(N_R)
    # 注意：功率分配给每根天线 snr/N_T
    val = np.linalg.det(I + snr / N_T * H @ H.conj().T)
    return np.log2(max(abs(val), 1e-30))


def siso_capacity(snr_db: float) -> float:
    return np.log2(1 + 10 ** (snr_db / 10))


def average_mimo_capacity(N_R: int, N_T: int,
                           snr_db: float,
                           n_realizations: int = 1000,
                           channel_type: str = 'rayleigh',
                           K_factor: float = 10.0,
                           rng: Optional[np.random.Generator] = None) -> float:
    """对多次信道实现取平均（遍历容量）"""
    if rng is None:
        rng = np.random.default_rng(42)
    caps = []
    for _ in range(n_realizations):
        if channel_type == 'rayleigh':
            H = generate_rayleigh_channel(N_R, N_T, rng)
        else:
            H = generate_rician_channel(N_R, N_T, K_factor, rng=rng)
        caps.append(mimo_capacity(H, snr_db))
    return float(np.mean(caps))


# ─────────────────────────────────────────────────────────────────────────────
# 模块 6：DMRS RE 占用分析
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DMRSConfig:
    """DMRS 配置参数"""
    dmrs_type: int       # 1 or 2
    max_length: int      # 1 or 2 (symbols)
    n_cdm_groups: int    # 1, 2, or 3
    dmrs_ports: list     # list of port indices

    @property
    def dmrs_re_per_rb_per_symbol(self) -> int:
        """每个 DMRS 符号中，每个 RB 占用的 RE 数"""
        if self.dmrs_type == 1:
            # Type 1：每个 CDM 组 6 个子载波/RB
            return self.n_cdm_groups * 6
        else:
            # Type 2：每个 CDM 组 4 个子载波/RB
            return self.n_cdm_groups * 4

    @property
    def total_dmrs_re_per_rb(self) -> int:
        return self.dmrs_re_per_rb_per_symbol * self.max_length


def compute_pdsch_re_efficiency(
    dmrs_config: DMRSConfig,
    n_pdcch_symbols: int = 2,
    n_symbols_per_slot: int = 14,
) -> dict:
    """
    计算 PDSCH RE 效率

    Returns:
        dict with total_re, dmrs_re, pdcch_re, pdsch_re, efficiency
    """
    total_re  = 12 * n_symbols_per_slot
    pdcch_re  = 12 * n_pdcch_symbols
    dmrs_re   = dmrs_config.total_dmrs_re_per_rb
    pdsch_re  = total_re - pdcch_re - dmrs_re
    efficiency = pdsch_re / total_re * 100

    return {
        'total_re'  : total_re,
        'pdcch_re'  : pdcch_re,
        'dmrs_re'   : dmrs_re,
        'pdsch_re'  : pdsch_re,
        'efficiency': efficiency,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 模块 7：可视化
# ─────────────────────────────────────────────────────────────────────────────

def plot_capacity_vs_snr(n_realizations: int = 500):
    """
    图 1：MIMO 容量 vs SNR
    对比 SISO / 2x2 / 4x4 / 8x8（瑞利信道）
    并展示 NTN LOS 信道（K=10dB）与瑞利的差异
    """
    snr_range = np.arange(-5, 30, 2)
    rng = np.random.default_rng(42)

    configs = [
        (1, 1, 'SISO',      COLORS['siso'],  'rayleigh'),
        (2, 2, '2×2 MIMO',  COLORS['2x2'],   'rayleigh'),
        (4, 4, '4×4 MIMO',  COLORS['4x4'],   'rayleigh'),
        (8, 8, '8×8 MIMO',  COLORS['8x8'],   'rayleigh'),
        (2, 2, '2×2 MIMO (LOS, K=10dB)', COLORS['ntn'], 'rician'),
    ]

    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5), facecolor=DARK_BG)
    fig.suptitle(
        'MIMO 信道容量 vs SNR  |  遍历容量（Ergodic Capacity）\n'
        '(38.211 §7.3.1，香农容量公式)',
        color=DARK_TEXT, fontsize=12
    )

    # 左图：绝对容量
    ax = axes[0]
    ax_style(ax)
    results = {}
    for N_R, N_T, label, c, ch_type in configs:
        print(f"  计算 {label}...", end='', flush=True)
        caps = [average_mimo_capacity(N_R, N_T, snr, n_realizations,
                                      ch_type, K_factor=10.0, rng=rng)
                for snr in snr_range]
        results[label] = np.array(caps)
        ls = '--' if 'LOS' in label else '-'
        ax.plot(snr_range, caps, color=c, lw=2, ls=ls, label=label)
        print(" ✓")

    ax.set_xlabel('SNR (dB)', fontsize=9)
    ax.set_ylabel('容量 (bit/s/Hz)', fontsize=9)
    ax.set_title('绝对容量', color=DARK_TEXT, fontsize=10)
    ax.legend(fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT)

    # 右图：相对 SISO 的增益倍数
    ax2 = axes[1]
    ax_style(ax2)
    siso_cap = results['SISO']
    for label, c, ls in [
        ('2×2 MIMO',  COLORS['2x2'],   '-'),
        ('4×4 MIMO',  COLORS['4x4'],   '-'),
        ('8×8 MIMO',  COLORS['8x8'],   '-'),
        ('2×2 MIMO (LOS, K=10dB)', COLORS['ntn'], '--'),
    ]:
        gain = results[label] / (siso_cap + 1e-9)
        ax2.plot(snr_range, gain, color=c, lw=2, ls=ls, label=label)

    ax2.axhline(1, color=DARK_MUTED, ls=':', lw=1, alpha=0.6)
    ax2.set_xlabel('SNR (dB)', fontsize=9)
    ax2.set_ylabel('容量增益（× SISO）', fontsize=9)
    ax2.set_title('相对 SISO 的容量增益\n（LOS 信道增益明显低于瑞利，因 H 趋近秩 1）',
                  color=DARK_TEXT, fontsize=10)
    ax2.legend(fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_mimo_capacity.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_mimo_capacity.png")
    return results


def plot_channel_rank_distribution():
    """
    图 2：信道矩阵秩分布
    对比瑞利（地面）vs 不同 K 因子莱斯（NTN）
    """
    n_samples = 2000
    rng = np.random.default_rng(42)
    N_R, N_T = 4, 4

    K_factors = [0, 1, 3, 10, 100]  # 线性 K 因子
    K_labels  = ['0 (纯瑞利)', '1 (弱LOS)', '3 (中LOS)', '10 (强LOS)', '100 (纯LOS)']
    rank_results = {}

    for K, lbl in zip(K_factors, K_labels):
        ranks = []
        for _ in range(n_samples):
            H = generate_rician_channel(N_R, N_T, K, rng=rng)
            ranks.append(channel_rank(H))
        rank_results[lbl] = np.array(ranks)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5), facecolor=DARK_BG)
    fig.suptitle(
        '信道矩阵有效秩分布  |  瑞利 vs 莱斯（4×4 MIMO）\n'
        'NTN LEO 信道以 LOS 为主（K>>1），秩接近 1，限制空间复用层数',
        color=DARK_TEXT, fontsize=12
    )

    colors_k = [COLORS['siso'], COLORS['2x2'], COLORS['4x4'],
                COLORS['8x8'], COLORS['ntn']]

    # 左图：秩分布直方图（K=0 vs K=10）
    ax = axes[0]
    ax_style(ax)
    for K, lbl, c in [(K_factors[0], K_labels[0], COLORS['2x2']),
                       (K_factors[3], K_labels[3], COLORS['ntn'])]:
        H_list = [generate_rician_channel(N_R, N_T, K, rng=rng)
                  for _ in range(n_samples)]
        ranks = [channel_rank(H) for H in H_list]
        counts = np.bincount(ranks, minlength=N_R + 1)[1:]
        ax.bar(np.arange(1, N_R + 1) + (0.2 if K > 0 else -0.2),
               counts / n_samples * 100, width=0.35,
               color=c, alpha=0.8, label=f'K={K} ({lbl})')

    ax.set_xlabel('有效秩', fontsize=9)
    ax.set_ylabel('概率 (%)', fontsize=9)
    ax.set_title('秩分布：瑞利 vs 强 LOS（K=10）', color=DARK_TEXT, fontsize=10)
    ax.set_xticks(range(1, N_R + 1))
    ax.legend(fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT)

    # 右图：平均秩 vs K 因子（dB）
    ax2 = axes[1]
    ax_style(ax2)
    K_dbs = [-10, -5, 0, 5, 10, 15, 20]  # dB
    avg_ranks = []
    for K_db in K_dbs:
        K = 10 ** (K_db / 10)
        ranks = [channel_rank(generate_rician_channel(N_R, N_T, K, rng=rng))
                 for _ in range(500)]
        avg_ranks.append(np.mean(ranks))

    ax2.plot(K_dbs, avg_ranks, 'o-', color=COLORS['4x4'], lw=2, ms=7)
    ax2.axhline(1, color=COLORS['ntn'], ls='--', lw=1.5,
                label='秩=1（纯 LOS，无空间复用）')
    ax2.axhline(N_R, color=COLORS['2x2'], ls='--', lw=1.5,
                label=f'秩={N_R}（满秩，最大空间复用）')
    ax2.set_xlabel('莱斯 K 因子 (dB)', fontsize=9)
    ax2.set_ylabel('平均有效秩', fontsize=9)
    ax2.set_title('平均信道秩 vs K 因子\nK 增大（LOS 增强）→ 秩下降 → 空间复用受限',
                  color=DARK_TEXT, fontsize=10)
    ax2.legend(fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT)
    ax2.set_ylim(0, N_R + 0.5)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_mimo_rank.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_mimo_rank.png")


def plot_dmrs_re_allocation():
    """
    图 3：DMRS Type 1 / Type 2 频域 RE 占用可视化
    展示不同 CDM 组数对 PDSCH RE 的影响
    """
    fig, axes = plt.subplots(2, 2, figsize=(14, 9), facecolor=DARK_BG)
    fig.suptitle(
        'DMRS 频域 RE 分配  |  Type 1 vs Type 2，不同 CDM 组数\n'
        '(3GPP TS 38.211 §7.4.1.1，38.212 Table 7.3.1.2.2-x)',
        color=DARK_TEXT, fontsize=12, fontweight='bold'
    )

    configs = [
        ('DMRS Type 1，CDM=1\n（端口 {0}，SISO）', 1, 1),
        ('DMRS Type 1，CDM=2\n（端口 {0,1,2,3}，4层）', 1, 2),
        ('DMRS Type 2，CDM=1\n（端口 {0,1}）', 2, 1),
        ('DMRS Type 2，CDM=3\n（端口 {0..5}，6层）', 2, 3),
    ]

    for ax, (title, dmrs_type, n_cdm) in zip(axes.flat, configs):
        ax.set_facecolor(DARK_AX)
        ax.set_xlim(-0.5, 11.5)
        ax.set_ylim(-0.5, 1.5)

        # 绘制 12 个子载波
        for sc in range(12):
            is_dmrs = False
            if dmrs_type == 1:
                # Type 1：CDM 组 0 = 偶数子载波，CDM 组 1 = 奇数子载波
                cdm_grp = sc % 2
                is_dmrs = cdm_grp < n_cdm
            else:
                # Type 2：CDM 组 0 = {0,1,6,7}，组 1 = {2,3,8,9}，组 2 = {4,5,10,11}
                cdm_grp = (sc % 6) // 2
                is_dmrs = cdm_grp < n_cdm

            color = COLORS['dmrs'] if is_dmrs else COLORS['pdsch']
            alpha = 0.85 if is_dmrs else 0.5

            rect = plt.Rectangle((sc - 0.45, 0.05), 0.9, 0.9,
                                  color=color, alpha=alpha)
            ax.add_patch(rect)

            if is_dmrs:
                ax.text(sc, 0.5, f'D\n({cdm_grp})', ha='center', va='center',
                        fontsize=7.5, color='white', fontweight='bold')
            else:
                ax.text(sc, 0.5, 'P', ha='center', va='center',
                        fontsize=8, color='white', alpha=0.7)

        # 统计
        if dmrs_type == 1:
            n_dmrs = n_cdm * 6
        else:
            n_dmrs = n_cdm * 4
        n_pdsch = 12 - n_dmrs

        ax.set_xticks(range(12))
        ax.set_xticklabels([str(i) for i in range(12)], fontsize=7, color=DARK_MUTED)
        ax.set_yticks([])
        ax.set_xlabel('子载波索引（一个 RB 内）', fontsize=8, color=DARK_MUTED)
        for sp in ax.spines.values():
            sp.set_edgecolor(DARK_GRID)

        ax.set_title(
            f'{title}\nDMRS: {n_dmrs} RE/RB  |  PDSCH: {n_pdsch} RE/RB  |  开销: {n_dmrs/12*100:.0f}%',
            color=DARK_TEXT, fontsize=9, pad=8
        )

    # 图例
    legend_items = [
        mpatches.Patch(color=COLORS['dmrs'], label='DMRS RE（信道估计）'),
        mpatches.Patch(color=COLORS['pdsch'], alpha=0.5, label='PDSCH RE（数据）'),
    ]
    fig.legend(handles=legend_items, loc='lower center', ncol=2,
               fontsize=9, facecolor=DARK_AX, labelcolor=DARK_TEXT,
               framealpha=0.85, bbox_to_anchor=(0.5, 0.01))

    plt.tight_layout(rect=[0, 0.06, 1, 1])
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_dmrs_re_allocation.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_dmrs_re_allocation.png")


def plot_precoding_effect():
    """
    图 4：预编码对波束方向图的影响
    展示不同 PMI 对应的阵列增益方向图（ULA 天线）
    """
    n_ports = 8
    angles  = np.linspace(-90, 90, 500)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5),
                              subplot_kw={'projection': 'polar'},
                              facecolor=DARK_BG)
    fig.suptitle(
        '预编码波束方向图（8 天线端口，ULA）\n'
        'Type I 码本 DFT 权重，PMI 决定波束指向角',
        color=DARK_TEXT, fontsize=12
    )

    colors_pmi = ['#58a6ff', '#3fb950', '#ffa657', '#d2a8ff',
                  '#ff7b72', '#79c0ff', '#e3b341', '#8b949e']

    for ax_idx, (ax, title) in enumerate(zip(axes, ['不同 PMI 的波束方向图', 'PMI=0 vs PMI=4（相反方向）'])):
        ax.set_facecolor(DARK_AX)
        ax.tick_params(colors=DARK_MUTED, labelsize=7)
        ax.set_title(title, color=DARK_TEXT, fontsize=10, pad=15)

        if ax_idx == 0:
            pmis = range(n_ports)
        else:
            pmis = [0, 4]

        for pmi in pmis:
            W = type1_codebook_1layer(n_ports, pmi)
            gains = []
            for theta in angles:
                # 阵列响应
                a = np.array([np.exp(1j * np.pi * i * np.sin(np.radians(theta)))
                              for i in range(n_ports)]) / np.sqrt(n_ports)
                gain_linear = abs(a.conj() @ W[:, 0]) ** 2
                gains.append(10 * np.log10(gain_linear + 1e-10))

            gains = np.array(gains)
            gains_norm = gains - gains.max()  # 归一化到 0 dB

            ax.plot(np.radians(angles), np.maximum(gains_norm, -30) + 30,
                    color=colors_pmi[pmi % len(colors_pmi)],
                    lw=1.5, label=f'PMI={pmi}')

        if ax_idx == 1:
            ax.legend(fontsize=9, facecolor=DARK_AX, labelcolor=DARK_TEXT,
                      loc='upper right')

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_mimo_precoding_beam.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_mimo_precoding_beam.png")


def plot_bler_vs_layers(n_trials: int = 500):
    """
    图 5：不同层数下的 BLER vs SNR（瑞利 vs LOS）
    验证 LOS 信道中多层 MIMO 性能退化
    """
    snr_range = np.arange(-5, 25, 3)
    rng = np.random.default_rng(42)

    def qpsk_symbol():
        c = 1 / np.sqrt(2)
        pts = [c + 1j*c, -c + 1j*c, c - 1j*c, -c - 1j*c]
        return pts[np.random.randint(4)]

    def simulate_bler(N_R, N_T, nu, snr_db, ch_type, K=10.0, n_trials=200):
        errors = 0
        rng_local = np.random.default_rng(42)
        for _ in range(n_trials):
            H = (generate_rayleigh_channel(N_R, N_T, rng_local)
                 if ch_type == 'rayleigh'
                 else generate_rician_channel(N_R, N_T, K, rng=rng_local))
            W = type1_codebook_multilayer(N_T, nu)
            H_eff = H @ W  # (N_R, nu)

            # 发送 nu 个 QPSK 符号
            x = np.array([qpsk_symbol() for _ in range(nu)])
            snr_lin = 10 ** (snr_db / 10)
            noise   = (np.random.randn(N_R) + 1j * np.random.randn(N_R)) / np.sqrt(2 * snr_lin)
            r       = H_eff @ x + noise

            x_hat   = mmse_detector(H_eff, r, snr_lin)
            # 硬判决
            for i in range(nu):
                c = 1 / np.sqrt(2)
                pts = np.array([c + 1j*c, -c + 1j*c, c - 1j*c, -c - 1j*c])
                decided = pts[np.argmin(np.abs(x_hat[i] - pts))]
                if decided != x[i]:
                    errors += 1
        return errors / (n_trials * nu)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5), facecolor=DARK_BG)
    fig.suptitle(
        'MIMO BLER vs SNR  |  QPSK，MMSE 检测\n'
        '瑞利信道（左）vs LOS 信道 K=10dB（右）',
        color=DARK_TEXT, fontsize=12
    )

    for ax, ch_type, ch_label in zip(axes, ['rayleigh', 'rician'],
                                      ['瑞利衰落（地面）', 'LOS (K=10dB，NTN)']):
        ax_style(ax)
        for nu, c, lbl in [(1, COLORS['siso'], '1 层 (SISO)'),
                            (2, COLORS['2x2'], '2 层'),
                            (4, COLORS['4x4'], '4 层')]:
            print(f"  {ch_type} {nu}层...", end='', flush=True)
            blers = [simulate_bler(4, 4, nu, snr, ch_type, n_trials=n_trials)
                     for snr in snr_range]
            ax.semilogy(snr_range, blers, 'o-', color=c, lw=2, ms=5, label=lbl)
            print(" ✓")

        ax.set_xlabel('SNR (dB)', fontsize=9)
        ax.set_ylabel('BLER', fontsize=9)
        ax.set_title(f'{ch_label}\n（4×4，QPSK，MMSE）', color=DARK_TEXT, fontsize=10)
        ax.legend(fontsize=8.5, facecolor=DARK_AX, labelcolor=DARK_TEXT)
        ax.set_ylim([1e-3, 1.0])

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_mimo_bler.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_mimo_bler.png")


# ─────────────────────────────────────────────────────────────────────────────
# 主程序
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import warnings
    warnings.filterwarnings('ignore')

    print("=" * 62)
    print("5G NR MIMO & Beamforming Simulator")
    print("3GPP TS 38.211/38.212/38.214 · Rel-15/17")
    print("=" * 62)

    # ── 1. 容量 vs SNR ────────────────────────────────────────────────────────
    print("\n【1】MIMO 容量 vs SNR（约 2~3 分钟）...")
    plot_capacity_vs_snr(n_realizations=300)

    # ── 2. 信道秩分布 ────────────────────────────────────────────────────────
    print("\n【2】信道矩阵秩分布（瑞利 vs 莱斯）...")
    plot_channel_rank_distribution()

    # ── 3. DMRS RE 分配 ───────────────────────────────────────────────────────
    print("\n【3】DMRS Type 1/2 RE 分配可视化...")
    plot_dmrs_re_allocation()

    # ── 4. 预编码波束方向图 ────────────────────────────────────────────────────
    print("\n【4】预编码波束方向图（8 端口 ULA）...")
    plot_precoding_effect()

    # ── 5. BLER vs 层数 ────────────────────────────────────────────────────────
    print("\n【5】MIMO BLER vs SNR（约 2 分钟）...")
    plot_bler_vs_layers(n_trials=300)

    # ── 6. PDSCH RE 效率汇总 ──────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print("PDSCH RE 效率汇总（14 符号/slot，2 符号 PDCCH，1 个 DMRS 符号）")
    print("=" * 65)
    fmt = "{:<30} {:>8} {:>8} {:>8} {:>10}"
    print(fmt.format('配置', 'DMRS RE', 'PDSCH RE', '总RE', '效率%'))
    print("-" * 65)
    configs = [
        ('Type1, CDM=1, 1端口',   DMRSConfig(1, 1, 1, [0])),
        ('Type1, CDM=2, 4端口',   DMRSConfig(1, 1, 2, [0,1,2,3])),
        ('Type1, CDM=2, 8端口',   DMRSConfig(1, 2, 2, list(range(8)))),
        ('Type2, CDM=1, 2端口',   DMRSConfig(2, 1, 1, [0,1])),
        ('Type2, CDM=3, 6端口',   DMRSConfig(2, 1, 3, list(range(6)))),
        ('Type2, CDM=3, 12端口',  DMRSConfig(2, 2, 3, list(range(12)))),
    ]
    for label, cfg in configs:
        r = compute_pdsch_re_efficiency(cfg)
        print(fmt.format(label, r['dmrs_re'], r['pdsch_re'],
                         r['total_re'], f"{r['efficiency']:.1f}"))
    print("=" * 65)

    print("\n🎉 完毕。输出文件：")
    print("  output_mimo_capacity.png         — MIMO 容量 vs SNR")
    print("  output_mimo_rank.png             — 信道矩阵秩分布")
    print("  output_dmrs_re_allocation.png    — DMRS RE 分配可视化")
    print("  output_mimo_precoding_beam.png   — 预编码波束方向图")
    print("  output_mimo_bler.png             — MIMO BLER vs SNR")
