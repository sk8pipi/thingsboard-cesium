<template>
  <div v-if="visible && sensor" class="spwe-panel">
    <SelectDeviceDialog
      :visible="deviceDialogVisible"
      title="选择传感器设备"
      ok-text="添加到弹窗"
      @cancel="deviceDialogVisible = false"
      @ok="onDevicePicked"
    />

    <div class="spwe-header">
      <div>
        <div class="spwe-title">配置传感器弹窗部件</div>
        <div class="spwe-sub">{{ sensor.name }}（{{ sensor.id }}）</div>
      </div>
      <button class="spwe-btn" type="button" @click="emit('close')">关闭</button>
    </div>

    <div class="spwe-body">
      <div class="spwe-section-title">当前已绑定部件</div>

      <div v-if="localWidgets.length" class="spwe-list">
        <div v-for="(item, index) in localWidgets" :key="item.id" class="spwe-item">
          <div class="spwe-item-main">
            <div class="spwe-item-title">{{ item.title }}</div>
            <div class="spwe-item-sub">{{ item.type }}</div>
          </div>
          <button class="spwe-btn danger" type="button" @click="removeWidget(index)">删除</button>
        </div>
      </div>
      <div v-else class="spwe-empty">当前传感器点位还没有绑定弹窗部件</div>

      <div class="spwe-section-title">添加部件</div>

      <div class="spwe-actions">
        <button class="spwe-btn" type="button" @click="addWidget('chart')">添加折线图</button>
        <button class="spwe-btn" type="button" @click="addWidget('bar')">添加柱状图</button>
        <button class="spwe-btn" type="button" @click="addWidget('pie')">添加饼图</button>
      </div>

      <div class="spwe-footer">
        <button class="spwe-btn" type="button" @click="emit('close')">取消</button>
        <button class="spwe-btn primary" type="button" @click="save">保存点位弹窗</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue';
  import SelectDeviceDialog from './SelectDeviceDialog.vue';
  import type { PopupWidgetConfig } from './sensorPopupWidgetStorage';

  type SensorPoint = {
    id: string;
    name: string;
  };

  const props = defineProps<{
    visible: boolean;
    sensor: SensorPoint | null;
    widgets?: PopupWidgetConfig[];
  }>();

  const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'saved', widgets: PopupWidgetConfig[]): void;
  }>();

  const localWidgets = ref<PopupWidgetConfig[]>([]);
  const deviceDialogVisible = ref(false);
  const pendingWidgetType = ref('');

  function buildDefaultWidget(
    type: string,
    payload: { deviceId: string; deviceName: string; keys: string[]; pollMs: number },
  ): PopupWidgetConfig {
    const baseId = `popup_${type}_${Date.now()}`;

    if (type === 'chart') {
      return {
        id: baseId,
        type: 'chart',
        title: `${payload.deviceName}-折线图`,
        config: {
          datasource: {
            entityType: 'DEVICE',
            entityId: payload.deviceId,
            keys: payload.keys,
            pollMs: payload.pollMs,
          },
        },
      };
    }

    if (type === 'bar') {
      return {
        id: baseId,
        type: 'bar',
        title: `${payload.deviceName}-柱状图`,
        config: {
          datasource: {
            entityType: 'DEVICE',
            entityId: payload.deviceId,
            keys: payload.keys,
            pollMs: payload.pollMs,
          },
          tbBar: {
            keys: payload.keys,
          },
        },
      };
    }

    return {
      id: baseId,
      type: 'pie',
      title: `${payload.deviceName}-饼图`,
      config: {
        datasource: {
          entityType: 'DEVICE',
          entityId: payload.deviceId,
          keys: payload.keys,
          pollMs: payload.pollMs,
        },
        tbPie: {
          keys: payload.keys,
        },
      },
    };
  }

  function addWidget(type: string) {
    pendingWidgetType.value = type;
    deviceDialogVisible.value = true;
  }

  function onDevicePicked(payload: { deviceId: string; deviceName: string; keys: string[]; pollMs: number }) {
    deviceDialogVisible.value = false;
    if (!pendingWidgetType.value) return;

    localWidgets.value.push(buildDefaultWidget(pendingWidgetType.value, payload));
    pendingWidgetType.value = '';
  }

  function removeWidget(index: number) {
    localWidgets.value.splice(index, 1);
  }

  function save() {
    emit('saved', JSON.parse(JSON.stringify(localWidgets.value)));
    emit('close');
  }

  watch(
    () => [props.visible, props.sensor?.id, props.widgets],
    () => {
      if (!props.visible || !props.sensor?.id) {
        localWidgets.value = [];
        return;
      }

      localWidgets.value = JSON.parse(JSON.stringify(props.widgets || []));
    },
    { immediate: true, deep: true },
  );
</script>

<style scoped>
  .spwe-panel {
    position: absolute;
    top: 58px;
    right: 12px;
    z-index: 1700;
    width: 360px;
    max-height: calc(100% - 70px);
    overflow: auto;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(25, 30, 40, 0.94);
    color: #fff;
    padding: 12px;
    backdrop-filter: blur(10px);
  }

  .spwe-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .spwe-title {
    font-size: 14px;
    font-weight: 600;
  }

  .spwe-sub {
    font-size: 12px;
    opacity: 0.75;
    margin-top: 4px;
  }

  .spwe-body {
    display: grid;
    gap: 12px;
  }

  .spwe-section-title {
    font-size: 13px;
    font-weight: 600;
  }

  .spwe-list {
    display: grid;
    gap: 8px;
  }

  .spwe-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
  }

  .spwe-item-title {
    font-size: 13px;
    font-weight: 600;
  }

  .spwe-item-sub {
    font-size: 12px;
    opacity: 0.7;
  }

  .spwe-empty {
    padding: 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.72);
    font-size: 12px;
  }

  .spwe-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .spwe-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .spwe-btn {
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
  }

  .spwe-btn.primary {
    background: rgba(22, 100, 145, 0.88);
  }

  .spwe-btn.danger {
    border-color: rgba(248, 113, 113, 0.45);
    color: #fecaca;
  }
</style>
