<template>
  <span class="alarm-status-tag" :class="statusClass">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getAlarmStatusLabel } from '../utils';

const props = defineProps<{
  status?: string;
}>();

const label = computed(() => getAlarmStatusLabel(props.status));

const statusClass = computed(() => {
  switch (props.status) {
    case 'ACTIVE_UNACK':
      return 'is-active-unack';
    case 'ACTIVE_ACK':
      return 'is-active-ack';
    case 'CLEARED_UNACK':
      return 'is-cleared-unack';
    case 'CLEARED_ACK':
      return 'is-cleared-ack';
    default:
      return 'is-default';
  }
});
</script>

<style scoped>
.alarm-status-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
  border: 1px solid #dcdfe6;
  white-space: nowrap;
}
.is-active-unack {
  color: #fff;
  background: #d4380d;
  border-color: #d4380d;
}
.is-active-ack {
  color: #ad4e00;
  background: #fff7e6;
  border-color: #ffd591;
}
.is-cleared-unack {
  color: #0958d9;
  background: #e6f4ff;
  border-color: #91caff;
}
.is-cleared-ack {
  color: #389e0d;
  background: #f6ffed;
  border-color: #b7eb8f;
}
.is-default {
  color: #666;
  background: #fafafa;
  border-color: #d9d9d9;
}
</style>