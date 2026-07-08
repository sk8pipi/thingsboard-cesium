import type { MapPoint, MapPointEntityType, SensorMapPoint } from './types/mapPointTypes';

const MAP_POINT_STORAGE_KEY = 'tb_cesium_map_points_v1';
const LEGACY_DEMO_POINT_IDS = new Set(['sensor-001', 'camera-virtual-oilwell-cam-001']);
const LEGACY_DEMO_ENTITY_IDS = new Set(['ebc28b50-fa92-11f0-9e65-5b493dc7d0de', 'virtual-oilwell-cam-001']);

function shouldKeepPoint(point: MapPoint) {
  return !LEGACY_DEMO_POINT_IDS.has(point.id) && !LEGACY_DEMO_ENTITY_IDS.has(point.entityId);
}

function normalizeMapPoint(point: unknown): MapPoint | null {
  if (!point || typeof point !== 'object') return null;

  const rawPoint = point as Record<string, unknown>;
  if (rawPoint.type !== 'sensor' && rawPoint.type !== 'camera') return null;

  const isCameraPoint = rawPoint.type === 'camera';
  const normalizedEntityId = String(
    (isCameraPoint ? rawPoint.cameraDeviceId : undefined) || rawPoint.entityId || '',
  ).trim();

  const basePoint = {
    id: String(rawPoint.id || ''),
    type: rawPoint.type,
    name: String(rawPoint.name || rawPoint.entityName || rawPoint.id || ''),
    longitude: Number(rawPoint.longitude ?? 0),
    latitude: Number(rawPoint.latitude ?? 0),
    height: Number.isFinite(Number(rawPoint.height)) ? Number(rawPoint.height) : undefined,
    heightMode: rawPoint.heightMode === 'relativeToGround' ? 'relativeToGround' : 'absolute',
    entityType: (isCameraPoint ? 'DEVICE' : String(rawPoint.entityType || 'DEVICE')) as MapPointEntityType,
    entityId: normalizedEntityId,
    entityName: String(rawPoint.entityName || rawPoint.name || ''),
    online: rawPoint.online === undefined ? undefined : Boolean(rawPoint.online),
    statusText: rawPoint.statusText ? String(rawPoint.statusText) : undefined,
    source: rawPoint.source === 'device' ? 'device' : 'manual',
    locationSource: ['deviceInfo', 'attribute', 'telemetry', 'manual'].includes(String(rawPoint.locationSource))
      ? (String(rawPoint.locationSource) as MapPoint['locationSource'])
      : rawPoint.source === 'device'
        ? undefined
        : 'manual',
    createdAt: Number(rawPoint.createdAt || Date.now()),
    updatedAt: Number(rawPoint.updatedAt || Date.now()),
  } as const;

  if (!basePoint.id || !basePoint.entityId) {
    return null;
  }

  if (rawPoint.type === 'sensor') {
    const datasource = (rawPoint.datasource || {}) as Record<string, unknown>;
    const datasourceKeys = Array.isArray(datasource.keys) ? datasource.keys : [];

    return {
      ...basePoint,
      type: 'sensor',
      color: rawPoint.color ? String(rawPoint.color) : undefined,
      sensorType: rawPoint.sensorType
        ? String(rawPoint.sensorType)
        : rawPoint.deviceType
          ? String(rawPoint.deviceType)
          : undefined,
      sensorStyleOverride:
        rawPoint.sensorStyleOverride && typeof rawPoint.sensorStyleOverride === 'object'
          ? (rawPoint.sensorStyleOverride as SensorMapPoint['sensorStyleOverride'])
          : undefined,
      description: rawPoint.description ? String(rawPoint.description) : undefined,
      popupWidgetIds: Array.isArray(rawPoint.popupWidgetIds) ? rawPoint.popupWidgetIds.map(String) : undefined,
      datasource: {
        entityType: String(datasource.entityType || basePoint.entityType) as NonNullable<
          SensorMapPoint['datasource']
        >['entityType'],
        entityId: String(datasource.entityId || basePoint.entityId),
        entityName: datasource.entityName ? String(datasource.entityName) : basePoint.entityName,
        pollMs: Number.isFinite(Number(datasource.pollMs)) ? Number(datasource.pollMs) : undefined,
        keys: datasourceKeys
          .map((key) => {
            if (!key || typeof key !== 'object') return null;

            const rawKey = key as Record<string, unknown>;
            return {
              name: String(rawKey.name || ''),
              type: String(rawKey.type || 'timeseries') as NonNullable<
                SensorMapPoint['datasource']
              >['keys'][number]['type'],
              label: rawKey.label ? String(rawKey.label) : undefined,
              units: rawKey.units ? String(rawKey.units) : undefined,
              color: rawKey.color ? String(rawKey.color) : undefined,
            };
          })
          .filter((key): key is NonNullable<typeof key> => Boolean(key?.name)),
      },
    };
  }

  return {
    ...basePoint,
    type: 'camera',
    entityType: 'DEVICE',
    color: rawPoint.color ? String(rawPoint.color) : undefined,
    description: rawPoint.description ? String(rawPoint.description) : undefined,
  };
}

export function getMapPointStorageKey() {
  return MAP_POINT_STORAGE_KEY;
}

export function loadMapPoints(): MapPoint[] {
  try {
    const raw = localStorage.getItem(MAP_POINT_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeMapPoint)
      .filter((point): point is MapPoint => Boolean(point))
      .filter(shouldKeepPoint);
  } catch {
    return [];
  }
}

export function saveMapPoints(points: MapPoint[]) {
  localStorage.setItem(MAP_POINT_STORAGE_KEY, JSON.stringify(points));
}

export function upsertMapPoint(point: MapPoint) {
  const points = loadMapPoints();
  const index = points.findIndex((item) => item.id === point.id);

  if (index >= 0) {
    points[index] = point;
  } else {
    points.push(point);
  }

  saveMapPoints(points);
}

export function removeMapPoint(pointId: string) {
  const points = loadMapPoints().filter((point) => point.id !== pointId);
  saveMapPoints(points);
}
