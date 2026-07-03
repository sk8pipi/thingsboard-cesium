<template>
  <div class="key-aggregate-card">
    <AggregateMetricGrid :items="items" />
    <div class="key-aggregate-card__meta">
      <span>{{ keyName }}</span>
      <span>{{ stats.count }}/{{ stats.total }} 台 · 覆盖率 {{ stats.coverage.toFixed(0) }}%</span>
      <span v-if="error">{{ error }}</span>
      <span v-else-if="loading">更新中...</span>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import AggregateMetricGrid, { type AggregateMetricItem } from './AggregateMetricGrid.vue';
  import {
    calculateKeyStats,
    formatAggregateNumber,
    useTemplateKeySnapshot,
    type TemplateRuntimeDevices,
  } from './templateAggregate';
  const props = defineProps<{
    config?: Record<string, any>;
    ctx?: { runtimeDevices?: TemplateRuntimeDevices | null };
  }>();
  const devices = computed(() => props.ctx?.runtimeDevices || {});
  const keyName = computed(() => String(props.config?.settings?.key || 'temperature'));
  const decimals = computed(() => Number(props.config?.settings?.decimals ?? 1));
  const { values, loading, error } = useTemplateKeySnapshot(keyName, devices);
  const stats = computed(() => calculateKeyStats(values.value, Object.keys(devices.value).length));
  const items = computed<AggregateMetricItem[]>(() => [
    { label: '总和', value: formatAggregateNumber(stats.value.sum, decimals.value), tone: 'cyan' },
    { label: '平均值', value: formatAggregateNumber(stats.value.average, decimals.value), tone: 'green' },
    { label: '最大值', value: formatAggregateNumber(stats.value.maximum, decimals.value), tone: 'orange' },
    { label: '最小值', value: formatAggregateNumber(stats.value.minimum, decimals.value), tone: 'cyan' },
  ]);
</script>
<style scoped>
  .key-aggregate-card {
    position: relative;
    width: 100%;
    height: 100%;
    padding-bottom: 22px;
    box-sizing: border-box;
  }
  .key-aggregate-card__meta {
    position: absolute;
    left: 4px;
    right: 4px;
    bottom: 0;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: rgba(226, 242, 255, 0.58);
    font-size: 10px;
  }
  .key-aggregate-card__meta span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
