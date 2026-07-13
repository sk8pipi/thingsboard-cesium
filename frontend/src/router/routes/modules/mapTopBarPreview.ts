import type { AppRouteRecordRaw } from '/@/router/types';

const mapTopBarPreview: AppRouteRecordRaw = {
  path: '/map-top-bar-preview',
  name: 'MapTopBarPreview',
  component: () => import('/@/views/tb/map/MapTopBarPreview.vue'),
  meta: {
    title: '\u9876\u90e8\u680f\u9884\u89c8',
    hideMenu: true,
    ignoreKeepAlive: true,
  },
};

export default mapTopBarPreview;
