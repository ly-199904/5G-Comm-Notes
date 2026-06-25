> 📂 代码库：`simulation/phase1/numerology_sim.py`

# numerology_sim.py · 仿真说明文档

> **对应理论笔记**：[Numerology + 帧结构](/phase1/numerology)
> **脚本位置**：`simulation/phase1/numerology_sim.py`
> **验证目标**：通过时域波形和 BER 曲线，验证 3GPP 38.211 §4.2/§5.3 中 SCS/μ 参数对帧结构时序和 OFDM 符号时长的影响，以及 NTN 场景下多普勒预补偿的有效性。

---

## ⚡ 一分钟速览

```
这个脚本在验证什么？

μ=0 (15kHz) ──→ 符号时长 66.67μs ──→ Slot = 1ms   ──→ 每帧 140 个符号
μ=1 (30kHz) ──→ 符号时长 33.33μs ──→ Slot = 500μs ──→ 每帧 280 个符号
μ=3 (120kHz)──→ 符号时长 8.33μs  ──→ Slot = 125μs ──→ 每帧 1120 个符号

核心结论：μ 每增加 1，所有时域尺度减半，调度灵活性翻倍，但处理预算减半。

NTN 核心结论：LEO S-band 最大多普勒 ≈ 34kHz，远超 SCS，
              预补偿后残余 < 200Hz，μ=0 可正常工作。
```

**运行后你会得到 3 张图 + 1 份终端报告**：
- `numerology_waveform.png`：不同 μ 下的时域波形 + 频谱 + 符号时长条形图
- `output_ntn_ber.png`：NTN 多普勒 BER 对比（无补偿 vs 预补偿）
- `output_cp_demo.png`：CP 多径保护原理（星座图对比）
- 终端：Numerology 参数表 + 梯度流验证报告

---

## 🛠️ 环境配置

```bash
# 一键安装依赖
pip install torch numpy matplotlib scipy

# 验证安装
python -c "import torch, numpy, matplotlib; print('✅ 环境就绪')"

# 运行脚本（从 simulation/phase1/ 目录执行）
cd simulation/phase1
python numerology_sim.py
```

**版本要求**：

| 依赖 | 最低版本 | 说明 |
|---|---|---|
| Python | 3.9+ | f-string + dataclass 支持 |
| PyTorch | 2.0+ | `torch.fft.ifft` API |
| NumPy | 1.24+ | — |
| Matplotlib | 3.7+ | — |

---

## 📐 数学–代码对照

### 对照 1：SCS 与符号时长（38.211 §4.2）

**协议公式**：

$$
\Delta f = 2^{\mu} \times 15\ \text{kHz}, \qquad T_{\text{symbol}} = \frac{1}{\Delta f}
$$

**对应代码**（`get_numerology` 函数）：

```python
# 38.211 Eq.4.2-1
scs_hz = (2 ** mu) * 15_000          # Δf = 2^μ × 15kHz
t_symbol_us = 1e6 / scs_hz           # T_symbol = 1/Δf（单位 μs）
```

**验证方法**：运行后看终端输出的参数表，每行 `Symbol+CP(μs)` 列应与 38.211 Table 4.3.2-1 完全一致。

---

### 对照 2：每帧 Slot 数（38.211 §4.3.2）

**协议公式**：

$$
N_{\text{slot}}^{\text{frame},\mu} = 10 \times 2^{\mu}
$$

**对应代码**：

```python
slots_per_frame = 10 * (2 ** mu)      # 每帧 slot 数
slot_duration_us = 1e3 / slots_per_sf  # T_slot = 1ms / 2^μ（μs）
```

---

### 对照 3：OFDM 调制核心——IFFT（38.211 §5.3.1）

**协议公式**：

$$
s[n] = \frac{1}{N} \sum_{k=0}^{N-1} a_k \cdot e^{j2\pi kn/N} = \mathcal{F}^{-1}\{a_k\}
$$

**对应代码**（`OFDMModulator.forward`）：

```python
# 调制 = IFFT（一行完成协议公式）
time_domain = torch.fft.ifft(freq_symbols, n=self.n_fft, dim=-1, norm='ortho')
# CP = 复制末尾 N_cp 个采样
cp = time_domain[..., -self.n_cp:]
# 拼接：CP + 有效符号
tx_signal = torch.cat([cp, time_domain], dim=-1)
```

**为什么用 PyTorch 而非 NumPy**：`torch.fft.ifft` 保留梯度，使整条调制链路可微——这是 Deep Unfolding 接收机的基础。

---

### 对照 4：NTN 多普勒频移（38.821 §6.3）

**协议公式**：

$$
f_d = \frac{v_r}{c} \times f_c
$$

**对应代码**（`NTNDopplerChannel.__init__`）：

```python
# 轨道速度（由万有引力决定）
GM = 3.986e14
r_m = (RE_KM + altitude_km) * 1e3
self.v_leo_mps = np.sqrt(GM / r_m)       # ≈ 7590 m/s (550km LEO)

# 最大多普勒（径向速度最大时）
self.fd_max_hz = (self.v_leo_mps / C_MPS) * freq_hz   # S-band ≈ 50.6kHz
```

---

## ⚙️ 仿真参数说明

| 参数 | 默认值 | 物理含义 | 修改建议 |
|---|---|---|---|
| `mu_list` | `[0, 1, 3]` | 要对比的 Numerology | 加入 `2` 观察 Extended CP |
| `n_fft` | `128` | FFT 点数（子载波数）| 改为 `1024` 更接近真实系统 |
| `altitude_km` | `550` | LEO 轨道高度（Starlink）| 改为 `1200` 模拟 OneWeb |
| `freq_hz` | `2e9` | 载频（S-band）| 改为 `20e9` 模拟 Ka-band DL |
| `n_symbols` | `50` | 每 SNR 点仿真符号数 | 增大至 `500` 提升 BER 精度 |
| `snr_range` | `-5 ~ 25 dB` | SNR 扫描范围 | — |

---

## 📊 预期输出图表解读

### 图 1：`numerology_waveform.png`

```
包含 3 行子图（对应 mu_list=[0,1,3]）+ 底部条形图

上方每行：左图 = 时域波形（蓝色=有效符号，红色=CP）
           右图 = 频域功率谱（stem 图，子载波间隔随 μ 增大）
底部：    符号时长对比条形图

关键观察：
  ① 从 μ=0 到 μ=3，时域波形被"压缩"为原来的 1/8
  ② 频域子载波间距从 15kHz 扩大到 120kHz（等比放大）
  ③ CP（红色区域）的绝对时长也同步缩短
```

### 图 2：`output_ntn_ber.png`

```
左图：BER vs SNR 三条曲线
  蓝色：Case A（无多普勒，基线）
  红色：Case B（全量多普勒，无补偿）→ BER 几乎不随 SNR 改善（ICI 下限）
  绿色：Case C（预补偿，残余 200Hz）→ 接近 Case A

右图：fd_max / SCS 相对比例条形图
  结论：即使 μ=3（120kHz），S-band 多普勒仍达 42%
        → 加大 SCS 不能解决问题，预补偿是唯一出路

异常情况：若 Case C 明显差于 Case A（差距 > 3dB），
  检查 residual_hz 参数是否设置正确（应为 200，非 200000）
```

### 图 3：`output_cp_demo.png`

```
三列星座图：
  左：发送端 QPSK（理想 4 个点）
  中：CP 足够时接收端（4 个点，轻微噪声扩散）← 正常
  右：CP 不足时（星座图混乱）← 多径 ISI 破坏正交性

验证的物理特性：T_CP ≥ τ_max 是 OFDM 正交性的充要条件
```

---

## 🔬 NTN Context

::: info NTN 提示 · Rel-17 (38.821)

**CP 长度在 NTN 中不是瓶颈**：LEO 信道由 LOS 主导，多径时延扩展 < 5μs，Normal CP（μ=0 时 4.69μs）完全覆盖。修改 `altitude_km` 不会改变 CP 是否足够的结论。

**多普勒是真正的挑战**：将 `freq_hz` 改为 `20e9`（Ka-band DL），你会看到 `fd_max` 跳至 506kHz，是 SCS 的 3373%——任何 Numerology 都无法硬抗。

**NTN 的 μ 选择**：Rel-17 推荐 μ=0 或 μ=1，原因不是它们"抗多普勒能力强"，而是预补偿后残余 < 200Hz，μ=0 的 SCS（15kHz）已经足够，且 HARQ 时序开销最小（参见 38.821 §6.3.3）。

**快速实验**：将 `NTNDopplerChannel` 的 `freq_hz` 改为 `20e9`，观察 Case C 的 BER 曲线是否仍然接近 Case A——验证预补偿在 Ka-band 同样有效。

:::

---

## 📎 3GPP 协议溯源

| 代码模块 | 对应协议 | 章节 |
|---|---|---|
| `get_numerology()` | TS 38.211 | §4.2（Table 4.2-1），§4.3.2（Table 4.3.2-1）|
| `OFDMModulator` | TS 38.211 | §5.3.1（Eq.5.3.1-1）|
| `NTNDopplerChannel` | TR 38.821 | §6.3.3（UE 预补偿架构）|
| `generate_prbs()` | TS 38.212 | §5.2.1（Gold 序列）|
| CP 长度参数 | TS 38.211 | §4.3，Table 5.3.1-1 |
| `verify_gradient_flow_through_fft()` | — | Deep Unfolding 基础验证 |
