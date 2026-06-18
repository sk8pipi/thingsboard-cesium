<template>
  <div :class="prefixCls" :style="wrapStyle">
    <div class="dashboard-container" :class="{ fullscreen: isFullscreen }" ref="fullscreenEl">
      <DashboardToolbar
        :title="dashboard?.title || 'Dashboard'"
        :editMode="editMode"
        :loading="loading"
        :isFullscreen="isFullscreen"
        :can-edit="canEditDashboard"
        @enterEdit="enterEdit"
        @save="saveEdit"
        @cancel="cancelEdit"
        @openDrawer="openDrawer"
        @toggleFullscreen="toggleFullscreen"
      />

      <div class="flex h-full gap-3">
        <!-- GridStack 容器 -->
        <div class="flex-1 dashboard-editor grid-stack" ref="editorContainer" :class="{ 'is-edit': editMode }"></div>
      </div>

      <div v-if="errorMsg" class="mt-2 text-red-500 whitespace-pre-wrap">{{ errorMsg }}</div>

      <!-- ✅ 右侧抽屉：部件库 -->
      <WidgetDrawerTb v-if="canEditDashboard" v-model="drawerVisible" @add="addWidgetFromTb" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, createApp, h } from 'vue';
  import { useRoute } from 'vue-router';
  import { useDesign } from '/@/hooks/web/useDesign';
  import { usePermission } from '/@/hooks/web/usePermission';
  import { useLayoutHeight } from '/@/layouts/default/content/useContentViewHeight';
  import { getDashboardById, saveDashboard } from '/@/api/tb/dashboard';
  import { Authority } from '/@/enums/authorityEnum';

  import { GridStack } from 'gridstack';
  import 'gridstack/dist/gridstack.min.css';

  import DashboardToolbar from './runtime/DashboardToolbar.vue';
  import WidgetDrawerTb from './runtime/WidgetDrawerTb.vue';

  import type { GridItem, DashboardWidget, WidgetType } from './runtime/types';
  import { widgetRegistry, type LocalWidgetKey } from './runtime/widgets/registry/widgetRegistry';

  defineOptions({ name: 'DashboardEditor' });

  /** =========================
   *  ✅ GridStack 11+ 默认 textContent，会把 HTML 当文本显示
   *  这里改成 innerHTML（一定要在 init 前设置）
   *  ========================= */
  let gridstackRenderPatched = false;
  function patchGridstackRenderCBOnce() {
    if (gridstackRenderPatched) return;
    gridstackRenderPatched = true;

    // ⚠️ 注意：innerHTML 会有 XSS 风险。你这里的内容是你自己拼的字符串，一般可控。
    GridStack.renderCB = (el, w) => {
      const html = (w as any)?.content ?? '';
      el.innerHTML = String(html);
    };
  }

  const route = useRoute();
  const { hasPermission } = usePermission();
  const { prefixCls } = useDesign('dashboard-view');
  const { headerHeightRef } = useLayoutHeight();

  const heightRef = ref<number>(window.innerHeight);
  const padding = 16;

  const loading = ref(false);
  const errorMsg = ref('');

  const dashboard = ref<any>(null);

  // 编辑模式 & 抽屉
  const editMode = ref(false);
  const drawerVisible = ref(false);

  // 全屏
  const isFullscreen = ref(false);
  const fullscreenEl = ref<HTMLElement | null>(null);

  const editorContainer = ref<HTMLDivElement | null>(null);
  let grid: GridStack | null = null;

  // 你自己的布局/部件数据（存到 dashboard.configuration.__vueLayout/__vueWidgets）
  const vueLayout = ref<GridItem[]>([]);
  const vueWidgets = ref<Record<string, DashboardWidget>>({});

  // 取消编辑需要回滚
  let snapshot: { layout: GridItem[]; widgets: Record<string, DashboardWidget> } | null = null;

  // dashboardId：兼容 params.dashboardId / params.id / query.id
  const dashboardId = computed(() => String(route.params.dashboardId || route.params.id || route.query.id || ''));
  const canEditDashboard = computed(() => hasPermission(Authority.TENANT_ADMIN));

  // 高度计算
  const wrapStyle = computed(() => {
    const top = headerHeightRef.value + padding;
    return { height: `${heightRef.value - top}px` };
  });

  function resize() {
    heightRef.value = window.innerHeight;
  }

  function handleFullscreenChange() {
    isFullscreen.value = !!document.fullscreenElement;
  }

  /** =========================
   *  Vue 小组件挂载管理（Cesium/Chart 等）
   *  ========================= */
  const mountedApps = new Map<string, ReturnType<typeof createApp>>();

  function unmountWidget(id: string) {
    const old = mountedApps.get(id);
    if (old) {
      try {
        old.unmount();
      } catch {}
      mountedApps.delete(id);
    }
  }

  function unmountAllWidgets() {
    mountedApps.forEach((app) => {
      try {
        app.unmount();
      } catch {}
    });
    mountedApps.clear();
  }

  async function mountWidget(id: string, widgetKey: LocalWidgetKey) {
    // ✅ 等两次：nextTick + RAF，确保 GridStack 的 DOM 插入完成
    await nextTick();
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const mountEl = document.getElementById(`tb-mount-${id}`);
    if (!mountEl) return;

    unmountWidget(id);

    const Comp = widgetRegistry[widgetKey];
    if (!Comp) return;

    const app = createApp({
      render: () => h(Comp),
    });

    app.mount(mountEl);
    mountedApps.set(id, app);
  }

  /** =========================
   *  点击删除按钮（事件委托）
   *  ========================= */
  function onEditorClick(e: Event) {
    if (!editMode.value) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    const btn = target.closest?.('.tb-widget-del') as HTMLElement | null;
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const id = btn.getAttribute('data-id') || '';
    if (!id) return;

    deleteWidgetById(id);
  }

  function findGridItemElById(id: string): HTMLElement | null {
    if (!editorContainer.value) return null;

    // GridStack v11 常见是 gs-id，也可能是 data-gs-id
    return (
      (editorContainer.value.querySelector(`.grid-stack-item[gs-id="${id}"]`) as HTMLElement) ||
      (editorContainer.value.querySelector(`.grid-stack-item[data-gs-id="${id}"]`) as HTMLElement) ||
      null
    );
  }

  function deleteWidgetById(id: string) {
    if (!grid) return;

    // 1) 卸载 Vue 组件
    unmountWidget(id);

    // 2) 从 grid 删除 DOM
    const itemEl = findGridItemElById(id);
    if (itemEl) {
      grid.removeWidget(itemEl, true); // ✅ true = 移除格子 DOM
    }

    // 3) 删除数据
    delete vueWidgets.value[id];
    vueLayout.value = vueLayout.value.filter((it) => it.i !== id);

    // 4) 用 grid 当前 nodes 重新生成 layout（更稳）
    vueLayout.value = grid.engine.nodes.map((n) => ({
      i: String(n.id),
      x: n.x ?? 0,
      y: n.y ?? 0,
      w: n.w ?? 1,
      h: n.h ?? 1,
    }));

    syncCanvasHeight();
  }

  /** =========================
   *  路由切换重新加载
   *  ========================= */
  watch(
    () => dashboardId.value,
    async (val) => {
      if (val) await loadDashboard(val);
    },
  );

  /** =========================
   *  初始化
   *  ========================= */
  onMounted(async () => {
    window.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // ✅ 事件委托：监听删除按钮点击
    // （用 capture 更稳，避免 GridStack/内部阻止冒泡）
    await nextTick();
    editorContainer.value?.addEventListener('click', onEditorClick, true);

    // ✅ patch renderCB（一定要在 init 前）
    patchGridstackRenderCBOnce();

    if (!editorContainer.value) return;

    grid = GridStack.init(
      {
        column: 12,
        cellHeight: 30,
        margin: 10,
        float: true,
        draggable: {
          handle: '.tb-widget-title',
          cancel: '.tb-widget-body, .tb-widget-mount, button, input, textarea, select, option, canvas, video, iframe',
        },
      },
      editorContainer.value,
    );

    // ✅ GridStack 真正把 widget DOM 插进去后触发：这里再 mount Vue 组件最稳
    grid.on('added', (_e: any, items: any[]) => {
      for (const it of items || []) {
        const id = String(it?.id ?? '');
        if (!id) continue;

        const type = (vueWidgets.value?.[id]?.type || '') as any;
        if (type === 'cesium3d' || type === 'chart') {
          // 不管之前 mount 失败与否，这里一定会再试一次
          mountWidget(id, type);
        }
      }
    });
    // 拖拽/缩放后同步布局（只在编辑模式同步）
    grid.on('change', () => {
      if (!grid) return;
      if (!editMode.value) return;

      vueLayout.value = grid.engine.nodes.map((n) => ({
        i: String(n.id),
        x: n.x ?? 0,
        y: n.y ?? 0,
        w: n.w ?? 1,
        h: n.h ?? 1,
      }));

      syncCanvasHeight();
    });

    // 初次加载
    if (dashboardId.value) {
      await loadDashboard(dashboardId.value);
    } else {
      errorMsg.value = '缺少 dashboardId（路由参数 dashboardId/id 或 query id）';
    }

    // 默认查看模式：不可拖拽缩放
    grid.setStatic(true);
    editorContainer.value?.classList.remove('tb-editing');
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', resize);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    editorContainer.value?.removeEventListener('click', onEditorClick, true);

    grid?.destroy(false);
    grid = null;

    unmountAllWidgets();
  });

  /** =========================
   *  加载 dashboard + 读取 __vueLayout/__vueWidgets
   *  ========================= */
  async function loadDashboard(id: string) {
    errorMsg.value = '';
    if (!id) {
      errorMsg.value = '缺少 dashboardId';
      return;
    }
    if (!grid) return;

    loading.value = true;
    try {
      const res = await getDashboardById(id);
      dashboard.value = res;

      const cfg = res.configuration || {};
      vueLayout.value = cfg.__vueLayout || [];
      vueWidgets.value = cfg.__vueWidgets || {};

      // 退出编辑（切换 dashboard 时状态清空）
      editMode.value = false;
      drawerVisible.value = false;
      grid.setStatic(true);
      editorContainer.value?.classList.remove('tb-editing');

      renderGrid();
      syncCanvasHeight();
    } catch (e: any) {
      errorMsg.value = e?.message || '加载失败';
    } finally {
      loading.value = false;
    }
  }

  /** =========================
   *  渲染 GridStack
   *  ========================= */
  function widgetHtml(id: string, title: string) {
    // ✅ 删除按钮：始终存在，但你可以用 CSS 做 hover 才显示
    // 逻辑上只有 editMode 才能点（onEditorClick 里限制了）
    return `
      <div class="tb-widget">
        <button class="tb-widget-del" data-id="${id}" title="删除">×</button>
        <div class="tb-widget-title">${title}</div>
        <div class="tb-widget-body">
          <div id="tb-mount-${id}" class="tb-widget-mount"></div>
        </div>
      </div>
    `;
  }

  function renderGrid() {
    if (!grid) return;

    // ✅ 先卸载旧的 Vue 组件
    unmountAllWidgets();

    // 清空旧 widgets
    grid.removeAll(false);
    hardClearGridDom(); // ✅ 新增：把残留的空框删掉

    vueLayout.value.forEach((it) => {
      const w = vueWidgets.value[it.i];
      const title = w?.title || it.i;
      const type = (w?.type || 'unknown') as any;

      grid!.addWidget({
        id: it.i,
        x: it.x,
        y: it.y,
        w: it.w,
        h: it.h,
        content: widgetHtml(it.i, title),
      } as any);

      // ✅ 仅挂载我们本地的两种
      if (type === 'cesium3d' || type === 'chart') {
        mountWidget(it.i, type);
      }
    });
  }

  /** =========================
   *  顶栏按钮逻辑
   *  ========================= */
  function enterEdit() {
    if (!grid) return;
    if (!canEditDashboard.value) return;

    snapshot = {
      layout: JSON.parse(JSON.stringify(vueLayout.value)),
      widgets: JSON.parse(JSON.stringify(vueWidgets.value)),
    };

    editMode.value = true;
    grid.setStatic(false);

    editorContainer.value?.classList.add('tb-editing');
    drawerVisible.value = true;
  }

  function openDrawer() {
    if (!canEditDashboard.value) return;
    if (!editMode.value) return;
    drawerVisible.value = true;
  }

  function cancelEdit() {
    if (!grid) return;

    if (snapshot) {
      vueLayout.value = JSON.parse(JSON.stringify(snapshot.layout));
      vueWidgets.value = JSON.parse(JSON.stringify(snapshot.widgets));
      renderGrid();
      syncCanvasHeight();
    }

    editMode.value = false;
    drawerVisible.value = false;
    grid.setStatic(true);

    editorContainer.value?.classList.remove('tb-editing');
  }

  async function saveEdit() {
    if (!grid) return;
    if (!dashboardId.value) return;
    if (!canEditDashboard.value) return;

    loading.value = true;
    errorMsg.value = '';
    try {
      const latest = await getDashboardById(dashboardId.value);

      const layout: GridItem[] = grid.engine.nodes.map((n) => ({
        i: String(n.id),
        x: n.x ?? 0,
        y: n.y ?? 0,
        w: n.w ?? 1,
        h: n.h ?? 1,
      }));

      latest.configuration = latest.configuration || {};
      latest.configuration.__vueLayout = layout;
      latest.configuration.__vueWidgets = vueWidgets.value;

      await saveDashboard(latest);

      vueLayout.value = layout;

      editMode.value = false;
      drawerVisible.value = false;
      grid.setStatic(true);
      editorContainer.value?.classList.remove('tb-editing');
    } catch (e: any) {
      errorMsg.value = e?.message || '保存失败';
    } finally {
      loading.value = false;
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        const el = fullscreenEl.value || document.documentElement;
        if (el.requestFullscreen) await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn('Fullscreen failed:', e);
    }
  }

  /** =========================
   *  画布高度同步（让内容能往下排 + 滚动看到下面）
   *  ========================= */
  const EXTRA_ROWS = 6;

  function syncCanvasHeight() {
    if (!grid || !editorContainer.value) return;

    const nodes = grid.engine.nodes || [];
    let maxBottom = 0;
    for (const n of nodes as any[]) {
      const bottom = (n.y ?? 0) + (n.h ?? 1);
      if (bottom > maxBottom) maxBottom = bottom;
    }

    const rowH = 30 + 10; // cellHeight=30 margin=10
    const minPx = Math.max(editorContainer.value.clientHeight, (maxBottom + EXTRA_ROWS) * rowH);

    editorContainer.value.style.minHeight = `${minPx}px`;
    grid.resize();
  }

  /** =========================
   *  抽屉添加部件：从 TB 列表里选（只接你本地两个）
   *  ========================= */
  function addWidgetFromTb(w: any) {
    if (!grid) return;
    if (!canEditDashboard.value) return;
    if (!editMode.value) return;

    const widgetKey = (w?.alias || '') as LocalWidgetKey;
    if (widgetKey !== 'cesium3d' && widgetKey !== 'chart') return;

    const id = `w_${Date.now()}`;

    vueWidgets.value[id] = {
      id,
      type: widgetKey,
      title: w?.name || widgetKey,
      config: {},
    };

    grid.addWidget({
      id,
      w: 6,
      h: 4,
      content: widgetHtml(id, w?.name || widgetKey),
    } as any);

    mountWidget(id, widgetKey);

    vueLayout.value = grid.engine.nodes.map((n) => ({
      i: String(n.id),
      x: n.x ?? 0,
      y: n.y ?? 0,
      w: n.w ?? 1,
      h: n.h ?? 1,
    }));

    syncCanvasHeight();
  }

  /** 你旧的 addWidget(type: WidgetType) 如果还在用，也保留不影响 */
  function addWidget(type: WidgetType) {
    if (!grid) return;
    if (!canEditDashboard.value) return;
    if (!editMode.value) return;

    const id = `w_${Date.now()}`;
    const title = type === 'timeseries' ? '折线图' : type === 'singleValue' ? '单值卡片' : '部件';

    vueWidgets.value[id] = { id, type, title, config: {} };

    grid.addWidget({
      id,
      w: 6,
      h: 4,
      content: widgetHtml(id, title),
    } as any);

    vueLayout.value = grid.engine.nodes.map((n) => ({
      i: String(n.id),
      x: n.x ?? 0,
      y: n.y ?? 0,
      w: n.w ?? 1,
      h: n.h ?? 1,
    }));

    syncCanvasHeight();
  }
  function hardClearGridDom() {
    if (!editorContainer.value) return;

    // GridStack removeAll(false) 会留下 DOM，这里手动删掉
    const els = editorContainer.value.querySelectorAll('.grid-stack-item');
    els.forEach((el) => el.remove());
  }
</script>

<style scoped>
  .dashboard-container {
    height: 100%;
    padding: 24px;
    padding-top: 5px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .dashboard-editor {
    width: 100%;
    min-height: 100%;
    background: #f5f5f5;
    border: 1px dashed #ccc;
    overflow: auto;
  }

  /* 全屏时更贴边一点 */
  .fullscreen {
    padding: 8px;
  }

  /* widget 样式 */
  :deep(.tb-widget) {
    height: 100%;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  :deep(.tb-widget-title) {
    padding: 8px 10px;
    font-weight: 600;
    border-bottom: 1px solid #eee;
  }

  :deep(.tb-widget-body) {
    padding: 10px;
    font-size: 12px;
    opacity: 0.7;
    flex: 1;
  }
  :deep(.tb-widget-body) {
    height: calc(100% - 0px);
  }

  :deep(.tb-widget-mount) {
    width: 100%;
    height: 100%;
  }
  /* 默认隐藏 */
  :deep(.tb-widget-del) {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    border: 1px solid #ddd;
    background: #fff;
    cursor: pointer;
    display: none;
    z-index: 10;
  }

  /* 编辑模式 hover 才显示（tb-editing 是我在 script 里动态加到 editorContainer 的 class） */
  :deep(.tb-editing .tb-widget) {
    position: relative;
  }
  :deep(.tb-editing .tb-widget:hover .tb-widget-del) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  /* ====== 删除按钮：编辑模式 hover 显示（最稳版）====== */

  /* 让 content 成为定位容器（按钮会贴右上角） */
  :deep(.grid-stack-item-content) {
    position: relative;
  }

  /* 默认隐藏 */
  :deep(.tb-widget-del) {
    position: absolute;
    top: 6px;
    right: 6px;

    width: 26px;
    height: 26px;
    border-radius: 999px;

    /* 你要的颜色：按钮底色=主题色，字=白，边框=白 */
    background: rgb(22, 100, 145);
    color: #fff;
    border: 1px solid #fff;

    cursor: pointer;
    z-index: 9999;

    display: none;
    align-items: center;
    justify-content: center;
    line-height: 1;

    /* 防止被拖拽层影响点击 */
    pointer-events: auto;
  }

  /* 只有编辑模式才显示：hover 整个格子 content 就显示按钮 */
  :deep(.is-edit .grid-stack-item-content:hover .tb-widget-del) {
    display: inline-flex;
  }

  /* hover 小效果 */
  :deep(.is-edit .grid-stack-item-content:hover .tb-widget-del:hover) {
    transform: scale(1.05);
  }
</style>
