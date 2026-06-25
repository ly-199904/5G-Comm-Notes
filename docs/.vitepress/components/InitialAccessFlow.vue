<template>
  <div class="iaf-wrap">
    <div class="iaf-header">
      <span class="iaf-title">Initial Access 全流程可视化</span>
      <span class="iaf-spec">3GPP TS 38.213 §4.1 / 38.211 §7.4 / 38.331 §6.2.2</span>
    </div>

    <!-- 控制栏 -->
    <div class="iaf-controls">
      <button @click="prevStep" :disabled="step === 0" class="ctrl-btn">← 上一步</button>
      <button @click="toggleAuto" class="ctrl-btn play-btn">
        {{ autoPlay ? '⏸ 暂停' : '▶ 自动播放' }}
      </button>
      <button @click="nextStep" :disabled="step === steps.length - 1" class="ctrl-btn">下一步 →</button>
      <span class="step-indicator">{{ step + 1 }} / {{ steps.length }}</span>
      <select v-model.number="speed" class="speed-select">
        <option :value="3000">快</option>
        <option :value="5000">中</option>
        <option :value="8000">慢</option>
      </select>
    </div>

    <!-- 主视图 -->
    <div class="iaf-main">
      <!-- 左侧：流程进度条 -->
      <div class="iaf-progress">
        <div v-for="(s, i) in steps" :key="i"
             :class="['progress-node', {
               done: i < step,
               active: i === step,
               pending: i > step
             }]"
             @click="step = i">
          <div class="pn-circle">
            <span v-if="i < step">✓</span>
            <span v-else>{{ i + 1 }}</span>
          </div>
          <div class="pn-label">{{ s.label }}</div>
          <div v-if="i < steps.length - 1" class="pn-line"></div>
        </div>
      </div>

      <!-- 右侧：可视化面板 -->
      <div class="iaf-viz">
        <Transition name="viz-fade" mode="out-in">

          <!-- ═══════════════════════════════════════════════════════════════ -->
          <!-- Step 0: UE 开机 + 频率扫描 -->
          <!-- ═══════════════════════════════════════════════════════════════ -->
          <div v-if="step === 0" key="s0" class="viz-content">
            <div class="viz-scene">
              <div class="step-badge">开机 → 频率扫描</div>

              <!-- UE设备图标 + 扫描动画 -->
              <div class="scan-hero">
                <div class="ue-icon">
                  <svg width="56" height="90" viewBox="0 0 56 90">
                    <rect x="4" y="2" width="48" height="86" rx="6" fill="#161b22" stroke="#555" stroke-width="2"/>
                    <rect x="12" y="10" width="32" height="48" rx="3" fill="#0d1117"/>
                    <circle cx="28" cy="34" r="12" fill="none" stroke="#3fb950" stroke-width="2" opacity="0.7">
                      <animate attributeName="r" values="12;20;12" dur="1.5s" repeatCount="indefinite"/>
                      <animate attributeName="opacity" values="0.7;0.1;0.7" dur="1.5s" repeatCount="indefinite"/>
                    </circle>
                    <text x="28" y="38" text-anchor="middle" fill="#3fb950" font-size="10">📶</text>
                    <text x="28" y="70" text-anchor="middle" fill="#888" font-size="8">扫描中…</text>
                  </svg>
                </div>

                <div class="scan-spectrum">
                  <div class="spec-title">NR 频段扫描（Sync Raster 逐点检测 PSS 能量）</div>
                  <svg :viewBox="`0 0 ${scanSvgW} 130`" class="scan-svg">
                    <!-- 频段方块 -->
                    <g v-for="(b, bi) in scanBands" :key="b.name">
                      <rect :x="b.x" y="22" :width="b.w" height="42" rx="4"
                            :fill="b.color" :opacity="b.active ? 0.35 : 0.08"
                            :stroke="b.color" stroke-width="1.2"
                            :stroke-opacity="b.active ? 0.7 : 0.2"/>
                      <text :x="b.x + b.w/2" y="40" text-anchor="middle" font-size="11" font-weight="600"
                            :fill="b.active ? '#fff' : '#444'">{{ b.name }}</text>
                      <text :x="b.x + b.w/2" y="56" text-anchor="middle" font-size="8"
                            :fill="b.active ? '#ccc' : '#444'">{{ b.freq }}</text>
                    </g>

                    <!-- 信号强度柱状图 -->
                    <g v-for="(bar, bi) in signalBars" :key="'bar'+bi">
                      <rect :x="bar.x" y="78" :width="bar.w" :height="bar.h" rx="2"
                            :fill="bar.color" :opacity="bar.opacity">
                        <animate attributeName="height" :values="bar.animH" dur="2s" repeatCount="indefinite"/>
                        <animate attributeName="y" :values="bar.animY" dur="2s" repeatCount="indefinite"/>
                      </rect>
                    </g>

                    <!-- 标签 -->
                    <text x="10" y="120" font-size="9" fill="#ff7b72">弱信号</text>
                    <text x="330" y="120" font-size="9" fill="#3fb950" text-anchor="end">最强信号(n78)</text>
                  </svg>
                </div>
              </div>

              <div class="info-card">
                <div class="ic-title">频率扫描阶段</div>
                <div class="ic-body">
                  UE 上电后，RF 前端扫描支持的频段，在每个<b>同步栅格（Sync Raster）</b>频点上用本地 PSS 序列做互相关。
                  找到最强 PSS 能量的小区后，锁定该频点进入下一步。<br/>
                  <br/>
                  <b>同步栅格</b>：频域上以固定间隔（FR1: 1.2MHz/1.44MHz, FR2: 17.28MHz）分布的搜索点，
                  比信道栅格（Channel Raster）更稀疏，目的是加速小区搜索。
                </div>
              </div>
            </div>
          </div>

          <!-- ═══════════════════════════════════════════════════════════════ -->
          <!-- Step 1: PSS 检测 -->
          <!-- ═══════════════════════════════════════════════════════════════ -->
          <div v-else-if="step === 1" key="s1" class="viz-content">
            <div class="viz-scene">
              <div class="step-badge">PSS 主同步信号检测</div>

              <div class="pss-det-viz">
                <svg :viewBox="`0 0 400 160`" class="det-svg">
                  <!-- 接收信号 -->
                  <rect x="15" y="10" width="370" height="28" rx="3" fill="#1a1a2e" stroke="#444" stroke-width="1"/>
                  <text x="200" y="29" text-anchor="middle" font-size="10" fill="#aaa">接收信号（127点序列）</text>

                  <!-- 三个相关器并行 -->
                  <g v-for="(pss, idx) in pssDetectors" :key="idx">
                    <rect :x="pss.x" :y="pss.y" width="110" height="60" rx="5"
                          :fill="pss.id === 1 ? 'rgba(63,185,80,0.12)' : '#1a1a2e'"
                          :stroke="pss.id === 1 ? '#3fb950' : '#444'" stroke-width="1.5"/>
                    <text :x="pss.x + 55" y="62" text-anchor="middle" font-size="10" :fill="pss.id === 1 ? '#3fb950' : '#888'">
                      相关器 {{ pss.id }}
                    </text>
                    <text :x="pss.x + 55" y="85" text-anchor="middle" font-size="9" :fill="pss.id === 1 ? '#3fb950' : '#555'">
                      {{ pss.id === 0 ? 'N_ID²=0' : pss.id === 1 ? 'N_ID²=1' : 'N_ID²=2' }}
                    </text>
                    <!-- 峰值指示 -->
                    <rect v-if="pss.id === 1" :x="pss.x + 30" y="92" width="50" height="14" rx="3"
                          fill="#3fb950" opacity="0.2"/>
                    <text v-if="pss.id === 1" :x="pss.x + 55" y="103" text-anchor="middle" font-size="9" fill="#3fb950" font-weight="600">
                      ● 峰值!
                    </text>
                  </g>

                  <!-- 结果 -->
                  <rect x="15" y="108" width="370" height="24" rx="4"
                        fill="rgba(63,185,80,0.06)" stroke="#3fb950" stroke-width="0.8"/>
                  <text x="200" y="125" text-anchor="middle" font-size="11" fill="#3fb950">
                    N_ID² = <b>1</b> · 符号级时间同步完成 · 知道每个 OFDM 符号的起始边界
                  </text>

                  <!-- 下方标注 -->
                  <text x="200" y="150" text-anchor="middle" font-size="8" fill="#666">
                    PSS = 长度为127的m序列（BPSK），共3种候选，互相关即可区分
                  </text>
                </svg>
              </div>

              <div class="info-card">
                <div class="ic-title">PSS 的三个关键作用</div>
                <div class="ic-body">
                  ① <b>符号定时</b>：确定 OFDM 符号的起始位置（symbol-level timing）<br/>
                  ② <b>频率同步</b>：纠正 UE 晶振与 gNB 的频率偏差（PSS 的已知序列做频偏估计）<br/>
                  ③ <b>N_ID²</b>：从 3 个候选值中确定一个，为 PCI 计算提供 1/3 的信息
                </div>
              </div>
            </div>
          </div>

          <!-- ═══════════════════════════════════════════════════════════════ -->
          <!-- Step 2: SSS 检测 -->
          <!-- ═══════════════════════════════════════════════════════════════ -->
          <div v-else-if="step === 2" key="s2" class="viz-content">
            <div class="viz-scene">
              <div class="step-badge">SSS 辅同步信号检测</div>

              <div class="sss-det-viz">
                <svg :viewBox="`0 0 400 150`" class="det-svg">
                  <!-- 335候选示意 -->
                  <rect x="15" y="10" width="370" height="38" rx="3" fill="#1a1a2e" stroke="#444" stroke-width="1"/>
                  <text x="200" y="26" text-anchor="middle" font-size="9" fill="#888">
                    336 个候选 SSS 序列（N_ID¹ ∈ {0,1,...,335}）
                  </text>
                  <!-- 候选格子 -->
                  <g v-for="c in 72" :key="c">
                    <rect :x="20 + ((c-1) % 72) * 5" :y="32 + Math.floor((c-1) / 72) * 8"
                          width="3.5" height="6" rx="1"
                          :fill="c === 34 ? '#3fb950' : '#2a2a3e'"
                          :stroke="c === 34 ? '#3fb950' : '#333'"
                          stroke-width="0.3"/>
                  </g>

                  <!-- 匹配箭头 -->
                  <text x="130" y="64" font-size="10" fill="#3fb950">第 112 号候选·N_ID¹ = 112</text>

                  <!-- PCI 计算 -->
                  <rect x="60" y="78" width="280" height="42" rx="5"
                        fill="rgba(88,166,255,0.08)" stroke="#58a6ff" stroke-width="1.2"/>
                  <text x="200" y="96" text-anchor="middle" font-size="10" fill="#58a6ff">
                    PCI 计算公式（38.211 §7.4.1.2）
                  </text>
                  <text x="200" y="114" text-anchor="middle" font-size="12" fill="#fff" font-weight="600">
                    PCI = 3 × N_ID¹ + N_ID² = 3 × 112 + 1 = <tspan fill="#58a6ff">337</tspan>
                  </text>

                  <!-- 1008个PCI的定位 -->
                  <text x="200" y="143" text-anchor="middle" font-size="8" fill="#666">
                    3 × 336 = 1008 个唯一 PCI · 帧定时同步完成（知道10ms帧边界）
                  </text>
                </svg>
              </div>

              <div class="info-card">
                <div class="ic-title">SSS 与 PSS 的协同</div>
                <div class="ic-body">
                  PSS 先做<b>粗同步</b>（符号级 + N_ID²），SSS 再做<b>精同步</b>（帧级 + N_ID¹）。
                  两者合在一起：确定 10ms 帧边界 + 完整的 1008 选 1 的 PCI。<br/>
                  <br/>
                  SSS 也是 127 长，使用 Gold 序列（两个 m 序列的 XOR），比 PSS 的 m 序列有更好的互相关特性，适合从 336 个候选中区分。
                </div>
              </div>
            </div>
          </div>

          <!-- ═══════════════════════════════════════════════════════════════ -->
          <!-- Step 3: PBCH → MIB -->
          <!-- ═══════════════════════════════════════════════════════════════ -->
          <div v-else-if="step === 3" key="s3" class="viz-content">
            <div class="viz-scene">
              <div class="step-badge">PBCH 解码 → MIB</div>

              <!-- SSB 结构 -->
              <div class="ssb-struct">
                <div class="ssb-row">
                  <div v-for="(sym, si) in ssbSyms" :key="si" :class="['ssb-sym', `ssb-sym${si}`]">
                    <div class="ssb-sym-header">{{ sym.label }}</div>
                    <div class="ssb-sym-content">{{ sym.content }}</div>
                    <div class="ssb-sym-freq">240 sc</div>
                  </div>
                </div>
                <div class="ssb-note">SSB 时频结构：4 个 OFDM 符号 × 240 子载波 = 20 RB（SCS=15kHz 时）</div>
              </div>

              <!-- MIB 字段表 -->
              <div class="mib-table">
                <div class="mib-title">MIB 字段拆解（23 bits + 物理层附加 = 32 bits 传输块）</div>
                <div class="mib-grid">
                  <div v-for="f in mibFields" :key="f.name" class="mib-row">
                    <span class="mib-name">{{ f.name }}</span>
                    <span class="mib-bits">{{ f.bits }}</span>
                    <span class="mib-val">{{ f.val }}</span>
                    <span class="mib-desc">{{ f.desc }}</span>
                  </div>
                </div>
              </div>

              <!-- DMRS 隐含信息提示 -->
              <div class="dmrs-hint">
                <span class="dmrs-icon">🔑</span>
                PBCH 自身的 <b>DMRS 序列相位</b>随 SFN 低 4 位每 10ms 变化一次 + 半帧指示 n_hf + SSB 索引低 3 位。
                UE 检测 DMRS 相位即可恢复完整 SFN——不占用 MIB payload 空间。
              </div>
            </div>
          </div>

          <!-- ═══════════════════════════════════════════════════════════════ -->
          <!-- Step 4: pdcch-ConfigSIB1 查表 -->
          <!-- ═══════════════════════════════════════════════════════════════ -->
          <div v-else-if="step === 4" key="s4" class="viz-content">
            <div class="viz-scene">
              <div class="step-badge">pdcch-ConfigSIB1 查表 → CORESET#0 + SearchSpace#0</div>

              <div class="config-sib1">
                <!-- 输入 -->
                <div class="cs1-input">
                  <span class="cs1-label">pdcch-ConfigSIB1 =</span>
                  <span class="cs1-val">0x23</span>
                  <span class="cs1-bin">(0010 0011)</span>
                  <span class="cs1-arrow">→</span>
                  <span class="cs1-split">高4位: controlResourceSetZero = <b>2</b></span>
                  <span class="cs1-split">低4位: searchSpaceZero = <b>3</b></span>
                </div>

                <!-- 两张查表结果 -->
                <div class="cs1-tables">
                  <div class="cs1-table">
                    <div class="cst-title">Table 13-1 → CORESET#0 配置</div>
                    <div class="cst-row"><span>复用模式</span><span>Pattern 1（TDM，不同符号）</span></div>
                    <div class="cst-row"><span>RB 数量</span><span class="em">48 RB（≈ 17.28 MHz @ 30kHz）</span></div>
                    <div class="cst-row"><span>符号数</span><span class="em">2 个 OFDM 符号</span></div>
                    <div class="cst-row"><span>RB 偏移</span><span>0（与 SSB 对齐）</span></div>
                  </div>
                  <div class="cs1-table">
                    <div class="cst-title">Table 13-11 → SearchSpace#0 配置</div>
                    <div class="cst-row"><span>Slot 周期</span><span class="em">每 2 个 slot</span></div>
                    <div class="cst-row"><span>Slot 偏移</span><span>0</span></div>
                    <div class="cst-row"><span>起始符号</span><span>0（CORESET 第1个符号）</span></div>
                    <div class="cst-row"><span>监听时长</span><span>2 个符号（即整个 CORESET）</span></div>
                  </div>
                </div>
              </div>

              <div class="info-card">
                <div class="ic-title">8 bits → 完整的时频配置，怎么做到的？</div>
                <div class="ic-body">
                  NR 协议把 <b>CORESET#0 的所有可能组合预先编成了查表</b>（38.213 Table 13-1 ~ 13-15）。
                  每个索引对应一行，涵盖了复用模式、RB 数、符号数、偏移量等全部参数。
                  这是 5G 极致信令压缩的代表——用查表替代显式编码，把 ~30+ bits 的信息压缩到 8 bits。
                </div>
              </div>
            </div>
          </div>

          <!-- ═══════════════════════════════════════════════════════════════ -->
          <!-- Step 5: PDCCH 盲检 (SI-RNTI) -->
          <!-- ═══════════════════════════════════════════════════════════════ -->
          <div v-else-if="step === 5" key="s5" class="viz-content">
            <div class="viz-scene">
              <div class="step-badge">SearchSpace#0 内 PDCCH 盲检</div>

              <div class="blind-viz">
                <svg :viewBox="`0 0 400 170`" class="det-svg">
                  <!-- CORESET#0 区域框 -->
                  <rect x="15" y="8" width="370" height="52" fill="none" stroke="#58a6ff" stroke-width="1.2" rx="3"
                        stroke-dasharray="8 4" opacity="0.5"/>
                  <text x="25" y="22" font-size="8" fill="#58a6ff" opacity="0.8">
                    CORESET#0 · 48 RB × 2 symbols · SearchSpace#0 每2 slot监听
                  </text>

                  <!-- PDCCH 候选 -->
                  <g v-for="(cand, ci) in pdcchCandidates" :key="'c'+ci">
                    <rect :x="cand.x" :y="cand.y" :width="cand.w" :height="cand.h" rx="2"
                          :fill="cand.matched ? 'rgba(63,185,80,0.25)' : 'rgba(26,26,46,0.7)'"
                          :stroke="cand.matched ? '#3fb950' : '#444'" stroke-width="1"
                          :class="{ 'cand-flash': cand.matched }"/>
                    <text v-if="cand.matched" :x="cand.x + cand.w/2" :y="cand.y + cand.h/2 + 3"
                          text-anchor="middle" font-size="7" fill="#3fb950" font-weight="700">✓ 匹配</text>
                    <text v-else :x="cand.x + cand.w/2" :y="cand.y + cand.h/2 + 3"
                          text-anchor="middle" font-size="6" fill="#444">×</text>
                  </g>

                  <!-- CRC 匹配成功 -->
                  <rect x="50" y="74" width="300" height="30" rx="5"
                        fill="rgba(63,185,80,0.1)" stroke="#3fb950" stroke-width="1"/>
                  <text x="200" y="94" text-anchor="middle" font-size="11" fill="#3fb950">
                    CRC 用 <b>SI-RNTI (0xFFFF)</b> 解扰通过 → DCI format 1_0
                  </text>

                  <!-- DCI 关键字段 -->
                  <rect x="15" y="114" width="370" height="50" rx="4"
                        fill="rgba(88,166,255,0.05)" stroke="#58a6ff" stroke-width="0.7"/>
                  <text x="25" y="130" font-size="9" fill="#58a6ff">DCI format 1_0 (调度 SIB1)：</text>
                  <text x="25" y="146" font-size="9" fill="#aaa">
                    freqDomainAssign=0x1A3F · timeDomainAssign=2 · VRB-PRB=0 · MCS=4 · RV=0 · SI=1
                  </text>
                  <text x="25" y="160" font-size="8" fill="#666">
                    → 指向 PDSCH：频域 RB#20~80 · 时域符号#3~13 · QPSK R=0.43
                  </text>
                </svg>
              </div>

              <div class="info-card">
                <div class="ic-title">为什么需要盲检？</div>
                <div class="ic-body">
                  PDCCH 没有"地址标签"标明接收者。UE 不知道自己的 DCI 在哪个 CCE 上、用了多大的 AL。
                  所以只能<b>逐个候选位置尝试</b>，用 SI-RNTI 解扰 CRC 来确认——CRC 通过 = 找到了！
                  <br/><br/>
                  <b>SI-RNTI = 0xFFFF</b>：所有 UE 出厂即知的固定值，用于接收广播调度信息。
                  此时 UE 还没有 C-RNTI（那是 RACH 完成后才分配的），SI-RNTI 是唯一可用的 RNTI。
                </div>
              </div>
            </div>
          </div>

          <!-- ═══════════════════════════════════════════════════════════════ -->
          <!-- Step 6: PDSCH → SIB1 -->
          <!-- ═══════════════════════════════════════════════════════════════ -->
          <div v-else-if="step === 6" key="s6" class="viz-content">
            <div class="viz-scene">
              <div class="step-badge">PDSCH 解调 → 获取 SIB1</div>

              <div class="sib1-viz">
                <svg :viewBox="`0 0 400 160`" class="det-svg">
                  <!-- PDSCH 资源 -->
                  <rect x="15" y="8" width="370" height="30" rx="3"
                        fill="rgba(88,166,255,0.06)" stroke="#58a6ff" stroke-width="0.8"/>
                  <text x="200" y="27" text-anchor="middle" font-size="10" fill="#58a6ff">
                    PDSCH · RB#20~80 · 时域符号#3~13 · MCS=4 (QPSK R≈0.43)
                  </text>

                  <!-- 解码流程 -->
                  <g v-for="(step, si) in decodeChain" :key="si">
                    <rect :x="step.x" y="48" width="65" height="28" rx="4"
                          fill="#1a1a2e" :stroke="step.color" stroke-width="1"/>
                    <text :x="step.x + 32.5" y="65" text-anchor="middle" font-size="8" :fill="step.color">
                      {{ step.label }}
                    </text>
                    <!-- 箭头 -->
                    <text v-if="si < decodeChain.length - 1" :x="step.x + 69" y="66"
                          text-anchor="middle" font-size="10" fill="#555">→</text>
                  </g>

                  <!-- SIB1 精华内容 -->
                  <rect x="15" y="86" width="370" height="68" rx="5"
                        fill="rgba(138,107,191,0.06)" stroke="#8a6bbf" stroke-width="1.2"/>
                  <text x="25" y="102" font-size="9" fill="#c8a8ff" font-weight="600">
                    SIB1 · servingCellConfigCommon
                  </text>
                  <text x="25" y="118" font-size="8.5" fill="#ccc">
                    rach-ConfigCommon:
                  </text>
                  <text x="25" y="133" font-size="8" fill="#999">
                    prach-ConfigIdx=<b>16</b> · msg1-FreqStart=<b>0</b> · msg1-SCS=<b>15kHz</b>
                    · preambleRxTargetPower=<b>-100dBm</b> · ra-RespWindow=<b>40 slots</b>
                  </text>
                  <text x="25" y="147" font-size="8" fill="#999">
                    totalPreambles=<b>64</b> · ssb-perRO=<b>1</b> · Ncs=<b>13</b>
                    · powerRampingStep=<b>2dB</b> · preambleTransMax=<b>10</b>
                  </text>
                </svg>
              </div>

              <div class="info-card">
                <div class="ic-title">SIB1 的关键作用</div>
                <div class="ic-body">
                  SIB1 是 RACH 之前的最后一块拼图。其中 <b>rach-ConfigCommon</b> 包含了 PRACH 时频位置、
                  Preamble 格式、功率控制参数等全部 RACH 所需配置。至此 UE 已具备发起 RACH 的全部先决条件。
                </div>
              </div>
            </div>
          </div>

          <!-- ═══════════════════════════════════════════════════════════════ -->
          <!-- Step 7: RACH 就绪 -->
          <!-- ═══════════════════════════════════════════════════════════════ -->
          <div v-else-if="step === 7" key="s7" class="viz-content">
            <div class="viz-scene ready-scene">
              <div class="step-badge">Initial Access 前段完成 · RACH 就绪</div>

              <div class="ready-layout">
                <!-- 完成清单 -->
                <div class="ready-checklist">
                  <div class="rcl-title">✅ 已完成步骤</div>
                  <div class="rcl-item"><span class="rcl-check">✓</span> 频率扫描 → 锁定 n78 频点 (3.5GHz)</div>
                  <div class="rcl-item"><span class="rcl-check">✓</span> PSS → N_ID²=1 · 符号同步</div>
                  <div class="rcl-item"><span class="rcl-check">✓</span> SSS → N_ID¹=112 · PCI=337 · 帧同步</div>
                  <div class="rcl-item"><span class="rcl-check">✓</span> PBCH → MIB · SFN · pdcch-ConfigSIB1=0x23</div>
                  <div class="rcl-item"><span class="rcl-check">✓</span> CORESET#0 (48RB×2sym) + SS#0 (每2slot)</div>
                  <div class="rcl-item"><span class="rcl-check">✓</span> PDCCH 盲检 (SI-RNTI) → DCI format 1_0</div>
                  <div class="rcl-item"><span class="rcl-check">✓</span> PDSCH → SIB1 → rach-ConfigCommon</div>
                </div>

                <!-- 指向 RACH 的箭头 -->
                <div class="ready-next">
                  <svg width="50" height="120" viewBox="0 0 50 120">
                    <line x1="25" y1="0" x2="25" y2="70" stroke="#3fb950" stroke-width="2.5"
                          stroke-dasharray="6 3"/>
                    <polygon points="25,85 17,72 33,72" fill="#3fb950"/>
                  </svg>
                  <div class="rach-goal">
                    <span class="rach-goal-icon">📡</span>
                    <span class="rach-goal-label">RACH<br/>Msg1</span>
                  </div>
                </div>
              </div>

              <div class="info-card ready-card">
                <div class="ic-title">此时 UE 的状态</div>
                <div class="ic-body">
                  状态：<b>RRC_IDLE</b> · 已获得 <b>PCI=337</b> · 已解码 <b>SIB1</b> · 已知 RACH 配置<br/>
                  下一步：在 PRACH Occasion 上发送 Zadoff-Chu Preamble，开启上行同步之旅
                </div>
              </div>
            </div>
          </div>

        </Transition>
      </div>
    </div>

    <!-- 底部当前步骤说明 -->
    <div class="iaf-summary">
      <span class="sum-label">{{ steps[step].label }}</span>
      <span class="sum-desc">{{ steps[step].desc }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface Step {
  label: string
  desc: string
}

const steps: Step[] = [
  { label: '① 频率扫描',           desc: 'RF 前端扫描 NR 频段，在同步栅格上搜索 PSS 能量，锁定最强小区频点' },
  { label: '② PSS 检测',           desc: '3 选 1 互相关检测 → N_ID² + 符号级时间同步 + 频率粗校正' },
  { label: '③ SSS 检测',           desc: '336 选 1 → 完整 PCI (3×336=1008) + 10ms 帧边界同步' },
  { label: '④ PBCH → MIB',         desc: '解码 32-bit MIB: SFN / SCS / k_SSB / pdcch-ConfigSIB1 / cellBarred' },
  { label: '⑤ 查表 CORESET#0',     desc: 'pdcch-ConfigSIB1 8 bits → 查表得 CORESET#0 时频位置 + SearchSpace#0 盲检参数' },
  { label: '⑥ PDCCH 盲检 (SI-RNTI)', desc: 'SearchSpace#0 内用 SI-RNTI=0xFFFF 解扰 CRC → 找到 DCI format 1_0' },
  { label: '⑦ PDSCH → SIB1',       desc: '按 DCI 指示解调 PDSCH → 获取 SIB1 → 提取 rach-ConfigCommon 全部 RACH 参数' },
  { label: '⑧ RACH 就绪',          desc: '下行同步 + 系统消息获取完成，具备发起 RACH Msg1 的全部条件（RRC_IDLE）' },
]

// ── 状态 ──────────────────────────────────────────────────────────────────
const step = ref(0)
const autoPlay = ref(false)
const speed = ref(5000)
let timer: ReturnType<typeof setInterval> | null = null

function nextStep() {
  if (step.value < steps.length - 1) step.value++
  else autoPlay.value = false
}
function prevStep() { if (step.value > 0) step.value-- }
function toggleAuto() {
  autoPlay.value = !autoPlay.value
  autoPlay.value ? startTimer() : stopTimer()
}
function startTimer() {
  stopTimer()
  if (autoPlay.value) {
    timer = setInterval(() => {
      if (step.value < steps.length - 1) step.value++
      else { autoPlay.value = false; stopTimer() }
    }, speed.value)
  }
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null } }
onMounted(() => { if (autoPlay.value) startTimer() })
onUnmounted(() => stopTimer())

// ── Step 0: 频段扫描 ──────────────────────────────────────────────────────
const scanSvgW = 380

const scanBands = [
  { name: 'n1',  freq: '2.1G', x: 5,   w: 46, color: '#ff7b72', active: true  },
  { name: 'n41', freq: '2.5G', x: 56,  w: 46, color: '#ffa657', active: true  },
  { name: 'n77', freq: '3.7G', x: 107, w: 46, color: '#f0c24f', active: true  },
  { name: 'n78', freq: '3.5G', x: 158, w: 50, color: '#3fb950', active: true  },
  { name: 'n79', freq: '4.7G', x: 213, w: 46, color: '#58a6ff', active: false },
  { name: 'n257',freq: '28G', x: 264, w: 55, color: '#c8a8ff', active: false },
]

const signalBars = computed(() =>
  scanBands.map((b, i) => ({
    x: b.x + b.w / 2 - 9,
    w: 18,
    h: [8, 12, 16, 22, 6, 4][i] || 6,
    animH: `${[6,10,14,20,4,2][i]};${[10,14,18,26,8,6][i]};${[6,10,14,20,4,2][i]}`,
    animY: `${100-[6,10,14,20,4,2][i]};${100-[10,14,18,26,8,6][i]};${100-[6,10,14,20,4,2][i]}`,
    color: b.color,
    opacity: [0.4, 0.55, 0.7, 0.95, 0.2, 0.12][i],
  }))
)

// ── Step 1: PSS 检测器 ─────────────────────────────────────────────────────
const pssDetectors = [
  { x: 15,  y: 52, id: 0 },
  { x: 145, y: 52, id: 1 },
  { x: 275, y: 52, id: 2 },
]

// ── Step 3: SSB ────────────────────────────────────────────────────────────
const ssbSyms = [
  { label: 'OFDM sym0',  content: 'PSS',        color: '#ff7b72' },
  { label: 'OFDM sym1',  content: 'PBCH + DMRS', color: '#58a6ff' },
  { label: 'OFDM sym2',  content: 'SSS + PBCH',  color: '#ffa657' },
  { label: 'OFDM sym3',  content: 'PBCH + DMRS', color: '#58a6ff' },
]

const mibFields = [
  { name: 'systemFrameNumber',         bits: '6', val: '011010',     desc: 'SFN 高6位（低4位由PBCH DMRS相位携带）' },
  { name: 'subCarrierSpacingCommon',   bits: '1', val: 'scs15or60', desc: 'SIB1 的 PDCCH/PDSCH 使用 15 kHz SCS' },
  { name: 'ssb-SubcarrierOffset',      bits: '4', val: '6',          desc: 'k_SSB = 6: SSB 与 RB 网格的子载波偏移' },
  { name: 'dmrs-TypeA-Position',       bits: '1', val: 'pos2',       desc: '下行 DMRS 起始符号 = #2' },
  { name: 'pdcch-ConfigSIB1',          bits: '8', val: '0x23',       desc: '→ controlResourceSetZero=2, searchSpaceZero=3' },
  { name: 'cellBarred',                bits: '1', val: 'notBarred',  desc: '小区允许接入' },
  { name: 'intraFreqReselection',      bits: '1', val: 'allowed',    desc: '同频小区重选允许' },
  { name: 'spare',                     bits: '1', val: '0',          desc: '预留位' },
]

// ── Step 5: PDCCH 候选 ─────────────────────────────────────────────────────
const pdcchCandidates = Array.from({ length: 18 }, (_, i) => {
  const row = Math.floor(i / 6)
  const col = i % 6
  return {
    x: 28 + col * 58,
    y: 30 + row * 20,
    w: 48,
    h: 14,
    matched: i === 7,
  }
})

// ── Step 6: 解码流程 ──────────────────────────────────────────────────────
const decodeChain = [
  { x: 5,   label: 'LDPC 解码',  color: '#ff7b72' },
  { x: 85,  label: '解速率匹配', color: '#ffa657' },
  { x: 165, label: '解扰',       color: '#f0c24f' },
  { x: 245, label: 'RRC 解析',   color: '#58a6ff' },
  { x: 325, label: 'SIB1 PDU',   color: '#3fb950' },
]
</script>

<style scoped>
.iaf-wrap {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px; padding: 20px; margin: 20px 0;
  background: var(--vp-c-bg-soft); font-size: 13px;
}

.iaf-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap;
}
.iaf-title { font-size: 15px; font-weight: 600; color: var(--vp-c-text-1); }
.iaf-spec  { font-size: 11px; padding: 2px 8px; border-radius: 20px;
             background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }

/* ── 控制栏 ────────────────────────────────────────────────────────────── */
.iaf-controls {
  display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap;
}
.ctrl-btn {
  padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer;
  border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-1); transition: all 0.15s;
}
.ctrl-btn:hover:not(:disabled) { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.ctrl-btn:disabled { opacity: 0.35; cursor: default; }
.play-btn { border-color: #3fb950; color: #3fb950; }
.step-indicator {
  font-size: 12px; color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono); margin-left: 6px;
}
.speed-select {
  margin-left: auto; padding: 4px 8px; border-radius: 6px;
  border: 1.5px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-1); font-size: 11px; cursor: pointer;
}

/* ── 主体布局 ──────────────────────────────────────────────────────────── */
.iaf-main { display: grid; grid-template-columns: 200px 1fr; gap: 14px; min-height: 380px; }
@media (max-width: 680px) { .iaf-main { grid-template-columns: 1fr; } }

/* ── 左侧进度条 ────────────────────────────────────────────────────────── */
.iaf-progress {
  display: flex; flex-direction: column; gap: 0;
  padding: 10px; background: var(--vp-c-bg); border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
}
.progress-node {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  padding: 4px 0; position: relative; z-index: 1;
}
.pn-circle {
  width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 600; transition: all 0.3s;
  border: 2px solid var(--vp-c-divider); background: var(--vp-c-bg);
  color: var(--vp-c-text-3);
}
.progress-node.done .pn-circle {
  background: #3fb950; border-color: #3fb950; color: #fff;
}
.progress-node.active .pn-circle {
  border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}
.pn-label { font-size: 10px; color: var(--vp-c-text-3); line-height: 1.3; transition: color 0.3s; }
.progress-node.done .pn-label { color: var(--vp-c-text-2); }
.progress-node.active .pn-label { color: var(--vp-c-text-1); font-weight: 600; }
.pn-line {
  position: absolute; left: 11px; top: 28px; width: 2px;
  height: calc(100% - 4px); background: var(--vp-c-divider); z-index: -1;
}
.progress-node.done .pn-line { background: #3fb950; opacity: 0.5; }

/* ── 右侧可视化面板 ────────────────────────────────────────────────────── */
.iaf-viz {
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; overflow: hidden; position: relative;
}
.viz-scene { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.viz-fade-enter-active, .viz-fade-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.viz-fade-enter-from { opacity: 0; transform: translateY(6px); }
.viz-fade-leave-to   { opacity: 0; transform: translateY(-6px); }

.step-badge {
  font-size: 12px; font-weight: 600; color: var(--vp-c-brand-1);
  padding: 4px 10px; background: var(--vp-c-brand-soft);
  border-radius: 20px; display: inline-block; align-self: flex-start;
}

/* ── 通用 ──────────────────────────────────────────────────────────────── */
.det-svg { width: 100%; height: auto; display: block; }
.info-card {
  background: rgba(255,255,255,0.015); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 10px 12px;
}
.ic-title { font-size: 11px; font-weight: 600; color: var(--vp-c-text-2); margin-bottom: 5px; }
.ic-body  { font-size: 10.5px; color: var(--vp-c-text-3); line-height: 1.7; }

/* ── Step 0: 频率扫描 ──────────────────────────────────────────────────── */
.scan-hero { display: flex; gap: 14px; align-items: flex-start; }
.scan-spectrum { flex: 1; }
.spec-title { font-size: 11px; color: var(--vp-c-text-2); margin-bottom: 6px; font-weight: 500; }
.scan-svg { width: 100%; height: auto; display: block; }

/* ── Step 3: SSB ───────────────────────────────────────────────────────── */
.ssb-struct { margin-bottom: 4px; }
.ssb-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.ssb-sym {
  border-radius: 8px; padding: 8px 4px; text-align: center;
  background: #1a1a2e; border: 1px solid #333;
}
.ssb-sym0 { border-top: 2px solid #ff7b72; }
.ssb-sym1 { border-top: 2px solid #58a6ff; }
.ssb-sym2 { border-top: 2px solid #ffa657; }
.ssb-sym3 { border-top: 2px solid #58a6ff; }
.ssb-sym-header { font-size: 9px; color: var(--vp-c-text-3); margin-bottom: 3px; }
.ssb-sym-content { font-size: 11px; font-weight: 600; color: var(--vp-c-text-1); margin-bottom: 2px; }
.ssb-sym-freq { font-size: 8px; color: var(--vp-c-text-3); }
.ssb-note { font-size: 9.5px; color: var(--vp-c-text-3); text-align: center; margin-top: 6px; }

/* ── Step 3: MIB 表格 ──────────────────────────────────────────────────── */
.mib-table { }
.mib-title { font-size: 11px; font-weight: 500; color: var(--vp-c-text-2); margin-bottom: 6px; }
.mib-grid { border: 1px solid #333; border-radius: 6px; overflow: hidden; }
.mib-row {
  display: grid; grid-template-columns: 1.3fr 0.3fr 0.6fr 1.6fr; gap: 6px;
  padding: 4px 8px; font-size: 9.5px; align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.mib-row:last-child { border-bottom: none; }
.mib-name { color: var(--vp-c-text-2); font-family: var(--vp-font-family-mono); }
.mib-bits { color: var(--vp-c-text-3); text-align: center; font-family: var(--vp-font-family-mono); }
.mib-val  { color: var(--vp-c-brand-1); font-family: var(--vp-font-family-mono); font-weight: 500; }
.mib-desc { color: var(--vp-c-text-3); font-size: 9px; line-height: 1.3; }

.dmrs-hint {
  font-size: 10.5px; color: var(--vp-c-text-2); line-height: 1.6;
  background: rgba(138,107,191,0.06); border: 1px solid rgba(138,107,191,0.2);
  border-radius: 8px; padding: 8px 12px; display: flex; gap: 8px; align-items: flex-start;
}
.dmrs-icon { flex-shrink: 0; font-size: 14px; }

/* ── Step 4: pdcch-ConfigSIB1 ───────────────────────────────────────────── */
.cs1-input {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 12px; background: #1a1a2e; border-radius: 8px;
  margin-bottom: 10px; font-size: 12px;
}
.cs1-label { color: var(--vp-c-text-2); }
.cs1-val { color: var(--vp-c-brand-1); font-family: var(--vp-font-family-mono); font-weight: 700; font-size: 14px; }
.cs1-bin { color: var(--vp-c-text-3); font-family: var(--vp-font-family-mono); font-size: 11px; }
.cs1-arrow { color: var(--vp-c-text-3); }
.cs1-split { color: var(--vp-c-text-2); font-size: 11px; }
.cs1-tables { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 520px) { .cs1-tables { grid-template-columns: 1fr; } }
.cs1-table {
  background: #1a1a2e; border-radius: 6px; overflow: hidden; border: 1px solid #333;
}
.cst-title { font-size: 10px; font-weight: 600; padding: 6px 8px;
             background: rgba(255,255,255,0.03); color: var(--vp-c-text-2); }
.cst-row { display: flex; justify-content: space-between; padding: 4px 8px;
           font-size: 10px; color: var(--vp-c-text-2);
           border-top: 1px solid rgba(255,255,255,0.04); }
.cst-row .em { color: var(--vp-c-brand-1); }

/* ── Step 5: PDCCH 盲检 ────────────────────────────────────────────────── */
.cand-flash {
  animation: cand-glow 1.2s ease-in-out infinite;
}
@keyframes cand-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(63,185,80,0.4); }
  50%      { box-shadow: 0 0 8px 3px rgba(63,185,80,0.5); }
}

/* ── Step 7: RACH 就绪 ─────────────────────────────────────────────────── */
.ready-layout { display: flex; gap: 12px; align-items: flex-start; }
.ready-checklist {
  flex: 1; background: rgba(63,185,80,0.03); border: 1px solid rgba(63,185,80,0.15);
  border-radius: 8px; padding: 10px 12px;
}
.rcl-title { font-size: 12px; font-weight: 600; color: #3fb950; margin-bottom: 8px; }
.rcl-item { font-size: 10px; color: var(--vp-c-text-2); padding: 2px 0; display: flex; gap: 6px; align-items: center; }
.rcl-check { color: #3fb950; font-weight: 700; flex-shrink: 0; }
.ready-next { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
.rach-goal {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 12px; border: 2px solid #3fb950; border-radius: 10px;
  animation: pulse-green 1.8s ease-in-out infinite;
}
.rach-goal-icon { font-size: 18px; }
.rach-goal-label { font-size: 10px; font-weight: 700; color: #3fb950; text-align: center; line-height: 1.2; }
@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 0 0 rgba(63,185,80,0.4); }
  50%      { box-shadow: 0 0 0 12px rgba(63,185,80,0); }
}
.ready-card { border-color: rgba(63,185,80,0.2); background: rgba(63,185,80,0.02); }

/* ── 底部 ──────────────────────────────────────────────────────────────── */
.iaf-summary {
  margin-top: 12px; padding: 8px 12px; background: var(--vp-c-bg); border-radius: 6px;
  border: 1px solid var(--vp-c-divider); display: flex; gap: 10px; align-items: center;
}
.sum-label { font-size: 12px; font-weight: 600; color: var(--vp-c-brand-1); white-space: nowrap; }
.sum-desc  { font-size: 11.5px; color: var(--vp-c-text-2); }
</style>
