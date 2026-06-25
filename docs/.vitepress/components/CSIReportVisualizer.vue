<template>
  <div class="csi-root">
    <!-- 标题 -->
    <div class="csi-header">
      <span class="csi-title">CSI 上报闭环可视化</span>
      <span class="csi-sub">38.214 §5.2.1 — CQI / PMI / RI 实时推导</span>
    </div>

    <!-- 控制区 -->
    <div class="csi-controls">
      <div class="ctrl-group">
        <label>SINR (dB)</label>
        <input type="range" v-model.number="sinrDb" min="-5" max="35" step="0.5" />
        <span class="ctrl-val">{{ sinrDb.toFixed(1) }} dB</span>
      </div>
      <div class="ctrl-group">
        <label>天线端口数</label>
        <select v-model.number="nPorts">
          <option :value="1">1 端口</option>
          <option :value="2">2 端口</option>
          <option :value="4">4 端口</option>
          <option :value="8">8 端口</option>
        </select>
      </div>
      <div class="ctrl-group">
        <label>上报周期</label>
        <select v-model.number="reportPeriod">
          <option :value="5">5 slots (2.5ms)</option>
          <option :value="10">10 slots (5ms)</option>
          <option :value="20">20 slots (10ms)</option>
          <option :value="40">40 slots (20ms)</option>
          <option :value="80">80 slots (40ms)</option>
        </select>
      </div>
      <div class="ctrl-group">
        <label>场景</label>
        <select v-model="scenario">
          <option value="ground">地面 (v=30km/h)</option>
          <option value="leo">NTN LEO 550km</option>
          <option value="plane">机载 (v=900km/h)</option>
        </select>
      </div>
    </div>

    <!-- 主内容：三栏 -->
    <div class="csi-main">

      <!-- 左栏：CSI-RS 资源格 -->
      <div class="csi-panel">
        <div class="panel-title">CSI-RS 时频资源</div>
        <svg class="rg-svg" viewBox="0 0 168 210" xmlns="http://www.w3.org/2000/svg">
          <!-- 背景 -->
          <rect width="168" height="210" fill="var(--vp-c-bg-soft)" rx="4"/>
          <!-- 网格 (12 SC × 14 sym) -->
          <g v-for="sym in 14" :key="'row'+sym">
            <g v-for="sc in 12" :key="'cell'+sc">
              <rect
                :x="(sc-1)*13 + 2" :y="(sym-1)*14 + 2"
                width="12" height="13"
                :fill="getCellColor(sc-1, sym-1)"
                :opacity="getCellOpacity(sc-1, sym-1)"
                rx="1"
                stroke="var(--vp-c-divider)" stroke-width="0.5"
              />
              <text
                v-if="isCsiRsRe(sc-1, sym-1)"
                :x="(sc-1)*13 + 8" :y="(sym-1)*14 + 11"
                font-size="5" text-anchor="middle"
                fill="var(--vp-c-bg)"
                font-weight="bold"
              >P{{ getPortIdx(sc-1, sym-1) }}</text>
            </g>
          </g>
          <!-- 轴标签 -->
          <text x="85" y="208" font-size="6" text-anchor="middle" fill="var(--vp-c-text-2)">子载波 (12 SC / 1 RB)</text>
          <text x="1" y="110" font-size="6" text-anchor="middle" fill="var(--vp-c-text-2)"
            transform="rotate(-90,5,110)">OFDM 符号 (14 / slot)</text>
        </svg>
        <!-- 图例 -->
        <div class="rg-legend">
          <span class="leg-item"><span class="leg-dot" style="background:#58a6ff"></span>CSI-RS RE</span>
          <span class="leg-item"><span class="leg-dot" style="background:#3fb950"></span>DMRS (参考)</span>
          <span class="leg-item"><span class="leg-dot" style="background:#30363d"></span>数据</span>
        </div>
      </div>

      <!-- 中栏：上报量计算 -->
      <div class="csi-panel wide">
        <div class="panel-title">CSI 上报量实时推导</div>

        <!-- CQI -->
        <div class="metric-card" :class="cqiClass">
          <div class="metric-head">
            <span class="metric-label">CQI</span>
            <span class="metric-value">{{ cqi }}</span>
            <span class="metric-unit">/ 15</span>
          </div>
          <div class="metric-bar-wrap">
            <div class="metric-bar" :style="{width: (cqi/15*100)+'%', background: cqiColor}"></div>
          </div>
          <div class="metric-detail">
            调制：<b>{{ modulation }}</b> &nbsp;|&nbsp;
            目标码率：<b>{{ codeRate }}</b> &nbsp;|&nbsp;
            频谱效率：<b>{{ se.toFixed(2) }} bit/s/Hz</b>
          </div>
        </div>

        <!-- RI -->
        <div class="metric-card">
          <div class="metric-head">
            <span class="metric-label">RI</span>
            <span class="metric-value">{{ ri }}</span>
            <span class="metric-unit">/ {{ nPorts }} 层</span>
          </div>
          <div class="ri-layers">
            <div
              v-for="l in nPorts" :key="l"
              class="ri-layer-box"
              :class="{active: l <= ri, inactive: l > ri}"
            >
              <span>层 {{ l }}</span>
              <span v-if="l <= ri" class="sinr-tag">{{ layerSinr(l).toFixed(1) }}dB</span>
              <span v-else class="sinr-tag muted">—</span>
            </div>
          </div>
          <div class="metric-detail">
            有效层数 {{ ri }}，总频谱效率 <b>{{ totalSe.toFixed(2) }}</b> bit/s/Hz
          </div>
        </div>

        <!-- PMI -->
        <div class="metric-card">
          <div class="metric-head">
            <span class="metric-label">PMI</span>
            <span class="metric-value">i₁={{ pmi.i1 }}, i₂={{ pmi.i2 }}</span>
          </div>
          <div class="metric-detail">
            Type I 单面板码本 &nbsp;|&nbsp; W = W₁·W₂ &nbsp;|&nbsp;
            <span :style="{color: codebookType === 'TypeI' ? '#3fb950' : '#bc8cff'}">{{ codebookType }}</span>
          </div>
          <div class="w-matrix">
            <span class="w-label">W（近似）</span>
            <div class="w-grid">
              <div v-for="(row, ri2) in wMatrix" :key="ri2" class="w-row">
                <span v-for="(val, ci) in row" :key="ci" class="w-cell">{{ val }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- LI + CRI -->
        <div class="metric-row">
          <div class="metric-card half">
            <div class="metric-head">
              <span class="metric-label">LI</span>
              <span class="metric-value">{{ li }}</span>
            </div>
            <div class="metric-detail">最强信号层索引（PTRS 端口关联）</div>
          </div>
          <div class="metric-card half">
            <div class="metric-head">
              <span class="metric-label">CRI</span>
              <span class="metric-value">0</span>
            </div>
            <div class="metric-detail">最优 CSI-RS 资源（波束管理）</div>
          </div>
        </div>
      </div>

      <!-- 右栏：信道状态与 AMC -->
      <div class="csi-panel">
        <div class="panel-title">AMC 决策与信道质量</div>

        <!-- 信道老化指示 -->
        <div class="aging-card" :class="agingClass">
          <div class="aging-head">信道老化状态</div>
          <div class="aging-rho">ρ = {{ rho.toFixed(3) }}</div>
          <div class="aging-bar-wrap">
            <div class="aging-bar" :style="{width: (rho*100)+'%', background: agingColor}"></div>
          </div>
          <div class="aging-label">{{ agingLabel }}</div>
          <div class="aging-detail">
            场景：{{ scenarioLabel }}<br/>
            fd = {{ fd.toFixed(1) }} Hz<br/>
            Tc ≈ {{ (1/(4*fd)*1000).toFixed(1) }} ms<br/>
            上报延迟 ≈ {{ (reportPeriod * 0.5).toFixed(1) }} ms
          </div>
        </div>

        <!-- AMC 决策 -->
        <div class="amc-card">
          <div class="amc-title">gNB AMC 决策</div>
          <div class="amc-flow">
            <div class="amc-step" :class="{warn: rho < 0.8}">
              <span class="amc-icon">📡</span>
              <span>CQI={{ cqi }}</span>
              <span class="amc-note">{{ rho < 0.8 ? '⚠ 可能过时' : '✓ 可信' }}</span>
            </div>
            <div class="amc-arrow">→</div>
            <div class="amc-step">
              <span class="amc-icon">📊</span>
              <span>MCS={{ mcsIndex }}</span>
              <span class="amc-note">{{ modulation }}, R={{ codeRate }}</span>
            </div>
            <div class="amc-arrow">→</div>
            <div class="amc-step" :class="blerClass">
              <span class="amc-icon">📨</span>
              <span>BLER≈{{ (expectedBler*100).toFixed(1) }}%</span>
              <span class="amc-note">{{ blerLabel }}</span>
            </div>
          </div>
          <div v-if="rho < 0.8" class="amc-warn">
            ⚠ 信道老化严重，建议缩短上报周期或启用 AP-CSI
          </div>
          <div v-if="scenario === 'leo'" class="amc-ntn">
            🛰 NTN 场景：建议配置 reportSlotOffsetList-r17 (Rel-17)
          </div>
        </div>

        <!-- OLLA 状态 -->
        <div class="olla-card">
          <div class="olla-title">OLLA 外环状态</div>
          <div class="olla-row">
            <span>目标 BLER</span><span class="olla-val">10%</span>
          </div>
          <div class="olla-row">
            <span>估计实际 BLER</span>
            <span class="olla-val" :style="{color: expectedBler > 0.15 ? '#f85149' : '#3fb950'}">
              {{ (expectedBler*100).toFixed(1) }}%
            </span>
          </div>
          <div class="olla-row">
            <span>OLLA 动作</span>
            <span class="olla-val" :style="{color: expectedBler > 0.15 ? '#f85149' : '#d29922'}">
              {{ expectedBler > 0.15 ? '↓ 降 MCS (-0.9dB)' : '↑ 升 MCS (+0.1dB)' }}
            </span>
          </div>
        </div>
      </div>

    </div>

    <!-- 底部公式说明 -->
    <div class="csi-formula">
      <span class="formula-label">核心公式</span>
      <span class="formula-text">
        CQI = argmax{ q : BLER(q) ≤ 10% } &nbsp;|&nbsp;
        RI = argmax{ r : r × SE(CQI(r)) } &nbsp;|&nbsp;
        ρ = J₀(2π·f_d·Δt)
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// ── 状态 ──────────────────────────────────────────────────
const sinrDb     = ref(12)
const nPorts     = ref(4)
const reportPeriod = ref(20)  // slots
const scenario   = ref('ground')

// ── CQI 表（38.214 Table 5.2.1.3-1）────────────────────
interface CQIEntry { mod: string; cr: string; se: number; mcs: number }
const CQI_TABLE: CQIEntry[] = [
  { mod: '—',    cr: '—',    se: 0.000, mcs: 0  },
  { mod: 'QPSK', cr: '78/1024',  se: 0.1523, mcs: 1  },
  { mod: 'QPSK', cr: '120/1024', se: 0.2344, mcs: 2  },
  { mod: 'QPSK', cr: '193/1024', se: 0.3770, mcs: 4  },
  { mod: 'QPSK', cr: '308/1024', se: 0.6016, mcs: 6  },
  { mod: 'QPSK', cr: '449/1024', se: 0.8770, mcs: 8  },
  { mod: 'QPSK', cr: '602/1024', se: 1.1758, mcs: 10 },
  { mod: '16QAM',cr: '378/1024', se: 1.4766, mcs: 12 },
  { mod: '16QAM',cr: '490/1024', se: 1.9141, mcs: 15 },
  { mod: '16QAM',cr: '616/1024', se: 2.4063, mcs: 18 },
  { mod: '64QAM',cr: '466/1024', se: 2.7305, mcs: 20 },
  { mod: '64QAM',cr: '567/1024', se: 3.3223, mcs: 22 },
  { mod: '64QAM',cr: '666/1024', se: 3.9023, mcs: 24 },
  { mod: '64QAM',cr: '772/1024', se: 4.5234, mcs: 26 },
  { mod: '64QAM',cr: '873/1024', se: 5.1152, mcs: 27 },
  { mod: '64QAM',cr: '948/1024', se: 5.5547, mcs: 28 },
]

function sinrToCqi(sinrDb_: number): number {
  const sinrLin = Math.pow(10, sinrDb_ / 10)
  let best = 0
  for (let q = 1; q < CQI_TABLE.length; q++) {
    const se = CQI_TABLE[q].se
    if (se === 0) continue
    const needed = Math.pow(2, se) - 1
    if (sinrLin >= needed * 1.5) best = q
  }
  return best
}

// ── 场景参数 ─────────────────────────────────────────────
const scenarioParams: Record<string, { v: number; label: string }> = {
  ground: { v: 30 / 3.6,   label: '地面 30km/h' },
  leo:    { v: 0.1,         label: 'NTN LEO (静止 UE)' },  // LOS 慢变
  plane:  { v: 900 / 3.6,  label: '机载 900km/h' },
}

// ── 计算属性 ─────────────────────────────────────────────
const fd = computed(() => {
  const fc = 3.5e9
  const { v } = scenarioParams[scenario.value]
  return v * fc / 3e8
})

const rho = computed(() => {
  const delay = reportPeriod.value * 0.5e-3  // slot = 0.5ms (μ=1)
  const x = 2 * Math.PI * fd.value * delay
  // Bessel J0 近似
  if (x < 0.001) return 1
  if (x < 2.4) return 1 - x * x / 4 + x * x * x * x / 64
  return Math.sqrt(2 / (Math.PI * x)) * Math.cos(x - Math.PI / 4)
})

const rhoClamp = computed(() => Math.max(-1, Math.min(1, rho.value)))

const cqi = computed(() => sinrToCqi(sinrDb.value))
const entry = computed(() => CQI_TABLE[cqi.value])
const modulation = computed(() => entry.value.mod)
const codeRate   = computed(() => entry.value.cr)
const se         = computed(() => entry.value.se)
const mcsIndex   = computed(() => entry.value.mcs)

// RI 计算（简化：层数增加 SINR 下降，取 SE 最大值）
const ri = computed(() => {
  let bestRi = 1, bestSe = 0
  for (let r = 1; r <= nPorts.value; r++) {
    // 每层 SINR 近似：总 SNR / r（等功率）
    const sinrPerLayer = sinrDb.value - 10 * Math.log10(r)
    const cqiR = sinrToCqi(sinrPerLayer)
    const totalSe = r * CQI_TABLE[cqiR].se
    if (totalSe > bestSe) { bestSe = totalSe; bestRi = r }
  }
  return bestRi
})

const totalSe = computed(() => {
  let s = 0
  for (let r = 1; r <= ri.value; r++) {
    const sinrPerLayer = sinrDb.value - 10 * Math.log10(ri.value)
    s += CQI_TABLE[sinrToCqi(sinrPerLayer)].se
  }
  return s
})

function layerSinr(l: number): number {
  return sinrDb.value - 10 * Math.log10(ri.value)
}

// PMI（简化展示，仅显示索引）
const pmi = computed(() => ({
  i1: Math.min(Math.floor(sinrDb.value / 5), 7),
  i2: Math.min(Math.floor((sinrDb.value % 5) * 0.6), 3),
}))
const codebookType = computed(() => nPorts.value <= 4 ? 'TypeI' : 'TypeII')

// W 矩阵（示意）
const wMatrix = computed(() => {
  const r = ri.value
  const rows = Array.from({ length: nPorts.value }, (_, i) =>
    Array.from({ length: r }, (_, j) =>
      i === j ? '1' : (i < r ? '0' : '⋯')
    )
  )
  return rows.slice(0, Math.min(nPorts.value, 4))  // 最多显示 4 行
})

const li = computed(() => 0)  // 最强层永远是层 0（简化）

// AMC
function sShapedBler(sinr: number, se_: number): number {
  if (se_ === 0) return 1
  const needed = 10 * Math.log10(Math.pow(2, se_) - 1) + 2.5
  return 1 / (1 + Math.exp(1.2 * (sinr - needed)))
}

const expectedBler = computed(() => sShapedBler(sinrDb.value, se.value))

// ── 样式计算 ─────────────────────────────────────────────
const cqiColor = computed(() => {
  if (cqi.value <= 0) return '#f85149'
  if (cqi.value <= 6) return '#58a6ff'
  if (cqi.value <= 9) return '#3fb950'
  return '#d29922'
})
const cqiClass = computed(() => cqi.value <= 0 ? 'card-danger' : '')
const blerClass = computed(() => expectedBler.value > 0.15 ? 'warn' : '')
const blerLabel = computed(() => expectedBler.value > 0.15 ? '⚠ NACK 率高' : '✓ 目标范围内')

const agingColor = computed(() => {
  const r = rhoClamp.value
  if (r > 0.9) return '#3fb950'
  if (r > 0.7) return '#d29922'
  return '#f85149'
})
const agingClass = computed(() => {
  const r = rhoClamp.value
  if (r > 0.9) return 'aging-good'
  if (r > 0.7) return 'aging-warn'
  return 'aging-bad'
})
const agingLabel = computed(() => {
  const r = rhoClamp.value
  if (r > 0.9) return '✓ CQI 可信，AMC 有效'
  if (r > 0.7) return '⚠ CQI 开始老化，建议缩短周期'
  return '✗ CQI 严重老化，AMC 失效'
})
const scenarioLabel = computed(() => scenarioParams[scenario.value].label)

// ── CSI-RS 资源格逻辑 ────────────────────────────────────
// 端口 → (sym_offset, sc_offset) 列表（简化 Type 1 单面板）
const csiRsPositions = computed(() => {
  const patterns: Record<number, [number, number][]> = {
    1: [[8, 4]],
    2: [[8, 4], [8, 5]],
    4: [[8, 4], [8, 5], [10, 4], [10, 5]],
    8: [[8, 4],[8, 5],[8, 6],[8, 7],[10, 4],[10, 5],[10, 6],[10, 7]],
  }
  return patterns[nPorts.value] ?? patterns[4]
})

function isCsiRsRe(sc: number, sym: number): boolean {
  return csiRsPositions.value.some(([s, c]) => s === sym && c % 12 === sc % 12)
}

function getPortIdx(sc: number, sym: number): number {
  return csiRsPositions.value.findIndex(([s, c]) => s === sym && c % 12 === sc % 12)
}

function getCellColor(sc: number, sym: number): string {
  if (isCsiRsRe(sc, sym)) {
    const portColors = ['#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#39d353','#ff9f43','#a29bfe']
    const idx = getPortIdx(sc, sym)
    return portColors[idx % portColors.length]
  }
  if (sym === 3 || sym === 11) return '#3fb950'  // DMRS
  return 'var(--vp-c-bg)'
}

function getCellOpacity(sc: number, sym: number): number {
  if (isCsiRsRe(sc, sym)) return 0.9
  if (sym === 3 || sym === 11) return 0.35
  return 0.6
}
</script>

<style scoped>
.csi-root {
  font-family: var(--vp-font-family-mono, monospace);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 16px;
  margin: 24px 0;
  color: var(--vp-c-text-1);
}

.csi-header { margin-bottom: 14px; }
.csi-title { font-size: 15px; font-weight: 700; color: var(--vp-c-brand); display: block; }
.csi-sub { font-size: 11px; color: var(--vp-c-text-2); }

/* Controls */
.csi-controls {
  display: flex; gap: 16px; flex-wrap: wrap;
  margin-bottom: 16px; padding: 10px 12px;
  background: var(--vp-c-bg); border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
}
.ctrl-group { display: flex; align-items: center; gap: 8px; }
.ctrl-group label { font-size: 11px; color: var(--vp-c-text-2); white-space: nowrap; }
.ctrl-group input[type=range] { width: 100px; accent-color: var(--vp-c-brand); }
.ctrl-group select {
  font-size: 11px; background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1); border: 1px solid var(--vp-c-divider);
  border-radius: 4px; padding: 2px 6px;
}
.ctrl-val { font-size: 12px; color: var(--vp-c-brand); min-width: 52px; }

/* Main 3-col */
.csi-main {
  display: grid;
  grid-template-columns: 190px 1fr 210px;
  gap: 12px;
  align-items: start;
}

.csi-panel {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 12px;
}
.panel-title {
  font-size: 11px; font-weight: 700;
  color: var(--vp-c-text-2); margin-bottom: 10px;
  letter-spacing: 0.05em; text-transform: uppercase;
}

/* Resource grid SVG */
.rg-svg { width: 100%; height: auto; }
.rg-legend { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.leg-item { display: flex; align-items: center; gap: 4px; font-size: 9px; color: var(--vp-c-text-2); }
.leg-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }

/* Metric cards */
.metric-card {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px; padding: 10px; margin-bottom: 8px;
}
.metric-card.card-danger { border-color: #f85149; }
.metric-card.half { flex: 1; }
.metric-row { display: flex; gap: 8px; }

.metric-head {
  display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px;
}
.metric-label {
  font-size: 11px; font-weight: 700; color: var(--vp-c-text-2);
  min-width: 28px;
}
.metric-value { font-size: 20px; font-weight: 700; color: var(--vp-c-brand); }
.metric-unit { font-size: 11px; color: var(--vp-c-text-2); }
.metric-detail { font-size: 10px; color: var(--vp-c-text-2); margin-top: 4px; }

.metric-bar-wrap {
  height: 6px; background: var(--vp-c-divider); border-radius: 3px; overflow: hidden;
}
.metric-bar { height: 100%; border-radius: 3px; transition: width 0.3s, background 0.3s; }

/* RI layers */
.ri-layers { display: flex; gap: 4px; flex-wrap: wrap; margin: 6px 0; }
.ri-layer-box {
  display: flex; flex-direction: column; align-items: center;
  padding: 4px 8px; border-radius: 4px; font-size: 10px;
  border: 1px solid var(--vp-c-divider);
}
.ri-layer-box.active { background: rgba(88,166,255,0.12); border-color: #58a6ff; }
.ri-layer-box.inactive { opacity: 0.4; }
.sinr-tag { font-size: 9px; color: var(--vp-c-brand); margin-top: 2px; }
.sinr-tag.muted { color: var(--vp-c-text-3); }

/* W matrix */
.w-matrix { margin-top: 8px; }
.w-label { font-size: 9px; color: var(--vp-c-text-2); display: block; margin-bottom: 3px; }
.w-grid { display: inline-flex; flex-direction: column; gap: 2px; }
.w-row { display: flex; gap: 2px; }
.w-cell {
  width: 22px; height: 18px; font-size: 10px;
  display: flex; align-items: center; justify-content: center;
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 2px;
}

/* Aging card */
.aging-card {
  border-radius: 6px; padding: 10px;
  margin-bottom: 8px; border: 1px solid var(--vp-c-divider);
}
.aging-good { background: rgba(63,185,80,0.08); border-color: #3fb950; }
.aging-warn { background: rgba(210,153,34,0.08); border-color: #d29922; }
.aging-bad  { background: rgba(248,81,73,0.08);  border-color: #f85149; }
.aging-head { font-size: 10px; font-weight: 700; color: var(--vp-c-text-2); margin-bottom: 4px; }
.aging-rho  { font-size: 22px; font-weight: 700; color: var(--vp-c-brand); margin: 4px 0; }
.aging-bar-wrap { height: 5px; background: var(--vp-c-divider); border-radius: 3px; overflow: hidden; margin-bottom: 5px; }
.aging-bar { height: 100%; border-radius: 3px; transition: all 0.3s; }
.aging-label { font-size: 10px; font-weight: 600; margin-bottom: 4px; }
.aging-detail { font-size: 9px; color: var(--vp-c-text-2); line-height: 1.6; }

/* AMC flow */
.amc-card {
  background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider);
  border-radius: 6px; padding: 10px; margin-bottom: 8px;
}
.amc-title { font-size: 10px; font-weight: 700; color: var(--vp-c-text-2); margin-bottom: 8px; }
.amc-flow  { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.amc-step  {
  display: flex; flex-direction: column; align-items: center;
  padding: 6px 8px; background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider); border-radius: 5px;
  font-size: 10px; gap: 2px; flex: 1;
}
.amc-step.warn { border-color: #f85149; }
.amc-icon { font-size: 14px; }
.amc-note { font-size: 9px; color: var(--vp-c-text-2); }
.amc-arrow { color: var(--vp-c-text-3); font-size: 14px; }
.amc-warn {
  font-size: 9px; color: #d29922; margin-top: 6px;
  padding: 4px 6px; background: rgba(210,153,34,0.08);
  border-radius: 4px;
}
.amc-ntn {
  font-size: 9px; color: #bc8cff; margin-top: 4px;
  padding: 4px 6px; background: rgba(188,140,255,0.08);
  border-radius: 4px;
}

/* OLLA */
.olla-card {
  background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider);
  border-radius: 6px; padding: 10px;
}
.olla-title { font-size: 10px; font-weight: 700; color: var(--vp-c-text-2); margin-bottom: 6px; }
.olla-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 10px; padding: 3px 0;
  border-bottom: 1px solid var(--vp-c-divider);
}
.olla-row:last-child { border: none; }
.olla-val { font-weight: 600; }

/* Formula bar */
.csi-formula {
  margin-top: 12px; padding: 8px 12px;
  background: var(--vp-c-bg); border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  font-size: 10px; display: flex; align-items: center; gap: 8px;
}
.formula-label {
  font-weight: 700; color: var(--vp-c-brand);
  white-space: nowrap;
}
.formula-text { color: var(--vp-c-text-2); font-style: italic; }

@media (max-width: 768px) {
  .csi-main { grid-template-columns: 1fr; }
  .csi-controls { flex-direction: column; }
}
</style>
