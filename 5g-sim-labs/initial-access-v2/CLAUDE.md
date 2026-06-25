# 5G NR 初始接入全流程交互仿真 · 项目 Instructions

## 项目目标
用一套浏览器可直接运行的交互仿真，把 5G NR 初始接入（UE 上电 → 驻网）的完整流程
"演"出来：每个关键步骤都有可操作的动画、真实数值、协议出处。
技术栈：纯静态 HTML/JS/CSS（无构建工具），SVG 动画，预计算数据嵌入。
受众：通信工程专业学生 / 入行工程师。

---

## 规划中的 Stage 列表（5G 地面场景）

## 规划中的 Stage 列表（5G 地面场景 · 9 Stage）

| Stage | 主题 | 核心教学点 |
|-------|------|-----------|
| 0 | UE 开机 | Tc 时钟基准、先验字典 |
| 1 | gNB SSB 广播 | Numerology / SSB Burst / GSCN / 时频网格 / MIB Polar 编码（TX 侧）|
| 2 | PSS 检测 | m-序列 / 零填充过采样 / 盲相关捞针 |
| 3 | SSS 检测 | 双 m-序列相乘 / N_ID¹ 解出 / PCI 合成 |
| 4 | PBCH 译码 & MIB | DMRS 信道估计+插值 / 两层解扰(夹心+自举) / Polar SCL+路径度量 / MIB 解析+SFN 拼接 / FR1-FR2 比特复用 |
| 5 | CORESET#0 盲检 | pdcch-ConfigSIB1 查表 / 时频反推 / PDCCH 盲检 / DCI 1_0 |
| 6 | SIB1 解析 | PDSCH 调度 / ASN.1 解码 / RACH 配置 + 小区驻留判决 |
| 7 | PRACH 随机接入 | Preamble / RA-RNTI / Msg1~2 / RAR + TA |
| 8 | RRC 建立 | SRB0 / Msg3~4 / 竞争解决 / 安全激活 |

终点说明：严格意义的「驻网（camping）」在 Stage 6 读完 SIB1 即完成；
Stage 7/8 属「接入」（→ RRC_CONNECTED）。完整故事讲到 RRC 建立。
PDU 会话（NAS 层）已越过 L1/L2 接入边界，规划为后续独立项目。
NTN（星地融合）场景亦为后续独立项目。

---

## 文件架构

​```
initial-access-v2/
├── CLAUDE.md              ← 本文件（Claude 每次对话开始前必读）
├── design-system.css      ← 全局样式（唯一入口，勿在 HTML 内写全局样式）
├── engine.js              ← 状态机核心（勿改 API）
├── stage-data.js          ← NR_CTX + 所有 Stage 数据字典
├── index.html             ← Hub 导航（侧边栏 + iframe）
├── stage-0-boot.html      ← ✅ 完整
├── stage-1-gnb-ssb.html   ← ✅ 完整
├── stage-2-pss.html       ← ✅ 完整（S2.0~S2.3，含频偏估计理论卡）
├── stage-3-sss.html       ← ✅ 完整（S3.0~S3.3）
├── stage-4-pbch.html      ← ✅ 完整（S4.0~S4.4，5 子步）
├── stage-5-coreset.html   ← ✅ 完整（S5.0~S5.4，5 子步）
├── stage-6-sib1.html      ← ✅ 完整（S6.0~S6.4，5 子步）
├── stage-7-prach.html     ← ✅ 完整（S7.0~S7.4，5 子步）
└── stage-8-rrc.html      ← ✅ 完整（S8.0~S8.4，5 子步）

终点说明：严格意义的「驻网（camping）」在 Stage 6 读完 SIB1 即完成；
Stage 7/8 属「接入」（→ RRC_CONNECTED）。完整故事讲到 RRC 建立。
✅ 至此 L1/L2/RRC 空口接入（AS 层）主线全部收官（Stage 0~8）。
PDU 会话（NAS 层）已越过 L1/L2 接入边界，规划为后续独立项目（见 2.0）。
NTN（星地融合）场景亦为后续独立项目。
​```

---

## 架构契约（每次开新 Stage 前必须对齐，违反必出 bug）

### 数据结构
```js
// ✅ 正确：必须用 { subSteps:[...] } 包裹
var S3 = { subSteps: [ discuss(...), sim(...), sim(...) ] };

// ❌ 错误：裸数组，subSteps=undefined，步骤切换全失效
var S3 = [ discuss(...), sim(...) ];
```

### Engine Hooks（每个 Stage HTML 必须实现）
```js
Engine.renderVizSVG  = function(subIdx){ ... };  // 返回 HTML 字符串注入 #vizContainer
Engine.onAfterRender = function(subIdx){ ... };  // DOM 就绪后启动动画
Engine.onStageExit   = function(){ ... };         // 清理所有定时器
Engine.boot({ stageIdx: N });                    // 最后一行
```

### SVG 规范（违反会导致布局错乱）
```html
<!-- ✅ 正确 -->
<svg viewBox="0 0 720 452" width="100%" height="100%" style="display:block;">

<!-- ❌ 错误 -->
<svg ... style="max-height:440px">   <!-- 不同子步骤高度不一致 -->
```
- 所有 `<text>` 加 `dominant-baseline="central"`
- 禁止在 `<text>` 内用 `&nbsp;`（改用 `&#160;`）或 HTML 标签（`<b>/<sub>` 不生效）
- 上下标写实体字符：N_ID² → `N_ID&#178;`，N_ID¹ → `N_ID&#185;`

### 动画性能规则
- **静态 DOM，只改属性**：动画只改 `fill/stroke/transform/opacity/textContent`，不每帧重建 SVG
- **例外**：数据量 < 500 节点的屏可以整图重绘（如 freq-coord、S2.2）
- 定时器必须经 `Engine.addTimer(tid)` 注册，`onStageExit` 负责清理
- 预计算数据嵌入 JS 字面量，动画不重算

---

颜色系统

参照标准：Stage 0 和 Stage 1 的配色是本项目的黄金标准。
Stage 2（PSS）因为全屏只有琥珀+灰双色被认为过于单调，新 Stage 必须避免重蹈。

1 · 各 Stage 主色
Stage主色浅色背景版用途0#1d4ed8 深蓝#f0f6ff开机/时钟（实际用色，非靛蓝）1#0891b2 青色#cffafeSSB 广播2#d97706 琥珀#fff7edPSS 检测3#7c3aed 紫色#ede9feSSS 检测4#2563eb 蓝 | #eff6ff | PBCH 译码（扰码层用紫 #7c3aed 点睛，绿留作答案色） |5#dc2626 红色#fee2e2RACH 接入6#0284c7 蓝色#e0f2feRRC 建立

2 · 为什么 Stage 0/1 好看——解剖结论
Stage 0 的三个关键手法：

渐变背景卡片：#f0f6ff → #e8f0fb 冷调渐变底，白色内容卡片浮在上面，形成空间层次
三级文字明度：主要数值用 #1d4ed8（深蓝），说明文字用 #334155（深灰），辅助注释用 #64748b（中灰）——同色系内分出主次而不用颜色数量撑
绿色只做"答案色"：#059669 绿仅在结论性语句（"直接跳过非签约频段"）出现，稀缺性让它有权威感

Stage 1 的三个关键手法：

5色语义网格：PSS=#ef4444红 / SSS=#7c3aed紫 / PBCH=#dbeafe冰蓝 / guard=#d4dce8灰 / empty=#f1f5f9白，每种颜色代表一类信号身份，颜色即注释
暖色点睛：DMRS 高亮用 #f97316 橙，从整体冷蓝调性里跳出来，视线被精确引导
局部深色翻转：MIB Polar 编码段用深色背景卡片，打破全屏浅色的单调，制造戏剧感

Stage 2 的问题对照：

全屏只有琥珀 #d97706 + 一种灰 #94a3b8，无第三色相
没有"答案/成功"专属色（Stage 0 用绿、Stage 1 用红标正确通道）
背景全部同一个 #f8fafc，无渐变、无深色局部、无层次

3 · SVG 配色执行规范
每屏必须覆盖的 5 个角色：
角色含义取色指引主角色本屏核心信号/序列当前 Stage 主色（饱和）答案色判决成功/已解出/正确路#059669 绿，或主色加粗加亮对照色错误候选/未知/次要路#94a3b8 灰（柔和，不抢戏）高光色锁定/判决/公式关键词的瞬间#dc2626 红（全屏最稀缺）底层色背景卡片/基线/辅助线主色浅色版渐变，不要纯白
三条执行红线：

❌ 主色 + 灰，缺第三色相 → 必须加入答案色或对照色
❌ 背景全部同一个浅灰 → 至少一个局部卡片用渐变或深色翻转
❌ 红色泛滥（超过 1 个用途）→ 红色只给"锁定高光"那一刻
---

## NR_CTX 全局上下文（跨 Stage 数据总线）

| 字段 | 写入 Stage | 含义 |
|------|-----------|------|
| `tc_ns` | S0 | Tc 时钟粒度（ns） |
| `gscn` / `arfcn` | S1 | 同步栅格 / NR-ARFCN |
| `ssb_case` / `scs_khz` | S1 | SSB Case / 子载波间隔 |
| `nid2` | **S2.3** | N_ID²（PSS 盲检出） |
| `nid1` | S3 | N_ID¹（SSS 解出） |
| `pci` | S3 | PCI = 3·N_ID¹ + N_ID² |
| `sfn_offset` / `hrf` | S4 | 系统帧号 / 半帧 |
| `kssb` / `mib` | S1/S4 | k_SSB / MIB 字节 |

写入用 `Engine.ctxSet(key, val)`（自动刷新顶部标签）。
**原则：只有真正检测/解码出来之后才写入**，不能"还没检测就先知"。

---

## 已完成 Stage 的实现要点备忘

### Stage 1 · gNB SSB 广播（S1.0~S1.4）★ 已完整
  最复杂的 Stage，960 个 rect 静态 DOM，动画只切 CSS class（60fps）
  GSCN 公式：`fc = 3000 + (gscn - 7499) × 1.44` MHz（n78 有效范围 7708~8054）

### Stage 2 · PSS 检测（S2.0~S2.3）★ 已完整
**S2.0** 静态 SVG：三步小区搜索泳道流水线
**S2.1** 动画：LFSR 生成 → 127 珠环（CY=246,R=110）→ 旋转 43k → 剪断拉直
  - 关键变量：`_msPhase('gen'|'ring'|'strip')` / `_msClk` / `_msNid2`（本地，不写总线）
  - 图例条占底部 40px（y=396~438），viewBox 内珠环已上移让位
**S2.2** 静态重绘：频域 stem（N=256 大窗口，两侧 ZERO-PAD）+ 时域 4x 过采样 vs 临界采样
  - 核心诚实点：补零不让 PSS 变平滑，只是过采样使蓝点精确穿过橙线（误差 1e-16）
  - 预计算数据嵌入：`var F2T={0:{d,crit,over}, 1:{...}, 2:{...}}`
**S2.3** 动画：含噪接收波形 + 三路滑动相关逐点揭示 + 一针穿屏
  - 真实仿真：N_ID²=1, LAG=180, TOTAL=420, L=127；三档 SNR（10/0/−4 dB）
  - 扫描步进 `_csScan+=3` 每 24ms，整图重绘（294×3 路数据量小，可接受）
  - 判决：`Engine.ctxSet('nid2', det)` + Log 绿字
  - 预计算数据：`var CS_DATA={high:{...}, mid:{...}, low:{...}}`

### Stage 3 · SSS 检测（S3.0~S3.3）★ 已完整
**S3.0** 静态 SVG：三栏时态（绿 PSS 已完成 / 紫 SSS 本阶段 / 灰 PCI 合成）+ 底部位拼接图
  - 位拼图：高位槽 N_ID¹×3（紫块）+ 低位槽 N_ID² 余数（绿块）→ 合成 PCI（灰块）
  - 公式 d_SSS = s₀×s₁，移位量 m₀/m₁ 定义
**S3.1** 动画：三条水平带（s₀紫 / s₁青 / d_SSS紫）+ N_ID¹ 滑块联动
  - 关键：`× ≡ ⊕` 点破 BPSK 相乘 = 比特异或，硬件廉价性注释
  - m₀ 跨 112/224 边界时 CSS `@keyframes` 闪烁（不开新定时器）
  - N_ID² 标"PSS 锁定·只读"；预计算数据在渲染函数内实时算（序列短，可接受）
**S3.2** 动画：SSB 时频网格（居中压扁）+ IQ 星座双图
  - 左：理想 BPSK 两点（±1）；右：接收散点甜甜圈（确定性 `RX_PTS` 预计算）
  - 绿色幅度环 + 红色 |x| 箭头 → 非相干检测直觉
  - "鸡生蛋"诚实点（无信道估计 → 无法相干 → 用幅度）
  - 定时器：`_rxTid` 每 140ms 更新 `_rxPhase`，甜甜圈整体 group rotate（不重算点）
**S3.3** 动画：336 路盲检扫描揭示 + 锁定 + 错 N_ID² 对照
  - 扫描步进 `_bsScan+=6` 每 22ms，整图重绘（336×1 路数据量小，可接受）
  - 正确态：绿峰 127 + 红圈锁定；错误态：全趴 ~15 + 大号红字
  - 措辞：m-序列是"低互相关 ≈ −1/127"，不是"正交"（避免和 Stage 0/2 口径打架）
  - 判决：`Engine.ctxSet('nid1', 112)` + `Engine.ctxSet('pci', 337)`，顶栏 PCI 点亮
  - 预计算：`BS_PEAKS = {0:[], 1:[], 2:[]}` 载入时三套全算好，切换 N_ID² 对照零延迟

### Stage 4 · PBCH 译码 & MIB（S4.0~S4.4，5 子步）★ 已完整
主色蓝 #2563eb（≠答案绿，遵守五色角色规则）；新增**扰码层紫 #7c3aed/#5b21b6**。
真实小区参数：PCI=337→v=PCI mod4=1；SFN=614(高6位=38/低4位=6)；k_SSB=6；ī_SSB=2；
  Polar N=512/K=56/E=864；第一层扰段 L1_SEG=3(SFN 2/3位=11)、第二层扰段 L2_SEG=2(ī_SSB)。
**S4.0** 理论：解码链改为「两层解扰夹住 Polar」夹心流水线（两紫盒夹一蓝盒）。
**S4.1** 信道估计+插值：三段按钮(甜甜圈→插值铺满Ĥ→均衡)。插值用 ΔN=4 线性权重
  0.75/0.25→0.5/0.5→0.25/0.75，回答「1/4 导频为何够用」；点明 DMRS 一身二用(盲检ī_SSB+信道估计)。
  状态：_ceApplied/_ceInterp/_cePhase/_ceTid；甜甜圈整体 rotate 不重算点。
**S4.2** 两层解扰(新)：竖向自举流，节点 y=[66,128,190,278,346]，居中 x=292/boxW=300。
  第2层解扰(钥匙=DMRS ī_SSB)→Polar折叠盒→译出载荷高亮「未扰孤岛」(SFN 2/3位绿块)→
  自举回环当钥匙→第1层解扰。右侧 TX 镜像佐证夹心。状态 _dsPhase(0~4)/_dsTid，每 950ms 进一相。
**S4.3** Polar SCL(原S4.2)：剪枝节点旁 <animate fill="freeze"> 闪「PM 劣汰」红标签；
  理论补累积路径度量。状态 _pPhase/_pScan/_pTid。
**S4.4** MIB(原S4.3)：底部加琥珀「⚡协议彩蛋」卡——FR1(承载k_SSB[4]) vs FR2(L_max=64,
  k_SSB[4]+2rsv 改征用拼 SSB index 高3位)。SFN 拼接 (38<<4)|6=614（注意 << 在 SVG text 内
  必须写 &lt;&lt;）。完成写总线 sfn_offset/hrf/ssb_index/mib 后 ctxSet('kssb',6) 点亮顶栏。
路由/钩子按 5 子步：renderVizSVG 0→discuss,1→ChEst,2→Descramble,3→Polar,4→MIB；
  onStageExit 清 _ceTid/_dsTid/_pTid/_mibTid 四个。

### Stage 5 · CORESET#0 盲检（S5.0~S5.4，5 子步）★ 已完整
主色靛蓝 #4f46e5（深靛 #3730a3 / 浅靛 #eef2ff）；钥匙琥珀 #d97706；答案绿 #059669；对照灰 #94a3b8；高光红 #dc2626。
上游消费：NR_CTX.mib.pdcchConfigSib1=0x10 → 高4位 cset0=1 / 低4位 ss0=0；pci=337、kssb=6。
核心数值（已 Python 验证）：Table 13-4[1]→复用图样1、24RB×2sym、offset 1 RB（8.64MHz）；REG=48→8 CCE；Table 13-11[0]→O=0,M=1,首符号0→偶帧 slot0。
**S5.0** 理论：一把 8-bit 钥匙 → 双锁分叉（左 cset0/右 ss0）；底部「鸡生蛋」红卡 vs 绿解法卡——CORESET#0 相对 SSB 锚定、不依赖 Point A 的自举逻辑。
**S5.1** 双查表「开锁」动画：0x10 劈位 → 左表(13-4)/右表(13-11)逐步高亮选中行 → 汇总监听契约。状态 _t1Phase(0~4)/_t1Tid，每 820ms 进一相。注意钥匙下方标签用短名 cset0/ss0 防重叠。
**S5.2** 时频反推：青 SSB(20RB×4sym) 与靛蓝 CORESET#0(24RB×2sym) 同网格 TDM；offset 1 RB 用「SSB↔CORESET 之间」的双箭头标注（非网格左边界，避让轴标签）；右侧 k_SSB=6 精对齐放大镜。静态图。
**S5.3** PDCCH 盲检：8-CCE 货架（每格含琥珀功率柱 + 红 0.5 门限虚线，体现"先功率检测再解码"省电步骤）→ 候选清单 AL4×2/AL8×1 逐个解扰+SI-RNTI 校验，命中 AL8 亮绿。诚实点：**AL16 需16CCE 物理放不下**（红卡）。理论补「交织撒胡椒面→频率分集」极客提示（措辞：CORESET#0 用协议预置参数交织，非所有 CORESET 强制）。状态 _bdIdx/_bdDone/_bdTid；预计算 BD_CAND + BD_PWR。
**S5.4** DCI 1_0 解析：比特带按 **37bit**（22语义 + 15预留）分段，预留位用斜纹 pattern「死区」质感、解析区做成跨行灰斜纹「配重块」横条；6 语义字段卡（RIV/TDRA 标 →NR_CTX 绿）。理论补硬核彩蛋「size alignment：15预留位凑尺寸压盲检次数」。完成写 coreset0_rb_start/size/sym 后 ctxSet('initial_bwp_rb',24) 点亮顶栏 BWP。状态 _dciReveal(0~7)/_dciDone/_dciTid，每 640ms 揭示一字段，第 7 字段后写总线。
路由/钩子：renderVizSVG 0→Discuss,1→TableLookup,2→TimeFreq,3→BlindDecode,4→DCI；onAfterRender 1/3/4 启动动画；onStageExit 清 _t1Tid/_bdTid/_dciTid 三个。
物理诚实点四连（受众工程师，务必保留）：① AL16 放不下；② DCI 1_0 真实载荷 37bit；③ RNTI 16b 只扰 CRC24 低16位（非整 24bit）；④ CORESET#0 交织参数协议固定（REG bundle 6/行数 2/n_shift=PCI）。
**跨 Stage 待办**：Stage 4 可回补 PBCH/PDCCH 同用 Polar 但参数不同（PDCCH n_max=9, I_IL=1）的呼应，强化"同一编码工具复用"主线（本轮未动）。

### Stage 6 · SIB1 解析（S6.0~S6.4，5 子步）★ 已完整
主色天蓝 #0284c7（深 #075985 / 浅 #e0f2fe），与 S4 蓝 #2563eb、S5 靛蓝 #4f46e5 拉开色相；
答案绿 #059669 留给 S6.4 驻网里程碑；钥匙琥珀 #d97706；高光红 #dc2626；对照灰 #94a3b8；
**码字对照专用**：Polar 紫 #7c3aed（回指 S4/S5）vs LDPC 蓝绿 #0d9488。
上游消费：pci=337、kssb=6、mib.pdcchConfigSib1=0x10、coreset0_rb_*、initial_bwp_rb=24，
  以及 S5 DCI 提货单（RIV=47→RB0~23、TDRA→符号2~13、MCS5/QPSK/SI-RNTI）。
核心数值（已 Python 验证）：RIV=47/SLIV=39（与 S5 闭环一致）；PDSCH RE=138/PRB×24=3312→
  N_info≈2452→**TBS=2472bit(309B)**；LDPC **Base Graph 2**（A=2472,R=0.37 落 BG2 分支）；
  **Point A=3531.27MHz**（=SSB最低子载波3546.48 − k_SSB 6×15k − offsetToPointA 84RB×12×15k）；
  S 准则 Srxlev=−75−(−110)=**+35dB>0**。
**S6.0** 理论：SIB1 三重身份（驻留判据/闭合PointA/RACH配置）三色职责卡；闭环回指条（S1/S5 欠的
  offsetToPointA 此刻还清）；终点旗 + **camped≠connected 对照**（驻网完成仍是 RRC_IDLE）。
**S6.1** PDSCH 解调&LDPC：左时频块(RB0~23×符号2~13)+DMRS锚点；右**码字对照三卡**(PBCH/PDCCH=Polar
  紫 vs PDSCH=LDPC蓝绿)；6级流水线逐级点亮。诚实点：故意铺满24RB求**频率分集**→TB偏大→MAC用
  **Padding字节**填满喂足LDPC（"为分集增益付的房租"）。状态 _pdPhase/_pdTid，每 820ms 一级。
**S6.2** ASN.1/UPER：顶部比特流首格独立**红色1-bit扩展位(Extension Marker，比OPTIONAL更靠前)**
  + 橙色OPTIONAL位图 + 灰数据区；SIB1树根+5节点+橙/蓝绿两宝藏展开(offsetToPointA + rach-Config)。
  知识条"UPER头部铁律四招"；诚实点：真实UPER是单向流式（动画逐节点弹出仅为讲层次）。
  扩展位0/1行为对照表（老UE遇1按长度跳过不崩）。状态 _asnStep(0~7)/_asnTid。
**S6.3** 关键IE落位：左**频率数轴闭环**(SSB→−k_SSB细→−offsetToPointA粗→Point A，CRB网格从零点向上铺)；
  右RACH弹药箱7字段逐个亮；闭环徽标。84RB=**甜点值**(15.21MHz偏移/贴GSCN栅格/避带外，n78现网真实参数)。
  完成写 NR_CTX.rach_config 整包 + point_a_arfcn（无顶栏标签）。状态 _kiStep(0~11)/_kiTid，
  step≤3 闭环每760ms、之后抽RACH每430ms；_kiWritten 防重复写。
**S6.4** 驻留判决：三道闸门(PLMN→cellBarred→S准则)逐关亮绿灯；**S准则天平数轴**——死亡线
  q-RxLevMin −110(红) vs 你的信号 RSRP −75(绿)，绿色双向粗箭头托**🛡安全缓冲垫+35dB**胶囊标签
  +负数减法展开 `=−75−(−110)`（破初学者负数减法心智短路）；绿色终点旗 🚩 camping 完成。
  诚实点：camped≠connected，仍 IDLE，需 S7+S8。完成 ctxSet('rrc_state','IDLE')（camped 子态）。
路由/钩子：renderVizSVG 0→Discuss,1→Pdsch,2→Asn1,3→KeyIE,4→Camp；onAfterRender 1/2/3/4
  各自 reset+run（**注意：S6 是唯一四个动画子步全部 autorun 的 Stage**）；onStageExit 清
  _pdTid/_asnTid/_kiTid/_cpTid 四个。
物理诚实点五连（受众工程师，务必保留）：① TBS 309B 是传输块容量，真实 SIB1 内容仅数十字节余为
  Padding；② 数据信道 LDPC≠控制信道 Polar；③ UPER 单向流式解码（非回头找字段）；④ offsetToPointA
  以 15kHz 参考 SCS 计 RB（FR1 约定）；⑤ **驻网成功仍是 RRC_IDLE，不是已连接**（NAS PDU 会话更在其后）。
**写入总线**：rach_config（整包：prachConfigIndex=16/rootSequenceIndex=1/zcz=8/msg1FDM=1/
  msg1FrequencyStart=0/preambleRecvTargetPower=−110/raResponseWindow=sl20/preambleTransMax=10/
  powerRampingStep=2）；point_a_arfcn=642084；rrc_state='IDLE'(camped)。**这是 Stage 7 的全部弹药。**

### Stage 7 · PRACH 随机接入（S7.0~S7.4，5 子步）★ 已完整
主色红 #dc2626（上行/PRACH，呼应原配色规划「RACH=红」+ 与下行蓝色系拉开方向反差）；
  锁定高光用深红 #991b1b（化解「红色只给锁定那一刻」与主色同为红的张力）；浅红 #fee2e2；
  下行青 #0891b2（Msg2/RAR 方向，回指 S1 SSB）；钥匙琥珀 #d97706（RA-RNTI/TA 计算值）；
  答案绿 #059669；对照灰 #94a3b8。方向色例（红=UL / 青=DL）本身就是教学装置。
范围：只做 CBRA 的 Msg1+Msg2（4 步走的前两步）；Msg3/Msg4 竞争解决 + TC-RNTI→C-RNTI
  升格 + CONNECTED 全部留给 Stage 8。诚实线索贯穿全程：「鸡生蛋（无唯一身份→随机 preamble
  →可能撞车→竞争）」「上行接通≠已连接」「camped 仍 IDLE」。
上游消费：NR_CTX.rach_config 整包（S6 写入）+ rrc_state='IDLE'(camped) + scs_khz=30(μ=1)
  + coreset0_*（RAR 的 PDCCH 在 CORESET#0 监听，复用 S5）。
核心数值（已 Python 验证）：Tc=0.50863ns；μ=1。
  TA：T_A=50 → N_TA=50×512=25600·Tc → 13020.8ns（存 ta_ns=13021）≈13.02μs，单程≈1.95km；
    TA 步进（μ=1）=512·Tc≈0.26μs（对齐 Stage 0 给的分辨率）。
  RA-RNTI = 1 + s_id(0) + 14·t_id(4) + 14·80·f_id(0) + 14·80·8·ul(0) = 57。
  ZC：L_RA=839，zeroCorrelationZoneConfig=8 → N_CS=46，每根⌊839/46⌋=18，需 4 根（4×18=72≥64）；
    UE 随机选中 preamble #27（= 第 2 根 × 第 9 个循环移位）。
  PRACH 格式：prach-ConfigIndex=16 对应 TS 38.211 Table 6.3.3.2-2（FR1 FDD）→ format 0（长格式，
    L_RA=839，1.25kHz）：CP≈103μs / SEQ=800μs / GT≈97μs（落在 1ms 内）→ 最大小区半径≈14.5km。
    【拍板·坚决保留 format 0】教学不可替代：超长 CP/GT「吞下整个未知 RTT」是 PRACH 最核心的物理
    思想，短格式（A1~C2/L_RA=139，FR1 TDD 常见）CP/GT 只有几 μs，无法直观展示该思想；且 index=16
    确属 format 0，协议严谨。S7.2 底部仍保留「格式以你的配置表为准」诚实条。
  开环功控：PL = ss-block-power(+12) − RSRP(−75) = 87dB → P_PRACH = −110 + 87 = −23dBm；
    powerRampingStep=2dB，preambleTransMax=10。
  RAR 窗：ra-ResponseWindow=sl20 = 20 时隙@30kHz = 10ms；TC-RNTI=0x4601（拟真 16bit）。
**S7.0** 理论黑板（静态）：两张「非解决不可」卡（① gNB 不知你存在 / ② 上行不同步）→ 4 步 CBRA
  阶梯（UE/gNB 双生命线 + 4 条彩色箭头，Stage7 红组 / Stage8 灰组分区）+ 鸡生蛋卡 + 方向色例。
**S7.1** Preamble 生成（_pmPhase 0~3，900ms/相，autorun）：左 ZC 根序列圆环（恒包络，28 点示意）
  + 自相关尖峰小图；右 8×8=64 preamble 网格，按 4 根分 4 个不透明度带，#27 揭示为绿（选中）。
  诚实点：圆环 28 点是示意，真实 839 点恒幅、相位按二次曲线爬升。
**S7.2** Msg1 发射（_m1Phase 0~3）：PRACH RO 时频块 + RA-RNTI 钥匙卡（=57）+ CP/SEQ/GT 结构条
  + 传播时延行 + 小区半径/开环功率卡 + 诚实条（格式以配置表为准）。理论卡新增**极客提示·常数
  14/80/8 = 位置哈希保证帧内 RA-RNTI 全局唯一**。
**S7.3** Msg2 RAR（_rarPhase 0~3）：ra-window 时间线（PDCCH 命中在 slot 7，非 slot 0）+ RAPID
  匹配徽标 + 三卡（TA/TC-RNTI/UL Grant）+ TA→时间换算条 + 复用 S5 机器条 + 诚实条。
  理论卡新增**起跑线陷阱**（窗口起算于 Msg1 后≥1 符号处第一个 PDCCH 时机；RAR 落窗口中段是
  gNB 实打实处理时延 FFT/相关峰搜索/组 RAR，不是那 1 符号——刻意把「定时参考起点」与「处理
  预算」分开，比「1 符号=基带处理时间」更准）+**退避指示 BI**（拥塞时 MAC 头塞 BI 命令随机
  退避防雪崩，本例 BI=0）。
**S7.4** TA 对齐 + 交付 Stage 8（_alPhase 0~3，末相 _alWriteCtx 写总线）：三行时序图（gNB 参考/
  UE 迟到/UE 对齐）+ N_TA 双箭头 + TA 数值卡 + 交付 Stage8 卡 + 诚实卡（竞争未解决、仍 IDLE、
  无 C-RNTI）。完成写 NR_CTX.preamble_idx/ta_cmd/tc_rnti/ra_response_win + ctxSet('ta_ns',13021)
  点亮顶栏 TA；**刻意不写 c_rnti**（顶栏 C-RNTI 保持灰——TC-RNTI 是临时身份，C-RNTI 待 Stage 8）。
路由/钩子：renderVizSVG 0→Discuss,1→Preamble,2→Msg1,3→RAR,4→Align；onAfterRender 1~4 各自
  reset+run（4 个动画子步全 autorun）；onStageExit 清 _pmTid/_m1Tid/_rarTid/_alTid 四个。
物理诚实点（受众工程师，务必保留）：① 此刻无 TA，靠长 CP/GT 吞 RTT 盲发；② preamble 随机抓→
  可能撞车→竞争式；③ RAR 窗口不在 Msg1 发完瞬间启动、靠 gNB 处理时延落中段；④ 上行接通≠已连接，
  仍 RRC_IDLE、TC-RNTI 仍临时、C-RNTI 待 Stage 8。
**写入总线**：preamble_idx=27 / ta_cmd=50 / ta_ns=13021 / tc_rnti=0x4601 / ra_response_win='sl20'。
  **这是 Stage 8 的全部弹药**（叠加 S6 的 rach_config + rrc_state）。

### Stage 8 · RRC 建立 & 安全（S8.0~S8.4，5 子步）★ 已完整
主色 teal #0d9488（RRC/SRB/连接结构，深 #0f766e / 浅 #ccfbf1）；答案翠绿 #16a34a/浅 #dcfce7
  （胜出/CONNECTED 里程碑，与 teal 屏上可区分）；安全金 #d97706；高光红 #dc2626（竞争失败/
  未保护/诚实警告）；下行青 #0891b2（Msg4 方向，回指 S1）；CHOICE 头深 slate #475569（结构开销，
  与 spare 灰 #94a3b8 用同色系明度分主次，不引入新色相）。
上游消费：S7 写入 tc_rnti=0x4601 / ta_ns=13021 / preamble_idx=27 / ra_response_win='sl20'；
  S6 写入 rach_config + rrc_state='IDLE'(camped)；Msg4 的 PDCCH 在 CORESET#0 监听（复用 S5/6 下行链路，零新增机器）。
核心数值（已 Python 验证）：TC-RNTI 0x4601=17921；竞争解决成功 → C-RNTI := TC-RNTI（值不变升格，
  38.321 §5.1.5）。RRCSetupRequest 的 UPER 逐位预算 = 4（CHOICE 路由头：UL-CCCH 1bit + c1 2bit +
  InitialUE-Identity 1bit）+ 39（ue-Identity）+ 4（estCause）+ 1（spare）= **48bit(6字节) CCCH SDU**，
  严丝合缝（呼应 S6 UPER 无标签编码）。UE Contention Resolution Identity MAC CE = 回显前 48bit。
  密钥层级（33.501）：K_gNB 256b → KDF → K_RRCint/K_RRCenc/K_UPenc（256b 派生后截断 128b 喂算法）；
  完整性 NIA0(空,仅紧急)/NIA1 SNOW3G/NIA2 AES-CMAC/NIA3 ZUC，加密 NEA0(空,允许)/NEA1/NEA2 AES-CTR/NEA3。
**S8.0** 理论黑板（discuss，静态）：路线图 竞争解决→建连→安全；两张「非解决不可」卡；4 步 CBRA
  阶梯（S7 灰/已完成 + S8 主色点亮 Msg3/Msg4）；SRB 升级条（SRB0/CCCH/TM → SRB1/DCCH/AM）；密钥树预告。
**S8.1** Msg3（_m3Phase 0~3）：用 S7 的 UL Grant 发 PUSCH → 填 ue-Identity/cause → 标 48bit 指纹 +
  加扰 TC-RNTI。比特带 4 段（CHOICE 头/ue-Identity/estCause/spare）数据驱动，loop 用 fields.length；
  鸡生蛋诚实条（随机值占位、撞车概率约 5500 亿分之一但非零）。
**S8.2** Msg4（_m4Phase 0~4，写 c_rnti）：CORESET#0 命中 → 解 Contention Resolution Identity（回显
  48bit）+ RRCSetup → 指纹比对（胜者绿✓/败者红✗退避）→ TC-RNTI 升格为 C-RNTI（值不变 0x4601，
  写总线点亮顶栏）→ 进入 RRC_CONNECTED。诚实点：Msg4 仍用 TC-RNTI 加扰 PDCCH（竞争还没裁完）。
**S8.3** 安全激活（_secPhase 0~4）：K_gNB 根 → 派生子密钥（256→128 截断）→ SMC（gNB→UE，仅完整性）→
  SMP（UE→gNB，完整性+加密双激活）。诚实条（红）：真实 3GPP 序为 Msg4→CONNECTED→Msg5(含NAS)→
  NAS 鉴权→**SMC 发生在 CONNECTED 之后**；K_gNB 由 NAS 鉴权产生（越界，灰标）。不伪装成同步动作。
**S8.4** 收官（_finPhase 0~3，写 rrc_state='CONNECTED'）：RRCSetupComplete(SRB1/DCCH/AM) + NAS 转
  AMF（灰越界）→ 状态机 IDLE→CONNECTED → 9 段时间线闭环 → 写总线 → 终点旗 +「CONNECTED≠能上网
  （需 NAS 注册 + PDU 会话/DRB）」诚实卡。
路由/钩子：renderVizSVG 0→renderS8Discuss,1→renderMsg3,2→renderMsg4,3→renderSecurity,4→renderFinale；
  onAfterRender 1~4 各自 reset+run；onStageExit 清 _m3Tid/_m4Tid/_secTid/_finTid 四个。
物理诚实点（受众工程师，务必保留）：① Msg3 用「自造随机值」当身份 → 可能撞车 → 竞争式；② C-RNTI
  值不变升格，但 Msg4 仍 TC-RNTI 加扰（竞争未裁完）；③ AS 安全激活(SMC) 在 CONNECTED 之后、K_gNB
  源自 NAS 鉴权（越界）；④ **CONNECTED ≠ 能上网**——仍需 NAS 注册 + PDU 会话/DRB（2.0 项目）。
**写入总线**：c_rnti=0x4601（S8.2 点亮顶栏）；rrc_state='CONNECTED' + srb1_established + as_security（S8.4）。
  **这是空口接入主线的终点；K_gNB 的来源、PDU 会话承载留待 2.0。**
---

## 历史踩坑（禁止重犯）

1. `S3 = [...]` 不加 `subSteps` 包装 → 步骤切换全失效
2. SVG `<text>` 内 `&nbsp;` → 渲染为字面量，改用 `&#160;`
3. `max-height` 写死 SVG → 不同子步骤高度不一致
4. "补零让 PSS 变平滑"→ 物理错误，正确说法是"过采样使连续波形可见"
5. GSCN 默认值曾为 8778（FR1 外）→ 已改为 7881（n78 中心）
6. 没有基线文件（engine.js / 参考 Stage HTML）就猜 API 签名 → 必出返工
7. 动画数据没有预计算直接在 setInterval 里每帧重算 → 卡顿
8. 判决写总线过早（还没检测就 ctxSet）→ 破坏"零先验"叙事逻辑
9. SVG <text> 内写裸 << / < / > / & → XML 非法 token（cairosvg 直接报错）；<< 必须写 &lt;&lt;。
10. Stage HTML 末尾 hook 赋值在 Engine.boot() 之前，而 boot 会把 onStageExit 重置为 null——
    这是 Stage 3 黄金参考的既定行为，单文件/iframe 生命周期内 onStageExit 不会被子步切换调用，
    清理靠 iframe 销毁，属正常，勿"修复"。
11. SVG 比特带/卡片做成数据驱动数组（如 DCI_FIELDS）后，加字段只改数组、渲染循环用 totBits 自动均分——这是正确做法，勿在渲染里写死字段数；但要同步检查依赖该数组长度的下游坐标（卡片行数→sumY、计数器 x/N）。
12. 顶部并排短标签若文字过长会重叠（S5.1 曾把 controlResourceSetZero 全称放钥匙下方撞车）→ 并排标签用短名（cset0/ss0），全称放到下方表头或理论卡。
13. 频域 offset 类「相邻两块落差」标注，勿画在网格边界外（会和轴标签 RB0 打架且箭头太短看不清）→ 画在两块之间的空档，用双向箭头 + 白底标签框。
14. SVG <text> 内裸 `&`（如"解调 & LDPC"）→ XML 非法 token，cairosvg 直接 ParseError；
    必须写 `&amp;`（与踩坑#9 的 << 同源问题）。注意只影响 SVG <text>，HTML 卡片文案里浏览器较宽容。
15. theoryCard 文案要插入新小节导致后续编号顺移（③→④→⑤）时，用 str_replace 改一处易漏改下游；
    插入后务必 grep 一遍 `<h3>` 编号连续性，逐个补改，别只改插入点。
16. 数轴类"负数减法"（如 Srxlev=−75−(−110)=+35）初学者视觉易短路 → 用"死亡线/你的信号"直觉命名
    两端点 + 醒目双向箭头 + 缓冲垫胶囊标签 + 减法展开式并列，比单写"余量+35dB"教学效果好得多。
17. SVG <text> 内裸 `&`（如方向色例「方向色例 & 接入类型」）→ XML 非法 token，cairosvg ParseError；
    必须写 `&amp;`（与踩坑 #14 同源，但 #14 是 HTML 卡片宽容、本条在 SVG <text> 内严格）。
    注：侧栏 theoryCard 是 innerHTML 渲染的 HTML，`<`/`&` 浏览器宽容；只有 SVG <text> 才严格。
18. 窗口/时序类「起跑线」表述别把「协议定时参考起点（≥1 符号）」和「设备真实处理预算」混为一谈
    （PRACH 的 ra-ResponseWindow 起算点 ≠ gNB 处理时延）。把两者说成一回事虽更顺口，但对工程师
    受众是物理失真——分开讲，并用「动画里命中落在中段而非第 0 时机」做直觉锚点。
19. 比特带各字段位长之和必须 = 标题宣称的 SDU 总长，否则自相矛盾（S8.1 曾画 39+4+1=44 却标
    48-bit CCCH SDU）。消失的位往往是 UPER 的 CHOICE 路由头/扩展位/长度前缀这类「结构开销」——
    凑数前先做逐位预算（ceil(log2(N)) 算每个 CHOICE 的选择位），别只数语义字段。修正后顺手把
    loop 边界从写死的 i<N 改成 i<fields.length（同踩坑 #11）。
20. 安全激活的时序别为了「故事顺」而失真：真实 3GPP 序是 Msg4→CONNECTED→Msg5(含NAS)→NAS鉴权→
    SMC→SMP，即 AS 安全(SMC) 在 RRC_CONNECTED 之后、K_gNB 源自 NAS 鉴权（本项目越界）。把它画成
    建连的同步动作虽顺口，但对工程师受众是物理失真——如实标注「越界」「在 CONNECTED 之后」。
---

## 对话协议

### 工作流程（固定，每个 Stage 均适用）

**第一阶段：Claude 出初版**
1. **读基线** → 对齐 discuss()/sim() 签名、颜色、布局数值
2. **数值验证** → node/Python 算出真实数据，确认物理正确
3. **预渲染验证** → 生成关键态 SVG → cairosvg 栅格化肉眼检查布局/配色
4. **语法检查** → `node -c` 通过
5. **直接交付完整文件**（含 `stage-data-S*.js` 数据块）

**第二阶段：你审查 + 提修改意见**
- 你在本地实机运行，或看 Claude 提供的渲染截图
- 对布局、教学内容、动画节奏、配色等任何方面提出修改意见
- 意见可以是参考性的（Claude 判断取舍）或指令性的（必须执行）

**第三阶段：Claude 精确落地**
- 判断每条意见「取/舍/部分取」并说明理由（涉及物理准确性的意见尤其要说清楚）
- 全部是 `str_replace` 局部修改，**不重出整份文件**（除非改动超过 40% 行数）
- 每次修改后重新 node -c + 关键态重新栅格化验证

**循环**：第二/三阶段可以多轮，直到你满意后进入下一 Stage。

### 开启新 Stage 时发送
​```
🎯 目标：Stage N · [主题]
​```
Claude 收到后直接进入第一阶段，无需等待拍板。

### 物理诚实性争议
- Claude 有权主动标出"建议措辞"与"参考意见措辞"的差异，并给出物理理由
- 你可以选择接受 Claude 的建议，或坚持你的表述（Claude 会记录并在备忘里注明）
- 原则：**宁可减少视觉冲击，不可引入物理错误**（受众是工程师）

### 更新 CLAUDE.md
每个 Stage 完整交付后（你满意为止），我提供上述三个片段的更新版，你替换对应内容。

---

## 本地运行
```bash
cd initial-access-v2 && python3 -m http.server 8080
# 打开 http://localhost:8080/index.html
```