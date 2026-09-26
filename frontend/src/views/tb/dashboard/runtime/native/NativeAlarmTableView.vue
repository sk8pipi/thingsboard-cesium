<template>
  <div class="native-alarm-table">
    <div v-if="settings.enableSearch || settings.enableFilter" class="native-alarm-tools">
      <form v-if="settings.enableSearch" @submit.prevent="applySearch">
        <input v-model="searchDraft" aria-label="搜索告警" placeholder="搜索告警" />
        <button type="submit">搜索</button>
      </form>
      <template v-if="settings.enableFilter">
        <select v-model="status" aria-label="筛选告警状态"
          ><option value="">全部状态</option
          ><option value="ACTIVE">活跃</option
          ><option value="CLEARED">已清除</option
          ><option value="ACK">已确认</option
          ><option value="UNACK">未确认</option></select
        >
        <select v-model="severity" aria-label="筛选告警等级"
          ><option value="">全部等级</option
          ><option value="CRITICAL">严重</option
          ><option value="MAJOR">重要</option
          ><option value="MINOR">次要</option
          ><option value="WARNING">警告</option
          ><option value="INDETERMINATE">未确定</option></select
        >
      </template>
      <button type="button" @click="refresh">刷新</button>
    </div>
    <div v-if="loading && !rows.length" class="native-alarm-message" role="status">正在读取告警…</div>
    <div v-else-if="error && !rows.length" class="native-alarm-message" role="status">{{ error }}</div>
    <div v-else class="native-alarm-scroll">
      <table>
        <thead
          ><tr
            ><th v-if="settings.enableSelection">选择</th><th>等级</th><th>创建时间</th><th>来源</th><th>类型</th
            ><th>状态</th><th>操作</th></tr
          ></thead
        >
        <tbody>
          <template v-for="row in rows" :key="row.id">
            <tr>
              <td v-if="settings.enableSelection"
                ><input v-model="selected" type="checkbox" :value="row.id" :aria-label="`选择 ${row.name}`"
              /></td>
              <td>{{ row.severity }}</td
              ><td>{{ formatTime(row.createdTime) }}</td
              ><td>{{ row.originator?.name || '—' }}</td
              ><td>{{ row.type || row.name }}</td
              ><td>{{ row.status }}</td>
              <td class="native-alarm-actions">
                <button
                  v-if="settings.displayDetails"
                  type="button"
                  @click="detailId = detailId === row.id ? '' : row.id"
                  >{{ detailId === row.id ? '收起' : '详情' }}</button
                >
                <button
                  v-if="settings.allowAcknowledgment && !row.status.endsWith('_ACK')"
                  type="button"
                  :disabled="previewOnly || busyId === row.id"
                  @click="mutate('ack', row.id)"
                  >确认</button
                >
                <button
                  v-if="settings.allowClear && !row.status.includes('CLEARED')"
                  type="button"
                  :disabled="previewOnly || busyId === row.id"
                  @click="mutate('clear', row.id)"
                  >清除</button
                >
              </td>
            </tr>
            <tr v-if="detailId === row.id" class="native-alarm-details"
              ><td :colspan="settings.enableSelection ? 7 : 6"
                ><strong>{{ row.name }}</strong
                ><pre>{{ details(row.details) }}</pre>
              </td></tr
            >
          </template>
        </tbody>
      </table>
      <div v-if="!rows.length" class="native-alarm-message">暂无告警</div>
    </div>
    <div v-if="error && rows.length" class="native-alarm-message" role="status">{{ error }}</div>
    <footer v-if="settings.displayPagination" class="native-alarm-footer">
      <span v-if="settings.enableSelection">已选 {{ selected.length }} 条 · </span><span>共 {{ total }} 条</span>
      <button type="button" :disabled="page === 0" @click="page--">上一页</button>
      <span>{{ page + 1 }} / {{ Math.max(1, totalPages) }}</span>
      <button type="button" :disabled="page + 1 >= totalPages" @click="page++">下一页</button>
    </footer>
    <div v-else-if="total > rows.length" class="native-alarm-message"
      >共 {{ total }} 条，当前显示前 {{ rows.length }} 条；开启分页可浏览全部。</div
    >
  </div>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue';
  import { fetchAlarmPage, ackAlarm, clearAlarm } from '../widgets/alarm/api';
  import { nativeAlarmTableQuery } from './nativeAlarmTableCore';
  import type { AlarmItem } from '../widgets/alarm/types';
  import type { NativeAlarmTableSettings, NativeOptions } from './nativeWidgetTypes';

  const props = defineProps<{
    settings: NativeAlarmTableSettings;
    options: NativeOptions;
    pollMs: number;
    previewOnly?: boolean;
  }>();
  const rows = ref<AlarmItem[]>([]);
  const loading = ref(false);
  const error = ref('');
  const page = ref(0);
  const total = ref(0);
  const totalPages = ref(1);
  const searchDraft = ref('');
  const search = ref('');
  const status = ref('');
  const severity = ref('');
  const selected = ref<string[]>([]);
  const detailId = ref('');
  const busyId = ref('');
  const refreshTick = ref(0);

  function applySearch() {
    page.value = 0;
    search.value = searchDraft.value;
  }
  function refresh() {
    refreshTick.value++;
  }
  function formatTime(value: number) {
    return value ? new Date(value).toLocaleString() : '—';
  }
  function details(value: unknown) {
    return JSON.stringify(value || {}, null, 2);
  }
  async function mutate(kind: 'ack' | 'clear', id: string) {
    if (props.previewOnly || busyId.value) return;
    busyId.value = id;
    error.value = '';
    try {
      if (kind === 'ack') await ackAlarm(id);
      else await clearAlarm(id);
      refresh();
    } catch (cause: any) {
      error.value = cause?.message || '告警操作失败';
    } finally {
      busyId.value = '';
    }
  }

  watch(
    () => JSON.stringify([props.settings, props.options.window, status.value, severity.value]),
    () => {
      page.value = 0;
      selected.value = [];
    },
  );
  watch(
    () =>
      JSON.stringify([
        props.settings,
        props.options.window,
        props.pollMs,
        page.value,
        search.value,
        status.value,
        severity.value,
        refreshTick.value,
      ]),
    (_value, _previous, onCleanup) => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      loading.value = !rows.value.length;
      const run = async () => {
        try {
          const result = await fetchAlarmPage(
            nativeAlarmTableQuery(
              props.settings,
              props.options,
              page.value,
              search.value,
              status.value,
              severity.value,
            ),
          );
          if (!active) return;
          rows.value = result.data;
          total.value = result.totalElements;
          totalPages.value = result.totalPages;
          error.value = '';
        } catch (cause: any) {
          if (active) {
            rows.value = [];
            error.value = cause?.message || '告警读取失败';
          }
        } finally {
          if (active) {
            loading.value = false;
            timer = setTimeout(run, Math.max(5000, props.pollMs));
          }
        }
      };
      void run();
      onCleanup(() => {
        active = false;
        if (timer) clearTimeout(timer);
      });
    },
    { immediate: true },
  );
</script>

<style scoped>
  .native-alarm-table {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 0;
    padding: 8px;
    gap: 8px;
  }
  .native-alarm-tools,
  .native-alarm-tools form,
  .native-alarm-footer,
  .native-alarm-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .native-alarm-tools input,
  .native-alarm-tools select {
    min-width: 100px;
    max-width: 180px;
  }
  .native-alarm-scroll {
    min-height: 0;
    overflow: auto;
    flex: 1;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    white-space: nowrap;
  }
  th,
  td {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.24);
  }
  .native-alarm-details pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 180px;
    overflow: auto;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .native-alarm-message {
    padding: 8px;
  }
  .native-alarm-footer {
    justify-content: flex-end;
  }
</style>
