import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { EntityType } from '/@/enums/entityTypeEnum';
import { getLatestTimeseries, getTimeseries } from '/@/api/tb/telemetry';
import type { TemplateRuntimeDevices } from './templateAggregate';
import { mapAggregateSettled, runAggregateRequest } from './aggregateRequestCoordinator';

export type RuntimeDeviceItem = {
  id: string;
  name: string;
  type: string;
  active: boolean;
  raw: Record<string, unknown>;
};

export type UsagePoint = {
  ts: number;
  value: number;
};

export type UsageDeviceValue = {
  deviceId: string;
  deviceName: string;
  key: string;
  value: number;
};

export type UsageSummary = {
  today: number;
  yesterdaySameTime: number;
  changeRate: number | null;
  month: number;
  currentHour: number;
  topDevice: UsageDeviceValue | null;
  trend24h: UsagePoint[];
  trend7d: UsagePoint[];
  continuousDevices: UsageDeviceValue[];
  updatedAt: number;
};

export const DEFAULT_CUMULATIVE_KEYS = ['electricityConsumption', 'waterConsumption'];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const USAGE_CACHE_TTL_MS = 30000;
const MISSING_KEY_RECHECK_MS = 5 * 60 * 1000;

type UsageQueryDevice = { id: string; name: string };
type DeviceUsageSeries = { device: UsageQueryDevice; points: UsagePoint[] };
type UsageSummaryCacheEntry = {
  expiresAt: number;
  value?: UsageSummary;
  promise?: Promise<UsageSummary>;
};

const usageSummaryCache = new Map<string, UsageSummaryCacheEntry>();
const deviceKeySupportCache = new Map<string, { hasData: boolean; expiresAt: number }>();

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (['true', 'yes', 'online', 'on', 'active'].includes(normalized)) return true;
  if (['false', 'no', 'offline', 'off', 'inactive'].includes(normalized)) return false;
  return null;
}

export function isTbDeviceActive(device: Record<string, unknown>) {
  const platformActive = booleanValue(device.deviceActive);
  if (platformActive !== null) return platformActive;

  const fallbackActive = booleanValue(device.tbActive ?? device.platformActive);
  return fallbackActive === true;
}

export function getRuntimeDeviceName(deviceId: string, device: Record<string, unknown>) {
  return String(device.entityName || device.deviceName || device.name || device.cameraName || deviceId);
}

export function getRuntimeDeviceType(device: Record<string, unknown>) {
  const explicit = String(
    device.deviceType || device.tbDeviceType || device.deviceProfileName || device.type || '',
  ).trim();
  if (explicit) return explicit;
  if (device.cameraId || device.cameraCode || device.cameraName) return 'camera';
  return 'unknown';
}

export function listRuntimeDevices(devices?: TemplateRuntimeDevices | null): RuntimeDeviceItem[] {
  return Object.entries(devices || {}).map(([id, raw]) => ({
    id,
    name: getRuntimeDeviceName(id, raw),
    type: getRuntimeDeviceType(raw),
    active: isTbDeviceActive(raw),
    raw,
  }));
}

export function summarizeDevicesByPlatformState(devices?: TemplateRuntimeDevices | null) {
  const list = listRuntimeDevices(devices);
  const online = list.filter((device) => device.active).length;
  const total = list.length;
  return {
    total,
    online,
    offline: Math.max(0, total - online),
    onlineRate: total ? (online / total) * 100 : 0,
  };
}

export function groupDevicesByType(devices?: TemplateRuntimeDevices | null) {
  const groups = new Map<string, { type: string; total: number; online: number; offline: number }>();
  listRuntimeDevices(devices).forEach((device) => {
    const group = groups.get(device.type) || { type: device.type, total: 0, online: 0, offline: 0 };
    group.total += 1;
    if (device.active) group.online += 1;
    else group.offline += 1;
    groups.set(device.type, group);
  });
  return Array.from(groups.values()).sort(
    (left, right) => right.total - left.total || left.type.localeCompare(right.type),
  );
}

function extractPoints(response: unknown, key: string): UsagePoint[] {
  const source = (response as any)?.[key];
  const list = Array.isArray(source) ? source : Array.isArray(source?.data) ? source.data : [];
  return list
    .map((item: any) => ({
      ts: Number(item?.ts ?? item?.[0]),
      value: numberValue(item?.value ?? item?.[1]),
    }))
    .filter((item: any): item is UsagePoint => Number.isFinite(item.ts) && item.value !== null)
    .sort((left, right) => left.ts - right.ts);
}

async function fetchBoundaryValue(
  deviceId: string,
  key: string,
  startTs: number,
  endTs: number,
  orderBy: 'ASC' | 'DESC',
) {
  if (endTs <= startTs) return null;
  const response = await runAggregateRequest(() =>
    getTimeseries({
      entityType: EntityType.DEVICE,
      entityId: deviceId,
      keys: key,
      startTs,
      endTs,
      limit: 1,
      agg: 'NONE',
      orderBy,
      useStrictDataTypes: true,
    }),
  );
  const point = extractPoints(response, key)[0];
  return point?.value ?? null;
}

export async function fetchLatestNumericValue(deviceId: string, key: string) {
  const response = await runAggregateRequest(() =>
    getLatestTimeseries({ entityType: EntityType.DEVICE, id: deviceId } as any, key, true),
  );
  const point = extractPoints(response, key)[0];
  return point?.value ?? null;
}

export async function fetchCumulativeDeltaForDevice(deviceId: string, key: string, startTs: number, endTs: number) {
  const [startValue, endValue] = await Promise.all([
    fetchBoundaryValue(deviceId, key, startTs, endTs, 'ASC'),
    fetchBoundaryValue(deviceId, key, startTs, endTs, 'DESC'),
  ]);
  if (startValue === null || endValue === null) return null;
  return Math.max(0, endValue - startValue);
}

export async function fetchDevicePeriodValues(
  devices: Array<{ id: string; name: string }>,
  key: string,
  startTs: number,
  endTs: number,
  cumulative = true,
): Promise<UsageDeviceValue[]> {
  const results = await mapAggregateSettled(devices, async (device) => {
    const value = cumulative
      ? await fetchCumulativeDeltaForDevice(device.id, key, startTs, endTs)
      : await fetchLatestNumericValue(device.id, key);
    return value === null ? null : { deviceId: device.id, deviceName: device.name, key, value };
  });

  return results.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []));
}

function startOfDay(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfMonth(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfHour(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setMinutes(0, 0, 0);
  return date.getTime();
}

export function resolveTimeRange(range: string, now = Date.now()) {
  const todayStart = startOfDay(now);
  const elapsedToday = now - todayStart;
  if (range === 'currentHour') return { startTs: startOfHour(now), endTs: now };
  if (range === 'month') return { startTs: startOfMonth(now), endTs: now };
  if (range === 'last24h') return { startTs: now - DAY_MS, endTs: now };
  if (range === 'last7d') return { startTs: now - 7 * DAY_MS, endTs: now };
  if (range === 'yesterdaySameTime') {
    const yesterdayStart = todayStart - DAY_MS;
    return { startTs: yesterdayStart, endTs: yesterdayStart + elapsedToday };
  }
  return { startTs: todayStart, endTs: now };
}

export async function fetchUsageSummary(devices: UsageQueryDevice[], key: string): Promise<UsageSummary> {
  const normalizedKey = key.trim();
  const cacheKey = `${normalizedKey}::${devices
    .map((device) => device.id)
    .sort()
    .join(',')}`;
  const cached = usageSummaryCache.get(cacheKey);
  if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.promise) return cached.promise;

  const promise = buildUsageSummary(devices, normalizedKey)
    .then((value) => {
      usageSummaryCache.set(cacheKey, { value, expiresAt: Date.now() + USAGE_CACHE_TTL_MS });
      pruneUsageSummaryCache();
      return value;
    })
    .catch((error) => {
      usageSummaryCache.delete(cacheKey);
      throw error;
    });

  usageSummaryCache.set(cacheKey, { promise, expiresAt: 0 });
  return promise;
}

async function buildUsageSummary(devices: UsageQueryDevice[], key: string): Promise<UsageSummary> {
  const now = Date.now();
  const todayRange = resolveTimeRange('today', now);
  const yesterdayRange = resolveTimeRange('yesterdaySameTime', now);
  const monthRange = resolveTimeRange('month', now);
  const hourRange = resolveTimeRange('currentHour', now);
  const queryStart = Math.max(0, Math.min(monthRange.startTs, now - 8 * DAY_MS, yesterdayRange.startTs) - HOUR_MS);
  const limit = Math.ceil((now - queryStart) / HOUR_MS) + 4;
  const queryDevices = devices.filter((device) => {
    const support = deviceKeySupportCache.get(`${device.id}::${key}`);
    return !support || support.hasData || support.expiresAt <= now;
  });

  const results = await mapAggregateSettled(queryDevices, async (device) => {
    const response = await runAggregateRequest(() =>
      getTimeseries({
        entityType: EntityType.DEVICE,
        entityId: device.id,
        keys: key,
        startTs: queryStart,
        endTs: now,
        interval: HOUR_MS,
        limit,
        agg: 'MAX',
        orderBy: 'ASC',
        useStrictDataTypes: true,
      }),
    );
    return { device, points: extractPoints(response, key) } satisfies DeviceUsageSeries;
  });

  if (queryDevices.length && !results.some((result) => result.status === 'fulfilled')) {
    throw new Error('Unable to load resource usage telemetry');
  }

  results.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    deviceKeySupportCache.set(`${result.value.device.id}::${key}`, {
      hasData: result.value.points.length > 0,
      expiresAt: result.value.points.length ? Number.POSITIVE_INFINITY : now + MISSING_KEY_RECHECK_MS,
    });
  });

  const series = results.flatMap((result) =>
    result.status === 'fulfilled' && result.value.points.length ? [result.value] : [],
  );
  const todayValues = buildDeviceValues(series, key, todayRange.startTs, todayRange.endTs);
  const yesterdayValues = buildDeviceValues(series, key, yesterdayRange.startTs, yesterdayRange.endTs);
  const monthValues = buildDeviceValues(series, key, monthRange.startTs, monthRange.endTs);
  const hourValues = buildDeviceValues(series, key, hourRange.startTs, hourRange.endTs);
  const trend24h = buildUsageTrend(series, now - DAY_MS, now, HOUR_MS);
  const trend7d = buildUsageTrend(series, now - 7 * DAY_MS, now, DAY_MS);

  const today = sumValues(todayValues);
  const yesterdaySameTime = sumValues(yesterdayValues);
  const month = sumValues(monthValues);
  const currentHour = sumValues(hourValues);
  const topDevice = todayValues.slice().sort((left, right) => right.value - left.value)[0] || null;
  const continuousDevices = hourValues
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);

  return {
    today,
    yesterdaySameTime,
    changeRate: yesterdaySameTime > 0 ? ((today - yesterdaySameTime) / yesterdaySameTime) * 100 : null,
    month,
    currentHour,
    topDevice,
    trend24h,
    trend7d,
    continuousDevices,
    updatedAt: now,
  };
}

function buildDeviceValues(series: DeviceUsageSeries[], key: string, startTs: number, endTs: number) {
  return series.map(({ device, points }) => ({
    deviceId: device.id,
    deviceName: device.name,
    key,
    value: sumPositiveDeltas(points, startTs, endTs),
  }));
}

function sumPositiveDeltas(points: UsagePoint[], startTs: number, endTs: number) {
  let previous: UsagePoint | undefined;
  let total = 0;
  for (const point of points) {
    if (point.ts < startTs) {
      previous = point;
      continue;
    }
    if (point.ts > endTs) break;
    if (previous) total += Math.max(0, point.value - previous.value);
    previous = point;
  }
  return total;
}

function buildUsageTrend(series: DeviceUsageSeries[], startTs: number, endTs: number, bucketMs: number) {
  const buckets = new Map<number, number>();
  series.forEach(({ points }) => {
    let previous: UsagePoint | undefined;
    for (const point of points) {
      if (point.ts < startTs) {
        previous = point;
        continue;
      }
      if (point.ts > endTs) break;
      if (previous) {
        const bucket = bucketMs === DAY_MS ? startOfDay(point.ts) : Math.floor(point.ts / bucketMs) * bucketMs;
        buckets.set(bucket, (buckets.get(bucket) || 0) + Math.max(0, point.value - previous.value));
      }
      previous = point;
    }
  });
  return Array.from(buckets, ([ts, value]) => ({ ts, value })).sort((left, right) => left.ts - right.ts);
}

function pruneUsageSummaryCache() {
  if (usageSummaryCache.size <= 20) return;
  const entries = Array.from(usageSummaryCache.entries()).sort((left, right) => left[1].expiresAt - right[1].expiresAt);
  entries.slice(0, usageSummaryCache.size - 20).forEach(([key]) => usageSummaryCache.delete(key));
}
function sumValues(values: UsageDeviceValue[]) {
  return values.reduce((result, item) => result + item.value, 0);
}

export function formatUsageNumber(value: number | null | undefined, decimals = 1) {
  if (!Number.isFinite(Number(value))) return '-';
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(Number(value));
}

export function useUsageSummary(
  key: Ref<string>,
  devices: Ref<Array<{ id: string; name: string }>>,
  pollMs: Ref<number>,
) {
  const summary = ref<UsageSummary | null>(null);
  const loading = ref(false);
  const error = ref('');
  let timer: number | undefined;
  let running = false;
  let rerun = false;
  let stopped = false;
  const signature = computed(
    () =>
      `${key.value}::${devices.value
        .map((device) => device.id)
        .sort()
        .join(',')}`,
  );

  async function reload() {
    if (stopped) return;
    if (running) {
      rerun = true;
      return;
    }

    running = true;
    try {
      do {
        rerun = false;
        const currentKey = key.value.trim();
        const currentDevices = devices.value.slice();
        if (!currentKey || !currentDevices.length) {
          summary.value = null;
          error.value = '';
          continue;
        }

        loading.value = true;
        try {
          const nextSummary = await fetchUsageSummary(currentDevices, currentKey);
          if (stopped) return;
          summary.value = nextSummary;
          error.value = '';
        } catch (reason: any) {
          if (stopped) return;
          error.value = reason?.message || String(reason);
        }
      } while (rerun && !stopped);
    } finally {
      running = false;
      if (!stopped) loading.value = false;
    }
  }

  watch(signature, () => void reload(), { immediate: true });
  onMounted(() => {
    timer = window.setInterval(() => void reload(), Math.max(15000, Number(pollMs.value || 60000)));
  });
  onBeforeUnmount(() => {
    stopped = true;
    if (timer) window.clearInterval(timer);
  });

  return { summary, loading, error, reload };
}
