import type { Dashboard } from '/@/api/tb/dashboard';
import type { ParsedDashboard, ParsedWidget, Timewindow } from '../sdk/types';
import type { EntityType } from '/@/enums/entityTypeEnum';

function defaultTimewindow(): Timewindow {
  const endTs = Date.now();
  const startTs = endTs - 60 * 60 * 1000; // 最近 1 小时
  return {
    startTs,
    endTs,
    interval: 60 * 1000,
    limit: 2000,
    agg: 'AVG',
    orderBy: 'ASC',
  };
}

function guessKind(widget: any): 'singleValue' | 'timeseries' | 'unknown' {
  const typeAlias = (widget?.typeAlias || widget?.type || widget?.config?.type || '').toString().toLowerCase();
  const title = (widget?.config?.title || widget?.title || '').toString().toLowerCase();

  if (typeAlias.includes('timeseries') || typeAlias.includes('chart') || title.includes('chart')) return 'timeseries';
  if (typeAlias.includes('latest') || typeAlias.includes('value') || title.includes('value')) return 'singleValue';

  // 根据 dataKeys 数量简单判断
  const dk = widget?.config?.datasources?.[0]?.dataKeys || widget?.datasources?.[0]?.dataKeys;
  if (Array.isArray(dk) && dk.length > 1) return 'timeseries';
  if (Array.isArray(dk) && dk.length === 1) return 'singleValue';

  return 'unknown';
}

function extractKeys(widget: any): string[] {
  const ds = widget?.config?.datasources?.[0] || widget?.datasources?.[0];
  const dataKeys = ds?.dataKeys;
  if (!Array.isArray(dataKeys)) return [];
  return dataKeys
    .map((k: any) => k?.name || k?.label || k?.key)
    .filter((x: any) => typeof x === 'string' && x.length > 0);
}

function extractEntity(widget: any, configuration: any): { entityType: EntityType; id: string } | undefined {
  const ds = widget?.config?.datasources?.[0] || widget?.datasources?.[0];
  if (!ds) return;

  // 1) 直接 entityId
  const e = ds?.entityId;
  if (e?.id && e?.entityType) return { entityType: e.entityType, id: e.id };

  // 2) alias -> singleEntity（只支持最简单那种）
  const aliasId = ds?.entityAliasId;
  const aliases = configuration?.entityAliases;
  const alias = aliasId && aliases ? aliases[aliasId] : undefined;

  const single = alias?.filter?.singleEntity;
  if (single?.id && single?.entityType) return { entityType: single.entityType, id: single.id };

  return;
}

function extractTimewindow(widget: any, configuration: any): Timewindow {
  // 尽量从 widget 或 dashboard configuration 取
  const tw = widget?.config?.timewindow || configuration?.timewindow;
  // 为了“先能跑”，这里先统一走默认（后续你再增强解析 tw 的各种形态）
  if (!tw) return defaultTimewindow();
  return defaultTimewindow();
}

export function parseDashboard(dashboard: Dashboard): ParsedDashboard {
  const cfg: any = dashboard?.configuration || {};
  const widgetsObj: any = cfg.widgets || {};

  const widgets: ParsedWidget[] = Object.keys(widgetsObj).map((id) => {
    const w = widgetsObj[id];
    const title = w?.config?.title || w?.title || `Widget ${id}`;
    const kind = guessKind(w);
    const keys = extractKeys(w);
    const entity = extractEntity(w, cfg);
    const timewindow = extractTimewindow(w, cfg);

    return {
      id,
      title,
      kind,
      keys,
      entity,
      timewindow,
      raw: w,
    };
  });

  return {
    id: dashboard?.id?.id || (dashboard as any)?.id || '',
    title: dashboard?.title || 'Dashboard',
    widgets,
    raw: dashboard,
  };
}
