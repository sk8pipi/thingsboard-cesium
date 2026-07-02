<template>
  <div v-if="visible && sensor" class="spwe-panel">
    <Teleport to="body">
      <div v-if="widgetLibraryVisible" class="spwe-lib-mask" @click.self="widgetLibraryVisible = false">
        <div class="spwe-lib">
          <div class="spwe-lib-header">
            <div>
              <div class="spwe-lib-title">部件库</div>
              <div class="spwe-lib-sub">选择要添加到传感器点位弹窗里的部件</div>
            </div>
            <button class="spwe-btn" type="button" @click="widgetLibraryVisible = false">关闭</button>
          </div>

          <div class="spwe-lib-grid">
            <button
              v-for="item in popupWidgetLibrary"
              :key="item.key"
              class="spwe-lib-card"
              type="button"
              @click="selectWidgetFromLibrary(item.key)"
            >
              <div class="spwe-lib-preview" :class="`spwe-lib-preview--${item.previewKind}`">
                <i v-for="index in 5" :key="index"></i>
              </div>
              <div class="spwe-lib-card-main">
                <div class="spwe-lib-card-title">{{ item.title }}</div>
                <div class="spwe-lib-card-sub">{{ item.category }}</div>
              </div>
            </button>
          </div>
        </div>
      </div>

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
        removable
        @remove="removeWidget"
      />
      <div v-else class="spwe-empty">当前传感器点位还没有绑定弹窗部件</div>

      <div class="spwe-section-title">添加部件</div>

      <div class="spwe-actions">
        <button class="spwe-add-btn" type="button" aria-label="添加部件" @click="openWidgetLibrary">+</button>
      </div>

      <div class="spwe-footer">
        <button class="spwe-btn" type="button" @click="emit('close')">取消</button>
        <button class="spwe-btn primary" type="button" @click="save">保存点位弹窗</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { getTimeseriesKeys } from '/@/api/tb/telemetry';
  import { createDatasourceRuntime, type DatasourceRuntime } from '../dashboard/runtime/datasourceRuntime';
  import type { DashboardWidget, LocalWidgetKey, TbWidgetConfig } from '../dashboard/runtime/types';
  import {
    createWidgetInstance,
    getWidgetDefinition,
    listWidgetDefinitions,
    normalizeWidgetList,
  } from '../dashboard/runtime/widgets/core/widgetInstance';
  import SensorPopupWidgetGrid from './SensorPopupWidgetGrid.vue';
  import type { PopupWidgetConfig } from './sensorPopupWidgetStorage';
  import type { SensorDatasourceKey } from './types/mapPointTypes';

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
  const widgetLibraryVisible = ref(false);
  const keyDialogVisible = ref(false);
  const selectedWidgetKey = ref<LocalWidgetKey | ''>('');
  const availableKeys = ref<string[]>([]);
  const selectedKeys = ref<string[]>([]);
  const keysLoading = ref(false);
  const keysError = ref('');
  const ownedDatasourceRuntime = props.runtime ? null : createDatasourceRuntime();
  const datasourceRuntime = props.runtime || ownedDatasourceRuntime!;

  const normalizedWidgets = computed<WidgetData[]>(() => normalizeWidgetList(localWidgets.value) as WidgetData[]);

  const popupWidgetLibrary = computed(
    () =>
      listWidgetDefinitions('point-detail')
        .filter((def) => def.key !== 'cesium3d')
        .map((def) => {
          return {
            key: def.key,
            title: def.title,
            category: getCategoryLabel(def.category),
            previewKind: def.previewKind,
          };
        })
        .filter(Boolean) as Array<{ key: LocalWidgetKey; title: string; category: string; previewKind: string }>,
  );

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
      { label: '类型', value: current?.description || current?.entityType || '-' },
      { label: '经度', value: formatCoordinate(current?.longitude) },
      { label: '纬度', value: formatCoordinate(current?.latitude) },
    ];
  });

  const selectedWidgetDef = computed(() => getWidgetDefinition(selectedWidgetKey.value));

  const selectedWidgetTitle = computed(() => selectedWidgetDef.value?.title || '添加部件');

  const keySelectionRequired = computed(() => Boolean(selectedWidgetDef.value?.allowedKeyTypes?.length));

  const currentDeviceId = computed(() => props.sensor?.datasource?.entityId || props.sensor?.entityId || '');

  const currentDeviceName = computed(
    () => props.sensor?.datasource?.entityName || props.sensor?.entityName || props.sensor?.name || '-',
  );

  const currentPollMs = computed(() => props.sensor?.datasource?.pollMs || 2000);

  const canConfirmKeySelection = computed(() => !keySelectionRequired.value || selectedKeys.value.length > 0);

  function getCategoryLabel(category: string) {
    const map: Record<string, string> = {
      timeseries: '时序部件',
      latest: '最新值部件',
      alarm: '告警部件',
      control: '控制部件',
      static: '静态部件',
    };
    return map[category] || '部件';
  }

  function toPopupWidgetConfig(widget: DashboardWidget): PopupWidgetConfig {
    return {
      id: widget.id,
      type: widget.widgetKey,
      widgetKey: widget.widgetKey,
      definitionVersion: widget.definitionVersion,
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
      title: `${payload.deviceName}-${definition?.title || '部件'}`,
      binding: payload,
    });
    if (!widget) throw new Error(`未找到部件定义：${type}`);
    return toPopupWidgetConfig(widget);
  }

  function openWidgetLibrary() {
    widgetLibraryVisible.value = true;
  }

  function selectWidgetFromLibrary(type: LocalWidgetKey) {
    widgetLibraryVisible.value = false;

    const def = getWidgetDefinition(type);
    if (!def) return;

    openKeyDialog(type);
  }

  function buildWidgetWithoutDatasource(type: LocalWidgetKey): PopupWidgetConfig {
    const widget = createWidgetInstance(type, { id: `popup_${type}_${Date.now()}` });
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

  function emitChanged() {
    emit('changed', JSON.parse(JSON.stringify(localWidgets.value)));
  }

  function removeWidget(index: number) {
    localWidgets.value.splice(index, 1);
    emitChanged();
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

  .spwe-add-btn:hover {
    border-color: rgba(56, 189, 248, 0.85);
    background: rgba(56, 189, 248, 0.12);
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

  .spwe-lib-mask {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: stretch;
    justify-content: flex-start;
    background: rgba(0, 0, 0, 0.5);
  }

  .spwe-lib {
    width: min(33.333vw, 520px);
    min-width: 360px;
    height: 100%;
    overflow: auto;
    border-right: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(25, 30, 40, 0.98);
    color: #fff;
    padding: 14px;
  }

  .spwe-lib-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .spwe-lib-title {
    font-size: 15px;
    font-weight: 700;
  }

  .spwe-lib-sub {
    margin-top: 4px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
  }

  .spwe-lib-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .spwe-lib-card {
    display: grid;
    grid-template-columns: 132px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    min-height: 96px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    border-radius: 10px;
    padding: 12px;
    text-align: left;
    cursor: pointer;
  }

  .spwe-lib-card:hover {
    border-color: rgba(56, 189, 248, 0.85);
    background: rgba(56, 189, 248, 0.14);
  }

  .spwe-lib-card-main {
    min-width: 0;
  }

  .spwe-lib-card-title {
    overflow: hidden;
    font-size: 13px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spwe-lib-card-sub {
    margin-top: 6px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
  }

  .spwe-lib-preview {
    position: relative;
    height: 72px;
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(15, 23, 42, 0.7);
  }

  .spwe-lib-preview i {
    position: absolute;
    display: block;
    background: rgba(56, 189, 248, 0.9);
  }

  .spwe-lib-preview--line i {
    width: 34px;
    height: 3px;
    transform-origin: left center;
    border-radius: 999px;
  }

  .spwe-lib-preview--line i:nth-child(1) {
    left: 16px;
    top: 48px;
    transform: rotate(-28deg);
  }

  .spwe-lib-preview--line i:nth-child(2) {
    left: 44px;
    top: 34px;
    transform: rotate(18deg);
  }

  .spwe-lib-preview--line i:nth-child(3) {
    left: 72px;
    top: 42px;
    transform: rotate(-34deg);
  }

  .spwe-lib-preview--line i:nth-child(n + 4) {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #facc15;
  }

  .spwe-lib-preview--line i:nth-child(4) {
    left: 42px;
    top: 31px;
  }

  .spwe-lib-preview--line i:nth-child(5) {
    left: 98px;
    top: 25px;
  }

  .spwe-lib-preview--bar i {
    bottom: 14px;
    width: 14px;
    border-radius: 5px 5px 2px 2px;
  }

  .spwe-lib-preview--bar i:nth-child(1) {
    left: 22px;
    height: 26px;
  }

  .spwe-lib-preview--bar i:nth-child(2) {
    left: 45px;
    height: 40px;
    background: #f59e0b;
  }

  .spwe-lib-preview--bar i:nth-child(3) {
    left: 68px;
    height: 32px;
  }

  .spwe-lib-preview--bar i:nth-child(4) {
    left: 91px;
    height: 48px;
    background: #22c55e;
  }

  .spwe-lib-preview--bar i:nth-child(5) {
    display: none;
  }

  .spwe-lib-preview--scatter i {
    width: 8px;
    height: 8px;
    border-radius: 999px;
  }

  .spwe-lib-preview--scatter i:nth-child(1) {
    left: 22px;
    top: 46px;
  }

  .spwe-lib-preview--scatter i:nth-child(2) {
    left: 44px;
    top: 28px;
    background: #f59e0b;
  }

  .spwe-lib-preview--scatter i:nth-child(3) {
    left: 68px;
    top: 39px;
    background: #22c55e;
  }

  .spwe-lib-preview--scatter i:nth-child(4) {
    left: 92px;
    top: 20px;
  }

  .spwe-lib-preview--scatter i:nth-child(5) {
    left: 106px;
    top: 50px;
    background: #f59e0b;
  }

  .spwe-lib-preview--pie i:nth-child(1) {
    left: 44px;
    top: 15px;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: conic-gradient(#38bdf8 0 38%, #f59e0b 38% 66%, #22c55e 66% 100%);
  }

  .spwe-lib-preview--pie i:nth-child(n + 2),
  .spwe-lib-preview--radar i:nth-child(n + 2),
  .spwe-lib-preview--led i:nth-child(n + 2) {
    display: none;
  }

  .spwe-lib-preview--radar i:nth-child(1) {
    left: 38px;
    top: 13px;
    width: 54px;
    height: 46px;
    background: rgba(56, 189, 248, 0.22);
    clip-path: polygon(50% 0, 96% 35%, 78% 100%, 22% 100%, 4% 35%);
    border: 2px solid rgba(56, 189, 248, 0.8);
  }

  .spwe-lib-preview--led i:nth-child(1) {
    left: 44px;
    top: 14px;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #ffffff 0 8%, #bbf7d0 9% 24%, #22c55e 25% 100%);
    box-shadow: 0 0 18px rgba(34, 197, 94, 0.55);
  }

  .spwe-lib-preview--state i,
  .spwe-lib-preview--range i {
    height: 3px;
    border-radius: 999px;
    transform-origin: left center;
  }

  .spwe-lib-preview--state i:nth-child(1) {
    left: 18px;
    top: 46px;
    width: 24px;
  }

  .spwe-lib-preview--state i:nth-child(2) {
    left: 42px;
    top: 34px;
    width: 22px;
    transform: rotate(-90deg);
    background: #f59e0b;
  }

  .spwe-lib-preview--state i:nth-child(3) {
    left: 42px;
    top: 34px;
    width: 32px;
    background: #f59e0b;
  }

  .spwe-lib-preview--state i:nth-child(4) {
    left: 74px;
    top: 54px;
    width: 20px;
    transform: rotate(90deg);
    background: #22c55e;
  }

  .spwe-lib-preview--state i:nth-child(5) {
    left: 74px;
    top: 54px;
    width: 34px;
    background: #22c55e;
  }

  .spwe-lib-preview--range i:nth-child(1) {
    left: 16px;
    top: 46px;
    width: 92px;
    height: 16px;
    border-radius: 999px;
    background: linear-gradient(90deg, #38bdf8, #22c55e, #f59e0b);
  }

  .spwe-lib-preview--range i:nth-child(n + 2) {
    display: none;
  }

  .spwe-lib-preview--static i:nth-child(1),
  .spwe-lib-preview--card i:nth-child(1),
  .spwe-lib-preview--table i:nth-child(1) {
    left: 18px;
    top: 16px;
    width: 92px;
    height: 40px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.18);
  }

  .spwe-lib-preview--static i:nth-child(2),
  .spwe-lib-preview--card i:nth-child(2) {
    left: 30px;
    top: 28px;
    width: 56px;
    height: 5px;
    border-radius: 999px;
  }

  .spwe-lib-preview--static i:nth-child(3),
  .spwe-lib-preview--card i:nth-child(3) {
    left: 30px;
    top: 40px;
    width: 38px;
    height: 5px;
    border-radius: 999px;
    background: #f59e0b;
  }

  .spwe-lib-preview--static i:nth-child(n + 4),
  .spwe-lib-preview--card i:nth-child(n + 4) {
    display: none;
  }

  .spwe-lib-preview--table i:nth-child(2),
  .spwe-lib-preview--table i:nth-child(3),
  .spwe-lib-preview--table i:nth-child(4) {
    left: 24px;
    width: 80px;
    height: 2px;
    background: rgba(255, 255, 255, 0.45);
  }

  .spwe-lib-preview--table i:nth-child(2) {
    top: 28px;
  }

  .spwe-lib-preview--table i:nth-child(3) {
    top: 40px;
  }

  .spwe-lib-preview--table i:nth-child(4) {
    top: 52px;
  }

  .spwe-lib-preview--table i:nth-child(5) {
    display: none;
  }

  .spwe-lib-preview--switch i:nth-child(1) {
    left: 26px;
    top: 23px;
    width: 74px;
    height: 30px;
    border-radius: 999px;
    background: rgba(34, 197, 94, 0.85);
  }

  .spwe-lib-preview--switch i:nth-child(2) {
    left: 70px;
    top: 27px;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: #fff;
  }

  .spwe-lib-preview--switch i:nth-child(n + 3) {
    display: none;
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

  @media (max-width: 640px) {
    .spwe-lib {
      width: min(88vw, 420px);
      min-width: 0;
    }

    .spwe-lib-grid {
      grid-template-columns: 1fr;
    }

    .spwe-lib-card {
      grid-template-columns: 112px minmax(0, 1fr);
    }
  }
</style>
