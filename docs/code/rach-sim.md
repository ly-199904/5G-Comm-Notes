# rach_sim.py · 仿真说明文档

> **对应理论笔记**：[RACH 随机接入流程](/phase2/rach-procedure)
> **脚本位置**：`simulation/phase2/rach_sim.py`
> **验证目标**：通过 ZC 序列相关检测、碰撞概率分析、4-Step CBRA 状态机仿真和 NTN ra-ResponseWindow 分析，验证 3GPP 38.321 §5.1 中 RACH 流程的核心机制，以及 Rel-17 NTN 增强对大时延场景的适配。

---

## ⚡ 一分钟速览

```
这个脚本在验证什么？

PRACH ZC 序列：
  恒包络（PAPR = 0dB）+ 完美循环自相关
  → 相关峰位置 = TA 估计（采样数 × 采样间隔）
  → 不同根序列互相关极低（64 个 UE 可并发）

4-Step CBRA 状态机：
  Msg1（PRACH）→ Msg2（RAR）→ Msg3（PUSCH）→ Msg4（竞争解决）
  竞争碰撞：同一 Preamble 被多 UE 选择 → 退避重试

NTN 核心结论：
  地面 ra-ResponseWindow = 40 slots（= 20ms @ SCS=30kHz）
  LEO 550km 仰角 30° 时 RTT ≈ 8.5ms → 勉强够
  LEO 550km 仰角 10° 时 RTT ≈ 21ms  → 窗口不足！
  Rel-17 将最大值扩展至 640 slots（= 320ms）→ 覆盖所有场景
```

**运行后你会得到 4 张图 + 终端仿真报告**：
- `output_prach_detection_rach.png`：ZC 序列相关检测（匹配 vs 不匹配）
- `output_rach_collision.png`：Preamble 碰撞概率分析
- `output_rach_timeline.png`：RACH 信令时序甘特图
- `output_ntn_ra_window.png`：NTN ra-ResponseWindow 分析（仰角 vs RTT vs 所需 slots）

---

## 🛠️ 环境配置

```bash
# 安装依赖
pip install numpy matplotlib scipy

# 创建 Phase 2 仿真目录
mkdir -p simulation/phase2

# 运行（从 simulation/phase2/ 目录执行）
cd simulation/phase2
python rach_sim.py
```

**预计运行时间**：< 30 秒（无深度迭代计算）

---

## 📐 数学–代码对照

### 对照 1：ZC 序列生成（38.211 §6.3.3.1）

**协议公式**：

$$
x_u(n) = e^{-j\pi u n(n+1)/N_{ZC}}, \quad n = 0, 1, \ldots, N_{ZC}-1
$$

**对应代码**（`generate_zc` 函数）：

```python
n = np.arange(N_zc, dtype=np.float64)
return np.exp(-1j * np.pi * u * n * (n + 1) / N_zc)
```

**三个关键特性的物理含义**：

| 特性 | 数学表现 | 工程价值 |
|---|---|---|
| 恒包络 | $\|x_u(n)\| = 1$ | PAPR = 0 dB，功放效率最高 |
| 完美自相关 | $R_{uu}(\tau) = N_{ZC} \cdot \delta(\tau)$ | 相关峰唯一且尖锐，TA 估计精准 |
| 低互相关 | $\|R_{uv}(\tau)\| = 1/\sqrt{N_{ZC}}$（$u \neq v$）| 不同根序列互不干扰，支持并发检测 |

---

### 对照 2：PRACH 相关检测（频域实现）

**物理原理**：时域循环相关 = 频域乘法，利用 FFT 加速。

$$
R_{xy}[\tau] = \mathcal{F}^{-1}\{X[k] \cdot Y^*[k]\}
$$

**对应代码**（`prach_correlate` 函数）：

```python
freq_rx  = np.fft.fft(rx[:N_zc])           # 接收信号 FFT
freq_ref = np.fft.fft(ref[:N_zc])          # 参考 ZC 序列 FFT
corr     = np.fft.ifft(freq_rx * np.conj(freq_ref))  # 频域乘法 → IFFT
```

**TA 估计**：相关峰位置（采样数）× 采样间隔 = 单程传播时延估计

$$
\hat{\tau} = \frac{n_{\text{peak}}}{f_s}
$$

---

### 对照 3：RA-RNTI 计算（38.321 §5.1.3）

**协议公式**：

$$
\text{RA-RNTI} = 1 + s_{id} + 14 \times t_{id} + 14 \times 80 \times f_{id} + 14 \times 80 \times 8 \times ul\_carrier\_id
$$

**对应代码**（`compute_ra_rnti` 函数）：

```python
ra_rnti = 1 + s_id + 14*t_id + 14*80*f_id + 14*80*8*ul_carrier_id
```

**为什么 RA-RNTI 需要这么复杂的计算？**

RA-RNTI 需要唯一标识一个 RACH Occasion（特定时频资源）。不同时隙（t_id）、不同符号（s_id）、不同频域位置（f_id）的 PRACH 对应不同的 RA-RNTI，UE 凭此找到属于自己的 RAR 响应。

---

### 对照 4：碰撞概率（"生日悖论"应用）

**理论公式**（精确计算）：

$$
P(\text{无碰撞}) = \prod_{i=0}^{K-1} \frac{N - i}{N}
$$

$$
P(\text{碰撞}) = 1 - P(\text{无碰撞})
$$

其中 $N$ = Preamble 总数，$K$ = 同时接入的 UE 数量。

**对应代码**（`analyze_collision_probability` 函数）：

```python
p_no_coll = 1.0
for i in range(k):
    p_no_coll *= (n_pre - i) / n_pre   # 逐步乘以未选中概率
p_coll = 1 - p_no_coll
```

---

## ⚙️ 仿真参数说明

| 参数 | 默认值 | 物理含义 | 修改建议 |
|---|---|---|---|
| `mu` | `1` | Numerology（SCS=30kHz）| 改为 `0` 观察时延变化 |
| `n_preambles` | `64` | 可用 Preamble 数 | 减小至 `32` 观察碰撞率上升 |
| `ra_response_window` | `40` / `640` | RAR 等待窗口（slots）| NTN 必须 ≥ RTT/slot_dur |
| `altitude_km` | `550` | LEO 轨道高度（Starlink）| 改为 `1200` 模拟 OneWeb |
| `elevation_deg` | `30` | 卫星仰角（度）| 改为 `10` 观察最差情形 |
| `path_loss_db` | `110`/`159` | 地面/NTN 路损（dB）| NTN ≈ 159dB（S-band @ 1000km）|
| `power_ramping_step_db` | `2.0` | 每次重传功率增量（dB）| 增大至 `4` 加快功率收敛 |
| `N_zc` | `839` | ZC 序列长度（长序列 FR1）| 改为 `139` 模拟短序列 FR2 |

---

## 📊 预期输出图表解读

### 图 1：`output_prach_detection_rach.png`

```
左图（匹配检测，u=1 vs u=1，时延=25采样）：
  应出现单一尖锐峰，峰值位置 = 25（= 引入的人工时延）
  峰噪比 >> 10dB → 可靠检测
  工程意义：峰值位置 × 采样间隔 = TA 估计值

右图（不匹配检测，接收 u=37 但用 u=1 检测）：
  无明显峰值，全程接近噪声底
  验证：不同根序列的低互相关特性
  工程意义：gNB 可同时运行多个根序列的并行检测，互不干扰

异常情况：若右图也出现峰值 →
  N_ZC 选择不当，根序列之间存在相关性
  标准规定的 839 是质数，这保证了互相关的均匀性
```

### 图 2：`output_rach_collision.png`

```
X 轴：同时发起 RACH 的 UE 数量
Y 轴：至少发生一次碰撞的概率（%）
三条曲线：64 / 52 / 32 个 Preamble

关键读法（以 64 个 Preamble 为例）：
  10 个 UE 同时接入 → 碰撞概率 ≈ 53%
  5 个 UE 同时接入  → 碰撞概率 ≈ 15%（可接受）

重要提醒：碰撞 ≠ RACH 失败！
  碰撞后两个 UE 会随机退避（不同退避时间）→ 大概率错开重试
  功率爬坡机制确保第二次尝试成功率更高
  实际系统中 RACH 成功率 > 99%，即使在高负载场景

工程指导：当同时接入 UE > 10 个时（如大规模 IoT 场景），
  应增大 n_preambles 或引入 2-Step RACH 降低接入时延
```

### 图 3：`output_rach_timeline.png`

```
甘特图：X 轴 = 时间(ms)，Y 轴 = 各个 UE

每个 UE 的时间线：
  蓝色菱形 = Msg1 发出时刻
  绿色菱形 = Msg2（RAR）收到时刻
  橙色菱形 = Msg3 发出时刻
  紫色菱形 = Msg4（竞争解决）收到并验证成功
  红色菱形 = 失败事件（超时/竞争失败）

NTN vs TN 对比（同时运行两张图）：
  地面 TN：全流程 < 10ms
  NTN LEO：全流程 > 20ms（Msg1→Msg2 已占 4.7ms）
```

### 图 4：`output_ntn_ra_window.png`

```
左图：仰角 vs RTT（ms）
  RTT 随仰角降低而急剧增大
  仰角 10°：RTT ≈ 21ms（550km）→ 超过地面默认 20ms 窗口
  仰角 90°（正上方）：RTT ≈ 3.7ms（最小）

右图：仰角 vs 所需 ra-ResponseWindow（slots）
  红色虚线 = Rel-15 默认 40 slots（= 20ms @ SCS=30kHz）
  绿色点线 = Rel-17 NTN 最大 640 slots
  关键结论：低仰角时 40 slots 完全不够，Rel-17 的 640 slots 覆盖所有场景

异常情况：若所需 slots 超过 640（如 GEO 场景）→
  需要更长的定时器配置或 2-Step RACH 机制
  GEO 单程时延 ≈ 238ms，RTT ≈ 476ms，需要 952 slots @ SCS=30kHz
  → GEO NTN 还在研究阶段（Rel-18 及以后）
```

---

## 🔬 NTN Context

::: info NTN 提示 · Rel-17 (38.821 §6.3)

**ra-ResponseWindow 是 NTN RACH 最关键的参数**：不扩展这个窗口，UE 在 RAR 到达之前就已停止监听，永远无法完成 RACH。这是 NTN 部署中最容易忽视的配置项。

**TA 预补偿的全程维持**：NTN UE 必须在整个 RACH 过程（Msg1 → Msg3）持续维持 TA 预补偿，而不仅仅在 Preamble 发送时应用。Msg3 如果不做预补偿，会晚到约 2ms，超出 gNB 的上行接收窗口。

**快速实验**：修改 `NTNConfig` 中的 `elevation_deg = 10`，观察：
1. RTT 增大到多少（约 21ms）
2. 40 slots 的 `ra-ResponseWindow` 是否足够（不够！）
3. 将 `ra_response_window` 改为 640，验证仿真成功

**2-Step RACH 在 NTN 中的局限**：2-Step RACH 将 Msg1 + Msg3 合并发送（MsgA），在地面可以减少一个 RTT 的时延。但 NTN RTT 本就已经很大，2-Step 的时延优势几乎被 RTT 淹没；而且 MsgA 中 PUSCH 与 PRACH 同时发送，PUSCH 覆盖受限更明显。Rel-17 NTN 中推荐优先使用 4-Step RACH。

:::

---

## 📎 3GPP 协议溯源

| 代码模块 | 对应协议 | 章节 |
|---|---|---|
| `generate_zc()` | TS 38.211 | §6.3.3.1（ZC 序列生成）|
| `prach_correlate()` | TS 38.211 | §6.3.3（PRACH 前导检测原理）|
| `compute_ra_rnti()` | TS 38.321 | §5.1.3（RA-RNTI 计算）|
| `simulate_cbra()` | TS 38.321 | §5.1（4-Step CBRA 流程）|
| `RACHConfig.ra_response_window` | TS 38.321 | §5.1.4（RAR 等待窗口）|
| `analyze_collision_probability()` | TS 38.321 | §5.1.4（退避机制背景）|
| `NTNConfig.ra_response_window` | TR 38.821 | §6.3（NTN RACH 增强）|
| 2-Step RACH（MsgA/MsgB）| TS 38.321 | §5.1.1a（Rel-16）|
