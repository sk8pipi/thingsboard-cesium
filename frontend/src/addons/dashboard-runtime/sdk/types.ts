import type { EntityType } from '/@/enums/entityTypeEnum';

export type WidgetKind = 'singleValue' | 'timeseries' | 'unknown';

export interface EntityRef {
  entityType: EntityType;
  id: string;
}

export interface Timewindow {
  startTs: number;
  endTs: number;
  interval?: number;
  limit?: number;
  agg?: 'MIN' | 'MAX' | 'AVG' | 'SUM' | 'COUNT' | 'NONE';
  orderBy?: 'ASC' | 'DESC';
}

export interface ParsedWidget {
  id: string;
  title: string;
  kind: WidgetKind;
  entity?: EntityRef;
  keys: string[];
  timewindow: Timewindow;
  raw?: any; // 保留原始 widget 以便后续增强
}

export interface ParsedDashboard {
  id: string;
  title: string;
  widgets: ParsedWidget[];
  raw?: any;
}
