<script setup lang="ts">
/**
 * PagingOccasionCalc.vue
 * 5G NR 寻呼时机 (PF/PO) 计算器 —— 交互演示 38.304 §7.1 的 DRX 寻呼公式
 *  - 输入 5G-S-TMSI、DRX 周期 T、PCCH 的 nB
 *  - 实时计算 UE_ID / N / Ns / 寻呼帧 PF / 寻呼时机 i_s
 *  - 可视化整个 DRX 周期内的候选寻呼帧，高亮本 UE 落点
 *  - 列出与本 UE 共享同一寻呼时机的其他 UE（寻呼记录聚合）
 * 协议依据：TS 38.304 §7.1，TS 38.331 PCCH-Config，TR 38.821（NTN 长 DRX）
 */
import { ref, computed } from 'vue'

// ── 可选参数 ──
const T_OPTIONS = [32, 64, 128, 256]            // DRX 周期（radio frames）
const NB_MULT = [                               // nB 相对 T 的倍率（38.304）
  { label: '4T', mult: 4 }, { label: '2T', mult: 2 }, { label: 'T', mult: 1 },
  { label: 'T/2', mult: 0.5 }, { label: 'T/4', mult: 0.25 },
  { label: 'T/8', mult: 0.125 }, { label: 'T/16', mult: 1 / 16 },
  { label: 'T/32', mult: 1 / 32 },
]

const tmsi = ref(305419896)          // 任意示例 5G-S-TMSI
const T = ref(128)                   // 默认 1.28 s
const nbIdx = ref(4)                 // 默认 T/4
const pfOffset = ref(0)

const frameMs = 10

// ── 派生量 ──
const ueId = computed(() => ((tmsi.value % 1024) + 1024) % 1024)   // UE_ID = TMSI mod 1024
const nB = computed(() => Math.max(1, Math.round(T.value * NB_MULT[nbIdx.value].mult)))
const N = computed(() => Math.min(T.value, nB.value))               // N = min(T, nB)
const Ns = computed(() => Math.max(1, Math.floor(nB.value / T.value))) // Ns = max(1, nB/T)

const pfGroup = computed(() => ueId.value % N.value)                // UE_ID mod N
const sfnResidue = computed(() =>
  ((Math.floor(T.value / N.value) * pfGroup.value - pfOffset.value) % T.value + T.value) % T.value)
const iS = computed(() => Math.floor(ueId.value / N.value) % Ns.value) // i_s

const cycleMs = computed(() => T.value * frameMs)

// 候选寻呼帧（一个 DRX 周期内 N 个 PF 的 SFN 值）
const pfFrames = computed(() => {
  const step = Math.floor(T.value / N.value)
  return Array.from({ length: N.value }, (_, k) => ({
    k,
    sfn: ((step * k - pfOffset.value) % T.value + T.value) % T.value,
    isMine: k === pfGroup.value,
  })).sort((a, b) => a.sfn - b.sfn)
})

// 是否 PF 数量太多，需要紧凑显示
const dense = computed(() => N.value > 64)

// 与本 UE 共享同一 (PF, PO) 的其他 UE_ID（前若干个）
const collisionIds = computed(() => {
  const out: number[] = []
  for (let id = 0; id < 1024 && out.length < 12; id++) {
    if (id === ueId.value) continue
    if (id % N.value === pfGroup.value && Math.floor(id / N.value) % Ns.value === iS.value) {
      out.push(id)
    }
  }
  return out
})
const collisionTotal = computed(() => {
  let c = 0
  for (let id = 0; id < 1024; id++) {
    if (id % N.value === pfGroup.value && Math.floor(id / N.value) % Ns.value === iS.value) c++
  }
  return c
})

function randomTmsi() {
  tmsi.value = Math.floor(Math.random() * 0xffffffff)
}
const hexTmsi = computed(() => '0x' + (tmsi.value >>> 0).toString(16).toUpperCase().padStart(8, '0'))
</script>

<template>
  <div class="po-calc">
    <div class="pc-head">
      <span class="pc-title">寻呼时机计算器 · PF / PO</span>
      <span class="pc-sub">TS 38.304 §7.1</span>
    </div>

    <!-- 控制区 -->
    <div class="pc-controls">
      <div class="ctrl">
        <label>5G-S-TMSI</label>
        <div class="tmsi-row">
          <input type="number" v-model.number="tmsi" min="0" />
          <button class="rnd" @click="randomTmsi" title="随机">🎲</button>
        </div>
        <span class="hint">{{ hexTmsi }}</span>
      </div>
      <div class="ctrl">
        <label>DRX 周期 T</label>
        <select v-model.number="T">
          <option v-for="t in T_OPTIONS" :key="t" :value="t">{{ t }} 帧 ({{ t * 10 }} ms)</option>
        </select>
        <span class="hint">defaultPagingCycle</span>
      </div>
      <div class="ctrl">
        <label>nB (PCCH-Config)</label>
        <select v-model.number="nbIdx">
          <option v-for="(o, i) in NB_MULT" :key="i" :value="i">{{ o.label }}</option>
        </select>
        <span class="hint">= {{ nB }} 帧</span>
      </div>
    </div>

    <!-- 公式与结果 -->
    <div class="pc-formula">
      <div class="frow">
        <span class="fk">UE_ID</span>
        <span class="fe">= 5G-S-TMSI mod 1024 = {{ tmsi }} mod 1024 = <b>{{ ueId }}</b></span>
      </div>
      <div class="frow">
        <span class="fk">N</span>
        <span class="fe">= min(T, nB) = min({{ T }}, {{ nB }}) = <b>{{ N }}</b>
          <span class="fnote">候选寻呼帧数</span></span>
      </div>
      <div class="frow">
        <span class="fk">Ns</span>
        <span class="fe">= max(1, nB/T) = <b>{{ Ns }}</b>
          <span class="fnote">每帧寻呼时机数</span></span>
      </div>
      <div class="frow hl">
        <span class="fk">PF</span>
        <span class="fe">(SFN+{{ pfOffset }}) mod {{ T }} = (T/N)(UE_ID mod N) =
          ({{ Math.floor(T / N) }})({{ pfGroup }}) ⟹ <b>SFN mod {{ T }} = {{ sfnResidue }}</b></span>
      </div>
      <div class="frow hl">
        <span class="fk">i_s</span>
        <span class="fe">= ⌊UE_ID/N⌋ mod Ns = ⌊{{ ueId }}/{{ N }}⌋ mod {{ Ns }} = <b>{{ iS }}</b>
          <span class="fnote">寻呼时机索引</span></span>
      </div>
    </div>

    <!-- 周期可视化 -->
    <div class="pc-viz">
      <div class="viz-label">一个 DRX 周期（{{ T }} 帧 = {{ cycleMs }} ms）内的 {{ N }} 个候选寻呼帧 ·
        本 UE 落在 <b class="mine-txt">SFN mod {{ T }} = {{ sfnResidue }}</b></div>
      <div class="pf-strip" :class="{ dense }">
        <div v-for="pf in pfFrames" :key="pf.k"
             class="pf-cell" :class="{ mine: pf.isMine }"
             :title="'SFN mod ' + T + ' = ' + pf.sfn">
          <span v-if="!dense || pf.isMine" class="pf-sfn">{{ pf.sfn }}</span>
        </div>
      </div>

      <!-- PF 放大：Ns 个 PO -->
      <div class="po-zoom">
        <div class="zoom-arrow">↳ 该寻呼帧内的 {{ Ns }} 个寻呼时机 (PO)：</div>
        <div class="po-cells">
          <div v-for="i in Ns" :key="i - 1" class="po-cell" :class="{ mine: (i - 1) === iS }">
            PO {{ i - 1 }}
            <span v-if="(i - 1) === iS" class="po-tag">← 本 UE</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 碰撞 / 寻呼记录聚合 -->
    <div class="pc-collide">
      <div class="cl-head">
        共享同一寻呼时机的 UE（同被一条寻呼消息寻呼）
        <span class="cl-count">本时机共 ~{{ collisionTotal }} 个 UE_ID（取值 0–1023 中）</span>
      </div>
      <div class="cl-chips">
        <code class="cl-mine">UE_ID={{ ueId }}</code>
        <code v-for="id in collisionIds" :key="id">{{ id }}</code>
        <span v-if="collisionTotal > collisionIds.length + 1" class="cl-more">…等</span>
      </div>
      <div class="cl-note">
        这些 UE 的寻呼记录被打包进同一条 Paging 消息（PCCH）。单条消息最多
        <b>maxNrofPageRec = 32</b> 条记录——大波束/海量 UE 下易溢出，须顺延到后续周期。
      </div>
    </div>

    <div class="ntn-box">
      <span class="ntn-ic">🛰️</span>
      <span class="ntn-tx">
        <b>NTN 视角：</b>调大 T（更长 DRX）让 IoT 终端深睡省电，但寻呼时延随 T 线性增长（半周期等待）；
        LEO 波束覆盖面积大，同一 PO 聚合的 UE 远多于地面，寻呼记录更易触顶 32 上限。省电、低时延、容量三者需联合权衡。
      </span>
    </div>
  </div>
</template>

<style scoped>
.po-calc {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  padding: 16px 18px 18px;
  margin: 22px 0;
  font-family: var(--vp-font-family-base);
}
.pc-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
.pc-title { font-size: 14px; font-weight: 700; color: var(--vp-c-text-1); }
.pc-sub { font-size: 11px; color: var(--vp-c-text-3); font-family: var(--vp-font-family-mono); }

/* 控制区 */
.pc-controls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
@media (max-width: 640px) { .pc-controls { grid-template-columns: 1fr; } }
.ctrl { display: flex; flex-direction: column; gap: 4px; }
.ctrl label { font-size: 11.5px; font-weight: 600; color: var(--vp-c-text-2); }
.ctrl input, .ctrl select {
  font-size: 13px; padding: 6px 9px; border-radius: 7px;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-1); font-family: var(--vp-font-family-mono); width: 100%;
}
.ctrl input:focus, .ctrl select:focus { outline: none; border-color: var(--vp-c-brand-1); }
.tmsi-row { display: flex; gap: 6px; }
.tmsi-row input { flex: 1; }
.rnd {
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg); border-radius: 7px;
  cursor: pointer; padding: 0 9px; font-size: 14px;
}
.rnd:hover { border-color: var(--vp-c-brand-1); }
.hint { font-size: 10.5px; color: var(--vp-c-text-3); font-family: var(--vp-font-family-mono); }

/* 公式 */
.pc-formula {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 9px; padding: 11px 13px; margin-bottom: 14px;
}
.frow { display: flex; gap: 10px; font-size: 12.5px; line-height: 1.7; padding: 2px 0; }
.frow .fk {
  flex-shrink: 0; width: 40px; text-align: right; color: var(--vp-c-brand-1);
  font-weight: 700; font-family: var(--vp-font-family-mono);
}
.frow .fe { color: var(--vp-c-text-2); font-family: var(--vp-font-family-mono); font-size: 12px; }
.frow .fe b { color: var(--vp-c-text-1); }
.frow.hl { background: var(--vp-c-default-soft); border-radius: 5px; padding: 3px 6px; margin: 1px -4px; }
.fnote { color: var(--vp-c-text-3); font-style: italic; margin-left: 6px; font-size: 11px; }

/* 可视化 */
.pc-viz { margin-bottom: 14px; }
.viz-label { font-size: 12px; color: var(--vp-c-text-2); margin-bottom: 8px; line-height: 1.6; }
.mine-txt { color: var(--vp-c-brand-1); }
.pf-strip {
  display: flex; flex-wrap: wrap; gap: 3px;
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 8px;
}
.pf-cell {
  flex: 1 1 26px; min-width: 22px; height: 30px; border-radius: 4px;
  background: var(--vp-c-default-soft); display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-family: var(--vp-font-family-mono); color: var(--vp-c-text-3);
  transition: all .15s;
}
.pf-strip.dense .pf-cell { flex: 1 1 8px; min-width: 6px; height: 24px; }
.pf-cell.mine {
  background: var(--vp-c-brand-1); color: #fff; font-weight: 700;
  box-shadow: 0 0 0 2px var(--vp-c-brand-soft); flex-grow: 2;
}
.pf-sfn { pointer-events: none; }

.po-zoom { margin-top: 10px; }
.zoom-arrow { font-size: 11.5px; color: var(--vp-c-text-3); margin-bottom: 6px; font-family: var(--vp-font-family-mono); }
.po-cells { display: flex; gap: 8px; flex-wrap: wrap; }
.po-cell {
  padding: 7px 14px; border-radius: 7px; font-size: 12px;
  background: var(--vp-c-default-soft); border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2); font-family: var(--vp-font-family-mono);
  display: flex; align-items: center; gap: 8px;
}
.po-cell.mine { background: var(--vp-c-brand-soft); border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); font-weight: 700; }
.po-tag { font-size: 10.5px; }

/* 碰撞 */
.pc-collide {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 9px; padding: 11px 13px; margin-bottom: 14px;
}
.cl-head { font-size: 12px; font-weight: 600; color: var(--vp-c-text-1); margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.cl-count { font-size: 11px; font-weight: 400; color: var(--vp-c-text-3); }
.cl-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.cl-chips code {
  font-size: 11px; padding: 2px 7px; border-radius: 5px;
  background: var(--vp-c-default-soft); color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
}
.cl-chips .cl-mine { background: var(--vp-c-brand-1); color: #fff; font-weight: 700; }
.cl-more { font-size: 11px; color: var(--vp-c-text-3); align-self: center; }
.cl-note { font-size: 11.5px; color: var(--vp-c-text-2); line-height: 1.6; }

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
