# rrc_state_machine_sim.py · 仿真说明文档

> **对应理论笔记**：[RRC 状态机：IDLE / INACTIVE / CONNECTED](/phase3/rrc-state-machine)
> **脚本位置**：`simulation/phase3/rrc_state_machine_sim.py`
> **验证目标**：以"过程级（procedure-level）"模型量化 RRC 三态的信令与时延差异，验证 3GPP 38.331 §5.3 中 RRCSetup / RRCResume / suspendConfig 的成本结构，以及 Rel-17 SDT 与 NTN 大时延场景下 RRC_INACTIVE "省往返"收益随 RTT 放大的核心结论。

---

## ⚡ 一分钟速览

```
这个脚本在验证什么？

三态再接入成本（空口往返 RT）：
  IDLE→CONNECTED  (RRCSetup)  = 4 RT  ── RACH(2)+安全(1)+建DRB(1)
  INACTIVE→CONN   (RRCResume) = 2 RT  ── 上下文恢复，省安全+重配
  INACTIVE+SDT    (Rel-17)    = 1 RT  ── 数据随 Msg3 上行，停在 INACTIVE

挂钟时延模型：
  L ≈ n_RT × RTT + T_proc        （RTT = 2 × 单程传播）

NTN 核心结论（节省随 RTT 线性放大）：
  地面 RTT≈1ms   → 建立 7ms,  SDT 4ms,  省 3ms   （可忽略）
  LEO  RTT≈10ms  → 建立 43ms, SDT 13ms, 省 30ms
  GEO  RTT≈478ms → 建立 1915ms,SDT 481ms,省 1434ms ★ 倍增

突发小数据（50 次到达）：
  IDLE-only 累积信令 500 条 → INACTIVE+SDT 157 条 → 降 ≈ 69%
```

**运行后你会得到 4 张图 + 终端报告**：
- `output_rrc_state_timeline.png`：三态生命周期甘特图（状态条 + 信令事件 + RNAU 标记）
- `output_rrc_signaling_cost.png`：建立 / 恢复 / SDT 的信令消息数与字节数对比
- `output_rrc_latency_ntn.png`：同一过程在 地面 / LEO / GEO 下的挂钟时延
- `output_rrc_sdt_benefit.png`：突发小数据累积信令负荷（IDLE-only vs INACTIVE+SDT）

> :::info 模型定位
> 本脚本是**过程级**模型，关注"空口往返次数"与"消息数量级"的对比，**不是比特级精确仿真**。往返次数与消息数取自 38.300/38.331 的代表性流程，用于建立"为什么需要 INACTIVE"的工程直觉。所有数字都在 `CONFIG` 区，可自行调参复现。
> :::

---

## 🛠️ 环境配置

```bash
# 安装依赖
pip install numpy matplotlib

# 中文字体（关键！否则图中中文显示为方块 □□□）
# Ubuntu/Debian:
sudo apt-get install fonts-noto-cjk
# macOS / Windows 通常自带 PingFang SC / Microsoft YaHei，脚本会自动探测

# 创建 Phase 3 仿真目录
mkdir -p simulation/phase3

# 运行（从 simulation/phase3/ 目录执行）
cd simulation/phase3
python rrc_state_machine_sim.py
```

**预计运行时间**：< 5 秒（纯绘图，无迭代计算）。

**版本要求**：

| 依赖 | 最低版本 | 说明 |
|---|---|---|
| Python | 3.9+ | f-string + dataclass 风格 |
| NumPy | 1.24+ | `np.cumsum` 等 |
| Matplotlib | 3.7+ | `FancyBboxPatch` 圆角条 |

> 脚本内置 `_setup_cjk_font()` 会在 `Noto Sans CJK SC / Microsoft YaHei / SimHei / PingFang SC` 等候选中自动选第一个可用字体，并设 `axes.unicode_minus=False` 保证负号正常。若终端打印"未找到 CJK 字体"，按上面命令装 `fonts-noto-cjk` 即可。

---

## 📐 数学–代码对照

### 对照 1：挂钟时延模型（TR 38.821 §7 时延分析）

**模型公式**：

$$
L \approx n_{\text{RT}} \cdot \text{RTT} + T_{\text{proc}}, \qquad \text{RTT} = 2 \times \text{(单程传播时延)}
$$

**对应代码**（`latency_ms` 函数）：

```python
def latency_ms(rt_count, owd_ms):
    """挂钟时延 ≈ 往返次数 × RTT + 固定处理时延。RTT = 2 × 单程。"""
    rtt = 2.0 * owd_ms
    return rt_count * rtt + CONFIG["proc_ms"]
```

**物理含义**：每个空口往返（UE 发→网络收→网络回→UE 收）至少耗费一个 RTT。三态再接入的差异本质是 $n_{\text{RT}}$ 不同（4 / 2 / 1），而 NTN 把每个 RT 的"单价"RTT 从 ~1 ms 抬到数百 ms，于是往返数之差被线性放大。

---

### 对照 2：恢复相对建立的挂钟节省

**公式**：

$$
\Delta L = (n_{\text{Setup}} - n_{\text{Resume}}) \cdot \text{RTT} = (4-2)\cdot \text{RTT} = 2\,\text{RTT}
$$

**对应代码**（`plot_latency_ntn` 内的节省标注）：

```python
save = vals[0] - vals[2]   # vals[0]=建立, vals[2]=SDT
ax.text(..., f"建立→SDT 省 {save:.0f} ms", ...)
```

**验证方法**：看终端"NTN 时延标度报告"——GEO 行建立 1915 ms、SDT 481 ms，差值 1434 ms ≈ $3\times478$ ms，与 $(n_{\text{建立}}-n_{\text{SDT}})\cdot\text{RTT}$ 一致。

---

### 对照 3：突发小数据累积信令

**模型**：第 1 次到达走完整建立+挂起，其后每次走 SDT；与"每次都建立+释放"对比累积消息数。

**对应代码**（`plot_sdt_benefit` 函数）：

```python
# A: IDLE-only —— 每次 (建立 + 释放)
cum_idle = np.cumsum(np.full(n, m_setup + m_rel))

# B: INACTIVE+SDT —— 首次完整建立并转 INACTIVE，其后每次 SDT
per_event_b = np.full(n, m_sdt, dtype=float)
per_event_b[0] = m_setup + 1          # 首次：建立 + suspend
cum_inact = np.cumsum(per_event_b)

saving = (1 - cum_inact[-1] / cum_idle[-1]) * 100   # 信令负荷降幅
```

**验证方法**：终端打印 `50 次到达后 IDLE-only=500 条, INACTIVE+SDT=157 条, 降 ≈ 68.6%`。降幅随到达次数增大而趋近 $1 - m_{\text{SDT}}/(m_{\text{Setup}}+m_{\text{Rel}})$。

---

## ⚙️ 参数说明（`CONFIG` 区）

| 参数 | 默认 | 含义 / 调参建议 |
|---|---|---|
| `rt_setup` / `rt_resume` / `rt_sdt` | 4 / 2 / 1 | 三种过程的空口往返数。改这三个直接改变所有时延对比 |
| `msgs_setup` / `msgs_resume` / `msgs_sdt` | 见脚本 | 代表性信令消息列表，长度即消息数（图 2 与图 4 用）|
| `bytes_setup/resume/sdt` | 240/90/60 | 信令字节数量级（仅图 2 右轴对比，非精确）|
| `proc_ms` | 3.0 | 固定处理时延常量（gNB+UE）|
| `owd_terrestrial_ms` | 0.5 | 地面单程传播（宏蜂窝代表值）|
| `owd_leo_ms` | 5.0 | LEO 550km 服务链路单程代表值（中等仰角）|
| `owd_geo_ms` | 239.0 | GEO 35786km 近天顶单程 |
| `n_bursts` | 50 | 突发小数据到达次数（IoT/遥测）|

> **想复现 Phase 2 RACH 课的 NTN 数字？** 把 `owd_leo_ms` 按你那边的仰角-斜距换算填入即可（如仰角 30°、斜距 ~1075 km 时单程 ≈ 3.6 ms）。本脚本不重复斜距推导（那是 RACH 课的内容），只接受单程时延作为输入。

---

## 📊 图表解读

### 图 1 `output_rrc_state_timeline.png`：三态生命周期

横轴为示意时间（非真实尺度）。一台 UE 走 `IDLE→CONNECTED→INACTIVE→CONNECTED→IDLE`：
- **灰条 IDLE / 绿条 CONNECTED / 琥珀条 INACTIVE**——颜色与笔记、组件统一。
- 箭头标注触发该转换的信令：`RRCSetup`(红,4 RT) / `RRCRelease+suspendConfig` / `RRCResume`(蓝,2 RT) / `RRCRelease`。
- INACTIVE 段内的虚线 = 周期性 **RNAU**。
- 底部斜体标注**上下文存储状态**：IDLE 无上下文 → CONNECTED 网络保留(N2) → INACTIVE 双侧存储。

**要点**：直观看出 INACTIVE 是"存着上下文的浅睡"，转换的红/蓝色差异预告了下一张图的成本差异。

### 图 2 `output_rrc_signaling_cost.png`：信令开销

左轴消息数（9/5/3），右轴字节数（240/90/60）。中间的虚线箭头标注"恢复相对建立省 4 条（安全+重配）"。

**要点**：从 IDLE 完整建立要 9 条空口信令，INACTIVE 恢复只要 5 条，SDT 只要 3 条——**这是"为什么需要 INACTIVE"的最直接答案**。

### 图 3 `output_rrc_latency_ntn.png`：NTN 时延标度 ★

三个子图分别是地面 / LEO / GEO，每图三根柱（建立/恢复/SDT）。每图右上角标注"建立→SDT 省 X ms"。

**要点（本课最重要的一张图）**：地面省 3 ms（无感）、LEO 省 30 ms、GEO 省 **1434 ms**。同样是"省 3 个往返"，挂钟收益随 RTT 放大数百倍——**INACTIVE/SDT 在 NTN 从优化项变成刚需**。

### 图 4 `output_rrc_sdt_benefit.png`：SDT 累积收益

两条累积曲线随到达次数发散。红线（IDLE-only）斜率陡（10 条/次），紫线（INACTIVE+SDT）斜率缓（3 条/次），阴影是节省量。

**要点**：50 次小数据后信令负荷降约 69%。对"小包高频"的 IoT/遥测，状态选择直接决定网络信令容量与终端电池寿命。

---

## 🛰️ NTN Context

| 仿真维度 | NTN 中的工程意义 |
|---|---|
| 往返数 × RTT 模型 | NTN 的 RTT 是地面的数十至数百倍（LEO ~10ms、GEO ~480ms），任何"减少空口往返"的机制（INACTIVE/SDT）边际价值被同比例放大 |
| 三态再接入成本 | LEO 卫星驻留短、回传昂贵，频繁完整建立不可承受 → INACTIVE + SDT 是 NTN IoT 的默认姿态 |
| RNAU 开销（图 1 虚线）| moving cell / 地移波束下，静止终端也会被频繁"切"出 RNA → 移动 RNAU 风暴，是 NTN INACTIVE 的主要开销来源（见笔记 Q3）|
| 上下文 Xn 取回 | NTN 跨星/跨馈电站的 Xn 时延大，anchor 上下文取回失败概率上升 → Resume 回退到 Setup 的风险更高 |

---

## 📚 3GPP 协议溯源表

| 仿真模块 / 数字 | 规范条款 | 内容 |
|---|---|---|
| RRCSetup 流程（4 RT）| 38.331 §5.3.3 | RRC 连接建立 |
| RRCResume 流程（2 RT）| 38.331 §5.3.13 | RRC 连接恢复（含 Xn 上下文取回）|
| suspendConfig / I-RNTI / t380 | 38.331 §5.3.8.3 | 挂起到 INACTIVE 的配置 |
| RNA / RNAU | 38.300 §9.2.2.4 | RAN 通知区与更新 |
| 状态-CM 对应 | 38.300 §9.2.2 | RRC/CM/RM 状态关系 |
| SDT（1 RT）| 38.300 §16.7，38.321 §5.30 | 小数据传输（RA-SDT / CG-SDT）|
| 挂钟时延模型 / NTN RTT | TR 38.821 §7 | NTN 连接管理与时延分析 |

---

> **复现实验建议**：
> 1. 把 `owd_geo_ms` 改成你关心的轨道/仰角对应单程时延，观察图 3 节省量如何变化；
> 2. 把 `rt_resume` 改为 1（假设理想 CG-SDT 直恢复），看 INACTIVE 与 SDT 的差距如何收窄；
> 3. 把 `n_bursts` 调大到 500，观察图 4 降幅如何趋于稳态 $1 - m_{\text{SDT}}/(m_{\text{Setup}}+m_{\text{Rel}})$。
