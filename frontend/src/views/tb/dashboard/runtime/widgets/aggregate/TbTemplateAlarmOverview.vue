<template>
  <div class="aggregate-widget-state">
    <AggregateMetricGrid :items="items" />
    <div v-if="error" class="aggregate-widget-state__message">{{ error }}</div>
    <div v-else-if="loading" class="aggregate-widget-state__message">正在更新报警统计...</div>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import AggregateMetricGrid, { type AggregateMetricItem } from './AggregateMetricGrid.vue';
  import { useTemplateAlarmSummary, type TemplateRuntimeDevices } from './templateAggregate';
  const props = defineProps<{ ctx?: { runtimeDevices?: TemplateRuntimeDevices | null } }>();
  const devices = computed(() => props.ctx?.runtimeDevices || {});
  const { summary, loading, error } = useTemplateAlarmSummary(devices);
  const items = computed<AggregateMetricItem[]>(() => [
    { label: '活动报警', value: summary.value.active, tone: 'red' },
    { label: '未确认', value: summary.value.unacknowledged, tone: 'orange' },
    { label: '严重报警', value: summary.value.severe, tone: 'red' },
    { label: '今日新增', value: summary.value.today, tone: 'cyan' },
  ]);
</script>
<style scoped>
  .aggregate-widget-state {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .aggregate-widget-state__message {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 4px;
    color: rgba(226, 242, 255, 0.62);
    font-size: 10px;
    text-align: center;
  }
</style>
