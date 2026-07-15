<template>
  <div class="mini-usage-trend">
    <div class="mini-usage-trend__title">
      <span>{{ title }}</span>
      <strong>{{ latestText }} {{ unit }}</strong>
    </div>
    <div class="mini-usage-trend__chart">
      <svg viewBox="0 0 100 48" preserveAspectRatio="none" role="img" :aria-label="title">
        <defs>
          <linearGradient :id="fillId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#38bdf8" stop-opacity=".32" />
            <stop offset="1" stop-color="#38bdf8" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path v-if="areaPath" :d="areaPath" :fill="`url(#${fillId})`" />
        <polyline
          v-if="linePoints"
          :points="linePoints"
          fill="none"
          stroke="#7dd3fc"
          stroke-width="1.6"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <div v-if="!points.length" class="mini-usage-trend__empty">暂无数据</div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { formatUsageNumber, type UsagePoint } from './resourceUsage';

  const props = defineProps<{
    title: string;
    points: UsagePoint[];
    unit?: string;
  }>();

  const fillId = `mini-usage-trend-${Math.random().toString(36).slice(2)}`;
  const bounds = computed(() => {
    const values = props.points.map((point) => point.value);
    return {
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
    };
  });
  const normalized = computed(() => {
    const span = bounds.value.max - bounds.value.min || 1;
    return props.points.map((point, index) => ({
      x: props.points.length <= 1 ? 50 : (index / (props.points.length - 1)) * 100,
      y: 44 - ((point.value - bounds.value.min) / span) * 38,
    }));
  });
  const linePoints = computed(() =>
    normalized.value.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '),
  );
  const areaPath = computed(() =>
    linePoints.value ? `M 0 48 L ${linePoints.value.replaceAll(' ', ' L ')} L 100 48 Z` : '',
  );
  const latestText = computed(() => formatUsageNumber(props.points.at(-1)?.value || 0, 1));
</script>

<style scoped>
  .mini-usage-trend {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 6px;
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(14, 116, 144, 0.08), rgba(2, 6, 23, 0.04));
    padding: 8px;
  }

  .mini-usage-trend__title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .mini-usage-trend__title span {
    color: rgba(226, 242, 255, 0.62);
    font-size: 11px;
  }

  .mini-usage-trend__title strong {
    color: #bae6fd;
    font-size: 12px;
    font-weight: 700;
  }

  .mini-usage-trend__chart {
    position: relative;
    min-height: 0;
  }

  .mini-usage-trend__chart svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .mini-usage-trend__empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: rgba(226, 242, 255, 0.5);
    font-size: 12px;
  }
</style>
