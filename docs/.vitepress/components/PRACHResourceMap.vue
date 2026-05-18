<template>
  <div class="prm-wrap">

    <div class="prm-header">
      <span class="prm-title">PRACH 时频资源映射器</span>
      <span class="prm-spec">3GPP TS 38.211 §6.3.3 / 38.213 §8.1</span>
    </div>

    <!-- 控制区 -->
    <div class="prm-controls">
      <div class="ctrl-group">
        <div class="ctrl-label">PRACH Configuration Index</div>
        <div class="idx-row">
          <input type="number" min="0" max="255" v-model.number="configIdx"
                 class="idx-input"/>
          <div class="idx-btns">
            <button @click="configIdx = Math.max(0, configIdx - 1)">−</button>
            <button @click="configIdx = Math.min(255, configIdx + 1)">+</button>
          </div>
          <div class="idx-presets">
            <button v-for="p in presets" :key="p.idx"
                    :class="['preset-btn', { active: configIdx === p.idx }]"
                    @click="configIdx = p.idx">
              {{ p.label }}
            </button>
          </div>
        </div>
      </div>

      <div class="ctrl-row">
        <div class="ctrl-group sm">
          <div class="ctrl-label">Numerology μ</div>
          <div class="mu-btns">
            <button v-for="m in [0,1]" :key="m"
                    :class="['mu-btn', { active: mu === m }]"
                    @click="mu = m">
              μ={{ m }}（{{ scsOf(m) }}kHz）
            </button>
          </div>
        </div>
        <div class="ctrl-group sm">
          <div class="ctrl-label">msg1-FrequencyStart（RB）</div>
          <input type="range" min="0" max="50" step="1"
                 v-model.number="freqStart" class="prm-slider"/>
          <div class="ctrl-sub">RB#{{ freqStart }}（相对 BWP 低端）</div>
        </div>
        <div class="ctrl-group sm">
          <div class="ctrl-label">PRACH SCS</div>
          <div class="mu-btns">
            <button v-for="s in prach_scs_options" :key="s.val"
                    :class="['mu-btn', { active: prachSCS === s.val }]"
                    @click="prachSCS = s.val">
              {{ s.label }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 主体：时频网格 + 详情面板 -->
    <div class="prm-body">

      <!-- 时频网格 -->
      <div class="grid-wrap">
        <div class="grid-title">1 个 Radio Frame（10ms）时频资源视图</div>

        <!-- 图例 -->
        <div class="grid-legend">
          <span v-for="l in legend" :key="l.label" class="legend-item">
            <span class="legend-dot" :style="{ background: l.color }"></span>
            {{ l.label }}
          </span>
        </div>

        <!-- 网格主体 -->
        <div class="grid-main">

          <!-- Y轴：频率标签 -->
          <div class="y-axis">
            <div class="y-label top">高频</div>
            <div class="y-label mid">PRACH<br/>频域</div>
            <div class="y-label bot">低频</div>
          </div>

          <!-- 网格内容 -->
          <div class="grid-content">
            <!-- X轴：子帧编号 -->
            <div class="x-axis">
              <div v-for="sf in 10" :key="sf" class="x-tick">SF#{{ sf-1 }}</div>
            </div>

            <!-- 网格行：PRACH频带上方（其他信道） -->
            <div class="grid-row pusch-row">
              <div v-for="sf in 10" :key="sf"
                   class="grid-cell pusch-cell"
                   :title="`SF#${sf-1}：PUSCH/PDSCH 数据信道`">
                <span class="cell-label">DATA</span>
              </div>
            </div>

            <!-- 网格行：PRACH 频带 -->
            <div class="grid-row prach-row">
              <div v-for="sf in 10" :key="sf"
                   :class="['grid-cell prach-cell',
                             { 'is-occasion': isPRACHOccasion(sf-1),
                               'selected': selectedOccasion === sf-1 }]"
                   @click="isPRACHOccasion(sf-1) ? selectOccasion(sf-1) : null"
                   :title="isPRACHOccasion(sf-1)
                     ? `SF#${sf-1}：PRACH Occasion（点击查看详情）`
                     : `SF#${sf-1}：无 PRACH`">
                <template v-if="isPRACHOccasion(sf-1)">
                  <span class="prach-label">PRACH</span>
                  <span class="ssb-label">SSB#{{ getSSBIndex(sf-1) }}</span>
                </template>
                <span v-else class="empty-label">—</span>
              </div>
            </div>

            <!-- 网格行：PRACH频带下方 -->
            <div class="grid-row guard-row">
              <div v-for="sf in 10" :key="sf"
                   class="grid-cell guard-cell"
                   :title="`SF#${sf-1}：保护带 / 其他信道`">
                <span class="cell-label">OTHER</span>
              </div>
            </div>

          </div>
        </div>

        <!-- 时间轴 -->
        <div class="time-axis">
          <span>0ms</span>
          <span>5ms</span>
          <span>10ms</span>
        </div>
      </div>

      <!-- 详情面板 -->
      <div class="detail-panel">
        <Transition name="detail-slide" mode="out-in">

          <!-- 默认状态：显示配置参数 -->
          <div v-if="selectedOccasion === null" key="default" class="detail-inner">
            <div class="detail-section">
              <div class="ds-title">📋 当前 PRACH 配置</div>
              <div class="kv-list">
                <div class="kv-row" v-for="kv in configKVs" :key="kv.k">
                  <span class="kv-k">{{ kv.k }}</span>
                  <span class="kv-v">{{ kv.v }}</span>
                </div>
              </div>
            </div>

            <div class="detail-section">
              <div class="ds-title">🔢 RA-RNTI 计算预览</div>
              <div class="ra-rnti-formula">
                RA-RNTI = 1 + s_id + 14×t_id + 14×80×f_id
              </div>
              <div class="ra-rnti-hint">点击 PRACH Occasion 查看具体计算值</div>
            </div>

            <div class="detail-hint">👆 点击紫色 PRACH Occasion 查看详情</div>
          </div>

          <!-- 选中 Occasion：显示详细参数 -->
          <div v-else :key="selectedOccasion" class="detail-inner">
            <div class="detail-title">
              PRACH Occasion · SF#{{ selectedOccasion }}
            </div>

            <div class="detail-section">
              <div class="ds-title">📍 时频位置</div>
              <div class="kv-list">
                <div class="kv-row">
                  <span class="kv-k">子帧编号</span>
                  <span class="kv-v">SF#{{ selectedOccasion }}</span>
                </div>
                <div class="kv-row">
                  <span class="kv-k">起始 RB</span>
                  <span class="kv-v">RB#{{ freqStart }}</span>
                </div>
                <div class="kv-row">
                  <span class="kv-k">占用 RB</span>
                  <span class="kv-v">{{ prachRBs }} RB（{{ prachBWkHz }}kHz）</span>
                </div>
                <div class="kv-row">
                  <span class="kv-k">关联 SSB</span>
                  <span class="kv-v highlight">SSB#{{ getSSBIndex(selectedOccasion) }}</span>
                </div>
              </div>
            </div>

            <div class="detail-section">
              <div class="ds-title">🔢 RA-RNTI 计算（38.321 §5.1.3）</div>
              <div class="ra-formula">
                <div class="rf-line">s_id = 0（起始符号）</div>
                <div class="rf-line">t_id = {{ selectedOccasion }}（子帧编号）</div>
                <div class="rf-line">f_id = {{ freqStart % 8 }}（频域索引）</div>
                <div class="rf-sep"></div>
                <div class="rf-result">
                  RA-RNTI = 1 + 0 + 14×{{ selectedOccasion }} + 14×80×{{ freqStart % 8 }}
                  = <b>{{ computeRArnti(0, selectedOccasion, freqStart % 8) }}</b>
                </div>
              </div>
            </div>

            <div class="detail-section">
              <div class="ds-title">📶 Preamble 分配</div>
              <div class="preamble-bar">
                <div class="pb-cfra" :style="{ width: '25%' }">
                  CFRA<br/>{{ Math.floor(64 * 0.25) }}个
                </div>
                <div class="pb-cbra" :style="{ width: '75%' }">
                  CBRA（随机选择）<br/>{{ Math.floor(64 * 0.75) }}个
                </div>
              </div>
              <div class="pb-note">SSB#{{ getSSBIndex(selectedOccasion) }} 关联的 Preamble 范围</div>
            </div>

            <button class="close-btn" @click="selectedOccasion = null">
              ← 返回配置概览
            </button>
          </div>

        </Transition>
      </div>
    </div>

    <div class="prm-hint">
      点击紫色 PRACH Occasion 方块查看该时频资源的详细参数与 RA-RNTI 计算
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// ── 状态 ──────────────────────────────────────────────────────────────────
const configIdx       = ref(16)    // prach-ConfigurationIndex
const mu              = ref(1)     // 数据信道 Numerology
const freqStart       = ref(0)     // msg1-FrequencyStart（RB）
const prachSCS        = ref(1.25)  // PRACH SCS（kHz）
const selectedOccasion = ref<number | null>(null)

const scsOf = (m: number) => (2 ** m) * 15

const prach_scs_options = [
  { val: 1.25, label: '1.25kHz' },
  { val: 5,    label: '5kHz' },
  { val: 15,   label: '15kHz' },
]

const presets = [
  { idx: 0,   label: '格式0（FR1常用）' },
  { idx: 16,  label: '索引16' },
  { idx: 87,  label: '格式B4' },
]

// ── PRACH 时频位置（简化模型）─────────────────────────────────────────────
// 实际由 38.211 Table 6.3.3.2-x 查表决定
// 这里用简化规则：configIdx 决定哪些子帧有 PRACH Occasion
function getPRACHSubframes(idx: number): number[] {
  // 简化映射：不同 configIdx 对应不同的子帧周期
  const patterns: Record<number, number[]> = {
    0:   [1],              // 每帧 SF#1
    1:   [4],              // 每帧 SF#4
    2:   [7],              // 每帧 SF#7
    3:   [1, 6],           // 每帧 SF#1,6
    4:   [2, 7],           // 每帧 SF#2,7
    5:   [3, 8],           // 每帧 SF#3,8
    6:   [1, 4, 7],        // 每帧 3 次
    7:   [2, 5, 8],
    8:   [3, 6, 9],
    16:  [1],
    87:  [0, 2, 4, 6, 8],  // 密集配置
  }
  // 若无精确匹配，根据索引生成规律
  if (patterns[idx]) return patterns[idx]
  const period = Math.max(1, Math.floor(10 / (1 + (idx % 4))))
  const result = []
  for (let sf = 0; sf < 10; sf += period) result.push(sf)
  return result
}

const prachSubframes = computed(() => getPRACHSubframes(configIdx.value))

function isPRACHOccasion(sf: number): boolean {
  return prachSubframes.value.includes(sf)
}

// SSB 与 PRACH Occasion 关联（简化：顺序关联）
function getSSBIndex(sf: number): number {
  const occ = prachSubframes.value.indexOf(sf)
  return occ >= 0 ? occ % 8 : 0
}

function selectOccasion(sf: number) {
  selectedOccasion.value = selectedOccasion.value === sf ? null : sf
}

// PRACH 占用 RB 数（长序列格式，N_ZC=839）
const prachRBs = computed(() => {
  if (prachSCS.value === 1.25) return 6   // 839 个子载波 × 1.25kHz / (12 × 15kHz) ≈ 6 RB
  if (prachSCS.value === 5)    return 24
  return 12  // 15kHz SCS
})

const prachBWkHz = computed(() =>
  prachRBs.value * 12 * (mu.value === 0 ? 15 : 30)
)

// RA-RNTI 计算
function computeRArnti(s_id: number, t_id: number, f_id: number): number {
  return 1 + s_id + 14 * t_id + 14 * 80 * f_id
}

// 配置 KV 列表
const configKVs = computed(() => [
  { k: 'configurationIndex', v: configIdx.value },
  { k: 'PRACH Occasion 数/帧', v: `${prachSubframes.value.length} 个` },
  { k: 'PRACH 子帧位置', v: prachSubframes.value.map(s => `SF#${s}`).join(', ') },
  { k: 'msg1-FrequencyStart', v: `RB#${freqStart.value}` },
  { k: 'PRACH SCS', v: `${prachSCS.value} kHz` },
  { k: '占用频域', v: `${prachRBs.value} RB（${prachBWkHz.value} kHz）` },
  { k: '数据信道 SCS', v: `${scsOf(mu.value)} kHz（μ=${mu.value}）` },
])

const legend = [
  { label: 'PRACH Occasion（可点击）', color: '#8a6bbf' },
  { label: '数据信道（PUSCH/PDSCH）',  color: '#3a6a8f' },
  { label: '其他资源',                  color: '#2d2d3d' },
]
</script>

<style scoped>
.prm-wrap {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px; padding: 20px; margin: 20px 0;
  background: var(--vp-c-bg-soft); font-size: 13px;
}

.prm-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;
}
.prm-title { font-size: 15px; font-weight: 600; color: var(--vp-c-text-1); }
.prm-spec  { font-size: 11px; padding: 2px 8px; border-radius: 20px;
             background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }

/* 控制区 */
.prm-controls { margin-bottom: 16px; display: flex; flex-direction: column; gap: 12px; }
.ctrl-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
@media (max-width: 640px) { .ctrl-row { grid-template-columns: 1fr; } }

.ctrl-group    { display: flex; flex-direction: column; gap: 5px; }
.ctrl-group.sm { }
.ctrl-label    { font-size: 12px; font-weight: 500; color: var(--vp-c-text-2); }
.ctrl-sub      { font-size: 10.5px; color: var(--vp-c-text-3); }

.idx-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.idx-input {
  width: 70px; padding: 5px 8px; border-radius: 6px;
  border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-1); font-size: 14px; font-weight: 600;
  font-family: var(--vp-font-family-mono); text-align: center;
}
.idx-btns { display: flex; gap: 4px; }
.idx-btns button {
  width: 28px; height: 28px; border-radius: 6px; border: 1.5px solid var(--vp-c-divider);
  background: var(--vp-c-bg); color: var(--vp-c-text-1); font-size: 16px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.idx-btns button:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }

.idx-presets { display: flex; gap: 6px; flex-wrap: wrap; }
.preset-btn {
  padding: 3px 10px; border-radius: 20px; font-size: 11px; cursor: pointer;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-2); transition: all 0.15s;
}
.preset-btn:hover  { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.preset-btn.active { background: var(--vp-c-brand-soft); border-color: var(--vp-c-brand-1);
                     color: var(--vp-c-brand-1); }

.mu-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.mu-btn {
  padding: 4px 10px; border-radius: 6px; font-size: 11.5px; cursor: pointer;
  border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-2); transition: all 0.15s;
}
.mu-btn:hover  { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.mu-btn.active { background: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); color: #fff; }

.prm-slider { width: 100%; height: 4px; cursor: pointer; accent-color: var(--vp-c-brand-1); }

/* 主体布局 */
.prm-body {
  display: grid; grid-template-columns: 1fr 280px; gap: 14px; margin-bottom: 10px;
}
@media (max-width: 700px) { .prm-body { grid-template-columns: 1fr; } }

/* 时频网格 */
.grid-wrap {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 12px;
}
.grid-title { font-size: 12px; font-weight: 500; color: var(--vp-c-text-2); margin-bottom: 8px; }
.grid-legend {
  display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 10px;
}
.legend-item { display: flex; align-items: center; gap: 5px;
               font-size: 11px; color: var(--vp-c-text-3); }
.legend-dot  { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }

.grid-main { display: flex; gap: 6px; }
.y-axis {
  display: flex; flex-direction: column; justify-content: space-between;
  align-items: flex-end; width: 36px; padding: 4px 0;
}
.y-label { font-size: 9px; color: var(--vp-c-text-3); text-align: right; line-height: 1.3; }

.grid-content { flex: 1; display: flex; flex-direction: column; gap: 3px; }

.x-axis {
  display: grid; grid-template-columns: repeat(10, 1fr);
  gap: 3px; margin-bottom: 2px;
}
.x-tick { font-size: 9px; color: var(--vp-c-text-3); text-align: center; }

.grid-row { display: grid; grid-template-columns: repeat(10, 1fr); gap: 3px; }

.grid-cell {
  height: 44px; border-radius: 4px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  font-size: 9px; transition: all 0.15s;
}

.pusch-cell  { background: rgba(58, 106, 143, 0.45); }
.guard-cell  { background: rgba(45, 45, 61, 0.5); }
.cell-label  { font-size: 8.5px; color: rgba(255,255,255,0.5); }

.prach-cell {
  background: rgba(45, 45, 61, 0.4);
  border: 1px solid var(--vp-c-divider);
}
.prach-cell.is-occasion {
  background: rgba(138, 107, 191, 0.55);
  border-color: #8a6bbf;
  cursor: pointer;
}
.prach-cell.is-occasion:hover {
  background: rgba(138, 107, 191, 0.75);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(138, 107, 191, 0.3);
}
.prach-cell.selected {
  background: rgba(138, 107, 191, 0.9) !important;
  border-color: #c8a8ff !important;
  box-shadow: 0 0 0 2px rgba(138, 107, 191, 0.4);
}
.prach-label { font-size: 9px; font-weight: 600; color: #e8d8ff; }
.ssb-label   { font-size: 8px; color: rgba(232, 216, 255, 0.75); }
.empty-label { font-size: 9px; color: var(--vp-c-text-3); }

.time-axis {
  display: flex; justify-content: space-between;
  font-size: 10px; color: var(--vp-c-text-3);
  margin-top: 6px; padding: 0 42px;
}

/* 详情面板 */
.detail-panel {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; overflow: hidden; min-height: 200px;
}
.detail-inner { padding: 14px; }
.detail-title {
  font-size: 14px; font-weight: 600; color: var(--vp-c-text-1);
  margin-bottom: 12px; padding-bottom: 8px;
  border-bottom: 1px solid var(--vp-c-divider);
  font-family: var(--vp-font-family-mono);
}
.detail-section { margin-bottom: 12px; }
.ds-title { font-size: 11px; font-weight: 600; color: var(--vp-c-text-3);
            text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
.detail-hint { font-size: 11.5px; color: var(--vp-c-text-3); text-align: center;
               margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--vp-c-divider); }

.kv-list { display: flex; flex-direction: column; gap: 5px; }
.kv-row  { display: flex; gap: 8px; font-size: 12px; }
.kv-k    { color: var(--vp-c-text-3); min-width: 60px; flex-shrink: 0; font-size: 11px; }
.kv-v    { color: var(--vp-c-text-1); font-family: var(--vp-font-family-mono); font-size: 11.5px; }
.kv-v.highlight { color: var(--vp-c-brand-1); font-weight: 600; }

.ra-rnti-formula {
  font-family: var(--vp-font-family-mono); font-size: 11px;
  background: var(--vp-c-bg-soft); border-radius: 4px;
  padding: 6px 8px; color: var(--vp-c-text-2); margin-bottom: 4px;
}
.ra-rnti-hint { font-size: 10.5px; color: var(--vp-c-text-3); }

.ra-formula {
  font-family: var(--vp-font-family-mono); font-size: 11px;
  background: var(--vp-c-bg-soft); border-radius: 6px;
  padding: 8px 10px; color: var(--vp-c-text-2);
  border-left: 3px solid var(--vp-c-brand-1);
}
.rf-line   { line-height: 1.8; }
.rf-sep    { height: 6px; border-top: 1px dashed var(--vp-c-divider); margin: 4px 0; }
.rf-result { color: var(--vp-c-text-1); font-weight: 500; line-height: 1.6; }
.rf-result b { color: var(--vp-c-brand-1); font-size: 13px; }

.preamble-bar {
  display: flex; height: 32px; border-radius: 6px; overflow: hidden;
  margin-bottom: 6px; border: 1px solid var(--vp-c-divider);
}
.pb-cfra {
  background: rgba(255, 122, 114, 0.6); display: flex; align-items: center;
  justify-content: center; font-size: 9px; color: #fff; text-align: center;
  line-height: 1.3; padding: 0 4px;
}
.pb-cbra {
  background: rgba(88, 166, 255, 0.6); display: flex; align-items: center;
  justify-content: center; font-size: 9px; color: #fff; text-align: center;
  line-height: 1.3; flex: 1; padding: 0 4px;
}
.pb-note { font-size: 10.5px; color: var(--vp-c-text-3); }

.close-btn {
  margin-top: 10px; padding: 5px 12px; border-radius: 6px; font-size: 12px;
  cursor: pointer; border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2); width: 100%; transition: all 0.15s;
}
.close-btn:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }

.detail-slide-enter-active, .detail-slide-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.detail-slide-enter-from { opacity: 0; transform: translateX(8px); }
.detail-slide-leave-to   { opacity: 0; transform: translateX(-8px); }

.prm-hint { font-size: 11.5px; color: var(--vp-c-text-3); text-align: center; margin-top: 8px; }
</style>
