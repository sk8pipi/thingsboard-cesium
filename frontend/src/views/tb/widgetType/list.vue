<template>
  <div class="widget-type-list">
    <BasicTable @register="registerTable">
      <!-- <template #headerTop>
        <div class="text-lg font-bold my-2"> {{ t(getTitle.value) }} </div>
      </template> -->
      <template #tableTitle>
        <div class="space-x-2">
          <a-button type="primary" @click="importVisible = true">
            <Icon icon="i-fluent:add-12-filled" /> 导入 JSON 预览
          </a-button>
          <a-input
            v-model:value="searchParam.textSearch"
            :placeholder="t('common.search.searchText')"
            allow-clear
            @change="reload"
            style="width: 240px"
          >
            <template #suffix>
              <Icon icon="ant-design:search-outlined" />
            </template>
          </a-input>
        </div>
      </template>
      <template #firstColumn="{ record }">
        <a @click="handleDetail({ id: record.id })" :title="record.title">
          {{ record.name }}
        </a>
      </template>
      <template #isSystem="{ record }">
        <Checkbox disabled :checked="isEqual(SYS_TENANT_ID, record.tenantId)" />
      </template>
      <template #deprecated="{ record }">
        <Checkbox disabled :checked="record.deprecated" />
      </template>
      <template #bundles="{ record }">
        <Tag class="!mr-2 !border-rounded-md" v-for="bundle in record.bundles" :key="bundle.id.id">
          {{ bundle.name }}
        </Tag>
      </template>
      <template #support="{ record }">
        <Tag
          :color="getNativeWidgetSupport(record).supported ? 'green' : 'orange'"
          :title="getNativeWidgetSupport(record).reason"
          >{{
            getNativeWidgetSupport(record).supported ? '目录有适配 · 详情核验' : getNativeWidgetSupport(record).label
          }}</Tag
        >
      </template>
    </BasicTable>
    <WidgetDetail :visible="detailVisible" :widget-id="selectedId" @close="detailVisible = false" />
    <ResourceExportModal :visible="exportVisible" kind="widget" :record="exportRecord" @close="exportVisible = false" />
    <ResourceImportModal :visible="importVisible" @close="importVisible = false" />
  </div>
</template>
<script lang="ts">
  export default defineComponent({
    name: 'ViewsTbWidgetTypeList',
  });
</script>
<script lang="ts" setup>
  import { defineComponent, reactive, ref } from 'vue';
  import { useI18n } from '/@/hooks/web/useI18n';
  import { BasicTable, BasicColumn, useTable } from '/@/components/Table';
  import { useMessage } from '/@/hooks/web/useMessage';
  import { Icon } from '/@/components/Icon';
  import { getWidgetTypeList, deleteWidgetType } from '/@/api/tb/widgetType';
  import { Checkbox, Tag } from 'ant-design-vue';
  import { isEqual } from 'lodash-es';
  import { SYS_TENANT_ID } from '/#/constant';
  import { WIDGET_TYPE_OPTIONS } from '/@/enums/widgetTypeEnum';
  import { Authority } from '/@/enums/authorityEnum';
  import { usePermission } from '/@/hooks/web/usePermission';

  import WidgetDetail from './detail.vue';
  import ResourceExportModal from '../widgetsLibrary/ResourceExportModal.vue';
  import ResourceImportModal from '../widgetsLibrary/ResourceImportModal.vue';
  import { getNativeWidgetSupport } from '../dashboard/runtime/native/nativeWidgetCatalog';

  const { t } = useI18n('tb');
  const { createConfirm, showMessage } = useMessage();
  const { hasPermission } = usePermission();

  const detailVisible = ref(false);
  const selectedId = ref('');
  const exportVisible = ref(false);
  const exportRecord = ref<Recordable>({});
  const importVisible = ref(false);

  const searchParam = reactive({
    textSearch: '',
  });
  const tableColumns: BasicColumn[] = [
    { title: 'Vue 运行支持', dataIndex: 'support', width: 160, slot: 'support' },
    {
      title: t('tb.widgetType.table.title'),
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      align: 'left',
      fixed: 'left',
      slot: 'firstColumn',
    },
    {
      title: t('tb.widgetsBundle.title'),
      dataIndex: 'bundles',
      key: 'bundles',
      align: 'left',
      width: 300,
      slot: 'bundles',
    },
    {
      title: t('tb.widgetType.table.type'),
      dataIndex: 'widgetType',
      key: 'widgetType',
      align: 'center',
      width: 120,
      format: (text: any) => (text ? WIDGET_TYPE_OPTIONS.find((item) => item.value === text)?.label || text : ''),
    },
    {
      title: t('tb.widgetType.table.system'),
      dataIndex: 'tenantId',
      key: 'tenantId',
      width: 80,
      align: 'center',
      slot: 'isSystem',
    },
    {
      title: t('tb.widgetType.table.deprecated'),
      dataIndex: 'deprecated',
      key: 'deprecated',
      width: 80,
      align: 'center',
      slot: 'deprecated',
    },
    {
      title: t('tb.widgetType.table.createdTime'),
      dataIndex: 'createdTime',
      key: 'createdTime',
      format: 'date|YYYY-MM-DD HH:mm:ss',
      sorter: true,
      width: 160,
      align: 'center',
    },
  ];

  const actionColumn: BasicColumn = {
    width: 160,
    actions: (record: Recordable) => [
      {
        icon: 'ant-design:download-outlined',
        title: t('tb.widgetType.action.export'),
        onClick: handleDownload.bind(this, { ...record }),
      },
      {
        icon: 'ant-design:delete-outlined',
        color: 'error',
        disabled: !!(hasPermission(Authority.TENANT_ADMIN) && isEqual(SYS_TENANT_ID, record.tenantId)),
        title: t('tb.widgetType.action.delete'),
        onClick: handleDelete.bind(this, { ...record }),
      },
    ],
  };

  const [registerTable, { reload }] = useTable({
    rowKey: (record) => record.id.id,
    api: getWidgetTypeList,
    beforeFetch: wrapFetchParams,
    defSort: { sortProperty: 'name', sortOrder: 'ASC' },
    columns: tableColumns,
    actionColumn: actionColumn,
    showTableSetting: true,
    useSearchForm: false,
    canResize: true,
  });

  function wrapFetchParams(fetchParam: any) {
    return { ...fetchParam, textSearch: searchParam.textSearch };
  }

  async function handleDelete(record: Recordable) {
    createConfirm({
      iconType: 'error',
      title: t('tb.widgetType.action.deleteConfirm', { name: record.title }),
      content: t('tb.widgetType.action.deleteConfirmContent'),
      centered: false,
      okText: t('tb.widgetType.action.deleteText'),
      okButtonProps: {
        type: 'primary',
        danger: true,
      },
      onOk: async () => {
        try {
          await deleteWidgetType(record.id.id);
          showMessage(t('tb.widgetType.action.deleteSuccess'));
        } catch (error: any) {
          console.log(error);
        } finally {
          handleSuccess();
        }
      },
    });
  }

  function handleDownload(record: Recordable) {
    exportRecord.value = record;
    exportVisible.value = true;
  }

  function handleSuccess() {
    reload();
  }

  function handleDetail(record: Recordable) {
    selectedId.value = record.id.id;
    detailVisible.value = true;
  }
</script>
<style lang="less">
  .widget-type-list {
  }
</style>
