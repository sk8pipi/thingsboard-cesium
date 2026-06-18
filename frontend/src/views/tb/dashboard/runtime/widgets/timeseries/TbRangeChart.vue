<template>
  <div class="tb-card">
    <div class="tb-header">
      <div class="tb-title">{{ props.config?.title || 'Range chart' }}</div>
      <div class="tb-controls">
        <select class="tb-select" :value="selectedWindowMs" @change="onWindowChange">
          <option :value="60000">近 1 分钟</option>
          <option :value="120000">近 2 分钟</option>
          <option :value="300000">近 5 分钟</option>
          <option :value="600000">近 10 分钟</option>
          <option :value="1800000">近 30 分钟</option>
          <option :value="3600000">近 1 小时</option>
        </select>
      </div>
    </div>

    <div class="color-legend">
      <div
        v-for="r in ranges"
        :key="r.name"
        class="legend-item"
        :style="{ background: visibleRanges[r.name] ? r.color : '#666' }"
        @click="toggleRange(r.name)"
      >
        {{ r.name }}
      </div>
    </div>

    <div class="tb-subtitle">实时 - 最后 {{ windowText }}</div>

    <div v-if="error" class="tb-error">{{ error }}</div>
    <div v-else class="tb-chart" ref="chartEl"></div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
  import * as echarts from 'echarts';

  type Point = { ts: number; value: number | null };
  type WidgetRuntimeData = {
    timeWindowMs: number;
    series: Record<string, Point[]>;
    updatedAt: number;
    error?: string;
    setTimeWindow?: (ms: number) => void;
  };

  const props = defineProps<{ widgetId?: string; config?: any; data?: WidgetRuntimeData }>();

  const error = computed(() => props.data?.error || '');
  const selectedWindowMs = ref<number>(60000);

  const chartEl = ref<HTMLDivElement | null>(null);
  let chart: echarts.ECharts | null = null;
  let axisTimer: number | null = null;
  let resizeObserver: ResizeObserver | null = null;

  // 区间定义
  const ranges = [
    { name: '<-20', gt: -Infinity, lte: -20, color: '#3399ff' },
    { name: '-20~0', gt: -20, lte: 0, color: '#3366ff' },
    { name: '0~10', gt: 0, lte: 10, color: '#33ff33' },
    { name: '10~20', gt: 10, lte: 20, color: '#ffff33' },
    { name: '20~30', gt: 20, lte: 30, color: '#ff9933' },
    { name: '30~40', gt: 30, lte: 40, color: '#ff3333' },
    { name: '>=40', gt: 40, lte: Infinity, color: '#990000' },
  ];

  const visibleRanges = ref<Record<string, boolean>>(
    ranges.reduce((acc, r) => {
      acc[r.name] = true;
      return acc;
    }, {} as Record<string, boolean>)
  );

  function toggleRange(name: string) {
    visibleRanges.value[name] = !visibleRanges.value[name];
    renderChart();
  }

  // 时间窗口文字
  const windowText = computed(() => {
    const ms = selectedWindowMs.value;
    if (ms === 60000) return '1 分钟';
    if (ms === 120000) return '2 分钟';
    if (ms === 300000) return '5 分钟';
    if (ms === 600000) return '10 分钟';
    if (ms === 1800000) return '30 分钟';
    if (ms === 3600000) return '1 小时';
    return `${Math.round(ms / 60000)} 分钟`;
  });

  function onWindowChange(e: Event) {
    const v = Number((e.target as HTMLSelectElement).value);
    selectedWindowMs.value = Number.isFinite(v) ? v : 60000;
    props.data?.setTimeWindow?.(selectedWindowMs.value);
    renderChart();
  }

  function toNumberMaybe(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function formatTime(ts: number) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  function getCurrentSeriesName() {
    const all = props.data?.series || {};
    const keys = Object.keys(all).slice(0, 1); // 只允许一个 key
    return keys[0] || '';
  }

  function buildSeriesData() {
    const all = props.data?.series || {};
    const now = Date.now();
    const minTs = now - selectedWindowMs.value;

    const keys = Object.keys(all).slice(0, 1);
    if (!keys.length) {
      return {
        seriesName: '',
        lineData: [] as [number, number][],
        hasData: false,
        now,
        minTs,
      };
    }

    const source = Array.isArray(all[keys[0]]) ? all[keys[0]] : [];

    const lineData = source
      .map((p) => ({
        ts: Number(p.ts),
        value: toNumberMaybe(p.value),
      }))
      .filter((p) => Number.isFinite(p.ts) && p.ts >= minTs && p.ts <= now && p.value !== null)
      .sort((a, b) => a.ts - b.ts)
      .map((p) => [p.ts, p.value as number] as [number, number]);

    return {
      seriesName: keys[0],
      lineData,
      hasData: lineData.length > 0,
      now,
      minTs,
    };
  }

  function getPieces() {
    return ranges.map((r) => ({
      ...r,
      color: visibleRanges.value[r.name] ? r.color : 'transparent',
    }));
  }

  function ensureChart() {
    if (!chartEl.value) return;
    if (!chart) {
      chart = echarts.init(chartEl.value);
    }
  }

  function renderChart() {
    if (!chartEl.value) return;
    ensureChart();
    if (!chart) return;

    const { lineData, hasData, seriesName, now, minTs } = buildSeriesData();

    const option: echarts.EChartsOption = {
      animation: false,
      grid: {
        left: 40,
        right: 16,
        top: 12,
        bottom: 28,
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        formatter(params: any) {
          const first = Array.isArray(params) ? params[0] : params;
          if (!first || !first.data) return '';
          const ts = first.data[0];
          const val = first.data[1];
          return `${formatTime(ts)}<br/>${seriesName}: ${val ?? '--'}`;
        },
        axisPointer: {
          type: 'line',
        },
      },
      xAxis: {
        type: 'time',
        min: minTs,
        max: now,
        boundaryGap: false,
        axisLabel: {
          color: 'rgba(255,255,255,0.75)',
          formatter(value: number) {
            return formatTime(value);
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: 'rgba(255,255,255,0.08)',
          },
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(255,255,255,0.2)',
          },
        },
        axisTick: {
          show: false,
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: 'rgba(255,255,255,0.75)',
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(255,255,255,0.08)',
          },
        },
        axisLine: {
          show: false,
        },
      },
      visualMap: {
        show: false,
        type: 'piecewise',
        dimension: 1,
        seriesIndex: 0,
        pieces: getPieces(),
        outOfRange: {
          color: 'transparent',
        },
      },
      series: [
        {
          name: seriesName,
          type: 'line',
          smooth: true,
          showSymbol: false,
          symbol: 'circle',
          symbolSize: 4,
          sampling: 'lttb',
          clip: true,
          data: lineData,
          lineStyle: {
            width: 2,
            color: '#ffffff',
          },
          areaStyle: {
            opacity: 0.35,
          },
          emphasis: {
            focus: 'series',
          },
        },
      ],
      graphic: hasData
        ? undefined
        : [
            {
              type: 'text',
              left: 'center',
              top: 'middle',
              silent: true,
              style: {
                text: '暂无数据',
                fill: '#aaa',
                fontSize: 12,
              },
            },
          ],
    };

    chart.setOption(option, true);
    chart.resize();
  }

  // 每秒强制推进时间窗口，即使没有新点，时间轴也会滚动
  function updateTimeAxis() {
    if (!chart || !props.data) return;

    const now = Date.now();
    const minTs = now - selectedWindowMs.value;
    const all = props.data.series || {};
    const keys = Object.keys(all).slice(0, 1);
    if (!keys.length) {
      chart.setOption(
        {
          xAxis: [{ data: [] }],
          series: [{ data: [] }],
          graphic: [
            {
              type: 'text',
              left: 'center',
              top: 'middle',
              style: { text: '暂无数据', fill: '#aaa', fontSize: 12 },
            },
          ],
        }, { notMerge: false });
      return;
    }

    const dataPoints = (all[keys[0]] || [])
      .filter(p => p.ts >= minTs && p.ts <= now)
      .map(p => ({ ts: p.ts, value: toNumberMaybe(p.value) }));

    const xData = dataPoints.map(d => formatTime(d.ts));
    const yData = dataPoints.map(d => d.value);
    const hasData = dataPoints.some(d => d.value !== null);

    chart.setOption({
        xAxis: [{ data: xData }],
        series: [{ data: yData }],
        graphic: hasData
          ? []
          : [
              {
                type: 'text',
                left: 'center',
                top: 'middle',
                style: { text: '暂无数据', fill: '#aaa', fontSize: 12 },
              },
            ],
    }, { notMerge: false });

    if (hasData) {
      chart.clear();
      renderChart();
    }
  }

  watch(
    () => props.data?.series,
    () => {
      updateTimeAxis();
    },
    { deep: true }
  );

  watch(
    () => props.data?.updatedAt,
    () => {
      updateTimeAxis();
    }
  );

  watch(
    () => selectedWindowMs.value,
    () => {
      renderChart();
    }
  );

  onMounted(async () => {
    await nextTick();
    renderChart();

    axisTimer = window.setInterval(() => {
      updateTimeAxis();
    }, 1000);

    if (chartEl.value) {
      resizeObserver = new ResizeObserver(() => {
        chart?.resize();
      });
      resizeObserver.observe(chartEl.value);
    }

    window.addEventListener('resize', handleResize);
  });

  function handleResize() {
    chart?.resize();
  }

  onBeforeUnmount(() => {
    if (axisTimer) {
      window.clearInterval(axisTimer);
      axisTimer = null;
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
    window.removeEventListener('resize', handleResize);
    chart?.dispose();
    chart = null;
  });
</script>

<style scoped>
  .tb-card {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 10px;
    box-sizing: border-box;
    color: #fff;
  }

  .tb-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .tb-title {
    font-weight: 700;
    font-size: 13px;
  }

  .tb-subtitle {
    opacity: 0.7;
    font-size: 12px;
    margin-bottom: 6px;
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

  .tb-select option {
    background: rgba(25, 30, 40, 0.98);
    color: #fff;
  }

  .color-legend {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    margin-bottom: 6px;
  }

  .legend-item {
    flex: 1;
    height: 18px;
    cursor: pointer;
    text-align: center;
    line-height: 18px;
    font-size: 10px;
    border-radius: 4px;
    user-select: none;
    white-space: nowrap;
    transition: all 0.2s ease;
  }
</style>
