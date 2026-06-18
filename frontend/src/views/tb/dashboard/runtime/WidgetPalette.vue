<script setup lang="ts">
  import type { WidgetType } from './types';

  const emit = defineEmits<{
    (e: 'add', type: WidgetType): void;
  }>();

  const items: { type: WidgetType; name: string }[] = [
    { type: 'singleValue', name: '单值卡片' },
    { type: 'timeseries', name: '折线图' },
    { type: 'table', name: '表格' },
  ];
</script>

<template>
  <div class="p-3 border rounded">
    <div class="mb-2 font-600">部件库</div>
    <div class="flex flex-col gap-2">
      <button
        v-for="it in items"
        :key="it.type"
        class="px-3 py-2 text-left border rounded"
        @click="emit('add', it.type)"
      >
        + {{ it.name }}
      </button>
    </div>
    <div class="mt-3 text-xs opacity-60">先用“点击添加”最稳，等跑通后再做真正拖拽。</div>
  </div>
</template>
