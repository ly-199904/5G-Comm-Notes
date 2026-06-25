<template>
  <div class="sca-root">
    <div class="sca-header">
      <span class="sca-title">MIMO 信道 SVD 分析器</span>
      <span class="sca-sub">38.214 §5.2.2 · H = UΣV^H · 注水功率分配</span>
    </div>

    <!-- 控制 -->
    <div class="sca-controls">
      <div class="ctrl-group">
        <label>发射天线 N_t</label>
        <div class="btn-group">
          <button v-for="n in [2,4,8]" :key="n"
            :class="['ctrl-btn', {active: Nt===n}]" @click="Nt=n">{{ n }}</button>
        </div>
      </div>
      <div class="ctrl-group">
        <label>接收天线 N_r</label>
        <div class="btn-group">
          <button v-for="n in [2,4,8]" :key="n"
            :class="['ctrl-btn', {active: Nr===n}]" @click="Nr=n">{{ n }}</button>
        </div>
      </div>
      <div class="ctrl-group">
        <label>莱斯因子 K (dB)</label>
        <input type="range" v-model.number="kFactorDb" min="-20" max="20" step="1"/>
        <span class="ctrl-val">{{ kFactorDb }} dB</span>
      </div>
      <div class="ctrl-group">
        <label>SNR</label>
        <input type="range" v-model.number="snrDb" min="0" max="30" step="1"/>
        <span class="ctrl-val">{{ snrDb }} dB</span>
      </div>
      <div class="ctrl-group">
        <label>功率分配</label>
        <div class="btn-group">
          <button :class="['ctrl-btn', {active: wf}]" @click="wf=true">注水</button>
          <button :class="['ctrl-btn', {active: !wf}]" @click="wf=false">等功率</button>
        </div>
      </div>
      <button class="btn-resample" @click="resample">🎲 重新采样</button>
    </div>

    <!-- 主内容 -->
    <div class="sca-main">
      <!-- 奇异值柱图 -->
      <div class="chart-panel">
        <div class="panel-title">奇异值分布（σ_k）</div>
        <svg viewBox="0 0 280 160" class="bar-svg">
          <g v-for="(sv, i) in singularValues" :key="i">
            <rect :x="30 + i*barStep" :y="150 - sv/maxSV*120"
                  :width="barW" :height="sv/maxSV*120"
                  :fill="svColor(i)" rx="2" opacity="0.85"/>
            <text :x="30 + i*barStep + barW/2" :y="158"
                  text-anchor="middle" font-size="9" fill="var(--vp-c-text-2)">
              σ{{ i+1 }}
            </text>
            <text :x="30 + i*barStep + barW/2" :y="150 - sv/maxSV*120 - 3"
                  text-anchor="middle" font-size="8" fill="var(--vp-c-text-1)">
              {{ sv.toFixed(2) }}
            </text>
          </g>
          <!-- 有效秩阈值线 -->
          <line :x1="28" :y1="150 - thresholdY" :x2="270" :y2="150 - thresholdY"
                stroke="#f85149" stroke-width="1" stroke-dasharray="4 3"/>
          <text x="271" :y="150 - thresholdY + 4" font-size="8" fill="#f85149">阈值</text>
          <!-- Y轴标注 -->
          <text x="4" y="30" font-size="8" fill="var(--vp-c-text-3)">σ_max</text>
          <text x="10" y="155" font-size="8" fill="var(--vp-c-text-3)">0</text>
        </svg>
        <div class="rank-badge">
          有效秩 = <span :style="{color: rankColor}">{{ effectiveRank }}</span>
          / {{ Math.min(Nt, Nr) }}
        </div>
      </div>

      <!-- 注水功率分配柱图 -->
      <div class="chart-panel">
        <div class="panel-title">{{ wf ? '注水' : '等功率' }}分配（P_k / P_total）</div>
        <svg viewBox="0 0 280 160" class="bar-svg">
          <g v-for="(p, i) in powerAlloc" :key="i">
            <rect :x="30 + i*barStep" :y="150 - p/maxPower*120"
                  :width="barW" :height="p/maxPower*120"
                  :fill="svColor(i)" rx="2" opacity="0.85"/>
            <text :x="30 + i*barStep + barW/2" :y="158"
                  text-anchor="middle" font-size="9" fill="var(--vp-c-text-2)">
              层 {{ i+1 }}
            </text>
            <text :x="30 + i*barStep + barW/2" :y="150 - p/maxPower*120 - 3"
                  text-anchor="middle" font-size="8" fill="var(--vp-c-text-1)">
              {{ (p*100).toFixed(0) }}%
            </text>
          </g>
          <!-- 等功率基线 -->
          <line v-if="wf" :x1="28" :y1="150 - equalP/maxPower*120"
                :x2="270" :y2="150 - equalP/maxPower*120"
                stroke="var(--vp-c-text-3)" stroke-width="1" stroke-dasharray="3 3"/>
        </svg>
        <div class="rank-badge">
          理论容量 ≈ <span style="color:#3fb950">{{ capacity.toFixed(2) }} bit/s/Hz</span>
        </div>
      </div>

      <!-- 信道状态卡片 -->
      <div class="state-panel">
        <div class="panel-title">信道状态</div>

        <div class="state-item">
          <div class="state-label">莱斯因子 K</div>
          <div class="state-val" :style="{color: kFactorDb >= 0 ? '#d29922' : '#58a6ff'}">
            {{ kFactorDb >= 0 ? kFactorDb + ' dB (LOS)' : kFactorDb + ' dB (NLOS)' }}
          </div>
          <div class="state-bar-wrap">
            <div class="state-bar"
                 :style="{width: ((kFactorDb+20)/40*100)+'%',
                          background: kFactorDb >= 0 ? '#d29922' : '#58a6ff'}"/>
          </div>
        </div>

        <div class="state-item">
          <div class="state-label">信道矩阵条件数 κ = σ_max/σ_min</div>
          <div class="state-val" :style="{color: condNum > 10 ? '#f85149' : '#3fb950'}">
            {{ condNum.toFixed(1) }}
            {{ condNum > 10 ? '（病态，空间复用受限）' : '（良好）' }}
          </div>
        </div>

        <div class="state-item">
          <div class="state-label">NTN / LOS 场景说明</div>
          <div class="state-note" v-if="kFactorDb >= 6">
            K = {{ kFactorDb }} dB（强 LOS），信道矩阵趋近秩 1，有效秩 = {{ effectiveRank }}。
            多层空间复用增益有限，此时波束赋形（RI=1）比空间复用更有效。
          </div>
          <div class="state-note" v-else-if="kFactorDb <= -10">
            K = {{ kFactorDb }} dB（纯 Rayleigh），信道矩阵近似满秩（有效秩 = {{ effectiveRank }}），
            空间复用充分发挥。城市密集散射场景。
          </div>
          <div class="state-note" v-else>
            K = {{ kFactorDb }} dB（莱斯信道），LOS 分量和散射分量共存，
            有效秩 = {{ effectiveRank }}。
          </div>
        </div>

        <div class="state-item">
          <div class="state-label">注水 vs 等功率增益</div>
          <div class="state-val">
            注水 {{ capacityWF.toFixed(2) }} vs 等功率 {{ capacityEP.toFixed(2) }} bit/s/Hz
            （<span style="color:#3fb950">+{{ (capacityWF-capacityEP).toFixed(2) }}</span>）
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const Nt = ref(4)
const Nr = ref(4)
const kFactorDb = ref(-10)
const snrDb = ref(15)
const wf = ref(true)
const seed = ref(42)

function resample() { seed.value = Math.floor(Math.random() * 10000) }

// 简单 LCG 随机数
function lcg(s: number) {
  let state = s
  return () => { state = (state * 1664525 + 1013904223) & 0xffffffff; return (state >>> 0) / 0x100000000 }
}

function randn(rng: () => number) {
  const u1 = rng(), u2 = rng()
  return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
}

// 生成莱斯信道矩阵的奇异值（简化：只算奇异值的模拟近似）
const singularValues = computed(() => {
  const rng = lcg(seed.value + Nt.value * 100 + Nr.value * 10 + Math.round(kFactorDb.value * 10))
  const K = Math.pow(10, kFactorDb.value / 10)
  const minDim = Math.min(Nt.value, Nr.value)
  const svs: number[] = []

  for (let k = 0; k < minDim; k++) {
    const rI = randn(rng), rQ = randn(rng)
    const scatter = Math.sqrt(rI * rI + rQ * rQ) / Math.sqrt(2)

    // 第一个奇异值受 LOS 分量影响更大
    const losBoost = k === 0 ? Math.sqrt(K / (K + 1)) * Math.sqrt(Nt.value * Nr.value) : 0
    const scatterPart = Math.sqrt(1 / (K + 1)) * scatter * Math.sqrt(minDim)
    svs.push(losBoost + scatterPart + 0.1)
  }
  // 排序（降序）
  return svs.sort((a, b) => b - a)
})

const maxSV = computed(() => Math.max(...singularValues.value))

// 有效秩（阈值：最大奇异值的 1/10）
const thresholdRatio = 0.1
const thresholdY = computed(() => thresholdRatio * 120)
const effectiveRank = computed(() =>
  singularValues.value.filter(s => s / maxSV.value > thresholdRatio).length)
const rankColor = computed(() => effectiveRank.value === 1 ? '#f85149' : '#3fb950')

// 条件数
const condNum = computed(() => {
  const svs = singularValues.value
  return svs[0] / (svs[svs.length - 1] + 1e-9)
})

// 注水功率分配
function waterFilling(lambdas: number[], snrLin: number): number[] {
  const n = lambdas.length
  let mu = snrLin / n + 1 / (lambdas[0] + 1e-9)
  const alloc = new Array(n).fill(0)
  for (let iter = 0; iter < 50; iter++) {
    let total = 0
    for (let i = 0; i < n; i++) {
      alloc[i] = Math.max(0, mu - 1 / (lambdas[i] + 1e-9))
      total += alloc[i]
    }
    if (total < 1e-9) { mu *= 2; continue }
    const scale = snrLin / total
    for (let i = 0; i < n; i++) alloc[i] *= scale
    const newMu = mu * scale
    if (Math.abs(newMu - mu) < 1e-6) break
    mu = newMu
  }
  return alloc
}

const snrLin = computed(() => Math.pow(10, snrDb.value / 10))

const lambdas = computed(() => singularValues.value.map(s => s * s))

const wfAlloc = computed(() => waterFilling(lambdas.value, snrLin.value))
const epAlloc = computed(() => {
  const p = snrLin.value / lambdas.value.length
  return lambdas.value.map(() => p)
})

const powerAlloc = computed(() => {
  const alloc = wf.value ? wfAlloc.value : epAlloc.value
  const total = alloc.reduce((a, b) => a + b, 0)
  return alloc.map(p => p / (total + 1e-9))
})

const equalP = computed(() => 1 / lambdas.value.length)
const maxPower = computed(() => Math.max(...powerAlloc.value, equalP.value) * 1.1)

function calcCapacity(alloc: number[]): number {
  return alloc.reduce((c, p, i) => c + Math.log2(1 + p * lambdas.value[i]), 0)
}
const capacityWF = computed(() => calcCapacity(wfAlloc.value))
const capacityEP = computed(() => calcCapacity(epAlloc.value))
const capacity = computed(() => wf.value ? capacityWF.value : capacityEP.value)

// 柱图参数
const barStep = computed(() => Math.min(40, 240 / Math.max(singularValues.value.length, 1)))
const barW = computed(() => barStep.value * 0.65)

const colors = ['#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#39d353','#ff9f43','#a29bfe']
function svColor(i: number) { return colors[i % colors.length] }
</script>

<style scoped>
.sca-root {
  font-family: var(--vp-font-family-mono, monospace);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px; padding: 16px; margin: 24px 0;
  color: var(--vp-c-text-1);
}
.sca-header { margin-bottom: 12px; }
.sca-title { font-size: 15px; font-weight: 700; color: var(--vp-c-brand); display: block; }
.sca-sub { font-size: 11px; color: var(--vp-c-text-2); }

.sca-controls {
  display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;
  padding: 10px 12px; background: var(--vp-c-bg);
  border-radius: 6px; border: 1px solid var(--vp-c-divider);
  align-items: center;
}
.ctrl-group { display: flex; align-items: center; gap: 7px; }
.ctrl-group label { font-size: 11px; color: var(--vp-c-text-2); white-space: nowrap; }
.ctrl-group input[type=range] { width: 80px; accent-color: var(--vp-c-brand); }
.ctrl-val { font-size: 12px; color: var(--vp-c-brand); min-width: 44px; }
.btn-group { display: flex; gap: 3px; }
.ctrl-btn {
  padding: 3px 8px; font-size: 11px; border-radius: 4px;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2); cursor: pointer; transition: all 0.15s;
}
.ctrl-btn.active { background: var(--vp-c-brand); border-color: var(--vp-c-brand); color: #fff; }
.btn-resample {
  padding: 4px 10px; font-size: 11px; border-radius: 5px;
  border: 1px solid var(--vp-c-brand); color: var(--vp-c-brand);
  background: transparent; cursor: pointer;
}
.btn-resample:hover { background: var(--vp-c-brand-soft); }

.sca-main { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; align-items: start; }

.chart-panel, .state-panel {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 10px;
}
.panel-title {
  font-size: 10px; font-weight: 700; color: var(--vp-c-text-2);
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;
}
.bar-svg { width: 100%; height: auto; }
.rank-badge { font-size: 11px; text-align: center; margin-top: 4px; color: var(--vp-c-text-2); }

.state-item { margin-bottom: 10px; }
.state-label { font-size: 10px; color: var(--vp-c-text-2); margin-bottom: 3px; }
.state-val { font-size: 11px; font-weight: 600; margin-bottom: 3px; }
.state-bar-wrap { height: 4px; background: var(--vp-c-divider); border-radius: 2px; overflow: hidden; }
.state-bar { height: 100%; border-radius: 2px; transition: all 0.3s; }
.state-note { font-size: 10px; color: var(--vp-c-text-2); line-height: 1.6; }

@media (max-width: 700px) {
  .sca-main { grid-template-columns: 1fr; }
  .sca-controls { flex-direction: column; }
}
</style>
