<template>
  <div class="resource-usage">
    <div class="resource-usage__head">
      <div>
        <span>{{ label }}</span>
        <strong>{{ formatValue(summary?.today) }} {{ unit }}</strong>
      </div>
      <div class="resource-usage__change" :class="{ 'is-up': changeRateValue > 0, 'is-down': changeRateValue < 0 }">
        {{ changeRateText }}
      </div>
    </div>

    <div v-if="error" class="resource-usage__state is-error">{{ error }}</div>
    <div v-else-if="loading && !summary" class="resource-usage__state">正在计算{{ label }}...</div>
    <template v-else>
      <div class="resource-usage__metrics">
        <div
          ><span>昨日同期</span><strong>{{ formatValue(summary?.yesterdaySameTime) }}</strong></div
        >
        <div
          ><span>本月累计</span><strong>{{ formatValue(summary?.month) }}</strong></div
        >
        <div
          ><span>当前小时</span><strong>{{ formatValue(summary?.currentHour) }}</strong></div
        >
        <div>
          <span>{{ topLabel }}</span>
          <strong :title="summary?.topDevice?.deviceName || '-'">{{ summary?.topDevice?.deviceName || '-' }}</strong>
        </div>
      </div>

      <div class="resource-usage__charts">
        <MiniUsageTrend title="最近24小时" :points="summary?.trend24h || []" :unit="unit" />
        <MiniUsageTrend v-if="showSevenDayTrend" title="最近7天" :points="summary?.trend7d || []" :unit="unit" />
        <div v-else class="resource-usage__continuous">
          <span>异常持续用水设备</span>
          <strong :title="continuousText">{{ continuousText }}</strong>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import type { TemplateRuntimeDevices } from './templateAggregate';
  import { formatUsageNumber, listRuntimeDevices, useUsageSummary } from './resourceUsage';
  import MiniUsageTrend from './MiniUsageTrend.vue';

  const props = withDefaults(
    defineProps<{
      config?: Record<string, any>;
      ctx?: { runtimeDevices?: TemplateRuntimeDevices | null };
      telemetryKey: string;
      label: string;
      unit: string;
      topLabel: string;
      showSevenDayTrend?: boolean;
    }>(),
    {
      showSevenDayTrend: true,
    },
  );

  const keyName = computed(() => String(props.config?.settings?.key || props.telemetryKey));
  const pollMs = computed(() => Number(props.config?.settings?.pollMs || 60000));
  const devices = computed(() =>
    listRuntimeDevices(props.ctx?.runtimeDevices).map((device) => ({ id: device.id, name: device.name })),
  );
  const { summary, loading, error } = useUsageSummary(keyName, devices, pollMs);

  const changeRateValue = computed(() => summary.value?.changeRate ?? 0);
  const changeRateText = computed(() => {
    if (!summary.value || summary.value.changeRate === null) return '较昨日 -';
    const prefix = summary.value.changeRate > 0 ? '+' : '';
    return `较昨日 ${prefix}${summary.value.changeRate.toFixed(1)}%`;
  });
  const continuousText = computed(() => {
    const names = summary.value?.continuousDevices.map((item) => item.deviceName) || [];
    return names.length ? names.join('、') : '暂无';
  });

  function formatValue(value: number | null | undefined) {
    return formatUsageNumber(value, Number(props.config?.settings?.decimals ?? 1));
  }
</script>

<style scoped>
  .resource-usage {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 10px;
    color: #e0f2fe;
  }

  .resource-usage__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .resource-usage__head span,
  .resource-usage__metrics span,
  .resource-usage__continuous span {
    display: block;
    color: rgba(226, 242, 255, 0.62);
    font-size: 11px;
  }

  .resource-usage__head strong {
    display: block;
    margin-top: 4px;
    color: #7dd3fc;
    font-size: 28px;
    line-height: 1;
  }

  .resource-usage__change {
    flex: 0 0 auto;
    border: 1px solid rgba(125, 211, 252, 0.16);
    border-radius: 999px;
    padding: 5px 9px;
    color: rgba(226, 242, 255, 0.72);
    font-size: 12px;
  }

  .resource-usage__change.is-up {
    color: #fca5a5;
    border-color: rgba(248, 113, 113, 0.28);
  }

  .resource-usage__change.is-down {
    color: #86efac;
    border-color: rgba(34, 197, 94, 0.28);
  }

  .resource-usage__metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .resource-usage__metrics div,
  .resource-usage__continuous {
    min-width: 0;
    border: 1px solid rgba(125, 211, 252, 0.13);
    border-radius: 8px;
    background: rgba(8, 47, 73, 0.12);
    padding: 8px 10px;
  }

  .resource-usage__metrics strong,
  .resource-usage__continuous strong {
    display: block;
    margin-top: 4px;
    overflow: hidden;
    color: #dff8ff;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-usage__charts {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .resource-usage__state {
    min-height: 120px;
    display: grid;
    place-items: center;
    color: rgba(226, 242, 255, 0.62);
    font-size: 12px;
  }

  .resource-usage__state.is-error {
    color: #fca5a5;
  }

  @media (max-width: 820px) {
    .resource-usage__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .resource-usage__charts {
      grid-template-columns: 1fr;
    }
  }
</style>
