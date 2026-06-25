# csi_sim.py 代码说明

> **对应理论**：[CSI 框架](/phase2/csi-framework)  
> **仿真文件**：`simulation/phase2/csi_sim.py`  
> **输出图表**：5 张 PNG，均输出至 `output/` 子目录

---

## 运行方式

```bash
cd simulation/phase2
pip install numpy matplotlib scipy
python csi_sim.py
```

---

## 图表说明

### 图 1 `output_csi_rs_resource_grid.png` — CSI-RS 时频 RE 占用

**数学对照** (38.211 §7.4.1.5)：

展示 1 端口/4 端口/8 端口三种 CSI-RS 配置在 1 RB × 1 slot（12 SC × 14 符号）网格上的 RE 分布。

| 参数 | 代码位置 | 说明 |
|---|---|---|
| `re_positions` | `plot_csi_rs_resource_grid()` | 各端口对应的 (符号, 子载波) 偏移 |
| 密度 ρ | `density` 字段 | RE 数/RB，决定频率分辨率 |
| 端口数 | `cfg["ports"]` | 决定可测量的天线维度 |

**关键观察**：端口数增加时，CSI-RS 占用的 RE 数按比例增加，频域 overhead 同步上升。实际部署中端口数与可测信道维度直接相关。

---

### 图 2 `output_csi_sinr_cqi_mapping.png` — SINR → CQI 映射

**数学对照** (38.214 §5.2.2.1 Table 5.2.1.3-1)：

```python
# CQI 选择逻辑（核心）
def sinr_to_cqi(sinr_db):
    sinr_lin = 10 ** (sinr_db / 10)
    best = 0
    for cqi, (mod, cr, se) in CQI_TABLE.items():
        snr_needed_lin = 2 ** se - 1          # Shannon 极限
        if sinr_lin >= snr_needed_lin * 1.5:  # 1.5 ≈ 1.7dB 实现损耗
            best = cqi
    return best
```

**BLER 曲线近似**（S 型函数代替仿真 LDPC 曲线）：

$$
\text{BLER}(\text{SINR}, \text{SE}) = \frac{1}{1 + e^{1.2 \cdot (\text{SINR} - \text{SINR}_{\text{needed}})}}
$$

其中 $\text{SINR}_{\text{needed}} = 10\log_{10}(2^{\text{SE}}-1) + 2.5 \text{ dB}$（包含约 2.5 dB 实现损耗）。

**图表解读**：
- 上半图：CQI 随 SINR 的阶梯变化，背景色区分 QPSK/16QAM/64QAM 三个区域
- 下半图：CQI 对应的频谱效率 vs Shannon 极限，灰色填充区域为实现损耗间隙

---

### 图 3 `output_csi_ri_selection.png` — RI 选择 Monte Carlo

**算法流程**：

```python
for r in range(1, max_layers + 1):
    W = Vh[:r, :].conj().T        # SVD 最优预编码（Non-codebook 近似）
    H_eff = H_full @ W            # 等效信道 (N_RX × r)
    sinr_layers = mmse_sinr_per_layer(H_eff, noise_var)
    se = sum(cqi_to_se(sinr) for sinr in sinr_layers)
```

**MMSE 每层 SINR**（38.214 推导）：

$$
\text{SINR}_k = \frac{1}{[(\mathbf{H}^H\mathbf{H} + \sigma^2\mathbf{I})^{-1}]_{kk} \cdot \sigma^2} - 1
$$

**关键结论**：
- 低 SNR（< 5 dB）：最优 RI=1，单流集中功率优于分流
- 中高 SNR（10~25 dB）：最优 RI=2~4，多流增益显著
- 自适应 RI 相比固定单流，在 SNR=15dB 时吞吐量增益约 50%

---

### 图 4 `output_csi_amc_closed_loop.png` — AMC 闭环

**OLLA（外环自适应）实现**：

```python
# 非对称步长（加速收敛）
if nack:
    offset -= OLLA_STEP_DOWN   # 0.9 dB（NACK 惩罚大）
else:
    offset += OLLA_STEP_UP     # 0.1 dB（ACK 奖励小）

# 下次 CQI 使用修正后 SINR
cqi = sinr_to_cqi(sinr_measured + offset)
```

非对称步长设计源于目标 BLER=10%：期望 9× ACK 对应 1× NACK，步长比约为 9:1 = 0.1:0.9。

**图表解读**：
- 左列（理想，无测量噪声）：OLLA 稳定收敛，BLER 收敛至目标 10%
- 右列（2dB 测量噪声）：CQI 波动加大，OLLA 偏移量振荡，但长期 BLER 仍收敛（鲁棒性）

---

### 图 5 `output_csi_channel_aging.png` — 信道老化

**Clarke 信道老化模型**：

$$
h(t + \Delta t) = \rho \cdot h(t) + \sqrt{1 - \rho^2} \cdot n, \quad n \sim \mathcal{CN}(0,1)
$$

相关系数（Bessel 函数，38.821 §6.3 参考）：

$$
\rho = J_0(2\pi f_d \Delta t), \quad f_d = \frac{v \cdot f_c}{c}
$$

```python
import scipy.special
rho = scipy.special.j0(2 * np.pi * fd * delay_s)
```

**实际意义**：

| ρ 范围 | 物理含义 | 配置建议 |
|:---:|---|---|
| ρ > 0.9 | CQI 仍可信，AMC 有效 | 当前上报周期可接受 |
| 0.7 < ρ < 0.9 | CQI 开始失效，NACK 率上升 | 缩短上报周期或增大 OLLA 步长 |
| ρ < 0.7 | CQI 完全失效，退化为盲 AMC | 强制降 MCS 或切换 AP-CSI |

**NTN 场景**：LEO 550km 时传播时延 ≈ 2ms，RTT ≈ 6ms。若上报周期为 40sl（20ms），总时延达 26ms，对移动 UE（v=300km/h 飞机）ρ 可降至 0.4 以下，CQI 完全失效。

---

## 参数速查

| 参数 | 默认值 | 含义 | 修改建议 |
|---|---|---|---|
| `N_TX`, `N_RX` | 4, 4 | 天线数 | 改为 8×4 模拟 massive MIMO |
| `N_TRIAL` | 500 | Monte Carlo 次数 | ≥ 1000 提高精度 |
| `OLLA_STEP_DOWN` | 0.9 dB | OLLA NACK 惩罚 | 越大收敛越快，振荡越大 |
| `TARGET_BLER` | 0.10 | AMC 目标 BLER | URLLC 场景可改为 0.01 |
| `v_ms` | 30/3.6 m/s | UE 移动速度 | 改为 300/3.6 模拟飞机 NTN |
| `fc` | 3.5e9 Hz | 载波频率 | FR2 场景改为 28e9 |

---

## 与理论笔记的对照

| 理论概念 | 对应仿真函数 | 输出图 |
|---|---|---|
| CSI-RS 时频 RE 配置 | `plot_csi_rs_resource_grid()` | 图 1 |
| SINR → CQI 映射（38.214 Table 5.2.1.3-1）| `sinr_to_cqi()` | 图 2 |
| RI 选择：多层 SE 最大化 | `plot_ri_selection()` | 图 3 |
| AMC 内环（CQI→MCS）+ OLLA 外环 | `plot_amc_closed_loop()` | 图 4 |
| 信道老化：上报周期 vs Tc | `plot_channel_aging()` | 图 5 |
