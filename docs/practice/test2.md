# 5G NTN Sub6G 卫星链路测试全景指南

> **适用场景：** 内场实验室星载基带 + 信道模拟器 + 地面核心网组网测试  
> **覆盖项目：** 6.1.1 ～ 6.1.45，共 45 个必选测试项  
> **知识前提：** 具备 5G NR 协议栈基础（物理层 / RRC / NAS），了解基本网络架构

---

## 目录

1. [第一部分：测试编排逻辑与全景图](#part1)
2. [第二部分：卫星(NTN)测试 vs 地面(TN)测试的核心差异](#part2)
3. [第三部分：抓包点与 Log 分析指南](#part3)
4. [第四部分：核心模块测试拆解](#part4)
   - [模块 A：物理层与空口同步](#moduleA)
   - [模块 B：无线接入层（MAC/RRC）](#moduleB)
   - [模块 C：NAS 注册与安全体系](#moduleC)
   - [模块 D：会话管理与核心网业务](#moduleD)
   - [模块 E：动态星历与系统性能](#moduleE)
   - [模块 F：漫游与自动化](#moduleF)

---

## <a id="part1"></a>第一部分：测试编排逻辑与全景图

### 1.1 整体编排哲学——"从底向上，从静到动"

这 45 个测试项目并非随机堆砌，而是严格按照 **协议栈层次** × **复杂度递进** 的二维矩阵编排，可以概括为以下五个层次：

```
Layer 5  ·  动态星历 + 多用户并发 + 漫游            (6.1.38–6.1.45)
            ↑ 把所有功能拉到"动态"和"大规模"场景下验证
Layer 4  ·  端到端全链路业务（FTP/HTTP/VoNR/SMS）   (6.1.32–6.1.37)
            ↑ 确认每一种业务类型都能在卫星链路上跑通
Layer 3  ·  会话管理 & 核心网控制面               (6.1.26–6.1.31)
            ↑ 验证 PDU 会话的建立/修改/释放完整生命周期
Layer 2  ·  NAS 注册 & 安全体系                   (6.1.8–6.1.25)
            ↑ 确保身份认证、加密、注册状态机在卫星场景正确运作
Layer 1  ·  物理层 & RRC 接入                    (6.1.1–6.1.7 & 6.1.10–6.1.15)
            ↑ 最底层：能否在大时延/大频偏下正确同步、调制、接入
```

> **关键思路：** 上层功能的正确性以下层功能为前提。如果物理层同步失败（6.1.2），所有上层测试都无从谈起。这也是测试时应当**严格按编号顺序推进**的原因。

---

### 1.2 归类结构树

```
Sub6G 用户链路测试 (6.1.x)
│
├── A. 物理层与空口同步 [静态星历]
│   ├── 6.1.1  系统消息广播 (MIB/SIB 解析)
│   ├── 6.1.2  星地时频同步 (大时延+大频偏接入)
│   ├── 6.1.10 PUSCH 接收灵敏度
│   └── 6.1.11 PUCCH 接收灵敏度
│
├── B. 无线接入层 MAC/RRC [静态星历]
│   ├── B1. 自适应调制编码 (AMC)
│   │   ├── 6.1.3  下行 AMC (PDSCH MCS 遍历)
│   │   └── 6.1.4  上行 AMC (PUSCH MCS 遍历)
│   ├── B2. 动态调度
│   │   ├── 6.1.5  下行动态调度 (多用户 PRB 分配)
│   │   └── 6.1.6  上行动态调度
│   ├── B3. RRC 连接管理
│   │   └── 6.1.7  RRC 连接重建
│   └── B4. 小区性能基准
│       ├── 6.1.12 小区容量 (上下行峰值速率)
│       ├── 6.1.13 接入时延 (从 MIB 到注册完成)
│       ├── 6.1.14 接入成功率 (按 RSRP/SINR 分区间)
│       └── 6.1.15 业务时延 (Ping RTT)
│
├── C. NAS 注册与安全体系 [静态星历]
│   ├── C1. NAS 注册机制
│   │   ├── 6.1.8  周期性注册更新 (T3512)
│   │   ├── 6.1.9  移动性注册更新
│   │   ├── 6.1.20 基于 SUCI 的初始注册
│   │   ├── 6.1.22 基于 5G-GUTI 的初始注册
│   │   ├── 6.1.23 用户隐匿标识符 (SUCI/GUTI 切换)
│   │   ├── 6.1.24 卫星终端注册准入 (satAccessEnabled=1)
│   │   └── 6.1.25 未签约用户注册拒绝
│   └── C2. 安全体系
│       ├── 6.1.16 AS 层信令安全 (128-NIA1/NEA1)
│       ├── 6.1.17 用户面完整性保护策略下发
│       ├── 6.1.18 用户面机密性保护
│       ├── 6.1.19 NAS 安全上下文建立
│       └── 6.1.21 5G AKA 认证
│
├── D. 会话管理与核心网业务 [静态星历]
│   ├── D1. 基础会话控制
│   │   ├── 6.1.26 UE 发起业务请求 (CM-IDLE → CONNECTED)
│   │   ├── 6.1.27 PDU 会话建立 (IPv6)
│   │   ├── 6.1.28 UE 请求 PDU 会话释放
│   │   ├── 6.1.29 PDU 会话修改
│   │   └── 6.1.30 网络请求 PDU 会话释放
│   ├── D2. 寻呼
│   │   └── 6.1.31 基于波位的寻呼功能
│   └── D3. 端到端业务
│       ├── 6.1.32 FTP 上传/下载
│       ├── 6.1.33 HTTP 网页浏览
│       ├── 6.1.34 VoNR 语音业务
│       ├── 6.1.35 ViNR 视频业务
│       ├── 6.1.36 IP 短信 MO
│       └── 6.1.37 IP 短信 MT
│
├── E. 动态星历与系统级性能 [动态星历]
│   ├── 6.1.41 动态星历下接入成功率
│   ├── 6.1.42 动态星历下速率测试
│   ├── 6.1.43 多用户随机接入平均时延 (≥1998 UE)
│   └── 6.1.44 多用户吞吐量 (DL-L1-Throughput)
│
└── F. 漫游与自动化 [特殊场景]
    ├── 6.1.38 漫游用户准入控制
    ├── 6.1.39 卫星用户漫出到地面运营商
    ├── 6.1.40 地面用户漫入卫星网络
    └── 6.1.45 测试终端与自动化系统接口
```

---

### 1.3 层级汇总表

| 模块 | 测试项编号 | 项目数 | 核心验证对象 | 星历类型 |
|------|-----------|--------|-------------|---------|
| A 物理层与同步 | 6.1.1/2/10/11 | 4 | 大时延/频偏下同步与灵敏度 | 静态 |
| B MAC/RRC 接入 | 6.1.3–7, 12–15 | 9 | AMC、调度、RRC 状态机 | 静态 |
| C NAS 注册与安全 | 6.1.8–9, 16–25 | 12 | 注册机制、鉴权、加密 | 静态 |
| D 会话管理与业务 | 6.1.26–37 | 12 | PDU 生命周期、VoNR、数据业务 | 静态 |
| E 动态星历与性能 | 6.1.41–44 | 4 | 动态场景稳定性与峰值性能 | **动态** |
| F 漫游与自动化 | 6.1.38–40, 45 | 4 | 跨网漫游、自动化测试 | 静态/动态 |

---

## <a id="part2"></a>第二部分：卫星(NTN)测试 vs 地面(TN)测试的核心差异

> 如果你有 4G/5G 地面网络测试经验，以下是你在 NTN 场景必须重新建立的认知。

### 2.1 大时延——颠覆一切定时关系

| 参数 | 地面 5G (TN) | LEO 卫星 (NTN) |
|------|------------|--------------|
| 单程时延 | 0.1 ～ 5 ms | **4 ～ 20 ms**（约 600～2000 km 轨道） |
| 往返时延 (RTT) | < 10 ms | **8 ～ 50 ms** |
| HARQ 往返时间 | 8 ms (N=4) | 需要 K-offset 补偿，可达数十 ms |

**实验室应对：**
- 信道模拟器注入 `Delay` 参数（单位：ns），在本报告中，远点约配置 **2328746 ns（≈2.33 ms 单程）**，近点约配置 **1732109 ns（≈1.73 ms 单程）**。
- 基带侧必须配置 **NTN-TA（定时提前）** 和相应的 **K-offset** 参数，使 HARQ/调度定时关系在大时延下仍然闭合。
- **暗坑：** 忘记配置 K-offset 会导致 ACK/NACK 对应关系错乱，UE 反复重传或 RLF。

---

### 2.2 大频偏——多普勒效应的量级

LEO 卫星相对地面用户的最大径向速度可达 **7 km/s**，在 Sub6G 频段（如 2 GHz 附近）产生的多普勒频偏可高达：

```
f_doppler = v/c × f_carrier = 7000/3×10⁸ × 2×10⁹ ≈ 46 kHz
```

本报告中远点配置 **Doppler = 34414.99 Hz（≈34 kHz）**，近点约 **7667 Hz**，均在此范围内。

**实验室应对：**
- 信道模拟器注入 `Doppler (Hz)` 参数，模拟上下行不对称的多普勒偏移（上下行频偏不同，因为上下行发射点不同）。
- UE 和基带必须支持 **NTN 频偏预补偿**（3GPP R17 新增），基于 GNSS 位置和星历预测多普勒值并提前补偿。
- **暗坑：** TN 测试中频偏在 kHz 级别，通常不成问题；NTN 场景下若补偿逻辑存在 Bug，UE 将无法正确解调 PDSCH，表现为 MCS 持续降档至 QPSK 且 BLER 居高不下。

---

### 2.3 星历文件——NTN 测试最核心的配置输入

**什么是星历（Ephemeris）？**
星历是描述卫星轨道运动的一组参数（位置、速度、时间等），基带和 UE 依据星历计算当前时延/频偏并进行预补偿。

**两种模式：**

| 模式 | 配置方式 | 适用测试 | 特点 |
|------|---------|---------|------|
| **静态定点星历** | 手动配置固定 Delay + Doppler | 6.1.1 ～ 6.1.37 | 简单可复现，但不模拟卫星运动 |
| **动态星历** | 从真实星历文件生成时频偏曲线，导入信道模拟器播放 | 6.1.41 ～ 6.1.44 | 模拟真实卫星过境场景 |

**动态星历的操作流程：**
```
1. 获取卫星有效弧段内的 TLE/精密星历数据
2. 用配套工具（仿真软件）生成 时延曲线文件 + 频偏曲线文件 + 路损曲线文件
3. 将上述文件导入信道模拟器
4. 基带和信道模拟器从同一 GNSS/PTP 服务器获取授时（时钟同源！）
5. 在约定时刻同步触发星历文件播放
```

> **暗坑（关键！）：** 若基带时钟与信道模拟器时钟不同源，播放过程中时延/频偏的变化将与基带的预期不同步，导致解调性能急剧恶化，表现为 BLER 突然飙升至 100%。

---

### 2.4 链路衰减（路损）的动态调节

**NTN 路损的量级：**
LEO 卫星 Sub6G 链路的自由空间路损约为：
```
FSPL = 20×log10(d) + 20×log10(f) + 92.45 dB
≈ 20×log10(1000 km) + 20×log10(2 GHz) + 92.45 ≈ 159 dB
```

相比之下，地面 5G 基站距离 100m 时路损约 **80～100 dB**，差距约 **60 dB**。

**实验室应对：**
- 信道模拟器注入对应路损，结合可调衰减器，将终端射频接收功率调整至目标 RSRP 范围（如 -90 ～ -125 dBm）。
- AMC 测试（6.1.3/6.1.4）正是通过**逐步增大衰减**，模拟 UE 从近点移动到远点，观察 MCS 随 RSRP 降低而降档。
- **暗坑：** 调节衰减时步长过大（如一次调 10 dB 以上），可能导致 MCS 跳变过快，错过中间状态的记录窗口。建议步长 ≤ 3 dB。

---

### 2.5 NTN 特有的协议字段——必须在抓包中验证

以下字段是 NTN 场景新增（3GPP R17）的，地面测试中**完全看不到**，NTN 测试的核心价值在于验证它们：

| 字段 | 位置 | 含义 |
|------|------|------|
| `ANID (Access Network ID)` | NG Setup Request、Initial UE Message | 标识卫星接入网类型（RAT=LEO=2） |
| `TAC = 0x000000` | ULI（User Location Info）| 卫星小区中 TAC 全为 0（无地面位置概念） |
| `satAccessEnabled` | UDM 签约数据 | 用户是否开通卫星接入服务 |
| `TAU 门限 (TAU Distance Threshold)` | Registration Accept | 核心网下发给 UE 的移动性触发门限（取代地面的 TA List） |
| `satellite access setting = 1` | Registration Request UE usage setting IE | 终端声明自身具备卫星接入能力 |

---

## <a id="part3"></a>第三部分：抓包点与 Log 分析指南

### 3.1 测试环境中的抓包架构

```
                     ┌─────────────────────────────────────────┐
                     │            测试拓扑（逻辑视图）             │
                     └─────────────────────────────────────────┘

  [UE 终端]           [信道模拟器]         [星载基带 gNB]        [地面核心网 5GC]
  终端侧 Log    ←空口→   模拟传输信道   ←RF→   基带侧 LMT/抓包  ←N2/N3→  核心网侧 Wireshark
  QXDM/AT指令          （不抓包）              CLI / 厂家工具       Wireshark (NGAP/NAS)

  ↑                                          ↑                    ↑
  抓包点 1                                  抓包点 2             抓包点 3
```

---

### 3.2 各抓包点详解

#### 抓包点 1：终端侧（UE）

| 工具 | 典型平台 | 主要用途 |
|------|---------|---------|
| **QXDM / QCAT** | 高通平台终端 | 查看物理层 Log（MIB/SIB解析、DCI、CSI-RS、BLER） |
| **AT 指令 + 串口** | 通用 | 触发特定流程（如 `AT+C5GQOS`、`AT+CGCMOD` 触发 PDU 修改） |
| **终端厂家调试工具** | 定制终端 | RRC 状态、NAS 消息、测量报告 |

**重点观测字段：**
```
物理层：  RSRP / SNR / MCS / BLER / RB 数 / CQI index
RRC层：   RRCSetup → RRCSetupComplete → RRCReconfiguration → RRCReconfigurationComplete
          RRCReestablishmentRequest → RRCReestablishment → RRCReestablishmentComplete
NAS层：   Registration Request / Registration Accept / Authentication Request / SecurityModeCommand
          PDU Session Establishment Request / Accept
特殊字段：MIB 中 subCarrierSpacingCommon, SIB1 中 cellBarred
          SIB19（NTN 专属 SIB，包含星历辅助信息）
```

---

#### 抓包点 2：基带侧（gNB）

| 工具 | 用途 |
|------|------|
| **厂家 LMT（本地维护终端）** | 查看小区状态、调度日志、告警、性能计数器 |
| **CLI 命令行接口** | 查询当前配置（NRARFCN、PCI、带宽等） |
| **基带侧日志文件** | 空口消息 Log（RRC / MAC / PHY 层调度信息） |

**重点观测字段：**
```
调度信息：  每个 UE 分配的 PRB 数、MCS、BLER、HARQ 重传次数
安全信息：  SecurityModeCommand 中的算法 IE（确认是 128-NIA1/128-NEA1）
性能计数：  MAC.NbrTbUl/Dl、RRC.AttConnEstab、RRC.SuccConnEstab
OMC 接口：  通过 OMC 界面验证参数一致性（gNBId、NRARFCNDL、PhyCellID 等）
```

---

#### 抓包点 3：核心网侧（5GC）

| 工具 | 接口 | 层协议 |
|------|------|-------|
| **Wireshark** | N2（gNB ↔ AMF） | NGAP（含 NAS 消息封装） |
| **Wireshark** | N11（AMF ↔ SMF）、N7（SMF ↔ PCF） | HTTP/2（服务化接口） |
| **Wireshark** | N4（SMF ↔ UPF） | PFCP |
| **核心网厂家工具** | 用户跟踪 / 信令跟踪 | 全流程 NAS 消息 |

**重点观测字段：**
```
NGAP：    NG Setup Request（含 ANID List, TAC=0）
          Initial UE Message（含 ANID）
          Downlink NAS Transport / Uplink NAS Transport
NAS：     Registration Request（Registration Type, UE标识 SUCI/GUTI, satellite access setting）
          Registration Accept（5G-GUTI, TAU 门限）
          Authentication Request/Response（AKA 参数）
          Security Mode Command/Complete
          PDU Session Establishment Request/Accept
SMF/PCF： 用户面安全策略（IntegrityProtection=Required, Confidentiality=Required）
UDM：     Nudm_SDM_Get 响应中 satAccessEnabled 字段
```

---

### 3.3 判断"流程成功"的通用逻辑

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      "成功"判据速查表                                      │
├─────────────────────┬───────────────────────────────────────────────────┤
│ 测试场景             │ 成功的标志信令/Log                                  │
├─────────────────────┼───────────────────────────────────────────────────┤
│ 系统消息广播         │ UE Log: SIB1/SIB19 解析完成，无 decode failure       │
│ 时频同步 / 初始接入  │ UE Log: RRCSetupComplete → Registration Accept       │
│ AMC 遍历            │ 基带调度 Log: MCS 从 28(64QAM)→14(16QAM)→6(QPSK)   │
│ RRC 重建            │ UE Log: RRC state = RRC_CONNECTED (重建后)           │
│ 周期性注册更新       │ NAS Log: Registration Type = periodic updating       │
│ 初始注册 (SUCI)     │ NGAP: UE 标识字段 = SUCI，后收到 Registration Accept  │
│ AKA 认证            │ NAS: Auth Request → Auth Response（含 RES*）成功      │
│ NAS 安全建立        │ NAS: SecurityModeCommand → SecurityModeComplete       │
│ PDU 会话建立        │ NAS: PDU Session Establishment Accept + IPv6 地址分配 │
│ 寻呼               │ 空口: Paging → ServiceRequest → CM-CONNECTED          │
│ VoNR 语音           │ SIP: INVITE → 180 Ringing → 200 OK                   │
│ 短信 MO             │ MAP: MO-FORWARD-SHORT-MESSAGE-REQ → Submit Report     │
│ OMC 连通性          │ Ping RTT < 阈值，无丢包                               │
└─────────────────────┴───────────────────────────────────────────────────┘
```

---

## <a id="part4"></a>第四部分：核心模块测试拆解

---

### <a id="moduleA"></a>模块 A：物理层与空口同步

**覆盖测试项：** 6.1.1 / 6.1.2 / 6.1.10 / 6.1.11

---

#### A.1 考察内容与技术背景

这是整个测试序列的**地基**。5G NTN 与地面 5G 最根本的区别在于，UE 在搜索并驻留小区的过程中，面临的信道条件完全不同：

**① 系统消息广播（6.1.1）**  
UE 开机后的第一步是同步并读取 MIB（主信息块）和 SIB（系统信息块）。NTN 场景新增 **SIB19**，其中携带卫星辅助星历信息，使 UE 能在搜网前预先计算频偏补偿量，大幅提升接入速度。

```
MIB  → 携带 SFN(系统帧号), SCS(子载波间距), CORESET#0 配置
SIB1 → 携带 cellBarred, 接入类别限制, PLMN 列表
SIB1-bis → NTN 卫星扩展信息
SIB19 → 星历辅助信息（位置、速度、有效时间窗口）
```

**② 星地时频同步（6.1.2）**  
在 NTN 场景，UE 同步的核心挑战在于：
- 时延不断变化 → TA（定时提前量）必须动态调整
- 频率不断变化 → 频偏补偿必须精确到 Hz 级

3GPP R17 规定，UE 应基于 GNSS 定位和星历信息，**提前预补偿**大部分时延和频偏，剩余误差再由基带的随机接入响应（RAR）中的 TA 命令进行精细调整。

**③ 接收灵敏度（6.1.10 / 6.1.11）**  
验证基带在星地链路的低 RSRP 条件下（最低达 -120 dBm）仍能正确解调 PUSCH/PUCCH。这是验证硬件射频性能的关键，直接决定系统覆盖范围。

---

#### A.2 通用操作流程

```
Step 1：配置信道模拟器
        ├── 输入目标 Delay(ns) 和 Doppler(Hz)（来自星历计算工具）
        └── 配置对应路损（dB）

Step 2：配置基带
        ├── 建立 Sub6G 小区（NRARFCNDL/UL, 带宽 20MHz, FDD）
        ├── 广播 MIB / SIB1 / SIB1-bis / SIB19
        └── 确认 K-offset 和 NTN 定时参数已配置

Step 3：UE 开机 → 观察搜网流程
        ├── 终端 Log: 确认 MIB decode 成功（SFN 正确）
        ├── 确认 SIB1 / SIB19 解析成功
        └── 确认 UE 发起 PRACH（随机接入序列）

Step 4：（灵敏度测试）逐步调节衰减
        └── 以 5 dB 步长从 -60 dBm 降至 -120 dBm，记录 BLER
```

---

#### A.3 观测节点与预期判据

| 观测位置 | 观测内容 | 预期结果 |
|---------|---------|---------|
| UE Log | MIB 解码 Log | `SFN = xxx，解码成功，无 decode failure` |
| UE Log | SIB19 内容 | 包含卫星位置/速度/有效时间窗口字段 |
| UE Log | RSRP / SNR | 远点 RSRP ≈ -116 dBm，SNR ≈ 10 dB |
| 基带 LMT | PRACH 检测 | 收到 UE 的 PRACH Preamble |
| 基带 LMT | PUSCH BLER | 在指定 MCS 下，BLER ≤ 10%（PUSCH）或 ≤ 1%（PUCCH）时的 RSRP 即为灵敏度门限 |

---

### <a id="moduleB"></a>模块 B：无线接入层（MAC/RRC）

**覆盖测试项：** 6.1.3 / 6.1.4 / 6.1.5 / 6.1.6 / 6.1.7 / 6.1.12 / 6.1.13 / 6.1.14 / 6.1.15

---

#### B.1 AMC 测试（6.1.3 / 6.1.4）

**技术背景：**  
AMC（自适应调制与编码）是 5G 提升频谱效率的核心机制。UE 通过测量下行信道质量（CQI）上报给基带，基带据此选择最优 MCS（调制方式 + 编码速率）：

```
信道条件好 → 高阶调制 → 64QAM (MCS 28/27) → 高速率
信道条件差 → 低阶调制 → QPSK  (MCS 6/4)   → 低速率，但更鲁棒
```

**NTN 特殊性：** 大时延导致 CQI 上报的时效性比 TN 差（CQI 是基于历史信道状态，但信道变化更快），因此 NTN 中 AMC 的跟踪精度比地面差，BLER 控制目标通常设为 **10%**（而非 TN 的更低值）。

**关键观测指标（以下行 AMC 为例）：**

| MCS 等级 | 调制方式 | 目标 RSRP 范围 | 预期 MAC 吞吐量（20MHz） |
|----------|---------|--------------|----------------------|
| MCS 28   | 64QAM   | ≥ -100 dBm   | ≈ 56 Mbps           |
| MCS 14   | 16QAM   | -110 ～ -120 dBm | ≈ 18 Mbps        |
| MCS 6    | QPSK    | ≤ -120 dBm   | ≈ 8 Mbps            |

> **操作要点：** 通过调节衰减器（建议步长 ≤ 3 dB），观察 MCS 随 RSRP 降低而阶梯式下降，同时记录 CQI index（UE 上报）、PRB 数、MAC/PHY 层吞吐量和 BLER。

---

#### B.2 动态调度测试（6.1.5 / 6.1.6）

**技术背景：**  
动态调度验证基带能否在多用户场景下，按照实时信道反馈和业务需求，在帧级/时隙级**灵活**分配频时资源（PRB）。

**观测关键：**
- 两个 UE 同时有业务时，基带调度日志应显示 PRB 在不同时隙被分配给不同 UE（而非固定分配）
- 上行调度需验证**非频率选择性**：即基带不依赖频率选择性增益（卫星场景信道频率域相关性较强，不适合频率选择性调度）

---

#### B.3 RRC 连接重建（6.1.7）

**技术背景：**  
RRC 重建是处理**无线链路失败（RLF）** 的机制。触发条件：UE 连续检测到 N310 次（通常 10 次）不同步指示（Out-of-Sync），且在定时器 T310 超时前未恢复同步。

**NTN 特殊性：** 卫星链路质量波动比地面剧烈（边缘覆盖时 RSRP 快速下降），RLF 更容易被触发，因此重建机制必须测试。

**触发方法：** 实验室中通过**快速增大衰减器输出**（如调至 70 dB）并叠加噪声（SNR 降至 10 dB 以下），人为触发 RLF。

**重建流程（信令序列）：**
```
RLF 触发
→ UE: RRCReestablishmentRequest (含 UE 标识 + cause)
→ gNB: RRCReestablishment  (含新配置)
→ UE: RRCReestablishmentComplete
→ gNB: RRCReconfiguration  (恢复 DRB)
→ UE: RRCReconfigurationComplete
→ 业务恢复
```

**观测判据：**
- UE Log 中 RRC 状态从 `RRC_IDLE`（或中间状态）恢复至 `RRC_CONNECTED`
- SRB1 重建成功（信令面连接恢复）
- DRB 恢复后业务（Ping/吞吐量）正常

---

#### B.4 小区性能基准测试（6.1.12 / 6.1.13 / 6.1.14 / 6.1.15）

这四项是性能**基准（Baseline）** 测试，结果直接作为系统性能指标的量化证据。

| 测试项 | 核心指标 | 要求 |
|--------|---------|------|
| 6.1.12 容量 | 远/近点 UDP 上下行峰值速率 | 满足设计值（如近点下行 ≥ 39 Mbps） |
| 6.1.13 接入时延 | 从 MIB 解码到注册完成的时间，连续 10 次均值 | **≤ 5 s** |
| 6.1.14 接入成功率 | 按 RSRP/SINR 区间，10 次接入的成功率 | SS-RSRP ≥ -90 dBm 时 **100%** |
| 6.1.15 业务时延 | Ping RTT（32B 和 1400B 各 100 次均值） | **≤ 50 ms** |

> **注意：** 6.1.15 的 RTT ≤ 50 ms 是指**射频直连**（信道模拟器时延仅模拟空口，不含真实卫星传播时延）。真实组网下的 RTT 将受星地传播时延（约 5～20 ms 单程）影响，RTT 将达 **10～40 ms** 额外增加。

---

### <a id="moduleC"></a>模块 C：NAS 注册与安全体系

**覆盖测试项：** 6.1.8 / 6.1.9 / 6.1.16 ～ 6.1.25

---

#### C.1 NAS 注册状态机（6.1.8 / 6.1.9 / 6.1.20 / 6.1.22 / 6.1.23 / 6.1.24 / 6.1.25）

**技术背景：**

5G NR 的 UE 在 NAS 层有两个并行的状态机：

```
注册状态（RM）：  RM-DEREGISTERED ←→ RM-REGISTERED
连接状态（CM）：  CM-IDLE ←→ CM-CONNECTED
```

**NTN 特有的注册机制——TAU 门限（TAU Distance Threshold）：**

地面 5G 通过 **TA List（跟踪区列表）** 判断是否需要发起移动性注册更新（UE 跨出 TA List 时触发）。但卫星场景中，小区覆盖范围随卫星运动而快速变化，传统 TA 概念失效。

3GPP R17 为 NTN 引入了**基于 GNSS 距离的 TAU 门限**：
- AMF 在 Registration Accept 中下发 **TAU 距离门限**（单位：km）
- UE 通过 GNSS 持续计算自身位置与注册时位置的距离
- 当距离**超过门限**时，UE 发起 `mobility registration updating`
- 距离未超过门限时，不发起更新（避免不必要的信令开销）

**各注册测试项对应的关键验证点：**

```
6.1.8  周期性注册：T3512 超时 → Registration Type = "periodic registration updating"
6.1.9  移动性注册：距离 > 门限 → Registration Type = "mobility registration updating"
                    距离 < 门限 → UE 不发起注册更新（负向验证）
6.1.20 SUCI注册：  首次注册 → UE 标识 = SUCI（加密的 IMSI）
6.1.22 GUTI注册：  再次注册 → UE 标识 = 5G-GUTI（已分配的临时标识）
6.1.23 标识切换：  开机(无GUTI) → SUCI; 重启(有GUTI) → GUTI → 获得新GUTI
6.1.24 合法卫星用户：satAccessEnabled=1 → 注册成功
6.1.25 未签约用户：satAccessEnabled=0 → Registration Reject
```

---

#### C.2 安全体系（6.1.16 ～ 6.1.19 / 6.1.21）

**技术背景：**

5G 安全体系分为两个层次：

```
┌─────────────────────────────────┐
│         NAS 层安全               │  ← AMF ↔ UE 之间
│  NAS 加密算法（NEA1/2/3）         │
│  NAS 完整性算法（NIA1/2/3）        │
├─────────────────────────────────┤
│         AS 层安全                │  ← gNB ↔ UE 之间（RRC + 用户面）
│  RRC 加密（128-NEA1）             │
│  RRC 完整性（128-NIA1）           │
│  用户面加密（SDAP/PDCP 层）       │
│  用户面完整性（可选）              │
└─────────────────────────────────┘
```

**5G AKA 认证流程（6.1.21）精解：**

```
UE → AMF：Registration Request（含 SUCI）
AMF → AUSF：Nausf_UEAuthentication_Authenticate Request
AUSF → UDM：获取认证向量（XRES*、AUTN、RAND、HXRES*）
AUSF → AMF：返回 RAND、AUTN、HXRES*
AMF → UE：Authentication Request（含 RAND、AUTN）
UE → AMF：Authentication Response（含 RES*）   ← UE 本地计算 RES*
AMF → AUSF：发送 RES*，AUSF 计算 HRES* 与 HXRES* 比对 ← 归属域认证（增强控制）
AUSF → AMF：认证成功，下发 KAMF（主密钥）
```

> **关键：** `HXRES*` 是 XRES* 的哈希值，由归属网（AUSF/UDM）持有。AMF（服务网）只需验证 HRES*（RES* 的哈希）。如果 AMF 被攻击者替换，攻击者拿不到真正的 XRES*，无法通过归属域验证——这就是"**增强的归属控制能力**"的安全意义。

**NAS 安全上下文建立（6.1.19）：**

```
AMF → UE：Security Mode Command（含 ngKSI, NAS加密算法, NAS完整性算法, 重放的UE安全能力）
           ↑ 仅做完整性保护，不加密
UE → AMF：Security Mode Complete
           ↑ 之后所有 NAS 消息同时做加密 + 完整性保护
```

**用户面安全策略（6.1.17 / 6.1.18）：**

SMF 通过 N2 接口将安全策略下发给 gNB，策略有三档：`NOT_NEEDED` / `PREFERRED` / `REQUIRED`。
- 本测试要求配置为 `REQUIRED`（必须），gNB 在 RRCReconfiguration 中将对应的保护 IE 设为 `enabled`。

---

### <a id="moduleD"></a>模块 D：会话管理与核心网业务

**覆盖测试项：** 6.1.26 ～ 6.1.37

---

#### D.1 PDU 会话生命周期（6.1.26 ～ 6.1.30）

**PDU 会话是 5G 用户面连接的基本单元**，每个 PDU 会话对应一个 DNN（数据网络名称，类似 APN）。

**完整生命周期信令流（以建立为例）：**

```
UE → gNB → AMF：PDU Session Establishment Request（NAS，含 DNN, PDU Type=IPv6）
AMF → SMF：Nsmf_PDUSession_CreateSMContext Request
SMF → UDM：获取 SM 签约数据（含用户面安全策略）
SMF → PCF：Session Management Policy Establishment
SMF → UPF：N4 Session Establishment（建立用户面转发规则）
SMF → AMF：N2 SM Info（含用户面安全策略）+ NAS PDU Session Establishment Accept
AMF → gNB：N2 PDU Session Request（触发 DRB 建立）
gNB → UE：RRCReconfiguration（含 DRB 配置）
UE → gNB：RRCReconfigurationComplete
gNB → AMF：N2 PDU Session Request Ack
UE：获得 IPv6 地址，开始数据传输
```

> **NTN 关键验证：** 整个流程中，N2 接口的 `Initial UE Message` 必须携带 `ANID` 字段，`ULI` 中的 `TAC = 0x000000`。

**各会话测试项的核心区别：**

| 测试项 | 触发方 | 核心信令 | 验证重点 |
|--------|--------|---------|---------|
| 6.1.26 业务请求 | UE（CM-IDLE → CONNECTED） | Service Request | TAC=0 in Initial UE Msg |
| 6.1.27 会话建立 | UE | PDU Session Establishment | IPv6 地址分配 |
| 6.1.28 UE释放 | UE | PDU Session Release Request | 释放后业务不通 |
| 6.1.29 会话修改 | UE（AT指令触发SMF/PCF） | PDU Session Modification | 承载不释放（第二次修改验证） |
| 6.1.30 网络释放 | PCF/SMF | N4 Session Release | PCF 触发流程正确 |

---

#### D.2 寻呼机制（6.1.31）

**NTN 寻呼的特殊性：**

地面 5G 中，基站根据 UE 所在 TA 发送寻呼。但卫星场景中，小区覆盖的波束（波位）是分配寻呼的基本单元。

AMF 在 N2 Paging 消息中携带：
- `ANID`：指定通过哪个接入网（LEO）寻呼
- `TAI`（TAC=0）：卫星场景的空 TAI
- **寻呼波位列表（PagingGroupList）**：指定在哪些 SSB 波束上发送寻呼

**判断寻呼成功：**
```
下行：网络侧 N2 Paging → 基带 Pcch（包含 UE 标识）→ UE 接收 Paging
上行：UE 发送 Service Request（NAS）→ CM-CONNECTED
```

---

#### D.3 端到端业务（6.1.32 ～ 6.1.37）

这些测试是对整个协议栈的**端到端验证**，每种业务类型对应不同的 QoS 配置：

| 业务 | DNN | 关键 QoS | 核心验证 |
|------|-----|---------|---------|
| FTP/HTTP | 数据 DNN | 5QI=9（Best Effort） | G-SMF 选择最优 G-UPF（位置感知路由） |
| VoNR（6.1.34） | IMS | 5QI=1（语音专有承载） | SIP: INVITE→Ringing→200OK |
| ViNR（6.1.35） | IMS | 5QI=1(语音)+5QI=2(视频)+5QI=5(信令) | pre-condition 流程，3 类承载同时建立 |
| SMS MO（6.1.36） | IMS | — | MAP消息中 ratType 信元（标识 NTN 接入） |
| SMS MT（6.1.37） | IMS | — | Delivery Report 携带 ratType 回传 |

**VoNR pre-condition 流程简解：**

pre-condition 是 IMS 语音建立的一种机制，确保在媒体流（RTP）实际开始传输前，双方的 QoS 资源已就绪：

```
主叫 INVITE（含 precondition 信元）
→ 被叫 183 Session Progress（含 QoS 状态）
→ 主叫 UPDATE（QoS 就绪确认）
→ 被叫 200 OK for UPDATE
→ 被叫振铃（180 Ringing）
→ 被叫接听（200 OK for INVITE）
→ 双向 RTP 语音流开始
```

---

### <a id="moduleE"></a>模块 E：动态星历与系统级性能

**覆盖测试项：** 6.1.41 / 6.1.42 / 6.1.43 / 6.1.44

---

#### E.1 考察内容与技术背景

前面所有模块（A～D）都是在**静态定点星历**下测试的——信道模拟器的时延和频偏是固定值，不随时间变化。

动态星历测试是**最接近真实在轨场景**的测试：卫星在过境过程中，时延和频偏持续变化，UE 和基带的预补偿算法必须**实时跟踪**这种变化。

**动态场景下，系统面临的新挑战：**

```
1. 时延斜率（Delay Rate）：单程时延每秒变化量，影响 TA 调整速率
2. 频偏斜率（Doppler Rate）：多普勒频率每秒变化量，影响频率跟踪环路
3. 仰角变化：卫星从地平线（低仰角）过境到星下点（高仰角）再到另一侧
   → 不同仰角对应不同路损、不同时延变化率
4. 时钟同源要求：基带和信道模拟器必须从同一 GNSS/PTP 时钟源同步
```

---

#### E.2 动态星历测试的操作流程

```
Step 1：获取星历数据
        └── 使用 TLE（两行轨道根数）或精密星历，截取卫星有效弧段
            （通常选择仰角 > 10° 的时间窗口，约 10～15 分钟）

Step 2：生成仿真文件
        └── 将星历数据导入仿真工具，生成：
            ├── time_delay.csv   （每秒一个时延值，单位 ns）
            ├── doppler.csv      （每秒一个频偏值，单位 Hz）
            └── path_loss.csv    （每秒一个路损值，单位 dB）

Step 3：系统授时同步
        ├── 信道模拟器从 GNSS/PTP 服务器同步
        ├── 星载基带从同一 GNSS/PTP 服务器同步
        └── 确认两者时钟偏差 < 1 μs

Step 4：同步触发
        └── 在约定的 UTC 时刻，基带和信道模拟器同时开始播放星历文件

Step 5：UE 接入与测试
        ├── UE 从预制星历（SIB19 或 AT 指令注入）获取辅助信息
        ├── UE 发起随机接入（PRACH）
        └── 接入成功后进行速率测试或统计接入时延
```

---

#### E.3 观测节点与预期判据

**6.1.41 接入成功率：**

| 指标 | 要求 |
|------|------|
| 连续 10 次接入成功率 | **100%** |
| 平均接入时延（MIB→RRCReconfigurationComplete） | 本报告实测均值 **2.45 s** |
| 每次接入的上下行 RSRP | 需记录（体现不同仰角下的链路质量变化） |

**6.1.42 速率测试（20MHz 带宽）：**

| 场景 | 方向 | MCS | 实测速率 |
|------|------|-----|---------|
| 近点（高仰角） | 上行 | 15 | 27 Mbps |
| 近点 | 下行 | 24 | 39 Mbps |
| 远点（低仰角） | 上行 | 8  | 13 Mbps |
| 远点 | 下行 | 24 | 20 Mbps |

**6.1.43 多用户接入时延（1998 UE 并发）：**
- 基站配置：max_mcs=28，max_rb=51，SSB=256，PDCCH=2符号
- 预期：平均接入时延 ≤ 5 s，实测 **3.069 s**，满足 P3 阶段（≥1800 UE）要求

**6.1.44 多用户吞吐量（100 UE 并发）：**
- 预期：DL-L1-Throughput ≥ 67 Mbps（最终目标），P3 阶段要求 ≥ 60.3 Mbps
- 实测：约 **63 Mbps**，满足 P3 阶段，最终目标待优化

---

### <a id="moduleF"></a>模块 F：漫游与自动化

**覆盖测试项：** 6.1.38 / 6.1.39 / 6.1.40 / 6.1.45

---

#### F.1 漫游测试（6.1.38 / 6.1.39 / 6.1.40）

**背景：** 卫星网络运营商（HPLMN）与地面移动运营商（VPLMN）之间需要支持漫游互通，这涉及跨网络的认证、签约查询和业务路由。

**三种漫游场景：**

```
6.1.38 漫游准入控制：
  SIM卡1（签约卫星接入）→ 核心网路由至模拟地面运营商核心网 → 注册成功
  SIM卡2（未签约）→ 拒绝注册
  验证重点：核心网能否根据 IMSI 归属地正确路由并做签约校验

6.1.39 卫星用户漫出（Home Routed）：
  卫星用户 → 通过地面运营商基站接入 → 信令路由至卫星核心网
  验证重点：跨运营商接口（N32/互联接口）消息流程符合规范

6.1.40 地面用户漫入：
  地面运营商用户 → 通过星载基站接入卫星网络
  验证重点：卫星核心网作为 VPLMN 正确处理漫游用户
```

---

#### F.2 自动化系统接口测试（6.1.45）

**背景：** 大规模卫星网络测试需要自动化能力，本项验证测试终端能否被自动化测试系统**远程无线控制**，完成接入 → 业务触发 → 日志收集 → 报告生成的完整自动化流程。

**验证路径：**
```
自动化系统 → 无线方式远程控制 UE → UE 接入卫星小区
→ UE 发起 UDP 上/下行业务 → 自动化系统收取日志 → 自动生成报告
```

---

## 附录：关键参数速查表

### A. 信道模拟器典型配置值（静态定点）

| 场景 | 下行时延 (ns) | 下行 Doppler (Hz) | 上行 Doppler (Hz) | 下行 RSRP | 上行 RSRP |
|------|-------------|-----------------|-----------------|----------|----------|
| 远点 | 2,328,746 | 34,414.99 | 34,414.99 | -116 dBm | -70.25 dBm |
| 近点 | 1,732,109 | 7,667.19  | 6,992.76  | -106 dBm | -58.71 dBm |

### B. NTN 协议关键字段核验清单

```
□ NG Setup Request 中携带 ANID List（RAT=LEO=2, TAC=0）
□ Initial UE Message 中携带 ANID，ULI.TAC = 0x000000
□ Registration Request 中 satellite access setting IE = 1
□ UDM 签约响应中 satAccessEnabled = 1（合法用户）或 0（拒绝用户）
□ Registration Accept 中包含 TAU 门限
□ SecurityModeCommand 中算法为 128-NIA1 / 128-NEA1
□ 用户面安全策略指示为 Required（完整性/机密性）
□ RRCReconfiguration 中用户面保护 IE = enabled
```

### C. 性能指标红线汇总

| 指标 | 要求 |
|------|------|
| 接入时延（10次均值） | **≤ 5 s** |
| 业务时延（Ping RTT） | **≤ 50 ms**（射频直连） |
| 初始接入成功率（SS-RSRP ≥ -90 dBm） | **100%** |
| 多用户接入时延（≥1800 UE） | **≤ 5 s** |
| DL-L1-Throughput（P3阶段，20MHz） | **≥ 60.3 Mbps** |
| PUSCH BLER 门限（灵敏度测试） | **≤ 10%** |
| PUCCH BLER 门限（灵敏度测试） | **≤ 1%** |

---

*文档版本：v1.0 | 最后更新：2026-05*  
*归属项目：5g-comm-notes / docs / ntn-sub6g-test-guide.md*
