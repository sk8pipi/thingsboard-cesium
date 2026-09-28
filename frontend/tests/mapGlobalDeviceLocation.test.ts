import assert from 'node:assert/strict';
import type { MapPoint } from '../src/views/tb/map/types/mapPointTypes';
import {
  applyDeviceLocation,
  hasRenderableLocation,
  locationHasConflict,
  locationWriteCandidates,
  readDeviceLocation,
  serializeLocationPoint,
} from '../src/views/tb/map/services/globalDeviceLocation';
import { mergePointRuntimeFields } from '../src/views/tb/map/services/mapPointPositionService';

const base: MapPoint = {
  id: 'p',
  type: 'sensor',
  name: '探头',
  entityType: 'DEVICE',
  entityId: 'uuid-1',
  entityName: '探头',
  longitude: 114,
  latitude: 30,
  height: 10,
  heightMode: 'absolute',
  positionSource: 'template',
  modelAnchor: {
    frameVersion: 1,
    modelId: 'm',
    modelRevision: 'r',
    localPosition: { x: 1, y: 2, z: 3 },
    fallbackWorldPosition: { longitude: 114, latitude: 30, height: 10 },
    occlusion: 'physical',
  },
  createdAt: 1,
  updatedAt: 1,
};
const other = { ...base, id: 'p-other', longitude: 115, latitude: 31, height: 20 };
const v1 = {
  longitude: 116,
  latitude: 32,
  height: 40,
  heightMode: 'absolute' as const,
  revision: 1,
  updatedTime: 1,
  source: 'confirmed' as const,
};
const v2 = { ...v1, longitude: 117, revision: 2, updatedTime: 2 };
assert.equal(readDeviceLocation({ ...v1, longitude: NaN }), null);
assert.equal(readDeviceLocation({ ...v1, latitude: 91 }), null);
assert.equal(readDeviceLocation({ ...v1, revision: -1 }), null);
const a = applyDeviceLocation(base, v1);
const b = applyDeviceLocation(other, v1);
assert.equal(a.longitude, b.longitude, '同 UUID 的不同模板显示相同正式位置');
assert.equal(a.positionSource, 'device');
assert.equal(b.height, 40);
assert.equal(
  mergePointRuntimeFields(a, { longitude: 999, latitude: 99, deviceLocation: v2 }).longitude,
  117,
  '遥测同名字段不能覆盖正式位置',
);
assert.equal(applyDeviceLocation(a, v2).longitude, 117, '接到较新 SSE 后更新位置');
assert.equal(applyDeviceLocation(applyDeviceLocation(a, v2), v1).longitude, 117, '旧 SSE 不回退');
assert.equal(applyDeviceLocation(a, null).longitude, 116, '断流保留最后一次可信位置');
assert.equal(hasRenderableLocation(applyDeviceLocation(base, null)), false, '从未读取成功时不显示旧模板坐标');
assert.equal(
  hasRenderableLocation(applyDeviceLocation({ ...base, locationPending: true }, null)),
  false,
  '用户大屏也不展示尚未提交的模板草稿',
);
const draft = { ...a, longitude: 118, locationPending: true, locationRevision: 1, positionSource: 'template' as const };
assert.equal(applyDeviceLocation(draft, v2, true).longitude, 118, '外部变更保留正在编辑的草稿');
assert.equal(locationHasConflict(draft, v2), true, '草稿必须提示外部版本变化');
assert.equal(locationWriteCandidates([a, { ...a, color: 'red' }, draft]).length, 1, '只写显式定位草稿，同设备去重');
assert.equal(locationWriteCandidates([base]).length, 0, '旧模板不得加载即迁移');
assert.equal(serializeLocationPoint(a).deviceLocation, undefined, '设备位置读缓存不写回模板');
console.log('跨模板正式位置、SSE 版本、草稿冲突与旧模板只读测试通过');
