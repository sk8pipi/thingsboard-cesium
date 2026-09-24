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
        <NativeLiquidView
          v-if="options.family === 'liquid'"
          :settings="data.liquid?.settings || options.liquid"
          :errors="[...(data.liquid?.errors || []), ...(data.series[0].error ? [data.series[0].error] : [])]"
          :value="data.series[0].latest?.value"
          :timestamp="data.series[0].latest?.ts"
          :decimals="data.series[0].key.decimals ?? 0"
          :font-size="options.fontSize"
          :date-format="options.presentation.dateFormat"
          :now="now"
        />
        <template v-if="options.family === 'aggregate'">
          <p v-if="options.aggregate.showSubtitle" class="native-aggregate-subtitle">{{
            options.aggregate.subtitle.replaceAll('${entityName}', props.config?.datasources?.[0]?.name || '')
          }}</p>
          <div class="native-aggregate-values">
            <div
              v-for="slot in options.aggregate.slots"
              :key="slot.id"
              class="native-aggregate-slot"
              :class="slot.position"
            >
              <small v-if="slot.label">{{ slot.label }}</small>
              <strong :style="{ fontSize: `${slot.fontSize}px`, color: slot.color }">{{ aggregateText(slot) }}</strong>
              <small v-if="aggregateValue(slot.id)?.error" role="status">{{ aggregateValue(slot.id)?.error }}</small>
              <small v-else-if="options.showDate && aggregateValue(slot.id)?.timestamp != null">{{
                timestamp(aggregateValue(slot.id)!.timestamp!)
              }}</small>
            </div>
          </div>
        </template>
        <div
          v-if="['value', 'valueChart', 'progress'].includes(options.family)"
          class="native-values"
          :class="`layout-${options.presentation.layout}`"
        >
          <div
            v-for="series in data.series"
            :key="series.id"
            class="native-value"
            :class="`label-${options.presentation.labelPosition}`"
          >
            <span
              v-if="options.showLabel"
              class="native-label"
              :style="{ fontSize: `${options.presentation.labelFontSize}px`, color: options.presentation.labelColor }"
              >{{ series.label }}</span
            >
            <strong
              v-if="options.presentation.showValue"
              :style="{ fontSize: `${fontSize}px`, color: seriesColor(series) }"
              >{{ formatted(series.latest?.value, series) }}</strong
            >
            <div
              v-if="options.family === 'progress'"
              class="native-progress"
              :class="{ 'progress-vertical': options.progress.direction === 'vertical' }"
              :style="{ background: options.progress.trackColor }"
              role="progressbar"
              :aria-label="series.label"
              :aria-valuemin="options.min"
              :aria-valuemax="options.max"
              :aria-valuenow="numeric(series.latest?.value) ?? undefined"
            >
              <div
                v-if="progress(series) !== null"
                :style="{
                  [options.progress.direction === 'vertical' ? 'height' : 'width']: `${progress(series)}%`,
                  background: seriesColor(series),
                }"
              ></div>
            </div>
            <div v-if="options.family === 'progress' && options.progress.showTicks" class="native-ticks"
              ><span>{{ options.min }}</span
              ><span>{{ options.max }}</span></div
            >
            <small v-if="options.showDate && series.latest">{{ timestamp(series.latest.ts) }}</small>
          </div>
        </div>
        <template v-if="options.family === 'table'">
          <input
            v-if="options.table.search"
            v-model="search"
            class="native-search"
            aria-label="搜索表格"
            placeholder="搜索表格"
          />
          <div class="native-table-scroll">
            <table :class="{ 'sticky-header': options.table.stickyHeader }">
              <thead
                ><tr
                  ><th v-if="options.table.showTimestamp">时间</th
                  ><th v-for="series in data.series" :key="series.id">{{ series.label }}</th></tr
                ></thead
              >
              <tbody
                ><tr v-for="row in table.rows" :key="row.ts"
                  ><td v-if="options.table.showTimestamp">{{ timestamp(row.ts) }}</td
                  ><td v-for="series in data.series" :key="series.id" :style="{ color: series.key.color }">{{
                    formatted(row.values[series.id], series)
                  }}</td></tr
                ></tbody
              >
            </table>
            <div v-if="!table.total" class="native-empty">时间范围内暂无数据</div>
          </div>
          <div v-if="options.table.pagination" class="native-pagination"
            ><button :disabled="table.page <= 1" @click="page = table.page - 1">上一页</button
            ><span>{{ table.page }} / {{ table.totalPages }} · {{ table.total }} 条</span
            ><button :disabled="table.page >= table.totalPages" @click="page = table.page + 1">下一页</button></div
          >
        </template>
        <div
          v-else-if="usesChart"
          class="native-chart-wrap"
          :class="options.family === 'radar' ? `radar-${options.chart.legendPosition}` : ''"
        >
          <div v-if="options.family === 'radar' && options.showLegend" class="native-radar-legend">
            <button
              v-for="series in data.series"
              :key="series.id"
              type="button"
              :aria-pressed="!radarHidden[series.id]"
              @click="radarHidden[series.id] = !radarHidden[series.id]"
            >
              <span :style="{ color: series.key.color || '#6ce9ff' }">●</span> {{ series.label }}
            </button>
          </div>
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
  import { nativeStatePoints } from './nativeStateCore';
  import NativeLiquidView from './NativeLiquidView';
  import type { TbWidgetConfig } from '../types';
  import type { NativeAggregateSlot } from './nativeWidgetTypes';
  import { withNativeSettings, nativeTimestamp } from './nativeWidgetSettings';
  import { nativeChartOptions } from './nativeWidgetChartOptions';
  import { useNativeWidgetData } from './nativeWidgetData';
  import {
    formatNativeValue,
    nativeNumber,
    nativeTableRows,
    nativeThresholdColor,
    nativeWindow,
    type NativeDataConfig,
    type NativeSeries,
  } from './nativeWidgetDataCore';

  const props = defineProps<{ config?: TbWidgetConfig; widgetId?: string; data?: unknown }>();
  const options = computed(() =>
    props.config?.native?.version === 1 ? withNativeSettings(props.config.native) : null,
  );
  const dataConfig = computed<NativeDataConfig | null>(() =>
    options.value
      ? ({ native: options.value, datasources: props.config?.datasources || [] } as NativeDataConfig)
      : null,
  );
  const data = useNativeWidgetData(dataConfig);
  const page = ref(1);
  const search = ref('');
  const radarHidden = ref<Record<string, boolean>>({});
  watch(
    () => props.config,
    () => {
      radarHidden.value = {};
    },
    { deep: true },
  );
  const table = computed(() =>
    nativeTableRows(data.value.series, page.value, options.value?.table.pageSize, {
      ...options.value?.table,
      query: options.value?.table.search ? search.value : '',
    }),
  );
  watch(search, () => {
    page.value = 1;
  });
  const fontSize = computed(() => Math.max(10, Math.min(96, Number(options.value?.fontSize) || 24)));
  const historical = computed(() =>
    ['timeseries', 'valueChart', 'bar', 'range', 'aggregate', 'state'].includes(options.value?.family || ''),
  );
  const now = ref(Date.now());
  const chartWindow = computed(() => {
    if (!historical.value || !options.value) return null;
    try {
      return nativeWindow(options.value, now.value);
    } catch {
      return null;
    }
  });
  watch(
    () =>
      (historical.value && (options.value?.window.realtime || options.value?.window.calendar)) ||
      ((options.value?.showDate ||
        options.value?.family === 'table' ||
        (options.value?.family === 'liquid' && options.value.liquid.showTooltipDate)) &&
        options.value?.presentation.dateFormat === 'relative'),
    (rolling, _previous, onCleanup) => {
      if (!rolling) return;
      now.value = Date.now();
      // Advance the visible window even when telemetry has not changed; polling stays independent.
      const timer = setInterval(() => {
        now.value = Date.now();
      }, 1000);
      onCleanup(() => clearInterval(timer));
    },
    { immediate: true },
  );
  const usesChart = computed(
    () =>
      [
        'valueChart',
        'gauge',
        'timeseries',
        'pie',
        'bar',
        'latestBar',
        'radar',
        'polar',
        'range',
        'aggregate',
        'state',
      ].includes(options.value?.family || '') &&
      (options.value?.family !== 'aggregate' || options.value.aggregate.showChart),
  );
  const numeric = nativeNumber;
  const warnings = computed(() => {
    const result = [...data.value.errors];
    data.value.series.forEach((series) => {
      if (series.error) result.push(`${series.label}：${series.error}`);
      if (series.truncated)
        result.push(
          `${series.label}：仅显示最近 2000 个数据点，请缩小时间范围${options.value?.family === 'state' ? '' : '或增大聚合间隔'}`,
        );
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
      options.value?.family === 'state'
        ? nativeStatePoints(series, options.value.state, chartWindow.value).some((point) => point.value !== null)
        : historical.value
          ? series.points.some((point) => numeric(point.value) !== null)
          : numeric(series.latest?.value) !== null &&
            (options.value?.family !== 'pie' || Number(series.latest?.value) >= 0),
    ),
  );
  function formatted(value: unknown, series: NativeSeries) {
    return formatNativeValue(value, series.key.decimals ?? 2, series.key.units);
  }
  function aggregateValue(id: string) {
    return data.value.aggregate?.find((value) => value.id === id);
  }
  function aggregateText(slot: NativeAggregateSlot) {
    const value = aggregateValue(slot.id)?.value;
    const rounded = value == null ? null : Number(value.toFixed(slot.decimals));
    const arrow = slot.showArrow && rounded ? (rounded > 0 ? '▲ ' : '▼ ') : '';
    return arrow + formatNativeValue(value, slot.decimals, slot.units);
  }
  function timestamp(ts: number) {
    return nativeTimestamp(ts, options.value?.presentation.dateFormat, now.value);
  }
  function seriesColor(series: NativeSeries, value: unknown = series.latest?.value) {
    return nativeThresholdColor(
      value,
      options.value!,
      options.value?.presentation.valueColor || series.key.color || '#6ce9ff',
    );
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
  let renderedConfig = '';
  function disposeChart() {
    observer?.disconnect();
    observer = null;
    chart?.dispose();
    chart = null;
    renderedConfig = '';
  }
  function chartOptions(): echarts.EChartsOption {
    const series =
      options.value?.family === 'radar'
        ? data.value.series.filter((entry) => !radarHidden.value[entry.id])
        : data.value.series;
    return nativeChartOptions(options.value!, series, chartWindow.value);
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
    const nextOptions = chartOptions();
    const signature = JSON.stringify(props.config);
    // Polling refreshes data without discarding the user's legend selection or zoom.
    if (signature === renderedConfig) {
      const previous = chart.getOption() as any;
      if (previous.legend?.[0]?.selected && nextOptions.legend)
        (nextOptions.legend as any).selected = previous.legend[0].selected;
      if (Array.isArray(nextOptions.dataZoom))
        nextOptions.dataZoom.forEach((zoom, index) => {
          const prior = previous.dataZoom?.[index];
          if (prior) Object.assign(zoom, { start: prior.start, end: prior.end });
        });
      if (Array.isArray(nextOptions.visualMap))
        nextOptions.visualMap.forEach((visual, index) => {
          const selected = previous.visualMap?.[index]?.selected;
          if (selected) Object.assign(visual, { selected });
        });
    }
    renderedConfig = signature;
    chart.setOption(nextOptions, { notMerge: true });
    chart.resize();
  }
  watch(
    [data, options, chartElement, radarHidden],
    () => {
      void renderChart();
    },
    { deep: true, flush: 'post' },
  );
  watch(dataConfig, () => {
    page.value = 1;
  });
  watch(chartWindow, (window) => {
    if (window && chart && !unmounted) {
      if (options.value?.family === 'state') void renderChart();
      else chart.setOption({ xAxis: { min: window.startTs, max: window.endTs } });
    }
  });
  onBeforeUnmount(() => {
    unmounted = true;
    disposeChart();
  });
</script>

<style scoped>
  .native-aggregate-subtitle {
    padding: 0 8px;
    margin: 0;
    color: #bcd0df;
  }
  .native-aggregate-values {
    display: grid;
    grid-template-columns: 1fr 1.3fr 1fr;
    grid-template-rows: repeat(2, minmax(35px, auto));
    padding: 8px;
    gap: 6px;
    flex-shrink: 0;
  }
  .native-aggregate-slot {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .native-aggregate-slot.center {
    grid-column: 2;
    grid-row: 1 / 3;
    text-align: center;
  }
  .native-aggregate-slot.leftTop {
    grid-column: 1;
    grid-row: 1;
  }
  .native-aggregate-slot.leftBottom {
    grid-column: 1;
    grid-row: 2;
  }
  .native-aggregate-slot.rightTop {
    grid-column: 3;
    grid-row: 1;
    text-align: right;
  }
  .native-aggregate-slot.rightBottom {
    grid-column: 3;
    grid-row: 2;
    text-align: right;
  }
  .native-radar-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 30%;
    overflow: auto;
    flex-shrink: 0;
  }
  .native-radar-legend button {
    color: #dae9f6;
    background: transparent;
    border: 0;
    font-size: 12px;
    cursor: pointer;
  }
  .native-radar-legend button[aria-pressed='false'] {
    opacity: 0.45;
    text-decoration: line-through;
  }
  .native-chart-wrap.radar-top,
  .native-chart-wrap.radar-bottom {
    display: flex;
    flex-direction: column;
  }
  .radar-bottom .native-radar-legend {
    order: 1;
  }
  .native-chart-wrap.radar-left,
  .native-chart-wrap.radar-right {
    display: flex;
  }
  .radar-left .native-radar-legend,
  .radar-right .native-radar-legend {
    flex-direction: column;
    flex-wrap: nowrap;
    max-height: 100%;
    max-width: 30%;
  }
  .radar-right .native-radar-legend {
    order: 1;
  }
  [class*='radar-'] > .native-chart {
    position: relative;
    inset: auto;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
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
  .native-values.layout-vertical {
    flex-direction: column;
    flex-wrap: nowrap;
  }
  .native-values.layout-vertical .native-value {
    flex-basis: auto;
  }
  .native-value.label-bottom .native-label {
    order: 2;
  }
  .native-value.label-left {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
  }
  .native-value.label-left .native-label {
    margin-right: 8px;
  }
  .native-ticks {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
  .native-progress.progress-vertical {
    width: 18px;
    height: 120px;
    min-height: 120px;
    align-self: center;
    display: flex;
    align-items: flex-end;
  }
  .native-progress.progress-vertical > div {
    width: 100%;
  }
  .native-search {
    margin: 4px 8px;
    padding: 6px;
    border: 1px solid rgba(200, 220, 255, 0.25);
    border-radius: 4px;
    background: transparent;
    color: inherit;
  }
  .sticky-header th {
    position: sticky;
    top: 0;
    background: rgba(25, 45, 65, 0.95);
    z-index: 1;
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
