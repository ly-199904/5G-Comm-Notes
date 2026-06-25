# ca_sim.py · 仿真说明文档

> **对应理论笔记**：[载波聚合：CA](/phase3/carrier-aggregation)
> **脚本位置**：`simulation/phase3/ca_sim.py`
> **验证目标**：用 38.306 §4.1.2 峰值速率公式量化 CA 的核心收益（吞吐随 CC 数线性扩展），可视化聚合频谱三类型，刻画 SCell 去激活/休眠/激活的时延与功耗权衡（休眠态 Rel-16 的意义），并量化 NTN 中 CC 间差分时延为何破坏单 TAG 的 CA。

---

## ⚡ 一分钟速览

```
这个脚本在验证什么？

核心公式（38.306 §4.1.2）：
  Rate = 1e-6 · Σ_CC ( 层数 · Qm · f · Rmax · N_PRB·12/Ts · (1-OH) )
  Ts = 1e-3/(14·2^μ)，Rmax = 948/1024

四张图的结论：
  ① 吞吐扩展：峰值速率随 CC 数线性叠加
              FR1(100MHz/CC,4层,256QAM) 8CC ≈ 18.7 Gbps；FR2 8CC ≈ 25.9 Gbps
  ② 频谱三类型：带内连续 / 带内非连续 / 带间
  ③ SCell 状态：去激活→激活 ~30ms（冷启取CSI）vs 休眠→激活 ~3ms（CSI已新鲜，~10×快）
              相对功耗：PCell 1.0 / +休眠 1.35 / +激活 2.0
  ④ NTN 差分时延：CC1 天顶、CC2 仰角变化 → 差分 |d1-d2|/c
              仰角 30° 时 ≈ 1477μs，10° 时 ≈ 4220μs（CP≈4.7μs）→ 远超单 TAG 容差
```

**运行后得到 4 张图 + 终端报告**：
- `output_ca_throughput.png`：吞吐随 CC 数扩展
- `output_ca_spectrum.png`：聚合频谱三类型
- `output_ca_scell_state.png`：SCell 激活时延 / 功耗
- `output_ca_ntn_delay.png`：NTN CC 间差分时延

> :::info 模型定位
> **系统级**模型。峰值速率为公式上界（理想信道、满层满阶）；SCell 时延/功耗为代表性**示意值**（量级源自 38.133/38.321，非逐符号仿真）。参数集中在 `CONFIG`。
> :::

---

## 🛠️ 环境配置

```bash
pip install numpy matplotlib
sudo apt-get install fonts-noto-cjk        # 中文字体（关键）

mkdir -p simulation/phase3
cd simulation/phase3
python ca_sim.py
```

**预计运行**：< 5 秒。脚本内置 `_setup_cjk_font()` 自动探测中文字体并设 `axes.unicode_minus=False`。绘图标签全部用 ASCII（如 `|d1-d2|`）以规避字体缺失下标字形的问题。

| 依赖 | 最低版本 |
|---|---|
| Python | 3.9+ |
| NumPy | 1.24+ |
| Matplotlib | 3.7+（`FancyBboxPatch`）|

---

## 📐 数学–代码对照

### 对照 1：峰值速率公式（38.306 §4.1.2）—— 全脚本的核心

**公式**：

$$
\text{Rate} = 10^{-6}\sum_{j=1}^{J}\Big( v^{(j)}_{\text{Layers}}\cdot Q^{(j)}_m\cdot f^{(j)}\cdot R_{\max}\cdot \frac{N^{\text{BW}(j),\mu}_{\text{PRB}}\cdot 12}{T_s^\mu}\cdot(1-\text{OH}^{(j)})\Big)
$$

**对应代码**（`cc_rate_bps` + `plot_throughput`）：

```python
def cc_rate_bps(nprb, mu, layers, Qm, f, OH):
    Ts = 1e-3 / (14 * 2**mu)              # 平均符号时长
    return layers * Qm * f * CONFIG["R_max"] * (nprb * 12 / Ts) * (1 - OH)

# 聚合 = 各 CC 速率求和（线性叠加）
g1 = cc * r1 / 1e9    # cc = 1..8 → 总速率随 CC 数线性增长
```

**验证**：终端报告 `FR1 8CC ≈ 18.7 Gbps`。单 CC 100MHz/4 层/256QAM ≈ 2.34 Gbps，×8 = 18.7 Gbps，印证求和号 $\sum_j$ 的线性叠加。

---

### 对照 2：NTN 斜距与差分时延

**公式**：

$$
d = \sqrt{(R_e\sin\theta)^2 + 2R_e h + h^2} - R_e\sin\theta, \qquad \Delta\tau = \frac{|d_1 - d_2|}{c}
$$

**对应代码**（`slant_range_km` + `plot_ntn_delay`）：

```python
def slant_range_km(h, elev_deg, Re):
    th = np.radians(elev_deg)
    return np.sqrt((Re*np.sin(th))**2 + 2*Re*h + h**2) - Re*np.sin(th)

d1 = slant_range_km(h, 90.0, Re)      # CC1 天顶：d1 = h = 550 km
d2 = slant_range_km(h, elev2, Re)     # CC2 随仰角变化
diff_us = np.abs(d1 - d2) / c * 1e3 * 1e3   # 差分单程时延 (μs)
```

**验证**：终端 `CC2@10° 时差分 ≈ 4220 μs（CP≈4.7μs，约 898×）`。天顶斜距精确等于轨道高度（$\sqrt{(R_e+h)^2}-R_e=h$），可作正确性自检。

---

### 对照 3：SCell 状态时延/功耗

**模型**（示意，量级源自 38.133/38.321）：

| 状态转移/态 | 量 |
|---|---|
| 去激活→激活（冷启，需取 CSI）| ~30 ms |
| 休眠→激活（CSI 已新鲜）| ~3 ms |
| 相对功耗：PCell / +去激活 / +休眠 / +激活 | 1.0 / 1.05 / 1.35 / 2.0 |

**对应代码**（`plot_scell_state`）直接读 `CONFIG` 绘制对比柱，并计算 `speedup = lat_deact/lat_dorm ≈ 10×`。

---

## ⚙️ 参数说明（`CONFIG` 区）

| 参数 | 默认 | 含义 / 调参建议 |
|---|---|---|
| `R_max` | 948/1024 | 最大码率 |
| `OH_FR1_DL` / `OH_FR2_DL` | 0.14 / 0.18 | 下行开销 |
| `fr1_nprb/mu/layers/Qm/bw` | 273/1/4/8/100 | FR1 单 CC 配置（100MHz@30kHz, 4 层 256QAM）|
| `fr2_nprb/mu/layers/Qm/bw` | 264/3/2/6/400 | FR2 单 CC 配置（400MHz@120kHz, 2 层 64QAM）|
| `max_cc` | 8 | 吞吐图扫描的最大 CC 数 |
| `lat_deact_to_active` | 30.0 | 去激活→激活时延 (ms) |
| `lat_dorm_to_active` | 3.0 | 休眠→激活时延 (ms) |
| `pwr_add_*` | 0.05/0.35/1.0 | 去激活/休眠/激活 SCell 的额外相对功耗 |
| `Re_km` / `h_leo_km` | 6371 / 550 | 地球半径 / LEO 高度 |
| `cp_budget_us` | 4.7 | 普通 CP 量级，作单 TAG 容差参考 |

> **想看 FR2 毫米波 CA 的极限？** 把 `max_cc` 调到 16（NR 上限），图 1 的 FR2 线会冲到 ~50 Gbps 量级。

---

## 📊 图表解读

### 图 1 `output_ca_throughput.png`：吞吐随 CC 数扩展 ★（核心收益）
两条线（FR1/FR2）均随 CC 数**线性**增长，标注了 1/4/8 CC 处的速率与聚合带宽。
**要点**：CA 的全部意义就是峰值公式里的求和号——每加一个 CC 线性叠加一份吞吐。NR 最多 16 CC。

### 图 2 `output_ca_spectrum.png`：聚合频谱三类型
三面板分别画带内连续（CC 紧邻）、带内非连续（有间隙）、带间（跨频段，FR1+FR2）的 CC 频域排布。
**要点**：带间 CA 是"低频覆盖 + 高频容量"互补的典型组合。

### 图 3 `output_ca_scell_state.png`：SCell 状态管理
左：激活时延（去激活 30ms vs 休眠 3ms，~10× 快）；右：相对功耗（PCell 1.0 → +休眠 1.35 → +激活 2.0）。
**要点**：休眠态（Rel-16）在"去激活省电但慢"与"激活快但耗电"之间架桥——维持 CSI、不监听 PDCCH。

### 图 4 `output_ca_ntn_delay.png`：NTN 差分时延 ★（NTN 关键）
CC1 固定天顶、CC2 仰角从 90° 降到 10°，差分单程时延（对数轴）随仰角下降急剧增大，并标出与 CP 量级（4.7μs）的交点（约 86°）。
**要点**：地面 CA 各 CC 同站、差分≈0、单 TAG 即可；NTN 跨卫星 CA 差分可达数百 μs~ms，远超 CP → 须多 TAG，Rel-17 因此不优先支持 NTN CA。

---

## 🛰️ NTN Context

| 仿真维度 | NTN 工程意义 |
|---|---|
| 吞吐扩展（图 1）| NTN 典型业务（IoT/语音/中低速）对峰值吞吐非刚需，CA 收益有限 |
| 频谱类型（图 2）| NTN 频谱稀缺且多为单载波分配，带内多 CC 聚合机会少 |
| SCell 状态（图 3）| NTN 终端省电诉求强，但 CA/SCell 在 NTN 非重点 |
| 差分时延（图 4）| **核心**：跨卫星/波束的 CC 差分时延远超 CP，破坏单 TAG，是 NTN 不优先 CA 的根因 |

---

## 📚 3GPP 协议溯源表

| 仿真模块 / 数字 | 规范条款 | 内容 |
|---|---|---|
| 峰值速率公式（Σ over CC）| 38.306 §4.1.2 | UE 支持的最大数据率 |
| Rmax = 948/1024，OH 取值 | 38.306 §4.1.2 | 码率上界与开销 |
| SCell 激活时延 ~30ms | 38.133 | SCell 激活 RRM 要求 |
| 休眠态 ~3ms 唤醒 | 38.321 / 38.213 | SCell Dormancy（Rel-16）|
| 相对功耗（激活/休眠/去激活）| 38.321 §5.9 | SCell 状态行为 |
| 斜距 / 差分时延 / TAG | TR 38.821 §7；38.321 §5.2 | NTN 差分时延与 TAG |
| CP ≈ 4.7μs 作 TAG 容差参考 | 38.211 §5.3 | 普通 CP 长度量级 |

---

> **复现实验建议**：
> 1. 把 `max_cc` 调到 16，看 FR1/FR2 峰值速率冲到多高（NR 16 CC 上限）；
> 2. 把 `fr1_layers` 从 4 改成 2，观察图 1 斜率减半（层数线性影响速率）；
> 3. 把 `h_leo_km` 从 550 改成 1200（更高 LEO），看图 4 差分时延整体如何变化；
> 4. 把 `lat_dorm_to_active` 调大，模拟 CSI 周期较长时休眠态优势的削弱。
