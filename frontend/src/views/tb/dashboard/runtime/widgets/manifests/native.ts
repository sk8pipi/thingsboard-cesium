import NativeWidgetRenderer from '../../native/NativeWidgetRenderer.vue';
import type { NativeFamily, NativeOptions } from '../../native/nativeWidgetTypes';
import type { WidgetDefinition } from '../core/widgetDefinition';

const families: [NativeFamily, string][] = [
  ['value', '数值卡片'],
  ['valueChart', '数值与趋势'],
  ['progress', '进度条'],
  ['gauge', '仪表盘'],
  ['timeseries', '时序图'],
  ['pie', '最新值饼图'],
  ['bar', '最新值条形图'],
  ['table', '历史数据表'],
];

export const widgets: WidgetDefinition[] = families.map(([family, title]) => {
  const historical = ['valueChart', 'timeseries', 'table'].includes(family);
  const native: NativeOptions = {
    version: 1,
    fqn: `vue.native.${family}`,
    family,
    window: { realtime: true, durationMs: 3600000, intervalMs: 60000, aggregation: 'NONE' },
    pollMs: 5000,
    min: 0,
    max: 100,
    showLegend: true,
    showDate: true,
    showLabel: true,
    fontSize: 24,
    chartType: 'line',
    thresholds: [],
  };
  return {
    key: `native_${family}`,
    typeFullFqn: `vue.native.${family}`,
    title,
    category: historical ? 'timeseries' : 'latest',
    component: NativeWidgetRenderer,
    editor: historical ? 'timeseries' : 'latest',
    supportsTimewindow: historical,
    allowedKeyTypes: ['timeseries', 'attribute'],
    hosts: ['dashboard', 'point-detail', 'editor'],
    dataProvider: 'static',
    previewKind:
      family === 'table' ? 'table' : family === 'pie' ? 'pie' : family === 'bar' ? 'bar' : historical ? 'line' : 'card',
    defaultConfig: { showTitle: true, native, datasources: [] },
    defaultAppearance: { surface: 'clear-glass', backgroundOpacity: 0.04, blurPx: 0 },
    dashboardPlacement: { width: 5, height: 4 },
    pointDetailPlacement: { columnSpan: 12, height: 280 },
  };
});
