<template>
  <Teleport :to="overlayTarget">
    <div v-if="visible" class="nw-mask" @keydown.esc.stop="previewVisible ? (previewVisible = false) : emit('close')">
      <section class="nw-dialog" role="dialog" aria-modal="true" aria-label="部件配置" tabindex="-1">
        <header>
          <strong>{{ source?.config?.native ? '编辑' : '添加' }}：{{ source?.name || draft?.title }}</strong>
          <div class="nw-header-actions"
            ><div class="nw-segment"
              ><button :class="{ active: mode === 'basic' }" @click="mode = 'basic'">基础</button
              ><button :class="{ active: mode === 'advanced' }" @click="mode = 'advanced'">高级</button></div
            ><button aria-label="关闭配置" @click="emit('close')">×</button></div
          >
        </header>
        <div v-if="draft" class="nw-content">
          <template v-if="mode === 'basic'">
            <section v-if="historical" class="nw-panel">
              <h3>时间窗口 <span class="nw-tag">使用部件时间窗口</span></h3>
              <details class="nw-time">
                <summary>{{
                  draft.config.native.window.realtime
                    ? '◷ 实时 · 最后 ' + durationLabel()
                    : draft.config.native.window.calendar
                      ? '◷ 日历窗口 · UTC'
                      : '◷ 固定历史范围'
                }}</summary>
                <div class="nw-fields">
                  <label
                    >时间模式<select v-model="timeMode"
                      ><option value="realtime">实时滚动</option
                      ><option value="fixed">固定历史范围</option
                      ><option value="day">今天至今（UTC）</option
                      ><option value="week">本周至今（UTC，周一开始）</option
                      ><option value="month">本月至今（UTC）</option></select
                    ></label
                  >
                  <template v-if="draft.config.native.window.realtime">
                    <label
                      >快捷窗口<select v-model="draft.config.native.window.durationMs"
                        ><option :value="60000">1 分钟</option
                        ><option :value="300000">5 分钟</option
                        ><option :value="600000">10 分钟</option
                        ><option :value="3600000">1 小时</option
                        ><option :value="86400000">24 小时</option
                        ><option :value="604800000">7 天</option></select
                      ></label
                    >
                    <label
                      >窗口时长（毫秒）<input
                        v-model.number="draft.config.native.window.durationMs"
                        type="number"
                        min="60000"
                        :max="31 * 86400000"
                    /></label>
                  </template>
                  <template v-else-if="!draft.config.native.window.calendar">
                    <label
                      >开始<input
                        type="datetime-local"
                        :value="localDate(draft.config.native.window.startTs)"
                        @input="setDate('startTs', $event)"
                    /></label>
                    <label
                      >结束<input
                        type="datetime-local"
                        :value="localDate(draft.config.native.window.endTs)"
                        @input="setDate('endTs', $event)"
                    /></label>
                  </template>
                  <label v-if="draft.config.native.family !== 'state'"
                    >聚合<select v-model="draft.config.native.window.aggregation"
                      ><option v-for="agg in ['NONE', 'AVG', 'MIN', 'MAX', 'SUM', 'COUNT']" :key="agg" :value="agg">{{
                        agg === 'NONE' ? '无聚合' : agg
                      }}</option></select
                    ></label
                  >
                  <label v-if="draft.config.native.family !== 'state'"
                    >聚合间隔（毫秒）<input
                      v-model.number="draft.config.native.window.intervalMs"
                      type="number"
                      min="1000"
                  /></label>
                </div>
              </details>
            </section>
            <section class="nw-panel">
              <h3
                >数据源 <span class="nw-tag">{{ entityType === 'DEVICE' ? '设备' : '资产' }}</span></h3
              >
              <p v-if="lockedEntity" class="nw-note">当前点位：{{ lockedEntity.name || lockedEntity.entityId }}</p>
              <template v-else>
                <div class="nw-fields">
                  <label
                    >实体类型<select v-model="entityType" @change="searchEntities(0)"
                      ><option value="DEVICE">设备</option
                      ><option value="ASSET">资产自身数据</option></select
                    ></label
                  >
                  <label v-if="entityType === 'DEVICE'"
                    >设备配置<select v-model="profileId" @change="searchEntities(0)"
                      ><option value="">所有配置</option
                      ><option v-for="profile in profiles" :key="profile.id.id" :value="profile.id.id">{{
                        profile.name
                      }}</option></select
                    ></label
                  >
                </div>
                <label>选择{{ entityType === 'DEVICE' ? '设备' : '资产' }} *</label>
                <ASelect
                  show-search
                  :filter-option="false"
                  :value="[]"
                  aria-label="选择设备或资产"
                  :dropdown-style="{ zIndex: 12100 }"
                  :loading="loading"
                  :disabled="sources.length >= 8"
                  :get-popup-container="selectPopupTarget"
                  placeholder="输入名称搜索并选择，可添加多个实体"
                  class="nw-entity-select"
                  :options="
                    entities.map((entity) => ({
                      value: entity.id.id,
                      label: entity.name,
                      disabled: sources.some((s) => s.entityId === entity.id.id && s.entityType === entityType),
                    }))
                  "
                  @search="searchOptions"
                  @change="(value) => selectEntity(String(value))"
                />
                <div class="nw-pages"
                  ><button :disabled="page === 0 || loading" @click="searchEntities(page - 1)">上一页</button
                  ><span>{{ page + 1 }}</span
                  ><button :disabled="!hasNext || loading" @click="searchEntities(page + 1)">下一页</button></div
                >
              </template>
              <div v-for="(ds, index) in sources" :key="ds.entityType + ds.entityId" class="nw-source-chip"
                ><span>{{ ds.name || ds.entityId }}</span
                ><button v-if="!lockedEntity" aria-label="移除数据源" @click="sources.splice(index, 1)">×</button></div
              >
              <p v-if="entityType === 'ASSET'" class="nw-note">读取资产自身字段；下属设备汇总使用内置资产聚合部件。</p>
            </section>
            <section class="nw-panel">
              <h3>{{ historical ? '时间序列' : '数据字段' }}</h3>
              <p v-if="!sources.length" class="nw-note">先选择设备或资产，再选择数据字段。</p>
              <article v-for="ds in sources" :key="ds.entityType + ds.entityId" class="nw-source">
                <div class="nw-source-header"
                  ><strong>{{ ds.name || ds.entityId }}</strong
                  ><div class="nw-inline"
                    ><select v-model="keyTypes[ds.entityId]" @change="loadKeys(ds)"
                      ><option value="timeseries">遥测</option
                      ><option v-if="!historical" value="CLIENT_SCOPE">客户端属性</option
                      ><option v-if="!historical" value="SERVER_SCOPE">服务端属性</option
                      ><option v-if="!historical" value="SHARED_SCOPE">共享属性</option></select
                    ><button :disabled="keyLoading[ds.entityId]" @click="loadKeys(ds)">刷新字段</button></div
                  ></div
                >
                <div class="nw-table-scroll"
                  ><table class="nw-key-table"
                    ><thead
                      ><tr
                        ><th>键</th><th v-if="draft.config.native.family !== 'liquid'">标签</th
                        ><th v-if="historical && draft.config.native.family !== 'table'">类型</th
                        ><th v-if="historical && draft.config.native.family !== 'table'">Y 轴</th
                        ><th v-if="draft.config.native.family !== 'liquid'">颜色</th
                        ><th v-if="draft.config.native.family !== 'liquid'">单位</th><th>小数</th><th></th></tr
                    ></thead>
                    <tbody
                      ><tr v-for="(key, ki) in ds.dataKeys" :key="ki"
                        ><td
                          ><span class="nw-key-name">{{ key.name }}</span></td
                        ><td v-if="draft.config.native.family !== 'liquid'"
                          ><input v-model="key.label" aria-label="字段显示名称"
                        /></td>
                        <td v-if="historical && draft.config.native.family !== 'table'"
                          ><select :value="seriesOptions(key).type" @change="setSeries(key, 'type', $event)"
                            ><option value="line">折线</option
                            ><option v-if="!['range', 'state'].includes(draft.config.native.family)" value="bar"
                              >柱形</option
                            ><option v-if="!['range', 'state'].includes(draft.config.native.family)" value="scatter"
                              >散点</option
                            ></select
                          ></td
                        >
                        <td v-if="historical && draft.config.native.family !== 'table'"
                          ><select :value="seriesOptions(key).axisId" @change="setSeries(key, 'axisId', $event)"
                            ><option v-for="axis in draft.config.native.chart.axes" :key="axis.id" :value="axis.id">{{
                              axis.label || axis.id
                            }}</option></select
                          ></td
                        >
                        <td v-if="draft.config.native.family !== 'liquid'"
                          ><input v-model="key.color" type="color" aria-label="字段颜色" /></td
                        ><td v-if="draft.config.native.family !== 'liquid'"
                          ><input v-model="key.units" aria-label="单位" /></td
                        ><td
                          ><input v-model.number="key.decimals" type="number" min="0" max="8" aria-label="小数位" /></td
                        ><td><button aria-label="删除字段" @click="ds.dataKeys.splice(ki, 1)">×</button></td></tr
                      ></tbody
                    ></table
                  ></div
                >
                <ASelect
                  show-search
                  :value="[]"
                  aria-label="添加数据字段"
                  :dropdown-style="{ zIndex: 12100 }"
                  :loading="keyLoading[ds.entityId]"
                  :get-popup-container="selectPopupTarget"
                  placeholder="＋ 添加字段"
                  class="nw-key-select"
                  :options="(availableKeys[ds.entityId] || []).map((name) => ({ value: name, label: name }))"
                  @change="(name) => addKey(ds, String(name))"
                />
                <p v-if="keyMessages[ds.entityId]" class="nw-note">{{ keyMessages[ds.entityId] }}</p>
              </article>
            </section>
            <section class="nw-panel"
              ><h3>标题</h3
              ><div class="nw-fields"
                ><label class="nw-check"><input v-model="draft.config.showTitle" type="checkbox" />显示标题</label
                ><label>标题文本<input v-model="draft.title" /></label></div
            ></section>
          </template>
          <NativeWidgetSettingsEditor v-model="draft.config.native" :mode="mode" @remove-axis="rebindAxis" />
          <NativeStateSettingsEditor
            v-if="draft.config.native.family === 'state' && mode === 'basic'"
            v-model="draft.config.native"
          />
          <NativeLiquidSettingsEditor
            v-if="draft.config.native.family === 'liquid' && mode === 'basic'"
            v-model="draft.config.native"
          />
          <NativeAggregateSettingsEditor
            v-if="draft.config.native.family === 'aggregate' && mode === 'basic'"
            v-model="draft.config.native"
          />
          <template v-if="mode === 'advanced'">
            <section v-if="historical && draft.config.native.family !== 'table'" class="nw-panel"
              ><h3>序列样式</h3>
              <template v-for="ds in sources" :key="ds.entityType + ds.entityId"
                ><details v-for="(key, index) in ds.dataKeys" :key="index" class="nw-series-detail"
                  ><summary>{{ ds.name }} · {{ key.label || key.name }}</summary
                  ><div class="nw-fields">
                    <label v-if="seriesOptions(key).type === 'line'"
                      >线宽<input
                        type="number"
                        min="0"
                        max="20"
                        :value="seriesOptions(key).lineWidth"
                        @input="setSeries(key, 'lineWidth', $event)"
                    /></label>
                    <label
                      v-if="
                        seriesOptions(key).type === 'scatter' ||
                        (seriesOptions(key).type === 'line' && seriesOptions(key).showPoints)
                      "
                      >数据点大小<input
                        type="number"
                        min="1"
                        max="40"
                        :value="seriesOptions(key).pointSize"
                        @input="setSeries(key, 'pointSize', $event)"
                    /></label>
                    <label v-if="seriesOptions(key).type === 'line' && draft.config.native.family !== 'state'"
                      >阶梯线<select :value="String(seriesOptions(key).step)" @change="setSeries(key, 'step', $event)"
                        ><option value="false">关闭</option
                        ><option value="start">起点</option
                        ><option value="middle">中点</option
                        ><option value="end">终点</option></select
                      ></label
                    >
                    <label v-for="field in seriesToggles(key)" :key="field[0]" class="nw-check"
                      ><input
                        type="checkbox"
                        :checked="seriesOptions(key)[field[0]]"
                        @change="setSeries(key, field[0], $event)"
                      />{{ field[1] }}</label
                    >
                  </div></details
                ></template
              >
            </section>
            <section
              v-if="
                [
                  'value',
                  'valueChart',
                  'progress',
                  'gauge',
                  'pie',
                  'bar',
                  'latestBar',
                  'timeseries',
                  'range',
                  'polar',
                ].includes(draft.config.native.family)
              "
              class="nw-panel"
              ><h3
                >数值颜色区间
                <button @click="draft.config.native.thresholds.push({ from: null, to: null, color: '#6ce9ff' })"
                  >添加区间</button
                ></h3
              ><div v-for="(threshold, ti) in draft.config.native.thresholds" :key="ti" class="nw-threshold"
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
                  >删除</button
                ></div
              ></section
            >
            <section class="nw-panel"
              ><h3>刷新</h3
              ><label
                >刷新间隔（毫秒）<input
                  v-model.number="draft.config.native.pollMs"
                  type="number"
                  min="5000"
                  max="300000" /></label
              ><p class="nw-note">实时窗口随当前时间推进，数据按此间隔读取。固定历史只加载一次。</p></section
            >
            <section class="nw-panel"
              ><h3>大屏外观</h3><p class="nw-note">大屏全局玻璃设置优先于单个部件。</p
              ><div class="nw-fields"
                ><label
                  >玻璃底色浓度<input
                    v-model.number="draft.appearance!.backgroundOpacity"
                    type="range"
                    min="0"
                    max="0.7"
                    step="0.01" /></label
                ><label
                  >边框亮度<input
                    v-model.number="draft.appearance!.borderOpacity"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01" /></label
                ><label>圆角<input v-model.number="draft.appearance!.radiusPx" type="range" min="0" max="40" /></label
                ><label>强调色<input v-model="draft.appearance!.accentColor" type="color" /></label></div
            ></section>
          </template>
        </div>
        <p v-else class="nw-error">{{ message || support.reason }}</p>
        <footer
          ><button @click="emit('close')">取消</button
          ><p v-if="draft && message" role="alert" class="nw-error nw-submit-error">{{ message }}</p
          ><div class="nw-footer-actions"
            ><button :disabled="!draft" @click="updatePreview">预览</button
            ><button v-if="!previewOnly && draft" class="nw-primary" @click="confirm">{{
              source?.config?.native ? '应用配置' : '添加'
            }}</button></div
          ></footer
        >
        <div v-if="previewVisible && preview" class="nw-preview-overlay" role="dialog" aria-label="部件预览"
          ><header
            ><strong>预览：{{ preview.title }}</strong
            ><button aria-label="关闭预览" @click="previewVisible = false">×</button></header
          ><div class="nw-preview"
            ><section class="tb-widget-surface" :style="widgetAppearanceStyle(preview.widgetKey, preview.appearance)"
              ><NativeWidgetRenderer :key="preview.id" :config="preview.config" /></section></div
          ><div class="nw-preview-footer"
            ><button @click="previewVisible = false">返回配置</button
            ><button v-if="!previewOnly" class="nw-primary" @click="confirm">{{
              source?.config?.native ? '应用配置' : '添加'
            }}</button></div
          ></div
        >
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onBeforeUnmount } from 'vue';
  import { useNativeOverlayTarget } from './useNativeOverlayTarget';
  const overlayTarget = useNativeOverlayTarget();
  function selectPopupTarget(): HTMLElement {
    return overlayTarget.value instanceof HTMLElement ? overlayTarget.value : document.body;
  }
  import { createNativeWidget, getNativeWidgetSupport, validateNativeWidget } from './nativeWidgetCatalog';
  import type { NativeSource } from './nativeWidgetTypes';
  import type { DashboardWidget } from '../types';
  import NativeWidgetRenderer from './NativeWidgetRenderer.vue';
  import NativeWidgetSettingsEditor from './NativeWidgetSettingsEditor.vue';
  import NativeStateSettingsEditor from './NativeStateSettingsEditor.vue';
  import NativeLiquidSettingsEditor from './NativeLiquidSettingsEditor.vue';
  import NativeAggregateSettingsEditor from './NativeAggregateSettingsEditor.vue';
  import { Select as ASelect } from 'ant-design-vue';
  import { withNativeSettings, nativeSeriesSettings } from './nativeWidgetSettings';
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
  const draft = ref<DashboardWidget | null>(null),
    preview = ref<DashboardWidget | null>(null),
    mode = ref<'basic' | 'advanced'>('basic'),
    previewVisible = ref(false),
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
  const timeMode = computed({
    get: () =>
      draft.value?.config.native.window.realtime ? 'realtime' : draft.value?.config.native.window.calendar || 'fixed',
    set: (mode: string) => {
      const window = draft.value?.config.native.window;
      if (!window) return;
      window.realtime = mode === 'realtime';
      if (['day', 'week', 'month'].includes(mode)) window.calendar = mode as 'day' | 'week' | 'month';
      else delete window.calendar;
      if (mode === 'fixed' && (!Number.isFinite(window.startTs) || !Number.isFinite(window.endTs))) {
        window.endTs = Date.now();
        window.startTs = window.endTs - window.durationMs;
      }
    },
  });
  const historical = computed(() =>
    ['valueChart', 'timeseries', 'table', 'bar', 'range', 'aggregate', 'state'].includes(
      draft.value?.config.native.family,
    ),
  );
  watch(
    () => [props.visible, props.source],
    () => {
      generation++;
      preview.value = null;
      message.value = '';
      mode.value = 'basic';
      previewVisible.value = false;
      availableKeys.value = {};
      keyMessages.value = {};
      keyLoading.value = {};
      if (!props.visible) return;
      try {
        draft.value = createNativeWidget(props.source);
        draft.value.config.native = withNativeSettings(draft.value.config.native);
      } catch (e: any) {
        draft.value = null;
        message.value = e.message;
        return;
      }
      draft.value.config.showTitle ??= true;
      draft.value.config.native.window.startTs ??= Date.now() - 3600000;
      draft.value.config.native.window.endTs ??= Date.now();
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
        keyTypes.value[s.entityId] =
          s.dataKeys[0]?.type === 'attribute' ? s.dataKeys[0].scope || 'SERVER_SCOPE' : 'timeseries';
        void loadKeys(s);
      });
      if (!props.lockedEntity) {
        void searchEntities(0);
        void loadProfiles();
      }
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
    if (
      !draft.value ||
      sources.value.length >= 8 ||
      sources.value.some((source) => source.entityId === entity.id.id && source.entityType === entityType.value)
    )
      return;
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
    previewVisible.value = true;
  }
  function confirm() {
    if (!valid()) return;
    draft.value!.config.title = draft.value!.title;
    emit('confirm', JSON.parse(JSON.stringify(draft.value)));
  }
  function selectEntity(id: string) {
    const entity = entities.value.find((entry) => entry.id.id === id);
    if (entity) addSource(entity);
  }
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  function searchOptions(value: string) {
    query.value = value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void searchEntities(0), 250);
  }
  onBeforeUnmount(() => clearTimeout(searchTimer));
  function seriesOptions(key: any) {
    return nativeSeriesSettings(key, draft.value!.config.native);
  }
  function rebindAxis(id: string, replacement: string) {
    for (const source of sources.value)
      for (const key of source.dataKeys) {
        if (seriesOptions(key).axisId === id)
          key.settings = { ...key.settings, native: { ...seriesOptions(key), axisId: replacement } };
      }
  }
  function seriesToggles(key: any) {
    const common = [
      ['hidden', '默认隐藏'],
      ['showLabel', '显示数值标签'],
    ];
    return seriesOptions(key).type === 'line'
      ? [
          ...(draft.value!.config.native.family === 'state' ? [] : [['smooth', '平滑曲线']]),
          ['showPoints', '显示数据点'],
          ['area', '填充面积'],
          ...common,
        ]
      : common;
  }
  function setSeries(key: any, field: string, event: Event) {
    const target = event.target as HTMLInputElement;
    let value: any =
      target.type === 'checkbox' ? target.checked : target.type === 'number' ? Number(target.value) : target.value;
    if (field === 'step' && value === 'false') value = false;
    key.settings = { ...key.settings, native: { ...seriesOptions(key), [field]: value } };
  }
  function durationLabel() {
    const minutes = Number(draft.value?.config.native.window.durationMs) / 60000;
    return minutes >= 1440 ? minutes / 1440 + ' 天' : minutes >= 60 ? minutes / 60 + ' 小时' : minutes + ' 分钟';
  }
  function localDate(ts: number) {
    if (ts == null || !Number.isFinite(ts)) return '';
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
    background: #13263699;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: #263742;
  }
  .nw-dialog {
    position: relative;
    width: min(1060px, 100%);
    height: min(920px, 94vh);
    display: flex;
    flex-direction: column;
    background: #f3f6f8;
    border-radius: 5px;
    box-shadow: 0 20px 70px #0005;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
    background: #30577f;
    color: white;
    flex-shrink: 0;
    min-height: 64px;
  }
  header strong {
    font-size: 20px;
  }
  .nw-header-actions,
  .nw-footer-actions,
  .nw-inline {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .nw-header-actions > button {
    background: transparent;
    color: white;
    border: 0;
    font-size: 24px;
  }
  .nw-segment {
    display: flex;
    border-radius: 20px;
    background: #26486b;
    padding: 3px;
  }
  .nw-segment button {
    border: 0;
    background: transparent;
    color: #d0dfed;
    border-radius: 20px;
    padding: 5px 14px;
  }
  .nw-segment button.active {
    background: white;
    color: #30577f;
  }
  .nw-content {
    overflow: auto;
    flex: 1;
    min-height: 0;
    padding: 18px;
  }
  .nw-panel {
    background: white;
    padding: 18px;
    border-radius: 5px;
    margin-bottom: 16px;
  }
  h3 {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .nw-tag {
    font-size: 13px;
    font-weight: 400;
    border: 1px solid #d1dae0;
    color: #30577f;
    border-radius: 18px;
    padding: 4px 12px;
  }
  .nw-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 13px;
    color: #566670;
    margin-bottom: 10px;
  }
  input,
  select,
  button {
    font: inherit;
    color: #344857;
    border: 1px solid #d5dce0;
    border-radius: 4px;
    background: white;
    padding: 8px;
    min-width: 0;
    max-width: 100%;
  }
  button {
    cursor: pointer;
    color: #30577f;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  input[type='checkbox'] {
    accent-color: #30577f;
    width: 18px;
    height: 18px;
  }
  input[type='color'] {
    width: 42px;
    min-width: 42px;
    height: 36px;
    padding: 3px;
  }
  .nw-check {
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }
  .nw-primary {
    background: #30577f;
    color: #fff;
    border-color: #30577f;
  }
  .nw-entity-select {
    width: 100%;
  }
  .nw-key-select {
    width: 260px;
    max-width: 100%;
    margin-top: 12px;
  }
  .nw-pages {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    align-items: center;
    margin-top: 8px;
    font-size: 12px;
  }
  .nw-pages button {
    padding: 4px 8px;
  }
  .nw-source-chip {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    background: #eaf0f4;
    border-radius: 18px;
    padding: 4px 10px;
    margin: 8px 8px 0 0;
  }
  .nw-source-chip button {
    border: 0;
    background: transparent;
    padding: 0;
  }
  .nw-source {
    padding: 12px 0;
    border-top: 1px solid #e4e8eb;
  }
  .nw-source-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .nw-note {
    color: #74838e;
    font-size: 12px;
    margin: 10px 0 0;
  }
  .nw-table-scroll {
    overflow: auto;
  }
  .nw-key-table {
    border-collapse: collapse;
    min-width: 680px;
    width: 100%;
    font-size: 13px;
  }
  .nw-key-table th {
    font-weight: 400;
    color: #7a848c;
    text-align: left;
    border-bottom: 1px solid #dde3e7;
    padding: 10px 6px;
  }
  .nw-key-table td {
    padding: 10px 6px;
    border-bottom: 1px solid #edf0f2;
  }
  .nw-key-table input:not([type='color']) {
    width: 100%;
    min-width: 50px;
  }
  .nw-key-table input[type='number'] {
    width: 66px;
  }
  .nw-key-table select {
    max-width: 130px;
  }
  .nw-key-name {
    display: block;
    padding: 6px 10px;
    border-radius: 16px;
    background: #edf0f2;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nw-threshold {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  .nw-threshold input[type='number'] {
    flex: 1;
    width: 100%;
  }
  .nw-time,
  .nw-series-detail {
    border: 1px solid #dfe5e9;
    border-radius: 5px;
    padding: 12px;
  }
  .nw-series-detail {
    margin: 10px 0;
  }
  summary {
    cursor: pointer;
    color: #30577f;
    font-size: 14px;
  }
  details[open] > summary {
    margin-bottom: 18px;
  }
  footer {
    display: flex;
    gap: 16px;
    align-items: center;
    padding: 14px 18px;
    background: white;
    flex-shrink: 0;
    border-top: 1px solid #e2e7ea;
  }
  .nw-footer-actions {
    margin-left: auto;
  }
  .nw-submit-error {
    flex: 1;
    max-height: 70px;
    overflow: auto;
    margin: 0;
  }
  .nw-error {
    color: #b72923;
    font-size: 13px;
    padding: 8px;
  }
  .nw-preview-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: #f3f6f8;
    display: flex;
    flex-direction: column;
  }
  .nw-preview {
    flex: 1;
    min-height: 0;
    padding: 24px;
    background:
      radial-gradient(ellipse at 10% 20%, #236b79, transparent 55%), linear-gradient(125deg, #0b1828, #244533);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nw-preview > section {
    height: 100%;
    max-height: 540px;
    width: 100%;
    padding: 16px;
    overflow: hidden;
  }
  .nw-preview-footer {
    display: flex;
    justify-content: space-between;
    padding: 16px;
  }
  @media (max-width: 650px) {
    .nw-mask {
      padding: 6px;
    }
    .nw-dialog {
      height: 96vh;
    }
    .nw-content {
      padding: 10px;
    }
    .nw-panel {
      padding: 12px;
    }
    .nw-fields {
      grid-template-columns: 1fr;
    }
    header {
      padding: 12px;
    }
    header strong {
      font-size: 16px;
    }
    .nw-source-header {
      flex-direction: column;
      align-items: stretch;
    }
    .nw-preview {
      padding: 12px;
    }
  }
</style>
