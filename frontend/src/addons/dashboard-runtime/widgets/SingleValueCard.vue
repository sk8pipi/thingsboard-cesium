<script setup lang="ts">
  import type { ParsedWidget } from '../sdk/types';

  const props = defineProps<{
    widget: ParsedWidget;
    data: any; // telemetry.ts 返回的 TsKvEntity
  }>();

  function getLatestValue() {
    const key = props.widget.keys?.[0];
    const entry = key ? props.data?.[key] : undefined;
    const first = entry?.data?.[0];
    return {
      key,
      ts: first?.ts,
      value: first?.value,
    };
  }
</script>

<template>
  <div class="flex items-center min-h-16">
    <template v-if="data">
      <div>
        <div class="text-sm opacity-70">{{ getLatestValue().key }}</div>
        <div class="text-2xl font-700">
          {{ getLatestValue().value ?? '-' }}
        </div>
      </div>
    </template>
    <template v-else>
      <div class="text-sm opacity-70">暂无数据</div>
    </template>
  </div>
</template>
