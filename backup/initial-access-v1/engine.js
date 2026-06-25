/* ═══════════════════════════════════════════════════════════════════════════
   5G NR Initial Access · Engine
   全局控制引擎 · DOM 注入 · 控制台 · 子步骤状态机 · 渲染框架
   挂载 window.Engine
   ═══════════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  /* ── Internal State ──────────────────────────────────────────────────── */
  var _stageIdx  = 0;
  var _subIdx    = 0;
  var _scanIdx   = 0;   // for stage 4 point-by-point scanning
  var _timers    = [];
  var _logLines  = [];

  /* ── Skeleton HTML Template ──────────────────────────────────────────── */
  var SKELETON =
    '<div class="dashboard" id="dashboard">' +
      /* Top Bar */
      '<div class="topbar">' +
        '<div class="topbar-left">' +
          '<div class="status-dot-wrap">' +
            '<div class="status-pulse" id="topPulse"></div>' +
            '<div class="status-dot" id="topDot"></div>' +
          '</div>' +
          '<span class="topbar-title">5G NR 初始接入</span>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          /* Row 1: 基础物理属性 (static, always known) */
          '<div class="tags-row">' +
            '<span class="env-tag static">FR: FR1</span>' +
            '<span class="env-tag static">Band: n78</span>' +
            '<span class="env-tag static">MIMO: 2×4</span>' +
            '<span class="env-tag static">RA: 4-Step CBRA</span>' +
          '</div>' +
          /* Row 2: 探测技能树 (unlock as stages progress) */
          '<div class="tags-row">' +
            '<span class="tags-sep"></span>' +
            '<span class="env-tag dynamic dim" id="dt-gscn">GSCN: 盲检中…</span>' +
            '<span class="env-tag dynamic dim" id="dt-pci">PCI: 盲检中…</span>' +
            '<span class="env-tag dynamic dim" id="dt-scs">SCS: 盲检中…</span>' +
            '<span class="env-tag dynamic dim" id="dt-duplex">Duplex: 盲检中…</span>' +
            '<span class="env-tag dynamic dim" id="dt-kssb">k_SSB: 盲检中…</span>' +
            '<span class="env-tag dynamic dim" id="dt-ssbper">SSB Period: 盲检中…</span>' +
            '<span class="tags-sep"></span>' +
            '<span class="env-tag" id="topBadge" style="font-weight:700;">STANDBY</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* Step Bar */
      '<div class="step-bar" id="stepBar"></div>' +

      /* Main Grid */
      '<div class="main-grid">' +
        '<div class="viz-panel">' +
                    '<div class="sub-progress" id="subDots"></div>' +
          '<div class="viz-container" id="vizContainer"></div>' +
        '</div>' +
        '<div class="info-panel">' +
          '<div class="info-content" id="infoContent"></div>' +
          '<div class="console-wrapper">' +
            '<div class="console-header">' +
              '<div class="console-dot r"></div><div class="console-dot y"></div><div class="console-dot g"></div>' +
              '<span id="consoleSpec">UE TERMINAL HARDWARE LOG</span>' +
            '</div>' +
            '<div class="console-body" id="consoleBody"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* Control Bar */
      '<div class="control-bar">' +
        '<div class="ctrl-group">' +
          '<button class="btn btn-sub" id="btnPrev" disabled onclick="Engine.prevStage()">← 上一阶段</button>' +
          '<span style="font-size:12px;color:var(--text-mut);font-family:var(--font-mono);font-weight:600;min-width:54px;text-align:center;" id="stageCounter"></span>' +
          '<button class="btn btn-primary" id="btnNext" onclick="Engine.nextStage()">下一阶段 →</button>' +
        '</div>' +
        '<div class="ctrl-group">' +
          '<button class="btn btn-sub" id="btnSubPrev" onclick="Engine.prevSub()">◁ 上一步动作</button>' +
          '<button class="btn btn-sub" id="btnSubNext" onclick="Engine.nextSub()" style="border-color:var(--brand);color:var(--brand);">下一步动作 ▷</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  /* ── Utility ─────────────────────────────────────────────────────────── */
  function clearTimers() { _timers.forEach(function(t){ clearInterval(t); clearTimeout(t); }); _timers = []; }
  function getEl(id) { return document.getElementById(id); }

  /* ═══════════════════════════════════════════════════════════════════════
     LOG ENGINE
     ═══════════════════════════════════════════════════════════════════════ */
  var LogEngine = {
    push: function(level, msg) {
      var now = new Date();
      var ts = String(now.getHours()).padStart(2,'0') + ':' +
               String(now.getMinutes()).padStart(2,'0') + ':' +
               String(now.getSeconds()).padStart(2,'0') + '.' +
               String(now.getMilliseconds()).padStart(3,'0');
      _logLines.push(
        '<div class="log-line">' +
          '<span class="log-time">[' + ts + ']</span>' +
          '<span class="log-level ' + level + '">[' + level.toUpperCase() + ']</span>' +
          '<span class="log-msg">' + msg + '</span>' +
        '</div>'
      );
      LogEngine.render();
    },
    render: function() {
      var el = getEl('consoleBody');
      if (el) { el.innerHTML = _logLines.join(''); el.scrollTop = el.scrollHeight; }
    },
    clear: function() { _logLines = []; LogEngine.render(); }
  };

  /* ═══════════════════════════════════════════════════════════════════════
     FLOW DATA HELPER
     ═══════════════════════════════════════════════════════════════════════ */
  function currentFlow() {
    return window.NR_VIZ_DATA && window.NR_VIZ_DATA.FLOW_DATA[_stageIdx]
      ? window.NR_VIZ_DATA.FLOW_DATA[_stageIdx]
      : null;
  }

  function stageMeta() {
    return window.NR_VIZ_DATA && window.NR_VIZ_DATA.STAGE_META
      ? window.NR_VIZ_DATA.STAGE_META[_stageIdx]
      : null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     DYNAMIC TAG UNLOCKING
     ═══════════════════════════════════════════════════════════════════════ */
  var DYNAMIC_TAGS = [
    { id:'dt-gscn',    label:'GSCN: 8778',       stage:3 },
    { id:'dt-pci',     label:'PCI: 337',         stage:6 },
    { id:'dt-scs',     label:'SCS: 30kHz',       stage:7 },
    { id:'dt-duplex',  label:'Duplex: TDD',      stage:7 },
    { id:'dt-kssb',    label:'k_SSB: 2',         stage:7 },
    { id:'dt-ssbper',  label:'SSB Period: 20ms', stage:9 },
  ];

  function unlockDynamicTags(stageIdx) {
    DYNAMIC_TAGS.forEach(function(dt) {
      var el = document.getElementById(dt.id);
      if (!el) return;
      if (stageIdx >= dt.stage) {
        el.textContent = dt.label;
        el.classList.remove('dim');
        el.classList.add('lit');
      } else {
        el.textContent = dt.id === 'dt-gscn' ? 'GSCN: 盲检中…' :
                         dt.id === 'dt-pci'  ? 'PCI: 盲检中…' :
                         dt.id === 'dt-scs'  ? 'SCS: 盲检中…' :
                         dt.id === 'dt-duplex' ? 'Duplex: 盲检中…' :
                         dt.id === 'dt-kssb' ? 'k_SSB: 盲检中…' : 'SSB Period: 盲检中…';
        el.classList.remove('lit');
        el.classList.add('dim');
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER ALL
     ═══════════════════════════════════════════════════════════════════════ */
  function renderAll() {
    clearTimers();
    var cf = currentFlow();
    var sm = stageMeta();

    /* Step Bar */
    var bar = getEl('stepBar');
    if (bar && window.NR_VIZ_DATA) {
      var labels = window.NR_VIZ_DATA.STAGE_LABELS || [];
      var html = '';
      for (var i = 0; i < labels.length; i++) {
        var cls = 'step-node';
        if (i < _stageIdx) cls += ' done';
        if (i === _stageIdx) cls += ' active';
        html += '<div class="' + cls + '" onclick="Engine.navToStage(' + i + ')">' + labels[i] + '</div>';
      }
      bar.innerHTML = html;
    }

    /* Top Bar */
    if (sm) {
      var badge = getEl('topBadge');
      if (badge) badge.textContent = sm.badge || 'STANDBY';
      var pulse = getEl('topPulse');
      var dot   = getEl('topDot');
      var dc = sm.dotColor || 'var(--accent)';
      if (pulse) pulse.style.background = dc;
      if (dot)   dot.style.background   = dc;

      /* Console spec */
      var cs = getEl('consoleSpec');
      if (cs && sm && sm.spec) cs.textContent = 'UE TERMINAL HARDWARE LOG · ' + sm.spec;

      /* Dynamic tag unlocking */
      unlockDynamicTags(_stageIdx);
    }

    /* Sub-progress Dots */
    var subDots = getEl('subDots');
    if (subDots && cf) {
      var dhtml = '';
      var subDotsCount = cf.subSteps ? cf.subSteps.length : 0;
      for (var d = 0; d < subDotsCount; d++) {
        var dcls = 'sub-dot';
        if (d < _subIdx) dcls += ' done';
        if (d === _subIdx) dcls += ' active';
        dhtml += '<div class="' + dcls + '"></div>';
      }
      subDots.innerHTML = dhtml;
    }

    /* Info Cards */
    var info = getEl('infoContent');
    if (info && cf && cf.subSteps) {
      var step = cf.subSteps[_subIdx] || {};
      var ac = step.actionCard || {};
      var tc = step.theoryCard || {};
      info.innerHTML =
        '<div class="info-card action-card">' +
          '<div class="action-title">' + (ac.title || '') + '</div>' +
          '<div class="action-desc">' + (ac.desc || '') + '</div>' +
        '</div>' +
        '<div class="info-card theory-card">' +
          '<div class="theory-text">' + (tc.content || '') + '</div>' +
        '</div>';
    }

    /* Viz Panel (delegate to stage-specific SVG renderer) */
    var viz = getEl('vizContainer');
    if (viz && typeof Engine.renderVizSVG === 'function') {
      viz.innerHTML = Engine.renderVizSVG(_subIdx, { stageIdx: _stageIdx, scanIdx: _scanIdx });
    }

    /* Buttons */
    var btnPrev = getEl('btnPrev');
    var btnNext = getEl('btnNext');
    var btnSubPrev = getEl('btnSubPrev');
    var btnSubNext = getEl('btnSubNext');
    var counter = getEl('stageCounter');
    var totalStages = window.NR_VIZ_DATA ? (window.NR_VIZ_DATA.STAGE_LABELS ? window.NR_VIZ_DATA.STAGE_LABELS.length : 10) : 10;

    if (btnPrev) btnPrev.disabled = (_stageIdx === 0);
    if (btnNext) btnNext.disabled = (_stageIdx >= totalStages - 1);
    if (counter) counter.textContent = (_stageIdx + 1) + ' / ' + totalStages;

    if (btnSubPrev) btnSubPrev.disabled = (_subIdx === 0);
    if (btnSubNext && cf) {
      var canAdvance = (_stageIdx === 4 && _subIdx === 2 && _scanIdx < (window.NR_VIZ_DATA.SYNC_POINTS ? window.NR_VIZ_DATA.SYNC_POINTS.length : 6));
      btnSubNext.disabled = (_subIdx >= (cf.subSteps ? cf.subSteps.length - 1 : 1) && !canAdvance);
    }

    /* Console */
    LogEngine.render();

    /* Post-render hook for stage-specific SVG animation triggers */
    if (typeof Engine.onAfterRender === 'function') {
      Engine.onAfterRender(_subIdx, { stageIdx: _stageIdx, scanIdx: _scanIdx });
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     SUB-STEP NAVIGATION
     ═══════════════════════════════════════════════════════════════════════ */
  function nextSub() {
    var cf = currentFlow();
    if (!cf) return;

    /* Stage 4 special: point-by-point scan loop */
    if (_stageIdx === 4 && _subIdx === 2) {
      var pts = window.NR_VIZ_DATA ? window.NR_VIZ_DATA.SYNC_POINTS : [];
      if (_scanIdx < pts.length) {
        var sp = pts[_scanIdx];
        var bd = window.NR_VIZ_DATA.BANDS ? window.NR_VIZ_DATA.BANDS[sp.bandIdx] : null;
        if (bd) {
          LogEngine.push('data',
            '[CORRELATION] GSCN:' + sp.gscn + ' | ARFCN:' + sp.arfcn +
            ' | Band:' + bd.id + '(' + bd.desc + ') | R_max=' + Math.round(bd.signal * 100) + '%');
        }
        _scanIdx++;
        if (_scanIdx >= pts.length) {
          _subIdx = 3;
          setTimeout(function() {
            LogEngine.push('ok','[RF_LOCK] 锁定 n78 (3300-3800 MHz) — 最强相关峰值');
            LogEngine.push('ok','[STATUS] 粗频率同步完成。射频 PLL 锁定。准备进入 PSS 符号同步。');
            renderAll();
          }, 400);
        }
        renderAll();
        return;
      }
    }

    if (_subIdx < (cf.subSteps ? cf.subSteps.length - 1 : 1)) {
      _subIdx++;
      /* Inject initLogs for the new sub-step */
      var newStep = cf.subSteps[_subIdx];
      if (newStep && newStep.initLogs && newStep.initLogs.length > 0) {
        newStep.initLogs.forEach(function(logMsg) {
          var level = 'info';
          if (logMsg.indexOf('[INIT]')===0) level = 'init';
          else if (logMsg.indexOf('[CLOCK]')===0) level = 'data';
          else if (logMsg.indexOf('[LOCK]')===0) level = 'ok';
          else if (logMsg.indexOf('[SUCCESS]')===0) level = 'ok';
          else if (logMsg.indexOf('[BOOT]')===0) level = 'init';
          else if (logMsg.indexOf('[DATA]')===0) level = 'data';
          else if (logMsg.indexOf('[READY]')===0) level = 'ok';
          LogEngine.push(level, logMsg);
        });
      }
      renderAll();
    }
  }

  function prevSub() {
    if (_subIdx > 0) { _subIdx--; _scanIdx = 0; renderAll(); }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     STAGE NAVIGATION
     ═══════════════════════════════════════════════════════════════════════ */
  function navToStage(idx) {
    var total = window.NR_VIZ_DATA && window.NR_VIZ_DATA.STAGE_LABELS ? window.NR_VIZ_DATA.STAGE_LABELS.length : 10;
    if (idx < 0 || idx >= total) return;
    _stageIdx = idx; _subIdx = 0; _scanIdx = 0; clearTimers();
    renderAll();
  }

  function nextStage() {
    var total = window.NR_VIZ_DATA && window.NR_VIZ_DATA.STAGE_LABELS ? window.NR_VIZ_DATA.STAGE_LABELS.length : 10;
    if (_stageIdx < total - 1) { navToStage(_stageIdx + 1); }
  }

  function prevStage() {
    if (_stageIdx > 0) { navToStage(_stageIdx - 1); }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     BOOT · Main Entry Point
     ═══════════════════════════════════════════════════════════════════════ */
  function boot(config) {
    config = config || {};
    _stageIdx = config.stageIdx || 0;
    _subIdx   = 0;
    _scanIdx  = 0;
    _logLines = [];
    clearTimers();

    /* Inject skeleton */
    var app = document.getElementById('app');
    if (!app) { console.error('Engine: #app container not found'); return; }
    app.innerHTML = SKELETON;

    /* Default renderVizSVG if not overridden */
    if (typeof Engine.renderVizSVG !== 'function') {
      Engine.renderVizSVG = function() {
        return '<div style="text-align:center;color:var(--text-mut);padding:40px;">' +
          '<span style="font-size:48px;">⚙️</span>' +
          '<p style="font-size:14px;margin-top:12px;">此阶段的 SVG 渲染器尚未定义</p>' +
          '<p style="font-size:11px;color:var(--text-mut);">请在 stage 文件中重写 Engine.renderVizSVG()</p>' +
        '</div>';
      };
    }

    /* Default onAfterRender if not overridden */
    if (typeof Engine.onAfterRender !== 'function') {
      Engine.onAfterRender = function() {};
    }

    /* Initial logs + sub-step 0 initLogs */
    LogEngine.clear();
    LogEngine.push('info','CORE_SYS: 终端基带处理器 L1 微码固件安全加载完成。');

    var cf = currentFlow();
    if (cf && cf.subSteps && cf.subSteps[0] && cf.subSteps[0].initLogs) {
      cf.subSteps[0].initLogs.forEach(function(logMsg) {
        var level = 'info';
        if (logMsg.indexOf('[INIT]')===0) level = 'init';
        else if (logMsg.indexOf('[CLOCK]')===0) level = 'data';
        else if (logMsg.indexOf('[LOCK]')===0) level = 'ok';
        else if (logMsg.indexOf('[SUCCESS]')===0) level = 'ok';
        else if (logMsg.indexOf('[BOOT]')===0) level = 'init';
        else if (logMsg.indexOf('[DATA]')===0) level = 'data';
        else if (logMsg.indexOf('[READY]')===0) level = 'ok';
        LogEngine.push(level, logMsg);
      });
    }

    renderAll();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     EXPORT GLOBAL · window.Engine
     ═══════════════════════════════════════════════════════════════════════ */
  window.Engine = {
    boot:          boot,
    LogEngine:     LogEngine,
    nextSub:       nextSub,
    prevSub:       prevSub,
    nextStage:     nextStage,
    prevStage:     prevStage,
    navToStage:    navToStage,
    renderAll:     renderAll,
    renderVizSVG:  null,  // Override in stage file
    onAfterRender: null,  // Override for animation hooks
    getStageIdx:   function() { return _stageIdx; },
    getSubIdx:     function() { return _subIdx; },
    getScanIdx:    function() { return _scanIdx; },
  };
})();
