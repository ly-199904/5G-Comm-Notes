<template>
  <div class="cbv-wrap">
    <div class="cbv-header">
      <span class="cbv-title">圆形缓冲区 LLR 叠加动画</span>
      <span class="cbv-spec">3GPP TS 38.212 §5.4.2.1</span>
    </div>

    <div class="cbv-controls">
      <div class="ctrl-group">
        <div class="ctrl-label">合并策略</div>
        <div class="btn-row">
          <button :class="['cbtn', { active: scheme === 'ir' }]"
                  @click="scheme = 'ir'; reset()">IR（增量冗余）RV=0→2→3→1</button>
          <button :class="['cbtn', { active: scheme === 'cc' }]"
                  @click="scheme = 'cc'; reset()">CC（追踪合并）RV=0→0→0→0</button>
        </div>
      </div>
      <div class="ctrl-group">
        <div class="ctrl-label">
          每次传输覆盖比例 E/N_cb
          <span class="cv">{{ ePct }}%（约 {{ E }} bit）</span>
        </div>
        <input type="range" min="15" max="70" step="5"
               v-model.number="ePct" @input="reset" class="cbv-slider"/>
        <div class="ctrl-hints"><span>15%（低码率）</span><span>70%（高码率）</span></div>
      </div>
    </div>

    <!-- 缓冲区条带 -->
    <div class="buf-vis">
      <div class="buf-header">
        <span class="buf-title">圆形缓冲区（N_cb={{ Ncb }}，每格≈1%）</span>
        <span class="cov-badge" :class="covBadgeCls">覆盖率 {{ covPct }}%</span>
      </div>
      <div class="buf-strip-wrap">
        <div class="buf-strip">
          <div v-for="i in 100" :key="i-1"
               :class="['buf-cell', stripCls(i-1)]"
               :title="stripLabel(i-1)"></div>
        </div>
        <div v-if="currentTx < 4" class="k0-marker" :style="{ left: k0Pct + '%' }">
          <div class="k0-line"></div>
          <div class="k0-tag">k₀={{ k0 }} RV={{ nextRV }}</div>
        </div>
        <div class="sys-sep"><div class="sys-line"></div></div>
      </div>
      <div class="buf-region-labels">
        <span style="width:35%;text-align:center;font-size:10px;color:var(--vp-c-text-3)">← 系统位</span>
        <span style="flex:1;text-align:center;font-size:10px;color:var(--vp-c-text-3)">校验位 →</span>
      </div>
      <div class="buf-legend">
        <span class="leg"><span class="ld nsys"></span>新·系统位</span>
        <span class="leg"><span class="ld nchk"></span>新·校验位</span>
        <span class="leg"><span class="ld ovlp"></span>LLR叠加</span>
        <span class="leg"><span class="ld osys"></span>已覆盖·系统位</span>
        <span class="leg"><span class="ld ochk"></span>已覆盖·校验位</span>
        <span class="leg"><span class="ld ucov"></span>未覆盖</span>
      </div>
    </div>

    <!-- 传输记录 -->
    <div class="tx-table">
      <div class="tx-hdr">
        <span>传输</span><span>RV</span><span>k₀</span>
        <span>新增bit</span><span>累积覆盖</span><span>等效码率</span><span>增益说明</span>
      </div>
      <div v-if="txHistory.length === 0" class="tx-empty">
        点击"执行下一次传输"开始逐步演示
      </div>
      <div v-for="(tx, i) in txHistory" :key="i"
           :class="['tx-row', { latest: i === txHistory.length - 1 }]">
        <span class="tx-idx">TX{{ i }}</span>
        <span :class="['tx-rv', `rv${tx.rv}`]">{{ tx.rv }}</span>
        <span class="tx-k0">{{ tx.k0 }}</span>
        <span class="tx-new">+{{ tx.newBits }}</span>
        <span class="tx-cov">{{ tx.cumCov }}%</span>
        <span class="tx-rate">{{ tx.effRate }}</span>
        <span class="tx-gain" :class="tx.gainCls">{{ tx.gainDesc }}</span>
      </div>
    </div>

    <div class="cbv-btns">
      <button class="cbv-btn primary" @click="nextTx" :disabled="currentTx >= 4">
        {{ currentTx >= 4 ? '✅ 4次传输完成' : `▶ 执行 TX${currentTx}（RV=${nextRV}）` }}
      </button>
      <button class="cbv-btn" @click="reset">🔄 重置</button>
    </div>

    <Transition name="cfade">
      <div v-if="currentTx >= 4" class="conclusion" :class="scheme">
        <template v-if="scheme === 'ir'">
          ✅ <b>IR 完成 4 次传输</b>：缓冲区覆盖 <b>{{ covPct }}%</b>，
          等效码率从 1/{{ Math.round(Ncb/E) }} 降至约 1/{{ Math.round(Ncb/E/4) }}。
          每次重传提供全新校验比特，解码能力<b>超线性增长</b>。
        </template>
        <template v-else>
          ⚠️ <b>CC 完成 4 次传输</b>：缓冲区覆盖始终 <b>{{ covPct }}%</b>（不增加）。
          每次仅通过 LLR 叠加提升等效 SNR（约 <b>3dB/次</b>），等效码率<b>始终为 1/{{ Math.round(Ncb/E) }}</b>。
        </template>
      </div>
    </Transition>

    <div class="cbv-hint">逐步点击观察 IR 与 CC 在缓冲区覆盖上的本质区别</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const scheme  = ref<'ir'|'cc'>('ir')
const Ncb     = 132
const ePct    = ref(40)
const E       = computed(() => Math.round(Ncb * ePct.value / 100))

const rvSeqs: Record<string, number[]> = { ir: [0,2,3,1], cc: [0,0,0,0] }
function rvStart(rv: number) {
  return Math.floor(({ 0:0, 1:17, 2:33, 3:56 }[rv] ?? 0) * Ncb / 66)
}

// 每格状态: 0=未覆盖 1=新·系统位 2=新·校验位 3=叠加 4=旧·系统位 5=旧·校验位
const bufState  = ref<number[]>(Array(100).fill(0))
const currentTx = ref(0)
const txHistory = ref<any[]>([])

function reset() { bufState.value = Array(100).fill(0); currentTx.value = 0; txHistory.value = [] }

const k0    = computed(() => currentTx.value < 4 ? rvStart(rvSeqs[scheme.value][currentTx.value]) : 0)
const k0Pct = computed(() => Math.round(k0.value / Ncb * 100))
const nextRV = computed(() => currentTx.value < 4 ? rvSeqs[scheme.value][currentTx.value] : -1)
const covPct = computed(() => bufState.value.filter(v => v !== 0).length)
const covBadgeCls = computed(() => covPct.value < 40 ? 'badge-low' : covPct.value < 70 ? 'badge-mid' : 'badge-high')

function stripCls(i: number) {
  return ['ucov','nsys','nchk','ovlp','osys','ochk'][bufState.value[i]]
}
function stripLabel(i: number) {
  return ['未覆盖','新·系统位','新·校验位','LLR叠加','已覆盖·系统位','已覆盖·校验位'][bufState.value[i]]
}

function nextTx() {
  if (currentTx.value >= 4) return
  const rv   = rvSeqs[scheme.value][currentTx.value]
  const k0v  = rvStart(rv)
  const ePc  = Math.round(E.value / Ncb * 100)
  const k0p  = Math.round(k0v / Ncb * 100)

  const nb = bufState.value.map(v => (v===1?4:v===2?5:v))
  let newBits = 0
  for (let i = 0; i < ePc; i++) {
    const c = (k0p + i) % 100
    const isSys = c < 35
    if (nb[c] === 0) { nb[c] = isSys ? 1 : 2; newBits++ }
    else if (nb[c] !== 3) nb[c] = 3
  }
  bufState.value = nb

  const cumCov  = nb.filter(v => v!==0).length
  const effRate = `1/${Math.round(Ncb / (E.value * (currentTx.value + 1)))}`
  const pct = Math.round(newBits / ePc * 100)
  const gainDesc = scheme.value === 'ir'
    ? (pct > 70 ? `+${pct}% 全新信息` : pct > 30 ? `+${pct}% 新信息` : `+${pct}% 少量新增`)
    : (currentTx.value === 0 ? '首传（基线）' : '+3dB SNR，无新信息')
  const gainCls = scheme.value === 'ir'
    ? (pct > 70 ? 'gain-high' : pct > 30 ? 'gain-mid' : 'gain-low')
    : (currentTx.value === 0 ? 'gain-mid' : 'gain-low')

  txHistory.value.push({ rv, k0: k0v, newBits: Math.round(newBits/100*Ncb), cumCov, effRate, gainDesc, gainCls })
  currentTx.value++
}
</script>

<style scoped>
.cbv-wrap{border:1px solid var(--vp-c-divider);border-radius:12px;padding:20px;margin:20px 0;background:var(--vp-c-bg-soft);font-size:13px}
.cbv-header{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.cbv-title{font-size:15px;font-weight:600;color:var(--vp-c-text-1)}
.cbv-spec{font-size:11px;padding:2px 8px;border-radius:20px;background:var(--vp-c-brand-soft);color:var(--vp-c-brand-1)}
.cbv-controls{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
@media(max-width:560px){.cbv-controls{grid-template-columns:1fr}}
.ctrl-group{display:flex;flex-direction:column;gap:5px}
.ctrl-label{font-size:12px;color:var(--vp-c-text-2);font-weight:500}
.cv{font-family:var(--vp-font-family-mono);color:var(--vp-c-brand-1);font-weight:700}
.cbv-slider{width:100%;height:4px;cursor:pointer;accent-color:var(--vp-c-brand-1)}
.ctrl-hints{display:flex;justify-content:space-between;font-size:10px;color:var(--vp-c-text-3)}
.btn-row{display:flex;gap:6px;flex-wrap:wrap}
.cbtn{padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;border:1.5px solid var(--vp-c-divider);background:var(--vp-c-bg);color:var(--vp-c-text-2);transition:all .15s}
.cbtn:hover{border-color:var(--vp-c-brand-1);color:var(--vp-c-brand-1)}
.cbtn.active{background:var(--vp-c-brand-1);border-color:var(--vp-c-brand-1);color:#fff}
.buf-vis{background:var(--vp-c-bg);border:1px solid var(--vp-c-divider);border-radius:8px;padding:12px;margin-bottom:12px}
.buf-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px}
.buf-title{font-size:12px;font-weight:500;color:var(--vp-c-text-2)}
.cov-badge{font-size:12px;font-weight:700;padding:2px 10px;border-radius:20px;font-family:var(--vp-font-family-mono)}
.badge-low{background:#fdecea;color:#c53030}.badge-mid{background:#fff8ee;color:#92400e}.badge-high{background:#e6f4ea;color:#1a5c2a}
.buf-strip-wrap{position:relative;margin-bottom:4px}
.buf-strip{display:flex;height:28px;border-radius:4px;overflow:hidden;border:1px solid var(--vp-c-divider)}
.buf-cell{flex:1;transition:background .2s}
.ucov{background:var(--vp-c-bg-elv)}.nsys{background:#58a6ff}.nchk{background:#3fb950}
.ovlp{background:#8b949e}.osys{background:rgba(88,166,255,.35)}.ochk{background:rgba(63,185,80,.35)}
.k0-marker{position:absolute;top:0;transform:translateX(-50%)}
.k0-line{width:2px;height:28px;background:#ffa657;margin:0 auto}
.k0-tag{font-size:9px;color:#ffa657;text-align:center;margin-top:2px;font-family:var(--vp-font-family-mono);white-space:nowrap}
.sys-sep{position:absolute;top:0;left:35%}.sys-line{width:1px;height:28px;background:var(--vp-c-text-3);opacity:.4}
.buf-region-labels{display:flex;margin-bottom:8px}
.buf-legend{display:flex;gap:12px;flex-wrap:wrap}
.leg{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--vp-c-text-3)}
.ld{width:12px;height:8px;border-radius:2px;flex-shrink:0}
.ld.nsys{background:#58a6ff}.ld.nchk{background:#3fb950}.ld.ovlp{background:#8b949e}
.ld.osys{background:rgba(88,166,255,.35);border:1px solid #58a6ff}
.ld.ochk{background:rgba(63,185,80,.35);border:1px solid #3fb950}
.ld.ucov{background:var(--vp-c-bg-elv);border:1px solid var(--vp-c-divider)}
.tx-table{background:var(--vp-c-bg);border:1px solid var(--vp-c-divider);border-radius:8px;overflow:hidden;margin-bottom:12px}
.tx-hdr,.tx-row{display:grid;grid-template-columns:48px 36px 48px 72px 80px 80px 1fr;align-items:center;padding:6px 12px;gap:4px;font-size:11.5px}
.tx-hdr{font-weight:600;color:var(--vp-c-text-3);font-size:11px;background:var(--vp-c-bg-soft);border-bottom:1px solid var(--vp-c-divider)}
.tx-row{border-bottom:1px solid var(--vp-c-divider)}.tx-row:last-child{border-bottom:none}
.tx-row.latest{background:var(--vp-c-brand-soft)}
.tx-empty{padding:12px;font-size:12px;color:var(--vp-c-text-3);text-align:center}
.tx-idx{font-family:var(--vp-font-family-mono);font-weight:600}
.tx-rv{font-family:var(--vp-font-family-mono);font-weight:700;text-align:center;padding:1px 5px;border-radius:4px}
.rv0{background:rgba(255,166,87,.2);color:#ffa657}.rv2{background:rgba(210,168,255,.2);color:#d2a8ff}
.rv3{background:rgba(255,123,114,.2);color:#ff7b72}.rv1{background:rgba(121,192,255,.2);color:#79c0ff}
.tx-k0,.tx-new,.tx-cov,.tx-rate{font-family:var(--vp-font-family-mono)}
.gain-high{color:#3fb950;font-weight:600}.gain-mid{color:#ffa657}.gain-low{color:var(--vp-c-text-3)}
.cbv-btns{display:flex;gap:8px;margin-bottom:10px}
.cbv-btn{padding:7px 18px;border-radius:8px;font-size:13px;cursor:pointer;border:1.5px solid var(--vp-c-divider);background:var(--vp-c-bg);color:var(--vp-c-text-1);transition:all .15s}
.cbv-btn:hover:not(:disabled){border-color:var(--vp-c-brand-1);color:var(--vp-c-brand-1)}
.cbv-btn:disabled{opacity:.4;cursor:not-allowed}
.cbv-btn.primary{background:var(--vp-c-brand-1);border-color:var(--vp-c-brand-1);color:#fff}
.cbv-btn.primary:hover:not(:disabled){filter:brightness(1.1)}
.conclusion{border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;line-height:1.65;border:1px solid}
.conclusion.ir{background:#e6f4ea;border-color:#a8d5b0;color:#1a5c2a}
.conclusion.cc{background:#fff8ee;border-color:#fcd34d;color:#92400e}
.cfade-enter-active,.cfade-leave-active{transition:opacity .3s,transform .3s}
.cfade-enter-from,.cfade-leave-to{opacity:0;transform:translateY(6px)}
.cbv-hint{font-size:11.5px;color:var(--vp-c-text-3);text-align:center}
</style>
