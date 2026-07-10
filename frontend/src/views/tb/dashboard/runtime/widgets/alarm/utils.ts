import { ALARM_SEVERITY_LABELS, ALARM_STATUS_LABELS } from './constants';
import type { AlarmItem } from './types';

export function formatAlarmTime(ts?: number) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

export function getAlarmStatusLabel(status?: string) {
  if (!status) return '-';
  return ALARM_STATUS_LABELS[status] || status;
}

export function getAlarmSeverityLabel(severity?: string) {
  if (!severity) return '-';
  return ALARM_SEVERITY_LABELS[severity] || severity;
}

export function canAckAlarm(item: AlarmItem) {
  if (!item) return false;
  if (item.ackTs) return false;
  return String(item.status).includes('UNACK');
}

export function canClearAlarm(item: AlarmItem) {
  if (!item) return false;
  if (item.clearTs) return false;
  return String(item.status).startsWith('ACTIVE');
}

export function normalizeId(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.id === 'string') return value.id;
    if (value.id && typeof value.id.id === 'string') return value.id.id;
    if (typeof value.entityId === 'string') return value.entityId;
  }
  return '';
}

export function safeArray<T = any>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}

export function ensureStringArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x)).filter(Boolean);
}

export function pickFirstDefined<T = any>(...values: T[]): T | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

const ALARM_DETAIL_TEXT_KEYS = ['message', 'description', 'detail', 'reason', 'content'];
const ALARM_DETAIL_VALUE_KEYS = ['currentValue', 'current', 'value', 'actualValue', 'latestValue'];
const ALARM_DETAIL_THRESHOLD_KEYS = ['threshold', 'limit', 'upperThreshold', 'lowerThreshold'];

function formatAlarmDetailValue(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function findAlarmDetailValue(details: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = formatAlarmDetailValue(details[key]);
    if (value) return value;
  }
  return '';
}

export function formatAlarmContent(item: AlarmItem) {
  const details = item.details || {};
  const text = findAlarmDetailValue(details, ALARM_DETAIL_TEXT_KEYS);
  if (text) return text;

  const currentValue = findAlarmDetailValue(details, ALARM_DETAIL_VALUE_KEYS);
  const threshold = findAlarmDetailValue(details, ALARM_DETAIL_THRESHOLD_KEYS);
  const summary: string[] = [];
  if (currentValue) summary.push(`\u5f53\u524d\u503c ${currentValue}`);
  if (threshold) summary.push(`\u9608\u503c ${threshold}`);
  if (summary.length) return summary.join('\uff0c');

  const fallback = Object.entries(details)
    .map(([key, value]) => {
      const formatted = formatAlarmDetailValue(value);
      return formatted ? `${key}: ${formatted}` : '';
    })
    .filter(Boolean)
    .slice(0, 2);

  return fallback.join('\uff1b') || item.name || item.type || '-';
}
