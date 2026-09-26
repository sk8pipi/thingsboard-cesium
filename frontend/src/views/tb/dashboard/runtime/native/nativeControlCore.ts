import type { NativeControlSettings } from './nativeWidgetTypes';

export const NATIVE_CONTROL_FQNS: Record<string, NativeControlSettings['kind']> = {
  'control_widgets.switch_control': 'switch',
  'control_widgets.round_switch': 'roundSwitch',
  'control_widgets.slide_toggle_control': 'slideToggle',
  'control_widgets.knob_control': 'knob',
  power_button: 'power',
  single_switch: 'singleSwitch',
  toggle_button: 'toggleButton',
  slider: 'slider',
  value_stepper: 'stepper',
};

export function nativeControlKind(fqn: string) {
  return NATIVE_CONTROL_FQNS[fqn] || null;
}

export function isBooleanControl(kind: NativeControlSettings['kind']) {
  return ['switch', 'roundSwitch', 'slideToggle', 'power', 'singleSwitch', 'toggleButton'].includes(kind);
}

export function nativeControlValue(raw: unknown, settings: NativeControlSettings): number | boolean {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      // Plain device strings are supported without evaluating widget JavaScript.
    }
  }
  if (isBooleanControl(settings.kind)) return !!value;
  const number = Number(value);
  if (!Number.isFinite(number)) return Number(settings.initialValue) || 0;
  return Math.min(settings.max, Math.max(settings.min, number));
}

export function validateNativeControlSettings(settings: NativeControlSettings): string[] {
  const errors: string[] = [];
  if (!Object.values(NATIVE_CONTROL_FQNS).includes(settings.kind)) errors.push('控制部件类型无效');
  if (!['rpc', 'attribute', 'timeseries', 'none'].includes(settings.retrieveValueMethod))
    errors.push('状态读取方式无效');
  if (settings.retrieveValueMethod === 'rpc' && !settings.getValueMethod.trim())
    errors.push('状态读取 RPC 方法不能为空');
  if (['attribute', 'timeseries'].includes(settings.retrieveValueMethod) && !settings.valueKey.trim())
    errors.push('状态字段不能为空');
  if (!settings.setValueMethod.trim()) errors.push('状态写入 RPC 方法不能为空');
  if (!Number.isInteger(settings.requestTimeout) || settings.requestTimeout < 0 || settings.requestTimeout > 60000)
    errors.push('RPC 超时须为 0–60000 毫秒');
  if (
    !Number.isInteger(settings.persistentPollingInterval) ||
    settings.persistentPollingInterval < 1000 ||
    settings.persistentPollingInterval > 60000
  )
    errors.push('持久 RPC 轮询间隔须为 1000–60000 毫秒');
  if (!isBooleanControl(settings.kind)) {
    if (!Number.isFinite(settings.min) || !Number.isFinite(settings.max) || settings.min >= settings.max)
      errors.push('数值范围无效');
    if (!Number.isFinite(settings.step) || settings.step <= 0) errors.push('步长必须大于 0');
    if (!Number.isInteger(settings.decimals) || settings.decimals < 0 || settings.decimals > 8)
      errors.push('小数位须为 0–8');
  }
  return errors;
}

export function nextStepperValue(value: number, direction: -1 | 1, settings: NativeControlSettings) {
  const next = Math.min(settings.max, Math.max(settings.min, value + direction * settings.step));
  return Number(next.toFixed(settings.decimals));
}
