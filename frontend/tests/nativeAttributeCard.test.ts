import assert from 'node:assert/strict';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { nativeAttributeCardGroups } from '../src/views/tb/dashboard/runtime/native/nativeAttributeCardCore';
import { withNativeSettings } from '../src/views/tb/dashboard/runtime/native/nativeWidgetSettings';
import type { NativeSeries } from '../src/views/tb/dashboard/runtime/native/nativeWidgetDataCore';
import type { NativeSource } from '../src/views/tb/dashboard/runtime/native/nativeWidgetTypes';

const widget = createNativeWidget({ fqn: 'cards.attributes_card' });
assert.equal(widget.config.native.family, 'attributeCard');
const sources: NativeSource[] = [
  {
    type: 'entity',
    entityType: 'DEVICE',
    entityId: 'one',
    name: '设备一',
    dataKeys: [
      { name: 'temperature', label: '温度', type: 'timeseries', units: '°C', decimals: 1 },
      { name: 'empty', label: '空值', type: 'attribute' },
    ],
  },
  {
    type: 'entity',
    entityType: 'DEVICE',
    entityId: 'two',
    name: '设备二',
    dataKeys: [{ name: 'temperature', label: '温度', type: 'timeseries' }],
  },
];
widget.config.datasources = sources;
widget.config.native.attributeCard.showSourceTitle = false;
widget.config.native.attributeCard.labelWidth = 42;
widget.config.native.attributeCard.showMissing = false;
assert.deepEqual(validateNativeWidget(widget), []);
assert.equal(withNativeSettings(JSON.parse(JSON.stringify(widget.config.native))).attributeCard.labelWidth, 42);
const series: NativeSeries[] = [
  {
    id: 'DEVICE:one:timeseries:SERVER_SCOPE:temperature:0:0',
    entityId: 'one',
    label: '温度',
    key: sources[0].dataKeys[0],
    latest: { ts: 1, value: 0 },
    points: [],
    truncated: false,
  },
  {
    id: 'DEVICE:one:attribute:SERVER_SCOPE:empty:0:1',
    entityId: 'one',
    label: '空值',
    key: sources[0].dataKeys[1],
    latest: null,
    points: [],
    truncated: false,
  },
  {
    id: 'DEVICE:two:timeseries:SERVER_SCOPE:temperature:1:0',
    entityId: 'two',
    label: '温度',
    key: sources[1].dataKeys[0],
    latest: { ts: 1, value: 23 },
    points: [],
    truncated: false,
  },
];
const groups = nativeAttributeCardGroups(sources, series, widget.config.native.attributeCard);
assert.equal(groups.length, 2);
assert.deepEqual(
  groups.map((group) => group.rows.map((row) => row.value)),
  [['0.0 °C'], ['23.00']],
);
widget.config.native.attributeCard.showMissing = true;
assert.equal(nativeAttributeCardGroups(sources, series, widget.config.native.attributeCard)[0].rows[1].value, '—');
widget.config.native.attributeCard.labelWidth = 91;
assert.ok(validateNativeWidget(widget).length > 0);
console.log('native attribute card passed');
