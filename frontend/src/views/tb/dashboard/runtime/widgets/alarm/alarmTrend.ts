export const ALARM_TREND_SEVERITIES = ['CRITICAL', 'MAJOR', 'MINOR', 'WARNING', 'INDETERMINATE'] as const;
export const ALARM_TREND_TIME_ZONE = 'Asia/Shanghai';
export type AlarmTrendSeverity = (typeof ALARM_TREND_SEVERITIES)[number];
export type AlarmTrendMode = 'sevenDays' | 'twentyFourHours';
export type AlarmTrendSeverityCounts = Record<AlarmTrendSeverity, number>;
export interface AlarmTrendBucket {
  key: string;
  startTs: number;
  endTs: number;
  label: string;
  total: number;
  severityCounts: AlarmTrendSeverityCounts;
}
export interface AlarmTrendRange {
  startTime: number;
  endTime: number;
  buckets: AlarmTrendBucket[];
}
export interface AlarmTrendResponse extends AlarmTrendRange {
  mode: AlarmTrendMode;
  timeZone: typeof ALARM_TREND_TIME_ZONE;
  generatedAt: number;
  completeFrom: number;
  historicalDataIncomplete: boolean;
}
function timeParts(timestamp: number) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ALARM_TREND_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}
export function formatAlarmTrendDate(timestamp: number) {
  const date = timeParts(timestamp);
  return date.year + '-' + date.month + '-' + date.day + ' ' + date.hour + ':' + date.minute + ':' + date.second;
}
export function formatAlarmTrendBucketLabel(bucket: AlarmTrendBucket, mode: AlarmTrendMode) {
  const start = formatAlarmTrendDate(bucket.startTs);
  return mode === 'sevenDays' ? start.slice(0, 10) : start.slice(0, 16) + '–' + timeParts(bucket.endTs).hour + ':00';
}
export function createAlarmTrendRange(mode: AlarmTrendMode, nowTimestamp = Date.now()): AlarmTrendRange {
  const daily = mode === 'sevenDays';
  const size = daily ? 86_400_000 : 3_600_000;
  const count = daily ? 7 : 24;
  const date = timeParts(nowTimestamp);
  const currentStart = Date.parse(
    date.year + '-' + date.month + '-' + date.day + 'T' + (daily ? '00' : date.hour) + ':00:00+08:00',
  );
  const startTime = currentStart - (count - 1) * size;
  return {
    startTime,
    endTime: nowTimestamp,
    buckets: Array.from({ length: count }, (_, index) => {
      const startTs = startTime + index * size;
      const parts = timeParts(startTs);
      return {
        key: (daily ? 'day-' : 'hour-') + startTs,
        startTs,
        endTs: startTs + size,
        label: daily ? parts.month + '/' + parts.day : parts.hour + ':00',
        total: 0,
        severityCounts: { CRITICAL: 0, MAJOR: 0, MINOR: 0, WARNING: 0, INDETERMINATE: 0 },
      };
    }),
  };
}
// Missing or malformed statistics must never be displayed as zero.
export function parseAlarmTrendResponse(value: unknown, mode: AlarmTrendMode): AlarmTrendResponse {
  const data = value as AlarmTrendResponse;
  const size = mode === 'sevenDays' ? 86_400_000 : 3_600_000;
  if (
    !data ||
    data.mode !== mode ||
    data.timeZone !== ALARM_TREND_TIME_ZONE ||
    !Number.isSafeInteger(data.generatedAt) ||
    !Number.isSafeInteger(data.startTime) ||
    !Number.isSafeInteger(data.endTime) ||
    !Number.isSafeInteger(data.completeFrom) ||
    data.endTime < data.startTime ||
    typeof data.historicalDataIncomplete !== 'boolean' ||
    !Array.isArray(data.buckets) ||
    data.buckets.length !== (mode === 'sevenDays' ? 7 : 24)
  )
    throw new Error('报警趋势统计响应不完整');
  data.buckets.forEach((bucket, index) => {
    if (
      !bucket ||
      typeof bucket.key !== 'string' ||
      typeof bucket.label !== 'string' ||
      bucket.startTs !== data.startTime + index * size ||
      bucket.endTs !== bucket.startTs + size ||
      !Number.isSafeInteger(bucket.total) ||
      bucket.total < 0 ||
      !bucket.severityCounts ||
      ALARM_TREND_SEVERITIES.some(
        (severity) => !Number.isSafeInteger(bucket.severityCounts[severity]) || bucket.severityCounts[severity] < 0,
      ) ||
      ALARM_TREND_SEVERITIES.reduce((sum, severity) => sum + bucket.severityCounts[severity], 0) !== bucket.total
    )
      throw new Error('报警趋势分组数据无效');
  });
  return data;
}
