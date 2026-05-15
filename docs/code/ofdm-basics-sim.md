> 📂 代码库导航： > [ofdm_basics_sim.py](./ofdm-basics-sim) 

# ofdm_basics_sim.py · 仿真说明文档

> **对应理论笔记**：[OFDM 基础](/phase1/ofdm-basics)
> **脚本位置**：`simulation/phase1/ofdm_basics_sim.py`
> **验证目标**：通过时域波形包络、PAPR CCDF 曲线、信道估计和 BER 对比，验证 3GPP 38.211 §5.3/§6.3 中 CP-OFDM 与 DFT-s-OFDM 的物理特性差异，以及 CFO（载波频率偏差）对 OFDM 正交性的影响。

---

## ⚡ 一分钟速览

```
这个脚本在验证什么？

CP-OFDM（下行标准波形）：
  QAM 符号 → IFFT → 加 CP → 发射
  PAPR ≈ 10~12 dB  （N 个子载波随机叠加，峰值高）

DFT-s-OFDM（上行可选波形）：
  QAM 符号 → M 点 DFT → 子载波映射 → IFFT → 加 CP → 发射
  PAPR ≈ 4~8 dB   （等效单载波，能量均匀分布）

π/2-BPSK + DFT-s-OFDM（NTN 上行极限覆盖）：
  PAPR ≈ 0~2 dB   （恒包络近似）

CFO 影响：
  CFO/SCS = 1.3%（200Hz @ 15kHz）→ BER 几乎不变   ← NTN 预补偿后的残余
  CFO/SCS = 33%（5kHz @ 15kHz）  → BER 崩溃        ← 未补偿的灾难场景
```

**运行后你会得到 4 张图**：
- `output_ofdm_waveforms.png`：三种波形的时域包络对比
- `output_papr_ccdf.png`：PAPR CCDF 曲线（标准评估指标）
- `output_channel_estimation.png`：DMRS 信道估计质量对比
- `output_ber_ofdm.png`：BER vs SNR（四场景对比，含 CFO 影响）

---

## 🛠️ 环境配置

```bash
# 安装依赖
pip install torch numpy matplotlib scipy

# 运行（从 simulation/phase1/ 目录执行）
cd simulation/phase1
python ofdm_basics_sim.py
```

**预计运行时间**：

| 模块 | 预计时间 | 说明 |
|---|---|---|
| 时域波形 | < 5 秒 | 直接生成 |
| PAPR CCDF | 30~60 秒 | 3000 个符号 × 3 种波形 |
| 信道估计 | < 5 秒 | — |
| BER vs SNR | 2~5 分钟 | 30 次 trial × 多 SNR 点 |

---

## 📐 数学–代码对照

### 对照 1：CP-OFDM 调制核心（38.211 §5.3.1）

**协议公式**：

$$
s[n] = \frac{1}{N} \sum_{k=0}^{N-1} a_k \cdot e^{j2\pi kn/N} = \mathcal{F}^{-1}\{a_k\}
$$

**对应代码**（`CPOFDMModulator.forward`）：

```python
# OFDM 调制 = IFFT（一行完成协议公式）
time = torch.fft.ifft(freq_syms, n=self.n_fft, dim=-1, norm='ortho')

# CP = 末尾 N_cp 个采样的复制
cp = time[..., -self.n_cp:]

# 拼接：CP 在前，有效符号在后
return torch.cat([cp, time], dim=-1)
```

**解调（接收端）**：

```python
# 去除 CP（丢弃前 N_cp 个采样）
no_cp = rx[..., self.n_cp:]

# OFDM 解调 = FFT
freq = torch.fft.fft(no_cp, n=self.n_fft, dim=-1, norm='ortho')

# 单抽头均衡（CP 保证了循环卷积前提）
if channel_h is not None:
    freq = freq / (channel_h + 1e-9)    # 复数除法，一步完成
```

---

### 对照 2：DFT-s-OFDM（38.211 §6.3.1）

**协议原理**：在 IFFT 之前插入 M 点 DFT，将 QAM 符号"扩频"到频域，等效单载波，PAPR 显著降低。

$$
\tilde{a}[k] = \text{DFT}_M\{a[m]\}, \quad m = 0,\ldots,M-1
$$

**对应代码**（`DFTsOFDMModulator.forward`）：

```python
# Step 1：M 点 DFT 扩频（核心区别所在）
spread = torch.fft.fft(qam_syms, n=self.M, dim=-1, norm='ortho')

# Step 2：映射到 N 个 OFDM 子载波的子集
freq = torch.zeros(..., self.n_fft, dtype=torch.cfloat)
freq[..., self.k_start:self.k_start + self.M] = spread

# Step 3：N 点 IFFT + CP（与 CP-OFDM 完全相同）
time = torch.fft.ifft(freq, n=self.n_fft, dim=-1, norm='ortho')
cp   = time[..., -self.n_cp:]
return torch.cat([cp, time], dim=-1)
```

**为什么等效单载波**：当 M=N 时，IFFT(FFT(x)) = x，输出就是原始符号序列——这就是单载波，PAPR 最低。

---

### 对照 3：PAPR 定义与 CCDF

**协议定义**：

$$
\text{PAPR} = \frac{\max_n |s[n]|^2}{\mathbb{E}[|s[n]|^2]}
$$

**CCDF（互补累积分布函数）**——标准评估方法：

$$
\text{CCDF}(x) = P(\text{PAPR} > x)
$$

**对应代码**（`compute_papr_ccdf`）：

```python
# 每个符号计算一次 PAPR
papr_db = 10 * np.log10(signal.abs().pow(2).max() /
                         signal.abs().pow(2).mean())
papr_list.append(papr_db)

# CCDF：超过各阈值的概率
ccdf = np.array([(papr_arr > t).mean() for t in thresholds])
```

---

### 对照 4：DMRS 信道估计（LS 估计 + 线性插值）

**协议原理**（38.211 §7.4.1）：在已知 DMRS 值的子载波位置做最小二乘信道估计，再插值到数据子载波。

$$
\hat{H}[k_\text{DMRS}] = \frac{R[k_\text{DMRS}]}{\text{DMRS}[k_\text{DMRS}]}
$$

**对应代码**（`demo_dmrs_channel_estimation`）：

```python
# LS 估计（DMRS 位置）
H_est_dmrs = freq_rx[dmrs_positions] / dmrs_values

# 线性插值到所有子载波
H_interp = np.interp(
    k_all,                   # 目标：全部子载波
    dmrs_positions,          # 已知点：DMRS 位置
    H_est_dmrs.real          # 已知值：LS 估计结果
) + 1j * np.interp(k_all, dmrs_positions, H_est_dmrs.imag)

# 单抽头均衡
equalized = freq_rx / (H_interp + 1e-9)
```

---

### 对照 5：CFO 的时域表现（ICI 根源）

**物理原理**：载波频率偏差在时域表现为线性相位旋转，FFT 后在频域产生 ICI（子载波间干扰）。

$$
r[n] = s[n] \cdot e^{j2\pi \varepsilon n / N}, \quad \varepsilon = \frac{\Delta f_\text{CFO}}{\Delta f_\text{SCS}}
$$

**对应代码**（`CFOChannel.forward`）：

```python
# 归一化 CFO
self.cfo_normalized = cfo_hz / (scs_hz * n_fft)

# 时域相位旋转（物理上正确的 CFO 建模方式）
n   = torch.arange(len(tx), dtype=torch.float32)
rot = torch.exp(1j * 2 * np.pi * self.cfo_normalized * n).to(torch.cfloat)
rx  = tx * rot      # 乘以相位旋转因子
```

---

## ⚙️ 仿真参数说明

| 参数 | 默认值 | 物理含义 | 修改建议 |
|---|---|---|---|
| `N_FFT` | `256` | FFT 点数（子载波数）| 改为 `1024` 更接近真实系统 |
| `N_CP` | `N_FFT × 0.072` | Normal CP 长度（≈7.2%）| 改小至 0.03 触发 ISI |
| `M`（DFT-s）| `N_FFT // 2` | 扩频因子 | 改为 `N_FFT` 获得最低 PAPR |
| `n_symbols`（CCDF）| `3000` | PAPR 统计样本数 | 增至 `10000` 提升精度 |
| `snr_db`（信道估计）| `15.0` | 信道估计演示 SNR | 改为 `5` 观察低 SNR 下插值误差 |
| CFO 场景 1 | `200 Hz` | NTN 预补偿后残余多普勒 | — |
| CFO 场景 2 | `5000 Hz` | 未预补偿的 NTN 多普勒（灾难）| — |
| `dmrs_positions` | 每 4 个子载波 1 个 | DMRS 密度（Type 1 简化）| 改为每 2 个验证高密度效果 |

---

## 📊 预期输出图表解读

### 图 1：`output_ofdm_waveforms.png`

```
三行子图，从上到下：CP-OFDM / DFT-s-OFDM / π/2-BPSK DFT-s

X 轴：采样点序号；Y 轴：信号幅度包络 |s[n]|
实线 = 瞬时包络；虚线 = 平均功率；点线 = 峰值

关键观察（右上角标注 PAPR 值）：
  CP-OFDM：包络剧烈波动，峰值显著高于均值，PAPR ≈ 10~12 dB
  DFT-s-OFDM：包络相对平坦，PAPR ≈ 6~8 dB
  π/2-BPSK：包络几乎恒定，PAPR ≈ 0~2 dB

工程含义：PAPR 越低 → 功放工作点越靠近饱和区 →
          同等发射功率下，覆盖半径更大（NTN 上行首选）
```

### 图 2：`output_papr_ccdf.png`

```
X 轴：PAPR 阈值（dB）；Y 轴：超过该阈值的概率（对数坐标）
三条曲线：CP-OFDM（蓝）/ DFT-s-OFDM（绿）/ π/2-BPSK（橙）

读法示例（CCDF = 1% 参考点）：
  CP-OFDM：PAPR 超过 ~11.5 dB 的概率为 1%
  DFT-s-OFDM：PAPR 超过 ~7.5 dB 的概率为 1%
  π/2-BPSK：PAPR 超过 ~3 dB 的概率为 1%

3 条曲线的水平距离差 ≈ 4~6 dB → PA backoff 节省量
换算：每节省 6 dB backoff → 覆盖半径扩大约 2 倍（自由空间路损）

异常情况：若 DFT-s-OFDM 曲线与 CP-OFDM 重叠
  → 检查 M 是否等于 N_FFT（M=N_FFT 时才能达到最低 PAPR）
```

### 图 3：`output_channel_estimation.png`

```
左图：信道实部（频率响应）；右图：信道虚部

三条曲线：
  紫色实线 = 真实信道 H[k]（3 径多径）
  蓝色虚线 = 插值估计 H_est[k]
  绿色散点 = DMRS 测量点（每 4 个子载波 1 个）

关键观察：
  ① DMRS 测量点（绿点）与真实信道（紫线）应基本重合
  ② 插值曲线（蓝虚线）在 DMRS 密集处精度高，稀疏处有误差
  ③ 信道快速变化处（峰谷附近）插值误差最大

改进实验：将 dmrs_positions 改为每 2 个子载波 1 个，
  观察插值误差是否显著减小（对应 Additional DMRS 的效果）
```

### 图 4：`output_ber_ofdm.png`

```
四条曲线：
  蓝色 = CP-OFDM 理想（基线）
  绿色 = DFT-s-OFDM 理想（应与蓝色基本重合）
  橙色 = CP-OFDM + CFO 200Hz（NTN 残余）← 应接近基线
  红色 = CP-OFDM + CFO 5kHz（未补偿）  ← 应远差于基线

关键验证：
  ① DFT-s-OFDM vs CP-OFDM：BER 相近（波形不同，信息传输等效）
  ② CFO 200Hz（1.3% of SCS）：几乎无影响 → 预补偿有效性验证
  ③ CFO 5kHz（33% of SCS）：BER 跳升明显 → ICI 灾难场景

工程结论：NTN 预补偿后残余 200Hz 对 μ=1（SCS=30kHz）完全可接受
```

---

## 🔬 NTN Context

::: info NTN 提示 · Rel-17 (38.821 §6.3)

**DFT-s-OFDM 是 NTN 上行链路的首选**：LEO 卫星上行路损约 159 dB（S-band @ 1000km），UE 发射功率受限，CP-OFDM 的高 PAPR 会导致 PA 工作在非线性区，等效发射功率损失 4~6 dB。切换到 DFT-s-OFDM 可直接回收这 4~6 dB，覆盖半径扩大约 30%。

**π/2-BPSK 的 NTN 场景**：Rel-17 在 Msg3（PRACH 后首次 PUSCH）的配置中增强了对 π/2-BPSK + DFT-s-OFDM 的支持，专门面向覆盖受限的边缘 UE。

**CFO 与预补偿的关系**：仿真中 CFO=200Hz 代表 UE 完成 GNSS 定位 + 星历计算后的残余多普勒误差。将 `freq_hz` 改为 `20e9`（Ka-band）重新计算最大多普勒（≈506kHz），但预补偿后残余仍应控制在 200Hz 以内——这对应 UE 星历精度约 10m 级别（GNSS 定位精度）。

**DMRS 密度的 NTN 考量**：LEO 卫星运动速度 7.6km/s，信道时变性比地面快得多。高仰角时信道相对稳定，低仰角（覆盖边缘）时需增加 DMRS 密度（`dmrs-AdditionalPosition`），避免插值误差过大。

:::

---

## 📎 3GPP 协议溯源

| 代码模块 | 对应协议 | 章节 |
|---|---|---|
| `CPOFDMModulator` | TS 38.211 | §5.3.1（CP-OFDM 波形生成）|
| `DFTsOFDMModulator` | TS 38.211 | §6.3.1（DFT-s-OFDM）|
| `pi2bpsk_mod()` | TS 38.211 | §6.3.1.2（π/2-BPSK）|
| `compute_papr_ccdf()` | TS 38.101-1 | §6.4.2（PAPR 要求，FR1 PUSCH）|
| `CFOChannel` | TS 38.104 | §7.4（EVM 要求，隐含 CFO 容忍度）|
| `demo_dmrs_channel_estimation()` | TS 38.211 | §7.4.1.1（PDSCH DMRS Type 1）|
| DMRS 位置（每 4 子载波）| TS 38.211 | §7.4.1.1.2（Type 1，Port 0）|
| Normal CP 长度（7.2%）| TS 38.211 | §4.3，Table 5.3.1-1 |
