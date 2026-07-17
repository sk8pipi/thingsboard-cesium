<template>
  <div class="electricity-usage">
    <div v-if="error && !summary" class="electricity-usage__state is-error">{{ error }}</div>
    <div v-else-if="loading && !summary" class="electricity-usage__state">正在加载{{ usageLabel }}...</div>
    <template v-else>
      <div class="electricity-usage__summary">
        <div class="electricity-usage__primary">
          <span>今日{{ usageLabel }}</span>
          <strong
            >{{ formatValue(summary?.today) }} <small>{{ unit }}</small></strong
          >
        </div>
        <div class="electricity-usage__metric">
          <span>本月累计</span>
          <strong
            >{{ formatValue(summary?.month) }} <small>{{ unit }}</small></strong
          >
        </div>
      </div>
      <UsageBarChart
        class="electricity-usage__chart"
        :points="chartPoints"
        :mode="chartMode"
        :decimals="decimals"
        :metric-label="usageLabel"
        :unit="unit"
        @toggle="toggleChartMode"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { EntityType } from '/@/enums/entityTypeEnum';
  import { formatUsageNumber, useUsageSummary } from './resourceUsage';
  import { normalizeUsageTrend } from './cumulativeUsageAccumulator';
  import UsageBarChart, { type UsageBarChartMode } from './UsageBarChart.vue';

  const props = withDefaults(
    defineProps<{
      config?: Record<string, any>;
      telemetryKey?: string;
      usageLabel?: string;
      unit?: string;
    }>(),
    {
      telemetryKey: 'totalElectricityConsumption',
      usageLabel: '用电量',
      unit: 'kWh',
    },
  );

  const chartMode = ref<UsageBarChartMode>('sevenDays');
  const sourceAssetId = computed(() => String(props.config?.settings?.sourceAssetId || '').trim());
  const sourceAssetName = computed(() => String(props.config?.settings?.sourceAssetName || '').trim());
  const keyName = computed(() => String(props.config?.settings?.sourceTelemetryKey || props.telemetryKey));

  const pollMs = computed(() => Math.max(15000, Number(props.config?.settings?.pollMs || 60000)));
  const sourceAssets = computed(() =>
    sourceAssetId.value ? [{ id: sourceAssetId.value, name: sourceAssetName.value || sourceAssetId.value }] : [],
  );
  const sourceEntityType = computed(() => EntityType.ASSET);
  const { summary, loading, error: usageError } = useUsageSummary(keyName, sourceAssets, pollMs, sourceEntityType);
  const error = computed(() => usageError.value || (sourceAssetId.value ? '' : '请在添加部件时选择资产'));
  const decimals = computed(() => Number(props.config?.settings?.decimals ?? 1));
  const chartPoints = computed(() => {
    if (!summary.value) return [];
    const points = chartMode.value === 'sevenDays' ? summary.value.trend7d : summary.value.trend24h;
    return normalizeUsageTrend(points, chartMode.value, Date.now());
  });

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
    grid-template-columns: minmax(160px, 1.6fr) minmax(120px, 1fr);
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
      grid-template-columns: minmax(120px, 1.35fr) minmax(90px, 1fr);
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
