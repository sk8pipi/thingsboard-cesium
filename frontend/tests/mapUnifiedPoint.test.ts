import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {
  normalizeMapTemplateState,
  getMapBusinessPoints,
  toMapBusinessBinding,
} from '../src/views/tb/map/mapTemplateConfig';
import { resolveTemplateDevices } from '../src/views/tb/dashboard/runtime/widgets/aggregate/templateDeviceResolver';
import { normalizeMapPoint } from '../src/views/tb/map/mapPointStorage';
import {
  filterExcludedMapPoints,
  mergePointRuntimeFields,
  unifiedDeviceLocationWriteCandidates,
} from '../src/views/tb/map/services/mapPointPositionService';
import type { MapPoint } from '../src/views/tb/map/types/mapPointTypes';

const point: MapPoint = {
  id: 'sensor-1',
  type: 'sensor',
  name: '传感器',
  entityType: 'DEVICE',
  entityId: 'device-1',
  entityName: 'sensor',
  longitude: 114,
  latitude: 30,
  height: 32,
  heightMode: 'absolute',
  createdAt: 1,
  updatedAt: 1,
};
const camera: MapPoint = {
  ...point,
  id: 'camera-2',
  type: 'camera',
  entityType: 'DEVICE',
  entityId: 'device-2',
  name: '监控',
};
const positioned = { ...point, positionSource: 'template' as const };
const synced = { ...positioned, deviceLocationSynced: true };
assert.equal(unifiedDeviceLocationWriteCandidates([point], [point]).length, 0);
assert.equal(unifiedDeviceLocationWriteCandidates([positioned], [positioned]).length, 1, '遗留模板位置首次同步');
assert.equal(unifiedDeviceLocationWriteCandidates([synced], [synced]).length, 0, '相同已同步位置不写');
assert.equal(unifiedDeviceLocationWriteCandidates([{ ...synced, height: 33 }], [synced]).length, 1);
assert.equal(
  unifiedDeviceLocationWriteCandidates([{ ...synced, deviceLocationSynced: false }], [synced]).length,
  1,
  '持久化待同步支持刷新重试',
);
assert.equal(unifiedDeviceLocationWriteCandidates([point, point, camera], []).length, 2, '设备 UUID 去重');
assert.equal(unifiedDeviceLocationWriteCandidates([], [point]).length, 0, '移除不清空设备坐标');
assert.equal(normalizeMapPoint(point)?.deviceLocationSynced, undefined, '不能把普通旧点误标待同步');
assert.equal(normalizeMapPoint(synced)?.deviceLocationSynced, true);
assert.equal(mergePointRuntimeFields(synced, { deviceLocationSynced: false }).deviceLocationSynced, true);
const state = normalizeMapTemplateState({
  mapPoints: [point, camera],
  excludedDeviceIds: [' device-1 ', 'device-1', ''],
  excludedPointTypes: { 'device-1': 'sensor', 'device-2': 'camera' },
});
assert.deepEqual(state.excludedDeviceIds, ['device-1']);
assert.deepEqual(state.excludedPointTypes, { 'device-1': 'sensor' }, '只保存排除设备的类型，不保留坐标和旧锚点');
assert.deepEqual(normalizeMapTemplateState({ excludedDeviceIds: {} as any }).excludedPointTypes, {});
assert.deepEqual(filterExcludedMapPoints(state.mapPoints, state.excludedDeviceIds), [camera]);
const reloaded = normalizeMapTemplateState(JSON.parse(JSON.stringify(state)));
assert.deepEqual(filterExcludedMapPoints(reloaded.mapPoints, reloaded.excludedDeviceIds), [camera], '刷新不重现');
assert.equal(filterExcludedMapPoints(reloaded.mapPoints, []).length, 2, '解除排除可恢复');
assert.equal(state.mapPoints.length, 2, '过滤不改变业务原始集合');

const categorized = { ...point, deviceCategory: 'electricity', telemetryKeys: ['kwh'] };
const removedState = normalizeMapTemplateState({
  mapPoints: [],
  excludedDeviceIds: [point.entityId, camera.entityId],
  excludedPointTypes: { [point.entityId]: 'sensor', [camera.entityId]: 'camera' },
  excludedDeviceBindings: {
    [point.entityId]: toMapBusinessBinding(categorized),
    [camera.entityId]: toMapBusinessBinding(camera),
  },
});
const businessPoints = getMapBusinessPoints(removedState);
const before = resolveTemplateDevices({
  templatePoints: [categorized, camera],
  selector: { type: 'device-category', deviceCategory: 'electricity' },
  telemetryKey: 'kwh',
});
const after = resolveTemplateDevices({
  templatePoints: businessPoints,
  selector: { type: 'device-category', deviceCategory: 'electricity' },
  telemetryKey: 'kwh',
});
assert.deepEqual(
  after.map((item) => item.deviceId),
  before.map((item) => item.deviceId),
  '隐藏不改变能耗分类，摄像头不误纳入',
);
assert.equal(
  businessPoints.some((item) => 'longitude' in item || 'modelAnchor' in item),
  false,
  '业务引用不备份旧位置',
);

// 执行真实保存服务函数，隔离网络，不对用户实际设备发写请求。
const source = fs.readFileSync(
  new URL('../src/views/tb/map/services/deviceMapPointService.ts', import.meta.url),
  'utf8',
);
const file = ts.createSourceFile('service.ts', source, ts.ScriptTarget.Latest, true);
const names = [
  'toNumber',
  'kvListToObject',
  'uniqueBy',
  'mapWithConcurrency',
  'buildLocationAttributes',
  'saveDeviceServerLocationAttributes',
  'sameLocation',
  'syncDeviceMapPointLocations',
];
const code = file.statements
  .filter(ts.isFunctionDeclaration)
  .filter((node) => names.includes(node.name!.text))
  .map((node) => node.getText(file))
  .join('\n');
const devices = new Map<string, any>([
  [
    point.entityId,
    { id: { id: point.entityId }, additionalInfo: { longitude: 100, latitude: 20, altitude: 0, keep: '保留' } },
  ],
  [camera.entityId, { id: { id: camera.entityId }, additionalInfo: { longitude: 100, latitude: 20, altitude: 0 } }],
]);
const attributes = new Map<string, Record<string, number>>();
let failAttributeId = camera.entityId;
let writes = 0;
const ctx = vm.createContext({
  exports: {},
  DEFAULT_CONCURRENCY: 8,
  LOCATION_KEYS: ['lon', 'lng', 'longitude', 'lat', 'latitude', 'alt', 'altitude', 'height'],
  EntityType: { DEVICE: 'DEVICE' },
  Scope: { SERVER_SCOPE: 'SERVER_SCOPE' },
  getDeviceById: async (id: string) => {
    if (!devices.has(id)) throw new Error('403');
    return structuredClone(devices.get(id));
  },
  getAttributesByScope: async ({ id }: { id: string }, scope: string) => {
    assert.equal(scope, 'SERVER_SCOPE');
    return Object.entries(attributes.get(id) || {}).map(([key, value]) => ({ key, value }));
  },
  saveDevice: async (device: any) => {
    writes++;
    devices.set(device.id.id, structuredClone(device));
  },
  saveEntityAttributesV2: async ({ id }: { id: string }, scope: string, values: Record<string, number>) => {
    assert.equal(scope, 'SERVER_SCOPE');
    if (id === failAttributeId) throw new Error('private upstream detail must not leak');
    writes++;
    attributes.set(id, { ...values });
  },
});
vm.runInContext(
  ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
    .outputText,
  ctx,
);
const sync = ctx.exports.syncDeviceMapPointLocations;
const result = await sync([positioned, camera, positioned]);
assert.deepEqual(Array.from(result.succeeded), [point.entityId]);
assert.equal(result.failed[0].deviceId, camera.entityId, '属性失败不可算全部成功');
assert.equal(result.failed[0].message.includes('private'), false);
assert.equal(devices.get(point.entityId).additionalInfo.keep, '保留');
assert.equal(devices.get(point.entityId).additionalInfo.longitude, positioned.longitude);
assert.equal(attributes.get(point.entityId)?.height, 32);
assert.equal(devices.get(point.entityId).additionalInfo.lon, positioned.longitude);
assert.equal(devices.get(point.entityId).additionalInfo.lat, positioned.latitude);
assert.equal(devices.get(point.entityId).additionalInfo.height, positioned.height);
const firstWrites = writes;
failAttributeId = '';
assert.equal((await sync([positioned, camera])).failed.length, 0);
assert.equal(writes, firstWrites + 1, '仅补写失败属性，相同成功设备不重复写');
const afterRetry = writes;
assert.equal((await sync([positioned, camera])).failed.length, 0);
assert.equal(writes, afterRetry, '重复重试幂等');
devices.get(point.entityId).additionalInfo.lon = 1;
devices.get(point.entityId).additionalInfo.lat = 2;
devices.get(point.entityId).additionalInfo.height = 3;
assert.equal((await sync([positioned])).failed.length, 0);
assert.equal(devices.get(point.entityId).additionalInfo.lon, positioned.longitude, '标准字段相同但旧别名不同仍要修复');
assert.equal(devices.get(point.entityId).additionalInfo.height, positioned.height);
const afterAliasRepair = writes;
assert.equal((await sync([{ ...point, entityId: 'denied' }])).failed.length, 1);
assert.equal((await sync([{ ...point, longitude: NaN }])).failed.length, 1);
assert.equal((await sync([{ ...point, heightMode: 'relativeToGround' }])).failed.length, 1);
assert.equal(writes, afterAliasRepair, '无权限/无效坐标不写');
console.log('统一点位：排除/恢复/标准化、候选去重、遗留同步、部分失败、属性重试与幂等通过');
