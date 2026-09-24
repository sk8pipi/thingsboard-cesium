<template>
  <Teleport :to="overlayTarget">
    <div v-show="visible && !selected" class="np-mask" @click.self="emit('close')">
      <section role="dialog" aria-modal="true" aria-label="选择原生部件" class="np-drawer">
        <header
          ><strong>原生部件</strong
          ><button type="button" aria-label="关闭部件库" @click="emit('close')">✕</button></header
        >
        <NativeWidgetBrowser :active="visible && !selected" @select="selected = $event" />
      </section>
    </div>
  </Teleport>
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
  import { ref, watch } from 'vue';
  import { useNativeOverlayTarget } from './useNativeOverlayTarget';
  import NativeWidgetBrowser from './NativeWidgetBrowser.vue';
  import NativeWidgetComposer from './NativeWidgetComposer.vue';
  import type { DashboardWidget } from '../types';
  const overlayTarget = useNativeOverlayTarget();
  const props = defineProps<{ visible: boolean; lockedEntity?: { entityId: string; name?: string } }>();
  const emit = defineEmits<{ (e: 'close'): void; (e: 'confirm', widget: DashboardWidget): void }>();
  const selected = ref<Record<string, any> | null>(null);
  watch(
    () => props.visible,
    () => {
      selected.value = null;
    },
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
    background: #10203070;
  }
  .np-drawer {
    display: flex;
    flex-direction: column;
    width: min(560px, 100vw);
    height: 100%;
    background: #cfd8dc;
    box-shadow: 6px 0 24px #0003;
  }
  .np-drawer > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    color: white;
    background: #30577e;
  }
  .np-drawer > header button {
    border: 0;
    background: transparent;
    color: white;
    cursor: pointer;
    font-size: 20px;
  }
  .np-drawer > :deep(.native-browser) {
    flex: 1;
    min-height: 0;
  }
</style>
