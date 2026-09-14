<template>
  <BasicDrawer v-bind="$attrs" :showFooter="false" @register="registerDrawer" width="65%">
    <template #title>{{ record.title || '部件包' }} · 部件列表（{{ total }}）</template>
    <div class="mb-4 flex gap-3">
      <Input.Search v-model:value="search" placeholder="搜索部件" allow-clear @search="loadPage(1)" />
      <Button @click="bundleExportVisible = true" :disabled="!record.id">下载完整部件包</Button>
    </div>
    <Alert v-if="error" type="error" :message="error" show-icon class="mb-3">
      <template #action><Button size="small" @click="loadPage(page)">重试</Button></template>
    </Alert>
    <List item-layout="horizontal" :data-source="widgetTypeList" :loading="loading">
      <template #renderItem="{ item }">
        <List.Item>
          <List.Item.Meta>
            <template #title
              ><a @click="openWidget(item)">{{ item.name }}</a></template
            >
            <template #description>
              <p>{{ item.description || '暂无说明' }}</p>
              <Tag
                :color="getNativeWidgetSupport(item).supported ? 'green' : 'orange'"
                :title="getNativeWidgetSupport(item).reason"
                >{{
                  getNativeWidgetSupport(item).supported ? '目录有适配 · 详情核验' : getNativeWidgetSupport(item).label
                }}</Tag
              >
            </template>
            <template #avatar><WidgetPreviewImage :source="item.image" :title="item.name" /></template>
          </List.Item.Meta>
          <template #actions
            ><Button @click="openWidget(item)">详情与预览</Button
            ><Button @click="exportWidget(item)">下载</Button></template
          >
        </List.Item>
      </template>
    </List>
    <Pagination
      v-model:current="page"
      :total="total"
      :page-size="pageSize"
      :show-size-changer="false"
      @change="loadPage"
      class="mt-4"
    />
  </BasicDrawer>
  <WidgetDetail :visible="detailVisible" :widget-id="selectedId" @close="detailVisible = false" />
  <ResourceExportModal :visible="exportVisible" kind="widget" :record="exportRecord" @close="exportVisible = false" />
  <ResourceExportModal
    :visible="bundleExportVisible"
    kind="bundle"
    :record="record"
    @close="bundleExportVisible = false"
  />
</template>
<script lang="ts" setup>
  import { onBeforeUnmount, ref } from 'vue';
  import { Alert, Button, Input, List, Pagination, Tag } from 'ant-design-vue';
  import { BasicDrawer, useDrawerInner } from '/@/components/Drawer';
  import { WidgetsBundle, getWidgetsBundleById } from '/@/api/tb/widgetsBundle';
  import { WidgetType, getBundleWidgetTypesInfos } from '/@/api/tb/widgetType';
  import { getNativeWidgetSupport } from '../dashboard/runtime/native/nativeWidgetCatalog';
  import WidgetDetail from '../widgetType/detail.vue';
  import WidgetPreviewImage from '../widgetsLibrary/WidgetPreviewImage.vue';
  import ResourceExportModal from '../widgetsLibrary/ResourceExportModal.vue';

  defineEmits(['register']);
  const record = ref<WidgetsBundle>({} as WidgetsBundle);
  const widgetTypeList = ref<WidgetType[]>([]);
  const loading = ref(false);
  const error = ref('');
  const search = ref('');
  const page = ref(1);
  const pageSize = 16;
  const total = ref(0);
  const detailVisible = ref(false);
  const selectedId = ref('');
  const exportVisible = ref(false);
  const bundleExportVisible = ref(false);
  const exportRecord = ref<Recordable>({});
  let generation = 0;
  let bundleGeneration = 0;
  const [registerDrawer] = useDrawerInner(async (data) => {
    const current = ++bundleGeneration;
    generation++;
    record.value = data;
    widgetTypeList.value = [];
    total.value = 0;
    search.value = '';
    detailVisible.value = false;
    exportVisible.value = false;
    bundleExportVisible.value = false;
    void getWidgetsBundleById(data.id.id)
      .then((result) => {
        if (current === bundleGeneration) record.value = result;
      })
      .catch(() => {
        /* 部件列表可独立加载，包名称读取失败不阻止列表。 */
      });
    await loadPage(1);
  });
  async function loadPage(currentPage = 1) {
    const current = ++generation;
    page.value = currentPage;
    loading.value = true;
    error.value = '';
    widgetTypeList.value = [];
    try {
      const result = await getBundleWidgetTypesInfos({
        page: currentPage - 1,
        pageSize,
        widgetsBundleId: record.value.id.id,
        textSearch: search.value,
        fullSearch: true,
        deprecatedFilter: 'ALL',
        sortProperty: 'name',
        sortOrder: 'ASC',
      });
      if (current !== generation) return;
      widgetTypeList.value = result.data;
      total.value = result.totalElements;
    } catch (cause: any) {
      if (current === generation) {
        error.value = cause?.message || '加载失败，请检查连接或读取权限。';
        total.value = 0;
      }
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  function openWidget(item: WidgetType) {
    selectedId.value = item.id.id;
    detailVisible.value = true;
  }
  function exportWidget(item: WidgetType) {
    exportRecord.value = item;
    exportVisible.value = true;
  }
  onBeforeUnmount(() => {
    generation++;
    bundleGeneration++;
  });
</script>
