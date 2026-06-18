<script setup lang="ts">
  import type { ParsedDashboard } from '../sdk/types';
  import WidgetHost from '../sdk/WidgetHost.vue';

  defineProps<{
    model: ParsedDashboard;
  }>();
</script>

<template>
  <div>
    <div class="mb-3 text-xl font-700">{{ model.title }}</div>

    <!-- 自动网格：先 2 列，后续你想改 3 列/响应式都很容易 -->
    <div class="grid gap-3" style="grid-template-columns: repeat(2, minmax(0, 1fr))">
      <WidgetHost v-for="w in model.widgets" :key="w.id" :widget="w" />
    </div>
  </div>
</template>
