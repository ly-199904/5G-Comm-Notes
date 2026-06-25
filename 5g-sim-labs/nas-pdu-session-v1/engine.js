/* ═══════════════════════════════════════════════════════════════════════════
   5G Core · NAS Registration & PDU Session · Engine v2.0-core
   （状态机核心与 1.0 完全一致，仅顶栏标签/标题改为核心网语义）
   纯状态机核心 · NR_CTX 响应式全局上下文 · MathJax/hljs 渲染管线
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Internal State ──────────────────────────────────────────────────── */
  var _stageIdx = 0;
  var _subIdx   = 0;
  var _timers   = [];
  var _logLines = [];

  /* ── Log Level Map ───────────────────────────────────────────────────── */
  var _levelMap = {
    INIT:'init', BOOT:'init', CLOCK:'data', DATA:'data', PHY:'data',
    RF:'data', DSP:'data', MAC:'data', RRC:'ok', LOCK:'ok',
    SUCCESS:'ok', READY:'ok', OK:'ok', WARN:'warn', ERROR:'err', ERR:'err',
  };
  function _detectLevel(msg) {
    var m = msg.match(/\[([A-Z_-]+)\]/);
    if (!m) return 'info';
    return _levelMap[m[1].split(/[-_]/)[0]] || 'info';
  }

  /* ── Dashboard Skeleton ──────────────────────────────────────────────── */
  var SKEL =
    '<div class="dashboard" id="dashboard">' +
      '<div class="topbar">' +
        '<div class="topbar-left">' +
          '<div class="status-dot-wrap">' +
            '<div class="status-pulse" id="topPulse"></div>' +
            '<div class="status-dot"   id="topDot"></div>' +
          '</div>' +
          '<span class="topbar-title">5G 核心网 · 注册 &amp; PDU 会话仿真</span>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:5px;">' +
          '<div class="tags-row">' +
            '<span class="env-tag static">SA 组网</span>' +
            '<span class="env-tag static">5GC · SBA</span>' +
            '<span class="env-tag static">HTTP/2 RESTful</span>' +
            '<span class="env-tag static">CUPS</span>' +
            '<span class="env-tag static">承接 RRC_CONNECTED</span>' +
          '</div>' +
          '<div class="tags-row">' +
            '<span class="tags-sep"></span>' +
            '<span class="env-tag dynamic dim" id="dt-crnti">C-RNTI ···</span>' +
            '<span class="env-tag dynamic dim" id="dt-suci">SUCI ···</span>' +
            '<span class="env-tag dynamic dim" id="dt-kamf">K_AMF ···</span>' +
            '<span class="env-tag dynamic dim" id="dt-guti">GUTI ···</span>' +
            '<span class="env-tag dynamic dim" id="dt-pdu">PDU ···</span>' +
            '<span class="env-tag dynamic dim" id="dt-drb">DRB ···</span>' +
            '<span class="tags-sep"></span>' +
            '<span class="env-tag status-badge" id="topBadge">STANDBY</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="step-bar" id="stepBar"></div>' +
      '<div class="main-grid">' +
        '<div class="viz-panel">' +
          '<div class="sub-progress" id="subDots"></div>' +
          '<div class="viz-container" id="vizContainer"></div>' +
        '</div>' +
        '<div class="info-panel">' +
          '<div class="info-content" id="infoContent"></div>' +
          '<div class="console-wrapper">' +
            '<div class="console-header">' +
              '<div class="console-dot r"></div>' +
              '<div class="console-dot y"></div>' +
              '<div class="console-dot g"></div>' +
              '<span id="consoleSpec">UE NAS & 5GC SIGNALING LOG</span>' +
            '</div>' +
            '<div class="console-body" id="consoleBody"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="control-bar">' +
        '<div class="ctrl-group">' +
          '<button class="btn btn-sub" id="btnPrev" disabled onclick="Engine.prevStage()">← 上一阶段</button>' +
          '<span class="stage-counter" id="stageCounter"></span>' +
          '<button class="btn btn-primary" id="btnNext" onclick="Engine.nextStage()">下一阶段 →</button>' +
        '</div>' +
        '<div class="ctrl-group">' +
          '<button class="btn btn-sub" id="btnSubPrev" onclick="Engine.prevSub()">◁ 上一步</button>' +
          '<button class="btn btn-accent" id="btnSubNext" onclick="Engine.nextSub()">下一步 ▷</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  /* ── Utilities ───────────────────────────────────────────────────────── */
  function clrTimers() { _timers.forEach(function(t){ clearInterval(t); clearTimeout(t); }); _timers = []; }
  function $id(id) { return document.getElementById(id); }
  function total() { var D=window.NR_VIZ_DATA; return D&&D.STAGE_LABELS?D.STAGE_LABELS.length:10; }
  function flow()  { var D=window.NR_VIZ_DATA; return D&&D.FLOW_DATA[_stageIdx]?D.FLOW_DATA[_stageIdx]:null; }
  function meta()  { var D=window.NR_VIZ_DATA; return D&&D.STAGE_META?D.STAGE_META[_stageIdx]:null; }

  /* ═══════════════════════════════════════════════════════════════════════
     LOG ENGINE
     ═══════════════════════════════════════════════════════════════════════ */
  var LogEngine = {
    push: function(level, msg) {
      var now=new Date();
      var ts=[now.getHours(),now.getMinutes(),now.getSeconds()]
             .map(function(n){return String(n).padStart(2,'0');}).join(':')+
             '.'+String(now.getMilliseconds()).padStart(3,'0');
      _logLines.push(
        '<div class="log-line">'+
          '<span class="log-time">['+ts+']</span>'+
          '<span class="log-level '+level+'">['+level.toUpperCase()+']</span>'+
          '<span class="log-msg">'+msg+'</span>'+
        '</div>');
      var el=$id('consoleBody');
      if(el){el.innerHTML=_logLines.join('');el.scrollTop=el.scrollHeight;}
    },
    inject: function(msg){ LogEngine.push(_detectLevel(msg),msg); },
    clear:  function()   { _logLines=[]; var el=$id('consoleBody'); if(el)el.innerHTML=''; },
  };

  /* ═══════════════════════════════════════════════════════════════════════
     NR_CTX · 全局上下文响应式写入
     ═══════════════════════════════════════════════════════════════════════ */
  function ctxSet(key, val) {
    if (!window.NR_CTX) return;
    /* 支持 'nas.suci' 形式写入嵌套 nas 命名空间 */
    if (key.indexOf('nas.')===0) {
      var nk = key.slice(4);
      if (!window.NR_CTX.nas) window.NR_CTX.nas = {};
      window.NR_CTX.nas[nk] = val;
      try { sessionStorage.setItem('nr_ctx_nas_'+nk, JSON.stringify(val)); } catch(e){}
    } else {
      window.NR_CTX[key] = val;
      /* 持久化到 sessionStorage，跨 Stage 传递 */
      try { sessionStorage.setItem('nr_ctx_'+key, JSON.stringify(val)); } catch(e){}
    }
    /* 刷新顶部动态标签 */
    _syncCtxTags();
    /* 重绘当前 SVG（不重置 sub-step）*/
    _renderViz();
  }

  /* ── 顶部动态标签同步 ── */
  var _TAG_MAP = [
    { id:'dt-crnti', key:'c_rnti', fmt:function(v){ return 'C-RNTI '+v;} },
    { id:'dt-suci',  nas:'suci',   fmt:function(v){ return 'SUCI ✓';   } },
    { id:'dt-kamf',  nas:'k_amf',  fmt:function(v){ return 'K_AMF ✓';  } },
    { id:'dt-guti',  nas:'guti',   fmt:function(v){ return 'GUTI '+v;  } },
    { id:'dt-pdu',   nas:'_pdu_ip',fmt:function(v){ return 'PDU '+v;   } },
    { id:'dt-drb',   nas:'_drb_id',fmt:function(v){ return 'DRB#'+v;   } },
  ];
  function _ctxVal(t){
    if(t.key) return window.NR_CTX[t.key];
    if(t.nas) return (window.NR_CTX.nas?window.NR_CTX.nas[t.nas]:null);
    return null;
  }
  function _syncCtxTags() {
    if (!window.NR_CTX) return;
    _TAG_MAP.forEach(function(t){
      var el=$id(t.id); if(!el)return;
      var val=_ctxVal(t);
      if(val!==null&&val!==undefined){
        el.textContent=t.fmt(val); el.classList.remove('dim'); el.classList.add('lit');
      } else {
        el.textContent=t.id.replace('dt-','').toUpperCase()+' ···';
        el.classList.remove('lit'); el.classList.add('dim');
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER PIPELINE
     ═══════════════════════════════════════════════════════════════════════ */
  function _renderViz() {
    var viz=$id('vizContainer');
    if(viz&&typeof Engine.renderVizSVG==='function'){
      viz.innerHTML=Engine.renderVizSVG(_subIdx,{stageIdx:_stageIdx});
    }
  }

  function _renderInfo() {
    var cf=flow(); if(!cf||!cf.subSteps)return;
    var step=cf.subSteps[_subIdx]||{};
    var ac=step.actionCard||{}, tc=step.theoryCard||{};
    var info=$id('infoContent'); if(!info)return;

    var isDiscuss=(step.mode==='discuss');
    info.innerHTML=
      '<div class="info-card action-card'+(isDiscuss?' discuss-card':'')+'">'+
        (ac.label?'<div class="card-label">'+ac.label+'</div>':'')+
        '<div class="action-title">'+( ac.title||'')+'</div>'+
        '<div class="action-desc" >'+(ac.desc ||'')+'</div>'+
      '</div>'+
      '<div class="info-card theory-card">'+
        (tc.title?'<div class="theory-section-title">'+tc.title+'</div>':'')+
        '<div class="theory-text" id="theoryBody">'+( tc.content||'')+'</div>'+
      '</div>';

    /* ── 渲染管线：MathJax → hljs ── */
    var body=$id('theoryBody'); if(!body)return;
    if(window.MathJax&&window.MathJax.typesetPromise){
      window.MathJax.typesetPromise([body]).catch(function(){});
    }
    if(window.hljs){
      body.querySelectorAll('pre code').forEach(function(el){
        if(!el.dataset.highlighted) window.hljs.highlightElement(el);
      });
    }
  }

  function renderAll() {
    clrTimers();
    var cf=flow(), sm=meta();

    /* Step Bar */
    var bar=$id('stepBar');
    if(bar&&window.NR_VIZ_DATA){
      bar.innerHTML=(window.NR_VIZ_DATA.STAGE_LABELS||[]).map(function(lbl,i){
        var cls='step-node'+(i<_stageIdx?' done':'')+(i===_stageIdx?' active':'');
        return '<div class="'+cls+'" onclick="Engine.navToStage('+i+')">'+lbl+'</div>';
      }).join('');
    }

    /* Top meta */
    if(sm){
      var badge=$id('topBadge'); if(badge)badge.textContent=sm.badge||'STANDBY';
      var dc=sm.dotColor||'var(--accent)';
      ['topPulse','topDot'].forEach(function(id){var el=$id(id);if(el)el.style.background=dc;});
      var cs=$id('consoleSpec');
      if(cs&&sm.spec)cs.textContent='UE NAS & 5GC LOG · '+sm.spec;
    }
    _syncCtxTags();

    /* Sub-step dots */
    var dots=$id('subDots');
    if(dots&&cf&&cf.subSteps){
      dots.innerHTML=cf.subSteps.map(function(_,d){
        var cls='sub-dot'+(d<_subIdx?' done':'')+(d===_subIdx?' active':'');
        return '<div class="'+cls+'" title="步骤 '+(d+1)+'"></div>';
      }).join('');
    }

    /* Info + Viz */
    _renderInfo();
    _renderViz();

    /* Buttons */
    var maxSub=cf&&cf.subSteps?cf.subSteps.length-1:0;
    function dis(id,v){var b=$id(id);if(b)b.disabled=!!v;}
    dis('btnPrev',    _stageIdx===0);
    dis('btnNext',    _stageIdx>=total()-1);
    dis('btnSubPrev', _subIdx===0);
    dis('btnSubNext', _subIdx>=maxSub);
    var ctr=$id('stageCounter');
    if(ctr)ctr.textContent=(_stageIdx+1)+' / '+total();

    /* Post-render hook */
    if(typeof Engine.onAfterRender==='function') Engine.onAfterRender(_subIdx,{stageIdx:_stageIdx});
  }

  /* ═══════════════════════════════════════════════════════════════════════
     NAVIGATION
     ═══════════════════════════════════════════════════════════════════════ */
  function nextSub(){
    if(typeof Engine.nextSubHook==='function'&&Engine.nextSubHook()===true)return;
    var cf=flow(); if(!cf||!cf.subSteps)return;
    if(_subIdx<cf.subSteps.length-1){
      _subIdx++;
      var step=cf.subSteps[_subIdx];
      if(step&&step.initLogs) step.initLogs.forEach(function(m){LogEngine.inject(m);});
      renderAll();
    }
  }
  function prevSub(){
    if(_subIdx>0){_subIdx--;renderAll();}
  }
  function navToStage(idx){
    if(idx<0||idx>=total())return;
    if(typeof Engine.onStageExit==='function') Engine.onStageExit(_stageIdx);
    Engine.renderVizSVG =_defaultViz;
    Engine.onAfterRender=function(){};
    Engine.nextSubHook  =null;
    Engine.onStageEnter =null;
    Engine.onStageExit  =null;
    _stageIdx=idx; _subIdx=0; clrTimers();
    renderAll();
    if(typeof Engine.onStageEnter==='function') Engine.onStageEnter(idx);
  }
  function nextStage(){ if(_stageIdx<total()-1) navToStage(_stageIdx+1); }
  function prevStage(){ if(_stageIdx>0)         navToStage(_stageIdx-1); }

  function _defaultViz(){
    return '<div style="display:flex;flex-direction:column;align-items:center;'+
           'justify-content:center;height:100%;color:var(--text-mut);gap:12px;">'+
           '<svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="26" '+
           'stroke="var(--border)" stroke-width="2" fill="none" stroke-dasharray="8 5"/>'+
           '<text x="28" y="33" text-anchor="middle" font-size="20" fill="var(--border)">⚙</text></svg>'+
           '<p style="font-size:13px;font-weight:600;">此阶段渲染器尚未加载</p></div>';
  }

  /* ═══════════════════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════════════════ */
  function boot(config){
    config=config||{}; _stageIdx=config.stageIdx||0; _subIdx=0; clrTimers();
    var app=document.getElementById('app');
    if(!app){console.error('[Engine] #app missing');return;}
    app.innerHTML=SKEL;
    if(typeof Engine.renderVizSVG !=='function') Engine.renderVizSVG =_defaultViz;
    if(typeof Engine.onAfterRender!=='function') Engine.onAfterRender=function(){};
    Engine.nextSubHook=null; Engine.onStageEnter=null; Engine.onStageExit=null;
    LogEngine.clear();
    LogEngine.push('init','[CORE_SYS] NAS 协议栈加载完成。承接 RRC_CONNECTED，5GMM 状态机初始化。');
    var cf=flow();
    if(cf&&cf.subSteps&&cf.subSteps[0]&&cf.subSteps[0].initLogs)
      cf.subSteps[0].initLogs.forEach(function(m){LogEngine.inject(m);});
    renderAll();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════════════ */
  window.Engine={
    boot,renderAll,nextSub,prevSub,nextStage,prevStage,navToStage,
    ctxSet,LogEngine,
    syncTags: _syncCtxTags,
    addTimer:  function(t){_timers.push(t);return t;},
    getStageIdx: function(){return _stageIdx;},
    getSubIdx:   function(){return _subIdx;},
    renderVizSVG:  _defaultViz,
    onAfterRender: function(){},
    nextSubHook:   null,
    onStageEnter:  null,
    onStageExit:   null,
  };
})();
