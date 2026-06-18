<template>
  <div class="mw-editor">
    <SelectDeviceDialog
      :visible="widgetDeviceDialogVisible"
      title="选择部件数据设备"
      ok-text="添加部件"
      @cancel="closeWidgetDeviceDialog"
      @ok="onWidgetDevicePicked"
    />

    <SelectDeviceDialog
      :visible="sensorPointDialogVisible"
      :require-keys="false"
      title="配置传感器点位"
      ok-text="保存点位"
      detail-hint="新建点位只绑定 ThingsBoard Device，不需要选择 key。保存点位后可点击点位继续配置弹窗数据 key。"
      @cancel="cancelPointConfig"
      @ok="onSensorPointConfigured"
    />

    <SelectDeviceDialog
      :visible="cameraPointDialogVisible"
      :require-keys="false"
      title="绑定监控点位 Device"
      ok-text="保存点位"
      detail-hint="监控点位只绑定 ThingsBoard Device，播放地址和运行状态后续从 Device attributes / latest telemetry 读取。"
      @cancel="cancelPointConfig"
      @ok="onCameraPointConfigured"
    />

    <CesiumMap
      ref="cesiumMapRef"
      class="mw-cesium"
      :sensor-points="sensorPoints"
      :camera-points="cameraPoints"
      :mode="cesiumInteractionMode"
      :hide-base-points="editorMode === 'pickingPoint'"
      :globe-only="templateGlobeOnly"
      :scene-models="templateScene.models"
      @sensor-click="onSensorClick"
      @camera-click="onCameraClick"
      @map-click="onMapPicked"
    />

    <div class="mw-topbar">
      <div class="mw-topbar-left">
        <button class="mw-btn" type="button" @click="onExit">退出</button>
      </div>

      <div class="mw-topbar-right">
        <button v-if="canEditTemplate && editorMode === 'view'" class="mw-btn primary" type="button" @click="enterEdit">
          编辑
        </button>

        <template v-else-if="canEditTemplate">
          <button
            class="mw-btn"
            :class="{ active: editorMode === 'pickingPoint' }"
            type="button"
            :disabled="editorMode !== 'editing' && editorMode !== 'pickingPoint'"
            @click="togglePickingPoint"
          >
            选点
          </button>
          <button class="mw-btn" type="button" :disabled="editorMode !== 'editing'" @click="openAddPanel">
            添加部件
          </button>
          <button class="mw-btn" type="button" @click="cancelEdit">取消</button>
          <button class="mw-btn primary" type="button" :disabled="!canSaveEdit" @click="saveEdit"> 保存 </button>
        </template>
      </div>
    </div>

    <div v-if="editorMode === 'pickingPoint'" class="mw-mode-banner">
      <div class="mw-mode-banner__text">请在地图上点击选择点位，也可以拖动已有点位调整位置</div>
      <button class="mw-btn" type="button" @click="cancelPickingPoint">取消选点</button>
    </div>

    <div v-if="pointTypeDialogVisible" class="mw-dialog-mask" @click.self="cancelPointTypeSelection">
      <div class="mw-dialog-card">
        <div class="mw-dialog-title">选择点位类型</div>
        <div class="mw-dialog-sub">
          经度 {{ formatCoordinate(pendingPointLocation?.longitude) }}，纬度
          {{ formatCoordinate(pendingPointLocation?.latitude) }}，高度
          {{ formatHeight(pendingPointLocation?.height) }} m
        </div>
        <div class="mw-dialog-actions">
          <button class="mw-btn primary" type="button" @click="choosePointType('sensor')">传感器点位</button>
          <button class="mw-btn primary" type="button" @click="choosePointType('camera')">监控点位</button>
          <button class="mw-btn" type="button" @click="cancelPointTypeSelection">取消</button>
        </div>
      </div>
    </div>

    <SensorPopupWidgetEditor
      :visible="sensorConfigVisible"
      :sensor="selectedSensor"
      :widgets="selectedSensor ? getSensorPopupWidgetsForEditor(selectedSensor.id) : []"
      @close="sensorConfigVisible = false"
      @saved="handleSensorPopupSaved"
    />

    <SensorWidgetPopup
      :visible="sensorPreviewVisible"
      :sensor="selectedSensor"
      :widgets="selectedSensor ? getSensorPopupWidgetsForView(selectedSensor.id) : []"
      @close="sensorPreviewVisible = false"
    />

    <CameraMonitorPopup
      :visible="cameraPopupVisible"
      :runtime-info="selectedCameraRuntime"
      :loading="cameraRuntimeLoading"
      :error="cameraRuntimeError"
      @close="closeCameraPopup"
    />

    <div
      v-if="editorMode === 'editing' && currentWidget && currentWidget.widgetKey === 'controlSwitch'"
      class="mw-control-editor"
    >
      <ControlSwitchEditor
        :model-value="controlSwitchSettingsModel"
        @update:model-value="updateControlSwitchSettings"
        @save="handleControlSwitchSettingsSave"
      />
    </div>

    <div v-if="canEditTemplate && editorMode === 'editing' && addPanelVisible" class="mw-add-panel">
      <div class="mw-add-title">选择要添加的部件</div>

      <div class="mw-add-list">
        <input
          ref="fileInputEl"
          type="file"
          accept="application/json"
          style="display: none"
          @change="onImportFileChange"
        />
        <button class="mw-add-item" type="button" @click="fileInputEl?.click()">导入 ThingsBoard 部件 JSON</button>

        <button
          v-for="def in builtInWidgetDefs"
          :key="def.key"
          class="mw-add-item"
          type="button"
          @click="addWidgetByKey(def.key)"
        >
          内置：{{ def.title }}
        </button>

        <div v-if="libraryDefs.length" class="mw-lib-title">已导入部件</div>

        <div v-for="def in libraryDefs" :key="def.id" class="mw-lib-item">
          <button class="mw-add-item" type="button" @click="addFromLibrary(def)">
            {{ def.name }} <span class="mw-lib-kind">（{{ def.kind }}）</span>
          </button>
          <button class="mw-lib-del" type="button" @click="deleteFromLibrary(def.id)">删除</button>
        </div>

        <div v-if="!libraryDefs.length" class="mw-empty-hint">暂无已导入部件</div>
      </div>

      <div class="mw-add-footer">
        <button class="mw-btn" type="button" @click="addPanelVisible = false">关闭</button>
      </div>
    </div>

    <div
      ref="gridEl"
      class="mw-grid grid-stack"
      :class="{
        'mw-grid--editing': editorMode !== 'view',
        'mw-grid--hidden': shouldHideWidgetLayer,
      }"
    ></div>

    <div v-if="dragHint" class="mw-toast">{{ dragHint }}</div>
    <div v-if="errorMsg" class="mw-error">{{ errorMsg }}</div>
  </div>
</template>

<script setup lang="ts">
  import { computed, createApp, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import type * as Cesium from 'cesium';
  import { useRoute, useRouter } from 'vue-router';
  import { GridStack } from 'gridstack';
  import 'gridstack/dist/gridstack.min.css';
  import CesiumMap from './CesiumMap.vue';
  import SelectDeviceDialog from './SelectDeviceDialog.vue';
  import SensorWidgetPopup from './SensorWidgetPopup.vue';
  import SensorPopupWidgetEditor from './SensorPopupWidgetEditor.vue';
  import CameraMonitorPopup from './components/CameraMonitorPopup.vue';
  import { getMapWidgetStorageKey } from './mapWidgetStorage';
  import { loadMapPoints, saveMapPoints } from './mapPointStorage';
  import { useMapPointEditor } from './useMapPointEditor';
  import {
    getSensorPopupWidgets,
    loadSensorPopupBindings,
    saveSensorPopupBindings,
    type PopupWidgetConfig,
    type SensorPopupBinding,
  } from './sensorPopupWidgetStorage';
  import { loadCameraRuntimeInfo } from './services/cameraDeviceRuntimeService';
  import type {
    CameraMapPoint,
    CameraRuntimeInfo,
    MapEditorMode,
    MapPoint,
    MapPointLocation,
    MapPointType,
    SensorMapPoint,
  } from './types/mapPointTypes';
  import { widgetRegistry } from '../dashboard/runtime/widgets/registry/widgetRegistry';
  import type { DashboardWidget, GridItem, LocalWidgetKey, TbWidgetConfig } from '../dashboard/runtime/types';
  import { importThingsboardJson } from './widgetLibrary/importThingsboardWidget';
  import { loadWidgetLibrary, removeWidget, upsertWidget } from './widgetLibrary/libraryStorage';
  import type { CustomWidgetDefinition } from './widgetLibrary/types';
  import WidgetHost from '../dashboard/runtime/widgets/WidgetHost.vue';
  import { createDatasourceRuntime } from '../dashboard/runtime/datasourceRuntime';
  import ControlSwitchEditor from '../dashboard/runtime/widgets/control/ControlSwitchEditor.vue';
  import { getDashboardById, saveDashboard, type Dashboard } from '/@/api/tb/dashboard';
  import { Authority } from '/@/enums/authorityEnum';
  import { usePermission } from '/@/hooks/web/usePermission';
  import {
    DASHBOARD_MAP_WIDGET_CONFIG_KEY,
    createDefaultMapTemplateState,
    normalizeMapTemplateState,
    type MapTemplateScene,
    type MapTemplateState,
  } from './mapTemplateConfig';

  type WidgetData = DashboardWidget & {
    type: LocalWidgetKey;
    config: TbWidgetConfig;
  };

  type WidgetSnapshot = {
    layout: GridItem[];
    widgets: Record<string, WidgetData>;
  };

  type MapWidgetEditorState = MapTemplateState;

  type CesiumMapExpose = {
    getViewer: () => Cesium.Viewer | undefined;
  };

  function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  function upsertDraftPoint(points: MapPoint[], point: MapPoint) {
    const index = points.findIndex((item) => item.id === point.id);
    if (index >= 0) {
      points[index] = point;
      return;
    }
    points.push(point);
  }

  const router = useRouter();
  const route = useRoute();
  const { hasPermission } = usePermission();

  const pendingImportedConfig = ref<Record<string, any> | null>(null);
  const pendingWidgetKey = ref<LocalWidgetKey | ''>('');
  const pendingWidgetTitle = ref('');

  const widgetDeviceDialogVisible = ref(false);
  const sensorPointDialogVisible = ref(false);
  const cameraPointDialogVisible = ref(false);
  const cesiumMapRef = ref<CesiumMapExpose | null>(null);

  const gridEl = ref<HTMLDivElement | null>(null);
  const fileInputEl = ref<HTMLInputElement | null>(null);
  let grid: any = null;

  const editorMode = ref<MapEditorMode>('view');
  const addPanelVisible = ref(false);
  const errorMsg = ref('');
  const dragHint = ref('');
  let dragHintTimer: ReturnType<typeof setTimeout> | null = null;

  const pendingPointLocation = ref<Required<MapPointLocation> | null>(null);

  const selectedSensor = ref<SensorMapPoint | null>(null);
  const sensorConfigVisible = ref(false);
  const sensorPreviewVisible = ref(false);

  const cameraPopupVisible = ref(false);
  const selectedCameraPoint = ref<CameraMapPoint | null>(null);
  const selectedCameraRuntime = ref<CameraRuntimeInfo | null>(null);
  const cameraRuntimeLoading = ref(false);
  const cameraRuntimeError = ref('');
  let cameraRuntimeRequestId = 0;

  const libraryDefs = ref<CustomWidgetDefinition[]>([]);
  const selectedWidgetId = ref('');

  const layout = ref<GridItem[]>([]);
  const widgets = ref<Record<string, WidgetData>>({});
  let widgetSnapshot: WidgetSnapshot | null = null;
  const dashboardTemplate = ref<Dashboard | null>(null);
  const templateScene = ref<MapTemplateScene>(createDefaultMapTemplateState().scene);

  const originalMapPoints = ref<MapPoint[]>(loadMapPoints());
  const draftMapPoints = ref<MapPoint[]>(cloneJson(originalMapPoints.value));
  const originalSensorPopupBindings = ref<SensorPopupBinding>(loadSensorPopupBindings());
  const draftSensorPopupBindings = ref<SensorPopupBinding>(cloneJson(originalSensorPopupBindings.value));

  const mountedApps = new Map<string, ReturnType<typeof createApp>>();
  const datasourceRuntime = createDatasourceRuntime();
  const pointEditor = useMapPointEditor({
    getViewer: () => cesiumMapRef.value?.getViewer() || null,
    getPoints: () => draftMapPoints.value,
    setPoints: (points) => {
      draftMapPoints.value = cloneJson(points);
    },
    onPointDelete: (point) => {
      removeDraftPoint(point.id);
    },
    onPointClick: (point) => {
      if (editorMode.value !== 'pickingPoint') return;

      editorMode.value = 'editing';
      if (point.type === 'sensor') {
        onSensorClick(point);
        return;
      }

      void onCameraClick(point);
    },
    onPointDragEnd: (point) => {
      showDragHint(point);
    },
  });

  let renderPatched = false;

  const builtInWidgetDefs = computed(() => Object.values(widgetRegistry).filter((item) => item.key !== 'cesium3d'));
  const currentWidget = computed(() => {
    if (!selectedWidgetId.value) return null;
    return widgets.value[selectedWidgetId.value] || null;
  });
  const controlSwitchSettingsModel = computed(() => currentWidget.value?.config?.settings as any);
  const activeMapPoints = computed(() =>
    editorMode.value === 'view' ? originalMapPoints.value : draftMapPoints.value,
  );
  const sensorPoints = computed(() =>
    activeMapPoints.value.filter((point): point is SensorMapPoint => point.type === 'sensor'),
  );
  const cameraPoints = computed(() =>
    activeMapPoints.value.filter((point): point is CameraMapPoint => point.type === 'camera'),
  );
  const canSaveEdit = computed(
    () => canEditTemplate.value && (editorMode.value === 'editing' || editorMode.value === 'pickingPoint'),
  );
  const dashboardId = computed(() => String(route.query.dashboardId || ''));
  const isDashboardTemplateMode = computed(() => Boolean(dashboardId.value));
  const canEditTemplate = computed(() => !isDashboardTemplateMode.value || hasPermission(Authority.TENANT_ADMIN));
  const templateGlobeOnly = computed(() =>
    isDashboardTemplateMode.value ? templateScene.value.globeOnly !== false : false,
  );
  const cesiumInteractionMode = computed(() => (editorMode.value === 'pickingPoint' ? 'pickPoint' : 'default'));
  const pointTypeDialogVisible = computed(() => editorMode.value === 'selectingPointType');
  const shouldHideWidgetLayer = computed(() =>
    ['pickingPoint', 'selectingPointType', 'configuringSensorPoint', 'configuringCameraPoint'].includes(
      editorMode.value,
    ),
  );

  function patchGridstackRenderOnce() {
    if (renderPatched) return;
    renderPatched = true;
    GridStack.renderCB = (el, widget) => {
      const html = (widget as any)?.content ?? '';
      el.innerHTML = String(html);
    };
  }

  function reloadLibrary() {
    libraryDefs.value = loadWidgetLibrary();
  }

  function widgetStorageKey() {
    return getMapWidgetStorageKey();
  }

  function normalizeWidgetState(rawWidgets: unknown): Record<string, WidgetData> {
    const normalized: Record<string, WidgetData> = {};
    const source = rawWidgets && typeof rawWidgets === 'object' ? rawWidgets : {};

    Object.entries(source).forEach(([id, widget]: any) => {
      const widgetKey = widget?.widgetKey || widget?.type;
      const def = widgetKey ? widgetRegistry[widgetKey as LocalWidgetKey] : null;
      if (!def) return;

      normalized[id] = {
        id,
        category: widget?.category || def.category,
        widgetKey,
        type: widgetKey,
        typeFullFqn: widget?.typeFullFqn || def.typeFullFqn,
        title: widget?.title || def.title,
        config: {
          ...def.defaultConfig,
          ...(widget?.config || {}),
        },
      } as WidgetData;
    });

    return normalized;
  }

  function applyEditorState(state?: Partial<MapWidgetEditorState> | null) {
    const normalized = normalizeMapTemplateState(state);
    templateScene.value = cloneJson(normalized.scene);
    layout.value = normalized.layout;
    widgets.value = normalizeWidgetState(normalized.widgets);
    originalMapPoints.value = cloneJson(normalized.mapPoints);
    draftMapPoints.value = cloneJson(originalMapPoints.value);
    originalSensorPopupBindings.value = cloneJson(normalized.sensorPopupBindings);
    draftSensorPopupBindings.value = cloneJson(originalSensorPopupBindings.value);
  }

  function getEditorState(): MapWidgetEditorState {
    return {
      ...createDefaultMapTemplateState(),
      scene: cloneJson(templateScene.value),
      layout: cloneJson(layout.value),
      widgets: cloneJson(widgets.value),
      mapPoints: cloneJson(draftMapPoints.value),
      sensorPopupBindings: cloneJson(draftSensorPopupBindings.value),
    };
  }

  function loadWidgetsFromLocal() {
    try {
      const raw = localStorage.getItem(widgetStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);

      layout.value = Array.isArray(parsed?.layout) ? parsed.layout : [];
      widgets.value = normalizeWidgetState(parsed?.widgets);
    } catch (error) {
      console.warn('load map widgets failed', error);
    }
  }

  function saveWidgetsToLocal(state = getEditorState()) {
    localStorage.setItem(
      widgetStorageKey(),
      JSON.stringify({
        layout: state.layout,
        widgets: state.widgets,
      }),
    );
  }

  async function loadEditorState() {
    if (isDashboardTemplateMode.value) {
      const dashboard = await getDashboardById(dashboardId.value);
      dashboardTemplate.value = dashboard;
      applyEditorState(dashboard.configuration?.[DASHBOARD_MAP_WIDGET_CONFIG_KEY]);
      return;
    }

    loadWidgetsFromLocal();
    applyEditorState({
      layout: layout.value,
      widgets: widgets.value,
      mapPoints: loadMapPoints(),
      sensorPopupBindings: loadSensorPopupBindings(),
    });
  }

  async function persistEditorState(state = getEditorState()) {
    if (isDashboardTemplateMode.value) {
      const latest = await getDashboardById(dashboardId.value);
      latest.configuration = latest.configuration || {};
      latest.configuration[DASHBOARD_MAP_WIDGET_CONFIG_KEY] = state;
      await saveDashboard(latest);
      dashboardTemplate.value = latest;
      return;
    }

    saveWidgetsToLocal(state);
    saveMapPoints(state.mapPoints);
    saveSensorPopupBindings(state.sensorPopupBindings);
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

  function unmountAllWidgets() {
    mountedApps.forEach((app) => {
      try {
        app.unmount();
      } catch {}
    });
    mountedApps.clear();
  }

  async function mountWidget(id: string, key: LocalWidgetKey) {
    await nextTick();
    const mountEl = document.getElementById(`mw-mount-${id}`);
    if (!mountEl) return;

    unmountWidget(id);

    const widget = widgets.value[id];
    if (!widget) return;

    const app = createApp({
      render: () =>
        h(WidgetHost, {
          widget,
          runtime: datasourceRuntime,
        }),
    });

    app.mount(mountEl);
    mountedApps.set(id, app);
  }

  function widgetHtml(id: string, title: string) {
    return `
      <div class="mw-widget" data-widget-id="${id}">
        <button class="mw-del" data-id="${id}" title="删除">×</button>
        <div class="mw-title" data-widget-id="${id}">${title}</div>
        <div class="mw-body">
          <div id="mw-mount-${id}" class="mw-mount"></div>
        </div>
      </div>
    `;
  }

  function renderGrid() {
    if (!grid) return;

    unmountAllWidgets();
    grid.removeAll(true);

    layout.value.forEach((item) => {
      const widget = widgets.value[item.i];
      const title = widget?.title || item.i;
      const widgetKey = (widget?.widgetKey || widget?.type) as LocalWidgetKey | undefined;

      grid?.addWidget({
        id: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        content: widgetHtml(item.i, title),
      } as any);

      if (widgetKey) {
        void mountWidget(item.i, widgetKey);
      }
    });
  }

  function syncLayoutFromGrid() {
    if (!grid) return;
    layout.value = grid.engine.nodes.map((node) => ({
      i: String(node.id),
      x: node.x ?? 0,
      y: node.y ?? 0,
      w: node.w ?? 1,
      h: node.h ?? 1,
    }));
  }

  function deleteWidgetById(id: string, buttonEl?: HTMLElement) {
    if (!grid) return;

    unmountWidget(id);

    const itemEl =
      (buttonEl?.closest('.grid-stack-item') as HTMLElement | null) ||
      (gridEl.value?.querySelector(`.grid-stack-item[gs-id="${id}"]`) as HTMLElement | null) ||
      (gridEl.value?.querySelector(`.grid-stack-item[data-gs-id="${id}"]`) as HTMLElement | null) ||
      null;

    if (itemEl) {
      grid.removeWidget(itemEl, true);
    }

    delete widgets.value[id];
    layout.value = layout.value.filter((item) => item.i !== id);
    selectedWidgetId.value = selectedWidgetId.value === id ? '' : selectedWidgetId.value;
    syncLayoutFromGrid();
  }

  function onGridClick(event: Event) {
    if (editorMode.value === 'view' || editorMode.value === 'pickingPoint') return;

    const target = event.target as HTMLElement | null;
    if (!target) return;

    const deleteButton = target.closest?.('.mw-del') as HTMLElement | null;
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();

      const id = deleteButton.getAttribute('data-id') || '';
      if (id) {
        deleteWidgetById(id, deleteButton);
      }
      return;
    }

    const titleEl = target.closest?.('.mw-title') as HTMLElement | null;
    const widgetId = titleEl?.getAttribute('data-widget-id') || '';
    if (widgetId) {
      selectedWidgetId.value = widgetId;
      addPanelVisible.value = false;
    }
  }

  function createWidgetAndAddToGrid(key: LocalWidgetKey, title: string, config: Record<string, any>) {
    if (!grid) return;

    const def = widgetRegistry[key];
    if (!def) return;

    const id = `mw_${Date.now()}`;
    widgets.value[id] = {
      id,
      category: def.category,
      widgetKey: key,
      type: key,
      typeFullFqn: def.typeFullFqn,
      title,
      config: {
        ...def.defaultConfig,
        ...config,
      },
    } as WidgetData;

    grid.addWidget({
      id,
      w: 5,
      h: 4,
      content: widgetHtml(id, title),
    } as any);

    void mountWidget(id, key);
    syncLayoutFromGrid();
    addPanelVisible.value = false;
  }

  function addWidgetByKey(key: LocalWidgetKey) {
    if (!grid || editorMode.value !== 'editing') return;

    const def = widgetRegistry[key];
    if (!def) {
      errorMsg.value = `未找到部件定义：${key}`;
      return;
    }

    const title = def.title;

    if (def.editor === 'timeseries' || def.editor === 'latest' || def.editor === 'control') {
      pendingWidgetKey.value = key;
      pendingWidgetTitle.value = title;
      pendingImportedConfig.value = null;
      widgetDeviceDialogVisible.value = true;
      return;
    }

    createWidgetAndAddToGrid(key, title, {
      ...def.defaultConfig,
    });
  }

  async function onImportFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const defs = importThingsboardJson(json);

      if (!defs.length) {
        errorMsg.value = '导入失败：未识别到 ThingsBoard widget/bundle 格式';
        return;
      }

      for (const def of defs) {
        if (def.kind !== 'chart' && def.kind !== 'pie' && def.kind !== 'bar') continue;
        upsertWidget(def);
      }

      reloadLibrary();
      errorMsg.value = '';
    } catch (error: any) {
      errorMsg.value = error?.message || String(error);
    } finally {
      input.value = '';
    }
  }

  function deleteFromLibrary(id: string) {
    removeWidget(id);
    reloadLibrary();
  }

  function mapImportedKindToLocalKey(def: CustomWidgetDefinition): LocalWidgetKey | '' {
    if ((def as any).typeFullFqn) {
      const found = Object.values(widgetRegistry).find((item) => item.typeFullFqn === (def as any).typeFullFqn);
      if (found) return found.key;
    }

    if (def.kind === 'chart') return 'timeseriesLine';
    if (def.kind === 'bar') return 'latestBar';
    if (def.kind === 'pie') return 'latestPie';
    return '';
  }

  function addFromLibrary(def: CustomWidgetDefinition) {
    if (!grid || editorMode.value !== 'editing') return;

    const localKey = mapImportedKindToLocalKey(def);
    if (!localKey) {
      errorMsg.value = `暂不支持该部件类型：${def.kind}`;
      return;
    }

    pendingWidgetKey.value = localKey;
    pendingWidgetTitle.value = def.name;
    pendingImportedConfig.value = def.defaultConfig || {};
    widgetDeviceDialogVisible.value = true;
  }

  function closeWidgetDeviceDialog() {
    widgetDeviceDialogVisible.value = false;
    pendingWidgetKey.value = '';
    pendingWidgetTitle.value = '';
    pendingImportedConfig.value = null;
  }

  function onWidgetDevicePicked(payload: { deviceId: string; deviceName: string; keys: string[]; pollMs: number }) {
    errorMsg.value = '';
    if (!grid) return;

    const key = pendingWidgetKey.value;
    if (!key) return;

    const def = widgetRegistry[key];
    if (!def) {
      errorMsg.value = `未找到部件定义：${key}`;
      return;
    }

    const title = pendingWidgetTitle.value || def.title;
    const imported = pendingImportedConfig.value || {};
    widgetDeviceDialogVisible.value = false;

    const baseDatasource = {
      type: 'device',
      entityType: 'DEVICE',
      entityId: payload.deviceId,
      keys: payload.keys,
      dataKeys: payload.keys.map((name) => ({
        name,
        type: 'timeseries',
      })),
      pollMs: payload.pollMs,
    };

    const mergedDatasource = {
      ...(imported as any).datasource,
      ...baseDatasource,
    };

    const config: any = {
      ...def.defaultConfig,
      ...imported,
      datasource: mergedDatasource,
      datasources: [mergedDatasource],
    };

    if (key === 'ledIndicator') {
      const stateKey = payload.keys?.[0] || 'value';
      config.settings = {
        ...(def.defaultConfig?.settings || {}),
        ...((imported as any).settings || {}),
        title,
        key: stateKey,
      };
    }

    if (key === 'latestPie') {
      config.tbPie = { ...(imported as any).tbPie, keys: payload.keys };
    }

    if (key === 'latestBar') {
      config.tbBar = { ...(imported as any).tbBar, keys: payload.keys };
    }

    if (key === 'controlSwitch') {
      const stateKey = payload.keys?.[0] || 'value';
      config.settings = {
        ...(def.defaultConfig?.settings || {}),
        ...((imported as any).settings || {}),
        title,
        targetDeviceId: payload.deviceId,
        getValue: {
          ...(def.defaultConfig?.settings?.getValue || {}),
          ...((imported as any).settings?.getValue || {}),
          key: stateKey,
        },
        setValue: {
          ...(def.defaultConfig?.settings?.setValue || {}),
          ...((imported as any).settings?.setValue || {}),
          key: stateKey,
        },
        valueSettings: {
          ...(def.defaultConfig?.settings?.valueSettings || {}),
          ...((imported as any).settings?.valueSettings || {}),
        },
      };

      config.datasource = {
        type: 'device',
        entityType: 'DEVICE',
        entityId: payload.deviceId,
        keys: [stateKey],
        dataKeys: [
          {
            name: stateKey,
            type: 'timeseries',
          },
        ],
        pollMs: payload.pollMs,
      };

      config.datasources = [config.datasource];
    }

    createWidgetAndAddToGrid(key, title, config);
    closeWidgetDeviceDialog();
  }

  function closeAllOverlays() {
    addPanelVisible.value = false;
    sensorPreviewVisible.value = false;
    sensorConfigVisible.value = false;
    selectedSensor.value = null;
    closeCameraPopup();
  }

  function clearDragHint() {
    dragHint.value = '';
    if (dragHintTimer) {
      clearTimeout(dragHintTimer);
      dragHintTimer = null;
    }
  }

  function showDragHint(point: MapPoint) {
    const longitude = formatCoordinate(point.longitude);
    const latitude = formatCoordinate(point.latitude);
    const hasHeight = point.height !== undefined && point.height !== null && !Number.isNaN(point.height);
    const heightText = hasHeight ? `，高度 ${formatHeight(point.height)} m` : '';

    dragHint.value = `${point.name} 已移动到 经度 ${longitude}，纬度 ${latitude}${heightText}，点击保存后同步到 ThingsBoard`;

    if (dragHintTimer) {
      clearTimeout(dragHintTimer);
    }

    dragHintTimer = setTimeout(() => {
      dragHint.value = '';
      dragHintTimer = null;
    }, 2400);
  }

  function removeDraftPoint(pointId: string) {
    const targetPoint = draftMapPoints.value.find((point) => point.id === pointId) || null;
    draftMapPoints.value = draftMapPoints.value.filter((point) => point.id !== pointId);

    if (targetPoint?.type === 'sensor') {
      const nextBindings = cloneJson(draftSensorPopupBindings.value);
      delete nextBindings[pointId];
      draftSensorPopupBindings.value = nextBindings;
    }

    if (selectedSensor.value?.id === pointId) {
      selectedSensor.value = null;
      sensorConfigVisible.value = false;
      sensorPreviewVisible.value = false;
    }

    if (selectedCameraPoint.value?.id === pointId) {
      closeCameraPopup();
    }
  }

  function enterEdit() {
    if (!grid) return;
    if (!canEditTemplate.value) return;

    widgetSnapshot = {
      layout: cloneJson(layout.value),
      widgets: cloneJson(widgets.value),
    };
    draftMapPoints.value = cloneJson(originalMapPoints.value);
    draftSensorPopupBindings.value = cloneJson(originalSensorPopupBindings.value);

    editorMode.value = 'editing';
    selectedWidgetId.value = '';
    clearDragHint();
    closeAllOverlays();

    grid.setStatic(false);
    grid.enableMove(true);
    grid.enableResize(true);
  }

  function startPickingPoint() {
    if (editorMode.value !== 'editing') return;
    clearDragHint();
    closeAllOverlays();
    selectedWidgetId.value = '';
    pendingPointLocation.value = null;
    editorMode.value = 'pickingPoint';
  }

  function togglePickingPoint() {
    if (editorMode.value === 'pickingPoint') {
      cancelPickingPoint();
      return;
    }

    startPickingPoint();
  }

  function cancelPickingPoint() {
    pendingPointLocation.value = null;
    if (editorMode.value !== 'view') {
      editorMode.value = 'editing';
    }
  }

  function onMapPicked(location: Required<MapPointLocation>) {
    if (editorMode.value !== 'pickingPoint') return;
    pendingPointLocation.value = location;
    editorMode.value = 'selectingPointType';
  }

  function cancelPointTypeSelection() {
    pendingPointLocation.value = null;
    editorMode.value = 'editing';
  }

  function choosePointType(type: MapPointType) {
    if (!pendingPointLocation.value) {
      editorMode.value = 'editing';
      return;
    }

    if (type === 'sensor') {
      editorMode.value = 'configuringSensorPoint';
      sensorPointDialogVisible.value = true;
      return;
    }

    editorMode.value = 'configuringCameraPoint';
    cameraPointDialogVisible.value = true;
  }

  function cancelPointConfig() {
    sensorPointDialogVisible.value = false;
    cameraPointDialogVisible.value = false;
    pendingPointLocation.value = null;
    editorMode.value = 'editing';
  }

  function createPointBase(type: MapPointType, deviceId: string, deviceName: string) {
    const now = Date.now();
    const location = pendingPointLocation.value;
    if (!location) {
      throw new Error('Point location is missing.');
    }

    return {
      id: `${type}_${now}`,
      type,
      name: deviceName,
      longitude: location.longitude,
      latitude: location.latitude,
      height: location.height,
      entityType: 'DEVICE' as const,
      entityId: deviceId,
      entityName: deviceName,
      createdAt: now,
      updatedAt: now,
    };
  }

  function onSensorPointConfigured(payload: { deviceId: string; deviceName: string; keys: string[]; pollMs: number }) {
    const point: SensorMapPoint = {
      ...createPointBase('sensor', payload.deviceId, payload.deviceName),
      type: 'sensor',
      online: false,
      statusText: '离线',
      color: 'gray',
      datasource: {
        entityType: 'DEVICE',
        entityId: payload.deviceId,
        entityName: payload.deviceName,
        keys: (payload.keys || []).map((name) => ({
          name,
          type: 'timeseries',
        })),
        pollMs: payload.pollMs,
      },
    };

    const nextDraftPoints = cloneJson(draftMapPoints.value);
    upsertDraftPoint(nextDraftPoints, point);
    draftMapPoints.value = nextDraftPoints;
    draftSensorPopupBindings.value = {
      ...draftSensorPopupBindings.value,
      [point.id]: draftSensorPopupBindings.value[point.id] || [],
    };

    sensorPointDialogVisible.value = false;
    pendingPointLocation.value = null;
    editorMode.value = 'editing';
  }

  function onCameraPointConfigured(payload: { deviceId: string; deviceName: string }) {
    const point: CameraMapPoint = {
      ...createPointBase('camera', payload.deviceId, payload.deviceName),
      type: 'camera',
      entityType: 'DEVICE',
      online: false,
      statusText: '离线',
      color: 'gray',
    };

    const nextDraftPoints = cloneJson(draftMapPoints.value);
    upsertDraftPoint(nextDraftPoints, point);
    draftMapPoints.value = nextDraftPoints;

    cameraPointDialogVisible.value = false;
    pendingPointLocation.value = null;
    editorMode.value = 'editing';
  }

  function openAddPanel() {
    if (editorMode.value !== 'editing') return;
    addPanelVisible.value = !addPanelVisible.value;
  }

  function restoreWidgetSnapshot() {
    if (!widgetSnapshot) return;
    layout.value = cloneJson(widgetSnapshot.layout);
    widgets.value = cloneJson(widgetSnapshot.widgets);
    renderGrid();
  }

  function leaveEditMode() {
    if (!grid) return;

    clearDragHint();
    editorMode.value = 'view';
    addPanelVisible.value = false;
    pendingPointLocation.value = null;
    selectedWidgetId.value = '';
    closeAllOverlays();

    sensorPointDialogVisible.value = false;
    cameraPointDialogVisible.value = false;

    grid.setStatic(true);
    grid.enableMove(false);
    grid.enableResize(false);
  }

  function cancelEdit() {
    if (!grid) return;

    restoreWidgetSnapshot();
    draftMapPoints.value = cloneJson(originalMapPoints.value);
    draftSensorPopupBindings.value = cloneJson(originalSensorPopupBindings.value);
    leaveEditMode();
  }

  async function saveEdit() {
    if (!grid || !canSaveEdit.value) return;
    if (!canEditTemplate.value) return;

    syncLayoutFromGrid();
    const state = getEditorState();
    await persistEditorState(state);

    originalMapPoints.value = cloneJson(state.mapPoints);
    originalSensorPopupBindings.value = cloneJson(state.sensorPopupBindings);
    widgetSnapshot = {
      layout: cloneJson(state.layout),
      widgets: cloneJson(state.widgets),
    };

    leaveEditMode();
  }

  async function handleControlSwitchSettingsSave() {
    if (!currentWidget.value) return;
    const key = currentWidget.value.widgetKey as LocalWidgetKey;
    const id = currentWidget.value.id;
    void mountWidget(id, key);
    await persistEditorState();
    selectedWidgetId.value = '';
    addPanelVisible.value = false;
  }

  function updateControlSwitchSettings(value: any) {
    if (!currentWidget.value) return;
    currentWidget.value.config.settings = value;
  }

  function getSensorPopupWidgetsForView(sensorId: string): PopupWidgetConfig[] {
    if (editorMode.value === 'view') {
      return getSensorPopupWidgets(sensorId);
    }
    return draftSensorPopupBindings.value[sensorId] || [];
  }

  function getSensorPopupWidgetsForEditor(sensorId: string): PopupWidgetConfig[] {
    return draftSensorPopupBindings.value[sensorId] || [];
  }

  function handleSensorPopupSaved(widgetsForSensor: PopupWidgetConfig[]) {
    if (!selectedSensor.value) return;

    draftSensorPopupBindings.value = {
      ...draftSensorPopupBindings.value,
      [selectedSensor.value.id]: cloneJson(widgetsForSensor),
    };

    sensorConfigVisible.value = false;
  }

  function onSensorClick(sensor: SensorMapPoint) {
    selectedSensor.value = sensor;
    closeCameraPopup();

    if (editorMode.value !== 'view') {
      sensorPreviewVisible.value = false;
      sensorConfigVisible.value = true;
      return;
    }

    sensorConfigVisible.value = false;
    sensorPreviewVisible.value = true;
  }

  async function onCameraClick(camera: CameraMapPoint) {
    selectedSensor.value = null;
    sensorPreviewVisible.value = false;
    sensorConfigVisible.value = false;

    selectedCameraPoint.value = camera;
    selectedCameraRuntime.value = {
      entityId: camera.entityId,
      entityName: camera.entityName || camera.name,
      cameraName: camera.name,
    };
    cameraRuntimeLoading.value = true;
    cameraRuntimeError.value = '';
    cameraPopupVisible.value = true;

    const requestId = ++cameraRuntimeRequestId;

    try {
      const runtime = await loadCameraRuntimeInfo(camera.entityId, camera.entityName || camera.name);
      if (requestId !== cameraRuntimeRequestId) return;

      selectedCameraRuntime.value = {
        ...runtime,
        entityId: camera.entityId,
        entityName: runtime.entityName || camera.entityName || camera.name,
        cameraName: runtime.cameraName || camera.name,
      };
    } catch (error: any) {
      if (requestId !== cameraRuntimeRequestId) return;
      console.error('[MapWidgetEditor] Failed to load camera runtime info:', {
        pointId: camera.id,
        entityId: camera.entityId,
        entityName: camera.entityName,
        error,
      });
      cameraRuntimeError.value = '读取摄像头设备信息失败';
      selectedCameraRuntime.value = {
        entityId: camera.entityId,
        entityName: camera.entityName || camera.name,
        cameraName: camera.name,
      };
    } finally {
      if (requestId === cameraRuntimeRequestId) {
        cameraRuntimeLoading.value = false;
      }
    }
  }

  function closeCameraPopup() {
    cameraPopupVisible.value = false;
    cameraRuntimeLoading.value = false;
    cameraRuntimeError.value = '';
    selectedCameraPoint.value = null;
    selectedCameraRuntime.value = null;
    cameraRuntimeRequestId += 1;
  }

  function formatCoordinate(value?: number) {
    if (value === undefined || value === null || Number.isNaN(value)) return '-';
    return value.toFixed(6);
  }

  function formatHeight(value?: number) {
    if (value === undefined || value === null || Number.isNaN(value)) return '-';
    return Number(value).toFixed(2);
  }

  function onExit() {
    router.push(isDashboardTemplateMode.value ? '/dashboard/list' : '/desktop/dashboard');
  }

  watch(
    () => editorMode.value,
    async (mode) => {
      if (mode === 'pickingPoint') {
        await nextTick();
        pointEditor.start();
        return;
      }

      pointEditor.stop();
    },
    { immediate: true },
  );

  onMounted(async () => {
    await nextTick();
    if (!gridEl.value) return;

    patchGridstackRenderOnce();
    try {
      await loadEditorState();
    } catch (error: any) {
      errorMsg.value = error?.message || '加载大屏模板失败';
    }
    reloadLibrary();

    grid = GridStack.init(
      {
        column: 12,
        cellHeight: 30,
        margin: 10,
        float: true,
        draggable: {
          handle: '.mw-title',
          cancel: '.mw-body, .mw-mount, button, input, textarea, select, option, canvas, video, iframe',
        },
        disableResize: false,
        resizable: { handles: 'all' },
        disableDrag: false,
      },
      gridEl.value,
    );

    gridEl.value.addEventListener('click', onGridClick, true);
    grid.on('change', () => {
      if (!grid || editorMode.value === 'view') return;
      syncLayoutFromGrid();
    });

    datasourceRuntime.connect();
    renderGrid();
    grid.setStatic(true);
    grid.enableMove(false);
    grid.enableResize(false);
  });

  onBeforeUnmount(() => {
    clearDragHint();
    pointEditor.destroy();
    gridEl.value?.removeEventListener('click', onGridClick, true);
    grid?.destroy(false);
    grid = null;
    unmountAllWidgets();
    datasourceRuntime.close();
  });
</script>

<style scoped>
  .mw-editor {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .mw-cesium {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .mw-topbar {
    position: absolute;
    top: 12px;
    left: 12px;
    right: 12px;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    pointer-events: none;
  }

  .mw-topbar-left,
  .mw-topbar-right {
    display: flex;
    gap: 10px;
    pointer-events: auto;
  }

  .mw-btn {
    border: 1px solid rgba(255, 255, 255, 0.55);
    background: rgba(25, 30, 40, 0.72);
    color: #fff;
    padding: 8px 12px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    backdrop-filter: blur(6px);
  }

  .mw-btn.primary {
    background: rgba(22, 100, 145, 0.88);
  }

  .mw-btn.active {
    border-color: rgba(125, 211, 252, 0.9);
    background: rgba(14, 165, 233, 0.92);
    box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.22);
  }

  .mw-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .mw-mode-banner {
    position: absolute;
    top: 58px;
    left: 12px;
    z-index: 25;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.88);
    border: 1px solid rgba(148, 163, 184, 0.18);
    color: #fff;
    backdrop-filter: blur(8px);
  }

  .mw-mode-banner__text {
    font-size: 13px;
    font-weight: 600;
  }

  .mw-dialog-mask {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
  }

  .mw-dialog-card {
    width: min(420px, calc(100vw - 32px));
    padding: 18px;
    border-radius: 16px;
    background: rgba(18, 22, 30, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #fff;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.35);
  }

  .mw-dialog-title {
    font-size: 16px;
    font-weight: 700;
  }

  .mw-dialog-sub {
    margin-top: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.72);
  }

  .mw-dialog-actions {
    display: flex;
    gap: 10px;
    margin-top: 16px;
  }

  .mw-add-panel {
    position: absolute;
    top: 58px;
    left: 12px;
    z-index: 30;
    width: 280px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(25, 30, 40, 0.94);
    color: #fff;
    padding: 12px;
    backdrop-filter: blur(10px);
  }

  .mw-add-title,
  .mw-lib-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .mw-add-list {
    display: grid;
    gap: 8px;
  }

  .mw-add-item,
  .mw-lib-del {
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    border-radius: 10px;
    padding: 9px 10px;
    cursor: pointer;
    text-align: left;
  }

  .mw-lib-item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }

  .mw-lib-kind,
  .mw-empty-hint {
    opacity: 0.72;
    font-size: 12px;
  }

  .mw-add-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }

  .mw-grid {
    position: absolute;
    inset: 0;
    z-index: 10;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }

  .mw-grid--hidden {
    opacity: 0;
    pointer-events: none;
  }

  .mw-control-editor {
    position: absolute;
    top: 58px;
    right: 12px;
    z-index: 30;
    width: min(420px, calc(100vw - 24px));
  }

  .mw-error {
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 35;
    max-width: min(480px, calc(100vw - 24px));
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(127, 29, 29, 0.92);
    color: #fff;
    font-size: 12px;
  }

  .mw-toast {
    position: absolute;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    z-index: 34;
    max-width: min(620px, calc(100vw - 32px));
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.88);
    border: 1px solid rgba(125, 211, 252, 0.28);
    color: #e0f2fe;
    font-size: 12px;
    line-height: 1.4;
    box-shadow: 0 10px 30px rgba(2, 6, 23, 0.28);
    backdrop-filter: blur(8px);
    pointer-events: none;
  }

  :deep(.grid-stack-item) {
    pointer-events: auto;
  }

  :deep(.grid-stack-item-content) {
    pointer-events: auto;
    overflow: hidden;
  }

  :deep(.ui-resizable-handle) {
    pointer-events: auto;
  }

  :deep(.mw-widget) {
    height: 100%;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(18, 22, 30, 0.75);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    backdrop-filter: blur(8px);
    position: relative;
  }

  :deep(.mw-del) {
    position: absolute;
    right: 8px;
    top: 6px;
    z-index: 2;
    border: none;
    background: rgba(127, 29, 29, 0.88);
    color: #fff;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    cursor: pointer;
    display: none;
  }

  .mw-grid--editing :deep(.mw-del) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  :deep(.mw-title) {
    height: 34px;
    line-height: 34px;
    padding: 0 36px 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    user-select: none;
    cursor: move;
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
