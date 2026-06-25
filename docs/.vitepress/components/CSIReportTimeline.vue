<template>
  <div class="crt-root">
    <div class="crt-header">
      <span class="crt-title">CSI 上报时序甘特图</span>
      <span class="crt-sub">38.214 §5.2.1 · Periodic / Semi-Persistent / Aperiodic</span>
    </div>

    <!-- 控制 -->
    <div class="crt-controls">
      <div class="ctrl-group">
        <label>Periodic 周期 (slots)</label>
        <select v-model.number="periodP">
          <option v-for="v in [5,10,20,40,80]" :key="v" :value="v">{{ v }} sl ({{ (v*0.5).toFixed(1) }}ms)</option>
        </select>
      </div>
      <div class="ctrl-group">
        <label>SP 激活时刻</label>
        <input type="range" v-model.number="spActivate" min="10" max="50" step="5"/>
        <span class="ctrl-val">slot {{ spActivate }}</span>
      </div>
      <div class="ctrl-group">
        <label>SP 停止时刻</label>
        <input type="range" v-model.number="spDeactivate" min="60" max="120" step="5"/>
        <span class="ctrl-val">slot {{ spDeactivate }}</span>
      </div>
      <div class="ctrl-group">
        <label>AP 触发时刻</label>
        <input type="range" v-model.number="apTrigger" min="40" max="100" step="5"/>
        <span class="ctrl-val">slot {{ apTrigger }}</span>
      </div>
      <div class="ctrl-group">
        <label>场景</label>
        <div class="btn-group">
          <button :class="['ctrl-btn', {active: scenario==='ground'}]" @click="scenario='ground'">地面</button>
          <button :class="['ctrl-btn', {active: scenario==='ntn'}]" @click="scenario='ntn'">NTN LEO</button>
        </div>
      </div>
    </div>

    <!-- 甘特图 -->
    <div class="gantt-wrap">
      <svg :viewBox="`0 0 ${svgW} ${svgH}`" class="gantt-svg">
        <!-- 背景 slot 线 -->
        <g v-for="s in totalSlots+1" :key="'vl'+s">
          <line :x1="timeX(s-1)" y1="0" :x2="timeX(s-1)" :y2="svgH-20"
                stroke="var(--vp-c-divider)" stroke-width="0.4" opacity="0.5"/>
        </g>

        <!-- slot 刻度 -->
        <g v-for="s in [0,20,40,60,80,100,120,140,160]" :key="'tick'+s">
          <text :x="timeX(s)" :y="svgH-6"
                text-anchor="middle" font-size="9" fill="var(--vp-c-text-3)">{{ s }}</text>
        </g>
        <text :x="svgW/2" :y="svgH" text-anchor="middle" font-size="9" fill="var(--vp-c-text-3)">slot 编号</text>

        <!-- 三轨道 -->
        <g v-for="(track, ti) in tracks" :key="'track'+ti">
          <!-- 轨道标签 -->
          <text :x="4" :y="trackY(ti)+trackH/2+4"
                font-size="10" font-weight="700" fill="track.color">{{ track.label }}</text>
          <!-- 轨道背景 -->
          <rect :x="labelW" :y="trackY(ti)" :width="svgW-labelW" :height="trackH"
                fill="var(--vp-c-bg-soft)" rx="2" opacity="0.5"/>

          <!-- 事件块 -->
          <g v-for="(ev, ei) in track.events" :key="'ev'+ei">
            <rect :x="timeX(ev.start)" :y="trackY(ti)+2"
                  :width="Math.max(3, timeX(ev.start+ev.dur)-timeX(ev.start)-1)"
                  :height="trackH-4"
                  :fill="ev.color" :opacity="ev.opacity||0.85" rx="2"/>
            <text v-if="ev.dur > 3"
                  :x="timeX(ev.start) + (timeX(ev.start+ev.dur)-timeX(ev.start))/2"
                  :y="trackY(ti)+trackH/2+4"
                  text-anchor="middle" font-size="8" fill="white" font-weight="600">
              {{ ev.label }}
            </text>
          </g>

          <!-- SP 激活/停止标注 -->
          <g v-if="ti === 1">
            <line :x1="timeX(spActivate)" :y1="trackY(0)" :x2="timeX(spActivate)" :y2="trackY(2)+trackH"
                  stroke="#3fb950" stroke-width="1" stroke-dasharray="4 3"/>
            <text :x="timeX(spActivate)+2" :y="trackY(0)-2"
                  font-size="8" fill="#3fb950">MAC CE 激活</text>
            <line :x1="timeX(spDeactivate)" :y1="trackY(0)" :x2="timeX(spDeactivate)" :y2="trackY(2)+trackH"
                  stroke="#f85149" stroke-width="1" stroke-dasharray="4 3"/>
            <text :x="timeX(spDeactivate)+2" :y="trackY(0)-2"
                  font-size="8" fill="#f85149">MAC CE 停止</text>
          </g>

          <!-- AP 触发标注 -->
          <g v-if="ti === 2">
            <line :x1="timeX(apTrigger)" :y1="trackY(2)-2" :x2="timeX(apTrigger)" :y2="trackY(2)+trackH+2"
                  stroke="#d29922" stroke-width="1.5"/>
            <text :x="timeX(apTrigger)+2" :y="trackY(2)-3"
                  font-size="8" fill="#d29922">DCI 触发</text>
          </g>
        </g>

        <!-- NTN RTT 窗口标注 -->
        <g v-if="scenario==='ntn'">
          <rect :x="timeX(apTrigger+apDelay)" :y="trackY(2)+2"
                :width="timeX(apTrigger+apDelay+ntnRtt)-timeX(apTrigger+apDelay)"
                :height="trackH-4"
                fill="#bc8cff" opacity="0.25" rx="2"/>
          <text :x="timeX(apTrigger+apDelay + ntnRtt/2)" :y="trackY(2)+trackH/2+4"
                text-anchor="middle" font-size="8" fill="#bc8cff">RTT</text>
          <text :x="timeX(apTrigger+apDelay + ntnRtt/2)" :y="trackY(2)+trackH+14"
                text-anchor="middle" font-size="9" fill="#bc8cff">
            NTN RTT ≈ {{ (ntnRtt*0.5).toFixed(0) }} ms
          </text>
        </g>
      </svg>
    </div>

    <!-- 图例 + 说明 -->
    <div class="legend-row">
      <div class="leg-item"><span class="leg-dot" style="background:#58a6ff"/>Periodic CSI-RS 发送</div>
      <div class="leg-item"><span class="leg-dot" style="background:#58a6ff;opacity:0.4"/>Periodic 上报</div>
      <div class="leg-item"><span class="leg-dot" style="background:#3fb950"/>SP CSI-RS</div>
      <div class="leg-item"><span class="leg-dot" style="background:#d29922"/>AP CSI-RS</div>
      <div class="leg-item"><span class="leg-dot" style="background:#f85149"/>CSI 上报（PUCCH/PUSCH）</div>
      <div class="leg-item" v-if="scenario==='ntn'"><span class="leg-dot" style="background:#bc8cff"/>NTN 传播时延</div>
    </div>

    <div class="info-cards">
      <div class="info-card" style="border-left-color:#58a6ff">
        <div class="ic-title">Periodic</div>
        <div class="ic-text">无需触发，自动按 {{ periodP }} slots 周期上报。适合慢变信道（步行用户），常规 CQI 维护。</div>
      </div>
      <div class="info-card" style="border-left-color:#3fb950">
        <div class="ic-title">Semi-Persistent</div>
        <div class="ic-text">slot {{ spActivate }} 通过 MAC CE 激活，slot {{ spDeactivate }} 停止。动态开启/关闭，比 Periodic 省功耗。</div>
      </div>
      <div class="info-card" style="border-left-color:#d29922">
        <div class="ic-title">Aperiodic</div>
        <div class="ic-text">slot {{ apTrigger }} 由 DCI 触发，延迟 {{ apDelay }} slots 后 CSI-RS 发送。
          {{ scenario === 'ntn' ? 'NTN 场景 RTT 约 ' + (ntnRtt*0.5).toFixed(0) + 'ms，需配置 reportSlotOffsetList-r17 覆盖大时延。' : '按需触发，时延最灵活，适合突发业务或波束切换后快速更新 CQI。' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const periodP = ref(20)
const spActivate = ref(20)
const spDeactivate = ref(90)
const apTrigger = ref(60)
const scenario = ref<'ground'|'ntn'>('ground')

const totalSlots = 160
const svgW = 720
const svgH = 190
const labelW = 56
const trackH = 26
const trackGap = 14

function trackY(i: number) { return 18 + i * (trackH + trackGap) }
function timeX(s: number) { return labelW + (s / totalSlots) * (svgW - labelW - 8) }

const apDelay = 4   // AP CSI-RS 发送延迟（slots）
const ntnRtt = computed(() => scenario.value === 'ntn' ? 14 : 0)  // 约 7ms = 14 slots @30kHz

// 生成事件
const periodicEvents = computed(() => {
  const evs = []
  for (let s = 0; s <= totalSlots; s += periodP.value) {
    evs.push({ start: s, dur: 1, color: '#58a6ff', opacity: 0.85, label: '' })
    const reportSlot = s + 4 + (scenario.value === 'ntn' ? ntnRtt.value : 0)
    if (reportSlot <= totalSlots) {
      evs.push({ start: reportSlot, dur: 1, color: '#3b82f6', opacity: 0.4, label: '' })
    }
  }
  return evs
})

const spEvents = computed(() => {
  const evs = []
  if (spActivate.value >= spDeactivate.value) return evs
  for (let s = spActivate.value; s <= spDeactivate.value; s += periodP.value) {
    evs.push({ start: s, dur: 1, color: '#3fb950', opacity: 0.9, label: '' })
    const rep = s + 4 + (scenario.value === 'ntn' ? ntnRtt.value : 0)
    if (rep <= spDeactivate.value + 10) {
      evs.push({ start: rep, dur: 1, color: '#f85149', opacity: 0.8, label: '' })
    }
  }
  return evs
})

const apEvents = computed(() => {
  const evs = []
  const csiRsSend = apTrigger.value + apDelay
  evs.push({ start: csiRsSend, dur: 1, color: '#d29922', opacity: 0.9, label: '' })
  const reportSlot = csiRsSend + 4 + (scenario.value === 'ntn' ? ntnRtt.value : 0)
  if (reportSlot <= totalSlots) {
    evs.push({ start: reportSlot, dur: 1, color: '#f85149', opacity: 0.9, label: '' })
  }
  return evs
})

const tracks = computed(() => [
  { label: 'Periodic', color: '#58a6ff', events: periodicEvents.value },
  { label: 'SP', color: '#3fb950', events: spEvents.value },
  { label: 'AP', color: '#d29922', events: apEvents.value },
])
</script>

<style scoped>
.crt-root {
  font-family: var(--vp-font-family-mono, monospace);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px; padding: 16px; margin: 24px 0;
  color: var(--vp-c-text-1);
}
.crt-header { margin-bottom: 12px; }
.crt-title { font-size: 15px; font-weight: 700; color: var(--vp-c-brand); display: block; }
.crt-sub { font-size: 11px; color: var(--vp-c-text-2); }

.crt-controls {
  display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;
  padding: 10px; background: var(--vp-c-bg);
  border-radius: 6px; border: 1px solid var(--vp-c-divider); align-items: center;
}
.ctrl-group { display: flex; align-items: center; gap: 7px; }
.ctrl-group label { font-size: 11px; color: var(--vp-c-text-2); white-space: nowrap; }
.ctrl-group select {
  font-size: 11px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider); border-radius: 4px; padding: 2px 6px;
}
.ctrl-group input[type=range] { width: 80px; accent-color: var(--vp-c-brand); }
.ctrl-val { font-size: 12px; color: var(--vp-c-brand); min-width: 50px; }
.btn-group { display: flex; gap: 3px; }
.ctrl-btn {
  padding: 3px 9px; font-size: 11px; border-radius: 4px;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2); cursor: pointer;
}
.ctrl-btn.active { background: var(--vp-c-brand); border-color: var(--vp-c-brand); color: #fff; }

.gantt-wrap { overflow-x: auto; }
.gantt-svg { width: 100%; min-width: 500px; height: auto; }

.legend-row {
  display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0;
}
.leg-item { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--vp-c-text-2); }
.leg-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }

.info-cards { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.info-card {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-left-width: 3px; border-radius: 6px; padding: 10px;
}
.ic-title { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
.ic-text { font-size: 10px; color: var(--vp-c-text-2); line-height: 1.6; }

@media (max-width: 600px) {
  .info-cards { grid-template-columns: 1fr; }
  .crt-controls { flex-direction: column; }
}
</style>
