#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rrc_state_machine_sim.py
═══════════════════════════════════════════════════════════════════════════════
5G NR RRC 状态机仿真 —— IDLE / INACTIVE / CONNECTED 三态

验证目标（对应 docs/phase3/rrc-state-machine.md）:
  1. RRC 状态生命周期时序：IDLE→CONNECTED→INACTIVE→CONNECTED 的状态/信令甘特图
  2. 信令开销对比：初始建立 (RRCSetup) vs 恢复 (RRCResume) vs SDT 的消息数与字节数
  3. NTN 时延标度：同一过程在 地面 / LEO / GEO 下的挂钟时延（按 RTT 标度）
  4. SDT 累积收益：突发小数据场景下，IDLE-only vs INACTIVE+SDT 的累积信令负荷

3GPP 溯源:
  - TS 38.331 §5.3.3  RRC connection establishment (RRCSetup)
  - TS 38.331 §5.3.13 RRC connection resume    (RRCResume)
  - TS 38.331 §5.3.8  RRC connection release   (RRCRelease / suspendConfig)
  - TS 38.300 §9.2.2  RRC states & state transitions
  - TS 38.300 §16.x   Small Data Transmission (SDT, Rel-17)
  - TR 38.821 §7      NTN connection management & 时延分析

说明:
  本脚本是"过程级 (procedure-level)"模型，关注空口往返次数 (round trips) 与
  消息数量级的对比，而非比特级精确。所有可调参数集中在 CONFIG 区，便于复现实验。

输出 (PNG 落本脚本同目录):
  output_rrc_state_timeline.png   状态生命周期甘特图
  output_rrc_signaling_cost.png   信令开销对比 (消息数 + 字节)
  output_rrc_latency_ntn.png      地面/LEO/GEO 挂钟时延对比
  output_rrc_sdt_benefit.png      突发小数据累积信令负荷
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")  # 无显示环境后端，确保可在 CI / 服务器运行
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.patches import FancyBboxPatch


# ─────────────────────────────────────────────────────────────────────────────
# 中文字体自动探测：在常见 CJK 字体中选第一个可用的，避免标签变成"豆腐块"□□□
#   若都不可用，请安装其一：
#     Ubuntu/Debian: sudo apt-get install fonts-noto-cjk
#     macOS 自带:    "PingFang SC" / "Heiti SC"
#     Windows 自带:  "Microsoft YaHei" / "SimHei"
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

# ─────────────────────────────────────────────────────────────────────────────
# 暗色主题（与项目统一）
# ─────────────────────────────────────────────────────────────────────────────
DARK_BG   = "#0d1117"   # GitHub dark 背景
PANEL_BG  = "#161b22"   # 面板/坐标区背景
GRID_CLR  = "#30363d"   # 网格线
TXT_CLR   = "#c9d1d9"   # 主文字
SUBTXT    = "#8b949e"   # 次文字
# 三态配色
C_IDLE    = "#6e7681"   # IDLE   —— 灰（最省电、无上下文）
C_INACT   = "#d29922"   # INACTIVE —— 琥珀（中间态，存上下文）
C_CONN    = "#3fb950"   # CONNECTED —— 绿（活跃传输）
# 强调色
C_SETUP   = "#f85149"   # 建立链路（高开销）—— 红
C_RESUME  = "#58a6ff"   # 恢复链路（低开销）—— 蓝
C_SDT     = "#a371f7"   # SDT（最低开销）—— 紫

plt.rcParams.update({
    "figure.facecolor":  DARK_BG,
    "axes.facecolor":    PANEL_BG,
    "axes.edgecolor":    GRID_CLR,
    "axes.labelcolor":   TXT_CLR,
    "text.color":        TXT_CLR,
    "xtick.color":       SUBTXT,
    "ytick.color":       SUBTXT,
    "grid.color":        GRID_CLR,
    "font.family":       _CJK,          # 中文字体
    "axes.unicode_minus": False,        # 负号正常显示（避免 CJK 字体下的方块）
    "font.size":         10,
    "axes.titlesize":    12,
    "axes.titleweight":  "bold",
    "figure.titlesize":  14,
    "figure.titleweight":"bold",
})

HERE = os.path.dirname(os.path.abspath(__file__))


# ═════════════════════════════════════════════════════════════════════════════
# CONFIG —— 全部可调实验参数集中于此
# ═════════════════════════════════════════════════════════════════════════════
CONFIG = {
    # ── 过程级"空口往返次数" (round trips, RT) ──
    # 解释：从触发到"用户数据可流动"所需的 UE↔网络 空口往返。
    # Xn 上下文取回 / N2 信令属网络内部，不计入空口 RT（但会在文档中说明）。
    "rt_setup":  4,   # IDLE→CONNECTED: RACH(2) + 安全模式(1) + RRCReconfig 建 DRB(1)
    "rt_resume": 2,   # INACTIVE→CONNECTED: RACH(2)；安全与承载由存储上下文恢复，省去 2 RT
    "rt_sdt":    1,   # INACTIVE 态 SDT(Rel-17): 数据随 Msg3/MsgA 上行，约 1 RT

    # ── 各过程的代表性信令消息数（空口，UE 视角）──
    "msgs_setup":  ["MSG1 PRACH", "MSG2 RAR", "MSG3 RRCSetupRequest",
                    "MSG4 RRCSetup", "RRCSetupComplete(+NAS)",
                    "SecurityModeCommand", "SecurityModeComplete",
                    "RRCReconfiguration", "RRCReconfigurationComplete"],
    "msgs_resume": ["MSG1 PRACH", "MSG2 RAR", "MSG3 RRCResumeRequest",
                    "MSG4 RRCResume", "RRCResumeComplete"],
    "msgs_sdt":    ["MSG1 PRACH", "MSG2 RAR", "MSG3 RRCResumeRequest+DATA"],

    # ── 代表性消息字节数（数量级，仅用于对比可视化）──
    "bytes_setup":  240,   # 含 NAS Registration/Service Request + 安全 + 重配
    "bytes_resume": 90,    # resumeIdentity + resumeMAC-I + 短 NAS
    "bytes_sdt":    60,    # 恢复请求 + 小数据载荷

    # ── 固定处理时延（gNB+UE，单程外的常量），单位 ms ──
    "proc_ms": 3.0,

    # ── 三种部署的"空口单程传播时延" (one-way)，单位 ms ──
    # RTT = 2 × one_way。取值为 38.821 量级的代表值（服务链路为主），可自行调整。
    "owd_terrestrial_ms": 0.5,    # 地面宏蜂窝 ~150m–几 km
    "owd_leo_ms":         5.0,    # LEO 550km，中等仰角，服务链路代表值
    "owd_geo_ms":         239.0,  # GEO 35786km，近天顶代表值

    # ── SDT 累积场景：突发小数据 ──
    "n_bursts":        50,    # 一段时间内的小数据到达次数（如 IoT 心跳 / 遥测）
    "inactive_hold":   True,  # INACTIVE 是否能在突发间隙保持上下文（典型 IoT 间隔 < RNAU 周期）
}


# ═════════════════════════════════════════════════════════════════════════════
# 模块 1：RRC 状态生命周期时序（甘特图）
# ═════════════════════════════════════════════════════════════════════════════
def plot_state_timeline():
    """
    画一台 UE 的典型生命周期：
      IDLE → [RRCSetup] → CONNECTED → [RRCRelease+suspend] → INACTIVE
           → [RRCResume] → CONNECTED → [RRCRelease] → IDLE
    上轨：状态条带；下轨：触发该转换的关键信令事件。
    时间为示意（非真实尺度），用于建立直觉。
    """
    # (状态, 起点ms, 时长ms, 颜色)
    states = [
        ("RRC_IDLE",      0,   8,  C_IDLE),
        ("RRC_CONNECTED", 8,   14, C_CONN),
        ("RRC_INACTIVE",  22,  16, C_INACT),
        ("RRC_CONNECTED", 38,  10, C_CONN),
        ("RRC_IDLE",      48,  8,  C_IDLE),
    ]
    # (时刻ms, 文本, 颜色, 上/下错位)
    events = [
        (8,  "RRCSetup\n(建立: 4 RT)",          C_SETUP,  +1),
        (22, "RRCRelease\n+ suspendConfig\n(存 AS 上下文→I-RNTI)", C_INACT, -1),
        (38, "RRCResume\n(恢复: 2 RT)",          C_RESUME, +1),
        (48, "RRCRelease\n(释放上下文)",          C_IDLE,   -1),
    ]
    # INACTIVE 期间的周期性 RNAU 标记
    rnau_marks = [28, 34]

    fig, ax = plt.subplots(figsize=(12, 4.6))
    fig.suptitle("RRC 状态生命周期：IDLE / INACTIVE / CONNECTED 三态转换",
                 color=TXT_CLR)

    y_state = 1.0
    bar_h = 0.5
    for name, x0, dur, clr in states:
        box = FancyBboxPatch((x0, y_state), dur, bar_h,
                             boxstyle="round,pad=0.02,rounding_size=0.08",
                             linewidth=1.2, edgecolor=clr,
                             facecolor=clr, alpha=0.85, zorder=3)
        ax.add_patch(box)
        ax.text(x0 + dur / 2, y_state + bar_h / 2, name,
                ha="center", va="center", fontsize=9.5, fontweight="bold",
                color="#0d1117" if clr != C_IDLE else "#e6edf3", zorder=4)

    # RNAU 周期性更新（停留 INACTIVE）
    for t in rnau_marks:
        ax.plot([t, t], [y_state, y_state + bar_h], color="#0d1117",
                lw=1.0, ls=":", zorder=5)
        ax.text(t, y_state + bar_h + 0.06, "RNAU", ha="center", va="bottom",
                fontsize=7, color=SUBTXT, rotation=0)

    # 事件信令（带引线）
    for t, txt, clr, side in events:
        y_txt = y_state + (0.95 if side > 0 else -0.75)
        ax.annotate(txt, xy=(t, y_state + (bar_h if side > 0 else 0)),
                    xytext=(t, y_txt), ha="center",
                    va="bottom" if side > 0 else "top",
                    fontsize=8, color=clr, fontweight="bold",
                    arrowprops=dict(arrowstyle="->", color=clr, lw=1.3))

    # 说明：上下文存储状态
    ax.text(15, 0.35, "上下文：网络保留(N2/NGAP 连接)", fontsize=7.5,
            color=SUBTXT, ha="center", style="italic")
    ax.text(30, 0.35, "上下文：UE+anchor gNB 双侧存储", fontsize=7.5,
            color=C_INACT, ha="center", style="italic")
    ax.text(4, 0.35, "无上下文", fontsize=7.5, color=SUBTXT,
            ha="center", style="italic")
    ax.text(52, 0.35, "无上下文", fontsize=7.5, color=SUBTXT,
            ha="center", style="italic")

    ax.set_xlim(-1, 57)
    ax.set_ylim(0, 2.4)
    ax.set_xlabel("时间（示意，非真实尺度）→")
    ax.set_yticks([])
    for spine in ["left", "right", "top"]:
        ax.spines[spine].set_visible(False)
    ax.grid(axis="x", ls=":", alpha=0.25)

    fig.tight_layout(rect=(0, 0, 1, 0.95))
    out = os.path.join(HERE, "output_rrc_state_timeline.png")
    fig.savefig(out, dpi=130, facecolor=DARK_BG)
    plt.close(fig)
    print(f"  [1/4] 状态生命周期甘特图 → {os.path.basename(out)}")


# ═════════════════════════════════════════════════════════════════════════════
# 模块 2：信令开销对比（消息数 + 字节）
# ═════════════════════════════════════════════════════════════════════════════
def plot_signaling_cost():
    """
    并排对比三种"恢复数据传输"的路径：
      建立 (从 IDLE) / 恢复 (从 INACTIVE) / SDT (停在 INACTIVE)
    左：空口消息数；右：信令字节数（数量级）。
    """
    labels = ["IDLE→CONN\n(RRCSetup)", "INACTIVE→CONN\n(RRCResume)",
              "INACTIVE+SDT\n(Rel-17)"]
    n_msgs = [len(CONFIG["msgs_setup"]), len(CONFIG["msgs_resume"]),
              len(CONFIG["msgs_sdt"])]
    n_bytes = [CONFIG["bytes_setup"], CONFIG["bytes_resume"],
               CONFIG["bytes_sdt"]]
    colors = [C_SETUP, C_RESUME, C_SDT]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.8))
    fig.suptitle("信令开销对比：为什么需要 RRC_INACTIVE", color=TXT_CLR)

    # 左：消息数
    bars1 = ax1.bar(labels, n_msgs, color=colors, alpha=0.9,
                    edgecolor=[c for c in colors], linewidth=1.5, zorder=3)
    for b, v in zip(bars1, n_msgs):
        ax1.text(b.get_x() + b.get_width() / 2, v + 0.15, f"{v}",
                 ha="center", va="bottom", fontweight="bold",
                 color=TXT_CLR, fontsize=12)
    ax1.set_ylabel("空口信令消息数（条）")
    ax1.set_title("① 信令消息数")
    ax1.set_ylim(0, max(n_msgs) + 1.5)
    ax1.grid(axis="y", ls=":", alpha=0.3)

    # 节省标注
    ax1.annotate("", xy=(1, n_msgs[1]), xytext=(0, n_msgs[0]),
                 arrowprops=dict(arrowstyle="<->", color=SUBTXT, lw=1.0, ls="--"))
    ax1.text(0.62, n_msgs[0] - 0.2,
             f"省 {n_msgs[0]-n_msgs[1]} 条\n(安全+重配)",
             ha="left", va="top", fontsize=8.5, color=C_RESUME,
             bbox=dict(boxstyle="round,pad=0.25", fc=PANEL_BG,
                       ec=C_RESUME, lw=0.8, alpha=0.95))

    # 右：字节数
    bars2 = ax2.bar(labels, n_bytes, color=colors, alpha=0.9,
                    edgecolor=[c for c in colors], linewidth=1.5, zorder=3)
    for b, v in zip(bars2, n_bytes):
        ax2.text(b.get_x() + b.get_width() / 2, v + 4, f"~{v} B",
                 ha="center", va="bottom", fontweight="bold",
                 color=TXT_CLR, fontsize=11)
    ax2.set_ylabel("信令字节数（数量级，B）")
    ax2.set_title("② 信令字节数")
    ax2.set_ylim(0, max(n_bytes) + 45)
    ax2.grid(axis="y", ls=":", alpha=0.3)

    fig.tight_layout(rect=(0, 0, 1, 0.94))
    out = os.path.join(HERE, "output_rrc_signaling_cost.png")
    fig.savefig(out, dpi=130, facecolor=DARK_BG)
    plt.close(fig)
    print(f"  [2/4] 信令开销对比 → {os.path.basename(out)}")
    return n_msgs, n_bytes


# ═════════════════════════════════════════════════════════════════════════════
# 模块 3：NTN 时延标度（地面 / LEO / GEO）
# ═════════════════════════════════════════════════════════════════════════════
def latency_ms(rt_count, owd_ms):
    """挂钟时延 ≈ 往返次数 × RTT + 固定处理时延。RTT = 2 × 单程。"""
    rtt = 2.0 * owd_ms
    return rt_count * rtt + CONFIG["proc_ms"]


def plot_latency_ntn():
    """
    同一组过程 (Setup/Resume/SDT) 在三种部署下的挂钟时延。
    核心结论：地面下"消息数差异"主导；NTN 下"每省一个往返 = 省一个 RTT"，
    INACTIVE/SDT 的挂钟收益随 RTT 线性放大。
    """
    scenarios = [
        ("地面",  CONFIG["owd_terrestrial_ms"]),
        ("LEO 550km", CONFIG["owd_leo_ms"]),
        ("GEO 35786km", CONFIG["owd_geo_ms"]),
    ]
    procs = [("建立 (4 RT)", CONFIG["rt_setup"], C_SETUP),
             ("恢复 (2 RT)", CONFIG["rt_resume"], C_RESUME),
             ("SDT (1 RT)",  CONFIG["rt_sdt"], C_SDT)]

    fig, axes = plt.subplots(1, 3, figsize=(13.5, 4.8))
    fig.suptitle("NTN 时延标度：往返次数 × RTT —— INACTIVE/SDT 的收益随 RTT 放大",
                 color=TXT_CLR)

    for ax, (sc_name, owd) in zip(axes, scenarios):
        names = [p[0] for p in procs]
        vals = [latency_ms(p[1], owd) for p in procs]
        clrs = [p[2] for p in procs]
        bars = ax.bar(names, vals, color=clrs, alpha=0.9,
                      edgecolor=clrs, linewidth=1.5, zorder=3)
        for b, v in zip(bars, vals):
            label = f"{v:.0f} ms" if v >= 10 else f"{v:.1f} ms"
            ax.text(b.get_x() + b.get_width() / 2, v + max(vals) * 0.02,
                    label, ha="center", va="bottom", fontweight="bold",
                    color=TXT_CLR, fontsize=9)
        ax.set_title(f"{sc_name}  (RTT={2*owd:.0f} ms)" if 2*owd >= 1
                     else f"{sc_name}  (RTT={2*owd:.1f} ms)")
        ax.set_ylabel("挂钟时延 (ms)")
        ax.tick_params(axis="x", labelrotation=12)
        ax.grid(axis="y", ls=":", alpha=0.3)
        # 节省量标注（建立 vs SDT）
        save = vals[0] - vals[2]
        ax.text(0.5, 0.92, f"建立→SDT 省 {save:.0f} ms",
                transform=ax.transAxes, ha="center", fontsize=8.5,
                color=C_SDT, fontweight="bold",
                bbox=dict(boxstyle="round,pad=0.3", fc=PANEL_BG, ec=C_SDT, lw=1))

    fig.tight_layout(rect=(0, 0, 1, 0.93))
    out = os.path.join(HERE, "output_rrc_latency_ntn.png")
    fig.savefig(out, dpi=130, facecolor=DARK_BG)
    plt.close(fig)
    print(f"  [3/4] NTN 时延标度 → {os.path.basename(out)}")

    # 终端报告
    print("\n  ── NTN 时延标度报告（挂钟，ms）──")
    print(f"  {'场景':<14}{'RTT':>8}{'建立':>10}{'恢复':>10}{'SDT':>10}")
    for sc_name, owd in scenarios:
        print(f"  {sc_name:<14}{2*owd:>7.0f}ms"
              f"{latency_ms(CONFIG['rt_setup'], owd):>9.0f}"
              f"{latency_ms(CONFIG['rt_resume'], owd):>10.0f}"
              f"{latency_ms(CONFIG['rt_sdt'], owd):>10.0f}")


# ═════════════════════════════════════════════════════════════════════════════
# 模块 4：SDT 累积收益（突发小数据）
# ═════════════════════════════════════════════════════════════════════════════
def plot_sdt_benefit():
    """
    突发小数据场景（IoT 心跳 / NTN 遥测）：n 次小数据到达。
      策略 A (IDLE-only): 每次到达 → 完整 RRCSetup + 传输 + RRCRelease
      策略 B (INACTIVE+SDT): 首次 RRCSetup 进 CONNECTED→转 INACTIVE，
                            此后每次到达走 SDT（停在 INACTIVE）
    比较累积空口信令消息数随到达次数的增长。
    """
    n = CONFIG["n_bursts"]
    x = np.arange(1, n + 1)

    m_setup = len(CONFIG["msgs_setup"])   # 每次完整建立的消息数
    m_rel = 1                             # RRCRelease（示意计 1 条）
    m_sdt = len(CONFIG["msgs_sdt"])       # 每次 SDT 的消息数

    # A: IDLE-only —— 每次 (建立 + 释放)
    cum_idle = np.cumsum(np.full(n, m_setup + m_rel))

    # B: INACTIVE+SDT —— 首次完整建立并转 INACTIVE，其后每次 SDT
    per_event_b = np.full(n, m_sdt, dtype=float)
    per_event_b[0] = m_setup + 1   # 首次：建立 + suspend(RRCRelease+suspendConfig)
    cum_inact = np.cumsum(per_event_b)

    fig, ax = plt.subplots(figsize=(11.5, 5.2))
    fig.suptitle("突发小数据：INACTIVE+SDT 的累积信令收益（IoT / NTN 遥测）",
                 color=TXT_CLR)

    ax.plot(x, cum_idle, color=C_SETUP, lw=2.4, marker="o", ms=3,
            label=f"IDLE-only：每次 RRCSetup+Release ({m_setup+m_rel} 条/次)",
            zorder=3)
    ax.plot(x, cum_inact, color=C_SDT, lw=2.4, marker="s", ms=3,
            label=f"INACTIVE+SDT：首次建立后每次 SDT ({m_sdt} 条/次)",
            zorder=3)
    ax.fill_between(x, cum_inact, cum_idle, color=C_SDT, alpha=0.12, zorder=2)

    # 终值标注
    ax.text(n, cum_idle[-1], f"  {int(cum_idle[-1])} 条",
            color=C_SETUP, va="center", fontweight="bold", fontsize=10)
    ax.text(n, cum_inact[-1], f"  {int(cum_inact[-1])} 条",
            color=C_SDT, va="center", fontweight="bold", fontsize=10)
    saving = (1 - cum_inact[-1] / cum_idle[-1]) * 100
    ax.text(n * 0.5, cum_idle[-1] * 0.62,
            f"{n} 次到达后\n信令负荷降低 ≈ {saving:.0f}%",
            ha="center", va="center", fontsize=11, color=TXT_CLR,
            bbox=dict(boxstyle="round,pad=0.5", fc=PANEL_BG, ec=C_SDT, lw=1.5))

    ax.set_xlabel("小数据到达次数（累计）→")
    ax.set_ylabel("累积空口信令消息数（条）")
    ax.set_xlim(1, n + 3)
    ax.set_ylim(0, cum_idle[-1] * 1.1)
    ax.legend(loc="upper left", framealpha=0.9, facecolor=PANEL_BG,
              edgecolor=GRID_CLR, fontsize=9)
    ax.grid(ls=":", alpha=0.3)

    fig.tight_layout(rect=(0, 0, 1, 0.94))
    out = os.path.join(HERE, "output_rrc_sdt_benefit.png")
    fig.savefig(out, dpi=130, facecolor=DARK_BG)
    plt.close(fig)
    print(f"  [4/4] SDT 累积收益 → {os.path.basename(out)}")
    print(f"\n  ── SDT 累积报告 ──")
    print(f"  {n} 次小数据到达后：")
    print(f"    IDLE-only    累积信令 = {int(cum_idle[-1])} 条")
    print(f"    INACTIVE+SDT 累积信令 = {int(cum_inact[-1])} 条")
    print(f"    信令负荷降低 ≈ {saving:.1f}%")


# ═════════════════════════════════════════════════════════════════════════════
# 主入口
# ═════════════════════════════════════════════════════════════════════════════
def main():
    print("═" * 70)
    print("  5G NR RRC 状态机仿真  (IDLE / INACTIVE / CONNECTED)")
    print("═" * 70)
    plot_state_timeline()
    plot_signaling_cost()
    plot_latency_ntn()
    plot_sdt_benefit()
    print("═" * 70)
    print("  完成 ✅  4 张 PNG 已输出至脚本同目录")
    print("═" * 70)


if __name__ == "__main__":
    main()
