import { computed, ref } from 'vue';
import { fetchAlarmPage } from '../api';
import type { AlarmPage, AlarmQuery } from '../types';

export function useAlarmData(buildQuery: () => AlarmQuery) {
  const loading = ref(false);
  const error = ref<string>('');
  const pageData = ref<AlarmPage>({
    data: [],
    totalPages: 1,
    totalElements: 0,
    hasNext: false,
    hasPrev: false,
  });

  async function reload() {
    loading.value = true;
    error.value = '';
    try {
      pageData.value = await fetchAlarmPage(buildQuery());
    } catch (err: any) {
      pageData.value = {
        data: [],
        totalPages: 1,
        totalElements: 0,
        hasNext: false,
        hasPrev: false,
      };
      error.value = err?.message || '加载报警数据失败';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  const rows = computed(() => pageData.value.data);
  const total = computed(() => pageData.value.totalElements);
  const hasNext = computed(() => pageData.value.hasNext);
  const hasPrev = computed(() => pageData.value.hasPrev);

  return {
    loading,
    error,
    pageData,
    rows,
    total,
    hasNext,
    hasPrev,
    reload,
  };
}
