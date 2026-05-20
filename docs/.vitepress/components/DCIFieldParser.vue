<template>
  <div class="dfp-wrap">
    <div class="dfp-header">
      <span class="dfp-title">DCI 字段解析器</span>
      <span class="dfp-spec">3GPP TS 38.212 §7.3.1</span>
    </div>

    <!-- DCI 格式选择 -->
    <div class="format-row">
      <div class="fmt-label">DCI 格式</div>
      <div class="fmt-btns">
        <button v-for="f in formats" :key="f.key"
                :class="['fmt-btn', { active: selectedFormat === f.key }]"
                @click="selectedFormat = f.key">
          {{ f.label }}
        </button>
      </div>
      <div class="fmt-desc">{{ currentFormat.desc }}</div>
    </div>

    <!-- NTN K-offset 开关 -->
    <div class="ntn-toggle">
      <label class="toggle-label">
        <input type="checkbox" v-model="ntnEnabled" class="toggle-cb"/>
        <span class="toggle-text">
          🛰️ NTN 模式（Rel-17）— 启用 K-offset
        </span>
      </label>
      <div v-if="ntnEnabled" class="koffset-ctrl">
        <span class="ko-label">K_offset = </span>
        <input type="number" min="0" max="1023" v-model.number="kOffset"
               class="ko-input"/>
        <span class="ko-unit">slots</span>
        <span class="ko-hint">（建议 = ⌈RTT / T_slot⌉）</span>
      </div>
    </div>

    <!-- 字段编辑器 -->
    <div class="fields-section">
      <div class="fields-title">字段配置</div>
      <div class="fields-grid">
        <div v-for="field in currentFields" :key="field.key" class="field-row">
          <div class="field-meta">
            <span class="field-name">{{ field.name }}</span>
            <span class="field-bits">{{ field.bits }} bit{{ field.bits > 1 ? 's' : '' }}</span>
          </div>
          <!-- 数值输入 -->
          <div class="field-input-wrap">
            <input
              v-if="field.bits <= 5"
              type="range"
              :min="0"
              :max="(1 << field.bits) - 1"
              v-model.number="fieldValues[field.key]"
              class="field-slider"
            />
            <input
              v-else
              type="number"
              :min="0"
              :max="(1 << Math.min(field.bits, 16)) - 1"
              v-model.number="fieldValues[field.key]"
              class="field-number"
            />
            <span class="field-val-display">{{ fieldValues[field.key] ?? 0 }}</span>
          </div>
          <!-- 解释 -->
          <div class="field-interp">{{ interpret(field) }}</div>
        </div>
      </div>
    </div>

    <!-- DCI 编码输出 -->
    <div class="encoded-section">
      <div class="enc-title">DCI 编码比特流（MSB 在左）</div>
      <div class="enc-bits">
        <span
          v-for="(grp, i) in encodedGroups"
          :key="i"
          :class="['enc-grp', grp.cls]"
          :title="grp.name"
        >{{ grp.bits }}</span>
      </div>
      <div class="enc-labels">
        <span v-for="(grp, i) in encodedGroups" :key="i"
              :class="['enc-lbl', grp.cls]"
              :style="{ width: (grp.bits.length * 11) + 'px' }">
          {{ grp.shortName }}
        </span>
      </div>
      <div class="enc-stats">
        总长：<b>{{ totalBits }}</b> bits
        &nbsp;|&nbsp;
        Polar 编码输入（含 24-bit CRC）：<b>{{ totalBits + 24 }}</b> bits
      </div>
    </div>

    <!-- 关键字段高亮说明 -->
    <div class="highlight-section">
      <div class="hl-title">关键字段解读</div>
      <div class="hl-cards">
        <div class="hl-card" v-for="hl in highlights" :key="hl.key">
          <div class="hl-name">{{ hl.name }}</div>
          <div class="hl-val">{{ hl.val }}</div>
          <div class="hl-desc">{{ hl.desc }}</div>
        </div>
      </div>
    </div>

    <div class="dfp-hint">调整字段值，实时查看编码比特流和字段解释</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'

// ── DCI 格式定义 ──────────────────────────────────────────────────────────
const formats = [
  { key: '1_1', label: 'format 1_1', desc: '下行调度（完整版，C-RNTI）' },
  { key: '0_1', label: 'format 0_1', desc: '上行调度（完整版，C-RNTI）' },
  { key: '1_0', label: 'format 1_0', desc: '下行调度（简化版，多种 RNTI）' },
  { key: '2_0', label: 'format 2_0', desc: 'Slot Format 指示（SFI-RNTI）' },
]

interface FieldDef {
  key: string
  name: string
  bits: number
  options?: Record<number, string>
  unit?: string
  ntnNote?: string
}

const FORMAT_FIELDS: Record<string, FieldDef[]> = {
  '1_1': [
    { key: 'identifier',     name: 'DCI 格式标识',    bits: 1,  options: { 0: 'UL(0_1)', 1: 'DL(1_1)' } },
    { key: 'bwp',            name: 'BWP indicator',   bits: 2 },
    { key: 'freq_ra',        name: '频域资源分配 RIV', bits: 12 },
    { key: 'time_ra',        name: '时域资源分配索引', bits: 4 },
    { key: 'vrb_prb',        name: 'VRB→PRB 映射',    bits: 1,  options: { 0: '非交织', 1: '交织' } },
    { key: 'mcs',            name: 'MCS（调制编码方案）',bits: 5 },
    { key: 'ndi',            name: 'NDI（新传/重传）', bits: 1,  options: { 0: '重传', 1: '新传' } },
    { key: 'rv',             name: 'RV（冗余版本）',   bits: 2,  options: { 0: 'RV0', 1: 'RV1', 2: 'RV2', 3: 'RV3' } },
    { key: 'harq',           name: 'HARQ 进程编号',   bits: 4 },
    { key: 'dai',            name: 'DAI（下行赋值索引）',bits: 2 },
    { key: 'tpc_pucch',      name: 'TPC for PUCCH',  bits: 2,  options: { 0: '-1dB', 1: '0dB', 2: '+1dB', 3: '+3dB' } },
    { key: 'pucch_res',      name: 'PUCCH 资源指示', bits: 3 },
    { key: 'k1',             name: 'PDSCH→HARQ 时序 K1', bits: 3,
      ntnNote: 'NTN 有效值 = K1 + K_offset' },
    { key: 'antenna_ports',  name: '天线端口（DMRS）', bits: 5 },
    { key: 'tci',            name: 'TCI State（波束）',bits: 3 },
    { key: 'dmrs_init',      name: 'DMRS 序列初始值', bits: 1 },
  ],
  '0_1': [
    { key: 'identifier',     name: 'DCI 格式标识',    bits: 1, options: { 0: 'UL(0_1)', 1: 'DL(1_1)' } },
    { key: 'bwp',            name: 'BWP indicator',   bits: 2 },
    { key: 'freq_ra',        name: '频域资源分配 RIV', bits: 12 },
    { key: 'time_ra',        name: '时域资源分配索引', bits: 4 },
    { key: 'freq_hop',       name: '频率跳频标志',    bits: 1, options: { 0: '禁用', 1: '启用' } },
    { key: 'mcs',            name: 'MCS',             bits: 5 },
    { key: 'ndi',            name: 'NDI',             bits: 1, options: { 0: '重传', 1: '新传' } },
    { key: 'rv',             name: 'RV',              bits: 2, options: { 0: 'RV0', 1: 'RV1', 2: 'RV2', 3: 'RV3' } },
    { key: 'harq',           name: 'HARQ 进程编号',   bits: 4 },
    { key: 'tpc_pusch',      name: 'TPC for PUSCH',  bits: 2, options: { 0: '-1dB', 1: '0dB', 2: '+1dB', 3: '+3dB' } },
    { key: 'k2',             name: 'DCI→PUSCH 时序 K2', bits: 3,
      ntnNote: 'NTN 有效值 = K2 + K_offset' },
    { key: 'srs_req',        name: 'SRS 请求',        bits: 2 },
    { key: 'csi_req',        name: 'CSI 请求',        bits: 6 },
  ],
  '1_0': [
    { key: 'identifier',     name: 'DCI 格式标识',    bits: 1, options: { 0: 'UL', 1: 'DL' } },
    { key: 'freq_ra',        name: '频域资源分配',    bits: 12 },
    { key: 'time_ra',        name: '时域资源分配',    bits: 4 },
    { key: 'vrb_prb',        name: 'VRB→PRB 映射',   bits: 1, options: { 0: '非交织', 1: '交织' } },
    { key: 'mcs',            name: 'MCS',             bits: 5 },
    { key: 'ndi',            name: 'NDI',             bits: 1, options: { 0: '重传', 1: '新传' } },
    { key: 'rv',             name: 'RV',              bits: 2, options: { 0: 'RV0', 1: 'RV1', 2: 'RV2', 3: 'RV3' } },
    { key: 'harq',           name: 'HARQ 进程编号',   bits: 4 },
    { key: 'dai',            name: 'DAI',             bits: 1 },
    { key: 'tpc_pucch',      name: 'TPC for PUCCH',  bits: 2 },
    { key: 'pucch_res',      name: 'PUCCH 资源指示', bits: 3 },
    { key: 'k1',             name: 'HARQ 反馈时序 K1', bits: 3,
      ntnNote: 'NTN 有效值 = K1 + K_offset' },
  ],
  '2_0': [
    { key: 'slot_format',    name: 'Slot Format 指示', bits: 8 },
    { key: 'reserved',       name: '保留字段',         bits: 8 },
  ],
}

// ── 状态 ──────────────────────────────────────────────────────────────────
const selectedFormat = ref('1_1')
const ntnEnabled     = ref(false)
const kOffset        = ref(15)

const fieldValues = reactive<Record<string, number>>({
  identifier: 1, bwp: 0, freq_ra: 0b110000011111,
  time_ra: 2, vrb_prb: 0, freq_hop: 0,
  mcs: 16, ndi: 1, rv: 0,
  harq: 3, dai: 0, tpc_pucch: 1,
  pucch_res: 2, k1: 4, k2: 4,
  antenna_ports: 4, tci: 1, dmrs_init: 0,
  tpc_pusch: 1, srs_req: 0, csi_req: 0,
  slot_format: 0b00001010, reserved: 0,
})

// ── 计算 ──────────────────────────────────────────────────────────────────
const currentFormat = computed(() =>
  formats.find(f => f.key === selectedFormat.value)!
)
const currentFields = computed(() =>
  FORMAT_FIELDS[selectedFormat.value] ?? []
)
const totalBits = computed(() =>
  currentFields.value.reduce((s, f) => s + f.bits, 0)
)

// 字段解释
function interpret(field: FieldDef): string {
  const val = fieldValues[field.key] ?? 0

  if (field.options && field.options[val] !== undefined) {
    return field.options[val]
  }

  if (field.key === 'mcs') {
    const mcsTable = [
      'QPSK r=0.12', 'QPSK r=0.19', 'QPSK r=0.31', 'QPSK r=0.44', 'QPSK r=0.59',
      'QPSK r=0.37', '16QAM r=0.37', '16QAM r=0.48', '16QAM r=0.60', 'QPSK r=0.37',
      '16QAM r=0.40', '16QAM r=0.53', '16QAM r=0.66', '64QAM r=0.52', '64QAM r=0.62',
      '64QAM r=0.73', '64QAM r=0.82', '64QAM r=0.88', '16QAM r=0.52', '64QAM r=0.57',
      '64QAM r=0.69', '64QAM r=0.81', '256QAM r=0.63', '256QAM r=0.70',
      '256QAM r=0.77', '256QAM r=0.85', '256QAM r=0.93', 'rsvd', 'rsvd',
    ]
    return mcsTable[val] ?? `索引 ${val}`
  }

  if (field.key === 'harq') return `HARQ 进程 #${val}（共 16 个，0~15）`
  if (field.key === 'freq_ra') {
    return `RIV = ${val}（startRB = ${Math.floor(val/275)}，约 ${(val % 275)+1} RB）`
  }
  if (field.key === 'time_ra') return `时域行索引 ${val}（查 pdsch-AllocationList）`
  if (field.key === 'tci') return `TCI State #${val}（波束指向）`
  if (field.key === 'k1' || field.key === 'k2') {
    const k = val + 1  // K1 编码值 0~7 对应 1~8
    if (ntnEnabled.value) {
      return `K=${k}（有效值 = ${k} + ${kOffset.value} = ${k + kOffset.value} slots）🛰️`
    }
    return `K = ${k} slot${k > 1 ? 's' : ''}（PDSCH 结束后 ${k} 个 slot 发 HARQ-ACK）`
  }
  return `值 = ${val}（0b${val.toString(2).padStart(field.bits, '0')}）`
}

// 编码比特流（按字段分组）
interface BitGroup { bits: string; name: string; shortName: string; cls: string }
const GROUP_COLORS = [
  'grp0', 'grp1', 'grp2', 'grp3', 'grp4',
  'grp5', 'grp6', 'grp7', 'grp8', 'grp9',
]
const encodedGroups = computed<BitGroup[]>(() =>
  currentFields.value.map((f, i) => {
    const val  = fieldValues[f.key] ?? 0
    const bits = val.toString(2).padStart(f.bits, '0')
    const isNTN = ntnEnabled.value && f.ntnNote
    return {
      bits,
      name     : f.name + (isNTN ? ` [NTN: +${kOffset.value}]` : ''),
      shortName: f.key.length > 6 ? f.key.slice(0, 5) + '…' : f.key,
      cls      : GROUP_COLORS[i % GROUP_COLORS.length] + (isNTN ? ' ntn-field' : ''),
    }
  })
)

// 关键字段高亮卡片
const highlights = computed(() => {
  const cards = []
  const fv = fieldValues

  if (selectedFormat.value === '1_1' || selectedFormat.value === '1_0') {
    const k1 = (fv.k1 ?? 0) + 1
    const effK1 = ntnEnabled.value ? k1 + kOffset.value : k1
    cards.push({
      key: 'mcs',
      name: 'MCS 调制方案',
      val: `MCS = ${fv.mcs ?? 0}`,
      desc: interpret({ key: 'mcs', name: '', bits: 5 }),
    })
    cards.push({
      key: 'harq',
      name: 'HARQ 进程',
      val: `#${fv.harq ?? 0}`,
      desc: `NDI=${fv.ndi ?? 0}（${fv.ndi === 1 ? '新传' : '重传'}），RV=${fv.rv ?? 0}`,
    })
    cards.push({
      key: 'k1',
      name: ntnEnabled.value ? 'K1 有效值（NTN）' : 'HARQ-ACK 时序 K1',
      val: `${effK1} slots`,
      desc: ntnEnabled.value
        ? `DCI K1=${k1} + K_offset=${kOffset.value} → HARQ-ACK 在 slot N+${effK1}`
        : `PDSCH 接收完后 ${k1} 个 slot 发送 HARQ-ACK`,
    })
  }

  if (selectedFormat.value === '0_1') {
    const k2 = (fv.k2 ?? 0) + 1
    const effK2 = ntnEnabled.value ? k2 + kOffset.value : k2
    cards.push({
      key: 'mcs', name: 'MCS', val: `MCS = ${fv.mcs ?? 0}`,
      desc: interpret({ key: 'mcs', name: '', bits: 5 }),
    })
    cards.push({
      key: 'k2',
      name: ntnEnabled.value ? 'K2 有效值（NTN）' : 'DCI→PUSCH 时序 K2',
      val: `${effK2} slots`,
      desc: ntnEnabled.value
        ? `DCI K2=${k2} + K_offset=${kOffset.value} → PUSCH 在 slot N+${effK2}`
        : `收到 DCI 后 ${k2} 个 slot 发送 PUSCH`,
    })
  }

  return cards
})
</script>

<style scoped>
.dfp-wrap {
  border: 1px solid var(--vp-c-divider); border-radius: 12px;
  padding: 20px; margin: 20px 0; background: var(--vp-c-bg-soft); font-size: 13px;
}
.dfp-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.dfp-title  { font-size: 15px; font-weight: 600; color: var(--vp-c-text-1); }
.dfp-spec   { font-size: 11px; padding: 2px 8px; border-radius: 20px;
              background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }

/* 格式选择 */
.format-row  { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.fmt-label   { font-size: 12px; color: var(--vp-c-text-2); font-weight: 500; flex-shrink: 0; }
.fmt-btns    { display: flex; gap: 6px; flex-wrap: wrap; }
.fmt-btn {
  padding: 4px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;
  border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-2); transition: all 0.15s; font-family: var(--vp-font-family-mono);
}
.fmt-btn:hover  { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.fmt-btn.active { background: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); color: #fff; }
.fmt-desc    { font-size: 11.5px; color: var(--vp-c-text-3); }

/* NTN toggle */
.ntn-toggle  { background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
               border-radius: 8px; padding: 10px 13px; margin-bottom: 14px;
               display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.toggle-label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.toggle-cb   { cursor: pointer; accent-color: var(--vp-c-brand-1); width: 14px; height: 14px; }
.toggle-text { font-size: 12.5px; color: var(--vp-c-text-1); }
.koffset-ctrl { display: flex; align-items: center; gap: 6px; }
.ko-label    { font-size: 12px; color: var(--vp-c-text-2); }
.ko-input    { width: 60px; padding: 3px 6px; border-radius: 5px;
               border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
               color: var(--vp-c-text-1); font-size: 13px; font-family: var(--vp-font-family-mono);
               text-align: center; }
.ko-unit     { font-size: 12px; color: var(--vp-c-text-2); }
.ko-hint     { font-size: 11px; color: var(--vp-c-text-3); }

/* 字段编辑器 */
.fields-section { margin-bottom: 14px; }
.fields-title   { font-size: 13px; font-weight: 600; color: var(--vp-c-text-1); margin-bottom: 8px; }
.fields-grid    { display: flex; flex-direction: column; gap: 6px;
                  max-height: 260px; overflow-y: auto;
                  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
                  border-radius: 8px; padding: 8px 10px; }
.field-row  { display: grid; grid-template-columns: 180px 160px 1fr;
              gap: 8px; align-items: center; padding: 4px 0;
              border-bottom: 1px solid var(--vp-c-divider); font-size: 12px; }
.field-row:last-child { border-bottom: none; }
.field-meta { display: flex; flex-direction: column; gap: 1px; }
.field-name { color: var(--vp-c-text-1); font-weight: 500; font-size: 11.5px; }
.field-bits { font-size: 10px; color: var(--vp-c-text-3);
              font-family: var(--vp-font-family-mono); }
.field-input-wrap { display: flex; align-items: center; gap: 6px; }
.field-slider { flex: 1; height: 4px; cursor: pointer; accent-color: var(--vp-c-brand-1); }
.field-number { width: 70px; padding: 3px 6px; border-radius: 5px;
                border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg);
                color: var(--vp-c-text-1); font-size: 12px;
                font-family: var(--vp-font-family-mono); }
.field-val-display { font-family: var(--vp-font-family-mono); font-size: 12px;
                     color: var(--vp-c-brand-1); font-weight: 600; min-width: 30px; text-align: right; }
.field-interp  { font-size: 11px; color: var(--vp-c-text-2); line-height: 1.5; }

/* 编码比特流 */
.encoded-section { margin-bottom: 14px; background: var(--vp-c-bg);
                   border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 12px 14px; }
.enc-title   { font-size: 12px; font-weight: 500; color: var(--vp-c-text-2); margin-bottom: 8px; }
.enc-bits    { display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 4px; }
.enc-labels  { display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 6px; }
.enc-stats   { font-size: 11.5px; color: var(--vp-c-text-3); }

.enc-grp     { font-family: var(--vp-font-family-mono); font-size: 11px;
               padding: 2px 3px; border-radius: 3px; letter-spacing: 1px; cursor: default; }
.enc-lbl     { font-size: 9px; color: var(--vp-c-text-3); text-align: center;
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 字段颜色 */
.grp0  { background: rgba(88,166,255,0.25); }
.grp1  { background: rgba(63,185,80,0.25); }
.grp2  { background: rgba(255,166,87,0.25); }
.grp3  { background: rgba(210,168,255,0.25); }
.grp4  { background: rgba(255,123,114,0.25); }
.grp5  { background: rgba(121,192,255,0.2); }
.grp6  { background: rgba(56,211,159,0.2); }
.grp7  { background: rgba(247,208,111,0.2); }
.grp8  { background: rgba(195,149,255,0.2); }
.grp9  { background: rgba(255,183,77,0.2); }
.ntn-field { outline: 1.5px solid #ffa657; }

/* 高亮卡片 */
.highlight-section { margin-bottom: 10px; }
.hl-title  { font-size: 12px; font-weight: 500; color: var(--vp-c-text-2); margin-bottom: 8px; }
.hl-cards  { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
.hl-card   { background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
             border-radius: 8px; padding: 10px 12px; }
.hl-name   { font-size: 11px; color: var(--vp-c-text-3); margin-bottom: 3px; }
.hl-val    { font-size: 17px; font-weight: 700; color: var(--vp-c-brand-1);
             font-family: var(--vp-font-family-mono); margin-bottom: 3px; }
.hl-desc   { font-size: 11px; color: var(--vp-c-text-2); line-height: 1.5; }

.dfp-hint { font-size: 11.5px; color: var(--vp-c-text-3); text-align: center; }
</style>
