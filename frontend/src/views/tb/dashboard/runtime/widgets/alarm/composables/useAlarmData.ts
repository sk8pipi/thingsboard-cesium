import { computed, ref } from 'vue';
import { fetchAlarmPage } from '../api';
import type { AlarmItem, AlarmPage, AlarmQuery } from '../types';

function getAlarmFingerprint(item: AlarmItem) {
  return [
    item.id,
    item.status,
    item.severity,
    item.createdTime,
    item.startTs,
    item.endTs,
    item.ackTs,
    item.clearTs,
    item.name,
    item.type,
    item.originator?.id,
    item.originator?.name,
    JSON.stringify(item.details || {}),
  ].join('|');
}

function isSameAlarmPage(current: AlarmPage, next: AlarmPage) {
  if (
    current.totalPages !== next.totalPages ||
    current.totalElements !== next.totalElements ||
    current.hasNext !== next.hasNext ||
    current.hasPrev !== next.hasPrev ||
    current.data.length !== next.data.length
  ) {
    return false;
  }

  return current.data.every((item, index) => getAlarmFingerprint(item) === getAlarmFingerprint(next.data[index]));
}

export function useAlarmData(buildQuery: () => AlarmQuery) {
  const loading = ref(false);
  const refreshing = ref(false);
  const error = ref<string>('');
  const hasLoaded = ref(false);
  const pageData = ref<AlarmPage>({
    data: [],
    totalPages: 1,
    totalElements: 0,
    hasNext: false,
    hasPrev: false,
  });

  async function reload() {
    const showLoading = !hasLoaded.value;
    if (showLoading) loading.value = true;
    refreshing.value = true;
    error.value = '';
    try {
      const nextPage = await fetchAlarmPage(buildQuery());
      if (!isSameAlarmPage(pageData.value, nextPage)) pageData.value = nextPage;
      hasLoaded.value = true;
    } catch (err: any) {
      if (!hasLoaded.value) {
        pageData.value = {
          data: [],
          totalPages: 1,
          totalElements: 0,
          hasNext: false,
          hasPrev: false,
        };
      }
      error.value = err?.message || 'Failed to load alarm data';
      throw err;
    } finally {
      if (showLoading) loading.value = false;
      refreshing.value = false;
    }
  }

  const rows = computed(() => pageData.value.data);
  const total = computed(() => pageData.value.totalElements);
  const hasNext = computed(() => pageData.value.hasNext);
  const hasPrev = computed(() => pageData.value.hasPrev);

  return {
    loading,
    refreshing,
    error,
    pageData,
    rows,
    total,
    hasNext,
    hasPrev,
    reload,
  };
}
