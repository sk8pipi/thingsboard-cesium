<template>
  <div class="map-asset-selector">
    <APopover v-model:open="popoverOpen" placement="bottomRight" trigger="click">
      <template #content>
        <section class="map-asset-selector__panel" aria-label="资产点位筛选">
          <header class="map-asset-selector__panel-header">
            <strong>按资产显示点位</strong>
            <span>{{ visiblePointCount }}/{{ totalPointCount }} 个点位</span>
          </header>

          <input
            v-model="searchText"
            class="map-asset-selector__search"
            type="search"
            placeholder="搜索资产名称、标签或类型"
            aria-label="搜索资产"
          />

          <div v-if="error" class="map-asset-selector__error" role="alert">
            <span>{{ error }}</span>
            <button type="button" @click="emit('retry')">重试</button>
          </div>

          <div v-if="catalogLoading" class="map-asset-selector__state">
            <Icon icon="ant-design:loading-outlined" :size="18" />
            <span>正在加载资产目录…</span>
          </div>

          <div v-else class="map-asset-selector__options" role="listbox" aria-label="可选资产">
            <button
              type="button"
              class="map-asset-selector__option"
              :class="{ 'map-asset-selector__option--selected': !selectedAssetId }"
              role="option"
              :aria-selected="!selectedAssetId"
              @click="selectAsset('')"
            >
              <Icon icon="ant-design:global-outlined" :size="18" />
              <span class="map-asset-selector__option-copy">
                <strong>全部资产</strong>
                <small>显示当前大屏的全部传感器和监控点位</small>
              </span>
            </button>

            <button
              v-for="asset in filteredAssets"
              :key="asset.id"
              type="button"
              class="map-asset-selector__option"
              :class="{ 'map-asset-selector__option--selected': selectedAssetId === asset.id }"
              role="option"
              :aria-selected="selectedAssetId === asset.id"
              @click="selectAsset(asset.id)"
            >
              <Icon icon="ant-design:apartment-outlined" :size="18" />
              <span class="map-asset-selector__option-copy">
                <strong>{{ asset.name }}</strong>
                <small v-if="asset.description">{{ asset.description }}</small>
              </span>
            </button>

            <div v-if="!filteredAssets.length" class="map-asset-selector__state">
              {{ assets.length ? '没有匹配的资产' : '当前权限范围内没有资产' }}
            </div>
          </div>

          <footer v-if="resolving" class="map-asset-selector__resolving">
            <Icon icon="ant-design:loading-outlined" :size="16" />
            <span>正在解析资产下的设备关系…</span>
          </footer>
        </section>
      </template>

      <button
        class="map-asset-selector__trigger"
        :class="{
          'map-asset-selector__trigger--active': Boolean(selectedAssetId),
          'map-asset-selector__trigger--error': Boolean(error),
        }"
        type="button"
        :title="triggerTitle"
        aria-label="按资产显示点位"
      >
        <Icon
          :icon="resolving || catalogLoading ? 'ant-design:loading-outlined' : 'ant-design:apartment-outlined'"
          :size="18"
        />
        <span class="map-asset-selector__trigger-name">{{ selectedAssetName }}</span>
        <span class="map-asset-selector__trigger-count">{{ visiblePointCount }}/{{ totalPointCount }}</span>
        <Icon icon="ant-design:down-outlined" :size="12" />
      </button>
    </APopover>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { Popover as APopover } from 'ant-design-vue';
  import { Icon } from '/@/components/Icon';

  interface MapAssetSelectorOption {
    id: string;
    name: string;
    description?: string;
  }

  const props = withDefaults(
    defineProps<{
      assets?: readonly MapAssetSelectorOption[];
      selectedAssetId?: string;
      catalogLoading?: boolean;
      resolving?: boolean;
      error?: string;
      visiblePointCount?: number;
      totalPointCount?: number;
    }>(),
    {
      assets: () => [],
      selectedAssetId: '',
      catalogLoading: false,
      resolving: false,
      error: '',
      visiblePointCount: 0,
      totalPointCount: 0,
    },
  );

  const emit = defineEmits<{
    select: [assetId: string];
    retry: [];
  }>();

  const popoverOpen = ref(false);
  const searchText = ref('');
  const selectedAsset = computed(() => props.assets.find((asset) => asset.id === props.selectedAssetId));
  const selectedAssetName = computed(() => selectedAsset.value?.name || '全部资产');
  const triggerTitle = computed(() => {
    const state = props.error ? `；${props.error}` : props.resolving ? '；正在解析设备关系' : '';
    return `${selectedAssetName.value}：显示 ${props.visiblePointCount}/${props.totalPointCount} 个点位${state}`;
  });
  const filteredAssets = computed(() => {
    const keyword = searchText.value.trim().toLocaleLowerCase();
    if (!keyword) return props.assets;
    return props.assets.filter((asset) =>
      `${asset.name} ${asset.description || ''}`.toLocaleLowerCase().includes(keyword),
    );
  });

  function selectAsset(assetId: string) {
    emit('select', assetId);
    popoverOpen.value = false;
  }
</script>

<style scoped>
  .map-asset-selector {
    min-width: 0;
  }

  .map-asset-selector__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    max-width: 250px;
    height: var(--map-action-height, 38px);
    padding: 0 10px;
    box-sizing: border-box;
    overflow: hidden;
    color: var(--map-top-bar-muted, #a9b9c8);
    font: inherit;
    font-size: var(--map-action-font-size, 14px);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
  }

  .map-asset-selector__trigger:hover,
  .map-asset-selector__trigger:focus-visible,
  .map-asset-selector__trigger--active {
    color: var(--map-top-bar-text, #f4f7fb);
    background: rgba(54, 191, 250, 0.12);
    border-color: var(--map-top-bar-accent, #36bffa);
    outline: none;
  }

  .map-asset-selector__trigger--error {
    border-color: #ff7875;
  }

  .map-asset-selector__trigger-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .map-asset-selector__trigger-count {
    flex: 0 0 auto;
    padding: 1px 5px;
    color: #bcecff;
    font-size: 11px;
    line-height: 18px;
    background: rgba(54, 191, 250, 0.16);
    border-radius: 9px;
  }

  .map-asset-selector__panel {
    width: min(360px, calc(100vw - 32px));
    margin: -12px;
    padding: 12px;
    color: #dce9f4;
    background: rgba(7, 17, 29, 0.97);
    border: 1px solid rgba(123, 160, 191, 0.32);
    border-radius: 8px;
  }

  .map-asset-selector__panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 10px;
  }

  .map-asset-selector__panel-header strong {
    color: #f4f7fb;
    font-size: 15px;
  }

  .map-asset-selector__panel-header span {
    color: #91cfe8;
    font-size: 12px;
    white-space: nowrap;
  }

  .map-asset-selector__search {
    width: 100%;
    height: 34px;
    padding: 0 10px;
    box-sizing: border-box;
    color: #f4f7fb;
    background: rgba(7, 17, 29, 0.78);
    border: 1px solid rgba(123, 160, 191, 0.42);
    border-radius: 4px;
    outline: none;
  }

  .map-asset-selector__search:focus {
    border-color: #36bffa;
  }

  .map-asset-selector__options {
    max-height: min(420px, 54vh);
    margin-top: 8px;
    overflow: auto;
  }

  .map-asset-selector__option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 50px;
    padding: 7px 9px;
    color: #b9c9d8;
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
  }

  .map-asset-selector__option:hover,
  .map-asset-selector__option:focus-visible,
  .map-asset-selector__option--selected {
    color: #f4f7fb;
    background: rgba(54, 191, 250, 0.11);
    border-color: rgba(54, 191, 250, 0.45);
    outline: none;
  }

  .map-asset-selector__option-copy {
    min-width: 0;
    display: flex;
    flex: 1;
    flex-direction: column;
  }

  .map-asset-selector__option-copy strong,
  .map-asset-selector__option-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .map-asset-selector__option-copy small {
    margin-top: 2px;
    color: #7f96a9;
  }

  .map-asset-selector__state,
  .map-asset-selector__resolving,
  .map-asset-selector__error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    color: #8fa5b7;
    font-size: 13px;
  }

  .map-asset-selector__error {
    justify-content: space-between;
    min-height: 38px;
    margin-top: 8px;
    padding: 6px 8px;
    color: #ffb3b0;
    background: rgba(255, 77, 79, 0.1);
    border: 1px solid rgba(255, 120, 117, 0.35);
    border-radius: 4px;
  }

  .map-asset-selector__error button {
    flex: 0 0 auto;
    padding: 2px 8px;
    color: #f4f7fb;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    cursor: pointer;
  }

  .map-asset-selector__resolving {
    justify-content: flex-start;
    min-height: 32px;
    margin-top: 7px;
    color: #91cfe8;
  }

  @container map-screen (max-width: 900px) {
    .map-asset-selector__trigger {
      max-width: 112px;
      padding: 0 7px;
    }

    .map-asset-selector__trigger-name {
      display: none;
    }
  }

  @container map-screen (max-width: 560px) {
    .map-asset-selector__trigger {
      max-width: 74px;
      height: 34px;
      gap: 4px;
      padding: 0 5px;
    }

    .map-asset-selector__trigger > :last-child {
      display: none;
    }
  }
</style>
