import assert from 'node:assert/strict';
import {
  aggregateComparedValue,
  aggregateComparisonWindow,
  loadNativeAggregateSlots,
} from '../src/views/tb/dashboard/runtime/native/nativeAggregateCore';
import {
  createNativeDataClient,
  nativeWindow,
  createNativePoller,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetDataCore';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import type { NativeAggregateSlot, NativeSource } from '../src/views/tb/dashboard/runtime/native/nativeWidgetTypes';

const source: NativeSource = {
  type: 'entity',
  entityType: 'DEVICE',
  entityId: 'test',
  name: '设备',
  dataKeys: [{ name: 'temperature', type: 'timeseries' }],
};
const slot: NativeAggregateSlot = {
  id: 'delta',
  position: 'rightBottom',
  label: '',
  aggregationType: 'AVG',
  comparisonEnabled: true,
  timeForComparison: 'previousInterval',
  comparisonCustomIntervalValue: 60000,
  comparisonResultType: 'DELTA_ABSOLUTE',
  units: '°C',
  decimals: 1,
  showArrow: false,
  fontSize: 16,
  color: '#ffffff',
};
const window = { startTs: 60000, endTs: 120000 };
const reads: any[] = [];
const api = {
  latest: async () => ({ temperature: [{ ts: 999999, value: 0 }] }),
  history: async (query: any) => {
    reads.push(query);
    return { temperature: [{ ts: query.startTs + 1, value: query.startTs === 60000 ? 5 : 2 }] };
  },
};
const slots = [
  slot,
  { ...slot, id: 'percent', position: 'rightTop' as const, comparisonResultType: 'DELTA_PERCENT' as const, units: '%' },
  { ...slot, id: 'now', position: 'center' as const, aggregationType: 'NONE' as const, comparisonEnabled: false },
];
const result = await loadNativeAggregateSlots(source, slots, window, false, api);
assert.deepEqual(
  result.map((item) => item.value),
  [3, 150, 0],
);
assert.equal(result[0].timestamp, 1, '比较结果使用上一窗时间戳');
assert.equal(result[2].timestamp, 999999, 'NONE 最新值不裁剪到历史窗');
assert.equal(reads.length, 2, '相同当前/上一聚合请求去重');
assert.ok(reads.every((query) => query.agg === 'AVG' && query.interval === 60000 && query.limit === 1));
assert.equal(aggregateComparedValue(0, 0, 'DELTA_PERCENT'), 100);
assert.equal(aggregateComparedValue(5, 0, 'DELTA_PERCENT'), 100);
assert.equal(aggregateComparedValue(-4, -2, 'DELTA_PERCENT'), 100);
assert.equal(aggregateComparedValue(null, 2, 'DELTA_ABSOLUTE'), null);
assert.equal(aggregateComparedValue('', 2, 'DELTA_PERCENT'), null);
assert.equal(aggregateComparedValue(2, 'offline', 'DELTA_PERCENT'), null);
assert.equal(aggregateComparedValue(null, 2, 'PREVIOUS_VALUE'), 2);
const previousOnly = await loadNativeAggregateSlots(
  source,
  [{ ...slot, comparisonResultType: 'PREVIOUS_VALUE' }],
  window,
  false,
  {
    ...api,
    history: async (query) => {
      if (query.startTs === 60000) throw new Error('current unavailable');
      return api.history(query);
    },
  },
);
assert.equal(previousOnly[0].value, 2);
const partial = await loadNativeAggregateSlots(source, slots, window, false, {
  ...api,
  history: async (query) => {
    if (query.startTs === 0) throw new Error('previous unavailable');
    return api.history(query);
  },
});
assert.equal(partial[0].value, null);
assert.match(partial[0].error!, /比较值读取失败/);
assert.equal(partial[2].value, 0, '比较失败不能污染最新值位置');
const realtime = await loadNativeAggregateSlots(source, slots, window, true, api);
assert.match(realtime[0].error!, /实时浮动/);
assert.equal(realtime[2].value, 0);
assert.deepEqual(aggregateComparisonWindow(window, slot), { startTs: 0, endTs: 60000 });
assert.deepEqual(
  aggregateComparisonWindow(window, {
    ...slot,
    timeForComparison: 'customInterval',
    comparisonCustomIntervalValue: 50000,
  }),
  { startTs: 10000, endTs: 70000 },
);
const march = { startTs: Date.UTC(2024, 2, 1), endTs: Date.UTC(2024, 2, 31, 12) };
const february = aggregateComparisonWindow(march, { ...slot, timeForComparison: 'month' });
assert.deepEqual(february, { startTs: Date.UTC(2024, 1, 1), endTs: Date.UTC(2024, 1, 29, 12) });
assert.equal(
  aggregateComparisonWindow(
    { startTs: Date.UTC(2024, 1, 1), endTs: Date.UTC(2024, 1, 29, 12) },
    { ...slot, timeForComparison: 'year' },
  ).endTs,
  Date.UTC(2023, 1, 28, 12),
);
assert.throws(() =>
  aggregateComparisonWindow(window, {
    ...slot,
    timeForComparison: 'customInterval',
    comparisonCustomIntervalValue: -1,
  }),
);

const widget = createNativeWidget({ fqn: 'cards.aggregated_value_card' });
widget.config.datasources = [source];
assert.equal(widget.config.native.window.calendar, 'month');
const current = Date.UTC(2024, 1, 29, 12);
assert.deepEqual(nativeWindow(widget.config.native, current), { startTs: Date.UTC(2024, 1, 1), endTs: current });
widget.config.native.window.calendar = 'week';
assert.equal(nativeWindow(widget.config.native, Date.UTC(2026, 8, 27, 12)).startTs, Date.UTC(2026, 8, 21));
widget.config.native.window.calendar = 'day';
assert.equal(nativeWindow(widget.config.native, current).startTs, Date.UTC(2024, 1, 29));
assert.equal(nativeWindow(widget.config.native, Date.UTC(2024, 1, 29)).endTs, Date.UTC(2024, 1, 29) + 1);
const scheduled: (() => void)[] = [];
const poller = createNativePoller(
  async () => ({ series: [], errors: [], updatedAt: current, loading: false }),
  () => {},
  (callback) => {
    scheduled.push(callback);
    return callback;
  },
  () => {},
);
poller.update({ native: { ...widget.config.native, family: 'range' }, datasources: [source] });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(scheduled.length, 1, '日历历史窗口继续轮询');
poller.stop();

widget.config.native.window = {
  ...widget.config.native.window,
  ...window,
  intervalMs: 1000,
  realtime: false,
};
delete widget.config.native.window.calendar;
widget.config.native.aggregate.slots = slots;
const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
assert.deepEqual(reopened.config, widget.config);
assert.deepEqual(validateNativeWidget(reopened), []);
let chartReads = 0;
const client = createNativeDataClient({
  ...api,
  attributes: async () => [],
  history: async (query) => {
    if (query.interval === 1000) {
      chartReads++;
      return { temperature: Array.from({ length: 2001 }, (_, index) => ({ ts: 60001 + index, value: 999 })) };
    }
    return api.history(query);
  },
});
const snapshot = await client.load({ native: widget.config.native, datasources: [source] });
assert.equal(snapshot.series[0].truncated, true);
assert.equal(snapshot.aggregate![0].value, 3, '截断图线不参与整窗聚合');
assert.equal(chartReads, 1);
widget.config.native.aggregate.showChart = false;
const withoutChart = await client.load({ native: widget.config.native, datasources: [source] });
assert.equal(chartReads, 1, '关闭曲线后不读取图线历史');
assert.equal(withoutChart.aggregate![0].value, 3);
widget.config.native.window.realtime = true;
assert.ok(validateNativeWidget(widget).some((error) => error.includes('实时浮动')));
console.log(
  'Native aggregate: independent full-window reads, comparisons, UTC calendar offsets, failures, deduplication and round-trip passed',
);
