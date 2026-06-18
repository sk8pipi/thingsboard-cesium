import { widgetRegistry } from '../../dashboard/runtime/widgets/registry/widgetRegistry';
import type { LocalWidgetKey } from '../../dashboard/runtime/types';
import type { CustomWidgetDefinition } from './types';

type AnyObj = Record<string, any>;

function safeJsonClone<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function slugify(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function genId(prefix: string, ...parts: Array<string | undefined>) {
  const body = parts.filter(Boolean).join('-');
  return `${prefix}-${slugify(body || String(Date.now()))}-${Date.now()}`;
}

function pickWidgetName(widget: AnyObj, fallback = '导入部件') {
  return (
    widget?.title || widget?.name || widget?.widgetName || widget?.config?.title || widget?.typeFullFqn || fallback
  );
}

function pickTypeFullFqn(widget: AnyObj): string | undefined {
  return widget?.typeFullFqn || widget?.widgetType?.fqn || widget?.widget?.typeFullFqn;
}

function inferKindFromRegistry(typeFullFqn?: string): string | '' {
  if (!typeFullFqn) return '';

  const found = Object.values(widgetRegistry).find((item) => item.typeFullFqn === typeFullFqn);
  if (!found) return '';

  if (found.key === 'timeseriesLine') return 'chart';
  if (found.key === 'latestBar') return 'bar';
  if (found.key === 'latestPie') return 'pie';
  if (found.key === 'staticHtml') return 'static';
  return '';
}

function inferKindFromConfig(config: AnyObj): string {
  const type = String(config?.type || '').toLowerCase();
  const fqn = String(config?.typeFullFqn || '').toLowerCase();

  if (type.includes('timeseries') || fqn.includes('timeseries')) return 'chart';
  if (type.includes('pie') || fqn.includes('pie')) return 'pie';
  if (type.includes('bar') || fqn.includes('bar') || fqn.includes('bars')) return 'bar';
  if (type.includes('html') || fqn.includes('html') || type.includes('static')) return 'static';

  const settings = config?.settings || {};
  if (settings?.series?.length) return 'chart';

  return 'chart';
}

function mapKindToLocalKey(kind: string): LocalWidgetKey | '' {
  if (kind === 'chart') return 'timeseriesLine';
  if (kind === 'bar') return 'latestBar';
  if (kind === 'pie') return 'latestPie';
  if (kind === 'static') return 'staticHtml';
  return '';
}

function normalizeDatasourceFromTb(rawConfig: AnyObj) {
  const ds0 =
    rawConfig?.datasource ||
    rawConfig?.dataSource ||
    rawConfig?.ds ||
    (Array.isArray(rawConfig?.datasources) ? rawConfig.datasources[0] : null);

  if (!ds0) return undefined;

  const entityType = ds0?.entityType || ds0?.type || (ds0?.entityAliasId && 'ENTITY_ALIAS') || 'DEVICE';

  const entityId = ds0?.entityId || ds0?.deviceId || ds0?.id || '';

  let keys: string[] = [];

  if (Array.isArray(ds0?.dataKeys)) {
    keys = ds0.dataKeys.map((k: any) => k?.name).filter(Boolean);
  } else if (Array.isArray(ds0?.keys)) {
    keys = ds0.keys.filter(Boolean);
  } else if (typeof ds0?.keys === 'string') {
    keys = ds0.keys
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  return {
    type: 'device',
    entityType: String(entityType).toUpperCase(),
    entityId: String(entityId || ''),
    keys,
    dataKeys: keys.map((name) => ({
      name,
      type: 'timeseries',
    })),
    pollMs: Number(ds0?.pollMs || 3000),
  };
}

function buildImportedConfig(kind: string, rawWidget: AnyObj, rawConfig: AnyObj) {
  const base = safeJsonClone(rawConfig || {});
  const ds = normalizeDatasourceFromTb(base);

  const config: AnyObj = {
    ...base,
  };

  if (ds) {
    config.datasource = {
      ...(base?.datasource || {}),
      ...ds,
    };
    config.datasources = [config.datasource];
  }

  if (!config.title) {
    config.title = pickWidgetName(rawWidget, '导入部件');
  }

  if (config.showTitle === undefined) {
    config.showTitle = true;
  }

  if (kind === 'chart') {
    config.timewindow = {
      intervalMs:
        Number(base?.timewindow?.intervalMs || base?.timeWindowMs || base?.tbTimeseries?.timeWindowMs || 300000) ||
        300000,
      realtime: true,
    };

    config.tbTimeseries = {
      ...(base?.tbTimeseries || {}),
    };
  }

  if (kind === 'pie') {
    const keys = ds?.keys || [];
    config.tbPie = {
      ...(base?.tbPie || {}),
      keys: Array.isArray(base?.tbPie?.keys) && base.tbPie.keys.length ? base.tbPie.keys : keys,
    };
  }

  if (kind === 'bar') {
    const keys = ds?.keys || [];
    config.tbBar = {
      ...(base?.tbBar || {}),
      keys: Array.isArray(base?.tbBar?.keys) && base.tbBar.keys.length ? base.tbBar.keys : keys,
    };
  }

  if (kind === 'static') {
    config.content =
      base?.content || base?.html || base?.settings?.html || '<div style="padding:12px;">导入的静态部件</div>';
  }

  return config;
}

function widgetToDefinition(rawWidget: AnyObj, parentBundleName?: string): CustomWidgetDefinition | null {
  const rawConfig = rawWidget?.config || rawWidget?.widget?.config || {};
  const typeFullFqn = pickTypeFullFqn(rawWidget);

  const kind =
    inferKindFromRegistry(typeFullFqn) ||
    inferKindFromConfig({
      ...rawWidget,
      ...rawConfig,
      typeFullFqn,
    });

  const localKey = mapKindToLocalKey(kind);
  if (!localKey) return null;

  const name = pickWidgetName(rawWidget, parentBundleName || '导入部件');
  const defaultConfig = buildImportedConfig(kind, rawWidget, rawConfig);

  return {
    id: genId('tbw', name, typeFullFqn || kind),
    name,
    kind,
    typeFullFqn,
    localWidgetKey: localKey,
    defaultConfig,
    source: 'thingsboard',
    raw: safeJsonClone(rawWidget),
  } as CustomWidgetDefinition;
}

function extractWidgets(input: AnyObj): AnyObj[] {
  if (!input || typeof input !== 'object') return [];

  if (Array.isArray(input)) return input;

  if (input?.widget && typeof input.widget === 'object') {
    return [input.widget];
  }

  if (Array.isArray(input?.widgets)) {
    return input.widgets;
  }

  if (Array.isArray(input?.widgetTypes)) {
    return input.widgetTypes.map((x: any) => x?.widgetType || x).filter(Boolean);
  }

  if (Array.isArray(input?.bundles)) {
    return input.bundles.flatMap((b: any) => {
      if (Array.isArray(b?.widgets)) return b.widgets;
      if (Array.isArray(b?.widgetTypes)) return b.widgetTypes.map((x: any) => x?.widgetType || x).filter(Boolean);
      return [];
    });
  }

  return [];
}

export function importThingsboardJson(input: AnyObj): CustomWidgetDefinition[] {
  const widgets = extractWidgets(input);
  if (!widgets.length) return [];

  const result: CustomWidgetDefinition[] = [];

  for (const rawWidget of widgets) {
    const def = widgetToDefinition(rawWidget);
    if (def) {
      result.push(def);
    }
  }

  const dedup = new Map<string, CustomWidgetDefinition>();
  for (const item of result) {
    const key = `${item.typeFullFqn || ''}__${item.name}__${item.kind}`;
    if (!dedup.has(key)) {
      dedup.set(key, item);
    }
  }

  return Array.from(dedup.values());
}
