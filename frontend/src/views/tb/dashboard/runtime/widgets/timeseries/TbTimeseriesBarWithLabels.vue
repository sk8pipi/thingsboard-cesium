<template>
  <div class="tb-card">
    <div class="tb-header">
      <div class="tb-title">{{ props.config?.title || 'Bar chart with labels' }}</div>
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
    <div class="tb-subtitle">实时 - 最后 {{ windowText }}</div>
    <div v-if="error" class="tb-error">{{ error }}</div>
    <div v-else class="tb-chart" ref="chartEl"></div>
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
      return dataKeys.map((item: any) => item?.label || item?.name).filter(Boolean);
    }

    const k = ds.value?.keys;
    if (Array.isArray(k)) return k.filter(Boolean);
    if (typeof k === 'string') return k.split(',').map((s: string) => s.trim()).filter(Boolean);
    return [];
  });

  const rawKeyNames = computed<string[]>(() => {
    const dataKeys = ds.value?.dataKeys;
    if (Array.isArray(dataKeys) && dataKeys.length) {
      return dataKeys.map((item: any) => item?.name).filter(Boolean);
    }

    const k = ds.value?.keys;
    if (Array.isArray(k)) return k.filter(Boolean);
    if (typeof k === 'string') return k.split(',').map((s: string) => s.trim()).filter(Boolean);
    return [];
  });

  const keyLabelMap = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    const dataKeys = ds.value?.dataKeys;
    if (Array.isArray(dataKeys) && dataKeys.length) {
      dataKeys.forEach((item: any) => {
        if (item?.name) map[item.name] = item?.label || item.name;
      });
    } else {
      rawKeyNames.value.forEach((k) => {
        map[k] = k;
      });
    }
    return map;
  });

  const error = computed(() => props.data?.error || '');
  const selectedWindowMs = ref<number>(60000);

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

  const chartEl = ref<HTMLDivElement | null>(null);
  let chart: echarts.ECharts | null = null;
  let ro: ResizeObserver | null = null;
  let axisTimer: number | null = null;
  const legendSelected = ref<Record<string, boolean>>({});

  function onWindowChange(e: Event) {
    const v = Number((e.target as HTMLSelectElement).value);
    const next = Number.isFinite(v) ? v : 60000;
    selectedWindowMs.value = next;
    props.data?.setTimeWindow?.(next);
    renderChart();
  }

  function toNumberMaybe(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
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

  function getMaxGroupCount(windowMs: number) {
    if (windowMs <= 60_000) return 12;       // 1分钟最多12组
    if (windowMs <= 120_000) return 12;      // 2分钟最多12组
    if (windowMs <= 300_000) return 15;      // 5分钟最多15组
    if (windowMs <= 600_000) return 15;      // 10分钟最多15组
    if (windowMs <= 1_800_000) return 18;    // 30分钟最多18组
    if (windowMs <= 3_600_000) return 20;    // 1小时最多20组
    return 24;                               // 更大窗口最多24组
  }

  function getBucketSize(windowMs: number) {
    const groupCount = getMaxGroupCount(windowMs);
    const raw = Math.ceil(windowMs / groupCount);

    // 向上取整到比较好看的粒度
    if (raw <= 1_000) return 1_000;
    if (raw <= 2_000) return 2_000;
    if (raw <= 5_000) return 5_000;
    if (raw <= 10_000) return 10_000;
    if (raw <= 15_000) return 15_000;
    if (raw <= 30_000) return 30_000;
    if (raw <= 60_000) return 60_000;
    if (raw <= 120_000) return 120_000;
    if (raw <= 300_000) return 300_000;
    return 600_000;
  }

  function floorToBucket(ts: number, bucketSize: number) {
    return Math.floor(ts / bucketSize) * bucketSize;
  }

  function buildChartData() {
    const all = props.data?.series || {};
    const now = Date.now();
    const minTs = now - selectedWindowMs.value;

    const bucketSize = getBucketSize(selectedWindowMs.value);
    const maxGroups = getMaxGroupCount(selectedWindowMs.value);

    const bucketSet = new Set<number>();

    rawKeyNames.value.forEach((key) => {
      (all[key] || []).forEach((p) => {
        const val = toNumberMaybe(p.value);
        if (val === null) return;
        if (p.ts < minTs || p.ts > now) return;

        const bucketTs = floorToBucket(Number(p.ts), bucketSize);
        bucketSet.add(bucketTs);
      });
    });

    let bucketList = Array.from(bucketSet).sort((a, b) => a - b);

    // 只保留最后 maxGroups 组
    if (bucketList.length > maxGroups) {
      bucketList = bucketList.slice(-maxGroups);
    }

    const categories = bucketList.map((ts) => formatTime(ts));

    // 超过 10 组就隐藏柱内标签
    const showLabels = bucketList.length <= 10;

    const series = rawKeyNames.value.map((key) => {
      const label = keyLabelMap.value[key] || key;

      // 每个桶取最后一个值
      const pointMap = new Map<number, number | null>();

      (all[key] || []).forEach((p) => {
        const val = toNumberMaybe(p.value);
        if (val === null) return;
        if (p.ts < minTs || p.ts > now) return;

        const bucketTs = floorToBucket(Number(p.ts), bucketSize);
        pointMap.set(bucketTs, val);
      });

      const data = bucketList.map((bucketTs) => {
        const v = pointMap.get(bucketTs);
        return v ?? null;
      });

      return {
        name: label,
        type: 'bar',
        barGap: 0,
        barCategoryGap: '40%',
        barMaxWidth: 26,
        label: {
          show: showLabels,
          position: 'insideBottom',
          distance: 8,
          align: 'left',
          verticalAlign: 'middle',
          rotate: 90,
          formatter: (params: any) => {
            if (params.value === null || params.value === undefined || params.value === '') return '';
            return `${params.value} ${params.seriesName}`;
          },
          fontSize: 12,
          overflow: 'truncate',
        },
        emphasis: {
          focus: 'series',
        },
        data,
      };
    });

    return {
      categories,
      series,
      hasData: series.some((s: any) => Array.isArray(s.data) && s.data.some((v: any) => v !== null)),
    };
  }

  function renderChart() {
    if (!chartEl.value) return;
    if (!chart) chart = echarts.init(chartEl.value);

    const { categories, series, hasData } = buildChartData();

    const option: echarts.EChartsOption = {
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
      },
      legend: {
        top: 8,
        data: series.map((s: any) => s.name),
        selected: legendSelected.value,
      },
      grid: {
        left: 36,
        right: 16,
        top: 66,
        bottom: 36,
        containLabel: true,
      },
      xAxis: [
        {
          type: 'category',
          axisTick: { show: false },
          data: categories,
          axisLabel: {
            interval: 0,
            rotate: categories.length > 10 ? 30 : 0,
          },
        },
      ],
      yAxis: [
        {
          type: 'value',
          axisLabel: {
            formatter: '{value} %',
          },
        },
      ],
      series,
      graphic: hasData
        ? undefined
        : [
            {
              type: 'text',
              left: 'center',
              top: 'middle',
              style: {
                text: '暂无时序数据',
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

    if (chart) {
      chart.on('legendselectchanged', (evt: any) => {
        legendSelected.value = { ...(evt?.selected || {}) };
      });
    }

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
    white-space: pre-wrap;
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
