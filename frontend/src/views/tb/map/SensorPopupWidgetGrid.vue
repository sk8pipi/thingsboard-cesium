<template>
  <div class="sensor-popup-widget-grid">
    <section
      v-for="(widget, index) in widgets"
      :key="widgetRenderKey(widget)"
      :aria-label="widget.title"
      class="sensor-popup-widget-grid__item tb-widget-surface tb-widget-surface--nested"
      :class="itemClass(widget)"
      :style="itemStyle(widget)"
    >
      <button
        v-if="removable"
        class="sensor-popup-widget-grid__remove"
        type="button"
        :aria-label="`删除部件：${widget.title}`"
        @click="emit('remove', index)"
      >
        删除
      </button>

      <div class="sensor-popup-widget-grid__body">
        <WidgetHost :widget="widget" :runtime="runtime" :context="context" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import type { CSSProperties } from 'vue';
  import type { DashboardWidget, WidgetHostKind } from '../dashboard/runtime/types';
  import WidgetHost from '../dashboard/runtime/widgets/WidgetHost.vue';
  import { getWidgetDefinition, widgetAppearanceStyle } from '../dashboard/runtime/widgets/core/widgetInstance';
  import '../dashboard/runtime/widgets/core/widgetSurface.css';

  type WidgetRuntime = {
    mountWidgetRuntime: (widget: DashboardWidget) => any;
    unmountWidgetRuntime: (widgetId: string) => void;
  };

  const props = withDefaults(
    defineProps<{
      widgets: DashboardWidget[];
      runtime: WidgetRuntime;
      removable?: boolean;
      context?: {
        host: WidgetHostKind;
        readonly?: boolean;
        entity?: Record<string, any> | null;
        runtimeDevices?: Record<string, Record<string, unknown>> | null;
      };
    }>(),
    {
      removable: false,
    },
  );

  const emit = defineEmits<{
    (e: 'remove', index: number): void;
  }>();

  function widgetKey(widget: DashboardWidget) {
    return widget.widgetKey;
  }

  function widgetRenderKey(widget: DashboardWidget) {
    return `${widget.id}:${JSON.stringify(widget.config)}`;
  }

  function itemClass(widget: DashboardWidget) {
    const key = widgetKey(widget);
    return {
      'sensor-popup-widget-grid__item--compact':
        (getWidgetDefinition(key)?.pointDetailPlacement.columnSpan || 12) === 6,
      'sensor-popup-widget-grid__item--removable': props.removable,
    };
  }

  function widgetHeight(widget: DashboardWidget) {
    return getWidgetDefinition(widgetKey(widget))?.pointDetailPlacement.height || 320;
  }

  function itemStyle(widget: DashboardWidget): CSSProperties {
    return {
      '--sensor-popup-widget-height': `${widgetHeight(widget)}px`,
    } as CSSProperties;
  }
</script>

<style scoped>
  .sensor-popup-widget-grid {
    container-type: inline-size;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: start;
    gap: 12px;
  }

  .sensor-popup-widget-grid__item {
    position: relative;
    grid-column: 1 / -1;
    min-width: 0;
    overflow: hidden;
    box-sizing: border-box;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }

  .sensor-popup-widget-grid__item--compact {
    grid-column: span 6;
  }

  .sensor-popup-widget-grid__item--removable {
    padding-top: 44px;
  }

  .sensor-popup-widget-grid__body {
    width: 100%;
    height: var(--sensor-popup-widget-height);
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  .sensor-popup-widget-grid__remove {
    position: absolute;
    top: 8px;
    right: 8px;
    min-width: 52px;
    height: 28px;
    border: 1px solid rgba(248, 113, 113, 0.45);
    border-radius: 7px;
    background: rgba(127, 29, 29, 0.82);
    color: #fecaca;
    cursor: pointer;
    font-size: 12px;
    line-height: 26px;
  }

  .sensor-popup-widget-grid__remove:hover {
    background: rgba(185, 28, 28, 0.96);
  }

  @container (max-width: 500px) {
    .sensor-popup-widget-grid__item--compact {
      grid-column: 1 / -1;
    }
  }
</style>
