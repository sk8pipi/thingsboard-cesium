import { useUserStoreWithOut } from '/@/store/modules/user';

export function getMapWidgetStorageKey() {
  const userStore = useUserStoreWithOut();
  const a = String(userStore.getAuthority || 'UNKNOWN'); // SYS_ADMIN / TENANT_ADMIN / CUSTOMER_USER
  const tenantId = userStore.getPageCacheByKey('tenantId', 'noTenant');
  const customerId = userStore.getPageCacheByKey('customerId', 'noCustomer');

  // 你想要：用户是租户子集、租户是系统子集 —— 这里先做“各自独立”
  if (a === 'SYS_ADMIN') return `tb_map_widgets_SYS_ADMIN`;
  if (a === 'TENANT_ADMIN') return `tb_map_widgets_TENANT_${tenantId}`;
  return `tb_map_widgets_USER_${tenantId}_${customerId}`;
}
