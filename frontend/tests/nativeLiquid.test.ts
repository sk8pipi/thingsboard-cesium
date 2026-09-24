import assert from 'node:assert/strict';
import { createSSRApp, createRenderer, h, nextTick, ref } from 'vue';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { renderToString } = createRequire(require.resolve('vue/package.json'))('@vue/server-renderer');
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import {
  liquidValues,
  liquidColor,
  liquidShapes,
  liquidUnits,
  loadLiquidSettings,
} from '../src/views/tb/dashboard/runtime/native/nativeLiquidCore';
import { createNativeDataClient } from '../src/views/tb/dashboard/runtime/native/nativeWidgetDataCore';
import Liquid from '../src/views/tb/dashboard/runtime/native/NativeLiquidView';
import type { NativeSource } from '../src/views/tb/dashboard/runtime/native/nativeWidgetTypes';
const widget = createNativeWidget({ fqn: 'vertical_cylinder_tank' });
const settings = widget.config.native.liquid;
const source: NativeSource = {
  type: 'entity',
  entityType: 'DEVICE',
  entityId: 'liquid-test',
  dataKeys: [{ name: 'level', type: 'timeseries', decimals: 1 }],
};
widget.config.datasources = [source];
assert.deepEqual(validateNativeWidget(widget), []);
for (const shape of Object.keys(liquidShapes)) {
  settings.shape = shape;
  for (const percent of [0, 50, 100]) {
    const data = liquidValues(percent, settings)!;
    const original = liquidShapes[shape as keyof typeof liquidShapes];
    assert.equal(data.y, original.empty + (percent / 100) * (original.full - original.empty));
    const html = await renderToString(createSSRApp({ render: () => h(Liquid, { settings, value: percent }) }));
    assert.match(html, new RegExp(`液位 ${percent}%`));
    assert.ok(!html.includes('NaN'));
    assert.match(html, /tb-liquid-fill/);
    assert.ok(!html.includes('filter="url'), '内层不叠加滤镜');
  }
}
assert.equal(liquidValues(null, settings), null);
assert.equal(liquidValues('', settings), null);
assert.equal(liquidValues(false, settings), null);
assert.equal(liquidValues('0', settings)!.percent, 0);
assert.equal(liquidValues(120, settings)!.percent, 120);
assert.equal(liquidValues(120, settings)!.y, liquidShapes[settings.shape as keyof typeof liquidShapes].full);
assert.equal(liquidValues(-10, settings)!.y, liquidShapes[settings.shape as keyof typeof liquidShapes].empty);
assert.equal(liquidColor(settings.liquidColor, 0), '#E27C7CDE');
assert.equal(liquidColor(settings.liquidColor, 20), '#7A8BFF');
settings.capacity = 1;
settings.capacityUnits = 'm³';
settings.datasourceUnits = 'L';
settings.displayUnits = 'm³';
settings.layout = 'absolute';
settings.tooltipUnits = 'L';
assert.deepEqual(Object.fromEntries(Object.entries(liquidValues(250, settings)!).filter(([key]) => key !== 'y')), {
  percent: 25,
  value: 0.25,
  capacity: 1,
  units: 'm³',
  tooltip: 250,
});
for (const unit of Object.keys(liquidUnits)) {
  const result = liquidValues(250, { ...settings, datasourceUnits: 'L', displayUnits: unit })!;
  assert.ok(Math.abs(result.value / liquidUnits[unit] - 250) < 1e-8);
}
assert.equal(liquidValues(0, settings)!.value, 0);
assert.equal(liquidValues(2, { ...settings, capacity: 0 }), null);
const bindings = {
  capacity: { name: 'volume', scope: 'SERVER_SCOPE' as const },
  shape: { name: 'tankShape', scope: 'SERVER_SCOPE' as const },
};
let reads = 0;
const bound = await loadLiquidSettings(source, { ...settings, bindings }, async (_source, scope, keys) => {
  reads++;
  assert.equal(scope, 'SERVER_SCOPE');
  assert.equal(keys.split(',').length, 2);
  return [
    { key: 'volume', value: 2 },
    { key: 'tankShape', value: 'Rectangle' },
  ];
});
assert.equal(reads, 1);
assert.equal(bound.settings.capacity, 2);
assert.equal(bound.settings.shape, 'Rectangle');
assert.deepEqual(bound.errors, []);
const bad = await loadLiquidSettings(source, { ...settings, bindings }, async () => [{ key: 'volume', value: 0 }]);
assert.equal(bad.errors.length, 2);
const failed = await loadLiquidSettings(source, { ...settings, bindings }, async () => {
  throw Error('offline');
});
assert.equal(failed.errors.length, 1);
let inactiveReads = 0;
const inactive = await loadLiquidSettings(
  source,
  {
    ...settings,
    layout: 'percentage',
    datasourceUnits: '%',
    tooltipUnits: '%',
    bindings: {
      capacity: { name: 'missingVolume', scope: 'SERVER_SCOPE' },
      displayUnits: { name: 'missingUnits', scope: 'SHARED_SCOPE' },
    },
  },
  async () => {
    inactiveReads++;
    return [];
  },
);
assert.equal(inactiveReads, 0, '百分比输入和提示不读取无关容量或显示单位属性');
assert.deepEqual(inactive.errors, []);
assert.equal(liquidValues(25, inactive.settings)!.percent, 25);
const needsVolume = await loadLiquidSettings(source, { ...inactive.settings, tooltipUnits: 'L' }, async () => {
  inactiveReads++;
  return [];
});
assert.equal(inactiveReads, 1, '容量提示必须读取容量属性');
assert.ok(needsVolume.errors.some((error) => error.includes('missingVolume')));
const hiddenInvalid = {
  ...inactive.settings,
  capacity: 0,
  capacityUnits: 'invalid',
  displayUnits: 'invalid',
  volumeFontSize: 0,
  showTooltip: false,
  tooltipUnits: 'invalid',
  tooltipDecimals: -1,
};
assert.equal(liquidValues(25, hiddenInvalid)!.percent, 25, '隐藏容量/样式/提示字段不影响有效百分比');
assert.equal(liquidValues(25, { ...hiddenInvalid, layout: 'absolute' }), null, '切回相关布局再校验原值');
assert.equal(liquidValues(25, { ...hiddenInvalid, showTooltip: true }), null, '重新启用提示再校验原值');
const ids: string[] = [];
const markup = await renderToString(
  createSSRApp({ render: () => h('div', [h(Liquid, { settings, value: 0 }), h(Liquid, { settings, value: 250 })]) }),
);
for (const match of markup.matchAll(/id="([^"]+)"/g)) ids.push(match[1]);
assert.equal(new Set(ids).size, ids.length, '并排实例 SVG ID 不重复');
for (const match of markup.matchAll(/url\(#([^)]*)\)/g)) assert.ok(ids.includes(match[1]), '所有裁剪引用匹配本实例');
assert.match(markup, /0.0? m³|0 m³/, '合法零值不得替换为演示值');
const empty = await renderToString(createSSRApp({ render: () => h(Liquid, { settings, value: null }) }));
assert.match(empty, /暂无有效液位/);
assert.match(empty, /visibility:hidden/);
const client = createNativeDataClient({
  latest: async () => ({ level: [{ ts: 100, value: 25 }] }),
  history: async () => {
    throw Error('液位不应读取历史');
  },
  attributes: async () => [
    { key: 'volume', value: 2 },
    { key: 'tankShape', value: 'Rectangle' },
  ],
});
settings.bindings = bindings;
const snapshot = await client.load(widget.config);
assert.equal(snapshot.series[0].latest?.value, 25);
assert.equal(snapshot.liquid?.settings.capacity, 2);
assert.deepEqual(snapshot.errors, []);
assert.deepEqual(createNativeWidget(JSON.parse(JSON.stringify(widget))).config, widget.config);
assert.deepEqual(validateNativeWidget(widget), []);
const rootNode: any = { children: [] };
const renderHost = createRenderer<any, any>({
  createElement: (tag) => ({ tag, props: {}, children: [] }),
  createText: (text) => ({ text, children: [] }),
  createComment: (text) => ({ text, children: [] }),
  setText: (node, text) => (node.text = text),
  setElementText: (node, text) => (node.text = text),
  parentNode: (node) => node.parent,
  nextSibling: () => null,
  insert: (node, parent, anchor) => {
    node.parent = parent;
    const at = anchor ? parent.children.indexOf(anchor) : -1;
    if (at >= 0) parent.children.splice(at, 0, node);
    else parent.children.push(node);
  },
  remove: (node) => {
    const at = node.parent?.children.indexOf(node);
    if (at >= 0) node.parent.children.splice(at, 1);
  },
  patchProp: (node, key, _previous, next) => (node.props[key] = next),
});
const liveValue = ref(25);
const liveSettings = { ...settings, shape: 'Vertical Cylinder', datasourceUnits: '%', bindings: {} };
const app = renderHost.createApp({ render: () => h(Liquid, { settings: liveSettings, value: liveValue.value }) });
app.mount(rootNode);
await nextTick();
function fill(node: any): any {
  return String(node.props?.class || '').includes('tb-liquid-fill') ? node : node.children.map(fill).find(Boolean);
}
const initialY = fill(rootNode).props.style.y;
liveValue.value = 75;
await nextTick();
assert.notEqual(fill(rootNode).props.style.y, initialY, '数据更新推进液面');
assert.equal(fill(rootNode).props.style.transition, 'y 500ms ease');
app.unmount();
assert.equal(rootNode.children.length, 0);
settings.capacity = 0;
assert.ok(validateNativeWidget(widget).some((message) => message.includes('容量')));
console.log(
  'Native liquid: 10 original SVG shapes, unit conversions, zero/overflow, attributes, errors, isolated IDs and persistence passed',
);
