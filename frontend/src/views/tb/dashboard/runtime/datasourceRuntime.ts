import { shallowReactive } from 'vue';
import { getLatestTimeseries } from '/@/api/tb/telemetry';
import { EntityType } from '/@/enums/entityTypeEnum';
import { TbWsTelemetryClient } from '../../map/tbWsTelemetry';

export type Point = { ts: number; value: number | string | null };

const MAX_POINTS_PER_KEY = 2000;

export type WidgetRuntimeData = {
  timeWindowMs?: number;
  series: Record<string, Point[]>;
  latestValues: Record<string, number | string | null>;
  updatedAt: number;
  error?: string;
  wsHistoryCmdId?: number;
  wsTsSubCmdId?: number;
  wsLatestCmdId?: number;
  latestPollTimer?: number;
  setTimeWindow?: (ms: number) => void;
};

export type RuntimeWidgetLike = {
  id: string;
  widgetKey?: string;
  type?: string;
  category?: string;
  dataProvider?: string;
  config?: Record<string, any>;
};

export type WidgetRuntimeProviderContext = {
  widget: RuntimeWidgetLike;
  data: WidgetRuntimeData;
};

export type WidgetRuntimeProvider = (
  context: WidgetRuntimeProviderContext,
) => void | (() => void) | Promise<void | (() => void)>;

export type DatasourceRuntimeOptions = {
  dataProviders?: Record<string, WidgetRuntimeProvider>;
  getExternalValues?: (entityType: string, entityId: string) => Record<string, unknown> | undefined | null;
  getEntityName?: (entityType: string, entityId: string) => string | undefined;
  externalValuesOnly?: boolean;
};

type DataKeyMeta = {
  name: string;
  type?: string;
  label?: string;
};

type NormalizedDatasource = {
  entityType: string;
  entityId: string;
  entityName?: string;
  keys: string[];
  dataKeys: DataKeyMeta[];
  pollMs: number;
};

function entityTypeToEnum(s: string) {
  const up = String(s || '').toUpperCase();
  if ((EntityType as any)[up]) return (EntityType as any)[up];
  return (EntityType as any).DEVICE ?? up;
}

function toNumberMaybe(v: any): number | string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v);
}
function isExternalDeviceOffline(values: Record<string, unknown>) {
  const rawStatus = values.online ?? values.statusText ?? values.status;
  if (rawStatus === false || rawStatus === 0) return true;
  if (rawStatus === true || rawStatus === 1) return false;

  const normalized = String(rawStatus ?? '')
    .trim()
    .toLowerCase();
  return ['false', '0', 'no', 'offline', 'inactive', 'disconnected'].includes(normalized);
}

function trimToWindow(points: Point[], startTs: number) {
  let idx = 0;
  while (idx < points.length && points[idx].ts < startTs) idx++;
  if (idx > 0) points.splice(0, idx);
  if (points.length > MAX_POINTS_PER_KEY) {
    points.splice(0, points.length - MAX_POINTS_PER_KEY);
  }
}

function normalizeDatasource(cfg: any): NormalizedDatasource | null {
  const ds =
    cfg?.datasource || cfg?.dataSource || cfg?.ds || (Array.isArray(cfg?.datasources) ? cfg.datasources[0] : null);

  if (!ds) return null;

  const entityType = ds.entityType || ds.type;
  const entityId = ds.entityId || ds.id;

  let dataKeys: DataKeyMeta[] = [];
  if (Array.isArray(ds.dataKeys)) {
    dataKeys = ds.dataKeys
      .map((k: any) => ({
        name: k?.name,
        type: k?.type,
        label: k?.label,
      }))
      .filter((k: DataKeyMeta) => !!k.name);
  }

  let keys = ds.keys;
  if (!keys && dataKeys.length) {
    keys = dataKeys.map((k) => k.name);
  }

  if (!entityType || !entityId || !keys) return null;

  if (typeof keys === 'string') {
    keys = keys
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(keys) || keys.length === 0) return null;

  if (!dataKeys.length) {
    dataKeys = (keys as string[]).map((name) => ({ name, type: 'timeseries' }));
  }

  const pollMs = Math.max(
    1000,
    Number(
      ds?.pollMs ??
        cfg?.pollMs ??
        cfg?.settings?.pollMs ??
        cfg?.settings?.tbPolarArea?.pollMs ??
        cfg?.settings?.tbRadar?.pollMs ??
        5000,
    ),
  );

  return {
    entityType: String(entityType),
    entityId: String(entityId),
    entityName: String(ds.entityName || ds.name || '').trim() || undefined,
    keys: keys as string[],
    dataKeys,
    pollMs,
  };
}

function formatTelemetryError(rawError: unknown, datasource: NormalizedDatasource, options: DatasourceRuntimeOptions) {
  if (!rawError) return undefined;
  const message = String(rawError);
  const entityName =
    datasource.entityName || options.getEntityName?.(datasource.entityType, datasource.entityId) || datasource.entityId;
  if (/failed to fetch data|permission|unauthorized|access denied/i.test(message)) {
    return `设备“${entityName}”无遥测读取权限，请将该设备分配给当前客户后重试。`;
  }
  return `设备“${entityName}”：${message}`;
}

function extractLastValue(input: any): any {
  if (input === undefined || input === null) return undefined;

  if (Array.isArray(input) && input.length >= 2 && !Array.isArray(input[0])) {
    return input[1];
  }

  if (Array.isArray(input) && input.length) {
    const last = input[input.length - 1];

    if (Array.isArray(last) && last.length >= 2) {
      return last[1];
    }

    if (typeof last === 'object' && last) {
      if ('value' in last) return (last as any).value;
      if ('latestValue' in last) return (last as any).latestValue;
      if ('v' in last) return (last as any).v;
      if ('y' in last) return (last as any).y;
      if ('data' in last) return extractLastValue((last as any).data);
    }

    return last;
  }

  if (typeof input === 'object' && input) {
    if ('value' in input) return (input as any).value;
    if ('latestValue' in input) return (input as any).latestValue;
    if ('v' in input) return (input as any).v;
    if ('y' in input) return (input as any).y;
    if ('data' in input) return extractLastValue((input as any).data);
  }

  return input;
}

function buildLatestValues(tsKv: any, keys: string[]) {
  const latestValues: Record<string, number | string | null> = {};
  const root = tsKv?.data ?? tsKv ?? {};

  keys.forEach((k) => {
    const raw = root?.[k];
    const val = extractLastValue(raw);
    latestValues[k] = toNumberMaybe(val);
  });

  return latestValues;
}

function applyLatestValuesToSeries(d: WidgetRuntimeData, latestValues: Record<string, number | string | null>) {
  const now = Date.now();
  const startTs = now - (d.timeWindowMs || 300000);

  const nextSeries = { ...d.series };

  Object.entries(latestValues).forEach(([key, value]) => {
    if (value === undefined) return;

    const list = Array.isArray(nextSeries[key]) ? [...nextSeries[key]] : [];
    const point: Point = { ts: now, value };

    const last = list[list.length - 1];
    if (last && last.ts === point.ts) last.value = point.value;
    else list.push(point);

    trimToWindow(list, startTs);
    nextSeries[key] = list;
  });

  d.series = nextSeries;
}

function mergeHistory(d: WidgetRuntimeData, keys: string[], payload: any) {
  const root = payload?.data ?? payload;
  const now = Date.now();
  const startTs = now - (d.timeWindowMs || 300000);

  const nextSeries = { ...d.series };
  const nextLatestValues = { ...d.latestValues };

  keys.forEach((k) => {
    const arr = root?.[k];
    const incoming: Point[] = [];

    if (Array.isArray(arr)) {
      for (const it of arr) {
        if (Array.isArray(it) && it.length >= 2) {
          incoming.push({ ts: Number(it[0]), value: toNumberMaybe(it[1]) });
        } else {
          const val = toNumberMaybe(it?.value);
          if (val === null) continue;
          incoming.push({ ts: Number(it?.ts), value: val });
        }
      }
    } else if (arr && typeof arr === 'object') {
      if ('ts' in arr || 'value' in arr) {
        incoming.push({ ts: Number(arr?.ts), value: toNumberMaybe(arr?.value) });
      }
    }

    incoming.sort((a, b) => a.ts - b.ts);

    const existing = Array.isArray(nextSeries[k]) ? [...nextSeries[k]] : [];
    const merged = existing.concat(incoming).filter((p) => Number.isFinite(p.ts));
    merged.sort((a, b) => a.ts - b.ts);

    const dedup: Point[] = [];
    for (const p of merged) {
      const last = dedup[dedup.length - 1];
      if (last && last.ts === p.ts) last.value = p.value;
      else dedup.push(p);
    }

    trimToWindow(dedup, startTs);
    nextSeries[k] = dedup;

    const latestPoint = dedup[dedup.length - 1];
    if (latestPoint) {
      nextLatestValues[k] = latestPoint.value;
    } else {
      const latest = extractLastValue(arr);
      nextLatestValues[k] = toNumberMaybe(latest);
    }
  });

  d.series = nextSeries;
  d.latestValues = nextLatestValues;
  d.updatedAt = Date.now();
}

function appendRealtime(d: WidgetRuntimeData, keys: string[], payload: any) {
  const now = Date.now();
  const startTs = now - (d.timeWindowMs || 300000);
  const data = payload?.data ?? payload;

  const nextSeries = { ...d.series };
  const nextLatestValues = { ...d.latestValues };

  keys.forEach((k) => {
    const v = data?.[k];
    if (v === undefined || v === null) return;

    let ts = now;
    let value: any = null;

    if (Array.isArray(v) && Array.isArray(v[0])) {
      ts = Number(v[0][0]);
      value = v[0][1];
    } else if (Array.isArray(v) && v.length >= 2 && !Array.isArray(v[0])) {
      ts = Number(v[0]);
      value = v[1];
    } else if (v && typeof v === 'object' && 'ts' in v) {
      ts = Number((v as any).ts);
      value = (v as any).value;
    } else {
      value = v;
    }

    if (!Number.isFinite(ts)) ts = now;

    const normalized = toNumberMaybe(value);
    if (normalized === null) return;

    const p: Point = { ts, value: normalized };
    const list = Array.isArray(nextSeries[k]) ? [...nextSeries[k]] : [];

    const last = list[list.length - 1];
    if (last && last.ts === p.ts) last.value = p.value;
    else list.push(p);

    trimToWindow(list, startTs);

    nextSeries[k] = list;
    nextLatestValues[k] = p.value;
  });

  d.series = nextSeries;
  d.latestValues = nextLatestValues;
  d.updatedAt = Date.now();
}

export function createDatasourceRuntime(options: DatasourceRuntimeOptions = {}) {
  const wsClient = new TbWsTelemetryClient(() => localStorage.getItem('jwt_token') || '');

  const runtimeDataMap = new Map<string, WidgetRuntimeData>();
  const mountedWidgetMap = new Map<string, RuntimeWidgetLike>();
  const providerCleanupMap = new Map<string, () => void>();

  function clearProvider(widgetId: string) {
    const cleanup = providerCleanupMap.get(widgetId);
    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        console.warn('[widget-runtime] provider cleanup failed:', error);
      }
      providerCleanupMap.delete(widgetId);
    }
  }

  function connect() {
    if (!options.externalValuesOnly) {
      wsClient.connect();
    }
  }

  function clearLatestPolling(d: WidgetRuntimeData) {
    if (d.latestPollTimer) {
      window.clearInterval(d.latestPollTimer);
      d.latestPollTimer = undefined;
    }
  }

  function close() {
    runtimeDataMap.forEach((d) => {
      unsubscribeTimeseries(d);
      clearLatestPolling(d);
    });
    providerCleanupMap.forEach((_cleanup, widgetId) => clearProvider(widgetId));
    runtimeDataMap.clear();
    mountedWidgetMap.clear();
    wsClient.close();
  }

  function ensureRuntimeData(widgetId: string): WidgetRuntimeData {
    let d = runtimeDataMap.get(widgetId);
    if (!d) {
      d = shallowReactive({
        timeWindowMs: 300000,
        series: {},
        latestValues: {},
        updatedAt: Date.now(),
        error: undefined,
        wsHistoryCmdId: undefined,
        wsTsSubCmdId: undefined,
        wsLatestCmdId: undefined,
        latestPollTimer: undefined,
        setTimeWindow: undefined,
      }) as WidgetRuntimeData;

      runtimeDataMap.set(widgetId, d);
    }
    return d;
  }

  function unsubscribeTimeseries(d: WidgetRuntimeData) {
    if (d.wsHistoryCmdId) wsClient.unsubscribe(d.wsHistoryCmdId);
    if (d.wsTsSubCmdId) wsClient.unsubscribe(d.wsTsSubCmdId);
    if (d.wsLatestCmdId) wsClient.unsubscribe(d.wsLatestCmdId);
    d.wsHistoryCmdId = undefined;
    d.wsTsSubCmdId = undefined;
    d.wsLatestCmdId = undefined;
  }

  function applyExternalLatest(widget: RuntimeWidgetLike) {
    const d = ensureRuntimeData(widget.id);
    const ds = normalizeDatasource(widget.config);

    if (!ds) {
      return false;
    }

    const externalValues = options.getExternalValues?.(ds.entityType, ds.entityId);
    if (!externalValues) {
      return false;
    }

    const matchedKeys = ds.keys.filter((key) => externalValues[key] !== undefined);
    if (!matchedKeys.length) {
      return false;
    }

    const latestValues = matchedKeys.reduce<Record<string, number | string | null>>((result, key) => {
      result[key] = toNumberMaybe(externalValues[key]);
      return result;
    }, {});

    d.latestValues = { ...d.latestValues, ...latestValues };
    applyLatestValuesToSeries(d, latestValues);
    d.updatedAt = Date.now();
    d.error = undefined;
    return matchedKeys.length === ds.keys.length;
  }
  async function fetchLatestOnce(widget: RuntimeWidgetLike) {
    const d = ensureRuntimeData(widget.id);
    const ds = normalizeDatasource(widget.config);

    if (!ds) {
      d.latestValues = {};
      d.series = {};
      d.updatedAt = Date.now();
      d.error = 'datasource 无效：缺少 entityId 或 keys';
      return d;
    }

    const nonTimeseriesKeys = ds.dataKeys.filter(
      (k) => k.type && !['timeseries', 'ts'].includes(String(k.type).toLowerCase()),
    );

    if (nonTimeseriesKeys.length) {
      d.error =
        '当前 latest 运行时仅支持 timeseries key，暂不支持：' +
        nonTimeseriesKeys.map((k) => `${k.name}(${k.type})`).join(', ');
    }

    const tsKeys = ds.dataKeys
      .filter((k) => !k.type || ['timeseries', 'ts'].includes(String(k.type).toLowerCase()))
      .map((k) => k.name);

    if (!tsKeys.length) {
      d.latestValues = {};
      d.series = {};
      d.updatedAt = Date.now();
      return d;
    }

    try {
      const ret = await getLatestTimeseries(
        { entityType: entityTypeToEnum(ds.entityType), id: ds.entityId } as any,
        tsKeys.join(','),
        true,
      );

      const latestValues = buildLatestValues(ret, tsKeys);
      d.latestValues = latestValues;
      applyLatestValuesToSeries(d, latestValues);
      d.updatedAt = Date.now();

      if (!nonTimeseriesKeys.length) {
        d.error = undefined;
      }
    } catch (e: any) {
      d.latestValues = {};
      d.series = {};
      d.updatedAt = Date.now();
      d.error = e?.message || String(e);
    }

    return d;
  }

  function startLatestPolling(widget: RuntimeWidgetLike) {
    const d = ensureRuntimeData(widget.id);
    const ds = normalizeDatasource(widget.config);

    clearLatestPolling(d);

    if (!ds) {
      d.error = 'datasource 无效：缺少 entityId 或 keys';
      return d;
    }

    if (applyExternalLatest(widget)) {
      return d;
    }

    if (options.externalValuesOnly) {
      d.error = undefined;
      d.updatedAt = Date.now();
      return d;
    }

    unsubscribeTimeseries(d);
    d.error = undefined;
    d.wsLatestCmdId = wsClient.subscribeLatest({
      entityType: ds.entityType,
      entityId: ds.entityId,
      keys: ds.keys,
      onData: (message: any) => {
        d.error = formatTelemetryError(message?.errorMsg || message?.error, ds, options);
        if (!d.error) appendRealtime(d, ds.keys, message?.data ?? message);
      },
    });

    return d;
  }

  function subscribeTimeseries(widget: RuntimeWidgetLike) {
    const d = ensureRuntimeData(widget.id);
    const ds = normalizeDatasource(widget.config);

    clearLatestPolling(d);

    d.setTimeWindow = (ms: number) => {
      const next = Math.max(60_000, Number(ms || 300000));
      if (d!.timeWindowMs === next) return;
      d!.timeWindowMs = next;
      subscribeTimeseries(widget);
    };

    if (!ds) {
      d.error = 'datasource 无效：缺少 entityId 或 keys';
      return d;
    }

    applyExternalLatest(widget);

    if (options.externalValuesOnly) {
      unsubscribeTimeseries(d);
      d.error = undefined;
      d.updatedAt = Date.now();
      return d;
    }

    const endTs = Date.now();
    const startTs = endTs - (d.timeWindowMs || 300000);

    unsubscribeTimeseries(d);

    Object.keys(d.series || {}).forEach((k) => {
      const list = d.series[k];
      if (Array.isArray(list)) trimToWindow(list, startTs);
    });

    d.error = undefined;

    d.wsTsSubCmdId = wsClient.subscribeTimeseriesByCmds({
      entityType: String(ds.entityType).toUpperCase(),
      entityId: ds.entityId,
      keys: ds.keys,
      timeWindowMs: d.timeWindowMs || 300000,
      limit: 1000,
      agg: 'NONE',
      onData: (message: any) => {
        d.error = formatTelemetryError(message?.errorMsg || message?.error, ds, options);
        if (!d.error) mergeHistory(d, ds.keys, message?.data ?? message);
      },
    });

    return d;
  }

  function mountWidgetRuntime(widget: RuntimeWidgetLike) {
    const d = ensureRuntimeData(widget.id);
    const providerKey = widget.dataProvider || widget.category || 'static';
    mountedWidgetMap.set(widget.id, widget);
    clearProvider(widget.id);

    if (providerKey === 'telemetry-timeseries' || providerKey === 'timeseries') {
      const configuredWindow = Number(widget.config?.timewindow?.intervalMs);
      if (Number.isFinite(configuredWindow) && !Object.keys(d.series).length) {
        d.timeWindowMs = Math.max(60_000, configuredWindow);
      }
      return subscribeTimeseries(widget);
    }

    if (providerKey === 'telemetry-latest' || providerKey === 'latest' || providerKey === 'control') {
      return startLatestPolling(widget);
    }

    const customProvider = options.dataProviders?.[providerKey];
    if (customProvider) {
      clearLatestPolling(d);
      unsubscribeTimeseries(d);
      d.error = undefined;
      Promise.resolve(customProvider({ widget, data: d }))
        .then((cleanup) => {
          if (typeof cleanup === 'function' && mountedWidgetMap.has(widget.id)) {
            providerCleanupMap.set(widget.id, cleanup);
          }
        })
        .catch((error) => {
          d.error = error?.message || String(error);
          d.updatedAt = Date.now();
        });
      return d;
    }

    clearLatestPolling(d);
    unsubscribeTimeseries(d);
    d.error = undefined;
    d.updatedAt = Date.now();
    return d;
  }

  function unmountWidgetRuntime(widgetId: string) {
    clearProvider(widgetId);
    const d = runtimeDataMap.get(widgetId);
    if (!d) return;
    clearLatestPolling(d);
    unsubscribeTimeseries(d);
    mountedWidgetMap.delete(widgetId);
  }

  function refreshExternalValues() {
    mountedWidgetMap.forEach((widget) => {
      applyExternalLatest(widget);
    });
  }

  return {
    connect,
    close,
    ensureRuntimeData,
    mountWidgetRuntime,
    unmountWidgetRuntime,
    refreshExternalValues,
  };
}

export type DatasourceRuntime = ReturnType<typeof createDatasourceRuntime>;
