import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import * as core from '../src/views/tb/dashboard/runtime/native/nativeAlarmTableCore';

const source = fs.readFileSync(
  new URL('../src/views/tb/dashboard/runtime/native/NativeAlarmTableView.vue', import.meta.url),
  'utf8',
);
const script = compileScript(parse(source).descriptor, { id: 'native-alarm-table-test' });
const output = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const calls: { kind: string; value: any }[] = [];
const timers = new Map<number, () => void>();
let timerId = 0;
const context = vm.createContext({
  exports: {},
  setTimeout: (callback: () => void) => {
    timers.set(++timerId, callback);
    return timerId;
  },
  clearTimeout: (id: number) => timers.delete(id),
  require: (name: string) => {
    if (name === 'vue') return vue;
    if (name === './nativeAlarmTableCore') return core;
    if (name === '../widgets/alarm/api')
      return {
        fetchAlarmPage: async (query: any) => {
          calls.push({ kind: 'read', value: query });
          return {
            data: [
              {
                id: 'alarm-1',
                name: 'High temperature',
                type: 'Temperature',
                severity: 'MAJOR',
                status: 'ACTIVE_UNACK',
                createdTime: 123,
                originator: { name: 'Device' },
              },
            ],
            totalElements: 1,
            totalPages: 1,
          };
        },
        ackAlarm: async (id: string) => {
          calls.push({ kind: 'ack', value: id });
        },
        clearAlarm: async (id: string) => {
          calls.push({ kind: 'clear', value: id });
        },
      };
    throw new Error(`Unexpected import: ${name}`);
  },
});
vm.runInContext(output, context);
const widget = createNativeWidget({ fqn: 'alarm_widgets.alarms_table' });
const props = vue.reactive({
  settings: widget.config.native.alarmTable,
  options: widget.config.native,
  pollMs: 5000,
  previewOnly: true,
});
const scope = vue.effectScope();
const state = scope.run(() => context.exports.default.setup(props, { expose() {} }));
await vue.nextTick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(state.rows.value[0].id, 'alarm-1');
assert.equal(calls[0].kind, 'read');
await state.mutate('ack', 'alarm-1');
assert.equal(calls.length, 1, 'preview must not mutate alarms');
props.previewOnly = false;
await state.mutate('ack', 'alarm-1');
await vue.nextTick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(calls[1].kind, 'ack');
assert.equal(calls[2].kind, 'read', 'successful action refreshes alarm table');
scope.stop();
assert.equal(timers.size, 0, 'unmount clears polling timer');
console.log('native alarm table preview and action behavior passed');
