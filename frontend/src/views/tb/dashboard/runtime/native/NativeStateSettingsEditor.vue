<template>
  <section class="state-settings">
    <h3>状态映射</h3>
    <p
      >使用原始遥测与终点阶梯线。常量优先，重复常量取最后一项；区间按顺序匹配，包含下限、不含上限，相同边界表示等值。</p
    >
    <label
      ><input
        type="checkbox"
        :checked="value.includePrevious"
        @change="setFlag('includePrevious', $event)"
      />读取并延续窗口前的最后状态</label
    >
    <label
      ><input
        type="checkbox"
        :checked="value.extendToEnd"
        @change="setFlag('extendToEnd', $event)"
      />延续最后状态到窗口末尾</label
    >
    <fieldset v-for="(state, index) in value.states" :key="index">
      <legend>状态 {{ index + 1 }}</legend>
      <label>名称<input :value="state.label" @input="setState(index, 'label', $event)" /></label>
      <label>数值位置<input type="number" :value="state.value" @input="setState(index, 'value', $event)" /></label>
      <label
        >匹配方式<select :value="state.sourceType" @change="setState(index, 'sourceType', $event)"
          ><option value="constant">常量</option
          ><option value="range">区间</option></select
        ></label
      >
      <template v-if="state.sourceType === 'constant'">
        <label
          >常量类型<select :value="typeof state.sourceValue" @change="setType(index, $event)"
            ><option value="boolean">布尔</option
            ><option value="number">数字</option
            ><option value="string">文本</option></select
          ></label
        >
        <label v-if="typeof state.sourceValue === 'boolean'"
          >常量<select :value="String(state.sourceValue)" @change="setBoolean(index, $event)"
            ><option value="true">true</option
            ><option value="false">false</option></select
          ></label
        >
        <label v-else
          >常量<input
            :type="typeof state.sourceValue === 'number' ? 'number' : 'text'"
            :value="state.sourceValue"
            @input="setState(index, 'sourceValue', $event)"
        /></label>
      </template>
      <template v-else>
        <label
          >下限（空为不限）<input
            type="number"
            :value="state.sourceRangeFrom"
            @input="setState(index, 'sourceRangeFrom', $event)"
        /></label>
        <label
          >上限（空为不限）<input
            type="number"
            :value="state.sourceRangeTo"
            @input="setState(index, 'sourceRangeTo', $event)"
        /></label>
      </template>
      <button type="button" @click="remove(index)">删除状态</button>
    </fieldset>
    <button type="button" :disabled="value.states.length >= 128" @click="add">添加状态</button>
    <p
      >未匹配的数字保留原值，未匹配的文本显示为断点；字符串 true/false
      按布尔值匹配。状态名称显示于图中对应数值位置与提示中。</p
    >
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import type { NativeOptions, NativeStateSettings } from './nativeWidgetTypes';
  import { withNativeSettings } from './nativeWidgetSettings';
  const props = defineProps<{ modelValue: NativeOptions }>();
  const emit = defineEmits<{ 'update:modelValue': [value: NativeOptions] }>();
  const value = computed(() => withNativeSettings(props.modelValue).state);
  function update(change: (state: NativeStateSettings) => void) {
    const next = withNativeSettings(props.modelValue);
    change(next.state);
    emit('update:modelValue', next);
  }
  function setFlag(field: 'includePrevious' | 'extendToEnd', event: Event) {
    update((state) => {
      state[field] = (event.target as HTMLInputElement).checked;
    });
  }
  function setState(index: number, field: string, event: Event) {
    const target = event.target as HTMLInputElement;
    update((state) => {
      Object.assign(state.states[index], {
        [field]: target.type === 'number' ? (target.value === '' ? null : Number(target.value)) : target.value,
      });
    });
  }
  function setType(index: number, event: Event) {
    const type = (event.target as HTMLSelectElement).value;
    update((state) => {
      state.states[index].sourceValue = type === 'boolean' ? false : type === 'number' ? 0 : '';
    });
  }
  function setBoolean(index: number, event: Event) {
    update((state) => {
      state.states[index].sourceValue = (event.target as HTMLSelectElement).value === 'true';
    });
  }
  function remove(index: number) {
    update((state) => {
      state.states.splice(index, 1);
    });
  }
  function add() {
    update((state) => {
      state.states.push({ label: '新状态', value: state.states.length, sourceType: 'constant', sourceValue: false });
    });
  }
</script>
<style scoped>
  .state-settings {
    padding: 18px;
    border: 1px solid #e2e7eb;
    border-radius: 8px;
    background: white;
  }
  h3 {
    margin: 0 0 12px;
    font-size: 15px;
  }
  p {
    color: #6c7781;
    font-size: 12px;
  }
  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    border: 1px solid #d9dfe4;
    margin: 12px 0;
  }
  label {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin: 5px;
  }
  input:not([type='checkbox']),
  select {
    max-width: 160px;
    border: 1px solid #cbd3db;
    border-radius: 4px;
    padding: 6px;
  }
  button {
    border: 1px solid #cbd3db;
    background: white;
    border-radius: 4px;
    padding: 6px 10px;
    color: #315c85;
    cursor: pointer;
  }
</style>
