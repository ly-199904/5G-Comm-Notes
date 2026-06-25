<script setup lang="ts">
/**
 * RRCStateMachine.vue
 * 5G NR RRC 三态机交互组件 —— IDLE / INACTIVE / CONNECTED
 *  - 点击状态节点：查看该状态下 UE 行为 / 监听内容 / 上下文 / 标识
 *  - 点击转换箭头：查看触发条件 / 过程 / 关键消息 / 关键 IE / 3GPP 出处 / NTN 注记
 *  - "播放生命周期"：自动走一遍 IDLE→CONNECTED→INACTIVE→CONNECTED→IDLE
 * 协议依据：TS 38.331 §5.3，TS 38.300 §9.2.2，TR 38.821 §7（NTN）
 */
import { ref, computed, onUnmounted } from 'vue'

type StateId = 'IDLE' | 'INACTIVE' | 'CONNECTED'
type Sel = { kind: 'state'; id: StateId } | { kind: 'trans'; id: string } | null

interface StateInfo {
  id: StateId
  name: string
  color: string
  power: string
  context: string
  monitors: string
  mobility: string
  identity: string
  desc: string
}

interface TransInfo {
  id: string
  from: StateId
  to: StateId
  short: string
  color: string
  trigger: string
  procedure: string
  messages: string[]
  ctxChange: string
  ies: string[]
  spec: string
  ntn: string
}

const C = {
  idle: '#8b949e', inact: '#d29922', conn: '#3fb950',
  setup: '#f85149', resume: '#58a6ff', release: '#8b949e', rnau: '#d29922',
}

const STATES: Record<StateId, StateInfo> = {
  IDLE: {
    id: 'IDLE', name: 'RRC_IDLE', color: C.idle,
    power: '最低（深睡 + 寻呼 DRX）',
    context: '无 AS 上下文 —— UE 与网络均不保存接入层上下文',
    monitors: 'CN 寻呼（P-RNTI，按 5G-S-TMSI 算 PF/PO）、SIB、小区重选测量',
    mobility: 'UE 自主小区重选（Cell Reselection），网络不感知',
    identity: '5G-S-TMSI（核心网级，CM-IDLE 对应）',
    desc: '开机后或释放后的"待命"态。只能听不能说，要发数据须先 RRCSetup 建立连接。',
  },
  INACTIVE: {
    id: 'INACTIVE', name: 'RRC_INACTIVE', color: C.inact,
    power: '较低（接近 IDLE，但保留上下文）',
    context: 'UE 与 anchor gNB 双侧存储完整 AS 上下文；N2/NGAP 对 AMF 保持（CN 仍视为 CM-CONNECTED）',
    monitors: 'RAN 寻呼（I-RNTI，RNA 范围内）+ CN 寻呼、SIB、RNA 内重选',
    mobility: 'UE 自主小区重选；离开 RNA 触发 RNAU；网络不做切换',
    identity: 'I-RNTI（RAN 级）+ 保留 5G-S-TMSI',
    desc: '5G 新增态（LTE 无）。为频繁小数据/突发流量而生：上下文已存，恢复只需 RRCResume，省去完整建立的安全与重配往返。',
  },
  CONNECTED: {
    id: 'CONNECTED', name: 'RRC_CONNECTED', color: C.conn,
    power: '最高（持续盲检 PDCCH + 反馈 + 测量）',
    context: '完整 AS 上下文激活；SRB1/2 + DRB 已建立；N2 连接活跃',
    monitors: 'PDCCH（C-RNTI）盲检、CSI 反馈、RRM 测量上报（供切换决策）',
    mobility: '网络控制移动性 —— 切换（Handover）+ 波束级移动性',
    identity: 'C-RNTI（小区级，每次连接/切换重分配）',
    desc: '真正收发用户数据的态。调度、HARQ、功控、测量都在这里运行（Phase 1/2 的全部机制）。',
  },
}

const TRANS: TransInfo[] = [
  {
    id: 'setup', from: 'IDLE', to: 'CONNECTED', short: 'Setup', color: C.setup,
    trigger: 'NAS 触发：初始接入 / 上行数据到达 / 被叫（CN 寻呼后）',
    procedure: 'RRC Connection Establishment（RRCSetup）',
    messages: [
      'RRCSetupRequest（Msg3，CCCH，含 ue-Identity + establishmentCause）',
      'RRCSetup（Msg4，建立 SRB1）',
      'RRCSetupComplete（DCCH，捎带 NAS Registration/Service Request）',
      '（后续）SecurityModeCommand / Complete、RRCReconfiguration 建 DRB',
    ],
    ctxChange: '从零建立完整 AS 上下文 → 进入 CONNECTED',
    ies: ['ue-Identity（5G-S-TMSI 或 39bit 随机数）', 'establishmentCause', 'rrc-TransactionIdentifier'],
    spec: '38.331 §5.3.3',
    ntn: '完整建立约 4 个空口往返；NTN 大 RTT 下挂钟时延显著（GEO 近 2 s），凸显 INACTIVE 价值',
  },
  {
    id: 'release', from: 'CONNECTED', to: 'IDLE', short: 'Release', color: C.release,
    trigger: '连接释放：业务结束 / 不活动定时器超时（网络决策）',
    procedure: 'RRC Connection Release（RRCRelease，无 suspendConfig）',
    messages: ['RRCRelease（DCCH，releaseCause；可含 redirectedCarrierInfo / 重选优先级）'],
    ctxChange: '丢弃 AS 上下文 → 回到 IDLE（下次须完整 RRCSetup）',
    ies: ['releaseCause', 'redirectedCarrierInfo（可选，重定向）', 'cellReselectionPriorities（可选）'],
    spec: '38.331 §5.3.8',
    ntn: 'NTN 中若立即释放，再接入成本高 → 网络更倾向用 suspendConfig 转 INACTIVE',
  },
  {
    id: 'suspend', from: 'CONNECTED', to: 'INACTIVE', short: 'Suspend', color: C.inact,
    trigger: '网络决定挂起（业务间歇但预期很快再来，如 IoT/突发）',
    procedure: 'RRCRelease + suspendConfig（挂起而非释放）',
    messages: ['RRCRelease（携带 suspendConfig：分配 I-RNTI、RNA、t380、ran-PagingCycle）'],
    ctxChange: '存储 AS 上下文于 UE 与 anchor gNB；保持 N2 → 进入 INACTIVE',
    ies: ['suspendConfig.fullI-RNTI / shortI-RNTI', 'ran-NotificationAreaInfo', 't380（周期 RNAU 定时器）', 'ran-PagingCycle'],
    spec: '38.331 §5.3.8.3',
    ntn: 'NTN 卫星驻留短，RNA 设计与 t380 取值需结合星历，避免无谓 RNAU 风暴',
  },
  {
    id: 'resume', from: 'INACTIVE', to: 'CONNECTED', short: 'Resume', color: C.resume,
    trigger: '上行数据到达 / 收到 RAN 寻呼 / RNAU 需进连接态完成',
    procedure: 'RRC Connection Resume（RRCResume）',
    messages: [
      'RRCResumeRequest（Msg3，含 resumeIdentity=I-RNTI、resumeMAC-I、resumeCause）',
      'RRCResume（Msg4，恢复 SRB/DRB；安全密钥从存储上下文重推）',
      'RRCResumeComplete',
    ],
    ctxChange: '从存储上下文恢复 → 进入 CONNECTED（省去 SecurityModeCommand + RRCReconfiguration）',
    ies: ['resumeIdentity（I-RNTI）', 'resumeMAC-I（短 MAC-I，完整性校验）', 'resumeCause'],
    spec: '38.331 §5.3.13',
    ntn: '相对完整建立省约 2 个空口往返 → NTN 中挂钟收益随 RTT 线性放大（仿真 LEO 省 ~30 ms、GEO 省 ~1.4 s）',
  },
  {
    id: 'inact-release', from: 'INACTIVE', to: 'IDLE', short: 'Release', color: C.release,
    trigger: '网络决定释放上下文；或 Resume 失败（anchor 取回上下文失败 → RRCSetup 回退）',
    procedure: 'RRCRelease（经 Resume 流程下发）/ 回退到 RRCSetup',
    messages: ['RRCRelease', '或：网络回应 RRCSetup（fallback，丢弃旧上下文）'],
    ctxChange: '丢弃存储的 AS 上下文 → 回到 IDLE',
    ies: ['releaseCause', '（fallback 时）按 RRCSetup 处理'],
    spec: '38.331 §5.3.13（resume 失败处理）',
    ntn: 'NTN 中跨星 Xn 上下文取回时延大，取回失败回退概率上升 → 需关注 anchor 选择策略',
  },
  {
    id: 'rnau', from: 'INACTIVE', to: 'INACTIVE', short: 'RNAU', color: C.rnau,
    trigger: '周期触发（t380 超时）或 移动触发（离开当前 RNA）',
    procedure: 'RNA Update（经 RRCResumeRequest，resumeCause=rna-Update）',
    messages: ['RRCResumeRequest（resumeCause=rna-Update）', '网络回 RRCRelease+suspendConfig（更新 RNA 后继续 INACTIVE）'],
    ctxChange: '刷新位置登记，更新 RNA → 仍停留 INACTIVE',
    ies: ['resumeCause=rna-Update', '更新后的 ran-NotificationAreaInfo'],
    spec: '38.331 §5.3.13.8',
    ntn: '地移波束 / moving cell 下小区频繁切换易触发移动 RNAU，是 NTN INACTIVE 的主要开销来源',
  },
]

// ── 几何（row 布局，viewBox 660×320）──
const POS: Record<StateId, { x: number; y: number }> = {
  IDLE: { x: 110, y: 120 },
  CONNECTED: { x: 330, y: 120 },
  INACTIVE: { x: 550, y: 120 },
}
const R = 48

// 转换的 SVG 路径与标签位置（手工排布，保证不重叠）
const PATHS: Record<string, { d: string; lx: number; ly: number; mid: { x: number; y: number } }> = {
  // IDLE ↔ CONNECTED（上 setup→，下 ←release）
  setup:    { d: 'M 162 102 L 278 102', lx: 220, ly: 90,  mid: { x: 220, y: 102 } },
  release:  { d: 'M 278 138 L 162 138', lx: 220, ly: 158, mid: { x: 220, y: 138 } },
  // CONNECTED ↔ INACTIVE（上 suspend→，下 ←resume）
  suspend:  { d: 'M 382 102 L 498 102', lx: 440, ly: 90,  mid: { x: 440, y: 102 } },
  resume:   { d: 'M 498 138 L 382 138', lx: 440, ly: 158, mid: { x: 440, y: 138 } },
  // INACTIVE → IDLE（底部大弧）
  'inact-release': { d: 'M 540 162 Q 330 300 120 162', lx: 330, ly: 300, mid: { x: 330, y: 252 } },
  // INACTIVE 自环（RNAU，顶部小环）
  rnau: { d: 'M 532 80 C 512 36, 588 36, 568 80', lx: 550, ly: 30, mid: { x: 550, y: 44 } },
}

const selected = ref<Sel>(null)
const playing = ref(false)
let timer: number | undefined

const activeState = ref<StateId>('IDLE')

function pick(sel: Sel) {
  if (playing.value) stopPlay()
  selected.value = sel
  if (sel?.kind === 'state') activeState.value = sel.id
}

const detailKind = computed(() => selected.value?.kind ?? null)
const stateDetail = computed<StateInfo | null>(() =>
  selected.value?.kind === 'state' ? STATES[selected.value.id] : null)
const transDetail = computed<TransInfo | null>(() =>
  selected.value?.kind === 'trans' ? (TRANS.find(t => t.id === selected.value!.id) ?? null) : null)

// 高亮逻辑
function stateDim(id: StateId): boolean {
  if (!selected.value) return false
  if (selected.value.kind === 'state') return selected.value.id !== id
  const t = TRANS.find(x => x.id === selected.value!.id)!
  return t.from !== id && t.to !== id
}
function transDim(id: string): boolean {
  if (!selected.value) return false
  if (selected.value.kind === 'trans') return selected.value.id !== id
  const t = TRANS.find(x => x.id === id)!
  return t.from !== selected.value.id && t.to !== selected.value.id
}

// ── 生命周期播放 ──
const LIFECYCLE: Sel[] = [
  { kind: 'state', id: 'IDLE' },
  { kind: 'trans', id: 'setup' },
  { kind: 'state', id: 'CONNECTED' },
  { kind: 'trans', id: 'suspend' },
  { kind: 'state', id: 'INACTIVE' },
  { kind: 'trans', id: 'resume' },
  { kind: 'state', id: 'CONNECTED' },
  { kind: 'trans', id: 'release' },
  { kind: 'state', id: 'IDLE' },
]
let lcIdx = 0
function startPlay() {
  playing.value = true
  lcIdx = 0
  step()
  timer = window.setInterval(step, 1400)
}
function step() {
  const s = LIFECYCLE[lcIdx]
  selected.value = s
  if (s?.kind === 'state') activeState.value = s.id
  lcIdx++
  if (lcIdx >= LIFECYCLE.length) { lcIdx = 0 }
}
function stopPlay() {
  playing.value = false
  if (timer) { clearInterval(timer); timer = undefined }
}
function togglePlay() { playing.value ? stopPlay() : startPlay() }

onUnmounted(() => { if (timer) clearInterval(timer) })

function nodeFill(id: StateId): string {
  return STATES[id].color
}
</script>

<template>
  <div class="rrc-sm">
    <div class="rrc-head">
      <div class="rrc-title">RRC 三态机 · 交互</div>
      <div class="rrc-actions">
        <button class="play-btn" :class="{ on: playing }" @click="togglePlay">
          {{ playing ? '⏸ 暂停' : '▶ 播放生命周期' }}
        </button>
        <button class="reset-btn" @click="pick(null)" :disabled="!selected">清除选择</button>
      </div>
    </div>

    <div class="rrc-body">
      <!-- 状态机图 -->
      <div class="diagram-wrap">
        <svg viewBox="0 0 660 320" class="diagram" role="img" aria-label="RRC 状态机示意图">
          <!-- 箭头 marker（按色） -->
          <defs>
            <marker v-for="(col, key) in { setup: C.setup, resume: C.resume, release: C.release, inact: C.inact, rnau: C.rnau }"
                    :key="key" :id="'arr-' + key" markerWidth="9" markerHeight="9"
                    refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L7,3 L0,6 Z" :fill="col" />
            </marker>
          </defs>

          <!-- 转换箭头 -->
          <g v-for="t in TRANS" :key="t.id"
             class="trans-g" :class="{ dim: transDim(t.id), active: selected?.kind==='trans' && selected.id===t.id }"
             @click="pick({ kind: 'trans', id: t.id })">
            <!-- 加宽透明命中区 -->
            <path :d="PATHS[t.id].d" fill="none" stroke="transparent" stroke-width="16" />
            <!-- 可见箭头 -->
            <path :d="PATHS[t.id].d" fill="none" :stroke="t.color" stroke-width="2.2"
                  :marker-end="t.id==='setup' ? 'url(#arr-setup)'
                             : t.id==='resume' ? 'url(#arr-resume)'
                             : t.id==='suspend' ? 'url(#arr-inact)'
                             : t.id==='rnau' ? 'url(#arr-rnau)'
                             : 'url(#arr-release)'" />
            <text :x="PATHS[t.id].lx" :y="PATHS[t.id].ly" class="trans-label" :fill="t.color">
              {{ t.short }}
            </text>
          </g>

          <!-- 状态节点 -->
          <g v-for="(s, id) in STATES" :key="id"
             class="state-g" :class="{ dim: stateDim(id as StateId), live: activeState===id }"
             @click="pick({ kind: 'state', id: id as StateId })">
            <circle :cx="POS[id as StateId].x" :cy="POS[id as StateId].y" :r="R"
                    :fill="nodeFill(id as StateId)" fill-opacity="0.16"
                    :stroke="nodeFill(id as StateId)" stroke-width="2.4" class="state-circle" />
            <text :x="POS[id as StateId].x" :y="POS[id as StateId].y - 6" class="state-name"
                  :fill="nodeFill(id as StateId)">{{ s.name.replace('RRC_', '') }}</text>
            <text :x="POS[id as StateId].x" :y="POS[id as StateId].y + 12" class="state-sub">RRC</text>
          </g>
        </svg>

        <div class="legend">
          <span class="lg"><i :style="{ background: C.setup }"></i>建立(高开销)</span>
          <span class="lg"><i :style="{ background: C.resume }"></i>恢复(低开销)</span>
          <span class="lg"><i :style="{ background: C.inact }"></i>挂起/RNAU</span>
          <span class="lg"><i :style="{ background: C.release }"></i>释放</span>
        </div>
      </div>

      <!-- 详情面板 -->
      <div class="detail">
        <Transition name="fade" mode="out-in">
          <!-- 缺省提示 -->
          <div v-if="!selected" key="empty" class="detail-empty">
            <div class="empty-icon">◎</div>
            <p>点击<b>状态节点</b>查看该态下 UE 的行为，或点击<b>转换箭头</b>查看触发过程与关键 IE。</p>
            <p class="empty-tip">也可点「▶ 播放生命周期」自动走一遍三态流转。</p>
          </div>

          <!-- 状态详情 -->
          <div v-else-if="detailKind==='state' && stateDetail" key="state" class="detail-inner">
            <div class="d-head" :style="{ borderColor: stateDetail.color }">
              <span class="d-dot" :style="{ background: stateDetail.color }"></span>
              <span class="d-name" :style="{ color: stateDetail.color }">{{ stateDetail.name }}</span>
            </div>
            <p class="d-desc">{{ stateDetail.desc }}</p>
            <div class="kv"><span class="k">功耗</span><span class="v">{{ stateDetail.power }}</span></div>
            <div class="kv"><span class="k">上下文</span><span class="v">{{ stateDetail.context }}</span></div>
            <div class="kv"><span class="k">监听</span><span class="v">{{ stateDetail.monitors }}</span></div>
            <div class="kv"><span class="k">移动性</span><span class="v">{{ stateDetail.mobility }}</span></div>
            <div class="kv"><span class="k">标识</span><span class="v mono">{{ stateDetail.identity }}</span></div>
          </div>

          <!-- 转换详情 -->
          <div v-else-if="detailKind==='trans' && transDetail" key="trans" class="detail-inner">
            <div class="d-head" :style="{ borderColor: transDetail.color }">
              <span class="d-flow">
                <b :style="{ color: STATES[transDetail.from].color }">{{ STATES[transDetail.from].name.replace('RRC_','') }}</b>
                <span class="arrow" :style="{ color: transDetail.color }">→</span>
                <b :style="{ color: STATES[transDetail.to].color }">{{ STATES[transDetail.to].name.replace('RRC_','') }}</b>
              </span>
              <span class="d-spec">{{ transDetail.spec }}</span>
            </div>
            <div class="kv"><span class="k">过程</span><span class="v mono">{{ transDetail.procedure }}</span></div>
            <div class="kv"><span class="k">触发</span><span class="v">{{ transDetail.trigger }}</span></div>
            <div class="kv"><span class="k">上下文</span><span class="v">{{ transDetail.ctxChange }}</span></div>
            <div class="msg-block">
              <div class="mb-label">关键消息</div>
              <ol class="mb-list">
                <li v-for="(m, i) in transDetail.messages" :key="i">{{ m }}</li>
              </ol>
            </div>
            <div class="msg-block">
              <div class="mb-label">关键 IE</div>
              <div class="ie-chips">
                <code v-for="(ie, i) in transDetail.ies" :key="i" class="ie-chip">{{ ie }}</code>
              </div>
            </div>
            <div class="ntn-box">
              <span class="ntn-ic">🛰️</span>
              <span class="ntn-tx">{{ transDetail.ntn }}</span>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rrc-sm {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  padding: 16px 18px 18px;
  margin: 22px 0;
  font-family: var(--vp-font-family-base);
}

.rrc-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px; gap: 10px; flex-wrap: wrap;
}
.rrc-title { font-size: 14px; font-weight: 700; color: var(--vp-c-text-1); }
.rrc-actions { display: flex; gap: 8px; }

.play-btn, .reset-btn {
  font-size: 12px; padding: 5px 12px; border-radius: 7px; cursor: pointer;
  border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-2); transition: all .15s;
}
.play-btn:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.play-btn.on { background: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); color: #fff; }
.reset-btn:hover:not(:disabled) { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.reset-btn:disabled { opacity: .4; cursor: not-allowed; }

.rrc-body { display: grid; grid-template-columns: 1.15fr 1fr; gap: 16px; }
@media (max-width: 760px) { .rrc-body { grid-template-columns: 1fr; } }

/* ── 图 ── */
.diagram-wrap { display: flex; flex-direction: column; gap: 8px; }
.diagram { width: 100%; height: auto; display: block; }

.state-g { cursor: pointer; transition: opacity .2s; }
.state-g.dim { opacity: .32; }
.state-circle { transition: filter .2s, stroke-width .2s; }
.state-g:hover .state-circle { filter: brightness(1.25); }
.state-g.live .state-circle {
  stroke-width: 3.4;
  filter: drop-shadow(0 0 6px currentColor);
}
.state-name { font-size: 14px; font-weight: 800; text-anchor: middle; dominant-baseline: middle; }
.state-sub  { font-size: 9px; fill: var(--vp-c-text-3); text-anchor: middle; dominant-baseline: middle; letter-spacing: .08em; }

.trans-g { cursor: pointer; transition: opacity .2s; }
.trans-g.dim { opacity: .25; }
.trans-g:hover { opacity: 1; }
.trans-g:hover path[stroke]:not([stroke="transparent"]) { stroke-width: 3.2; }
.trans-g.active path[stroke]:not([stroke="transparent"]) { stroke-width: 3.4; }
.trans-label {
  font-size: 11px; font-weight: 700; text-anchor: middle; dominant-baseline: middle;
  pointer-events: none;
}

.legend { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; padding-top: 2px; }
.lg { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--vp-c-text-3); }
.lg i { width: 16px; height: 3px; border-radius: 2px; display: inline-block; }

/* ── 详情面板 ── */
.detail {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 14px 15px;
  min-height: 280px;
}
.detail-empty {
  height: 100%; display: flex; flex-direction: column; align-items: center;
  justify-content: center; text-align: center; gap: 8px; color: var(--vp-c-text-3);
  padding: 20px 8px;
}
.empty-icon { font-size: 34px; color: var(--vp-c-divider); }
.detail-empty p { font-size: 12.5px; line-height: 1.7; margin: 0; }
.empty-tip { color: var(--vp-c-text-3); font-size: 11.5px; }

.d-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding-bottom: 9px; margin-bottom: 10px;
  border-bottom: 2px solid; flex-wrap: wrap;
}
.d-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 7px; }
.d-name { font-size: 14px; font-weight: 800; font-family: var(--vp-font-family-mono); }
.d-flow { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; font-family: var(--vp-font-family-mono); }
.d-flow .arrow { font-size: 16px; font-weight: 700; }
.d-spec { font-size: 11px; color: var(--vp-c-text-3); font-family: var(--vp-font-family-mono); }

.d-desc { font-size: 12.5px; color: var(--vp-c-text-2); line-height: 1.7; margin: 0 0 11px; }

.kv { display: flex; gap: 10px; font-size: 12px; margin-bottom: 7px; line-height: 1.6; }
.kv .k {
  flex-shrink: 0; width: 52px; color: var(--vp-c-text-3); font-weight: 600;
  text-align: right;
}
.kv .v { color: var(--vp-c-text-1); flex: 1; }
.kv .v.mono { font-family: var(--vp-font-family-mono); font-size: 11.5px; }

.msg-block { margin-top: 11px; }
.mb-label {
  font-size: 10.5px; font-weight: 700; color: var(--vp-c-text-3);
  text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px;
}
.mb-list { margin: 0; padding-left: 18px; }
.mb-list li {
  font-size: 11.5px; color: var(--vp-c-text-2); line-height: 1.65; margin-bottom: 3px;
  font-family: var(--vp-font-family-mono);
}
.ie-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.ie-chip {
  font-size: 11px; padding: 2px 7px; border-radius: 5px;
  background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1); font-family: var(--vp-font-family-mono);
}

.ntn-box {
  display: flex; gap: 8px; align-items: flex-start; margin-top: 12px;
  background: var(--vp-c-warning-soft, rgba(210,153,34,.12));
  border: 1px solid var(--vp-c-warning-2, #d29922);
  border-radius: 7px; padding: 8px 10px;
}
.ntn-ic { font-size: 13px; flex-shrink: 0; }
.ntn-tx { font-size: 11.5px; color: var(--vp-c-warning-1, #b8860b); line-height: 1.6; }

.fade-enter-active, .fade-leave-active { transition: opacity .18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
