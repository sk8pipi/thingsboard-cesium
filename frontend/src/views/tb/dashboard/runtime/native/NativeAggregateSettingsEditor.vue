<template>
  <section class="aggregate-settings">
    <h3>聚合数值与比较</h3>
    <label
      ><input type="checkbox" :checked="value.showChart" @change="setFlag('showChart', $event)" />显示历史曲线</label
    >
    <label
      ><input
        type="checkbox"
        :checked="value.showSubtitle"
        @change="setFlag('showSubtitle', $event)"
      />显示副标题</label
    >
    <label><input type="checkbox" :checked="modelValue.showDate" @change="setDateFlag($event)" />显示数值时间</label>
    <label>副标题<input :value="value.subtitle" @input="setText($event)" /></label>
    <p
      >每个数值位置独立聚合；曲线的聚合设置在时间窗口中。数据比较使用固定历史或日历窗口；日、周、月、年偏移按 UTC
      计算。</p
    >
    <fieldset v-for="(slot, index) in value.slots" :key="slot.id">
      <legend>{{ positions.find((item) => item[0] === slot.position)?.[1] }}数值</legend>
      <label
        >位置<select :value="slot.position" @change="setSlot(index, 'position', $event)"
          ><option v-for="position in positions" :key="position[0]" :value="position[0]">{{
            position[1]
          }}</option></select
        ></label
      >
      <label>标签<input :value="slot.label" @input="setSlot(index, 'label', $event)" /></label>
      <label
        >数值聚合<select :value="slot.aggregationType" @change="setSlot(index, 'aggregationType', $event)"
          ><option v-for="item in aggregations" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select
        ></label
      >
      <label
        ><input
          type="checkbox"
          :checked="slot.comparisonEnabled"
          @change="setSlot(index, 'comparisonEnabled', $event, 'boolean')"
        />启用数据比较</label
      >
      <template v-if="slot.comparisonEnabled">
        <label
          >比较时间<select :value="slot.timeForComparison" @change="setSlot(index, 'timeForComparison', $event)"
            ><option v-for="item in offsets" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select
          ></label
        >
        <label v-if="slot.timeForComparison === 'customInterval'"
          >偏移毫秒<input
            type="number"
            min="1"
            :value="slot.comparisonCustomIntervalValue"
            @input="setSlot(index, 'comparisonCustomIntervalValue', $event, 'number')"
        /></label>
        <label
          >比较结果<select :value="slot.comparisonResultType" @change="setSlot(index, 'comparisonResultType', $event)"
            ><option value="PREVIOUS_VALUE">上一时段的值</option
            ><option value="DELTA_ABSOLUTE">差值</option
            ><option value="DELTA_PERCENT">变化百分比</option></select
          ></label
        >
      </template>
      <label>单位<input :value="slot.units" @input="setSlot(index, 'units', $event)" /></label>
      <label
        >小数位<input
          type="number"
          min="0"
          max="8"
          :value="slot.decimals"
          @input="setSlot(index, 'decimals', $event, 'number')"
      /></label>
      <label
        >字号<input
          type="number"
          min="10"
          max="96"
          :value="slot.fontSize"
          @input="setSlot(index, 'fontSize', $event, 'number')"
      /></label>
      <label>颜色<input type="color" :value="slot.color" @input="setSlot(index, 'color', $event)" /></label>
      <label
        ><input
          type="checkbox"
          :checked="slot.showArrow"
          @change="setSlot(index, 'showArrow', $event, 'boolean')"
        />显示方向箭头</label
      >
      <button
        type="button"
        :disabled="value.slots.length === 1"
        @click="change((options) => options.slots.splice(index, 1))"
        >删除数值</button
      >
    </fieldset>
    <button type="button" :disabled="value.slots.length >= 5" @click="addSlot">添加数值位置</button>
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import type { NativeOptions, NativeAggregateSlot } from './nativeWidgetTypes';
  import { withNativeSettings } from './nativeWidgetSettings';
  const props = defineProps<{ modelValue: NativeOptions }>();
  const emit = defineEmits<{ (event: 'update:modelValue', value: NativeOptions): void }>();
  const value = computed(() => withNativeSettings(props.modelValue).aggregate);
  const positions = [
    ['center', '中心'],
    ['leftTop', '左上'],
    ['leftBottom', '左下'],
    ['rightTop', '右上'],
    ['rightBottom', '右下'],
  ] as const;
  const aggregations = [
    ['NONE', '最新值'],
    ['AVG', '平均值'],
    ['MIN', '最小值'],
    ['MAX', '最大值'],
    ['SUM', '总和'],
    ['COUNT', '样本数'],
  ];
  const offsets = [
    ['previousInterval', '上一等长时段'],
    ['customInterval', '自定义偏移'],
    ['day', '前一天（UTC）'],
    ['week', '前一周（UTC）'],
    ['month', '前一月（UTC）'],
    ['year', '前一年（UTC）'],
  ];
  function change(update: (options: NonNullable<NativeOptions['aggregate']>) => void) {
    const next = withNativeSettings(props.modelValue);
    update(next.aggregate);
    emit('update:modelValue', next);
  }
  function setSlot(index: number, key: keyof NativeAggregateSlot, event: Event, type = 'string') {
    const input = event.target as HTMLInputElement;
    change((options) => {
      (options.slots[index] as any)[key] =
        type === 'number' ? Number(input.value) : type === 'boolean' ? input.checked : input.value;
    });
  }
  function setFlag(key: 'showChart' | 'showSubtitle', event: Event) {
    change((options) => {
      options[key] = (event.target as HTMLInputElement).checked;
    });
  }
  function setDateFlag(event: Event) {
    emit('update:modelValue', {
      ...withNativeSettings(props.modelValue),
      showDate: (event.target as HTMLInputElement).checked,
    });
  }
  function setText(event: Event) {
    change((options) => {
      options.subtitle = (event.target as HTMLInputElement).value;
    });
  }
  function addSlot() {
    const position = positions.find((item) => !value.value.slots.some((slot) => slot.position === item[0]));
    if (!position) return;
    change((options) =>
      options.slots.push({
        id: `slot-${Date.now()}`,
        position: position[0],
        label: '',
        aggregationType: 'AVG',
        comparisonEnabled: false,
        timeForComparison: 'previousInterval',
        comparisonCustomIntervalValue: 86400000,
        comparisonResultType: 'DELTA_ABSOLUTE',
        units: '',
        decimals: 1,
        showArrow: false,
        fontSize: 16,
        color: '#dae9f6',
      }),
    );
  }
</script>
<style scoped>
  .aggregate-settings {
    background: #fff;
    padding: 18px;
    margin-bottom: 16px;
    border-radius: 4px;
  }
  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    border: 1px solid #d9dfe5;
    padding: 12px;
    margin: 12px 0;
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 4px;
    font-size: 13px;
  }
  input:not([type='checkbox']),
  select {
    max-width: 180px;
    padding: 5px;
    border: 1px solid #d9dfe5;
    border-radius: 4px;
  }
  p {
    color: #657585;
    font-size: 12px;
  }
  button {
    padding: 5px 10px;
    border: 1px solid #d9dfe5;
    border-radius: 4px;
    color: #315b80;
    background: #fff;
  }
  button:disabled {
    opacity: 0.5;
  }
</style>
