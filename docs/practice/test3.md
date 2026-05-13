# 5G NTN Sub6G 系统级测试用例详解（6.1.1 ～ 6.1.45）

> **前置阅读：**
>
> - [5G 基础先导课](./5g-fundamentals-primer.md) — 理解协议栈与信令交互基础
> - [NTN 测试全景指南](./ntn-sub6g-test-guide.md) — 了解测试编排逻辑与 NTN 特殊性
>
> **文档说明：** 本文将 45 个测试项逐一转化为结构化技术说明，可作为实验室操作参考手册。
> 每条用例包含：测试目的、前置条件、信令流程、关键观测点、Pass 判据、常见失败分析。

---

## 快速导航

| 模块                                | 编号范围                        | 核心主题                  |
| ----------------------------------- | ------------------------------- | ------------------------- |
| [A. 物理层与同步](#moduleA)         | 6.1.1 / 6.1.2 / 6.1.10 / 6.1.11 | 广播、同步、灵敏度        |
| [B. MAC/RRC 接入与性能](#moduleB)   | 6.1.3–6.1.7 / 6.1.12–6.1.15     | AMC、调度、重建、性能基准 |
| [C. NAS 注册与安全](#moduleC)       | 6.1.8–6.1.9 / 6.1.16–6.1.25     | 注册状态机、AKA、加密     |
| [D. 会话管理与端到端业务](#moduleD) | 6.1.26–6.1.37                   | PDU 会话、VoNR、短信      |
| [E. 动态星历与系统性能](#moduleE)   | 6.1.41–6.1.44                   | 动态场景、大规模并发      |
| [F. 漫游与自动化](#moduleF)         | 6.1.38–6.1.40 / 6.1.45          | 跨网漫游、自动化接口      |

---

## <a id="moduleA"></a>模块 A：物理层与空口同步

---

### TC-6.1.1 系统消息广播测试

**测试目的**
验证星载基带在信道模拟器添加星历时延、频偏、路损的条件下，能够正确广播 MIB、SIB1、SIB1-bis 和 SIB19，且 UE 能完成全部系统消息的**解析与更新**。

**前置条件**

| 条件       | 要求                               |
| ---------- | ---------------------------------- |
| 组网       | 星载基带 + 信道模拟器 + Sub6G 终端 |
| 小区配置   | Sub6G FDD 小区已建立，广播配置完整 |
| 信道模拟器 | 已配置静态定点星历参数（见下表）   |
| 终端       | 处于关机或已去注册状态             |

**信道模拟器配置（近远点各一组）**

```
近点：Delay = 1732109 ns，Doppler = 7667 Hz，路损 = 对应近点值
远点：Delay = 2710574 ns，Doppler = 15000 Hz，路损 = 对应远点值
```

**核心测试步骤**

```
1. 配置信道模拟器（注入时延、频偏、路损参数）
2. 确认基带已广播 MIB / SIB1 / SIB1-bis / SIB19
3. UE 开机，在信道模拟器添加参数的条件下搜网
4. 在终端侧 Log 中确认各广播消息解码结果
5. 触发基带更新 SIB 内容（如修改 SIB1 中某字段）
6. 确认 UE 接收到 SI Change 通知后重新读取并更新 SIB
7. 切换近点/远点星历参数，重复步骤 3～6
```

**关键信令观测点**

| 观测位置 | 观测内容       | 关键参数                                                     |
| -------- | -------------- | ------------------------------------------------------------ |
| UE Log   | MIB 解码       | `systemFrameNumber`、`subCarrierSpacingCommon`、无 decode failure |
| UE Log   | SIB1 解码      | `cellBarred = notBarred`、PLMN 列表正确                      |
| UE Log   | **SIB19 解码** | 包含卫星位置/速度/有效时间窗口字段（NTN 专属）               |
| UE Log   | SIB 更新       | 收到 `systemInfoModification` 指示后，Log 显示重新读取 SIB   |
| 基带 Log | 广播状态       | SIB 调度周期正常，无广播中断告警                             |

**预期结果与 Pass 判据**

```
✅ PASS 条件：
   ① 近点和远点星历条件下，MIB 均解码成功（SFN 正确无误）
   ② SIB1 解码成功，cellBarred = notBarred
   ③ SIB19 解码成功，星历字段完整
   ④ SIB 更新功能验证：UE 收到更新通知后，Log 显示重新解析新内容

❌ FAIL 条件：
   任何一条 SIB 持续 decode failure，或 SIB 更新后 UE 未刷新内容
```

**常见失败原因分析**

```
① SIB19 解码失败
   原因：基带未配置 SIB19 广播，或 UE 版本不支持 R17 NTN SIB19 格式
   排查：检查基带 SIB 广播配置列表；确认 UE 固件版本

② 远点条件下 MIB 解码失败
   原因：大频偏（>15 kHz）超出 UE 初始频率搜索窗口，UE 无法与小区同步
   排查：确认 UE 是否支持 NTN 频偏预补偿；检查 GNSS 辅助信息是否注入

③ SIB 更新 UE 未响应
   原因：UE 处于 DRX 深度睡眠，错过 SI Change 寻呼
   排查：缩短 DRX 周期，或在 UE 活跃期间触发 SIB 更新
```

---

### TC-6.1.2 星地时频同步测试

**测试目的**
验证 Sub6G 终端在信道模拟器模拟的远点和近点星历（大时延 + 大频偏 + 路损）条件下，能够成功完成时频同步并接入网络，记录各场景下的链路质量参数。

**前置条件**

| 条件      | 要求                                              |
| --------- | ------------------------------------------------- |
| 星历参数  | 远点和近点各一组，独立验证                        |
| GNSS 辅助 | UE 具备 GNSS 定位能力，或通过 AT 指令注入辅助星历 |
| 基带配置  | K-offset、NTN-TA 预补偿参数已正确配置             |

**远点 / 近点信道参数**

```
远点（High Altitude / Low Elevation）：
  DL Delay  = 2328746 ns    DL Doppler = 34414.99 Hz
  UL Delay  = 2328746 ns    UL Doppler = 34414.99 Hz
  DL RSRP   ≈ -116 dBm      UL RSRP   ≈ -70.25 dBm
  DL SNR    ≈ 10 dB          UL SNR    ≈ 0.23 dB

近点（Low Altitude / High Elevation）：
  DL Delay  = 1732109 ns    DL Doppler = 7667.19 Hz
  UL Delay  = 1732109 ns    UL Doppler = 6992.76 Hz
  DL RSRP   ≈ -106 dBm      UL RSRP   ≈ -58.71 dBm
  DL SNR    ≈ 21 dB          UL SNR    ≈ 11.67 dB
```

**核心测试步骤**

```
1. 配置信道模拟器为远点参数
2. UE 开机 → 利用 GNSS / 预注入星历计算频偏补偿量
3. UE 执行 PSS/SSS 同步（含频偏预补偿）
4. 解码 MIB / SIB1 / SIB19
5. 发起随机接入（PRACH Msg1，含 TA 预补偿）
6. 接收 RAR（Msg2，含残差 TA 命令）
7. 完成 RRC 建立（Msg3 / Msg4）
8. 记录 DL/UL RSRP、SNR、MCS、接入时延
9. 切换近点参数，重复步骤 2～8
```

**关键信令观测点**

| 观测位置 | 观测内容              | 预期值（远点 / 近点）                       |
| -------- | --------------------- | ------------------------------------------- |
| UE Log   | PSS/SSS 检测成功      | 帧同步建立，SFN 正确                        |
| UE Log   | 频偏补偿值            | 接近配置的 Doppler 值（34415 Hz / 7667 Hz） |
| UE Log   | DL RSRP               | -116 dBm / -106 dBm                         |
| UE Log   | DL SNR                | 10 dB / 21 dB                               |
| 基带 Log | UL RSRP（基带侧测量） | -70.25 dBm / -58.71 dBm                     |
| 基带 Log | PRACH 检测            | 检测到 Preamble，RAR 发送成功               |
| 基带 Log | 残差 TA 值            | 接近 0（预补偿精确时）                      |
| 基带 Log | RRC_CONNECTED         | UE 进入连接态                               |

**预期结果与 Pass 判据**

```
✅ PASS 条件：
   ① 远点条件下 UE 成功入网（RRC_CONNECTED）
   ② 近点条件下 UE 成功入网（RRC_CONNECTED）
   ③ 入网后 DL/UL RSRP 与配置值偏差 < 3 dBm

❌ FAIL 条件：
   任一场景下 UE 无法完成随机接入（PRACH 超时），或 RSRP 异常偏差 > 5 dBm
```

**常见失败原因分析**

```
① 大频偏条件下 PRACH 检测失败
   原因：UE 频偏预补偿计算误差超出基带 PRACH 检测窗口（±X kHz）
   排查：确认 GNSS 定位精度；检查星历有效时间窗口是否过期

② 残差 TA 异常偏大（> 数十 μs）
   原因：UE 预补偿时延计算不准（星历误差或 GNSS 精度不足）
   排查：比对注入的星历参数与信道模拟器配置值

③ 远点 UE 入网后频繁掉线
   原因：UL SNR（0.23 dB）处于边缘，PUSCH 错误率过高
   排查：适当调整上行发射功率或路损配置；检查功率控制参数
```

---

### TC-6.1.10 Sub6G 用户链路 PUSCH 接收灵敏度测试

**测试目的**
验证星载基带在不同 MCS 等级下，对 Sub6G 终端上行 PUSCH 信道的解调灵敏度（即在 BLER ≤ 10% 条件下能正常接收的最低上行信号电平）。

**前置条件**

| 条件     | 要求                                         |
| -------- | -------------------------------------------- |
| UE 入网  | Sub6G 终端已完成注册，处于 RRC_CONNECTED     |
| 上行业务 | 终端持续发送上行 UDP 灌包（保持 PUSCH 激活） |
| 衰减器   | 上行路径接入精密衰减器，步进精度 ≤ 1 dB      |
| MCS 锁定 | 基带侧可强制锁定特定上行 MCS（关闭 AMC）     |

**核心测试步骤**

```
1. 锁定上行 MCS = 28（64QAM 最高码率）
2. 从低衰减开始，记录 BLER
3. 逐步增大衰减（步长 ≤ 3 dB），记录每个衰减点的 BLER
4. 找到 BLER = 10% 时的上行 RSRP → 记录为 MCS28 灵敏度
5. 切换 MCS = 16（16QAM），重复步骤 2～4
6. 切换 MCS = 9、10、4、17（覆盖不同调制等级），重复
7. 整理各 MCS 等级的灵敏度表格
```

**MCS 遍历目标组合**

```
MCS 4   → QPSK 低码率（最鲁棒）
MCS 9   → QPSK 高码率
MCS 10  → 16QAM 低码率（调制转折点）
MCS 16  → 16QAM 高码率
MCS 17  → 64QAM 低码率
MCS 28  → 64QAM 高码率（最高速率）
```

**关键信令观测点**

| 观测位置 | 观测内容              | 说明                                        |
| -------- | --------------------- | ------------------------------------------- |
| 基带 Log | PUSCH BLER            | 每个衰减点记录 100 个 TB 统计均值           |
| 基带 Log | UL RSRP（基带数字域） | 记录 BLER=10% 时对应值                      |
| 基带 Log | UL SINR               | 记录各测试点                                |
| 基带 Log | HARQ 重传次数         | NTN 中通常关闭 HARQ；若开启，需关注重传比例 |

**预期结果与 Pass 判据**

```
✅ PASS 条件：
   各 MCS 等级在 BLER ≤ 10% 时的灵敏度值（UL RSRP）≥ 设计门限值
   （具体数值由系统设计规格书给出，测试记录与规格对齐即为 Pass）

❌ FAIL 条件：
   某 MCS 等级下灵敏度劣于设计门限 3 dB 以上
```

**常见失败原因分析**

```
① 高阶 MCS（MCS 28）灵敏度显著差于预期
   原因：上行功率控制有 Bug，实际发射功率低于目标值
   排查：用功率计测量 UE 实际发射功率；检查 TPC 命令

② 低阶 MCS 灵敏度也较差
   原因：基带硬件射频前端噪声系数偏高（器件问题）
   排查：更换参考硬件对比；对比噪声系数测试数据

③ BLER 测量不稳定（抖动大）
   原因：统计样本数不足（< 100 个 TB）
   排查：延长每个测试点的统计时间至 1000 个 TB 以上
```

---

### TC-6.1.11 Sub6G 用户链路 PUCCH 接收灵敏度测试

**测试目的**
验证星载基带对 Sub6G 终端 PUCCH 各 Format（Format 1/Format 3 两种调制模式）的解调灵敏度，即 BLER ≤ 1% 时的最低上行 PUCCH 接收电平。

**前置条件**
与 TC-6.1.10 相同，额外要求 UE 持续发送 PUCCH（CQI/SR 周期上报）。

**PUCCH Format 测试矩阵**

```
Format 1（BPSK）：FDD 制式下仅支持 BPSK，用于承载 HARQ-ACK/SR
Format 3（pi2bpsk=1）：使用 π/2-BPSK 调制（更鲁棒）
Format 3（pi2bpsk=0）：使用 QPSK 调制（更高容量）
```

**核心测试步骤**

```
1. 配置 UE 上报 PUCCH Format 1（BPSK）
2. 调节衰减，以 3 dB 步长从强到弱扫描
3. 记录 BLER = 1% 时的上行 RSRP 为 Format 1 灵敏度
4. 切换 PUCCH Format 3（pi2bpsk=1）
5. 重复步骤 2～3，记录 Format 3 BPSK 灵敏度
6. 切换 PUCCH Format 3（pi2bpsk=0）
7. 重复步骤 2～3，记录 Format 3 QPSK 灵敏度
```

**关键信令观测点**

| 观测位置 | 观测内容       | 说明                                         |
| -------- | -------------- | -------------------------------------------- |
| 基带 Log | PUCCH BLER     | 注意：PUCCH 门限比 PUSCH 严格（≤1% vs ≤10%） |
| 基带 Log | pi2bpsk 字段值 | Format 3 中确认 = 1（BPSK）或 = 0（QPSK）    |
| 基带 Log | UL RSRP 对应值 | 记录 BLER=1% 时的电平                        |

**预期结果与 Pass 判据**

```
✅ PASS 条件：
   ① Format 1 (BPSK)：BLER ≤ 1% 时 UL RSRP ≥ 灵敏度设计值
   ② Format 3 (pi2bpsk=1)：同上，BPSK 模式灵敏度略优于 QPSK
   ③ Format 3 (pi2bpsk=0)：BLER ≤ 1% 时 UL RSRP ≥ 灵敏度设计值

❌ FAIL 条件：
   任何 Format 的灵敏度劣于设计门限 2 dB 以上
   注意：PUCCH 门限比 PUSCH 更严格（1% vs 10%），容忍度更低
```

**常见失败原因分析**

```
① PUCCH 格式不支持
   原因：基带或 UE 仅支持部分 PUCCH Format，未实现全格式
   排查：检查协议栈能力声明（UE Capability）

② pi2bpsk=1 与 pi2bpsk=0 灵敏度无差异
   原因：π/2-BPSK 的 PAPR 优势未正确实现，或功放工作点配置有误
   排查：对比理论增益（约 1～2 dB）

③ BLER 统计不准（跳变大）
   原因：PUCCH 资源偶发碰撞，或调度周期与统计窗口不对齐
   排查：延长统计窗口；检查 PUCCH 资源冲突
```

---

## <a id="moduleB"></a>模块 B：MAC/RRC 接入与性能

---

### TC-6.1.3 下行自适应调制与编码测试

**测试目的**
验证系统能够根据 UE 上报的 CQI 自适应调整下行 PDSCH MCS，从 64QAM（高速率）遍历至 QPSK（低速率），并记录各 MCS 等级下的 CQI、RSRP、SNR、吞吐量和 BLER。

**前置条件**

| 条件    | 要求                                 |
| ------- | ------------------------------------ |
| UE 状态 | RRC_CONNECTED，IPv6 PDU 会话已建立   |
| 业务    | 下行 UDP 灌包持续进行                |
| 衰减器  | 下行路径可调，步进精度 ≤ 3 dB        |
| AMC     | 开启（不锁定 MCS，让系统自适应调整） |

**核心测试步骤**

```
1. 初始状态：低衰减，确认下行 MCS = 28（64QAM 最高码率）
2. 记录当前状态：CQI index / DL RSRP / DL SNR / MCS / PRB 数 / BLER / 吞吐量
3. 逐步增大下行衰减（步长 3 dB），等待 AMC 收敛（约 3～5 s）
4. 记录新状态参数（同步骤 2）
5. 继续增大衰减，依次观察 MCS 从 64QAM 降至 16QAM 的转折点
6. 继续增大衰减，观察从 16QAM 降至 QPSK 的转折点
7. 记录 QPSK 最低 MCS（MCS ≈ 6）时的各参数
```

**关键信令观测点**

| 观测位置     | 观测内容      | 典型值（参考）                  |
| ------------ | ------------- | ------------------------------- |
| 基带调度 Log | 下行 MCS 索引 | 28 → 14 → 6（随衰减增大）       |
| 基带调度 Log | 分配 PRB 数   | 通常固定 = 48（20MHz）          |
| 基带调度 Log | PDSCH BLER    | 目标值 ≤ 10%，AMC 控制          |
| UE Log       | **CQI index** | 15 → 10 → 6（与 MCS 对应）      |
| UE Log       | DL RSRP       | -91 → -116 → -123 dBm（参考）   |
| UE Log       | DL SNR        | 32 → 11 → 4 dB（参考）          |
| 吞吐量统计   | MAC 层吞吐量  | 56 → 18 → 8 Mbps（参考，20MHz） |
| 吞吐量统计   | PHY 层吞吐量  | 58 → 23 → 9.3 Mbps（参考）      |

**预期结果与 Pass 判据**

```
✅ PASS 条件：
   ① 三种调制方式（64QAM / 16QAM / QPSK）均被遍历到
   ② 各 MCS 等级下 BLER 收敛至 ≤ 10%
   ③ 记录到 CQI index 随 RSRP 下降而降低的趋势
   ④ IPv6 下行业务在整个遍历过程中持续正常（无中断）

❌ FAIL 条件：
   MCS 不随 RSRP 下降而降低（AMC 环路异常）
   或 BLER 无法收敛（长时间 > 20%）
```

**常见失败原因分析**

```
① AMC 迟滞严重（MCS 长时间不变化）
   原因：CQI 上报周期过长（如 160 ms），AMC 响应慢
   排查：缩短 CQI 上报周期（配置 CSI-RS 资源）；检查调度器 AMC 算法

② CQI 与实际 MCS 严重不匹配
   原因：UE 侧 RSRP 测量偏差；或 CQI→MCS 映射表配置错误
   排查：对比 UE 上报 CQI 与基带选择的 MCS，检查映射表

③ 从 16QAM 降至 QPSK 时 BLER 突然跳变至 100%
   原因：MCS 切换时新旧 HARQ 进程冲突（NTN 大时延下更容易出现）
   排查：检查 HARQ 配置；考虑关闭 HARQ，依赖 RLC AM 重传
```

---

### TC-6.1.4 上行自适应调制与编码测试

**测试目的**
验证系统能够根据基带侧测量的上行 SINR 自适应调整上行 PUSCH MCS，从 64QAM 遍历至 QPSK，记录各等级下的 MCS、RSRP、SNR、吞吐量和 BLER。

**前置条件**
同 TC-6.1.3，区别在于调节的是**上行链路**衰减，业务为**上行 UDP 灌包**。

**核心测试步骤（与 6.1.3 对称）**

```
1. 初始：低衰减，确认上行 MCS = 27（64QAM 最高）
2. 逐步增大上行衰减，记录 MCS 变化过程
3. 依次经历 64QAM → 16QAM → QPSK 转折点
4. 记录各阶段：UL MCS / UL RSRP / UL SNR / BLER / 吞吐量 / CQI
```

**关键信令观测点（典型参考值）**

| MCS  | 调制  | UL RSRP（参考） | UL SNR（参考） | 上行速率（参考） |
| ---- | ----- | --------------- | -------------- | ---------------- |
| 27   | 64QAM | -44 dBm         | 22.68 dB       | 69.46 Mbps       |
| 13   | 16QAM | -60 dBm         | 6.55 dB        | 22.69 Mbps       |
| 4    | QPSK  | -68 dBm         | -1.89 dB       | 7.2 Mbps         |

> 注：UL RSRP 为基带数字域接收功率（含天线有源增益），与 UE 侧发射功率不同。

**预期结果与 Pass 判据**

```
✅ PASS：三种调制遍历完成，CQI 记录完整，业务持续正常，BLER ≤ 10%
❌ FAIL：上行 MCS 不随衰减增大而降低，或 UL BLER 无法收敛
```

**常见失败原因分析**

```
① 上行调度 MCS 长时间停在 QPSK 不上升
   原因：UE 上行功控误差大，实际功率不足
   排查：检查 TPC（发射功率控制）命令；确认 UE 最大发射功率配置

② 上行 SNR 与预期差异超过 5 dB
   原因：信道模拟器上行路损配置与实际不符
   排查：用功率计测量基带天线口实际接收功率；核对路损配置

③ CQI index 记录缺失（上行 AMC 无 CQI 上报概念混淆）
   说明：上行 AMC 由基带根据 UL SRS/SINR 决定，CQI 是 UE 为基带下行调度
         上报的，上行 MCS 无需 CQI，需明确两者的区别
```

---

### TC-6.1.5 下行动态调度测试

**测试目的**
验证系统在多用户（≥2个 UE）并发下行业务时，基带调度器能够在时隙级为不同 UE 灵活分配 PRB 资源，实现动态调度。

**前置条件**

| 条件     | 要求                                      |
| -------- | ----------------------------------------- |
| UE 数量  | ≥ 2 个 Sub6G 终端，均已入网               |
| PDU 会话 | 每个 UE 均已建立 IPv6 PDU 会话            |
| 业务     | 每个 UE 发起下行 Ping 业务（或 UDP 灌包） |

**核心测试步骤**

```
1. 2 个 UE 均完成注册和 PDU 会话建立
2. UE1 和 UE2 同时发起下行业务（Ping 或 UDP）
3. 在基带调度 Log 中查看每个时隙的 PRB 分配情况
4. 观察 PRB 在 UE1 和 UE2 之间的分配是否随业务量变化而动态调整
5. 记录 5 分钟内的调度统计（各 UE 平均 PRB 分配比例）
6. 停止 UE1 的业务，观察 UE2 的 PRB 分配是否增加（体现动态性）
```

**关键信令观测点**

| 观测位置     | 观测内容           | 预期现象                                       |
| ------------ | ------------------ | ---------------------------------------------- |
| 基带调度 Log | 每时隙 PRB 分配表  | UE1 和 UE2 的 PRB 在不同时隙之间动态变化       |
| 基带调度 Log | 单 UE PRB 分配比例 | 业务对等时各占约 50%；UE1 停止后 UE2 占约 100% |
| UE Log       | Ping 响应          | 两个 UE 的 Ping 均无超时（< 50 ms）            |
| 基带 Log     | 调度延迟           | 无调度饥饿现象（某 UE 长时间无 PRB 分配）      |

**预期结果与 Pass 判据**

```
✅ PASS：
   ① 两 UE 并发时，PRB 在时隙级可见动态分配（非固定分配）
   ② 两 UE 的下行业务均正常，无长时间中断
   ③ 停止 UE1 后，UE2 的吞吐量显著提升（体现资源释放和重分配）

❌ FAIL：
   基带对所有 UE 使用静态固定 PRB 分配（无动态调整）
   或某一 UE 持续无法分配到 PRB（调度饥饿）
```

**常见失败原因分析**

```
① 调度 Log 显示 PRB 固定分配
   原因：调度器工作在静态模式（测试/调试配置），未启用动态调度
   排查：检查调度器模式配置参数；切换为动态调度模式

② 多用户并发时吞吐量显著低于单用户
   原因：调度开销过大，或 MCS 降档（多 UE 时干扰增加）
   排查：检查多用户间干扰；确认调度算法效率（PF 调度器参数）
```

---

### TC-6.1.6 上行动态调度测试

**测试目的**
验证系统在多用户并发上行业务时，基带调度器能够动态分配上行 PRB，支持非频率选择性（Non-Frequency Selective）调度策略。

**前置条件**
同 TC-6.1.5，区别在于业务为**上行 UDP 灌包**。

**NTN 特殊说明：非频率选择性调度**

```
地面 TN 中，基带可利用频率选择性增益（给 UE 分配其信道响应最好的频率资源）。
但 NTN 场景中，卫星信道频率域相关性强，频率选择性增益极小，
因此 NTN 上行调度策略通常为"非频率选择性"，即在全带宽均匀分配 PRB。
本测试验证基带是否正确实现了此策略。
```

**关键信令观测点（附加 NTN 验证项）**

```
基带调度 Log 中确认：
  ① 上行 PRB 分配在全带宽分散（非集中在某几个 PRB）
  ② 不同 UE 的 PRB 分配不依赖各 UE 的频率域信道质量差异
  ③ 各 UE 均能获得上行调度（无饥饿）
```

**预期结果与 Pass 判据**

```
✅ PASS：
   ① 两 UE 并发上行，PRB 动态分配，无调度饥饿
   ② 上行调度采用非频率选择性策略（PRB 分配不依赖频选增益）
   ③ 两 UE 上行业务均正常

❌ FAIL：某 UE 上行持续无 PRB 分配，或调度策略明显依赖频率选择性
```

---

### TC-6.1.7 RRC 连接重建测试

**测试目的**
验证 UE 在发生无线链路失败（RLF）后，能够成功发起 RRC 重建流程，完成 SRB1 恢复和 DRB 恢复，RRC 状态回到 RRC_CONNECTED，业务中断后恢复正常。

**前置条件**

| 条件     | 要求                                 |
| -------- | ------------------------------------ |
| UE 状态  | RRC_CONNECTED，上行 Ping 业务进行中  |
| 触发工具 | 可调衰减器（下行路径）+ 噪声注入设备 |

**RLF 触发方法**

```
操作：将下行衰减器快速调至输出 70 dB（输入 -30 dBm → 输出 -70 dBm 附加衰减）
      同时注入 SNR = 10 dB 的噪声
效果：UE 侧 RSRP 骤降 → PHY 层连续上报 Out-of-Sync → T310 超时 → RLF
```

**核心测试步骤**

```
1. UE 正常通话中（Ping 业务运行）
2. 快速增大衰减至 70 dB，叠加噪声（SNR=10 dB）
3. 等待 UE 检测到 RLF（T310 超时）
4. 观察 UE 发起 RRCReestablishmentRequest
5. 观察基带回复 RRCReestablishment
6. 观察 UE 回复 RRCReestablishmentComplete（SRB1 恢复）
7. 基带发起 RRCReconfiguration（DRB 恢复）
8. UE 回复 RRCReconfigurationComplete
9. 恢复正常信道（撤除衰减），观察业务恢复
```

**关键信令观测点**

| 步骤      | 观测位置 | 关键信令/Log                 | 预期                              |
| --------- | -------- | ---------------------------- | --------------------------------- |
| RLF 触发  | UE Log   | Out-of-Sync 指示计数         | 达到 N310 次                      |
| T310      | UE Log   | T310 超时事件                | T310 到期，宣告 RLF               |
| Msg1 重建 | UE Log   | `RRCReestablishmentRequest`  | 包含 UE 标识 + cause=otherFailure |
| Msg2 重建 | 基带 Log | `RRCReestablishment`         | 包含新的 C-RNTI 和安全配置        |
| Msg3 重建 | UE Log   | `RRCReestablishmentComplete` | SRB1 恢复标志                     |
| DRB 恢复  | 基带 Log | `RRCReconfiguration`         | 包含 DRB 配置                     |
| 完成      | UE Log   | **RRC 状态 = RRC_CONNECTED** | 最终确认                          |
| 业务      | UE       | Ping 响应恢复                | 恢复后无超时                      |

**预期结果与 Pass 判据**

```
✅ PASS：
   ① UE 成功发起重建流程（RRCReestablishmentRequest 被基带接受）
   ② SRB1 重建完成（RRCReestablishmentComplete 发出）
   ③ DRB 恢复完成（RRCReconfigurationComplete 发出）
   ④ UE Log 中 RRC 状态显示 RRC_CONNECTED
   ⑤ Ping 业务在重建后 5 s 内恢复正常

❌ FAIL：
   RRCReestablishmentRequest 发出后收到 RRCReject（重建被拒）
   或 T311 超时（等待重建响应超时）→ UE 回到 IDLE
```

**常见失败原因分析**

```
① 基带拒绝重建请求（回复 RRCSetup 而非 RRCReestablishment）
   原因：基带无法找到 UE 的安全上下文（重建需要原安全上下文）
   排查：确认 UE 在同一基带小区重建（跨小区重建需要 Xn 接口支持）

② T311 超时，UE 进入 IDLE
   原因：重建后基带没有及时响应（NTN 大时延下超时时间需加大）
   排查：增大 T311 定时器配置值（NTN 场景推荐 > 10 s）

③ DRB 恢复后业务不通
   原因：用户面 GTP-U 隧道未及时恢复（SMF/UPF 侧资源未更新）
   排查：检查 AMF 是否触发了 Path Switch 流程
```

---

### TC-6.1.12 卫星小区容量性能测试

**测试目的**
在近点和远点两种静态星历条件下，测量 Sub6G 卫星小区的上/下行 UDP 峰值速率，验证系统容量满足设计要求。

**核心测试步骤**

```
1. 配置信道模拟器为远点参数（RSRP = -116 dBm，SNR = 10 dB）
2. UE 入网，建立 IPv6 PDU 会话
3. 下行 UDP 灌包至最大速率，记录 PHY/MAC 层吞吐量、MCS、BLER、PRB
4. 上行 UDP 灌包至最大速率，记录同上
5. 切换近点参数（RSRP = -106 dBm，SNR = 21 dB），重复步骤 2～4
```

**关键观测值（参考）**

| 场景 | 方向 | MCS  | BLER   | PRB  | MAC 速率   |
| ---- | ---- | ---- | ------ | ---- | ---------- |
| 远点 | DL   | 18   | 9.58%  | 48   | 26 Mbps    |
| 远点 | UL   | 5    | 9.9%   | 48   | 8.91 Mbps  |
| 近点 | DL   | 23   | 9.76%  | 48   | 39.93 Mbps |
| 近点 | UL   | 19   | 10.08% | 48   | 38.10 Mbps |

**Pass 判据**

```
✅ 远点和近点的上/下行峰值速率均满足系统设计规格要求（具体值见规格书）
❌ 任一方向速率低于设计值 10% 以上
```

---

### TC-6.1.13 卫星小区接入时延性能测试

**测试目的**
在远点和近点两种星历条件下，统计 UE 从 MIB 解码到注册完成（Registration Accept 收到）的平均接入时延，验证满足 ≤ 5 s 的要求。

**核心测试步骤**

```
1. 配置远点星历参数
2. UE 开机（从完全断电状态），记录 MIB 解码时刻 T_start
3. 记录 Registration Accept 收到时刻 T_end
4. 接入时延 = T_end - T_start
5. 连续执行 10 次，计算均值和最大值
6. 切换近点参数，重复步骤 2～5
```

**关键参考值**

| 场景 | 10 次均值   | 是否满足 ≤ 5 s |
| ---- | ----------- | -------------- |
| 远点 | **1.127 s** | ✅ 满足         |
| 近点 | **0.826 s** | ✅ 满足         |

**Pass 判据**

```
✅ 远点和近点条件下，10 次接入时延均值均 ≤ 5 s，且无单次超过 10 s
❌ 任一场景均值超过 5 s，或超过 3 次单次接入超时（> 10 s）
```

**常见失败原因**

```
① 接入时延超标
   主因：NTN-TA 预补偿精度不足 → PRACH 需要多次重传
   排查：查看 PRACH 重传次数；检查星历辅助信息精度

② 时延分布离散（标准差大）
   主因：UE GNSS 定位抖动，每次补偿量不同
   排查：固定使用 SIB19 辅助星历（消除 GNSS 误差影响）
```

---

### TC-6.1.14 小区初始接入成功率测试

**测试目的**
按照不同 RSRP/SINR 区间，统计 UE 连续 10 次初始接入的成功率，验证 SS-RSRP ≥ -90 dBm 时成功率 ≥ 100%。

**测试矩阵（5个 SINR 区间）**

| 区间 | SS-RSRP 范围     | SINR 范围 | 成功率要求     |
| ---- | ---------------- | --------- | -------------- |
| ①    | ≥ -70 dBm        | ≥ 20 dB   | 100%           |
| ②    | -70 ～ -80 dBm   | 10～20 dB | 100%           |
| ③    | -80 ～ -90 dBm   | 5～10 dB  | 100%           |
| ④    | -90 ～ -100 dBm  | 0～5 dB   | 记录（不强制） |
| ⑤    | -100 ～ -110 dBm | -5～0 dB  | 记录（不强制） |

**核心测试步骤**

```
对每个区间：
1. 调节衰减器至目标 RSRP/SINR
2. UE 关机 → 开机 → 统计接入是否成功（以 Registration Accept 为标志）
3. 重复 10 次
4. 统计成功次数 / 10 = 成功率
```

**Pass 判据**

```
✅ RSRP ≥ -90 dBm（区间 ①②③）：10/10 次成功，成功率 100%
❌ 区间 ①②③ 中任一出现接入失败（< 10/10）
```

---

### TC-6.1.15 卫星小区业务时延性能测试

**测试目的**
在远点和近点条件下，测量用户面 RTT 时延（Ping），验证满足 ≤ 50 ms 的要求。

**测试参数**

```
Ping 包大小：32 Byte 和 1400 Byte 各测 100 次
目标时延：均值 ≤ 50 ms（射频直连条件下）
```

**关键参考值**

| 场景 | Ping 大小 | min / avg / max          | 是否满足 |
| ---- | --------- | ------------------------ | -------- |
| 远点 | 32 B      | 22.22 / 22.85 / 23.46 ms | ✅        |
| 远点 | 1400 B    | 27.53 / 28.03 / 29.34 ms | ✅        |
| 近点 | 32 B      | 22.19 / 22.80 / 23.32 ms | ✅        |
| 近点 | 1400 B    | 26.49 / 27.00 / 28.43 ms | ✅        |

> **注意：** 上述 RTT 为射频直连（基带与终端同机房），不包含真实卫星传播时延。  
> 真实组网时，RTT 将增加 2 × 单程传播时延（LEO 约 +10～40 ms）。

**Pass 判据**

```
✅ 远点和近点条件下，32B 和 1400B Ping 的 100 次均值 ≤ 50 ms，无丢包
❌ 均值超过 50 ms 或丢包率 > 1%
```

---

## <a id="moduleC"></a>模块 C：NAS 注册与安全

---

### TC-6.1.8 周期性注册更新测试

**测试目的**
验证 UE 在 T3512 定时器超时后，能够自动发起 Registration Type 为 `periodic registration updating` 的注册更新，核心网正确响应。

**前置条件**

| 条件       | 要求                                                    |
| ---------- | ------------------------------------------------------- |
| T3512 配置 | 建议设置为较短值（如 60 s 或 120 s）以缩短测试时间      |
| UE 状态    | RM-REGISTERED + CM-IDLE（进入 IDLE 态后等待定时器超时） |

**核心测试步骤**

```
1. UE 完成初始注册（RM-REGISTERED）
2. 使 UE 进入 CM-IDLE 状态（无业务，RRC 连接释放）
3. 记录 T3512 启动时刻
4. 等待 T3512 超时（时长 = 配置值，如 120 s）
5. 观察 UE 发起 Registration Request
6. 检查 Registration Type = "periodic registration updating"
7. 确认 AMF 回复 Registration Accept（或 Registration Complete 流程完成）
```

**关键信令观测点**

| 观测位置           | 关键信令             | 预期                                                   |
| ------------------ | -------------------- | ------------------------------------------------------ |
| UE Log             | T3512 超时事件       | 定时器到期                                             |
| NAS Log（N2 抓包） | Registration Request | Registration Type = **periodic registration updating** |
| NAS Log            | Registration Accept  | AMF 下发新 GUTI 和更新后的 T3512                       |
| UE Log             | RM 状态              | 保持 RM-REGISTERED                                     |

**预期结果与 Pass 判据**

```
✅ PASS：
   ① T3512 超时后 UE 自动发起注册更新（不需要手动触发）
   ② Registration Type 字段 = periodic registration updating
   ③ AMF 回复 Registration Accept，UE 继续保持 RM-REGISTERED

❌ FAIL：
   T3512 超时后 UE 未发起注册更新（定时器未启动或被错误停止）
   或 Registration Type 字段值错误
```

**常见失败原因分析**

```
① UE 未发起周期性注册更新
   原因：T3512 定时器未正确启动（Registration Accept 中未携带 T3512 值）
   排查：检查 Registration Accept 消息中的 T3512 IE；确认 UE NAS 层定时器处理逻辑

② T3512 定时器值与配置不符
   原因：AMF 侧 T3512 配置错误（注意：5G 使用 T3512，非 4G 的 T3412）
   排查：在 Registration Accept 中确认 T3512 的值与 AMF 配置一致
```

---

### TC-6.1.9 移动性注册更新测试

**测试目的**
验证 UE 基于 GNSS 位置计算与注册时位置的距离：当距离**超过** TAU 门限时，发起移动性注册更新；当距离**未超过**门限时，不发起更新（负向验证）。

**前置条件**

| 条件      | 要求                                           |
| --------- | ---------------------------------------------- |
| TAU 门限  | AMF 在 Registration Accept 中下发（如 100 km） |
| GNSS 模拟 | 实验室通过 GNSS 模拟器或 AT 指令注入位置信息   |
| UE 状态   | RM-REGISTERED，CM-IDLE                         |

**核心测试步骤**

```
场景一（负向验证）：
1. 记录初始注册时 UE 的 GNSS 位置 (lat1, lon1)
2. 注入新位置 (lat2, lon2)，使距离 < TAU 门限
3. 等待 5 分钟，确认 UE 未发起注册更新（Registration Request 不出现）

场景二（正向验证）：
4. 注入新位置 (lat3, lon3)，使距离 > TAU 门限
5. 观察 UE 发起 Registration Request
6. 确认 Registration Type = "mobility registration updating"
7. 确认 AMF 回复 Registration Accept（含新的 5G-GUTI）
```

**关键信令观测点**

| 场景 | 观测位置 | 关键信令             | 预期                                                   |
| ---- | -------- | -------------------- | ------------------------------------------------------ |
| 负向 | NAS Log  | Registration Request | **不应出现**                                           |
| 正向 | NAS Log  | Registration Request | Registration Type = **mobility registration updating** |
| 正向 | NAS Log  | Registration Accept  | 含新 5G-GUTI                                           |

**Pass 判据**

```
✅ PASS：
   ① 距离 < 门限时：UE 保持静默，不发起注册更新（5 分钟内无 Registration Request）
   ② 距离 > 门限时：UE 发起注册更新，Type = mobility registration updating
   ③ 更新成功后 UE 继续保持 RM-REGISTERED

❌ FAIL：
   距离未超门限但 UE 频繁发起注册更新（误触发）
   或距离超门限后 UE 未发起更新（漏触发）
```

---

### TC-6.1.16 空口信令传输安全保护测试

**测试目的**
验证空口 AS 层（RRC 层）信令采用 **128-NIA1（完整性）** 和 **128-NEA1（加密）** 算法进行安全保护，SecurityModeCommand 流程正确完成。

**前置条件**

| 条件         | 要求                                      |
| ------------ | ----------------------------------------- |
| 安全算法配置 | 基带配置 AS 层使用 NIA1/NEA1（128位密钥） |
| UE 能力      | UE 安全能力列表包含 NIA1/NEA1             |
| 抓包         | 基带侧开启 RRC 消息 Log                   |

**核心测试步骤**

```
1. UE 发起注册，RRC 连接建立（SRB1 激活）
2. 观察基带发送 SecurityModeCommand 消息
3. 检查 SecurityModeCommand 中的 Security Algorithm IE
4. 确认 UE 回复 SecurityModeComplete
5. 验证激活后 RRC 消息均受到安全保护
```

**关键信令观测点**

| 观测位置 | 关键信令             | 必须包含的字段                     |
| -------- | -------------------- | ---------------------------------- |
| RRC Log  | SecurityModeCommand  | `integrityProtAlgorithm = nia1`    |
| RRC Log  | SecurityModeCommand  | `cipheringAlgorithm = nea1`        |
| RRC Log  | SecurityModeCommand  | 消息本身仅完整性保护，**未加密**   |
| RRC Log  | SecurityModeComplete | UE 回复成功                        |
| RRC Log  | 后续 RRC 消息        | 均受 128-NIA1 完保 + 128-NEA1 加密 |

**Pass 判据**

```
✅ PASS：
   ① SecurityModeCommand 中算法 IE 为 128-NIA1 + 128-NEA1
   ② UE 回复 SecurityModeComplete（无 SecurityModeFailure）
   ③ 后续 UE 信令发送/接收均正常（验证加密后通信不中断）

❌ FAIL：
   算法协商失败（SecurityModeFailure）
   或 UE 不支持 NIA1/NEA1（UE Capability 中未声明）
```

---

### TC-6.1.17 地面核心网向 AS 层下发用户面完整性保护安全策略测试

**测试目的**
验证 G-SMF 在 PDU 会话建立流程中，向 gNB 下发用户面完整性保护策略为 **Required（必须）**，gNB 据此在 RRCReconfiguration 中为 UE 配置用户面完整性保护开启。

**核心信令流程**

```
SMF → AMF：N2 SM Info 中携带 UP Security Policy
            IntegrityProtection = Required
AMF → gNB：N2 PDU Session Resource Setup Request（含 UP Security Policy）
gNB → UE：RRCReconfiguration（用户面完整性保护 IE = enabled）
UE → gNB：RRCReconfigurationComplete
→ 用户面数据开始传输，并受完整性保护
```

**关键信令观测点**

| 观测位置 | 关键信令                              | 必须包含的字段                                         |
| -------- | ------------------------------------- | ------------------------------------------------------ |
| N2 抓包  | N2 PDU Session Resource Setup Request | UP Security Policy: IntegrityProtection = **Required** |
| RRC Log  | RRCReconfiguration                    | 用户面完整性保护 IE = **enabled**                      |
| 基带 Log | 用户面数据                            | 包含 MAC-I 字段（完整性校验码）                        |

**Pass 判据**

```
✅ 核心网下发 Required 策略 → gNB 正确配置 → 业务传输正常（完整性保护激活后不影响速率）
❌ gNB 收到 Required 但未在 RRC 中配置 enabled（策略执行错误）
```

---

### TC-6.1.18 空口用户数据传输安全保护测试

**测试目的**
验证用户面数据的**机密性（加密）** 保护策略从核心网（SMF/PCF）正确传递到 gNB，并在空口通过 NEA1 算法加密传输。

**核心测试步骤与观测点**

```
1. PDU 会话建立时，PCF 策略 = Confidentiality Required
2. N2 SM Info 中 Confidentiality Protection = Required
3. RRCReconfiguration 中用户面机密性保护 IE = enabled（非 disable）
4. 空口 PDCP 层对用户数据加密（PDCP header 中 COUNT 值正确递增）
5. 验证业务（Ping/FTP）正常（加密不影响业务）
```

**关键判据**

```
✅ N2 SM Info 中 Confidentiality = Required → RRC 中为 enabled → 业务正常
❌ RRC 中出现 disable（未执行策略），或加密后业务中断
```

---

### TC-6.1.19 初始注册建立 NAS 安全上下文测试

**测试目的**
验证 5G NAS 安全上下文建立流程（SecurityModeCommand → SecurityModeComplete）的完整性，确认 NAS 消息在安全激活后正确加密和完整性保护。

**核心信令流程与观测点**

```
AMF → UE：NAS Security Mode Command（SMC）
           包含：ngKSI / NAS 加密算法（NEA1）/ NAS 完整性算法（NIA1）
                  重放的 UE 安全能力
           注意：SMC 消息本身仅完整性保护，不加密

UE → AMF：NAS Security Mode Complete（SMCo）
           注意：SMCo 消息同时做加密 + 完整性保护

AMF → UE：后续所有 NAS 下行消息（含 Registration Accept）
           均做 NAS 加密 + 完整性保护
```

**4 条核心验证项**

```
① SMC 消息包含 ngKSI、加密算法、完整性算法、UE 安全能力，且未加密（仅完整性保护）
② AMF 使用 NAS 完整性密钥对 SMC 进行完整性保护
③ AMF 验证 SMCo 的完整性成功
④ SMCo 之后所有 NAS 下行消息均加密 + 完整性保护
```

**Pass 判据**

```
✅ 4 条均满足 → NAS 安全上下文建立正确
❌ SMC 中重放的 UE 安全能力与 UE 发送的不一致（可能遭受降级攻击）→ UE 应拒绝
```

---

### TC-6.1.20 基于 SUCI 的初始注册测试

**测试目的**
验证 UE 首次注册（无 5G-GUTI）时，在 Registration Request 中使用 **SUCI（加密的用户标识）** 而非明文 SUPI，核心网能正确解密并完成注册。

**前置条件**

| 条件         | 要求                                             |
| ------------ | ------------------------------------------------ |
| UE 状态      | 无 5G-GUTI（出厂/清空状态），USIM 内含归属网公钥 |
| 卫星接入签约 | UDM 中 satAccessEnabled = 1                      |

**核心测试步骤**

```
1. UE 开机（无 GUTI 状态）
2. UE 生成 SUCI（用归属网公钥加密 SUPI 的 MSIN 部分）
3. UE 发送 Registration Request（UE 标识 = SUCI，Type = Initial）
4. gNB 转发 Initial UE Message 至 AMF（含 ANID，ULI.TAC = 0）
5. AMF → AUSF → UDM：SUCI 解密，获得 SUPI，查询 satAccessEnabled = 1
6. 执行 AKA 认证和 NAS 安全建立
7. AMF 发送 Registration Accept（含新分配的 5G-GUTI 和 TAU 门限）
8. UE 回复 Registration Complete，存储 5G-GUTI
```

**关键信令观测点**

| 步骤           | 观测位置   | 关键字段                 | 预期                         |
| -------------- | ---------- | ------------------------ | ---------------------------- |
| Reg Request    | NAS Log    | UE 标识类型              | **SUCI**（非 IMSI，非 GUTI） |
| Reg Request    | NAS Log    | satellite access setting | = **1**                      |
| Reg Request    | NAS Log    | Registration Type        | = initial registration       |
| Initial UE Msg | N2 NGAP    | ANID                     | = LEO（2）                   |
| Initial UE Msg | N2 NGAP    | ULI.TAC                  | = **0x000000**               |
| UDM 查询       | 核心网 Log | satAccessEnabled         | = **1**（确认已签约）        |
| Reg Accept     | NAS Log    | 5G-GUTI                  | 新分配的 GUTI                |
| Reg Accept     | NAS Log    | TAU 门限                 | 包含距离门限值               |

**Pass 判据**

```
✅ PASS：
   ① Registration Request 中 UE 标识为 SUCI（非明文 SUPI）
   ② ANID 和 TAC=0 正确携带
   ③ UDM satAccessEnabled = 1，注册成功
   ④ Registration Accept 含 5G-GUTI 和 TAU 门限

❌ FAIL：
   UE 使用明文 IMSI 发送（隐私保护失效）
   或 SUCI 解密失败（归属网公钥不匹配）
```

---

### TC-6.1.21 5G AKA 认证测试

**测试目的**
验证 5G AKA 认证流程完整执行，特别是**增强的归属控制（EHC）** 机制：AUSF 使用 XRES* 进行归属域最终认证，KAMF 正确生成。

**核心信令流程**

```
UE → AMF：Registration Request
AMF → AUSF：Nausf_UEAuthentication_Authenticate Request
AUSF → UDM：获取认证向量（XRES*、AUTN、RAND、HXRES*）
AUSF → AMF：RAND + AUTN + HXRES*（AMF 拿不到 XRES*！）
AMF → UE：Authentication Request（RAND + AUTN）
UE（USIM）：验证 AUTN + 计算 RES*
UE → AMF：Authentication Response（RES*）
AMF：计算 HRES* = hash(RES*)，与 HXRES* 比对 → 服务网验证通过
AMF → AUSF：发送 RES*（归属网最终验证）
AUSF：比对 RES* 与 XRES* → 增强归属控制验证通过
AUSF → AMF：认证成功 + KAMF（主密钥）
```

**关键观测点**

| 步骤          | 验证重点                                           |
| ------------- | -------------------------------------------------- |
| AMF → UE      | Authentication Request 包含 RAND + AUTN            |
| UE → AMF      | Authentication Response 包含 RES*（非 XRES*）      |
| AUSF 归属验证 | AUSF 收到 RES* 后与 XRES* 比对成功（增强归属控制） |
| KAMF 生成     | 认证成功后 KAMF 下发 AMF，后续安全上下文基于此     |

**Pass 判据**

```
✅ 双向认证成功（网络验证 UE + UE 验证网络）+ 增强归属控制验证通过 + KAMF 生成
❌ Authentication Reject（认证向量不匹配 / AUTN MAC 校验失败 / SQN 不同步）
```

---

### TC-6.1.22 基于 5G-GUTI 的初始注册测试

**测试目的**
验证 UE 重启后（已有 5G-GUTI）在 Registration Request 中使用 **5G-GUTI** 作为标识，AMF 能根据 GUTI 查找上下文，完成注册并下发新的 5G-GUTI。

**核心观测点（与 6.1.20 的区别）**

| 字段                | 6.1.20（SUCI 注册） | 6.1.22（GUTI 注册）          |
| ------------------- | ------------------- | ---------------------------- |
| UE 标识             | SUCI                | **5G-GUTI**                  |
| AMF 动作            | 调用 AUSF 解密 SUCI | 用 GUTI 中 AMF ID 查找上下文 |
| 是否触发 AKA        | 是（首次注册必须）  | 可选（上下文有效时跳过）     |
| Registration Accept | 下发新 GUTI         | 下发**更新后的新** GUTI      |

**Pass 判据**

```
✅ 注册 Request 中 UE 标识 = 5G-GUTI；注册成功；Accept 中含新 GUTI；
   原文"NAID"字段名修正为"ANID"
❌ AMF 无法识别 GUTI（找不到用户上下文）→ 要求 UE 提供 SUCI 重新认证
```

---

### TC-6.1.23 开关机过程中用户隐匿标识符测试

**测试目的**
验证整个开关机生命周期内，空口始终不出现明文 SUPI（IMSI），UE 在不同场景下正确使用 SUCI（首次）或 5G-GUTI（再次）作为标识。

**两阶段验证**

```
阶段一（首次开机，无 GUTI）：
  → Registration Request 使用 SUCI
  → 注册成功，收到 5G-GUTI

阶段二（关机重启，有 GUTI）：
  → Registration Request 使用 5G-GUTI
  → 注册成功，收到新的 5G-GUTI（旧 GUTI 作废）

全程验证：空口抓包中没有明文 IMSI 字段
```

**Pass 判据**

```
✅ 阶段一用 SUCI，阶段二用 GUTI，两次均成功，每次均收到新 GUTI，空口无明文 IMSI
❌ 任意一次在空口出现明文 IMSI（SUPI 泄露）
```

---

### TC-6.1.24 验证卫星终端能够成功完成注册接入

**测试目的**
端到端验证合法卫星终端（已签约卫星接入服务）的完整注册流程，重点验证 `satellite access setting = 1` 的携带和 `satAccessEnabled = 1` 的签约查询。

**核心验证点（共 5 条）**

```
① Registration Request 中 satellite access setting IE = 1
② AMF 向 UDM 发起 Nudm_SDM_Get 请求查询卫星接入签约
③ UDM 响应中 satAccessEnabled = 1
④ UE 注册成功，处于 RM-REGISTERED 状态
⑤ [待整改] Service reservation timer value：当前核心网不支持，标注为功能缺陷
```

---

### TC-6.1.25 未签约卫星接入业务的卫星终端注册

**测试目的**
验证未开通卫星接入服务的终端（satAccessEnabled = 0）被拒绝注册，AMF 发送 Registration Reject。

**核心验证点**

```
① Registration Request 中 satellite access setting = 1（终端声明有能力）
② AMF → UDM：签约查询
③ UDM 响应：satAccessEnabled = 0（未开通）
④ AMF → UE：Registration Reject（拒绝原因值 = 未签约卫星接入）
```

**Pass 判据**

```
✅ UDM 返回 satAccessEnabled=0 后，UE 收到 Reject，注册失败
❌ UE 意外注册成功（签约控制失效，安全漏洞！）
```

---

## <a id="moduleD"></a>模块 D：会话管理与端到端业务

---

### TC-6.1.26 UE 发起的业务请求测试

**测试目的**
验证 UE 从 CM-IDLE 状态发起上行业务时，能够通过 Service Request 流程恢复用户面连接，进入 CM-CONNECTED 状态，且 Initial UE Message 中 TAC = 0。

**核心信令流程**

```
UE（CM-IDLE）→ 有上行数据需要发送
→ UE 发起随机接入（PRACH）
→ RRC 建立（SRB1）
→ UE → AMF：NAS Service Request（包含 ngKSI 和 5G-S-TMSI）
→ AMF 触发 N2 PDU Session Resource Setup（恢复用户面）
→ gNB → UE：RRCReconfiguration（DRB 恢复）
→ UE 进入 CM-CONNECTED，业务开始传输
```

**NTN 关键验证**

```
Initial UE Message（gNB → AMF）中：
  ULI.TAC = 0x000000  （NTN 场景固定为 0）
  ANID = LEO（2）     （接入网标识）
```

**Pass 判据**

```
✅ Service Request 成功 → CM-CONNECTED → 业务（Ping）正常 → Initial UE Msg 中 TAC=0 + ANID 正确
❌ Service Request 被拒绝，或 TAC 字段非零
```

---

### TC-6.1.27 UE 请求的 PDU 会话建立测试

**测试目的**
验证 UE 发起的 IPv6 PDU 会话建立全流程，包括 NAS 信令（UE↔AMF↔SMF）、服务化接口（HTTP/2）交互、UPF 配置和空口 DRB 建立。

**完整信令流程（关键节点）**

```
① UE → AMF：PDU Session Establishment Request（DNN, PDU Type = IPv6）
② AMF → SMF：Nsmf_PDUSession_CreateSMContext（HTTP/2，N11 接口）
③ SMF → UDM：获取 SM 签约（N10，HTTP/2）
④ SMF → PCF：Session Policy（N7，HTTP/2）
⑤ SMF → UPF：N4 Session Establishment（PFCP）→ 分配 IPv6 前缀
⑥ SMF → AMF：N2 SM Info（含 DRB 配置和用户面安全策略）+ NAS Accept（含 IPv6 前缀）
⑦ AMF → gNB：N2 PDU Session Resource Setup Request
⑧ gNB → UE：RRCReconfiguration（DRB 配置：SDAP/PDCP/RLC/MAC 参数）
⑨ UE → gNB：RRCReconfigurationComplete
⑩ gNB → AMF：N2 PDU Session Resource Setup Response
```

**关键信令观测点**

| 步骤 | 验证内容                            |
| ---- | ----------------------------------- |
| ①    | PDU Type = IPv6，DNN 正确           |
| ②④   | 服务化接口（HTTP/2 格式），非 GTP-C |
| ⑤    | UPF 分配 IPv6 地址前缀              |
| ⑥    | N2 SM Info 中含用户面安全策略       |
| ⑧    | RRCReconfiguration 包含 DRB 配置    |
| 全程 | 会话建立后可 Ping 通外部服务器      |

**Pass 判据**

```
✅ IPv6 PDU 会话建立成功，UE 获得 IPv6 地址，业务正常，控制面用 HTTP/2 服务化接口
❌ PDU 会话建立失败（Establishment Reject），或 IPv6 地址未分配
```

---

### TC-6.1.28 UE 请求的 PDU 会话释放测试

**Pass 判据**

```
✅ UE 发起释放后，PDU 会话成功释放，DRB 被撤销，后续 Ping 不通（释放生效）
❌ 释放请求未响应，或释放后 UE 侧仍保留 PDU 会话状态
```

---

### TC-6.1.29 PDU 会话修改测试

**测试目的**
验证两次 PDU 会话修改流程：第一次修改 QoS 参数，第二次修改后**承载不释放**（关键验证点）。

**AT 指令触发方式**

```
第一次修改：AT+C5GQOS=1,5      → 触发 QoS 修改（5QI = 5）
第二次修改：AT+CGCMOD=1        → 触发会话修改（承载激活）
```

**Pass 判据**

```
✅ 两次修改均成功，且第二次修改后 PDU 会话和 DRB 均未释放，业务持续
❌ 第二次修改后 PDU 会话被意外释放（DRB 撤销）
```

---

### TC-6.1.30 网络请求的 PDU 会话释放测试

**关键区别**：触发方来自核心网（PCF 策略触发 SMF 发起释放），而非 UE。

**Pass 判据**

```
✅ PCF 触发后，SMF → UPF 资源释放 → AMF → gNB DRB 撤销 → UE PDU 会话释放
❌ PCF 触发后核心网未完成释放（SMF/UPF 侧资源未清理）
```

---

### TC-6.1.31 寻呼功能测试

**测试目的**
验证核心网缓存下行数据后发起的寻呼流程：N2 Paging 消息携带 ANID 和寻呼波位列表，UE 接收 Paging 后发起 Service Request，业务恢复。

**寻呼流程**

```
下行数据到达 UPF → UPF 通知 SMF → SMF 通知 AMF → AMF 向 gNB 发 N2 Paging
N2 Paging 携带：ANID=1 / TAC=0x000000 / PagingGroupList（ssb-index=0）
gNB 在对应 SSB 波束上广播空口 Paging（Pcch）
UE 醒来检测到 Paging → 发起 PRACH → RRC 建立 → Service Request
AMF 收到 Service Request → 恢复 PDU 会话 → 下行数据下发
```

**关键观测点**

| 观测位置          | 关键字段            | 预期                |
| ----------------- | ------------------- | ------------------- |
| N2 NGAP（Paging） | ANID                | = 1                 |
| N2 NGAP（Paging） | TAC                 | = 0x000000          |
| N2 NGAP（Paging） | **PagingGroupList** | 包含 ssb-index = 0  |
| 空口 Pcch         | ServiceRequest      | PO=1，PF=1023       |
| UE 状态           | CM 状态             | 进入 CM-CONNECTED   |
| 业务              | 数据下发            | 缓存数据正常到达 UE |

**Pass 判据**

```
✅ UE 接收 Paging → 发起 Service Request → CM-CONNECTED → 缓存数据正常下发
❌ UE 未响应 Paging（DRX 配置错误 / 寻呼时机计算错误）
```

---

### TC-6.1.32 / 6.1.33 FTP / HTTP 数据业务测试

**关键验证点（两项相同）**

```
① G-SMF 位置感知路由：根据 UE 位置选择最优信关站边缘 G-UPF
② 业务正常：FTP 上传/下载完成，HTTP 网页正常加载

参考速率（FTP，射频直连条件）：
  下载：38.24 Mbps
  上传：30.64 Mbps
```

**Pass 判据**

```
✅ G-SMF 选路正确（日志中显示选择对应 G-UPF）+ 业务正常完成
❌ G-UPF 选路错误（跨信关站绕行）或业务中断
```

---

### TC-6.1.34 卫星用户语音业务测试（VoNR）

**测试目的**
验证两台终端在卫星链路上能够完成 VoNR（Voice over NR）的完整呼叫流程，包括 IMS 注册、呼叫建立（SIP INVITE → 振铃 → 接通）和正常释放。

**核心信令流程**

```
UE-A 和 UE-B 均完成 IMS 注册（SIP REGISTER → 200 OK）
UE-A 发起呼叫：SIP INVITE → CSCF → UE-B
UE-B 振铃：180 Ringing
媒体协商：183 Session Progress → UPDATE → 200 OK（precondition 流程）
UE-B 接听：200 OK for INVITE
双向 RTP 语音流开始
UE-A 挂机：SIP BYE → 200 OK → 会话释放
```

**承载建立验证**

```
5QI = 5：IMS 信令默认承载（SIP 消息）
5QI = 1：语音专有承载（RTP 音频流）
三类承载均需要在基带 Log 中确认建立成功
```

**Pass 判据**

```
✅ IMS 注册成功 → 呼叫建立成功（振铃 → 接通）→ 三类承载建立 → 通话正常 → 正常释放
❌ IMS 注册失败 / 呼叫无法接通 / 挂机后资源未释放
```

---

### TC-6.1.35 卫星用户视频业务测试（ViNR）

**额外验证点（相较于 6.1.34）**

```
① 新增 5QI = 2（视频专有承载）
② SDP 中验证 precondition 特征信元（INVITE/183/UPDATE/200OK 均携带）
③ 记录：呼叫成功率 / 掉话率 / 呼叫建立时延
④ 主观质量评分（语音清晰度 + 视频流畅度，满分 5 分）
```

**Pass 判据**

```
✅ 呼叫成功率 100%，掉话率 0%，呼叫建立时延 < 阈值，视频流畅（无卡顿）
❌ precondition 流程不完整 / 视频专有承载建立失败 / 掉话
```

---

### TC-6.1.36 / 6.1.37 IP 短信 MO / MT 流程测试

**MO（主叫）关键验证点**

```
① SIP MESSAGE 中携带 P-Access-Network-Info（PANI）头域
   access-type 标识 = NTN/卫星接入类型
② MAP-MO-FORWARD-SHORT-MESSAGE-REQ 消息中携带 ratType 信元
   ratType = LEO 对应的接入类型值
③ Submit Report 返回，短信发送成功
```

**MT（被叫）关键验证点**

```
① G-SMSC → G-IP-SM-GW → UE：短信下发成功
② UE 返回 Delivery Report
③ MAP-MT-FORWARD-SHORT-MESSAGE-RSP 中携带 ratType 信元
```

**Pass 判据**

```
✅ MO：PANI 头域正确 + ratType 信元存在 + 短信发送成功
   MT：MT 短信接收成功 + Delivery Report 正常 + ratType 信元存在
❌ 任一方向短信发送/接收失败，或 ratType 信元缺失
```

---

## <a id="moduleE"></a>模块 E：动态星历与系统级性能

---

### TC-6.1.41 动态星历下的接入成功率测试

**测试目的**
在信道模拟器播放真实动态星历曲线（时延/频偏/路损随时间变化）的条件下，验证 Sub6G 终端能够稳定入网，连续 10 次接入成功率为 100%，并记录每次接入时的 RSRP 和卫星仰角。

**前置条件**

| 条件         | 要求                                                      |
| ------------ | --------------------------------------------------------- |
| 动态星历文件 | 已从真实 TLE 数据生成（覆盖仰角 40°～90° 范围）           |
| 时钟同源     | 基带和信道模拟器均从同一 GNSS/PTP 时钟源同步，偏差 < 1 μs |
| 测试场景     | 至少包含两种仰角范围（如 80°～90° 和 40°～45°）           |

**关键动态参数（典型过境弧段）**

```
高仰角阶段（近星下点）：
  时延变化率：接近 0（几乎不变）
  频偏变化率：接近 0
  RSRP：较高

低仰角阶段（卫星边缘）：
  时延变化率：约 -10 μs/s（单程时延快速减小或增大）
  频偏变化率：约 ±100 Hz/s（多普勒快速变化）
  RSRP：较低
```

**核心测试步骤**

```
1. 加载动态星历文件至信道模拟器
2. 基带和信道模拟器对齐时钟（GNSS/PTP 同源）
3. 在约定 UTC 时刻同步开始播放动态星历
4. UE 开机 → 发起接入
5. 记录接入时刻的：DL RSRP / UL RSRP / 接入时延 / 星历对应仰角
6. UE 去注册 → 重新接入，连续 10 次
7. 统计接入成功次数和平均接入时延
8. 在第二种仰角范围重复上述流程
```

**关键信令观测点**

| 观测位置 | 关键字段                 | 要求                              |
| -------- | ------------------------ | --------------------------------- |
| 时间戳   | 接入开始时刻（MIB 解码） | 与星历播放时刻对齐                |
| UE Log   | DL RSRP                  | 记录每次接入值                    |
| 基带 Log | UL RSRP                  | 记录每次接入值                    |
| 星历工具 | 卫星仰角                 | 与每次接入时刻对应（°）           |
| 计时器   | 接入时延                 | T(Msg4/RRCSetupComplete) - T(MIB) |
| 统计     | 成功次数                 | 10 次中成功几次                   |

**预期结果（参考）**

```
10 次接入均成功，成功率 100%
平均接入时延：约 2.45 s（各次: 2.7/2.4/2.4/2.4/2.5/2.6/2.6/2.4/2.3/2.1 s）
均值满足 ≤ 5 s 要求
```

**Pass 判据**

```
✅ 连续 10 次接入成功率 = 100%，平均接入时延 ≤ 5 s，两种仰角场景均满足
❌ 出现接入失败（PRACH 超时），或平均时延 > 5 s
```

**常见失败原因分析**

```
① 动态星历播放与基带不同步（时钟问题）
   现象：接入时延突变，PRACH 成功率骤降
   排查：重新对齐时钟；检查 GNSS/PTP 授时精度

② 频偏斜率过大时 UE 失去同步
   现象：低仰角阶段接入失败率高
   原因：UE 频率跟踪环路带宽不足，跟不上快速变化的多普勒
   排查：调整 UE 侧 PLL 带宽；确认星历更新频率

③ 两种仰角测试结果差异大（低仰角明显差于高仰角）
   原因：低仰角路损增加约 5～10 dB，RSRP 明显下降
   排查：检查低仰角场景的链路预算是否满足灵敏度要求
```

---

### TC-6.1.42 动态星历下的速率测试

**测试目的**
在动态星历条件下，分别测量近点和远点场景的上下行 UDP 峰值速率，验证动态信道条件下系统速率满足设计要求。

**测试条件与参考结果**

| 场景           | 方向 | MCS  | BLER | PRB  | 速率        |
| -------------- | ---- | ---- | ---- | ---- | ----------- |
| 近点（高仰角） | 上行 | 15   | 9%   | 47   | **27 Mbps** |
| 近点           | 下行 | 24   | 9%   | 47   | **39 Mbps** |
| 远点（低仰角） | 上行 | 8    | 10%  | 47   | **13 Mbps** |
| 远点           | 下行 | 24   | 10%  | 47   | **20 Mbps** |

**Pass 判据**

```
✅ 近点/远点上下行速率均满足 20MHz 带宽设计规格（具体值见规格书）
❌ 动态场景下速率比静态场景劣化超过 20%（说明动态跟踪算法存在问题）
```

**常见失败原因**

```
① 动态场景速率远低于静态场景
   原因：UE 频偏跟踪误差增大，导致 PDSCH 解调性能下降（有效 SNR 降低）
   排查：对比静态与动态场景的 EVM（误差向量幅度）；检查相位噪声补偿算法

② 速率在某仰角突然跌落
   原因：该仰角对应的星历时延变化率最大，基带 TA 调整滞后
   排查：分析该时刻的 TA 误差（残差 TA 值）
```

---

### TC-6.1.43 Sub6G 多用户随机接入平均时延测试

**测试目的**
验证系统在 **≥1800 个 UE** 并发随机接入时，所有 UE 的平均接入时延 ≤ 5 s（P3 阶段验收要求）。

**基站配置（关键参数）**

```
max_mcs  = 28       （最高调制编码）
max_rb   = 51       （最大 RB 分配）
SSB      = 256      （SSB 波束数）
PDCCH    = 2 符号   （控制信道配置）
DMRS-pos = 2        （解调参考信号位置）
接入 UE 上限 = 2000
```

**仪表配置（已知约束）**

```
多用户模拟仪表版本：V1.5.1，支持 ASN1 1.6
因仪表稳定性限制，实际配置 UE 数 = 1998（非 2000）
```

**核心测试步骤**

```
1. 多用户仪表配置 1998 个虚拟 UE（同一时刻发起随机接入）
2. 同步触发所有 UE 开始接入
3. 基站侧记录：接入 UE 数量 / 各 UE 接入完成时刻（RRCReconfigurationComplete）
4. 仪表侧记录：各 UE 接入完成时刻
5. 统计：成功接入 UE 数 / 平均接入时延
```

**关键观测点与参考值**

| 指标                                                 | 参考值      | 要求        |
| ---------------------------------------------------- | ----------- | ----------- |
| 基站侧成功接入 UE 数                                 | 1998        | = 配置值    |
| 仪表侧统计接入数                                     | 1998        | = 配置值    |
| UE 侧平均接入时延（RRCReconfigurationComplete 时刻） | **3.069 s** | ≤ 5 s       |
| 保持 CONNECTED 态的 UE 数                            | ≥ 1800      | P3 阶段要求 |

**Pass 判据**

```
✅ P3 阶段 PASS：
   ① 接入成功 UE ≥ 1800 个
   ② 平均接入时延 ≤ 5 s

❌ FAIL：
   成功接入 UE < 1800，或平均时延 > 5 s
```

**常见失败原因分析**

```
① 大量 UE PRACH 碰撞失败
   原因：PRACH 资源不足（序列数 64 << 并发 UE 数 1998）
   排查：检查 PRACH 重传次数统计；调整 PRACH 功率爬升速度；
         确认基带 PRACH 多根检测算法（NTN 场景需处理大时延下的多根碰撞）

② 平均时延达标但部分 UE 接入极慢（长尾效应）
   原因：某些 UE 被调度器排队延迟（PDCCH 资源竞争）
   排查：分析接入时延分布（P99 时延 vs 均值）；优化调度器 PDCCH 资源分配

③ 仪表侧与基站侧统计数不一致（仪表统计少于基站）
   原因：仪表在接收 RRCReconfigurationComplete 前已超时记录失败
   排查：延长仪表侧超时判断时间；确认仪表版本支持 NTN 大时延场景
```

---

### TC-6.1.44 Sub6G 多用户吞吐量统计测试

**测试目的**
验证系统在 100 个 UE 并发下行业务时，基站下行 L1 吞吐量（DL-L1-Throughput）满足设计要求。

**基站配置**：同 TC-6.1.43，接入 UE 上限设为 100。

**关键测试方法**

```
1. 100 个 UE 全部接入（确认基站侧接入数 = 100）
2. 所有 UE 同时发起下行 UDP 灌包（最大速率）
3. 在基站侧 LMT 中读取 DL-L1-Throughput 计数器（实时值）
4. 在仪表侧统计终端实际收到的下行速率
5. 记录平均值（建议统计 5 分钟均值）
```

**参考值与阶段要求**

| 指标               | 参考实测值  | P3 阶段要求       | 最终要求          |
| ------------------ | ----------- | ----------------- | ----------------- |
| DL-L1-Throughput   | **63 Mbps** | **≥ 60.3 Mbps** ✅ | ≥ 67 Mbps ❌待整改 |
| 终端侧实际收包速率 | **62 Mbps** | 参考值            | —                 |
| 终端平均接入时延   | **465 ms**  | —                 | —                 |

**Pass 判据**

```
✅ P3 阶段 PASS：DL-L1-Throughput ≥ 60.3 Mbps
   最终要求（67 Mbps）：当前不满足，标注为[待整改]

❌ DL-L1-Throughput < 60.3 Mbps → P3 阶段不满足
```

**常见失败原因分析**

```
① 多用户并发时吞吐量饱和提前（未到 60 Mbps）
   原因：PDCCH 资源成为瓶颈（100 UE 每 TTI 调度占用大量 PDCCH 开销）
   排查：统计 PDCCH 利用率；调整 PDCCH 符号数配置

② 仪表侧收到速率比基站侧 L1 吞吐量低 10% 以上
   原因：物理层重传（HARQ）浪费了部分 L1 吞吐量（BLER 过高）
   排查：检查下行 BLER；适当降低目标 BLER 或增大 SNR

③ 速率随并发 UE 数增加非线性下降
   原因：调度器公平性算法（PF）在大用户数时调度开销大
   排查：检查每个 UE 的平均分配 PRB 数（理论应为约 0.48 PRB）
```

---

## <a id="moduleF"></a>模块 F：漫游与自动化

---

### TC-6.1.38 漫游用户准入控制测试

**测试目的**
验证核心网能根据用户归属地（IMSI）正确执行漫游准入控制：已签约漫游服务的 SIM 注册成功；未签约的 SIM 被拒绝。

**两个测试场景**

```
场景一（有效漫游用户）：
  SIM 卡1：HPLMN = 卫星运营商，已签约漫游至地面运营商
  操作：UE 通过地面运营商（VPLMN）基站接入
  预期：核心网路由至归属卫星 AMF，注册成功

场景二（未签约漫游用户）：
  SIM 卡2：未开通漫游服务
  操作：同上
  预期：VPLMN AMF 向 HPLMN 查询 → 漫游不允许 → Registration Reject
```

**Pass 判据**

```
✅ SIM1 注册成功（漫游） + SIM2 注册被拒（未签约）
❌ SIM2 意外注册成功（准入控制失效）
```

---

### TC-6.1.39 卫星用户漫出到地面模拟运营商移动网络试验

**测试目的**
验证卫星用户在地面运营商覆盖区时，能够通过地面运营商（VPLMN）基站接入，信令和数据正确路由至卫星核心网（HPLMN）。

**关键验证点**

```
① UE 通过地面 gNB 接入（VPLMN）
② N32 接口（或互联接口）转发 Registration Request 至 HPLMN AMF
③ HPLMN AMF 完成认证和注册
④ 用户面数据：根据漫游协议（Home Routed 或 Local Breakout）路由
⑤ 记录端到端 Ping 时延（漫游场景下时延高于本地接入）
```

---

### TC-6.1.40 地面用户漫入到卫星网络试验

**测试目的**
验证地面运营商用户（VPLMN）通过星载基带（HPLMN = 卫星运营商）接入时，卫星核心网能正确处理漫游用户的注册和业务。

**关键验证点**

```
① 地面运营商 SIM 通过星载基带发起注册
② 卫星 AMF（作为 VPLMN）向 HPLMN（地面运营商 UDM）查询签约
③ 用户注册成功，建立 PDU 会话
④ 业务数据正常（FTP/HTTP）
```

---

### TC-6.1.45 Sub6G 测试终端与自动化系统接口测试

**测试目的**
验证测试终端能够被自动化测试系统通过无线方式远程控制，实现接入 → 业务触发 → 数据收集 → 报告生成的完整自动化测试闭环。

**核心验证点**

```
① 自动化系统 → 无线接口 → 远程控制 UE 发起随机接入
② 自动化系统 → 触发 UE 发起上行 UDP 灌包（指定速率和时长）
③ 自动化系统 → 触发 UE 发起下行 UDP 灌包
④ 自动化系统 → 收集并解析 UE 侧 Log（RSRP / 速率统计）
⑤ 自动化系统 → 生成测试报告（含 Pass/Fail 判断）
```

**Pass 判据**

```
✅ 全流程无需人工干预，自动化系统完成接入 → 业务 → 日志收集 → 报告生成
❌ 远程控制失效（UE 无响应），或日志收集不完整，或报告生成失败
```

---

## 附录：快速诊断矩阵

### A. 常见 Fail 现象 → 可能原因 → 排查方向

| Fail 现象                   | 最可能原因              | 首选排查方向                   |
| --------------------------- | ----------------------- | ------------------------------ |
| PRACH 无法完成              | 频偏预补偿误差过大      | 检查 GNSS 精度 / 星历有效期    |
| MCS 无法超过 QPSK           | 下行 SNR 过低           | 检查路损配置 / 天线连接        |
| AMC 不响应衰减变化          | CQI 上报周期过长        | 配置更短的 CSI-RS 周期         |
| RRC 重建被拒                | 安全上下文丢失          | 确认同一基带内重建             |
| Registration Reject（意外） | satAccessEnabled = 0    | 检查 UDM 签约数据              |
| NAS 安全激活后通信中断      | 加密算法不匹配          | 核查 UE 安全能力声明           |
| PDU 会话建立失败            | SMF 无法选到 UPF        | 检查 N4 接口 / PFCP 连接       |
| 寻呼无响应                  | DRX 周期过长 / 波束错误 | 检查 PagingGroupList 波束索引  |
| 动态星历接入失败            | 时钟不同源              | 重新对齐 GNSS/PTP 时钟         |
| 多用户并发时延超标          | PRACH 碰撞严重          | 增大 PRACH 资源 / 分散接入时间 |

### B. 关键定时器汇总

| 定时器 | 位置      | 含义                      | NTN 推荐值        |
| ------ | --------- | ------------------------- | ----------------- |
| T3512  | UE（NAS） | 周期性注册更新触发        | 120 s～3600 s     |
| T310   | UE（RRC） | Out-of-Sync 到 RLF 的等待 | 建议延长（> 1 s） |
| T311   | UE（RRC） | 等待重建响应的超时        | 建议 > 10 s       |
| T319   | UE（RRC） | 等待 RRC Setup 的超时     | 建议 > 5 s        |
| T300   | UE（RRC） | RRC 建立请求超时          | 建议 > 5 s        |

---

*文档版本：v1.0 | 最后更新：2026-05*
*归属项目：5g-comm-notes / docs / test-cases-6.1.x.md*