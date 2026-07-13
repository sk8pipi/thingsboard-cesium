<template>
  <header v-if="config.visible" class="map-screen-top-bar" :style="headerStyle">
    <div class="map-screen-top-bar__brand">
      <template v-if="config.brand.visible">
        <img
          v-if="resolvedLogoUrl && !logoLoadFailed"
          class="map-screen-top-bar__logo"
          :src="resolvedLogoUrl"
          alt=""
          @error="logoLoadFailed = true"
        />
        <Icon v-else class="map-screen-top-bar__brand-icon" icon="ant-design:cluster-outlined" :size="28" />
        <span v-if="config.brand.name" class="map-screen-top-bar__brand-name">
          {{ config.brand.name }}
        </span>
      </template>
    </div>

    <div v-if="config.title.visible" class="map-screen-top-bar__title" :title="resolvedTitle">
      {{ resolvedTitle }}
    </div>

    <nav class="map-screen-top-bar__actions" aria-label="Dashboard actions">
      <ATooltip v-for="action in visibleActions" :key="action.id" :title="action.label">
        <button
          class="map-screen-top-bar__action"
          :class="{ 'map-screen-top-bar__action--icon-only': action.type === 'fullscreen' }"
          type="button"
          :aria-label="action.label"
          @click="handleAction(action.type)"
        >
          <Icon :icon="actionIcon(action.type)" :size="20" />
          <span v-if="action.type !== 'fullscreen'" class="map-screen-top-bar__action-label">
            {{ action.label }}
          </span>
        </button>
      </ATooltip>
    </nav>
  </header>
</template>

<script setup lang="ts">
  import { computed, ref, watch, type CSSProperties } from 'vue';
  import { Tooltip as ATooltip } from 'ant-design-vue';
  import { Icon } from '/@/components/Icon';
  import type { MapTopBarActionConfig, MapTopBarActionType, MapTopBarConfig } from '../mapTemplateConfig';
  import { resolveMapLogoImageSrc } from '../services/mapLogoImageService';

  const props = withDefaults(
    defineProps<{
      config: MapTopBarConfig;
      actions?: readonly MapTopBarActionConfig[];
      mode?: 'runtime' | 'editor';
      dashboardTitle?: string;
      isFullscreen?: boolean;
    }>(),
    {
      dashboardTitle: '',
      isFullscreen: false,
      mode: 'runtime',
    },
  );

  const emit = defineEmits<{
    action: [type: MapTopBarActionType];
  }>();

  const logoLoadFailed = ref(false);
  const resolvedLogoUrl = ref('');
  let logoRequestId = 0;

  const headerStyle = computed<CSSProperties>(() => {
    const configuredLogoHeight = Number(props.config.brand.logoHeight) || 34;
    const maximumLogoHeight = Math.max(20, Number(props.config.height) - 16);
    const logoHeight = Math.min(configuredLogoHeight, maximumLogoHeight);
    const logoMaxWidth = Number(props.config.brand.logoMaxWidth) || 120;
    return {
      '--map-top-bar-height': `${props.config.height}px`,
      '--map-logo-height': `${logoHeight}px`,
      '--map-logo-max-width': `${logoMaxWidth}px`,
    };
  });

  const resolvedTitle = computed(() => {
    const configuredTitle = props.config.title.text.trim();
    const dashboardTitle = props.dashboardTitle.trim();
    return props.config.title.useDashboardTitle ? dashboardTitle || configuredTitle : configuredTitle || dashboardTitle;
  });

  const visibleActions = computed(() =>
    (props.actions ?? props.config.actions)
      .filter((action) => action.visible)
      .slice()
      .sort((left, right) => left.order - right.order),
  );

  watch(
    () => props.config.brand.logoUrl,
    async (source) => {
      const requestId = ++logoRequestId;
      logoLoadFailed.value = false;
      resolvedLogoUrl.value = '';
      try {
        const resolved = await resolveMapLogoImageSrc(source);
        if (requestId === logoRequestId) {
          resolvedLogoUrl.value = resolved;
        }
      } catch {
        if (requestId === logoRequestId) {
          logoLoadFailed.value = true;
        }
      }
    },
    { immediate: true },
  );

  function actionIcon(type: MapTopBarActionType) {
    if (type === 'overview') return 'ant-design:appstore-outlined';
    if (type === 'settings') return 'ant-design:setting-outlined';
    return props.isFullscreen ? 'ant-design:fullscreen-exit-outlined' : 'ant-design:fullscreen-outlined';
  }

  function handleAction(type: MapTopBarActionType) {
    if (props.mode === 'editor') return;
    emit('action', type);
  }
</script>

<style scoped>
  .map-screen-top-bar {
    --map-top-bar-height: 64px;
    --map-logo-height: 34px;
    --map-logo-max-width: 120px;
    --map-top-bar-background: rgba(7, 17, 29, 0.94);
    --map-top-bar-border: rgba(123, 160, 191, 0.28);
    --map-top-bar-text: #f4f7fb;
    --map-top-bar-muted: #a9b9c8;
    --map-top-bar-accent: #36bffa;
    position: relative;
    z-index: 20;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    width: 100%;
    height: var(--map-top-bar-height);
    padding: 0 22px;
    box-sizing: border-box;
    color: var(--map-top-bar-text);
    background: var(--map-top-bar-background);
    border-bottom: 1px solid var(--map-top-bar-border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  }

  .map-screen-top-bar__brand,
  .map-screen-top-bar__actions {
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .map-screen-top-bar__brand {
    justify-content: flex-start;
    gap: 10px;
    overflow: hidden;
  }

  .map-screen-top-bar__logo {
    width: auto;
    height: var(--map-logo-height);
    max-width: var(--map-logo-max-width);
    flex: 0 0 auto;
    object-fit: contain;
  }

  .map-screen-top-bar__brand-icon {
    flex: 0 0 auto;
    color: var(--map-top-bar-accent);
  }

  .map-screen-top-bar__brand-name {
    overflow: hidden;
    color: var(--map-top-bar-text);
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .map-screen-top-bar__title {
    max-width: min(44vw, 680px);
    overflow: hidden;
    padding: 0 24px;
    color: var(--map-top-bar-text);
    font-size: 24px;
    font-weight: 650;
    letter-spacing: 0;
    line-height: 1.2;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .map-screen-top-bar__actions {
    justify-content: flex-end;
    gap: 8px;
  }

  .map-screen-top-bar__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 76px;
    height: 38px;
    padding: 0 12px;
    box-sizing: border-box;
    color: var(--map-top-bar-muted);
    font: inherit;
    font-size: 14px;
    letter-spacing: 0;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    transition:
      color 160ms ease,
      background-color 160ms ease,
      border-color 160ms ease;
  }

  .map-screen-top-bar__action:hover,
  .map-screen-top-bar__action:focus-visible {
    color: var(--map-top-bar-text);
    background: rgba(54, 191, 250, 0.12);
    border-color: var(--map-top-bar-accent);
    outline: none;
  }

  .map-screen-top-bar__action--icon-only {
    min-width: 38px;
    width: 38px;
    padding: 0;
  }

  .map-screen-top-bar__action-label {
    margin-left: 7px;
    white-space: nowrap;
  }

  @media (max-width: 900px) {
    .map-screen-top-bar {
      padding: 0 14px;
    }

    .map-screen-top-bar__brand-name {
      display: none;
    }

    .map-screen-top-bar__logo {
      max-width: min(var(--map-logo-max-width), 80px);
    }

    .map-screen-top-bar__title {
      max-width: 48vw;
      padding: 0 14px;
      font-size: 20px;
    }

    .map-screen-top-bar__action {
      min-width: 38px;
      width: 38px;
      padding: 0;
    }

    .map-screen-top-bar__action-label {
      display: none;
    }
  }

  @media (max-width: 560px) {
    .map-screen-top-bar {
      padding: 0 10px;
    }

    .map-screen-top-bar__title {
      max-width: 42vw;
      padding: 0 8px;
      font-size: 16px;
    }

    .map-screen-top-bar__actions {
      gap: 4px;
    }
  }
</style>
