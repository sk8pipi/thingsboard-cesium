import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as core from '../src/views/tb/dashboard/runtime/native/nativeMultiInputCore';

const source = fs.readFileSync(
  new URL('../src/views/tb/dashboard/runtime/native/NativeMultiInputView.vue', import.meta.url),
  'utf8',
);
const script = compileScript(parse(source).descriptor, { id: 'multi-input-test' });
const output = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const calls: { scope: string; values: Record<string, unknown> }[] = [];
let failTelemetry = false;
const context = vm.createContext({
  exports: {},
  require: (name: string) => {
    if (name === 'vue') return vue;
    if (name === './nativeMultiInputCore') return core;
    if (name === '/@/api/tb/telemetry')
      return {
        saveEntityAttributesV1: async (_entity: any, scope: string, values: Record<string, unknown>) => {
          calls.push({ scope, values });
        },
        saveEntityTelemetry: async (_entity: any, values: Record<string, unknown>) => {
          if (failTelemetry) throw new Error('network failed');
          calls.push({ scope: 'timeseries', values });
        },
        getAttributesByScope: async (_entity: any, _scope: string, params: { keys: string }) => [
          { key: params.keys, value: params.keys === 'enabled' ? true : 0 },
        ],
        getLatestTimeseries: async (_entity: any, key: string) => ({ [key]: { data: [{ value: 'new' }] } }),
      };
    throw new Error(`Unexpected import: ${name}`);
  },
});
vm.runInContext(output, context);
const key = (name: string, type: string, scope?: string, valueType = 'string') => ({
  name,
  type,
  scope,
  label: name,
  settings: { nativeMulti: { dataKeyValueType: valueType } },
});
const dataKeys = [
  key('enabled', 'attribute', 'SHARED_SCOPE', 'booleanSwitch'),
  key('limit', 'attribute', 'SERVER_SCOPE', 'integer'),
  key('note', 'timeseries'),
];
const series = dataKeys.map((item, index) => ({
  id: `id-${index}`,
  entityId: 'device-1',
  label: item.name,
  key: item,
  latest: { ts: 1, value: [false, 4, 'old'][index] },
  points: [],
  truncated: false,
}));
const props = vue.reactive({
  settings: {
    showResultMessage: true,
    showActionButtons: true,
    updateAllValues: false,
    saveButtonLabel: '',
    resetButtonLabel: '',
    showGroupTitle: false,
    groupTitle: '',
    fieldsAlignment: 'row',
    fieldsInRow: 2,
    rowGap: 5,
    columnGap: 10,
  },
  sources: [{ type: 'entity', entityType: 'DEVICE', entityId: 'device-1', dataKeys }],
  series,
  previewOnly: true,
});
let refreshed = 0;
const scope = vue.effectScope();
const state = scope.run(() =>
  context.exports.default.setup(props, {
    expose() {},
    emit(event: string) {
      if (event === 'saved') refreshed++;
    },
  }),
);
state.setDraft('id-0', true);
state.setDraft('id-1', '0');
state.setDraft('id-2', 'new');
await state.save(state.visibleSeries.value);
assert.equal(calls.length, 0, 'preview must not write');
props.previewOnly = false;
await state.save(state.visibleSeries.value);
assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
  { scope: 'SHARED_SCOPE', values: { enabled: true } },
  { scope: 'SERVER_SCOPE', values: { limit: 0 } },
  { scope: 'timeseries', values: { note: 'new' } },
]);
assert.equal(refreshed, 1);
assert.match(state.message.value, /已保存并回读/);
state.setDraft('id-1', '1');
state.setDraft('id-2', 'again');
failTelemetry = true;
await state.save(state.visibleSeries.value);
assert.equal(refreshed, 2, 'partial write still refreshes the displayed values');
assert.match(state.message.value, /部分字段可能已写入/);
scope.stop();
console.log('Multi-input preview, scoped write batches, readback and partial failure feedback passed');
