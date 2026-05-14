<template>
  <span class="term-wrapper">
    <span
      class="term-text"
      @mouseenter="show"
      @mouseleave="hide"
      @touchstart.prevent="toggle"
    >{{ term }}<span class="term-dot">·</span></span>

    <Transition name="term-fade">
      <div
        v-if="visible"
        class="term-popup"
        :style="popupStyle"
        ref="popup"
      >
        <div class="term-popup-header">
          <span class="term-popup-name">{{ term }}</span>
          <span class="term-popup-tag" v-if="spec">{{ spec }}</span>
        </div>
        <div class="term-popup-body">{{ definition }}</div>
        <div class="term-popup-en" v-if="en">{{ en }}</div>
      </div>
    </Transition>
  </span>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  term: string          // 显示在文中的缩写，如 "SCS"
  definition: string    // 中文解释
  en?: string           // 英文全称（可选）
  spec?: string         // 3GPP 规范引用（可选），如 "38.211 §4.2"
}>()

const visible = ref(false)
const popup   = ref<HTMLElement | null>(null)
const offsetX = ref(0)

let hideTimer: ReturnType<typeof setTimeout> | null = null

function show(e: MouseEvent) {
  if (hideTimer) clearTimeout(hideTimer)
  adjustPosition(e)
  visible.value = true
}

function hide() {
  hideTimer = setTimeout(() => {
    visible.value = false
  }, 150)
}

function toggle() {
  visible.value = !visible.value
}

function adjustPosition(e: MouseEvent) {
  // 防止弹窗超出右侧视口
  const target = e.target as HTMLElement
  const rect   = target.getBoundingClientRect()
  const popupW = 260
  const margin = 12
  const over   = rect.left + popupW - window.innerWidth + margin
  offsetX.value = over > 0 ? -over : 0
}

const popupStyle = computed(() => ({
  transform: `translateX(${offsetX.value}px)`
}))
</script>

<style scoped>
/* ── 触发文字 ── */
.term-wrapper {
  position: relative;
  display: inline;
}

.term-text {
  cursor: help;
  border-bottom: 1.5px dashed var(--vp-c-brand-2, #a8b1ff);
  color: inherit;
  transition: color 0.15s;
  white-space: nowrap;
}

.term-text:hover {
  color: var(--vp-c-brand-1, #646cff);
}

.term-dot {
  font-size: 10px;
  color: var(--vp-c-brand-2, #a8b1ff);
  vertical-align: super;
  margin-left: 1px;
  line-height: 1;
}

/* ── 弹窗 ── */
.term-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 999;
  width: 260px;
  background: var(--vp-c-bg-elv, #ffffff);
  border: 1px solid var(--vp-c-divider, #e2e2e3);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 10px 13px 11px;
  pointer-events: none;
}

.term-popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}

.term-popup-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1, #213547);
  font-family: var(--vp-font-family-mono, monospace);
}

.term-popup-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 20px;
  background: var(--vp-c-brand-soft, #e8e8ff);
  color: var(--vp-c-brand-1, #646cff);
  white-space: nowrap;
}

.term-popup-body {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--vp-c-text-1, #213547);
}

.term-popup-en {
  margin-top: 5px;
  font-size: 11px;
  color: var(--vp-c-text-3, #a0a0a0);
  font-style: italic;
}

/* ── 动画 ── */
.term-fade-enter-active,
.term-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.term-fade-enter-from,
.term-fade-leave-to {
  opacity: 0;
  transform: translateY(4px) translateX(v-bind(offsetX + 'px'));
}
</style>
