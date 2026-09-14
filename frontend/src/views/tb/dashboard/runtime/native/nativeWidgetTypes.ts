import type { TbDataKey, TbDatasource } from '../types';

export type NativeFamily = 'value' | 'valueChart' | 'progress' | 'gauge' | 'timeseries' | 'pie' | 'bar' | 'table';
export interface NativeSource extends TbDatasource {
  entityType: 'DEVICE' | 'ASSET';
  entityId: string;
  dataKeys: (TbDataKey & { scope?: 'CLIENT_SCOPE' | 'SERVER_SCOPE' | 'SHARED_SCOPE' })[];
}
export interface NativeOptions {
  version: 1;
  fqn: string;
  family: NativeFamily;
  rawSource?: Record<string, any>;
  window: {
    realtime: boolean;
    durationMs: number;
    startTs?: number;
    endTs?: number;
    intervalMs: number;
    aggregation: 'NONE' | 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'COUNT';
  };
  pollMs: number;
  min: number;
  max: number;
  showLegend: boolean;
  showDate: boolean;
  showLabel: boolean;
  fontSize: number;
  chartType: 'line' | 'bar' | 'scatter';
  thresholds: { from: number | null; to: number | null; color: string }[];
}
