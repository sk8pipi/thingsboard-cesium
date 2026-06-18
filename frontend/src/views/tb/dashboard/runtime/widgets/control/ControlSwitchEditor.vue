<template>
  <div class="control-switch-editor">
    <div class="editor-section">
      <div class="editor-section__title">基础设置</div>

      <div class="form-row">
        <label class="form-label">标题</label>
        <input v-model="localSettings.title" class="form-input" type="text" placeholder="开关控制" />
      </div>

      <div class="form-row">
        <label class="form-label">目标设备 ID</label>
        <input
          v-model="localSettings.targetDeviceId"
          class="form-input"
          type="text"
          placeholder="自动关联后可显示，也可手动修改"
        />
      </div>
    </div>

    <div class="editor-section">
      <div class="editor-section__title">当前值获取设置</div>

      <div class="form-row">
        <label class="form-label">获取方式</label>
        <select v-model="localSettings.getValue.source" class="form-select">
          <option value="latestTelemetry">latestTelemetry</option>
          <option value="sharedAttribute">sharedAttribute</option>
          <option value="clientAttribute">clientAttribute</option>
          <option value="serverAttribute">serverAttribute</option>
          <option value="rpc">rpc</option>
        </select>
      </div>

      <div
        v-if="
          localSettings.getValue.source === 'latestTelemetry' ||
          localSettings.getValue.source === 'sharedAttribute' ||
          localSettings.getValue.source === 'clientAttribute' ||
          localSettings.getValue.source === 'serverAttribute'
        "
        class="form-row"
      >
        <label class="form-label">读取 key</label>
        <input v-model="localSettings.getValue.key" class="form-input" type="text" placeholder="value" />
      </div>

      <template v-if="localSettings.getValue.source === 'rpc'">
        <div class="form-row">
          <label class="form-label">获取值 RPC 方法</label>
          <input
            v-model="localSettings.getValue.rpcMethod"
            class="form-input"
            type="text"
            placeholder="getValue"
          />
        </div>

        <div class="form-row">
          <label class="form-label">RPC 类型</label>
          <select v-model="localSettings.getValue.rpcCallType" class="form-select">
            <option value="twoway">twoway</option>
            <option value="oneway">oneway</option>
          </select>
        </div>

        <div class="form-row">
          <label class="form-label">RPC 超时(ms)</label>
          <input
            v-model.number="localSettings.getValue.rpcTimeout"
            class="form-input"
            type="number"
            min="0"
            placeholder="5000"
          />
        </div>
      </template>

      <div class="form-row">
        <label class="form-label">解析函数 f(data)</label>
        <textarea
          v-model="localSettings.getValue.parseFunction"
          class="form-textarea"
          rows="5"
          placeholder="return !!(data?.value ?? data);"
        />
      </div>
    </div>

    <div class="editor-section">
      <div class="editor-section__title">更新值设置</div>

      <div class="form-row">
        <label class="form-label">设置方式</label>
        <select v-model="localSettings.setValue.mode" class="form-select">
          <option value="rpc">rpc</option>
          <option value="sharedAttribute">sharedAttribute</option>
          <option value="clientAttribute">clientAttribute</option>
        </select>
      </div>

      <div
        v-if="
          localSettings.setValue.mode === 'sharedAttribute' ||
          localSettings.setValue.mode === 'clientAttribute'
        "
        class="form-row"
      >
        <label class="form-label">写入 key</label>
        <input v-model="localSettings.setValue.key" class="form-input" type="text" placeholder="value" />
      </div>

      <template v-if="localSettings.setValue.mode === 'rpc'">
        <div class="form-row">
          <label class="form-label">设置值 RPC 方法</label>
          <input
            v-model="localSettings.setValue.rpcMethod"
            class="form-input"
            type="text"
            placeholder="setValue"
          />
        </div>

        <div class="form-row">
          <label class="form-label">RPC 类型</label>
          <select v-model="localSettings.setValue.rpcCallType" class="form-select">
            <option value="twoway">twoway</option>
            <option value="oneway">oneway</option>
          </select>
        </div>

        <div class="form-row">
          <label class="form-label">RPC 超时(ms)</label>
          <input
            v-model.number="localSettings.setValue.rpcTimeout"
            class="form-input"
            type="number"
            min="0"
            placeholder="5000"
          />
        </div>
      </template>

      <div class="form-row">
        <label class="form-label">转换函数 f(value)</label>
        <textarea
          v-model="localSettings.setValue.transformFunction"
          class="form-textarea"
          rows="5"
          placeholder="return value;"
        />
      </div>
    </div>

    <div class="editor-section">
      <div class="editor-section__title">显示设置</div>

      <div class="form-row">
        <label class="form-label">开启文案</label>
        <input
          v-model="localSettings.valueSettings.onLabel"
          class="form-input"
          type="text"
          placeholder="开启"
        />
      </div>

      <div class="form-row">
        <label class="form-label">关闭文案</label>
        <input
          v-model="localSettings.valueSettings.offLabel"
          class="form-input"
          type="text"
          placeholder="关闭"
        />
      </div>

      <div class="form-row form-row--checkbox">
        <label class="form-checkbox">
          <input v-model="localSettings.valueSettings.optimistic" type="checkbox" />
          <span>乐观更新</span>
        </label>
      </div>

      <div class="form-row form-row--checkbox">
        <label class="form-checkbox">
          <input v-model="localSettings.valueSettings.disabledWhenOffline" type="checkbox" />
          <span>设备离线时禁用</span>
        </label>
      </div>
    </div>

    <div class="editor-footer">
      <button class="editor-btn" type="button" @click="handleReset">重置默认值</button>
      <button class="editor-btn primary" type="button" @click="handleSave">保存设置</button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { reactive, watch } from 'vue';

  interface ControlGetValueSettings {
    enabled?: boolean;
    source?: 'latestTelemetry' | 'sharedAttribute' | 'clientAttribute' | 'serverAttribute' | 'rpc';
    key?: string;
    rpcMethod?: string;
    rpcTimeout?: number;
    rpcCallType?: 'oneway' | 'twoway';
    parseFunction?: string;
  }

  interface ControlSetValueSettings {
    enabled?: boolean;
    mode?: 'rpc' | 'sharedAttribute' | 'clientAttribute';
    key?: string;
    rpcMethod?: string;
    rpcTimeout?: number;
    rpcCallType?: 'oneway' | 'twoway';
    transformFunction?: string;
  }

  interface ControlSwitchSettings {
    title?: string;
    targetDeviceId?: string;
    getValue: ControlGetValueSettings;
    setValue: ControlSetValueSettings;
    valueSettings: {
      onLabel?: string;
      offLabel?: string;
      optimistic?: boolean;
      disabledWhenOffline?: boolean;
    };
  }

  const props = defineProps<{
    modelValue?: ControlSwitchSettings;
  }>();

  const emit = defineEmits<{
    (e: 'update:modelValue', value: ControlSwitchSettings): void;
    (e: 'save', value: ControlSwitchSettings): void;
  }>();

  function createDefaultSettings(): ControlSwitchSettings {
    return {
      title: '开关控制',
      targetDeviceId: '',
      getValue: {
        enabled: true,
        source: 'latestTelemetry',
        key: 'value',
        rpcMethod: 'getValue',
        rpcTimeout: 5000,
        rpcCallType: 'twoway',
        parseFunction: 'return !!(data?.value ?? data);',
      },
      setValue: {
        enabled: true,
        mode: 'rpc',
        key: 'value',
        rpcMethod: 'setValue',
        rpcTimeout: 5000,
        rpcCallType: 'twoway',
        transformFunction: 'return value;',
      },
      valueSettings: {
        onLabel: '开启',
        offLabel: '关闭',
        optimistic: true,
        disabledWhenOffline: true,
      },
    };
  }

  function mergeSettings(input?: ControlSwitchSettings): ControlSwitchSettings {
    const defaults = createDefaultSettings();
    return {
      ...defaults,
      ...(input || {}),
      getValue: {
        ...defaults.getValue,
        ...(input?.getValue || {}),
      },
      setValue: {
        ...defaults.setValue,
        ...(input?.setValue || {}),
      },
      valueSettings: {
        ...defaults.valueSettings,
        ...(input?.valueSettings || {}),
      },
    };
  }

  const localSettings = reactive<ControlSwitchSettings>(mergeSettings(props.modelValue));

  watch(
    () => props.modelValue,
    (val) => {
      const merged = mergeSettings(val);
      Object.assign(localSettings, merged);
      Object.assign(localSettings.getValue, merged.getValue);
      Object.assign(localSettings.setValue, merged.setValue);
      Object.assign(localSettings.valueSettings, merged.valueSettings);
    },
    { deep: true, immediate: true },
  );

  watch(
    localSettings,
    (val) => {
      emit('update:modelValue', JSON.parse(JSON.stringify(val)));
    },
    { deep: true },
  );

  function handleReset() {
    const defaults = createDefaultSettings();
    Object.assign(localSettings, defaults);
    Object.assign(localSettings.getValue, defaults.getValue);
    Object.assign(localSettings.setValue, defaults.setValue);
    Object.assign(localSettings.valueSettings, defaults.valueSettings);
  }

  function handleSave() {
    emit('save', JSON.parse(JSON.stringify(localSettings)));
  }
</script>

<style scoped>
  .control-switch-editor {
    display: grid;
    gap: 14px;
    padding: 12px;
    color: #fff;
  }

  .editor-section {
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    padding: 12px;
  }

  .editor-section__title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
  }

  .form-row {
    display: grid;
    gap: 6px;
    margin-bottom: 10px;
  }

  .form-row:last-child {
    margin-bottom: 0;
  }

  .form-label {
    font-size: 12px;
    opacity: 0.85;
  }

  .form-input,
  .form-select,
  .form-textarea {
    width: 100%;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(0, 0, 0, 0.18);
    color: #fff;
    padding: 8px 10px;
    box-sizing: border-box;
  }

  .form-textarea {
    resize: vertical;
    min-height: 88px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 12px;
  }

  .form-row--checkbox {
    display: flex;
    align-items: center;
  }

  .form-checkbox {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    cursor: pointer;
  }

  .editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .editor-btn {
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    border-radius: 8px;
    padding: 8px 12px;
    cursor: pointer;
  }

  .editor-btn.primary {
    background: rgba(22, 100, 145, 0.88);
  }
</style>
