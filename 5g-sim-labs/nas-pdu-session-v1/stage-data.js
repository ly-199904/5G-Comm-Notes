/* ═══════════════════════════════════════════════════════════════════════════
   5G Core · NAS Registration & PDU Session · Stage Data v2.0-core
   数据总线：延续 1.0 的 NR_CTX（含 sessionStorage 恢复 → Master Mode），
            新增 .nas 命名空间。构造器/导出结构与 1.0 完全一致。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── NR_CTX ───────────────────────────────────────────────────────────
     延续 1.0 全部字段（2.0 起点消费 c_rnti / rrc_state / pci 等），
     并新增 nas 子对象作为 2.0 内部数据空间。
     ──────────────────────────────────────────────────────────────────── */
  window.NR_CTX = {
    /* —— 1.0 空口接入遗产（Master Mode 下由 sessionStorage 恢复）—— */
    tc_ns: null, gscn: null, arfcn: null, ssb_case: 'C', scs_khz: 30,
    nid2: null, nid1: null, pci: null, ssb_index: null,
    sfn_offset: null, hrf: null, kssb: null, mib: {},
    coreset0_rb_start: null, coreset0_rb_size: null, coreset0_sym: null,
    point_a_arfcn: null, initial_bwp_rb: null, rach_config: {},
    preamble_idx: null, ta_cmd: null, ta_ns: null, tc_rnti: null,
    c_rnti: null, rrc_state: 'IDLE', as_security: null, srb1_established: null,

    /* —— 2.0 核心网命名空间 —— */
    nas: {
      supi: null,        // 真实身份(IMSI/NAI)：UE/USIM 本地 + UDM 深处；【绝不明文上空口】
      suci: null,        // ECIES 隐藏标识：上行明文出现的是它（S1 写）
      k_ausf: null,      // 鉴权派生(S2)
      k_seaf: null,      // 锚点密钥(S2)
      k_amf:  null,      // AMF 层根(S2)
      k_nas_int: null, k_nas_enc: null,  // NAS 安全(S3)
      k_gnb:  null,      // ★ 从 K_AMF 派生后【空投】给 gNB——还清 1.0 Stage 8 的债(S2)
      guti:   null,      // 5G-GUTI：注册成功后 AMF 分配的临时身份(S4)
      reg_state: 'DEREGISTERED',         // → 'REGISTERED'(S4)
      pdu_sessions: [],  // 每条 {id,dnn,snssai,type,ue_ip,qos_flows:[{qfi,fiveqi}],drb_id}
      _pdu_ip: null,     // 顶栏显示用：首条会话的 UE IP（S5 写）
      _drb_id: null,     // 顶栏显示用：首条 DRB id（S6 写）
    },
  };

  /* 从 sessionStorage 恢复前序 Stage（含 1.0）写入的值 —— Master Mode 关键 */
  (function _restoreCtx(){
    var P = 'nr_ctx_', PN = 'nr_ctx_nas_';
    for(var i=0;i<sessionStorage.length;i++){
      var k = sessionStorage.key(i);
      if(k.indexOf(PN)===0){
        try { window.NR_CTX.nas[k.slice(PN.length)] = JSON.parse(sessionStorage.getItem(k)); } catch(e){}
      } else if(k.indexOf(P)===0){
        try { window.NR_CTX[k.slice(P.length)] = JSON.parse(sessionStorage.getItem(k)); } catch(e){}
      }
    }
  })();

  /* ── Step builders（与 1.0 完全一致）─────────────────────────────────── */
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
  function skelStage(title, spec, logs0) {
    return { subSteps: [
      discuss('理论探讨 · ' + title,
        '此阶段内容正在开发中，全局上下文 NR_CTX（含 .nas 命名空间）依赖链已就绪。',
        '协议参考: ' + spec,
        '<p>此 Stage 将完整实现精确仿真内容。所有前序 Stage（含 1.0 空口接入）写入的 NR_CTX 字段均可在此读取。</p>',
        logs0 || []
      ),
      sim(title + ' · 仿真', '可视化仿真内容开发中。', '架构就绪',
        '<p>SVG 渲染器接口已预留，等待填入。</p>', []
      ),
    ]};
  }

  /* ── Stage Labels & Meta（2.0 · 7 Stage）─────────────────────────────── */
  var STAGE_LABELS = [
    '⓪ 5GC架构', '① NAS上行', '② 5G-AKA鉴权', '③ NAS安全',
    '④ 注册完成', '⑤ PDU会话', '⑥ QoS/DRB',
  ];
  var STAGE_META = [
    { badge:'5GC OVERVIEW', dotColor:'#7c3aed', spec:'TS 23.501 §4 / 38.300 §4' },
    { badge:'NAS UPLINK',   dotColor:'#7c3aed', spec:'TS 24.501 §4.2 / 38.413' },
    { badge:'5G-AKA',       dotColor:'#d97706', spec:'TS 33.501 §6.1 / 33.102' },
    { badge:'NAS SEC',      dotColor:'#d97706', spec:'TS 33.501 §6.4 / 24.501 §4.4' },
    { badge:'REGISTERED',   dotColor:'#059669', spec:'TS 24.501 §5.5.1' },
    { badge:'PDU SETUP',    dotColor:'#0891b2', spec:'TS 23.502 §4.3.2 / 24.501 §6' },
    { badge:'DRB ACTIVE',   dotColor:'#1e3a8a', spec:'TS 37.324 (SDAP) / 38.300 §12' },
  ];

  /* ════════════════════════════════════════════════════════════════════
     STAGE 0 · 5GC 架构与 SBA 总览  (4 sub-steps: 0,1,2,3)  ★ 完整
     配色：网元身份分色——AMF紫 / SMF青蓝 / UPF navy / UDM·AUSF金 / gNB灰
          答案绿 #059669（里程碑）/ 高光红 #dc2626（越界·告警）
     ════════════════════════════════════════════════════════════════════ */
  var S0 = { subSteps: [

    /* ── S0.0 理论：从 RRC_CONNECTED 到「能上网」还差什么 ── */
    discuss(
      '空口已通，为什么还上不了网？',
      '1.0 我们把 UE 送进了 RRC_CONNECTED——空口（AS 层）这条「管道」已经打通。但管道两头还没有人知道「你是谁、准不准用、数据往哪送」。这正是核心网（5GC）要解决的问题。',
      '从「连上基站」到「连上网络」',
      '<h3>RRC_CONNECTED 只是第一步</h3>'+
      '<p>1.0 结束时，UE 与 gNB 之间建立了 SRB1、激活了 AS 安全、拿到了 C-RNTI。但这一切都发生在'+
      '<b>空口（UE↔gNB）</b>这一小段。gNB 只是「接入网（RAN）」的边缘节点，它本身'+
      '<b>既不认识你、也不保存你的签约数据、更不能给你分配 IP 地址</b>。</p>'+
      '<h3>三个悬而未决的问题</h3>'+
      '<table><tr><th>问题</th><th>谁来回答</th></tr>'+
      '<tr><td>你到底是谁？（身份与鉴权）</td><td>AUSF / UDM（鉴权中心）</td></tr>'+
      '<tr><td>你准不准接入、在哪个区域移动？</td><td>AMF（接入与移动性管理）</td></tr>'+
      '<tr><td>数据怎么走、给你什么 IP？</td><td>SMF + UPF（会话与转发）</td></tr></table>'+
      '<h3>2.0 的旅程</h3>'+
      '<p>本项目接着 1.0 讲：UE 通过 NAS 信令向核心网「报到」（注册）→ 双方互相鉴权、长出密钥树'+
      '（其中一支 <b>K<sub>gNB</sub></b> 正是 1.0 Stage 8 当根用的那把，本项目来补上它的来源）→ '+
      '建立 PDU 会话拿到 IP → 最终第一个用户数据包从 UPF 流向数据网络（DN）。</p>'+
      '<div class="formula">RRC_CONNECTED（空口通） → <b>注册 + 鉴权 + PDU 会话</b> → 能上网</div>'+
      '<p class="honesty" style="color:#dc2626;">诚实边界：本沙盘讲到 IP 包从 UPF 的 N6 口吐给 DN 为止。'+
      'DN 之外的公网路由、PCF 动态策略、CHF 计费一律作为黑盒/越界，不展开。</p>',
      ['[NAS] 承接 1.0：RRC_CONNECTED / C-RNTI=0x4601 已就位。',
       '[5GMM] 当前 5GMM 状态：DEREGISTERED（尚未向核心网注册）。',
       '[INFO] 准备向 AMF 发起初始注册（Initial Registration）。']
    ),

    /* ── S0.1 网元点名：5GC 主要 NF 分工 ── */
    sim(
      '核心网点名：五个关键网元各司其职',
      '5GC 不是一台大服务器，而是一组「网络功能（NF）」微服务。先认识本次旅程会打交道的五个：AMF、SMF、UPF、AUSF、UDM——以及退居「透明管道」的 gNB。',
      'NF 分工与配色约定',
      '<h3>认识这几位（记住颜色=身份）</h3>'+
      '<table><tr><th>网元</th><th>全称</th><th>职责</th></tr>'+
      '<tr><td><b style="color:#7c3aed;">AMF</b></td><td>Access &amp; Mobility Mgmt Function</td>'+
        '<td>信令枢纽 / 大管家：注册、连接、移动性管理；NAS 信令的终点</td></tr>'+
      '<tr><td><b style="color:#0891b2;">SMF</b></td><td>Session Mgmt Function</td>'+
        '<td>会话大脑：管 PDU 会话、分配 IP、决定数据「水管」怎么走</td></tr>'+
      '<tr><td><b style="color:#1e3a8a;">UPF</b></td><td>User Plane Function</td>'+
        '<td>用户面路由器：真正搬运数据包，N3 收 / N6 发，宽广的「数据海洋」</td></tr>'+
      '<tr><td><b style="color:#d97706;">AUSF</b></td><td>Authentication Server Function</td>'+
        '<td>鉴权服务器：执行 5G-AKA，验证「你是不是真的你」</td></tr>'+
      '<tr><td><b style="color:#d97706;">UDM</b></td><td>Unified Data Mgmt</td>'+
        '<td>签约数据中心 + 持有解 SUCI 的私钥（SIDF）；核心资产</td></tr>'+
      '<tr><td><b style="color:#64748b;">gNB</b></td><td>下一代基站</td>'+
        '<td>2.0 中退居「透明数据管道」：转发 NAS、承载数据，不解读核心网内容</td></tr></table>'+
      '<h3>控制面 vs 用户面</h3>'+
      '<p>AMF/SMF/AUSF/UDM 属<b>控制面（CP）</b>——只跑信令、不碰用户数据；UPF 属<b>用户面（UP）</b>'+
      '——只搬数据、不做决策。这种「指挥与搬运分家」就是下一步要讲的 <b>CUPS</b>。</p>',
      ['[5GC] 网元发现完成：AMF / SMF / UPF / AUSF / UDM 在线。',
       '[NRF] 各 NF 已在 NRF（网络存储功能）注册服务，可被发现调用。']
    ),

    /* ── S0.2 SBA 服务化总线：HTTP/2 RESTful vs 4G Diameter ── */
    sim(
      'SBA 服务化总线：核心网内部其实在调 REST API',
      '5GC 相对 4G EPC 最大的架构革命：网元之间不再是写死的点对点专线，而是像互联网微服务一样，通过一条「服务化总线」互相调用 HTTP/2 的 RESTful API。',
      '从 Diameter 专线到服务化总线',
      '<h3>4G 的痛点</h3>'+
      '<p>4G EPC 里，MME↔HSS 等网元之间用 <b>Diameter</b> 协议、点对点专线连接。每加一种新交互'+
      '就要定义一对专用接口，僵硬、难扩展。</p>'+
      '<h3>5G 的解法：SBA（Service-Based Architecture）</h3>'+
      '<p>控制面 NF 全部「服务化」：每个 NF 把能力包装成 RESTful 服务挂到总线上，别的 NF 想用就'+
      '<b>按服务名调用</b>，就像微信小程序调用云函数。底层走 <b>HTTP/2 + JSON</b>。</p>'+
      '<table><tr><th>服务接口</th><th>提供者</th><th>典型调用</th></tr>'+
      '<tr><td><code>Namf_Communication</code></td><td>AMF</td><td>代为下发 N1/N2 消息</td></tr>'+
      '<tr><td><code>Nausf_UEAuthentication</code></td><td>AUSF</td><td>发起鉴权</td></tr>'+
      '<tr><td><code>Nudm_UEAuthentication</code></td><td>UDM</td><td>取鉴权向量</td></tr>'+
      '<tr><td><code>Nsmf_PDUSession</code></td><td>SMF</td><td>建 PDU 会话</td></tr></table>'+
      '<p style="color:#059669;"><b>共鸣点</b>：搞过后端/微服务的同学会瞬间认出来——这就是服务注册'+
      '（NRF=注册中心）+ 服务发现 + RESTful 调用那一套，被搬进了电信核心网。</p>'+
      '<h3>钩子：SMF 凭什么能「隔空」给你建会话？</h3>'+
      '<p><code>Namf_Communication</code> 最经典的用法是<b>「代为下发 N1/N2 消息」</b>：SMF 自己不管接入、'+
      '不知道你连在哪个基站，但它可以通过这个服务把 NAS(N1)/基站控制(N2) 消息<b>塞给 AMF，让 AMF 跑腿下发</b>'+
      '——因为全网只有 AMF 掌握「你当前挂在哪个 gNB 下」。这就是 Stage 5 建 PDU 会话时 SMF 能隔空触达你的底层机制。</p>'+
      '<h3>但用户面例外</h3>'+
      '<p>UPF 的数据转发（N3/N6）<b>不</b>走服务化总线——海量用户数据要的是吞吐和低时延，仍用'+
      '专门的隧道协议（GTP-U）。<b>服务化只在控制面</b>。</p>',
      ['[SBA] 服务化总线就绪：HTTP/2 / TLS / JSON。',
       '[NRF] 服务发现可用：Namf / Nausf / Nudm / Nsmf 已注册。']
    ),

    /* ── S0.3 CUPS + 本次旅程路线图 ── */
    sim(
      'CP/UP 分离（CUPS）与本次旅程路线图',
      '最后一块拼图：控制面与用户面彻底分离——SMF 出大脑、UPF 出肌肉。理解了这个，就能看懂后面 6 个 Stage 的整体走向。',
      'CUPS 的意义与旅程预告',
      '<h3>CUPS：Control / User Plane Separation</h3>'+
      '<p><b>SMF（控制）</b>通过 <code>N4 / PFCP</code> 接口「远程编程」<b>UPF（用户面）</b>：告诉它'+
      '「这条会话的包该怎么打隧道、往哪转、用什么 QoS」。UPF 收到规则后埋头转发，自己不做决策。</p>'+
      '<p>好处：用户面可以下沉到离用户最近的边缘（低时延），控制面集中在云端——这是 5G 支持'+
      '边缘计算（MEC）的架构基础。</p>'+
      '<h3>接口速查（后面每个 Stage 都会用到）</h3>'+
      '<table><tr><th>接口</th><th>两端</th><th>性质</th></tr>'+
      '<tr><td>N1</td><td>UE ↔ AMF</td><td>NAS（逻辑接口，物理穿 gNB 透明转发）</td></tr>'+
      '<tr><td>N2</td><td>gNB ↔ AMF</td><td>NGAP 信令</td></tr>'+
      '<tr><td>N3</td><td>gNB ↔ UPF</td><td>GTP-U 用户面隧道</td></tr>'+
      '<tr><td>N4</td><td>SMF ↔ UPF</td><td>PFCP（控制配用户面）</td></tr>'+
      '<tr><td>N6</td><td>UPF ↔ DN</td><td>用户面出口（本沙盘终点）</td></tr>'+
      '<tr><td>N11</td><td>AMF ↔ SMF</td><td>会话请求转发</td></tr></table>'+
      '<h3>本次旅程（Stage 1→6）</h3>'+
      '<p>① NAS 上行接管（SUCI 隐藏身份）→ ② 5G-AKA 鉴权（长出密钥树，<b style="color:#059669;">'+
      '空投 K<sub>gNB</sub> 还 1.0 的债</b>）→ ③ NAS 安全激活（双层安全）→ ④ 注册完成（拿 5G-GUTI）'+
      '→ ⑤ PDU 会话建立（SMF 配 UPF，拿 IP）→ ⑥ QoS/DRB 落地（SDAP 分拣，<b style="color:#059669;">'+
      '首个 IP 包出 N6</b>）。</p>',
      ['[CUPS] 控制面 / 用户面分离架构确认：SMF—(N4/PFCP)—UPF。',
       '[READY] 5GC 全景就绪。下一步：UE 发起 NAS 初始注册（Stage 1）。']
    ),

  ]};

  /* ════════════════════════════════════════════════════════════════════
     STAGE 2~6 · 占位（待逐个实现，替换对应 skelStage）
     ════════════════════════════════════════════════════════════════════ */
  /* ════════════════════════════════════════════════════════════════════
     STAGE 1 · NAS 上行接管 & SUCI  (4 sub-steps: 0,1,2,3)  ★ 完整
     ════════════════════════════════════════════════════════════════════ */
  var S1 = { subSteps: [

    /* ── S1.0 理论：接管 1.0 的密封信 · NAS 是什么 ── */
    discuss(
      '接管 1.0：RRCSetupComplete 里藏着一封给核心网的信',
      '1.0 结束时，UE 在 RRCSetupComplete 里捎带了一段「NAS PDU」。它对 gNB 是不透明的黑盒——这正是 2.0 的起点：把这封信送到 AMF，让核心网第一次「听见」UE 的声音。',
      'NAS 是什么 · 为什么 gNB 读不懂',
      '<h3>NAS：和核心网直接对话的语言</h3>'+
      '<p><b>NAS（Non-Access Stratum，非接入层）</b>是 UE 与核心网 <b>AMF</b> 之间的「应用层对话」，'+
      'gNB 只是中间的快递员。1.0 讲的 RRC / PDCP / RLC / MAC / PHY 都属于 <b>AS（Access Stratum，接入层）</b>，'+
      '只负责把 UE 接到 gNB 这条空口管道上。</p>'+
      '<table><tr><th>层</th><th>两端</th><th>谁能读</th></tr>'+
      '<tr><td><b>AS（RRC…）</b></td><td>UE ↔ gNB</td><td>gNB 能读，管空口</td></tr>'+
      '<tr><td><b style="color:#7c3aed;">NAS（5GMM / 5GSM）</b></td><td>UE ↔ AMF</td><td>只有 AMF 能读，管注册 / 会话</td></tr></table>'+
      '<h3>5GMM：移动性管理状态机</h3>'+
      '<p>NAS 分两支：<b>5GMM</b>（移动性管理，管注册 / 鉴权 / 连接）与 <b>5GSM</b>（会话管理，Stage 5 才登场）。'+
      '当前 UE 处于 <code>5GMM-DEREGISTERED</code>，目标是通过 <em>Registration Request</em> 走向 '+
      '<code>5GMM-REGISTERED</code>（Stage 4 达成）。</p>'+
      '<h3>钩子：为什么捎带在 RRCSetupComplete 里？</h3>'+
      '<p>为省一次空口往返，UE 把第一条 NAS 消息「搭便车」放进 RRC 建立完成消息的 '+
      '<code>dedicatedNAS-Message</code> 字段。gNB 看到这个字段，知道「这是给核心网的，我不拆」，'+
      '直接转封装进 N2 信令送给 AMF。</p>',
      ['[NAS] 承接 1.0：RRCSetupComplete 已携带 dedicatedNAS-Message。',
       '[5GMM] 当前状态：DEREGISTERED；准备发起 Initial Registration。',
       '[INFO] 这封 NAS 信对 gNB 不透明，只有 AMF 能拆。']
    ),

    /* ── S1.1 仿真：NAS 上行三段接力 ── */
    sim(
      'NAS 上行三段接力：UE → gNB → AMF',
      '看这封信怎么走：① 经空口(Uu/SRB1)的 RRCSetupComplete 到 gNB；② gNB 不拆 NAS，原样塞进 NGAP 的 Initial UE Message 经 N2 给 AMF；③ AMF 解封，读出 Registration Request。',
      '从 RRC 到 NGAP · N1 为何是「逻辑」接口',
      '<h3>一段 octet 串，换两层「信封」</h3>'+
      '<p>同一段 NAS PDU（Registration Request）在物理上换了两层承载，但 NAS 内容始终没被中间节点解读：</p>'+
      '<table><tr><th>段</th><th>承载</th><th>接口 / 协议</th></tr>'+
      '<tr><td>① UE→gNB</td><td>RRCSetupComplete 的 dedicatedNAS-Message</td><td>Uu 空口 · SRB1 · RRC</td></tr>'+
      '<tr><td>② gNB→AMF</td><td>NGAP Initial UE Message 的 NAS-PDU</td><td>N2 · NGAP</td></tr>'+
      '<tr><td>③ AMF</td><td>解封，提交 5GMM 状态机</td><td>N1（逻辑终点）</td></tr></table>'+
      '<h3>N1 是「逻辑」接口（重点）</h3>'+
      '<p>协议图常画一条 <em>N1：UE ↔ AMF</em>，容易让人以为二者有物理直连。其实没有——'+
      '<b>N1 是逻辑接口</b>：NAS 消息物理上必须经 gNB 透明转发，走「空口 + N2」两跳。'+
      'gNB 既不解密也不解析 NAS 内容，只做搬运。</p>'+
      '<h3>gNB 的「透明」体现在哪</h3>'+
      '<p>gNB 把从 RRC 取出的 NAS PDU 当作一段不透明字节，整段塞进 NGAP 容器。它新增 / 修改的只是'+
      ' N2 层信息（如 NGAP UE ID、所在小区），从不触碰 NAS 字节。这是「接入网 ≠ 核心网」职责分离的体现。</p>',
      ['[RRC] UE → gNB：RRCSetupComplete(SRB1)，内含 NAS Registration Request。']
    ),

    /* ── S1.2 仿真：SUCI 构造（ECIES Profile A）── */
    sim(
      'SUCI：把真名（SUPI）锁进密码信封',
      '那封信里的「身份」字段绝不能是真名。UE 用归属网络 UDM 的公钥，通过 ECIES 把 SUPI 中的敏感部分(MSIN)加密成 SUCI；MCC/MNC 保持明文以便路由。上空口的，永远是 SUCI。',
      'SUPI / SUCI / ECIES Profile A',
      '<h3>三个身份：SUPI / SUCI / 5G-GUTI</h3>'+
      '<table><tr><th>身份</th><th>含义</th><th>出现位置</th></tr>'+
      '<tr><td><b>SUPI</b></td><td>永久真身（IMSI 或 NAI）</td><td>UE/USIM 本地 + UDM；<b style="color:#dc2626;">绝不上空口</b></td></tr>'+
      '<tr><td><b style="color:#059669;">SUCI</b></td><td>SUPI 的加密隐藏版</td><td>上行明文出现的就是它</td></tr>'+
      '<tr><td><b>5G-GUTI</b></td><td>注册后分配的临时身份</td><td>Stage 4 之后用它替代 SUCI</td></tr></table>'+
      '<h3>SUCI = 部分加密</h3>'+
      '<p>SUPI(IMSI) = <code>MCC|MNC|MSIN</code>。其中 <b style="color:#059669;">MCC/MNC（归属网络标识）保持明文</b>'+
      '——拜访网络要靠它把鉴权请求路由回你的归属网络；<b style="color:#dc2626;">MSIN（用户唯一编号）必须加密</b>。</p>'+
      '<h3>ECIES Profile A（本沙盘采用）</h3>'+
      '<p>椭圆曲线集成加密方案：UE 现场生成一对临时密钥，与 UDM 公钥做 ECDH 得共享密钥，'+
      '再派生出对称加密钥与 MAC 钥：</p>'+
      '<div class="formula">SUCI 载荷 = eph_pub ‖ AES-CTR(MSIN) ‖ HMAC-MAC</div>'+
      '<span class="formula-note">Profile A：Curve25519 · X9.63-KDF(SHA-256) · AES-128-CTR · HMAC-SHA-256(截 64bit)；Profile B 用 secp256r1</span>'+
      '<p>因为每次都用新的临时密钥，<b>同一 SUPI 每次生成的 SUCI 都不同</b>，攻击者无法靠比对 SUCI 追踪用户。</p>',
      ['[UE/SIDF] 以归属网络公钥执行 ECIES(Profile A) 隐藏 SUPI → SUCI。',
       '[NAS] 5GS mobile identity = SUCI 已写入 Registration Request。']
    ),

    /* ── S1.3 探讨：伪基站对照（安全升级）── */
    discuss(
      '伪基站对照：为什么 5G 能毙掉 IMSI Catcher',
      '4G 时代，伪基站发个 Identity Request 就能套出明文 IMSI。5G 把身份换成 SUCI——只有归属网络 UDM(SIDF) 的私钥才解得开，伪基站即便拦到也只是一串无意义密文。',
      'IMSI Catcher · SIDF · 拜访网络为何也解不开',
      '<h3>IMSI Catcher：4G 的老伤疤</h3>'+
      '<p>4G/3G/2G 中，网络可发 <em>Identity Request</em> 要 UE 上报永久身份，UE 会回明文 IMSI。'+
      '伪基站（IMSI Catcher / Stingray）伪装成合法小区，就能批量套取周边用户的 IMSI，用于追踪、定位甚至降级攻击。</p>'+
      '<h3>5G 的根治：身份永不明文上空口</h3>'+
      '<p>5G 规定初始上行身份必须是 SUCI。<b>SIDF（Subscription Identifier De-concealing Function）</b>'+
      '是 UDM 内部唯一持有解密私钥的功能，<b style="color:#059669;">只有归属网络能还原 SUPI</b>。</p>'+
      '<table><tr><th>角色</th><th>能否解 SUCI</th><th>原因</th></tr>'+
      '<tr><td>伪基站</td><td><b style="color:#dc2626;">不能</b></td><td>没有 UDM 私钥，只拿到无意义密文</td></tr>'+
      '<tr><td>拜访网络(VPLMN)</td><td>不能</td><td>私钥不离开归属网络；只能按 MCC/MNC 转交</td></tr>'+
      '<tr><td>归属 UDM(SIDF)</td><td><b style="color:#059669;">能</b></td><td>持有与公钥配对的私钥</td></tr></table>'+
      '<h3>诚实边界</h3>'+
      '<p>真正的解密发生在 Stage 2 鉴权时（AMF → AUSF → UDM）。本步只确立「谁能解、谁不能解」这一安全直觉，'+
      '不展开密钥管理 / 证书体系（运营商内部黑盒）。</p>',
      ['[SEC] 对照：4G 明文 IMSI 可被伪基站套取；5G SUCI 仅归属 UDM(SIDF) 可解。',
       '[READY] NAS 上行已就位，身份隐藏完成。下一步：5G-AKA 鉴权（Stage 2）。']
    ),

  ]};
  /* ════════════════════════════════════════════════════════════════════
     STAGE 2 · 5G-AKA 鉴权  (5 sub-steps: 0,1,2,3,4)  ★ 完整
     配色：UE slate / AMF 紫 / AUSF·UDM 金(钥匙) / gNB 灰 / 答案绿 / 越界红
     核心产出 = 倒生长密钥树 K→K_AUSF→K_SEAF→K_AMF→K_gNB，逐层「算出才写」。
     还债：K_gNB 空投给 gNB = 1.0 Stage 8「越界·源自 NAS 鉴权」的来源。
     ════════════════════════════════════════════════════════════════════ */
  var S2 = { subSteps: [

    /* ── S2.0 理论：为什么要「互相验明正身」 ── */
    discuss(
      '鉴权前夜：SUCI 藏住了真名，但双方还没互证身份',
      'S1 里 UE 用 SUCI 把真名锁了起来，可「藏好身份」≠「证明身份」。5G-AKA 要让 UE 与归属网络在不暴露共享密钥 K 的前提下，互相证明「我握有同一把 K」——网络验 UE 防盗用，UE 验网络防伪基站。',
      '5G-AKA：对称密钥的挑战-应答',
      '<h3>为什么注册必须先鉴权</h3>'+
      '<p>核心网不能仅凭一句「我是 460010123456789」就放行——那样任何人抄走身份就能冒名上网。'+
      '于是双方做一次<b>挑战-应答（challenge-response）</b>：用只有真 USIM 与真 UDM 才有的<b>共享密钥 K</b> '+
      '做一道只有「知道 K 的人」才算得对的题。算对了，就证明了身份，而 <b>K 本身从不上空口</b>。</p>'+
      '<h3>对称密钥 K：两边各存一份</h3>'+
      '<p>K 烧录在 USIM 卡里，同时存在运营商 UDM 深处。它<b>永不传输</b>；空口上跑的只有由它派生的「挑战」'+
      'RAND/AUTN 与「应答」RES*——拿到这些也反推不出 K。</p>'+
      '<h3>双向鉴权（5G 比 4G 更狠的地方）</h3>'+
      '<table><tr><th>方向</th><th>谁验谁</th><th>靠什么</th></tr>'+
      '<tr><td>网络 → UE</td><td>网络确认 UE 是真用户</td><td>比对 RES* / XRES*</td></tr>'+
      '<tr><td><b style="color:#7c3aed;">UE → 网络</b></td><td>UE 确认网络是真网络</td><td>验 AUTN 内的 MAC（5G 强制）</td></tr></table>'+
      '<p>4G 偏重「网络验 UE」，UE 对网络的校验偏弱，这给了伪基站可乘之机。5G 让 UE <b>先验网络</b>'+
      '（下一步细讲），是继 S1 的 SUCI 之后、对抗伪基站的<b>第二把锁</b>。</p>'+
      '<h3>抗重放：AUTN 里的 SQN</h3>'+
      '<p>AUTN 内含序列号 <code>SQN</code>。攻击者就算录下一整套合法鉴权报文，重放时 UE 会发现 '+
      'SQN「不新鲜」而拒绝——挑战不可重复使用。</p>'+
      '<p class="honesty" style="color:#dc2626;">越界（黑盒）：K 的根、Milenage/TUAK 内核运算、SQN 同步管理'+
      '都属 UDM 内部，本沙盘只示「算出什么」，不示「具体怎么算」。</p>',
      ['[5GMM] AMF 收到 Registration Request(SUCI)，触发主鉴权（primary authentication）。',
       '[5GMM] 当前状态：DEREGISTERED；身份为 SUCI（真名 SUPI 尚未对网络明示）。',
       '[INFO] 准备执行 5G-AKA：双向鉴权 + 派生密钥树。']
    ),

    /* ── S2.1 仿真：取鉴权向量（SBA 调用链）── */
    sim(
      '取鉴权向量：AMF 沿服务化总线问 AUSF，AUSF 问 UDM',
      'AMF 自己不存密钥，它沿 SBA 服务化总线调用 Nausf_UEAuthentication 找 AUSF；AUSF 再调 Nudm_UEAuthentication 找 UDM。UDM 用 SIDF 私钥解开 SUCI（兑现 S1 的约定）、跑 Milenage 生成鉴权向量，逐级回传。',
      'Nausf / Nudm 服务化调用 · 5G HE AV → 5G SE AV',
      '<h3>调用链（服务化，不是 4G Diameter）</h3>'+
      '<p>5GC 内部是 SBA 微服务，鉴权向量的获取是一串<b>按服务名发起的 HTTP/2 RESTful 调用</b>：</p>'+
      '<table><tr><th>跳</th><th>调用</th><th>携带</th></tr>'+
      '<tr><td>① AMF→AUSF</td><td><code>Nausf_UEAuthentication_Authenticate</code></td><td>SUCI, SN-name</td></tr>'+
      '<tr><td>② AUSF→UDM</td><td><code>Nudm_UEAuthentication_Get</code></td><td>SUCI, SN-name</td></tr></table>'+
      '<h3>UDM 内部（黑盒，承接 S1）</h3>'+
      '<p>UDM 做三件事：①用 <b>SIDF 私钥解 SUCI → 还原 SUPI</b>（这正是 S1 留下的「只有归属网络能解」的兑现）；'+
      '②跑 <b>Milenage</b> 生成 RAND / AUTN / XRES* 等；③派生 <b>K_AUSF</b>。具体 Milenage 运算、SQN 管理'+
      '属运营商内部，沙盘灰标越界、不展开。</p>'+
      '<h3>两种向量：HE AV 与 SE AV</h3>'+
      '<table><tr><th>向量</th><th>谁产/谁收</th><th>内容</th></tr>'+
      '<tr><td>5G HE AV</td><td>UDM → AUSF</td><td>RAND, AUTN, <b>XRES*</b>, K_AUSF</td></tr>'+
      '<tr><td>5G SE AV</td><td>AUSF → AMF/SEAF</td><td>RAND, AUTN, <b>HXRES*</b></td></tr></table>'+
      '<p>AUSF 收到 HE AV 后：算 <code>HXRES* = SHA-256(RAND‖XRES*)</code> 给 AMF 做快筛、算 <b>K_SEAF</b>，'+
      '然后<b style="color:#dc2626;">故意把 K_SEAF 扣下</b>——只发 RAND/AUTN/HXRES* 给 AMF。</p>'+
      '<h3>钩子：为什么 AUSF 要扣下 K_SEAF？</h3>'+
      '<p>这体现 5G「归属网络掌控鉴权」的设计：拜访网络（SEAF/AMF）要等鉴权<b>真正成功</b>'+
      '（UE 回的 RES* 经 AUSF 终判一致）后，AUSF 才把 K_SEAF 交下去。避免拜访网络在未确认时就拿到锚点密钥。</p>',
      ['[SBA] AMF → Nausf_UEAuthentication(AUSF)：发起主鉴权 (SUCI, SN-name)。',
       '[SBA] AUSF → Nudm_UEAuthentication_Get(UDM)：请求鉴权向量。']
    ),

    /* ── S2.2 仿真（里程碑）：挑战应答 ── */
    sim(
      '挑战应答：RAND/AUTN 下发，UE 先验真伪再回 RES*',
      'AMF 把 RAND、AUTN 发给 UE。UE 在 USIM 里：用 K 算出 AK 还原 SQN（查新鲜，抗重放）、算 XMAC 与 AUTN 里的 MAC 比对（验网络真伪）；通过后才算 RES*。网络收到 RES* 经两级比对（AMF 快筛、AUSF 终判）确认 UE。',
      'AUTN 结构 · MAC 验真 · RES* / XRES* 两级比对',
      '<h3>下行挑战：Authentication Request</h3>'+
      '<p>消息携带 <code>RAND</code>（随机数）与 <code>AUTN</code>（鉴权令牌）。AUTN 是网络「自证」的关键：</p>'+
      '<div class="formula">AUTN = (SQN &#8853; AK) ‖ AMF ‖ MAC</div>'+
      '<span class="formula-note">注：此 AMF = Authentication Management Field（鉴权管理字段，16 bit），与网元 AMF（Access &amp; Mobility Mgmt Function）同名不同物。</span>'+
      '<h3>UE 侧三步（在 USIM 内）</h3>'+
      '<ul><li>用 K + RAND 算 <b>AK</b>，从 AUTN 里<b>还原 SQN</b>，检查是否落在可接受窗口（<b>抗重放</b>）；</li>'+
      '<li>用 K 算 <b>XMAC</b>，与 AUTN 里收到的 <b>MAC</b> 比对——<b style="color:#059669;">相等 ⇒ 网络是真的</b>'+
      '（伪基站没有 K，伪造不出正确 MAC，这是继 SUCI 之后毙伪基站的第二把锁）；</li>'+
      '<li>验证通过后，才算 <b>RES</b> 并按 TS 33.501 A.4 派生 <b>RES*</b> 回给网络。</li></ul>'+
      '<h3>网络侧两级比对</h3>'+
      '<table><tr><th>谁</th><th>比什么</th><th>性质</th></tr>'+
      '<tr><td>AMF / SEAF</td><td>HRES*(RES*) =?= HXRES*</td><td>快筛（拜访网络本地）</td></tr>'+
      '<tr><td><b style="color:#d97706;">AUSF</b></td><td>RES* =?= XRES*</td><td><b>权威终判</b>（归属网络）</td></tr></table>'+
      '<p>两级都过，鉴权才算成立。此刻 AUSF 才把上一步扣下的 <b>K_SEAF</b> 交给 AMF。</p>'+
      '<h3>本沙盘真实数值（可复现）</h3>'+
      '<p>RAND/AUTN/RES* 等均由 TS 35.208 Test Set 1 经 Milenage + TS 33.501 Annex A 实算，UE 与网络两侧 RES*==XRES*。'+
      '<code>RES* = 7b1f972f…eb76</code>，<code>HXRES* = 5b898808…28d9</code>。</p>',
      ['[5GMM] AMF → UE：Authentication Request (RAND, AUTN, ngKSI, ABBA)。']
    ),

    /* ── S2.3 仿真（里程碑）：倒生长密钥树 ── */
    sim(
      '倒生长密钥树：K → K_AUSF → K_SEAF → K_AMF → K_gNB',
      '鉴权成功的副产品是一整棵密钥树。UE 与网络各用同一把 K 走同一套 KDF（HMAC-SHA-256），逐层「绑」进新上下文派生出 K_AUSF → K_SEAF → K_AMF → K_gNB。其中 K_AMF 写入上下文，顶栏「K_AMF ✓」点亮。',
      '密钥层级 · KDF 逐层绑定 · 还 1.0 的债',
      '<h3>逐层派生与「绑定」</h3>'+
      '<table><tr><th>密钥</th><th>由谁/绑什么</th><th>FC</th></tr>'+
      '<tr><td>CK ‖ IK</td><td>Milenage f3/f4（K + RAND）</td><td>—</td></tr>'+
      '<tr><td><b>K_AUSF</b></td><td>KDF(CK‖IK)，绑 <b>SN-name</b>（拜访网络名）</td><td>0x6A</td></tr>'+
      '<tr><td><b>K_SEAF</b></td><td>KDF(K_AUSF)，锚点密钥</td><td>0x6C</td></tr>'+
      '<tr><td><b style="color:#7c3aed;">K_AMF</b></td><td>KDF(K_SEAF)，绑 <b>SUPI + ABBA</b></td><td>0x6D</td></tr>'+
      '<tr><td><b style="color:#059669;">K_gNB</b></td><td>KDF(<b>K_AMF</b>)，绑 <b>上行 NAS COUNT</b></td><td>0x6E</td></tr></table>'+
      '<p style="color:#dc2626;"><b>物理红线</b>：K_gNB <b>从 K_AMF 派生</b>，不是从 K_SEAF 直接出。'+
      '链路必须 <code>K_SEAF → K_AMF → K_gNB</code>，少一层就是物理错误。</p>'+
      '<h3>「倒生长」是什么意思</h3>'+
      '<p>1.0 里我们<b>自顶向下</b>用 K_gNB 派生 AS 层的 K_RRCint/K_RRCenc/K_UPint/K_UPenc，但 K_gNB 当时'+
      '被标注「源自 NAS 鉴权（越界）」——只有顶、没有根。2.0 在这里把根<b>一路扎回 K</b>：树是从'+
      'K 往下长的，故称「倒生长」（相对 1.0 的视角）。</p>'+
      '<h3>对称生长 + 同源旁支</h3>'+
      '<p>UE 与网络<b>各自独立</b>用同一把 K 算出完全相同的树，<b>空口从不传任何密钥</b>。'+
      '此外 K_AMF 还会派生 <b>K_NASint / K_NASenc</b>（NAS 层安全，Stage 3 登场）——同源不同枝。</p>'+
      '<div class="formula">K → (Milenage) → CK‖IK → K_AUSF → K_SEAF → K_AMF → { K_gNB ; K_NAS* }</div>',
      ['[5GMM] 鉴权成功，开始派生密钥树（KDF = HMAC-SHA-256，TS 33.501 Annex A）。']
    ),

    /* ── S2.4 仿真：K_gNB 空投还债 ── */
    sim(
      '还债：K_gNB 空投给 gNB，1.0 的欠条就此划销',
      'K_gNB 在 AMF 由 K_AMF 派生后，经 N2/NGAP 的 Initial Context Setup「空投」给 gNB。gNB 收到这把根钥匙，才能长出 1.0 当根用的 K_RRCint/K_RRCenc/K_UPint/K_UPenc——1.0 Stage 8 标注的「越界·源自 NAS 鉴权」的 K_gNB，来源至此补齐。',
      'K_gNB 交付 · NGAP Initial Context Setup · 与 1.0 缝合',
      '<h3>派生 + 交付</h3>'+
      '<p>AMF 用 <code>KDF(K_AMF, 上行 NAS COUNT, access)</code>（FC=0x6E）算出 K_gNB，'+
      '然后通过 <b>N2 / NGAP</b> 的 <code>Initial Context Setup Request</code> 把它<b>空投</b>给 gNB。'+
      '注意：空投的是 K_gNB 这把<b>派生密钥</b>，不是 K、也不是 K_AMF——核心网的根密钥从不下放到接入网。</p>'+
      '<h3>gNB 收到后做什么</h3>'+
      '<p>gNB 以 K_gNB 为根，派生 AS 层四把子钥：</p>'+
      '<table><tr><th>子钥</th><th>用途</th></tr>'+
      '<tr><td>K_RRCint / K_RRCenc</td><td>RRC 信令完整性 / 加密（1.0 SRB 安全）</td></tr>'+
      '<tr><td>K_UPint / K_UPenc</td><td>用户面完整性 / 加密（后续 DRB 数据）</td></tr></table>'+
      '<p style="color:#059669;"><b>还债成功</b>：这四把正是 1.0 Stage 8 当作「现成根」使用、却标注来源越界的密钥。'+
      '2.0 把它们的源头——K_gNB——亲手交到 gNB 手里，1.0/2.0 的安全链就此<b>缝合</b>。</p>'+
      '<h3>诚实边界（时机）</h3>'+
      '<p>严格说，K_gNB 的<b>物理交付</b>随 NAS 安全激活后的 <code>Initial Context Setup</code> 发生'+
      '（落在 Stage 3 的邻域）。本步把它作为<b>密钥树的收尾与「还债」高潮</b>提前演示，'+
      'Stage 3 会接着讲 NAS 安全（NAS+AS 双层）如何与之配合。</p>'+
      '<p class="honesty" style="color:#dc2626;">越界：AS 子钥的逐把派生细节在 1.0 已讲；'+
      'gNB 内的密钥存储 / 上下文管理属实现细节，沙盘不展开。</p>',
      ['[KDF] AMF 派生 K_gNB（KDF: K_AMF, UL NAS COUNT, FC=0x6E）。']
    ),

  ]};
  /* ════════════════════════════════════════════════════════════════════
     STAGE 3 · NAS 安全激活  (4 sub-steps: 0,1,2,3)  ★ 完整
     配色：AMF 紫(NAS 安全主角) / 密钥金 / 答案绿(激活·同核恍然) /
          告警红(降级攻击·越界) / UE slate · gNB 灰(AS 对照层)
     核心产出 = K_NASint / K_NASenc（从 K_AMF 真实派生，TS 33.501 A.8），
              SMP 完成后写入上下文（算出/激活才写，零先验）。
     物理红线：NAS 算法命名 5G-IA/5G-EA（≠ 1.0 AS 的 NIA/NEA，同核不同名，踩坑 #14）；
              NAS 与 AS 双层并存、密钥不同源（NAS←K_AMF / AS←K_gNB）。
     ════════════════════════════════════════════════════════════════════ */
  var S3 = { subSteps: [

    /* ── S3.0 理论：鉴权 ≠ 加密，SMC 是「点火」开关 ── */
    discuss(
      '鉴权之后：有了密钥原料，还得用 SMC「点火」',
      'S2 鉴权成功让 UE 与网络各自长出同一棵密钥树——但这只是「原料」。此刻 NAS 消息仍未加密、未完保。NAS Security Mode Command（SMC）就是那个开关：选定算法、派生 NAS 密钥、把保护正式「点火」启用。',
      '为什么鉴权之后还要单独「激活」安全',
      '<h3>鉴权产出的是「原料」，不是「保护」</h3>'+
      '<p>S2 结束时，UE 与 AMF 各自独立算出了 <code>K_AMF</code>（及整棵树）。但<b>持有密钥 ≠ 已经加密</b>：'+
      '到目前为止，除首条 Registration Request 外，NAS 消息基本是<b style="color:#dc2626;">明文裸跑</b>的。'+
      '若就此放行后续流程（PDU 会话、5G-GUTI 分配……），这些信令可被窃听、篡改、注入。</p>'+
      '<h3>NAS SMC = 点火开关</h3>'+
      '<p>AMF 发起 <b>NAS Security Mode Command</b>，干三件事：</p>'+
      '<ul><li><b>选定算法</b>：从 UE 上报的安全能力里挑一对 NAS 算法（完整性 5G-IA、加密 5G-EA）；</li>'+
      '<li><b>派生密钥</b>：用 <code>K_AMF</code> + 选定算法 ID 派生 <code>K_NASint</code> / <code>K_NASenc</code>；</li>'+
      '<li><b>点火</b>：从 UE 回的 <b>Security Mode Complete</b> 起，NAS 信令<b style="color:#059669;">全程完整性保护 + 加密</b>。</li></ul>'+
      '<h3>一个微妙的不对称</h3>'+
      '<p>SMC 这条<b>下行</b>消息本身<b>已被完整性保护</b>（用刚派生的 K_NASint），但<b>尚未加密</b>'+
      '——因为 UE 必须先<b>明文读懂</b>里面「选了哪套算法」，才能派生出同样的密钥。'+
      '到 UE 回 SMP 时，上行才同时上了完保 + 加密。下一步看这一来一回。</p>'+
      '<p class="honesty" style="color:#dc2626;">越界（黑盒）：算法核（SNOW 3G / AES / ZUC）的比特级流密码运算属密码学内核，'+
      '1.0 已在 AS 层讲过原理，本沙盘只讲 NAS 层如何<b>选用与命名</b>，不重复展开内部运算。</p>',
      ['[5GMM] 鉴权成功，K_AMF 就位；但 NAS 尚未启用安全（明文）。',
       '[5GMM] AMF 准备发起 NAS Security Mode Command（选定算法 + 激活保护）。',
       '[INFO] 注意：SMC 本身先完保、暂不加密——UE 需明文读取所选算法。']
    ),

    /* ── S3.1 仿真（动画）：NAS SMC / SMP 双消息握手 ── */
    sim(
      'NAS 安全模式握手：SMC ↓ 完保先行，SMP ↑ 加密随后',
      'AMF 下发 NAS Security Mode Command（完整性保护、暂不加密，携选定算法与「回放的 UE 安全能力」）。UE 先核对回放能力防降级、验完整性、派生 K_NASint/K_NASenc，再回 Security Mode Complete（完保 + 加密）。从此 NAS 全程受保护。',
      'SMC / SMP · 防降级回放 · 完保先行加密随后',
      '<h3>一来一回，两条 NAS 消息</h3>'+
      '<table><tr><th>消息</th><th>方向</th><th>保护</th><th>关键载荷</th></tr>'+
      '<tr><td>① Security Mode <b>Command</b></td><td>AMF → UE</td><td>仅完整性（K_NASint）</td>'+
        '<td>selected 5G-IA/5G-EA、ngKSI、<b>replayed UE security capabilities</b></td></tr>'+
      '<tr><td>② Security Mode <b>Complete</b></td><td>UE → AMF</td><td><b style="color:#059669;">完整性 + 加密</b></td>'+
        '<td>（可含 IMEISV）</td></tr></table>'+
      '<h3>UE 收到 SMC 后的三步</h3>'+
      '<ul><li><b style="color:#dc2626;">核对回放能力（防降级）</b>：AMF 把它当初收到的「UE 安全能力」原样回放；'+
      'UE 比对是否与自己发出的一致。若中间人偷偷删掉了强算法（bidding-down 降级攻击），这里就会<b>对不上而被发现</b>；</li>'+
      '<li><b>验完整性</b>：用 K_NASint 校验 SMC 的 NAS-MAC；</li>'+
      '<li><b>派生密钥</b>：读出所选算法，派生 <code>K_NASint</code> / <code>K_NASenc</code>。</li></ul>'+
      '<h3>为什么 SMC「先完保、暂不加密」</h3>'+
      '<p>这是个鸡生蛋问题：UE 要先<b>明文看到</b>「选了哪套算法」，才能派生出加密钥。'+
      '所以 SMC 下行<b>只签名不加密</b>；等 UE 装好密钥、回 SMP 时，上行才<b>同时加密</b>。'+
      '此后所有 NAS（含 Registration Accept、PDU 会话信令）全程完保 + 加密。</p>'+
      '<h3>本沙盘真实密钥（从 S2 的 K_AMF 派生，可复现）</h3>'+
      '<p>选定 <code>128-5G-IA2 / 128-5G-EA2</code>（AES 核）。由 <code>K_AMF=db53a94f…f683</code> 经 '+
      'TS 33.501 Annex A.8（FC=0x69）派生：<code>K_NASint=a45af205…5bb5</code>、<code>K_NASenc=8707bda8…a6d4</code>，取 128 LSB。</p>',
      ['[5GMM] AMF → UE：NAS Security Mode Command（完整性保护，含 selected 5G-IA2/5G-EA2）。']
    ),

    /* ── S3.2 仿真（里程碑）：同核不同名 + 双层密钥派生 ── */
    sim(
      '同核不同名：NAS 叫 5G-IA/5G-EA，AS 叫 NIA/NEA',
      'NAS 层（TS 24.501）把算法叫 5G-IA/5G-EA，AS 层（1.0 讲的 TS 38.331）把同样的算法核叫 NIA/NEA——同一批核（NULL/SNOW3G/AES/ZUC），只是不同规范里的不同命名。两层密钥还各自独立：NAS 钥从 K_AMF 派生，AS 钥从 K_gNB 派生。',
      '5G-IA/5G-EA ↔ NIA/NEA · 双层密钥不同源',
      '<h3>同一批算法核，两套命名</h3>'+
      '<table><tr><th>算法核</th><th>NAS 命名(24.501)</th><th>AS 命名(38.331)</th></tr>'+
      '<tr><td>NULL（空）</td><td>5G-IA0 / 5G-EA0</td><td>NIA0 / NEA0</td></tr>'+
      '<tr><td>SNOW 3G</td><td>128-5G-IA1 / 128-5G-EA1</td><td>128-NIA1 / 128-NEA1</td></tr>'+
      '<tr><td><b style="color:#059669;">AES（本沙盘选用）</b></td><td><b>128-5G-IA2 / 128-5G-EA2</b></td><td>128-NIA2 / 128-NEA2</td></tr>'+
      '<tr><td>ZUC</td><td>128-5G-IA3 / 128-5G-EA3</td><td>128-NIA3 / 128-NEA3</td></tr></table>'+
      '<p>这正是 1.0 AS 层与 2.0 NAS 层最易混淆之处：<b style="color:#dc2626;">同核不同名</b>。'+
      '别把 NAS 的算法标成 NIA/NEA，也别把 AS 的标成 5G-IA/5G-EA——它们指向相同的密码学核，只是不同协议规范里的叫法。</p>'+
      '<h3>双层密钥：不同源</h3>'+
      '<table><tr><th>层</th><th>根</th><th>派生密钥</th><th>算法 ID 绑定</th></tr>'+
      '<tr><td><b style="color:#7c3aed;">NAS（本 Stage）</b></td><td>K_AMF</td><td>K_NASint / K_NASenc</td><td>5G-IA/5G-EA id</td></tr>'+
      '<tr><td><b style="color:#b45309;">AS（1.0 + S2 空投）</b></td><td>K_gNB</td><td>K_RRCint/enc · K_UPint/enc</td><td>NIA/NEA id</td></tr></table>'+
      '<p>关键：<b>即使两层选了同一个算法核（如都用 AES）</b>，由于<b>根密钥不同</b>（K_AMF vs K_gNB）'+
      '＋算法类型区分符不同（FC=0x69 的 P0：NAS-int=0x02 / NAS-enc=0x01），'+
      '派生出的密钥流<b style="color:#059669;">完全独立、互不相同</b>。一层被攻破不会殃及另一层。</p>'+
      '<div class="formula">K_AMF →(A.8) K_NASint/K_NASenc   |   K_gNB →(A.8) K_RRC*/K_UP*</div>'+
      '<p class="honesty" style="color:#dc2626;">越界：算法标识在 SMC 里以编号下发；具体编号到比特级实现的映射、各国监管对算法集的取舍'+
      '属运营商/规范实现细节，沙盘不展开。</p>',
      ['[5GMM] UE 比对：NAS 选定 128-5G-IA2/128-5G-EA2 = AES 核（= AS 层 128-NIA2/NEA2 同核）。',
       '[KEY] K_NASint / K_NASenc 已就位（源 K_AMF，与 AS 层 K_gNB 不同源）。']
    ),

    /* ── S3.3 探讨：NAS + AS 双层安全为何并存 ── */
    discuss(
      '双层安全：NAS 与 AS 为何必须并存',
      'NAS 安全护「UE↔核心网(AMF)」的信令——连 gNB 都不能偷看；AS 安全护「空口(UE↔gNB)」的 RRC 与用户数据。两层范围不同、威胁模型不同、密钥不同源，因此并存而非合并。至此 1.0 的 AS 层与 2.0 的 NAS 层在 UE 这端汇合。',
      '两层范围 · 威胁模型 · 与 1.0 缝合',
      '<h3>两层各保护什么</h3>'+
      '<table><tr><th>层</th><th>范围</th><th>保护对象</th><th>gNB 能否读</th></tr>'+
      '<tr><td><b style="color:#7c3aed;">NAS 安全</b></td><td>UE ↔ AMF（N1，端到端）</td>'+
        '<td>NAS 信令：注册、会话管理、GUTI 分配…</td><td><b style="color:#dc2626;">不能</b></td></tr>'+
      '<tr><td><b style="color:#b45309;">AS 安全</b></td><td>UE ↔ gNB（Uu 空口）</td>'+
        '<td>RRC 信令 + 用户面 DRB 数据（空口段）</td><td>能（它是端点）</td></tr></table>'+
      '<h3>为什么不能合并成一层</h3>'+
      '<ul><li><b>信任边界不同</b>：gNB 属<b>接入网</b>，在共享 RAN / 中立主机等场景下未必完全可信。'+
      'NAS 安全让核心网信令<b>对 gNB 也保持机密</b>——这是「接入网 ≠ 核心网」的安全体现；</li>'+
      '<li><b>威胁与范围不同</b>：AS 安全防的是<b>无线空口</b>的窃听/篡改，只覆盖到 gNB；'+
      'NAS 安全覆盖到核心网 AMF；</li>'+
      '<li><b>密钥不同源</b>：NAS 钥来自 <code>K_AMF</code>、AS 钥来自 <code>K_gNB</code>，一层被攻破不殃及另一层。</li></ul>'+
      '<h3>与 1.0 缝合：双层根都已就位</h3>'+
      '<p>到这里，安全的两条根都补齐了：AS 层的根 <code>K_gNB</code> 是 <b>S2 空投</b>给 gNB 的'+
      '（还清 1.0 Stage 8 的债）；NAS 层的根 <code>K_NASint/K_NASenc</code> 是<b>本 Stage</b> 从 K_AMF 派生的。'+
      '1.0 讲的 AS 安全（K_RRC*/K_UP*）与 2.0 讲的 NAS 安全，<b style="color:#059669;">在 UE 这一端汇合成完整的双层防护</b>。</p>'+
      '<p class="honesty" style="color:#dc2626;">越界（黑盒）：NAS COUNT 维护、密钥更新（rekeying）、水平/垂直密钥派生（切换时）'+
      '等属实现/移动性细节，沙盘不展开。下一步：安全已激活，AMF 下发 Registration Accept 完成注册（Stage 4）。</p>',
      ['[5GMM] UE → AMF：NAS Security Mode Complete（完保 + 加密）。NAS 安全上下文激活。',
       '[SEC] 双层并存确认：NAS(K_AMF 系) + AS(K_gNB 系) 密钥不同源、范围互补。',
       '[READY] NAS 安全就绪。下一步：Registration Accept + 5G-GUTI 分配（Stage 4）。']
    ),

  ]};
  /* ════════════════════════════════════════════════════════════════════
     STAGE 4 · 注册完成 & 5G-GUTI  (4 sub-steps: 0,1,2,3)  ★ 完整
     配色：AMF 紫(注册主角·分配 GUTI) / 答案绿(REGISTERED 里程碑·GUTI 安全) /
          身份金(SUCI/ECIES) / 告警红(SUPI 暴露·越界) / UE slate · gNB 灰
     核心产出 = 5G-GUTI（AMF 分配的临时身份）+ reg_state→REGISTERED，
             在 S4.1 Registration Complete 完成回调里写（分配/登记才写，零先验）。
     物理红线：5G-GUTI 是临时、可轮换身份（注册后替代 SUCI）；
              5G-S-TMSI(48bit)=空口寻呼压缩形，缝合 1.0 AS 层（踩坑 #11/#20 邻域）；
              Registration Complete 是条件性回执（仅分配新 GUTI 等 IE 时必须回）。
     ════════════════════════════════════════════════════════════════════ */
  var S4 = { subSteps: [

    /* ── S4.0 理论：安全激活后，AMF 为注册收尾 ── */
    discuss(
      '安全已激活：AMF 为注册「盖章生效」',
      'S2 鉴权 + S3 安全激活之后，AMF 才放心地下发受保护的 Registration Accept，把这次注册正式确认下来——同时给 UE 分配临时身份 5G-GUTI、配置注册定时器。UE 由此进入 5GMM-REGISTERED。这是「能上网」前的最后一道登记手续。',
      '为什么注册要等到鉴权 + 安全激活之后',
      '<h3>注册的「收尾」发生在安全激活之后</h3>'+
      '<p>从 S1 发出 Registration Request 起，UE 就进入了过渡态 <code>5GMM-REGISTERED-INITIATED</code>。'+
      '但 AMF 不会在鉴权完成前就放行——必须先经过 S2 的 5G-AKA（确认「你是真的你」）与 S3 的 NAS SMC'+
      '（把保护「点火」启用），AMF 才下发 <b>Registration Accept</b>，正式把注册<b>确认生效</b>。</p>'+
      '<h3>Registration Accept 携带什么（受 NAS 安全保护 🔒）</h3>'+
      '<table><tr><th>IE</th><th>作用</th></tr>'+
      '<tr><td><b style="color:#059669;">5G-GUTI</b></td><td>网络分配的<b>临时身份</b>，后续用它替代 SUCI（详见下一步）</td></tr>'+
      '<tr><td><b style="color:#7c3aed;">TAI List</b></td><td>注册区域：UE 在区内移动<b>免重新注册</b></td></tr>'+
      '<tr><td><b style="color:#b45309;">T3512 等定时器</b></td><td>周期注册更新 / 可达性维持（保活心跳）</td></tr>'+
      '<tr><td>Allowed NSSAI</td><td>允许使用的网络切片（S5 建会话时用于路由选择）</td></tr></table>'+
      '<h3>UE 的回执：Registration Complete</h3>'+
      '<p>UE 收到 Accept、存好 5G-GUTI 后，回一条 <b>Registration Complete</b> 作确认。'+
      '<b style="color:#dc2626;">物理诚实</b>：这条回执是<b>条件性</b>的——仅当 Accept 里<b>分配了新的 5G-GUTI</b>'+
      '（或其它需确认的 IE）时，UE 才必须回。初始注册必分配 GUTI，所以这里一定会回。</p>'+
      '<div class="formula">DEREGISTERED →(S1 Reg Req)→ REGISTERED-INITIATED →(S2 AKA / S3 SMC)→ <b>REGISTERED</b></div>'+
      '<p class="honesty" style="color:#dc2626;">越界（黑盒）：AMF 重选 / 负载均衡、去注册（De-registration）、紧急注册等流程属移动性管理细节，'+
      '本沙盘只讲 Initial Registration 的收尾：Accept / Complete + 5G-GUTI 分配 + 定时器。</p>',
      ['[5GMM] 鉴权(S2) + NAS 安全激活(S3) 完成，AMF 准备下发 Registration Accept。',
       '[5GMM] 当前 5GMM 状态：REGISTERED-INITIATED（等待 Accept 确认注册）。',
       '[INFO] Accept 将受 NAS 安全保护（完保 + 加密），携 5G-GUTI / TAI List / 定时器。']
    ),

    /* ── S4.1 仿真（动画·里程碑）：Registration Accept / Complete 握手 ── */
    sim(
      'Registration Accept ↓ 携 5G-GUTI，Complete ↑ 回执',
      'AMF 下发受保护的 Registration Accept（携 5G-GUTI、TAI List、T3512、Allowed NSSAI）。UE 解密验完保、存储 5G-GUTI、配置定时器、进入 5GMM-REGISTERED，并回 Registration Complete 确认收到新身份。注册至此完成——核心网正式接纳了这台 UE。',
      'Accept / Complete · 受保护 · 注册完成里程碑',
      '<h3>一来一回，注册收尾</h3>'+
      '<table><tr><th>消息</th><th>方向</th><th>保护</th><th>关键载荷</th></tr>'+
      '<tr><td>① Registration <b>Accept</b></td><td>AMF → UE</td><td><b style="color:#059669;">完保 + 加密</b></td>'+
        '<td>5G-GUTI · TAI List · T3512 · Allowed NSSAI</td></tr>'+
      '<tr><td>② Registration <b>Complete</b></td><td>UE → AMF</td><td>完保 + 加密</td>'+
        '<td>确认已收到 / 存好新 5G-GUTI</td></tr></table>'+
      '<h3>UE 收到 Accept 后的四步</h3>'+
      '<ul><li><b>解密 / 验完保</b>：用 S3 派生的 <code>K_NASint/K_NASenc</code> 处理（gNB 透明转发，看不到内容）；</li>'+
      '<li><b style="color:#059669;">存储 5G-GUTI</b>：从此用临时身份替代 SUCI；</li>'+
      '<li><b>配置定时器</b>：按 Accept 里的 T3512 设周期注册定时器；</li>'+
      '<li><b style="color:#7c3aed;">进入 5GMM-REGISTERED</b>：状态机到达终态。</li></ul>'+
      '<h3>AMF 侧同步登记</h3>'+
      '<p>AMF 在自己的 5GMM 上下文里把 <b>SUPI ↔ 新分配的 5G-GUTI</b> 绑定、记录 UE 的注册区域（TAI List）、'+
      '启动 <b>Mobile Reachable 定时器</b>，并将 UE 标记为 <code>REGISTERED</code>。</p>'+
      '<h3>这是一个里程碑，但还不是终点</h3>'+
      '<p>UE 现在是 <b style="color:#059669;">5GMM-REGISTERED</b>——核心网「认识、接纳」了它。'+
      '但<b>还没有任何数据通路</b>：要上网，还差 S5 建立 PDU 会话（拿 IP）+ S6 的 DRB 落地。</p>'+
      '<p class="honesty" style="color:#dc2626;">物理诚实：Registration Complete 是条件性回执（仅分配新 5G-GUTI 等 IE 时必须回）；'+
      'Accept/Complete 全程受 NAS 安全保护，承接 S3 的 K_NAS*。</p>',
      ['[5GMM] AMF → UE：Registration Accept（完保+加密，携 5G-GUTI / TAI List / T3512）。']
    ),

    /* ── S4.2 仿真（里程碑）：5G-GUTI 结构 + 身份三级轮换 ── */
    sim(
      '5G-GUTI 解剖：临时身份的结构，与身份三级轮换',
      '5G-GUTI = GUAMI（定位到具体 AMF：MCC/MNC + Region/Set ID/Pointer）+ 5G-TMSI（32 bit 轮换编号）。注册后 UE 用这个临时身份替代 SUCI，既省去每次 ECIES 重算，又让「连隐藏后的标识也不必反复上空口」。AMF 还可周期/事件性地重新分配 GUTI，进一步抗追踪。',
      '5G-GUTI 结构 · SUPI→SUCI→GUTI · Unlinkability',
      '<h3>5G-GUTI 的结构（TS 23.003 §2.10）</h3>'+
      '<table><tr><th>部分</th><th>字段</th><th>说明</th></tr>'+
      '<tr><td rowspan="2"><b style="color:#7c3aed;">GUAMI</b><br>(定位 AMF)</td><td>MCC + MNC</td><td>运营商 PLMN（与 SUPI 一致）</td></tr>'+
      '<tr><td>Region(8b)+Set ID(10b)+Pointer(6b)</td><td>= 24 bit，全球唯一定位到<b>具体哪个 AMF</b></td></tr>'+
      '<tr><td><b style="color:#059669;">5G-TMSI</b></td><td>32 bit</td><td>轮换的临时编号（本沙盘顶栏 token 取此）</td></tr></table>'+
      '<p><b>5G-S-TMSI</b> = Set ID + Pointer + 5G-TMSI = <b>48 bit</b>，是<b>空口寻呼 / 服务请求</b>用的压缩形。'+
      '<b style="color:#7c3aed;">缝合 1.0 Stage 8</b>：有了 5G-S-TMSI，UE 下次发 Msg3（<code>RRCSetupRequest</code>）就不必再填 39-bit 纯随机数——'+
      '直接取它的<b>低 39 位（最右 / LSB，即 <code>ng-5G-S-TMSI-Part1</code>）</b>填进 <code>ue-Identity</code>，'+
      '剩余高 9 位（<code>Part2</code>）在 RRCSetupComplete 补齐（39+9=48）。因这是网络分配的<b>唯一</b>标识，'+
      '竞争解决（contention resolution）阶段<b style="color:#059669;">几乎不会撞车</b>（优于纯随机的概率性避撞）。</p>'+
      '<h3>身份三级演进：暴露面逐级收窄</h3>'+
      '<table><tr><th>身份</th><th>何时用</th><th>暴露程度</th></tr>'+
      '<tr><td><b style="color:#dc2626;">SUPI</b></td><td>仅 UE/USIM 本地 + UDM 深处</td><td><b>永不上空口</b>（真实永久身份）</td></tr>'+
      '<tr><td><b style="color:#b45309;">SUCI</b></td><td>首次接入的上行（S1）</td><td>ECIES 隐藏 SUPI，每次 eph 全新（非确定）</td></tr>'+
      '<tr><td><b style="color:#059669;">5G-GUTI</b></td><td>注册成功后的日常信令</td><td>临时编号，替代 SUCI，<b>可再轮换</b></td></tr></table>'+
      '<h3>为什么注册后改用 5G-GUTI</h3>'+
      '<ul><li><b>省开销</b>：免去每次接入都做 ECIES 公钥加密重算；</li>'+
      '<li><b>减暴露</b>：连「已隐藏的」SUCI 也不必反复上空口；</li>'+
      '<li><b style="color:#059669;">抗追踪（GUTI Reallocation）</b>：AMF 可周期/事件性重新分配 GUTI，临时身份不断轮换，'+
      '难以长期关联同一 UE——与 S1.3 的「SUCI 非确定性」并列，构成<b>双重 unlinkability</b>。</li></ul>'+
      '<div class="formula">5G-GUTI = GUAMI(460-01-0xCA-0x0A1-0x01) + 5G-TMSI(0x8A3F1C20)</div>'+
      '<p class="honesty" style="color:#dc2626;">越界：GUTI 的比特级打包、AMF 集/区域规划、AMF 重选时 GUAMI 变更属运营商部署细节；'+
      'Region/Set ID/Pointer 在本沙盘为示例值，MCC/MNC 与 S1 的 SUPI（460/01）一致。</p>',
      ['[ID] 5G-GUTI 已分配：GUAMI=460-01-0xCA-0x0A1-0x01 · 5G-TMSI=0x8A3F1C20。',
       '[PRIV] 身份轮换：SUPI(永不上空口) → SUCI(ECIES) → 5G-GUTI(临时·可再轮换)。']
    ),

    /* ── S4.3 探讨：注册定时器 + 周期注册 + TAI List + 收尾 ── */
    discuss(
      '注册维持：定时器「心跳」与 TAI List「活动范围」',
      'AMF 给 UE 划定 TAI List（注册区域），区内移动免重注册、跨出才触发 Mobility Registration。一组定时器（UE 的 T3512 周期注册、AMF 的 Mobile Reachable / Implicit De-registration）构成「保活心跳」，让 AMF 知道 UE 还活着、还可被寻呼。至此身份、安全、可达性三件事齐备——但要上网还差 PDU 会话。',
      'TAI List · 定时器三件套 · 注册类型 · 状态汇总',
      '<h3>TAI List：注册区域</h3>'+
      '<p>Accept 里的 <b>TAI List</b> 是 AMF 划给 UE 的「活动范围」。UE 在区内移动<b>免重新注册</b>；'+
      '而当网络有<b>下行数据要找 UE</b>（且 UE 处于 CM-IDLE）时，AMF 会让这<b>区内所有基站齐发寻呼（Paging）</b>广播找人。'+
      '于是出现核心博弈：<b style="color:#dc2626;">区划得大</b> → 寻呼广播开销大；<b style="color:#dc2626;">区划得小</b> → '+
      'UE 频繁跨区、重注册耗电耗信令——TAI List 的大小，就是在「寻呼开销」与「移动性信令开销」之间找平衡。'+
      '这与 S1.1 呼应：当初 gNB 在上行 NGAP 里给 UE 盖了 TAI 邮戳让 AMF 知道它在哪；现在 AMF 反手把「你注册在哪些区域」告诉 UE。</p>'+
      '<h3>保活心跳：三个定时器</h3>'+
      '<table><tr><th>定时器</th><th>位置</th><th>作用</th></tr>'+
      '<tr><td>T3512</td><td>UE</td><td>周期注册更新定时器：到点就发 Periodic Registration</td></tr>'+
      '<tr><td>Mobile Reachable</td><td>AMF</td><td>略长于 T3512；超时仍无音讯 → 视 UE 不可达</td></tr>'+
      '<tr><td>Implicit De-reg</td><td>AMF</td><td>再超时 → 隐式去注册，释放 5GMM 上下文</td></tr></table>'+
      '<p>逻辑链：<b>UE 定期「报平安」</b>（T3512）→ AMF 借此确认 UE 还活着、还可被寻呼；若长期失联，AMF 逐级超时后'+
      '清掉它的上下文，避免资源被占着。</p>'+
      '<h3>四种注册类型</h3>'+
      '<table><tr><th>类型</th><th>触发</th></tr>'+
      '<tr><td><b style="color:#059669;">Initial（本沙盘）</b></td><td>首次向网络注册</td></tr>'+
      '<tr><td>Mobility</td><td>移动出注册区 / TAI 变化</td></tr>'+
      '<tr><td>Periodic</td><td>T3512 到点，周期性报平安</td></tr>'+
      '<tr><td>Emergency</td><td>紧急业务（越界，不展开）</td></tr></table>'+
      '<h3>注册完成后的状态汇总</h3>'+
      '<table><tr><th>维度</th><th>状态</th></tr>'+
      '<tr><td>RM（注册管理）</td><td><b style="color:#059669;">RM-REGISTERED</b></td></tr>'+
      '<tr><td>5GMM</td><td><b style="color:#059669;">5GMM-REGISTERED</b>（可发起会话 / 业务请求）</td></tr>'+
      '<tr><td>CM（连接管理）</td><td><b style="color:#7c3aed;">CM-CONNECTED</b>（有 N2 信令连接；空闲可转 CM-IDLE）</td></tr></table>'+
      '<p style="color:#059669;"><b>注册完成 ✓</b>：核心网已「认识、接纳并能找到」这台 UE——身份、安全、可达性三件事齐备。'+
      '但此刻<b>仍没有一条数据通路</b>：要上网，还差 S5 建立 PDU 会话（拿 IP）+ S6 的 DRB 落地。</p>'+
      '<p class="honesty" style="color:#dc2626;">越界（黑盒）：T3512/T3502 等定时器精确取值、TAU 完整移动性流程、紧急/去注册流程属移动性管理。'+
      '下一步（S5）：UE 在受保护的 NAS 上捎带 PDU Session Establishment Request，向 SMF 要一条「水管」。</p>',
      ['[5GMM] UE → AMF：Registration Complete。注册完成，5GMM-REGISTERED。',
       '[TIMER] T3512（周期注册）就绪；AMF 启动 Mobile Reachable 定时器（保活）。',
       '[READY] 注册完成：身份/安全/可达性齐备。下一步：建立 PDU 会话上网（Stage 5）。']
    ),

  ]};
  /* ════════════════════════════════════════════════════════════════════
     STAGE 5 · PDU 会话建立  (4 sub-steps: 0..3)  ★ 完整
     配色：SMF 蓝绿(N4/PFCP登场) / UPF 青(用户面·N3/N6/N9) / 受保护的 NAS(锁 接 S3/S4) /
          AMF 紫(拨号员+N11转介) / gNB slate(1.0 延续) / 答案绿(CP 建立里程碑) /
          琥珀(DNN/S-NSSAI·钥匙) / 越界红(PCF/CHF·N6 物理尽头)
     核心产出 = pdu_session_id(本沙盘=1) / ssc_mode(本例=1,IP锚定) / ue_ip_addr(UPF分配)，
             在 S5.2 N4/PFCP 成功回执里写回（分配才写，零先验）。
     物理红线：N6 接口是物理世界的尽头(本沙盘），外部 Internet 路由(BGP 等)黑盒；
              PCF 与 CHF 隐身（默认静态QoS/计费策略）; 多切片仅提 S-NSSAI。
     ════════════════════════════════════════════════════════════════════ */
  var S5 = { subSteps: [

    /* ── S5.0 理论：为什么要单独建 PDU 会话 ── */
    discuss(
      'PDU 会话：从「有身份」到「有水路」的一步',
      'S4 注册完成，核心网「认识、接纳并能找到」UE——但还不存在任何供数据传输的通道。PDU 会话就是用来建这条「水管」的：UE 发起请求（携 DNN / S-NSSAI）、SMF 选 UPF、N4/PFCP 装隧道规则、UPF 分配 UE IP——至此 CP（控制面）就绪，但 UP（用户面 DRB）还未落地到空口。',
      '为什么注册后还需独占一步：N4/PFCP 登场、SMF/UPF 担纲',
      '<h3>什么是 PDU 会话</h3>'+
      '<p>它是 UE ↔ UPF 之间的一条<b>逻辑通路</b>。核心交付物：① <b>UE IP 地址</b>（由 UPF 分配）；② <b>UPF 隧道</b>（N3/N9 分段建立，N4/PFCP 驱动）；③ <b>QoS Flow</b>（S6 交给 DRB 落地）。</p>'+
      '<h3>谁参与</h3>'+
      '<table><tr><th>网元</th><th>角色</th></tr>'+
      '<tr><td><b style="color:#7c3aed">AMF</b></td><td>拨号员：转发 NAS-SM（看不透内容），选 SMF</td></tr>'+
      '<tr><td><b style="color:#0d9488">SMF</b></td><td>总导演（控制面CP）：管理会话上下文、选 UPF、组装隧道规则</td></tr>'+
      '<tr><td><b style="color:#2563eb">UPF</b></td><td>搬运工（用户面UP）：按规则转发报文、挂 UE IP</td></tr>'+
      '<tr><td><b style="color:#0891b2">gNB</b></td><td>空口端（来自1.0 & S2「空投」K_gNB）</td></tr>'+
      '<tr><td><b style="color:#d97706">UDM</b></td><td>签约检查（DNN / S-NSSAI 是否允许）</td></tr></table>'+
      '<h3>五泳道全景</h3>'+
      '<p>UE 发出请求（经 AMF 转介）→ SMF 去 UDM 查签约 → 选 UPF → 通过 <b>N4/PFCP</b> 给 UPF 装隧道 → UPF 分配 IP → 回 Accept。'+
      'CP（控制面）至此建成——但用户面还需 S6 的 DRB 落地。</p>'+
      '<div class="formula">NAS-SM 全程受保护 🔒（S3 的 K_NAS*），经 AMF 透传；gNB 看不见内容</div>'+
      '<p class="honesty" style="color:#dc2626;">越界（黑盒）：PCF（策略）选定 SM/UP 策略 → 本沙盘用默认 QoS 与计费；'+
      'CHF（计费）未现身；多切片仅提 S-NSSAI 路由选择 → NSSF 不展开。</p>',
      ['[5GSM] 5GMM-REGISTERED（S4），NAS 安全已激活（S3）。',
       '[5GSM] 准备 PDU Session Establishment Request：DNN=internet, S-NSSAI=1, SSC Mode=1。',
       '[5GSM] 目标：建 UE ↔ UPF 数据通路 → N4/PFCP 登场 → 拿 IP + 隧道。']
    ),

    /* ── S5.1 仿真（动画·里程碑）：五泳道 CP 建路 ── */
    sim(
      '五泳道 · CP 建路：AMF 转介 → SMF 选路 → UPF 分配 IP',
      'AMF 透传 PDU Session Establishment Request 给 SMF，SMF 去 UDM 查 DNN/S-NSSAI 签约，选好 UPF 后透过 N4/PFCP 给 UPF 装 PDR/FAR（包检测与转发规则），UPF 完成资源分配后分配 UE IP 地址并回 Accept（经 AMF 透传给 UE）。CP 建成。',
      'UE→AMF→SMF→UDM→UPF 流程链 · N4/PFCP 包规则',
      '<h3>NAS-SM：专门管会话的信令</h3>'+
      '<p>NAS-SM 消息嵌入 NAS-MM 中经 AMF 透传，AMF 只看外层信封、不拆内层内容。'+
      '<b style="color:#dc2626;">诚实点</b>：AMF 对 SM 层的透明性是<b>核心网解耦</b>的核心兑现——'+
      'AMF（连接管理）不沾 UE IP、不碰 UPF、不录会话上下文，这些全属 SMF（会话管理）的领地。</p>'+
      '<h3>UF Selection：选哪个 UPF</h3>'+
      '<p>SMF 依据 DNN / S-NSSAI / SSC Mode / UE 位置 / UPF 负载——<b>本沙盘默认静态选一个 UPF</b>（非真实动态负载均衡）。</p>'+
      '<h3>N4/PFCP：SMF ↔ UPF 的语言</h3>'+
      '<p>PFCP 是 UPF 的「遥控协议」：SMF 下发 <b>PDR</b>（包检测规则：识别哪个流）+ <b>FAR</b>（转发动作：出口/封装 GTP-U）。'+
      '此后 UPF 就能按规则把进出 UE 的报文导向 N6（外部网络）或 N3→gNB。</p>'+
      '<h3>SSC Mode（本沙盘=1，IP 锚定）</h3>'+
      '<p>SSC=1（原锚定）：UE IP 在整个会话期间<b>不随移动换 UPF</b>（IP 锚于首个 UPF）；'+
      'SSC=2（先断后建）/ 3（先建后断）更灵活但复杂度更高——本沙盘只展示 SSC=1。</p>'+
      '<table><tr><th>参数</th><th>本例</th></tr>'+
      '<tr><td>DNN（数据网络名）</td><td><code>internet</code></td></tr>'+
      '<tr><td>S-NSSAI</td><td><code>SST=1 (eMBB)</code></td></tr>'+
      '<tr><td>SSC Mode</td><td><code>1</code>（IP 锚定）</td></tr>'+
      '<tr><td>PDU Session Type</td><td><code>IPv4</code></td></tr></table>'+
      '<h3>里程碑：CP 建成 ✓（但仍不能上网）</h3>'+
      '<p>UE IP 已分配、N4 隧道已就位、核心网侧水路已通。但用户面数据要落到空口还需 <b>S6</b> 建 QoS Flow → DRB，'+
      '由 RRCReconfiguration 把 DRB 的无线参数（RLC-Config / 逻辑信道等）通知 UE，'+
      '这是 2.0 唯一一次「回到 1.0 的 AS 层」，完成空口/核心网的缝合。</p>',
      '<p class="honesty" style="color:#dc2626;">越界（黑盒）：PCF（策略控制）替 SMF 算 SM/UP 策略 → 本沙盘默认静态路由；CHF（计费）隐身。'+
      'N6 接口是物理世界的尽头，外部 Internet 路由(BGP等)黑盒。</p>',
      ['[5GSM] UE→AMF(透明)→SMF：PDU Session Establishment Request。',
       '[5GSM] DNN=internet, S-NSSAI=1(eMBB), SSC=1, Type=IPv4。']
    ),

    /* ── S5.2 探讨（里程碑·命名空间注入）：CP 建成产什么 + 命名空间 ── */
    discuss(
      'CP 建成之后：产出一根「水管」的编号与 UE IP',
      'PDU Session Establishment Accept 带着 UE IP 和会话参数回到 UE：pdu_session_id、分配到的 IPv4 地址、SSC Mode、QoS 参数集。这是 AMF 看不见内容但 AMF 帮忙转递的——NAS-SM 全程受 S3 的 NAS 安全保护。但此刻 DRB 还没落空口：数据包在 UPF 侧可以进出，在空口侧还没通。',
      'CP 建成的产出（不展开 N6 外部路由）',
      '<h3>这一步骤的产出</h3>'+
      '<table><tr><th>产出</th><th>归属</th><th>下游</th></tr>'+
      '<tr><td><b style="color:#0d9488;">PDU 会话 ID</b></td><td>UE & SMF</td><td>本沙盘=1；后续 DRB 锚于该会话</td></tr>'+
      '<tr><td><b style="color:#059669;">UE IPv4 地址</b></td><td>UPF 分配</td><td>终端可 ping 互联网（需 S6 DRB）</td></tr>'+
      '<tr><td><b style="color:#b45309;">GTP-U 隧道 TEID</b></td><td>N3 (gNB↔UPF)</td><td>用户面报文携带的隧道标识</td></tr>'+
      '<tr><td>QoS 参数集（5QI=9 默认）</td><td>SMF→gNB→UE</td><td>S6 建 QoS Flow + DRB 用</td></tr>'+
      '<tr><td><b style="color:#7c3aed;">N4 会话上下文</b></td><td>SMF & UPF</td><td>PDR·FAR·QER·URR（包检测转发 QoS 用量上报）</td></tr></table>'+
      '<h3>N2 SM Info（gNB 接到的构建炸药包）</h3>'+
      '<p>SMF 会附带一段 <b>N2 SM Info</b>（透传 AMF→gNB），这是给 gNB 的「建 DRB 炸药包」。'+
      '<b style="color:#dc2626;">诚实点</b>：N2 是 NGAP 层（gNB↔AMF），N1 是 NAS 层（UE↔AMF）。'+
      'N2 SM Info 对 AMF 透明、不可解读，最终由 gNB 消费——其内容正是 S6 RRCReconfiguration 的构建弹药。</p>'+
      '<h3>SSC=1 的后果：IP 不动</h3>'+
      '<p>本沙盘选用 SSC=1（IP 锚定），这意味着<b>即使 UE 移动换 gNB，IP 仍指向原始 UPF</b>（需要 I-UPF 插入）。'+
      '由于本沙盘不涉及移动性，SSC=2/3 不展开。</p>'+
      '<p class="honesty" style="color:#dc2626;">越界（黑盒）：N2 SM Info 的比特结构、GTP-U 封装细节、UPF 内部散列/分流、'+
      'SSC=2/3 的 IP 锚点迁移、PDU Session 修改/释放流程均属实现细节。'+
      '下一步（S6）：把 CP 建的水路「落空口」——QoS Flow → DRB。</p>',
      ['[5GSM] PDU Session Establishment Accept（受保护🔒）：PDU Session ID=1, IPv4, SSC=1。',
       '[5GSM] AF 侧：N4 会话上下文已建，UPF PDR/FAR 隧道就绪。',
       '[READY] CP（控制面）水管已通；下一步：QoS 与 DRB 建用户面空口（S6）。']
    ),

    /* ── S5.3 探讨（缝合 1.0/多切片/PCF/CHF/空口对接/N4 结构）─── */
    discuss(
      'PDU 会话的「周围」：多切片、安全缝合、策略与分界',
      '这条「水管」周围还有几样东西值得看清：S-NSSAI 充当切片路由钥匙、NAS 安全为会话信令提供端到端保护、PCF 与 CHF 隐身但说明其策略/计费角色、以及为何需要额外的 N4 结构细节作为 S6 落地前的 CP 锚点。',
      'S-NSSAI 切片路由 · NAS 安全缝合 S3/S4 · PCF/CHF 隐身 · S6 路标',
      '<h3>S-NSSAI：切片路由钥匙</h3>'+
      '<p><code>S-NSSAI = SST (8 bit) + 可选 SD (24 bit)</code>。本沙盘用 <code>SST=1</code>（eMBB）：AMF 据此选 SMF、'+
      'SMF 据此选 UPF、签约校验时查 UDM。</p>'+
      '<h3>NAS 安全之「端到端」</h3>'+
      '<p>PDU 会话建路全过程受 S3 派生的 NAS 完整性与加密保护（K_NAS*）。'+
      '中间穿过的 RAN/gNB 完全透明、不可解读——核心网信令的<b>端到端安全性</b>是对 1.0 AS 层安全的补充。</p>'+
      '<h3>PCF 与 CHF 在哪里（隐身说明）</h3>'+
      '<p>PCF 与 CHF 是策略、QoS 参数和计费规则的发源地。<b>本沙盘场景初期默认静态 QoS</b>（5QI=9, ARP 低优先）'+
      '且不涉及在线/离线计费，因此<b>暂不实例化</b>——但现实 5GC 中 5QI 取值与计费起点均源于这两套网络功能。</p>'+
      '<h3>N4 实体组成（建路机关枪）</h3>'+
      '<table><tr><th>规则</th><th>作用</th></tr>'+
      '<tr><td>PDR（Packet Detection Rule）</td><td>识别属于这条会话的报文（五元组/SDF/QFI/UE IP…）</td></tr>'+
      '<tr><td>FAR（Forwarding Action Rule）</td><td>UPF 把报文转发到哪：进 N6（外部网）还是进 N3（gNB GTP-U 隧道）</td></tr>'+
      '<tr><td>QER（QoS Enforcement Rule）</td><td>门控/速率限制（承载级 QoS）</td></tr>'+
      '<tr><td>URR（Usage Reporting Rule）</td><td>流量统计（计费用）</td></tr></table>'+
      '<p class="honesty" style="color:#dc2626;">越界（黑盒）：PCF（策略/计费控制）与 CHF（在线/离线计费）是 5GC 策略与计费的核心，'+
      'S-NSSAI 的比特级编码与 NSSF 选择逻辑、PCC（Policy and Charging Control）rule 下发协议'+
      '及 PCF/SMF 交互（Npcf/N7）属核心网策略控制详细环节——本沙盘仅讲建连，不作 PCC 展开。'+
      '下一步（S6）：CP→UP 落地，通过 RRCReconfiguration 建 DRB，回到 1.0 AS 层。</p>',
      ['[5GSM] PDU 会话控制面（CP）已完成；用户面（UP）还需 S6 DRB 落空口。',
       '[PRIV] NAS 安全双保（S3 的 K_NAS int/enc）覆盖 PDU 会话信令。',
       '[READY] 准备移交 S6：通过 N2 SM Info → gNB 建 DRB → RRCReconfiguration 回 AS。']
    ),

  ]};
  /* ════════════════════════════════════════════════════════════════════
     STAGE 6 · QoS 与 DRB 落地（UP · 终点）  (4 sub-steps: 0..3)  ★ 完整
     配色：UPF navy(用户面/SDAP/DRB/数据流主角) / SMF 青蓝(核心 QoS Flow) /
          gNB 深灰(S6 重新成为主角·建 DRB) / AMF 紫(NGAP 转发) /
          答案绿(DRB 建成·首包出 N6·还债点睛，稀缺) / 高光红(上不了网/边界，稀缺) /
          身份金(极客提示 Reflective QoS / SDAP header，少量)
     核心产出 = drb_id(本沙盘=1) + 回填 pdu_sessions[0].drb_id，在 S6.1 drbAnim 完成回执里写（建好才写，零先验）。
     物理红线：QoS Flow(核心网粒度)≠DRB(空口粒度)，SDAP 做 QFI→DRB 映射(踩坑#16)；SDAP 是 5G AS 层新增；
              RRCReconfiguration 是 2.0 唯一一次回 1.0 AS 层；N6 是物理世界尽头(踩坑#17)；
              PCF/CHF 隐身(静态策略)，NSSF/N9/IPv6/BGP 越界黑盒。
     ════════════════════════════════════════════════════════════════════ */
  var S6 = { subSteps: [

    /* ── S6.0 理论：两级 QoS 模型 + SDAP 登场 ── */
    discuss(
      '最后一公里：QoS Flow 落到 DRB，SDAP 当「分拣员」',
      'S5 在控制面建好了会话、拿到了 IP，但数据还落不到空口。原因在于 5G 把 QoS 拆成了两级：<b>核心网粒度的 QoS Flow</b>（用 QFI 标识）与 <b>空口粒度的 DRB</b>（无线承载）。承接这两级的，是 5G AS 层新增的子层 <b>SDAP</b>——它像快递分拣员，把进出的 QoS Flow 按 QFI 分拣到合适的 DRB。',
      '4G 一管到底 vs 5G 两级 · SDAP 的角色 · 5QI/QFI',
      '<h3>4G 与 5G：同一件事的两种做法</h3>'+
      '<table><tr><th></th><th>4G / LTE</th><th>5G NR</th></tr>'+
      '<tr><td>QoS 粒度</td><td><b>EPS Bearer 一管到底</b>（UE↔网关同一承载）</td>'+
        '<td><b>两级</b>：QoS Flow（核心网）+ DRB（空口）</td></tr>'+
      '<tr><td>标识</td><td>EPS Bearer ID</td><td>QFI（QoS Flow）+ DRB-Identity</td></tr>'+
      '<tr><td>衔接子层</td><td>无（PDCP 直接上 IP）</td><td><b style="color:#1e3a8a;">SDAP（新增）</b></td></tr></table>'+
      '<p>5G 这样拆，是为了让「一条业务流」与「一条空口承载」<b>解耦</b>：核心网只管按 5QI 承诺质量，空口怎么把多条流并/拆到 DRB 上，由 RAN 灵活决定。</p>'+
      '<h3>四个 QoS 名词，一次讲清</h3>'+
      '<table><tr><th>名词</th><th>是什么</th></tr>'+
      '<tr><td><b>5QI</b>（5G QoS Identifier）</td><td>一张「QoS 配方表」的索引：时延/丢包/是否保证速率等。本沙盘 <code>5QI=9</code>＝非保证速率（non-GBR），相当于 4G 默认承载。</td></tr>'+
      '<tr><td><b>ARP</b>（Allocation &amp; Retention Priority）</td><td>5QI 形影不离的「护法」：决定基站<b>拥塞时谁的 DRB 优先保留、谁可被抢占丢弃</b>。它是复合参数＝优先级等级（1~15，<b>越小越高</b>）+ 抢占能力 + 被抢占性。本沙盘 <code>ARP=9</code>（普通上网的典型低优先级；VoNR/紧急呼叫则用很小的数＝高优先）。</td></tr>'+
      '<tr><td><b>QoS Flow / QFI</b></td><td>核心网里「同一套 QoS 待遇」的一束包；QFI（6 bit，0~63）是它的编号。SMF 决定、经 N2 SM info 告诉 gNB。</td></tr>'+
      '<tr><td><b>DRB</b>（Data Radio Bearer）</td><td>UE↔gNB 空口上真正承载用户数据的无线承载；<code>DRB-Identity ∈ [1,32]</code>。</td></tr></table>'+
      '<h3>SDAP：5G 新增的 L2 顶层（用户面专属）</h3>'+
      '<p>SDAP 坐在协议栈最顶（在 PDCP 之上），<b>只存在于用户面</b>、在 UE 与 gNB 两侧都有。它的活：</p>'+
      '<ul><li><b>映射</b>：把 QoS Flow（QFI）分拣到 DRB（上下行都做）；</li>'+
      '<li><b>标记</b>：在 SDAP 头里打上 QFI；</li>'+
      '<li><b>受 RRC 配置</b>：映射规则由 RRCReconfiguration 下发（也可用 Reflective QoS 反推上行）。</li></ul>'+
      '<div class="formula">QoS Flow（QFI=1, 5QI=9）—[ SDAP 分拣 ]→ DRB#1（default DRB）</div>'+
      '<p class="honesty" style="color:#dc2626;">越界（黑盒）：5QI / ARP 的取值本应来自 PCF 的 PCC 规则、计费来自 CHF——本沙盘用默认静态 QoS（5QI=9、ARP=9），二者不实例化；'+
      '下行 SDAP 头的 1 Byte 结构已在 S6.2 示意，其余编码细节（UL 头、R 比特）与多 DRB 调度不展开。终点边界：首包吐到 N6 即止，DN 之外（公网 BGP）黑盒。</p>',
      ['[SDAP] 5G AS 层新增 L2 顶层就绪：负责 QoS Flow(QFI) ⇄ DRB 映射。',
       '[5GSM] 承接 S5：PDU 会话 #5 控制面已建、UE IP=10.45.0.2，但空口 DRB 尚未落地。',
       '[INFO] 本步目标：理解两级 QoS（QoS Flow vs DRB）与 SDAP 的分拣角色。']
    ),

    /* ── S6.1 仿真（动画·里程碑）：DRB 建立五泳道接力 ── */
    sim(
      '回到空口：gNB 把 QoS Flow 落成 DRB，N3 双向打通',
      'S5 末 SMF 把「一石二鸟」的包交给了 AMF。现在 AMF 经 NGAP 把其中的 N2 SM info（+ 要转发给 UE 的 NAS Accept）下发给 gNB；gNB 据此决定 QoS Flow→DRB 映射、分配自己的 N3 隧道端点，并在空口发 <b>RRCReconfiguration</b> 建 DRB（这是 2.0 唯一一次回到 1.0 的 AS 层）。UE 回 Complete 后，gNB 把自己的 N3 TEID 经 Response 回填，SMF 再经 N4 改 UPF 的下行 FAR——至此 N3 隧道双向齐备。',
      'NGAP 资源建立 · RRCReconfiguration 建 DRB · N3 TEID 回填 · N4 改 FAR',
      '<h3>六段接力（接口 / 消息名全称）</h3>'+
      '<table><tr><th>段</th><th>接口</th><th>消息（全称）</th></tr>'+
      '<tr><td>①</td><td>N2 / NGAP</td><td><b>PDU Session Resource Setup Request</b>（AMF→gNB；携要转发给 UE 的 NAS Accept + N2 SM info：QoS Profile、UPF N3 端点、上行 TEID）</td></tr>'+
      '<tr><td>②</td><td>Uu / RRC</td><td><b style="color:#059669;">RRCReconfiguration</b>（gNB→UE；建 DRB#1、配 SDAP-Config、并把 NAS Accept 嵌进来一起送达 UE）★回 AS 层</td></tr>'+
      '<tr><td>③</td><td>Uu / RRC</td><td><b>RRCReconfigurationComplete</b>（UE→gNB）</td></tr>'+
      '<tr><td>④</td><td>N2 / NGAP</td><td><b>PDU Session Resource Setup Response</b>（gNB→AMF；回填 gNB 侧 N3 GTP-U TEID+地址）</td></tr>'+
      '<tr><td>⑤</td><td>N11</td><td><b>Nsmf_PDUSession_UpdateSMContext</b>（AMF→SMF；把 gNB N3 端点转给 SMF）</td></tr>'+
      '<tr><td>⑥</td><td>N4 / PFCP</td><td><b>PFCP Session Modification</b>（SMF→UPF；把下行 FAR 指向 gNB N3 端点）</td></tr></table>'+
      '<h3>RRCReconfiguration 里到底配了什么</h3>'+
      '<p>核心是 <code>radioBearerConfig → drb-ToAddModList → DRB-ToAddMod</code>，其中：</p>'+
      '<ul><li><code>drb-Identity = 1</code>；</li>'+
      '<li><code>sdap-Config { pdu-Session, defaultDRB=true, mappedQoS-FlowsToAdd=[QFI 1], sdap-HeaderDL/UL }</code>——这就是 SDAP 的映射规则；</li>'+
      '<li><code>pdcp-Config</code>（用 1.0/S2 派生的 K_UP* 做加密完保）+ 配套的 <code>rlc-Config</code> / 逻辑信道。</li></ul>'+
      '<h3>一处精妙缝合：N1 信件搭着空口配置一起到</h3>'+
      '<p>S5 里那封 <b>NAS PDU Session Est. Accept（含 UE IP）</b>，物理上正是<b>嵌在这条 RRCReconfiguration 里</b>送达 UE 的：'+
      '同一条 RRC 消息，既建了空口 DRB（AS 层），又投递了核心网的 N1 信件（NAS 层）。这是空口与核心网最直接的一次「缝合」。</p>'+
      '<h3>N3 为什么要「回填」</h3>'+
      '<p>S5 只配了 UPF 端（上行 TEID）；下行包要送到哪个 gNB，UPF 当时并不知道。直到 gNB 在 ④ 报出自己的 N3 端点、⑥ 由 SMF 写进 UPF 的下行 FAR，'+
      '<b>N3 隧道才双向齐备</b>。此后用户面才真正可用。</p>'+
      '<p class="honesty" style="color:#dc2626;">诚实点：gNB 在本 Stage 重新成为主角——决定 QoS Flow→DRB 映射、建空口承载、回填 N3，'+
      '不再是 S1~S5 里「透明转发」的管道。N11/N4 仍是服务化/PFCP，绝非 4G 的 Diameter/GTP-C。</p>',
      ['[N2] AMF → gNB：PDU Session Resource Setup Request（含 N2 SM info + NAS Accept）。',
       '[RRC] gNB 决定 QoS Flow(QFI=1) → DRB#1 映射，准备 RRCReconfiguration。',
       '[INFO] 观察：② 是 2.0 唯一一次回到 1.0 的 AS 层（建 DRB）。']
    ),

    /* ── S6.2 仿真（连续动画·里程碑）：协议栈 + SDAP 分拣 + 首包出 N6 ── */
    sim(
      '首个 IP 包：穿 AS 协议栈 → 过 N3 → 出 N6 到 DN',
      'DRB 建好、N3 双向齐备，用户面终于通了。第一个 IP 包从 UE 应用产出后，自顶向下穿过 SDAP（打 QFI、选 DRB）→ PDCP（加密完保）→ RLC → MAC → PHY，经空口到 gNB；gNB 封成 GTP-U 经 N3 送到 UPF；UPF 按 FAR 剥壳、从 N6 吐给数据网络（DN）。这一刻，「从上电到上网」整条链路真正跑通——也还清了 1.0 终点卡那句「CONNECTED ≠ 能上网」。',
      'NR 用户面协议栈 · SDAP 分拣与标记 · 首包端到端通路 · N6 边界',
      '<h3>NR 用户面 L2 协议栈（自顶向下）</h3>'+
      '<table><tr><th>子层</th><th>干什么</th></tr>'+
      '<tr><td><b style="color:#1e3a8a;">SDAP</b>（5G 新增）</td><td>QoS Flow⇄DRB 映射、在头里打 QFI</td></tr>'+
      '<tr><td>PDCP</td><td>加密/完保（用户面密钥 K_UPenc/int）、排序、<b>头压缩 RoHC</b></td></tr>'+
      '<tr><td>RLC</td><td>分段、ARQ 重传</td></tr>'+
      '<tr><td>MAC</td><td>复用、HARQ、调度（映射到逻辑信道）</td></tr>'+
      '<tr><td>PHY</td><td>编码/调制——1.0 讲了一整季的「时频网格」</td></tr></table>'+
      '<p>注意：SDAP 与 PDCP 的用户面加密，用的是 <b>K_UPenc / K_UPint</b>——它们派生自 1.0/S2 空投来的 <b>K_gNB</b>。'+
      '欠条 ① 的因果在这里闭合：没有那次空投，这一层就没有密钥。</p>'+
      '<h3>PDCP 的省钱黑科技：RoHC 头压缩（TS 38.323）</h3>'+
      '<p>一个 IPv4+TCP 头足足 <b>40 字节</b>；拿来传几十字节的聊天文字或 VoIP 语音，空口大半在搬没用的头。PDCP 用 <b>RoHC</b>（Robust Header Compression）把它压到 <b>1~3 字节</b>——对小包、实时业务（VoNR）省得尤其狠。这是用户面 PDCP 区别于信令面的关键活之一。</p>'+
      '<h3>SDAP 头的「8 比特美学」（TS 37.324）</h3>'+
      '<p>SDAP 给 IP 包套的下行数据头只有 <b>1 字节</b>，比特分布严丝合缝：</p>'+
      '<table><tr><th>字段</th><th>位宽</th><th>作用</th></tr>'+
      '<tr><td><b>RQI</b></td><td>1 bit</td><td>Reflective QoS 指示——让上行「照下行反推映射」的开关。</td></tr>'+
      '<tr><td><b>RDI</b></td><td>1 bit</td><td>Reflective QoS flow→DRB 映射指示。</td></tr>'+
      '<tr><td><b>QFI</b></td><td>6 bit</td><td>QoS Flow 编号，恰好表示 0~63 共 64 个 Flow。</td></tr></table>'+
      '<div class="formula">1（RQI）+ 1（RDI）+ 6（QFI）= 8 bit = 1 Byte</div>'+
      '<h3>SDAP 在首包上的两个动作</h3>'+
      '<ol><li><b>选 DRB</b>：按 RRC 配的映射，把这条流（QFI=1）放进 DRB#1；</li>'+
      '<li><b>打 QFI</b>：在 SDAP 头标上 QFI（下行尤其需要，便于 UE 识别/做 Reflective QoS）。</li></ol>'+
      '<h3>首包端到端（上行）</h3>'+
      '<div class="formula">UE 应用 → SDAP(打 QFI·选 DRB#1) → PDCP/RLC/MAC/PHY → 空口 → gNB → GTP-U(N3) → UPF → N6 → DN</div>'+
      '<p>下行反过来：DN → UPF（查 PDR/FAR、按 QFI 封 GTP-U）→ gNB（SDAP 按 QFI 映射进 DRB）→ UE。</p>'+
      '<h3>里程碑：到 N6 为止</h3>'+
      '<p style="color:#059669;"><b>首包出 N6 ✓</b>：这是本沙盘的物理终点，也是 2.0 的句号。UE 此刻可以真正收发数据——「能上网」三个字落地。</p>'+
      '<p class="honesty" style="color:#dc2626;">越界（黑盒）：N6 之后的 DN 内部转发、公网 BGP 路由、IPv6 前缀、多 UPF(N9)、PCF 动态 QoS、CHF 计费——一律不展开。'+
      '本沙盘的物理世界，到 N6 为止。</p>',
      ['[SDAP] 首个上行 IP 包：打 QFI=1、选 DRB#1，下交 PDCP。',
       '[N3/GTP-U] gNB → UPF：用户面报文经 N3 隧道（PDU Session Container 携 QFI）。',
       '[N6] UPF → DN：首个用户面 IP 包吐给数据网络。「从上电到上网」跑通 ✓。']
    ),

    /* ── S6.3 探讨（终点）：还清三笔欠条 + 全栈缝合 + 边界 ── */
    discuss(
      '旅程闭环：还清三笔欠条，从上电到上网全栈跑通',
      '2.0 自始就是为还 1.0 故意留下的三笔「越界欠条」而来：① K_gNB 的来源、② CONNECTED ≠ 能上网、③ RRCSetupComplete 捎带的 NAS 信件。三笔账分别在 S2 / S6 / S1 还清。把 1.0 与 2.0 串起来，就是一条从 0.509ns 基带时钟到首个带目的 IP 报文的全栈数据流时间线。',
      '三笔欠条对账 · 全栈时间线 · 端到端通路 · 楚河汉界',
      '<h3>三笔欠条，各还在哪一步</h3>'+
      '<table><tr><th>欠条（1.0 留下）</th><th>2.0 在哪还</th><th>状态</th></tr>'+
      '<tr><td><b>① K_gNB</b>：Stage 8 标「源自 NAS 鉴权(越界)」</td>'+
        '<td><b>S2</b>：5G-AKA 长出密钥树 K→…→K_AMF→K_gNB，再「空投」给 gNB</td><td style="color:#059669;"><b>已还 ✓</b></td></tr>'+
      '<tr><td><b>② 能上网</b>：终点卡「CONNECTED ≠ 能上网」</td>'+
        '<td><b>S6</b>：建 DRB + 通 N3 → 首个 IP 包从 UPF 经 N6 吐给 DN</td><td style="color:#059669;"><b>已还 ✓</b></td></tr>'+
      '<tr><td><b>③ NAS PDU</b>：RRCSetupComplete 捎的 NAS 信件</td>'+
        '<td><b>S1</b>：gNB 透传 → Initial UE Message（NGAP）送进 AMF</td><td style="color:#059669;"><b>已还 ✓</b></td></tr></table>'+
      '<p>彩蛋（S4 缝合）：注册分到的 <b>5G-S-TMSI</b> 其低位（Part1）已成为<b>下次接入</b> RRCSetupRequest 的 <code>ue-Identity</code>——'+
      '下次不再填 39 bit 随机数，几乎不会撞车。1.0 的 Msg3 与 2.0 的 GUTI 在此握手。</p>'+
      '<h3>全栈一条线（Master Mode）</h3>'+
      '<div class="formula">1.0｜0.509ns 基带 → SSB/PBCH → RACH → RRC_CONNECTED　／　2.0｜注册 → 5G-AKA → NAS 安全 → GUTI → PDU 会话(IP) → DRB+SDAP → 首包出 N6</div>'+
      '<p>NR_CTX 在两个项目同名延续：只要浏览器不刷新，参数从 1.0 的基带时钟一路流到 2.0 发出的首个带目的 IP 的用户面报文。'+
      '两个沙盘各自独立可跑，串起来就是完整的「从上电到上网」。</p>'+
      '<h3>这条端到端通路（本沙盘实例）</h3>'+
      '<table><tr><th>段</th><th>承载</th></tr>'+
      '<tr><td>UE ↔ gNB</td><td>空口 · DRB#1（QFI=1 / 5QI=9 / ARP=9）</td></tr>'+
      '<tr><td>gNB ↔ UPF</td><td>N3 · GTP-U（双向 TEID 已齐）</td></tr>'+
      '<tr><td>UPF ↔ DN</td><td>N6（DNN=internet · UE IP=10.45.0.2）</td></tr></table>'+
      '<p class="honesty" style="color:#dc2626;">楚河汉界（终点边界，必须坚守）：N6 是物理世界的尽头——只讲到 IP 包吐给 DN；'+
      '外部 Internet 路由（BGP）黑盒。PCF（策略）与 CHF（计费）全程隐身（默认静态 QoS/计费）；'+
      'NSSF 切片选择、N9 多 UPF 级联、IPv6 前缀下发——均不展开。2.0 到此收官。</p>',
      ['[OK] 欠条对账：① K_gNB(S2) · ② 能上网(S6) · ③ NAS PDU(S1) —— 全部还清 ✓。',
       '[READY] 端到端用户面通路就绪：UE—DRB#1—gNB—N3—UPF—N6—DN。',
       '[DONE] 从上电到上网，全栈跑通。2.0 收官（N6 为物理世界终点）。']
    ),

  ]};

  /* ── Export（结构与 1.0 一致）──────────────────────────────────────── */
  window.NR_VIZ_DATA = {
    STAGE_LABELS: STAGE_LABELS,
    STAGE_META:   STAGE_META,
    FLOW_DATA: {
      0:S0, 1:S1, 2:S2, 3:S3, 4:S4, 5:S5, 6:S6,
    },
  };
})();
