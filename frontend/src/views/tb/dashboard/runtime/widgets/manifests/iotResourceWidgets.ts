import TbDeviceKpiOverview from '../aggregate/TbDeviceKpiOverview.vue';
import TbDeviceTypeDonut from '../aggregate/TbDeviceTypeDonut.vue';
import TbElectricityUsage from '../aggregate/TbElectricityUsage.vue';
import TbWaterUsage from '../aggregate/TbWaterUsage.vue';
import TbAreaKeyCompareBar from '../aggregate/TbAreaKeyCompareBar.vue';
import type { WidgetDefinition } from '../core/widgetDefinition';

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
    key: 'iotElectricityUsage',
    typeFullFqn: 'system.iot_electricity_usage',
    category: 'aggregate',
    title: '用电量统计',
    component: TbElectricityUsage,
    editor: 'static',
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
    editor: 'static',
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
    typeFullFqn: 'system.iot_area_key_compare_bar',
    category: 'aggregate',
    title: '区域 key 对比柱状图',
    component: TbAreaKeyCompareBar,
    editor: 'aggregate',
    supportsTimewindow: true,
    allowedKeyTypes: ['timeseries'],
    hosts: ['dashboard', 'editor'],
    dataProvider: 'static',
    previewKind: 'bar',
    defaultConfig: {
      showTitle: true,
      settings: {
        title: '区域 key 对比',
        deviceSelector: { mode: 'manual', devices: [] },
        keys: [],
        cumulativeKeys: ['electricityConsumption', 'waterConsumption'],
        timeRange: 'today',
      },
    },
    dashboardPlacement: { width: 7, height: 5 },
  },
];

export default widgets;
