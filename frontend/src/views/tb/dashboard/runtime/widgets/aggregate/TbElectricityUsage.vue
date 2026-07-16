<template>
  <ElectricityUsagePanel
    :config="config"
    :ctx="ctx"
    telemetry-key="electricityConsumption"
    usage-label="用电量"
    unit="kWh"
    top-label="用电最高设备"
    device-category="electricity_consumption"
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
