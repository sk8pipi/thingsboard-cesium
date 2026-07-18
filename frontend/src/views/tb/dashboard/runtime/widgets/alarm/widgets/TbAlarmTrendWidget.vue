<template>
  <section ref="containerRef" class="alarm-trend" aria-label="报警趋势">
    <header class="alarm-trend__header">
      <h3>报警趋势</h3>
      <div class="alarm-trend__modes" role="group" aria-label="报警趋势时间范围">
        <button
          v-for="option in modeOptions"
          :key="option.value"
          type="button"
          :class="{ active: mode === option.value }"
          :aria-pressed="mode === option.value"
          @click="setMode(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </header>

    <div class="alarm-trend__legend" aria-label="报警严重度图例">
      <span v-for="option in severityOptions" :key="option.key">
        <i :style="{ backgroundColor: option.color }" aria-hidden="true"></i>
        {{ option.label }}
      </span>
    </div>

    <div class="alarm-trend__canvas">
      <div v-if="loading && !hasLoaded" class="alarm-trend__state">正在统计报警趋势...</div>
      <div v-else-if="error && !hasLoaded" class="alarm-trend__state is-error">{{ error }}</div>

      <template v-else>
        <svg viewBox="0 0 1000 360" preserveAspectRatio="none" role="img" :aria-label="chartAriaLabel">
          <defs>
            <clipPath v-for="bar in bars" :id="bar.clipId" :key="bar.clipId">
              <rect :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" rx="3" />
            </clipPath>
          </defs>

          <g class="alarm-trend__grid">
            <template v-for="tick in yTicks" :key="tick.y">
              <line :x1="plot.left" :x2="plot.right" :y1="tick.y" :y2="tick.y" />
              <text :x="plot.left - 12" :y="tick.y + 4" text-anchor="end">{{ formatCount(tick.value) }}</text>
            </template>
            <text x="16" y="22">数量</text>
          </g>

          <g v-for="bar in bars" :key="bar.key" class="alarm-trend__bar-group">
            <rect
              class="alarm-trend__hit-area"
              :x="bar.slotX"
              :y="plot.top"
              :width="bar.slotWidth"
              :height="plot.bottom - plot.top"
              tabindex="0"
              :aria-label="formatBarAriaLabel(bar.bucket)"
              @mouseenter="showTooltip($event, bar)"
              @mousemove="moveTooltip"
              @mouseleave="hideTooltip"
              @focus="showTooltip($event, bar)"
              @blur="hideTooltip"
            />
            <g class="alarm-trend__stack" :clip-path="'url(#' + bar.clipId + ')'">
              <rect
                v-for="segment in bar.segments"
                :key="segment.key"
                class="alarm-trend__segment"
                :x="bar.x"
                :y="segment.y"
                :width="bar.width"
                :height="segment.height"
                :style="{ fill: segment.color }"
              />
            </g>
            <text
              class="alarm-trend__value"
              :class="{ 'is-compact': mode === 'twentyFourHours' }"
              :x="bar.x + bar.width / 2"
              :y="Math.max(plot.top + 11, bar.y - 7)"
              text-anchor="middle"
            >
              {{ bar.value }}
            </text>
            <text
              v-if="shouldShowXAxisLabel(bar.index)"
              class="alarm-trend__label"
              :x="bar.x + bar.width / 2"
              :y="plot.bottom + 25"
              text-anchor="middle"
            >
              {{ bar.bucket.label }}
            </text>
          </g>

          <line class="alarm-trend__axis" :x1="plot.left" :x2="plot.right" :y1="plot.bottom" :y2="plot.bottom" />
        </svg>

        <div v-if="error" class="alarm-trend__refresh-error">刷新失败，当前显示上次统计结果</div>
      </template>

      <div
        v-if="tooltip.visible"
        class="alarm-trend__tooltip"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >
        <div class="alarm-trend__tooltip-heading">
          <span>{{ tooltip.label }}</span>
          <strong>总计：{{ tooltip.value }}</strong>
        </div>
        <div class="alarm-trend__tooltip-rows">
          <div v-for="row in tooltip.rows" :key="row.key" class="alarm-trend__tooltip-row">
            <i :style="{ backgroundColor: row.color }" aria-hidden="true"></i>
            <span>{{ row.label }}</span>
            <strong>{{ row.count }}（{{ row.percentage }}）</strong>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { ALARM_SEVERITY_COLORS, AlarmSeverity } from '/@/enums/alarmEnum';
  import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import {
    aggregateAlarmTrend,
    createAlarmTrendRange,
    type AlarmTrendBucket,
    type AlarmTrendMode,
    type AlarmTrendSeverity,
  } from '../alarmTrend';
  import { fetchTenantAlarmsInRange } from '../alarmTrendApi';

  const props = defineProps<{
    config?: Record<string, any>;
    widget?: Record<string, any>;
  }>();

  interface SeverityOption {
    key: AlarmTrendSeverity;
    label: string;
    color: string;
  }

  interface TooltipSeverityRow extends SeverityOption {
    count: number;
    percentage: string;
  }

  interface AlarmTrendTooltip {
    visible: boolean;
    x: number;
    y: number;
    label: string;
    value: number;
    rows: TooltipSeverityRow[];
  }

  const severityOptions: SeverityOption[] = [
    { key: 'CRITICAL', label: '严重', color: ALARM_SEVERITY_COLORS[AlarmSeverity.CRITICAL] },
    { key: 'MAJOR', label: '高', color: ALARM_SEVERITY_COLORS[AlarmSeverity.MAJOR] },
    { key: 'MINOR', label: '中', color: ALARM_SEVERITY_COLORS[AlarmSeverity.MINOR] },
    { key: 'WARNING', label: '低', color: ALARM_SEVERITY_COLORS[AlarmSeverity.WARNING] },
    {
      key: 'INDETERMINATE',
      label: '未定',
      color: ALARM_SEVERITY_COLORS[AlarmSeverity.INDETERMINATE],
    },
  ];

  const modeOptions: Array<{ label: string; value: AlarmTrendMode }> = [
    { label: '近7天', value: 'sevenDays' },
    { label: '近24小时', value: 'twentyFourHours' },
  ];
  const plot = { left: 64, right: 982, top: 26, bottom: 314 };
  const clipIdPrefix = 'alarm-trend-' + Math.random().toString(36).slice(2);
  const containerRef = ref<HTMLElement | null>(null);
  const mode = ref<AlarmTrendMode>('sevenDays');
  const buckets = ref(createAlarmTrendRange(mode.value).buckets);
  const loading = ref(false);
  const hasLoaded = ref(false);
  const error = ref('');
  const tooltip = reactive<AlarmTrendTooltip>({ visible: false, x: 0, y: 0, label: '', value: 0, rows: [] });

  let refreshTimer: number | undefined;
  let requestSequence = 0;
  let disposed = false;

  const settings = computed(() => props.widget?.config?.settings || props.config?.settings || {});
  const pollMs = computed(() => Math.max(10_000, Number(settings.value.pollMs) || 60_000));
  const pageSize = computed(() => Math.min(1000, Math.max(10, Number(settings.value.pageSize) || 100)));
  const maxValue = computed(() => Math.max(...buckets.value.map((bucket) => bucket.total), 0));
  const axisMax = computed(() => niceAxisMax(maxValue.value));
  const yTicks = computed(() =>
    Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      return {
        value: axisMax.value * (1 - ratio),
        y: plot.top + (plot.bottom - plot.top) * ratio,
      };
    }),
  );
  const bars = computed(() => {
    const count = buckets.value.length;
    if (!count) return [];
    const chartWidth = plot.right - plot.left;
    const plotHeight = plot.bottom - plot.top;
    const slotWidth = chartWidth / count;
    const widthRatio = mode.value === 'twentyFourHours' ? 0.58 : 0.52;
    const maxBarWidth = mode.value === 'twentyFourHours' ? 24 : 72;
    const barWidth = Math.max(4, Math.min(maxBarWidth, slotWidth * widthRatio));

    return buckets.value.map((bucket, index) => {
      const value = Math.max(0, bucket.total);
      const height = axisMax.value ? (value / axisMax.value) * plotHeight : 0;
      const slotX = plot.left + index * slotWidth;
      let segmentBottom = plot.bottom;
      const segments = severityOptions
        .map((option) => {
          const segmentValue = Math.max(0, Number(bucket.severityCounts[option.key]) || 0);
          const segmentHeight = axisMax.value ? (segmentValue / axisMax.value) * plotHeight : 0;
          segmentBottom -= segmentHeight;
          return {
            ...option,
            key: bucket.key + '-' + option.key,
            value: segmentValue,
            y: segmentBottom,
            height: segmentHeight,
          };
        })
        .filter((segment) => segment.value > 0);

      return {
        key: bucket.key,
        clipId: clipIdPrefix + '-' + index,
        bucket,
        segments,
        index,
        value,
        slotX,
        slotWidth,
        x: slotX + (slotWidth - barWidth) / 2,
        y: plot.bottom - height,
        width: barWidth,
        height,
      };
    });
  });
  const chartAriaLabel = computed(
    () =>
      (mode.value === 'sevenDays' ? '近7天' : '近24小时') + '报警数量柱状图，共' + buckets.value.length + '个时间段',
  );

  function niceAxisMax(value: number) {
    if (value <= 4) return 4;
    const roughStep = value / 4;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalized = roughStep / magnitude;
    const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
    return Math.ceil(value / step) * step;
  }

  function formatCount(value: number) {
    if (value >= 10_000) return Math.round(value / 1000) + 'k';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
    return String(Math.round(value));
  }

  function formatTooltipLabel(bucket: AlarmTrendBucket) {
    const date = new Date(bucket.startTs);
    const dateText =
      date.getFullYear() +
      '-' +
      String(date.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(date.getDate()).padStart(2, '0');
    if (mode.value === 'sevenDays') return dateText;

    const endDate = new Date(bucket.endTs);
    return (
      dateText +
      ' ' +
      String(date.getHours()).padStart(2, '0') +
      ':00–' +
      String(endDate.getHours()).padStart(2, '0') +
      ':00'
    );
  }

  function formatPercent(count: number, total: number) {
    if (!total) return '0%';
    const percentage = (count / total) * 100;
    return (Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(1)) + '%';
  }

  function formatBarAriaLabel(bucket: AlarmTrendBucket) {
    const details = severityOptions.map((option) => option.label + bucket.severityCounts[option.key] + '个').join('，');
    return formatTooltipLabel(bucket) + '，总计' + bucket.total + '个报警，' + details;
  }

  function shouldShowXAxisLabel(index: number) {
    if (mode.value === 'sevenDays') return true;
    const lastIndex = buckets.value.length - 1;
    return index === 0 || index === lastIndex || index % 3 === 0;
  }

  function updateTooltipPosition(event: MouseEvent | FocusEvent) {
    const container = containerRef.value;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (event instanceof MouseEvent) {
      const edgePadding = Math.min(110, rect.width / 2);
      tooltip.x = Math.min(Math.max(event.clientX - rect.left, edgePadding), rect.width - edgePadding);
      tooltip.y = Math.max(event.clientY - rect.top - 14, 54);
      return;
    }
    tooltip.x = rect.width / 2;
    tooltip.y = 94;
  }

  function showTooltip(event: MouseEvent | FocusEvent, bar: { bucket: AlarmTrendBucket; value: number }) {
    tooltip.label = formatTooltipLabel(bar.bucket);
    tooltip.value = bar.value;
    tooltip.rows = severityOptions.map((option) => {
      const count = Math.max(0, Number(bar.bucket.severityCounts[option.key]) || 0);
      return {
        ...option,
        count,
        percentage: formatPercent(count, bar.value),
      };
    });
    tooltip.visible = true;
    updateTooltipPosition(event);
  }

  function moveTooltip(event: MouseEvent) {
    if (tooltip.visible) updateTooltipPosition(event);
  }

  function hideTooltip() {
    tooltip.visible = false;
  }

  async function reload() {
    const sequence = ++requestSequence;
    const requestMode = mode.value;
    const now = Date.now();
    const range = createAlarmTrendRange(requestMode, now);
    loading.value = true;
    error.value = '';

    try {
      const alarms = await fetchTenantAlarmsInRange({
        startTime: range.startTime,
        endTime: range.endTime,
        pageSize: pageSize.value,
        shouldStop: () => disposed || sequence !== requestSequence,
      });
      if (disposed || sequence !== requestSequence) return;
      buckets.value = aggregateAlarmTrend(alarms, requestMode, now);
      hasLoaded.value = true;
    } catch (err: any) {
      if (disposed || sequence !== requestSequence) return;
      error.value = err?.message || '报警趋势加载失败';
    } finally {
      if (!disposed && sequence === requestSequence) loading.value = false;
    }
  }

  function setMode(value: AlarmTrendMode) {
    if (mode.value === value) return;
    mode.value = value;
    hasLoaded.value = false;
    buckets.value = createAlarmTrendRange(value).buckets;
    hideTooltip();
    void reload();
  }

  function startRefreshTimer() {
    stopRefreshTimer();
    refreshTimer = window.setInterval(() => {
      if (!document.hidden) void reload();
    }, pollMs.value);
  }

  function stopRefreshTimer() {
    if (!refreshTimer) return;
    window.clearInterval(refreshTimer);
    refreshTimer = undefined;
  }

  function handleVisibilityChange() {
    if (!document.hidden) void reload();
  }

  watch(pollMs, startRefreshTimer);

  onMounted(() => {
    void reload();
    startRefreshTimer();
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  onBeforeUnmount(() => {
    disposed = true;
    requestSequence += 1;
    stopRefreshTimer();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });
</script>

<style scoped>
  .alarm-trend {
    container-type: inline-size;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    color: #e0f2fe;
  }

  .alarm-trend__header {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 4px 4px;
  }

  .alarm-trend__header h3 {
    overflow: hidden;
    margin: 0;
    color: #dff8ff;
    font-size: 16px;
    font-weight: 700;
    line-height: 28px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .alarm-trend__legend {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 14px;
    padding: 0 6px 5px 64px;
    color: rgba(226, 242, 255, 0.64);
    font-size: 10px;
  }

  .alarm-trend__legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }

  .alarm-trend__legend i,
  .alarm-trend__tooltip-row i {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22);
  }

  .alarm-trend__modes {
    flex: none;
    display: inline-flex;
    align-items: center;
    border: 1px solid rgba(125, 211, 252, 0.18);
    border-radius: 8px;
    background: rgba(8, 47, 73, 0.12);
    padding: 2px;
  }

  .alarm-trend__modes button {
    appearance: none;
    border: 0;
    border-radius: 6px;
    background: transparent;
    padding: 4px 9px;
    color: rgba(226, 242, 255, 0.58);
    font: inherit;
    font-size: 11px;
    line-height: 18px;
    cursor: pointer;
  }

  .alarm-trend__modes button:hover,
  .alarm-trend__modes button:focus-visible {
    color: #e0f2fe;
    outline: none;
  }

  .alarm-trend__modes button.active {
    background: rgba(56, 189, 248, 0.2);
    color: #bae6fd;
    box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.16);
  }

  .alarm-trend__canvas {
    position: relative;
    height: 100%;
    min-height: 180px;
    overflow: hidden;
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(14, 116, 144, 0.08), rgba(2, 6, 23, 0.04));
  }

  .alarm-trend__canvas svg {
    width: 100%;
    height: 100%;
    min-height: 180px;
    display: block;
  }

  .alarm-trend__grid line {
    stroke: rgba(148, 214, 255, 0.12);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .alarm-trend__grid text,
  .alarm-trend__label {
    fill: rgba(226, 242, 255, 0.52);
    font-size: 11px;
  }

  .alarm-trend__axis {
    stroke: rgba(148, 214, 255, 0.2);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .alarm-trend__stack {
    pointer-events: none;
  }

  .alarm-trend__segment {
    opacity: 1;
    transition: filter 0.16s ease;
  }

  .alarm-trend__hit-area {
    fill: transparent;
    cursor: pointer;
  }

  .alarm-trend__bar-group:hover .alarm-trend__segment,
  .alarm-trend__bar-group:focus-within .alarm-trend__segment {
    filter: brightness(1.08);
  }

  .alarm-trend__value {
    fill: #bae6fd;
    font-size: 11px;
    font-weight: 700;
    pointer-events: none;
  }

  .alarm-trend__value.is-compact {
    font-size: 9px;
  }

  .alarm-trend__state {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: rgba(226, 242, 255, 0.62);
    font-size: 12px;
  }

  .alarm-trend__state.is-error,
  .alarm-trend__refresh-error {
    color: #fca5a5;
  }

  .alarm-trend__refresh-error {
    position: absolute;
    right: 10px;
    bottom: 8px;
    font-size: 10px;
  }

  .alarm-trend__tooltip {
    position: absolute;
    z-index: 2;
    min-width: 196px;
    transform: translate(-50%, -100%);
    border: 1px solid rgba(125, 211, 252, 0.22);
    border-radius: 6px;
    background: rgba(3, 18, 31, 0.94);
    padding: 7px 9px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    pointer-events: none;
  }

  .alarm-trend__tooltip-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 5px;
    border-bottom: 1px solid rgba(125, 211, 252, 0.14);
  }

  .alarm-trend__tooltip-heading span,
  .alarm-trend__tooltip-heading strong,
  .alarm-trend__tooltip-row span,
  .alarm-trend__tooltip-row strong {
    white-space: nowrap;
  }

  .alarm-trend__tooltip-heading span {
    color: rgba(226, 242, 255, 0.68);
    font-size: 10px;
  }

  .alarm-trend__tooltip-heading strong {
    color: #e0f2fe;
    font-size: 12px;
  }

  .alarm-trend__tooltip-rows {
    display: grid;
    gap: 3px;
    margin-top: 5px;
  }

  .alarm-trend__tooltip-row {
    display: grid;
    grid-template-columns: 8px minmax(36px, 1fr) auto;
    align-items: center;
    gap: 6px;
    min-height: 17px;
  }

  .alarm-trend__tooltip-row span {
    color: rgba(226, 242, 255, 0.68);
    font-size: 10px;
  }

  .alarm-trend__tooltip-row strong {
    color: #e0f2fe;
    font-size: 10px;
    font-weight: 600;
  }

  @container (max-width: 460px) {
    .alarm-trend__header {
      gap: 6px;
      padding-right: 0;
      padding-left: 2px;
    }

    .alarm-trend__header h3 {
      font-size: 14px;
    }

    .alarm-trend__modes button {
      padding: 3px 6px;
      font-size: 10px;
    }
    .alarm-trend__legend {
      gap: 3px 8px;
      padding-right: 2px;
      padding-left: 2px;
      font-size: 9px;
    }
  }
</style>
