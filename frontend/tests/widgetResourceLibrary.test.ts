import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import {
  createBundleExport,
  downloadResourceJson,
  parseResourceImport,
  prepareResourceExport,
  resourceFilename,
  safePreviewSource,
} from '../src/views/tb/widgetsLibrary/widgetResourceCore';

const definition = {
  id: { id: 'server-id' },
  tenantId: { id: 'tenant-id' },
  createdTime: 12,
  version: 1,
  name: '温度 / 曲线',
  fqn: 'charts.timeseries_line_chart',
  descriptor: {
    type: 'timeseries',
    defaultConfig: '{"settings":{"unit":"℃"}}',
    controllerScript: 'throw new Error("must never run")',
    resources: [{ url: '/api/resource/library.js' }],
  },
  resources: [{ title: 'icon', data: 'aW1hZ2U=' }],
};
const original = JSON.stringify(definition);
const exported = prepareResourceExport(definition);
assert.equal(exported.id, undefined);
assert.equal(exported.tenantId, undefined);
assert.equal(exported.version, undefined);
assert.deepEqual(exported.descriptor, definition.descriptor);
assert.deepEqual(exported.resources, definition.resources);
assert.equal(JSON.stringify(definition), original, '导出不得修改原始资源');
const bundle = createBundleExport({ title: '图表', id: { id: 'bundle-id' }, image: 'data:image/png;base64,YQ==' }, [
  definition,
]);
assert.equal(bundle.widgetsBundle.id, undefined);
assert.equal(bundle.widgetTypes.length, 1);
assert.deepEqual(bundle.widgetTypes[0], exported);
assert.equal(bundle.widgetsBundle.image, 'data:image/png;base64,YQ==');
assert.throws(() => createBundleExport({ title: '摘要包' }, [{ name: '仅摘要' }]), /完整/);
const imported = parseResourceImport(JSON.stringify(bundle));
assert.equal(imported.kind, 'bundle');
assert.equal(imported.widgets[0].descriptor.controllerScript, definition.descriptor.controllerScript);
assert.deepEqual(imported.original, bundle, '导入只解析，不改变自定义字段或脚本内容');
assert.equal(parseResourceImport(original).kind, 'widget');
assert.equal(parseResourceImport('{"widgetsBundle":{"title":"引用包"},"widgetTypeFqns":["x"]}').references[0], 'x');
for (const bad of [
  'null',
  '[]',
  '{}',
  '{bad',
  '{"name":"只有摘要"}',
  '{"widgetsBundle":{"title":"x"}}',
  '{"widgetsBundle":{"title":"x"},"widgetTypes":[{"name":"摘要"}]}',
  '{"widgetsBundle":{"title":"x"},"widgetTypeFqns":[2]}',
]) {
  assert.throws(() => parseResourceImport(bad));
}
assert.throws(() => parseResourceImport(' '.repeat(20 * 1024 * 1024 + 1)), /20 MB/);
assert.equal(safePreviewSource(undefined), '');
assert.equal(safePreviewSource('tb-image;/api/images/system/widget.png'), '/api/images/system/widget.png');
assert.equal(safePreviewSource('data:image/png;base64,YQ=='), 'data:image/png;base64,YQ==');
for (const source of [
  'javascript:alert(1)',
  '//attacker/image',
  'https://attacker/image',
  '/api/auth/user',
  '/api/images/tenant/../../auth/user',
])
  assert.equal(safePreviewSource(source), '');
assert.equal(resourceFilename('a/b:c'), 'a_b_c.json');

// 执行真实 API 封装，验证正确的后端参数和完整定义端点，不联网。
for (const name of ['widgetType', 'widgetsBundle']) {
  const source = fs.readFileSync(path.resolve(`src/api/tb/${name}.ts`), 'utf8');
  const transpiled = ts.transpileModule(source.replace(/^import .*?;\r?\n/gm, ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const calls: any[] = [];
  const context = {
    exports: {},
    defHttp: {
      get: (options: any) => {
        calls.push(options);
        return Promise.resolve({});
      },
    },
  };
  vm.runInNewContext(transpiled, context);
  const api = context.exports as any;
  if (name === 'widgetType') {
    await api.getWidgetTypeById('id', true);
    assert.equal(calls[0].url, '/api/widgetType/id');
    assert.equal(calls[0].params.includeResources, true);
    await api.getBundleWidgetTypesDetails('bundle', true);
    assert.equal(calls[1].url, '/api/widgetTypesDetails');
    assert.equal(calls[1].params.widgetsBundleId, 'bundle');
    assert.equal(calls[1].params.includeResources, true);
  } else {
    await api.getWidgetsBundleById('bundle', true);
    assert.equal(calls[0].params.inlineImages, true);
  }
}

// 浏览器下载必须触发 click，并释放 DOM 与对象 URL。
let clicked = false;
let removed = false;
let revoked = false;
let downloadedBlob: Blob | undefined;
const anchor: any = {
  click: () => {
    clicked = true;
  },
  remove: () => {
    removed = true;
  },
};
const oldDocument = globalThis.document;
const oldCreate = URL.createObjectURL;
const oldRevoke = URL.revokeObjectURL;
const oldTimeout = globalThis.setTimeout;
try {
  globalThis.document = { createElement: () => anchor, body: { appendChild: () => {} } } as any;
  URL.createObjectURL = (blob: Blob) => {
    downloadedBlob = blob;
    return 'blob:test';
  };
  URL.revokeObjectURL = () => {
    revoked = true;
  };
  globalThis.setTimeout = ((fn: () => void) => {
    fn();
    return 1;
  }) as any;
  downloadResourceJson(bundle, '图表');
  assert.ok(clicked && removed && revoked);
  assert.equal(anchor.download, '图表.json');
  assert.deepEqual(JSON.parse(await downloadedBlob!.text()), bundle);
} finally {
  globalThis.document = oldDocument;
  URL.createObjectURL = oldCreate;
  URL.revokeObjectURL = oldRevoke;
  globalThis.setTimeout = oldTimeout;
}

for (const directory of ['widgetType', 'widgetsBundle', 'widgetsLibrary']) {
  const root = path.resolve(`src/views/tb/${directory}`);
  for (const file of fs.readdirSync(root).filter((file) => file.endsWith('.vue'))) {
    const filename = path.join(root, file);
    const { descriptor, errors } = parse(fs.readFileSync(filename, 'utf8'), { filename });
    assert.equal(errors.length, 0, `${file} SFC 解析`);
    const script = compileScript(descriptor, { id: file });
    const template = compileTemplate({
      source: descriptor.template!.content,
      filename,
      id: file,
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.equal(template.errors.length, 0, `${file} 模板编译: ${template.errors}`);
  }
}
console.log('widgetResourceLibrary: 导出、导入、资源地址、下载、API 契约及资源页 SFC 编译通过');
