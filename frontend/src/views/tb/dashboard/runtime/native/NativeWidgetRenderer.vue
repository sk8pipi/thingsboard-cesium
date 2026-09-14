<template>
  <div class="native-widget">
    <div v-if="props.config?.showTitle !== false && props.config?.title" class="native-title">{{
      props.config.title
    }}</div>
    <div v-if="data.loading" class="native-empty" role="status">正在读取数据…</div>
    <template v-else>
      <div v-if="warnings.length" class="native-warning" role="status">{{ warnings.join('；') }}</div>
      <div v-if="!options || !data.series.length" class="native-empty">{{
        options ? '请选择实体与数据字段' : '部件配置不完整'
      }}</div>
      <template v-else>
        <div v-if="['value', 'valueChart', 'progress'].includes(options.family)" class="native-values">
          <div v-for="series in data.series" :key="series.id" class="native-value">
            <span v-if="options.showLabel" class="native-label">{{ series.label }}</span>
            <strong :style="{ fontSize: `${fontSize}px`, color: seriesColor(series) }">{{
              formatted(series.latest?.value, series)
            }}</strong>
            <div
              v-if="options.family === 'progress'"
              class="native-progress"
              role="progressbar"
              :aria-label="series.label"
              :aria-valuemin="options.min"
              :aria-valuemax="options.max"
              :aria-valuenow="numeric(series.latest?.value) ?? undefined"
            >
              <div
                v-if="progress(series) !== null"
                :style="{ width: `${progress(series)}%`, background: seriesColor(series) }"
              ></div>
            </div>
            <small v-if="options.showDate && series.latest">{{ timestamp(series.latest.ts) }}</small>
          </div>
        </div>
        <template v-if="options.family === 'table'">
          <div class="native-table-scroll">
            <table>
              <thead
                ><tr
                  ><th>时间</th><th v-for="series in data.series" :key="series.id">{{ series.label }}</th></tr
                ></thead
              >
              <tbody
                ><tr v-for="row in table.rows" :key="row.ts"
                  ><td>{{ timestamp(row.ts) }}</td
                  ><td v-for="series in data.series" :key="series.id">{{
                    formatted(row.values[series.id], series)
                  }}</td></tr
                ></tbody
              >
            </table>
            <div v-if="!table.total" class="native-empty">时间范围内暂无数据</div>
          </div>
          <div class="native-pagination"
            ><button :disabled="table.page <= 1" @click="page = table.page - 1">上一页</button
            ><span>{{ table.page }} / {{ table.totalPages }} · {{ table.total }} 条</span
            ><button :disabled="table.page >= table.totalPages" @click="page = table.page + 1">下一页</button></div
          >
        </template>
        <div v-else-if="usesChart" class="native-chart-wrap">
          <div ref="chartElement" class="native-chart"></div>
          <div v-if="!hasChartData" class="native-chart-empty">{{
            historical ? '时间范围内暂无数值数据' : '暂无数值数据'
          }}</div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import * as echarts from 'echarts';
  import type { TbWidgetConfig } from '../types';
  import type { NativeOptions } from './nativeWidgetTypes';
  import { useNativeWidgetData } from './nativeWidgetData';
  import {
    formatNativeValue,
    nativeNumber,
    nativeTableRows,
    nativeThresholdColor,
    type NativeDataConfig,
    type NativeSeries,
  } from './nativeWidgetDataCore';

  const props = defineProps<{ config?: TbWidgetConfig; widgetId?: string; data?: unknown }>();
  const options = computed<NativeOptions | null>(() =>
    props.config?.native?.version === 1 ? props.config.native : null,
  );
  const dataConfig = computed<NativeDataConfig | null>(() =>
    options.value
      ? ({ native: options.value, datasources: props.config?.datasources || [] } as NativeDataConfig)
      : null,
  );
  const data = useNativeWidgetData(dataConfig);
  const page = ref(1);
  const table = computed(() => nativeTableRows(data.value.series, page.value));
  const fontSize = computed(() => Math.max(10, Math.min(96, Number(options.value?.fontSize) || 24)));
  const historical = computed(() => ['timeseries', 'valueChart'].includes(options.value?.family || ''));
  const usesChart = computed(() =>
    ['valueChart', 'gauge', 'timeseries', 'pie', 'bar'].includes(options.value?.family || ''),
  );
  const numeric = nativeNumber;
  const warnings = computed(() => {
    const result = [...data.value.errors];
    data.value.series.forEach((series) => {
      if (series.error) result.push(`${series.label}：${series.error}`);
      if (series.truncated) result.push(`${series.label}：仅显示最近 2000 个数据点，请缩小时间范围或增大聚合间隔`);
    });
    if (['progress', 'gauge'].includes(options.value?.family || '') && !validRange.value)
      result.push('最小值与最大值无效');
    if (options.value?.family === 'pie' && data.value.series.some((series) => (numeric(series.latest?.value) ?? 0) < 0))
      result.push('饼图不展示负值');
    return result;
  });
  const validRange = computed(
    () =>
      Number.isFinite(options.value?.min) &&
      Number.isFinite(options.value?.max) &&
      options.value!.max > options.value!.min,
  );
  const hasChartData = computed(() =>
    data.value.series.some((series) =>
      historical.value
        ? series.points.some((point) => numeric(point.value) !== null)
        : numeric(series.latest?.value) !== null &&
          (options.value?.family !== 'pie' || Number(series.latest?.value) >= 0),
    ),
  );
  function formatted(value: unknown, series: NativeSeries) {
    return formatNativeValue(value, series.key.decimals ?? 2, series.key.units);
  }
  function timestamp(ts: number) {
    return ts ? new Date(ts).toLocaleString() : '更新时间未知';
  }
  function seriesColor(series: NativeSeries, value: unknown = series.latest?.value) {
    return nativeThresholdColor(value, options.value!, series.key.color || '#6ce9ff');
  }
  function progress(series: NativeSeries) {
    const value = numeric(series.latest?.value);
    return value === null || !validRange.value
      ? null
      : Math.max(0, Math.min(100, ((value - options.value!.min) / (options.value!.max - options.value!.min)) * 100));
  }
  const chartElement = ref<HTMLDivElement | null>(null);
  let chart: echarts.ECharts | null = null;
  let observer: ResizeObserver | null = null;
  function disposeChart() {
    observer?.disconnect();
    observer = null;
    chart?.dispose();
    chart = null;
  }
  function chartOptions(): echarts.EChartsOption {
    const native = options.value!;
    const series = data.value.series;
    const legend = { show: native.showLegend, type: 'scroll' as const, textStyle: { color: '#dae9f6' }, top: 0 };
    const base: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      animation: false,
      legend,
      textStyle: { color: '#dae9f6', fontFamily: 'inherit' },
      tooltip: { trigger: 'item', renderMode: 'richText', confine: true },
    };
    if (historical.value)
      return {
        ...base,
        tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
        grid: { left: 48, right: 16, top: native.showLegend ? 38 : 15, bottom: 32, containLabel: true },
        xAxis: { type: 'time', axisLabel: { color: '#bcd0df' } },
        yAxis: {
          type: 'value',
          scale: true,
          axisLabel: { color: '#bcd0df' },
          splitLine: { lineStyle: { color: 'rgba(200,220,255,.12)' } },
        },
        series: series
          .filter((entry) => entry.key.type === 'timeseries')
          .map((entry) => ({
            id: entry.id,
            name: entry.label,
            type: native.chartType || 'line',
            showSymbol: false,
            connectNulls: false,
            itemStyle: { color: entry.key.color || '#6ce9ff' },
            lineStyle: { color: entry.key.color || '#6ce9ff' },
            tooltip: { valueFormatter: (value: any) => formatted(value, entry) },
            data: entry.points.map((point) => ({
              value: [point.ts, numeric(point.value)],
              itemStyle: { color: seriesColor(entry, point.value) },
            })),
          })),
      };
    if (native.family === 'gauge')
      return {
        ...base,
        legend: { show: false },
        series: validRange.value
          ? series.map((entry, index) => ({
              id: entry.id,
              name: entry.label,
              type: 'gauge',
              min: native.min,
              max: native.max,
              center: [`${((index + 0.5) / series.length) * 100}%`, '55%'],
              radius: `${Math.min(80, 170 / series.length)}%`,
              itemStyle: { color: seriesColor(entry) },
              axisLine: { lineStyle: { width: 8, color: [[1, 'rgba(200,220,255,.16)']] } },
              axisTick: { show: false },
              splitLine: { length: 8, lineStyle: { color: '#8198ac' } },
              axisLabel: { color: '#bcd0df', fontSize: 10 },
              progress: { show: true, width: 8 },
              title: { show: native.showLabel, color: '#dae9f6', fontSize: 12, offsetCenter: [0, '90%'] },
              detail: {
                color: seriesColor(entry),
                fontSize: fontSize.value,
                formatter: (value: number) => formatted(value, entry),
              },
              data:
                numeric(entry.latest?.value) === null
                  ? []
                  : [{ name: entry.label, value: numeric(entry.latest?.value)! }],
            }))
          : [],
      };
    if (native.family === 'pie')
      return {
        ...base,
        series: [
          {
            type: 'pie',
            radius: ['0%', '65%'],
            center: ['50%', '56%'],
            stillShowZeroSum: false,
            label: {
              show: native.showLabel,
              color: '#dae9f6',
              formatter: (params: any) => {
                const entry = series.find((item) => item.id === params.data?.id);
                return entry ? `${entry.label}: ${formatted(params.value, entry)}` : '';
              },
            },
            data: series
              .filter((entry) => numeric(entry.latest?.value) !== null && Number(entry.latest?.value) >= 0)
              .map((entry) => ({
                id: entry.id,
                name: entry.label,
                value: Number(entry.latest?.value),
                itemStyle: { color: seriesColor(entry) },
              })),
          },
        ],
      };
    return {
      ...base,
      legend: { show: false },
      grid: { left: 12, right: 28, top: 12, bottom: 18, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: '#bcd0df' },
        splitLine: { lineStyle: { color: 'rgba(200,220,255,.12)' } },
      },
      yAxis: {
        type: 'category',
        data: series.map((entry) => entry.label),
        axisLabel: { color: '#bcd0df', show: native.showLabel },
      },
      series: [
        {
          type: 'bar',
          data: series.map((entry) => ({
            value: numeric(entry.latest?.value),
            itemStyle: { color: seriesColor(entry) },
          })),
          label: {
            show: native.showLabel,
            position: 'right',
            color: '#dae9f6',
            formatter: (params: any) => formatted(params.value, series[params.dataIndex]),
          },
        },
      ],
    };
  }
  let unmounted = false;
  async function renderChart() {
    await nextTick();
    if (unmounted) return;
    if (!chartElement.value || !options.value || !usesChart.value) {
      disposeChart();
      return;
    }
    if (chart && chart.getDom() !== chartElement.value) disposeChart();
    if (!chart) {
      chart = echarts.init(chartElement.value);
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(chartElement.value);
    }
    chart.setOption(chartOptions(), { notMerge: true });
    chart.resize();
  }
  watch(
    [data, options, chartElement],
    () => {
      void renderChart();
    },
    { deep: true, flush: 'post' },
  );
  watch(dataConfig, () => {
    page.value = 1;
  });
  onBeforeUnmount(() => {
    unmounted = true;
    disposeChart();
  });
</script>

<style scoped>
  .native-widget {
    width: 100%;
    height: 100%;
    min-height: 100px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
    color: #dae9f6;
    background: transparent;
  }
  .native-title {
    font-weight: 600;
    padding: 4px 8px;
  }
  .native-warning {
    font-size: 12px;
    color: #ffc97a;
    max-height: 60px;
    overflow: auto;
    padding: 0 8px;
  }
  .native-empty {
    margin: auto;
    padding: 12px;
    color: #a8bdce;
    text-align: center;
  }
  .native-values {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-around;
    gap: 12px;
    padding: 8px;
    overflow: auto;
  }
  .native-value {
    display: flex;
    flex: 1 1 140px;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    text-align: center;
  }
  .native-label {
    overflow-wrap: anywhere;
    font-size: 12px;
    color: #bcd0df;
  }
  .native-value small {
    font-size: 11px;
    color: #9eb6c9;
  }
  .native-progress {
    height: 12px;
    border-radius: 6px;
    overflow: hidden;
    background: rgba(200, 220, 255, 0.12);
  }
  .native-progress > div {
    height: 100%;
    border-radius: inherit;
  }
  .native-chart-wrap {
    position: relative;
    flex: 1;
    min-height: 100px;
  }
  .native-chart {
    position: absolute;
    inset: 0;
  }
  .native-chart-empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    color: #a8bdce;
  }
  .native-table-scroll {
    overflow: auto;
    flex: 1;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    white-space: nowrap;
  }
  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(200, 220, 255, 0.12);
    text-align: left;
  }
  th {
    color: #bcd0df;
    font-weight: 500;
  }
  .native-pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    font-size: 12px;
  }
  button {
    border: 1px solid rgba(200, 220, 255, 0.25);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    padding: 3px 8px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
