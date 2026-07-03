<template>
  <div class="aggregate-metric-grid" :class="`aggregate-metric-grid--${columns}`">
    <div
      v-for="item in items"
      :key="item.label"
      class="aggregate-metric-grid__item"
      :class="item.tone && `is-${item.tone}`"
    >
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
      <small v-if="item.hint">{{ item.hint }}</small>
    </div>
  </div>
</template>

<script setup lang="ts">
  export type AggregateMetricItem = {
    label: string;
    value: string | number;
    hint?: string;
    tone?: 'cyan' | 'green' | 'orange' | 'red';
  };

  withDefaults(defineProps<{ items: AggregateMetricItem[]; columns?: number }>(), { columns: 2 });
</script>

<style scoped>
  .aggregate-metric-grid {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .aggregate-metric-grid__item {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 12px;
    border: 1px solid rgba(148, 214, 255, 0.16);
    border-radius: 10px;
    background: linear-gradient(145deg, rgba(25, 78, 112, 0.18), rgba(5, 20, 36, 0.08));
  }

  .aggregate-metric-grid__item span {
    color: rgba(226, 242, 255, 0.7);
    font-size: 12px;
  }

  .aggregate-metric-grid__item strong {
    margin-top: 5px;
    color: #dff8ff;
    font-size: clamp(22px, 3vw, 34px);
    line-height: 1;
    text-shadow: 0 0 18px rgba(56, 189, 248, 0.2);
  }

  .aggregate-metric-grid__item small {
    margin-top: 6px;
    color: rgba(226, 242, 255, 0.5);
    font-size: 10px;
  }

  .aggregate-metric-grid__item.is-green strong {
    color: #86efac;
  }
  .aggregate-metric-grid__item.is-orange strong {
    color: #fdba74;
  }
  .aggregate-metric-grid__item.is-red strong {
    color: #fca5a5;
  }
  .aggregate-metric-grid__item.is-cyan strong {
    color: #7dd3fc;
  }
</style>
