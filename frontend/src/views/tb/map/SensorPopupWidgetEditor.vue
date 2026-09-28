<template>
  <div v-if="visible && sensor" class="spwe-panel tb-widget-surface">
    <Teleport :to="overlayTarget">
      <div v-if="keyDialogVisible" class="spwe-key-mask" @click.self="closeKeyDialog">
        <div class="spwe-key-dialog">
          <div class="spwe-key-header">
            <div>
              <div class="spwe-key-title">{{ selectedWidgetTitle }}</div>
              <div class="spwe-key-sub">
                {{ keySelectionRequired ? '选择当前设备已有的 key' : '该部件不需要选择 key' }}
              </div>
            </div>
            <button class="spwe-btn" type="button" @click="closeKeyDialog">关闭</button>
          </div>

          <div class="spwe-key-device">
            <span>当前设备</span>
            <strong>{{ currentDeviceName }}</strong>
          </div>

          <template v-if="keySelectionRequired">
            <div v-if="keysLoading" class="spwe-empty">正在加载设备已有 keys...</div>
            <div v-else-if="keysError" class="spwe-key-error">{{ keysError }}</div>
            <div v-else-if="availableKeys.length" class="spwe-key-list">
              <button
                v-for="key in availableKeys"
                :key="key"
                class="spwe-key-chip"
                :class="{ active: selectedKeys.includes(key) }"
                type="button"
                @click="toggleKey(key)"
              >
                {{ key }}
              </button>
            </div>
            <div v-else class="spwe-empty">当前设备暂无可用 timeseries keys</div>
          </template>

          <div v-else class="spwe-empty">报警、静态等部件不需要绑定 telemetry key，可直接添加。</div>

          <div class="spwe-key-footer">
            <button class="spwe-btn" type="button" @click="closeKeyDialog">取消</button>
            <button
              class="spwe-btn primary"
              type="button"
              :disabled="!canConfirmKeySelection"
              @click="confirmAddWidget"
            >
              添加部件
            </button>
          </div>
        </div>
      </div>
    </Teleport>
    <MapWidgetLibrary
      :visible="widgetLibraryVisible && visible && Boolean(currentDeviceId)"
      host="point-detail"
      overlay
      :native-selection-paused="Boolean(nativeEditSource)"
      @close="widgetLibraryVisible = false"
      @select-native="nativeEditSource = $event"
      @select-builtin="selectWidgetFromLibrary"
      @select-imported="selectImportedWidget"
    />

    <div class="spwe-header">
      <div>
        <div class="spwe-title">配置传感器弹窗部件</div>
        <div class="spwe-sub">{{ sensor.name }}（{{ sensor.id }}）</div>
      </div>
      <button class="spwe-btn" type="button" @click="emit('close')">关闭</button>
    </div>

    <div class="spwe-body">
      <div class="spwe-info">
        <div v-for="item in infoRows" :key="item.label" class="spwe-info-row">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </div>

      <div class="spwe-section-title">当前已绑定部件</div>

      <SensorPopupWidgetGrid
        v-if="normalizedWidgets.length"
        :widgets="normalizedWidgets"
        :runtime="datasourceRuntime"
        :context="{ host: 'point-detail', readonly: true, entity: sensor }"
        removable
        editable
        @edit="editNativeWidget"
        @remove="removeWidget"
      />
      <div v-else class="spwe-empty">当前传感器点位还没有绑定弹窗部件</div>

      <div class="spwe-section-title">添加部件</div>

      <div class="spwe-actions">
        <button
          class="spwe-add-btn"
          type="button"
          aria-label="添加部件"
          :disabled="!currentDeviceId"
          @click="openWidgetLibrary"
          >+</button
        >
      </div>

      <div class="spwe-footer">
        <button class="spwe-btn" type="button" @click="emit('close')">取消</button>
        <button class="spwe-btn primary" type="button" @click="save">保存点位弹窗</button>
      </div>
    </div>
  </div>
  <NativeWidgetComposer
    v-if="visible && nativeEditSource && currentDeviceId"
    :visible="true"
    :source="nativeEditSource"
    :locked-entity="{ entityId: currentDeviceId, name: currentDeviceName }"
    @close="nativeEditSource = null"
    @confirm="applyNativeWidget"
  />
</template>

<script setup lang="ts">
  import MapWidgetLibrary from './components/MapWidgetLibrary.vue';
  import NativeWidgetComposer from '../dashboard/runtime/native/NativeWidgetComposer.vue';
  import { getNativeWidgetSupport } from '../dashboard/runtime/native/nativeWidgetCatalog';
  import { useNativeOverlayTarget } from '../dashboard/runtime/native/useNativeOverlayTarget';
  import { profileLabel } from './services/deviceProfilePresentation';
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { getTimeseriesKeys } from '/@/api/tb/telemetry';
  import { createDatasourceRuntime, type DatasourceRuntime } from '../dashboard/runtime/datasourceRuntime';
  import type { DashboardWidget, LocalWidgetKey, TbWidgetConfig } from '../dashboard/runtime/types';
  import {
    createWidgetInstance,
    getWidgetDefinition,
    normalizeWidgetList,
    resolveWidgetDefinitionKey,
  } from '../dashboard/runtime/widgets/core/widgetInstance';
  import '../dashboard/runtime/widgets/core/widgetSurface.css';
  import SensorPopupWidgetGrid from './SensorPopupWidgetGrid.vue';
  import type { PopupWidgetConfig } from './sensorPopupWidgetStorage';
  import type { SensorDatasourceKey } from './types/mapPointTypes';
  import type { CustomWidgetDefinition } from './widgetLibrary/types';

  const overlayTarget = useNativeOverlayTarget();

  type SensorPoint = {
    id: string;
    name: string;
    entityName?: string;
    entityType?: string;
    deviceName?: string;
    deviceId?: string;
    online?: boolean;
    statusText?: string;
    description?: string;
    longitude?: number;
    latitude?: number;
    entityId?: string;
    datasource?: {
      entityType?: string;
      entityId?: string;
      entityName?: string;
      keys?: Array<SensorDatasourceKey | string>;
      pollMs?: number;
    };
  };

  type WidgetData = DashboardWidget & {
    type?: LocalWidgetKey;
    config: TbWidgetConfig;
  };

  const props = defineProps<{
    visible: boolean;
    sensor: SensorPoint | null;
    widgets?: PopupWidgetConfig[];
    runtime?: DatasourceRuntime;
  }>();

  const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'saved', widgets: PopupWidgetConfig[]): void;
    (e: 'changed', widgets: PopupWidgetConfig[]): void;
  }>();

  const localWidgets = ref<PopupWidgetConfig[]>([]);
  const nativeEditSource = ref<Record<string, any> | null>(null);
  function editNativeWidget(id: string) {
    nativeEditSource.value = normalizedWidgets.value.find((widget) => widget.id === id) || null;
  }
  function applyNativeWidget(widget: DashboardWidget) {
    const index = localWidgets.value.findIndex((item) => item.id === widget.id);
    if (index < 0) localWidgets.value.push(toPopupWidgetConfig(widget));
    else localWidgets.value[index] = toPopupWidgetConfig(widget);
    widgetLibraryVisible.value = false;
    nativeEditSource.value = null;
  }
  const widgetLibraryVisible = ref(false);
  const keyDialogVisible = ref(false);
  const selectedWidgetKey = ref<LocalWidgetKey | ''>('');
  const importedConfig = ref<Record<string, any> | null>(null);
  const importedTitle = ref('');
  const availableKeys = ref<string[]>([]);
  const selectedKeys = ref<string[]>([]);
  const keysLoading = ref(false);
  const keysError = ref('');
  const ownedDatasourceRuntime = props.runtime ? null : createDatasourceRuntime();
  const datasourceRuntime = props.runtime || ownedDatasourceRuntime!;

  const normalizedWidgets = computed<WidgetData[]>(() => normalizeWidgetList(localWidgets.value) as WidgetData[]);

  function formatCoordinate(value: unknown) {
    const coordinate = Number(value);
    return Number.isFinite(coordinate) ? coordinate.toFixed(6) : '-';
  }

  const infoRows = computed(() => {
    const current = props.sensor;
    return [
      { label: '设备', value: current?.entityName || current?.name || '-' },
      {
        label: '状态',
        value: current?.statusText || (current?.online === true ? '在线' : current?.online === false ? '离线' : '-'),
      },
      { label: '类型（设备配置）', value: profileLabel(current) },
      { label: '经度', value: formatCoordinate(current?.longitude) },
      { label: '纬度', value: formatCoordinate(current?.latitude) },
    ];
  });

  const selectedWidgetDef = computed(() => getWidgetDefinition(selectedWidgetKey.value));

  const selectedWidgetTitle = computed(() => importedTitle.value || selectedWidgetDef.value?.title || '添加部件');

  const keySelectionRequired = computed(() => Boolean(selectedWidgetDef.value?.allowedKeyTypes?.length));

  const currentDeviceId = computed(() => props.sensor?.datasource?.entityId || props.sensor?.entityId || '');

  const currentDeviceName = computed(
    () => props.sensor?.datasource?.entityName || props.sensor?.entityName || props.sensor?.name || '-',
  );

  const currentPollMs = computed(() => props.sensor?.datasource?.pollMs || 2000);

  const canConfirmKeySelection = computed(() => !keySelectionRequired.value || selectedKeys.value.length > 0);

  function toPopupWidgetConfig(widget: DashboardWidget): PopupWidgetConfig {
    return {
      id: widget.id,
      type: widget.widgetKey,
      widgetKey: widget.widgetKey,
      definitionVersion: widget.definitionVersion,
      typeFullFqn: widget.typeFullFqn,
      title: widget.title,
      config: widget.config,
      appearance: widget.appearance,
    };
  }

  function buildDefaultWidget(
    type: LocalWidgetKey,
    payload: { deviceId: string; deviceName: string; keys: string[]; pollMs: number },
  ): PopupWidgetConfig {
    const definition = getWidgetDefinition(type);
    const widget = createWidgetInstance(type, {
      id: `popup_${type}_${Date.now()}`,
      title: importedTitle.value || `${payload.deviceName}-${definition?.title || '部件'}`,
      config: importedConfig.value || undefined,
      binding: payload,
    });
    if (!widget) throw new Error(`未找到部件定义：${type}`);
    return toPopupWidgetConfig(widget);
  }

  function openWidgetLibrary() {
    if (!currentDeviceId.value) return;
    widgetLibraryVisible.value = true;
  }

  function selectWidgetFromLibrary(type: LocalWidgetKey) {
    const def = getWidgetDefinition(type);
    if (!def?.hosts.includes('point-detail') || !currentDeviceId.value) return;

    widgetLibraryVisible.value = false;
    importedConfig.value = null;
    importedTitle.value = '';
    void openKeyDialog(type);
  }

  function selectImportedWidget(def: CustomWidgetDefinition) {
    if (!currentDeviceId.value) return;
    if (def.raw && (def.raw.descriptor || def.defaultConfig?.native || def.kind === 'unknown')) {
      const support = getNativeWidgetSupport(def.raw);
      if (!support.supported || !getWidgetDefinition(support.localWidgetKey)?.hosts.includes('point-detail')) return;
      nativeEditSource.value = def.raw.config?.native ? { ...def.raw, id: `native-${Date.now()}` } : def.raw;
      return;
    }
    const key = resolveWidgetDefinitionKey({
      localWidgetKey: def.localWidgetKey,
      typeFullFqn: def.typeFullFqn,
      kind: def.kind,
    });
    if (!getWidgetDefinition(key)?.hosts.includes('point-detail')) return;
    const config = JSON.parse(JSON.stringify(def.defaultConfig || {}));
    delete config.datasource;
    delete config.datasources;
    importedConfig.value = config;
    importedTitle.value = def.name;
    widgetLibraryVisible.value = false;
    void openKeyDialog(key);
  }

  function buildWidgetWithoutDatasource(type: LocalWidgetKey): PopupWidgetConfig {
    const definition = getWidgetDefinition(type);
    const widget = createWidgetInstance(type, {
      id: `popup_${type}_${Date.now()}`,
      title: importedTitle.value || definition?.title,
      config: importedConfig.value || undefined,
      binding:
        definition?.category === 'static'
          ? undefined
          : {
              deviceId: currentDeviceId.value,
              deviceName: currentDeviceName.value,
              keys: [],
              pollMs: currentPollMs.value,
            },
    });
    if (!widget) throw new Error(`未找到部件定义：${type}`);
    return toPopupWidgetConfig(widget);
  }

  async function openKeyDialog(type: LocalWidgetKey) {
    selectedWidgetKey.value = type;
    selectedKeys.value = [];
    keysError.value = '';
    availableKeys.value = getPointSeedKeys();
    keyDialogVisible.value = true;

    if (!getWidgetDefinition(type)?.allowedKeyTypes?.length) {
      return;
    }

    await loadAvailableKeys();
  }

  function closeKeyDialog() {
    keyDialogVisible.value = false;
    selectedWidgetKey.value = '';
    selectedKeys.value = [];
    keysError.value = '';
    importedConfig.value = null;
    importedTitle.value = '';
  }

  function getPointSeedKeys() {
    const keys = props.sensor?.datasource?.keys || [];
    return keys
      .map((item) => (typeof item === 'string' ? item : item?.name))
      .filter((key): key is string => Boolean(key));
  }

  async function loadAvailableKeys() {
    keysLoading.value = true;
    keysError.value = '';

    const seedKeys = getPointSeedKeys();

    try {
      if (!currentDeviceId.value) {
        availableKeys.value = seedKeys;
        keysError.value = '当前点位未绑定设备，无法加载 keys';
        return;
      }

      const loaded = await getTimeseriesKeys({ entityType: 'DEVICE', id: currentDeviceId.value } as any);
      availableKeys.value = Array.from(new Set([...seedKeys, ...(Array.isArray(loaded) ? loaded : [])]));
    } catch (error: any) {
      availableKeys.value = seedKeys;
      keysError.value = error?.message || String(error);
    } finally {
      keysLoading.value = false;
    }
  }

  function toggleKey(key: string) {
    if (selectedKeys.value.includes(key)) {
      selectedKeys.value = selectedKeys.value.filter((item) => item !== key);
      return;
    }

    selectedKeys.value = [...selectedKeys.value, key];
  }

  function confirmAddWidget() {
    if (!selectedWidgetKey.value || !canConfirmKeySelection.value) return;

    if (!keySelectionRequired.value) {
      localWidgets.value.push(buildWidgetWithoutDatasource(selectedWidgetKey.value));
      closeKeyDialog();
      return;
    }

    localWidgets.value.push(
      buildDefaultWidget(selectedWidgetKey.value, {
        deviceId: currentDeviceId.value,
        deviceName: currentDeviceName.value,
        keys: selectedKeys.value,
        pollMs: currentPollMs.value,
      }),
    );
    closeKeyDialog();
  }

  function removeWidget(id: string) {
    const index = localWidgets.value.findIndex((widget) => widget.id === id);
    if (index >= 0) localWidgets.value.splice(index, 1);
  }

  function save() {
    emit('saved', JSON.parse(JSON.stringify(localWidgets.value)));
    emit('close');
  }

  // 父级会随设备实时状态重建展示对象；仅切换点位或开关编辑器时重置草稿。
  watch(
    [() => props.visible, () => props.sensor?.id],
    () => {
      widgetLibraryVisible.value = false;
      keyDialogVisible.value = false;
      importedConfig.value = null;
      importedTitle.value = '';
      nativeEditSource.value = null;
      if (!props.visible || !props.sensor?.id) {
        localWidgets.value = [];
        return;
      }

      localWidgets.value = JSON.parse(JSON.stringify(props.widgets || []));
    },
    { immediate: true },
  );

  onMounted(() => {
    datasourceRuntime.connect();
  });

  onBeforeUnmount(() => {
    ownedDatasourceRuntime?.close();
  });
</script>

<style scoped>
  .spwe-panel {
    position: absolute;
    top: 58px;
    right: 12px;
    z-index: 1700;
    width: min(720px, calc(100% - 24px));
    max-height: calc(100% - 70px);
    overflow: auto;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #fff;
    padding: 12px;
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

  .spwe-info {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .spwe-info-row {
    min-width: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
  }

  .spwe-info-row span {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    opacity: 0.68;
  }

  .spwe-info-row strong {
    display: block;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .spwe-add-btn {
    width: 100%;
    min-height: 74px;
    border: 1px dashed rgba(255, 255, 255, 0.42);
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    border-radius: 10px;
    cursor: pointer;
    font-size: 30px;
    font-weight: 300;
    line-height: 1;
  }

  .spwe-add-btn:hover:not(:disabled) {
    border-color: rgba(56, 189, 248, 0.85);
    background: rgba(56, 189, 248, 0.12);
  }

  .spwe-add-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
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

  .spwe-key-mask {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
  }

  .spwe-key-dialog {
    width: min(620px, 92vw);
    max-height: min(580px, 86vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(25, 30, 40, 0.98);
    color: #fff;
  }

  .spwe-key-header,
  .spwe-key-footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .spwe-key-footer {
    justify-content: flex-end;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    border-bottom: none;
  }

  .spwe-key-title {
    font-size: 15px;
    font-weight: 700;
  }

  .spwe-key-sub {
    margin-top: 4px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
  }

  .spwe-key-device {
    margin: 14px 14px 0;
    padding: 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
  }

  .spwe-key-device span {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
  }

  .spwe-key-device strong {
    display: block;
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spwe-key-list {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    align-content: flex-start;
    gap: 8px;
    min-height: 120px;
    overflow: auto;
    padding: 14px;
  }

  .spwe-key-chip {
    box-sizing: border-box;
    min-width: 0;
    min-height: 0 !important;
    height: auto !important;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    border-radius: 999px;
    padding: 1px 8px !important;
    cursor: pointer;
    font-size: 12px;
    line-height: 16px;
  }

  .spwe-key-chip.active {
    border-color: rgba(56, 189, 248, 0.85);
    background: rgba(56, 189, 248, 0.22);
  }

  .spwe-key-error {
    margin: 14px;
    border-radius: 8px;
    background: rgba(220, 38, 38, 0.18);
    color: #fecaca;
    padding: 12px;
    font-size: 12px;
  }

  .spwe-key-dialog > .spwe-empty {
    margin: 14px;
  }

  .spwe-key-footer .spwe-btn:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }
</style>
