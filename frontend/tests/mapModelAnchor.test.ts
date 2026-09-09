import assert from 'node:assert/strict';
import { Cartesian3, Matrix4 } from 'cesium';
import { reactive, readonly, shallowReactive, isProxy } from 'vue';
import {
  attachPoint,
  detachPoint,
  createModelAnchor,
  createModelPlacementMatrix,
  getEffectiveSceneModels,
  getModelRevision,
  isValidModelAnchor,
  resolveModelAnchor,
  worldToLocation,
  assertNoRemovedModelBindings,
  type SceneModelRuntime,
} from '../src/views/tb/map/services/mapModelAnchorService';
import {
  usesTemplatePosition,
  mergeDeviceMapPoint,
  mergePointRuntimeFields,
  deviceLocationWriteCandidates,
} from '../src/views/tb/map/services/mapPointPositionService';
import { normalizeMapPoint, loadMapPoints, saveMapPoints } from '../src/views/tb/map/mapPointStorage';
import { normalizeMapTemplateState, type MapSceneModel } from '../src/views/tb/map/mapTemplateConfig';
import type { MapPoint } from '../src/views/tb/map/types/mapPointTypes';

const model: MapSceneModel = {
  id: 'building',
  name: '教学楼',
  type: '3d-tiles',
  source: 'ion',
  assetId: 1,
  longitude: 114,
  latitude: 30,
  heightOffset: 3,
  heading: 25,
};
const matrix = createModelPlacementMatrix(model, 27);
const local = new Cartesian3(13, -8, 32);
const world = Matrix4.multiplyByPoint(matrix, local, new Cartesian3());
const anchor = createModelAnchor(model, matrix, world);
const picked = { ...worldToLocation(world), modelAnchor: anchor };
const original: MapPoint = {
  id: 'sensor-1',
  type: 'sensor',
  name: '传感器',
  entityType: 'DEVICE',
  entityId: 'device-1',
  entityName: 'sensor',
  longitude: 113,
  latitude: 30,
  height: 10,
  heightMode: 'absolute',
  createdAt: 1,
  updatedAt: 1,
};
const attached = attachPoint(original, picked);
for (const candidate of [
  reactive(picked),
  readonly(picked),
  shallowReactive({ ...picked, modelAnchor: reactive(anchor) }),
]) {
  for (const type of ['sensor', 'camera'] as const) {
    const result = attachPoint({ ...original, type } as MapPoint, candidate);
    assert.deepEqual(result.modelAnchor, anchor, '响应式输入保留全部锚点值');
    assert.equal(isProxy(result.modelAnchor), false);
    assert.equal(isProxy(result.modelAnchor!.localPosition), false);
    assert.equal(isProxy(result.modelAnchor!.fallbackWorldPosition), false);
    assert.notEqual(result.modelAnchor, candidate.modelAnchor);
    assert.notEqual(result.modelAnchor!.localPosition, candidate.modelAnchor.localPosition);
    assert.notEqual(result.modelAnchor!.fallbackWorldPosition, candidate.modelAnchor.fallbackWorldPosition);
    assert.doesNotThrow(() => structuredClone(result.modelAnchor), '输出锚点可正常序列化');
    result.modelAnchor!.localPosition.x += 1;
    result.modelAnchor!.fallbackWorldPosition.height += 1;
    assert.equal(candidate.modelAnchor.localPosition.x, anchor.localPosition.x, '修改草稿不污染候选局部位置');
    assert.equal(candidate.modelAnchor.fallbackWorldPosition.height, anchor.fallbackWorldPosition.height);
  }
}
const models = new Map<string, SceneModelRuntime>([[model.id, { model, status: 'ready', matrix }]]);
const near = (a: Cartesian3, b: Cartesian3) => assert.ok(Cartesian3.distance(a, b) < 0.00001);
const toWorld = (point: { longitude: number; latitude: number; height: number }) =>
  Cartesian3.fromDegrees(point.longitude, point.latitude, point.height);

assert.ok(isValidModelAnchor(anchor));
near(Cartesian3.fromElements(anchor.localPosition.x, anchor.localPosition.y, anchor.localPosition.z), local);
near(toWorld(resolveModelAnchor(attached, models).location), world);
assert.equal(resolveModelAnchor(attached, models).status, 'attached');
assert.equal(original.modelAnchor, undefined, '选点确认不能修改原始快照');

for (const change of [{ longitude: 114.001 }, { heading: 120 }, { pitch: 15, roll: 20 }, { scale: 2 }]) {
  const moved = { ...model, ...change };
  const movedMatrix = createModelPlacementMatrix(moved, 27);
  assert.equal(getModelRevision(moved), anchor.modelRevision, '整体变换不属于资源替换');
  models.set(model.id, { model: moved, status: 'ready', matrix: movedMatrix });
  near(
    toWorld(resolveModelAnchor(attached, models).location),
    Matrix4.multiplyByPoint(movedMatrix, local, new Cartesian3()),
  );
}
assert.throws(() => createModelPlacementMatrix({ ...model, scale: 0 }, 0));
assert.throws(() => createModelPlacementMatrix({ ...model, latitude: 100 }, 0));
assert.throws(() => createModelPlacementMatrix(model, NaN));
assert.notEqual(getModelRevision({ ...model, revision: '2' }), anchor.modelRevision);
assert.notEqual(getModelRevision({ ...model, assetId: 2 }), anchor.modelRevision);

for (const status of ['loading', 'failed'] as const) {
  models.set(model.id, { model, status });
  const resolved = resolveModelAnchor(attached, models);
  assert.equal(resolved.status, status);
  near(toWorld(resolved.location), world);
}
models.set(model.id, { model: { ...model, visible: false }, status: 'ready', matrix });
assert.equal(resolveModelAnchor(attached, models).visible, false);
models.set(model.id, { model: { ...model, revision: '2' }, status: 'ready', matrix });
assert.equal(resolveModelAnchor(attached, models).status, 'changed');
models.clear();
assert.equal(resolveModelAnchor(attached, models).status, 'missing');
const invalid = { ...attached, modelAnchor: { ...anchor, frameVersion: 2 } } as unknown as MapPoint;
assert.equal(resolveModelAnchor(invalid, models).status, 'invalid');
assert.ok(usesTemplatePosition(invalid));
assert.equal(isValidModelAnchor({ ...anchor, localPosition: { x: NaN, y: 0, z: 0 } }), false);

const detached = detachPoint(attached, picked);
assert.equal(detached.modelAnchor, undefined);
assert.ok(usesTemplatePosition(detached));
assert.equal(getEffectiveSceneModels([], false)[0].id, getEffectiveSceneModels([], false)[0].id);
assert.equal(getEffectiveSceneModels([model], true).length, 0);
assert.throws(() => assertNoRemovedModelBindings([model], [], [attached]), /1 个点位/);
assert.doesNotThrow(() => assertNoRemovedModelBindings([model], [], [detached]));

for (const point of [
  attached,
  { ...attached, id: 'camera-1', type: 'camera' } as MapPoint,
  detached,
  original,
  invalid,
]) {
  const normalized = normalizeMapPoint(JSON.parse(JSON.stringify(point)))!;
  assert.deepEqual(normalized.modelAnchor, point.modelAnchor);
  assert.equal(normalized.positionSource, point.positionSource);
  const template = normalizeMapTemplateState(
    JSON.parse(JSON.stringify({ mapPoints: [point], scene: { models: [model], globeOnly: false } })),
  );
  assert.deepEqual(template.mapPoints[0], point);
}
const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) || null,
    setItem: (key: string, value: string) => memory.set(key, value),
  },
});
saveMapPoints([attached, detached]);
assert.deepEqual(loadMapPoints()[0].modelAnchor, anchor);
assert.equal(loadMapPoints()[1].positionSource, 'template');

const dynamic = { ...original, longitude: 100, height: 0, locationSource: 'deviceInfo', online: true } as MapPoint;
for (const point of [attached, detached, invalid]) {
  const merged = mergeDeviceMapPoint(dynamic, point);
  assert.equal(merged.longitude, point.longitude);
  assert.deepEqual(merged.modelAnchor, point.modelAnchor);
  assert.equal(merged.online, true);
  const runtime = mergePointRuntimeFields(point, {
    longitude: 0,
    height: 0,
    modelAnchor: null,
    positionSource: null,
    entityId: 'wrong-device',
    heightMode: 'relativeToGround',
    temperature: 42,
  });
  assert.equal(runtime.longitude, point.longitude);
  assert.equal(runtime.entityId, point.entityId);
  assert.equal(runtime.heightMode, point.heightMode);
  assert.deepEqual(runtime.modelAnchor, point.modelAnchor);
  assert.equal((runtime as any).temperature, 42);
}
assert.equal(mergeDeviceMapPoint(dynamic, original).longitude, 100, '旧点位仍使用设备位置');
assert.deepEqual(deviceLocationWriteCandidates([attached, detached, invalid], []), []);
const restoredLocations = new Map([[original.id, original]]);
assert.deepEqual(deviceLocationWriteCandidates([original], [attached], restoredLocations), [], '恢复设备位置不写设备');
assert.equal(
  deviceLocationWriteCandidates([{ ...original, height: 25 }], [attached], restoredLocations).length,
  1,
  '恢复设备位置后再次拖动应按设备定位规则写回',
);
assert.deepEqual(deviceLocationWriteCandidates([original], [original]), []);
assert.equal(deviceLocationWriteCandidates([{ ...original, height: 20 }], [original]).length, 1);
console.log('模型锚点：矩阵往返/变换、回退、隐藏、资源变更、序列化、设备合并、遥测保护、写回隔离、删除保护测试通过');
