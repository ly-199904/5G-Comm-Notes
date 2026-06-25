<template>
  <div class="pcc-wrap">
    <div class="pcc-header">
      <span class="pcc-title">PAPR CCDF 对比图</span>
      <span class="pcc-spec">3GPP TS 38.211 §5.3/§6.3</span>
    </div>

    <div class="pcc-controls">
      <div class="ctrl-group">
        <div class="ctrl-label">
          CCDF 参考概率线
          <span class="cv">{{ probTarget }}%</span>
        </div>
        <input type="range" min="0.1" max="10" step="0.1"
               v-model.number="probTarget" class="pcc-slider"/>
        <div class="ctrl-hints"><span>0.1%（严苛）</span><span>10%（宽松）</span></div>
      </div>
      <div class="ctrl-group">
        <div class="ctrl-label">子载波数 N（对数坐标）</div>
        <div class="nbtn-row">
          <button v-for="n in [64,256,1024,2048]" :key="n"
                  :class="['nbtn',{active:N===n}]" @click="N=n">{{ n }}</button>
        </div>
      </div>
    </div>

    <!-- SVG 图表 -->
    <div class="chart-wrap">
      <svg :viewBox="`0 0 ${svgW} ${svgH}`" class="pcc-svg">
        <!-- 背景 -->
        <rect width="100%" height="100%" fill="var(--vp-c-bg)"/>

        <!-- Y轴网格 -->
        <g v-for="yt in yTicks" :key="yt.val">
          <line :x1="pad" :y1="yt.y" :x2="svgW-pad" :y2="yt.y"
                stroke="var(--vp-c-divider)" stroke-width="0.5" opacity="0.6"/>
          <text :x="pad-6" :y="yt.y+4" text-anchor="end"
                font-size="10" fill="var(--vp-c-text-3)">{{ yt.label }}</text>
        </g>

        <!-- X轴网格 -->
        <g v-for="xt in xTicks" :key="xt.val">
          <line :x1="xt.x" :y1="pad" :x2="xt.x" :y2="svgH-pad"
                stroke="var(--vp-c-divider)" stroke-width="0.5" opacity="0.6"/>
          <text :x="xt.x" :y="svgH-pad+14" text-anchor="middle"
                font-size="10" fill="var(--vp-c-text-3)">{{ xt.val }}dB</text>
        </g>

        <!-- 坐标轴 -->
        <line :x1="pad" :y1="pad" :x2="pad" :y2="svgH-pad"
              stroke="var(--vp-c-divider)" stroke-width="1"/>
        <line :x1="pad" :y1="svgH-pad" :x2="svgW-pad" :y2="svgH-pad"
              stroke="var(--vp-c-divider)" stroke-width="1"/>

        <!-- 各波形 CCDF 曲线 -->
        <polyline v-for="w in waveforms" :key="w.key"
                  :points="w.points"
                  fill="none" :stroke="w.color"
                  stroke-width="2.5" stroke-linecap="round"/>

        <!-- 参考概率线 -->
        <line :x1="pad" :y1="yOfProb(probTarget/100)"
              :x2="svgW-pad" :y2="yOfProb(probTarget/100)"
              stroke="#ffa657" stroke-width="1.5" stroke-dasharray="5 3"/>
        <text :x="svgW-pad-4" :y="yOfProb(probTarget/100)-5"
              text-anchor="end" font-size="10" fill="#ffa657">
          {{ probTarget }}%
        </text>

        <!-- 交点标注 -->
        <g v-for="w in waveforms" :key="'pt-'+w.key">
          <circle :cx="xOfPapr(w.paprAtProb)" :cy="yOfProb(probTarget/100)"
                  r="5" :fill="w.color" stroke="var(--vp-c-bg)" stroke-width="2"/>
          <text :x="xOfPapr(w.paprAtProb)" :y="yOfProb(probTarget/100)-10"
                text-anchor="middle" font-size="10" :fill="w.color" font-weight="600">
            {{ w.paprAtProb.toFixed(1) }}dB
          </text>
        </g>

        <!-- 轴标签 -->
        <text :x="pad + chartW/2" :y="svgH-2"
              text-anchor="middle" font-size="11" fill="var(--vp-c-text-2)">
          PAPR 阈值 (dB)
        </text>
        <text x="12" :y="pad + chartH/2"
              text-anchor="middle" font-size="11" fill="var(--vp-c-text-2)"
              :transform="`rotate(-90, 12, ${pad + chartH/2})`">
          P(PAPR > 阈值)
        </text>
      </svg>
    </div>

    <!-- PA backoff 对比卡片 -->
    <div class="backoff-section">
      <div class="bo-title">PA Backoff 节省量对比（参考概率 {{ probTarget }}%）</div>
      <div class="bo-cards">
        <div class="bo-card" v-for="w in waveforms" :key="'bo-'+w.key"
             :style="{ borderColor: w.color }">
          <div class="bo-name" :style="{ color: w.color }">{{ w.name }}</div>
          <div class="bo-papr">PAPR = <b>{{ w.paprAtProb.toFixed(1) }}dB</b></div>
          <div class="bo-save" v-if="w.key !== 'cpofdm'">
            比 CP-OFDM 节省
            <b :style="{ color: w.color }">
              {{ (waveforms[0].paprAtProb - w.paprAtProb).toFixed(1) }}dB
            </b>
            backoff
          </div>
          <div class="bo-coverage" v-if="w.key !== 'cpofdm'">
            ≈ 覆盖半径扩大
            <b :style="{ color: w.color }">
              {{ coverageGain(waveforms[0].paprAtProb - w.paprAtProb) }}%
            </b>
          </div>
          <div class="bo-base" v-else>基准（地面 DL 标准）</div>
        </div>
      </div>
    </div>

    <div class="pcc-hint">
      拖动概率线查看不同 PA 设计点下各波形的 PAPR 阈值；N 影响 CP-OFDM 的理论上限（≈10logN dB）
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const probTarget = ref(1)
const N = ref(256)

const svgW = 520, svgH = 280, pad = 48
const chartW = svgW - pad * 2, chartH = svgH - pad * 2
const paprMin = 0, paprMax = 18

// 对数坐标 Y 轴（1 → 0.001）
const probMin = 0.001, probMax = 1.0
function yOfProb(p: number) {
  const logMin = Math.log10(probMin), logMax = Math.log10(probMax)
  const logP   = Math.log10(Math.max(p, probMin))
  return pad + (1 - (logP - logMin) / (logMax - logMin)) * chartH
}
function xOfPapr(p: number) {
  return pad + ((p - paprMin) / (paprMax - paprMin)) * chartW
}

const xTicks = [0,2,4,6,8,10,12,14,16,18].map(v => ({ val: v, x: xOfPapr(v) }))
const yTicks = [
  { val: 1,     label: '100%', y: yOfProb(1) },
  { val: 0.1,   label: '10%',  y: yOfProb(0.1) },
  { val: 0.01,  label: '1%',   y: yOfProb(0.01) },
  { val: 0.001, label: '0.1%', y: yOfProb(0.001) },
]

// CCDF 模型（近似解析）
// CP-OFDM: P(PAPR>γ) ≈ 1 - (1-e^(-γ))^N
// DFT-s: 低约 4~6dB
// π/2-BPSK: 低约 8~10dB
function ccdfOFDM(papr: number, n: number) {
  const linear = 10 ** (papr / 10)
  return 1 - (1 - Math.exp(-linear)) ** n
}
function ccdfDFTs(papr: number) {
  return ccdfOFDM(papr - 4.5, 16)  // 等效 N 缩小，PAPR 减少 4.5dB
}
function ccdfPi2(papr: number) {
  return ccdfOFDM(papr - 8.5, 4)   // 近似恒包络
}

function makeCurve(fn: (p: number) => number) {
  const pts: string[] = []
  for (let p = 0; p <= paprMax; p += 0.2) {
    const prob = fn(p)
    if (prob > 0.0009 && prob < 1.01) {
      pts.push(`${xOfPapr(p).toFixed(1)},${yOfProb(prob).toFixed(1)}`)
    }
  }
  return pts.join(' ')
}

// 求 CCDF(papr) = targetProb 时的 papr（二分法）
function paprAtTargetProb(fn: (p: number) => number, targetProb: number): number {
  let lo = 0, hi = 18
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    fn(mid) > targetProb ? (lo = mid) : (hi = mid)
  }
  return (lo + hi) / 2
}

const waveforms = computed(() => {
  const tp = probTarget.value / 100
  return [
    { key: 'cpofdm', name: 'CP-OFDM', color: '#58a6ff',
      points: makeCurve(p => ccdfOFDM(p, N.value)),
      paprAtProb: paprAtTargetProb(p => ccdfOFDM(p, N.value), tp) },
    { key: 'dfts', name: 'DFT-s-OFDM', color: '#3fb950',
      points: makeCurve(ccdfDFTs),
      paprAtProb: paprAtTargetProb(ccdfDFTs, tp) },
    { key: 'pi2', name: 'π/2-BPSK+DFT-s', color: '#ffa657',
      points: makeCurve(ccdfPi2),
      paprAtProb: paprAtTargetProb(ccdfPi2, tp) },
  ]
})

function coverageGain(dbSaving: number): string {
  // 自由空间：每 6dB ≈ 2× 距离，面积 4×
  const ratio = 10 ** (dbSaving / 20) - 1
  return Math.round(ratio * 100).toString()
}
</script>

<style scoped>
.pcc-wrap{border:1px solid var(--vp-c-divider);border-radius:12px;padding:20px;margin:20px 0;background:var(--vp-c-bg-soft);font-size:13px}
.pcc-header{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.pcc-title{font-size:15px;font-weight:600;color:var(--vp-c-text-1)}
.pcc-spec{font-size:11px;padding:2px 8px;border-radius:20px;background:var(--vp-c-brand-soft);color:var(--vp-c-brand-1)}
.pcc-controls{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
@media(max-width:560px){.pcc-controls{grid-template-columns:1fr}}
.ctrl-group{display:flex;flex-direction:column;gap:5px}
.ctrl-label{font-size:12px;color:var(--vp-c-text-2);font-weight:500;display:flex;justify-content:space-between}
.cv{font-family:var(--vp-font-family-mono);color:var(--vp-c-brand-1);font-weight:700}
.pcc-slider{width:100%;height:4px;cursor:pointer;accent-color:var(--vp-c-brand-1)}
.ctrl-hints{display:flex;justify-content:space-between;font-size:10px;color:var(--vp-c-text-3)}
.nbtn-row{display:flex;gap:6px}
.nbtn{padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;border:1.5px solid var(--vp-c-divider);background:var(--vp-c-bg);color:var(--vp-c-text-2);transition:all .15s}
.nbtn:hover{border-color:var(--vp-c-brand-1);color:var(--vp-c-brand-1)}
.nbtn.active{background:var(--vp-c-brand-1);border-color:var(--vp-c-brand-1);color:#fff}
.chart-wrap{background:var(--vp-c-bg);border:1px solid var(--vp-c-divider);border-radius:8px;padding:8px;margin-bottom:12px}
.pcc-svg{width:100%;height:auto;display:block}
.backoff-section{margin-bottom:10px}
.bo-title{font-size:12px;font-weight:500;color:var(--vp-c-text-2);margin-bottom:8px}
.bo-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
@media(max-width:480px){.bo-cards{grid-template-columns:1fr}}
.bo-card{background:var(--vp-c-bg);border:2px solid;border-radius:8px;padding:10px 12px}
.bo-name{font-size:12px;font-weight:700;margin-bottom:4px}
.bo-papr{font-family:var(--vp-font-family-mono);font-size:13px;margin-bottom:4px}
.bo-save,.bo-coverage,.bo-base{font-size:11.5px;color:var(--vp-c-text-2);line-height:1.6}
.pcc-hint{font-size:11.5px;color:var(--vp-c-text-3);text-align:center}
</style>
