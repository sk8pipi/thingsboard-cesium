import type { NativePoint, NativeSeries } from './nativeWidgetDataCore';
import type { NativeStateSettings } from './nativeWidgetTypes';

/** Match upstream constants strictly, then ordered numeric ranges. Never execute conversion scripts. */
export function nativeStateValue(raw: unknown, settings: NativeStateSettings): number | null {
  const value = raw === 'true' ? true : raw === 'false' ? false : raw;
  const constant = settings.states
    .filter((state) => state.sourceType === 'constant' && state.sourceValue === value)
    .at(-1);
  if (constant) return constant.value;
  const number = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
  if (!Number.isFinite(number)) return null;
  const range = settings.states.find(
    (state) =>
      state.sourceType === 'range' &&
      (state.sourceRangeFrom != null && state.sourceRangeFrom === state.sourceRangeTo
        ? number === state.sourceRangeFrom
        : (state.sourceRangeFrom == null || number >= state.sourceRangeFrom) &&
          (state.sourceRangeTo == null || number < state.sourceRangeTo)),
  );
  return range ? range.value : number;
}

export function nativeStateLabel(value: unknown, settings: NativeStateSettings): string | undefined {
  return settings.states.find((state) => state.value === value)?.label;
}

/** Preserve unknown-state gaps; never bridge truncated or failed history with an old previous state. */
export function nativeStatePoints(
  series: NativeSeries,
  settings: NativeStateSettings,
  window?: { startTs: number; endTs: number } | null,
): NativePoint[] {
  if (series.historyFailed) return [];
  const sorted = [...series.points].sort((a, b) => a.ts - b.ts);
  const points = window ? sorted.filter((point) => point.ts >= window.startTs && point.ts <= window.endTs) : sorted;
  if (window && settings.includePrevious) {
    const previous =
      sorted.filter((point) => point.ts < window.startTs).at(-1) || (!series.truncated ? series.previous : null);
    if (previous && previous.ts < window.startTs && (!points.length || points[0].ts > window.startTs))
      points.unshift({ ts: window.startTs, value: previous.value });
  }
  const last = points.at(-1);
  if (window && settings.extendToEnd && last && last.ts < window.endTs)
    points.push({ ts: window.endTs, value: last.value });
  return points.map((point) => ({ ts: point.ts, value: nativeStateValue(point.value, settings) }));
}

export function validateStateSettings(settings: NativeStateSettings): string[] {
  if (
    !Array.isArray(settings.states) ||
    !settings.states.length ||
    settings.states.length > 128 ||
    settings.states.some(
      (state) =>
        !state ||
        typeof state.label !== 'string' ||
        !state.label.trim() ||
        !Number.isFinite(state.value) ||
        !['constant', 'range'].includes(state.sourceType) ||
        (state.sourceType === 'constant' &&
          (!['string', 'number', 'boolean'].includes(typeof state.sourceValue) ||
            (typeof state.sourceValue === 'number' && !Number.isFinite(state.sourceValue)))) ||
        (state.sourceType === 'range' &&
          ((state.sourceRangeFrom != null && !Number.isFinite(state.sourceRangeFrom)) ||
            (state.sourceRangeTo != null && !Number.isFinite(state.sourceRangeTo)) ||
            (state.sourceRangeFrom != null &&
              state.sourceRangeTo != null &&
              state.sourceRangeFrom > state.sourceRangeTo))),
    )
  )
    return ['状态映射须有 1–128 项有效名称、数值位置与常量或区间'];
  return [];
}
