import assert from 'node:assert/strict';
import * as echarts from 'echarts';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { createNativeDataClient } from '../src/views/tb/dashboard/runtime/native/nativeWidgetDataCore';
import { nativeChartOptions } from '../src/views/tb/dashboard/runtime/native/nativeWidgetChartOptions';

let historyReads = 0;
const client = createNativeDataClient({
  latest: async () => ({ a: [{ ts: 1000, value: 0 }], b: [{ ts: 1000, value: 12.5 }], c: [{ ts: 1000, value: -2 }] }),
  attributes: async () => [
    { key: 'a', value: 0, lastUpdateTs: 1000 },
    { key: 'b', value: 12.5, lastUpdateTs: 1000 },
  ],
  history: async () => {
    historyReads++;
    return {};
  },
});
const plots: any[] = [];
for (const fqn of ['bars', 'doughnut', 'horizontal_doughnut']) {
  const widget = createNativeWidget({ fqn });
  widget.config.datasources = [
    {
      type: 'entity',
      entityType: 'DEVICE',
      entityId: 'test',
      name: 'Test',
      dataKeys: [
        { name: 'a', type: 'attribute', scope: 'SERVER_SCOPE', label: 'A', units: 'kW', decimals: 1 },
        { name: 'b', type: 'timeseries', label: 'B', units: 'kW', decimals: 1 },
      ],
    },
  ];
  if (fqn === 'bars') {
    widget.config.native.latestBar = { horizontal: true, min: 0, max: 100, barWidth: 23, showAxisLabels: false };
    widget.config.native.showLabel = false;
  } else {
    widget.config.native.pie = {
      ...widget.config.native.pie,
      showTotal: true,
      totalLabel: '总功率',
      totalUnits: 'kW',
      totalDecimals: 1,
    };
  }
  widget.config.native.chart.animation = false;
  widget.config.native.chart.tooltip = false;
  const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
  assert.deepEqual(reopened.config, widget.config);
  assert.deepEqual(validateNativeWidget(reopened), []);
  const snapshot = await client.load(
    { native: reopened.config.native, datasources: reopened.config.datasources as any },
    2000,
  );
  assert.deepEqual(snapshot.errors, []);
  assert.equal(snapshot.series[0].latest?.value, 0);
  const option: any = nativeChartOptions(reopened.config.native, snapshot.series);
  assert.equal(option.tooltip.show, false);
  assert.equal(option.animation, false);
  if (fqn === 'bars') {
    assert.equal(reopened.category, 'latest');
    assert.equal(option.xAxis.type, 'value');
    assert.equal(option.xAxis.min, 0);
    assert.equal(option.xAxis.max, 100);
    assert.equal(option.yAxis.axisLabel.show, false);
    assert.equal(option.series[0].barWidth, 23);
    assert.equal(option.series[0].label.show, false);
    assert.equal(option.series[0].data[0], 0);
    assert.equal(option.series[1].data[1], 12.5);
  } else {
    assert.equal(option.series[0].radius[0], '55%');
    assert.equal(option.series[0].clockwise, false);
    assert.equal(option.title.text, '12.5 kW');
    assert.equal(option.title.subtext, '总功率');
    assert.equal(option.title.textStyle.fontSize, reopened.config.native.fontSize);
    assert.equal(option.textStyle.fontFamily, 'sans-serif');
    assert.equal(
      option.series[0].tooltip.formatter({ data: { id: snapshot.series[0].id }, value: 0, percent: 0 }),
      'Test · A\n0.0 kW',
    );
    const empty: any = nativeChartOptions(
      reopened.config.native,
      snapshot.series.map((entry) => ({ ...entry, latest: null })),
    );
    assert.equal(empty.title.text, '—', '无数据不能伪造合计零值');
    if (fqn === 'horizontal_doughnut') {
      assert.equal(option.legend.right, 0);
      assert.equal(option.series[0].right, '30%');
    } else assert.equal(option.legend.bottom, 0);
  }
  plots.push(option);
}
assert.equal(historyReads, 0, '最新值图表与环图不得查询历史或等待时间窗口');
for (const option of plots) {
  const chart = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width: 600, height: 400 });
  chart.setOption(option);
  const svg = chart.renderToSVGString();
  assert.ok(svg.includes('<path'));
  chart.dispose();
}
console.log('Latest bars / doughnuts: correct reads, zero values, settings round-trip and ECharts rendering passed');
