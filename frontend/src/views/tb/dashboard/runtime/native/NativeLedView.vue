<template>
  <div class="native-led">
    <strong v-if="settings.title">{{ settings.title }}</strong>
    <span
      class="native-led-lamp"
      :class="{ active: value }"
      :style="{ '--led-color': settings.ledColor }"
      role="img"
      :aria-label="value ? '开启' : '关闭'"
    ></span>
    <span class="native-led-state">{{ value ? '开启' : '关闭' }}</span>
    <p v-if="previewOnly">预览显示初始状态，不发送 RPC</p>
    <p v-if="error" class="native-led-error" role="status">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { getAttributesByScope, getLatestTimeseries } from '/@/api/tb/telemetry';
  import { getPersistedRpc, rpcSendTwoway } from '/@/api/tb/rpc';
  import { EntityType } from '/@/enums/entityTypeEnum';
  import { Scope } from '/@/enums/telemetryEnum';
  import type { NativeLedSettings, NativeSource } from './nativeWidgetTypes';
  import { checkNativeLedStatus, nativeLedValue, validateNativeLedSettings } from './nativeLedCore';

  const props = defineProps<{
    settings: NativeLedSettings;
    source?: NativeSource;
    pollMs: number;
    previewOnly?: boolean;
  }>();
  const value = ref(false);
  const error = ref('');
  let run = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  function stop() {
    run++;
    if (retryTimer) clearTimeout(retryTimer);
    if (pollTimer) clearInterval(pollTimer);
    retryTimer = undefined;
    pollTimer = undefined;
  }
  onBeforeUnmount(stop);
  async function readValue(current: number) {
    if (current !== run || !props.source?.entityId) return;
    const entity = { entityType: EntityType.DEVICE, id: props.source.entityId };
    const key = props.settings.valueAttribute;
    try {
      let raw: unknown;
      if (props.settings.retrieveValueMethod === 'attribute') {
        const rows = await getAttributesByScope(entity, props.settings.attributeScope as Scope, { keys: key });
        raw = rows.find((item) => item.key === key)?.value;
      } else {
        const rows = await getLatestTimeseries(entity, key);
        raw = rows[key]?.data?.at(-1)?.value;
      }
      if (current !== run) return;
      value.value = nativeLedValue(raw);
      error.value = '';
    } catch {
      if (current === run) error.value = 'LED 状态读取失败，请检查设备权限与网络';
    }
  }
  async function start() {
    stop();
    const current = run;
    value.value = !!props.settings.initialValue;
    error.value = '';
    const settingsErrors = validateNativeLedSettings(props.settings);
    if (settingsErrors.length) {
      error.value = settingsErrors.join('；');
      return;
    }
    if (props.previewOnly) return;
    if (props.source?.entityType !== 'DEVICE' || !props.source.entityId) {
      error.value = '请选择目标设备';
      return;
    }
    try {
      const ready = await checkNativeLedStatus(
        props.source.entityId,
        props.settings,
        {
          transient: (id, method, timeout) =>
            rpcSendTwoway(id, { method, params: null as any, timeout, persistent: false }),
          persistent: (id, method, timeout) =>
            rpcSendTwoway(id, { method, params: null as any, timeout, persistent: true }),
          getPersisted: (id) => getPersistedRpc(id) as any,
          delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        },
        () => current === run,
      );
      if (current !== run) return;
      if (!ready) throw new Error('设备状态未知');
      await readValue(current);
      if (current !== run) return;
      pollTimer = setInterval(() => void readValue(current), Math.max(1000, props.pollMs || 5000));
    } catch {
      if (current !== run) return;
      error.value = '设备状态检查失败，稍后重试';
      retryTimer = setTimeout(() => {
        if (current === run) void start();
      }, 5000);
    }
  }
  watch(
    () => [props.source?.entityId, JSON.stringify(props.settings), props.pollMs, props.previewOnly],
    () => void start(),
    { immediate: true },
  );
</script>

<style scoped>
  .native-led {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 100%;
    padding: 12px;
    color: #dae9f6;
  }
  .native-led-lamp {
    display: block;
    width: min(42%, 110px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--led-color);
    filter: brightness(0.38);
    box-shadow:
      inset 0 0 15px #0008,
      0 2px 8px #0008;
  }
  .native-led-lamp.active {
    filter: brightness(1.35);
    box-shadow:
      inset 0 0 15px #fff5,
      0 0 22px var(--led-color);
  }
  .native-led-state {
    font-size: 12px;
  }
  .native-led p {
    margin: 0;
    font-size: 12px;
    color: #bcd0df;
  }
  .native-led p.native-led-error {
    color: #ffc97a;
  }
</style>
