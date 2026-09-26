<template>
  <div class="native-rpc-button">
    <button
      type="button"
      :class="{ raised: settings.styleButton.isRaised, primary: settings.styleButton.isPrimary }"
      :style="
        settings.styleButton.isPrimary
          ? undefined
          : {
              backgroundColor: settings.styleButton.bgColor || undefined,
              color: settings.styleButton.textColor || undefined,
            }
      "
      :disabled="previewOnly || busy || !validDevice"
      @click="send"
      >{{ busy ? '发送中…' : settings.buttonText }}</button
    >
    <p v-if="previewOnly" role="status">预览模式不会发送 RPC</p>
    <p v-else-if="!validDevice" class="error" role="status">请选择目标设备</p>
    <p v-else-if="message" :class="{ error: failed }" role="status">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { rpcSendServerSideOneway, rpcSendServerSideTwoway } from '/@/api/tb/rpc';
  import type { NativeRpcButtonSettings, NativeSource } from './nativeWidgetTypes';
  import { rpcButtonRequest } from './nativeRpcButtonCore';

  const props = defineProps<{ settings: NativeRpcButtonSettings; source?: NativeSource; previewOnly?: boolean }>();
  const validDevice = computed(() => props.source?.entityType === 'DEVICE' && !!props.source.entityId);
  const busy = ref(false);
  const failed = ref(false);
  const message = ref('');

  async function send() {
    if (props.previewOnly || busy.value || !validDevice.value) return;
    message.value = '';
    failed.value = false;
    busy.value = true;
    try {
      const request = rpcButtonRequest(props.settings);
      if (props.settings.oneWayElseTwoWay) {
        await rpcSendServerSideOneway(props.source!.entityId, request as any);
        message.value = 'RPC 请求已提交，设备执行结果待确认';
      } else {
        await rpcSendServerSideTwoway(props.source!.entityId, request as any);
        message.value = '设备已响应 RPC 请求';
      }
    } catch {
      failed.value = true;
      message.value = 'RPC 请求失败，请检查设备状态、权限与网络';
    } finally {
      busy.value = false;
    }
  }
</script>

<style scoped>
  .native-rpc-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    height: 100%;
    padding: 12px;
  }
  button {
    min-width: 120px;
    padding: 10px 20px;
    border: 1px solid #8fb5d1;
    border-radius: 5px;
    background: transparent;
    color: #eaf5ff;
    cursor: pointer;
  }
  button.raised {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.26);
  }
  button.primary {
    background: #30577f;
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  p {
    margin: 0;
    font-size: 12px;
    color: #b6deca;
  }
  p.error {
    color: #ffc97a;
  }
</style>
