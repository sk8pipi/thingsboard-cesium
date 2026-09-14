<template>
  <Teleport :to="overlayTarget">
    <div v-if="visible" class="nw-mask" @keydown.esc.stop="emit('close')">
      <section class="nw-dialog" role="dialog" aria-modal="true" aria-label="Vue 部件配置" tabindex="-1">
        <header
          ><div
            ><strong>配置部件 · {{ draft?.title || source?.name }}</strong
            ><small>{{ support.reason }}</small></div
          ><button aria-label="关闭" @click="emit('close')">×</button></header
        >
        <div v-if="draft" class="nw-columns">
          <div class="nw-form">
            <nav
              ><button
                v-for="item in tabs"
                :key="item.id"
                :class="{ active: tab === item.id }"
                @click="tab = item.id"
                >{{ item.label }}</button
              ></nav
            >
            <label>标题<input v-model="draft.title" /></label>
            <template v-if="tab === 'data'">
              <p v-if="lockedEntity" class="nw-note"
                >自动绑定当前点位：{{ lockedEntity.name || lockedEntity.entityId }}</p
              >
              <template v-else>
                <div class="nw-row"
                  ><select v-model="entityType" @change="searchEntities(0)"
                    ><option value="DEVICE">设备</option
                    ><option value="ASSET">资产自身数据</option></select
                  ><input v-model="query" placeholder="搜索名称" @keydown.enter="searchEntities(0)" /><button
                    :disabled="loading"
                    @click="searchEntities(0)"
                    >搜索</button
                  ></div
                >
                <div v-if="entityType === 'DEVICE'" class="nw-row"
                  ><span>设备配置</span
                  ><input v-model="profileQuery" placeholder="搜索配置名称" @keydown.enter="loadProfiles" /><button
                    @click="loadProfiles"
                    >查找</button
                  ></div
                >
                <select v-if="entityType === 'DEVICE'" v-model="profileId" @change="searchEntities(0)"
                  ><option value="">所有配置</option
                  ><option v-for="profile in profiles" :key="profile.id.id" :value="profile.id.id">{{
                    profile.name
                  }}</option></select
                >
                <p v-if="entityType === 'ASSET'" class="nw-note"
                  >读取资产自身字段。下属设备汇总请使用现有“资产聚合”部件。</p
                >
                <div class="nw-entities"
                  ><button
                    v-for="entity in entities"
                    :key="entity.id.id"
                    :disabled="sources.length >= 8 || sources.some((s) => s.entityId === entity.id.id)"
                    @click="addSource(entity)"
                    >{{ entity.name }}
                    <small>{{ entity.deviceProfileName || entity.assetProfileName }}</small> ＋</button
                  ><p v-if="!loading && !entities.length">暂无匹配实体</p></div
                >
                <div class="nw-row"
                  ><button :disabled="page === 0 || loading" @click="searchEntities(page - 1)">上一页</button
                  ><span>{{ page + 1 }}</span
                  ><button :disabled="!hasNext || loading" @click="searchEntities(page + 1)">下一页</button></div
                >
              </template>
              <article v-for="(ds, index) in sources" :key="ds.entityId" class="nw-source">
                <div class="nw-row"
                  ><strong>{{ ds.name || ds.entityId }}</strong
                  ><button v-if="!lockedEntity" @click="sources.splice(index, 1)">移除</button></div
                >
                <div class="nw-row"
                  ><select v-model="keyTypes[ds.entityId]" @change="loadKeys(ds)"
                    ><option value="timeseries">遥测</option
                    ><option v-if="!historical" value="CLIENT_SCOPE">客户端属性</option
                    ><option v-if="!historical" value="SERVER_SCOPE">服务端属性</option
                    ><option v-if="!historical" value="SHARED_SCOPE">共享属性</option></select
                  ><button :disabled="keyLoading[ds.entityId]" @click="loadKeys(ds)">读取字段</button></div
                >
                <div class="nw-keys"
                  ><button v-for="key in availableKeys[ds.entityId] || []" :key="key" @click="addKey(ds, key)"
                    >{{ key }} ＋</button
                  ></div
                >
                <small v-if="keyMessages[ds.entityId]">{{ keyMessages[ds.entityId] }}</small>
                <div v-for="(key, ki) in ds.dataKeys" :key="ki" class="nw-key">
                  <strong
                    >{{ key.name }} <small>{{ key.type === 'attribute' ? key.scope : '遥测' }}</small></strong
                  >
                  <div class="nw-row"
                    ><input v-model="key.label" aria-label="字段显示名称" placeholder="显示名称" /><input
                      v-model="key.units"
                      aria-label="单位"
                      placeholder="单位"
                    /><input v-model.number="key.decimals" type="number" min="0" max="8" aria-label="小数位" /><input
                      v-model="key.color"
                      type="color"
                      aria-label="曲线颜色"
                    /><button @click="ds.dataKeys.splice(ki, 1)">×</button></div
                  >
                </div>
              </article>
            </template>
            <template v-if="tab === 'time'">
              <label v-if="historical"
                >时间模式<select v-model="draft.config.native.window.realtime"
                  ><option :value="true">实时滚动</option
                  ><option :value="false">固定历史范围</option></select
                ></label
              >
              <template v-if="historical && draft.config.native.window.realtime"
                ><label
                  >时间窗口<select v-model="draft.config.native.window.durationMs"
                    ><option :value="300000">5 分钟</option
                    ><option :value="3600000">1 小时</option
                    ><option :value="86400000">24 小时</option
                    ><option :value="604800000">7 天</option></select
                  ></label
                ></template
              >
              <div v-else-if="historical" class="nw-row"
                ><label
                  >开始<input
                    type="datetime-local"
                    :value="localDate(draft.config.native.window.startTs)"
                    @input="setDate('startTs', $event)" /></label
                ><label
                  >结束<input
                    type="datetime-local"
                    :value="localDate(draft.config.native.window.endTs)"
                    @input="setDate('endTs', $event)" /></label
              ></div>
              <label v-if="historical"
                >聚合<select v-model="draft.config.native.window.aggregation"
                  ><option v-for="agg in ['NONE', 'AVG', 'MIN', 'MAX', 'SUM', 'COUNT']" :key="agg" :value="agg">{{
                    agg
                  }}</option></select
                ></label
              >
              <label v-if="historical"
                >聚合间隔（毫秒）<input v-model.number="draft.config.native.window.intervalMs" type="number" min="1000"
              /></label>
              <label
                >刷新间隔（毫秒）<input
                  v-model.number="draft.config.native.pollMs"
                  type="number"
                  min="5000"
                  max="300000"
              /></label>
              <p class="nw-note">最多 8 个数据源。历史查询有条数上限；长时间范围建议使用聚合。固定历史仅加载一次。</p>
            </template>
            <template v-if="tab === 'style'">
              <div class="nw-row"
                ><label>量程下限<input v-model.number="draft.config.native.min" type="number" /></label
                ><label>量程上限<input v-model.number="draft.config.native.max" type="number" /></label
              ></div>
              <label
                >数值字号<input v-model.number="draft.config.native.fontSize" type="number" min="12" max="96"
              /></label>
              <div class="nw-row"
                ><label><input v-model="draft.config.native.showLabel" type="checkbox" />显示字段名称</label
                ><label><input v-model="draft.config.native.showDate" type="checkbox" />更新时间</label
                ><label><input v-model="draft.config.native.showLegend" type="checkbox" />图例</label></div
              >
              <div class="nw-row"
                ><strong>数值颜色区间</strong
                ><button @click="draft.config.native.thresholds.push({ from: null, to: null, color: '#6ce9ff' })"
                  >添加区间</button
                ></div
              >
              <div v-for="(threshold, ti) in draft.config.native.thresholds" :key="ti" class="nw-row"
                ><input
                  :value="threshold.from"
                  placeholder="下限（空为无限）"
                  type="number"
                  @input="threshold.from = optionalNumber($event)"
                /><input
                  :value="threshold.to"
                  placeholder="上限（空为无限）"
                  type="number"
                  @input="threshold.to = optionalNumber($event)"
                /><input v-model="threshold.color" type="color" /><button
                  @click="draft.config.native.thresholds.splice(ti, 1)"
                  >×</button
                ></div
              >
              <p class="nw-note">液态玻璃由大屏容器统一绘制，部件内部保持透明。大屏全局样式设置优先。</p>
              <label
                >玻璃底色浓度<input
                  v-model.number="draft.appearance!.backgroundOpacity"
                  type="range"
                  min="0"
                  max="0.7"
                  step="0.01"
              /></label>
              <label
                >边框亮度<input
                  v-model.number="draft.appearance!.borderOpacity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
              /></label>
              <label>圆角<input v-model.number="draft.appearance!.radiusPx" type="range" min="0" max="40" /></label>
              <label>强调色<input v-model="draft.appearance!.accentColor" type="color" /></label>
            </template>
            <p v-if="message" role="alert" class="nw-error">{{ message }}</p>
          </div>
          <aside
            ><div class="nw-row"><strong>实际数据预览</strong><button @click="updatePreview">更新预览</button></div
            ><p class="nw-note">修改配置后点击更新；预览与大屏共用 Vue 组件。</p
            ><div class="nw-preview"
              ><section
                v-if="preview"
                class="tb-widget-surface"
                :style="widgetAppearanceStyle(preview.widgetKey, preview.appearance)"
                ><NativeWidgetRenderer :key="preview.id" :config="preview.config" /></section
              ><p v-else>选择数据源和字段后预览</p></div
            ></aside
          >
        </div>
        <p v-else class="nw-error">{{ message || support.reason }}</p>
        <footer
          ><button @click="emit('close')">取消</button
          ><button v-if="!previewOnly && draft" class="nw-primary" @click="confirm">{{
            source?.config?.native ? '应用配置' : '添加部件'
          }}</button></footer
        >
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onBeforeUnmount } from 'vue';
  import { useNativeOverlayTarget } from './useNativeOverlayTarget';
  const overlayTarget = useNativeOverlayTarget();
  import { createNativeWidget, getNativeWidgetSupport, validateNativeWidget } from './nativeWidgetCatalog';
  import type { NativeSource } from './nativeWidgetTypes';
  import type { DashboardWidget } from '../types';
  import NativeWidgetRenderer from './NativeWidgetRenderer.vue';
  import { widgetAppearanceStyle } from '../widgets/core/widgetInstance';
  import '../widgets/core/widgetSurface.css';
  import { getTenantDeviceInfoList, getCustomerDeviceInfoList } from '/@/api/tb/device';
  import { getTenantAssetInfoList, getCustomerAssetInfoList } from '/@/api/tb/asset';
  import { getDeviceProfileInfoList } from '/@/api/tb/deviceProfile';
  import { getTimeseriesKeys, getAttributeKeysByScope } from '/@/api/tb/telemetry';
  import { useUserStoreWithOut } from '/@/store/modules/user';

  const props = defineProps<{
    visible: boolean;
    source: Record<string, any>;
    previewOnly?: boolean;
    lockedEntity?: { entityId: string; name?: string };
  }>();
  const emit = defineEmits<{ (e: 'close'): void; (e: 'confirm', widget: DashboardWidget): void }>();
  const tabs = [
    { id: 'data', label: '数据源与字段' },
    { id: 'time', label: '时间与刷新' },
    { id: 'style', label: '外观与阈值' },
  ];
  const draft = ref<DashboardWidget | null>(null),
    preview = ref<DashboardWidget | null>(null),
    tab = ref('data'),
    message = ref('');
  const entityType = ref<'DEVICE' | 'ASSET'>('DEVICE'),
    query = ref(''),
    profileQuery = ref(''),
    profileId = ref(''),
    profiles = ref<any[]>([]),
    entities = ref<any[]>([]),
    page = ref(0),
    hasNext = ref(false),
    loading = ref(false);
  const keyTypes = ref<Record<string, string>>({}),
    availableKeys = ref<Record<string, string[]>>({}),
    keyMessages = ref<Record<string, string>>({}),
    keyLoading = ref<Record<string, boolean>>({});
  const keyRequests: Record<string, number> = {};
  const loadedKeyTypes: Record<string, string> = {};
  let generation = 0,
    searchGeneration = 0,
    profileGeneration = 0;
  const user = useUserStoreWithOut();
  const support = computed(() => getNativeWidgetSupport(props.source));
  const sources = computed(() => (draft.value?.config.datasources || []) as NativeSource[]);
  const historical = computed(() => ['valueChart', 'timeseries', 'table'].includes(draft.value?.config.native.family));
  watch(
    () => [props.visible, props.source],
    () => {
      generation++;
      preview.value = null;
      message.value = '';
      tab.value = 'data';
      availableKeys.value = {};
      keyMessages.value = {};
      keyLoading.value = {};
      if (!props.visible) return;
      try {
        draft.value = createNativeWidget(props.source);
      } catch (e: any) {
        draft.value = null;
        message.value = e.message;
        return;
      }
      draft.value.config.native.window.startTs ||= Date.now() - 3600000;
      draft.value.config.native.window.endTs ||= Date.now();
      if (props.lockedEntity) {
        const previous = sources.value.find((s) => s.entityId === props.lockedEntity!.entityId);
        draft.value.config.datasources = [
          previous || {
            type: 'entity',
            entityType: 'DEVICE',
            entityId: props.lockedEntity.entityId,
            name: props.lockedEntity.name,
            dataKeys: [],
          },
        ];
      }
      sources.value.forEach((s) => {
        keyTypes.value[s.entityId] = 'timeseries';
      });
      if (!props.lockedEntity) {
        void searchEntities(0);
        void loadProfiles();
      } else void loadKeys(sources.value[0]);
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
    searchGeneration++;
    profileGeneration++;
  });
  async function searchEntities(nextPage: number) {
    const run = ++searchGeneration,
      session = generation;
    loading.value = true;
    entities.value = [];
    message.value = '';
    try {
      const params: any = {
        page: nextPage,
        pageSize: 20,
        textSearch: query.value,
        sortProperty: 'name',
        sortOrder: 'ASC',
        ...(entityType.value === 'DEVICE' && profileId.value ? { deviceProfileId: profileId.value } : {}),
      };
      const customer = String(user.getPageCacheByKey('customerId', ''));
      const isCustomer = user.getAuthority === 'CUSTOMER_USER';
      if (isCustomer && !customer) throw new Error('当前客户身份不可用，请重新登录');
      const result =
        entityType.value === 'DEVICE'
          ? await (isCustomer ? getCustomerDeviceInfoList(params, customer) : getTenantDeviceInfoList(params))
          : await (isCustomer ? getCustomerAssetInfoList(params, customer) : getTenantAssetInfoList(params));
      if (run !== searchGeneration || session !== generation) return;
      entities.value = result.data || [];
      page.value = nextPage;
      hasNext.value = !!result.hasNext;
    } catch {
      if (run === searchGeneration && session === generation) {
        entities.value = [];
        message.value = '实体列表读取失败，请检查登录和权限后重试';
      }
    } finally {
      if (run === searchGeneration && session === generation) loading.value = false;
    }
  }
  async function loadProfiles() {
    const run = ++profileGeneration,
      session = generation;
    try {
      const result = await getDeviceProfileInfoList({
        page: 0,
        pageSize: 100,
        textSearch: profileQuery.value,
        sortProperty: 'name',
        sortOrder: 'ASC',
      });
      if (run === profileGeneration && session === generation) profiles.value = result.data || [];
    } catch {
      if (session === generation) message.value = '设备配置列表读取失败，仍可按实体名称搜索';
    }
  }
  function addSource(entity: any) {
    if (!draft.value || sources.value.length >= 8) return;
    const ds: NativeSource = {
      type: 'entity',
      entityType: entityType.value,
      entityId: entity.id.id,
      name: entity.name,
      dataKeys: [],
    };
    sources.value.push(ds);
    keyTypes.value[ds.entityId] = 'timeseries';
    void loadKeys(ds);
  }
  async function loadKeys(ds: NativeSource) {
    const request = (keyRequests[ds.entityId] || 0) + 1;
    keyRequests[ds.entityId] = request;
    const session = generation,
      kind = keyTypes.value[ds.entityId] || 'timeseries';
    keyLoading.value[ds.entityId] = true;
    availableKeys.value[ds.entityId] = [];
    keyMessages.value[ds.entityId] = '';
    try {
      const entity: any = { id: ds.entityId, entityType: ds.entityType };
      const keys =
        kind === 'timeseries' ? await getTimeseriesKeys(entity) : await getAttributeKeysByScope(entity, kind as any);
      if (session === generation && request === keyRequests[ds.entityId] && kind === keyTypes.value[ds.entityId]) {
        availableKeys.value[ds.entityId] = keys;
        loadedKeyTypes[ds.entityId] = kind;
        keyMessages.value[ds.entityId] = keys.length ? '' : '此范围暂无字段';
      }
    } catch {
      if (session === generation && request === keyRequests[ds.entityId])
        keyMessages.value[ds.entityId] = '字段读取失败，请重试';
    } finally {
      if (session === generation && request === keyRequests[ds.entityId]) keyLoading.value[ds.entityId] = false;
    }
  }
  function addKey(ds: NativeSource, name: string) {
    const kind = keyTypes.value[ds.entityId] || 'timeseries';
    if (
      keyLoading.value[ds.entityId] ||
      loadedKeyTypes[ds.entityId] !== kind ||
      !availableKeys.value[ds.entityId]?.includes(name)
    )
      return;
    const type = kind === 'timeseries' ? 'timeseries' : 'attribute';
    if (ds.dataKeys.some((k) => k.name === name && k.type === type && (k.scope || 'timeseries') === kind)) return;
    if (ds.dataKeys.length >= 16) {
      message.value = '每个数据源最多 16 个字段';
      return;
    }
    ds.dataKeys.push({
      name,
      type,
      scope: type === 'attribute' ? (kind as any) : undefined,
      label: name,
      color: '#6ce9ff',
      units: draft.value?.config.units || '',
      decimals: draft.value?.config.decimals ?? 2,
    });
  }
  function valid() {
    if (!draft.value) return false;
    message.value = validateNativeWidget(draft.value).join('；');
    return !message.value;
  }
  function updatePreview() {
    if (!valid()) return;
    draft.value!.config.title = draft.value!.title;
    preview.value = JSON.parse(JSON.stringify(draft.value));
    preview.value!.id = `preview-${Date.now()}`;
  }
  function confirm() {
    if (!valid()) return;
    draft.value!.config.title = draft.value!.title;
    emit('confirm', JSON.parse(JSON.stringify(draft.value)));
  }
  function localDate(ts: number) {
    if (!Number.isFinite(ts) || !ts) return '';
    const date = new Date(ts);
    return new Date(ts - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function setDate(key: string, event: Event) {
    draft.value!.config.native.window[key] = new Date((event.target as HTMLInputElement).value).getTime();
  }
  function optionalNumber(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    return value === '' ? null : Number(value);
  }
</script>
<style scoped>
  .nw-mask {
    position: fixed;
    inset: 0;
    z-index: 12000;
    background: rgba(2, 10, 22, 0.76);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: #e6f6ff;
  }
  .nw-dialog {
    width: min(1160px, 100%);
    max-height: 94vh;
    display: flex;
    flex-direction: column;
    background: #102536;
    border: 1px solid #496777;
    border-radius: 18px;
    box-shadow: 0 24px 80px #0008;
    overflow: hidden;
  }
  header,
  footer {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 24px;
    align-items: center;
    border-bottom: 1px solid #ffffff20;
  }
  header small {
    display: block;
    max-width: 900px;
    margin-top: 6px;
    color: #abc4d2;
    font-size: 12px;
  }
  footer {
    justify-content: flex-end;
    border-top: 1px solid #ffffff20;
  }
  .nw-columns {
    display: grid;
    grid-template-columns: 1.15fr 1fr;
    overflow: auto;
    min-height: 0;
  }
  .nw-form,
  aside {
    padding: 20px;
    min-width: 0;
  }
  .nw-form {
    border-right: 1px solid #ffffff20;
    overflow: auto;
  }
  nav,
  .nw-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
  }
  .nw-row > * {
    min-width: 0;
  }
  .nw-row input {
    width: 100%;
  }
  nav button {
    flex: 1;
  }
  button,
  input,
  select {
    font: inherit;
    color: inherit;
    background: #ffffff0b;
    border: 1px solid #ffffff30;
    border-radius: 7px;
    padding: 7px 10px;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  button.active,
  .nw-primary {
    background: #237e93;
  }
  input,
  select {
    max-width: 100%;
  }
  select option {
    background: #102536;
  }
  label {
    display: flex;
    gap: 8px;
    flex-direction: column;
    margin: 12px 0;
  }
  input[type='checkbox'] {
    width: auto;
  }
  input[type='color'] {
    width: 42px;
    min-width: 42px;
    padding: 2px;
  }
  strong {
    font-weight: 600;
  }
  small,
  .nw-note {
    color: #a6bfcb;
    font-size: 12px;
  }
  .nw-entities,
  .nw-keys {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 10px 0;
    max-height: 150px;
    overflow: auto;
  }
  .nw-entities button {
    text-align: left;
  }
  .nw-entities small {
    display: block;
  }
  .nw-source {
    border: 1px solid #ffffff25;
    border-radius: 10px;
    padding: 12px;
    margin: 12px 0;
  }
  .nw-key {
    padding: 8px 0;
  }
  .nw-key input[type='number'] {
    width: 65px;
  }
  .nw-error {
    color: #ffb3a8;
    padding: 12px;
  }
  .nw-preview {
    padding: 22px;
    min-height: 340px;
    border-radius: 12px;
    background:
      radial-gradient(ellipse at 10% 20%, #236b79, transparent 55%), linear-gradient(125deg, #0b1828, #244533);
    display: grid;
    align-items: center;
  }
  .nw-preview > section {
    height: 310px;
    overflow: hidden;
    padding: 14px;
  }
  .nw-preview > p {
    text-align: center;
  }
  .nw-row label {
    flex: 1;
  }
  @media (max-width: 800px) {
    .nw-mask {
      padding: 8px;
    }
    .nw-columns {
      grid-template-columns: 1fr;
    }
    .nw-form {
      overflow: visible;
      border: 0;
    }
    aside {
      border-top: 1px solid #ffffff20;
    }
  }
</style>
