<template>
  <component
    v-if="resolvedComponent && runtimeData"
    :is="resolvedComponent"
    :widget-id="widget.id"
    :config="widget.config"
    :data="runtimeData"
  />
  <div v-else class="tb-host-error">
    未找到部件组件：{{ widget.widgetKey || widget.typeFullFqn || widget.id }}
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { widgetRegistry } from './registry/widgetRegistry';
  import type { DashboardWidget, LocalWidgetKey, TbWidgetConfig } from '../types';
  import type { WidgetRuntimeData } from '../datasourceRuntime';

  const props = defineProps<{
    widget: DashboardWidget & {
      type?: LocalWidgetKey;
      config: TbWidgetConfig;
    };
    runtime: {
      mountWidgetRuntime: (widget: any) => WidgetRuntimeData;
      unmountWidgetRuntime: (widgetId: string) => void;
    };
  }>();

  const widgetKey = computed(() => (props.widget.widgetKey || props.widget.type) as LocalWidgetKey);
  const definition = computed(() => widgetRegistry[widgetKey.value]);
  const resolvedComponent = computed(() => definition.value?.component || null);

  const runtimeData = ref<WidgetRuntimeData | null>(null);

  onMounted(() => {
    runtimeData.value = props.runtime.mountWidgetRuntime({
      ...props.widget,
      category: props.widget.category || definition.value?.category,
    });
  });

  onBeforeUnmount(() => {
    props.runtime.unmountWidgetRuntime(props.widget.id);
  });
</script>

<style scoped>
  .tb-host-error {
    width: 100%;
    height: 100%;
    border-radius: 10px;
    padding: 12px;
    box-sizing: border-box;
    background: rgba(220, 38, 38, 0.12);
    color: #fff;
    font-size: 12px;
    display: flex;
    align-items: center;
  }
</style>
