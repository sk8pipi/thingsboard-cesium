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
  ['bar', '带标签历史柱形图'],
  ['latestBar', '最新值柱形图'],
  ['radar', '雷达图'],
  ['polar', '极区图'],
  ['range', '范围图'],
  ['aggregate', '聚合数值卡'],
  ['liquid', '液位容器'],
  ['battery', '电池电量'],
  ['signal', '信号强度'],
  ['wind', '风速风向'],
  ['rpcButton', 'RPC 按钮'],
  ['control', '设备控制'],
  ['advancedControl', '控制、RPC 与 GPIO'],
  ['multiInput', '多属性更新'],
  ['count', '实体与告警计数'],
  ['attributeCard', '属性卡片'],
  ['alarmTable', '告警表格'],
  ['deviceClaim', '设备认领'],
  ['entityHierarchy', '实体层级'],
  ['entityTable', '实体表格'],
  ['input', '属性与遥测输入'],
  ['locationInput', '位置输入'],
  ['photoInput', '拍照输入'],
  ['ledIndicator', 'LED 指示灯'],
  ['state', '状态图'],
  ['table', '历史数据表'],
];

export const widgets: WidgetDefinition[] = families.map(([family, title]) => {
  const historical = ['valueChart', 'timeseries', 'bar', 'table', 'range', 'aggregate', 'state'].includes(family);
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
    allowedKeyTypes: [
      'rpcButton',
      'control',
      'advancedControl',
      'count',
      'alarmTable',
      'deviceClaim',
      'entityHierarchy',
      'entityTable',
      'ledIndicator',
    ].includes(family)
      ? []
      : historical
        ? ['timeseries']
        : ['timeseries', 'attribute'],
    hosts: ['dashboard', 'point-detail', 'editor'],
    dataProvider: 'static',
    previewKind:
      family === 'table'
        ? 'table'
        : family === 'pie'
          ? 'pie'
          : ['bar', 'latestBar'].includes(family)
            ? 'bar'
            : historical
              ? 'line'
              : 'card',
    defaultConfig: { showTitle: true, native, datasources: [] },
    defaultAppearance: { surface: 'clear-glass', backgroundOpacity: 0.04, blurPx: 0 },
    dashboardPlacement: { width: 5, height: 4 },
    pointDetailPlacement: { columnSpan: 12, height: 280 },
  };
});
