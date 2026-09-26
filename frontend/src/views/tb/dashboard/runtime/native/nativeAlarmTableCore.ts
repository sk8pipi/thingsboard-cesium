import { nativeWindow } from './nativeWidgetDataCore';
import type { NativeAlarmTableSettings, NativeOptions } from './nativeWidgetTypes';
import type { AlarmQuery } from '../widgets/alarm/types';

export function nativeAlarmTableQuery(
  settings: NativeAlarmTableSettings,
  options: NativeOptions,
  page: number,
  searchText: string,
  status: string,
  severity: string,
  now = Date.now(),
): AlarmQuery {
  const window = settings.useTimeWindow ? nativeWindow(options, now) : null;
  return {
    page,
    pageSize: settings.displayPagination ? settings.defaultPageSize : 100,
    searchText: settings.enableSearch ? searchText.trim() : '',
    sortProperty: 'createdTime',
    sortOrder: settings.defaultSortOrder,
    statusList: settings.enableFilter && status ? [status] : settings.statusList,
    severityList: settings.enableFilter && severity ? [severity] : settings.severityList,
    ...(window ? { startTime: window.startTs, endTime: window.endTs } : {}),
    ...(settings.singleEntityId ? { entityType: 'DEVICE', entityId: settings.singleEntityId } : {}),
  };
}
