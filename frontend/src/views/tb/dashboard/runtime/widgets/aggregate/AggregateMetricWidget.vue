<template>
  <div class="aggregate-metric">
    <header class="aggregate-metric__header">
      <span>{{ metricConfig.title }}</span>
      <small :class="{ 'is-online': connected, 'is-fallback': usingFallback }">{{ connectionLabel }}</small>
    </header>

    <div class="aggregate-metric__value">
      <strong>{{ formattedValue }}</strong>
      <span v-if="unit">{{ unit }}</span>
    </div>

    <div v-if="statusMessage" class="aggregate-metric__state" :class="{ 'is-error': Boolean(error) }">
      {{ statusMessage }}
    </div>

    <footer class="aggregate-metric__footer">
      <span>{{ coverageLabel }}</span>
      <span v-if="missingEntityCount">{{ missingLabel }}</span>
      <span v-if="latestTimestamp">{{ updatedLabel }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
  import { computed, getCurrentInstance } from 'vue';
  import { normalizeAggregateMetricConfig } from './aggregateMetricTypes';
  import type { TemplatePointLike, TemplateRuntimeDevices } from './templateDeviceResolver';
  import type { TemplateTelemetryHub } from './templateTelemetryHub';
  import { useTemplateAggregate } from './useTemplateAggregate';

  const props = defineProps<{
    widgetId?: string;
    config?: Record<string, unknown>;
    ctx?: {
      runtimeDevices?: TemplateRuntimeDevices | null;
      templatePoints?: TemplatePointLike[] | null;
      templateTelemetryHub?: TemplateTelemetryHub | null;
    };
  }>();

  const instanceUid = getCurrentInstance()?.uid || 0;
  const metricConfig = computed(() => normalizeAggregateMetricConfig(props.config));
  const runtimeDevices = computed(() => props.ctx?.runtimeDevices || {});
  const templatePoints = computed(() => props.ctx?.templatePoints || []);
  const hub = computed(() => props.ctx?.templateTelemetryHub || null);
  const {
    formattedValue,
    loading,
    error,
    connected,
    usingFallback,
    stale,
    validEntityCount,
    totalEntityCount,
    missingEntityCount,
    latestTimestamp,
  } = useTemplateAggregate({
    consumerId: `aggregate-metric:${props.widgetId || instanceUid}`,
    config: metricConfig,
    runtimeDevices,
    templatePoints,
    hub,
  });

  const unit = computed(() => metricConfig.value.display.unit || '');
  const connectionLabel = computed(() => {
    if (usingFallback.value) return '\u964d\u7ea7\u66f4\u65b0';
    if (connected.value) return '\u5b9e\u65f6';
    return '\u5df2\u65ad\u5f00';
  });
  const coverageLabel = computed(() => `\u6709\u6548\u8bbe\u5907 ${validEntityCount.value}/${totalEntityCount.value}`);
  const missingLabel = computed(() => `${missingEntityCount.value} \u53f0\u7f3a\u5c11\u6570\u636e`);
  const updatedLabel = computed(() => {
    if (!latestTimestamp.value) return '';
    const time = new Date(latestTimestamp.value).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return stale.value ? `\u6570\u636e\u5df2\u8fc7\u671f \u00b7 ${time}` : `\u66f4\u65b0 ${time}`;
  });
  const statusMessage = computed(() => {
    if (!totalEntityCount.value) return '\u5f53\u524d\u6a21\u677f\u6ca1\u6709\u5339\u914d\u8bbe\u5907';
    if (loading.value && !latestTimestamp.value) return '\u6b63\u5728\u540c\u6b65\u8bbe\u5907\u6570\u636e...';
    if (error.value && !validEntityCount.value) return error.value;
    if (!validEntityCount.value) return '\u6682\u65e0\u6709\u6548\u9065\u6d4b\u6570\u636e';
    return '';
  });
</script>

<style scoped>
  .aggregate-metric {
    width: 100%;
    height: 100%;
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 10px;
    color: #e0f2fe;
  }

  .aggregate-metric__header,
  .aggregate-metric__footer {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .aggregate-metric__header > span {
    overflow: hidden;
    color: rgb(226 242 255 / 76%);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aggregate-metric__header small {
    flex: 0 0 auto;
    color: #fca5a5;
    font-size: 11px;
  }

  .aggregate-metric__header small.is-online {
    color: #86efac;
  }

  .aggregate-metric__header small.is-fallback {
    color: #fdba74;
  }

  .aggregate-metric__value {
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 8px;
    align-self: center;
  }

  .aggregate-metric__value strong {
    min-width: 0;
    overflow: hidden;
    color: #7dd3fc;
    font-size: 36px;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aggregate-metric__value span {
    flex: 0 0 auto;
    color: rgb(226 242 255 / 64%);
    font-size: 13px;
  }

  .aggregate-metric__state {
    align-self: center;
    color: rgb(226 242 255 / 58%);
    font-size: 12px;
    text-align: center;
  }

  .aggregate-metric__state.is-error {
    color: #fca5a5;
  }

  .aggregate-metric__footer {
    justify-content: flex-start;
    flex-wrap: wrap;
    color: rgb(226 242 255 / 50%);
    font-size: 10px;
  }

  .aggregate-metric__footer span:last-child {
    margin-left: auto;
  }

  @container (max-width: 280px) {
    .aggregate-metric__value strong {
      font-size: 28px;
    }
  }
</style>
