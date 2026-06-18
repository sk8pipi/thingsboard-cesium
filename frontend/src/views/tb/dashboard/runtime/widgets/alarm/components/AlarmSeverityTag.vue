<template>
  <span class="alarm-severity-tag" :class="severityClass">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getAlarmSeverityLabel } from '../utils';

const props = defineProps<{
  severity?: string;
}>();

const label = computed(() => getAlarmSeverityLabel(props.severity));

const severityClass = computed(() => {
  switch (props.severity) {
    case 'CRITICAL':
      return 'is-critical';
    case 'MAJOR':
      return 'is-major';
    case 'MINOR':
      return 'is-minor';
    case 'WARNING':
      return 'is-warning';
    case 'INDETERMINATE':
      return 'is-indeterminate';
    default:
      return 'is-default';
  }
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
.is-critical {
  color: #fff;
  background: #cf1322;
  border-color: #cf1322;
}
.is-major {
  color: #fff;
  background: #fa8c16;
  border-color: #fa8c16;
}
.is-minor {
  color: #fff;
  background: #1677ff;
  border-color: #1677ff;
}
.is-warning {
  color: #8d6b00;
  background: #fffbe6;
  border-color: #ffe58f;
}
.is-indeterminate {
  color: #595959;
  background: #f5f5f5;
  border-color: #d9d9d9;
}
.is-default {
  color: #666;
  background: #fafafa;
  border-color: #d9d9d9;
}
</style>