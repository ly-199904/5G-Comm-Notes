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
import DCIFieldParser       from '../components/DCIFieldParser.vue'
import BlindDecodingVisualizer from '../components/BlindDecodingVisualizer.vue'
import CORESETConfigurator        from '../components/CORESETConfigurator.vue'
import HARQProcessVisualizer from '../components/HARQProcessVisualizer.vue'
import CircularBufferVisualizer  from '../components/CircularBufferVisualizer.vue'
import HARQNTNCalculator         from '../components/HARQNTNCalculator.vue'
import PAPRComparisonChart       from '../components/PAPRComparisonChart.vue'
import OFDMModulationExplainer   from '../components/OFDMModulationExplainer.vue'
import MIMOSignalChain           from '../components/MIMOSignalChain.vue'
import CSIReportVisualizer       from '../components/CSIReportVisualizer.vue'
import InitialAccessFlow          from '../components/InitialAccessFlow.vue'
import BeamPatternVisualizer      from '../components/BeamPatternVisualizer.vue'
import SVDChannelAnalyzer         from '../components/SVDChannelAnalyzer.vue'
import DMRSPortMapper             from '../components/DMRSPortMapper.vue'
import CSIReportTimeline          from '../components/CSIReportTimeline.vue'
import CQITableExplorer           from '../components/CQITableExplorer.vue'
import TypeICodebookBrowser       from '../components/TypeICodebookBrowser.vue'
import BeamManagementFlow          from '../components/BeamManagementFlow.vue'
import RRCStateMachine             from '../components/RRCStateMachine.vue'
import PagingOccasionCalc          from '../components/PagingOccasionCalc.vue'
import CarrierAggregationCalc      from '../components/CarrierAggregationCalc.vue'

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
    app.component('DCIFieldParser', DCIFieldParser)
    app.component('BlindDecodingVisualizer', BlindDecodingVisualizer)
    app.component('CORESETConfigurator', CORESETConfigurator)
    app.component('HARQProcessVisualizer', HARQProcessVisualizer)
    app.component('CircularBufferVisualizer',  CircularBufferVisualizer)
    app.component('HARQNTNCalculator',         HARQNTNCalculator)
    app.component('PAPRComparisonChart',       PAPRComparisonChart)
    app.component('OFDMModulationExplainer',   OFDMModulationExplainer)
    app.component('MIMOSignalChain',           MIMOSignalChain)
    app.component('CSIReportVisualizer',       CSIReportVisualizer)
    app.component('InitialAccessFlow',         InitialAccessFlow)
    app.component('BeamPatternVisualizer',     BeamPatternVisualizer)
    app.component('SVDChannelAnalyzer',        SVDChannelAnalyzer)
    app.component('DMRSPortMapper',            DMRSPortMapper)
    app.component('CSIReportTimeline',         CSIReportTimeline)
    app.component('CQITableExplorer',          CQITableExplorer)
    app.component('TypeICodebookBrowser',      TypeICodebookBrowser)
    app.component('BeamManagementFlow',         BeamManagementFlow)
    app.component('RRCStateMachine',            RRCStateMachine)
    app.component('PagingOccasionCalc',         PagingOccasionCalc)
    app.component('CarrierAggregationCalc',     CarrierAggregationCalc)
  }
}