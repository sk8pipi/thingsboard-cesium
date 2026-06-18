<template>
  <div class="tb-alarm-card-widget">
    <div v-if="settings.title" class="tb-alarm-card-widget__title">
      {{ settings.title }}
    </div>

    <AlarmToolbar
      v-if="settings.showSearch"
      v-model:searchText="searchText"
      v-model:statusValue="statusValue"
      v-model:severityValue="severityValue"
      @search="handleSearch"
      @refresh="reloadSilently"
    />

    <div v-if="loading" class="tb-alarm-card-widget__loading">加载中...</div>
    <AlarmEmpty v-else-if="error" :text="error" />
    <AlarmEmpty v-else-if="!rows.length" text="暂无报警数据" />

    <div v-else class="tb-alarm-card-widget__list">
      <div
        v-for="item in rows"
        :key="item.id"
        class="tb-alarm-card-widget__item"
        @dblclick="openDetail(item)"
      >
        <div class="tb-alarm-card-widget__header">
          <div class="tb-alarm-card-widget__name">{{ item.name }}</div>
          <AlarmSeverityTag :severity="item.severity" />
        </div>

        <div class="tb-alarm-card-widget__meta">
          <div><strong>类型：</strong>{{ item.type || '-' }}</div>
          <div><strong>状态：</strong><AlarmStatusTag :status="item.status" /></div>
          <div><strong>时间：</strong>{{ formatAlarmTime(item.createdTime) }}</div>
          <div><strong>来源：</strong>{{ item.originator?.name || '-' }}</div>
        </div>

        <div class="tb-alarm-card-widget__actions">
          <button
            v-if="settings.showAck"
            class="tb-alarm-card-widget__btn"
            :disabled="!canAckAlarm(item)"
            @click="handleAck(item)"
          >
            确认
          </button>
          <button
            v-if="settings.showClear"
            class="tb-alarm-card-widget__btn tb-alarm-card-widget__btn--warn"
            :disabled="!canClearAlarm(item)"
            @click="handleClear(item)"
          >
            清除
          </button>
          <button
            class="tb-alarm-card-widget__btn tb-alarm-card-widget__btn--ghost"
            @click="openDetail(item)"
          >
            详情
          </button>
        </div>
      </div>
    </div>

    <div v-if="settings.showPagination && rows.length" class="tb-alarm-card-widget__pager">
      <button class="tb-alarm-card-widget__btn tb-alarm-card-widget__btn--ghost" :disabled="page <= 0" @click="handlePrevPage">
        上一页
      </button>
      <span>第 {{ page + 1 }} 页</span>
      <span>共 {{ total }} 条</span>
      <button class="tb-alarm-card-widget__btn tb-alarm-card-widget__btn--ghost" :disabled="!hasNext" @click="handleNextPage">
        下一页
      </button>
    </div>

    <AlarmDetailDialog v-model:visible="detailVisible" :item="currentDetailItem" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AlarmToolbar from '../components/AlarmToolbar.vue';
import AlarmEmpty from '../components/AlarmEmpty.vue';
import AlarmDetailDialog from '../components/AlarmDetailDialog.vue';
import AlarmStatusTag from '../components/AlarmStatusTag.vue';
import AlarmSeverityTag from '../components/AlarmSeverityTag.vue';
import { parseAlarmSettings } from '../settings';
import { useAlarmData } from '../composables/useAlarmData';
import { handleAckAlarm, handleClearAlarm } from '../actions';
import type { AlarmItem } from '../types';
import { canAckAlarm, canClearAlarm, formatAlarmTime, normalizeId } from '../utils';

const props = defineProps<{
  widget?: any;
  datasource?: any;
  ctx?: any;
  timewindow?: {
    startTs?: number;
    endTs?: number;
  };
}>();

const page = ref(0);
const searchText = ref('');
const statusValue = ref('');
const severityValue = ref('');
const detailVisible = ref(false);
const currentDetailItem = ref<AlarmItem | null>(null);

const settings = computed(() => {
  const rawSettings =
    props.widget?.config?.settings ||
    props.widget?.settings ||
    {};
  return parseAlarmSettings(rawSettings);
});

function resolveDatasource() {
  return props.datasource || props.widget?.config?.datasources?.[0] || props.widget?.datasource || null;
}

function resolveEntity() {
  const ds = resolveDatasource();

  const entityId =
    normalizeId(ds?.entityId) ||
    normalizeId(ds?.deviceId) ||
    normalizeId(ds?.entity?.id) ||
    normalizeId(ds?.entity) ||
    normalizeId(ds?.entityInfo?.id) ||
    '';

  const entityType =
    ds?.entityType ||
    ds?.type ||
    ds?.entity?.entityType ||
    ds?.entityInfo?.entityType ||
    '';

  return {
    entityId,
    entityType,
  };
}

function buildQuery() {
  const { entityId, entityType } = resolveEntity();

  const statusList = statusValue.value
    ? [statusValue.value]
    : settings.value.defaultStatusList;

  const severityList = severityValue.value
    ? [severityValue.value]
    : settings.value.defaultSeverityList;

  return {
    page: page.value,
    pageSize: settings.value.pageSize,
    searchText: searchText.value.trim(),
    sortProperty: 'createdTime' as const,
    sortOrder: 'DESC' as const,
    startTime: props.timewindow?.startTs,
    endTime: props.timewindow?.endTs,
    statusList,
    severityList,
    entityId,
    entityType,
    fetchMode: entityId ? 'entity' as const : 'all' as const,
  };
}

const { rows, loading, error, hasNext, total, reload } = useAlarmData(buildQuery);

async function reloadSilently() {
  try {
    await reload();
  } catch (e) {
    console.error('[alarm-card.reload]', e);
  }
}

function handleSearch() {
  page.value = 0;
  reloadSilently();
}

function handlePrevPage() {
  if (page.value <= 0) return;
  page.value -= 1;
  reloadSilently();
}

function handleNextPage() {
  if (!hasNext.value) return;
  page.value += 1;
  reloadSilently();
}

async function handleAck(item: AlarmItem) {
  try {
    await handleAckAlarm(item, {
      item,
      widget: props.widget,
      datasource: props.datasource,
      ctx: props.ctx,
    });
    await reloadSilently();
  } catch (e) {
    console.error('[alarm-card.ack]', e);
  }
}

async function handleClear(item: AlarmItem) {
  try {
    await handleClearAlarm(item, {
      item,
      widget: props.widget,
      datasource: props.datasource,
      ctx: props.ctx,
    });
    await reloadSilently();
  } catch (e) {
    console.error('[alarm-card.clear]', e);
  }
}

function openDetail(item: AlarmItem) {
  currentDetailItem.value = item;
  detailVisible.value = true;
}

watch(
  () => [
    props.datasource,
    props.widget,
    props.timewindow?.startTs,
    props.timewindow?.endTs,
    settings.value.pageSize,
  ],
  () => {
    page.value = 0;
    reloadSilently();
  },
  { deep: true }
);

onMounted(() => {
  reloadSilently();
});
</script>

<style scoped>
.tb-alarm-card-widget {
  width: 100%;
  height: 100%;
  min-height: 220px;
}
.tb-alarm-card-widget__title {
  margin-bottom: 12px;
  font-size: 16px;
  font-weight: 600;
}
.tb-alarm-card-widget__loading {
  padding: 24px;
  color: #666;
}
.tb-alarm-card-widget__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.tb-alarm-card-widget__item {
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  background: #fff;
  padding: 12px;
}
.tb-alarm-card-widget__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.tb-alarm-card-widget__name {
  font-size: 15px;
  font-weight: 600;
  word-break: break-word;
}
.tb-alarm-card-widget__meta {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
}
.tb-alarm-card-widget__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tb-alarm-card-widget__btn {
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: #1677ff;
  color: #fff;
  cursor: pointer;
}
.tb-alarm-card-widget__btn:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}
.tb-alarm-card-widget__btn--warn {
  background: #fa8c16;
}
.tb-alarm-card-widget__btn--ghost {
  background: #f5f5f5;
  color: #333;
}
.tb-alarm-card-widget__pager {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
</style>