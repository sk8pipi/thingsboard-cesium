import type { MapPoint, MapPointLocation } from '../types/mapPointTypes';

export function usesTemplatePosition(point: Pick<MapPoint, 'modelAnchor' | 'positionSource'>): boolean {
  return Boolean(point.modelAnchor || point.positionSource === 'template');
}

export function mergeDeviceMapPoint(dynamicPoint: MapPoint, templatePoint: MapPoint): MapPoint {
  const useDeviceLocation = dynamicPoint.locationSource === 'deviceInfo' && !usesTemplatePosition(templatePoint);
  return {
    ...dynamicPoint,
    ...templatePoint,
    longitude: useDeviceLocation ? dynamicPoint.longitude : templatePoint.longitude,
    latitude: useDeviceLocation ? dynamicPoint.latitude : templatePoint.latitude,
    height: useDeviceLocation ? dynamicPoint.height : templatePoint.height,
    heightMode: useDeviceLocation ? dynamicPoint.heightMode : templatePoint.heightMode,
    locationSource: useDeviceLocation ? 'deviceInfo' : 'manual',
    online: dynamicPoint.online,
    statusText: dynamicPoint.statusText,
    color: dynamicPoint.color,
  } as MapPoint;
}

/** 遥测可以有与定位同名的 key，但不得覆盖模板身份、锚点或坐标。 */
export function mergePointRuntimeFields(point: MapPoint, runtime: Record<string, unknown>): MapPoint {
  return {
    ...point,
    ...runtime,
    id: point.id,
    type: point.type,
    name: point.name,
    entityType: point.entityType,
    entityId: point.entityId,
    entityName: point.entityName,
    longitude: point.longitude,
    latitude: point.latitude,
    height: point.height,
    heightMode: point.heightMode,
    locationSource: point.locationSource,
    positionSource: point.positionSource,
    deviceLocationSynced: point.deviceLocationSynced,
    modelAnchor: point.modelAnchor,
  } as MapPoint;
}

/** 统一选点保存计划：位置变化与遗留模型绑定需要同步，纯样式编辑无需重写坐标。 */
export function unifiedDeviceLocationWriteCandidates(points: MapPoint[], originals: MapPoint[]): MapPoint[] {
  const byDevice = new Map(originals.map((point) => [point.entityId, point]));
  const unique = new Map<string, MapPoint>();
  for (const point of points) {
    if (point.entityType !== 'DEVICE' || !point.entityId) continue;
    const original = byDevice.get(point.entityId);
    const changed = !original
      ? point.deviceLocationSynced !== true
      : original.longitude !== point.longitude ||
        original.latitude !== point.latitude ||
        (original.height ?? 0) !== (point.height ?? 0) ||
        original.heightMode !== point.heightMode;
    const unsynced =
      point.deviceLocationSynced === false ||
      (usesTemplatePosition(point) && point.deviceLocationSynced !== true && original?.deviceLocationSynced !== true);
    if (changed || unsynced) unique.set(point.entityId, point);
  }
  return [...unique.values()];
}

export function filterExcludedMapPoints<T extends MapPoint>(
  points: T[],
  excludedDeviceIds: readonly string[] = [],
): T[] {
  const excluded = new Set(excludedDeviceIds);
  return points.filter((point) => point.entityType !== 'DEVICE' || !excluded.has(point.entityId));
}

export function deviceLocationWriteCandidates(
  points: MapPoint[],
  originals: MapPoint[],
  restoredLocations: ReadonlyMap<string, MapPointLocation> = new Map(),
): MapPoint[] {
  const byId = new Map(originals.map((point) => [point.id, point]));
  const byDevice = new Map(
    originals.filter((point) => point.entityType === 'DEVICE').map((point) => [point.entityId, point]),
  );
  const same = (a: MapPointLocation, b: MapPointLocation) =>
    a.longitude === b.longitude && a.latitude === b.latitude && (a.height ?? 0) === (b.height ?? 0);
  return points.filter((point) => {
    if (point.entityType !== 'DEVICE' || !point.entityId || usesTemplatePosition(point)) return false;
    const original = byId.get(point.id) || byDevice.get(point.entityId);
    // 恢复时的读回位置是本次编辑的新基线；之后再拖动仍按原规则写回。
    const baseline = restoredLocations.get(point.id) || original;
    return !baseline || !same(baseline, point);
  });
}
