<template>
  <ResourceUsagePanel
    :config="config"
    :ctx="ctx"
    telemetry-key="waterConsumption"
    label="今日用水量"
    unit="m³"
    top-label="用水最高设备"
    :show-seven-day-trend="false"
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
