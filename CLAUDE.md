# CLAUDE.md — 5G-Comm-Notes

## 项目概述

个人 5G NR / NTN（星地融合通信）学习笔记库，目标是从"协议+代码+仿真"三个维度建立通信系统工程能力。

- **仓库**: github.com/ly-199904/5G-Comm-Notes
- **在线站点**: 通过 VitePress 构建，部署在 GitHub Pages（base: `/5G-Comm-Notes/`）
- **规范基准**: 3GPP Rel-15/16/17
- **语言**: 中文（zh-CN）

## 项目结构

```
5G-Comm-Notes/
├── docs/                          # VitePress 文档站点
│   ├── .vitepress/
│   │   ├── config.mts             # 站点配置（导航、侧边栏、KaTeX、Mermaid）
│   │   ├── components/            # Vue 交互组件（*.vue，全局注册）
│   │   └── theme/                 # 自定义主题
│   ├── index.md                   # 首页（hero layout）
│   ├── phase0/                    # 先导课程：通信原理 / 无线通信基础
│   ├── phase1/                    # 基石层：Numerology / 资源网格 / 信道映射 / OFDM
│   ├── phase2/                    # 骨架层：RACH / PDCCH+DCI / HARQ / MIMO / CSI / Beam Mgmt
│   ├── phase3/                    # NTN 前沿：架构 / TA 大时延 / Doppler / Rel-17 增强
│   └── code/                      # 仿真代码说明文档（每篇对应一个 .py）
├── simulation/
│   ├── phase1/                    # Phase 1 仿真脚本 + 输出图片
│   ├── phase2/                    # Phase 2 仿真脚本 + 输出图片
│   └── requirements.txt
└── package.json                   # VitePress + Mermaid 插件
```

## 规划中的 Stage 列表（5G 地面场景 · 9 Stage）

| Stage | 主题 | 核心教学点 |
|-------|------|-----------|
| 0 | UE 开机 | Tc 时钟基准、先验字典 |
| 1 | gNB SSB 广播 | Numerology / SSB Burst / GSCN / 时频网格 / MIB Polar 编码（TX 侧）|
| 2 | PSS 检测 | m-序列 / 零填充过采样 / 盲相关捞针 |
| 3 | SSS 检测 | 双 m-序列相乘 / N_ID¹ 解出 / PCI 合成 |
| 4 | PBCH 译码 | Polar 译码（RX 侧）/ MIB 解析 / SFN 拼接 |
| 5 | CORESET#0 盲检 | pdcch-ConfigSIB1 查表 / 时频反推 / PDCCH 盲检 / DCI 1_0 |
| 6 | SIB1 解析 | PDSCH 调度 / ASN.1 解码 / RACH 配置 + 小区驻留判决 |
| 7 | PRACH 随机接入 | Preamble / RA-RNTI / Msg1~2 / RAR + TA |
| 8 | RRC 建立 | SRB0 / Msg3~4 / 竞争解决 / 安全激活 |

终点说明：严格意义的「驻网（camping）」在 Stage 6 读完 SIB1 即完成；
Stage 7/8 属「接入」（→ RRC_CONNECTED）。完整故事讲到 RRC 建立。
PDU 会话（NAS 层）已越过 L1/L2 接入边界，规划为后续独立项目。
NTN（星地融合）场景亦为后续独立项目。

## 每节课的输出规范（7 项）

每新增一个知识点，必须产出以下三个文件：

### 1. 理论笔记（`docs/phase{n}/{topic}.md`）
- **版本定锚**: 表格标注 Rel-15/16/17 归属 + 3GPP 规范号
- **知识定位**: ASCII 树状图展示在整体知识体系中的位置
- **深度推导**: 原理 → 公式（KaTeX `$$` 块）→ 关键 IE 字段（RRC 树形结构）
- **NTN 深度分析**: Phase 2/3 专题必须包含 NTN 视角的定量分析
- **故障排查速查表**: 表格形式（现象 / 首先检查 / 最可能根因）
- **版本演进速览**: 表格标注各 Release 的支持情况
- **自测题**: 3 道面试级别工程题，使用 `:::details` 折叠答案
- **参考资料**: 规范号 + ShareTechnote + 经典教材

### 2. 仿真代码（`simulation/phase{n}/{topic}_sim.py`）
- 文件头 docstring 标注 3GPP 参考章节
- 使用 NumPy / Matplotlib，必要时 SciPy
- 暗色主题（`DARK_BG='#0d1117'` 等），统一 `ax_style()` 辅助函数
- 输出图片保存到脚本同目录（`OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))`）
- 模块化：数据生成 → 核心算法 → 可视化，每块用分隔线注释标注
- 含 `if __name__ == '__main__':` 入口

### 3. 代码说明文档（`docs/code/{topic}-sim.md`）
- 对应理论笔记和脚本位置链接
- 一分钟速览（ASCII 框图）
- 环境配置 + 运行命令
- 数学-代码对照（至少 3 组：协议公式 → 代码片段 → 验证方法）
- 仿真参数说明表（参数 / 默认值 / 物理含义 / 修改建议）
- 预期输出图表解读（每张图的布局、颜色含义、关键观察、异常诊断）
- NTN Context（`:::info` 块，含 Rel-17 背景 + 实验建议）
- 3GPP 协议溯源表

### 可视化组件（可选，按需）
- Vue 3 SFC，放在 `docs/.vitepress/components/`
- 文件名 PascalCase，在 `.md` 中直接使用（VitePress 自动全局注册）
- 暗色主题一致，带交互式控件

## 对话协议

用户（我）发送格式：
```
🔗 链接：[ShareTechnote URL 或留空]
📌 目标：[知识点名称]
⚙️ 模式：[速读摘要 / 深度推导 / 代码实战 / 故障排查]
```

你的回复应包含对应模式所需的理论笔记、仿真代码和代码说明文档。

## 技术约定

- **KaTeX**: 行内 `$...$`，块级 `$$...$$`，VitePress 已配置 `markdown.math: true`
- **Mermaid**: 通过 `vitepress-plugin-mermaid` 支持，在 `.md` 中用 ` ```mermaid` 代码块
- **Vue 组件**: 放在 `.vitepress/components/` 下即可全局使用，无需手动注册
- **部署命令**: `npm run docs:build` → 推送到 `gh-pages` 分支
- **本地开发**: `npm run docs:dev`

## 当前状态（2026-05-30）

- Stage 0 ✅ 完成 — 学习工具：initial-access-v2（交互式仿真）
- Stage 1 ✅ 完成 — 学习工具：initial-access-v2
- Stage 2 ✅ 完成 — 学习工具：initial-access-v2
- Stage 3~8 ⬜ 待开始
- 笔记库：Phase 0~2 共 13 篇笔记 + 仿真 + Vue 组件已完成

## 编码行为准则

### 1. 先想清楚再动手
- 遇到模糊需求时，先列出假设和多种理解方式，不要默默选一种
- 如果有更简单的实现路径，主动提出；用户说"做 X"但你觉得 Y 更好，直接说
- 不确定时停下来，把困惑点说清楚，而不是猜测一个方案硬上

### 2. 只写必要的代码
- 不写需求之外的功能，不加"以备将来"的灵活性和配置项
- 不为单次使用的代码建抽象层，三行重复不算重复
- 仿真代码允许必要的教学性冗长（多图、多场景比对），但同一计算逻辑不重复三遍

### 3. 精准改动，不动无关代码
- 只改任务范围内的文件和行，不顺手"优化"相邻代码、注释、格式
- 不重构没坏的东西，不替用户决定什么该清理
- 你的改动产生的孤立 import/变量，清理掉；任务范围外的遗留问题，口头提一句就好

### 4. 以可验证目标驱动
- 每步改动定义检查点：改笔记 → `npm run docs:dev` 确认 KaTeX/Mermaid 渲染正常；改仿真 → `python xxx_sim.py` 确认图片生成无报错
- 多步任务先列清单，逐条验证后勾掉，不要最后一次性检查

---

# 5G NR 全流程交互仿真 · learning/initial-access-v2/

> 独立的交互式学习台子项目，每次新对话开始前先读此文件。

## 项目结构

```
learning/initial-access-v2/
├── design-system.css       ← 全局样式（唯一入口）
├── engine.js               ← 纯状态机核心
├── stage-data.js           ← NR_CTX + 十阶段数据字典
├── index.html              ← Hub 导航（侧边栏 + iframe）
├── stage-0-boot.html       ← ✅ 完整实现
├── stage-1-gnb-ssb.html    ← ✅ 完整实现（最复杂）
├── stage-2-pss.html        ← 🔧 骨架
└── stage-3~9-*.html        ← 🔧 骨架（skelStage）
```

## 核心架构规则

### 1. 数据结构（最重要，已踩过坑）
每个 Stage 数据**必须**用 `{ subSteps: [...] }` 包裹：
```js
var S0 = { subSteps: [ discuss(...), sim(...) ] };  // ✅
var S0 = [ discuss(...), sim(...) ];                 // ❌ cf.subSteps=undefined，切步全失效
```

### 2. NR_CTX 全局上下文
唯一跨 Stage 数据总线。写入用 `Engine.ctxSet(key, val)`（会自动刷新顶部标签）。

当前已定义字段（`stage-data.js`）：
`tc_ns` / `gscn` / `arfcn` / `ssb_case` / `scs_khz` / `nid2` / `nid1` / `pci` / `ssb_index` / `sfn_offset` / `hrf` / `kssb` / `dmrs_v` / `mib`

顶部标签自动联动：`dt-gscn` / `dt-pci` / `dt-kssb` / `dt-bwp` / `dt-ta` / `dt-crnti`

### 3. Engine Hooks
```js
Engine.renderVizSVG   = function(subIdx){...};   // 必须实现
Engine.onAfterRender  = function(subIdx){...};   // DOM就绪后回调（启动动画用）
Engine.onStageExit    = function(){...};          // 清理定时器
Engine.addTimer(t);                               // 注册interval，Stage切换自动清除
Engine.LogEngine.inject(msg);                     // 注入控制台
Engine.boot({ stageIdx: N });                    // 最后一行调用
```

### 4. SVG 规范
```html
<!-- ✅ 正确 -->
<svg viewBox="0 0 720 452" width="100%" height="100%" style="display:block;">

<!-- ❌ 错误 — max-height 导致不同子步骤高度不一致 -->
<svg ... style="max-height:440px">
```
- 所有 `<text>` 加 `dominant-baseline="central"`
- 禁止在 `<text>` 内用 `&nbsp;`（用 `&#160;`）或 HTML 标签（`<b>`/`<sub>` 不生效）
- 滑块联动只更新 `element.textContent`，不重绘整个 SVG
- **禁止用 CSS `transform` 平移 SVG**：transform 不改变 layout box，会导致 SVG 视觉上浮盖住上方控件，使滑块/输入框不可点击。用 `margin-bottom`（负值）替代。

### 5. design-system.css 关键数值（勿改）

| 选择器 | 属性 | 值 |
|--------|------|----|
| `.dashboard` | `max-width` | `1560px` |
| `.main-grid` | `grid-template-columns` | `1fr 580px` |
| `.console-wrapper` | `height` | `230px` |
| `.action-title` | `font-size` | `22px` |

## 当前实现状态

### Stage 0 · UE 开机（3 sub-steps）
- S0.0 Tc 理论黑板 | S0.1 时钟树动画（`replayClockAnim`） | S0.2 先验字典

### Stage 1 · SSB 广播（5 sub-steps）★ 最复杂

**Sub-step 0：理论黑板** `renderS1Discuss()`

**Sub-step 1：SSB Burst 时域** `renderSSBBurst()`
- Case A~E 切换按钮（`switchCase(c)`），更新 `NR_CTX.ssb_case/scs_khz`
- 波束扫描动画：`_doAnimStep()` / `_startAnim()` / `toggleAnim()` / `resetAnim()`
- **重要**：动画在最后一个波束后暂停（`_animPause` 倒计时），模拟 15ms 数据区，`cycleTimer` 显示倒计时
- `onAfterRender` 在 subIdx===1 时触发动画；`onStageExit` 清理 `_animTid`
- 坐标数据：`_computeSSBPos(c)` 返回真实 slot/symbol 位置；`_ssbCenterX(idx)` 算贝塞尔连接点 x

**Sub-step 2：GSCN/k_SSB 频域** `renderFreqCoord()`
- 三段布局：Section A（漏斗）→ Section B（SSB锚点反推 Point A）→ Section C（双网格游标）
- 变量：`_gscn = 7881`（n78 默认），`_kssb = 2`
- 频率公式：`fc = 3000 + (gscn - 7499) × 1.44` MHz
- n78 有效 GSCN 范围：`7708~8054`，滑块范围 `min=7708 max=8054`
- k_SSB 滑块范围 `0~31`（≥24 触发 NSA 协议壁垒警告）
- **⚠️ FR2 / switchFR 未实现**：写入 FR1 固定值
- 联动：`updateFreq(g,k)` → 全量重绘 `renderFreqCoord()`

**Sub-step 3：SSB 时频网格** `renderSSBGrid()`
- **960 个 rect 一次性生成（静态 DOM）**，拖滑块只切 CSS class（60fps）
- `_classRE(sym,sc)` 返回 RE 类型，Symbol 2 严格五段：
  - `[0~47] PBCH` + `[48~55] guard` + `[56~182] SSS` + `[183~191] guard` + `[192~239] PBCH`
- v 值通过 CSS class `v0/v1/v2/v3` 控制 DMRS 高亮（`#ssbSvg.v1 .re-pbch[data-vb="1"]`）
- 遮罩通过 `step0/1/2/3` class 控制（`setPciStep(i)`）
- 右侧放大镜：内联 48 个 `<rect>` + `<text>`，CSS class 控制 D 标签显隐，无 JS DOM 注入
- `updateGrid(n1,n2)` 只更新 CSS class + textContent，不重绘 SVG
- **⚠️ oninput 参数**：必须用 `document.getElementById('n2r').value` 实时取DOM值，不能写死渲染初始值

**Sub-step 4：MIB Polar 编码** `renderMIBPolar()`
- 三层：SSB→PBCH→MIB 关系图 + 装配线进度条 + MIB 23bit X光
- `_mibStep` (0~4) 控制装配线阶段，`_mibScan` (bool) 控制X光模式
- `_runMibAuto()` 自动播放，`advMib(step)` 手动跳转，`toggleMibScan()` 切换X光

### Stage 2 · PSS（2 sub-steps，骨架）
### Stage 3~9 · 骨架（skelStage，各 2 sub-steps）

## 已知待办 / 未实现

| 项目 | 状态 | 位置 |
|------|------|------|
| switchFR（FR2切换） | ❌ 未实现 | stage-1 Sub-step 2 |
| Section B 反推动效 | ❌ 静态 | `renderFreqCoord` secB |
| Stage 2 PSS 相关峰动画 | ❌ 骨架 | stage-2-pss.html |
| Stage 3~9 精细仿真 | ❌ 骨架 | stage-3~9 |
| MIB 字段写入 NR_CTX | ⚠️ 部分 | stage-1 Sub-step 4 |

## 历史踩坑（禁止重犯）

1. `S0 = [...]` 不加 `subSteps` 包装 → 步骤切换全失效
2. SVG `<text>` 内 `&nbsp;` → 渲染为字面量，改用 `&#160;`
3. `max-height` 写死 SVG → 不同子步骤高度不一致
4. `calcFcMhz` 曾用错公式导致 n78 显示 4841MHz → 正确公式：`3000+(gscn-7499)×1.44`
5. GSCN 默认值曾为 8778（FR1 外）→ 已改为 7881（n78 中心）
6. **SVG 的 CSS `transform:translateY` 会盖住上方控件**，使滑块/输入框完全不可交互 → 一律改用 `margin-bottom`（负值）平移
7. **`oninput` 里写死变量初始值**（如 `'+_nid2+'`）→ N_ID¹ 改动后 N_ID² 仍传旧值导致 PCI 算错 → 必须用 `document.getElementById('n2r').value` 实时取 DOM 值

## 交互协议

我发：`目标：stageX Sub-stepN · 改什么`
输出**内容/效果预览**（纯文字），确认后给**精确代码修改位置**（不输出整份文件）。
