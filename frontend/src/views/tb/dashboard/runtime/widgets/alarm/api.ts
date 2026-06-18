import {
  getAlarmInfoList,
  getAlarmInfoByEntity,
  ackAlarm as tbAckAlarm,
  clearAlarm as tbClearAlarm,
} from '/@/api/tb/alarm';
import type { AlarmPage, AlarmQuery } from './types';
import { normalizeAlarmPage } from './transform';

function buildAlarmParams(query: AlarmQuery) {
  return {
    page: query.page ?? 0,
    pageSize: query.pageSize ?? 10,
    sortProperty: query.sortProperty || 'createdTime',
    sortOrder: query.sortOrder || 'DESC',
    textSearch: query.searchText || '',
    startTime: query.startTime ?? null,
    endTime: query.endTime ?? null,
    severityList: Array.isArray(query.severityList) && query.severityList.length ? query.severityList.join(',') : null,
    statusList: Array.isArray(query.statusList) && query.statusList.length ? query.statusList.join(',') : null,
  };
}

export async function fetchAlarmPage(query: AlarmQuery): Promise<AlarmPage> {
  const params = buildAlarmParams(query);

  let res: any;

  if (query.entityType && query.entityId) {
    res = await getAlarmInfoByEntity(params, query.entityType, query.entityId);
  } else {
    res = await getAlarmInfoList(params);
  }

  return normalizeAlarmPage(res as any);
}

export async function ackAlarm(alarmId: string) {
  return tbAckAlarm(alarmId);
}

export async function clearAlarm(alarmId: string) {
  return tbClearAlarm(alarmId);
}
