import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "5G & Satellite Comms Notes",
  description: "Personal Research Notebook(๑•ᴗ•๑)",
  // ── 重要：开启 LaTeX 数学公式支持 ──────────
  markdown: {
    math: true,   // 使用内置 KaTeX 渲染
    lineNumbers: true,
    // 代码块主题（暗色，适合技术博客）
    theme: {
      light: 'github-light',
      dark: 'one-dark-pro'
    }
  },

  // ── 主题配置 ──────────────────────────────
  themeConfig: {
    nav: [
      { text: '🏠 首页',    link: '/' },
      { text: '📡 Phase 1', link: '/phase1/numerology' },
      { text: '🔧 Phase 2', link: '/phase2/rach-procedure' },
      { text: '🛰️ Phase 3', link: '/phase3/ntn-architecture' },
      { text: '🐍 代码库',  link: '/code/frame-structure-sim' },
    ],

    sidebar: [
      {
        text: '🧱 Phase 1 · 基石层',
        collapsed: false,
        items: [
          { text: 'Numerology & SCS',  link: '/phase1/numerology' },
          { text: '帧结构 Frame Structure', link: '/phase1/frame-structure' },
          { text: '资源网格 Resource Grid', link: '/phase1/resource-grid' },
          { text: '信道映射 Channel Mapping', link: '/phase1/channel-mapping' },
          { text: 'OFDM 基础',          link: '/phase1/ofdm-basics' },
        ]
      },
      {
        text: '⚙️ Phase 2 · 骨架层',
        collapsed: true,
        items: [
          { text: 'RACH 接入流程', link: '/phase2/rach-procedure' },
          { text: 'PDCCH & DCI 调度', link: '/phase2/pdcch-dci' },
          { text: 'HARQ 重传机制', link: '/phase2/harq' },
          { text: 'MIMO & Beamforming', link: '/phase2/mimo-beamforming' },
          { text: 'CSI 框架',      link: '/phase2/csi-framework' },
          { text: 'Beam Management', link: '/phase2/beam-management' },
        ]
      },
      {
        text: '🛰️ Phase 3 · NTN 前沿',
        collapsed: true,
        items: [
          { text: 'NTN 架构概览', link: '/phase3/ntn-architecture' },
          { text: 'Timing Advance 大时延补偿', link: '/phase3/timing-advance' },
          { text: 'Doppler 频移补偿', link: '/phase3/doppler-compensation' },
          { text: 'Rel-17 NTN 增强特性', link: '/phase3/rel17-enhancements' },
        ]
      },
      {
        text: '🐍 仿真代码库',
        collapsed: true,
        items: [
          { text: '帧结构可视化',  link: '/code/frame-structure-sim' },
          { text: 'Link Budget 计算器', link: '/code/link-budget-calc' },
          { text: 'OFDM 调制器',  link: '/code/ofdm-modulator' },
        ]
      },
    ],

    // ── 功能增强 ──
    search: { provider: 'local' },   // 本地全文搜索
    outline: { level: [2, 3] },      // 右侧目录显示 H2/H3
    
    editLink: {
      pattern: 'https://github.com/ly-199904/5g-comm-notes/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页'
    },

    footer: {
      message: '基于 3GPP Releases 学习记录',
      copyright: '© 2026 LY'
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ly-199904/5g-comm-notes' }
    ]
  },

  // ── GitHub Pages 部署配置 ──────────────────
  // 如果仓库名是 5g-comm-notes（非 username.github.io），需要设置 base
  base: '/5g-comm-notes/',
})
