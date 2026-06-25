# 5G NR MIMO & Beamforming

> **3GPP 版本定锚**
>
> | 内容 | 版本 | 规范 |
> |---|---|---|
> | 层映射 / 预编码 / 天线端口映射 | **Rel-15** | 38.211 §7.3.1.3/§7.3.1.4 |
> | DMRS Type 1/2，CDM 组配置 | **Rel-15** | 38.211 §7.4.1.1，38.212 Table 7.3.1.2.2-x |
> | Codebook-based / Non-codebook-based 预编码 | **Rel-15** | 38.214 §5.2.2.2/§5.2.2.3 |
> | Type I / Type II CSI 码本 | **Rel-15/16** | 38.214 §5.2.2.2 |
> | NTN 上行 MIMO 覆盖增强 | **Rel-17** | 38.821 §6.3 |

---

## 📡 知识定位

```
Phase 2 骨架层
│
├── ✅ RACH / PDCCH / HARQ
│
├── ▶ MIMO & Beamforming       ← 我们在这里
│     核心问题：一根天线传一路数据，多根天线如何协同？
│               频域的"复数符号"到底经过几层变换才变成空口电磁波？
│
├── ⬜ CSI 框架（RI/PMI/CQI）
└── ⬜ Beam Management
```

**一句话理解**：MIMO 在空间维度上"复制"了信道容量。其核心变换链是：
**比特 → QAM 符号 → 层映射 → 预编码 → 天线端口 → 物理天线**，
每一步都有严格的 3GPP 矩阵定义。搞清楚这条链，就搞清楚了 NR 物理层最复杂的部分。

---

## 💡 核心逻辑

### 1. 三个容易混淆的概念：DMRS 端口 / 天线端口 / 物理天线

这是本课最容易出错的地方，必须在开始之前厘清：

```
物理天线（Physical Antenna）
  ↑ 是真实存在的硬件，64T64R 基站有 64 根发射天线
  ↑ UE 对其一无所知，物理天线的数量不出现在任何协议 IE 中

天线端口（Antenna Port）
  ↑ 协议层的抽象概念（38.211 §7.4 定义）
  ↑ 由"在此端口上的参考信号可区分"来定义
  ↑ PDSCH 使用的端口编号：1000 + DMRS port index
  ↑ 两个天线端口"可区分" = UE 可以独立估计它们的信道

DMRS 端口（DMRS Port）
  ↑ 实现"天线端口可区分"的具体机制：不同端口用不同的 CDM 码或频域位置区分
  ↑ 每个 DMRS 端口对应一个天线端口
  ↑ 最多 8 个 DMRS 端口（Type1: port 0~7，Type2: port 0~11）

三者的关系：
  物理天线（N_T 根）
      ↑ 模拟预编码（beamforming 权重，硬件实现）
  天线端口（N_AP 个，通常 ≤ 8）
      ↑ 数字预编码矩阵 W（协议定义，UE 可见）
  层（Layer，N_L 层，1~8）
      ↑ 层映射矩阵
  调制符号（来自 LDPC 解码后的 QAM）
```

**工程直觉**：64 根物理天线通过模拟移相器网络"合成"成 8 个等效天线端口，UE 只看到 8 个端口，不知道背后有 64 根天线。

---

### 2. 完整信号链：从符号到天线

**参考：38.211 §7.3.1**

$$
\underbrace{d(0), d(1), \ldots}_{\text{调制符号}}
\xrightarrow{\text{层映射}}
\underbrace{x^{(0)}, x^{(1)}, \ldots, x^{(\nu-1)}}_{\nu \text{ 层}}
\xrightarrow{\text{预编码矩阵 } \mathbf{W}}
\underbrace{y^{(0)}, y^{(1)}, \ldots, y^{(p-1)}}_{p \text{ 个天线端口}}
\xrightarrow{\text{OFDM 调制（IFFT）}}
\text{发射}
$$

#### 2.1 层映射（Layer Mapping）—— 38.211 §7.3.1.3

**单码字（Single Codeword，1~4 层）**：

$$
x^{(i)}(k) = d(i + k\nu), \quad i = 0, 1, \ldots, \nu-1, \quad k = 0, 1, \ldots
$$

轮询分配：第 $k$ 个符号组中，第 $i$ 层取调制符号序列的第 $i + k\nu$ 个元素。

**双码字（Two Codewords，5~8 层）**：

码字 0 → 层 0~$\lfloor\nu/2\rfloor - 1$，码字 1 → 层 $\lfloor\nu/2\rfloor$ ~ $\nu-1$

| 层数 ν | 码字数 | 层分配 |
|:---:|:---:|---|
| 1 | 1 | CW0 → L0 |
| 2 | 1 或 2 | CW0 → L0,L1（单码字）/ CW0→L0, CW1→L1 |
| 4 | 1 或 2 | CW0→L0~L3 / CW0→L0,L1 + CW1→L2,L3 |
| 8 | 2 | CW0→L0~L3, CW1→L4~L7 |

#### 2.2 预编码矩阵（Precoding Matrix W）—— 38.211 §7.3.1.4

$$
\begin{pmatrix} y^{(0)}(i) \\ y^{(1)}(i) \\ \vdots \\ y^{(p-1)}(i) \end{pmatrix}
= \mathbf{W}
\begin{pmatrix} x^{(0)}(i) \\ x^{(1)}(i) \\ \vdots \\ x^{(\nu-1)}(i) \end{pmatrix}
$$

$\mathbf{W}$ 是 $p \times \nu$ 的复数矩阵（$p$ = 天线端口数，$\nu$ = 层数）。

**归一化约束**：

$$
\frac{1}{\nu} \|\mathbf{W}\|_F^2 = 1
$$

保证各层发射功率之和等于总功率，不同层间功率均等。

**举例：2 天线端口，2 层，空间复用**

$$
\mathbf{W} = \frac{1}{\sqrt{2}}\begin{pmatrix} 1 & 0 \\ 0 & 1 \end{pmatrix}
$$

每层独立映射到一个天线端口，完全空间复用。

**举例：2 天线端口，1 层，发射分集（SFBC）**

$$
\mathbf{W} = \frac{1}{\sqrt{2}}\begin{pmatrix} 1 \\ 1 \end{pmatrix}
\quad \text{或} \quad
\frac{1}{\sqrt{2}}\begin{pmatrix} 1 \\ -1 \end{pmatrix}
$$

同一符号经相位加权后同时从两个端口发出，获得发射分集增益。

<MIMOSignalChain />

---

### 3. MIMO 的三种工作模式

#### 3.1 发射分集（Transmit Diversity）

```
目的：对抗信道衰落（不是提升速率，是提升可靠性）
机制：同一数据流从多个天线发出，接收端做最大比合并（MRC）
典型场景：PBCH（强制使用 SFBC），控制信道，覆盖边缘

SFBC（Space-Frequency Block Coding）：
  天线 1：发 [s₀, s₁]
  天线 2：发 [-s₁*, s₀*]（Alamouti 编码）

  接收端恢复：
    ŝ₀ = h₀* r₀ + h₁ r₁*
    ŝ₁ = h₀* r₁ - h₁ r₀*
  →分集增益 = 2（两个独立信道路径）
```

#### 3.2 空间复用（Spatial Multiplexing）

```
目的：成倍提升吞吐量
条件：信道矩阵 H 的秩（rank）≥ 层数 ν
机制：ν 路独立数据流同时在同一时频资源发送

信道容量（MIMO 香农公式）：
  C = log₂ det(I + SNR/ν × HH†)   bit/s/Hz

vs SISO：C = log₂(1 + SNR)

高 SNR 时 MIMO 增益：ΔC ≈ min(N_T, N_R) × log₂(SNR)
→ 每增加一对收发天线，容量增加 log₂(SNR) bit/s/Hz
```

#### 3.3 波束成形（Beamforming）

```
目的：集中能量到特定方向，提升覆盖距离和抗干扰能力
机制：为各天线端口配置相位/幅度权重，使信号在目标方向相长干涉

单用户波束成形（SU-BF）：ν=1，W 为 p×1 向量
多用户波束成形（MU-BF）：多个 UE 共享频谱，用空间隔离
```

**三种模式的关系**：

| 维度 | 发射分集 | 空间复用 | 波束成形 |
|---|---|---|---|
| **层数 ν** | 1 | 2~8 | 1 |
| **目标** | 可靠性 ↑ | 吞吐量 ↑ | 覆盖 / SNR ↑ |
| **信道要求** | 信道不相关 | 信道高秩 | 信道方向性强 |
| **适用 SNR** | 低 SNR | 高 SNR | 中低 SNR |
| **NTN 推荐** | 覆盖边缘 | 高容量区域 | LEO 波束追踪 |

---

<BeamPatternVisualizer />

### 4. DMRS 端口配置：Type 1 vs Type 2

#### 4.1 两种 DMRS 类型的频域资源占用

**DMRS Type 1**（默认）：

```
子载波编号：  0  1  2  3  4  5  6  7  8  9 10 11  （一个 RB 内）
CDM 组 0：   D  .  D  .  D  .  D  .  D  .  D  .
CDM 组 1：   .  D  .  D  .  D  .  D  .  D  .  D

D = DMRS，. = 可用于 PDSCH
每个 CDM 组 2 个端口（OCC w=[1,1] 和 w=[1,-1] 区分）
最多 4 个端口（2 CDM 组 × 2 端口/组）
maxLength=2 时双符号，最多 8 个端口
```

**DMRS Type 2**：

```
子载波编号：  0  1  2  3  4  5  6  7  8  9 10 11
CDM 组 0：   D  D  .  .  .  .  D  D  .  .  .  .
CDM 组 1：   .  .  D  D  .  .  .  .  D  D  .  .
CDM 组 2：   .  .  .  .  D  D  .  .  .  .  D  D

每个 CDM 组 2 个端口（相邻子载波用 OCC 区分）
最多 6 个端口（3 CDM 组 × 2 端口/组）
maxLength=2 时最多 12 个端口
```

#### 4.2 CDM 组的正交性原理

同一 CDM 组内的两个端口用**正交覆盖码（OCC）**区分：

$$
\text{端口 } 2k: \quad w = [+1, +1] \quad \text{（时域双符号或频域相邻子载波）}
$$

$$
\text{端口 } 2k+1: \quad w = [+1, -1]
$$

接收端通过 $[r_0 + r_1]$ 恢复端口 $2k$，通过 $[r_0 - r_1]$ 恢复端口 $2k+1$。

#### 4.3 DCI 中天线端口字段（38.212 Table 7.3.1.2.2-x）

DCI format 1_1 中的 `antenna ports` 字段通过查表同时决定：
- DMRS 端口集合（哪些端口激活）
- CDM 组数（影响 PDSCH RE 数量）
- 前置符号数（1 或 2）

**dmrs-Type=1, maxLength=1（最常见配置）核心映射**：

| DCI 值 | CDM组数 | DMRS 端口 | 等效 MIMO 配置 |
|:---:|:---:|---|---|
| 0 | 1 | {0} | SISO |
| 1 | 1 | {1} | SISO（偏移）|
| 2 | 1 | {0,1} | 2层 MIMO |
| 7 | 2 | {0,1,2,3} | 4层 MIMO |
| 9 | 2 | {0,1,2,3,4,5} | 6层（需 Type2）|
| 10 | 2 | {0,1,2,3,4,5,6,7} | 8层 |

> **工程关键**：CDM 组数 = 1 时，PDSCH 可用 RE = 总 RE - Type1 DMRS RE（每 RB 约 6 个）；CDM 组数 = 2 时，PDSCH 损失增大（约 12 个/RB），因为第二个 CDM 组的位置也不能用于数据。

---

<DMRSPortMapper />

### 5. 预编码：Codebook-based vs Non-codebook-based

#### 5.1 两种模式的根本区别

```
Codebook-based（CB-PreCoding）：
  → gNB 从预定义码本中选取预编码矩阵 W
  → W 的选择通过 UE 上报的 PMI（Precoding Matrix Indicator）驱动
  → UE 知道 gNB 使用的是哪个 W（因为双方共享码本）
  → 优点：信令开销小（PMI 只需几 bit），实现简单
  → 缺点：码本有限，最优预编码未必在码本中

Non-codebook-based（NCB-PreCoding）：
  → UE 先发 SRS（Sounding Reference Signal），gNB 测量上行信道
  → gNB 利用 TDD 互易性推断下行信道 H，自己算最优 W
  → UE 不知道 W 的具体值（gNB 直接用算出的矩阵）
  → 优点：精确，理论最优，适合 Massive MIMO
  → 缺点：依赖信道互易性（TDD 专属），SRS 开销
```

#### 5.2 Codebook-based 的工作闭环

```
UE 接收 CSI-RS（下行参考信号）
         ↓
UE 测量信道，选择最优 PMI / RI / CQI
         ↓
UE 通过 PUSCH 或 PUCCH 上报 CSI
         ↓ (PMI 携带预编码矩阵索引)
gNB 从码本中取出 W[PMI]
         ↓
gNB 用 W 对数据流预编码后发送
         ↓
UE 用 DMRS 估计等效信道 H_eff = H × W
（UE 不需要分别知道 H 和 W，只需知道组合效果）
```

**Type I 单面板码本（Rel-15，最常用）**：

$$
\mathbf{W} = \mathbf{W}_1 \mathbf{W}_2
$$

- $\mathbf{W}_1$：宽带波束选择矩阵（从 DFT 码本中选列）
- $\mathbf{W}_2$：子带相位调整矩阵（精细调节相位）
- PMI 由 i₁（宽带，选 $\mathbf{W}_1$）和 i₂（子带，选 $\mathbf{W}_2$）组成

**Type II 码本（Rel-15，高精度）**：

$$
\mathbf{W} = \sum_{l=1}^{L} \mathbf{b}_l c_l
$$

线性组合多个 DFT 波束，支持双极化天线阵列，PMI 开销更大但精度更高。

#### 5.3 Non-codebook-based：SRS 互易性链路

```
TDD 帧结构（上下行互易）：

UL slot:  UE 发送 SRS（已知序列）
              ↓
gNB 测量：h_UL[k] = H^T(k) × SRS[k]（估计上行信道）
              ↓
互易性假设（TDD）：H_DL ≈ H_UL^T（远端天线相同路径）
              ↓
gNB 计算最优预编码：W = V（H 的右奇异矩阵，SVD 分解）
              ↓
gNB 通过 DCI 中 antenna ports 字段告知 UE 用哪些 DMRS 端口
（UE 通过 DMRS 估计等效信道，不需要知道 W）
```

**RRC 配置差异**：

```
Codebook-based：
  PUSCH-Config → codebookSubset → {fullyAndPartialAndNonCoherent / partialAndNonCoherent / nonCoherent}
  → reportConfig → CSI-ReportConfig → reportQuantity → cri-RI-PMI-CQI

Non-codebook-based：
  PUSCH-Config → transformPrecoder = disabled（必须 CP-OFDM）
  SRS-Config → usage = nonCodebook
  → UE 先发 SRS，gNB 根据 SRS 决定下行 W
```

---

<SVDChannelAnalyzer />

### 6. 三层映射的完整数学表达

以 4 天线端口、2 层空间复用为例，完整走一遍信号链：

```
输入：调制符号序列 d(0), d(1), d(2), d(3), ...

Step 1：层映射（2 层）
  x^(0)(k) = d(2k)      ← 偶数符号 → 层 0
  x^(1)(k) = d(2k+1)    ← 奇数符号 → 层 1

Step 2：预编码（Type I 码本，4 端口 2 层示例）
  W = 1/√2 × [1  0 ]     ← 4×2 矩阵
              [0  1 ]
              [1  0 ]
              [0 -1 ]

  y^(0)(k) = 1/√2 × x^(0)(k)
  y^(1)(k) = 1/√2 × x^(1)(k)
  y^(2)(k) = 1/√2 × x^(0)(k)
  y^(3)(k) = 1/√2 × (-x^(1)(k))

Step 3：各天线端口独立 IFFT
  s^(p)(t) = IFFT{ y^(p)(k) }，p = 0,1,2,3

Step 4：加 CP → 发射（4 个天线端口独立发送）
```

**UE 侧接收**：

$$
\mathbf{r}(k) = \mathbf{H}(k)\mathbf{W}\mathbf{x}(k) + \mathbf{n}(k) = \mathbf{H}_{\text{eff}}(k)\mathbf{x}(k) + \mathbf{n}(k)
$$

UE 用 DMRS 估计的是**等效信道** $\mathbf{H}_{\text{eff}} = \mathbf{H}\mathbf{W}$，不是物理信道 $\mathbf{H}$。这就是为什么 Non-codebook-based 模式下 UE 不需要知道 W 的具体值。

---

### 7. ⚠️ NTN (Rel-17) 视角：MIMO 的挑战与选择

#### 7.1 NTN 信道特性对 MIMO 的影响

```
地面信道（富散射）：
  多径丰富 → H 矩阵高秩 → 空间复用可达 8 层
  信道快变（多普勒）→ 需要 DMRS 密度高

LEO NTN 信道（LOS 主导）：
  几乎无散射 → H 矩阵接近秩 1 → 空间复用层数受限
  → 强波束成形增益（LOS 方向固定）
  → 弱空间复用能力（信道矩阵退化）
  → 强多普勒（已由预补偿处理，见 Numerology 课）
```

#### 7.2 NTN 的实用 MIMO 策略

| 场景 | 推荐 MIMO 模式 | 层数 | 理由 |
|---|---|:---:|---|
| LEO 卫星下行 | 波束成形 + 空间复用（多 UE）| 1/UE | LOS，单 UE 信道秩低，MU-MIMO 利用空间隔离 |
| LEO 卫星上行（UE 受限）| DFT-s-OFDM + 单层 | 1 | 功率受限，优先 PAPR 降低 |
| GEO 卫星 | 发射分集 | 1 | 信道几乎静态，分集比复用更稳 |
| LEO 高仰角（θ>60°）| 最多 2 层空间复用 | 2 | 短暂高秩窗口 |

#### 7.3 Massive MIMO 与 NTN 的结合

```
NTN 地面网关站（Gateway）→ 卫星 → 用户终端

网关站：
  大规模阵列（256T256R）→ 数字 + 模拟混合波束成形
  → 多波束覆盖（每波束服务一个地理区域）
  → 波束间干扰隔离

UE 侧：
  通常 1~2 根天线（手机）
  → 接收分集为主
  → 若 UE 有多天线，用发射分集（上行）

Rel-17 关键参数：
  - 波束追踪时间常数：与卫星运动速度匹配（LEO 约 90 分钟/圈）
  - TCI State 切换：提前调度，避免波束切换中断（见 Beam Management 课）
```

---

## 🔍 实战信令视角（IE / Log Analysis）

### 关键 IE 速查

```
RRC: PDSCH-Config
├── maxNrofCodeWordsScheduledByDCI    ← 1 或 2（码字数上限）
├── dmrs-DownlinkForPDSCH-MappingTypeA
│   └── DMRS-DownlinkConfig
│       ├── dmrs-Type              ← type1 / type2
│       ├── maxLength              ← len1 / len2（单/双符号 DMRS）
│       └── dmrs-AdditionalPosition ← pos0/1/2/3（额外 DMRS 位置）
└── tci-StatesToAddModList          ← TCI States（波束 + 预编码关联）

RRC: CSI-MeasConfig（CSI 框架，下一课详讲）
└── nzp-CSI-RS-ResourceToAddModList ← NZP-CSI-RS 资源（用于 PMI 测量）

RRC: PUSCH-Config
├── codebookSubset                  ← CB-based 预编码子集约束
└── sri-PUSCH-MaxRank               ← 最大上行层数

DCI format 1_1 字段：
├── antenna_ports（4~6 bits）       ← 查 Table 7.3.1.2.2-x 得 DMRS 端口集合
└── tci（3 bits）                   ← TCI State（关联 QCL 和波束）
```

### 🚨 故障排查速查表

| 故障现象 | 首先检查 | 最可能根因 |
|---|---|---|
| 高层数 MIMO 效果差于低层 | RI 与实际信道秩是否匹配 | PMI/RI 上报与信道实际特性不符 |
| PDSCH 吞吐量低于期望 | CDM 组数配置 | CDM=2 时 PDSCH RE 大量被 DMRS 占用 |
| Non-codebook 模式 PUSCH 解调失败 | SRS 发送是否正常 | SRS 缺失，gNB 无法估计上行信道 |
| DMRS 估计误差大（高速场景）| dmrs-AdditionalPosition | 额外 DMRS 符号不足，信道快变时插值误差大 |
| TDD Non-codebook 模式在 FDD 失效 | transformPrecoder 和 codebookSubset | Non-codebook 依赖互易性，FDD 上下行频率不同无法使用 |

---

## 🐍 仿真实现思路

### 伪代码骨架

```
══════════════════════════════════════════════════════════════
【数学层】MIMO 信道模型（38.211 §7.3.1）
──────────────────────────────────────────────────────────────
# 层映射（单码字，ν 层）
for k in range(M_symb // nu):
    for i in range(nu):
        x[i][k] = d[i + k * nu]

# 预编码（p 端口，ν 层）
# W: shape (p, nu)，从码本或 SVD 获取
for k in range(M_symb // nu):
    y[:, k] = W @ x[:, k]     # 矩阵乘法

# 接收端等效信道
# H_eff[k] = H[k] @ W，shape (N_R, nu)
# UE 通过 DMRS 估计 H_eff，然后均衡
x_hat = pinv(H_eff) @ r        # 最小二乘检测
# 或 MMSE：x_hat = (H_eff^H @ H_eff + sigma^2 I)^-1 @ H_eff^H @ r
══════════════════════════════════════════════════════════════
【算法层】空间复用容量计算（香农公式）
──────────────────────────────────────────────────────────────
FUNCTION mimo_capacity(H, snr_db):
    snr = 10^(snr_db/10)
    p   = H.shape[1]          # 发射天线数
    # 注意功率分配：每天线 SNR/p
    C = log2(det(I + snr/p * H @ H.H))
    RETURN C    # bit/s/Hz

FUNCTION siso_capacity(snr_db):
    RETURN log2(1 + 10^(snr_db/10))
══════════════════════════════════════════════════════════════
【实现层】→ simulation/phase2/mimo_sim.py
──────────────────────────────────────────────────────────────
- MIMO 信道矩阵生成（i.i.d. 瑞利衰落 / 莱斯衰落）
- 层映射 + 预编码（CB-based Type I 码本）
- MMSE 检测器
- 容量 vs SNR 曲线（SISO vs 2x2 vs 4x4）
- DMRS Type 1 vs Type 2 频域占用可视化
══════════════════════════════════════════════════════════════
```

---

## 📝 版本演进与工程自测

### 版本演进速览

| Feature | Rel-15 | Rel-16 | Rel-17 |
|---|:---:|:---:|:---:|
| 层映射 / 预编码基础（1~8 层）| ✅ | 不变 | 不变 |
| Type I 单面板 / 多面板码本 | ✅ | 增强 | 不变 |
| Type II 高精度码本 | ✅ | 增强（FD-MIMO）| 不变 |
| DMRS Type 1/2，CDM 基础 | ✅ | 不变 | 不变 |
| Non-codebook SRS 互易性 | ✅（TDD）| 增强 | 不变 |
| 多 TRP 联合传输（JCAS）| ❌ | ✅ | 增强 |
| NTN 上行 MIMO 覆盖增强 | ❌ | ❌ | ✅ |
| FR2-2 大规模天线 | ❌ | ❌ | ✅（研究）|

---

### 面试级自测题

**Q1 · 概念题（三层映射核心）**

> UE 通过 DMRS 估计的信道是 $\mathbf{H}$ 还是 $\mathbf{H}\mathbf{W}$？两者的区别对 UE 的均衡算法有什么影响？Non-codebook-based 模式下 UE 是否需要知道 $\mathbf{W}$？

:::details 💡 展开答案

UE 通过 DMRS 估计的是**等效信道** $\mathbf{H}_{\text{eff}} = \mathbf{H}\mathbf{W}$，而不是物理信道 $\mathbf{H}$。

**原因**：DMRS 是在预编码之后发送的（DMRS 信号也经过 $\mathbf{W}$ 的处理），所以 UE 收到的参考信号是 $\mathbf{H}\mathbf{W} \cdot \text{DMRS}$，估计出的自然是 $\mathbf{H}_{\text{eff}}$。

**对均衡的影响**：UE 的均衡只需要 $\mathbf{H}_{\text{eff}}$，无需 $\mathbf{H}$ 和 $\mathbf{W}$ 的分离知识。均衡问题是：

$$\hat{\mathbf{x}} = (\mathbf{H}_{\text{eff}}^H \mathbf{H}_{\text{eff}} + \sigma^2 \mathbf{I})^{-1} \mathbf{H}_{\text{eff}}^H \mathbf{r}$$

**Non-codebook-based 模式**：UE **不需要也不知道** $\mathbf{W}$ 的具体值。gNB 根据 SRS 自己算出 $\mathbf{W}$，UE 只需要通过 DMRS 估计 $\mathbf{H}_{\text{eff}}$，然后正常做均衡。DCI 中的 `antenna ports` 字段只告诉 UE 激活了哪些 DMRS 端口（即 $\mathbf{H}_{\text{eff}}$ 的列数 = 层数），不告诉 $\mathbf{W}$。

**参考**：38.211 §7.3.1.4（预编码），38.214 §5.2.2.3（Non-codebook PUSCH）

:::

---

**Q2 · 计算题（CDM 与 PDSCH RE 损失）**

> gNB 配置 PDSCH 使用 DMRS Type 1，maxLength=1，DCI 中 antenna ports 字段值 = 7（对应 DMRS 端口 {0,1,2,3}，CDM 组数 = 2）。一个 RB 内 14 个 OFDM 符号，其中 2 个符号为 PDCCH，DMRS 位于符号 #2。
>
> (a) 计算该 RB 内 DMRS 占用的 RE 数量
> (b) 计算可用于 PDSCH 数据的 RE 数量
> (c) 与 CDM 组数 = 1 的情况相比，RE 损失了多少？

:::details 💡 展开答案

**(a) DMRS RE 数量**

DMRS Type 1，符号 #2 中，每个 CDM 组占 6 个子载波（每隔一个，共 12 个子载波中各 6 个）。CDM 组数 = 2，所以 DMRS 占：

$$N_{\text{DMRS}} = 2 \times 6 = 12 \text{ RE}$$

**(b) PDSCH 可用 RE**

总 RE = 12 子载波 × 14 符号 = 168 RE

扣除 PDCCH（2 符号 × 12 = 24 RE）和 DMRS（12 RE）：

$$N_{\text{PDSCH}} = 168 - 24 - 12 = 132 \text{ RE}$$

**注意**：CDM 组数 = 2 时，DMRS 符号（#2）的全部 12 个子载波均被占用（6 个用于 CDM 组 0，6 个用于 CDM 组 1），没有剩余位置可给 PDSCH。

**(c) 与 CDM 组数 = 1 的对比**

CDM 组数 = 1 时，DMRS 仅占 6 RE，另外 6 个子载波可用于 PDSCH：

$$N_{\text{PDSCH, CDM=1}} = 168 - 24 - 6 = 138 \text{ RE}$$

**损失** = 138 - 132 = **6 RE/RB**（约 3.6%）

工程意义：层数越多（需要 CDM 组数 = 2），DMRS 开销越大，PDSCH 吞吐量略降。这是多层 MIMO 的信令开销代价。

:::

---

**Q3 · 工程排障题（Codebook vs Non-codebook）**

> TDD 网络现场：gNB 配置 Non-codebook-based 上行预编码，PUSCH 使用 2 层传输。测试发现：UE 静止时 2 层 PUSCH 解调正常（BLER < 1%），但 UE 以 60km/h 移动时，2 层 BLER 升至 40%，切换到 1 层后恢复正常。信道质量（RSRP/SINR）在两种情况下相同。分析根因，给出工程解法。

:::details 💡 展开答案

**根因：SRS 时效性问题导致互易性失效**

Non-codebook-based 预编码的工作原理：gNB 根据 UE 发送的 **SRS** 估计上行信道，利用 TDD 互易性推断下行信道，计算出最优预编码矩阵 $\mathbf{W}$，并用于随后的 PDSCH 下行传输。

**移动时的问题**：

1. SRS 周期通常配置为数十至数百毫秒。
2. UE 以 60km/h 移动时，多普勒频移 ≈ $\frac{60/3.6}{3 \times 10^8} \times 3.5 \times 10^9 \approx 194 \text{ Hz}$（3.5GHz 频段）。
3. 信道相干时间 $T_c \approx \frac{1}{4f_d} \approx 1.3 \text{ ms}$，远小于 SRS 周期。
4. 因此 gNB 用"旧 SRS"估计出的 $\mathbf{W}$ 与当前信道严重失配，导致 2 层传输的 SINR 下降，BLER 升高。1 层时 $\mathbf{W}$ 失配的影响相对较小（1 维向量误差比 2 维矩阵误差更鲁棒）。

**工程解法**：

1. **缩短 SRS 周期**：将 `SRS-Resource` 中的 `periodicityAndOffset` 从（如）80ms 缩短至 2.5ms 或 5ms，提高信道跟踪速率。
2. **切换到 Codebook-based**：Codebook-based 不依赖 SRS 互易性，而是由 UE 直接上报 PMI，即使信道快变也能正常工作（代价是需要 CSI-RS 资源和 PMI 上报开销）。
3. **降低最大层数**：配置 `sri-PUSCH-MaxRank = 1`，在高速场景强制单层传输。

**参考**：38.214 §5.2.2.3（Non-codebook PUSCH），38.211 §6.4.1.4（SRS）

:::

---

## 参考资料

- **3GPP TS 38.211 v15.7.0** — 层映射（§7.3.1.3）；预编码（§7.3.1.4）；DMRS（§7.4.1.1）
- **3GPP TS 38.212 v15.7.0** — 天线端口配置表（§7.3.1.2.2，Table 7.3.1.2.2-1~4）
- **3GPP TS 38.214 v15.7.0** — Codebook-based（§5.2.2.2）；Non-codebook（§5.2.2.3）；Type I/II 码本
- **3GPP TR 38.821 v17.3.0** — NTN MIMO 适配（§6.3）
- ShareTechnote — [5G MIMO](https://www.sharetechnote.com/html/5G/5G_MIMO.html)
- Björnson, Hoydis, Sanguinetti — *Massive MIMO Networks* (2017)
