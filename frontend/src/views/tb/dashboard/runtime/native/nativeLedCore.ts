import type { NativeLedSettings } from './nativeWidgetTypes';

export function nativeLedSpec(fqn: string): boolean {
  return fqn === 'control_widgets.led_indicator';
}

/** The bundled default is a truthiness conversion after JSON parsing. Arbitrary JS is never evaluated. */
export function nativeLedValue(raw: unknown): boolean {
  if (typeof raw === 'string') {
    try {
      return !!JSON.parse(raw);
    } catch {
      return !!raw;
    }
  }
  return !!raw;
}

export function validateNativeLedSettings(settings: NativeLedSettings): string[] {
  const errors: string[] = [];
  if (!settings.valueAttribute?.trim()) errors.push('LED 值字段不能为空');
  if (!['attribute', 'timeseries'].includes(settings.retrieveValueMethod)) errors.push('LED 数据类型无效');
  if (!['SERVER_SCOPE', 'SHARED_SCOPE', 'CLIENT_SCOPE'].includes(settings.attributeScope))
    errors.push('LED 属性范围无效');
  if (!/^#[0-9a-fA-F]{6}$/.test(settings.ledColor)) errors.push('LED 颜色应为六位十六进制色值');
  if (settings.performCheckStatus && !settings.checkStatusMethod?.trim()) errors.push('状态检查 RPC 方法不能为空');
  if (!Number.isInteger(settings.requestTimeout) || settings.requestTimeout < 0 || settings.requestTimeout > 60000)
    errors.push('RPC 超时须为 0–60000 毫秒');
  if (
    !Number.isInteger(settings.persistentPollingInterval) ||
    settings.persistentPollingInterval < 1000 ||
    settings.persistentPollingInterval > 60000
  )
    errors.push('持久 RPC 轮询间隔须为 1000–60000 毫秒');
  if (settings.parseValueFunction.replace(/\s+/g, ' ').trim() !== 'return data ? true : false;')
    errors.push('自定义 LED 解析脚本尚未安全适配，请使用原生默认解析逻辑');
  return errors;
}

export interface NativeLedRpcTransport {
  transient(deviceId: string, method: string, timeout: number): Promise<unknown>;
  persistent(deviceId: string, method: string, timeout: number): Promise<{ rpcId?: string } | unknown>;
  getPersisted(id: string): Promise<{ status: string; response?: unknown }>;
  delay(ms: number): Promise<void>;
}

/** Mirrors the original status gate, including persisted RPC polling when selected. */
export async function checkNativeLedStatus(
  deviceId: string,
  settings: NativeLedSettings,
  transport: NativeLedRpcTransport,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  if (!settings.performCheckStatus) return true;
  if (!deviceId || !settings.checkStatusMethod.trim()) throw new Error('状态检查目标或方法无效');
  if (!settings.requestPersistent)
    return !!(await transport.transient(deviceId, settings.checkStatusMethod, settings.requestTimeout));
  const sent = await transport.persistent(deviceId, settings.checkStatusMethod, settings.requestTimeout);
  const id = sent && typeof sent === 'object' && 'rpcId' in sent ? String(sent.rpcId || '') : '';
  if (!id) return !!sent;
  while (isCurrent()) {
    await transport.delay(settings.persistentPollingInterval);
    if (!isCurrent()) break;
    const result = await transport.getPersisted(id);
    if (['QUEUED', 'SENT', 'DELIVERED'].includes(result.status)) continue;
    if (result.status === 'SUCCESSFUL') return !!result.response;
    if (['TIMEOUT', 'EXPIRED', 'FAILED', 'DELETED'].includes(result.status)) throw new Error('持久 RPC 状态检查失败');
  }
  return false;
}
