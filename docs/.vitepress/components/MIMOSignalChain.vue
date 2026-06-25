<template>
  <div class="msc-wrap">
    <div class="msc-header">
      <span class="msc-title">MIMO 信号链路交互演示</span>
      <span class="msc-spec">3GPP TS 38.211 §7.3.1</span>
    </div>

    <div class="msc-controls">
      <div class="ctrl-group">
        <div class="ctrl-label">层数 ν（空间流数）</div>
        <div class="btn-row">
          <button v-for="n in [1,2,4,8]" :key="n"
                  :class="['cbtn',{active:nu===n,disabled:n>nPorts}]"
                  @click="n<=nPorts && (nu=n)">{{ n }}层</button>
        </div>
      </div>
      <div class="ctrl-group">
        <div class="ctrl-label">天线端口数 p</div>
        <div class="btn-row">
          <button v-for="p in [1,2,4,8]" :key="p"
                  :class="['cbtn',{active:nPorts===p}]"
                  @click="nPorts=p; if(nu>p) nu=p">{{ p }}端口</button>
        </div>
      </div>
      <div class="ctrl-group">
        <div class="ctrl-label">工作模式</div>
        <div class="btn-row">
          <button :class="['cbtn',{active:mode==='sm'}]" @click="mode='sm'">空间复用</button>
          <button :class="['cbtn',{active:mode==='td'}]" @click="mode='td'; nu=1">发射分集</button>
          <button :class="['cbtn',{active:mode==='bf'}]" @click="mode='bf'; nu=1">波束成形</button>
        </div>
      </div>
    </div>

    <!-- 信号链路图 -->
    <div class="chain-diagram">

      <!-- Step 1: QAM 符号 -->
      <div class="chain-block input-block">
        <div class="cb-title">QAM 符号</div>
        <div class="cb-body">
          <div v-for="i in Math.min(nu*4,8)" :key="i"
               class="sym-dot" :style="{background: layerColor(Math.floor((i-1)/4))}">
          </div>
          <div v-if="nu*4>8" class="sym-more">…</div>
        </div>
        <div class="cb-eq">d(0)…d(M-1)</div>
      </div>

      <div class="chain-arrow">
        <div class="ca-label">层映射</div>
        <div class="ca-body">→</div>
        <div class="ca-eq">x^(i)(k)=d(i+kν)</div>
      </div>

      <!-- Step 2: 层 -->
      <div class="chain-block layer-block">
        <div class="cb-title">{{ nu }} 个层</div>
        <div class="cb-body layers">
          <div v-for="i in nu" :key="i" class="layer-row"
               :style="{background: layerColor(i-1)+'22', borderColor: layerColor(i-1)}">
            <span class="lr-label">层{{ i-1 }}</span>
            <div class="lr-syms">
              <div v-for="j in 3" :key="j" class="lr-sym"
                   :style="{background: layerColor(i-1)}"></div>
            </div>
          </div>
        </div>
        <div class="cb-eq">shape: (ν, M/ν)</div>
      </div>

      <div class="chain-arrow">
        <div class="ca-label">预编码 W</div>
        <div class="ca-body">→</div>
        <div class="ca-eq">y=Wx ({{ nPorts }}×{{ nu }})</div>
      </div>

      <!-- Step 3: 天线端口 -->
      <div class="chain-block port-block">
        <div class="cb-title">{{ nPorts }} 个天线端口</div>
        <div class="cb-body ports">
          <div v-for="p in nPorts" :key="p" class="port-row">
            <div class="port-icon">📡</div>
            <span class="port-label">端口{{ p-1 }}</span>
            <div class="port-bar">
              <div v-for="i in nu" :key="i" class="port-seg"
                   :style="{flex: Math.abs(wMatrix[p-1]?.[i-1] ?? 0).toFixed(1),
                             background: layerColor(i-1), opacity: 0.7+0.3*Math.abs(wMatrix[p-1]?.[i-1] ?? 0)}">
              </div>
            </div>
          </div>
        </div>
        <div class="cb-eq">y^(p), p=0…{{ nPorts-1 }}</div>
      </div>

      <div class="chain-arrow">
        <div class="ca-label">IFFT + CP</div>
        <div class="ca-body">→</div>
        <div class="ca-eq">38.211 §5.3</div>
      </div>

      <!-- Step 4: 发射 -->
      <div class="chain-block tx-block">
        <div class="cb-title">发射</div>
        <div class="cb-body tx">
          <div v-for="p in nPorts" :key="p" class="tx-wave">
            <svg viewBox="0 0 40 20" class="wave-svg">
              <polyline :points="wavePoints(p)" fill="none"
                        :stroke="portColor(p-1)" stroke-width="1.5"/>
            </svg>
          </div>
        </div>
        <div class="cb-eq">{{ nPorts }} 路独立 OFDM</div>
      </div>

    </div>

    <!-- W 矩阵展示 -->
    <div class="matrix-section">
      <div class="mat-title">
        预编码矩阵 W（{{ nPorts }}×{{ nu }}）
        <span class="mat-mode">{{ modeLabel }}</span>
      </div>
      <div class="mat-body">
        <div class="mat-row" v-for="(row, i) in wMatrix" :key="i">
          <span class="mat-idx">端口{{ i }}</span>
          <div class="mat-cells">
            <div class="mat-cell" v-for="(val, j) in row" :key="j"
                 :style="{background: layerColor(j)+'33',
                          borderColor: layerColor(j),
                          opacity: 0.5 + 0.5*Math.abs(val)}">
              {{ formatComplex(val) }}
            </div>
          </div>
        </div>
        <div class="mat-note">每列对应一个层 → 天线端口的映射权重</div>
      </div>
    </div>

    <!-- 性能指标卡片 -->
    <div class="perf-cards">
      <div class="pc" v-for="c in perfCards" :key="c.label">
        <div class="pc-label">{{ c.label }}</div>
        <div class="pc-val" :style="{color:c.color}">{{ c.value }}</div>
        <div class="pc-desc">{{ c.desc }}</div>
      </div>
    </div>

    <!-- 模式说明 -->
    <div class="mode-explain" :class="mode">
      <span class="me-icon">{{ modeIcon }}</span>
      <span class="me-text">{{ modeExplain }}</span>
    </div>

    <div class="msc-hint">调整层数、端口数和工作模式，观察预编码矩阵 W 和信号链路的变化</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const nu     = ref(2)
const nPorts = ref(4)
const mode   = ref<'sm'|'td'|'bf'>('sm')

const LAYER_COLORS = ['#58a6ff','#3fb950','#ffa657','#d2a8ff',
                      '#ff7b72','#79c0ff','#e3b341','#8b949e']

const layerColor  = (i: number) => LAYER_COLORS[i % LAYER_COLORS.length]
const portColor   = (i: number) => LAYER_COLORS[i % LAYER_COLORS.length]

// 构建预编码矩阵 W（简化 DFT 码本）
const wMatrix = computed(() => {
  const p = nPorts.value, v = nu.value
  const W: number[][] = []
  for (let row = 0; row < p; row++) {
    W.push([])
    for (let col = 0; col < v; col++) {
      if (mode.value === 'sm') {
        // DFT 码本：等间隔指向
        const angle = 2 * Math.PI * col * row / p
        W[row].push(Math.cos(angle) / Math.sqrt(p))
      } else if (mode.value === 'td') {
        // 发射分集：Alamouti（简化为均等权重）
        W[row].push(row % 2 === 0 ? 1/Math.sqrt(p) : -1/Math.sqrt(p))
      } else {
        // 波束成形：全部端口指向 PMI=0
        W[row].push(1 / Math.sqrt(p))
      }
    }
  }
  return W
})

const formatComplex = (v: number) => {
  const s = v.toFixed(2)
  return s === '-0.00' ? '0.00' : s
}

// 波形（用于 tx-wave 示意图）
function wavePoints(portIdx: number): string {
  const pts = []
  const freq = 1 + portIdx * 0.5
  for (let x = 0; x <= 40; x += 2) {
    const y = 10 + 7 * Math.sin(x / 40 * 2 * Math.PI * freq + portIdx)
    pts.push(`${x},${y}`)
  }
  return pts.join(' ')
}

const modeLabel = computed(() => ({
  sm: '空间复用（Spatial Multiplexing）',
  td: '发射分集（Transmit Diversity）',
  bf: '波束成形（Beamforming）',
}[mode.value]))

const modeIcon = computed(() => ({ sm: '⚡', td: '🛡️', bf: '🎯' }[mode.value]))
const modeExplain = computed(() => ({
  sm: `${nu.value} 个独立数据流并行传输，吞吐量约为 SISO 的 ${nu.value} 倍。要求信道矩阵秩 ≥ ${nu.value}，适合地面富散射信道。`,
  td: `同一数据从 ${nPorts.value} 个端口以不同相位发出（Alamouti 编码），接收端 MRC 合并获得 ${nPorts.value} 分集增益。适合低 SNR / 覆盖边缘。`,
  bf: `所有 ${nPorts.value} 个端口权重相同，能量集中到 PMI=0 方向，阵列增益 = 10log₁₀(${nPorts.value}) = ${(10*Math.log10(nPorts.value)).toFixed(1)}dB。适合 NTN LOS 场景。`,
}[mode.value]))

const perfCards = computed(() => {
  const p = nPorts.value, v = nu.value
  const beamGain = (10 * Math.log10(p)).toFixed(1)
  const divGain  = mode.value === 'td' ? p : 1
  return [
    { label: '空间复用增益', value: mode.value === 'sm' ? `${v}×` : '1×',
      color: mode.value === 'sm' ? '#3fb950' : '#8b949e',
      desc: '相对 SISO 的吞吐量倍数' },
    { label: '波束成形增益', value: mode.value === 'bf' ? `${beamGain}dB` : '0dB',
      color: mode.value === 'bf' ? '#ffa657' : '#8b949e',
      desc: `${p} 端口相干叠加` },
    { label: '分集阶数', value: `${divGain}`,
      color: mode.value === 'td' ? '#58a6ff' : '#8b949e',
      desc: 'BLER 改善阶数' },
    { label: 'DMRS 端口数', value: `${v}`,
      color: '#d2a8ff',
      desc: '等于层数（UE 估计等效信道）' },
  ]
})
</script>

<style scoped>
.msc-wrap{border:1px solid var(--vp-c-divider);border-radius:12px;padding:20px;margin:20px 0;background:var(--vp-c-bg-soft);font-size:13px}
.msc-header{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.msc-title{font-size:15px;font-weight:600;color:var(--vp-c-text-1)}
.msc-spec{font-size:11px;padding:2px 8px;border-radius:20px;background:var(--vp-c-brand-soft);color:var(--vp-c-brand-1)}
.msc-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
.ctrl-group{display:flex;flex-direction:column;gap:5px}
.ctrl-label{font-size:12px;color:var(--vp-c-text-2);font-weight:500}
.btn-row{display:flex;gap:6px;flex-wrap:wrap}
.cbtn{padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;border:1.5px solid var(--vp-c-divider);background:var(--vp-c-bg);color:var(--vp-c-text-2);transition:all .15s}
.cbtn:hover:not(.disabled){border-color:var(--vp-c-brand-1);color:var(--vp-c-brand-1)}
.cbtn.active{background:var(--vp-c-brand-1);border-color:var(--vp-c-brand-1);color:#fff}
.cbtn.disabled{opacity:.35;cursor:not-allowed}

/* 信号链路图 */
.chain-diagram{display:flex;align-items:stretch;gap:6px;margin-bottom:14px;overflow-x:auto;padding-bottom:4px}
.chain-block{background:var(--vp-c-bg);border:1px solid var(--vp-c-divider);border-radius:8px;padding:10px 12px;min-width:110px;display:flex;flex-direction:column;gap:6px}
.chain-block.input-block{border-color:#58a6ff}
.chain-block.layer-block{border-color:#3fb950;min-width:140px}
.chain-block.port-block{border-color:#ffa657;min-width:160px}
.chain-block.tx-block{border-color:#d2a8ff}
.cb-title{font-size:11.5px;font-weight:600;color:var(--vp-c-text-1)}
.cb-body{flex:1}
.cb-eq{font-family:var(--vp-font-family-mono);font-size:9.5px;color:var(--vp-c-text-3)}

.chain-arrow{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex-shrink:0;padding:0 4px}
.ca-label{font-size:10px;font-weight:600;color:var(--vp-c-brand-1);white-space:nowrap}
.ca-body{font-size:20px;color:var(--vp-c-brand-1);line-height:1}
.ca-eq{font-size:9px;color:var(--vp-c-text-3);text-align:center;max-width:70px}

/* 符号点 */
.sym-dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin:2px}
.sym-more{font-size:10px;color:var(--vp-c-text-3)}

/* 层行 */
.layers{display:flex;flex-direction:column;gap:4px}
.layer-row{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;border:1px solid}
.lr-label{font-size:10px;font-family:var(--vp-font-family-mono);flex-shrink:0;width:28px}
.lr-syms{display:flex;gap:3px}
.lr-sym{width:8px;height:8px;border-radius:2px}

/* 端口行 */
.ports{display:flex;flex-direction:column;gap:4px}
.port-row{display:flex;align-items:center;gap:5px}
.port-icon{font-size:12px}
.port-label{font-size:9.5px;font-family:var(--vp-font-family-mono);width:36px;flex-shrink:0}
.port-bar{flex:1;height:12px;background:var(--vp-c-bg-elv);border-radius:2px;display:flex;overflow:hidden}
.port-seg{height:100%;min-width:4px;transition:flex .3s}

/* 发射波形 */
.tx{display:flex;flex-direction:column;gap:3px}
.tx-wave{height:22px}
.wave-svg{width:100%;height:100%}

/* W 矩阵 */
.matrix-section{background:var(--vp-c-bg);border:1px solid var(--vp-c-divider);border-radius:8px;padding:12px 14px;margin-bottom:12px}
.mat-title{font-size:12px;font-weight:500;color:var(--vp-c-text-2);margin-bottom:8px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px}
.mat-mode{font-size:11px;color:var(--vp-c-brand-1);font-weight:400}
.mat-body{display:flex;flex-direction:column;gap:4px}
.mat-row{display:flex;align-items:center;gap:8px}
.mat-idx{font-size:10px;color:var(--vp-c-text-3);font-family:var(--vp-font-family-mono);width:36px;flex-shrink:0}
.mat-cells{display:flex;gap:4px;flex-wrap:wrap}
.mat-cell{padding:3px 8px;border-radius:4px;border:1px solid;font-family:var(--vp-font-family-mono);font-size:11px;transition:all .3s}
.mat-note{font-size:10.5px;color:var(--vp-c-text-3);margin-top:4px}

/* 性能卡片 */
.perf-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:12px}
.pc{background:var(--vp-c-bg);border:1px solid var(--vp-c-divider);border-radius:8px;padding:8px 10px}
.pc-label{font-size:10.5px;color:var(--vp-c-text-3);margin-bottom:3px}
.pc-val{font-size:20px;font-weight:700;font-family:var(--vp-font-family-mono);line-height:1.2}
.pc-desc{font-size:10px;color:var(--vp-c-text-3)}

/* 模式说明 */
.mode-explain{display:flex;gap:8px;align-items:flex-start;border-radius:8px;padding:9px 13px;margin-bottom:8px;border:1px solid;font-size:12.5px;line-height:1.6}
.mode-explain.sm{background:#e6f4ea;border-color:#a8d5b0;color:#1a5c2a}
.mode-explain.td{background:#eff6ff;border-color:#93c5fd;color:#1e40af}
.mode-explain.bf{background:#fff8ee;border-color:#fcd34d;color:#92400e}
.me-icon{font-size:16px;flex-shrink:0}

.msc-hint{font-size:11.5px;color:var(--vp-c-text-3);text-align:center}
</style>
