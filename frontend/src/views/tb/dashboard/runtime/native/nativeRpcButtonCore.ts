import type { NativeRpcButtonSettings } from './nativeWidgetTypes';

export function rpcButtonRequest(settings: NativeRpcButtonSettings) {
  const method = settings.methodName?.trim();
  if (!method) throw new Error('请输入 RPC 方法名');
  if (!Number.isInteger(settings.requestTimeout) || settings.requestTimeout < 0 || settings.requestTimeout > 60000)
    throw new Error('RPC 超时应为 0–60000 毫秒');
  let params: unknown = settings.methodParams;
  if (settings.methodParams?.length) {
    try {
      params = JSON.parse(settings.methodParams);
    } catch {
      // ThingsBoard's original widget sends non-JSON params as plain text.
    }
  }
  return { method, params, timeout: settings.requestTimeout };
}

export function validateRpcButtonSettings(settings: NativeRpcButtonSettings): string[] {
  if (!settings?.buttonText?.trim()) return ['请输入按钮文字'];
  if (typeof settings.oneWayElseTwoWay !== 'boolean') return ['RPC 调用类型无效'];
  try {
    rpcButtonRequest(settings);
  } catch (error) {
    return [error instanceof Error ? error.message : 'RPC 配置无效'];
  }
  return [];
}
