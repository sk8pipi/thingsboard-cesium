import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as core from '../src/views/tb/dashboard/runtime/native/nativeAdvancedControlCore';
import { withNativeSettings } from '../src/views/tb/dashboard/runtime/native/nativeWidgetSettings';

const source = fs.readFileSync(
  new URL('../src/views/tb/dashboard/runtime/native/NativeAdvancedControlView.vue', import.meta.url),
  'utf8',
);
const script = compileScript(parse(source).descriptor, { id: 'native-advanced-control-view-test' });
const output = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const rpcCalls: any[] = [];
const attributeCalls: any[] = [];
const context = vm.createContext({
  exports: {},
  setInterval,
  clearInterval,
  setTimeout,
  window: { location: { assign() {} } },
  require: (name: string) => {
    if (name === 'vue') return vue;
    if (name === './nativeAdvancedControlCore') return core;
    if (name === '/@/api/tb/rpc')
      return {
        deletePersistedRpc: async () => undefined,
        getPersistedRpc: async () => ({}),
        getPersistedRpcByDevice: async () => ({ data: [] }),
        rpcSendTwoway: async (deviceId: string, request: any) => {
          rpcCalls.push({ deviceId, request });
          if (request.method === 'getGpioStatus') return { 1: false };
          if (request.method === 'setGpioStatus') return { 1: request.params.enabled };
          return {};
        },
      };
    if (name === '/@/api/tb/telemetry')
      return {
        saveEntityAttributesV1: async (entityId: any, scope: string, data: any) =>
          attributeCalls.push({ entityId, scope, data }),
      };
    if (name === '/@/enums/entityTypeEnum') return { EntityType: { DEVICE: 'DEVICE' } };
    if (name === '/@/enums/telemetryEnum')
      return { Scope: { CLIENT_SCOPE: 'CLIENT_SCOPE', SERVER_SCOPE: 'SERVER_SCOPE', SHARED_SCOPE: 'SHARED_SCOPE' } };
    throw new Error(`Unexpected import: ${name}`);
  },
});
vm.runInContext(output, context);
const defaults = withNativeSettings({} as any).advancedControl;
const props = vue.reactive({
  settings: {
    ...defaults,
    mode: 'attributeUpdate' as const,
    attributesJson: '{"threshold":12}',
  },
  source: { entityType: 'DEVICE', entityId: 'device-1', dataKeys: [] },
  previewOnly: true,
});
const scope = vue.effectScope();
const state = scope.run(() => context.exports.default.setup(props, { expose() {} }));

await state.updateAttributes();
assert.equal(attributeCalls.length, 0, 'preview must not write attributes');
props.previewOnly = false;
await vue.nextTick();
await state.updateAttributes();
assert.deepEqual(JSON.parse(JSON.stringify(attributeCalls)), [
  {
    entityId: { entityType: 'DEVICE', id: 'device-1' },
    scope: 'SERVER_SCOPE',
    data: { threshold: 12 },
  },
]);

Object.assign(props.settings, {
  mode: 'gpioControl',
  readMethod: 'getGpioStatus',
  writeMethod: 'setGpioStatus',
  pollingInterval: 60000,
  pins: [{ pin: '1', label: 'GPIO 1', row: 0, col: 0, color: '#5469ff' }],
});
await vue.nextTick();
await new Promise((resolve) => setTimeout(resolve, 0));
await state.setPin('1', true);
assert.ok(rpcCalls.some((call) => call.request.method === 'getGpioStatus'));
assert.ok(
  rpcCalls.some(
    (call) => call.request.method === 'setGpioStatus' && call.request.params.pin === '1' && call.request.params.enabled,
  ),
);
assert.equal(state.pinValues.value['1'], true);

state.stop();
scope.stop();
console.log('Native advanced control preview safety, attribute write and GPIO RPC passed');
