import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as core from '../src/views/tb/dashboard/runtime/native/nativeRpcButtonCore';

const source = fs.readFileSync(
  new URL('../src/views/tb/dashboard/runtime/native/NativeRpcButtonView.vue', import.meta.url),
  'utf8',
);
const script = compileScript(parse(source).descriptor, { id: 'rpc-button-test' });
const output = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const sent: { kind: string; deviceId: string; request: any }[] = [];
const context = vm.createContext({
  exports: {},
  require: (name: string) => {
    if (name === 'vue') return vue;
    if (name === './nativeRpcButtonCore') return core;
    if (name === '/@/api/tb/rpc')
      return {
        rpcSendServerSideOneway: async (deviceId: string, request: any) => {
          sent.push({ kind: 'oneway', deviceId, request });
        },
        rpcSendServerSideTwoway: async (deviceId: string, request: any) => {
          sent.push({ kind: 'twoway', deviceId, request });
          return { ok: true };
        },
      };
    throw new Error(`Unexpected import: ${name}`);
  },
});
vm.runInContext(output, context);
const props = vue.reactive({
  settings: {
    methodName: 'setValue',
    methodParams: '{"value":0}',
    requestTimeout: 5000,
    oneWayElseTwoWay: true,
    buttonText: 'Set',
    styleButton: { isRaised: true, isPrimary: false },
  },
  source: { entityType: 'DEVICE', entityId: 'device-1', dataKeys: [] },
  previewOnly: true,
});
const scope = vue.effectScope();
const state = scope.run(() => context.exports.default.setup(props, { expose() {} }));
await state.send();
assert.equal(sent.length, 0, 'preview must never send RPC');
props.previewOnly = false;
await state.send();
assert.equal(sent.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), {
  kind: 'oneway',
  deviceId: 'device-1',
  request: { method: 'setValue', params: { value: 0 }, timeout: 5000 },
});
assert.match(state.message.value, /已提交/);
props.settings.oneWayElseTwoWay = false;
await state.send();
assert.equal(sent[1].kind, 'twoway');
assert.match(state.message.value, /已响应/);
props.source.entityType = 'ASSET';
await state.send();
assert.equal(sent.length, 2, 'asset is not a valid RPC target');
scope.stop();
console.log('RPC button preview, authenticated transport selection, target and feedback passed');
