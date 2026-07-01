<template>
  <div v-if="visible" class="sensor-widget-popup">
    <div class="sensor-widget-popup__header">
      <div>
        <div class="sensor-widget-popup__title">
          {{ sensor?.name || '传感器部件' }}
        </div>
        <div class="sensor-widget-popup__sub">
          {{ sensor?.deviceName || sensor?.deviceId || '' }}
        </div>
      </div>

      <button class="sensor-widget-popup__close" type="button" @click="$emit('close')"> 关闭 </button>
    </div>

    <div class="sensor-widget-popup__info">
      <div v-for="item in infoRows" :key="item.label" class="sensor-widget-popup__info-row">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </div>
    </div>

    <div v-if="!normalizedWidgets.length" class="sensor-widget-popup__empty"> 暂无部件 </div>

    <SensorPopupWidgetGrid v-else :widgets="normalizedWidgets" :runtime="datasourceRuntime" />
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount } from 'vue';
  import { createDatasourceRuntime, type DatasourceRuntime } from '../dashboard/runtime/datasourceRuntime';
  import type { DashboardWidget, LocalWidgetKey, TbWidgetConfig } from '../dashboard/runtime/types';
  import { widgetRegistry } from '../dashboard/runtime/widgets/registry/widgetRegistry';
  import SensorPopupWidgetGrid from './SensorPopupWidgetGrid.vue';
  import type { PopupWidgetConfig } from './sensorPopupWidgetStorage';
  import type { MapTemplateRuntimeDevices } from './services/mapTemplateRuntimeService';

  type WidgetData = DashboardWidget & { type?: LocalWidgetKey; config: TbWidgetConfig };

  type SensorPopupWidgetInput = WidgetData | PopupWidgetConfig | Record<string, any>;

  const props = defineProps<{
    visible: boolean;
    sensor?: any;
    widgets: SensorPopupWidgetInput[];
    runtimeDevices?: MapTemplateRuntimeDevices | null;
    runtime?: DatasourceRuntime;
  }>();

  defineEmits<{
    (e: 'close'): void;
  }>();

  const ownedDatasourceRuntime = props.runtime ? null : createDatasourceRuntime();
  const datasourceRuntime = props.runtime || ownedDatasourceRuntime!;

  function formatCoordinate(value: unknown) {
    const coordinate = Number(value);
    return Number.isFinite(coordinate) ? coordinate.toFixed(6) : '-';
  }

  const infoRows = computed(() => {
    const sensor = props.sensor || {};
    return [
      { label: '设备', value: sensor.entityName || sensor.name || '-' },
      {
        label: '状态',
        value: sensor.statusText || (sensor.online === true ? '在线' : sensor.online === false ? '离线' : '-'),
      },
      { label: '类型', value: sensor.description || sensor.entityType || '-' },
      { label: '经度', value: formatCoordinate(sensor.longitude) },
      { label: '纬度', value: formatCoordinate(sensor.latitude) },
    ];
  });

  const normalizedWidgets = computed<WidgetData[]>(() => {
    return (props.widgets || [])
      .map((w: any) => {
        const widgetKey = w?.widgetKey || w?.type;
        const def = widgetKey ? widgetRegistry[widgetKey as LocalWidgetKey] : null;
        if (!def) return null;

        return {
          id: String(w?.id || ''),
          category: w?.category || def.category,
          widgetKey,
          type: widgetKey,
          typeFullFqn: w?.typeFullFqn || def.typeFullFqn,
          title: w?.title || def.title,
          config: {
            ...def.defaultConfig,
            ...(w?.config || {}),
          },
        } as WidgetData;
      })
      .filter(Boolean) as WidgetData[];
  });

  onMounted(() => {
    datasourceRuntime.connect();
  });

  onBeforeUnmount(() => {
    ownedDatasourceRuntime?.close();
  });
</script>

<style scoped>
  .sensor-widget-popup {
    position: absolute;
    right: 16px;
    top: 16px;
    z-index: 1600;
    width: min(720px, calc(100% - 32px));
    box-sizing: border-box;
    max-height: calc(100% - 32px);
    overflow: auto;
    padding: 16px;
    border-radius: 12px;
    background: rgba(18, 22, 30, 0.96);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  }

  .sensor-widget-popup__header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .sensor-widget-popup__title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .sensor-widget-popup__sub {
    font-size: 12px;
    opacity: 0.72;
    word-break: break-all;
  }

  .sensor-widget-popup__close {
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .sensor-widget-popup__info {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 14px;
  }

  .sensor-widget-popup__info-row {
    min-width: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
  }

  .sensor-widget-popup__info-row span {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    opacity: 0.68;
  }

  .sensor-widget-popup__info-row strong {
    display: block;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sensor-widget-popup__empty {
    font-size: 13px;
    opacity: 0.8;
  }
</style>
