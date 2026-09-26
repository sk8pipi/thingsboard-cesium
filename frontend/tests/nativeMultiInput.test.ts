import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createNativeWidget,
  getNativeWidgetSupport,
  validateNativeWidget,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import {
  collectMultiInputChanges,
  multiInputDisplay,
  multiInputValue,
  multiKeySettings,
  validateMultiInputKey,
} from '../src/views/tb/dashboard/runtime/native/nativeMultiInputCore';

const source = JSON.parse(
  readFileSync(
    resolve('../backend/application/src/main/data/json/system/widget_types/update_multiple_attributes.json'),
    'utf8',
  ),
);
assert.equal(getNativeWidgetSupport(source).supported, true);
const widget = createNativeWidget(source);
assert.equal(widget.config.native.family, 'multiInput');
const key = (name: string, type: 'attribute' | 'timeseries', scope?: 'SERVER_SCOPE' | 'SHARED_SCOPE') => ({
  name,
  label: name,
  type,
  scope,
  settings: { nativeMulti: multiKeySettings({ name, type } as any) },
});
const enabled = key('enabled', 'attribute', 'SHARED_SCOPE');
enabled.settings.nativeMulti.dataKeyValueType = 'booleanSwitch';
const limit = key('limit', 'attribute', 'SERVER_SCOPE');
limit.settings.nativeMulti.dataKeyValueType = 'integer';
limit.settings.nativeMulti.minValue = 0;
limit.settings.nativeMulti.maxValue = 100;
const note = key('note', 'timeseries');
note.settings.nativeMulti.dataKeyValueType = 'string';
widget.config.datasources = [
  { type: 'entity', entityType: 'DEVICE', entityId: 'device-1', dataKeys: [enabled, limit, note] },
];
assert.deepEqual(validateNativeWidget(widget), []);
widget.config.native.multiInput.fieldsInRow = 3;
widget.config.native.multiInput.updateAllValues = true;
const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
assert.equal(reopened.config.native.multiInput.fieldsInRow, 3);
assert.equal(reopened.config.native.multiInput.updateAllValues, true);
assert.equal(reopened.config.datasources[0].dataKeys[1].settings.nativeMulti.maxValue, 100);
assert.deepEqual(validateNativeWidget(reopened), []);

const series = widget.config.datasources[0].dataKeys.map((item: any, index: number) => ({
  id: `id-${index}`,
  entityId: 'device-1',
  key: item,
  latest: { ts: 1, value: [false, 4, 'old'][index] },
  label: item.label,
  points: [],
  truncated: false,
}));
const drafts = { 'id-0': true, 'id-1': '0', 'id-2': 'new' };
const changes = collectMultiInputChanges(series as any, drafts, false);
assert.deepEqual(
  changes.map((item) => [item.series.key.name, item.scope, item.value]),
  [
    ['enabled', 'SHARED_SCOPE', true],
    ['limit', 'SERVER_SCOPE', 0],
    ['note', 'timeseries', 'new'],
  ],
);
assert.deepEqual(collectMultiInputChanges(series as any, { 'id-0': false, 'id-1': '4', 'id-2': 'old' }, false), []);
assert.equal(multiInputValue('00:00', { ...multiKeySettings(limit as any), dataKeyValueType: 'time' }), 0);
assert.equal(multiInputDisplay(0, 'time'), '00:00');
assert.throws(() => multiInputValue('101', limit.settings.nativeMulti), /范围/);
assert.deepEqual(validateMultiInputKey(enabled as any, 'ASSET'), ['enabled 共享属性仅支持设备']);
const scriptKey = key('script', 'attribute', 'SERVER_SCOPE');
scriptKey.settings = { ...scriptKey.settings, useSetValueFunction: true } as any;
assert.match(validateMultiInputKey(scriptKey as any, 'DEVICE').join(';'), /脚本不能/);
console.log(
  'Multi-attribute source, mixed scopes and value types, validation, write grouping and JSON roundtrip passed',
);
