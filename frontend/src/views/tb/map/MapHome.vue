<template>
  <div class="map-home">
    <CesiumMap
      class="map-canvas"
      :sensor-points="visibleSensorPoints"
      :camera-points="visibleCameraPoints"
      :fly-to-first-sensor="!isSysAdminMap"
      :fly-to-first-camera="!isSysAdminMap"
      :globe-only="mapGlobeOnly"
      :scene-models="sceneModels"
      @sensor-click="onSensorClick"
      @camera-click="onCameraClick"
    />

    <MapWidgetLayer
      v-if="showWidgetLayer"
      class="map-widgets"
      :storage-key="storageKey"
      :data="assignedTemplateState"
      :runtime-devices="assignedTemplateRuntimeDevices"
    />

    <SensorWidgetPopup
      v-if="!showDefaultGlobeOnly"
      :visible="sensorPreviewVisible"
      :sensor="selectedSensor"
      :widgets="selectedSensor ? getSensorPopupWidgetsForView(selectedSensor.id) : []"
      :runtime-devices="assignedTemplateRuntimeDevices"
      @close="sensorPreviewVisible = false"
    />

    <CameraMonitorPopup
      v-if="!showDefaultGlobeOnly"
      :visible="cameraPopupVisible"
      :runtime-info="selectedCameraRuntime"
      :loading="cameraRuntimeLoading"
      :error="cameraRuntimeError"
      @close="closeCameraPopup"
    />

    <button class="map-settings-btn" type="button" @click="openHome">设置</button>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useRouter } from 'vue-router';
  import { useUserStore } from '/@/store/modules/user';
  import { PageEnum } from '/@/enums/pageEnum';
  import { Authority } from '/@/enums/authorityEnum';
  import { usePermission } from '/@/hooks/web/usePermission';
  import { customerDashboardList, getDashboardById, type DashboardInfo } from '/@/api/tb/dashboard';
  import { getCustomerDeviceInfoList, getTenantDeviceInfoList, type DeviceInfo } from '/@/api/tb/device';
  import CesiumMap from './CesiumMap.vue';
  import MapWidgetLayer from './MapWidgetLayer.vue';
  import SensorWidgetPopup from './SensorWidgetPopup.vue';
  import CameraMonitorPopup from './components/CameraMonitorPopup.vue';
  import { getMapWidgetStorageKey } from './mapWidgetStorage';
  import { getMapPointStorageKey, loadMapPoints } from './mapPointStorage';
  import { getSensorPopupWidgets } from './sensorPopupWidgetStorage';
  import { loadCameraRuntimeInfo } from './services/cameraDeviceRuntimeService';
  import {
    getAssignedMapTemplateRuntime,
    subscribeAssignedMapTemplateRuntimeEvents,
    type MapTemplateRuntimeDevices,
    type MapTemplateRuntimeEvent,
    type MapTemplateRuntimeResponse,
  } from './services/mapTemplateRuntimeService';
  import {
    loadDeviceMapPoints,
    loadDeviceMapPointStatuses,
    type DeviceMapPointStatus,
  } from './services/deviceMapPointService';
  import type { CameraMapPoint, CameraRuntimeInfo, MapPoint, SensorMapPoint } from './types/mapPointTypes';
  import type { PopupWidgetConfig } from './sensorPopupWidgetStorage';
  import {
    DASHBOARD_MAP_WIDGET_CONFIG_KEY,
    normalizeMapTemplateState,
    type MapTemplateState,
  } from './mapTemplateConfig';
  import {
    clearSelectedMapTemplateId,
    loadSelectedMapTemplateId,
    saveSelectedMapTemplateId,
  } from './selectedMapTemplateStorage';

  const DEVICE_POINT_REFRESH_MS = 30000;
  type AssignedTemplateState = MapTemplateState;

  const router = useRouter();
  const userStore = useUserStore();
  const { hasPermission } = usePermission();

  const manualMapPoints = ref<MapPoint[]>(loadMapPoints());
  const deviceMapPoints = ref<MapPoint[]>([]);
  const assignedTemplateDeviceStatuses = ref<DeviceMapPointStatus[]>([]);
  const assignedTemplateRuntimeDeviceMap = ref<MapTemplateRuntimeDevices>({});
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

  const isSysAdminMap = computed(() => userStore.getAuthority === Authority.SYS_ADMIN);
  const isCustomerUserMap = computed(() => userStore.getAuthority === Authority.CUSTOMER_USER);
  const assignedTemplateState = ref<AssignedTemplateState | null>(null);
  const currentAssignedTemplateDashboardId = ref('');
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
  const sensorPoints = computed(() =>
    mapPoints.value.filter((point): point is SensorMapPoint => point.type === 'sensor'),
  );
  const cameraPoints = computed(() =>
    mapPoints.value.filter((point): point is CameraMapPoint => point.type === 'camera'),
  );
  const hasAssignedTemplate = computed(() => Boolean(assignedTemplateState.value));
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
  const showWidgetLayer = computed(
    () => !showDefaultGlobeOnly.value && (!isCustomerUserMap.value || hasAssignedTemplate.value),
  );
  const visibleSensorPoints = computed(() => (showDefaultGlobeOnly.value ? [] : sensorPoints.value));
  const visibleCameraPoints = computed(() => (showDefaultGlobeOnly.value ? [] : cameraPoints.value));

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
    const color =
      online === undefined ? (point as any).color : online ? (point.type === 'camera' ? 'green' : 'blue') : 'gray';

    return {
      ...point,
      ...runtime,
      id: point.id,
      type: point.type,
      name: point.name,
      entityType: point.entityType,
      entityId: point.entityId,
      entityName: point.entityName,
      online: online ?? point.online,
      streamOnline: streamOnline ?? (point as any).streamOnline,
      streamAlive: online === false ? false : ((runtime as any).streamAlive ?? (point as any).streamAlive),
      statusText,
      color,
    } as MapPoint;
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

  async function refreshDeviceMapPoints() {
    if (isSysAdminMap.value) {
      deviceMapPoints.value = [];
      return;
    }

    if (isCustomerUserMap.value) {
      await refreshAssignedDashboardTemplate(currentAssignedTemplateDashboardId.value);
      return;
    }

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
    assignedTemplateRuntimeDeviceMap.value = {};
    assignedTemplateState.value = normalizeMapTemplateState(dashboard.configuration?.[DASHBOARD_MAP_WIDGET_CONFIG_KEY]);
    await refreshAssignedTemplatePointStatuses();
  }

  async function refreshAssignedDashboardTemplate(dashboardId: string) {
    const normalizedDashboardId = String(dashboardId || '').trim();
    if (!normalizedDashboardId || templateReloading) return;

    templateReloading = true;
    try {
      if (isCustomerUserMap.value) {
        if (mapTemplateRuntimeAvailable) {
          try {
            applyAssignedTemplateRuntime(await getAssignedMapTemplateRuntime(normalizedDashboardId));
            return;
          } catch (error) {
            if (getHttpStatus(error) !== 404) {
              throw error;
            }
            mapTemplateRuntimeAvailable = false;
            stopMapTemplateUpdateSubscription();
            console.warn('[MapHome] Map template runtime API is not available, fallback to dashboard config.');
          }
        }

        await loadAssignedTemplateFromDashboard(normalizedDashboardId);
        return;
      }

      await loadAssignedTemplateFromDashboard(normalizedDashboardId);
    } catch (error) {
      console.warn('[MapHome] Failed to refresh assigned dashboard template:', error);
    } finally {
      templateReloading = false;
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
    if (!isCustomerUserMap.value || !dashboardId || !mapTemplateRuntimeAvailable) return;

    unsubscribeMapTemplateUpdates = subscribeAssignedMapTemplateRuntimeEvents(dashboardId, (event) => {
      if (event.dashboardId !== currentAssignedTemplateDashboardId.value) return;
      applyAssignedTemplateRuntimeEvent(event);
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
    if (isCustomerUserMap.value) {
      const bindings = assignedTemplateState.value?.sensorPopupBindings || {};
      return Array.isArray(bindings[sensorId]) ? bindings[sensorId] : [];
    }

    return getSensorPopupWidgets(sensorId);
  }

  async function loadAssignedCustomerTemplate() {
    if (!isCustomerUserMap.value) return;

    assignedTemplateState.value = null;
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

  async function onCameraClick(camera: CameraMapPoint) {
    sensorPreviewVisible.value = false;
    selectedCameraRuntime.value = {
      ...createCameraRuntimeFromTemplatePoint(camera),
    };
    cameraRuntimeLoading.value = true;
    cameraRuntimeError.value = '';
    cameraPopupVisible.value = true;

    if (isCustomerUserMap.value) {
      cameraRuntimeLoading.value = false;
      return;
    }

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
      console.error('[MapHome] Failed to load camera runtime info:', {
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
    selectedCameraRuntime.value = null;
    cameraRuntimeRequestId += 1;
  }

  function createCameraRuntimeFromTemplatePoint(camera: CameraMapPoint): CameraRuntimeInfo {
    const point = camera as CameraMapPoint & Partial<CameraRuntimeInfo> & Record<string, any>;
    return {
      entityId: camera.entityId,
      entityName: camera.entityName || camera.name,
      cameraId: point.cameraId,
      cameraCode: point.cameraCode,
      cameraName: point.cameraName || camera.name,
      cameraModel: point.cameraModel,
      hlsUrl: point.hlsUrl,
      streamUrl: point.streamUrl || point.streamUrlMain,
      webRtcUrl: point.webRtcUrl,
      rtspUrl: point.rtspUrl,
      flvUrl: point.flvUrl,
      streamType: point.streamType,
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

  function openHome() {
    router.push(homePath.value);
  }

  onMounted(async () => {
    window.addEventListener('storage', onStorage);
    await loadAssignedCustomerTemplate();
    if (!isSysAdminMap.value) {
      void refreshDeviceMapPoints();
      devicePointRefreshTimer = window.setInterval(refreshDeviceMapPoints, DEVICE_POINT_REFRESH_MS);
    }
  });

  onBeforeUnmount(() => {
    window.removeEventListener('storage', onStorage);
    if (devicePointRefreshTimer) {
      window.clearInterval(devicePointRefreshTimer);
      devicePointRefreshTimer = undefined;
    }
    stopMapTemplateUpdateSubscription();
    currentAssignedTemplateDashboardId.value = '';
  });
</script>

<style scoped>
  .map-home {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .map-canvas {
    position: absolute;
    inset: 0;
  }

  .map-settings-btn {
    position: absolute;
    left: 12px;
    top: 12px;
    z-index: 2000;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.7);
    background: rgba(22, 100, 145, 0.92);
    color: #fff;
    cursor: pointer;
  }

  .map-widgets {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
  }
</style>
