<template>
  <div ref="containerRef" class="usage-bar-chart">
    <div class="usage-bar-chart__canvas">
      <button class="usage-bar-chart__mode" type="button" @click="emit('toggle')">
        <span>{{ mode === 'sevenDays' ? '近7天用电量' : '近24小时用电量' }}</span>
        <span class="usage-bar-chart__switch" aria-hidden="true">⇄</span>
      </button>
      <svg viewBox="0 0 1000 360" preserveAspectRatio="none" role="img" :aria-label="chartAriaLabel">
        <g class="usage-bar-chart__grid">
          <template v-for="tick in yTicks" :key="tick.y">
            <line :x1="plot.left" :x2="plot.right" :y1="tick.y" :y2="tick.y" />
            <text :x="plot.left - 12" :y="tick.y + 4" text-anchor="end">{{ formatAxisValue(tick.value) }}</text>
          </template>
          <text x="16" y="22">kWh</text>
        </g>

        <g v-for="bar in bars" :key="bar.key" class="usage-bar-chart__bar-group">
          <rect
            class="usage-bar-chart__hit-area"
            :x="bar.slotX"
            :y="plot.top"
            :width="bar.slotWidth"
            :height="plot.bottom - plot.top"
            tabindex="0"
            @mouseenter="showTooltip($event, bar)"
            @mousemove="moveTooltip"
            @mouseleave="hideTooltip"
            @focus="showTooltip($event, bar)"
            @blur="hideTooltip"
          />
          <rect class="usage-bar-chart__bar" :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" rx="3" />
          <text
            class="usage-bar-chart__value"
            :class="{ 'is-compact': mode === 'twentyFourHours' }"
            :x="bar.x + bar.width / 2"
            :y="Math.max(plot.top + 11, bar.y - 7)"
            text-anchor="middle"
          >
            {{ formatBarValue(bar.value) }}
          </text>
          <text
            v-if="shouldShowXAxisLabel(bar.index)"
            class="usage-bar-chart__label"
            :x="bar.x + bar.width / 2"
            :y="plot.bottom + 25"
            text-anchor="middle"
          >
            {{ formatPointLabel(bar.point.ts, bar.index) }}
          </text>
        </g>

        <line class="usage-bar-chart__axis" :x1="plot.left" :x2="plot.right" :y1="plot.bottom" :y2="plot.bottom" />
      </svg>

      <div v-if="!points.length" class="usage-bar-chart__empty">暂无用电量数据</div>
      <div
        v-if="tooltip.visible"
        class="usage-bar-chart__tooltip"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >
        <span>{{ tooltip.label }}</span>
        <strong>{{ tooltip.value }} kWh</strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, reactive, ref } from 'vue';
  import type { UsagePoint } from './resourceUsage';

  export type UsageBarChartMode = 'sevenDays' | 'twentyFourHours';

  const props = defineProps<{
    points: UsagePoint[];
    mode: UsageBarChartMode;
    decimals?: number;
  }>();

  const emit = defineEmits<{ toggle: [] }>();
  const containerRef = ref<HTMLElement | null>(null);
  const plot = { left: 64, right: 982, top: 48, bottom: 314 };
  const tooltip = reactive({ visible: false, x: 0, y: 0, label: '', value: '' });

  const safeValues = computed(() => props.points.map((point) => Math.max(0, Number(point.value) || 0)));
  const maxValue = computed(() => Math.max(...safeValues.value, 0));
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
    const count = props.points.length;
    if (!count) return [];
    const chartWidth = plot.right - plot.left;
    const slotWidth = chartWidth / count;
    const widthRatio = props.mode === 'twentyFourHours' ? 0.58 : 0.52;
    const maxBarWidth = props.mode === 'twentyFourHours' ? 24 : 72;
    const barWidth = Math.max(4, Math.min(maxBarWidth, slotWidth * widthRatio));
    return props.points.map((point, index) => {
      const value = safeValues.value[index];
      const height = axisMax.value ? (value / axisMax.value) * (plot.bottom - plot.top) : 0;
      const slotX = plot.left + index * slotWidth;
      return {
        key: point.ts + '-' + index,
        point,
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
    () => (props.mode === 'sevenDays' ? '近7天' : '近24小时') + '用电量柱状图，共' + props.points.length + '个数据点',
  );

  function niceAxisMax(value: number) {
    if (value <= 0) return 1;
    const roughStep = value / 4;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalized = roughStep / magnitude;
    const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
    return Math.ceil(value / step) * step;
  }

  function formatAxisValue(value: number) {
    if (value >= 10000) return (value / 1000).toFixed(0) + 'k';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
    if (value >= 10) return value.toFixed(0);
    return value.toFixed(1);
  }

  function formatBarValue(value: number) {
    const decimals = Number(props.decimals ?? 1);
    if (props.mode === 'twentyFourHours' && value >= 1000) return (value / 1000).toFixed(1) + 'k';
    return value.toFixed(decimals);
  }

  function formatFullValue(value: number) {
    return value.toFixed(Number(props.decimals ?? 1));
  }

  function formatPointLabel(timestamp: number, index: number) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return String(index + 1);
    if (props.mode === 'sevenDays') {
      return String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    return String(date.getHours()).padStart(2, '0') + ':00';
  }

  function formatTooltipLabel(timestamp: number, index: number) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return formatPointLabel(timestamp, index);
    const dateText =
      date.getFullYear() +
      '-' +
      String(date.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(date.getDate()).padStart(2, '0');
    return props.mode === 'sevenDays' ? dateText : dateText + ' ' + String(date.getHours()).padStart(2, '0') + ':00';
  }

  function shouldShowXAxisLabel(index: number) {
    if (props.mode === 'sevenDays') return true;
    const lastIndex = props.points.length - 1;
    return index === 0 || index === lastIndex || index % 3 === 0;
  }

  function updateTooltipPosition(event: MouseEvent | FocusEvent) {
    const container = containerRef.value;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (event instanceof MouseEvent) {
      tooltip.x = Math.min(Math.max(event.clientX - rect.left, 82), rect.width - 82);
      tooltip.y = Math.max(event.clientY - rect.top - 14, 54);
      return;
    }
    tooltip.x = rect.width / 2;
    tooltip.y = 78;
  }

  function showTooltip(event: MouseEvent | FocusEvent, bar: (typeof bars.value)[number]) {
    tooltip.label = formatTooltipLabel(bar.point.ts, bar.index);
    tooltip.value = formatFullValue(bar.value);
    tooltip.visible = true;
    updateTooltipPosition(event);
  }

  function moveTooltip(event: MouseEvent) {
    if (tooltip.visible) updateTooltipPosition(event);
  }

  function hideTooltip() {
    tooltip.visible = false;
  }
</script>

<style scoped>
  .usage-bar-chart {
    position: relative;
    min-width: 0;
    min-height: 0;
    height: 100%;
    color: #e0f2fe;
  }

  .usage-bar-chart__mode {
    appearance: none;
    position: absolute;
    z-index: 2;
    top: 4px;
    left: 64px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 0;
    padding: 3px 0;
    background: transparent;
    color: rgba(226, 242, 255, 0.78);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .usage-bar-chart__mode:hover,
  .usage-bar-chart__mode:focus-visible {
    color: #e0f2fe;
    outline: none;
  }

  .usage-bar-chart__switch {
    color: #7dd3fc;
    font-size: 15px;
    line-height: 1;
  }

  .usage-bar-chart__canvas {
    position: relative;
    height: 100%;
    min-height: 180px;
    overflow: hidden;
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(14, 116, 144, 0.08), rgba(2, 6, 23, 0.04));
  }

  .usage-bar-chart__canvas svg {
    width: 100%;
    height: 100%;
    min-height: 180px;
    display: block;
  }

  .usage-bar-chart__grid line {
    stroke: rgba(148, 214, 255, 0.12);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .usage-bar-chart__grid text,
  .usage-bar-chart__label {
    fill: rgba(226, 242, 255, 0.52);
    font-size: 11px;
  }

  .usage-bar-chart__axis {
    stroke: rgba(148, 214, 255, 0.2);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .usage-bar-chart__bar {
    fill: #38bdf8;
    opacity: 0.86;
    pointer-events: none;
  }

  .usage-bar-chart__hit-area {
    fill: transparent;
    cursor: pointer;
  }

  .usage-bar-chart__bar-group:hover .usage-bar-chart__bar,
  .usage-bar-chart__bar-group:focus-within .usage-bar-chart__bar {
    fill: #7dd3fc;
    opacity: 1;
  }

  .usage-bar-chart__value {
    fill: #bae6fd;
    font-size: 11px;
    font-weight: 700;
    pointer-events: none;
  }

  .usage-bar-chart__value.is-compact {
    font-size: 9px;
  }

  .usage-bar-chart__empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: rgba(226, 242, 255, 0.5);
    font-size: 12px;
  }

  .usage-bar-chart__tooltip {
    position: absolute;
    z-index: 2;
    min-width: 126px;
    transform: translate(-50%, -100%);
    border: 1px solid rgba(125, 211, 252, 0.22);
    border-radius: 6px;
    background: rgba(3, 18, 31, 0.94);
    padding: 7px 9px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    pointer-events: none;
  }

  .usage-bar-chart__tooltip span,
  .usage-bar-chart__tooltip strong {
    display: block;
    white-space: nowrap;
  }

  .usage-bar-chart__tooltip span {
    color: rgba(226, 242, 255, 0.58);
    font-size: 10px;
  }

  .usage-bar-chart__tooltip strong {
    margin-top: 3px;
    color: #e0f2fe;
    font-size: 13px;
  }
</style>
