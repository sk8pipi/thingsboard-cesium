import TbAlarmTrendWidget from '../alarm/widgets/TbAlarmTrendWidget.vue';
import type { WidgetDefinition } from '../core/widgetDefinition';

export const widgets: WidgetDefinition[] = [
  {
    key: 'alarmTrend',
    typeFullFqn: 'system.alarm_trend',
    category: 'alarm',
    title: '报警趋势',
    component: TbAlarmTrendWidget,
    editor: 'alarm',
    supportsTimewindow: false,
    allowedKeyTypes: [],
    hosts: ['dashboard', 'editor'],
    dataProvider: 'static',
    previewKind: 'bar',
    defaultConfig: {
      showTitle: true,
      settings: {
        pollMs: 60_000,
        pageSize: 100,
      },
    },
    dashboardPlacement: { width: 7, height: 5, minWidth: 4, minHeight: 4 },
  },
];

export default widgets;
