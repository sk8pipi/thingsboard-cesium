<template>
  <div class="tb-card">
    <div class="tb-header">
      <div class="tb-title">{{ props.config?.title || '状态图' }}</div>

      <div class="tb-controls">
        <select class="tb-select" :value="selectedWindowMs" @change="onWindowChange">
          <option :value="60000">近 1 分钟</option>
          <option :value="120000">近 2 分钟</option>
          <option :value="300000">近 5 分钟</option>
          <option :value="600000">近 10 分钟</option>
          <option :value="1800000">近 30 分钟</option>
          <option :value="3600000">近 1 小时</option>
          <option :value="21600000">近 6 小时</option>
          <option :value="86400000">近 24 小时</option>
        </select>
      </div>
    </div>

    <div v-if="error" class="tb-error">{{ error }}</div>
    <div v-else class="tb-chart" ref="chartEl"></div>

    <div class="tb-footer">
      <span v-if="updatedAt">更新：{{ new Date(updatedAt).toLocaleString() }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import * as echarts from 'echarts';

  type Point = { ts: number; value: number | string | null };

  type WidgetRuntimeData = {
    timeWindowMs: number;
    series: Record<string, Point[]>;
    updatedAt: number;
    error?: string;
    setTimeWindow?: (ms: number) => void;
  };

  const props = defineProps<{
    widgetId?: string;
    config?: any;
    data?: WidgetRuntimeData;
  }>();

  const ds = computed(() => props.config?.datasource || null);

  const keys = computed<string[]>(() => {
    const dataKeys = ds.value?.dataKeys;
    if (Array.isArray(dataKeys) && dataKeys.length) {
      return dataKeys.map((item: any) => item?.name).filter(Boolean);
    }

    const k = ds.value?.keys;
    if (Array.isArray(k)) return k.filter(Boolean);
    if (typeof k === 'string') return k.split(',').map((s: string) => s.trim()).filter(Boolean);
    return [];
  });

  const updatedAt = computed(() => props.data?.updatedAt || 0);
  const error = computed(() => props.data?.error || '');
  const timeWindowMs = computed(() => selectedWindowMs.value);

  const chartEl = ref<HTMLDivElement | null>(null);
  let chart: echarts.ECharts | null = null;
  let ro: ResizeObserver | null = null;
  let axisTimer: number | null = null;
  const selectedWindowMs = ref<number>(3600000);

  function onWindowChange(e: Event) {
    const v = Number((e.target as HTMLSelectElement).value);
    const next = Number.isFinite(v) ? v : 3600000;
    selectedWindowMs.value = next;

    props.data?.setTimeWindow?.(next);
    renderChart();
  }

  function buildSeries() {
    const all = props.data?.series || {};
    const ks = keys.value;
    const now = Date.now();
    const minTs = now - timeWindowMs.value;

    return ks.map((k) => {
      const pts = (all[k] || [])
        .filter((p) => {
          if (p.value === null || p.value === undefined || p.value === '') return false;
          return p.ts >= minTs && p.ts <= now;
        })
        .map((p) => [p.ts, Number(p.value)] as [number, number])
        .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));

      return {
        name: k,
        type: 'line',
        step: props.config?.settings?.stepPosition || 'end',
        showSymbol: false,
        connectNulls: false,
        data: pts,
      };
    });
  }

  function renderChart() {
    if (!chartEl.value) return;
    if (!chart) chart = echarts.init(chartEl.value);

    const series = buildSeries();
    const hasData = series.some((s: any) => s?.data?.length);

    const now = Date.now();
    const minTs = now - timeWindowMs.value;
    const maxTs = now;

    const option: echarts.EChartsOption = {
      animation: false,
      tooltip: { trigger: 'axis' },
      legend: { show: keys.value.length > 1 },
      grid: { left: 36, right: 16, top: 18, bottom: 28 },
      xAxis: {
        type: 'time',
        min: minTs,
        max: maxTs,
      },
      yAxis: {
        type: 'value',
        scale: true,
      },
      series,
      graphic: hasData
        ? undefined
        : [
            {
              type: 'text',
              left: 'center',
              top: 'middle',
              style: {
                text: '暂无状态数据',
                fill: '#aaa',
                fontSize: 12,
              },
            },
          ],
    };

    chart.setOption(option, { notMerge: true, lazyUpdate: true });
    chart.resize();
  }

  watch(
    () => props.data?.timeWindowMs,
    (v) => {
      if (typeof v === 'number' && Number.isFinite(v)) {
        if (selectedWindowMs.value !== v) selectedWindowMs.value = v;
      }
    },
    { immediate: true },
  );

  watch(
    () => props.data?.series,
    () => {
      renderChart();
    },
    { deep: true },
  );

  watch(
    () => props.config,
    () => {
      renderChart();
    },
    { deep: true },
  );

  onMounted(() => {
    renderChart();

    axisTimer = window.setInterval(() => {
      renderChart();
    }, 1000);

    if (chartEl.value) {
      ro = new ResizeObserver(() => {
        try {
          chart?.resize();
        } catch {}
      });
      ro.observe(chartEl.value);
    }
  });

  onBeforeUnmount(() => {
    if (axisTimer) {
      window.clearInterval(axisTimer);
      axisTimer = null;
    }
    try {
      ro?.disconnect();
    } catch {}
    ro = null;
    try {
      chart?.dispose();
    } catch {}
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

  .tb-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .tb-select {
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    border-radius: 10px;
    padding: 6px 8px;
    outline: none;
    font-size: 12px;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
  }

  .tb-select option,
  .tb-select optgroup {
    background: rgba(25, 30, 40, 0.98);
    color: #fff;
  }
</style>