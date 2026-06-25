"""
harq_sim.py
===========
5G NR HARQ Simulator

参考标准：
    3GPP TS 38.212 v15.7.0  §5.4   — 速率匹配与冗余版本
    3GPP TS 38.321 v15.7.0  §5.3   — MAC HARQ 机制
    3GPP TS 38.213 v15.7.0  §9.1   — HARQ-ACK Codebook
    3GPP TR 38.821 v17.3.0         — NTN HARQ 取舍

核心功能：
    1. LDPC 软比特近似模型（LLR 生成）
    2. 圆形缓冲区 LLR 叠加（Chase Combining vs Incremental Redundancy）
    3. HARQ 进程状态机（多进程并发，NDI 追踪）
    4. BLER vs 重传次数曲线（CC vs IR 对比）
    5. HARQ 进程数 vs 吞吐量损失分析（NTN 场景）
    6. RV 序列对软合并增益的影响可视化

依赖：pip install numpy matplotlib scipy
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.gridspec as gridspec
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum, auto
import warnings
import os

# 中文字体
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'Noto Sans SC', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# 主题
# ─────────────────────────────────────────────────────────────────────────────
DARK_BG   = '#0d1117'
DARK_AX   = '#161b22'
DARK_GRID = '#30363d'
DARK_TEXT = '#e6edf3'
DARK_MUTED= '#8b949e'

COLORS = {
    'cc'   : '#58a6ff',
    'ir'   : '#3fb950',
    'rv0'  : '#ffa657',
    'rv2'  : '#d2a8ff',
    'rv3'  : '#ff7b72',
    'rv1'  : '#79c0ff',
    'ntn'  : '#e3b341',
    'loss' : '#ff7b72',
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
# 模块 1：LDPC 软比特近似模型
# ─────────────────────────────────────────────────────────────────────────────

def generate_llr(bits: np.ndarray, snr_db: float,
                 rng: np.random.Generator) -> np.ndarray:
    """
    生成 BPSK 调制下的 LLR（近似模型）
    LLR[i] = 2s[i]/σ² + n[i]，s[i]∈{+1,-1}，n[i]~N(0,2/snr)
    """
    snr_lin = 10 ** (snr_db / 10)
    sigma2  = 1.0 / snr_lin
    bpsk    = 1 - 2 * bits.astype(float)
    llr     = 2 * bpsk / sigma2 + rng.standard_normal(len(bits)) * np.sqrt(2 / snr_lin)
    return llr


def hard_decision(llr: np.ndarray) -> np.ndarray:
    return (llr < 0).astype(int)


# ─────────────────────────────────────────────────────────────────────────────
# 模块 2：圆形缓冲区与冗余版本
# 参考：38.212 §5.4.2.1，Table 5.4.2.1-2（BG1）
# ─────────────────────────────────────────────────────────────────────────────

def get_rv_start(rv: int, N_cb: int) -> int:
    """
    RV 对应的圆形缓冲区起点

    BG1 精确公式：
        RV=0: k0 = 0
        RV=1: k0 = floor(17 * N_cb / 66)
        RV=2: k0 = floor(33 * N_cb / 66)
        RV=3: k0 = floor(56 * N_cb / 66)
    """
    numerators = {0: 0, 1: 17, 2: 33, 3: 56}
    return int(np.floor(numerators[rv] * N_cb / 66))


class CircularBuffer:
    """HARQ 软缓冲区（圆形缓冲区 LLR 叠加）"""

    def __init__(self, N_cb: int, n_bits_per_tx: int):
        self.N_cb          = N_cb
        self.E             = n_bits_per_tx
        self.buffer        = np.zeros(N_cb, dtype=np.float64)
        self.tx_count      = 0
        self.coverage_mask = np.zeros(N_cb, dtype=bool)

    def accumulate(self, llr: np.ndarray, rv: int):
        """将 RV=rv 的传输的 LLR 叠加到圆形缓冲区"""
        k0 = get_rv_start(rv, self.N_cb)
        for i in range(self.E):
            idx = (k0 + i) % self.N_cb
            self.buffer[idx] += llr[i]
            self.coverage_mask[idx] = True
        self.tx_count += 1

    @property
    def coverage_pct(self) -> float:
        return self.coverage_mask.sum() / self.N_cb * 100

    def decode(self, info_bits: np.ndarray) -> tuple:
        """简化解码：对系统位位置做硬判决（近似模型）"""
        K = len(info_bits)
        sys_llr = self.buffer[:K]
        decoded = hard_decision(sys_llr)
        crc_ok  = np.array_equal(decoded[:K], info_bits)
        return decoded, crc_ok

    def reset(self):
        self.buffer[:]        = 0.0
        self.coverage_mask[:] = False
        self.tx_count         = 0


# ─────────────────────────────────────────────────────────────────────────────
# 模块 3：CC vs IR BLER 对比实验
# ─────────────────────────────────────────────────────────────────────────────

def simulate_bler_vs_retx(
    snr_db: float = 0.0,
    n_bits: int = 256,
    n_cb_ratio: float = 3.0,
    max_retx: int = 3,
    n_trials: int = 2000,
    seed: int = 42,
) -> dict:
    """对比 CC 和 IR 在不同重传次数下的 BLER"""
    rng   = np.random.default_rng(seed)
    N_cb  = int(n_bits * n_cb_ratio)
    E     = n_bits
    rv_sequence = [0, 2, 3, 1]

    cc_errors = np.zeros(max_retx + 1, dtype=int)
    ir_errors = np.zeros(max_retx + 1, dtype=int)

    for _ in range(n_trials):
        bits = rng.integers(0, 2, n_bits)

        # Chase Combining
        cc_buf = CircularBuffer(N_cb, E)
        for tx in range(max_retx + 1):
            llr = generate_llr(bits, snr_db, rng)
            cc_buf.accumulate(llr, rv=0)
            _, ok = cc_buf.decode(bits)
            if not ok:
                cc_errors[tx] += 1

        # Incremental Redundancy
        ir_buf = CircularBuffer(N_cb, E)
        for tx in range(max_retx + 1):
            rv  = rv_sequence[tx % 4]
            llr = generate_llr(bits, snr_db, rng)
            ir_buf.accumulate(llr, rv=rv)
            _, ok = ir_buf.decode(bits)
            if not ok:
                ir_errors[tx] += 1

    return {
        'cc_bler'  : cc_errors / n_trials,
        'ir_bler'  : ir_errors / n_trials,
        'retx_list': list(range(max_retx + 1)),
        'snr_db'   : snr_db,
    }


def simulate_bler_vs_snr_multiretx(
    snr_range: np.ndarray = np.arange(-4, 8, 1),
    max_retx: int = 3,
    n_trials: int = 1000,
) -> dict:
    """在不同 SNR 下对比 CC 和 IR 的 BLER 曲线族"""
    cc_bler = np.zeros((max_retx + 1, len(snr_range)))
    ir_bler = np.zeros((max_retx + 1, len(snr_range)))

    for j, snr in enumerate(snr_range):
        result = simulate_bler_vs_retx(snr_db=snr, n_trials=n_trials)
        for t in range(max_retx + 1):
            cc_bler[t, j] = result['cc_bler'][t]
            ir_bler[t, j] = result['ir_bler'][t]
        print(f"  SNR={snr:+.0f}dB: "
              f"CC_tx0={cc_bler[0,j]:.3f} IR_tx0={ir_bler[0,j]:.3f} | "
              f"CC_tx3={cc_bler[3,j]:.3f} IR_tx3={ir_bler[3,j]:.3f}")

    return {'cc_bler': cc_bler, 'ir_bler': ir_bler, 'snr_range': snr_range}


# ─────────────────────────────────────────────────────────────────────────────
# 模块 4：HARQ 进程状态机
# ─────────────────────────────────────────────────────────────────────────────

class HARQProcState(Enum):
    IDLE     = auto()
    WAIT_ACK = auto()


@dataclass
class HARQProcess:
    proc_id: int
    N_cb: int
    E: int
    state: HARQProcState = HARQProcState.IDLE
    ndi: int = 0
    tx_count: int = 0
    rv_seq: list = field(default_factory=lambda: [0, 2, 3, 1])
    buf: Optional[CircularBuffer] = None
    pending_ack_slot: int = -1

    def __post_init__(self):
        self.buf = CircularBuffer(self.N_cb, self.E)

    def start_new_tb(self):
        self.ndi = 1 - self.ndi
        self.buf.reset()
        self.tx_count = 0
        self.state    = HARQProcState.WAIT_ACK

    @property
    def current_rv(self) -> int:
        return self.rv_seq[self.tx_count % 4]


@dataclass
class HARQManager:
    n_procs: int
    N_cb: int
    E: int
    k1_eff: int

    def __post_init__(self):
        self.procs        = [HARQProcess(i, self.N_cb, self.E) for i in range(self.n_procs)]
        self.slot         = 0
        self.pending_acks = {}

    def get_free_proc(self) -> Optional[HARQProcess]:
        for p in self.procs:
            if p.state == HARQProcState.IDLE:
                return p
        return None

    def tick(self) -> bool:
        """执行一个 slot。返回：是否有调度"""
        if self.slot in self.pending_acks:
            proc_id = self.pending_acks.pop(self.slot)
            self.procs[proc_id].state = HARQProcState.IDLE

        proc = self.get_free_proc()
        scheduled = False
        if proc is not None:
            proc.start_new_tb()
            proc.pending_ack_slot            = self.slot + self.k1_eff
            self.pending_acks[proc.pending_ack_slot] = proc.proc_id
            scheduled = True

        self.slot += 1
        return scheduled


def simulate_harq_utilization(n_procs: int, k1_eff: int,
                               n_slots: int = 400) -> float:
    mgr = HARQManager(n_procs=n_procs, N_cb=512, E=128, k1_eff=k1_eff)
    scheduled = sum(mgr.tick() for _ in range(n_slots))
    return scheduled / n_slots


# ─────────────────────────────────────────────────────────────────────────────
# 模块 5：NTN 场景 — 进程数 vs 吞吐量损失
# ─────────────────────────────────────────────────────────────────────────────

def compute_ntn_harq_loss(altitude_km: float, elevation_deg: float,
                           mu: int, k1_base: int = 4,
                           max_procs: int = 16) -> dict:
    """
    计算 NTN 场景下的 HARQ 时序参数与吞吐量损失
    参考：38.821 §6.3.3
    """
    RE_KM  = 6371.0
    r_km   = RE_KM + altitude_km
    cos_e  = np.cos(np.radians(elevation_deg))
    sin_e  = np.sin(np.radians(elevation_deg))
    d_km   = np.sqrt(r_km**2 - (RE_KM * cos_e)**2) - RE_KM * sin_e
    tau_ms = d_km / 300.0
    rtt_ms = 2 * tau_ms + 2.0

    slot_ms           = 1.0 / (2 ** mu)
    k_offset          = int(np.ceil(rtt_ms / slot_ms))
    k1_eff            = k1_base + k_offset
    min_procs_needed  = k1_eff + 1
    actual_procs      = min(min_procs_needed, max_procs)
    utilization       = actual_procs / min_procs_needed
    throughput_loss   = max(0.0, (1 - utilization) * 100)

    return {
        'altitude_km'        : altitude_km,
        'elevation_deg'      : elevation_deg,
        'mu'                 : mu,
        'tau_ms'             : tau_ms,
        'rtt_ms'             : rtt_ms,
        'k_offset'           : k_offset,
        'k1_eff'             : k1_eff,
        'min_procs_needed'   : min_procs_needed,
        'actual_procs'       : actual_procs,
        'utilization'        : utilization,
        'throughput_loss_pct': throughput_loss,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 模块 6：可视化
# ─────────────────────────────────────────────────────────────────────────────

def visualize_circular_buffer_coverage(N_cb: int = 132, E: int = 44):
    """可视化 4 次传输（RV=0,2,3,1）对圆形缓冲区的覆盖"""
    rv_sequence = [0, 2, 3, 1]
    rv_colors   = [COLORS['rv0'], COLORS['rv2'], COLORS['rv3'], COLORS['rv1']]

    fig, axes = plt.subplots(2, 2, figsize=(14, 8), facecolor=DARK_BG)
    fig.suptitle(
        '圆形缓冲区 RV 覆盖可视化  |  IR 增量冗余原理\n'
        '(3GPP TS 38.212 §5.4.2.1 Table 5.4.2.1-2)',
        color=DARK_TEXT, fontsize=12, fontweight='bold'
    )

    cumulative_mask = np.zeros(N_cb, dtype=bool)

    for idx, (rv, c) in enumerate(zip(rv_sequence, rv_colors)):
        ax = axes[idx // 2][idx % 2]
        ax_style(ax)

        k0        = get_rv_start(rv, N_cb)
        this_mask = np.zeros(N_cb, dtype=bool)
        for i in range(E):
            this_mask[(k0 + i) % N_cb] = True

        new_coverage = this_mask & ~cumulative_mask
        cumulative_mask |= this_mask

        x = np.arange(N_cb)

        # 背景：已覆盖区域
        prev_covered = cumulative_mask & ~this_mask
        if prev_covered.any():
            ax.bar(x[prev_covered], np.ones(prev_covered.sum()),
                   bottom=0, color='#2a2a3a', width=1, label='已覆盖（之前）')

        # 本次新增
        if new_coverage.any():
            ax.bar(x[new_coverage], np.ones(new_coverage.sum()),
                   bottom=0, color=c, width=1, alpha=0.85,
                   label=f'RV={rv} 新增（{new_coverage.sum()} bit）')

        # 重叠部分
        overlap = this_mask & ~new_coverage
        if overlap.any():
            ax.bar(x[overlap], np.ones(overlap.sum()),
                   bottom=0, color='#30363d', width=1, alpha=0.7,
                   label=f'重叠区域')

        # 系统位 / 校验位分界线（BG1 近似：前 35%≈系统位）
        sys_end = int(N_cb * 0.35)
        ax.axvline(sys_end, color=DARK_MUTED, ls='--', lw=1, alpha=0.7)
        ax.text(sys_end / 2, 1.08, '系统位', ha='center',
                color=DARK_MUTED, fontsize=8)
        ax.text((N_cb + sys_end) / 2, 1.08, '校验位', ha='center',
                color=DARK_MUTED, fontsize=8)

        ax.axvline(k0, color=c, ls=':', lw=2, alpha=0.9)
        ax.text(k0 + 1, 0.85, f'k₀={k0}', color=c, fontsize=8)

        coverage_pct = cumulative_mask.sum() / N_cb * 100
        ax.set_title(
            f'第 {idx+1} 次传输（RV={rv}）  |  累积覆盖 {coverage_pct:.0f}%',
            color=c, fontsize=10
        )
        ax.set_xlabel('圆形缓冲区位置', fontsize=8)
        ax.set_ylim(0, 1.3)
        ax.set_yticks([])
        ax.legend(fontsize=7.5, facecolor=DARK_AX, labelcolor=DARK_TEXT,
                  loc='upper right', framealpha=0.85)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_harq_circular_buffer.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_harq_circular_buffer.png")


def plot_bler_vs_retx(snr_db: float = 0.0, n_trials: int = 2000):
    """BLER vs 重传次数：CC vs IR 对比"""
    result = simulate_bler_vs_retx(snr_db=snr_db, n_trials=n_trials, max_retx=3)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5), facecolor=DARK_BG)
    fig.suptitle(
        f'HARQ 软合并增益对比  |  SNR = {snr_db:+.0f} dB\n'
        f'Chase Combining (CC) vs Incremental Redundancy (IR)',
        color=DARK_TEXT, fontsize=12
    )

    ax = axes[0]
    ax_style(ax)
    retx = result['retx_list']
    ax.semilogy(retx, result['cc_bler'], 'o-',
                color=COLORS['cc'], lw=2, ms=8,
                label='Chase Combining (CC)\nRV=0→0→0→0')
    ax.semilogy(retx, result['ir_bler'], 's-',
                color=COLORS['ir'], lw=2, ms=8,
                label='Incremental Redundancy (IR)\nRV=0→2→3→1')
    ax.set_xlabel('重传次数（0=首传）', fontsize=9)
    ax.set_ylabel('BLER', fontsize=9)
    ax.set_title('BLER vs 重传次数', color=DARK_TEXT, fontsize=10)
    ax.legend(fontsize=8.5, facecolor=DARK_AX, labelcolor=DARK_TEXT)
    ax.set_xticks(retx)
    ax.set_xticklabels([f'TX{i}' for i in retx])
    ax.set_ylim([1e-4, 1.0])

    ax2 = axes[1]
    ax_style(ax2)
    cc   = np.array(result['cc_bler'])
    ir   = np.array(result['ir_bler'])
    gain = cc / (ir + 1e-8)
    bar_colors = [COLORS['cc'], COLORS['ir'], COLORS['rv0'], COLORS['rv2']]
    bars = ax2.bar(retx, gain, color=bar_colors, alpha=0.8,
                   edgecolor=DARK_GRID, width=0.5)
    for bar, g in zip(bars, gain):
        ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.05,
                 f'×{g:.1f}', ha='center', color=DARK_TEXT,
                 fontsize=10, fontweight='bold')
    ax2.axhline(1.0, color=DARK_MUTED, ls='--', lw=1, label='CC 基线（倍数=1）')
    ax2.set_xlabel('重传次数', fontsize=9)
    ax2.set_ylabel('IR vs CC 的 BLER 改善倍数', fontsize=9)
    ax2.set_title('IR 相对 CC 的增益倍数\n（BLER_CC / BLER_IR，越大越好）',
                  color=DARK_TEXT, fontsize=10)
    ax2.set_xticks(retx)
    ax2.set_xticklabels([f'TX{i}\n(RV={[0,2,3,1][i]})' for i in retx])
    ax2.legend(fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_harq_cc_vs_ir.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_harq_cc_vs_ir.png")


def plot_bler_vs_snr(n_trials: int = 800):
    """BLER vs SNR：不同重传次数曲线族"""
    snr_range = np.arange(-6, 8, 1)
    result    = simulate_bler_vs_snr_multiretx(snr_range, max_retx=3,
                                                n_trials=n_trials)
    cc_bler   = result['cc_bler']
    ir_bler   = result['ir_bler']

    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5), facecolor=DARK_BG)
    fig.suptitle(
        'BLER vs SNR  |  HARQ 重传增益\n'
        '(3GPP TS 38.212 §5.4.2, IR RV 序列: 0→2→3→1)',
        color=DARK_TEXT, fontsize=12
    )

    labels   = ['TX0（首传）', 'TX1（1次重传）', 'TX2（2次重传）', 'TX3（3次重传）']
    linestys = ['-', '--', '-.', ':']
    markers  = ['o', 's', '^', 'D']

    for ax, (bler, title, scheme) in zip(
        axes,
        [(ir_bler, 'Incremental Redundancy (IR)', COLORS['ir']),
         (cc_bler, 'Chase Combining (CC)',         COLORS['cc'])]
    ):
        ax_style(ax)
        alphas = [1.0, 0.85, 0.70, 0.55]
        for t in range(4):
            ax.semilogy(snr_range, bler[t],
                        color=scheme, lw=2, ls=linestys[t],
                        marker=markers[t], ms=5, markevery=2,
                        alpha=alphas[t], label=labels[t])
        ax.axhline(0.1, color=DARK_MUTED, ls=':', lw=1, alpha=0.5)
        ax.text(snr_range[-1] - 2, 0.13, '10% BLER',
                color=DARK_MUTED, fontsize=7.5)
        ax.set_xlabel('SNR (dB)', fontsize=9)
        ax.set_ylabel('BLER', fontsize=9)
        ax.set_title(title, color=DARK_TEXT, fontsize=10)
        ax.legend(fontsize=8.5, facecolor=DARK_AX, labelcolor=DARK_TEXT)
        ax.set_ylim([1e-4, 1.0])

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_harq_bler_snr.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_harq_bler_snr.png")


def plot_ntn_harq_analysis():
    """NTN 场景 HARQ 综合分析"""
    fig = plt.figure(figsize=(16, 10), facecolor=DARK_BG)
    fig.suptitle(
        'NTN HARQ 时序分析  |  LEO/GEO 场景  (3GPP TR 38.821 Rel-17)',
        color=DARK_TEXT, fontsize=13, fontweight='bold'
    )
    gs = gridspec.GridSpec(2, 3, figure=fig, hspace=0.45, wspace=0.35)

    # 子图 1：仰角 vs K_offset
    ax1 = fig.add_subplot(gs[0, 0])
    ax_style(ax1)
    elevations = np.linspace(10, 90, 50)
    for alt, c, lbl in [(550, COLORS['ir'], 'LEO 550km'),
                         (1200, COLORS['cc'], 'LEO 1200km')]:
        koffs = [compute_ntn_harq_loss(alt, e, mu=1)['k_offset']
                 for e in elevations]
        ax1.plot(elevations, koffs, color=c, lw=2, label=lbl)
    ax1.axhline(12, color=COLORS['loss'], ls='--', lw=1.5,
                label='16进程对应上限（K_offset=12）')
    ax1.set_xlabel('仰角 (°)', fontsize=9)
    ax1.set_ylabel('K_offset (slots)', fontsize=9)
    ax1.set_title('仰角 vs K_offset\n(μ=1, SCS=30kHz)',
                  color=DARK_TEXT, fontsize=9)
    ax1.legend(fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT)

    # 子图 2：进程数 vs 利用率
    ax2 = fig.add_subplot(gs[0, 1])
    ax_style(ax2)
    k1_effs = [5, 10, 15, 19, 25, 35]
    linestyles = ['-', '--', '-.', ':', '-', '--']
    for k1e, ls in zip(k1_effs, linestyles):
        procs_range = range(1, 17)
        utils = [min(p, k1e + 1) / (k1e + 1) * 100 for p in procs_range]
        ax2.plot(procs_range, utils, ls=ls, lw=1.8,
                 label=f'K1_eff={k1e}（需{k1e+1}进程）')
    ax2.axhline(100, color=DARK_MUTED, ls=':', lw=0.8)
    ax2.set_xlabel('HARQ 进程数', fontsize=9)
    ax2.set_ylabel('信道利用率 (%)', fontsize=9)
    ax2.set_title('进程数 vs 信道利用率', color=DARK_TEXT, fontsize=9)
    ax2.legend(fontsize=7, facecolor=DARK_AX, labelcolor=DARK_TEXT)
    ax2.set_xlim(1, 16)

    # 子图 3：热力图
    ax3 = fig.add_subplot(gs[0, 2])
    ax3.set_facecolor(DARK_AX)
    ax3.tick_params(colors=DARK_MUTED, labelsize=8)
    for sp in ax3.spines.values():
        sp.set_edgecolor(DARK_GRID)

    scenarios = [
        ('LEO 550km θ=90°',  550,  90),
        ('LEO 550km θ=45°',  550,  45),
        ('LEO 550km θ=20°',  550,  20),
        ('LEO 1200km θ=45°', 1200, 45),
        ('LEO 1200km θ=20°', 1200, 20),
    ]
    mus = [0, 1, 2]
    matrix = np.zeros((len(scenarios), len(mus)))
    for i, (_, alt, elev) in enumerate(scenarios):
        for j, mu in enumerate(mus):
            matrix[i, j] = compute_ntn_harq_loss(alt, elev, mu)['throughput_loss_pct']

    im = ax3.imshow(matrix, cmap='RdYlGn_r', aspect='auto', vmin=0, vmax=100)
    ax3.set_xticks(range(len(mus)))
    ax3.set_xticklabels([f'μ={m}\n({(2**m)*15}kHz)' for m in mus],
                         fontsize=8, color=DARK_MUTED)
    ax3.set_yticks(range(len(scenarios)))
    ax3.set_yticklabels([s[0] for s in scenarios], fontsize=8, color=DARK_MUTED)
    for i in range(len(scenarios)):
        for j in range(len(mus)):
            val = matrix[i, j]
            ax3.text(j, i, f'{val:.0f}%', ha='center', va='center',
                     fontsize=9, fontweight='bold',
                     color='white' if val > 50 else DARK_TEXT)
    ax3.set_title('HARQ 吞吐量损失热力图\n（0%=无损，100%=完全失效）',
                  color=DARK_TEXT, fontsize=9)
    plt.colorbar(im, ax=ax3, label='吞吐量损失 (%)')

    # 子图 4：三策略时序对比甘特图
    ax4 = fig.add_subplot(gs[1, :])
    ax_style(ax4)
    rng_gantt = np.random.default_rng(0)
    ax4.set_xlim(0, 40)
    ax4.set_ylim(-0.5, 3.5)
    ax4.set_xlabel('时间（slot，μ=1，0.5ms/slot）', fontsize=9)
    ax4.set_yticks([0, 1, 2, 3])
    ax4.set_yticklabels(
        ['策略C: HARQ禁用\n(RLC ARQ)',
         '策略B: 16进程不足\n(有空洞，K1_eff=39)',
         '策略A: K-offset\n(16进程，K1_eff=15)',
         '地面TN\n(4进程，K1=4)'],
        color=DARK_TEXT, fontsize=8.5
    )

    proc_colors = [
        COLORS['ir'], COLORS['cc'], COLORS['rv0'], COLORS['rv2'],
        COLORS['rv3'], COLORS['rv1'], COLORS['ntn'], COLORS['loss'],
        '#79c0ff', '#a5d6ff', '#ffab76', '#ffc9a9',
        '#e3b341', '#f0d06e', '#b392f0', '#c4a8ff',
    ]

    # 地面 TN
    for slot in range(40):
        c = proc_colors[slot % 4]
        ax4.barh(3, 0.8, left=slot, height=0.5, color=c, alpha=0.8,
                 edgecolor=DARK_AX)

    # 策略 A：16进程，K1_eff=15，满载
    for slot in range(40):
        c = proc_colors[slot % 16]
        ax4.barh(2, 0.8, left=slot, height=0.5, color=c, alpha=0.75,
                 edgecolor=DARK_AX)

    # 策略 B：K1_eff=39，需 40 进程，只有 16 → 利用率 40%
    for slot in range(40):
        if rng_gantt.random() < 16/40:
            ax4.barh(1, 0.8, left=slot, height=0.5,
                     color=COLORS['cc'], alpha=0.75, edgecolor=DARK_AX)
        else:
            ax4.barh(1, 0.8, left=slot, height=0.5,
                     color='#21262d', alpha=0.5, edgecolor=DARK_AX)

    # 策略 C：禁用 HARQ，满载
    for slot in range(40):
        ax4.barh(0, 0.8, left=slot, height=0.5,
                 color=COLORS['ntn'], alpha=0.6, edgecolor=DARK_AX)

    legend_patches = [
        mpatches.Patch(color=COLORS['ir'],  label='已调度（有数据）'),
        mpatches.Patch(color='#21262d',     label='空洞（等待 ACK）'),
        mpatches.Patch(color=COLORS['ntn'], label='HARQ 禁用（物理层满速）'),
    ]
    ax4.legend(handles=legend_patches, fontsize=8.5,
               facecolor=DARK_AX, labelcolor=DARK_TEXT, loc='upper right')
    ax4.set_title(
        'NTN HARQ 策略时序对比  |  A=K-offset  B=进程不足  C=HARQ禁用',
        color=DARK_TEXT, fontsize=10
    )

    plt.savefig(os.path.join(OUTPUT_DIR, 'output_harq_ntn_analysis.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_harq_ntn_analysis.png")


# ─────────────────────────────────────────────────────────────────────────────
# 主程序
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    warnings.filterwarnings('ignore')
    np.random.seed(42)

    print("=" * 62)
    print("5G NR HARQ Simulator")
    print("3GPP TS 38.212/38.321/38.213 · Rel-15/17")
    print("=" * 62)

    print("\n【1】圆形缓冲区 RV 覆盖可视化...")
    visualize_circular_buffer_coverage(N_cb=132, E=44)

    print("\n【2】BLER vs 重传次数（CC vs IR，约 30 秒）...")
    plot_bler_vs_retx(snr_db=0.0, n_trials=2000)

    print("\n【3】BLER vs SNR 曲线族（约 2~3 分钟）...")
    plot_bler_vs_snr(n_trials=600)

    print("\n【4】NTN HARQ 时序与吞吐量损失分析...")
    plot_ntn_harq_analysis()

    print("\n" + "=" * 70)
    print("NTN HARQ 参数汇总（μ=1，SCS=30kHz）")
    print("=" * 70)
    fmt = "{:<22} {:>8} {:>8} {:>10} {:>10} {:>12} {:>10}"
    print(fmt.format('场景', 'τ(ms)', 'RTT(ms)', 'K_offset',
                     'K1_eff', '需进程数', '损失%'))
    print("-" * 70)
    for alt, elev in [(550, 90), (550, 60), (550, 45), (550, 20), (550, 10),
                      (1200, 45), (1200, 20)]:
        r = compute_ntn_harq_loss(alt, elev, mu=1)
        print(fmt.format(
            f"LEO{alt}km θ={elev}°",
            f"{r['tau_ms']:.2f}", f"{r['rtt_ms']:.2f}",
            r['k_offset'], r['k1_eff'],
            r['min_procs_needed'],
            f"{r['throughput_loss_pct']:.1f}%"
        ))
    print("=" * 70)

    print("\n🎉 完毕。输出文件：")
    print("  output_harq_circular_buffer.png — 圆形缓冲区 RV 覆盖")
    print("  output_harq_cc_vs_ir.png        — CC vs IR 增益对比")
    print("  output_harq_bler_snr.png        — BLER vs SNR 曲线族")
    print("  output_harq_ntn_analysis.png    — NTN HARQ 综合分析")
