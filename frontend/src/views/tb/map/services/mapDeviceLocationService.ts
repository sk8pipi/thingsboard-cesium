import { defHttp } from '/@/utils/http/axios';
import { ContentTypeEnum } from '/@/enums/httpEnum';
import type { MapPoint } from '../types/mapPointTypes';
import { readDeviceLocation, type DeviceLocation } from './globalDeviceLocation';

export async function getMapDeviceLocation(deviceId: string): Promise<DeviceLocation | null> {
  const response = await defHttp.get<{ location: DeviceLocation | null }>({
    url: `/api/map-device/${encodeURIComponent(deviceId)}/location`,
  });
  return readDeviceLocation(response.location);
}

export async function saveMapDeviceLocation(point: MapPoint) {
  if (!Number.isSafeInteger(point.locationRevision) || point.locationRevision! < 0) {
    throw new Error('请先读取设备当前位置再保存');
  }
  const response = await defHttp.put<{ location: DeviceLocation; attributesSynced: boolean }>(
    {
      url: `/api/map-device/${encodeURIComponent(point.entityId)}/location`,
      headers: { 'content-type': ContentTypeEnum.JSON },
      data: {
        longitude: point.longitude,
        latitude: point.latitude,
        height: point.height ?? 0,
        expectedRevision: point.locationRevision,
      },
    },
    { errorMessageMode: 'none' },
  );
  const location = readDeviceLocation(response.location);
  if (!location) throw new Error('设备位置响应无效，请重新读取后重试');
  return { location, attributesSynced: response.attributesSynced === true };
}
