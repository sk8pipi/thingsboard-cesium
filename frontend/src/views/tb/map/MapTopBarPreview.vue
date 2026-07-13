<template>
  <main ref="previewRoot" class="top-bar-preview">
    <MapScreenTopBar
      :config="config"
      :actions="availableActions"
      :dashboard-title="'\u56ed\u533a\u8bbe\u5907\u76d1\u63a7\u5927\u5c4f'"
      :is-fullscreen="isFullscreen"
      @action="handleAction"
    />

    <section class="top-bar-preview__canvas">
      <div class="top-bar-preview__summary">
        <article v-for="metric in metrics" :key="metric.label" class="top-bar-preview__metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </div>

      <div
        v-for="point in points"
        :key="point.name"
        class="top-bar-preview__point"
        :class="`top-bar-preview__point--${point.status}`"
        :style="{ left: point.left, top: point.top }"
      >
        <span class="top-bar-preview__point-dot"></span>
        <span>{{ point.name }}</span>
      </div>

      <footer class="top-bar-preview__controls">
        <div class="top-bar-preview__control-group">
          <ASegmented :value="activeAuthority" :options="authorityOptions" @change="setAuthority" />
        </div>
        <span class="top-bar-preview__feedback">{{ feedback }}</span>
      </footer>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
  import { Segmented as ASegmented } from 'ant-design-vue';
  import { Authority } from '/@/enums/authorityEnum';
  import MapScreenTopBar from './components/MapScreenTopBar.vue';
  import { executeMapTopBarAction, getAvailableMapTopBarActions } from './mapTopBarActions';
  import { createDefaultMapTopBarConfig, type MapTopBarActionType, type MapTopBarConfig } from './mapTemplateConfig';

  const config = reactive<MapTopBarConfig>({
    ...createDefaultMapTopBarConfig(),
    brand: {
      visible: true,
      logoUrl: '',
      name: '\u667a\u6167\u7269\u8054\u5e73\u53f0',
    },
  });

  const previewRoot = ref<HTMLElement | null>(null);
  const activeAuthority = ref<Authority | string>(Authority.TENANT_ADMIN);
  const isFullscreen = ref(false);
  const feedback = ref('\u70b9\u51fb\u9876\u90e8\u6309\u94ae\u53ef\u9a8c\u8bc1\u4e8b\u4ef6');
  const availableActions = computed(() => getAvailableMapTopBarActions(config.actions, activeAuthority.value));

  const authorityOptions = [
    { label: '\u79df\u6237\u7ba1\u7406\u5458', value: Authority.TENANT_ADMIN },
    { label: '\u666e\u901a\u7528\u6237', value: Authority.CUSTOMER_USER },
    { label: '\u672a\u767b\u5f55', value: '' },
  ];

  const metrics = [
    { label: '\u8bbe\u5907\u603b\u6570', value: '2,153' },
    { label: '\u5728\u7ebf\u8bbe\u5907', value: '1,248' },
    { label: '\u544a\u8b66\u8bbe\u5907', value: '23' },
  ];

  const points = [
    { name: '\u7814\u53d1\u4e2d\u5fc3', status: 'online', left: '31%', top: '32%' },
    { name: '\u751f\u4ea7\u5236\u9020\u533a', status: 'warning', left: '64%', top: '28%' },
    { name: '\u7efc\u5408\u670d\u52a1\u697c', status: 'online', left: '58%', top: '61%' },
    { name: '\u80fd\u6e90\u4e2d\u5fc3', status: 'alarm', left: '76%', top: '73%' },
  ];

  function setAuthority(value: string | number) {
    activeAuthority.value = String(value);
    feedback.value = value
      ? '\u5df2\u5207\u6362\u9a8c\u8bc1\u8eab\u4efd'
      : '\u672a\u767b\u5f55\u8eab\u4efd\u4e0d\u663e\u793a\u4efb\u4f55\u52a8\u4f5c';
  }

  async function handleAction(type: MapTopBarActionType) {
    const result = await executeMapTopBarAction(type, {
      authority: activeAuthority.value,
      fullscreenTarget: previewRoot.value,
      handlers: {
        overview: () => undefined,
        settings: () => undefined,
      },
    });

    if (typeof result.fullscreen === 'boolean') {
      isFullscreen.value = result.fullscreen;
    }

    const action = config.actions.find((item) => item.type === type);
    const statusText = {
      executed: '\u5df2\u6267\u884c',
      forbidden: '\u65e0\u6743\u9650',
      unavailable: '\u5f53\u524d\u4e0d\u53ef\u7528',
    }[result.status];
    feedback.value = `${statusText}\uff1a${action?.label || type}`;
  }

  function syncFullscreenState() {
    isFullscreen.value = Boolean(document.fullscreenElement);
  }

  onMounted(() => document.addEventListener('fullscreenchange', syncFullscreenState));
  onBeforeUnmount(() => document.removeEventListener('fullscreenchange', syncFullscreenState));
</script>

<style scoped>
  .top-bar-preview {
    width: 100%;
    height: 100%;
    min-height: 640px;
    overflow: hidden;
    color: #edf4f8;
    background: #07111d;
  }

  .top-bar-preview__canvas {
    position: relative;
    height: calc(100% - 64px);
    min-height: 576px;
    overflow: hidden;
    background-color: #0a1825;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
  }

  .top-bar-preview__canvas::before,
  .top-bar-preview__canvas::after {
    position: absolute;
    content: '';
    border: 2px solid rgba(43, 133, 174, 0.35);
    border-radius: 8px;
    transform: rotate(-8deg);
  }

  .top-bar-preview__canvas::before {
    inset: 18% 16% 20% 22%;
  }

  .top-bar-preview__canvas::after {
    inset: 35% 28% 8% 38%;
    transform: rotate(12deg);
  }

  .top-bar-preview__summary {
    position: absolute;
    z-index: 2;
    top: 24px;
    left: 24px;
    display: flex;
    gap: 1px;
    border: 1px solid rgba(121, 158, 184, 0.22);
    border-radius: 6px;
    overflow: hidden;
  }

  .top-bar-preview__metric {
    display: flex;
    flex-direction: column;
    width: 138px;
    min-height: 76px;
    padding: 12px 14px;
    box-sizing: border-box;
    background: rgba(7, 17, 29, 0.9);
  }

  .top-bar-preview__metric span {
    color: #8fa8b9;
    font-size: 13px;
  }

  .top-bar-preview__metric strong {
    margin-top: 5px;
    color: #f1f7fa;
    font-size: 23px;
    letter-spacing: 0;
  }

  .top-bar-preview__point {
    position: absolute;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 116px;
    padding: 8px 10px;
    color: #dce8ee;
    font-size: 13px;
    background: rgba(8, 22, 34, 0.88);
    border: 1px solid rgba(112, 150, 176, 0.28);
    border-radius: 4px;
  }

  .top-bar-preview__point-dot {
    width: 9px;
    height: 9px;
    flex: 0 0 auto;
    background: #37c979;
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(55, 201, 121, 0.7);
  }

  .top-bar-preview__point--warning .top-bar-preview__point-dot {
    background: #f5bd39;
    box-shadow: 0 0 10px rgba(245, 189, 57, 0.7);
  }

  .top-bar-preview__point--alarm .top-bar-preview__point-dot {
    background: #f05b62;
    box-shadow: 0 0 10px rgba(240, 91, 98, 0.7);
  }

  .top-bar-preview__controls {
    position: absolute;
    z-index: 4;
    right: 24px;
    bottom: 24px;
    left: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 46px;
    padding: 0 12px;
    box-sizing: border-box;
    background: rgba(7, 17, 29, 0.92);
    border: 1px solid rgba(121, 158, 184, 0.22);
    border-radius: 6px;
  }

  .top-bar-preview__control-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .top-bar-preview__feedback {
    color: #9fb3c1;
    font-size: 13px;
  }

  @media (max-width: 720px) {
    .top-bar-preview__summary {
      right: 14px;
      left: 14px;
    }

    .top-bar-preview__metric {
      width: auto;
      flex: 1 1 0;
    }

    .top-bar-preview__controls {
      right: 14px;
      bottom: 14px;
      left: 14px;
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
    }

    .top-bar-preview__control-group {
      flex-wrap: wrap;
    }
  }
</style>
