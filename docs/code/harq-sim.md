> 📂 代码库：`simulation/phase2/harq_sim.py`

# harq_sim.py · 仿真说明文档

> **对应理论笔记**：[HARQ 混合自动重传](/phase2/harq)
> **脚本位置**：`simulation/phase2/harq_sim.py`
> **验证目标**：通过圆形缓冲区覆盖可视化、CC vs IR BLER 对比、BLER vs SNR 曲线族，以及 NTN 场景的进程数-吞吐量损失分析，验证 3GPP 38.212 §5.4 中 RV 机制和 38.821 §6.3 中 NTN HARQ 取舍的核心原理。

---

## ⚡ 一分钟速览

```
这个脚本在验证什么？

圆形缓冲区（Circular Buffer）：
  RV=0 → 从位置 0 开始，覆盖系统位（最多有用信息）
  RV=2 → 从 N_cb/2 开始，覆盖校验位 1
  RV=3 → 从 5N_cb/6 开始，覆盖校验位 2
  RV=1 → 从 N_cb/4 开始，补充剩余区域
  4次 IR 传输后：缓冲区几乎全覆盖 → 等效极低码率 → 解码能力大幅提升

CC vs IR 对比（SNR=0dB）：
  首传   BLER ≈ 相同（无合并）
  1次重传：IR 改善明显优于 CC
  3次重传：IR BLER 可比 CC 低 1~2 个数量级

NTN 核心结论（μ=1）：
  LEO 550km θ=90°：K_offset=13，K1_eff=17，需 18 进程 → 损失 11%
  LEO 550km θ=45°：K_offset=25，K1_eff=29，需 30 进程 → 损失 46%
  LEO 550km θ=20°：K_offset=53，K1_eff=57，需 58 进程 → 损失 72%
  → Rel-17：θ > 60° 时 16 进程勉强够；θ < 40° 考虑禁用 HARQ
```

**运行后你会得到 4 张图 + 终端汇总表**：
- `output_harq_circular_buffer.png`：圆形缓冲区 RV 覆盖可视化（4 步）
- `output_harq_cc_vs_ir.png`：BLER vs 重传次数（CC vs IR 增益）
- `output_harq_bler_snr.png`：BLER vs SNR 曲线族（多重传次数）
- `output_harq_ntn_analysis.png`：NTN HARQ 综合分析（热力图 + 时序对比）

---

## 🛠️ 环境配置

```bash
pip install numpy matplotlib scipy

cd simulation/phase2
python harq_sim.py
```

**预计运行时间**：

| 模块 | 预计时间 | 说明 |
|---|---|---|
| 圆形缓冲区可视化 | < 5 秒 | 直接生成，无迭代 |
| BLER vs 重传次数 | 30~60 秒 | 2000 次 × 4 次传输 |
| BLER vs SNR 曲线族 | 2~4 分钟 | 14 个 SNR 点 × 1000 次 |
| NTN 分析 | < 10 秒 | 纯数值计算 |

---

## 📐 数学–代码对照

### 对照 1：RV 起点（38.212 Table 5.4.2.1-2，BG1）

**协议公式**：

$$k_0 = \left\lfloor \frac{N_{\text{start}} \times N_{cb}}{66} \right\rfloor$$

其中 $N_{\text{start}} \in \{0, 17, 33, 56\}$ 对应 RV ∈ {0, 1, 2, 3}。

**对应代码**（`get_rv_start`）：

```python
numerators = {0: 0, 1: 17, 2: 33, 3: 56}
return int(np.floor(numerators[rv] * N_cb / 66))
```

**验证方法**：运行后查看 `output_harq_circular_buffer.png`，检查 4 个子图中 `k₀` 标注位置是否与公式计算一致。

---

### 对照 2：LLR 叠加（软合并核心）

**协议原理**：接收端对同一比特位置的 LLR 直接相加（对数域的似然比乘法）：

$$\text{LLR}_{\text{合并}}[k] = \sum_{t=1}^{T} \text{LLR}_t[k]$$

**对应代码**（`CircularBuffer.accumulate`）：

```python
k0 = get_rv_start(rv, self.N_cb)
for i in range(self.E):
    idx = (k0 + i) % self.N_cb
    self.buffer[idx] += llr[i]   # LLR 叠加（软合并）
```

---

### 对照 3：HARQ 进程状态机（38.321 §5.3）

**协议原理**：gNB 维护 N 个进程，轮转调度，每个进程独立维护软缓冲区。

**对应代码**（`HARQManager.tick`）：

```python
# 本 slot 有 ACK 到来 → 释放进程
if self.slot in self.pending_acks:
    proc_id = self.pending_acks.pop(self.slot)
    self.procs[proc_id].state = HARQProcState.IDLE

# 调度新 TB 到空闲进程
proc = self.get_free_proc()
if proc is not None:
    proc.start_new_tb()
    self.pending_acks[self.slot + self.k1_eff] = proc.proc_id
```

---

### 对照 4：NTN K_offset 计算（38.821 §6.3）

$$K_{\text{offset}} = \left\lceil \frac{2\tau + T_{\text{proc}}}{T_{\text{slot}}} \right\rceil$$

**对应代码**（`compute_ntn_harq_loss`）：

```python
tau_ms  = d_km / 300.0
rtt_ms  = 2 * tau_ms + 2.0          # +2ms 处理时间
slot_ms = 1.0 / (2 ** mu)
k_offset = int(np.ceil(rtt_ms / slot_ms))
```

---

## ⚙️ 仿真参数说明

| 参数 | 默认值 | 物理含义 | 修改建议 |
|---|---|---|---|
| `snr_db` | `0.0` | BLER vs 重传次数的工作 SNR | 改为 `-4` 观察更大合并增益 |
| `n_bits` | `256` | 信息比特数（系统位数量）| — |
| `n_cb_ratio` | `3.0` | N_cb / n_bits（编码膨胀比，对应约 1/3 码率）| — |
| `max_retx` | `3` | 最大重传次数 | 改为 `4` 看更多次合并 |
| `n_trials` | `2000` | 蒙特卡洛次数 | 增大至 `10000` 提升精度 |
| `altitude_km` | `550/1200` | LEO 轨道高度 | `35786` = GEO（极端情形）|
| `elevation_deg` | `10~90` | 仰角范围 | — |
| `mu` | `1` | Numerology | `0` 使 K_offset 数值更小 |
| `k1_base` | `4` | DCI K1 字段基础值 | 1~8（38.213 Table）|

---

## 📊 预期输出图表解读

### 图 1：`output_harq_circular_buffer.png`

```
4 个子图，对应 4 次传输（RV=0,2,3,1）

每个子图：X 轴=缓冲区位置（0~N_cb），Y 轴=是否被本次传输覆盖
颜色含义：
  彩色  = 本次新增覆盖区域（不同 RV 不同颜色）
  暗色  = 之前传输已覆盖（不再提供新信息，叠加 LLR）
  点线  = k₀ 起点标注
  虚线  = 系统位与校验位的分界（~35% 处）

关键观察：
  RV=0（TX1）：覆盖缓冲区左侧（系统位为主），新信息最多
  RV=2（TX2）：覆盖中部（校验位 1），与 RV=0 重叠极少
  RV=3（TX3）：覆盖右侧（校验位 2），几乎全部是新内容
  RV=1（TX4）：覆盖剩余空白，4 次后覆盖率接近 100%

异常情况：若累积覆盖率增长缓慢 →
  检查 E（每次传输比特数）是否 << N_cb，覆盖比例 = E/N_cb
```

### 图 2：`output_harq_cc_vs_ir.png`

```
左图：BLER vs 重传次数（CC 蓝色，IR 绿色）
  TX0（首传）：两者相同（无合并）
  TX1~TX3：IR 明显优于 CC，差距随重传次数扩大

右图：IR vs CC 的 BLER 改善倍数（条形图）
  TX0：倍数 = 1（无差别）
  TX3：倍数通常 > 5×（取决于 SNR 和码率）

工程解读：IR 在第 2~3 次重传时效果最显著，超过 3 次后
边际增益递减（缓冲区已接近满覆盖，等效码率接近极限）

异常情况：若 CC 和 IR 曲线几乎重合 →
  检查 n_cb_ratio 是否太小（< 2），导致每次 RV 覆盖几乎全缓冲区
```

### 图 3：`output_harq_bler_snr.png`

```
左图（IR）、右图（CC）：SNR vs BLER，4 条曲线对应 4 次传输

颜色：同一颜色的 4 条线透明度递减（首传最深，3次重传最浅）
线型：实线/虚线/点划线/点线 区分重传次数

关键观察：
  IR 曲线之间间距更大（每次重传效果更显著）
  CC 曲线之间间距均匀（约 3dB SNR 等效增益/次）
  两图横向比较：同等重传次数下，IR 曲线整体在 CC 左侧

NTN 解读：HARQ 禁用 = 只使用最上方的 TX0 曲线
  → 需要选择更保守的 MCS（目标初传 BLER 从 10% 降至 1%）
```

### 图 4：`output_harq_ntn_analysis.png`

```
子图 1（左上）：仰角 vs K_offset（LEO 550/1200km，μ=1）
  仰角越低 → 斜距越长 → τ 越大 → K_offset 越大
  红色虚线：16 个进程能覆盖的上限

子图 2（中上）：进程数 vs 信道利用率（不同 K1_eff）
  每条线对应一个 K1_eff 场景
  进程数 < K1_eff+1 时：利用率 < 100%，出现空洞

子图 3（右上）：吞吐量损失热力图（场景 × μ）
  绿色 = 损失低，可用 HARQ
  红色 = 损失高，建议禁用 HARQ 改用 RLC ARQ

子图 4（底部）：三策略时序甘特图
  地面TN：每 slot 均有调度，4 进程流水无空洞
  策略A（K-offset）：16进程满载，每 slot 均有数据
  策略B（进程不足）：大量灰色空洞，吞吐量损失明显
  策略C（HARQ禁用）：物理层每 slot 有数据，但无 HARQ 保障

异常情况：若策略 B 的空洞比例明显偏低 →
  检查仿真中 rng_gantt.random() 概率设置（应等于 16/K1_eff）
```

---

## 🔬 NTN Context

::: info NTN 提示 · Rel-17 (38.821 §6.3)

**HARQ 进程数瓶颈是 NTN 的核心工程挑战之一**：地面 TN 只需 4~8 个进程，NTN LEO 低仰角场景可能需要 40+，而协议上限仅 16。调整 μ（使用更大的 SCS）可以缩短 slot 时长，但同时增加了每帧调度次数，并不能从根本上解决矛盾（K_offset 的 slot 数同步增加）。

**HARQ 禁用并非"放弃可靠性"**：Rel-17 NTN 在禁用物理层 HARQ 时，RLC AM（确认模式）仍然工作，提供端到端的可靠重传。代价是重传时延从毫秒级升至秒级，因此只适用于非实时业务。

**实验建议**：修改 `altitude_km=35786`（GEO）、`elevation_deg=90`，观察 K_offset 高达 1900+ slots，完全超出协议范围——这就是为什么 GEO NTN 在 Rel-17 只作为研究项，Rel-18 才开始标准化。

**快速实验**：将 `n_cb_ratio` 从 3.0 改为 1.5（更高码率），观察 CC 和 IR 的差异缩小。理论上当码率 = 1（无冗余）时，CC 和 IR 完全相同——验证码率是决定 IR 增益的核心因素。

:::

---

## 📎 3GPP 协议溯源

| 代码模块 | 对应协议 | 章节 |
|---|---|---|
| `get_rv_start()` | TS 38.212 | §5.4.2.1（Table 5.4.2.1-2，BG1 起点）|
| `CircularBuffer.accumulate()` | TS 38.212 | §5.4.2（速率匹配，圆形缓冲区）|
| `simulate_bler_vs_retx()` | TS 38.321 | §5.3（HARQ 进程状态）|
| `HARQManager` | TS 38.321 | §5.3.2（多进程调度）|
| `compute_ntn_harq_loss()` | TR 38.821 | §6.3.3（NTN HARQ 时序）|
| RV 序列 0→2→3→1 | TS 38.212 | §5.4.2.1（标准推荐序列）|
| NDI 翻转逻辑 | TS 38.321 | §5.3.1（新传/重传判断）|
| K1 候选值列表 | TS 38.213 | §9.2.3（dl-DataToUL-ACK）|
