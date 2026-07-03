<template><AggregateMetricGrid :items="items" /></template>
<script setup lang="ts">
  import { computed } from 'vue';
  import AggregateMetricGrid, { type AggregateMetricItem } from './AggregateMetricGrid.vue';
  import { summarizeTemplateDevices, type TemplateRuntimeDevices } from './templateAggregate';
  const props = defineProps<{ ctx?: { runtimeDevices?: TemplateRuntimeDevices | null } }>();
  const summary = computed(() => summarizeTemplateDevices(props.ctx?.runtimeDevices));
  const items = computed<AggregateMetricItem[]>(() => [
    { label: '设备总数', value: summary.value.total, tone: 'cyan' },
    { label: '在线设备', value: summary.value.online, tone: 'green' },
    { label: '离线设备', value: summary.value.offline, tone: 'orange' },
    { label: '在线率', value: `${summary.value.onlineRate.toFixed(1)}%`, tone: 'cyan' },
  ]);
</script>
