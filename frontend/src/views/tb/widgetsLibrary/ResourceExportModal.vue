<template>
  <Modal
    :open="visible"
    title="导出原生部件 JSON"
    :confirm-loading="busy"
    :closable="!busy"
    :mask-closable="!busy"
    :cancel-button-props="{ disabled: busy }"
    @cancel="emit('close')"
    @ok="exportResource"
  >
    <p>{{ kind === 'bundle' ? '导出部件包及包内所有部件的完整定义。' : '导出部件的完整定义与配置。' }}</p>
    <Checkbox v-model:checked="includeResources" :disabled="busy">包含图片和引用资源（便于跨环境导入）</Checkbox>
    <p class="mt-3 text-gray-500">保留原生 descriptor 和脚本内容，但不会执行脚本。文件不包含当前服务器的实体 ID。</p>
    <Alert v-if="error" class="mt-3" type="error" :message="error" show-icon />
  </Modal>
</template>
<script lang="ts" setup>
  import { ref, watch } from 'vue';
  import { Alert, Checkbox, Modal, message } from 'ant-design-vue';
  import { getWidgetTypeById, getBundleWidgetTypesDetails } from '/@/api/tb/widgetType';
  import { getWidgetsBundleById } from '/@/api/tb/widgetsBundle';
  import { createBundleExport, downloadResourceJson, prepareResourceExport } from './widgetResourceCore';
  const props = defineProps<{ visible: boolean; kind: 'widget' | 'bundle'; record: Record<string, any> }>();
  const emit = defineEmits(['close']);
  const busy = ref(false);
  const error = ref('');
  const includeResources = ref(true);
  watch(
    () => props.visible,
    () => {
      error.value = '';
    },
  );
  async function exportResource() {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      const id = typeof props.record.id === 'string' ? props.record.id : props.record.id?.id;
      if (!id) throw new Error('缺少资源 ID，请重新打开资源。');
      if (props.kind === 'bundle') {
        const [bundle, widgets] = await Promise.all([
          getWidgetsBundleById(id, includeResources.value),
          getBundleWidgetTypesDetails(id, includeResources.value),
        ]);
        downloadResourceJson(createBundleExport(bundle, widgets), bundle.title);
      } else {
        const widget = await getWidgetTypeById(id, includeResources.value);
        if (!widget.descriptor) throw new Error('服务器未返回完整部件定义，无法导出。');
        downloadResourceJson(prepareResourceExport(widget), widget.name);
      }
      message.success('已生成 JSON 下载文件');
      emit('close');
    } catch (cause: any) {
      error.value = cause?.message || '导出失败，请检查连接和资源读取权限后重试。';
    } finally {
      busy.value = false;
    }
  }
</script>
