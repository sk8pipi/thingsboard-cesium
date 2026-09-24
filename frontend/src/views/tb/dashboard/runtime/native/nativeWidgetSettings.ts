import type { TbDataKey } from '../types';
import type { NativeOptions, NativeSeriesSettings } from './nativeWidgetTypes';

/** Defaults are applied to a copy; false, zero and unknown extension fields survive editing. */
export function withNativeSettings(options: NativeOptions) {
  const copy: NativeOptions = JSON.parse(JSON.stringify(options));
  return {
    ...copy,
    presentation: {
      layout: 'vertical' as const,
      labelPosition: 'top' as const,
      showValue: true,
      labelFontSize: 12,
      labelColor: '#bcd0df',
      valueColor: '',
      dateFormat: 'locale' as const,
      ...copy.presentation,
    },
    chart: {
      axes: [{ id: 'default', label: '', position: 'left' as const, min: null, max: null }],
      stack: false,
      dataZoom: false,
      legendPosition: 'top' as const,
      tooltip: true,
      animation: false,
      thresholds: [],
      ...copy.chart,
    },
    table: {
      search: false,
      showTimestamp: true,
      stickyHeader: false,
      pagination: true,
      pageSize: 20,
      sortOrder: 'desc' as const,
      ...copy.table,
    },
    progress: {
      direction: 'horizontal' as const,
      showTicks: false,
      trackColor: 'rgba(200,220,255,.12)',
      ...copy.progress,
    },
    gauge: {
      type: 'radial' as const,
      startAngle: 225,
      endAngle: -45,
      splitNumber: 10,
      showTicks: true,
      showPointer: true,
      width: 8,
      ...copy.gauge,
    },
    pie: {
      innerRadius: 0,
      showPercent: false,
      showTotal: false,
      totalLabel: '合计',
      totalDecimals: 0,
      totalUnits: '',
      clockwise: true,
      ...copy.pie,
    },
    latestBar: { horizontal: false, min: null, max: null, barWidth: 40, showAxisLabels: true, ...copy.latestBar },
    range: { fillOpacity: 0.7, outOfRangeColor: '#ccc', showBoundaries: true, ...copy.range },
    state: {
      includePrevious: true,
      extendToEnd: true,
      states: [
        { label: 'Off', value: 0, sourceType: 'constant' as const, sourceValue: false },
        { label: 'On', value: 1, sourceType: 'constant' as const, sourceValue: true },
      ],
      ...copy.state,
    },
    aggregate: { showChart: true, showSubtitle: true, subtitle: '${entityName}', slots: [], ...copy.aggregate },
    liquid: {
      shape: 'Vertical Cylinder',
      layout: 'percentage' as const,
      datasourceUnits: '%',
      capacity: 500,
      capacityUnits: 'L',
      displayUnits: 'L',
      tankColor: { color: '#242770', ranges: [] },
      liquidColor: { color: '#7A8BFF', ranges: [] },
      valueColor: { color: '#dae9f6', ranges: [] },
      backgroundOverlayColor: { color: 'rgba(255,255,255,.16)', ranges: [] },
      volumeColor: '#bcd0df',
      volumeFontSize: 14,
      showOverlay: true,
      animation: true,
      showTooltip: true,
      showTooltipDate: true,
      tooltipUnits: '%',
      tooltipDecimals: 1,
      bindings: {},
      ...copy.liquid,
    },
    radial: {
      min: null,
      max: null,
      startAngle: 90,
      splitNumber: 5,
      showAxisLabels: true,
      showTickLabels: false,
      shape: 'polygon' as const,
      normalizeAxes: false,
      color: '#3F52DD',
      showLine: true,
      lineWidth: 2,
      lineType: 'solid' as const,
      showPoints: true,
      pointSize: 4,
      pointShape: 'circle' as const,
      fillArea: false,
      areaOpacity: 0.4,
      barWidth: 100,
      ...copy.radial,
    },
  };
}

export function nativeSeriesSettings(key: TbDataKey, native: NativeOptions): NativeSeriesSettings {
  return {
    type: native.family === 'bar' ? 'bar' : native.chartType,
    lineWidth: 2,
    smooth: false,
    step: false,
    showPoints: false,
    pointSize: 6,
    area: native.family === 'range',
    axisId: 'default',
    hidden: false,
    showLabel: native.family === 'bar',
    ...JSON.parse(JSON.stringify(key.settings?.native || {})),
    ...(native.family === 'range' ? { type: 'line' as const } : {}),
    ...(native.family === 'state' ? { type: 'line' as const, smooth: false, step: 'end' as const } : {}),
  };
}

export function nativeTimestamp(ts: number, format: string = 'locale', now = Date.now()): string {
  if (!Number.isFinite(ts) || ts < 0) return '更新时间未知';
  const date = new Date(ts);
  if (format === 'relative') {
    const seconds = Math.max(0, Math.floor((now - ts) / 1000));
    return seconds < 60
      ? `${seconds} 秒前`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)} 分钟前`
        : `${Math.floor(seconds / 3600)} 小时前`;
  }
  if (format === 'iso') return date.toISOString();
  if (format === 'date') return date.toLocaleDateString();
  if (format === 'time') return date.toLocaleTimeString();
  return date.toLocaleString();
}
