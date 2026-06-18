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
    />

    <SensorWidgetPopup
      v-if="!showDefaultGlobeOnly"
      :visible="sensorPreviewVisible"
      :sensor="selectedSensor"
      :widgets="selectedSensor ? getSensorPopupWidgetsForView(selectedSensor.id) : []"
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
  import { applyCompactModelLayout } from './services/compactMapPointLayout';
  import {
    loadDeviceMapPoints,
    loadDeviceMapPointStatuses,
    type DeviceMapPointStatus,
  } from './services/deviceMapPointService';
  import { DEVICE_POINT_COMPACT_LAYOUT } from './mapSceneConfig';
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
  const selectedSensor = ref<SensorMapPoint | null>(null);
  const sensorPreviewVisible = ref(false);

  const cameraPopupVisible = ref(false);
  const selectedCameraRuntime = ref<CameraRuntimeInfo | null>(null);
  const cameraRuntimeLoading = ref(false);
  const cameraRuntimeError = ref('');
  let cameraRuntimeRequestId = 0;
  let devicePointRefreshTimer: number | undefined;
  let templateReloading = false;

  const isSysAdminMap = computed(() => userStore.getAuthority === Authority.SYS_ADMIN);
  const isCustomerUserMap = computed(() => userStore.getAuthority === Authority.CUSTOMER_USER);
  const assignedTemplateState = ref<AssignedTemplateState | null>(null);
  const currentAssignedTemplateDashboardId = ref('');
  const storageKey = computed(() => getMapWidgetStorageKey());
  const assignedTemplateMapPoints = computed(() => assignedTemplateState.value?.mapPoints || []);
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
    const dynamicEntityIds = new Set(dynamicPoints.map((point) => point.entityId).filter(Boolean));
    const manualOnlyPoints = manualPoints.filter((point) => !dynamicEntityIds.has(point.entityId));
    return [...dynamicPoints, ...manualOnlyPoints];
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
      deviceMapPoints.value = DEVICE_POINT_COMPACT_LAYOUT.enabled ? applyCompactModelLayout(points) : points;
    } catch (error) {
      console.warn('[MapHome] Failed to refresh device map points:', error);
    }
  }

  async function refreshAssignedTemplatePointStatuses() {
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

  async function refreshAssignedDashboardTemplate(dashboardId: string) {
    const normalizedDashboardId = String(dashboardId || '').trim();
    if (!normalizedDashboardId || templateReloading) return;

    templateReloading = true;
    try {
      const dashboard = await getDashboardById(normalizedDashboardId);
      assignedTemplateState.value = normalizeMapTemplateState(
        dashboard.configuration?.[DASHBOARD_MAP_WIDGET_CONFIG_KEY],
      );
      await refreshAssignedTemplatePointStatuses();
    } catch (error) {
      console.warn('[MapHome] Failed to refresh assigned dashboard template:', error);
    } finally {
      templateReloading = false;
    }
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

    const customerId = userStore.getUserInfo?.customerId?.id || '';
    const userId = userStore.getUserInfo?.id?.id || '';
    if (!customerId) {
      currentAssignedTemplateDashboardId.value = '';
      return;
    }

    try {
      const templates = await loadAssignedTemplateInfos(customerId);
      if (!templates.length) {
        clearSelectedMapTemplateId(userId);
        currentAssignedTemplateDashboardId.value = '';
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
