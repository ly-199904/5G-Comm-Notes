import DefaultTheme from 'vitepress/theme'
import { App } from 'vue'
import Term from '../components/Term.vue'
import NumerologySlider from '../components/NumerologySlider.vue'
import ChannelMapExplorer from '../components/ChannelMapExplorer.vue'
import BWPVisualizer from '../components/BWPVisualizer.vue'
import FreqParamTree from '../components/FreqParamTree.vue'
import NTNWindowAnalyzer       from '../components/NTNWindowAnalyzer.vue'
import CollisionProbabilityChart from '../components/CollisionProbabilityChart.vue'
import PRACHResourceMap        from '../components/PRACHResourceMap.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }: { app: App }) {
    app.component('Term', Term)
    app.component('NumerologySlider', NumerologySlider)
    app.component('ChannelMapExplorer', ChannelMapExplorer)
    app.component('BWPVisualizer', BWPVisualizer)
    app.component('FreqParamTree', FreqParamTree)
    app.component('NTNWindowAnalyzer', NTNWindowAnalyzer)
    app.component('CollisionProbabilityChart', CollisionProbabilityChart)
    app.component('PRACHResourceMap', PRACHResourceMap)
  }
}