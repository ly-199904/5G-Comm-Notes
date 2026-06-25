<template>
  <div class="ome-wrap">
    <div class="ome-header">
      <span class="ome-title">OFDM 调制过程：频域 → IFFT → 时域</span>
      <span class="ome-spec">3GPP TS 38.211 §5.3.1</span>
    </div>

    <div class="ome-controls">
      <div class="ctrl-group">
        <div class="ctrl-label">子载波数 N <span class="cv">{{ N }}</span></div>
        <div class="nbtn-row">
          <button v-for="n in [8,16,32,64]" :key="n"
                  :class="['nbtn',{active:N===n}]" @click="N=n">{{ n }}</button>
        </div>
      </div>
      <div class="ctrl-group">
        <div class="ctrl-label">调制方案</div>
        <div class="nbtn-row">
          <button v-for="m in mods" :key="m.key"
                  :class="['nbtn',{active:mod===m.key}]" @click="mod=m.key">{{ m.label }}</button>
        </div>
      </div>
      <div class="ctrl-group">
        <div class="ctrl-label">CP 长度 N_cp <span class="cv">{{ Ncp }}（{{ cpPct }}%）</span></div>
        <input type="range" min="0" max="25" step="1"
               v-model.number="cpPctVal" class="ome-slider"/>
        <div class="ctrl-hints"><span>0（无 CP）</span><span>25%</span></div>
      </div>
      <div class="ctrl-group">
        <div class="ctrl-label">动画速度</div>
        <div class="nbtn-row">
          <button v-for="sp in [1,2,4]" :key="sp"
                  :class="['nbtn',{active:speed===sp}]" @click="speed=sp">{{ sp }}×</button>
        </div>
      </div>
    </div>

    <!-- 三步流水图 -->
    <div class="pipeline">
      <div class="pipe-step" :class="{ active: step >= 1 }">
        <div class="ps-title">① 频域符号（输入）</div>
        <div class="ps-desc">N={{ N }} 个子载波，每个承载一个 {{ mod.toUpperCase() }} 符号</div>
        <div class="constellation-mini">
          <svg :viewBox="`-1.5 -1.5 3 3`" class="con-svg">
            <line x1="-1.4" y1="0" x2="1.4" y2="0" stroke="var(--vp-c-divider)" stroke-width="0.05"/>
            <line x1="0" y1="-1.4" x2="0" y2="1.4" stroke="var(--vp-c-divider)" stroke-width="0.05"/>
            <circle v-for="(pt, i) in freqSymbols" :key="i"
                    :cx="pt.re" :cy="-pt.im" r="0.12"
                    :fill="subcarrierColor(i)" opacity="0.9"/>
          </svg>
        </div>
        <div class="ps-eq">a[k], k=0,1,...,N-1</div>
      </div>

      <div class="pipe-arrow" :class="{ active: step >= 2 }">
        <div class="arrow-label">N 点 IFFT</div>
        <div class="arrow-body">→</div>
        <div class="arrow-eq">s[n] = Σ a[k]·e^(j2πkn/N)</div>
      </div>

      <div class="pipe-step" :class="{ active: step >= 2 }">
        <div class="ps-title">② 时域符号（IFFT 输出）</div>
        <div class="ps-desc">N 个复数采样点，各子载波叠加</div>
        <div class="waveform-mini">
          <svg :viewBox="`0 -1.5 ${N+Ncp} 3`" class="wave-svg" preserveAspectRatio="none">
            <polyline :points="timeDomainPoints"
                      fill="none" stroke="#58a6ff" stroke-width="0.08"/>
          </svg>
        </div>
        <div class="ps-eq">s[n], n=0,1,...,N-1</div>
      </div>

      <div class="pipe-arrow" :class="{ active: step >= 3 }">
        <div class="arrow-label">加 CP</div>
        <div class="arrow-body">→</div>
        <div class="arrow-eq">复制末尾 N_cp 个采样前置</div>
      </div>

      <div class="pipe-step" :class="{ active: step >= 3 }">
        <div class="ps-title">③ 含 CP 的发射符号</div>
        <div class="ps-desc">长度 N+N_cp，CP 保证循环卷积</div>
        <div class="waveform-mini">
          <svg :viewBox="`0 -1.5 ${N+Ncp+2} 3`" class="wave-svg" preserveAspectRatio="none">
            <!-- CP 区域高亮 -->
            <rect x="0" y="-1.5" :width="Ncp" height="3"
                  fill="rgba(255,123,114,0.15)"/>
            <!-- CP 波形（红色） -->
            <polyline :points="cpPoints"
                      fill="none" stroke="#ff7b72" stroke-width="0.1"/>
            <!-- 主符号波形 -->
            <polyline :points="withCpPoints"
                      fill="none" stroke="#58a6ff" stroke-width="0.08"/>
            <!-- CP 标注 -->
            <text x="1" y="-1.1" font-size="0.4" fill="#ff7b72">CP</text>
          </svg>
        </div>
        <div class="ps-eq">
          [s[N-N_cp], ..., s[N-1], s[0], s[1], ..., s[N-1]]
          &nbsp;长度 = {{ N + Ncp }}
        </div>
      </div>
    </div>

    <!-- 执行按钮 -->
    <div class="ome-btns">
      <button class="ome-btn" @click="prevStep" :disabled="step <= 0">◀ 上一步</button>
      <button class="ome-btn primary" @click="nextStep" :disabled="step >= 3">
        {{ step === 0 ? '▶ 生成频域符号' : step === 1 ? '▶ 执行 IFFT' : step === 2 ? '▶ 添加 CP' : '✅ 完成' }}
      </button>
      <button class="ome-btn" @click="regenerate">🔀 重新生成</button>
    </div>

    <!-- 参数说明栏 -->
    <div class="param-bar">
      <div class="pb-item">
        <span class="pb-k">采样率 f_s</span>
        <span class="pb-v">= N × Δf = {{ N }} × 15kHz = {{ N * 15 }} kHz</span>
      </div>
      <div class="pb-item">
        <span class="pb-k">符号时长 T_sym</span>
        <span class="pb-v">= 1/Δf = {{ (1000/15).toFixed(1) }} μs（Δf=15kHz）</span>
      </div>
      <div class="pb-item">
        <span class="pb-k">CP 时长 T_cp</span>
        <span class="pb-v">= N_cp/f_s = {{ Ncp }}/{{ N*15 }}kHz = {{ (Ncp/(N*15)*1000).toFixed(2) }} μs</span>
      </div>
      <div class="pb-item">
        <span class="pb-k">开销比</span>
        <span class="pb-v">= N_cp/(N+N_cp) = {{ cpPct }}%</span>
      </div>
    </div>

    <div class="ome-hint">三步演示 OFDM 调制的完整过程：输入→IFFT→加CP</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const N        = ref(16)
const mod      = ref('qpsk')
const cpPctVal = ref(7)
const speed    = ref(1)
const step     = ref(0)

const mods = [
  { key: 'qpsk', label: 'QPSK' },
  { key: '16qam', label: '16QAM' },
  { key: '64qam', label: '64QAM' },
]

const cpPct = computed(() => cpPctVal.value)
const Ncp   = computed(() => Math.round(N.value * cpPctVal.value / 100))

// 生成频域符号（QPSK/16QAM/64QAM）
const freqSymbols = ref<{re:number,im:number}[]>([])

function makeConstellation(m: string): {re:number,im:number}[] {
  const pts: {re:number,im:number}[] = []
  if (m === 'qpsk') {
    const c = 1/Math.sqrt(2)
    return [{re:c,im:c},{re:-c,im:c},{re:c,im:-c},{re:-c,im:-c}]
  }
  if (m === '16qam') {
    const l = [-3,-1,1,3].map(x => x/Math.sqrt(10))
    for (const re of l) for (const im of l) pts.push({re,im})
    return pts
  }
  // 64QAM
  const l = [-7,-5,-3,-1,1,3,5,7].map(x => x/Math.sqrt(42))
  for (const re of l) for (const im of l) pts.push({re,im})
  return pts
}

function randomSymbol(m: string): {re:number,im:number} {
  const c = makeConstellation(m)
  return c[Math.floor(Math.random() * c.length)]
}

function regenerate() {
  step.value = 0
  freqSymbols.value = Array.from({length: N.value}, () => randomSymbol(mod.value))
}

regenerate()
watch([N, mod], regenerate)

function subcarrierColor(i: number): string {
  const colors = ['#58a6ff','#3fb950','#ffa657','#d2a8ff','#ff7b72','#79c0ff']
  return colors[i % colors.length]
}

// IFFT（DFT）计算
const timeDomain = computed(() => {
  const syms = freqSymbols.value
  if (!syms.length) return []
  const n = syms.length
  const out: {re:number,im:number}[] = []
  for (let t = 0; t < n; t++) {
    let re = 0, im = 0
    for (let k = 0; k < n; k++) {
      const ang = 2 * Math.PI * k * t / n
      re += syms[k].re * Math.cos(ang) - syms[k].im * Math.sin(ang)
      im += syms[k].re * Math.sin(ang) + syms[k].im * Math.cos(ang)
    }
    out.push({ re: re/n, im: im/n })
  }
  return out
})

const maxAmp = computed(() => {
  const t = timeDomain.value
  if (!t.length) return 1
  return Math.max(...t.map(s => Math.abs(s.re)), 0.01)
})

const timeDomainPoints = computed(() => {
  if (step.value < 2) return ''
  return timeDomain.value.map((s, i) =>
    `${i},${-(s.re / maxAmp.value * 1.2).toFixed(3)}`
  ).join(' ')
})

const withCpPoints = computed(() => {
  if (step.value < 3) return ''
  return timeDomain.value.map((s, i) =>
    `${i + Ncp.value},${-(s.re / maxAmp.value * 1.2).toFixed(3)}`
  ).join(' ')
})

const cpPoints = computed(() => {
  if (step.value < 3) return ''
  const td = timeDomain.value
  const ncp = Ncp.value
  return td.slice(td.length - ncp).map((s, i) =>
    `${i},${-(s.re / maxAmp.value * 1.2).toFixed(3)}`
  ).join(' ')
})

function nextStep() { if (step.value < 3) step.value++ }
function prevStep() { if (step.value > 0) step.value-- }
</script>

<style scoped>
.ome-wrap{border:1px solid var(--vp-c-divider);border-radius:12px;padding:20px;margin:20px 0;background:var(--vp-c-bg-soft);font-size:13px}
.ome-header{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.ome-title{font-size:15px;font-weight:600;color:var(--vp-c-text-1)}
.ome-spec{font-size:11px;padding:2px 8px;border-radius:20px;background:var(--vp-c-brand-soft);color:var(--vp-c-brand-1)}
.ome-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:14px}
.ctrl-group{display:flex;flex-direction:column;gap:5px}
.ctrl-label{font-size:12px;color:var(--vp-c-text-2);font-weight:500;display:flex;justify-content:space-between}
.cv{font-family:var(--vp-font-family-mono);color:var(--vp-c-brand-1);font-weight:700}
.ome-slider{width:100%;height:4px;cursor:pointer;accent-color:var(--vp-c-brand-1)}
.ctrl-hints{display:flex;justify-content:space-between;font-size:10px;color:var(--vp-c-text-3)}
.nbtn-row{display:flex;gap:6px;flex-wrap:wrap}
.nbtn{padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;border:1.5px solid var(--vp-c-divider);background:var(--vp-c-bg);color:var(--vp-c-text-2);transition:all .15s}
.nbtn:hover{border-color:var(--vp-c-brand-1);color:var(--vp-c-brand-1)}
.nbtn.active{background:var(--vp-c-brand-1);border-color:var(--vp-c-brand-1);color:#fff}

/* 流水步骤 */
.pipeline{display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.pipe-step{flex:1;min-width:140px;background:var(--vp-c-bg);border:1.5px solid var(--vp-c-divider);border-radius:8px;padding:10px;opacity:.4;transition:opacity .4s,border-color .4s}
.pipe-step.active{opacity:1;border-color:var(--vp-c-brand-1)}
.ps-title{font-size:12px;font-weight:600;color:var(--vp-c-text-1);margin-bottom:3px}
.ps-desc{font-size:10.5px;color:var(--vp-c-text-3);margin-bottom:6px}
.ps-eq{font-family:var(--vp-font-family-mono);font-size:10px;color:var(--vp-c-text-2);margin-top:4px}

.pipe-arrow{display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;opacity:.4;transition:opacity .4s}
.pipe-arrow.active{opacity:1}
.arrow-label{font-size:10.5px;font-weight:600;color:var(--vp-c-brand-1)}
.arrow-body{font-size:22px;color:var(--vp-c-brand-1);line-height:1}
.arrow-eq{font-size:9px;color:var(--vp-c-text-3);text-align:center;max-width:80px;word-break:break-all}

.constellation-mini,.waveform-mini{height:80px;background:var(--vp-c-bg-elv);border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.con-svg,.wave-svg{width:100%;height:100%}

/* 按钮 */
.ome-btns{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.ome-btn{padding:7px 16px;border-radius:8px;font-size:13px;cursor:pointer;border:1.5px solid var(--vp-c-divider);background:var(--vp-c-bg);color:var(--vp-c-text-1);transition:all .15s}
.ome-btn:hover:not(:disabled){border-color:var(--vp-c-brand-1);color:var(--vp-c-brand-1)}
.ome-btn:disabled{opacity:.4;cursor:not-allowed}
.ome-btn.primary{background:var(--vp-c-brand-1);border-color:var(--vp-c-brand-1);color:#fff}
.ome-btn.primary:hover:not(:disabled){filter:brightness(1.1)}

/* 参数说明栏 */
.param-bar{background:var(--vp-c-bg);border:1px solid var(--vp-c-divider);border-radius:8px;padding:10px 14px;margin-bottom:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px}
.pb-item{display:flex;flex-direction:column;gap:1px}
.pb-k{font-size:10.5px;color:var(--vp-c-text-3)}
.pb-v{font-family:var(--vp-font-family-mono);font-size:11.5px;color:var(--vp-c-text-1)}

.ome-hint{font-size:11.5px;color:var(--vp-c-text-3);text-align:center}
</style>
