import { getAttributes, getLatestTimeseries, type TsKvEntity, type kvEntity } from '/@/api/tb/telemetry';
import { getDeviceInfoById, type DeviceInfo } from '/@/api/tb/device';
import { EntityType } from '/@/enums/entityTypeEnum';
import type { CameraMapPoint, MapPoint, SensorMapPoint } from '../types/mapPointTypes';

export type DeviceNodeKind = 'sensor' | 'camera';
export type DeviceMapPointStatus = {
  entityId: string;
  online: boolean;
  statusText: string;
};

export interface DeviceMapPointLoadOptions {
  pageSize?: number;
  maxPages?: number;
  concurrency?: number;
  fetchDevices: (params: {
    pageSize: number;
    page: number;
    sortProperty: string;
    sortOrder: 'ASC' | 'DESC';
  }) => Promise<{ data: DeviceInfo[]; hasNext?: boolean }>;
  permissionFilter?: (device: DeviceInfo) => boolean;
}

type DeviceTelemetryState = Record<string, unknown>;

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 200;
const DEFAULT_CONCURRENCY = 8;

const LOCATION_KEYS = ['lat', 'lon', 'lng', 'latitude', 'longitude', 'height', 'alt', 'altitude'];
const STATUS_KEYS = ['online', 'active', 'status', 'lastActivityTime'];
const NODE_KIND_KEYS = ['nodeType', 'nodeKind', 'deviceKind', 'deviceType', 'category', 'type'];
const DEVICE_TELEMETRY_KEYS = [...LOCATION_KEYS, ...STATUS_KEYS, ...NODE_KIND_KEYS].join(',');

function extractLastValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;

  if (Array.isArray(value)) {
    if (!value.length) return undefined;
    return extractLastValue(value[value.length - 1]);
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('value' in record) return record.value;
    if ('latestValue' in record) return record.latestValue;
    if ('v' in record) return record.v;
    if ('data' in record) return extractLastValue(record.data);
  }

  return value;
}

function kvListToObject(list: kvEntity[]) {
  return (list || []).reduce<Record<string, unknown>>((result, item) => {
    const key = String(item?.key || '').trim();
    if (key) {
      result[key] = item?.value;
    }
    return result;
  }, {});
}

function telemetryToObject(input: TsKvEntity | Record<string, unknown>) {
  return Object.entries(input || {}).reduce<Record<string, unknown>>((result, [key, value]) => {
    const latestValue = extractLastValue(value);
    if (latestValue !== undefined) {
      result[key] = latestValue;
    }
    return result;
  }, {});
}

function readFirstValue(source: DeviceTelemetryState, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'online', 'on', 'active'].includes(normalized)) return true;
  if (['false', '0', 'no', 'offline', 'off', 'inactive'].includes(normalized)) return false;
  return undefined;
}

function hasKeyword(value: unknown, keywords: string[]) {
  const normalized = String(value || '').toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function resolveNodeKind(device: DeviceInfo, state: DeviceTelemetryState): DeviceNodeKind {
  const candidates = [
    readFirstValue(state, NODE_KIND_KEYS),
    device.type,
    device.label,
    device.deviceProfileName,
    device.name,
  ];

  if (candidates.some((value) => hasKeyword(value, ['camera', 'monitor', 'video', '摄像', '监控', '视频']))) {
    return 'camera';
  }

  return 'sensor';
}

function resolveDeviceStatus(device: DeviceInfo, state: DeviceTelemetryState) {
  const deviceActive = typeof device.active === 'boolean' ? device.active : undefined;
  const explicitOnline = toBoolean(readFirstValue(state, ['online', 'status']));
  const legacyActive = toBoolean(readFirstValue(state, ['active']));
  const online = deviceActive === false ? false : (explicitOnline ?? deviceActive ?? legacyActive ?? false);

  return {
    online,
    statusText: online ? '在线' : '离线',
  };
}

function resolveLocation(state: DeviceTelemetryState) {
  const latitude = toNumber(readFirstValue(state, ['lat', 'latitude']));
  const longitude = toNumber(readFirstValue(state, ['lon', 'lng', 'longitude']));
  const height = toNumber(readFirstValue(state, ['height', 'alt', 'altitude']));

  if (latitude === undefined || longitude === undefined) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return { latitude, longitude, height };
}

function toMapPoint(device: DeviceInfo, state: DeviceTelemetryState): MapPoint | null {
  const location = resolveLocation(state);
  if (!location || !device.id?.id) return null;

  const timestamp = Date.now();
  const nodeKind = resolveNodeKind(device, state);
  const status = resolveDeviceStatus(device, state);
  const base = {
    id: `device-${device.id.id}`,
    name: device.label || device.name || device.id.id,
    longitude: location.longitude,
    latitude: location.latitude,
    height: location.height,
    entityType: 'DEVICE' as const,
    entityId: device.id.id,
    entityName: device.name || device.label || device.id.id,
    online: status.online,
    statusText: status.statusText,
    source: 'device' as const,
    createdAt: device.createdTime || timestamp,
    updatedAt: timestamp,
  };

  if (nodeKind === 'camera') {
    return {
      ...base,
      type: 'camera',
      color: status.online ? 'green' : 'gray',
      description: device.deviceProfileName || device.type || '',
    } satisfies CameraMapPoint;
  }

  return {
    ...base,
    type: 'sensor',
    color: status.online ? 'blue' : 'gray',
    description: device.deviceProfileName || device.type || '',
    datasource: {
      entityType: 'DEVICE',
      entityId: device.id.id,
      entityName: device.name || device.label || device.id.id,
      keys: [],
      pollMs: 30000,
    },
  } satisfies SensorMapPoint;
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const itemMap = new Map<string, T>();
  items.forEach((item) => {
    const key = getKey(item);
    if (key) {
      itemMap.set(key, item);
    }
  });
  return Array.from(itemMap.values());
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function loadAllDevices(options: DeviceMapPointLoadOptions) {
  const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages || DEFAULT_MAX_PAGES;
  const devices: DeviceInfo[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const result = await options.fetchDevices({
      page,
      pageSize,
      sortProperty: 'name',
      sortOrder: 'ASC',
    });

    devices.push(...(result.data || []));

    if (!result.hasNext) {
      break;
    }
  }

  const uniqueDevices = uniqueBy(devices, (device) => device.id?.id || '');
  return options.permissionFilter ? uniqueDevices.filter(options.permissionFilter) : uniqueDevices;
}

async function loadDeviceState(device: DeviceInfo) {
  const entityId = { entityType: EntityType.DEVICE, id: device.id.id } as any;
  const [attributesResult, telemetryResult] = await Promise.allSettled([
    getAttributes(entityId, DEVICE_TELEMETRY_KEYS),
    getLatestTimeseries(entityId, DEVICE_TELEMETRY_KEYS, true),
  ]);

  return {
    ...kvListToObject(attributesResult.status === 'fulfilled' ? attributesResult.value : []),
    ...telemetryToObject(telemetryResult.status === 'fulfilled' ? telemetryResult.value : {}),
  };
}

export async function loadDeviceMapPoints(options: DeviceMapPointLoadOptions): Promise<MapPoint[]> {
  const devices = await loadAllDevices(options);
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;

  const points = await mapWithConcurrency(devices, concurrency, async (device) => {
    try {
      const state = await loadDeviceState(device);
      return toMapPoint(device, state);
    } catch (error) {
      console.warn('[deviceMapPointService] Failed to load device map point:', device.id?.id, error);
      return null;
    }
  });

  return uniqueBy(
    points.filter((point): point is MapPoint => Boolean(point)),
    (point) => point.id,
  );
}

export async function loadDeviceMapPointStatuses(deviceIds: string[], concurrency = DEFAULT_CONCURRENCY) {
  const uniqueDeviceIds = Array.from(new Set(deviceIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const statuses = await mapWithConcurrency(uniqueDeviceIds, concurrency, async (deviceId) => {
    try {
      const device = await getDeviceInfoById(deviceId);
      const state = await loadDeviceState(device);
      const status = resolveDeviceStatus(device, state);
      return {
        entityId: deviceId,
        online: status.online,
        statusText: status.statusText,
      } satisfies DeviceMapPointStatus;
    } catch (error) {
      console.warn('[deviceMapPointService] Failed to load device status:', deviceId, error);
      return null;
    }
  });

  return statuses.filter((status): status is DeviceMapPointStatus => Boolean(status));
}
