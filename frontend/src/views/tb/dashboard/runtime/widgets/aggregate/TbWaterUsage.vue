<template>
  <ElectricityUsagePanel
    :config="config"
    :ctx="ctx"
    telemetry-key="waterConsumption"
    usage-label="用水量"
    unit="m³"
    top-label="用水最高设备"
    device-category="water_consumption"
  />
</template>

<script setup lang="ts">
  import ElectricityUsagePanel from './ElectricityUsagePanel.vue';
  import type { TemplatePointLike, TemplateRuntimeDevices } from './templateDeviceResolver';
  import type { TemplateTelemetryHub } from './templateTelemetryHub';

  defineProps<{
    config?: Record<string, any>;
    ctx?: {
      runtimeDevices?: TemplateRuntimeDevices | null;
      templatePoints?: TemplatePointLike[] | null;
      templateTelemetryHub?: TemplateTelemetryHub | null;
    };
  }>();
</script>
