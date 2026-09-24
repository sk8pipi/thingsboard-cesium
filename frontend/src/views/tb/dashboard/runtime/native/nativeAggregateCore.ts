import type { NativeAggregateSlot, NativeSource } from './nativeWidgetTypes';
import type { NativeDataApi, NativePoint } from './nativeWidgetDataCore';

export interface NativeAggregateResult {
  id: string;
  current: NativePoint | null;
  previous: NativePoint | null;
  value: number | null;
  timestamp: number | null;
  error?: string;
}
const number = (value: unknown): number | null => {
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'string' && !value.trim()))
    return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
/** Calendar offsets are explicitly UTC; month/year clamp the day instead of overflowing it. */
export function aggregateComparisonWindow(window: { startTs: number; endTs: number }, slot: NativeAggregateSlot) {
  if (
    !['previousInterval', 'customInterval', 'day', 'week', 'month', 'year'].includes(slot.timeForComparison) ||
    (slot.timeForComparison === 'customInterval' &&
      (!Number.isFinite(slot.comparisonCustomIntervalValue) || slot.comparisonCustomIntervalValue <= 0))
  )
    throw new Error('比较时间偏移无效');
  const duration = window.endTs - window.startTs;
  const shift = (ts: number) => {
    if (slot.timeForComparison === 'previousInterval') return ts - duration;
    if (slot.timeForComparison === 'customInterval') return ts - slot.comparisonCustomIntervalValue;
    if (slot.timeForComparison === 'day') return ts - 86400000;
    if (slot.timeForComparison === 'week') return ts - 7 * 86400000;
    const date = new Date(ts);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - (slot.timeForComparison === 'year' ? 12 : 1));
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return date.getTime();
  };
  const result = { startTs: shift(window.startTs), endTs: shift(window.endTs) };
  if (
    !Number.isFinite(result.startTs) ||
    !Number.isFinite(result.endTs) ||
    result.startTs < 0 ||
    result.endTs <= result.startTs
  )
    throw new Error('比较时间范围无效');
  return result;
}

export function aggregateComparedValue(
  current: unknown,
  previous: unknown,
  kind: NativeAggregateSlot['comparisonResultType'],
) {
  const before = number(previous);
  if (before === null) return null;
  if (kind === 'PREVIOUS_VALUE') return before;
  const now = number(current);
  if (now === null) return null;
  // ThingsBoard returns 100 for a zero denominator, including the 0 -> 0 case.
  return kind === 'DELTA_PERCENT' ? (before === 0 ? 100 : ((now - before) / before) * 100) : now - before;
}

/** Reads full-window server aggregates, never averages a truncated set of chart points. */
export async function loadNativeAggregateSlots(
  source: NativeSource,
  slots: NativeAggregateSlot[],
  window: { startTs: number; endTs: number },
  realtime: boolean,
  api: Pick<NativeDataApi, 'latest' | 'history'>,
): Promise<NativeAggregateResult[]> {
  const key = source.dataKeys[0]?.name;
  const pending = new Map<string, Promise<NativePoint | null>>();
  const read = (aggregation: NativeAggregateSlot['aggregationType'], range: typeof window, previous: boolean) => {
    const latest = aggregation === 'NONE' && !previous;
    const cacheKey = latest ? 'latest' : `${aggregation}:${range.startTs}:${range.endTs}`;
    if (!pending.has(cacheKey)) {
      pending.set(
        cacheKey,
        (async () => {
          const response: any = latest
            ? await api.latest(source, key)
            : await api.history({
                entityType: source.entityType,
                entityId: source.entityId,
                keys: key,
                ...range,
                interval: range.endTs - range.startTs,
                agg: aggregation,
                limit: 1,
                orderBy: 'DESC',
              });
          const values = Array.isArray(response?.[key]) ? response[key] : [];
          const points = values.filter(
            (item: any) =>
              item?.ts != null &&
              Number.isFinite(Number(item.ts)) &&
              (latest || (Number(item.ts) >= range.startTs && Number(item.ts) <= range.endTs)),
          );
          const point = points.sort((a: any, b: any) => Number(b.ts) - Number(a.ts))[0];
          return point ? { ts: Number(point.ts), value: point.value } : null;
        })(),
      );
    }
    return pending.get(cacheKey)!;
  };
  return Promise.all(
    slots.map(async (slot) => {
      const result: NativeAggregateResult = {
        id: slot.id,
        current: null,
        previous: null,
        value: null,
        timestamp: null,
      };
      if (!key || source.dataKeys.length !== 1 || source.dataKeys[0].type !== 'timeseries')
        return { ...result, error: '聚合卡需要一个遥测字段' };
      if (slot.comparisonEnabled && realtime)
        return { ...result, error: '实时浮动窗口不支持原生数据比较，请选择固定历史窗口' };
      const errors: string[] = [];
      const needsCurrent = !slot.comparisonEnabled || slot.comparisonResultType !== 'PREVIOUS_VALUE';
      const reads: Promise<void>[] = [];
      if (needsCurrent)
        reads.push(
          read(slot.aggregationType, window, false)
            .then((value) => {
              result.current = value;
            })
            .catch(() => {
              errors.push('当前值读取失败');
            }),
        );
      if (slot.comparisonEnabled) {
        try {
          const previousWindow = aggregateComparisonWindow(window, slot);
          reads.push(
            read(slot.aggregationType, previousWindow, true)
              .then((value) => {
                result.previous = value;
              })
              .catch(() => {
                errors.push('比较值读取失败');
              }),
          );
        } catch (error) {
          errors.push((error as Error).message);
        }
      }
      await Promise.all(reads);
      if (!errors.length) {
        result.value = slot.comparisonEnabled
          ? aggregateComparedValue(result.current?.value, result.previous?.value, slot.comparisonResultType)
          : number(result.current?.value);
        result.timestamp = (slot.comparisonEnabled ? result.previous?.ts : result.current?.ts) ?? null;
      }
      if (errors.length) result.error = errors.join('；');
      return result;
    }),
  );
}
