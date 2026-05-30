/* ═══════════════════════════════════════════════════════════════════════════
   5G NR · Stage Data v2.2  (BUG-FIX: subSteps wrapper + entity fixes)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── NR_CTX ─────────────────────────────────────────────────────────── */
  window.NR_CTX = {
    tc_ns: null,
    gscn: null, arfcn: null, ssb_case: 'C', scs_khz: 30,
    nid2: null, nid1: null, pci: null, ssb_index: null,
    sfn_offset: null, hrf: null, kssb: null, dmrs_v: null, mib: {},
    coreset0_rb_start: null, coreset0_rb_size: null, coreset0_sym: null,
    point_a_arfcn: null, initial_bwp_rb: null, rach_config: {}, ra_response_win: null,
    preamble_idx: null, ta_cmd: null, ta_ns: null, tc_rnti: null,
    c_rnti: null, rrc_state: 'IDLE',
    nas_state: null, pdu_session_id: null, drb_id: null,
  };

  /* ── Step builders ───────────────────────────────────────────────────── */
  function mkStep(mode, label, title, desc, tcTitle, tcContent, logs) {
    return {
      mode: mode || 'sim',
      actionCard: { label: label, title: title, desc: desc },
      theoryCard:  { title: tcTitle, content: tcContent },
      initLogs: logs || [],
    };
  }
  function discuss(title, desc, tcTitle, tc, logs) {
    return mkStep('discuss', '▌ 理论探讨', title, desc, tcTitle, tc, logs);
  }
  function sim(title, desc, tcTitle, tc, logs) {
    return mkStep('sim', '▶ 仿真动作', title, desc, tcTitle, tc, logs);
  }

  /* ── Stage Labels & Meta ─────────────────────────────────────────────── */
  var STAGE_LABELS = [
    '⓪ UE开机', '① SSB广播', '② PSS检测', '③ SSS同步',
    '④ PBCH解码', '⑤ CORESET#0', '⑥ SIB1解析', '⑦ PRACH接入',
    '⑧ RRC建立', '⑨ PDU会话',
  ];
  var STAGE_META = [
    { badge:'STANDBY',   dotColor:'#64748b', spec:'TS 38.101 §4.1 / 38.211 §4.3.1' },
    { badge:'SCANNING',  dotColor:'#d97706', spec:'TS 38.211 §7.4.3 / 38.213 §4.1'  },
    { badge:'PSS CORR',  dotColor:'#d97706', spec:'TS 38.211 §7.4.2.2'              },
    { badge:'SSS CORR',  dotColor:'#d97706', spec:'TS 38.211 §7.4.2.3'              },
    { badge:'DECODING',  dotColor:'#2563eb', spec:'TS 38.212 §7.1 / 38.331 §6.2.2'  },
    { badge:'BLIND DET', dotColor:'#2563eb', spec:'TS 38.213 §13'                   },
    { badge:'SIB1 DEC',  dotColor:'#2563eb', spec:'TS 38.331 §6.2.2'               },
    { badge:'RACH TX',   dotColor:'#059669', spec:'TS 38.211 §6.3.3 / 38.321 §5.1'  },
    { badge:'RRC CONN',  dotColor:'#059669', spec:'TS 38.331 §5.3 / 33.501 §6.2'    },
    { badge:'PDU UP',    dotColor:'#059669', spec:'TS 24.501 §6.4 / 38.300 §9.3'    },
  ];

  /* ════════════════════════════════════════════════════════════════════
     STAGE 0 · UE 开机初始化  (3 sub-steps: 0,1,2)
     ════════════════════════════════════════════════════════════════════ */
  var S0 = { subSteps: [

    discuss(
      '为什么需要原子时间单位 Tc？',
      '在任何射频操作前，我们必须理解 5G NR 物理层的时间基准体系。Tc 不是任意选取的——它是由 OFDM 的极限参数从数学上唯一确定的。',
      'Tc 的数学推导与工程意义',
      '<h3>为什么需要"原子刻度"？</h3>'+
      '<p>5G NR 支持 15 / 30 / 60 / 120 / 240kHz 五种子载波间隔（Numerology）共存。'+
      '多种 Numerology 的符号边界必须精确对齐，否则子载波正交性被破坏，产生 ICI 干扰。'+
      '要做到对齐，所有时域量就必须是同一个最小单位的整数倍——这就是 Tc 存在的理由。</p>'+
      '<h3>Tc 为什么是这个数？</h3>'+
      '<p>3GPP 先规定理论上限：<b>最大子载波间隔</b> Δf<sub>max</sub> = 480kHz × <b>最大 FFT 点数</b> N<sub>f</sub> = 4096，'+
      '二者乘积就是"极限 OFDM 系统"的采样率，其倒数即为 Tc。</p>'+
      '<div class="formula">T<sub>c</sub> = 1 / (480,000 × 4,096) ≈ <b>0.509 ns</b></div>'+
      '<p>所有真实 Numerology 都是该极限系统的整数倍缩放，因此天然是 Tc 的整数倍，对齐问题自动解决。</p>'+
      '<h3>Tc 的衍生关系</h3>'+
      '<table><tr><th>衍生量</th><th>Tc 表达</th><th>实际值</th><th>用途</th></tr>'+
      '<tr><td>TA 步长</td><td>16 · Tc</td><td>≈ 8.14 ns</td><td>上行定时提前分辨率</td></tr>'+
      '<tr><td>Normal CP (μ=1)</td><td>512 · Tc</td><td>≈ 0.26 μs</td><td>抵抗多径时延扩展</td></tr>'+
      '<tr><td>OFDM 符号 (μ=1)</td><td>2048 · Tc</td><td>≈ 1.04 μs</td><td>有用符号时长</td></tr>'+
      '<tr><td>Slot (μ=1)</td><td>30720 · Tc</td><td>= 0.5 ms</td><td>基本调度时间单位</td></tr>'+
      '<tr><td>Frame</td><td>307200 · Tc</td><td>= 10 ms</td><td>系统帧周期</td></tr></table>',
      ['[BOOT] 物理层时序理论探讨模式激活。']
    ),

    sim(
      'TCXO 起振 → PLL 倍频 → Tc 生成',
      '<b>① TCXO</b>（温补晶振）以 38.4MHz 起振，精度 ±0.1ppm。<b>② Integer-N PLL</b> 整数倍频至 1228.8MHz（×32）。<b>③ Fractional-N PLL</b> 精细合成 1966.08MHz 采样时钟，建立 <em>Tc ≈ 0.509ns</em>。',
      'TS 38.211 §4.1 — 时域参数与 Tc 定义',
      '<h3>从晶振到 Tc：硬件时钟链路</h3>'+
      '<p>典型 5G 基带芯片采用三级时钟树：</p>'+
      '<ul><li><b>TCXO 38.4MHz</b>：温补晶振，全温范围频偏 &lt;±0.1ppm</li>'+
      '<li><b>Integer-N PLL</b>：38.4MHz → 1228.8MHz（×32 整数倍频）</li>'+
      '<li><b>Fractional-N PLL</b>：精细合成最终 1966.08MHz 基带采样时钟</li></ul>'+
      '<div class="formula">f<sub>sample</sub> = Δf<sub>max</sub> × N<sub>f</sub> = 480kHz × 4096 = 1966.08 MHz</div>'+
      '<p>L1 计数器以 Tc 为步长滚动，驱动 OFDM 符号切割、CP 插入与 TA 精确补偿。</p>',
      ['[INIT] 终端 PMIC 数字核心供电轨激活。',
       '[CLOCK] 外部 38.4MHz TCXO 起振，温度补偿校准中…',
       '[LOCK] Integer-N PLL 锁定，× 32 倍频至 1228.8MHz。',
       '[LOCK] Fractional-N PLL 精细合成完成，采样时钟稳定。',
       '[SUCCESS] Tc = 0.509ns 建立。L1 计数器复位，定时系统就绪。']
    ),

    sim(
      '协议先验字典载入',
      '<b>① PSS 多项式</b> g(x)=x⁷+x⁴+1 注入滑动相关器 ROM。<b>② GSCN 同步栅格</b>（FR1 仅 347 个法定格点，搜索压缩 96×）载入扫描引擎。<b>③ PLMN 优先级</b>（USIM 运营商列表）驱动频段选择。',
      '先验知识的工程价值：搜索空间压缩',
      '<h3>为什么不直接扫 ARFCN？</h3>'+
      '<p>若按 15kHz 信道栅格盲扫 FR1 全段，需遍历约 360,000 个频点，每点驻留 1ms 则需 6 分钟以上。三级先验过滤器将搜索压缩至 2 秒内：</p>'+
      '<table><tr><th>过滤器</th><th>原理</th><th>压缩效果</th></tr>'+
      '<tr><td>GSCN 栅格</td><td>SSB 只在 1.44MHz 步长的法定格点发射</td><td>÷ 96×</td></tr>'+
      '<tr><td>PSS 字典</td><td>仅 3 条候选序列，已知无需盲猜</td><td>×3（已知）</td></tr>'+
      '<tr><td>PLMN 优先级</td><td>优先搜索签约运营商频段</td><td>排除 60% 频段</td></tr></table>'+
      '<div class="formula">g(x) = x⁷ + x⁴ + 1 &nbsp; · &nbsp; N<sub>ID</sub>² ∈ {0, 1, 2}</div>',
      ['[BOOT] 基带芯片 L1 固件加载完毕，FFT 协处理器自检 OK。',
       '[DATA] PSS 多项式 g(x)=x7+x4+1 注入相关器 ROM。',
       '[DATA] GSCN 同步栅格字典：FR1 共 7036 格点，Sub-6G 约 347 个常用格点。',
       '[DATA] 读取 USIM：PLMN=46001（中国移动），频段优先级 n78 > n41 > n1。',
       '[READY] 先验字典全部就绪，RF 前端置于宽带扫描模式。']
    ),

  ]};

  /* ════════════════════════════════════════════════════════════════════
     STAGE 1 · gNB SSB 广播  (5 sub-steps: 0,1,2,3,4)
     ════════════════════════════════════════════════════════════════════ */
  var S1 = { subSteps: [

    discuss(
      '下行同步的根本难题',
      '开机的 UE 对周围一无所知：不知道时间、不知道频率、不知道小区。gNB 是如何在"单向无知"的条件下让全网 UE 都能找到自己的？',
      '盲同步问题的三个维度',
      '<h3>① 时域无知</h3><p>不知道帧头在哪里。SSB 固定在帧中特定符号，UE 检测到 SSS 后反推帧头，精度 ±1μs。</p>'+
      '<h3>② 频域无知</h3><p>只知道频段范围，不知道精确频率。GSCN 栅格将搜索从连续压缩到 347 个离散格点，步长 1.44MHz，&lt;2s 完成扫描。</p>'+
      '<h3>③ 空域无知</h3><p>5G 使用波束赋形，gNB 依次扫描多个方向。SSB Burst Set 在 5ms 半帧内轮询所有波束方向，每个 SSB Index 隐式编码一个方向。</p>'+
      '<h3>SSB 的精妙设计</h3><p>一套 SSB Burst Set 同时解决三个维度问题：时域对齐 · 频率锁定 · 空间感知。</p>',
      ['[INIT] gNB PHY 层仿真模式启动。小区配置：PCI=337, n78, 30kHz, 100MHz BW。']
    ),

    sim(
      'SSB Burst 时域定位（Case A~E）',
      '点击顶部 <b>Case 按钮</b>切换子载波间隔方案，观察 SSB 块在 5ms 半帧内的时域排布差异。动画同步高亮上方 SSB 块与下方空间波束——<em>时域第 i 个 SSB 块 = 空间第 i 个波束方向</em>，底栏实时显示该方向对应的 PRACH 资源组编号。',
      'SSB Burst Set · 时空映射机制（TS 38.213 §4.1）',
      '<h3>时空映射：SSB Index 的双重身份</h3>'+
      '<p>SSB Index 既是<b>时域标识</b>（第 i 个 4-symbol 块），也是<b>空间标识</b>（天线阵列指向第 i 个方向）。gNB 保证发射第 i 个 SSB 时恰好对准第 i 个波束方向——<em>时序即方向，无需额外信令开销</em>。</p>'+
      '<h3>空间差异性：相同 MIB，不同"空间身份证"</h3>'+
      '<p>多个 UE 收到的 MIB 内容完全相同，但各自捕获的 SSB Index 不同。该 Index 决定了 UE 在 RACH 阶段应选择<b>哪组 PRACH 资源</b>发起 Msg1——gNB 凭此反推 UE 所在波束方向，零信令开销完成空间定向。这正是 5G NR 波束管理的精妙之处。</p>'+
      '<h3>真实部署：远比左图复杂</h3>'+
      '<ul>'+
      '<li><b>多扇区</b>：实际基站覆盖 3 个扇区（各约 120°），每扇区为独立逻辑小区，拥有独立 PCI 与 SSB 周期；相邻扇区错开 Burst 起始偏移，避免扇区间波束互扰。</li>'+
      '<li><b>三维波束</b>：左图为简化 2D 示意。真实波束赋形同时具有水平<em>方位角</em>扫描与垂直<em>俯仰角</em>调节——低仰角覆盖近处地面用户，高仰角覆盖远处高楼用户。</li>'+
      '</ul>'+
      '<h3>Case 差异速查</h3>'+
      '<table>'+
      '<tr><th>Case</th><th>SCS</th><th>5ms 内 slots</th><th>slot 时长</th><th>适用场景</th></tr>'+
      '<tr><td>A</td><td>15kHz</td><td>5</td><td>1.00ms</td><td>FR1 低频宏蜂窝</td></tr>'+
      '<tr><td>B/C</td><td>30kHz</td><td>10</td><td>0.50ms</td><td>FR1 中频主力（国内 n78）</td></tr>'+
      '<tr><td>D</td><td>120kHz</td><td>40</td><td>0.125ms</td><td>FR2 毫米波</td></tr>'+
      '<tr><td>E</td><td>240kHz</td><td>80</td><td>0.063ms</td><td>FR2 极速</td></tr>'+
      '</table>',
      ['[PHY] gNB 开始发射 SSB Burst Set，Case C，30kHz SCS。',
       '[PHY] L_max=8，波束 #0~#7 在 5ms 半帧内发射完毕。',
       '[SUCCESS] SSB Burst Set 周期：20ms（标准最保守值）。']
    ),

    sim(
      'GSCN → ARFCN 频域粗定位 + k_SSB 精对齐',
      '拖动 <b>GSCN 滑块</b>模拟 RF 扫描锁定（n78 有效范围 7708~8054，对应 3.3~3.8GHz）。拖动 <b>k_SSB 滑块</b>观察游标放大区——奇数值时 SSB 网格劈在 CRB 子载波正中间（半齿轮错位），偶数值时完美咬合。<em>k_SSB ≥ 24 可触发 NSA 协议壁垒</em>。',
      '频域坐标系建立：双重偏移量反推 Point A（TS 38.211 §4.4）',
      '<h3>为什么要从 SSB 反推全局坐标？</h3>'+
      '<p>UE 开机时唯一已知实体是 SSB，但后续读 CORESET#0、解 PDCCH 全依赖以 <b>Point A 为零点</b>的 CRB 坐标系。SSB 刻意放置在 GSCN 锚点而非 CRB 对齐位置，因此 UE 必须以 SSB 频点为起点，通过基站下发的两个偏移量反推 Point A——否则不知道 CRB#0 在哪里，后续调度无从解析。</p>'+
      '<h3>双重偏移量反推公式</h3>'+
      '<div class="formula">f<sub>PointA</sub> = f<sub>SSB</sub> − OffsetToPointA × 12 × Δf<sub>CRB</sub> − k<sub>SSB</sub> × Δf<sub>offset</sub></div>'+
      '<p><b>一宏一微：</b>宏观 <em>offsetToPointA</em>（SIB1 下发）是 RB 级大步；微观 <em>k_SSB</em>（MIB + PBCH payload 下发）是 RE 级零头。两者相减即得 Point A 绝对频率。</p>'+
      '<table>'+
      '<tr><th>参数</th><th>承载字段</th><th>来源</th></tr>'+
      '<tr><td>k_SSB</td><td>ssb-SubcarrierOffset (MIB) + PBCH payload MSB (FR1)</td><td>SSB 解码</td></tr>'+
      '<tr><td>OffsetToPointA</td><td>offsetToPointA (SIB1 → ServingCellConfigCommonSIB)</td><td>SIB1 解码</td></tr>'+
      '<tr><td>Δf_CRB</td><td>subCarrierSpacingCommon (MIB)</td><td>SSB 解码</td></tr>'+
      '<tr><td>GSCN</td><td>UE 出厂固化字典（非空口下发）</td><td>本地 ROM</td></tr>'+
      '</table>'+
      '<h3>三套 SCS 各司其职</h3>'+
      '<p><b>① Δf_SSB</b>：SSB 发射脉冲宽度，由 Case 决定（FR1: 15/30kHz，FR2: 120/240kHz）。UE 基带 FFT 按此宽度开窗捕获 SSB。</p>'+
      '<p><b>② Δf_CRB</b>：数据网格"地砖"尺寸，<em>offsetToPointA</em> 的计量单位，由 MIB 中 subCarrierSpacingCommon 广播。FR1 下 1 RB = 12 × 30kHz = 360kHz。</p>'+
      '<p><b>③ Δf_offset</b>：k_SSB 游标精度，<em>协议强制硬编码</em>：FR1 = 15kHz，FR2 = 60kHz。即便 SSB 与 CRB 同为 30kHz，错位零头仍可能是 15kHz——这把"游标卡尺"专量这道缝隙。</p>'+
      '<h3>FR1 vs FR2 参数全景</h3>'+
      '<table>'+
      '<tr><th>参数</th><th>FR1 (Case A/B/C)</th><th>FR2 (Case D/E)</th></tr>'+
      '<tr><td>Δf_SSB</td><td>15 / 30 kHz</td><td>120 / 240 kHz</td></tr>'+
      '<tr><td>Δf_CRB</td><td>15 / 30 kHz</td><td>60 / 120 kHz</td></tr>'+
      '<tr><td>Δf_offset（硬编码）</td><td><b>15 kHz</b></td><td><b>60 kHz</b></td></tr>'+
      '<tr><td>k_SSB 范围</td><td>0 ~ 23</td><td>0 ~ 11</td></tr>'+
      '<tr><td>k_SSB 承载</td><td>LSB 4bit 存 MIB + MSB 1bit 存 PBCH</td><td>完整 6bit 存 MIB</td></tr>'+
      '</table>'+
      '<h3>GSCN 是什么，范围是多少？</h3>'+
      '<p>GSCN（Global Synchronization Channel Number）是协议在连续频谱上划定的<b>稀疏同步锚点</b>，SSB 只能在此发射。n78（3.3~3.8GHz）的 GSCN 范围为 <em>7708~8054</em>（步长 3，116 个格点，步长约 1.44MHz）。整个 Sub-6GHz 约 <b>347 个</b>有效格点，相比 ARFCN 的 30000+ 个频点压缩了约 96 倍——这是开机扫网从分钟级压缩到秒级的根本原因。</p>',
      ['[UE-RF] 宽带 RSSI 扫描启动，遍历 n78 GSCN 格点…',
       '[UE-RF] GSCN=8778 → RSSI -68dBm [峰值检测]',
       '[UE-PLL] RF PLL 锁定 GSCN=8778，Fc=3549.60MHz。',
       '[UE-PHY] k_SSB=2 解析完成，RE 级精对齐完成。写入 NR_CTX。']
    ),

    sim(
      'SSB 时频网格：20PRB × 4Symbol 精确映射',
      '左侧网格<b>横轴为时间（Symbol 0~3），纵轴为频率（RB 0~19，低频在下）</b>。点击底部步骤卡片或拖动滑块，观察不同信号在时频格点上的精确占位。<em>PRB#0（底行蓝框）</em>同步出现在右侧放大镜，DM-RS 橙色格随 PCI 整体平移。',
      'SSB 时频资源映射（TS 38.211 §7.4.2）',
      '<h3>960 个 RE 的功能划分全景</h3>'+
      '<table>'+
      '<tr><th>信号</th><th>Symbol</th><th>子载波范围</th><th>RE 数</th><th>功能</th></tr>'+
      '<tr><td style="color:#ef4444"><b>PSS</b></td><td>0</td><td>k = 56~182</td><td>127</td><td>N_ID² ∈ {0,1,2}，OFDM 符号边界</td></tr>'+
      '<tr><td style="color:#7c3aed"><b>SSS</b></td><td>2</td><td>k = 56~182</td><td>127</td><td>N_ID¹ ∈ {0~335}，半帧同步</td></tr>'+
      '<tr><td style="color:#3b82f6"><b>PBCH</b></td><td>1, 2, 3</td><td>0~239（SSS/Guard 区除外）</td><td>576</td><td>MIB 承载，Polar Code 编码</td></tr>'+
      '<tr><td style="color:#f97316"><b>DM-RS</b></td><td>1, 2, 3</td><td>k mod 4 = v</td><td>144</td><td>PBCH 信道估计锚点</td></tr>'+
      '<tr><td style="color:#94a3b8"><b>Guard</b></td><td>2</td><td>k=48~55, k=183~191</td><td>17</td><td>保护带，Set to Zero</td></tr>'+
      '<tr><td style="color:#94a3b8">空载</td><td>0</td><td>0~55, 183~239</td><td>96</td><td>PSS 两侧留空</td></tr>'+
      '</table>'+
      '<h3>Symbol 2 为何是五段结构？</h3>'+
      '<p>Symbol 2 是 SSB 中最复杂的符号，从低频到高频依次：</p>'+
      '<div class="formula">PBCH(48) + Guard(8) + SSS(127) + Guard(9) + PBCH(48) = 240 RE</div>'+
      '<p><b>保护带不对称（8 vs 9）的原因</b>：SSS(127) + 左(8) + 右(9) = 144 = 12RB × 12SC，精确嵌入 12 个完整 PRB，零资源浪费——这是协议刻意的整除设计。</p>'+
      '<h3>DM-RS 频偏与 PCI 的强绑定</h3>'+
      '<div class="formula">v = PCI mod 4 ∈ {0, 1, 2, 3}</div>'+
      '<p>DM-RS 落在所有满足 <em>k mod 4 = v</em> 的子载波上，每 4 个 SC 一根锚点，共 144 根。</p>'+
      '<p><b>为什么要绑定 PCI？</b>相邻小区 PCI 不同 → v 值不同 → DM-RS 物理位置相互错开 → 多小区同频组网时各小区参考信号天然正交，UE 可对任意小区做干净的信道估计，无需额外协调。</p>'+
      '<p>v 的确定是整个 PBCH 解调的前置条件：先从 PSS/SSS 获得 PCI → 定位 DM-RS → 信道估计 → 解出 MIB。<b>这正是步骤①②③④必须按顺序执行的根本原因。</b></p>'+
      '<h3>UE 侧解调执行顺序（与左侧步骤卡片对应）</h3>'+
      '<table>'+
      '<tr><th>步骤</th><th>动作</th><th>获得</th></tr>'+
      '<tr><td>① PSS</td><td>Symbol 0 盲相关 3 种序列</td><td>N_ID²，符号定时</td></tr>'+
      '<tr><td>② SSS</td><td>Symbol 2 中央盲匹配 336 种</td><td>N_ID¹，半帧位置</td></tr>'+
      '<tr><td>③ PCI</td><td>3 × N_ID¹ + N_ID²</td><td>PCI（1008 种之一）</td></tr>'+
      '<tr><td>④ DM-RS</td><td>v = PCI mod 4 → LS 信道估计</td><td>信道 H(f)，MIB 就绪</td></tr>'+
      '</table>',
      ['[UE-PHY] SSB 时频格点解调器激活，20PRB × 4Symbol 资源网格。',
       '[UE-PHY] PSS: Symbol 0, k=56~182。SSS: Symbol 2, k=56~182。',
       '[UE-PHY] PBCH DM-RS: v = PCI mod 4，每 4 子载波 1 个，共 144 RE。',
       '[UE-PHY] LS 信道估计完成，PBCH 解调就绪。']
    ),

    sim(
      'MIB 比特打包与 PBCH Polar 编码',
      '23-bit MIB 字段彩色展开：SFN / HRF / SCS / k_SSB / CORESET#0 / CellBarred。Polar Code 提供接近香农极限的纠错能力，短块性能优于 LTE Turbo Code。',
      'MIB 结构与 Polar Code 编码链路（TS 38.212 §7.1）',
      '<table><tr><th>字段</th><th>Bits</th><th>IE 名</th><th>值</th></tr>'+
      '<tr><td>SFN[9:4]</td><td>6</td><td>systemFrameNumber</td><td>000101 (SFN=42)</td></tr>'+
      '<tr><td>SCS</td><td>1</td><td>subCarrierSpacingCommon</td><td>1 = 30kHz</td></tr>'+
      '<tr><td>SFN[3:0]</td><td>4</td><td>(PBCH payload)</td><td>0100</td></tr>'+
      '<tr><td>HRF</td><td>1</td><td>(PBCH bit[10])</td><td>0 = 前半帧</td></tr>'+
      '<tr><td>k_SSB[4:0]</td><td>5</td><td>ssb-SubcarrierOffset</td><td>00010 = 2</td></tr>'+
      '<tr><td>CORESET#0</td><td>4</td><td>pdcch-ConfigSIB1</td><td>0101 = Row 5</td></tr>'+
      '<tr><td>CellBarred</td><td>1</td><td>cellBarred</td><td>0 = 未禁入</td></tr></table>'+
      '<h3>Polar Code 优势</h3>'+
      '<p>首个被证明可达香农容量的编码，短块（&lt;512bit）性能比 Turbo Code 优 0.5~1dB，BLER=1% 可在 SNR=-4dB 时检出。</p>',
      ['[UE-PHY] MIB Polar 解码完成。',
       '[DATA] SFN=42, HRF=0, SCS=30kHz, k_SSB=2, CellBarred=false',
       '[DATA] pdcch-ConfigSIB1=0x05 → CORESET#0 Row 5 查表',
       '[SUCCESS] MIB 写入 NR_CTX.mib。Stage 1 完成。']
    ),

  ]};

  /* ════════════════════════════════════════════════════════════════════
     STAGE 2 · PSS 检测  (2 sub-steps)
     ════════════════════════════════════════════════════════════════════ */
  var S2 = { subSteps: [
    discuss(
      'PSS 滑动相关器的数学本质',
      '相关器是 UE 接收机的"时域显微镜"。理解互相关 R(τ) = Σ x[n]·s*[n−τ] 的物理意义，是理解后续 SSS/PRACH 检测的共同基础。',
      '互相关检测原理',
      '<h3>相关函数的信号意义</h3>'+
      '<p>若接收 x[n] = s[n−τ₀] + w[n]（s 已知序列，w 噪声），则 R(τ) 在 τ=τ₀ 处出现峰值，给出符号边界和 SNR 估计。</p>'+
      '<div class="formula">R(τ) = Σ x[n] · s*[n−τ] &nbsp; → 峰值位置 = τ₀（符号时序偏移）</div>'+
      '<h3>PSS 使用 m 序列的原因</h3>'+
      '<p>m 序列具有理想自相关性：主峰 = N，旁峰 ≈ -1/N，最大化峰旁比（PSL），低 SNR 下仍可靠检测。</p>',
      ['[PHY] PSS 互相关扫描模式激活。三路并行相关器（N_ID²=0/1/2）就绪。']
    ),
    sim(
      'RF 扫描 → GSCN 锁定 → PSS 相关峰检测',
      '频域粗扫完成后进入精细 PSS 时域相关。三路并行相关器同时运行，最大峰值对应的 N_ID² 即为目标小区的 PSS 序号，同时确定 OFDM 符号边界。',
      'PSS 检测流程（TS 38.211 §7.4.2.2）',
      '<p>标准检测流程：① 遍历 GSCN → ② 三路并行互相关 → ③ 取最大峰对应的 N_ID² 和符号偏移。</p>'+
      '<p>PSS 生成多项式：<code>g(x) = x⁷ + x⁴ + 1</code>，三条序列初始状态不同，互相关接近零。</p>',
      ['[PHY] 在 GSCN=8778 频点启动 PSS 时域相关…',
       '[PHY] N_ID²=0 相关峰: 0.12 | N_ID²=1 相关峰: 0.87 | N_ID²=2 相关峰: 0.09',
       '[SUCCESS] N_ID²=1 确认。符号边界对齐完成。写入 NR_CTX.nid2=1。']
    ),
  ]};

  /* ════════════════════════════════════════════════════════════════════
     STAGE 3~9 · 骨架（依赖链预定义完毕）
     ════════════════════════════════════════════════════════════════════ */
  function skelStage(title, spec, logs0) {
    return { subSteps: [
      discuss('理论探讨 · ' + title,
        '此阶段内容正在开发中，全局上下文 NR_CTX 依赖链已就绪。',
        '协议参考: ' + spec,
        '<p>此 Stage 将完整实现精确仿真内容。所有前序 Stage 写入的 NR_CTX 字段均可在此读取。</p>',
        logs0 || []
      ),
      sim(title + ' · 仿真',
        '可视化仿真内容开发中。',
        '架构就绪',
        '<p>SVG 渲染器接口已预留，等待填入。</p>',
        []
      ),
    ]};
  }

  var S3 = skelStage('SSS 帧同步 & PCI',   'TS 38.211 §7.4.2.3', ['[PHY] SSS Gold 序列匹配器激活。']);
  var S4 = skelStage('PBCH 解码 & MIB',    'TS 38.212 §7.1',     ['[PHY] Polar 解码器初始化。']);
  var S5 = skelStage('CORESET#0 盲检',     'TS 38.213 §13',      ['[MAC] PDCCH 盲检状态机启动。']);
  var S6 = skelStage('SIB1 解析',          'TS 38.331 §6.2.2',   ['[RRC] SIB1 ASN.1 解码器就绪。']);
  var S7 = skelStage('PRACH 随机接入',     'TS 38.211 §6.3.3',   ['[MAC] RACH 状态机初始化。']);
  var S8 = skelStage('RRC 建立 & 安全',   'TS 38.331 §5.3',     ['[RRC] RRC 状态机 → CONNECTING。']);
  var S9 = skelStage('PDU 会话建立',       'TS 24.501 §6.4',     ['[NAS] PDU Session 请求发起。']);

  /* ── Export ──────────────────────────────────────────────────────────── */
  window.NR_VIZ_DATA = {
    STAGE_LABELS: STAGE_LABELS,
    STAGE_META:   STAGE_META,
    FLOW_DATA: {
      0:S0, 1:S1, 2:S2, 3:S3, 4:S4,
      5:S5, 6:S6, 7:S7, 8:S8, 9:S9,
    },
    CASE_DEFS: {
      A:{ scs:'15kHz',  lMax:8,  color:'#6366f1', label:'Case A' },
      B:{ scs:'30kHz',  lMax:8,  color:'#8b5cf6', label:'Case B' },
      C:{ scs:'30kHz',  lMax:8,  color:'#1d4ed8', label:'Case C ★' },
      D:{ scs:'120kHz', lMax:64, color:'#059669', label:'Case D' },
      E:{ scs:'240kHz', lMax:64, color:'#dc2626', label:'Case E' },
    },
  };
})();
