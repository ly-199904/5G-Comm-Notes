<template>
  <div class="bp-root">
    <div class="bp-header">
      <span class="bp-title">波束方向图可视化</span>
      <span class="bp-sub">均匀线性阵列（ULA）· 38.214 §5.2.2</span>
    </div>

    <!-- 控制区 -->
    <div class="bp-controls">
      <div class="ctrl-group">
        <label>天线数 N</label>
        <div class="btn-group">
          <button v-for="n in [2,4,8,16]" :key="n"
            :class="['ctrl-btn', {active: nAnt===n}]"
            @click="nAnt=n">{{ n }}</button>
        </div>
      </div>
      <div class="ctrl-group">
        <label>阵元间距 d/λ</label>
        <input type="range" v-model.number="dOverLambda" min="0.25" max="1.0" step="0.05"/>
        <span class="ctrl-val">{{ dOverLambda.toFixed(2) }}λ</span>
      </div>
      <div class="ctrl-group">
        <label>主波束方向</label>
        <input type="range" v-model.number="steerDeg" min="-90" max="90" step="1"/>
        <span class="ctrl-val">{{ steerDeg }}°</span>
      </div>
      <div class="ctrl-group">
        <label>显示</label>
        <div class="btn-group">
          <button :class="['ctrl-btn', {active: showDb}]" @click="showDb=true">dB</button>
          <button :class="['ctrl-btn', {active: !showDb}]" @click="showDb=false">线性</button>
        </div>
      </div>
    </div>

    <!-- 主图区 -->
    <div class="bp-main">
      <!-- 极坐标方向图 -->
      <div class="polar-wrap">
        <svg :viewBox="`${-R-pad} ${-R-pad} ${2*(R+pad)} ${2*(R+pad)}`"
             xmlns="http://www.w3.org/2000/svg" class="polar-svg">
          <!-- 背景同心圆 -->
          <g class="grid-layer">
            <circle v-for="r in gridRings" :key="r" :r="r"
                    fill="none" stroke="var(--vp-c-divider)" stroke-width="0.5" opacity="0.6"/>
            <!-- 角度射线（每30°） -->
            <line v-for="a in gridAngles" :key="a"
                  :x1="0" :y1="0"
                  :x2="R*Math.cos((a-90)*Math.PI/180)"
                  :y2="R*Math.sin((a-90)*Math.PI/180)"
                  stroke="var(--vp-c-divider)" stroke-width="0.5" opacity="0.6"/>
            <!-- 角度标签 -->
            <text v-for="a in [-90,-60,-30,0,30,60,90]" :key="'l'+a"
                  :x="(R+18)*Math.cos((a-90)*Math.PI/180)"
                  :y="(R+18)*Math.sin((a-90)*Math.PI/180)+4"
                  text-anchor="middle" font-size="10" fill="var(--vp-c-text-2)">{{ a }}°</text>
            <!-- dB 标注 -->
            <text v-for="(r,i) in gridRings" :key="'db'+i"
                  :x="4" :y="-r+4" font-size="9" fill="var(--vp-c-text-3)">
              {{ dbLabels[i] }}
            </text>
          </g>

          <!-- 波束图形 -->
          <path :d="beamPath" fill="rgba(88,166,255,0.18)"
                stroke="#58a6ff" stroke-width="1.8" stroke-linejoin="round"/>

          <!-- 主瓣方向线 -->
          <line :x1="0" :y1="0"
                :x2="R*0.95*Math.cos((steerDeg-90)*Math.PI/180)"
                :y2="R*0.95*Math.sin((steerDeg-90)*Math.PI/180)"
                stroke="#d29922" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.8"/>

          <!-- 中心点 -->
          <circle cx="0" cy="0" r="3" fill="#58a6ff"/>
          <!-- 标题 -->
          <text x="0" :y="R+pad-4" text-anchor="middle" font-size="11"
                fill="var(--vp-c-text-2)">{{ showDb ? 'dB 尺度' : '线性尺度' }}</text>
        </svg>
      </div>

      <!-- 参数卡片 -->
      <div class="info-panel">
        <div class="info-title">阵列参数</div>

        <div class="info-row">
          <span>阵元数</span><span class="info-val">{{ nAnt }}</span>
        </div>
        <div class="info-row">
          <span>间距</span><span class="info-val">{{ dOverLambda.toFixed(2) }}λ</span>
        </div>
        <div class="info-row">
          <span>主波束</span><span class="info-val" style="color:#d29922">{{ steerDeg }}°</span>
        </div>
        <div class="info-row">
          <span>主瓣宽度 (3dB)</span>
          <span class="info-val" style="color:#3fb950">≈ {{ bw3db.toFixed(1) }}°</span>
        </div>
        <div class="info-row">
          <span>旁瓣电平</span>
          <span class="info-val" style="color:#f85149">≈ {{ sll.toFixed(1) }} dB</span>
        </div>
        <div class="info-row">
          <span>最大增益</span>
          <span class="info-val">{{ (10*Math.log10(nAnt)).toFixed(1) }} dBi</span>
        </div>
        <div class="info-row">
          <span>栅瓣风险</span>
          <span class="info-val" :style="{color: gratingLobe ? '#f85149' : '#3fb950'}">
            {{ gratingLobe ? '⚠ 存在' : '✓ 无' }}
          </span>
        </div>

        <div class="info-title" style="margin-top:10px">工程含义</div>
        <div class="info-note">
          天线数 N = {{ nAnt }}：阵列增益 {{ (10*Math.log10(nAnt)).toFixed(1) }} dBi，
          相当于将发射功率提高 {{ nAnt }}×。
          主瓣宽度随 N 增大而收窄——Massive MIMO 的精准波束赋形正是利用这一特性。
        </div>
        <div class="info-note" v-if="gratingLobe" style="color:#f85149">
          ⚠ d/λ={{ dOverLambda.toFixed(2) }} > 0.5，存在栅瓣（Grating Lobe）。
          栅瓣方向上出现虚假主瓣，会造成干扰或能量浪费。5G NR 天线阵列通常取 d/λ ≈ 0.5。
        </div>
      </div>
    </div>

    <!-- 公式说明 -->
    <div class="bp-formula">
      <span class="formula-label">阵因子</span>
      <span class="formula-text">
        AF(θ) = Σ exp(j·2π·(n-1)·d/λ·(sin θ − sin θ₀))，n=1…N
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const nAnt = ref(8)
const dOverLambda = ref(0.5)
const steerDeg = ref(0)
const showDb = ref(true)

const R = 130
const pad = 28

// 网格
const gridRings = computed(() => showDb.value
  ? [R*0.25, R*0.5, R*0.75, R]
  : [R*0.25, R*0.5, R*0.75, R])
const dbLabels = computed(() => showDb.value
  ? ['-12dB', '-6dB', '-3dB', '0dB']
  : ['0.25', '0.5', '0.75', '1.0'])
const gridAngles = [-90,-60,-30,0,30,60,90,-120,-150,120,150,180]

// 阵因子计算（线性）
function arrayFactor(thetaDeg: number): number {
  const theta = thetaDeg * Math.PI / 180
  const theta0 = steerDeg.value * Math.PI / 180
  const psi = 2 * Math.PI * dOverLambda.value * (Math.sin(theta) - Math.sin(theta0))
  if (Math.abs(psi) < 1e-9) return nAnt.value
  return Math.abs(Math.sin(nAnt.value * psi / 2) / Math.sin(psi / 2))
}

// 波束路径（SVG 极坐标）
const beamPath = computed(() => {
  const N = 360
  const afMax = nAnt.value
  const points: string[] = []
  for (let i = 0; i <= N; i++) {
    const thetaDeg = -90 + (180 * i) / N   // 只画 -90 到 90
    const af = arrayFactor(thetaDeg)
    let r: number
    if (showDb.value) {
      const db = 20 * Math.log10(af / afMax + 1e-10)
      r = Math.max(0, R * (1 + db / 40))   // -40dB 为底
    } else {
      r = R * (af / afMax)
    }
    // 极坐标转直角（角度从上方开始，顺时针）
    const angle = (thetaDeg - 90) * Math.PI / 180
    const x = r * Math.cos(angle)
    const y = r * Math.sin(angle)
    points.push(i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  points.push('Z')
  return points.join(' ')
})

// 3dB 波束宽度（近似）
const bw3db = computed(() => {
  // ULA 3dB 宽度约 ≈ 0.886·λ/(N·d·cos(θ₀))，转为度
  const theta0 = steerDeg.value * Math.PI / 180
  const bwRad = 0.886 / (nAnt.value * dOverLambda.value * Math.cos(theta0) + 1e-9)
  return (bwRad * 180 / Math.PI) * 2
})

// 旁瓣电平（均匀加权时 ≈ -13.3dB，固定值）
const sll = computed(() => -13.3)

// 栅瓣判断：d/λ > 1/(1+|sin θ₀|) 时出现栅瓣
const gratingLobe = computed(() => {
  const sinTheta0 = Math.abs(Math.sin(steerDeg.value * Math.PI / 180))
  return dOverLambda.value > 1 / (1 + sinTheta0)
})
</script>

<style scoped>
.bp-root {
  font-family: var(--vp-font-family-mono, monospace);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 16px;
  margin: 24px 0;
  color: var(--vp-c-text-1);
}
.bp-header { margin-bottom: 12px; }
.bp-title { font-size: 15px; font-weight: 700; color: var(--vp-c-brand); display: block; }
.bp-sub { font-size: 11px; color: var(--vp-c-text-2); }

.bp-controls {
  display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 16px;
  padding: 10px 12px; background: var(--vp-c-bg);
  border-radius: 6px; border: 1px solid var(--vp-c-divider);
}
.ctrl-group { display: flex; align-items: center; gap: 8px; }
.ctrl-group label { font-size: 11px; color: var(--vp-c-text-2); white-space: nowrap; }
.ctrl-group input[type=range] { width: 90px; accent-color: var(--vp-c-brand); }
.ctrl-val { font-size: 12px; color: var(--vp-c-brand); min-width: 44px; }
.btn-group { display: flex; gap: 4px; }
.ctrl-btn {
  padding: 3px 9px; font-size: 11px; border-radius: 4px;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2); cursor: pointer; transition: all 0.15s;
}
.ctrl-btn:hover { border-color: var(--vp-c-brand); color: var(--vp-c-brand); }
.ctrl-btn.active { background: var(--vp-c-brand); border-color: var(--vp-c-brand); color: #fff; }

.bp-main { display: grid; grid-template-columns: 1fr 200px; gap: 16px; align-items: start; }
.polar-wrap { display: flex; justify-content: center; }
.polar-svg { width: 100%; max-width: 340px; height: auto; }

.info-panel {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 12px;
}
.info-title {
  font-size: 10px; font-weight: 700; color: var(--vp-c-text-2);
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;
}
.info-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px; padding: 4px 0;
  border-bottom: 1px solid var(--vp-c-divider);
}
.info-row:last-of-type { border: none; }
.info-val { font-weight: 600; font-size: 12px; }
.info-note {
  font-size: 10px; color: var(--vp-c-text-2); line-height: 1.6;
  margin-top: 6px; padding: 6px; background: var(--vp-c-bg-soft);
  border-radius: 4px;
}

.bp-formula {
  margin-top: 12px; padding: 8px 12px;
  background: var(--vp-c-bg); border-radius: 6px;
  border: 1px solid var(--vp-c-divider); font-size: 10px;
  display: flex; gap: 8px; align-items: center;
}
.formula-label { font-weight: 700; color: var(--vp-c-brand); white-space: nowrap; }
.formula-text { color: var(--vp-c-text-2); font-style: italic; }

@media (max-width: 600px) {
  .bp-main { grid-template-columns: 1fr; }
  .bp-controls { flex-direction: column; }
}
</style>
