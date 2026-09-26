import type { NativeAdvancedControlMode, NativeAdvancedControlSettings } from './nativeWidgetTypes';

export const NATIVE_ADVANCED_CONTROL_FQNS: Record<string, NativeAdvancedControlMode> = {
  action_button: 'actionButton',
  'gpio_widgets.basic_gpio_control': 'gpioControl',
  'gpio_widgets.gpio_panel': 'gpioPanel',
  'control_widgets.persistent_table': 'persistentTable',
  'gpio_widgets.raspberry_pi_gpio_control': 'gpioControl',
  'gpio_widgets.raspberry_pi_gpio_panel': 'gpioPanel',
  'control_widgets.rpc_debug_terminal': 'rpcTerminal',
  'control_widgets.rpc_remote_shell': 'rpcShell',
  'gateway_widgets.service_rpc': 'serviceRpc',
  status_widget: 'status',
  two_segment_button: 'segment',
  'control_widgets.update_attributes': 'attributeUpdate',
};

export function nativeAdvancedControlMode(fqn: string) {
  return NATIVE_ADVANCED_CONTROL_FQNS[fqn] || null;
}

export function advancedControlNeedsDevice(mode: NativeAdvancedControlMode) {
  return !['actionButton', 'gpioPanel', 'segment'].includes(mode);
}

export function parseRpcParams(value: string): unknown {
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function parseTerminalCommand(command: string) {
  const text = command.trim();
  const index = text.indexOf(' ');
  const method = index < 0 ? text : text.slice(0, index);
  return { method, params: parseRpcParams(index < 0 ? '' : text.slice(index + 1)) };
}

export function gpioStates(raw: unknown, pins: NativeAdvancedControlSettings['pins']) {
  let body: any = raw;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return Object.fromEntries(pins.map((pin) => [pin.pin, body?.[pin.pin] === true || body?.[Number(pin.pin)] === true]));
}

export function parseAttributesJson(value: string) {
  const parsed = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('属性参数必须是 JSON 对象');
  return parsed as Record<string, unknown>;
}

export function safeActionUrl(value: string) {
  const target = value.trim();
  if (!target) return '';
  if (target.startsWith('/') || /^https:\/\//i.test(target)) return target;
  throw new Error('链接只支持站内路径或 HTTPS 地址');
}

export function serviceRpcMethod(method: string, isConnector: boolean) {
  const value = method.trim();
  if (isConnector || value.startsWith('gateway_')) return value;
  return `gateway_${value.toLowerCase()}`;
}

export function validateNativeAdvancedControlSettings(settings: NativeAdvancedControlSettings): string[] {
  const errors: string[] = [];
  if (!Object.values(NATIVE_ADVANCED_CONTROL_FQNS).includes(settings.mode)) errors.push('控制工具类型无效');
  if (!Number.isInteger(settings.requestTimeout) || settings.requestTimeout < 0 || settings.requestTimeout > 60000)
    errors.push('RPC 超时须为 0–60000 毫秒');
  if (!Number.isInteger(settings.pollingInterval) || settings.pollingInterval < 200 || settings.pollingInterval > 60000)
    errors.push('轮询间隔须为 200–60000 毫秒');
  if (
    ['rpcTerminal', 'rpcShell', 'serviceRpc'].includes(settings.mode) &&
    !settings.method.trim() &&
    settings.mode === 'serviceRpc'
  )
    errors.push('RPC 方法不能为空');
  if (settings.mode === 'serviceRpc' && settings.isConnector && settings.method.startsWith('gateway_'))
    errors.push('连接器 RPC 需要填写完整连接器方法，例如 mqtt_get');
  if (
    settings.mode === 'gpioControl' &&
    (!settings.readMethod.trim() || !settings.writeMethod.trim() || !settings.pins.length)
  )
    errors.push('GPIO 读取、写入方法和引脚不能为空');
  if (settings.mode === 'gpioPanel' && !settings.pins.length) errors.push('GPIO 面板至少需要一个引脚');
  if (!Number.isInteger(settings.pageSize) || settings.pageSize < 1 || settings.pageSize > 100)
    errors.push('分页大小须为 1–100');
  if (!Number.isInteger(settings.maxLines) || settings.maxLines < 10 || settings.maxLines > 1000)
    errors.push('终端行数须为 10–1000');
  if (settings.actionMode === 'url') {
    try {
      safeActionUrl(settings.actionTarget);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : '链接无效');
    }
  }
  if (settings.mode === 'attributeUpdate') {
    try {
      parseAttributesJson(settings.attributesJson);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : '属性参数无效');
    }
  }
  return errors;
}
