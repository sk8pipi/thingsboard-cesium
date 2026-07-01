import { getDeviceInfoById, type DeviceInfo } from '/@/api/tb/device';
import { normalizeMapTemplateState, type MapTemplateState } from './mapTemplateConfig';

export type MapTemplateDeviceRef = {
  deviceId: string;
  deviceName: string;
};

export type MapTemplateDeviceAccess = {
  ref: MapTemplateDeviceRef;
  device?: DeviceInfo;
  error?: unknown;
};

function normalizeEntityId(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id?: unknown }).id || '').trim();
  }
  return '';
}

export function collectMapTemplateDeviceRefs(state?: Partial<MapTemplateState> | null): MapTemplateDeviceRef[] {
  const refs = new Map<string, MapTemplateDeviceRef>();

  const addDevice = (deviceIdValue: unknown, deviceNameValue?: unknown) => {
    const deviceId = normalizeEntityId(deviceIdValue);
    if (!deviceId) return;
    const deviceName = String(deviceNameValue || '').trim();
    const previous = refs.get(deviceId);
    refs.set(deviceId, {
      deviceId,
      deviceName: previous?.deviceName || deviceName || deviceId,
    });
  };

  const addDatasource = (datasource: any, fallbackName?: string) => {
    if (!datasource || typeof datasource !== 'object') return;
    const entityType = String(datasource.entityType || datasource.type || '').toUpperCase();
    if (entityType !== 'DEVICE') return;
    addDevice(datasource.entityId ?? datasource.id, datasource.entityName || datasource.name || fallbackName);
  };

  const addWidget = (widget: any, fallbackName?: string) => {
    if (!widget || typeof widget !== 'object') return;
    addDatasource(widget.datasource, fallbackName);
    addDatasource(widget.config?.datasource, fallbackName);
    (Array.isArray(widget.datasources) ? widget.datasources : []).forEach((item: any) =>
      addDatasource(item, fallbackName),
    );
    (Array.isArray(widget.config?.datasources) ? widget.config.datasources : []).forEach((item: any) =>
      addDatasource(item, fallbackName),
    );
  };

  const normalized = normalizeMapTemplateState(state);
  normalized.mapPoints.forEach((point) => {
    if (point.entityType === 'DEVICE') addDevice(point.entityId, point.entityName || point.name);
    addDatasource((point as any).datasource, point.entityName || point.name);
  });
  Object.values(normalized.widgets).forEach((widget: any) => addWidget(widget, widget?.title));
  Object.values(normalized.sensorPopupBindings).forEach((widgets) => {
    (Array.isArray(widgets) ? widgets : []).forEach((widget: any) => addWidget(widget, widget?.title));
  });

  return Array.from(refs.values());
}

export async function inspectMapTemplateDeviceAccess(
  state?: Partial<MapTemplateState> | null,
): Promise<MapTemplateDeviceAccess[]> {
  const refs = collectMapTemplateDeviceRefs(state);
  const results = await Promise.allSettled(refs.map((ref) => getDeviceInfoById(ref.deviceId)));
  return refs.map((ref, index) => {
    const result = results[index];
    if (result.status === 'fulfilled') {
      return {
        ref: { ...ref, deviceName: result.value.name || ref.deviceName },
        device: result.value,
      };
    }
    return { ref, error: result.reason };
  });
}

export function formatTemplateDeviceNames(items: Array<MapTemplateDeviceRef | MapTemplateDeviceAccess>) {
  return items
    .map((item) => ('ref' in item ? item.ref : item))
    .map((ref) => `${ref.deviceName}（${ref.deviceId}）`)
    .join('、');
}

export function isUnassignedCustomerId(customerId?: string) {
  return !customerId || customerId === '00000000-0000-0000-0000-000000000000';
}
