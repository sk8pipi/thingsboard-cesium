import { loadLiquidSettings } from './nativeLiquidCore';
import { withNativeSettings } from './nativeWidgetSettings';
import type { NativeOptions, NativeSource } from './nativeWidgetTypes';
import { loadNativeAggregateSlots, type NativeAggregateResult } from './nativeAggregateCore';

export const MAX_NATIVE_POINTS = 2000;
type Scope = 'CLIENT_SCOPE' | 'SERVER_SCOPE' | 'SHARED_SCOPE';
export interface NativePoint {
  ts: number;
  value: unknown;
}
export interface NativeSeries {
  id: string;
  entityId: string;
  label: string;
  key: NativeSource['dataKeys'][number];
  latest: NativePoint | null;
  points: NativePoint[];
  previous?: NativePoint | null;
  historyFailed?: boolean;
  error?: string;
  truncated: boolean;
}
export interface NativeSnapshot {
  liquid?: Awaited<ReturnType<typeof loadLiquidSettings>>;
  aggregate?: NativeAggregateResult[];
  series: NativeSeries[];
  updatedAt: number;
  errors: string[];
  loading: boolean;
}
export interface NativeDataConfig {
  native: NativeOptions;
  datasources: NativeSource[];
}
export interface NativeHistoryQuery {
  entityType: 'DEVICE' | 'ASSET';
  entityId: string;
  keys: string;
  startTs: number;
  endTs: number;
  interval: number;
  agg: NativeOptions['window']['aggregation'];
  limit: number;
  orderBy: 'DESC';
  useStrictDataTypes?: boolean;
}
export interface NativeDataApi {
  latest: (source: NativeSource, keys: string) => Promise<unknown>;
  attributes: (source: NativeSource, scope: Scope, keys: string) => Promise<unknown>;
  history: (query: NativeHistoryQuery) => Promise<unknown>;
}

export function nativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatNativeValue(value: unknown, decimals = 2, units = ''): string {
  if (value == null || value === '') return '—';
  const number = nativeNumber(value);
  const text = number === null ? String(value) : number.toFixed(Math.max(0, Math.min(10, Math.round(decimals || 0))));
  return units ? `${text} ${units}` : text;
}

export function nativeThresholdColor(value: unknown, options: NativeOptions, fallback = '#6ce9ff'): string {
  const number = nativeNumber(value);
  if (number === null) return fallback;
  return (
    options.thresholds?.find((threshold) =>
      threshold.from != null && threshold.from === threshold.to
        ? number === threshold.from
        : (threshold.from == null || number >= threshold.from) && (threshold.to == null || number < threshold.to),
    )?.color || fallback
  );
}

export function nativeWindow(options: NativeOptions, now: number): { startTs: number; endTs: number } {
  if (!options.window.realtime && options.window.calendar) {
    const date = new Date(now);
    let startTs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    if (options.window.calendar === 'month') startTs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    else if (options.window.calendar === 'week') startTs -= ((date.getUTCDay() + 6) % 7) * 86400000;
    else if (options.window.calendar !== 'day') throw new Error('日历窗口无效');
    if (!Number.isFinite(startTs) || startTs < 0) throw new Error('时间窗口无效');
    // The API requires a positive interval, also on the first millisecond of a calendar period.
    return { startTs, endTs: Math.max(now, startTs + 1) };
  }
  const endTs = options.window.realtime ? now : Number(options.window.endTs);
  const startTs = options.window.realtime ? endTs - Number(options.window.durationMs) : Number(options.window.startTs);
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs < 0 || endTs <= startTs) {
    throw new Error('时间窗口无效');
  }
  return { startTs, endTs };
}

function pointsFromResponse(response: unknown, key: string): NativePoint[] {
  const value = (response as any)?.[key];
  const points = Array.isArray(value) ? value : value?.data;
  if (!Array.isArray(points)) return [];
  const result = new Map<number, NativePoint>();
  for (const point of points) {
    const ts = Number(point?.ts);
    if (Number.isFinite(ts) && point && 'value' in point) result.set(ts, { ts, value: point.value });
  }
  return [...result.values()].sort((a, b) => a.ts - b.ts);
}

/** One client can be shared by previews and mounted widgets; only in-flight reads are cached. */
export function createNativeDataClient(api: NativeDataApi, concurrency = 6) {
  const pending = new Map<string, Promise<unknown>>();
  const queue: (() => void)[] = [];
  const maximum = Math.max(1, Math.floor(concurrency) || 1);
  let active = 0;
  function request(key: string, read: () => Promise<unknown>): Promise<unknown> {
    const existing = pending.get(key);
    if (existing) return existing;
    const promise = new Promise<unknown>((resolve, reject) => {
      const run = () => {
        active++;
        Promise.resolve()
          .then(read)
          .then(resolve, reject)
          .finally(() => {
            active--;
            queue.shift()?.();
          });
      };
      if (active < maximum) run();
      else queue.push(run);
    });
    pending.set(key, promise);
    const clear = () => {
      if (pending.get(key) === promise) pending.delete(key);
    };
    promise.then(clear, clear);
    return promise;
  }

  async function load(config: NativeDataConfig, now = Date.now()): Promise<NativeSnapshot> {
    if (
      !Array.isArray(config.datasources) ||
      config.datasources.length > 8 ||
      config.datasources.some((ds) => !ds || !Array.isArray(ds.dataKeys) || ds.dataKeys.some((key) => !key)) ||
      config.datasources.reduce((total, ds) => total + ds.dataKeys.length, 0) > 32
    ) {
      return { series: [], updatedAt: now, loading: false, errors: ['数据源配置无效或超出 8 个实体、32 个字段上限'] };
    }
    const series: NativeSeries[] = [];
    const jobs: Promise<void>[] = [];
    const errors: string[] = [];
    let aggregate: NativeAggregateResult[] | undefined;
    let liquid: NativeSnapshot['liquid'];
    const needsHistory = ['valueChart', 'timeseries', 'bar', 'table', 'range', 'aggregate', 'state'].includes(
      config.native.family,
    );
    let window: ReturnType<typeof nativeWindow> | undefined;
    if (needsHistory) {
      try {
        window = nativeWindow(config.native, now);
      } catch {
        errors.push('时间窗口无效，请检查开始与结束时间');
      }
    }
    (config.datasources || []).forEach((source, sourceIndex) => {
      if (!source.entityId || !['DEVICE', 'ASSET'].includes(source.entityType)) {
        errors.push(`数据源 ${sourceIndex + 1} 尚未绑定实体`);
        return;
      }
      const groups = new Map<string, NativeSeries[]>();
      (source.dataKeys || []).forEach((key, keyIndex) => {
        const entry: NativeSeries = {
          id: `${source.entityType}:${source.entityId}:${key.type}:${key.scope || 'SERVER_SCOPE'}:${key.name}:${sourceIndex}:${keyIndex}`,
          entityId: source.entityId,
          label: `${source.name || source.entityId} · ${key.label || key.name}`,
          key,
          latest: null,
          points: [],
          truncated: false,
        };
        series.push(entry);
        if (!key.name || !['attribute', 'timeseries'].includes(key.type)) {
          entry.error = '仅支持属性与遥测字段';
          return;
        }
        const scope = key.scope || 'SERVER_SCOPE';
        if (key.type === 'attribute' && !['SERVER_SCOPE', 'CLIENT_SCOPE', 'SHARED_SCOPE'].includes(scope)) {
          entry.error = '属性范围无效';
          return;
        }
        const group = key.type === 'attribute' ? scope : 'timeseries';
        groups.set(group, [...(groups.get(group) || []), entry]);
      });
      groups.forEach((entries, group) => {
        const keys = [...new Set(entries.map((entry) => entry.key.name))].sort().join(',');
        const identity = `${source.entityType}:${source.entityId}:${group}:${keys}`;
        const readLatest =
          group === 'timeseries' ? () => api.latest(source, keys) : () => api.attributes(source, group as Scope, keys);
        if (!['range', 'aggregate', 'state'].includes(config.native.family))
          jobs.push(
            request(`latest:${identity}`, readLatest)
              .then((response) => {
                for (const entry of entries) {
                  if (group === 'timeseries') {
                    entry.latest = pointsFromResponse(response, entry.key.name).at(-1) || null;
                  } else {
                    const attribute = Array.isArray(response)
                      ? response.find((item) => item?.key === entry.key.name)
                      : null;
                    if (attribute && 'value' in attribute) {
                      entry.latest = { ts: Number(attribute.lastUpdateTs) || 0, value: attribute.value };
                    }
                  }
                }
              })
              .catch(() => {
                entries.forEach((entry) => {
                  entry.error = '最新值读取失败';
                });
              }),
          );
        if (
          group === 'timeseries' &&
          needsHistory &&
          window &&
          (config.native.family !== 'aggregate' || config.native.aggregate?.showChart !== false)
        ) {
          const interval = Number(config.native.window.intervalMs);
          const aggregation = config.native.family === 'state' ? 'NONE' : config.native.window.aggregation;
          if (
            !['NONE', 'AVG', 'MIN', 'MAX', 'SUM', 'COUNT'].includes(aggregation) ||
            !Number.isFinite(interval) ||
            interval <= 0
          ) {
            entries.forEach((entry) => {
              entry.error = '聚合间隔或方式无效';
            });
            return;
          }
          const query: NativeHistoryQuery = {
            entityType: source.entityType,
            entityId: source.entityId,
            keys,
            ...window,
            interval,
            agg: aggregation,
            limit: MAX_NATIVE_POINTS + 1,
            orderBy: 'DESC',
            ...(config.native.family === 'state' ? { useStrictDataTypes: true } : {}),
          };
          if (
            config.native.family === 'state' &&
            withNativeSettings(config.native).state.includePrevious &&
            window.startTs > 0
          ) {
            const previousQuery = { ...query, startTs: 0, endTs: window.startTs - 1, limit: 1 };
            jobs.push(
              request(`history:${JSON.stringify(previousQuery)}`, () => api.history(previousQuery))
                .then((response) => {
                  for (const entry of entries)
                    entry.previous =
                      pointsFromResponse(response, entry.key.name)
                        .filter((point) => point.ts >= 0 && point.ts <= previousQuery.endTs)
                        .at(-1) || null;
                })
                .catch(() => {
                  errors.push(`${source.name || source.entityId}：窗口前状态读取失败，起点可能缺失`);
                }),
            );
          }
          jobs.push(
            request(`history:${JSON.stringify(query)}`, () => api.history(query))
              .then((response) => {
                for (const entry of entries) {
                  const points = pointsFromResponse(response, entry.key.name).filter(
                    (point) => point.ts >= query.startTs && point.ts <= query.endTs,
                  );
                  entry.truncated = points.length > MAX_NATIVE_POINTS;
                  entry.points = points.slice(-MAX_NATIVE_POINTS);
                }
              })
              .catch(() => {
                entries.forEach((entry) => {
                  entry.historyFailed = true;
                  entry.error = entry.error ? `${entry.error}；历史值读取失败` : '历史值读取失败';
                });
              }),
          );
        }
      });
    });
    if (config.native.family === 'liquid' && config.datasources.length === 1) {
      jobs.push(
        loadLiquidSettings(config.datasources[0], withNativeSettings(config.native).liquid, (source, scope, keys) =>
          request(`attributes:${source.entityType}:${source.entityId}:${scope}:${keys}`, () =>
            api.attributes(source, scope, keys),
          ),
        ).then((result) => {
          liquid = result;
        }),
      );
    }
    if (config.native.family === 'aggregate' && window && config.datasources.length === 1) {
      jobs.push(
        loadNativeAggregateSlots(
          config.datasources[0],
          config.native.aggregate?.slots || [],
          window,
          config.native.window.realtime,
          {
            latest: (source, keys) =>
              request(`latest:${source.entityType}:${source.entityId}:timeseries:${keys}`, () =>
                api.latest(source, keys),
              ),
            history: (query) => request(`history:${JSON.stringify(query)}`, () => api.history(query)),
          },
        ).then((result) => {
          aggregate = result;
        }),
      );
    }
    await Promise.all(jobs);
    return {
      series,
      updatedAt: now,
      loading: false,
      errors,
      ...(aggregate ? { aggregate } : {}),
      ...(liquid ? { liquid } : {}),
    };
  }
  return { load };
}

export interface NativeTableRow {
  ts: number;
  values: Record<string, unknown>;
}
/** Align historical telemetry on timestamps; attributes stay latest-only, never forward-filled into history. */
export function nativeTableRows(
  series: NativeSeries[],
  page = 1,
  pageSize = 20,
  settings?: { sortOrder?: 'asc' | 'desc'; pagination?: boolean; query?: string },
) {
  const rows = new Map<number, NativeTableRow>();
  for (const entry of series) {
    const points = entry.key.type === 'attribute' ? (entry.latest ? [entry.latest] : []) : entry.points;
    for (const point of points) {
      if (!rows.has(point.ts)) rows.set(point.ts, { ts: point.ts, values: {} });
      rows.get(point.ts)!.values[entry.id] = point.value;
    }
  }
  const query = settings?.query?.trim().toLocaleLowerCase();
  const sorted = [...rows.values()]
    .filter(
      (row) =>
        !query ||
        [
          new Date(row.ts).toLocaleString(),
          ...series.map((entry) => formatNativeValue(row.values[entry.id], entry.key.decimals ?? 2, entry.key.units)),
        ].some((value) => value.toLocaleLowerCase().includes(query)),
    )
    .sort((a, b) => (settings?.sortOrder === 'asc' ? a.ts - b.ts : b.ts - a.ts));
  const size = Math.max(1, Math.min(100, Math.floor(pageSize) || 20));
  const totalPages = settings?.pagination === false ? 1 : Math.max(1, Math.ceil(sorted.length / size));
  const currentPage = Math.max(1, Math.min(totalPages, Math.floor(page) || 1));
  return {
    rows: settings?.pagination === false ? sorted : sorted.slice((currentPage - 1) * size, currentPage * size),
    total: sorted.length,
    page: currentPage,
    totalPages,
  };
}

export function createNativePoller(
  load: (config: NativeDataConfig) => Promise<NativeSnapshot>,
  publish: (snapshot: NativeSnapshot) => void,
  schedule: (callback: () => void, ms: number) => unknown = (callback, ms) => setTimeout(callback, ms),
  cancel: (timer: any) => void = (timer) => clearTimeout(timer),
) {
  let generation = 0;
  let timer: unknown;
  let config: NativeDataConfig | null = null;
  let busy = false;
  let stopped = false;
  async function run() {
    if (busy || !config || stopped) return;
    busy = true;
    const current = generation;
    const target = config;
    try {
      const snapshot = await load(target);
      if (!stopped && current === generation) publish(snapshot);
    } catch {
      if (!stopped && current === generation)
        publish({ series: [], updatedAt: Date.now(), loading: false, errors: ['数据读取失败'] });
    } finally {
      busy = false;
      if (!stopped && config) {
        if (current !== generation) void run();
        else if (
          target.native.window.realtime ||
          target.native.window.calendar ||
          !['timeseries', 'valueChart', 'bar', 'table', 'range', 'state'].includes(target.native.family)
        ) {
          timer = schedule(
            () => {
              timer = undefined;
              void run();
            },
            Math.max(5000, Math.min(300000, Number(target.native.pollMs) || 10000)),
          );
        }
      }
    }
  }
  return {
    refresh() {
      if (stopped || !config) return;
      generation++;
      if (timer !== undefined) cancel(timer);
      timer = undefined;
      void run();
    },
    pause() {
      generation++;
      config = null;
      if (timer !== undefined) cancel(timer);
      timer = undefined;
    },
    update(next: NativeDataConfig) {
      if (stopped) return;
      generation++;
      if (timer !== undefined) cancel(timer);
      timer = undefined;
      // Freeze a serializable configuration, so edits cannot mutate a request already in flight.
      config = JSON.parse(JSON.stringify(next));
      publish({ series: [], updatedAt: 0, loading: true, errors: [] });
      void run();
    },
    stop() {
      stopped = true;
      generation++;
      config = null;
      if (timer !== undefined) cancel(timer);
    },
  };
}
