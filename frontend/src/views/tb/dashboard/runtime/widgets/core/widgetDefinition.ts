import type { Component } from 'vue';
import type {
  TbDataKeyType,
  WidgetAppearance,
  WidgetCategory,
  WidgetDataProviderKey,
  WidgetHostKind,
} from '../../types';

export type WidgetPreviewKind =
  | 'line'
  | 'scatter'
  | 'bar'
  | 'pie'
  | 'radar'
  | 'led'
  | 'state'
  | 'range'
  | 'static'
  | 'table'
  | 'card'
  | 'switch'
  | 'map';

export interface DashboardWidgetPlacement {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
}

export interface PointDetailWidgetPlacement {
  columnSpan: 6 | 12;
  height: number;
  minHeight?: number;
}

export interface WidgetDatasourceBinding {
  deviceId: string;
  deviceName?: string;
  keys: string[];
  pollMs?: number;
}

export interface WidgetConfigBuildContext {
  title: string;
  config: Record<string, any>;
  binding?: WidgetDatasourceBinding;
}

export interface WidgetDefinition {
  key: string;
  version?: number;
  typeFullFqn: string;
  category: WidgetCategory;
  title: string;
  component: Component;
  editor: 'timeseries' | 'latest' | 'static' | 'alarm' | 'control' | 'aggregate';
  supportsTimewindow: boolean;
  allowedKeyTypes: TbDataKeyType[];
  defaultConfig: Record<string, any>;
  hosts?: WidgetHostKind[];
  dataProvider?: WidgetDataProviderKey | string;
  previewKind?: WidgetPreviewKind;
  defaultAppearance?: WidgetAppearance;
  dashboardPlacement?: DashboardWidgetPlacement;
  pointDetailPlacement?: PointDetailWidgetPlacement;
  buildConfig?: (context: WidgetConfigBuildContext) => Record<string, any>;
}

const DEFAULT_APPEARANCE: Required<WidgetAppearance> = {
  surface: 'clear-glass',
  backgroundOpacity: 0.04,
  blurPx: 0,
  borderOpacity: 0.18,
  accentColor: '#6ce9ff',
  radiusPx: 12,
  shadowStrength: 0.2,
};

function defaultProvider(category: WidgetCategory): WidgetDataProviderKey {
  if (category === 'timeseries') return 'telemetry-timeseries';
  if (category === 'latest') return 'telemetry-latest';
  if (category === 'control') return 'control';
  if (category === 'alarm') return 'alarm';
  return 'static';
}

export function defineWidget(definition: WidgetDefinition): Required<WidgetDefinition> {
  return {
    ...definition,
    version: definition.version || 1,
    hosts: definition.hosts || ['dashboard', 'point-detail', 'editor'],
    dataProvider: definition.dataProvider || defaultProvider(definition.category),
    previewKind: definition.previewKind || 'card',
    defaultAppearance: {
      ...DEFAULT_APPEARANCE,
      ...(definition.defaultAppearance || {}),
    },
    dashboardPlacement: {
      width: 5,
      height: 4,
      ...(definition.dashboardPlacement || {}),
    },
    pointDetailPlacement: {
      columnSpan: 12,
      height: 320,
      ...(definition.pointDetailPlacement || {}),
    },
    buildConfig: definition.buildConfig || ((context) => context.config),
  };
}

export function createWidgetCatalog(definitions: WidgetDefinition[]) {
  const catalog: Record<string, Required<WidgetDefinition>> = {};

  definitions.forEach((definition) => {
    const normalized = defineWidget(definition);
    if (catalog[normalized.key]) {
      console.warn(`[widget-catalog] duplicate widget key: ${normalized.key}`);
    }
    catalog[normalized.key] = normalized;
  });

  return catalog;
}

export type WidgetRegistryItem = Required<WidgetDefinition>;
