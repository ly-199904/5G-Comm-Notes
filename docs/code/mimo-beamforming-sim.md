> 📂 代码库：`simulation/phase2/mimo_sim.py`

# mimo_sim.py · 仿真说明文档

> **对应理论笔记**：[MIMO & Beamforming](/phase2/mimo-beamforming)
> **脚本位置**：`simulation/phase2/mimo_sim.py`
> **验证目标**：通过容量曲线、信道秩分布、DMRS RE 分配可视化和预编码波束方向图，验证 38.211 §7.3.1 层映射/预编码链路、38.214 §5.2.2 码本机制，以及 NTN LOS 信道对 MIMO 空间复用能力的影响。

---

## ⚡ 一分钟速览

```
这个脚本在验证什么？

信道容量（香农公式）：
  SISO：C = log₂(1 + SNR)
  MIMO：C = log₂ det(I + SNR/N_T × HH†)
  → SNR=20dB：SISO≈6.7 bit/s/Hz，4×4≈约 20 bit/s/Hz

NTN LOS 信道（莱斯 K=10dB）对比瑞利：
  信道矩阵趋近秩 1 → 多层增益大幅下降
  → NTN 主推单用户波束成形，而非空间复用

DMRS RE 效率（每个 RB，14 符号）：
  Type1 CDM=1（SISO）：DMRS 6RE → PDSCH 138RE（效率 82%）
  Type1 CDM=2（4层）：DMRS 12RE → PDSCH 132RE（效率 79%）
  Type2 CDM=3（6层）：DMRS 12RE → PDSCH 132RE（效率 79%）
```

**运行后你会得到 5 张图 + 终端 RE 效率汇总表**：
- `output_mimo_capacity.png`：MIMO 容量 vs SNR（绝对值 + 相对 SISO 增益）
- `output_mimo_rank.png`：信道矩阵秩分布（瑞利 vs 莱斯，NTN 核心差异）
- `output_dmrs_re_allocation.png`：DMRS Type 1/2 频域 RE 占用（4 种配置）
- `output_mimo_precoding_beam.png`：预编码波束方向图（8 端口 ULA，各 PMI）
- `output_mimo_bler.png`：MIMO BLER vs SNR（瑞利 vs LOS，1/2/4 层对比）

---

## 🛠️ 环境配置

```bash
pip install numpy matplotlib scipy

cd simulation/phase2
python mimo_sim.py
```

**预计运行时间**：

| 模块 | 预计时间 |
|---|---|
| 容量 vs SNR（300次信道实现）| 2~3 分钟 |
| 信道秩分布 | 30~60 秒 |
| DMRS RE 可视化 | < 5 秒 |
| 波束方向图 | < 10 秒 |
| BLER vs 层数（300次）| 2 分钟 |

---

## 📐 数学–代码对照

### 对照 1：层映射（38.211 §7.3.1.3）

**协议公式**（单码字）：

$$x^{(i)}(k) = d(i + k\nu), \quad i = 0,\ldots,\nu-1$$

**对应代码**（`layer_map`）：

```python
for k in range(M_symb // nu):
    for i in range(nu):
        x[i, k] = symbols[i + k * nu]  # 轮询分配
```

---

### 对照 2：预编码（38.211 §7.3.1.4）

**协议公式**：

$$\mathbf{y}(i) = \mathbf{W} \mathbf{x}(i), \quad \mathbf{W} \in \mathbb{C}^{p \times \nu}$$

**对应代码**（`type1_codebook_multilayer`，DFT 码本）：

```python
W[row, col] = np.exp(1j * 2 * np.pi * col * row / n_ports)
W /= np.sqrt(n_ports)   # 功率归一化
```

---

### 对照 3：MMSE 检测器

$$\hat{\mathbf{x}} = (\mathbf{H}_{\text{eff}}^H \mathbf{H}_{\text{eff}} + \sigma^2 \mathbf{I})^{-1} \mathbf{H}_{\text{eff}}^H \mathbf{r}$$

**对应代码**（`mmse_detector`）：

```python
A     = H_eff.conj().T @ H_eff + sigma2 * np.eye(nu)
x_hat = np.linalg.solve(A, H_eff.conj().T @ r)
```

---

### 对照 4：莱斯信道（NTN LOS 建模）

**协议背景**：NTN 信道由 LOS 主导，用莱斯信道建模：

$$\mathbf{H} = \sqrt{\frac{K}{K+1}} \mathbf{H}_{\text{LOS}} + \sqrt{\frac{1}{K+1}} \mathbf{H}_{\text{NLOS}}$$

**对应代码**（`generate_rician_channel`）：

```python
H_los  = a_R @ a_T.conj().T                        # ULA 阵列响应外积
H_nlos = generate_rayleigh_channel(N_R, N_T, rng)  # i.i.d. 瑞利
H = sqrt(K/(K+1)) * H_los + sqrt(1/(K+1)) * H_nlos
```

---

## ⚙️ 仿真参数说明

| 参数 | 默认值 | 物理含义 | 修改建议 |
|---|---|---|---|
| `n_realizations` | `300` | 容量计算的信道实现次数 | 增至 `1000` 提升精度 |
| `K_factor` | `10`（线性）| 莱斯 K 因子（≈10dB LOS）| `0`=纯瑞利，`100`=纯LOS |
| `N_R, N_T` | `4, 4` | 收发天线数 | 改为 `8,8` 观察 8 层极限 |
| `n_ports` | `8` | 波束方向图天线端口数 | — |
| `n_trials` | `300` | BLER 仿真次数 | 增至 `1000` 提升精度 |
| `threshold_db` | `-20` | 信道秩判断阈值（dB）| — |

---

## 📊 预期输出图表解读

### 图 1：`output_mimo_capacity.png`

```
左图：绝对容量（bit/s/Hz）vs SNR
  SISO < 2x2 < 4x4 < 8x8（瑞利信道）
  2x2 LOS（虚线）明显低于 2x2 瑞利
  → LOS 信道矩阵秩低，MIMO 增益受限

右图：相对 SISO 的容量增益倍数
  高 SNR 时：4x4 ≈ 4× SISO（接近理论 min(N_R,N_T) 倍）
  LOS 2x2：增益倍数接近 1（退化为 SISO 性能）

异常情况：若 LOS 曲线与瑞利重合 →
  检查 K_factor 是否生效（应 > 0）
```

### 图 2：`output_mimo_rank.png`

```
左图：秩分布直方图（K=0 vs K=10）
  K=0（纯瑞利）：秩均匀分布，4×4 矩阵多为满秩（4）
  K=10（强LOS）：秩集中在 1，偶尔为 2

右图：平均秩 vs K 因子（dB）
  K → -∞（纯瑞利）：平均秩 ≈ min(N_R,N_T) = 4
  K → +∞（纯LOS）：平均秩 → 1
  NTN 典型 K > 10dB → 平均秩 ≈ 1~1.5

工程结论：NTN 使用 > 2 层空间复用几乎无意义；
  重点应放在波束成形增益和多用户 MIMO（MU-MIMO）
```

### 图 3：`output_dmrs_re_allocation.png`

```
4 个子图，对应 4 种 DMRS 配置
每格：D=DMRS，P=PDSCH，括号内数字=CDM 组编号

Type 1 CDM=1：偶数子载波 DMRS，奇数子载波可用于 PDSCH
Type 1 CDM=2：全部 12 个子载波均被 DMRS 占用（两组各 6 个）
Type 2 CDM=1：前 2+6 子载波中各 1 对用于 DMRS（稀疏）
Type 2 CDM=3：3 组共 12 个子载波全部被 DMRS 占用

关键观察：
  Type 2 CDM=3 与 Type 1 CDM=2 的 PDSCH RE 数相同（12 RE/RB 被占）
  Type 2 在每 RB 内可支持更多端口（6 vs 4），代价是相同 RE 开销
```

### 图 4：`output_mimo_precoding_beam.png`

```
极坐标方向图（0°=正前方）
左图：8 个 PMI 对应 8 个波束方向（均匀分布 -90°~90°）
右图：PMI=0 和 PMI=4 的对比（相反方向，180° 旋转关系）

工程意义：
  UE 上报 PMI → gNB 选择对应 DFT 权重 → 波束指向目标 UE
  PMI 分辨率 = 1/N_ports × 180° ≈ 22.5°（8 端口时）
  更多端口 → 波束更窄 → 增益更高 → 更精确的空间对准
```

### 图 5：`output_mimo_bler.png`

```
左图（瑞利）：
  1 层 → 2 层 → 4 层：BLER 随层数增加而升高（更难解调）
  但吞吐量 = (1-BLER) × layers × Qm，最优层数取决于 SNR

右图（LOS K=10dB）：
  4 层 BLER 远高于瑞利（信道秩不足，MMSE 检测器失效）
  1 层 BLER 两者接近（单流传输不受秩影响）
  → 验证 NTN LOS 场景应降低层数
```

---

## 🔬 NTN Context

::: info NTN 提示 · Rel-17 (38.821 §6.3)

**NTN 的 MIMO 核心矛盾**：地面 MIMO 依赖多径散射提供信道独立性（高秩），NTN 卫星信道以 LOS 主导，信道矩阵趋近秩 1，空间复用层数严重受限。增加天线数量对单 UE 的空间复用几乎没有帮助，但对**多用户 MIMO（MU-MIMO）**和**波束成形**增益很大。

**实验建议**：将 `K_factor` 从 0 逐步增加到 100，观察 `plot_channel_rank_distribution` 中平均秩的下降曲线——这直观展示了"为什么 NTN 不能直接套用地面 MIMO 策略"。

**DFT-s-OFDM 与单层的关系**（见 OFDM 课）：NTN 上行优先 DFT-s-OFDM，而 DFT-s-OFDM 只支持**单层传输**（`transformPrecoder=enabled` 时 MIMO 层数强制为 1）。这与 LOS 信道单秩的特性恰好吻合——NTN UE 上行本来就不需要多层。

:::

---

## 📎 3GPP 协议溯源

| 代码模块 | 对应协议 | 章节 |
|---|---|---|
| `layer_map()` | TS 38.211 | §7.3.1.3（层映射，单/双码字）|
| `type1_codebook_multilayer()` | TS 38.214 | §5.2.2.2.1（Type I 单面板码本）|
| `mmse_detector()` | TS 38.214 | §5.2.2（MMSE-IRC 接收机参考）|
| `generate_rician_channel()` | TR 38.901 | §7.7（信道模型，莱斯 K 因子）|
| `DMRSConfig.dmrs_re_per_rb_per_symbol` | TS 38.211 | §7.4.1.1.2（DMRS Type 1/2 频域位置）|
| `plot_precoding_effect()` | TS 38.214 | §5.2.2.2.1（DFT 码本权重）|
| DMRS 端口配置表 | TS 38.212 | §7.3.1.2.2 Table 7.3.1.2.2-1 |
