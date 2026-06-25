#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
si_paging_sim.py
═══════════════════════════════════════════════════════════════════════════════
5G NR 系统消息与寻呼仿真 —— SIB 调度 + Paging (PF/PO/DRX)

验证目标（对应 docs/phase3/si-paging.md）:
  1. PF/PO 负荷分布：一群 UE 按 5G-S-TMSI 散布到寻呼时机 (Paging Occasion) 上
  2. 寻呼容量：地面小区 vs NTN 大波束，每 PO 的寻呼记录数 vs maxNrofPageRec=32 上限
  3. 寻呼时延 vs DRX 周期：地面 / LEO / GEO —— DRX 周期主导，传播仅次要叠加
  4. SI 调度时序：MIB / SIB1 / SI-window 的周期层级（示意）

3GPP 溯源:
  - TS 38.304 §7.1   IDLE/INACTIVE 下寻呼 PF/PO 计算
  - TS 38.331 §5.2   System Information（SIB 分类、SI 调度、on-demand SI、SI 变更）
  - TS 38.331 §5.2.2.3.2  SI-window 的 SFN/slot 起点公式
  - TS 38.331 PCCH-Config / maxNrofPageRec(=32)
  - TS 38.300 §9.2.5  寻呼总体描述
  - TR 38.821 §6/§7  NTN：SIB19 星历、大波束寻呼、moving cell

说明:
  本脚本为"系统级"模型，关注 PF/PO 公式的统计行为与容量/时延量级，
  非比特级仿真。可调参数集中在 CONFIG 区。

输出 (PNG 落本脚本同目录):
  output_paging_po_loadmap.png   PF/PO 负荷分布直方图
  output_paging_capacity.png     寻呼容量：地面 vs NTN 大波束
  output_paging_latency_drx.png  寻呼时延 vs DRX 周期（地面/LEO/GEO）
  output_si_scheduling.png       SI 调度时序（MIB/SIB1/SI-window）
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.patches import FancyBboxPatch


# ─────────────────────────────────────────────────────────────────────────────
# 中文字体自动探测（同 phase3 其余脚本）
# ─────────────────────────────────────────────────────────────────────────────
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

# ─── 暗色主题（项目统一）───
DARK_BG, PANEL_BG, GRID_CLR = "#0d1117", "#161b22", "#30363d"
TXT_CLR, SUBTXT = "#c9d1d9", "#8b949e"
C_BRAND = "#58a6ff"   # 蓝（主）
C_NTN   = "#d29922"   # 琥珀（NTN）
C_WARN  = "#f85149"   # 红（超限/告警）
C_OK    = "#3fb950"   # 绿
C_PURP  = "#a371f7"   # 紫

plt.rcParams.update({
    "figure.facecolor": DARK_BG, "axes.facecolor": PANEL_BG,
    "axes.edgecolor": GRID_CLR, "axes.labelcolor": TXT_CLR, "text.color": TXT_CLR,
    "xtick.color": SUBTXT, "ytick.color": SUBTXT, "grid.color": GRID_CLR,
    "font.family": _CJK, "axes.unicode_minus": False, "font.size": 10,
    "axes.titlesize": 12, "axes.titleweight": "bold",
    "figure.titlesize": 14, "figure.titleweight": "bold",
})

HERE = os.path.dirname(os.path.abspath(__file__))


# ═════════════════════════════════════════════════════════════════════════════
# CONFIG
# ═════════════════════════════════════════════════════════════════════════════
CONFIG = {
    # ── 寻呼 DRX 参数（38.304 §7.1）──
    "T_frames": 128,    # DRX 周期（radio frames）∈ {32,64,128,256}；128 帧 = 1.28 s
    "nB": 32,           # PCCH-Config 的 nB（以帧计）。这里 nB=T/4 → N=32, Ns=1
    "PF_offset": 0,     # PF 偏移

    # ── PF/PO 负荷分布 ──
    "pop_loadmap": 4000,   # 负荷分布图的 UE 总数

    # ── 寻呼容量（每 PO 的寻呼记录数）──
    "pop_terrestrial": 3000,    # 地面宏小区驻留 UE 数（示意）
    "pop_ntn_beam":    120000,  # NTN LEO 大波束覆盖 UE 数（覆盖面积大，IoT 海量）
    "paging_rate":     0.04,    # 每 DRX 周期被寻呼的 UE 比例（busy-hour 示意）
    "maxNrofPageRec":  32,      # 单寻呼消息最大记录数（3GPP 固定上限）

    # ── 寻呼时延 vs DRX ──
    "T_list_frames": [32, 64, 128, 256],   # 320 / 640 / 1280 / 2560 ms
    "frame_ms": 10,
    "owd_terrestrial_ms": 0.5,
    "owd_leo_ms": 5.0,
    "owd_geo_ms": 239.0,
    "proc_ms": 3.0,

    # ── SI 调度时序（示意）──
    "ssb_period_ms": 20,     # SSB(含 MIB) 周期
    "sib1_period_ms": 160,   # SIB1 周期（TB），通常 20ms 内可重复
    "si_msgs": [             # (名称, si-Periodicity ms, SI-window 起点 ms, 是否广播)
        ("SI#1 (SIB2/3/4)", 160, 40, True),
        ("SI#2 (SIB5)",     320, 80, True),
        ("SI#3 (SIB19·NTN)", 160, 120, True),
    ],
    "si_window_ms": 20,      # SI-window 长度（示意）
    "timeline_ms": 640,      # 时序图总时长
}


# ── PF/PO 计算（38.304 §7.1）───────────────────────────────────────────────────
def derive_N_Ns(T, nB):
    """N = min(T, nB)；Ns = max(1, nB//T)。"""
    N = min(T, nB)
    Ns = max(1, nB // T)
    return N, Ns


def pf_po(ue_id, T, nB, pf_offset=0):
    """
    返回 (pf_residue, i_s)：
      PF: (SFN + PF_offset) mod T = (T/N)*(UE_ID mod N)  → pf_residue = 该 SFN mod T
      i_s = floor(UE_ID/N) mod Ns
    UE_ID = 5G-S-TMSI mod 1024
    """
    uid = ue_id % 1024
    N, Ns = derive_N_Ns(T, nB)
    pf_residue = ((T // N) * (uid % N) - pf_offset) % T
    i_s = (uid // N) % Ns
    return pf_residue, i_s, N, Ns


# ═════════════════════════════════════════════════════════════════════════════
# 模块 1：PF/PO 负荷分布
# ═════════════════════════════════════════════════════════════════════════════
def plot_po_loadmap():
    T, nB, off = CONFIG["T_frames"], CONFIG["nB"], CONFIG["PF_offset"]
    N, Ns = derive_N_Ns(T, nB)
    n_occ = N * Ns
    rng = np.random.default_rng(2024)
    tmsis = rng.integers(0, 2**20, size=CONFIG["pop_loadmap"])

    occ_idx = np.zeros(CONFIG["pop_loadmap"], dtype=int)
    for i, t in enumerate(tmsis):
        pf, is_, _, _ = pf_po(int(t), T, nB, off)
        pf_group = pf // (T // N)          # 0..N-1
        occ_idx[i] = pf_group * Ns + is_   # 0..N*Ns-1

    counts = np.bincount(occ_idx, minlength=n_occ)

    fig, ax = plt.subplots(figsize=(12, 4.8))
    fig.suptitle(f"PF/PO 负荷分布：{CONFIG['pop_loadmap']} 个 UE 按 5G-S-TMSI 散布到 "
                 f"{n_occ} 个寻呼时机（T={T}帧, nB={nB} → N={N}, Ns={Ns}）",
                 color=TXT_CLR, fontsize=12)

    ax.bar(np.arange(n_occ), counts, color=C_BRAND, alpha=0.85, width=0.9, zorder=3)
    mean = counts.mean()
    ax.axhline(mean, color=C_NTN, ls="--", lw=1.6,
               label=f"均值 ≈ {mean:.0f} UE/时机 (= 总数/{n_occ})")
    ax.set_xlabel("寻呼时机索引 (Paging Occasion index)  →")
    ax.set_ylabel("落入该时机的 UE 数")
    ax.set_xlim(-1, n_occ)
    ax.legend(loc="upper right", framealpha=0.9, facecolor=PANEL_BG, edgecolor=GRID_CLR)
    ax.grid(axis="y", ls=":", alpha=0.3)

    ax.text(0.012, 0.92,
            "UE_ID = 5G-S-TMSI mod 1024 决定落点 → 近似均匀散布\n"
            "同一时机的 UE 被同一条寻呼消息一起寻呼",
            transform=ax.transAxes, fontsize=8.5, color=SUBTXT, va="top",
            bbox=dict(boxstyle="round,pad=0.4", fc=PANEL_BG, ec=GRID_CLR))

    fig.tight_layout(rect=(0, 0, 1, 0.93))
    out = os.path.join(HERE, "output_paging_po_loadmap.png")
    fig.savefig(out, dpi=130, facecolor=DARK_BG)
    plt.close(fig)
    print(f"  [1/4] PF/PO 负荷分布 → {os.path.basename(out)}  (均值 {mean:.1f} UE/时机)")


# ═════════════════════════════════════════════════════════════════════════════
# 模块 2：寻呼容量（地面 vs NTN 大波束）
# ═════════════════════════════════════════════════════════════════════════════
def plot_paging_capacity():
    T, nB = CONFIG["T_frames"], CONFIG["nB"]
    N, Ns = derive_N_Ns(T, nB)
    n_occ = N * Ns
    rate = CONFIG["paging_rate"]
    cap = CONFIG["maxNrofPageRec"]

    scenes = [("地面宏小区", CONFIG["pop_terrestrial"], C_OK),
              ("NTN LEO 大波束", CONFIG["pop_ntn_beam"], C_NTN)]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.5, 4.8))
    fig.suptitle("寻呼容量：NTN 大波束聚合海量 UE → 每 PO 寻呼记录逼近/超出上限",
                 color=TXT_CLR)

    # 左：每 PO 的订阅 UE 数 & 期望寻呼记录数
    names = [s[0] for s in scenes]
    subs_per_po = [s[1] / n_occ for s in scenes]
    recs_per_po = [sp * rate for sp in subs_per_po]
    clrs = [s[2] for s in scenes]

    x = np.arange(len(scenes))
    w = 0.36
    b1 = ax1.bar(x - w/2, subs_per_po, w, color=clrs, alpha=0.5,
                 label="订阅 UE 数 / PO", zorder=3)
    b2 = ax1.bar(x + w/2, recs_per_po, w, color=clrs, alpha=0.95,
                 label=f"期望寻呼记录 / PO (rate={rate:.0%})", zorder=3)
    ax1.axhline(cap, color=C_WARN, ls="--", lw=2,
                label=f"maxNrofPageRec = {cap}")
    for b, v in zip(b1, subs_per_po):
        ax1.text(b.get_x()+b.get_width()/2, v, f"{v:.0f}", ha="center",
                 va="bottom", fontsize=9, color=TXT_CLR)
    for b, v in zip(b2, recs_per_po):
        over = v > cap
        ax1.text(b.get_x()+b.get_width()/2, v, f"{v:.0f}", ha="center",
                 va="bottom", fontsize=10, fontweight="bold",
                 color=C_WARN if over else TXT_CLR)
    ax1.set_yscale("log")
    ax1.set_xticks(x); ax1.set_xticklabels(names)
    ax1.set_ylabel("数量 / PO（对数轴）")
    ax1.set_title("① 每 PO 负荷 vs 上限")
    ax1.legend(loc="upper left", fontsize=8, framealpha=0.9,
               facecolor=PANEL_BG, edgecolor=GRID_CLR)
    ax1.grid(axis="y", ls=":", alpha=0.3, which="both")

    # 右：溢出导致的额外寻呼时延（需顺延到后续周期）
    T_ms = T * CONFIG["frame_ms"]
    extra_cycles = [max(0, int(np.ceil(r / cap)) - 1) for r in recs_per_po]
    extra_delay = [c * T_ms for c in extra_cycles]
    b3 = ax2.bar(names, extra_delay, color=clrs, alpha=0.95, zorder=3)
    for b, v, c in zip(b3, extra_delay, extra_cycles):
        ax2.text(b.get_x()+b.get_width()/2, v, f"+{v} ms\n({c} 周期顺延)",
                 ha="center", va="bottom", fontsize=9, fontweight="bold", color=TXT_CLR)
    ax2.set_ylabel("溢出导致的额外寻呼时延 (ms)")
    ax2.set_title(f"② 记录溢出 → 顺延后续周期 (T={T_ms} ms)")
    ax2.set_ylim(0, max(extra_delay) * 1.3 + 50)
    ax2.grid(axis="y", ls=":", alpha=0.3)

    fig.tight_layout(rect=(0, 0, 1, 0.94))
    out = os.path.join(HERE, "output_paging_capacity.png")
    fig.savefig(out, dpi=130, facecolor=DARK_BG)
    plt.close(fig)
    print(f"  [2/4] 寻呼容量 → {os.path.basename(out)}")
    print(f"        地面 {recs_per_po[0]:.1f} 记录/PO，NTN {recs_per_po[1]:.1f} 记录/PO "
          f"(上限 {cap})")


# ═════════════════════════════════════════════════════════════════════════════
# 模块 3：寻呼时延 vs DRX 周期
# ═════════════════════════════════════════════════════════════════════════════
def plot_paging_latency_drx():
    """
    平均寻呼时延 ≈ DRX 半周期等待 + 下行单程传播 + 处理。
    核心结论：DRX 周期(数百ms~数秒)主导时延；NTN 传播仅次要叠加——
    与 3.1 连接建立(RTT 主导)恰成对比。
    """
    Tf = np.array(CONFIG["T_list_frames"])
    Tms = Tf * CONFIG["frame_ms"]
    mean_wait = Tms / 2.0   # 平均等到下一个 PO

    scenes = [("地面", CONFIG["owd_terrestrial_ms"], C_OK, "o"),
              ("LEO 550km", CONFIG["owd_leo_ms"], C_BRAND, "s"),
              ("GEO 35786km", CONFIG["owd_geo_ms"], C_NTN, "^")]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 4.9),
                                   gridspec_kw={"width_ratios": [1.4, 1]})
    fig.suptitle("寻呼时延 = DRX 半周期等待 + 单程传播：DRX 周期是主旋钮",
                 color=TXT_CLR, fontsize=12.5)

    for name, owd, clr, mk in scenes:
        lat = mean_wait + owd + CONFIG["proc_ms"]
        ax1.plot(Tms, lat, color=clr, lw=2.3, marker=mk, ms=7,
                 label=f"{name} (单程 {owd:.1f} ms)", zorder=3)
    ax1.set_xlabel("DRX 周期 T (ms)")
    ax1.set_ylabel("平均寻呼时延 (ms)")
    ax1.set_title("① 时延随 DRX 周期线性增长")
    ax1.set_xticks(Tms)
    ax1.legend(loc="upper left", framealpha=0.9, facecolor=PANEL_BG, edgecolor=GRID_CLR)
    ax1.grid(ls=":", alpha=0.3)
    ax1.text(0.97, 0.05,
             "LEO 传播(5ms)始终可忽略；GEO(239ms)在短 DRX 时显著、\n"
             "长 DRX 时退居次要。长 DRX 省电 ↔ 低时延：不可兼得。",
             transform=ax1.transAxes, fontsize=8.3, color=SUBTXT, ha="right", va="bottom",
             bbox=dict(boxstyle="round,pad=0.4", fc=PANEL_BG, ec=GRID_CLR))

    # 右：在最长 DRX 下，分解 等待 vs 传播
    T_max_ms = Tms[-1]
    wait = T_max_ms / 2
    comps_names = [s[0] for s in scenes]
    owds = [s[1] for s in scenes]
    clrs = [s[2] for s in scenes]
    waits = [wait] * len(scenes)
    ax2.bar(comps_names, waits, color=SUBTXT, alpha=0.5, label="DRX 半周期等待", zorder=3)
    ax2.bar(comps_names, owds, bottom=waits, color=clrs, alpha=0.95,
            label="下行单程传播", zorder=4)
    for i, (w_, o_) in enumerate(zip(waits, owds)):
        ax2.text(i, w_ + o_, f"+{o_:.0f}ms", ha="center", va="bottom",
                 fontsize=8.5, color=clrs[i], fontweight="bold")
    ax2.axhline(wait, color=SUBTXT, ls=":", lw=1)
    ax2.set_ylabel("时延分解 (ms)")
    ax2.set_title(f"② T={int(T_max_ms)}ms 下的时延构成")
    ax2.legend(loc="upper left", fontsize=8, framealpha=0.9,
               facecolor=PANEL_BG, edgecolor=GRID_CLR)
    ax2.grid(axis="y", ls=":", alpha=0.3)

    fig.tight_layout(rect=(0, 0, 1, 0.93))
    out = os.path.join(HERE, "output_paging_latency_drx.png")
    fig.savefig(out, dpi=130, facecolor=DARK_BG)
    plt.close(fig)
    print(f"  [3/4] 寻呼时延 vs DRX → {os.path.basename(out)}")
    print(f"        T={int(T_max_ms)}ms: 等待 {wait:.0f}ms 主导；GEO 传播仅 +{owds[-1]:.0f}ms")


# ═════════════════════════════════════════════════════════════════════════════
# 模块 4：SI 调度时序（示意）
# ═════════════════════════════════════════════════════════════════════════════
def plot_si_scheduling():
    Ttl = CONFIG["timeline_ms"]
    fig, ax = plt.subplots(figsize=(13, 5))
    fig.suptitle("SI 调度时序：MIB → SIB1 → SI-window 的周期层级（示意）", color=TXT_CLR)

    rows = []  # (label, color, [(start,dur)...])
    # MIB（在 SSB 内）
    ssb = CONFIG["ssb_period_ms"]
    rows.append(("MIB (PBCH/SSB)", C_PURP,
                 [(t, 3) for t in range(0, Ttl, ssb)]))
    # SIB1
    s1 = CONFIG["sib1_period_ms"]
    rows.append(("SIB1 (RMSI, PDSCH)", C_BRAND,
                 [(t, 8) for t in range(0, Ttl, s1)]))
    # 其它 SI 消息
    for name, per, off, _bc in CONFIG["si_msgs"]:
        clr = C_NTN if "NTN" in name else C_OK
        wins = [(t + off, CONFIG["si_window_ms"]) for t in range(0, Ttl, per)
                if t + off < Ttl]
        rows.append((name, clr, wins))

    yh = 0.62
    for i, (label, clr, segs) in enumerate(rows):
        y = len(rows) - 1 - i
        for (x0, dur) in segs:
            box = FancyBboxPatch((x0, y + (1-yh)/2), dur, yh,
                                 boxstyle="round,pad=0.01,rounding_size=0.05",
                                 linewidth=0.8, edgecolor=clr, facecolor=clr,
                                 alpha=0.85, zorder=3)
            ax.add_patch(box)
        ax.text(-8, y + 0.5, label, ha="right", va="center", fontsize=9.5,
                color=clr, fontweight="bold")

    # 标注 worst-case SI 获取链路：MIB → SIB1 → SI#3 窗口
    ax.annotate("", xy=(120, len(rows)-1-4 + 0.5), xytext=(0, len(rows)-1-0 + 0.5),
                arrowprops=dict(arrowstyle="->", color=TXT_CLR, lw=1.4,
                                connectionstyle="arc3,rad=-0.2"))
    ax.text(60, len(rows)-0.15, "获取链路：先 MIB→定位 SIB1→读 si-SchedulingInfo→等 SI-window",
            ha="center", fontsize=8.5, color=TXT_CLR, style="italic")

    ax.set_xlim(-130, Ttl + 5)
    ax.set_ylim(-0.3, len(rows) + 0.3)
    ax.set_xlabel("时间 (ms) →")
    ax.set_yticks([])
    for sp in ["left", "right", "top"]:
        ax.spines[sp].set_visible(False)
    ax.grid(axis="x", ls=":", alpha=0.25)
    # 周期标注
    for t in range(0, Ttl + 1, 160):
        ax.axvline(t, color=GRID_CLR, ls=":", lw=0.7, zorder=1)
        ax.text(t, -0.25, f"{t}", ha="center", va="top", fontsize=7, color=SUBTXT)

    fig.tight_layout(rect=(0, 0, 1, 0.94))
    out = os.path.join(HERE, "output_si_scheduling.png")
    fig.savefig(out, dpi=130, facecolor=DARK_BG)
    plt.close(fig)
    print(f"  [4/4] SI 调度时序 → {os.path.basename(out)}")


# ═════════════════════════════════════════════════════════════════════════════
def main():
    print("═" * 70)
    print("  5G NR 系统消息与寻呼仿真  (SIB / Paging / PF-PO / DRX)")
    print("═" * 70)
    plot_po_loadmap()
    plot_paging_capacity()
    plot_paging_latency_drx()
    plot_si_scheduling()
    print("═" * 70)
    print("  完成 ✅  4 张 PNG 已输出至脚本同目录")
    print("═" * 70)


if __name__ == "__main__":
    main()
