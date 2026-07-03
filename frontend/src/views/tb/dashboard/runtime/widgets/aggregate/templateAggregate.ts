import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { EntityType } from '/@/enums/entityTypeEnum';
import { getLatestTimeseries, getTimeseries } from '/@/api/tb/telemetry';
import { fetchAlarmPage } from '../alarm/api';
import type { AlarmItem } from '../alarm/types';

export type TemplateRuntimeDevices = Record<string, Record<string, unknown>>;

export type TemplateDeviceSummary = {
  total: number;
  online: number;
  offline: number;
  abnormal: number;
  unknown: number;
  onlineRate: number;
};

export type TemplateKeyStats = {
  sum: number;
  average: number;
  maximum: number;
  minimum: number;
  count: number;
  total: number;
  coverage: number;
};

export type TemplateAlarmSummary = {
  active: number;
  unacknowledged: number;
  severe: number;
  today: number;
};

export type AggregatePoint = { ts: number; value: number };

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || String(value).toLowerCase() === 'true') return true;
  if (value === 0 || value === '0' || String(value).toLowerCase() === 'false') return false;
  return undefined;
}

function isAbnormal(device: Record<string, unknown>) {
  const hasExplicitFault = [device.alarm, device.abnormal, device.fault].some((value) => booleanValue(value) === true);
  if (hasExplicitFault) return true;

  const abnormalStates = new Set([
    'critical',
    'major',
    'alarm',
    'active_alarm',
    'fault',
    'error',
    'abnormal',
    'failed',
    'failure',
    '严重',
    '报警',
    '异常',
    '故障',
  ]);
  return [device.alarmStatus, device.alarmLevel, device.healthStatus, device.faultStatus].some((value) =>
    abnormalStates.has(
      String(value || '')
        .trim()
        .toLowerCase(),
    ),
  );
}

export function summarizeTemplateDevices(devices?: TemplateRuntimeDevices | null): TemplateDeviceSummary {
  const list = Object.values(devices || {});
  let online = 0;
  let offline = 0;
  let unknown = 0;
  let abnormal = 0;

  list.forEach((device) => {
    const state = booleanValue(device.online ?? device.active);
    if (state === false) {
      offline += 1;
      return;
    }
    if (state === true) {
      online += 1;
      if (isAbnormal(device)) abnormal += 1;
      return;
    }
    unknown += 1;
  });

  return {
    total: list.length,
    online,
    offline,
    abnormal,
    unknown,
    onlineRate: list.length ? (online / list.length) * 100 : 0,
  };
}
export function calculateKeyStats(values: number[], total: number): TemplateKeyStats {
  const sum = values.reduce((result, value) => result + value, 0);
  return {
    sum,
    average: values.length ? sum / values.length : 0,
    maximum: values.length ? Math.max(...values) : 0,
    minimum: values.length ? Math.min(...values) : 0,
    count: values.length,
    total,
    coverage: total ? (values.length / total) * 100 : 0,
  };
}

function extractTelemetryValue(response: unknown, key: string): number | null {
  const source = (response as any)?.[key];
  const list = Array.isArray(source) ? source : Array.isArray(source?.data) ? source.data : [];
  return numberValue(list[0]?.value ?? list[0]?.[1] ?? source?.value);
}

function extractTelemetryPoints(response: unknown, key: string): AggregatePoint[] {
  const source = (response as any)?.[key];
  const list = Array.isArray(source) ? source : Array.isArray(source?.data) ? source.data : [];
  return list
    .map((item: any) => ({ ts: Number(item?.ts ?? item?.[0]), value: numberValue(item?.value ?? item?.[1]) }))
    .filter((item: any): item is AggregatePoint => Number.isFinite(item.ts) && item.value !== null);
}

function deviceSignature(devices: TemplateRuntimeDevices) {
  return Object.keys(devices).sort().join(',');
}

export function useTemplateKeySnapshot(key: Ref<string>, devices: Ref<TemplateRuntimeDevices>) {
  const values = ref<number[]>([]);
  const loading = ref(false);
  const error = ref('');
  const updatedAt = ref(0);
  let timer: number | undefined;
  let requestId = 0;
  const signature = computed(() => deviceSignature(devices.value));

  async function reload() {
    const currentKey = key.value.trim();
    const ids = Object.keys(devices.value);
    const currentRequest = ++requestId;
    if (!currentKey || !ids.length) {
      values.value = [];
      error.value = '';
      return;
    }

    loading.value = true;
    const results = await Promise.allSettled(
      ids.map((id) => getLatestTimeseries({ entityType: EntityType.DEVICE, id }, currentKey, true)),
    );
    if (currentRequest !== requestId) return;
    values.value = results.flatMap((result) => {
      if (result.status !== 'fulfilled') return [];
      const value = extractTelemetryValue(result.value, currentKey);
      return value === null ? [] : [value];
    });
    error.value = results.some((result) => result.status === 'fulfilled') ? '' : '暂时无法读取模板设备遥测';
    updatedAt.value = Date.now();
    loading.value = false;
  }

  watch([key, signature], reload, { immediate: true });
  onMounted(() => {
    timer = window.setInterval(reload, 15000);
  });
  onBeforeUnmount(() => {
    requestId += 1;
    if (timer) window.clearInterval(timer);
  });

  return { values, loading, error, updatedAt, reload };
}

export function useTemplateKeyTrend(key: Ref<string>, devices: Ref<TemplateRuntimeDevices>, timeWindowMs: Ref<number>) {
  const points = ref<AggregatePoint[]>([]);
  const loading = ref(false);
  const error = ref('');
  let timer: number | undefined;
  let requestId = 0;
  const signature = computed(() => deviceSignature(devices.value));

  async function reload() {
    const currentKey = key.value.trim();
    const ids = Object.keys(devices.value);
    const currentRequest = ++requestId;
    if (!currentKey || !ids.length) {
      points.value = [];
      error.value = '';
      return;
    }

    loading.value = true;
    const endTs = Date.now();
    const windowMs = Math.max(300000, Number(timeWindowMs.value || 3600000));
    const interval = Math.max(60000, Math.floor(windowMs / 48));
    const results = await Promise.allSettled(
      ids.map((entityId) =>
        getTimeseries({
          entityType: EntityType.DEVICE,
          entityId,
          keys: currentKey,
          startTs: endTs - windowMs,
          endTs,
          interval,
          limit: 500,
          agg: 'AVG',
          orderBy: 'ASC',
          useStrictDataTypes: true,
        }),
      ),
    );
    if (currentRequest !== requestId) return;

    const buckets = new Map<number, number>();
    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      extractTelemetryPoints(result.value, currentKey).forEach((point) => {
        const bucket = Math.floor(point.ts / interval) * interval;
        buckets.set(bucket, (buckets.get(bucket) || 0) + point.value);
      });
    });
    points.value = Array.from(buckets, ([ts, value]) => ({ ts, value })).sort((a, b) => a.ts - b.ts);
    error.value = results.some((result) => result.status === 'fulfilled') ? '' : '暂时无法读取模板设备历史遥测';
    loading.value = false;
  }

  watch([key, signature, timeWindowMs], reload, { immediate: true });
  onMounted(() => {
    timer = window.setInterval(reload, 60000);
  });
  onBeforeUnmount(() => {
    requestId += 1;
    if (timer) window.clearInterval(timer);
  });

  return { points, loading, error, reload };
}

export function useTemplateAlarmSummary(devices: Ref<TemplateRuntimeDevices>) {
  const summary = ref<TemplateAlarmSummary>({ active: 0, unacknowledged: 0, severe: 0, today: 0 });
  const loading = ref(false);
  const error = ref('');
  let timer: number | undefined;
  let requestId = 0;
  const signature = computed(() => deviceSignature(devices.value));

  async function reload() {
    const ids = new Set(Object.keys(devices.value));
    const currentRequest = ++requestId;
    if (!ids.size) {
      summary.value = { active: 0, unacknowledged: 0, severe: 0, today: 0 };
      return;
    }

    loading.value = true;
    try {
      const page = await fetchAlarmPage({ page: 0, pageSize: 1000, sortOrder: 'DESC' });
      if (currentRequest !== requestId) return;
      const rows = page.data.filter((item) => item.originator?.id && ids.has(item.originator.id));
      summary.value = summarizeAlarms(rows);
      error.value = '';
    } catch (reason: any) {
      if (currentRequest !== requestId) return;
      error.value = reason?.message || '暂时无法读取报警数据';
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }

  watch(signature, reload, { immediate: true });
  onMounted(() => {
    timer = window.setInterval(reload, 30000);
  });
  onBeforeUnmount(() => {
    requestId += 1;
    if (timer) window.clearInterval(timer);
  });

  return { summary, loading, error, reload };
}

function summarizeAlarms(rows: AlarmItem[]): TemplateAlarmSummary {
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const active = rows.filter((item) => String(item.status).startsWith('ACTIVE'));
  return {
    active: active.length,
    unacknowledged: active.filter((item) => String(item.status).endsWith('UNACK') || !item.ackTs).length,
    severe: active.filter((item) => ['CRITICAL', 'MAJOR'].includes(String(item.severity).toUpperCase())).length,
    today: rows.filter((item) => item.createdTime >= todayStart).length,
  };
}

export function formatAggregateNumber(value: number, decimals = 1) {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value);
}
