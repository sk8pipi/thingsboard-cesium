<template>
  <div v-if="visible" class="akt-mask" @click.self="emit(`cancel`)">
    <div class="akt-card">
      <header class="akt-head">
        <div><strong>配置资产 Key 趋势折线图</strong><span>选择一个资产及其时序 Key</span></div>
        <button type="button" @click="emit(`cancel`)">×</button>
      </header>

      <label class="akt-field">
        <span>部件名称</span>
        <input v-model.trim="title" maxlength="30" placeholder="例如：1号泵温度趋势" />
      </label>
      <label class="akt-field">
        <span>资产</span>
        <select v-model="assetId" :disabled="assetsLoading" @change="onAssetChanged">
          <option value="">请选择资产</option>
          <option v-for="asset in assets" :key="asset.id" :value="asset.id">{{ asset.name }}</option>
        </select>
        <small v-if="assetsLoading">正在读取资产...</small>
      </label>

      <section class="akt-keys">
        <div class="akt-section-title"
          ><span>时序 Key</span><small>已选：{{ telemetryKey || '未选择' }}</small></div
        >
        <div v-if="keysLoading" class="akt-state">正在读取资产时序 Key...</div>
        <div v-else-if="availableKeys.length" class="akt-key-list">
          <button
            v-for="key in availableKeys"
            :key="key"
            type="button"
            :class="{ active: telemetryKey === key }"
            @click="selectTelemetryKey(key)"
            >{{ key }}</button
          >
        </div>
        <div v-else class="akt-state">选择资产后显示可用 Key</div>
      </section>

      <div class="akt-row">
        <label class="akt-field">
          <span>统计方式</span>
          <select v-model="statisticMode">
            <option value="todayUsage">今日用量（累计差值）</option>
            <option value="latest">当前累计值</option>
          </select>
        </label>
        <label class="akt-field">
          <span>单位</span>
          <select v-model="unitOption">
            <option v-for="item in unitOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label v-if="unitOption === CUSTOM_UNIT" class="akt-field">
          <span>自定义单位</span><input v-model.trim="customUnit" maxlength="16" placeholder="请输入单位" />
        </label>
        <label class="akt-field">
          <span>默认时间范围</span>
          <select v-model="timeRange"
            ><option value="last24h">最近24小时</option
            ><option value="last7d">最近7天</option></select
          >
        </label>
      </div>

      <div v-if="error" class="akt-error">{{ error }}</div>
      <footer class="akt-foot">
        <button type="button" @click="emit(`cancel`)">取消</button>
        <button type="button" class="primary" :disabled="!canConfirm" @click="confirm">生成部件</button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { getCustomerAssetInfoList, getTenantAssetInfoList } from '/@/api/tb/asset';
  import { getTimeseriesKeys } from '/@/api/tb/telemetry';
  import { EntityType } from '/@/enums/entityTypeEnum';
  import { useUserStoreWithOut } from '/@/store/modules/user';

  type TrendRange = 'last24h' | 'last7d';
  type StatisticMode = 'latest' | 'todayUsage';
  type AssetOption = { id: string; name: string };
  const CUSTOM_UNIT = '__custom__';
  const props = withDefaults(defineProps<{ visible: boolean; defaultTitle?: string }>(), { defaultTitle: '' });
  const emit = defineEmits<{
    (event: 'cancel'): void;
    (
      event: 'ok',
      payload: {
        title: string;
        asset: AssetOption;
        key: string;
        unit: string;
        statisticMode: StatisticMode;
        timeRange: TrendRange;
      },
    ): void;
  }>();
  const userStore = useUserStoreWithOut();
  const assets = ref<AssetOption[]>([]);
  const assetId = ref('');
  const availableKeys = ref<string[]>([]);
  const telemetryKey = ref('');
  const title = ref('');
  const unitOption = ref('');
  const customUnit = ref('');
  const statisticMode = ref<StatisticMode>('latest');
  const timeRange = ref<TrendRange>('last24h');
  const assetsLoading = ref(false);
  const keysLoading = ref(false);
  const error = ref('');
  const unitOptions = [
    { value: '', label: '无单位' },
    { value: '℃', label: '℃' },
    { value: '%', label: '%' },
    { value: 'Pa', label: 'Pa' },
    { value: 'kPa', label: 'kPa' },
    { value: 'MPa', label: 'MPa' },
    { value: 'V', label: 'V' },
    { value: 'A', label: 'A' },
    { value: 'W', label: 'W' },
    { value: 'kW', label: 'kW' },
    { value: 'kWh', label: 'kWh' },
    { value: 'Hz', label: 'Hz' },
    { value: 'rpm', label: 'rpm' },
    { value: 'm', label: 'm' },
    { value: 'm/s', label: 'm/s' },
    { value: 'L/min', label: 'L/min' },
    { value: 'm³', label: 'm³' },
    { value: 'm³/h', label: 'm³/h' },
    { value: CUSTOM_UNIT, label: '自定义单位' },
  ];
  const selectedAsset = computed(() => assets.value.find((item) => item.id === assetId.value) || null);
  const selectedUnit = computed(() => (unitOption.value === CUSTOM_UNIT ? customUnit.value.trim() : unitOption.value));
  const canConfirm = computed(() =>
    Boolean(
      title.value.trim() &&
        selectedAsset.value &&
        telemetryKey.value &&
        (unitOption.value !== CUSTOM_UNIT || selectedUnit.value),
    ),
  );

  async function loadAssets() {
    assetsLoading.value = true;
    error.value = '';
    try {
      const params = { page: 0, pageSize: 500, sortProperty: 'name', sortOrder: 'ASC' as const };
      const customerId = String(userStore.getUserInfo?.customerId?.id || '');
      const page =
        String(userStore.getAuthority || '') === 'CUSTOMER_USER' && customerId
          ? await getCustomerAssetInfoList(params, customerId)
          : await getTenantAssetInfoList(params);
      assets.value = (page.data || []).flatMap((asset: any) =>
        asset.id?.id ? [{ id: String(asset.id.id), name: String(asset.name || asset.id.id) }] : [],
      );
    } catch {
      assets.value = [];
      error.value = '资产列表加载失败，请稍后重试。';
    } finally {
      assetsLoading.value = false;
    }
  }

  async function onAssetChanged() {
    const currentAssetId = assetId.value;
    availableKeys.value = [];
    telemetryKey.value = '';
    error.value = '';
    if (!currentAssetId) return;
    keysLoading.value = true;
    try {
      const keys = await getTimeseriesKeys({ entityType: EntityType.ASSET, id: currentAssetId } as any);
      if (currentAssetId !== assetId.value) return;
      availableKeys.value = (keys || [])
        .map((key) => String(key || '').trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
    } catch {
      if (currentAssetId === assetId.value) error.value = '资产时序 Key 加载失败，请稍后重试。';
    } finally {
      if (currentAssetId === assetId.value) keysLoading.value = false;
    }
  }

  function selectTelemetryKey(key: string) {
    telemetryKey.value = key;
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.includes('electricityconsumption')) {
      statisticMode.value = 'todayUsage';
      unitOption.value = 'kWh';
      customUnit.value = '';
    } else if (normalizedKey.includes('waterconsumption')) {
      statisticMode.value = 'todayUsage';
      unitOption.value = 'm³';
      customUnit.value = '';
    } else {
      statisticMode.value = 'latest';
      unitOption.value = '';
      customUnit.value = '';
    }
  }

  function confirm() {
    if (!canConfirm.value || !selectedAsset.value) return;
    emit('ok', {
      title: title.value.trim(),
      asset: selectedAsset.value,
      key: telemetryKey.value,
      unit: selectedUnit.value,
      statisticMode: statisticMode.value,
      timeRange: timeRange.value,
    });
  }

  watch(
    () => props.visible,
    (visible) => {
      if (!visible) return;
      title.value = props.defaultTitle || '资产 Key 趋势';
      assetId.value = '';
      availableKeys.value = [];
      telemetryKey.value = '';
      unitOption.value = '';
      customUnit.value = '';
      statisticMode.value = 'latest';
      timeRange.value = 'last24h';
      error.value = '';
      void loadAssets();
    },
  );
</script>

<style scoped>
  .akt-mask {
    position: fixed;
    inset: 0;
    z-index: 2800;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(0, 8, 18, 0.58);
    backdrop-filter: blur(8px);
  }
  .akt-card {
    width: min(760px, 96vw);
    max-height: 88vh;
    overflow-y: auto;
    box-sizing: border-box;
    display: grid;
    gap: 14px;
    padding: 18px;
    border: 1px solid rgba(116, 211, 255, 0.22);
    border-radius: 12px;
    background: rgba(5, 22, 38, 0.96);
    color: #e5f7ff;
  }
  .akt-head,
  .akt-section-title,
  .akt-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .akt-head strong,
  .akt-head span {
    display: block;
  }
  .akt-head strong {
    font-size: 18px;
  }
  .akt-head span,
  .akt-field,
  .akt-section-title {
    color: rgba(229, 247, 255, 0.72);
    font-size: 12px;
  }
  .akt-field {
    min-width: 0;
    display: grid;
    gap: 6px;
  }
  .akt-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .akt-card input,
  .akt-card select,
  .akt-card button {
    box-sizing: border-box;
    border: 1px solid rgba(148, 214, 255, 0.2);
    border-radius: 8px;
    background: rgba(5, 20, 36, 0.72);
    color: #e5f7ff;
  }
  .akt-card input,
  .akt-card select {
    width: 100%;
    min-height: 36px;
    padding: 0 10px;
  }
  .akt-card button {
    min-height: 32px;
    padding: 0 12px;
    cursor: pointer;
  }

  .akt-keys {
    display: grid;
    gap: 10px;
    min-height: 120px;
    padding: 12px;
    border: 1px solid rgba(116, 211, 255, 0.14);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.035);
  }
  .akt-key-list {
    max-height: 180px;
    overflow-y: auto;
    display: flex;
    align-content: flex-start;
    flex-wrap: wrap;
    gap: 8px;
  }
  .akt-key-list button.active {
    border-color: rgba(52, 211, 153, 0.72);
    background: rgba(16, 185, 129, 0.16);
  }
  .akt-state {
    display: grid;
    place-items: center;
    min-height: 70px;
    color: rgba(229, 247, 255, 0.6);
    font-size: 12px;
  }
  .akt-error {
    padding: 9px 10px;
    border: 1px solid rgba(248, 113, 113, 0.28);
    border-radius: 8px;
    background: rgba(127, 29, 29, 0.2);
    color: #fecaca;
    font-size: 12px;
  }
  .akt-card button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .akt-card button.primary {
    border-color: rgba(56, 189, 248, 0.55);
    background: rgba(14, 165, 233, 0.72);
  }
  @media (max-width: 680px) {
    .akt-row {
      grid-template-columns: 1fr;
    }
  }
</style>
