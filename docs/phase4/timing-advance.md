# Timing Advance 大时延补偿

> **3GPP 版本定锚**
>
> | 内容 | 版本 | 规范 |
> |---|---|---|
> | TA 基础机制（N_TA / N_TA,offset） | **Rel-15** | 38.211 §4.3.1, 38.213 §4.2 |
> | NTN Common TA + Service Link TA | **Rel-17** | 38.821 §6.3.3 |
> | TA 预补偿有效时长与过期处理 | **Rel-17** | 38.331（ntn-UlSyncValidityDuration） |

---

> 🛰️ 本文内容从 [Numerology §5](/phase1/numerology) 的 NTN 深度分析迁移而来，与多普勒/频率补偿侧互为补充。Doppler 量级与频率预补偿见 [Doppler 频移补偿](/phase4/doppler-compensation)。

---

## 📡 知识定位

```
Phase 4 NTN 专题
│
├── NTN 架构概览
│
├── ▶ Timing Advance 大时延补偿  ← 我们在这里（时间轴）
│
├── Doppler 频移补偿              ← 多普勒 / 频率预补偿 / SCS 边界
└── Rel-17 NTN 增强特性
```

---

## 1. 核心问题：传播时延的量级 🟢

### 1.1 LEO 轨道的传播时延

以 Starlink 第一代轨道（h = 550 km）为基准。

**传播时延**（仰角 90° 时最短，边缘仰角 10° 时最长）：

$$
\tau_{\text{one-way}}^{\min} = \frac{h}{c} = \frac{550 \times 10^3}{3 \times 10^8} \approx 1.83 \text{ ms}
\quad \text{（nadir）}
$$

$$
\tau_{\text{one-way}}^{\max} \approx \frac{h}{c \cdot \sin(10°)} \approx 10.6 \text{ ms}
\quad \text{（覆盖边缘）}
$$

LEO 往返时延（RTT）范围：**3.6 ms ~ 21.2 ms**。

对比地面网络（RTT < 1 ms），NTN 的时延大了 **2~3 个数量级**。

### 1.2 CP 误区澄清

很多教材写道："NTN 大时延要求小 SCS 换取长 CP"。**这个说法在物理上是错误的。** 让我们严格拆开：

- **CP 的物理作用**：对抗**多径时延扩展**（multipath delay spread），即不同反射路径之间的**相对时延差**。NTN 信道由 LOS 主导，几乎无强散射体，多径时延扩展仅 **< 几 μs**。μ=0 的 CP（4.69 μs）对 NTN 多径**完全够用**。
- **传播时延**（~ms 量级）是绝对时延，不是 CP 要解决的问题——它由 **TA（Timing Advance）机制**负责。

### 1.3 矛盾轴 B：控制 HARQ 时序开销

**真正的矛盾在：加大 μ 会让 HARQ 时序开销在大时延下反而更大。**

```
矛盾轴 B：控制 HARQ 时序开销（加大 μ 的代价）
───────────────────────────────────────────────────────
  大 μ → 更多 slot/frame → HARQ K1/K2 需更大值
  例：1-way delay = 10 ms
    μ=3 (125μs/slot)：K1 = 80 slots（需要 7-bit 字段）
    μ=0 (1ms/slot) ：K1 = 10 slots（4-bit 字段即可）
  → 大 μ 在长时延场景下不仅没优势，信令开销反而更大。
```

**两个矛盾的唯一出路：将补偿移到发射端，彻底绕开空口的 Numerology 限制。**

---

## 2. Rel-17 NTN 的 TA 双层架构 🔵

### 2.1 架构总览

```
总 TA = Common TA（网络广播）+ Service Link TA（UE 自主计算）
         ↓                          ↓
  补偿馈电链路时延              补偿卫星→UE 时延
  (gNB→卫星，固定)              (卫星→UE，随位置变化)
  来源：ta-Info-r17              来源：UE GNSS + 星历计算
```

### 2.2 各层详解

**Common TA（网络侧广播）**：

补偿馈电链路（Feeder Link）gNB → 卫星的固定传播时延。由于 GEO 卫星位置固定或 LEO 馈电链路的星历可预测，这部分时延由网络通过 `ta-Info-r17` 广播给覆盖区内所有 UE。

**Service Link TA（UE 自主计算）**：

补偿服务链路（Service Link）卫星 → UE 的可变传播时延。UE 基于 GNSS 获取自身位置，结合网络广播的卫星星历（`ntn-SatelliteInfo-r17`），实时计算几何距离并转换为时延补偿值。

### 2.3 预补偿流程

UE 发射侧时间预补偿（38.821 Section 6.3.3）：

```
[GNSS 接收机] ──→ UE 精确位置 (x, y, z)
[星历广播]   ──→ 卫星位置 + 速度向量
                     │
                     ▼
             [UE 本地计算引擎]
               ① 几何路径长度: d = |P_sat - P_UE|
               ② 单向传播时延: τ = d / c
                     │
                     ▼
             [发射前时间预补偿]
               提前 τ 发送（开环 TA 预补偿）
                     │
                     ▼
             [残余误差]
               残余时延误差: ~ ns 量级（受 GNSS 精度限制，3m → 10ns）
```

### 2.4 ⚠️ 暗坑：Common TA 重复叠加

**若 UE 实现将 Common TA 重复叠加**（即两次都补偿了馈电链路），上行时序会偏移一个 Common TA 的量（约数百 μs），导致 PRACH 和 PUSCH 均超出基带检测窗口。

> 排查方法：检查 `ta-Info-r17` 中的 `ta-Common` 数值；对比 UE 侧记录的"总 TA 应用值" vs "Service Link 单独计算值"之差。

---

## 🔗 交叉链接

- [Doppler 频移补偿](/phase4/doppler-compensation) — 矛盾轴 A（多普勒 ICI）与频率预补偿
- [Numerology §5 伏笔](/phase1/numerology) — 从主线切入 NTN 的入口
- [NTN 架构概览](/phase4/ntn-architecture)

---

## 📝 面试级自测题

**Q1 · NTN 故障排查题（高级）** 🟠

> Rel-17 NTN 网络现场：UE 已支持 Doppler 预补偿功能，但上行时序仍频繁偏移，导致 PUSCH 无法被正确解调，gNB 侧 HARQ NACK 率高达 60%。UE 侧 Log 显示 `ta-Info` 接收正常，星历数据也在有效期内。
>
> 请给出两种最可能的根因，并指出各自需要检查的具体 Log 字段。

<details>
<summary>💡 展开答案</summary>

**根因 1：Common TA 与 UE 专用 Service Link TA 叠加错误**

Rel-17 NTN 的总 TA 由两部分叠加：网络广播的 `ta-Common`（补偿馈电链路 gNB→卫星的固定时延）+ UE 自主计算的 Service Link TA（补偿卫星→UE 的可变时延）。若 UE 实现错误地将两者**重复叠加**，上行发送会整体提前一个 Common TA 的时间量。

**检查字段**：`ta-Info-r17` 中的 `ta-Common` 数值；UE 侧记录的"总 TA 应用值"vs"Service Link 单独计算值"之差。

**根因 2：UE 速度估计误差导致多普勒预补偿过补偿**

若 UE 自身有移动速度（如机载场景），径向相对速度 $v_r = v_{\text{sat,radial}} + v_{\text{UE,radial}}$，但部分实现可能只考虑了卫星速度而忽略了 UE 自身速度分量，导致频率预补偿**方向相反或幅度错误**，反而引入更大的残余多普勒，加剧相位旋转，最终使时序估计失真。

**检查字段**：UE 侧"多普勒预补偿值"Log；比较 gNB 侧 timing offset measurement 与理论预期值；检查 UE 是否上报了 `ue-Velocity-r17`（Rel-17 新增能力）。

参考：38.821 Section 6.3.3，38.133 Table 7.1.2.1-2（NTN TA 精度要求：± 几 μs）。

</details>

---

## 参考资料

- **3GPP TR 38.821 v17.3.0** — NTN 解决方案；TA 扩展与预补偿（Section 6.3.3）
- **3GPP TS 38.211 v17.x** — 物理信道；TA 基础定义（Section 4.3.1）
- **3GPP TS 38.213 v17.x** — 物理层控制；TA 命令（Section 4.2）
- **3GPP TS 38.331 v17.x** — RRC；`ta-Info-r17`、`ntn-UlSyncValidityDuration-r17` IE
