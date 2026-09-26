<template>
  <section class="indicator-editor">
    <h3>{{ kind === 'battery' ? '电池电量' : '信号强度' }}</h3>
    <div v-if="kind === 'battery'" class="fields">
      <label
        >布局<select :value="battery.layout" @change="set('layout', $event)">
          <option value="vertical_solid">竖向实心</option
          ><option value="horizontal_solid">横向实心</option>
          <option value="vertical_divided">竖向分段</option
          ><option value="horizontal_divided">横向分段</option>
        </select></label
      >
      <label v-if="battery.layout.endsWith('divided')"
        >分段数量<input
          type="number"
          min="2"
          max="12"
          :value="battery.sectionsCount"
          @input="set('sectionsCount', $event, 'number')"
      /></label>
      <label class="check"
        ><input
          type="checkbox"
          :checked="battery.showValue"
          @change="set('showValue', $event, 'boolean')"
        />显示电量数值</label
      >
      <label v-if="battery.showValue" class="check"
        ><input
          type="checkbox"
          :checked="battery.autoScaleValueSize"
          @change="set('autoScaleValueSize', $event, 'boolean')"
        />自适应数值宽度</label
      >
      <label v-if="battery.showValue"
        >数值字号<input
          type="number"
          min="10"
          max="96"
          :value="battery.valueFontSize"
          @input="set('valueFontSize', $event, 'number')"
      /></label>
    </div>
    <div v-else class="fields">
      <label
        >形状<select :value="signal.layout" @change="set('layout', $event)"
          ><option value="wifi">Wi-Fi</option
          ><option value="cellular_bar">蜂窝信号</option></select
        ></label
      >
      <label
        >无信号阈值（dBm）<input
          type="number"
          :value="signal.noSignalRssiValue"
          @input="set('noSignalRssiValue', $event, 'number')"
      /></label>
      <label>未激活颜色<input :value="signal.inactiveBarsColor" @input="set('inactiveBarsColor', $event)" /></label>
      <label class="check"
        ><input
          type="checkbox"
          :checked="signal.showDate"
          @change="set('showDate', $event, 'boolean')"
        />显示更新时间</label
      >
      <template v-if="signal.showDate">
        <label
          >时间格式<select :value="signal.dateFormat" @change="set('dateFormat', $event)"
            ><option v-for="format in dateFormats" :key="format.value" :value="format.value">{{
              format.label
            }}</option></select
          ></label
        >
        <label
          >时间字号<input
            type="number"
            min="10"
            max="96"
            :value="signal.dateFontSize"
            @input="set('dateFontSize', $event, 'number')"
        /></label>
        <label>时间颜色<input :value="signal.dateColor" @input="set('dateColor', $event)" /></label>
      </template>
      <label class="check"
        ><input
          type="checkbox"
          :checked="signal.showTooltip"
          @change="set('showTooltip', $event, 'boolean')"
        />鼠标悬停提示</label
      >
      <template v-if="signal.showTooltip">
        <label class="check"
          ><input
            type="checkbox"
            :checked="signal.showTooltipValue"
            @change="set('showTooltipValue', $event, 'boolean')"
          />提示显示数值</label
        >
        <template v-if="signal.showTooltipValue"
          ><label
            >提示数值字号<input
              type="number"
              min="10"
              max="96"
              :value="signal.tooltipValueFontSize"
              @input="set('tooltipValueFontSize', $event, 'number')" /></label
          ><label
            >提示数值颜色<input :value="signal.tooltipValueColor" @input="set('tooltipValueColor', $event)" /></label
        ></template>
        <label class="check"
          ><input
            type="checkbox"
            :checked="signal.showTooltipDate"
            @change="set('showTooltipDate', $event, 'boolean')"
          />提示显示时间</label
        >
        <template v-if="signal.showTooltipDate"
          ><label
            >提示时间格式<select :value="signal.tooltipDateFormat" @change="set('tooltipDateFormat', $event)"
              ><option v-for="format in dateFormats" :key="format.value" :value="format.value">{{
                format.label
              }}</option></select
            ></label
          ><label
            >提示时间字号<input
              type="number"
              min="10"
              max="96"
              :value="signal.tooltipDateFontSize"
              @input="set('tooltipDateFontSize', $event, 'number')" /></label
          ><label>提示时间颜色<input :value="signal.tooltipDateColor" @input="set('tooltipDateColor', $event)" /></label
        ></template>
        <label
          >提示底色<input :value="signal.tooltipBackgroundColor" @input="set('tooltipBackgroundColor', $event)"
        /></label>
        <label
          >提示阴影柔和度<input
            type="number"
            min="0"
            max="32"
            :value="signal.tooltipBackgroundBlur"
            @input="set('tooltipBackgroundBlur', $event, 'number')"
        /></label>
      </template>
    </div>
    <div v-if="mode === 'advanced'" class="fields"
      ><label
        >内容留白<input
          type="number"
          min="0"
          max="48"
          :value="current.padding"
          @input="set('padding', $event, 'number')" /></label
    ></div>
    <fieldset v-for="color in colorItems" :key="color.key"
      ><legend>{{ color.label }}</legend>
      <label>默认颜色<input :value="current[color.key].color" @input="setColor(color.key, 'color', $event)" /></label>
      <div v-for="(range, index) in current[color.key].ranges" :key="index" class="fields">
        <label
          >下限<input type="number" :value="range.from ?? ''" @input="setRange(color.key, index, 'from', $event)"
        /></label>
        <label
          >上限<input type="number" :value="range.to ?? ''" @input="setRange(color.key, index, 'to', $event)"
        /></label>
        <label>颜色<input :value="range.color" @input="setRange(color.key, index, 'color', $event)" /></label>
        <button @click="edit((v) => v[color.key].ranges.splice(index, 1))">删除</button>
      </div>
      <button @click="edit((v) => v[color.key].ranges.push({ from: null, to: null, color: '#6ce9ff' }))"
        >添加颜色区间</button
      >
    </fieldset>
    <p>颜色区间包含下限、不包含上限；留空表示无界。原生脚本颜色函数不执行。</p>
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { withNativeSettings } from './nativeWidgetSettings';
  import type { NativeBatterySettings, NativeOptions, NativeSignalSettings } from './nativeWidgetTypes';
  const props = defineProps<{ modelValue: NativeOptions; mode: 'basic' | 'advanced' }>();
  const emit = defineEmits<{ (event: 'update:modelValue', value: NativeOptions): void }>();
  const kind = computed(() => props.modelValue.family as 'battery' | 'signal');
  const battery = computed(() => withNativeSettings(props.modelValue).battery);
  const signal = computed(() => withNativeSettings(props.modelValue).signal);
  const current = computed<any>(() => (kind.value === 'battery' ? battery.value : signal.value));
  const dateFormats = [
    { value: 'relative', label: '相对时间' },
    { value: 'locale', label: '本地日期时间' },
    { value: 'date', label: '日期' },
    { value: 'time', label: '时间' },
    { value: 'iso', label: 'ISO' },
  ];
  const colorItems = computed(() =>
    kind.value === 'battery'
      ? [
          ...(battery.value.showValue ? [{ key: 'valueColor', label: '数值颜色' }] : []),
          { key: 'batteryLevelColor', label: '电量颜色' },
          { key: 'batteryShapeColor', label: '轮廓颜色' },
        ]
      : [{ key: 'activeBarsColor', label: '激活信号颜色' }],
  );
  function edit(update: (settings: any) => void) {
    const next = withNativeSettings(props.modelValue);
    update(kind.value === 'battery' ? next.battery : next.signal);
    emit('update:modelValue', next);
  }
  function set(key: keyof NativeBatterySettings | keyof NativeSignalSettings, event: Event, type = 'string') {
    const input = event.target as HTMLInputElement;
    edit(
      (settings) =>
        (settings[key] = type === 'boolean' ? input.checked : type === 'number' ? Number(input.value) : input.value),
    );
  }
  function setColor(key: string, field: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    edit((settings) => (settings[key][field] = value));
  }
  function setRange(key: string, index: number, field: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    edit(
      (settings) =>
        (settings[key].ranges[index][field] = field === 'color' ? value : value === '' ? null : Number(value)),
    );
  }
</script>
<style scoped>
  .indicator-editor {
    background: white;
    padding: 18px;
    border-radius: 5px;
    margin-bottom: 16px;
  }
  .indicator-editor h3 {
    font-size: 15px;
    margin: 0 0 20px;
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
    font-size: 13px;
    color: #566670;
  }
  label.check {
    flex-direction: row;
    align-items: center;
  }
  input,
  select,
  button {
    font: inherit;
    color: #344857;
    border: 1px solid #d5dce0;
    border-radius: 4px;
    background: white;
    padding: 8px;
    min-width: 0;
  }
  button {
    cursor: pointer;
    width: fit-content;
    margin-bottom: 10px;
  }
  fieldset {
    border: 1px solid #dfe5e9;
    margin: 10px 0;
  }
  legend {
    color: #30577f;
    font-size: 13px;
  }
  p {
    font-size: 12px;
    color: #74838e;
  }
  @media (max-width: 650px) {
    .fields {
      grid-template-columns: 1fr;
    }
  }
</style>
