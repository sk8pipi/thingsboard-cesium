<template>
  <form class="native-location" @submit.prevent="save">
    <div class="native-location-fields" :class="settings.inputFieldsAlignment">
      <label>
        <span v-if="settings.showLabel">{{ settings.latLabel || '纬度' }}</span>
        <input
          v-model="latDraft"
          type="number"
          step="any"
          min="-90"
          max="90"
          :required="requiredLat"
          :disabled="previewOnly || busy || !validBinding"
          @input="dirty = true"
        />
      </label>
      <label>
        <span v-if="settings.showLabel">{{ settings.lngLabel || '经度' }}</span>
        <input
          v-model="lngDraft"
          type="number"
          step="any"
          min="-180"
          max="180"
          :required="requiredLng"
          :disabled="previewOnly || busy || !validBinding"
          @input="dirty = true"
        />
      </label>
    </div>
    <p v-if="previewOnly" class="native-location-note">预览模式：不会获取浏览器位置或写入数据</p>
    <p v-if="!validBinding" class="native-location-error" role="status">请绑定一个实体及对应范围的经纬度字段</p>
    <div v-else-if="!previewOnly" class="native-location-actions">
      <button v-if="settings.showGetLocation" type="button" :disabled="busy" @click="getLocation">获取当前位置</button>
      <button type="button" :disabled="busy || !dirty" @click="discard">放弃修改</button>
      <button type="submit" :disabled="busy || !dirty">{{ busy ? '保存中…' : '保存位置' }}</button>
    </div>
    <p v-if="message" :class="failed ? 'native-location-error' : 'native-location-success'" role="status">{{
      message
    }}</p>
  </form>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import {
    getAttributesByScope,
    getLatestTimeseries,
    saveEntityAttributesV1,
    saveEntityTelemetry,
  } from '/@/api/tb/telemetry';
  import { EntityType } from '/@/enums/entityTypeEnum';
  import { Scope } from '/@/enums/telemetryEnum';
  import type { NativeSeries } from './nativeWidgetDataCore';
  import type { NativeLocationSettings, NativeSource } from './nativeWidgetTypes';
  import {
    locationKeysValid,
    parseNativeCoordinate,
    writeAndReadNativeLocation,
    type NativeLocationSpec,
  } from './nativeLocationInputCore';

  const props = defineProps<{
    spec: NativeLocationSpec;
    settings: NativeLocationSettings;
    source: NativeSource;
    series: NativeSeries[];
    previewOnly?: boolean;
  }>();
  const emit = defineEmits<{ (event: 'saved'): void }>();
  const latDraft = ref('');
  const lngDraft = ref('');
  const dirty = ref(false);
  const busy = ref(false);
  const failed = ref(false);
  const message = ref('');
  let locationRequest = 0;
  onBeforeUnmount(() => {
    locationRequest++;
  });
  const requiredLat = computed(() => props.spec.mode === 'timeseries' || props.settings.isLatRequired);
  const requiredLng = computed(() => props.spec.mode === 'timeseries' || props.settings.isLngRequired);
  const validBinding = computed(() => {
    if (!props.source.entityId || !locationKeysValid(props.settings) || props.series.length !== 2) return false;
    if (props.spec.scope === 'SHARED_SCOPE' && props.source.entityType !== 'DEVICE') return false;
    return [props.settings.latKeyName, props.settings.lngKeyName].every((name) =>
      props.series.some(
        (row) =>
          row.key.name === name &&
          row.key.type === props.spec.mode &&
          (props.spec.mode === 'timeseries' || row.key.scope === props.spec.scope),
      ),
    );
  });
  const latest = computed(() => ({
    lat: props.series.find((row) => row.key.name === props.settings.latKeyName)?.latest?.value,
    lng: props.series.find((row) => row.key.name === props.settings.lngKeyName)?.latest?.value,
  }));
  function setDraft(lat: unknown, lng: unknown) {
    if (dirty.value) return;
    latDraft.value = lat == null ? '' : String(lat);
    lngDraft.value = lng == null ? '' : String(lng);
  }
  watch(latest, (value) => setDraft(value.lat, value.lng), { immediate: true });
  watch(
    () => [props.source.entityId, props.settings.latKeyName, props.settings.lngKeyName],
    () => {
      locationRequest++;
      dirty.value = false;
      message.value = '';
      setDraft(latest.value.lat, latest.value.lng);
    },
  );
  function discard() {
    dirty.value = false;
    message.value = '';
    setDraft(latest.value.lat, latest.value.lng);
  }
  function getLocation() {
    if (props.previewOnly || busy.value || !validBinding.value) return;
    const request = ++locationRequest;
    if (!navigator.geolocation) {
      failed.value = true;
      message.value = '浏览器不支持获取位置';
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request !== locationRequest || props.previewOnly || !validBinding.value) return;
        latDraft.value = String(position.coords.latitude);
        lngDraft.value = String(position.coords.longitude);
        dirty.value = true;
        failed.value = false;
        message.value = '已获取当前位置，请确认后保存';
      },
      () => {
        if (request !== locationRequest || props.previewOnly) return;
        failed.value = true;
        message.value = '获取位置失败，请检查浏览器权限或手动输入';
      },
      { enableHighAccuracy: props.settings.enableHighAccuracy },
    );
  }
  async function save() {
    if (props.previewOnly || busy.value || !validBinding.value) return;
    let latitude: number | null;
    let longitude: number | null;
    try {
      latitude = parseNativeCoordinate(latDraft.value, 'lat', requiredLat.value);
      longitude = parseNativeCoordinate(lngDraft.value, 'lng', requiredLng.value);
    } catch (error) {
      failed.value = true;
      message.value = props.settings.requiredErrorMessage || (error instanceof Error ? error.message : '经纬度无效');
      return;
    }
    busy.value = true;
    failed.value = false;
    message.value = '';
    const entity = { entityType: props.source.entityType as EntityType, id: props.source.entityId };
    try {
      const saved = await writeAndReadNativeLocation(props.spec, props.settings, latitude, longitude, {
        writeAttributes: (scope, data) => saveEntityAttributesV1(entity, scope as Scope, data),
        writeTelemetry: (data) => saveEntityTelemetry(entity, data),
        readAttributes: async (scope, keys) => {
          const rows = await getAttributesByScope(entity, scope as Scope, { keys: keys.join(',') });
          const data = Object.fromEntries(rows.map((row) => [row.key, row.value]));
          if (keys.some((key) => !(key in data))) throw new Error('回读结果缺少经纬度');
          return data;
        },
        readTelemetry: async (keys) => {
          const rows = await getLatestTimeseries(entity, keys.join(','));
          const data = Object.fromEntries(keys.map((key) => [key, rows[key]?.data?.at(-1)?.value]));
          if (keys.some((key) => data[key] === undefined)) throw new Error('回读结果缺少经纬度');
          return data;
        },
      });
      dirty.value = false;
      setDraft(saved[props.settings.latKeyName], saved[props.settings.lngKeyName]);
      message.value = props.settings.showResultMessage ? '位置已保存并回读' : '';
      emit('saved');
    } catch {
      failed.value = true;
      message.value = '写入或回读失败，请检查权限、网络并刷新核对当前值';
    } finally {
      busy.value = false;
    }
  }
</script>

<style scoped>
  .native-location {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    color: #dae9f6;
  }
  .native-location-fields {
    display: flex;
    gap: 10px;
  }
  .native-location-fields.column {
    flex-direction: column;
  }
  .native-location-fields label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .native-location-fields input {
    width: min(100%, 180px);
    padding: 7px;
    border-radius: 4px;
    border: 1px solid #7995ae;
    color: #243d52;
  }
  .native-location-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .native-location button {
    padding: 6px 12px;
    border: 1px solid #92b9d6;
    border-radius: 4px;
    background: #30577f;
    color: #fff;
    cursor: pointer;
  }
  .native-location button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .native-location p {
    margin: 0;
    font-size: 12px;
  }
  .native-location-error {
    color: #ffc97a;
  }
  .native-location-success {
    color: #a6e5bc;
  }
  .native-location-note {
    color: #bcd0df;
  }
</style>
