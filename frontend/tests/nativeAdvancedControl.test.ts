import assert from 'node:assert/strict';
import {
  NATIVE_ADVANCED_CONTROL_FQNS,
  advancedControlNeedsDevice,
  gpioStates,
  nativeAdvancedControlMode,
  parseAttributesJson,
  parseRpcParams,
  parseTerminalCommand,
  safeActionUrl,
  serviceRpcMethod,
  validateNativeAdvancedControlSettings,
} from '../src/views/tb/dashboard/runtime/native/nativeAdvancedControlCore';
import { withNativeSettings } from '../src/views/tb/dashboard/runtime/native/nativeWidgetSettings';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';

assert.equal(Object.keys(NATIVE_ADVANCED_CONTROL_FQNS).length, 12);
assert.equal(nativeAdvancedControlMode('gpio_widgets.raspberry_pi_gpio_control'), 'gpioControl');
assert.equal(nativeAdvancedControlMode('control_widgets.rpc_remote_shell'), 'rpcShell');
assert.equal(nativeAdvancedControlMode('missing'), null);
assert.equal(advancedControlNeedsDevice('attributeUpdate'), true);
assert.equal(advancedControlNeedsDevice('segment'), false);

assert.deepEqual(parseRpcParams('{"value":true}'), { value: true });
assert.equal(parseRpcParams('plain text'), 'plain text');
assert.deepEqual(parseTerminalCommand('setState {"value":1}'), { method: 'setState', params: { value: 1 } });
assert.deepEqual(parseAttributesJson('{"threshold":12}'), { threshold: 12 });
assert.throws(() => parseAttributesJson('[]'), /JSON 对象/);
assert.equal(safeActionUrl('/dashboard/1'), '/dashboard/1');
assert.equal(safeActionUrl('https://example.com'), 'https://example.com');
assert.throws(() => safeActionUrl('javascript:alert(1)'), /站内路径或 HTTPS/);
assert.equal(serviceRpcMethod('Ping', false), 'gateway_ping');
assert.equal(serviceRpcMethod('mqtt_get', true), 'mqtt_get');

const base = withNativeSettings({} as any).advancedControl;
assert.deepEqual(validateNativeAdvancedControlSettings({ ...base, mode: 'actionButton' }), []);
assert.ok(validateNativeAdvancedControlSettings({ ...base, mode: 'gpioControl', pins: [] }).length > 0);
assert.deepEqual(
  gpioStates('{"1":true,"2":false}', [
    { pin: '1', label: 'GPIO 1', row: 0, col: 0, color: '#fff' },
    { pin: '2', label: 'GPIO 2', row: 0, col: 1, color: '#fff' },
  ]),
  { '1': true, '2': false },
);

for (const [fqn, mode] of Object.entries(NATIVE_ADVANCED_CONTROL_FQNS)) {
  const widget = createNativeWidget({ fqn });
  assert.equal(widget.config.native.family, 'advancedControl');
  assert.equal(widget.config.native.advancedControl.mode, mode);
  widget.config.datasources = advancedControlNeedsDevice(mode)
    ? [{ type: 'entity', entityType: 'DEVICE', entityId: 'device-1', dataKeys: [] }]
    : [];
  assert.deepEqual(validateNativeWidget(widget), [], `${fqn} 默认配置可保存`);
  widget.config.native.advancedControl.buttonText = `saved-${mode}`;
  const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
  assert.equal(reopened.config.native.advancedControl.buttonText, `saved-${mode}`);
  assert.equal(reopened.config.native.advancedControl.mode, mode);
}

console.log('Native advanced control mapping, parsing and validation tests passed');
