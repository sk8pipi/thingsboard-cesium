import type { AlarmItem, AlarmPage } from './types';
import { normalizeId } from './utils';

export function normalizeAlarm(raw: any): AlarmItem {
  return {
    id: normalizeId(raw?.id) || '',
    name: raw?.name || raw?.type || 'Alarm',
    type: raw?.type || '',
    severity: raw?.severity || 'INDETERMINATE',
    status: raw?.status || '',
    createdTime: Number(raw?.createdTime || 0),
    startTs: raw?.startTs,
    endTs: raw?.endTs,
    ackTs: raw?.ackTs,
    clearTs: raw?.clearTs,
    originator: {
      id: normalizeId(raw?.originatorId || raw?.originator) || '',
      entityType: raw?.originator?.entityType || raw?.originatorType || '',
      name: raw?.originatorName || '',
      label: raw?.originatorName || '',
    },
    details: raw?.details || {},
    raw,
  };
}

export function normalizeAlarmPage(res: any): AlarmPage {
  const data = Array.isArray(res?.data) ? res.data.map(normalizeAlarm) : [];

  return {
    data,
    totalPages: Number(res?.totalPages ?? 1),
    totalElements: Number(res?.totalElements ?? data.length),
    hasNext: Number(res?.page ?? 0) + 1 < Number(res?.totalPages ?? 1),
    hasPrev: Number(res?.page ?? 0) > 0,
  };
}
