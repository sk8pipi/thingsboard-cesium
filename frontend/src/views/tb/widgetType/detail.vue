<template>
  <Drawer :open="visible" :width="'min(900px, 95vw)'" title="部件详情" @close="emit('close')">
    <Spin :spinning="loading">
      <Alert v-if="error" type="error" :message="error" show-icon
        ><template #action><Button size="small" @click="load">重试</Button></template></Alert
      >
      <template v-if="widget">
        <div class="detail-heading">
          <WidgetPreviewImage :source="widget.image" :title="widget.name" />
          <div
            ><h2>{{ widget.name }}</h2
            ><Tag :color="support.supported ? 'green' : 'orange'">{{ support.label }}</Tag
            ><p>{{ support.reason }}</p></div
          >
        </div>
        <p>{{ widget.description || widget.descriptor?.description || '暂无说明' }}</p>
        <Descriptions bordered size="small" :column="1">
          <Descriptions.Item label="原生标识">{{ widget.fqn || '未提供' }}</Descriptions.Item>
          <Descriptions.Item label="部件类型">{{
            widget.descriptor?.type || widget.widgetType || '未提供'
          }}</Descriptions.Item>
          <Descriptions.Item label="配置编辑器">{{
            widget.descriptor?.settingsDirective || 'JSON 配置'
          }}</Descriptions.Item>
          <Descriptions.Item label="外部资源"
            >{{ widget.descriptor?.resources?.length || 0 }} 项（仅展示，不执行）</Descriptions.Item
          >
          <Descriptions.Item label="脚本兼容">原生 Angular 模板和自定义脚本不会在 Vue 中直接运行。</Descriptions.Item>
        </Descriptions>
        <div class="detail-actions">
          <Button type="primary" :disabled="!support.supported" @click="previewVisible = true"
            >配置与液态玻璃预览</Button
          >
          <Button v-if="!localSource" @click="exportVisible = true">下载完整定义</Button>
        </div>
        <Tabs>
          <Tabs.TabPane key="configuration" tab="默认配置">
            <pre>{{ formatJson(widget.descriptor?.defaultConfig) }}</pre>
          </Tabs.TabPane>
          <Tabs.TabPane key="resources" tab="资源说明">
            <pre>{{
              formatJson({ resources: widget.descriptor?.resources || [], importedResources: widget.resources || [] })
            }}</pre>
          </Tabs.TabPane>
          <Tabs.TabPane key="descriptor" tab="完整 descriptor">
            <pre>{{ formatJson(widget.descriptor) }}</pre>
          </Tabs.TabPane>
          <Tabs.TabPane key="original" tab="原始 JSON（只读）">
            <pre>{{ formatJson(widget) }}</pre>
          </Tabs.TabPane>
        </Tabs>
      </template>
    </Spin>
  </Drawer>
  <ResourceExportModal
    v-if="widget && !localSource"
    :visible="exportVisible"
    kind="widget"
    :record="widget"
    @close="exportVisible = false"
  />
  <NativeWidgetComposer
    v-if="widget && previewVisible"
    :visible="previewVisible"
    :source="widget"
    preview-only
    @close="previewVisible = false"
  />
</template>
<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { Alert, Button, Descriptions, Drawer, Spin, Tabs, Tag } from 'ant-design-vue';
  import { getWidgetTypeById } from '/@/api/tb/widgetType';
  import { getNativeWidgetSupport } from '../dashboard/runtime/native/nativeWidgetCatalog';
  import NativeWidgetComposer from '../dashboard/runtime/native/NativeWidgetComposer.vue';
  import WidgetPreviewImage from '../widgetsLibrary/WidgetPreviewImage.vue';
  import ResourceExportModal from '../widgetsLibrary/ResourceExportModal.vue';
  const props = defineProps<{ visible: boolean; widgetId?: string; localSource?: Record<string, any> }>();
  const emit = defineEmits(['close']);
  const widget = ref<Record<string, any>>();
  const loading = ref(false);
  const error = ref('');
  const exportVisible = ref(false);
  const previewVisible = ref(false);
  const support = computed(() => getNativeWidgetSupport(widget.value || {}));
  let generation = 0;
  watch(
    () => [props.visible, props.widgetId, props.localSource],
    () => {
      void load();
    },
    { immediate: true },
  );
  async function load() {
    const current = ++generation;
    widget.value = undefined;
    error.value = '';
    loading.value = false;
    previewVisible.value = false;
    exportVisible.value = false;
    if (!props.visible) return;
    if (props.localSource) {
      widget.value = props.localSource;
      return;
    }
    if (!props.widgetId) {
      error.value = '缺少部件 ID';
      return;
    }
    loading.value = true;
    try {
      const result = await getWidgetTypeById(props.widgetId);
      if (current === generation) widget.value = result;
    } catch (cause: any) {
      if (current === generation) error.value = cause?.message || '读取部件失败，请重试。';
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  function formatJson(value: unknown) {
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    return JSON.stringify(value ?? {}, null, 2);
  }
</script>
<style scoped>
  .detail-heading {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 16px;
  }
  .detail-heading h2 {
    margin-bottom: 8px;
  }
  .detail-heading p {
    margin-top: 8px;
    color: #64748b;
  }
  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 20px 0;
  }
  pre {
    padding: 16px;
    max-height: 480px;
    overflow: auto;
    background: #f1f5f9;
    color: #334155;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
