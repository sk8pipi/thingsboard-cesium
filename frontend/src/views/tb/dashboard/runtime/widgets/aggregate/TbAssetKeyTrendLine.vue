<template>
  <div class="asset-key-trend">
    <header class="asset-key-trend__head">
      <h3 class="asset-key-trend__title" :title="title">{{ title }}</h3>
      <div class="asset-key-trend__latest" :title="latestTooltip">
        <span>最新值</span><strong>{{ latestText }}</strong>
      </div>
      <div class="asset-key-trend__range" role="group" aria-label="趋势时间范围">
        <button
          v-for="option in rangeOptions"
          :key="option.value"
          type="button"
          :class="{ active: activeRange === option.value }"
          :aria-pressed="activeRange === option.value"
          @click="setRange(option.value)"
          >{{ option.label }}</button
        >
      </div>
    </header>
    <div class="asset-key-trend__body">
      <div ref="chartEl" class="asset-key-trend__chart"></div>
      <div v-if="sourceError" class="asset-key-trend__state is-error">{{ sourceError }}</div>
      <div v-else-if="loading && !points.length" class="asset-key-trend__state">正在读取趋势数据...</div>
      <div v-else-if="error && !points.length" class="asset-key-trend__state is-error">{{ error }}</div>
      <div v-else-if="!points.length" class="asset-key-trend__state">暂无趋势数据</div>
      <div v-if="error && points.length" class="asset-key-trend__notice">{{ error }}</div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import * as echarts from 'echarts';
  import { getLatestTimeseries, getTimeseries } from '/@/api/tb/telemetry';
  import { EntityType } from '/@/enums/entityTypeEnum';

  type TrendRange = 'last24h' | 'last7d';
  type TrendPoint = { ts: number; value: number };
  type TrendSource = { entityType: EntityType; entityId: string; entityName: string; key: string };
  type TrendCache = {
    version: 1;
    points: TrendPoint[];
    latestValue: number | null;
    latestTs: number | null;
  };

  const props = withDefaults(defineProps<{ widgetId?: string; config?: Record<string, any> }>(), {
    widgetId: '',
    config: () => ({}),
  });
  const DAY_MS = 86400000;
  const RANGE_CONFIG = {
    last24h: { windowMs: DAY_MS, intervalMs: 300000 },
    last7d: { windowMs: 7 * DAY_MS, intervalMs: 3600000 },
  };
  const rangeOptions: Array<{ value: TrendRange; label: string }> = [
    { value: 'last7d', label: '近7天' },
    { value: 'last24h', label: '近24小时' },
  ];
  const chartEl = ref<HTMLDivElement | null>(null);
  const points = ref<TrendPoint[]>([]);
  const latestValue = ref<number | null>(null);
  const latestTs = ref<number | null>(null);
  const loading = ref(false);
  const error = ref('');
  let chart: echarts.ECharts | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let pollTimer: number | undefined;
  let requestId = 0;
  let lastRenderedSignature = '';

  const settings = computed(() => props.config?.settings || {});
  const datasource = computed(() => props.config?.datasource || props.config?.datasources?.[0] || {});
  const source = computed<TrendSource | null>(() => {
    const assetId = String(settings.value.sourceAssetId || '').trim();
    const configuredKey = String(settings.value.sourceTelemetryKey || '').trim();
    if (assetId && configuredKey) {
      return {
        entityType: EntityType.ASSET,
        entityId: assetId,
        entityName: String(settings.value.sourceAssetName || datasource.value.entityName || assetId),
        key: configuredKey,
      };
    }

    // V1 widgets compared many devices and keys. The first configured pair is
    // selected deterministically so every old dashboard instance can render.
    const legacyDevice = (settings.value.deviceSelector?.devices || settings.value.devices || [])[0] || {};
    const entityId = String(datasource.value.entityId || legacyDevice.id || legacyDevice.deviceId || '').trim();
    const key = String(
      datasource.value.keys?.[0] || datasource.value.dataKeys?.[0]?.name || settings.value.keys?.[0] || '',
    ).trim();
    if (!entityId || !key) return null;
    return {
      entityType:
        String(datasource.value.entityType || '').toUpperCase() === 'ASSET' ? EntityType.ASSET : EntityType.DEVICE,
      entityId,
      entityName: String(datasource.value.entityName || legacyDevice.name || legacyDevice.deviceName || entityId),
      key,
    };
  });
  const sourceSignature = computed(() => {
    const value = source.value;
    return value ? `${value.entityType}:${value.entityId}:${value.key}` : '';
  });
  const configuredRange = computed<TrendRange>(() => (settings.value.timeRange === 'last7d' ? 'last7d' : 'last24h'));
  const activeRange = ref<TrendRange>(configuredRange.value);
  const unit = computed(() => {
    if (settings.value.unit !== undefined && settings.value.unit !== null) return String(settings.value.unit).trim();
    const dataKey = (datasource.value.dataKeys || []).find((item: any) => String(item?.name) === source.value?.key);
    return String(dataKey?.units || '').trim();
  });
  const decimals = computed(() => {
    const value = Number(settings.value.decimals ?? 2);
    return Number.isFinite(value) ? Math.min(6, Math.max(0, Math.round(value))) : 2;
  });

  const title = computed(() => {
    const configured = String(props.config?.title || settings.value.title || '').trim();
    if (configured && !['区域 key 对比', '区域 key 对比柱状图'].includes(configured)) return configured;
    return source.value ? `${source.value.entityName} ${source.value.key}趋势` : '资产 Key 趋势';
  });
  const latestText = computed(() => {
    const value = formatNumber(latestValue.value);
    return unit.value && value !== '--' ? `${value} ${unit.value}` : value;
  });
  const latestTooltip = computed(() =>
    latestTs.value ? `${new Date(latestTs.value).toLocaleString('zh-CN')} · ${latestText.value}` : latestText.value,
  );
  const sourceError = computed(() => (source.value ? '' : '旧部件缺少可迁移的数据源，请删除后重新生成。'));

  function numericValue(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function formatNumber(value: number | null) {
    if (value === null || !Number.isFinite(value)) return '--';
    return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: decimals.value }).format(value);
  }
  function normalizePoints(value: unknown): TrendPoint[] {
    if (!Array.isArray(value)) return [];
    const byTimestamp = new Map<number, number>();
    value.forEach((item: any) => {
      const ts = Number(item?.ts ?? item?.[0]);
      const pointValue = numericValue(item?.value ?? item?.[1]);
      if (Number.isFinite(ts) && pointValue !== null) byTimestamp.set(ts, pointValue);
    });
    return Array.from(byTimestamp, ([ts, pointValue]) => ({ ts, value: pointValue })).sort((a, b) => a.ts - b.ts);
  }
  function extractPoints(response: unknown, key: string) {
    const sourceData = (response as any)?.[key];
    return normalizePoints(Array.isArray(sourceData) ? sourceData : sourceData?.data);
  }

  function storageSuffix() {
    const value = source.value;
    return value
      ? [props.widgetId || 'shared', value.entityType, value.entityId, encodeURIComponent(value.key)].join('.')
      : '';
  }
  function rangeStorageKey() {
    const suffix = storageSuffix();
    return suffix ? `tb.asset-key-trend.range.v1.${suffix}` : '';
  }
  function cacheStorageKey(range: TrendRange) {
    const suffix = storageSuffix();
    return suffix ? `tb.asset-key-trend.data.v1.${suffix}.${range}` : '';
  }
  function readStoredRange(): TrendRange | null {
    try {
      const key = rangeStorageKey();
      const value = key ? localStorage.getItem(key) : null;
      return value === 'last24h' || value === 'last7d' ? value : null;
    } catch {
      return null;
    }
  }
  function persistRange(range: TrendRange) {
    try {
      const key = rangeStorageKey();
      if (key) localStorage.setItem(key, range);
    } catch {
      // Private browsing can disable storage; live telemetry still works.
    }
  }
  function readCache(range: TrendRange): TrendCache | null {
    try {
      const key = cacheStorageKey(range);
      const parsed = key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.points)) return null;
      return {
        version: 1,
        points: normalizePoints(parsed.points),
        latestValue: numericValue(parsed.latestValue),
        latestTs: numericValue(parsed.latestTs),
      };
    } catch {
      return null;
    }
  }
  function persistCache(range: TrendRange) {
    try {
      const key = cacheStorageKey(range);
      if (!key) return;
      const payload: TrendCache = {
        version: 1,
        points: points.value,
        latestValue: latestValue.value,
        latestTs: latestTs.value,
      };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // Cache write failure must not stop the chart.
    }
  }
  function restoreCache(range: TrendRange) {
    const cache = readCache(range);
    const startTs = Date.now() - RANGE_CONFIG[range].windowMs;
    points.value = (cache?.points || []).filter((point) => point.ts >= startTs);
    latestValue.value = cache?.latestValue ?? null;
    latestTs.value = cache?.latestTs ?? null;
    lastRenderedSignature = '';
    renderChart();
  }

  async function loadRange() {
    requestId += 1;
    error.value = '';
    if (!source.value) {
      points.value = [];
      latestValue.value = null;
      latestTs.value = null;
      renderChart();
      return;
    }
    restoreCache(activeRange.value);
    await syncData();
  }

  async function syncData() {
    const currentSource = source.value;
    if (!currentSource) return;
    const currentRange = activeRange.value;
    const currentRequest = ++requestId;
    const rangeConfig = RANGE_CONFIG[currentRange];
    const endTs = Date.now();
    const windowStartTs = endTs - rangeConfig.windowMs;
    const cachedLastTs = points.value.at(-1)?.ts;
    const startTs = cachedLastTs ? Math.max(windowStartTs, cachedLastTs - rangeConfig.intervalMs) : windowStartTs;
    const limit = Math.min(10000, Math.ceil((endTs - startTs) / rangeConfig.intervalMs) + 8);

    loading.value = true;
    try {
      const [seriesResponse, latestResponse] = await Promise.all([
        getTimeseries({
          entityType: currentSource.entityType,
          entityId: currentSource.entityId,
          keys: currentSource.key,
          startTs,
          endTs,
          interval: rangeConfig.intervalMs,
          limit,
          agg: 'AVG',
          orderBy: 'ASC',
          useStrictDataTypes: true,
        }),
        getLatestTimeseries(
          { entityType: currentSource.entityType, id: currentSource.entityId } as any,
          currentSource.key,
          true,
        ),
      ]);
      if (currentRequest !== requestId) return;

      const incoming = extractPoints(seriesResponse, currentSource.key);
      const merged = normalizePoints([...points.value, ...incoming]).filter((point) => point.ts >= windowStartTs);
      const latestPoint = extractPoints(latestResponse, currentSource.key).at(-1) || null;
      const previousSignature = dataSignature(points.value, latestValue.value, latestTs.value);
      const nextLatestValue = latestPoint?.value ?? latestValue.value;
      const nextLatestTs = latestPoint?.ts ?? latestTs.value;
      const nextSignature = dataSignature(merged, nextLatestValue, nextLatestTs);

      if (previousSignature !== nextSignature) {
        points.value = merged;
        latestValue.value = nextLatestValue;
        latestTs.value = nextLatestTs;
        persistCache(currentRange);
        renderChart();
      }
      error.value = '';
    } catch (reason: any) {
      if (currentRequest !== requestId) return;
      error.value = reason?.message || String(reason) || '趋势数据读取失败';
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }
  function dataSignature(data: TrendPoint[], value: number | null, timestamp: number | null) {
    const last = data.at(-1);
    return `${data.length}:${last?.ts || 0}:${last?.value ?? ''}:${timestamp || 0}:${value ?? ''}`;
  }

  function renderChart() {
    if (!chartEl.value) return;
    if (!chart) chart = echarts.init(chartEl.value);
    const signature = `${activeRange.value}:${unit.value}:${points.value
      .map((point) => `${point.ts}:${point.value}`)
      .join('|')}`;
    if (signature === lastRenderedSignature) return;
    lastRenderedSignature = signature;

    chart.setOption(
      {
        animation: false,
        grid: { left: 48, right: 18, top: 16, bottom: 38 },
        tooltip: {
          trigger: 'axis',
          confine: true,
          backgroundColor: 'rgba(3, 18, 31, 0.94)',
          borderColor: 'rgba(125, 211, 252, 0.22)',
          borderWidth: 1,
          padding: [7, 9],
          textStyle: { color: '#e0f2fe', fontSize: 12 },
          extraCssText: 'border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.28);',
          axisPointer: { type: 'line' },
          formatter: (params: any) => {
            const item = Array.isArray(params) ? params[0] : params;
            const timestamp = Number(item?.value?.[0] ?? item?.axisValue);
            const value = numericValue(item?.value?.[1]);
            const formatted = formatNumber(value);
            const suffix = unit.value && formatted !== '--' ? ` ${unit.value}` : '';
            return `${new Date(timestamp).toLocaleString('zh-CN')}<br/>${source.value?.key || ''}：${formatted}${suffix}`;
          },
        },
        xAxis: {
          type: 'time',
          boundaryGap: false,
          axisLine: { lineStyle: { color: 'rgba(148, 214, 255, 0.2)' } },
          axisTick: { lineStyle: { color: 'rgba(148, 214, 255, 0.2)' } },
          axisLabel: {
            hideOverlap: true,
            color: 'rgba(226, 242, 255, 0.52)',
            fontSize: 11,
            formatter: (value: number) => {
              const date = new Date(value);
              return activeRange.value === 'last7d'
                ? `${date.getMonth() + 1}/${date.getDate()}`
                : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            },
          },
        },
        yAxis: {
          type: 'value',
          name: unit.value,
          nameGap: 10,
          nameTextStyle: { color: 'rgba(226, 242, 255, 0.52)', fontSize: 11 },
          scale: true,
          splitNumber: 4,
          axisLabel: { color: 'rgba(226, 242, 255, 0.52)', fontSize: 11 },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: 'rgba(148, 214, 255, 0.12)' } },
        },
        series: [
          {
            name: source.value?.key || '',
            type: 'line',
            showSymbol: false,
            connectNulls: false,
            sampling: 'lttb',
            lineStyle: { width: 2, color: '#38bdf8', opacity: 0.86 },
            itemStyle: { color: '#38bdf8' },
            emphasis: {
              lineStyle: { color: '#7dd3fc', opacity: 1 },
              itemStyle: { color: '#7dd3fc' },
            },
            areaStyle: { color: 'rgba(56, 189, 248, 0.08)' },
            data: points.value.map((point) => [point.ts, point.value]),
          },
        ],
      },
      { notMerge: true, lazyUpdate: true },
    );
  }

  function setRange(range: TrendRange) {
    if (activeRange.value !== range) activeRange.value = range;
  }
  watch(
    sourceSignature,
    () => {
      const nextRange = readStoredRange() || configuredRange.value;
      if (activeRange.value !== nextRange) activeRange.value = nextRange;
      else void loadRange();
    },
    { immediate: true },
  );
  watch(activeRange, (range) => {
    persistRange(range);
    void loadRange();
  });
  watch([unit, decimals], () => {
    lastRenderedSignature = '';
    renderChart();
  });

  onMounted(() => {
    renderChart();
    if (chartEl.value) {
      resizeObserver = new ResizeObserver(() => chart?.resize());
      resizeObserver.observe(chartEl.value);
    }
    const pollMs = Math.max(30000, Number(settings.value.pollMs || 60000));
    pollTimer = window.setInterval(() => void syncData(), pollMs);
  });
  onBeforeUnmount(() => {
    requestId += 1;
    if (pollTimer) window.clearInterval(pollTimer);
    resizeObserver?.disconnect();
    chart?.dispose();
    chart = null;
  });
</script>

<style scoped>
  .asset-key-trend {
    container-type: inline-size;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    color: #e0f2fe;
  }
  .asset-key-trend__head {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 0 4px 8px;
  }
  .asset-key-trend__title {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    margin: 0;
    color: #dff8ff;
    font-size: 16px;
    font-weight: 700;
    line-height: 28px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .asset-key-trend__latest {
    min-width: 108px;
    flex: none;
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 7px;
    white-space: nowrap;
  }
  .asset-key-trend__latest span {
    color: rgba(226, 242, 255, 0.58);
    font-size: 11px;
  }
  .asset-key-trend__latest strong {
    color: #bae6fd;
    font-size: 14px;
  }
  .asset-key-trend__range {
    flex: none;
    display: inline-flex;
    align-items: center;
    border: 1px solid rgba(125, 211, 252, 0.18);
    border-radius: 8px;
    background: rgba(8, 47, 73, 0.12);
    padding: 2px;
  }
  .asset-key-trend__range button {
    appearance: none;
    border: 0;
    border-radius: 6px;
    background: transparent;
    padding: 4px 9px;
    color: rgba(226, 242, 255, 0.58);
    font: inherit;
    font-size: 11px;
    line-height: 18px;
    cursor: pointer;
  }
  .asset-key-trend__range button:hover,
  .asset-key-trend__range button:focus-visible {
    color: #e0f2fe;
    outline: none;
  }
  .asset-key-trend__range button.active {
    background: rgba(56, 189, 248, 0.2);
    color: #bae6fd;
    box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.16);
  }

  .asset-key-trend__body {
    position: relative;
    height: 100%;
    min-height: 180px;
    overflow: hidden;
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(14, 116, 144, 0.08), rgba(2, 6, 23, 0.04));
  }
  .asset-key-trend__chart {
    width: 100%;
    height: 100%;
    min-height: 180px;
  }
  .asset-key-trend__state {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: rgba(226, 242, 255, 0.62);
    font-size: 12px;
  }
  .asset-key-trend__state.is-error {
    color: #fca5a5;
  }
  .asset-key-trend__notice {
    position: absolute;
    right: 10px;
    bottom: 8px;
    color: #fca5a5;
    font-size: 10px;
  }
  @container (max-width: 520px) {
    .asset-key-trend__head {
      gap: 6px;
      padding-right: 0;
      padding-left: 2px;
    }
    .asset-key-trend__title {
      font-size: 14px;
    }
    .asset-key-trend__latest span {
      display: none;
    }
    .asset-key-trend__range button {
      padding: 3px 6px;
      font-size: 10px;
    }
  }
</style>
