<template>
  <div class="tb-led-indicator">
    <div class="tb-led-indicator__main">
      <div
        class="tb-led-indicator__lamp"
        :class="{
          'is-on': isOn,
          'is-off': !isOn,
        }"
      />
      <div class="tb-led-indicator__info">
        <div class="tb-led-indicator__title">
          {{ widgetTitle }}
        </div>
        <div class="tb-led-indicator__status">
          {{ isOn ? onLabel : offLabel }}
        </div>
        <div class="tb-led-indicator__meta">
          key: {{ stateKey }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getLatestTimeseries } from '/@/api/tb/telemetry';
import { EntityType } from '/@/enums/entityTypeEnum';
import { runParseFunction } from '../control/controlFunctions';

interface LedIndicatorSettings {
  title?: string;
  key?: string;
  parseFunction?: string;
  onLabel?: string;
  offLabel?: string;
  pollMs?: number;
}

const props = defineProps<{
  widgetId?: string;
  config?: Record<string, any>;
  data?: Record<string, any>;
}>();

const settings = computed<LedIndicatorSettings>(() => {
  return props.config?.settings || {};
});

const widgetTitle = computed(() => {
  return settings.value.title || props.config?.title || 'LED 指示灯';
});

const stateKey = computed(() => {
  return (
    settings.value.key ||
    props.config?.datasource?.keys?.[0] ||
    props.config?.datasources?.[0]?.keys?.[0] ||
    'value'
  );
});

const entityType = computed(() => {
  return String(
    props.config?.datasource?.entityType ||
      props.config?.datasources?.[0]?.entityType ||
      'DEVICE',
  ).toUpperCase();
});

const entityId = computed(() => {
  return String(
    props.config?.datasource?.entityId ||
      props.config?.datasources?.[0]?.entityId ||
      '',
  );
});

const onLabel = computed(() => {
  return settings.value.onLabel || '开启';
});

const offLabel = computed(() => {
  return settings.value.offLabel || '关闭';
});

const rawValue = ref<any>(undefined);
let timer: number | null = null;

function entityTypeToEnum(s: string) {
  const up = String(s || '').toUpperCase();
  if ((EntityType as any)[up]) return (EntityType as any)[up];
  return (EntityType as any).DEVICE ?? up;
}

function extractLatestValue(ret: any, key: string) {
  const v1 = ret?.[key];
  let item: any = null;

  if (Array.isArray(v1)) {
    item = v1[0];
  } else if (v1 && Array.isArray(v1.data)) {
    item = v1.data[0];
  }

  return item?.value;
}

async function refreshLatestValue() {
  if (!entityId.value || !stateKey.value) return;

  try {
    const ret = await getLatestTimeseries(
      {
        entityType: entityTypeToEnum(entityType.value),
        id: entityId.value,
      } as any,
      stateKey.value,
      true,
    );

    const latest = extractLatestValue(ret, stateKey.value);
    rawValue.value = latest;
  } catch (err) {
    console.error('[TbLedIndicator] refreshLatestValue error:', err);
  }
}

const isOn = computed(() => {
  return runParseFunction(
    settings.value.parseFunction || 'return !!(data?.value ?? data);',
    rawValue.value,
  );
});

onMounted(() => {
  refreshLatestValue();

  const pollMs = Math.max(300, Number(settings.value.pollMs || 800));
  timer = window.setInterval(() => {
    refreshLatestValue();
  }, pollMs);
});

onBeforeUnmount(() => {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
});
</script>

<style scoped>
.tb-led-indicator {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tb-led-indicator__main {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  height: 100%;
}

.tb-led-indicator__lamp {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  flex: 0 0 34px;
  border: 2px solid rgba(255, 255, 255, 0.18);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.tb-led-indicator__lamp.is-on {
  background: #22c55e;
  box-shadow:
    0 0 10px rgba(34, 197, 94, 0.65),
    0 0 22px rgba(34, 197, 94, 0.35);
  transform: scale(1.03);
}

.tb-led-indicator__lamp.is-off {
  background: #4b5563;
  box-shadow: none;
}

.tb-led-indicator__info {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.tb-led-indicator__title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  line-height: 1.2;
}

.tb-led-indicator__status {
  font-size: 13px;
  color: #d1d5db;
}

.tb-led-indicator__meta {
  font-size: 11px;
  color: #9ca3af;
}
</style>