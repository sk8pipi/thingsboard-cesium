<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useRoute } from 'vue-router';
  import DashboardRunner from '../engine/DashboardRunner.vue';
  import { getDashboardById } from '/@/api/tb/dashboard';
  import { parseDashboard } from '../engine/parseDashboard';

  const route = useRoute();

  const loading = ref(false);
  const errorMsg = ref('');
  const model = ref<any>(null);

  const dashboardId = computed(() => (route.query.id as string) || '');

  async function load() {
    errorMsg.value = '';
    model.value = null;

    if (!dashboardId.value) {
      errorMsg.value = '缺少参数 id。示例：/addon/dashboard-preview?id=xxxxxxxx';
      return;
    }

    loading.value = true;
    try {
      const dash = await getDashboardById(dashboardId.value);
      model.value = parseDashboard(dash as any);
    } catch (e: any) {
      errorMsg.value = e?.message || '加载 Dashboard 失败';
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => load());
</script>

<template>
  <div class="p-4">
    <div v-if="loading" class="text-sm opacity-70">加载中...</div>
    <div v-else-if="errorMsg" class="text-sm text-red-500 whitespace-pre-wrap">{{ errorMsg }}</div>
    <DashboardRunner v-else-if="model" :model="model" />
  </div>
</template>
