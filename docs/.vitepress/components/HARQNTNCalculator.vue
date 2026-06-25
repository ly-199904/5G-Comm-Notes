<template>
  <div class="hnc-wrap">
    <div class="hnc-header">
      <span class="hnc-title">NTN HARQ 参数计算器</span>
      <span class="hnc-spec">3GPP TR 38.821 §6.3 · Rel-17</span>
    </div>

    <div class="hnc-inputs">
      <div class="inp-group">
        <div class="inp-label">轨道高度 h <span class="iv">{{ altitude }} km</span></div>
        <input type="range" min="300" max="36000" step="50"
               v-model.number="altitude" class="hnc-slider"/>
        <div class="ctrl-hints"><span>300km（极低轨）</span><span>36000km（GEO）</span></div>
      </div>
      <div class="inp-group">
        <div class="inp-label">仰角 θ <span class="iv">{{ elevation }}°</span></div>
        <input type="range" min="10" max="90" step="1"
               v-model.number="elevation" class="hnc-slider"/>
        <div class="ctrl-hints"><span>10°（边缘）</span><span>90°（正上方）</span></div>
      </div>
      <div class="inp-group">
        <div class="inp-label">Numerology μ</div>
        <div class="mu-btns">
          <button v-for="m in [0,1,2]" :key="m"
                  :class="['mbtn',{active:mu===m}]" @click="mu=m">
            μ={{ m }}（{{ (2**m)*15 }}kHz）
          </button>
        </div>
      </div>
      <div class="inp-group">
        <div class="inp-label">K1 基础值 <span class="iv">{{ k1Base }} slots</span></div>
        <input type="range" min="1" max="8" step="1"
               v-model.number="k1Base" class="hnc-slider"/>
        <div class="ctrl-hints"><span>1</span><span>8（DCI最大）</span></div>
      </div>
    </div>

    <!-- 结果卡片 -->
    <div class="result-grid">
      <div class="res-card" v-for="r in resultCards" :key="r.label">
        <div class="rc-label">{{ r.label }}</div>
        <div class="rc-val" :style="{ color: r.color }">{{ r.value }}</div>
        <div class="rc-unit">{{ r.unit }}</div>
      </div>
    </div>

    <!-- 策略推荐横幅 -->
    <div class="strategy-banner" :class="strategyClass">
      <div class="sb-icon">{{ strategyIcon }}</div>
      <div class="sb-body">
        <div class="sb-title">{{ strategyTitle }}</div>
        <div class="sb-desc">{{ strategyDesc }}</div>
      </div>
    </div>

    <!-- 流水线示意图 -->
    <div class="pipeline-section">
      <div class="pl-title">HARQ 进程流水线（前 {{ showSlots }} 个 slot）</div>
      <div class="pl-strip">
        <div v-for="s in showSlots" :key="s-1"
             :class="['pl-cell', pipelineClass(s-1)]"
             :title="pipelineTitle(s-1)">
          <span v-if="pipelineProc(s-1) !== null" class="pl-proc">
            P{{ pipelineProc(s-1) }}
          </span>
        </div>
      </div>
      <div class="pl-legend">
        <span class="pl-leg"><span class="pld active"></span>已调度（有数据）</span>
        <span class="pl-leg"><span class="pld hole"></span>空洞（等待 ACK）</span>
      </div>
      <div class="pl-util">
        实际利用率：<b :style="{ color: util >= 1 ? '#3fb950' : '#ff7b72' }">
          {{ (util * 100).toFixed(0) }}%
        </b>
        （{{ actualProcs }} 个进程 / 需 {{ minProcs }} 个进程）
      </div>
    </div>

    <div class="hnc-hint">拖动滑块实时查看不同场景下的 HARQ 参数与策略推荐</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const altitude  = ref(550)
const elevation = ref(45)
const mu        = ref(1)
const k1Base    = ref(4)

const RE_KM = 6371

const tau = computed(() => {
  const r    = RE_KM + altitude.value
  const cosE = Math.cos(elevation.value * Math.PI / 180)
  const sinE = Math.sin(elevation.value * Math.PI / 180)
  const d    = Math.sqrt(r * r - (RE_KM * cosE) ** 2) - RE_KM * sinE
  return d / 300
})

const rtt      = computed(() => 2 * tau.value + 2)
const slotMs   = computed(() => 1 / (2 ** mu.value))
const kOffset  = computed(() => Math.ceil(rtt.value / slotMs.value))
const k1Eff    = computed(() => k1Base.value + kOffset.value)
const minProcs = computed(() => k1Eff.value + 1)
const actualProcs = computed(() => Math.min(minProcs.value, 16))
const util     = computed(() => actualProcs.value / minProcs.value)
const throughputLoss = computed(() => Math.max(0, (1 - util.value) * 100))

const resultCards = computed(() => [
  { label: '单程时延 τ',      value: tau.value.toFixed(2),            unit: 'ms',    color: 'var(--vp-c-text-1)' },
  { label: 'RTT（含处理）',   value: rtt.value.toFixed(2),            unit: 'ms',    color: 'var(--vp-c-text-1)' },
  { label: 'Slot 时长',       value: slotMs.value.toFixed(2),         unit: 'ms',    color: 'var(--vp-c-text-2)' },
  { label: 'K_offset',        value: kOffset.value,                   unit: 'slots', color: '#ffa657' },
  { label: 'K1_eff',          value: k1Eff.value,                     unit: 'slots', color: '#ffa657' },
  { label: '所需进程数',       value: minProcs.value,                  unit: '个',    color: minProcs.value > 16 ? '#ff7b72' : '#3fb950' },
  { label: '实际进程数',       value: actualProcs.value,               unit: '个（上限16）', color: 'var(--vp-c-text-1)' },
  { label: '吞吐量损失',       value: throughputLoss.value.toFixed(1), unit: '%',     color: throughputLoss.value > 20 ? '#ff7b72' : '#3fb950' },
])

const strategyClass = computed(() => {
  if (minProcs.value <= 16) return 'strat-a'
  if (throughputLoss.value < 50) return 'strat-b'
  return 'strat-c'
})
const strategyIcon = computed(() => {
  if (minProcs.value <= 16) return '✅'
  if (throughputLoss.value < 50) return '⚠️'
  return '❌'
})
const strategyTitle = computed(() => {
  if (minProcs.value <= 16) return '策略 A：启用 HARQ + K-offset'
  if (throughputLoss.value < 50) return '策略 B：HARQ 进程不足，考虑禁用'
  return '策略 C：禁用 HARQ，改用 RLC ARQ'
})
const strategyDesc = computed(() => {
  if (minProcs.value <= 16)
    return `16 个进程足够覆盖 K1_eff=${k1Eff.value}，配置 k-Offset-r17=${kOffset.value} 即可正常使用 HARQ。`
  if (throughputLoss.value < 50)
    return `需要 ${minProcs.value} 个进程，协议上限 16，吞吐量损失 ${throughputLoss.value.toFixed(0)}%。建议权衡业务类型决定是否禁用。`
  return `需要 ${minProcs.value} 个进程远超上限，吞吐量损失 ${throughputLoss.value.toFixed(0)}%。建议禁用 HARQ，依靠 RLC AM 模式提供可靠性。`
})

// 流水线示意
const showSlots = computed(() => Math.min(k1Eff.value + actualProcs.value + 4, 40))

function pipelineProc(slot: number): number | null {
  const p = slot % minProcs.value
  return p < actualProcs.value ? p : null
}
function pipelineClass(slot: number): string {
  return pipelineProc(slot) !== null ? `active p${pipelineProc(slot)! % 6}` : 'hole'
}
function pipelineTitle(slot: number): string {
  const p = pipelineProc(slot)
  return p !== null ? `Slot ${slot}: Proc#${p}` : `Slot ${slot}: 空洞（进程不足）`
}
</script>

<style scoped>
.hnc-wrap{border:1px solid var(--vp-c-divider);border-radius:12px;padding:20px;margin:20px 0;background:var(--vp-c-bg-soft);font-size:13px}
.hnc-header{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.hnc-title{font-size:15px;font-weight:600;color:var(--vp-c-text-1)}
.hnc-spec{font-size:11px;padding:2px 8px;border-radius:20px;background:var(--vp-c-brand-soft);color:var(--vp-c-brand-1)}
.hnc-inputs{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
@media(max-width:560px){.hnc-inputs{grid-template-columns:1fr}}
.inp-group{display:flex;flex-direction:column;gap:5px}
.inp-label{font-size:12px;color:var(--vp-c-text-2);font-weight:500;display:flex;justify-content:space-between}
.iv{font-family:var(--vp-font-family-mono);font-weight:700;color:var(--vp-c-brand-1)}
.hnc-slider{width:100%;height:4px;cursor:pointer;accent-color:var(--vp-c-brand-1)}
.ctrl-hints{display:flex;justify-content:space-between;font-size:10px;color:var(--vp-c-text-3)}
.mu-btns{display:flex;gap:6px;flex-wrap:wrap}
.mbtn{padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;border:1.5px solid var(--vp-c-divider);background:var(--vp-c-bg);color:var(--vp-c-text-2);transition:all .15s}
.mbtn:hover{border-color:var(--vp-c-brand-1);color:var(--vp-c-brand-1)}
.mbtn.active{background:var(--vp-c-brand-1);border-color:var(--vp-c-brand-1);color:#fff}
.result-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:12px}
.res-card{background:var(--vp-c-bg);border:1px solid var(--vp-c-divider);border-radius:8px;padding:8px 10px}
.rc-label{font-size:10.5px;color:var(--vp-c-text-3);margin-bottom:3px}
.rc-val{font-size:20px;font-weight:700;font-family:var(--vp-font-family-mono);line-height:1.2}
.rc-unit{font-size:10px;color:var(--vp-c-text-3)}
.strategy-banner{display:flex;gap:12px;align-items:flex-start;border-radius:8px;padding:12px 14px;margin-bottom:12px;border:1px solid}
.strat-a{background:#e6f4ea;border-color:#a8d5b0;color:#1a5c2a}
.strat-b{background:#fff8ee;border-color:#fcd34d;color:#92400e}
.strat-c{background:#fdecea;border-color:#f5b7b1;color:#7b1d1d}
.sb-icon{font-size:20px;flex-shrink:0}
.sb-title{font-size:14px;font-weight:700;margin-bottom:4px}
.sb-desc{font-size:12.5px;line-height:1.6}
.pipeline-section{background:var(--vp-c-bg);border:1px solid var(--vp-c-divider);border-radius:8px;padding:12px;margin-bottom:10px}
.pl-title{font-size:12px;font-weight:500;color:var(--vp-c-text-2);margin-bottom:8px}
.pl-strip{display:flex;gap:2px;flex-wrap:wrap;margin-bottom:6px}
.pl-cell{width:24px;height:24px;border-radius:3px;display:flex;align-items:center;justify-content:center}
.pl-cell.hole{background:#21262d}
.pl-cell.active{background:rgba(88,166,255,.65)}
.pl-cell.p1{background:rgba(63,185,80,.65)}.pl-cell.p2{background:rgba(255,166,87,.65)}
.pl-cell.p3{background:rgba(210,168,255,.65)}.pl-cell.p4{background:rgba(255,123,114,.65)}
.pl-cell.p5{background:rgba(121,192,255,.55)}
.pl-proc{font-size:7.5px;color:rgba(255,255,255,.9);font-family:var(--vp-font-family-mono)}
.pl-legend{display:flex;gap:14px;margin-bottom:6px}
.pl-leg{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--vp-c-text-3)}
.pld{width:12px;height:12px;border-radius:2px}
.pld.active{background:rgba(88,166,255,.65)}.pld.hole{background:#21262d}
.pl-util{font-size:12.5px;color:var(--vp-c-text-2)}
.hnc-hint{font-size:11.5px;color:var(--vp-c-text-3);text-align:center}
</style>
