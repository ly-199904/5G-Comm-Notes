<template>
  <div class="nwa-wrap">

    <div class="nwa-header">
      <span class="nwa-title">NTN ra-ResponseWindow 分析器</span>
      <span class="nwa-spec">3GPP TR 38.821 §6.3 · Rel-17</span>
    </div>

    <!-- 控制区 -->
    <div class="nwa-controls">

      <!-- 仰角滑块 -->
      <div class="ctrl-group">
        <div class="ctrl-label">
          卫星仰角 θ
          <span class="ctrl-value">{{ elevation }}°</span>
        </div>
        <input type="range" min="10" max="90" step="1"
               v-model.number="elevation" class="nwa-slider" />
        <div class="ctrl-hints">
          <span>10°（边缘）</span><span>90°（正上方）</span>
        </div>
      </div>

      <!-- 轨道类型 -->
      <div class="ctrl-group">
        <div class="ctrl-label">轨道类型</div>
        <div class="orbit-btns">
          <button v-for="o in orbits" :key="o.key"
                  :class="['orbit-btn', { active: orbitKey === o.key }]"
                  @click="orbitKey = o.key">
            {{ o.label }}
          </button>
        </div>
      </div>

      <!-- Numerology -->
      <div class="ctrl-group">
        <div class="ctrl-label">Numerology μ（SCS）</div>
        <div class="orbit-btns">
          <button v-for="m in [0,1,2]" :key="m"
                  :class="['orbit-btn', { active: mu === m }]"
                  @click="mu = m">
            μ={{ m }}（{{ scsOf(m) }}kHz）
          </button>
        </div>
      </div>

    </div>

    <!-- 结果面板 -->
    <div class="nwa-results">
      <div class="result-card" v-for="r in resultCards" :key="r.label">
        <div class="rc-label">{{ r.label }}</div>
        <div class="rc-value" :style="{ color: r.color }">{{ r.value }}</div>
        <div class="rc-unit">{{ r.unit }}</div>
      </div>
    </div>

    <!-- 判定横幅 -->
    <div :class="['verdict-banner', sufficient ? 'verdict-ok' : 'verdict-fail']">
      <span class="verdict-icon">{{ sufficient ? '✅' : '❌' }}</span>
      <span class="verdict-text">
        <template v-if="sufficient">
          当前 ra-ResponseWindow（{{ currentWindowSlots }} slots = {{ currentWindowMs.toFixed(1) }}ms）
          足够覆盖 RTT（{{ rttMs.toFixed(2) }}ms）
        </template>
        <template v-else>
          当前 ra-ResponseWindow（{{ currentWindowSlots }} slots = {{ currentWindowMs.toFixed(1) }}ms）
          <b>不足！</b>RTT = {{ rttMs.toFixed(2) }}ms，建议配置 ≥ {{ recommendedSlots }} slots
        </template>
      </span>
    </div>

    <!-- 可视化图：仰角 vs RTT 曲线 + 当前点 -->
    <div class="nwa-chart-wrap">
      <div class="chart-title">RTT 随仰角变化曲线（当前卫星：{{ currentOrbit.label }}）</div>
      <svg :viewBox="`0 0 ${svgW} ${svgH}`" class="nwa-svg" role="img"
           aria-label="仰角与RTT关系图">

        <!-- 坐标轴 -->
        <line :x1="pad" :y1="pad" :x2="pad" :y2="svgH-pad"
              stroke="var(--vp-c-divider)" stroke-width="1"/>
        <line :x1="pad" :y1="svgH-pad" :x2="svgW-pad" :y2="svgH-pad"
              stroke="var(--vp-c-divider)" stroke-width="1"/>

        <!-- Y轴刻度 -->
        <g v-for="yt in yTicks" :key="yt.val">
          <line :x1="pad-4" :y1="yt.y" :x2="pad" :y2="yt.y"
                stroke="var(--vp-c-divider)" stroke-width="1"/>
          <text :x="pad-8" :y="yt.y+4" text-anchor="end"
                font-size="10" fill="var(--vp-c-text-3)">{{ yt.val }}</text>
        </g>

        <!-- X轴刻度 -->
        <g v-for="xt in xTicks" :key="xt.val">
          <line :x1="xt.x" :y1="svgH-pad" :x2="xt.x" :y2="svgH-pad+4"
                stroke="var(--vp-c-divider)" stroke-width="1"/>
          <text :x="xt.x" :y="svgH-pad+14" text-anchor="middle"
                font-size="10" fill="var(--vp-c-text-3)">{{ xt.val }}°</text>
        </g>

        <!-- 轴标签 -->
        <text :x="pad + chartW/2" :y="svgH-2"
              text-anchor="middle" font-size="11" fill="var(--vp-c-text-2)">
          仰角（度）
        </text>
        <text :x="10" :y="pad + chartH/2"
              text-anchor="middle" font-size="11" fill="var(--vp-c-text-2)"
              transform-origin="10 200"
              :transform="`rotate(-90, 10, ${pad + chartH/2})`">
          RTT (ms)
        </text>

        <!-- 地面参考线：默认 40 slots -->
        <line :x1="pad" :y1="yOf(defaultWindowMs)"
              :x2="svgW-pad" :y2="yOf(defaultWindowMs)"
              stroke="#ff7b72" stroke-width="1.5"
              stroke-dasharray="6 3" opacity="0.8"/>
        <text :x="svgW-pad-4" :y="yOf(defaultWindowMs)-4"
              text-anchor="end" font-size="10" fill="#ff7b72">
          Rel-15 默认（{{ defaultWindowMs.toFixed(0) }}ms）
        </text>

        <!-- Rel-17 NTN 640slots 线 -->
        <line :x1="pad" :y1="yOf(rel17WindowMs)"
              :x2="svgW-pad" :y2="yOf(rel17WindowMs)"
              stroke="#3fb950" stroke-width="1.5"
              stroke-dasharray="4 3" opacity="0.7"/>
        <text :x="svgW-pad-4" :y="yOf(rel17WindowMs)-4"
              text-anchor="end" font-size="10" fill="#3fb950">
          Rel-17 NTN 最大（{{ rel17WindowMs.toFixed(0) }}ms）
        </text>

        <!-- RTT 曲线 -->
        <polyline :points="curvePoints"
                  fill="none" stroke="var(--vp-c-brand-1)"
                  stroke-width="2" stroke-linecap="round"/>

        <!-- 当前仰角的高亮点 -->
        <circle :cx="xOf(elevation)" :cy="yOf(rttMs)"
                r="6" fill="var(--vp-c-brand-1)"
                stroke="var(--vp-c-bg)" stroke-width="2"/>

        <!-- 当前点标注 -->
        <text :x="xOf(elevation)+10" :y="yOf(rttMs)-8"
              font-size="11" font-weight="600"
              fill="var(--vp-c-brand-1)">
          {{ rttMs.toFixed(1) }}ms
        </text>

        <!-- 当前仰角垂直辅助线 -->
        <line :x1="xOf(elevation)" :y1="pad"
              :x2="xOf(elevation)" :y2="svgH-pad"
              stroke="var(--vp-c-brand-1)" stroke-width="1"
              stroke-dasharray="3 3" opacity="0.5"/>

      </svg>
    </div>

    <div class="nwa-hint">
      拖动仰角滑块，观察 RTT 变化与 ra-ResponseWindow 的覆盖关系
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// ── 常量 ──────────────────────────────────────────────────────────────────
const RE_KM = 6371.0
const C_KMS = 300.0   // 光速 km/ms

const orbits = [
  { key: 'leo550',  label: 'LEO 550km',  alt: 550  },
  { key: 'leo1200', label: 'LEO 1200km', alt: 1200 },
  { key: 'meo',     label: 'MEO 8062km', alt: 8062 },
]

// ── 状态 ──────────────────────────────────────────────────────────────────
const elevation = ref(45)
const orbitKey  = ref('leo550')
const mu        = ref(1)

// ── 计算属性 ──────────────────────────────────────────────────────────────
const scsOf  = (m: number) => (2 ** m) * 15
const slotMs = computed(() => 1.0 / (2 ** mu.value))

const currentOrbit = computed(() =>
  orbits.find(o => o.key === orbitKey.value)!
)

function rttAtElev(elev: number, alt: number): number {
  const r_km   = RE_KM + alt
  const sin_e  = Math.sin(elev * Math.PI / 180)
  const cos_e  = Math.cos(elev * Math.PI / 180)
  const d_km   = Math.sqrt(r_km ** 2 - (RE_KM * cos_e) ** 2) - RE_KM * sin_e
  return 2 * d_km / C_KMS
}

const rttMs = computed(() =>
  rttAtElev(elevation.value, currentOrbit.value.alt)
)

const recommendedSlots = computed(() =>
  Math.ceil((rttMs.value + 5) / slotMs.value)  // +5ms 处理裕量
)

const defaultWindowSlots = 40
const rel17MaxSlots      = 640

const defaultWindowMs = computed(() => defaultWindowSlots * slotMs.value)
const rel17WindowMs   = computed(() => rel17MaxSlots * slotMs.value)

// 使用 Rel-15 默认值判定
const currentWindowSlots = computed(() => defaultWindowSlots)
const currentWindowMs    = computed(() => defaultWindowMs.value)
const sufficient         = computed(() => rttMs.value < currentWindowMs.value)

const resultCards = computed(() => [
  {
    label: '单程时延',
    value: (rttMs.value / 2).toFixed(2),
    unit:  'ms',
    color: 'var(--vp-c-text-1)',
  },
  {
    label: '往返时延 RTT',
    value: rttMs.value.toFixed(2),
    unit:  'ms',
    color: rttMs.value > defaultWindowMs.value ? '#ff7b72' : 'var(--vp-c-text-1)',
  },
  {
    label: '建议最小 ra-ResponseWindow',
    value: recommendedSlots.value,
    unit:  `slots（= ${(recommendedSlots.value * slotMs.value).toFixed(1)}ms）`,
    color: recommendedSlots.value > defaultWindowSlots ? '#ffa657' : '#3fb950',
  },
  {
    label: '当前 SCS',
    value: scsOf(mu.value),
    unit:  `kHz（μ=${mu.value}，slot=${slotMs.value.toFixed(1)}ms）`,
    color: 'var(--vp-c-text-2)',
  },
])

// ── SVG 图表 ───────────────────────────────────────────────────────────────
const svgW  = 520
const svgH  = 220
const pad   = 45
const chartW = svgW - pad * 2
const chartH = svgH - pad * 2

const maxRtt = computed(() => {
  const rtt10 = rttAtElev(10, currentOrbit.value.alt)
  return Math.ceil(rtt10 * 1.1)
})

const xOf = (elev: number) =>
  pad + ((elev - 10) / 80) * chartW

const yOf = (rtt: number) =>
  svgH - pad - Math.min(rtt / maxRtt.value, 1) * chartH

const xTicks = computed(() =>
  [10, 20, 30, 45, 60, 75, 90].map(v => ({ val: v, x: xOf(v) }))
)

const yTicks = computed(() => {
  const step = maxRtt.value <= 50 ? 10 : maxRtt.value <= 200 ? 50 : 100
  const ticks = []
  for (let v = 0; v <= maxRtt.value; v += step) {
    ticks.push({ val: v, y: yOf(v) })
  }
  return ticks
})

const curvePoints = computed(() => {
  const pts = []
  for (let e = 10; e <= 90; e += 2) {
    const rtt = rttAtElev(e, currentOrbit.value.alt)
    pts.push(`${xOf(e).toFixed(1)},${yOf(rtt).toFixed(1)}`)
  }
  return pts.join(' ')
})
</script>

<style scoped>
.nwa-wrap {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
  background: var(--vp-c-bg-soft);
  font-size: 13px;
}

.nwa-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;
}
.nwa-title { font-size: 15px; font-weight: 600; color: var(--vp-c-text-1); }
.nwa-spec  { font-size: 11px; padding: 2px 8px; border-radius: 20px;
             background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }

/* 控制区 */
.nwa-controls {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 16px; margin-bottom: 16px; flex-wrap: wrap;
}
@media (max-width: 640px) { .nwa-controls { grid-template-columns: 1fr; } }

.ctrl-group { display: flex; flex-direction: column; gap: 6px; }
.ctrl-label {
  font-size: 12px; font-weight: 500; color: var(--vp-c-text-2);
  display: flex; justify-content: space-between; align-items: center;
}
.ctrl-value { font-size: 14px; font-weight: 700; color: var(--vp-c-brand-1);
              font-family: var(--vp-font-family-mono); }
.ctrl-hints { display: flex; justify-content: space-between;
              font-size: 10px; color: var(--vp-c-text-3); }

.nwa-slider { width: 100%; height: 4px; cursor: pointer; accent-color: var(--vp-c-brand-1); }

.orbit-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.orbit-btn {
  padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;
  border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-2); transition: all 0.15s;
}
.orbit-btn:hover  { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.orbit-btn.active { background: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); color: #fff; }

/* 结果卡片 */
.nwa-results {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px; margin-bottom: 12px;
}
.result-card {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 10px 12px;
}
.rc-label { font-size: 11px; color: var(--vp-c-text-3); margin-bottom: 3px; }
.rc-value { font-size: 22px; font-weight: 700;
            font-family: var(--vp-font-family-mono); line-height: 1.2; }
.rc-unit  { font-size: 11px; color: var(--vp-c-text-3); margin-top: 2px; }

/* 判定横幅 */
.verdict-banner {
  display: flex; align-items: flex-start; gap: 8px;
  border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;
  font-size: 13px; line-height: 1.6;
}
.verdict-ok   { background: #e6f4ea; border: 1px solid #a8d5b0; color: #1a5c2a; }
.verdict-fail { background: #fdecea; border: 1px solid #f5b7b1; color: #7b1d1d; }
.verdict-icon { font-size: 15px; flex-shrink: 0; margin-top: 1px; }

/* SVG 图表 */
.nwa-chart-wrap {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 10px; margin-bottom: 10px;
}
.chart-title { font-size: 12px; color: var(--vp-c-text-2);
               margin-bottom: 6px; font-weight: 500; }
.nwa-svg { width: 100%; height: auto; display: block; }

.nwa-hint { font-size: 11.5px; color: var(--vp-c-text-3); text-align: center; }
</style>
