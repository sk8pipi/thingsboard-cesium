<template>
  <div class="tb-card">
    <div class="tb-header">
      <div class="tb-title">时序散点图</div>

      <div class="tb-controls">
        <select class="tb-select" :value="selectedWindowMs" @change="onWindowChange">
          <option :value="60000">近 1 分钟</option>
          <option :value="120000">近 2 分钟</option>
          <option :value="300000">近 5 分钟</option>
          <option :value="600000">近 10 分钟</option>
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

  const DEBUG = false;
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
  const selectedWindowMs = ref<number>(300000);

  function onWindowChange(e: Event) {
    const v = Number((e.target as HTMLSelectElement).value);
    const next = Number.isFinite(v) ? v : 300000;
    selectedWindowMs.value = next;

    props.data?.setTimeWindow?.(next);
    renderChart();
  }

  function buildSeries() {
    const all = props.data?.series || {};
    const ks = keys.value;

    if (DEBUG) {
      console.log('[scatter] keys =', ks);
    }
    if (DEBUG) {
      console.log('[scatter] series =', all);
    }

    return ks.map((k) => {
      const raw = all[k] || [];

      const pts = raw
        .map((p) => {
          const ts = Number(p.ts);
          const val = Number(p.value);
          if (!Number.isFinite(ts) || !Number.isFinite(val)) return null;
          return [ts, val] as [number, number];
        })
        .filter(Boolean) as [number, number][];

      if (DEBUG) {
        console.log(`[scatter] ${k} pts.length =`, pts.length);
        console.log(`[scatter] ${k} first =`, pts[0]);
        console.log(`[scatter] ${k} last =`, pts[pts.length - 1]);
      }

      return {
        name: k,
        type: 'scatter',
        symbolSize: 14,
        data: pts,
        itemStyle: {
          color: '#5B8FF9',
        },
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

    if (DEBUG) {
      console.log('[scatter] window =', {
        minTs,
        maxTs,
        minText: new Date(minTs).toLocaleString(),
        maxText: new Date(maxTs).toLocaleString(),
      });
    }

    const option: echarts.EChartsOption = {
      animation: false,
      grid: { left: 36, right: 16, top: 18, bottom: 28 },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const ts = params.value?.[0];
          const val = params.value?.[1];
          return `${params.seriesName}<br/>时间：${new Date(ts).toLocaleString()}<br/>值：${val}`;
        },
      },
      legend: { show: keys.value.length > 1 },
      xAxis: { type: 'time', min: minTs, max: maxTs },
      yAxis: { type: 'value', scale: true },
      series,
      graphic: hasData
        ? undefined
        : [
            {
              type: 'text',
              left: 'center',
              top: 'middle',
              style: { text: '暂无数据（等待历史/实时推送）', fill: '#aaa', fontSize: 12 },
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

  if (DEBUG) {
    console.log('TbTimeseriesScatter props', props.config, props.data);
  }
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
  }
  .tb-select {
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    border-radius: 10px;
    padding: 6px 8px;
    outline: none;
    font-size: 12px;

    /* ✅ 避免系统默认浅色外观 */
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
  }

  /* ✅ 关键：下拉展开项背景色（Chrome/Edge 通常生效） */
  .tb-select option {
    background: rgba(25, 30, 40, 0.98);
    color: #fff;
  }

  /* 有的浏览器会用 optgroup */
  .tb-select optgroup {
    background: rgba(25, 30, 40, 0.98);
    color: #fff;
  }
</style>
