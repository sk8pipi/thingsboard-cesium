<template>
  <div v-if="visible" class="akcd-mask" @click.self="emit('cancel')">
    <div class="akcd-card">
      <div class="akcd-head">
        <div>
          <strong>{{ text.dialogTitle }}</strong>
          <span>{{ text.dialogSubtitle }}</span>
        </div>
        <button class="akcd-icon-btn" type="button" @click="emit('cancel')">x</button>
      </div>

      <div class="akcd-title-row">
        <label>
          <span>{{ text.widgetTitle }}</span>
          <input v-model.trim="title" :placeholder="text.titlePlaceholder" />
        </label>
        <label>
          <span>{{ text.timeRange }}</span>
          <select v-model="timeRange">
            <option v-for="item in timeRangeOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>
      </div>

      <div class="akcd-body">
        <section class="akcd-panel">
          <div class="akcd-toolbar">
            <input v-model.trim="keyword" :placeholder="text.searchPlaceholder" @keydown.enter="reloadDevices" />
            <button type="button" :disabled="devicesLoading" @click="reloadDevices">{{ text.search }}</button>
          </div>

          <div class="akcd-list">
            <button
              v-for="device in devices"
              :key="device.id?.id"
              class="akcd-device"
              :class="{ active: isSelected(device.id?.id) }"
              type="button"
              @click="toggleDevice(device)"
            >
              <span>{{ device.name }}</span>
              <small>{{ device.type || '-' }}</small>
            </button>
            <div v-if="!devices.length && !devicesLoading" class="akcd-empty">{{ text.noDevices }}</div>
            <div v-if="devicesLoading" class="akcd-empty">{{ text.loadingDevices }}</div>
          </div>

          <div class="akcd-pager">
            <button type="button" :disabled="page <= 0 || devicesLoading" @click="previousPage">
              {{ text.previousPage }}
            </button>
            <span>{{ text.pagePrefix }} {{ page + 1 }} {{ text.pageSuffix }}</span>
            <button type="button" :disabled="!hasNext || devicesLoading" @click="nextPage">
              {{ text.nextPage }}
            </button>
          </div>
        </section>

        <section class="akcd-panel">
          <div class="akcd-section-title">
            <strong>{{ text.selectedDevices }} {{ selectedDevices.length }}</strong>
            <button type="button" :disabled="!selectedDevices.length" @click="clearDevices">{{ text.clear }}</button>
          </div>

          <div class="akcd-chips">
            <span v-for="device in selectedDevices" :key="device.id" class="akcd-chip">
              {{ device.name }}
              <button type="button" @click="removeDevice(device.id)">x</button>
            </span>
            <div v-if="!selectedDevices.length" class="akcd-empty">{{ text.pickDeviceHint }}</div>
          </div>

          <div class="akcd-section-title">
            <strong>{{ text.availableKeys }} {{ availableKeys.length }}</strong>
            <button type="button" :disabled="keysLoading || !selectedDevices.length" @click="reloadKeys">
              {{ text.refreshKeys }}
            </button>
          </div>

          <div class="akcd-key-list">
            <button
              v-for="key in availableKeys"
              :key="key"
              class="akcd-key"
              :class="{ active: selectedKeys.includes(key) }"
              type="button"
              @click="toggleKey(key)"
            >
              {{ key }}
            </button>
            <div v-if="keysLoading" class="akcd-empty">{{ text.loadingKeys }}</div>
            <div v-else-if="!availableKeys.length" class="akcd-empty">{{ text.pickDeviceForKeys }}</div>
          </div>

          <div v-if="selectedKeys.length" class="akcd-selected-keys">
            <span>{{ text.selectedKeys }}</span>
            <strong>{{ selectedKeys.join(', ') }}</strong>
          </div>
        </section>
      </div>

      <div v-if="error" class="akcd-error">{{ error }}</div>

      <div class="akcd-foot">
        <button type="button" @click="emit('cancel')">{{ text.cancel }}</button>
        <button type="button" class="primary" :disabled="!canConfirm" @click="confirm">{{ text.addWidget }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { getCustomerDeviceList, getTenantDeviceList, type Device } from '/@/api/tb/device';
  import { getTimeseriesKeys } from '/@/api/tb/telemetry';
  import { EntityType } from '/@/enums/entityTypeEnum';
  import { useUserStoreWithOut } from '/@/store/modules/user';

  type SelectedDevice = { id: string; name: string };
  type TimeRangeValue = 'today' | 'currentHour' | 'month' | 'last24h' | 'last7d';

  const props = withDefaults(
    defineProps<{
      visible: boolean;
      defaultTitle?: string;
    }>(),
    { defaultTitle: '' },
  );

  const emit = defineEmits<{
    (e: 'cancel'): void;
    (e: 'ok', payload: { title: string; devices: SelectedDevice[]; keys: string[]; timeRange: TimeRangeValue }): void;
  }>();

  const text = {
    dialogTitle: '\u914d\u7f6e\u533a\u57df key \u5bf9\u6bd4\u67f1\u72b6\u56fe',
    dialogSubtitle: '\u9009\u62e9\u8981\u53c2\u4e0e\u7edf\u8ba1\u7684\u8bbe\u5907\u548c key',
    widgetTitle: '\u90e8\u4ef6\u6807\u9898',
    titlePlaceholder: '\u4f8b\u5982\uff1a\u77f3\u6cb9\u79d1\u6280\u5927\u697c\u6c34\u7535\u7528\u91cf\u5bf9\u6bd4',
    timeRange: '\u7edf\u8ba1\u8303\u56f4',
    searchPlaceholder: '\u641c\u7d22\u8bbe\u5907\u540d\u79f0',
    search: '\u641c\u7d22',
    noDevices: '\u6682\u65e0\u8bbe\u5907',
    loadingDevices: '\u6b63\u5728\u52a0\u8f7d\u8bbe\u5907...',
    previousPage: '\u4e0a\u4e00\u9875',
    nextPage: '\u4e0b\u4e00\u9875',
    pagePrefix: '\u7b2c',
    pageSuffix: '\u9875',
    selectedDevices: '\u5df2\u9009\u8bbe\u5907',
    clear: '\u6e05\u7a7a',
    pickDeviceHint: '\u8bf7\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u8bbe\u5907',
    availableKeys: '\u53ef\u7528 keys',
    refreshKeys: '\u5237\u65b0 keys',
    loadingKeys: '\u6b63\u5728\u8bfb\u53d6\u6240\u9009\u8bbe\u5907 keys...',
    pickDeviceForKeys: '\u9009\u62e9\u8bbe\u5907\u540e\u8bfb\u53d6 keys',
    selectedKeys: '\u5df2\u9009 key\uff1a',
    cancel: '\u53d6\u6d88',
    addWidget: '\u6dfb\u52a0\u90e8\u4ef6',
    loadDeviceFailed: '\u8bbe\u5907\u5217\u8868\u52a0\u8f7d\u5931\u8d25',
    loadKeysFailed:
      '\u90e8\u5206\u8bbe\u5907 key \u8bfb\u53d6\u5931\u8d25\uff0c\u5df2\u663e\u793a\u53ef\u7528\u7ed3\u679c',
  };

  const timeRangeOptions: Array<{ label: string; value: TimeRangeValue }> = [
    { value: 'today', label: '\u4eca\u65e5' },
    { value: 'currentHour', label: '\u5f53\u524d\u5c0f\u65f6' },
    { value: 'month', label: '\u672c\u6708\u7d2f\u8ba1' },
    { value: 'last24h', label: '\u6700\u8fd1 24 \u5c0f\u65f6' },
    { value: 'last7d', label: '\u6700\u8fd1 7 \u5929' },
  ];

  const userStore = useUserStoreWithOut();
  const keyword = ref('');
  const page = ref(0);
  const pageSize = 20;
  const devices = ref<Device[]>([]);
  const selectedDevices = ref<SelectedDevice[]>([]);
  const availableKeys = ref<string[]>([]);
  const selectedKeys = ref<string[]>([]);
  const title = ref('');
  const timeRange = ref<TimeRangeValue>('today');
  const hasNext = ref(false);
  const devicesLoading = ref(false);
  const keysLoading = ref(false);
  const error = ref('');

  const authority = computed(() => String(userStore.getAuthority || 'UNKNOWN'));
  const customerId = computed(() => String(userStore.getPageCacheByKey('customerId', '')));
  const canConfirm = computed(
    () => !!title.value.trim() && selectedDevices.value.length > 0 && selectedKeys.value.length > 0,
  );

  function normalizeDeviceId(value: unknown) {
    return String(value || '').trim();
  }

  function isSelected(deviceId: unknown) {
    const id = normalizeDeviceId(deviceId);
    return !!id && selectedDevices.value.some((device) => device.id === id);
  }

  function toSelectedDevice(device: Device): SelectedDevice | null {
    const id = normalizeDeviceId(device.id?.id);
    if (!id) return null;
    return { id, name: device.name || id };
  }

  function removeDevice(deviceId: string) {
    selectedDevices.value = selectedDevices.value.filter((device) => device.id !== deviceId);
    void reloadKeys();
  }

  function clearDevices() {
    selectedDevices.value = [];
    availableKeys.value = [];
    selectedKeys.value = [];
  }

  function toggleDevice(device: Device) {
    const item = toSelectedDevice(device);
    if (!item) return;
    if (isSelected(item.id)) {
      removeDevice(item.id);
      return;
    }
    selectedDevices.value = [...selectedDevices.value, item];
    void reloadKeys();
  }

  function toggleKey(key: string) {
    if (selectedKeys.value.includes(key)) {
      selectedKeys.value = selectedKeys.value.filter((item) => item !== key);
      return;
    }
    selectedKeys.value = [...selectedKeys.value, key];
  }

  async function reloadDevices() {
    devicesLoading.value = true;
    error.value = '';
    try {
      const params = {
        page: page.value,
        pageSize,
        sortProperty: 'name',
        sortOrder: 'ASC' as const,
        textSearch: keyword.value.trim() || undefined,
      };
      const result =
        authority.value === 'CUSTOMER_USER' && customerId.value
          ? await getCustomerDeviceList(params, customerId.value)
          : await getTenantDeviceList(params);
      devices.value = result.data || [];
      hasNext.value = !!result.hasNext;
    } catch (err) {
      devices.value = [];
      hasNext.value = false;
      error.value = text.loadDeviceFailed;
    } finally {
      devicesLoading.value = false;
    }
  }

  async function reloadKeys() {
    const ids = selectedDevices.value.map((device) => device.id).filter(Boolean);
    if (!ids.length) {
      availableKeys.value = [];
      selectedKeys.value = [];
      return;
    }

    keysLoading.value = true;
    const results = await Promise.allSettled(
      ids.map((id) => getTimeseriesKeys({ entityType: EntityType.DEVICE, id } as EntityId<EntityType.DEVICE>)),
    );
    const keys = new Set<string>();
    let failed = false;
    results.forEach((result) => {
      if (result.status !== 'fulfilled') {
        failed = true;
        return;
      }
      (result.value || []).forEach((key) => {
        const normalized = String(key || '').trim();
        if (normalized) keys.add(normalized);
      });
    });
    availableKeys.value = Array.from(keys).sort((a, b) => a.localeCompare(b));
    selectedKeys.value = selectedKeys.value.filter((key) => keys.has(key));
    if (failed && availableKeys.value.length) error.value = text.loadKeysFailed;
    keysLoading.value = false;
  }

  function previousPage() {
    if (page.value <= 0 || devicesLoading.value) return;
    page.value -= 1;
    void reloadDevices();
  }

  function nextPage() {
    if (!hasNext.value || devicesLoading.value) return;
    page.value += 1;
    void reloadDevices();
  }

  function confirm() {
    if (!canConfirm.value) return;
    emit('ok', {
      title: title.value.trim(),
      devices: selectedDevices.value,
      keys: selectedKeys.value,
      timeRange: timeRange.value,
    });
  }

  watch(
    () => props.visible,
    (visible) => {
      if (!visible) return;
      title.value = props.defaultTitle || '\u533a\u57df key \u5bf9\u6bd4';
      keyword.value = '';
      page.value = 0;
      timeRange.value = 'today';
      selectedDevices.value = [];
      selectedKeys.value = [];
      availableKeys.value = [];
      error.value = '';
      void reloadDevices();
    },
  );
</script>

<style scoped>
  .akcd-mask {
    position: fixed;
    inset: 0;
    z-index: 2800;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 8, 18, 0.58);
    backdrop-filter: blur(8px);
  }

  .akcd-card {
    width: min(980px, 96vw);
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    border: 1px solid rgba(116, 211, 255, 0.22);
    border-radius: 12px;
    background: rgba(5, 22, 38, 0.96);
    box-shadow: 0 22px 80px rgba(0, 0, 0, 0.38);
    color: #e5f7ff;
  }

  .akcd-head,
  .akcd-title-row,
  .akcd-section-title,
  .akcd-toolbar,
  .akcd-pager,
  .akcd-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .akcd-head strong {
    display: block;
    font-size: 18px;
    line-height: 1.2;
  }

  .akcd-head span,
  .akcd-section-title,
  .akcd-pager,
  .akcd-empty,
  .akcd-selected-keys span {
    color: rgba(229, 247, 255, 0.66);
    font-size: 12px;
  }

  .akcd-icon-btn {
    width: 30px;
    height: 30px;
    padding: 0;
  }

  .akcd-title-row label {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 6px;
    color: rgba(229, 247, 255, 0.72);
    font-size: 12px;
  }

  .akcd-body {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 14px;
  }

  .akcd-panel {
    min-width: 0;
    min-height: 360px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    border: 1px solid rgba(116, 211, 255, 0.14);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.035);
  }

  .akcd-list,
  .akcd-key-list,
  .akcd-chips {
    min-height: 0;
    overflow: auto;
  }

  .akcd-list {
    flex: 1;
    display: grid;
    align-content: start;
    gap: 8px;
  }

  .akcd-device,
  .akcd-key,
  .akcd-chip {
    border: 1px solid rgba(148, 214, 255, 0.16);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.045);
    color: #dff7ff;
  }

  .akcd-device {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 10px;
    text-align: left;
  }

  .akcd-device small {
    color: rgba(229, 247, 255, 0.52);
  }

  .akcd-device.active,
  .akcd-key.active {
    border-color: rgba(52, 211, 153, 0.72);
    background: rgba(16, 185, 129, 0.16);
  }

  .akcd-key-list,
  .akcd-chips {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 8px;
  }

  .akcd-key,
  .akcd-chip {
    padding: 7px 9px;
  }

  .akcd-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .akcd-selected-keys {
    display: grid;
    gap: 5px;
  }

  .akcd-selected-keys strong {
    color: #9be8ff;
    word-break: break-all;
  }

  .akcd-error {
    padding: 9px 10px;
    border: 1px solid rgba(248, 113, 113, 0.28);
    border-radius: 8px;
    background: rgba(127, 29, 29, 0.2);
    color: #fecaca;
    font-size: 12px;
  }

  .akcd-card input,
  .akcd-card select,
  .akcd-card button {
    border: 1px solid rgba(148, 214, 255, 0.16);
    border-radius: 8px;
    background: rgba(5, 20, 36, 0.72);
    color: #e5f7ff;
  }

  .akcd-card input,
  .akcd-card select {
    width: 100%;
    min-height: 34px;
    padding: 0 10px;
  }

  .akcd-card button {
    min-height: 32px;
    padding: 0 12px;
    cursor: pointer;
  }

  .akcd-card button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .akcd-card button.primary {
    border-color: rgba(56, 189, 248, 0.55);
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.8), rgba(20, 184, 166, 0.72));
  }

  @media (max-width: 760px) {
    .akcd-body,
    .akcd-title-row {
      grid-template-columns: 1fr;
      display: grid;
    }

    .akcd-panel {
      min-height: 240px;
    }
  }
</style>
