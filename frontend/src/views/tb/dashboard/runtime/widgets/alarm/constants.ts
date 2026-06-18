import type { AlarmWidgetSettings } from './types';

export const DEFAULT_ALARM_SETTINGS: AlarmWidgetSettings = {
  pageSize: 10,
  showSearch: true,
  showPagination: true,
  showAck: true,
  showClear: true,
  showOriginator: true,
  showSeverity: true,
  showStatus: true,
  showType: true,
  showCreatedTime: true,
  dense: false,
  columns: ['name', 'type', 'severity', 'status', 'createdTime', 'originator', 'actions'],
  title: '报警表格',
  defaultStatusList: [],
  defaultSeverityList: [],
};

export const ALARM_STATUS_LABELS: Record<string, string> = {
  ACTIVE_UNACK: '活动未确认',
  ACTIVE_ACK: '活动已确认',
  CLEARED_UNACK: '已清除未确认',
  CLEARED_ACK: '已清除已确认',
};

export const ALARM_SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: '严重',
  MAJOR: '高',
  MINOR: '中',
  WARNING: '低',
  INDETERMINATE: '未定',
};

export const DEFAULT_STATUS_OPTIONS = [
  { label: '活动未确认', value: 'ACTIVE_UNACK' },
  { label: '活动已确认', value: 'ACTIVE_ACK' },
  { label: '已清除未确认', value: 'CLEARED_UNACK' },
  { label: '已清除已确认', value: 'CLEARED_ACK' },
];

export const DEFAULT_SEVERITY_OPTIONS = [
  { label: '严重', value: 'CRITICAL' },
  { label: '高', value: 'MAJOR' },
  { label: '中', value: 'MINOR' },
  { label: '低', value: 'WARNING' },
  { label: '未定', value: 'INDETERMINATE' },
];
