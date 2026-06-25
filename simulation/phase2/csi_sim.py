"""
csi_sim.py  —  5G NR CSI 框架仿真
==================================================
覆盖内容：
  1. CSI-RS RE 时频占用可视化（多端口、多密度）
  2. SINR 估计 → CQI 映射（38.214 Table 5.2.1.3-1）
  3. RI 选择：瑞利信道下多层吞吐量对比
  4. AMC 闭环：CQI → MCS → BLER → OLLA 迭代
  5. 信道老化对 AMC 性能的影响（不同上报周期）

3GPP 参考：
  38.211 §7.4.1.5  CSI-RS 时频映射
  38.214 §5.2.1    CSI 上报
  38.214 §5.2.2.1  CQI 表与 BLER 目标
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.gridspec import GridSpec
from pathlib import Path

# ── 全局样式 ─────────────────────────────────────────────
DARK_BG   = "#0d1117"
PANEL_BG  = "#161b22"
GRID_CLR  = "#21262d"
TEXT_CLR  = "#e6edf3"
ACC_BLUE  = "#58a6ff"
ACC_GREEN = "#3fb950"
ACC_AMBER = "#d29922"
ACC_RED   = "#f85149"
ACC_PURPLE= "#bc8cff"
ACC_CYAN  = "#39d353"

plt.rcParams.update({
    "figure.facecolor": DARK_BG,
    "axes.facecolor":   PANEL_BG,
    "axes.edgecolor":   GRID_CLR,
    "axes.labelcolor":  TEXT_CLR,
    "xtick.color":      TEXT_CLR,
    "ytick.color":      TEXT_CLR,
    "text.color":       TEXT_CLR,
    "grid.color":       GRID_CLR,
    "grid.linewidth":   0.5,
    "font.sans-serif":  ['Microsoft YaHei', 'SimHei', 'Noto Sans SC', 'DejaVu Sans'],
    "axes.unicode_minus": False,
    "legend.facecolor": PANEL_BG,
    "legend.edgecolor": GRID_CLR,
})

OUT_DIR = Path(__file__).parent / 'output'
OUT_DIR.mkdir(exist_ok=True)
np.random.seed(42)

# ══════════════════════════════════════════════════════════
# 工具函数
# ══════════════════════════════════════════════════════════

# 38.214 Table 5.2.1.3-1  CQI → 调制阶数 & 目标码率
CQI_TABLE = {
    # cqi: (modulation_order, target_code_rate/1024, spectral_eff)
    0:  (0,    0,     0.0),
    1:  (2,   78,    0.1523),
    2:  (2,  120,    0.2344),
    3:  (2,  193,    0.3770),
    4:  (2,  308,    0.6016),
    5:  (2,  449,    0.8770),
    6:  (2,  602,    1.1758),
    7:  (4,  378,    1.4766),
    8:  (4,  490,    1.9141),
    9:  (4,  616,    2.4063),
    10: (6,  466,    2.7305),
    11: (6,  567,    3.3223),
    12: (6,  666,    3.9023),
    13: (6,  772,    4.5234),
    14: (6,  873,    5.1152),
    15: (6,  948,    5.5547),
}

def sinr_to_cqi(sinr_db: float, table: dict = CQI_TABLE) -> int:
    """
    AWGN 参考曲线近似：
      BLER(SINR, SE) ≈ Q( (SINR_lin - SE) / sqrt(2·SE) )  [Shannon 近似]
    选最大使 BLER <= 10% 的 CQI
    """
    sinr_lin = 10 ** (sinr_db / 10)
    best = 0
    for cqi, (mod, cr, se) in table.items():
        if se == 0:
            continue
        # Shannon gap 近似 BLER
        snr_needed = se  # 香农极限(线性)近似 ≈ 2^SE - 1，简化
        snr_needed_lin = 2 ** se - 1
        if sinr_lin >= snr_needed_lin * 1.5:   # 1.5 ≈ 约 1.7dB 实现损耗
            best = cqi
    return best

def sinr_to_bler(sinr_db: float, se: float) -> float:
    """简化 AWGN BLER 曲线（S 型）"""
    if se == 0:
        return 1.0
    snr_needed = 10 * np.log10(2 ** se - 1) + 2.5   # 加实现损耗
    slope = 1.2
    return 1 / (1 + np.exp(slope * (sinr_db - snr_needed)))

def mmse_sinr_per_layer(H: np.ndarray, noise_var: float) -> np.ndarray:
    """
    MMSE 检测器每层后检测 SINR
    SINR_k = [((H^H H + noise_var I)^{-1})_{kk}]^{-1} / noise_var - 1
    38.214 §5.2.2.2 推导
    """
    HH = H.conj().T @ H
    inv_term = np.linalg.inv(HH + noise_var * np.eye(HH.shape[0]))
    sinr = np.array([1 / (inv_term[k, k] * noise_var) - 1
                     for k in range(H.shape[1])])
    return np.maximum(sinr, 1e-6)

def rayleigh_channel(n_tx: int, n_rx: int) -> np.ndarray:
    return (np.random.randn(n_rx, n_tx) + 1j * np.random.randn(n_rx, n_tx)) / np.sqrt(2)

# ══════════════════════════════════════════════════════════
# 图 1：CSI-RS RE 时频占用可视化
# ══════════════════════════════════════════════════════════
def plot_csi_rs_resource_grid():
    fig, axes = plt.subplots(1, 3, figsize=(16, 7), facecolor=DARK_BG)
    fig.suptitle("CSI-RS 时频资源占用  (38.211 §7.4.1.5)",
                 fontsize=14, color=TEXT_CLR, y=1.01)

    configs = [
        {"label": "1 端口  ρ=1",  "ports": 1,  "density": 1,
         "re_positions": [(4, 8)], "color": ACC_BLUE},
        {"label": "4 端口  ρ=1",  "ports": 4,  "density": 1,
         "re_positions": [(4, 8), (4, 9), (7, 8), (7, 9)], "color": ACC_GREEN},
        {"label": "8 端口  ρ=1",  "ports": 8,  "density": 1,
         "re_positions": [(4,8),(4,9),(4,10),(4,11),(7,8),(7,9),(7,10),(7,11)],
         "color": ACC_AMBER},
    ]

    N_SC, N_SYM = 12, 14   # 1 RB × 1 slot

    for ax, cfg in zip(axes, configs):
        # DMRS 参考位置（Type 1，符号 #2 前载 + 符号 #11 尾载，仅供对比）
        for sym in [2, 11]:
            for sc in range(0, N_SC, 2):
                ax.add_patch(mpatches.Rectangle(
                    (sc - 0.5, sym - 0.5), 1, 1,
                    facecolor="#3d85c8", alpha=0.4, edgecolor=GRID_CLR, lw=0.5))

        # 背景格子
        for sym in range(N_SYM):
            for sc in range(N_SC):
                ax.add_patch(mpatches.Rectangle(
                    (sc - 0.5, sym - 0.5), 1, 1,
                    facecolor=GRID_CLR, alpha=0.15,
                    edgecolor=GRID_CLR, lw=0.5))

        # CSI-RS RE — 每个端口在配置的 (符号, 子载波) 精确位置
        port_colors = [ACC_BLUE, ACC_GREEN, ACC_AMBER, ACC_RED,
                       ACC_PURPLE, ACC_CYAN, "#ff9f43", "#a29bfe"]
        for idx, (sym, sc_off) in enumerate(cfg["re_positions"]):
            color = port_colors[idx % len(port_colors)]
            sc = sc_off % N_SC
            sym_mod = sym % N_SYM
            ax.add_patch(mpatches.Rectangle(
                (sc - 0.5, sym_mod - 0.5), 1, 1,
                facecolor=color, alpha=0.85,
                edgecolor=DARK_BG, lw=0.8))
            ax.text(sc, sym_mod, f"P{idx}",
                    ha="center", va="center",
                    fontsize=5.5, color=DARK_BG, fontweight="bold")

        ax.set_xlim(-0.5, N_SC - 0.5)
        ax.set_ylim(-0.5, N_SYM - 0.5)
        ax.set_xlabel("子载波索引 (1 RB = 12 SC)", fontsize=9)
        ax.set_ylabel("OFDM 符号索引 (1 slot = 14)", fontsize=9)
        ax.set_title(cfg["label"], color=cfg["color"], fontsize=11, pad=8)
        ax.set_xticks(range(N_SC)); ax.set_yticks(range(N_SYM))
        ax.tick_params(labelsize=7)
        ax.grid(False)

        info = (f"端口数: {cfg['ports']}\n"
                f"密度 ρ: {cfg['density']} RE/RB\n"
                f"时频占用: {len(cfg['re_positions'])} RE/slot")
        ax.text(0.97, 0.03, info, transform=ax.transAxes,
                fontsize=7.5, color=TEXT_CLR, va="bottom", ha="right",
                bbox=dict(facecolor=DARK_BG, alpha=0.7, edgecolor=GRID_CLR))

    fig.tight_layout(pad=1.5)
    path = OUT_DIR / "output_csi_rs_resource_grid.png"
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=DARK_BG)
    plt.show()
    print(f"[✓] {path.name}")

# ══════════════════════════════════════════════════════════
# 图 2：SINR → CQI 映射曲线 + 调制方案区域
# ══════════════════════════════════════════════════════════
def plot_sinr_cqi_mapping():
    sinr_range = np.linspace(-10, 35, 500)
    cqi_vals   = [sinr_to_cqi(s) for s in sinr_range]
    se_vals    = [CQI_TABLE[c][2] for c in cqi_vals]

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 9),
                                   facecolor=DARK_BG, sharex=True)
    fig.suptitle("SINR → CQI 映射与频谱效率  (38.214 §5.2.2.1 Table 5.2.1.3-1)",
                 fontsize=13, color=TEXT_CLR, y=1.01)

    # 调制方案背景区域
    regions = [
        (-10, 6.5,  "QPSK",   "#1f4e8c", "CQI 1-6"),
        (6.5, 14.5, "16QAM",  "#1a5c2e", "CQI 7-9"),
        (14.5, 35, "64QAM",   "#5c3a00", "CQI 10-15"),
    ]
    for x0, x1, label, color, cqi_range in regions:
        for ax in [ax1, ax2]:
            ax.axvspan(x0, x1, alpha=0.18, color=color, zorder=0)
        ax1.text((x0 + x1) / 2, 15.5, f"{label}\n{cqi_range}",
                 ha="center", va="bottom", fontsize=8.5, color=TEXT_CLR, alpha=0.9)

    # CQI 阶梯曲线
    ax1.step(sinr_range, cqi_vals, where="post", color=ACC_BLUE, lw=2.0, label="CQI（宽带）")
    ax1.set_ylabel("CQI 值", fontsize=10)
    ax1.set_ylim(-0.5, 16.5)
    ax1.set_yticks(range(0, 16))
    ax1.axhline(y=0, color=ACC_RED, lw=0.8, ls="--", alpha=0.6, label="CQI=0（停止调度）")
    ax1.legend(fontsize=9, loc="upper left")
    ax1.grid(True, axis="y")
    ax1.set_title("CQI 阶梯（AWGN 参考曲线）", fontsize=10, color=TEXT_CLR)

    # 频谱效率曲线
    ax2.step(sinr_range, se_vals, where="post", color=ACC_GREEN, lw=2.0, label="频谱效率 (bit/s/Hz)")
    se_shannon = np.log2(1 + 10 ** (sinr_range / 10))
    ax2.plot(sinr_range, se_shannon, color=TEXT_CLR, lw=1.2, ls="--", alpha=0.5, label="Shannon 极限")
    ax2.fill_between(sinr_range, se_vals, se_shannon, alpha=0.08, color=ACC_AMBER, label="实现损耗区域")
    ax2.set_xlabel("SINR (dB)", fontsize=10)
    ax2.set_ylabel("频谱效率 (bit/s/Hz)", fontsize=10)
    ax2.legend(fontsize=9, loc="upper left")
    ax2.grid(True)
    ax2.set_title("CQI 对应频谱效率 vs Shannon 极限", fontsize=10, color=TEXT_CLR)

    # 关键 SINR 标注
    for sinr_mark, label_text in [(-3, "CQI=1\n(-3dB)"), (10, "CQI=9\n(10dB)"), (25, "CQI=15\n(25dB)")]:
        cqi_m = sinr_to_cqi(sinr_mark)
        ax1.axvline(sinr_mark, color=TEXT_CLR, lw=0.8, ls=":", alpha=0.5)
        ax2.axvline(sinr_mark, color=TEXT_CLR, lw=0.8, ls=":", alpha=0.5)
        ax1.annotate(label_text, xy=(sinr_mark, cqi_m),
                     xytext=(sinr_mark + 0.8, cqi_m - 1.5),
                     fontsize=7, color=ACC_AMBER,
                     arrowprops=dict(arrowstyle="->", color=ACC_AMBER, lw=0.8))

    fig.tight_layout(pad=1.5)
    path = OUT_DIR / "output_csi_sinr_cqi_mapping.png"
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=DARK_BG)
    plt.show()
    print(f"[✓] {path.name}")

# ══════════════════════════════════════════════════════════
# 图 3：RI 选择 — 多层吞吐量对比（瑞利信道 Monte Carlo）
# ══════════════════════════════════════════════════════════
def plot_ri_selection():
    N_TRIAL = 500
    SNR_DB_LIST = np.arange(-5, 30, 2)
    N_TX, N_RX = 4, 4
    max_layers  = min(N_TX, N_RX)

    mean_se = {r: [] for r in range(1, max_layers + 1)}
    optimal_se = []

    for snr_db in SNR_DB_LIST:
        noise_var = 10 ** (-snr_db / 10) / N_TX
        se_by_layer = {r: [] for r in range(1, max_layers + 1)}

        for _ in range(N_TRIAL):
            H_full = rayleigh_channel(N_TX, N_RX)   # (N_RX, N_TX)
            # 使用 SVD 选最优 r 个奇异向量做预编码（理想 non-codebook）
            U, S, Vh = np.linalg.svd(H_full)
            for r in range(1, max_layers + 1):
                W = Vh[:r, :].conj().T           # (N_TX, r) precoder
                H_eff = H_full @ W               # (N_RX, r)
                sinr_layers = mmse_sinr_per_layer(H_eff, noise_var)
                se = sum(CQI_TABLE[sinr_to_cqi(10 * np.log10(s))][2]
                         for s in sinr_layers)
                se_by_layer[r].append(se)

        opt = []
        for trial_idx in range(N_TRIAL):
            opt.append(max(se_by_layer[r][trial_idx] for r in range(1, max_layers + 1)))
        optimal_se.append(np.mean(opt))

        for r in range(1, max_layers + 1):
            mean_se[r].append(np.mean(se_by_layer[r]))

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6), facecolor=DARK_BG)
    fig.suptitle("RI 选择：多层 MIMO 吞吐量对比  (4×4 瑞利信道, Monte Carlo)",
                 fontsize=13, color=TEXT_CLR)

    colors = [ACC_BLUE, ACC_GREEN, ACC_AMBER, ACC_RED]
    for r, color in zip(range(1, max_layers + 1), colors):
        ax1.plot(SNR_DB_LIST, mean_se[r], color=color, lw=2.0, marker="o",
                 markersize=4, label=f"r={r} 层（固定）")
    ax1.plot(SNR_DB_LIST, optimal_se, color=TEXT_CLR, lw=2.5, ls="--",
             marker="D", markersize=5, label="最优 RI（自适应）")
    ax1.set_xlabel("SNR (dB)", fontsize=10)
    ax1.set_ylabel("平均频谱效率 (bit/s/Hz)", fontsize=10)
    ax1.set_title("固定层数 vs 自适应 RI", fontsize=10, color=TEXT_CLR)
    ax1.legend(fontsize=9)
    ax1.grid(True)

    # 自适应 RI 的增益
    gain_vs_r1 = [opt - mean_se[1][i] for i, opt in enumerate(optimal_se)]
    ax2.bar(SNR_DB_LIST, gain_vs_r1, width=1.4, color=ACC_GREEN, alpha=0.8,
            label="vs 固定 r=1（单流）")
    ax2.set_xlabel("SNR (dB)", fontsize=10)
    ax2.set_ylabel("自适应 RI 增益 (bit/s/Hz)", fontsize=10)
    ax2.set_title("自适应 RI 相对固定单流的增益", fontsize=10, color=TEXT_CLR)
    ax2.legend(fontsize=9)
    ax2.grid(True, axis="y")

    # 注释最大增益点
    max_idx = int(np.argmax(gain_vs_r1))
    ax2.annotate(f"峰值增益\n{gain_vs_r1[max_idx]:.1f} bit/s/Hz\n@SNR={SNR_DB_LIST[max_idx]}dB",
                 xy=(SNR_DB_LIST[max_idx], gain_vs_r1[max_idx]),
                 xytext=(SNR_DB_LIST[max_idx] + 3, gain_vs_r1[max_idx] - 0.8),
                 fontsize=8, color=ACC_AMBER,
                 arrowprops=dict(arrowstyle="->", color=ACC_AMBER))

    fig.tight_layout(pad=1.5)
    path = OUT_DIR / "output_csi_ri_selection.png"
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=DARK_BG)
    plt.show()
    print(f"[✓] {path.name}")

# ══════════════════════════════════════════════════════════
# 图 4：AMC 闭环仿真（内环 CQI + 外环 OLLA）
# ══════════════════════════════════════════════════════════
def plot_amc_closed_loop():
    N_SLOTS = 400
    TARGET_BLER = 0.10
    SNR_DB = 12.0   # 固定 SINR（CQI 测量值）
    OLLA_STEP_UP   = 0.1   # ACK → offset +0.1 dB
    OLLA_STEP_DOWN = 0.9   # NACK → offset -0.9 dB（非对称，加速降低）

    np.random.seed(7)

    results = {}
    for scenario, sinr_noise_std in [("理想（无噪声）", 0.0), ("噪声（σ=2dB）", 2.0)]:
        offset  = 0.0
        cqi_log = []
        mcs_se_log = []
        bler_log = []
        nack_log = []
        offset_log = []

        for slot in range(N_SLOTS):
            # 带测量噪声的 SINR（模拟 CQI 估计误差）
            sinr_measured = SNR_DB + np.random.normal(0, sinr_noise_std)
            cqi = sinr_to_cqi(sinr_measured + offset)
            cqi = max(1, min(15, cqi))
            _, _, se = CQI_TABLE[cqi]

            # 实际 SINR（真值，不含噪声）
            bler = sinr_to_bler(SNR_DB, se)
            nack = np.random.rand() < bler

            # OLLA 更新
            if nack:
                offset -= OLLA_STEP_DOWN
            else:
                offset += OLLA_STEP_UP

            cqi_log.append(cqi)
            mcs_se_log.append(se)
            bler_log.append(bler)
            nack_log.append(int(nack))
            offset_log.append(offset)

        results[scenario] = {
            "cqi": cqi_log, "se": mcs_se_log,
            "bler": bler_log, "nack": nack_log, "offset": offset_log
        }

    fig = plt.figure(figsize=(16, 10), facecolor=DARK_BG)
    gs  = GridSpec(3, 2, figure=fig, hspace=0.45, wspace=0.3)
    fig.suptitle("AMC 闭环仿真：CQI → MCS → BLER → OLLA  (SNR=12dB)",
                 fontsize=13, color=TEXT_CLR)

    colors = {"理想（无噪声）": ACC_BLUE, "噪声（σ=2dB）": ACC_AMBER}
    slots = np.arange(N_SLOTS)

    for col, (scenario, data) in enumerate(results.items()):
        color = colors[scenario]

        # CQI 轨迹
        ax_cqi = fig.add_subplot(gs[0, col])
        ax_cqi.plot(slots, data["cqi"], color=color, lw=1.0, alpha=0.8)
        ax_cqi.axhline(y=np.mean(data["cqi"]), color=TEXT_CLR, lw=1.5,
                       ls="--", label=f"均值={np.mean(data['cqi']):.1f}")
        ax_cqi.set_title(scenario, color=color, fontsize=10)
        ax_cqi.set_ylabel("CQI", fontsize=9)
        ax_cqi.set_ylim(0, 16)
        ax_cqi.legend(fontsize=8)
        ax_cqi.grid(True)

        # OLLA 偏移量
        ax_off = fig.add_subplot(gs[1, col])
        ax_off.plot(slots, data["offset"], color=ACC_GREEN, lw=1.0, alpha=0.9)
        ax_off.axhline(0, color=GRID_CLR, lw=0.8)
        ax_off.set_ylabel("OLLA 偏移量 (dB)", fontsize=9)
        ax_off.grid(True)

        # 滑动窗口 BLER
        ax_bler = fig.add_subplot(gs[2, col])
        win = 30
        nack_arr = np.array(data["nack"], dtype=float)
        rolling_bler = np.convolve(nack_arr, np.ones(win) / win, mode="valid")
        ax_bler.plot(slots[win - 1:], rolling_bler * 100, color=ACC_RED, lw=1.2)
        ax_bler.axhline(TARGET_BLER * 100, color=ACC_AMBER, lw=1.5, ls="--",
                        label=f"目标 BLER={TARGET_BLER*100:.0f}%")
        ax_bler.set_ylabel("滑动 BLER (%)", fontsize=9)
        ax_bler.set_xlabel("Slot 编号", fontsize=9)
        ax_bler.set_ylim(0, 45)
        ax_bler.legend(fontsize=8)
        ax_bler.grid(True)

    path = OUT_DIR / "output_csi_amc_closed_loop.png"
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=DARK_BG)
    plt.show()
    print(f"[✓] {path.name}")

# ══════════════════════════════════════════════════════════
# 图 5：信道老化 — 不同上报周期对 AMC 性能的影响
# ══════════════════════════════════════════════════════════
def plot_channel_aging():
    """
    模拟多普勒引起的信道时变（Clarke 模型近似）：
      h(t+Δt) ≈ h(t)·J_0(2π·f_d·Δt) + noise
    CQI 测量时刻 vs PDSCH 调度时刻的 SINR 差异
    """
    fc    = 3.5e9         # 载波频率
    v_ms  = 30 / 3.6     # 30 km/h
    fd    = v_ms * fc / 3e8  # 多普勒频移
    Tc    = 1 / (4 * fd)     # 信道相干时间（近似）
    Ts    = 0.5e-3            # slot 时长（μ=1, 0.5ms）

    reporting_periods_slots = [5, 10, 20, 40, 80]   # 上报周期（slot 数）

    np.random.seed(3)
    N_ITER = 2000
    snr_db = 12.0
    noise_var = 10 ** (-snr_db / 10)

    results = {}
    for period in reporting_periods_slots:
        delay_s = period * Ts    # CQI 测量到调度的最大时延
        # 时延期间的信道时变（Clark：相关系数近似 J_0(2π fd τ)）
        import scipy.special
        rho = scipy.special.j0(2 * np.pi * fd * delay_s)

        sinr_gaps = []
        for _ in range(N_ITER):
            # 测量时刻信道
            h_meas = (np.random.randn() + 1j * np.random.randn()) / np.sqrt(2)
            sinr_meas_db = 10 * np.log10(abs(h_meas) ** 2 / noise_var)

            # 调度时刻信道（有老化）
            h_sched = rho * h_meas + np.sqrt(1 - rho**2) * \
                      (np.random.randn() + 1j * np.random.randn()) / np.sqrt(2)
            sinr_sched_db = 10 * np.log10(abs(h_sched) ** 2 / noise_var)

            sinr_gaps.append(sinr_meas_db - sinr_sched_db)

        results[period] = {
            "gaps": sinr_gaps,
            "mean_gap": np.mean(sinr_gaps),
            "rho": rho,
        }

    fig, axes = plt.subplots(1, 2, figsize=(15, 6), facecolor=DARK_BG)
    fig.suptitle(f"信道老化对 CQI 精度的影响  (v=30km/h, fc=3.5GHz, fd={fd:.1f}Hz, Tc={Tc*1000:.1f}ms)",
                 fontsize=12, color=TEXT_CLR)

    # 左图：相关系数 vs 上报周期
    ax = axes[0]
    periods_ms = [p * Ts * 1000 for p in reporting_periods_slots]
    rhos = [results[p]["rho"] for p in reporting_periods_slots]
    bars = ax.bar(range(len(reporting_periods_slots)), rhos,
                  color=[ACC_GREEN if r > 0.9 else ACC_AMBER if r > 0.7 else ACC_RED
                         for r in rhos],
                  alpha=0.85, edgecolor=DARK_BG)
    ax.set_xticks(range(len(reporting_periods_slots)))
    ax.set_xticklabels([f"{p}sl\n({ms:.1f}ms)" for p, ms in
                        zip(reporting_periods_slots, periods_ms)], fontsize=8)
    ax.axhline(0.9, color=ACC_GREEN, lw=1.5, ls="--", label="ρ=0.9（CQI 可信）")
    ax.axhline(0.7, color=ACC_AMBER, lw=1.5, ls="--", label="ρ=0.7（开始失效）")
    ax.set_ylabel("信道相关系数 ρ", fontsize=10)
    ax.set_xlabel("CSI 上报周期（slots / ms）", fontsize=10)
    ax.set_title("上报周期 → 信道相关性", fontsize=10, color=TEXT_CLR)
    ax.set_ylim(0, 1.1)
    ax.legend(fontsize=9)
    ax.grid(True, axis="y")

    for bar, r in zip(bars, rhos):
        ax.text(bar.get_x() + bar.get_width() / 2, r + 0.02,
                f"ρ={r:.3f}", ha="center", va="bottom", fontsize=7.5, color=TEXT_CLR)

    # 右图：SINR 偏差分布（箱线图）
    ax2 = axes[1]
    data_list = [results[p]["gaps"] for p in reporting_periods_slots]
    bp = ax2.boxplot(data_list, patch_artist=True, notch=False,
                     medianprops=dict(color=DARK_BG, lw=2),
                     whiskerprops=dict(color=TEXT_CLR),
                     capprops=dict(color=TEXT_CLR),
                     flierprops=dict(marker=".", color=ACC_RED, alpha=0.3, markersize=2))

    colors_box = [ACC_GREEN if rhos[i] > 0.9 else ACC_AMBER if rhos[i] > 0.7 else ACC_RED
                  for i in range(len(reporting_periods_slots))]
    for patch, color in zip(bp["boxes"], colors_box):
        patch.set_facecolor(color)
        patch.set_alpha(0.7)

    ax2.axhline(0, color=TEXT_CLR, lw=1.0, ls="--", alpha=0.6, label="无老化偏差")
    ax2.set_xticks(range(1, len(reporting_periods_slots) + 1))
    ax2.set_xticklabels([f"{p}sl\n({p*Ts*1000:.1f}ms)" for p in reporting_periods_slots], fontsize=8)
    ax2.set_ylabel("CQI 测量 SINR 偏差 (dB)\n（正值 = CQI 过于乐观）", fontsize=9)
    ax2.set_xlabel("CSI 上报周期（slots / ms）", fontsize=10)
    ax2.set_title("CQI 老化引起的 SINR 估计偏差分布", fontsize=10, color=TEXT_CLR)
    ax2.legend(fontsize=9)
    ax2.grid(True, axis="y")

    # NTN 注释
    ax2.annotate("NTN LEO 需配置\nreportSlotOffset-r17\n覆盖 RTT",
                 xy=(5, np.mean(results[80]["gaps"])),
                 xytext=(3.5, 12),
                 fontsize=8, color=ACC_RED,
                 arrowprops=dict(arrowstyle="->", color=ACC_RED))

    fig.tight_layout(pad=1.5)
    path = OUT_DIR / "output_csi_channel_aging.png"
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=DARK_BG)
    plt.show()
    print(f"[✓] {path.name}")

# ══════════════════════════════════════════════════════════
# 主程序
# ══════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("=" * 54)
    print("  5G NR CSI 框架仿真  (38.211/38.214)")
    print("=" * 54)
    plot_csi_rs_resource_grid()
    plot_sinr_cqi_mapping()
    plot_ri_selection()
    plot_amc_closed_loop()
    plot_channel_aging()
    print("\n所有图表已输出至:", OUT_DIR)
