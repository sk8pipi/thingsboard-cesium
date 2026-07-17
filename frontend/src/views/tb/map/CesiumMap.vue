<template>
  <div ref="cesiumEl" class="cesium-container"></div>
</template>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import * as Cesium from 'cesium';
  import type { CameraMapPoint, MapPointLocation, SensorMapPoint } from './types/mapPointTypes';
  import { BASE_MODEL_ASSET_ID, BASE_MODEL_CENTER, MODEL_AUTO_FLY_VIEW } from './mapSceneConfig';
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
      hideBasePoints?: boolean;
      globeOnly?: boolean;
      sceneModels?: MapSceneModel[];
      enableSensorTypeStyles?: boolean;
      sensorTypeStylesIgnoreOffline?: boolean;
      sensorDeviceTypeStyles?: Record<string, SensorPointStyleOverride>;
      cameraStylesIgnoreOffline?: boolean;
    }>(),
    {
      sensorPoints: () => [],
      cameraPoints: () => [],
      flyToFirstSensor: false,
      flyToFirstCamera: false,
      mode: 'default',
      hideBasePoints: false,
      globeOnly: false,
      sceneModels: () => [],
      enableSensorTypeStyles: false,
      sensorTypeStylesIgnoreOffline: false,
      sensorDeviceTypeStyles: () => ({}),
      cameraStylesIgnoreOffline: false,
    },
  );

  const emit = defineEmits<{
    (e: 'sensor-click', payload: SensorMapPoint): void;
    (e: 'camera-click', payload: CameraMapPoint): void;
    (e: 'map-click', payload: Required<MapPointLocation>): void;
  }>();

  const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string;
  const cesiumEl = ref<HTMLDivElement | null>(null);

  let viewer: Cesium.Viewer | undefined;
  let tileset: Cesium.Cesium3DTileset | undefined;
  let sceneModelTilesets: Cesium.Cesium3DTileset[] = [];
  let sensorDataSource: Cesium.CustomDataSource | undefined;
  let cameraDataSource: Cesium.CustomDataSource | undefined;
  let clickHandler: Cesium.ScreenSpaceEventHandler | undefined;
  let hoverHandler: Cesium.ScreenSpaceEventHandler | undefined;
  let hoveredOverlayEntity: Cesium.Entity | null = null;
  let sensorRenderVersion = 0;
  let cameraRenderVersion = 0;
  const sensorLabelDistanceDisplayCondition = new Cesium.DistanceDisplayCondition(0, 1200);
  const cameraLabelDistanceDisplayCondition = new Cesium.DistanceDisplayCondition(0, 2500);

  function applyBasePointVisibility() {
    const visible = !props.hideBasePoints;
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

  function buildSensorBillboard(point: SensorMapPoint) {
    if (!props.enableSensorTypeStyles) {
      return buildCircleBillboard(getSensorColor(point));
    }

    const deviceType = getSensorDeviceType(point);
    const deviceTypeOverride = props.sensorDeviceTypeStyles?.[normalizeDeviceTypeStyleKey(deviceType)];
    const style = resolveSensorPointStyle({
      deviceType,
      pointId: point.id,
      deviceId: point.entityId,
      override: {
        ...(deviceTypeOverride || {}),
        ...(point.sensorStyleOverride || {}),
      },
    });

    return buildSensorPointBillboard(style, props.sensorTypeStylesIgnoreOffline || !isOfflinePoint(point));
  }

  function getSensorBillboardSize() {
    return props.enableSensorTypeStyles ? 38 : 20;
  }

  function getCameraColor(point: CameraMapPoint) {
    if (props.cameraStylesIgnoreOffline) return '#2EF527';
    return isOfflinePoint(point) ? '#94a3b8' : '#2EF527';
  }

  function buildCameraBillboard(point: CameraMapPoint) {
    const resolvedColor = getCameraColor(point);
    return (
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
          <defs>
            <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.28"/>
            </filter>
          </defs>
          <g filter="url(#shadow)">
            <circle cx="32" cy="32" r="25" fill="${resolvedColor}"/>
          </g>
          <svg x="15" y="15" width="34" height="34" viewBox="0 0 1024 1024">
            <path d="M907.712 642.592l-2.624-302.592-204.256 145.056 206.88 157.536z m-39.68-354.784a64 64 0 0 1 101.056 51.648l2.624 302.592a64 64 0 0 1-102.752 51.456l-206.912-157.536a64 64 0 0 1 1.728-103.104l204.256-145.056z" fill="#111827"/>
            <path d="M144 256a32 32 0 0 0-32 32v417.376a32 32 0 0 0 32 32h456.32a32 32 0 0 0 32-32V288a32 32 0 0 0-32-32H144z m0-64h456.32a96 96 0 0 1 96 96v417.376a96 96 0 0 1-96 96H144a96 96 0 0 1-96-96V288a96 96 0 0 1 96-96z" fill="#111827"/>
          </svg>
        </svg>
      `)
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

    sensorDataSource = new Cesium.CustomDataSource('sensor-points');
    cameraDataSource = new Cesium.CustomDataSource('camera-points');
    viewer.dataSources.add(sensorDataSource);
    viewer.dataSources.add(cameraDataSource);
    applyBasePointVisibility();
  }

  async function loadBaseTileset() {
    if (!viewer || props.globeOnly || props.sceneModels.length) return;

    try {
      tileset = await Cesium.Cesium3DTileset.fromIonAssetId(BASE_MODEL_ASSET_ID, {
        maximumScreenSpaceError: 16,
      });

      viewer.scene.primitives.add(tileset);

      const lon = BASE_MODEL_CENTER.longitude;
      const lat = BASE_MODEL_CENTER.latitude;
      const cartographic = Cesium.Cartographic.fromDegrees(lon, lat);
      const [sampled] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [cartographic]);
      const groundHeight = sampled.height ?? 0;

      tileset.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(
        Cesium.Cartesian3.fromDegrees(lon, lat, groundHeight + BASE_MODEL_CENTER.heightOffset),
        new Cesium.HeadingPitchRoll(0, 0, 0),
      );

      await viewer.flyTo(tileset, {
        offset: new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(-35),
          Math.max(100, tileset.boundingSphere.radius * 2),
        ),
      });
    } catch (error) {
      console.error('Failed to load tileset from ion:', error);
    }
  }

  function clearSceneModels() {
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
    if (!viewer) return;

    const lon = model.longitude;
    const lat = model.latitude;
    const heightOffset = model.heightOffset ?? model.height ?? 0;
    const cartographic = Cesium.Cartographic.fromDegrees(lon, lat);
    const [sampled] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [cartographic]);
    const groundHeight = sampled?.height ?? 0;

    tilesetInstance.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(
      Cesium.Cartesian3.fromDegrees(lon, lat, groundHeight + heightOffset),
      new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(model.heading ?? 0),
        Cesium.Math.toRadians(model.pitch ?? 0),
        Cesium.Math.toRadians(model.roll ?? 0),
      ),
    );
  }

  async function renderSceneModels(models: MapSceneModel[]) {
    if (!viewer || props.globeOnly) return;

    clearSceneModels();
    const visibleModels = models.filter((model) => model.visible !== false);
    for (const model of visibleModels) {
      try {
        const tilesetInstance = await createTilesetFromModel(model);
        if (!tilesetInstance || !viewer) continue;

        viewer.scene.primitives.add(tilesetInstance);
        await positionTileset(tilesetInstance, model);
        sceneModelTilesets.push(tilesetInstance);
      } catch (error) {
        console.error('Failed to load scene model:', model, error);
      }
    }

    if (visibleModels.length && sceneModelTilesets[0]) {
      await viewer.camera.flyTo({
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

  async function renderSensorPoints(points: SensorMapPoint[]) {
    if (!sensorDataSource) return;

    const renderVersion = ++sensorRenderVersion;
    const uniquePoints = uniquePointsById(points);
    sensorDataSource.entities.removeAll();
    const positions = await resolvePositions(uniquePoints, 2);
    if (renderVersion !== sensorRenderVersion || !sensorDataSource) return;

    uniquePoints.forEach((point, index) => {
      sensorDataSource?.entities.removeById(point.id);
      sensorDataSource?.entities.add({
        id: point.id,
        name: point.name,
        position: positions[index],
        billboard: {
          image: buildSensorBillboard(point),
          width: getSensorBillboardSize(),
          height: getSensorBillboardSize(),
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: getPointLabelText(point),
          font: '11px sans-serif',
          show: false,
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.6)'),
          pixelOffset: new Cesium.Cartesian2(0, -22),
          distanceDisplayCondition: sensorLabelDistanceDisplayCondition,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
  }

  async function renderCameraPoints(points: CameraMapPoint[]) {
    if (!cameraDataSource) return;

    const renderVersion = ++cameraRenderVersion;
    const uniquePoints = uniquePointsById(points);
    cameraDataSource.entities.removeAll();
    const positions = await resolvePositions(uniquePoints, 3);
    if (renderVersion !== cameraRenderVersion || !cameraDataSource) return;

    uniquePoints.forEach((point, index) => {
      cameraDataSource?.entities.removeById(point.id);
      cameraDataSource?.entities.add({
        id: point.id,
        name: point.name,
        position: positions[index],
        billboard: {
          image: buildCameraBillboard(point),
          width: getSensorBillboardSize(),
          height: getSensorBillboardSize(),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: getPointLabelText(point),
          font: '14px sans-serif',
          show: false,
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('rgba(15, 23, 42, 0.85)'),
          pixelOffset: new Cesium.Cartesian2(0, -38),
          distanceDisplayCondition: cameraLabelDistanceDisplayCondition,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
  }

  function flyToPoint(point: MapPointLocation) {
    if (!viewer) return;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, (point.height ?? 0) + 120),
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

    if (viewer.scene.pickPositionSupported) {
      const picked = viewer.scene.pickPosition(position);
      if (Cesium.defined(picked)) {
        cartesian = picked;
      }
    }

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

  function isEditorManagedPickEntity(entity: Cesium.Entity | null) {
    if (!entity) return false;
    if (String(entity.id) === '__editable_map_point_delete__') return true;
    const pointId = entity.properties?.pointId?.getValue?.();
    return typeof pointId === 'string' && pointId.length > 0;
  }

  function bindOverlayClick() {
    if (!viewer) return;

    clickHandler?.destroy();
    clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      if (!viewer) return;

      if (props.mode === 'pickPoint') {
        const picked = viewer.scene.pick(movement.position);
        const pickedEntity = picked?.id ? (picked.id as Cesium.Entity) : null;
        if (isEditorManagedPickEntity(pickedEntity)) {
          return;
        }

        const location = getPickedLocation(movement.position);
        if (location) {
          emit('map-click', location);
        }
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
  });

  onMounted(async () => {
    await createViewer();
    if (!props.globeOnly) {
      await loadBaseTileset();
      await renderSceneModels(props.sceneModels || []);
    }
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
  });

  watch(
    () => props.sensorPoints,
    async (value) => {
      if (!viewer) return;
      await renderSensorPoints(value || []);
      applyBasePointVisibility();
    },
    { deep: true },
  );

  watch(
    () => props.cameraPoints,
    async (value) => {
      if (!viewer) return;
      await renderCameraPoints(value || []);
      applyBasePointVisibility();
    },
    { deep: true },
  );
  watch(
    () => [
      props.enableSensorTypeStyles,
      props.sensorTypeStylesIgnoreOffline,
      JSON.stringify(props.sensorDeviceTypeStyles || {}),
    ],
    async () => {
      if (!viewer) return;
      await renderSensorPoints(props.sensorPoints || []);
      applyBasePointVisibility();
    },
  );

  watch(
    () => props.sceneModels,
    async (value) => {
      if (!viewer) return;
      await renderSceneModels(value || []);
    },
    { deep: true },
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
        clearOverlayHover();
      }
      bindOverlayClick();
      bindOverlayHover();
    },
  );

  onBeforeUnmount(() => {
    clickHandler?.destroy();
    clickHandler = undefined;
    hoverHandler?.destroy();
    hoverHandler = undefined;
    clearSceneModels();

    if (viewer && !viewer.isDestroyed()) {
      viewer.destroy();
    }

    viewer = undefined;
    tileset = undefined;
    sensorDataSource = undefined;
    cameraDataSource = undefined;
  });
</script>

<style scoped>
  .cesium-container {
    width: 100%;
    height: 100%;
    min-height: 600px;
  }
</style>
