<template>
  <div class="cpc-wrap">

    <div class="cpc-header">
      <span class="cpc-title">PRACH Preamble 碰撞概率分析器</span>
      <span class="cpc-spec">3GPP TS 38.321 §5.1.4</span>
    </div>

    <!-- 控制区 -->
    <div class="cpc-controls">
      <div class="ctrl-group">
        <div class="ctrl-label">
          同时发起 RACH 的 UE 数量
          <span class="ctrl-value">{{ nUE }}</span>
        </div>
        <input type="range" min="1" max="100" step="1"
               v-model.number="nUE" class="cpc-slider"/>
        <div class="ctrl-hints"><span>1 UE</span><span>100 UE</span></div>
      </div>

      <div class="ctrl-group">
        <div class="ctrl-label">Preamble 总数</div>
        <div class="pre-btns">
          <button v-for="n in [32, 52, 64]" :key="n"
                  :class="['pre-btn', { active: nPreambles === n }]"
                  @click="nPreambles = n">
            {{ n }} 个
          </button>
        </div>
        <div class="ctrl-sub">通常 64 个（CBRA 可用）；切换可对比</div>
      </div>
    </div>

    <!-- 结果区 -->
    <div class="cpc-results">

      <div class="res-card main-card" :class="collisionClass">
        <div class="res-label">碰撞概率</div>
        <div class="res-prob">{{ (collisionProb * 100).toFixed(1) }}<span class="res-pct">%</span></div>
        <div class="res-bar-wrap">
          <div class="res-bar" :style="{ width: (collisionProb * 100) + '%',
                                         background: barColor }"></div>
        </div>
        <div class="res-desc">{{ collisionDesc }}</div>
      </div>

      <div class="res-stats">
        <div class="stat-row" v-for="s in stats" :key="s.label">
          <span class="stat-label">{{ s.label }}</span>
          <span class="stat-value" :style="{ color: s.color }">{{ s.value }}</span>
        </div>
      </div>

    </div>

    <!-- SVG 折线图 -->
    <div class="cpc-chart-wrap">
      <div class="chart-title">碰撞概率曲线（当前位置：{{ nUE }} UE）</div>
      <svg :viewBox="`0 0 ${svgW} ${svgH}`" class="cpc-svg" role="img"
           aria-label="碰撞概率与UE数量关系图">

        <!-- 坐标轴 -->
        <line :x1="pad" :y1="pad" :x2="pad" :y2="svgH-pad"
              stroke="var(--vp-c-divider)" stroke-width="1"/>
        <line :x1="pad" :y1="svgH-pad" :x2="svgW-pad" :y2="svgH-pad"
              stroke="var(--vp-c-divider)" stroke-width="1"/>

        <!-- Y轴刻度（0/10/20/.../100%） -->
        <g v-for="pct in [0,20,40,60,80,100]" :key="pct">
          <line :x1="pad-4" :y1="yOf(pct/100)" :x2="pad" :y2="yOf(pct/100)"
                stroke="var(--vp-c-divider)" stroke-width="1"/>
          <text :x="pad-7" :y="yOf(pct/100)+4" text-anchor="end"
                font-size="10" fill="var(--vp-c-text-3)">{{ pct }}%</text>
          <line v-if="pct > 0 && pct < 100"
                :x1="pad" :y1="yOf(pct/100)" :x2="svgW-pad" :y2="yOf(pct/100)"
                stroke="var(--vp-c-divider)" stroke-width="0.5" opacity="0.4"/>
        </g>

        <!-- X轴刻度 -->
        <g v-for="xt in xTicks" :key="xt.val">
          <line :x1="xOf(xt.val)" :y1="svgH-pad" :x2="xOf(xt.val)" :y2="svgH-pad+4"
                stroke="var(--vp-c-divider)" stroke-width="1"/>
          <text :x="xOf(xt.val)" :y="svgH-pad+14" text-anchor="middle"
                font-size="10" fill="var(--vp-c-text-3)">{{ xt.val }}</text>
        </g>

        <!-- 轴标签 -->
        <text :x="pad + chartW/2" :y="svgH-2"
              text-anchor="middle" font-size="11" fill="var(--vp-c-text-2)">
          同时接入 UE 数量
        </text>

        <!-- 参考线：10% 可接受门限 -->
        <line :x1="pad" :y1="yOf(0.1)" :x2="svgW-pad" :y2="yOf(0.1)"
              stroke="#3fb950" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.8"/>
        <text :x="svgW-pad-4" :y="yOf(0.1)-4"
              text-anchor="end" font-size="10" fill="#3fb950">10%（可接受上限）</text>

        <!-- 参考线：50% -->
        <line :x1="pad" :y1="yOf(0.5)" :x2="svgW-pad" :y2="yOf(0.5)"
              stroke="#ffa657" stroke-width="1" stroke-dasharray="4 3" opacity="0.6"/>
        <text :x="svgW-pad-4" :y="yOf(0.5)-4"
              text-anchor="end" font-size="10" fill="#ffa657">50%</text>

        <!-- 碰撞概率折线 -->
        <polyline :points="curvePoints"
                  fill="none" stroke="var(--vp-c-brand-1)"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

        <!-- 当前 UE 数量的高亮点 -->
        <circle :cx="xOf(nUE)" :cy="yOf(collisionProb)"
                r="6" :fill="barColor"
                stroke="var(--vp-c-bg)" stroke-width="2"/>

        <!-- 当前点虚线 -->
        <line :x1="xOf(nUE)" :y1="yOf(collisionProb)"
              :x2="xOf(nUE)" :y2="svgH-pad"
              :stroke="barColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>
        <line :x1="pad" :y1="yOf(collisionProb)"
              :x2="xOf(nUE)" :y2="yOf(collisionProb)"
              :stroke="barColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>

        <!-- 标注 -->
        <text :x="xOf(nUE)+8" :y="yOf(collisionProb)-8"
              font-size="11" font-weight="600" :fill="barColor">
          {{ (collisionProb * 100).toFixed(1) }}%
        </text>
      </svg>
    </div>

    <!-- 关键洞见 -->
    <div class="insight-box">
      <span class="i-icon">💡</span>
      <span class="i-text">
        <b>碰撞 ≠ RACH 失败</b>：碰撞后两个 UE 独立随机退避（0~{{ backoffMaxMs }}ms），
        大概率在不同时刻重试；功率爬坡（每次 +{{ powerRampDb }}dB）确保第二次成功率更高。
        实际系统中 RACH 成功率 > 99%，即使在高负载场景。
      </span>
    </div>

    <div class="cpc-hint">拖动滑块改变 UE 数量，切换 Preamble 总数，观察碰撞概率变化</div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const nUE        = ref(10)
const nPreambles = ref(64)
const backoffMaxMs  = 20
const powerRampDb   = 2

// ── 碰撞概率计算（精确公式）───────────────────────────────────────────────
function collisionProbFor(k: number, N: number): number {
  if (k <= 0) return 0
  if (k > N)  return 1
  let pNoColl = 1.0
  for (let i = 0; i < k; i++) {
    pNoColl *= (N - i) / N
  }
  return 1 - pNoColl
}

const collisionProb = computed(() =>
  collisionProbFor(nUE.value, nPreambles.value)
)

// 找到碰撞率 < 10% 时的最大 UE 数
const maxSafeUE = computed(() => {
  for (let k = 1; k <= 200; k++) {
    if (collisionProbFor(k, nPreambles.value) >= 0.1) return k - 1
  }
  return 200
})

// 期望重试次数（近似：每次碰撞概率为 p，期望重试 = 1/(1-p)）
const expectedRetries = computed(() =>
  collisionProb.value < 1
    ? (1 / (1 - collisionProb.value)).toFixed(2)
    : '∞'
)

const collisionClass = computed(() => {
  const p = collisionProb.value * 100
  if (p < 10)  return 'safe'
  if (p < 40)  return 'warn'
  return 'danger'
})

const barColor = computed(() => {
  const p = collisionProb.value * 100
  if (p < 10)  return '#3fb950'
  if (p < 40)  return '#ffa657'
  return '#ff7b72'
})

const collisionDesc = computed(() => {
  const p = collisionProb.value * 100
  if (p < 10)  return '✅ 碰撞率低，接入性能良好'
  if (p < 40)  return '⚠️ 碰撞率中等，可能影响接入时延'
  if (p < 70)  return '❌ 碰撞率高，建议增加 Preamble 数量'
  return '🚨 碰撞率极高，需要 RACH 拥塞控制机制'
})

const stats = computed(() => [
  {
    label: '最大安全并发 UE（碰撞 < 10%）',
    value: `${maxSafeUE.value} UE`,
    color: '#3fb950',
  },
  {
    label: '期望接入重试次数',
    value: `${expectedRetries.value} 次`,
    color: collisionProb.value > 0.5 ? '#ff7b72' : 'var(--vp-c-text-1)',
  },
  {
    label: '单 UE 碰撞概率（任意另一 UE 选同一 Preamble）',
    value: `${(1 - (nPreambles.value - 1) / nPreambles.value).toFixed(4)} × (N_UE - 1)`,
    color: 'var(--vp-c-text-2)',
  },
])

// ── SVG ──────────────────────────────────────────────────────────────────
const svgW   = 520
const svgH   = 200
const pad    = 42
const chartW = svgW - pad * 2
const chartH = svgH - pad * 2
const maxUEX = 100

const xOf = (k: number) => pad + (k / maxUEX) * chartW
const yOf = (p: number) => svgH - pad - Math.min(p, 1) * chartH

const xTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => ({
  val: v, x: xOf(v),
}))

const curvePoints = computed(() => {
  const pts = []
  for (let k = 0; k <= maxUEX; k++) {
    const p = collisionProbFor(k, nPreambles.value)
    pts.push(`${xOf(k).toFixed(1)},${yOf(p).toFixed(1)}`)
  }
  return pts.join(' ')
})
</script>

<style scoped>
.cpc-wrap {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px; padding: 20px; margin: 20px 0;
  background: var(--vp-c-bg-soft); font-size: 13px;
}
.cpc-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.cpc-title  { font-size: 15px; font-weight: 600; color: var(--vp-c-text-1); }
.cpc-spec   { font-size: 11px; padding: 2px 8px; border-radius: 20px;
              background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }

.cpc-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
@media (max-width: 560px) { .cpc-controls { grid-template-columns: 1fr; } }

.ctrl-group { display: flex; flex-direction: column; gap: 6px; }
.ctrl-label {
  font-size: 12px; font-weight: 500; color: var(--vp-c-text-2);
  display: flex; justify-content: space-between;
}
.ctrl-value { font-size: 14px; font-weight: 700;
              font-family: var(--vp-font-family-mono); color: var(--vp-c-brand-1); }
.ctrl-hints { display: flex; justify-content: space-between;
              font-size: 10px; color: var(--vp-c-text-3); }
.ctrl-sub   { font-size: 11px; color: var(--vp-c-text-3); }

.cpc-slider { width: 100%; height: 4px; cursor: pointer; accent-color: var(--vp-c-brand-1); }

.pre-btns { display: flex; gap: 6px; }
.pre-btn {
  padding: 5px 14px; border-radius: 6px; font-size: 12px; cursor: pointer;
  border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-2); transition: all 0.15s;
}
.pre-btn:hover  { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.pre-btn.active { background: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); color: #fff; }

/* 结果区 */
.cpc-results { display: grid; grid-template-columns: 180px 1fr; gap: 12px; margin-bottom: 14px; }
@media (max-width: 560px) { .cpc-results { grid-template-columns: 1fr; } }

.main-card {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 10px; padding: 14px; text-align: center;
}
.main-card.safe   { border-color: #3fb950; background: #f0fdf4; }
.main-card.warn   { border-color: #ffa657; background: #fff8ee; }
.main-card.danger { border-color: #ff7b72; background: #fff2f0; }

.res-label { font-size: 11px; color: var(--vp-c-text-3); margin-bottom: 4px; }
.res-prob  {
  font-size: 36px; font-weight: 700;
  font-family: var(--vp-font-family-mono); color: var(--vp-c-text-1);
  line-height: 1.1;
}
.res-pct { font-size: 18px; color: var(--vp-c-text-2); }
.res-bar-wrap {
  height: 6px; background: var(--vp-c-bg-elv); border-radius: 3px;
  margin: 8px 0; overflow: hidden;
}
.res-bar { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
.res-desc { font-size: 11.5px; color: var(--vp-c-text-2); line-height: 1.4; }

.res-stats {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 10px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 10px; justify-content: center;
}
.stat-row  { display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 11px; color: var(--vp-c-text-3); }
.stat-value { font-size: 13px; font-weight: 600; font-family: var(--vp-font-family-mono); }

/* SVG 图表 */
.cpc-chart-wrap {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 10px; margin-bottom: 12px;
}
.chart-title { font-size: 12px; color: var(--vp-c-text-2); margin-bottom: 6px; font-weight: 500; }
.cpc-svg { width: 100%; height: auto; display: block; }

/* 洞见框 */
.insight-box {
  display: flex; gap: 8px; align-items: flex-start;
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-brand-soft);
  border-left: 3px solid var(--vp-c-brand-1);
  border-radius: 6px; padding: 10px 13px; font-size: 12.5px;
  color: var(--vp-c-text-2); line-height: 1.65; margin-bottom: 8px;
}
.i-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }

.cpc-hint { font-size: 11.5px; color: var(--vp-c-text-3); text-align: center; }
</style>
