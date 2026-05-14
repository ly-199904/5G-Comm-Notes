# 5G NR Resource Grid（资源网格）

> **3GPP 版本定锚**
>
> | 内容 | 版本 | 规范 |
> |---|---|---|
> | Resource Grid / RE / RB 基础定义 | **Rel-15** | 38.211 §4.4 |
> | BWP 基础（Initial / Active） | **Rel-15** | 38.211 §4.4.5，38.331 |
> | Dormant BWP（省电） | **Rel-16** | 38.300 §5.2 |
> | FR2-2 扩展 RB 范围（μ=5,6） | **Rel-17** | 38.211 §4.4.2 |
> | NTN 场景 BWP 配置指导 | **Rel-17** | 38.821 |

---

## 📡 知识定位

```
Phase 1 学习路径
│
├── ✅ Numerology (μ / SCS) + 帧结构 Frame Structure
│     └── 已掌握：时域刻度（Symbol / Slot / Frame）
│                 频域刻度（Δf = 2^μ × 15 kHz）
│
├── ▶ Resource Grid          ← 我们在这里
│     └── 核心问题：把 Numerology 的刻度尺"固定"在频谱的哪个位置？
│                   UE 在 275 个 RB 的宽频谱里，如何知道自己该用哪一段？
│
├── Channel Mapping（下一课）
│     └── 物理信道如何映射到资源网格的具体时频格点
│
└── OFDM 基础
      └── 资源网格的物理实现
```

**一句话理解**：Numerology 制好了"尺子"（Δf 和 $T_\text{symbol}$），Resource Grid 把这把尺子**锚定在真实频谱上**，并划出每个 UE 当前可用的工作窗口（BWP）。

---

## 💡 核心逻辑

### 1. 为什么 5G 资源网格比 LTE 复杂？

LTE 的频域资源管理相对简单：一种 SCS（15 kHz），一个固定载波带宽，RB 编号从载波最低端开始——资源位置一目了然。

5G 引入了三个复杂度来源，使频域定位问题非平凡：

```
复杂度来源 1：多种 SCS 共存
  同一个 100 MHz 载波内可以同时存在：
    SSB       使用 30 kHz SCS（FR1）
    PDSCH     使用 30 kHz SCS
    一个 BWP  使用 60 kHz SCS（不同的 UE 或场景）
  → 不同 SCS 的 RB 大小不一样，不能用同一把尺子编号！

复杂度来源 2：载波带宽远大于 UE 能力
  FR1 最大载波带宽 = 100 MHz（275 RB @ 30 kHz）
  但低端 UE 最小处理带宽 = 5 MHz（只能看 ~24 RB）
  → UE 不能假设自己能看到整个载波！

复杂度来源 3：多载波 / 载波聚合场景
  不同分量载波（CC）的频率完全独立
  → 需要一个能跨越多载波的全局坐标系
```

**解决方案**：3GPP 引入了一套**两层坐标系**：
- **全局层**：Point A 作为频域绝对锚点（ARFCN 表示）
- **局部层**：BWP 在 Point A 为原点的坐标系中定义 UE 的工作窗口

---

### 2. 资源网格的基本单元

**参考：38.211 §4.4.1 ~ §4.4.4**

#### 2.1 Resource Element（RE）

$$
1 \text{ RE} = 1 \text{ 子载波（频域）} \times 1 \text{ OFDM 符号（时域）}
$$

RE 是资源网格的**最小不可分割单元**，与 LTE 定义完全相同。每个 RE 携带一个复数调制符号（QPSK / 16QAM / 64QAM / 256QAM）。

#### 2.2 Resource Block（RB）

$$
1 \text{ RB} = 12 \text{ 个连续子载波（频域）}
$$

> **关键区别（与 LTE 不同）**：NR 中 RB **仅在频域定义**，时域长度不固定（可以是 1 个符号到整个 slot，由 SLIV 决定）。

一个 RB 的频域带宽：

$$
BW_\text{RB} = 12 \times \Delta f = 12 \times 2^{\mu} \times 15 \text{ kHz}
$$

| μ | SCS | 单个 RB 带宽 |
|:---:|:---:|:---:|
| 0 | 15 kHz | 180 kHz |
| 1 | 30 kHz | 360 kHz |
| 2 | 60 kHz | 720 kHz |
| 3 | 120 kHz | 1.44 MHz |

#### 2.3 Resource Grid 的完整定义

**参考：38.211 §4.4.2**

```
一个资源网格 = 一个天线端口 × 一种 SCS 配置 × 一个传输方向（DL 或 UL）
```

网格的频域大小由最大 RB 数决定（38.211 Table 4.4.2-1）：

| μ | SCS | 最小 RB 数 | 最大 RB 数 | 最大载波带宽 |
|:---:|:---:|:---:|:---:|:---:|
| 0 | 15 kHz | 24 | 275 | 49.5 MHz |
| 1 | 30 kHz | 24 | 275 | **99 MHz ≈ 100 MHz** |
| 2 | 60 kHz | 24 | 275 | 198 MHz |
| 3 | 120 kHz | 24 | 275 | 396 MHz |
| 4 | 240 kHz | 24 | 138 | **397.44 MHz**（FR2 上限）|

> **为什么 μ=4 的最大 RB 数只有 138？** 240 kHz × 12 × 138 ≈ 397 MHz，恰好触及 FR2 的物理带宽上限（400 MHz 射频带宽）。这是硬件约束，不是协议设计的任意选择。

---

### 3. 两类 RB 编号：CRB 与 PRB

这是整个 Resource Grid 概念中**最容易混淆**的部分，必须厘清。

#### 3.1 Common Resource Block（CRB）——全局坐标系

CRB 以 **Point A 为原点**，从 CRB#0 开始向高频方向编号，步长为一个 RB 的带宽（与当前 SCS 对应）。CRB 编号在整个载波范围内连续，是跨 BWP 定位的参考坐标。

```
频率轴（低 → 高）：
  
  Point A
  ↓
  ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
  │0 │1 │2 │3 │4 │5 │...         │N │  ← CRB 编号
  └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
  
  每个格子 = 1 RB = 12 子载波 × 当前 SCS
```

#### 3.2 Physical Resource Block（PRB）——BWP 内局部坐标

PRB 在 **BWP 内部**从 PRB#0 开始编号。PRB 与 CRB 的关系：

$$
n_\text{CRB} = n_\text{PRB} + N_\text{BWP,i}^\text{start}
$$

其中 $N_\text{BWP,i}^\text{start}$ 是第 $i$ 个 BWP 在 CRB 坐标下的起始位置。

```
全局 CRB 坐标：   0   1   2 ... 14  15  16  17  18 ... 50 ... 274
                  ↑                  ↑               ↑
               Point A          BWP 起点         BWP 终点

BWP 内 PRB 坐标：                0   1   2   3  ...  36
```

**关键洞见**：调度器在 DCI 中使用的是 **PRB 编号**（相对于当前激活 BWP 的偏移），而不是全局 CRB。这就是为什么切换 BWP 时，UE 必须重新建立坐标系。

---

### 4. Point A：频域坐标系的绝对锚点

**参考：38.211 §4.4.4.2**

Point A 是整个 5G 频域坐标系的"零点"，通过以下两种方式之一获得：

#### 方式 A：`offsetToPointA`（初始接入阶段）

用于 PCell 下行，在 **SIB1 的 `FrequencyInfoDL-SIB`** 中广播：

$$
f_\text{Point A} = f_\text{SSB,RB0,SC0} - \text{offsetToPointA} \times BW_\text{RB,ref}
$$

其中：
- $f_\text{SSB,RB0,SC0}$：SSB 最低资源块的最低子载波频率
- $\text{offsetToPointA}$：从 Point A 到 SSB 起点的**距离**（以参考 SCS 的 RB 数计）
- $BW_\text{RB,ref}$：参考 SCS 的 RB 带宽（FR1 = 15 kHz × 12 = 180 kHz）

#### 方式 B：`absoluteFrequencyPointA`（RRC 配置阶段）

在 `FrequencyInfoDL`（RRC Reconfiguration）中直接以 **ARFCN** 格式给出 Point A 的绝对频率：

$$
f_\text{Point A} = \text{ARFCN 对应频率} \quad \text{（Point A = Common RB 0 最低子载波）}
$$

#### Point A 的几何关系图

```
频率轴（简化，FR1 @ 30kHz SCS）：

        ← offsetToPointA（单位：15kHz RB）→
        
Point A                              SSB 最低 RB
   ↓                                     ↓
   ┊←—— CRB#0 ——→┊←—— CRB#1 ——→┊ ... ┊←SSB RB#0→┊←SSB RB#1→┊...┊
                                              ↑
                                      k_SSB（子载波粒度偏移）
                                      
   offsetToCarrier →  ┊← 载波实际 RB 范围 →┊
```

> **为什么 Point A 本身不承载信号？** Point A 是**数学坐标原点**，不是物理资源。它可能落在载波带外（`offsetToCarrier > 0` 时），甚至在保护带中。真正传输信号的起点由 `offsetToCarrier` 向高频偏移后确定。

---

### 5. BWP（Bandwidth Part）：UE 的工作窗口

**参考：38.211 §4.4.5，38.331 §6.3.2**

#### 5.1 设计动机

BWP 的引入解决了两个正交的问题：

```
问题 1：能力不对等
  gNB 支持 275 RB 全载波带宽
  低端 IoT UE 最多只能处理 25 RB
  → BWP 让 gNB 将宽载波"缩小窗口"配置给低端 UE

问题 2：省电
  UE 在业务空闲时无需监听全部载波
  → Dormant BWP（Rel-16）让 UE 只监听极窄的 BWP（如 20 RB），大幅降低功耗
```

#### 5.2 BWP 的四个核心参数

```
BWP 配置（38.331 BWP-Downlink-Common）：

  genericParameters
  ├── locationAndBandwidth   → 单一整数，编码了 (startRB, nRB)
  │                            解码公式见下方
  ├── subcarrierSpacing      → 该 BWP 使用的 SCS（可与 SSB SCS 不同！）
  ├── cyclicPrefix           → normal 或 extended（仅 μ=2 支持 extended）
  └── BWP-Id                 → 0~4（最多 4 个 DL BWP + 4 个 UL BWP）
```

**`locationAndBandwidth` 解码**（参考 38.213 §12）：

$$
\text{locationAndBandwidth} = 37 \times N_\text{startRB} + N_\text{RB} - 1
$$

反解：

$$
N_\text{startRB} = \left\lfloor \frac{\text{locationAndBandwidth}}{37} \right\rfloor, \quad
N_\text{RB} = (\text{locationAndBandwidth} \mod 37) + 1
$$

> **工程实用技巧**：Wireshark 抓包看到 `locationAndBandwidth = 1099`，则 `startRB = floor(1099/37) = 29`，`nRB = (1099 mod 37)+1 = 26+1 = 27`。

#### 5.3 BWP 的四种类型与生命周期

| BWP 类型 | 触发方 | SCS 约束 | 用途 | Rel 版本 |
|---|---|---|---|:---:|
| **Initial BWP** | MIB/SIB1 配置 | 同 SSB SCS | 开机初始接入 | Rel-15 |
| **Active BWP** | RRC Reconfiguration | 任意 | 正常业务工作窗口 | Rel-15 |
| **Default BWP** | RRC Release（退回）| 网络配置 | 无连接时的监听窗口 | Rel-15 |
| **Dormant BWP** | MAC CE 或 DCI | 极窄带宽 | 待机省电（监听最小化）| **Rel-16** |

**BWP 切换流程**（Active BWP 切换）：

```
方式 1：DCI 触发（快速，<1 slot）
  gNB 在 DCI format 1_1/0_1 中携带 BWP indicator 字段
  UE 在当前 slot 结束后立即切换至新 BWP

方式 2：RRC 触发（慢速，灵活）
  gNB 发送 RRCReconfiguration（含新的 activeBWP-Id）
  UE 完成 RRC 过程后切换

方式 3：定时器触发（bwp-InactivityTimer 超时）
  UE 在无调度持续一段时间后，自动切回 Default BWP
```

#### 5.4 同一载波上的 BWP 全景图
<BWPVisualizer />

> **Rel-16 vs Rel-17（NTN 场景）**：Rel-17 NTN 中，BWP 配置需要考虑星历有效时间窗口——当 UE 预补偿值过期（`ntn-UlSyncValidityDuration` 超时），UE 应切回窄 BWP（类 Dormant 模式）降低功耗并等待星历更新，避免在不准确的频偏下持续工作。

---

### 6. SSB 与 Point A 的完整几何关系

这是笔试和工程排障中**最常被考查**的计算场景。

#### 6.1 关键参数定义

| 参数 | 单位 | 来源 | 含义 |
|---|---|---|---|
| `absoluteFrequencyPointA` | ARFCN | SIB1 / RRC | Point A 的绝对频率 |
| `offsetToPointA` | 15kHz RB（FR1）/ 60kHz RB（FR2）| SIB1 | Point A 到 SSB 最低 RB 的偏移 |
| `k_SSB`（ssb-SubcarrierOffset）| 子载波 | MIB | SSB 最低 RB 的最低子载波与 Point A 对齐网格的偏移 |
| `absoluteFrequencySSB` | ARFCN | RRC/SIB | SSB 中心频率（GSCN 同步栅格上）|

#### 6.2 Point A 计算公式

**给定 GSCN / absoluteFrequencySSB、k_SSB、offsetToPointA，求 Point A：**

$$
f_\text{Point A} = f_\text{SSB,RB0} - k_\text{SSB} \times \Delta f_\text{ref} - \text{offsetToPointA} \times 12 \times \Delta f_\text{ref}
$$

其中：
- $f_\text{SSB,RB0}$：SSB 资源的最低子载波频率（= SSB 中心频率 − 10 RB 的带宽）
- $\Delta f_\text{ref}$：参考 SCS（FR1 = 15 kHz，FR2 = 60 kHz）

**数值示例**（FR1，SSB SCS = 30 kHz）：

```
已知：
  absoluteFrequencySSB → GSCN=7811 → f_SSB_center = 3449.28 MHz
  k_SSB = 0
  offsetToPointA = 30

Step 1：SSB 最低子载波频率
  f_SSB_RB0 = 3449.28 - (10 × 12 × 0.030) = 3449.28 - 3.60 = 3445.68 MHz

Step 2：Point A 频率
  f_PointA = 3445.68 - (0 × 0.015) - (30 × 12 × 0.015)
           = 3445.68 - 0 - 5.40
           = 3440.28 MHz

Step 3：转换为 ARFCN
  3440.28 MHz → ARFCN = 629352
  （使用 38.101-1 Table 5.4.2.1-1 转换公式）
```

---

### 7. 关键参数间的层次关系全景图

<FreqParamTree />

---

## 🔍 实战信令视角（IE / Log Analysis）

### 关键 IE 字段速查

```
RRC: SIB1 → FrequencyInfoDL-SIB
├── offsetToPointA                ← 从 SSB 到 Point A 的距离（参考 SCS RB 数）
└── scs-SpecificCarrierList
    └── SCS-SpecificCarrier
        ├── subcarrierSpacing     ← 载波实际 SCS（μ）
        ├── offsetToCarrier       ← 从 Point A 到载波边缘（当前 SCS RB 数）
        └── carrierBandwidth      ← 载波总 RB 数

RRC: ServingCellConfigCommon → FrequencyInfoDL
└── absoluteFrequencyPointA       ← Point A 的 ARFCN（绝对频率）

MIB
├── subCarrierSpacingCommon       ← SSB 使用的 SCS
└── ssb-SubcarrierOffset          ← k_SSB（SSB 最低子载波 vs 参考网格的偏移）

RRC: BWP-Downlink（每个 BWP 一个）
└── bwp-Common → genericParameters
    ├── locationAndBandwidth      ← 单整数，编码 (startRB, nRB)
    ├── subcarrierSpacing         ← 该 BWP 的 SCS
    └── cyclicPrefix              ← normal / extended

RRC: ServingCellConfig
└── firstActiveDownlinkBWP-Id    ← 初始激活的 DL BWP 编号
└── defaultDownlinkBWP-Id        ← 定时器超时后退回的 BWP 编号
```

### 🚨 故障排查速查表

| 故障现象 | 首先检查的字段 | 最可能根因 |
|---|---|---|
| PDCCH 盲检完全失败 | MIB `pdcch-ConfigSIB1`（8 bits） | CORESET#0 位置计算错误（offsetToPointA / k_SSB 不匹配）|
| BWP 切换后 PDSCH 调度错误 | `locationAndBandwidth` 解码结果 | startRB 或 nRB 计算有误，PRB→CRB 映射偏移 |
| UE 测量 RSRP 与 gNB 期望值偏差大 | 载波 `offsetToCarrier` 配置 | 载波实际起点偏移，导致 CSI-RS/SSB 落在 UE 认知的不同位置 |
| Dormant BWP 无法激活 | `bwp-InactivityTimer` + `dormancyGroupOutsideActiveTime` | Rel-16 能力协商失败，或定时器配置冲突 |
| NTN 中 BWP 切换后时序混乱 | `ntn-UlSyncValidityDuration` 与 BWP 切换时刻的关系 | 预补偿值在 BWP 切换期间过期 |

> **Rel-15 vs Rel-16 BWP 的关键差异**：
> - Rel-15：BWP 切换只能通过 RRC 或 DCI，UE 必须完整地重新配置载波参数
> - Rel-16 引入 **Dormant BWP**：通过 MAC CE（`SP-ZP-CSI-RS-ResourceSet MAC CE`）快速激活/去激活，切换时延从 RRC 级别（ms~百 ms）降至 MAC 级别（< 1 slot）

---

## 🐍 仿真实现：从参数到可视化

### 数学到代码映射：伪代码骨架

```
══════════════════════════════════════════════════════════════
【数学层】频域资源定位（38.211 §4.4）
──────────────────────────────────────────────────────────────
资源网格频率范围：
  f_低端 = f_PointA + offsetToCarrier × 12 × Δf
  f_高端 = f_低端 + carrierBandwidth × 12 × Δf

BWP 频率范围：
  f_BWP_low  = f_PointA + startRB × 12 × Δf_BWP
  f_BWP_high = f_BWP_low + nRB × 12 × Δf_BWP

SSB 中心频率（已知 offsetToPointA 和 k_SSB）：
  f_SSB_RB0  = f_PointA + offsetToPointA × 12 × Δf_ref
  f_SSB_low  = f_SSB_RB0 + k_SSB × Δf_ref
  f_SSB_high = f_SSB_low + 20 × 12 × Δf_SSB  （SSB = 20 RB）
══════════════════════════════════════════════════════════════
【算法层】
──────────────────────────────────────────────────────────────
FUNCTION decode_location_and_bandwidth(LAB):
    startRB = floor(LAB / 37)
    nRB     = (LAB mod 37) + 1
    RETURN (startRB, nRB)

FUNCTION point_a_to_freq_mhz(arfcn):
    # 38.101-1 Table 5.4.2.1-1（FR1）
    IF arfcn < 600000:
        RETURN 0.005 × arfcn  # < 3 GHz，步长 5 kHz
    ELIF arfcn < 2016667:
        RETURN 3000 + 0.015 × (arfcn - 600000)  # 3~24.25 GHz
    ...
══════════════════════════════════════════════════════════════
【实现层】Python（见独立文件 code/resource_grid_sim.py）
──────────────────────────────────────────────────────────────
carrier = CarrierConfig(mu=1, n_rb=275, point_a_arfcn=629352, ...)
bwp     = BWPConfig(start_rb=29, n_rb=106, mu=1)
ssb     = SSBConfig(offset_to_point_a=30, k_ssb=0, mu_ssb=1)
visualize_resource_grid(carrier, [bwp], ssb)
══════════════════════════════════════════════════════════════
```

**完整仿真代码见独立文件** → `code/resource_grid_sim.py`

实现内容：
- Point A / SSB / BWP / CORESET#0 的频域位置可视化
- `locationAndBandwidth` 编解码器
- ARFCN ↔ 频率转换
- Point A 计算的端到端推导验证

---

## 🔗 走向信道映射（Channel Mapping）

### 资源网格只是"空白画布"——信号怎么画上去？

到目前为止，资源网格给了我们一张有刻度的时频坐标纸：
- 横轴：时间（Slot / Symbol）
- 纵轴：频率（RB / RE）
- 工作范围：由 BWP 框定

但这张纸上**什么都没有**——没有规定哪些格子放控制信息，哪些格子放数据，哪些格子放参考信号。

**下一课的核心问题**：

```
哪些 RE 是 PDCCH？   → CORESET + Search Space 决定
哪些 RE 是 PDSCH？   → DCI 中的资源分配字段决定
哪些 RE 是 DMRS？    → 固定图样（Type A / Type B）
哪些 RE 是 SSB？     → 20 RB 宽，时域位置由 ssb-PositionsInBurst 决定
哪些 RE 是 CSI-RS？  → NZP-CSI-RS-Resource 配置的周期图样
```

**CORESET（Control Resource Set）预告**：

CORESET 是在 BWP 内部专门预留给 PDCCH 的**时频矩形块**：
- 频域：$N_\text{RB}^\text{CORESET}$ 个 RB（必须是 6 的倍数）
- 时域：1、2 或 3 个连续 OFDM 符号

CORESET#0 是最特殊的一个——它的位置完全由 MIB 的 `pdcch-ConfigSIB1` 字段（8 bits）隐式决定，对应 38.213 Tables 13-1 ~ 13-10 的查表结果，而不是显式 RRC 配置。

---

## 📝 版本演进与工程自测

### 版本演进速览

| Feature | Rel-15 | Rel-16 | Rel-17 |
|---|:---:|:---:|:---:|
| Resource Grid / RE / RB 基础 | ✅ | 不变 | 不变 |
| BWP（Initial / Active / Default）| ✅ | 增强 | 不变 |
| Dormant BWP（省电）| ❌ | ✅ | 增强 |
| BWP-based SCS 切换 | ✅ 基础 | ✅ 增强（MAC CE 触发）| 不变 |
| FR2-2 扩展 RB 范围（μ=5,6）| ❌ | ❌ | ✅ |
| NTN BWP 配置指导 | ❌ | ❌ | ✅ 38.821 |

---

### 面试级自测题

**Q1 · 概念题**

> Point A 是载波频谱的最低端吗？如果不是，`offsetToCarrier` 和 `offsetToPointA` 分别描述什么？

<details>
<summary>💡 展开答案</summary>

**不是**。Point A 是**全局频域坐标系的原点**，不代表任何实际信号的起点。它可能位于载波保护带之外（`offsetToCarrier > 0` 时，Point A 比载波实际起点还低）。

- `offsetToCarrier`：从 Point A 到**载波可用资源起点**的距离，单位为当前 BWP SCS 对应的 RB 数。它告诉我们"实际信号从哪里开始"。
- `offsetToPointA`：从 Point A 到 **SSB 最低 RB** 的距离，单位为参考 SCS（FR1=15kHz）的 RB 数。它告诉我们"SSB 在全局坐标系的哪里"。

两者使用的 RB 单位不同（参考 SCS vs 实际 BWP SCS），是混淆的根源。

</details>

---

**Q2 · 计算题**

> 已知：Wireshark 抓包看到 `locationAndBandwidth = 1099`，`subcarrierSpacing = kHz30`，`absoluteFrequencyPointA` 对应 3440.28 MHz。
>
> (a) 解码出 BWP 的 startRB 和 nRB
> (b) 计算 BWP 的频域范围（以 MHz 表示）

<details>
<summary>💡 展开答案</summary>

**(a) 解码 locationAndBandwidth**

$$
\text{startRB} = \left\lfloor \frac{1099}{37} \right\rfloor = \left\lfloor 29.70 \right\rfloor = 29
$$

$$
\text{nRB} = (1099 \mod 37) + 1 = 26 + 1 = 27
$$

**(b) 频域范围**（SCS = 30 kHz，单个 RB = 360 kHz = 0.36 MHz）

$$
f_\text{BWP,low} = 3440.28 + 29 \times 0.36 = 3440.28 + 10.44 = 3450.72 \text{ MHz}
$$

$$
f_\text{BWP,high} = 3450.72 + 27 \times 0.36 = 3450.72 + 9.72 = 3460.44 \text{ MHz}
$$

BWP 带宽 = 9.72 MHz，位于 3450.72 ~ 3460.44 MHz 范围内。

</details>

---

**Q3 · 工程排障题（综合）**

> 现场问题：gNB 配置 FR1，μ=1（30 kHz SCS），100 MHz 载波。UE 成功接入并进入 RRC_CONNECTED，但 Active BWP 切换后，部分 UE 反映 PDSCH 吞吐量异常下降，基带 Log 显示 PRB 利用率正常。此时基带侧 DCI 的 PRB 分配范围是 0~26（共 27 PRB）。
>
> 排查方向是什么？应检查哪些 IE？

<details>
<summary>💡 展开答案</summary>

**核心怀疑点**：BWP 切换后，UE 端和 gNB 端对新 BWP 的 `locationAndBandwidth` 解读不一致，导致 PRB 映射到 CRB 时出现偏差。

**排查步骤**：

1. **解码切换后的 `locationAndBandwidth`**：在 RRCReconfiguration 消息中找到新 BWP 的 `locationAndBandwidth` 值，手动计算 startRB 和 nRB，确认与预期一致。

2. **验证 `subcarrierSpacing` 一致性**：新 BWP 的 SCS 是否与旧 BWP 相同？若 SCS 变化，PRB 的物理带宽变化，原有的 DMRS 位置计算全部失效。

3. **检查 UE 侧 Log 中的 PRB 偏移**：UE 从接收到 DCI 到实际解调 PDSCH，需要将 DCI 中的 PRB 编号（相对 BWP 内部）转换为绝对频率，若转换出错会导致 UE 在错误的频率上解调，EVM 急剧恶化，吞吐量崩塌但 PRB 计数正常（gNB 认为调度成功）。

**关键 IE**：新 BWP 的 `locationAndBandwidth`，`subcarrierSpacing`，以及 UE 的 `activeBWP-Id` 是否与 gNB 预期一致。

</details>

---

## 参考资料

- **3GPP TS 38.211 v15.7.0** — 物理信道；资源网格定义（§4.4）；BWP（§4.4.5）
- **3GPP TS 38.213 v15.7.0** — BWP locationAndBandwidth 解码（§12）；CORESET#0 位置（§13）
- **3GPP TS 38.331 v15.7.0** — RRC IE 定义：FrequencyInfoDL、BWP-Downlink、SCS-SpecificCarrier
- **3GPP TS 38.101-1 v15.7.0** — ARFCN / 频率转换公式（Table 5.4.2.1-1）
- **3GPP TR 38.821 v17.3.0** — NTN 场景 BWP 配置指导
- ShareTechnote — [5G Resource Grid](https://www.sharetechnote.com/html/5G/5G_ResourceGrid.html)
- ShareTechnote — [Frequency Domain Location（Point A / BWP）](https://www.sharetechnote.com/html/5G/5G_ResourceBlockIndexing.html)