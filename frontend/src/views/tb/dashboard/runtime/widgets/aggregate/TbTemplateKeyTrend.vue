<template>
  <div class="template-key-trend">
    <div class="template-key-trend__meta">
      <div
        ><span>Key</span><strong>{{ keyName }}</strong></div
      >
      <div
        ><span>当前总量</span><strong>{{ latestValue }}</strong></div
      >
      <div
        ><span>范围</span><strong>{{ rangeText }}</strong></div
      >
    </div>
    <div class="template-key-trend__chart">
      <svg viewBox="0 0 100 50" preserveAspectRatio="none" role="img" :aria-label="`${keyName} 汇总趋势`">
        <defs>
          <linearGradient id="template-key-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#38bdf8" stop-opacity=".42" />
            <stop offset="1" stop-color="#38bdf8" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path v-if="areaPath" :d="areaPath" fill="url(#template-key-trend-fill)" />
        <polyline
          v-if="linePoints"
          :points="linePoints"
          fill="none"
          stroke="#7dd3fc"
          stroke-width="1.8"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <div v-if="loading && !points.length" class="template-key-trend__empty">正在加载模板历史数据...</div>
      <div v-else-if="error" class="template-key-trend__empty">{{ error }}</div>
      <div v-else-if="!points.length" class="template-key-trend__empty">暂无 {{ keyName }} 历史数据</div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { formatAggregateNumber, useTemplateKeyTrend, type TemplateRuntimeDevices } from './templateAggregate';
  const props = defineProps<{
    config?: Record<string, any>;
    ctx?: { runtimeDevices?: TemplateRuntimeDevices | null };
  }>();
  const devices = computed(() => props.ctx?.runtimeDevices || {});
  const keyName = computed(() => String(props.config?.settings?.key || 'temperature'));
  const timeWindowMs = computed(() => Number(props.config?.timewindow?.intervalMs || 3600000));
  const decimals = computed(() => Number(props.config?.settings?.decimals ?? 1));
  const { points, loading, error } = useTemplateKeyTrend(keyName, devices, timeWindowMs);
  const bounds = computed(() => {
    const values = points.value.map((point) => point.value);
    return { min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0 };
  });
  const normalized = computed(() => {
    const span = bounds.value.max - bounds.value.min || 1;
    return points.value.map((point, index) => ({
      x: points.value.length <= 1 ? 50 : (index / (points.value.length - 1)) * 100,
      y: 46 - ((point.value - bounds.value.min) / span) * 40,
    }));
  });
  const linePoints = computed(() =>
    normalized.value.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '),
  );
  const areaPath = computed(() =>
    linePoints.value ? `M 0 50 L ${linePoints.value.replaceAll(' ', ' L ')} L 100 50 Z` : '',
  );
  const latestValue = computed(() => formatAggregateNumber(points.value.at(-1)?.value || 0, decimals.value));
  const rangeText = computed(
    () =>
      `${formatAggregateNumber(bounds.value.min, decimals.value)} - ${formatAggregateNumber(bounds.value.max, decimals.value)}`,
  );
</script>
<style scoped>
  .template-key-trend {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
  }
  .template-key-trend__meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .template-key-trend__meta div {
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid rgba(125, 211, 252, 0.14);
    border-radius: 8px;
    background: rgba(8, 47, 73, 0.12);
  }
  .template-key-trend__meta span {
    display: block;
    color: rgba(226, 242, 255, 0.58);
    font-size: 10px;
  }
  .template-key-trend__meta strong {
    display: block;
    margin-top: 3px;
    overflow: hidden;
    color: #bae6fd;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .template-key-trend__chart {
    position: relative;
    min-height: 0;
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(14, 116, 144, 0.08), rgba(2, 6, 23, 0.04));
    overflow: hidden;
  }
  .template-key-trend__chart svg {
    width: 100%;
    height: 100%;
  }
  .template-key-trend__empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: rgba(226, 242, 255, 0.55);
    font-size: 12px;
  }
</style>
