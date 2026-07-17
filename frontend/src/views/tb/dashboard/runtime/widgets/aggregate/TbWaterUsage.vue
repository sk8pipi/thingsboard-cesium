<template>
  <ElectricityUsagePanel :config="config" telemetry-key="totalWaterConsumption" usage-label="用水量" unit="m³" />
</template>
<script setup lang="ts">
  import ElectricityUsagePanel from './ElectricityUsagePanel.vue';
  defineProps<{ config?: Record<string, any> }>();
</script>
