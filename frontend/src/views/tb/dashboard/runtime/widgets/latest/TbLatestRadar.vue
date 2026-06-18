<template>
  <div class="tb-card">
    <div class="tb-header">
      <div class="tb-title">{{ widgetTitle }}</div>
    </div>

    <div v-if="errorMessage" class="tb-error">
      {{ errorMessage }}
    </div>

    <div v-else-if="!canRenderRadar" class="tb-empty">
      雷达图至少需要 3 个 key
    </div>

    <div v-else ref="chartEl" class="tb-chart"></div>

    <div v-if="displayItems.length" class="tb-footer">
      <div class="tb-legend">
        <div
          v-for="item in displayItems"
          :key="item.name"
          class="tb-legend-item"
        >
          <span
            class="tb-legend-dot"
            :style="{ backgroundColor: item.color }"
          ></span>
          <span class="tb-legend-name">{{ item.label }}</span>
          <span class="tb-legend-value">{{ formatNumber(item.value) }}</span>
        </div>

        <div v-if="showTotal" class="tb-legend-item tb-legend-item-total">
          <span class="tb-legend-dot total-dot"></span>
          <span class="tb-legend-name">总数</span>
          <span class="tb-legend-value">{{ formatNumber(totalValue) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue';
import * as echarts from 'echarts';

interface DataKeyLike {
  name: string;
  label: string;
  color: string;
  value: number;
}

const props = defineProps<{
  datasource?: any;
  config?: any;
  widget?: any;
  data?: any;
}>();

const attrs = useAttrs();

const chartEl = ref<HTMLDivElement | null>(null);
const errorMessage = ref('');

let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const fallbackColors = [
  '#22c55e',
  '#ef4444',
  '#facc15',
  '#3b82f6',
  '#a855f7',
  '#14b8a6',
  '#f97316',
  '#ec4899',
];

const widgetTitle = computed(() => {
  return (
    props.widget?.title ||
    props.config?.title ||
    props.widget?.config?.title ||
    'Radar'
  );
});

const radarSettings = computed(() => {
  return (
    props.config?.tbRadar ||
    props.widget?.config?.tbRadar ||
    props.config?.settings?.tbRadar ||
    props.widget?.config?.settings?.tbRadar ||
    {}
  );
});

const showTotal = computed(() => radarSettings.value.showTotal !== false);

function normalizeNumber(val: any): number {
  if (val == null || val === '') return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function pickLastValue(input: any): number {
  if (input == null) return 0;

  if (typeof input === 'number' || typeof input === 'string') {
    return normalizeNumber(input);
  }

  if (Array.isArray(input)) {
    if (!input.length) return 0;

    const last = input[input.length - 1];

    if (Array.isArray(last)) {
      return normalizeNumber(last[last.length - 1]);
    }

    if (typeof last === 'object' && last) {
      if ('value' in last) return normalizeNumber(last.value);
      if ('latestValue' in last) return normalizeNumber(last.latestValue);
      if ('v' in last) return normalizeNumber(last.v);
      if ('y' in last) return normalizeNumber(last.y);
      if ('data' in last) return pickLastValue(last.data);
    }

    return normalizeNumber(last);
  }

  if (typeof input === 'object') {
    if ('value' in input) return normalizeNumber(input.value);
    if ('latestValue' in input) return normalizeNumber(input.latestValue);
    if ('v' in input) return normalizeNumber(input.v);
    if ('y' in input) return normalizeNumber(input.y);
    if ('latest' in input) return pickLastValue(input.latest);
    if ('last' in input) return pickLastValue(input.last);
    if ('data' in input) return pickLastValue(input.data);
  }

  return 0;
}

function safeLower(val: any) {
  return String(val ?? '').trim().toLowerCase();
}

function writeValue(map: Record<string, number>, key: any, value: number) {
  if (key == null || key === '') return;
  const raw = String(key).trim();
  if (!raw) return;
  map[raw] = value;
  map[safeLower(raw)] = value;
}

function getNodeNames(node: any): string[] {
  const names = [
    node?.dataKey?.name,
    node?.dataKey?.label,
    node?.key,
    node?.keyName,
    node?.name,
    node?.label,
  ].filter(Boolean);

  return Array.from(new Set(names.map((x) => String(x).trim()).filter(Boolean)));
}

function looksLikeSeriesNode(node: any) {
  if (!node || typeof node !== 'object') return false;

  return (
    !!node?.dataKey ||
    Array.isArray(node?.data) ||
    'value' in node ||
    'latestValue' in node ||
    'latest' in node ||
    'last' in node
  );
}

function collectSeriesNodes(root: any, out: any[], visited = new WeakSet(), depth = 0) {
  if (!root || typeof root !== 'object') return;
  if (visited.has(root)) return;
  if (depth > 8) return;

  visited.add(root);

  if (Array.isArray(root)) {
    for (const item of root) {
      collectSeriesNodes(item, out, visited, depth + 1);
    }
    return;
  }

  if (looksLikeSeriesNode(root) && getNodeNames(root).length) {
    out.push(root);
  }

  for (const value of Object.values(root)) {
    if (value && typeof value === 'object') {
      collectSeriesNodes(value, out, visited, depth + 1);
    }
  }
}

function getConfiguredDataKeys(): any[] {
  const sources = [
    props.datasource?.dataKeys,
    props.config?.datasource?.dataKeys,
    props.config?.datasources?.[0]?.dataKeys,
    props.widget?.config?.datasource?.dataKeys,
    props.widget?.config?.datasources?.[0]?.dataKeys,
    (attrs as any)?.datasource?.dataKeys,
    (attrs as any)?.config?.datasource?.dataKeys,
    (attrs as any)?.config?.datasources?.[0]?.dataKeys,
  ];

  for (const arr of sources) {
    if (Array.isArray(arr) && arr.length) return arr;
  }

  return [];
}

const dataKeyDefs = computed(() => {
  const arr = getConfiguredDataKeys();

  return arr.map((item: any, index: number) => ({
    name: item?.name || `key_${index + 1}`,
    label: item?.label || item?.name || `Key ${index + 1}`,
    color: item?.color || fallbackColors[index % fallbackColors.length],
  }));
});

const runtimeValueMap = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {};

  const directObjects = [
    props.datasource?.latestValues,
    props.datasource?.latest,
    props.datasource?.values,
    props.datasource?.valueMap,
    props.datasource?.dataMap,

    props.widget?.latestValues,
    props.widget?.latest,
    props.widget?.values,
    props.widget?.valueMap,
    props.widget?.dataMap,

    props.config?.latestValues,
    props.config?.latest,
    props.config?.values,
    props.config?.valueMap,
    props.config?.dataMap,

    props.data?.latestValues,
    props.data?.latest,
    props.data?.values,
    props.data?.valueMap,
    props.data?.dataMap,

    (attrs as any)?.latestValues,
    (attrs as any)?.latest,
    (attrs as any)?.values,
    (attrs as any)?.valueMap,
    (attrs as any)?.dataMap,
  ];

  for (const obj of directObjects) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    for (const [key, value] of Object.entries(obj)) {
      writeValue(map, key, pickLastValue(value));
    }
  }

  const directLists = [
    props.datasource?.data,
    props.datasource?.series,
    props.datasource?.latestData,
    props.datasource?.items,

    props.widget?.data,
    props.widget?.series,
    props.widget?.latestData,
    props.widget?.items,

    props.config?.data,
    props.config?.series,
    props.config?.latestData,
    props.config?.items,

    props.data?.data,
    props.data?.series,
    props.data?.latestData,
    props.data?.items,

    (attrs as any)?.data,
    (attrs as any)?.series,
    (attrs as any)?.latestData,
    (attrs as any)?.items,
  ];

  for (const list of directLists) {
    if (!Array.isArray(list)) continue;

    for (const item of list) {
      if (!item || typeof item !== 'object') continue;

      const names = getNodeNames(item);
      const value = pickLastValue(item);

      for (const name of names) {
        writeValue(map, name, value);
      }
    }
  }

  const recursiveRoots = [
    props.datasource,
    props.widget,
    props.config,
    props.data,
    attrs,
  ];

  const collected: any[] = [];
  for (const root of recursiveRoots) {
    collectSeriesNodes(root, collected);
  }

  for (const node of collected) {
    const names = getNodeNames(node);
    const value = pickLastValue(node);

    for (const name of names) {
      writeValue(map, name, value);
    }
  }

  return map;
});

function getValueForKey(name: string, label: string) {
  const aliases = [
    name,
    label,
    safeLower(name),
    safeLower(label),
  ].filter(Boolean);

  for (const alias of aliases) {
    if (alias in runtimeValueMap.value) {
      return runtimeValueMap.value[alias];
    }
  }

  return 0;
}

const displayItems = computed<DataKeyLike[]>(() => {
  return dataKeyDefs.value.map((item) => ({
    name: item.name,
    label: item.label,
    color: item.color,
    value: getValueForKey(item.name, item.label),
  }));
});

const canRenderRadar = computed(() => displayItems.value.length >= 3);

const totalValue = computed(() => {
  return displayItems.value.reduce((sum, item) => sum + normalizeNumber(item.value), 0);
});

const radarMax = computed(() => {
  const maxVal = Math.max(...displayItems.value.map((x) => x.value), 0);

  if (maxVal <= 0) return 10;
  if (maxVal <= 10) return 12;
  if (maxVal <= 20) return 24;
  if (maxVal <= 50) return 60;
  if (maxVal <= 100) return 120;

  return Math.ceil(maxVal * 1.2);
});

function formatNumber(val: number) {
  if (!Number.isFinite(val)) return '0';
  return Number(val.toFixed(2)).toString();
}

function buildOption(): echarts.EChartsOption {
  const items = displayItems.value;
  const values = items.map((item) => item.value);

  return {
    animation: false,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter() {
        return items
          .map((item) => `${item.label}: ${formatNumber(item.value)}`)
          .join('<br/>');
      },
    },
    radar: {
      center: ['50%', '42%'],
      radius: radarSettings.value.radius || '58%',
      shape: radarSettings.value.shape || 'polygon',
      splitNumber: radarSettings.value.splitNumber || 4,
      axisName: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: 600,
      },
      splitArea: {
        areaStyle: {
          color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.04)'],
        },
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255,255,255,0.18)',
        },
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(255,255,255,0.18)',
        },
      },
      indicator: items.map((item) => ({
        name: item.label,
        min: 0,
        max: radarMax.value,
      })),
    },
    series: [
      {
        type: 'radar',
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: radarSettings.value.lineWidth || 2,
          color: '#4f6cf6',
        },
        itemStyle: {
          color: '#4f6cf6',
        },
        areaStyle: {
          color: `rgba(79,108,246,${radarSettings.value.areaOpacity ?? 0.2})`,
        },
        data: [
          {
            value: values,
            name: widgetTitle.value,
          },
        ],
      },
    ],
  };
}

function disposeChart() {
  if (chart) {
    chart.dispose();
    chart = null;
  }
}

async function renderChart() {
  errorMessage.value = '';

  if (!canRenderRadar.value) {
    disposeChart();
    return;
  }

  await nextTick();

  if (!chartEl.value) return;

  try {
    if (!chart) {
      chart = echarts.init(chartEl.value);
    }

    chart.setOption(buildOption(), true);
    chart.resize();
  } catch (err: any) {
    console.error('[TbLatestRadar] render failed:', err);
    console.log('[TbLatestRadar] dataKeyDefs =', dataKeyDefs.value);
    console.log('[TbLatestRadar] runtimeValueMap =', runtimeValueMap.value);
    console.log('[TbLatestRadar] displayItems =', displayItems.value);
    console.log('[TbLatestRadar] datasource =', props.datasource);
    console.log('[TbLatestRadar] widget =', props.widget);
    console.log('[TbLatestRadar] config =', props.config);
    console.log('[TbLatestRadar] data =', props.data);
    console.log('[TbLatestRadar] attrs =', attrs);

    errorMessage.value = err?.message || '雷达图渲染失败';
    disposeChart();
  }
}

onMounted(async () => {
  await renderChart();

  if (chartEl.value) {
    resizeObserver = new ResizeObserver(() => {
      chart?.resize();
    });
    resizeObserver.observe(chartEl.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  disposeChart();
});

watch(
  () => ({
    items: displayItems.value.map((item) => ({
      name: item.name,
      label: item.label,
      color: item.color,
      value: item.value,
    })),
    title: widgetTitle.value,
    settings: radarSettings.value,
  }),
  async () => {
    await renderChart();
  },
  { deep: true, immediate: true }
);
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
  background: linear-gradient(180deg, #1f2937 0%, #111827 100%);
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

.tb-empty {
  flex: 1;
  min-height: 220px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.75);
  font-size: 13px;
  background: rgba(255, 255, 255, 0.04);
}

.tb-footer {
  margin-top: 8px;
  opacity: 0.9;
  font-size: 11px;
}

.tb-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  align-items: center;
}

.tb-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.85);
}

.tb-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.total-dot {
  background: rgba(255, 255, 255, 0.4);
}

.tb-legend-name {
  font-size: 12px;
}

.tb-legend-value {
  font-size: 20px;
  line-height: 1;
  font-weight: 700;
  color: #fff;
}

.tb-legend-item-total {
  margin-left: auto;
}
</style>