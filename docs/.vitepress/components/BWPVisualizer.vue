<template>
  <div class="bwp-wrap">

    <!-- ── 顶部 ── -->
    <div class="bwp-header">
      <span class="bwp-title">BWP 频域配置演示</span>
      <span class="bwp-spec">3GPP TS 38.211 §4.4.5 / 38.213 §12</span>
    </div>

    <!-- ── 载波参数 ── -->
    <div class="carrier-ctrl">
      <div class="ctrl-group">
        <label>载波带宽</label>
        <div class="radio-row">
          <button
            v-for="bw in [50, 100]" :key="bw"
            :class="['rb-btn', { active: carrierBW === bw }]"
            @click="carrierBW = bw; resetBWPs()"
          >{{ bw }} MHz</button>
        </div>
      </div>
      <div class="ctrl-group">
        <label>载波 SCS (μ)</label>
        <div class="radio-row">
          <button
            v-for="m in [0, 1, 2]" :key="m"
            :class="['rb-btn', { active: carrierMu === m }]"
            @click="carrierMu = m; resetBWPs()"
          >μ={{ m }} ({{ scsOf(m) }}kHz)</button>
        </div>
      </div>
    </div>

    <!-- ── 载波信息栏 ── -->
    <div class="carrier-info">
      <span>载波总 RB 数：<b>{{ carrierRBs }}</b></span>
      <span>单 RB 带宽：<b>{{ rbBW.toFixed(3) }} MHz</b></span>
      <span>Point A：<b>CRB#0 最低子载波</b></span>
    </div>

    <!-- ── 频域可视化条 ── -->
    <div class="freq-bar-wrap">
      <!-- 刻度 -->
      <div class="freq-ticks">
        <span v-for="tick in ticks" :key="tick.crb"
              :style="{ left: tick.pct + '%' }">{{ tick.crb }}</span>
      </div>
      <div class="freq-label-row">
        <span class="pa-label">▲<br/>Point A<br/>CRB#0</span>
      </div>

      <!-- 载波底层 -->
      <div class="carrier-bar">
        <!-- 各 BWP 渲染 -->
        <div
          v-for="bwp in bwps" :key="bwp.id"
          :class="['bwp-bar', `bwp-${bwp.type}`, { selected: selectedBWP === bwp.id }]"
          :style="bwpStyle(bwp)"
          @click="selectedBWP = selectedBWP === bwp.id ? null : bwp.id"
        >
          <span class="bwp-bar-label">{{ bwp.name }}<br/>{{ bwp.nRB }} RB</span>
        </div>
      </div>

      <!-- CRB 刻度条 -->
      <div class="crb-ruler">
        <div v-for="i in Math.min(carrierRBs, 50)" :key="i"
             class="crb-tick"
             :style="{ width: (100 / carrierRBs) + '%' }"></div>
      </div>
    </div>

    <!-- ── BWP 配置编辑器 ── -->
    <div class="bwp-editor">
      <div class="editor-header">
        <span>BWP 配置</span>
        <button class="add-btn" @click="addBWP" :disabled="bwps.length >= 4">
          + 新增 BWP
        </button>
      </div>

      <div class="bwp-list">
        <div
          v-for="bwp in bwps" :key="bwp.id"
          :class="['bwp-row', { selected: selectedBWP === bwp.id }]"
          @click="selectedBWP = bwp.id"
        >
          <!-- 类型标签 -->
          <div class="bwp-type-tag" :class="`tag-${bwp.type}`">{{ bwp.type }}</div>

          <!-- startRB 滑块 -->
          <div class="bwp-param">
            <label>startRB <span class="pv">{{ bwp.startRB }}</span></label>
            <input type="range" :min="0" :max="carrierRBs - bwp.nRB"
                   v-model.number="bwp.startRB" @input="clampBWP(bwp)" />
          </div>

          <!-- nRB 滑块 -->
          <div class="bwp-param">
            <label>nRB <span class="pv">{{ bwp.nRB }}</span></label>
            <input type="range" :min="1" :max="carrierRBs - bwp.startRB"
                   v-model.number="bwp.nRB" @input="clampBWP(bwp)" />
          </div>

          <!-- SCS 选择 -->
          <div class="bwp-param mu-param">
            <label>SCS</label>
            <div class="radio-row small">
              <button v-for="m in [0,1,2]" :key="m"
                      :class="['rb-btn', { active: bwp.mu === m }]"
                      @click.stop="bwp.mu = m">{{ scsOf(m) }}k</button>
            </div>
          </div>

          <!-- 删除 -->
          <button class="del-btn" @click.stop="removeBWP(bwp.id)"
                  :disabled="bwps.length <= 1">✕</button>
        </div>
      </div>
    </div>

    <!-- ── 选中 BWP 的详情面板 ── -->
    <Transition name="detail-fade">
      <div class="bwp-detail" v-if="selectedDetail">
        <div class="detail-row">
          <span class="dl-key">BWP</span>
          <span class="dl-val">{{ selectedDetail.name }}</span>
        </div>
        <div class="detail-row">
          <span class="dl-key">locationAndBandwidth</span>
          <span class="dl-val mono">{{ selectedDetail.lab }}</span>
        </div>
        <div class="detail-row">
          <span class="dl-key">解码验证</span>
          <span class="dl-val mono">startRB={{ selectedDetail.startRB }}，nRB={{ selectedDetail.nRB }}</span>
        </div>
        <div class="detail-row">
          <span class="dl-key">SCS</span>
          <span class="dl-val">{{ scsOf(selectedDetail.mu) }} kHz（μ={{ selectedDetail.mu }}）</span>
        </div>
        <div class="detail-row">
          <span class="dl-key">带宽</span>
          <span class="dl-val">{{ (selectedDetail.nRB * 12 * scsOf(selectedDetail.mu) / 1000).toFixed(2) }} MHz</span>
        </div>
        <div class="detail-row" v-if="selectedDetail.type === 'dormant'">
          <span class="dl-key ntn">🛰️ NTN 提示</span>
          <span class="dl-val ntn">预补偿超时时 UE 应切回此 Dormant BWP，等待星历更新（38.821 Rel-17）</span>
        </div>
      </div>
    </Transition>

    <div class="bwp-hint">点击频域条或配置行选中 BWP · 拖动滑块实时调整 startRB / nRB</div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

// ── 工具函数 ──────────────────────────────────────────────────────────────────
const scsOf = (mu: number) => (2 ** mu) * 15

function encodeLAB(startRB: number, nRB: number): number {
  return 37 * startRB + nRB - 1
}

// ── 载波状态 ──────────────────────────────────────────────────────────────────
const carrierBW = ref(100)       // MHz
const carrierMu = ref(1)         // μ

const carrierRBs = computed(() => {
  const table: Record<string, Record<number, number>> = {
    '50':  { 0: 270, 1: 133, 2: 66  },
    '100': { 0: 270, 1: 275, 2: 135 },
  }
  return table[String(carrierBW.value)]?.[carrierMu.value] ?? 275
})

const rbBW = computed(() => 12 * scsOf(carrierMu.value) / 1000)  // MHz

const ticks = computed(() => {
  const n = carrierRBs.value
  const step = n <= 30 ? 5 : n <= 100 ? 20 : 50
  const result = []
  for (let crb = 0; crb <= n; crb += step) {
    result.push({ crb, pct: (crb / n) * 100 })
  }
  return result
})

// ── BWP 列表 ──────────────────────────────────────────────────────────────────
interface BWP {
  id: number
  name: string
  type: 'initial' | 'active' | 'dormant' | 'default'
  startRB: number
  nRB: number
  mu: number
}

let nextId = 3
const bwps = ref<BWP[]>([
  { id: 0, name: 'Initial BWP',  type: 'initial', startRB: 20,  nRB: 52,  mu: 1 },
  { id: 1, name: 'Active BWP',   type: 'active',  startRB: 10,  nRB: 106, mu: 1 },
  { id: 2, name: 'Dormant BWP',  type: 'dormant', startRB: 20,  nRB: 20,  mu: 1 },
])

const selectedBWP = ref<number | null>(null)

const BWP_TYPES = ['initial', 'active', 'dormant', 'default'] as const

function addBWP() {
  const type = BWP_TYPES[bwps.value.length % 4]
  bwps.value.push({
    id: nextId++,
    name: `BWP #${nextId - 1}`,
    type,
    startRB: 0,
    nRB: 25,
    mu: carrierMu.value,
  })
}

function removeBWP(id: number) {
  bwps.value = bwps.value.filter(b => b.id !== id)
  if (selectedBWP.value === id) selectedBWP.value = null
}

function clampBWP(bwp: BWP) {
  const max = carrierRBs.value
  if (bwp.startRB + bwp.nRB > max) bwp.nRB = max - bwp.startRB
  if (bwp.nRB < 1) bwp.nRB = 1
}

function resetBWPs() {
  const n = carrierRBs.value
  bwps.value.forEach(b => {
    if (b.startRB + b.nRB > n) {
      b.startRB = 0
      b.nRB = Math.min(b.nRB, n)
    }
    b.mu = carrierMu.value
  })
}

// ── 样式计算 ──────────────────────────────────────────────────────────────────
const LEVEL: Record<string, number> = { initial: 0, active: 1, dormant: 2, default: 3 }
const HEIGHTS = ['38px', '30px', '22px', '14px']

function bwpStyle(bwp: BWP) {
  const n    = carrierRBs.value
  const left = (bwp.startRB / n) * 100
  const w    = (bwp.nRB / n) * 100
  const lvl  = LEVEL[bwp.type]
  return {
    left: left + '%',
    width: w + '%',
    height: HEIGHTS[lvl],
    bottom: (lvl * 10) + 'px',
  }
}

const selectedDetail = computed(() => {
  if (selectedBWP.value === null) return null
  const b = bwps.value.find(x => x.id === selectedBWP.value)
  if (!b) return null
  return { ...b, lab: encodeLAB(b.startRB, b.nRB) }
})
</script>

<style scoped>
.bwp-wrap {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
  background: var(--vp-c-bg-soft);
  font-size: 13px;
}

/* ── 顶部 ── */
.bwp-header   { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.bwp-title    { font-size: 15px; font-weight: 600; color: var(--vp-c-text-1); }
.bwp-spec     { font-size: 11px; padding: 2px 8px; border-radius: 20px; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }

/* ── 控制栏 ── */
.carrier-ctrl { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 10px; }
.ctrl-group   { display: flex; flex-direction: column; gap: 6px; }
.ctrl-group label { font-size: 12px; color: var(--vp-c-text-2); font-weight: 500; }
.radio-row    { display: flex; gap: 6px; flex-wrap: wrap; }
.rb-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1.5px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.rb-btn:hover  { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.rb-btn.active { background: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); color: #fff; }
.radio-row.small .rb-btn { padding: 3px 8px; font-size: 11px; }

/* ── 载波信息 ── */
.carrier-info {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--vp-c-text-2);
  margin-bottom: 12px;
  padding: 6px 10px;
  background: var(--vp-c-bg);
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
}
.carrier-info b { color: var(--vp-c-text-1); }

/* ── 频域条 ── */
.freq-bar-wrap { margin-bottom: 16px; position: relative; }

.freq-ticks {
  position: relative;
  height: 16px;
  margin-bottom: 2px;
}
.freq-ticks span {
  position: absolute;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--vp-c-text-3);
}

.freq-label-row { height: 14px; position: relative; }
.pa-label {
  position: absolute;
  left: 0;
  transform: translateX(-50%);
  font-size: 9px;
  color: var(--vp-c-brand-1);
  text-align: center;
  line-height: 1.2;
}

.carrier-bar {
  position: relative;
  height: 80px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
}

/* ── BWP 色带 ── */
.bwp-bar {
  position: absolute;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s ease;
  overflow: hidden;
  border: 1.5px solid transparent;
}
.bwp-bar:hover   { filter: brightness(1.1); }
.bwp-bar.selected { border-color: var(--vp-c-text-1); box-shadow: 0 0 0 2px rgba(0,0,0,0.15); }

.bwp-initial { background: rgba(37, 99, 235, 0.55); }
.bwp-active  { background: rgba(22, 163, 74, 0.50); }
.bwp-dormant { background: rgba(147, 51, 234, 0.45); }
.bwp-default { background: rgba(217, 119, 6, 0.45); }

.bwp-bar-label {
  font-size: 10px;
  color: #fff;
  text-align: center;
  text-shadow: 0 1px 2px rgba(0,0,0,0.4);
  line-height: 1.3;
  font-weight: 500;
}

.crb-ruler {
  display: flex;
  margin-top: 4px;
  height: 4px;
}
.crb-tick {
  flex-shrink: 0;
  border-left: 1px solid var(--vp-c-divider);
  height: 100%;
}

/* ── 编辑器 ── */
.bwp-editor   { margin-bottom: 12px; }
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin-bottom: 8px;
}
.add-btn {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1.5px solid var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  cursor: pointer;
}
.add-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.bwp-list { display: flex; flex-direction: column; gap: 8px; }
.bwp-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: border-color 0.15s;
  flex-wrap: wrap;
}
.bwp-row:hover    { border-color: var(--vp-c-brand-2); }
.bwp-row.selected { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }

.bwp-type-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
  white-space: nowrap;
}
.tag-initial { background: #dbeafe; color: #1d4ed8; }
.tag-active  { background: #dcfce7; color: #15803d; }
.tag-dormant { background: #f3e8ff; color: #7e22ce; }
.tag-default { background: #fef3c7; color: #92400e; }

.bwp-param {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 100px;
}
.bwp-param label {
  font-size: 11px;
  color: var(--vp-c-text-3);
  display: flex;
  justify-content: space-between;
}
.pv { font-weight: 600; color: var(--vp-c-text-1); font-family: var(--vp-font-family-mono); }
.bwp-param input[type=range] { width: 100%; height: 4px; cursor: pointer; }

.mu-param { min-width: 160px; }

.del-btn {
  background: none;
  border: none;
  color: var(--vp-c-text-3);
  cursor: pointer;
  font-size: 13px;
  padding: 4px;
  border-radius: 4px;
  flex-shrink: 0;
}
.del-btn:hover:not(:disabled) { color: #ef4444; }
.del-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* ── 详情面板 ── */
.bwp-detail {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-left: 3px solid var(--vp-c-brand-1);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}
.detail-row  { display: flex; flex-direction: column; gap: 2px; }
.dl-key      { font-size: 10.5px; color: var(--vp-c-text-3); }
.dl-key.ntn  { color: #b45309; }
.dl-val      { font-size: 13px; color: var(--vp-c-text-1); font-weight: 500; }
.dl-val.mono { font-family: var(--vp-font-family-mono); }
.dl-val.ntn  { color: #b45309; font-size: 12px; max-width: 280px; }

.detail-fade-enter-active, .detail-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.detail-fade-enter-from, .detail-fade-leave-to { opacity: 0; transform: translateY(4px); }

.bwp-hint { font-size: 11.5px; color: var(--vp-c-text-3); text-align: center; }
</style>
