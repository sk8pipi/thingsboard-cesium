import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { nativeWidgetCatalog, createNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { nativeSeriesSettings } from '../src/views/tb/dashboard/runtime/native/nativeWidgetSettings';
import { resolveNativeOverlayTarget } from '../src/views/tb/dashboard/runtime/native/useNativeOverlayTarget';
import {
  DEFAULT_MAP_TEMPLATE_VIEWPORT,
  normalizeMapTemplateState,
  resolveMapTemplateViewportForLayout,
} from '../src/views/tb/map/mapTemplateConfig';
import { calculateGridStackCellHeight } from '../src/views/tb/map/mapScreenResponsive';

const root = '../src/views/tb/';
for (const file of [
  'dashboard/editor.vue',
  'map/MapWidgetEditor.vue',
  'map/MapWidgetLayer.vue',
  'map/SensorPopupWidgetEditor.vue',
  'map/SensorPopupWidgetGrid.vue',
  'dashboard/runtime/native/NativeWidgetComposer.vue',
  'dashboard/runtime/native/NativeWidgetPicker.vue',
  'dashboard/runtime/native/NativeWidgetRenderer.vue',
  'dashboard/runtime/native/NativeWidgetBrowser.vue',
  'dashboard/runtime/native/NativeWidgetSettingsEditor.vue',
  'dashboard/runtime/native/NativeAggregateSettingsEditor.vue',
  'dashboard/runtime/native/NativeLiquidSettingsEditor.vue',
  'dashboard/runtime/native/NativeStateSettingsEditor.vue',
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
assert.equal(mapGlobals.addPanelVisible.value, false);
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
assert.ok(
  fs
    .readFileSync(new URL(root + 'dashboard/runtime/native/nativeWidgetChartOptions.ts', import.meta.url), 'utf8')
    .includes("backgroundColor: 'transparent'"),
);
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
const resizeGlobals: any = {
  grid: { getRow: () => 8 },
  editorMode: ref('editing'),
  isSavingEdit: ref(false),
  templateViewport: ref({ ...DEFAULT_MAP_TEMPLATE_VIEWPORT }),
  mapScreen: { metrics: ref({ rows: 8 }) },
};
const resize = functions('map/MapWidgetEditor.vue', ['beginWidgetResize'], resizeGlobals);
resize.beginWidgetResize();
assert.equal(resizeGlobals.templateViewport.value.mode, 'fixed');
assert.equal(resizeGlobals.templateViewport.value.rows, 8);
const saved = normalizeMapTemplateState(
  JSON.parse(
    JSON.stringify({
      viewport: resizeGlobals.templateViewport.value,
      layout: [{ i: widget.id, x: 0, y: 0, w: 5, h: 4 }],
      widgets: { [widget.id]: widget },
    }),
  ),
);
const viewportAfterReload = resolveMapTemplateViewportForLayout(saved.viewport, saved.layout, saved.widgets);
assert.equal(viewportAfterReload.rows, 8, '保存后缩短的部件不应重新拉伸铺满画布');
assert.equal(calculateGridStackCellHeight(600, viewportAfterReload.rows) * saved.layout[0].h, 300);
let renderedCellHeight = 0;
const layer = functions('map/MapWidgetLayer.vue', ['applyScreenMetrics'], {
  grid: {
    getColumn: () => 12,
    getRow: () => 4,
    cellHeight: (height: number) => {
      renderedCellHeight = height;
    },
    margin: () => {},
  },
  props: { screenMetrics: { columns: 12, rows: viewportAfterReload.rows, canvasHeight: 600, margin: 10 } },
  calculateGridStackCellHeight,
});
layer.applyScreenMetrics();
assert.equal(renderedCellHeight, 75, '客户大屏也应保留保存的画布尺度');
const legacy = resolveMapTemplateViewportForLayout(DEFAULT_MAP_TEMPLATE_VIEWPORT, saved.layout, saved.widgets);
assert.equal(legacy.rows, 4, '没有主动缩放的旧模板仍按原规则铺满');
resizeGlobals.editorMode.value = 'view';
resizeGlobals.templateViewport.value = { ...DEFAULT_MAP_TEMPLATE_VIEWPORT };
resize.beginWidgetResize();
assert.equal(resizeGlobals.templateViewport.value.mode, 'fill', '查看时不修改模板');
console.log('Native SFC / dashboard draft / point editing / glass integration passed');

const axisWidget = createNativeWidget({ fqn: 'time_series_chart' });
axisWidget.config.datasources = JSON.parse(JSON.stringify(widget.config.datasources));
axisWidget.config.native.chart.axes.push({ id: 'right', label: '温度', position: 'right', min: 0, max: null });
axisWidget.config.native.chart.thresholds.push({ axisId: 'right', value: 30, label: '高温线', color: '#ff0000' });
axisWidget.config.datasources[0].dataKeys[0].settings = { extension: false, native: { axisId: 'right', lineWidth: 0 } };
const composer = functions('dashboard/runtime/native/NativeWidgetComposer.vue', ['rebindAxis', 'seriesOptions'], {
  draft: ref(axisWidget),
  sources: ref(axisWidget.config.datasources),
  nativeSeriesSettings,
});
const axisEditor = functions('dashboard/runtime/native/NativeWidgetSettingsEditor.vue', ['removeAxis', 'change'], {
  normalized: ref(axisWidget.config.native),
  emit: (event: string, ...args: any[]) => {
    if (event === 'update:modelValue') axisWidget.config.native = args[0];
    else if (event === 'remove-axis') composer.rebindAxis(...args);
  },
});
axisEditor.removeAxis(1);
assert.equal(axisWidget.config.native.chart.axes.length, 1);
assert.equal(axisWidget.config.native.chart.thresholds[0].axisId, 'default');
assert.equal(axisWidget.config.datasources[0].dataKeys[0].settings.native.axisId, 'default');
assert.equal(axisWidget.config.datasources[0].dataKeys[0].settings.native.lineWidth, 0);
assert.equal(axisWidget.config.datasources[0].dataKeys[0].settings.extension, false);
console.log('Axis removal rebinds real composer series and thresholds without losing settings');

// Execute the actual manifest: every selectable family must have a mounted renderer.
const manifestSource = fs.readFileSync(
  new URL(root + 'dashboard/runtime/widgets/manifests/native.ts', import.meta.url),
  'utf8',
);
const manifestCode = ts.transpileModule(manifestSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const rendererStub = {};
const manifestContext = vm.createContext({ exports: {}, require: () => ({ default: rendererStub }) });
vm.runInContext(manifestCode, manifestContext);
for (const family of new Set(nativeWidgetCatalog.map((entry) => entry.family).filter(Boolean))) {
  const definition = manifestContext.exports.widgets.find((item: any) => item.key === `native_${family}`);
  assert.ok(definition, `运行注册不可遗漏 ${family}`);
  assert.equal(definition.component, rendererStub);
  assert.equal(definition.dataProvider, 'static');
}
