<template>
  <div class="tb-card">
    <div class="tb-header">
      <div class="tb-title">{{ title }}</div>
    </div>

    <div v-if="error" class="tb-error">{{ error }}</div>
    <div v-else class="tb-chart" ref="chartEl"></div>

    <div class="tb-footer">
      <span v-if="updatedAt">更新：{{ new Date(updatedAt).toLocaleString() }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue';
import * as echarts from 'echarts';

type Point = { ts: number; value: number | string | null };

type WidgetRuntimeData = {
  timeWindowMs?: number;
  series?: Record<string, Point[]>;
  latestValues?: Record<string, number | string | null>;
  updatedAt: number;
  error?: string;
};

const props = defineProps<{
  widgetId?: string;
  config?: any;
  data?: WidgetRuntimeData;
}>();

const chartEl = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let ro: ResizeObserver | null = null;

const error = computed(() => props.data?.error || '');
const updatedAt = computed(() => props.data?.updatedAt || 0);
const title = computed(() => props.config?.title || props.config?.tbTitle || 'Bar');
const tbBar = computed(() => props.config?.tbBar || {});

function latestValueFromSeries(points: Point[]): number {
  if (!points?.length) return 0;
  const v = points[points.length - 1]?.value;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function readLatestValue(key: string): number {
  const latestMap = props.data?.latestValues || {};
  if (key in latestMap) {
    const n = Number(latestMap[key]);
    return Number.isFinite(n) ? n : 0;
  }

  const seriesMap = props.data?.series || {};
  return latestValueFromSeries(seriesMap[key] || []);
}

function buildBar() {
  const latestMap = props.data?.latestValues || {};
  const seriesMap = props.data?.series || {};

  const keys: string[] = Array.isArray(tbBar.value?.keys)
    ? tbBar.value.keys
    : Object.keys(latestMap).length
      ? Object.keys(latestMap)
      : Object.keys(seriesMap);

  const labelMap: Record<string, string> = tbBar.value?.labels || {};
  const colorMap: Record<string, string> = tbBar.value?.colors || {};

  const categories = keys.map((k) => labelMap[k] || k);
  const values = keys.map((k) => readLatestValue(k));

  const data = keys.map((k, idx) => {
    const c = colorMap[k];
    return c ? { value: values[idx], itemStyle: { color: c } } : values[idx];
  });

  return { categories, data, hasData: values.some((v) => v !== 0) };
}

function renderChart() {
  if (!chartEl.value) return;
  if (!chart) chart = echarts.init(chartEl.value);

  const { categories, data, hasData } = buildBar();

  const gridCfg = tbBar.value?.grid || {};
  const legendCfg = tbBar.value?.legend || {};
  const axisCfg = tbBar.value?.axis || {};
  const tooltipCfg = tbBar.value?.tooltip || {};

  const option: echarts.EChartsOption = {
    animation: false,
    grid: {
      left: gridCfg.left ?? 36,
      right: gridCfg.right ?? 16,
      top: gridCfg.top ?? 18,
      bottom: gridCfg.bottom ?? 36,
    },
    tooltip: tooltipCfg.show === false ? undefined : { trigger: 'axis' },
    legend: legendCfg.show
      ? {
          show: true,
          top: legendCfg.top ?? 'top',
          left: legendCfg.left ?? 'center',
          orient: legendCfg.orient ?? 'horizontal',
          textStyle: { color: '#fff' },
        }
      : undefined,
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { color: axisCfg.xLabelColor ?? '#fff' },
      axisLine: {
        lineStyle: { color: axisCfg.xAxisLineColor ?? 'rgba(255,255,255,0.35)' },
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: axisCfg.yLabelColor ?? '#fff' },
      splitLine: {
        lineStyle: { color: axisCfg.splitLineColor ?? 'rgba(255,255,255,0.12)' },
      },
    },
    series: [
      {
        name: title.value,
        type: 'bar',
        data,
        barMaxWidth: tbBar.value?.barMaxWidth ?? 28,
      },
    ],
    graphic: hasData
      ? undefined
      : [
          {
            type: 'text',
            left: 'center',
            top: 'middle',
            style: { text: '暂无数据', fill: '#aaa', fontSize: 12 },
          },
        ],
  };

  chart.setOption(option, { notMerge: true, lazyUpdate: true });
  chart.resize();
}

watchEffect(() => {
  void props.config;
  void props.data?.latestValues;
  void props.data?.series;
  void props.data?.updatedAt;
  renderChart();
});

onMounted(() => {
  console.log('TbLatestBar mounted', props.config, props.data);
  renderChart();
  if (chartEl.value) {
    ro = new ResizeObserver(() => {
      try { chart?.resize(); } catch {}
    });
    ro.observe(chartEl.value);
  }
});

onBeforeUnmount(() => {
  try { ro?.disconnect(); } catch {}
  ro = null;
  try { chart?.dispose(); } catch {}
  chart = null;
});
</script>

<style scoped>
.tb-card {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  padding: 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  color: #fff;
}

.tb-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}

.tb-title {
  font-weight: 700;
  font-size: 13px;
}

.tb-chart {
  flex: 1;
  min-height: 220px;
  width: 100%;
}

.tb-error {
  background: rgba(220, 38, 38, 0.9);
  border-radius: 10px;
  padding: 10px;
  font-size: 12px;
  white-space: pre-wrap;
}

.tb-footer {
  margin-top: 8px;
  opacity: 0.65;
  font-size: 11px;
}
</style>