import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createNativeWidget,
  getNativeWidgetSupport,
  validateNativeWidget,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { createNativeDataClient } from '../src/views/tb/dashboard/runtime/native/nativeWidgetDataCore';
import { nativeChartOptions } from '../src/views/tb/dashboard/runtime/native/nativeWidgetChartOptions';

const cases = new Map([
  ['charts.bars', 'latestBar'],
  ['charts.pie_chart_js', 'pie'],
  ['charts.polar_area_chart_js', 'polar'],
  ['charts.radar_chart_js', 'radar'],
  ['charts.pie', 'pie'],
]);
const root = resolve('../backend/application/src/main/data/json/system/widget_types');
const originals = readdirSync(root)
  .map((file) => JSON.parse(readFileSync(resolve(root, file), 'utf8')))
  .filter((source) => cases.has(source.fqn));
assert.equal(originals.length, cases.size);
let historyReads = 0;
const client = createNativeDataClient({
  latest: async () => ({ one: [{ ts: 1000, value: 0 }], two: [{ ts: 1000, value: 12 }] }),
  attributes: async () => [],
  history: async () => {
    historyReads++;
    return {};
  },
});
for (const original of originals) {
  assert.equal(getNativeWidgetSupport(original).supported, true);
  const widget = createNativeWidget(original);
  assert.equal(widget.config.native.family, cases.get(original.fqn));
  assert.equal(widget.config.native.fqn, original.fqn);
  assert.equal(widget.category, 'latest');
  widget.config.datasources = [
    {
      type: 'entity',
      entityType: 'DEVICE',
      entityId: 'legacy-test',
      dataKeys: [
        { name: 'one', type: 'timeseries' },
        { name: 'two', type: 'timeseries' },
      ],
    },
  ];
  widget.config.native.showLegend = false;
  const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
  assert.deepEqual(validateNativeWidget(reopened), []);
  assert.equal(reopened.config.native.showLegend, false);
  const data = await client.load(
    { native: reopened.config.native, datasources: reopened.config.datasources as any },
    2000,
  );
  assert.equal(data.series[0].latest?.value, 0);
  assert.equal(data.series[1].latest?.value, 12);
  assert.deepEqual(data.errors, []);
  const chart: any = nativeChartOptions(reopened.config.native, data.series);
  assert.ok(chart.series?.length);
  if (original.fqn === 'charts.bars') assert.equal(chart.series[0].type, 'bar');
  if (original.fqn === 'charts.pie_chart_js') assert.equal(chart.series[0].type, 'pie');
  if (original.fqn === 'charts.pie') {
    assert.equal(chart.series[0].type, 'pie');
    assert.equal(reopened.config.native.pie.showPercent, true);
  }
  if (original.fqn === 'charts.polar_area_chart_js') assert.ok(chart.polar?.radius);
  if (original.fqn === 'charts.radar_chart_js') assert.ok(chart.radar);
}
assert.equal(historyReads, 0);
for (const fqn of ['label_value_card', 'cards.simple_card']) {
  const source = JSON.parse(
    readFileSync(resolve(root, `${fqn === 'label_value_card' ? 'label___value_card' : 'simple_card'}.json`), 'utf8'),
  );
  const widget = createNativeWidget(source);
  assert.equal(widget.config.native.family, 'value');
  assert.equal(widget.config.showTitle, false);
  assert.equal(widget.config.native.presentation.labelPosition, 'top');
  widget.config.datasources = [
    { type: 'entity', entityType: 'DEVICE', entityId: 'legacy-test', dataKeys: [{ name: 'one', type: 'timeseries' }] },
  ];
  assert.deepEqual(validateNativeWidget(widget), []);
  assert.equal(createNativeWidget(JSON.parse(JSON.stringify(widget))).config.showTitle, false);
}
for (const [fqn, family] of [
  ['charts.basic_timeseries', 'timeseries'],
  ['charts.state_chart', 'state'],
  ['charts.timeseries_bars_flot', 'timeseries'],
] as const) {
  const source = readdirSync(root)
    .map((file) => JSON.parse(readFileSync(resolve(root, file), 'utf8')))
    .find((item) => item.fqn === fqn);
  assert.ok(source);
  const widget = createNativeWidget(source);
  assert.equal(widget.config.native.family, family);
  assert.equal(widget.category, 'timeseries');
  widget.config.datasources = [
    { type: 'entity', entityType: 'DEVICE', entityId: 'legacy-test', dataKeys: [{ name: 'one', type: 'timeseries' }] },
  ];
  assert.deepEqual(validateNativeWidget(widget), []);
  if (family === 'state')
    assert.deepEqual(
      widget.config.native.state.states.map((state: any) => state.label),
      ['Off', 'On'],
    );
  if (fqn === 'charts.timeseries_bars_flot') {
    assert.equal(widget.config.native.chartType, 'bar');
    assert.equal(widget.config.native.chart.stack, true);
  }
  assert.deepEqual(createNativeWidget(JSON.parse(JSON.stringify(widget))).config.native, widget.config.native);
}
console.log('Legacy Chart.js, Flot and simple-card definitions, reads and re-edit passed');
