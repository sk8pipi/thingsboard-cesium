<template>
  <form class="native-device-claim" @submit.prevent="submit">
    <label>
      <span v-if="settings.showLabel">{{ settings.deviceLabel }}</span>
      <input
        v-model.trim="deviceName"
        :aria-label="settings.deviceLabel"
        :placeholder="settings.deviceLabel"
        required
        autocomplete="off"
      />
    </label>
    <label v-if="settings.deviceSecret">
      <span v-if="settings.showLabel">{{ settings.secretKeyLabel }}</span>
      <input
        v-model="secretKey"
        type="password"
        :aria-label="settings.secretKeyLabel"
        :placeholder="settings.secretKeyLabel"
        required
        autocomplete="off"
      />
    </label>
    <button type="submit" :disabled="busy || previewOnly">{{ busy ? '认领中…' : settings.claimButtonLabel }}</button>
    <p v-if="previewOnly" class="native-device-claim-note">预览模式不会提交认领请求</p>
    <p v-if="message" :class="{ error: failed }" role="status">{{ message }}</p>
  </form>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import { claimDevice } from '/@/api/tb/device';
  import type { NativeDeviceClaimSettings } from './nativeWidgetTypes';

  const props = defineProps<{ settings: NativeDeviceClaimSettings; previewOnly?: boolean }>();
  const deviceName = ref('');
  const secretKey = ref('');
  const busy = ref(false);
  const failed = ref(false);
  const message = ref('');

  async function submit() {
    if (props.previewOnly || busy.value) return;
    const name = deviceName.value.trim();
    if (!name || (props.settings.deviceSecret && !secretKey.value)) {
      failed.value = true;
      message.value = '请填写设备名称和所需密钥';
      return;
    }
    busy.value = true;
    message.value = '';
    try {
      await claimDevice(name, props.settings.deviceSecret ? secretKey.value : undefined);
      failed.value = false;
      message.value = props.settings.successfulClaimDevice;
      secretKey.value = '';
    } catch (cause: any) {
      failed.value = true;
      message.value = cause?.message || props.settings.failedClaimDevice;
    } finally {
      busy.value = false;
    }
  }
</script>

<style scoped>
  .native-device-claim {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    width: 100%;
    max-width: 420px;
    padding: 16px;
    margin: auto;
  }
  .native-device-claim label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .native-device-claim input {
    width: 100%;
    padding: 8px;
  }
  .native-device-claim button {
    padding: 8px 12px;
    cursor: pointer;
  }
  .native-device-claim button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .native-device-claim p {
    margin: 0;
  }
  .native-device-claim .error {
    color: #fda4af;
  }
  .native-device-claim-note {
    opacity: 0.7;
    font-size: 12px;
  }
</style>
