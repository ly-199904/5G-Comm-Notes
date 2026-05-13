# 5G NR 协议栈与网络架构先导课

> **阅读建议：** 本文是 [NTN Sub6G 卫星链路测试全景指南](./ntn-sub6g-test-guide.md) 的前置课程。  
> **目标读者：** 具备无线通信基础理论，但缺乏 5G 核心网 / 高层协议实操经验的工程师。  
> **核心原则：** 只讲"你在做 NTN 测试时会直接遇到"的知识，不做百科全书。

---

## 目录

1. [第一部分：5G 网络极简架构](#part1)
2. [第二部分：PHY 与 MAC — 信号如何变成比特](#part2)
3. [第三部分：RRC — 基站与终端的管家](#part3)
4. [第四部分：NAS — 核心网与终端的直接对话](#part4)
5. [第五部分：融会贯通：UE 开机到打开网页的完整历险](#part5)
6. [附录：关键术语速查与 NTN 映射](#appendix)

---

## <a id="part1"></a>第一部分：5G 网络极简架构

### 1.1 先建立一张"大地图"

在深入任何细节之前，先理解 5G 的整体分工。整个系统被切成两刀：

```
第一刀（按位置）：接入网 vs 核心网
  接入网（RAN）：UE ↔ gNB  —— 负责"最后一公里"的无线传输
  核心网（5GC）：gNB ↔ 各功能节点 —— 负责认证、路由、策略、记账

第二刀（按功能）：控制面 vs 用户面
  控制面（CP）：管理连接的建立/释放、鉴权、移动性 —— "说话"的那条线
  用户面（UP）：传输实际的业务数据（视频、网页、语音流）—— "做事"的那条线
```

这两刀合在一起，就是 5G 架构最核心的设计理念：**控制面与用户面分离（CUPS）**。

---

### 1.2 各网元职责速写

#### 接入网侧

**UE（用户设备）**
- 不仅仅是"手机"，在 NTN 测试中通常是带 SIM 卡的卫星专用模组
- 协议栈完整：从物理层射频 → MAC/RLC/PDCP → RRC → NAS，全部在设备内部
- UE 对核心网来说是一个"黑盒"，核心网只通过 NAS 消息与 UE 通信

**gNB（5G 基站 / 星载基带）**
- NTN 场景中，gNB 集成在卫星平台上（星载基带）
- 向 UE 侧：处理 PHY/MAC/RLC/PDCP/RRC 所有无线协议
- 向核心网侧：通过 N2 接口（控制面）和 N3 接口（用户面）连接核心网
- **关键认知：gNB 对 NAS 消息是透明中继，它看不懂 NAS 内容，只负责搬运**

```
UE ←——[Uu空口]——→ gNB ←——[N2控制面 / N3用户面]——→ 5GC
         无线信道            有线/星地馈电链路
```

---

#### 核心网侧（5GC）

理解核心网最好的方式是**按问题分类**，每个网元回答一个特定问题：

```
┌──────────────────────────────────────────────────────────────────────────┐
│  问题：这个用户是谁？能不能接入？                                           │
│  回答者：AMF（接入与移动性管理功能）                                        │
│  职责：                                                                    │
│   - 接收 UE 的注册请求，是所有 NAS 消息的终点（控制面锚点）                  │
│   - 协调鉴权流程（调用 AUSF）                                               │
│   - 管理 UE 的 RM（注册状态）和 CM（连接状态）状态机                         │
│   - 处理寻呼、切换、位置管理                                                 │
│   - 在 NTN 中：校验 ANID、TAC=0、下发 TAU 门限                             │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  问题：这个用户的会话怎么建？数据往哪儿走？                                  │
│  回答者：SMF（会话管理功能）                                                │
│  职责：                                                                    │
│   - 管理 PDU 会话的全生命周期（建立/修改/释放）                              │
│   - 为 UE 分配 IP 地址（IPv4/IPv6）                                        │
│   - 控制 UPF（通过 N4/PFCP 接口），告诉 UPF 数据包怎么转发                  │
│   - 在 NTN 中：根据 UE 位置选择最优信关站边缘 G-UPF（位置感知路由）          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  问题：用户的数据包实际怎么转发？                                            │
│  回答者：UPF（用户面功能）                                                  │
│  职责：                                                                    │
│   - 用户面数据的实际转发节点（相当于"路由器"）                               │
│   - 执行 SMF 下发的转发规则（通过 PFCP 协议）                               │
│   - 接入外部数据网络（Internet、IMS 等）                                    │
│   - 在 NTN 中：部署在各信关站边缘（G-UPF），就近接入数据网络                 │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  问题：这个用户的签约数据在哪里？                                            │
│  回答者：UDM（统一数据管理）                                                │
│  职责：                                                                    │
│   - 存储用户的永久标识（SUPI/IMSI）和签约数据                               │
│   - 为 AUSF 提供认证数据（AKA 向量）                                        │
│   - 在 NTN 中：存储 satAccessEnabled 字段（是否签约卫星接入服务）            │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  问题：如何确认这个用户是"真的"？                                            │
│  回答者：AUSF（认证服务功能）                                               │
│  职责：                                                                    │
│   - 执行 5G AKA 认证的归属域部分                                            │
│   - 从 UDM 获取认证向量（XRES*），与 AMF 转发的 RES* 比对                   │
│   - 实现"增强的归属控制（EHC）"——即使 AMF 在漫游网络，归属运营商仍能验证用户  │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  问题：业务规则是什么？（QoS 怎么配？）                                      │
│  回答者：PCF（策略控制功能）                                                │
│  职责：                                                                    │
│   - 下发 QoS 策略（哪类流量用哪个 5QI，带宽保证多少）                        │
│   - 触发会话修改（如动态调整 QoS）和会话释放（如欠费）                       │
│   - 决定用户面安全策略（完整性/机密性保护是否 Required）                     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### 1.3 接口与协议速查

```
接口名  连接双方          控制面协议              用户面协议
─────────────────────────────────────────────────────────────────
Uu     UE ↔ gNB          RRC（承载NAS）           PDCP/RLC/MAC/PHY
N2     gNB ↔ AMF          NGAP（承载NAS消息）       —（无用户面）
N3     gNB ↔ UPF          —                       GTP-U（隧道）
N4     SMF ↔ UPF          PFCP                    —
N11    AMF ↔ SMF          HTTP/2（服务化接口）       —
N7     SMF ↔ PCF          HTTP/2                  —
N8     AMF ↔ UDM          HTTP/2                  —
N12    AMF ↔ AUSF         HTTP/2                  —
N10    SMF ↔ UDM          HTTP/2                  —
```

> **"服务化接口"的含义：** 5GC 核心网的接口全部采用 HTTP/2 + JSON（REST 风格），这与 4G 使用 Diameter/GTP-C 协议的设计完全不同。在 Wireshark 抓包时，你看到的是 HTTP/2 请求与响应，而不是传统的信令消息。

#### 用一句话理解控制面 vs 用户面的分流：

```
控制面（"指挥链"）：
  UE ─[NAS]─→ gNB（透明中继）─[NGAP]─→ AMF ─[HTTP/2]─→ SMF/UDM/AUSF/PCF

用户面（"数据管道"）：
  UE ─[SDAP/PDCP]─→ gNB ─[GTP-U/N3]─→ UPF ─→ Internet
                                         ↑
                              SMF 通过 N4/PFCP 控制转发规则
```

---

## <a id="part2"></a>第二部分：PHY 与 MAC — 信号如何变成比特

> **本节目标：** 不深究信号处理数学，而是搞清楚"一条 RRC 消息是怎么从基站天线口变成 UE 内存里的字节"这个流程，以及各个物理信道在测试日志中对应什么。

### 2.1 三层信道的映射关系

5G 对信道做了三层抽象，从上到下依次是：

```
逻辑信道（Logical Channel）—— RRC/NAS 关心的抽象层，"传什么"
        ↓ MAC 层负责映射
传输信道（Transport Channel）—— 调度和编码的单元，"怎么打包"
        ↓ PHY 层负责承载
物理信道（Physical Channel）—— 实际在空口传输的无线资源，"用什么频时资源传"
```

**具体映射（与 NTN 测试直接相关的信道）：**

```
逻辑信道        传输信道    物理信道      说明
─────────────────────────────────────────────────────────────────────────
BCCH           BCH        PBCH       广播 MIB（主信息块）
BCCH           DL-SCH     PDSCH      广播 SIB1, SIB19 等其他 SIB
CCCH（建立前）  UL-SCH     PUSCH      RRC Setup Request（未建立连接时）
CCCH（建立后）  DL-SCH     PDSCH      RRC Setup（基站响应）
DCCH           UL-SCH     PUSCH      专用信令（RRC Reconfiguration 等）
DTCH           UL-SCH     PUSCH      用户数据（FTP/HTTP 上行）
DTCH           DL-SCH     PDSCH      用户数据（FTP/HTTP 下行）

控制信道：
  —            —          PDCCH      下行控制信息（DCI），调度 PDSCH/PUSCH
  —            —          PUCCH      上行控制信息（UCI），包含 CQI/HARQ/SR
  —            —          PBCH       固定承载 MIB，每 20 ms 更新一次
```

> **测试日志中的对应关系：**  
> - 你在基带 Log 里看到"PDSCH 调度 MCS=28"→ 这是物理层在调度逻辑信道 DTCH 的用户数据  
> - 你在 UE Log 里看到"PUCCH format 1 上报 CQI=15"→ 这是 UE 通过上行控制信道反馈信道质量

---

### 2.2 三个核心动作详解

#### 动作 1：盲检 DCI（Blind Decoding of DCI）

**是什么：**  
UE 不知道基站"什么时候"、"用哪个搜索空间"给自己下发调度命令（DCI），因此 UE 必须在每个时隙对 PDCCH 上所有可能的位置都尝试解码——这就叫"盲检"。

**为什么重要（NTN 视角）：**

```
盲检成功 → UE 知道本时隙有数据下发 → 去 PDSCH 上按 DCI 指示解调数据
盲检失败 → UE 认为本时隙没有自己的数据 → 跳过 PDSCH 解调

NTN 特殊性：大时延导致 PDCCH 的定时关系（K0/K1/K2 offset）必须
            配置大于 TN 的值，否则 UE 会在错误的时隙去找 PDSCH。
```

DCI 的主要内容（DCI format 1_1，下行调度）：

```
字段              含义
────────────────────────────────
频率资源分配      告诉 UE 在哪些 PRB 上接收数据
时间资源分配      告诉 UE 在哪几个符号上接收数据
MCS 索引         告诉 UE 用哪种调制方式和编码速率解调
HARQ 进程号       对应哪个 HARQ 进程（共 16 个）
NDI（新数据指示） 是新传还是重传
RV（冗余版本）    HARQ 重传时用哪个冗余版本
```

---

#### 动作 2：测量 RSRP / 上报 CQI

```
RSRP（Reference Signal Received Power）—— 信号强度
  UE 测量下行 SSB（同步信号块）或 CSI-RS 的参考信号功率
  单位：dBm，范围：-140 ～ -44 dBm
  决定：UE 能否驻留该小区（RSRP 阈值）、触发移动性注册更新（TAU 门限）

CQI（Channel Quality Indicator）—— 信道质量反馈
  UE 基于测量的 RSRP/SNR，从内部 BLER 模型推算出当前最高能支持的 MCS
  编码为 0～15 的整数（0=最差，15=最好，对应 64QAM 最高码率）
  通过 PUCCH/PUSCH 上报给基带
  基带根据 CQI 选择下行 MCS → 这就是 AMC 的核心闭环

SINR（Signal to Interference plus Noise Ratio）—— 信噪比
  基带在上行接收 PUSCH/PUCCH 时测量
  决定基带选择上行调度的 MCS（上行 AMC 的依据）
```

---

#### 动作 3：HARQ 反馈

HARQ（混合自动重传请求）是 5G 中保证可靠传输的最快机制（比 TCP 重传快得多）。

```
下行 HARQ 流程：
  基站 PDSCH 下发数据（第1次传输）
       ↓
  UE 解码：成功 → 发 ACK（经 PUCCH）；失败 → 发 NACK
       ↓
  NACK：基站重传（RV 版本不同，可与之前的版本合并解码 = 软合并）
       ↓
  最多重传 4 次（HARQ 进程超时则丢弃，由 RLC 层处理）

NTN 特殊性：
  大时延导致从 PDSCH 发出到收到 ACK/NACK 的时间远大于 TN（可达 40～80 ms）
  因此 NTN 通常关闭 HARQ 反馈（Disable HARQ）或配置超大 K1 offset，
  改由 RLC 层的 AM 模式（ARQ）来保证可靠性。
  这是 NTN 与 TN 调度逻辑最重要的区别之一。
```

---

### 2.3 MCS 与调制方式对照

| MCS 索引（PDSCH） | 调制方式 | 频谱效率（bit/s/Hz） | 适用信道条件 |
|-----------------|---------|-------------------|------------|
| 0 ～ 9          | QPSK    | 0.23 ～ 2.57      | 差（低 RSRP / 低 SNR） |
| 10 ～ 16        | 16QAM   | 2.73 ～ 5.16      | 中等 |
| 17 ～ 27        | 64QAM   | 5.33 ～ 7.41      | 好（高 RSRP / 高 SNR） |
| 28              | 64QAM   | 最大编码速率        | 优秀 |

> **AMC 测试的直觉：** 当你调大衰减器，RSRP 下降 → CQI 下降 → 基带降低下行 MCS → 你在调度日志里看到 MCS 从 28 跌到 14 再跌到 6。**这就是 6.1.3 测试的核心现象。**

---

## <a id="part3"></a>第三部分：RRC — 基站与终端的管家

> RRC（无线资源控制）层是空口协议栈中最复杂、最重要的层。它做的事情用一句话概括：**管理 UE 与 gNB 之间的连接，并承载 NAS 消息的传输通道。**

### 3.1 MIB/SIB 广播机制——小区的"自我介绍"

UE 开机搜网时，首先读取基站广播的系统消息：

```
MIB（主信息块）—— 承载于 PBCH，每 80 ms 重复一次
  内容：系统帧号（SFN）、子载波间距（SCS）、CORESET#0 位置
  作用：告诉 UE"如何解码 SIB1"（最最基础的信息）

SIB1 —— 承载于 PDSCH（用 CORESET#0 调度），每 160 ms 更新
  内容：小区是否可驻留（cellBarred）、PLMN 列表、接入限制类别、
         调度其他 SIB 的位置信息
  作用：UE 决定"要不要驻留这个小区"

SIB19（NTN 专属，3GPP R17 新增）—— 按需广播或专用下发
  内容：卫星星历辅助信息（卫星位置/速度/有效时间窗口）、
         NTN 相关定时参数（K-offset、TA 预补偿等）
  作用：UE 预先计算时延和频偏补偿量，大幅提升接入速度
        没有 SIB19，UE 仍可通过 GNSS 自行计算，但更慢
```

**读取顺序：**
```
PSS/SSS 同步（物理层）
  → 解码 PBCH/MIB（获得 SFN 和 CORESET#0 位置）
  → 解码 PDSCH 上的 SIB1（判断是否可驻留）
  → 解码其他 SIB（SIB2: 接入参数, SIB19: 星历）
  → 发起随机接入（PRACH）
```

---

### 3.2 SRB 与 DRB——消息的"快车道"

建立 RRC 连接后，UE 与 gNB 之间存在两种无线承载：

```
SRB（Signaling Radio Bearer）—— 信令无线承载
  ├── SRB0：承载 RRC Setup/Reject 等最早期 RRC 消息（未建立连接时）
  ├── SRB1：承载 RRC 消息和 NAS 消息（安全模式激活前/后均使用）
  └── SRB2：承载 NAS 消息（安全模式激活后，优先级低于 SRB1）

DRB（Data Radio Bearer）—— 数据无线承载
  └── 承载用户面数据（每个 PDU 会话可以有一个或多个 DRB）
      每个 DRB 对应一个 5QI（服务质量标识）

关键认知：
  ① SRB 先于 DRB 建立——先有信令通道，才能建数据通道
  ② NAS 消息（注册、PDU 会话建立等）走 SRB1/SRB2，不走 DRB
  ③ RRC 重建时，SRB1 首先恢复（信令面），然后才恢复 DRB（数据面）
```

---

### 3.3 RRC 状态机——UE 的"在线状态"

```
                    ┌─────────────────────────────────────────┐
                    │            RRC_IDLE                      │
                    │  UE 与 gNB 无 RRC 连接                  │
                    │  UE 自主决定驻留小区                      │
                    │  核心网不知道 UE 在哪个小区               │
                    │  UE 监听 Paging（周期性醒来）             │
                    └─────────┬─────────────────┬─────────────┘
               RRC Setup      │                 │  RRC Release
             （随机接入+建立）  │                 │  + 转 IDLE
                              ↓                 │
                    ┌─────────────────────────────────────────┐
                    │           RRC_CONNECTED                  │
                    │  UE 与 gNB 有活跃 RRC 连接              │
                    │  核心网知道 UE 精确位置（哪个 gNB）      │
                    │  SRB1/SRB2 和 DRB 均可激活              │
                    │  UE 持续发送 CQI/测量报告               │
                    └─────────┬─────────────────┬─────────────┘
          RRC Suspend         │                 │  RRC Resume
         （暂停，保留上下文）  │                 │
                              ↓                 │
                    ┌─────────────────────────────────────────┐
                    │          RRC_INACTIVE                    │
                    │  5G 新增状态（4G 没有）                  │
                    │  UE 侧和 gNB 侧均保留 RRC 上下文        │
                    │  省电效果接近 IDLE                       │
                    │  恢复速度接近 CONNECTED                  │
                    │  核心网侧连接保持（AMF 不感知状态变化）   │
                    └─────────────────────────────────────────┘
```

**状态转换的触发条件（与测试直接相关）：**

| 转换 | 触发条件 |
|------|---------|
| IDLE → CONNECTED | 随机接入成功（UE 发起）或寻呼触发（网络发起） |
| CONNECTED → IDLE | RRC Release（无业务，定时器超时）|
| CONNECTED → INACTIVE | RRC Suspend（网络决定暂停连接） |
| INACTIVE → CONNECTED | RRC Resume（UE 有新业务） |
| CONNECTED → CONNECTED（重建） | 无线链路失败（RLF）触发 RRC 重建 |

**RLF（无线链路失败）的触发逻辑：**

```
UE 连续检测到 N310 次 Out-of-Sync 指示（物理层质量差）
→ 启动定时器 T310（通常数百 ms）
→ 若 T310 内信号恢复（In-Sync），取消 RLF
→ 若 T310 超时仍未恢复 → 宣告 RLF
→ UE 启动 T311（RRC 重建等待定时器）
→ UE 发送 RRCReestablishmentRequest（含小区 ID 和 UE 标识）
→ gNB 回复 RRCReestablishment
→ UE 回复 RRCReestablishmentComplete → SRB1 恢复
→ gNB 发送 RRCReconfiguration → DRB 恢复 → 业务正常
```

> **NTN 测试中触发 RLF 的方法：** 将衰减器快速增大至 70 dB 以上，使 RSRP 骤降至 -130 dBm 以下，Physical Layer 连续上报 Out-of-Sync，T310 超时触发 RLF。

---

### 3.4 随机接入四步曲（RACH Procedure）

随机接入是 UE 从 IDLE/INACTIVE 进入 CONNECTED 的必经之路，也是切换和 RRC 重建的必要步骤。

```
Msg1（PRACH Preamble）：UE → gNB
  ┌─────────────────────────────────────────────────────────────┐
  │  UE 从 64 个 Preamble 序列中随机选一个，在 PRACH 资源上发送   │
  │  用途：让 gNB 知道"有 UE 想接入"                             │
  │  NTN 特殊：PRACH 必须包含 NTN-TA 预补偿（基于星历计算）       │
  └─────────────────────────────────────────────────────────────┘

Msg2（RAR，随机接入响应）：gNB → UE
  ┌─────────────────────────────────────────────────────────────┐
  │  gNB 检测到 Preamble 后，通过 PDCCH（RA-RNTI 寻址）发送 RAR  │
  │  RAR 内容：                                                  │
  │    - TA 命令（让 UE 精确调整发送时间）                        │
  │    - 上行资源授权（告诉 UE 用哪些 PRB 发 Msg3）               │
  │    - 临时 C-RNTI（后续用此标识寻址该 UE）                     │
  │  NTN 特殊：TA 命令 = 实际时延 - UE 预补偿时延（残差 TA）       │
  └─────────────────────────────────────────────────────────────┘

Msg3（RRC Setup Request）：UE → gNB
  ┌─────────────────────────────────────────────────────────────┐
  │  UE 使用 RAR 分配的上行资源，发送 RRC 建立请求               │
  │  内容：UE 标识（S-TMSI 或随机数），建立原因（mo-Data 等）      │
  └─────────────────────────────────────────────────────────────┘

Msg4（RRC Setup / Contention Resolution）：gNB → UE
  ┌─────────────────────────────────────────────────────────────┐
  │  gNB 分配正式的 C-RNTI，发送 RRC Setup 消息                  │
  │  RRC Setup 内容：SRB1 配置参数（PDCP/RLC/MAC 配置）           │
  │  UE 收到后回复 RRC Setup Complete（含 NAS Registration Req） │
  │  至此，SRB1 建立完成，UE 进入 RRC_CONNECTED 状态             │
  └─────────────────────────────────────────────────────────────┘
```

> **一个重要的时序认知：** Msg4 里的 `RRC Setup Complete` 已经包含了 UE 要发给 AMF 的第一条 NAS 消息（`Registration Request`）。也就是说，**RRC 连接一建立，NAS 注册流程就已经开始了**，这两个过程是**紧密耦合**的，不是串行等待的。

---

## <a id="part4"></a>第四部分：NAS — 核心网与终端的直接对话

> **最重要的认知：NAS 消息对 gNB 完全透明。**  
> gNB 不解析 NAS 消息，它只是把 NAS 消息像邮件一样，装在 NGAP 信封里，从 UE 转发给 AMF（或反方向）。因此，即使你在 gNB 侧 Log 里看不到 NAS 内容，只要在 Wireshark 抓 N2 接口，就能完整看到所有 NAS 消息。

### 4.1 NAS 的两大子模块

```
NAS 协议
├── 5G MM（移动性管理）—— 管"人"（UE 的存在状态）
│   负责：注册/去注册、鉴权、安全上下文建立、寻呼、位置更新
│   状态机：RM（注册状态）× CM（连接状态）
│
└── 5G SM（会话管理）—— 管"路"（数据如何流动）
    负责：PDU 会话的建立/修改/释放、IP 地址管理
    状态机：PSI（PDU Session ID）对应的会话状态
```

---

### 4.2 移动性管理（5GMM）状态机

```
                   RM-DEREGISTERED
                   （未注册状态）
                         │
                         │ 注册成功（Registration Accept）
                         ↓
                   RM-REGISTERED
                   （已注册状态）
                   ├── 周期性注册更新（T3512 超时）
                   │     → Registration Type = periodic
                   └── 移动性注册更新（位置超过 TAU 门限）
                         → Registration Type = mobility

    连接状态（CM，与 RRC 状态密切关联）：
    CM-IDLE：UE 无 N2 连接（对应 RRC_IDLE 或 RRC_INACTIVE）
    CM-CONNECTED：UE 有 N2 连接（对应 RRC_CONNECTED）

    注意：RM-REGISTERED + CM-IDLE 是最常见的"待机"状态
          （UE 注册在网但没有活跃连接，用于节省资源）
```

**注册流程核心信令序列：**

```
UE → AMF：Registration Request
           ├── Registration Type（Initial / Mobility / Periodic）
           ├── UE 标识（SUCI 或 5G-GUTI）
           ├── UE Security Capabilities（支持哪些算法）
           └── 卫星：satellite access setting = 1，TAC = 0

AMF → AUSF → UDM：认证向量获取（AKA 流程）
AMF → UE：Authentication Request（RAND + AUTN）
UE → AMF：Authentication Response（RES*）

AMF → UE：Security Mode Command（NAS 安全算法选择）
UE → AMF：Security Mode Complete（NAS 安全上下文建立完成）

AMF → UE：Registration Accept
           ├── 分配的 5G-GUTI（临时标识）
           ├── TAI List（地面）或 TAU 门限（NTN）
           └── T3512 值（周期性注册更新定时器）

UE → AMF：Registration Complete
```

---

### 4.3 会话管理（5GSM）——PDU 会话生命周期

```
PDU 会话状态机：
  INACTIVE（无会话）→ ACTIVE（会话建立后）→ INACTIVE（释放后）

建立流程核心信令（简化版）：
  UE → AMF：PDU Session Establishment Request（含 DNN, PDU Type=IPv6）
  AMF → SMF：Nsmf_PDUSession_CreateSMContext
  SMF → UDM：获取 SM 签约数据（含用户面安全策略）
  SMF → PCF：SessionManagement_Policy_Establish（获取 QoS 规则）
  SMF → UPF：N4 Session Establishment（建立转发规则）
  SMF → AMF：N2 SM Info（DRB 配置 + 用户面安全策略）
              + NAS PDU Session Establishment Accept（含 IPv6 前缀）
  AMF → gNB：N2 PDU Session Resource Setup Request
  gNB → UE：RRCReconfiguration（DRB 建立配置）
  UE → gNB：RRCReconfigurationComplete
  gNB → AMF：N2 PDU Session Resource Setup Response
  → 至此，用户面数据通道建立，UE 可以传输数据
```

> **关键理解：** PDU 会话建立是 NAS 驱动（UE→AMF→SMF）+ RRC 实现（gNB→UE 建立 DRB）的**协同过程**。NAS 决定"建什么样的会话"，RRC 决定"空口资源怎么分配"。

---

### 4.4 标识体系——SUPI / SUCI / 5G-GUTI

这是 5G 安全设计最精妙的部分之一，直接对应测试项 6.1.20 / 6.1.22 / 6.1.23。

```
┌─────────────────────────────────────────────────────────────────────────┐
│ SUPI（Subscription Permanent Identifier）—— 永久标识                     │
│                                                                         │
│ 格式：IMSI（15 位数字）= MCC（3位）+ MNC（2-3位）+ MSIN（剩余位）        │
│ 存储：UDM 数据库（归属网）和 USIM 卡（终端侧）                           │
│ 特点：永不改变，全球唯一                                                  │
│ 问题：如果在空口明文传输，攻击者可以追踪用户位置（IMSI catcher 攻击）     │
└─────────────────────────────────────────────────────────────────────────┘
                         │
                         │ 5G 解决方案：加密！
                         ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ SUCI（Subscription Concealed Identifier）—— 加密的临时标识               │
│                                                                         │
│ 生成：UE 用归属网 UDM 的公钥（ECIES 椭圆曲线加密），对 MSIN 部分加密      │
│ 使用场景：UE 首次注册（没有 5G-GUTI 时）                                 │
│ 特点：每次生成的密文不同（随机性），即使是归属网也无法通过密文追踪           │
│ 解密：只有 AUSF/UDM 持有私钥，能解密 SUCI 还原出 SUPI                   │
└─────────────────────────────────────────────────────────────────────────┘
                         │
                         │ 注册成功后，AMF 分配临时标识
                         ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 5G-GUTI（Globally Unique Temporary Identifier）—— 网络分配的临时标识     │
│                                                                         │
│ 格式：PLMN ID + AMF ID + TMSI（Temporary Mobile Subscriber Identity）  │
│ 使用场景：后续注册更新（重启后用 GUTI 代替 SUCI）                         │
│ 更新：每次 Registration Accept，AMF 分配新的 GUTI，旧 GUTI 作废         │
│ 目的：即使 GUTI 被截获，下次注册已换新 GUTI，攻击者无法持续追踪           │
└─────────────────────────────────────────────────────────────────────────┘
```

**标识使用流程图：**

```
UE 开机（无 GUTI）         UE 重启（有 GUTI）
      ↓                          ↓
  用 SUCI 注册              用 GUTI 注册
      ↓                          ↓
  AMF 解密 SUCI            AMF 查找 UE 上下文
      ↓                          ↓
  分配新 5G-GUTI             分配更新的 5G-GUTI
      ↓                          ↓
  UE 存储新 GUTI            UE 更新存储的 GUTI

→ 全程空口不出现 SUPI（IMSI）！
```

---

### 4.5 5G AKA 认证——归属域控制的精髓

```
网络拓扑：
  UE ↔ AMF（服务网/拜访网）↔ AUSF（归属网）↔ UDM（归属网）

认证流程（关注增强的归属控制部分）：
                                                         UDM
  AMF → AUSF → UDM：获取认证向量
                                      UDM 生成：
                                        RAND（随机数）
                                        AUTN（认证令牌，含 MAC、SQN）
                                        XRES*（期望响应值）
                                        HXRES*（XRES* 的哈希）
                                        KAMF（派生密钥）

  AMF ← AUSF：收到 RAND、AUTN、HXRES*
              注意：AMF 只拿到 HXRES*，不是 XRES*！

  AMF → UE：Authentication Request（含 RAND、AUTN）

  UE（USIM 内部计算）：
    验证 AUTN 的 MAC 字段（确认网络是合法的）
    验证 SQN（防重放）
    计算 RES*（=f(RAND, 长期密钥 K)）

  UE → AMF：Authentication Response（含 RES*）

  AMF：计算 HRES* = hash(RES*)，与 HXRES* 比对
        → 比对成功：服务网确认 UE 合法
        AMF → AUSF：将 RES* 发给归属网做最终验证

  AUSF：将 RES* 与 XRES* 比对
        → 成功：归属域确认用户合法，下发 KAMF
        这一步是"增强的归属控制（EHC）"的核心
        即使 AMF 是恶意的，它没有 XRES*，无法伪造 AUSF 验证

  → 双向认证完成：网络验证了 UE（AUTN 中的 MAC），UE 验证了网络（XRES*）
```

---

## <a id="part5"></a>第五部分：融会贯通——UE 开机到打开 HTTP 网页

> 以时间轴串联前四部分所有核心概念，这是整个先导课的**总结性章节**。

```
T=0  ─────────────────────────────────────────────────────────────────────
     UE 按下开机键
     协议栈从底向上初始化：射频 → PHY → MAC → RLC → PDCP → RRC → NAS

T+0.1s  ──────────────────────────────────────────────────────────────────
[PHY 层] 搜网与同步
         UE 扫描频点，检测 PSS（主同步序列）和 SSS（辅同步序列）
         → 获得帧定时和 PCI（物理小区 ID）
         NTN 特殊：UE 从 GNSS 获取自身位置，基于星历预计算时延/频偏补偿
         → 预补偿后再进行 PSS/SSS 检测，成功率更高

T+0.2s  ──────────────────────────────────────────────────────────────────
[PHY/RRC] 读取系统消息
         解码 PBCH → 获取 MIB（SFN、SCS、CORESET#0）
         解码 PDSCH → 获取 SIB1（确认小区可驻留，不 barred）
         解码 PDSCH → 获取 SIB19（星历辅助信息，优化后续接入定时）
         UE 选择驻留此小区，进入 RRC_IDLE

T+0.5s  ──────────────────────────────────────────────────────────────────
[MAC 层] 随机接入（RACH）—— Msg1 ～ Msg4
         Msg1：UE 随机选 Preamble，在 PRACH 资源上发送（含预补偿 TA）
         Msg2：gNB 回复 RAR（残差 TA 命令 + 临时 C-RNTI + 上行授权）
         Msg3：UE 用 RAR 的上行授权发送 RRC Setup Request（含 UE 标识）
         Msg4：gNB 回复 RRC Setup（SRB1 配置 + 竞争解决）

T+0.7s  ──────────────────────────────────────────────────────────────────
[RRC 层] SRB1 建立，UE 进入 RRC_CONNECTED
         UE 回复 RRC Setup Complete
         ← 同时，RRC Setup Complete 的容器里装着第一条 NAS 消息 ──┐

T+0.7s  ──────────────────────────────────────────────────────────────────
[NAS/MM] 注册流程启动（与 RRC 建立并行推进）                         ←──┘
         UE → gNB → AMF：Registration Request
                          （UE 标识=SUCI，Registration Type=Initial，
                            satellite access setting=1，UE 安全能力列表）
         AMF 收到请求：
           → 调用 AUSF/UDM 执行 5G AKA 认证
           → AMF → UE：Authentication Request（RAND + AUTN）
           → UE 验证网络合法性，计算 RES*
           → UE → AMF：Authentication Response（含 RES*）
           → 双向认证成功，KAMF 生成

T+0.9s  ──────────────────────────────────────────────────────────────────
[NAS/MM] NAS 安全上下文建立
         AMF → UE：Security Mode Command（选择 128-NIA1 + 128-NEA1）
                    消息本身只做完整性保护，不加密
         UE → AMF：Security Mode Complete
                    此后所有 NAS 消息均加密 + 完整性保护

T+1.0s  ──────────────────────────────────────────────────────────────────
[NAS/MM] 注册完成
         AMF → UE：Registration Accept
                    （包含：新分配的 5G-GUTI、TAU 门限、T3512 定时器值）
         UE → AMF：Registration Complete
         UE 进入 RM-REGISTERED + CM-CONNECTED 状态

T+1.1s  ──────────────────────────────────────────────────────────────────
[NAS/SM] PDU 会话建立（用户触发打开浏览器）
         UE → AMF：PDU Session Establishment Request
                    （DNN="internet", PDU Type=IPv6）
         AMF → SMF：Nsmf_PDUSession_CreateSMContext
         SMF → UDM：获取签约数据（含用户面安全策略）
         SMF → PCF：获取 QoS 策略（5QI=9，Best Effort）
         SMF → UPF：N4 建立转发规则，UPF 分配 IPv6 前缀
         SMF → AMF：N2 SM Info（DRB 配置 + 安全策略）
                     + NAS PDU Session Establishment Accept（含 IPv6 前缀）

T+1.3s  ──────────────────────────────────────────────────────────────────
[RRC 层] DRB 建立
         gNB → UE：RRCReconfiguration（包含 DRB 配置：SDAP/PDCP/RLC/MAC）
         UE → gNB：RRCReconfigurationComplete
         gNB → AMF：N2 PDU Session Resource Setup Response
         → 用户面 GTP-U 隧道建立完成
         UE：IPv6 地址分配完成，网络接口就绪

T+1.5s  ──────────────────────────────────────────────────────────────────
[用户面] HTTP 数据传输
         浏览器发起 DNS 查询 → HTTP GET 请求
         UE → SDAP（QoS 流映射）→ PDCP（加密）→ RLC → MAC（调度）→ PHY
         → gNB → GTP-U（N3 隧道）→ UPF → Internet → Web 服务器
         服务器响应 → 反方向传回 → 浏览器显示页面

T+持续  ──────────────────────────────────────────────────────────────────
[MAC/PHY] AMC 闭环持续工作
          UE 每帧测量 RSRP → 计算 CQI → 通过 PUCCH 上报
          gNB 根据 CQI 调整下行 MCS（自适应调制编码）
          保证在链路质量波动时，吞吐量最大化，BLER 维持目标值
```

---

### 5.1 用一张表格对应 NTN 测试项

将上面的开机历险对应到具体测试项，帮助理解"测试的是历险的哪一段"：

| 历险阶段 | 核心协议 | 对应测试项 |
|---------|---------|-----------|
| PHY 搜网同步 | PSS/SSS/PBCH | 6.1.1 / 6.1.2 |
| 接收灵敏度 | PUSCH/PUCCH | 6.1.10 / 6.1.11 |
| AMC 闭环 | DCI / CQI / MCS | 6.1.3 / 6.1.4 |
| 多用户调度 | MAC 调度器 | 6.1.5 / 6.1.6 |
| RACH 随机接入 | Msg1～Msg4 | 6.1.13 / 6.1.14 |
| RRC 重建 | SRB1 重建 | 6.1.7 |
| NAS 注册（SUCI/GUTI）| 5GMM | 6.1.20 / 6.1.22 / 6.1.23 |
| AKA 认证 | 5G AKA | 6.1.21 |
| NAS 安全上下文 | SecurityModeCommand | 6.1.16 / 6.1.17 / 6.1.18 / 6.1.19 |
| 卫星接入签约 | satAccessEnabled | 6.1.24 / 6.1.25 |
| 注册更新 | T3512 / TAU 门限 | 6.1.8 / 6.1.9 |
| PDU 会话建立 | 5GSM | 6.1.27 |
| PDU 会话修改/释放 | 5GSM | 6.1.28 / 6.1.29 / 6.1.30 |
| CM-IDLE 业务请求 | ServiceRequest | 6.1.26 / 6.1.31（寻呼）|
| 数据业务 | GTP-U / AMC | 6.1.32 / 6.1.33 / 6.1.15 |
| VoNR / 短信 | IMS / SIP / MAP | 6.1.34 ～ 6.1.37 |
| 动态星历接入 | NTN 预补偿 | 6.1.41 / 6.1.42 |
| 大规模并发 | MAC 调度 / 性能 | 6.1.43 / 6.1.44 |

---

## <a id="appendix"></a>附录：关键术语速查与 NTN 映射

### A. 缩写速查

| 缩写 | 全称 | 一句话解释 |
|------|------|-----------|
| AMF | Access and Mobility Management Function | 核心网控制面锚点，处理注册和移动性 |
| SMF | Session Management Function | 管理 PDU 会话和 IP 分配 |
| UPF | User Plane Function | 用户面数据转发"路由器" |
| UDM | Unified Data Management | 用户签约数据库 |
| AUSF | Authentication Server Function | 归属网认证服务器 |
| PCF | Policy Control Function | QoS 和安全策略决策者 |
| NAS | Non-Access Stratum | 核心网与 UE 的直接对话协议 |
| RRC | Radio Resource Control | 基站与 UE 的无线资源管理协议 |
| NGAP | NG Application Protocol | gNB ↔ AMF N2 接口协议 |
| PFCP | Packet Forwarding Control Protocol | SMF ↔ UPF N4 接口协议 |
| SRB | Signaling Radio Bearer | 承载 RRC/NAS 信令的无线链路 |
| DRB | Data Radio Bearer | 承载用户数据的无线链路 |
| SUPI | Subscription Permanent Identifier | 5G 永久标识（≈IMSI） |
| SUCI | Subscription Concealed Identifier | 加密的 SUPI，空口用 |
| GUTI | Globally Unique Temporary Identifier | 网络分配的临时标识 |
| PRACH | Physical Random Access Channel | 随机接入物理信道（Msg1） |
| RAR | Random Access Response | 随机接入响应（Msg2） |
| MCS | Modulation and Coding Scheme | 调制与编码方案索引 |
| CQI | Channel Quality Indicator | UE 上报的信道质量指示 |
| RSRP | Reference Signal Received Power | 参考信号接收功率（dBm） |
| HARQ | Hybrid Automatic Repeat reQuest | 混合自动重传请求 |
| RLF | Radio Link Failure | 无线链路失败 |
| TA | Timing Advance | 定时提前量 |
| SIB19 | System Information Block 19 | NTN 专属 SIB，携带星历辅助信息 |
| ANID | Access Network Identifier | NTN 接入网标识（LEO=2）|
| TAU | Tracking Area Update | 跟踪区更新（NTN 中转为距离触发）|
| 5QI | 5G QoS Identifier | QoS 流标识符（如 5QI=1语音，9=数据）|

### B. NTN 与 TN 核心差异速查

| 维度 | 地面 TN | 卫星 NTN |
|------|---------|---------|
| 单程时延 | 0.1～5 ms | 4～20 ms |
| 频偏 | < 1 kHz | 可达 40+ kHz |
| 路损 | 80～120 dB | 140～160 dB |
| TA 管理 | gNB 发送 TA 命令 | UE 预补偿 + 残差 TA |
| HARQ | 通常开启（4 进程） | 通常关闭（改用 RLC ARQ）|
| 移动性触发 | TA List 边界 | 距离 > TAU 门限 |
| 寻呼单元 | TA（跟踪区）| 波位列表（PagingGroupList）|
| SIB | SIB1～SIB12 | SIB1～SIB12 + **SIB19** |
| TAC | 地理区域码 | **固定为 0x000000** |
| 签约验证 | 普通签约检查 | 额外检查 **satAccessEnabled** |

---

*文档版本：v1.0 | 最后更新：2026-05*  
*归属项目：5g-comm-notes / docs / 5g-fundamentals-primer.md*
