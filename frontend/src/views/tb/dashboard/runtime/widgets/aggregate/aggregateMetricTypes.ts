export type AggregateFunction = 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';

export type TemplateDeviceSelector =
  | { type: 'device-category'; deviceCategory: string }
  | { type: 'device-profile'; deviceProfile: string }
  | { type: 'explicit-devices'; deviceIds: string[] }
  | { type: 'all-template-devices' };

export interface AggregateMetricWidgetConfig {
  type: 'aggregate-metric';
  title: string;
  dataSource: {
    scope: 'template-devices';
    entityType: 'DEVICE';
    selector: TemplateDeviceSelector;
    telemetryKey: string;
  };
  aggregation: {
    function: AggregateFunction;
    valueMode: 'LATEST';
    missingValueStrategy: 'IGNORE' | 'ZERO';
    invalidValueStrategy: 'IGNORE';
  };
  display: {
    unit?: string;
    decimals?: number;
    prefix?: string;
    suffix?: string;
  };
  refresh: {
    mode: 'WEBSOCKET';
    renderThrottleMs?: number;
    staleAfterMs?: number;
  };
  aggregationSource: 'CLIENT_TEMPLATE' | 'PRECOMPUTED_ENTITY';
  precomputedEntity?: {
    entityType: 'DEVICE' | 'ASSET';
    entityId: string;
    telemetryKey: string;
  };
}

export interface AggregateResult {
  value: number | null;
  validEntityCount: number;
  totalEntityCount: number;
  missingEntityCount: number;
  latestTimestamp: number | null;
}

export interface LatestTelemetryValue {
  ts: number;
  value: unknown;
}

export const TOTAL_ELECTRICITY_AGGREGATE_CONFIG: AggregateMetricWidgetConfig = {
  type: 'aggregate-metric',
  title: '\u603b\u7528\u7535\u91cf',
  dataSource: {
    scope: 'template-devices',
    entityType: 'DEVICE',
    selector: {
      type: 'device-category',
      deviceCategory: 'electricity_consumption',
    },
    telemetryKey: 'electricityConsumption',
  },
  aggregation: {
    function: 'SUM',
    valueMode: 'LATEST',
    missingValueStrategy: 'IGNORE',
    invalidValueStrategy: 'IGNORE',
  },
  display: {
    unit: 'kWh',
    decimals: 2,
  },
  refresh: {
    mode: 'WEBSOCKET',
    renderThrottleMs: 100,
    staleAfterMs: 30000,
  },
  aggregationSource: 'CLIENT_TEMPLATE',
};

function stringValue(value: unknown, fallback: string) {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function numberValue(value: unknown, fallback: number) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeSelector(value: unknown): TemplateDeviceSelector {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const type = String(raw.type || 'device-category');
  if (type === 'explicit-devices') {
    return {
      type,
      deviceIds: Array.isArray(raw.deviceIds)
        ? raw.deviceIds
            .map(String)
            .map((id) => id.trim())
            .filter(Boolean)
        : [],
    };
  }
  if (type === 'device-profile') {
    return { type, deviceProfile: stringValue(raw.deviceProfile, '') };
  }
  if (type === 'all-template-devices') return { type };
  return {
    type: 'device-category',
    deviceCategory: stringValue(
      raw.deviceCategory,
      TOTAL_ELECTRICITY_AGGREGATE_CONFIG.dataSource.selector.type === 'device-category'
        ? TOTAL_ELECTRICITY_AGGREGATE_CONFIG.dataSource.selector.deviceCategory
        : '',
    ),
  };
}

export function normalizeAggregateMetricConfig(input?: Record<string, unknown> | null): AggregateMetricWidgetConfig {
  const root = input || {};
  const settings = root.settings && typeof root.settings === 'object' ? (root.settings as Record<string, unknown>) : {};
  const configured =
    settings.aggregateMetric && typeof settings.aggregateMetric === 'object'
      ? (settings.aggregateMetric as Record<string, unknown>)
      : root.aggregateMetric && typeof root.aggregateMetric === 'object'
        ? (root.aggregateMetric as Record<string, unknown>)
        : settings;
  const dataSource =
    configured.dataSource && typeof configured.dataSource === 'object'
      ? (configured.dataSource as Record<string, unknown>)
      : {};
  const aggregation =
    configured.aggregation && typeof configured.aggregation === 'object'
      ? (configured.aggregation as Record<string, unknown>)
      : {};
  const display =
    configured.display && typeof configured.display === 'object' ? (configured.display as Record<string, unknown>) : {};
  const refresh =
    configured.refresh && typeof configured.refresh === 'object' ? (configured.refresh as Record<string, unknown>) : {};
  const aggregateFunction = String(aggregation.function || 'SUM').toUpperCase();
  const supportedFunctions: AggregateFunction[] = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'];
  const telemetryKey = stringValue(
    settings.key ?? dataSource.telemetryKey,
    TOTAL_ELECTRICITY_AGGREGATE_CONFIG.dataSource.telemetryKey,
  );

  return {
    type: 'aggregate-metric',
    title: stringValue(configured.title ?? root.title, TOTAL_ELECTRICITY_AGGREGATE_CONFIG.title),
    dataSource: {
      scope: 'template-devices',
      entityType: 'DEVICE',
      selector: normalizeSelector(dataSource.selector),
      telemetryKey,
    },
    aggregation: {
      function: supportedFunctions.includes(aggregateFunction as AggregateFunction)
        ? (aggregateFunction as AggregateFunction)
        : 'SUM',
      valueMode: 'LATEST',
      missingValueStrategy: aggregation.missingValueStrategy === 'ZERO' ? 'ZERO' : 'IGNORE',
      invalidValueStrategy: 'IGNORE',
    },
    display: {
      unit: stringValue(display.unit, TOTAL_ELECTRICITY_AGGREGATE_CONFIG.display.unit || ''),
      decimals: Math.max(0, Math.min(10, numberValue(settings.decimals ?? display.decimals, 2))),
      prefix: display.prefix == null ? undefined : String(display.prefix),
      suffix: display.suffix == null ? undefined : String(display.suffix),
    },
    refresh: {
      mode: 'WEBSOCKET',
      renderThrottleMs: Math.max(0, numberValue(refresh.renderThrottleMs, 100)),
      staleAfterMs: Math.max(0, numberValue(refresh.staleAfterMs, 30000)),
    },
    aggregationSource: configured.aggregationSource === 'PRECOMPUTED_ENTITY' ? 'PRECOMPUTED_ENTITY' : 'CLIENT_TEMPLATE',
    precomputedEntity:
      configured.precomputedEntity && typeof configured.precomputedEntity === 'object'
        ? (configured.precomputedEntity as AggregateMetricWidgetConfig['precomputedEntity'])
        : undefined,
  };
}
