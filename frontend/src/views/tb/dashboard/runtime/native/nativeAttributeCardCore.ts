import { formatNativeValue, type NativeSeries } from './nativeWidgetDataCore';
import type { NativeAttributeCardSettings, NativeSource } from './nativeWidgetTypes';

export interface NativeAttributeCardGroup {
  id: string;
  title: string;
  rows: { id: string; label: string; value: string; error?: string }[];
}

export function nativeAttributeCardGroups(
  sources: NativeSource[],
  series: NativeSeries[],
  settings: NativeAttributeCardSettings,
  decimals = 2,
  units = '',
): NativeAttributeCardGroup[] {
  return sources
    .map((source, index) => ({
      id: `${source.entityType}:${source.entityId}:${index}`,
      title: source.name || source.entityId,
      rows: series
        .filter(
          (item) =>
            item.id.startsWith(`${source.entityType}:${source.entityId}:`) &&
            item.id.split(':').at(-2) === String(index),
        )
        .filter((item) => settings.showMissing || (item.latest?.value != null && item.latest.value !== ''))
        .map((item) => ({
          id: item.id,
          label: item.key.label || item.key.name,
          value: formatNativeValue(item.latest?.value, item.key.decimals ?? decimals, item.key.units ?? units),
          error: item.error,
        })),
    }))
    .filter((group) => group.rows.length > 0 || settings.showMissing);
}
