import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as core from '../src/views/tb/dashboard/runtime/native/nativeCountCore';

const source = fs.readFileSync(
  new URL('../src/views/tb/dashboard/runtime/native/NativeCountView.vue', import.meta.url),
  'utf8',
);
const script = compileScript(parse(source).descriptor, { id: 'native-count-test' });
const output = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const calls: { kind: string; query: any }[] = [];
const context = vm.createContext({
  exports: {},
  setTimeout: () => 1,
  clearTimeout: () => {},
  require: (name: string) => {
    if (name === 'vue') return vue;
    if (name === '/@/components/Icon') return { Icon: {} };
    if (name === './nativeCountCore') return core;
    if (name === '/@/api/tb/entityQuery')
      return {
        countEntitiesByQuery: async (query: any) => {
          calls.push({ kind: 'entity', query });
          return 12;
        },
        countAlarmsByQuery: async (query: any) => {
          calls.push({ kind: 'alarm', query });
          return 0;
        },
      };
    throw new Error(`Unexpected import: ${name}`);
  },
});
vm.runInContext(output, context);
const props = vue.reactive({
  settings: {
    kind: 'entity' as const,
    entityType: 'DEVICE' as const,
    nameFilter: '',
    statusList: [],
    severityList: [],
    typeList: '',
    timeWindowMs: 0,
    label: 'Devices',
    showLabel: true,
    layout: 'column' as const,
    showIcon: true,
    icon: 'devices',
    iconSize: 20,
    iconColor: '#fff',
    iconBackgroundColor: '#f18d17',
    showIconBackground: true,
    valueColor: '#fff',
    valueFontSize: 20,
  },
  fqn: 'entity_count',
  pollMs: 5000,
});
const scope = vue.effectScope();
const state = scope.run(() => context.exports.default.setup(props, { expose() {} }));
await vue.nextTick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(state.value.value, 12);
assert.equal(calls[0].kind, 'entity');
props.settings.kind = 'alarm';
props.settings.entityType = 'ALL';
props.settings.statusList = ['ACTIVE'];
props.fqn = 'alarm_count';
await vue.nextTick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(state.value.value, 0, 'a real zero count must remain visible');
assert.equal(calls[1].kind, 'alarm');
assert.deepEqual(JSON.parse(JSON.stringify(calls[1].query)), { statusList: ['ACTIVE'] });
scope.stop();
console.log('Native count view authenticated query selection and zero display passed');
