<template>
  <div class="hpv-wrap">
    <div class="hpv-header">
      <span class="hpv-title">HARQ 进程轮转动画</span>
      <span class="hpv-spec">3GPP TS 38.321 §5.3 / 38.212 §5.4</span>
    </div>

    <!-- 配置区 -->
    <div class="hpv-controls">
      <div class="ctrl-group">
        <div class="ctrl-label">
          HARQ 进程数
          <span class="ctrl-val">{{ nProcs }}</span>
        </div>
        <div class="proc-btns">
          <button v-for="n in [2,4,8,12,16]" :key="n"
                  :class="['p-btn', { active: nProcs === n }]"
                  @click="nProcs = n">{{ n }}</button>
        </div>
      </div>

      <div class="ctrl-group">
        <div class="ctrl-label">
          有效 K1（K1_base + K_offset）
          <span class="ctrl-val">{{ k1Eff }}</span>
        </div>
        <input type="range" min="1" max="35" step="1"
               v-model.number="k1Eff" class="hpv-slider"/>
        <div class="ctrl-hints">
          <span>1（地面 FDD）</span>
          <span>35（NTN LEO 低仰角）</span>
        </div>
      </div>

      <div class="ctrl-group">
        <div class="ctrl-label">合并策略</div>
        <div class="proc-btns">
          <button :class="['p-btn', { active: scheme === 'ir' }]"
                  @click="scheme = 'ir'">IR（增量冗余）</button>
          <button :class="['p-btn', { active: scheme === 'cc' }]"
                  @click="scheme = 'cc'">CC（追踪合并）</button>
        </div>
      </div>
    </div>

    <!-- 利用率横幅 -->
    <div class="util-banner" :class="utilClass">
      <span class="util-icon">{{ utilIcon }}</span>
      <span class="util-text">
        信道利用率：<b>{{ (utilization * 100).toFixed(0) }}%</b>
        &nbsp;（需 <b>{{ minProcsNeeded }}</b> 个进程，当前 <b>{{ nProcs }}</b> 个）
        <template v-if="nProcs < minProcsNeeded">
          &nbsp;→ 每 {{ k1Eff + 1 }} 个 slot 中有
          <b>{{ k1Eff + 1 - nProcs }}</b> 个空洞
        </template>
        <template v-else>
          &nbsp;→ 流水线满载，无空洞
        </template>
      </span>
    </div>

    <!-- 甘特图 -->
    <div class="gantt-section">
      <div class="gantt-title">前 {{ totalSlots }} 个 Slot 的 HARQ 进程调度</div>
      <div class="gantt-body">

        <!-- 行标签 -->
        <div class="gantt-labels">
          <div class="gantt-label slot-hdr"></div>
          <div v-for="p in nProcs" :key="p" class="gantt-label">
            Proc#{{ p - 1 }}
          </div>
          <div class="gantt-label ack-lbl">ACK<br/>(PUCCH)</div>
        </div>

        <!-- 列（每 slot 一列） -->
        <div class="gantt-scroll">
          <div class="gantt-col" v-for="slot in totalSlots" :key="slot - 1">
            <div class="slot-num">{{ slot - 1 }}</div>
            <div
              v-for="p in nProcs" :key="p"
              :class="['gantt-cell', cellClass(slot - 1, p - 1)]"
              :title="cellTitle(slot - 1, p - 1)"
            >
              <span v-if="cellRV(slot - 1, p - 1) !== null" class="rv-lbl">
                RV={{ cellRV(slot - 1, p - 1) }}
              </span>
            </div>
            <div :class="['gantt-cell', 'ack-cell', ackClass(slot - 1)]">
              <span v-if="ackAt(slot - 1) >= 0" class="ack-txt">
                P{{ ackAt(slot - 1) }}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- 软缓冲区合并示意（Proc#0） -->
    <div class="buffer-section">
      <div class="buf-title">
        软缓冲区合并示意（Proc#0，{{ scheme === 'ir' ? 'IR: RV=0→2→3→1' : 'CC: RV=0→0→0→0' }}）
      </div>
      <div class="buf-strips">
        <div v-for="(tx, i) in proc0Txs" :key="i" class="buf-tx">
          <div class="buf-label">TX{{ i }}（RV={{ tx.rv }}）</div>
          <div class="buf-bar">
            <div
              v-for="seg in tx.segs" :key="seg.id"
              :class="['buf-seg', seg.cls]"
              :style="{ left: seg.left + '%', width: seg.width + '%' }"
              :title="seg.tip"
            ></div>
          </div>
          <div class="buf-cov">累积覆盖 {{ tx.cov }}%</div>
        </div>
        <div class="buf-legend">
          <span class="leg"><span class="ld sys"></span>系统位（新增）</span>
          <span class="leg"><span class="ld chk"></span>校验位（新增）</span>
          <span class="leg"><span class="ld overlap"></span>叠加（已覆盖）</span>
          <span class="leg"><span class="ld empty"></span>未覆盖</span>
        </div>
      </div>
    </div>

    <div class="hpv-hint">
      调整进程数和 K1 观察空洞；切换 IR/CC 对比 RV 变化
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const nProcs    = ref(4)
const k1Eff     = ref(4)
const scheme    = ref<'ir' | 'cc'>('ir')
const totalSlots = 24

const rvSeqs: Record<string, number[]> = {
  ir: [0, 2, 3, 1],
  cc: [0, 0, 0, 0],
}

// ── 进程利用率 ────────────────────────────────────────────────────────────
const minProcsNeeded = computed(() => k1Eff.value + 1)
const utilization    = computed(() =>
  Math.min(nProcs.value, minProcsNeeded.value) / minProcsNeeded.value
)
const utilClass = computed(() => {
  const u = utilization.value
  return u >= 1 ? 'util-ok' : u >= 0.6 ? 'util-warn' : 'util-bad'
})
const utilIcon = computed(() =>
  utilization.value >= 1 ? '✅' : utilization.value >= 0.6 ? '⚠️' : '❌'
)

// ── 甘特图逻辑 ────────────────────────────────────────────────────────────
// 每个 slot 分配给哪个进程（轮转，进程不足时为 null = 空洞）
function slotProc(slot: number): number | null {
  const p = slot % minProcsNeeded.value
  return p < nProcs.value ? p : null
}

// 该进程在该 slot 的传输次数（用于确定 RV）
function txCount(slot: number, proc: number): number {
  return Math.floor(slot / minProcsNeeded.value)
}

function cellClass(slot: number, proc: number): string {
  const p = slotProc(slot)
  if (p === null)   return 'cell-hole'
  if (p === proc)   return `cell-tx p${proc % 6}`
  return 'cell-idle'
}

function cellTitle(slot: number, proc: number): string {
  const p = slotProc(slot)
  if (p !== proc) return ''
  const tx = txCount(slot, proc)
  const rv = rvSeqs[scheme.value][tx % 4]
  return `Slot ${slot} | Proc#${proc} | TX${tx} | RV=${rv}`
}

function cellRV(slot: number, proc: number): number | null {
  if (slotProc(slot) !== proc) return null
  const tx = txCount(slot, proc)
  return rvSeqs[scheme.value][tx % 4]
}

function ackAt(slot: number): number {
  const src = slot - k1Eff.value - 1
  if (src < 0) return -1
  return slotProc(src) ?? -1
}

function ackClass(slot: number): string {
  return ackAt(slot) >= 0 ? 'has-ack' : ''
}

// ── 软缓冲区示意（Proc#0，最多 4 次传输）───────────────────────────────
// RV 起点百分比（BG1 近似：0/17/33/56 × 100/66）
const rvStartPct: Record<number, number> = { 0: 0, 1: 26, 2: 50, 3: 85 }
const E_PCT = 40  // 每次传输覆盖 40%

const proc0Txs = computed(() => {
  const seq = rvSeqs[scheme.value]
  const covered = new Set<number>()   // 0~99 整数代表 1% 粒度
  return seq.slice(0, 4).map((rv, txIdx) => {
    const start = rvStartPct[rv]
    const segs: any[] = []

    // 计算本次覆盖的 1% 格子（允许环绕）
    const newCells: number[] = []
    const ovlCells: number[] = []
    for (let i = 0; i < E_PCT; i++) {
      const cell = (start + i) % 100
      if (covered.has(cell)) ovlCells.push(cell)
      else newCells.push(cell)
    }

    // 将连续格子合并成段
    function toSegs(cells: number[], cls: string) {
      if (!cells.length) return
      const sorted = [...cells].sort((a, b) => a - b)
      let segStart = sorted[0], prev = sorted[0]
      for (let i = 1; i <= sorted.length; i++) {
        if (i === sorted.length || sorted[i] !== prev + 1) {
          segs.push({
            id: `${cls}-${segStart}`, cls,
            left: segStart, width: prev - segStart + 1,
            tip: `${cls === 'sys' || cls === 'chk' ? '新增' : '叠加'} ${segStart}%~${prev}%`,
          })
          if (i < sorted.length) { segStart = sorted[i] }
        }
        if (i < sorted.length) prev = sorted[i]
      }
    }

    const isSys = rv === 0   // 简化：RV=0 覆盖系统位，其余覆盖校验位
    newCells.forEach(c => covered.add(c))
    toSegs(newCells, isSys ? 'sys' : 'chk')
    toSegs(ovlCells, 'overlap')

    return { rv, segs, cov: covered.size }
  })
})
</script>

<style scoped>
.hpv-wrap {
  border: 1px solid var(--vp-c-divider); border-radius: 12px;
  padding: 20px; margin: 20px 0; background: var(--vp-c-bg-soft); font-size: 13px;
}

/* ── 顶部 ── */
.hpv-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.hpv-title  { font-size: 15px; font-weight: 600; color: var(--vp-c-text-1); }
.hpv-spec   { font-size: 11px; padding: 2px 8px; border-radius: 20px;
              background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }

/* ── 控制区 ── */
.hpv-controls {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px; margin-bottom: 12px;
}
.ctrl-group { display: flex; flex-direction: column; gap: 5px; }
.ctrl-label {
  font-size: 12px; font-weight: 500; color: var(--vp-c-text-2);
  display: flex; justify-content: space-between; align-items: center;
}
.ctrl-val   { font-family: var(--vp-font-family-mono); font-weight: 700; color: var(--vp-c-brand-1); }
.hpv-slider { width: 100%; height: 4px; cursor: pointer; accent-color: var(--vp-c-brand-1); }
.ctrl-hints { display: flex; justify-content: space-between; font-size: 10px; color: var(--vp-c-text-3); }

.proc-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.p-btn {
  padding: 4px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;
  border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-2); transition: all 0.15s;
}
.p-btn:hover  { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.p-btn.active { background: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); color: #fff; }

/* ── 利用率横幅 ── */
.util-banner {
  display: flex; align-items: flex-start; gap: 8px;
  border-radius: 8px; padding: 9px 13px; margin-bottom: 12px;
  font-size: 13px; border: 1px solid; line-height: 1.6;
}
.util-ok   { background: #e6f4ea; border-color: #a8d5b0; color: #1a5c2a; }
.util-warn { background: #fff8ee; border-color: #fcd34d; color: #92400e; }
.util-bad  { background: #fdecea; border-color: #f5b7b1; color: #7b1d1d; }
.util-icon { font-size: 15px; flex-shrink: 0; margin-top: 1px; }

/* ── 甘特图 ── */
.gantt-section { margin-bottom: 14px; }
.gantt-title   { font-size: 12px; font-weight: 500; color: var(--vp-c-text-2); margin-bottom: 8px; }
.gantt-body    { display: flex; gap: 0; overflow-x: auto; }

.gantt-labels  { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }
.gantt-label   {
  height: 28px; display: flex; align-items: center;
  font-size: 10px; color: var(--vp-c-text-3);
  width: 62px; padding-right: 6px; justify-content: flex-end;
}
.slot-hdr      { height: 16px; }
.ack-lbl       { color: #d2a8ff; }

.gantt-scroll  { display: flex; gap: 2px; flex-shrink: 0; }
.gantt-col     { display: flex; flex-direction: column; gap: 2px; }

.slot-num      { font-size: 9px; color: var(--vp-c-text-3); text-align: center;
                 height: 16px; line-height: 16px; width: 30px; }

.gantt-cell    {
  width: 30px; height: 28px; border-radius: 3px;
  display: flex; align-items: center; justify-content: center;
  font-size: 8px; transition: opacity 0.2s;
}
.cell-idle { background: var(--vp-c-bg-elv); }
.cell-hole { background: #21262d; }
.rv-lbl    { font-family: var(--vp-font-family-mono); font-size: 7.5px; color: rgba(255,255,255,0.85); }

/* 进程颜色 */
.p0 { background: rgba(88,166,255,0.65); }
.p1 { background: rgba(63,185,80,0.65); }
.p2 { background: rgba(255,166,87,0.65); }
.p3 { background: rgba(210,168,255,0.65); }
.p4 { background: rgba(255,123,114,0.65); }
.p5 { background: rgba(121,192,255,0.55); }

/* ACK 行 */
.ack-cell { background: transparent; border: 1px solid transparent; }
.has-ack  { background: rgba(210,168,255,0.45); border-color: #d2a8ff; }
.ack-txt  { font-size: 8px; color: #d2a8ff; font-family: var(--vp-font-family-mono); }

/* ── 软缓冲区示意 ── */
.buffer-section {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 12px 14px; margin-bottom: 10px;
}
.buf-title  { font-size: 12px; font-weight: 500; color: var(--vp-c-text-2); margin-bottom: 10px; }
.buf-strips { display: flex; flex-direction: column; gap: 7px; }

.buf-tx     { display: flex; align-items: center; gap: 10px; }
.buf-label  {
  font-family: var(--vp-font-family-mono); font-size: 11px;
  color: var(--vp-c-text-2); width: 110px; flex-shrink: 0;
}
.buf-bar    {
  flex: 1; height: 20px; background: var(--vp-c-bg-elv);
  border-radius: 3px; position: relative; overflow: hidden;
}
.buf-seg    { position: absolute; top: 0; height: 100%; border-radius: 2px; transition: all 0.3s; }
.buf-seg.sys     { background: rgba(88,166,255,0.75); }
.buf-seg.chk     { background: rgba(63,185,80,0.75); }
.buf-seg.overlap { background: rgba(139,148,158,0.35); }
.buf-cov    { font-size: 11px; color: var(--vp-c-text-3); width: 70px; flex-shrink: 0; text-align: right; }

.buf-legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 5px; }
.leg        { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--vp-c-text-3); }
.ld         { width: 12px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.ld.sys     { background: rgba(88,166,255,0.75); }
.ld.chk     { background: rgba(63,185,80,0.75); }
.ld.overlap { background: rgba(139,148,158,0.35); }
.ld.empty   { background: var(--vp-c-bg-elv); border: 1px solid var(--vp-c-divider); }

.hpv-hint { font-size: 11.5px; color: var(--vp-c-text-3); text-align: center; }
</style>
