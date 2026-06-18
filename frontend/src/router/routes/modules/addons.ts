import type { AppRouteRecordRaw } from '/@/router/types';

const addons: AppRouteRecordRaw[] = [
  {
    path: '/addon',
    name: 'AddonRoot',
    component: () => import('/@/layouts/default/index.vue'),
    meta: { title: 'Addon', hideMenu: true },
    children: [
      {
        path: 'dashboard-preview',
        name: 'AddonDashboardPreview',
        component: () => import('/@/addons/dashboard-runtime/pages/DashboardPreview.vue'),
        meta: { title: 'Dashboard Preview', hideMenu: true },
      },
    ],
  },
];

export default addons;
