import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { createNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { resolveNativeOverlayTarget } from '../src/views/tb/dashboard/runtime/native/useNativeOverlayTarget';

const root = '../src/views/tb/';
for (const file of [
  'dashboard/editor.vue',
  'map/MapWidgetEditor.vue',
  'map/SensorPopupWidgetEditor.vue',
  'map/SensorPopupWidgetGrid.vue',
  'dashboard/runtime/native/NativeWidgetComposer.vue',
  'dashboard/runtime/native/NativeWidgetPicker.vue',
  'dashboard/runtime/native/NativeWidgetRenderer.vue',
]) {
  const { descriptor, errors } = parse(fs.readFileSync(new URL(root + file, import.meta.url), 'utf8'));
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: file });
  assert.deepEqual(
    compileTemplate({
      id: file,
      filename: file,
      source: descriptor.template!.content,
      compilerOptions: { bindingMetadata: script.bindings },
    }).errors,
    [],
    file,
  );
}
function functions(file: string, names: string[], globals: any) {
  const source = fs.readFileSync(new URL(root + file, import.meta.url), 'utf8');
  const body = parse(source).descriptor.scriptSetup!.content;
  const ast = ts.createSourceFile('test.ts', body, ts.ScriptTarget.Latest, true);
  const selected = ast.statements.filter(ts.isFunctionDeclaration).filter((node) => names.includes(node.name!.text));
  assert.equal(selected.length, names.length);
  const output = ts.transpileModule(selected.map((node) => node.getText(ast)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const ctx = vm.createContext({ ...globals, result: {} });
  vm.runInContext(output + '\nObject.assign(result,{' + names.join(',') + '});', ctx);
  return ctx.result;
}
const ref = (value: any) => ({ value });
const widget = createNativeWidget({ fqn: 'temperature_card' });
widget.config.datasources = [
  {
    type: 'entity',
    entityType: 'DEVICE',
    entityId: 'device-a',
    dataKeys: [{ name: 'temperature', type: 'timeseries' }],
  },
];
const mapGlobals: any = {
  grid: { addWidget: (entry: any) => added.push(entry) },
  editorMode: ref('editing'),
  isSavingEdit: ref(false),
  widgets: ref({}),
  widgetRegistry: { [widget.widgetKey]: { dashboardPlacement: { width: 5, height: 4 } } },
  nativePickerVisible: ref(true),
  nativeEditSource: ref(null),
  addPanelVisible: ref(true),
  widgetHtml: () => '<section/>',
  mountWidget: () => {},
  syncLayoutFromGrid: () => {},
  renderGrid: () => {
    renders++;
  },
};
const added: any[] = [];
let renders = 0;
const map = functions('map/MapWidgetEditor.vue', ['applyNativeWidget'], mapGlobals);
map.applyNativeWidget(widget);
assert.equal(added.length, 1);
assert.equal(mapGlobals.widgets.value[widget.id].config.native.fqn, 'temperature_card');
assert.equal(mapGlobals.nativePickerVisible.value, false);
map.applyNativeWidget({ ...widget, title: 'changed' });
assert.equal(added.length, 1);
assert.equal(renders, 1);
assert.equal(mapGlobals.widgets.value[widget.id].title, 'changed');
mapGlobals.editorMode.value = 'view';
map.applyNativeWidget({ ...widget, title: 'unauthorized' });
assert.equal(mapGlobals.widgets.value[widget.id].title, 'changed');
let emitted = 0;
const pointGlobals: any = {
  localWidgets: ref([]),
  nativePickerVisible: ref(true),
  nativeEditSource: ref(null),
  emit: () => emitted++,
};
const point = functions('map/SensorPopupWidgetEditor.vue', ['applyNativeWidget', 'toPopupWidgetConfig'], pointGlobals);
point.applyNativeWidget(widget);
assert.equal(pointGlobals.localWidgets.value.length, 1);
assert.equal(emitted, 0, '配置仅改草稿，不提前保存设备位置');
point.applyNativeWidget({ ...widget, title: 'point changed' });
assert.equal(pointGlobals.localWidgets.value.length, 1);
assert.equal(pointGlobals.localWidgets.value[0].typeFullFqn, widget.typeFullFqn);
assert.deepEqual(pointGlobals.localWidgets.value[0].appearance, widget.appearance);
const renderer = fs.readFileSync(
  new URL(root + 'dashboard/runtime/native/NativeWidgetRenderer.vue', import.meta.url),
  'utf8',
);
assert.ok(renderer.includes("backgroundColor: 'transparent'"));
assert.ok(!renderer.includes('backdrop-filter'));
assert.ok(!renderer.includes('v-html'));
assert.ok(!renderer.includes('eval('));
const surface = fs.readFileSync(
  new URL(root + 'dashboard/runtime/widgets/core/widgetSurface.css', import.meta.url),
  'utf8',
);
assert.match(surface, /\.tb-widget-surface--nested\s*\{[^}]*backdrop-filter:\s*none/);
const body = {} as HTMLElement,
  full = {} as Element;
assert.equal(resolveNativeOverlayTarget({ body, fullscreenElement: full }), full);
assert.equal(resolveNativeOverlayTarget({ body, fullscreenElement: null }), body);
let resolveOldKeys!: (keys: string[]) => void;
const keyGlobals: any = {
  generation: 0,
  keyRequests: {},
  loadedKeyTypes: {},
  keyTypes: ref({ device: 'timeseries' }),
  availableKeys: ref({ device: ['stale'] }),
  keyMessages: ref({}),
  keyLoading: ref({}),
  message: ref(''),
  draft: ref(widget),
  getTimeseriesKeys: () => new Promise((resolve) => (resolveOldKeys = resolve)),
  getAttributeKeysByScope: async () => ['model'],
};
const keys = functions('dashboard/runtime/native/NativeWidgetComposer.vue', ['loadKeys', 'addKey'], keyGlobals);
const ds: any = { entityId: 'device', entityType: 'DEVICE', dataKeys: [] };
const old = keys.loadKeys(ds);
assert.equal(keyGlobals.availableKeys.value.device.length, 0, '换范围立即清空');
keyGlobals.keyTypes.value.device = 'SERVER_SCOPE';
const current = keys.loadKeys(ds);
resolveOldKeys(['temperature']);
await Promise.all([old, current]);
keys.addKey(ds, 'temperature');
assert.equal(ds.dataKeys.length, 0, '拒绝过期范围字段');
keys.addKey(ds, 'model');
assert.equal(ds.dataKeys.length, 1);
assert.equal(ds.dataKeys[0].scope, 'SERVER_SCOPE');
console.log('Native SFC / dashboard draft / point editing / glass integration passed');
