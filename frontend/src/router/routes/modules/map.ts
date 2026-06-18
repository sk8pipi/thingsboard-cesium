import type { AppRouteRecordRaw } from '/@/router/types';

const map: AppRouteRecordRaw = {
  path: '/map-home',
  name: 'MapHome',
  component: () => import('/@/views/tb/map/MapHome.vue'),
  meta: {
    title: '地图',
    ignoreKeepAlive: true,
    // 权限先不分角色：三个角色都可访问
    // 如果你路由系统有 roles 字段，也可以先不写
  },
};

export default map;
