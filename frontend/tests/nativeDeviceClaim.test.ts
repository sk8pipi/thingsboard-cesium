import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { withNativeSettings } from '../src/views/tb/dashboard/runtime/native/nativeWidgetSettings';

const widget = createNativeWidget({ fqn: 'input_widgets.device_claiming_widget' });
assert.equal(widget.config.native.family, 'deviceClaim');
assert.deepEqual(validateNativeWidget(widget), []);
widget.config.native.deviceClaim.deviceSecret = false;
widget.config.native.deviceClaim.claimButtonLabel = '绑定设备';
assert.equal(
  withNativeSettings(JSON.parse(JSON.stringify(widget.config.native))).deviceClaim.claimButtonLabel,
  '绑定设备',
);

const source = fs.readFileSync(
  new URL('../src/views/tb/dashboard/runtime/native/NativeDeviceClaimView.vue', import.meta.url),
  'utf8',
);
const script = compileScript(parse(source).descriptor, { id: 'native-device-claim-test' });
const output = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const calls: { name: string; key: string | undefined }[] = [];
const context = vm.createContext({
  exports: {},
  require: (name: string) => {
    if (name === 'vue') return vue;
    if (name === '/@/api/tb/device')
      return {
        claimDevice: async (deviceName: string, secretKey?: string) => {
          calls.push({ name: deviceName, key: secretKey });
        },
      };
    throw new Error(`Unexpected import: ${name}`);
  },
});
vm.runInContext(output, context);
const props = vue.reactive({ settings: widget.config.native.deviceClaim, previewOnly: true });
const scope = vue.effectScope();
const state = scope.run(() => context.exports.default.setup(props, { expose() {} }));
state.deviceName.value = ' Pump 1 ';
await state.submit();
assert.equal(calls.length, 0, 'preview cannot claim a device');
props.previewOnly = false;
await state.submit();
assert.deepEqual(calls, [{ name: 'Pump 1', key: undefined }]);
assert.equal(state.message.value, props.settings.successfulClaimDevice);
props.settings.deviceSecret = true;
state.secretKey.value = 'secret';
await state.submit();
assert.deepEqual(calls[1], { name: 'Pump 1', key: 'secret' });
assert.equal(state.secretKey.value, '', 'secret must be cleared after success');
scope.stop();

const apiSource = fs.readFileSync(new URL('../src/api/tb/device.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('device.ts', apiSource, ts.ScriptTarget.ES2022, true);
const apiFunction = ast.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === 'claimDevice',
);
assert.ok(apiFunction);
const apiCode = ts.transpileModule(apiFunction.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const requests: any[] = [];
const apiContext = vm.createContext({
  exports: {},
  defHttp: {
    postJson: (request: any) => {
      requests.push(request);
      return request;
    },
  },
});
vm.runInContext(apiCode, apiContext);
apiContext.exports.claimDevice('pump/1');
apiContext.exports.claimDevice('pump 2', 'abc');
assert.equal(requests[0].url, '/api/customer/device/pump%2F1/claim');
assert.deepEqual(JSON.parse(JSON.stringify(requests[0].data)), {});
assert.deepEqual(JSON.parse(JSON.stringify(requests[1].data)), { secretKey: 'abc' });
console.log('native device claim preview, submit, API body and config roundtrip passed');
