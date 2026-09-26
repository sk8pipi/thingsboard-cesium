<template>
  <div class="advanced-control" :class="`mode-${settings.mode}`">
    <strong v-if="settings.title">{{ settings.title }}</strong>

    <button v-if="settings.mode === 'actionButton'" type="button" :disabled="busy" @click="runAction">
      {{ settings.buttonText }}
    </button>

    <div v-else-if="settings.mode === 'gpioControl'" class="pin-grid">
      <button
        v-for="pin in settings.pins"
        :key="pin.pin"
        type="button"
        class="pin"
        :class="{ active: pinValues[pin.pin] }"
        :style="pinValues[pin.pin] ? { borderColor: pin.color, backgroundColor: `${pin.color}33` } : undefined"
        :disabled="disabled"
        @click="setPin(pin.pin, !pinValues[pin.pin])"
      >
        <span>{{ pin.label || `GPIO ${pin.pin}` }}</span
        ><b>{{ pinValues[pin.pin] ? 'ON' : 'OFF' }}</b>
      </button>
    </div>

    <div v-else-if="settings.mode === 'gpioPanel'" class="gpio-panel" :style="{ background: settings.panelColor }">
      <span
        v-for="pin in settings.pins"
        :key="pin.pin"
        class="panel-pin"
        :style="{ gridColumn: pin.col || undefined, gridRow: pin.row || undefined, borderColor: pin.color }"
      >
        <i :style="{ background: pin.color }"></i>{{ pin.pin }} · {{ pin.label }}
      </span>
    </div>

    <div v-else-if="settings.mode === 'persistentTable'" class="table-wrap">
      <div class="toolbar"><button type="button" :disabled="disabled" @click="loadRequests">刷新</button></div>
      <table>
        <thead
          ><tr><th>状态</th><th>方法</th><th>创建时间</th><th v-if="settings.allowDelete">操作</th></tr></thead
        >
        <tbody>
          <tr v-for="row in requests" :key="requestId(row)">
            <td>{{ row.status || '—' }}</td
            ><td>{{ row.request?.method || row.method || '—' }}</td>
            <td>{{ formatTime(row.createdTime || row.expirationTime) }}</td>
            <td v-if="settings.allowDelete"
              ><button type="button" :disabled="disabled" @click="removeRequest(row)">删除</button></td
            >
          </tr>
          <tr v-if="!requests.length"><td :colspan="settings.allowDelete ? 4 : 3">暂无持久 RPC</td></tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="settings.mode === 'rpcTerminal'" class="terminal-shell">
      <pre>{{ outputText || '输入：方法名 [JSON 参数]' }}</pre>
      <form @submit.prevent="sendTerminal"
        ><input v-model="command" placeholder="getState {}" :disabled="disabled" /><button
          :disabled="disabled || !command.trim()"
          >发送</button
        ></form
      >
    </div>

    <div v-else-if="settings.mode === 'rpcShell'" class="terminal-shell">
      <small>{{ shellCwd || '远程终端' }}</small
      ><pre>{{ outputText || '等待输入命令…' }}</pre>
      <form @submit.prevent="sendShell"
        ><input v-model="command" placeholder="输入命令" :disabled="disabled" /><button
          :disabled="disabled || !command.trim()"
          >执行</button
        ><button v-if="busy" type="button" @click="terminateShell">终止</button></form
      >
    </div>

    <div v-else-if="settings.mode === 'serviceRpc'" class="service-rpc">
      <code>{{ settings.method }}</code
      ><small>{{ settings.isConnector ? '连接器 RPC' : '网关 RPC' }}</small>
      <button type="button" :disabled="disabled" @click="sendService">{{ settings.buttonText }}</button>
      <pre v-if="outputText">{{ outputText }}</pre>
    </div>

    <div v-else-if="settings.mode === 'status'" class="status-view">
      <span :style="{ background: statusValue ? settings.onColor : settings.offColor }"></span>
      <b>{{ statusValue ? settings.onLabel : settings.offLabel }}</b>
      <button type="button" :disabled="disabled" @click="readStatus">刷新</button>
    </div>

    <div v-else-if="settings.mode === 'segment'" class="segments">
      <button type="button" :class="{ selected: !segmentValue }" @click="selectSegment(false)">{{
        settings.leftLabel
      }}</button>
      <button type="button" :class="{ selected: segmentValue }" @click="selectSegment(true)">{{
        settings.rightLabel
      }}</button>
    </div>

    <button
      v-else-if="settings.mode === 'attributeUpdate'"
      type="button"
      :disabled="disabled"
      @click="updateAttributes"
    >
      {{ settings.buttonText }}
    </button>

    <p v-if="previewOnly" role="status">预览模式只展示效果，不会调用设备或保存数据</p>
    <p v-else-if="needsDevice && !validDevice" class="error" role="status">请选择目标设备</p>
    <p v-else-if="message" :class="{ error: failed }" role="status">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { deletePersistedRpc, getPersistedRpc, getPersistedRpcByDevice, rpcSendTwoway } from '/@/api/tb/rpc';
  import { saveEntityAttributesV1 } from '/@/api/tb/telemetry';
  import { EntityType } from '/@/enums/entityTypeEnum';
  import { Scope } from '/@/enums/telemetryEnum';
  import type { NativeAdvancedControlSettings, NativeSource } from './nativeWidgetTypes';
  import {
    advancedControlNeedsDevice,
    gpioStates,
    parseAttributesJson,
    parseRpcParams,
    parseTerminalCommand,
    safeActionUrl,
    serviceRpcMethod,
  } from './nativeAdvancedControlCore';

  const props = defineProps<{
    settings: NativeAdvancedControlSettings;
    source?: NativeSource;
    previewOnly?: boolean;
  }>();
  const busy = ref(false);
  const failed = ref(false);
  const message = ref('');
  const command = ref('');
  const output = ref<string[]>([]);
  const requests = ref<any[]>([]);
  const pinValues = ref<Record<string, boolean>>({});
  const statusValue = ref(false);
  const segmentValue = ref(props.settings.initialValue);
  const shellCwd = ref('');
  let timer: ReturnType<typeof setInterval> | undefined;
  let generation = 0;
  const validDevice = computed(() => props.source?.entityType === 'DEVICE' && !!props.source.entityId);
  const needsDevice = computed(() => advancedControlNeedsDevice(props.settings.mode));
  const disabled = computed(() => !!props.previewOnly || busy.value || (needsDevice.value && !validDevice.value));
  const outputText = computed(() => output.value.slice(-props.settings.maxLines).join('\n'));

  function resetMessage() {
    failed.value = false;
    message.value = '';
  }
  function fail(text: string) {
    failed.value = true;
    message.value = text;
  }
  function append(value: unknown) {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    output.value = [...output.value, text].slice(-props.settings.maxLines);
  }
  function stop() {
    generation++;
    if (timer) clearInterval(timer);
    timer = undefined;
  }
  function request(method: string, params: unknown) {
    return {
      method,
      params: params as any,
      timeout: props.settings.requestTimeout,
      persistent: props.settings.requestPersistent,
    };
  }
  async function sendTwoway(method: string, params: unknown, current = generation): Promise<any> {
    if (!props.source?.entityId) throw new Error('目标设备缺失');
    const result: any = await rpcSendTwoway(props.source.entityId, request(method, params));
    if (!props.settings.requestPersistent || !result?.rpcId) return result;
    const deadline = Date.now() + Math.max(props.settings.requestTimeout, 60000);
    while (current === generation && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, props.settings.pollingInterval));
      if (current !== generation) return undefined;
      const rpc: any = await getPersistedRpc(String(result.rpcId));
      if (['QUEUED', 'SENT', 'DELIVERED'].includes(rpc?.status)) continue;
      if (rpc?.status === 'SUCCESSFUL') return rpc.response;
      throw new Error(`持久 RPC ${rpc?.status || '失败'}`);
    }
    throw new Error('持久 RPC 等待超时');
  }
  function requestId(row: any) {
    return String(row?.id?.id || row?.id || row?.rpcId || '');
  }
  function formatTime(value: unknown) {
    const time = Number(value);
    return Number.isFinite(time) ? new Date(time).toLocaleString() : '—';
  }

  async function runAction() {
    resetMessage();
    if (props.previewOnly) {
      message.value = '预览模式不会执行动作';
      return;
    }
    if (props.settings.actionMode !== 'url') {
      message.value = '未配置点击动作';
      return;
    }
    try {
      window.location.assign(safeActionUrl(props.settings.actionTarget));
    } catch (error) {
      fail(error instanceof Error ? error.message : '链接无效');
    }
  }
  async function readPins() {
    if (disabled.value || !props.source?.entityId) return;
    try {
      const result = await sendTwoway(props.settings.readMethod, {});
      pinValues.value = gpioStates(result, props.settings.pins);
    } catch {
      fail('GPIO 状态读取失败');
    }
  }
  async function setPin(pin: string, enabled: boolean) {
    if (disabled.value || !props.source?.entityId) return;
    const previous = pinValues.value[pin];
    pinValues.value = { ...pinValues.value, [pin]: enabled };
    busy.value = true;
    resetMessage();
    try {
      const result = await sendTwoway(props.settings.writeMethod, { pin, enabled });
      pinValues.value = { ...pinValues.value, ...gpioStates(result, props.settings.pins) };
      message.value = 'GPIO 指令已发送';
    } catch {
      pinValues.value = { ...pinValues.value, [pin]: previous };
      fail('GPIO 指令发送失败');
    } finally {
      busy.value = false;
    }
  }
  async function loadRequests() {
    if (disabled.value || !props.source?.entityId) return;
    busy.value = true;
    resetMessage();
    try {
      const result: any = await getPersistedRpcByDevice(props.source.entityId, {
        pageSize: props.settings.pageSize,
        page: 0,
      });
      requests.value = Array.isArray(result) ? result : Array.isArray(result?.data) ? result.data : [];
    } catch {
      fail('持久 RPC 列表加载失败');
    } finally {
      busy.value = false;
    }
  }
  async function removeRequest(row: any) {
    const id = requestId(row);
    if (disabled.value || !id) return;
    busy.value = true;
    resetMessage();
    try {
      await deletePersistedRpc(id);
      requests.value = requests.value.filter((item) => requestId(item) !== id);
      message.value = 'RPC 请求已删除';
    } catch {
      fail('RPC 请求删除失败');
    } finally {
      busy.value = false;
    }
  }
  async function sendTerminal() {
    if (disabled.value || !props.source?.entityId) return;
    const parsed = parseTerminalCommand(command.value);
    if (!parsed.method) return;
    append(`> ${command.value}`);
    command.value = '';
    busy.value = true;
    resetMessage();
    try {
      append(await sendTwoway(parsed.method, parsed.params));
    } catch {
      fail('RPC 调试请求失败');
    } finally {
      busy.value = false;
    }
  }
  async function initializeShell(current: number) {
    if (disabled.value || !props.source?.entityId) return;
    try {
      const info: any = await sendTwoway('getTermInfo', {}, current);
      if (current === generation) shellCwd.value = info?.cwd || '';
    } catch {
      fail('远程终端初始化失败');
    }
  }
  async function sendShell() {
    if (disabled.value || !props.source?.entityId) return;
    const current = generation;
    const text = command.value.trim();
    if (!text) return;
    append(`${shellCwd.value || '~'} $ ${text}`);
    command.value = '';
    busy.value = true;
    resetMessage();
    try {
      const started: any = await sendTwoway('sendCommand', { command: text, cwd: shellCwd.value }, current);
      if (started?.ok === false) throw new Error(started.error || '命令未启动');
      while (current === generation) {
        await new Promise((resolve) => setTimeout(resolve, props.settings.pollingInterval));
        if (current !== generation) return;
        const result: any = await sendTwoway('getCommandStatus', {}, current);
        for (const item of result?.data || []) append(item?.stdout ?? item?.stderr ?? item);
        if (result?.cwd) shellCwd.value = result.cwd;
        if (result?.done) break;
      }
    } catch {
      fail('远程命令执行失败');
    } finally {
      busy.value = false;
    }
  }
  async function terminateShell() {
    if (props.previewOnly || !validDevice.value) return;
    const current = generation;
    try {
      await sendTwoway('terminateCommand', null, current);
      generation++;
      message.value = '终止请求已发送';
    } catch {
      fail('远程命令终止失败');
    } finally {
      busy.value = false;
    }
  }
  async function sendService() {
    if (disabled.value || !props.source?.entityId) return;
    busy.value = true;
    resetMessage();
    try {
      append(
        await sendTwoway(
          serviceRpcMethod(props.settings.method, props.settings.isConnector),
          parseRpcParams(props.settings.params),
        ),
      );
      message.value = '服务 RPC 已响应';
    } catch {
      fail('服务 RPC 调用失败');
    } finally {
      busy.value = false;
    }
  }
  function toBoolean(raw: any) {
    const value = raw?.value ?? raw?.state ?? raw;
    return value === true || value === 1 || value === 'true' || value === '1';
  }
  async function readStatus() {
    if (disabled.value || !props.source?.entityId) return;
    try {
      statusValue.value = toBoolean(await sendTwoway(props.settings.readMethod, {}));
    } catch {
      fail('设备状态读取失败');
    }
  }
  async function selectSegment(value: boolean) {
    segmentValue.value = value;
    if (!props.previewOnly && props.settings.actionMode === 'url') await runAction();
  }
  async function updateAttributes() {
    if (disabled.value || !props.source?.entityId) return;
    busy.value = true;
    resetMessage();
    try {
      await saveEntityAttributesV1(
        { entityType: EntityType.DEVICE, id: props.source.entityId },
        props.settings.attributeScope as Scope.CLIENT_SCOPE | Scope.SERVER_SCOPE | Scope.SHARED_SCOPE,
        parseAttributesJson(props.settings.attributesJson),
      );
      message.value = '设备属性已保存';
    } catch (error) {
      fail(error instanceof Error ? error.message : '设备属性保存失败');
    } finally {
      busy.value = false;
    }
  }

  watch(
    () => [props.settings.mode, props.source?.entityId, props.previewOnly] as const,
    () => {
      stop();
      resetMessage();
      output.value = [];
      requests.value = [];
      pinValues.value = gpioStates({}, props.settings.pins);
      segmentValue.value = props.settings.initialValue;
      const current = generation;
      if (props.previewOnly || !validDevice.value) return;
      if (props.settings.mode === 'gpioControl') {
        void readPins();
        timer = setInterval(readPins, props.settings.pollingInterval);
      }
      if (props.settings.mode === 'persistentTable') void loadRequests();
      if (props.settings.mode === 'rpcShell') void initializeShell(current);
      if (props.settings.mode === 'status') {
        void readStatus();
        timer = setInterval(readStatus, props.settings.pollingInterval);
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(stop);
</script>

<style scoped>
  .advanced-control {
    width: 100%;
    height: 100%;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    padding: 12px;
    color: #eaf5ff;
    overflow: auto;
  }
  button,
  input {
    border: 1px solid #7299b7;
    border-radius: 6px;
    background: #17344d;
    color: #eaf5ff;
    padding: 8px 12px;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  p,
  small {
    margin: 0;
    color: #bcd0df;
    font-size: 12px;
  }
  .error {
    color: #ffc97a;
  }
  .pin-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
  }
  .pin {
    display: flex;
    justify-content: space-between;
  }
  .pin.active b {
    color: #78f0ad;
  }
  .gpio-panel {
    display: grid;
    grid-template-columns: repeat(2, minmax(110px, 1fr));
    gap: 5px;
    padding: 10px;
    border-radius: 8px;
  }
  .panel-pin {
    border-left: 3px solid;
    padding: 4px 6px;
    font-size: 12px;
  }
  .panel-pin i {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 5px;
  }
  .toolbar {
    display: flex;
    justify-content: flex-end;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    padding: 6px;
    border-bottom: 1px solid rgba(180, 210, 230, 0.18);
    text-align: left;
  }
  .terminal-shell pre,
  .service-rpc pre {
    flex: 1;
    min-height: 76px;
    margin: 0;
    padding: 8px;
    overflow: auto;
    border-radius: 6px;
    background: #071724;
    white-space: pre-wrap;
  }
  .terminal-shell form {
    display: flex;
    gap: 6px;
  }
  .terminal-shell input {
    flex: 1;
  }
  .service-rpc,
  .status-view {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .status-view span {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    box-shadow: 0 0 12px currentColor;
  }
  .segments {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .segments button {
    border-radius: 0;
  }
  .segments button:first-child {
    border-radius: 7px 0 0 7px;
  }
  .segments button:last-child {
    border-radius: 0 7px 7px 0;
  }
  .segments .selected {
    background: #3d73a6;
  }
</style>
