import * as Cesium from 'cesium';
import type { CameraMapPoint, MapPoint, SensorMapPoint } from './types/mapPointTypes';

export const EDITABLE_MAP_POINT_DELETE_ENTITY_ID = '__editable_map_point_delete__';
const EDITABLE_MAP_POINT_DATASOURCE_NAME = '__editable_map_point_editor__';
const DRAG_START_THRESHOLD = 4;

const HOVER_PICK_INTERVAL_MS = 80;
type UseMapPointEditorOptions = {
  getViewer: () => Cesium.Viewer | null | undefined;
  getPoints: () => MapPoint[];
  setPoints: (points: MapPoint[]) => void;
  getPointEntity?: (pointId: string) => Cesium.Entity | null | undefined;
  onPointClick?: (point: MapPoint) => void;
  onPointDelete?: (point: MapPoint) => void;
  onPointDragEnd?: (point: MapPoint) => void;
};

type CameraControllerState = {
  enableRotate: boolean;
  enableTranslate: boolean;
  enableZoom: boolean;
  enableTilt: boolean;
  enableLook: boolean;
};

function clonePoints(points: MapPoint[]) {
  return JSON.parse(JSON.stringify(points)) as MapPoint[];
}

function buildSensorBillboardImage(color = '#22c55e') {
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="8" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      </svg>
    `)
  );
}

function buildCameraBillboardImage(color: string) {
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="${color}22" />
        <circle cx="22" cy="22" r="14" fill="${color}" stroke="#ffffff" stroke-width="2.5"/>
        <path d="M15 18.5a2 2 0 0 1 2-2h8.3a2 2 0 0 1 2 2v1.2l3.5-2.1c.7-.4 1.5.1 1.5.9v7c0 .8-.8 1.3-1.5.9l-3.5-2.1v1.2a2 2 0 0 1-2 2H17a2 2 0 0 1-2-2v-7.2Z" fill="#ffffff"/>
      </svg>
    `)
  );
}

function buildDeleteBillboardImage() {
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="14" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
        <path d="M14 14l12 12M26 14 14 26" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `)
  );
}

function isOfflinePoint(point: { online?: boolean; statusText?: string; color?: string }) {
  const statusText = String(point.statusText || '').toLowerCase();
  if (statusText.includes('离线') || statusText.includes('offline')) return true;
  if (point.online === true || statusText.includes('在线') || statusText.includes('online')) return false;
  return true;
}

function getSensorColor(point: SensorMapPoint) {
  return isOfflinePoint(point) ? '#94a3b8' : '#38bdf8';
}

function getCameraColor(point: CameraMapPoint) {
  return isOfflinePoint(point) ? '#94a3b8' : '#22c55e';
}

function createPointPosition(point: MapPoint) {
  return Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, point.height ?? 0);
}

function getPointLabelText(point: MapPoint) {
  return point.entityName || point.name;
}

export function setEntityPointMeta(entity: Cesium.Entity, point: MapPoint) {
  entity.properties = new Cesium.PropertyBag({
    editablePoint: true,
    overlayType: point.type,
    pointId: point.id,
    pointName: point.name,
  });
}

export function getPointIdFromEntity(entity: Cesium.Entity | null | undefined) {
  if (!entity) return '';
  return String(entity.properties?.pointId?.getValue?.() ?? '');
}

export function isEditablePointEntity(entity: Cesium.Entity | null | undefined) {
  if (!entity) return false;
  if (String(entity.id) === EDITABLE_MAP_POINT_DELETE_ENTITY_ID) return false;
  return Boolean(entity.properties?.editablePoint?.getValue?.()) || Boolean(getPointIdFromEntity(entity));
}

export function useMapPointEditor(options: UseMapPointEditorOptions) {
  let dataSource: Cesium.CustomDataSource | null = null;
  let handler: Cesium.ScreenSpaceEventHandler | null = null;

  let hoveredPointId = '';
  let hoveredEntity: Cesium.Entity | null = null;
  let draggingPointId = '';
  let draggingEntity: Cesium.Entity | null = null;
  let draggingCartesian: Cesium.Cartesian3 | null = null;
  let pendingDragPosition: Cesium.Cartesian2 | null = null;
  let dragFrameId: number | null = null;
  let candidatePointId = '';
  let candidateEntity: Cesium.Entity | null = null;
  let downPosition: Cesium.Cartesian2 | null = null;
  let movedAfterDown = false;
  let suppressNextClick = false;
  let pendingHoverPosition: Cesium.Cartesian2 | null = null;
  let hoverPickTimer: number | null = null;
  let lastHoverPickAt = 0;
  let deleteButtonVisible = false;
  let cursorStyle = '';
  let cameraControllerState: CameraControllerState | null = null;
  let active = false;

  function getViewer() {
    return options.getViewer() || null;
  }

  function getEditableDataSource(viewer: Cesium.Viewer) {
    if (dataSource) return dataSource;
    dataSource = new Cesium.CustomDataSource(EDITABLE_MAP_POINT_DATASOURCE_NAME);
    viewer.dataSources.add(dataSource);
    return dataSource;
  }

  function getPointById(pointId: string) {
    return options.getPoints().find((point) => point.id === pointId) || null;
  }

  function getEntityByPointId(pointId: string) {
    return options.getPointEntity?.(pointId) || dataSource?.entities.getById(pointId) || null;
  }

  function getDeleteButtonEntity() {
    return dataSource?.entities.getById(EDITABLE_MAP_POINT_DELETE_ENTITY_ID) || null;
  }

  function resetEntityHighlight(entity: Cesium.Entity | null) {
    if (!entity?.billboard) return;
    entity.billboard.scale = new Cesium.ConstantProperty(1);
    if (entity.label) {
      entity.label.show = new Cesium.ConstantProperty(false);
      entity.label.scale = new Cesium.ConstantProperty(1);
      entity.label.backgroundColor = new Cesium.ConstantProperty(
        Cesium.Color.fromCssColorString('rgba(15, 23, 42, 0.85)'),
      );
    }
  }

  function applyEntityHighlight(entity: Cesium.Entity | null) {
    if (!entity?.billboard) return;
    entity.billboard.scale = new Cesium.ConstantProperty(1.28);
    if (entity.label) {
      entity.label.show = new Cesium.ConstantProperty(true);
      entity.label.scale = new Cesium.ConstantProperty(1.08);
      entity.label.backgroundColor = new Cesium.ConstantProperty(
        Cesium.Color.fromCssColorString('rgba(37, 99, 235, 0.88)'),
      );
    }
  }

  function setCursor(nextCursor: string) {
    if (cursorStyle === nextCursor) return;
    cursorStyle = nextCursor;

    const viewer = getViewer();
    if (viewer) {
      (viewer.container as HTMLElement).style.cursor = nextCursor;
    }
  }

  function hideDeleteButton() {
    if (!deleteButtonVisible) return;

    const deleteEntity = getDeleteButtonEntity();
    if (deleteEntity?.billboard) {
      deleteEntity.billboard.show = new Cesium.ConstantProperty(false);
    }
    deleteButtonVisible = false;
  }

  function showDeleteButton(targetEntity: Cesium.Entity) {
    const deleteEntity = getDeleteButtonEntity();
    if (!deleteEntity?.billboard) return;

    deleteEntity.position = targetEntity.position;
    if (!deleteButtonVisible) {
      deleteEntity.billboard.show = new Cesium.ConstantProperty(true);
      deleteButtonVisible = true;
    }
  }

  function clearHoverState() {
    if (hoveredEntity) {
      resetEntityHighlight(hoveredEntity);
    }
    hoveredPointId = '';
    hoveredEntity = null;
    hideDeleteButton();
    setCursor('');
  }

  function setHoverState(entity: Cesium.Entity | null) {
    if (!entity || !isEditablePointEntity(entity)) {
      clearHoverState();
      return;
    }

    const nextPointId = getPointIdFromEntity(entity);
    if (!nextPointId) {
      clearHoverState();
      return;
    }

    if (hoveredPointId === nextPointId) return;

    resetEntityHighlight(hoveredEntity);
    hoveredPointId = nextPointId;
    hoveredEntity = entity;
    applyEntityHighlight(entity);
    showDeleteButton(entity);
    setCursor('pointer');
  }

  function snapshotCameraController(viewer: Cesium.Viewer): CameraControllerState {
    const controller = viewer.scene.screenSpaceCameraController;
    return {
      enableRotate: controller.enableRotate,
      enableTranslate: controller.enableTranslate,
      enableZoom: controller.enableZoom,
      enableTilt: controller.enableTilt,
      enableLook: controller.enableLook,
    };
  }

  function disableCameraController(viewer: Cesium.Viewer) {
    const controller = viewer.scene.screenSpaceCameraController;
    cameraControllerState = snapshotCameraController(viewer);
    controller.enableRotate = false;
    controller.enableTranslate = false;
    controller.enableZoom = false;
    controller.enableTilt = false;
    controller.enableLook = false;
  }

  function restoreCameraController() {
    const viewer = getViewer();
    if (!viewer || !cameraControllerState) return;

    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableRotate = cameraControllerState.enableRotate;
    controller.enableTranslate = cameraControllerState.enableTranslate;
    controller.enableZoom = cameraControllerState.enableZoom;
    controller.enableTilt = cameraControllerState.enableTilt;
    controller.enableLook = cameraControllerState.enableLook;
    cameraControllerState = null;
  }

  function ensureDeleteButtonEntity(viewer: Cesium.Viewer) {
    const source = getEditableDataSource(viewer);
    const existing = source.entities.getById(EDITABLE_MAP_POINT_DELETE_ENTITY_ID);
    if (existing) return existing;

    return source.entities.add({
      id: EDITABLE_MAP_POINT_DELETE_ENTITY_ID,
      position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
      billboard: {
        image: buildDeleteBillboardImage(),
        width: 22,
        height: 22,
        show: false,
        pixelOffset: new Cesium.Cartesian2(22, -22),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  function createPointEntity(source: Cesium.CustomDataSource, point: MapPoint) {
    const isSensor = point.type === 'sensor';
    const sensorPoint = point as SensorMapPoint;
    const cameraPoint = point as CameraMapPoint;

    const entity = source.entities.add({
      id: point.id,
      name: point.name,
      position: createPointPosition(point),
      billboard: {
        image: isSensor
          ? buildSensorBillboardImage(getSensorColor(sensorPoint))
          : buildCameraBillboardImage(getCameraColor(cameraPoint)),
        width: isSensor ? 20 : 30,
        height: isSensor ? 20 : 30,
        scale: 1,
        verticalOrigin: isSensor ? Cesium.VerticalOrigin.CENTER : Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: getPointLabelText(point),
        font: '14px sans-serif',
        show: false,
        scale: 1,
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('rgba(15, 23, 42, 0.85)'),
        pixelOffset: new Cesium.Cartesian2(0, isSensor ? -26 : -38),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    setEntityPointMeta(entity, point);
    return entity;
  }

  function renderPoints() {
    if (!active) return;

    const viewer = getViewer();
    if (!viewer) return;

    const source = getEditableDataSource(viewer);
    const previousHoveredPointId = hoveredPointId;

    if (!options.getPointEntity) {
      source.entities.removeAll();
      options.getPoints().forEach((point) => {
        createPointEntity(source, point);
      });
    }

    ensureDeleteButtonEntity(viewer);

    hoveredPointId = '';
    hoveredEntity = null;

    if (previousHoveredPointId) {
      const entity = getEntityByPointId(previousHoveredPointId);
      if (entity) {
        setHoverState(entity);
      } else {
        clearHoverState();
      }
    } else {
      hideDeleteButton();
    }
  }

  function pickCartesian(position: Cesium.Cartesian2) {
    const viewer = getViewer();
    if (!viewer) return null;

    const ray = viewer.camera.getPickRay(position);
    if (!ray) return null;

    return viewer.scene.globe.pick(ray, viewer.scene) || null;
  }

  function updatePointEntityPosition(pointId: string, cartesian: Cesium.Cartesian3) {
    const entity = getEntityByPointId(pointId);
    if (!entity) return;

    if (entity.position instanceof Cesium.ConstantPositionProperty) {
      entity.position.setValue(cartesian);
    } else {
      entity.position = new Cesium.ConstantPositionProperty(cartesian);
    }

    draggingCartesian = cartesian;
  }

  function commitPointPosition(pointId: string, cartesian: Cesium.Cartesian3) {
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const nextPoints = clonePoints(options.getPoints());
    const target = nextPoints.find((point) => point.id === pointId);
    if (!target) return;

    target.longitude = Cesium.Math.toDegrees(cartographic.longitude);
    target.latitude = Cesium.Math.toDegrees(cartographic.latitude);
    target.height = cartographic.height ?? 0;

    options.setPoints(nextPoints);
  }

  function deleteHoveredPoint() {
    if (!hoveredPointId) return;

    const point = getPointById(hoveredPointId);
    if (point) {
      options.onPointDelete?.(point);
    } else {
      const nextPoints = options.getPoints().filter((item) => item.id !== hoveredPointId);
      options.setPoints(clonePoints(nextPoints));
    }

    clearHoverState();
    renderPoints();
  }

  function resolvePickedEntity(position: Cesium.Cartesian2) {
    const viewer = getViewer();
    if (!viewer) return null;

    const picked = viewer.scene.pick(position);
    const entity = picked?.id ? (picked.id as Cesium.Entity) : null;
    if (!entity) return null;
    if (String(entity.id) === EDITABLE_MAP_POINT_DELETE_ENTITY_ID || isEditablePointEntity(entity)) return entity;
    return null;
  }

  function cloneScreenPosition(position: Cesium.Cartesian2) {
    return new Cesium.Cartesian2(position.x, position.y);
  }

  function processHoverPick(position: Cesium.Cartesian2) {
    if (!active || draggingPointId) return;

    const viewer = getViewer();
    if (!viewer) return;

    const pickedEntity = resolvePickedEntity(position);
    if (pickedEntity && String(pickedEntity.id) === EDITABLE_MAP_POINT_DELETE_ENTITY_ID) {
      setCursor('pointer');
      return;
    }

    if (pickedEntity && isEditablePointEntity(pickedEntity)) {
      setHoverState(pickedEntity);
      return;
    }

    clearHoverState();
  }

  function cancelHoverPick() {
    if (hoverPickTimer !== null) {
      window.clearTimeout(hoverPickTimer);
      hoverPickTimer = null;
    }
    pendingHoverPosition = null;
  }

  function scheduleHoverPick(position: Cesium.Cartesian2) {
    pendingHoverPosition = cloneScreenPosition(position);
    if (hoverPickTimer !== null) return;

    const elapsed = window.performance.now() - lastHoverPickAt;
    const delay = Math.max(0, HOVER_PICK_INTERVAL_MS - elapsed);
    hoverPickTimer = window.setTimeout(() => {
      hoverPickTimer = null;
      const nextPosition = pendingHoverPosition;
      pendingHoverPosition = null;
      if (!nextPosition) return;

      lastHoverPickAt = window.performance.now();
      processHoverPick(nextPosition);
    }, delay);
  }

  function applyDragPosition(position: Cesium.Cartesian2) {
    if (!active || !draggingPointId || !draggingEntity) return;

    const cartesian = pickCartesian(position);
    if (cartesian) {
      updatePointEntityPosition(draggingPointId, cartesian);
    }
  }

  function cancelDragFrame() {
    if (dragFrameId !== null) {
      window.cancelAnimationFrame(dragFrameId);
      dragFrameId = null;
    }
    pendingDragPosition = null;
  }

  function scheduleDragPosition(position: Cesium.Cartesian2) {
    pendingDragPosition = cloneScreenPosition(position);
    if (dragFrameId !== null) return;

    dragFrameId = window.requestAnimationFrame(() => {
      dragFrameId = null;
      const nextPosition = pendingDragPosition;
      pendingDragPosition = null;
      if (nextPosition) {
        applyDragPosition(nextPosition);
      }
    });
  }

  function flushDragPosition(position?: Cesium.Cartesian2) {
    if (position) {
      pendingDragPosition = cloneScreenPosition(position);
    }
    if (dragFrameId !== null) {
      window.cancelAnimationFrame(dragFrameId);
      dragFrameId = null;
    }

    const nextPosition = pendingDragPosition;
    pendingDragPosition = null;
    if (nextPosition) {
      applyDragPosition(nextPosition);
    }
  }

  function bindEvents() {
    const viewer = getViewer();
    if (!viewer) return;

    handler?.destroy();
    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      const pickedEntity = resolvePickedEntity(movement.position);
      if (!pickedEntity || !isEditablePointEntity(pickedEntity)) {
        candidatePointId = '';
        candidateEntity = null;
        downPosition = null;
        return;
      }

      cancelHoverPick();
      candidatePointId = getPointIdFromEntity(pickedEntity);
      candidateEntity = pickedEntity;
      downPosition = movement.position;
      movedAfterDown = false;
      suppressNextClick = false;
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
      const viewerInstance = getViewer();
      if (!viewerInstance) return;

      if (draggingPointId && draggingEntity) {
        scheduleDragPosition(movement.endPosition);
        return;
      }

      if (candidatePointId && candidateEntity && downPosition) {
        const distance = Cesium.Cartesian2.distance(downPosition, movement.endPosition);
        if (distance >= DRAG_START_THRESHOLD) {
          draggingPointId = candidatePointId;
          draggingEntity = candidateEntity;
          draggingCartesian = null;
          movedAfterDown = true;
          suppressNextClick = true;
          disableCameraController(viewerInstance);
          cancelHoverPick();
          clearHoverState();
          scheduleDragPosition(movement.endPosition);
          return;
        }
      }

      scheduleHoverPick(movement.endPosition);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((movement: { position?: Cesium.Cartesian2 }) => {
      if (draggingPointId) {
        flushDragPosition(movement.position);
      } else {
        cancelDragFrame();
      }

      const draggedPointId = draggingPointId;
      const shouldEmitDragEnd = Boolean(draggedPointId && movedAfterDown);

      if (draggingPointId && movedAfterDown) {
        suppressNextClick = true;
      }

      if (shouldEmitDragEnd && draggedPointId && draggingCartesian) {
        commitPointPosition(draggedPointId, draggingCartesian);
      }

      if (shouldEmitDragEnd && draggedPointId) {
        const point = getPointById(draggedPointId);
        if (point) {
          options.onPointDragEnd?.(point);
        }
      }

      draggingPointId = '';
      draggingEntity = null;
      draggingCartesian = null;
      candidatePointId = '';
      candidateEntity = null;
      downPosition = null;
      movedAfterDown = false;
      restoreCameraController();
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }

      const pickedEntity = resolvePickedEntity(movement.position);
      if (!pickedEntity) return;

      if (String(pickedEntity.id) === EDITABLE_MAP_POINT_DELETE_ENTITY_ID) {
        deleteHoveredPoint();
        return;
      }

      if (!isEditablePointEntity(pickedEntity)) return;

      const pointId = getPointIdFromEntity(pickedEntity);
      const point = getPointById(pointId);
      if (point) {
        options.onPointClick?.(point);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function start() {
    const viewer = getViewer();
    if (!viewer || active) return;

    lastHoverPickAt = 0;
    deleteButtonVisible = false;
    cursorStyle = '';
    active = true;
    getEditableDataSource(viewer);
    ensureDeleteButtonEntity(viewer);
    renderPoints();
    bindEvents();
  }

  function removeDataSource() {
    const viewer = getViewer();
    if (!viewer || !dataSource) return;
    viewer.dataSources.remove(dataSource, true);
    dataSource = null;
  }

  function stop() {
    active = false;
    cancelHoverPick();
    cancelDragFrame();
    handler?.destroy();
    handler = null;
    clearHoverState();
    restoreCameraController();
    draggingPointId = '';
    draggingEntity = null;
    draggingCartesian = null;
    pendingDragPosition = null;
    candidatePointId = '';
    candidateEntity = null;
    downPosition = null;
    movedAfterDown = false;
    suppressNextClick = false;
    removeDataSource();
  }

  function destroy() {
    stop();
  }

  return {
    start,
    stop,
    destroy,
    renderPoints,
  };
}
