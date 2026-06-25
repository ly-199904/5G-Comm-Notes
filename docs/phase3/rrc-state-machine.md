# 5G NR RRC 状态机：IDLE / INACTIVE / CONNECTED

> **3GPP 版本定锚**
>
> | 内容 | 版本 | 规范 |
> |---|---|---|
> | RRC 三态（IDLE / **INACTIVE** / CONNECTED）| **Rel-15** | 38.331 §4.2.1，38.300 §9.2.2 |
> | RRC_INACTIVE 状态与 Resume 流程 | **Rel-15** | 38.331 §5.3.13 |
> | RRCRelease + suspendConfig（挂起）| **Rel-15** | 38.331 §5.3.8.3 |
> | RNA / RNAU（RAN 通知区与更新）| **Rel-15** | 38.300 §9.2.2.4 |
> | 寻呼 PF/PO 计算 | **Rel-15** | 38.304 §7.1 |
> | **SDT**（INACTIVE 态小数据传输）| **Rel-17** | 38.300 §16.7，38.321 §5.30 |
> | NTN 连接管理与时延 | **Rel-17** | TR 38.821 §7 |

---

## 📡 知识定位

```
Phase 3 · 连接管理与移动性
│
├── 模块一 · 控制面与 Idle 世界
│   ├── ▶ 3.1 RRC 状态机              ← 我们在这里（Phase 3 脊柱）
│   │     核心问题：UE 与网络的"关系档案"如何建立、保存、迁移、销毁？
│   │     它定义了后续所有课程赖以运行的"状态词汇"。
│   └── 3.2 系统消息与寻呼（SIB / Paging）
│
├── 模块二 · 容量扩展      3.3 CA · 3.4 DC
│       （需 UE 已在 CONNECTED）
│
└── 模块三 · 闭环维持与移动性   3.5 功率控制 · 3.6 移动性
```

**一句话理解**：RRC 状态机回答了一个根本问题——一条连接从"不存在"到"活跃传输"再到"休眠待命"，UE 和网络分别保存了什么、能做什么、被怎么找到。Phase 2 教的是"连上之后一个 slot 怎么调度"，Phase 3 从这里开始把粒度抬升到"**一段连接的完整生命周期**"。

---

## 💡 核心逻辑

### 1. 为什么连接需要"状态"？—— 一条根本权衡

让 UE 一直保持 CONNECTED 最省事（随时能收发数据），但代价是：持续盲检 PDCCH、持续上报测量、持续维护上下文——**极耗电**，且海量设备同时连接会撑爆 gNB 的上下文容量。反过来，让 UE 一直 IDLE 最省电，但每次要发数据都得从零 RRCSetup，**时延高、信令重**。

RRC 状态机就是在这条**「省电/省信令 ↔ 低时延/即时可用」**的光谱上设三个档位：

```
  省电 / 省信令                                      低时延 / 即时可用
  ◄─────────────────────────────────────────────────────────────►
   RRC_IDLE              RRC_INACTIVE              RRC_CONNECTED
   无上下文              双侧存上下文              上下文激活+DRB
   深睡+CN寻呼           近IDLE功耗+RAN寻呼        持续PDCCH盲检
   再接入: 完整建立      再接入: 仅 Resume         已就绪，直接收发
   (~4 空口往返)         (~2 空口往返)             (0)
```

**RRC_INACTIVE 是 5G 相对 LTE 的关键新增**——它取 IDLE 的低功耗与 CONNECTED 的快恢复之长，专为"频繁、突发、小数据"流量（IoT 遥测、即时通讯心跳、NTN 卫星回传）而设计。

---

### 2. 三个"状态"其实是三套：RRC / CM / RM 的对应

初学者常把"UE 的状态"当成一个东西。实际上同一时刻，UE 在**三个不同协议面**各有一个状态，必须分开看：

| 维度 | 状态 | 归属层 | 含义 | 谁维护 |
|---|---|---|---|---|
| **RRC**（接入层）| IDLE / INACTIVE / CONNECTED | AS（UE↔gNB）| 空口连接与 AS 上下文 | gNB |
| **CM**（连接管理）| CM-IDLE / CM-CONNECTED | NAS（UE↔AMF）| N2(NGAP) 信令连接是否存在 | AMF |
| **RM**（注册管理）| RM-DEREGISTERED / RM-REGISTERED | NAS（UE↔AMF）| UE 是否已在网络注册 | AMF |

三者的关键耦合关系（**这是 INACTIVE 设计的精髓**）：

```
RRC_CONNECTED  ──→  CM-CONNECTED   （N2 连接活跃）
RRC_INACTIVE   ──→  CM-CONNECTED   ★ 关键：RRC 挂起，但 N2 对 AMF 仍保持！
RRC_IDLE       ──→  CM-IDLE        （N2 释放）
```

> :::info 为什么 RRC_INACTIVE 对应 CM-CONNECTED？
> 因为 INACTIVE 的目标是"快速恢复"。如果连 N2 都释放了（变成 CM-IDLE），恢复时就要重新走 AMF 的 Service Request、重建 N2、重做安全——那和 IDLE 没区别了。INACTIVE 的做法是：**空口侧挂起省电，核心网侧连接保持**，于是 gNB 本地用存储的上下文就能把 UE 拉回 CONNECTED，无需惊动 AMF。这就是它"省 2 个往返"的根源。
> :::

---

### 3. RRC_INACTIVE 的机制：上下文存在哪、靠什么恢复

进入 INACTIVE 时（网络通过 `RRCRelease + suspendConfig` 下发），发生三件事：

1. **AS 上下文双侧存储**：UE 与 **anchor gNB**（最后服务的 gNB，又称 "last serving gNB"）各自保存完整接入层上下文（安全密钥、承载配置、能力等）。
2. **分配 I-RNTI**：网络给 UE 一个 `I-RNTI`（Inactive RNTI），作为 INACTIVE 态的身份令牌。它编码了"上下文存在哪个 anchor gNB"的信息。
3. **配置 RNA**：网络给 UE 划定一个 **RNA（RAN Notification Area，RAN 通知区）**——一组小区/TA 的集合。UE 在 RNA 内移动无需通知网络；离开 RNA 才触发 **RNAU**。

恢复（`RRCResume`）时的关键路径——**Xn 上下文取回**：

```
UE 移动到一个新 gNB（非 anchor），此时要恢复连接：

  UE ──RRCResumeRequest(resumeIdentity=I-RNTI)──► 新 gNB
                                                    │
                              新 gNB 从 I-RNTI 解析出 anchor gNB
                                                    │
              新 gNB ──Xn: RETRIEVE UE CONTEXT──► anchor gNB
                     ◄──── UE 上下文 ────────────
                                                    │
  UE ◄────────RRCResume──────────────────────── 新 gNB
              （安全密钥按 nextHopChainingCount 本地重推，
                承载从上下文恢复，无需 SecurityModeCommand / RRCReconfiguration）
```

**信令成本推导**（为什么 Resume 比 Setup 省）：

设一次"恢复数据传输"的挂钟时延为往返次数 × RTT 加固定处理：

$$
L \approx n_{\text{RT}} \cdot \text{RTT} + T_{\text{proc}}
$$

| 路径 | 空口往返 $n_{\text{RT}}$ | 组成 |
|---|:---:|---|
| IDLE → CONNECTED（Setup）| **4** | RACH(2) + SecurityMode(1) + RRCReconfig 建 DRB(1) |
| INACTIVE → CONNECTED（Resume）| **2** | RACH(2)；安全与承载由上下文恢复，省去 2 RT |
| INACTIVE + SDT（Rel-17）| **1** | 数据随 Msg3 上行，停在 INACTIVE |

于是 Resume 相对 Setup 的挂钟节省为：

$$
\Delta L = (n_{\text{Setup}} - n_{\text{Resume}}) \cdot \text{RTT} = 2 \cdot \text{RTT}
$$

地面 RTT≈1 ms 时这只省几毫秒，似乎无关紧要；但在 NTN 中 RTT 急剧放大（LEO≈10 ms，GEO≈480 ms），**节省随 RTT 线性放大**——这正是 INACTIVE/SDT 在卫星场景里价值倍增的根本原因（见仿真第 3、4 图）。

---

### 4. 三态转换：触发、过程与上下文变化

下面的交互组件把三态与六类转换串成一张可点击的图。点击**状态节点**看该态下 UE 的行为，点击**转换箭头**看触发条件、关键消息与关键 IE，或点「▶ 播放生命周期」自动走一遍。

<RRCStateMachine />

逐条转换的要点（与组件内容对应，便于检索）：

#### 4.1 IDLE → CONNECTED：`RRCSetup`（38.331 §5.3.3）

由 NAS 触发（初始接入 / 上行数据 / 被叫）。这正是 **Phase 2 RACH 的延续**——Msg3 携带的 `RRCSetupRequest` 就是进入 RRC_CONNECTED 的入口：

```
Msg3: RRCSetupRequest (CCCH)   ── ue-Identity + establishmentCause
Msg4: RRCSetup                 ── 建立 SRB1
      RRCSetupComplete (DCCH)  ── 捎带 NAS Registration/Service Request
      → SecurityModeCommand/Complete → RRCReconfiguration 建 DRB
```

#### 4.2 CONNECTED → INACTIVE：`RRCRelease + suspendConfig`（38.331 §5.3.8.3）

网络判断"业务间歇但很快会再来"时挂起。关键是 `RRCRelease` 里**带了 `suspendConfig`**（若不带就是普通释放，回 IDLE）。

#### 4.3 INACTIVE → CONNECTED：`RRCResume`（38.331 §5.3.13）

由上行数据 / RAN 寻呼 / RNAU 触发。走前述 Xn 上下文取回，省 2 个往返。

#### 4.4 → IDLE：`RRCRelease` 或回退

两条路径进 IDLE：网络主动 `RRCRelease`（不带 suspendConfig）；或 **Resume 失败回退**——anchor gNB 取回上下文失败时，新 gNB 回应 `RRCSetup`（fallback），UE 丢弃旧上下文按初始接入处理。

#### 4.5 INACTIVE → INACTIVE：`RNAU`（38.331 §5.3.13.8）

**周期触发**（`t380` 超时）或**移动触发**（离开 RNA）。UE 发 `RRCResumeRequest(resumeCause=rna-Update)`，网络更新 RNA 后通常再回 `RRCRelease+suspendConfig`，UE **继续停留 INACTIVE**。

---

### 5. 寻呼：每个状态怎么被"找到"

UE 不在 CONNECTED 时是"半睡"的，网络要找它得靠**寻呼（Paging）**。三态的寻呼机制不同：

| 状态 | 寻呼发起方 | 寻呼标识 | 寻呼范围 | 目的 |
|---|---|---|---|---|
| IDLE | **CN（AMF）** | 5G-S-TMSI | 整个 **TA List**（跨多 gNB）| 被叫 / 下行数据 |
| INACTIVE | **RAN（gNB）** | **I-RNTI** | **RNA**（更小）| 下行数据 / 触发 Resume |
| CONNECTED | —— | C-RNTI（直接调度）| 服务小区 | 无需寻呼 |

UE 并非时刻醒着听寻呼，而是按 **DRX 周期**只在特定时刻醒来。它醒来的"寻呼帧 PF / 寻呼时机 PO"由下式决定（38.304 §7.1）：

$$
(\text{SFN} + \text{PF\_offset}) \bmod T = \left(\frac{T}{N}\right)\!\left(\text{UE\_ID} \bmod N\right)
$$

$$
i_s = \left\lfloor \frac{\text{UE\_ID}}{N} \right\rfloor \bmod N_s
$$

其中 $T$ 为 DRX 周期、$N=\min(T, nB)$、$N_s=\max(1, nB/T)$、$\text{UE\_ID}=\text{5G-S-TMSI} \bmod 1024$，参数 $nB$ 来自 `PCCH-Config`。

> :::info 本课只点到为止
> PF/PO 与 DRX 的完整推导、SIB 调度体系放在 **3.6 系统消息与寻呼**深挖。这里你只需记住核心区别：**IDLE 被 CN 在大范围（TA List）寻呼，INACTIVE 被 RAN 在小范围（RNA）寻呼**——这是 INACTIVE 省信令的另一面（寻呼负荷更集中、更可控）。
> :::

---

### 6. 关键定时器（38.331 §7.1）

状态转换由一组定时器兜底，超时即回退，避免 UE"卡死"在中间态：

| 定时器 | 启动 | 停止 | 超时后果 |
|---|---|---|---|
| `t300` | 发 `RRCSetupRequest` | 收 `RRCSetup`/`RRCReject` | 回 IDLE，接入失败 |
| `t319` | 发 `RRCResumeRequest` | 收 `RRCResume` 等 | 回 IDLE，恢复失败 |
| `t380` | 进入/刷新 INACTIVE | （周期）触发 RNAU | 发起周期性 RNAU |
| `t301` | 发 `RRCReestablishmentRequest` | 收 `RRCReestablishment` | 回 IDLE |
| `t311` | 发起 RRC 重建 | 选到合适小区 | 回 IDLE |

> `t301`/`t311` 属于 **RRC 重建（Reestablishment）**——无线链路失败（RLF）后的兜底。RLF / 重建与切换是"计划外 vs 计划内"的孪生兄弟，放在 **3.6 移动性 + 无线链路维持**统一讲。

---

### 7. SDT：INACTIVE 态的"不起身"小数据（Rel-17）

Resume 还是要起身进 CONNECTED。Rel-17 更进一步：**SDT（Small Data Transmission）让 UE 停在 INACTIVE 就把小数据发出去**，连状态都不切：

- **RA-SDT**：小数据随 4-step/2-step RACH 的 Msg3/MsgA 上行（复用 Phase 2 RACH）。
- **CG-SDT**：用预配置的 Configured Grant 直接上行（连 RACH 都省）。
- 触发门限：数据量 < `sdt-DataVolumeThreshold` 且 RSRP > 门限时才走 SDT，否则正常 Resume。

效果：把"建立(9 条信令) → 传 → 释放"压成"1~3 条信令"。在突发小数据场景，累积信令负荷可降约 **2/3**（见仿真第 4 图）。这对 IoT 与 NTN 遥测是决定性的省电/省信令收益。

---

## 🔍 实战信令视角（IE / Log Analysis）

### 关键 IE 速查

```
RRCRelease（CONNECTED → INACTIVE 时携带 suspendConfig）
└── criticalExtensions → rrcRelease
    ├── redirectedCarrierInfo        （可选：重定向到其他载波/RAT）
    ├── cellReselectionPriorities    （可选：下发重选优先级）
    └── suspendConfig                ★ 有它 → INACTIVE；无它 → IDLE
        ├── fullI-RNTI (40 bit) / shortI-RNTI (24 bit)   ← INACTIVE 身份令牌
        ├── ran-PagingCycle          ← RAN 寻呼 DRX 周期
        ├── ran-NotificationAreaInfo ← RNA 定义（cellList 或 TAC list）
        ├── t380                     ← 周期 RNAU 定时器（5/10/20/30/60/120 min）
        └── nextHopChainingCount     ← 安全：Resume 时密钥链推进参数（NCC）

RRCResumeRequest（INACTIVE → CONNECTED，Msg3，CCCH）
├── resumeIdentity (ShortI-RNTI-Value, 24 bit)   ← 网络据此定位 anchor gNB
├── resumeMAC-I (16 bit)                          ← 短 MAC-I，完整性校验
└── resumeCause (mt-Access / mo-Data / mo-Signalling / rna-Update / emergency ...)
    （用 40bit fullI-RNTI 时用 RRCResumeRequest1）

RRCSetupRequest（IDLE → CONNECTED，Msg3，CCCH）
├── ue-Identity (5G-S-TMSI 截短 39bit，或随机数)
└── establishmentCause (mo-Data / mo-Signalling / mt-Access / emergency ...)
```

### Log 排障要点

- **看 `resumeCause` 区分场景**：`rna-Update` 是周期/移动登记（UE 仍要回 INACTIVE），`mo-Data` 才是真要进 CONNECTED 发数据。把两者混淆会误判"为什么 UE 反复 Resume 又被释放"。
- **`I-RNTI` 解析失败 = 找不到 anchor**：新 gNB 无法从 `resumeIdentity` 定位 anchor gNB（或 Xn 取回超时）→ 回退 `RRCSetup`。Log 表现为"发了 ResumeRequest，却收到 Setup"。
- **NCC（`nextHopChainingCount`）不一致 → `resumeMAC-I` 校验失败**：UE 与网络密钥链不同步会导致完整性校验失败，Resume 被拒。

---

## 🚨 故障排查速查表

| 故障现象 | 首先检查 | 最可能根因 |
|---|---|---|
| UE 发 `RRCResumeRequest` 却收到 `RRCSetup` | `I-RNTI` / Xn 取回 | anchor gNB 上下文取回失败 → fallback 到建立 |
| `t319` 频繁超时，恢复失败回 IDLE | `ra-ResponseWindow` / RTT | NTN 大时延下恢复窗口不足（联动 Phase 2 RACH 窗口）|
| UE 在 INACTIVE 频繁 RNAU、耗电异常 | RNA 大小 / `t380` / 小区是否地移 | RNA 太小或 moving cell 致移动 RNAU 风暴 |
| 小数据业务信令开销居高不下 | 是否启用 SDT / `sdt-DataVolumeThreshold` | 未配 SDT，每次都走完整建立+释放 |
| Resume 被拒（完整性校验失败）| `nextHopChainingCount` (NCC) | UE 与网络密钥链不同步，`resumeMAC-I` 不匹配 |
| INACTIVE UE 收不到下行数据/被叫 | RNA 配置 vs 实际位置 | UE 已离开 RNA 但未及时 RNAU，RAN 寻呼覆盖不到 |

---

## 📝 版本演进与工程自测

### 版本演进速览

| Feature | Rel-15 | Rel-16 | Rel-17 | Rel-18 |
|---|:---:|:---:|:---:|:---:|
| RRC 三态（含 INACTIVE）| ✅ | 不变 | 不变 | 不变 |
| RRCResume / suspendConfig | ✅ | 不变 | 不变 | 不变 |
| RNA / RNAU | ✅ | 增强 | 不变 | 不变 |
| **SDT（RA-SDT / CG-SDT）** | ❌ | ❌ | ✅ | 增强 |
| MT-SDT（下行触发 SDT）| ❌ | ❌ | ❌ | ✅ |
| NTN INACTIVE / 时延适配 | ❌ | ❌ | ✅ 38.821 | 增强 |
| NPN / 切片感知接入控制 | ❌ | ✅ | 增强 | 增强 |

---

### 面试级自测题

**Q1 · 概念题（高频）**

> RRC_INACTIVE 对应核心网的 CM-CONNECTED 还是 CM-IDLE？为什么这个对应关系是 INACTIVE "省信令"的关键？如果让 INACTIVE 对应 CM-IDLE，会失去什么？

:::details 💡 展开答案

**对应 CM-CONNECTED。**

INACTIVE 的设计目标是"快速恢复且不惊动核心网"。RRC 在空口侧挂起省电，但 **N2(NGAP) 连接对 AMF 保持**，UE 上下文保留在 anchor gNB。于是恢复时，新 gNB 只需经 **Xn** 向 anchor gNB 取回上下文、本地重推安全密钥，就能把 UE 拉回 CONNECTED——**全程不涉及 AMF**。

**若改为对应 CM-IDLE**：N2 已释放，恢复时必须重新经 AMF 走 Service Request、重建 N2 上下文、重做 NAS 安全——这跟从 IDLE 完整建立没有本质区别，INACTIVE "省 2 个往返"的收益荡然无存。换句话说，**"RRC 挂起、CN 连接保持"这对不对称，正是 INACTIVE 存在的全部意义。**

参考：38.300 §9.2.2，38.413（NGAP）。
:::

**Q2 · 计算题（NTN 工程）**

> 某 NTN 网络 μ=1（slot=0.5 ms）。模型：完整建立需 4 个空口往返，INACTIVE 恢复需 2 个，SDT 需 1 个；单程处理时延忽略。
>
> (a) GEO 卫星单程传播时延约 239 ms。分别估算"完整建立"与"SDT"的挂钟时延。
> (b) 相对完整建立，SDT 节省多少挂钟时间？这个节省与 RTT 是什么关系？
> (c) 同样的过程在地面（单程 0.5 ms）下，建立与 SDT 的挂钟时延各是多少？从 (a)(c) 对比，说明"INACTIVE/SDT 在 NTN 价值倍增"的定量原因。

:::details 💡 展开答案

记 $\text{RTT}=2\times$ 单程，挂钟 $L \approx n_{\text{RT}}\cdot\text{RTT}$。

**(a)** GEO：$\text{RTT}=2\times239=478$ ms。
- 完整建立：$L=4\times478=\mathbf{1912\ ms}\approx 1.9\ s$
- SDT：$L=1\times478=\mathbf{478\ ms}$

**(b)** 节省 $\Delta L=(4-1)\times478=3\times478=\mathbf{1434\ ms}\approx 1.4\ s$。
节省 $\Delta L=(n_{\text{建立}}-n_{\text{SDT}})\cdot\text{RTT}$，**与 RTT 成正比**——RTT 越大，省得越多。

**(c)** 地面：$\text{RTT}=2\times0.5=1$ ms。
- 完整建立：$L=4\times1=\mathbf{4\ ms}$
- SDT：$L=1\times1=\mathbf{1\ ms}$，节省仅 3 ms。

**定量结论**：信令往返数之差（这里是 3）是固定的，但**每个往返的代价 = RTT**。地面 RTT≈1 ms，省 3 个往返≈3 ms，可忽略；GEO RTT≈478 ms，同样省 3 个往返≈1.4 s，对用户体验是天壤之别。因此"减少空口往返"这件事在 NTN 的边际价值被 RTT **放大了数百倍**——这就是 INACTIVE/SDT 在卫星场景从"优化项"变成"刚需"的根本原因。

参考：仿真 `output_rrc_latency_ntn.png`；TR 38.821 §7。
:::

**Q3 · 排障题（综合）**

> 现场：一台 NTN（LEO）IoT 终端配置为 INACTIVE + 周期遥测。运维发现它**频繁在 INACTIVE 与短暂 CONNECTED 之间抖动**，且电池消耗远超预期。抓包显示大量 `RRCResumeRequest`，其 `resumeCause` 多为 `rna-Update`，而非 `mo-Data`。请给出最可能的两个根因及对应检查项。

:::details 💡 展开答案

关键线索：`resumeCause=rna-Update` 占多数——说明抖动主要不是"发数据"，而是**位置登记（RNAU）**。

**根因 1：moving cell / 地移波束导致移动 RNAU 风暴**
LEO 卫星以 ~7.5 km/s 掠过，若采用地移波束（earth-moving beam），小区在地面上快速扫过，**静止的 IoT 终端会被不断"切"出当前 RNA**，从而频繁触发移动 RNAU。每次 RNAU 都要 Resume 起身→更新→再挂起，既耗电又抖动。
- 检查项：小区是否为 earth-moving 还是 quasi-earth-fixed（SIB19 `ntn-Config` 的小区类型）；RNA 的地理覆盖是否与卫星波束移动匹配；考虑加大 RNA 或改用地固定波束映射。

**根因 2：`t380` 过短 → 周期性 RNAU 过密**
若 `t380`（周期 RNAU 定时器）配得过小，即使终端不动也会高频周期登记。
- 检查项：`suspendConfig.t380` 取值是否与遥测间隔/移动性匹配；对低频遥测应取较大 `t380`（如 60/120 min）。

**附加建议**：确认是否启用 **CG-SDT**——让真正的遥测数据停在 INACTIVE 用 Configured Grant 直发，避免为发几十字节而起身进 CONNECTED，进一步压低抖动与功耗。

参考：38.331 §5.3.13.8（RNAU）；TR 38.821 §7（NTN 移动性与 moving cell）；38.300 §16.7（SDT）。
:::

---

## 参考资料

- **3GPP TS 38.331 v15.x** — RRC 协议；状态定义（§4.2.1）、建立（§5.3.3）、释放/挂起（§5.3.8）、恢复/RNAU（§5.3.13）、定时器（§7.1）
- **3GPP TS 38.300 v15.x / v17.x** — NR 总体描述；RRC 状态与转换（§9.2.2）、SDT（§16.7）
- **3GPP TS 38.304 v15.x** — IDLE/INACTIVE 下 UE 过程；寻呼 PF/PO 计算（§7.1）
- **3GPP TS 38.321 v17.x** — MAC 协议；SDT 流程（§5.30）
- **3GPP TR 38.821 v17.x** — NTN 解决方案；连接管理与时延、moving cell（§7）
- ShareTechnote — [RRC State](https://www.sharetechnote.com/html/5G/5G_RRC_StateTransition.html)
