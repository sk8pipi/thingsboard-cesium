<template>
  <div class="cesium-shell">
    <div ref="cesiumEl" class="cesium-container"></div>
    <div v-if="anchorWarnings.length" class="anchor-warnings" role="status">
      <details
        ><summary>点位定位提示（{{ anchorWarnings.length }}）</summary>
        <div v-for="warning in anchorWarnings" :key="warning">{{ warning }}</div>
        <button type="button" @click="renderSceneModels(props.sceneModels)">重试加载模型</button>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { resolveProfilePointStyle, type DeviceProfileRules } from './services/deviceProfilePresentation';
  import { createProfileBillboardCache } from './services/profileBillboardCache';
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import * as Cesium from 'cesium';
  import type { CameraMapPoint, MapPointLocation, MapPickedLocation, SensorMapPoint } from './types/mapPointTypes';
  import { MODEL_AUTO_FLY_VIEW } from './mapSceneConfig';
  import {
    createModelAnchor,
    createModelPlacementMatrix,
    getEffectiveSceneModels,
    getModelRevision,
    resolveModelAnchor,
    worldToLocation,
    modelAnchorStatusText,
    type AnchoredLocation,
    type SceneModelRuntime,
  } from './services/mapModelAnchorService';
  import type { MapSceneModel } from './mapTemplateConfig';
  import {
    buildSensorPointBillboard,
    normalizeDeviceTypeStyleKey,
    resolveSensorDeviceType,
    resolveSensorPointStyle,
    type SensorPointStyleOverride,
  } from './services/sensorPointStyleService';

  type MapInteractionMode = 'default' | 'pickPoint';

  const props = withDefaults(
    defineProps<{
      sensorPoints?: SensorMapPoint[];
      cameraPoints?: CameraMapPoint[];
      flyToFirstSensor?: boolean;
      flyToFirstCamera?: boolean;
      mode?: MapInteractionMode;
      pickModelId?: string;
      hideBasePoints?: boolean;
      globeOnly?: boolean;
      sceneModels?: MapSceneModel[];
      enableSensorTypeStyles?: boolean;
      sensorTypeStylesIgnoreOffline?: boolean;
      deviceProfileStyles?: DeviceProfileRules;
      sensorDeviceTypeStyles?: Record<string, SensorPointStyleOverride>;
      cameraStylesIgnoreOffline?: boolean;
      resolutionScale?: number;
      screenScale?: number;
    }>(),
    {
      sensorPoints: () => [],
      cameraPoints: () => [],
      flyToFirstSensor: false,
      flyToFirstCamera: false,
      mode: 'default',
      pickModelId: '',
      hideBasePoints: false,
      globeOnly: false,
      sceneModels: () => [],
      enableSensorTypeStyles: false,
      sensorTypeStylesIgnoreOffline: false,
      sensorDeviceTypeStyles: () => ({}),
      deviceProfileStyles: () => ({}),
      cameraStylesIgnoreOffline: false,
      resolutionScale: 1,
      screenScale: 1,
    },
  );

  const emit = defineEmits<{
    (e: 'sensor-click', payload: SensorMapPoint): void;
    (e: 'camera-click', payload: CameraMapPoint): void;
    (e: 'map-click', payload: MapPickedLocation): void;
    (e: 'pick-error', message: string): void;
    (e: 'pick-start'): void;
  }>();

  const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string;
  const cesiumEl = ref<HTMLDivElement | null>(null);

  let viewer: Cesium.Viewer | undefined;
  let sceneModelTilesets: Cesium.Cesium3DTileset[] = [];
  const modelRuntimes = new Map<string, SceneModelRuntime>();
  const tilesetModelIds = new Map<Cesium.Cesium3DTileset, string>();
  const anchorWarnings = ref<string[]>([]);
  let modelLoadVersion = 0;
  let pickVersion = 0;
  let previewEntity: Cesium.Entity | undefined;
  let sensorDataSource: Cesium.CustomDataSource | undefined;
  let cameraDataSource: Cesium.CustomDataSource | undefined;
  let clickHandler: Cesium.ScreenSpaceEventHandler | undefined;
  let hoverHandler: Cesium.ScreenSpaceEventHandler | undefined;
  let hoveredOverlayEntity: Cesium.Entity | null = null;
  let sensorRenderVersion = 0;
  let cameraRenderVersion = 0;
  let resizeObserver: ResizeObserver | undefined;
  let resizeFrame = 0;
  const sensorLabelDistanceDisplayCondition = new Cesium.DistanceDisplayCondition(0, 1200);
  const cameraLabelDistanceDisplayCondition = new Cesium.DistanceDisplayCondition(0, 2500);

  function applyBasePointVisibility() {
    const visible = !props.hideBasePoints && !modelPickBusy;
    if (sensorDataSource) {
      sensorDataSource.show = visible;
    }
    if (cameraDataSource) {
      cameraDataSource.show = visible;
    }
  }

  function isOfflinePoint(point: { online?: boolean; statusText?: string; color?: string }) {
    const statusText = String(point.statusText || '').toLowerCase();
    if (statusText.includes('绂荤嚎') || statusText.includes('offline')) return true;
    if (point.online === true || statusText.includes('鍦ㄧ嚎') || statusText.includes('online')) return false;
    return true;
  }

  function getSensorColor(point: SensorMapPoint) {
    return isOfflinePoint(point) ? '#94a3b8' : '#38bdf8';
  }

  function buildCircleBillboard(color: string) {
    return (
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="8" fill="${color}" stroke="#ffffff" stroke-width="2"/>
        </svg>
      `)
    );
  }

  function getSensorDeviceType(point: SensorMapPoint) {
    return resolveSensorDeviceType(point);
  }

  let profileImageFrame = 0;
  const profileBillboards = createProfileBillboardCache(() => {
    if (profileImageFrame) return;
    profileImageFrame = requestAnimationFrame(() => {
      profileImageFrame = 0;
      if (viewer) {
        void renderSensorPoints(props.sensorPoints);
        void renderCameraPoints(props.cameraPoints);
      }
    });
  });
  function buildSensorBillboard(point: SensorMapPoint) {
    return profileBillboards.get(
      resolveProfilePointStyle(point, props.deviceProfileStyles),
      props.sensorTypeStylesIgnoreOffline || !isOfflinePoint(point),
    );
  }

  function getSensorBillboardSize() {
    return 38;
  }

  function getPointScreenScale() {
    return Math.min(1.4, Math.max(0.85, Number(props.screenScale) || 1));
  }

  function applyPointScreenScale() {
    const scale = new Cesium.ConstantProperty(getPointScreenScale());
    for (const entity of [...(sensorDataSource?.entities.values || []), ...(cameraDataSource?.entities.values || [])]) {
      if (entity.billboard) entity.billboard.scale = scale;
      if (entity.label) entity.label.scale = scale;
    }
    viewer?.scene.requestRender();
  }

  function getCameraColor(point: CameraMapPoint) {
    if (props.cameraStylesIgnoreOffline) return '#2EF527';
    return isOfflinePoint(point) ? '#94a3b8' : '#2EF527';
  }

  function buildCameraBillboard(point: CameraMapPoint) {
    return profileBillboards.get(
      resolveProfilePointStyle(point, props.deviceProfileStyles),
      props.cameraStylesIgnoreOffline || !isOfflinePoint(point),
    );
  }

  async function createViewer() {
    if (!cesiumEl.value) return;

    Cesium.Ion.defaultAccessToken = token;

    viewer = new Cesium.Viewer(cesiumEl.value, {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.resolutionScale = props.resolutionScale;

    sensorDataSource = new Cesium.CustomDataSource('sensor-points');
    cameraDataSource = new Cesium.CustomDataSource('camera-points');
    viewer.dataSources.add(sensorDataSource);
    viewer.dataSources.add(cameraDataSource);
    applyBasePointVisibility();
  }

  function resizeViewer() {
    if (!viewer || viewer.isDestroyed()) return;
    viewer.resolutionScale = props.resolutionScale;
    viewer.forceResize();
    viewer.scene.requestRender();
  }

  function scheduleViewerResize() {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      resizeViewer();
    });
  }

  function clearSceneModels() {
    modelRuntimes.clear();
    tilesetModelIds.clear();
    if (!viewer) {
      sceneModelTilesets = [];
      return;
    }

    sceneModelTilesets.forEach((item) => {
      try {
        viewer?.scene.primitives.remove(item);
      } catch {}
    });
    sceneModelTilesets = [];
  }

  async function createTilesetFromModel(model: MapSceneModel) {
    if (model.source === 'ion' && model.assetId) {
      return Cesium.Cesium3DTileset.fromIonAssetId(model.assetId, {
        maximumScreenSpaceError: 16,
      });
    }

    if (model.source === 'url' && model.url) {
      return Cesium.Cesium3DTileset.fromUrl(model.url, {
        maximumScreenSpaceError: 16,
      });
    }

    return null;
  }

  async function positionTileset(tilesetInstance: Cesium.Cesium3DTileset, model: MapSceneModel) {
    const activeViewer = viewer;
    if (!activeViewer) throw new Error('地图尚未就绪');
    const [sampled] = await Cesium.sampleTerrainMostDetailed(activeViewer.terrainProvider, [
      Cesium.Cartographic.fromDegrees(model.longitude, model.latitude),
    ]);
    if (!Number.isFinite(sampled?.height)) throw new Error('无法获取模型基准地形高度');
    const matrix = createModelPlacementMatrix(model, sampled.height);
    if (!tilesetInstance.isDestroyed()) tilesetInstance.modelMatrix = matrix;
    return matrix;
  }

  async function renderSceneModels(models: MapSceneModel[]) {
    const activeViewer = viewer;
    if (!activeViewer) return;
    const version = ++modelLoadVersion;
    clearPickPreview();
    clearSceneModels();
    const effectiveModels = getEffectiveSceneModels(models, props.globeOnly);
    effectiveModels.forEach((model) => modelRuntimes.set(model.id, { model: { ...model }, status: 'loading' }));
    await refreshAnchoredPoints();
    if (version !== modelLoadVersion || activeViewer.isDestroyed()) return;
    const visibleModels = effectiveModels.filter((model) => model.visible !== false);
    for (const model of visibleModels) {
      let instance: Cesium.Cesium3DTileset | null = null;
      try {
        instance = await createTilesetFromModel(model);
        if (!instance) throw new Error('模型资源未配置');
        if (version !== modelLoadVersion || activeViewer.isDestroyed()) {
          instance.destroy();
          return;
        }
        const matrix = await positionTileset(instance, model);
        if (version !== modelLoadVersion || activeViewer.isDestroyed()) {
          instance.destroy();
          return;
        }
        activeViewer.scene.primitives.add(instance);
        sceneModelTilesets.push(instance);
        tilesetModelIds.set(instance, model.id);
        modelRuntimes.set(model.id, { model: { ...model }, status: 'ready', matrix });
      } catch {
        if (instance && !instance.isDestroyed()) instance.destroy();
        if (version !== modelLoadVersion) return;
        modelRuntimes.set(model.id, { model: { ...model }, status: 'failed' });
        console.warn('Failed to load scene model:', model.id);
      }
      await refreshAnchoredPoints();
      if (version !== modelLoadVersion) return;
    }

    if (!models.length && sceneModelTilesets[0]) {
      const base = sceneModelTilesets[0];
      await activeViewer.flyTo(base, {
        offset: new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(-35),
          Math.max(100, base.boundingSphere.radius * 2),
        ),
      });
    } else if (visibleModels.length && sceneModelTilesets[0]) {
      await activeViewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          MODEL_AUTO_FLY_VIEW.longitude,
          MODEL_AUTO_FLY_VIEW.latitude,
          MODEL_AUTO_FLY_VIEW.height,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(MODEL_AUTO_FLY_VIEW.heading),
          pitch: Cesium.Math.toRadians(MODEL_AUTO_FLY_VIEW.pitch),
          roll: Cesium.Math.toRadians(MODEL_AUTO_FLY_VIEW.roll),
        },
        duration: MODEL_AUTO_FLY_VIEW.duration,
      });
    }
  }

  function getResolvedPointLocation(point: AnchoredLocation): MapPointLocation {
    return point.modelAnchor ? resolveModelAnchor(point, modelRuntimes).location : point;
  }

  function pointIsVisible(point: AnchoredLocation) {
    return !point.modelAnchor || resolveModelAnchor(point, modelRuntimes).visible;
  }

  function pointDepthDistance(point: AnchoredLocation) {
    return point.modelAnchor?.occlusion === 'physical' ? 0 : Number.POSITIVE_INFINITY;
  }

  function updateAnchorWarnings() {
    anchorWarnings.value = [...props.sensorPoints, ...props.cameraPoints].flatMap((point) => {
      if (!point.modelAnchor) return [];
      const { status } = resolveModelAnchor(point, modelRuntimes);
      return status === 'attached' ? [] : [`${point.name}：${modelAnchorStatusText(status)}`];
    });
  }

  async function refreshAnchoredPoints() {
    if (!viewer || viewer.isDestroyed()) return;
    await Promise.all([renderSensorPoints(props.sensorPoints), renderCameraPoints(props.cameraPoints)]);
    updateAnchorWarnings();
    viewer?.scene.requestRender();
  }

  async function resolvePositions<T extends MapPointLocation>(points: T[], defaultOffset: number) {
    if (!viewer || !points.length) return [] as Cesium.Cartesian3[];

    const positions = new Array<Cesium.Cartesian3>(points.length);
    const pointsNeedingTerrain = points
      .map((point, index) => ({ point, index }))
      .filter(
        ({ point }) =>
          point.heightMode === 'relativeToGround' ||
          point.height === undefined ||
          point.height === null ||
          Number.isNaN(point.height),
      );

    points.forEach((point, index) => {
      if (
        point.heightMode !== 'relativeToGround' &&
        point.height !== undefined &&
        point.height !== null &&
        !Number.isNaN(point.height)
      ) {
        positions[index] = Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, point.height);
      }
    });

    if (!pointsNeedingTerrain.length) {
      return positions;
    }

    const cartographics = pointsNeedingTerrain.map(({ point }) =>
      Cesium.Cartographic.fromDegrees(point.longitude, point.latitude),
    );

    try {
      const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartographics);
      pointsNeedingTerrain.forEach(({ point, index }, sampledIndex) => {
        const heightOffset =
          point.height !== undefined && point.height !== null && !Number.isNaN(point.height)
            ? point.height
            : defaultOffset;
        positions[index] = Cesium.Cartesian3.fromDegrees(
          point.longitude,
          point.latitude,
          (sampled[sampledIndex]?.height ?? 0) + heightOffset,
        );
      });

      return positions;
    } catch (error) {
      console.warn('Terrain sampling failed, falling back to raw coordinates.', error);
      pointsNeedingTerrain.forEach(({ point, index }) => {
        const heightOffset =
          point.height !== undefined && point.height !== null && !Number.isNaN(point.height)
            ? point.height
            : defaultOffset;
        positions[index] = Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, heightOffset);
      });

      return positions;
    }
  }

  function uniquePointsById<T extends { id: string }>(points: T[]) {
    const pointMap = new Map<string, T>();
    points.forEach((point) => {
      pointMap.set(point.id, point);
    });
    return Array.from(pointMap.values());
  }

  function getPointLabelText(point: SensorMapPoint | CameraMapPoint) {
    return point.entityName || point.name;
  }

  function setEntityLabelVisible(entity: Cesium.Entity | null, visible: boolean) {
    if (!entity?.label) return;
    entity.label.show = new Cesium.ConstantProperty(visible);
  }

  function clearOverlayHover() {
    setEntityLabelVisible(hoveredOverlayEntity, false);
    hoveredOverlayEntity = null;

    if (viewer) {
      (viewer.container as HTMLElement).style.cursor = '';
    }
  }

  function isEditableOverlayEntity(entity: Cesium.Entity | null) {
    if (!entity) return false;
    if (String(entity.id) === '__editable_map_point_delete__') return true;
    return Boolean(entity.properties?.editablePoint?.getValue?.());
  }

  function resolveBaseOverlayEntity(position: Cesium.Cartesian2) {
    if (!viewer) return null;

    const topPicked = viewer.scene.pick(position);
    const topEntity = topPicked?.id ? (topPicked.id as Cesium.Entity) : null;
    if (isEditableOverlayEntity(topEntity)) {
      return null;
    }

    const pickedObjects = viewer.scene.drillPick(position, 8);
    const pickedEntities = pickedObjects
      .map((picked) => (picked?.id ? (picked.id as Cesium.Entity) : null))
      .filter((entity): entity is Cesium.Entity => Boolean(entity));

    return (
      pickedEntities.find((entity) => {
        const entityId = String(entity.id);
        return Boolean(sensorDataSource?.entities.getById(entityId) || cameraDataSource?.entities.getById(entityId));
      }) || null
    );
  }

  const sensorRenderKeys = new Map<string, string>();
  async function renderSensorPoints(points: SensorMapPoint[]) {
    if (!sensorDataSource) return;

    const renderVersion = ++sensorRenderVersion;
    const allPoints = uniquePointsById(points);
    const wanted = new Set(allPoints.map((point) => point.id));
    for (const entity of [...sensorDataSource.entities.values])
      if (!wanted.has(entity.id)) {
        sensorDataSource.entities.removeById(entity.id);
        sensorRenderKeys.delete(entity.id);
      }
    const keys = new Map(
      allPoints.map((point) => [
        point.id,
        JSON.stringify([
          getResolvedPointLocation(point),
          point.modelAnchor,
          pointIsVisible(point),
          point.name,
          point.online,
          point.statusText,
          getPointLabelText(point),
          buildSensorBillboard(point),
        ]),
      ]),
    );
    const uniquePoints = allPoints.filter(
      (point) => sensorRenderKeys.get(point.id) !== keys.get(point.id) || !sensorDataSource?.entities.getById(point.id),
    );
    const positions = await resolvePositions(uniquePoints.map(getResolvedPointLocation), 2);
    if (renderVersion !== sensorRenderVersion || !sensorDataSource) return;

    uniquePoints.forEach((point, index) => {
      sensorRenderKeys.set(point.id, keys.get(point.id)!);
      sensorDataSource?.entities.removeById(point.id);
      sensorDataSource?.entities.add({
        id: point.id,
        name: point.name,
        show: pointIsVisible(point),
        position: positions[index],
        point: point.modelAnchor
          ? { pixelSize: 4, color: Cesium.Color.CYAN, disableDepthTestDistance: pointDepthDistance(point) }
          : undefined,
        billboard: {
          image: buildSensorBillboard(point),
          width: getSensorBillboardSize(),
          height: getSensorBillboardSize(),
          scale: getPointScreenScale(),
          verticalOrigin: point.modelAnchor ? Cesium.VerticalOrigin.BOTTOM : Cesium.VerticalOrigin.CENTER,
          pixelOffset: point.modelAnchor ? new Cesium.Cartesian2(0, -4) : Cesium.Cartesian2.ZERO,
          disableDepthTestDistance: pointDepthDistance(point),
        },
        label: {
          text: getPointLabelText(point),
          font: '11px sans-serif',
          scale: getPointScreenScale(),
          show: false,
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.6)'),
          pixelOffset: new Cesium.Cartesian2(0, -22),
          distanceDisplayCondition: sensorLabelDistanceDisplayCondition,
          disableDepthTestDistance: pointDepthDistance(point),
        },
        properties: {
          overlayType: 'sensor',
          pointId: point.id,
          name: point.name,
          longitude: point.longitude,
          latitude: point.latitude,
          height: point.height ?? 0,
          heightMode: point.heightMode || 'absolute',
          entityType: point.entityType,
          entityId: point.entityId,
          entityName: point.entityName,
          online: point.online,
          statusText: point.statusText || '',
          source: point.source || 'manual',
          color: point.color || '',
          deviceType: getSensorDeviceType(point),
          sensorStyleOverride: point.sensorStyleOverride ? JSON.stringify(point.sensorStyleOverride) : '',
          description: point.description || '',
          datasource: JSON.stringify(point.datasource || {}),
        },
      });
    });
    viewer?.scene.requestRender();
  }

  const cameraRenderKeys = new Map<string, string>();
  async function renderCameraPoints(points: CameraMapPoint[]) {
    if (!cameraDataSource) return;

    const renderVersion = ++cameraRenderVersion;
    const allPoints = uniquePointsById(points);
    const wanted = new Set(allPoints.map((point) => point.id));
    for (const entity of [...cameraDataSource.entities.values])
      if (!wanted.has(entity.id)) {
        cameraDataSource.entities.removeById(entity.id);
        cameraRenderKeys.delete(entity.id);
      }
    const keys = new Map(
      allPoints.map((point) => [
        point.id,
        JSON.stringify([
          getResolvedPointLocation(point),
          point.modelAnchor,
          pointIsVisible(point),
          point.name,
          point.online,
          point.statusText,
          getPointLabelText(point),
          buildCameraBillboard(point),
        ]),
      ]),
    );
    const uniquePoints = allPoints.filter(
      (point) => cameraRenderKeys.get(point.id) !== keys.get(point.id) || !cameraDataSource?.entities.getById(point.id),
    );
    const positions = await resolvePositions(uniquePoints.map(getResolvedPointLocation), 3);
    if (renderVersion !== cameraRenderVersion || !cameraDataSource) return;

    uniquePoints.forEach((point, index) => {
      cameraRenderKeys.set(point.id, keys.get(point.id)!);
      cameraDataSource?.entities.removeById(point.id);
      cameraDataSource?.entities.add({
        id: point.id,
        name: point.name,
        show: pointIsVisible(point),
        position: positions[index],
        point: point.modelAnchor
          ? { pixelSize: 4, color: Cesium.Color.CYAN, disableDepthTestDistance: pointDepthDistance(point) }
          : undefined,
        billboard: {
          image: buildCameraBillboard(point),
          width: getSensorBillboardSize(),
          height: getSensorBillboardSize(),
          scale: getPointScreenScale(),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: point.modelAnchor ? new Cesium.Cartesian2(0, -4) : Cesium.Cartesian2.ZERO,
          disableDepthTestDistance: pointDepthDistance(point),
        },
        label: {
          text: getPointLabelText(point),
          font: '14px sans-serif',
          scale: getPointScreenScale(),
          show: false,
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('rgba(15, 23, 42, 0.85)'),
          pixelOffset: new Cesium.Cartesian2(0, -38),
          distanceDisplayCondition: cameraLabelDistanceDisplayCondition,
          disableDepthTestDistance: pointDepthDistance(point),
        },
        properties: {
          overlayType: 'camera',
          pointId: point.id,
          name: point.name,
          longitude: point.longitude,
          latitude: point.latitude,
          height: point.height ?? 0,
          heightMode: point.heightMode || 'absolute',
          entityType: point.entityType,
          entityId: point.entityId,
          entityName: point.entityName,
          online: point.online,
          statusText: point.statusText || '',
          source: point.source || 'manual',
          color: point.color || '',
          description: point.description || '',
        },
      });
    });
    viewer?.scene.requestRender();
  }

  function flyToPoint(point: AnchoredLocation) {
    if (!viewer) return;
    const location = getResolvedPointLocation(point);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(location.longitude, location.latitude, (location.height ?? 0) + 120),
    });
  }

  async function flyToOverview() {
    if (!viewer) return;

    const pointEntities = [...(sensorDataSource?.entities.values || []), ...(cameraDataSource?.entities.values || [])];
    if (pointEntities.length) {
      await viewer.flyTo(pointEntities, { duration: 1.2 });
      return;
    }

    if (!props.globeOnly && sceneModelTilesets[0]) {
      await viewer.flyTo(sceneModelTilesets[0], { duration: 1.2 });
      return;
    }

    viewer.camera.flyHome(1.2);
  }

  function parseDatasource(rawValue: unknown) {
    if (!rawValue) return undefined;
    try {
      return JSON.parse(String(rawValue));
    } catch {
      return undefined;
    }
  }

  function toSensorPayload(entity: Cesium.Entity): SensorMapPoint {
    const point = props.sensorPoints.find((item) => item.id === String(entity.id));
    if (point) return { ...point, ...getResolvedPointLocation(point) };
    const datasource = parseDatasource(entity.properties?.datasource?.getValue?.());
    const sensorStyleOverride = parseDatasource(entity.properties?.sensorStyleOverride?.getValue?.());
    const timestamp = Date.now();

    return {
      id: String(entity.properties?.pointId?.getValue?.() ?? entity.id),
      type: 'sensor',
      name: String(entity.properties?.name?.getValue?.() ?? entity.name ?? ''),
      longitude: Number(entity.properties?.longitude?.getValue?.() ?? 0),
      latitude: Number(entity.properties?.latitude?.getValue?.() ?? 0),
      height: Number(entity.properties?.height?.getValue?.() ?? 0),
      heightMode: String(entity.properties?.heightMode?.getValue?.() ?? 'absolute') as SensorMapPoint['heightMode'],
      entityType: String(entity.properties?.entityType?.getValue?.() ?? 'DEVICE') as SensorMapPoint['entityType'],
      entityId: String(entity.properties?.entityId?.getValue?.() ?? ''),
      entityName: String(entity.properties?.entityName?.getValue?.() ?? entity.name ?? ''),
      online: Boolean(entity.properties?.online?.getValue?.() ?? false),
      statusText: String(entity.properties?.statusText?.getValue?.() ?? ''),
      source: String(entity.properties?.source?.getValue?.() ?? 'manual') as SensorMapPoint['source'],
      createdAt: timestamp,
      updatedAt: timestamp,
      color: String(entity.properties?.color?.getValue?.() ?? ''),
      deviceType: String(entity.properties?.deviceType?.getValue?.() ?? ''),
      sensorStyleOverride:
        sensorStyleOverride && typeof sensorStyleOverride === 'object'
          ? (sensorStyleOverride as SensorMapPoint['sensorStyleOverride'])
          : undefined,
      description: String(entity.properties?.description?.getValue?.() ?? ''),
      datasource: {
        entityType: String(datasource?.entityType || 'DEVICE') as NonNullable<
          SensorMapPoint['datasource']
        >['entityType'],
        entityId: String(datasource?.entityId || entity.properties?.entityId?.getValue?.() || ''),
        entityName: String(datasource?.entityName || entity.properties?.entityName?.getValue?.() || ''),
        keys: Array.isArray(datasource?.keys) ? datasource.keys : [],
        pollMs: Number(datasource?.pollMs || 2000),
      },
    };
  }

  function toCameraPayload(entity: Cesium.Entity): CameraMapPoint {
    const point = props.cameraPoints.find((item) => item.id === String(entity.id));
    if (point) return { ...point, ...getResolvedPointLocation(point) };
    const timestamp = Date.now();
    return {
      id: String(entity.properties?.pointId?.getValue?.() ?? entity.id),
      type: 'camera',
      name: String(entity.properties?.name?.getValue?.() ?? entity.name ?? ''),
      longitude: Number(entity.properties?.longitude?.getValue?.() ?? 0),
      latitude: Number(entity.properties?.latitude?.getValue?.() ?? 0),
      height: Number(entity.properties?.height?.getValue?.() ?? 0),
      heightMode: String(entity.properties?.heightMode?.getValue?.() ?? 'absolute') as CameraMapPoint['heightMode'],
      entityType: 'DEVICE',
      entityId: String(entity.properties?.entityId?.getValue?.() ?? ''),
      entityName: String(entity.properties?.entityName?.getValue?.() ?? entity.name ?? ''),
      online: Boolean(entity.properties?.online?.getValue?.() ?? false),
      statusText: String(entity.properties?.statusText?.getValue?.() ?? ''),
      source: String(entity.properties?.source?.getValue?.() ?? 'manual') as CameraMapPoint['source'],
      color: String(entity.properties?.color?.getValue?.() ?? ''),
      description: String(entity.properties?.description?.getValue?.() ?? ''),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  function getPickedLocation(position: Cesium.Cartesian2): Required<MapPointLocation> | null {
    if (!viewer) return null;

    let cartesian: Cesium.Cartesian3 | undefined;

    // 模型表面由统一拾取流程处理；地形路径不能使用图标或模型的深度。
    if (!cartesian) {
      const ray = viewer.camera.getPickRay(position);
      if (ray) {
        cartesian = viewer.scene.globe.pick(ray, viewer.scene) || undefined;
      }
    }

    if (!cartesian) return null;

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    return {
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      height: cartographic.height ?? 0,
      heightMode: 'absolute',
    };
  }

  function clearPickPreview() {
    ++pickVersion;
    if (previewEntity && viewer && !viewer.isDestroyed()) viewer.entities.remove(previewEntity);
    previewEntity = undefined;
    viewer?.scene.requestRender();
  }

  function isCurrentModelPick(location: MapPickedLocation) {
    if (modelPickBusy) return false;
    const anchor = location.modelAnchor;
    if (!anchor) return false;
    const runtime = modelRuntimes.get(anchor.modelId);
    if (
      !runtime ||
      runtime.status !== 'ready' ||
      runtime.model.visible === false ||
      getModelRevision(runtime.model) !== anchor.modelRevision
    )
      return false;
    const current = resolveModelAnchor(location, modelRuntimes);
    return (
      current.status === 'attached' &&
      Cesium.Cartesian3.distance(
        Cesium.Cartesian3.fromDegrees(current.location.longitude, current.location.latitude, current.location.height),
        Cesium.Cartesian3.fromDegrees(location.longitude, location.latitude, location.height),
      ) < 0.01
    );
  }

  function getPointAnchorStatus(point: AnchoredLocation) {
    return point.modelAnchor ? resolveModelAnchor(point, modelRuntimes).status : 'ground';
  }

  let modelPickBusy = false;
  async function pickModelSurface(position: Cesium.Cartesian2) {
    const activeViewer = viewer;
    if (!activeViewer || modelPickBusy) return;
    emit('pick-start');
    clearPickPreview();
    const targetId = props.pickModelId;
    const sceneVersion = modelLoadVersion;
    modelPickBusy = true;
    const version = pickVersion;
    const sourceSensor = sensorDataSource;
    const sourceCamera = cameraDataSource;
    try {
      if (sourceSensor) sourceSensor.show = false;
      if (sourceCamera) sourceCamera.show = false;
      // 必须等隐藏后的深度缓冲刷新，不能在同一帧中直接拾取。
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          remove();
          reject(new Error('画面尚未更新，请重试'));
        }, 1500);
        const remove = activeViewer.scene.postRender.addEventListener(() => {
          window.clearTimeout(timer);
          remove();
          resolve();
        });
        activeViewer.scene.requestRender();
      });
      if (
        version !== pickVersion ||
        activeViewer.isDestroyed() ||
        props.pickModelId !== targetId ||
        sceneVersion !== modelLoadVersion ||
        props.mode !== 'pickPoint'
      )
        return;
      const picked = activeViewer.scene.pick(position);
      const target = sceneModelTilesets.find((item) => picked?.primitive === item);
      let location: MapPickedLocation;
      if (target) {
        const modelId = tilesetModelIds.get(target);
        const runtime = modelId ? modelRuntimes.get(modelId) : undefined;
        if (targetId && modelId !== targetId) throw new Error('请点击所选模型的不透明表面');
        if (!activeViewer.scene.pickPositionSupported) throw new Error('当前环境不支持模型表面拾取');
        if (runtime?.status !== 'ready' || !runtime.matrix || runtime.model.visible === false || !target.tilesLoaded)
          throw new Error('模型尚未就绪，请靠近目标表面并等待加载完成');
        const world = activeViewer.scene.pickPosition(position);
        if (!Cesium.defined(world)) throw new Error('无法获取模型表面位置，请换一个视角重试');
        location = { ...worldToLocation(world), modelAnchor: createModelAnchor(runtime.model, runtime.matrix, world) };
      } else {
        if (targetId) throw new Error('请点击所选模型的不透明表面，不能选择地形或其他模型');
        if (picked && picked.primitive !== activeViewer.scene.globe)
          throw new Error('该对象不支持安装点位，请选择模型表面或地形');
        // 可见模型加载不完整时，空白像素可能是尚未出现的建筑，不能悄悄选到其下的地形。
        if (
          [...modelRuntimes.values()].some(
            (runtime) => runtime.model.visible !== false && runtime.status !== 'ready',
          ) ||
          sceneModelTilesets.some((tileset) => tileset.show && !tileset.tilesLoaded)
        )
          throw new Error('场景模型尚未就绪，请等待加载完成后再选点');
        const ground = getPickedLocation(position);
        if (!ground) throw new Error('没有选中有效位置，请点击模型表面或地形');
        location = ground;
      }
      const world = Cesium.Cartesian3.fromDegrees(location.longitude, location.latitude, location.height);
      previewEntity = activeViewer.entities.add({
        position: world,
        point: {
          pixelSize: 9,
          color: Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      emit('map-click', location);
    } catch (error) {
      if (version === pickVersion && !activeViewer.isDestroyed()) {
        emit('pick-error', error instanceof Error ? error.message : '模型表面拾取失败');
      }
    } finally {
      modelPickBusy = false;
      if (!activeViewer.isDestroyed()) {
        applyBasePointVisibility();
        activeViewer.scene.requestRender();
      }
    }
  }

  function bindOverlayClick() {
    if (!viewer) return;

    clickHandler?.destroy();
    clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      if (!viewer) return;

      if (props.mode === 'pickPoint') {
        void pickModelSurface(movement.position);
        return;
      }

      const picked = viewer.scene.pick(movement.position);
      if (!picked || !picked.id) return;

      const entity = picked.id as Cesium.Entity;
      const entityId = String(entity.id);

      const sensorTarget = sensorDataSource?.entities.getById(entityId);
      if (sensorTarget) {
        emit('sensor-click', toSensorPayload(sensorTarget));
        return;
      }

      const cameraTarget = cameraDataSource?.entities.getById(entityId);
      if (cameraTarget) {
        emit('camera-click', toCameraPayload(cameraTarget));
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function bindOverlayHover() {
    hoverHandler?.destroy();
    hoverHandler = undefined;
    if (!viewer || props.mode === 'pickPoint') return;

    hoverHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    hoverHandler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
      const entity = resolveBaseOverlayEntity(movement.endPosition);
      if (!entity) {
        clearOverlayHover();
        return;
      }

      if (hoveredOverlayEntity && hoveredOverlayEntity !== entity) {
        setEntityLabelVisible(hoveredOverlayEntity, false);
      }

      hoveredOverlayEntity = entity;
      setEntityLabelVisible(entity, true);

      if (viewer) {
        (viewer.container as HTMLElement).style.cursor = 'pointer';
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  function getPointEntity(pointId: string) {
    return sensorDataSource?.entities.getById(pointId) || cameraDataSource?.entities.getById(pointId) || null;
  }

  defineExpose({
    renderSensorPoints,
    renderCameraPoints,
    flyToPoint,
    flyToOverview,
    getViewer: () => viewer,
    getPointEntity,
    getResolvedPointLocation,
    clearPickPreview,
    isCurrentModelPick,
    getPointAnchorStatus,
  });

  onMounted(async () => {
    await createViewer();
    if (typeof ResizeObserver !== 'undefined' && cesiumEl.value) {
      resizeObserver = new ResizeObserver(scheduleViewerResize);
      resizeObserver.observe(cesiumEl.value);
    }
    await renderSceneModels(props.sceneModels || []);
    if (!viewer || viewer.isDestroyed()) return;
    await nextTick();
    await renderSensorPoints(props.sensorPoints || []);
    await renderCameraPoints(props.cameraPoints || []);
    applyBasePointVisibility();

    if (props.flyToFirstSensor && props.sensorPoints.length > 0) {
      flyToPoint(props.sensorPoints[0]);
    } else if (props.flyToFirstCamera && props.cameraPoints.length > 0) {
      flyToPoint(props.cameraPoints[0]);
    }

    bindOverlayClick();
    bindOverlayHover();
    scheduleViewerResize();
  });

  watch(
    () => props.resolutionScale,
    () => scheduleViewerResize(),
  );

  watch(
    () => props.screenScale,
    () => applyPointScreenScale(),
  );

  watch(
    () => props.sensorPoints,
    async (value) => {
      if (!viewer) return;
      await renderSensorPoints(value || []);
      applyBasePointVisibility();
      updateAnchorWarnings();
    },
    { deep: true },
  );

  watch(
    () => props.cameraPoints,
    async (value) => {
      if (!viewer) return;
      await renderCameraPoints(value || []);
      applyBasePointVisibility();
      updateAnchorWarnings();
    },
    { deep: true },
  );
  watch(
    () => [
      props.enableSensorTypeStyles,
      props.sensorTypeStylesIgnoreOffline,
      JSON.stringify(props.deviceProfileStyles || {}),
    ],
    async () => {
      if (!viewer) return;
      await renderSensorPoints(props.sensorPoints || []);
      await renderCameraPoints(props.cameraPoints || []);
      applyBasePointVisibility();
    },
  );

  watch(
    () => JSON.stringify([props.sceneModels, props.globeOnly]),
    async () => {
      if (!viewer) return;
      await renderSceneModels(props.sceneModels || []);
    },
    { flush: 'sync' },
  );

  watch(
    () => props.hideBasePoints,
    () => {
      applyBasePointVisibility();
    },
  );

  watch(
    () => props.mode,
    (mode) => {
      if (mode === 'pickPoint') {
        clearPickPreview();
        clearOverlayHover();
      } else {
        // 保留已选候选点供确认弹窗预览，但终止尚未完成的拾取。
        ++pickVersion;
      }
      bindOverlayClick();
      bindOverlayHover();
    },
  );

  watch(() => props.pickModelId, clearPickPreview);

  onBeforeUnmount(() => {
    profileBillboards.dispose();
    if (profileImageFrame) cancelAnimationFrame(profileImageFrame);
    ++modelLoadVersion;
    ++sensorRenderVersion;
    ++cameraRenderVersion;
    clearPickPreview();
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
    clickHandler?.destroy();
    clickHandler = undefined;
    hoverHandler?.destroy();
    hoverHandler = undefined;
    clearSceneModels();

    if (viewer && !viewer.isDestroyed()) {
      viewer.destroy();
    }

    viewer = undefined;
    sensorDataSource = undefined;
    cameraDataSource = undefined;
  });
</script>

<style scoped>
  .cesium-shell {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .anchor-warnings {
    position: absolute;
    top: calc(var(--map-top-bar-offset, 56px) + 12px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    max-width: 380px;
    max-height: 160px;
    overflow: auto;
    padding: 8px 12px;
    border-radius: 6px;
    background: #172332e8;
    color: #fde68a;
    font-size: 12px;
  }
  .cesium-container {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
</style>
