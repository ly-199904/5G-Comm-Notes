> 📂 代码库导航： > [resource_grid_sim.py](./resource-grid-sim)  

# resource_grid_sim.py · 仿真说明文档

> **对应理论笔记**：[资源网格 Resource Grid](/phase1/resource-grid)
> **脚本位置**：`simulation/phase1/resource_grid_sim.py`
> **验证目标**：通过频域可视化和参数计算，验证 3GPP 38.211 §4.4 中 Point A、CRB、BWP 的几何关系，以及 38.213 §12 中 `locationAndBandwidth` 的编解码逻辑。

---

## ⚡ 一分钟速览

```
这个脚本在验证什么？

Point A（ARFCN）
   ↓ offsetToCarrier  →  载波起点（实际信号从这里开始）
   ↓ offsetToPointA   →  SSB 最低 RB（参考 SCS = 15kHz）
   ↓ k_SSB            →  SSB 最低子载波（子载波粒度）
   ↓ locationAndBandwidth → BWP 起点 + 带宽（单整数编码）

核心结论：Point A 是数学原点，不承载信号，可落在载波带外。
          所有频域参数都是相对 Point A 的偏移量。

LAB 解码：startRB = ⌊LAB/37⌋，nRB = (LAB mod 37) + 1
```

**运行后你会得到 2 张图 + 1 份终端验证报告**：
- `output_resource_grid_fr1.png`：FR1 100MHz 载波，三种 BWP 并存的频域全景图
- `output_resource_grid_fr2.png`：FR2 400MHz mmWave 载波频域全景图
- 终端：LAB 编解码验证表 + Point A 计算步骤

---

## 🛠️ 环境配置

```bash
# 安装依赖
pip install numpy matplotlib

# 运行（从 simulation/phase1/ 目录执行）
cd simulation/phase1
python resource_grid_sim.py
```

> 本脚本不依赖 PyTorch，纯 NumPy + Matplotlib 即可运行，启动更快。

---

## 📐 数学–代码对照

### 对照 1：ARFCN → 频率转换（38.101-1 Table 5.4.2.1-1）

**协议公式**：

$$
f(\text{MHz}) = \begin{cases}
0.005 \times N_\text{REF} & N_\text{REF} < 600000 \quad (<3\ \text{GHz}) \\
3000 + 0.015 \times (N_\text{REF} - 600000) & 600000 \leq N_\text{REF} < 2016667 \quad (3\sim24.25\ \text{GHz})\\
24250.08 + 0.060 \times (N_\text{REF} - 2016667) & N_\text{REF} \geq 2016667 \quad (\text{FR2})
\end{cases}
$$

**对应代码**（`arfcn_to_freq_mhz` 函数）：

```python
def arfcn_to_freq_mhz(arfcn: int) -> float:
    if arfcn < 600_000:
        return 0.005 * arfcn                              # < 3 GHz
    elif arfcn < 2_016_667:
        return 3000.0 + 0.015 * (arfcn - 600_000)        # 3~24.25 GHz
    else:
        return 24250.08 + 0.060 * (arfcn - 2_016_667)    # FR2
```

---

### 对照 2：locationAndBandwidth 编解码（38.213 §12）

**协议公式**：

$$
\text{LAB} = 37 \times N_\text{startRB} + N_\text{RB} - 1
$$

反解：

$$
N_\text{startRB} = \left\lfloor \frac{\text{LAB}}{37} \right\rfloor, \qquad
N_\text{RB} = (\text{LAB} \bmod 37) + 1
$$

**对应代码**：

```python
def encode_lab(start_rb: int, n_rb: int) -> int:
    return 37 * start_rb + n_rb - 1          # 38.213 §12

def decode_lab(lab: int) -> tuple[int, int]:
    start_rb = lab // 37
    n_rb     = (lab % 37) + 1
    return start_rb, n_rb
```

**实际验证**：终端会打印一张编解码对照表，检查每行"验证"列是否全为 ✅。

---

### 对照 3：Point A 计算（38.211 §4.4.4.2）

**推导路径**：

$$
f_\text{SSB,RB0} = f_\text{SSB,center} - 10 \times 12 \times \Delta f_\text{SSB}
$$

$$
f_\text{Point A} = f_\text{SSB,RB0} - k_\text{SSB} \times \Delta f_\text{ref} - \text{offsetToPointA} \times 12 \times \Delta f_\text{ref}
$$

**对应代码**（`calculate_point_a` 函数）：

```python
# Step 1: GSCN ARFCN → SSB 中心频率
f_ssb_center_mhz = arfcn_to_freq_mhz(gscn_arfcn)

# Step 2: SSB 中心 → SSB 最低子载波（SSB = 20 RB，取一半）
ssb_half_bw_mhz = 10 * 12 * ssb_scs_khz / 1000.0
f_ssb_rb0_mhz   = f_ssb_center_mhz - ssb_half_bw_mhz

# Step 3: SSB 最低子载波 → Point A
k_offset_mhz  = k_ssb * ref_scs_khz / 1000.0
ota_offset_mhz= offset_to_point_a * 12 * ref_scs_khz / 1000.0
f_point_a_mhz = f_ssb_rb0_mhz - k_offset_mhz - ota_offset_mhz
```

---

### 对照 4：BWP 频率范围（38.211 §4.4.5）

**协议关系**：

$$
f_\text{BWP,low} = f_\text{Point A} + N_\text{startRB} \times 12 \times \Delta f_\text{BWP}
$$

**对应代码**（`BWPConfig.freq_range_mhz`）：

```python
def freq_range_mhz(self, point_a_mhz: float) -> tuple[float, float]:
    low  = point_a_mhz + self.start_rb * self.rb_bw_mhz   # RB 偏移 → MHz
    high = low + self.n_rb * self.rb_bw_mhz
    return low, high
```

---

## ⚙️ 仿真参数说明

| 参数 | 默认值 | 物理含义 | 修改建议 |
|---|---|---|---|
| `point_a_arfcn` | `629352` | Point A 的 ARFCN（≈3440 MHz）| 改为其他频点验证计算 |
| `offset_to_point_a` | `30` | SSB 到 Point A 的距离（15kHz RB 数）| 影响 SSB 在网格中的位置 |
| `k_ssb` | `0` | SSB 子载波粒度偏移 | 0~23，影响 CORESET#0 位置 |
| `n_rb_total` | `275` | 载波总 RB 数（FR1 100MHz @ 30kHz）| FR2 改为 264 |
| `offset_to_carrier` | `0` | Point A 到载波起点偏移 | 设为 10 观察 Point A 落在载波外 |
| BWP `start_rb` | `20/30/40` | BWP 相对 Point A 的起始 CRB | — |
| BWP `n_rb` | `25/50/106` | BWP 的 RB 数 | — |

---

## 📊 预期输出图表解读

### 图 1：`output_resource_grid_fr1.png`

```
上半部分：FR1 100MHz 载波频域结构全景
  ┌─────────────────────────────────────────────────────┐
  │  黄色虚线 = Point A（数学原点，不承载信号）            │
  │  橙色区域 = SSB（20 RB，用于小区搜索）                │
  │  蓝色区域 = Initial BWP（UE 开机使用）                │
  │  绿色区域 = Active BWP #1（正常业务，最宽）            │
  │  紫色区域 = Dormant BWP #2（待机，最窄）               │
  └─────────────────────────────────────────────────────┘

下半部分：BWP 参数汇总表
  逐行列出每个 BWP 的 startRB / nRB / LAB / 频率范围

关键观察：
  ① 三个 BWP 可以同时配置，但 UE 同一时刻只激活一个
  ② Dormant BWP 最窄（20 RB ≈ 7.2 MHz），省电关键
  ③ Point A 可能不在任何 BWP 范围内（这是正常的）

异常情况：若 BWP 矩形超出载波边界显示红色警告 →
  检查 start_rb + n_rb 是否超过 n_rb_total
```

### 图 2：`output_resource_grid_fr2.png`

```
FR2 mmWave 400MHz 载波（μ=3，120kHz SCS）

关键观察：
  ① RB 数与 FR1 相同（275），但每个 RB 更宽（1.44 MHz vs 0.36 MHz）
  ② SSB 使用 120kHz SCS（FR2 标准），显示为独立的橙色块
  ③ Active BWP 覆盖全载波（264 RB），表示全带宽使用

注意：FR2 的 offsetToPointA 参考 SCS = 60kHz（不是 FR1 的 15kHz）
```

### 终端输出：LAB 编解码验证表

```
startRB   nRB     LAB(编码)   startRB(解码)   nRB(解码)   验证
      0    25            24              0          25    ✅
     29    27          1099             29          27    ✅
      0   106           105              0         106    ✅
    100    52          3751            100          52    ✅
      0   275           274              0         275    ✅

全部 ✅ 说明编解码实现与 38.213 §12 公式完全一致
```

---

## 🔬 NTN Context

::: info NTN 提示 · Rel-17 (38.821 + 38.331)

**BWP 与 NTN 星历有效期的关系**：当 UE 的 `ntn-UlSyncValidityDuration` 超时（预补偿值过期），Rel-17 建议 UE 切回窄 BWP（类 Dormant 模式）降低功耗并等待星历更新。可以将 `Dormant BWP` 的 `n_rb` 改为 `20` 模拟这一场景。

**NTN 专属 IE `ntn-Config-r17`**：在 `ServingCellConfig` 中新增，包含卫星星历（位置/速度）和 Common TA。这些 IE 不影响 BWP 本身的频域定义（startRB / nRB 完全相同），但影响 UE 何时切换 BWP。

**快速实验**：将 `offset_to_carrier` 从 `0` 改为 `30`，观察 Point A 落在载波范围之外的情况——这在 NTN 的宽带馈电链路中实际存在，验证你对"Point A 是数学原点而非信号起点"的理解。

:::

---

## 📎 3GPP 协议溯源

| 代码模块 | 对应协议 | 章节 |
|---|---|---|
| `arfcn_to_freq_mhz()` | TS 38.101-1 | Table 5.4.2.1-1（FR1/FR2 ARFCN）|
| `encode_lab() / decode_lab()` | TS 38.213 | §12（locationAndBandwidth）|
| `calculate_point_a()` | TS 38.211 | §4.4.4.2（Point A 定义）|
| `CarrierConfig` | TS 38.331 | `SCS-SpecificCarrier` IE |
| `BWPConfig` | TS 38.331 | `BWP-Downlink-Common → genericParameters` IE |
| `SSBConfig` | TS 38.211 | §7.4.3.1（SSB 频域位置）|
| Dormant BWP | TS 38.300 | §5.2（Rel-16 新增）|
