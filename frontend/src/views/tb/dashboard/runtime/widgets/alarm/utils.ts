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

const ALARM_DETAIL_MESSAGE_KEYS = ['message', 'alarmMessage', 'description', 'detail', 'reason', 'content'];

function stringifyAlarmDetail(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '';

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatRuleChainDetails(details: unknown) {
  if (typeof details === 'string') return details.trim();
  if (!details || typeof details !== 'object') return '';

  if (!Array.isArray(details)) {
    const record = details as Record<string, unknown>;
    for (const key of ALARM_DETAIL_MESSAGE_KEYS) {
      const message = stringifyAlarmDetail(record[key]);
      if (message) return message;
    }

    return Object.entries(record)
      .map(([key, value]) => {
        const formatted = stringifyAlarmDetail(value);
        return formatted ? `${key}: ${formatted}` : '';
      })
      .filter(Boolean)
      .join('\uff1b');
  }

  return stringifyAlarmDetail(details);
}

export function formatAlarmContent(item: AlarmItem) {
  const ruleChainDetails = item.raw?.details ?? item.details;
  return formatRuleChainDetails(ruleChainDetails) || item.name || item.type || '-';
}
