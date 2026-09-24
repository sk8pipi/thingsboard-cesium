import type { TbDataKey, TbDatasource } from '../types';

export type NativeFamily =
  | 'value'
  | 'valueChart'
  | 'progress'
  | 'gauge'
  | 'timeseries'
  | 'pie'
  | 'bar'
  | 'latestBar'
  | 'radar'
  | 'polar'
  | 'range'
  | 'aggregate'
  | 'liquid'
  | 'state'
  | 'table';
export interface NativeStateSettings {
  includePrevious: boolean;
  extendToEnd: boolean;
  states: {
    label: string;
    value: number;
    sourceType: 'constant' | 'range';
    sourceValue?: string | number | boolean;
    sourceRangeFrom?: number | null;
    sourceRangeTo?: number | null;
  }[];
}
export interface NativePresentation {
  layout: 'vertical' | 'horizontal';
  labelPosition: 'top' | 'bottom' | 'left';
  showValue: boolean;
  labelFontSize: number;
  labelColor: string;
  valueColor: string;
  dateFormat: 'locale' | 'date' | 'time' | 'iso' | 'relative';
}
export interface NativeSeriesSettings {
  type: 'line' | 'bar' | 'scatter';
  lineWidth: number;
  smooth: boolean;
  step: false | 'start' | 'middle' | 'end';
  showPoints: boolean;
  pointSize: number;
  area: boolean;
  axisId: string;
  hidden: boolean;
  showLabel: boolean;
}
export interface NativeAxis {
  id: string;
  label: string;
  position: 'left' | 'right';
  min: number | null;
  max: number | null;
}
export interface NativeChartSettings {
  axes: NativeAxis[];
  stack: boolean;
  dataZoom: boolean;
  legendPosition: 'top' | 'bottom' | 'left' | 'right';
  tooltip: boolean;
  animation: boolean;
  thresholds: { value: number; label: string; color: string; axisId: string }[];
}
export interface NativeTableSettings {
  search: boolean;
  showTimestamp: boolean;
  stickyHeader: boolean;
  pagination: boolean;
  pageSize: number;
  sortOrder: 'asc' | 'desc';
}
export interface NativeProgressSettings {
  direction: 'horizontal' | 'vertical';
  showTicks: boolean;
  trackColor: string;
}
export interface NativeGaugeSettings {
  type: 'radial' | 'arc' | 'linear' | 'thermometer';
  direction?: 'horizontal' | 'vertical';
  startAngle: number;
  endAngle: number;
  splitNumber: number;
  showTicks: boolean;
  showPointer: boolean;
  width: number;
}
export interface NativePieSettings {
  innerRadius: number;
  showPercent: boolean;
  showTotal: boolean;
  totalLabel: string;
  totalDecimals: number;
  totalUnits: string;
  clockwise: boolean;
}
export interface NativeLatestBarSettings {
  horizontal: boolean;
  min: number | null;
  max: number | null;
  barWidth: number;
  showAxisLabels: boolean;
}
export interface NativeRadialSettings {
  min: number | null;
  max: number | null;
  startAngle: number;
  splitNumber: number;
  showAxisLabels: boolean;
  showTickLabels: boolean;
  shape: 'polygon' | 'circle';
  normalizeAxes: boolean;
  color: string;
  showLine: boolean;
  lineWidth: number;
  lineType: 'solid' | 'dashed' | 'dotted';
  showPoints: boolean;
  pointSize: number;
  pointShape: 'circle' | 'rect' | 'roundRect' | 'triangle' | 'diamond' | 'pin' | 'arrow';
  fillArea: boolean;
  areaOpacity: number;
  barWidth: number;
}
export interface NativeAggregateSlot {
  id: string;
  position: 'center' | 'rightTop' | 'rightBottom' | 'leftTop' | 'leftBottom';
  label: string;
  aggregationType: 'NONE' | 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'COUNT';
  comparisonEnabled: boolean;
  timeForComparison: 'previousInterval' | 'customInterval' | 'day' | 'week' | 'month' | 'year';
  comparisonCustomIntervalValue: number;
  comparisonResultType: 'PREVIOUS_VALUE' | 'DELTA_ABSOLUTE' | 'DELTA_PERCENT';
  units: string;
  decimals: number;
  showArrow: boolean;
  fontSize: number;
  color: string;
}
export interface NativeLiquidColor {
  color: string;
  ranges: { from: number | null; to: number | null; color: string }[];
}
export interface NativeLiquidSettings {
  shape: string;
  layout: 'simple' | 'percentage' | 'absolute';
  datasourceUnits: string;
  capacity: number;
  capacityUnits: string;
  displayUnits: string;
  tankColor: NativeLiquidColor;
  liquidColor: NativeLiquidColor;
  valueColor: NativeLiquidColor;
  backgroundOverlayColor: NativeLiquidColor;
  volumeColor: string;
  volumeFontSize: number;
  showOverlay: boolean;
  animation: boolean;
  showTooltip: boolean;
  showTooltipDate: boolean;
  tooltipUnits: string;
  tooltipDecimals: number;
  bindings: Partial<
    Record<
      'shape' | 'capacity' | 'capacityUnits' | 'displayUnits',
      { name: string; scope: 'CLIENT_SCOPE' | 'SERVER_SCOPE' | 'SHARED_SCOPE' }
    >
  >;
}
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
    calendar?: 'day' | 'week' | 'month';
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
  presentation?: NativePresentation;
  chart?: NativeChartSettings;
  table?: NativeTableSettings;
  progress?: NativeProgressSettings;
  gauge?: NativeGaugeSettings;
  pie?: NativePieSettings;
  latestBar?: NativeLatestBarSettings;
  radial?: NativeRadialSettings;
  range?: { fillOpacity: number; outOfRangeColor: string; showBoundaries: boolean };
  liquid?: NativeLiquidSettings;
  state?: NativeStateSettings;
  aggregate?: { showChart: boolean; showSubtitle: boolean; subtitle: string; slots: NativeAggregateSlot[] };
}
