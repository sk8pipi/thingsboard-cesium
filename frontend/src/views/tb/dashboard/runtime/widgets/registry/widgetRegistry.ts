import TbCesiumMap from '../TbCesiumMap.vue';
import TbTimeseriesLine from '../timeseries/TbTimeseriesLine.vue';
import TbLatestPie from '../latest/TbLatestPie.vue';
import TbLatestBar from '../latest/TbLatestBar.vue';
import TbLatestPolarArea from '../latest/TbLatestPolarArea.vue';
import TbLatestRadar from '../latest/TbLatestRadar.vue';
import TbHtmlCard from '../static/TbHtmlCard.vue';
import TbControlSwitch from '../control/TbControlSwitch.vue';
import TbLedIndicator from '../timeseries/TbLedIndicator.vue';
import TbTimeseriesScatter from '../timeseries/TbTimeseriesScatter.vue';
import TbStateChart from '../timeseries/TbStateChart.vue';
import TbTimeseriesBarWithLabels from '../timeseries/TbTimeseriesBarWithLabels.vue';
import TbRangeChart from '../timeseries/TbRangeChart.vue';

import TbAlarmTableWidget from '../alarm/widgets/TbAlarmTableWidget.vue';
import TbAlarmCardWidget from '../alarm/widgets/TbAlarmCardWidget.vue';

import type { LocalWidgetKey } from '../../types';
export type { LocalWidgetKey } from '../../types';
import { createWidgetCatalog } from '../core/widgetDefinition';
import type { WidgetDefinition } from '../core/widgetDefinition';

const builtinWidgetRegistry: Record<string, WidgetDefinition> = {
  cesium3d: {
    key: 'cesium3d',
    typeFullFqn: 'system.cesium3d',
    category: 'static',
    title: 'Cesium 地图',
    component: TbCesiumMap,
    editor: 'static',
    supportsTimewindow: false,
    allowedKeyTypes: [],
    defaultConfig: {},
  },

  timeseriesLine: {
    key: 'timeseriesLine',
    typeFullFqn: 'system.timeseries_line',
    category: 'timeseries',
    title: '时序折线图',
    component: TbTimeseriesLine,
    editor: 'timeseries',
    supportsTimewindow: true,
    allowedKeyTypes: ['timeseries'],
    defaultConfig: {
      showTitle: true,
      timewindow: { intervalMs: 300000, realtime: true },
      settings: {},
    },
  },

  timeseriesScatter: {
    key: 'timeseriesScatter',
    typeFullFqn: 'system.timeseries_scatter',
    category: 'timeseries',
    title: '时序散点图',
    component: TbTimeseriesScatter,
    editor: 'timeseries',
    supportsTimewindow: true,
    allowedKeyTypes: ['timeseries'],
    defaultConfig: {
      showTitle: true,
      timewindow: { intervalMs: 300000, realtime: true },
      settings: {
        title: '时序散点图',
        symbolSize: 10,
      },
    },
  },

  timeseriesBarWithLabels: {
    key: 'timeseriesBarWithLabels',
    typeFullFqn: 'system.timeseries_bar_with_labels',
    category: 'timeseries',
    title: '时序柱状图',
    component: TbTimeseriesBarWithLabels,
    editor: 'timeseries',
    supportsTimewindow: true,
    allowedKeyTypes: ['timeseries'],
    defaultConfig: {
      showTitle: true,
      timewindow: { intervalMs: 3600000, realtime: true },
      settings: {
        position: 'top',
        distance: 6,
        rotate: 0,
        align: 'center',
        verticalAlign: 'middle',
        fontSize: 11,
      },
    },
  },

  rangeChart: {
    key: 'rangeChart',
    typeFullFqn: 'system.range_chart',
    category: 'timeseries',
    title: 'Range chart',
    component: TbRangeChart,
    editor: 'timeseries',
    supportsTimewindow: true,
    allowedKeyTypes: ['timeseries'],
    defaultConfig: {
      showTitle: true,
      timewindow: { intervalMs: 60000, realtime: true },
      settings: {
        ranges: [
          { label: '< -20', min: null, max: -20, color: '#1d4ed8' },
          { label: '-20 - 0', min: -20, max: 0, color: '#2563eb' },
          { label: '0 - 10', min: 0, max: 10, color: '#60a5fa' },
          { label: '10 - 20', min: 10, max: 20, color: '#f59e0b' },
          { label: '20 - 30', min: 20, max: 30, color: '#f97316' },
          { label: '30 - 40', min: 30, max: 40, color: '#ef4444' },
          { label: '>= 40', min: 40, max: null, color: '#be123c' },
        ],
      },
    },
  },

  stateChart: {
    key: 'stateChart',
    typeFullFqn: 'system.state_chart',
    category: 'timeseries',
    title: '状态图',
    component: TbStateChart,
    editor: 'timeseries',
    supportsTimewindow: true,
    allowedKeyTypes: ['timeseries'],
    defaultConfig: {
      showTitle: true,
      timewindow: { intervalMs: 3600000, realtime: true },
      settings: {
        stepPosition: 'end',
      },
    },
  },

  latestPie: {
    key: 'latestPie',
    typeFullFqn: 'system.latest_pie',
    category: 'latest',
    title: '最新值饼图',
    component: TbLatestPie,
    editor: 'latest',
    supportsTimewindow: false,
    allowedKeyTypes: ['timeseries', 'attribute', 'entityField'],
    defaultConfig: {
      showTitle: true,
      tbPie: {},
    },
  },

  latestBar: {
    key: 'latestBar',
    typeFullFqn: 'system.latest_bar',
    category: 'latest',
    title: '最新值柱状图',
    component: TbLatestBar,
    editor: 'latest',
    supportsTimewindow: false,
    allowedKeyTypes: ['timeseries', 'attribute', 'entityField'],
    defaultConfig: {
      showTitle: true,
      tbBar: {},
    },
  },

  latestRadar: {
    key: 'latestRadar',
    typeFullFqn: 'system.latest_radar',
    category: 'latest',
    title: '最新值雷达图',
    component: TbLatestRadar,
    editor: 'latest',
    supportsTimewindow: false,
    allowedKeyTypes: ['timeseries', 'attribute', 'entityField'],
    defaultConfig: {
      showTitle: true,
      tbRadar: {
        shape: 'polygon',
        radius: '58%',
        splitNumber: 4,
        showTotal: true,
        areaOpacity: 0.2,
        lineWidth: 2,
      },
    },
  },

  latestPolarArea: {
    key: 'latestPolarArea',
    typeFullFqn: 'system.latest_polar_area',
    category: 'latest',
    title: '最新值 Polar Area',
    component: TbLatestPolarArea,
    editor: 'latest',
    supportsTimewindow: false,
    allowedKeyTypes: ['timeseries', 'attribute', 'entityField'],
    defaultConfig: {
      showTitle: true,
      tbPolarArea: {
        radiusInner: 15,
        radiusOuter: 65,
        roseType: 'area',
        borderRadius: 4,
        sort: 'desc',
        showLegend: true,
        showToolbox: false,
        showLabel: true,
      },
    },
  },

  ledIndicator: {
    key: 'ledIndicator',
    typeFullFqn: 'system.led_indicator',
    category: 'timeseries',
    title: 'LED 指示灯',
    component: TbLedIndicator,
    editor: 'timeseries',
    supportsTimewindow: true,
    allowedKeyTypes: ['timeseries'],
    defaultConfig: {
      showTitle: true,
      timewindow: { intervalMs: 300000, realtime: true },
      settings: {
        title: 'LED 指示灯',
        key: 'value',
        parseFunction: 'return !!(data?.value ?? data);',
        onLabel: '开启',
        offLabel: '关闭',
        pollMs: 800,
      },
    },
  },

  staticHtml: {
    key: 'staticHtml',
    typeFullFqn: 'system.html_card',
    category: 'static',
    title: 'HTML 卡片',
    component: TbHtmlCard,
    editor: 'static',
    supportsTimewindow: false,
    allowedKeyTypes: [],
    defaultConfig: {
      showTitle: true,
      content: '这是一个静态 HTML 部件',
      color: '#000',
      backgroundColor: '#fff',
    },
  },

  alarmTable: {
    key: 'alarmTable',
    typeFullFqn: 'system.alarm_table',
    category: 'alarm',
    title: '报警表格',
    component: TbAlarmTableWidget,
    editor: 'alarm',
    supportsTimewindow: true,
    allowedKeyTypes: [],
    defaultConfig: {
      showTitle: true,
      timewindow: { intervalMs: 300000, realtime: true },
      settings: {
        pageSize: 10,
        showSearch: true,
        showPagination: true,
        showAck: true,
        showClear: true,
        showOriginator: true,
        showSeverity: true,
        showStatus: true,
        showType: true,
        showCreatedTime: true,
        dense: false,
        columns: ['name', 'type', 'severity', 'status', 'createdTime', 'originator', 'actions'],
        title: '报警表格',
      },
    },
  },

  alarmCard: {
    key: 'alarmCard',
    typeFullFqn: 'system.alarm_card',
    category: 'alarm',
    title: '报警卡片',
    component: TbAlarmCardWidget,
    editor: 'alarm',
    supportsTimewindow: true,
    allowedKeyTypes: [],
    defaultConfig: {
      showTitle: true,
      timewindow: { intervalMs: 300000, realtime: true },
      settings: {
        pageSize: 10,
        showSearch: true,
        showPagination: true,
        showAck: true,
        showClear: true,
        showOriginator: true,
        showSeverity: true,
        showStatus: true,
        showType: true,
        showCreatedTime: true,
        dense: false,
        title: '报警卡片',
      },
    },
  },
  controlSwitch: {
    key: 'controlSwitch',
    typeFullFqn: 'system.control_switch',
    category: 'control',
    title: '开关控制',
    component: TbControlSwitch,
    editor: 'control',
    supportsTimewindow: false,
    allowedKeyTypes: ['timeseries', 'attribute'],
    defaultConfig: {
      showTitle: true,
      settings: {
        title: '开关控制',
        targetDeviceId: '',

        getValue: {
          enabled: true,
          source: 'latestTelemetry',
          key: 'value',
          rpcMethod: 'getValue',
          rpcTimeout: 5000,
          rpcCallType: 'twoway',
          parseFunction: 'return !!(data?.value ?? data);',
        },

        setValue: {
          enabled: true,
          mode: 'rpc',
          key: 'value',
          rpcMethod: 'setValue',
          rpcTimeout: 5000,
          rpcCallType: 'twoway',
          transformFunction: 'return value;',
        },

        valueSettings: {
          onLabel: '开启',
          offLabel: '关闭',
          optimistic: true,
          disabledWhenOffline: true,
        },
      },
    },
  },
};

const builtinWidgetMetadata: Record<string, Partial<WidgetDefinition>> = {
  cesium3d: {
    hosts: ['dashboard', 'editor'],
    previewKind: 'map',
  },
  timeseriesLine: { previewKind: 'line' },
  timeseriesScatter: { previewKind: 'scatter' },
  timeseriesBarWithLabels: { previewKind: 'bar' },
  rangeChart: { previewKind: 'range' },
  stateChart: { previewKind: 'state' },
  latestPie: {
    previewKind: 'pie',
    buildConfig: ({ config, binding }) => ({
      ...config,
      tbPie: { ...(config.tbPie || {}), ...(binding ? { keys: binding.keys } : {}) },
    }),
  },
  latestBar: {
    previewKind: 'bar',
    buildConfig: ({ config, binding }) => ({
      ...config,
      tbBar: { ...(config.tbBar || {}), ...(binding ? { keys: binding.keys } : {}) },
    }),
  },
  latestRadar: { previewKind: 'radar' },
  latestPolarArea: { previewKind: 'pie' },
  ledIndicator: {
    previewKind: 'led',
    pointDetailPlacement: { columnSpan: 6, height: 150 },
    buildConfig: ({ config, binding, title }) => ({
      ...config,
      settings: {
        ...(config.settings || {}),
        title,
        ...(binding ? { key: binding.keys[0] || 'value' } : {}),
      },
    }),
  },
  staticHtml: {
    previewKind: 'static',
    pointDetailPlacement: { columnSpan: 12, height: 220 },
  },
  alarmTable: {
    previewKind: 'table',
    pointDetailPlacement: { columnSpan: 12, height: 420 },
  },
  alarmCard: {
    previewKind: 'card',
    pointDetailPlacement: { columnSpan: 12, height: 360 },
  },
  controlSwitch: {
    previewKind: 'switch',
    pointDetailPlacement: { columnSpan: 6, height: 150 },
    buildConfig: ({ config, binding, title }) => {
      if (!binding) return config;
      const stateKey = binding.keys[0] || 'value';
      const settings = config.settings || {};
      return {
        ...config,
        datasource: {
          ...(config.datasource || {}),
          keys: [stateKey],
          dataKeys: [{ name: stateKey, type: 'timeseries' }],
        },
        datasources: [
          {
            ...(config.datasource || {}),
            keys: [stateKey],
            dataKeys: [{ name: stateKey, type: 'timeseries' }],
          },
        ],
        settings: {
          ...settings,
          title,
          targetDeviceId: binding.deviceId,
          getValue: { ...(settings.getValue || {}), key: stateKey },
          setValue: { ...(settings.setValue || {}), key: stateKey },
          valueSettings: { ...(settings.valueSettings || {}) },
        },
      };
    },
  },
};

type WidgetManifestModule = {
  default?: WidgetDefinition | WidgetDefinition[];
  widgets?: WidgetDefinition[];
};

const manifestModules = import.meta.glob('../manifests/*.ts', { eager: true }) as Record<string, WidgetManifestModule>;
const discoveredWidgetDefinitions = Object.entries(manifestModules).flatMap(([path, module]) => {
  if (path.endsWith('/index.ts')) return [];
  if (Array.isArray(module.widgets)) return module.widgets;
  if (Array.isArray(module.default)) return module.default;
  return module.default ? [module.default] : [];
});

const builtinWidgetDefinitions = Object.values(builtinWidgetRegistry).map((definition) => ({
  ...definition,
  ...(builtinWidgetMetadata[definition.key] || {}),
}));

export const widgetRegistry = createWidgetCatalog([...builtinWidgetDefinitions, ...discoveredWidgetDefinitions]);
export function getWidgetRegistryItem(key: LocalWidgetKey) {
  return widgetRegistry[key];
}

export function getWidgetRegistryList() {
  return Object.values(widgetRegistry);
}

export function getWidgetByTypeFullFqn(typeFullFqn: string) {
  return Object.values(widgetRegistry).find((item) => item.typeFullFqn === typeFullFqn);
}
