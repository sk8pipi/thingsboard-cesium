import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parse } from '@vue/compiler-sfc';
import { createNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { normalizeMapTemplateState } from '../src/views/tb/map/mapTemplateConfig';

function functions(file: string, names: string[], globals: any) {
  const body = parse(fs.readFileSync(new URL('../src/views/tb/' + file, import.meta.url), 'utf8')).descriptor
    .scriptSetup!.content;
  const ast = ts.createSourceFile('test.ts', body, ts.ScriptTarget.Latest, true);
  const selected = ast.statements.filter(ts.isFunctionDeclaration).filter((node) => names.includes(node.name!.text));
  assert.equal(selected.length, names.length);
  const code = ts.transpileModule(selected.map((node) => node.getText(ast)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({ ...globals, result: {} });
  vm.runInContext(code + '\nObject.assign(result,{' + names.join(',') + '});', context);
  return context.result;
}
const clone = (value: any) => JSON.parse(JSON.stringify(value));
const first = createNativeWidget({ fqn: 'time_series_chart' });
first.config.datasources = [
  {
    type: 'entity',
    entityType: 'DEVICE',
    entityId: 'test',
    dataKeys: [
      {
        name: 'temperature',
        type: 'timeseries',
        decimals: 0,
        units: '',
        settings: { native: { lineWidth: 0, smooth: false } },
      },
    ],
  },
];
first.config.showTitle = false;
first.config.native.chart.axes[0].min = 0;
first.config.native.chart.axes[0].max = null;
first.config.native.chart.thresholds = [];
first.config.customExtension = { enabled: false, zero: 0, nullable: null, empty: '', list: [] };
const second = createNativeWidget(first);
second.id = 'second';
const unknown = { id: 'future', widgetKey: 'future-adapter', config: { untouched: [0, false, null, ''] } };
const original = clone([unknown, first, second]);
const events: any[] = [];
const globals = {
  localWidgets: { value: clone(original) },
  normalizedWidgets: { value: [first, second] },
  nativeEditSource: { value: null as any },
  nativePickerVisible: { value: true },
  emit: (...args: any[]) => events.push(args),
};
const point = functions(
  'map/SensorPopupWidgetEditor.vue',
  ['editNativeWidget', 'removeWidget', 'save', 'applyNativeWidget', 'toPopupWidgetConfig'],
  globals,
);
point.editNativeWidget(second.id);
assert.equal(globals.nativeEditSource.value.id, second.id);
point.removeWidget(first.id);
assert.deepEqual(
  globals.localWidgets.value.map((w: any) => w.id),
  ['future', 'second'],
);
point.removeWidget('missing');
assert.equal(globals.localWidgets.value.length, 2);
assert.deepEqual(events, [], '添加、编辑、删除必须仅更改本地草稿');
assert.deepEqual(
  original.map((w: any) => w.id),
  ['future', first.id, 'second'],
  '取消时父级配置仍完整',
);
globals.localWidgets.value = clone(original); // 重新打开时恢复外部配置
point.applyNativeWidget(first);
point.save();
assert.equal(events[0][0], 'saved');
assert.equal(events[1][0], 'close');
assert.deepEqual(clone(events[0][1][0]), unknown);
const reopened = createNativeWidget(events[0][1][1]);
assert.deepEqual(reopened.config, first.config);
assert.deepEqual(reopened.appearance, first.appearance);
events[0][1][1].config.title = 'external mutation';
assert.notEqual(globals.localWidgets.value[1].config.title, 'external mutation');

const map = functions('map/MapWidgetEditor.vue', ['normalizeWidgetState'], {
  cloneJson: clone,
  normalizeWidgetRecord: () => ({ [first.id]: clone(first) }),
});
const record = { [unknown.id]: unknown, [first.id]: first };
const normalized = map.normalizeWidgetState(record);
assert.deepEqual(normalized.future, unknown, '不支持的记录不能在保存周围模板时丢失');
normalized.future.config.untouched.push(1);
assert.equal(unknown.config.untouched.length, 4);
const saved = normalizeMapTemplateState(clone({ widgets: map.normalizeWidgetState(record), layout: [] }));
assert.deepEqual(saved.widgets.future, unknown);
assert.deepEqual(createNativeWidget(saved.widgets[first.id]).config, first.config);
console.log('Native map / point save, cancel, stable ID and configuration round-trip passed');
