<template>
  <div v-if="visible" class="sensor-widget-popup tb-widget-surface">
    <div class="sensor-widget-popup__header">
      <div>
        <div class="sensor-widget-popup__title">
          {{ sensor?.name || '传感器部件' }}
        </div>
        <div class="sensor-widget-popup__sub">
          {{ sensor?.deviceName || sensor?.deviceId || '' }}
        </div>
      </div>

      <button v-if="exportEnabled" class="sensor-widget-popup__export" type="button" @click="exportVisible = true"
        >&#23548;&#20986;&#25968;&#25454;</button
      >
      <button class="sensor-widget-popup__close" type="button" @click="$emit('close')"> 关闭 </button>
    </div>

    <div class="sensor-widget-popup__info">
      <div v-for="item in infoRows" :key="item.label" class="sensor-widget-popup__info-row">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </div>
    </div>

    <div v-if="!normalizedWidgets.length" class="sensor-widget-popup__empty"> 暂无部件 </div>

    <SensorPopupWidgetGrid
      v-else
      :widgets="normalizedWidgets"
      :runtime="datasourceRuntime"
      :context="{ host: 'point-detail', readonly: true, entity: sensor, runtimeDevices }"
    />

    <PointDataExportModal
      :visible="exportVisible"
      :sensor="sensor"
      :widgets="normalizedWidgets"
      @close="exportVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
  import { createDatasourceRuntime, type DatasourceRuntime } from '../dashboard/runtime/datasourceRuntime';
  import type { DashboardWidget, LocalWidgetKey, TbWidgetConfig } from '../dashboard/runtime/types';
  import { normalizeWidgetList } from '../dashboard/runtime/widgets/core/widgetInstance';
  import '../dashboard/runtime/widgets/core/widgetSurface.css';
  import PointDataExportModal from './PointDataExportModal.vue';
  import SensorPopupWidgetGrid from './SensorPopupWidgetGrid.vue';
  import type { PopupWidgetConfig } from './sensorPopupWidgetStorage';
  import type { MapTemplateRuntimeDevices } from './services/mapTemplateRuntimeService';

  type WidgetData = DashboardWidget & { type?: LocalWidgetKey; config: TbWidgetConfig };

  type SensorPopupWidgetInput = WidgetData | PopupWidgetConfig | Record<string, any>;

  const props = defineProps<{
    visible: boolean;
    sensor?: any;
    widgets: SensorPopupWidgetInput[];
    exportEnabled?: boolean;
    runtimeDevices?: MapTemplateRuntimeDevices | null;
    runtime?: DatasourceRuntime;
  }>();

  defineEmits<{
    (e: 'close'): void;
  }>();

  const ownedDatasourceRuntime = props.runtime ? null : createDatasourceRuntime();
  const datasourceRuntime = props.runtime || ownedDatasourceRuntime!;
  const exportVisible = ref(false);

  function formatCoordinate(value: unknown) {
    const coordinate = Number(value);
    return Number.isFinite(coordinate) ? coordinate.toFixed(6) : '-';
  }
  function formatHeight(value: unknown) {
    const height = Number(value);
    return Number.isFinite(height) ? `${height.toFixed(2)} m` : '-';
  }
  function getRuntimeDevice(sensor: Record<string, any>) {
    const entityId = String(sensor.entityId || sensor.deviceId || '').trim();
    return entityId ? props.runtimeDevices?.[entityId] || {} : {};
  }

  function toDisplayText(value: unknown) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return toDisplayText(record.value ?? record.data ?? record.rawValue ?? record.name ?? '');
    }
    return String(value).trim();
  }

  function getDisplayDeviceType(sensor: Record<string, any>) {
    const runtimeDevice = getRuntimeDevice(sensor) as Record<string, unknown>;
    return (
      toDisplayText(sensor.deviceType) ||
      toDisplayText(sensor.sensorType) ||
      toDisplayText(runtimeDevice.deviceType) ||
      toDisplayText(runtimeDevice.sensorType) ||
      '未知'
    );
  }

  const infoRows = computed(() => {
    const sensor = props.sensor || {};
    return [
      { label: '设备', value: sensor.entityName || sensor.name || '-' },
      {
        label: '状态',
        value: sensor.statusText || (sensor.online === true ? '在线' : sensor.online === false ? '离线' : '-'),
      },
      { label: '类型', value: getDisplayDeviceType(sensor) },
      { label: '经度', value: formatCoordinate(sensor.longitude) },
      { label: '纬度', value: formatCoordinate(sensor.latitude) },
      { label: '高度', value: formatHeight(sensor.height) },
    ];
  });

  const normalizedWidgets = computed<WidgetData[]>(() => normalizeWidgetList(props.widgets) as WidgetData[]);

  watch(
    () => props.visible,
    (visible) => {
      if (!visible) exportVisible.value = false;
    },
  );

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
    top: calc(var(--map-top-bar-offset, 0px) + 16px);
    z-index: 1600;
    width: min(720px, calc(100% - 32px));
    box-sizing: border-box;
    max-height: calc(100% - var(--map-top-bar-offset, 0px) - 32px);
    overflow: auto;
    padding: 16px;
    border-radius: 12px;
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.16);
  }

  .sensor-widget-popup__header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .sensor-widget-popup__header > div:first-child {
    min-width: 0;
    flex: 1 1 240px;
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

  .sensor-widget-popup__export {
    margin-left: auto;
    border: 1px solid rgba(56, 189, 248, 0.55);
    background: rgba(14, 116, 144, 0.88);
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
    background: rgba(255, 255, 255, 0.03);
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

  @container map-screen (max-width: 640px) {
    .sensor-widget-popup {
      top: calc(var(--map-top-bar-offset, 0px) + 12px);
      right: 12px;
      left: 12px;
      width: auto;
      max-height: calc(100% - var(--map-top-bar-offset, 0px) - 24px);
      padding: 12px;
    }

    .sensor-widget-popup__header {
      flex-wrap: wrap;
      gap: 8px;
    }

    .sensor-widget-popup__header > div:first-child {
      flex-basis: 100%;
    }

    .sensor-widget-popup__export {
      margin-left: 0;
    }

    .sensor-widget-popup__info {
      grid-template-columns: 1fr;
    }
  }
</style>
