<template>
  <section class="native-browser" aria-label="原生部件浏览器">
    <header class="nb-header">
      <button v-if="selectedBundle || allWidgets" type="button" aria-label="返回部件包" @click="back">←</button>
      <strong>{{
        selectedBundle ? `${selectedBundle.title}：选择部件` : allWidgets ? '所有原生部件' : '选择部件包'
      }}</strong>
      <button v-if="!selectedBundle && !allWidgets" type="button" @click="openAll">所有部件</button>
    </header>
    <div class="nb-tools">
      <input
        v-if="!selectedBundle && !allWidgets"
        v-model="bundleQuery"
        type="search"
        aria-label="搜索部件包"
        placeholder="搜索部件包"
      />
      <template v-else>
        <input v-model="query" type="search" aria-label="搜索部件" placeholder="搜索名称、标签或标识" />
        <div class="nb-filters">
          <select v-model="type" aria-label="部件类型">
            <option value="">全部类型</option>
            <option v-for="(label, key) in nativeWidgetTypeLabels" :key="key" :value="key">{{ label }}</option>
          </select>
          <select v-model="deprecated" aria-label="弃用状态">
            <option value="all">全部</option
            ><option value="current">当前</option
            ><option value="deprecated">弃用</option>
          </select>
        </div>
      </template>
    </div>
    <p v-if="usingProjection" class="nb-notice" role="status"
      >当前显示内置的 ThingsBoard 部件目录。部分原图需要资源服务可用，能否添加以适配状态为准。</p
    >
    <p v-if="error" class="nb-error" role="alert"
      >{{ error }} <button type="button" @click="retry">重试</button>
      <button v-if="selectedBundle && !widgetLocal && localSelectedBundle" type="button" @click="useLocalBundle"
        >使用本地系统目录</button
      >
    </p>
    <p v-if="loading" class="nb-notice" role="status">正在同步服务器原生资源…</p>
    <div ref="list" class="nb-list">
      <div v-if="!selectedBundle && !allWidgets" class="nb-grid">
        <article
          v-for="bundle in shownBundles"
          :key="bundle.alias"
          class="nb-card"
          role="button"
          tabindex="0"
          :aria-label="bundle.title"
          @click="openBundle(bundle)"
          @keydown.enter="openBundle(bundle)"
          @keydown.space.prevent="openBundle(bundle)"
        >
          <div class="nb-card-title"
            ><strong>{{ bundle.title }}</strong
            ><span>sys</span></div
          >
          <WidgetPreviewImage :source="bundle.image" :title="bundle.title" />
          <small>{{ nativeBundleTitles[bundle.alias] || bundle.title }}</small>
          <span class="nb-info" :title="bundle.description || bundle.title" aria-label="部件包说明">ⓘ</span>
        </article>
      </div>
      <template v-else>
        <p class="nb-count">{{ filtered.length }} 个部件 · 原图展示，实际能力以适配状态为准</p>
        <div class="nb-grid">
          <article
            v-for="entry in shownWidgets"
            :key="entry.fqn"
            class="nb-card"
            :class="{ 'nb-pending': !canSelect(entry) }"
            role="button"
            :tabindex="canSelect(entry) ? 0 : -1"
            :aria-disabled="!canSelect(entry) || selecting"
            :aria-label="entry.name"
            @click="selectWidget(entry)"
            @keydown.enter="selectWidget(entry)"
            @keydown.space.prevent="selectWidget(entry)"
          >
            <div class="nb-card-title"
              ><strong>{{ entry.name }}</strong
              ><span>{{ nativeWidgetTypeLabels[entry.type] || entry.type }}</span></div
            >
            <WidgetPreviewImage :source="entry.image" :title="entry.name" />
            <small
              >{{ entry.unresolved ? '资源引用 · 待适配' : getNativeWidgetSupport(entry.source).label
              }}{{ entry.deprecated ? ' · 已弃用' : '' }}</small
            >
            <span
              class="nb-info"
              :title="entry.description || getNativeWidgetSupport(entry.source).reason"
              aria-label="部件说明"
              >ⓘ</span
            >
          </article>
        </div>
        <footer v-if="filtered.length > pageSize" class="nb-pagination">
          <button type="button" :disabled="page === 0" @click="page--">上一页</button>
          <span>{{ page + 1 }} / {{ Math.ceil(filtered.length / pageSize) }}</span>
          <button type="button" :disabled="(page + 1) * pageSize >= filtered.length" @click="page++">下一页</button>
        </footer>
      </template>
      <p
        v-if="
          (!shownBundles.length && !selectedBundle && !allWidgets) ||
          ((selectedBundle || allWidgets) && !filtered.length)
        "
        class="nb-empty"
        >没有匹配的部件，请调整搜索或筛选。</p
      >
    </div>
    <p v-if="selecting" class="nb-notice" role="status">正在读取完整部件定义…</p>
  </section>
</template>
<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { widgetsBundles } from '/@/api/tb/widgetsBundle';
  import { getBundleWidgetTypes, getWidgetTypeById, getWidgetType, getWidgetTypeList } from '/@/api/tb/widgetType';
  import WidgetPreviewImage from '../../../widgetsLibrary/WidgetPreviewImage.vue';
  import { getNativeWidgetSupport } from './nativeWidgetCatalog';
  import {
    filterBrowseWidgets,
    isSystemResource,
    localBundleWidgets,
    mergeBrowseWidgets,
    mergeNativeBundles,
    nativeBundleTitles,
    nativeWidgetBundles,
    nativeWidgetTypeLabels,
    serverBundles,
    toBrowseWidget,
  } from './nativeWidgetBrowse';
  import type { NativeBrowseBundle, NativeBrowseWidget } from './nativeWidgetBrowse';

  const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
  const emit = defineEmits<{ (e: 'select', source: Record<string, any>): void }>();
  const bundles = ref<NativeBrowseBundle[]>(nativeWidgetBundles);
  const selectedBundle = ref<NativeBrowseBundle>();
  const allWidgets = ref(false);
  const entries = ref<NativeBrowseWidget[]>([]);
  const bundleQuery = ref('');
  const query = ref('');
  const type = ref('');
  const deprecated = ref('current');
  const page = ref(0);
  const pageSize = 24;
  const loading = ref(false);
  const selecting = ref(false);
  const error = ref('');
  const bundleLocal = ref(true);
  const widgetLocal = ref(true);
  const list = ref<HTMLElement>();
  let bundleScroll = 0;
  let initialized = false;
  let generation = 0;
  const usingProjection = computed(() =>
    selectedBundle.value || allWidgets.value
      ? entries.value.some((entry) => entry.local)
      : bundles.value.some((bundle) => !bundle.id),
  );
  const localSelectedBundle = computed(() =>
    nativeWidgetBundles.find((bundle) => bundle.alias === selectedBundle.value?.alias),
  );
  const shownBundles = computed(() =>
    bundles.value.filter((bundle) =>
      `${bundle.title} ${bundle.alias} ${nativeBundleTitles[bundle.alias] || ''}`
        .toLowerCase()
        .includes(bundleQuery.value.trim().toLowerCase()),
    ),
  );
  const filtered = computed(() => filterBrowseWidgets(entries.value, query.value, type.value, deprecated.value));
  const shownWidgets = computed(() => filtered.value.slice(page.value * pageSize, (page.value + 1) * pageSize));
  watch([query, type, deprecated], () => {
    page.value = 0;
  });
  watch(page, () => {
    if (list.value) list.value.scrollTop = 0;
  });
  watch(
    () => props.active,
    (active) => {
      if (active && !initialized) void loadBundles();
      if (!active) {
        generation++;
        selecting.value = false;
        loading.value = false;
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
  });

  async function loadBundles() {
    const current = ++generation;
    loading.value = true;
    error.value = '';
    try {
      const sources = await widgetsBundles();
      if (!Array.isArray(sources)) throw new Error('Invalid bundle response');
      if (current !== generation) return;
      const system = serverBundles(sources);
      bundles.value = mergeNativeBundles(system);
      bundleLocal.value = !system.length;
    } catch {
      if (current !== generation) return;
      bundles.value = nativeWidgetBundles;
      bundleLocal.value = true;
      error.value = '服务器部件包暂不可用，已显示本地系统目录。';
    } finally {
      if (current === generation) {
        loading.value = false;
        initialized = true;
      }
    }
  }
  async function openBundle(bundle: NativeBrowseBundle) {
    bundleScroll = list.value?.scrollTop || 0;
    selectedBundle.value = bundle;
    allWidgets.value = false;
    page.value = 0;
    await loadWidgets();
  }
  async function openAll() {
    bundleScroll = list.value?.scrollTop || 0;
    selectedBundle.value = undefined;
    allWidgets.value = true;
    page.value = 0;
    await loadWidgets();
  }
  async function back() {
    generation++;
    selectedBundle.value = undefined;
    allWidgets.value = false;
    selecting.value = false;
    loading.value = false;
    error.value = '';
    await nextTick();
    if (list.value) list.value.scrollTop = bundleScroll;
  }
  function useLocalBundle() {
    if (!localSelectedBundle.value) return;
    generation++;
    entries.value = localBundleWidgets(localSelectedBundle.value);
    widgetLocal.value = true;
    loading.value = false;
    error.value = '';
  }
  async function loadWidgets() {
    const current = ++generation;
    loading.value = true;
    error.value = '';
    const localEntries = localBundleWidgets(selectedBundle.value);
    entries.value = localEntries;
    widgetLocal.value = true;
    try {
      if (bundleLocal.value) return;
      let sources: Record<string, any>[];
      if (selectedBundle.value) {
        if (!selectedBundle.value.id) return;
        sources = await getBundleWidgetTypes(selectedBundle.value.id);
      } else {
        sources = [];
        let nextPage = 0;
        let hasNext = true;
        while (hasNext && current === generation) {
          const response = await getWidgetTypeList({
            pageSize: 100,
            page: nextPage++,
            tenantOnly: false,
            sortProperty: 'name',
            sortOrder: 'ASC',
          });
          if (!Array.isArray(response.data)) throw new Error('Invalid widget response');
          sources.push(...response.data.filter(isSystemResource));
          hasNext = !!response.hasNext;
        }
      }
      if (!Array.isArray(sources)) throw new Error('Invalid widget response');
      if (current === generation) {
        entries.value = mergeBrowseWidgets(localEntries, sources);
        widgetLocal.value = !sources.length;
      }
    } catch {
      if (current === generation) error.value = '服务器部件列表暂不可用，已显示本地系统目录。';
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  function canSelect(entry: NativeBrowseWidget) {
    return !entry.unresolved && getNativeWidgetSupport(entry.source).supported;
  }
  async function selectWidget(entry: NativeBrowseWidget) {
    if (!canSelect(entry) || selecting.value || !props.active) return;
    const current = ++generation;
    selecting.value = true;
    error.value = '';
    try {
      const id = entry.source.id?.id || entry.source.id;
      const source = entry.local
        ? entry.source
        : id
          ? await getWidgetTypeById(id, true)
          : await getWidgetType(`system.${entry.fqn}`);
      if (current !== generation) return;
      const support = getNativeWidgetSupport(source);
      if (!support.supported) {
        error.value = support.reason;
        return;
      }
      emit('select', source);
    } catch {
      if (current === generation) error.value = '无法读取完整部件定义，请重试后再选择。';
    } finally {
      if (current === generation) selecting.value = false;
    }
  }
  function retry() {
    if (selectedBundle.value || allWidgets.value) void loadWidgets();
    else void loadBundles();
  }
</script>
<style scoped>
  .native-browser {
    color: #263238;
    background: #cfd8dc;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
  .native-browser > :not(.nb-list) {
    flex: 0 0 auto;
  }
  .nb-header {
    display: flex;
    align-items: center;
    gap: 10px;
    color: white;
    background: #30577e;
    padding: 12px;
  }
  .nb-header strong {
    flex: 1;
    font-size: 16px;
  }
  button,
  input,
  select {
    font: inherit;
    border: 1px solid #bdc8d1;
    border-radius: 5px;
    padding: 7px 9px;
  }
  button {
    cursor: pointer;
    color: #30577e;
    background: white;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .nb-header button {
    color: white;
    background: transparent;
    border-color: #ffffff50;
  }
  .nb-tools {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
  }
  .nb-tools input {
    width: 100%;
    min-width: 0;
    color: #263238;
    background: white;
  }
  .nb-filters {
    display: flex;
    gap: 8px;
  }
  .nb-filters select {
    min-width: 0;
    flex: 1;
    color: #263238;
    background: white;
  }
  .nb-list {
    padding: 0 12px 12px;
    overflow: auto;
    min-height: 0;
    flex: 1 1 auto;
    overscroll-behavior: contain;
  }
  .nb-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .nb-card {
    position: relative;
    cursor: pointer;
    min-width: 0;
    background: white;
    border-radius: 5px;
    border: 1px solid #bdc8d1;
    box-shadow: 0 1px 3px #26323825;
    padding: 10px;
  }
  .nb-card:hover,
  .nb-card:focus-visible {
    outline: 2px solid #527aa0;
    outline-offset: -2px;
  }
  .nb-pending {
    cursor: default;
  }
  .nb-card-title {
    display: flex;
    gap: 5px;
    min-height: 38px;
    align-items: flex-start;
  }
  .nb-card-title strong {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .nb-card-title span {
    font-size: 10px;
    background: #f1f3f4;
    color: #64748b;
    padding: 1px 4px;
    border-radius: 3px;
    white-space: nowrap;
  }
  .nb-card :deep(.widget-preview-image) {
    width: 100%;
    height: 140px;
  }
  .nb-card small {
    display: block;
    font-size: 11px;
    margin-top: 8px;
    padding-right: 18px;
    color: #64748b;
  }
  .nb-info {
    position: absolute;
    right: 10px;
    bottom: 9px;
    color: #7693b0;
  }
  .nb-notice,
  .nb-error,
  .nb-count,
  .nb-empty {
    margin: 0;
    padding: 8px 12px;
    font-size: 12px;
    line-height: 1.6;
  }
  .nb-notice {
    background: #eaf2fa;
    color: #30577e;
  }
  .nb-error {
    color: #a32626;
    background: #fff1ed;
  }
  .nb-error button {
    margin: 3px;
    padding: 2px 6px;
  }
  .nb-count {
    padding: 0 0 8px;
    color: #526777;
  }
  .nb-empty {
    text-align: center;
    padding: 24px 12px;
  }
  .nb-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 12px 0 0;
    font-size: 12px;
  }
  @media (max-width: 420px) {
    .nb-card :deep(.widget-preview-image) {
      height: 110px;
    }
  }
</style>
