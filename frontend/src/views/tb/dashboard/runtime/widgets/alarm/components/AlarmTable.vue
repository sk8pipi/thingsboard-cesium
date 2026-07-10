<template>
  <div class="alarm-table-wrap" :class="{ 'is-dense': settings?.dense }">
    <div v-if="loading" class="alarm-table-wrap__loading">加载中...</div>

    <template v-else>
      <AlarmEmpty v-if="!rows.length && !error" text="暂无报警数据" />
      <AlarmEmpty v-else-if="error" :text="error" />

      <template v-else>
        <table class="alarm-table">
          <thead>
            <tr>
              <th>名称</th>
              <th v-if="showColumn('type')">类型</th>
              <th v-if="showColumn('severity')">级别</th>
              <th v-if="showColumn('status')">状态</th>
              <th v-if="showColumn('createdTime')">创建时间</th>
              <th v-if="showColumn('originator')">来源实体</th>
              <th v-if="showColumn('actions')">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in rows"
              :key="item.id"
              class="alarm-table__row"
              @click="emit('focus', item)"
              @dblclick.stop="emit('detail', item)"
            >
              <td>{{ item.name || '-' }}</td>
              <td v-if="showColumn('type')">{{ item.type || '-' }}</td>
              <td v-if="showColumn('severity')">
                <AlarmSeverityTag :severity="item.severity" />
              </td>
              <td v-if="showColumn('status')">
                <AlarmStatusTag :status="item.status" />
              </td>
              <td v-if="showColumn('createdTime')">{{ formatAlarmTime(item.createdTime) }}</td>
              <td v-if="showColumn('originator')">
                {{ item.originator?.name || item.originator?.label || '-' }}
              </td>
              <td v-if="showColumn('actions')">
                <div class="alarm-table__actions">
                  <button
                    v-if="settings.showAck"
                    class="alarm-table__btn"
                    :disabled="!canAckAlarm(item)"
                    @click.stop="emit('ack', item)"
                  >
                    确认
                  </button>
                  <button
                    v-if="settings.showClear"
                    class="alarm-table__btn alarm-table__btn--warn"
                    :disabled="!canClearAlarm(item)"
                    @click.stop="emit('clear', item)"
                  >
                    清除
                  </button>
                  <button
                    class="alarm-table__btn alarm-table__btn--ghost"
                    @click.stop="emit('detail', item)"
                  >
                    详情
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="settings.showPagination" class="alarm-table__pager">
          <button class="alarm-table__btn alarm-table__btn--ghost" :disabled="page <= 0" @click="$emit('prev-page')">
            上一页
          </button>
          <span>第 {{ page + 1 }} 页</span>
          <span>共 {{ total }} 条</span>
          <button class="alarm-table__btn alarm-table__btn--ghost" :disabled="!hasNext" @click="$emit('next-page')">
            下一页
          </button>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AlarmItem, AlarmWidgetSettings } from '../types';
import AlarmStatusTag from './AlarmStatusTag.vue';
import AlarmSeverityTag from './AlarmSeverityTag.vue';
import AlarmEmpty from './AlarmEmpty.vue';
import { canAckAlarm, canClearAlarm, formatAlarmTime } from '../utils';

const props = defineProps<{
  rows: AlarmItem[];
  loading: boolean;
  error?: string;
  settings: AlarmWidgetSettings;
  page: number;
  total: number;
  hasNext: boolean;
}>();

const emit = defineEmits<{
  (e: 'prev-page'): void;
  (e: 'next-page'): void;
  (e: 'ack', item: AlarmItem): void;
  (e: 'clear', item: AlarmItem): void;
  (e: 'detail', item: AlarmItem): void;
  (e: 'focus', item: AlarmItem): void;
}>();

function showColumn(name: string) {
  return Array.isArray(props.settings.columns) && props.settings.columns.includes(name);
}
</script>

<style scoped>
.alarm-table-wrap {
  width: 100%;
  min-height: 180px;
}
.alarm-table-wrap__loading {
  padding: 24px;
  color: #666;
}
.alarm-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}
.alarm-table th,
.alarm-table td {
  padding: 10px 12px;
  border: 1px solid #f0f0f0;
  text-align: left;
  font-size: 14px;
  vertical-align: middle;
}
.alarm-table thead th {
  background: #fafafa;
  font-weight: 600;
}
.alarm-table__row {
  cursor: pointer;
}
.alarm-table__row:hover {
  background: #fafcff;
}
.alarm-table__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.alarm-table__btn {
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: #1677ff;
  color: #fff;
  cursor: pointer;
}
.alarm-table__btn:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}
.alarm-table__btn--warn {
  background: #fa8c16;
}
.alarm-table__btn--ghost {
  background: #f5f5f5;
  color: #333;
}
.alarm-table__pager {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.is-dense .alarm-table th,
.is-dense .alarm-table td {
  padding: 6px 8px;
  font-size: 13px;
}
</style>