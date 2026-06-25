# 5G NR OFDM 基础

> **3GPP 版本定锚**
>
> | 内容 | 版本 | 规范 |
> |---|---|---|
> | CP-OFDM 波形定义（下行 + 上行）| **Rel-15** | 38.211 §5.3 |
> | DFT-s-OFDM（上行可选）| **Rel-15** | 38.211 §6.3.1 |
> | π/2-BPSK + DFT-s-OFDM | **Rel-15** | 38.211 §6.3.1.2 |
> | NTN 中 DFT-s-OFDM 覆盖增强 | **Rel-17** | 38.821 §6.3 |
> | FR2-2 Extended CP 考量 | **Rel-17** | 38.211 §4.2 |

---

## 📡 知识定位

```
Phase 1 学习路径
│
├── ✅ Numerology + 帧结构   时域刻度（Symbol/Slot/Frame）
├── ✅ Resource Grid         频域坐标系（Point A/BWP/RB）
├── ✅ Channel Mapping       三层信道架构（逻辑/传输/物理）
│
└── ▶ OFDM 基础              ← 我们在这里
      核心问题：资源网格这张"已分配好的画布"
               最终如何变成天线口发出的电磁波？
```

**一句话理解**：OFDM 是把频域的"数据格子"（RE）变成时域波形的机器。它的核心操作只有一步：**IFFT**。其余的 CP、DFT-s-OFDM、PAPR 全部是围绕这一步的工程权衡。

---

## 💡 核心逻辑

### 1. 为什么 5G 选择 OFDM？

从单载波时代到 OFDM 的演进，背后是两个核心问题的工程博弈：

```
问题 1：多径 ISI（Inter-Symbol Interference）
  无线信道存在多条路径（直射、反射、散射）
  不同路径到达时延不同 → 前一个符号的"尾巴"与当前符号"头部"重叠 → ISI
  
  单载波解法：均衡器（复杂度随带宽指数增长，100 MHz 时几乎不可行）
  OFDM 解法：将宽带信号分成 N 条窄带子载波
              每条子载波带宽 = Δf << 信道相干带宽
              → 每个子载波上信道近似平坦 → 单系数均衡（除法）！

问题 2：频谱利用率
  传统 FDM：子载波间留保护带 → 频谱浪费
  OFDM：子载波在频域正交（Δf = 1/T_symbol）
       → 零点恰好落在相邻子载波中心 → 无保护带 → 频谱利用率最高
```

**OFDM 的核心优势总结**：

| 优势 | 机制 | 代价 |
|---|---|---|
| 抗多径（ISI）| CP 将线性卷积 → 循环卷积 | CP 引入时域开销（约 7%）|
| 单抽头均衡 | 每子载波 = 复数乘法 | 需要信道估计（DMRS）|
| 高频谱效率 | 子载波正交性，无保护带 | 对频偏敏感（ICI）|
| MIMO 友好 | 每子载波独立预编码 | 高阶 MIMO 计算复杂 |
| 实现简单 | IFFT/FFT 高效算法 | 高 PAPR（DL 不敏感，UL 是痛点）|

---

### 2. OFDM 调制：数学推导

**参考：38.211 §5.3.1**

#### 2.1 连续时域表达式

$$
s(t) = \sum_{k=0}^{N-1} a_k \cdot e^{j2\pi k \Delta f (t - t_0)}, \quad t_0 \leq t < t_0 + T_\text{symbol}
$$

其中：
- $a_k$：第 $k$ 个子载波上的调制符号（来自 Resource Grid 的 RE 值）
- $\Delta f = 2^\mu \times 15\ \text{kHz}$：子载波间隔（由 Numerology 决定）
- $T_\text{symbol} = 1/\Delta f$：有效符号时长

#### 2.2 离散化：IFFT

对连续表达式在 $t = t_0 + n/(N \Delta f)$ 处采样，$n = 0, 1, \ldots, N-1$：

$$
s[n] = \frac{1}{N} \sum_{k=0}^{N-1} a_k \cdot e^{j2\pi kn/N} = \mathcal{F}^{-1}\{a_k\}
$$

这正是 **N 点 IFFT**。因此：

$$
\boxed{\text{OFDM 调制} \equiv \text{IFFT}}
$$

$$
\boxed{\text{OFDM 解调} \equiv \text{FFT}}
$$

整个物理层最复杂的信号处理，在数学上简化为一次 FFT 运算。

<OFDMModulationExplainer />

#### 2.3 子载波正交性条件

两个相邻子载波 $k$ 和 $k'$ 在一个符号周期内的内积：

$$
\langle e^{j2\pi k \Delta f t},\ e^{j2\pi k' \Delta f t} \rangle = \int_0^{T_\text{symbol}} e^{j2\pi (k-k') \Delta f t} \, dt
$$

当且仅当 $\Delta f \cdot T_\text{symbol} = 1$（即 $\Delta f = 1/T_\text{symbol}$）时，上式对所有 $k \neq k'$ 等于零。

**这就是为什么 SCS 与符号时长必须互为倒数**——正交性是 OFDM 系统设计的最根本约束，所有 Numerology 的设计都从这一条出发。

#### 2.4 采样率与 N_FFT 的工程关系

OFDM 系统的采样率 $f_s$ 由 FFT 点数和 SCS 共同决定：

$$f_s = N_\text{FFT} \times \Delta f$$

| μ | SCS | 典型 N_FFT | 采样率 $f_s$ | 采样间隔 |
|:---:|:---:|:---:|:---:|:---:|
| 0 | 15 kHz | 2048 | **30.72 MHz** | 32.55 ns = $T_s$ |
| 1 | 30 kHz | 2048 | 61.44 MHz | 16.28 ns |
| 3 | 120 kHz | 512 | 61.44 MHz | 16.28 ns |

> **关键洞见**：$N_\text{FFT} = 2048$、$\Delta f = 15\ \text{kHz}$ 时，
> $f_s = 30.72\ \text{MHz}$，采样间隔恰好等于 $T_s$（38.211 中定义的基础时序单位）。
> 这不是巧合，而是 3GPP 刻意的设计——$T_s$ 的定义本身就来源于此。
---

### 3. Cyclic Prefix：从线性到循环的魔法

#### 3.1 为什么需要 CP？

多径信道可以建模为线性时不变系统的卷积：

$$
r[n] = \sum_{\ell=0}^{L-1} h[\ell] \cdot s[n-\ell] + w[n]
$$

其中 $h[\ell]$ 是信道冲激响应，$L$ 是最大多径阶数。

**问题**：线性卷积会产生 ISI——前一个 OFDM 符号的末尾采样会"污染"当前符号的前几个采样。

**CP 的解法**：复制当前符号的末尾 $N_{CP}$ 个采样，前置在符号开头：

$$
\tilde{s}[n] = \begin{cases}
s[N + n] & -N_{CP} \leq n < 0 \\
s[n] & 0 \leq n < N
\end{cases}
$$

接收端去除 CP 后，只要 $N_{CP} \geq L - 1$（CP 长度 $\geq$ 最大多径时延），线性卷积就等价为**循环卷积**：

$$
r[n] = h \circledast s[n] = \mathcal{F}^{-1}\{H[k] \cdot A[k]\}
$$

其中 $H[k] = \mathcal{F}\{h\}$ 是信道的频率响应。于是每个子载波上的信道均衡变成：

$$
\hat{a}[k] = \frac{R[k]}{H[k]}
$$

**一次复数除法，就完成了整个均衡**——这就是 OFDM 系统复杂度远低于单载波的根本原因。

#### 3.2 Normal CP 与 Extended CP

**参考：38.211 §4.3，Table 5.3.1-1**

| CP 类型 | 适用 μ | CP 长度（μ=0）| 开销比 | 适用场景 |
|---|:---:|:---:|:---:|---|
| **Normal CP** | 0,1,2,3,4 | 4.69 μs（≈5.2 km 等效）| ~7% | 绝大多数场景 |
| **Extended CP** | **仅 μ=2** | **16.67 μs（= 1024 × Ts）** | ~25% | 60 kHz SCS；大时延扩展场景（如城区大覆盖）|

> **为什么 NTN 不需要 Extended CP？** LEO 卫星信道由 LOS 主导，多径时延扩展 < 5 μs，Normal CP 完全够用。几毫秒的传播时延由 TA 预补偿处理，不是 CP 的职责（这一点在 Numerology 课中已深入讨论）。

#### 3.3 第一个符号的 CP 为何更长？

在每个 slot 中，第 0 个（和第 7 个，若适用）OFDM 符号的 CP 比其他符号长约 16 个采样（μ=0 时 ≈ 0.52 μs 额外）。原因：维持 0.5 ms 子帧边界的整数对齐。这是 LTE 兼容性的历史遗留，与无线信道无关。

---

### 4. DFT-s-OFDM：低 PAPR 上行波形

#### 4.1 PAPR 的本质

PAPR（峰均功率比）定义：

$$
\text{PAPR} = \frac{\max_n |s[n]|^2}{\mathbb{E}[|s[n]|^2]}
$$

CP-OFDM 的高 PAPR 来源于**随机相位叠加**：N 个子载波若在同一时刻相位对齐，瞬时功率可达平均功率的 N 倍（理论上限 $10\log_{10}N$）。

**高 PAPR 的工程代价**：
- 功率放大器（PA）必须工作在线性区，效率仅 20~30%
- 若 PA 饱和 → 非线性失真 → 带外辐射（ACLR 恶化）→ 干扰邻信道
- UE 上行受限于电池功率，高 PAPR = 有效发射功率下降 = 覆盖缩水

#### 4.2 DFT-s-OFDM 的信号链

在 CP-OFDM 的 IFFT 之前，插入一个 M 点 DFT：

```
QAM 符号 (M 个)
    ↓  M 点 DFT（Transform Precoding）
频域扩频后的系数 (M 个) → 映射到 N 个子载波的子集
    ↓  N 点 IFFT
时域信号 (N 个采样)      ← 等效单载波！
    ↓  加 CP
发射
```

**为什么 DFT 后等效单载波？**

$$
s_\text{DFT-s-OFDM}[n] = \mathcal{F}_N^{-1}\{ \mathcal{F}_M\{a_k\} \} = \text{IFFT}_N(\text{FFT}_M(a_k))
$$

当 $M = N$ 时，IFFT ∘ FFT = 单位矩阵，输出就是原始 QAM 符号序列本身——这就是单载波！PAPR 因此与单载波系统相同，约 3~8 dB（取决于调制阶数）。

#### 4.3 CP-OFDM vs DFT-s-OFDM 对比

| 维度 | CP-OFDM | DFT-s-OFDM |
|---|---|---|
| **PAPR** | ~10~12 dB | ~4~8 dB（低 4~6 dB）|
| **频谱效率** | 高（支持 MIMO 多流）| 低（单层）|
| **MIMO 兼容** | ✅ 最多 8 层 | ❌ 仅单层 |
| **均衡复杂度** | 低（单抽头 FDE）| 低（同上）|
| **PA 效率** | 低（需 backoff）| 高（可接近饱和工作）|
| **覆盖** | 受限（UE 功率上限）| 优（相同功率覆盖更远）|
| **适用场景** | 小区内部、eMBB 高速率 | 小区边缘、覆盖受限、NTN |
| **5G NR 使用** | DL 必选；UL 可选 | UL 可选（`transformPrecoding-Enabled`）|

<PAPRComparisonChart />

**NTN 覆盖改善的量化推导**：

自由空间路损（FSPL）与距离的关系：每增加 6 dB 路损，距离扩大约 2 倍。

```
DFT-s-OFDM vs CP-OFDM PAPR 改善：约 4~6 dB
  ↓ PA backoff 减少 4~6 dB
  ↓ 等效发射 EIRP 提高 4~6 dB
  ↓ 链路预算改善 4~6 dB
  ↓ 覆盖面积扩大：4dB → +59%，6dB → +100%（翻倍）

结论：在 LEO 卫星上行链路受限场景，
      切换到 DFT-s-OFDM 可将上行覆盖半径扩大约 30%~50%。
```
#### 4.4 π/2-BPSK 与 DFT-s-OFDM

当调制方式为 π/2-BPSK 时，DFT-s-OFDM 的 PAPR 可接近 0 dB（恒包络）：

$$
d(i) = \frac{1}{\sqrt{2}} e^{j\frac{\pi}{2}i} \cdot (1 - 2b(i)), \quad b(i) \in \{0,1\}
$$

物理含义：第 $i$ 个符号在 BPSK 基础上累加 $i \times \pi/2$ 的相位旋转，
使相邻符号间的相位差固定，时域波形趋近恒包络（PAPR → 0 dB）。

---

### 5. OFDM 接收机完整处理流程

```
天线接收信号 r(t)
    ↓
下变频 + ADC → 离散时域采样 r[n]
    ↓
同步：时域帧同步（PSS 相关检测）+ 频率偏差估计（SSS 相位差）
    ↓
去 CP：丢弃前 N_CP 个采样
    ↓
N 点 FFT → 频域接收信号 R[k]
    ↓
信道估计：在 DMRS 子载波位置：H_est[k] = R[k] / DMRS[k]
         插值到数据子载波：H[k]（线性/二次插值）
    ↓
均衡：A_hat[k] = R[k] / H[k]（最小二乘，或 MMSE 加权）
    ↓
解调（软判决/硬判决）→ 解扰 → LDPC 解码 → Transport Block
```

**关键洞见**：DMRS 密度设计是信道估计质量的核心权衡——
- DMRS 太稀疏 → 插值误差大 → 高速移动时（信道快变）BER 恶化
- DMRS 太密集 → 占用 RE 多 → 数据吞吐量下降
- NR Type A（slot-based）：DMRS 在符号 #2 或 #3，适合大多数静止/低速场景
- NR Type B（mini-slot）：DMRS 更灵活，适合 URLLC 低时延场景

---

### 6. 与 Phase 2 的衔接：OFDM 之上的调度与控制

至此，Phase 1 的物理基础已完整：

```
信号链路（物理层从比特到波形）：

Transport Block
    ↓ LDPC 编码 + 速率匹配          (Channel Mapping 课)
比特流
    ↓ 加扰 + QAM 调制               (Channel Mapping 课)
复数符号 → 映射到 RE               (Resource Grid 课)
    ↓ [DFT-s-OFDM 时：先 DFT]
    ↓ N 点 IFFT                      (本课)
时域符号
    ↓ 加 Cyclic Prefix               (本课)
    ↓ 上变频 → 天线发射
```

**Phase 2 要解决的问题**：谁决定哪些 RE 分配给哪个 UE？答案是调度器，通过以下机制工作：
- **RACH**：UE 如何第一次接入系统（Msg1~Msg4）
- **PDCCH/DCI**：调度器如何告诉 UE"你用这些 RB、这个 MCS、这个时刻传"
- **HARQ**：传错了怎么办？重传策略
- **AMC**：MCS 如何根据信道质量动态调整

---

## 🔍 实战信令视角（IE / Log Analysis）

### 关键 IE 速查

```
RRC: PDSCH-Config
├── dmrs-DownlinkForPDSCH-MappingTypeA
│   └── dmrs-AdditionalPosition → pos0/pos1/pos2/pos3（附加 DMRS 位置）
│   └── maxLength → len1/len2（单/双 DMRS 符号）
└── dmrs-DownlinkForPDSCH-MappingTypeB （Mini-slot PDSCH）

RRC: PUSCH-Config
├── transformPrecoder → enabled（DFT-s-OFDM）/ disabled（CP-OFDM）
│   └── enabled 时：只支持单层 MIMO，调制最高 64QAM
├── tp-pi2BPSK → enabled（π/2-BPSK with DFT-s-OFDM）
└── dmrs-UplinkForPUSCH-MappingTypeA
    └── dmrs-AdditionalPosition（上行 DMRS 密度）

RRC: RACH-ConfigCommon
└── prach-RootSequenceIndex（ZC 根序列，决定 PRACH Preamble）

RRC（NTN Rel-17）: PUSCH-Config
└── msgA-PUSCH-Config-r17（NTN 增强，Msg3 重传配置）
```

### 🚨 故障排查速查表

| 故障现象 | 首先检查 | 最可能根因 |
|---|---|---|
| PDSCH BLER 随速度增大 | DMRS 类型 + `dmrs-AdditionalPosition` | 信道快变，DMRS 太稀，插值误差大 |
| UE 上行覆盖差但 DL 正常 | `transformPrecoder` 配置 | CP-OFDM 上行 PAPR 高，PA 非线性失真 |
| 256QAM 效果差于预期 | UL ACLR 测试值 | PAPR 过高导致 PA 压缩，EVM 恶化 |
| mini-slot PDSCH BER 高 | DMRS Type B 位置 vs 实际调度符号 | Type B DMRS 位置与 mini-slot 起点不对齐 |
| FR2 高速移动 PDSCH 失效 | PT-RS 是否配置 | mmWave 相位噪声大，需 PT-RS 跟踪 |

---

## 🐍 仿真实现

### 伪代码骨架

```
══════════════════════════════════════════════════════════════
【数学层】OFDM 调制（38.211 §5.3.1）
──────────────────────────────────────────────────────────────
输入：频域符号 a[k], k=0..N-1
输出：含 CP 的时域信号

核心：
  time_domain = IFFT(a[k])          # N 点 IFFT
  cp = time_domain[-N_cp:]          # 末尾 N_cp 个采样
  tx = concat(cp, time_domain)      # 前置 CP

DFT-s-OFDM（追加）：
  spread = FFT(qam_symbols, M)      # M 点 DFT（扩频）
  a[k] = map_to_subcarriers(spread) # 映射到 N 个子载波的子集
  # 之后同 CP-OFDM
══════════════════════════════════════════════════════════════
【算法层】接收机
──────────────────────────────────────────────────────────────
FUNCTION ofdm_rx(rx_signal, n_fft, n_cp, dmrs_positions, dmrs_values):
  no_cp     ← rx_signal[n_cp:]
  freq_rx   ← FFT(no_cp, n_fft)
  H_dmrs    ← freq_rx[dmrs_positions] / dmrs_values   # LS 信道估计
  H_all     ← interpolate(H_dmrs, dmrs_positions, n_fft)  # 插值
  equalized ← freq_rx / H_all                           # 单抽头均衡
  RETURN equalized
══════════════════════════════════════════════════════════════
【实现层】→ code/ofdm_basics_sim.py（独立文件）
──────────────────────────────────────────────────────────────
完整实现：CP-OFDM + DFT-s-OFDM + PAPR CCDF + 频偏仿真
所有模块基于 PyTorch，支持梯度反传
══════════════════════════════════════════════════════════════
```

**完整仿真代码见独立文件** → `code/ofdm_basics_sim.py`

实现内容：
- CP-OFDM / DFT-s-OFDM 完整收发链路（PyTorch 实现）
- PAPR CCDF 曲线（Complementary CDF，标准评估方法）
- 频率偏差（CFO）对 ICI 的影响仿真
- DMRS-based 信道估计 + 线性插值
- BER vs SNR（CP-OFDM vs DFT-s-OFDM 对比）

### 关键实验

```python
# 实验 1：PAPR CCDF 对比（最直观的 DFT-s-OFDM 优势展示）
papr_ofdm, papr_dfts = compute_papr_ccdf(n_fft=1024, n_symbols=10000)
plot_ccdf(papr_ofdm, papr_dfts)
# 预期：DFT-s-OFDM 的 CCDF 曲线向左偏移约 4~6 dB

# 实验 2：CFO（载波频率偏移）影响
# 模拟 NTN 残余多普勒（预补偿后 200 Hz）对 OFDM 的影响
ber_no_cfo  = simulate_ber(cfo_hz=0,   mu=0)    # 基线
ber_cfo_200 = simulate_ber(cfo_hz=200, mu=0)    # NTN 残余
ber_cfo_5k  = simulate_ber(cfo_hz=5000, mu=0)   # 未补偿的灾难
# 思考：为什么 200 Hz CFO 对 μ=0（SCS=15kHz）影响可忽略？

# 实验 3：CP 长度与 ISI
# 超过 CP 的多径时延 → 手动破坏正交性，观察 BER 跳升
for tau in [0.5, 1.0, 1.5, 2.0]:   # 相对 CP 长度的比例
    ber = simulate_multipath_ber(tau_ratio=tau, n_fft=256, mu=0)
    # tau_ratio > 1 时 BER 应该剧烈上升

# 实验 4：π/2-BPSK PAPR（极限情况）
papr_qpsk   = compute_papr_single(modulation='QPSK', dft_s=True, n_fft=256)
papr_pi2bpsk= compute_papr_single(modulation='pi2BPSK', dft_s=True, n_fft=256)
# 预期：π/2-BPSK PAPR ≈ 0~2 dB（恒包络近似）
```

---

## 📝 版本演进与工程自测

### 版本演进速览

| Feature | Rel-15 | Rel-16 | Rel-17 |
|---|:---:|:---:|:---:|
| CP-OFDM（DL/UL 基础）| ✅ | 不变 | 不变 |
| DFT-s-OFDM（UL 可选）| ✅ | 增强（π/2-BPSK 低 PAPR 扩展）| 不变 |
| Normal / Extended CP | ✅ | 不变 | 不变 |
| PT-RS（相位噪声补偿，FR2）| ✅ | 增强 | 不变 |
| NTN DFT-s-OFDM 覆盖增强 | ❌ | ❌ | ✅ 38.821 |
| FR2-2 波形考量（μ=5,6）| ❌ | ❌ | ✅ |

---

### 面试级自测题

**Q1 · 概念题**

> 为什么 OFDM 的子载波间隔 Δf 必须等于 1/T_symbol？如果违反这个条件会发生什么？

<details>
<summary>💡 展开答案</summary>

**物理机制**：OFDM 的正交性依赖于子载波在一个符号周期内积分为零，条件是 $\Delta f \cdot T_\text{symbol} \in \mathbb{Z}^+$。最小情况取 $\Delta f = 1/T_\text{symbol}$，此时相邻子载波的频率差恰好使它们在时域上完成整数倍周期，互不干扰。

**违反后果**：若 $\Delta f \neq 1/T_\text{symbol}$（或 SCS 出现非整数倍关系），子载波间干扰（ICI, Inter-Carrier Interference）出现。每个子载波的能量会"泄漏"到相邻子载波，导致解调后的每个 RE 都含有来自其他 RE 的噪声，SINR 急剧恶化。

这也是为什么 NR 的所有 Numerology 都以 15 kHz 为基准，SCS 只能取 $2^\mu \times 15$ kHz——保证整数倍关系，确保不同 μ 的 BWP 在时域边界对齐，不产生互干扰。

</details>

---

**Q2 · 计算题**

> 5G gNB 配置 μ=1（30 kHz SCS），Normal CP，N_FFT = 1024。
>
> (a) 计算 CP 长度 $N_{CP}$（采样数）和 CP 的绝对时长（μs）
> (b) 若信道最大多径时延 $\tau_\text{max} = 2\ \mu\text{s}$，CP 是否足够？
> (c) 若将 μ 升级为 2（60 kHz），同样的 $\tau_\text{max} = 2\ \mu\text{s}$ 下 CP 是否仍然足够？

<details>
<summary>💡 展开答案</summary>

**(a)** μ=1 时：

$$T_\text{symbol} = \frac{1}{30 \times 10^3} \approx 33.33\ \mu\text{s}$$

Normal CP 时长（38.211 Table 5.3.1-1）：$T_{CP} \approx 2.34\ \mu\text{s}$

采样率 $f_s = N_\text{FFT} \times \Delta f = 1024 \times 30\ \text{kHz} = 30.72\ \text{MHz}$

$$N_{CP} = \text{round}(T_{CP} \times f_s) = \text{round}(2.34 \times 10^{-6} \times 30.72 \times 10^6) \approx 72\ \text{个采样}$$

**(b)** $\tau_\text{max} = 2\ \mu\text{s} < T_{CP} = 2.34\ \mu\text{s}$，**CP 足够**，ISI 完全消除。

**(c)** μ=2 时，$T_{CP} \approx 1.17\ \mu\text{s} < \tau_\text{max} = 2\ \mu\text{s}$，**CP 不够！**

这说明在相同的物理信道条件下，增大 SCS 会使 CP 变短，可能不再满足保护要求。工程上 μ=2 通常用于室内（多径时延扩展较小，如 < 1 μs）场景。

</details>

---

**Q3 · 工程综合题（NTN 场景）**

> 一个 LEO 卫星 NTN 基站配置上行 PUSCH 使用 CP-OFDM（`transformPrecoder = disabled`），频段 S-band（2 GHz），μ=1。现场测试发现：小区中心 UE 上行速率正常，但小区边缘 UE（距 UE 约 550 km 轨道高度，仰角 30°）上行吞吐量仅达到预期的 40%，MCS 始终停留在低阶。
>
> 分析根因，并给出两种工程解法。

<details>
<summary>💡 展开答案</summary>

**根因分析**：

小区边缘 UE 面临以下物理限制叠加：

1. **路损更大**（低仰角 30°，路径更长）→ UL RSRP 低 → 需更高发射功率
2. **CP-OFDM 高 PAPR（~10~12 dB）**：UE PA 为避免非线性失真，必须将工作点退后（backoff）约 PAPR dB → 有效发射功率大幅下降（可达 4~6 dB 损失）
3. **两者叠加** → UL SNR 严重不足 → AMC 无法提升 MCS

**工程解法 1（推荐）：启用 DFT-s-OFDM**

```
配置：PUSCH-Config → transformPrecoder = enabled
效果：PAPR 从 ~12 dB 降至 ~6 dB
      UE 有效发射功率提升约 4~6 dB
      等效覆盖半径扩大约 30%（自由空间路损：每 6 dB ≈ 距离翻倍）
代价：仅支持单层 MIMO，但边缘场景本来就不适合多流传输
```

**工程解法 2：π/2-BPSK + DFT-s-OFDM（极限覆盖）**

```
配置：PUSCH-Config → transformPrecoder = enabled
              → tp-pi2BPSK = enabled
效果：PAPR ≈ 0~2 dB（近似恒包络）
      UE PA 可以工作在接近饱和区，效率最高
      MCS 受限为低阶（π/2-BPSK），但链路可靠性最高
NTN Rel-17 专门在 Msg3 配置中增强了此路径，用于 PRACH 后的首次上行传输
```

**参考**：38.211 §6.3.1（DFT-s-OFDM）；38.821 §6.3（NTN 覆盖增强）

</details>

---

## 参考资料

- **3GPP TS 38.211 v15.7.0** — 物理信道与调制；CP-OFDM（§5.3）；DFT-s-OFDM（§6.3.1）
- **3GPP TS 38.214 v15.7.0** — PUSCH 传输方案（§6.1.3，transformPrecoding）
- **3GPP TR 38.821 v17.3.0** — NTN 覆盖增强；DFT-s-OFDM 上行选择（§6.3.4）
- **3GPP TR 38.840 v16.0.0** — UE 功耗研究；PAPR 对 PA 效率的影响
- Dahlman, Parkvall, Sköld — *5G NR: The Next Generation Wireless Access Technology* Ch.7
- ShareTechnote — [5G OFDM](https://www.sharetechnote.com/html/5G/5G_OFDM.html)