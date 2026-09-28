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
const positioned = { ...point, positionSource: 'template' as const, locationPending: true, locationRevision: 1 };
const synced = { ...positioned, locationPending: false, deviceLocationSynced: true };
assert.equal(unifiedDeviceLocationWriteCandidates([point], [point]).length, 0);
assert.equal(
  unifiedDeviceLocationWriteCandidates([{ ...point, positionSource: 'template' }], [point]).length,
  0,
  '遗留模板不自动写回',
);
assert.equal(unifiedDeviceLocationWriteCandidates([synced], [synced]).length, 0, '相同已同步位置不写');
assert.equal(unifiedDeviceLocationWriteCandidates([{ ...synced, height: 33 }], [synced]).length, 0);
assert.equal(
  unifiedDeviceLocationWriteCandidates([{ ...synced, locationPending: true, deviceLocationSynced: false }], [synced])
    .length,
  1,
  '持久化待同步支持刷新重试',
);
assert.equal(
  unifiedDeviceLocationWriteCandidates([positioned, positioned, { ...camera, locationPending: true }], []).length,
  2,
  '设备 UUID 去重',
);
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
let calls = 0;
let conflict = false;
const ctx = vm.createContext({
  exports: {},
  DEFAULT_CONCURRENCY: 8,
  saveMapDeviceLocation: async (p: MapPoint) => {
    calls++;
    if (conflict) throw { response: { status: 409 }, message: 'private upstream detail' };
    return {
      location: {
        longitude: p.longitude,
        latitude: p.latitude,
        height: p.height ?? 0,
        revision: 2,
        updatedTime: 2,
        heightMode: 'absolute',
        source: 'confirmed',
      },
      attributesSynced: p.entityId !== camera.entityId,
    };
  },
});
vm.runInContext(
  ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
    .outputText,
  ctx,
);
const sync = ctx.exports.syncDeviceMapPointLocations;
const result = await sync([positioned, camera, positioned]);
assert.equal(calls, 2, '同设备只调用一次位置接口');
assert.equal(result.succeeded.length, 2, '正式位置成功与兼容投影失败分开报告');
assert.deepEqual(Array.from(result.projectionPending), [camera.entityId]);
assert.equal(result.locations[point.entityId].revision, 2);
conflict = true;
const stale = await sync([positioned]);
assert.equal(stale.failed[0].conflict, true);
assert.equal(stale.failed[0].message.includes('private'), false);
assert.equal(stale.succeeded.length, 0);
assert.equal((await sync([{ ...point, heightMode: 'relativeToGround' }])).failed.length, 1);
console.log('统一点位：排除/恢复/显式草稿、位置冲突与兼容投影分项报告通过');
