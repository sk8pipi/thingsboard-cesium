import assert from 'node:assert/strict';
import * as echarts from 'echarts';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { createNativeDataClient } from '../src/views/tb/dashboard/runtime/native/nativeWidgetDataCore';
import { nativeChartOptions } from '../src/views/tb/dashboard/runtime/native/nativeWidgetChartOptions';

let historicalReads = 0;
const client = createNativeDataClient({
  latest: async () => ({ a: [{ ts: 1, value: 0 }], b: [{ ts: 1, value: -5 }], c: [{ ts: 1, value: 20 }] }),
  attributes: async () => [{ key: 'd', value: 12, lastUpdateTs: 1 }],
  history: async () => {
    historicalReads++;
    return {};
  },
});
for (const fqn of ['radar', 'polar_area']) {
  const widget = createNativeWidget({ fqn });
  widget.config.datasources = [
    {
      type: 'entity',
      entityType: 'DEVICE',
      entityId: 'test',
      name: '设备',
      dataKeys: [
        ...['a', 'b', 'c', 'missing'].map((name) => ({
          name,
          label: name,
          type: 'timeseries' as const,
          units: 'kW',
          decimals: 1,
        })),
        { name: 'd', label: 'd', type: 'attribute', scope: 'SERVER_SCOPE', units: 'kW', decimals: 1 },
      ],
    },
  ];
  Object.assign(widget.config.native.radial, {
    min: -10,
    max: 30,
    startAngle: 45,
    splitNumber: 4,
    normalizeAxes: true,
    shape: 'circle',
    showTickLabels: true,
    showAxisLabels: false,
    lineWidth: 0,
    showPoints: false,
    fillArea: true,
    areaOpacity: 0,
    barWidth: 60,
  });
  const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
  assert.deepEqual(reopened.config, widget.config);
  assert.deepEqual(validateNativeWidget(reopened), []);
  const data = await client.load(
    { native: reopened.config.native, datasources: reopened.config.datasources as any },
    10,
  );
  assert.equal(data.series[0].latest?.value, 0);
  const option: any = nativeChartOptions(reopened.config.native, data.series);
  if (fqn === 'radar') {
    assert.deepEqual(option.series[0].data[0].value, [0, -5, 20, 12], '缺失数值不能伪造为零');
    assert.equal(option.radar.shape, 'circle');
    assert.equal(option.radar.indicator[0].min, -10);
    assert.equal(option.radar.indicator[0].max, 30);
    assert.equal(option.radar.axisName.show, false);
    assert.equal(option.series[0].symbol, 'none');
    assert.equal(option.series[0].lineStyle.width, 0);
    assert.equal(option.series[0].areaStyle.opacity, 0);
    assert.match(option.series[0].tooltip.formatter(), /a: 0.0 kW/);
    const empty: any = nativeChartOptions(
      reopened.config.native,
      data.series.map((entry) => ({ ...entry, latest: null })),
    );
    assert.deepEqual(empty.series[0].data, []);
  } else {
    assert.equal(option.angleAxis.startAngle, 45);
    assert.equal(option.radiusAxis.min, -10);
    assert.equal(option.radiusAxis.max, 30);
    assert.equal(option.series[0].coordinateSystem, 'polar', '极区图必须使用极坐标柱，不能替换成玫瑰饼图');
    assert.equal(option.series[0].barWidth, '60%');
    assert.equal(option.series[1].data[1], -5);
    assert.equal(option.series[3].data[3], null);
    assert.equal(option.series[0].label.formatter({ value: 0 }), '0.0 kW');
  }
  const chart = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width: 600, height: 400 });
  chart.setOption(option);
  assert.match(chart.renderToSVGString(), /<path/);
  chart.dispose();
  reopened.config.native.radial.max = -20;
  assert.ok(validateNativeWidget(reopened).some((error) => error.includes('雷达图或极区图')));
}
assert.equal(historicalReads, 0);
console.log('Native radar / polar: data semantics, configuration round-trip, validation and ECharts rendering passed');
