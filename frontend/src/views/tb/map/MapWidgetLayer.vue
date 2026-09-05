<template>
  <!-- 覆盖层：只负责渲染，不负责编辑 -->
  <div
    class="mw-layer"
    :class="{ 'mw-layer--widget-fullscreen': Boolean(activeFullscreenWidgetId) }"
    :style="layerStyle"
  >
    <div ref="gridEl" class="mw-grid grid-stack" @click="onGridClick"></div>

    <section
      v-show="activeFullscreenWidgetId"
      class="mw-fullscreen-host"
      role="dialog"
      aria-modal="true"
      :aria-label="`${activeFullscreenWidgetTitle}全屏查看`"
      @keydown="onFullscreenKeydown"
    >
      <div ref="fullscreenContentEl" class="mw-fullscreen-content"></div>
      <button
        ref="restoreButtonEl"
        class="mw-fullscreen-restore"
        type="button"
        title="恢复原布局"
        aria-label="恢复原布局"
        @click="exitWidgetFullscreen()"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M9 4H4v5M15 4h5v5M9 20H4v-5m11 5h5v-5M4 9l5-5m6 0 5 5M4 15l5 5m6 0 5-5" />
        </svg>
      </button>
    </section>
  </div>
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
  import { calculateGridStackCellHeight, mapScreenCanvasStyle, type MapScreenMetrics } from './mapScreenResponsive';
  import {
    moveMapWidgetToFullscreen,
    restoreMapWidgetFromFullscreen,
    type MapWidgetFullscreenDomSession,
  } from './mapWidgetFullscreen';

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
    (e: 'widget-fullscreen-change', payload: { active: boolean; widgetId: string }): void;
  }>();

  const gridEl = ref<HTMLDivElement | null>(null);
  const fullscreenContentEl = ref<HTMLDivElement | null>(null);
  const restoreButtonEl = ref<HTMLButtonElement | null>(null);
  const activeFullscreenWidgetId = ref('');
  const activeFullscreenWidgetTitle = ref('部件');
  let grid: any = null;
  let fullscreenSession: MapWidgetFullscreenDomSession | null = null;
  let resizeFrame = 0;

  const layerStyle = computed(() => (props.screenMetrics ? mapScreenCanvasStyle(props.screenMetrics) : undefined));

  function applyScreenMetrics() {
    if (!grid || !props.screenMetrics) return;
    if (grid.getColumn() !== props.screenMetrics.columns) {
      grid.column(props.screenMetrics.columns, 'move');
    }
    const renderedRows = Math.max(1, Number(grid.getRow?.()) || props.screenMetrics.rows);
    const cellHeight = calculateGridStackCellHeight(props.screenMetrics.canvasHeight, renderedRows);
    grid.cellHeight(Math.round(cellHeight * 100) / 100);
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
      <div class="mw-widget tb-widget-surface" data-widget-id="${escapeHtmlAttribute(id)}" style="${surfaceStyle}">
        <button
          class="mw-widget-fullscreen-toggle"
          type="button"
          data-widget-fullscreen-id="${escapeHtmlAttribute(id)}"
          title="全屏查看"
          aria-label="全屏查看"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 9V4h5M15 4h5v5M4 15v5h5m6 0h5v-5" />
          </svg>
        </button>
        <div class="mw-body">
          <div id="mw-mount-${id}" class="mw-mount"></div>
        </div>
      </div>
    `;
  }

  function escapeHtmlAttribute(value: string) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function resolveWidgetTitle(widgetId: string) {
    const widget = loadData().widgets[widgetId];
    return String(widget?.title || widget?.config?.title || widget?.config?.settings?.title || '部件').trim() || '部件';
  }

  function findGridItem(widgetId: string) {
    return (Array.from(gridEl.value?.children || []).find((element) => {
      const item = element as HTMLElement & { gridstackNode?: { id?: string } };
      const id = item.gridstackNode?.id || item.getAttribute('gs-id') || item.getAttribute('data-gs-id');
      return String(id || '') === widgetId;
    }) || null) as HTMLElement | null;
  }

  function findItemContent(item: HTMLElement) {
    return (Array.from(item.children).find((element) => element.classList.contains('grid-stack-item-content')) ||
      null) as HTMLElement | null;
  }

  function scheduleWidgetResize(content: HTMLElement) {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        content.dispatchEvent(new CustomEvent('map-widget-resize', { bubbles: true }));
        window.dispatchEvent(new Event('resize'));
      });
    });
  }

  function enterWidgetFullscreen(widgetId: string, triggerElement: HTMLElement) {
    if (!widgetId || fullscreenSession || !fullscreenContentEl.value) return false;

    const item = findGridItem(widgetId);
    const content = item ? findItemContent(item) : null;
    if (!content) return false;

    try {
      fullscreenSession = moveMapWidgetToFullscreen({
        widgetId,
        content,
        host: fullscreenContentEl.value,
        triggerElement,
      });
      content.classList.add('mw-widget-content--fullscreen');
      activeFullscreenWidgetId.value = widgetId;
      activeFullscreenWidgetTitle.value = resolveWidgetTitle(widgetId);
      emit('widget-fullscreen-change', { active: true, widgetId });
      scheduleWidgetResize(content);
      requestAnimationFrame(() => restoreButtonEl.value?.focus({ preventScroll: true }));
      return true;
    } catch (error) {
      console.warn('[MapWidgetLayer] Failed to enter widget fullscreen:', error);
      fullscreenSession = null;
      activeFullscreenWidgetId.value = '';
      return false;
    }
  }

  function exitWidgetFullscreen(options: { restoreFocus?: boolean; emitChange?: boolean } = {}) {
    const session = fullscreenSession;
    if (!session) return false;

    const widgetId = session.widgetId;
    const restoreFocus = options.restoreFocus !== false;
    const emitChange = options.emitChange !== false;
    session.content.classList.remove('mw-widget-content--fullscreen');
    restoreMapWidgetFromFullscreen(session);
    fullscreenSession = null;
    activeFullscreenWidgetId.value = '';
    activeFullscreenWidgetTitle.value = '部件';
    scheduleWidgetResize(session.content);
    if (restoreFocus) {
      requestAnimationFrame(() => session.triggerElement?.focus({ preventScroll: true }));
    }
    if (emitChange) emit('widget-fullscreen-change', { active: false, widgetId });
    return true;
  }

  function onGridClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    const button = target?.closest?.('[data-widget-fullscreen-id]') as HTMLElement | null;
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    enterWidgetFullscreen(button.getAttribute('data-widget-fullscreen-id') || '', button);
  }

  function onFullscreenKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab' || !fullscreenContentEl.value) return;
    const host = fullscreenContentEl.value.parentElement;
    if (!host) return;

    const focusable = Array.from(
      host.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      restoreButtonEl.value?.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
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

    exitWidgetFullscreen({ restoreFocus: false });
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
    applyScreenMetrics();
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
    exitWidgetFullscreen({ restoreFocus: false, emitChange: false });
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
    grid?.destroy(false);
    grid = null;
    unmountAll();
    ownedDatasourceRuntime?.close();
  });

  defineExpose({
    exitWidgetFullscreen,
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

  .mw-grid {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .mw-layer--widget-fullscreen {
    z-index: 3000 !important;
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
    position: relative;
  }

  :deep(.mw-widget-fullscreen-toggle),
  .mw-fullscreen-restore {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: #e6f4ff;
    background: rgba(5, 20, 34, 0.82);
    border: 1px solid rgba(148, 211, 255, 0.48);
    border-radius: 8px;
    box-shadow: 0 8px 22px rgba(0, 7, 18, 0.3);
    cursor: pointer;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  :deep(.mw-widget-fullscreen-toggle) {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 20;
    width: 30px;
    height: 30px;
    opacity: 0;
    transform: translateY(-3px);
    transition:
      opacity 0.16s ease,
      transform 0.16s ease,
      background 0.16s ease;
  }

  :deep(.mw-widget:hover .mw-widget-fullscreen-toggle),
  :deep(.mw-widget:focus-within .mw-widget-fullscreen-toggle),
  :deep(.mw-widget-fullscreen-toggle:focus-visible) {
    opacity: 1;
    transform: translateY(0);
  }

  :deep(.mw-widget-fullscreen-toggle:hover),
  .mw-fullscreen-restore:hover {
    background: rgba(10, 72, 108, 0.94);
  }

  :deep(.mw-widget-fullscreen-toggle:focus-visible),
  .mw-fullscreen-restore:focus-visible {
    outline: 2px solid #67d4ff;
    outline-offset: 2px;
  }

  :deep(.mw-widget-fullscreen-toggle svg),
  .mw-fullscreen-restore svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mw-fullscreen-host {
    position: fixed;
    z-index: 1;
    inset: 0;
    box-sizing: border-box;
    padding: clamp(10px, 1.25vw, 24px);
    overflow: hidden;
    pointer-events: auto;
    background: radial-gradient(circle at 50% 0, rgba(25, 93, 120, 0.2), transparent 42%), rgba(3, 14, 25, 0.97);
  }

  .mw-fullscreen-content {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .mw-fullscreen-content :deep(.grid-stack-item-content) {
    position: relative !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .mw-fullscreen-content :deep(.mw-widget-fullscreen-toggle) {
    display: none;
  }

  .mw-fullscreen-restore {
    position: absolute;
    z-index: 3;
    top: clamp(18px, 1.8vw, 34px);
    right: clamp(18px, 1.8vw, 34px);
    width: 40px;
    height: 40px;
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

  @media (hover: none) {
    :deep(.mw-widget-fullscreen-toggle) {
      opacity: 0.86;
      transform: none;
    }
  }
</style>
