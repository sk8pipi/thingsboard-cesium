import assert from 'node:assert/strict';
import * as echarts from 'echarts';
import {
  createNativeWidget,
  validateNativeWidget,
  nativeWidgetCatalog,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { nativeChartOptions } from '../src/views/tb/dashboard/runtime/native/nativeWidgetChartOptions';
import {
  nativeSeriesSettings,
  nativeTimestamp,
  withNativeSettings,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetSettings';
import { nativeTableRows, type NativeSeries } from '../src/views/tb/dashboard/runtime/native/nativeWidgetDataCore';

const widget = createNativeWidget({ fqn: 'time_series_chart' });
widget.config.datasources = [
  {
    type: 'entity',
    entityType: 'DEVICE',
    entityId: 'test',
    dataKeys: [
      {
        name: 'temperature',
        label: 'Temperature',
        type: 'timeseries',
        units: '°C',
        decimals: 1,
        settings: {
          custom: 'preserve',
          native: {
            type: 'bar',
            lineWidth: 0,
            smooth: false,
            area: false,
            axisId: 'right',
            hidden: true,
            showLabel: true,
          },
        },
      },
    ],
  },
];
const native = withNativeSettings(widget.config.native);
native.presentation.showValue = false;
native.chart.animation = false;
native.chart.tooltip = false;
native.chart.dataZoom = true;
native.chart.stack = true;
native.chart.legendPosition = 'bottom';
native.chart.axes.push({ id: 'right', label: '温度', position: 'right', min: 0, max: 80 });
native.chart.thresholds = [{ value: 50, color: '#f00', label: '报警', axisId: 'right' }];
native.table.pageSize = 1;
native.table.sortOrder = 'asc';
(native as any).futureExtension = { zero: 0, enabled: false };
widget.config.native = native;
assert.deepEqual(validateNativeWidget(widget), []);
const serialized = JSON.stringify(widget);
const reopened = createNativeWidget(JSON.parse(serialized));
assert.equal(JSON.stringify(reopened), serialized, '重新编辑保留完整配置、未知字段、false 与 0');
const normalized = withNativeSettings(native);
normalized.chart.axes[0].label = 'other';
assert.equal(native.chart.axes[0].label, '', '默认值归一化不能修改原对象');
const key = widget.config.datasources[0].dataKeys[0];
assert.equal(nativeSeriesSettings(key, native).lineWidth, 0);
const series: NativeSeries[] = [
  {
    id: 'temperature',
    entityId: 'test',
    label: 'Temperature',
    key,
    latest: { ts: 3000, value: 27 },
    points: [
      { ts: 1000, value: 0 },
      { ts: 2000, value: 25 },
    ],
    truncated: false,
  },
];
const chart: any = nativeChartOptions(reopened.config.native, series, { startTs: 0, endTs: 3000 });
assert.equal(chart.series[0].type, 'bar');
assert.equal(chart.series[0].yAxisIndex, 1);
assert.equal(chart.series[0].stack, 'axis-1');
assert.equal(chart.series[0].lineStyle.width, 0);
assert.equal(chart.series[0].label.show, true);
assert.equal(chart.legend.selected.Temperature, false);
assert.equal(chart.legend.bottom, 0);
assert.equal(chart.yAxis[1].min, 0);
assert.equal(chart.yAxis[1].max, 80);
assert.equal(chart.tooltip.show, false);
assert.equal(chart.animation, false);
assert.equal(chart.dataZoom.length, 2);
assert.equal(chart.series[1].markLine.data[0].yAxis, 50);
assert.equal(chart.series[0].data[0].value[1], 0);
assert.equal(chart.series[0].label.formatter({ value: [1000, 0] }), '0.0 °C');
const invalid = createNativeWidget(reopened);
invalid.config.native.chart.axes[1].min = 80;
assert.ok(validateNativeWidget(invalid).some((error) => error.includes('坐标轴')));
invalid.config.native.chart.axes.pop();
assert.ok(validateNativeWidget(invalid).some((error) => error.includes('Y 轴不存在')));
assert.equal(nativeTableRows(series, 1, 1, { sortOrder: 'asc' }).rows[0].ts, 1000);
assert.equal(nativeTableRows(series, 1, 1, { pagination: false }).rows.length, 2);
assert.equal(nativeTableRows(series, 1, 1, { query: '25.0 °C' }).rows[0].ts, 2000);
assert.equal(nativeTableRows(series, 1, 1, { query: 'not found' }).total, 0);
assert.equal(nativeTimestamp(0, 'iso'), '1970-01-01T00:00:00.000Z');
assert.equal(nativeTimestamp(1000, 'relative', 61000), '1 分钟前');
const doughnut = nativeWidgetCatalog.find((entry) => entry.family === 'pie' && entry.preset.innerRadius === 45)!;
assert.ok(doughnut);
const pie = createNativeWidget({ fqn: doughnut.fqn });
pie.config.native.pie.showPercent = true;
const pieOption: any = nativeChartOptions(pie.config.native, series);
assert.equal(pieOption.series[0].radius[0], '45%');
assert.equal(pieOption.series[0].label.formatter({ data: { id: 'temperature' }, percent: 100 }), 'Temperature: 100%');
const horizontal = createNativeWidget({ fqn: 'digital_gauges.digital_bar' });
const vertical = createNativeWidget({ fqn: 'digital_gauges.digital_vertical_bar' });
const arc = createNativeWidget({ fqn: 'digital_gauges.digital_speedometer' });
assert.equal(horizontal.config.native.gauge.type, 'linear');
assert.equal(vertical.config.native.gauge.direction, 'vertical');
assert.equal(arc.config.native.gauge.type, 'arc');
assert.equal(arc.config.native.gauge.showPointer, false);
assert.equal((nativeChartOptions(horizontal.config.native, series) as any).xAxis.type, 'value');
assert.equal((nativeChartOptions(vertical.config.native, series) as any).yAxis.type, 'value');
assert.equal((nativeChartOptions(arc.config.native, series) as any).series[0].startAngle, 180);

// Exercise the actual ECharts option consumer, not just the shape of our builder.
for (const option of [
  chart,
  pieOption,
  nativeChartOptions(horizontal.config.native, series),
  nativeChartOptions(vertical.config.native, series),
  nativeChartOptions(arc.config.native, series),
]) {
  const instance = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width: 600, height: 400 });
  instance.setOption(option);
  assert.ok(instance.renderToSVGString().includes('<svg'));
  instance.dispose();
}
console.log('Native settings round-trip, history/chart/table/gauge effects and ECharts SSR tests passed');
