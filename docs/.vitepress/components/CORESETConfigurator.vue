<template>
  <div class="cc-wrap">
    <div class="cc-header">
      <span class="cc-title">CORESET 配置器</span>
      <span class="cc-spec">3GPP TS 38.211 §7.3.2 / 38.331 ControlResourceSet</span>
    </div>

    <div class="cc-body">
      <!-- 左：配置面板 -->
      <div class="cc-config">

        <!-- Duration -->
        <div class="cfg-group">
          <div class="cfg-label">时域符号数（duration）</div>
          <div class="dur-btns">
            <button v-for="d in [1,2,3]" :key="d"
                    :class="['dur-btn', { active: duration === d }]"
                    @click="duration = d">
              {{ d }} 符号
            </button>
          </div>
        </div>

        <!-- 45-bit bitmap -->
        <div class="cfg-group">
          <div class="cfg-label">
            频域 bitmap（45 bit，每 bit = 6 RB）
            <span class="cfg-sub">点击切换</span>
          </div>
          <div class="bitmap-grid">
            <button
              v-for="(bit, idx) in bitmap"
              :key="idx"
              :class="['bit-btn', { on: bit === '1' }]"
              @click="toggleBit(idx)"
              :title="`bit#${idx} → RB#${idx*6}~${idx*6+5}`"
            >
              <span class="bit-val">{{ bit }}</span>
              <span class="bit-rb">{{ idx * 6 }}</span>
            </button>
          </div>
          <div class="bitmap-presets">
            <span class="preset-label">快速预设：</span>
            <button v-for="p in presets" :key="p.label"
                    class="preset-btn" @click="applyPreset(p.bits)">
              {{ p.label }}
            </button>
          </div>
        </div>

        <!-- CCE-REG Mapping -->
        <div class="cfg-group">
          <div class="cfg-label">CCE-REG 映射类型</div>
          <div class="dur-btns">
            <button v-for="t in ['nonInterleaved','interleaved']" :key="t"
                    :class="['dur-btn', { active: mappingType === t }]"
                    @click="mappingType = t">
              {{ t }}
            </button>
          </div>
        </div>

      </div>

      <!-- 右：统计结果 -->
      <div class="cc-stats">

        <div class="stat-title">配置统计</div>

        <div class="stat-cards">
          <div class="stat-card" v-for="s in statCards" :key="s.label">
            <div class="sc-label">{{ s.label }}</div>
            <div class="sc-value" :style="{ color: s.color }">{{ s.value }}</div>
            <div class="sc-unit">{{ s.unit }}</div>
          </div>
        </div>

        <!-- AL 容量表 -->
        <div class="al-table">
          <div class="al-title">各聚合级别容量</div>
          <div class="al-row header">
            <span>AL</span><span>每候选 CCE</span><span>最大候选数</span><span>鲁棒性</span>
          </div>
          <div class="al-row" v-for="al in [1,2,4,8,16]" :key="al">
            <span class="al-val">{{ al }}</span>
            <span>{{ al }}</span>
            <span :class="['al-max', { zero: nCCE < al }]">
              {{ nCCE >= al ? Math.floor(nCCE / al) : '0（不足）' }}
            </span>
            <span class="al-robust">
              <span v-for="i in Math.min(al, 5)" :key="i" class="robust-dot"
                    :style="{ background: robustColor(al) }">●</span>
            </span>
          </div>
        </div>

        <!-- 盲检预算 -->
        <div class="budget-box" :class="{ over: totalCandidates > 44 }">
          <div class="budget-title">盲检预算（上限 44 次/slot）</div>
          <div class="budget-bar-wrap">
            <div class="budget-bar"
                 :style="{ width: Math.min(totalCandidates / 44 * 100, 100) + '%',
                           background: totalCandidates > 44 ? '#ff7b72' : '#3fb950' }">
            </div>
          </div>
          <div class="budget-text">
            当前配置最大候选总数：
            <b :style="{ color: totalCandidates > 44 ? '#ff7b72' : '#3fb950' }">
              {{ totalCandidates }}
            </b> / 44
          </div>
        </div>

      </div>
    </div>

    <!-- 频域可视化 -->
    <div class="freq-vis">
      <div class="fv-title">BWP 频域资源分布（每格 = 6 RB）</div>
      <div class="fv-grid">
        <div v-for="(bit, idx) in bitmap" :key="idx"
             :class="['fv-cell', { 'fv-on': bit === '1' }]"
             @click="toggleBit(idx)"
             :title="`RB#${idx*6}~${idx*6+5}${bit==='1' ? '（CORESET）' : ''}`">
          <span class="fv-rb">{{ idx * 6 }}</span>
        </div>
      </div>
      <div class="fv-legend">
        <span class="fv-leg-item">
          <span class="fv-dot on"></span>CORESET（PDCCH 候选区）
        </span>
        <span class="fv-leg-item">
          <span class="fv-dot off"></span>PDSCH / 其他信道
        </span>
      </div>
    </div>

    <div class="cc-hint">点击 bitmap 方块或频域格子切换该 6-RB 块是否属于 CORESET</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// ── 状态 ──────────────────────────────────────────────────────────────────
const bitmap     = ref<string[]>('111111111111111110000000000000000000000000000'.split(''))
const duration   = ref(2)
const mappingType= ref('nonInterleaved')

const presets = [
  { label: '全频域（108 RB）', bits: '111111111111111110000000000000000000000000000' },
  { label: '半载波（138 RB）', bits: '111111111111111111111110000000000000000000000' },
  { label: '小 CORESET（36 RB）', bits: '111111000000000000000000000000000000000000000' },
  { label: '全带宽（270 RB）', bits: '111111111111111111111111111111111111111111111' },
]

function toggleBit(idx: number) {
  const arr = [...bitmap.value]
  arr[idx]  = arr[idx] === '1' ? '0' : '1'
  bitmap.value = arr
}

function applyPreset(bits: string) {
  bitmap.value = bits.split('')
}

// ── 计算属性 ──────────────────────────────────────────────────────────────
const nRB  = computed(() => bitmap.value.filter(b => b === '1').length * 6)
const nREG = computed(() => nRB.value * duration.value)
const nCCE = computed(() => Math.floor(nREG.value / 6))

// 最大候选数（所有 AL 加总，按 38.213 §10.1 Table 10.1-1 的典型配置）
const totalCandidates = computed(() => {
  let sum = 0
  for (const al of [1, 2, 4, 8, 16]) {
    sum += Math.min(8, Math.floor(nCCE.value / al))
  }
  return sum
})

const statCards = computed(() => [
  { label: '频域 RB 数',  value: nRB.value,   unit: 'RB',  color: 'var(--vp-c-brand-1)' },
  { label: '总 REG 数',   value: nREG.value,  unit: 'REG', color: 'var(--vp-c-text-1)' },
  { label: '总 CCE 数',   value: nCCE.value,  unit: 'CCE', color: 'var(--vp-c-text-1)' },
  { label: 'AL=4 最大候选', value: Math.floor(nCCE.value / 4), unit: '个', color: '#ffa657' },
])

function robustColor(al: number): string {
  const colors = { 1: '#58a6ff', 2: '#3fb950', 4: '#ffa657', 8: '#d2a8ff', 16: '#ff7b72' }
  return colors[al as keyof typeof colors] || '#8b949e'
}
</script>

<style scoped>
.cc-wrap {
  border: 1px solid var(--vp-c-divider); border-radius: 12px;
  padding: 20px; margin: 20px 0; background: var(--vp-c-bg-soft); font-size: 13px;
}
.cc-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.cc-title  { font-size: 15px; font-weight: 600; color: var(--vp-c-text-1); }
.cc-spec   { font-size: 11px; padding: 2px 8px; border-radius: 20px;
             background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }

.cc-body { display: grid; grid-template-columns: 1fr 280px; gap: 16px; margin-bottom: 14px; }
@media (max-width: 680px) { .cc-body { grid-template-columns: 1fr; } }

/* 配置面板 */
.cc-config  { display: flex; flex-direction: column; gap: 14px; }
.cfg-group  { display: flex; flex-direction: column; gap: 6px; }
.cfg-label  { font-size: 12px; font-weight: 500; color: var(--vp-c-text-2);
              display: flex; justify-content: space-between; align-items: center; }
.cfg-sub    { font-size: 10px; color: var(--vp-c-text-3); }

.dur-btns { display: flex; gap: 6px; }
.dur-btn {
  padding: 5px 14px; border-radius: 6px; font-size: 12px; cursor: pointer;
  border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-2); transition: all 0.15s;
}
.dur-btn:hover  { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.dur-btn.active { background: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); color:#fff; }

/* bitmap 网格 */
.bitmap-grid {
  display: grid; grid-template-columns: repeat(15, 1fr); gap: 3px;
}
.bit-btn {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 34px; border-radius: 4px; cursor: pointer; transition: all 0.12s;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg);
  font-size: 9px; gap: 1px;
}
.bit-btn.on  { background: rgba(88,166,255,0.6); border-color: #58a6ff; }
.bit-btn:hover { transform: scale(1.08); z-index: 2; }
.bit-val { font-size: 10px; font-weight: 700; color: var(--vp-c-text-1); }
.bit-rb  { font-size: 8px; color: var(--vp-c-text-3); }
.bit-btn.on .bit-val { color: #e6f4ff; }

.bitmap-presets { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.preset-label { font-size: 11px; color: var(--vp-c-text-3); }
.preset-btn {
  padding: 2px 9px; border-radius: 20px; font-size: 11px; cursor: pointer;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-2); transition: all 0.15s;
}
.preset-btn:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }

/* 统计面板 */
.cc-stats    { display: flex; flex-direction: column; gap: 10px; }
.stat-title  { font-size: 13px; font-weight: 600; color: var(--vp-c-text-1); margin-bottom: 2px; }
.stat-cards  { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.stat-card   {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 8px 10px;
}
.sc-label { font-size: 10px; color: var(--vp-c-text-3); margin-bottom: 2px; }
.sc-value { font-size: 20px; font-weight: 700; font-family: var(--vp-font-family-mono); line-height: 1.2; }
.sc-unit  { font-size: 10px; color: var(--vp-c-text-3); }

/* AL 表 */
.al-table   { background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider); border-radius: 8px; overflow: hidden; }
.al-title   { font-size: 11.5px; font-weight: 600; color: var(--vp-c-text-2); padding: 7px 10px; background: var(--vp-c-bg-soft); }
.al-row     { display: grid; grid-template-columns: 1fr 1.2fr 1.5fr 1.2fr; padding: 5px 10px; font-size: 11.5px; border-top: 1px solid var(--vp-c-divider); align-items: center; }
.al-row.header { font-weight: 600; color: var(--vp-c-text-3); font-size: 10.5px; }
.al-val     { font-family: var(--vp-font-family-mono); font-weight: 600; color: var(--vp-c-text-1); }
.al-max     { font-family: var(--vp-font-family-mono); color: var(--vp-c-text-1); }
.al-max.zero { color: var(--vp-c-text-3); font-size: 10px; }
.robust-dot { font-size: 8px; }

/* 盲检预算 */
.budget-box {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 10px 12px;
}
.budget-box.over { border-color: #ff7b72; background: #fff2f0; }
.budget-title { font-size: 11.5px; color: var(--vp-c-text-2); margin-bottom: 6px; font-weight: 500; }
.budget-bar-wrap { height: 6px; background: var(--vp-c-bg-elv); border-radius: 3px; margin-bottom: 5px; overflow: hidden; }
.budget-bar      { height: 100%; border-radius: 3px; transition: width 0.3s, background 0.3s; }
.budget-text     { font-size: 12px; color: var(--vp-c-text-2); }

/* 频域可视化 */
.freq-vis   { background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 12px; margin-bottom: 10px; }
.fv-title   { font-size: 12px; color: var(--vp-c-text-2); font-weight: 500; margin-bottom: 8px; }
.fv-grid    { display: grid; grid-template-columns: repeat(15, 1fr); gap: 2px; margin-bottom: 8px; }
.fv-cell    {
  height: 28px; border-radius: 3px; cursor: pointer; transition: all 0.12s;
  background: var(--vp-c-bg-elv); border: 1px solid var(--vp-c-divider);
  display: flex; align-items: center; justify-content: center;
}
.fv-cell.fv-on  { background: rgba(88,166,255,0.55); border-color: #58a6ff; }
.fv-cell:hover  { transform: scaleY(1.1); }
.fv-rb          { font-size: 8px; color: var(--vp-c-text-3); }
.fv-cell.fv-on .fv-rb { color: #c8e4ff; }

.fv-legend  { display: flex; gap: 14px; }
.fv-leg-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--vp-c-text-3); }
.fv-dot     { width: 10px; height: 10px; border-radius: 2px; }
.fv-dot.on  { background: rgba(88,166,255,0.6); }
.fv-dot.off { background: var(--vp-c-bg-elv); border: 1px solid var(--vp-c-divider); }

.cc-hint { font-size: 11.5px; color: var(--vp-c-text-3); text-align: center; }
</style>
