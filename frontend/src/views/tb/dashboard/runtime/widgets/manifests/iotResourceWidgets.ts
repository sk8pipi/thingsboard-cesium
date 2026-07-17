import TbDeviceKpiOverview from '../aggregate/TbDeviceKpiOverview.vue';
import TbDeviceTypeDonut from '../aggregate/TbDeviceTypeDonut.vue';
import TbElectricityUsage from '../aggregate/TbElectricityUsage.vue';
import TbWaterUsage from '../aggregate/TbWaterUsage.vue';
import TbAssetKeyTrendLine from '../aggregate/TbAssetKeyTrendLine.vue';
import type { WidgetDefinition } from '../core/widgetDefinition';
import AggregateMetricWidget from '../aggregate/AggregateMetricWidget.vue';
import { TOTAL_ELECTRICITY_AGGREGATE_CONFIG } from '../aggregate/aggregateMetricTypes';

export const widgets: WidgetDefinition[] = [
  {
    key: 'iotDeviceKpiOverview',
    typeFullFqn: 'system.iot_device_kpi_overview',
    category: 'aggregate',
    title: '设备总览 KPI',
    component: TbDeviceKpiOverview,
    editor: 'static',
    supportsTimewindow: false,
    allowedKeyTypes: [],
    hosts: ['dashboard', 'editor'],
    dataProvider: 'static',
    previewKind: 'card',
    defaultConfig: { showTitle: true, settings: {} },
    dashboardPlacement: { width: 4, height: 3 },
  },
  {
    key: 'iotDeviceTypeDonut',
    typeFullFqn: 'system.iot_device_type_donut',
    category: 'aggregate',
    title: '设备类型在线环形图',
    component: TbDeviceTypeDonut,
    editor: 'static',
    supportsTimewindow: false,
    allowedKeyTypes: [],
    hosts: ['dashboard', 'editor'],
    dataProvider: 'static',
    previewKind: 'pie',
    defaultConfig: { showTitle: true, settings: {} },
    dashboardPlacement: { width: 4, height: 4 },
  },
  {
    key: 'iotTotalElectricity',
    typeFullFqn: 'system.iot_total_electricity',
    category: 'aggregate',
    title: '\u603b\u7528\u7535\u91cf',
    component: AggregateMetricWidget,
    editor: 'aggregate',
    supportsTimewindow: false,
    allowedKeyTypes: ['timeseries'],
    hosts: ['dashboard', 'editor'],
    dataProvider: 'static',
    previewKind: 'card',
    defaultConfig: {
      showTitle: true,
      settings: {
        key: 'electricityConsumption',
        decimals: 2,
        aggregateMetric: TOTAL_ELECTRICITY_AGGREGATE_CONFIG,
      },
    },
    dashboardPlacement: { width: 4, height: 3 },
  },
  {
    key: 'iotElectricityUsage',
    typeFullFqn: 'system.iot_electricity_usage',
    category: 'aggregate',
    title: '用电量统计',
    component: TbElectricityUsage,
    editor: 'aggregate',
    supportsTimewindow: true,
    allowedKeyTypes: ['timeseries'],
    hosts: ['dashboard', 'editor'],
    dataProvider: 'static',
    previewKind: 'line',
    defaultConfig: {
      showTitle: true,
      settings: {
        key: 'electricityConsumption',
        cumulativeKeys: ['electricityConsumption'],
        decimals: 1,
        pollMs: 60000,
      },
    },
    dashboardPlacement: { width: 7, height: 5 },
  },
  {
    key: 'iotWaterUsage',
    typeFullFqn: 'system.iot_water_usage',
    category: 'aggregate',
    title: '用水量统计',
    component: TbWaterUsage,
    editor: 'aggregate',
    supportsTimewindow: true,
    allowedKeyTypes: ['timeseries'],
    hosts: ['dashboard', 'editor'],
    dataProvider: 'static',
    previewKind: 'line',
    defaultConfig: {
      showTitle: true,
      settings: {
        key: 'waterConsumption',
        cumulativeKeys: ['waterConsumption'],
        decimals: 1,
        pollMs: 60000,
      },
    },
    dashboardPlacement: { width: 7, height: 5 },
  },
  {
    key: 'iotAreaKeyCompareBar',
    version: 2,
    typeFullFqn: 'system.iot_area_key_compare_bar',
    category: 'aggregate',
    title: '资产 Key 趋势折线图',
    component: TbAssetKeyTrendLine,
    editor: 'aggregate',
    supportsTimewindow: true,
    allowedKeyTypes: ['timeseries'],
    hosts: ['dashboard', 'editor'],
    dataProvider: 'static',
    previewKind: 'line',
    defaultConfig: {
      showTitle: true,
      settings: {
        title: '资产 Key 趋势',
        sourceAssetId: '',
        sourceAssetName: '',
        sourceTelemetryKey: '',
        unit: '',
        timeRange: 'last24h',
        pollMs: 60000,
        decimals: 2,
      },
    },
    dashboardPlacement: { width: 7, height: 5 },
  },
];

export default widgets;
