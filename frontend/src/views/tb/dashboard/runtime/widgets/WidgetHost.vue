<template>
  <component
    v-if="resolvedComponent && runtimeData"
    :is="resolvedComponent"
    :widget-id="widget.id"
    :config="widget.config"
    :data="runtimeData"
    :widget="widget"
    :datasource="datasource"
    :ctx="hostContext"
    :timewindow="runtimeTimewindow"
  />
  <div v-else class="tb-host-error"> 未找到部件组件：{{ widget.widgetKey || widget.typeFullFqn || widget.id }} </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { widgetRegistry } from './registry/widgetRegistry';
  import type { DashboardWidget, LocalWidgetKey, TbWidgetConfig, WidgetHostKind } from '../types';
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
    context?: {
      host: WidgetHostKind;
      readonly?: boolean;
      entity?: Record<string, any> | null;
      runtimeDevices?: Record<string, Record<string, unknown>> | null;
      emit?: (event: string, payload?: unknown) => void;
    };
  }>();

  const widgetKey = computed(() => (props.widget.widgetKey || props.widget.type) as LocalWidgetKey);
  const definition = computed(() => widgetRegistry[widgetKey.value]);
  const resolvedComponent = computed(() => definition.value?.component || null);

  const runtimeData = ref<WidgetRuntimeData | null>(null);
  const datasource = computed(() => props.widget.config?.datasource || props.widget.config?.datasources?.[0] || null);
  const runtimeTimewindow = computed(() => {
    const endTs = Date.now();
    const intervalMs = runtimeData.value?.timeWindowMs || props.widget.config?.timewindow?.intervalMs || 300000;
    return { startTs: endTs - intervalMs, endTs };
  });
  const hostContext = computed(() => ({
    host: props.context?.host || ('dashboard' as WidgetHostKind),
    readonly: props.context?.readonly ?? true,
    entity: props.context?.entity || null,
    runtimeDevices: props.context?.runtimeDevices || null,
    data: runtimeData.value,
    emit: (event: string, payload?: unknown) => props.context?.emit?.(event, payload),
  }));

  onMounted(() => {
    runtimeData.value = props.runtime.mountWidgetRuntime({
      ...props.widget,
      category: props.widget.category || definition.value?.category,
      dataProvider: definition.value?.dataProvider,
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
