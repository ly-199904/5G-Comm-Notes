import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(defineConfig({
  title: '5G & Satellite Comms Notes',
  description: 'From 3GPP Protocol to Runnable Waveform · 从协议原文到可运行波形',
  lang: 'zh-CN',

  base: '/5G-Comm-Notes/',

  markdown: {
    math: true,
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'one-dark-pro',
    },
  },

  themeConfig: {
    nav: [
      { text: '首页',    link: '/' },
      { text: 'Phase 0', link: '/phase0/' },
      { text: 'Phase 1', link: '/phase1/' },
      { text: 'Phase 2', link: '/phase2/rach-procedure' },
      { text: 'Phase 3', link: '/phase3/ntn-architecture' },
      { text: '代码库',  link: '/code/numerology-sim' },
    ],

    sidebar: [
      {
        text: '📚 Phase 0 · 先导课程',
        collapsed: false,
        items: [
          { text: '总览',               link: '/phase0/' },
          { text: '通信原理',           link: '/phase0/communication-principles' },
          { text: '无线通信基础',       link: '/phase0/wireless-communications' },
        ],
      },
      {
        text: '🧱 Phase 1 · 基石层',
        collapsed: false,
        items: [
          { text: '总览：端到端信号链路',      link: '/phase1/' },
          { text: 'Numerology + 帧结构',       link: '/phase1/numerology' },
          { text: '资源网格 Resource Grid',    link: '/phase1/resource-grid' },
          { text: '信道映射 Channel Mapping',  link: '/phase1/channel-mapping' },
          { text: 'OFDM 基础',                 link: '/phase1/ofdm-basics' },
        ],
      },
      {
        text: '⚙️ Phase 2 · 骨架层',
        collapsed: true,
        items: [
          { text: 'RACH 随机接入流程',            link: '/phase2/rach-procedure' },
          { text: 'PDCCH & DCI 调度机制',         link: '/phase2/pdcch-dci' },
          { text: 'HARQ 混合自动重传',             link: '/phase2/harq' },
          { text: 'MIMO & Beamforming 基础',      link: '/phase2/mimo-beamforming' },
          { text: 'CSI 框架（RI/PMI/CQI）',       link: '/phase2/csi-framework' },
          { text: 'Beam Management',              link: '/phase2/beam-management' },
        ],
      },
      {
        text: '🛰️ Phase 3 · NTN 前沿',
        collapsed: true,
        items: [
          { text: 'NTN 架构概览',              link: '/phase3/ntn-architecture' },
          { text: 'Timing Advance 大时延补偿',  link: '/phase3/timing-advance' },
          { text: 'Doppler 频移补偿',           link: '/phase3/doppler-compensation' },
          { text: 'Rel-17 NTN 增强特性',        link: '/phase3/rel17-enhancements' },
        ],
      },
      {
        text: '🔗 Phase 3 · 连接管理与移动性',
        collapsed: false,
        items: [
          { text: '3.1 RRC 状态机', link: '/phase3/rrc-state-machine' },
          { text: '3.2 系统消息与寻呼', link: '/phase3/si-paging' },
          { text: '3.3 载波聚合', link: '/phase3/carrier-aggregation' },
        ],
      },
      {
        text: '🐍 仿真代码库',
        collapsed: true,
        items: [
          { text: 'numerology_sim.py',       link: '/code/numerology-sim' },
          { text: 'resource_grid_sim.py',    link: '/code/resource-grid-sim' },
          { text: 'channel_mapping_sim.py',  link: '/code/channel-mapping-sim' },
          { text: 'ofdm_basics_sim.py',      link: '/code/ofdm-basics-sim' },
          { text: 'rach_sim.py',             link: '/code/rach-sim' },
          { text: 'pdcch_sim.py',           link: '/code/pdcch-sim' },
          { text: 'harq_sim.py',            link: '/code/harq-sim' },
          { text: 'mimo_sim.py',            link: '/code/mimo-beamforming-sim' },
          { text: 'csi_sim.py',             link: '/code/csi-framework-sim' },
          { text: 'beam_management_sim.py',  link: '/code/beam-management-sim' },
          { text: 'rrc_state_machine_sim.py', link: '/code/rrc-state-machine-sim' },
          { text: 'si_paging_sim.py', link: '/code/si-paging-sim' },
          { text: 'ca_sim.py', link: '/code/ca-sim' },
        ],
      },
    ],

    search: { provider: 'local' },
    outline: { level: [2, 3] },

    editLink: {
      pattern: 'https://github.com/ly-199904/5G-Comm-Notes/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },

    footer: {
      message: '基于 3GPP Rel-15/16/17 学习记录 | 代码均为 PyTorch 实现',
      copyright: '© 2025 LY',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ly-199904/5G-Comm-Notes' },
    ],
  },
}))