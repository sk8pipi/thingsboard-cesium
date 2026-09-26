import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import * as core from '../src/views/tb/dashboard/runtime/native/nativeWidgetDataCore';
import * as stateCore from '../src/views/tb/dashboard/runtime/native/nativeStateCore';
import * as settings from '../src/views/tb/dashboard/runtime/native/nativeWidgetSettings';
import * as chartOptions from '../src/views/tb/dashboard/runtime/native/nativeWidgetChartOptions';
import * as inputCore from '../src/views/tb/dashboard/runtime/native/nativeInputCore';
import * as locationCore from '../src/views/tb/dashboard/runtime/native/nativeLocationInputCore';
import * as ledCore from '../src/views/tb/dashboard/runtime/native/nativeLedCore';

const source = fs.readFileSync(
  new URL('../src/views/tb/dashboard/runtime/native/NativeWidgetRenderer.vue', import.meta.url),
  'utf8',
);
const script = compileScript(parse(source).descriptor, { id: 'rolling-test' });
const output = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

let now = 1_800_000_000_000;
const timers = new Map<number, () => void>();
let nextTimer = 0;
const unmount: (() => void)[] = [];
const updates: any[] = [];
const element = vue.markRaw({});
let disposed = false;
const chart = {
  getDom: () => element,
  getOption: () => ({
    legend: [{ selected: { Temperature: false } }],
    dataZoom: [
      { start: 25, end: 75 },
      { start: 25, end: 75 },
    ],
  }),
  setOption: (option: any) => updates.push(option),
  resize: () => {},
  dispose: () => (disposed = true),
};
const widget = createNativeWidget({ fqn: 'bar_chart' });
widget.config.native.window.realtime = true;
widget.config.native.window.durationMs = 300_000;
const snapshot = vue.shallowRef<core.NativeSnapshot>({
  updatedAt: now,
  loading: false,
  errors: [],
  series: [
    {
      id: 'temperature',
      entityId: 'test',
      label: 'Temperature',
      key: { name: 'temperature', type: 'timeseries' },
      latest: { ts: now - 60_000, value: 25 },
      points: [{ ts: now - 60_000, value: 25 }],
      truncated: false,
    },
  ],
});
const context = vm.createContext({
  exports: {},
  require: (name: string) => {
    if (name === 'vue') return { ...vue, onBeforeUnmount: (fn: () => void) => unmount.push(fn) };
    if (name === './NativeLiquidView') return {};
    if (name === './NativeIndicatorView.vue') return {};
    if (name === './NativeInputView.vue') return {};
    if (name === './NativeLocationInputView.vue') return {};
    if (name === './NativePhotoInputView.vue') return {};
    if (name === './NativeLedView.vue') return {};
    if (name === './NativeWindView.vue') return {};
    if (name === './NativeRpcButtonView.vue') return {};
    if (name === './NativeMultiInputView.vue') return {};
    if (name === './NativeCountView.vue') return {};
    if (name === './NativeAttributeCardView.vue') return {};
    if (name === './NativeAlarmTableView.vue') return {};
    if (name === './NativeDeviceClaimView.vue') return {};
    if (name === './NativeEntityHierarchyView.vue') return {};
    if (name === './NativeEntityTableView.vue') return {};
    if (name === './nativeInputCore') return inputCore;
    if (name === './nativeLocationInputCore') return locationCore;
    if (name === './nativeLedCore') return ledCore;
    if (name === 'echarts') return { init: () => chart };
    if (name === './nativeWidgetData') return { useNativeWidgetData: () => ({ data: snapshot, refresh: () => {} }) };
    if (name === './nativeWidgetDataCore') return core;
    if (name === './nativeStateCore') return stateCore;
    if (name === './nativeWidgetSettings') return settings;
    if (name === './nativeWidgetChartOptions') return chartOptions;
    throw new Error(`Unexpected import: ${name}`);
  },
  Date: class extends Date {
    static override now() {
      return now;
    }
  },
  setInterval: (fn: () => void, ms: number) => {
    assert.equal(ms, 1000);
    timers.set(++nextTimer, fn);
    return nextTimer;
  },
  clearInterval: (id: number) => timers.delete(id),
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
});
vm.runInContext(output, context);
const scope = vue.effectScope();
const props = vue.reactive({ config: widget.config });
const state = scope.run(() => context.exports.default.setup(props, { expose() {} }));
state.chartElement.value = element;
async function flush() {
  await vue.nextTick();
  await vue.nextTick();
}
await flush();
assert.equal(timers.size, 1);
assert.equal(updates.at(-1).xAxis.min, now - 300_000);
assert.equal(updates.at(-1).xAxis.max, now, '横轴右端必须是现在，不能是最后一条遥测时间');
const initialSnapshot = snapshot.value;
now += 1000;
timers.forEach((fn) => fn());
await flush();
assert.equal(snapshot.value, initialSnapshot, '没有新数据也应推进窗口');
assert.equal(updates.at(-1).xAxis.min, now - 300_000);
assert.equal(updates.at(-1).xAxis.max, now);
assert.equal(updates.at(-1).series, undefined, '时钟更新只修改横轴，不重复构建序列');

snapshot.value = { ...initialSnapshot, series: [{ ...initialSnapshot.series[0], points: [], latest: null }] };
await flush();
assert.equal(updates.at(-1).legend.selected.Temperature, false, '轮询不能覆盖用户图例选择');
assert.equal(updates.at(-1).xAxis.max, now, '空数据也保留完整时间范围');
props.config.native.window.realtime = false;
props.config.native.window.startTs = now - 600_000;
props.config.native.window.endTs = now - 300_000;
await flush();
assert.equal(timers.size, 0, '切换到固定历史应释放时钟');
assert.equal(updates.at(-1).xAxis.min, now - 600_000);
assert.equal(updates.at(-1).xAxis.max, now - 300_000);
props.config.native.window.calendar = 'month';
now = Date.UTC(2026, 8, 30, 23, 59, 59);
await flush();
assert.equal(timers.size, 1, '日历窗口需要独立时钟');
assert.equal(updates.at(-1).xAxis.min, Date.UTC(2026, 8, 1));
now = Date.UTC(2026, 9, 1, 0, 0, 1);
timers.forEach((fn) => fn());
await flush();
assert.equal(updates.at(-1).xAxis.min, Date.UTC(2026, 9, 1), '跨月自动移动起点');
assert.equal(updates.at(-1).xAxis.max, now);
delete props.config.native.window.calendar;
await flush();
assert.equal(timers.size, 0);
props.config.native.window.realtime = true;
await flush();
assert.equal(timers.size, 1);
const stateWidget = createNativeWidget({ fqn: 'state_chart' });
stateWidget.config.native.window.durationMs = 60000;
props.config = stateWidget.config;
snapshot.value = {
  ...initialSnapshot,
  series: [{ ...initialSnapshot.series[0], points: [], latest: null, previous: { ts: now - 100000, value: false } }],
};
await flush();
assert.equal(state.hasChartData.value, true, '仅有窗口前布尔状态仍应显示');
assert.equal(updates.at(-1).series[0].data.at(-1).value[0], now);
now += 1000;
timers.forEach((fn) => fn());
await flush();
assert.equal(updates.at(-1).series[0].data.at(-1).value[0], now, '无新遥测时状态线延续至新窗口末尾');
assert.equal(updates.at(-1).series[0].data[0].value[0], now - 60000);
assert.equal(updates.at(-1).legend.selected.Temperature, false);
assert.equal(updates.at(-1).dataZoom[0].start, 25);
unmount.forEach((fn) => fn());
scope.stop();
assert.equal(timers.size, 0, '卸载应释放时钟');
assert.equal(disposed, true);
console.log('Native rolling window renderer tests passed');
