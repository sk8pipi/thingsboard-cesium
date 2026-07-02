export type WidgetCategory = 'timeseries' | 'latest' | 'control' | 'alarm' | 'static';

/**
 * Built-in and extension widgets share the same string key space.
 * Runtime validation is handled by the widget catalog so adding a manifest
 * does not require expanding a central union type.
 */
export type LocalWidgetKey = string;
export type WidgetType = LocalWidgetKey;

export type WidgetHostKind = 'dashboard' | 'point-detail' | 'editor';

export type WidgetDataProviderKey =
  | 'telemetry-timeseries'
  | 'telemetry-latest'
  | 'alarm'
  | 'control'
  | 'static'
  | 'custom';

export interface WidgetAppearance {
  surface?: 'clear-glass' | 'none';
  backgroundOpacity?: number;
  blurPx?: number;
  borderOpacity?: number;
  accentColor?: string;
  radiusPx?: number;
  shadowStrength?: number;
}

export type TbDataKeyType = 'timeseries' | 'attribute' | 'entityField' | 'alarmField';

export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TbDataKey {
  name: string;
  type: TbDataKeyType;
  label?: string;
  color?: string;
  units?: string;
  decimals?: number;
  settings?: Record<string, any>;
}

export interface TbDatasource {
  type: 'device' | 'entity' | 'entityAlias';
  name?: string;
  entityType?: string;
  entityId?: string;
  keys?: string[];
  dataKeys?: TbDataKey[];
  pollMs?: number;
}

export interface TbWidgetConfig {
  title?: string;
  showTitle?: boolean;
  datasource?: TbDatasource;
  datasources?: TbDatasource[];
  settings?: Record<string, any>;
  timewindow?: {
    intervalMs?: number;
    realtime?: boolean;
  };
  [key: string]: any;
}

export interface DashboardWidget {
  id: string;
  category: WidgetCategory;
  widgetKey: LocalWidgetKey;
  type?: LocalWidgetKey;
  definitionVersion?: number;
  typeFullFqn?: string;
  title: string;
  config: TbWidgetConfig;
  appearance?: WidgetAppearance;
}
