<template>
  <div class="tb-alarm-widget">
    <!-- <div v-if="settings.title" class="tb-alarm-widget__title">
      {{ settings.title }}
    </div> -->

    <AlarmToolbar
      v-if="settings.showSearch"
      v-model:searchText="searchText"
      v-model:statusValue="statusValue"
      v-model:severityValue="severityValue"
      @search="handleSearch"
      @refresh="reloadSilently"
    />

    <AlarmTable
      class="tb-alarm-widget__table"
      :rows="rows"
      :loading="loading"
      :error="error"
      :settings="settings"
      @ack="handleAck"
      @focus="handleFocus"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import AlarmToolbar from '../components/AlarmToolbar.vue';
  import AlarmTable from '../components/AlarmTable.vue';
  import { parseAlarmSettings } from '../settings';
  import { useAlarmData } from '../composables/useAlarmData';
  import { handleAckAlarm } from '../actions';
  import type { AlarmItem } from '../types';
  import { emitAlarmFocus } from '../focus';

  const props = defineProps<{
    widget?: any;
    datasource?: any;
    ctx?: any;
    timewindow?: {
      startTs?: number;
      endTs?: number;
    };
  }>();
  const searchText = ref('');
  const statusValue = ref('');
  const severityValue = ref('');

  let autoRefreshTimer: number | undefined;
  let autoRefreshing = false;
  const AUTO_REFRESH_INTERVAL = 10_000;

  const settings = computed(() => {
    const rawSettings = props.widget?.config?.settings || props.widget?.settings || {};
    return parseAlarmSettings(rawSettings);
  });

  function buildQuery() {
    const statusList = statusValue.value
      ? [statusValue.value]
      : settings.value.defaultStatusList?.length
        ? settings.value.defaultStatusList
        : undefined;

    const severityList = severityValue.value
      ? [severityValue.value]
      : settings.value.defaultSeverityList?.length
        ? settings.value.defaultSeverityList
        : undefined;

    return {
      page: 0,
      pageSize: Math.max(settings.value.pageSize, 100),
      searchText: searchText.value.trim() || undefined,
      sortProperty: 'createdTime' as const,
      sortOrder: 'DESC' as const,
      statusList,
      severityList,
      fetchMode: 'all' as const,
    };
  }

  const { rows, loading, error, reload } = useAlarmData(buildQuery);

  async function reloadSilently() {
    if (autoRefreshing) return;

    autoRefreshing = true;
    try {
      await reload();
    } catch (e: any) {
      console.error('[alarm.reload]', e);
      console.error('[alarm.reload.response]', e?.response?.data);
    } finally {
      autoRefreshing = false;
    }
  }

  function startAutoRefresh() {
    if (autoRefreshTimer) return;

    autoRefreshTimer = window.setInterval(() => {
      if (!document.hidden) {
        void reloadSilently();
      }
    }, AUTO_REFRESH_INTERVAL);
  }

  function stopAutoRefresh() {
    if (!autoRefreshTimer) return;
    window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = undefined;
  }

  function handleSearch() {
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

  function handleFocus(item: AlarmItem) {
    emitAlarmFocus(item, props.ctx);
  }

  watch(
    () => [props.widget?.config?.settings, settings.value.pageSize],
    () => {
      reloadSilently();
    },
    { deep: true },
  );

  onMounted(() => {
    void reloadSilently();
    startAutoRefresh();
  });

  onBeforeUnmount(() => {
    stopAutoRefresh();
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
  .tb-alarm-widget__table {
    min-height: 0;
    flex: 1 1 auto;
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
