import { DEFAULT_ALARM_SETTINGS } from './constants';
import type { AlarmWidgetSettings } from './types';
import { ensureStringArray } from './utils';

export function parseAlarmSettings(raw: any): AlarmWidgetSettings {
  const s = raw || {};

  const columns = Array.isArray(s.columns)
    ? s.columns
    : Array.isArray(s.displayColumns)
      ? s.displayColumns
      : DEFAULT_ALARM_SETTINGS.columns;

  return {
    pageSize: toPositiveNumber(s.pageSize, DEFAULT_ALARM_SETTINGS.pageSize),
    showSearch: toBoolean(s.showSearch, DEFAULT_ALARM_SETTINGS.showSearch),
    showPagination: toBoolean(s.showPagination, DEFAULT_ALARM_SETTINGS.showPagination),
    showAck: toBoolean(s.showAck, DEFAULT_ALARM_SETTINGS.showAck),
    showClear: toBoolean(s.showClear, DEFAULT_ALARM_SETTINGS.showClear),
    showOriginator: toBoolean(s.showOriginator, DEFAULT_ALARM_SETTINGS.showOriginator),
    showSeverity: toBoolean(s.showSeverity, DEFAULT_ALARM_SETTINGS.showSeverity),
    showStatus: toBoolean(s.showStatus, DEFAULT_ALARM_SETTINGS.showStatus),
    showType: toBoolean(s.showType, DEFAULT_ALARM_SETTINGS.showType),
    showCreatedTime: toBoolean(s.showCreatedTime, DEFAULT_ALARM_SETTINGS.showCreatedTime),
    dense: toBoolean(s.dense, DEFAULT_ALARM_SETTINGS.dense),
    columns: Array.isArray(columns) ? columns.map(String) : DEFAULT_ALARM_SETTINGS.columns,
    title: typeof s.title === 'string' && s.title ? s.title : DEFAULT_ALARM_SETTINGS.title,
    defaultStatusList: ensureStringArray(s.defaultStatusList),
    defaultSeverityList: ensureStringArray(s.defaultSeverityList),
  };
}

function toBoolean(value: any, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function toPositiveNumber(value: any, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}
