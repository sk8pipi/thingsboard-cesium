import assert from 'node:assert/strict';
import * as echarts from 'echarts';
import {
  createNativeWidget,
  validateNativeWidget,
  getNativeWidgetSupport,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import {
  createNativeDataClient,
  type NativeHistoryQuery,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetDataCore';
import { nativeChartOptions } from '../src/views/tb/dashboard/runtime/native/nativeWidgetChartOptions';
import {
  nativeStateValue,
  nativeStatePoints,
  nativeStateLabel,
} from '../src/views/tb/dashboard/runtime/native/nativeStateCore';

const widget = createNativeWidget({ fqn: 'state_chart' });
assert.equal(getNativeWidgetSupport({ fqn: 'charts.state_chart' }).supported, true);
widget.config.datasources = [
  { type: 'entity', entityType: 'DEVICE', entityId: 'test', dataKeys: [{ name: 'enabled', type: 'timeseries' }] },
];
widget.config.native.window = {
  realtime: false,
  durationMs: 60000,
  startTs: 1000,
  endTs: 61000,
  intervalMs: 1000,
  aggregation: 'NONE',
};
const settings = widget.config.native.state;
assert.deepEqual(validateNativeWidget(widget), []);
assert.equal(nativeStateValue(false, settings), 0);
assert.equal(nativeStateValue('false', settings), 0);
assert.equal(nativeStateValue('true', settings), 1);
assert.equal(nativeStateValue('unknown', settings), null);
assert.equal(nativeStateValue(null, settings), null);
assert.equal(nativeStateValue('', settings), null);
settings.states.push({ label: 'Running', value: 3.5, sourceType: 'constant', sourceValue: 'run' });
settings.states.push({ label: 'Cold', value: -2, sourceType: 'range', sourceRangeFrom: null, sourceRangeTo: 10 });
settings.states.push({ label: 'Exact', value: 5, sourceType: 'range', sourceRangeFrom: 10, sourceRangeTo: 10 });
assert.equal(nativeStateValue('run', settings), 3.5);
assert.equal(nativeStateValue(0, settings), -2, '数字零不能与布尔 false 混淆');
assert.equal(nativeStateValue(10, settings), 5);
assert.equal(nativeStateValue(11, settings), 11);
settings.states.push({ label: 'Numeric', value: 6, sourceType: 'constant', sourceValue: 11 });
assert.equal(nativeStateValue(11, settings), 6);
assert.equal(nativeStateValue('11', settings), 11, '数字常量不强制匹配字符串');
assert.equal(nativeStateLabel(3.5, settings), 'Running');
const queries: NativeHistoryQuery[] = [];
const client = createNativeDataClient({
  latest: async () => {
    throw Error('状态图不读取当前最新值替代历史');
  },
  attributes: async () => {
    throw Error('状态图不读取属性');
  },
  history: async (query) => {
    queries.push(query);
    return {
      enabled:
        query.limit === 1
          ? [{ ts: 900, value: false }]
          : [
              { ts: 3000, value: true },
              { ts: 5000, value: 'unknown' },
              { ts: 6000, value: 'run' },
            ],
    };
  },
});
const config = { native: widget.config.native, datasources: widget.config.datasources as any };
const data = await client.load(config, 61000);
assert.equal(queries.length, 2);
assert.ok(queries.every((query) => query.agg === 'NONE' && query.useStrictDataTypes === true));
assert.equal(queries.find((query) => query.limit === 1)?.endTs, 999);
assert.equal(data.series[0].error, undefined);
const window = { startTs: 1000, endTs: 61000 };
const points = nativeStatePoints(data.series[0], settings, window);
assert.deepEqual(points, [
  { ts: 1000, value: 0 },
  { ts: 3000, value: 1 },
  { ts: 5000, value: null },
  { ts: 6000, value: 3.5 },
  { ts: 61000, value: 3.5 },
]);
assert.equal(nativeStatePoints({ ...data.series[0], truncated: true }, settings, window)[0].ts, 3000);
assert.deepEqual(nativeStatePoints({ ...data.series[0], historyFailed: true }, settings, window), []);
assert.deepEqual(nativeStatePoints(data.series[0], settings, { startTs: 7000, endTs: 62000 }), [
  { ts: 7000, value: 3.5 },
  { ts: 62000, value: 3.5 },
]);
assert.equal(
  nativeStatePoints(data.series[0], { ...settings, includePrevious: false, extendToEnd: false }, window).length,
  3,
);
const unknownTail = { ...data.series[0], points: [{ ts: 6000, value: 'unknown' }] };
assert.equal(nativeStatePoints(unknownTail, settings, window).at(-1)?.value, null);
const option: any = nativeChartOptions(config.native, data.series, window);
assert.equal(option.series[0].step, 'end');
assert.equal(option.series[0].smooth, false);
assert.equal(option.series[0].stack, undefined);
assert.equal(option.series[0].connectNulls, false);
assert.equal(option.series[0].tooltip.valueFormatter(3.5), 'Running');
assert.equal(option.series[0].label.formatter({ value: [6000, 3.5] }), 'Running');
assert.ok(option.series[1].markLine.data.some((line: any) => line.yAxis === 3.5));
assert.ok(option.yAxis[0].min < -2 && option.yAxis[0].max > 6);
const chart = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width: 800, height: 400 });
chart.setOption(option);
assert.match(chart.renderToSVGString(), /Running/);
chart.dispose();
settings.includePrevious = false;
settings.extendToEnd = false;
const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
assert.deepEqual(reopened.config, widget.config);
assert.deepEqual(validateNativeWidget(reopened), []);
queries.length = 0;
await client.load(config, 61000);
assert.equal(queries.length, 1, '关闭窗口前状态后不得发出多余查询');
settings.states[0].value = null;
assert.ok(validateNativeWidget(widget).some((message) => message.includes('状态映射')));
const failed = createNativeDataClient({
  latest: async () => ({}),
  attributes: async () => [],
  history: async (query) => {
    if (query.limit !== 1) throw Error('history unavailable');
    return { enabled: [{ ts: 900, value: true }] };
  },
});
const errorData = await failed.load({ ...config, native: reopened.config.native }, 61000);
assert.equal(errorData.series[0].historyFailed, true);
assert.deepEqual(nativeStatePoints(errorData.series[0], reopened.config.native.state, window), []);
console.log(
  'Native state chart: strict mapping, previous state, gaps, truncation, rolling endpoints, SSR and settings round-trip passed',
);
