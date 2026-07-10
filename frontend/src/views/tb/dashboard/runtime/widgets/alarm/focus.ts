import type { AlarmItem } from './types';
import { normalizeId } from './utils';

export interface AlarmFocusPayload {
  alarmId: string;
  alarmName: string;
  originatorId?: string;
  originatorType?: string;
  originatorName?: string;
  pointId?: string;
  longitude?: number;
  latitude?: number;
  height?: number;
  alarm: AlarmItem;
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function buildAlarmFocusPayload(item: AlarmItem): AlarmFocusPayload {
  const details = item.details || {};
  const raw = item.raw || {};
  const originatorId =
    normalizeId(item.originator?.id) ||
    normalizeId(raw?.originatorId) ||
    normalizeId(raw?.originator) ||
    normalizeId(details?.originatorId) ||
    normalizeId(details?.entityId);

  return {
    alarmId: item.id,
    alarmName: item.name,
    originatorId: originatorId || undefined,
    originatorType: item.originator?.entityType || raw?.originatorType || details?.entityType || undefined,
    originatorName: item.originator?.name || item.originator?.label || raw?.originatorName || undefined,
    pointId: String(firstDefined(details?.pointId, details?.mapPointId, raw?.pointId, raw?.mapPointId) || '') || undefined,
    longitude: toNumber(firstDefined(details?.longitude, details?.lng, details?.lon, raw?.longitude, raw?.lng, raw?.lon)),
    latitude: toNumber(firstDefined(details?.latitude, details?.lat, raw?.latitude, raw?.lat)),
    height: toNumber(firstDefined(details?.height, details?.altitude, raw?.height, raw?.altitude)),
    alarm: item,
  };
}

export function emitAlarmFocus(item: AlarmItem, ctx?: any) {
  const payload = buildAlarmFocusPayload(item);

  if (typeof ctx?.emit === 'function') {
    ctx.emit('alarm-focus', payload);
    return;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tb:alarm-focus', { detail: payload }));
  }
}
