<template>
  <div class="area-key-compare">
    <div class="area-key-compare__head">
      <div>
        <span>{{ rangeLabel }}</span>
        <strong>{{ title }}</strong>
      </div>
      <button type="button" :disabled="loading" @click="reload">刷新</button>
    </div>

    <div v-if="error" class="area-key-compare__state is-error">{{ error }}</div>
    <div v-else-if="loading && !hasData" class="area-key-compare__state">正在计算对比数据...</div>
    <div v-else ref="chartEl" class="area-key-compare__chart"></div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import * as echarts from 'echarts';
  import {
    DEFAULT_CUMULATIVE_KEYS,
    fetchDevicePeriodValues,
    formatUsageNumber,
    resolveTimeRange,
    type UsageDeviceValue,
  } from './resourceUsage';

  type SelectedDevice = { id: string; name: string };

  const props = defineProps<{
    config?: Record<string, any>;
  }>();

  const chartEl = ref<HTMLDivElement | null>(null);
  const rows = ref<UsageDeviceValue[]>([]);
  const loading = ref(false);
  const error = ref('');
  let chart: echarts.ECharts | null = null;
  let ro: ResizeObserver | null = null;
  let requestId = 0;

  const settings = computed(() => props.config?.settings || {});
  const title = computed(() => String(props.config?.title || settings.value.title || '区域 key 对比'));
  const devices = computed<SelectedDevice[]>(() => {
    const selected = settings.value.deviceSelector?.devices || settings.value.devices || [];
    return (Array.isArray(selected) ? selected : [])
      .map((device: any) => ({
        id: String(device.id || device.deviceId || ''),
        name: String(device.name || device.deviceName || device.id || ''),
      }))
      .filter((device) => device.id);
  });
  const keys = computed<string[]>(() =>
    (Array.isArray(settings.value.keys) ? settings.value.keys : [])
      .map((key: unknown) => String(key || '').trim())
      .filter(Boolean),
  );
  const cumulativeKeys = computed<string[]>(() =>
    (Array.isArray(settings.value.cumulativeKeys) ? settings.value.cumulativeKeys : DEFAULT_CUMULATIVE_KEYS).map(
      String,
    ),
  );
  const timeRange = computed(() => String(settings.value.timeRange || 'today'));
  const hasData = computed(() => rows.value.length > 0);
  const rangeLabel = computed(() => {
    const map: Record<string, string> = {
      today: '今日',
      yesterdaySameTime: '昨日同期',
      currentHour: '当前小时',
      month: '本月累计',
      last24h: '最近24小时',
      last7d: '最近7天',
    };
    return map[timeRange.value] || '自定义范围';
  });

  async function reload() {
    const currentDevices = devices.value;
    const currentKeys = keys.value;
    const currentRequest = ++requestId;
    if (!currentDevices.length || !currentKeys.length) {
      rows.value = [];
      error.value = '';
      renderChart();
      return;
    }

    loading.value = true;
    try {
      const range = resolveTimeRange(timeRange.value);
      const results = await Promise.all(
        currentKeys.map((key) =>
          fetchDevicePeriodValues(currentDevices, key, range.startTs, range.endTs, cumulativeKeys.value.includes(key)),
        ),
      );
      if (currentRequest !== requestId) return;
      rows.value = results.flat();
      error.value = '';
      renderChart();
    } catch (reason: any) {
      if (currentRequest !== requestId) return;
      error.value = reason?.message || String(reason);
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }

  function renderChart() {
    if (!chartEl.value) return;
    if (!chart) chart = echarts.init(chartEl.value);

    const categories = devices.value.map((device) => device.name);
    const series = keys.value.map((key) => ({
      name: key,
      type: 'bar',
      barMaxWidth: 30,
      data: devices.value.map((device) => {
        const found = rows.value.find((row) => row.deviceId === device.id && row.key === key);
        return Number((found?.value || 0).toFixed(3));
      }),
    }));

    chart.setOption(
      {
        animation: false,
        color: ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#f97316', '#14b8a6'],
        grid: { left: 42, right: 14, top: 34, bottom: 42 },
        tooltip: {
          trigger: 'axis',
          valueFormatter: (value: unknown) => formatUsageNumber(Number(value), 2),
        },
        legend: {
          top: 0,
          textStyle: { color: 'rgba(226, 242, 255, .76)' },
        },
        xAxis: {
          type: 'category',
          data: categories,
          axisLabel: { color: 'rgba(226, 242, 255, .72)', interval: 0, overflow: 'truncate', width: 86 },
          axisLine: { lineStyle: { color: 'rgba(148, 163, 184, .35)' } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: 'rgba(226, 242, 255, .66)' },
          splitLine: { lineStyle: { color: 'rgba(148, 163, 184, .13)' } },
        },
        series,
        graphic: rows.value.length
          ? undefined
          : [
              {
                type: 'text',
                left: 'center',
                top: 'middle',
                style: { text: '暂无数据', fill: 'rgba(226, 242, 255, .56)', fontSize: 12 },
              },
            ],
      },
      { notMerge: true, lazyUpdate: true },
    );
    chart.resize();
  }

  watch(
    () => JSON.stringify([devices.value, keys.value, cumulativeKeys.value, timeRange.value]),
    () => reload(),
    { immediate: true },
  );

  onMounted(() => {
    renderChart();
    if (chartEl.value) {
      ro = new ResizeObserver(() => chart?.resize());
      ro.observe(chartEl.value);
    }
  });

  onBeforeUnmount(() => {
    requestId += 1;
    ro?.disconnect();
    chart?.dispose();
    chart = null;
  });
</script>

<style scoped>
  .area-key-compare {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    color: #e0f2fe;
  }

  .area-key-compare__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .area-key-compare__head span {
    display: block;
    color: rgba(226, 242, 255, 0.56);
    font-size: 11px;
  }

  .area-key-compare__head strong {
    display: block;
    margin-top: 3px;
    color: #dff8ff;
    font-size: 14px;
  }

  .area-key-compare__head button {
    flex: 0 0 auto;
    border: 1px solid rgba(125, 211, 252, 0.22);
    border-radius: 7px;
    background: rgba(8, 47, 73, 0.35);
    color: #bae6fd;
    padding: 5px 9px;
    cursor: pointer;
    font-size: 12px;
  }

  .area-key-compare__head button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .area-key-compare__chart {
    min-height: 0;
    width: 100%;
    height: 100%;
  }

  .area-key-compare__state {
    display: grid;
    place-items: center;
    color: rgba(226, 242, 255, 0.62);
    font-size: 12px;
  }

  .area-key-compare__state.is-error {
    color: #fca5a5;
  }
</style>
