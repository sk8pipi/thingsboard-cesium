import assert from 'node:assert/strict';
import * as echarts from 'echarts';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { createNativeDataClient } from '../src/views/tb/dashboard/runtime/native/nativeWidgetDataCore';
import { nativeChartOptions } from '../src/views/tb/dashboard/runtime/native/nativeWidgetChartOptions';

const widget = createNativeWidget({ fqn: 'range_chart' });
widget.config.datasources = [
  {
    type: 'entity',
    entityType: 'DEVICE',
    entityId: 'test',
    dataKeys: [{ name: 'temperature', type: 'timeseries', units: '°C', decimals: 0 }],
  },
];
widget.config.native.window = {
  realtime: false,
  startTs: 0,
  endTs: 60000,
  intervalMs: 1000,
  durationMs: 60000,
  aggregation: 'NONE',
};
widget.config.native.range.fillOpacity = 0;
widget.config.native.range.outOfRangeColor = '#123456';
const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
assert.deepEqual(reopened.config, widget.config);
assert.deepEqual(validateNativeWidget(reopened), []);
let query: any;
const client = createNativeDataClient({
  latest: async () => {
    throw new Error('范围图不得读取最新值替代历史');
  },
  attributes: async () => {
    throw new Error('范围图不得读取属性');
  },
  history: async (params) => {
    query = params;
    return {
      temperature: [
        { ts: 1, value: -30 },
        { ts: 10000, value: 0 },
        { ts: 30000, value: 45 },
      ],
    };
  },
});
const snapshot = await client.load(
  { native: reopened.config.native, datasources: reopened.config.datasources as any },
  60000,
);
assert.deepEqual(snapshot.errors, []);
assert.equal(snapshot.series[0].error, undefined);
assert.ok(query);
assert.equal(query.startTs, 0);
assert.equal(query.endTs, 60000);
assert.equal(query.agg, 'NONE');
const option: any = nativeChartOptions(reopened.config.native, snapshot.series, { startTs: 0, endTs: 60000 });
assert.equal(option.xAxis.min, 0);
assert.equal(option.xAxis.max, 60000);
assert.equal(option.series[0].type, 'line');
assert.equal(option.series[0].areaStyle.opacity, 0);
assert.ok(option.series.some((series: any) => series.markLine?.data.some((line: any) => line.yAxis === 0)));
assert.equal(option.visualMap[0].pieces.length, 7);
assert.equal(option.visualMap[0].outOfRange.color, '#123456');
assert.deepEqual(
  option.series[0].data.map((item: any) => item.value[1]),
  [-30, 0, 45],
);
reopened.config.native.range.showBoundaries = false;
const withoutBounds: any = nativeChartOptions(reopened.config.native, snapshot.series);
assert.equal(withoutBounds.series.length, 1);
const chart = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width: 600, height: 400 });
chart.setOption(option);
assert.match(chart.renderToSVGString(), /<path/);
chart.dispose();
reopened.config.datasources[0].dataKeys![0].type = 'attribute';
assert.ok(validateNativeWidget(reopened).includes('历史部件仅支持遥测字段'));
console.log(
  'Native range chart: historical reads, color ranges, boundaries, zero values and settings round-trip passed',
);
