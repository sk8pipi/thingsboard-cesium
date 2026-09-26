import type { AlarmCountQuery, EntityCountQuery } from '/@/api/model/entityQuery';
import type { NativeCountSettings } from './nativeWidgetTypes';

const statuses = ['ACTIVE', 'CLEARED', 'ACK', 'UNACK'];
const severities = ['CRITICAL', 'MAJOR', 'MINOR', 'WARNING', 'INDETERMINATE'];

export function validateNativeCount(settings: NativeCountSettings, fqn: string): string[] {
  const errors: string[] = [];
  if (settings.kind !== (fqn === 'alarm_count' ? 'alarm' : 'entity')) errors.push('计数类别与原生部件不一致');
  if (!['ALL', 'DEVICE', 'ASSET'].includes(settings.entityType)) errors.push('实体类型无效');
  if (settings.kind === 'entity' && settings.entityType === 'ALL') errors.push('实体计数请选择设备或资产');
  if (settings.nameFilter && settings.entityType === 'ALL' && !settings.singleEntityId)
    errors.push('名称筛选需要选择实体类型');
  if (settings.singleEntityId && settings.entityType !== 'DEVICE') errors.push('点位计数只支持当前设备');
  if (!Array.isArray(settings.statusList) || settings.statusList.some((value) => !statuses.includes(value)))
    errors.push('告警状态无效');
  if (!Array.isArray(settings.severityList) || settings.severityList.some((value) => !severities.includes(value)))
    errors.push('告警等级无效');
  if (!Number.isInteger(settings.timeWindowMs) || settings.timeWindowMs < 0 || settings.timeWindowMs > 31 * 86400000)
    errors.push('告警时间范围须为 0–31 天');
  if (settings.showLabel && !settings.label?.trim()) errors.push('请填写计数标签');
  if (!['row', 'column'].includes(settings.layout)) errors.push('计数布局无效');
  if (!Number.isFinite(settings.iconSize) || settings.iconSize < 8 || settings.iconSize > 96)
    errors.push('图标字号须为 8–96');
  if (!Number.isFinite(settings.valueFontSize) || settings.valueFontSize < 8 || settings.valueFontSize > 96)
    errors.push('数字字号须为 8–96');
  return errors;
}

function entityFilter(settings: NativeCountSettings) {
  if (settings.singleEntityId)
    return {
      type: 'singleEntity' as const,
      singleEntity: { entityType: 'DEVICE' as const, id: settings.singleEntityId },
    };
  if (settings.entityType === 'ALL') return undefined;
  if (settings.nameFilter.trim())
    return {
      type: 'entityName' as const,
      entityType: settings.entityType,
      entityNameFilter: settings.nameFilter.trim(),
    };
  return { type: 'entityType' as const, entityType: settings.entityType };
}

export function nativeCountQuery(settings: NativeCountSettings, now = Date.now()): EntityCountQuery | AlarmCountQuery {
  const filter = entityFilter(settings);
  if (settings.kind === 'entity') return { entityFilter: filter as EntityCountQuery['entityFilter'] };
  const query: AlarmCountQuery = {
    ...(filter ? { entityFilter: filter as AlarmCountQuery['entityFilter'] } : {}),
    ...(settings.statusList.length ? { statusList: settings.statusList as AlarmCountQuery['statusList'] } : {}),
    ...(settings.severityList.length ? { severityList: settings.severityList as AlarmCountQuery['severityList'] } : {}),
    ...(settings.typeList.trim()
      ? {
          typeList: [
            ...new Set(
              settings.typeList
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          ],
        }
      : {}),
    ...(settings.timeWindowMs ? { startTs: now - settings.timeWindowMs, endTs: now } : {}),
  };
  return query;
}
