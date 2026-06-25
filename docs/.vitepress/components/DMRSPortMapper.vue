<template>
  <div class="dm-root">
    <div class="dm-header">
      <span class="dm-title">DMRS 端口与 CDM 组映射</span>
      <span class="dm-sub">38.211 §7.4.1.1 · Type 1 / Type 2 对比</span>
    </div>

    <!-- 类型切换 -->
    <div class="dm-controls">
      <div class="ctrl-group">
        <label>DMRS 类型</label>
        <div class="btn-group">
          <button :class="['ctrl-btn', {active: dmrsType===1}]" @click="dmrsType=1">Type 1</button>
          <button :class="['ctrl-btn', {active: dmrsType===2}]" @click="dmrsType=2">Type 2</button>
        </div>
      </div>
      <div class="ctrl-group">
        <label>最大端口数</label>
        <div class="btn-group">
          <button v-for="p in maxPortOptions" :key="p"
            :class="['ctrl-btn', {active: maxPorts===p}]" @click="maxPorts=p">{{ p }}端口</button>
        </div>
      </div>
      <div class="ctrl-group">
        <label>高亮端口</label>
        <select v-model.number="highlightPort">
          <option :value="-1">全部显示</option>
          <option v-for="p in availablePorts" :key="p" :value="p">端口 {{ p }}</option>
        </select>
      </div>
    </div>

    <!-- 主区域：资源网格 + 说明 -->
    <div class="dm-main">
      <!-- 资源网格（1 RB × 14 符号） -->
      <div class="grid-wrap">
        <div class="grid-title">1 RB（12 子载波）× 14 OFDM 符号</div>
        <svg :viewBox="`0 0 ${svgW} ${svgH}`" class="grid-svg">
          <!-- 背景格子 -->
          <g v-for="sym in 14" :key="'bg'+sym">
            <rect v-for="sc in 12" :key="'bgr'+sc"
                  :x="scX(sc-1)" :y="symY(sym-1)"
                  :width="cellW-1" :height="cellH-1"
                  fill="var(--vp-c-bg)" stroke="var(--vp-c-divider)"
                  stroke-width="0.4" rx="1"/>
          </g>

          <!-- DMRS RE -->
          <g v-for="re in dmrsREs" :key="`re-${re.sc}-${re.sym}-${re.port}`">
            <rect :x="scX(re.sc)" :y="symY(re.sym)"
                  :width="cellW-1" :height="cellH-1"
                  :fill="portColor(re.port)"
                  :opacity="highlightPort===-1 || highlightPort===re.port ? 0.9 : 0.12"
                  rx="1"/>
            <text :x="scX(re.sc) + (cellW-1)/2"
                  :y="symY(re.sym) + (cellH-1)/2 + 3.5"
                  text-anchor="middle" font-size="7" font-weight="600"
                  :fill="highlightPort===-1 || highlightPort===re.port ? '#fff' : 'transparent'">
              P{{ re.port }}
            </text>
          </g>

          <!-- 轴标签 -->
          <text v-for="sym in [0,2,4,6,8,10,12]" :key="'sl'+sym"
                :x="scX(12)+2" :y="symY(sym)+(cellH-1)/2+3"
                font-size="8" fill="var(--vp-c-text-3)">#{{ sym }}</text>
          <text v-for="sc in [0,3,6,9,11]" :key="'scl'+sc"
                :x="scX(sc)+(cellW-1)/2" :y="svgH-1"
                text-anchor="middle" font-size="8" fill="var(--vp-c-text-3)">{{ sc }}</text>

          <!-- DMRS 符号标注 -->
          <g v-for="sym in dmrsSymbols" :key="'symmark'+sym">
            <line :x1="scX(0)-1" :y1="symY(sym)"
                  :x2="scX(0)-1" :y2="symY(sym)+cellH-1"
                  stroke="var(--vp-c-brand)" stroke-width="2"/>
            <text :x="scX(0)-3" :y="symY(sym)+(cellH-1)/2+3"
                  text-anchor="end" font-size="7" fill="var(--vp-c-brand)">D</text>
          </g>
        </svg>

        <!-- 图例 -->
        <div class="legend">
          <span v-for="p in availablePorts" :key="'leg'+p" class="leg-item">
            <span class="leg-dot" :style="{background: portColor(p),
              opacity: highlightPort===-1 || highlightPort===p ? 1 : 0.25}"/>
            P{{ p }}
          </span>
          <span class="leg-item">
            <span class="leg-dot" style="background:var(--vp-c-bg); border:1px solid var(--vp-c-divider)"/>
            数据 RE
          </span>
        </div>
      </div>

      <!-- CDM 组说明 -->
      <div class="cdm-panel">
        <div class="panel-title">CDM 组与正交覆盖码（OCC）</div>

        <div class="cdm-type-info">
          <div class="type-badge">{{ dmrsType === 1 ? 'Type 1' : 'Type 2' }}</div>
          <div class="type-desc">{{ typeDesc }}</div>
        </div>

        <div v-for="grp in cdmGroups" :key="grp.id" class="cdm-group-card">
          <div class="cdm-group-header" :style="{borderLeftColor: grp.color}">
            CDM 组 {{ grp.id }}
          </div>
          <div class="cdm-ports">
            <span v-for="p in grp.ports" :key="p"
              class="port-badge"
              :style="{background: portColor(p) + '30',
                       borderColor: portColor(p),
                       opacity: highlightPort===-1 || highlightPort===p ? 1 : 0.3}">
              P{{ p }}
            </span>
          </div>
          <div class="cdm-occ">
            <div class="occ-label">频域 OCC（FD-OCC）</div>
            <div class="occ-codes">
              <span v-for="(code, i) in grp.fdOcc" :key="i" class="occ-chip">
                P{{ grp.ports[i] }}: [{{ code.join(', ') }}]
              </span>
            </div>
            <div v-if="grp.tdOcc" class="occ-codes" style="margin-top:3px">
              <div class="occ-label">时域 OCC（TD-OCC）</div>
              <span v-for="(code, i) in grp.tdOcc" :key="'td'+i" class="occ-chip">
                P{{ grp.ports[i] }}: [{{ code.join(', ') }}]
              </span>
            </div>
          </div>
          <div class="cdm-re-count">
            占用 {{ grp.reCount }} RE/RB·符号
          </div>
        </div>

        <div class="overhead-info">
          <div class="oh-row">
            <span>DMRS 开销</span>
            <span class="oh-val" style="color:#f85149">
              {{ dmrsOverhead.toFixed(1) }}% / 符号
            </span>
          </div>
          <div class="oh-row">
            <span>PDSCH 可用 RE/RB</span>
            <span class="oh-val" style="color:#3fb950">
              {{ pdschRE }} / {{ 12 * 14 }} RE
            </span>
          </div>
          <div class="oh-row">
            <span>最大正交端口数</span>
            <span class="oh-val">{{ maxOrthPorts }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部对比说明 -->
    <div class="compare-bar">
      <div class="cmp-item">
        <span class="cmp-label">Type 1 特点</span>
        <span class="cmp-text">RE 交替排列（间隔 2 子载波），每 CDM 组 2 端口，最多 4 端口；开销小；适合 4 端口以下配置</span>
      </div>
      <div class="cmp-div"/>
      <div class="cmp-item">
        <span class="cmp-label">Type 2 特点</span>
        <span class="cmp-text">3 个 CDM 组相邻排列，每 CDM 组 2 端口，最多 6/8 端口；开销大；支持更多端口，适合 Massive MIMO</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const dmrsType = ref(1)
const maxPorts = ref(4)
const highlightPort = ref(-1)

const maxPortOptions = computed(() => dmrsType.value === 1 ? [2, 4] : [2, 4, 6, 8])

// 当切换类型时重置端口数
function onTypeChange() {
  maxPorts.value = 4
  highlightPort.value = -1
}

// SVG 尺寸
const cellW = 22, cellH = 16
const svgW = computed(() => 12 * cellW + 24)
const svgH = computed(() => 14 * cellH + 16)
function scX(sc: number) { return 10 + sc * cellW }
function symY(sym: number) { return sym * cellH }

// 端口颜色
const colors = ['#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#39d353','#ff9f43','#a29bfe']
function portColor(port: number) { return colors[port % colors.length] }

// DMRS 符号位置（Type A Position 2 标准配置）
const dmrsSymbols = [2, 11]

// 可用端口列表
const availablePorts = computed(() => Array.from({length: maxPorts.value}, (_, i) => i))

// Type 1 配置
const type1Config = computed(() => {
  // CDM 组 0：子载波 0,2,4,6,8,10（偶数），端口 0,1
  // CDM 组 1：子载波 1,3,5,7,9,11（奇数），端口 2,3
  const groups = [
    { scs: [0,2,4,6,8,10], ports: [0,1] },
    { scs: [1,3,5,7,9,11], ports: [2,3] },
  ]
  return groups
})

// Type 2 配置
const type2Config = computed(() => {
  // CDM 组 0：子载波 0,1，端口 0,1
  // CDM 组 1：子载波 2,3，端口 2,3
  // CDM 组 2：子载波 4,5，端口 4,5
  // CDM 组 3：子载波 6,7，端口 6,7（仅8端口时）
  const groups = [
    { scs: [0,1], ports: [0,1] },
    { scs: [2,3], ports: [2,3] },
    { scs: [4,5], ports: [4,5] },
    { scs: [6,7], ports: [6,7] },
  ]
  return groups.filter(g => g.ports.some(p => p < maxPorts.value))
})

// 生成所有 DMRS RE（用于绘图）
const dmrsREs = computed(() => {
  const res: {sc: number, sym: number, port: number}[] = []
  const config = dmrsType.value === 1 ? type1Config.value : type2Config.value
  for (const sym of dmrsSymbols) {
    for (const grp of config) {
      for (const sc of grp.scs) {
        // 在每个 RE 上，各端口通过 OCC 区分，但占用同一 RE
        // 显示时用 CDM 组内第一个端口标色，实际两个端口共享该 RE
        const port = grp.ports.find(p => p < maxPorts.value)
        if (port !== undefined) {
          res.push({ sc, sym, port: grp.ports[0] })
        }
      }
    }
  }
  return res
})

// CDM 组信息
const cdmGroups = computed(() => {
  if (dmrsType.value === 1) {
    return [
      {
        id: 0, color: colors[0],
        ports: [0,1].filter(p => p < maxPorts.value),
        fdOcc: [[1,1],[1,-1]],
        tdOcc: [[1,1],[1,1]],
        reCount: 6
      },
      ...(maxPorts.value >= 4 ? [{
        id: 1, color: colors[2],
        ports: [2,3].filter(p => p < maxPorts.value),
        fdOcc: [[1,1],[1,-1]],
        tdOcc: null as null,
        reCount: 6
      }] : [])
    ]
  } else {
    const all = [
      { id: 0, color: colors[0], ports: [0,1], fdOcc: [[1,1],[1,-1]], tdOcc: [[1,1],[1,1]], reCount: 2 },
      { id: 1, color: colors[2], ports: [2,3], fdOcc: [[1,1],[1,-1]], tdOcc: null as null, reCount: 2 },
      { id: 2, color: colors[4], ports: [4,5], fdOcc: [[1,1],[1,-1]], tdOcc: null as null, reCount: 2 },
      { id: 3, color: colors[6], ports: [6,7], fdOcc: [[1,1],[1,-1]], tdOcc: null as null, reCount: 2 },
    ]
    return all.filter(g => g.ports.some(p => p < maxPorts.value))
  }
})

const typeDesc = computed(() =>
  dmrsType.value === 1
    ? '交替子载波模式：CDM 组 0 占偶数子载波，CDM 组 1 占奇数子载波。频率间距大，信道估计插值精度好，支持最多 4 端口。'
    : '相邻子载波对模式：每个 CDM 组占相邻 2 个子载波。频率间距小，支持多达 8 端口，适用于 Massive MIMO 下行。'
)

const maxOrthPorts = computed(() =>
  dmrsType.value === 1 ? 4 : 8)

// 开销计算
const dmrsRePerSlot = computed(() => {
  const rePerRBPerSym = dmrsType.value === 1 ? 6 : (cdmGroups.value.length * 2)
  return rePerRBPerSym * dmrsSymbols.length
})
const dmrsOverhead = computed(() => dmrsRePerSlot.value / (12 * 14) * 100)
const pdschRE = computed(() => 12 * 14 - dmrsRePerSlot.value)
</script>

<style scoped>
.dm-root {
  font-family: var(--vp-font-family-mono, monospace);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px; padding: 16px; margin: 24px 0;
  color: var(--vp-c-text-1);
}
.dm-header { margin-bottom: 12px; }
.dm-title { font-size: 15px; font-weight: 700; color: var(--vp-c-brand); display: block; }
.dm-sub { font-size: 11px; color: var(--vp-c-text-2); }

.dm-controls {
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
  color: var(--vp-c-text-2); cursor: pointer;
}
.ctrl-btn.active { background: var(--vp-c-brand); border-color: var(--vp-c-brand); color: #fff; }
.ctrl-group select {
  font-size: 11px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider); border-radius: 4px; padding: 2px 6px;
}

.dm-main { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start; }
.grid-wrap { flex-shrink: 0; }
.grid-title { font-size: 10px; color: var(--vp-c-text-2); margin-bottom: 4px; }
.grid-svg { width: 100%; max-width: 300px; height: auto; }
.legend {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;
}
.leg-item { display: flex; align-items: center; gap: 3px; font-size: 10px; color: var(--vp-c-text-2); }
.leg-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }

.cdm-panel {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 12px;
}
.panel-title {
  font-size: 10px; font-weight: 700; color: var(--vp-c-text-2);
  text-transform: uppercase; margin-bottom: 8px;
}
.cdm-type-info { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 10px; }
.type-badge {
  flex-shrink: 0; padding: 3px 8px; font-size: 11px; font-weight: 700;
  background: var(--vp-c-brand-soft); color: var(--vp-c-brand);
  border-radius: 4px;
}
.type-desc { font-size: 10px; color: var(--vp-c-text-2); line-height: 1.6; }

.cdm-group-card {
  border: 1px solid var(--vp-c-divider); border-left-width: 3px;
  border-radius: 6px; padding: 8px; margin-bottom: 8px;
  background: var(--vp-c-bg-soft);
}
.cdm-group-header { font-size: 11px; font-weight: 700; margin-bottom: 5px; }
.cdm-ports { display: flex; gap: 4px; margin-bottom: 6px; }
.port-badge {
  padding: 2px 7px; font-size: 10px; border-radius: 10px;
  border: 1px solid; font-weight: 600;
}
.cdm-occ { margin-bottom: 4px; }
.occ-label { font-size: 9px; color: var(--vp-c-text-3); margin-bottom: 2px; }
.occ-codes { display: flex; flex-wrap: wrap; gap: 4px; }
.occ-chip {
  font-size: 9px; padding: 1px 5px;
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 3px; color: var(--vp-c-text-2);
}
.cdm-re-count { font-size: 10px; color: var(--vp-c-text-3); }

.overhead-info {
  border-top: 1px solid var(--vp-c-divider); padding-top: 8px; margin-top: 8px;
}
.oh-row {
  display: flex; justify-content: space-between; font-size: 11px;
  padding: 3px 0; border-bottom: 1px solid var(--vp-c-divider);
}
.oh-row:last-child { border: none; }
.oh-val { font-weight: 600; }

.compare-bar {
  display: flex; gap: 0; margin-top: 12px;
  background: var(--vp-c-bg); border-radius: 6px;
  border: 1px solid var(--vp-c-divider); overflow: hidden;
}
.cmp-item { flex: 1; padding: 10px 12px; }
.cmp-div { width: 1px; background: var(--vp-c-divider); }
.cmp-label { display: block; font-size: 10px; font-weight: 700; color: var(--vp-c-brand); margin-bottom: 4px; }
.cmp-text { font-size: 10px; color: var(--vp-c-text-2); line-height: 1.6; }

@media (max-width: 650px) {
  .dm-main { grid-template-columns: 1fr; }
  .compare-bar { flex-direction: column; }
  .cmp-div { width: 100%; height: 1px; }
}
</style>
