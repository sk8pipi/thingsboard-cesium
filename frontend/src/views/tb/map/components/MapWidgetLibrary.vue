<template>
  <Teleport :to="overlayTarget" :disabled="!overlay">
    <div
      v-if="visible"
      class="mwl-shell"
      :class="overlay ? 'mwl-shell--overlay' : 'mwl-shell--inline'"
      @click.self="emit('close')"
    >
      <section class="mwl-panel" role="dialog" aria-label="添加部件">
        <header class="mwl-header">
          <strong>添加部件</strong>
          <div class="mwl-actions">
            <button type="button" @click="fileInputEl?.click()">↑ 导入部件</button>
            <button type="button" @click="showImportedWidgets = !showImportedWidgets">已导入</button>
            <button type="button" aria-label="关闭部件库" @click="emit('close')">×</button>
          </div>
        </header>

        <div class="mwl-list">
          <input
            ref="fileInputEl"
            type="file"
            accept="application/json"
            class="mwl-file"
            @change="onImportFileChange"
          />
          <template v-if="!showImportedWidgets">
            <div class="mwl-title">原生部件</div>
            <NativeWidgetBrowser
              class="mwl-native-browser"
              :active="visible && !nativeSelectionPaused"
              @select="emit('select-native', $event)"
            />

            <div class="mwl-title">内置部件</div>
            <div class="mwl-grid">
              <button
                v-for="def in builtInWidgetDefs"
                :key="def.key"
                class="mwl-card"
                type="button"
                :disabled="!def.hosts.includes(host)"
                :title="def.hosts.includes(host) ? def.title : '仅大屏画布可用'"
                @click="emit('select-builtin', def.key)"
              >
                <div class="mwl-preview">
                  <img :src="getBuiltInPreview(def.key)" :alt="def.title" loading="lazy" />
                </div>
                <div class="mwl-info">
                  <div class="mwl-name">{{ def.title }}</div>
                  <div class="mwl-meta">{{
                    def.hosts.includes(host) ? getBuiltInKindLabel(def.key) : '仅大屏画布可用'
                  }}</div>
                </div>
              </button>
            </div>
          </template>
          <template v-else>
            <div class="mwl-title">
              已导入部件 <button type="button" @click="showImportedWidgets = false">返回部件库</button>
            </div>
            <div v-if="libraryDefs.length" class="mwl-grid">
              <div v-for="def in libraryDefs" :key="def.id" class="mwl-card-wrap">
                <button
                  class="mwl-card"
                  type="button"
                  :disabled="Boolean(unavailableReason(def))"
                  :title="unavailableReason(def) || def.name"
                  @click="emit('select-imported', def)"
                >
                  <div class="mwl-preview">
                    <img v-if="getLibraryPreview(def)" :src="getLibraryPreview(def)" :alt="def.name" loading="lazy" />
                    <div v-else class="mwl-placeholder">{{ getLibraryKindLabel(def.kind) }}</div>
                  </div>
                  <div class="mwl-info">
                    <div class="mwl-name">{{ def.name }}</div>
                    <div class="mwl-meta">{{ unavailableReason(def) || getLibraryKindLabel(def.kind) }}</div>
                  </div>
                </button>
                <button
                  class="mwl-delete"
                  type="button"
                  :aria-label="`删除已导入部件：${def.name}`"
                  @click="deleteFromLibrary(def.id)"
                  >删除</button
                >
              </div>
            </div>
            <div v-else class="mwl-empty">暂无已导入部件</div>
          </template>
          <div v-if="message" class="mwl-message" role="status">{{ message }}</div>
        </div>
        <footer class="mwl-footer"><button type="button" @click="emit('close')">关闭</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import NativeWidgetBrowser from '../../dashboard/runtime/native/NativeWidgetBrowser.vue';
  import { getNativeWidgetSupport } from '../../dashboard/runtime/native/nativeWidgetCatalog';
  import { useNativeOverlayTarget } from '../../dashboard/runtime/native/useNativeOverlayTarget';
  import type { LocalWidgetKey, WidgetHostKind } from '../../dashboard/runtime/types';
  import {
    getWidgetDefinition,
    listWidgetDefinitions,
    resolveWidgetDefinitionKey,
  } from '../../dashboard/runtime/widgets/core/widgetInstance';
  import { importThingsboardJson } from '../widgetLibrary/importThingsboardWidget';
  import { loadWidgetLibrary, removeWidget, upsertWidget } from '../widgetLibrary/libraryStorage';
  import type { CustomWidgetDefinition } from '../widgetLibrary/types';
  import {
    getBuiltInKindLabel,
    getBuiltInPreview,
    getLibraryKindLabel,
    getLibraryPreview,
  } from '../widgetLibrary/widgetLibraryPreview';

  const props = withDefaults(
    defineProps<{
      visible: boolean;
      host: WidgetHostKind;
      overlay?: boolean;
      nativeSelectionPaused?: boolean;
    }>(),
    { overlay: false, nativeSelectionPaused: false },
  );
  const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'select-native', source: Record<string, any>): void;
    (e: 'select-builtin', key: LocalWidgetKey): void;
    (e: 'select-imported', definition: CustomWidgetDefinition): void;
  }>();
  const overlayTarget = useNativeOverlayTarget();
  const fileInputEl = ref<HTMLInputElement | null>(null);
  const showImportedWidgets = ref(false);
  const libraryDefs = ref<CustomWidgetDefinition[]>([]);
  const message = ref('');
  const builtInWidgetDefs = computed(() =>
    listWidgetDefinitions('dashboard').filter((item) => item.key !== 'cesium3d' && !item.key.startsWith('native_')),
  );

  watch(
    () => props.visible,
    (visible) => {
      if (visible) libraryDefs.value = loadWidgetLibrary();
      else {
        showImportedWidgets.value = false;
        message.value = '';
      }
    },
    { immediate: true },
  );

  function unavailableReason(def: CustomWidgetDefinition) {
    if (def.raw && (def.raw.descriptor || def.defaultConfig?.native || def.kind === 'unknown')) {
      const support = getNativeWidgetSupport(def.raw);
      if (!support.supported) return support.reason;
      return getWidgetDefinition(support.localWidgetKey)?.hosts.includes(props.host) ? '' : '当前页面不支持此部件';
    }
    const key = resolveWidgetDefinitionKey({
      localWidgetKey: def.localWidgetKey,
      typeFullFqn: def.typeFullFqn,
      kind: def.kind,
    });
    const definition = getWidgetDefinition(key);
    if (!definition) return '此部件尚无 Vue 运行实现';
    return definition.hosts.includes(props.host) ? '' : '仅大屏画布可用';
  }

  async function onImportFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请拆分后导入');
      const definitions = importThingsboardJson(JSON.parse(await file.text()));
      if (!definitions.length) throw new Error('无法识别 ThingsBoard 部件或部件包格式');
      definitions.forEach(upsertWidget);
      libraryDefs.value = loadWidgetLibrary();
      showImportedWidgets.value = true;
      const unavailable = definitions.filter((definition) => Boolean(unavailableReason(definition))).length;
      message.value = unavailable
        ? `已保留 ${definitions.length} 个原始定义，其中 ${unavailable} 个在当前页面不可添加。`
        : `已导入 ${definitions.length} 个部件。`;
    } catch (error: any) {
      message.value = error?.message || String(error);
    } finally {
      input.value = '';
    }
  }

  function deleteFromLibrary(id: string) {
    removeWidget(id);
    libraryDefs.value = loadWidgetLibrary();
  }
</script>

<style scoped>
  .mwl-shell--inline {
    position: absolute;
    top: calc(var(--map-top-bar-offset, 0px) + 12px);
    left: 12px;
    z-index: 30;
    width: min(620px, calc(100% - 24px));
    max-height: calc(100% - var(--map-top-bar-offset, 0px) - 24px);
  }
  .mwl-shell--overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: stretch;
    justify-content: flex-start;
    background: rgba(0, 0, 0, 0.5);
  }
  .mwl-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: inherit;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 12px;
    background: #d4dfe4;
    color: #253746;
  }
  .mwl-shell--overlay .mwl-panel {
    width: min(620px, 100vw);
    max-height: 100%;
    border-radius: 0 12px 12px 0;
  }
  .mwl-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px;
    background: #30577f;
    color: #fff;
    flex: 0 0 auto;
  }
  .mwl-header strong,
  .mwl-title {
    font-size: 13px;
    font-weight: 600;
  }
  .mwl-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  button {
    cursor: pointer;
  }
  .mwl-actions button,
  .mwl-footer button,
  .mwl-title button {
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    padding: 5px 8px;
    background: rgba(255, 255, 255, 0.12);
    color: inherit;
  }
  .mwl-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    max-height: calc(100vh - 170px);
    overflow-y: auto;
    padding: 12px;
  }
  .mwl-list > * {
    flex: 0 0 auto;
  }
  .mwl-file {
    display: none;
  }
  .mwl-native-browser {
    height: clamp(320px, 55vh, 620px);
    min-height: 320px;
    overflow: hidden;
    border-radius: 6px;
  }
  .mwl-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .mwl-card-wrap {
    position: relative;
    min-width: 0;
  }
  .mwl-card {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    padding: 8px;
    background: #fff;
    color: #253746;
    text-align: left;
  }
  .mwl-card:hover:not(:disabled) {
    border-color: #38bdf8;
    background: #f0f9ff;
  }
  .mwl-card:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }
  .mwl-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 140px;
    overflow: hidden;
    border-radius: 6px;
    background: #f8fafc;
  }
  .mwl-preview img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .mwl-placeholder {
    color: #64748b;
    font-size: 12px;
  }
  .mwl-info {
    padding: 8px 2px 2px;
  }
  .mwl-name {
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mwl-meta {
    margin-top: 4px;
    color: #64748b;
    font-size: 11px;
  }
  .mwl-delete {
    position: absolute;
    right: 8px;
    top: 8px;
    z-index: 1;
    border: 1px solid #fecaca;
    border-radius: 5px;
    background: #fff;
    color: #b91c1c;
  }
  .mwl-empty,
  .mwl-message {
    padding: 12px;
    color: #526777;
    font-size: 12px;
  }
  .mwl-footer {
    display: flex;
    justify-content: flex-end;
    padding: 8px 14px;
  }
  .mwl-footer button {
    border-color: #cbd5e1;
    color: #253746;
  }
  @media (max-width: 640px) {
    .mwl-shell--overlay .mwl-panel {
      width: 100%;
      border-radius: 0;
    }
    .mwl-header {
      flex-wrap: wrap;
    }
    .mwl-list {
      max-height: none;
    }
    .mwl-grid {
      grid-template-columns: 1fr;
    }
  }
  @container map-editor (max-width: 560px) {
    .mwl-shell--inline {
      left: 8px;
      width: calc(100% - 16px);
    }
    .mwl-shell--inline .mwl-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
