<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import type { ParsedWidget } from '../sdk/types';
  import { useECharts } from '/@/hooks/web/useECharts';

  const props = defineProps<{
    widget: ParsedWidget;
    data: any; // telemetry.ts 返回 TsKvEntity
  }>();

  const chartRef = ref<HTMLDivElement | null>(null);
  const { setOptions } = useECharts(chartRef as any);

  const seriesData = computed(() => {
    const key = props.widget.keys?.[0];
    const entry = key ? props.data?.[key] : undefined;
    const arr = entry?.data || [];
    return arr.map((p: any) => [p.ts, p.value]);
  });

  function render() {
    setOptions({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'time' },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'line',
          showSymbol: false,
          data: seriesData.value,
        },
      ],
    });
  }

  watch(
    () => props.data,
    () => render(),
    { deep: true },
  );
  onMounted(() => render());
</script>

<template>
  <div>
    <div ref="chartRef" style="height: 240px; width: 100%"></div>
    <div v-if="!data" class="text-sm opacity-70">暂无数据</div>
  </div>
</template>
