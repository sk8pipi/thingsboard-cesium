import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createNativeWidget,
  getNativeWidgetSupport,
  validateNativeWidget,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import {
  rpcButtonRequest,
  validateRpcButtonSettings,
} from '../src/views/tb/dashboard/runtime/native/nativeRpcButtonCore';

const source = JSON.parse(
  readFileSync(resolve('../backend/application/src/main/data/json/system/widget_types/rpc_button.json'), 'utf8'),
);
assert.equal(getNativeWidgetSupport(source).supported, true);
const widget = createNativeWidget(source);
assert.equal(widget.config.native.family, 'rpcButton');
widget.config.datasources = [
  { type: 'entity', entityType: 'DEVICE', entityId: 'rpc-device', name: 'RPC device', dataKeys: [] },
];
assert.deepEqual(validateNativeWidget(widget), []);

const settings = widget.config.native.rpcButton;
assert.deepEqual(rpcButtonRequest(settings), { method: 'rpcCommand', params: {}, timeout: 5000 });
settings.methodName = 'setValue';
settings.methodParams = '{"enabled":true,"value":0}';
settings.requestTimeout = 8000;
settings.oneWayElseTwoWay = false;
settings.buttonText = 'Set value';
settings.styleButton.isPrimary = true;
settings.styleButton.bgColor = '#123456';
settings.styleButton.textColor = '#fefefe';
const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
assert.deepEqual(validateNativeWidget(reopened), []);
assert.deepEqual(rpcButtonRequest(reopened.config.native.rpcButton), {
  method: 'setValue',
  params: { enabled: true, value: 0 },
  timeout: 8000,
});
assert.equal(reopened.config.native.rpcButton.oneWayElseTwoWay, false);
assert.equal(reopened.config.native.rpcButton.styleButton.isPrimary, true);
assert.equal(reopened.config.native.rpcButton.styleButton.bgColor, '#123456');
assert.equal(reopened.config.native.rpcButton.styleButton.textColor, '#fefefe');

assert.match(validateNativeWidget({ ...widget, config: { ...widget.config, datasources: [] } }).join(';'), /设备/);
const asset = JSON.parse(JSON.stringify(widget));
asset.config.datasources[0].entityType = 'ASSET';
assert.match(validateNativeWidget(asset).join(';'), /设备/);
const withKey = JSON.parse(JSON.stringify(widget));
withKey.config.datasources[0].dataKeys.push({ name: 'temperature', type: 'timeseries' });
assert.match(validateNativeWidget(withKey).join(';'), /不需要数据字段/);
assert.deepEqual(rpcButtonRequest({ ...settings, methodParams: 'on' }).params, 'on');
assert.deepEqual(rpcButtonRequest({ ...settings, methodParams: '' }).params, '');
assert.deepEqual(validateRpcButtonSettings({ ...settings, requestTimeout: -1 }), ['RPC 超时应为 0–60000 毫秒']);
assert.deepEqual(validateRpcButtonSettings({ ...settings, methodName: ' ' }), ['请输入 RPC 方法名']);

console.log('RPC button device binding, JSON request, validation and saved configuration passed');
