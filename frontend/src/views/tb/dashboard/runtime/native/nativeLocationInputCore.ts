import type { NativeLocationSettings } from './nativeWidgetTypes';

export interface NativeLocationSpec {
  mode: 'attribute' | 'timeseries';
  scope?: 'SERVER_SCOPE' | 'SHARED_SCOPE';
}

/** Only the three bundled location forms may write coordinates. */
export function nativeLocationSpec(fqn: string): NativeLocationSpec | null {
  if (fqn === 'input_widgets.update_location_timeseries') return { mode: 'timeseries' };
  if (fqn === 'input_widgets.update_server_location_attribute') return { mode: 'attribute', scope: 'SERVER_SCOPE' };
  if (fqn === 'input_widgets.update_shared_location_attribute') return { mode: 'attribute', scope: 'SHARED_SCOPE' };
  return null;
}

export function parseNativeCoordinate(raw: string, axis: 'lat' | 'lng', required: boolean): number | null {
  const text = raw.trim();
  if (!text) {
    if (required) throw new Error(axis === 'lat' ? '请输入纬度' : '请输入经度');
    return null;
  }
  const value = Number(text);
  const limit = axis === 'lat' ? 90 : 180;
  if (!Number.isFinite(value) || value < -limit || value > limit)
    throw new Error(axis === 'lat' ? '纬度须在 -90 至 90 之间' : '经度须在 -180 至 180 之间');
  return value;
}

export function locationKeysValid(settings: NativeLocationSettings): boolean {
  return !!settings.latKeyName?.trim() && !!settings.lngKeyName?.trim() && settings.latKeyName !== settings.lngKeyName;
}

export interface NativeLocationTransport {
  writeAttributes(scope: 'SERVER_SCOPE' | 'SHARED_SCOPE', data: Record<string, unknown>): Promise<unknown>;
  writeTelemetry(data: Record<string, unknown>): Promise<unknown>;
  readAttributes(scope: 'SERVER_SCOPE' | 'SHARED_SCOPE', keys: string[]): Promise<Record<string, unknown>>;
  readTelemetry(keys: string[]): Promise<Record<string, unknown>>;
}

/** Coordinates are one write so the dashboard never reports half a saved pair. */
export async function writeAndReadNativeLocation(
  spec: NativeLocationSpec,
  settings: NativeLocationSettings,
  latitude: number | null,
  longitude: number | null,
  transport: NativeLocationTransport,
): Promise<Record<string, unknown>> {
  if (!locationKeysValid(settings)) throw new Error('经纬度字段键必须不同且不能为空');
  const keys = [settings.latKeyName, settings.lngKeyName];
  const data = { [keys[0]]: latitude, [keys[1]]: longitude };
  if (spec.mode === 'timeseries') {
    await transport.writeTelemetry(data);
    return transport.readTelemetry(keys);
  }
  if (spec.scope !== 'SERVER_SCOPE' && spec.scope !== 'SHARED_SCOPE') throw new Error('属性范围无效');
  await transport.writeAttributes(spec.scope, data);
  return transport.readAttributes(spec.scope, keys);
}
