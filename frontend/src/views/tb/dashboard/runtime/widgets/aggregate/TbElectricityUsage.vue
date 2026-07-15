<template>
  <ResourceUsagePanel
    :config="config"
    :ctx="ctx"
    telemetry-key="electricityConsumption"
    label="今日用电量"
    unit="kWh"
    top-label="用电最高设备"
    :show-seven-day-trend="true"
  />
</template>

<script setup lang="ts">
  import ResourceUsagePanel from './ResourceUsagePanel.vue';
  import type { TemplateRuntimeDevices } from './templateAggregate';

  defineProps<{
    config?: Record<string, any>;
    ctx?: { runtimeDevices?: TemplateRuntimeDevices | null };
  }>();
</script>
