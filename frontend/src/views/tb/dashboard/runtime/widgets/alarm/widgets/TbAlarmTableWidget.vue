<template>
  <div class="tb-alarm-widget">
    <div v-if="settings.title" class="tb-alarm-widget__title">
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

    <AlarmTable
      :rows="rows"
      :loading="loading"
      :error="error"
      :settings="settings"
      :page="page"
      :total="total"
      :has-next="hasNext"
      @prev-page="handlePrevPage"
      @next-page="handleNextPage"
      @ack="handleAck"
      @clear="handleClear"
      @detail="openDetail"
    />

    <AlarmDetailDialog v-model:visible="detailVisible" :item="currentDetailItem" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AlarmToolbar from '../components/AlarmToolbar.vue';
import AlarmTable from '../components/AlarmTable.vue';
import AlarmDetailDialog from '../components/AlarmDetailDialog.vue';
import { parseAlarmSettings } from '../settings';
import { useAlarmData } from '../composables/useAlarmData';
import { handleAckAlarm, handleClearAlarm } from '../actions';
import type { AlarmItem } from '../types';
import { normalizeId } from '../utils';

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

const hasValidDatasource = computed(() => {
  const { entityId, entityType } = resolveEntity();
  return !!entityId && !!entityType;
});

function resolveDatasource() {
  return (
    props.datasource ||
    props.widget?.config?.datasource ||
    props.widget?.config?.datasources?.[0] ||
    props.widget?.datasource ||
    null
  );
}

function normalizeEntityType(type?: string) {
  if (!type) return '';
  return String(type).toUpperCase();
}

function resolveEntity() {
  const ds = resolveDatasource();

  const entityId =
    normalizeId(ds?.entityId) ||
    normalizeId(ds?.deviceId) ||
    normalizeId(ds?.entity?.id) ||
    '';

  const entityType =
    normalizeEntityType(
      ds?.entityType ||
      ds?.entity?.entityType ||
      ''
    );

  return {
    entityId,
    entityType,
  };
}

function buildQuery() {
  const { entityId, entityType } = resolveEntity();

  const statusList = statusValue.value
    ? [statusValue.value]
    : (settings.value.defaultStatusList?.length ? settings.value.defaultStatusList : undefined);

  const severityList = severityValue.value
    ? [severityValue.value]
    : (settings.value.defaultSeverityList?.length ? settings.value.defaultSeverityList : undefined);

  return {
    page: page.value,
    pageSize: settings.value.pageSize,
    searchText: searchText.value.trim() || undefined,
    sortProperty: 'createdTime' as const,
    sortOrder: 'DESC' as const,
    startTime: props.timewindow?.startTs,
    endTime: props.timewindow?.endTs,
    statusList,
    severityList,
    entityId: entityId || undefined,
    entityType: entityType || undefined,
  };
}

const { rows, loading, error, hasNext, total, reload } = useAlarmData(buildQuery);

async function reloadSilently() {
  try {
    const q = buildQuery();
    console.log('[alarm.buildQuery]', q);
    console.log('[alarm.datasource]', resolveDatasource());
    await reload();
  } catch (e: any) {
    console.error('[alarm.reload]', e);
    console.error('[alarm.reload.response]', e?.response?.data);
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
    console.error('[alarm.ack]', e);
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
    console.error('[alarm.clear]', e);
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
.tb-alarm-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 220px;
}
.tb-alarm-widget__title {
  margin-bottom: 12px;
  font-size: 16px;
  font-weight: 600;
  color: #1f1f1f;
}
.tb-alarm-widget__placeholder {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8c8c8c;
  border: 1px dashed #d9d9d9;
  border-radius: 10px;
  background: #fafafa;
}
</style>