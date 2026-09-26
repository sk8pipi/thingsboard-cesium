import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import {
  checkNativeLedStatus,
  nativeLedSpec,
  nativeLedValue,
  validateNativeLedSettings,
} from '../src/views/tb/dashboard/runtime/native/nativeLedCore';

const original = JSON.parse(
  readFileSync(resolve('../backend/application/src/main/data/json/system/widget_types/led_indicator.json'), 'utf8'),
);
const widget = createNativeWidget(original);
assert.equal(nativeLedSpec(original.fqn), true);
assert.equal(nativeLedSpec('control_widgets.other'), false);
assert.equal(widget.config.native.family, 'ledIndicator');
widget.config.datasources = [{ type: 'entity', entityType: 'DEVICE', entityId: 'led-test', dataKeys: [] }];
widget.config.native.ledIndicator.title = '泵运行状态';
widget.config.native.ledIndicator.valueAttribute = 'running';
widget.config.native.ledIndicator.attributeScope = 'SHARED_SCOPE';
assert.deepEqual(validateNativeWidget(widget), []);
const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
assert.equal(reopened.config.native.ledIndicator.title, '泵运行状态');
assert.equal(reopened.config.native.ledIndicator.valueAttribute, 'running');
assert.equal(reopened.config.native.ledIndicator.attributeScope, 'SHARED_SCOPE');
assert.deepEqual(validateNativeWidget(reopened), []);
const bad = JSON.parse(JSON.stringify(widget));
bad.config.datasources[0].entityType = 'ASSET';
assert.match(validateNativeWidget(bad).join(','), /目标设备/);
bad.config.native.ledIndicator.parseValueFunction = 'return alert(1)';
assert.match(validateNativeWidget(bad).join(','), /自定义 LED/);
assert.deepEqual(validateNativeLedSettings(widget.config.native.ledIndicator), []);
assert.equal(nativeLedValue('false'), false);
assert.equal(nativeLedValue('0'), false);
assert.equal(nativeLedValue('true'), true);
assert.equal(nativeLedValue('"on"'), true);
assert.equal(nativeLedValue(0), false);

const settings = widget.config.native.ledIndicator;
const calls: string[] = [];
const transport = {
  transient: async (device: string, method: string, timeout: number) => {
    calls.push(`transient:${device}:${method}:${timeout}`);
    return true;
  },
  persistent: async (device: string, method: string, timeout: number) => {
    calls.push(`persistent:${device}:${method}:${timeout}`);
    return { rpcId: 'rpc-1' };
  },
  getPersisted: async (id: string) => {
    calls.push(`poll:${id}`);
    return {
      status: calls.filter((call) => call.startsWith('poll:')).length === 1 ? 'QUEUED' : 'SUCCESSFUL',
      response: true,
    };
  },
  delay: async (ms: number) => {
    calls.push(`delay:${ms}`);
  },
};
assert.equal(await checkNativeLedStatus('led-test', settings, transport), true);
assert.deepEqual(calls.splice(0), ['transient:led-test:checkStatus:500']);
settings.requestPersistent = true;
settings.persistentPollingInterval = 1000;
assert.equal(await checkNativeLedStatus('led-test', settings, transport), true);
assert.deepEqual(calls.splice(0), [
  'persistent:led-test:checkStatus:500',
  'delay:1000',
  'poll:rpc-1',
  'delay:1000',
  'poll:rpc-1',
]);
assert.equal(await checkNativeLedStatus('led-test', settings, transport, () => false), false);
assert.deepEqual(calls.splice(0), ['persistent:led-test:checkStatus:500']);
settings.performCheckStatus = false;
assert.equal(await checkNativeLedStatus('led-test', settings, transport), true);
assert.deepEqual(calls, []);
const viewSource = readFileSync(
  new URL('../src/views/tb/dashboard/runtime/native/NativeLedView.vue', import.meta.url),
  'utf8',
);
const script = compileScript(parse(viewSource).descriptor, { id: 'native-led-view-test' });
const output = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
let rpcCalls = 0;
let readCalls = 0;
let onUnmount = () => {};
const context = vm.createContext({
  exports: {},
  setInterval: () => 1,
  clearInterval: () => {},
  setTimeout: () => 1,
  clearTimeout: () => {},
  require: (name: string) => {
    if (name === 'vue')
      return {
        ...vue,
        onBeforeUnmount: (callback: () => void) => {
          onUnmount = callback;
        },
      };
    if (name === '/@/api/tb/telemetry')
      return {
        getAttributesByScope: async () => {
          readCalls++;
          return [{ key: 'running', value: false }];
        },
        getLatestTimeseries: async () => ({}),
      };
    if (name === '/@/api/tb/rpc')
      return {
        rpcSendTwoway: async () => {
          rpcCalls++;
          return true;
        },
        getPersistedRpc: async () => ({}),
      };
    if (name === '/@/enums/entityTypeEnum') return { EntityType: { DEVICE: 'DEVICE' } };
    if (name === '/@/enums/telemetryEnum') return { Scope: { SERVER_SCOPE: 'SERVER_SCOPE' } };
    if (name === './nativeLedCore') return { checkNativeLedStatus, nativeLedValue, validateNativeLedSettings };
    throw new Error(`Unexpected import: ${name}`);
  },
});
vm.runInContext(output, context);
const viewProps = vue.reactive({
  settings: {
    ...widget.config.native.ledIndicator,
    initialValue: true,
    performCheckStatus: true,
    requestPersistent: false,
  },
  source: widget.config.datasources[0],
  pollMs: 5000,
  previewOnly: true,
});
const scope = vue.effectScope();
const state = scope.run(() => context.exports.default.setup(viewProps, { expose() {} }));
assert.equal(state.value.value, true);
assert.equal(rpcCalls, 0, 'preview must not send status RPC');
viewProps.previewOnly = false;
await vue.nextTick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(rpcCalls, 1);
assert.equal(readCalls, 1);
assert.equal(state.value.value, false, 'actual attribute false must turn the LED off');
onUnmount();
scope.stop();
console.log('Native LED: config roundtrip, safe parser, device binding, transient/persistent status gate passed');
