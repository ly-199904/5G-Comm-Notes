# pdcch_sim.py · 仿真说明文档

> **对应理论笔记**：[PDCCH & DCI 调度机制](/phase2/pdcch-dci)
> **脚本位置**：`simulation/phase2/pdcch_sim.py`
> **验证目标**：通过 CORESET 可视化、CCE 索引计算、盲检状态机和 NTN K-offset 分析，验证 3GPP 38.211 §7.3 / 38.212 §7.3 / 38.213 §10 中 PDCCH 调度机制的核心原理。

---

## ⚡ 一分钟速览

```
这个脚本在验证什么？

CORESET 时频资源：
  45 bit bitmap → 确定哪些 6-RB 块属于 CORESET
  duration 1/2/3 → 时域符号数
  n_rb × duration / 6 = CCE 总数

盲检（Blind Decoding）：
  UE 不知道 DCI 在哪 → 遍历所有 AL × 候选位置
  CCE 起始索引 = f(Y_p, AL, 候选序号, N_CCE)
  Y_p = UE 专属哈希（防止所有 UE 在同一 CCE 碰撞）
  上限：44 次/slot（38.213 §10.1）

NTN K-offset（Rel-17）：
  地面：K1=4 slots → HARQ-ACK 在 slot N+4 发出
  NTN ：K1=4 + K_offset=15 → HARQ-ACK 在 slot N+19 发出
  K_offset = ⌈RTT_total / T_slot⌉（需覆盖 2×单程时延 + 处理时间）
```

**运行后你会得到 3 张图 + 终端分析报告**：
- `output_coreset_visualization.png`：CORESET 时频位置可视化
- `output_blind_decoding_analysis.png`：盲检次数统计与容量分析
- `output_ntn_harq_timeline.png`：NTN HARQ 时序对比（有/无 K-offset）

---

## 🛠️ 环境配置

```bash
# 安装依赖
pip install numpy matplotlib

# 确认在 simulation/phase2/ 目录下运行
cd simulation/phase2
python pdcch_sim.py
```

**预计运行时间**：< 15 秒（无深度迭代）

---

## 📐 数学–代码对照

### 对照 1：CORESET CCE 数量（38.211 §7.3.2）

**协议公式**：

$$
N_{CCE} = \frac{N_{RB}^{CORESET} \times \text{duration}}{6}
$$

**对应代码**（`CORESETConfig` 属性）：

```python
@property
def n_cce(self) -> int:
    return self.n_reg // 6   # n_reg = n_rb × duration
```

**验证**：对照终端输出的 CORESET 信息，检查各 AL 下最大候选数 = `n_cce // AL`。

---

### 对照 2：CCE 起始索引（38.213 §10.1 Eq.11-1）

**协议公式**：

$$
n_{CCE,p,m} = AL \times \left\{ \left(Y_p + \left\lfloor \frac{m \cdot N_{CCE,p}}{AL \cdot M_{s,\max}^L} \right\rfloor + n_{CI} \right) \bmod \left\lfloor \frac{N_{CCE,p}}{AL} \right\rfloor \right\}
$$

**对应代码**（`compute_cce_start` 函数）：

```python
M_L       = max(1, n_cce // al)
floor_val = n_cce // al
inner     = (Y_p + (candidate_idx * n_cce) // (al * M_L) + n_ci) % floor_val
return al * inner
```

---

### 对照 3：UE 专属哈希 Y_p（38.213 §10.1）

**协议公式**：

$$
Y_{-1} = \text{RNTI}, \quad Y_p = (A_p \times Y_{p-1}) \bmod D
$$

其中 $A_p = 39827$，$D = 65537$（质数，保证最大周期）。

**对应代码**（`compute_Y_p` 函数）：

```python
D   = 65537
Y_p = rnti % D
for _ in range(slot_idx + 1):
    Y_p = (A_p * Y_p) % D
return Y_p
```

**为什么需要 Y_p**：若所有 UE 从 CCE#0 开始盲检，gNB 只能把 PDCCH 发在 CCE#0，造成 CORESET 浪费。Y_p 使不同 UE 的起始位置均匀分布，充分利用 CORESET 容量。

---

### 对照 4：NTN K-offset 计算（38.821 §6.3）

**计算路径**：

$$
\tau = \frac{\sqrt{(R_E + h)^2 - (R_E \cos\theta)^2} - R_E \sin\theta}{c}
$$

$$
K_{\text{offset}} = \left\lceil \frac{2\tau + T_{\text{proc}}}{T_{\text{slot}}} \right\rceil
$$

**对应代码**（`compute_k_offset` 函数）：

```python
d_km    = np.sqrt(r_km**2 - (RE_KM * cos_e)**2) - RE_KM * sin_e
tau_ms  = d_km / 300.0
rtt_ms  = 2 * tau_ms + processing_ms
k_offset = int(np.ceil(rtt_ms / slot_ms))
```

---

## ⚙️ 仿真参数说明

| 参数 | 默认值 | 物理含义 | 修改建议 |
|---|---|---|---|
| `freq_bitmap` | `'111111...0'` (18×1) | CORESET 频域范围（45 bit）| 改为全1观察最大 CORESET |
| `duration` | `2` | CORESET 时域符号数 | 1/2/3，影响 CCE 总数 |
| `n_candidates` | `{2:4, 4:2, 8:1}` | 各 AL 的候选数 | 调整后观察盲检次数变化 |
| `monitoring_period` | `1` | Search Space 监听周期（slots）| 改为 4 观察功耗节省效果 |
| `altitude_km` | `550` | LEO 轨道高度 | 1200 = OneWeb |
| `elevation_deg` | `30` | 卫星仰角 | 10=边缘，90=正上方 |
| `mu` | `1` | Numerology | 影响 slot 时长和 K_offset 数值 |
| `k1_base` | `4` | DCI 中 K1 字段值 | 1~8（DCI format 1_1 最大值）|
| `k_offset` | `15` | NTN K_offset | 根据 RTT/T_slot 计算 |

---

## 📊 预期输出图表解读

### 图 1：`output_coreset_visualization.png`

```
X 轴：OFDM 符号（#0~#13，一个完整 slot）
Y 轴：子载波编号（频域，低→高）

颜色含义：
  红色区域  = CORESET（PDCCH 候选区）
  绿色点缀  = PDCCH DMRS（信道估计参考信号）
  蓝色区域  = PDSCH 数据（CORESET 区域之外）
  暗色背景  = 空 RE / 其他信道

关键观察：
  ① CORESET 只占前 duration 个符号（本例 2 个）
  ② CORESET 频域不是全带宽，由 bitmap 决定
  ③ PDSCH 从符号 #2 开始（CORESET 结束后）

异常情况：若 CORESET 和 PDSCH 重叠 →
  说明 monitoringSymbolsWithinSlot 或 time_domain_ra 配置有误
```

### 图 2：`output_blind_decoding_analysis.png`

```
左图：各 AL 盲检候选数条形图
  条形高度 = 该 AL 的候选数（来自 n_candidates 配置）
  颜色从蓝（AL=1）到红（AL=16），鲁棒性递增

右图：总盲检次数 vs 44 次上限（环形图）
  绿色 = 在上限内（安全）
  红色 = 超出上限（需减少候选数或 Search Space 数量）

关键读法：
  若总次数 < 44 → 还有余量，可以增加候选数或添加 Search Space
  若总次数 ≈ 44 → 接近上限，谨慎添加新配置
  若总次数 > 44 → 协议违规！UE 无法完成所有盲检

实验：将 n_candidates 改为 {1:8, 2:8, 4:4, 8:2, 16:1}，
      观察总次数 = 23，仍在上限内但较密集
```

### 图 3：`output_ntn_harq_timeline.png`

```
时序甘特图：
  蓝色箭头 = DCI + PDSCH 下行传播（gNB → UE）
  绿色方块 = UE 侧 LDPC 解码时间
  红色虚箭头 = 无 K-offset 的 HARQ-ACK（❌ 过早，gNB 还未准备好接收）
  绿色实箭头 = 有 K-offset 的 HARQ-ACK（✅ Rel-17 正确时序）

核心洞察：
  无 K-offset：UE 在 slot N+4 发 ACK，此时 RTT 才过了一半
               gNB 预期在 N+4+15=N+19 收到 ACK → 完全错位
  有 K-offset=15：UE 在 slot N+4+15=N+19 发 ACK，gNB 恰好能收到
               整个 HARQ 时序对齐 ✅

NTN 调试技巧：
  若现场发现 HARQ NACK 率异常高但 PDSCH BLER 正常 →
  首先检查 k-Offset-r17 是否正确配置
```

---

## 🔬 NTN Context

::: info NTN 提示 · Rel-17 (38.821 §6.3 / 38.213 §9.2.3)

**K-offset 是 NTN DCI 适配的核心**：不配置 K-offset，UE 的 HARQ-ACK 发送时机早于 gNB 预期，gNB 认为 NACK（默认），触发不必要的重传，浪费无线资源并增大时延。

**K-offset 的计算应留有余量**：单程时延随卫星仰角实时变化（仰角 10°→90°，时延变化可达 3 倍），建议 K_offset 按最低仰角（最大时延）配置，保证全覆盖范围内均有效。

**快速实验**：将 `k_offset=0`（地面默认）和 `k_offset=15`（NTN 配置）分别传入 `analyze_ntn_harq_timeline`，对比两种时序图，直观感受 K-offset 的必要性。

**PDCCH 容量与 NTN 高负载的关系**：LEO 卫星的波束覆盖可能包含数千 UE（相比地面宏蜂窝几十到几百 UE）。在高负载场景下，44 次/slot 的盲检上限意味着每个 UE 的调度机会减少。Rel-17 正在研究更大 CORESET 和更多 Search Space 的扩展方案。

:::

---

## 📎 3GPP 协议溯源

| 代码模块 | 对应协议 | 章节 |
|---|---|---|
| `CORESETConfig.n_cce` | TS 38.211 | §7.3.2.2（REG/CCE 映射）|
| `compute_Y_p()` | TS 38.213 | §10.1（UE 专属哈希）|
| `compute_cce_start()` | TS 38.213 | §10.1 Eq.(11-1) |
| `blind_decode_slot()` | TS 38.213 | §10.1（盲检流程）|
| `DCI_1_1` 字段列表 | TS 38.212 | §7.3.1.2.2（DCI format 1_1）|
| `compute_k_offset()` | TR 38.821 | §6.3（NTN 调度时序）|
| 盲检次数上限（44）| TS 38.213 | §10.1 Table 10.1-1 |
| CORESET bitmap（45 bit）| TS 38.331 | ControlResourceSet IE |
