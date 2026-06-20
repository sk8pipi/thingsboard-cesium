import { shallowReactive } from 'vue';
import { getLatestTimeseries } from '/@/api/tb/telemetry';
import { EntityType } from '/@/enums/entityTypeEnum';
import { TbWsTelemetryClient } from '../../map/tbWsTelemetry';

export type Point = { ts: number; value: number | string | null };

export type WidgetRuntimeData = {
  timeWindowMs?: number;
  series: Record<string, Point[]>;
  latestValues: Record<string, number | string | null>;
  updatedAt: number;
  error?: string;
  wsHistoryCmdId?: number;
  wsTsSubCmdId?: number;
  latestPollTimer?: number;
  setTimeWindow?: (ms: number) => void;
};

export type RuntimeWidgetLike = {
  id: string;
  widgetKey?: string;
  type?: string;
  category?: string;
  config?: Record<string, any>;
};

export type DatasourceRuntimeOptions = {
  getExternalValues?: (entityType: string, entityId: string) => Record<string, unknown> | undefined | null;
};

type DataKeyMeta = {
  name: string;
  type?: string;
  label?: string;
};

type NormalizedDatasource = {
  entityType: string;
  entityId: string;
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

function trimToWindow(points: Point[], startTs: number) {
  let idx = 0;
  while (idx < points.length && points[idx].ts < startTs) idx++;
  if (idx > 0) points.splice(0, idx);
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
    keys: keys as string[],
    dataKeys,
    pollMs,
  };
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
  const token = localStorage.getItem('jwt_token') || '';
  const wsClient = new TbWsTelemetryClient(token);

  const runtimeDataMap = new Map<string, WidgetRuntimeData>();
  const mountedWidgetMap = new Map<string, RuntimeWidgetLike>();

  function connect() {
    wsClient.connect();
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
    d.wsHistoryCmdId = undefined;
    d.wsTsSubCmdId = undefined;
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

    const latestValues = ds.keys.reduce<Record<string, number | string | null>>((result, key) => {
      const value = externalValues[key];
      if (value !== undefined) {
        result[key] = toNumberMaybe(value);
      }
      return result;
    }, {});

    d.latestValues = latestValues;
    applyLatestValuesToSeries(d, latestValues);
    d.updatedAt = Date.now();
    d.error = undefined;
    return true;
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

    void fetchLatestOnce(widget);

    d.latestPollTimer = window.setInterval(() => {
      void fetchLatestOnce(widget);
    }, ds.pollMs);

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

    if (applyExternalLatest(widget)) {
      unsubscribeTimeseries(d);
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

    d.wsHistoryCmdId = wsClient.requestHistoryByCmds({
      entityType: String(ds.entityType).toUpperCase(),
      entityId: ds.entityId,
      keys: ds.keys,
      startTs,
      endTs,
      onData: (msg: any) => {
        d.error = msg?.errorMsg || msg?.error || undefined;
        mergeHistory(d, ds.keys, msg?.data ?? msg);
      },
    });

    d.wsTsSubCmdId = wsClient.subscribeTimeseriesByCmds({
      entityType: String(ds.entityType).toUpperCase(),
      entityId: ds.entityId,
      keys: ds.keys,
      timeWindowMs: d.timeWindowMs,
      onData: (msg: any) => {
        d.error = msg?.errorMsg || msg?.error || undefined;
        appendRealtime(d, ds.keys, msg?.data ?? msg);
      },
    });

    return d;
  }

  function mountWidgetRuntime(widget: RuntimeWidgetLike) {
    const d = ensureRuntimeData(widget.id);
    const category = widget.category;
    mountedWidgetMap.set(widget.id, widget);

    if (category === 'timeseries') {
      return subscribeTimeseries(widget);
    }

    if (category === 'latest' || category === 'control') {
      return startLatestPolling(widget);
    }

    clearLatestPolling(d);
    unsubscribeTimeseries(d);
    d.error = undefined;
    d.updatedAt = Date.now();
    return d;
  }

  function unmountWidgetRuntime(widgetId: string) {
    const d = runtimeDataMap.get(widgetId);
    if (!d) return;
    clearLatestPolling(d);
    unsubscribeTimeseries(d);
    runtimeDataMap.delete(widgetId);
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
