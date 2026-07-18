<template>
  <span class="alarm-severity-tag" :style="severityStyle">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { ALARM_SEVERITY_COLORS, AlarmSeverity } from '/@/enums/alarmEnum';
  import { getAlarmSeverityLabel } from '../utils';

  const props = defineProps<{
    severity?: string;
  }>();

  const label = computed(() => getAlarmSeverityLabel(props.severity));

  const severityStyle = computed(() => {
    const severity = String(props.severity ?? '').toUpperCase() as AlarmSeverity;
    const color = ALARM_SEVERITY_COLORS[severity] ?? ALARM_SEVERITY_COLORS[AlarmSeverity.INDETERMINATE];

    return {
      color: '#fff',
      backgroundColor: color,
      borderColor: color,
    };
  });
</script>

<style scoped>
  .alarm-severity-tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 18px;
    border: 1px solid #dcdfe6;
    white-space: nowrap;
  }
</style>
