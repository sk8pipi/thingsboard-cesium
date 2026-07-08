<template>
  <div class="mw-editor" :style="templateAppearanceCssVars">
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
      :device-bindings="pointDeviceBindings"
      title="配置传感器点位"
      ok-text="保存点位"
      detail-hint="新建点位只绑定 ThingsBoard Device，不需要选择 key。保存点位后可点击点位继续配置弹窗数据 key。"
      @cancel="cancelPointConfig"
      @ok="onSensorPointConfigured"
    />

    <SelectDeviceDialog
      :visible="cameraPointDialogVisible"
      :require-keys="false"
      :device-bindings="pointDeviceBindings"
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
          <button
            class="mw-btn"
            :class="{ active: appearancePanelVisible }"
            type="button"
            :disabled="editorMode !== 'editing'"
            @click="toggleAppearancePanel"
          >
            外观
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

    <div v-if="editorMode === 'editing' && appearancePanelVisible" class="mw-appearance-panel">
      <div class="mw-appearance-panel__header">
        <strong>部件玻璃外观</strong>
        <span>普通部件与点位详情同步</span>
      </div>

      <label class="mw-appearance-control">
        <span>透明度</span>
        <input v-model.number="templateBackgroundTransparency" type="range" min="0" max="100" step="1" />
        <output>{{ templateBackgroundTransparency }}%</output>
      </label>

      <label class="mw-appearance-control">
        <span>模糊度</span>
        <input v-model.number="templateAppearance.blurPx" type="range" min="0" max="40" step="1" />
        <output>{{ templateAppearance.blurPx || 0 }}px</output>
      </label>
    </div>

    <div v-if="aggregateConfigVisible" class="mw-dialog-mask" @click.self="cancelAggregateWidgetConfig">
      <div class="mw-dialog-card mw-aggregate-dialog">
        <div class="mw-dialog-title">配置{{ pendingWidgetTitle }}</div>
        <div class="mw-dialog-sub">该 Key 将在模板全部设备中进行聚合，未包含此 Key 的设备会自动忽略。</div>

        <label class="mw-aggregate-field">
          <span>搜索模板 Key</span>
          <input v-model.trim="aggregateKeySearch" type="search" placeholder="输入 Key 名称筛选" />
        </label>

        <div v-if="aggregateKeysLoading" class="mw-aggregate-key-state">正在读取模板全部设备的 timeseries keys...</div>
        <div v-else-if="aggregateKeysError && !aggregateAvailableKeys.length" class="mw-aggregate-key-state is-error">
          {{ aggregateKeysError }}
        </div>
        <div v-else class="mw-aggregate-key-picker">
          <div class="mw-aggregate-key-picker__title">
            <span>模板已有 Keys（{{ aggregateAvailableKeys.length }}）</span>
            <span>已选：{{ aggregateKey || '未选择' }}</span>
          </div>
          <div v-if="filteredAggregateKeys.length" class="mw-aggregate-key-list">
            <button
              v-for="key in filteredAggregateKeys"
              :key="key"
              class="mw-aggregate-key-chip"
              :class="{ active: aggregateKey === key }"
              type="button"
              :aria-pressed="aggregateKey === key"
              @click="aggregateKey = key"
            >
              {{ key }}
            </button>
          </div>
          <div v-else class="mw-aggregate-key-state">没有匹配的 Key</div>
          <div v-if="aggregateKeysError" class="mw-aggregate-key-warning">{{ aggregateKeysError }}</div>
        </div>

        <label v-if="pendingWidgetKey === 'templateKeyTrend'" class="mw-aggregate-field">
          <span>趋势时间范围</span>
          <select v-model.number="aggregateTimeWindowMs">
            <option :value="900000">最近 15 分钟</option>
            <option :value="3600000">最近 1 小时</option>
            <option :value="21600000">最近 6 小时</option>
            <option :value="86400000">最近 24 小时</option>
          </select>
        </label>

        <div class="mw-dialog-actions">
          <button class="mw-btn" type="button" @click="cancelAggregateWidgetConfig">取消</button>
          <button class="mw-btn primary" type="button" :disabled="!aggregateKey" @click="confirmAggregateWidgetConfig">
            添加部件
          </button>
        </div>
      </div>
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
      :runtime="datasourceRuntime"
      :visible="sensorConfigVisible"
      :sensor="selectedSensor"
      :widgets="selectedSensor ? getSensorPopupWidgetsForEditor(selectedSensor.id) : []"
      @changed="handleSensorPopupChanged"
      @close="sensorConfigVisible = false"
      @saved="handleSensorPopupSaved"
    />

    <SensorWidgetPopup
      :runtime="datasourceRuntime"
      :visible="sensorPreviewVisible"
      :sensor="selectedSensor"
      :widgets="selectedSensor ? getSensorPopupWidgetsForView(selectedSensor.id) : []"
      :runtime-devices="templateRuntimeDevices"
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

        <button class="mw-widget-card mw-widget-card--import" type="button" @click="fileInputEl?.click()">
          <div class="mw-widget-preview mw-widget-preview--import">
            <span>JSON</span>
          </div>
          <div class="mw-widget-info">
            <div class="mw-widget-name">导入 ThingsBoard 部件 JSON</div>
            <div class="mw-widget-desc">从导出的 JSON 生成可复用部件</div>
          </div>
        </button>

        <div class="mw-lib-title">内置部件</div>

        <div class="mw-widget-grid">
          <button
            v-for="def in builtInWidgetDefs"
            :key="def.key"
            class="mw-widget-card"
            type="button"
            @click="addWidgetByKey(def.key)"
          >
            <div class="mw-widget-preview">
              <img class="mw-widget-preview-img" :src="getBuiltInPreview(def.key)" :alt="def.title" loading="lazy" />
            </div>
            <div class="mw-widget-info">
              <div class="mw-widget-name" :title="def.title">{{ def.title }}</div>
              <div class="mw-widget-meta">{{ getBuiltInKindLabel(def.key) }}</div>
            </div>
          </button>
        </div>

        <div v-if="libraryDefs.length" class="mw-lib-title">已导入部件</div>

        <div v-if="libraryDefs.length" class="mw-widget-grid">
          <div v-for="def in libraryDefs" :key="def.id" class="mw-widget-card-wrap">
            <button class="mw-widget-card" type="button" @click="addFromLibrary(def)">
              <div class="mw-widget-preview">
                <img
                  v-if="getLibraryPreview(def)"
                  class="mw-widget-preview-img"
                  :src="getLibraryPreview(def)"
                  :alt="def.name"
                  loading="lazy"
                />
                <div v-else class="mw-widget-preview-placeholder">{{ getLibraryKindLabel(def.kind) }}</div>
              </div>
              <div class="mw-widget-info">
                <div class="mw-widget-name" :title="def.name">{{ def.name }}</div>
                <div class="mw-widget-meta">{{ getLibraryKindLabel(def.kind) }}</div>
              </div>
            </button>
            <button class="mw-lib-del" type="button" title="删除" @click="deleteFromLibrary(def.id)">删除</button>
          </div>
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
  import { getTimeseriesKeys } from '/@/api/tb/telemetry';
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
  import {
    applyDeviceInfoMapPointLocations,
    loadDeviceMapPointLocation,
    saveDeviceMapPointLocations,
  } from './services/deviceMapPointService';
  import { getAssignedMapTemplateRuntime, type MapTemplateRuntimeDevices } from './services/mapTemplateRuntimeService';
  import type {
    CameraMapPoint,
    CameraRuntimeInfo,
    DevicePointBindingInfo,
    MapEditorMode,
    MapPoint,
    MapPointLocation,
    MapPointType,
    SensorMapPoint,
  } from './types/mapPointTypes';
  import { widgetRegistry } from '../dashboard/runtime/widgets/registry/widgetRegistry';
  import {
    buildWidgetConfig,
    createWidgetInstance,
    listWidgetDefinitions,
    normalizeWidgetRecord,
    resolveWidgetDefinitionKey,
    widgetAppearanceStyleText,
  } from '../dashboard/runtime/widgets/core/widgetInstance';
  import '../dashboard/runtime/widgets/core/widgetSurface.css';
  import type {
    DashboardWidget,
    GridItem,
    LocalWidgetKey,
    TbWidgetConfig,
    WidgetAppearance,
  } from '../dashboard/runtime/types';
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
    mapTemplateAppearanceStyle,
    normalizeMapTemplateState,
    type MapTemplateAppearance,
    type MapTemplateScene,
    type MapTemplateState,
  } from './mapTemplateConfig';
  import {
    collectMapTemplateDeviceRefs,
    formatTemplateDeviceNames,
    inspectMapTemplateDeviceAccess,
  } from './mapTemplateDeviceAccess';

  type WidgetData = DashboardWidget & {
    type: LocalWidgetKey;
    config: TbWidgetConfig;
  };

  type WidgetSnapshot = {
    layout: GridItem[];
    widgets: Record<string, WidgetData>;
    appearance: WidgetAppearance;
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
  const aggregateConfigVisible = ref(false);
  const aggregateKey = ref('');
  const aggregateKeySearch = ref('');
  const aggregateAvailableKeys = ref<string[]>([]);
  const aggregateKeysLoading = ref(false);
  const aggregateKeysError = ref('');
  const aggregateTimeWindowMs = ref(3600000);
  let aggregateKeysRequestId = 0;
  const filteredAggregateKeys = computed(() => {
    const search = aggregateKeySearch.value.trim().toLowerCase();
    if (!search) return aggregateAvailableKeys.value;
    return aggregateAvailableKeys.value.filter((key) => key.toLowerCase().includes(search));
  });
  const cesiumMapRef = ref<CesiumMapExpose | null>(null);

  const gridEl = ref<HTMLDivElement | null>(null);
  const fileInputEl = ref<HTMLInputElement | null>(null);
  let grid: any = null;

  const editorMode = ref<MapEditorMode>('view');
  const addPanelVisible = ref(false);
  const errorMsg = ref('');
  const isSavingEdit = ref(false);
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
  const templateAppearance = ref<MapTemplateAppearance>({ ...createDefaultMapTemplateState().appearance });
  const appearancePanelVisible = ref(false);
  const templateAppearanceCssVars = computed(() => mapTemplateAppearanceStyle(templateAppearance.value));
  const templateBackgroundTransparency = computed({
    get: () => Math.round((1 - Number(templateAppearance.value.backgroundOpacity ?? 0.04)) * 100),
    set: (value: number) => {
      const transparency = Math.min(100, Math.max(0, Number(value) || 0));
      templateAppearance.value.backgroundOpacity = 1 - transparency / 100;
    },
  });

  const originalMapPoints = ref<MapPoint[]>(loadMapPoints());
  const draftMapPoints = ref<MapPoint[]>(cloneJson(originalMapPoints.value));
  const originalSensorPopupBindings = ref<SensorPopupBinding>(loadSensorPopupBindings());
  const draftSensorPopupBindings = ref<SensorPopupBinding>(cloneJson(originalSensorPopupBindings.value));

  const mountedApps = new Map<string, ReturnType<typeof createApp>>();
  const templateRuntimeDevices = ref<MapTemplateRuntimeDevices>({});
  const datasourceRuntime = createDatasourceRuntime({
    getExternalValues: (_entityType, entityId) => templateRuntimeDevices.value[entityId],
    getEntityName: (_entityType, entityId) =>
      String(
        templateRuntimeDevices.value[entityId]?.entityName ||
          draftMapPoints.value.find((point) => point.entityId === entityId)?.entityName ||
          '',
      ) || undefined,
  });
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

  const builtInWidgetDefs = computed(() =>
    listWidgetDefinitions('dashboard').filter((item) => item.key !== 'cesium3d'),
  );
  const currentWidget = computed(() => {
    if (!selectedWidgetId.value) return null;
    return widgets.value[selectedWidgetId.value] || null;
  });
  const controlSwitchSettingsModel = computed(() => currentWidget.value?.config?.settings as any);
  const activeMapPoints = computed(() =>
    editorMode.value === 'view' ? originalMapPoints.value : draftMapPoints.value,
  );
  const pointDeviceBindings = computed<DevicePointBindingInfo[]>(() =>
    draftMapPoints.value
      .map(toDevicePointBinding)
      .filter((binding): binding is DevicePointBindingInfo => Boolean(binding)),
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

  const widgetPreviewByKey: Partial<Record<LocalWidgetKey, string>> = {
    timeseriesLine: createWidgetPreviewSvg('折线图', 'line', '#2563eb', '#22c55e'),
    timeseriesScatter: createWidgetPreviewSvg('散点图', 'scatter', '#2563eb', '#f59e0b'),
    timeseriesBarWithLabels: createWidgetPreviewSvg('柱状图', 'bar', '#0f766e', '#38bdf8'),
    rangeChart: createWidgetPreviewSvg('范围图', 'area', '#7c3aed', '#f59e0b'),
    stateChart: createWidgetPreviewSvg('状态图', 'step', '#0891b2', '#84cc16'),
    latestPie: createWidgetPreviewSvg('饼图', 'pie', '#7c3aed', '#f97316'),
    latestBar: createWidgetPreviewSvg('柱状图', 'bar', '#2563eb', '#f59e0b'),
    latestRadar: createWidgetPreviewSvg('雷达图', 'radar', '#0f766e', '#22c55e'),
    latestPolarArea: createWidgetPreviewSvg('极区图', 'pie', '#be185d', '#38bdf8'),
    ledIndicator: createWidgetPreviewSvg('LED', 'led', '#16a34a', '#facc15'),
    staticHtml: createWidgetPreviewSvg('HTML', 'static', '#475569', '#38bdf8'),
    alarmTable: createWidgetPreviewSvg('告警表格', 'table', '#dc2626', '#f97316'),
    alarmCard: createWidgetPreviewSvg('告警卡片', 'card', '#dc2626', '#f59e0b'),
    controlSwitch: createWidgetPreviewSvg('开关控制', 'switch', '#0284c7', '#22c55e'),
    templateDeviceOverview: createWidgetPreviewSvg('设备概览', 'card', '#0284c7', '#22c55e'),
    templateAlarmOverview: createWidgetPreviewSvg('报警概览', 'card', '#dc2626', '#f59e0b'),
    templateKeyAggregate: createWidgetPreviewSvg('Key 聚合', 'card', '#0e7490', '#38bdf8'),
    templateKeyTrend: createWidgetPreviewSvg('Key 趋势', 'line', '#2563eb', '#22c55e'),
    templateStatusDistribution: createWidgetPreviewSvg('状态分布', 'pie', '#16a34a', '#ef4444'),
  };

  function getBuiltInPreview(key: LocalWidgetKey) {
    return widgetPreviewByKey[key] || createWidgetPreviewSvg('部件', 'card', '#2563eb', '#22c55e');
  }

  function getBuiltInKindLabel(key: LocalWidgetKey) {
    const def = widgetRegistry[key];
    if (!def) return '部件';

    const map: Record<string, string> = {
      timeseries: '时序部件',
      latest: '最新值部件',
      alarm: '告警部件',
      aggregate: '宏观部件',
      control: '控制部件',
      static: '静态部件',
    };
    return map[def.category] || '部件';
  }

  function getLibraryKindLabel(kind?: string) {
    const map: Record<string, string> = {
      chart: '折线图',
      pie: '饼图',
      bar: '柱状图',
      static: '静态部件',
      cesium3d: '三维地图',
      unknown: '导入部件',
    };
    return map[String(kind || 'unknown')] || String(kind || '导入部件');
  }

  function getLibraryPreview(def: CustomWidgetDefinition) {
    const rawImage =
      def.raw?.image ||
      def.raw?.previewImage ||
      def.raw?.widget?.image ||
      def.raw?.widgetType?.image ||
      def.raw?.descriptor?.image ||
      def.tb?.raw?.image;

    return resolveWidgetPreviewImage(rawImage) || createWidgetPreviewSvg(def.name, def.kind, '#2563eb', '#22c55e');
  }

  function resolveWidgetPreviewImage(image?: string) {
    if (!image || typeof image !== 'string') return '';
    const value = image.trim();
    if (!value || value.startsWith('tb-image;')) return '';
    if (value.startsWith('data:')) return value;
    if (/^(https?:|blob:|\/)/.test(value)) return value;
    if (value.startsWith('<svg')) {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
    }
    return `data:image/png;base64,${value}`;
  }

  function createWidgetPreviewSvg(label: string, kind: string, primary: string, accent: string) {
    const safeLabel = escapeSvgText(label || '部件');
    const normalizedKind = String(kind || '').toLowerCase();
    const chartShape = getPreviewShape(normalizedKind, primary, accent);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
        <rect width="320" height="180" rx="16" fill="#f8fafc"/>
        <rect x="18" y="18" width="284" height="144" rx="14" fill="#ffffff" stroke="#dbe3ef"/>
        <text x="160" y="45" fill="#172033" font-family="Arial, sans-serif" font-size="18" font-weight="700" text-anchor="middle">${safeLabel}</text>
        ${chartShape}
      </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function getPreviewShape(kind: string, primary: string, accent: string) {
    if (kind.includes('pie')) {
      return `
        <circle cx="160" cy="104" r="42" fill="${primary}" opacity=".9"/>
        <path d="M160 104 L160 62 A42 42 0 0 1 199 120 Z" fill="${accent}"/>
        <circle cx="160" cy="104" r="18" fill="#fff" opacity=".95"/>
      `;
    }

    if (kind.includes('bar')) {
      return `
        <rect x="92" y="106" width="24" height="34" rx="5" fill="${accent}"/>
        <rect x="128" y="82" width="24" height="58" rx="5" fill="${primary}"/>
        <rect x="164" y="96" width="24" height="44" rx="5" fill="${accent}" opacity=".78"/>
        <rect x="200" y="70" width="24" height="70" rx="5" fill="${primary}" opacity=".78"/>
      `;
    }

    if (kind.includes('scatter')) {
      return `
        <circle cx="96" cy="124" r="8" fill="${accent}"/>
        <circle cx="126" cy="96" r="7" fill="${primary}"/>
        <circle cx="164" cy="116" r="9" fill="${accent}" opacity=".8"/>
        <circle cx="204" cy="78" r="8" fill="${primary}" opacity=".85"/>
        <circle cx="232" cy="108" r="7" fill="${accent}"/>
      `;
    }

    if (kind.includes('switch')) {
      return `
        <rect x="94" y="82" width="132" height="54" rx="27" fill="${primary}" opacity=".9"/>
        <circle cx="198" cy="109" r="22" fill="#fff"/>
        <path d="M117 109 h48" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>
      `;
    }

    if (kind.includes('led')) {
      return `
        <circle cx="160" cy="104" r="38" fill="${accent}" opacity=".95"/>
        <circle cx="148" cy="90" r="11" fill="#fff" opacity=".75"/>
        <path d="M118 146 h84" stroke="${primary}" stroke-width="8" stroke-linecap="round"/>
      `;
    }

    if (kind.includes('table')) {
      return `
        <rect x="78" y="70" width="164" height="74" rx="8" fill="#f8fafc" stroke="${primary}" stroke-width="3"/>
        <path d="M78 94 H242 M78 118 H242 M120 70 V144 M184 70 V144" stroke="${accent}" stroke-width="3" opacity=".85"/>
      `;
    }

    if (kind.includes('static') || kind.includes('card')) {
      return `
        <rect x="86" y="70" width="148" height="74" rx="10" fill="#f8fafc" stroke="${primary}" stroke-width="3"/>
        <path d="M108 94 H212 M108 116 H184" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>
      `;
    }

    return `
      <path d="M70 128 C106 86 132 122 160 92 S218 68 250 108" fill="none" stroke="${primary}" stroke-width="10" stroke-linecap="round"/>
      <path d="M70 140 H250" stroke="#dbe3ef" stroke-width="4" stroke-linecap="round"/>
      <circle cx="160" cy="92" r="8" fill="${accent}"/>
    `;
  }

  function escapeSvgText(text: string) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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
    return normalizeWidgetRecord(rawWidgets) as Record<string, WidgetData>;
  }

  function applyEditorState(state?: Partial<MapWidgetEditorState> | null) {
    const normalized = normalizeMapTemplateState(state);
    templateScene.value = cloneJson(normalized.scene);
    templateAppearance.value = cloneJson(normalized.appearance);
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
      appearance: cloneJson(templateAppearance.value),
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
    originalMapPoints.value = await applyDeviceInfoMapPointLocations(originalMapPoints.value);
    draftMapPoints.value = cloneJson(originalMapPoints.value);
  }

  function applyTemplateRuntimeDevices(devices?: MapTemplateRuntimeDevices | null) {
    templateRuntimeDevices.value = devices || {};
    datasourceRuntime.refreshExternalValues();
    if (isDashboardTemplateMode.value && editorMode.value === 'view') {
      draftMapPoints.value = cloneJson(originalMapPoints.value);
    }
  }

  async function refreshTemplateRuntime() {
    if (!isDashboardTemplateMode.value || !dashboardId.value) {
      applyTemplateRuntimeDevices({});
      return;
    }

    try {
      const runtime = await getAssignedMapTemplateRuntime(dashboardId.value);
      applyTemplateRuntimeDevices(runtime.devices);
    } catch (error) {
      applyTemplateRuntimeDevices({});
      console.warn('[MapWidgetEditor] Failed to load template runtime data:', error);
    }
  }

  async function persistEditorState(state = getEditorState()) {
    if (isDashboardTemplateMode.value) {
      const deviceAccess = await inspectMapTemplateDeviceAccess(state);
      const inaccessibleDevices = deviceAccess.filter((item) => !item.device);
      if (inaccessibleDevices.length) {
        throw new Error('模板包含不属于当前租户或已失效的设备：' + formatTemplateDeviceNames(inaccessibleDevices));
      }

      const latest = await getDashboardById(dashboardId.value);
      latest.configuration = latest.configuration || {};
      latest.configuration[DASHBOARD_MAP_WIDGET_CONFIG_KEY] = state;
      await saveDashboard(latest);
      dashboardTemplate.value = latest;
      await refreshTemplateRuntime();
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
    Array.from(mountedApps.keys()).forEach(unmountWidget);
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
          context: {
            host: 'editor',
            readonly: editorMode.value === 'view',
            runtimeDevices: templateRuntimeDevices.value,
          },
        }),
    });

    app.mount(mountEl);
    mountedApps.set(id, app);
  }

  function widgetHtml(id: string, title: string) {
    const widget = widgets.value[id];
    const surfaceStyle = widgetAppearanceStyleText(widget?.widgetKey || widget?.type || '', widget?.appearance);
    return `
      <div class="mw-widget tb-widget-surface" data-widget-id="${id}" style="${surfaceStyle}">
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
    const instance = createWidgetInstance(key, { id, title, config });
    if (!instance) return;

    widgets.value[id] = { ...instance, type: key } as WidgetData;

    grid.addWidget({
      id,
      w: def.dashboardPlacement.width,
      h: def.dashboardPlacement.height,
      content: widgetHtml(id, title),
    } as any);

    void mountWidget(id, key);
    syncLayoutFromGrid();
    addPanelVisible.value = false;
  }

  async function loadAggregateAvailableKeys() {
    const requestId = ++aggregateKeysRequestId;
    const deviceRefs = collectMapTemplateDeviceRefs(getEditorState());
    aggregateAvailableKeys.value = [];
    aggregateKeysError.value = '';
    aggregateKeysLoading.value = false;

    if (!deviceRefs.length) {
      aggregateKeysError.value = '当前模板还没有绑定设备，无法读取可用 Key。';
      return;
    }

    aggregateKeysLoading.value = true;
    const results = await Promise.allSettled(
      deviceRefs.map((device) => getTimeseriesKeys({ entityType: 'DEVICE', id: device.deviceId } as any)),
    );
    if (requestId !== aggregateKeysRequestId) return;

    const keySet = new Set<string>();
    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      (Array.isArray(result.value) ? result.value : []).forEach((key) => {
        const normalized = String(key || '').trim();
        if (normalized) keySet.add(normalized);
      });
    });

    aggregateAvailableKeys.value = Array.from(keySet).sort((left, right) => left.localeCompare(right));
    const failedCount = results.filter((result) => result.status === 'rejected').length;
    if (failedCount === results.length) {
      aggregateKeysError.value = '模板设备的 Key 全部读取失败，请检查设备权限或稍后重试。';
    } else if (failedCount) {
      aggregateKeysError.value = `${failedCount} 台设备的 Key 读取失败，当前列表来自其余设备。`;
    } else if (!aggregateAvailableKeys.value.length) {
      aggregateKeysError.value = '模板设备暂时没有可用的 timeseries Key。';
    }

    if (!aggregateAvailableKeys.value.includes(aggregateKey.value)) {
      aggregateKey.value = aggregateAvailableKeys.value[0] || '';
    }
    aggregateKeysLoading.value = false;
  }

  function cancelAggregateWidgetConfig() {
    aggregateKeysRequestId += 1;
    aggregateKeysLoading.value = false;
    aggregateConfigVisible.value = false;
    pendingWidgetKey.value = '';
    pendingWidgetTitle.value = '';
  }

  function confirmAggregateWidgetConfig() {
    const key = pendingWidgetKey.value;
    const definition = key ? widgetRegistry[key] : null;
    const telemetryKey = aggregateKey.value.trim();
    if (!key || !definition || !telemetryKey) return;

    const config = cloneJson(definition.defaultConfig || {});
    config.settings = { ...(config.settings || {}), key: telemetryKey };
    if (key === 'templateKeyTrend') {
      config.timewindow = { ...(config.timewindow || {}), intervalMs: aggregateTimeWindowMs.value, realtime: true };
    }

    createWidgetAndAddToGrid(key, pendingWidgetTitle.value || definition.title, config);
    aggregateConfigVisible.value = false;
    pendingWidgetKey.value = '';
    pendingWidgetTitle.value = '';
  }

  function addWidgetByKey(key: LocalWidgetKey) {
    if (!grid || editorMode.value !== 'editing') return;

    const def = widgetRegistry[key];
    if (!def) {
      errorMsg.value = `未找到部件定义：${key}`;
      return;
    }

    const title = def.title;

    if (def.editor === 'aggregate') {
      pendingWidgetKey.value = key;
      pendingWidgetTitle.value = title;
      aggregateKey.value = '';
      aggregateKeySearch.value = '';
      aggregateTimeWindowMs.value = Number(def.defaultConfig?.timewindow?.intervalMs || 3600000);
      addPanelVisible.value = false;
      aggregateConfigVisible.value = true;
      void loadAggregateAvailableKeys();
      return;
    }

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
    return resolveWidgetDefinitionKey({
      localWidgetKey: def.localWidgetKey,
      typeFullFqn: def.typeFullFqn,
      kind: def.kind,
    });
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

    const config = buildWidgetConfig(def, title, imported, {
      deviceId: payload.deviceId,
      deviceName: payload.deviceName,
      keys: payload.keys,
      pollMs: payload.pollMs,
    });

    createWidgetAndAddToGrid(key, title, config);
    closeWidgetDeviceDialog();
  }

  function closeAllOverlays() {
    addPanelVisible.value = false;
    aggregateConfigVisible.value = false;
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

  function samePointLocation(a?: MapPoint | null, b?: MapPoint | null) {
    if (!a || !b) return false;
    return a.longitude === b.longitude && a.latitude === b.latitude && (a.height ?? 0) === (b.height ?? 0);
  }

  function getChangedDeviceLocationPoints(points: MapPoint[]) {
    const originalById = new Map(originalMapPoints.value.map((point) => [point.id, point]));
    const originalByEntityId = new Map(
      originalMapPoints.value
        .filter((point) => point.entityType === 'DEVICE' && point.entityId)
        .map((point) => [point.entityId, point]),
    );

    return points.filter((point) => {
      if (point.entityType !== 'DEVICE' || !point.entityId) return false;
      const original = originalById.get(point.id) || originalByEntityId.get(point.entityId);
      return !samePointLocation(original, point);
    });
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
      appearance: cloneJson(templateAppearance.value),
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

  function toDevicePointBinding(point: MapPoint): DevicePointBindingInfo | null {
    const deviceId = String(point.entityId || '').trim();
    if (!deviceId) return null;

    return {
      deviceId,
      deviceName: point.entityName || point.name,
      pointId: point.id,
      pointName: point.name,
      pointType: point.type,
    };
  }

  function pointTypeLabel(pointType: MapPointType) {
    return pointType === 'camera' ? '监控点位' : '传感器点位';
  }

  function findDraftDeviceBinding(deviceId: string) {
    const normalizedId = String(deviceId || '').trim();
    return pointDeviceBindings.value.find((binding) => binding.deviceId === normalizedId);
  }

  function ensureDeviceAvailableForNewPoint(deviceId: string) {
    const binding = findDraftDeviceBinding(deviceId);
    if (!binding) return true;

    errorMsg.value = `设备已绑定${pointTypeLabel(binding.pointType)}“${binding.pointName}”（${binding.pointId}），不能再次绑定新点位。`;
    return false;
  }

  function findDuplicateDeviceBindings(points: MapPoint[]) {
    const bindingsByDevice = new Map<string, DevicePointBindingInfo[]>();

    points.forEach((point) => {
      const binding = toDevicePointBinding(point);
      if (!binding) return;
      bindingsByDevice.set(binding.deviceId, [...(bindingsByDevice.get(binding.deviceId) || []), binding]);
    });

    return Array.from(bindingsByDevice.values()).filter((bindings) => bindings.length > 1);
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

  function createPointBase(
    type: MapPointType,
    deviceId: string,
    deviceName: string,
    deviceLocation?: Awaited<ReturnType<typeof loadDeviceMapPointLocation>>,
  ) {
    const now = Date.now();
    const location = pendingPointLocation.value;
    if (!location) {
      throw new Error('Point location is missing.');
    }

    return {
      id: `${type}_${now}`,
      type,
      name: deviceName,
      longitude: deviceLocation?.longitude ?? location.longitude,
      latitude: deviceLocation?.latitude ?? location.latitude,
      height: deviceLocation?.height ?? location.height,
      locationSource: (deviceLocation?.source || 'manual') as MapPoint['locationSource'],
      entityType: 'DEVICE' as const,
      entityId: deviceId,
      entityName: deviceName,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function onSensorPointConfigured(payload: {
    deviceId: string;
    deviceName: string;
    keys: string[];
    pollMs: number;
  }) {
    if (!ensureDeviceAvailableForNewPoint(payload.deviceId)) return;
    errorMsg.value = '';
    const deviceLocation = await loadDeviceMapPointLocation(payload.deviceId).catch(() => null);

    const point: SensorMapPoint = {
      ...createPointBase('sensor', payload.deviceId, payload.deviceName, deviceLocation),
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

  async function onCameraPointConfigured(payload: { deviceId: string; deviceName: string }) {
    if (!ensureDeviceAvailableForNewPoint(payload.deviceId)) return;
    errorMsg.value = '';
    const deviceLocation = await loadDeviceMapPointLocation(payload.deviceId).catch(() => null);

    const point: CameraMapPoint = {
      ...createPointBase('camera', payload.deviceId, payload.deviceName, deviceLocation),
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
    appearancePanelVisible.value = false;
    addPanelVisible.value = !addPanelVisible.value;
  }

  function toggleAppearancePanel() {
    if (editorMode.value !== 'editing') return;
    addPanelVisible.value = false;
    appearancePanelVisible.value = !appearancePanelVisible.value;
  }

  function restoreWidgetSnapshot() {
    if (!widgetSnapshot) return;
    layout.value = cloneJson(widgetSnapshot.layout);
    widgets.value = cloneJson(widgetSnapshot.widgets);
    templateAppearance.value = cloneJson(widgetSnapshot.appearance);
    renderGrid();
  }

  function leaveEditMode() {
    if (!grid) return;

    clearDragHint();
    editorMode.value = 'view';
    addPanelVisible.value = false;
    appearancePanelVisible.value = false;
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
    if (!grid || !canSaveEdit.value || isSavingEdit.value) return;
    if (!canEditTemplate.value) return;

    const duplicateBindings = findDuplicateDeviceBindings(draftMapPoints.value);
    if (duplicateBindings.length) {
      const duplicate = duplicateBindings[0];
      const pointNames = duplicate.map((binding) => `“${binding.pointName}”`).join('、');
      errorMsg.value = `同一模板中设备 ${duplicate[0].deviceName || duplicate[0].deviceId} 已绑定多个点位：${pointNames}。请删除重复点位后再保存。`;
      return;
    }

    errorMsg.value = '';
    syncLayoutFromGrid();
    const state = getEditorState();
    const changedDeviceLocationPoints = getChangedDeviceLocationPoints(state.mapPoints);
    isSavingEdit.value = true;
    try {
      if (changedDeviceLocationPoints.length) {
        await saveDeviceMapPointLocations(changedDeviceLocationPoints);
      }
      await persistEditorState(state);
    } catch (error: any) {
      errorMsg.value = error?.message || '点位保存失败，请检查设备位置信息后重试';
      return;
    } finally {
      isSavingEdit.value = false;
    }

    originalMapPoints.value = cloneJson(state.mapPoints);
    originalSensorPopupBindings.value = cloneJson(state.sensorPopupBindings);
    widgetSnapshot = {
      layout: cloneJson(state.layout),
      widgets: cloneJson(state.widgets),
      appearance: cloneJson(state.appearance),
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
    if (isDashboardTemplateMode.value) {
      return draftSensorPopupBindings.value[sensorId] || [];
    }

    if (editorMode.value === 'view') {
      return getSensorPopupWidgets(sensorId);
    }
    return draftSensorPopupBindings.value[sensorId] || [];
  }

  function getSensorPopupWidgetsForEditor(sensorId: string): PopupWidgetConfig[] {
    return draftSensorPopupBindings.value[sensorId] || [];
  }

  async function persistSensorPopupWidgets(widgetsForSensor: PopupWidgetConfig[]) {
    if (!selectedSensor.value) return;

    draftSensorPopupBindings.value = {
      ...draftSensorPopupBindings.value,
      [selectedSensor.value.id]: cloneJson(widgetsForSensor),
    };

    try {
      const state = getEditorState();
      await persistEditorState(state);
      originalSensorPopupBindings.value = cloneJson(state.sensorPopupBindings);
    } catch (error: any) {
      errorMsg.value = error?.message || String(error);
    }
  }

  async function handleSensorPopupChanged(widgetsForSensor: PopupWidgetConfig[]) {
    await persistSensorPopupWidgets(widgetsForSensor);
  }

  async function handleSensorPopupSaved(widgetsForSensor: PopupWidgetConfig[]) {
    await persistSensorPopupWidgets(widgetsForSensor);
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
      void refreshTemplateRuntime();
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

  .mw-appearance-panel {
    position: absolute;
    top: 58px;
    left: 12px;
    z-index: 28;
    width: min(380px, calc(100vw - 24px));
    box-sizing: border-box;
    display: grid;
    gap: 14px;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    background: rgba(8, 20, 34, 0.78);
    box-shadow: 0 16px 42px rgba(0, 7, 18, 0.28);
    color: #fff;
    backdrop-filter: blur(8px);
  }

  .mw-appearance-panel__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .mw-appearance-panel__header strong {
    font-size: 14px;
  }

  .mw-appearance-panel__header span {
    color: rgba(255, 255, 255, 0.66);
    font-size: 11px;
  }

  .mw-appearance-control {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr) 48px;
    align-items: center;
    gap: 10px;
    font-size: 12px;
  }

  .mw-appearance-control input {
    width: 100%;
    accent-color: #38bdf8;
    cursor: pointer;
  }

  .mw-appearance-control output {
    color: #bae6fd;
    font-variant-numeric: tabular-nums;
    text-align: right;
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

  .mw-aggregate-dialog {
    display: grid;
    gap: 14px;
  }

  .mw-aggregate-key-picker {
    display: grid;
    gap: 9px;
  }

  .mw-aggregate-key-picker__title {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: rgba(255, 255, 255, 0.68);
    font-size: 12px;
  }

  .mw-aggregate-key-list {
    display: flex;
    max-height: 190px;
    flex-wrap: wrap;
    gap: 8px;
    overflow-y: auto;
    padding: 2px;
  }

  .mw-aggregate-key-chip {
    border: 1px solid rgba(125, 211, 252, 0.26);
    border-radius: 999px;
    background: rgba(8, 47, 73, 0.42);
    color: rgba(224, 242, 254, 0.82);
    padding: 6px 10px;
    cursor: pointer;
    font-size: 12px;
  }

  .mw-aggregate-key-chip:hover,
  .mw-aggregate-key-chip.active {
    border-color: rgba(56, 189, 248, 0.9);
    background: rgba(14, 116, 144, 0.72);
    color: #fff;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.12);
  }

  .mw-aggregate-key-state,
  .mw-aggregate-key-warning {
    padding: 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(224, 242, 254, 0.68);
    font-size: 12px;
  }

  .mw-aggregate-key-state.is-error,
  .mw-aggregate-key-warning {
    border: 1px solid rgba(251, 146, 60, 0.24);
    color: #fdba74;
  }

  .mw-aggregate-field {
    display: grid;
    gap: 6px;
    color: rgba(255, 255, 255, 0.74);
    font-size: 12px;
  }

  .mw-aggregate-field input,
  .mw-aggregate-field select {
    width: 100%;
    height: 38px;
    box-sizing: border-box;
    border: 1px solid rgba(125, 211, 252, 0.28);
    border-radius: 8px;
    outline: none;
    background: rgba(8, 20, 34, 0.72);
    color: #e0f2fe;
    padding: 0 10px;
  }

  .mw-aggregate-field input:focus,
  .mw-aggregate-field select:focus {
    border-color: rgba(56, 189, 248, 0.8);
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.12);
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
    width: min(620px, calc(100vw - 24px));
    max-height: calc(100vh - 96px);
    overflow: hidden;
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
    margin: 4px 0 8px;
  }

  .mw-add-list {
    display: grid;
    max-height: calc(100vh - 170px);
    gap: 10px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .mw-widget-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .mw-widget-card-wrap {
    position: relative;
    min-width: 0;
  }

  .mw-widget-card {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.09);
    color: #fff;
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    text-align: left;
    transition:
      border-color 0.16s ease,
      background 0.16s ease,
      transform 0.16s ease;
  }
  .mw-widget-card:hover {
    transform: translateY(-1px);
    border-color: rgba(125, 211, 252, 0.75);
    background: rgba(255, 255, 255, 0.14);
  }
  .mw-widget-card--import {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 10px;
    align-items: center;
  }

  .mw-widget-preview {
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 7px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(15, 23, 42, 0.56);
  }
  .mw-widget-preview--import {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #bae6fd;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0;
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.24), rgba(34, 197, 94, 0.2));
  }
  .mw-widget-preview-img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }
  .mw-widget-preview-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: rgba(255, 255, 255, 0.76);
    font-size: 13px;
    font-weight: 700;
    background: linear-gradient(135deg, rgba(37, 99, 235, 0.28), rgba(20, 184, 166, 0.22));
  }

  .mw-widget-info {
    min-width: 0;
    padding-top: 8px;
  }
  .mw-widget-card--import .mw-widget-info {
    padding-top: 0;
  }
  .mw-widget-name {
    overflow: hidden;
    font-size: 13px;
    font-weight: 700;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mw-widget-meta,
  .mw-widget-desc {
    margin-top: 3px;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.68);
    font-size: 12px;
    line-height: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mw-lib-del {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 2;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(127, 29, 29, 0.86);
    color: #fff;
    border-radius: 999px;
    padding: 3px 7px;
    cursor: pointer;
    font-size: 12px;
    line-height: 16px;
  }

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
    overflow: hidden;
    display: flex;
    flex-direction: column;
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
