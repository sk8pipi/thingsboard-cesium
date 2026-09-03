<template>
  <div
    ref="mapHomeRef"
    class="map-home"
    :class="{ 'map-home--compact': mapScreen.metrics.value.compact }"
    :style="mapAppearanceStyle"
  >
    <MapScreenTopBar
      class="map-top-bar"
      :config="topBarConfig"
      :actions="availableTopBarActions"
      mode="runtime"
      :dashboard-title="currentAssignedTemplateTitle"
      :is-fullscreen="isMapFullscreen"
      :responsive-height="mapScreen.metrics.value.topBarHeight"
      :screen-scale="mapScreen.metrics.value.uiScale"
      @action="handleTopBarAction"
    >
      <template #runtime-actions>
        <MapAssetSelector
          v-if="showAssetSelector"
          :assets="assetSelectorOptions"
          :selected-asset-id="appliedAssetId"
          :catalog-loading="assetCatalogLoading"
          :resolving="assetRelationResolving"
          :error="assetFilterError"
          :visible-point-count="filteredMapPoints.length"
          :total-point-count="mapPoints.length"
          @select="requestAssetSelection"
          @retry="retryAssetFilter"
        />
      </template>
    </MapScreenTopBar>

    <CesiumMap
      ref="cesiumMapRef"
      class="map-canvas"
      :sensor-points="visibleSensorPoints"
      :camera-points="visibleCameraPoints"
      :fly-to-first-sensor="!isSysAdminMap"
      :fly-to-first-camera="!isSysAdminMap"
      :globe-only="mapGlobeOnly"
      :scene-models="sceneModels"
      :enable-sensor-type-styles="enableMapSensorTypeStyles"
      :sensor-device-type-styles="assignedTemplateState?.sensorDeviceTypeStyles || {}"
      :resolution-scale="mapScreen.metrics.value.cesiumResolutionScale"
      :screen-scale="mapScreen.metrics.value.uiScale"
      @sensor-click="onSensorClick"
      @camera-click="onCameraClick"
    />

    <MapWidgetLayer
      v-if="showWidgetLayer"
      class="map-widgets"
      :storage-key="storageKey"
      :data="assignedTemplateState"
      :runtime-devices="assignedTemplateRuntimeDevices"
      :runtime="datasourceRuntime"
      :screen-metrics="mapScreen.metrics.value"
      @alarm-focus="onAlarmFocus"
    />

    <div v-if="assetFilterEmpty" class="map-asset-empty-state" role="status">
      <strong>{{ appliedAssetName }}</strong>
      <span>该资产及其子资产下没有可显示的传感器或监控点位</span>
    </div>

    <SensorWidgetPopup
      v-if="!showDefaultGlobeOnly"
      :visible="sensorPreviewVisible"
      :sensor="selectedSensor"
      :widgets="selectedSensor ? getSensorPopupWidgetsForView(selectedSensor.id) : []"
      :export-enabled="isCustomerUserMap"
      :runtime-devices="assignedTemplateRuntimeDevices"
      :runtime="datasourceRuntime"
      @close="closeSensorPopup"
    />

    <CameraMonitorPopup
      v-if="!showDefaultGlobeOnly"
      :visible="cameraPopupVisible"
      :runtime-info="selectedCameraRuntime"
      :loading="cameraRuntimeLoading"
      :error="cameraRuntimeError"
      @close="closeCameraPopup"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useRouter } from 'vue-router';
  import { useUserStore } from '/@/store/modules/user';
  import { PageEnum } from '/@/enums/pageEnum';
  import { Authority } from '/@/enums/authorityEnum';
  import { usePermission } from '/@/hooks/web/usePermission';
  import { customerDashboardList, getDashboardById, type DashboardInfo } from '/@/api/tb/dashboard';
  import { getCustomerAssetInfoList, type AssetInfo } from '/@/api/tb/asset';
  import { getCustomerDeviceInfoList, getTenantDeviceInfoList, type DeviceInfo } from '/@/api/tb/device';
  import { findRelationListByFromAndType } from '/@/api/tb/relation';
  import { EntityType } from '/@/enums/entityTypeEnum';
  import { RelationTypeGroup } from '/@/enums/relationEnum';
  import CesiumMap from './CesiumMap.vue';
  import MapWidgetLayer from './MapWidgetLayer.vue';
  import { createDatasourceRuntime } from '../dashboard/runtime/datasourceRuntime';
  import SensorWidgetPopup from './SensorWidgetPopup.vue';
  import CameraMonitorPopup from './components/CameraMonitorPopup.vue';
  import MapScreenTopBar from './components/MapScreenTopBar.vue';
  import MapAssetSelector from './components/MapAssetSelector.vue';
  import { getMapWidgetStorageKey } from './mapWidgetStorage';
  import { resolveSensorDeviceType } from './services/sensorPointStyleService';
  import { getMapPointStorageKey, loadMapPoints } from './mapPointStorage';
  import { loadCameraRuntimeInfo } from './services/cameraDeviceRuntimeService';
  import { releaseCameraVideoSession } from './services/cameraVideoSessionService';
  import {
    getAssignedMapTemplateRuntime,
    type MapTemplateRuntimeDevices,
    type MapTemplateRuntimeEvent,
    type MapTemplateRuntimeResponse,
  } from './services/mapTemplateRuntimeService';
  import { subscribeAssignedMapTemplateUpdates } from './services/mapTemplateEventService';
  import {
    loadDeviceMapPoints,
    loadDeviceMapPointStatuses,
    type DeviceMapPointStatus,
  } from './services/deviceMapPointService';
  import type {
    CameraMapPoint,
    CameraRuntimeInfo,
    MapPoint,
    MapPointLocation,
    SensorMapPoint,
  } from './types/mapPointTypes';
  import type { AlarmFocusPayload } from '../dashboard/runtime/widgets/alarm/focus';
  import type { PopupWidgetConfig } from './sensorPopupWidgetStorage';
  import {
    DASHBOARD_MAP_WIDGET_CONFIG_KEY,
    createDefaultMapTopBarConfig,
    DEFAULT_MAP_TEMPLATE_VIEWPORT,
    mapTemplateAppearanceStyle,
    normalizeMapTemplateState,
    resolveMapTemplateViewportForLayout,
    type MapTopBarActionType,
    type MapTemplateState,
  } from './mapTemplateConfig';
  import { useMapScreenResponsive } from './mapScreenResponsive';
  import { executeMapTopBarAction, getAvailableMapTopBarActions } from './mapTopBarActions';
  import {
    AssetRelationTraversalLimitError,
    filterMapPointsByDeviceIds,
    resolveAssetDeviceIds,
  } from './services/mapAssetPointFilterService';
  import { clearSelectedMapAssetId, loadSelectedMapAssetId, saveSelectedMapAssetId } from './selectedMapAssetStorage';
  import {
    clearSelectedMapTemplateId,
    loadSelectedMapTemplateId,
    saveSelectedMapTemplateId,
  } from './selectedMapTemplateStorage';

  const DEVICE_POINT_REFRESH_MS = 30000;
  type AssignedTemplateState = MapTemplateState;
  type MapAssetSelectorOption = {
    id: string;
    name: string;
    description?: string;
  };
  type CesiumMapExpose = {
    flyToPoint: (point: MapPointLocation) => void;
    flyToOverview: () => void | Promise<void>;
  };

  const router = useRouter();
  const userStore = useUserStore();
  const { hasPermission } = usePermission();

  const manualMapPoints = ref<MapPoint[]>(loadMapPoints());
  const deviceMapPoints = ref<MapPoint[]>([]);
  const assignedTemplateDeviceStatuses = ref<DeviceMapPointStatus[]>([]);
  const assignedTemplateRuntimeDeviceMap = ref<MapTemplateRuntimeDevices>({});
  const datasourceRuntime = createDatasourceRuntime({
    getExternalValues: (_entityType, entityId) => assignedTemplateRuntimeDeviceMap.value[entityId],
    getEntityName: (_entityType, entityId) =>
      String(
        assignedTemplateRuntimeDeviceMap.value[entityId]?.entityName ||
          assignedTemplateState.value?.mapPoints.find((point) => point.entityId === entityId)?.entityName ||
          '',
      ) || undefined,
  });
  watch(assignedTemplateRuntimeDeviceMap, () => datasourceRuntime.refreshExternalValues());

  const mapHomeRef = ref<HTMLElement | null>(null);
  const cesiumMapRef = ref<CesiumMapExpose | null>(null);
  const isMapFullscreen = ref(false);

  const selectedSensor = ref<SensorMapPoint | null>(null);
  const sensorPreviewVisible = ref(false);

  const cameraPopupVisible = ref(false);
  const selectedCameraRuntime = ref<CameraRuntimeInfo | null>(null);
  const cameraRuntimeLoading = ref(false);
  const cameraRuntimeError = ref('');
  let cameraRuntimeRequestId = 0;
  let devicePointRefreshTimer: number | undefined;
  let templateReloading = false;
  let mapTemplateRuntimeAvailable = true;
  let unsubscribeMapTemplateUpdates: (() => void) | undefined;
  let assetCatalogRequestId = 0;
  let assetFilterRequestId = 0;

  const isSysAdminMap = computed(() => userStore.getAuthority === Authority.SYS_ADMIN);
  const isCustomerUserMap = computed(() => userStore.getAuthority === Authority.CUSTOMER_USER);
  const assignedTemplateState = ref<AssignedTemplateState | null>(null);
  const currentAssignedTemplateTitle = ref('');
  const defaultTopBarConfig = createDefaultMapTopBarConfig();
  const topBarConfig = computed(() => assignedTemplateState.value?.topBar || defaultTopBarConfig);
  const availableTopBarActions = computed(() =>
    getAvailableMapTopBarActions(topBarConfig.value.actions, userStore.getAuthority),
  );
  const responsiveTemplateViewport = computed(() =>
    resolveMapTemplateViewportForLayout(
      assignedTemplateState.value?.viewport || DEFAULT_MAP_TEMPLATE_VIEWPORT,
      assignedTemplateState.value?.layout,
      assignedTemplateState.value?.widgets,
    ),
  );
  const mapScreen = useMapScreenResponsive(
    mapHomeRef,
    () => responsiveTemplateViewport.value,
    () => topBarConfig.value,
  );
  const mapAppearanceStyle = computed(() => ({
    ...mapTemplateAppearanceStyle(assignedTemplateState.value?.appearance),
    ...mapScreen.cssVars.value,
  }));
  const currentAssignedTemplateDashboardId = ref('');
  const assetSelectorOptions = ref<MapAssetSelectorOption[]>([]);
  const requestedAssetId = ref('');
  const appliedAssetId = ref('');
  const appliedAssetDeviceIds = ref<Set<string> | null>(null);
  const assetCatalogLoading = ref(false);
  const assetCatalogLoaded = ref(false);
  const assetRelationResolving = ref(false);
  const assetCatalogError = ref('');
  const assetRelationError = ref('');
  const showAssetSelector = computed(() => isCustomerUserMap.value);
  const assetFilterError = computed(() => assetCatalogError.value || assetRelationError.value);
  const assetFilterStorageDashboardId = computed(
    () =>
      currentAssignedTemplateDashboardId.value ||
      String(
        userStore.getUserInfo?.additionalInfo?.homeDashboardId ||
          userStore.getUserInfo?.additionalInfo?.defaultDashboardId ||
          'map-home',
      ),
  );
  const storageKey = computed(() => getMapWidgetStorageKey());
  const assignedTemplateMapPoints = computed(() => assignedTemplateState.value?.mapPoints || []);
  const assignedTemplateRuntimeDevices = computed(() => assignedTemplateRuntimeDeviceMap.value);
  const assignedTemplateStatusMap = computed(() => {
    const statusMap = new Map<string, DeviceMapPointStatus>();
    assignedTemplateDeviceStatuses.value.forEach((status) => {
      statusMap.set(status.entityId, status);
    });
    return statusMap;
  });
  const sceneModels = computed(() => assignedTemplateState.value?.scene?.models || []);
  const mapPoints = computed(() => {
    if (isCustomerUserMap.value) {
      return applyAssignedTemplatePointStatuses(assignedTemplateMapPoints.value);
    }

    return mergeMapPoints(deviceMapPoints.value, manualMapPoints.value);
  });
  const hasAssignedTemplate = computed(() => Boolean(assignedTemplateState.value));
  const hasSensorDeviceTypeStyles = computed(
    () => Object.keys(assignedTemplateState.value?.sensorDeviceTypeStyles || {}).length > 0,
  );
  const enableMapSensorTypeStyles = computed(() => isCustomerUserMap.value || hasSensorDeviceTypeStyles.value);
  const showDefaultGlobeOnly = computed(
    () => isSysAdminMap.value || (isCustomerUserMap.value && !hasAssignedTemplate.value),
  );
  const mapGlobeOnly = computed(() => {
    if (isSysAdminMap.value) return true;
    if (isCustomerUserMap.value) {
      return assignedTemplateState.value?.scene?.globeOnly !== false;
    }
    return false;
  });
  const showWidgetLayer = computed(() => isCustomerUserMap.value && hasAssignedTemplate.value);
  const filteredMapPoints = computed(() => filterMapPointsByDeviceIds(mapPoints.value, appliedAssetDeviceIds.value));
  const visibleSensorPoints = computed(() =>
    showDefaultGlobeOnly.value
      ? []
      : filteredMapPoints.value.filter((point): point is SensorMapPoint => point.type === 'sensor'),
  );
  const visibleCameraPoints = computed(() =>
    showDefaultGlobeOnly.value
      ? []
      : filteredMapPoints.value.filter((point): point is CameraMapPoint => point.type === 'camera'),
  );
  const visibleMapPoints = computed<MapPoint[]>(() => [...visibleSensorPoints.value, ...visibleCameraPoints.value]);
  const appliedAssetName = computed(
    () => assetSelectorOptions.value.find((asset) => asset.id === appliedAssetId.value)?.name || '所选资产',
  );
  const assetFilterEmpty = computed(
    () =>
      Boolean(appliedAssetId.value) &&
      !assetRelationResolving.value &&
      appliedAssetDeviceIds.value !== null &&
      filteredMapPoints.value.length === 0,
  );

  const homePath = computed(() => {
    return userStore.getUserInfo?.additionalInfo?.homePath || PageEnum.BASE_HOME;
  });

  function applyMapPointPermissionFilter(device: DeviceInfo) {
    // Extension point: replace this with tenant/customer/asset rules when the permission model is finalized.
    return Boolean(device?.id?.id);
  }

  function mergeMapPoints(dynamicPoints: MapPoint[], manualPoints: MapPoint[]) {
    const manualPointMap = new Map(manualPoints.map((point) => [point.entityId, point]));
    const mergedDynamicPoints = dynamicPoints.map((dynamicPoint) => {
      const manualPoint = manualPointMap.get(dynamicPoint.entityId);
      if (!manualPoint) return dynamicPoint;

      const useDeviceInfoLocation = dynamicPoint.locationSource === 'deviceInfo';
      return {
        ...dynamicPoint,
        ...manualPoint,
        longitude: useDeviceInfoLocation ? dynamicPoint.longitude : manualPoint.longitude,
        latitude: useDeviceInfoLocation ? dynamicPoint.latitude : manualPoint.latitude,
        height: useDeviceInfoLocation ? dynamicPoint.height : manualPoint.height,
        locationSource: useDeviceInfoLocation ? 'deviceInfo' : 'manual',
        online: dynamicPoint.online,
        statusText: dynamicPoint.statusText,
        color: dynamicPoint.color,
      } as MapPoint;
    });
    const dynamicEntityIds = new Set(dynamicPoints.map((point) => point.entityId).filter(Boolean));
    const manualOnlyPoints = manualPoints.filter((point) => !dynamicEntityIds.has(point.entityId));
    return [...mergedDynamicPoints, ...manualOnlyPoints];
  }

  function applyAssignedTemplatePointStatuses(points: MapPoint[]) {
    const statusMap = assignedTemplateStatusMap.value;
    return points.map((point) => {
      const status = statusMap.get(point.entityId);
      if (!status) return point;

      return {
        ...point,
        online: status.online,
        statusText: status.statusText,
        color: status.online ? (point.type === 'camera' ? 'green' : 'blue') : 'gray',
      } as MapPoint;
    });
  }

  function toRuntimeBoolean(value: unknown): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;

    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'online', 'on', 'active'].includes(normalized)) return true;
    if (['false', '0', 'no', 'offline', 'off', 'inactive'].includes(normalized)) return false;
    return undefined;
  }

  function normalizeRuntimeStatusText(value: unknown, online: boolean | undefined) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'online') return '\u5728\u7ebf';
    if (normalized === 'offline') return '\u79bb\u7ebf';
    if (typeof value === 'string' && value.trim()) return value;
    if (online === undefined) return undefined;
    return online ? '\u5728\u7ebf' : '\u79bb\u7ebf';
  }

  function mergeRuntimeIntoPoint(point: MapPoint, runtime?: Record<string, unknown>): MapPoint {
    if (!runtime) return point;

    const online = toRuntimeBoolean(runtime.online ?? runtime.status ?? runtime.active);
    const streamOnline = online === false ? false : toRuntimeBoolean(runtime.streamOnline ?? runtime.streamAlive);
    const statusText = normalizeRuntimeStatusText(runtime.statusText, online) || point.statusText;
    const deviceType = point.type === 'sensor' ? resolveSensorDeviceType(runtime) || undefined : undefined;
    const color =
      online === undefined ? (point as any).color : online ? (point.type === 'camera' ? 'green' : 'blue') : 'gray';

    return {
      ...point,
      ...runtime,
      id: point.id,
      type: point.type,
      name: point.name,
      longitude: point.longitude,
      latitude: point.latitude,
      height: point.height,
      locationSource: point.locationSource,
      entityType: point.entityType,
      entityId: point.entityId,
      entityName: point.entityName,
      online: online ?? point.online,
      streamOnline: streamOnline ?? (point as any).streamOnline,
      streamAlive: online === false ? false : ((runtime as any).streamAlive ?? (point as any).streamAlive),
      statusText,
      color,
      deviceType,
    } as unknown as MapPoint;
  }

  function mergeRuntimeIntoTemplateState(
    state: MapTemplateState,
    devices?: MapTemplateRuntimeDevices,
  ): MapTemplateState {
    const runtimeDevices = devices || {};
    return {
      ...state,
      mapPoints: state.mapPoints.map((point) => mergeRuntimeIntoPoint(point, runtimeDevices[point.entityId])),
    };
  }

  function syncOpenPopupsFromAssignedTemplate(devices?: MapTemplateRuntimeDevices) {
    if (selectedSensor.value) {
      const currentSensor = assignedTemplateState.value?.mapPoints.find(
        (point): point is SensorMapPoint => point.type === 'sensor' && point.id === selectedSensor.value?.id,
      );
      if (currentSensor) {
        selectedSensor.value = currentSensor;
      }
    }

    const currentCameraRuntime = selectedCameraRuntime.value;
    const selectedCameraEntityId = currentCameraRuntime?.entityId;
    if (currentCameraRuntime && selectedCameraEntityId && devices?.[selectedCameraEntityId]) {
      selectedCameraRuntime.value = {
        ...currentCameraRuntime,
        ...devices[selectedCameraEntityId],
      } as CameraRuntimeInfo;
    }
  }

  function applyAssignedTemplateRuntime(runtime: MapTemplateRuntimeResponse) {
    const normalized = normalizeMapTemplateState(runtime.template);
    assignedTemplateRuntimeDeviceMap.value = runtime.devices || {};
    assignedTemplateState.value = mergeRuntimeIntoTemplateState(normalized, assignedTemplateRuntimeDeviceMap.value);
    assignedTemplateDeviceStatuses.value = [];
    syncOpenPopupsFromAssignedTemplate(assignedTemplateRuntimeDeviceMap.value);
  }

  function applyAssignedTemplateRuntimeEvent(event: MapTemplateRuntimeEvent) {
    if (event.template) {
      applyAssignedTemplateRuntime(event);
      return;
    }

    if (!assignedTemplateState.value) return;
    assignedTemplateRuntimeDeviceMap.value = {
      ...assignedTemplateRuntimeDeviceMap.value,
      ...(event.devices || {}),
    };
    assignedTemplateState.value = mergeRuntimeIntoTemplateState(
      assignedTemplateState.value,
      assignedTemplateRuntimeDeviceMap.value,
    );
    assignedTemplateDeviceStatuses.value = [];
    syncOpenPopupsFromAssignedTemplate(assignedTemplateRuntimeDeviceMap.value);
  }

  async function fetchAccessibleDeviceInfos(params: {
    pageSize: number;
    page: number;
    sortProperty: string;
    sortOrder: 'ASC' | 'DESC';
  }) {
    if (hasPermission(Authority.CUSTOMER_USER)) {
      return getCustomerDeviceInfoList(params, userStore.getUserInfo?.customerId?.id || '');
    }

    return getTenantDeviceInfoList(params);
  }

  function getAssetFilterStorageIdentity() {
    return {
      userId: userStore.getUserInfo?.id?.id || '',
      dashboardId: assetFilterStorageDashboardId.value,
    };
  }

  async function loadAllAccessibleAssets() {
    const assets: AssetInfo[] = [];
    let page = 0;
    let hasNext = true;

    while (hasNext) {
      const params = {
        pageSize: 100,
        page,
        sortProperty: 'name',
        sortOrder: 'ASC' as const,
      };
      const result = await getCustomerAssetInfoList(params, userStore.getUserInfo?.customerId?.id || '');
      assets.push(...(result.data || []));
      hasNext = Boolean(result.hasNext);
      page += 1;
    }

    return assets;
  }

  function toAssetSelectorOptions(assets: readonly AssetInfo[]) {
    const options = new Map<string, MapAssetSelectorOption>();
    assets.forEach((asset) => {
      const id = String(asset.id?.id || '').trim();
      if (!id || options.has(id)) return;

      const name = String(asset.label || asset.name || id).trim();
      const details = [asset.type, asset.label && asset.name && asset.label !== asset.name ? asset.name : '']
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      options.set(id, {
        id,
        name,
        description: details.join(' · '),
      });
    });
    return [...options.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  function clearAssetSelection() {
    assetFilterRequestId += 1;
    requestedAssetId.value = '';
    appliedAssetId.value = '';
    appliedAssetDeviceIds.value = null;
    assetRelationResolving.value = false;
    assetRelationError.value = '';
    const { userId, dashboardId } = getAssetFilterStorageIdentity();
    clearSelectedMapAssetId(userId, dashboardId);
  }

  function assetDisplayName(assetId: string) {
    return assetSelectorOptions.value.find((asset) => asset.id === assetId)?.name || '所选资产';
  }

  function assetRelationErrorMessage(error: unknown, assetId: string) {
    const assetName = assetDisplayName(assetId);
    if (error instanceof AssetRelationTraversalLimitError) {
      return `${assetName}的关系规模超过安全上限，请联系管理员检查资产关系`;
    }
    return `${assetName}的设备关系读取失败，仍保留上次成功的显示结果`;
  }

  async function requestAssetSelection(assetId: string) {
    const normalizedAssetId = String(assetId || '').trim();
    if (!normalizedAssetId) {
      clearAssetSelection();
      return;
    }

    if (assetCatalogLoaded.value && !assetSelectorOptions.value.some((asset) => asset.id === normalizedAssetId)) {
      clearAssetSelection();
      return;
    }

    const requestId = ++assetFilterRequestId;
    requestedAssetId.value = normalizedAssetId;
    assetRelationResolving.value = true;
    assetRelationError.value = '';

    try {
      const result = await resolveAssetDeviceIds(normalizedAssetId, (currentAssetId) =>
        findRelationListByFromAndType({
          fromId: currentAssetId,
          fromType: EntityType.ASSET,
          relationType: 'Contains',
          relationTypeGroup: RelationTypeGroup.COMMON,
        }),
      );
      if (requestId !== assetFilterRequestId) return;

      appliedAssetId.value = normalizedAssetId;
      appliedAssetDeviceIds.value = result.deviceIds;
      const { userId, dashboardId } = getAssetFilterStorageIdentity();
      saveSelectedMapAssetId(userId, dashboardId, normalizedAssetId);
    } catch (error) {
      if (requestId !== assetFilterRequestId) return;
      const status = getHttpStatus(error);
      if (status === 403 || status === 404) {
        const assetName = assetDisplayName(normalizedAssetId);
        clearAssetSelection();
        assetSelectorOptions.value = assetSelectorOptions.value.filter((asset) => asset.id !== normalizedAssetId);
        assetCatalogLoaded.value = false;
        assetRelationError.value = `${assetName}已删除或当前账号无权访问，已恢复显示全部资产`;
      } else {
        assetRelationError.value = assetRelationErrorMessage(error, normalizedAssetId);
      }
      console.warn('[MapHome] Failed to resolve asset point filter:', {
        assetId: normalizedAssetId,
        error,
      });
    } finally {
      if (requestId === assetFilterRequestId) {
        assetRelationResolving.value = false;
      }
    }
  }

  async function loadAssetCatalog() {
    if (!showAssetSelector.value) return;
    const requestId = ++assetCatalogRequestId;
    assetCatalogLoading.value = true;
    assetCatalogError.value = '';
    let assetIdToRestore = '';

    try {
      const assets = await loadAllAccessibleAssets();
      if (requestId !== assetCatalogRequestId) return;

      assetSelectorOptions.value = toAssetSelectorOptions(assets);
      assetCatalogLoaded.value = true;
      const { userId, dashboardId } = getAssetFilterStorageIdentity();
      const storedAssetId = loadSelectedMapAssetId(userId, dashboardId);
      const candidateAssetId = requestedAssetId.value || storedAssetId;
      if (candidateAssetId && assetSelectorOptions.value.some((asset) => asset.id === candidateAssetId)) {
        assetIdToRestore = candidateAssetId;
      } else if (candidateAssetId) {
        clearAssetSelection();
      }
    } catch (error) {
      if (requestId !== assetCatalogRequestId) return;
      assetCatalogError.value = '资产目录加载失败，当前仍显示上次成功的点位结果';
      console.warn('[MapHome] Failed to load asset catalog:', error);
    } finally {
      if (requestId === assetCatalogRequestId) {
        assetCatalogLoading.value = false;
      }
    }

    if (requestId === assetCatalogRequestId && assetIdToRestore) {
      await requestAssetSelection(assetIdToRestore);
    }
  }

  function retryAssetFilter() {
    if (assetCatalogError.value || !assetCatalogLoaded.value) {
      assetRelationError.value = '';
      void loadAssetCatalog();
      return;
    }
    if (requestedAssetId.value) {
      void requestAssetSelection(requestedAssetId.value);
    }
  }

  async function refreshDeviceMapPoints() {
    if (isSysAdminMap.value) {
      deviceMapPoints.value = [];
      return;
    }

    if (isCustomerUserMap.value) return;

    try {
      const points = await loadDeviceMapPoints({
        fetchDevices: fetchAccessibleDeviceInfos,
        permissionFilter: applyMapPointPermissionFilter,
      });
      deviceMapPoints.value = points;
    } catch (error) {
      console.warn('[MapHome] Failed to refresh device map points:', error);
    }
  }

  async function refreshAssignedTemplatePointStatuses() {
    if (isCustomerUserMap.value) {
      assignedTemplateDeviceStatuses.value = [];
      return;
    }

    const deviceIds = assignedTemplateMapPoints.value
      .filter((point) => point.entityType === 'DEVICE')
      .map((point) => point.entityId);

    if (!deviceIds.length) {
      assignedTemplateDeviceStatuses.value = [];
      return;
    }

    try {
      assignedTemplateDeviceStatuses.value = await loadDeviceMapPointStatuses(deviceIds);
    } catch (error) {
      console.warn('[MapHome] Failed to refresh assigned template point statuses:', error);
    }
  }

  function getHttpStatus(error: unknown) {
    return Number((error as any)?.response?.status || (error as any)?.status || 0);
  }

  async function loadAssignedTemplateFromDashboard(dashboardId: string) {
    const dashboard = await getDashboardById(dashboardId);
    currentAssignedTemplateTitle.value = dashboard.title || '';
    assignedTemplateState.value = normalizeMapTemplateState(dashboard.configuration?.[DASHBOARD_MAP_WIDGET_CONFIG_KEY]);
    await refreshAssignedTemplatePointStatuses();
  }

  async function refreshAssignedDashboardTemplate(dashboardId: string) {
    const normalizedDashboardId = String(dashboardId || '').trim();
    if (!normalizedDashboardId || templateReloading) return;

    templateReloading = true;
    try {
      await loadAssignedTemplateFromDashboard(normalizedDashboardId);
      if (isCustomerUserMap.value && mapTemplateRuntimeAvailable) {
        void refreshAssignedRuntimeDevices(normalizedDashboardId);
      }
    } catch (error) {
      console.warn('[MapHome] Failed to refresh assigned dashboard template:', error);
    } finally {
      templateReloading = false;
    }
  }

  async function refreshAssignedRuntimeDevices(dashboardId: string) {
    try {
      const runtime = await getAssignedMapTemplateRuntime(dashboardId);
      if (dashboardId !== currentAssignedTemplateDashboardId.value || !assignedTemplateState.value) return;

      assignedTemplateRuntimeDeviceMap.value = runtime.devices || {};
      assignedTemplateState.value = mergeRuntimeIntoTemplateState(
        assignedTemplateState.value,
        assignedTemplateRuntimeDeviceMap.value,
      );
      syncOpenPopupsFromAssignedTemplate(assignedTemplateRuntimeDeviceMap.value);
    } catch (error) {
      if (getHttpStatus(error) === 404) {
        mapTemplateRuntimeAvailable = false;
        return;
      }
      console.warn('[MapHome] Failed to load optional map point runtime data:', error);
    }
  }

  function stopMapTemplateUpdateSubscription() {
    if (unsubscribeMapTemplateUpdates) {
      unsubscribeMapTemplateUpdates();
      unsubscribeMapTemplateUpdates = undefined;
    }
  }

  function startMapTemplateUpdateSubscription(dashboardId: string) {
    stopMapTemplateUpdateSubscription();
    if (!isCustomerUserMap.value || !dashboardId) return;

    unsubscribeMapTemplateUpdates = subscribeAssignedMapTemplateUpdates(dashboardId, (event) => {
      if (event.dashboardId !== currentAssignedTemplateDashboardId.value) return;
      void refreshAssignedDashboardTemplate(dashboardId);
    });
  }

  function reloadMapPoints() {
    manualMapPoints.value = loadMapPoints();
  }

  function onStorage(event: StorageEvent) {
    if (isCustomerUserMap.value) return;
    if (!event.key) return;
    if (event.key === getMapPointStorageKey()) {
      reloadMapPoints();
    }
  }

  function getSensorPopupWidgetsForView(sensorId: string): PopupWidgetConfig[] {
    if (!isCustomerUserMap.value) return [];
    const bindings = assignedTemplateState.value?.sensorPopupBindings || {};
    return Array.isArray(bindings[sensorId]) ? bindings[sensorId] : [];
  }

  async function loadAssignedCustomerTemplate() {
    if (!isCustomerUserMap.value) return;

    assignedTemplateState.value = null;
    currentAssignedTemplateTitle.value = '';
    assignedTemplateRuntimeDeviceMap.value = {};

    const customerId = userStore.getUserInfo?.customerId?.id || '';
    const userId = userStore.getUserInfo?.id?.id || '';
    if (!customerId) {
      currentAssignedTemplateDashboardId.value = '';
      stopMapTemplateUpdateSubscription();
      return;
    }

    try {
      const templates = await loadAssignedTemplateInfos(customerId);
      if (!templates.length) {
        clearSelectedMapTemplateId(userId);
        currentAssignedTemplateDashboardId.value = '';
        stopMapTemplateUpdateSubscription();
        return;
      }

      const selectedTemplateId = loadSelectedMapTemplateId(userId);
      const selectedTemplate = templates.find((item) => item.id?.id === selectedTemplateId) || templates[0];
      const dashboardId = selectedTemplate?.id?.id;
      if (!dashboardId) return;

      if (dashboardId !== selectedTemplateId) {
        saveSelectedMapTemplateId(userId, dashboardId);
      }

      currentAssignedTemplateDashboardId.value = dashboardId;
      await refreshAssignedDashboardTemplate(dashboardId);
      startMapTemplateUpdateSubscription(dashboardId);
    } catch (error) {
      console.warn('[MapHome] Failed to load assigned dashboard template:', error);
    }
  }

  async function loadAssignedTemplateInfos(customerId: string) {
    const templates: DashboardInfo[] = [];
    let page = 0;
    let hasNext = true;

    while (hasNext) {
      const result = await customerDashboardList(
        {
          pageSize: 100,
          page,
          sortProperty: 'createdTime',
          sortOrder: 'DESC',
        },
        customerId,
      );
      templates.push(...(result.data || []));
      hasNext = Boolean(result.hasNext);
      page += 1;
    }

    return templates;
  }

  function onSensorClick(sensor: SensorMapPoint) {
    closeCameraPopup();
    selectedSensor.value = sensor;
    sensorPreviewVisible.value = true;
  }

  function closeSensorPopup() {
    sensorPreviewVisible.value = false;
    selectedSensor.value = null;
  }

  function findAlarmPoint(payload: AlarmFocusPayload) {
    const pointId = payload.pointId || '';
    const originatorId = payload.originatorId || '';
    return visibleMapPoints.value.find((point) => {
      if (pointId && point.id === pointId) return true;
      if (originatorId && point.entityId === originatorId) return true;
      return false;
    });
  }

  function onAlarmFocus(payload: AlarmFocusPayload) {
    const point = findAlarmPoint(payload);
    if (point) {
      cesiumMapRef.value?.flyToPoint(point);
      if (point.type === 'sensor') {
        onSensorClick(point);
      } else {
        void onCameraClick(point);
      }
      return;
    }

    if (payload.pointId || payload.originatorId) {
      console.warn('[MapHome] Alarm point is not visible in the current asset filter:', payload);
    } else if (Number.isFinite(payload.longitude) && Number.isFinite(payload.latitude)) {
      cesiumMapRef.value?.flyToPoint({
        longitude: payload.longitude as number,
        latitude: payload.latitude as number,
        height: payload.height,
      });
    } else {
      console.warn('[MapHome] Alarm point not found:', payload);
    }
  }

  async function onCameraClick(camera: CameraMapPoint) {
    closeSensorPopup();
    selectedCameraRuntime.value = {
      ...createCameraRuntimeFromTemplatePoint(camera),
    };
    cameraRuntimeLoading.value = true;
    cameraRuntimeError.value = '';
    cameraPopupVisible.value = true;

    const requestId = ++cameraRuntimeRequestId;

    let targetCamera = camera;

    try {
      const dashboardId = currentAssignedTemplateDashboardId.value;
      if (isCustomerUserMap.value && dashboardId) {
        try {
          const dashboard = await getDashboardById(dashboardId);
          const latestTemplateState = normalizeMapTemplateState(
            dashboard.configuration?.[DASHBOARD_MAP_WIDGET_CONFIG_KEY],
          );
          const latestCameras = (latestTemplateState?.mapPoints || []).filter(
            (point): point is CameraMapPoint => point.type === 'camera',
          );
          const sameEntityName = camera.entityName
            ? latestCameras.filter((point) => point.entityName === camera.entityName)
            : [];
          const sameName = camera.name ? latestCameras.filter((point) => point.name === camera.name) : [];
          const refreshedCamera =
            latestCameras.find((point) => point.id === camera.id) ||
            (sameEntityName.length === 1 ? sameEntityName[0] : undefined) ||
            (sameName.length === 1 ? sameName[0] : undefined);
          if (refreshedCamera) {
            targetCamera = refreshedCamera;
          }
        } catch (error) {
          console.warn('[MapHome] Failed to refresh camera point before playback:', {
            dashboardId,
            pointId: camera.id,
            error,
          });
        }
      }

      if (requestId !== cameraRuntimeRequestId) return;
      const runtime = await loadCameraRuntimeInfo(targetCamera.entityId, targetCamera.entityName || targetCamera.name, [
        targetCamera.id,
        targetCamera.name,
      ]);
      if (requestId !== cameraRuntimeRequestId) {
        void releaseCameraVideoSession(runtime);
        return;
      }

      const pointRuntime = createCameraRuntimeFromTemplatePoint(targetCamera);
      selectedCameraRuntime.value = {
        ...runtime,
        entityId: runtime.entityId,
        entityName: runtime.entityName || targetCamera.entityName || targetCamera.name,
        cameraName: pointRuntime.cameraName || runtime.cameraName || targetCamera.name,
      };
    } catch (error: any) {
      if (requestId !== cameraRuntimeRequestId) return;
      console.error('[MapHome] Failed to load camera runtime info:', {
        pointId: targetCamera.id,
        entityId: targetCamera.entityId,
        entityName: targetCamera.entityName,
        error,
      });
      cameraRuntimeError.value = '\u8bfb\u53d6\u6444\u50cf\u5934\u8bbe\u5907\u4fe1\u606f\u5931\u8d25';
      selectedCameraRuntime.value = {
        entityId: targetCamera.entityId,
        entityName: targetCamera.entityName || targetCamera.name,
        cameraName: targetCamera.name,
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
    selectedCameraRuntime.value = null;
    cameraRuntimeRequestId += 1;
  }

  watch(visibleSensorPoints, (points) => {
    const sensor = selectedSensor.value;
    if (!sensorPreviewVisible.value || !sensor) return;
    if (!points.some((point) => point.id === sensor.id && point.entityId === sensor.entityId)) {
      closeSensorPopup();
    }
  });

  watch(visibleCameraPoints, (points) => {
    const camera = selectedCameraRuntime.value;
    if (!cameraPopupVisible.value || !camera?.entityId) return;
    if (!points.some((point) => point.entityId === camera.entityId)) {
      closeCameraPopup();
    }
  });

  function createCameraRuntimeFromTemplatePoint(camera: CameraMapPoint): CameraRuntimeInfo {
    const point = camera as CameraMapPoint & Partial<CameraRuntimeInfo> & Record<string, any>;
    return {
      entityId: camera.entityId,
      entityName: camera.entityName || camera.name,
      cameraId: point.cameraId,
      cameraCode: point.cameraCode,
      cameraName: point.cameraName || camera.name,
      cameraModel: point.cameraModel,
      supportsLive: point.supportsLive,
      supportsPlayback: point.supportsPlayback,
      supportsPtz: point.supportsPtz,
      supportsZoom: point.supportsZoom,
      supportsPreset: point.supportsPreset,
      supportsAudio: point.supportsAudio,
      controlMode: point.controlMode || 'none',
      supportedRpcMethods: point.supportedRpcMethods,
      rpcTargetDeviceId: point.rpcTargetDeviceId,
      rpcTargetDeviceName: point.rpcTargetDeviceName,
      rpcTargetCameraId: point.rpcTargetCameraId,
      rpcGatewayMethod: point.rpcGatewayMethod,
      rpcTopic: point.rpcTopic,
      rpcPayloadMode: point.rpcPayloadMode,
      rpcTargetMode: point.rpcTargetMode,
      rpcCallType: point.rpcCallType,
      rpcTimeout: point.rpcTimeout,
      online: point.online,
      streamOnline: point.streamOnline,
      fps: point.fps,
      bitrate: point.bitrate,
      delayMs: point.delayMs,
      motion: point.motion,
      alarm: point.alarm,
      recording: point.recording,
      videoLoss: point.videoLoss,
      motionDetected: point.motionDetected,
      tamperAlarm: point.tamperAlarm,
    };
  }

  function syncMapFullscreenState() {
    isMapFullscreen.value = Boolean(document.fullscreenElement);
  }

  function openHome() {
    router.push(homePath.value);
  }

  async function handleTopBarAction(type: MapTopBarActionType) {
    const result = await executeMapTopBarAction(type, {
      authority: userStore.getAuthority,
      fullscreenTarget: mapHomeRef.value,
      handlers: {
        overview: () => cesiumMapRef.value?.flyToOverview(),
        settings: openHome,
      },
    });

    if (typeof result.fullscreen === 'boolean') {
      isMapFullscreen.value = result.fullscreen;
    }
  }

  onMounted(async () => {
    window.addEventListener('storage', onStorage);
    document.addEventListener('fullscreenchange', syncMapFullscreenState);
    datasourceRuntime.connect();
    await loadAssignedCustomerTemplate();
    void loadAssetCatalog();
    if (!isSysAdminMap.value && !isCustomerUserMap.value) {
      void refreshDeviceMapPoints();
      devicePointRefreshTimer = window.setInterval(refreshDeviceMapPoints, DEVICE_POINT_REFRESH_MS);
    }
  });

  onBeforeUnmount(() => {
    cameraRuntimeRequestId += 1;
    assetCatalogRequestId += 1;
    assetFilterRequestId += 1;
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('fullscreenchange', syncMapFullscreenState);
    if (devicePointRefreshTimer) {
      window.clearInterval(devicePointRefreshTimer);
      devicePointRefreshTimer = undefined;
    }
    stopMapTemplateUpdateSubscription();
    currentAssignedTemplateDashboardId.value = '';
    datasourceRuntime.close();
  });
</script>

<style scoped>
  .map-home {
    position: relative;
    container: map-screen / size;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .map-canvas {
    position: absolute;
    inset: 0;
  }

  .map-top-bar {
    position: absolute;
    inset: 0 0 auto;
    z-index: 2000;
  }

  .map-widgets {
    z-index: 10;
    pointer-events: none;
  }

  .map-asset-empty-state {
    position: absolute;
    inset: 50% auto auto 50%;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: min(480px, calc(100% - 48px));
    padding: 18px 24px;
    box-sizing: border-box;
    color: #d9e7f2;
    text-align: center;
    background: rgba(7, 17, 29, 0.82);
    border: 1px solid rgba(123, 160, 191, 0.42);
    border-radius: 8px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.28);
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  .map-asset-empty-state strong {
    color: #f4f7fb;
    font-size: 16px;
  }

  .map-asset-empty-state span {
    margin-top: 6px;
    color: #9fb3c4;
    font-size: 13px;
  }
</style>
