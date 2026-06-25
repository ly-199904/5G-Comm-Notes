# 5G NR 系统消息与寻呼：SIB / Paging

> **3GPP 版本定锚**
>
> | 内容 | 版本 | 规范 |
> |---|---|---|
> | MIB / SIB1（RMSI）| **Rel-15** | 38.331 §6.2.2 / §6.3.1 |
> | SIB 分类与 SI 调度 / SI-window | **Rel-15** | 38.331 §5.2.2 |
> | On-demand SI（按需系统消息）| **Rel-15** | 38.331 §5.2.2.3.3 |
> | 寻呼 PF/PO 计算 | **Rel-15** | 38.304 §7.1 |
> | Paging 消息 / P-RNTI / Short Message | **Rel-15** | 38.331 §6.5，38.304 §7 |
> | maxNrofPageRec = 32 | **Rel-15** | 38.331（PCCH-Message）|
> | stopPagingMonitoring（Short Message 位）| **Rel-16** | 38.331 §6.5 |
> | **SIB19 / ntn-Config**（星历、common TA、k_offset）| **Rel-17** | 38.331 §6.3.1，38.821 §6 |
> | MBS 相关 SIB20/21 | **Rel-17** | 38.331 §5.2.1 |

---

## 📡 知识定位

```
Phase 3 · 连接管理与移动性
│
├── 模块一 · 控制面与 Idle 世界
│   ├── 3.1 RRC 状态机 ✅
│   └── ▶ 3.2 系统消息与寻呼（SIB / Paging）   ← 我们在这里
│         接上 3.1 的两个钩子：寻呼 PF/PO 完整推导 + SIB19 星历
│         向下复用 Phase 1（PBCH→MIB→SIB1）、Phase 2（P-RNTI、On-demand SI 走 RACH）
│
├── 模块二 · 容量扩展      3.3 CA · 3.4 DC
└── 模块三 · 闭环维持与移动性   3.5 功率控制 · 3.6 移动性
```

**一句话理解**：UE 一开机什么都不知道——不知道这是谁的网、用什么参数接入、自己什么时候该醒来听呼叫。**系统消息（SI）是网络向所有 UE 的广播自我介绍，寻呼（Paging）是网络反过来找特定 UE 的点名机制**。两者一"广播"一"点名"，共同支撑 IDLE/INACTIVE 这个"半睡世界"的运转。

---

## 💡 核心逻辑

> 本课分两大块：**Part A 系统消息**（网络→所有 UE 的广播）与 **Part B 寻呼**（网络→特定 UE 的召唤），最后 **Part C** 收口 NTN 特殊性。

---

## Part A · 系统消息（System Information）

### A.1 SI 的层级：从 MIB 到 SIB19

系统消息是分层的，像剥洋葱——每一层告诉你下一层在哪：

```
SSB (PBCH) ──► MIB           最小信息：SFN高位 + pdcch-ConfigSIB1 → 指明 SIB1 在哪
                 │
                 ▼
            PDCCH(SI-RNTI) 调度
                 │
                 ▼
              SIB1 (RMSI)    "小区身份证"：PLMN/TAC/CellID + si-SchedulingInfo（其他 SIB 怎么取）
                 │             + servingCellConfigCommon（公共接入参数）+ 接入控制
                 ▼
       si-SchedulingInfo 指引
                 │
                 ▼
        SIB2 / SIB3 / ... / SIB19   按需或周期广播，打包进 SI 消息，在 SI-window 内发送
```

- **MIB**（38.331 §6.2.2）：搭载在 PBCH（属 SSB 的一部分），极简。关键字段 `pdcch-ConfigSIB1` 给出 **CORESET#0 + SearchSpace#0** 的位置——这是 UE 找到调度 SIB1 的 PDCCH 的唯一线索（衔接 Phase 1 的 SSB 与 Phase 2 的 CORESET）。
- **SIB1**（又称 RMSI，Remaining Minimum System Information）：搭载在 PDSCH，由 `SI-RNTI` 加扰的 PDCCH 调度。它是"小区身份证"，必含且周期广播。

### A.2 SIB 分类速查（38.331 §5.2.1）

| SIB | 内容 | 引入 |
|---|---|---|
| **SIB1** | RMSI：小区接入信息、SI 调度、公共配置、接入控制 | Rel-15 |
| SIB2 | 小区重选公共参数 | Rel-15 |
| SIB3 / SIB4 | 同频 / 异频小区重选 | Rel-15 |
| SIB5 | 异系统（E-UTRA）重选 | Rel-15 |
| SIB6 / SIB7 / SIB8 | ETWS 主通知 / ETWS 次通知 / CMAS（地震海啸/公共预警）| Rel-15 |
| SIB9 | 时间信息（GPS / UTC）| Rel-15 |
| SIB10–SIB14 | 网络名 / idle 测量 / NR 侧行 / V2X 等 | Rel-16 |
| **SIB19** | **NTN 配置：星历、common TA、k_offset、有效期** | **Rel-17** |
| SIB20 / SIB21 | MBS（多播广播）配置 | Rel-17 |

### A.3 SI 调度与 SI-window（38.331 §5.2.2.3.2）

除 SIB1 外，其它 SIB 被打包进若干 **SI 消息（SI message）**，每个 SI 消息有自己的周期 `si-Periodicity`，并在**互不重叠的 SI-window** 内发送。第 $n$ 个 SI 消息的 SI-window 起点由下式确定：

$$
\text{slot} = x \bmod N, \qquad \text{所在无线帧满足}\quad \text{SFN} \bmod T = \left\lfloor \frac{x}{N} \right\rfloor
$$

其中 $x = (n-1)\cdot w$，$w$ 为 `si-WindowLength`（slot 数），$N$ 为每无线帧的 slot 数（取决于 numerology），$T$ 为该 SI 消息的 `si-Periodicity`（无线帧数）。

直觉：把各 SI 消息的窗口**首尾相接**地铺在时间轴上，每个窗口 $w$ 个 slot，第 $n$ 个就排在 $(n-1)w$ 的位置——既不重叠，UE 也能确定性地算出"该在哪等哪条 SI"。仿真第 4 图把 MIB/SIB1/SI-window 的周期层级画了出来。

### A.4 On-demand SI（按需系统消息，38.331 §5.2.2.3.3）

不是所有 SIB 都值得一直广播——有些（如某些重选参数）很少被用到。网络可把它们标记为 `si-BroadcastStatus = notBroadcasting`，**平时不发，UE 需要时主动请求**：

- **Msg1-based**：`si-RequestConfig` 给请求分配专用 PRACH 资源，UE 发对应前导 → 网络开始广播（复用 **Phase 2 RACH**）。
- **Msg3-based**：UE 在 Msg3 发 `RRCSystemInfoRequest`，携带 `requestedSI-List`。

这是"按需广播"的省资源设计：把空口广播开销从"恒定占用"变成"用时才发"。

### A.5 SI 变更通知与有效性

SI 只能在**修改周期（modification period）边界**改变。UE 怎么知道 SI 变了？

- **Short Message**（DCI 中 P-RNTI 加扰，无需 PDSCH）的 `systemInfoModification` 位置 1 → 提示 UE 在下个修改周期重读 SI。
- `etwsAndCmasIndication` 位 → 提示有 ETWS/CMAS 预警。
- SIB1 里的 `systemInfoValueTag` 是 SI 的"版本号"，UE 重回小区时比对它就知道缓存的 SI 是否还有效（有效期内最长可缓存 3 小时），避免无谓重读。

---

## Part B · 寻呼（Paging）

### B.1 两类寻呼：CN vs RAN（深化 3.1）

3.1 已点明 IDLE 被 CN 寻呼、INACTIVE 被 RAN 寻呼。这里把机制讲透：

| 维度 | CN 寻呼（CN-initiated）| RAN 寻呼（RAN-initiated）|
|---|---|---|
| 发起方 | **AMF** | **gNB**（anchor）|
| 目标 UE 态 | RRC_IDLE（CM-IDLE）| RRC_INACTIVE（CM-CONNECTED）|
| 寻呼标识 | `ng-5G-S-TMSI` | `fullI-RNTI` |
| 寻呼范围 | 整个 **TA List**（跨多 gNB）| **RNA**（更小，gNB 自治）|
| 触发 | 被叫 / 下行数据（CM-IDLE 时）/ 网络发起 NAS | 下行数据到达 INACTIVE UE |
| 核心网信令 | 重（AMF 协调多 gNB）| **轻（gNB 本地完成，不惊动 AMF）** |

> RAN 寻呼是 INACTIVE "省核心网信令"的另一面：下行小数据来了，anchor gNB 在 RNA 内自己把 UE 喊醒，**全程不上报 AMF**——与 3.1 讲的"恢复省 2 个往返"一脉相承。

### B.2 寻呼如何投递：P-RNTI / Paging 消息 / Short Message

寻呼的载体是用 **P-RNTI**（公共值 `FFFE`）加扰的 PDCCH（DCI format 1_0）。它有两种用法：

```
PDCCH (DCI 1_0, P-RNTI 加扰)
        │
        ├─► 调度 PDSCH ──► Paging 消息 (PCCH-Message)
        │                   └── pagingRecordList[] （每条：ue-Identity + accessType）
        │                       └── 最多 maxNrofPageRec = 32 条记录
        │
        └─► 直接携带 Short Message（DCI 内 8 bit，无需 PDSCH）
                ├── systemInfoModification     （SI 变更通知）
                ├── etwsAndCmasIndication       （预警通知）
                └── stopPagingMonitoring (Rel-16)
```

**关键洞察**：SI 变更/预警这类"一比特通知"用 Short Message 直接塞进 DCI，连 PDSCH 都不占——这是为什么 SI 变更通知和寻呼共用 P-RNTI 监听机会的原因（UE 醒来一次，两件事一起办）。

### B.3 DRX 与 PF/PO —— 本课核心公式（38.304 §7.1）

UE 在 IDLE/INACTIVE 不会一直盯着 PDCCH，而是按**寻呼 DRX 周期**只在自己的**寻呼时机（PO）**醒来。它什么时候醒、在哪个无线帧（PF）醒，由下面两式唯一确定：

**寻呼帧 PF**（哪一帧）：

$$
(\text{SFN} + \text{PF\_offset}) \bmod T = \frac{T}{N}\,(\text{UE\_ID} \bmod N)
$$

**寻呼时机索引 $i_s$**（帧内第几个 PO）：

$$
i_s = \left\lfloor \frac{\text{UE\_ID}}{N} \right\rfloor \bmod N_s
$$

参数定义：

| 符号 | 含义 | 取值 |
|---|---|---|
| $T$ | 寻呼 DRX 周期 | $\min$(SIB1 默认, UE 专属, INACTIVE 的 `ran-PagingCycle`)，∈ {32,64,128,256} 帧 |
| $N$ | 周期内候选寻呼帧数 | $\min(T, nB)$ |
| $N_s$ | 每帧寻呼时机数 | $\max(1, nB/T)$，∈ {1,2,4} |
| $\text{UE\_ID}$ | UE 标识 | $\text{5G-S-TMSI} \bmod 1024$ |
| $nB$ | PCCH-Config 参数 | ∈ {4T, 2T, T, T/2, …, T/32} |

**$nB$ 的双重作用**：当 $nB \ge T$，它控制 $N_s$（每帧多个 PO）；当 $nB \le T$，它控制 PF 间隔（$N$ 个 PF 均匀分布，间隔 $T/N$ 帧）。

下面的计算器把这两个公式做成可交互的——改 TMSI / T / nB，实时看 UE 落在哪个 PF、哪个 PO，以及还有哪些 UE 跟它挤在同一个时机：

<PagingOccasionCalc />

### B.4 寻呼容量与碰撞（maxNrofPageRec）

注意公式的一个后果：**所有满足 $\text{UE\_ID} \bmod N$ 相同（且 $i_s$ 相同）的 UE 都落在同一个 PO**，被同一条 Paging 消息一起寻呼。但单条消息最多 `maxNrofPageRec = 32` 条记录。于是：

$$
\text{每 PO 期望寻呼记录} \approx \frac{\text{小区 UE 数}}{N \cdot N_s} \times (\text{每周期被寻呼比例})
$$

地面宏小区 UE 数有限，记录数远低于 32（仿真：~4 条/PO，富余）。但 **NTN 大波束覆盖面积极大、聚合 UE 海量**，记录数可能远超 32（仿真：~150 条/PO）→ 溢出 → 顺延到后续 DRX 周期 → **寻呼时延骤增**（仿真第 2 图：+5120 ms）。这是 NTN 寻呼的核心容量瓶颈。

---

## Part C · NTN 特殊性

### C.1 SIB19：NTN 的"导航与时间手册"（38.331 §6.3.1，38.821 §6）

地面 UE 靠测量就能接入；NTN UE 面对数百到数万公里的链路、剧烈的多普勒和动态时延，**必须先知道卫星在哪、怎么动**，才能预补偿。这些信息都在 **SIB19 的 `ntn-Config`** 里：

| 字段 | 作用 |
|---|---|
| `ephemerisInfo` | 卫星星历：轨道根数（半长轴/偏心率/倾角/升交点赤经/近地点幅角/平近点角）或 ECEF 位置-速度状态矢量 |
| `epochTime` | 星历参考时刻（星历随时间外推的基准）|
| `ta-Common` / `ta-CommonDrift` / `…DriftVariation` | 小区公共时间提前及其漂移——预补偿馈电+服务链路的"批量"时延 |
| `cellSpecificKoffset`（k_offset）| 调度时序偏移：把 HARQ / 调度的定时关系整体后推，容纳大 RTT |
| `ntn-UlSyncValidityDuration` | UL 同步（TA/星历）有效时长——过期须重新获取 |
| `ntn-PolarizationDL/UL`、`feederLinkInfo` | 极化、馈电链路信息 |

**与既有课程的接续**：`ta-Common` 是 Phase 2 RACH 里"NTN 大时延下 TA 预补偿"的配置来源；`k_offset` 则是 Phase 1/2 定时关系（$K_0/K_1/K_2$）在 NTN 下的整体平移参数——后续 3.5 功控与调度时序会再用到它。

### C.2 NTN 跟踪区与寻呼

- **地固定 vs 地移波束**：NTN 小区可以是 quasi-earth-fixed（波束在一段时间内"钉"在某地）或 earth-moving（波束随卫星扫过地面）。两者的"小区↔TA"映射不同。
- **地移波束下 TA 关系时变**：同一块地面区域在不同时刻被不同小区覆盖，网络须广播这种时变映射，UE 才能正确判断自己是否还在注册的 TA 内（否则触发 TAU/RNAU——衔接 3.1 的 RNAU 风暴问题）。
- **寻呼时延 vs 省电的取舍**：NTN IoT 要深睡省电 → 倾向长 DRX → 寻呼时延随 $T$ 线性增长（仿真第 3 图：时延 ≈ 半周期等待 + 单程传播）。注意一个常被误解的点：**寻呼时延主要由 DRX 周期决定，传播只是叠加项**（LEO 5 ms 可忽略，GEO 239 ms 在短 DRX 时才显著）——这与 3.1 连接建立"RTT 被往返次数放大而主导"恰好相反，因为寻呼是单次下行投递。

---

## 🔍 实战信令视角（IE / Log Analysis）

### 关键 IE 速查

```
SIB1（节选）
├── cellAccessRelatedInfo → plmn-IdentityList / trackingAreaCode / cellIdentity
├── si-SchedulingInfo
│   ├── schedulingInfoList[]  → 每个 SI 消息：
│   │   ├── si-Periodicity (rf8/rf16/.../rf512)
│   │   ├── si-BroadcastStatus (broadcasting / notBroadcasting) ← 是否按需
│   │   └── sib-MappingInfo[] (该 SI 消息含哪些 SIB)
│   ├── si-WindowLength (s5/s10/.../s1280 slots)
│   └── si-RequestConfig (on-demand 的 PRACH 资源)
├── servingCellConfigCommon (PRACH/PDSCH/PUSCH 公共配置)
├── ue-TimersAndConstants (t300/t301/t319 等)
└── systemInfoValueTag  ← SI 版本号

Paging（PCCH-Message，DL-CCCH）
└── pagingRecordList[]   （≤ maxNrofPageRec = 32）
    └── PagingRecord
        ├── ue-Identity (ng-5G-S-TMSI | fullI-RNTI)   ← CN 寻呼用前者，RAN 寻呼用后者
        └── accessType (non3GPP 标识，可选)

Short Message（DCI P-RNTI 内，8 bit）
├── bit1: systemInfoModification
├── bit2: etwsAndCmasIndication
└── bit3: stopPagingMonitoring (Rel-16)

SIB19 ntn-Config（NTN）
├── ephemerisInfo (orbital params | PVT state vector)
├── epochTime
├── ta-Common / ta-CommonDrift / ta-CommonDriftVariation
├── cellSpecificKoffset (k_offset)
└── ntn-UlSyncValidityDuration
```

### Log 排障要点

- **UE 收不到 SIB-x**：先确认该 SIB 的 `si-BroadcastStatus`——若是 `notBroadcasting`，UE 必须先按需请求（Msg1/Msg3）才会被广播；否则一直等不到。
- **`ue-Identity` 类型对不上**：抓到的 PagingRecord 用 `fullI-RNTI` 却期望 `5G-S-TMSI`（或反之）→ 说明寻呼来源（RAN vs CN）与 UE 当前 RRC 态预期不符。
- **算 PF/PO 对不上空口**：检查 $T$ 的取值——它是 SIB1 默认、UE 专属、`ran-PagingCycle` 三者取**最短**；只用 SIB1 默认值会算错落点。

---

## 🚨 故障排查速查表

| 故障现象 | 首先检查 | 最可能根因 |
|---|---|---|
| UE 一直收不到某 SIB | 该 SIB 的 `si-BroadcastStatus` | 标记为 notBroadcasting，需按需请求才广播 |
| UE 接入慢（卡在读 SI）| MIB→SIB1→SI-window 链路 | SI-window 周期长，worst-case 获取时延高 |
| 寻呼漏检 / 时延高 | $T$ 取值（三者取最短）/ PF-PO 计算 | DRX 周期或 nB 配置与终端算法不一致 |
| NTN 大波束寻呼成功率低 | 每 PO 寻呼记录数 vs 32 | 记录溢出顺延，寻呼时延骤增（容量瓶颈）|
| NTN UE 无法预补偿、接入失败 | SIB19 `ntn-Config` / `epochTime` | 星历缺失或过期（超 `ntn-UlSyncValidityDuration`）|
| SI 变更后 UE 仍用旧参数 | Short Message `systemInfoModification` | UE 未监听变更通知或修改周期未到 |

---

## 📝 版本演进与工程自测

### 版本演进速览

| Feature | Rel-15 | Rel-16 | Rel-17 |
|---|:---:|:---:|:---:|
| MIB / SIB1 / SI 调度 | ✅ | 不变 | 不变 |
| On-demand SI | ✅ | 不变 | 不变 |
| PF/PO 寻呼公式 | ✅ | 不变 | 不变 |
| Short Message（SI 变更/预警）| ✅ | +`stopPagingMonitoring` | 不变 |
| **SIB19 / ntn-Config（NTN）** | ❌ | ❌ | ✅ |
| MBS SIB20/21 | ❌ | ❌ | ✅ |
| 寻呼增强（PEI 寻呼早指示）| ❌ | ❌ | ✅（节电）|

---

### 面试级自测题

**Q1 · 概念题（高频）**

> CN 寻呼与 RAN 寻呼分别由谁发起、用什么标识、在多大范围寻呼？为什么 RAN 寻呼（针对 INACTIVE UE）能显著降低核心网信令负荷？

:::details 💡 展开答案

| | CN 寻呼 | RAN 寻呼 |
|---|---|---|
| 发起 | **AMF** | **anchor gNB** |
| 目标 | RRC_IDLE（CM-IDLE）| RRC_INACTIVE（CM-CONNECTED）|
| 标识 | `ng-5G-S-TMSI` | `fullI-RNTI` |
| 范围 | 整个 **TA List**（跨多 gNB）| **RNA**（更小）|

**RAN 寻呼省核心网信令的原因**：INACTIVE UE 的上下文保留在 anchor gNB、N2 对 AMF 保持。当下行数据到达，**anchor gNB 直接在 RNA 内本地发起寻呼把 UE 喊醒**，全程不需要 AMF 协调、不需要跨整个 TA List 在所有 gNB 上扩散寻呼。相比之下 CN 寻呼要 AMF 把寻呼消息分发到 TA List 里的每个 gNB。把"喊醒 UE"这件事从核心网下沉到 RAN 本地，正是 INACTIVE 态对海量频繁小数据场景省信令的关键——与恢复流程"省 2 个往返"是同一设计哲学的两面。

参考：38.300 §9.2.5，38.304 §7.1。
:::

**Q2 · 计算题（PF/PO，必考）**

> 某小区 5G-S-TMSI = 1234567890，DRX 周期 $T=64$ 帧，PCCH 配置 $nB = 2T$，$\text{PF\_offset}=0$。求：
> (a) UE_ID、$N$、$N_s$；
> (b) 寻呼帧 PF（即 SFN mod 64 的值）与寻呼时机索引 $i_s$；
> (c) 一个 DRX 周期内共有多少个寻呼时机？该 UE 醒来的实际周期是多少毫秒？

:::details 💡 展开答案

**(a)**
- $\text{UE\_ID} = 1234567890 \bmod 1024 = \mathbf{722}$
  （$1234567890 = 1205632\times1024 + 722$）
- $nB = 2T = 128$ 帧
- $N = \min(T, nB) = \min(64, 128) = \mathbf{64}$
- $N_s = \max(1,\ nB/T) = \max(1,\ 128/64) = \mathbf{2}$

**(b)**
- PF：$(\text{SFN}) \bmod 64 = \dfrac{T}{N}(\text{UE\_ID} \bmod N) = \dfrac{64}{64}\times(722 \bmod 64)$
  $722 \bmod 64 = 722 - 11\times64 = 722-704 = 18$
  ⟹ $\text{SFN} \bmod 64 = \mathbf{18}$
- $i_s = \left\lfloor \dfrac{722}{64} \right\rfloor \bmod 2 = 11 \bmod 2 = \mathbf{1}$（即该帧 2 个 PO 中的第 2 个）

**(c)**
- 总寻呼时机数 $= N \times N_s = 64 \times 2 = \mathbf{128}$
- UE 醒来周期 $= T \times 10\text{ms} = 64 \times 10 = \mathbf{640\ ms}$（每 640 ms 在 SFN mod 64=18 的帧、第 2 个 PO 醒来一次）

可用本课计算器设 TMSI=1234567890、T=64、nB=2T 验证。
:::

**Q3 · NTN 设计题（综合）**

> 某 LEO NTN 网络服务海量静止 IoT 终端。运营商希望终端尽量省电，于是把寻呼 DRX 周期 $T$ 配到最大（256 帧）。结果发现：(1) 部分下行触发的寻呼时延高达数秒；(2) 繁忙时段寻呼成功率下降。请分别解释两个现象的根因，并各给一条缓解措施。

:::details 💡 展开答案

**现象 1：寻呼时延数秒——根因是长 DRX 本身**
寻呼时延 ≈ DRX 半周期等待 + 下行单程传播。$T=256$ 帧 = 2560 ms，半周期等待就 **1280 ms**；GEO/远地 LEO 再叠加传播。所以单是"配最长 DRX 省电"就把时延推到秒级——**省电与低时延天然矛盾**（仿真第 3 图）。
- 缓解：不要一刀切配最长 DRX。对有下行业务预期的终端用较短 $T$，或采用 Rel-17 **PEI（Paging Early Indication，寻呼早指示）**——让 UE 用极低功耗先判断"这次有没有我"，多数情况下不必解码完整寻呼，从而兼顾省电与可用 DRX。

**现象 2：繁忙时段成功率下降——根因是寻呼记录溢出**
LEO 大波束覆盖面积极大，聚合的 UE 数远超地面小区。落在同一 PO 的 UE 极多，繁忙时段每 PO 待寻呼记录数可能**超过 `maxNrofPageRec = 32`**，溢出的记录只能顺延到后续 DRX 周期，表现为时延增大、（在重试限制内）成功率下降（仿真第 2 图：NTN ~150 记录/PO，溢出致 +5120 ms）。
- 缓解：增大 $N\cdot N_s$（调整 $nB$ 增加每周期寻呼时机数），把 UE 摊薄到更多 PO 上，降低单 PO 记录数；必要时结合波束/小区分裂缩小单波束聚合的 UE 规模。

**底层洞察**：NTN 寻呼要在**省电（长 DRX）、低时延（短 DRX）、容量（足够多 PO）**三者间联合权衡，而地面通常只需考虑前两者——这是大波束带来的本质差异。

参考：38.304 §7.1；38.331（maxNrofPageRec、PEI）；TR 38.821 §6/§7。
:::

---

## 参考资料

- **3GPP TS 38.331 v15.x / v17.x** — RRC：MIB/SIB1（§6.2.2/§6.3.1）、SI 调度（§5.2.2）、Paging/Short Message（§6.5）、ntn-Config（SIB19）
- **3GPP TS 38.304 v15.x / v17.x** — IDLE/INACTIVE UE 过程：寻呼 PF/PO 计算（§7.1）
- **3GPP TS 38.300 v17.x** — NR 总体：寻呼总体描述（§9.2.5）
- **3GPP TR 38.821 v17.x** — NTN 解决方案：SIB19/星历/common TA（§6）、寻呼与移动性（§7）
- ShareTechnote — [Paging](https://www.sharetechnote.com/html/5G/5G_Paging.html) / [SIB](https://www.sharetechnote.com/html/5G/5G_SIB.html)
