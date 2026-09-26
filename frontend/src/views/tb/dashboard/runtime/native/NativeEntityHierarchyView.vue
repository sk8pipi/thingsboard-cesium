<template>
  <div class="native-entity-hierarchy">
    <div class="native-entity-hierarchy-toolbar"><button type="button" @click="refresh">刷新</button></div>
    <div v-if="error" role="status" class="native-entity-hierarchy-error">{{ error }}</div>
    <div v-if="!root" class="native-entity-hierarchy-empty">请选择根实体</div>
    <div v-else role="tree" class="native-entity-hierarchy-rows">
      <div
        v-for="node in rows"
        :key="node.key"
        role="treeitem"
        :aria-level="node.depth + 1"
        :aria-expanded="node.depth < settings.maxDepth ? !!expanded[node.key] : undefined"
        class="native-entity-hierarchy-row"
        :style="{ paddingLeft: `${node.depth * 20 + 8}px` }"
      >
        <button
          v-if="node.depth < settings.maxDepth"
          type="button"
          :aria-label="`${expanded[node.key] ? '折叠' : '展开'} ${node.name}`"
          @click="toggle(node)"
          >{{ loading[node.key] ? '…' : expanded[node.key] ? '▾' : '▸' }}</button
        >
        <span v-else class="native-entity-hierarchy-spacer"></span>
        <span>{{ node.name }}</span
        ><small v-if="settings.showEntityType">{{ node.type }}</small>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { findRelationInfoListByFrom, findRelationInfoListByTo } from '/@/api/tb/relation';
  import type { EntityType } from '/@/enums/entityTypeEnum';
  import {
    nativeHierarchyChildren,
    nativeHierarchyRoot,
    nativeHierarchyVisible,
    type NativeHierarchyNode,
  } from './nativeEntityHierarchyCore';
  import type { NativeEntityHierarchySettings, NativeSource } from './nativeWidgetTypes';

  const props = defineProps<{ source?: NativeSource; settings: NativeEntityHierarchySettings }>();
  const root = ref<NativeHierarchyNode | null>(null);
  const children = ref<Record<string, NativeHierarchyNode[]>>({});
  const expanded = ref<Record<string, boolean>>({});
  const loading = ref<Record<string, boolean>>({});
  const error = ref('');
  const refreshTick = ref(0);
  let generation = 0;
  const rows = computed(() => (root.value ? nativeHierarchyVisible(root.value, children.value, expanded.value) : []));

  async function loadChildren(node: NativeHierarchyNode) {
    if (children.value[node.key] || loading.value[node.key]) return;
    const currentGeneration = generation;
    loading.value = { ...loading.value, [node.key]: true };
    try {
      const params =
        props.settings.direction === 'FROM'
          ? { fromId: node.id, fromType: node.type as EntityType }
          : { toId: node.id, toType: node.type as EntityType };
      const result =
        props.settings.direction === 'FROM'
          ? await findRelationInfoListByFrom(params as { fromId: string; fromType: EntityType })
          : await findRelationInfoListByTo(params as { toId: string; toType: EntityType });
      if (currentGeneration !== generation) return;
      children.value = { ...children.value, [node.key]: nativeHierarchyChildren(node, result, props.settings) };
      error.value = '';
    } catch (cause: any) {
      if (currentGeneration === generation) error.value = cause?.message || '实体关系读取失败';
    } finally {
      if (currentGeneration === generation) loading.value = { ...loading.value, [node.key]: false };
    }
  }
  function toggle(node: NativeHierarchyNode) {
    if (node.depth >= props.settings.maxDepth) return;
    expanded.value = { ...expanded.value, [node.key]: !expanded.value[node.key] };
    if (expanded.value[node.key]) void loadChildren(node);
  }
  function refresh() {
    refreshTick.value++;
  }
  watch(
    () =>
      JSON.stringify([
        props.source?.entityType,
        props.source?.entityId,
        props.source?.name,
        props.settings,
        refreshTick.value,
      ]),
    () => {
      generation++;
      children.value = {};
      expanded.value = {};
      loading.value = {};
      error.value = '';
      root.value = props.source ? nativeHierarchyRoot(props.source) : null;
      if (root.value && props.settings.expandRoot) toggle(root.value);
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
  });
</script>

<style scoped>
  .native-entity-hierarchy {
    width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 8px;
  }
  .native-entity-hierarchy-toolbar {
    display: flex;
    justify-content: flex-end;
  }
  .native-entity-hierarchy-rows {
    overflow: auto;
    min-height: 0;
    flex: 1;
  }
  .native-entity-hierarchy-row {
    display: flex;
    align-items: center;
    min-height: 32px;
    gap: 6px;
  }
  .native-entity-hierarchy-row button,
  .native-entity-hierarchy-spacer {
    width: 22px;
    flex: none;
  }
  .native-entity-hierarchy-row button {
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  .native-entity-hierarchy-row small {
    margin-left: auto;
    opacity: 0.65;
  }
  .native-entity-hierarchy-error {
    color: #fda4af;
  }
  .native-entity-hierarchy-empty {
    padding: 12px;
  }
</style>
