<template>
  <section v-for="group in groups" :key="group.title" class="ns-panel">
    <h3>{{ group.title }}</h3>
    <div class="ns-fields">
      <label v-for="field in group.fields" :key="field.path" :class="{ 'ns-check': field.type === 'checkbox' }">
        <span>{{ field.label }}</span>
        <select v-if="field.choices" :value="read(field.path)" @change="write(field, $event)">
          <option v-for="choice in field.choices" :key="String(choice[0])" :value="choice[0]">{{ choice[1] }}</option>
        </select>
        <input
          v-else-if="field.type === 'checkbox'"
          type="checkbox"
          :checked="Boolean(read(field.path))"
          @change="write(field, $event)"
        />
        <input
          v-else
          :type="field.type || 'text'"
          :value="read(field.path)"
          :min="field.min"
          :max="field.max"
          :step="field.step || 1"
          @input="write(field, $event)"
        />
      </label>
    </div>
  </section>
  <section v-if="historical && mode === 'advanced'" class="ns-panel">
    <h3
      >Y 轴 <button type="button" :disabled="normalized.chart.axes.length >= 4" @click="addAxis">添加坐标轴</button></h3
    >
    <div v-for="(axis, index) in normalized.chart.axes" :key="axis.id" class="ns-axis">
      <label>标识<input :value="axis.id" disabled /></label>
      <label>标题<input :value="axis.label" @input="axisField(index, 'label', $event)" /></label>
      <label
        >位置<select :value="axis.position" @change="axisField(index, 'position', $event)"
          ><option value="left">左侧</option
          ><option value="right">右侧</option></select
        ></label
      >
      <label>下限（空为自动）<input type="number" :value="axis.min" @input="axisField(index, 'min', $event)" /></label>
      <label>上限（空为自动）<input type="number" :value="axis.max" @input="axisField(index, 'max', $event)" /></label>
      <button type="button" :disabled="index === 0" @click="removeAxis(index)">删除</button>
    </div>
    <p>最多 4 个 Y 轴；删除后，关联的序列与阈值线自动转到第一个坐标轴。</p>
  </section>
  <section v-if="historical && mode === 'advanced'" class="ns-panel">
    <h3>图表阈值线 <button type="button" @click="addThreshold">添加阈值线</button></h3>
    <div v-for="(threshold, index) in normalized.chart.thresholds" :key="index" class="ns-axis">
      <label
        >数值<input type="number" :value="threshold.value" @input="thresholdField(index, 'value', $event)"
      /></label>
      <label>名称<input :value="threshold.label" @input="thresholdField(index, 'label', $event)" /></label>
      <label>颜色<input type="color" :value="threshold.color" @input="thresholdField(index, 'color', $event)" /></label>
      <label
        >坐标轴<select :value="threshold.axisId" @change="thresholdField(index, 'axisId', $event)"
          ><option v-for="axis in normalized.chart.axes" :key="axis.id" :value="axis.id">{{
            axis.label || axis.id
          }}</option></select
        ></label
      >
      <button type="button" @click="removeThreshold(index)">删除</button>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import type { NativeOptions } from './nativeWidgetTypes';
  import { withNativeSettings } from './nativeWidgetSettings';

  const props = defineProps<{ modelValue: NativeOptions; mode: 'basic' | 'advanced' }>();
  const emit = defineEmits<{
    (event: 'update:modelValue', value: NativeOptions): void;
    (event: 'remove-axis', id: string, replacement: string): void;
  }>();
  const normalized = computed(() => withNativeSettings(props.modelValue));
  const historical = computed(() =>
    ['timeseries', 'valueChart', 'bar', 'range', 'aggregate', 'state'].includes(props.modelValue.family),
  );
  type Field = {
    path: string;
    label: string;
    type?: string;
    min?: number;
    max?: number;
    step?: number;
    choices?: [string | number, string][];
  };
  const choice = (path: string, label: string, choices: [string | number, string][]): Field => ({
    path,
    label,
    choices,
  });
  const toggle = (path: string, label: string): Field => ({ path, label, type: 'checkbox' });
  const number = (path: string, label: string, min: number, max: number): Field => ({
    path,
    label,
    type: 'number',
    min,
    max,
  });
  const color = (path: string, label: string): Field => ({ path, label, type: 'text' });
  const groups = computed(() => {
    const family = props.modelValue.family;
    const result: { title: string; fields: Field[] }[] = [];
    if (props.mode === 'basic') {
      if (['value', 'valueChart', 'progress'].includes(family))
        result.push({
          title: '数值与布局',
          fields: [
            toggle('presentation.showValue', '显示数值'),
            toggle('showLabel', '显示字段名称'),
            toggle('showDate', '显示更新时间'),
            number('fontSize', '数值字号', 10, 96),
            choice('presentation.layout', '布局', [
              ['vertical', '纵向'],
              ['horizontal', '横向'],
            ]),
            choice('presentation.labelPosition', '标签位置', [
              ['top', '上方'],
              ['bottom', '下方'],
              ['left', '左侧'],
            ]),
          ],
        });
      if (['gauge', 'progress'].includes(family))
        result.push({
          title: '量程',
          fields: [
            { path: 'min', label: '量程下限', type: 'number' },
            { path: 'max', label: '量程上限', type: 'number' },
          ],
        });
      if (family === 'progress')
        result.push({
          title: '进度条',
          fields: [
            choice('progress.direction', '方向', [
              ['horizontal', '水平'],
              ['vertical', '垂直'],
            ]),
            toggle('progress.showTicks', '显示上下限'),
            color('progress.trackColor', '轨道颜色'),
          ],
        });
      if (family === 'gauge')
        result.push({
          title: '仪表',
          fields: [
            choice('gauge.type', '仪表形状', [
              ['radial', '圆形指针'],
              ['arc', '弧形'],
              ['linear', '条形'],
              ['thermometer', '温度计'],
            ]),
            toggle('showLabel', '显示名称'),
            toggle('presentation.showValue', '显示数值'),
            number('fontSize', '数值字号', 10, 96),
            ...(normalized.value.gauge.type === 'linear'
              ? [
                  choice('gauge.direction', '方向', [
                    ['horizontal', '水平'],
                    ['vertical', '垂直'],
                  ]),
                ]
              : []),
          ],
        });
      if (family === 'pie')
        result.push({
          title: '饼图与环形图',
          fields: [
            number('pie.innerRadius', '内径（%）', 0, 60),
            toggle('pie.showPercent', '显示百分比'),
            toggle('showLabel', '显示标签'),
            toggle('showLegend', '显示图例'),
            toggle('pie.clockwise', '顺时针排列'),
            ...(normalized.value.pie.innerRadius > 0 ? [toggle('pie.showTotal', '显示中心合计')] : []),
            ...(normalized.value.pie.innerRadius > 0 && normalized.value.pie.showTotal
              ? [
                  { path: 'pie.totalLabel', label: '合计标题' },
                  { path: 'pie.totalUnits', label: '合计单位' },
                  number('pie.totalDecimals', '合计小数位', 0, 8),
                  number('fontSize', '合计字号', 10, 96),
                ]
              : []),
          ],
        });
      if (['radar', 'polar'].includes(family))
        result.push({
          title: family === 'radar' ? '雷达图' : '极区图',
          fields: [
            toggle('showLegend', '显示图例'),
            toggle('showLabel', '显示数值标签'),
            toggle('radial.showAxisLabels', '显示字段名称'),
            toggle('radial.showTickLabels', '显示刻度值'),
            number('radial.startAngle', '起始角度', -360, 360),
            number('radial.splitNumber', '刻度分段', 1, 20),
            { path: 'radial.min', label: '数值下限（空为自动）', type: 'number' },
            { path: 'radial.max', label: '数值上限（空为自动）', type: 'number' },
            ...(family === 'polar'
              ? [number('radial.barWidth', '扇区宽度（%）', 1, 100)]
              : [
                  choice('radial.shape', '网格形状', [
                    ['polygon', '多边形'],
                    ['circle', '圆形'],
                  ]),
                  toggle('radial.normalizeAxes', '各轴使用统一范围'),
                  color('radial.color', '折线颜色'),
                  toggle('radial.showLine', '显示折线'),
                  number('radial.lineWidth', '线宽', 0, 20),
                  choice('radial.lineType', '线型', [
                    ['solid', '实线'],
                    ['dashed', '虚线'],
                    ['dotted', '点线'],
                  ]),
                  toggle('radial.showPoints', '显示数据点'),
                  number('radial.pointSize', '数据点大小', 0, 50),
                  choice('radial.pointShape', '数据点形状', [
                    ['circle', '圆'],
                    ['rect', '矩形'],
                    ['roundRect', '圆角矩形'],
                    ['triangle', '三角形'],
                    ['diamond', '菱形'],
                    ['pin', '标记'],
                    ['arrow', '箭头'],
                  ]),
                  toggle('radial.fillArea', '填充区域'),
                  { path: 'radial.areaOpacity', label: '填充透明度', type: 'number', min: 0, max: 1, step: 0.05 },
                ]),
          ],
        });
      if (family === 'latestBar')
        result.push({
          title: '最新值柱形图',
          fields: [
            toggle('latestBar.horizontal', '水平排列'),
            toggle('showLabel', '显示数值标签'),
            toggle('showLegend', '显示图例'),
            toggle('latestBar.showAxisLabels', '显示字段名称'),
            number('latestBar.barWidth', '柱宽', 1, 100),
            { path: 'latestBar.min', label: '数值下限（空为自动）', type: 'number' },
            { path: 'latestBar.max', label: '数值上限（空为自动）', type: 'number' },
          ],
        });
      if (family === 'range')
        result.push({
          title: '范围颜色',
          fields: [
            toggle('range.showBoundaries', '显示颜色区间边界'),
            color('range.outOfRangeColor', '区间外颜色'),
            { path: 'range.fillOpacity', label: '面积填充透明度', type: 'number', min: 0, max: 1, step: 0.05 },
          ],
        });
      if (historical.value)
        result.push({
          title: '图表',
          fields: [
            toggle('showLegend', '显示图例'),
            toggle('chart.dataZoom', '允许时间缩放'),
            ...(['range', 'state'].includes(family) ? [] : [toggle('chart.stack', '堆叠序列')]),
          ],
        });
      if (family === 'table')
        result.push({
          title: '表格',
          fields: [
            toggle('table.search', '允许搜索'),
            toggle('table.showTimestamp', '显示时间列'),
            toggle('table.stickyHeader', '固定表头'),
            toggle('table.pagination', '分页'),
            number('table.pageSize', '每页条数', 1, 100),
            choice('table.sortOrder', '时间排序', [
              ['desc', '最新在前'],
              ['asc', '最早在前'],
            ]),
          ],
        });
    } else {
      if (['value', 'valueChart', 'progress', 'gauge'].includes(family))
        result.push({
          title: '文字样式',
          fields: [
            number('presentation.labelFontSize', '标签字号', 10, 48),
            color('presentation.labelColor', '标签颜色'),
            color('presentation.valueColor', '默认数值颜色（留空跟随字段）'),
          ],
        });
      if (['value', 'valueChart', 'progress', 'table', 'aggregate', 'liquid'].includes(family))
        result.push({
          title: '日期显示',
          fields: [
            choice('presentation.dateFormat', '日期格式', [
              ['locale', '日期与时间'],
              ['date', '仅日期'],
              ['time', '仅时间'],
              ['iso', 'ISO 8601'],
              ['relative', '相对时间'],
            ]),
          ],
        });
      if (historical.value || ['pie', 'latestBar', 'radar', 'polar', 'range', 'aggregate', 'state'].includes(family))
        result.push({
          title: '图例与交互',
          fields: [
            choice('chart.legendPosition', '图例位置', [
              ['top', '上'],
              ['bottom', '下'],
              ['left', '左'],
              ['right', '右'],
            ]),
            toggle('chart.tooltip', '显示提示框'),
            toggle('chart.animation', '启用动画'),
          ],
        });
      if (family === 'gauge')
        result.push({
          title: '刻度与指针',
          fields: [
            ...(['radial', 'arc'].includes(normalized.value.gauge.type)
              ? [
                  number('gauge.startAngle', '起始角度', -360, 360),
                  number('gauge.endAngle', '结束角度', -360, 360),
                  toggle('gauge.showPointer', '显示指针'),
                ]
              : []),
            number('gauge.splitNumber', '主刻度分段数', 1, 30),
            number('gauge.width', '仪表宽度', 1, 40),
            toggle('gauge.showTicks', '显示刻度'),
          ],
        });
    }
    return result;
  });
  function read(path: string) {
    return path.split('.').reduce((value: any, key) => value?.[key], normalized.value);
  }
  function change(update: (options: ReturnType<typeof withNativeSettings>) => void) {
    const next = JSON.parse(JSON.stringify(normalized.value));
    update(next);
    emit('update:modelValue', next);
  }
  function write(field: Field, event: Event) {
    const input = event.target as HTMLInputElement;
    const value =
      field.type === 'checkbox'
        ? input.checked
        : field.type === 'number'
          ? input.value === ''
            ? null
            : Number(input.value)
          : input.value;
    change((next) => {
      const keys = field.path.split('.');
      const parent = keys.slice(0, -1).reduce((result: any, key) => result[key], next);
      parent[keys.at(-1)!] = value;
    });
  }
  function addAxis() {
    if (normalized.value.chart.axes.length >= 4) return;
    change((next) => {
      let count = 2;
      while (next.chart.axes.some((axis) => axis.id === `axis-${count}`)) count++;
      next.chart.axes.push({ id: `axis-${count}`, label: '', position: 'right', min: null, max: null });
    });
  }
  function axisField(index: number, field: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    change((next) => {
      (next.chart.axes[index] as any)[field] = ['min', 'max'].includes(field)
        ? value === ''
          ? null
          : Number(value)
        : value;
    });
  }
  function removeAxis(index: number) {
    if (index < 1 || !normalized.value.chart.axes[index]) return;
    const removed = normalized.value.chart.axes[index].id;
    const replacement = normalized.value.chart.axes[0].id;
    change((next) => {
      next.chart.axes.splice(index, 1);
      next.chart.thresholds.forEach((threshold) => {
        if (threshold.axisId === removed) threshold.axisId = replacement;
      });
    });
    emit('remove-axis', removed, replacement);
  }
  function addThreshold() {
    change((next) => {
      next.chart.thresholds.push({ value: 0, label: '', color: '#e96a46', axisId: next.chart.axes[0].id });
    });
  }
  function thresholdField(index: number, field: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    change((next) => {
      (next.chart.thresholds[index] as any)[field] = field === 'value' ? Number(value) : value;
    });
  }
  function removeThreshold(index: number) {
    change((next) => {
      next.chart.thresholds.splice(index, 1);
    });
  }
</script>

<style scoped>
  .ns-panel {
    background: #fff;
    padding: 18px;
    border-radius: 5px;
    margin-bottom: 16px;
  }
  h3 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 15px;
    margin: 0 0 18px;
    font-weight: 600;
  }
  .ns-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: #4c5861;
    font-size: 13px;
  }
  input,
  select,
  button {
    font: inherit;
    color: #344857;
    background: #fff;
    border: 1px solid #d5dce0;
    border-radius: 4px;
    padding: 8px;
    min-width: 0;
  }
  button {
    cursor: pointer;
    color: #30577f;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  input[type='color'] {
    width: 52px;
    height: 36px;
    padding: 3px;
  }
  .ns-check {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  input[type='checkbox'] {
    accent-color: #30577f;
    width: 18px;
    height: 18px;
  }
  .ns-axis {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 12px 0;
    padding: 12px;
    border: 1px solid #e2e7ea;
    border-radius: 4px;
    align-items: end;
  }
  p {
    font-size: 12px;
    color: #73818b;
  }
  @media (max-width: 600px) {
    .ns-fields,
    .ns-axis {
      grid-template-columns: 1fr;
    }
  }
</style>
