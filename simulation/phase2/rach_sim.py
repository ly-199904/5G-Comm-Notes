"""
rach_sim.py
===========
5G NR RACH (Random Access Channel) Simulator

参考标准：
    3GPP TS 38.321 v15.7.0  — MAC 协议；RACH 流程（§5.1）
    3GPP TS 38.211 v15.7.0  — PRACH 序列生成（§6.3.3）
    3GPP TS 38.213 v15.7.0  — PRACH 时域资源（§8.1）
    3GPP TR 38.821 v17.3.0  — NTN RACH 增强

核心功能：
    1. ZC 序列生成与 PRACH 相关检测
    2. RA-RNTI 计算（38.321 §5.1.3）
    3. 4-Step CBRA 状态机仿真
    4. NTN 大时延场景下的 ra-ResponseWindow 分析
    5. RACH 竞争碰撞概率分析（N_UE vs N_preamble）
    6. 功率爬坡与覆盖分析

依赖：pip install numpy matplotlib scipy
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Optional
import random

# 中文字体
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'Noto Sans SC', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# ─────────────────────────────────────────────────────────────────────────────
# 全局主题
# ─────────────────────────────────────────────────────────────────────────────
DARK_BG   = '#0d1117'
DARK_AX   = '#161b22'
DARK_GRID = '#30363d'
DARK_TEXT = '#e6edf3'
DARK_MUTED= '#8b949e'
COLORS = {
    'msg1': '#58a6ff',
    'msg2': '#3fb950',
    'msg3': '#ffa657',
    'msg4': '#d2a8ff',
    'fail': '#ff7b72',
    'ntn' : '#79c0ff',
}

def ax_style(ax):
    ax.set_facecolor(DARK_AX)
    ax.tick_params(colors=DARK_MUTED, labelsize=8)
    for sp in ax.spines.values():
        sp.set_edgecolor(DARK_GRID)
    ax.grid(True, alpha=0.2, color=DARK_GRID)
    ax.xaxis.label.set_color(DARK_MUTED)
    ax.yaxis.label.set_color(DARK_MUTED)

import os
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# 模块 1：ZC 序列生成与 PRACH 检测
# 参考：38.211 §6.3.3.1
# ─────────────────────────────────────────────────────────────────────────────

def generate_zc(u: int, N_zc: int = 839) -> np.ndarray:
    """
    Zadoff-Chu 序列生成（38.211 Eq.6.3.3.1-1）

    x_u(n) = exp(-j·π·u·n·(n+1) / N_ZC),  n = 0,...,N_ZC-1

    属性：
        - 恒包络（|x_u(n)| = 1，PAPR = 0 dB）
        - 完美循环自相关（检测 TA 的数学基础）
        - 不同根序列 u 间低互相关（N_ZC 个 UE 可并发）
    """
    n = np.arange(N_zc, dtype=np.float64)
    return np.exp(-1j * np.pi * u * n * (n + 1) / N_zc)


def cyclic_shift(seq: np.ndarray, shift: int) -> np.ndarray:
    """循环移位：模拟不同 Preamble 序号（来自同一根序列的不同移位）"""
    return np.roll(seq, shift)


def prach_correlate(rx: np.ndarray, ref: np.ndarray, N_zc: int = 839) -> np.ndarray:
    """
    PRACH 相关检测（频域实现 = 时域循环相关）

    gNB 侧检测流程：
        1. FFT(接收信号) × conj(FFT(参考 ZC 序列))
        2. IFFT 得到循环相关结果
        3. 相关峰位置 → TA 估计（采样数 × 采样间隔 = 时延）
    """
    freq_rx  = np.fft.fft(rx[:N_zc])
    freq_ref = np.fft.fft(ref[:N_zc])
    corr     = np.fft.ifft(freq_rx * np.conj(freq_ref))
    return np.abs(corr)


# ─────────────────────────────────────────────────────────────────────────────
# 模块 2：RA-RNTI 计算
# 参考：38.321 §5.1.3
# ─────────────────────────────────────────────────────────────────────────────

def compute_ra_rnti(s_id: int, t_id: int, f_id: int,
                    ul_carrier_id: int = 0) -> int:
    """
    RA-RNTI 计算（38.321 §5.1.3）

    RA-RNTI = 1 + s_id + 14×t_id + 14×80×f_id + 14×80×8×ul_carrier_id

    参数：
        s_id          : PRACH 起始符号索引（0~13）
        t_id          : 10ms 窗口内的时隙索引（0~79）
        f_id          : PRACH 频域资源索引（0~7）
        ul_carrier_id : 上行载波（0=NUL，1=SUL）

    返回：RA-RNTI（1~65519）
    """
    ra_rnti = 1 + s_id + 14 * t_id + 14 * 80 * f_id + 14 * 80 * 8 * ul_carrier_id
    return ra_rnti


# ─────────────────────────────────────────────────────────────────────────────
# 模块 3：RACH 配置参数
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class RACHConfig:
    """
    RACH 配置参数（对应 SIB1 rach-ConfigCommon）

    参考：38.321 §5.1，38.331 RACH-ConfigCommon IE
    """
    mu: int = 1                          # Numerology（SCS = 2^μ × 15 kHz）
    n_preambles: int = 64                # 可用 Preamble 总数（通常 64）
    ra_response_window: int = 40         # ra-ResponseWindow（slots）
    contention_res_timer: int = 64       # ra-ContentionResolutionTimer（slots）
    preamble_trans_max: int = 7          # 最大 Preamble 重传次数
    power_ramping_step_db: float = 2.0   # 每次重传功率增加量（dB）
    init_rx_target_power_dbm: float = -90.0  # 目标接收功率（dBm）
    backoff_max_ms: float = 20.0         # 最大退避时间（ms）
    n_zc: int = 839                      # ZC 序列长度（FR1 长序列）
    root_seq_idx: int = 1                # 根序列索引 u

    @property
    def slot_dur_ms(self) -> float:
        return 1.0 / (2 ** self.mu)

    @property
    def ra_window_ms(self) -> float:
        return self.ra_response_window * self.slot_dur_ms

    @property
    def scs_khz(self) -> float:
        return (2 ** self.mu) * 15


@dataclass
class NTNConfig:
    """NTN 场景参数（Rel-17 38.821）"""
    altitude_km: float = 550.0           # 轨道高度（km）
    elevation_deg: float = 90.0          # 仰角（度）
    freq_hz: float = 2e9                 # 载频（Hz）
    enabled: bool = False                # 是否启用 NTN 模式

    @property
    def one_way_delay_ms(self) -> float:
        """单程传播时延（ms）"""
        RE_KM = 6371.0
        r_km  = RE_KM + self.altitude_km
        # 地面到卫星的斜距（仰角修正）
        sin_elev = np.sin(np.radians(self.elevation_deg))
        # 精确斜距计算
        d_km = np.sqrt((r_km)**2 - (RE_KM * np.cos(np.radians(self.elevation_deg)))**2) \
               - RE_KM * sin_elev
        return d_km / 300.0  # km / (km/ms) = ms

    @property
    def rtt_ms(self) -> float:
        return 2 * self.one_way_delay_ms

    @property
    def required_ra_window_slots(self, mu: int = 1) -> int:
        """NTN 所需的最小 ra-ResponseWindow（slots）"""
        slot_ms  = 1.0 / (2 ** mu)
        rtt_ms   = self.rtt_ms
        margin   = 10  # 处理时间裕量（slots）
        return int(np.ceil(rtt_ms / slot_ms)) + margin


# ─────────────────────────────────────────────────────────────────────────────
# 模块 4：UE RACH 状态机
# 参考：38.321 §5.1（4-Step CBRA）
# ─────────────────────────────────────────────────────────────────────────────

class RACHState(Enum):
    IDLE             = auto()
    WAIT_RAR         = auto()
    WAIT_MSG4        = auto()
    CONNECTED        = auto()
    FAILED           = auto()


@dataclass
class UEContext:
    """单个 UE 的 RACH 状态"""
    ue_id: int
    preamble_idx: Optional[int] = None
    tc_rnti: Optional[int] = None
    c_rnti: Optional[int]  = None
    state: RACHState = RACHState.IDLE
    attempt: int = 0
    tx_power_dbm: float = 0.0
    ta_applied_ms: float = 0.0          # 已应用的 TA 值（ms）
    history: list = field(default_factory=list)  # 事件记录


def simulate_cbra(
    config: RACHConfig,
    ntn: NTNConfig,
    n_ues: int = 3,
    path_loss_db: float = 110.0,
    seed: int = 42,
) -> list[UEContext]:
    """
    4-Step CBRA 仿真（支持多 UE 竞争）

    仿真流程：
        Msg1：UE 随机选 Preamble，gNB 检测（可能碰撞）
        Msg2：gNB 发 RAR（含 TA + UL Grant + TC-RNTI）
        Msg3：UE 按 UL Grant 发 PUSCH
        Msg4：gNB 发竞争解决，UE 验证 identity

    NTN 增强：
        - UE 在 Msg1 前应用 TA 预补偿
        - ra-ResponseWindow 根据 RTT 调整
        - Msg3 继续维持 TA 预补偿
    """
    rng = random.Random(seed)
    ues = [UEContext(ue_id=i,
                     tx_power_dbm=config.init_rx_target_power_dbm + path_loss_db)
           for i in range(n_ues)]

    t_ms = 0.0   # 仿真时间（ms）
    one_way = ntn.one_way_delay_ms if ntn.enabled else 0.1
    ra_win_ms = config.ra_window_ms
    if ntn.enabled:
        # NTN: ra-ResponseWindow 需至少覆盖 RTT
        min_win = ntn.rtt_ms + 5.0  # +5ms 处理裕量
        if ra_win_ms < min_win:
            print(f"  ⚠️  ra-ResponseWindow={ra_win_ms:.1f}ms < RTT={ntn.rtt_ms:.1f}ms")
            print(f"      建议将 ra-ResponseWindow 扩展至至少 {int(min_win/config.slot_dur_ms)+10} slots")

    print(f"\n{'═'*60}")
    print(f"4-Step CBRA 仿真  |  {'NTN LEO' if ntn.enabled else '地面 TN'}  |  {n_ues} UEs")
    print(f"  SCS = {config.scs_khz:.0f}kHz  |  Slot = {config.slot_dur_ms:.1f}ms")
    if ntn.enabled:
        print(f"  单程时延 = {one_way:.2f}ms  |  RTT = {ntn.rtt_ms:.2f}ms")
    print(f"  ra-ResponseWindow = {config.ra_response_window} slots ({ra_win_ms:.1f}ms)")
    print(f"{'─'*60}")

    # ── STEP 1：Msg1 ─────────────────────────────────────────────────────────
    print(f"\n[t={t_ms:.1f}ms] Msg1: UE 发送 PRACH Preamble")
    preamble_choices = {}
    for ue in ues:
        if ntn.enabled:
            # NTN: 应用 TA 预补偿
            ue.ta_applied_ms = one_way
            print(f"  UE#{ue.ue_id}: TA 预补偿 = {ue.ta_applied_ms:.2f}ms，提前发送")
        ue.preamble_idx = rng.randint(0, config.n_preambles - 1)
        preamble_choices[ue.ue_id] = ue.preamble_idx
        ue.state = RACHState.WAIT_RAR
        ue.history.append((t_ms, 'MSG1_TX', f'Preamble={ue.preamble_idx}'))
        print(f"  UE#{ue.ue_id}: Preamble 索引 = {ue.preamble_idx}")

    # 检测碰撞
    preamble_counts = {}
    for uid, pidx in preamble_choices.items():
        preamble_counts.setdefault(pidx, []).append(uid)
    collisions = {p: uids for p, uids in preamble_counts.items() if len(uids) > 1}
    if collisions:
        for p, uids in collisions.items():
            print(f"  ⚡ 碰撞：Preamble#{p} 被 UE#{uids} 同时选择！")

    # ── STEP 2：Msg2（RAR）─────────────────────────────────────────────────────
    t_rar = t_ms + one_way * 2 + 1.0  # Msg1 往返 + gNB 处理
    print(f"\n[t={t_rar:.1f}ms] Msg2: gNB 发送 RAR（ra-ResponseWindow 内）")

    rar_rnti = compute_ra_rnti(s_id=0, t_id=4, f_id=0)
    print(f"  RA-RNTI = {rar_rnti}（s_id=0, t_id=4, f_id=0）")

    tc_rnti_base = 0xC100
    for ue in ues:
        if ue.state != RACHState.WAIT_RAR:
            continue
        # 检查 ra-ResponseWindow
        if t_rar > t_ms + ra_win_ms:
            print(f"  UE#{ue.ue_id}: ❌ RAR 超时（到达时刻 {t_rar:.1f}ms > 窗口关闭 {t_ms+ra_win_ms:.1f}ms）")
            ue.state = RACHState.FAILED
            ue.history.append((t_rar, 'RAR_TIMEOUT', ''))
            continue

        # 检查碰撞：若 Preamble 碰撞且两信号强度相近，gNB 可能解码失败
        pidx = ue.preamble_idx
        if pidx in collisions and len(collisions[pidx]) > 1:
            # 简化模型：50% 概率碰撞导致 RAR 失败（实际取决于相对功率）
            if rng.random() < 0.5:
                print(f"  UE#{ue.ue_id}: ⚡ 碰撞，本次 RAR 未能解码")
                ue.state = RACHState.IDLE
                ue.attempt += 1
                continue

        ta_cmd = round(one_way * 1e-3 / (16 * 0.509e-9))  # 近似 TA command
        tc_rnti = tc_rnti_base + ue.ue_id
        ue.tc_rnti = tc_rnti
        print(f"  UE#{ue.ue_id}: RAR 接收 ✅  TC-RNTI=0x{tc_rnti:04X}  TA_cmd={ta_cmd}")
        ue.history.append((t_rar, 'RAR_RX', f'TC-RNTI={tc_rnti:#x}, TA={ta_cmd}'))

    # ── STEP 3：Msg3 ─────────────────────────────────────────────────────────
    t_msg3 = t_rar + 3 * config.slot_dur_ms  # K2 偏移（简化为 3 slots）
    print(f"\n[t={t_msg3:.1f}ms] Msg3: UE 发送 RRCSetupRequest（PUSCH）")
    for ue in ues:
        if ue.tc_rnti is None:
            continue
        if ntn.enabled:
            print(f"  UE#{ue.ue_id}: 维持 TA 预补偿 {ue.ta_applied_ms:.2f}ms，继续提前发送")
        ue_identity = rng.randint(0, 0xFFFFFF)
        ue.history.append((t_msg3, 'MSG3_TX', f'identity=0x{ue_identity:06X}'))
        ue._msg3_identity = ue_identity
        print(f"  UE#{ue.ue_id}: Msg3 发送，UE Identity = 0x{ue_identity:06X}")

    # ── STEP 4：Msg4（竞争解决）──────────────────────────────────────────────
    t_msg4 = t_msg3 + one_way * 2 + 2.0
    print(f"\n[t={t_msg4:.1f}ms] Msg4: gNB 发送 Contention Resolution")
    for ue in ues:
        if not hasattr(ue, '_msg3_identity'):
            continue
        # 检查 ra-ContentionResolutionTimer
        timer_expire = t_msg3 + config.contention_res_timer * config.slot_dur_ms
        if t_msg4 > timer_expire:
            print(f"  UE#{ue.ue_id}: ❌ Contention Resolution Timer 超时")
            ue.state = RACHState.IDLE
            continue

        # 竞争解决：Msg4 携带 Msg3 的 UE Identity
        match = (rng.random() > 0.1)  # 90% 概率成功（简化）
        if match:
            ue.c_rnti = ue.tc_rnti  # TC-RNTI 升级为 C-RNTI
            ue.state  = RACHState.CONNECTED
            print(f"  UE#{ue.ue_id}: ✅ 竞争解决成功！"
                  f" C-RNTI=0x{ue.c_rnti:04X}，进入 RRC_CONNECTED")
            ue.history.append((t_msg4, 'CONNECTED', f'C-RNTI={ue.c_rnti:#x}'))
        else:
            print(f"  UE#{ue.ue_id}: ❌ 竞争解决失败（Identity 不匹配）→ 退避重试")
            ue.state = RACHState.IDLE
            ue.attempt += 1
            ue.history.append((t_msg4, 'CONTENTION_FAIL', ''))

    print(f"\n{'─'*60}")
    print(f"仿真结果：")
    for ue in ues:
        status = "✅ CONNECTED" if ue.state == RACHState.CONNECTED else \
                 "❌ FAILED" if ue.state == RACHState.FAILED else "🔄 重试中"
        crnti  = f"C-RNTI=0x{ue.c_rnti:04X}" if ue.c_rnti else ""
        print(f"  UE#{ue.ue_id}: {status}  {crnti}")
    print(f"{'═'*60}")

    return ues


# ─────────────────────────────────────────────────────────────────────────────
# 模块 5：竞争碰撞概率分析
# ─────────────────────────────────────────────────────────────────────────────

def analyze_collision_probability(
    n_preambles_list: list = [64],
    n_ue_range: np.ndarray = np.arange(1, 100, 1),
) -> dict:
    """
    分析不同 UE 数量下的 Preamble 碰撞概率

    理论公式（生日悖论推导）：
        P(no collision) = (N/N) × (N-1)/N × ... × (N-K+1)/N
        P(collision)    = 1 - P(no collision)

        其中 N = n_preambles，K = n_ues

    简化近似（K << N 时）：
        P(collision) ≈ 1 - e^(-K(K-1)/(2N))
    """
    results = {}
    for n_pre in n_preambles_list:
        p_coll = []
        for k in n_ue_range:
            # 精确计算（当 k 较小时）
            if k <= n_pre:
                p_no_coll = 1.0
                for i in range(k):
                    p_no_coll *= (n_pre - i) / n_pre
                p_coll.append(1 - p_no_coll)
            else:
                p_coll.append(1.0)
        results[n_pre] = np.array(p_coll)
    return results


# ─────────────────────────────────────────────────────────────────────────────
# 模块 6：NTN ra-ResponseWindow 分析
# ─────────────────────────────────────────────────────────────────────────────

def analyze_ntn_ra_window(
    mu: int = 1,
    altitude_km: float = 550.0,
    elevation_range: np.ndarray = np.linspace(10, 90, 50),
) -> dict:
    """
    分析不同仰角下所需的 ra-ResponseWindow

    对比：
        地面 TN：RTT < 5ms，40 slots 绰绰有余
        LEO NTN：RTT 随仰角变化，低仰角时 RTT > 20ms
    """
    RE_KM     = 6371.0
    r_km      = RE_KM + altitude_km
    slot_ms   = 1.0 / (2 ** mu)
    results   = {'elevation': elevation_range, 'rtt_ms': [], 'required_slots': []}

    for elev in elevation_range:
        sin_e = np.sin(np.radians(elev))
        cos_e = np.cos(np.radians(elev))
        # 斜距（km）
        d_km  = np.sqrt(r_km**2 - (RE_KM * cos_e)**2) - RE_KM * sin_e
        rtt   = 2 * d_km / 300.0  # ms
        req   = int(np.ceil((rtt + 5.0) / slot_ms))  # +5ms 处理裕量
        results['rtt_ms'].append(rtt)
        results['required_slots'].append(req)

    results['rtt_ms']         = np.array(results['rtt_ms'])
    results['required_slots'] = np.array(results['required_slots'])
    return results


# ─────────────────────────────────────────────────────────────────────────────
# 模块 7：可视化
# ─────────────────────────────────────────────────────────────────────────────

def plot_prach_detection(snr_db: float = 10.0):
    """
    图 1：ZC 序列相关检测（含 TA 估计）
    展示：匹配根序列 vs 不匹配、有时延 vs 无时延
    """
    N_zc = 839
    u1, u2 = 1, 37
    seq_u1 = generate_zc(u1, N_zc)

    # 引入 25 个采样的人工时延（模拟 TA 偏移）
    delay = 25
    seq_rx_match     = np.roll(seq_u1, delay)   # 匹配 + 时延
    seq_rx_mismatch  = generate_zc(u2, N_zc)    # 不匹配根序列

    # 加 AWGN
    snr = 10 ** (snr_db / 10)
    def add_noise(s):
        std = np.sqrt(1 / (2 * snr))
        return s + std * (np.random.randn(len(s)) + 1j * np.random.randn(len(s)))

    np.random.seed(42)
    corr_match    = prach_correlate(add_noise(seq_rx_match),   seq_u1, N_zc)
    corr_mismatch = prach_correlate(add_noise(seq_rx_mismatch), seq_u1, N_zc)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5), facecolor=DARK_BG)
    fig.suptitle(f'PRACH ZC 序列相关检测  |  SNR={snr_db}dB  |  N_ZC={N_zc}\n'
                 f'(3GPP TS 38.211 §6.3.3.1)',
                 color=DARK_TEXT, fontsize=12)

    for ax, corr, title, c, peak_info in zip(
        axes,
        [corr_match, corr_mismatch],
        [f'✅ 匹配（u={u1}），时延 = {delay} 采样',
         f'❌ 不匹配（参考 u={u1}，接收 u={u2}）'],
        [COLORS['msg1'], COLORS['fail']],
        [f'峰值位置 = {delay}（= TA 估计）', '无明显峰值（随机噪声底）'],
    ):
        ax_style(ax)
        ax.plot(corr, color=c, lw=1.2, alpha=0.9)
        peak_v = corr.max()
        floor  = corr.mean()
        ax.axhline(floor, color=DARK_MUTED, ls='--', lw=0.8, alpha=0.6,
                   label=f'噪声底 = {floor:.3f}')
        ax.axhline(peak_v, color=c, ls=':', lw=0.8, alpha=0.7,
                   label=f'峰值 = {peak_v:.3f}')
        ax.set_title(title, color=c, fontsize=10)
        ax.set_xlabel('时延偏移（采样数）≡ TA 估计', fontsize=8)
        ax.set_ylabel('相关幅度', fontsize=8)
        ax.legend(fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT)
        ax.text(N_zc * 0.6, peak_v * 0.9, peak_info,
                color=c, fontsize=8,
                bbox=dict(boxstyle='round,pad=0.3', fc=DARK_AX, alpha=0.8))

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_prach_detection_rach.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_prach_detection_rach.png")


def plot_collision_probability():
    """
    图 2：RACH 竞争碰撞概率分析
    展示：不同 n_preamble 配置下，碰撞概率随 UE 数量的变化
    """
    n_ue_range = np.arange(1, 120, 1)
    results    = analyze_collision_probability(
        n_preambles_list=[64, 52, 32],
        n_ue_range=n_ue_range
    )
    colors_pre = ['#58a6ff', '#3fb950', '#ffa657']

    fig, ax = plt.subplots(figsize=(11, 6), facecolor=DARK_BG)
    ax_style(ax)

    for (n_pre, p_coll), c in zip(results.items(), colors_pre):
        ax.plot(n_ue_range, p_coll * 100,
                color=c, lw=2, label=f'{n_pre} 个 Preamble')
        # 标注 50% 碰撞点
        idx50 = np.argmin(np.abs(p_coll - 0.5))
        ax.scatter(n_ue_range[idx50], 50, color=c, s=60, zorder=5)
        ax.text(n_ue_range[idx50] + 2, 52,
                f'{n_ue_range[idx50]} UEs',
                color=c, fontsize=8)

    ax.axhline(50, color=DARK_MUTED, ls='--', lw=1, alpha=0.5,
               label='碰撞率 = 50%')
    ax.axhline(10, color=DARK_MUTED, ls=':', lw=1, alpha=0.5,
               label='碰撞率 = 10%（可接受）')
    ax.set_xlabel('同时发起 RACH 的 UE 数量', fontsize=9)
    ax.set_ylabel('至少一次碰撞的概率（%）', fontsize=9)
    ax.set_title('PRACH Preamble 碰撞概率  |  "生日悖论"在无线通信中的应用\n'
                 '（碰撞不等于 RACH 失败，竞争解决机制可处理部分碰撞情形）',
                 color=DARK_TEXT, fontsize=10)
    ax.legend(fontsize=9, facecolor=DARK_AX, labelcolor=DARK_TEXT)
    ax.set_ylim([0, 105])
    ax.set_xlim([0, 120])

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_rach_collision.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_rach_collision.png")


def plot_ntn_ra_window():
    """
    图 3：NTN ra-ResponseWindow 分析
    展示：不同仰角下的 RTT 和所需 ra-ResponseWindow slots 数
    对比地面默认配置（40 slots）的覆盖不足
    """
    mu = 1
    slot_ms = 1.0 / (2 ** mu)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5), facecolor=DARK_BG)
    fig.suptitle('NTN LEO ra-ResponseWindow 分析  |  (3GPP TR 38.821 §6.3 · Rel-17)',
                 color=DARK_TEXT, fontsize=12)

    altitudes  = [550, 1200]
    colors_alt = [COLORS['ntn'], COLORS['msg2']]

    for ax_idx, (ax, param) in enumerate(zip(
        [axes[0], axes[1]],
        ['rtt_ms', 'required_slots']
    )):
        ax_style(ax)
        for alt, c in zip(altitudes, colors_alt):
            elev_range = np.linspace(10, 90, 80)
            res = analyze_ntn_ra_window(mu=mu, altitude_km=alt,
                                        elevation_range=elev_range)
            ax.plot(elev_range, res[param], color=c, lw=2,
                    label=f'LEO h={alt}km')

        if param == 'rtt_ms':
            ax.axhline(40 * slot_ms, color=COLORS['fail'], ls='--', lw=1.5,
                       label=f'Rel-15 地面 ra-ResponseWindow = {40*slot_ms:.0f}ms')
            ax.set_ylabel('往返时延 RTT (ms)', fontsize=9)
            ax.set_title('仰角 vs RTT', color=DARK_TEXT, fontsize=10)
        else:
            ax.axhline(40, color=COLORS['fail'], ls='--', lw=1.5,
                       label='Rel-15 默认 ra-ResponseWindow = 40 slots')
            ax.axhline(640, color=COLORS['msg2'], ls=':', lw=1.5,
                       label='Rel-17 NTN 最大 640 slots')
            ax.set_ylabel('所需 ra-ResponseWindow (slots)', fontsize=9)
            ax.set_title('仰角 vs 所需 ra-ResponseWindow', color=DARK_TEXT, fontsize=10)
            ax.set_ylim([0, 700])

        ax.set_xlabel('卫星仰角 (度)', fontsize=9)
        ax.legend(fontsize=8.5, facecolor=DARK_AX, labelcolor=DARK_TEXT)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_ntn_ra_window.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_ntn_ra_window.png")


def plot_rach_timeline(ues: list[UEContext], config: RACHConfig,
                       ntn_enabled: bool = False):
    """
    图 4：RACH 信令时序甘特图
    展示：Msg1~Msg4 的时序关系，NTN 下的延迟扩展
    """
    fig, ax = plt.subplots(figsize=(14, max(4, len(ues) * 1.5 + 2)),
                           facecolor=DARK_BG)
    ax_style(ax)
    ax.set_yticks(range(len(ues)))
    ax.set_yticklabels([f'UE#{u.ue_id}' for u in ues], color=DARK_TEXT)
    ax.set_xlabel('时间 (ms)', fontsize=9)
    ax.set_title(f'RACH 信令时序  |  {"NTN LEO" if ntn_enabled else "地面 TN"}\n'
                 f'SCS={config.scs_khz:.0f}kHz，slot={config.slot_dur_ms:.1f}ms',
                 color=DARK_TEXT, fontsize=10)

    msg_colors = {
        'MSG1_TX': COLORS['msg1'],
        'RAR_RX':  COLORS['msg2'],
        'MSG3_TX': COLORS['msg3'],
        'CONNECTED': COLORS['msg4'],
        'RAR_TIMEOUT': COLORS['fail'],
        'CONTENTION_FAIL': COLORS['fail'],
    }
    msg_labels = {
        'MSG1_TX': 'Msg1 (PRACH)',
        'RAR_RX':  'Msg2 (RAR)',
        'MSG3_TX': 'Msg3 (PUSCH)',
        'CONNECTED': 'Msg4 (Contention Res)',
        'RAR_TIMEOUT': 'RAR Timeout',
        'CONTENTION_FAIL': 'Contention Fail',
    }

    legend_handles = {}
    for i, ue in enumerate(ues):
        for (t, event, info) in ue.history:
            c = msg_colors.get(event, DARK_MUTED)
            ax.scatter(t, i, color=c, s=120, zorder=5, marker='D')
            ax.text(t, i + 0.12, msg_labels.get(event, event),
                    color=c, fontsize=7, ha='center')
            if event not in legend_handles:
                legend_handles[event] = mpatches.Patch(
                    color=c, label=msg_labels.get(event, event))

    ax.legend(handles=list(legend_handles.values()),
              fontsize=8, facecolor=DARK_AX, labelcolor=DARK_TEXT,
              loc='lower right')
    ax.set_xlim([-2, None])
    ax.set_ylim([-0.5, len(ues) - 0.5])

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'output_rach_timeline.png'),
                dpi=150, bbox_inches='tight', facecolor=DARK_BG)
    plt.show()
    print("✅ output_rach_timeline.png")


# ─────────────────────────────────────────────────────────────────────────────
# 主程序
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    print("=" * 60)
    print("5G NR RACH Simulator")
    print("3GPP TS 38.321 / 38.211 / 38.213 · Rel-15/17")
    print("=" * 60)

    # ── 1. PRACH 相关检测 ────────────────────────────────────────────────────
    print("\n【1】PRACH ZC 序列相关检测（含 TA 估计）...")
    plot_prach_detection(snr_db=10.0)

    # ── 2. 碰撞概率分析 ──────────────────────────────────────────────────────
    print("\n【2】Preamble 碰撞概率分析...")
    plot_collision_probability()

    # ── 3. 地面 CBRA 仿真 ─────────────────────────────────────────────────────
    print("\n【3】地面 4-Step CBRA 仿真（3 UEs，含竞争）...")
    config_tn = RACHConfig(mu=1, ra_response_window=40)
    ntn_off   = NTNConfig(enabled=False)
    ues_tn    = simulate_cbra(config_tn, ntn_off, n_ues=3,
                               path_loss_db=110.0, seed=42)
    plot_rach_timeline(ues_tn, config_tn, ntn_enabled=False)

    # ── 4. NTN RACH 仿真（窗口不足）────────────────────────────────────────
    print("\n【4】NTN RACH 仿真（ra-ResponseWindow 不足，演示超时）...")
    config_ntn_small = RACHConfig(mu=1, ra_response_window=40)  # 默认窗口，不够！
    ntn_far   = NTNConfig(enabled=True, altitude_km=550,
                          elevation_deg=30, freq_hz=2e9)
    ues_ntn_s = simulate_cbra(config_ntn_small, ntn_far, n_ues=2,
                               path_loss_db=159.0, seed=7)

    # ── 5. NTN RACH 仿真（窗口扩展，Rel-17）────────────────────────────────
    print("\n【5】NTN RACH 仿真（Rel-17 扩展 ra-ResponseWindow = 640 slots）...")
    config_ntn_large = RACHConfig(mu=1, ra_response_window=640)  # Rel-17 NTN
    ues_ntn_l = simulate_cbra(config_ntn_large, ntn_far, n_ues=2,
                               path_loss_db=159.0, seed=7)
    plot_rach_timeline(ues_ntn_l, config_ntn_large, ntn_enabled=True)

    # ── 6. ra-ResponseWindow 分析 ──────────────────────────────────────────
    print("\n【6】NTN ra-ResponseWindow 分析（仰角 vs RTT vs 所需 slots）...")
    plot_ntn_ra_window()

    # ── 7. RA-RNTI 计算验证 ────────────────────────────────────────────────
    print("\n【7】RA-RNTI 计算示例...")
    print("─" * 45)
    for s_id, t_id, f_id in [(0, 0, 0), (0, 4, 0), (2, 10, 1)]:
        ra_rnti = compute_ra_rnti(s_id, t_id, f_id)
        print(f"  s_id={s_id}, t_id={t_id:2d}, f_id={f_id}"
              f"  →  RA-RNTI = {ra_rnti}")
    print("─" * 45)

    print("\n🎉 所有模块完成。输出文件：")
    print("  output_prach_detection_rach.png — ZC 序列相关检测")
    print("  output_rach_collision.png       — Preamble 碰撞概率")
    print("  output_rach_timeline.png        — RACH 信令时序")
    print("  output_ntn_ra_window.png        — NTN ra-ResponseWindow 分析")
