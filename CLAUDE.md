# CLAUDE.md — 5G-Comm-Notes

## 项目概述

个人 5G NR / NTN（星地融合通信）学习笔记库，目标是从"协议+代码+仿真+交互式学习台"四个维度建立通信系统工程能力。

- **仓库**: github.com/ly-199904/5G-Comm-Notes
- **在线站点**: VitePress 构建，GitHub Pages 部署（base: `/5G-Comm-Notes/`）
- **交互式仿真**: 两个独立学习台子项目（`5g-sim-labs/`），纯静态 HTML/JS/SVG，无需构建工具
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
│   ├── index.md                   # 首页
│   ├── phase0/                    # 先导：通信原理 / 无线通信基础
│   ├── phase1/                    # 基石：Numerology / 资源网格 / 信道映射 / OFDM
│   ├── phase2/                    # 骨架：RACH / PDCCH / HARQ / MIMO / CSI / Beam Mgmt / SIB1
│   ├── phase3/                    # NTN 前沿：架构 / TA / Doppler / Rel-17 增强
│   └── code/                      # 仿真说明文档（每篇对应一个 .py）
├── simulation/
│   ├── phase1/                    # Phase 1 仿真脚本 + 输出图片
│   ├── phase2/                    # Phase 2 仿真脚本 + 输出图片
│   └── requirements.txt
├── 5g-sim-labs/                   # ★ 交互式仿真学习台
│   ├── initial-access-v2/         # 1.0：5G NR 空口接入（Stage 0~8，全部完成）
│   └── nas-pdu-session-v1/        # 2.0：NAS 注册 & PDU 会话（Stage 0 完成，1~6 骨架）
└── package.json                   # VitePress + Mermaid 插件
```

## 交互式仿真学习台（5g-sim-labs/）

### 1.0 — initial-access-v2：空口接入完整流程（Stage 0~8 ✅ 全部完成）

9 Stage 覆盖 UE 上电 → RRC_CONNECTED 全过程：

| Stage | 主题 | 核心教学点 |
|-------|------|-----------|
| 0 | UE 开机 | Tc 时钟基准、先验字典 |
| 1 | gNB SSB 广播 | Numerology / SSB Burst / GSCN / 时频网格 / MIB Polar 编码 |
| 2 | PSS 检测 | m-序列 / 零填充过采样 / 盲相关捞针 / 频偏估计 |
| 3 | SSS 检测 | 双 m-序列相乘 / N_ID¹ 解出 / PCI 合成 |
| 4 | PBCH 译码 & MIB | DMRS 信道估计+插值 / 两层解扰(夹心+自举) / Polar SCL / MIB 解析+SFN 拼接 |
| 5 | CORESET#0 盲检 | pdcch-ConfigSIB1 查表 / 时频反推 / PDCCH 盲检 / DCI 1_0 |
| 6 | SIB1 解析 | PDSCH 调度 / ASN.1 解码 / RACH 配置 + 小区驻留判决 |
| 7 | PRACH 随机接入 | Preamble / RA-RNTI / Msg1~2 / RAR + TA |
| 8 | RRC 建立 | SRB0 / Msg3~4 / 竞争解决 / 安全激活 |

**核心架构**：纯静态 HTML/JS/SVG。Engine 状态机 + NR_CTX 全局上下文总线 + `{ subSteps:[...] }` 数据结构。详细文档见 [5g-sim-labs/initial-access-v2/CLAUDE.md](5g-sim-labs/initial-access-v2/CLAUDE.md)。

### 2.0 — nas-pdu-session-v1：NAS 注册 & PDU 会话（Stage 0 ✅，1~6 🔧）

承接 1.0 终点（RRC_CONNECTED），讲完核心网注册与用户面建立：

| Stage | 主题 | 状态 |
|-------|------|------|
| 0 | 5GC 架构与 SBA（AMF/SMF/UPF/AUSF/UDM + 服务化总线） | ✅ 完成 |
| 1 | NAS 上行接管（Registration Request → AMF，SUCI 隐藏 SUPI） | 🔧 骨架 |
| 2 | 5G-AKA 鉴权（密钥树 K→K_AUSF→K_SEAF→K_AMF→K_gNB） | 🔧 骨架 |
| 3 | NAS 安全激活（NAS SMC/SMP，双层安全） | 🔧 骨架 |
| 4 | 注册完成 / GUTI 分配 | 🔧 骨架 |
| 5 | PDU 会话建立（SMF/UPF/N4/PFCP） | 🔧 骨架 |
| 6 | QoS 与 DRB 落地（5QI/QFI/SDAP/首个 IP 包） | 🔧 骨架 |

**边界**：N6 接口是物理世界尽头，PCF/CHF 隐身，多切片仅提 S-NSSAI。详细文档见 [5g-sim-labs/nas-pdu-session-v1/CLAUDE.md](5g-sim-labs/nas-pdu-session-v1/CLAUDE.md)。

### 通用架构规则（两个子项目共用）

- **数据**：`{ subSteps: [...] }` 包裹，禁止裸数组
- **总线**：`Engine.ctxSet(key, val)` 写入 NR_CTX（2.0 新增 `nas.*` 命名空间）
- **Hooks**：`renderVizSVG` / `onAfterRender` / `onStageExit` / `Engine.boot({ stageIdx: N })`
- **SVG**：`viewBox="0 0 720 495"` + `width="100%" height="100%" style="display:block;"`
- **颜色**：每屏五角色（主色/答案绿 #059669/对照灰 #94a3b8/高光红 #dc2626/底层渐变）
- **动画**：静态 DOM + 改属性，定时器经 `Engine.addTimer()` 注册

## VitePress 文档站点

### 知识体系

| Phase | 主题 | 状态 |
|-------|------|------|
| Phase 0 | 通信原理、无线通信基础 | ✅ 完成 |
| Phase 1 | Numerology、Resource Grid、Channel Mapping、OFDM | ✅ 完成 |
| Phase 2 | RACH ✅、PDCCH ✅、HARQ ✅、MIMO ✅、CSI ✅、Beam Mgmt ✅ | ✅ 全部完成 |
| Phase 3 | NTN 架构、TA、Doppler、Rel-17 增强 | ⬜ 待开始 |

### 笔记输出规范（7 项）

每新增一个知识点产出三个文件：
1. **理论笔记**（`docs/phase{n}/{topic}.md`）：版本定锚 + 深度推导（KaTeX）+ 故障排查表 + 自测题
2. **仿真代码**（`simulation/phase{n}/{topic}_sim.py`）：NumPy/Matplotlib，暗色主题，模块化
3. **代码说明文档**（`docs/code/{topic}-sim.md`）：数学-代码对照（≥3组）+ 参数说明表 + 协议溯源

### 技术约定

- **KaTeX**: 行内 `$...$`，块级 `$$...$$`（VitePress `markdown.math: true`）
- **Mermaid**: `vitepress-plugin-mermaid`，`` ```mermaid `` 代码块
- **Vue 组件**: `.vitepress/components/` 下 PascalCase 命名，自动全局注册
- **部署**: `npm run docs:build` → 推送 `gh-pages`

## 当前状态（2026-06-01）

- **学习台 1.0**：Stage 0~8 全部完成（空口接入主线收官）
- **学习台 2.0**：Stage 0 完成（5GC 架构与 SBA），Stage 1~6 骨架待开发
- **笔记库**：Phase 0~2 共 14 篇笔记 + 仿真 + 26 个 Vue 组件已完成
- **Phase 3 NTN**：待开始

## 编码行为准则

### 1. 先想清楚再动手
- 遇到模糊需求先列假设和多解，不默默选一种
- 有更简单路径直接提；不确定时停下来说清困惑点

### 2. 只写必要的代码
- 不加"以备将来"的功能和配置项
- 不为单次使用建抽象层；仿真允许教学性冗长，但同一逻辑不重复三遍

### 3. 精准改动，不动无关代码
- 只改任务范围内的文件和行；孤立 import/变量顺手清理
- 不重构没坏的东西，不替用户决定什么该清理

### 4. 以可验证目标驱动
- 改笔记 → `npm run docs:dev` 验证 KaTeX/Mermaid
- 改仿真 → `python xxx_sim.py` 验证图片生成
- 改学习台 → 浏览器打开对应 stage HTML，逐子步验证
- 多步任务先列清单，逐条验证后勾掉