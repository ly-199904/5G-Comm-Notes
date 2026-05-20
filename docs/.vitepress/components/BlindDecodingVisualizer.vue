<template>
  <div class="bdv-wrap">
    <div class="bdv-header">
      <span class="bdv-title">PDCCH 盲检动画</span>
      <span class="bdv-spec">3GPP TS 38.213 §10.1</span>
    </div>

    <!-- 控制区 -->
    <div class="bdv-controls">
      <div class="ctrl-group">
        <div class="ctrl-label">C-RNTI <span class="ctrl-val">0x{{ rnti.toString(16).toUpperCase().padStart(4,'0') }}</span></div>
        <input type="range" min="1" max="65519" step="1"
               v-model.number="rnti" class="bdv-slider" @input="reset"/>
      </div>
      <div class="ctrl-group">
        <div class="ctrl-label">Slot 编号 <span class="ctrl-val">{{ slotIdx }}</span></div>
        <input type="range" min="0" max="19" step="1"
               v-model.number="slotIdx" class="bdv-slider" @input="reset"/>
      </div>
      <div class="ctrl-group">
        <div class="ctrl-label">CORESET CCE 总数 <span class="ctrl-val">{{ nCCE }}</span></div>
        <div class="preset-btns">
          <button v-for="n in [6,12,18,24]" :key="n"
                  :class="['pre-btn', { active: nCCE === n }]"
                  @click="nCCE = n; reset()">{{ n }}</button>
        </div>
      </div>
      <div class="ctrl-group">
        <div class="ctrl-label">目标 AL（gNB 实际发送）</div>
        <div class="preset-btns">
          <button v-for="al in [1,2,4,8]" :key="al"
                  :class="['pre-btn', { active: targetAL === al }]"
                  @click="targetAL = al; reset()">AL={{ al }}</button>
        </div>
      </div>
    </div>

    <!-- Y_p 推导展示 -->
    <div class="yp-box">
      <div class="yp-title">UE 专属哈希 Y_p（38.213 §10.1）</div>
      <div class="yp-formula">
        Y₋₁ = RNTI mod D = {{ rnti }} mod 65537 = <b>{{ rntiModD }}</b>
        &nbsp;→&nbsp;
        Y_p = (39827 × Y_{{ slotIdx > 0 ? slotIdx-1 : '₋₁' }}) mod 65537 = <b>{{ yp }}</b>
      </div>
      <div class="yp-note">
        Y_p 使每个 UE 的 CCE 起始位置不同，避免系统性冲突。
        同一 slot 内，不同 RNTI 的 Y_p 均匀分布在 [0, 65537) 范围内。
      </div>
    </div>

    <!-- CCE 网格 -->
    <div class="cce-section">
      <div class="cce-title">
        CCE 网格（共 {{ nCCE }} 个）
        <span class="cce-legend">
          <span class="leg-dot target"></span>gNB 发送位置
          <span class="leg-dot found"></span>盲检命中
          <span class="leg-dot tried"></span>已尝试
          <span class="leg-dot untried"></span>未尝试
        </span>
      </div>
      <div class="cce-grid">
        <div
          v-for="i in nCCE" :key="i-1"
          :class="['cce-cell', cceState(i-1)]"
          :title="`CCE#${i-1}：${cceStateLabel(i-1)}`"
        >
          <span class="cce-idx">{{ i-1 }}</span>
          <span v-if="cceState(i-1) === 'found'" class="cce-mark">✓</span>
          <span v-if="cceState(i-1) === 'target'" class="cce-mark">★</span>
        </div>
      </div>
    </div>

    <!-- 盲检步骤列表 -->
    <div class="steps-section">
      <div class="steps-title">盲检步骤（AL={{ currentAL }}，候选 #{{ currentCandIdx }}）</div>
      <div class="steps-list" ref="stepsList">
        <div
          v-for="(step, i) in visibleSteps"
          :key="i"
          :class="['step-row', step.result]"
        >
          <span class="step-num">#{{ i+1 }}</span>
          <span class="step-al">AL={{ step.al }}</span>
          <span class="step-cce">CCE#{{ step.cceStart }}~#{{ step.cceStart + step.al - 1 }}</span>
          <span class="step-result">{{ step.resultLabel }}</span>
        </div>
      </div>
    </div>

    <!-- 控制按钮 -->
    <div class="bdv-btns">
      <button class="bdv-btn primary" @click="stepForward" :disabled="finished">
        {{ finished ? '✅ 已完成' : '▶ 下一步' }}
      </button>
      <button class="bdv-btn" @click="runAll" :disabled="finished">
        ⏩ 全部运行
      </button>
      <button class="bdv-btn" @click="reset">🔄 重置</button>
    </div>

    <!-- 汇总 -->
    <Transition name="summary-fade">
      <div v-if="finished" class="summary-box" :class="{ found: foundResult }">
        <template v-if="foundResult">
          ✅ 在第 <b>{{ foundAtStep }}</b> 次尝试时命中！
          AL={{ foundResult.al }}，CCE#{{ foundResult.cceStart }}
          （共尝试 {{ visibleSteps.length }} / {{ allSteps.length }} 次）
        </template>
        <template v-else>
          ❌ 遍历所有 {{ allSteps.length }} 个候选，未检测到 DCI（本 slot 无调度）
        </template>
      </div>
    </Transition>

    <div class="bdv-hint">点击"下一步"逐步演示盲检，或"全部运行"直接看结果</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

// ── 状态 ──────────────────────────────────────────────────────────────────
const rnti      = ref(0xC1A3)
const slotIdx   = ref(5)
const nCCE      = ref(18)
const targetAL  = ref(4)

const stepPtr   = ref(0)
const stepsList = ref<HTMLElement | null>(null)

// ── Y_p 计算 ──────────────────────────────────────────────────────────────
const D  = 65537
const Ap = 39827

const rntiModD = computed(() => rnti.value % D)

const yp = computed(() => {
  let y = rnti.value % D
  for (let i = 0; i <= slotIdx.value; i++) {
    y = (Ap * y) % D
  }
  return y
})

// ── CCE 起始索引计算（38.213 §10.1）──────────────────────────────────────
function cceStart(al: number, m: number, Y: number, N: number): number {
  const ML        = Math.max(1, Math.floor(N / al))
  const floorVal  = Math.floor(N / al)
  if (floorVal === 0) return -1
  const inner = (Y + Math.floor((m * N) / (al * ML))) % floorVal
  return al * inner
}

// ── 目标 CCE 位置（gNB 实际发送位置）─────────────────────────────────────
const targetCCE = computed(() =>
  cceStart(targetAL.value, 0, yp.value, nCCE.value)
)

// ── 生成所有盲检步骤 ──────────────────────────────────────────────────────
interface Step {
  al: number
  candIdx: number
  cceStart: number
  isTarget: boolean
  result: 'found' | 'miss' | 'pending'
  resultLabel: string
}

const allSteps = computed<Step[]>(() => {
  const steps: Step[] = []
  const als = [1, 2, 4, 8, 16]
  const N   = nCCE.value
  const Y   = yp.value
  const tAL = targetAL.value
  const tCC = targetCCE.value

  for (const al of als) {
    const maxM = Math.min(8, Math.max(1, Math.floor(N / al)))
    for (let m = 0; m < maxM; m++) {
      const cce = cceStart(al, m, Y, N)
      if (cce < 0 || cce + al > N) continue
      const isTarget = (al === tAL && cce === tCC)
      steps.push({
        al, candIdx: m, cceStart: cce,
        isTarget,
        result: 'pending',
        resultLabel: isTarget ? '✅ CRC 通过（C-RNTI 匹配）' : '❌ CRC 失败',
      })
    }
  }
  return steps
})

// ── 可见步骤（已执行的）──────────────────────────────────────────────────
const visibleSteps = computed<Step[]>(() =>
  allSteps.value.slice(0, stepPtr.value).map(s => ({
    ...s,
    result: s.isTarget ? 'found' : 'miss',
  }))
)

const currentStep   = computed(() => allSteps.value[stepPtr.value])
const currentAL     = computed(() => currentStep.value?.al ?? '—')
const currentCandIdx = computed(() => currentStep.value?.candIdx ?? '—')

const finished = computed(() => stepPtr.value >= allSteps.value.length)

const foundResult = computed(() =>
  visibleSteps.value.find(s => s.isTarget) ?? null
)
const foundAtStep = computed(() => {
  const idx = visibleSteps.value.findIndex(s => s.isTarget)
  return idx >= 0 ? idx + 1 : null
})

// ── CCE 状态（用于着色）──────────────────────────────────────────────────
function cceState(idx: number): string {
  // 检查是否是目标 CCE 范围
  const tStart = targetCCE.value
  const tEnd   = tStart + targetAL.value - 1
  if (idx >= tStart && idx <= tEnd && stepPtr.value > 0) {
    if (foundResult.value) return 'found'
    return 'target'
  }
  // 已被尝试的 CCE
  for (const s of visibleSteps.value) {
    if (idx >= s.cceStart && idx < s.cceStart + s.al) return 'tried'
  }
  return 'untried'
}

function cceStateLabel(idx: number): string {
  const labels: Record<string, string> = {
    found  : '盲检命中（DCI 在此）',
    target : 'gNB 发送目标',
    tried  : '已尝试（CRC 失败）',
    untried: '未尝试',
  }
  return labels[cceState(idx)] ?? ''
}

// ── 控制函数 ──────────────────────────────────────────────────────────────
function stepForward() {
  if (stepPtr.value < allSteps.value.length) {
    stepPtr.value++
    nextTick(() => {
      if (stepsList.value) {
        stepsList.value.scrollTop = stepsList.value.scrollHeight
      }
    })
    // 找到后自动完成
    if (foundResult.value) {
      stepPtr.value = Math.min(stepPtr.value + 0,
        allSteps.value.findIndex(s => s.isTarget) + 1)
    }
  }
}

function runAll() {
  const foundIdx = allSteps.value.findIndex(s => s.isTarget)
  stepPtr.value  = foundIdx >= 0 ? foundIdx + 1 : allSteps.value.length
}

function reset() {
  stepPtr.value = 0
}

watch([rnti, slotIdx, nCCE, targetAL], reset)
</script>

<style scoped>
.bdv-wrap {
  border: 1px solid var(--vp-c-divider); border-radius: 12px;
  padding: 20px; margin: 20px 0; background: var(--vp-c-bg-soft); font-size: 13px;
}
.bdv-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.bdv-title  { font-size: 15px; font-weight: 600; color: var(--vp-c-text-1); }
.bdv-spec   { font-size: 11px; padding: 2px 8px; border-radius: 20px;
              background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }

/* 控制区 */
.bdv-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
@media (max-width: 560px) { .bdv-controls { grid-template-columns: 1fr; } }
.ctrl-group { display: flex; flex-direction: column; gap: 5px; }
.ctrl-label { font-size: 12px; color: var(--vp-c-text-2); display: flex; justify-content: space-between; }
.ctrl-val   { font-family: var(--vp-font-family-mono); font-weight: 700; color: var(--vp-c-brand-1); }
.bdv-slider { width: 100%; height: 4px; cursor: pointer; accent-color: var(--vp-c-brand-1); }
.preset-btns { display: flex; gap: 6px; }
.pre-btn {
  padding: 4px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;
  border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-2); transition: all 0.15s;
}
.pre-btn:hover  { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.pre-btn.active { background: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); color: #fff; }

/* Y_p 推导框 */
.yp-box     { background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
              border-left: 3px solid var(--vp-c-brand-1); border-radius: 6px;
              padding: 10px 13px; margin-bottom: 14px; }
.yp-title   { font-size: 11.5px; font-weight: 600; color: var(--vp-c-text-2); margin-bottom: 5px; }
.yp-formula { font-family: var(--vp-font-family-mono); font-size: 12px;
              color: var(--vp-c-text-1); line-height: 1.7; word-break: break-all; }
.yp-formula b { color: var(--vp-c-brand-1); }
.yp-note    { font-size: 11px; color: var(--vp-c-text-3); margin-top: 5px; }

/* CCE 网格 */
.cce-section { margin-bottom: 12px; }
.cce-title   { font-size: 12px; font-weight: 500; color: var(--vp-c-text-2);
               margin-bottom: 8px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cce-legend  { display: flex; align-items: center; gap: 10px; font-size: 10.5px; color: var(--vp-c-text-3); }
.leg-dot     { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 3px; }
.leg-dot.target  { background: #ffa657; }
.leg-dot.found   { background: #3fb950; }
.leg-dot.tried   { background: #58a6ff; opacity: 0.5; }
.leg-dot.untried { background: var(--vp-c-bg-elv); border: 1px solid var(--vp-c-divider); }

.cce-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 4px; }
.cce-cell {
  height: 42px; border-radius: 6px; border: 1.5px solid var(--vp-c-divider);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  transition: all 0.2s; background: var(--vp-c-bg);
}
.cce-cell.untried { background: var(--vp-c-bg); }
.cce-cell.tried   { background: rgba(88, 166, 255, 0.25); border-color: #58a6ff; }
.cce-cell.target  { background: rgba(255, 166, 87, 0.35); border-color: #ffa657; }
.cce-cell.found   { background: rgba(63, 185, 80, 0.4); border-color: #3fb950;
                    box-shadow: 0 0 8px rgba(63, 185, 80, 0.3); transform: scale(1.05); }
.cce-idx  { font-size: 11px; font-family: var(--vp-font-family-mono);
            color: var(--vp-c-text-2); font-weight: 500; }
.cce-mark { font-size: 11px; }

/* 步骤列表 */
.steps-section { margin-bottom: 12px; }
.steps-title   { font-size: 12px; font-weight: 500; color: var(--vp-c-text-2); margin-bottom: 6px; }
.steps-list {
  max-height: 160px; overflow-y: auto; background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider); border-radius: 6px; padding: 4px;
}
.step-row {
  display: flex; align-items: center; gap: 10px; padding: 4px 8px;
  border-radius: 4px; font-size: 12px; margin-bottom: 2px;
}
.step-row.found { background: rgba(63, 185, 80, 0.15); }
.step-row.miss  { background: transparent; }
.step-num    { font-size: 10px; color: var(--vp-c-text-3); min-width: 24px; }
.step-al     { font-family: var(--vp-font-family-mono); color: var(--vp-c-brand-1); min-width: 44px; }
.step-cce    { font-family: var(--vp-font-family-mono); color: var(--vp-c-text-1); min-width: 100px; }
.step-result { font-size: 11.5px; color: var(--vp-c-text-2); }
.step-row.found .step-result { color: #3fb950; font-weight: 600; }

/* 按钮 */
.bdv-btns { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.bdv-btn {
  padding: 7px 18px; border-radius: 8px; font-size: 13px; cursor: pointer;
  border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-1); transition: all 0.15s;
}
.bdv-btn:hover:not(:disabled)  { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.bdv-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bdv-btn.primary  { background: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); color: #fff; }
.bdv-btn.primary:hover:not(:disabled) { filter: brightness(1.1); }

/* 汇总 */
.summary-box {
  background: #fdecea; border: 1px solid #f5b7b1; border-radius: 8px;
  padding: 10px 14px; font-size: 13px; color: #7b1d1d; margin-bottom: 8px;
}
.summary-box.found { background: #e6f4ea; border-color: #a8d5b0; color: #1a5c2a; }
.summary-fade-enter-active, .summary-fade-leave-active { transition: opacity 0.25s, transform 0.25s; }
.summary-fade-enter-from, .summary-fade-leave-to { opacity: 0; transform: translateY(6px); }

.bdv-hint { font-size: 11.5px; color: var(--vp-c-text-3); text-align: center; }
</style>
