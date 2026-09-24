<template>
  <section class="liquid-editor">
    <h3>液位容器</h3>
    <div class="fields">
      <label
        >容器形状<select :value="value.shape" @change="set('shape', $event)"
          ><option v-for="shape in Object.keys(liquidShapes)" :key="shape">{{ shape }}</option></select
        ></label
      >
      <label
        >数值布局<select :value="value.layout" @change="set('layout', $event)"
          ><option value="simple">仅容器</option
          ><option value="percentage">百分比</option
          ><option value="absolute">当前量 / 总容量</option></select
        ></label
      >
      <label
        >输入单位<select :value="value.datasourceUnits" @change="set('datasourceUnits', $event)"
          ><option v-for="unit in units" :key="unit">{{ unit }}</option></select
        ></label
      >
      <label v-if="liquidNeedsCapacity(value)"
        >总容量<input
          type="number"
          min="0.1"
          step="any"
          :value="value.capacity"
          @input="set('capacity', $event, 'number')"
      /></label>
      <label v-if="liquidNeedsCapacity(value)"
        >容量单位<select :value="value.capacityUnits" @change="set('capacityUnits', $event)"
          ><option v-for="unit in Object.keys(liquidUnits)" :key="unit">{{ unit }}</option></select
        ></label
      >
      <label v-if="value.layout === 'absolute'"
        >显示单位<select :value="value.displayUnits" @change="set('displayUnits', $event)"
          ><option v-for="unit in units" :key="unit">{{ unit }}</option></select
        ></label
      >
      <label v-if="value.layout !== 'simple'"
        >数值字号<input type="number" min="10" max="96" :value="modelValue.fontSize" @input="font($event)"
      /></label>
      <label v-if="value.layout === 'absolute'"
        >容量字号<input
          type="number"
          min="10"
          max="96"
          :value="value.volumeFontSize"
          @input="set('volumeFontSize', $event, 'number')"
      /></label>
      <label v-if="value.layout === 'absolute'"
        >容量颜色<input :value="value.volumeColor" @input="set('volumeColor', $event)"
      /></label>
      <label v-if="value.layout !== 'simple'"
        ><input
          type="checkbox"
          :checked="value.showOverlay"
          @change="set('showOverlay', $event, 'boolean')"
        />显示数值底板</label
      >
      <label
        ><input
          type="checkbox"
          :checked="value.animation"
          @change="set('animation', $event, 'boolean')"
        />液面过渡动画</label
      >
      <label
        ><input
          type="checkbox"
          :checked="value.showTooltip"
          @change="set('showTooltip', $event, 'boolean')"
        />显示液位提示</label
      >
      <label v-if="value.showTooltip"
        ><input
          type="checkbox"
          :checked="value.showTooltipDate"
          @change="set('showTooltipDate', $event, 'boolean')"
        />提示显示时间</label
      >
      <label v-if="value.showTooltip"
        >提示单位<select :value="value.tooltipUnits" @change="set('tooltipUnits', $event)"
          ><option v-for="unit in units" :key="unit">{{ unit }}</option></select
        ></label
      >
      <label v-if="value.showTooltip"
        >提示精度<input
          type="number"
          min="0"
          max="8"
          :value="value.tooltipDecimals"
          @input="set('tooltipDecimals', $event, 'number')"
      /></label>
    </div>
    <p>输入单位决定容量换算；字段小数位决定主数值精度。液面位置限制在 0–100%，实际超量数值保留。</p>
    <h4>属性驱动配置</h4>
    <div v-for="key in liquidActiveBindings(value)" :key="key" class="fields">
      <label
        ><input type="checkbox" :checked="!!value.bindings[key]" @change="binding(key, $event)" />{{
          bindingLabels[key]
        }}来自属性</label
      >
      <template v-if="value.bindings[key]">
        <label>属性名<input :value="value.bindings[key]?.name" @input="bindingField(key, 'name', $event)" /></label>
        <label
          >属性范围<select :value="value.bindings[key]?.scope" @change="bindingField(key, 'scope', $event)"
            ><option>SERVER_SCOPE</option
            ><option>SHARED_SCOPE</option
            ><option>CLIENT_SCOPE</option></select
          ></label
        >
      </template>
    </div>
    <fieldset v-for="key in activeColors" :key="key">
      <legend>{{ colorLabels[key] }}</legend>
      <label
        >默认颜色<input
          :value="value[key].color"
          @input="change((v) => (v[key].color = ($event.target as HTMLInputElement).value))"
      /></label>
      <div v-for="(range, index) in value[key].ranges" :key="index" class="fields">
        <label>下限<input type="number" :value="range.from" @input="rangeNumber(key, index, 'from', $event)" /></label>
        <label>上限<input type="number" :value="range.to" @input="rangeNumber(key, index, 'to', $event)" /></label>
        <label
          >区间颜色<input
            :value="range.color"
            @input="change((v) => (v[key].ranges[index].color = ($event.target as HTMLInputElement).value))"
        /></label>
        <button @click="change((v) => v[key].ranges.splice(index, 1))">删除区间</button>
      </div>
      <button @click="change((v) => v[key].ranges.push({ from: null, to: null, color: '#7a8bff' }))">添加区间</button>
    </fieldset>
    <p
      >颜色区间下限包含、上限不包含；相等表示单个值，空表示无界。容器、液体和底板按百分比匹配，数值颜色按显示值匹配。</p
    >
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import type { NativeOptions, NativeLiquidSettings } from './nativeWidgetTypes';
  import { withNativeSettings } from './nativeWidgetSettings';
  import {
    liquidShapes,
    liquidUnits,
    liquidBindingKeys,
    liquidColorKeys,
    liquidActiveBindings,
    liquidNeedsCapacity,
  } from './nativeLiquidCore';
  const props = defineProps<{ modelValue: NativeOptions }>();
  const emit = defineEmits<{ (event: 'update:modelValue', value: NativeOptions): void }>();
  const value = computed(() => withNativeSettings(props.modelValue).liquid);
  const units = ['%', ...Object.keys(liquidUnits)];
  const activeColors = computed(() =>
    liquidColorKeys.filter(
      (key) =>
        key === 'tankColor' ||
        key === 'liquidColor' ||
        (value.value.layout !== 'simple' && (key !== 'backgroundOverlayColor' || value.value.showOverlay)),
    ),
  );
  const bindingLabels = { shape: '形状', capacity: '总容量', capacityUnits: '容量单位', displayUnits: '显示单位' };
  const colorLabels = {
    tankColor: '容器颜色',
    liquidColor: '液体颜色',
    valueColor: '数值颜色',
    backgroundOverlayColor: '数值底板颜色',
  };
  function change(update: (value: NativeLiquidSettings) => void) {
    const next = withNativeSettings(props.modelValue);
    update(next.liquid);
    emit('update:modelValue', next);
  }
  function set(key: keyof NativeLiquidSettings, event: Event, type = 'string') {
    const input = event.target as HTMLInputElement;
    change(
      (v) =>
        ((v as any)[key] = type === 'number' ? Number(input.value) : type === 'boolean' ? input.checked : input.value),
    );
  }
  function font(event: Event) {
    emit('update:modelValue', {
      ...withNativeSettings(props.modelValue),
      fontSize: Number((event.target as HTMLInputElement).value),
    });
  }
  function binding(key: (typeof liquidBindingKeys)[number], event: Event) {
    change((v) => {
      if ((event.target as HTMLInputElement).checked)
        v.bindings[key] = {
          name: { shape: 'tankShape', capacity: 'volume', capacityUnits: 'volumeUnits', displayUnits: 'units' }[key],
          scope: 'SERVER_SCOPE',
        };
      else delete v.bindings[key];
    });
  }
  function bindingField(key: (typeof liquidBindingKeys)[number], field: 'name' | 'scope', event: Event) {
    change((v) => ((v.bindings[key] as any)[field] = (event.target as HTMLInputElement).value));
  }
  function rangeNumber(key: (typeof liquidColorKeys)[number], index: number, field: 'from' | 'to', event: Event) {
    const raw = (event.target as HTMLInputElement).value;
    change((v) => (v[key].ranges[index][field] = raw === '' ? null : Number(raw)));
  }
</script>
<style scoped>
  .liquid-editor {
    padding: 18px;
    background: white;
    margin-bottom: 16px;
    border-radius: 4px;
    color: #37474f;
  }
  .fields {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    margin: 10px 0;
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 6px 0;
  }
  input:not([type='checkbox']),
  select {
    border: 1px solid #cbd5df;
    padding: 7px;
    background: white;
    max-width: 180px;
  }
  fieldset {
    border: 1px solid #dae1e7;
    margin: 12px 0;
    padding: 12px;
  }
  button {
    border: 1px solid #cbd5df;
    padding: 7px 12px;
    color: #30597f;
    background: #f7fafc;
    cursor: pointer;
  }
  p {
    font-size: 12px;
    color: #60727d;
  }
</style>
