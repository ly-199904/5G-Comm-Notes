<template>
  <div class="cqi-root">
    <div class="cqi-header">
      <span class="cqi-title">CQI 表格浏览器</span>
      <span class="cqi-sub">38.214 Table 5.2.2.1-2/3/4 · 点击任意行查看详细性能曲线</span>
    </div>

    <div class="cqi-controls">
      <div class="ctrl-group">
        <label>CQI 表</label>
        <div class="btn-group">
          <button v-for="t in [1,2,3]" :key="t"
            :class="['ctrl-btn', {active: tableIdx===t}]"
            @click="tableIdx=t; selectedCqi=-1">
            Table {{ t }}{{ t===1?' (64QAM)' : t===2?' (256QAM)' : ' (64QAM·低SE)' }}
          </button>
        </div>
      </div>
      <div class="ctrl-group">
        <label>对比 CQI</label>
        <select v-model.number="cmpCqi">
          <option :value="-1">不对比</option>
          <option v-for="r in activeTable" :key="'cmp'+r.cqi" :value="r.cqi">CQI {{ r.cqi }}</option>
        </select>
      </div>
    </div>

    <div class="cqi-main">
      <!-- 左：CQI 表格 -->
      <div class="table-wrap">
        <table class="cqi-table">
          <thead>
            <tr>
              <th>CQI</th>
              <th>调制</th>
              <th>码率 ×1024</th>
              <th>效率 (bit/RE)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in activeTable" :key="row.cqi"
              :class="{
                selected: selectedCqi===row.cqi,
                compare: cmpCqi===row.cqi && selectedCqi!==row.cqi,
                'cqi-zero': row.cqi===0
              }"
              @click="row.cqi===0 ? null : selectedCqi=row.cqi">
              <td class="cqi-num">
                <span class="cqi-badge" :style="{background: cqiColor(row.cqi)}">
                  {{ row.cqi }}
                </span>
              </td>
              <td>
                <span class="mod-tag" :style="{background: modColor(row.mod)}">
                  {{ row.mod }}
                </span>
              </td>
              <td class="num-cell">{{ row.codeRate }}</td>
              <td class="num-cell">
                <span :style="{color: seColor(row.se)}">{{ row.se.toFixed(4) }}</span>
                <div class="se-bar" :style="{width: (row.se/maxSE*80)+'px', background: seColor(row.se)}"/>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 右：性能可视化 -->
      <div class="chart-panel">
        <div v-if="selectedCqi < 0" class="empty-hint">
          ← 点击左侧 CQI 行查看性能曲线
        </div>
        <div v-else>
          <div class="chart-title">
            CQI {{ selectedCqi }} 性能分析
            <span v-if="cmpCqi>=0 && cmpCqi!==selectedCqi" class="cmp-label">vs CQI {{ cmpCqi }}</span>
          </div>

          <!-- BLER vs SNR 折线图 -->
          <div class="chart-subtitle">BLER vs SNR（AWGN）</div>
          <svg viewBox="0 0 280 160" class="bler-svg">
            <!-- 轴 -->
            <line x1="35" y1="10" x2="35" y2="140" stroke="var(--vp-c-divider)" stroke-width="1"/>
            <line x1="35" y1="140" x2="275" y2="140" stroke="var(--vp-c-divider)" stroke-width="1"/>
            <!-- 网格线 -->
            <g v-for="(v, i) in [0,1,2]" :key="'gy'+i">
              <line :x1="35" :y1="30+i*36" :x2="275" :y2="30+i*36"
                    stroke="var(--vp-c-divider)" stroke-width="0.5" stroke-dasharray="3 3"/>
              <text x="32" :y="30+i*36+4" text-anchor="end" font-size="8" fill="var(--vp-c-text-3)">
                {{ ['0.1','0.01','0.001'][i] }}
              </text>
            </g>
            <!-- X 轴刻度 -->
            <g v-for="(snr, i) in snrAxis" :key="'gx'+i">
              <text :x="snrToX(snr)" y="152" text-anchor="middle" font-size="8" fill="var(--vp-c-text-3)">
                {{ snr }}
              </text>
            </g>
            <text x="155" y="162" text-anchor="middle" font-size="8" fill="var(--vp-c-text-3)">SNR (dB)</text>
            <text x="6" y="80" font-size="8" fill="var(--vp-c-text-3)" transform="rotate(-90,6,80)">BLER</text>

            <!-- 10% BLER 参考线 -->
            <line x1="35" y1="30" x2="275" y2="30"
                  stroke="#3fb950" stroke-width="0.8" stroke-dasharray="4 3" opacity="0.6"/>
            <text x="38" y="27" font-size="8" fill="#3fb950">10% BLER</text>

            <!-- 对比曲线 -->
            <polyline v-if="cmpCqi>=0 && cmpCqi!==selectedCqi"
                      :points="blerCurvePoints(cmpCqi)"
                      fill="none" stroke="var(--vp-c-text-3)" stroke-width="1.5"
                      stroke-dasharray="5 3" opacity="0.6"/>

            <!-- 主曲线 -->
            <polyline :points="blerCurvePoints(selectedCqi)"
                      fill="none" stroke="#58a6ff" stroke-width="2"/>

            <!-- 工作点标注 -->
            <g v-if="workingPoint">
              <circle :cx="snrToX(workingPoint.snr)" :cy="blerToY(0.1)"
                      r="4" fill="#d29922" opacity="0.9"/>
              <line :x1="snrToX(workingPoint.snr)" :y1="blerToY(0.1)"
                    :x2="snrToX(workingPoint.snr)" :y2="140"
                    stroke="#d29922" stroke-width="1" stroke-dasharray="3 3"/>
              <text :x="snrToX(workingPoint.snr)+4" :y="blerToY(0.1)-5"
                    font-size="8" fill="#d29922">{{ workingPoint.snr }}dB</text>
            </g>
          </svg>

          <!-- 参数卡片 -->
          <div class="param-cards">
            <div class="param-card">
              <div class="pc-label">调制阶数</div>
              <div class="pc-val" :style="{color: modColor(selectedRow?.mod||'')}">
                {{ selectedRow?.mod }}
              </div>
            </div>
            <div class="param-card">
              <div class="pc-label">码率</div>
              <div class="pc-val">{{ selectedRow?.codeRate }}/1024</div>
              <div class="pc-sub">= {{ ((selectedRow?.codeRate||0)/1024).toFixed(3) }}</div>
            </div>
            <div class="param-card">
              <div class="pc-label">频谱效率</div>
              <div class="pc-val" :style="{color: seColor(selectedRow?.se||0)}">
                {{ selectedRow?.se.toFixed(4) }}
              </div>
              <div class="pc-sub">bit/RE</div>
            </div>
            <div class="param-card">
              <div class="pc-label">10% BLER SNR</div>
              <div class="pc-val" style="color:#d29922">
                ≈ {{ workingPoint?.snr }} dB
              </div>
            </div>
          </div>

          <!-- 与对比 CQI 的差异 -->
          <div v-if="cmpCqi>=0 && cmpCqi!==selectedCqi" class="diff-row">
            <span class="diff-label">vs CQI {{ cmpCqi }}</span>
            <span :style="{color: diffSE>0 ? '#3fb950' : '#f85149'}">
              SE {{ diffSE>0?'+':'' }}{{ diffSE.toFixed(4) }} bit/RE
            </span>
            <span :style="{color: diffSnr>0 ? '#f85149' : '#3fb950'}">
              SNR {{ diffSnr>0?'+':'' }}{{ diffSnr.toFixed(1) }} dB
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="cqi-note">
      CQI 0 = 信道质量过差，不发送任何数据。CQI 1~15 分别对应不同调制方式和码率组合。
      Table 1 适用于常规场景（最高 64QAM），Table 2 适用于高信噪比场景（最高 256QAM），
      Table 3 为 URLLC 低码率配置。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const tableIdx = ref(1)
const selectedCqi = ref(-1)
const cmpCqi = ref(-1)

// CQI 表数据（38.214 Table 5.2.2.1-2/3/4）
const tables: Record<number, {cqi:number,mod:string,codeRate:number,se:number}[]> = {
  1: [
    {cqi:0,mod:'—',codeRate:0,se:0},
    {cqi:1,mod:'QPSK',codeRate:78,se:0.1523},
    {cqi:2,mod:'QPSK',codeRate:120,se:0.2344},
    {cqi:3,mod:'QPSK',codeRate:193,se:0.3770},
    {cqi:4,mod:'QPSK',codeRate:308,se:0.6016},
    {cqi:5,mod:'QPSK',codeRate:449,se:0.8770},
    {cqi:6,mod:'QPSK',codeRate:602,se:1.1758},
    {cqi:7,mod:'16QAM',codeRate:378,se:1.4766},
    {cqi:8,mod:'16QAM',codeRate:490,se:1.9141},
    {cqi:9,mod:'16QAM',codeRate:616,se:2.4063},
    {cqi:10,mod:'64QAM',codeRate:466,se:2.7305},
    {cqi:11,mod:'64QAM',codeRate:567,se:3.3223},
    {cqi:12,mod:'64QAM',codeRate:666,se:3.9023},
    {cqi:13,mod:'64QAM',codeRate:772,se:4.5234},
    {cqi:14,mod:'64QAM',codeRate:873,se:5.1152},
    {cqi:15,mod:'64QAM',codeRate:948,se:5.5547},
  ],
  2: [
    {cqi:0,mod:'—',codeRate:0,se:0},
    {cqi:1,mod:'QPSK',codeRate:78,se:0.1523},
    {cqi:2,mod:'QPSK',codeRate:193,se:0.3770},
    {cqi:3,mod:'QPSK',codeRate:449,se:0.8770},
    {cqi:4,mod:'16QAM',codeRate:378,se:1.4766},
    {cqi:5,mod:'16QAM',codeRate:490,se:1.9141},
    {cqi:6,mod:'16QAM',codeRate:616,se:2.4063},
    {cqi:7,mod:'64QAM',codeRate:466,se:2.7305},
    {cqi:8,mod:'64QAM',codeRate:567,se:3.3223},
    {cqi:9,mod:'64QAM',codeRate:666,se:3.9023},
    {cqi:10,mod:'64QAM',codeRate:772,se:4.5234},
    {cqi:11,mod:'64QAM',codeRate:873,se:5.1152},
    {cqi:12,mod:'256QAM',codeRate:711,se:5.5547},
    {cqi:13,mod:'256QAM',codeRate:797,se:6.2266},
    {cqi:14,mod:'256QAM',codeRate:885,se:6.9141},
    {cqi:15,mod:'256QAM',codeRate:948,se:7.4063},
  ],
  3: [
    {cqi:0,mod:'—',codeRate:0,se:0},
    {cqi:1,mod:'QPSK',codeRate:30,se:0.0586},
    {cqi:2,mod:'QPSK',codeRate:50,se:0.0977},
    {cqi:3,mod:'QPSK',codeRate:78,se:0.1523},
    {cqi:4,mod:'QPSK',codeRate:120,se:0.2344},
    {cqi:5,mod:'QPSK',codeRate:193,se:0.3770},
    {cqi:6,mod:'QPSK',codeRate:308,se:0.6016},
    {cqi:7,mod:'QPSK',codeRate:449,se:0.8770},
    {cqi:8,mod:'QPSK',codeRate:602,se:1.1758},
    {cqi:9,mod:'16QAM',codeRate:378,se:1.4766},
    {cqi:10,mod:'16QAM',codeRate:490,se:1.9141},
    {cqi:11,mod:'16QAM',codeRate:616,se:2.4063},
    {cqi:12,mod:'64QAM',codeRate:466,se:2.7305},
    {cqi:13,mod:'64QAM',codeRate:567,se:3.3223},
    {cqi:14,mod:'64QAM',codeRate:666,se:3.9023},
    {cqi:15,mod:'64QAM',codeRate:772,se:4.5234},
  ]
}

const activeTable = computed(() => tables[tableIdx.value])
const maxSE = computed(() => Math.max(...activeTable.value.map(r => r.se)))

const selectedRow = computed(() => activeTable.value.find(r => r.cqi === selectedCqi.value))
const cmpRow = computed(() => activeTable.value.find(r => r.cqi === cmpCqi.value))

function cqiColor(cqi: number) {
  if (cqi === 0) return '#555'
  const t = (cqi - 1) / 14
  const r = Math.round(248 * t + 88 * (1 - t))
  const g = Math.round(81 * t + 166 * (1 - t))
  const b = Math.round(73 * t + 255 * (1 - t))
  return `rgb(${r},${g},${b})`
}
function modColor(mod: string) {
  return mod === 'QPSK' ? '#58a6ff' : mod === '16QAM' ? '#3fb950' : mod === '64QAM' ? '#d29922' : mod === '256QAM' ? '#f85149' : '#888'
}
function seColor(se: number) {
  const t = se / maxSE.value
  return t > 0.7 ? '#3fb950' : t > 0.4 ? '#d29922' : '#58a6ff'
}

// SNR 轴范围（根据选中的 CQI 动态调整）
const snrAxis = [-5, 0, 5, 10, 15, 20, 25, 30]

function snrToX(snr: number) { return 35 + ((snr + 5) / 35) * 240 }
function blerToY(bler: number) {
  // 对数坐标：BLER 0.5 → y=10, BLER 0.001 → y=130
  const logB = Math.log10(Math.max(bler, 1e-4))
  return 130 + (logB / (-4)) * 120 - 120
}

// 近似 BLER 曲线（基于 10% BLER 工作点推算）
function snrThreshold(cqi: number): number {
  const row = activeTable.value.find(r => r.cqi === cqi)
  if (!row || row.cqi === 0) return 99
  // 近似：工作 SNR ≈ 10*log10(2^SE - 1) + 噪声修正
  return Math.round(10 * Math.log10(Math.pow(2, row.se) - 1 + 0.5) * 10) / 10
}

function blerCurvePoints(cqi: number): string {
  const snr0 = snrThreshold(cqi)
  const points: string[] = []
  for (let snr = -5; snr <= 30; snr += 0.5) {
    // sigmoid 近似 BLER 曲线
    const x = (snr - snr0) * 2.5
    const bler = Math.max(1e-4, 0.5 / (1 + Math.exp(x)))
    const px = snrToX(snr)
    const py = blerToY(bler)
    if (py >= 10 && py <= 140) points.push(`${px.toFixed(1)},${py.toFixed(1)}`)
  }
  return points.join(' ')
}

const workingPoint = computed(() => {
  if (selectedCqi.value < 1) return null
  return { snr: snrThreshold(selectedCqi.value) }
})

const diffSE = computed(() => {
  if (!selectedRow.value || !cmpRow.value) return 0
  return selectedRow.value.se - cmpRow.value.se
})
const diffSnr = computed(() => {
  if (selectedCqi.value < 1 || cmpCqi.value < 1) return 0
  return snrThreshold(selectedCqi.value) - snrThreshold(cmpCqi.value)
})
</script>

<style scoped>
.cqi-root {
  font-family: var(--vp-font-family-mono, monospace);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px; padding: 16px; margin: 24px 0;
  color: var(--vp-c-text-1);
}
.cqi-header { margin-bottom: 12px; }
.cqi-title { font-size: 15px; font-weight: 700; color: var(--vp-c-brand); display: block; }
.cqi-sub { font-size: 11px; color: var(--vp-c-text-2); }

.cqi-controls {
  display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;
  padding: 10px; background: var(--vp-c-bg);
  border-radius: 6px; border: 1px solid var(--vp-c-divider); align-items: center;
}
.ctrl-group { display: flex; align-items: center; gap: 7px; }
.ctrl-group label { font-size: 11px; color: var(--vp-c-text-2); white-space: nowrap; }
.ctrl-group select {
  font-size: 11px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider); border-radius: 4px; padding: 2px 6px;
}
.btn-group { display: flex; gap: 3px; }
.ctrl-btn {
  padding: 3px 8px; font-size: 11px; border-radius: 4px;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2); cursor: pointer;
}
.ctrl-btn.active { background: var(--vp-c-brand); border-color: var(--vp-c-brand); color: #fff; }

.cqi-main { display: grid; grid-template-columns: 280px 1fr; gap: 14px; align-items: start; }

.table-wrap { overflow-y: auto; max-height: 440px; border-radius: 6px; border: 1px solid var(--vp-c-divider); }
.cqi-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.cqi-table thead th {
  background: var(--vp-c-bg); padding: 6px 8px;
  text-align: left; font-size: 10px; font-weight: 700;
  color: var(--vp-c-text-2); text-transform: uppercase;
  border-bottom: 1px solid var(--vp-c-divider); position: sticky; top: 0;
}
.cqi-table tbody tr {
  cursor: pointer; transition: background 0.1s;
  border-bottom: 1px solid var(--vp-c-divider);
}
.cqi-table tbody tr:hover:not(.cqi-zero) { background: var(--vp-c-bg-soft); }
.cqi-table tbody tr.selected { background: rgba(88,166,255,0.12); }
.cqi-table tbody tr.compare { background: rgba(210,153,34,0.08); }
.cqi-table tbody tr.cqi-zero { opacity: 0.5; cursor: default; }
.cqi-table td { padding: 5px 8px; }
.cqi-num { width: 40px; }
.cqi-badge {
  display: inline-block; width: 22px; height: 22px; border-radius: 4px;
  text-align: center; line-height: 22px; font-size: 10px; font-weight: 700; color: #fff;
}
.mod-tag {
  display: inline-block; padding: 1px 6px; border-radius: 3px;
  font-size: 9px; font-weight: 700; color: #fff;
}
.num-cell { text-align: right; }
.se-bar { height: 3px; border-radius: 2px; margin-top: 2px; }

.chart-panel {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 12px; min-height: 300px;
}
.empty-hint {
  display: flex; align-items: center; justify-content: center;
  height: 200px; color: var(--vp-c-text-3); font-size: 12px;
}
.chart-title {
  font-size: 12px; font-weight: 700; margin-bottom: 8px;
}
.cmp-label { font-size: 10px; color: var(--vp-c-text-3); margin-left: 6px; font-weight: 400; }
.chart-subtitle { font-size: 10px; color: var(--vp-c-text-2); margin-bottom: 4px; }
.bler-svg { width: 100%; height: auto; }

.param-cards { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-top: 10px; }
.param-card {
  background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider);
  border-radius: 6px; padding: 8px; text-align: center;
}
.pc-label { font-size: 9px; color: var(--vp-c-text-3); text-transform: uppercase; margin-bottom: 3px; }
.pc-val { font-size: 14px; font-weight: 700; }
.pc-sub { font-size: 9px; color: var(--vp-c-text-3); }

.diff-row {
  display: flex; gap: 12px; align-items: center; margin-top: 8px;
  padding: 6px 10px; background: var(--vp-c-bg-soft);
  border-radius: 5px; font-size: 11px;
}
.diff-label { color: var(--vp-c-text-2); font-weight: 600; margin-right: 4px; }

.cqi-note {
  margin-top: 12px; font-size: 10px; color: var(--vp-c-text-2);
  line-height: 1.6; padding: 8px 10px;
  background: var(--vp-c-bg); border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
}

@media (max-width: 640px) {
  .cqi-main { grid-template-columns: 1fr; }
  .param-cards { grid-template-columns: repeat(2,1fr); }
  .cqi-controls { flex-direction: column; }
  .ctrl-btn { font-size: 10px; padding: 3px 6px; }
}
</style>
