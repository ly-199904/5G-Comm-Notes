<template>
  <div class="bmf-root">
    <div class="bmf-header">
      <span class="bmf-title">波束管理流程交互图</span>
      <span class="bmf-sub">P1 / P2 / P3 · BFR · TR 38.802 §6.1.6.1 · TS 38.321 §5.17</span>
    </div>

    <!-- 模式切换 -->
    <div class="bmf-controls">
      <div class="ctrl-group">
        <label>查看流程</label>
        <div class="btn-group">
          <button v-for="m in modes" :key="m.id"
            :class="['ctrl-btn', {active: mode===m.id}]"
            @click="mode=m.id; step=0">
            {{ m.label }}
          </button>
        </div>
      </div>
      <div class="ctrl-group" v-if="mode==='bfr'">
        <label>BFR 场景</label>
        <div class="btn-group">
          <button :class="['ctrl-btn', {active: bfrScene==='ground'}]"
            @click="bfrScene='ground'">地面</button>
          <button :class="['ctrl-btn', {active: bfrScene==='ntn'}]"
            @click="bfrScene='ntn'">NTN LEO</button>
        </div>
      </div>
      <div class="ctrl-group">
        <div class="btn-group">
          <button class="nav-btn" @click="prevStep" :disabled="step===0">◀ 上一步</button>
          <span class="step-counter">{{ step + 1 }} / {{ currentSteps.length }}</span>
          <button class="nav-btn" @click="nextStep" :disabled="step===currentSteps.length-1">下一步 ▶</button>
        </div>
      </div>
      <button class="btn-auto" @click="toggleAuto">
        {{ autoPlay ? '⏸ 暂停' : '▶ 自动播放' }}
      </button>
    </div>

    <!-- 主流程图 -->
    <div class="bmf-main">
      <!-- 流程图 SVG -->
      <div class="flow-wrap">
        <svg :viewBox="`0 0 ${svgW} ${svgH}`" class="flow-svg">
          <!-- 背景分区 -->
          <g v-for="zone in zones" :key="zone.id">
            <rect :x="zone.x" :y="zone.y" :width="zone.w" :height="zone.h"
                  :fill="zone.fill" :rx="6" opacity="0.06"/>
            <text :x="zone.x + zone.w/2" :y="zone.y + 14"
                  text-anchor="middle" font-size="10" font-weight="700"
                  :fill="zone.color" opacity="0.7">{{ zone.label }}</text>
          </g>

          <!-- 连线 -->
          <g v-for="arrow in currentArrows" :key="arrow.id">
            <defs>
              <marker :id="'arr-'+arrow.id" viewBox="0 0 8 8" refX="6" refY="4"
                      markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M1 1L7 4L1 7" fill="none"
                      :stroke="arrow.active ? arrow.color : '#444'"
                      stroke-width="1.5" stroke-linecap="round"/>
              </marker>
            </defs>
            <path :d="arrow.d" fill="none"
                  :stroke="arrow.active ? arrow.color : '#333'"
                  :stroke-width="arrow.active ? 2 : 1"
                  :stroke-dasharray="arrow.dashed ? '5 3' : 'none'"
                  :marker-end="`url(#arr-${arrow.id})`"
                  style="transition: all 0.3s"/>
            <text v-if="arrow.label && arrow.active"
                  :x="arrow.lx" :y="arrow.ly"
                  text-anchor="middle" font-size="8"
                  :fill="arrow.color">{{ arrow.label }}</text>
          </g>

          <!-- 节点 -->
          <g v-for="node in currentNodes" :key="node.id"
             style="cursor:pointer" @click="node.stepIdx >= 0 && (step = node.stepIdx)">
            <rect :x="node.x - node.w/2" :y="node.y - node.h/2"
                  :width="node.w" :height="node.h"
                  :fill="nodeColor(node)"
                  :stroke="nodeBorder(node)"
                  stroke-width="1.5" :rx="node.round ? node.h/2 : 5"
                  style="transition: all 0.3s"/>
            <text :x="node.x" :y="node.y - (node.sub ? 4 : 0)"
                  text-anchor="middle" font-size="9.5" font-weight="600"
                  :fill="nodeTextColor(node)">{{ node.label }}</text>
            <text v-if="node.sub" :x="node.x" :y="node.y + 10"
                  text-anchor="middle" font-size="8"
                  :fill="nodeTextColor(node)" opacity="0.8">{{ node.sub }}</text>
          </g>
        </svg>
      </div>

      <!-- 右侧：步骤详情 -->
      <div class="detail-panel">
        <div class="detail-step-badge">步骤 {{ step + 1 }}</div>
        <div class="detail-title">{{ currentStepData.title }}</div>
        <div class="detail-desc">{{ currentStepData.desc }}</div>

        <div v-if="currentStepData.spec" class="detail-spec">
          📎 {{ currentStepData.spec }}
        </div>

        <div v-if="currentStepData.ie" class="detail-ie">
          <div class="ie-title">关键 IE</div>
          <div v-for="ie in currentStepData.ie" :key="ie" class="ie-item">{{ ie }}</div>
        </div>

        <div v-if="currentStepData.ntn" class="detail-ntn">
          <span class="ntn-icon">🛰️</span> {{ currentStepData.ntn }}
        </div>

        <!-- 进度条 -->
        <div class="progress-wrap">
          <div class="progress-bar"
               :style="{width: ((step+1)/currentSteps.length*100)+'%'}"/>
        </div>
        <div class="progress-label">{{ step+1 }} / {{ currentSteps.length }}</div>

        <!-- 步骤列表 -->
        <div class="step-list">
          <div v-for="(s, i) in currentSteps" :key="i"
            :class="['step-item', {active: i===step, done: i<step}]"
            @click="step=i">
            <span class="step-dot">{{ i < step ? '✓' : i+1 }}</span>
            <span class="step-name">{{ s.title }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部：关键参数表 -->
    <div class="param-bar" v-if="mode==='bfr'">
      <div class="pb-title">BFR 关键参数（beamFailureRecoveryConfig）</div>
      <div class="pb-params">
        <div v-for="p in bfrParams" :key="p.name" class="pb-item">
          <span class="pb-name">{{ p.name }}</span>
          <span class="pb-val" :style="{color: p.color}">{{ bfrScene==='ntn' ? p.ntn : p.ground }}</span>
          <span class="pb-unit">{{ p.unit }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

const mode = ref<'p1'|'p2p3'|'bfr'>('p1')
const step = ref(0)
const bfrScene = ref<'ground'|'ntn'>('ground')
const autoPlay = ref(false)
let autoTimer: ReturnType<typeof setInterval> | null = null

const modes = [
  { id: 'p1',   label: 'P1 初始建立' },
  { id: 'p2p3', label: 'P2 / P3 精化' },
  { id: 'bfr',  label: 'BFR 波束恢复' },
]

// SVG 尺寸
const svgW = 520
const svgH = 340

// 分区
const zones = [
  { id: 'gnb', x: 10, y: 5, w: 240, h: svgH-10, fill: '#58a6ff', color: '#58a6ff', label: 'gNB 侧' },
  { id: 'ue',  x: 270, y: 5, w: 240, h: svgH-10, fill: '#3fb950', color: '#3fb950', label: 'UE 侧' },
]

// ── P1 节点与箭头 ─────────────────────────────────────────────────────────────
const p1Nodes = [
  { id: 'sib1',   x: 130, y: 50,  w: 140, h: 28, label: 'SIB1 广播', sub: 'SSB 周期/位置', round: false, stepIdx: 0, type: 'gnb' },
  { id: 'sync',   x: 390, y: 50,  w: 140, h: 28, label: 'PSS/SSS 同步', sub: '帧同步 + PCI', round: false, stepIdx: 1, type: 'ue' },
  { id: 'ssb',    x: 130, y: 110, w: 140, h: 28, label: 'SSB 扫描', sub: 'N_tx 方向', round: false, stepIdx: 2, type: 'gnb' },
  { id: 'meas',   x: 390, y: 110, w: 140, h: 28, label: 'L1-RSRP 测量', sub: 'N_tx × M_rx', round: false, stepIdx: 3, type: 'ue' },
  { id: 'select', x: 390, y: 170, w: 140, h: 28, label: '最优波束对选择', sub: 'argmax(RSRP)', round: false, stepIdx: 4, type: 'ue' },
  { id: 'prach',  x: 390, y: 230, w: 140, h: 28, label: 'PRACH 上报', sub: '关联最优 SSB#k', round: false, stepIdx: 5, type: 'ue' },
  { id: 'rar',    x: 130, y: 230, w: 140, h: 28, label: 'gNB 推断 Tx 方向', sub: '通过 PRACH 资源映射', round: false, stepIdx: 6, type: 'gnb' },
  { id: 'csi_cfg',x: 130, y: 290, w: 140, h: 28, label: 'RRC: 配置 CSI-RS', sub: 'QCL-TypeD → SSB#k', round: false, stepIdx: 7, type: 'gnb' },
]

const p1Arrows = [
  { id: 'a1', d: 'M 130 65 L 320 65', color: '#58a6ff', active: true, dashed: false, label: 'SIB1', lx: 225, ly: 60 },
  { id: 'a2', d: 'M 320 50 L 320 50', color: '#3fb950', active: false, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'a3', d: 'M 200 110 L 320 110', color: '#d29922', active: true, dashed: false, label: 'SSB#0~#N', lx: 260, ly: 105 },
  { id: 'a4', d: 'M 390 138 L 390 158', color: '#3fb950', active: true, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'a5', d: 'M 390 198 L 390 218', color: '#3fb950', active: true, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'a6', d: 'M 320 230 L 202 230', color: '#f85149', active: true, dashed: false, label: 'PRACH(SSB#k)', lx: 261, ly: 224 },
  { id: 'a7', d: 'M 130 258 L 130 278', color: '#58a6ff', active: true, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'a8', d: 'M 200 290 L 320 290', color: '#58a6ff', active: true, dashed: false, label: 'RRC Reconfig', lx: 260, ly: 284 },
]

// ── P2/P3 节点与箭头 ──────────────────────────────────────────────────────────
const p2p3Nodes = [
  { id: 'csirs_tx',x: 130, y: 60,  w: 140, h: 28, label: 'CSI-RS 发送', sub: 'N候选方向（P1邻域）', round: false, stepIdx: 0, type: 'gnb' },
  { id: 'rx_fix',  x: 390, y: 60,  w: 140, h: 28, label: 'UE 固定接收波束', sub: '= P1 最优接收方向', round: false, stepIdx: 1, type: 'ue' },
  { id: 'meas2',   x: 390, y: 120, w: 140, h: 28, label: 'L1-RSRP 测量', sub: '各 CSI-RS → P2', round: false, stepIdx: 2, type: 'ue' },
  { id: 'cri_rpt', x: 390, y: 180, w: 140, h: 28, label: 'CRI-RSRP 上报', sub: 'PUCCH / PUSCH', round: false, stepIdx: 3, type: 'ue' },
  { id: 'tci_act', x: 130, y: 180, w: 140, h: 28, label: 'TCI State 激活', sub: 'MAC CE → DCI', round: false, stepIdx: 4, type: 'gnb' },
  { id: 'p3_tx',   x: 130, y: 250, w: 140, h: 28, label: 'CSI-RS 固定发射', sub: '= P2 最优 Tx 方向', round: false, stepIdx: 5, type: 'gnb' },
  { id: 'rx_sweep',x: 390, y: 250, w: 140, h: 28, label: 'UE Rx 扫描', sub: 'M候选接收方向→P3', round: false, stepIdx: 6, type: 'ue' },
  { id: 'done',    x: 260, y: 310, w: 120, h: 28, label: '✅ 最优波束对确立', sub: '', round: true, stepIdx: 7, type: 'done' },
]

const p2p3Arrows = [
  { id: 'b1', d: 'M 200 60 L 320 60',  color: '#d29922', active: true, dashed: false, label: 'CSI-RS', lx: 260, ly: 55 },
  { id: 'b2', d: 'M 390 88 L 390 108', color: '#3fb950', active: true, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'b3', d: 'M 320 180 L 202 180',color: '#f85149', active: true, dashed: false, label: 'CRI 上报', lx: 261, ly: 174 },
  { id: 'b4', d: 'M 130 208 L 130 238',color: '#58a6ff', active: true, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'b5', d: 'M 200 250 L 320 250',color: '#d29922', active: true, dashed: false, label: '固定 Tx', lx: 260, ly: 245 },
  { id: 'b6', d: 'M 390 278 L 320 310',color: '#3fb950', active: true, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'b7', d: 'M 200 278 L 200 310',color: '#58a6ff', active: true, dashed: false, label: '', lx: 0, ly: 0 },
]

// ── BFR 节点与箭头 ────────────────────────────────────────────────────────────
const bfrNodes = [
  { id: 'monitor', x: 390, y: 45,  w: 140, h: 28, label: 'RSRP 监测', sub: '服务 CSI-RS', round: false, stepIdx: 0, type: 'ue' },
  { id: 'bfi',     x: 390, y: 100, w: 140, h: 28, label: 'BFI 实例', sub: 'RSRP < 门限', round: false, stepIdx: 1, type: 'ue' },
  { id: 'counter', x: 390, y: 155, w: 140, h: 28, label: 'BFI_COUNTER++', sub: '达到 maxCount?', round: false, stepIdx: 2, type: 'ue' },
  { id: 'fail',    x: 390, y: 210, w: 140, h: 28, label: '波束失败宣告', sub: '通知 MAC 层', round: false, stepIdx: 3, type: 'fail' },
  { id: 'cand',    x: 390, y: 265, w: 140, h: 28, label: '候选新波束扫描', sub: 'candidateBeamRSList', round: false, stepIdx: 4, type: 'ue' },
  { id: 'prach2',  x: 390, y: 310, w: 140, h: 28, label: 'CFRA PRACH TX', sub: '绑定候选波束方向', round: false, stepIdx: 5, type: 'ue' },
  { id: 'gnb_rx',  x: 130, y: 310, w: 140, h: 28, label: 'gNB PRACH 检测', sub: '推断新波束方向', round: false, stepIdx: 6, type: 'gnb' },
  { id: 'pdcch_n', x: 130, y: 255, w: 140, h: 28, label: 'PDCCH（新方向）', sub: 'DL Assignment', round: false, stepIdx: 7, type: 'gnb' },
  { id: 'ok',      x: 260, y: 195, w: 120, h: 28, label: '✅ 波束恢复', sub: '', round: true, stepIdx: 8, type: 'done' },
]

const bfrArrows = [
  { id: 'c1', d: 'M 390 73 L 390 88',  color: C_RED,    active: true, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'c2', d: 'M 390 128 L 390 143',color: '#f85149', active: true, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'c3', d: 'M 390 183 L 390 198',color: '#f85149', active: true, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'c4', d: 'M 390 238 L 390 253',color: '#d29922', active: true, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'c5', d: 'M 390 293 L 390 298',color: '#3fb950', active: true, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'c6', d: 'M 320 310 L 202 310',color: '#3fb950', active: true, dashed: false, label: 'PRACH', lx: 261, ly: 304 },
  { id: 'c7', d: 'M 130 282 L 130 267',color: '#58a6ff', active: true, dashed: false, label: '', lx: 0, ly: 0 },
  { id: 'c8', d: 'M 200 255 L 200 209',color: '#58a6ff', active: true, dashed: false, label: 'PDCCH', lx: 215, ly: 230 },
]

const C_RED = '#f85149'

// 步骤数据
const p1Steps = [
  { title: 'gNB 广播 SIB1', desc: 'SIB1 包含 RACH 参数（prach-ConfigurationIndex / ra-ResponseWindow / SSB-RACH 映射关系）。UE 在 IDLE 状态下持续监听 SSB，从 PBCH 解出 MIB 后，进一步解码 SIB1。', spec: '38.300 §9.2.1，38.331 SIB1', ie: ['prach-ConfigurationIndex', 'ssb-perRACH-OccasionAndCB-PreamblesPerSSB', 'ra-ResponseWindow'] },
  { title: 'UE PSS/SSS 同步', desc: 'UE 通过检测 PSS 获得时隙同步，通过 SSS 获得帧同步和物理小区 ID（PCI = 3×SSS_ID + PSS_ID）。同步完成后方可进入 P1 扫描阶段。', spec: '38.211 §7.4.2.2（PSS），§7.4.2.3（SSS）' },
  { title: 'gNB 发送 SSB Burst', desc: 'gNB 在 SS/PBCH Burst（5ms 窗口）内连续发送 Lmax 个 SSB，每个 SSB 对应不同的发射波束方向（空间预编码向量）。FR2 时 Lmax=64，FR1 Sub-6GHz 时 Lmax=4 或 8。', spec: 'TR 38.802 §6.1.6.1（P1）', ie: ['ssb-PositionsInBurst', 'ssb-periodServingCell'], ntn: 'NTN 中 gNB（载荷）的 SSB 波束覆盖地面光斑（直径 100~1000km），单个 SSB 波束比 FR2 地面系统宽得多。' },
  { title: 'UE 测量 L1-RSRP', desc: '对每个接收 SSB，UE 在所有候选接收波束方向（M_rx 个）上分别接收，计算 L1-RSRP（基于 SSS 或 PBCH-DMRS）。完整 P1 需要 N_tx × M_rx 次测量，构成 RSRP 矩阵。', spec: '38.214 §5.2.2（L1-RSRP 测量定义）' },
  { title: 'UE 选择最优波束对', desc: '从 RSRP 矩阵中找到最大值对应的 (i_tx, j_rx) 组合，即为初始最优波束对。选定的 SSB 索引将在下一步通过 PRACH 上报给 gNB。', spec: 'TR 38.802 §6.1.6.1' },
  { title: 'UE 发送 PRACH Preamble', desc: '选择与最优 SSB#k 关联的 PRACH 资源（时频位置），发送 Preamble——这是隐式波束上报，gNB 通过收到 PRACH 的资源编号反推出 UE 选定的 SSB 方向。', spec: '38.213 §8.1（SSB 与 RACH Occasion 映射）', ie: ['ra-ssb-OccasionMaskIndex', 'ra-OccasionList'], ntn: 'NTN 中 UE 在发送 PRACH 前需做 TA 预补偿（基于 GNSS + 星历），ra-ResponseWindow 需扩展至 640 slots（Rel-17）。' },
  { title: 'gNB 推断 UE 方向', desc: 'gNB 收到 PRACH 后，根据 PRACH 资源的 SSB 关联映射，确定 UE 当前最优下行发射波束方向。随后 gNB 在该方向上发送 RAR（Msg2），完成上行同步。', spec: '38.321 §5.1.3（RAR 格式）' },
  { title: 'RRC 配置 CSI-RS 资源', desc: 'P1 完成后，gNB 通过 RRC Reconfiguration 为 UE 配置精细化 CSI-RS 资源集（在 P1 最优方向附近配置多个候选波束）。每个 CSI-RS 的 QCL-TypeD 参数关联到 P1 选出的最优 SSB，告知 UE 接收方向不变。', spec: '38.331 CSI-MeasConfig，38.214 §5.1.5（QCL-TypeD）', ie: ['nzp-CSI-RS-ResourceToAddModList', 'qcl-Type（TypeD, SSB#k）'] },
]

const p2p3Steps = [
  { title: 'gNB 发送 CSI-RS（P2）', desc: 'gNB 在 P1 确定的大致方向附近，以不同空间预编码向量发送多个 NZP-CSI-RS 资源（候选精细化发射波束）。各 CSI-RS 的 QCL-TypeD 参数均指向 P1 选出的最优 SSB（即 UE 接收方向不变）。', spec: '38.214 §5.2.2（NZP-CSI-RS 配置）', ie: ['nzp-CSI-RS-ResourceSetToAddModList', 'qcl-Type2 = {SSB#k, TypeD}'] },
  { title: 'UE 固定接收波束（P2）', desc: 'P2 的关键特征：UE 保持 P1 选出的最优接收方向不变，只让 gNB 发射端扫描。这是因为 QCL-TypeD 参考了 P1 的最优 SSB，UE 接收各 CSI-RS 时使用同一接收波束。', spec: '38.214 §5.1.5（QCL-TypeD 的作用）', ntn: 'NTN 场景中，UE 可能需要结合星历预测调整接收波束方向，而非完全固定 P1 的结果。' },
  { title: 'UE 测量各 CSI-RS RSRP', desc: '对每个 CSI-RS 资源，UE 计算 L1-RSRP，构成候选波束的 RSRP 列表。每个 CSI-RS 对应 gNB 的一个候选精细发射方向。精细波束的 RSRP 通常比 P1 宽波束改善 2~5dB。', spec: '38.214 §5.2.2（L1-RSRP Measurement）' },
  { title: 'UE 上报 CRI-RSRP', desc: 'UE 将最优 CSI-RS 资源索引（CRI，CSI-RS Resource Indicator）及对应 RSRP 通过 CSI 报告（PUCCH 或 PUSCH）上报给 gNB。CRI 告知 gNB 哪个精细波束方向的 RSRP 最高。', spec: '38.214 §5.2.2，38.331 CSI-ReportConfig', ie: ['reportQuantity = cri-RSRP', 'CRI（1~N 索引）'] },
  { title: 'gNB 激活 TCI State', desc: 'gNB 收到 CRI 后，将对应 CSI-RS 方向配置为新的 TCI State，并通过 MAC CE（TCI States Activation）激活。DCI format 1_1 中的 3bit TCI 字段将指向新激活的 TCI State，UE 在 HARQ-ACK 后 n+3 slot 起按新方向接收 PDSCH。', spec: '38.214 §5.1.5，38.321 §6.1.3.14（MAC CE）', ie: ['TCI-StateId', 'tci-PresentInDCI（DCI 1_1）', '生效时间：HARQ-ACK 后 n+3 slot'] },
  { title: 'gNB 固定发射 CSI-RS（P3）', desc: 'P3 阶段：gNB 固定使用 P2 选出的最优发射波束方向，持续发送同一 CSI-RS。这样 gNB 发射方向不再变化，为 UE 提供稳定的测量基准。', spec: 'TR 38.802 §6.1.6.1（P3）' },
  { title: 'UE 切换接收波束（P3）', desc: 'UE 对同一 CSI-RS 资源，依次切换不同的接收波束方向（不同的 Rx 空间滤波器），在每个方向上测量 RSRP。选择 RSRP 最高的接收方向为最优 UE 接收波束。P3 是纯 UE 内部操作，无需额外上报。', spec: 'TR 38.802 §6.1.6.1（P3 = Rx-end beam refinement）' },
  { title: '✅ 最优波束对确立', desc: 'P1→P2→P3 完成后，gNB 和 UE 均知道了最优发射/接收波束方向。PDSCH 按最优 TCI State 传输，频谱效率和覆盖质量均达到最优。后续通过周期性 CSI-RS 测量维护波束质量。', spec: '38.300 §9.2（连接态波束管理）' },
]

const bfrStepsGround = [
  { title: 'RSRP 周期监测', desc: '物理层（PHY）持续监测服务 PDCCH 关联的 CSI-RS 的 L1-RSRP，计算假设性 PDCCH BLER。每个 OFDM 符号均可产生测量值，判断是否低于 beamFailureDetectionThreshold。', spec: '38.321 §5.17（BFD 流程）', ie: ['beamFailureDetectionTimer', 'beamFailureDetectionThreshold（RSRP 门限）'] },
  { title: 'BFI 实例上报', desc: '当 L1-RSRP 低于门限时，PHY 层生成一次 BFI（Beam Failure Instance）指示给 MAC 层，同时启动（或重启）beamFailureDetectionTimer。', spec: '38.321 §5.17', ntn: '地面遮挡通常为人体/建筑（持续 100ms 级）；NTN 遮挡可能为山地/建筑（持续 1s 级），BFI 指示频率与 beamFailureDetectionTimer 匹配至关重要。' },
  { title: 'BFI_COUNTER 累计', desc: 'MAC 层对每次 BFI 指示进行 BFI_COUNTER++，并重启计时器。若 beamFailureDetectionTimer 超时前未达到 maxCount，则 Counter 重置、恢复正常——这防止偶发干扰误触发 BFR。', spec: '38.321 §5.17', ie: ['BFI_COUNTER（初始=0）', 'beamFailureInstanceMaxCount（典型值 1~8）'] },
  { title: '波束失败宣告', desc: 'BFI_COUNTER ≥ beamFailureInstanceMaxCount 时，MAC 层宣告波束失败（Beam Failure）。同时启动 beamFailureRecoveryTimer，开始计时恢复窗口。', spec: '38.321 §5.17', ie: ['beamFailureRecoveryTimer（10~240ms）'], ntn: '地面 beamFailureRecoveryTimer 最大 240ms；GEO NTN RTT ≈ 480ms，标准定时器不够——Rel-17 引入扩展配置。' },
  { title: '候选新波束识别', desc: 'UE 立即扫描 candidateBeamRSList（预配置的候选 SSB/CSI-RS 列表），寻找 RSRP > rsrp-ThresholdBFR 的候选。优先选 CSI-RS；若全部不满足则扫描 SSB；若完全找不到则等待或触发 RLF。', spec: '38.213 §10（候选波束选择）', ie: ['candidateBeamRSList', 'rsrp-ThresholdBFR'] },
  { title: 'CFRA PRACH 发送', desc: 'UE 在与候选新波束关联的专用 PRACH 资源上发送 Preamble（CFRA，非竞争接入）。gNB 通过 PRACH 资源识别：①这是 BFR 请求；②UE 期望切换到哪个新波束方向。', spec: '38.321 §5.17，38.213 §10', ie: ['ra-ssb-OccasionMaskIndex', 'ra-OccasionList（BFR 专用）', 'prach-ConfigurationIndex（beamFailureRecoveryConfig 内）'], ntn: 'NTN 的 BFR PRACH 同样需要 TA 预补偿和扩展的 ra-ResponseWindow（最大 640 slots）。' },
  { title: 'gNB PRACH 检测', desc: 'gNB 在新波束方向上检测 PRACH，解析 UE 期望的新波束。随后 gNB 在新方向（新 TCI State）上发送 PDCCH，携带 DL Assignment 或 UL Grant。', spec: '38.321 §5.17' },
  { title: 'PDCCH 解码（新方向）', desc: 'UE 在新候选波束方向上成功解码 PDCCH，即证明新波束可用。UE 发送 HARQ-ACK，BFI_COUNTER 重置为 0，beamFailureRecoveryTimer 停止。', spec: '38.321 §5.17' },
  { title: '✅ 波束恢复完成', desc: 'BFR 成功！UE 的服务波束切换到新方向，数据传输继续。整个 BFR 流程耗时约 beamFailureDetectionTimer + PRACH 处理时间（地面约 50~100ms）。', spec: '38.321 §5.17', ntn: 'LEO NTN 完整 BFR 耗时 ≈ beamFailureDetectionTimer + RTT（4~21ms）= 约 30~250ms，仍明显快于 RLF 重建（秒级）。' },
]

// 当前显示的数据
const currentNodes = computed(() => {
  if (mode.value === 'p1') return p1Nodes
  if (mode.value === 'p2p3') return p2p3Nodes
  return bfrNodes
})

const currentArrows = computed(() => {
  const arrows = mode.value === 'p1' ? p1Arrows : mode.value === 'p2p3' ? p2p3Arrows : bfrArrows
  return arrows.map(a => ({ ...a, active: true }))
})

const currentSteps = computed(() =>
  mode.value === 'p1' ? p1Steps : mode.value === 'p2p3' ? p2p3Steps : bfrStepsGround
)

const currentStepData = computed(() => currentSteps.value[step.value] || currentSteps.value[0])

// 节点颜色
function nodeColor(node: any) {
  if (node.type === 'done') return '#3fb95022'
  if (node.type === 'fail') return '#f8514922'
  const isActive = node.stepIdx === step.value
  if (node.type === 'gnb') return isActive ? '#58a6ff22' : '#1f2937'
  if (node.type === 'ue')  return isActive ? '#3fb95022' : '#1f2937'
  return '#1f2937'
}
function nodeBorder(node: any) {
  if (node.type === 'done') return '#3fb950'
  if (node.type === 'fail') return '#f85149'
  const isActive = node.stepIdx === step.value
  if (node.type === 'gnb') return isActive ? '#58a6ff' : '#374151'
  if (node.type === 'ue')  return isActive ? '#3fb950' : '#374151'
  return '#374151'
}
function nodeTextColor(node: any) {
  if (node.type === 'done') return '#3fb950'
  if (node.type === 'fail') return '#f85149'
  const isActive = node.stepIdx === step.value
  if (isActive) return node.type === 'gnb' ? '#58a6ff' : '#3fb950'
  return '#8b949e'
}

function prevStep() { if (step.value > 0) step.value-- }
function nextStep() { if (step.value < currentSteps.value.length - 1) step.value++ }

function toggleAuto() {
  autoPlay.value = !autoPlay.value
  if (autoPlay.value) {
    autoTimer = setInterval(() => {
      if (step.value < currentSteps.value.length - 1) {
        step.value++
      } else {
        autoPlay.value = false
        if (autoTimer) clearInterval(autoTimer)
      }
    }, 2200)
  } else {
    if (autoTimer) clearInterval(autoTimer)
  }
}

onUnmounted(() => { if (autoTimer) clearInterval(autoTimer) })

// BFR 参数表
const bfrParams = [
  { name: 'beamFailureDetectionTimer', ground: '20 ms', ntn: '60 ms', unit: '', color: '#58a6ff' },
  { name: 'beamFailureInstanceMaxCount', ground: '3', ntn: '3', unit: 'BFI', color: '#d29922' },
  { name: 'beamFailureRecoveryTimer', ground: '80 ms', ntn: '320 ms (Rel-17)', unit: '', color: '#f85149' },
  { name: 'ra-ResponseWindow', ground: '40 slots', ntn: '640 slots (Rel-17)', unit: '', color: '#3fb950' },
]
</script>

<style scoped>
.bmf-root {
  font-family: var(--vp-font-family-mono, monospace);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px; padding: 16px; margin: 24px 0;
  color: var(--vp-c-text-1);
}
.bmf-header { margin-bottom: 12px; }
.bmf-title { font-size: 15px; font-weight: 700; color: var(--vp-c-brand); display: block; }
.bmf-sub { font-size: 11px; color: var(--vp-c-text-2); }

.bmf-controls {
  display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;
  padding: 10px; background: var(--vp-c-bg);
  border-radius: 6px; border: 1px solid var(--vp-c-divider); align-items: center;
}
.ctrl-group { display: flex; align-items: center; gap: 7px; }
.ctrl-group label { font-size: 11px; color: var(--vp-c-text-2); white-space: nowrap; }
.btn-group { display: flex; gap: 3px; }
.ctrl-btn {
  padding: 3px 9px; font-size: 11px; border-radius: 4px;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2); cursor: pointer; transition: all 0.15s;
}
.ctrl-btn.active { background: var(--vp-c-brand); border-color: var(--vp-c-brand); color: #fff; }
.nav-btn {
  padding: 3px 10px; font-size: 11px; border-radius: 4px;
  border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1); cursor: pointer;
}
.nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.step-counter { font-size: 11px; color: var(--vp-c-text-2); padding: 0 6px; }
.btn-auto {
  padding: 4px 12px; font-size: 11px; border-radius: 5px;
  border: 1px solid var(--vp-c-brand); color: var(--vp-c-brand);
  background: transparent; cursor: pointer;
}
.btn-auto:hover { background: var(--vp-c-brand-soft); }

.bmf-main { display: grid; grid-template-columns: 1fr 260px; gap: 14px; align-items: start; }

.flow-wrap { overflow-x: auto; }
.flow-svg { width: 100%; height: auto; }

.detail-panel {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 12px;
}
.detail-step-badge {
  font-size: 10px; font-weight: 700; color: var(--vp-c-brand);
  text-transform: uppercase; margin-bottom: 4px;
}
.detail-title { font-size: 12px; font-weight: 700; margin-bottom: 6px; color: var(--vp-c-text-1); }
.detail-desc { font-size: 10px; color: var(--vp-c-text-2); line-height: 1.7; margin-bottom: 8px; }
.detail-spec { font-size: 9px; color: var(--vp-c-text-3); margin-bottom: 6px; }
.detail-ie { margin-bottom: 6px; }
.ie-title { font-size: 9px; color: var(--vp-c-brand); font-weight: 700; margin-bottom: 3px; }
.ie-item {
  font-size: 9px; color: var(--vp-c-text-2); padding: 2px 6px;
  background: var(--vp-c-bg-soft); border-radius: 3px; margin-bottom: 2px;
}
.detail-ntn {
  font-size: 9.5px; color: #b45309; background: #fef3c7;
  border-radius: 4px; padding: 5px 7px; margin-bottom: 8px; line-height: 1.5;
}
.ntn-icon { margin-right: 3px; }

.progress-wrap { height: 3px; background: var(--vp-c-divider); border-radius: 2px; margin: 8px 0 2px; }
.progress-bar { height: 100%; background: var(--vp-c-brand); border-radius: 2px; transition: width 0.3s; }
.progress-label { font-size: 9px; color: var(--vp-c-text-3); margin-bottom: 8px; }

.step-list { max-height: 180px; overflow-y: auto; }
.step-item {
  display: flex; align-items: flex-start; gap: 6px; padding: 4px 5px;
  border-radius: 4px; cursor: pointer; transition: background 0.1s;
  font-size: 9px; color: var(--vp-c-text-3);
}
.step-item:hover { background: var(--vp-c-bg-soft); }
.step-item.active { background: var(--vp-c-brand-soft); color: var(--vp-c-brand); }
.step-item.done { color: var(--vp-c-text-2); }
.step-dot {
  min-width: 16px; height: 16px; border-radius: 50%; font-size: 9px;
  display: flex; align-items: center; justify-content: center;
  background: var(--vp-c-bg-elv); flex-shrink: 0;
}
.step-item.active .step-dot { background: var(--vp-c-brand); color: #fff; }
.step-item.done .step-dot { background: #3fb95030; color: #3fb950; }

.param-bar {
  margin-top: 12px; background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 10px;
}
.pb-title { font-size: 10px; font-weight: 700; color: var(--vp-c-text-2); margin-bottom: 8px; }
.pb-params { display: flex; flex-wrap: wrap; gap: 8px; }
.pb-item {
  background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider);
  border-radius: 5px; padding: 6px 10px; flex: 1; min-width: 140px;
}
.pb-name { display: block; font-size: 9px; color: var(--vp-c-text-3); margin-bottom: 3px; }
.pb-val { font-size: 12px; font-weight: 700; }
.pb-unit { font-size: 9px; color: var(--vp-c-text-3); margin-left: 3px; }

@media (max-width: 650px) {
  .bmf-main { grid-template-columns: 1fr; }
  .bmf-controls { flex-direction: column; }
}
</style>
