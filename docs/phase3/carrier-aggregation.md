# 5G NR 载波聚合：CA

> **3GPP 版本定锚**
>
> | 内容 | 版本 | 规范 |
> |---|---|---|
> | 载波聚合（PCell/SCell，≤16 CC）| **Rel-15** | 38.300 §9.2.4，38.331 SCellConfig |
> | UE 峰值速率公式（按 CC 求和）| **Rel-15** | 38.306 §4.1.2 |
> | SCell 激活/去激活 MAC CE | **Rel-15** | 38.321 §6.1.3.10 |
> | 跨载波调度（CIF）| **Rel-15** | 38.331 crossCarrierSchedulingConfig，38.212（DCI）|
> | TAG（pTAG/sTAG 定时）| **Rel-15** | 38.321 §5.2 |
> | **SCell 休眠态（Dormancy）** | **Rel-16** | 38.321，38.213 §10/§17 |
> | **SCell→PCell 跨载波调度** | **Rel-16** | 38.213 |
> | SCell 激活时延要求 | **Rel-15/16** | 38.133 |
> | NTN 差分时延 / TAG 与 CA | **Rel-17** | TR 38.821 §7 |

---

## 📡 知识定位

```
Phase 3 · 连接管理与移动性
│
├── 模块一 · 控制面与 Idle 世界   3.1 RRC ✅ · 3.2 SIB/Paging ✅
│
├── 模块二 · 容量扩展
│   ├── ▶ 3.3 载波聚合 CA          ← 我们在这里（单节点·单 MAC·理想回传）
│   │     核心问题：一条载波带宽不够用，如何拼出更大带宽？
│   │     复用 Phase 1 BWP（每 CC 独立 BWP）+ Phase 2 DCI（CIF 跨载波调度）
│   └── 3.4 双连接 DC（多节点·双 MAC·非理想回传）← 与 CA 做对照
│
└── 模块三 · 闭环维持与移动性   3.5 功率控制 · 3.6 移动性
```

**一句话理解**：单块载波的带宽有上限（FR1 每 CC 最多 100MHz，FR2 每 CC 最多 400MHz）。**载波聚合（CA）把多块载波（Component Carrier，CC）在 PHY/MAC 层"拼"成一条更宽的逻辑管道**，吞吐随 CC 数线性叠加。关键前提：所有 CC 由**同一节点、同一个 MAC 调度器**统一管理（理想回传）——这正是它与下一课双连接（DC）的分水岭。

---

## 💡 核心逻辑

### 1. CA 是什么：把多块频谱拼成一条管道

NR 最多聚合 **16 个 CC**（LTE 仅 5 个），聚合带宽 = 各 CC 带宽之和。从 UE 视角，它同时连着多个"服务小区"（serving cell），但：

- **只有一条 RRC 连接**（在 PCell 上）；
- **只有一个 MAC 实体 / 一个调度器**统一调度所有 CC。

这个"**单 MAC**"是 CA 的本质特征。因为单 MAC 要在一个调度周期内协调所有 CC，要求这些 CC 在物理上**共址（co-located）、回传理想（ideal backhaul，时延近零）**。对比之下，DC 用两个 MAC、容忍非理想回传——这是 3.4 的核心区别，本课先埋下。

### 2. PCell / SCell / SpCell：角色分工

| 角色 | 全称 | 职责 | 能否去激活 |
|---|---|---|---|
| **PCell** | Primary Cell | 初始接入 / RRC 连接所在；承载 **PUCCH**、做 **RLM**（无线链路监测）、安全、移动性锚点 | ❌ 恒在 |
| **SCell** | Secondary Cell | 纯增吞吐；RRC 添加，**MAC CE 激活/去激活** | ✅ 可激活/去激活/休眠 |
| **SpCell** | Special Cell | = PCell（CA 场景）或 PSCell（DC 场景）；带 PUCCH+RLM 的"主心骨" | ❌ |

- **服务小区 = PCell + 所有 SCell**。
- **PUCCH SCell（次 PUCCH 组）**：大规模 CA 下，可指定某个 SCell 也承载 PUCCH，把 UCI（HARQ-ACK/CSI）反馈从 PCell 分流——形成"主 PUCCH 组（PCell）+ 次 PUCCH 组（PUCCH SCell）"。

### 3. 聚合频谱的三种类型

| 类型 | 描述 | 特点 |
|---|---|---|
| **带内连续** Intra-band Contiguous | 同频段、CC 紧邻 | 最简单，可用单宽 RF 链路 |
| **带内非连续** Intra-band Non-contiguous | 同频段、CC 间有间隙 | 间隙处可能被他用占用 |
| **带间** Inter-band | 跨不同频段（如 FR1+FR2）| 需多 RF 链路；**低频覆盖 + 高频容量**互补 |

仿真第 2 图把三类型的 CC 频域排布画了出来。带间 CA（如 n78 + n258）是"覆盖与容量兼得"的典型组合：低频 PCell 保连接稳定，高频 SCell 冲峰值速率。

### 4. 吞吐如何随 CC 扩展：峰值速率公式（38.306 §4.1.2）

CA 的核心收益由这条公式精确刻画——**峰值速率是各 CC 速率之和**：

$$
\text{Rate (Mbps)} = 10^{-6} \cdot \sum_{j=1}^{J} \left( v^{(j)}_{\text{Layers}} \cdot Q^{(j)}_m \cdot f^{(j)} \cdot R_{\max} \cdot \frac{N^{\text{BW}(j),\mu}_{\text{PRB}} \cdot 12}{T^{\mu}_s} \cdot \left(1 - \text{OH}^{(j)}\right) \right)
$$

逐项含义：

| 符号 | 含义 | 典型值 |
|---|---|---|
| $J$ | 聚合的 CC 数 | ≤ maxNrofServingCells（16）|
| $v_{\text{Layers}}$ | MIMO 层数 | 1/2/4/… |
| $Q_m$ | 调制阶数 | 256QAM → 8 |
| $f$ | 缩放因子 | {1, 0.8, 0.75, 0.4} |
| $R_{\max}$ | 最大码率 | 948/1024 ≈ 0.926 |
| $N_{\text{PRB}}^{\text{BW},\mu}$ | 该带宽与 numerology 下 PRB 数 | 100MHz@30kHz → 273 |
| $T_s^{\mu}$ | 平均符号时长 | $10^{-3}/(14\cdot 2^\mu)$ |
| $\text{OH}$ | 开销 | FR1 DL 0.14 / FR2 DL 0.18 |

**关键洞察**：求和号 $\sum_{j}$ 就是 CA 的全部意义——每加一个 CC，吞吐**线性叠加**一份（仿真第 1 图：FR1 100MHz/CC × 8 CC ≈ 18.7 Gbps）。下面的配置器把这条公式做成可交互的——调 CC 数、带宽、层数、调制，看峰值速率实时变化；切换 SCell 状态，看休眠/去激活的 CC 如何**不再贡献速率**：

<CarrierAggregationCalc />

### 5. SCell 的生命周期：添加 / 激活 / 去激活 / 休眠

一个 SCell 不是"配了就一直全速跑"——它有一套状态机来平衡吞吐与功耗：

```
                RRCReconfiguration
   (未配置) ──── sCellToAddModList ────► [去激活]  初始：已配置但不工作
                                            │
                          SCell Activation MAC CE（位图 Ci=1）
                                            │ （冷启需取 CSI，~30ms）
                                            ▼
        sCellDeactivationTimer 超时 ◄──── [激活]   全速：盲检PDCCH+CSI+收发数据
        或 Deactivation MAC CE              ▲ │
                                            │ │ Dormancy 指示 (Rel-16)
                                  DCI 唤醒   │ ▼
                                          [休眠]   维持CSI、不监听PDCCH（功耗居中、激活极快~3ms）
```

- **添加**：`RRCReconfiguration` 的 `sCellToAddModList`（每个 `SCellConfig` 含 `sCellIndex`、公共配置、BWP），初始为**去激活**。
- **激活/去激活**：**SCell Activation/Deactivation MAC CE**（38.321，位图每位对应一个 `SCellIndex`）。激活后 UE 才开始在该 SCell 盲检 PDCCH、测 CSI、收发数据。
- **自动去激活**：`sCellDeactivationTimer` 超时（一段时间无调度）→ 自动去激活省电。
- **休眠态（Rel-16）**：SCell 进入"休眠 BWP"——**维持 CSI 测量上报，但不监听 PDCCH**。它在"去激活（省电但慢）"与"激活（快但耗电）"之间架了一座桥：CSI 已新鲜，唤醒只需 ~3ms（vs 冷启 ~30ms，仿真第 3 图）。

### 6. 跨载波调度：CIF（衔接 Phase 2 DCI）

PDCCH 默认**自调度**（CC-n 的 PDCCH 调度 CC-n 的数据）。但也可**跨载波调度**：

```
自调度：  CC1 的 PDCCH ──► CC1 的 PDSCH
跨载波：  CC1 的 PDCCH ──► CC2 的 PDSCH    （DCI 里的 CIF 指明"被调度的是 CC2"）
```

- 配置：`crossCarrierSchedulingConfig`。
- DCI 携带 **CIF（Carrier Indicator Field，3 bit）**——这正是 Phase 2 学 DCI 时见过的字段，标识被调度的 CC。
- 用途：把 PDCCH 从干扰重的 CC 卸到干净的 CC；在 PCell 上集中调度；处理不同 numerology 的 CC。
- **Rel-16 增强**：SCell 的 PDCCH 可反向调度 PCell（SCell→PCell），缓解 PCell 的 PDCCH 容量压力。

### 7. 定时与 TAG（pTAG / sTAG）

不同 CC 可能需要不同的**时间提前（TA）**——尤其带间 CA，传播路径不同。NR 把 CC 按定时分组：

- **pTAG（Primary TAG）**：含 PCell。
- **sTAG（Secondary TAG）**：含定时不同的 SCell。
- **同一 TAG 内的所有 CC 共享一个 TA 值/命令**——前提是它们的定时足够接近（在 TA 调整粒度/CP 量级内）。

带内连续 CA 通常单 TAG 即可（定时几乎一致）；带间可能需要 sTAG。**这是 NTN CA 的命门**——见 Part C。

### 8. CA vs DC：一张表预告 3.4

| 维度 | **CA（本课）** | **DC（下一课）** |
|---|---|---|
| MAC 实体 | **1 个**（单调度器）| **2 个**（MN + SN 各一）|
| 节点 | 同一 gNB（共址）| 两个节点（MN + SN）|
| 回传要求 | **理想**（时延近零）| **可非理想**（X2/Xn）|
| 主小区 | PCell | PCell（MCG）+ PSCell（SCG）|
| 典型目的 | 提吞吐 | 提吞吐 + 提可靠/分流（NSA 组网）|

记住这条主线：**CA 是"同节点单调度器"，DC 是"跨节点双调度器"**。

---

## Part C · NTN 特殊性

### 9. NTN 差分时延与 CA（38.821 §7）

地面 CA 的各 CC 来自**同一基站、同一塔**，传播路径几乎一致 → 定时差 ≈ 0 → **单 TAG 即可**。

NTN 则完全不同。若两个 CC 来自**不同卫星 / 不同波束 / 不同仰角**，它们的斜距差异巨大，差分单程时延可达数百 μs 到毫秒级：

$$
\Delta\tau = \frac{|d_1 - d_2|}{c}
$$

仿真第 4 图：CC1 在天顶（90°，斜距 = 高度 550km），CC2 在 30° 仰角时斜距约 993km，差分时延 ≈ **1477 μs** ——而普通 CP 仅 ~4.7μs，差了约 **300 倍**。单个 TAG 的 TA 根本无法同时对齐两个 CC，**必须分置不同 sTAG**；即便如此，卫星高速运动下的定时维护也极困难。

因此：
- **Rel-17 NTN 不优先支持 CA**，以单载波运行为主。
- 若 CC 来自**同一卫星/同一波束（同一路径）**，差分 ≈ 0 → 星内 CA 可行。
- 馈电链路（feeder link）的多路聚合是**网关侧**的事，与 UE 侧 CA 是两回事。

> :::info 一条贯穿主线
> Part C 的 `TAG / 差分时延` 与 Phase 2 RACH 的"NTN 大时延 TA 预补偿"、3.2 SIB19 的 `ta-Common` 是同一物理问题的不同切面：**NTN 的核心矛盾始终是"如何在巨大且动态的时延下维持定时同步"**。CA 在这里撞上的，正是这堵墙。
> :::

---

## 🔍 实战信令视角（IE / Log Analysis）

### 关键 IE 速查

```
RRCReconfiguration（添加 SCell）
└── secondaryCellGroup / masterCellGroup → sCellToAddModList[]
    └── SCellConfig
        ├── sCellIndex (1..31)
        ├── sCellState (Rel-16: activated / dormant 初始态，可选)
        ├── servingCellConfigCommon   ← 该 SCell 的公共物理配置
        └── servingCellConfig
            ├── crossCarrierSchedulingConfig (own / other)  ← 跨载波调度
            ├── downlinkBWP-ToAddModList / uplinkBWP-...     ← 每 CC 独立 BWP（Phase 1）
            └── firstActiveDownlinkBWP-Id

SCell Activation/Deactivation MAC CE（38.321 §6.1.3.10）
└── 位图 C1..C7（或扩展）：每位对应一个 SCellIndex，1=激活 / 0=去激活

DCI（跨载波调度，38.212）
└── Carrier Indicator Field (CIF, 3 bit)  ← 指明被调度的 CC（自调度时无此域）

TAG（38.331 tag-Config）
├── pTAG (tag-Id=0，含 PCell)
└── sTAG (tag-Id≠0) → timeAlignmentTimer  ← 该组 TA 有效定时器
```

### Log 排障要点

- **SCell 配了但没速率**：先看它是否被**激活**——`SCell Activation MAC CE` 是否下发、`sCellDeactivationTimer` 是否过期把它自动去激活了。配置 ≠ 激活。
- **峰值速率上不去**：用峰值公式逐 CC 核对——是不是某个 CC 处于休眠/去激活（不贡献速率），或层数/调制没达到预期（CSI 不佳导致降阶）。
- **跨载波调度找不到 PDCCH**：确认 `crossCarrierSchedulingConfig` 与 DCI 的 **CIF** 一致；自调度与跨载波调度的 DCI 大小/搜索空间不同。

---

## 🚨 故障排查速查表

| 故障现象 | 首先检查 | 最可能根因 |
|---|---|---|
| SCell 配置成功但无吞吐 | SCell 激活状态 | 未发激活 MAC CE，或被 `sCellDeactivationTimer` 自动去激活 |
| 聚合峰值速率远低于预期 | 逐 CC 的层数/调制/激活态 | CSI 差导致降阶；或部分 CC 休眠/去激活不贡献 |
| SCell 激活后好几十 ms 才有数据 | 是否冷启（去激活→激活）| 需获取 CSI；改用休眠态可降到 ~3ms |
| 跨载波调度失败 | CIF / crossCarrierSchedulingConfig | 调度 CC 与被调度 CC 配置不一致 |
| 带间 CA 上行 TA 报错 | TAG 配置 / timeAlignmentTimer | SCell 定时与 PCell 差异大却放在同一 TAG |
| NTN 多星 CA 无法对齐 | 差分时延 vs CP / TAG | CC 来自不同卫星/仰角，差分远超单 TAG 容差 |

---

## 📝 版本演进与工程自测

### 版本演进速览

| Feature | Rel-15 | Rel-16 | Rel-17 |
|---|:---:|:---:|:---:|
| CA（≤16 CC，PCell/SCell）| ✅ | 不变 | 不变 |
| 峰值速率公式 | ✅ | 不变 | 不变 |
| SCell 激活/去激活 MAC CE | ✅ | 不变 | 不变 |
| 跨载波调度 CIF | ✅ | +SCell→PCell | 不变 |
| **SCell 休眠态 Dormancy** | ❌ | ✅ | 不变 |
| 直接 SCell 激活（更快）| ❌ | ✅ | 增强 |
| NTN CA | ❌ | ❌ | 不优先（单载波为主）|

---

### 面试级自测题

**Q1 · 概念题（高频，承接 3.4）**

> CA 与 DC 在 MAC/调度层面的根本区别是什么？为什么 CA 要求各 CC 共址、回传理想，而 DC 能容忍非理想回传？

:::details 💡 展开答案

**根本区别：MAC 实体数量。**
- **CA：单个 MAC 实体 / 单调度器**统一调度所有 CC。
- **DC：两个 MAC 实体**（MN 的 MCG MAC + SN 的 SCG MAC），各自独立调度。

**为什么 CA 要理想回传/共址**：单 MAC 要在**一个调度周期内**（亚毫秒级）协调所有 CC 的资源分配、HARQ、定时。如果 CC 分布在不同节点、回传有几十毫秒时延，单调度器无法及时拿到各 CC 的瞬时信道/缓冲状态、也无法及时下发统一调度决策——调度闭环会被回传时延打破。因此 CA 的 CC 必须**共址、回传近零时延**。

**为什么 DC 能容忍非理想回传**：DC 把调度**解耦**成两个独立的 MAC——MN 和 SN 各自在本地做自己的调度闭环，彼此只需在**承载层（PDCP）**做较慢的数据分流协调（X2/Xn 接口）。本地调度不依赖跨节点的实时信息，所以回传可以是几十毫秒的非理想链路。这正是 DC 适合"宏站 + 微站"或早期 NSA（4G 核心 + 5G NR）部署的原因。

一句话：**CA 在 MAC 层耦合（要实时），DC 在 PDCP 层耦合（可放松）**。

参考：38.300 §9.2.4，37.340。
:::

**Q2 · 计算题（峰值速率，必考）**

> 某 UE 聚合 4 个 FR1 CC，均为 100MHz @ μ=1（$N_{\text{PRB}}=273$），$f=1$，$R_{\max}=948/1024$，FR1 DL 开销 $\text{OH}=0.14$。其中 CC1、CC2 为 4 层 256QAM，CC3、CC4 为 2 层 256QAM。
> (a) 求单个 4 层 256QAM CC 的峰值速率；
> (b) 求 4 CC 全激活时的聚合峰值速率；
> (c) 若 CC4 被去激活，聚合峰值速率变为多少？

:::details 💡 展开答案

先算符号时长：$T_s^\mu = \dfrac{10^{-3}}{14\cdot 2^1} = 3.571\times10^{-5}$ s。
子载波速率项：$\dfrac{N_{\text{PRB}}\cdot 12}{T_s^\mu} = \dfrac{273\times12}{3.571\times10^{-5}} \approx 9.173\times10^{7}$。

**(a)** 4 层 256QAM 单 CC：
$$
4 \times 8 \times 1 \times \tfrac{948}{1024} \times 9.173\times10^{7} \times (1-0.14) \approx 2.34\times10^{9}\ \text{bps} = \mathbf{2.34\ Gbps}
$$
2 层版本即一半：$\approx 1.17$ Gbps。

**(b)** 4 CC 全激活：
$$
\underbrace{2.34\times2}_{\text{CC1,2 (4 层)}} + \underbrace{1.17\times2}_{\text{CC3,4 (2 层)}} = 4.68 + 2.34 = \mathbf{7.02\ Gbps}
$$

**(c)** CC4（2 层，1.17 Gbps）去激活后，它**不再贡献速率**：
$$
7.02 - 1.17 = \mathbf{5.85\ Gbps}
$$

**要点**：聚合速率是**各激活 CC 速率之和**；去激活（或休眠）的 CC 贡献为 0。可用本课配置器设 4 CC、混合层数验证。

参考：38.306 §4.1.2。
:::

**Q3 · NTN 设计题（差分时延）**

> 某 LEO（高度 550km）NTN 场景，运营商想把两个 CC 聚合给 UE：CC1 来自天顶卫星（仰角 90°），CC2 来自仰角 30° 的另一颗卫星。球面斜距公式 $d=\sqrt{(R_e\sin\theta)^2+2R_e h+h^2}-R_e\sin\theta$，$R_e=6371$km。
> (a) 求两 CC 的斜距与差分单程时延；
> (b) 普通 CP 约 4.7μs，判断这两个 CC 能否放在同一个 TAG，说明理由；
> (c) 给出工程上的处理方式，并解释为什么 Rel-17 NTN 不优先支持 CA。

:::details 💡 展开答案

**(a)** 斜距：
- CC1（90°）：$d_1 = \sqrt{(R_e)^2+2R_e h+h^2}-R_e = (R_e+h)-R_e = h = \mathbf{550}$ km。
- CC2（30°，$\sin30°=0.5$）：
  $d_2=\sqrt{(6371\times0.5)^2+2\times6371\times550+550^2}-6371\times0.5$
  $=\sqrt{3185.5^2+7.008\times10^6+302500}-3185.5 \approx 4178-3185.5 \approx \mathbf{993}$ km。
- 差分单程时延：$\Delta\tau = \dfrac{|993-550|}{299792\,\text{km/s}} = \dfrac{443}{299792}\approx 1.48\times10^{-3}$ s $= \mathbf{1477\ \mu s}$。

**(b)** **不能放同一 TAG。** 同一 TAG 的所有 CC 共享一个 TA 值，要求它们定时差在 TA 调整粒度/CP 量级内（~4.7μs）。这里差分 1477μs ≈ **314× CP**，单一 TA 根本无法同时对齐两个 CC，符号定时会严重错位。

**(c)** 工程处理：
- 至少把两 CC 分置不同 **sTAG**，各自维护独立 TA。但 LEO 高速运动使每个 sTAG 的 TA 都要高频更新，定时维护开销与复杂度极高。
- 更现实的是**避免跨卫星 CA**；若要 CA，让 CC 来自**同一卫星/同一波束**（同路径，差分≈0）。

**为什么 Rel-17 NTN 不优先 CA**：NTN 的核心矛盾是"在巨大且动态的时延下维持定时同步"。CA 叠加了"多 CC 定时同时对齐"的要求，在跨卫星/跨波束场景下几乎不可行；其收益（峰值吞吐）对 NTN 典型业务（IoT、语音、中低速）也非刚需。因此 Rel-17 以**单载波运行**为主，把有限的标准化精力投到更关键的定时/移动性问题上。

参考：TR 38.821 §7；38.321 §5.2（TAG）。
:::

---

## 参考资料

- **3GPP TS 38.300 v15.x / v17.x** — NR 总体：载波聚合（§9.2.4）
- **3GPP TS 38.306 v15.x** — UE 能力：峰值数据率公式（§4.1.2）
- **3GPP TS 38.321 v15.x / v16.x** — MAC：SCell 激活/去激活 MAC CE（§6.1.3.10）、TAG（§5.2）、休眠
- **3GPP TS 38.213 v16.x** — SCell 休眠 / SCell→PCell 跨载波调度
- **3GPP TS 38.133** — RRM：SCell 激活时延要求
- **3GPP TR 38.821 v17.x** — NTN：差分时延、TAG 与 CA 的挑战（§7）
- ShareTechnote — [Carrier Aggregation](https://www.sharetechnote.com/html/5G/5G_CA.html)
