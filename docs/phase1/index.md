---
title: Phase 1 · 基石层总览
description: 5G NR 物理层四大基础模块的端到端知识地图
---

# Phase 1 · 基石层

> 本章建立整个 5G 物理层的"时频坐标系"与"信号处理链路"。
> 四门课相互咬合，缺一不可。

---

## 端到端信号链路

```
Transport Block（MAC 层交付）
        │
        ▼  ─────── 第 3 课 Channel Mapping ───────────
   CRC 附加 → LDPC/Polar 编码 → 速率匹配
        │ → 加扰（RNTI + Cell ID）
        │ → QAM 调制（QPSK / 16QAM / 64QAM / 256QAM）
        │ → 层映射（最多 8 层）
        ▼
   复数调制符号序列
        │
        ▼  ─────── 第 2 课 Resource Grid ──────────────
   映射到资源网格 RE
        │  BWP 框定工作频域窗口
        │  Point A 锚定全局频率坐标
        │  DMRS / CSI-RS 占据固定图样 RE
        ▼
   频域资源网格（已分配 RE）
        │
        ▼  ─────── 第 1 & 4 课 Numerology + OFDM ──────
   IFFT（N_FFT 点）→ 时域符号
        │  添加 Cyclic Prefix（N_CP 点）
        │  [DFT-s-OFDM 时：前置 M 点 DFT]
        ▼
   时域 OFDM 符号流
        │
        ▼
   上变频 → 射频 → 天线
```

---

## 四门课的核心贡献

| 课次 | 核心问题 | 最关键的一个公式 | 对应规范 |
|---|---|---|---|
| 1 · Numerology + 帧结构 | 时域刻度是什么？ | $\Delta f = 2^\mu \times 15\ \text{kHz}$ | 38.211 §4.2 |
| 2 · Resource Grid | 频域坐标系如何建立？ | $n_\text{CRB} = n_\text{PRB} + N_\text{BWP,start}$ | 38.211 §4.4 |
| 3 · Channel Mapping | 比特怎么变成复数符号？ | LDPC BG 选择：$A \leq 292 \Rightarrow$ BG2 | 38.212 §7.2 |
| 4 · OFDM 基础 | 符号怎么变成波形？ | $s[n] = \mathcal{F}^{-1}\{a[k]\}$（IFFT）| 38.211 §5.3 |

---

## 四个最容易混淆的概念

:::details 1. CP 对抗的是多径，不是传播时延

**错误理解**：NTN 卫星时延大，所以需要更长的 CP。

**正确理解**：CP 只负责对抗多径时延扩展（不同散射路径的相对时延差）。LEO 信道由 LOS 主导，多径扩展 < 5 μs，Normal CP（4.69 μs）完全够用。几毫秒的传播时延由 **TA 预补偿**机制处理，与 CP 无关。

:::

:::details 2. Point A 不是载波起点

Point A 是**全局频域坐标系的数学原点**，本身不承载任何信号，甚至可以落在载波保护带之外（`offsetToCarrier > 0` 时）。真正的信号起点由 `offsetToCarrier` 决定。

混淆 `offsetToPointA`（到 SSB 的距离，参考 SCS 为 15 kHz）和 `offsetToCarrier`（到载波起点，当前 BWP SCS）是排障中最常见的错误。

:::

:::details 3. PDCCH 不经过逻辑信道和传输信道

下行调度指令（DCI）由 PHY 层直接生成，不来自 MAC 层的队列。这就是为什么 PDCCH 的故障往往与数据信道完全隔离——RNTI 掩码错误会让 PDCCH 解码失败，但物理层 SNR 和信道估计完全正常。

:::

:::details 4. DFT-s-OFDM 的 PAPR 优势来自"等效单载波"

DFT-s-OFDM 在 IFFT 之前插入 M 点 DFT。当 M = N 时，IFFT(FFT(x)) = x，输出就是原始符号序列——等效单载波。PAPR 与单载波相同（~4~8 dB），比 CP-OFDM（~10~12 dB）低 4~6 dB。这是 NTN 上行链路预算受限场景优先选择 DFT-s-OFDM 的根本原因。

:::

---

## NTN 视角下的 Phase 1

Phase 1 的每个知识点在 NTN（Rel-17）场景中都有对应的工程挑战：

| Phase 1 知识点 | NTN 中的挑战 | Rel-17 解法 |
|---|---|---|
| Numerology：SCS 选择 | 多普勒 f_d 远超 SCS | UE 频率预补偿（非加大 SCS）|
| OFDM：CP 长度 | LOS 主导，多径小 | Normal CP 足够，TA 处理时延 |
| OFDM：DFT-s-OFDM | UL 链路预算紧张 | 上行优先 DFT-s-OFDM + π/2-BPSK |
| Resource Grid：BWP | 预补偿过期时 | 切回窄 BWP 待机 |
| Channel Mapping：PRACH | RTT 长，RAR 超时 | `ra-ResponseWindow` 扩展至 640 slots |

---

## 进入 Phase 2 前的检查清单

在开始学习 RACH / PDCCH / HARQ 之前，请确认能独立回答以下问题：

```
□ 给定 μ=1，n_RB=52，n_sym=12，MCS=16，能否手算 TBS 的近似值？
□ 看到 Wireshark 中 locationAndBandwidth=1099，能否立刻算出 startRB 和 nRB？
□ 能否解释为什么 NTN 不用大 SCS 对抗多普勒？
□ 能否描述 PDCCH 解码失败时应该检查哪三个配置字段？
□ 能否说明 DFT-s-OFDM 为什么只能用单层 MIMO？
```

五题全答出来，Phase 2 可以放心开始。

---

## 学习资源

| 文件 | 内容 |
|---|---|
| [`numerology.md`](./numerology) | Numerology + 帧结构：μ / SCS / Symbol / Slot |
| [`resource-grid.md`](./resource-grid) | Point A / CRB / PRB / BWP / LAB 解码 |
| [`channel-mapping.md`](./channel-mapping) | 三层信道架构 / LDPC / RNTI / PRACH ZC 序列 |
| [`ofdm-basics.md`](./ofdm-basics) | CP-OFDM / DFT-s-OFDM / PAPR / 信道估计 |

仿真代码（Python / PyTorch）：

| 文件 | 主要功能 |
|---|---|
| `code/numerology_sim.py` | OFDM 时域波形、NTN 多普勒 BER、Deep Unfolding 骨架 |
| `code/resource_grid_sim.py` | Point A 计算、BWP 可视化、LAB 编解码验证 |
| `code/channel_mapping_sim.py` | QAM 星座、RE 分配可视化、ZC 相关检测 |
| `code/ofdm_basics_sim.py` | PAPR CCDF、CFO 仿真、DMRS 信道估计 |
