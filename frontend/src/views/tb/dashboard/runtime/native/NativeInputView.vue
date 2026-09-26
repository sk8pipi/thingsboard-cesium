<template>
  <form class="native-input" @submit.prevent="save">
    <label v-if="settings.showLabel" :for="fieldId">{{ settings.label || series.label }}</label>
    <label v-if="spec.valueType === 'boolean'" class="native-input-switch">
      <input
        :id="fieldId"
        v-model="booleanDraft"
        type="checkbox"
        :disabled="previewOnly || busy || !validBinding"
        @change="dirty = true"
      />
      <span>{{ booleanDraft ? '开启' : '关闭' }}</span>
    </label>
    <div v-else-if="spec.valueType === 'image'" class="native-image-input">
      <img v-if="settings.displayPreview !== false && imagePreview" :src="imagePreview" alt="当前属性图片" />
      <p v-else-if="settings.displayPreview !== false">暂无图片</p>
      <input
        :id="fieldId"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
        :disabled="previewOnly || busy || !validBinding"
        @change="onImageSelected"
      />
    </div>
    <textarea
      v-else-if="spec.valueType === 'json'"
      :id="fieldId"
      v-model="textDraft"
      rows="8"
      spellcheck="false"
      :disabled="previewOnly || busy || !validBinding"
      @input="dirty = true"
    ></textarea>
    <input
      v-else
      :id="fieldId"
      v-model="textDraft"
      :type="
        spec.valueType === 'date'
          ? settings.showTimeInput
            ? 'datetime-local'
            : 'date'
          : ['double', 'integer'].includes(spec.valueType)
            ? 'number'
            : 'text'
      "
      :step="spec.valueType === 'double' ? 'any' : '1'"
      :min="['double', 'integer'].includes(spec.valueType) ? (settings.min ?? undefined) : undefined"
      :max="['double', 'integer'].includes(spec.valueType) ? (settings.max ?? undefined) : undefined"
      :required="settings.required || spec.valueType !== 'string'"
      :disabled="previewOnly || busy || !validBinding"
      @input="dirty = true"
    />
    <p v-if="previewOnly" class="native-input-note">预览模式：仅显示当前值，不会写入数据</p>
    <p v-if="!validBinding" class="error" role="status">实体、字段类型或属性范围与部件不匹配</p>
    <div v-else-if="!previewOnly" class="native-input-actions">
      <button
        v-if="spec.valueType === 'image' && settings.displayClearButton"
        type="button"
        :disabled="busy || !textDraft"
        @click="clearImage"
        >清除图片</button
      >
      <button
        v-if="
          (spec.valueType === 'json' || (spec.valueType === 'image' && settings.displayDiscardButton !== false)) &&
          dirty
        "
        type="button"
        :disabled="busy"
        @click="discard"
        >放弃修改</button
      >
      <button
        v-if="spec.valueType !== 'image' || settings.displayApplyButton !== false"
        type="submit"
        :disabled="busy || (spec.valueType === 'image' && !dirty)"
        >{{ busy ? '保存中…' : '保存' }}</button
      >
    </div>
    <p v-if="message" :class="{ error: failed }" role="status">{{ message }}</p>
  </form>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import {
    getAttributesByScope,
    getLatestTimeseries,
    saveEntityAttributesV1,
    saveEntityTelemetry,
  } from '/@/api/tb/telemetry';
  import { EntityType } from '/@/enums/entityTypeEnum';
  import { Scope } from '/@/enums/telemetryEnum';
  import type { NativeInputSettings, NativeSource } from './nativeWidgetTypes';
  import type { NativeSeries } from './nativeWidgetDataCore';
  import {
    isNativeImageData,
    nativeInputValue,
    writeAndReadNativeInput,
    type NativeInputSpec,
  } from './nativeInputCore';

  const props = defineProps<{
    spec: NativeInputSpec;
    settings: NativeInputSettings;
    source: NativeSource;
    series: NativeSeries;
    previewOnly?: boolean;
  }>();
  const emit = defineEmits<{ (event: 'saved'): void }>();
  const fieldId = `native-input-${Math.random().toString(36).slice(2)}`;
  const textDraft = ref('');
  const booleanDraft = ref(false);
  const dirty = ref(false);
  const busy = ref(false);
  const message = ref('');
  const failed = ref(false);
  const lastKnown = ref<unknown>(undefined);
  const imageClear = ref(false);
  let imageSelection = 0;
  const imagePreview = computed(() => (isNativeImageData(textDraft.value) ? textDraft.value : ''));
  const validBinding = computed(
    () =>
      props.series.key.type === props.spec.mode &&
      (props.spec.mode !== 'attribute' || props.series.key.scope === props.spec.scope) &&
      (props.spec.scope !== 'SHARED_SCOPE' || props.source.entityType === 'DEVICE'),
  );
  const keyName = computed(() => props.series.key.name);

  function localDate(value: unknown) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
    const date = new Date(timestamp);
    const local = new Date(timestamp - date.getTimezoneOffset() * 60000).toISOString();
    return props.settings.showTimeInput ? local.slice(0, 16) : local.slice(0, 10);
  }
  function setDraft(value: unknown) {
    lastKnown.value = value;
    if (dirty.value) return;
    imageClear.value = false;
    booleanDraft.value = value === true || value === 'true';
    if (props.spec.valueType === 'json') {
      let parsed = value;
      if (typeof value === 'string') {
        try {
          parsed = JSON.parse(value);
        } catch {
          /* Keep unparseable source visible for correction. */
        }
      }
      textDraft.value = JSON.stringify(parsed ?? {}, null, 2);
    } else textDraft.value = props.spec.valueType === 'date' ? localDate(value) : value == null ? '' : String(value);
  }
  function discard() {
    imageSelection++;
    dirty.value = false;
    message.value = '';
    setDraft(lastKnown.value);
  }
  async function onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || props.previewOnly || busy.value || !validBinding.value) return;
    const selection = ++imageSelection;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp'].includes(file.type)) {
      message.value = '请选择受支持的图片文件';
      failed.value = true;
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
      });
      if (selection !== imageSelection || !isNativeImageData(data)) return;
      textDraft.value = data;
      imageClear.value = false;
      dirty.value = true;
      message.value = '';
      failed.value = false;
      if (props.settings.displayApplyButton === false) await save();
    } catch {
      if (selection === imageSelection) {
        message.value = '图片读取失败';
        failed.value = true;
      }
    }
  }
  async function clearImage() {
    imageSelection++;
    textDraft.value = '';
    imageClear.value = true;
    dirty.value = true;
    if (props.settings.displayApplyButton === false) await save();
  }
  watch(
    () => [props.series.latest?.value, props.spec.valueType, props.settings.showTimeInput],
    () => setDraft(props.series.latest?.value),
    { immediate: true },
  );
  watch(
    () => [props.source.entityId, props.series.key.name],
    () => {
      imageSelection++;
      dirty.value = false;
      message.value = '';
      setDraft(props.series.latest?.value);
    },
  );

  function transportFor(entityId: { entityType: EntityType; id: string }, allowMissingAttribute = false) {
    return {
      writeAttribute: (scope: 'SERVER_SCOPE' | 'SHARED_SCOPE', data: Record<string, unknown>) =>
        saveEntityAttributesV1(entityId, scope as Scope, data),
      writeTelemetry: (data: Record<string, unknown>) => saveEntityTelemetry(entityId, data),
      readAttribute: async (scope: 'SERVER_SCOPE' | 'SHARED_SCOPE', key: string) => {
        const result = await getAttributesByScope(entityId, scope as Scope, { keys: key });
        const attribute = result.find((item) => item.key === key);
        if (!attribute && allowMissingAttribute) return null;
        if (!attribute) throw new Error('回读结果中没有该属性');
        return attribute.value;
      },
      readTelemetry: async (key: string) => {
        const result = await getLatestTimeseries(entityId, key);
        const points = result[key]?.data || [];
        if (!points.length) throw new Error('回读结果中没有该遥测');
        return points.at(-1)?.value;
      },
    };
  }
  async function save() {
    if (props.previewOnly || busy.value || !validBinding.value) return;
    message.value = '';
    failed.value = false;
    let value: unknown;
    try {
      value = nativeInputValue(
        props.spec.valueType === 'boolean' ? booleanDraft.value : imageClear.value ? null : textDraft.value,
        props.spec.valueType,
        ['string', 'json'].includes(props.spec.valueType) ? props.settings.required : true,
      );
      if (
        typeof value === 'number' &&
        ((props.settings.min != null && value < props.settings.min) ||
          (props.settings.max != null && value > props.settings.max))
      )
        throw new Error('数值超出配置范围');
    } catch (error) {
      message.value = error instanceof Error ? error.message : '输入值无效';
      failed.value = true;
      return;
    }
    busy.value = true;
    try {
      const entity = { entityType: props.source.entityType as EntityType, id: props.source.entityId };
      const saved = await writeAndReadNativeInput(
        props.spec,
        keyName.value,
        value,
        transportFor(entity, props.spec.valueType === 'image' && value === null),
      );
      dirty.value = false;
      setDraft(saved);
      message.value = props.settings.showResultMessage ? '已保存并回读当前值' : '';
      emit('saved');
    } catch {
      message.value = '写入或回读失败，请检查权限、网络并刷新核对当前值';
      failed.value = true;
    } finally {
      busy.value = false;
    }
  }
</script>

<style scoped>
  .native-input {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 10px;
    height: 100%;
    padding: 12px;
  }
  .native-input > label {
    color: #dae9f6;
  }
  .native-input > input,
  .native-input > textarea {
    width: min(100%, 320px);
    padding: 8px;
    border: 1px solid #7995ae;
    border-radius: 4px;
    background: #fff;
    color: #243d52;
  }
  .native-image-input {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .native-image-input img {
    max-width: 100%;
    max-height: 180px;
    object-fit: contain;
  }
  .native-image-input input {
    max-width: 100%;
  }
  .native-input > textarea {
    width: 100%;
    min-height: 140px;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  .native-input-switch {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .native-input button {
    padding: 6px 20px;
    border: 1px solid #92b9d6;
    border-radius: 4px;
    background: #30577f;
    color: white;
    cursor: pointer;
  }
  .native-input-actions {
    display: flex;
    gap: 8px;
  }
  .native-input button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .native-input p {
    margin: 0;
    font-size: 12px;
    color: #a6e5bc;
  }
  .native-input p.error {
    color: #ffc97a;
  }
  .native-input-note {
    color: #bcd0df !important;
  }
</style>
