<template>
  <ElectricityUsagePanel :config="config" telemetry-key="totalElectricityConsumption" usage-label="用电量" unit="kWh" />
</template>
<script setup lang="ts">
  import ElectricityUsagePanel from './ElectricityUsagePanel.vue';
  defineProps<{ config?: Record<string, any> }>();
</script>
