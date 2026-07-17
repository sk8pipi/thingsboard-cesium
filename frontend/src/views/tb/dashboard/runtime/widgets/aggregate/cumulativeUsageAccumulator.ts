import type { UsageDeviceReading, UsageDeviceValue, UsagePoint, UsageSummary } from './resourceUsage';
import type { LatestTelemetryValue } from './aggregateMetricTypes';

export type UsageTrendMode = 'sevenDays' | 'twentyFourHours';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function startOfHour(timestamp: number) {
  const date = new Date(timestamp);
  date.setMinutes(0, 0, 0);
  return date.getTime();
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfMonth(timestamp: number) {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function cloneDeviceValue(value: UsageDeviceValue): UsageDeviceValue {
  return { ...value };
}

export function cloneUsageSummary(summary: UsageSummary): UsageSummary {
  return {
    ...summary,
    topDevice: summary.topDevice ? cloneDeviceValue(summary.topDevice) : null,
    trend24h: summary.trend24h.map((point) => ({ ...point })),
    trend7d: summary.trend7d.map((point) => ({ ...point })),
    continuousDevices: summary.continuousDevices.map(cloneDeviceValue),
    deviceTodayValues: summary.deviceTodayValues.map(cloneDeviceValue),
    latestDeviceReadings: summary.latestDeviceReadings.map((reading) => ({ ...reading })),
  };
}

export function normalizeUsageTrend(points: UsagePoint[], mode: UsageTrendMode, now = Date.now()): UsagePoint[] {
  const currentBucket = mode === 'sevenDays' ? startOfDay(now) : startOfHour(now);
  const bucketMs = mode === 'sevenDays' ? DAY_MS : HOUR_MS;
  const bucketCount = mode === 'sevenDays' ? 7 : 24;
  const firstBucket = currentBucket - (bucketCount - 1) * bucketMs;
  const values = new Map<number, number>();

  points.forEach((point) => {
    const bucket = mode === 'sevenDays' ? startOfDay(point.ts) : startOfHour(point.ts);
    if (bucket < firstBucket || bucket > currentBucket) return;
    values.set(bucket, Math.max(0, Number(point.value) || 0));
  });

  return Array.from({ length: bucketCount }, (_, index) => {
    const ts = firstBucket + index * bucketMs;
    return { ts, value: values.get(ts) || 0 };
  });
}

export class CumulativeUsageAccumulator {
  private readonly latestReadings = new Map<string, UsageDeviceReading>();
  private readonly todayValues = new Map<string, UsageDeviceValue>();
  private summary: UsageSummary;
  private hourBucket: number;
  private dayBucket: number;
  private monthBucket: number;

  constructor(summary: UsageSummary) {
    this.summary = cloneUsageSummary(summary);
    summary.latestDeviceReadings.forEach((reading) => this.latestReadings.set(reading.deviceId, { ...reading }));
    summary.deviceTodayValues.forEach((value) => this.todayValues.set(value.deviceId, { ...value }));
    this.hourBucket = startOfHour(summary.updatedAt);
    this.dayBucket = startOfDay(summary.updatedAt);
    this.monthBucket = startOfMonth(summary.updatedAt);
    this.summary.trend24h = normalizeUsageTrend(this.summary.trend24h, 'twentyFourHours', summary.updatedAt);
    this.summary.trend7d = normalizeUsageTrend(this.summary.trend7d, 'sevenDays', summary.updatedAt);
  }

  applyLatest(device: { id: string; name: string }, key: string, latest: LatestTelemetryValue) {
    const value = finiteNumber(latest.value);
    if (value === null || !Number.isFinite(latest.ts)) return false;
    const previous = this.latestReadings.get(device.id);
    if (previous && previous.ts > latest.ts) return false;
    if (previous && previous.ts === latest.ts && previous.value === value) return false;

    this.advanceTo(latest.ts);
    this.latestReadings.set(device.id, {
      deviceId: device.id,
      deviceName: device.name,
      key,
      ts: latest.ts,
      value,
    });

    if (!previous) {
      this.summary.updatedAt = Math.max(this.summary.updatedAt, latest.ts);
      return true;
    }

    const delta = Math.max(0, value - previous.value);
    if (delta > 0) {
      this.summary.today += delta;
      this.summary.month += delta;
      this.summary.currentHour += delta;
      this.addTrendValue(this.summary.trend24h, startOfHour(latest.ts), delta);
      this.addTrendValue(this.summary.trend7d, startOfDay(latest.ts), delta);

      const deviceValue = this.todayValues.get(device.id) || {
        deviceId: device.id,
        deviceName: device.name,
        key,
        value: 0,
      };
      deviceValue.deviceName = device.name;
      deviceValue.value += delta;
      this.todayValues.set(device.id, deviceValue);
      if (!this.summary.topDevice || deviceValue.value > this.summary.topDevice.value) {
        this.summary.topDevice = { ...deviceValue };
      }
      this.summary.changeRate =
        this.summary.yesterdaySameTime > 0
          ? ((this.summary.today - this.summary.yesterdaySameTime) / this.summary.yesterdaySameTime) * 100
          : null;
    }

    this.summary.updatedAt = Math.max(this.summary.updatedAt, latest.ts);
    return true;
  }

  advanceTo(now = Date.now()) {
    const nextHour = startOfHour(now);
    const nextDay = startOfDay(now);
    const nextMonth = startOfMonth(now);
    let changed = false;

    if (nextHour !== this.hourBucket) {
      this.hourBucket = nextHour;
      this.summary.currentHour = 0;
      this.summary.trend24h = normalizeUsageTrend(this.summary.trend24h, 'twentyFourHours', now);
      changed = true;
    }

    if (nextDay !== this.dayBucket) {
      this.dayBucket = nextDay;
      this.summary.today = 0;
      this.summary.topDevice = null;
      this.todayValues.clear();
      this.summary.trend7d = normalizeUsageTrend(this.summary.trend7d, 'sevenDays', now);
      this.summary.changeRate =
        this.summary.yesterdaySameTime > 0
          ? ((this.summary.today - this.summary.yesterdaySameTime) / this.summary.yesterdaySameTime) * 100
          : null;
      changed = true;
    }

    if (nextMonth !== this.monthBucket) {
      this.monthBucket = nextMonth;
      this.summary.month = 0;
      changed = true;
    }

    if (changed) this.summary.updatedAt = Math.max(this.summary.updatedAt, now);
    return changed;
  }

  snapshot() {
    const snapshot = cloneUsageSummary(this.summary);
    snapshot.deviceTodayValues = Array.from(this.todayValues.values(), cloneDeviceValue);
    snapshot.latestDeviceReadings = Array.from(this.latestReadings.values(), (reading) => ({ ...reading }));
    return snapshot;
  }

  private addTrendValue(points: UsagePoint[], bucket: number, delta: number) {
    const point = points.find((item) => item.ts === bucket);
    if (point) point.value += delta;
    else points.push({ ts: bucket, value: delta });
  }
}
