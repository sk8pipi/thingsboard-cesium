<template>
  <el-drawer v-model="visible" direction="rtl" size="320px" :with-header="false" :destroy-on-close="false">
    <div class="flex items-center justify-between p-3">
      <div class="font-700">部件库</div>
      <button class="px-2 py-1 border rounded" @click="visible = false">关闭</button>
    </div>

    <div class="px-3 pb-3">
      <WidgetPalette @add="(t) => emit('add', t)" />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import WidgetPalette from './WidgetPalette.vue';
  import type { WidgetType } from './types';

  const props = defineProps<{
    modelValue: boolean;
  }>();

  const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void;
    (e: 'add', type: WidgetType): void;
  }>();

  const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
  });
</script>
