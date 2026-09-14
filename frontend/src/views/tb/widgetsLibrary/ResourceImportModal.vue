<template>
  <Modal :open="visible" title="导入 JSON · 本地解析与配置预览" :width="800" :footer="null" @cancel="emit('close')">
    <Alert
      type="info"
      show-icon
      message="本入口解析原生定义并预览 Vue 支持情况。不会创建或覆盖服务器部件，也不会执行导入脚本。"
    />
    <input
      class="my-4"
      type="file"
      accept=".json,application/json"
      aria-label="选择原生部件或部件包 JSON"
      @change="readFile"
    />
    <Spin :spinning="busy">
      <Alert v-if="error" type="error" :message="error" show-icon />
      <template v-if="parsed">
        <h3>{{ parsed.title }} · {{ parsed.kind === 'bundle' ? '部件包' : '部件' }}</h3>
        <p>完整定义 {{ parsed.widgets.length }} 项，标识引用 {{ parsed.references.length }} 项</p>
        <Alert
          v-if="parsed.references.length"
          type="warning"
          message="文件含仅标识引用，未包含这些部件的定义，无法离线预览。请导出包含完整部件的文件。"
        />
        <List :data-source="parsed.widgets" :pagination="{ pageSize: 8 }">
          <template #renderItem="{ item }">
            <List.Item
              ><List.Item.Meta :title="item.name" :description="getNativeWidgetSupport(item).reason" />
              <Tag :color="getNativeWidgetSupport(item).supported ? 'green' : 'orange'">{{
                getNativeWidgetSupport(item).label
              }}</Tag>
              <Button @click="selected = item">查看定义与配置</Button>
            </List.Item>
          </template>
        </List>
        <Button class="my-3" @click="downloadResourceJson(parsed.original, parsed.title)">下载保留的原始 JSON</Button>
      </template>
    </Spin>
  </Modal>
  <WidgetDetail :visible="!!selected" :local-source="selected" @close="selected = undefined" />
</template>
<script lang="ts" setup>
  import { ref, shallowRef, watch } from 'vue';
  import { Alert, Button, List, Modal, Spin, Tag } from 'ant-design-vue';
  import { getNativeWidgetSupport } from '../dashboard/runtime/native/nativeWidgetCatalog';
  import WidgetDetail from '../widgetType/detail.vue';
  import { downloadResourceJson, parseResourceImport } from './widgetResourceCore';
  const props = defineProps<{ visible: boolean }>();
  const emit = defineEmits(['close']);
  const parsed = shallowRef<ReturnType<typeof parseResourceImport>>();
  const selected = shallowRef<Record<string, any>>();
  const busy = ref(false);
  const error = ref('');
  let generation = 0;
  watch(
    () => props.visible,
    () => {
      generation++;
      parsed.value = undefined;
      selected.value = undefined;
      error.value = '';
      busy.value = false;
    },
  );
  async function readFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const current = ++generation;
    parsed.value = undefined;
    selected.value = undefined;
    error.value = '';
    busy.value = true;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请拆分后导入预览。');
      const text = await file.text();
      if (current === generation) parsed.value = parseResourceImport(text);
    } catch (cause: any) {
      if (current === generation) error.value = cause?.message || '文件读取失败';
    } finally {
      if (current === generation) busy.value = false;
    }
  }
</script>
