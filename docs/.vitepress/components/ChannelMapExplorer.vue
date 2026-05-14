<template>
  <div class="cme-wrap">

    <!-- ── 顶部 ── -->
    <div class="cme-header">
      <span class="cme-title">信道映射导航仪</span>
      <span class="cme-spec">3GPP TS 38.321 §6.1/§6.2</span>
    </div>

    <!-- ── 方向切换 ── -->
    <div class="dir-switch">
      <button :class="['dir-btn', { active: dir === 'dl' }]" @click="select(dir === 'dl' ? null : null); dir = 'dl'; active = null">
        ⬇ 下行 Downlink
      </button>
      <button :class="['dir-btn', { active: dir === 'ul' }]" @click="select(null); dir = 'ul'; active = null">
        ⬆ 上行 Uplink
      </button>
    </div>

    <!-- ── 三列映射图 ── -->
    <div class="cme-columns">

      <!-- 逻辑信道 -->
      <div class="col">
        <div class="col-header">逻辑信道<br/><small>Logical Channel</small></div>
        <div
          v-for="lc in currentLogical"
          :key="lc.id"
          :class="['ch-node lc-node', { active: isActive(lc.id), dim: isDim(lc.id) }]"
          @click="select(lc.id)"
        >
          <span class="ch-name">{{ lc.name }}</span>
          <span class="ch-desc">{{ lc.desc }}</span>
        </div>
      </div>

      <!-- 箭头 + 传输信道 -->
      <div class="col">
        <div class="col-header">传输信道<br/><small>Transport Channel</small></div>
        <div class="tc-area">
          <div
            v-for="tc in currentTransport"
            :key="tc.id"
            :class="['ch-node tc-node', { active: isTcActive(tc.id), dim: isTcDim(tc.id) }]"
            @click="selectTc(tc.id)"
          >
            <span class="ch-name">{{ tc.name }}</span>
          </div>
        </div>
      </div>

      <!-- 物理信道 -->
      <div class="col">
        <div class="col-header">物理信道<br/><small>Physical Channel</small></div>
        <div
          v-for="pc in currentPhysical"
          :key="pc.id"
          :class="['ch-node pc-node', { active: isPcActive(pc.id), dim: isPcDim(pc.id) }]"
          @click="selectPc(pc.id)"
        >
          <span class="ch-name">{{ pc.name }}</span>
          <span class="ch-badge" v-if="pc.badge">{{ pc.badge }}</span>
        </div>
      </div>

    </div>

    <!-- ── SVG 连线层（叠加在上方）── -->
    <svg class="cme-svg" ref="svgEl" :width="svgW" :height="svgH" aria-hidden="true">
      <defs>
        <marker id="arr-active" viewBox="0 0 8 8" refX="6" refY="4"
                markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M1 1L7 4L1 7" fill="none" stroke="#646cff" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round"/>
        </marker>
        <marker id="arr-dim" viewBox="0 0 8 8" refX="6" refY="4"
                markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M1 1L7 4L1 7" fill="none" stroke="#ccc" stroke-width="1.2"
                stroke-linecap="round" stroke-linejoin="round"/>
        </marker>
      </defs>
      <path
        v-for="(line, i) in visibleLines"
        :key="i"
        :d="line.d"
        fill="none"
        :stroke="line.active ? '#646cff' : '#d1d5db'"
        :stroke-width="line.active ? 2 : 1"
        :stroke-dasharray="line.dashed ? '5 3' : 'none'"
        :marker-end="line.active ? 'url(#arr-active)' : 'url(#arr-dim)'"
        style="transition: stroke 0.2s, stroke-width 0.2s"
      />
    </svg>

    <!-- ── 详情卡片 ── -->
    <Transition name="detail-fade">
      <div class="detail-card" v-if="detail">
        <div class="detail-name">{{ detail.name }}</div>
        <div class="detail-full">{{ detail.full }}</div>
        <div class="detail-desc">{{ detail.detail }}</div>
        <div class="detail-spec" v-if="detail.spec">📎 {{ detail.spec }}</div>
        <div class="ntn-badge" v-if="detail.ntn">🛰️ {{ detail.ntn }}</div>
      </div>
    </Transition>

    <div class="cme-hint">点击任意信道节点查看详情，路径高亮显示完整映射链路</div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

// ── 数据定义 ──────────────────────────────────────────────────────────────────

const DL_LOGICAL = [
  { id: 'BCCH', name: 'BCCH', desc: '广播控制' },
  { id: 'PCCH', name: 'PCCH', desc: '寻呼控制' },
  { id: 'CCCH', name: 'CCCH', desc: '公共控制' },
  { id: 'DCCH', name: 'DCCH', desc: '专用控制' },
  { id: 'DTCH', name: 'DTCH', desc: '专用业务' },
]
const DL_TRANSPORT = [
  { id: 'BCH',    name: 'BCH' },
  { id: 'DL-SCH', name: 'DL-SCH' },
]
const DL_PHYSICAL = [
  { id: 'PBCH',  name: 'PBCH',  badge: 'Polar' },
  { id: 'PDSCH', name: 'PDSCH', badge: 'LDPC' },
  { id: 'PDCCH', name: 'PDCCH', badge: '无传输信道' },
]

const UL_LOGICAL = [
  { id: 'CCCH', name: 'CCCH', desc: '公共控制' },
  { id: 'DCCH', name: 'DCCH', desc: '专用控制' },
  { id: 'DTCH', name: 'DTCH', desc: '专用业务' },
]
const UL_TRANSPORT = [
  { id: 'UL-SCH', name: 'UL-SCH' },
]
const UL_PHYSICAL = [
  { id: 'PUSCH', name: 'PUSCH', badge: 'LDPC' },
  { id: 'PUCCH', name: 'PUCCH', badge: '无传输信道' },
  { id: 'PRACH', name: 'PRACH', badge: '无传输信道' },
]

// LC → TC → PC 映射关系
const DL_PATHS: Record<string, { tc: string; pc: string }[]> = {
  BCCH: [{ tc: 'BCH', pc: 'PBCH' }, { tc: 'DL-SCH', pc: 'PDSCH' }],
  PCCH: [{ tc: 'DL-SCH', pc: 'PDSCH' }],
  CCCH: [{ tc: 'DL-SCH', pc: 'PDSCH' }],
  DCCH: [{ tc: 'DL-SCH', pc: 'PDSCH' }],
  DTCH: [{ tc: 'DL-SCH', pc: 'PDSCH' }],
  PDCCH: [{ tc: '', pc: 'PDCCH' }],  // 直接映射
}
const UL_PATHS: Record<string, { tc: string; pc: string }[]> = {
  CCCH: [{ tc: 'UL-SCH', pc: 'PUSCH' }],
  DCCH: [{ tc: 'UL-SCH', pc: 'PUSCH' }],
  DTCH: [{ tc: 'UL-SCH', pc: 'PUSCH' }],
  PUCCH: [{ tc: '', pc: 'PUCCH' }],
  PRACH:  [{ tc: '', pc: 'PRACH' }],
}

// 详情数据库
const DETAILS: Record<string, any> = {
  BCCH:  { name: 'BCCH', full: 'Broadcast Control Channel', detail: '承载系统广播信息（MIB/SIB），所有 UE 均可接收。', spec: '38.321 §6.1.3' },
  PCCH:  { name: 'PCCH', full: 'Paging Control Channel', detail: '承载寻呼消息，通知 UE 有呼入或系统信息更新。', spec: '38.321 §6.1.3' },
  CCCH:  { name: 'CCCH', full: 'Common Control Channel', detail: '用于 UE 接入前的公共控制信令（如 RRC Setup Request）。', spec: '38.321 §6.1.3' },
  DCCH:  { name: 'DCCH', full: 'Dedicated Control Channel', detail: 'RRC_CONNECTED 状态下的专用控制信令（RRC Reconfiguration 等）。', spec: '38.321 §6.1.3' },
  DTCH:  { name: 'DTCH', full: 'Dedicated Traffic Channel', detail: '承载 UE 的用户面数据（IP 包）。', spec: '38.321 §6.1.3' },
  BCH:   { name: 'BCH', full: 'Broadcast Channel', detail: '固定格式传输信道，承载 MIB，通过 PBCH 发送。', spec: '38.321 §6.1.1' },
  'DL-SCH': { name: 'DL-SCH', full: 'Downlink Shared Channel', detail: '主要下行传输信道，支持 HARQ、AMC、MIMO，承载 SIB/数据/寻呼。', spec: '38.321 §6.1.1' },
  'UL-SCH': { name: 'UL-SCH', full: 'Uplink Shared Channel', detail: '主要上行传输信道，支持 HARQ 和 AMC。', spec: '38.321 §6.2.1' },
  PBCH:  { name: 'PBCH', full: 'Physical Broadcast Channel', detail: '承载 MIB，使用 Polar Code + QPSK，位于 SSB 的符号 #1/3。', spec: '38.211 §7.3.3', ntn: 'SIB19（卫星星历）通过 PDSCH 广播，不经 PBCH。' },
  PDSCH: { name: 'PDSCH', full: 'Physical Downlink Shared Channel', detail: '主力数据信道，LDPC 编码，支持 QPSK~256QAM，最多 8 层 MIMO。', spec: '38.211 §7.3.1', ntn: 'NTN 中 K-offset 用于调整 HARQ 时序，补偿大传播时延。' },
  PDCCH: { name: 'PDCCH', full: 'Physical Downlink Control Channel', detail: '承载 DCI 调度指令，Polar Code + QPSK（固定），不经过任何传输信道！', spec: '38.211 §7.3.2', ntn: 'PDCCH 的 DCI 携带 K-offset 字段，NTN UE 据此调整 HARQ 反馈时机。' },
  PUSCH: { name: 'PUSCH', full: 'Physical Uplink Shared Channel', detail: '上行数据信道，支持 CP-OFDM 和 DFT-s-OFDM 两种波形。', spec: '38.211 §6.3.1', ntn: 'NTN 上行优先使用 DFT-s-OFDM，PAPR 低 4~6dB，覆盖更远。' },
  PUCCH: { name: 'PUCCH', full: 'Physical Uplink Control Channel', detail: '上行控制信道，承载 HARQ-ACK / SR / CSI，5 种 Format 对应不同 UCI 比特数。', spec: '38.211 §6.3.2', ntn: 'Format 3 + π/2-BPSK 在 NTN 上行链路预算受限时使用。' },
  PRACH: { name: 'PRACH', full: 'Physical Random Access Channel', detail: '随机接入前导，使用 ZC 序列（恒包络），gNB 通过相关检测估计 TA。', spec: '38.211 §6.3.3', ntn: 'NTN Rel-17 将 ra-ResponseWindow 扩展至最大 640 slots，应对大 RTT。' },
}

// ── 状态 ──────────────────────────────────────────────────────────────────────
const dir    = ref<'dl' | 'ul'>('dl')
const active = ref<string | null>(null)

const currentLogical   = computed(() => dir.value === 'dl' ? DL_LOGICAL   : UL_LOGICAL)
const currentTransport = computed(() => dir.value === 'dl' ? DL_TRANSPORT : UL_TRANSPORT)
const currentPhysical  = computed(() => dir.value === 'dl' ? DL_PHYSICAL  : UL_PHYSICAL)
const currentPaths     = computed(() => dir.value === 'dl' ? DL_PATHS     : UL_PATHS)

const activePaths = computed(() => {
  if (!active.value) return []
  return currentPaths.value[active.value] ?? []
})
const activeTcs = computed(() => activePaths.value.map(p => p.tc).filter(Boolean))
const activePcs = computed(() => activePaths.value.map(p => p.pc))

function select(id: string | null) {
  active.value = active.value === id ? null : id
}
function selectTc(tcId: string) {
  // 找到映射到此 TC 的 LC
  const found = Object.entries(currentPaths.value).find(([, paths]) =>
    paths.some(p => p.tc === tcId)
  )
  if (found) active.value = found[0]
}
function selectPc(pcId: string) {
  const found = Object.entries(currentPaths.value).find(([, paths]) =>
    paths.some(p => p.pc === pcId)
  )
  if (found) active.value = found[0]
}

function isActive(id: string)   { return active.value === id }
function isDim(id: string)      { return active.value !== null && active.value !== id }
function isTcActive(id: string) { return activeTcs.value.includes(id) }
function isTcDim(id: string)    { return active.value !== null && !activeTcs.value.includes(id) }
function isPcActive(id: string) { return activePcs.value.includes(id) }
function isPcDim(id: string)    { return active.value !== null && !activePcs.value.includes(id) }

const detail = computed(() => {
  if (!active.value) return null
  return DETAILS[active.value] ?? null
})

// SVG 连线（简化：水平贯穿箭头）
const svgW = ref(0)
const svgH = ref(0)
const visibleLines = ref<any[]>([])
</script>

<style scoped>
.cme-wrap {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
  background: var(--vp-c-bg-soft);
  font-size: 13px;
}

.cme-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.cme-title { font-size: 15px; font-weight: 600; color: var(--vp-c-text-1); }
.cme-spec  { font-size: 11px; padding: 2px 8px; border-radius: 20px; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }

/* ── 方向切换 ── */
.dir-switch { display: flex; gap: 8px; margin-bottom: 16px; }
.dir-btn {
  padding: 6px 16px;
  border-radius: 8px;
  border: 1.5px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.dir-btn:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.dir-btn.active { background: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); color: #fff; }

/* ── 三列 ── */
.cme-columns {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}
.col { display: flex; flex-direction: column; gap: 8px; }
.col-header {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--vp-c-divider);
  line-height: 1.5;
}
.col-header small { font-weight: 400; font-size: 10px; }

/* ── 信道节点 ── */
.ch-node {
  border-radius: 8px;
  border: 1.5px solid var(--vp-c-divider);
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.18s;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--vp-c-bg);
}
.ch-node:hover { border-color: var(--vp-c-brand-1); transform: translateY(-1px); }
.ch-node.active {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  box-shadow: 0 2px 8px rgba(100, 108, 255, 0.15);
}
.ch-node.dim { opacity: 0.3; }

.lc-node.active { border-color: #2563eb; background: #eff6ff; }
.tc-node.active { border-color: #16a34a; background: #f0fdf4; }
.pc-node.active { border-color: #9333ea; background: #faf5ff; }
.tc-area { display: flex; flex-direction: column; gap: 8px; justify-content: center; height: 100%; }

.ch-name  { font-size: 13px; font-weight: 600; color: var(--vp-c-text-1); font-family: var(--vp-font-family-mono); }
.ch-desc  { font-size: 10.5px; color: var(--vp-c-text-3); }
.ch-badge { font-size: 10px; padding: 1px 6px; border-radius: 10px; background: var(--vp-c-bg-elv); color: var(--vp-c-text-3); width: fit-content; margin-top: 2px; }

/* ── SVG 连线 ── */
.cme-svg { position: absolute; pointer-events: none; top: 0; left: 0; }

/* ── 详情卡片 ── */
.detail-card {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-left: 3px solid var(--vp-c-brand-1);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.detail-name { font-size: 14px; font-weight: 700; color: var(--vp-c-text-1); font-family: var(--vp-font-family-mono); margin-bottom: 2px; }
.detail-full { font-size: 11px; color: var(--vp-c-text-3); margin-bottom: 6px; }
.detail-desc { font-size: 13px; color: var(--vp-c-text-1); line-height: 1.6; }
.detail-spec { font-size: 11px; color: var(--vp-c-text-3); margin-top: 6px; }
.ntn-badge   { font-size: 11.5px; color: #b45309; background: #fef3c7; border-radius: 4px; padding: 4px 8px; margin-top: 6px; display: inline-block; }

.detail-fade-enter-active, .detail-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.detail-fade-enter-from, .detail-fade-leave-to { opacity: 0; transform: translateY(4px); }

.cme-hint { font-size: 11.5px; color: var(--vp-c-text-3); text-align: center; }
</style>
