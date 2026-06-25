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

  /* 从 sessionStorage 恢复前序 Stage 写入的值（跨页持久化） */
  (function _restoreCtx(){
    var P = 'nr_ctx_';
    for(var i=0;i<sessionStorage.length;i++){
      var k = sessionStorage.key(i);
      if(k.indexOf(P)===0){
        try { window.NR_CTX[k.slice(P.length)] = JSON.parse(sessionStorage.getItem(k)); } catch(e){}
      }
    }
  })();

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
    '⑧ RRC建立',
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
      '<p>关键中间量：<b>κ = T<sub>s</sub> / T<sub>c</sub> = 64</b>（LTE 参考单位 T<sub>s</sub> = 1/(15000×2048) ≈ 32.55 ns）。'+
      '协议中那些经典的整数（16 / 144 / 2048 / 307200）都是 <b>T<sub>s</sub> 的倍数</b>，不是 T<sub>c</sub> 的倍数——直接乘会差 64 倍。</p>'+
      '<table><tr><th>衍生量</th><th>规范表达</th><th>实际值</th><th>用途</th></tr>'+
      '<tr><td>TA 步长 (μ=1)</td><td>16·64·T<sub>c</sub>/2<sup>μ</sup> = 512·T<sub>c</sub></td><td>≈ 0.26 μs</td><td>上行定时提前分辨率</td></tr>'+
      '<tr><td>Normal CP (μ=1)</td><td>144·κ·2<sup>−μ</sup>·T<sub>c</sub> = 4608·T<sub>c</sub></td><td>≈ 2.34 μs</td><td>抵抗多径时延扩展</td></tr>'+
      '<tr><td>OFDM 符号 (μ=1)</td><td>2048·κ·2<sup>−μ</sup>·T<sub>c</sub> = 65536·T<sub>c</sub></td><td>≈ 33.33 μs</td><td>有用符号时长</td></tr>'+
      '<tr><td>Slot (μ=1)</td><td>14 符号 = 983040·T<sub>c</sub></td><td>= 0.5 ms</td><td>基本调度时间单位</td></tr>'+
      '<tr><td>Frame</td><td>307200·T<sub>s</sub> = 19,660,800·T<sub>c</sub></td><td>= 10 ms</td><td>系统帧周期</td></tr></table>',
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
       '[DATA] GSCN 同步栅格字典：Sub-6G 常用约 347 个格点（n78: 7708~8054）。',
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
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
      '<b style="color:#0e7490;">📺 看懂这张图</b><br>'+
      '<b>① 上方横条</b>：5ms 半帧的时间轴，每个亮块是一个 4-symbol 的 SSB 块（第 i 块 = 第 i 个波束）。切 Case 按钮看不同 SCS 下块数/间距的变化。<br>'+
      '<b>② 下方扇形</b>：gNB 的空间波束方向，与上方 SSB 块一一对应、同步高亮——<b>时序即方向</b>。<br>'+
      '<b>③ 底栏</b>：当前高亮波束对应的 PRACH 资源组编号（UE 将凭此在 RACH 阶段告诉 gNB 自己在哪个方向）。</div>'+
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
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
      '<b style="color:#0e7490;">📺 看懂这张图</b><br>'+
      '<b>① GSCN 滑块</b>：模拟 RF 在 n78 频段上逐个扫描同步栅格锚点，锁定 SSB 中心频率 Fc。<br>'+
      '<b>② 放大镜（游标区）</b>：把 SSB 网格与 CRB 网格的对齐缝隙放大——k_SSB <b>偶数</b>时两套网格完美咬合，<b>奇数</b>时 SSB 劈在 CRB 子载波正中间（半齿错位）。<br>'+
      '<b>③ k_SSB 滑块</b>：拖动看错位零头如何被这把"游标卡尺"逐 RE 量出；≥24 触发 NSA 协议壁垒提示。</div>'+
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
       '[UE-RF] GSCN=7881 → RSSI -68dBm [峰值检测]',
       '[UE-PLL] RF PLL 锁定 GSCN=7881，Fc=3550.08MHz。',
       '[UE-PHY] k_SSB=2 解析完成，RE 级精对齐完成。写入 NR_CTX。']
    ),

    sim(
      'SSB 时频网格：20PRB × 4Symbol 精确映射',
      '左侧网格<b>横轴为时间（Symbol 0~3），纵轴为频率（RB 0~19，低频在下）</b>。点击底部步骤卡片或拖动滑块，观察不同信号在时频格点上的精确占位。<em>PRB#0（底行蓝框）</em>同步出现在右侧放大镜，DM-RS 橙色格随 PCI 整体平移。',
      'SSB 时频资源映射（TS 38.211 §7.4.2）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
      '<b style="color:#0e7490;">📺 看懂这张图</b><br>'+
      '<b>① 左侧网格</b>：横轴 = 时间（Symbol 0~3），纵轴 = 频率（RB 0~19，低频在下）。每个小格是一个 RE，颜色即信号身份——<span style="color:#ef4444">红=PSS</span> / <span style="color:#7c3aed">紫=SSS</span> / <span style="color:#3b82f6">蓝=PBCH</span> / <span style="color:#f97316">橙=DM-RS</span> / 灰=保护带。<br>'+
      '<b>② 右侧放大镜</b>：PRB#0（网格底行蓝框）的逐 RE 细节。<br>'+
      '<b>③ 橙色 DM-RS</b>：拖动 PCI 滑块，橙格按 v=PCI mod 4 整体平移——这就是相邻小区参考信号天然错开的机制。</div>'+
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
      '点击 <b>下一步 ▷</b> 逐步推进编码装配线，观察比特流从 32bit PBCH 载荷膨胀至 864bit 装甲的全过程。点击 <b>X光扫描</b> 高亮 ssb-SubcarrierOffset 与 pdcch-ConfigSIB1 两把关键钥匙，底部字段位图严格对齐 0~22 比特刻度轴。',
      'PBCH 载荷结构与 Polar 编码链路（TS 38.212 §7.1 / 38.331 §6.2.2）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
      '<b style="color:#0e7490;">📺 看懂这段动画</b><br>'+
      '<b>① 装配线</b>：点「下一步 ▷」逐级推进——32bit 载荷 → +CRC 到 56bit → Polar 编码到 512bit → 速率匹配到 864bit → PCI 扰码。看比特流如何一步步"膨胀成装甲"。<br>'+
      '<b>② X光扫描</b>：点该按钮高亮两把关键钥匙——<span style="color:#d97706">ssb-SubcarrierOffset</span>（频域精对齐）与 <span style="color:#059669">pdcch-ConfigSIB1</span>（找 SIB1 的入口）。<br>'+
      '<b>③ 底部位图</b>：MIB 各字段严格对齐 0~22 比特刻度轴，看清每个字段占哪几位。</div>'+
      '<h3>容量建立：为什么刚好 864bit？</h3>'+
      '<p>PBCH 采用 <b>QPSK 调制</b>（TS 38.211 §7.3.3.3）——UE 开机时信道最差，必须选解调门限最低的调制方式，宁可牺牲频谱效率换取可靠性。432 有效 RE × 2bit/RE = <em>864bit 集装箱边界</em>。</p>'+
      '<h3>PBCH 载荷双来源结构（32bit 总载荷）</h3>'+
      '<p>PBCH 载荷 = <b>高层 24bit</b>（RRC 层静态配置）+ <b>物理层 8bit</b>（基带硬件每次发射动态注入）= 32bit，再附加 CRC-24C 后共 56bit 进入 Polar 编码器。</p>'+
      '<p><b>高层 24bit = MIB 23bit + 类型指示 1bit</b></p>'+
      '<table>'+
      '<tr><th>字段</th><th>位数</th><th>说明</th></tr>'+
      '<tr><td>systemFrameNumber</td><td>6</td><td>SFN 高 6 位（MSB），与物理层 4bit LSB 拼合为完整 SFN[9:0]（0~1023，周期 10.24s）</td></tr>'+
      '<tr><td>subCarrierSpacingCommon</td><td>1</td><td>SIB1/Msg2/Msg4 的 SCS（FR1: 15/30kHz，FR2: 60/120kHz）</td></tr>'+
      '<tr><td>dmrs-TypeA-Position</td><td>1</td><td>数据信道前置 DMRS 起始位置（第 3 或第 4 个符号）</td></tr>'+
      '<tr><td><b style="color:var(--warn)">ssb-SubcarrierOffset</b></td><td><b>4</b></td><td>SSB 与 CRB 的子载波级偏移（k_SSB 低 4 位）；或指示该小区不携带 SIB1</td></tr>'+
      '<tr><td><b style="color:var(--accent)">pdcch-ConfigSIB1</b></td><td><b>8</b></td><td>CORESET#0 时频资源 + 搜索空间参数；或指示去哪找携带 SIB1 的 SSB</td></tr>'+
      '<tr><td>cellBarred</td><td>1</td><td>小区是否允许驻留</td></tr>'+
      '<tr><td>intraFreqReselection</td><td>1</td><td>是否允许同频小区重选（cellBarred 时生效）</td></tr>'+
      '<tr><td>spare</td><td>1</td><td>前向兼容预留</td></tr>'+
      '</table>'+
      '<p><b>物理层 8bit</b>（TS 38.212 §7.1.1，每次 PBCH 发射实时写入）</p>'+
      '<table>'+
      '<tr><th>字段</th><th>位数</th><th>说明</th></tr>'+
      '<tr><td>SFN[3:0]</td><td>4</td><td>SFN 低 4 位。MIB 只存高 6 位（80ms 才进位一次），低 4 位每 10ms 变化，必须物理层实时注入</td></tr>'+
      '<tr><td>HRF（半帧指示）</td><td>1</td><td>SSB 在前/后 5ms 半帧。L_max=4 时 DMRS 已隐式携带，但物理层仍生成；L_max=8/64 时必读</td></tr>'+
      '<tr><td>SSB Index MSB</td><td>3</td><td>FR2（L_max=64）：SSB Index 高 3 位。FR1：其中 1bit 与 ssb-SubcarrierOffset 联合构成 k_SSB 第 5 位，另 2bit 保留</td></tr>'+
      '</table>'+
      '<p><b>设计哲学</b>：变化慢的放 MIB（80ms 更新），变化快的由物理层动态注入（每次发射更新）——RRC 层无需高频重新编码。</p>'+
      '<h3>Polar 编码装配线（56bit → 864bit）</h3>'+
      '<table>'+
      '<tr><th>阶段</th><th>比特数</th><th>操作</th></tr>'+
      '<tr><td>① 载荷组装</td><td>32</td><td>高层 24bit + 物理层 8bit 动态拼合</td></tr>'+
      '<tr><td>② CRC 附加</td><td>56</td><td>+ CRC-24C（24bit 校验码），进入编码器</td></tr>'+
      '<tr><td>③ Polar 编码</td><td>512</td><td>56bit 占据可靠性最高的极化信道，456bit 冻结比特置 0（位置由 TS 38.212 附录硬编码）</td></tr>'+
      '<tr><td>④ 速率匹配</td><td>864</td><td>圆形缓冲区读出 864bit，不足则循环重读（软重复提升可靠性）</td></tr>'+
      '<tr><td>⑤ PCI 扰码</td><td>864</td><td>与 c_init=PCI 的 Gold 序列 XOR，每小区图案唯一（小区染色）</td></tr>'+
      '</table>'+
      '<p><b>Polar 编码本质</b>：信道极化将 512 个比特位置按可靠性排序，最可靠的 56 个放有效信息，其余置 0。解码器利用冻结位先验知识做 SC 解码，噪声被"引导"集中攻击冻结位，有效位获得保护——这是 Polar Code 逼近香农容量的数学基础。</p>'+
      '<p><b>PCI 扰码防护</b>：用错 PCI 初始化解扰器 → 输出随机比特流 → CRC-24C 必然失败，彻底杜绝 UE 将邻区 PBCH 误读为本小区信息。</p>'+
      '<h3>两把关键钥匙</h3>'+
      '<p><b style="color:var(--warn)">ssb-SubcarrierOffset（4bit）</b>：建立 SSB 与 CRB 网格的频域精对齐（k_SSB），或指示当前小区不携带 SIB1。</p>'+
      '<p><b style="color:var(--accent)">pdcch-ConfigSIB1（8bit）</b>：指示 CORESET#0 时频资源位置与搜索空间参数——UE 找到 SIB1 调度信令的唯一入口。没有它，Stage 5 无从开始，整个接入流程中断。</p>',
      ['[UE-PHY] MIB Polar 解码完成。',
       '[DATA] SFN=42, HRF=0, SCS=30kHz, k_SSB=2, CellBarred=false',
       '[DATA] pdcch-ConfigSIB1=0x10 → cset0=1 / ss0=0，Stage 5 查表',
       '[SUCCESS] MIB 写入 NR_CTX.mib。Stage 1 完成。']
    ),

  ]};

  /* ════════════════════════════════════════════════════════════════════
     STAGE 2 · PSS 检测  (5 sub-steps: 0,1,2,3,4)  ★ 重建
     ════════════════════════════════════════════════════════════════════ */
  var S2 = { subSteps: [

    /* ── S2.0 理论黑板 ───────────────────────────────────────────── */
    discuss(
      'PSS 的使命：盲态下唯一可检测的信号',
      'UE 上电时对时间 / 频率 / 小区"三无"。三步小区搜索的第一步靠 <b>PSS</b> 打开局面——它必须是一个<b>零先验也能被捞出来</b>的信号，这正是 m-序列的用武之地。',
      'PSS 在三步小区搜索中的角色（TS 38.211 §7.4.2.2 / §7.4.3.1）',
      '<h3>① UE 上电时一无所知</h3>'+
      '<p>小区搜索的起点是"三无"：不知道帧 / 符号边界、不知道小区身份、没有任何系统参数。整条初始接入链需要一个 <b>零先验也能被检测</b> 的信号作为入口——这就是 PSS。</p>'+
      '<h3>② 三步小区搜索，逐级解锁</h3>'+
      '<p><b>① PSS</b> → 盲相关确定 OFDM 符号定时与半帧粗定时，解出 <em>N_ID² ∈ {0,1,2}</em>。<br>'+
      '<b>② SSS</b> → 在已锁定的定时上读 symbol 2，解出 N_ID¹ ∈ {0..335}（Stage 3）。<br>'+
      '<b>③ PBCH / DMRS</b> → 解出 SFN、半帧、k_SSB、SSB index，拿到 MIB（Stage 4）。</p>'+
      '<h3>③ 小区身份合成</h3>'+
      '<div class="formula">PCI = 3·N<sub>ID</sub>¹ + N<sub>ID</sub>²&#160;&#160;(N<sub>ID</sub>¹∈{0..335}, N<sub>ID</sub>²∈{0,1,2})&#160;→&#160;1008 个 PCI</div>'+
      '<p>PSS 只贡献最低位的"3 选 1"，但它是<b>先被解出</b>的那一位，决定了后续 SSS 用哪一组序列假设。</p>'+
      '<h3>④ 为什么 PSS 必须是 m-序列</h3>'+
      '<p>盲态下 UE 要同时回答"从哪个样点开始""是哪个 N_ID²"，且信道未知、含噪、有残余频偏。m-序列的两个性质恰好对症：</p>'+
      '<ul><li><b>尖锐周期自相关</b>：非零移位 ≈ −1/127，定时峰锐利可辨；</li>'+
      '<li><b>极低互相关</b>：三个 N_ID² 之间几乎不混淆，身份判别可靠。</li></ul>'+
      '<div class="formula">d<sub>PSS</sub>(n) = 1 − 2·x(m)&#160;,&#160; m = (n + 43·N<sub>ID</sub>²) mod 127</div>'+
      '<h3>⑤ 与 Stage 1 的衔接</h3>'+
      '<p>Stage 1 回答了 PSS <em>坐在哪</em>（symbol 0、中心 127 子载波 k=56~182）；Stage 2 回答它 <em>是什么</em>（m-序列怎么生成）以及 UE <em>怎么把它从噪声里捞出来</em>（盲相关）。</p>',
      ['[PHY] PSS 检测理论探讨模式激活。',
       '[PHY] 候选序列字典：g(x)=x⁷+x⁴+1，三条循环移位偏移 {0, 43, 86}。',
       '[PHY] 三路并行相关器（N_ID²=0/1/2）待命，等待时域样本注入。']
    ),

    /* ── S2.1 m-序列发生器 ────────────────────────────────────────── */
    sim(
      '生成 PSS 的 m-序列 · 循环移位的数学美感',
      '三个 N_ID² <b>不是三条独立序列</b>，而是<b>同一条 m-序列的循环移位</b>（0 / 43 / 86）。右图把 <em>mod 127</em> 取模"转"成珠环旋转，再剪断拉直成发送序列。',
      'm-序列发生器与循环移位（TS 38.211 §7.4.2.2.1）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
      '<b style="color:#b45309;">📺 看懂这段动画（3 步）</b><br>'+
      '<b>① 生成</b>：顶部 7 格小盒是 LFSR（移位寄存器），每跳一拍按 g(x) 规则吐出 1 个比特，'+
      '落进下方圆环——<b>琥珀珠=比特1，空心珠=比特0</b>。127 拍填满整圈，这就是那条"母序列"。<br>'+
      '<b>② 转环</b>：圆环顶端有个<b>固定不动的读取指针（n=0）</b>。换 N_ID² 时，整个环'+
      '咔咔咔转过 <b>43×N_ID²</b> 格（圆心大数字就是转过的格数），<b>指针下露出的那颗珠</b>就成了新序列的起点。'+
      '——这就是公式 m=(n+43·N_ID²) mod 127 的几何含义：<b>同一条环，从不同位置开始读</b>。<br>'+
      '<b>③ 拉直</b>：点"✂ 剪断拉直"，把环从指针处剪开拉成一条直线，得到该 N_ID² 实际要发的 127 长序列。'+
      '</div>'+
      '<h3>① 生成多项式与递推</h3>'+
      '<p>PSS 基于一条长度 127 的 m-序列，由 7 级 LFSR 产生：</p>'+
      '<div class="formula">g(x) = x⁷ + x⁴ + 1&#160;&#160;→&#160;&#160;x(i+7) = ( x(i+4) + x(i) ) mod 2</div>'+
      '<p>初值 [x₀..x₆] = [0 1 1 0 1 1 1]，迭代 120 次得到完整 127 位序列；抽头取自 x⁴ 与 x⁰ 两项。</p>'+
      '<h3>② 循环移位：一条序列，三种身份</h3>'+
      '<div class="formula">d<sub>PSS</sub>(n) = 1 − 2·x(m)&#160;,&#160; m = (n + 43·N<sub>ID</sub>²) mod 127</div>'+
      '<p>N_ID²=0/1/2 对应移位 0 / 43 / 86。把第 43k 颗珠转到读取指针下，正是 mod 127 的几何形态。</p>'+
      '<h3>③ BPSK 映射</h3>'+
      '<p>比特经 1−2x 映射为 ±1（x=0→+1，x=1→−1）。拉直后的 127 长 ±1 序列即发送序列，S2.2 将它映射到中心子载波并 IFFT。</p>'+
      '<h3>④ 埋一个钩子</h3>'+
      '<p>这里的循环移位发生在<em>子载波（频域）索引</em>上；频域循环移位在时域等价于<b>相位旋转</b>——这解释了为什么残余频偏 / NTN 多普勒会让正确的相关峰高度沿 sinc 包络滑落。</p>',
      ['[PHY] LFSR 装载 g(x)=x⁷+x⁴+1，初值 [0 1 1 0 1 1 1]。',
       '[PHY] 127 位 m-序列生成完毕，写入相关器模板 ROM。',
       '[PHY] 循环移位偏移：N_ID²=0/1/2 → {0, 43, 86}。']
    ),

    sim(
      '频域 → 时域：零填充与过采样',
      '把 127 个 ±1 放进一个<b>更大的 FFT 窗口</b>正中、两侧<b>大片补零</b>，再 IFFT。补零<b>不改变波形本身</b>，只是把同一条连续时域曲线<b>采得更密</b>。',
      '资源映射与 OFDM 调制（TS 38.211 §7.4.3.1 / §5.3）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
      '<b style="color:#b45309;">📺 看懂这张图</b><br>'+
      '<b>① 上半（频域）</b>：中央密集的 ±1 竖线 = 127 个 PSS 符号（琥珀 +1 / 蓝 −1）；两侧大片灰带 = <b>零填充</b>，把 127 撑进 256 点的 FFT 窗口。<br>'+
      '<b>② 下半（时域）</b>：橙色连续曲线 = 补零后 IFFT（4× 过采样）；蓝色圆点 = 不补零的 127 点临界采样。<b>蓝点精确落在橙线上</b> —— 这就是关键：补零没有制造新信息，只是让你看清 PSS 本就存在的那条连续波形。</div>'+
      '<h3>① BPSK 映射</h3>'+
      '<p>S2.1 拉直得到的 127 长 ±1 序列，本身就是 BPSK 符号（d=1−2x）。它们将占据 SSB 中 symbol 0 的中心 127 个子载波（k=56~182，对齐 Stage 1 网格）。</p>'+
      '<h3>② 为什么要放进更大的 FFT 窗口</h3>'+
      '<p>OFDM 调制器的 IFFT 点数 N 由系统带宽 / SCS 决定（远大于 127）。PSS 居中放置，其余子载波<b>补零</b>。频域补零在时域等价于<b>理想插值（sinc 内插）</b>：</p>'+
      '<div class="formula">N 点 IFFT，仅中心 127 非零 → 时域得到过采样率 = N/127 的连续波形采样</div>'+
      '<h3>③ 过采样到底带来什么</h3>'+
      '<p>不是"把 PSS 变平滑"（PSS 是满带宽伪随机序列，本就快变）。过采样的真实收益是：<b>DAC 之后输出平滑模拟波形而非阶梯</b>，且<b>频谱不出现混叠镜像</b>。临界采样（127 点）只是恰好满足奈奎斯特，过采样给出更安全的余量。</p>'+
      '<h3>④ 通往 S2.3</h3>'+
      '<p>这条时域波形（任一 N_ID²）就是 UE 端相关器要用的<b>本地模板</b>。下一屏：把它埋进含噪接收信号，用三路滑动相关把它捞出来。</p>',
      ['[PHY] BPSK 映射完成：127 个 ±1 → symbol 0 中心子载波。',
       '[PHY] 零填充：127 → N(FFT) 居中放置，两侧置零。',
       '[PHY] IFFT 输出时域 PSS 模板，写入相关器参考。']
    ),

    sim(
      '时域盲相关检测：海面捞针',
      'UE 上电时<b>不知定时、不知 N_ID²</b>。它用三条本地 PSS 模板对含噪接收信号做<b>滑动互相关</b>：哪条模板在哪个 lag 冒出尖峰，就同时定下了<b>符号定时</b>和 <b>N_ID²</b>。',
      '盲相关定时与 N_ID² 检测（机理对应 TS 38.211 §7.4.2.2）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
      '<b style="color:#b45309;">📺 看懂这段动画</b><br>'+
      '<b>① 上轨</b>：接收信号 r[n]，PSS 被噪声彻底淹没（拖 SNR 滑块看杂乱程度变化）。<br>'+
      '<b>② 下轨</b>：三条相关曲线随红色扫描线<b>从左到右逐点扫出</b>。错误的两路（灰）始终低矮杂乱；<b>正确那一路（橙）在 lag=180 处骤然窜起一根尖针</b>。<br>'+
      '<b>③ 锁定</b>：取最大峰 → 红圈标注，同时定下定时（lag）与 N_ID²，写入小区身份。</div>'+
      '<h3>① 盲态下的两个未知数</h3>'+
      '<p>UE 要同时回答："信号从哪个样点开始？""是哪个 N_ID²？" 滑动相关一次性解决两者：相关峰的<b>位置</b>=定时，相关峰所属的<b>模板</b>=N_ID²。</p>'+
      '<div class="formula">R_k(lag) = Σ r[lag+n]·d_k(n)，&#160; k∈{0,1,2}</div>'+
      '<p style="color:#64748b;font-size:13px;">&#9888; 诚实附注：真实 UE 此刻既无信道估计、又有残余 CFO，实际用 <b>|Σ r·conj(d)|</b>（非相干取幅度）而非实值点积。'+
      'S2.1 §④ 已埋"频偏→相位旋转"的钩子：残余 CFO 会让正确路的相关值沿 sinc 包络衰减，但<b>取幅度后峰仍可辨</b>——这是相干相关增益（≈127）的工程底线。'+
      'Stage 3 将因同样原因走向非相干 / 差分相关。</p>'+
      '<h3>② 为什么"取最大峰"而不是"过阈值"</h3>'+
      '<p>噪声里偶尔会有错误模板凑出一根较高的毛刺（图中灰路也有尖刺），单一阈值可能误判。<b>三路同时比、取全局最大</b>才稳健——这正是 m-序列<b>低互相关</b>的用武之地：正确路对齐时相关≈127，错误路即使对齐也≈−1，差距悬殊。</p>'+
      '<h3>③ SNR 的影响</h3>'+
      '<p>SNR 越低，底噪越汹涌，正确峰相对越不突出。但因相关增益（127 个样点相干累加），即使 SNR≈0dB，峰仍清晰可辨——这是同步信号能在小区边缘被检出的根本原因。</p>'+
      '<h3>④ 顺带解决：频偏估计（粗 + 精）</h3>'+
      '<p>UE 的本地晶振与基站存在残余频偏 Δf，时域上表现为每样点累积一个相位旋转 <em>e<sup>j2π·Δf·n/fs</sup></em>。捞到 PSS 后，可<b>复用同一段信号</b>顺手把 Δf 估出来，无需额外导频。原理：取相隔 Δt 的两段<b>相同</b>本地序列，它们的接收值只差一个相位 φ = 2π·Δf·Δt，于是</p>'+
      '<div class="formula">Δf = φ / (2π·Δt)  （φ = 两段互相关乘积的相位）</div>'+
      '<p><b>粗估计</b>：把<b>已对齐的 PSS 切成前后两半</b>（间隔 Δt = 半个符号 = N<sub>FFT</sub>/2 个样点），相位差给出</p>'+
      '<div class="formula">f<sub>coarse</sub> = (φ/2π)·1/(½N<sub>FFT</sub>/fs) = (φ/π)·f<sub>SC</sub> , 范围 ±0.5·f<sub>SC</sub></div>'+
      '<p><b>精估计</b>：补偿掉 f<sub>coarse</sub> 后，改用<b>相隔更远</b>的 PSS 与 SSS（隔 2 个符号 + 2 段 CP，Δt 更大 → 相位分辨更细）。常规短 CP 时长为符号的 288/2048（= 9/64，TS 38.211 §5.3.1）：</p>'+
      '<div class="formula">f<sub>fine</sub> = (φ/2π)·1/((2+2·288/2048)·N<sub>FFT</sub>/fs) = [1/(4(1+9/64))]·(φ/π)·f<sub>SC</sub> , 范围 ±0.22·f<sub>SC</sub></div>'+
      '<p>Δt 越大估得越准，但太大会让 φ 超出 (−π,π] 产生<b>相位模糊</b>——故先粗后精：粗估缩小范围、精估提高精度。最终 <b>f̂ = f<sub>coarse</sub> + f<sub>fine</sub></b>，回补到接收信号完成频率同步。</p>'+
      '<p style="font-size:12px;color:#64748b;">呼应 S2.1 的钩子：频域循环移位 ≡ 时域相位旋转——频偏正是"时域相位随样点线性累积"，所以才能用相位差反解出 Δf。</p>'+
      '<h3>⑤ 写入小区身份 → 通往 SSS</h3>'+
      '<p>检出 N_ID² 后写入 NR_CTX：<b>PCI = 3·N_ID¹ + N_ID²</b> 已知低位。Stage 3（SSS）将在<b>这里锁定的定时上</b>解出 N_ID¹，补齐 PCI。</p>',
      ['[PHY] 三路相关器启动：本地模板 N_ID²=0/1/2 滑过接收样本。',
       '[PHY] 扫描中… 逐 lag 计算 R_k(lag)。',
       '[DSP] 峰锁定后顺带估频偏：PSS 前后半 → 粗估，PSS/SSS 隔符号 → 精估。']
    ),

  ]};

  /* ════════════════════════════════════════════════════════════════════
     STAGE 3~8 · 骨架（依赖链预定义完毕）
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

  /* ════════════════════════════════════════════════════════════════════
   STAGE 3 · SSS 检测  (4 sub-steps: 0,1,2,3)  ★ 完整
   —— 替换 stage-data.js 中原来的:  var S3 = skelStage('SSS 帧同步 & PCI', ...);
   配色：紫色 #7c3aed（SSS CORR）；答案色 #059669 绿；s1 副色 #0891b2 青
   ════════════════════════════════════════════════════════════════════ */
var S3 = { subSteps: [

  /* ── S3.0 理论黑板 ───────────────────────────────────────── */
  discuss(
    'SSS 的使命：在 PSS 锁定的定时上补齐 PCI 高位',
    'PSS 只给了 <b>N_ID&#178; ∈ {0,1,2}</b>（PCI 的低位 3 选 1）。SSS 要在<b>同一段已锁定的定时</b>上解出 <b>N_ID&#185; ∈ {0..335}</b>，二者合成完整 PCI。它的精妙在于：<em>用两条 m-序列相乘</em>，且移位量<b>复用了 PSS 已解出的 N_ID&#178;</b>。',
    'SSS 序列结构与 N_ID&#185; 检测（TS 38.211 §7.4.2.3）',
    '<h3>① SSS 解什么</h3>'+
    '<p>PSS 给出 N_ID&#178;（3 选 1）与符号定时；SSS 在该定时上读 symbol 2 的中心 127 子载波，解出 <b>N_ID&#185; ∈ {0..335}</b>，再合成：</p>'+
    '<div class="formula">PCI = 3·N<sub>ID</sub>&#185; + N<sub>ID</sub>&#178;&#160;&#160;(336 × 3 = 1008 个 PCI)</div>'+
    '<h3>② 为什么是两条 m-序列<b>相乘</b>（不是 Gold 序列 XOR）</h3>'+
    '<p>SSS 由两条长度 127 的 m-序列<b>逐点相乘</b>构成（BPSK 域的乘法 = 比特域的 XOR，但 SSS 在 ±1 域直接相乘）：</p>'+
    '<div class="formula">d<sub>SSS</sub>(n) = [1−2·x<sub>0</sub>((n+m<sub>0</sub>) mod 127)] · [1−2·x<sub>1</sub>((n+m<sub>1</sub>) mod 127)]</div>'+
    '<p>两条母序列由<b>不同生成多项式</b>产生：</p>'+
    '<div class="formula">x<sub>0</sub>: g<sub>0</sub>(x)=x&#8311;+x&#8308;+1&#160;&#160;(与 PSS 同条)&#160;&#160;·&#160;&#160;x<sub>1</sub>: g<sub>1</sub>(x)=x&#8311;+x+1</div>'+
    '<h3>③ 关键承接：移位量复用 N_ID&#178;</h3>'+
    '<div class="formula">m<sub>0</sub> = 15·⌊N<sub>ID</sub>&#185;/112⌋ + 5·N<sub>ID</sub>&#178;&#160;&#160;·&#160;&#160;m<sub>1</sub> = N<sub>ID</sub>&#185; mod 112</div>'+
    '<p>m<sub>0</sub> 同时吃 <b>N_ID&#185;</b> 和<b>已知的 N_ID&#178;</b>。因为 N_ID&#178; 已由 PSS 锁定，候选不再是 1008 而只剩 <b>336</b>（搜索空间 ÷3）。</p>'+
    '<h3>④ 诚实点：错一个 N_ID&#178; 就全盘皆输</h3>'+
    '<p>若 PSS 给错 N_ID&#178;，m<sub>0</sub> 整体偏移，336 路相关的最高峰会从 <b>127 崩到 ≈15</b>——根本检不出。这就是三步搜索<b>必须按序</b>的硬约束：SSS 站在 PSS 的肩膀上。</p>'+
    '<h3>⑤ 与 Stage 2 的对仗</h3>'+
    '<p>PSS 是<b>一条</b>序列的 3 种循环移位（盲检 3 路）；SSS 是<b>两条</b>序列相乘、移位量受 N_ID&#178; 约束（盲检 336 路）。同样靠 m-序列的<b>尖锐自相关 + 低互相关</b>把正确假设从噪声里捞出来。</p>',
    ['[PHY] SSS 检测理论探讨模式激活。',
     '[PHY] 读取 PSS 结果：N_ID&#178; 已锁定，搜索空间 1008 → 336。',
     '[PHY] 双 m-序列模板就绪：g&#8320;=x&#8311;+x&#8308;+1，g&#8321;=x&#8311;+x+1。']
  ),

  /* ── S3.1 双 m-序列逐点相乘 ──────────────────────────────── */
  sim(
    '双 m-序列逐点相乘 · 一条发不出 PCI，两条才行',
    '拖动 <b>N_ID&#185; 滑块</b>：观察 <em>s&#8320;</em>（紫，受 m&#8320; 移位）与 <em>s&#8321;</em>（青，受 m&#8321; 移位）如何各自滑动，再<b>逐点相乘</b>得到 d_SSS。N_ID&#178; 标为 <em>PSS 锁定·只读</em>。注意 <b>N_ID&#185; 跨过 112 时 m&#8320; 会跳变</b>（⌊·/112⌋ 项）。',
    'SSS 双序列生成与循环移位（TS 38.211 §7.4.2.3.1）',
    '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
    '<b style="color:#6d28d9;">📺 看懂这张图（3 行 1 乘）</b><br>'+
    '<b>① s&#8320;(n)</b>（紫条）：母序列 x&#8320; 经 m&#8320; 循环移位、再 1−2x 映射成 ±1。<br>'+
    '<b>② s&#8321;(n)</b>（青条）：母序列 x&#8321; 经 m&#8321; 循环移位映射成 ±1。<br>'+
    '<b>③ d_SSS(n)</b>（紫条）：把上两行<b>同一列相乘</b>——同号得 +1，异号得 −1。这条 127 长 ±1 序列就是 symbol 2 要发的 SSS。</div>'+
    '<h3>① 两条母序列，不同多项式</h3>'+
    '<p>x&#8320; 由 g&#8320;(x)=x&#8311;+x&#8308;+1（与 PSS 同条）生成，x&#8321; 由 g&#8321;(x)=x&#8311;+x+1 生成，初值均 [0 0 0 0 0 0 1]，各迭代出 127 位。</p>'+
    '<h3>② 移位量分工</h3>'+
    '<div class="formula">m<sub>1</sub> = N<sub>ID</sub>&#185; mod 112&#160;&#160;(0~111，决定 s&#8321; 起点)</div>'+
    '<div class="formula">m<sub>0</sub> = 15·⌊N<sub>ID</sub>&#185;/112⌋ + 5·N<sub>ID</sub>&#178;&#160;&#160;(只 3 档粗调，受 N_ID&#178; 锚定)</div>'+
    '<p>m&#8321; 提供 112 种"细分身份"，m&#8320; 提供 3 种"粗分组"，112 × 3 = 336，恰好覆盖全部 N_ID&#185;。</p>'+
    '<h3>③ 为什么相乘能区分 336 种</h3>'+
    '<p>两条 m-序列各自低互相关，乘积序列之间仍保持<b>极低互相关</b>：任意两个不同 (m&#8320;,m&#8321;) 的乘积序列对齐相关 ≈ −1/127，而自身对齐 = 127。这就是 336 路盲检能干净判决的根本（下一屏验证）。</p>'+
    '<h3>④ m&#8320; 的跳变</h3>'+
    '<p>⌊N_ID&#185;/112⌋ 在 N_ID&#185; = 112、224 处各加 1，使 m&#8320; 阶跃 +15。这是 SSS 把 336 个 N_ID&#185; 切成 3 个 112 块的几何痕迹。</p>',
    ['[PHY] LFSR 装载：x&#8320; (g&#8320;=x&#8311;+x&#8308;+1)、x&#8321; (g&#8321;=x&#8311;+x+1)，初值 [0 0 0 0 0 0 1]。',
     '[PHY] 计算移位：m&#8321; = N_ID&#185; mod 112，m&#8320; = 15·⌊N_ID&#185;/112⌋ + 5·N_ID&#178;。',
     '[PHY] 逐点相乘 s&#8320;×s&#8321; → 127 长 d_SSS 模板写入相关器 ROM。']
  ),

  /* ── S3.2 在锁定定时上提取接收 SSS ───────────────────────── */
  sim(
    '在 PSS 锁定的定时上开窗 · 取 symbol 2 中心 127 RE',
    'SSS 坐在 SSB 的 <b>symbol 2、中心 127 子载波（k=56~182）</b>。UE 在 PSS 给的符号定时上对该符号开窗 → FFT → 抽出中心 127 个 RE，得到<b>含噪、且带未知相位旋转</b>的接收 SSS。<em>此刻 UE 还没有信道估计</em>。',
    '接收 SSS 提取与非相干检测的由来（TS 38.211 §7.4.3.1）',
    '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
    '<b style="color:#6d28d9;">📺 看懂这张图</b><br>'+
    '<b>① 上方网格</b>：SSB 时频块。PSS（绿，symbol 0）已锁——它给出符号定时；SSS（紫，symbol 2 中央 127 RE）是本屏要取的目标。<br>'+
    '<b>② 开窗 → FFT</b>：在锁定定时上截取 symbol 2 → FFT → 取中心 127 个子载波。<br>'+
    '<b>③ 下方对比</b>：理想 d_SSS（清晰 ±1）vs 接收 SSS（被信道<b>整体旋转一个未知相位 φ</b> + 噪声）。</div>'+
    '<h3>① 鸡生蛋：为什么没有信道估计</h3>'+
    '<p>PBCH 的信道估计要靠 DMRS，而 DMRS 的频域位置 <em>v = PCI mod 4</em> 取决于 PCI——可 PCI 此刻还没合成（正等着 SSS 解出 N_ID&#185;）。所以在 PSS/SSS 阶段，UE <b>拿不到信道 H(f)</b>，接收序列被未知相位 φ 整体旋转。</p>'+
    '<h3>② 因此用<b>非相干</b>检测</h3>'+
    '<p>相干相关 Re{Σ r·d} 会乘上 cos φ——φ 接近 90° 时峰几乎消失，不可靠。改用<b>幅度</b>（非相干）：</p>'+
    '<div class="formula">R<sub>k</sub> = |Σ r[n]·d<sub>k</sub>*(n)|&#160;&#160;→&#160;&#160;|e<sup>jφ</sup>·127| = 127，与 φ 无关</div>'+
    '<p>幅度对全局相位旋转免疫，所以无论信道把星座转到哪，正确假设的峰仍稳稳到 127。这正是 Stage 2（PSS）同样用幅度检测的原因——一条诚实主线。</p>'+
    '<h3>③ 通往 S3.3</h3>'+
    '<p>把这条含噪接收 SSS 与 336 条本地模板逐一做非相干相关，谁的幅度冲到 127，谁就是 N_ID&#185;。</p>',
    ['[RF] 在 PSS 锁定的符号定时上对 symbol 2 开窗。',
     '[DSP] FFT → 抽取中心 127 子载波 (k=56~182)，得到接收 SSS。',
     '[PHY] 注意：无 DMRS 信道估计 → 接收序列带未知相位 φ → 采用非相干幅度检测。']
  ),

  /* ── S3.3 336 路盲匹配 → 解出 N_ID¹ → 合成 PCI ──────────── */
  sim(
    '336 路盲匹配：谁冲到 127，谁就是 N_ID&#185;',
    '用 336 条本地 SSS 模板（N_ID&#185;=0..335，移位量由<b>已知 N_ID&#178;</b>锚定）对接收 SSS 做非相干相关。<b>正确那一路骤然冲到 127</b>，其余全趴在 ≈15。切换<b>「错 N_ID&#178; 对照」</b>开关，看错误假设下 336 路如何<b>集体趴平、毫无峰值</b>。',
    '336 路盲检与 PCI 合成（机理对应 TS 38.211 §7.4.2.3）',
    '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
    '<b style="color:#6d28d9;">📺 看懂这段动画</b><br>'+
    '<b>① 扫描</b>：336 根相关条随扫描线<b>从左到右逐个揭示</b>（横轴 = N_ID&#185; 假设，纵轴 = 非相干相关幅度）。<br>'+
    '<b>② 锁定</b>：唯一冲到绿色 127 线的那根 → 红圈标注 = N_ID&#185;。<br>'+
    '<b>③ 合成</b>：PCI = 3·N_ID&#185; + N_ID&#178;，写入小区身份，顶栏 PCI 点亮。</div>'+
    '<h3>① 为什么峰这么干净</h3>'+
    '<p>正确假设对齐时乘积序列完全匹配 → 相关 = 127；任意错误 N_ID&#185; 的乘积序列与之低互相关 → 相关 ≈ −1/127·127 量级（实测次高仅 ≈15）。127 : 15 的悬殊裕量，让判决在含噪、含相位旋转下依然稳健。</p>'+
    '<h3>② 「错 N_ID&#178;」对照的意义</h3>'+
    '<p>m&#8320; 含 5·N_ID&#178; 项。用错 N_ID&#178; → 所有 336 条模板的 m&#8320; 整体错位 → 没有任何一条能对齐接收序列 → 336 路全趴在 ≈15，<b>检不出 N_ID&#185;</b>。这从反面证明：<b>SSS 必须复用 PSS 正确解出的 N_ID&#178;</b>，三步搜索不可乱序。</p>'+
    '<h3>③ 合成 PCI，补齐小区身份</h3>'+
    '<div class="formula">PCI = 3·N<sub>ID</sub>&#185; + N<sub>ID</sub>&#178; = 3·112 + 1 = 337</div>'+
    '<p>至此 1008 选 1 的物理小区标识确定。写入 NR_CTX.pci / nid1。下一步 Stage 4：用 v = PCI mod 4 定位 PBCH DMRS、做信道估计、Polar 译码解出 MIB。</p>'+
    '<h3>④ 顺带解出半帧定时</h3>'+
    '<p>SSS 的存在还隐含半帧（5ms）粗定时信息——结合 PBCH DMRS 的 SSB index，UE 最终锁定完整帧定时（Stage 4 展开）。</p>',
    ['[PHY] 336 路非相干相关器启动：本地模板 N_ID&#185;=0..335 滑过接收 SSS。',
     '[PHY] 扫描中… 移位量 m&#8320; 由已锁定的 N_ID&#178; 锚定。']
  ),

]};
  /* ════════════════════════════════════════════════════════════════════
     STAGE 4 · PBCH 译码 & MIB 解析  (5 sub-steps: 0,1,2,3,4)
     主色：蓝 #2563eb / 答案：绿 #059669 / DMRS 点睛：琥珀 #f59e0b
          / 扰码层：紫 #7c3aed / 对照：灰 #94a3b8 / 锁定高光：红 #dc2626
     子步：0 理论 / 1 信道估计+插值 / 2 两层解扰(夹心+自举) / 3 Polar SCL / 4 MIB
     ════════════════════════════════════════════════════════════════════ */
  var S4 = { subSteps: [

    /* ── S4.0 理论黑板 ───────────────────────────────────────────── */
    discuss(
      'PBCH 的使命：把「时间地图」广播给全网',
      'PSS / SSS 让 UE 拿到了 <b>PCI 与符号定时</b>，但 UE 仍不知道「现在是第几帧、SSB 在前半帧还是后半帧、频偏 k_SSB 多少、去哪找 SIB1」。<b>PBCH</b> 携带 <b>MIB</b> 把这张「时间 + 配置地图」广播出来——而它的解码<b>恰好用上刚解出的 PCI</b>，接上了 Stage 3 留下的「鸡生蛋」。',
      'PBCH / MIB 在初始接入中的角色（TS 38.212 §7.1 · TS 38.331 §6.2.2）',
      '<h3>① 承上：PCI 是开门的钥匙</h3>'+
      '<p>Stage 3 末尾留了个死结：DMRS 信道估计需要先知道 PCI（DMRS 频域位置 <em>v = PCI mod 4</em>、序列种子也含 PCI），而 PCI 正等 SSS 解出。现在 <b>PCI=337 已锁</b>，钥匙到手——UE 第一次能做<b>相干解调</b>，PBCH 的接收质量从此跨过门槛。</p>'+
      '<h3>② PBCH 到底装了什么</h3>'+
      '<p>PBCH 承载的物理层载荷是 <b>32 bit</b>：</p>'+
      '<table><tr><th>来源</th><th>比特</th><th>内容</th></tr>'+
      '<tr><td>高层 BCH/MIB</td><td>24</td><td>1 bit 消息类型 + 23 bit MIB（SFN 高 6 位、SCS、k_SSB 低 4 位、pdcch-ConfigSIB1、cellBarred…）</td></tr>'+
      '<tr><td>L1 追加时间位</td><td>8</td><td>SFN 低 4 位 + 半帧位 + k_SSB 第 5 位 + 保留</td></tr></table>'+
      '<p>其中 <b>SFN 被故意拆成两半</b>（高 6 位进 MIB、低 4 位进时间位）——这正是本阶段的点睛「SFN 拼接」。</p>'+
      '<h3>③ 接收侧解码链（本阶段主线，5 步）</h3>'+
      '<div class="formula" style="text-align:left;line-height:1.8;">'+
      '432 RE → <b>① 相干解调</b>（信道估计+插值，QPSK 软判 LLR，S4.1）<br>'+
      '→ <b>② 第二层解扰</b>（SSB index 定段，S4.2）<br>'+
      '→ 速率解匹配 <b>864 → 512</b> → <b>③ Polar SCL 译码</b>（L=8 + CRC24，S4.3）<br>'+
      '→ <b>第一层解扰</b>（读出未扰的 SFN 2/3 位自举，S4.2）<br>'+
      '→ <b>④ 解析 MIB + 拼接 SFN</b>（S4.4）→ 写入 NR_CTX</div>'+
      '<p style="font-size:12px;color:#64748b;">注：PBCH 是<b>两层扰码的「夹心」结构</b>——第一层在 Polar 编码<b>之前</b>、第二层在<b>之后</b>。S4.2 专门拆解这个设计，也是它解开「SFN 2/3 位没占编码比特，UE 怎么知道」这一谜题的地方。</p>'+
      '<h3>④ 为什么用 Polar 码</h3>'+
      '<p>MIB 是<b>全网每个 UE 在小区边缘、零先验、最恶劣信噪比下都必须读对</b>的「第一封信」，且载荷极短（K=56）。短码场景下 Polar 码逼近有限码长容量界，且 SCL + CRC 译码可在低 SNR 下给出极低误块率——这是 3GPP 为控制信道选 Polar 的根本原因。</p>'+
      '<h3>⑤ 启下：交给 Stage 5</h3>'+
      '<p>MIB 里的 <b>pdcch-ConfigSIB1</b>（8 bit）是一张查表索引，Stage 5 用它反推 <b>CORESET#0</b> 的时频位置，去盲检 PDCCH / DCI 1_0，进而调度 SIB1。读完 SIB1（Stage 6）才算严格意义的「驻网」。</p>',
      ['[PHY] PBCH 译码模式激活。前序：PCI=337 已锁，符号定时已对齐。',
       '[PHY] Polar 译码器初始化：K=56, N=512, E=864, 列表深度 L=8。',
       '[PHY] CRC24C 生成多项式装载，DMRS 信道估计器待命。']
    ),

    /* ── S4.1 DMRS 信道估计 + 频域插值 → 相干解调 ─────────────────── */
    sim(
      'DMRS 信道估计 + 插值 · 解开 Stage 3 的「鸡生蛋」',
      '有了 PCI，UE 能<b>重建 PBCH DMRS</b> 这把「已知尺子」。DMRS 以 <b>1/4 梳状</b>插在数据 RE 之间（频域偏移 <em>v = PCI mod 4 = 1</em>）。LS 只能估出 144 个导频点的 <b>Ĥ</b>，再靠<b>频域插值</b>推算中间 432 个数据 RE 的信道，才能对全部数据均衡——星座图从「甜甜圈」坍缩成干净的 4 个 QPSK 簇。',
      'PBCH DMRS · 信道估计与插值（TS 38.211 §7.4.1.4 / §7.3.3）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
      '<b style="color:#1e40af;">📺 看懂这段动画</b><br>'+
      '<b>① 左上网格</b>：SSB 4 个符号，PBCH 占 symbol 1/2/3（蓝），DMRS（<b style="color:#b45309;">琥珀</b>）每 4 个 RE 插 1 个，右移 v=1 格。<br>'+
      '<b>② 插值动画</b>：先点亮 144 个琥珀导频，再向每个导频<b>相邻 3 个蓝色数据 RE</b> 线性外推出信道（渐变填充）——这一步回答「只发 1/4 导频，怎么解全部数据」。<br>'+
      '<b>③ 右侧星座</b>：接收甜甜圈 → 点「应用」后 Ĥ 把整圈旋正缩放 → 4 个 QPSK 簇。</div>'+
      '<h3>① DMRS：自带的「已知尺子」（一身二用）</h3>'+
      '<p>PBCH DMRS 是一段<b>收发双方都算得出</b>的 QPSK 序列，由 Gold 序列生成，初值含 <b>PCI、半帧位、SSB index 低位</b>。它有两个用途：<br>'+
      '&#160;&#160;• <b>盲检</b>：用 8 种本地 DMRS 相关，峰值最大者给出 ĩ<sub>SSB</sub>∈{0..7}（即 SSB index 的 2/3 位 LSB，结构同 Stage 3 的 SSS 盲检）。<br>'+
      '&#160;&#160;• <b>信道估计</b>：与接收值相除即得导频点信道。</p>'+
      '<div class="formula">Ĥ(4i+v) = Y<sub>DMRS</sub>(i) / X<sub>DMRS</sub>(i)  （LS 估计，仅 144 个导频点）</div>'+
      '<h3>② 关键补全：频域插值（为何 1/4 导频够用）</h3>'+
      '<p>LS 只给出 <b>144 个导频 RE</b> 的 Ĥ，但要解调的是另外 <b>432 个数据 RE</b>，它们身上<b>没有导频</b>。基带分两步补全：</p>'+
      '<p>&#160;&#160;<b>(a) 平滑</b>：对导频 Ĥ 做窗长 3 的滑动平均，压噪。<br>'+
      '&#160;&#160;<b>(b) 线性插值</b>：相邻两导频之间（间隔 ΔN=4）的数据 RE，按距离加权：</p>'+
      '<div class="formula">Ĥ(K·ΔN+v+m) = (1&#8722;m/ΔN)·Ĥ<sub>左</sub> + (m/ΔN)·Ĥ<sub>右</sub>， m=1,2,3</div>'+
      '<p style="font-size:12px;color:#64748b;">即 0.75/0.25、0.5/0.5、0.25/0.75 三档权重。实现也可用维纳滤波，但线性插值在 SSB 平坦衰落下已足够。这一步把信道知识从「梳齿」铺满「整排」，全部 432 数据 RE 才能相干均衡。</p>'+
      '<h3>③ 为什么 Stage 3 做不到、现在能</h3>'+
      '<p>SSS 检测时 PCI 未知 → 无法重建 DMRS → 无信道估计 → 只能<b>非相干</b>测幅度（甜甜圈量半径）。现在 PCI 已知 → 重建 DMRS → 估 Ĥ + 插值 → <b>相干</b>均衡 → 星座坍缩成离散点，QPSK 可做<b>软判 LLR</b>，喂给后续解扰/译码。</p>'+
      '<h3>④ RE 账本</h3>'+
      '<p>PBCH+DMRS 跨 3 个符号共 <b>576 RE</b>（240+48+48+240）；DMRS 占 1/4 = <b>144 RE</b>，数据 <b>432 RE</b>。432 RE × 2 bit(QPSK) = <b>864</b> 软比特，正好是速率匹配输出长度 E。</p>',
      ['[PHY] 重建 PBCH DMRS：c_init = f(PCI=337, 半帧, SSB index)。',
       '[DSP] DMRS 梳状位置 v = 337 mod 4 = 1，提取 144 个导频 RE。',
       '[DSP] LS 估出 144 导频 Ĥ → 平滑(窗3) → 频域线性插值至 432 数据 RE。',
       '[PHY] 相干均衡完成，QPSK 软解调输出 864 个 LLR，星座坍缩为 4 簇。']
    ),

    /* ── S4.2 两层解扰（夹心结构 + 自举）─── 新增 ─────────────────── */
    sim(
      'PBCH 两层扰码 · 「夹心」结构与自举解扰',
      'PBCH 用<b>两层扰码</b>把比特打乱（都以 PCI 为种子，做小区间干扰白化）。妙在它是<b>夹住 Polar 编码的「三明治」</b>：第一层在编码<b>前</b>（扰 32-bit 载荷，按 SFN 2/3 位选段），第二层在编码<b>后</b>（扰 864 编码比特，按 SSB index 选段）。RX 侧反着来——先用 DMRS 盲检的 ĩ<sub>SSB</sub> 解第二层，译码后<b>读出故意没被扰的 SFN 2/3 位</b>，再用它解第一层。这是一招漂亮的<b>自举</b>。',
      'PBCH 加扰设计与接收端自举解扰（TS 38.212 §7.1.2 / §7.3.3 · §7.1.5）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
      '<b style="color:#6d28d9;">📺 看懂这段动画</b><br>'+
      '<b>① 竖向夹心流</b>：从上到下是 RX 的处理顺序——均衡软比特 → <b style="color:#7c3aed;">第二层解扰</b>（紫，钥匙=ĩ<sub>SSB</sub>）→ [Polar 译码盒，折叠] → <b style="color:#7c3aed;">第一层解扰</b>（紫，钥匙=SFN 2/3 位）→ 干净载荷。<br>'+
      '<b>② 高亮「未扰孤岛」</b>：32-bit 载荷里有 3 个比特（SFN 第 2、3 位 + 半帧）<b>第一层故意不扰</b>。动画会闪出它们如何被「先读出、再当钥匙」反哺第一层解扰。</div>'+
      '<h3>① 为什么要两层、且夹住编码</h3>'+
      '<p>扰码的本职是<b>干扰随机化</b>：相邻小区用不同 PCI 种子，PBCH 比特序列彼此不相关，互相像噪声而非结构性干扰。NR 把它拆成两层、分置编码前后，是为了让<b>不同时间位/波束</b>各自携带独立的「指纹」：</p>'+
      '<table><tr><th>层</th><th>位置</th><th>对象</th><th>分段钥匙</th></tr>'+
      '<tr><td>第一层</td><td>Polar 编码<b>前</b></td><td>32-bit 载荷（实扰 M 位）</td><td>SFN 的<b>第 2、3 位 LSB</b></td></tr>'+
      '<tr><td>第二层</td><td>Polar 编码<b>后</b></td><td>864 编码比特</td><td><b>SSB index</b> 的 2/3 位 LSB</td></tr></table>'+
      '<p>种子均由 <b>PCI</b> 初始化。"分段钥匙"的意思：先生成一条长序列，再按钥匙的取值切出对应的一段来用。</p>'+
      '<h3>② 第一层：留 3 个比特「不扰」是神来之笔</h3>'+
      '<p>第一层扰码序列长 4M，按 SFN 的<b>第 2、3 位 LSB</b>（共 4 种组合）分 4 段选用。M 是<b>实际参与加扰的比特数</b>：</p>'+
      '<div class="formula">FR1（≤6GHz）：M = 32 &#8722; 3 = <b>29</b>  |  FR2（&gt;6GHz）：M = 32 &#8722; 6 = <b>26</b></div>'+
      '<p>FR1 故意<b>不扰 3 个比特</b>：SFN 第 2、3 位 LSB + 半帧指示。原因正在「分段钥匙」——要选对第一层的段，得先知道 SFN 的 2/3 位；可这 2/3 位本身又藏在第一层扰码里。<b>把它们排除在加扰之外</b>，UE 才能在没解第一层时就先读到它们，化解死循环。本例 SFN=614，2/3 位 = <b>11</b> → 选用第一层第 <b>3</b> 段。</p>'+
      '<h3>③ 第二层：钥匙是 SSB index 的 LSB</h3>'+
      '<p>第二层扰 864 编码比特，按 <b>SSB index 的 2 位（L<sub>max</sub>=4）或 3 位（L<sub>max</sub>=8/64）LSB</b> 选段。而这几位 LSB <b>恰好就是 S4.1 里 DMRS 盲检出的 ĩ<sub>SSB</sub></b>——所以 RX 一进门就能解第二层，不依赖译码。本例 ĩ<sub>SSB</sub>=2 → 选用第二层第 <b>2</b> 段（共 8 段）。</p>'+
      '<h3>④ 自举：解扰顺序与编码顺序相反</h3>'+
      '<div class="formula" style="text-align:left;line-height:1.8;">'+
      '钥匙先到手：ĩ<sub>SSB</sub>（DMRS 盲检）<br>'+
      '→ <b>第二层解扰</b>（不需译码）<br>'+
      '→ 速率解匹配 + <b>Polar 译码</b> 出 32-bit 载荷<br>'+
      '→ 此时<b>未扰的 SFN 2/3 位</b>已是明文，直接读<br>'+
      '→ 拿它当钥匙做<b>第一层解扰</b> → 得到完整 MIB</div>'+
      '<p style="font-size:12px;color:#64748b;">一句话：那 3 个未扰比特既是<b>明文岛</b>（被直接读出），又是<b>第一层选段的钥匙</b>，一物二用，闭合自举。这就是图 3.3 整张流程图的精髓。</p>',
      ['[PHY] RX 解扰开始（顺序与 TX 编码相反）。',
       '[PHY] 第二层解扰：钥匙 = DMRS 盲检 ĩ_SSB = 2 → 选第 2 段（共8段）。',
       '[PHY] 速率解匹配 + Polar 译码 → 32-bit 载荷（仍带第一层扰码）。',
       '[DATA] 读出未扰明文：SFN 第2/3位 LSB = 11，半帧位 = 0。',
       '[PHY] 第一层解扰：钥匙 = SFN 2/3位 = 11 → 选第 3 段 → 还原完整 MIB。']
    ),

    /* ── S4.3 Polar SCL 译码（原 S4.2，+ Path Metric）──────────────── */
    sim(
      'Polar 译码（RX 侧）· 冻结位 + SCL 路径度量 + CRC 选路',
      'Polar 码把 512 条子信道<b>两极分化</b>：可靠的放信息位（蓝），不可靠的放<b>冻结位（灰，恒 0，收发都知道）</b>。RX 侧 <b>SCL 译码</b>边译边分叉，按<b>路径度量（Path Metric）</b>把候选裁到 <b>L=8</b> 条——度量最差的当场<b>劣汰</b>。最后靠 <b>CRC24</b> 在 8 条幸存路里一锤定音。',
      'Polar SCL 译码 · 路径度量与 CRC 辅助选择（TS 38.212 §5.3.1 / §7.1.4）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
      '<b style="color:#1e40af;">📺 看懂这段动画</b><br>'+
      '<b>① 上半 512 格</b>：按<b>可靠度</b>给子信道染色——<b style="color:#94a3b8;">灰=冻结位(456)</b> 集中在低可靠端，'+
      '<b style="color:#1d4ed8;">蓝=信息位(56)</b> 占据高可靠端。这就是「极化」。<br>'+
      '<b>② 下半路径树</b>：SCL 边译边分叉，候选超过 L=8 时，<b style="color:#dc2626;">度量最差的路径被剪枝</b>（灰，旁边闪 "PM 劣汰"），'+
      '最后只有<b>能通过 CRC24 的那条</b>亮绿存活。</div>'+
      '<h3>① 极化：好信道更好，坏信道更坏</h3>'+
      '<p>对 N=512 条合成子信道排序后，可靠度向两端聚集。把 <b>K=56</b> 个最可靠位置放<b>信息位</b>，其余 <b>456</b> 个放<b>冻结位（值恒为 0）</b>。收发双方共享同一张「冻结图」，译码时冻结位直接当 0 用，等于免费的先验。</p>'+
      '<p style="font-size:12px;color:#64748b;">本图可靠度按 <b>β-展开</b>（β=2<sup>1/4</sup>，NR 预生成序列的设计依据，TS 38.212 表 5.3.1.2-1）计算并下采样显示。</p>'+
      '<h3>② SCL + 路径度量：不赌单条路，留一把候选</h3>'+
      '<p>朴素 SC 译码逐位硬选，一步错步步错。<b>SCL（Successive Cancellation List）</b>在每个信息位<b>同时保留 0/1 两种假设</b>，路径数翻倍。每条路径维护一个<b>累积路径度量（Path Metric，可理解为「到目前为止的错误似然」）</b>：</p>'+
      '<div class="formula">PM 越小 → 这条路越可信；当候选 &gt; L=8 → 立刻剪掉 PM 最大（最差）的，只留 8 条最优</div>'+
      '<p>低 SNR 下，正确路径常常不是某一步的局部最优，但<b>通常活在这 8 条里</b>——这正是列表译码相对朴素 SC 的增益来源。</p>'+
      '<h3>③ CRC：列表译码的「裁判」</h3>'+
      '<p>NR 把 CRC24 同时用作<b>纠错辅助</b>：8 条幸存路径里，<b>谁的 CRC 校验通过，谁就是答案</b>。这把 CRC 从单纯的「检错」升级成「选路」，是 CA-SCL 性能远超朴素 SC 的关键。</p>'+
      '<div class="formula">56 bit 候选 → CRC24 校验 → 唯一通过路 → 32 bit 载荷 + 24 bit CRC</div>'+
      '<h3>④ 速率解匹配先行</h3>'+
      '<p>进译码器前先把 <b>864</b> 软比特<b>解匹配</b>回母码长 <b>512</b>：E&gt;N 发端用了<b>重复</b>，收端把重复位置的 LLR <b>合并相加</b>（相干增益），再送 Polar 译码。</p>',
      ['[DSP] 速率解匹配：864 LLR 合并重复位 → 512 母码 LLR。',
       '[PHY] 装载冻结图：456 冻结位(=0) / 56 信息位（按可靠度）。',
       '[PHY] SCL 译码启动，列表深度 L=8；按路径度量逐位剪枝劣汰…',
       '[PHY] 8 条幸存路径 → CRC24 辅助选路 → 唯一通过路即正确解。']
    ),

    /* ── S4.4 MIB 解析 + SFN 拼接（原 S4.3，+ FR1/FR2 彩蛋）────────── */
    sim(
      'MIB 解析 + SFN 拼接 · 时间地图落地',
      'CRC 通过，拿到 <b>32 bit</b>。拆成 <b>24 bit BCH/MIB</b> + <b>8 bit 时间位</b>，逐字段解析。点睛动作：<b>SFN 的高 6 位（藏在 MIB）</b>与<b>低 4 位（藏在时间位）</b>飞拢，拼成完整 10 bit 帧号——和 Stage 3 拼 PCI 同一种「高低位拼接」手法。底部还埋了一个 <b>FR1/FR2 比特复用</b>的协议彩蛋。',
      'MIB 字段解析与 SFN/半帧拼接（TS 38.331 §6.2.2 · TS 38.212 §7.1.1）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.06em;">'+
      '<b style="color:#1e40af;">📺 看懂这段动画</b><br>'+
      '<b>① 上方比特带</b>：32 bit 按字段分段染色（蓝=MIB 字段、<b style="color:#b45309;">琥珀</b>=8 个时间位）。<br>'+
      '<b>② 中部拼接</b>：systemFrameNumber 的 6 位 与 时间位的 4 位 飞向中央寄存器，咔哒锁成 <b>10 bit SFN = 614</b>。<br>'+
      '<b>③ 右侧解析卡 + 底部彩蛋</b>：各字段译成人类可读值（绿=已写入 NR_CTX）；底部「协议彩蛋」点破 FR1/FR2 的比特复用魔术。</div>'+
      '<h3>① 为什么 SFN 要拆两半</h3>'+
      '<p>SFN 共 <b>10 bit</b>（0~1023）。MIB 每 80ms 才更新一次内容，但帧号每 10ms 就变——若整 10 位都放 MIB，UE 就得每帧重读 MIB。NR 的巧思：<b>高 6 位放 MIB</b>（80ms 内不变），<b>低 4 位另走 PBCH 时间位 + 加扰</b>（随帧变化）。UE 一次读 MIB 拿高位，靠加扰/时间位补低位，省去频繁重读。</p>'+
      '<div class="formula">SFN = (MIB.systemFrameNumber &lt;&lt; 4) | 时间位低4位<br>= (38 &lt;&lt; 4) | 6 = 608 + 6 = <b>614</b></div>'+
      '<h3>② 半帧位 + SSB index = 帧内定位</h3>'+
      '<p>半帧位（时间位之一）指明 SSB 在 10ms 帧的<b>前/后半帧</b>；SSB index 指明是<b>第几个波束</b>。FR1 此场景 L<sub>max</sub>=8，SSB index 的 3 位全由 <b>DMRS 序列</b>隐式携带（8 选 1），无需占载荷。三者合起来，UE 完成<b>到帧/到符号</b>的绝对定时。</p>'+
      '<h3>③ MIB 关键字段一览</h3>'+
      '<table><tr><th>字段</th><th>本例值</th><th>作用</th></tr>'+
      '<tr><td>subCarrierSpacingCommon</td><td>30 kHz</td><td>SIB1 / Msg2/4 的公共 SCS</td></tr>'+
      '<tr><td>ssb-SubcarrierOffset (k_SSB)</td><td>6</td><td>SSB 与公共 RB 栅格的频偏</td></tr>'+
      '<tr><td>dmrs-TypeA-Position</td><td>pos2</td><td>PDSCH/PDCCH DMRS 起始符号</td></tr>'+
      '<tr><td>pdcch-ConfigSIB1</td><td>0x10</td><td>→ Stage 5 查表得 CORESET#0</td></tr>'+
      '<tr><td>cellBarred</td><td>notBarred</td><td>是否禁止接入（驻留前置门）</td></tr></table>'+
      '<h3>④ 协议彩蛋：FR1 / FR2 的「比特复用魔术」</h3>'+
      '<p>那 8 个时间位里有个位置（k_SSB 第 5 位 + 2 个保留位）被 3GPP 玩出了花：</p>'+
      '<p>&#160;&#160;• <b>FR1（L<sub>max</sub>=4 或 8）</b>：波束最多 8 个，DMRS 的 3 个比特就能标识 SSB index。但 k_SSB 取值范围需要 <b>5 个比特</b>，MIB 只装得下低 4 位，于是 PHY 把 <b>k_SSB 第 5 位</b>塞进这个时间位。<br>'+
      '&#160;&#160;• <b>FR2（L<sub>max</sub>=64，仅毫米波）</b>：波束多达 64 个，DMRS 的 3 位根本不够标识，还差 3 位。而 FR2 的 k_SSB 只需 MIB 那 4 位即可（无需第 5 位）。于是<b>那个 k_SSB[4] 的位置连同 2 个保留位，被改征用来承载 SSB index 的高 3 位</b>！</p>'+
      '<p style="font-size:12px;color:#64748b;">同样 8 个比特，FR1 用来补 k_SSB，FR2 改去补 SSB index——3GPP 把每个比特的价值榨到了极致。本仿真是 FR1/L<sub>max</sub>=8 场景，故承载的是 k_SSB[4]。</p>'+
      '<h3>⑤ 写入 NR_CTX → 通往 Stage 5</h3>'+
      '<p>本阶段把 <b>k_SSB</b>（点亮顶栏）、<b>SFN=614</b>、<b>半帧</b>、<b>MIB 字节</b>写入全局总线。cellBarred=notBarred → <em>允许继续</em>（严格驻留判决在 Stage 6 读 SIB1 后）。pdcch-ConfigSIB1 交给 Stage 5 反推 CORESET#0。</p>',
      ['[PHY] ✓ CRC24 校验通过，BCH 译码成功。',
       '[DATA] 拆分 32 bit：24 bit MIB + 8 bit 时间位。',
       '[DATA] SFN 拼接：高6位(38) ⊕ 低4位(6) → SFN = 614。',
       '[DATA] 解析 MIB：SCS=30kHz, k_SSB=6, cellBarred=notBarred。',
       '[SUCCESS] MIB 解码完成，时间/频率/配置写入 NR_CTX。']
    ),

  ]};
  /* ════════════════════════════════════════════════════════════════════
     STAGE 5 · CORESET#0 盲检  (5 sub-steps: 0,1,2,3,4)  ★ 完整
     配色：靛蓝 #4f46e5(主) / 深靛 #3730a3 / 浅靛 #eef2ff
          / 答案绿 #059669 / 对照灰 #94a3b8 / 高光红 #dc2626 / 琥珀 #d97706(钥匙)
     上游 NR_CTX：pci=337, kssb=6, mib.pdcchConfigSib1=0x10(16), scsCommon=30
     核心数值（已 Python 验证）：
       0x10 → controlResourceSetZero=1, searchSpaceZero=0
       Table 13-4[1]：复用图样1, 24 RB × 2 symbol, offset=1 RB → 8.64MHz
       REG=48 → 8 CCE；AL4(2位置)/AL8(1位置) 可放，AL16(需16CCE)放不下
       Table 13-11[0]：O=0,M=1,起始符号0 → slot0/偶帧
       盲检：SI-RNTI=0xFFFF；命中 AL8；DCI format 1_0 载荷 37bit(22语义+15预留)
     ════════════════════════════════════════════════════════════════════ */
  var S5 = { subSteps: [

    /* ── S5.0 理论黑板 ───────────────────────────────────────── */
    discuss(
      'CORESET#0：MIB 只给一把 8-bit 钥匙，UE 自举出 SIB1 的入口',
      'Stage 4 解出的 MIB 里有个不起眼的 8-bit 字段 <b>pdcch-ConfigSIB1 = 0x10</b>。整个 SIB1 的获取——去<b>哪个时频窗口</b>监听、用<b>哪张搜索空间表</b>——全靠它反推。它的精妙在于：<em>CORESET#0 直接相对 SSB 锚定</em>，UE 此刻<b>还没有 Point A、还不知道 SIB1 在哪</b>，却能凭这把钥匙先把"听 PDCCH 的窗口"摆出来。',
      'CORESET#0 与 Type0-PDCCH 搜索空间（TS 38.213 §13 / TS 38.331 §6.2.2）',
      '<h3>① 为什么需要 CORESET#0</h3>'+
      '<p>SIB1 的内容走 PDSCH，但 UE 不可能盲扫整个频带去找它——必须先有一条<b>调度信令（DCI）</b>告诉它 SIB1 的 PDSCH 落在哪。这条 DCI 走 PDCCH，而 PDCCH 又必须落在一个<b>预先约定的时频区域</b>里，UE 才知道去哪解。这个"第一个、自举式的控制资源集"就是 <b>CORESET#0</b>。</p>'+
      '<div class="formula">MIB.pdcch-ConfigSIB1（8bit）→ CORESET#0 时频位置 + 搜索空间时机</div>'+
      '<h3>② 一把钥匙，拆成两半</h3>'+
      '<p>这 8 bit 不是一个数，而是<b>两个 4-bit 索引</b>，分别去查两张协议表：</p>'+
      '<div class="formula">0x10 = <b style="color:#4f46e5;">0001</b> <b style="color:#d97706;">0000</b>　→　高4位 controlResourceSetZero=<b>1</b>　低4位 searchSpaceZero=<b>0</b></div>'+
      '<table><tr><th>4-bit 索引</th><th>查的表</th><th>得到</th></tr>'+
      '<tr><td>controlResourceSetZero = 1</td><td>Table 13-1~13-10（按 SCS 配对选表）</td><td>CORESET#0 的<b>频域位置 / 带宽 / 符号数</b></td></tr>'+
      '<tr><td>searchSpaceZero = 0</td><td>Table 13-11~13-15</td><td>Type0-PDCCH 的<b>监测周期 / slot / 起始符号</b></td></tr></table>'+
      '<h3>③ 选哪张表？由 SCS 配对决定</h3>'+
      '<p>查表的前提是知道 <b>{SSB SCS, PDCCH SCS}</b> 配对与频段最小带宽。本场景：SSB=30kHz（Case C）、PDCCH SCS=subCarrierSpacingCommon=30kHz、n78（min BW 10MHz）→ 命中 <b>Table 13-4</b>。</p>'+
      '<h3>④ 自举锚定：相对 SSB，不依赖 Point A</h3>'+
      '<p>关键诚实点：此刻 UE <b>还没有 SIB1</b>，所以<b>还不知道 offsetToPointA</b>（那是 SIB1 才下发的），也就没法用全局 CRB 坐标定位 CORESET#0。3GPP 的解法——CORESET#0 的频域位置<b>直接以 SSB 为参考点</b>给出（表里的 offset 是"相对 SSB 的 RB 偏移"），再叠加 Stage 4 解出的 <b>k_SSB=6</b> 做子载波精对齐。先有鸡（SSB），后有蛋（SIB1/Point A）的死循环就此化解。</p>'+
      '<h3>⑤ 本阶段四步走</h3>'+
      '<p><b>① 查表</b>（S5.1）：0x10 拆开 → 24RB×2sym + 监测时机。<br>'+
      '<b>② 时频反推</b>（S5.2）：把这块 CORESET 相对 SSB 摆到时频网格上。<br>'+
      '<b>③ PDCCH 盲检</b>（S5.3）：在 8-CCE 资源池里按聚合等级试解，用 <b>SI-RNTI</b> 做 CRC 校验捞 DCI。<br>'+
      '<b>④ DCI 1_0 解析</b>（S5.4）：读出 SIB1 的 PDSCH 调度参数，通往 Stage 6。</p>',
      ['[MAC] PDCCH 盲检状态机启动。',
       '[DATA] 读取 NR_CTX.mib：pdcch-ConfigSIB1 = 0x10。',
       '[DATA] SCS 配对 {SSB 30kHz, PDCCH 30kHz}，n78 min BW 10MHz → Table 13-4。']
    ),

    /* ── S5.1 pdcch-ConfigSIB1 查表（双查表「开锁」）─────────── */
    sim(
      '一把钥匙开两把锁：0x10 拆位 → 查 Table 13-4 / 13-11',
      '点击 <b>「开锁」</b>：8-bit 钥匙 <b>0x10</b> 沿中线劈成高/低两个 4-bit 索引，分别飞向两张协议表。高 4 位 <b>controlResourceSetZero=1</b> → Table 13-4 取出 <em>24RB × 2symbol</em> 时频块；低 4 位 <b>searchSpaceZero=0</b> → Table 13-11 取出<em>监测时机</em>。一个查"在哪"，一个查"何时"。',
      'pdcch-ConfigSIB1 双索引查表（TS 38.213 Table 13-4 / Table 13-11）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.15em;">'+
      '<b style="color:#3730a3;font-size:1.15em;">📺 看懂这段动画</b><br>'+
      '<b>① 顶部钥匙</b>：8 个比特 0001 0000，沿中线劈成左右两半——'+
      '<span style="color:#4f46e5">靛蓝高 4 位</span>是 CORESET 索引，<span style="color:#d97706">琥珀低 4 位</span>是搜索空间索引。<br>'+
      '<b>② 两张表</b>：左表（Table 13-4）按高 4 位高亮选中行，吐出<b>频域/带宽/符号数</b>；右表（Table 13-11）按低 4 位高亮，吐出<b>周期/slot/起始符号</b>。<br>'+
      '<b>③ 底部汇总</b>：两表结果合成一句话——"24RB×2sym 的窗口，在偶帧 slot0 符号0 开始监听"。</div>'+
      '<h3>① 为什么是两个独立索引</h3>'+
      '<p>"在哪监听"（频域+符号数）与"何时监听"（周期+slot）是两个正交的问题，3GPP 用<b>两套表</b>分别管，钥匙也就拆成两个 4-bit 字段。8 bit 编码 16×16=256 种组合，覆盖所有部署场景。</p>'+
      '<h3>② 左锁：Table 13-4（{30,30}kHz, min BW 10MHz）</h3>'+
      '<p>controlResourceSetZero=1 选中第 1 行：</p>'+
      '<table><tr><th>列</th><th>取值</th><th>含义</th></tr>'+
      '<tr><td>SS/PBCH 与 CORESET 复用图样</td><td>1</td><td>CORESET#0 在 SSB <b>之后的符号</b>（TDM）</td></tr>'+
      '<tr><td>N_RB^CORESET</td><td><b>24</b></td><td>频域 24 个 RB = 8.64 MHz @ 30kHz</td></tr>'+
      '<tr><td>N_symb^CORESET</td><td><b>2</b></td><td>占 2 个 OFDM 符号</td></tr>'+
      '<tr><td>offset (RB)</td><td><b>1</b></td><td>CORESET 最低 RB 相对 SSB 最低 RB 的偏移</td></tr></table>'+
      '<h3>③ 右锁：Table 13-11（复用图样 1）</h3>'+
      '<p>searchSpaceZero=0 选中第 0 行：</p>'+
      '<table><tr><th>列</th><th>取值</th><th>含义</th></tr>'+
      '<tr><td>O（slot 偏移）</td><td>0</td><td>监测窗起点偏移</td></tr>'+
      '<tr><td>每 slot 搜索空间数</td><td>1</td><td>1 个监测时机</td></tr>'+
      '<tr><td>M（slot 间隔系数）</td><td>1</td><td>决定相邻时机间隔</td></tr>'+
      '<tr><td>首符号索引</td><td>0</td><td>从 slot 第 0 符号起监测</td></tr></table>'+
      '<div class="formula">监测时机：n<sub>0</sub> = (O·2<sup>μ</sup> + ⌊i·M⌋) mod N<sub>slot</sub><sup>frame</sup>，μ=1 → <b>偶帧 slot 0</b></div>'+
      '<h3>④ 这一步的产物</h3>'+
      '<p>一个完整的"监听契约"：<b>24RB × 2symbol</b> 的时频窗口（左锁），在 <b>偶帧 slot0 符号0</b> 开始出现（右锁）。下一屏把它摆到真实时频网格上。</p>',
      ['[MAC] 拆解 pdcch-ConfigSIB1 = 0x10。',
       '[DATA] 高4位 controlResourceSetZero = 1 → Table 13-4 第 1 行。',
       '[DATA] 低4位 searchSpaceZero = 0 → Table 13-11 第 0 行。',
       '[OK] CORESET#0 = 24 RB × 2 symbol，offset = 1 RB；监测 = 偶帧 slot0 符号0。']
    ),

    /* ── S5.2 时频反推（相对 SSB 锚定）──────────────────────── */
    sim(
      '把 CORESET#0 摆上时频网格：相对 SSB，offset 1 RB + k_SSB 精对齐',
      'CORESET#0 不靠 Point A，而是<b>直接挂在 SSB 上</b>。动画把 SSB（20 RB 宽）与 CORESET#0（24 RB 宽）画在同一张时频网格：频域上 CORESET 最低 RB 相对 SSB 下移 <b>offset = 1 RB</b>，再叠加 Stage 4 解出的 <b>k_SSB = 6 子载波</b>做 RE 级精对齐；时域上按复用图样 1，CORESET 紧跟 SSB <b>之后</b>。',
      'CORESET#0 时频落位与 SSB 锚定（TS 38.213 §13）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.15em;">'+
      '<b style="color:#3730a3;font-size:1.15em;">📺 看懂这张图</b><br>'+
      '<b>① 纵轴频率 / 横轴时间</b>：下方<span style="color:#0891b2">青色块</span>=SSB（20RB×4sym，沿用 Stage 1 的语言），上方<span style="color:#4f46e5">靛蓝块</span>=CORESET#0（24RB×2sym）。<br>'+
      '<b>② 频域偏移</b>：右侧标尺标出 CORESET 最低 RB 比 SSB 最低 RB 低 <b>offset=1 RB</b>，缝隙处再用 <b>k_SSB=6</b> 子载波微调（放大镜）。<br>'+
      '<b>③ 时域关系</b>：复用图样 1 → CORESET 在 SSB <b>之后</b>的符号上（TDM 不重叠）。</div>'+
      '<h3>① 频域：两级偏移定位 CORESET 最低 RB</h3>'+
      '<p>CORESET#0 的频域起点 = SSB 最低 RB <b>减去</b> offset 个 RB（粗），<b>再减</b> k_SSB 个子载波（细）。注意这里全程<b>不出现 Point A</b>——UE 还没读 SIB1，拿不到 offsetToPointA。</p>'+
      '<div class="formula">CORESET#0 起点 = f<sub>SSB,min</sub> − offset×12×Δf − k<sub>SSB</sub>×Δf<br>= SSB 最低 RB 下移 1 RB + 6 子载波</div>'+
      '<p>等到 Stage 6 读完 SIB1 拿到 offsetToPointA，UE 才会把这套"相对 SSB"坐标换算成"相对 Point A"的全局 CRB 坐标。<b>现在够用就好。</b></p>'+
      '<h3>② 时域：复用图样决定 CORESET 在何处</h3>'+
      '<table><tr><th>复用图样</th><th>时域关系</th><th>典型场景</th></tr>'+
      '<tr><td><b>1（本例）</b></td><td>CORESET 与 SSB <b>TDM</b>，在 SSB 之后的符号</td><td>FR1 常规</td></tr>'+
      '<tr><td>2</td><td>CORESET 与 SSB 部分 FDM</td><td>FR2</td></tr>'+
      '<tr><td>3</td><td>CORESET 与 SSB 同符号 FDM</td><td>FR2 密集</td></tr></table>'+
      '<h3>③ 带宽账本</h3>'+
      '<p>24 RB × 12 子载波 × 30 kHz = <b>8.64 MHz</b>。这个宽度决定了 PDCCH 的资源池容量——下一屏要算的 <b>CCE 个数</b>就从这里来。</p>'+
      '<div class="formula">REG = N_RB × N_symb = 24 × 2 = 48 个 REG → CCE = 48 / 6 = <b>8 个 CCE</b></div>'+
      '<p>1 REG = 1 RB × 1 symbol；1 CCE = 6 REG。8 个 CCE 就是 UE 接下来盲检的全部"货架"。</p>',
      ['[PHY] 按复用图样 1 落位 CORESET#0（TDM，紧跟 SSB 之后）。',
       '[DSP] 频域：SSB 最低 RB 下移 offset=1 RB + k_SSB=6 子载波 → CORESET 起点。',
       '[DATA] 带宽 24 RB @ 30kHz = 8.64 MHz；REG=48 → 8 CCE 资源池就绪。']
    ),

    /* ── S5.3 PDCCH 盲检（8-CCE 池 + 聚合等级 + SI-RNTI/CRC）── */
    sim(
      'PDCCH 盲检：8-CCE 货架上，按聚合等级试解 + SI-RNTI 校验',
      'UE 不知道 gNB 把 DCI 放在哪几个 CCE、用了多大聚合等级（AL）。于是它<b>穷举所有候选窗口</b>逐个解码，用 <b>SI-RNTI=0xFFFF</b> 解扰 CRC——<b>谁校验通过，谁就是给 SIB1 的调度令</b>。点击 <b>▶ 开始盲检</b> 看候选逐个亮灭，唯一通过的那个亮绿。<em>本例 8-CCE 池只够 AL4/AL8，AL16 物理上放不下。</em>',
      'PDCCH 盲检与聚合等级（TS 38.213 §10.1 / DCI CRC §7.3.2）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.15em;">'+
      '<b style="color:#3730a3;font-size:1.15em;">📺 看懂这段动画</b><br>'+
      '<b>① 顶部货架</b>：8 个格子 = 8 个 CCE（编号 0~7），这是 CORESET#0 的全部资源。<br>'+
      '<b>② 候选窗口</b>：UE 按聚合等级 AL（一次占 4 或 8 个连续 CCE）框出候选窗口，<b>逐个滑过</b>。每个候选都做一次"解扰+CRC"。<br>'+
      '<b>③ 判决</b>：<span style="color:#94a3b8">CRC 失败的候选变灰</span>（不是给我的 / 不是这个 AL），<span style="color:#059669">唯一 CRC 通过的亮绿</span>——锁定 DCI。</div>'+
      '<h3>① 盲检：在不知情下穷举</h3>'+
      '<p>gNB 根据信道质量自适应选 AL：信道差就用大 AL（更多 CCE→更强编码保护）。UE 事先<b>不知道</b> gNB 选了哪个 AL、放在哪——只能把<b>所有合法候选位置</b>都试一遍。这就是"盲检"。</p>'+
      '<h3>② 聚合等级：CORESET#0 资源池的物理约束</h3>'+
      '<p>名义上 Type0-PDCCH CSS 定义 AL∈{4,8,16}，但<b>能不能用，取决于池子有多大</b>。本例只有 8 个 CCE：</p>'+
      '<table><tr><th>AL</th><th>需 CCE</th><th>⌊8/AL⌋ 候选位置</th><th>可行性</th></tr>'+
      '<tr><td>4</td><td>4</td><td>2</td><td style="color:#059669"><b>✓ 可放（2 个位置）</b></td></tr>'+
      '<tr><td>8</td><td>8</td><td>1</td><td style="color:#059669"><b>✓ 可放（占满整池）</b></td></tr>'+
      '<tr><td>16</td><td>16</td><td>0</td><td style="color:#dc2626"><b>✗ 放不下（16&gt;8）</b></td></tr></table>'+
      '<p style="font-size:12px;color:#64748b;">这是个常被教科书忽略的诚实点：AL16 在 24RB×2sym 的 CORESET#0 里<b>根本摆不下</b>，UE 自然不会去盲检它。候选数不是死记的"7"，而是由池子大小算出来的。</p>'+
      '<h3>③ SI-RNTI：CRC 上的"收件人地址"</h3>'+
      '<p>每条 DCI 附 <b>24-bit CRC</b>，而 RNTI 是 <b>16 bit</b>——加扰时 RNTI <b>只与 CRC 的低 16 位逐位 XOR</b>（高 8 位 CRC 不动）。UE 盲检时用<b>它期望的 RNTI</b> 去解扰这低 16 位：</p>'+
      '<div class="formula">c<sub>k</sub> = b<sub>k</sub> ⊕ x<sub>rnti,k</sub>（k 取 CRC 低 16 位）　·　SIB1 调度令固定用 <b>SI-RNTI = 0xFFFF</b></div>'+
      '<p>若解扰后 CRC 校验通过 → 这条 DCI 确实是发给"系统信息"的；若失败 → 要么不是给我的（别的 RNTI），要么这个候选窗口压根没有 DCI。一个 RNTI 同时充当<b>寻址</b>与<b>检错</b>，零额外开销。</p>'+
      '<h3>④ 本例命中</h3>'+
      '<p>gNB 为求稳健（UE 开机信道未知），用 <b>AL8</b>（占满 8 CCE，最强保护）发送 SIB1 的 DCI。UE 盲检到 AL8 候选时 SI-RNTI 校验通过 → 锁定。</p>'+
      '<h3>⑤ 省电细节：先功率检测，再解码</h3>'+
      '<p>解码很费电，UE 不会对每个候选都硬解。盲检前先做一步<b>功率检测</b>：算每个 CCE 上 RE 的<b>平均功率</b>，与门限 <b>0.5</b> 比——低于门限的 CCE 判为<b>未被占用</b>，直接跳过、不浪费解码。本例 8 个 CCE 功率全部高于 0.5（都被那条 AL8 占用），所以才值得逐候选试解。</p>'+
      '<div class="formula">P&#772;<sub>CCE</sub> &lt; 0.5 → 判为「空」跳过　·　P&#772;<sub>CCE</sub> ≥ 0.5 → 进入解码流程</div>'+
      '<h3>⑥ 极客提示：货架其实是「打散」的</h3>'+
      '<p>动画里 CCE 0~7 画成连续货架，是为了讲清<b>逻辑</b>占用关系。但物理网格上，CORESET#0 采用<b>协议预置参数的交织映射</b>（REG bundle 大小 6、交织行数 2、移位 n<sub>shift</sub> = N<sub>ID</sub><sup>cell</sup>=PCI）：每个 CCE 被切成 REG（1 RB × 1 符号），像撒胡椒面一样<b>均匀铺到整个 8.64 MHz 频带</b>上。</p>'+
      '<p style="font-size:12px;color:#64748b;">好处是<b>频率分集</b>：万一某段频率遭遇深衰落，被打散的 DCI 仍有大部分 REG 落在好频率上，靠 Polar 译码救回来。逻辑连续、物理打散——这是 NR 控制信道抗衰落的标准手法（交织参数对 CORESET#0 固定，不是所有 CORESET 都交织）。</p>',
      ['[MAC] 进入 Type0-PDCCH 公共搜索空间，监测时机 = 偶帧 slot0。',
       '[DSP] 功率检测：8 个 CCE 平均功率均 > 门限 0.5 → 判定全部被占用。',
       '[MAC] 资源池 8 CCE → 候选集：AL4×2 + AL8×1（AL16 需16CCE，放不下）。',
       '[DSP] 逐候选解码 + SI-RNTI(0xFFFF) 翻转 CRC 低16位…',
       '[OK] AL8 候选 CRC 校验通过 → 锁定 DCI（发给系统信息）。']
    ),

    /* ── S5.4 DCI 1_0 解析（→ 调度 SIB1 PDSCH，写总线）────── */
    sim(
      'DCI format 1_0 解析：读出 SIB1 的 PDSCH 调度，通往 Stage 6',
      'CRC 通过，拿到 <b>37-bit</b> 载荷（22-bit 语义字段 + <b>15-bit 预留位</b>）。它是 <b>DCI format 1_0（SI-RNTI 加扰）</b>，逐字段拆开就是 SIB1 那段 PDSCH 的"提货单"：频域占哪些 RB（RIV）、时域占哪些符号（TDRA→SLIV）、用什么 MCS/RV、以及 SI 指示。末尾 15 位是<b>纯凑尺寸的预留位</b>（全 0、不载信息）。解析完，<b>把 CORESET#0 参数写入 NR_CTX</b>，Stage 6 就能去解 SIB1 的 PDSCH 了。',
      'DCI format 1_0 字段解析（TS 38.212 §7.3.1.2.1 / TS 38.214 §5.1.2）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.15em;">'+
      '<b style="color:#3730a3;font-size:1.15em;">📺 看懂这段动画</b><br>'+
      '<b>① 上方比特带</b>：37 bit 按字段分段——前 6 段彩色是<b>语义字段</b>（RIV / TDRA / VRB-PRB / MCS / RV / SI 指示），末尾<b>斜纹灰段</b>是 15-bit 预留位（死区）。<br>'+
      '<b>② 逐字段解码</b>：每段比特"翻译"成人类可读值（RIV→起始RB+长度，TDRA→符号区间…）。<br>'+
      '<b>③ 右侧提货单 + 写总线</b>：合成 SIB1 PDSCH 的时频位置；<span style="color:#059669">绿色字段</span>= 已写入 NR_CTX，点亮通往 Stage 6 的路。</div>'+
      '<h3>① DCI 1_0 字段全景（N_RB^BWP = 24）</h3>'+
      '<table><tr><th>字段</th><th>位宽</th><th>本例值</th><th>含义</th></tr>'+
      '<tr><td>Freq domain RA (RIV)</td><td>9</td><td>RIV=47</td><td>→ RB_start=0, L=24（占满 CORESET 频域）</td></tr>'+
      '<tr><td>Time domain RA</td><td>4</td><td>idx→K0=0</td><td>→ 同 slot，SLIV 解出符号 2~13</td></tr>'+
      '<tr><td>VRB-to-PRB mapping</td><td>1</td><td>0</td><td>非交织映射</td></tr>'+
      '<tr><td>MCS</td><td>5</td><td>5</td><td>QPSK，码率 ≈0.37（开机求稳健）</td></tr>'+
      '<tr><td>Redundancy version</td><td>2</td><td>0</td><td>RV0，首传</td></tr>'+
      '<tr><td>System info indicator</td><td>1</td><td>0</td><td>指示 SIB1（非其他 SI 消息）</td></tr>'+
      '<tr><td><b style="color:#64748b;">预留位 (Reserved)</b></td><td><b>15</b></td><td>0…0</td><td><b>凑尺寸、不载信息</b>（见下文 size alignment）</td></tr></table>'+
      '<p style="font-size:12px;color:#64748b;">语义字段 9+4+1+5+2+1 = 22 bit，加 15 bit 预留位 = <b>37 bit 载荷</b>，附 CRC24 后经 Polar 编码上 PDCCH。语义位宽随 N_RB^BWP 变化（RIV 字段 = ⌈log₂(N(N+1)/2)⌉）。</p>'+
      '<h3>② 硬核彩蛋：那 15 个预留位是「配重块」</h3>'+
      '<p>22 bit 明明够用，为什么 3GPP 还硬塞 15 个全 0 的预留位？答案是 <b>尺寸对齐（size alignment）</b>。盲检很费电，协议要求<b>同一搜索空间里 UE 要盲检的几种 DCI 长度尽量一致</b>——长度相同，UE 一次解码就能同时覆盖多种格式假设，盲检次数大减。用 SI/RA/P-RNTI 加扰的 DCI 1_0 因此被补零到一个<b>固定的预算长度</b>，多出来的位用 0 填满。</p>'+
      '<div class="formula">真实物理载荷 = 22（语义）+ 15（预留 0）= <b>37 bit</b>　·　多出的位纯为「让基带少干活」</div>'+
      '<p style="font-size:12px;color:#64748b;">一句话：预留位不传任何信息，纯粹是为了把 DCI 1_0 的长度"垫"到约定值，省下手机盲检的算力与功耗。逻辑上可忽略，物理上真实存在。</p>'+
      '<h3>③ RIV：把"起点+长度"压成一个数</h3>'+
      '<p>频域资源用 <b>RIV（Resource Indication Value）</b>编码连续 RB 段的起点与长度，一个数同时携带两个量，解码端反算：</p>'+
      '<div class="formula">L−1 ≤ ⌊N/2⌋：RIV = N·(L−1) + RB<sub>start</sub>；否则取镜像式　·　本例 RIV=47 → RB<sub>start</sub>=0, L=24</div>'+
      '<h3>④ TDRA → SLIV：时域起点与长度</h3>'+
      '<p>4-bit 时域索引查默认 PDSCH 时域分配表，得到 <b>K0（PDCCH 到 PDSCH 的 slot 偏移）</b>、起始符号 S 与长度 L，再合成 SLIV。本例 K0=0（同 slot）、S=2、L=12 → SIB1 PDSCH 占符号 2~13。</p>'+
      '<h3>⑤ SIB1 的 PDSCH 用什么解？</h3>'+
      '<p>SIB1 数据走 PDSCH，编码用 <b>LDPC</b>（不同于 PBCH 的 Polar），CRC 用 <b>CRC16</b>。这条 DCI 给出了它的全部时频与传输参数，Stage 6 据此解出 SIB1，再做 ASN.1 解码与小区驻留判决。</p>'+
      '<h3>⑥ 写入 NR_CTX → 通往 Stage 6</h3>'+
      '<p>本阶段把 CORESET#0 的频域起点 RB、RB 数、符号数写入全局总线（顶栏点亮 BWP）。这是 UE 第一次拥有可供 PDSCH 调度解析的"初始下行 BWP"雏形。</p>',
      ['[MAC] ✓ DCI format 1_0（SI-RNTI）CRC 校验通过，载荷 37 bit（22 语义 + 15 预留）。',
       '[DATA] 频域 RIV=47 → RB_start=0, L=24；时域 K0=0, 符号 2~13。',
       '[DATA] MCS=5(QPSK,R≈0.37), RV=0, SI 指示=0 → 调度 SIB1。',
       '[DATA] 末尾 15 bit 预留位（全 0）：size alignment 凑尺寸，不载信息。',
       '[SUCCESS] CORESET#0 参数写入 NR_CTX → Stage 6 解 SIB1 PDSCH。']
    ),

  ]};
  /* ════════════════════════════════════════════════════════════════════
     STAGE 6 · SIB1 解析  (5 sub-steps: 0..4)  ★ 完整
     配色：天蓝 #0284c7(主) / 深蓝 #075985 / 浅蓝 #e0f2fe
          / 答案绿 #059669(驻网里程碑) / 钥匙琥珀 #d97706 / 高光红 #dc2626 / 对照灰 #94a3b8
          / 码字对照：Polar 紫 #7c3aed(回指 Stage4/5) vs LDPC 蓝绿 #0d9488
     ════════════════════════════════════════════════════════════════════ */
  var S6 = { subSteps: [

    /* ── S6.0 理论黑板：SIB1 是什么 + 为何是「驻网终点」 ───────────── */
    discuss(
      'SIB1：小区的「说明书」，也是驻网的终点线',
      '前五个 Stage 一路把 UE 从「单向无知」带到「能解一条 DCI」。这条 DCI 指向 <b>SIB1</b>——小区广播的<b>第一份完整说明书</b>。读懂它，UE 才知道：这个小区能不能驻留、上行怎么发起接入、以及那个被反复推迟的 <b>Point A 全局坐标</b>到底在哪。SIB1 读完，<b>严格意义的「驻网（camping）」即告完成</b>。',
      'SIB1 的三重身份与「驻网 ≠ 连接」（TS 38.331 §6.2.2 / 38.304 §5.2）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.12em;">'+
      '<b style="color:#075985;font-size:1.12em;">📺 看懂这张图</b><br>'+
      '<b>① 三张职责卡</b>：SIB1 同时干三件事——给<span style="color:#059669">驻留判决依据</span>、闭合<span style="color:#d97706">Point A 死循环</span>、下发<span style="color:#0d9488">RACH 配置</span>（为 Stage 7 铺路）。<br>'+
      '<b>② 闭环箭头</b>：Stage 1 与 Stage 5 都欠了一笔「等 SIB1 再算」的账（offsetToPointA），这一屏起开始还账。<br>'+
      '<b>③ 终点旗</b>：读完 SIB1 = 驻网完成，但<b>仍是 RRC_IDLE</b>——能收广播、能发起接入，还没建立专属连接。</div>'+
      '<h3>① SIB1 是什么？</h3>'+
      '<p>MIB（Stage 4）只有 23 bit，是「最小可解的引导」；它告诉 UE 去哪找 SIB1（pdcch-ConfigSIB1）。<b>SIB1（SystemInformationBlockType1）</b>才是小区的正式说明书，用 <b>PDSCH + LDPC</b> 承载，内容是一棵 <b>ASN.1</b> 结构树：小区选择门限、PLMN 列表、调度信息、服务小区公共配置（含 Point A 与 RACH）。</p>'+
      '<h3>② 它闭合了一个贯穿全程的「鸡生蛋」</h3>'+
      '<p>Stage 1 推导 Point A 时缺 <em>offsetToPointA</em>；Stage 5 摆 CORESET#0 时只能「相对 SSB」自举、绕开 Point A。两处都写着同一句话：<b>「等读完 SIB1 再换算」</b>。<em>offsetToPointA</em> 正藏在 SIB1 的 servingCellConfigCommon 里——本 Stage S6.3 把它取出，UE 第一次拥有<b>以 Point A 为零点的全局 CRB 坐标系</b>。</p>'+
      '<h3>③ 驻网（camping）≠ 连接（connected）</h3>'+
      '<p>读完 SIB1 并通过<b>三关校验</b>（PLMN 匹配 · cellBarred · S 准则），UE 进入 <b>「驻留在合适小区」</b>状态：可接收寻呼与系统信息、可发起随机接入。但此刻 <b>RRC 仍是 IDLE</b>——尚无 C-RNTI、无专属信令承载。真正的「接入」（→ RRC_CONNECTED）要等 Stage 7（PRACH）与 Stage 8（RRC 建立）。</p>'+
      '<table><tr><th>状态</th><th>UE 拥有</th><th>由哪个 Stage 达成</th></tr>'+
      '<tr><td>已驻网 (camped, IDLE)</td><td>系统信息 + 接入参数</td><td><b>本 Stage 6 终点</b></td></tr>'+
      '<tr><td>已连接 (CONNECTED)</td><td>C-RNTI + SRB/DRB + 安全上下文</td><td>Stage 7 + 8</td></tr></table>'+
      '<h3>④ 为什么 SIB1 用 LDPC 而不是 Polar？</h3>'+
      '<p>同一套信道编码工具箱，不同信道挑不同零件：<b>控制信道（PBCH/PDCCH）块小、要极低误码 → Polar</b>；<b>数据信道（PDSCH）块大、要高吞吐与 HARQ → LDPC</b>。SIB1 走 PDSCH，自然用 LDPC + CRC16（区别于 PBCH 的 Polar + CRC24C）。下一屏看这条解码链。</p>',
      ['[RRC] SIB1 接收链路就绪：PDSCH 解调器 + LDPC 译码器 + ASN.1/UPER 解析器。',
       '[RRC] 上游就绪：CORESET#0 已锁定，DCI format 1_0 提货单已解析。',
       '[RRC] 待办：解 PDSCH → 解 ASN.1 → 闭环 Point A → 驻留判决。']
    ),

    /* ── S6.1 PDSCH 解调 & LDPC 译码 ─────────────────────────────── */
    sim(
      'PDSCH 解调 & LDPC 译码：按提货单取出 SIB1 的传输块',
      '拿 Stage 5 那张 DCI 提货单（RB 0~23、符号 2~13、QPSK、MCS5），在初始下行 BWP 上框出 SIB1 的 PDSCH，做 <b>DMRS 信道估计 → QPSK 解调 → LDPC 译码 → CRC16 校验</b>。点击 <b>▶ 解码</b> 看比特一级级被「拆封」。<em>关键对照：PBCH 用 Polar、PDCCH 用 Polar，到了数据信道 PDSCH 换成 LDPC——同一工具箱，不同零件。</em>',
      'PDSCH 接收链与信道编码选择（TS 38.214 §5.1 / 38.212 §7.2.2）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.12em;">'+
      '<b style="color:#075985;font-size:1.12em;">📺 看懂这段动画</b><br>'+
      '<b>① 左侧时频块</b>：初始 BWP 上的一块——RB 0~23 × 符号 2~13，就是 DCI 指来的 SIB1 PDSCH（橙点为 DMRS 信道估计锚点）。<br>'+
      '<b>② 中间流水线</b>：解调 → LDPC 译码 → CRC16。每步比特数随之变化。<br>'+
      '<b>③ 右侧码字对照</b>：<span style="color:#7c3aed">PBCH/PDCCH=Polar</span> vs <span style="color:#0d9488">PDSCH=LDPC</span>——为什么数据信道换码。</div>'+
      '<h3>① 接收链：和前面一脉相承</h3>'+
      '<p>步骤与 PBCH 解调同构：<b>定位 → DMRS 信道估计 → 均衡 → 软解调 → 信道译码 → CRC</b>。差别只在末端两个零件：码是 <b>LDPC</b>、校验是 <b>CRC16</b>。DCI 提货单已经把「在哪、多大、什么调制」全告诉 UE，省去盲检。</p>'+
      '<h3>② 传输块大小（TBS）怎么来的</h3>'+
      '<p>由分配的 RE 数 × 码率 × 调制阶数推算，再量化查表（TS 38.214 §5.1.3.2）：</p>'+
      '<table><tr><th>量</th><th>本例</th><th>来源</th></tr>'+
      '<tr><td>RE / PRB（扣 DMRS）</td><td>12×12 − 6 = 138</td><td>12 符号，1 个单符号 DMRS</td></tr>'+
      '<tr><td>总 RE</td><td>138 × 24 = 3312</td><td>24 RB</td></tr>'+
      '<tr><td>Qm（QPSK）/ 码率 R</td><td>2 / 0.370</td><td>MCS5（64QAM 表）</td></tr>'+
      '<tr><td>N_info → 量化 → <b>TBS</b></td><td>≈2452 → <b>2472 bit</b></td><td>查表 5.1.3.2-1</td></tr></table>'+
      '<p style="font-size:12px;color:#64748b;"><b>诚实点 · 为什么把它「撑大」？</b>SIB1 实际 ASN.1 内容通常只有几十字节，gNB 却选了能装 309 字节的传输块。原因是<b>频率分集</b>：开机信道未知，gNB 用最稳健的 QPSK + 低码率（R≈0.37），并<b>故意让 PDSCH 铺满整整 24 RB</b>——资源铺得越广、频率分集增益越大，深衰落砸中一小段频率时还有大量 RE 幸存。资源铺广了 TBS 自然就大，于是 <b>MAC 层用无意义的 Padding 字节（全 0 / Padding 子头）把这 309 字节死死填满</b>，确保 LDPC 译码器有足额输入长度正常工作。逻辑上是垃圾，物理上是「为分集增益付的房租」。</p>'+
      '<h3>③ 为什么数据信道用 LDPC？（核心对照）</h3>'+
      '<table><tr><th>信道</th><th>编码</th><th>CRC</th><th>为何这样选</th></tr>'+
      '<tr><td style="color:#7c3aed"><b>PBCH</b></td><td>Polar (n_max=9, I_IL)</td><td>CRC24C</td><td>块极小、要极低误码</td></tr>'+
      '<tr><td style="color:#7c3aed"><b>PDCCH</b></td><td>Polar (n_max=9, I_IL=1)</td><td>CRC24C(扰 RNTI)</td><td>控制信令、短块</td></tr>'+
      '<tr><td style="color:#0d9488"><b>PDSCH</b></td><td><b>LDPC</b> (BG1/BG2)</td><td>CRC16/CRC24A</td><td>大块、高吞吐、易并行、支持 HARQ-IR</td></tr></table>'+
      '<p>LDPC 的优势在<b>长码字下逼近容量、译码可大规模并行（高吞吐）、且天然支持增量冗余 HARQ</b>。本例 TB 较小（2472 bit）且码率 0.37，按 TS 38.212 §7.2.2 选 <b>Base Graph 2</b>（BG2 面向小块/中低码率）。</p>'+
      '<div class="formula">选图规则：A ≤ 292，或 R ≤ 0.25，或 (A ≤ 3824 且 R ≤ 0.67) → <b>BG2</b>；否则 BG1　·　本例 A=2472, R=0.37 → BG2</div>'+
      '<h3>④ CRC16 通过 → 得到干净的 SIB1 比特</h3>'+
      '<p>LDPC 译码（BP/分层 min-sum 迭代）收敛后，剥掉 CRC16 校验位，得到 SIB1 的<b>字节流</b>。它还不是「人话」——是一棵被 UPER 压扁的 ASN.1 树。下一屏负责解包。</p>',
      ['[PHY] 在初始 BWP 上框定 SIB1 PDSCH：RB 0~23，符号 2~13（来自 DCI 提货单）。',
       '[DSP] DMRS 信道估计 + QPSK 软解调 → LLR 序列。',
       '[DSP] LDPC（Base Graph 2）分层迭代译码…码率 R≈0.37。',
       '[OK] CRC16 校验通过 → 传输块 2472 bit（309 B）解出，无误码。',
       '[DATA] 得到 SIB1 ASN.1 字节流（UPER 编码），交给解析器。']
    ),

    /* ── S6.2 ASN.1 / UPER 解码 ─────────────────────────────────── */
    sim(
      'ASN.1 / UPER 解码：把压扁的字节流还原成结构树',
      'SIB1 不是裸字段拼接，而是一条 <b>ASN.1</b> 消息，用 <b>UPER（Unaligned Packed Encoding Rules）</b>压成紧凑比特流——<b>没有字段名、没有标签、没有字节对齐</b>，全靠收发两端共享同一份 ASN.1「语法字典」。点击 <b>▶ 解析</b>，看比特流如何按语法逐节点弹出，长成 SIB1 结构树。',
      'ASN.1 抽象语法与 UPER 编码（TS 38.331 §6 / ITU-T X.691）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.12em;">'+
      '<b style="color:#075985;font-size:1.12em;">📺 看懂这段动画</b><br>'+
      '<b>① 顶部比特流</b>：LDPC 解出的原始比特，<b>没有任何分隔</b>。<br>'+
      '<b>② optional 位图</b>：UPER 在开头用一串「存在位」声明哪些可选字段出现——这是解包的钥匙。<br>'+
      '<b>③ 结构树</b>：按 ASN.1 语法，比特流逐段「弹出」成树节点（每个节点旁标出它吃掉了几个 bit）。</div>'+
      '<h3>① ASN.1 是协议的「类型系统」</h3>'+
      '<p>ASN.1（Abstract Syntax Notation One）用与语言无关的方式描述消息<b>结构</b>：SEQUENCE（结构体）、CHOICE（多选一）、ENUMERATED（枚举）、INTEGER (a..b)（带范围整数）、OPTIONAL（可选）。3GPP 在 TS 38.331 里把所有 RRC 消息都写成 ASN.1 定义——它是收发双方共享的<b>语法字典</b>。</p>'+
      '<h3>② UPER：为什么能「没有字段名」也解得开</h3>'+
      '<p>UPER 把结构信息<b>全部转移到双方预先约定的语法</b>里，空口只传「值」，因此极致紧凑：</p>'+
      '<ul>'+
      '<li><b style="color:#dc2626">开头扩展位（Extension Bit）</b>：可扩展 SEQUENCE 的<b>最前面强制 1 bit</b>——0 表示「按本版本字段解」，1 表示「后面还跟着未来版本追加的字段」。这是<b>比 OPTIONAL 位图更靠前</b>的第一道关。</li>'+
      '<li><b>OPTIONAL 位图</b>：扩展位之后，用 1 bit/可选字段声明其是否出现；解码先读位图，再决定后面切不切这一段。</li>'+
      '<li><b>无标签</b>：不传字段名/类型标签，解码端按语法顺序「数着 bit 往下切」。</li>'+
      '<li><b>范围最小位宽</b>：INTEGER (0..7) 只占 3 bit，INTEGER (0..1023) 占 10 bit——位宽由<b>取值范围</b>而非类型决定。</li>'+
      '<li><b>Unaligned</b>：字段之间<b>不补零对齐字节</b>，比特紧贴比特（这正是 SIB1 字节流难以肉眼解读的原因）。</li>'+
      '</ul>'+
      '<div class="formula">编码字段位宽 = ⌈log₂(取值个数)⌉　·　例：q-RxLevMin ∈ (−70..−22) → 49 个取值 → 6 bit</div>'+
      '<h3>③ 向前兼容的命门：那个 1-bit 扩展位（ASN.1 的「...」）</h3>'+
      '<p>3GPP 协议逐版演进（Rel-15 → 16 → 17），新基站会下发老手机没见过的新字段。ASN.1 在几乎所有重要 SEQUENCE 末尾放一个 <b>扩展标记「...」</b>，在 UPER 比特流里就落实为开头那 1 bit：</p>'+
      '<table><tr><th>扩展位</th><th>含义</th><th>老 UE 行为</th></tr>'+
      '<tr><td><b>0</b>（本例）</td><td>无版本扩展</td><td>按本版本语法解完即止</td></tr>'+
      '<tr><td><b>1</b></td><td>后面有新版本追加字段</td><td>解完已知字段后，<b>按长度跳过</b>看不懂的扩展段，不报错</td></tr></table>'+
      '<p>正因为有这一位，<b>老终端遇到新消息不会崩</b>——读到扩展位=1 就知道「后面有我这版还不认识的东西」，靠长度字段安全跳过。这是 ASN.1/UPER 让协议「能向前演进又不丢向后兼容」的核心机关。</p>'+
      '<h3>④ SIB1 结构树（本例解出的主要分支）</h3>'+
      '<table><tr><th>IE（节点）</th><th>作用</th><th>下游</th></tr>'+
      '<tr><td>cellSelectionInfo</td><td>q-RxLevMin / q-RxLevMinOffset</td><td>→ S6.4 S 准则</td></tr>'+
      '<tr><td>cellAccessRelatedInfo</td><td>PLMN 列表 / TAC / cellIdentity / cellBarred</td><td>→ S6.4 接入校验</td></tr>'+
      '<tr><td>si-SchedulingInfo</td><td>其他 SIB 的调度窗口</td><td>（后续 SI）</td></tr>'+
      '<tr><td><b style="color:#d97706">servingCellConfigCommon</b></td><td>frequencyInfoDL→<b>offsetToPointA</b>；uplinkConfigCommon→<b>rach-ConfigCommon</b></td><td>→ <b>S6.3 两件大事</b></td></tr>'+
      '<tr><td>ue-TimersAndConstants</td><td>T300/T301/T319 等定时器</td><td>→ Stage 8</td></tr></table>'+
      '<p style="font-size:12px;color:#64748b;"><b>诚实点</b>：动画里逐节点弹出是为讲清<b>层次</b>；真实 UPER 解码是<b>单向流式</b>的——从头到尾一次扫过，读到 OPTIONAL 位图就知道跳过还是切入，不存在「回头找字段」。</p>'+
      '<h3>⑤ 两个宝藏字段，下一屏开箱</h3>'+
      '<p>servingCellConfigCommon 这枝里挂着本 Stage 最关键的两样东西：<b style="color:#d97706">offsetToPointA</b>（闭合全局坐标）与 <b style="color:#0d9488">rach-ConfigCommon</b>（Stage 7 的全部弹药）。S6.3 把它们取出来落位。</p>',
      ['[RRC] 启动 ASN.1/UPER 解码器，加载 TS 38.331 BCCH-DL-SCH 语法。',
       '[RRC] 读 OPTIONAL 位图：connEstFailureControl 缺省 / ims-EmergencySupport 缺省。',
       '[RRC] 逐节点解包：cellSelectionInfo → cellAccessRelatedInfo → si-SchedulingInfo。',
       '[RRC] servingCellConfigCommon 解出：含 offsetToPointA 与 rach-ConfigCommon。',
       '[OK] SIB1 结构树构建完成，关键 IE 已就位。']
    ),

    /* ── S6.3 关键 IE 落位：闭环 Point A + 抽 RACH 配置 ───────────── */
    sim(
      '两件大事：闭合 Point A 全局坐标 + 抽出 RACH 弹药',
      '从 servingCellConfigCommon 取出两样东西。<b>① offsetToPointA</b>：和 Stage 4 的 k_SSB 联手，把「相对 SSB」的坐标换算成<b>以 Point A 为零点的全局 CRB 坐标</b>——Stage 1 与 Stage 5 欠的账，此刻还清。<b>② rach-ConfigCommon</b>：prach 配置索引、根序列、ZCZ、RAR 窗…<b>整包交给 Stage 7</b>。点击 <b>▶ 落位</b> 看两件事依次完成。',
      'Point A 闭环与 RACH-ConfigCommon（TS 38.211 §4.4 / 38.331 §6.3.2）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.12em;">'+
      '<b style="color:#075985;font-size:1.12em;">📺 看懂这段动画</b><br>'+
      '<b>① 左：频率数轴闭环</b>：从 SSB 锚点，减去 <span style="color:#d97706">k_SSB（细）</span>、再减 <span style="color:#d97706">offsetToPointA（粗）</span> → 落到 <b>Point A</b>。CRB 网格以此为零点铺开。<br>'+
      '<b>② 右：RACH 弹药箱</b>：rach-ConfigCommon 的字段逐个亮起，标注「→ Stage 7」。<br>'+
      '<b>③ 闭环徽标</b>：Stage1/5 欠的「等 SIB1」此刻打勾。</div>'+
      '<h3>① 终于能算 Point A（闭合贯穿全程的死循环）</h3>'+
      '<p>Stage 1 给过公式但缺 offsetToPointA；Stage 5 干脆绕开 Point A 自举。现在两个偏移量齐了——一<b>粗</b>（RB 级）一<b>细</b>（子载波级）：</p>'+
      '<div class="formula">f<sub>PointA</sub> = f<sub>SSB,sc0</sub> − k<sub>SSB</sub>×Δf<sub>15</sub> − offsetToPointA×12×Δf<sub>15</sub></div>'+
      '<table><tr><th>量</th><th>本例</th><th>来源</th></tr>'+
      '<tr><td>SSB 最低子载波 f_SSB,sc0</td><td>3546.48 MHz</td><td>Fc=3550.08 − 120×30kHz</td></tr>'+
      '<tr><td>k_SSB（×15kHz，细）</td><td>6</td><td>Stage 4 MIB+PBCH</td></tr>'+
      '<tr><td>offsetToPointA（×12×15kHz，粗）</td><td>84 RB</td><td><b>本 SIB1</b></td></tr>'+
      '<tr><td><b>f_PointA</b></td><td><b>3531.27 MHz</b></td><td>= 3546.48 − 0.09 − 15.12</td></tr></table>'+
      '<p><b>意义</b>：UE 第一次拥有<b>以 Point A 为绝对零点的 CRB 坐标系</b>。此前所有频域定位都是「相对 SSB」的临时坐标；从此刻起，初始下行 BWP、后续所有 PDSCH/PUSCH 调度都能挂到全局 CRB 网格上。<em>offsetToPointA 用 15kHz 作参考 SCS 计 RB（FR1 约定），与数据网格的实际 SCS 无关。</em></p>'+
      '<p style="font-size:12px;color:#64748b;"><b>为什么本例取 84 RB？</b>84 RB × 12 × 15kHz = 15.12 MHz，加 k_SSB 的 0.09 MHz，SSB 最低子载波距 Point A 恰好 <b>15.21 MHz</b>。对典型 n78（3.5GHz）现网，运营商常部署 100MHz 连续频谱，把 SSB 放在距载波底部约 15MHz 处：既贴合 GSCN 栅格对齐规范，又不贴频段边缘（避免带外泄漏），是一个极真实的「甜点值」现网参数。</p>'+
      '<h3>② RACH-ConfigCommon：Stage 7 的全部弹药</h3>'+
      '<p>上行随机接入（PRACH）需要一整套参数，全在这枝里下发。S6 只负责<b>取出并交付</b>，怎么用是 Stage 7 的事：</p>'+
      '<table><tr><th>字段</th><th>本例</th><th>Stage 7 用途</th></tr>'+
      '<tr><td>prach-ConfigurationIndex</td><td>16</td><td>查表定 PRACH 时机/格式（preamble format）</td></tr>'+
      '<tr><td>prach-RootSequenceIndex</td><td>1</td><td>ZC 根序列起点，生成 64 个 preamble</td></tr>'+
      '<tr><td>zeroCorrelationZoneConfig</td><td>8</td><td>循环移位量 N_CS，决定每根序列出几个 preamble</td></tr>'+
      '<tr><td>msg1-FDM / msg1-FrequencyStart</td><td>1 / 0</td><td>PRACH 频域位置（相对 Point A）</td></tr>'+
      '<tr><td>preambleReceivedTargetPower</td><td>−110 dBm</td><td>开环功控目标，配合 RSRP 算发射功率</td></tr>'+
      '<tr><td>ra-ResponseWindow</td><td>sl20</td><td>发完 Msg1 后等 RAR 的窗口长度</td></tr>'+
      '<tr><td>preambleTransMax / powerRampingStep</td><td>10 / 2 dB</td><td>重试上限与功率爬升步长</td></tr></table>'+
      '<h3>③ 初始下行 BWP 也定了</h3>'+
      '<p>SIB1 的 initialDownlinkBWP 用 <em>locationAndBandwidth</em>（又一个 RIV！）给出初始 BWP 的起点与宽度，现在能挂到 Point A 坐标系上。这是 UE 在 RRC_IDLE 期间收发系统信息/寻呼/RAR 的工作带宽。</p>',
      ['[DATA] 取 offsetToPointA = 84 RB（servingCellConfigCommon.frequencyInfoDL）。',
       '[DSP] f_PointA = 3546.48 − k_SSB(6×15k) − 84×12×15k = 3531.27 MHz。',
       '[OK] 全局 CRB 坐标系建立 → Stage1/5 推迟的 Point A 换算闭环。',
       '[MAC] 抽取 rach-ConfigCommon：prach-CfgIdx=16, rootSeqIdx=1, ZCZ=8, RAR 窗=sl20。',
       '[DATA] RACH 配置整包写入 NR_CTX → 交付 Stage 7。']
    ),

    /* ── S6.4 小区驻留判决：三关校验 → 驻网成功（里程碑）─────────── */
    sim(
      '小区驻留判决：三关全过 → 驻网成功（但仍是 IDLE）',
      'UE 终于集齐判决所需的一切。过<b>三关</b>：① <b>PLMN 匹配</b>（USIM 的 46001 是否在小区 PLMN 列表里）；② <b>cellBarred</b>（小区是否禁止驻留）；③ <b>S 准则</b>（信号是否够强，Srxlev &gt; 0）。点击 <b>▶ 判决</b> 看三关依次亮灯。全过 → <b>🚩 驻网（camping）完成</b>，这是本项目「同步+解析」主线的<b>终点旗</b>。<em>诚实点：驻网成功 ≠ 已连接，RRC 仍是 IDLE。</em>',
      '小区选择 S 准则与驻留判决（TS 38.304 §5.2.3 / 38.331）',
      '<div class="formula" style="text-align:left;line-height:1.7;font-size:1.12em;">'+
      '<b style="color:#075985;font-size:1.12em;">📺 看懂这段动画</b><br>'+
      '<b>① 三道闸门</b>：PLMN → cellBarred → S 准则，逐关亮灯，全绿才放行。<br>'+
      '<b>② S 准则天平</b>：实测 RSRP 与最低门限比，余量 Srxlev 是正才「够得着」。<br>'+
      '<b>③ 终点旗 + 诚实条</b>：驻网成功，但状态栏写明仍是 RRC_IDLE——接入还在后面。</div>'+
      '<h3>① 第一关 · PLMN 匹配</h3>'+
      '<p>UE 从 USIM 读出签约 PLMN（本例 <b>46001</b>，中国移动），与 SIB1 的 cellAccessRelatedInfo.plmn-IdentityInfoList 比对。命中 → 这是「我能用的网」。否则只能作应急/受限接入或继续搜网。</p>'+
      '<h3>② 第二关 · cellBarred / 重选许可</h3>'+
      '<p>cellBarred = <b>notBarred</b> 才允许驻留；若 barred，再看 intraFreqReselection 是否 allowed，决定能否重选到同频邻区。本例 notBarred，直接放行。</p>'+
      '<h3>③ 第三关 · S 准则（信号够不够强）</h3>'+
      '<p>核心判据是<b>接收电平余量</b> Srxlev 必须为正（还有 Squal 质量准则，此处略）：</p>'+
      '<div class="formula">Srxlev = Q<sub>rxlevmeas</sub> − (q-RxLevMin + q-RxLevMinOffset) − P<sub>compensation</sub> &gt; 0</div>'+
      '<table><tr><th>量</th><th>本例</th><th>说明</th></tr>'+
      '<tr><td>Q_rxlevmeas（实测 RSRP）</td><td>−75 dBm</td><td>UE 测量值</td></tr>'+
      '<tr><td>q-RxLevMin</td><td>−110 dBm</td><td>SIB1 下发（信令值 −55 × 2）</td></tr>'+
      '<tr><td>q-RxLevMinOffset / P_comp</td><td>0 / 0</td><td>偏置与功率补偿</td></tr>'+
      '<tr><td><b>Srxlev</b></td><td><b>+35 dB</b></td><td>= −75 −(−110) − 0 → <b>&gt; 0，合适</b></td></tr></table>'+
      '<p>余量 +35 dB → 小区信号远高于驻留门限，判为 <b>suitable cell</b>。</p>'+
      '<h3>④ 驻网完成 = 本项目「同步 + 解析」主线终点</h3>'+
      '<p>三关全过，UE <b>驻留在该小区（camping）</b>：能监听寻呼、接收系统信息、并在需要时发起随机接入。规划表里说得很清楚——<b>严格意义的「驻网」到此完成</b>。</p>'+
      '<div class="formula" style="text-align:left;">已写入 NR_CTX：Point A 坐标 · 初始 BWP(Point A 锚定) · rach_config(整包) · rrc_state 仍 = <b>IDLE</b></div>'+
      '<h3>⑤ 诚实点：这只是「能上网的资格」，不是「已上网」</h3>'+
      '<p>驻网拿到的是<b>广播信息与接入资格</b>，没有任何专属资源。要真正传数据，还需：<b>Stage 7</b> 用这里的 rach-ConfigCommon 发 PRACH（拿临时身份与 TA），<b>Stage 8</b> 完成 RRC 建立与安全激活（拿 C-RNTI、进入 CONNECTED）。NAS 层的 PDU 会话更在其后（已越过 L1/L2 接入边界，属后续独立项目）。</p>',
      ['[RRC] 集齐驻留判决输入：PLMN 列表 / cellBarred / q-RxLevMin。',
       '[RRC] 关① PLMN：USIM=46001 ∈ 小区 PLMN 列表 → 匹配。',
       '[RRC] 关② cellBarred = notBarred → 允许驻留。',
       '[RRC] 关③ S 准则：Srxlev = −75 −(−110) = +35 dB > 0 → 小区合适。',
       '[SUCCESS] 🚩 驻网（camping）完成。RRC 状态保持 IDLE，等待 Stage 7 发起接入。']
    ),

  ]};
  /* ════════════════════════════════════════════════════════════════════
     STAGE 7 · PRACH 随机接入  (5 sub-steps: 0..4)  ★ 完整
     配色：红 #dc2626（上行/PRACH 主色）/ 深红 #991b1b（锁定高光）/ 浅红 #fee2e2
          下行青 #0891b2（Msg2 RAR 方向，回指 S1 SSB）/ 钥匙琥珀 #d97706（RA-RNTI/TA）
          答案绿 #059669（preamble 命中 / RAR 匹配 / 对齐）/ 对照灰 #94a3b8
     上游消费：rach_config（prachConfigIndex=16/rootSequenceIndex=1/zcz=8/msg1FDM=1/
          msg1FrequencyStart=0/preambleRecvTargetPower=−110/raResponseWindow=sl20/
          preambleTransMax=10/powerRampingStep=2）；rrc_state='IDLE'(camped)；scs=30k(μ=1)；
          coreset0_*（RAR 的 PDCCH 在 CORESET#0 监听，复用 S5）。
     ════════════════════════════════════════════════════════════════════ */
  var S7 = { subSteps: [

    /* ── S7.0 理论黑板：随机接入要解决什么 + 4 步 CBRA ───────────── */
    discuss(
      'PRACH 随机接入：UE 第一次「开口」说话',
      '驻网（Stage 6）后，UE 把下行听得一清二楚，但 <b>gNB 还不知道你的存在</b>，而且 <b>上行完全不同步</b>——远近不同的 UE 信号到达 gNB 的时刻互相错位。随机接入一次解决两件事：拿到<b>上行定时提前量 TA</b> + 一个<b>临时身份 TC-RNTI</b>。本 Stage 走 4 步竞争式接入（CBRA）的前两步：<b style="color:#dc2626">Msg1（发 preamble）</b> 与 <b style="color:#0891b2">Msg2（收 RAR）</b>；Msg3/Msg4 的竞争解决留给 Stage 8。',
      '随机接入要解决什么 & 4 步 CBRA（TS 38.321 §5.1 / 38.211 §6.3.3）',
      '<h3>① 两个「非解决不可」的问题</h3>'+
      '<table><tr><th>问题</th><th>为什么</th><th>RACH 给的答案</th></tr>'+
      '<tr><td><b>gNB 不知道你存在</b></td><td>下行是广播，谁都能听；但 gNB 没给你分配过任何上行资源</td><td>发一个上行「举手」信号 → 换回临时身份 + 上行授权</td></tr>'+
      '<tr><td><b>上行不同步</b></td><td>UE 离 gNB 有远有近，传播时延不同；各自按自己的下行定时发上行，到 gNB 处必然错位、互相打架</td><td>gNB 测出你的时延 → 下发 <b>TA</b>，你<b>提前发</b>，信号正好对齐 gNB 时隙边界</td></tr></table>'+
      '<p>下行同步（Stage 1~6）只需「听」，是<b>单向</b>的；上行接入是 UE 第一次<b>主动发</b>，必须先把这两件事谈妥，否则上行一团乱。</p>'+
      '<h3>② 4 步竞争式接入（CBRA）—— 本 Stage 走前两步</h3>'+
      '<table><tr><th>消息</th><th>方向</th><th>内容</th><th>归属</th></tr>'+
      '<tr><td><b>Msg1</b></td><td><b style="color:#dc2626">UE → gNB（上行）</b></td><td>Preamble（从 64 个里随机抓 1 个）</td><td><b>Stage 7</b></td></tr>'+
      '<tr><td><b>Msg2</b></td><td><b style="color:#0891b2">gNB → UE（下行）</b></td><td>RAR：TA 命令 + TC-RNTI + Msg3 的上行授权</td><td><b>Stage 7</b></td></tr>'+
      '<tr><td>Msg3</td><td style="color:#94a3b8">UE → gNB（上行）</td><td>RRCSetupRequest（PUSCH，带自己的身份标识）</td><td>Stage 8</td></tr>'+
      '<tr><td>Msg4</td><td style="color:#94a3b8">gNB → UE（下行）</td><td>竞争解决 + RRCSetup</td><td>Stage 8</td></tr></table>'+
      '<h3>③ 「鸡生蛋」诚实点：为什么会有「竞争」</h3>'+
      '<p>UE 接入前<b>没有任何唯一身份</b>（C-RNTI 是接入成功才发的）。它只能从小区广播的 <b>64 个 preamble</b> 里<b>随机抓一个</b>当临时签名。两个 UE 同一时机抓到同一个 preamble 的概率不为零——它们会收到<b>同一个 RAR</b>、在 Msg3 上撞车。<b>竞争解决（Stage 8 的 Msg4）</b>就是用来裁决「这个临时身份到底归谁」的。这正是「竞争式（Contention-Based）」名字的由来。</p>'+
      '<table><tr><th>类型</th><th>preamble 怎么来</th><th>场景</th></tr>'+
      '<tr><td><b>CBRA</b>（本例）</td><td>UE 从公共集合随机选</td><td>初始接入 / 失步恢复</td></tr>'+
      '<tr><td>CFRA（无竞争）</td><td>gNB <b>专门指定</b>一个 preamble 给你</td><td>切换 / 下行到达需快速上行（无 Msg3/4 竞争）</td></tr></table>'+
      '<p style="font-size:12px;color:#64748b;"><b>方向色例</b>：本 Stage 用<b style="color:#dc2626">红=上行（UE 发）</b>、<b style="color:#0891b2">青=下行（gNB 发）</b>，把这场一来一回的对话看清楚。RAR 走的还是 Stage 5 建好的下行机器（CORESET#0 / PDCCH），只把 RNTI 从 SI-RNTI 换成 <b>RA-RNTI</b>。</p>',
      ['[MAC] 驻网完成（RRC_IDLE）。MAC 随机接入状态机初始化。',
       '[MAC] 读取 rach-ConfigCommon：prachCfgIdx=16 / rootSeqIdx=1 / ZCZ=8 / RAR窗=sl20。',
       '[MAC] 选定 4-Step CBRA（竞争式随机接入）。']
    ),

    /* ── S7.1 Preamble 生成：ZC 根序列 → 循环移位 → 64 签名 ─────── */
    sim(
      'Preamble 生成：1 根 ZC 序列 → 循环移位 → 64 个签名',
      '小区不会逐个给 UE 发 preamble，而是给一个<b>生成配方</b>。<b>① 根序列</b>：从 prach-RootSequenceIndex=1 取一条 Zadoff-Chu（ZC）序列。<b>② 循环移位</b>：按 zeroCorrelationZoneConfig=8 算出 N_CS=46，每根序列循环移位切出 ⌊839/46⌋=18 个 preamble。<b>③ 凑够 64</b>：18 不够 64，再取后续 3 根 → 4 根 × 18 = 72 ≥ 64。点 <b>▶ 生成</b> 看配方展开，最后 UE <b>随机抓 1 个</b>（本例 #27）。',
      'Zadoff-Chu 序列与循环移位（TS 38.211 §6.3.3.1）',
      '<h3>① 为什么是 Zadoff-Chu（ZC）？</h3>'+
      '<p>长格式 preamble 用长度 <b>L_RA=839</b> 的 ZC 序列：</p>'+
      '<div class="formula">x_u(n) = exp( −jπ·u·n(n+1) / 839 )，n = 0…838</div>'+
      '<p>ZC 是 <b>CAZAC</b>（恒包络、零自相关）序列，两条核心性质恰好是 PRACH 要的：</p>'+
      '<ul><li><b>恒包络</b>：每个采样幅度都一样 → 功放可满功率推、峰均比极低，上行覆盖最大化。</li>'+
      '<li><b>理想自相关（一根尖峰）</b>：移位后与自身几乎不相关 → gNB 用一次相关就能①<b>检测</b>到哪个 preamble、②<b>读出尖峰位置 = 传播时延</b>，直接换算 TA。<b>「检测」和「测时延」是同一次相关的两个副产品</b>，这是 ZC 被选中的根本原因。</li></ul>'+
      '<h3>② 一根序列怎么变出 18 个 preamble</h3>'+
      '<p>对同一根 ZC 做<b>循环移位</b>，每个移位量是 N_CS 的整数倍，就得到一个新 preamble。N_CS 来自 zeroCorrelationZoneConfig 查表（L_RA=839 非受限集）：</p>'+
      '<div class="formula">zeroCorrelationZoneConfig = 8 → N_CS = 46　→　每根可切 ⌊839 / 46⌋ = <b>18</b> 个</div>'+
      '<p>N_CS 必须 ≥ 小区最大往返时延对应的样点数——<b>保护移位</b>，让不同 preamble 即使有时延也不会相互混淆。小区越大 → N_CS 越大 → 每根出的 preamble 越少 → 需要越多根。</p>'+
      '<h3>③ 凑够 64 = 取连续多根</h3>'+
      '<p>协议要求每小区<b>恰好 64 个 preamble</b>。18 不够，就从 rootSequenceIndex 指定的逻辑根开始，<b>连取 4 根</b>（逻辑根→物理根有一张固定置换表）：4 × 18 = 72，取前 64 个用。</p>'+
      '<table><tr><th>preamble #</th><th>用哪根</th><th>循环移位</th></tr>'+
      '<tr><td>0…17</td><td>第 1 根</td><td>0, 46, 92, … 782</td></tr>'+
      '<tr><td>18…35</td><td>第 2 根</td><td>0, 46, …</td></tr>'+
      '<tr><td>…</td><td>第 3/4 根</td><td>…</td></tr></table>'+
      '<h3>④ UE 随机抓一个</h3>'+
      '<p>UE 从 64 个里<b>等概率随机</b>挑一个（本例 <b>#27</b> = 第 2 根 × 第 9 个移位）。这一「随机」就是后面可能撞车、需要竞争解决的根源（见 S7.0 鸡生蛋）。<em>诚实点：这里画 839 点不现实，圆环上的点是示意；真实序列 839 个采样恒幅、相位按二次曲线爬升。</em></p>',
      ['[PHY] 取 ZC 根序列：rootSequenceIndex = 1（逻辑根 → 物理根置换）。',
       '[DSP] zeroCorrelationZoneConfig = 8 → N_CS = 46 → 每根 18 个 preamble。',
       '[DSP] 连取 4 根 ZC → 4 × 18 = 72，构成 64 个 preamble 集合。',
       '[MAC] UE 随机选中 preamble #27（第 2 根 · 循环移位 9）。']
    ),

    /* ── S7.2 Msg1 发射：长 CP + RA-RNTI ─────────────────────────── */
    sim(
      'Msg1 · 发射 Preamble：长 CP 吸收「还不知道的」往返时延',
      'UE 在 prach-ConfigIndex=16 查表定下的 <b>PRACH 时机（RO）</b>上发射选中的 preamble。<b>关键诚实点</b>：此刻<b>还没有 TA</b>，UE 只能按下行定时盲发——信号到 gNB 时已经迟了一个往返时延。所以 PRACH 格式自带<b>超长 CP + 保护时间（GT）</b>，把这段「还不知道有多少」的时延整个吞进去。点 <b>▶ 发射</b> 看 CP/SEQ/GT 结构铺开、传播时延拉出，并算出监听 RAR 要用的钥匙 <b style="color:#d97706">RA-RNTI</b>。',
      'PRACH 时机、长格式与 RA-RNTI（TS 38.211 §6.3.3.2 / 38.321 §5.1.3）',
      '<h3>① PRACH 时机（RO）：在哪发</h3>'+
      '<p><b>prach-ConfigIndex=16</b> 查 TS 38.211 表（FR1）→ 定<b>preamble 格式</b>与<b>时机的子帧/符号图样</b>；<b>msg1-FDM=1 / msg1-FrequencyStart=0</b> 定频域只有 1 个 RO、起点贴 Point A。本例以<b>长格式 format 0</b>（L_RA=839, Δf=1.25kHz）作讲解样本。<em>诚实点：短格式 A1~C2（L_RA=139）在 FR1 TDD 小蜂窝更常见；具体格式以你的配置表为准，本屏的 CP/GT/ZC 讲解按 format 0。</em></p>'+
      '<h3>② 长 CP / 保护时间：为「还没拿到的 TA」兜底</h3>'+
      '<p>普通数据信道的 UE 已经对齐了上行（有 TA），CP 只需抵抗多径（几 μs）。但 PRACH 是 UE <b>第一次发、尚无 TA</b>，发射时刻误差 = 整个往返传播时延，可达几十 μs。format 0 用一个超长 CP + 保护时间把它吞掉：</p>'+
      '<table><tr><th>段</th><th>时长</th><th>作用</th></tr>'+
      '<tr><td>循环前缀 CP</td><td>≈ 103 μs</td><td>吸收往返时延 + 多径</td></tr>'+
      '<tr><td>ZC 序列</td><td>= 800 μs</td><td>839 点 @ 1.25kHz</td></tr>'+
      '<tr><td>保护时间 GT</td><td>≈ 97 μs</td><td>防串到下一时机</td></tr></table>'+
      '<div class="formula">最大小区半径 ≈ c × GT / 2 ≈ 3×10⁸ × 97μs / 2 ≈ <b>14.5 km</b></div>'+
      '<p>CP/GT 越长 → 能覆盖的小区越大，但开销也越大。格式选择就是「覆盖 vs 开销」的权衡。</p>'+
      '<h3>③ 开环功控：发多大功率</h3>'+
      '<div class="formula">P_PRACH = min( P_max , preambleReceivedTargetPower + PL )</div>'+
      '<p>UE 用下行 RSRP 反推路损 PL，再加上小区下发的目标接收功率。本例 PL = 12 −(−75) = 87 dB，目标 −110 dBm → P_PRACH = <b>−23 dBm</b>。若等不到 RAR，下次按 <b>powerRampingStep=2 dB</b> 加大重发，最多 <b>preambleTransMax=10</b> 次。</p>'+
      '<h3>④ RA-RNTI：监听 RAR 的钥匙（由「发射时机」算出）</h3>'+
      '<p>UE 不需要 gNB 告诉它用什么 RNTI 收 RAR——RA-RNTI 完全由 preamble 发射的<b>时频位置</b>唯一确定，收发两端各自算、必然一致：</p>'+
      '<div class="formula">RA-RNTI = 1 + s_id + 14·t_id + 14·80·f_id + 14·80·8·ul_carrier</div>'+
      '<table><tr><th>量</th><th>本例</th><th>含义</th></tr>'+
      '<tr><td>s_id</td><td>0</td><td>RO 首个 OFDM 符号</td></tr>'+
      '<tr><td>t_id</td><td>4</td><td>RO 所在时隙（系帧内）</td></tr>'+
      '<tr><td>f_id</td><td>0</td><td>频域 RO 索引（msg1-FDM=1 → 只有 0）</td></tr>'+
      '<tr><td>ul_carrier</td><td>0</td><td>普通上行（非 SUL）</td></tr>'+
      '<tr><td><b>RA-RNTI</b></td><td><b>57</b></td><td>= 1 + 0 + 14×4</td></tr></table>'+
      '<p style="margin-top:6px;padding:7px 9px;background:#fff7ed;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#475569;"><b style="color:#b45309;">🛠 极客提示·公式里的常数从哪来</b>：<b>14</b>=一个时隙的 OFDM 符号数（s_id 取 0…13）；<b>80</b>=一个 10 ms 系统帧内的<b>最大</b>时隙数（@120kHz SCS, μ=3，t_id 取 0…79，与本小区实际 μ=1 无关，常数取最坏情况硬编码）；<b>8</b>=频域 PRACH 时机的最大个数（msg1-FDM∈{1,2,4,8}，f_id 取 0…7）。三个常数把 (符号, 时隙, 频点, 上行载波) 拼成一个<b>位置哈希</b>——3GPP 这样设计，是为了在数学上保证：同一 10 ms 帧内、任何时频位置发出的 preamble，算出的 RA-RNTI <b>全局唯一、绝不撞车</b>。</p>'+
      '<p>下一屏 UE 就用 <b>RA-RNTI=57</b> 去 CORESET#0 里捞自己的 RAR。</p>',
      ['[PHY] prach-ConfigIndex=16 → PRACH 时机（RO）确定，长格式 format 0。',
       '[RF] 开环功控：PL=87dB，P_PRACH = −110 + 87 = −23 dBm。',
       '[PHY] 发射 preamble #27（无 TA，靠长 CP/GT 吸收往返时延）。',
       '[MAC] 由发射时机算 RA-RNTI = 1 + 0 + 14×4 = 57 → 用于监听 RAR。']
    ),

    /* ── S7.3 Msg2 RAR：复用 S5 下行机器，捞回 TA + 临时身份 ─────── */
    sim(
      'Msg2 · 收 RAR：复用 S5 的下行机器，捞回 TA + 临时身份',
      'gNB 检测到 preamble、测出时延后，下发 <b>随机接入响应（RAR）</b>。UE 在 <b>ra-ResponseWindow=sl20（10 ms）</b>内，去 <b>CORESET#0</b> 监听用 <b style="color:#d97706">RA-RNTI=57</b> 加扰的 PDCCH——<b>这台下行机器正是 Stage 5 建好的</b>，只把 RNTI 从 SI-RNTI 换成 RA-RNTI。命中后解出 RAR 的三件套：<b>① TA 命令</b>、<b>② TC-RNTI（临时身份）</b>、<b>③ Msg3 的上行授权</b>；其中 <b>RAPID</b> 必须等于你发的 preamble #27 才算「这是给我的」。点 <b>▶ 接收</b> 逐步揭示。',
      'RAR 内容与 RA-RNTI 监听（TS 38.321 §5.1.4 / 38.213 §8.2）',
      '<h3>① 在哪、用什么钥匙收</h3>'+
      '<p>发完 Msg1，UE 启动 <b>ra-ResponseWindow</b>（本例 sl20 = 20 时隙 @ 30kHz = <b>10 ms</b>）。窗内每个 PDCCH 时机都去 <b>CORESET#0</b> 盲检 <b>RA-RNTI=57</b> 加扰的 <b>DCI 1_0</b>，命中即指向承载 RAR 的 PDSCH。<b>整条下行链路（CORESET#0 盲检 → DCI → PDSCH）就是 Stage 5/6 那一套，零新增机器，只换 RNTI。</b>窗内没等到 → 回 S7.2 功率爬升重发。</p>'+
      '<p style="margin-top:6px;padding:7px 9px;background:#fef2f2;border-left:3px solid #dc2626;border-radius:4px;font-size:12px;color:#475569;"><b style="color:#991b1b;">⚠ 起跑线陷阱（新手必踩）</b>：窗口<b>不是</b>在 preamble 发完那一瞬间启动的。协议规定它起算于 Msg1 结束后<b>至少 1 个符号</b>之处的<b>第一个 PDCCH 监测时机</b>。而真正让 RAR 落在窗口中段（本例 slot 7 才命中、而非 slot 0）的，是 gNB 收完 preamble 后<b>实打实的处理时延</b>——FFT、相关峰搜索、定时测量、组 RAR，都要时间。所以 UE 收完 Msg1 不能傻等第 0 个时机就放弃，要把整个窗熬完。</p>'+
      '<h3>② RAR 里有什么（MAC 子 PDU）</h3>'+
      '<table><tr><th>字段</th><th>本例</th><th>用途</th></tr>'+
      '<tr><td><b>RAPID</b></td><td>27</td><td>回显「我收到的是哪个 preamble」→ 必须 = 你发的 #27，否则不是给你的</td></tr>'+
      '<tr><td><b>Timing Advance Command</b></td><td>T_A = 50</td><td>12 bit；→ 算出 TA（下屏对齐用）</td></tr>'+
      '<tr><td><b>TC-RNTI</b></td><td>0x4601</td><td>临时 C-RNTI；Msg3/4 期间的临时身份</td></tr>'+
      '<tr><td><b>UL Grant</b></td><td>—</td><td>Msg3（PUSCH）的上行调度，留给 Stage 8</td></tr></table>'+
      '<p style="margin-top:5px;font-size:12px;color:#64748b;"><b style="color:#b45309;">📦 锦上添花·退避指示 (BI)</b>：除上述三件套外，RAR 的 MAC 头部还可能带一个 <b>Backoff Indicator</b>。网络拥塞（海量 UE 同时抢接入）时，gNB 借它命令接入失败的 UE <b>随机退避一段时间</b>（如 0…20 ms）再重发 Msg1，把重试散开，防止信道雪崩。本例无拥塞，BI=0。</p>'+
      '<h3>③ TA 命令怎么变成时间</h3>'+
      '<p>RAR 里的 TA 命令是 12 bit 的 T_A（初始范围 0…3846）。换算成定时提前量（μ=1）：</p>'+
      '<div class="formula">N_TA = T_A × 16 × 64 / 2^μ × T_c　→　T_A=50 → 25600·T_c ≈ <b>13.02 μs</b></div>'+
      '<p>每一档 T_A 对应 16×64/2^μ = 512·T_c ≈ <b>0.26 μs</b> 的步长（正是 Stage 0 给过的 TA 分辨率）。13.02 μs 折合单程约 1.95 km——gNB 是从 preamble 尖峰位置量出来的。</p>'+
      '<h3>④ 还差最后一步：把 TA 用上</h3>'+
      '<p>现在 UE 拿到了「该提前多少」，但还没真正对齐上行。下一屏把 TA 应用上去，让上行信号到 gNB 时正好压在时隙边界，并把 <b>TC-RNTI / TA / UL Grant</b> 打包交付 Stage 8。<em>注意：TC-RNTI 还只是「临时」——竞争解决（Stage 8）通过后才升格为 C-RNTI。</em></p>',
      ['[MAC] 启动 ra-ResponseWindow = sl20（10 ms）。',
       '[PHY] CORESET#0 盲检 RA-RNTI=57 加扰的 PDCCH（复用 Stage 5 机器）→ 命中。',
       '[MAC] 解 RAR：RAPID=27 ✓（= 发出的 preamble，是给我的）。',
       '[DATA] TA 命令 T_A=50 → N_TA=25600·Tc ≈ 13.02 μs；TC-RNTI=0x4601；含 Msg3 UL Grant。']
    ),

    /* ── S7.4 TA 对齐 + 交付 Stage 8（里程碑：上行接通）──────────── */
    sim(
      'TA 对齐：上行「提前发」到 gNB 正好对齐 + 交付 Stage 8',
      '把 RAR 里的 TA 用上：UE 让上行发射时刻<b>整体提前 N_TA ≈ 13.02 μs</b>，抵消往返传播时延——信号到 gNB 处恰好压在时隙边界，不再和别的 UE 错位打架。点 <b>▶ 对齐</b> 看「未对齐（迟到）→ 提前 N_TA → 对齐 ✓」。这是上行<b>第一次接通</b>的里程碑。完成后把 <b>TC-RNTI / TA / UL Grant</b> 交付 Stage 8。<em>诚实点：拿到的是<b>临时</b>身份，竞争还没解决，RRC 仍是 IDLE——C-RNTI 要等 Stage 8。</em>',
      '上行定时提前与交付 Stage 8（TS 38.213 §4.2 / 38.321 §5.4）',
      '<h3>① 为什么要「提前发」</h3>'+
      '<p>UE 按自己收到的<b>下行</b>定时去发上行，但信号要飞过传播时延才到 gNB——天然<b>迟到</b>一个单程时延。若所有 UE 都这么发，远近 UE 的信号在 gNB 处会错开、互相串扰。解法：让每个 UE <b>提前</b> N_TA 发射，N_TA ≈ 一个<b>往返</b>时延，到 gNB 时正好对齐统一的时隙边界。</p>'+
      '<div class="formula">上行发射时刻 = 下行接收定时 − N_TA·T_c　（N_TA = T_A × 512，μ=1）</div>'+
      '<h3>② 本例数字</h3>'+
      '<table><tr><th>量</th><th>值</th></tr>'+
      '<tr><td>T_A（RAR 命令）</td><td>50</td></tr>'+
      '<tr><td>N_TA</td><td>25600 · T_c</td></tr>'+
      '<tr><td>提前量（时间）</td><td>≈ 13.02 μs</td></tr>'+
      '<tr><td>对应单程距离</td><td>≈ 1.95 km</td></tr></table>'+
      '<p style="font-size:12px;color:#64748b;"><b>极客点</b>：最大可表示的 TA ↔ 最大小区半径；这也是 PRACH 长格式 CP/GT 要足够长（S7.2 的 14.5 km）的另一面——两边都得能覆盖同样大的小区。</p>'+
      '<h3>③ 交付 Stage 8 的弹药</h3>'+
      '<table><tr><th>交付物</th><th>本例</th><th>Stage 8 用途</th></tr>'+
      '<tr><td><b>TC-RNTI</b></td><td>0x4601</td><td>Msg3/Msg4 临时身份；竞争解决通过后升格 C-RNTI</td></tr>'+
      '<tr><td><b>TA（已应用）</b></td><td>13.02 μs</td><td>上行已对齐，可发 PUSCH</td></tr>'+
      '<tr><td><b>UL Grant</b></td><td>—</td><td>Msg3（RRCSetupRequest）的上行调度</td></tr></table>'+
      '<h3>④ 诚实点：上行接通 ≠ 已连接</h3>'+
      '<p>竞争<b>还没解决</b>：可能有别的 UE 也抓了 #27、也收了这同一个 RAR，正准备和你抢同一个 TC-RNTI。要等 <b>Stage 8</b> 的 Msg3（带你的唯一标识）+ Msg4（竞争解决）裁出胜者，TC-RNTI 才升格为 <b>C-RNTI</b>，RRC 进入 <b>CONNECTED</b>。此刻状态栏仍写 <b>RRC_IDLE</b>，顶栏 C-RNTI 仍灰着——这是 Stage 8 才点亮的。</p>',
      ['[PHY] 应用 TA：上行发射时刻提前 N_TA = 25600·Tc ≈ 13.02 μs。',
       '[OK] 上行定时对齐 gNB 时隙边界 → 上行链路首次接通。',
       '[MAC] 交付 Stage 8：TC-RNTI=0x4601 / TA(已应用) / Msg3 UL Grant。',
       '[WARN] 竞争尚未解决，仍为临时身份；RRC 保持 IDLE，C-RNTI 待 Stage 8。']
    ),

  ]};
  /* ════════════════════════════════════════════════════════════════════
     STAGE 8 · RRC 建立 & 安全  (S8.0~S8.4，5 子步)  ★ 完整
     配色：主色 teal #0d9488 / 答案绿 #16a34a / 安全金 #d97706 / 高光红 #dc2626 / 对照灰
     上游消费：tc_rnti=0x4601、ta_ns=13021(已应用)、preamble_idx=27、rach_config、
              rrc_state='IDLE'(camped)，以及 pci/coreset0_*（Msg4 在 CORESET#0 监听，复用 S5/S6）
     ════════════════════════════════════════════════════════════════════ */
  var S8 = { subSteps: [

    /* ── S8.0 理论黑板 ──────────────────────────────────────── */
    discuss(
      'RRC 建立要解决什么：竞争解决 → 建连 → 激活安全',
      '承 Stage 7：UE 已拿到 <b>TC-RNTI（临时身份）</b>、上行已用 TA 对齐，但<b>竞争还没解决</b>、RRC 仍 <b>IDLE</b>、信令还在<b>明文裸奔</b>。本阶段补完 4 步 CBRA 的后两步：<b style="color:#0d9488">Msg3（RRCSetupRequest）</b>把唯一身份当「指纹」发出去，<b style="color:#16a34a">Msg4（竞争解决 + RRCSetup）</b>由 gNB 点名胜者、把 TC-RNTI 升格为 <b>C-RNTI</b> 并建立 <b>SRB1</b>，UE 进入 <b>RRC_CONNECTED</b>；随后激活 <b style="color:#d97706">AS 安全</b>（完整性 + 加密）。',
      'CBRA 后两步、RRC 连接与 AS 安全（TS 38.331 §5.3 / 38.321 §5.1.5 / 33.501 §6.2）',
      '<h3>① 两件「非解决不可」的事</h3>'+
      '<p><b>竞争解决</b>：接入前 UE 在本小区没有任何网络分配的身份，只能从 64 个 preamble 里随机抓一个当签名。两个 UE 抓到同一个 → 收到同一个 RAR → 抢同一个 TC-RNTI。必须有个机制裁出唯一胜者。</p>'+
      '<p><b>建连 + 安全</b>：还只是临时身份、没有可靠信令承载（SRB1）、没有任何完整性/加密保护。要把这三样都补齐，才算真正「连上」。</p>'+
      '<h3>② 4 步 CBRA 全景（本阶段点亮后两步）</h3>'+
      '<table><tr><th>消息</th><th>方向</th><th>内容</th><th>承载</th></tr>'+
      '<tr><td>Msg1</td><td>UE→gNB</td><td>Preamble（随机）</td><td>PRACH（S7）</td></tr>'+
      '<tr><td>Msg2</td><td>gNB→UE</td><td>RAR：TA + TC-RNTI + UL Grant</td><td>PDSCH（S7）</td></tr>'+
      '<tr><td><b>Msg3</b></td><td>UE→gNB</td><td><b>RRCSetupRequest（带唯一身份）</b></td><td><b>SRB0 / 上行 CCCH</b></td></tr>'+
      '<tr><td><b>Msg4</b></td><td>gNB→UE</td><td><b>竞争解决标识 + RRCSetup</b></td><td><b>SRB0 / 下行 CCCH</b></td></tr></table>'+
      '<h3>③ 信令承载（SRB）一路升级</h3>'+
      '<p>身份/承载/保护是渐进点亮的：</p>'+
      '<ul><li><b>SRB0 / CCCH</b>（Msg3·Msg4）：RLC <b>TM</b>，不分段、<b>无安全</b>，加扰 TC-RNTI。</li>'+
      '<li><b>SRB1 / DCCH</b>（Msg5 起）：RLC <b>AM</b>，可靠重传，加扰 C-RNTI。</li>'+
      '<li><b>+ AS 安全</b>（SMC 之后）：完整性（强制）+ 加密（可选）覆盖所有信令/数据。</li></ul>'+
      '<h3>④ 安全：一把根密钥长出整棵树</h3>'+
      '<div class="formula">K<sub>gNB</sub> → { K<sub>RRCint</sub>, K<sub>RRCenc</sub>, K<sub>UPenc</sub> }（KDF 派生）</div>'+
      '<p>完整性保护防篡改/重放（强制开启），加密防窃听（可选，NEA0 空算法允许）。</p>'+
      '<p style="margin-top:6px;padding:7px 9px;background:#f1f5f9;border-left:3px solid #94a3b8;border-radius:4px;font-size:12px;color:#475569;"><b>⚠ 时序诚实点</b>：严格的 3GPP 流程里，<b>安全激活并不和「RRC 建立」同步</b>。真实顺序是 Msg4 进 CONNECTED → 发 <b>RRCSetupComplete（携 NAS 注册请求）</b> → AMF 完成 <b>NAS 鉴权</b>并把 <b>K<sub>gNB</sub></b> 下发 gNB → 才触发 SecurityModeCommand。也就是 <b>SMC 发生在 CONNECTED 之后</b>，而产生 K<sub>gNB</sub> 的 NAS 鉴权属<b>后续独立项目</b>。本阶段在 RRC/AS 层展示安全机制本身。</p>',
      ['[RRC] RRC 连接建立流程激活：竞争解决 → 建连 → 安全。',
       '[MAC] 承 Stage 7：TC-RNTI（临时）+ 上行已对齐，竞争未决，仍 RRC_IDLE。']
    ),

    /* ── S8.1 Msg3：RRCSetupRequest ───────────────────────────── */
    sim(
      'Msg3 · RRCSetupRequest：第一条 RRC 消息，塞进「唯一身份」当竞争武器',
      'UE 用 Stage 7 给的 <b>UL Grant</b> 在 <b>PUSCH</b> 上发 Msg3——第一条 RRC 消息 <b>RRCSetupRequest</b>，走 <b>SRB0 / 上行 CCCH</b>（明文，无安全），加扰 <b style="color:#dc2626">TC-RNTI=0x4601</b>。它最关键的内容是 <b>ue-Identity</b>（39-bit 随机值或 5G-S-TMSI-Part1）——这条 48-bit 的 CCCH SDU 就是你的「指纹」，gNB 会在 Msg4 原样回显。点 <b>▶ 发射 Msg3</b> 逐步揭示。',
      'RRCSetupRequest 与竞争指纹（TS 38.331 §5.3.3 / 38.321 §5.1.5）',
      '<h3>① 在哪发、走哪条信道</h3>'+
      '<p>用 RAR 里的 <b>UL Grant</b> 在 <b>PUSCH</b> 发射；逻辑信道是 <b>上行 CCCH</b>、信令承载是 <b>SRB0</b>。SRB0 用 <b>RLC TM</b>（透明模式）：不分段、不重传、<b>无完整性、无加密</b>——因为此刻安全还没建立。</p>'+
      '<h3>② RRCSetupRequest 里有什么</h3>'+
      '<table><tr><th>字段</th><th>本例</th><th>用途</th></tr>'+
      '<tr><td><b>CHOICE 路由头</b></td><td>4 bit（1+2+1）</td><td>UPER 选择位：消息类型 + ue-Identity 选择</td></tr>'+
      '<tr><td><b>ue-Identity</b></td><td>39-bit 随机值</td><td>唯一身份；无 5G-S-TMSI 时用随机数占位</td></tr>'+
      '<tr><td>establishmentCause</td><td>mo-Signalling 等</td><td>接入原因（鉴权/调度参考）</td></tr>'+
      '<tr><td>spare</td><td>1 bit</td><td>保留对齐</td></tr></table>'+
      '<p>UPER 逐位预算：<b>4（路由头）+ 39 + 4 + 1 = 48 bit（6 字节）</b>，严丝合缝填满固定 CCCH SDU。这 4 个路由比特正是 Stage 6 讲的 UPER 无标签编码——CHOICE 类型靠「选择位 + 位置」省着编：1 bit 选 c1/扩展、2 bit 在 4 种 c1 消息里选 rrcSetupRequest、1 bit 选 ue-Identity 是随机值还是 5G-S-TMSI。</p>'+
      '<h3>③ 这 48 bit = 竞争解决的「指纹」</h3>'+
      '<p>gNB 收到后，会把这 <b>48 bit 原样塞进 Msg4</b> 的 <b>UE Contention Resolution Identity MAC CE</b> 回显。谁的指纹被回显，谁就是这次竞争的胜者（下一屏判决）。</p>'+
      '<p style="margin-top:6px;padding:7px 9px;background:#fef2f2;border-left:3px solid #dc2626;border-radius:4px;font-size:12px;color:#475569;"><b style="color:#991b1b;">🥚 鸡生蛋</b>：唯一身份是 UE「自己造的随机值」，不是网络发的——因为接入前网络还不认识它。39-bit 随机数撞车概率极低（约 5500 亿分之一）但<b>并非零</b>；一旦撞了，就靠竞争解决兜底。若网络此前已知道该 UE（有 5G-S-TMSI），可用它代替纯随机值，进一步降低撞车概率。</p>',
      ['[MAC] 用 RAR 的 UL Grant 在 PUSCH 发 Msg3（SRB0 / 上行 CCCH）。',
       '[RRC] 组 RRCSetupRequest：ue-Identity=39bit 随机值 + establishmentCause。',
       '[MAC] CCCH SDU 共 48bit（6 字节）= 竞争指纹；加扰 TC-RNTI=0x4601（明文，无安全）。']
    ),

    /* ── S8.2 Msg4：竞争解决 + RRCSetup ───────────────────────── */
    sim(
      'Msg4 · 竞争解决 + RRCSetup：gNB 点名胜者，TC-RNTI 升格 C-RNTI',
      'gNB 在 <b>CORESET#0</b> 用 <b>TC-RNTI</b> 加扰 PDCCH 下发 Msg4（<b>零新增机器，复用 Stage 5/6 那套下行链路</b>），内含 <b>① Contention Resolution Identity（回显你的 48-bit 指纹）</b> + <b style="color:#16a34a">② RRCSetup（建 SRB1 的配置）</b>。UE 比对回显是否 = 自己发的指纹：匹配 ✓ → 竞争解决成功、<b>TC-RNTI 升格为 C-RNTI</b>（值不变 0x4601）、应用 RRCSetup → 进入 <b>RRC_CONNECTED</b>；不匹配的 UE 则退避重来。点 <b>▶ 接收 Msg4</b> 逐步揭示。',
      '竞争解决与 TC-RNTI→C-RNTI 升格（TS 38.321 §5.1.5 / 38.331 §5.3.3）',
      '<h3>① 在哪收、用什么钥匙</h3>'+
      '<p>在 <b>CORESET#0</b> 盲检 <b>TC-RNTI 加扰</b>的 DCII 1_0 → 指向承载 Msg4 的 PDSCH。<b>这条下行链路（CORESET#0 盲检 → DCI → PDSCH）就是 Stage 5/6 建好的机器，零新增</b>，只是加扰 RNTI 用 TC-RNTI。竞争还没裁完，所以<b>还不能</b>先认 C-RNTI。</p>'+
      '<h3>② Msg4 的两件内容</h3>'+
      '<table><tr><th>内容</th><th>作用</th></tr>'+
      '<tr><td><b>Contention Resolution Identity MAC CE</b></td><td>回显 Msg3 CCCH SDU 的前 <b>48 bit</b>（6 字节）→ 竞争解决判据</td></tr>'+
      '<tr><td><b>RRCSetup</b></td><td>radioBearerConfig（配 <b>SRB1</b>）+ masterCellGroup（MAC/PHY 参数）</td></tr></table>'+
      '<h3>③ 判决：指纹匹配吗</h3>'+
      '<p>UE 比对 Msg4 回显的 48 bit 是否 = 自己 Msg3 发出的 CCCH SDU：</p>'+
      '<ul><li><b style="color:#16a34a">匹配 ✓</b>：竞争解决成功 → 停止重发 → 应用 RRCSetup → 进入 RRC_CONNECTED。</li>'+
      '<li><b style="color:#dc2626">不匹配 ✗</b>：别的 UE 赢了 → 本 UE 退避，回 Stage 7 重抢 preamble。</li></ul>'+
      '<h3>④ 为什么是「值不变的升格」</h3>'+
      '<div class="formula">竞争解决成功 → C-RNTI := TC-RNTI 的值（0x4601）</div>'+
      '<p>协议（38.321 §5.1.5）规定：对 RRCSetupRequest 触发的竞争式接入，竞争解决成功后直接把 <b>C-RNTI 设为 TC-RNTI 的值</b>——同一个 0x4601，从「临时」升级为小区内的「永久」身份。此刻 RRC 已进入 <b>CONNECTED</b>，但 <b>AS 安全还没激活</b>（见 S8.3）。顶栏 <b>C-RNTI</b> 在这一刻点亮。</p>',
      ['[PHY] CORESET#0 盲检 TC-RNTI 加扰 PDCCH → 命中 → PDSCH 载 Msg4（复用 Stage 5/6）。',
       '[MAC] 解 Msg4：Contention Resolution Identity（回显 48bit）+ RRCSetup。',
       '[OK] 指纹匹配 ✓ 竞争解决成功 → 应用 RRCSetup（配置 SRB1）。',
       '[RRC] TC-RNTI → C-RNTI（0x4601）升格；RRC 进入 CONNECTED。']
    ),

    /* ── S8.3 AS 安全激活 ─────────────────────────────────────── */
    sim(
      'AS 安全激活：一把根密钥 K_gNB 长出保护树 + SMC 握手',
      '连接已建立，但还在明文。这一步给 RRC/UP 套上保护：从根密钥 <b style="color:#d97706">K_gNB</b> 经 KDF 派生出 <b>K_RRCint / K_RRCenc / K_UPenc</b>，再通过 <b>SecurityModeCommand → SecurityModeComplete</b> 握手把保护逐级合拢——<b>SMC 仅完整性保护</b>，<b style="color:#16a34a">SMP 起完整性 + 加密双激活</b>。点 <b>▶ 激活安全</b> 逐步揭示。<em>诚实点：K_gNB 来自 NAS 鉴权（越界），SMC 发生在 CONNECTED 之后。</em>',
      'AS 密钥层级与 Security Mode 流程（TS 33.501 §6.2 / 38.331 §5.3.4）',
      '<h3>① 密钥派生：一把根长出多把子</h3>'+
      '<div class="formula">K<sub>xxx</sub> = KDF( K<sub>gNB</sub>, 算法类别, 算法ID )</div>'+
      '<p>根密钥 <b>K<sub>gNB</sub></b>（256 bit）派生出三/四把子密钥：<b>K<sub>RRCint</sub></b>（RRC 完整性）、<b>K<sub>RRCenc</sub></b>（RRC 加密）、<b>K<sub>UPenc</sub></b>（用户面加密，必要时还有 K<sub>UPint</sub>）。派生结果 256 bit，<b>截断 128 bit</b> 喂当前算法。</p>'+
      '<h3>② 算法协商（SMC 指定）</h3>'+
      '<table><tr><th>类别</th><th>算法集</th><th>强制？</th></tr>'+
      '<tr><td><b>完整性 NIA</b></td><td>NIA0 空 / NIA1 SNOW3G / NIA2 AES-CMAC / NIA3 ZUC</td><td><b>强制</b>（NIA0 仅紧急）</td></tr>'+
      '<tr><td><b>加密 NEA</b></td><td>NEA0 空 / NEA1 SNOW3G / NEA2 AES-CTR / NEA3 ZUC</td><td>可选（允许 NEA0）</td></tr></table>'+
      '<p>完整性<b>防篡改/重放</b>，加密<b>防窃听</b>。完整性必开，加密可关（如某些信令场景用 NEA0）。</p>'+
      '<h3>③ Security Mode 握手：保护逐级合拢</h3>'+
      '<ul><li><b>SecurityModeCommand</b>（gNB→UE）：指定 NIA/NEA；本消息<b>只完整性保护</b>（用新 K<sub>RRCint</sub>），<b>尚未加密</b>。</li>'+
      '<li><b>SecurityModeComplete</b>（UE→gNB）：<b>完整性 + 加密</b>双激活。此后所有 RRC = 完整性 + 加密；用户面 = 加密（完整性可选）。</li></ul>'+
      '<p style="margin-top:6px;padding:7px 9px;background:#fef2f2;border-left:3px solid #dc2626;border-radius:4px;font-size:12px;color:#475569;"><b style="color:#991b1b;">⚠ 时序诚实点</b>：安全激活<b>不和 RRC 建立同步</b>。真实顺序：Msg4 进 CONNECTED → 发 <b>RRCSetupComplete（携 NAS 注册请求）</b> → AMF 完成 <b>NAS 鉴权</b>、把 <b>K<sub>gNB</sub></b> 下发 gNB → gNB 才发 SecurityModeCommand。即 <b>SMC 在 CONNECTED 之后</b>；产生 K<sub>gNB</sub> 的 NAS 鉴权属<b>后续独立项目</b>。本屏展示的是 AS 层「拿到 K<sub>gNB</sub> 之后」的安全机制本身。</p>',
      ['[RRC] 取根密钥 K_gNB（256b，来自 NAS 鉴权 / 越界）。',
       '[RRC] KDF 派生 AS 密钥：K_RRCint / K_RRCenc / K_UPenc（截断 128b）。',
       '[RRC] 收 SecurityModeCommand：指定 NIA/NEA；本消息仅完整性保护。',
       '[OK] 发 SecurityModeComplete：完整性 + 加密双激活 → AS 安全建立。']
    ),

    /* ── S8.4 RRC_CONNECTED 达成 + 全流程收官 ─────────────────── */
    sim(
      'RRC_CONNECTED 达成 + 全流程收官',
      'UE 发 <b style="color:#16a34a">RRCSetupComplete</b>（走 <b>SRB1 / 下行 DCCH</b>，加扰 C-RNTI；内携 NAS 注册请求转发给 AMF）确认建连完成，RRC 状态机正式翻到 <b>CONNECTED</b>。点 <b>▶ 收官</b> 看状态翻转、总线写入与 <b>9 段旅程闭环</b>（Tc → SSB → PSS → SSS → PBCH → CORESET → SIB1 → PRACH → RRC）。<em>诚实点：CONNECTED 是 RRC/AS 连接，还没有 DRB、没有 IP——真正上网要靠后续的 NAS 注册 + PDU 会话。</em>',
      '连接完成与全流程闭环（TS 38.331 §5.3.3 / 38.300 §9）',
      '<h3>① RRCSetupComplete：把建连「回执」给网络</h3>'+
      '<p>UE 在新建的 <b>SRB1（DCCH，RLC AM，加扰 C-RNTI）</b>上发 <b>RRCSetupComplete</b>，内携 <b>dedicatedNAS-Message（NAS 注册请求）</b>，由 gNB 转发给 <b>AMF</b>——这一步把接力棒交给 NAS（越界，后续项目）。RRC 状态机至此 <b>IDLE → CONNECTED</b>。</p>'+
      '<h3>② 写入 NR_CTX（接入完成的总账）</h3>'+
      '<table><tr><th>字段</th><th>值</th><th>含义</th></tr>'+
      '<tr><td>c_rnti</td><td>0x4601</td><td>小区内永久身份（S8.2 升格）</td></tr>'+
      '<tr><td>rrc_state</td><td>CONNECTED</td><td>RRC 已连接</td></tr>'+
      '<tr><td>srb1_established</td><td>true</td><td>可靠信令承载就绪</td></tr>'+
      '<tr><td>as_security</td><td>true</td><td>完整性 + 加密已激活</td></tr></table>'+
      '<h3>③ 全流程闭环：从 0.509ns 的 Tc 到 CONNECTED</h3>'+
      '<p>九段旅程在此合龙：<b>⓪</b> 建立 Tc 时钟基准 → <b>①</b> 收 SSB 广播 → <b>②③</b> PSS/SSS 同步出 PCI → <b>④</b> 译 PBCH/MIB → <b>⑤</b> CORESET#0 盲检 → <b>⑥</b> 读 SIB1 完成<b>驻网（camped, IDLE）</b> → <b>⑦</b> PRACH 拿 TA/临时身份（上行接通） → <b>⑧</b> RRC 竞争解决 + 建连 + 安全 → <b>CONNECTED</b>。</p>'+
      '<h3>④ 诚实点：CONNECTED ≠ 能上网</h3>'+
      '<p>现在 UE 是小区内<b>有身份、有可靠信令、受安全保护</b>的成员，但这只是 <b>RRC/AS（空口）连接</b>——还<b>没有数据承载（DRB）、没有 IP 地址</b>。要真正上网，接下来需要 <b>NAS 注册 + PDU 会话建立</b>（分配 DRB、打通到 UPF 的用户面）。</p>'+
      '<p style="margin-top:6px;padding:7px 9px;background:#dcfce7;border-left:3px solid #16a34a;border-radius:4px;font-size:12px;color:#475569;"><b style="color:#15803d;">🚩 主线收官</b>：5G NR 初始接入（UE 上电 → 驻网 → 接入 RRC_CONNECTED）这条空口主线到此完整讲完。<b>NAS / PDU 会话</b>与 <b>NTN（星地融合）</b>场景为后续独立项目。</p>',
      ['[RRC] 发 RRCSetupComplete（SRB1 / DCCH，加扰 C-RNTI；内携 NAS 注册请求转 AMF）。',
       '[RRC] 状态机：IDLE → CONNECTED。接入流程（L1/L2 + RRC/AS）完成。',
       '[SUCCESS] 全流程闭环：Tc → SSB → PSS → SSS → PBCH → CORESET → SIB1 → PRACH → RRC。']
    ),

  ]};
  /* ── Export ──────────────────────────────────────────────────────────── */
  window.NR_VIZ_DATA = {
    STAGE_LABELS: STAGE_LABELS,
    STAGE_META:   STAGE_META,
    FLOW_DATA: {
      0:S0, 1:S1, 2:S2, 3:S3, 4:S4,
      5:S5, 6:S6, 7:S7, 8:S8,
    },
  };
})();
