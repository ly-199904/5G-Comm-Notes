# 5G NR HARQ 混合自动重传

> **3GPP 版本定锚**
>
> | 内容 | 版本 | 规范 |
> |---|---|---|
> | HARQ 基础（进程数、RV、异步机制）| **Rel-15** | 38.212 §5.4, 38.321 §5.3 |
> | HARQ-ACK Codebook 构造 | **Rel-15** | 38.213 §9.1 |
> | CBG（Code Block Group）重传 | **Rel-15** | 38.321 §5.3.3 |
> | HARQ 增强（多 TRP 合并）| **Rel-16** | 38.321 §5.3 |
> | NTN HARQ 取舍（K-offset, HARQ 禁用）| **Rel-17** | 38.821 §6.3 |

---

## 📡 知识定位

```
Phase 2 骨架层
│
├── ✅ RACH 随机接入
├── ✅ PDCCH & DCI 调度机制   ← HARQ 的"指挥层"
│
├── ▶ HARQ 混合自动重传        ← 我们在这里
│     核心问题：数据传错了，谁发现？怎么重传？
│               多次重传的数据如何叠加？效率如何保证？
│
├── ⬜ MIMO & Beamforming
├── ⬜ CSI 框架
└── ⬜ Beam Management
```

**一句话理解**：HARQ 是物理层的"保险绳"——它把 FEC（纠错码）和 ARQ（重传请求）缝合在一起，让每次重传都不是"重新发"，而是"补充新的冗余视角"，多次叠加后联合解码，性能随重传次数单调递增。

---

## 💡 核心逻辑

### 1. 为什么需要 HARQ？——FEC 与 ARQ 的局限

```
纯 FEC（Forward Error Correction）：
  预先加入冗余比特，接收端自行纠错
  优点：无需反馈，时延低
  缺点：码率固定，信道变差时 FEC 能力不够 → 无法兜底

纯 ARQ（Automatic Repeat reQuest）：
  检测到错误 → 请求重传 → 重新发送全部比特
  优点：可靠性高（理论上无限次重传）
  缺点：重传效率低（相同比特重发一遍，无编码增益）

HARQ = FEC + ARQ 的混合：
  → 每次传输都带 FEC 冗余
  → 解码失败时：请求重传，但重传内容不重复，而是提供"新的冗余视角"
  → 接收端将所有收到的版本合并后联合解码（软合并）
  → 解码成功概率随重传次数单调上升
```

**信息论意义**：每次重传等效于在解码矩阵中增加一行新方程，逐渐逼近满秩，使原本无解的欠定系统变得可解。

---

### 2. LDPC 圆形缓冲区与冗余版本（RV）

**参考：38.212 §5.4.2.1**

LDPC 编码后，所有比特被填入一个**圆形缓冲区（Circular Buffer）**。速率匹配从缓冲区的某个起点开始，连续取出 E 个比特发送。**起点位置**由冗余版本（RV）决定：

$$
k_0 = \begin{cases}
0 & \text{RV}=0 \\
\lfloor 17N_{\text{cb}}/66 \rfloor & \text{RV}=1 \\
\lfloor 33N_{\text{cb}}/66 \rfloor & \text{RV}=2 \\
\lfloor 56N_{\text{cb}}/66 \rfloor & \text{RV}=3
\end{cases}
$$

其中 $N_{\text{cb}}$ 是圆形缓冲区大小（限幅后的编码比特总数）。

```
圆形缓冲区示意图（BG1 示例）：

位置：  0    k₀(RV1) k₀(RV2)   k₀(RV3)   N_cb
        ↓       ↓       ↓          ↓        ↓
        ├──────────────────────────────────────┐
        │ 系统位 │   校验位 1   │   校验位 2  │
        └──────────────────────────────────────┘
             ↑
        RV=0 从此开始（包含最多系统位，最有信息量）

每次传输：从 k₀ 开始，绕圈取 E 个比特
接收端：将不同 RV 覆盖的比特段叠加（软合并）
```

**关键特性**：

- **RV=0**：从 0 开始，包含全部系统位，即使单次传输也能携带最多有用信息
- **RV=2**：从约 1/2 处开始，覆盖更多校验位 1
- **RV=3**：从约 5/6 处开始，大量校验位 2
- **RV=1**：从约 1/4 处开始，与 RV=0 重叠少，补充系统位末段与校验位

标准 RV 序列：$0 \rightarrow 2 \rightarrow 3 \rightarrow 1$（每次重传最大化新信息量）

---

### 3. CC vs IR：两种软合并策略

#### 3.1 Chase Combining（追踪合并，CC）

每次重传发送**相同的 RV=0**（相同比特序列）。接收端将多次收到的 LLR 直接相加：

$$
\text{LLR}_{\text{合并}}[i] = \sum_{t=1}^{T} \text{LLR}_{t}[i]
$$

**等效 SNR 增益**：T 次合并后，SNR 提升 $10\log_{10}(T)$ dB（相当于时间分集）。

**优点**：实现简单。**缺点**：每次重传没有新信息，编码增益有限。

#### 3.2 Incremental Redundancy（增量冗余，IR）

每次重传发送**不同的 RV**，接收端在圆形缓冲区维度上对齐合并：

$$
\text{合并后的缓冲区}[k] = \bigoplus_{t: k \in \text{window}(t)} \text{LLR}_t[k]
$$

每次重传等效于在解码矩阵中增加新行，使系统方程组逐渐趋向满秩。4次传输后缓冲区覆盖率接近 100%，等效极低码率。

<CircularBufferVisualizer />

#### 3.3 性能对比

| 维度 | Chase Combining（CC）| Incremental Redundancy（IR）|
|---|---|---|
| **每次重传内容** | 相同 RV=0 | 不同 RV（0→2→3→1）|
| **软缓冲区需求** | 小（只需存一份 LLR）| 大（需存完整圆形缓冲区）|
| **SNR 增益/次** | 约 3dB | > 3dB（码率等效降低）|
| **3次合并后 BLER** | 显著改善 | 大幅改善（再降 1~2 个数量级）|
| **5G NR 标准选择** | 可选（NTN 等场景）| **默认（地面网络）**|

> **NTN 视角**：在 RTT 极长的 NTN 场景中，若 HARQ 被禁用，CC 与 IR 的比较失去意义——只能依靠 RLC ARQ 在更高层做重传。

---

### 4. HARQ 进程轮转：并发流水线

#### 4.1 为什么需要多个进程？

单进程 HARQ 存在严重的**等待空洞**：

```
单进程时序（μ=1，K1=4）：

slot:  0    1    2    3    4    5    6    7    8 ...
gNB→:  TX₀  ──   ──   ──   ──   TX₁  ──   ──   ──
UE→:   ──   ──   ──   ──   ACK₀ ──   ──   ──   ACK₁
           ↑──── 等待 HARQ-ACK 4 slots ────↑

gNB 在等待 ACK 期间无法调度新数据 → 信道利用率 = 1/(K1+1) ≈ 20%（K1=4时）
```

多个并发进程填满等待空洞：

```
多进程时序（4进程，μ=1，K1=4）：

slot:  0    1    2    3    4    5    6    7
proc#0: TX₀  ──   ──   ──   ACK₀ ...
proc#1: ──   TX₁  ──   ──   ──   ACK₁ ...
proc#2: ──   ──   TX₂  ──   ──   ──   ACK₂ ...
proc#3: ──   ──   ──   TX₃  ──   ──   ──   ACK₃ ...

gNB 每个 slot 都有数据发送 → 信道利用率接近 100%
```

<HARQProcessVisualizer />

#### 4.2 进程数量的理论最小值

$$
N_{\text{proc}}^{\min} = K_1 + 1
$$

**NTN 中的极端情况**（μ=1，550km LEO，θ=45°）：

$$K_1^{\text{NTN}} = K_1^{\text{base}} + K_{\text{offset}} \approx 4 + 25 = 29 \text{ slots}$$

$$N_{\text{proc}}^{\min, \text{NTN}} = 30 > 16 \text{（协议上限）}$$

**这就是 NTN HARQ 的根本矛盾**：大时延需要的进程数超过了协议上限。

#### 4.3 NDI（New Data Indicator）：进程重用的"开关"

```
NDI 翻转 → 新传（UE 清空该进程的软缓冲区，开始新的 TB）
NDI 不变 → 重传（UE 将新收到的 LLR 与缓冲区中已有内容合并）
```

> ⚠️ **排障陷阱**：若 gNB/UE NDI 不同步，UE 会将新 TB 的 LLR 叠加到旧 TB 的软缓冲区，解码必然失败，且 BLER 表现与信道质量无关（永远 NACK）。

---

### 5. NR HARQ 的关键设计差异（对比 LTE）

| 维度 | LTE | 5G NR |
|---|---|---|
| **DL HARQ 机制** | 异步 | 异步 |
| **UL HARQ 机制** | **同步**（进程号隐含）| **异步**（进程号显式在 DCI 中）|
| **K1 值** | 固定 4ms（FDD）| **灵活**（RRC 表 + DCI 索引）|
| **最大进程数** | 8（FDD DL）| **可配 2~16**（`nrofHARQ-ProcessesForPDSCH`）|
| **PUSCH HARQ-ACK** | gNB 发 PHICH | **无显式 ACK**：UE 看 NDI 是否翻转 |
| **CBG 重传** | ❌ | ✅（最多 8 个 CBG）|

#### 5.1 PUSCH 无显式 HARQ-ACK 机制

NR 上行没有 PHICH，UE 通过观察 NDI 判断上次 PUSCH 是否成功：

```
gNB 解码成功 → 下次调度时 NDI 翻转 → UE 判断：上次 PUSCH 成功
gNB 解码失败 → 发送重传 DCI（NDI 不变，指定新 RV）→ UE 判断：需要重传
```

#### 5.2 CBG（Code Block Group）重传

当 TB 很大时，若只有部分 CB 解码失败，CBG 机制允许按 CB 组为单位精细化重传：

```
TB 拆分为 M 个 CBG（M ≤ 8）：

CBG#0  CBG#1  CBG#2  CBG#3
  ✅     ❌     ✅     ❌

DCI 中 cbgTransmissionIndicationPDSCH：'0101'
→ gNB 只重传 CBG#1 和 CBG#3，节省约 50% 重传开销
```

---

### 6. ⚠️ NTN (Rel-17) 深度分析：HARQ 的两难困境

#### 6.1 定量分析：RTT 与进程数的矛盾

| 场景 | 单程时延 | RTT | 需要进程数（μ=1）|
|:---:|:---:|:---:|:---:|
| LEO 550km θ=90° | 1.83ms | ≈5ms | 11 |
| LEO 550km θ=45° | 2.12ms | ≈6ms | 13 |
| LEO 550km θ=20° | 5.3ms | ≈13ms | 27 |
| LEO 550km θ=10° | 10.6ms | ≈23ms | 47 |
| GEO 35786km | 238ms | ≈476ms | 953 |

**GEO 场景下 HARQ 在物理上完全不可行**。

<HARQNTNCalculator />

#### 6.2 Rel-17 的三条出路

```
╔═══════════════════════════════════════════════════════════╗
║         NTN HARQ 策略决策树（Rel-17，38.821 §6.3）        ║
╠═══════════════════════════════════════════════════════════╣
║  RTT 可接受（RTT / T_slot ≤ 16）？                        ║
║       │                                                   ║
║       ├─ 是 → 策略 A：启用 HARQ + K-offset               ║
║       │         最多 16 进程，调整 K_offset 覆盖 RTT      ║
║       │         适用：LEO 高仰角场景（θ > 50°）            ║
║       │                                                   ║
║       └─ 否                                               ║
║             ├─ 策略 B：禁用 HARQ                          ║
║             │   物理层不重传，完全依靠 RLC ARQ             ║
║             │   适用：GEO、LEO 极低仰角                   ║
║             │                                             ║
║             └─ 策略 C：进程数扩展（Rel-18 研究中）        ║
╚═══════════════════════════════════════════════════════════╝
```

#### 6.3 策略 A：K-offset 作用于 HARQ 时序

$$K_1^{\text{eff}} = K_1 + K_{\text{offset}}, \quad K_2^{\text{eff}} = K_2 + K_{\text{offset}}$$

16 个进程在 NTN 中能覆盖的最大 K1_eff = 15，对应 RTT ≤ 7.5ms（μ=1），即 LEO 550km θ ≥ 55° 左右。

#### 6.4 策略 B：禁用 HARQ——代价与补偿

| 指标 | HARQ 启用 | HARQ 禁用 |
|---|---|---|
| **错误恢复速度** | 快（1~2 个 RTT）| 慢（需等 RLC ARQ 周期）|
| **吞吐量上限** | 受进程数限制 | 不受限，链路满速利用 |
| **时延** | 低 | 高（RLC 层重传延迟大）|
| **适用业务** | 实时业务（VoIP）| 非实时业务（文件传输）|
| **NTN 推荐** | LEO 高仰角 | GEO / LEO 低仰角 |

#### 6.5 NTN HARQ 的哲学结论

> **HARQ 的设计空间服务于"往返时延 << 调度周期"的假设**。地面网络中 RTT ≤ 5ms，HARQ 可以做到透明。NTN 彻底打破了这个假设——RTT 从 5ms 跳到 500ms，跨越两个数量级。**Rel-17 的工程答案不是修改 HARQ 协议本身，而是提供"用还是不用"的开关，并依靠上层（RLC/PDCP）承接可靠性职责。** 这体现了 3GPP 一贯的"接口不变，能力扩展"原则。

---

## 🔍 实战信令视角（IE / Log Analysis）

### 关键 IE 速查

```
RRC: PDSCH-ServingCellConfig
└── nrofHARQ-ProcessesForPDSCH
    ENUMERATED {n2, n4, n6, n10, n12, n16}   ← 未配置时默认 8 个进程

RRC: PDSCH-Config
├── codeBlockGroupTransmission              ← CBG 重传配置
│   └── maxCodeBlockGroupsPerTransportBlock
│       ENUMERATED {n2, n4, n6, n8}
└── harq-ProcessNumberSizePDSCH-r17         ← Rel-17 NTN

RRC: pusch-ConfigCommon
└── dl-DataToUL-ACK
    { K1_val_0, K1_val_1, ... }             ← K1 候选值列表（最多 8 项）
    DCI 中 pdsch-to-harq-feedback-timing-indicator 字段索引该列表

RRC（Rel-17 NTN）:
└── k-Offset-r17                            ← 全局 K_offset，叠加到所有 K1/K2
```

### 🚨 故障排查速查表

| 故障现象 | 首先检查 | 最可能根因 |
|---|---|---|
| HARQ NACK 率 100%，信道质量正常 | NDI 同步状态 | gNB/UE NDI 不同步，软缓冲区污染 |
| 重传后 BLER 没有改善（平台）| RV 序列 | 多次重传都发 RV=0（CC），未使用 IR |
| NTN 场景 HARQ-ACK 始终未收到 | K-offset 配置 | K_offset 未配置，UE 在 N+4 发 ACK，gNB 在 N+19 才能收 |
| NTN 场景吞吐量远低于理论值 | nrofHARQ-ProcessesForPDSCH | 进程数不足，大量时隙空洞 |
| CBG 重传后某些 CB 仍 BLER 高 | cbgFlushingOutFlagForDownlink | CBG 清除标志置 1，UE 未合并旧软缓冲区 |

---

## 🐍 仿真实现思路

### 伪代码骨架

```
══════════════════════════════════════════════════════════════
【数学层】IR 软合并（圆形缓冲区 LLR 叠加）
──────────────────────────────────────────────────────────────
# 圆形缓冲区 LLR 初始化
soft_buffer[proc_id] = zeros(N_cb)

# 每次接收到 RV=rv 的传输：
k0 = start_position(rv, N_cb)      # 38.212 Table 5.4.2.1-2
for i in range(E):
    buf_idx = (k0 + i) % N_cb
    soft_buffer[proc_id][buf_idx] += LLR_received[i]  # LLR 叠加

decoded_bits, crc_ok = ldpc_decode(soft_buffer[proc_id])
══════════════════════════════════════════════════════════════
【算法层】HARQ 进程状态机
──────────────────────────────────────────────────────────────
ON DCI received:
    IF DCI.ndi != HARQ_State[proc_id].ndi:     # NDI 翻转 = 新传
        clear(HARQ_State[proc_id].soft_buf)
        HARQ_State[proc_id].tx_count = 0

    rx_llr = receive_pdsch()
    k0 = start_position(DCI.rv)
    accumulate(HARQ_State[proc_id].soft_buf, rx_llr, k0)
    ok = ldpc_decode(HARQ_State[proc_id].soft_buf)
    send_harq_ack(ok, at_slot=current_slot + K1_eff)
══════════════════════════════════════════════════════════════
```

---

## 📝 版本演进与工程自测

### 版本演进速览

| Feature | Rel-15 | Rel-16 | Rel-17 |
|---|:---:|:---:|:---:|
| 异步 HARQ（DL + UL）| ✅ | 不变 | 不变 |
| 灵活 K1（RRC + DCI）| ✅ | 不变 | 不变 |
| CBG 重传（最多 8 个）| ✅ | 不变 | 不变 |
| 最大 16 个 HARQ 进程 | ✅ | 不变 | 不变 |
| 多 TRP HARQ 合并 | ❌ | ✅ | 增强 |
| NTN K-offset 适配 | ❌ | ❌ | ✅ |
| NTN HARQ 禁用选项 | ❌ | ❌ | ✅ |
| GEO NTN HARQ 研究 | ❌ | ❌ | ✅（研究阶段）|

---

### 面试级自测题

**Q1 · 概念题（IR 核心）**

> 为什么 IR（增量冗余）的 BLER 改善幅度在每次重传时比 CC（追踪合并）更大？请从信息论和线性代数两个角度各给出一句话解释。

:::details 💡 展开答案

**信息论角度**：IR 的每次重传提供的互信息是新增的（覆盖圆形缓冲区的新区域），等效码率 $R_{\text{eff}} = K / E_{\text{total}}$ 随重传次数降低，接近香农限的步伐更快；而 CC 等效码率不变，只是 SNR 线性增加，改善受限于时间分集增益（$\sim 3\text{dB/次}$）。

**线性代数角度**：IR 每次重传相当于向求解系统 $\mathbf{H}\mathbf{x} = \mathbf{y}$ 中增加新的方程行（新校验位对应新约束），使系统逐渐从欠定趋向满秩，解的置信度超线性提升；CC 只是将现有方程乘以正标量后叠加，方程数不变，改善有限。

**参考**：38.212 §5.4.2（圆形缓冲区）

:::

---

**Q2 · 计算题（进程数与 NTN 时序）**

> 一个 NTN LEO 网络，μ=1（SCS=30kHz），轨道高度 1200km，仰角 30°。
>
> (a) 计算单程传播时延（ms）和 RTT（含 gNB+UE 各 1ms 处理时间）
> (b) 若 K1_base = 4 slots，K_offset 按 ⌈RTT/T_slot⌉ 配置，K_offset 应为多少？
> (c) 维持 HARQ 流水线无空洞，理论最小进程数为多少？5G NR 协议能满足吗？

:::details 💡 展开答案

**(a)** 轨道半径 $r = 6371 + 1200 = 7571$ km，仰角 30°：

$$d = \sqrt{7571^2 - (6371 \cos 30°)^2} - 6371 \sin 30° \approx 5187 - 3186 \approx 2001 \text{ km}$$

$$\tau = 2001 / 300 \approx 6.67 \text{ ms}, \quad \text{RTT} = 2 \times 6.67 + 2 = 15.34 \text{ ms}$$

**(b)** $T_{\text{slot}} = 0.5 \text{ ms}$

$$K_{\text{offset}} = \lceil 15.34 / 0.5 \rceil = 31 \text{ slots}$$

**(c)** 有效 $K_1 = 4 + 31 = 35$ slots，$N_{\text{proc}}^{\min} = 36$

**36 > 16（协议上限）**，无法满足。此场景应考虑禁用 HARQ 改用 RLC ARQ，或增大 μ 缩短 slot 时长（但 K_offset 数值同步增大，治标不治本）。

:::

---

**Q3 · 工程排障题（NTN + NDI 同步）**

> NTN LEO 网络（550km，μ=1，K_offset=15），Log 显示：PDSCH BLER≈2%（正常），但 gNB 侧 HARQ-ACK 接收率只有 50%，UE Log 显示 HARQ-ACK 在 slot N+4 发送（未加 K_offset）。随后触发重传，某些进程的 BLER 异常升高（比首传更差）。分析所有异常的根因，给出修复措施和需要检查的具体配置项。

:::details 💡 展开答案

**根因一（主要）：K_offset 未被 UE 应用**

UE 在 slot N+4 发 HARQ-ACK，但 gNB 有效 K1=4+15=19，在 slot N+19 才开接收窗口。N+4 时 gNB 未监听该 PUCCH 资源 → ACK 丢失 → 计为 NACK → 触发不必要的重传。

**修复**：检查 RRC 中 `k-Offset-r17` 是否下发，以及 UE 实现是否正确将 K_offset 叠加到 K1（发 HARQ-ACK 时机 = slot N + K1_base + K_offset = slot N+19）。

**根因二（次要）：重传后 BLER 升高**

由于 K_offset 缺失，gNB 发出错误的重传调度，NDI 字段状态混乱。UE 将重传 TB 误判为新传（NDI 翻转误判），清空了软缓冲区，每次都从零开始解码，合并增益完全丧失，等效永远只有"首传"性能。

**检查项**：`k-Offset-r17` 值；UE 侧 HARQ-ACK 实际发送时隙 vs 理论值；gNB Log 中 NDI 翻转历史。

**参考**：38.213 §9.2.3（K1 计算），38.821 §6.3（NTN K-offset），38.321 §5.3

:::

---

## 参考资料

- **3GPP TS 38.212 v15.7.0** — 速率匹配与 RV（§5.4.2）；圆形缓冲区（§5.4.2.1）
- **3GPP TS 38.213 v15.7.0** — HARQ-ACK Codebook（§9.1）；K1 时序（§9.2）
- **3GPP TS 38.321 v15.7.0** — MAC HARQ 机制（§5.3）；CBG 重传（§5.3.3）
- **3GPP TS 38.331 v15.7.0** — PDSCH-ServingCellConfig（nrofHARQ-ProcessesForPDSCH）
- **3GPP TR 38.821 v17.3.0** — NTN HARQ 取舍分析（§6.3.3）
- ShareTechnote — [5G HARQ](https://www.sharetechnote.com/html/5G/5G_HARQ.html)
- Tse & Viswanath — *Fundamentals of Wireless Communication* Ch.4
