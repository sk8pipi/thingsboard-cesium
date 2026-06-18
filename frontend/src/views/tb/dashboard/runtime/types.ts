export type WidgetCategory = 'timeseries' | 'latest' | 'control' | 'alarm' | 'static';

export type LocalWidgetKey =
  | 'cesium3d'
  | 'timeseriesLine'
  | 'latestPie'
  | 'latestBar'
  | 'staticHtml'
  | 'alarmTable'
  | 'alarmCard'
  | 'controlSwitch'
  | 'ledIndicator'
  | 'timeseriesScatter'
  | 'latestRadar'
  | 'latestPolarArea'
  | 'stateChart'
  | 'timeseriesBarWithLabels'
  | 'rangeChart';

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
  typeFullFqn?: string;
  title: string;
  config: TbWidgetConfig;
}
