<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { getWidgetComponent } from './registry';
  import type { ParsedWidget } from './types';
  import { fetchLatest, fetchTimeseries } from '../data/fetch';
  const props = defineProps<{
    widget: ParsedWidget;
  }>();

  const Comp = computed(() => getWidgetComponent(props.widget.kind));

  const loading = ref(false);
  const errorMsg = ref('');
  const data = ref<any>(null);

  async function load() {
    errorMsg.value = '';
    data.value = null;

    if (!props.widget.entity) {
      errorMsg.value = '该 Widget 没有解析到实体(entity)。目前只支持最简单的 singleEntity/直接 entityId。';
      return;
    }
    if (!props.widget.keys?.length) {
      errorMsg.value = '该 Widget 没有解析到 keys。';
      return;
    }

    loading.value = true;
    try {
      if (props.widget.kind === 'singleValue') {
        data.value = await fetchLatest(props.widget.entity, props.widget.keys);
      } else if (props.widget.kind === 'timeseries') {
        data.value = await fetchTimeseries(props.widget.entity, props.widget.keys, props.widget.timewindow);
      } else {
        // 未支持：先用 latest 尝试
        data.value = await fetchLatest(props.widget.entity, props.widget.keys);
      }
    } catch (e: any) {
      errorMsg.value = e?.message || '加载失败';
    } finally {
      loading.value = false;
    }
  }

  watch(
    () => [props.widget.id, props.widget.kind, props.widget.entity?.id, props.widget.keys.join(',')],
    () => load(),
    { immediate: true },
  );
</script>

<template>
  <div class="border rounded p-3 bg-white dark:bg-[#1f1f1f]">
    <div class="flex items-center justify-between mb-2">
      <div class="truncate font-600">{{ widget.title }}</div>
      <button class="text-sm opacity-70 hover:opacity-100" @click="load">刷新</button>
    </div>

    <div v-if="loading" class="text-sm opacity-70">加载中...</div>
    <div v-else-if="errorMsg" class="text-sm text-red-500 whitespace-pre-wrap">{{ errorMsg }}</div>
    <component v-else :is="Comp" :widget="widget" :data="data" />
  </div>
</template>
