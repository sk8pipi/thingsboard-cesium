<template>
  <div class="alarm-toolbar">
    <input
      class="alarm-toolbar__input"
      :value="searchText"
      placeholder="搜索报警名称或类型"
      @input="onInput"
      @keyup.enter="emit('search')"
    />

    <select class="alarm-toolbar__select" :value="statusValue" @change="onStatusChange">
      <option value="">全部状态</option>
      <option v-for="item in statusOptions" :key="item.value" :value="item.value">
        {{ item.label }}
      </option>
    </select>

    <select class="alarm-toolbar__select" :value="severityValue" @change="onSeverityChange">
      <option value="">全部级别</option>
      <option v-for="item in severityOptions" :key="item.value" :value="item.value">
        {{ item.label }}
      </option>
    </select>

    <button class="alarm-toolbar__btn" @click="emit('search')">查询</button>
    <button class="alarm-toolbar__btn alarm-toolbar__btn--ghost" @click="emit('refresh')">
      刷新
    </button>
  </div>
</template>

<script setup lang="ts">
import { DEFAULT_SEVERITY_OPTIONS, DEFAULT_STATUS_OPTIONS } from '../constants';

const props = withDefaults(
  defineProps<{
    searchText?: string;
    statusValue?: string;
    severityValue?: string;
    statusOptions?: Array<{ label: string; value: string }>;
    severityOptions?: Array<{ label: string; value: string }>;
  }>(),
  {
    searchText: '',
    statusValue: '',
    severityValue: '',
    statusOptions: () => DEFAULT_STATUS_OPTIONS,
    severityOptions: () => DEFAULT_SEVERITY_OPTIONS,
  }
);

const emit = defineEmits<{
  (e: 'update:searchText', value: string): void;
  (e: 'update:statusValue', value: string): void;
  (e: 'update:severityValue', value: string): void;
  (e: 'search'): void;
  (e: 'refresh'): void;
}>();

function onInput(event: Event) {
  emit('update:searchText', (event.target as HTMLInputElement).value);
}

function onStatusChange(event: Event) {
  emit('update:statusValue', (event.target as HTMLSelectElement).value);
}

function onSeverityChange(event: Event) {
  emit('update:severityValue', (event.target as HTMLSelectElement).value);
}
</script>

<style scoped>
.alarm-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.alarm-toolbar__input,
.alarm-toolbar__select {
  height: 34px;
  padding: 0 10px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  outline: none;
  background: #fff;
  font-size: 14px;
}
.alarm-toolbar__input {
  min-width: 220px;
}
.alarm-toolbar__btn {
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: #1677ff;
  color: #fff;
  cursor: pointer;
}
.alarm-toolbar__btn--ghost {
  background: #f5f5f5;
  color: #333;
}
</style>