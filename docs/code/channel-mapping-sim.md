# channel_mapping_sim.py · 仿真说明文档

> **对应理论笔记**：[信道映射 Channel Mapping](/phase1/channel-mapping)
> **脚本位置**：`simulation/phase1/channel_mapping_sim.py`
> **验证目标**：通过星座图、RE 分配可视化、BER 曲线和 PRACH 相关检测，验证 3GPP 38.211/38.212 中物理信道处理链路的核心操作——QAM 调制、PDSCH 加扰、PDCCH RNTI 掩码和 ZC 序列特性。

---

## ⚡ 一分钟速览

```
这个脚本在验证什么？

Transport Block
  → CRC + LDPC 编码（38.212 §7.2）
  → 加扰（RNTI + Cell ID 生成 PRBS，XOR）
  → QAM 调制（QPSK/16QAM/64QAM/256QAM）
  → 层映射（最多 4 层）
  → 映射到资源网格 RE（跳过 DMRS）

PDCCH：固定 QPSK + Polar Code + RNTI 掩码 CRC
PRACH：ZC 序列（恒包络，完美自相关）→ 相关检测 → TA 估计

核心结论：
  ① 不同 RNTI 的加扰序列差异率 ≈ 50%（防止 UE 误收他人 DCI）
  ② ZC 根序列不同时互相关极低（gNB 同时检测多 UE Preamble 的基础）
```

**运行后你会得到 4 张图 + 终端验证**：
- `output_constellations.png`：四种 QAM 星座图（含 AWGN 接收点）
- `output_re_allocation.png`：时频资源网格 RE 占用分布图
- `output_ber_curves.png`：BER vs SNR（QPSK ~ 256QAM 无编码）
- `output_prach_detection.png`：ZC 序列相关检测（匹配 vs 不匹配）

---

## 🛠️ 环境配置

```bash
# 安装依赖
pip install torch numpy matplotlib

# 运行（从 simulation/phase1/ 目录执行）
cd simulation/phase1
python channel_mapping_sim.py
```

**预计运行时间**：约 3~5 分钟（主要消耗在 BER 统计循环）。

---

## 📐 数学–代码对照

### 对照 1：QAM 调制（38.211 §7.3.1.2）

**协议原理**：Gray 编码将连续 $Q_m$ 个比特映射为一个复数星座点，归一化使平均功率为 1。

$$
\text{QPSK}:\ Q_m=2,\quad \text{16QAM}:\ Q_m=4,\quad \text{64QAM}:\ Q_m=6,\quad \text{256QAM}:\ Q_m=8
$$

**对应代码**（`QAMModulator._build_constellation`）：

```python
# Gray 编码：相邻星座点只有 1 bit 不同，最小化误判时的误码数
pam = torch.arange(half, dtype=torch.float32)
gray = pam ^ (pam >> 1)              # XOR 实现 Gray 编码
levels = 2 * gray - (half - 1)      # 中心化

# 归一化到单位平均功率
power = (const.abs() ** 2).mean()
const = const / power.sqrt()
```

**验证方法**：看 `output_constellations.png`，256QAM 应有 16×16=256 个点，且相邻点间距均匀。

---

### 对照 2：PDSCH 加扰（38.212 §7.3.1.1）

**协议公式**：

$$
c_\text{init} = n_\text{RNTI} \times 2^{15} + q \times 2^{14} + n_\text{ID}
$$

其中 $n_\text{ID}$ = `dataScramblingIdentityPDSCH`（若配置），否则 = Cell ID。

**对应代码**（`pdsch_scramble` 函数）：

```python
n_id   = data_scrambling_id if data_scrambling_id is not None else cell_id
c_init = (rnti * (2 ** 15) + q * (2 ** 14) + n_id) % (2 ** 31)
prbs   = generate_prbs(len(bits), c_init)   # Gold 序列（38.212 §5.2.1）
return (bits + prbs) % 2                    # XOR 操作
```

**为什么加扰能防止误收**：不同 RNTI 生成完全不同的 PRBS 序列，UE 用错误的 RNTI 解扰后比特流随机化，CRC 必然失败。终端输出验证：不同 RNTI 的扰码差异率应接近 50%。

---

### 对照 3：ZC 序列（38.211 §6.3.3.1）

**协议公式**：

$$
x_u(n) = e^{-j\pi u n(n+1) / N_\text{ZC}}, \quad n = 0, 1, \ldots, N_\text{ZC}-1
$$

**关键特性**：
- 恒包络：$|x_u(n)| = 1$（PAPR = 0 dB）
- 完美自相关：循环自相关为 $\delta$ 函数
- 低互相关：不同根 $u \neq v$ 时 $|R_{uv}(\tau)| = 1/\sqrt{N_\text{ZC}}$

**对应代码**（`generate_zc_sequence`）：

```python
n     = torch.arange(N_zc, dtype=torch.float64)
phase = -torch.pi * u * n * (n + 1) / N_zc   # 38.211 Eq.6.3.3.1-2
seq   = torch.complex(torch.cos(phase), torch.sin(phase))
```

**相关检测实现**（频域实现，等效时域循环相关）：

```python
# 频域乘法 = 时域循环相关（FFT 卷积定理）
freq_rx  = torch.fft.fft(rx_signal[:N_zc])
freq_ref = torch.fft.fft(reference)
corr     = torch.fft.ifft(freq_rx * freq_ref.conj()).abs()
# 相关峰位置 = TA 估计（采样数）
peak_val, peak_idx = corr.max(dim=0)
```

---

### 对照 4：PDCCH RNTI 掩码（38.212 §7.3.2）

**协议原理**：CRC 后 16 bit 与 RNTI 进行 XOR，UE 解码时用自身 RNTI 还原，若 CRC 通过则确认"这条 DCI 是给我的"。

**对应代码**：

```python
rnti_bits     = [(rnti >> (15-i)) & 1 for i in range(16)]
result[-16:]  = (crc_bits[-16:] + rnti_bits) % 2   # XOR 掩码
```

---

## ⚙️ 仿真参数说明

| 参数 | 默认值 | 物理含义 | 修改建议 |
|---|---|---|---|
| `n_rb` | `52` | 资源网格显示的 RB 数 | 改为 `106` 模拟宽 BWP |
| `n_symbols` | `14` | 一个 slot 的符号数（Normal CP）| 固定值，不建议修改 |
| `coreset_rb_size` | `48` | CORESET 频域大小（必须为 6 的倍数）| 改为 `24` 模拟窄 CORESET |
| `coreset_symbols` | `2` | CORESET 时域符号数（1/2/3）| — |
| `n_fft` | `128` | RE 分配图的子载波数 | — |
| `snr_range` | `-5~30 dB` | BER 曲线的 SNR 扫描范围 | — |
| `n_symbols_ber` | `5000` | BER 统计样本数 | 增大至 `50000` 提升精度 |
| `N_zc` | `839` | ZC 序列长度（FR1 PRACH 标准值）| 另一标准值为 `139`（FR2）|

---

## 📊 预期输出图表解读

### 图 1：`output_constellations.png`

```
四列子图，从左到右：QPSK / 16QAM / 64QAM / 256QAM

蓝色大点 = 理想星座点（无噪声）
灰色小点 = SNR=15dB 时的接收点（AWGN 散布）

关键观察：
  ① QPSK 只有 4 个点，间距最大，最抗噪声
  ② 256QAM 有 256 个点（16×16 网格），点间距极小
     → SNR 需要 > 25dB 才能可靠解调
  ③ 所有星座图平均功率 = 1（归一化验证）

异常情况：若 256QAM 的点排列不是 16×16 均匀网格
  → Gray 编码实现有误，检查 _build_constellation 函数
```

### 图 2：`output_re_allocation.png`

```
X 轴：OFDM 符号编号（#0~#13，一个完整 slot）
Y 轴：子载波编号（频域，低→高）

颜色含义：
  红色  = PDCCH（前 2 个符号，CORESET 范围内）
  绿色  = DMRS（解调参考信号，符号 #2，每 RB 固定图样）
  蓝色  = PDSCH（有效数据，符号 #2~#13，跳过 DMRS RE）
  暗色  = 空 RE（未分配）

关键观察：
  ① PDCCH 占据前 2 个符号的全部 CORESET 频域范围
  ② 符号 #2 同时有 DMRS（绿色）和 PDSCH（蓝色）
     → DMRS 只占每 RB 部分子载波（Type 1：每 2 个子载波 1 个）
  ③ PDSCH 数据量 = 总 RE - PDCCH RE - DMRS RE

异常情况：若 PDCCH 和 PDSCH 颜色重叠 →
  检查 coreset_rb_size 是否超过 n_rb
```

### 图 3：`output_ber_curves.png`

```
X 轴：SNR（dB）；Y 轴：BER（对数坐标）
四条曲线对应 QPSK / 16QAM / 64QAM / 256QAM

注意：这是无 FEC 编码的裸 BER
实际系统中 LDPC 编码增益约 3~7dB（曲线整体左移）

参考点（无编码 AWGN 理论值）：
  QPSK    BER=1e-3 → 需要 SNR ≈ 7 dB
  16QAM   BER=1e-3 → 需要 SNR ≈ 13 dB
  64QAM   BER=1e-3 → 需要 SNR ≈ 19 dB
  256QAM  BER=1e-3 → 需要 SNR ≈ 25 dB

若实际曲线偏右 > 2dB → 检查 QAMModulator 归一化是否正确
```

### 图 4：`output_prach_detection.png`

```
左图（匹配检测，u=1 vs u=1）：
  应出现明显的单一相关峰，峰值远高于噪声底
  峰值位置 = 0（无时延时），或等于引入的时延采样数（TA 估计）

右图（不匹配检测，u=1 vs u=37）：
  应无明显峰值，全程接近噪声底
  → 验证 ZC 序列的低互相关特性

峰噪比（SNR_est）：
  匹配时应 > 15dB（取决于信号 SNR 输入）
  不匹配时应接近 0dB

NTN 扩展实验：在 detect_prach_preamble 中引入
  tau_samples = int(2328746e-9 * fs_hz)  # 远点时延 = 2.33ms
  观察相关峰是否精确移位到该位置（TA 估计精度验证）
```

---

## 🔬 NTN Context

::: info NTN 提示 · Rel-17 (38.821 + 38.211)

**PRACH 在 NTN 中的核心挑战不是 ZC 序列，而是时序**：ZC 序列本身不变，但 gNB 需要将 `ra-ResponseWindow` 扩展至最大 640 slots（Rel-17），否则 UE 发出 Preamble 后，等待 RAR 时窗口已关闭。

**TA 估计精度**：相关峰位置对应的采样偏移就是 TA 估计值。LEO 近点时延 ≈ 1.73ms，对应 ZC 序列中约 `int(1.73e-3 * 1.28e6)` ≈ 2214 个采样（采样率 1.28 MHz 时）。在 `detect_prach_preamble` 中手动引入这个偏移，验证 TA 估计是否精确。

**NTN 的 PRACH 加扰**：Rel-17 允许 UE 在发送 Preamble 前做频率预补偿，使到达基带时的频偏 < 几百 Hz，ZC 序列的正交性得以保持。若不做预补偿，Ka-band 多普勒会破坏 ZC 自相关特性，导致 gNB 检测失败。

**PUCCH Format 3 与 NTN**：本脚本的 QAMModulator 支持未来扩展为 π/2-BPSK（在 `channel_mapping_sim.py` 的 `pi2bpsk_mod` 函数中已预留接口），这是 NTN 上行 PUCCH Format 3 的首选调制方式，PAPR 接近 0dB。

:::

---

## 📎 3GPP 协议溯源

| 代码模块 | 对应协议 | 章节 |
|---|---|---|
| `QAMModulator` | TS 38.211 | §7.3.1.2（DL），§6.3.1.2（UL）|
| `generate_prbs()` | TS 38.212 | §5.2.1（Gold 序列生成）|
| `pdsch_scramble()` | TS 38.212 | §7.3.1.1（加扰初始化公式）|
| `pdcch_rnti_mask()` | TS 38.212 | §7.3.2（RNTI 掩码 CRC）|
| `generate_zc_sequence()` | TS 38.211 | §6.3.3.1（ZC 序列）|
| `detect_prach_preamble()` | TS 38.211 | §6.3.3（PRACH 前导检测）|
| `visualize_resource_grid_allocation()` | TS 38.211 | §7.4.1（PDSCH DMRS 图样）|
| RNTI 类型表 | TS 38.213 | §10（RNTI 定义与用途）|
