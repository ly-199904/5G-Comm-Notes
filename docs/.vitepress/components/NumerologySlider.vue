<template>
  <div class="nslider-wrap">

    <!-- ── 顶部标题 ── -->
    <div class="nslider-header">
      <span class="nslider-title">Numerology 动态模拟器</span>
      <span class="nslider-spec">3GPP TS 38.211 §4.2 / §4.3</span>
    </div>

    <!-- ── μ 滑块 ── -->
    <div class="nslider-control">
      <span class="ctrl-label">参数集 μ =</span>
      <div class="mu-buttons">
        <button
          v-for="m in [0,1,2,3,4]"
          :key="m"
          :class="['mu-btn', { active: mu === m }]"
          @click="mu = m"
        >{{ m }}</button>
      </div>
      <span class="ctrl-sub">SCS = <b>{{ scs }} kHz</b></span>
    </div>

    <!-- ── 核心参数卡片 ── -->
    <div class="param-grid">
      <div class="param-card" v-for="p in params" :key="p.label">
        <div class="param-label">{{ p.label }}</div>
        <div class="param-value">
          <span class="pv-num">{{ p.value }}</span>
          <span class="pv-unit">{{ p.unit }}</span>
        </div>
        <div class="param-formula">{{ p.formula }}</div>
      </div>
    </div>

    <!-- ── 帧结构可视化 ── -->
    <div class="frame-section">
      <div class="frame-label">1 个 Radio Frame（10 ms）内的时域层次</div>
      <div class="frame-box">

        <!-- Subframe 行 -->
        <div class="timeline-row">
          <span class="row-tag">Subframe</span>
          <div class="row-track">
            <div
              v-for="sf in 10" :key="sf"
              class="sf-block"
              :style="{ width: sfW + '%' }"
            >{{ sf - 1 }}</div>
          </div>
        </div>

        <!-- Slot 行 -->
        <div class="timeline-row">
          <span class="row-tag">Slot</span>
          <div class="row-track">
            <div
              v-for="s in slotsPerFrame" :key="s"
              class="slot-block"
              :style="{ width: slotW + '%' }"
            >
              <span v-if="slotW > 3">{{ s - 1 }}</span>
            </div>
          </div>
        </div>

        <!-- Symbol 行（仅展示第一个 slot） -->
        <div class="timeline-row">
          <span class="row-tag">Symbol<br/><small>（slot #0）</small></span>
          <div class="row-track sym-track">
            <div
              v-for="sym in 14" :key="sym"
              class="sym-block"
              :class="{ 'sym-cp': sym === 1 || sym === 8 }"
              :style="{ width: symW + '%' }"
            >
              <span v-if="symW > 4">{{ sym - 1 }}</span>
            </div>
            <div class="sym-rest" :style="{ width: (100 - symW * 14) + '%' }">
              <span v-if="slotsPerFrame > 1">← {{ slotsPerFrame - 1 }} 个 slot 后续</span>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ── 关键结论 ── -->
    <div class="insight-box">
      <span class="insight-icon">💡</span>
      <span>
        μ = {{ mu }} 时，每帧共 <b>{{ slotsPerFrame }} 个 slot</b>，
        调度最小粒度为 <b>{{ slotDur }} μs</b>，
        gNB 每秒最多调度 <b>{{ schedRate.toLocaleString() }} 次</b>。
        <template v-if="mu >= 3">
          <br/><span class="ntn-tip">⚠️ NTN 提示：μ={{ mu }} 在大时延场景下 HARQ 时序开销显著增大，Rel-17 推荐 μ=0/1。</span>
        </template>
      </span>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const mu = ref(1)

const scs = computed(() => (2 ** mu.value) * 15)
const slotsPerFrame  = computed(() => 10 * (2 ** mu.value))
const slotDur        = computed(() => (1000 / (2 ** mu.value)).toFixed(1))   // μs
const symbolDur      = computed(() => (1e6 / (scs.value * 1000)).toFixed(2)) // μs
const cpDur          = computed(() => [4.69, 2.34, 1.17, 0.59, 0.29][mu.value].toFixed(2))
const schedRate      = computed(() => slotsPerFrame.value * 100)              // /s

// 时间轴宽度比例
const sfW   = computed(() => 10)                            // 10 subframes → 各 10%
const slotW = computed(() => 100 / slotsPerFrame.value)     // 均分
const symW  = computed(() => slotW.value / 14)              // slot 内 14 符号

const params = computed(() => [
  { label: '子载波间隔 SCS',   value: scs.value,                unit: 'kHz',  formula: `Δf = 2^${mu.value} × 15` },
  { label: 'Slot 时长',        value: slotDur.value,            unit: 'μs',   formula: `T = 1ms / 2^${mu.value}` },
  { label: 'OFDM 符号时长',    value: symbolDur.value,          unit: 'μs',   formula: `T = 1 / Δf` },
  { label: 'Normal CP 时长',   value: cpDur.value,              unit: 'μs',   formula: `≈ 7.2% × T_symbol` },
  { label: 'Slots / Frame',    value: slotsPerFrame.value,      unit: '',     formula: `= 10 × 2^${mu.value}` },
  { label: '调度频率',         value: schedRate.value.toLocaleString(), unit: '/s', formula: `= Slots/Frame × 100` },
])
</script>

<style scoped>
.nslider-wrap {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
  background: var(--vp-c-bg-soft);
  font-size: 13.5px;
}

/* ── 顶部 ── */
.nslider-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.nslider-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.nslider-spec {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

/* ── 控制区 ── */
.nslider-control {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.ctrl-label { color: var(--vp-c-text-2); font-weight: 500; }
.ctrl-sub   { color: var(--vp-c-text-2); font-size: 12.5px; }

.mu-buttons { display: flex; gap: 6px; }
.mu-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1.5px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.mu-btn:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.mu-btn.active {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}

/* ── 参数卡片 ── */
.param-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 10px;
  margin-bottom: 20px;
}
.param-card {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 10px 12px;
}
.param-label   { font-size: 11px; color: var(--vp-c-text-3); margin-bottom: 4px; }
.param-value   { display: flex; align-items: baseline; gap: 4px; }
.pv-num        { font-size: 20px; font-weight: 700; color: var(--vp-c-brand-1); font-family: var(--vp-font-family-mono); }
.pv-unit       { font-size: 12px; color: var(--vp-c-text-2); }
.param-formula { font-size: 11px; color: var(--vp-c-text-3); margin-top: 2px; font-family: var(--vp-font-family-mono); }

/* ── 帧结构时间轴 ── */
.frame-section  { margin-bottom: 16px; }
.frame-label    { font-size: 12px; color: var(--vp-c-text-2); margin-bottom: 8px; }
.frame-box      { display: flex; flex-direction: column; gap: 6px; }

.timeline-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row-tag {
  width: 70px;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--vp-c-text-3);
  text-align: right;
  line-height: 1.4;
}
.row-tag small { font-size: 10px; }

.row-track {
  flex: 1;
  display: flex;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
}

.sf-block {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 500;
  color: #fff;
  border-right: 1px solid rgba(255,255,255,0.2);
  transition: width 0.3s ease;
}
.sf-block:nth-child(odd)  { background: #4a7fa5; }
.sf-block:nth-child(even) { background: #3a6a8f; }

.slot-block {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: rgba(255,255,255,0.9);
  border-right: 1px solid rgba(255,255,255,0.15);
  overflow: hidden;
  transition: width 0.3s ease;
}
.slot-block:nth-child(odd)  { background: #5a9e72; }
.slot-block:nth-child(even) { background: #4a8e62; }

.sym-track { position: relative; }
.sym-block {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8.5px;
  color: rgba(255,255,255,0.85);
  border-right: 1px solid rgba(255,255,255,0.1);
  overflow: hidden;
  transition: width 0.3s ease;
}
.sym-block:nth-child(odd)  { background: #8a6bbf; }
.sym-block:nth-child(even) { background: #7a5baf; }
.sym-block.sym-cp          { background: #bf6b6b; }

.sym-rest {
  flex: 1;
  background: var(--vp-c-bg-elv);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--vp-c-text-3);
  padding: 0 6px;
}

/* ── 结论框 ── */
.insight-box {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-brand-soft);
  border-left: 3px solid var(--vp-c-brand-1);
  border-radius: 6px;
  padding: 10px 13px;
  font-size: 13px;
  color: var(--vp-c-text-2);
  line-height: 1.7;
}
.insight-icon { font-size: 15px; flex-shrink: 0; margin-top: 1px; }
.ntn-tip      { font-size: 12px; color: var(--vp-c-warning-1, #e6a817); }
</style>
