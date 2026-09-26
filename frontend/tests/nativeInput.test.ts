import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createNativeWidget,
  getNativeWidgetSupport,
  validateNativeWidget,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import {
  nativeInputSpec,
  nativeInputValue,
  writeAndReadNativeInput,
} from '../src/views/tb/dashboard/runtime/native/nativeInputCore';

const root = resolve('../backend/application/src/main/data/json/system/widget_types');
const originals = readdirSync(root)
  .map((file) => JSON.parse(readFileSync(resolve(root, file), 'utf8')))
  .filter((source) => nativeInputSpec(source.fqn));
assert.equal(originals.length, 17);
for (const source of originals) {
  const spec = nativeInputSpec(source.fqn)!;
  assert.equal(getNativeWidgetSupport(source).supported, true);
  const widget = createNativeWidget(source);
  assert.equal(widget.config.native.family, 'input');
  widget.config.datasources = [
    {
      type: 'entity',
      entityType: 'DEVICE',
      entityId: 'input-test',
      dataKeys: [{ name: 'setpoint', type: spec.mode, scope: spec.scope, label: 'Setpoint' } as any],
    },
  ];
  widget.config.native.input.label = '目标值';
  widget.config.native.input.required = false;
  widget.config.native.input.showResultMessage = false;
  assert.deepEqual(validateNativeWidget(widget), [], source.fqn);
  const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
  assert.equal(reopened.config.native.input.label, '目标值');
  assert.equal(reopened.config.native.input.required, false);
  assert.equal(reopened.config.native.input.showResultMessage, false);
  assert.deepEqual(validateNativeWidget(reopened), []);
  const bad = JSON.parse(JSON.stringify(widget));
  bad.config.datasources[0].dataKeys[0].scope = spec.mode === 'attribute' ? 'CLIENT_SCOPE' : 'SERVER_SCOPE';
  if (spec.mode === 'attribute') assert.match(validateNativeWidget(bad).join(','), /属性范围/);
  bad.config.datasources[0].dataKeys[0].type = spec.mode === 'attribute' ? 'timeseries' : 'attribute';
  assert.match(validateNativeWidget(bad).join(','), /字段类型/);
  if (spec.scope === 'SHARED_SCOPE') {
    const asset = JSON.parse(JSON.stringify(widget));
    asset.config.datasources[0].entityType = 'ASSET';
    assert.match(validateNativeWidget(asset).join(','), /仅支持设备/);
  }
}
assert.deepEqual(nativeInputSpec('input_widgets.update_json_attribute', { widgetMode: 'TIME_SERIES' }), {
  mode: 'timeseries',
  valueType: 'json',
});
assert.deepEqual(nativeInputSpec('input_widgets.update_server_image_attribute'), {
  mode: 'attribute',
  scope: 'SERVER_SCOPE',
  valueType: 'image',
});
assert.deepEqual(nativeInputSpec('input_widgets.update_shared_image_attribute'), {
  mode: 'attribute',
  scope: 'SHARED_SCOPE',
  valueType: 'image',
});
assert.equal(nativeInputValue('false', 'boolean', true), false);
assert.equal(nativeInputValue('0', 'integer', true), 0);
assert.equal(nativeInputValue('2.5', 'double', true), 2.5);
assert.equal(nativeInputValue(' text ', 'string', true), 'text');
assert.equal(nativeInputValue('2026-09-24', 'date', true), new Date(2026, 8, 24).getTime());
assert.throws(() => nativeInputValue('1.5', 'integer', true), /整数/);
assert.throws(() => nativeInputValue('', 'double', true), /输入/);
assert.throws(() => nativeInputValue('', 'double', false), /不能为空/);
assert.deepEqual(nativeInputValue('{"active":true,"count":0}', 'json', true), { active: true, count: 0 });
assert.deepEqual(nativeInputValue('', 'json', false), {});
assert.throws(() => nativeInputValue('{broken', 'json', true), /有效 JSON/);
assert.throws(() => nativeInputValue('42', 'json', true), /对象或数组/);
assert.equal(nativeInputValue('data:image/png;base64,YQ==', 'image', true), 'data:image/png;base64,YQ==');
assert.equal(nativeInputValue(null, 'image', true), null);
assert.throws(() => nativeInputValue('https://example.com/a.png', 'image', true), /有效的图片/);
assert.throws(() => nativeInputValue('data:image/svg+xml;base64,YQ==', 'image', true), /有效的图片/);

const imageSource = originals.find((source) => source.fqn === 'input_widgets.update_shared_image_attribute')!;
const imageWidget = createNativeWidget(imageSource);
assert.equal(imageWidget.config.native.input.displayPreview, true);
assert.equal(imageWidget.config.native.input.displayClearButton, false);
imageWidget.config.native.input.displayClearButton = true;
imageWidget.config.native.input.displayApplyButton = false;
imageWidget.config.native.input.displayDiscardButton = false;
const imageReopened = createNativeWidget(JSON.parse(JSON.stringify(imageWidget)));
assert.equal(imageReopened.config.native.input.displayClearButton, true);
assert.equal(imageReopened.config.native.input.displayApplyButton, false);
assert.equal(imageReopened.config.native.input.displayDiscardButton, false);

const jsonSource = originals.find((source) => source.fqn === 'input_widgets.update_json_attribute')!;
const jsonWidget = createNativeWidget(jsonSource);
jsonWidget.config.native.input.widgetMode = 'TIME_SERIES';
jsonWidget.config.datasources = [
  { type: 'entity', entityType: 'DEVICE', entityId: 'input-test', dataKeys: [{ name: 'json', type: 'timeseries' }] },
];
assert.deepEqual(validateNativeWidget(jsonWidget), []);
assert.equal(createNativeWidget(JSON.parse(JSON.stringify(jsonWidget))).config.native.input.widgetMode, 'TIME_SERIES');
jsonWidget.config.native.input.widgetMode = 'ATTRIBUTE';
jsonWidget.config.native.input.attributeScope = 'SHARED_SCOPE';
const jsonKey = (jsonWidget.config.datasources![0]! as any).dataKeys[0];
jsonKey.type = 'attribute';
jsonKey.scope = 'SHARED_SCOPE';
assert.deepEqual(validateNativeWidget(jsonWidget), []);

const calls: string[] = [];
const transport = {
  writeAttribute: async (scope: 'SERVER_SCOPE' | 'SHARED_SCOPE', data: Record<string, unknown>) => {
    calls.push(`write:${scope}:${JSON.stringify(data)}`);
  },
  writeTelemetry: async (data: Record<string, unknown>) => {
    calls.push(`write:telemetry:${JSON.stringify(data)}`);
  },
  readAttribute: async (scope: 'SERVER_SCOPE' | 'SHARED_SCOPE', key: string) => {
    calls.push(`read:${scope}:${key}`);
    return 42;
  },
  readTelemetry: async (key: string) => {
    calls.push(`read:telemetry:${key}`);
    return 7;
  },
};
assert.equal(
  await writeAndReadNativeInput(
    nativeInputSpec('input_widgets.update_shared_integer_attribute')!,
    'setpoint',
    42,
    transport,
  ),
  42,
);
assert.deepEqual(calls.splice(0), ['write:SHARED_SCOPE:{"setpoint":42}', 'read:SHARED_SCOPE:setpoint']);
assert.equal(
  await writeAndReadNativeInput(nativeInputSpec('input_widgets.update_double_timeseries')!, 'setpoint', 7, transport),
  7,
);
assert.deepEqual(calls.splice(0), ['write:telemetry:{"setpoint":7}', 'read:telemetry:setpoint']);
await writeAndReadNativeInput(
  nativeInputSpec('input_widgets.update_json_attribute', { widgetMode: 'TIME_SERIES' })!,
  'payload',
  { active: true },
  transport,
);
assert.deepEqual(calls.splice(0), ['write:telemetry:{"payload":{"active":true}}', 'read:telemetry:payload']);
await writeAndReadNativeInput(
  nativeInputSpec('input_widgets.update_json_attribute', { widgetMode: 'ATTRIBUTE', attributeScope: 'SHARED_SCOPE' })!,
  'payload',
  { active: false },
  transport,
);
assert.deepEqual(calls.splice(0), ['write:SHARED_SCOPE:{"payload":{"active":false}}', 'read:SHARED_SCOPE:payload']);
await assert.rejects(
  writeAndReadNativeInput({ mode: 'attribute', valueType: 'integer', scope: undefined }, 'setpoint', 1, transport),
  /范围/,
);
assert.deepEqual(calls, []);
console.log(
  '17 native scalar/JSON/image input definitions, configuration roundtrip, scope validation and write/read routing passed',
);
