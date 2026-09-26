import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as core from '../src/views/tb/dashboard/runtime/native/nativeControlCore';

const source = fs.readFileSync(
  new URL('../src/views/tb/dashboard/runtime/native/NativeControlView.vue', import.meta.url),
  'utf8',
);
const script = compileScript(parse(source).descriptor, { id: 'native-control-view-test' });
const output = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const sent: any[] = [];
const context = vm.createContext({
  exports: {},
  setInterval,
  clearInterval,
  setTimeout,
  require: (name: string) => {
    if (name === 'vue') return vue;
    if (name === './nativeControlCore') return core;
    if (name === '/@/api/tb/telemetry')
      return { getAttributesByScope: async () => [], getLatestTimeseries: async () => ({}) };
    if (name === '/@/api/tb/rpc')
      return {
        getPersistedRpc: async () => ({}),
        rpcSendTwoway: async () => false,
        rpcSendOneway: async (deviceId: string, request: any) => sent.push({ deviceId, request }),
      };
    if (name === '/@/enums/entityTypeEnum') return { EntityType: { DEVICE: 'DEVICE' } };
    if (name === '/@/enums/telemetryEnum') return { Scope: { SERVER_SCOPE: 'SERVER_SCOPE' } };
    throw new Error(`Unexpected import: ${name}`);
  },
});
vm.runInContext(output, context);
const props = vue.reactive({
  settings: {
    kind: 'switch',
    title: 'Pump',
    initialValue: false,
    retrieveValueMethod: 'none',
    valueKey: 'state',
    attributeScope: 'SERVER_SCOPE',
    getValueMethod: 'getState',
    setValueMethod: 'setState',
    requestTimeout: 5000,
    requestPersistent: false,
    persistentPollingInterval: 1000,
    min: 0,
    max: 100,
    step: 1,
    decimals: 0,
    units: '',
    showValue: true,
    showOnOffLabels: true,
    onLabel: 'ON',
    offLabel: 'OFF',
    activeColor: '#5469ff',
    inactiveColor: '#9ba2b0',
  },
  source: { entityType: 'DEVICE', entityId: 'device-1', dataKeys: [] },
  pollMs: 5000,
  previewOnly: true,
});
const scope = vue.effectScope();
const state = scope.run(() => context.exports.default.setup(props, { expose() {} }));
await state.commit(true);
assert.equal(sent.length, 0, 'preview must never send a control RPC');
props.previewOnly = false;
await vue.nextTick();
await state.commit(true);
assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
  {
    deviceId: 'device-1',
    request: { method: 'setState', params: true, timeout: 5000, persistent: false },
  },
]);
assert.equal(state.value.value, true);
assert.match(state.message.value, /已提交/);
scope.stop();
console.log('Native control preview safety, device RPC and optimistic feedback passed');
