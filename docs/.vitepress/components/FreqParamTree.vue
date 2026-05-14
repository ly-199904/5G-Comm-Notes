<template>
  <div class="fpt-wrap">

    <!-- 顶部 -->
    <div class="fpt-header">
      <span class="fpt-title">5G 频域资源参数层次图</span>
      <span class="fpt-spec">3GPP TS 38.211 §4.4 / 38.101-1 / 38.213 §12</span>
    </div>

    <div class="fpt-body">

      <!-- 左侧树 -->
      <div class="fpt-tree">

        <!-- 根节点：Point A -->
        <div
          :class="['node root-node', { active: selected === 'pointA' }]"
          @click="select('pointA')"
        >
          <span class="node-icon">📍</span>
          <span class="node-name">absoluteFrequencyPointA</span>
          <span class="node-tag">ARFCN</span>
        </div>

        <!-- 子节点列表 -->
        <div class="children">

          <!-- offsetToCarrier -->
          <div class="child-row">
            <div class="tree-line">
              <div class="vline"></div>
              <div class="hline"></div>
            </div>
            <div
              :class="['node child-node', { active: selected === 'offsetToCarrier' }]"
              @click="select('offsetToCarrier')"
            >
              <span class="node-bracket">[</span>
              <span class="node-name">offsetToCarrier</span>
              <span class="node-bracket">]</span>
              <span class="node-arrow">→</span>
              <span class="node-result">载波可用 RB 起点</span>
            </div>
          </div>

          <!-- offsetToPointA + k_SSB -->
          <div class="child-row">
            <div class="tree-line">
              <div class="vline"></div>
              <div class="hline"></div>
            </div>
            <div class="child-group">
              <div
                :class="['node child-node', { active: selected === 'offsetToPointA' }]"
                @click="select('offsetToPointA')"
              >
                <span class="node-bracket">[</span>
                <span class="node-name">offsetToPointA</span>
                <span class="node-bracket">]</span>
                <span class="node-arrow">→</span>
                <span class="node-result">SSB 最低 RB</span>
              </div>
              <div class="child-row sub">
                <div class="tree-line last">
                  <div class="vline half"></div>
                  <div class="hline"></div>
                </div>
                <div
                  :class="['node child-node leaf-node', { active: selected === 'kSSB' }]"
                  @click="select('kSSB')"
                >
                  <span class="node-bracket">[</span>
                  <span class="node-name">k_SSB</span>
                  <span class="node-bracket">]</span>
                  <span class="node-arrow">→</span>
                  <span class="node-result">SSB 最低子载波</span>
                </div>
              </div>
            </div>
          </div>

          <!-- locationAndBandwidth -->
          <div class="child-row last">
            <div class="tree-line last">
              <div class="vline half"></div>
              <div class="hline"></div>
            </div>
            <div
              :class="['node child-node', { active: selected === 'lab' }]"
              @click="select('lab')"
            >
              <span class="node-bracket">[</span>
              <span class="node-name">locationAndBandwidth</span>
              <span class="node-bracket">]</span>
              <span class="node-arrow">→</span>
              <span class="node-result">BWP 起点 &amp; 带宽</span>
            </div>
          </div>

        </div>

        <!-- 底部注释 -->
        <div class="fpt-footnote">
          参考 SCS：FR1 = 15 kHz，FR2 = 60 kHz<br/>
          <span class="warn">（与 BWP 实际 SCS 无关！）</span>
        </div>

      </div>

      <!-- 右侧详情面板 -->
      <div class="fpt-detail">
        <Transition name="detail-slide" mode="out-in">
          <div :key="selected ?? 'empty'" class="detail-inner">

            <div v-if="!selected" class="detail-empty">
              <div class="empty-icon">👆</div>
              <div class="empty-text">点击左侧任意参数节点<br/>查看详细说明</div>
            </div>

            <template v-else-if="current">
              <div class="detail-name">{{ current.name }}</div>
              <div class="detail-full">{{ current.full }}</div>

              <div class="detail-section" v-if="current.formula">
                <div class="section-label">📐 计算公式</div>
                <div class="section-formula">{{ current.formula }}</div>
              </div>

              <div class="detail-section">
                <div class="section-label">📏 单位 &amp; 范围</div>
                <div class="kv-list">
                  <div class="kv-row" v-for="kv in current.kvs" :key="kv.k">
                    <span class="kv-k">{{ kv.k }}</span>
                    <span class="kv-v">{{ kv.v }}</span>
                  </div>
                </div>
              </div>

              <div class="detail-section" v-if="current.ie">
                <div class="section-label">🔍 Wireshark IE 路径</div>
                <div class="section-ie">{{ current.ie }}</div>
              </div>

              <div class="detail-section" v-if="current.example">
                <div class="section-label">💡 典型取值示例</div>
                <div class="section-example">{{ current.example }}</div>
              </div>

              <div class="ntn-box" v-if="current.ntn">
                <span class="ntn-icon">🛰️</span>
                <span class="ntn-text">{{ current.ntn }}</span>
              </div>
            </template>

          </div>
        </Transition>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const selected = ref<string | null>(null)

function select(id: string) {
  selected.value = selected.value === id ? null : id
}

const NODES: Record<string, any> = {
  pointA: {
    name: 'absoluteFrequencyPointA',
    full: '频域坐标系的全局锚点（数学原点）。本身不承载任何信号，可落在载波保护带之外。所有频域参数都是相对它的偏移量。',
    formula: 'f(MHz) = 0.005 × ARFCN（< 3GHz）\nf(MHz) = 3000 + 0.015 × (ARFCN − 600000)（3~24.25GHz）',
    kvs: [
      { k: '单位',    v: 'ARFCN（绝对无线信道编号）' },
      { k: 'FR1 步长', v: '5 kHz（ARFCN 步长 1）' },
      { k: 'FR2 步长', v: '60 kHz（ARFCN 步长 1）' },
      { k: '典型值',  v: '629352（≈ 3440.28 MHz，n78 频段）' },
    ],
    ie: 'ServingCellConfigCommon\n  → FrequencyInfoDL\n    → absoluteFrequencyPointA',
    example: 'ARFCN = 629352\n→ f = 3000 + 0.015 × (629352 − 600000)\n→ f = 3440.28 MHz',
    ntn: 'NTN 的 Point A 配置与地面完全相同，不因卫星场景而改变。差异在于 ntn-Config 中新增的星历 IE，与频域坐标系无关。',
  },
  offsetToCarrier: {
    name: 'offsetToCarrier',
    full: '从 Point A（CRB#0）到载波实际可用资源起点的距离。告诉系统"信号真正从哪里开始"。Point A 可以落在载波之外，此时 offsetToCarrier > 0。',
    formula: 'f_载波起点 = f_PointA + offsetToCarrier × 12 × Δf_BWP',
    kvs: [
      { k: '单位',   v: '当前 BWP SCS 对应的 RB 数（非参考 SCS！）' },
      { k: '范围',   v: '0 ~ 2199' },
      { k: '典型值', v: '0（Point A 与载波起点重合）' },
    ],
    ie: 'ServingCellConfigCommon\n  → scs-SpecificCarrierList\n    → SCS-SpecificCarrier\n      → offsetToCarrier',
    example: 'offsetToCarrier = 10，SCS = 30kHz\n→ 起点偏移 = 10 × 0.36 MHz = 3.6 MHz\n→ 载波起点 = Point A + 3.6 MHz',
    ntn: null,
  },
  offsetToPointA: {
    name: 'offsetToPointA',
    full: '从 Point A 到 SSB 最低资源块（RB#0 最低子载波）的距离。单位是参考 SCS 的 RB 数（FR1 = 15kHz，FR2 = 60kHz），与 BWP 实际 SCS 无关——这是最常见的混淆点。',
    formula: 'f_SSB_RB0 = f_PointA + offsetToPointA × 12 × Δf_ref\n\n其中 Δf_ref = 15kHz（FR1）或 60kHz（FR2）',
    kvs: [
      { k: '单位（FR1）', v: '15kHz SCS 的 RB 数（= 180 kHz/RB）' },
      { k: '单位（FR2）', v: '60kHz SCS 的 RB 数（= 720 kHz/RB）' },
      { k: '范围',        v: '0 ~ 2199' },
      { k: '典型值',      v: '30（FR1 n78，SSB 在载波中部）' },
    ],
    ie: 'SIB1\n  → FrequencyInfoDL-SIB\n    → offsetToPointA',
    example: 'offsetToPointA = 30，FR1（ref SCS = 15kHz）\n→ SSB RB0 偏移 = 30 × 180kHz = 5.4MHz\n→ SSB 起点 = Point A + 5.4 MHz',
    ntn: 'NTN 的 SSB 结构和 offsetToPointA 含义与地面完全一致。SIB19（卫星星历）通过 PDSCH 广播，不影响 SSB 的频域位置。',
  },
  kSSB: {
    name: 'k_SSB（ssb-SubcarrierOffset）',
    full: 'SSB 最低子载波相对于 offsetToPointA 所指向的 RB 起点的额外子载波粒度偏移。用于将 SSB 对齐到同步栅格（GSCN），是 CORESET#0 位置计算的关键输入之一。',
    formula: 'f_SSB_low = f_SSB_RB0 + k_SSB × Δf_ref',
    kvs: [
      { k: '单位',   v: '子载波数（参考 SCS = 15kHz 步长）' },
      { k: '范围',   v: '0 ~ 23（FR1），0 ~ 11（FR2）' },
      { k: '来源',   v: 'MIB 中 ssb-SubcarrierOffset 字段' },
      { k: '典型值', v: '0（SSB 与 RB 边界对齐，最常见）' },
    ],
    ie: 'MIB\n  → ssb-SubcarrierOffset（即 k_SSB）',
    example: 'k_SSB = 4，ref SCS = 15kHz\n→ 额外偏移 = 4 × 15kHz = 60kHz\n→ 在 offsetToPointA 基础上再移 4 个子载波',
    ntn: 'k_SSB 在 NTN 场景下与地面相同。PDCCH-ConfigSIB1 的 CORESET#0 位置由 offsetToPointA + k_SSB 共同决定，排障时需两者一起检查。',
  },
  lab: {
    name: 'locationAndBandwidth（LAB）',
    full: '用单个整数同时编码 BWP 的起始位置（startRB）和带宽（nRB）。UE 从 RRC 消息解码此值，得到自己的工作频域窗口。',
    formula: '编码：LAB = 37 × startRB + nRB − 1\n\n解码：\nstartRB = ⌊LAB / 37⌋\nnRB     = (LAB mod 37) + 1',
    kvs: [
      { k: '单位',     v: '无（纯整数编码）' },
      { k: '范围',     v: '0 ~ 37949' },
      { k: 'startRB',  v: '0 ~ 274（相对 Point A 的 CRB 偏移）' },
      { k: 'nRB 范围', v: '1 ~ 275' },
    ],
    ie: 'RRCReconfiguration\n  → BWP-Downlink\n    → bwp-Common\n      → genericParameters\n        → locationAndBandwidth',
    example: 'LAB = 1099\n→ startRB = ⌊1099 / 37⌋ = 29\n→ nRB = (1099 mod 37) + 1 = 27\n→ BWP 从 CRB#29 开始，共 27 个 RB',
    ntn: 'Dormant BWP（Rel-17）也使用此字段，通常配置极小的 nRB（如 20）以节省 NTN UE 功耗。预补偿超时时 UE 应切回此 BWP 等待星历更新。',
  },
}

const current = computed(() => selected.value ? NODES[selected.value] : null)
</script>

<style scoped>
.fpt-wrap {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
  background: var(--vp-c-bg-soft);
  font-size: 13px;
}

.fpt-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.fpt-title { font-size: 15px; font-weight: 600; color: var(--vp-c-text-1); }
.fpt-spec  { font-size: 11px; padding: 2px 8px; border-radius: 20px; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }

.fpt-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 640px) {
  .fpt-body { grid-template-columns: 1fr; }
}

/* ── 左树 ── */
.fpt-tree { display: flex; flex-direction: column; }

.root-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 2px solid var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.root-node:hover  { filter: brightness(0.96); }
.root-node.active { background: var(--vp-c-brand-1); }
.root-node.active .node-name { color: #fff; }
.root-node.active .node-tag  { background: rgba(255,255,255,0.25); color: #fff; }

.children     { padding-left: 20px; margin-top: 4px; }
.child-row    { display: flex; align-items: flex-start; margin-bottom: 4px; }
.child-row.sub  { padding-left: 20px; margin-top: 4px; }

.tree-line {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 20px;
  flex-shrink: 0;
  padding-top: 14px;
}
.vline      { width: 1px; flex: 1; min-height: 14px; background: var(--vp-c-divider); margin-left: 10px; }
.vline.half { flex: 0; min-height: 7px; }
.hline      { width: 10px; height: 1px; background: var(--vp-c-divider); margin-left: 10px; flex-shrink: 0; }
.tree-line.last .vline { display: none; }

.child-group { flex: 1; }

.child-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1.5px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  cursor: pointer;
  transition: all 0.15s;
  flex: 1;
  flex-wrap: wrap;
}
.child-node:hover  { border-color: var(--vp-c-brand-2); transform: translateX(2px); }
.child-node.active { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }

.node-icon    { font-size: 14px; }
.node-name    { font-family: var(--vp-font-family-mono); font-size: 12px; font-weight: 600; color: var(--vp-c-text-1); word-break: break-all; }
.node-tag     { font-size: 10px; padding: 1px 6px; border-radius: 10px; background: var(--vp-c-bg-elv); color: var(--vp-c-text-3); }
.node-bracket { font-size: 12px; color: var(--vp-c-text-3); font-family: var(--vp-font-family-mono); }
.node-arrow   { font-size: 11px; color: var(--vp-c-text-3); }
.node-result  { font-size: 11.5px; color: var(--vp-c-text-2); }

.fpt-footnote {
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--vp-c-bg);
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--vp-c-text-3);
  border: 1px solid var(--vp-c-divider);
  line-height: 1.6;
}
.warn { color: #e6a817; font-weight: 500; }

/* ── 右侧详情 ── */
.fpt-detail {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  min-height: 280px;
  overflow: hidden;
}
.detail-inner { padding: 16px; }

.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  gap: 10px;
}
.empty-icon { font-size: 28px; opacity: 0.4; }
.empty-text { font-size: 13px; color: var(--vp-c-text-3); text-align: center; line-height: 1.6; }

.detail-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  margin-bottom: 4px;
  word-break: break-all;
}
.detail-full {
  font-size: 12.5px;
  color: var(--vp-c-text-2);
  line-height: 1.65;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.detail-section { margin-bottom: 12px; }
.section-label  { font-size: 11px; font-weight: 600; color: var(--vp-c-text-3); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.04em; }

.section-formula,
.section-ie {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 8px 10px;
  white-space: pre-wrap;
  color: var(--vp-c-text-1);
  line-height: 1.7;
}
.section-ie { color: var(--vp-c-text-2); }

.section-example {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  background: var(--vp-c-bg-soft);
  border-left: 3px solid var(--vp-c-brand-1);
  border-radius: 0 6px 6px 0;
  padding: 8px 10px;
  white-space: pre-wrap;
  color: var(--vp-c-text-1);
  line-height: 1.7;
}

.kv-list { display: flex; flex-direction: column; gap: 5px; }
.kv-row  { display: flex; gap: 8px; font-size: 12px; }
.kv-k    { color: var(--vp-c-text-3); min-width: 80px; flex-shrink: 0; }
.kv-v    { color: var(--vp-c-text-1); }

.ntn-box {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  padding: 8px 10px;
  margin-top: 4px;
}
.ntn-icon { font-size: 13px; flex-shrink: 0; }
.ntn-text { font-size: 12px; color: #92400e; line-height: 1.6; }

.detail-slide-enter-active,
.detail-slide-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.detail-slide-enter-from   { opacity: 0; transform: translateX(6px); }
.detail-slide-leave-to     { opacity: 0; transform: translateX(-6px); }
</style>
