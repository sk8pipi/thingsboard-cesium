<template>
  <div class="device-type-donut">
    <div class="device-type-donut__chart" :style="{ background: donutBackground }">
      <div class="device-type-donut__center">
        <strong>{{ total }}</strong>
        <span>设备</span>
      </div>
    </div>
    <div class="device-type-donut__legend">
      <div v-for="(item, index) in groups" :key="item.type" class="device-type-donut__legend-item">
        <i :style="{ background: colorFor(index) }"></i>
        <span :title="item.type">{{ item.type }}</span>
        <strong>{{ item.total }}</strong>
        <small>{{ item.online }}/{{ item.total }} 在线</small>
      </div>
      <div v-if="!groups.length" class="device-type-donut__empty">暂无设备</div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import type { TemplateRuntimeDevices } from './templateAggregate';
  import { groupDevicesByType } from './resourceUsage';

  const props = defineProps<{
    config?: Record<string, any>;
    ctx?: { runtimeDevices?: TemplateRuntimeDevices | null };
  }>();

  const palette = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#f97316', '#14b8a6', '#ef4444', '#eab308'];
  const groups = computed(() => groupDevicesByType(props.ctx?.runtimeDevices));
  const total = computed(() => groups.value.reduce((result, item) => result + item.total, 0));

  function colorFor(index: number) {
    return palette[index % palette.length];
  }

  const donutBackground = computed(() => {
    if (!total.value) return 'conic-gradient(rgba(148, 163, 184, .24) 0deg 360deg)';
    let cursor = 0;
    const segments = groups.value.map((item, index) => {
      const start = cursor;
      const end = cursor + (item.total / total.value) * 360;
      cursor = end;
      return `${colorFor(index)} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  });
</script>

<style scoped>
  .device-type-donut {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: minmax(120px, 0.9fr) minmax(0, 1.3fr);
    align-items: center;
    gap: 14px;
    color: #e0f2fe;
  }

  .device-type-donut__chart {
    position: relative;
    width: min(160px, 92%);
    aspect-ratio: 1;
    justify-self: center;
    border-radius: 50%;
    box-shadow: 0 0 32px rgba(56, 189, 248, 0.14);
  }

  .device-type-donut__chart::after {
    position: absolute;
    inset: 20%;
    border-radius: 50%;
    background: rgba(4, 20, 34, 0.92);
    content: '';
  }

  .device-type-donut__center {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: grid;
    place-content: center;
    text-align: center;
  }

  .device-type-donut__center strong {
    font-size: 32px;
    line-height: 1;
  }

  .device-type-donut__center span {
    margin-top: 5px;
    color: rgba(226, 242, 255, 0.6);
    font-size: 11px;
  }

  .device-type-donut__legend {
    display: grid;
    gap: 8px;
    min-width: 0;
    max-height: 100%;
    overflow: auto;
    padding-right: 2px;
  }

  .device-type-donut__legend-item {
    min-width: 0;
    display: grid;
    grid-template-columns: 9px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    color: rgba(226, 242, 255, 0.72);
    font-size: 12px;
  }

  .device-type-donut__legend-item i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .device-type-donut__legend-item span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .device-type-donut__legend-item strong {
    color: #e0f2fe;
    font-size: 16px;
  }

  .device-type-donut__legend-item small {
    grid-column: 2 / -1;
    color: rgba(226, 242, 255, 0.48);
    font-size: 10px;
  }

  .device-type-donut__empty {
    color: rgba(226, 242, 255, 0.56);
    font-size: 12px;
  }

  @media (max-width: 560px) {
    .device-type-donut {
      grid-template-columns: 1fr;
    }
  }
</style>
