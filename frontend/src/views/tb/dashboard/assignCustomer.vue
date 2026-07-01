<template>
  <BasicModal
    v-bind="$attrs"
    width="40%"
    :show-ok-btn="hasPermission(Authority.TENANT_ADMIN)"
    @register="registerModal"
    @ok="handleSubmit"
  >
    <template #title>
      <Icon :icon="getTitle.icon" class="pr-1 m-1" />
      <span>{{ getTitle.value }}</span>
    </template>

    <p class="mb-2">{{ t('tb.dashboard.action.assignCustomerSelectTip') }}</p>
    <Select
      v-model:value="customerIds"
      size="large"
      style="width: 90%"
      :allow-clear="true"
      mode="multiple"
      :placeholder="t('tb.dashboard.action.assignCustomerSelectTip')"
      max-tag-count="responsive"
    >
      <Select.Option
        v-for="(customer, index) in customerListData"
        :key="customer.id.id || index"
        :value="customer.id.id"
      >
        {{ customer.title }}
      </Select.Option>
    </Select>

    <div v-if="templateDeviceCount" class="mt-4 rounded border border-gray-200 p-3">
      <Checkbox v-model:checked="syncTemplateDevices">同时将模板绑定设备分配给所选客户</Checkbox>
      <p class="mt-2 mb-0 text-xs text-gray-500">
        模板共引用 {{ templateDeviceCount }} 台设备。ThingsBoard
        原生权限下一台设备只能归属一个客户；模板包含设备时只能同步给一个客户。
      </p>
    </div>
  </BasicModal>
</template>

<script lang="ts" setup name="ViewsTbDashboardAssignToCustomerForm">
  import { computed, ref, unref } from 'vue';
  import { Checkbox, Select } from 'ant-design-vue';
  import { Icon } from '/@/components/Icon';
  import { BasicModal, useModalInner } from '/@/components/Modal';
  import { getDashboardById, updateDashboardCustomers, type Dashboard } from '/@/api/tb/dashboard';
  import { assignDeviceToCustomer } from '/@/api/tb/device';
  import { customerList, type Customer } from '/@/api/tb/customer';
  import { Authority } from '/@/enums/authorityEnum';
  import { useI18n } from '/@/hooks/web/useI18n';
  import { useMessage } from '/@/hooks/web/useMessage';
  import { usePermission } from '/@/hooks/web/usePermission';
  import { router } from '/@/router';
  import { DASHBOARD_MAP_WIDGET_CONFIG_KEY } from '../map/mapTemplateConfig';
  import {
    collectMapTemplateDeviceRefs,
    formatTemplateDeviceNames,
    inspectMapTemplateDeviceAccess,
    isUnassignedCustomerId,
  } from '../map/mapTemplateDeviceAccess';

  const emit = defineEmits(['success', 'register']);
  const { hasPermission } = usePermission();
  const { t } = useI18n('tb');
  const { showMessage } = useMessage();
  const { meta } = unref(router.currentRoute);

  const dashboardInfo = ref<Dashboard>({ configuration: {} } as Dashboard);
  const customerListData = ref<Customer[]>([]);
  const customerIds = ref<string[]>([]);
  const syncTemplateDevices = ref(true);
  const templateDeviceCount = computed(
    () => collectMapTemplateDeviceRefs(dashboardInfo.value.configuration?.[DASHBOARD_MAP_WIDGET_CONFIG_KEY]).length,
  );
  const getTitle = computed(() => ({
    icon: meta.icon || 'ant-design:book-outlined',
    value: t('tb.dashboard.action.assignCustomer'),
  }));

  const [registerModal, { setModalProps, closeModal }] = useModalInner(async (data) => {
    setModalProps({ loading: true });
    try {
      const [dashboard, customerResult] = await Promise.all([
        getDashboardById(data.id.id),
        customerList({
          pageSize: 2147483647,
          page: 0,
          sortProperty: 'title',
          sortOrder: 'ASC',
        }),
      ]);
      dashboardInfo.value = dashboard;
      customerIds.value = Array.isArray(dashboard.assignedCustomers)
        ? dashboard.assignedCustomers
            .filter((customer) => !customer.public)
            .map((customer) => customer.customerId?.id)
            .filter((id): id is string => Boolean(id))
        : [];
      customerListData.value = customerResult.data;
      syncTemplateDevices.value = true;
    } finally {
      setModalProps({ loading: false });
    }
  });

  async function syncDevicesToSelectedCustomer() {
    const template = dashboardInfo.value.configuration?.[DASHBOARD_MAP_WIDGET_CONFIG_KEY];
    const refs = collectMapTemplateDeviceRefs(template);
    if (!syncTemplateDevices.value || !refs.length || !customerIds.value.length) return;

    if (customerIds.value.length !== 1) {
      throw new Error('模板绑定了设备时，只能选择一个客户同步分配设备。');
    }

    const targetCustomerId = customerIds.value[0];
    const access = await inspectMapTemplateDeviceAccess(template);
    const inaccessible = access.filter((item) => !item.device);
    if (inaccessible.length) {
      throw new Error(`模板包含不属于当前租户或已失效的设备：${formatTemplateDeviceNames(inaccessible)}`);
    }

    const conflicts = access.filter((item) => {
      const currentCustomerId = item.device?.customerId?.id;
      return !isUnassignedCustomerId(currentCustomerId) && currentCustomerId !== targetCustomerId;
    });
    if (conflicts.length) {
      throw new Error(`以下设备已分配给其他客户，未自动改派：${formatTemplateDeviceNames(conflicts)}`);
    }

    const pending = access.filter((item) => item.device?.customerId?.id !== targetCustomerId);
    await Promise.all(pending.map((item) => assignDeviceToCustomer(targetCustomerId, item.ref.deviceId)));
  }

  async function handleSubmit() {
    try {
      setModalProps({ confirmLoading: true });
      await syncDevicesToSelectedCustomer();
      const result = await updateDashboardCustomers(dashboardInfo.value.id.id, customerIds.value);
      showMessage(t('tb.dashboard.action.assignCustomerSuccess'));
      setTimeout(closeModal);
      emit('success', result);
    } catch (error: any) {
      showMessage(error?.message || t('common.validateError'), 'error');
      console.error('[DashboardAssignCustomer] Failed to assign dashboard:', error);
    } finally {
      setModalProps({ confirmLoading: false });
    }
  }
</script>
