import { fetchAlarmPage } from './api';
import type { AlarmItem } from './types';

export interface FetchTenantAlarmRangeOptions {
  startTime: number;
  endTime: number;
  pageSize?: number;
  shouldStop?: () => boolean;
}

export async function fetchTenantAlarmsInRange(options: FetchTenantAlarmRangeOptions): Promise<AlarmItem[]> {
  const pageSize = Math.min(1000, Math.max(10, Number(options.pageSize) || 100));
  const alarms = new Map<string, AlarmItem>();
  let page = 0;
  let totalPages = 1;

  while (page < totalPages) {
    if (options.shouldStop?.()) return [];

    const result = await fetchAlarmPage({
      page,
      pageSize,
      sortProperty: 'createdTime',
      sortOrder: 'ASC',
      startTime: options.startTime,
      endTime: options.endTime,
      fetchMode: 'all',
    });

    if (options.shouldStop?.()) return [];

    result.data.forEach((alarm, index) => {
      const key = alarm.id || `${alarm.createdTime}-${alarm.type}-${alarm.originator?.id || ''}-${page}-${index}`;
      alarms.set(key, alarm);
    });

    totalPages = Math.max(page + 1, result.totalPages);
    page += 1;
  }

  return Array.from(alarms.values());
}
