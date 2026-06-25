# beam_management_sim.py · 仿真说明文档

> **对应理论笔记**：[波束管理 Beam Management](/phase2/beam-management)
> **脚本位置**：`simulation/phase2/beam_management_sim.py`
> **验证目标**：通过 ULA 波束方向图、P1 双端扫描 RSRP 热图、P2 精化对比、BFR 状态机时序，验证 3GPP TR 38.802 §6.1.6.1 和 TS 38.321 §5.17 的核心流程。

---

## ⚡ 一分钟速览

```
ULA 阵列
  → array_factor(θ)：N 根阵元的相干叠加，决定波束宽度和旁瓣
  → beam_weights(θ₀)：相位转向权重，使主瓣指向 θ₀

P1 双端扫描
  → 8 个发射波束 × 8 个接收波束 = 64 个 RSRP 测量值
  → 热图中最亮点 = 最优波束对

P2 CSI-RS 精化
  → 固定 P1 接收方向，在 P1 Tx 附近配置 16 个更细的候选方向
  → 选 RSRP 最高的 CSI-RS 索引（CRI）上报给 gNB

BFR 状态机（38.321 §5.17）
  → PHY 层 RSRP 监测 → BFI 指示 → BFI_COUNTER → 波束失败
  → 候选波束识别 → CFRA PRACH → gNB 响应 → 恢复

NTN 分析
  → 对比 N=4~64 天线时，NTN 卫星角速度 vs 地面 UE 移动速度
  → 两者对波束有效时长的影响量化

核心结论：
  ① P2 在 P1 基础上平均可再改善 2~5dB（取决于天线数和 K 因子）
  ② BFR 总耗时 ≈ beamFailureDetectionTimer + 4 slots（地面 CFRA 响应）
  ③ NTN N=64 天线时波束有效时长约 8s，需要 ≤ 4s 周期刷新
```

**运行后得到 4 张图**：
- `output_beam_patterns.png`：ULA 多波束方向图（笛卡尔 + 极坐标）
- `output_p1_p2_rsrp.png`：P1 热图 + P2 精化柱图
- `output_bfr_timeline.png`：BFR 状态机时序图（RSRP + BFI Counter）
- `output_ntn_beam_validity.png`：NTN vs 地面波束有效时长对比

---

## 🛠️ 环境配置

```bash
pip install numpy matplotlib scipy

cd simulation/phase2
python beam_management_sim.py
```

**预计运行时间**：约 30~60 秒（P1 扫描矩阵 × 随机信道采样）。

---

## 📐 数学–代码对照

### 对照 1：ULA 阵列因子（38.214 §5.2.2.2）

**协议原理**：均匀线阵（ULA）的阵列因子为：

$$AF(\theta) = \sum_{n=0}^{N-1} w_n \cdot e^{j2\pi n \frac{d}{\lambda} \sin\theta}$$

转向权重 $w_n = \frac{1}{N} e^{-j2\pi n \frac{d}{\lambda} \sin\theta_0}$，使主瓣指向 $\theta_0$。

归一化后 3dB 波束宽度近似：

$$\theta_{3dB} \approx \frac{0.886}{N \cdot d/\lambda \cdot \cos\theta_0} \text{ (rad)}$$

**对应代码**（`ULAArray.array_factor`）：

```python
def steering_vector(self, theta_deg):
    theta_rad = np.deg2rad(theta_deg)
    psi = 2 * np.pi * self.d * np.sin(theta_rad)   # 相位增量
    return np.exp(1j * self.n_idx * psi)             # 转向向量

def array_factor(self, steer_deg, scan_range):
    w = self.beam_weights(steer_deg)   # w = conj(a(θ₀)) / N
    af = [np.abs(w @ self.steering_vector(th)) for th in scan_range]
    return 20 * np.log10(af / max(af))  # 归一化 dB
```

**验证**：`output_beam_patterns.png` 左图中，N=16 时波束宽度约 6.4°；N=64 时约 1.6°，符合 $\theta_{3dB} \propto 1/N$ 的理论关系。

---

### 对照 2：L1-RSRP 测量（38.214 §5.2.2）

**协议原理**：L1-RSRP 是接收参考信号在 DMRS RE 上的平均功率。仿真中简化为：

$$L1\text{-}RSRP = |h_{eff}|^2 + \sigma_n^2$$

其中 $h_{eff} = \mathbf{w}_{rx}^H \mathbf{H} \mathbf{w}_{tx}$，$\mathbf{H}$ 为莱斯信道矩阵。

**对应代码**（`SpatialChannel.measure_rsrp`）：

```python
# LOS 分量
los_gain = |w_rx @ a_rx_los| * |w_tx @ a_tx_los|

# 散射分量（8条随机路径）
scatter_gain = sum(|w_rx @ a_rx_s| * |w_tx @ a_tx_s| * |g_s|) / sqrt(N)

# 莱斯合并
h_total = sqrt(K/(K+1)) * los_gain + sqrt(1/(K+1)) * scatter_gain
rsrp_dbm = -70 + 10*log10(|h_total|² + noise_power)
```

---

### 对照 3：P1 双端扫描（TR 38.802 §6.1.6.1）

**协议原理**：

- gNB 发送 $N_{tx}$ 个 SSB（各方向），UE 用 $M_{rx}$ 个接收波束逐一测量
- 总测量次数：$N_{tx} \times M_{rx}$
- 选取 RSRP 最大的 (i, j) 组合 → 最优波束对

**对应代码**（`run_p1_sweep`）：

```python
for i, tx_deg in enumerate(tx_dirs):       # gNB 发射方向
    for j, rx_deg in enumerate(rx_dirs):   # UE 接收方向
        rsrp_matrix[i, j] = channel.measure_rsrp(...)

best_idx = rsrp_matrix.argmax()            # 全局最大
```

**验证**：`output_p1_p2_rsrp.png` 左图热图中，最亮点（最优波束对）应位于 LOS 方向（橙色虚线交叉处）附近。

---

### 对照 4：P2 CSI-RS 精化（38.214 §5.2.2）

**协议原理**：P2 在 P1 选定方向附近配置 $N_{CSI}$ 个精细候选波束（NZP-CSI-RS），UE 固定 P1 接收方向，测量各 CSI-RS 的 L1-RSRP，上报 CRI（最优 CSI-RS 索引）。

**对应代码**（`run_p2_refine`）：

```python
cand_tx = np.linspace(center - refine_range, center + refine_range, n_csi_rs)
fixed_rx = p1_result.best_rx_beam_deg   # 固定 P1 接收方向

rsrp_list = [channel.measure_rsrp(tx_arr, rx_arr, tx_deg, fixed_rx)
             for tx_deg in cand_tx]

best_cri = rsrp_list.argmax()   # → 上报给 gNB 的 CRI
```

**关键区别**：P2 与 P1 的循环结构相同，但 rx_deg 固定不变——这正是"P2 固定接收端"的代码体现。

---

### 对照 5：BFR 状态机（38.321 §5.17）

**协议流程**：

```
PHY 测量 RSRP < beamFailureDetectionThreshold
→ MAC 层累计 BFI（Beam Failure Instance）
→ BFI_COUNTER 达到 beamFailureInstanceMaxCount
→ 宣告波束失败
→ 扫描候选波束（candidateBeamRSList）
→ 找到 RSRP > rsrp-ThresholdBFR 的候选
→ 在对应 PRACH 资源上发送 BFR 请求
→ 接收 gNB 响应（新方向 PDCCH）→ 恢复成功
```

**对应代码**（`BFRStateMachine.step`）：

```python
if state == 'NORMAL' and rsrp < threshold:
    bfi_counter += 1
    bfd_timer = bfd_timer_slots
    state = 'DETECTING'

elif state == 'DETECTING':
    if rsrp < threshold:
        bfi_counter += 1
        bfd_timer = bfd_timer_slots    # 重启计时器
        if bfi_counter >= bfi_max_count:
            state = 'RECOVERING'       # 宣告失败
    else:
        bfi_counter = 0; state = 'NORMAL'  # 波束自恢复

elif state == 'RECOVERING':
    if candidate_rsrp > threshold:
        state = 'NORMAL'   # CFRA 成功
    elif rec_timer <= 0:
        state = 'RLF'      # 超时 → 无线链路失败
```

**验证**：`output_bfr_timeline.png` 上图 RSRP 应在遮挡区间（slot 60~90）骤降，BFI Counter（下图）应在此期间连续增大，在 BFI_COUNTER = maxCount 时宣告失败（红色竖线），随后快速恢复（绿色竖线）。

---

## ⚙️ 仿真参数说明

| 参数 | 默认值 | 物理含义 | 修改建议 |
|---|---|---|---|
| `tx_array.N` | `16` | gNB 天线数 | 改为 `64` 模拟 Massive MIMO |
| `rx_array.N` | `4` | UE 天线数 | FR2 手机通常 4~8 根 |
| `d_lambda` | `0.5` | 阵元间距（波长）| > 0.5 会出现栅瓣（见 BeamPatternVisualizer）|
| `los_az_deg` | `15.0` | LOS 方向（度）| 改变后观察 P1 热图最亮点偏移 |
| `k_factor_db` | `6.0` | 莱斯因子 K | 改为 `-20` 模拟纯散射（Rayleigh）|
| `snr_db` | `20.0` | 参考 SNR | 降低 SNR 会使热图噪声变大 |
| `n_tx_beams` | `8` | P1 发射扫描波束数（≤ Lmax）| FR2 改为 `64` |
| `n_rx_beams` | `8` | P1 接收扫描波束数 | — |
| `n_csi_rs` | `16` | P2 候选 CSI-RS 数 | — |
| `refine_range_deg` | `20.0` | P2 精化角度范围（度）| 设为 P1 波束宽度的 2 倍 |
| `bfi_max_count` | `3` | BFR 触发阈值 | 减小→更灵敏，增大→更稳定 |
| `bfd_timer_slots` | `20` | BFI 计数窗口 | 20 slots @ 30kHz ≈ 10ms |
| `rsrp_threshold_dbm` | `-92.0` | 波束失败门限 | 参考基站覆盖边缘 RSRP |
| `obstruction_start/end` | `60/90` | 遮挡开始/结束 slot | 改变遮挡时长，观察 BFR 是否超时 |

---

## 📊 预期输出图表解读

### 图 1：`output_beam_patterns.png`

```
左图（笛卡尔）：
  8 条不同颜色的曲线 = 8 个不同主瓣方向的波束
  各波束主瓣不重叠（均匀间距），旁瓣约 -13dB
  水平虚线 = -3dB 参考线，双侧宽度即为 3dB 波束宽度

  异常：若波束宽度随 steer_deg 增大而变宽
  → 正常现象（cos(θ) 因子），端射方向（90°）波束最宽

右图（极坐标）：
  各波束在半圆上的花瓣图
  内圈 = 增益低，外圈 = 增益高

验证：主瓣之间不重叠，旁瓣应低于主瓣 13dB 以上
```

### 图 2：`output_p1_p2_rsrp.png`

```
左图（热图）：
  颜色越亮（黄色）= RSRP 越高
  最亮点 ≈ LOS 方向（橙色虚线交叉处）
  绿色 * = P1 选出的最优波束对位置

  异常：若最亮点偏离 LOS 方向较远（> 10°）
  → K 因子偏低（散射主导），增大 k_factor_db 观察改善

右图（柱图）：
  16 根柱子 = 16 个 CSI-RS 候选发射方向
  绿色高亮柱 = P2 选出的最优 CRI
  橙色虚线 = P1 基准 RSRP
  绿色柱高于橙色线即说明 P2 有效改善
```

### 图 3：`output_bfr_timeline.png`

```
上图（RSRP 时序）：
  蓝线 = 服务波束 L1-RSRP 随 slot 变化
  红虚线 = beamFailureDetectionThreshold
  slot 60~90：RSRP 急剧下降（模拟遮挡）

  关键标注：
    橙色竖线 = BFI 实例（RSRP 低于门限的时刻）
    红色竖线 = 波束失败宣告（BFI_COUNTER = maxCount）
    绿色竖线 = 恢复成功（PDCCH 在新方向解码）

下图（BFI Counter）：
  阶梯形橙线 = BFI_COUNTER 随时间递增
  红虚线 = maxCount 阈值（= 3）
  Counter 达到 3 后应立即归零（恢复成功）

异常：若 BFR 未成功（state = 'RLF'）：
  → 减小 obstruction_end 或增大 recovery_timer_slots
```

### 图 4：`output_ntn_beam_validity.png`

```
左图（有效时长对比）：
  橙柱 = NTN LEO 550km 场景，波束有效时长（s）
  蓝柱 = 地面（3km/h UE，100m 基站），波束有效时长（s）
  Y 轴对数坐标

  关键结论：
    N=8 时：NTN≈40s，地面≈200s（地面是 NTN 的 5倍）
    N=64 时：NTN≈8s，地面≈50s（波束越窄，NTN 相对更不利）
    NTN 需要比地面频率约 5~10 倍的波束刷新

右图（波束宽度 vs 天线数）：
  绿线对数递减
  N=4 → 约 25°，N=64 → 约 1.6°
  工程直觉：每翻倍天线数，波束宽度减半（≈ -3dB/octave）
```

---

## 🔬 NTN Context

:::info NTN 提示 · Rel-17 (TR 38.821)

**波束管理在 NTN 中的三大挑战**：

1. **大传播时延影响 TCI State 切换响应**  
   地面切换延迟 << 1ms；LEO RTT ≈ 4~21ms；GEO RTT ≈ 480ms。  
   对于 GEO NTN，波束切换延迟远超 `beamFailureRecoveryTimer` 最大值（240ms），  
   Rel-17 讨论了通过 `ntn-Config` 参数扩展恢复窗口。

2. **卫星运动导致的波束方向持续漂移**  
   LEO 卫星以 7.9km/s 飞过，角速度约 0.05°/s（仰角 45° 时）。  
   N=64 天线时波束宽度 ≈ 1.6°，有效时长约 16s——必须以 ≤ 8s 的周期更新 P2/P3。  
   Rel-17 建议 UE 基于星历预测方向，提前主动调整接收波束方向。

3. **BFR PRACH 窗口不够大**  
   BFR 使用与普通 RACH 相同的 `ra-ResponseWindow`，Rel-17 扩展至 640 slots 覆盖 LEO RTT。

**实验建议**：在 `simulate_bfr_scenario` 中设置 `recovery_timer_slots = 80`（40ms@30kHz ≈ LEO RTT × 2），观察 GEO 场景（`recovery_timer_slots = 1000`）时是否触发 RLF。

:::

---

## 📎 3GPP 协议溯源

| 代码模块 | 对应协议 | 章节 |
|---|---|---|
| `ULAArray.array_factor` | TS 38.214 | §5.2.2.2（波束赋形权重）|
| `SpatialChannel.measure_rsrp` | TS 38.214 | §5.2.2（L1-RSRP 测量）|
| `run_p1_sweep` | TR 38.802 | §6.1.6.1（P1 SSB 双端扫描）|
| `run_p2_refine` | TR 38.802 | §6.1.6.1（P2 CSI-RS 精化）|
| `BFRStateMachine` | TS 38.321 | §5.17（BFR 检测与恢复）|
| `BFRConfig` | TS 38.321 | §5.17 + §6.3.2（beamFailureRecoveryConfig IE）|
| `compare_ntn_ground_beam_validity` | TR 38.821 | §6（NTN 波束管理分析）|
