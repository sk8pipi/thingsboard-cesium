<template>
  <!-- 覆盖层：只负责渲染，不负责编辑 -->
  <div ref="gridEl" class="mw-layer grid-stack" :style="layerStyle"></div>
</template>

<script setup lang="ts">
  import { ref, onMounted, onBeforeUnmount, nextTick, watch, createApp, h, computed } from 'vue';
  import { GridStack } from 'gridstack';
  import 'gridstack/dist/gridstack.min.css';

  import WidgetHost from '../dashboard/runtime/widgets/WidgetHost.vue';
  import { createDatasourceRuntime, type DatasourceRuntime } from '../dashboard/runtime/datasourceRuntime';
  import { normalizeWidgetRecord, widgetAppearanceStyleText } from '../dashboard/runtime/widgets/core/widgetInstance';
  import '../dashboard/runtime/widgets/core/widgetSurface.css';
  import type { DashboardWidget, GridItem, LocalWidgetKey, TbWidgetConfig } from '../dashboard/runtime/types';
  import type { AlarmFocusPayload } from '../dashboard/runtime/widgets/alarm/focus';
  import type { MapTemplateRuntimeDevices } from './services/mapTemplateRuntimeService';
  import type { MapPoint } from './types/mapPointTypes';
  import { mapScreenCanvasStyle, type MapScreenMetrics } from './mapScreenResponsive';

  type WidgetData = DashboardWidget & {
    type?: LocalWidgetKey;
    config: TbWidgetConfig;
  };

  type WidgetLayerData = {
    layout?: GridItem[];
    widgets?: Record<string, any>;
    mapPoints?: MapPoint[];
  };

  const props = defineProps<{
    storageKey: string;
    data?: WidgetLayerData | null;
    runtimeDevices?: MapTemplateRuntimeDevices | null;
    runtime?: DatasourceRuntime;
    screenMetrics?: MapScreenMetrics;
  }>();

  const emit = defineEmits<{
    (e: 'alarm-focus', payload: AlarmFocusPayload): void;
  }>();

  const gridEl = ref<HTMLDivElement | null>(null);
  let grid: any = null;

  const layerStyle = computed(() => (props.screenMetrics ? mapScreenCanvasStyle(props.screenMetrics) : undefined));

  function applyScreenMetrics() {
    if (!grid || !props.screenMetrics) return;
    if (grid.getColumn() !== props.screenMetrics.columns) {
      grid.column(props.screenMetrics.columns, 'move');
    }
    grid.cellHeight(Math.round(props.screenMetrics.cellHeight * 100) / 100);
    grid.margin(Math.round(props.screenMetrics.margin * 100) / 100);
  }

  const mountedApps = new Map<string, ReturnType<typeof createApp>>();
  const ownedDatasourceRuntime = props.runtime ? null : createDatasourceRuntime();
  const datasourceRuntime = props.runtime || ownedDatasourceRuntime!;

  let renderPatched = false;
  function patchGridstackRenderOnce() {
    if (renderPatched) return;
    renderPatched = true;
    GridStack.renderCB = (el, w) => {
      const html = (w as any)?.content ?? '';
      el.innerHTML = String(html);
    };
  }

  function widgetHtml(id: string, widget: WidgetData) {
    const surfaceStyle = widgetAppearanceStyleText(widget.widgetKey, widget.appearance);
    return `
      <div class="mw-widget tb-widget-surface" style="${surfaceStyle}">
        <div class="mw-body">
          <div id="mw-mount-${id}" class="mw-mount"></div>
        </div>
      </div>
    `;
  }

  function normalizeWidgets(rawWidgets: any): Record<string, WidgetData> {
    return normalizeWidgetRecord(rawWidgets) as Record<string, WidgetData>;
  }

  function loadData(): { layout: GridItem[]; widgets: Record<string, WidgetData> } {
    if (props.data) {
      return {
        layout: Array.isArray(props.data.layout) ? props.data.layout : [],
        widgets: normalizeWidgets(props.data.widgets),
      };
    }

    try {
      const raw = localStorage.getItem(props.storageKey);
      if (!raw) return { layout: [], widgets: {} };

      const parsed = JSON.parse(raw);
      return {
        layout: Array.isArray(parsed?.layout) ? parsed.layout : [],
        widgets: normalizeWidgets(parsed?.widgets),
      };
    } catch {
      return { layout: [], widgets: {} };
    }
  }

  function unmountWidget(id: string) {
    datasourceRuntime.unmountWidgetRuntime(id);

    const app = mountedApps.get(id);
    if (app) {
      try {
        app.unmount();
      } catch {}
      mountedApps.delete(id);
    }
  }

  function unmountAll() {
    Array.from(mountedApps.keys()).forEach(unmountWidget);
  }

  async function mountWidget(id: string, widget: WidgetData) {
    await nextTick();
    const mountEl = gridEl.value?.querySelector<HTMLElement>(`#mw-mount-${CSS.escape(id)}`);
    if (!mountEl) return;

    unmountWidget(id);

    const app = createApp({
      render: () =>
        h(WidgetHost, {
          widget,
          runtime: datasourceRuntime,
          context: {
            host: 'dashboard',
            readonly: true,
            runtimeDevices: props.runtimeDevices,
            templatePoints: props.data?.mapPoints || null,
            emit: (event: string, payload?: unknown) => {
              if (event === 'alarm-focus') emit('alarm-focus', payload as AlarmFocusPayload);
            },
          },
        }),
    });

    app.mount(mountEl);
    mountedApps.set(id, app);
  }

  async function render() {
    if (!grid) return;

    const { layout, widgets } = loadData();

    unmountAll();
    grid.removeAll(true);

    for (const it of layout) {
      const w = widgets[it.i];
      if (!w) continue;

      grid.addWidget({
        id: it.i,
        x: it.x,
        y: it.y,
        w: it.w,
        h: it.h,
        content: widgetHtml(it.i, w),
      } as any);

      await mountWidget(it.i, w);
    }

    grid.setStatic(true);
  }

  function onStorage(e: StorageEvent) {
    if (!e) return;
    if (props.data) return;
    if (e.key === props.storageKey) {
      void render();
    }
  }

  onMounted(async () => {
    await nextTick();
    if (!gridEl.value) return;

    patchGridstackRenderOnce();

    grid = GridStack.init(
      {
        column: props.screenMetrics?.columns || 12,
        cellHeight: props.screenMetrics?.cellHeight || 30,
        margin: props.screenMetrics?.margin || 10,
        float: true,
        disableResize: true,
        disableDrag: true,
      },
      gridEl.value,
    );

    window.addEventListener('storage', onStorage);
    datasourceRuntime.connect();
    applyScreenMetrics();
    await render();
  });

  watch(
    () => [
      props.screenMetrics?.columns,
      props.screenMetrics?.cellHeight,
      props.screenMetrics?.margin,
      props.screenMetrics?.canvasWidth,
      props.screenMetrics?.canvasHeight,
    ],
    async () => {
      await nextTick();
      applyScreenMetrics();
    },
  );

  watch(
    () => props.storageKey,
    async () => {
      await nextTick();
      await render();
    },
  );

  watch(
    () => JSON.stringify([props.data?.layout || [], props.data?.widgets || {}]),
    async () => {
      await nextTick();
      await render();
    },
  );

  onBeforeUnmount(() => {
    window.removeEventListener('storage', onStorage);
    grid?.destroy(false);
    grid = null;
    unmountAll();
    ownedDatasourceRuntime?.close();
  });
</script>

<style scoped>
  .mw-layer {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 10;
    pointer-events: none;
    min-width: 0;
    min-height: 0;
  }

  :deep(.grid-stack-item) {
    pointer-events: auto;
  }

  :deep(.grid-stack-item-content) {
    pointer-events: auto;
    overflow: hidden;
  }

  :deep(.mw-widget) {
    height: 100%;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  :deep(.mw-body) {
    flex: 1;
    padding: 8px;
    min-height: 0;
  }

  :deep(.mw-mount) {
    width: 100%;
    height: 100%;
  }
</style>
