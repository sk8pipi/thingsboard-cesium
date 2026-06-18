<template>
  <div class="flex items-center justify-between w-full h-full px-4 tb-control-switch">
    <div class="min-w-0 mr-3">
      <div class="text-sm font-medium truncate">
        {{ widgetTitle }}
      </div>

      <div class="mt-1 text-xs text-gray-500">
        当前状态：{{ checked ? trueLabel : falseLabel }}
      </div>

      <div class="text-[11px] text-gray-400 mt-1 truncate">
        设备：{{ deviceId || '未绑定' }}
      </div>

      <div class="text-[11px] text-gray-400 truncate">
        获取方式：{{ getValueSource }} / 设置方式：{{ setValueMode }}
      </div>
    </div>

    <label class="tb-switch-inline">
      <input
        type="checkbox"
        :checked="checked"
        :disabled="loading || disabled"
        @change="handleNativeChange"
      />
      <span class="tb-switch-text">
        {{ checked ? trueLabel : falseLabel }}
      </span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import type { ControlSwitchSettings } from './controlExecutor';
import { executeGetValue, executeSetValue } from './controlExecutor';
import { runParseFunction } from './controlFunctions';

const props = defineProps<{
  widgetId?: string;
  config?: Record<string, any>;
  data?: Record<string, any>;
}>();

const loading = ref(false);
const remoteValue = ref<boolean | null>(null);
const optimisticValue = ref<boolean | null>(null);

const settings = computed<ControlSwitchSettings>(() => {
  return props.config?.settings || {};
});

const widgetTitle = computed(() => {
  return settings.value.title || props.config?.title || '开关控制';
});

const trueLabel = computed(() => {
  return settings.value.valueSettings?.onLabel || '开启';
});

const falseLabel = computed(() => {
  return settings.value.valueSettings?.offLabel || '关闭';
});

const getValueSource = computed(() => {
  return settings.value.getValue?.source || 'latestTelemetry';
});

const setValueMode = computed(() => {
  return settings.value.setValue?.mode || 'rpc';
});

const deviceId = computed(() => {
  return (
    settings.value.targetDeviceId ||
    props.config?.datasource?.entityId ||
    props.config?.datasources?.[0]?.entityId ||
    ''
  );
});

const latestValues = computed<Record<string, any>>(() => {
  return props.data?.latestValues || {};
});

const rawState = computed(() => {
  const key = settings.value.getValue?.key || 'value';
  return latestValues.value?.[key];
});

const localParsedValue = computed<boolean>(() => {
  if (
    getValueSource.value === 'latestTelemetry' ||
    getValueSource.value === 'sharedAttribute' ||
    getValueSource.value === 'clientAttribute' ||
    getValueSource.value === 'serverAttribute'
  ) {
    return runParseFunction(settings.value.getValue?.parseFunction, rawState.value);
  }
  return false;
});

const checked = computed<boolean>(() => {
  if (optimisticValue.value !== null) return optimisticValue.value;

  if (getValueSource.value === 'rpc') {
    return remoteValue.value ?? false;
  }

  return localParsedValue.value;
});

const disabled = computed(() => {
  return !!loading.value;
});

watch(localParsedValue, () => {
  if (getValueSource.value !== 'rpc') {
    optimisticValue.value = null;
  }
});

async function refreshRemoteValue() {
  if (!deviceId.value) return;
  if (getValueSource.value !== 'rpc') return;

  try {
    const result = await executeGetValue(deviceId.value, settings.value, latestValues.value);
    remoteValue.value = result;
    optimisticValue.value = null;
  } catch (err) {
    console.error('[TbControlSwitch] refreshRemoteValue error:', err);
  }
}

async function handleChange(nextChecked: boolean) {
  const oldValue = checked.value;
  const optimistic = settings.value.valueSettings?.optimistic ?? true;

  try {
    if (!deviceId.value) {
      throw new Error('缺少设备 ID');
    }

    loading.value = true;

    if (optimistic) {
      optimisticValue.value = nextChecked;
    }

    await executeSetValue(deviceId.value, settings.value, nextChecked);

    if (getValueSource.value === 'rpc') {
      await refreshRemoteValue();
    }

    message.success('控制命令发送成功');
  } catch (err: any) {
    optimisticValue.value = oldValue;
    message.error(err?.message || '控制命令发送失败');
  } finally {
    loading.value = false;
  }
}

function handleNativeChange(e: Event) {
  const target = e.target as HTMLInputElement;
  handleChange(target.checked);
}

onMounted(() => {
  if (getValueSource.value === 'rpc') {
    refreshRemoteValue();
  }
});
</script>

<style scoped>
.tb-control-switch {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tb-switch-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.tb-switch-text {
  font-size: 12px;
  color: #d1d5db;
}
</style>