import type { AlarmItem } from './types';

export const ALARM_TREND_SEVERITIES = ['CRITICAL', 'MAJOR', 'MINOR', 'WARNING', 'INDETERMINATE'] as const;

export type AlarmTrendSeverity = (typeof ALARM_TREND_SEVERITIES)[number];
export type AlarmTrendMode = 'sevenDays' | 'twentyFourHours';
export type AlarmTrendSeverityCounts = Record<AlarmTrendSeverity, number>;

export interface AlarmTrendBucket {
  key: string;
  startTs: number;
  endTs: number;
  label: string;
  total: number;
  /** Reserved for the future severity-stacked bar rendering. */
  severityCounts: AlarmTrendSeverityCounts;
}

export interface AlarmTrendRange {
  startTime: number;
  endTime: number;
  buckets: AlarmTrendBucket[];
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function createSeverityCounts(): AlarmTrendSeverityCounts {
  return {
    CRITICAL: 0,
    MAJOR: 0,
    MINOR: 0,
    WARNING: 0,
    INDETERMINATE: 0,
  };
}

function toSeverity(value: string): AlarmTrendSeverity {
  return ALARM_TREND_SEVERITIES.includes(value as AlarmTrendSeverity) ? (value as AlarmTrendSeverity) : 'INDETERMINATE';
}

function createDayBucket(now: Date, dayOffset: number): AlarmTrendBucket {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    key: `day-${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    startTs: start.getTime(),
    endTs: end.getTime(),
    label: `${pad(start.getMonth() + 1)}/${pad(start.getDate())}`,
    total: 0,
    severityCounts: createSeverityCounts(),
  };
}

function createHourBucket(now: Date, hourOffset: number): AlarmTrendBucket {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + hourOffset);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  return {
    key: `hour-${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}-${pad(start.getHours())}`,
    startTs: start.getTime(),
    endTs: end.getTime(),
    label: `${pad(start.getHours())}:00`,
    total: 0,
    severityCounts: createSeverityCounts(),
  };
}

export function createAlarmTrendRange(mode: AlarmTrendMode, nowTimestamp = Date.now()): AlarmTrendRange {
  const now = new Date(nowTimestamp);
  const buckets =
    mode === 'sevenDays'
      ? Array.from({ length: 7 }, (_, index) => createDayBucket(now, index - 6))
      : Array.from({ length: 24 }, (_, index) => createHourBucket(now, index - 23));

  return {
    startTime: buckets[0]?.startTs ?? nowTimestamp,
    endTime: nowTimestamp,
    buckets,
  };
}

export function aggregateAlarmTrend(
  alarms: AlarmItem[],
  mode: AlarmTrendMode,
  nowTimestamp = Date.now(),
): AlarmTrendBucket[] {
  const range = createAlarmTrendRange(mode, nowTimestamp);
  const seenAlarmIds = new Set<string>();

  alarms.forEach((alarm, index) => {
    const createdTime = Number(alarm.createdTime);
    if (!Number.isFinite(createdTime) || createdTime < range.startTime || createdTime > range.endTime) return;

    const fingerprint = alarm.id || `${createdTime}-${alarm.type}-${alarm.originator?.id || ''}-${index}`;
    if (seenAlarmIds.has(fingerprint)) return;
    seenAlarmIds.add(fingerprint);

    const bucket = range.buckets.find((item) => createdTime >= item.startTs && createdTime < item.endTs);
    if (!bucket) return;

    bucket.total += 1;
    bucket.severityCounts[toSeverity(alarm.severity)] += 1;
  });

  return range.buckets;
}
