import TbAlarmTableWidget from './widgets/TbAlarmTableWidget.vue';
import TbAlarmCardWidget from './widgets/TbAlarmCardWidget.vue';

export const alarmWidgetDefinitions = [
  {
    type: 'alarmTable',
    key: 'alarmTable',
    title: '报警表格',
    category: 'alarm',
    component: TbAlarmTableWidget,
  },
  {
    type: 'alarmCard',
    key: 'alarmCard',
    title: '报警卡片',
    category: 'alarm',
    component: TbAlarmCardWidget,
  },
];

export { TbAlarmTableWidget, TbAlarmCardWidget };

export default alarmWidgetDefinitions;
