<template>
  <div class="native-multi-input">
    <h4 v-if="settings.showGroupTitle">{{ settings.groupTitle || '更新属性' }}</h4>
    <div class="native-multi-grid" :style="gridStyle">
      <div v-for="entry in visibleSeries" :key="entry.id" class="native-multi-field">
        <label :for="fieldId(entry)">{{ entry.key.label || entry.key.name }}</label>
        <input
          v-if="isBoolean(entry)"
          :id="fieldId(entry)"
          type="checkbox"
          :checked="drafts[entry.id] === true"
          :disabled="fieldDisabled(entry)"
          @change="setDraft(entry.id, ($event.target as HTMLInputElement).checked)"
        />
        <select
          v-else-if="['select', 'radio'].includes(keySettings(entry).dataKeyValueType)"
          :id="fieldId(entry)"
          :value="String(drafts[entry.id] ?? '')"
          :disabled="fieldDisabled(entry)"
          @change="setDraft(entry.id, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">请选择</option>
          <option
            v-for="option in keySettings(entry).selectOptions"
            :key="String(option.value)"
            :value="option.value ?? ''"
            >{{ option.label }}</option
          >
        </select>
        <textarea
          v-else-if="keySettings(entry).dataKeyValueType === 'JSON'"
          :id="fieldId(entry)"
          rows="4"
          :value="String(drafts[entry.id] ?? '')"
          :disabled="fieldDisabled(entry)"
          @input="setDraft(entry.id, ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <input
          v-else
          :id="fieldId(entry)"
          :type="inputType(entry)"
          :value="String(drafts[entry.id] ?? '')"
          :min="keySettings(entry).minValue ?? undefined"
          :max="keySettings(entry).maxValue ?? undefined"
          :step="keySettings(entry).step || 'any'"
          :disabled="fieldDisabled(entry)"
          @input="setDraft(entry.id, ($event.target as HTMLInputElement).value)"
        />
        <span v-if="entry.error" class="error">{{ entry.error }}</span>
        <button
          v-if="!settings.showActionButtons && !previewOnly"
          type="button"
          :disabled="busy || fieldDisabled(entry)"
          @click="save([entry])"
          >保存此项</button
        >
      </div>
    </div>
    <p v-if="previewOnly" class="native-multi-note">预览模式不会写入设备数据</p>
    <div v-if="settings.showActionButtons && !previewOnly" class="native-multi-actions">
      <button type="button" :disabled="busy" @click="reset">{{ settings.resetButtonLabel || '重置' }}</button>
      <button type="button" :disabled="busy" @click="save(visibleSeries)">{{
        busy ? '保存中…' : settings.saveButtonLabel || '保存'
      }}</button>
    </div>
    <p v-if="message" :class="{ error: failed }" role="status">{{ message }}</p>
  </div>
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
  import type { NativeSeries } from './nativeWidgetDataCore';
  import type { NativeMultiInputSettings, NativeSource } from './nativeWidgetTypes';
  import { collectMultiInputChanges, multiInputDisplay, multiKeySettings } from './nativeMultiInputCore';

  const props = defineProps<{
    settings: NativeMultiInputSettings;
    sources: NativeSource[];
    series: NativeSeries[];
    previewOnly?: boolean;
  }>();
  const emit = defineEmits<{ (event: 'saved'): void }>();
  const idPrefix = `native-multi-${Math.random().toString(36).slice(2)}`;
  const drafts = ref<Record<string, string | boolean>>({});
  const dirty = ref<Record<string, boolean>>({});
  const busy = ref(false);
  const failed = ref(false);
  const message = ref('');
  const visibleSeries = computed(() => props.series.filter((entry) => !multiKeySettings(entry.key).dataKeyHidden));
  const gridStyle = computed(() => ({
    gridTemplateColumns:
      props.settings.fieldsAlignment === 'row'
        ? `repeat(${props.settings.fieldsInRow}, minmax(0, 1fr))`
        : 'minmax(0, 1fr)',
    rowGap: `${props.settings.rowGap}px`,
    columnGap: `${props.settings.columnGap}px`,
  }));
  const fieldId = (entry: NativeSeries) => `${idPrefix}-${entry.id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
  const keySettings = (entry: NativeSeries) => multiKeySettings(entry.key);
  const isBoolean = (entry: NativeSeries) =>
    ['booleanCheckbox', 'booleanSwitch'].includes(keySettings(entry).dataKeyValueType);
  function inputType(entry: NativeSeries) {
    const type = keySettings(entry).dataKeyValueType;
    if (type === 'date') return 'date';
    if (type === 'dateTime') return 'datetime-local';
    if (type === 'time') return 'time';
    if (type === 'color') return 'color';
    if (type === 'integer' || type === 'double') return 'number';
    return 'text';
  }
  function fieldDisabled(entry: NativeSeries) {
    if (props.previewOnly || busy.value || !!entry.error || keySettings(entry).isEditable !== 'editable') return true;
    const disabledOn = keySettings(entry).disabledOnDataKey;
    if (!disabledOn) return false;
    const gate = props.series.find((other) => other.entityId === entry.entityId && other.key.name === disabledOn);
    const value = gate ? drafts.value[gate.id] : undefined;
    return value === true || (typeof value === 'string' && value !== '' && value !== 'false' && value !== '0');
  }
  function setDraft(id: string, value: string | boolean) {
    drafts.value[id] = value;
    dirty.value[id] = true;
    message.value = '';
  }
  function reset() {
    dirty.value = {};
    for (const entry of props.series)
      drafts.value[entry.id] = multiInputDisplay(entry.latest?.value, keySettings(entry).dataKeyValueType);
    message.value = '';
  }
  watch(
    () => props.series.map((entry) => [entry.id, entry.latest?.value, keySettings(entry).dataKeyValueType]),
    () => {
      const ids = new Set(props.series.map((entry) => entry.id));
      for (const id of Object.keys(drafts.value))
        if (!ids.has(id)) {
          delete drafts.value[id];
          delete dirty.value[id];
        }
      for (const entry of props.series)
        if (!dirty.value[entry.id])
          drafts.value[entry.id] = multiInputDisplay(entry.latest?.value, keySettings(entry).dataKeyValueType);
    },
    { immediate: true, deep: true },
  );

  async function save(target: NativeSeries[]) {
    if (props.previewOnly || busy.value) return;
    failed.value = false;
    message.value = '';
    let changes: ReturnType<typeof collectMultiInputChanges>;
    try {
      changes = collectMultiInputChanges(target, drafts.value, props.settings.updateAllValues, props.series);
    } catch (error) {
      failed.value = true;
      message.value = error instanceof Error ? error.message : '输入值无效';
      return;
    }
    if (!changes.length) {
      message.value = '没有需要保存的修改';
      return;
    }
    busy.value = true;
    let wrote = false;
    try {
      const groups = new Map<string, typeof changes>();
      for (const change of changes) {
        const id = `${change.series.entityId}:${change.scope}`;
        groups.set(id, [...(groups.get(id) || []), change]);
      }
      for (const group of groups.values()) {
        const first = group[0];
        const source = props.sources.find((item) => item.entityId === first.series.entityId);
        if (!source) throw new Error('目标实体不存在');
        const entity = { entityType: source.entityType as EntityType, id: source.entityId };
        const payload = Object.fromEntries(group.map((item) => [item.series.key.name, item.value]));
        if (first.scope === 'timeseries') await saveEntityTelemetry(entity, payload);
        else await saveEntityAttributesV1(entity, first.scope as Scope, payload);
        wrote = true;
      }
      for (const change of changes) {
        const source = props.sources.find((item) => item.entityId === change.series.entityId)!;
        const entity = { entityType: source.entityType as EntityType, id: source.entityId };
        const key = change.series.key.name;
        const value =
          change.scope === 'timeseries'
            ? (await getLatestTimeseries(entity, key))[key]?.data?.at(-1)?.value
            : (await getAttributesByScope(entity, change.scope as Scope, { keys: key })).find(
                (item) => item.key === key,
              )?.value;
        if (value === undefined) throw new Error(`字段 ${key} 写后回读失败`);
        dirty.value[change.series.id] = false;
        drafts.value[change.series.id] = multiInputDisplay(value, keySettings(change.series).dataKeyValueType);
      }
      message.value = props.settings.showResultMessage ? '已保存并回读所有修改' : '';
    } catch (error) {
      failed.value = true;
      message.value = `${error instanceof Error ? error.message : '写入失败'}；部分字段可能已写入，请刷新核对`;
    } finally {
      busy.value = false;
      if (wrote) emit('saved');
    }
  }
</script>

<style scoped>
  .native-multi-input {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    height: 100%;
    overflow: auto;
  }
  .native-multi-input h4,
  .native-multi-input p {
    margin: 0;
  }
  .native-multi-grid {
    display: grid;
    min-width: 0;
  }
  .native-multi-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .native-multi-field input,
  .native-multi-field textarea,
  .native-multi-field select {
    min-width: 0;
    width: 100%;
    padding: 7px;
    border: 1px solid #7995ae;
    border-radius: 5px;
    background: rgba(30, 50, 67, 0.55);
    color: #eaf5ff;
  }
  .native-multi-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  button {
    padding: 7px 14px;
    border: 1px solid #7995ae;
    border-radius: 5px;
    background: #30577f;
    color: #eaf5ff;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .native-multi-note {
    color: #bcd0df;
  }
  .error {
    color: #ffc97a;
  }
</style>
