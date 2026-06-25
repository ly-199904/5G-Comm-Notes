#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ca_sim.py
═══════════════════════════════════════════════════════════════════════════════
5G NR 载波聚合 (Carrier Aggregation, CA) 仿真

验证目标（对应 docs/phase3/carrier-aggregation.md）:
  1. 吞吐随 CC 数线性扩展：用 38.306 峰值速率公式量化 CA 的核心收益
  2. 聚合频谱三类型：带内连续 / 带内非连续 / 带间
  3. SCell 状态与激活：去激活 / 休眠(Rel-16) / 激活 的时延与功耗权衡
  4. NTN 差分时延：不同卫星/波束的 CC 间传播差，为何破坏单 TAG 的 CA

3GPP 溯源:
  - TS 38.306 §4.1.2  UE 峰值数据率公式（按 CC 求和）
  - TS 38.300 §9.2.4  载波聚合总体（PCell/SCell）
  - TS 38.331 SCellConfig / crossCarrierSchedulingConfig
  - TS 38.321 §5.9    SCell 激活/去激活 MAC CE
  - TS 38.133         SCell 激活时延要求
  - TR 38.821 §7      NTN：差分时延、TAG 与 CA 的挑战

说明:
  峰值速率为公式上界（理想），SCell 时延/功耗为代表性示意值。参数集中在 CONFIG。

输出 (PNG 落本脚本同目录):
  output_ca_throughput.png    吞吐随 CC 数扩展
  output_ca_spectrum.png      聚合频谱三类型
  output_ca_scell_state.png   SCell 状态/激活时延/功耗
  output_ca_ntn_delay.png     NTN CC 间差分时延
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.patches import FancyBboxPatch


def _setup_cjk_font():
    candidates = ["Noto Sans CJK SC", "Noto Sans CJK JP", "WenQuanYi Zen Hei",
                  "Microsoft YaHei", "SimHei", "PingFang SC", "Heiti SC",
                  "Source Han Sans SC", "Source Han Sans CN", "Arial Unicode MS"]
    available = {f.name for f in fm.fontManager.ttflist}
    for name in candidates:
        if name in available:
            return name
    print("  ⚠️  未找到 CJK 字体，中文可能显示为方块。请安装 fonts-noto-cjk。")
    return "DejaVu Sans"


_CJK = _setup_cjk_font()

DARK_BG, PANEL_BG, GRID_CLR = "#0d1117", "#161b22", "#30363d"
TXT_CLR, SUBTXT = "#c9d1d9", "#8b949e"
C_PCELL = "#3fb950"   # PCell 绿
C_SCELL = "#58a6ff"   # SCell 蓝
C_NTN   = "#d29922"   # NTN 琥珀
C_WARN  = "#f85149"   # 告警红
C_DORM  = "#a371f7"   # 休眠紫
C_OFF   = "#6e7681"   # 去激活灰

plt.rcParams.update({
    "figure.facecolor": DARK_BG, "axes.facecolor": PANEL_BG,
    "axes.edgecolor": GRID_CLR, "axes.labelcolor": TXT_CLR, "text.color": TXT_CLR,
    "xtick.color": SUBTXT, "ytick.color": SUBTXT, "grid.color": GRID_CLR,
    "font.family": _CJK, "axes.unicode_minus": False, "font.size": 10,
    "axes.titlesize": 12, "axes.titleweight": "bold",
    "figure.titlesize": 14, "figure.titleweight": "bold",
})

HERE = os.path.dirname(os.path.abspath(__file__))

CONFIG = {
    # ── 峰值速率公式参数（38.306 §4.1.2）──
    "R_max": 948 / 1024,
    "OH_FR1_DL": 0.14,
    "OH_FR2_DL": 0.18,
    "fr1_nprb": 273, "fr1_mu": 1, "fr1_layers": 4, "fr1_Qm": 8, "fr1_bw": 100,
    "fr2_nprb": 264, "fr2_mu": 3, "fr2_layers": 2, "fr2_Qm": 6, "fr2_bw": 400,
    "max_cc": 8,
    "f_scaling": 1.0,

    # ── SCell 状态时延/功耗（示意，38.133/38.321）──
    "lat_deact_to_active": 30.0,
    "lat_dorm_to_active": 3.0,
    "pwr_pcell": 1.0,
    "pwr_add_deact": 0.05,
    "pwr_add_dorm": 0.35,
    "pwr_add_active": 1.0,

    # ── NTN 差分时延 ──
    "Re_km": 6371.0,
    "h_leo_km": 550.0,
    "c_kms": 299792.458,   # km/s
    "cp_budget_us": 4.7,   # 普通 CP 量级，作单 TAG 容差参考
}


def slant_range_km(h, elev_deg, Re):
    """球面几何斜距：d = sqrt(Re^2 sin^2θ + 2 Re h + h^2) - Re sinθ"""
    th = np.radians(elev_deg)
    return np.sqrt((Re * np.sin(th))**2 + 2 * Re * h + h**2) - Re * np.sin(th)


# ═════════════════════════════════════════════════════════════════════════════
# 模块 1：吞吐随 CC 数扩展（38.306 §4.1.2）
# ═════════════════════════════════════════════════════════════════════════════
def cc_rate_bps(nprb, mu, layers, Qm, f, OH):
    """单 CC 峰值速率 (bps)：layers·Qm·f·Rmax·(nPRB·12/Ts)·(1-OH)，Ts=1e-3/(14·2^μ)"""
    Ts = 1e-3 / (14 * 2**mu)
    return layers * Qm * f * CONFIG["R_max"] * (nprb * 12 / Ts) * (1 - OH)


def plot_throughput():
    cc = np.arange(1, CONFIG["max_cc"] + 1)
    r1 = cc_rate_bps(CONFIG["fr1_nprb"], CONFIG["fr1_mu"], CONFIG["fr1_layers"],
                     CONFIG["fr1_Qm"], CONFIG["f_scaling"], CONFIG["OH_FR1_DL"])
    r2 = cc_rate_bps(CONFIG["fr2_nprb"], CONFIG["fr2_mu"], CONFIG["fr2_layers"],
                     CONFIG["fr2_Qm"], CONFIG["f_scaling"], CONFIG["OH_FR2_DL"])
    g1 = cc * r1 / 1e9
    g2 = cc * r2 / 1e9

    fig, ax = plt.subplots(figsize=(11.5, 5))
    fig.suptitle("载波聚合吞吐：峰值速率随 CC 数线性扩展（38.306 §4.1.2）", color=TXT_CLR)

    ax.plot(cc, g1, color=C_SCELL, lw=2.4, marker="o", ms=7,
            label=f"FR1: {CONFIG['fr1_bw']}MHz/CC, {CONFIG['fr1_layers']} 层, 256QAM "
                  f"(每 CC ≈ {r1/1e9:.2f} Gbps)")
    ax.plot(cc, g2, color=C_NTN, lw=2.4, marker="s", ms=7,
            label=f"FR2: {CONFIG['fr2_bw']}MHz/CC, {CONFIG['fr2_layers']} 层, 64QAM "
                  f"(每 CC ≈ {r2/1e9:.2f} Gbps)")

    for i, c in enumerate(cc):
        if c in (1, 4, 8):
            ax.annotate(f"{g1[i]:.1f} Gbps\n({c*CONFIG['fr1_bw']}MHz)",
                        (c, g1[i]), textcoords="offset points", xytext=(0, 10),
                        ha="center", fontsize=8, color=C_SCELL)

    ax.set_xlabel("聚合的 CC 数 (Component Carriers)")
    ax.set_ylabel("峰值下行速率 (Gbps)")
    ax.set_xticks(cc)
    ax.set_xlim(0.6, CONFIG["max_cc"] + 0.4)
    ax.legend(loc="upper left", framealpha=0.9, facecolor=PANEL_BG, edgecolor=GRID_CLR)
    ax.grid(ls=":", alpha=0.3)
    ax.text(0.985, 0.05,
            "速率 = Σ_CC (层数·Qm·f·Rmax·N_PRB·12/Ts·(1-OH))\n"
            "CA 把吞吐对 CC 数做线性叠加（NR 最多 16 CC）",
            transform=ax.transAxes, fontsize=8.5, color=SUBTXT, ha="right", va="bottom",
            bbox=dict(boxstyle="round,pad=0.4", fc=PANEL_BG, ec=GRID_CLR))

    fig.tight_layout(rect=(0, 0, 1, 0.94))
    out = os.path.join(HERE, "output_ca_throughput.png")
    fig.savefig(out, dpi=130, facecolor=DARK_BG)
    plt.close(fig)
    print(f"  [1/4] 吞吐扩展 → {os.path.basename(out)}  "
          f"(FR1 8CC ≈ {g1[-1]:.1f} Gbps, FR2 8CC ≈ {g2[-1]:.1f} Gbps)")


# ═════════════════════════════════════════════════════════════════════════════
# 模块 2：聚合频谱三类型
# ═════════════════════════════════════════════════════════════════════════════
def _band_axis(ax, bands):
    for x0, x1, name, clr in bands:
        ax.plot([x0, x1], [0.08, 0.08], color=clr, lw=3, alpha=0.5, solid_capstyle="butt")
        ax.text((x0 + x1) / 2, 0.0, name, ha="center", va="top", fontsize=7.5, color=clr)


def plot_spectrum():
    fig, axes = plt.subplots(3, 1, figsize=(12, 6.4))
    fig.suptitle("聚合频谱三类型：CC 在频域的排布方式", color=TXT_CLR)

    def draw_cc(ax, x0, w, label, color):
        ax.add_patch(FancyBboxPatch((x0, 0.25), w, 0.5,
                     boxstyle="round,pad=0.005,rounding_size=0.02",
                     linewidth=1.4, edgecolor=color, facecolor=color, alpha=0.8))
        ax.text(x0 + w / 2, 0.5, label, ha="center", va="center",
                fontsize=9.5, fontweight="bold", color="#0d1117")

    ax = axes[0]
    ax.set_title("① 带内连续 (Intra-band Contiguous)：同一频段，CC 紧邻", loc="left", fontsize=11)
    draw_cc(ax, 0, 1, "PCell\n100MHz", C_PCELL)
    draw_cc(ax, 1, 1, "SCell1\n100MHz", C_SCELL)
    draw_cc(ax, 2, 1, "SCell2\n100MHz", C_SCELL)
    ax.text(1.5, -0.16, "n78 频段内，3×100MHz 连续 = 300MHz 聚合带宽",
            ha="center", fontsize=8.5, color=SUBTXT)
    ax.set_xlim(-0.3, 3.8); _band_axis(ax, [(0, 3, "n78", C_SCELL)])

    ax = axes[1]
    ax.set_title("② 带内非连续 (Intra-band Non-contiguous)：同频段但有间隙", loc="left", fontsize=11)
    draw_cc(ax, 0, 1, "PCell\n100MHz", C_PCELL)
    draw_cc(ax, 2.2, 1, "SCell1\n100MHz", C_SCELL)
    ax.text(1.6, 0.5, "间隙\n(被其他用户/系统占用)", ha="center", va="center",
            fontsize=8, color=SUBTXT, style="italic")
    ax.set_xlim(-0.3, 3.8); _band_axis(ax, [(0, 3.2, "n77", C_SCELL)])

    ax = axes[2]
    ax.set_title("③ 带间 (Inter-band)：跨不同频段聚合", loc="left", fontsize=11)
    draw_cc(ax, 0, 1, "PCell\nn78", C_PCELL)
    draw_cc(ax, 2.2, 0.8, "SCell1\nn258(FR2)", C_NTN)
    ax.set_xlim(-0.3, 3.8)
    _band_axis(ax, [(0, 1, "FR1 n78", C_SCELL), (2.2, 3.0, "FR2 n258", C_NTN)])
    ax.text(1.55, 0.5, "FR1+FR2\n覆盖+容量互补", ha="center", va="center",
            fontsize=8, color=SUBTXT, style="italic")

    for ax in axes:
        ax.set_ylim(-0.4, 1.0)
        ax.set_yticks([]); ax.set_xticks([])
        for sp in ["left", "right", "top"]:
            ax.spines[sp].set_visible(False)

    fig.tight_layout(rect=(0, 0, 1, 0.94))
    out = os.path.join(HERE, "output_ca_spectrum.png")
    fig.savefig(out, dpi=130, facecolor=DARK_BG)
    plt.close(fig)
    print(f"  [2/4] 聚合频谱三类型 → {os.path.basename(out)}")


# ═════════════════════════════════════════════════════════════════════════════
# 模块 3：SCell 状态 / 激活时延 / 功耗
# ═════════════════════════════════════════════════════════════════════════════
def plot_scell_state():
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.5, 5))
    fig.suptitle("SCell 状态管理：休眠态(Rel-16)在'省电'与'快激活'间架桥", color=TXT_CLR)

    names = ["去激活→激活\n(冷启,需取 CSI)", "休眠→激活\n(CSI 已新鲜)"]
    lats = [CONFIG["lat_deact_to_active"], CONFIG["lat_dorm_to_active"]]
    clrs = [C_OFF, C_DORM]
    b = ax1.bar(names, lats, color=clrs, alpha=0.9, edgecolor=clrs, linewidth=1.5, zorder=3)
    for bb, v in zip(b, lats):
        ax1.text(bb.get_x() + bb.get_width()/2, v, f"{v:.0f} ms", ha="center",
                 va="bottom", fontsize=12, fontweight="bold", color=TXT_CLR)
    ax1.set_ylabel("激活时延 (ms)")
    ax1.set_title("① 激活时延对比")
    ax1.set_ylim(0, max(lats) * 1.28)
    ax1.grid(axis="y", ls=":", alpha=0.3)
    speedup = CONFIG["lat_deact_to_active"] / CONFIG["lat_dorm_to_active"]
    ax1.text(0.5, 0.78, f"休眠态激活快 ≈ {speedup:.0f}×", transform=ax1.transAxes,
             ha="center", fontsize=10, color=C_DORM, fontweight="bold",
             bbox=dict(boxstyle="round,pad=0.4", fc=PANEL_BG, ec=C_DORM))

    states = ["仅 PCell", "+去激活\nSCell", "+休眠\nSCell", "+激活\nSCell"]
    pwr = [CONFIG["pwr_pcell"],
           CONFIG["pwr_pcell"] + CONFIG["pwr_add_deact"],
           CONFIG["pwr_pcell"] + CONFIG["pwr_add_dorm"],
           CONFIG["pwr_pcell"] + CONFIG["pwr_add_active"]]
    pclrs = [C_PCELL, C_OFF, C_DORM, C_SCELL]
    b2 = ax2.bar(states, pwr, color=pclrs, alpha=0.9, edgecolor=pclrs, linewidth=1.5, zorder=3)
    for bb, v in zip(b2, pwr):
        ax2.text(bb.get_x()+bb.get_width()/2, v, f"{v:.2f}", ha="center",
                 va="bottom", fontsize=10.5, fontweight="bold", color=TXT_CLR)
    ax2.set_ylabel("相对功耗 (PCell=1.0)")
    ax2.set_title("② UE 相对功耗")
    ax2.set_ylim(0, max(pwr) * 1.2)
    ax2.grid(axis="y", ls=":", alpha=0.3)
    ax2.text(0.5, 0.88, "休眠 = 维持 CSI 不监听 PDCCH\n功耗居中、激活极快",
             transform=ax2.transAxes, ha="center", fontsize=8.5, color=SUBTXT,
             bbox=dict(boxstyle="round,pad=0.4", fc=PANEL_BG, ec=GRID_CLR))

    fig.tight_layout(rect=(0, 0, 1, 0.93))
    out = os.path.join(HERE, "output_ca_scell_state.png")
    fig.savefig(out, dpi=130, facecolor=DARK_BG)
    plt.close(fig)
    print(f"  [3/4] SCell 状态 → {os.path.basename(out)}")


# ═════════════════════════════════════════════════════════════════════════════
# 模块 4：NTN CC 间差分时延
# ═════════════════════════════════════════════════════════════════════════════
def plot_ntn_delay():
    Re, h = CONFIG["Re_km"], CONFIG["h_leo_km"]
    c = CONFIG["c_kms"]
    elev2 = np.linspace(10, 90, 200)

    d1 = slant_range_km(h, 90.0, Re)
    d2 = slant_range_km(h, elev2, Re)
    diff_ms = np.abs(d1 - d2) / c * 1e3
    diff_us = diff_ms * 1e3

    fig, ax = plt.subplots(figsize=(11.5, 5))
    fig.suptitle("NTN 差分时延：不同仰角的 CC 间传播差 → 破坏单 TAG 的 CA",
                 color=TXT_CLR, fontsize=12.5)

    ax.plot(elev2, diff_us, color=C_NTN, lw=2.6, zorder=3,
            label="CC 间差分单程时延 |d1-d2|/c（CC1 在天顶 90°）")
    ax.fill_between(elev2, 1e-3, diff_us, color=C_NTN, alpha=0.12)

    cp = CONFIG["cp_budget_us"]
    ax.axhline(cp, color=C_WARN, ls="--", lw=2,
               label=f"单 TAG 容差参考 ≈ {cp} μs（普通 CP 量级）")
    idx = np.argmin(np.abs(diff_us - cp))
    ax.annotate(f"仰角 ≈ {elev2[idx]:.0f}° 处差分已达 CP 量级\n更低仰角须分置不同 sTAG",
                (elev2[idx], cp), textcoords="offset points", xytext=(20, 70),
                fontsize=8.5, color=C_WARN,
                arrowprops=dict(arrowstyle="->", color=C_WARN, lw=1.3))

    ax.set_xlabel("CC2 卫星/波束仰角 (°)")
    ax.set_ylabel("差分单程时延 (μs)")
    ax.set_yscale("log")
    ax.set_xlim(90, 10)   # 低仰角(差分大)在右侧
    ax.legend(loc="upper left", framealpha=0.9, facecolor=PANEL_BG, edgecolor=GRID_CLR)
    ax.grid(ls=":", alpha=0.3, which="both")
    ax.text(0.985, 0.05,
            "地面 CA：CC 同站,差分≈0,单 TAG 即可\n"
            "NTN CA：CC 若来自不同卫星/仰角,差分可达数百μs~ms,\n"
            "远超 CP → 必须多 TAG,Rel-17 不优先支持 NTN CA",
            transform=ax.transAxes, fontsize=8.3, color=SUBTXT, ha="right", va="bottom",
            bbox=dict(boxstyle="round,pad=0.4", fc=PANEL_BG, ec=GRID_CLR))

    fig.tight_layout(rect=(0, 0, 1, 0.93))
    out = os.path.join(HERE, "output_ca_ntn_delay.png")
    fig.savefig(out, dpi=130, facecolor=DARK_BG)
    plt.close(fig)
    print(f"  [4/4] NTN 差分时延 → {os.path.basename(out)}")
    print(f"        CC2@10° 时差分 ≈ {diff_us[0]:.0f} μs（CP≈{cp}μs，约 {diff_us[0]/cp:.0f}×）")


def main():
    print("═" * 70)
    print("  5G NR 载波聚合仿真  (Carrier Aggregation)")
    print("═" * 70)
    plot_throughput()
    plot_spectrum()
    plot_scell_state()
    plot_ntn_delay()
    print("═" * 70)
    print("  完成 ✅  4 张 PNG 已输出至脚本同目录")
    print("═" * 70)


if __name__ == "__main__":
    main()
