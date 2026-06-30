<template>
  <div v-if="visible" class="sd-mask" @click.self="emit('cancel')">
    <div class="sd-card">
      <div class="sd-head">
        <div class="sd-title">{{ titleText }}</div>
        <button class="sd-x" type="button" @click="emit('cancel')">×</button>
      </div>

      <div class="sd-toolbar">
        <input class="sd-input" v-model="kw" placeholder="搜索设备名称" @keydown.enter="reload()" />
        <button class="sd-btn" type="button" @click="reload()">搜索</button>
      </div>

      <div class="sd-body">
        <div class="sd-col">
          <div class="sd-subtitle">设备列表</div>

          <div class="sd-list">
            <button
              v-for="device in devices"
              :key="device.id?.id"
              class="sd-item"
              :class="{
                active: selectedId === device.id?.id,
                bound: isDeviceBound(device.id?.id),
              }"
              type="button"
              :aria-disabled="isDeviceBound(device.id?.id)"
              @click="selectDevice(device)"
            >
              <div class="sd-item-name">{{ device.name }}</div>
              <div class="sd-item-meta">
                <span class="sd-item-sub">{{ device.type || '-' }}</span>
                <span v-if="isDeviceBound(device.id?.id)" class="sd-item-badge">
                  已绑定 {{ deviceBindingsFor(device.id?.id).length }} 个点位
                </span>
              </div>
            </button>
          </div>

          <div class="sd-pager">
            <button
              class="sd-btn"
              type="button"
              :disabled="page <= 0"
              @click="
                page -= 1;
                reload();
              "
              >上一页</button
            >
            <span class="sd-page">第 {{ page + 1 }} 页</span>
            <button
              class="sd-btn"
              type="button"
              :disabled="!hasNext"
              @click="
                page += 1;
                reload();
              "
              >下一页</button
            >
          </div>
        </div>

        <div class="sd-col">
          <div class="sd-subtitle">{{ detailTitleText }}</div>

          <div v-if="!selectedId" class="sd-hint">请先在左侧选择一个 ThingsBoard Device。</div>

          <template v-else-if="selectedBindings.length">
            <div class="sd-bound-warning">该设备已绑定当前模板中的点位，不能再次用于新点位。</div>
            <div class="sd-device-summary">
              <div class="sd-device-row">
                <span class="sd-label">设备名称</span>
                <span class="sd-value">{{ selectedName || '-' }}</span>
              </div>
              <div class="sd-device-row">
                <span class="sd-label">设备 ID</span>
                <span class="sd-value sd-value--mono">{{ selectedId }}</span>
              </div>
              <div class="sd-binding-list">
                <div v-for="binding in selectedBindings" :key="binding.pointId" class="sd-binding-card">
                  <div class="sd-binding-head">
                    <strong>{{ binding.pointName }}</strong>
                    <span>{{ pointTypeText(binding.pointType) }}</span>
                  </div>
                  <div class="sd-device-row">
                    <span class="sd-label">已绑定点位 ID</span>
                    <span class="sd-value sd-value--mono">{{ binding.pointId }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="requireKeys">
            <div v-if="keysLoading" class="sd-hint">正在加载设备可用的 timeseries keys...</div>
            <div v-else-if="keysErr" class="sd-err">{{ keysErr }}</div>
            <div v-else-if="availableKeys.length" class="sd-available">
              <div class="sd-available-title">设备已有 Keys（{{ availableKeys.length }}）</div>
              <div class="sd-available-list">
                <button
                  v-for="key in availableKeys"
                  :key="key"
                  class="sd-available-key"
                  :class="{ active: selectedKeys.includes(key) }"
                  type="button"
                  :aria-pressed="selectedKeys.includes(key)"
                  @click="toggleKey(key)"
                >
                  {{ key }}
                </button>
              </div>
            </div>
            <div v-else class="sd-hint">当前设备暂无可用的 timeseries keys。</div>

            <div class="sd-keybar">
              <input
                class="sd-input"
                v-model="keyInput"
                placeholder="输入 key，例如 temperature"
                @keydown.enter.prevent="addKey()"
              />
              <button class="sd-btn" type="button" :disabled="!keyInput.trim() || keysLoading" @click="addKey()">
                添加
              </button>
              <button class="sd-btn" type="button" :disabled="!selectedKeys.length" @click="clearKeys()"> 清空 </button>
            </div>

            <div v-if="selectedKeys.length" class="sd-picked">
              <div class="sd-picked-title">已选 Keys（{{ selectedKeys.length }}）</div>
              <div class="sd-chips">
                <span v-for="key in selectedKeys" :key="key" class="sd-chip">
                  <span class="sd-chip-text">{{ key }}</span>
                  <button class="sd-chip-x" type="button" @click="removeKey(key)">×</button>
                </span>
              </div>
            </div>
            <div v-else class="sd-hint">请至少添加一个用于地图点位或部件的数据 key。</div>

            <div class="sd-row">
              <span class="sd-label">轮询间隔 (ms)</span>
              <input class="sd-input sd-poll-input" v-model.number="pollMs" type="number" min="500" step="100" />
            </div>

            <div v-if="tip" class="sd-tip">{{ tip }}</div>
          </template>

          <template v-else>
            <div class="sd-device-summary">
              <div class="sd-device-row">
                <span class="sd-label">设备名称</span>
                <span class="sd-value">{{ selectedName || '-' }}</span>
              </div>
              <div class="sd-device-row">
                <span class="sd-label">设备 ID</span>
                <span class="sd-value sd-value--mono">{{ selectedId || '-' }}</span>
              </div>
              <div class="sd-device-row">
                <span class="sd-label">说明</span>
                <span class="sd-value">{{ detailHintText }}</span>
              </div>
            </div>
          </template>
        </div>

        <div v-if="err" class="sd-err sd-err-full">{{ err }}</div>
      </div>

      <div class="sd-foot">
        <button class="sd-btn" type="button" @click="emit('cancel')">取消</button>
        <button class="sd-btn primary" type="button" :disabled="!canOk" @click="onOk">{{ okTextText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { getCustomerDeviceList, getTenantDeviceList, type Device } from '/@/api/tb/device';
  import { getTimeseriesKeys } from '/@/api/tb/telemetry';
  import { useUserStoreWithOut } from '/@/store/modules/user';
  import type { DevicePointBindingInfo, MapPointType } from './types/mapPointTypes';

  const props = withDefaults(
    defineProps<{
      visible: boolean;
      requireKeys?: boolean;
      title?: string;
      okText?: string;
      detailTitle?: string;
      detailHint?: string;
      deviceBindings?: DevicePointBindingInfo[];
    }>(),
    {
      requireKeys: true,
      title: '选择设备',
      okText: '确定',
      detailTitle: '',
      detailHint: '绑定后将仅保存地图点位与 ThingsBoard Device 的关系。',
      deviceBindings: () => [],
    },
  );

  const emit = defineEmits<{
    (e: 'cancel'): void;
    (e: 'ok', payload: { deviceId: string; deviceName: string; keys: string[]; pollMs: number }): void;
  }>();

  const userStore = useUserStoreWithOut();

  const kw = ref('');
  const page = ref(0);
  const pageSize = 20;

  const devices = ref<Device[]>([]);
  const hasNext = ref(false);

  const selectedId = ref('');
  const selectedName = ref('');
  const availableKeys = ref<string[]>([]);
  const keysLoading = ref(false);
  const keysErr = ref('');
  const keyInput = ref('');
  const selectedKeys = ref<string[]>([]);
  const pollMs = ref(2000);
  const err = ref('');
  const tip = ref('');

  const authority = computed(() => String(userStore.getAuthority || 'UNKNOWN'));
  const customerId = computed(() => String(userStore.getPageCacheByKey('customerId', '')));
  const requireKeys = computed(() => props.requireKeys !== false);
  const titleText = computed(() => props.title || '选择设备');
  const okTextText = computed(() => props.okText || '确定');
  const detailTitleText = computed(
    () => props.detailTitle || (requireKeys.value ? '设备已有遥测 Keys' : '设备绑定信息'),
  );
  const detailHintText = computed(() => props.detailHint || '绑定后将仅保存地图点位与 ThingsBoard Device 的关系。');
  const selectedBindings = computed(() => deviceBindingsFor(selectedId.value));
  const canOk = computed(
    () =>
      !!selectedId.value &&
      selectedBindings.value.length === 0 &&
      (!requireKeys.value || selectedKeys.value.length > 0),
  );

  function normalizeDeviceId(value: unknown) {
    return String(value || '').trim();
  }

  function deviceBindingsFor(deviceId: unknown) {
    const normalizedId = normalizeDeviceId(deviceId);
    if (!normalizedId) return [];
    return props.deviceBindings.filter((binding) => normalizeDeviceId(binding.deviceId) === normalizedId);
  }

  function isDeviceBound(deviceId: unknown) {
    return deviceBindingsFor(deviceId).length > 0;
  }

  function pointTypeText(pointType: MapPointType) {
    return pointType === 'camera' ? '监控点位' : '传感器点位';
  }

  function normalizeKey(value: string) {
    return value.trim();
  }

  function setTip(message: string, ms = 1800) {
    tip.value = message;
    if (ms <= 0) return;

    window.setTimeout(() => {
      if (tip.value === message) {
        tip.value = '';
      }
    }, ms);
  }

  function removeKey(key: string) {
    selectedKeys.value = selectedKeys.value.filter((item) => item !== key);
  }

  function toggleKey(key: string) {
    if (selectedKeys.value.includes(key)) {
      removeKey(key);
      return;
    }

    selectedKeys.value = [...selectedKeys.value, key];
  }

  function clearKeys() {
    selectedKeys.value = [];
    setTip('已清空所选 keys');
  }

  function addKey() {
    tip.value = '';
    keysErr.value = '';

    if (!requireKeys.value) {
      keyInput.value = '';
      return;
    }

    const key = normalizeKey(keyInput.value);
    if (!key) return;

    if (/\s/.test(key)) {
      setTip('Key 不能包含空格', 2500);
      return;
    }

    if (keysLoading.value) {
      setTip('正在加载 keys，请稍后再试', 2000);
      return;
    }

    if (!availableKeys.value.length) {
      setTip('当前设备没有可用的 timeseries keys，或 keys 加载失败', 2500);
      return;
    }

    if (!availableKeys.value.includes(key)) {
      setTip(`设备上不存在 key：${key}`, 3000);
      return;
    }

    if (!selectedKeys.value.includes(key)) {
      selectedKeys.value.push(key);
      setTip(`已添加：${key}`);
    } else {
      setTip(`已存在：${key}`);
    }

    keyInput.value = '';
  }

  async function reload() {
    err.value = '';

    try {
      const params: any = {
        pageSize,
        page: page.value,
        textSearch: kw.value.trim(),
        sortProperty: 'createdTime',
        sortOrder: 'DESC',
      };

      const response =
        authority.value === 'CUSTOMER_USER' && customerId.value
          ? await getCustomerDeviceList(params, customerId.value)
          : await getTenantDeviceList(params);

      devices.value = (response as any)?.data || [];
      hasNext.value = !!(response as any)?.hasNext;
    } catch (error: any) {
      err.value = error?.message || String(error);
      devices.value = [];
      hasNext.value = false;
    }
  }

  async function loadAvailableKeys(deviceId: string) {
    keysLoading.value = true;
    keysErr.value = '';
    availableKeys.value = [];

    try {
      const keys = await getTimeseriesKeys({ entityType: 'DEVICE', id: deviceId } as any);
      availableKeys.value = Array.isArray(keys) ? keys : [];
    } catch (error: any) {
      keysErr.value = error?.message || String(error);
      availableKeys.value = [];
    } finally {
      keysLoading.value = false;
    }
  }

  async function selectDevice(device: Device) {
    err.value = '';
    tip.value = '';
    selectedId.value = device.id?.id || '';
    selectedName.value = device.name || '';
    selectedKeys.value = [];
    keyInput.value = '';
    availableKeys.value = [];
    keysErr.value = '';

    if (selectedBindings.value.length) {
      return;
    }

    if (!selectedId.value || !requireKeys.value) {
      return;
    }

    await loadAvailableKeys(selectedId.value);
    if (!availableKeys.value.length && !keysErr.value) {
      setTip('该设备当前没有可用的 timeseries keys', 2500);
    }
  }

  function onOk() {
    err.value = '';
    tip.value = '';

    if (!selectedId.value) return;

    if (selectedBindings.value.length) {
      err.value = '该设备已绑定当前模板中的点位，不能再次绑定。';
      return;
    }

    if (requireKeys.value && !selectedKeys.value.length) {
      setTip('请至少添加一个遥测 key', 2500);
      return;
    }

    emit('ok', {
      deviceId: selectedId.value,
      deviceName: selectedName.value,
      keys: selectedKeys.value.slice(),
      pollMs: Math.max(500, Number(pollMs.value || 2000)),
    });
  }

  watch(
    () => props.visible,
    async (visible) => {
      if (!visible) return;

      page.value = 0;
      kw.value = '';
      devices.value = [];
      hasNext.value = false;
      selectedId.value = '';
      selectedName.value = '';
      availableKeys.value = [];
      keysLoading.value = false;
      keysErr.value = '';
      keyInput.value = '';
      selectedKeys.value = [];
      pollMs.value = 2000;
      err.value = '';
      tip.value = '';

      await reload();
    },
  );
</script>

<style scoped>
  .sd-mask {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
  }

  .sd-card {
    width: min(980px, 92vw);
    height: min(620px, 86vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(25, 30, 40, 0.96);
    color: #fff;
  }

  .sd-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }

  .sd-title {
    font-weight: 700;
  }

  .sd-x {
    border: none;
    background: transparent;
    color: #fff;
    font-size: 20px;
    cursor: pointer;
  }

  .sd-toolbar {
    display: flex;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .sd-body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 12px 14px;
    overflow: auto;
  }

  .sd-col {
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .sd-subtitle {
    margin-bottom: 8px;
    font-weight: 600;
  }

  .sd-list {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sd-item {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    border-radius: 10px;
    padding: 10px;
    text-align: left;
    cursor: pointer;
  }

  .sd-item.active {
    outline: 2px solid rgba(22, 100, 145, 0.9);
  }

  .sd-item.bound {
    border-color: rgba(245, 158, 11, 0.45);
    background: rgba(120, 53, 15, 0.22);
  }

  .sd-item-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
  }

  .sd-item-badge {
    flex: 0 0 auto;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(245, 158, 11, 0.2);
    color: #fcd34d;
    font-size: 11px;
  }

  .sd-item-name {
    font-weight: 600;
  }

  .sd-item-sub,
  .sd-page,
  .sd-hint,
  .sd-tip {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.72);
  }

  .sd-input {
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    border-radius: 10px;
    padding: 8px 10px;
    outline: none;
  }

  .sd-toolbar .sd-input,
  .sd-keybar .sd-input {
    flex: 1;
  }

  .sd-poll-input {
    width: 140px;
  }

  .sd-btn {
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    border-radius: 10px;
    padding: 8px 12px;
    cursor: pointer;
  }

  .sd-btn.primary {
    background: rgba(22, 100, 145, 0.88);
  }

  .sd-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .sd-pager,
  .sd-keybar,
  .sd-row,
  .sd-foot {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sd-pager,
  .sd-foot {
    justify-content: flex-end;
    margin-top: 10px;
  }

  .sd-picked {
    margin-bottom: 12px;
  }

  .sd-available {
    min-height: 0;
    margin-bottom: 12px;
  }

  .sd-available-title {
    margin-bottom: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.78);
  }

  .sd-available-list {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 8px;
    max-height: 180px;
    overflow: auto;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
  }

  .sd-available-key {
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    padding: 3px 9px;
    cursor: pointer;
    font-size: 12px;
    line-height: 18px;
  }

  .sd-available-key.active {
    border-color: rgba(56, 189, 248, 0.85);
    background: rgba(56, 189, 248, 0.22);
  }

  .sd-picked-title {
    margin-bottom: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.78);
  }

  .sd-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .sd-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(22, 100, 145, 0.2);
    border: 1px solid rgba(22, 100, 145, 0.45);
  }

  .sd-chip-text {
    font-size: 12px;
  }

  .sd-chip-x {
    border: none;
    background: transparent;
    color: #fff;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .sd-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.72);
  }

  .sd-bound-warning {
    margin-bottom: 12px;
    padding: 10px 12px;
    border: 1px solid rgba(245, 158, 11, 0.45);
    border-radius: 10px;
    background: rgba(120, 53, 15, 0.28);
    color: #fde68a;
    font-size: 13px;
    line-height: 1.5;
  }

  .sd-device-summary {
    display: grid;
    gap: 12px;
  }

  .sd-binding-list {
    display: grid;
    gap: 10px;
  }

  .sd-binding-card {
    display: grid;
    gap: 10px;
    padding: 10px;
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
  }

  .sd-binding-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .sd-binding-head span {
    color: #fcd34d;
    font-size: 12px;
  }

  .sd-device-row {
    display: grid;
    gap: 6px;
  }

  .sd-value {
    word-break: break-all;
    color: rgba(255, 255, 255, 0.92);
  }

  .sd-value--mono {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 12px;
  }

  .sd-err {
    color: #fca5a5;
    font-size: 12px;
  }

  .sd-err-full {
    grid-column: 1 / -1;
  }

  @media (max-width: 900px) {
    .sd-body {
      grid-template-columns: 1fr;
    }
  }
</style>
