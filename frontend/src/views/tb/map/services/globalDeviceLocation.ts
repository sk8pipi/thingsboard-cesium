import type { MapPoint } from '../types/mapPointTypes';

export interface DeviceLocation {
  longitude: number;
  latitude: number;
  height: number;
  heightMode: 'absolute';
  revision: number;
  updatedTime: number;
  source: 'confirmed' | 'legacy';
}

export function readDeviceLocation(value: unknown): DeviceLocation | null {
  const v = value as DeviceLocation | undefined;
  if (
    !v ||
    ![v.longitude, v.latitude, v.height, v.revision, v.updatedTime].every(Number.isFinite) ||
    Math.abs(v.longitude) > 180 ||
    Math.abs(v.latitude) > 90 ||
    !Number.isSafeInteger(v.revision) ||
    v.revision < 0 ||
    v.heightMode !== 'absolute' ||
    !['confirmed', 'legacy'].includes(v.source)
  )
    return null;
  return {
    longitude: v.longitude,
    latitude: v.latitude,
    height: v.height,
    heightMode: 'absolute',
    revision: v.revision,
    updatedTime: v.updatedTime,
    source: v.source,
  };
}

export function sameDevicePosition(
  a: Pick<MapPoint, 'longitude' | 'latitude' | 'height'>,
  b: Pick<MapPoint, 'longitude' | 'latitude' | 'height'>,
) {
  return (
    Math.abs(a.longitude - b.longitude) < 1e-9 &&
    Math.abs(a.latitude - b.latitude) < 1e-9 &&
    Math.abs((a.height ?? 0) - (b.height ?? 0)) < 1e-4
  );
}

/** 只接受服务端保留字段；模板快照与遥测坐标不能成为正式位置。 */
export function applyDeviceLocation<T extends MapPoint>(point: T, value: unknown, preserveDraft = false): T {
  if (point.entityType !== 'DEVICE' || (preserveDraft && point.locationPending)) return point;
  const next = readDeviceLocation(value);
  const previous = readDeviceLocation(point.deviceLocation);
  const location = previous && (!next || previous.revision > next.revision) ? previous : next;
  if (!location)
    return {
      ...point,
      positionSource: 'device',
      locationPending: false,
      locationStatus: 'unavailable',
    };
  return {
    ...point,
    longitude: location.longitude,
    latitude: location.latitude,
    height: location.height,
    heightMode: 'absolute',
    deviceLocation: location,
    locationRevision: location.revision,
    positionSource: 'device',
    locationSource: 'deviceInfo',
    locationPending: false,
    deviceLocationSynced: true,
    locationStatus: next ? 'ready' : 'stale',
  } as T;
}

export function hasRenderableLocation(point: MapPoint) {
  return point.entityType !== 'DEVICE' || Boolean(point.locationPending || point.deviceLocation);
}

export function locationWriteCandidates(points: MapPoint[]) {
  return [
    ...new Map(
      points.filter((p) => p.entityType === 'DEVICE' && p.locationPending).map((p) => [p.entityId, p]),
    ).values(),
  ];
}

export function locationHasConflict(point: MapPoint, value: unknown) {
  const current = readDeviceLocation(value);
  return Boolean(
    point.locationPending &&
      current &&
      current.revision !== point.locationRevision &&
      !sameDevicePosition(point, current),
  );
}

/** 保存草稿可以持久化目标和基准版本，但不能持久化本页读缓存/错误状态。 */
export function serializeLocationPoint<T extends MapPoint>(point: T): T {
  const { deviceLocation: _location, locationStatus: _status, ...rest } = point;
  return rest as T;
}
