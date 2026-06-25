<template>
  <div class="cb-root">
    <div class="cb-header">
      <span class="cb-title">Type I 单面板码本浏览器</span>
      <span class="cb-sub">38.214 §5.2.2.2.1 · W = W₁ · W₂ · 点击索引格查看预编码矩阵</span>
    </div>

    <!-- 控制区 -->
    <div class="cb-controls">
      <div class="ctrl-group">
        <label>天线端口数</label>
        <div class="btn-group">
          <button v-for="n in [2,4,8,16]" :key="n"
            :class="['ctrl-btn', {active: nPorts===n}]"
            @click="nPorts=n; selectedI1=-1; selectedI2=-1">
            {{ n }} 端口
          </button>
        </div>
      </div>
      <div class="ctrl-group">
        <label>层数 ν</label>
        <div class="btn-group">
          <button v-for="l in availableLayers" :key="l"
            :class="['ctrl-btn', {active: nLayers===l}]"
            @click="nLayers=l; selectedI1=-1; selectedI2=-1">
            {{ l }} 层
          </button>
        </div>
      </div>
      <div class="ctrl-group">
        <label>O₁ 过采样</label>
        <div class="btn-group">
          <button v-for="o in [2,4,8]" :key="o"
            :class="['ctrl-btn', {active: O1===o}]" @click="O1=o">{{ o }}</button>
        </div>
      </div>
    </div>

    <div class="cb-main">
      <!-- i₁/i₂ 索引网格 -->
      <div class="grid-panel">
        <div class="panel-title">
          i₁ × i₂ 索引网格（{{ i1Range }} × {{ i2Range }}）
        </div>
        <div class="grid-hint">点击格子 → 高亮对应波束方向 + 展示 W 矩阵</div>

        <div class="index-grid" :style="{gridTemplateColumns: `repeat(${i2Range}, 1fr)`}">
          <div v-for="i1 in i1Range" :key="'row'+i1" style="display:contents">
            <div v-for="i2 in i2Range" :key="`cell-${i1}-${i2}`"
              :class="['idx-cell', {
                selected: selectedI1===i1-1 && selectedI2===i2-1,
                hover: hoverI1===i1-1 && hoverI2===i2-1
              }]"
              :style="{background: cellBg(i1-1, i2-1)}"
              @click="selectCell(i1-1, i2-1)"
              @mouseenter="hoverI1=i1-1; hoverI2=i2-1"
              @mouseleave="hoverI1=-1; hoverI2=-1">
              <span class="cell-i1">{{ i1-1 }}</span>
              <span class="cell-i2">{{ i2-1 }}</span>
            </div>
          </div>
        </div>

        <div class="axis-labels">
          <span>← i₂ →</span>
          <span style="writing-mode:vertical-rl; margin-left:4px">↑ i₁</span>
        </div>

        <!-- 颜色说明 -->
        <div class="color-legend">
          <div v-for="(label, ci) in beamGroupLabels" :key="ci" class="cl-item">
            <span class="cl-dot" :style="{background: groupColors[ci]}"/>
            <span>{{ label }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧：波束方向 + W 矩阵 -->
      <div class="detail-panel">
        <!-- 波束方向图（简化极坐标） -->
        <div class="panel-title">波束方向（水平维度）</div>
        <svg viewBox="-130 -130 260 160" class="beam-svg">
          <!-- 半圆网格 -->
          <g v-for="r in [40,80,120]" :key="'gr'+r">
            <path :d="`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`"
                  fill="none" stroke="var(--vp-c-divider)" stroke-width="0.5"/>
          </g>
          <!-- 角度射线 -->
          <g v-for="a in [-90,-60,-30,0,30,60,90]" :key="'ga'+a">
            <line :x1="0" :y1="0"
                  :x2="120*Math.cos((a-90)*Math.PI/180)"
                  :y2="120*Math.sin((a-90)*Math.PI/180)"
                  stroke="var(--vp-c-divider)" stroke-width="0.5"/>
            <text :x="130*Math.cos((a-90)*Math.PI/180)"
                  :y="130*Math.sin((a-90)*Math.PI/180)+3"
                  text-anchor="middle" font-size="9" fill="var(--vp-c-text-3)">{{ a }}°</text>
          </g>

          <!-- 所有码本波束（淡色） -->
          <g v-for="i1 in i1Range" :key="'ab'+i1">
            <line :x1="0" :y1="0"
                  :x2="110*Math.cos((beamAngle(i1-1, 0)-90)*Math.PI/180)"
                  :y2="110*Math.sin((beamAngle(i1-1, 0)-90)*Math.PI/180)"
                  :stroke="groupColors[(i1-1)%groupColors.length]"
                  stroke-width="1" opacity="0.2"/>
          </g>

          <!-- 选中的波束 -->
          <g v-if="selectedI1 >= 0">
            <line x1="0" y1="0"
                  :x2="110*Math.cos((selectedAngle-90)*Math.PI/180)"
                  :y2="110*Math.sin((selectedAngle-90)*Math.PI/180)"
                  stroke="#58a6ff" stroke-width="2.5"/>
            <circle :cx="110*Math.cos((selectedAngle-90)*Math.PI/180)"
                    :cy="110*Math.sin((selectedAngle-90)*Math.PI/180)"
                    r="5" fill="#58a6ff"/>
            <text :x="118*Math.cos((selectedAngle-90)*Math.PI/180)"
                  :y="118*Math.sin((selectedAngle-90)*Math.PI/180)+3"
                  text-anchor="middle" font-size="9" font-weight="700" fill="#58a6ff">
              {{ selectedAngle.toFixed(0) }}°
            </text>
          </g>
          <text x="0" y="25" text-anchor="middle" font-size="9" fill="var(--vp-c-text-3)">
            {{ selectedI1 >= 0 ? `i₁=${selectedI1} i₂=${selectedI2}` : '点击上方网格选择' }}
          </text>
        </svg>

        <!-- W 矩阵展示 -->
        <div v-if="selectedI1 >= 0" class="matrix-panel">
          <div class="panel-title">预编码矩阵 W（{{ nPorts }}×{{ nLayers }}）</div>

          <!-- W1 矩阵 -->
          <div class="matrix-section">
            <div class="mat-label">W₁（宽带，波束选择）</div>
            <div class="mat-wrap">
              <div class="mat-bracket">[</div>
              <div class="mat-rows">
                <div v-for="(row, ri) in W1display" :key="'w1r'+ri" class="mat-row">
                  <span v-for="(val, ci) in row" :key="'w1c'+ci" class="mat-cell"
                    :style="{color: val !== '0' ? '#58a6ff' : 'var(--vp-c-text-3)'}">
                    {{ val }}
                  </span>
                </div>
              </div>
              <div class="mat-bracket">]</div>
            </div>
          </div>

          <!-- W2 向量 -->
          <div class="matrix-section">
            <div class="mat-label">W₂（子带，相位精调）</div>
            <div class="mat-wrap">
              <div class="mat-bracket">[</div>
              <div class="mat-rows">
                <div class="mat-row">
                  <span v-for="(val, ci) in W2display" :key="'w2c'+ci" class="mat-cell"
                    :style="{color: val.includes('j') ? '#d29922' : val !== '0' ? '#3fb950' : 'var(--vp-c-text-3)'}">
                    {{ val }}
                  </span>
                </div>
              </div>
              <div class="mat-bracket">]ᵀ</div>
            </div>
          </div>

          <!-- 公式描述 -->
          <div class="formula-row">
            <span class="formula-key">W = W₁ · W₂</span>
            <span class="formula-desc">
              W₁ 用 i₁ 选择波束组（宽带），W₂ 用 i₂ 在组内精细相位对齐（子带/宽带）
            </span>
          </div>

          <div class="codebook-info">
            <div class="ci-row"><span>波束方向</span><span style="color:#58a6ff">≈ {{ selectedAngle.toFixed(1) }}°</span></div>
            <div class="ci-row"><span>i₁（W₁ 索引）</span><span>{{ selectedI1 }}</span></div>
            <div class="ci-row"><span>i₂（W₂ 索引）</span><span>{{ selectedI2 }}</span></div>
            <div class="ci-row"><span>DFT 波束向量 φ</span>
              <span style="color:#3fb950">e^(j·2π·{{ selectedI1 }}·n/{{ nPorts }})</span></div>
          </div>
        </div>

        <div v-else class="empty-hint">← 点击 i₁/i₂ 索引网格查看预编码矩阵</div>
      </div>
    </div>

    <div class="cb-note">
      Type I 单面板码本基于 DFT（离散傅里叶变换）波束。W₁ 从 {{ i1Range }} 个候选波束中选择一组，
      W₂ 在组内进行 {{ i2Range }} 种相位精调。PMI = (i₁, i₂) 二元组，UE 通过 PUCCH/PUSCH 上报给 gNB。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const nPorts = ref(4)
const nLayers = ref(1)
const O1 = ref(4)
const selectedI1 = ref(-1)
const selectedI2 = ref(-1)
const hoverI1 = ref(-1)
const hoverI2 = ref(-1)

const availableLayers = computed(() => {
  const max = nPorts.value / 2
  return Array.from({length: Math.min(max, 4)}, (_, i) => i + 1)
})

// 码本维度（38.214 Table 5.2.2.2.1-2 简化）
const i1Range = computed(() => {
  const N1 = nPorts.value / 2
  return N1 * O1.value
})
const i2Range = computed(() => nLayers.value === 1 ? 4 : 2)

// 波束方向（DFT 相位对应角度）
function beamAngle(i1: number, _i2: number): number {
  const phi = (i1 / i1Range.value) * 180 - 90
  return phi
}

const selectedAngle = computed(() =>
  selectedI1.value >= 0 ? beamAngle(selectedI1.value, selectedI2.value) : 0)

function selectCell(i1: number, i2: number) {
  if (selectedI1.value === i1 && selectedI2.value === i2) {
    selectedI1.value = -1; selectedI2.value = -1
  } else {
    selectedI1.value = i1; selectedI2.value = i2
  }
}

// 格子背景色（按 i1 分波束组）
const groupColors = ['#58a6ff40','#3fb95040','#d2992240','#f8514940','#bc8cff40','#39d35340']
const beamGroupLabels = computed(() => {
  const size = Math.ceil(i1Range.value / 4)
  return [`组 0 (i₁=0~${size-1})`, `组 1`, `组 2`, `组 3`]
})

function cellBg(i1: number, i2: number): string {
  if (selectedI1.value === i1 && selectedI2.value === i2) return '#58a6ff'
  const grp = Math.floor(i1 / Math.max(1, Math.ceil(i1Range.value / groupColors.length)))
  return groupColors[grp % groupColors.length]
}

// W1 矩阵展示（简化 DFT 块矩阵）
const W1display = computed(() => {
  if (selectedI1.value < 0) return []
  const i1 = selectedI1.value
  const N = nPorts.value
  const rows: string[][] = []
  for (let r = 0; r < N; r++) {
    const row: string[] = []
    for (let c = 0; c < Math.min(4, N); c++) {
      // 简化：对角线 DFT 块
      if (r === c || r === (c + N/2)) {
        const phase = (i1 * r) % 4
        row.push(['1','j','-1','-j'][phase])
      } else {
        row.push('0')
      }
    }
    rows.push(row)
  }
  return rows
})

// W2 向量（相位精调）
const W2display = computed(() => {
  if (selectedI2.value < 0) return []
  const phaseMap: Record<number, string[]> = {
    0: ['1','1','1','1'],
    1: ['1','j','-1','-j'],
    2: ['1','-1','1','-1'],
    3: ['1','-j','-1','j'],
  }
  return (phaseMap[selectedI2.value % 4] || ['1','1','1','1']).slice(0, nPorts.value)
})
</script>

<style scoped>
.cb-root {
  font-family: var(--vp-font-family-mono, monospace);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px; padding: 16px; margin: 24px 0;
  color: var(--vp-c-text-1);
}
.cb-header { margin-bottom: 12px; }
.cb-title { font-size: 15px; font-weight: 700; color: var(--vp-c-brand); display: block; }
.cb-sub { font-size: 11px; color: var(--vp-c-text-2); }

.cb-controls {
  display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;
  padding: 10px; background: var(--vp-c-bg);
  border-radius: 6px; border: 1px solid var(--vp-c-divider); align-items: center;
}
.ctrl-group { display: flex; align-items: center; gap: 7px; }
.ctrl-group label { font-size: 11px; color: var(--vp-c-text-2); white-space: nowrap; }
.btn-group { display: flex; gap: 3px; }
.ctrl-btn {
  padding: 3px 9px; font-size: 11px; border-radius: 4px;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2); cursor: pointer; transition: all 0.15s;
}
.ctrl-btn.active { background: var(--vp-c-brand); border-color: var(--vp-c-brand); color: #fff; }

.cb-main { display: grid; grid-template-columns: 280px 1fr; gap: 16px; align-items: start; }

.grid-panel, .detail-panel {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 12px;
}
.panel-title {
  font-size: 10px; font-weight: 700; color: var(--vp-c-text-2);
  text-transform: uppercase; margin-bottom: 6px;
}
.grid-hint { font-size: 10px; color: var(--vp-c-text-3); margin-bottom: 8px; }

.index-grid {
  display: grid; gap: 2px; max-height: 280px; overflow-y: auto;
}
.idx-cell {
  min-width: 28px; min-height: 26px; border-radius: 3px;
  cursor: pointer; transition: all 0.12s;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; border: 1px solid transparent;
  padding: 1px;
}
.idx-cell:hover { border-color: var(--vp-c-brand); transform: scale(1.08); }
.idx-cell.selected { border-color: #58a6ff; background: #58a6ff !important; }
.cell-i1 { font-size: 8px; color: var(--vp-c-text-2); line-height: 1; }
.cell-i2 { font-size: 9px; font-weight: 700; color: var(--vp-c-text-1); line-height: 1; }
.idx-cell.selected .cell-i1,
.idx-cell.selected .cell-i2 { color: #fff; }

.axis-labels {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 9px; color: var(--vp-c-text-3); margin-top: 4px;
}
.color-legend { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.cl-item { display: flex; align-items: center; gap: 3px; font-size: 9px; color: var(--vp-c-text-3); }
.cl-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }

.beam-svg { width: 100%; max-width: 280px; height: auto; display: block; margin: 0 auto; }

.matrix-panel { margin-top: 12px; }
.matrix-section { margin-bottom: 10px; }
.mat-label { font-size: 9px; color: var(--vp-c-text-3); margin-bottom: 4px; }
.mat-wrap {
  display: flex; align-items: stretch; gap: 2px;
  background: var(--vp-c-bg-soft); border-radius: 4px;
  padding: 6px 8px; border: 1px solid var(--vp-c-divider);
  overflow-x: auto;
}
.mat-bracket { font-size: 28px; color: var(--vp-c-text-2); line-height: 1; align-self: center; }
.mat-rows { display: flex; flex-direction: column; gap: 1px; }
.mat-row { display: flex; gap: 2px; }
.mat-cell {
  min-width: 24px; height: 20px; text-align: center; line-height: 20px;
  font-size: 11px; font-family: var(--vp-font-family-mono); font-weight: 600;
  background: var(--vp-c-bg); border-radius: 2px; border: 1px solid var(--vp-c-divider);
}

.formula-row {
  display: flex; gap: 8px; align-items: flex-start; margin: 8px 0;
  padding: 7px 10px; background: var(--vp-c-bg-soft);
  border-radius: 5px; border: 1px solid var(--vp-c-divider);
}
.formula-key { font-size: 12px; font-weight: 700; color: var(--vp-c-brand); white-space: nowrap; }
.formula-desc { font-size: 10px; color: var(--vp-c-text-2); line-height: 1.6; }

.codebook-info { margin-top: 8px; }
.ci-row {
  display: flex; justify-content: space-between; font-size: 11px;
  padding: 4px 0; border-bottom: 1px solid var(--vp-c-divider);
}
.ci-row:last-child { border: none; }

.empty-hint {
  display: flex; align-items: center; justify-content: center;
  min-height: 120px; color: var(--vp-c-text-3); font-size: 12px;
}

.cb-note {
  margin-top: 12px; font-size: 10px; color: var(--vp-c-text-2);
  line-height: 1.6; padding: 8px 10px;
  background: var(--vp-c-bg); border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
}

@media (max-width: 650px) {
  .cb-main { grid-template-columns: 1fr; }
  .cb-controls { flex-direction: column; }
}
</style>
