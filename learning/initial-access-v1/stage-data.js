/* ═══════════════════════════════════════════════════════════════════════════
   5G NR Initial Access · Stage Data
   全局常量与文本 · 挂载 window.NR_VIZ_DATA
   ═══════════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  /* ── Frequency Bands ─────────────────────────────────────────────────── */
  var BANDS = [
    { id:'n1',  freq:'2.1G',  x:66,  w:48, signal:0.08, color:'#94a3b8', desc:'2110-2170 MHz' },
    { id:'n41', freq:'2.5G',  x:142, w:48, signal:0.18, color:'#94a3b8', desc:'2496-2690 MHz' },
    { id:'n77', freq:'3.7G',  x:218, w:48, signal:0.25, color:'#94a3b8', desc:'3300-4200 MHz' },
    { id:'n78', freq:'3.5G',  x:294, w:58, signal:0.92, color:'#059669', desc:'3300-3800 MHz', target:true },
    { id:'n79', freq:'4.7G',  x:380, w:48, signal:0.06, color:'#94a3b8', desc:'4400-5000 MHz' },
    { id:'n257',freq:'28G',   x:456, w:52, signal:0.04, color:'#94a3b8', desc:'26.5-29.5 GHz'},
  ];

  /* ── Sync Raster Points (GSCN) ───────────────────────────────────────── */
  var SYNC_POINTS = [
    { bandIdx:0, arfcn:'422230',  gscn:'7934',  x:90 },
    { bandIdx:1, arfcn:'518000',  gscn:'8396',  x:166 },
    { bandIdx:2, arfcn:'648000',  gscn:'8742',  x:242 },
    { bandIdx:3, arfcn:'633600',  gscn:'8778',  x:323 },
    { bandIdx:4, arfcn:'742400',  gscn:'9072',  x:404 },
    { bandIdx:5, arfcn:'2054400', gscn:'23674', x:482 },
  ];

  /* ── Stage Labels ────────────────────────────────────────────────────── */
  var STAGE_LABELS = [
    '⓪ UE 开机初始化',
    '① gNB 广播与 SSB',
    '② PSS 互相关扫描',
    '③ PSS 符号同步',
    '④ SSS 帧同步',
    '⑤ PBCH / MIB',
    '⑥ CORESET#0 盲检',
    '⑦ SIB1 获取',
    '⑧ RACH 就绪',
  ];

  /* ── Stage Meta (badge, colors, perspective) ─────────────────────────── */
  var STAGE_META = [
    { badge:'STANDBY',   dotColor:'var(--accent)', perspective:'👁 视角：UE 终端侧', spec:'TS 38.101 §4.1 / 38.211 §4.3.1' },
    { badge:'STANDBY',   dotColor:'var(--accent)', perspective:'👁 视角：gNB 基站侧', spec:'TS 38.211 §7.4.3.1 / 38.331 §6.2.2' },
    { badge:'SEARCHING', dotColor:'var(--warn)',   perspective:'👁 视角：UE 终端侧', spec:'TS 38.213 §4.1 / 38.211 §6.3.3' },
    { badge:'SYNCING',   dotColor:'var(--warn)',   perspective:'👁 视角：UE 接收机', spec:'TS 38.211 §7.4.2.2 / 38.213 §4.1' },
    { badge:'SYNCING',   dotColor:'var(--warn)',   perspective:'👁 视角：UE 接收机', spec:'TS 38.211 §7.4.2.3 / 38.213 §4.1' },
    { badge:'DECODING',  dotColor:'var(--brand)',  perspective:'👁 视角：UE 接收机', spec:'TS 38.212 §7.1 / 38.331 §6.2.2' },
    { badge:'DECODING',  dotColor:'var(--brand)',  perspective:'👁 视角：UE 接收机', spec:'TS 38.213 §10.1 / 38.211 §7.3' },
    { badge:'DECODING',  dotColor:'var(--brand)',  perspective:'👁 视角：UE 接收机', spec:'TS 38.331 §6.2.2 / 38.213 §13' },
    { badge:'READY',     dotColor:'var(--accent)', perspective:'👁 视角：UE 终端侧', spec:'TS 38.211 §6.3.3 / 38.321 §5.1' },
  ];

  /* ── NEW FORMAT: FLOW_DATA with subSteps ─────────────────────────────── */
  function makeSubStep(title, actionTitle, actionDesc, theoryTitle, theoryContent, initLogs) {
    return {
      title: title,
      actionCard:  { title: actionTitle,   desc: actionDesc },
      theoryCard:  { title: theoryTitle,   content: theoryContent },
      initLogs:    initLogs || [],
    };
  }

  /* ── Stage 0: 终端唤醒与协议基因载入 ────────────────────────────────── */
  var S0_STEPS = [
    makeSubStep(
      '时间基准建立',
      '晶振高精度起振与核心 Tc 周期生成',
      '第一步：TCXO 温补晶振提供极其稳定的底层心跳（精度 ±0.1ppm，对抗多普勒频移）。第二步：PLL 锁相环将 38.4MHz 基础频率成倍放大至 1.97GHz，合成 5G NR 物理层的绝对原子时间基准 Tc ≈ 0.509ns。',
      '物理层定时的数学源头',
      '根据 3GPP 38.101 规范，终端主时钟源精度要求在 ±0.1ppm 以内。5G NR 将子载波间隔的极限标定为 Δf_max = 480 kHz，FFT 最大点数标定为 Nf = 4096：' +
      '<div class="formula">T<sub>c</sub> = 1 / (Δf<sub>max</sub> × N<sub>f</sub>)<br>= 1 / (480×10³ × 4096) ≈ 0.508626 ns</div>' +
      '<div class="formula-note">Nf = 4096（最大 FFT 点数，决定频域分辨率）<br>Δf_max = 480 kHz（极限子载波间隔，对应 FR2 mmWave μ=5）</div>' +
      '后续流程中无论是 OFDM 符号切割、循环前缀（CP）长度，还是上行定时提前量 TA（以 16·Tc 为步长 ≈ 8.14ns），其本质都是对系统内部该 Tc 脉冲源的精确计数。',
      [
        '[INIT] 终端主电源管理 IC (PMIC) 状态检测正常，数字核心供电轨激活。',
        '[CLOCK] 外部 38.4MHz 高精度温补晶振 (TCXO) 开始起振，正在校准温度漂移补偿…',
        '[LOCK] 内部锁相环 (PLL) 捕获时钟边沿，倍频电路合成完成，频率环路置于锁定状态。',
        '[SUCCESS] 5G NR 物理层绝对时间微粒建立：Tc ≈ 0.5093ns，定时加速器硬件计数器复位。'
      ]
    ),
    makeSubStep(
      '协议基因载入',
      '无下行信号先验，提取 3GPP 标称字典',
      '在接收到任何空口信号之前，基带芯片从内部 ROM 和 USIM 卡中加载三组出厂即固化的 3GPP 先验常数——PSS 序列生成器、GSCN 同步栅格字典、以及签约运营商 PLMN 优先级列表。这三组数据是终端盲搜的"基因"，无需网络下发。',
      '从无序到有序：先验知识对搜索空间的压缩',
      '若终端在开机时盲目遍历 15kHz 步长的信道栅格（Channel Raster），FR1 频段将面对 33,000+ 个格点，耗时和功耗不可接受。3GPP 为此设计了三层先验"过滤器"：<br><br>' +
      '1. <b>PSS 序列多项式</b>：同步信号必须由 g(x) = x⁷ + x⁴ + 1 生成的 m 序列调制。终端出厂即内置全部 3 种候选（N_ID² ∈ {0,1,2}），无需盲猜信号格式。<br>' +
      '2. <b>GSCN 同步栅格</b>：基站被强制只能在稀疏的法定锚点（1.44MHz 步长，仅 347 个 GSCN）上发射 SSB，将频域搜索空间压缩 <b>96 倍</b>。<br>' +
      '3. <b>PLMN 签约优先级</b>：USIM 卡预存签约运营商的移动网络码（MCC-MNC）。终端据此优先搜索归属网络频点，跳过无关运营商，进一步缩小搜索范围。',
      [
        '[BOOT] 基带芯片专用 L1 微码固件加载完毕，FFT 级联协处理器自检完成。',
        '[DATA] 读取芯片固化只读存储器 (Secure ROM) 成功，PSS m序列生成多项式 g(x) 注入多路滑动相关器。',
        '[DATA] 读取 USIM 射频能力配置文件，加载全球稀疏同步栅格 (GSCN) 法定频点映射字典。',
        '[DATA] 加载历史驻留频点及运营商首选公共陆地移动网络编码 (PLMN = 46001 - 中国移动)。',
        '[READY] 终端物理层搜索前置常数全部就绪。环境感知器置于盲检模式，等待下一步执行频域空间压缩扫描。'
      ]
    ),
  ];

  /* ── Stage 1: gNB 广播与 SSB ────────────────────────────────────────── */

  /* Sub-step 0: 时域定位 — SSB Burst Set 与 Case A~E */
  var S1_STEP0_CASE_LOGS = {
    A: [
      '[gNB-RRM] Initiating Global Cell Beacon Broadcast...',
      '[gNB-PHY] Macro Periodicity: 20ms Standard Window (TS 38.213 §4.1)',
      '[gNB-PHY] Subcarrier Spacing (SCS): 15 kHz → Pattern [Case A]',
      '[gNB-PHY] Candidate Positions per Slot: n = 2 (Symbols 2-5 & 8-11)',
      '[gNB-PHY] Maximum Beam Count: L_max = 8 (Multi-Beam Sweep Armed)',
      '[gNB-TX] Allocating 8 SSB Beams across 4 Slots (0-3) in 5ms Half-Frame:',
      '  Beam #0 → Slot 0, Sym  2~5   | Azimuth: -45° | Start RE @ subcarrier 0',
      '  Beam #1 → Slot 0, Sym  8~11  | Azimuth: -32° | Start RE @ subcarrier 0',
      '  Beam #2 → Slot 1, Sym  2~5   | Azimuth: -19° | Start RE @ subcarrier 0',
      '  Beam #3 → Slot 1, Sym  8~11  | Azimuth:  -6° | Start RE @ subcarrier 0',
      '  Beam #4 → Slot 2, Sym  2~5   | Azimuth:  +6° | Start RE @ subcarrier 0',
      '  Beam #5 → Slot 2, Sym  8~11  | Azimuth: +19° | Start RE @ subcarrier 0',
      '  Beam #6 → Slot 3, Sym  2~5   | Azimuth: +32° | Start RE @ subcarrier 0',
      '  Beam #7 → Slot 3, Sym  8~11  | Azimuth: +45° | Start RE @ subcarrier 0',
      '[gNB-TX] [SUCCESS] Time-Domain Beacon Sweep Armed. Transmitting RF Beacons.',
    ],
    B: [
      '[gNB-RRM] Initiating Global Cell Beacon Broadcast...',
      '[gNB-PHY] Macro Periodicity: 20ms Standard Window',
      '[gNB-PHY] Subcarrier Spacing (SCS): 30 kHz → Pattern [Case B]',
      '[gNB-PHY] Maximum Beam Count: L_max = 8',
      '[gNB-TX] Allocating 8 SSB Beams in 5ms Half-Frame (30kHz SCS):',
      '  Beam #0 → Slot 0, Sym 4~7    | Azimuth: -45°',
      '  Beam #1 → Slot 0, Sym 8~11   | Azimuth: -32°',
      '  Beam #2 → Slot 1, Sym 4~7    | Azimuth: -19°',
      '  Beam #3 → Slot 1, Sym 8~11   | Azimuth:  -6°',
      '  Beam #4 → Slot 2, Sym 4~7    | Azimuth:  +6°',
      '  Beam #5 → Slot 2, Sym 8~11   | Azimuth: +19°',
      '  Beam #6 → Slot 3, Sym 4~7    | Azimuth: +32°',
      '  Beam #7 → Slot 3, Sym 8~11   | Azimuth: +45°',
      '[gNB-TX] [SUCCESS] Time-Domain Beacon Array Ready.',
    ],
    C: [
      '[gNB-RRM] Initiating Global Cell Beacon Broadcast...',
      '[gNB-PHY] Macro Periodicity: 20ms Standard Window',
      '[gNB-PHY] Subcarrier Spacing (SCS): 30 kHz → Pattern [Case C] ★ 国内商用主力',
      '[gNB-PHY] Maximum Beam Count: L_max = 8 (FR1 Typical Multi-Beam Sweep)',
      '[gNB-TX] Allocating 8 SSB Beams in 5ms Half-Frame:',
      '  Beam #0 → Slot 0, Sym 2~5    | Azimuth: -45° | Burst #1',
      '  Beam #1 → Slot 0, Sym 8~11   | Azimuth: -32° | Burst #2',
      '  Beam #2 → Slot 1, Sym 2~5    | Azimuth: -19° | Burst #3',
      '  Beam #3 → Slot 1, Sym 8~11   | Azimuth:  -6° | Burst #4',
      '  Beam #4 → Slot 2, Sym 2~5    | Azimuth:  +6° | Burst #5',
      '  Beam #5 → Slot 2, Sym 8~11   | Azimuth: +19° | Burst #6',
      '  Beam #6 → Slot 3, Sym 2~5    | Azimuth: +32° | Burst #7',
      '  Beam #7 → Slot 3, Sym 8~11   | Azimuth: +45° | Burst #8',
      '[gNB-TX] [SUCCESS] Time-Domain Beacon Sweep Armed. Transmitting.',
    ],
    D: [
      '[gNB-RRM] Initiating Global Cell Beacon Broadcast...',
      '[gNB-PHY] Macro Periodicity: 20ms Standard Window',
      '[gNB-PHY] Subcarrier Spacing (SCS): 120 kHz → Pattern [Case D] ⚡ mmWave',
      '[gNB-PHY] Maximum Beam Count: L_max = 64 (FR2 Dense Beam Sweep)',
      '[gNB-TX] Beam Sweep Compacted: 64 beams within first 1.25ms of 5ms window.',
      '[gNB-TX] [SUCCESS] mmWave 64-Beam Dense Array Armed.',
    ],
    E: [
      '[gNB-RRM] Initiating Global Cell Beacon Broadcast...',
      '[gNB-PHY] Macro Periodicity: 20ms Standard Window',
      '[gNB-PHY] Subcarrier Spacing (SCS): 240 kHz → Pattern [Case E] ⚡⚡ Extreme mmWave',
      '[gNB-PHY] Maximum Beam Count: L_max = 64 (Ultra-Dense Sweep)',
      '[gNB-TX] Extreme Compact: 64 beams within ~0.625ms window.',
      '[gNB-TX] [SUCCESS] Extreme mmWave Beacon Array Armed.',
    ],
  };

  var S1_STEPS = [
    /* Sub-step 0: 时域定位 */
    makeSubStep(
      '时域定位 · Case A~E 周期图谱',
      'gNB 按 20ms 周期轮询发射 SSB 波束阵列',
      '<b>① 周期锁定</b> — 无论现网配置如何，终端开机盲搜时一律按 <em>20ms</em> 周期监听 SSB，这是 3GPP 设定的统一搜网起点。<br>' +
      '<b>② 半帧内集中清仓</b> — 所有方向的波束副本必须在每 20ms 周期的 <em>前 5ms 半帧</em> 内一次性密集发射，后 15ms 留给数据传输，绝不拖泥带水。<br>' +
      '<b>③ 一束一身份</b> — 每束 SSB 占用连续 4 个 OFDM 符号，承载的 MIB 完全相同，但它在时域上的位置和 DMRS 中隐式携带的波束索引各不相同——UE 捕获到哪一束，就知道自己身在哪个"方向通道"里。',
      '盲搜周期、Case 图谱与多扇区部署',
      '<b>20ms 盲搜周期</b><br>' +
      '协议规定终端开机时按 20ms 为周期盲搜 SSB（TS 38.213 §4.1）。虽然基站侧可配置为 5/10/20/40/80/160ms，但初始接入必须以最保守的 20ms 去尝试。所有 SSB 波束副本被强制压缩在每个周期的前 5ms 半帧内一次性打完，不留残余。<br><br>' +
      '<b>Case A~E 五种映射图谱</b><br>' +
      '为适配 700MHz 到 28GHz 的不同物理信道特性，3GPP 锁定了 5 种符号级映射方案（TS 38.211 §7.4.3.1）：<br>' +
      '• <b>Case A (15kHz)</b>: FR1 基础型，L_max=4/8，适用于 n1/n3/n5 等低频段<br>' +
      '• <b>Case B (30kHz)</b>: FR1 升速型，L_max=4/8，Slot 长度减半<br>' +
      '• <b>Case C (30kHz)</b>: FR1 主力型 ★ 国内 5G 商用标准，与 B 同 SCS 但起始符号不同<br>' +
      '• <b>Case D (120kHz)</b>: FR2 毫米波入门，L_max=64，1.25ms 内完成扫射<br>' +
      '• <b>Case E (240kHz)</b>: FR2 毫米波极速，L_max=64，仅 0.625ms 即完成全部扫射<br><br>' +
      '<b>波束扫描与多扇区部署</b><br>' +
      '左图仅展示单个扇区内的 2D 波束扫描示意。实际部署中，基站通常覆盖 3 个扇区（每扇区约 120°），各扇区为独立的逻辑小区，拥有各自的 PCI 和独立的 SSB 发射周期。相邻扇区之间在时域上错开 SSB Burst 起始偏移，避免扇区间波束互扰。此外真实波束赋形是三维的：既有水平方向的方位角扫描，也有垂直方向的俯仰角调节——低仰角覆盖近处地面，高仰角覆盖远处高楼。<br><br>' +
      '<b>空间差异性的本质</b><br>' +
      '左图中 UE-A 捕获 Beam#1、UE-B 捕获 Beam#6，两者听到的 MIB 完全相同，但各自 DMRS 所隐式携带的 SSB Index 不同。这个 Index 决定了 UE 后续在 RACH 阶段应朝哪个方向发送 Msg1（PRACH Preamble），实现了零信令开销的空间定向——这是 5G NR 波束管理的精妙之处。',
      []  /* logs injected by switchCase('C') on boot */
    ),
    /* Sub-step 1: 频域定位 */
    makeSubStep(
      '频域定位 · GSCN 粗对齐 + k_SSB 细对齐',
      '频域对齐：UE 锁定 GSCN 锚点并校准子载波网格',
      '<b>① GSCN 粗对齐</b> — UE 按出厂内置的 GSCN 字典（Sub-6G 仅 347 个锚点）跳频扫描 RSSI，锁定最强频点，精度 ±720kHz。<br>' +
      '<b>② 非对称识别</b> — SSB 不在载波中央：5G 打破 4G"居中铁律"，允许 SSB 柔性偏置，把连续大带宽留给用户数据。<br>' +
      '<b>③ k_SSB 细对齐</b> — UE 解码 MIB 获取 <em>k_SSB</em>（FR1: 0~23 / FR2: 0~11），据此微调射频本振频率，使 SSB 与 CRB 两套子载波网格精确咬合。',
      '频域两级对齐：GSCN 粗定位 + k_SSB 精校准',
      '<b>SSB 子载波 0 的绝对频率</b><br>' +
      '<div class="formula">f<sub>SSB,0</sub> = f<sub>Point A</sub> + OffsetToPointA × 12 · <b>Δf<sub>CRB</sub></b><br>　　　　 + k<sub>SSB</sub> · <b>Δf<sub>offset</sub></b></div>' +
      '<div class="formula-note"><b>粗定位</b>：OffsetToPointA × 12 × Δf<sub>CRB</sub>（RB 级）&nbsp;&nbsp;|&nbsp;&nbsp;<b>精校准</b>：k<sub>SSB</sub> × Δf<sub>offset</sub>（RE 级）</div>' +
      '<br>' +
      '<b>基于已知 SSB 反推 Point A 绝对网格</b><br>' +
      'UE 在盲搜阶段已通过 GSCN 锁定 SSB 的绝对频点（粗对齐精度 ±720kHz）。为将这块局部的"同步块"融入全网数据大坐标系，基站下发双重偏移量：<br>' +
      '· <b>宏观 RB 偏移</b>：基站通过 SIB1 下发 <em>offsetToPointA</em>，指示 SSB 距离载波底部跨越了多少个完整的 CRB。<br>' +
      '· <b>微观 RE 补偿</b>：基站通过 MIB 下发 <em>k_SSB</em>，指示因栅格不匹配产生的子载波级零头。<br>' +
      'UE 以已知的 SSB 频点为基准，向下扣减这"一宏一微"两个偏移量，即可反推出载波最低频率边界 <em>Point A</em>——这不仅确立了 CRB 全网编号的绝对零点，更强制完成了同步网格与数据网格的子载波级正交咬合。<br><br>' +
      '<b>参数与 IE 对照</b><br>' +
      '<table style="width:100%;font-size:11px;border-collapse:collapse;margin-top:4px;">' +
      '<tr style="border-bottom:1px solid var(--border);"><td style="padding:3px 6px;font-weight:700;">参数</td><td style="padding:3px 6px;font-weight:700;">承载 IE / 字段</td><td style="padding:3px 6px;font-weight:700;">来源</td></tr>' +
      '<tr style="border-bottom:1px solid var(--border);"><td style="padding:2px 6px;">k<sub>SSB</sub></td><td style="padding:2px 6px;font-family:var(--font-mono);font-size:10.5px;">ssb-SubcarrierOffset (MIB)<br>+ PBCH payload (FR1 MSB)</td><td style="padding:2px 6px;">SSB 解码</td></tr>' +
      '<tr style="border-bottom:1px solid var(--border);"><td style="padding:2px 6px;">OffsetToPointA</td><td style="padding:2px 6px;font-family:var(--font-mono);font-size:10.5px;">offsetToPointA (SIB1 → ServingCellConfigCommonSIB)</td><td style="padding:2px 6px;">SIB1 解码</td></tr>' +
      '<tr style="border-bottom:1px solid var(--border);"><td style="padding:2px 6px;">Δf<sub>CRB</sub></td><td style="padding:2px 6px;font-family:var(--font-mono);font-size:10.5px;">subCarrierSpacingCommon (MIB)</td><td style="padding:2px 6px;">SSB 解码</td></tr>' +
      '<tr><td style="padding:2px 6px;">GSCN</td><td style="padding:2px 6px;font-size:10.5px;">UE 出厂固化字典（非空口下发）</td><td style="padding:2px 6px;">本地 ROM</td></tr></table><br><br>' +
      '<b>三种 SCS 的角色分工</b><br>' +
      '频域对齐涉及三套独立的子载波间隔，各司其职：<br><br>' +
      '<b>① Δf<sub>SSB</sub> — SSB 物理子载波间隔</b><br>' +
      '同步信号（PSS/SSS/PBCH）发射时的实际脉冲宽度，由 Case（A~E）硬性规定：FR1 为 15kHz(Case A) 或 30kHz(Case B/C)，FR2 为 120kHz(Case D) 或 240kHz(Case E)。UE 基带 FFT 按此宽度开窗捕获 SSB。<br><br>' +
      '<b>② Δf<sub>CRB</sub> — 公共资源块子载波间隔</b><br>' +
      '全网数据"地砖"的尺寸。由 MIB 中 <em>subCarrierSpacingCommon</em> 广播：FR1 为 15/30kHz，FR2 为 60/120kHz。OffsetToPointA 以此 SCS 为计量单位（1 RB = 12 × Δf<sub>CRB</sub>），如 30kHz SCS 下一 RB = 360kHz。<br><br>' +
      '<b>③ Δf<sub>offset</sub> — k<sub>SSB</sub> 游标卡尺计算粒度</b><br>' +
      '协议强制硬编码，仅按频段区分：FR1(Type A) 永久锁定 <em>15kHz</em>，FR2(Type B) 永久锁定 <em>60kHz</em>。它是一把"微调游标尺"——专门丈量 CRB 与 SSB 两套网格咬合后的 RE 级缝隙：即便两者同为 30kHz 大格，错位零头也可能是 15kHz 小格。<br>' +
      'FR1 下 k<sub>SSB</sub> ∈ {0~23}（MIB + PBCH 联合解析），FR2 下 k<sub>SSB</sub> ∈ {0~11}（MIB 独立承载）。<br><br>' +
      '<b>FR1 vs. FR2 参数全景对比</b><br>' +
      '<table style="width:100%;font-size:11.5px;border-collapse:collapse;margin-top:6px;">' +
      '<tr style="border-bottom:1px solid var(--border);"><td style="padding:4px 8px;font-weight:700;">参数</td><td style="padding:4px 8px;font-weight:700;color:var(--purple);">FR1 (Case A / B, C)</td><td style="padding:4px 8px;font-weight:700;color:var(--accent);">FR2 (Case D / E)</td></tr>' +
      '<tr style="border-bottom:1px solid var(--border);"><td style="padding:3px 8px;">SSB 物理 SCS (Δf<sub>SSB</sub>)</td><td style="padding:3px 8px;">15 kHz / 30 kHz</td><td style="padding:3px 8px;">120 kHz / 240 kHz</td></tr>' +
      '<tr style="border-bottom:1px solid var(--border);"><td style="padding:3px 8px;">CRB 数据网格 SCS (Δf<sub>CRB</sub>)</td><td style="padding:3px 8px;">15 kHz / 30 kHz</td><td style="padding:3px 8px;">60 kHz / 120 kHz</td></tr>' +
      '<tr style="border-bottom:1px solid var(--border);"><td style="padding:3px 8px;">k<sub>SSB</sub> 计算粒度 (Δf<sub>offset</sub>)</td><td style="padding:3px 8px;color:var(--warn);font-weight:650;">15 kHz (硬编码)</td><td style="padding:3px 8px;color:var(--warn);font-weight:650;">60 kHz (硬编码)</td></tr>' +
      '<tr style="border-bottom:1px solid var(--border);"><td style="padding:3px 8px;">k<sub>SSB</sub> 取值范围</td><td style="padding:3px 8px;">0 ~ 23</td><td style="padding:3px 8px;">0 ~ 11</td></tr>' +
      '<tr><td style="padding:3px 8px;">数值承载方式</td><td style="padding:3px 8px;font-size:10.5px;">LSB 4bit 存 MIB<br>MSB 1bit 存 PBCH payload</td><td style="padding:3px 8px;font-size:10.5px;">完整 6bit 存 MIB</td></tr></table>',
      [
        '[UE-RF] Initializing Wideband RF Scan on n78 Band...',
        '[UE-RF] Channel Raster (ARFCN) bypassed — using GSCN Boot Dictionary for power saving.',
        '[UE-SYS] Loading Factory GSCN Map: 347 anchor points for Sub-6GHz.',
        '[UE-DSP] Fast RSSI Scan on GSCN Grid:',
        '  GSCN 8750 (3509.40 MHz) → RSSI: -115 dBm [Noise Floor]',
        '  GSCN 8764 (3529.56 MHz) → RSSI: -112 dBm [Noise Floor]',
        '  GSCN 8778 (3549.60 MHz) → RSSI: -68 dBm  [★ PEAK DETECTED]',
        '[UE-PLL] Synthesizer locked to GSCN 8778, Fc = 3549.60 MHz.',
        '[UE-PHY] Front-end filter narrowed to 7.2 MHz (20 PRB SSB window).',
        '[UE-PHY] Carrier offset detected: SSB is NOT centered in channel.',
        '[UE-MIB] Awaiting k_SSB from MIB for RE-level grid alignment...',
      ]
    ),
    /* Sub-step 2: 微观载体 — 2D 时频网格 */
    makeSubStep(
      '微观载体 · 2D 时频网格',
      'SSB 资源映射：PSS/SSS/PBCH/DMRS 精确嵌入 20PRB×4 Symbol 时频矩阵',
      '<b>① 打开拼图</b> — 每个 SSB 占据频域 20 个 RB（240 子载波）× 时域 4 个 OFDM 符号，共 960 个 RE。四类物理信号像拼图一样精确嵌入各自的位置。<br>' +
      '<b>② PSS 打头阵</b> — Symbol 0 中央 127 个 RE（k=56~182）发射主同步信号，上下两端留空作为保护带。基站通常对 PSS 施加 +3dB 功率增强，让 UE 在噪声中最先锁定它。<br>' +
      '<b>③ SSS 居中位</b> — Symbol 2 中央 127 个 RE（k=56~182）发射辅同步信号，联合 PSS 即可计算出完整的物理小区 ID（PCI）。<br>' +
      '<b>④ PBCH 填满空隙</b> — Symbol 1 和 Symbol 3 全部 240 个 RE 承载 PBCH，Symbol 2 的上下两端（k=0~47, 192~239）也由 PBCH 填充。PBCH 内部每隔 4 个子载波嵌入一根 DM-RS 作为解调"探针"。<br>' +
      '<b>⑤ DM-RS 频移</b> — 修改下方 N_ID¹ 或 N_ID² 的值，观察 PBCH 区域内橙色 DM-RS 点随 PCI 变化整体上下浮动——偏移量由公式 <em>v = N_ID<sup>cell</sup> mod 4</em> 决定。',
      '从同步信号到小区 PCI · 四步递进推导',
      '<b>Step 1 — PSS 互相关检测 → N_ID²</b><br>' +
      'UE 用出厂预存的 3 条 m 序列（N_ID² ∈ {0, 1, 2}）分别与 Symbol 0 中央 127 个 RE 做滑动互相关。相关峰最高的那条序列对应的编号就是 N_ID²。<br>' +
      '→ 左侧 <span style="color:#E02424;font-weight:650;">粉色 PSS 区域</span>承载此信息。<br>' +
      '<div class="formula">N_ID² ∈ {0, 1, 2} &nbsp;·&nbsp; 3 选 1</div><br>' +
      '<b>Step 2 — SSS 序列检测 → N_ID¹</b><br>' +
      '锁定 N_ID² 后，UE 已知小区属于哪一组（共 3 组），每组 336 个候选。UE 用 336 条 Gold 序列分别与 Symbol 2 中央 127 个 RE 做相关，检出 N_ID¹。<br>' +
      '→ 左侧 <span style="color:#7C3AED;font-weight:650;">紫色 SSS 区域</span>承载此信息。<br>' +
      '<div class="formula">N_ID¹ ∈ {0, 1, …, 335} &nbsp;·&nbsp; 336 选 1</div><br>' +
      '<b>Step 3 — 合成完整 PCI</b><br>' +
      'N_ID¹ 是组内编号（0~335），N_ID² 是组号（0~2）。两者按公式合成，得到 0~1007 共 1008 个唯一标识。<br>' +
      '<div class="formula">PCI = 3 × N_ID¹ + N_ID²</div>' +
      '<div class="formula-note">例：N_ID¹=112, N_ID²=1 → PCI = 3×112+1 = 337</div><br>' +
      '<b>Step 4 — DM-RS 频移 v</b><br>' +
      'PBCH 的解调参考信号在频域的位置由 PCI 决定。不同 PCI 对应不同的 DM-RS 嵌入偏移，UE 必须先算出 PCI 才能正确提取 DM-RS 做信道估计。<br>' +
      '<div class="formula">v = N_ID<sup>cell</sup> mod 4 &nbsp;∈ {0, 1, 2, 3}</div>' +
      '<div class="formula-note">左侧网格中 DM-RS（橙色点）每隔 4 子载波出现一次。修改下方 N_ID¹ 或 N_ID² 值，观察 DM-RS 整体频移。</div><br>' +
      '<b>资源映射速查</b><br>' +
      '<table style="width:100%;font-size:10.5px;border-collapse:collapse;">' +
      '<tr style="border-bottom:1px solid var(--border);"><td style="padding:3px 7px;font-weight:700;">信号</td><td style="padding:3px 7px;font-weight:700;">符号</td><td style="padding:3px 7px;font-weight:700;">子载波 k</td><td style="padding:3px 7px;font-weight:700;">RE</td></tr>' +
      '<tr><td style="padding:2px 7px;color:#E02424;">PSS</td><td style="padding:2px 7px;font-family:var(--font-mono);">0</td><td style="padding:2px 7px;font-family:var(--font-mono);">56~182</td><td style="padding:2px 7px;">127</td></tr>' +
      '<tr><td style="padding:2px 7px;color:#7C3AED;">SSS</td><td style="padding:2px 7px;font-family:var(--font-mono);">2</td><td style="padding:2px 7px;font-family:var(--font-mono);">56~182</td><td style="padding:2px 7px;">127</td></tr>' +
      '<tr><td style="padding:2px 7px;color:#1C64F2;">PBCH</td><td style="padding:2px 7px;font-family:var(--font-mono);">1,2,3</td><td style="padding:2px 7px;font-family:var(--font-mono);">0~239 / 0~47,192~239</td><td style="padding:2px 7px;">576</td></tr>' +
      '<tr><td style="padding:2px 7px;color:#D97706;">DM-RS</td><td style="padding:2px 7px;font-family:var(--font-mono);">1,2,3</td><td style="padding:2px 7px;font-family:var(--font-mono);">k mod 4 = v</td><td style="padding:2px 7px;">144</td></tr></table>',
      [
        '[UE-PHY] SSB time-frequency grid decoder activated.',
        '[UE-PHY] Parsing 20 PRB × 4 Symbol resource grid (960 RE total).',
        '[UE-PHY] PSS detected at Symbol 0, k=56~182 (127 RE, +3dB boosted).',
        '[UE-PHY] SSS detected at Symbol 2, k=56~182 (127 RE, flanked by PBCH).',
        '[UE-PHY] PBCH occupies Symbol 1/3 (full 240 RE) + Symbol 2 (top & bottom).',
        '[UE-PHY] DM-RS extracted: 144 pilots embedded every 4th subcarrier within PBCH.',
        '[UE-PHY] DM-RS freq offset v = N_ID^cell mod 4 = 0 (adjustable via slider).',
        '[READY] Resource grid demapping complete. MIB decoding ready for next step.'
      ]
    ),
    /* Sub-step 3: 数据灌注 — skeleton for now */
    makeSubStep(
      '数据灌注 · MIB 打包与 DMRS',
      'PBCH 荷载映射功能开发中',
      'MIB 编码与 DMRS 隐式映射——即将上线。',
      '敬请期待',
      '后续迭代将补充详细内容。',
      []
    ),
    /* Sub-step 4: 波束扫描 — skeleton for now */
    makeSubStep(
      '空口辐射 · 波束扫描',
      '波束扫描功能开发中',
      '不同方向 UE 接收 SSB 的空间差异——即将上线。',
      '敬请期待',
      '后续迭代将补充详细内容。',
      []
    ),
  ];

  /* ── Stages 2-10: skeleton placeholders ───────────────────────────────── */
  var SKELETON_STEPS = [
    makeSubStep('功能开发中', '功能开发中', '此阶段的具体动画内容和理论解析正在开发中。', '敬请期待', '后续迭代将补充详细内容。'),
    makeSubStep('敬请期待', '敬请期待', '当前架构已支持独立 SVG 渲染和子步骤推进。', '敬请期待', '引擎和数据架构已就绪。'),
  ];

  function skel() { return JSON.parse(JSON.stringify(SKELETON_STEPS)); }

  /* ── Assemble FLOW_DATA ──────────────────────────────────────────────── */
  var FLOW_DATA = {
    0: { subSteps: S0_STEPS },
    1: { subSteps: S1_STEPS },
    2: { subSteps: skel() },
    3: { subSteps: skel() },
    4: { subSteps: skel() },
    5: { subSteps: skel() },
    6: { subSteps: skel() },
    7: { subSteps: skel() },
    8: { subSteps: skel() },
  };

  /* ── Export Global ───────────────────────────────────────────────────── */
  window.NR_VIZ_DATA = {
    BANDS:        BANDS,
    SYNC_POINTS:  SYNC_POINTS,
    STAGE_LABELS: STAGE_LABELS,
    STAGE_META:   STAGE_META,
    FLOW_DATA:    FLOW_DATA,
    CASE_LOGS:    S1_STEP0_CASE_LOGS,
  };
})();
