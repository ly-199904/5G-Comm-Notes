<script setup lang="ts">
/**
 * CarrierAggregationCalc.vue
 * 5G NR 载波聚合配置器 —— 交互演示 CA 吞吐随 CC/带宽/层数扩展（38.306 §4.1.2）
 *  - 调 CC 数、每 CC 带宽、MIMO 层数、调制阶数
 *  - 切换 SCell 状态（激活/休眠/去激活）：休眠/去激活的 CC 不贡献数据速率
 *  - 实时显示聚合带宽、峰值速率、各 CC 贡献与频谱排布
 * 协议依据：TS 38.306 §4.1.2，TS 38.300 §9.2.4，TS 38.321 §5.9（SCell 激活）
 */
import { ref, computed } from 'vue'

type CCState = 'active' | 'dormant' | 'deactivated'
interface CC { id: number; bw: number; state: CCState }

// FR1 μ=1 (30kHz) 各带宽的 PRB 数（38.101-1 Table 5.3.2-1）
const PRB_FR1: Record<number, number> = { 20: 51, 40: 106, 50: 133, 60: 162, 80: 217, 100: 273 }
const BW_OPTIONS = [20, 40, 50, 60, 80, 100]
const LAYER_OPTIONS = [1, 2, 4]
const MOD_OPTIONS = [{ label: '64QAM', Qm: 6 }, { label: '256QAM', Qm: 8 }]

const R_MAX = 948 / 1024
const OH = 0.14            // FR1 DL
const MU = 1               // 30 kHz
const F = 1.0              // 缩放因子

const allCCs = ref<CC[]>(
  Array.from({ length: 8 }, (_, i) => ({ id: i, bw: 100, state: 'active' as CCState })))
const ccCount = ref(3)
const layers = ref(4)
const modIdx = ref(1)      // 256QAM

const visibleCCs = computed(() => allCCs.value.slice(0, ccCount.value))
const Qm = computed(() => MOD_OPTIONS[modIdx.value].Qm)

// 单 CC 峰值速率 (bps)
function ccRate(bw: number): number {
  const nprb = PRB_FR1[bw]
  const Ts = 1e-3 / (14 * 2 ** MU)
  return layers.value * Qm.value * F * R_MAX * (nprb * 12 / Ts) * (1 - OH)
}

const aggBW = computed(() => visibleCCs.value.reduce((s, c) => s + c.bw, 0))
const activeBW = computed(() =>
  visibleCCs.value.filter(c => c.state === 'active').reduce((s, c) => s + c.bw, 0))
const peakGbps = computed(() =>
  visibleCCs.value
    .filter(c => c.state === 'active')
    .reduce((s, c) => s + ccRate(c.bw), 0) / 1e9)

// 单 CC 100MHz 4层256QAM 作为对照基准
const singleCCGbps = computed(() => ccRate(100) / 1e9)
const gain = computed(() => peakGbps.value / singleCCGbps.value)

function cycleState(cc: CC) {
  if (cc.id === 0) return  // PCell 恒激活
  cc.state = cc.state === 'active' ? 'dormant' : cc.state === 'dormant' ? 'deactivated' : 'active'
}
function roleLabel(i: number) { return i === 0 ? 'PCell' : 'SCell' + i }
function stateColor(cc: CC) {
  if (cc.id === 0) return 'pcell'
  return cc.state
}
function stateText(s: CCState) {
  return s === 'active' ? '激活' : s === 'dormant' ? '休眠' : '去激活'
}
</script>

<template>
  <div class="ca-calc">
    <div class="cc-head">
      <span class="cc-title">载波聚合配置器 · 峰值速率</span>
      <span class="cc-sub">TS 38.306 §4.1.2 · FR1 μ=1</span>
    </div>

    <!-- 全局控制 -->
    <div class="cc-controls">
      <div class="ctrl">
        <label>CC 数：<b>{{ ccCount }}</b> 个</label>
        <input type="range" min="1" max="8" v-model.number="ccCount" />
      </div>
      <div class="ctrl">
        <label>MIMO 层数</label>
        <select v-model.number="layers">
          <option v-for="l in LAYER_OPTIONS" :key="l" :value="l">{{ l }} 层</option>
        </select>
      </div>
      <div class="ctrl">
        <label>调制</label>
        <select v-model.number="modIdx">
          <option v-for="(m, i) in MOD_OPTIONS" :key="i" :value="i">{{ m.label }}</option>
        </select>
      </div>
    </div>

    <!-- 关键读数 -->
    <div class="cc-readout">
      <div class="ro">
        <span class="ro-val">{{ aggBW }}<small> MHz</small></span>
        <span class="ro-lab">聚合带宽（含未激活）</span>
      </div>
      <div class="ro">
        <span class="ro-val">{{ activeBW }}<small> MHz</small></span>
        <span class="ro-lab">激活带宽（贡献速率）</span>
      </div>
      <div class="ro hero">
        <span class="ro-val">{{ peakGbps.toFixed(2) }}<small> Gbps</small></span>
        <span class="ro-lab">峰值下行速率</span>
      </div>
      <div class="ro">
        <span class="ro-val">{{ gain.toFixed(1) }}<small>×</small></span>
        <span class="ro-lab">vs 单 CC(100M/4层/256Q)</span>
      </div>
    </div>

    <!-- 频谱排布 -->
    <div class="cc-spectrum">
      <div class="sp-label">频谱排布（块宽 ∝ 带宽，颜色 = 角色/状态）</div>
      <div class="sp-strip">
        <div v-for="(cc, i) in visibleCCs" :key="cc.id"
             class="sp-cc" :class="stateColor(cc)"
             :style="{ flexGrow: cc.bw }"
             @click="cycleState(cc)"
             :title="cc.id === 0 ? 'PCell 恒激活' : '点击切换状态'">
          <span class="sp-role">{{ roleLabel(i) }}</span>
          <span class="sp-bw">{{ cc.bw }}MHz</span>
          <span class="sp-state">{{ cc.id === 0 ? 'PCell' : stateText(cc.state) }}</span>
          <select v-if="false" v-model.number="cc.bw"></select>
        </div>
      </div>
      <div class="sp-tip">💡 点击 SCell 方块循环切换 <b>激活→休眠→去激活</b>；只有激活态的 CC 贡献数据速率。PCell 恒激活。</div>
    </div>

    <!-- 每 CC 带宽调节 -->
    <div class="cc-bwrow">
      <div v-for="(cc, i) in visibleCCs" :key="cc.id" class="bw-item">
        <span class="bw-name" :class="stateColor(cc)">{{ roleLabel(i) }}</span>
        <select v-model.number="cc.bw">
          <option v-for="b in BW_OPTIONS" :key="b" :value="b">{{ b }}MHz</option>
        </select>
        <span class="bw-rate">{{ cc.state === 'active' ? (ccRate(cc.bw) / 1e9).toFixed(2) + ' Gbps' : '—' }}</span>
      </div>
    </div>

    <div class="ntn-box">
      <span class="ntn-ic">🛰️</span>
      <span class="ntn-tx">
        <b>NTN 视角：</b>地面 CA 的各 CC 来自同一基站，时序对齐用单个 TAG 即可。但 NTN 中若 CC 来自
        不同卫星/波束/仰角，差分传播时延可达数百 μs~ms（远超 CP），单 TAG 无法对齐 → 须多 TAG 甚至难以聚合。
        Rel-17 NTN 因此不优先支持 CA，以单载波运行为主。
      </span>
    </div>
  </div>
</template>

<style scoped>
.ca-calc {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  padding: 16px 18px 18px;
  margin: 22px 0;
  font-family: var(--vp-font-family-base);
}
.cc-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.cc-title { font-size: 14px; font-weight: 700; color: var(--vp-c-text-1); }
.cc-sub { font-size: 11px; color: var(--vp-c-text-3); font-family: var(--vp-font-family-mono); }

.cc-controls { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 14px; margin-bottom: 14px; }
@media (max-width: 640px) { .cc-controls { grid-template-columns: 1fr; } }
.ctrl { display: flex; flex-direction: column; gap: 5px; }
.ctrl label { font-size: 11.5px; font-weight: 600; color: var(--vp-c-text-2); }
.ctrl label b { color: var(--vp-c-brand-1); }
.ctrl input[type=range] { width: 100%; accent-color: var(--vp-c-brand-1); }
.ctrl select {
  font-size: 13px; padding: 6px 9px; border-radius: 7px;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-1); font-family: var(--vp-font-family-mono);
}
.ctrl select:focus { outline: none; border-color: var(--vp-c-brand-1); }

/* 读数 */
.cc-readout {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;
}
@media (max-width: 640px) { .cc-readout { grid-template-columns: repeat(2, 1fr); } }
.ro {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 9px; padding: 10px 12px; display: flex; flex-direction: column; gap: 3px;
}
.ro.hero { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
.ro-val { font-size: 20px; font-weight: 800; color: var(--vp-c-text-1); font-family: var(--vp-font-family-mono); line-height: 1.1; }
.ro.hero .ro-val { color: var(--vp-c-brand-1); }
.ro-val small { font-size: 12px; font-weight: 600; opacity: .7; }
.ro-lab { font-size: 10.5px; color: var(--vp-c-text-3); }

/* 频谱 */
.cc-spectrum { margin-bottom: 14px; }
.sp-label { font-size: 12px; color: var(--vp-c-text-2); margin-bottom: 7px; }
.sp-strip {
  display: flex; gap: 4px; background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 8px; min-height: 76px;
}
.sp-cc {
  flex: 1 1 0; min-width: 60px; border-radius: 6px; padding: 8px 6px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  cursor: pointer; transition: filter .15s, transform .1s; border: 1.5px solid transparent;
}
.sp-cc:hover { filter: brightness(1.12); }
.sp-cc:active { transform: scale(0.98); }
.sp-cc.pcell { background: rgba(63,185,80,.22); border-color: #3fb950; }
.sp-cc.active { background: rgba(88,166,255,.22); border-color: #58a6ff; }
.sp-cc.dormant { background: rgba(163,113,247,.20); border-color: #a371f7; }
.sp-cc.deactivated { background: rgba(110,118,129,.16); border-color: #6e7681; opacity: .65; }
.sp-role { font-size: 11.5px; font-weight: 800; color: var(--vp-c-text-1); font-family: var(--vp-font-family-mono); }
.sp-bw { font-size: 10.5px; color: var(--vp-c-text-2); font-family: var(--vp-font-family-mono); }
.sp-state { font-size: 10px; color: var(--vp-c-text-3); }
.sp-tip { font-size: 11px; color: var(--vp-c-text-3); margin-top: 7px; line-height: 1.6; }

/* 带宽调节行 */
.cc-bwrow { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.bw-item {
  display: flex; align-items: center; gap: 6px; background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider); border-radius: 7px; padding: 5px 8px;
}
.bw-name { font-size: 11px; font-weight: 700; font-family: var(--vp-font-family-mono); }
.bw-name.pcell { color: #3fb950; }
.bw-name.active { color: #58a6ff; }
.bw-name.dormant { color: #a371f7; }
.bw-name.deactivated { color: #6e7681; }
.bw-item select {
  font-size: 11.5px; padding: 3px 6px; border-radius: 5px;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1); font-family: var(--vp-font-family-mono);
}
.bw-rate { font-size: 11px; color: var(--vp-c-text-3); font-family: var(--vp-font-family-mono); min-width: 64px; }

/* NTN */
.ntn-box {
  display: flex; gap: 8px; align-items: flex-start;
  background: var(--vp-c-warning-soft, rgba(210,153,34,.12));
  border: 1px solid var(--vp-c-warning-2, #d29922);
  border-radius: 8px; padding: 9px 11px;
}
.ntn-ic { font-size: 13px; flex-shrink: 0; }
.ntn-tx { font-size: 11.5px; color: var(--vp-c-warning-1, #b8860b); line-height: 1.65; }
</style>
