# si_paging_sim.py · 仿真说明文档

> **对应理论笔记**：[系统消息与寻呼：SIB / Paging](/phase3/si-paging)
> **脚本位置**：`simulation/phase3/si_paging_sim.py`
> **验证目标**：用系统级模型验证 38.304 §7.1 寻呼 PF/PO 公式的统计行为（负荷分布与碰撞），量化 NTN 大波束的寻呼容量瓶颈（vs `maxNrofPageRec=32`），刻画寻呼时延随 DRX 周期的变化规律（DRX 周期主导、传播次要），并示意 38.331 §5.2 的 SI 调度周期层级。

---

## ⚡ 一分钟速览

```
这个脚本在验证什么？

PF/PO 公式（38.304 §7.1）：
  UE_ID = 5G-S-TMSI mod 1024
  N  = min(T, nB)            候选寻呼帧数
  Ns = max(1, nB/T)          每帧寻呼时机数
  PF: (SFN+offset) mod T = (T/N)(UE_ID mod N)
  i_s = floor(UE_ID/N) mod Ns

四张图的结论：
  ① 负荷分布：UE 按 TMSI 近似均匀散布到 N×Ns 个寻呼时机
  ② 寻呼容量：地面 ~4 记录/PO（富余）vs NTN 大波束 ~150 记录/PO（超 32 上限）
                溢出 → 顺延后续周期 → +5120 ms 时延
  ③ 寻呼时延：≈ DRX 半周期等待 + 单程传播
                DRX 周期主导（数百ms~数秒）；LEO 传播可忽略，GEO 短DRX时才显著
                —— 与 3.1 连接建立(RTT 被往返数放大而主导)恰相反
  ④ SI 调度：MIB(20ms) / SIB1(160ms) / SI-window 的周期层级
```

**运行后得到 4 张图 + 终端报告**：
- `output_paging_po_loadmap.png`：PF/PO 负荷分布直方图
- `output_paging_capacity.png`：寻呼容量（地面 vs NTN 大波束）+ 溢出时延
- `output_paging_latency_drx.png`：寻呼时延 vs DRX 周期（地面/LEO/GEO）
- `output_si_scheduling.png`：SI 调度时序（MIB/SIB1/SI-window）

> :::info 模型定位
> **系统级**模型，聚焦 PF/PO 公式的统计行为与容量/时延量级，非比特级仿真。容量图的 UE 数与寻呼比例为 busy-hour **示意值**（见参数说明），可在 `CONFIG` 自行调整以贴合你的场景。
> :::

---

## 🛠️ 环境配置

```bash
pip install numpy matplotlib
# 中文字体（关键）：
sudo apt-get install fonts-noto-cjk        # Ubuntu/Debian；macOS/Windows 通常自带

mkdir -p simulation/phase3
cd simulation/phase3
python si_paging_sim.py
```

**预计运行**：< 5 秒。脚本内置 `_setup_cjk_font()` 自动探测中文字体并设 `axes.unicode_minus=False`。

| 依赖 | 最低版本 |
|---|---|
| Python | 3.9+ |
| NumPy | 1.24+ |
| Matplotlib | 3.7+（`FancyBboxPatch`）|

---

## 📐 数学–代码对照

### 对照 1：PF/PO 公式（38.304 §7.1）—— 全脚本的核心

**公式**：

$$
N = \min(T, nB), \quad N_s = \max(1, nB/T), \quad \text{UE\_ID} = \text{5G-S-TMSI} \bmod 1024
$$
$$
\text{PF}: (\text{SFN}+\text{offset}) \bmod T = \tfrac{T}{N}(\text{UE\_ID} \bmod N), \qquad i_s = \lfloor \text{UE\_ID}/N \rfloor \bmod N_s
$$

**对应代码**（`derive_N_Ns` + `pf_po`）：

```python
def derive_N_Ns(T, nB):
    N = min(T, nB)
    Ns = max(1, nB // T)
    return N, Ns

def pf_po(ue_id, T, nB, pf_offset=0):
    uid = ue_id % 1024                                  # UE_ID = TMSI mod 1024
    N, Ns = derive_N_Ns(T, nB)
    pf_residue = ((T // N) * (uid % N) - pf_offset) % T # PF: SFN mod T 的值
    i_s = (uid // N) % Ns                               # i_s
    return pf_residue, i_s, N, Ns
```

**注意 `nB//T` 的整数除**：当 $nB<T$（如 $nB=T/4$），`nB//T = 0` → `max(1,0)=1`，即 $N_s=1$；当 $nB=2T$，`nB//T=2` → $N_s=2$。这与 3GPP "$nB$ 双重作用"一致（$nB\ge T$ 控制 $N_s$，$nB\le T$ 控制 PF 间隔）。

---

### 对照 2：寻呼时延模型

**公式**：

$$
L_{\text{paging}} \approx \underbrace{\frac{T}{2}}_{\text{平均等到下个 PO}} + \underbrace{\text{OWD}}_{\text{下行单程传播}} + T_{\text{proc}}
$$

**对应代码**（`plot_paging_latency_drx`）：

```python
mean_wait = Tms / 2.0          # 平均等待半个 DRX 周期
lat = mean_wait + owd + CONFIG["proc_ms"]
```

**验证方法**：终端报告 `T=2560ms: 等待 1280ms 主导；GEO 传播仅 +239ms`。注意 $L$ 对 $T$ 线性、对 OWD 只是加性叠加——这解释了为什么寻呼时延由 DRX 周期主导（与连接建立由 RTT 主导形成对比）。

---

### 对照 3：寻呼容量与溢出

**模型**：

$$
\text{记录/PO} \approx \frac{\text{小区 UE 数}}{N\cdot N_s}\times\text{paging\_rate}, \qquad
\text{溢出顺延周期} = \left\lceil \frac{\text{记录/PO}}{32} \right\rceil - 1
$$

**对应代码**（`plot_paging_capacity`）：

```python
subs_per_po = [pop / n_occ for pop in populations]          # 每 PO 订阅 UE
recs_per_po = [sp * rate for sp in subs_per_po]             # 每 PO 期望寻呼记录
extra_cycles = [max(0, ceil(r / cap) - 1) for r in recs_per_po]  # 溢出顺延周期数
extra_delay  = [c * T_ms for c in extra_cycles]             # 额外时延
```

**验证**：终端 `地面 3.8 记录/PO，NTN 150.0 记录/PO (上限 32)`；NTN 因 150>32 需顺延 ⌈150/32⌉−1 = 4 个周期 = +5120 ms。

---

## ⚙️ 参数说明（`CONFIG` 区）

| 参数 | 默认 | 含义 / 调参建议 |
|---|---|---|
| `T_frames` | 128 | DRX 周期（帧）∈ {32,64,128,256} |
| `nB` | 32 | PCCH 的 nB（帧）。默认 T/4 → N=32, Ns=1 |
| `PF_offset` | 0 | PF 偏移 |
| `pop_loadmap` | 4000 | 负荷分布图的 UE 总数 |
| `pop_terrestrial` | 3000 | 地面宏小区 UE 数（示意）|
| `pop_ntn_beam` | 120000 | **NTN LEO 大波束 UE 数**（覆盖面积大，IoT 海量；调它看容量压力）|
| `paging_rate` | 0.04 | 每 DRX 周期被寻呼比例（busy-hour 示意）|
| `maxNrofPageRec` | 32 | 单寻呼消息最大记录数（3GPP 固定）|
| `T_list_frames` | [32,64,128,256] | 时延图的 DRX 周期扫描 |
| `owd_*_ms` | 0.5/5/239 | 地面/LEO/GEO 下行单程传播 |
| `ssb_period_ms` / `sib1_period_ms` | 20 / 160 | SI 时序图的 MIB/SIB1 周期 |
| `si_msgs` | 见脚本 | (名称, 周期ms, 窗口起点ms, 是否广播) |

> **想复现自己网络的寻呼容量？** 把 `pop_ntn_beam`、`paging_rate`、`nB` 改成你的实际/规划值，图 2 会即时反映是否触顶 32 上限以及溢出时延。

---

## 📊 图表解读

### 图 1 `output_paging_po_loadmap.png`：PF/PO 负荷分布
4000 个 UE 按 5G-S-TMSI 散布到 N×Ns=32 个寻呼时机，柱高 ≈ 均值 125（=总数/32），近似均匀。
**要点**：`UE_ID = TMSI mod 1024` 提供了天然的负荷均衡——UE 被确定性但近似均匀地分到各 PO，同一 PO 的 UE 被一条寻呼消息共同寻呼。

### 图 2 `output_paging_capacity.png`：寻呼容量 ★（NTN 关键）
左：每 PO 订阅 UE 数与期望寻呼记录数（对数轴），红线为 32 上限。地面 4 记录/PO 富余；NTN 150 记录/PO 远超上限。右：溢出导致的顺延时延（NTN +5120 ms）。
**要点**：NTN 大波束聚合海量 UE 是寻呼的核心容量瓶颈，与地面有量级差异。

### 图 3 `output_paging_latency_drx.png`：寻呼时延 vs DRX
左：三部署的时延随 $T$ 线性增长；LEO 与地面几乎重合，GEO 因 +239ms 传播而上移（短 DRX 时显著）。右：$T=2560$ms 下时延分解——等待 1280ms 主导，传播仅叠加。
**要点**：寻呼时延由 **DRX 周期主导**，传播只是加性叠加；省电（长 DRX）与低时延不可兼得。这与 3.1 连接建立（RTT 被往返次数放大而主导）形成鲜明对比。

### 图 4 `output_si_scheduling.png`：SI 调度时序
MIB（20ms）/ SIB1（160ms）/ SI#1-3 的周期层级，箭头示意获取链路 MIB→SIB1→SI-window。
**要点**：理解 SI 的"剥洋葱"层级与 worst-case 获取时延来源（窗口周期越长，等得越久）。

---

## 🛰️ NTN Context

| 仿真维度 | NTN 工程意义 |
|---|---|
| PF/PO 负荷分布 | 公式本身与 NTN 无关，但大波束下"同一 PO 的 UE 数"被放大数十倍 |
| 寻呼容量（图 2）| LEO 波束覆盖面积巨大 → 单 PO 寻呼记录易超 32 → 溢出顺延，是 NTN 寻呼成功率与时延的主因 |
| 寻呼时延（图 3）| NTN IoT 倾向长 DRX 省电 → 时延线性增大；GEO 传播在短 DRX 时叠加显著 |
| SI 时序（图 4）| SIB19（NTN 星历）须周期广播且有有效期；UE 必须在星历过期前重读 |

---

## 📚 3GPP 协议溯源表

| 仿真模块 / 数字 | 规范条款 | 内容 |
|---|---|---|
| PF/PO 公式（N, Ns, PF, i_s）| 38.304 §7.1 | IDLE/INACTIVE 寻呼时机计算 |
| UE_ID = 5G-S-TMSI mod 1024 | 38.304 §7.1 | 寻呼 UE 标识 |
| maxNrofPageRec = 32 | 38.331（PCCH-Message）| 单寻呼消息最大记录数 |
| SI 调度 / SI-window | 38.331 §5.2.2.3.2 | SI 消息周期与窗口 |
| MIB / SIB1 周期 | 38.331 §5.2.1 | 系统信息结构 |
| 寻呼时延 / NTN 传播 | TR 38.821 §6/§7 | NTN 寻呼与时延 |
| SIB19 星历有效期 | 38.331 §6.3.1，38.821 §6 | ntn-Config |

---

> **复现实验建议**：
> 1. 把 `nB` 从 32（T/4）改成 512（4T），观察 $N_s$ 从 1 变 4、每周期寻呼时机数翻倍、图 1 时机数增多、图 2 每 PO 负荷下降；
> 2. 把 `pop_ntn_beam` 从 12 万调到 50 万，看图 2 溢出顺延周期数如何增长；
> 3. 把 `T_list_frames` 扩展含更短周期（如 [16,32,64]），观察图 3 中 GEO 传播在短 DRX 时如何变得不可忽略。
