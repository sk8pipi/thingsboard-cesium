<template>
  <!-- 覆盖层：只负责渲染，不负责编辑 -->
  <div ref="gridEl" class="mw-layer grid-stack"></div>
</template>

<script setup lang="ts">
  import { ref, onMounted, onBeforeUnmount, nextTick, watch, createApp, h } from 'vue';
  import { GridStack } from 'gridstack';
  import 'gridstack/dist/gridstack.min.css';

  import WidgetHost from '../dashboard/runtime/widgets/WidgetHost.vue';
  import { createDatasourceRuntime, type DatasourceRuntime } from '../dashboard/runtime/datasourceRuntime';
  import { normalizeWidgetRecord, widgetAppearanceStyleText } from '../dashboard/runtime/widgets/core/widgetInstance';
  import '../dashboard/runtime/widgets/core/widgetSurface.css';
  import type { DashboardWidget, GridItem, LocalWidgetKey, TbWidgetConfig } from '../dashboard/runtime/types';
  import type { AlarmFocusPayload } from '../dashboard/runtime/widgets/alarm/focus';
  import type { MapTemplateRuntimeDevices } from './services/mapTemplateRuntimeService';

  type WidgetData = DashboardWidget & {
    type?: LocalWidgetKey;
    config: TbWidgetConfig;
  };

  type WidgetLayerData = {
    layout?: GridItem[];
    widgets?: Record<string, any>;
  };

  const props = defineProps<{
    storageKey: string;
    data?: WidgetLayerData | null;
    runtimeDevices?: MapTemplateRuntimeDevices | null;
    runtime?: DatasourceRuntime;
  }>();

  const emit = defineEmits<{
    (e: 'alarm-focus', payload: AlarmFocusPayload): void;
  }>();

  const gridEl = ref<HTMLDivElement | null>(null);
  let grid: any = null;

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

  function widgetHtml(id: string, title: string, widget: WidgetData) {
    const surfaceStyle = widgetAppearanceStyleText(widget.widgetKey, widget.appearance);
    return `
      <div class="mw-widget tb-widget-surface" style="${surfaceStyle}">
        <div class="mw-title">${title}</div>
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

      const title = w.title || it.i;

      grid.addWidget({
        id: it.i,
        x: it.x,
        y: it.y,
        w: it.w,
        h: it.h,
        content: widgetHtml(it.i, title, w),
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
        column: 12,
        cellHeight: 30,
        margin: 10,
        float: true,
        disableResize: true,
        disableDrag: true,
      },
      gridEl.value,
    );

    window.addEventListener('storage', onStorage);
    datasourceRuntime.connect();
    await render();
  });

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
    inset: 0;
    z-index: 10;
    pointer-events: none;
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

  :deep(.mw-title) {
    height: 34px;
    line-height: 34px;
    padding: 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    user-select: none;
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
