# 5G NR CSI 框架（CSI-RS / CQI / PMI / RI / LI）

> **3GPP 版本定锚**
>
> | 内容 | 版本 | 规范 |
> |---|---|---|
> | CSI-RS 基础（NZP / ZP / TRS）| **Rel-15** | 38.211 §7.4.1.5 |
> | CSI 上报（CQI/PMI/RI/LI/CRI）| **Rel-15** | 38.214 §5.2.1 |
> | Type I / Type II 码本 PMI | **Rel-15/16** | 38.214 §5.2.2.2 |
> | PDSCH BLER 目标与 AMC | **Rel-15** | 38.214 §5.2.2.1 |
> | NTN CSI 增强（大时延上报）| **Rel-17** | 38.821 §6.3 |

---

## 📡 知识定位

```
Phase 2 骨架层
│
├── ✅ RACH / PDCCH / HARQ / MIMO
│
├── ▶ CSI 框架                  ← 我们在这里
│     核心问题：gNB 如何"知道"信道状态？
│               UE 测量了什么，上报了什么，gNB 用来做什么？
│
└── ⬜ Beam Management
```

**一句话理解**：CSI 框架是 MIMO 闭环的"神经系统"。gNB 发送 CSI-RS（已知的参考信号），UE 测量后上报 CQI/PMI/RI，gNB 据此选择 MCS 和预编码矩阵——这个闭环每隔数毫秒运行一次，驱动自适应调制编码（AMC）和多天线策略。

---

## 💡 核心逻辑

### 1. 为什么需要 CSI-RS？——与 DMRS 的本质区别

```
DMRS（解调参考信号）：
  目的：让 UE 解调 PDSCH/PUSCH（均衡用）
  发送时机：每次有 PDSCH/PUSCH 调度时才发送
  UE 使用方式：估计等效信道 H_eff=HW，用于均衡
  gNB 不依赖 DMRS 做调度决策

CSI-RS（信道状态信息参考信号）：
  目的：让 UE 测量信道质量，上报给 gNB
  发送时机：周期性（不论有无数据传输）
  UE 使用方式：估计物理信道 H，计算 CQI/PMI/RI
  gNB 依靠 CSI 上报做 MCS 选择和预编码决策
```

**关键区别**：DMRS 是"用完即走"的局部估计；CSI-RS 是"持续监测"的全局反馈。

---

### 2. CSI-RS 的三种类型

#### 2.1 NZP-CSI-RS（Non-Zero Power）

最常用的类型，用于信道测量（CQI/PMI/RI 上报的基础）。

**时频资源配置（38.211 §7.4.1.5）**：

$$
\text{RE位置} = (k', l') \in \{(k_0 + \Delta_k, l_0 + \Delta_l)\}
$$

其中 $k_0$（起始子载波）、$l_0$（起始符号）和密度 $\rho$（RE/RB）由 `NZP-CSI-RS-Resource` IE 配置。

**密度配置**（每 RB 内的 RE 数）：

| 密度 ρ | RE/RB | 典型用途 |
|:---:|:---:|---|
| 1/2 | 1 RE（每 2 RB 共享）| 宽带测量，低开销 |
| 1 | 2 RE/RB | 标准配置 |
| 3 | 6 RE/RB | 频率选择性测量（子带 PMI）|

**端口数与 RE 数关系**（`nrofPorts`）：

| 端口数 | RE/RB（ρ=1）| 典型应用 |
|:---:|:---:|---|
| 1 | 1 | 单端口 CQI 测量 |
| 2 | 2 | 2 天线 PMI |
| 4 | 4 | Type I 4 端口码本 |
| 8 | 8 | Type I/II 单面板 |
| 16/32 | 16/32 | Massive MIMO FD |

#### 2.2 ZP-CSI-RS（Zero Power，干扰测量）

不发射能量，仅占用 RE 位置，让 UE 测量**干扰和噪声功率**（IMR，Interference Measurement Resource）。

$$
\text{SINR 估计} = \frac{\text{信号功率（来自 NZP-CSI-RS）}}{\text{干扰+噪声（来自 ZP-CSI-RS 位置）}}
$$

UE 在 ZP-CSI-RS RE 上收到的全部能量即为干扰，用于精确的 SINR 估计。

#### 2.3 TRS（Tracking Reference Signal）

时间/频率跟踪参考信号，用于精确的时频同步跟踪（不用于信道质量测量）。

```
TRS 配置（38.211 §7.4.1.5.3）：
  4 个 NZP-CSI-RS 资源，形成 "burst"
  时域：相邻两个时隙，各 2 个符号
  频域：密度 ρ = 3（6 RE/RB）
  → 提供充足的时频分辨率用于 PLL 锁相
```

---

### 3. CSI-RS 的三种触发模式

**参考：38.214 §5.2.1.3**

#### 3.1 周期性（Periodic）

```
配置：NZP-CSI-RS-Resource → periodicityAndOffset
  → sl4/sl5/sl8/sl10/.../sl640（slots）
  
特性：无需 DCI 触发，自动按周期发送
适用：慢变信道（移动速度低），常规 CQI/PMI 更新
典型周期：40 slots（20ms @ 30kHz）
```

#### 3.2 半持续（Semi-Persistent，SP）

```
激活：gNB 通过 MAC CE（sp-CSI-RS-ResourceSetList MAC CE）激活
      或 DCI format 0_1/1_1 中的 SP-CSI-RS trigger 字段
停止：另一个 MAC CE 或 DCI 停止

特性：激活后自动按周期发送，直到明确停止
适用：需要动态开启/关闭 CSI 测量的场景（省功耗）
```

#### 3.3 非周期性（Aperiodic，AP）

```
触发：DCI format 0_1/1_1 中的 aperiodic-TRS-Trigger 字段（2 bits）
      → 2 bits 对应 4 种预配置的 AP-CSI-RS 资源集合

特性：按需触发，时延 k_delay > 0 slots（至少 3~4 slots 后发送）
适用：突发事件（波束失败恢复、高速场景快速更新）
```

**三种模式对比**：

| 维度 | Periodic | Semi-Persistent | Aperiodic |
|---|---|---|---|
| **触发方式** | 自动 | MAC CE / DCI | DCI |
| **灵活性** | 低 | 中 | 高 |
| **时延** | 最大 1 周期 | 同周期 | k_delay slots |
| **功耗** | 持续开销 | 可关闭 | 按需 |
| **适用** | 慢变信道 | 中速场景 | 快变/突发 |

---

<CSIReportTimeline />

### 4. CSI 上报量的完整定义

**参考：38.214 §5.2.1**

#### 4.1 CQI（Channel Quality Indicator）

**物理含义**：推荐的调制编码方案索引，使 PDSCH BLER 保持在目标 10% 以下。

$$
\text{CQI} = \underset{q}{\arg\max}\{q : \text{BLER}(q) \leq 10\%\}
$$

**4 bit 字段**，取值 0~15：

| CQI 值 | 调制方案 | 近似码率 | SINR 参考范围 |
|:---:|:---:|:---:|:---:|
| 0 | — | — | 信道太差，停止调度 |
| 1 | QPSK | 0.08 | < -4 dB |
| 6 | QPSK | 0.60 | ~5 dB |
| 9 | 16QAM | 0.60 | ~10 dB |
| 12 | 64QAM | 0.65 | ~18 dB |
| 15 | 64QAM | 0.93 | > 25 dB |

**宽带 vs 子带 CQI**：

```
宽带 CQI：整个 BWP 的平均信道质量（1 个值）
子带 CQI：每个子带（N_RB 个 RB）独立 CQI（频率选择性调度用）
  子带大小：取决于 BWP 带宽（38.214 Table 5.2.1.4-2）
            BWP=24~72 RB → 子带=4 RB
            BWP=73~144 RB → 子带=8 RB
```

<CQITableExplorer />

#### 4.2 PMI（Precoding Matrix Indicator）

**物理含义**：推荐的预编码矩阵 $\mathbf{W}$（来自 Type I 或 Type II 码本）。

**Type I 单面板码本**（38.214 §5.2.2.2.1）：

$$
\mathbf{W} = \mathbf{W}_1 \mathbf{W}_2
$$

上报两个索引：
- $i_1 = (i_{1,1}, i_{1,2}, i_{1,3})$：宽带，选择 $\mathbf{W}_1$（波束组）
- $i_2$：子带，选择 $\mathbf{W}_2$（相位精调）

**Type II 码本**（38.214 §5.2.2.2.2，Rel-15/16 增强）：

$$
\mathbf{W}_1 = \begin{bmatrix} \mathbf{B} & \mathbf{0} \\ \mathbf{0} & \mathbf{B} \end{bmatrix}, \quad \mathbf{W}_2 = \text{线性组合系数（振幅+相位）}
$$

开销更大但精度更高，支持 FD-MIMO（频域 MIMO）。

<TypeICodebookBrowser />

#### 4.3 RI（Rank Indicator）

**物理含义**：推荐的传输层数（1~8）。

$$
\text{RI} = \underset{r}{\arg\max}\left\{ C(r) : \text{BLER}(r) \leq \text{目标}\right\}
$$

其中 $C(r) = r \times \log_2(1 + \text{SINR}_r/r)$ 为 $r$ 层的等效容量。

**RI 与 CQI 的联动**：

```
RI 决定层数 → 影响每层 SINR（总功率不变，层数增加则每层功率下降）
→ 重新选择对应层数的 CQI

RI=1：全部功率集中在单流，高 SINR，可用高阶 MCS
RI=4：功率分成 4 份，每层 SINR 降低，但总吞吐量增加（需信道秩 ≥ 4）
```

**工程直觉**：RI 本质是在"每层可靠性"和"总层数"之间做权衡：

$$
\text{吞吐量} \propto \text{RI} \times \text{CQI}(ri)
$$

#### 4.4 LI（Layer Indicator）

**物理含义**：在 CSI-RS 端口间，哪个端口/层具有最强信号（用于 PTRS 端口关联）。

$$
\text{LI} = \underset{l}{\arg\max} \|[\mathbf{H}_{\text{eff}}]_{:,l}\|
$$

主要用于 FR2 毫米波场景，帮助 PT-RS（相位跟踪参考信号）端口选择。

#### 4.5 CRI（CSI-RS Resource Indicator）

**物理含义**：在多个 CSI-RS 资源中，选择最优的一个（波束管理用）。

```
配置多个 CSI-RS 资源（每个对应不同波束方向）
UE 上报 CRI = 哪个 CSI-RS 资源质量最好（即最优波束索引）
→ gNB 切换到对应波束发数据
```

---

### 5. CSI 上报配置：三层结构

**参考：38.331 CSI-MeasConfig**

```
CSI-MeasConfig
├── NZP-CSI-RS-ResourceSet（资源集合，1 个含多个 Resource）
│   └── NZP-CSI-RS-Resource（单个 CSI-RS 资源）
│       ├── resourceMapping（时频位置）
│       ├── nrofPorts（端口数）
│       ├── periodicityAndOffset（周期）
│       └── powerControlOffset（相对 SSB 的功率）
│
├── CSI-IM-Resource（干扰测量资源，即 ZP-CSI-RS）
│
└── CSI-ReportConfig（上报配置）
    ├── resourcesForChannelMeasurement → 指向某个 NZP-CSI-RS 资源集
    ├── csi-IM-ResourcesForInterference → 指向 CSI-IM 资源
    ├── reportQuantity（上报内容）
    │   → none / cri-RI-PMI-CQI / cri-RI-i1 / cri-RI-CQI / ...
    ├── reportFreqConfiguration
    │   └── cqi-FormatIndicator → widebandCQI / subbandCQI
    │   └── pmi-FormatIndicator → widebandPMI / subbandPMI
    └── reportConfigType → periodic / semiPersistentOnPUCCH / aperiodic
```

**核心设计原则**：CSI-RS 资源（测量什么）和 CSI Report 配置（上报什么）**解耦**，一个资源可以对应多种上报配置（例如同时上报宽带 CQI 和子带 PMI）。

<CSIReportVisualizer />

---

### 6. AMC 闭环：CQI → MCS 的完整决策

**参考：38.214 §5.2.2.1**

```
UE 上报 CQI（基于 CSI-RS 测量）
         ↓
gNB AMC 模块：
  Step 1：将 CQI 映射到 MCS 候选（查 38.214 Table 5.1.3.1-x）
  Step 2：考虑以下调整因子：
    ± BLER 历史（HARQ NACK 率高 → 降 MCS）
    ± 测量时延（CQI 上报到 PDSCH 调度的 slot 差 → 信道可能已变）
    ± UE 能力（最大支持 256QAM？）
    ± 干扰估计（ZP-CSI-RS 测量的 IMR 结果）
         ↓
gNB 选定 MCS，在 DCI 中下发
         ↓
UE 按 MCS 接收 PDSCH，发 HARQ-ACK/NACK
         ↓
gNB 根据 BLER 反馈微调下次 MCS（外环 AMC）
```

**内环 vs 外环 AMC**：

```
内环 AMC（Fast Adaptation）：
  基于 CQI 直接选 MCS，响应速度 = CSI 上报周期（毫秒级）

外环 AMC（Outer Loop Link Adaptation, OLLA）：
  基于实际 HARQ NACK 率调整内环偏移量（offset）
  目标：维持 PDSCH BLER = 10%（标准参考值）
  速度：慢（数十至数百 ms），对抗 CQI 估计误差
```

---

### 7. RI 如何驱动 MIMO 层数决策

**参考：38.214 §5.2.2.2**

$$
\text{最优 RI} = \underset{r \in \{1,...,r_{\max}\}}{\arg\max}\ r \cdot \text{CQI}(r)
$$

**完整决策流程**：

```
UE 对每个候选层数 r = 1, 2, ..., min(N_T, N_R) 分别计算：
  1. 最优预编码 W*(r)（来自码本或 SVD）
  2. 每层等效 SINR（假设 MMSE 检测）
  3. 用该 SINR 反查 CQI 表，得 CQI(r)
  4. 估计等效吞吐量：C(r) = r × spectral_efficiency(CQI(r))

选择使 C(r) 最大的 r 作为上报的 RI
```

**工程示例**（4 天线端口，SNR=15dB，瑞利信道）：

| r | 每层 SINR | CQI(r) | 等效 SE | 总 SE |
|:---:|:---:|:---:|:---:|:---:|
| 1 | 15 dB | 12 | 3.9 | 3.9 |
| 2 | 12 dB | 10 | 2.7 | **5.4** ← 最优 |
| 4 | 6 dB | 7 | 1.5 | 6.0 |

> 注：实际中 r=4 时因检测器噪声增强，BLER 上升，AMC 会自动降 MCS，实际 SE 可能低于理论值。

---

### 8. ⚠️ NTN (Rel-17) 深度分析：CSI 上报的时效性问题

#### 8.1 CSI 上报时延 vs 信道相干时间

```
地面 TN：
  CQI 上报周期：5~10ms
  信道相干时间（30km/h，3.5GHz）：T_c ≈ 5ms
  → CQI 基本时效，AMC 可靠

LEO NTN（550km，45°仰角，μ=1）：
  单程传播时延：τ ≈ 2ms
  CQI 上报到 PDSCH 调度时延 ≈ RTT/2 + 处理 ≈ 5ms
  信道相干时间（固定 UE，强 LOS）：T_c >> 100ms（LOS 信道慢变）
  → UE 静止时 CQI 时效性较好（LOS 信道慢变）
  → UE 移动时（飞机/船）T_c 缩短，CQI 可能过时
```

#### 8.2 Rel-17 的 CSI 上报增强

```
问题：传统 CSI-Report 假设 UE 能"及时"上报 CQI，
      NTN 大 RTT 导致 gNB 收到 CQI 时，信道可能已经变化

Rel-17 解法：
  ① 增强 CSI 上报时序：引入 reportSlotOffsetList-r17
     允许在非周期 CSI 上报时指定更大的偏移值（覆盖 NTN RTT）
  
  ② 预测型 CSI（研究中）：UE 利用 LEO 轨道可预测性，
     对未来信道状态做外推后上报"未来 CQI"
  
  ③ 降低上报频率：NTN LOS 信道慢变，周期可拉长至 40~80ms，
     降低 PUCCH 上行信令开销（NTN 上行资源宝贵）
```

**NTN CSI 配置建议**：

| 场景 | 推荐 CSI 类型 | 上报周期 | RI 上限 |
|---|---|---|---|
| LEO + 静止 UE | Periodic NZP-CSI-RS | 20~40ms | 2（LOS 秩低）|
| LEO + 移动 UE | SP + AP 组合 | SP: 10ms, AP: 按需 | 1 |
| GEO | Periodic（慢）| 100~200ms | 1 |

---

## 🔍 实战信令视角（IE / Log Analysis）

### 关键 IE 速查

```
RRC: CSI-MeasConfig（在 ServingCellConfig 下）
├── nzp-CSI-RS-ResourceToAddModList
│   └── NZP-CSI-RS-Resource
│       ├── nzp-CSI-RS-ResourceId         ← 资源 ID（0~191）
│       ├── resourceMapping
│       │   ├── startingRB                ← 频域起始 RB
│       │   ├── nrofRBs                   ← 频域范围
│       │   ├── firstOFDMSymbolInTimeDomain ← 时域符号位置
│       │   ├── density                   ← {dot5even,dot5odd,one,three}
│       │   └── nrofPorts                 ← 端口数（1/2/4/8/12/16/24/32）
│       └── periodicityAndOffset          ← {sl4, sl5, sl8, ..., sl640}
│
├── csi-ReportConfigToAddModList
│   └── CSI-ReportConfig
│       ├── reportConfigId
│       ├── resourcesForChannelMeasurement ← → NZP-CSI-RS-Resource
│       ├── reportQuantity                 ← 上报内容类型
│       │   CHOICE {none | cri-RI-PMI-CQI | cri-RI-i1 | cri-RI-CQI |
│       │           cri-RI-LI-PMI-CQI | ...}
│       ├── cqi-Table                      ← table1(64QAM)/table2(256QAM)/table3(lowSE)
│       ├── subband-Size                   ← 子带大小（影响 PMI 开销）
│       └── reportConfigType
│           CHOICE {
│             periodic: {reportSlotConfig, pucch-CSI-ResourceList}
│             semiPersistentOnPUCCH: {reportSlotConfig, pucch-CSI-ResourceList}
│             aperiodic: {reportSlotOffsetList}
│           }
```

### 🚨 故障排查速查表

| 故障现象 | 首先检查 | 最可能根因 |
|---|---|---|
| CQI 始终停留在低值（信道好但 MCS 低）| CSI-RS 端口数与天线配置是否匹配 | 端口数 > 实际天线数，信道估计噪声大 |
| RI 始终上报 1（应该高层 MIMO）| `reportQuantity` 是否含 RI | 未配置 RI 上报，gNB 默认 1 层 |
| AMC 频繁降 MCS（NACK 率高）| CQI 上报延迟 vs 信道相干时间 | 上报周期过长，CQI 过时 |
| 子带 PMI 精度低 | CSI-RS 密度配置 | density=1 不足以支持子带 PMI，需 density=3 |
| NTN 场景 CQI 时效性差 | reportSlotOffsetList-r17 | 未配置 NTN 专用时序偏移 |
| 256QAM 无法激活 | cqi-Table 设置 | table2（支持 256QAM）未配置 |

---

## 🐍 仿真实现思路

```
══════════════════════════════════════════════════════════════
【数学层】CQI 计算（38.214 §5.2.2.1）
──────────────────────────────────────────────────────────────
SINR 估计（基于 CSI-RS 测量）：
  H_est = channel_estimate(csi_rs_received, csi_rs_known)
  interference = measure_at_ZP_CSI_RS_positions()
  SINR = |H_est|^2 / interference

CQI 选择：
  FOR q in range(0, 16):
      MCS  = cqi_to_mcs_table[q]
      BLER = bler_awgn_curve(SINR, MCS)   # 查 AWGN 参考曲线
      IF BLER <= 0.10:
          CQI_candidate = q

RI 选择：
  FOR r in range(1, max_layers+1):
      W    = codebook_select(r, PMI_search)
      H_eff = H_est @ W
      SINR_r = mmse_sinr(H_eff, noise_var)
      SE_r  = r * cqi_to_se(SINR_to_CQI(SINR_r))
  RI = argmax(SE_r)
══════════════════════════════════════════════════════════════
【实现层】→ simulation/phase2/csi_sim.py
──────────────────────────────────────────────────────────────
- CSI-RS RE 占用可视化
- CQI / RI 上报仿真（AWGN 参考曲线）
- AMC 闭环：CQI → MCS → BLER → OLLA 调整
- 不同上报周期对 AMC 性能的影响（信道老化）
══════════════════════════════════════════════════════════════
```

---

## 📝 版本演进与工程自测

### 版本演进速览

| Feature | Rel-15 | Rel-16 | Rel-17 |
|---|:---:|:---:|:---:|
| NZP/ZP-CSI-RS 基础 | ✅ | 不变 | 不变 |
| Periodic / SP / AP 上报 | ✅ | 不变 | 不变 |
| CQI/PMI/RI/LI/CRI 上报 | ✅ | 不变 | 不变 |
| Type I 单/多面板码本 | ✅ | 增强 | 不变 |
| Type II 高精度码本 | ✅ | FD-MIMO 增强 | 不变 |
| 256QAM CQI 表（table2）| ✅ | 不变 | 不变 |
| NTN reportSlotOffset 增强 | ❌ | ❌ | ✅ |
| 多 TRP CSI 测量 | ❌ | ✅ | 增强 |

---

### 面试级自测题

**Q1 · 概念题**

> UE 上报 CQI=10，gNB 实际调度 MCS=16。为什么两者不直接对应？gNB 在 CQI 和 MCS 之间做了哪些调整？

:::details 💡 展开答案

**CQI ≠ MCS，因为 gNB 在中间施加了多个修正量**：

**① CQI 测量时延修正**：UE 测量 CSI-RS 后经过上报周期（数 ms）+ 传输时延才被 gNB 收到，信道可能已变化。gNB 会根据历史 BLER 判断 CQI 是否偏乐观，适当降低 MCS。

**② OLLA（Outer Loop Link Adaptation）偏移量**：gNB 维护一个偏移量 $\Delta$，基于实际 HARQ NACK 率持续调整：NACK 多 → $\Delta$ 减小 → MCS 降低；全 ACK → $\Delta$ 增加 → MCS 升高。目标是维持 BLER = 10%。

**③ UE 能力约束**：若 UE 不支持 256QAM，CQI 表中的高 CQI 值对应的 MCS 上限被截断。

**④ 频率选择性调整**：若有子带 CQI，gNB 为不同 RBG 选不同 MCS，而不是用宽带平均值。

**结论**：MCS = f(CQI, OLLA_offset, UE_capability, frequency_selective_adjustment)，是一个综合决策，而非简单查表。

**参考**：38.214 §5.2.2.1（CQI 使用），§5.1.3（MCS 表）

:::

---

**Q2 · 计算题（RI 选择）**

> 4 天线端口，2 天线接收，信道矩阵奇异值为 [3.5, 1.2, 0.4, 0.1]（经过归一化）。SNR = 20dB。
>
> (a) 该信道的有效秩是多少（阈值 -15dB）？
> (b) 使用等功率分配，分别计算 r=1 和 r=2 时每层的 SINR（近似）
> (c) 假设 SINR → SE 的映射为 SE = log₂(1+SINR)，哪个层数更优？

:::details 💡 展开答案

**(a) 有效秩**

最大奇异值 = 3.5，阈值 = 3.5 × 10^(-15/20) = 3.5 × 0.178 ≈ 0.62。
奇异值 > 0.62 的个数：3.5, 1.2 ✅，0.4 ❌ → **有效秩 = 2**

**(b) 每层 SINR（等功率分配，MMSE 近似）**

总 SNR = 20dB = 100（线性）。

r=1 时（最强奇异向量）：
$$\text{SINR}_1 = \sigma_1^2 \times \text{SNR} = 3.5^2 \times 100 / 1 = 1225 \approx 30.9 \text{ dB}$$

r=2 时（两层等功率，每层 SNR/2 = 50）：
$$\text{SINR}_{2,1} = \sigma_1^2 \times 50 = 612.5, \quad \text{SINR}_{2,2} = \sigma_2^2 \times 50 = 72$$

**(c) 最优层数**

$$\text{SE}(r=1) = \log_2(1+1225) \approx 10.3 \text{ bit/s/Hz}$$

$$\text{SE}(r=2) = \log_2(1+612.5) + \log_2(1+72) \approx 9.3 + 6.2 = 15.5 \text{ bit/s/Hz}$$

**r=2 更优**（SE 高出约 50%），与有效秩 = 2 的结论一致。

> 注：实际系统中 r=2 的检测器噪声增强会使 SINR 略低于理论值，AMC 可能选较低 MCS，但总吞吐量仍高于 r=1。

:::

---

**Q3 · 工程排障题（NTN CSI 时效性）**

> NTN LEO 网络（550km，μ=1），配置 Periodic CSI-RS，上报周期 = 40 slots（= 20ms）。现场发现：gNB AMC 频繁触发 HARQ 重传（NACK 率 ~25%，远高于目标 10%），且 MCS 比 UE 实际信道质量对应的最优 MCS 偏高约 2~3 档。信道质量（RSRP）稳定。分析根因并给出配置修正建议。

:::details 💡 展开答案

**根因分析**：

CQI 上报时延链路为：
- UE 测量 CSI-RS → 计算 CQI → 等待上报时机（最多 20ms）→ 通过 PUCCH 发送
- gNB 接收 CQI → 等待下一次调度机会 → 下发 DCI（含 MCS）→ PDSCH 发送

**总时延** = 上报等待（≤20ms）+ RTT/2（≈3ms）+ 调度处理（≈1ms）≈ **最大 24ms**

对于 LEO 信道：若 UE 有运动（飞机/船舶），信道相干时间 $T_c \approx 1 / (4 f_d)$，$f_d$ 可达数百 Hz，$T_c$ 可低至几 ms。CQI 在 24ms 内可能已完全失效，导致 gNB 使用"乐观的旧 CQI"调度较高 MCS，实际解调失败。

**修正建议**：

1. **缩短上报周期**：将 `periodicityAndOffset` 从 sl40 改为 sl10（5ms），减少 CQI 老化时间。

2. **增加 AP-CSI-RS**：在高速场景叠加 Aperiodic CSI-RS，在需要时（如波束切换后）立即触发新鲜 CQI。

3. **加大 OLLA 下调步长**：将外环 AMC 的 NACK 惩罚系数增大，使 OLLA 偏移量快速向下调整，补偿 CQI 老化。

4. **配置 `reportSlotOffsetList-r17`**（Rel-17）：指定 AP-CSI 上报的 slot 偏移，确保 gNB 在需要时能获取最新 CQI。

**参考**：38.214 §5.2.1（CSI 上报），38.821 §6.3（NTN CSI 增强）

:::

---

## 参考资料

- **3GPP TS 38.211 v15.7.0** — CSI-RS 时频资源（§7.4.1.5）
- **3GPP TS 38.214 v15.7.0** — CSI 上报（§5.2.1）；CQI 表（§5.2.2.1）；PMI 码本（§5.2.2.2）
- **3GPP TS 38.331 v15.7.0** — CSI-MeasConfig IE；NZP-CSI-RS-Resource；CSI-ReportConfig
- **3GPP TR 38.821 v17.3.0** — NTN CSI 上报增强（§6.3）
- ShareTechnote — [5G CSI-RS](https://www.sharetechnote.com/html/5G/5G_CSI_RS.html)
