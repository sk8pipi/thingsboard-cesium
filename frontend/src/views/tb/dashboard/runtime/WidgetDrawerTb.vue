<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    title="部件库"
    direction="rtl"
    :size="drawerSize"
    :with-header="true"
  >
    <div class="tb-wlib">
      <!-- 左：分类（Widgets Bundles） -->
      <div class="tb-wlib-left">
        <div class="tb-wlib-left-header">
          <div class="tb-wlib-left-title">分类</div>

          <el-segmented
            v-if="enableTenantMode"
            v-model="sysMode"
            :options="segOptions"
            size="small"
            class="tb-wlib-seg"
          />
        </div>

        <el-input
          v-model="bundleSearch"
          size="small"
          placeholder="搜索分类"
          clearable
          class="tb-wlib-left-search"
          @input="reloadBundlesDebounced"
        />

        <el-scrollbar class="tb-wlib-left-scroll">
          <div v-if="bundlesLoading" class="p-2">
            <el-skeleton :rows="8" animated />
          </div>

          <template v-else>
            <div
              v-for="b in filteredBundles"
              :key="b.id.id"
              class="tb-bundle-item"
              :class="{ active: b.alias === activeBundleAlias }"
              @click="selectBundle(b)"
            >
              <div class="tb-bundle-title">{{ b.title }}</div>
              <div class="tb-bundle-sub">{{ b.alias }}</div>
            </div>

            <el-empty v-if="!filteredBundles.length" description="没有分类" :image-size="80" />
          </template>
        </el-scrollbar>
      </div>

      <!-- 右：部件列表（Widget Types） -->
      <div class="tb-wlib-right">
        <div class="tb-wlib-right-header">
          <div class="tb-wlib-right-title">
            {{ activeBundleTitle || '请选择分类' }}
          </div>

          <div class="tb-wlib-right-tools">
            <el-input
              v-model="widgetSearch"
              size="small"
              placeholder="搜索部件"
              clearable
              @input="reloadWidgetTypesDebounced"
              class="tb-wlib-widget-search"
            />
            <el-button size="small" @click="reloadWidgetTypes" :loading="widgetsLoading">刷新</el-button>
          </div>
        </div>

        <el-scrollbar class="tb-wlib-right-scroll">
          <div v-if="!activeBundleAlias" class="tb-wlib-hint">先在左侧选择一个分类（Widgets Bundle）</div>

          <div v-else>
            <div v-if="widgetsLoading" class="p-2">
              <el-skeleton :rows="10" animated />
            </div>

            <template v-else>
              <div class="tb-widget-grid">
                <el-card
                  v-for="w in widgetTypes"
                  :key="w.id.id"
                  shadow="hover"
                  class="tb-widget-card"
                  @click="emitAdd(w)"
                >
                  <div class="tb-widget-card-top">
                    <img v-if="resolveImg(w.image)" class="tb-widget-img" :src="resolveImg(w.image)!" alt="" />
                    <div v-else class="tb-widget-img placeholder">TB</div>

                    <div class="tb-widget-meta">
                      <div class="tb-widget-name">{{ w.name }}</div>
                      <div class="tb-widget-alias">{{ w.alias }}</div>

                      <div class="tb-widget-tags">
                        <span class="tb-tag">{{ normalizeType(w.type) }}</span>
                        <span class="tb-tag sub">{{ w.bundleAlias }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="tb-widget-desc">
                    {{ w.description || '暂无描述' }}
                  </div>

                  <div class="tb-widget-card-actions">
                    <el-button size="small" type="primary" @click.stop="emitAdd(w)">添加</el-button>
                  </div>
                </el-card>
              </div>

              <el-empty v-if="!widgetTypes.length" description="该分类下没有部件" :image-size="90" />
            </template>
          </div>
        </el-scrollbar>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { getAllWidgetsBundles, getWidgetTypes, type TbWidgetType, type TbWidgetsBundle } from './tbWidgetApi';

  const LOCAL_BUNDLE_ALIAS = '__local__';

  const localWidgetTypes: TbWidgetType[] = [
    {
      id: { id: 'local-cesium3d' } as any,
      name: '三维地图（Cesium）',
      alias: 'cesium3d',
      bundleAlias: LOCAL_BUNDLE_ALIAS,
      type: 'MAP',
      description: '基于 Cesium 的 3D 地图部件',
      image: '',
    } as any,
    {
      id: { id: 'local-chart' } as any,
      name: '图表（ECharts）',
      alias: 'chart',
      bundleAlias: LOCAL_BUNDLE_ALIAS,
      type: 'CHART',
      description: '基于 Apache ECharts 的图表部件',
      image: '',
    } as any,
  ];

  // ✅ 暂时不需要自定义：关闭入口
  const enableTenantMode = false as const;

  // ✅ 强制永远走 system
  const sysMode = ref<'system'>('system');

  // 下面这两个即使保留也无所谓（但不会显示、也不会切换）
  const segOptions = [
    { label: '系统', value: 'system' },
    { label: '自定义', value: 'tenant' },
  ] as const;
  const drawerSize = computed(() => {
    // 2/5 屏幕 = 40vw，同时给个最小/最大，避免太窄/太宽
    return '40vw';
  });
  const props = defineProps<{ modelValue: boolean }>();
  const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void;
    (e: 'add', w: TbWidgetType): void;
  }>();

  // ====== 左侧：分类 ======
  const bundlesLoading = ref(false);
  const bundles = ref<TbWidgetsBundle[]>([]);
  const bundleSearch = ref('');

  // 当前选中 bundle
  const activeBundleAlias = ref<string>('');
  const activeBundleTitle = ref<string>('');
  const activeBundleIsSystem = computed(() => sysMode.value === 'system');

  const filteredBundles = computed(() => {
    const kw = bundleSearch.value.trim().toLowerCase();
    const list = bundles.value.filter((b) => {
      const isSys = !b.tenantId;
      if (!isSys) return false; // 只展示系统 bundle

      if (!kw) return true;
      return ((b.title || '').toLowerCase().includes(kw) || b.alias || '').toLowerCase().includes(kw);
    });

    // 排序：title
    return list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  });

  async function reloadBundles() {
    bundlesLoading.value = true;
    try {
      const remote = await getAllWidgetsBundles('');
      bundles.value = Array.isArray(remote) ? remote : [];

      // ✅ 插入本地分类（永远在最前）
      bundles.value.unshift({
        id: { id: LOCAL_BUNDLE_ALIAS } as any,
        alias: LOCAL_BUNDLE_ALIAS,
        title: '本地部件',
        tenantId: null as any,
      } as any);

      const first = filteredBundles.value[0];
      if (first) {
        selectBundle(first);
      } else {
        activeBundleAlias.value = '';
        activeBundleTitle.value = '';
        widgetTypes.value = [];
      }
    } finally {
      bundlesLoading.value = false;
    }
  }

  function selectBundle(b: TbWidgetsBundle) {
    activeBundleAlias.value = b.alias;
    activeBundleTitle.value = b.title;
    widgetSearch.value = '';
    reloadWidgetTypes();
  }

  // ====== 右侧：部件列表 ======
  const widgetsLoading = ref(false);
  const widgetTypes = ref<TbWidgetType[]>([]);
  const widgetSearch = ref('');

  async function reloadWidgetTypes() {
    if (!activeBundleAlias.value) return;

    // ✅ 本地分类：不请求后端，直接给本地两个部件
    if (activeBundleAlias.value === LOCAL_BUNDLE_ALIAS) {
      const kw = widgetSearch.value.trim().toLowerCase();
      const list = !kw
        ? localWidgetTypes
        : localWidgetTypes.filter(
            (w) =>
              (w.name || '').toLowerCase().includes(kw) ||
              (w.alias || '').toLowerCase().includes(kw) ||
              (w.description || '').toLowerCase().includes(kw),
          );
      widgetTypes.value = list.slice();
      return;
    }

    widgetsLoading.value = true;
    try {
      const list = await getWidgetTypes({
        isSystem: activeBundleIsSystem.value,
        bundleAlias: activeBundleAlias.value,
        textSearch: widgetSearch.value.trim() || undefined,
      });
      widgetTypes.value = (list || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } finally {
      widgetsLoading.value = false;
    }
  }

  function emitAdd(w: TbWidgetType) {
    emit('add', w);
  }

  // ====== 图片处理（TB 返回可能是 base64，也可能是 data:...）======
  function resolveImg(img?: string) {
    if (!img) return '';
    if (img.startsWith('data:')) return img;
    // 很多 TB 字段是 base64（不带前缀）
    return `data:image/png;base64,${img}`;
  }

  function normalizeType(t?: string) {
    const v = (t || '').toLowerCase();
    if (!v) return 'unknown';
    return v;
  }

  // ====== 简单防抖（不用额外库）======
  let t1: any = null;
  function debounce(fn: () => void, ms = 250) {
    return () => {
      if (t1) clearTimeout(t1);
      t1 = setTimeout(fn, ms);
    };
  }
  const reloadBundlesDebounced = debounce(() => reloadBundles(), 300);
  const reloadWidgetTypesDebounced = debounce(() => reloadWidgetTypes(), 300);

  // 打开抽屉时再加载（省请求）
  watch(
    () => props.modelValue,
    (open) => {
      if (open) {
        // 每次打开都刷新一下分类（你也可以只第一次加载）
        reloadBundles();
      }
    },
    { immediate: false },
  );

  // 切换 系统/自定义 时：默认选择对应分类第一个
  watch(
    () => sysMode.value,
    () => {
      const first = filteredBundles.value[0];
      if (!enableTenantMode) return;
      else {
        activeBundleAlias.value = '';
        activeBundleTitle.value = '';
        widgetTypes.value = [];
      }
    },
  );

  onMounted(() => {
    // 如果你希望首次就预热，可打开这一句
    // reloadBundles();
  });
</script>

<style scoped>
  .tb-wlib {
    display: flex;
    gap: 12px;
    height: 100%;
    min-height: 0;
  }

  .tb-wlib-left {
    width: 160px;
    min-width: 160px;
    border-right: 1px solid #eee;
    padding-right: 10px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .tb-wlib-left-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 8px;
  }
  .tb-wlib-left-title {
    font-weight: 700;
  }
  .tb-wlib-left-search {
    margin-bottom: 8px;
  }
  .tb-wlib-left-scroll {
    flex: 1;
    min-height: 0;
  }

  .tb-bundle-item {
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    margin-bottom: 6px;
    border: 1px solid transparent;
  }
  .tb-bundle-item:hover {
    background: #f6f7fb;
  }
  .tb-bundle-item.active {
    background: #eef2ff;
    border-color: #c7d2fe;
  }
  .tb-bundle-title {
    font-size: 13px;
    font-weight: 700;
  }
  .tb-bundle-sub {
    font-size: 12px;
    opacity: 0.7;
  }

  .tb-wlib-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .tb-wlib-right-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }
  .tb-wlib-right-title {
    font-weight: 700;
  }
  .tb-wlib-right-tools {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tb-wlib-widget-search {
    width: 220px;
  }
  .tb-wlib-right-scroll {
    flex: 1;
    min-height: 0;
  }
  .tb-wlib-hint {
    padding: 18px;
    opacity: 0.7;
  }

  .tb-widget-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 2px;
  }

  .tb-widget-card {
    cursor: pointer;
    border-radius: 12px;
  }

  .tb-widget-card-top {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .tb-widget-img {
    width: 56px;
    height: 56px;
    object-fit: cover;
    border-radius: 10px;
    border: 1px solid #eee;
  }
  .tb-widget-img.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    opacity: 0.5;
    background: #f6f7fb;
  }

  .tb-widget-meta {
    flex: 1;
    min-width: 0;
  }
  .tb-widget-name {
    font-weight: 800;
    font-size: 13px;
    line-height: 18px;
    margin-bottom: 2px;
  }
  .tb-widget-alias {
    font-size: 12px;
    opacity: 0.7;
    word-break: break-all;
  }
  .tb-widget-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  .tb-tag {
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid #e5e7eb;
    background: #f8fafc;
  }
  .tb-tag.sub {
    opacity: 0.7;
  }

  .tb-widget-desc {
    margin-top: 10px;
    font-size: 12px;
    opacity: 0.75;
    min-height: 32px;
  }

  .tb-widget-card-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
  }
</style>
