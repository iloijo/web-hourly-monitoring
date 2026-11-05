// Tree-shaken ECharts: only the chart types and components this dashboard uses.
// Add a module here when a chart starts using a new series type or component.
import ReactEChartsCore from 'echarts-for-react/esm/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GraphicComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent,
  TitleComponent, TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  MarkLineComponent, MarkAreaComponent, GraphicComponent, CanvasRenderer,
]);

export default function ReactECharts(props) {
  return <ReactEChartsCore echarts={echarts} {...props} />;
}
