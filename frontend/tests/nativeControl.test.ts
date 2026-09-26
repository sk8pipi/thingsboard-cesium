import assert from 'node:assert/strict';
import {
  isBooleanControl,
  nativeControlKind,
  nativeControlValue,
  nextStepperValue,
  validateNativeControlSettings,
} from '../src/views/tb/dashboard/runtime/native/nativeControlCore';
import { withNativeSettings } from '../src/views/tb/dashboard/runtime/native/nativeWidgetSettings';

const settings = withNativeSettings({} as any).control;
assert.equal(nativeControlKind('control_widgets.switch_control'), 'switch');
assert.equal(nativeControlKind('power_button'), 'power');
assert.equal(nativeControlKind('slider'), 'slider');
assert.equal(nativeControlKind('toggle_button'), 'toggleButton');
assert.equal(nativeControlKind('unknown'), null);
assert.equal(isBooleanControl('singleSwitch'), true);
assert.equal(isBooleanControl('stepper'), false);
assert.equal(nativeControlValue('false', { ...settings, kind: 'switch' }), false);
assert.equal(nativeControlValue('true', { ...settings, kind: 'switch' }), true);
assert.equal(nativeControlValue('125', { ...settings, kind: 'slider', min: 0, max: 100 }), 100);
assert.equal(nextStepperValue(0.9, 1, { ...settings, kind: 'stepper', min: 0, max: 1, step: 0.1, decimals: 1 }), 1);
assert.equal(nextStepperValue(0, -1, { ...settings, kind: 'stepper', min: 0, max: 1, step: 0.1, decimals: 1 }), 0);
assert.deepEqual(validateNativeControlSettings(settings), []);
assert.match(
  validateNativeControlSettings({ ...settings, setValueMethod: '', min: 10, max: 0, kind: 'slider' }).join(';'),
  /写入 RPC 方法.*数值范围/,
);
console.log('Native control kinds, safe value conversion, validation and step boundaries passed');
