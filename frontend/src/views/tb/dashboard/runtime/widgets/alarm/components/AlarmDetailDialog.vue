<template>
  <div v-if="visible" class="alarm-dialog-mask" @click.self="emit('update:visible', false)">
    <div class="alarm-dialog">
      <div class="alarm-dialog__header">
        <div class="alarm-dialog__title">报警详情</div>
        <button class="alarm-dialog__close" @click="emit('update:visible', false)">×</button>
      </div>

      <div class="alarm-dialog__body">
        <div class="alarm-dialog__row"><strong>名称：</strong>{{ item?.name || '-' }}</div>
        <div class="alarm-dialog__row"><strong>类型：</strong>{{ item?.type || '-' }}</div>
        <div class="alarm-dialog__row"><strong>级别：</strong>{{ item?.severity || '-' }}</div>
        <div class="alarm-dialog__row"><strong>状态：</strong>{{ item?.status || '-' }}</div>
        <div class="alarm-dialog__row"><strong>创建时间：</strong>{{ formatAlarmTime(item?.createdTime) }}</div>
        <div class="alarm-dialog__row"><strong>确认时间：</strong>{{ formatAlarmTime(item?.ackTs) }}</div>
        <div class="alarm-dialog__row"><strong>清除时间：</strong>{{ formatAlarmTime(item?.clearTs) }}</div>
        <div class="alarm-dialog__row"><strong>来源实体：</strong>{{ item?.originator?.name || '-' }}</div>

        <div class="alarm-dialog__section-title">details</div>
        <pre class="alarm-dialog__json">{{ prettyDetails }}</pre>

        <div class="alarm-dialog__section-title">raw</div>
        <pre class="alarm-dialog__json">{{ prettyRaw }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AlarmItem } from '../types';
import { formatAlarmTime } from '../utils';

const props = defineProps<{
  visible: boolean;
  item?: AlarmItem | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const prettyDetails = computed(() => JSON.stringify(props.item?.details || {}, null, 2));
const prettyRaw = computed(() => JSON.stringify(props.item?.raw || {}, null, 2));
</script>

<style scoped>
.alarm-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.alarm-dialog {
  width: min(860px, 92vw);
  max-height: 88vh;
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16);
}
.alarm-dialog__header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 14px 16px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.alarm-dialog__title {
  font-size: 16px;
  font-weight: 600;
}
.alarm-dialog__close {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
}
.alarm-dialog__body {
  padding: 16px;
}
.alarm-dialog__row {
  margin-bottom: 8px;
  font-size: 14px;
}
.alarm-dialog__section-title {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
}
.alarm-dialog__json {
  margin: 0;
  padding: 12px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>