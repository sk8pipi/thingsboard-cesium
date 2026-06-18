import type { EntityRef, Timewindow } from '../sdk/types';
import { getLatestTimeseries, getTimeseries } from '/@/api/tb/telemetry';

export async function fetchLatest(entity: EntityRef, keys: string[]) {
  const entityId = { entityType: entity.entityType, id: entity.id } as any;
  const keyStr = keys.join(',');
  return getLatestTimeseries(entityId, keyStr, false);
}

export async function fetchTimeseries(entity: EntityRef, keys: string[], tw: Timewindow) {
  const keyStr = keys.join(',');
  return getTimeseries({
    entityType: entity.entityType,
    entityId: entity.id,
    keys: keyStr,
    startTs: tw.startTs,
    endTs: tw.endTs,
    interval: tw.interval,
    limit: tw.limit,
    agg: tw.agg || 'AVG',
    orderBy: tw.orderBy || 'ASC',
    useStrictDataTypes: false,
  } as any);
}
