<template>
  <div class="electricity-usage">
    <div v-if="error" class="electricity-usage__state is-error">{{ error }}</div>
    <div v-else-if="loading && !summary" class="electricity-usage__state">正在计算今日用电量...</div>
    <template v-else>
      <div class="electricity-usage__summary">
        <div class="electricity-usage__primary">
          <span>今日用电量</span>
          <strong>{{ formatValue(summary?.today) }} <small>kWh</small></strong>
        </div>
        <div class="electricity-usage__metric">
          <span>本月累计</span>
          <strong>{{ formatValue(summary?.month) }} <small>kWh</small></strong>
        </div>
        <div class="electricity-usage__metric">
          <span>用电最高设备</span>
          <strong :title="summary?.topDevice?.deviceName || '-'">{{ summary?.topDevice?.deviceName || '-' }}</strong>
        </div>
      </div>

      <UsageBarChart
        class="electricity-usage__chart"
        :points="chartPoints"
        :mode="chartMode"
        :decimals="decimals"
        @toggle="toggleChartMode"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import type { TemplateRuntimeDevices } from './templateAggregate';
  import { formatUsageNumber, listRuntimeDevices, useUsageSummary } from './resourceUsage';
  import UsageBarChart, { type UsageBarChartMode } from './UsageBarChart.vue';

  const props = withDefaults(
    defineProps<{
      config?: Record<string, any>;
      ctx?: { runtimeDevices?: TemplateRuntimeDevices | null };
      telemetryKey?: string;
      label?: string;
      unit?: string;
      topLabel?: string;
      showSevenDayTrend?: boolean;
    }>(),
    {
      telemetryKey: 'electricityConsumption',
    },
  );

  const chartMode = ref<UsageBarChartMode>('sevenDays');
  const keyName = computed(() => String(props.config?.settings?.key || props.telemetryKey));
  const pollMs = computed(() => Number(props.config?.settings?.pollMs || 60000));
  const decimals = computed(() => Number(props.config?.settings?.decimals ?? 1));
  const devices = computed(() =>
    listRuntimeDevices(props.ctx?.runtimeDevices).map((device) => ({ id: device.id, name: device.name })),
  );
  const { summary, loading, error } = useUsageSummary(keyName, devices, pollMs);
  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;
  const chartPoints = computed(() => {
    const points = chartMode.value === 'sevenDays' ? summary.value?.trend7d || [] : summary.value?.trend24h || [];
    return normalizeChartPoints(points, chartMode.value);
  });

  function normalizeChartPoints(
    points: Array<{ ts: number; value: number }>,
    mode: UsageBarChartMode,
    now = Date.now(),
  ) {
    const current = new Date(now);
    if (mode === 'sevenDays') current.setHours(0, 0, 0, 0);
    else current.setMinutes(0, 0, 0);

    const bucketMs = mode === 'sevenDays' ? DAY_MS : HOUR_MS;
    const bucketCount = mode === 'sevenDays' ? 7 : 24;
    const firstBucket = current.getTime() - (bucketCount - 1) * bucketMs;
    const values = new Map<number, number>();

    points.forEach((point) => {
      const date = new Date(point.ts);
      if (mode === 'sevenDays') date.setHours(0, 0, 0, 0);
      else date.setMinutes(0, 0, 0);
      values.set(date.getTime(), Math.max(0, Number(point.value) || 0));
    });

    return Array.from({ length: bucketCount }, (_, index) => {
      const ts = firstBucket + index * bucketMs;
      return { ts, value: values.get(ts) || 0 };
    });
  }

  function formatValue(value: number | null | undefined) {
    return formatUsageNumber(value, decimals.value);
  }

  function toggleChartMode() {
    chartMode.value = chartMode.value === 'sevenDays' ? 'twentyFourHours' : 'sevenDays';
  }
</script>

<style scoped>
  .electricity-usage {
    container-type: inline-size;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0;
    color: #e0f2fe;
  }

  .electricity-usage__summary {
    min-width: 0;
    min-height: 48px;
    display: grid;
    grid-template-columns: minmax(160px, 1.6fr) minmax(120px, 1fr) minmax(150px, 1.4fr);
    align-items: stretch;
    gap: 8px;
  }

  .electricity-usage__primary,
  .electricity-usage__metric {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .electricity-usage__primary {
    justify-content: flex-start;
    padding: 0 4px 2px;
  }

  .electricity-usage__metric {
    justify-content: center;
    border: 1px solid rgba(125, 211, 252, 0.13);
    border-radius: 8px;
    background: rgba(8, 47, 73, 0.12);
    padding: 4px 10px;
  }

  .electricity-usage__primary span,
  .electricity-usage__metric span {
    display: block;
    color: rgba(226, 242, 255, 0.62);
    font-size: 11px;
  }

  .electricity-usage__primary strong,
  .electricity-usage__metric strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .electricity-usage__primary strong {
    margin-top: 3px;
    color: #7dd3fc;
    font-size: 30px;
    line-height: 1;
  }

  .electricity-usage__metric strong {
    margin-top: 4px;
    color: #dff8ff;
    font-size: 14px;
  }

  .electricity-usage__primary small {
    color: inherit;
    font-size: 0.48em;
    font-weight: 500;
  }

  .electricity-usage__metric small {
    color: rgba(226, 242, 255, 0.58);
    font-size: 0.48em;
    font-weight: 500;
  }

  .electricity-usage__chart {
    min-height: 0;
  }

  .electricity-usage__state {
    min-height: 180px;
    display: grid;
    place-items: center;
    color: rgba(226, 242, 255, 0.62);
    font-size: 12px;
  }

  .electricity-usage__state.is-error {
    color: #fca5a5;
  }

  @container (max-width: 560px) {
    .electricity-usage__summary {
      min-height: 46px;
      grid-template-columns: minmax(120px, 1.35fr) minmax(90px, 1fr) minmax(110px, 1.15fr);
      gap: 4px;
    }

    .electricity-usage__primary {
      padding: 0 3px 2px;
    }

    .electricity-usage__metric {
      padding: 4px 6px;
    }

    .electricity-usage__primary span,
    .electricity-usage__metric span {
      font-size: 10px;
    }

    .electricity-usage__primary strong {
      font-size: 26px;
    }

    .electricity-usage__metric strong {
      font-size: 12px;
    }
  }
</style>
