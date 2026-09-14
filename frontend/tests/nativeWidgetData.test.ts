import assert from 'node:assert/strict';
import {
  createNativeDataClient,
  createNativePoller,
  nativeTableRows,
  nativeNumber,
  nativeThresholdColor,
  formatNativeValue,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetDataCore';
import {
  createNativeWidget,
  getNativeWidgetSupport,
  nativeWidgetCatalog,
  validateNativeWidget,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import type { NativeDataConfig, NativeSnapshot } from '../src/views/tb/dashboard/runtime/native/nativeWidgetDataCore';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { importThingsboardJson } from '../src/views/tb/map/widgetLibrary/importThingsboardWidget';

async function main() {
  assert.equal(nativeWidgetCatalog.length, 521);
  let count = 0;
  for (const file of readdirSync('../backend/application/src/main/data/json/system/widget_types')) {
    const raw = JSON.parse(
      readFileSync(resolve('../backend/application/src/main/data/json/system/widget_types', file), 'utf8'),
    );
    const support = getNativeWidgetSupport(raw);
    if (support.supported) {
      count++;
      assert.equal(createNativeWidget(raw).config.native.fqn, raw.fqn);
      const configured = createNativeWidget(raw);
      configured.config.datasources = [
        { type: 'entity', entityType: 'DEVICE', entityId: 'test', dataKeys: [{ name: 'test', type: 'timeseries' }] },
      ];
      assert.deepEqual(validateNativeWidget(configured), [], raw.fqn + ' 默认配置可用');
    }
  }
  assert.equal(count, 292);
  const source = JSON.parse(
    readFileSync('../backend/application/src/main/data/json/system/widget_types/temperature_card.json', 'utf8'),
  );
  assert.equal(
    getNativeWidgetSupport({ ...source, descriptor: { ...source.descriptor, controllerScript: 'modified' } }).supported,
    false,
  );
  assert.equal(getNativeWidgetSupport({ fqn: 'unknown_temperature_card' }).supported, false);
  assert.equal(getNativeWidgetSupport({ fqn: 'state_chart' }).supported, false);
  assert.equal(getNativeWidgetSupport({ fqn: 'temperature_chart_card' }).supported, false);
  const imported = importThingsboardJson({ widgetTypes: [source, { fqn: 'custom', name: 'Custom', descriptor: {} }] });
  assert.equal(imported.length, 2);
  assert.equal(imported[1].kind, 'unknown');
  assert.deepEqual(imported[1].raw, { fqn: 'custom', name: 'Custom', descriptor: {} });
  const widget = createNativeWidget(source);
  const other = createNativeWidget(source);
  const originalColor = other.config.native.thresholds[0].color;
  widget.config.native.thresholds[0].color = '#000000';
  assert.equal(other.config.native.thresholds[0].color, originalColor);
  assert.equal(createNativeWidget(source).config.native.thresholds[0].color, originalColor);
  assert.equal(
    nativeThresholdColor(0, {
      ...widget.config.native,
      thresholds: [
        { from: 0, to: 0, color: 'green' },
        { from: 0, to: 10, color: 'blue' },
      ],
    }),
    'green',
  );
  assert.equal(
    nativeThresholdColor(1, {
      ...widget.config.native,
      thresholds: [
        { from: 0, to: 0, color: 'green' },
        { from: 0, to: 10, color: 'blue' },
      ],
    }),
    'blue',
  );
  assert.equal(widget.config.datasources?.length, 0);
  assert.ok(validateNativeWidget(widget).length > 0);
  widget.config.datasources = [
    {
      type: 'entity',
      entityType: 'DEVICE',
      entityId: 'a',
      name: 'A',
      dataKeys: [{ name: 'temperature', type: 'timeseries', decimals: 1 }],
    },
  ];
  assert.deepEqual(validateNativeWidget(widget), []);
  assert.equal(widget.config.native.rawSource.descriptor.defaultConfig, source.descriptor.defaultConfig);
  const config: NativeDataConfig = {
    native: {
      ...widget.config.native,
      family: 'timeseries',
      window: { realtime: false, startTs: 1000, endTs: 5000, durationMs: 4000, intervalMs: 1000, aggregation: 'AVG' },
    },
    datasources: [
      {
        type: 'entity',
        entityType: 'DEVICE',
        entityId: 'a',
        name: 'A',
        dataKeys: [{ name: 'temperature', type: 'timeseries' }],
      },
      {
        type: 'entity',
        entityType: 'DEVICE',
        entityId: 'b',
        name: 'B',
        dataKeys: [
          { name: 'temperature', type: 'timeseries' },
          { name: 'enabled', type: 'attribute', scope: 'SHARED_SCOPE' },
        ],
      },
    ],
  };
  const queries: any[] = [];
  let seenScope = '';
  const client = createNativeDataClient({
    latest: async (ds) => ({ temperature: [{ ts: 6000, value: ds.entityId === 'a' ? '0' : '23' }] }),
    attributes: async (_ds, scope) => {
      seenScope = scope;
      return [{ key: 'enabled', value: false, lastUpdateTs: 3000 }];
    },
    history: async (q) => {
      queries.push(q);
      return {
        temperature: [
          { ts: 2000, value: q.entityId === 'a' ? 11 : 22 },
          { ts: 3000, value: 12 },
        ],
      };
    },
  });
  const result = await client.load(config, 6000);
  assert.equal(seenScope, 'SHARED_SCOPE');
  assert.equal(new Set(result.series.map((s) => s.id)).size, 3);
  assert.equal(result.series[0].latest?.value, '0');
  assert.equal(result.series[0].points[0].value, 11);
  assert.equal(result.series[1].points[0].value, 22);
  assert.equal(result.series[2].latest?.value, false);
  assert.equal(queries[0].agg, 'AVG');
  assert.equal(queries[0].startTs, 1000);
  assert.equal(queries[0].endTs, 5000);
  const table = nativeTableRows(result.series.slice(0, 2));
  assert.equal(table.total, 2);
  assert.equal(table.rows[0].ts, 3000);
  assert.equal(table.rows[1].values[result.series[1].id], 22);
  assert.equal(nativeNumber(null), null);
  assert.equal(nativeNumber(false), null);
  assert.equal(nativeNumber(''), null);
  assert.equal(nativeNumber('0'), 0);
  assert.equal(formatNativeValue(null), '—');
  assert.equal(formatNativeValue(false), 'false');
  assert.equal(formatNativeValue(0, 1, '°C'), '0.0 °C');
  assert.equal(
    nativeThresholdColor(10, {
      ...config.native,
      thresholds: [
        { from: 0, to: 10, color: 'blue' },
        { from: 10, to: null, color: 'red' },
      ],
    }),
    'red',
  );
  const partial = await createNativeDataClient({
    latest: async () => {
      throw Error('private server response');
    },
    attributes: async () => [],
    history: async () => ({ temperature: [{ ts: 2000, value: 5 }] }),
  }).load(config);
  assert.equal(partial.series[0].latest, null);
  assert.equal(partial.series[0].points[0].value, 5);
  assert.ok(partial.series[0].error);
  assert.ok(!JSON.stringify(partial).includes('private server'));
  const longConfig = { ...config, native: { ...config.native, window: { ...config.native.window, endTs: 10000 } } };
  const long = await createNativeDataClient({
    latest: async () => ({}),
    attributes: async () => [],
    history: async () => ({ temperature: Array.from({ length: 2001 }, (_, i) => ({ ts: i + 1000, value: i })) }),
  }).load(longConfig);
  assert.equal(long.series[0].points.length, 2000);
  assert.equal(long.series[0].truncated, true);
  let calls = 0;
  const dedup = createNativeDataClient({
    latest: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return {};
    },
    attributes: async () => [],
    history: async () => ({}),
  });
  await Promise.all([
    dedup.load(
      { ...config, native: { ...config.native, family: 'value' }, datasources: [config.datasources[0]] },
      10000,
    ),
    dedup.load(
      { ...config, native: { ...config.native, family: 'value' }, datasources: [config.datasources[0]] },
      10000,
    ),
  ]);
  assert.equal(calls, 1);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  let resolveOld!: (s: NativeSnapshot) => void;
  const published: NativeSnapshot[] = [];
  let scheduled = 0;
  const poller = createNativePoller(
    () => new Promise((r) => (resolveOld = r)),
    (s) => published.push(s),
    () => ++scheduled,
    () => {},
  );
  poller.update(config);
  poller.stop();
  resolveOld(result);
  await tick();
  assert.equal(published.filter((s) => !s.loading).length, 0);
  assert.equal(scheduled, 0);
  const fixed = createNativePoller(
    async () => result,
    () => {},
    () => ++scheduled,
    () => {},
  );
  fixed.update(config);
  await tick();
  assert.equal(scheduled, 0);
  fixed.stop();
  console.log('Native catalog/import/data/lifecycle tests passed (521 definitions, 292 base adapters)');
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
