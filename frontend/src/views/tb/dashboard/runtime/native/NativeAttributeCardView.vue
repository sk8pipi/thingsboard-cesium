<template>
  <div class="native-attribute-card">
    <section v-for="group in groups" :key="group.id" class="native-attribute-group">
      <h3 v-if="settings.showSourceTitle">{{ group.title }}</h3>
      <table>
        <tbody>
          <tr v-for="row in group.rows" :key="row.id">
            <th scope="row" :style="{ width: `${settings.labelWidth}%` }">{{ row.label }}</th>
            <td :title="row.error || undefined">{{ row.error ? '—' : row.value }}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <div v-if="!groups.length" class="native-attribute-empty">暂无可显示的属性</div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { nativeAttributeCardGroups } from './nativeAttributeCardCore';
  import type { NativeSeries } from './nativeWidgetDataCore';
  import type { NativeAttributeCardSettings, NativeSource } from './nativeWidgetTypes';

  const props = defineProps<{
    settings: NativeAttributeCardSettings;
    sources: NativeSource[];
    series: NativeSeries[];
    decimals?: number;
    units?: string;
  }>();
  const groups = computed(() =>
    nativeAttributeCardGroups(props.sources, props.series, props.settings, props.decimals, props.units),
  );
</script>

<style scoped>
  .native-attribute-card {
    width: 100%;
    min-height: 0;
    overflow: auto;
    padding: 8px 12px;
  }
  .native-attribute-group + .native-attribute-group {
    margin-top: 12px;
  }
  .native-attribute-group h3 {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .native-attribute-group table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .native-attribute-group th,
  .native-attribute-group td {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.22);
    text-align: left;
    overflow-wrap: anywhere;
  }
  .native-attribute-group th {
    font-weight: 500;
    opacity: 0.7;
  }
  .native-attribute-empty {
    padding: 12px;
    opacity: 0.7;
  }
</style>
