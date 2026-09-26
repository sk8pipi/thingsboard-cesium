<template>
  <div class="native-count" :class="settings.layout">
    <span
      v-if="settings.showIcon"
      class="native-count-icon"
      :style="{
        color: settings.iconColor,
        background: settings.showIconBackground ? settings.iconBackgroundColor : 'transparent',
      }"
      aria-hidden="true"
      ><Icon
        :icon="
          settings.icon === 'warning'
            ? 'ant-design:warning-filled'
            : settings.icon === 'devices'
              ? 'ant-design:desktop-outlined'
              : settings.icon
        "
        :size="settings.iconSize"
    /></span>
    <div class="native-count-content">
      <small v-if="settings.showLabel">{{ settings.label }}</small>
      <strong :style="{ color: settings.valueColor, fontSize: `${settings.valueFontSize}px` }">{{
        loading ? '…' : error ? '—' : (value ?? '—')
      }}</strong>
      <span v-if="error" role="status">{{ error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue';
  import { Icon } from '/@/components/Icon';
  import { countAlarmsByQuery, countEntitiesByQuery } from '/@/api/tb/entityQuery';
  import type { NativeCountSettings } from './nativeWidgetTypes';
  import { nativeCountQuery, validateNativeCount } from './nativeCountCore';

  const props = defineProps<{ settings: NativeCountSettings; fqn: string; pollMs: number }>();
  const value = ref<number | null>(null);
  const loading = ref(false);
  const error = ref('');

  watch(
    () => JSON.stringify([props.settings, props.fqn, props.pollMs]),
    (_signature, _previous, onCleanup) => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      value.value = null;
      error.value = '';
      const refresh = async () => {
        const errors = validateNativeCount(props.settings, props.fqn);
        if (errors.length) {
          error.value = errors.join('；');
          value.value = null;
          return;
        }
        loading.value = value.value === null;
        try {
          const query = nativeCountQuery(props.settings);
          const result =
            props.settings.kind === 'alarm' ? await countAlarmsByQuery(query) : await countEntitiesByQuery(query);
          if (!active) return;
          if (typeof result !== 'number' || !Number.isFinite(result) || result < 0)
            throw new Error('计数接口返回无效值');
          value.value = result;
          error.value = '';
        } catch (cause: any) {
          if (active) {
            value.value = null;
            error.value = cause?.message || '计数读取失败';
          }
        } finally {
          if (active) {
            loading.value = false;
            timer = setTimeout(refresh, Math.max(5000, props.pollMs));
          }
        }
      };
      void refresh();
      onCleanup(() => {
        active = false;
        if (timer) clearTimeout(timer);
      });
    },
    { immediate: true },
  );
</script>

<style scoped>
  .native-count {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    width: 100%;
    min-height: 110px;
    flex: 1;
    padding: 12px;
  }
  .native-count.column {
    flex-direction: column;
  }
  .native-count-icon {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    font-size: 23px;
  }
  .native-count-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .native-count-content small {
    color: #bcd0df;
  }
  .native-count-content strong {
    font-size: 28px;
    line-height: 1.2;
  }
  .native-count-content span {
    color: #ffc97a;
    font-size: 12px;
  }
</style>
