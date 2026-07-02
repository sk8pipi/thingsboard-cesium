import type { CSSProperties } from 'vue';
import type { DashboardWidget, TbWidgetConfig, WidgetAppearance, WidgetHostKind } from '../../types';
import { widgetRegistry } from '../registry/widgetRegistry';
import type { WidgetDatasourceBinding, WidgetRegistryItem } from './widgetDefinition';

type AnyRecord = Record<string, any>;

export interface CreateWidgetInstanceOptions {
  id?: string;
  title?: string;
  config?: AnyRecord;
  appearance?: WidgetAppearance;
  binding?: WidgetDatasourceBinding;
}

function isPlainObject(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function cloneWidgetValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export function mergeWidgetConfig<T extends AnyRecord>(base: T, override?: AnyRecord): T {
  if (!override) return cloneWidgetValue(base);

  const output: AnyRecord = cloneWidgetValue(base || ({} as T));
  Object.entries(override).forEach(([key, value]) => {
    output[key] =
      isPlainObject(output[key]) && isPlainObject(value)
        ? mergeWidgetConfig(output[key], value)
        : cloneWidgetValue(value);
  });
  return output as T;
}

export function getWidgetDefinition(key: string | undefined | null): WidgetRegistryItem | null {
  return key ? widgetRegistry[key] || null : null;
}

export function listWidgetDefinitions(host?: WidgetHostKind) {
  return Object.values(widgetRegistry).filter((definition) => !host || definition.hosts.includes(host));
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function accentToRgb(value: unknown) {
  const match = String(value || '')
    .trim()
    .match(/^#([0-9a-f]{6})$/i);
  if (!match) return '108, 233, 255';
  const hex = match[1];
  return `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
}

export function widgetAppearanceStyle(key: string, override?: WidgetAppearance): CSSProperties {
  const definition = getWidgetDefinition(key);
  const appearance = { ...(definition?.defaultAppearance || {}), ...(override || {}) };
  const disabled = appearance.surface === 'none';
  return {
    '--tb-widget-surface-opacity': disabled ? 0 : clampNumber(appearance.backgroundOpacity, 0.04, 0, 1),
    '--tb-widget-surface-blur': `${disabled ? 0 : clampNumber(appearance.blurPx, 0, 0, 40)}px`,
    '--tb-widget-surface-border-opacity': disabled ? 0 : clampNumber(appearance.borderOpacity, 0.18, 0, 1),
    '--tb-widget-surface-radius': `${clampNumber(appearance.radiusPx, 12, 0, 40)}px`,
    '--tb-widget-surface-accent': accentToRgb(appearance.accentColor),
    '--tb-widget-surface-shadow-strength': disabled ? 0 : clampNumber(appearance.shadowStrength, 0.2, 0, 1),
  } as CSSProperties;
}

export function widgetAppearanceStyleText(key: string, override?: WidgetAppearance) {
  return Object.entries(widgetAppearanceStyle(key, override))
    .map(([name, value]) => `${name}:${String(value)}`)
    .join(';');
}
export function resolveWidgetDefinitionKey(input: {
  widgetKey?: string;
  type?: string;
  localWidgetKey?: string;
  typeFullFqn?: string;
  kind?: string;
}) {
  const direct = input.widgetKey || input.type || input.localWidgetKey;
  if (direct && widgetRegistry[direct]) return direct;

  if (input.typeFullFqn) {
    const found = Object.values(widgetRegistry).find((item) => item.typeFullFqn === input.typeFullFqn);
    if (found) return found.key;
  }

  const fallbackByKind: Record<string, string> = {
    chart: 'timeseriesLine',
    bar: 'latestBar',
    pie: 'latestPie',
    static: 'staticHtml',
  };
  return fallbackByKind[String(input.kind || '')] || '';
}

function buildDatasource(binding: WidgetDatasourceBinding) {
  const keys = binding.keys || [];
  return {
    type: 'device',
    entityType: 'DEVICE',
    entityId: binding.deviceId,
    entityName: binding.deviceName,
    keys,
    dataKeys: keys.map((name) => ({ name, type: 'timeseries' })),
    pollMs: binding.pollMs || 2000,
  };
}

export function buildWidgetConfig(
  definition: WidgetRegistryItem,
  title: string,
  config?: AnyRecord,
  binding?: WidgetDatasourceBinding,
) {
  let merged = mergeWidgetConfig(definition.defaultConfig, config);
  merged.title = title;

  if (binding) {
    const datasource = mergeWidgetConfig(merged.datasource || {}, buildDatasource(binding));
    merged.datasource = datasource;
    merged.datasources = [datasource];
  }

  return definition.buildConfig({ title, config: merged, binding });
}

export function createWidgetInstance(key: string, options: CreateWidgetInstanceOptions = {}): DashboardWidget | null {
  const definition = getWidgetDefinition(key);
  if (!definition) return null;

  const title = options.title || definition.title;
  const id = options.id || `widget_${key}_${Date.now()}`;

  return {
    id,
    category: definition.category,
    widgetKey: definition.key,
    definitionVersion: definition.version,
    typeFullFqn: definition.typeFullFqn,
    title,
    config: buildWidgetConfig(definition, title, options.config, options.binding) as TbWidgetConfig,
    appearance: {
      ...definition.defaultAppearance,
      ...(options.appearance || {}),
    },
  };
}

export function normalizeWidgetInstance(raw: any, fallbackId?: string): DashboardWidget | null {
  if (!raw || typeof raw !== 'object') return null;
  const key = resolveWidgetDefinitionKey(raw);
  const definition = getWidgetDefinition(key);
  if (!definition) return null;

  return createWidgetInstance(key, {
    id: String(raw.id || fallbackId || `widget_${key}_${Date.now()}`),
    title: raw.title || definition.title,
    config: raw.config || {},
    appearance: raw.appearance || {},
  });
}

export function normalizeWidgetRecord(rawWidgets: unknown): Record<string, DashboardWidget> {
  const source = isPlainObject(rawWidgets) ? rawWidgets : {};
  const normalized: Record<string, DashboardWidget> = {};

  Object.entries(source).forEach(([id, raw]) => {
    const widget = normalizeWidgetInstance(raw, id);
    if (widget) normalized[id] = widget;
  });

  return normalized;
}

export function normalizeWidgetList(rawWidgets: unknown): DashboardWidget[] {
  return (Array.isArray(rawWidgets) ? rawWidgets : [])
    .map((raw) => normalizeWidgetInstance(raw))
    .filter((widget): widget is DashboardWidget => Boolean(widget));
}
