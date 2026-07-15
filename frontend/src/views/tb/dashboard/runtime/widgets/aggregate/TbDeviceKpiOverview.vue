<template>
  <AggregateMetricGrid :items="items" />
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import AggregateMetricGrid, { type AggregateMetricItem } from './AggregateMetricGrid.vue';
  import { useTemplateAlarmSummary, type TemplateRuntimeDevices } from './templateAggregate';
  import { summarizeDevicesByPlatformState } from './resourceUsage';

  const props = defineProps<{
    config?: Record<string, any>;
    ctx?: { runtimeDevices?: TemplateRuntimeDevices | null };
  }>();

  const devices = computed(() => props.ctx?.runtimeDevices || {});
  const summary = computed(() => summarizeDevicesByPlatformState(devices.value));
  const { summary: alarmSummary } = useTemplateAlarmSummary(devices);

  const items = computed<AggregateMetricItem[]>(() => [
    { label: '设备总数', value: summary.value.total, tone: 'cyan' },
    { label: '在线设备', value: summary.value.online, hint: `离线 ${summary.value.offline}`, tone: 'green' },
    { label: '在线率', value: `${summary.value.onlineRate.toFixed(2)}%`, tone: 'cyan' },
    { label: '当前报警', value: alarmSummary.value.active, tone: alarmSummary.value.active ? 'red' : 'green' },
  ]);
</script>
