<template>
  <Teleport :to="overlayTarget"
    ><div v-if="visible && !selected" class="np-mask"
      ><section role="dialog" aria-modal="true" aria-label="原生部件 Vue 目录"
        ><header><strong>原生部件库 · Vue</strong><button @click="emit('close')">关闭</button></header
        ><p>基于本仓库原生定义的兼容目录。已适配项目需重新选择实际数据；待适配项目保留在资源列表供查看、导出。</p
        ><nav
          ><input v-model="query" placeholder="搜索名称、标签或标识" /><select v-model="family"
            ><option value="">所有类别</option
            ><option v-for="(label, key) in nativeFamilyLabels" :key="key" :value="key">{{ label }}</option></select
          ><label><input v-model="onlySupported" type="checkbox" />仅显示可配置</label></nav
        ><small>匹配 {{ entries.length }} / {{ nativeWidgetCatalog.length }} 项</small
        ><div class="np-grid"
          ><button v-for="entry in shown" :key="entry.fqn" :disabled="!entry.family" @click="selected = entry"
            ><strong>{{ entry.name }}</strong
            ><small>{{ entry.fqn }}</small
            ><span>{{ entry.family ? nativeFamilyLabels[entry.family] + ' · Vue 基础适配' : '待适配' }}</span></button
          ></div
        ><footer
          ><button :disabled="page === 0" @click="page--">上一页</button
          ><span>{{ page + 1 }} / {{ Math.max(1, Math.ceil(entries.length / 30)) }}</span
          ><button :disabled="(page + 1) * 30 >= entries.length" @click="page++">下一页</button></footer
        ></section
      ></div
    ></Teleport
  >
  <NativeWidgetComposer
    v-if="visible && selected"
    :visible="true"
    :source="selected"
    :locked-entity="lockedEntity"
    @close="selected = null"
    @confirm="confirm"
  />
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useNativeOverlayTarget } from './useNativeOverlayTarget';
  const overlayTarget = useNativeOverlayTarget();
  import { nativeWidgetCatalog, nativeFamilyLabels } from './nativeWidgetCatalog';
  import NativeWidgetComposer from './NativeWidgetComposer.vue';
  import type { DashboardWidget } from '../types';
  const props = defineProps<{ visible: boolean; lockedEntity?: { entityId: string; name?: string } }>();
  const emit = defineEmits<{ (e: 'close'): void; (e: 'confirm', widget: DashboardWidget): void }>();
  const query = ref(''),
    family = ref(''),
    onlySupported = ref(true),
    page = ref(0),
    selected = ref<any>(null);
  const entries = computed(() =>
    nativeWidgetCatalog.filter(
      (e) =>
        (!onlySupported.value || e.family) &&
        (!family.value || e.family === family.value) &&
        `${e.name} ${e.fqn} ${(e.tags || []).join(' ')}`.toLowerCase().includes(query.value.toLowerCase()),
    ),
  );
  const shown = computed(() => entries.value.slice(page.value * 30, (page.value + 1) * 30));
  watch([query, family, onlySupported], () => (page.value = 0));
  watch(
    () => props.visible,
    () => (selected.value = null),
  );
  function confirm(widget: DashboardWidget) {
    emit('confirm', widget);
    selected.value = null;
  }
</script>
<style scoped>
  .np-mask {
    position: fixed;
    inset: 0;
    z-index: 11900;
    background: #020a16d9;
    display: grid;
    place-items: center;
    padding: 24px;
    color: #e6f6ff;
  }
  .np-mask > section {
    width: min(1040px, 100%);
    max-height: 90vh;
    overflow: auto;
    background: #102536;
    border: 1px solid #496777;
    border-radius: 18px;
    padding: 24px;
  }
  header,
  nav,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  p,
  small {
    color: #abc4d2;
    font-size: 12px;
  }
  button,
  input,
  select {
    background: #ffffff0b;
    color: inherit;
    border: 1px solid #ffffff30;
    border-radius: 8px;
    padding: 9px;
    font: inherit;
  }
  select option {
    background: #102536;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  nav > input {
    flex: 1;
    min-width: 100px;
  }
  .np-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 10px;
    margin: 16px 0;
  }
  .np-grid button {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 100px;
  }
  .np-grid small {
    word-break: break-all;
  }
  .np-grid span {
    color: #6ce9ff;
    font-size: 12px;
  }
  footer {
    justify-content: center;
    margin: 0;
  }
</style>
