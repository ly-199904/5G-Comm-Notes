# CLAUDE.md — 5G-Comm-Notes

## 项目概述

个人 5G NR / NTN（星地融合通信）学习笔记库，目标是从"协议+代码+仿真"三个维度建立通信系统工程能力。

- **仓库**: github.com/ly-199904/5G-Comm-Notes
- **在线站点**: VitePress 构建，GitHub Pages 部署（base: `/5G-Comm-Notes/`）
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
│   ├── phase3/                    # 连接管理：RRC状态机 / SI寻呼 / CA / DC / 切换 / NTN增强
│   └── code/                      # 仿真说明文档（每篇对应一个 .py）
├── simulation/
│   ├── phase1/                    # Phase 1 仿真脚本 + 输出图片
│   ├── phase2/                    # Phase 2 仿真脚本 + 输出图片
│   ├── phase3/                    # Phase 3 仿真脚本 + 输出图片
│   └── requirements.txt
└── package.json                   # VitePress + Mermaid 插件
```

## VitePress 文档站点

### 知识体系

| Phase | 主题 | 状态 |
|-------|------|------|
| Phase 0 | 通信原理、无线通信基础 | ✅ 完成 |
| Phase 1 | Numerology、Resource Grid、Channel Mapping、OFDM | ✅ 完成 |
| Phase 2 | RACH ✅、PDCCH ✅、HARQ ✅、MIMO ✅、CSI ✅、Beam Mgmt ✅ | ✅ 全部完成 |
| Phase 3 | RRC 状态机、SI/Paging、CA、NTN 增强（3.1~3.3 ✅，3.4~3.6 🔜） | 🔄 进行中 |

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

## 当前状态（2026-06-22）

- **笔记库**：Phase 0~2 共 12 篇笔记 + 仿真 + 29 个 Vue 组件已完成
- **Phase 3 连接管理**：3.1 RRC 状态机 ✅、3.2 SI/Paging ✅、3.3 CA ✅，3.4~3.6 待开发
- **NTN 增强**：架构/TA/Doppler/Rel-17 文档骨架就绪，深度推导待补

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
- 多步任务先列清单，逐条验证后勾掉