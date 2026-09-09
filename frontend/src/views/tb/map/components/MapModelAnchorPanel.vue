<template>
  <section class="model-anchor-panel" aria-label="模型点位定位">
    <header><strong>模型点位定位</strong><button type="button" @click="$emit('close')">关闭</button></header>
    <p>先选择点位和模型，再点击模型的不透明表面。黄色标记是待确认安装位置。</p>
    <label
      >点位
      <select :value="pointId" :disabled="picking" @change="$emit('point-change', valueOf($event))">
        <option value="">新增点位（选好位置后绑定设备）</option>
        <option v-for="point in points" :key="point.id" :value="point.id">
          {{ point.type === 'camera' ? '监控' : '传感器' }} · {{ point.name }}{{ point.modelAnchor ? ' · 已绑定' : '' }}
        </option>
      </select>
    </label>
    <label
      >目标模型
      <select :value="modelId" :disabled="picking" @change="$emit('model-change', valueOf($event))">
        <option value="" disabled>请选择模型</option>
        <option v-for="model in models" :key="model.id" :value="model.id" :disabled="model.visible === false">
          {{ model.name }}{{ model.visible === false ? '（已隐藏）' : '' }}
        </option>
      </select>
    </label>
    <p v-if="!models.length" role="status">当前场景没有可用模型，请先配置三维模型。</p>
    <label
      >遮挡方式
      <select :value="occlusion" @change="$emit('occlusion-change', valueOf($event) as MapModelAnchor['occlusion'])">
        <option value="physical">真实遮挡（建筑背后的点位不可见）</option>
        <option value="alwaysVisible">总览可见（图标穿透显示）</option>
      </select>
    </label>
    <div v-if="selectedPoint" class="model-anchor-panel__state">
      当前：{{
        selectedPoint.modelAnchor
          ? '绑定模型 ' + modelName(selectedPoint.modelAnchor.modelId)
          : selectedPoint.positionSource === 'template'
            ? '模板手动位置'
            : '设备/原有位置'
      }}
    </div>
    <p v-if="pending" role="status">
      待确认：{{ pending.longitude.toFixed(6) }}，{{ pending.latitude.toFixed(6) }}， 高度
      {{ pending.height.toFixed(2) }} m
    </p>
    <p v-if="error" class="model-anchor-panel__error" role="alert">{{ error }}</p>
    <div class="model-anchor-panel__actions">
      <button type="button" :disabled="!modelId || picking" @click="$emit('pick')">在模型上选点</button>
      <button v-if="picking" type="button" @click="$emit('cancel-pick')">取消本次定位</button>
      <button type="button" :disabled="!pending" @click="$emit('confirm')">确认位置</button>
      <button v-if="selectedPoint" type="button" :disabled="picking" @click="$emit('locate')">查看当前点位</button>
      <button v-if="selectedPoint?.modelAnchor" type="button" :disabled="picking" @click="$emit('detach')"
        >解除绑定并保留位置</button
      >
      <button
        v-if="selectedPoint && (selectedPoint.modelAnchor || selectedPoint.positionSource)"
        type="button"
        :disabled="picking"
        @click="$emit('device-position')"
        >恢复设备位置</button
      >
      <button v-if="selectedPoint?.modelAnchor" type="button" :disabled="picking" @click="$emit('apply-occlusion')"
        >应用遮挡方式</button
      >
    </div>
    <small>修改先进入草稿，点击页面顶部“保存”后生效。不会改写 ThingsBoard 设备真实坐标。</small>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import type { MapSceneModel } from '../mapTemplateConfig';
  import type { MapModelAnchor, MapPickedLocation, MapPoint } from '../types/mapPointTypes';
  const props = defineProps<{
    points: MapPoint[];
    models: MapSceneModel[];
    pointId: string;
    modelId: string;
    occlusion: MapModelAnchor['occlusion'];
    picking: boolean;
    pending: MapPickedLocation | null;
    error: string;
  }>();
  defineEmits<{
    (e: 'point-change' | 'model-change', value: string): void;
    (e: 'occlusion-change', value: MapModelAnchor['occlusion']): void;
    (
      e: 'close' | 'pick' | 'cancel-pick' | 'confirm' | 'detach' | 'device-position' | 'locate' | 'apply-occlusion',
    ): void;
  }>();
  const selectedPoint = computed(() => props.points.find((point) => point.id === props.pointId));
  const valueOf = (event: Event) => (event.target as HTMLSelectElement).value;
  const modelName = (id: string) => props.models.find((model) => model.id === id)?.name || '（模型不存在）';
</script>

<style scoped>
  .model-anchor-panel {
    position: absolute;
    z-index: 45;
    top: calc(var(--map-top-bar-offset, 56px) + 12px);
    right: 12px;
    width: min(370px, calc(100% - 24px));
    max-height: calc(100% - var(--map-top-bar-offset, 56px) - 24px);
    overflow: auto;
    padding: 16px;
    color: #e2e8f0;
    background: #102030f5;
    border: 1px solid #4c718c;
    border-radius: 10px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  p,
  small {
    font-size: 12px;
    line-height: 1.6;
  }
  label {
    display: grid;
    gap: 6px;
    margin: 12px 0;
  }
  select {
    width: 100%;
    min-width: 0;
    padding: 7px;
    color: #e2e8f0;
    background: #173247;
    border: 1px solid #52718a;
  }
  button {
    padding: 6px 10px;
    border: 1px solid #52718a;
    border-radius: 5px;
    background: #244964;
    color: white;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .model-anchor-panel__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 12px 0;
  }
  .model-anchor-panel__error {
    color: #fca5a5;
  }
  .model-anchor-panel__state {
    font-size: 12px;
    color: #7dd3fc;
  }
</style>
