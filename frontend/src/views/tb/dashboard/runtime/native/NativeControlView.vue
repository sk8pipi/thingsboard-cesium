<template>
  <div class="native-control" :class="`kind-${settings.kind}`">
    <strong v-if="settings.title">{{ settings.title }}</strong>
    <button
      v-if="booleanControl"
      type="button"
      class="toggle"
      :class="{
        active: !!value,
        round: settings.kind === 'roundSwitch' || settings.kind === 'power',
        buttonlike: settings.kind === 'toggleButton',
      }"
      :style="{ '--active': settings.activeColor, '--inactive': settings.inactiveColor }"
      :disabled="disabled"
      @click="commit(!value)"
    >
      <span v-if="settings.kind === 'power'" class="power">⏻</span>
      <span v-else-if="settings.kind === 'toggleButton'">{{ value ? settings.onLabel : settings.offLabel }}</span>
      <span v-else class="thumb"></span>
    </button>
    <div v-else-if="settings.kind === 'stepper'" class="stepper">
      <button type="button" :disabled="disabled || Number(value) <= settings.min" @click="step(-1)">−</button>
      <output>{{ formatted }}</output>
      <button type="button" :disabled="disabled || Number(value) >= settings.max" @click="step(1)">＋</button>
    </div>
    <div v-else class="numeric">
      <div v-if="settings.kind === 'knob'" class="knob" :style="knobStyle"><span></span></div>
      <input
        type="range"
        :min="settings.min"
        :max="settings.max"
        :step="settings.step"
        :value="Number(value)"
        :disabled="disabled"
        @change="commit(Number(($event.target as HTMLInputElement).value))"
      />
      <output v-if="settings.showValue">{{ formatted }}</output>
    </div>
    <div v-if="booleanControl && settings.showOnOffLabels" class="state-label">{{
      value ? settings.onLabel : settings.offLabel
    }}</div>
    <p v-if="previewOnly">预览模式不会发送 RPC</p>
    <p v-else-if="message" :class="{ error: failed }" role="status">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { getAttributesByScope, getLatestTimeseries } from '/@/api/tb/telemetry';
  import { getPersistedRpc, rpcSendOneway, rpcSendTwoway } from '/@/api/tb/rpc';
  import { EntityType } from '/@/enums/entityTypeEnum';
  import { Scope } from '/@/enums/telemetryEnum';
  import type { NativeControlSettings, NativeSource } from './nativeWidgetTypes';
  import {
    isBooleanControl,
    nativeControlValue,
    nextStepperValue,
    validateNativeControlSettings,
  } from './nativeControlCore';

  const props = defineProps<{
    settings: NativeControlSettings;
    source?: NativeSource;
    pollMs: number;
    previewOnly?: boolean;
  }>();
  const booleanControl = computed(() => isBooleanControl(props.settings.kind));
  const value = ref<number | boolean>(props.settings.initialValue);
  const busy = ref(false);
  const failed = ref(false);
  const message = ref('');
  let generation = 0;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  const disabled = computed(() => !!props.previewOnly || busy.value || props.source?.entityType !== 'DEVICE');
  const formatted = computed(() => `${Number(value.value).toFixed(props.settings.decimals)}${props.settings.units}`);
  const knobStyle = computed(() => ({
    '--rotation': `${-135 + ((Number(value.value) - props.settings.min) / (props.settings.max - props.settings.min)) * 270}deg`,
    '--active': props.settings.activeColor,
  }));

  function stop() {
    generation++;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = undefined;
  }
  onBeforeUnmount(stop);

  async function persistedResponse(result: any, current: number) {
    const id = result?.rpcId ? String(result.rpcId) : '';
    if (!id) return result;
    while (current === generation) {
      await new Promise((resolve) => setTimeout(resolve, props.settings.persistentPollingInterval));
      if (current !== generation) return undefined;
      const rpc: any = await getPersistedRpc(id);
      if (['QUEUED', 'SENT', 'DELIVERED'].includes(rpc.status)) continue;
      if (rpc.status === 'SUCCESSFUL') return rpc.response;
      throw new Error('持久 RPC 失败');
    }
  }

  async function read(current: number) {
    if (current !== generation || props.previewOnly || !props.source?.entityId) return;
    const settings = props.settings;
    try {
      let raw: unknown = settings.initialValue;
      if (settings.retrieveValueMethod === 'rpc') {
        const result = await rpcSendTwoway(props.source.entityId, {
          method: settings.getValueMethod,
          params: null as any,
          timeout: settings.requestTimeout,
          persistent: settings.requestPersistent,
        });
        raw = settings.requestPersistent ? await persistedResponse(result, current) : result;
      } else if (settings.retrieveValueMethod === 'attribute') {
        const rows = await getAttributesByScope(
          { entityType: EntityType.DEVICE, id: props.source.entityId },
          settings.attributeScope as Scope,
          { keys: settings.valueKey },
        );
        raw = rows.find((row) => row.key === settings.valueKey)?.value;
      } else if (settings.retrieveValueMethod === 'timeseries') {
        const rows = await getLatestTimeseries(
          { entityType: EntityType.DEVICE, id: props.source.entityId },
          settings.valueKey,
        );
        raw = rows[settings.valueKey]?.data?.at(-1)?.value;
      }
      if (current !== generation) return;
      value.value = nativeControlValue(raw, settings);
      failed.value = false;
      message.value = '';
    } catch {
      if (current === generation) {
        failed.value = true;
        message.value = '状态读取失败，请检查设备、权限与网络';
      }
    }
  }

  async function start() {
    stop();
    const current = generation;
    value.value = nativeControlValue(props.settings.initialValue, props.settings);
    message.value = '';
    failed.value = false;
    const errors = validateNativeControlSettings(props.settings);
    if (errors.length) {
      failed.value = true;
      message.value = errors.join('；');
      return;
    }
    if (props.previewOnly) return;
    if (props.source?.entityType !== 'DEVICE' || !props.source.entityId) {
      failed.value = true;
      message.value = '请选择目标设备';
      return;
    }
    await read(current);
    if (current === generation && props.settings.retrieveValueMethod !== 'none')
      pollTimer = setInterval(() => void read(current), Math.max(1000, props.pollMs || 5000));
  }

  async function commit(next: number | boolean) {
    if (disabled.value || !props.source?.entityId) return;
    busy.value = true;
    failed.value = false;
    message.value = '';
    const previous = value.value;
    value.value = nativeControlValue(next, props.settings);
    try {
      await rpcSendOneway(props.source.entityId, {
        method: props.settings.setValueMethod,
        params: value.value as any,
        timeout: props.settings.requestTimeout,
        persistent: props.settings.requestPersistent,
      });
      message.value = '控制请求已提交，设备执行结果待确认';
    } catch {
      value.value = previous;
      failed.value = true;
      message.value = '控制请求失败，请检查设备、权限与网络';
    } finally {
      busy.value = false;
    }
  }
  function step(direction: -1 | 1) {
    void commit(nextStepperValue(Number(value.value), direction, props.settings));
  }
  watch(
    () => [props.source?.entityId, JSON.stringify(props.settings), props.pollMs, props.previewOnly],
    () => void start(),
    { immediate: true },
  );
</script>

<style scoped>
  .native-control {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    height: 100%;
    padding: 12px;
    color: #eaf5ff;
  }
  .native-control button,
  input {
    cursor: pointer;
  }
  .toggle {
    width: 92px;
    height: 48px;
    padding: 4px;
    border: 0;
    border-radius: 26px;
    background: var(--inactive);
    transition: 0.2s;
  }
  .toggle.active {
    background: var(--active);
  }
  .toggle .thumb {
    display: block;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #fff;
    transition: 0.2s;
    box-shadow: 0 2px 8px #0006;
  }
  .toggle.active .thumb {
    transform: translateX(44px);
  }
  .toggle.round {
    width: 92px;
    height: 92px;
    border-radius: 50%;
    color: #fff;
    font-size: 44px;
  }
  .toggle.buttonlike {
    width: min(80%, 240px);
    border: 1px solid currentColor;
    border-radius: 5px;
    color: #fff;
    font-weight: 600;
  }
  .power {
    line-height: 1;
  }
  .stepper,
  .numeric {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
  }
  .stepper button {
    width: 42px;
    height: 42px;
    border: 1px solid #8fb5d1;
    border-radius: 50%;
    background: #ffffff14;
    color: #eaf5ff;
    font-size: 24px;
  }
  output {
    min-width: 74px;
    text-align: center;
    font-size: 20px;
  }
  input[type='range'] {
    width: min(72%, 360px);
    accent-color: var(--active, #5469ff);
  }
  .kind-knob .numeric {
    flex-direction: column;
  }
  .knob {
    width: 110px;
    height: 110px;
    border: 9px solid #ffffff24;
    border-radius: 50%;
    background: conic-gradient(from 225deg, var(--active) 0 75%, #ffffff1c 75%);
    transform: rotate(var(--rotation));
  }
  .knob span {
    display: block;
    width: 5px;
    height: 40px;
    margin: 8px auto;
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 0 8px var(--active);
  }
  .state-label,
  p {
    margin: 0;
    font-size: 12px;
    color: #bcd0df;
  }
  p.error {
    color: #ffc97a;
  }
  button:disabled,
  input:disabled {
    opacity: 0.55;
    cursor: default;
  }
</style>
