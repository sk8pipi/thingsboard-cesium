import SingleValueCard from '../widgets/SingleValueCard.vue';
import TimeSeriesLine from '../widgets/TimeSeriesLine.vue';
import type { WidgetKind } from './types';

export function getWidgetComponent(kind: WidgetKind) {
  if (kind === 'singleValue') return SingleValueCard;
  if (kind === 'timeseries') return TimeSeriesLine;
  return SingleValueCard; // 兜底：先用单值卡片显示“未支持”
}
