import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { withNativeSettings } from '../src/views/tb/dashboard/runtime/native/nativeWidgetSettings';
import * as core from '../src/views/tb/dashboard/runtime/native/nativeEntityTableCore';

const widget = createNativeWidget({ fqn: 'cards.entities_table' });
assert.equal(widget.config.native.family, 'entityTable');
assert.deepEqual(validateNativeWidget(widget), []);
const settings = widget.config.native.entityTable;
settings.entityType = 'ASSET';
settings.columns = [
  { type: 'TIME_SERIES', key: 'temperature', label: '温度' },
  { type: 'SERVER_ATTRIBUTE', key: 'enabled', label: '启用' },
];
settings.pageSize = 20;
settings.sortOrder = 'DESC';
assert.deepEqual(validateNativeWidget(widget), []);
const query = core.nativeEntityTableQuery(settings, 2, '  pump  ');
assert.equal(query.entityFilter?.type, 'entityType');
assert.equal(query.pageLink?.page, 2);
assert.equal(query.pageLink?.pageSize, 20);
assert.equal(query.pageLink?.textSearch, 'pump');
assert.equal(query.pageLink?.sortOrder?.direction, 'DESC');
assert.deepEqual(
  query.latestValues?.map((item) => item.key),
  ['temperature', 'enabled'],
);
const rows = core.nativeEntityTableRows(
  [
    {
      entityId: { entityType: 'ASSET', id: 'asset-1' },
      latest: {
        ENTITY_FIELD: { name: { value: 'Pump' }, label: { value: '' }, type: { value: 'building' } },
        TIME_SERIES: { temperature: { value: 0 } },
        SERVER_ATTRIBUTE: { enabled: { value: false } },
      },
    },
  ],
  settings.columns,
);
assert.equal(rows[0].name, 'Pump');
assert.equal(rows[0].label, '—');
assert.equal(rows[0].values['TIME_SERIES:temperature'], '0');
assert.equal(rows[0].values['SERVER_ATTRIBUTE:enabled'], 'false');
assert.equal(
  withNativeSettings(JSON.parse(JSON.stringify(widget.config.native))).entityTable.columns[0].key,
  'temperature',
);
settings.singleEntityId = 'device-1';
assert.equal(core.nativeEntityTableQuery(settings, 0, '').entityFilter?.type, 'singleEntity');
settings.pageSize = 101;
assert.ok(validateNativeWidget(widget).length > 0);
settings.pageSize = 10;

for (const [fqn, entityType] of [
  ['entity_admin_widgets.asset_admin_table', 'ASSET'],
  ['entity_admin_widgets.device_admin_table', 'DEVICE'],
] as const) {
  const admin = createNativeWidget({ fqn });
  assert.equal(admin.config.native.family, 'entityTable');
  assert.equal(admin.config.native.entityTable.entityType, entityType);
  assert.equal(admin.config.native.entityTable.adminMode, true);
  assert.equal(admin.config.native.entityTable.allowCreate, true);
  assert.equal(admin.config.native.entityTable.allowEdit, true);
  assert.equal(admin.config.native.entityTable.allowDelete, true);
  assert.deepEqual(validateNativeWidget(admin), []);
  const restored = withNativeSettings(JSON.parse(JSON.stringify(admin.config.native)));
  assert.equal(restored.entityTable.entityType, entityType);
  assert.equal(restored.entityTable.editLocation, true);
}

const source = fs.readFileSync(
  new URL('../src/views/tb/dashboard/runtime/native/NativeEntityTableView.vue', import.meta.url),
  'utf8',
);
const script = compileScript(parse(source).descriptor, { id: 'native-entity-table-test' });
const output = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const calls: any[] = [];
const mutations: any[] = [];
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
    if (name === './nativeEntityTableCore') return core;
    if (name === '/@/api/tb/entityQuery')
      return {
        findEntityDataByQuery: async (request: any) => {
          calls.push(request);
          return {
            data: [
              {
                entityId: { entityType: 'DEVICE', id: 'device-1' },
                latest: { ENTITY_FIELD: { name: { value: 'Pump' } } },
              },
            ],
            totalElements: 1,
            totalPages: 1,
          };
        },
      };
    if (name === '/@/api/tb/asset')
      return {
        getAssetById: async (id: string) => ({ id: { id }, name: 'Pump', type: 'building', label: 'A' }),
        saveAsset: async (data: any) => {
          mutations.push(['saveAsset', data]);
          return { ...data, id: data.id || { id: 'asset-new' } };
        },
        deleteAsset: async (id: string) => mutations.push(['deleteAsset', id]),
      };
    if (name === '/@/api/tb/device')
      return {
        getDeviceById: async (id: string) => ({ id: { id }, name: 'Pump', type: 'default', label: 'D' }),
        saveDevice: async (data: any) => {
          mutations.push(['saveDevice', data]);
          return { ...data, id: data.id || { id: 'device-new' } };
        },
        deleteDevice: async (id: string) => mutations.push(['deleteDevice', id]),
      };
    if (name === '/@/api/tb/telemetry')
      return {
        getAttributesByScope: async () => [
          { key: 'latitude', value: 31.2 },
          { key: 'longitude', value: 121.5 },
        ],
        saveEntityAttributesV1: async (id: any, scope: string, data: any) =>
          mutations.push(['attributes', id, scope, data]),
      };
    if (name === '/@/enums/telemetryEnum') return { Scope: { SERVER_SCOPE: 'SERVER_SCOPE' } };
    throw new Error(`Unexpected import: ${name}`);
  },
});
vm.runInContext(output, context);
const props = vue.reactive({ settings, pollMs: 5000 });
const scope = vue.effectScope();
const state = scope.run(() => context.exports.default.setup(props, { expose() {} }));
await vue.nextTick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(state.rows.value[0].name, 'Pump');
assert.equal(calls.length, 1);
state.searchDraft.value = 'Pump';
state.applySearch();
await vue.nextTick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(calls[1].pageLink.textSearch, 'Pump');
scope.stop();
assert.equal(timers.size, 0);

const adminSettings = createNativeWidget({ fqn: 'entity_admin_widgets.asset_admin_table' }).config.native.entityTable;
const adminProps = vue.reactive({ settings: adminSettings, pollMs: 5000, previewOnly: false });
const adminScope = vue.effectScope();
const adminState = adminScope.run(() => context.exports.default.setup(adminProps, { expose() {} }));
await vue.nextTick();
await new Promise((resolve) => setImmediate(resolve));
adminState.openCreate();
Object.assign(adminState.form, {
  name: 'New asset',
  type: 'building',
  label: 'A',
  latitude: '31.2',
  longitude: '121.5',
});
await adminState.saveEntityForm();
assert.equal(mutations[0][0], 'saveAsset');
assert.equal(mutations[1][0], 'attributes');
assert.equal(mutations[1][1].entityType, 'ASSET');
assert.equal(mutations[1][1].id, 'asset-new');
assert.equal(mutations[1][2], 'SERVER_SCOPE');
await adminState.openEdit({ id: 'asset-1', name: 'Pump', label: 'A', type: 'building', values: {} });
assert.equal(adminState.form.latitude, '31.2');
adminState.form.name = 'Updated pump';
await adminState.saveEntityForm();
assert.equal(mutations[2][0], 'saveAsset');
assert.equal(mutations[2][1].id.id, 'asset-1');
assert.equal(mutations[2][1].name, 'Updated pump');
adminState.confirmDeleteId.value = 'asset-1';
await adminState.deleteRow({ id: 'asset-1', name: 'Pump', label: 'A', type: 'building', values: {} });
assert.deepEqual(mutations.at(-1), ['deleteAsset', 'asset-1']);
adminScope.stop();

const beforePreview = mutations.length;
const previewProps = vue.reactive({ settings: adminSettings, pollMs: 5000, previewOnly: true });
const previewScope = vue.effectScope();
const previewState = previewScope.run(() => context.exports.default.setup(previewProps, { expose() {} }));
previewState.openCreate();
Object.assign(previewState.form, { name: 'No write', type: 'building' });
await previewState.saveEntityForm();
await previewState.deleteRow({ id: 'asset-1', name: 'Pump', label: 'A', type: 'building', values: {} });
assert.equal(mutations.length, beforePreview, '配置预览不得调用写接口');
previewScope.stop();
console.log('native entity table query, admin CRUD, preview safety and config roundtrip passed');
