import { currentTenantDashboardList, getDashboardById } from '/@/api/tb/dashboard';
import { getMapDeviceLocation } from './mapDeviceLocationService';
import { sameDevicePosition, type DeviceLocation } from './globalDeviceLocation';
import type { MapPointLocation } from '../types/mapPointTypes';

export interface LocationInventoryEntry extends MapPointLocation {
  dashboardId: string;
  dashboardTitle: string;
  modelId?: string;
  pending: boolean;
}
export interface LocationInventory {
  devices: Record<string, { current: DeviceLocation | null; templates: LocationInventoryEntry[]; conflict: boolean }>;
  failures: string[];
  complete: boolean;
}

/** 只读、按页串行盘点，不保存完整模板/设备信息，不自动决定正确位置。 */
export async function inspectMapLocations(): Promise<LocationInventory> {
  const report: LocationInventory = { devices: {}, failures: [], complete: false };
  for (let page = 0; page < 1000; page++) {
    const dashboards = await currentTenantDashboardList({
      page,
      pageSize: 100,
      sortProperty: 'title',
      sortOrder: 'ASC',
    });
    for (const summary of dashboards.data) {
      try {
        const dashboard = await getDashboardById(summary.id.id);
        const template = dashboard.configuration?.__mapWidgetEditor;
        for (const point of template?.mapPoints || []) {
          if (point.entityType !== 'DEVICE' || !point.entityId || template.excludedDeviceIds?.includes(point.entityId))
            continue;
          const item = (report.devices[point.entityId] ||= { current: null, templates: [], conflict: false });
          item.templates.push({
            dashboardId: summary.id.id,
            dashboardTitle: summary.title || summary.id.id,
            longitude: point.longitude,
            latitude: point.latitude,
            height: point.height,
            heightMode: point.heightMode || 'absolute',
            modelId: point.modelAnchor?.modelId,
            pending: point.locationPending === true,
          });
        }
      } catch {
        report.failures.push(`模板 ${summary.id.id} 读取失败`);
      }
    }
    if (!dashboards.hasNext) {
      report.complete = true;
      break;
    }
  }
  for (const [id, item] of Object.entries(report.devices)) {
    try {
      item.current = await getMapDeviceLocation(id);
    } catch {
      report.failures.push(`设备 ${id} 位置读取失败`);
    }
    const baseline = item.current || item.templates[0];
    item.conflict =
      !item.current ||
      item.templates.some((entry) => entry.heightMode === 'relativeToGround' || !sameDevicePosition(entry, baseline));
  }
  if (report.failures.length) report.complete = false;
  return report;
}
