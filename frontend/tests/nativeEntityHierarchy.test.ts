import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { withNativeSettings } from '../src/views/tb/dashboard/runtime/native/nativeWidgetSettings';
import * as core from '../src/views/tb/dashboard/runtime/native/nativeEntityHierarchyCore';

const widget = createNativeWidget({ fqn: 'cards.entities_hierarchy' });
assert.equal(widget.config.native.family, 'entityHierarchy');
const source = { type: 'entity', entityType: 'ASSET' as const, entityId: 'root', name: 'Root', dataKeys: [] };
widget.config.datasources = [source];
assert.deepEqual(validateNativeWidget(widget), []);
widget.config.native.entityHierarchy.maxDepth = 2;
widget.config.native.entityHierarchy.relationType = 'Contains';
assert.equal(withNativeSettings(JSON.parse(JSON.stringify(widget.config.native))).entityHierarchy.maxDepth, 2);
const root = core.nativeHierarchyRoot(source);
const children = core.nativeHierarchyChildren(
  root,
  [
    { type: 'Contains', to: { entityType: 'DEVICE', id: 'b' }, toName: 'Beta' },
    { type: 'Contains', to: { entityType: 'DEVICE', id: 'a' }, toName: 'Alpha' },
    { type: 'Contains', to: { entityType: 'ASSET', id: 'root' }, toName: 'Cycle' },
    { type: 'Other', to: { entityType: 'DEVICE', id: 'c' }, toName: 'Other' },
  ],
  widget.config.native.entityHierarchy,
);
assert.deepEqual(
  children.map((child) => child.name),
  ['Alpha', 'Beta'],
);
assert.equal(core.nativeHierarchyVisible(root, { [root.key]: children }, { [root.key]: true }).length, 3);
widget.config.native.entityHierarchy.maxDepth = 6;
assert.ok(validateNativeWidget(widget).length > 0);
widget.config.native.entityHierarchy.maxDepth = 2;

const viewSource = fs.readFileSync(
  new URL('../src/views/tb/dashboard/runtime/native/NativeEntityHierarchyView.vue', import.meta.url),
  'utf8',
);
const script = compileScript(parse(viewSource).descriptor, { id: 'native-hierarchy-test' });
const output = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const calls: string[] = [];
const unmount: (() => void)[] = [];
const context = vm.createContext({
  exports: {},
  require: (name: string) => {
    if (name === 'vue') return { ...vue, onBeforeUnmount: (callback: () => void) => unmount.push(callback) };
    if (name === './nativeEntityHierarchyCore') return core;
    if (name === '/@/api/tb/relation')
      return {
        findRelationInfoListByFrom: async (params: any) => {
          calls.push(`FROM:${params.fromId}`);
          return [{ type: 'Contains', to: { entityType: 'DEVICE', id: 'a' }, toName: 'Alpha' }];
        },
        findRelationInfoListByTo: async (params: any) => {
          calls.push(`TO:${params.toId}`);
          return [{ type: 'Contains', from: { entityType: 'ASSET', id: 'parent' }, fromName: 'Parent' }];
        },
      };
    throw new Error(`Unexpected import: ${name}`);
  },
});
vm.runInContext(output, context);
const props = vue.reactive({ source, settings: widget.config.native.entityHierarchy });
const scope = vue.effectScope();
const state = scope.run(() => context.exports.default.setup(props, { expose() {} }));
await vue.nextTick();
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(calls, ['FROM:root']);
assert.equal(state.rows.value.length, 2);
props.settings.direction = 'TO';
await vue.nextTick();
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(calls, ['FROM:root', 'TO:root']);
assert.equal(state.rows.value[1].name, 'Parent');
unmount.forEach((callback) => callback());
scope.stop();
console.log('native entity hierarchy root, relation query, cycles and config roundtrip passed');
