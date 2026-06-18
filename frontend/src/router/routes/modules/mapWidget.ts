import type { AppRouteRecordRaw } from '/@/router/types';

const mapWidget: AppRouteRecordRaw = {
  path: '/map-widget',
  name: 'MapWidget',
  component: () => import('/@/views/tb/map/MapWidgetEditor.vue'),
  meta: {
    title: '地图部件',
    hideMenu: true,
    ignoreKeepAlive: true,
  },
};

export default mapWidget;
