import assert from 'node:assert/strict';
import { reactive } from 'vue';
import {
  readDeviceProfile,
  profileLabel,
  profileKey,
  defaultProfileRule,
  hydrateProfilePoint,
  resolveProfilePointStyle,
  migrateProfileRules,
  safeProfileImage,
  UNKNOWN_PROFILE,
} from '../src/views/tb/map/services/deviceProfilePresentation';
import { normalizeMapPoint } from '../src/views/tb/map/mapPointStorage';
import {
  createDefaultMapTemplateState,
  normalizeMapTemplateState,
  toMapBusinessBinding,
} from '../src/views/tb/map/mapTemplateConfig';
import {
  mergePointRuntimeFields,
  unifiedDeviceLocationWriteCandidates,
} from '../src/views/tb/map/services/mapPointPositionService';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
// 执行实际统计函数，隔离同模块中的网络导入。
const usageSource = ts.createSourceFile(
  'resourceUsage.ts',
  fs.readFileSync(
    new URL('../src/views/tb/dashboard/runtime/widgets/aggregate/resourceUsage.ts', import.meta.url),
    'utf8',
  ),
  ts.ScriptTarget.Latest,
  true,
);
const names = [
  'booleanValue',
  'isTbDeviceActive',
  'getRuntimeDeviceName',
  'getRuntimeDeviceType',
  'listRuntimeDevices',
  'groupDevicesByType',
];
const declarations = usageSource.statements
  .filter(ts.isFunctionDeclaration)
  .filter((node) => names.includes(node.name!.text));
assert.equal(declarations.length, names.length);
const usageContext = vm.createContext({ profileLabel, profileKey, readDeviceProfile });
vm.runInContext(
  ts.transpileModule(declarations.map((node) => node.getText(usageSource).replace(/^export /, '')).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText,
  usageContext,
);
const groupDevicesByType = usageContext.groupDevicesByType;
import { resolveTemplateDevices } from '../src/views/tb/dashboard/runtime/widgets/aggregate/templateDeviceResolver';
import type { MapPoint } from '../src/views/tb/map/types/mapPointTypes';

const metadata = {
  deviceProfileId: 'profile-temp',
  deviceProfileName: 'temperature',
  deviceProfileImage: 'tb-image;/api/images/tenant/icon.svg',
};
const point: MapPoint = {
  id: 'point1',
  entityId: 'device1',
  entityType: 'DEVICE',
  entityName: 'sim-sensor-001',
  name: 'sim-sensor-001',
  type: 'sensor',
  longitude: 114,
  latitude: 30,
  height: 22,
  positionSource: 'template',
  deviceLocationSynced: true,
  createdAt: 1,
  updatedAt: 1,
  ...metadata,
};
const runtime = { entityMetadata: metadata, deviceType: 'camera', deviceProfileId: 'fake', deviceProfileName: 'fake' };
assert.deepEqual(readDeviceProfile(runtime), metadata, '只信保留元数据');
assert.equal(profileLabel(runtime), 'temperature');
assert.equal(readDeviceProfile({ entityMetadata: {} }, point).deviceProfileId, '', '失败元数据不能伪装成旧配置');
assert.equal(profileKey(readDeviceProfile({ entityMetadata: {} })), UNKNOWN_PROFILE);
assert.notEqual(profileKey({ deviceProfileId: 'default-id', deviceProfileName: 'default' }), UNKNOWN_PROFILE);
assert.equal(safeProfileImage(metadata.deviceProfileImage), '/api/images/tenant/icon.svg');
assert.equal(safeProfileImage('javascript:alert(1)'), undefined);
assert.equal(safeProfileImage('//upstream/private'), undefined);

const rules = { [metadata.deviceProfileId]: { ...defaultProfileRule(metadata), color: '#123456' } };
const renamed = hydrateProfilePoint(point, { entityMetadata: { ...metadata, deviceProfileName: '环境温度' } }, rules);
assert.equal(renamed.type, 'sensor');
assert.equal(profileLabel(renamed), '环境温度');
assert.equal(resolveProfilePointStyle(renamed, rules).type, 'temperature', '改名保持 ID 关联图标');
const customized = { ...point, pointStyleOverride: { color: '#abcdef' } };
const changed = hydrateProfilePoint(
  customized,
  { entityMetadata: { deviceProfileId: 'profile-camera', deviceProfileName: 'camera' } },
  rules,
);
assert.equal(changed.type, 'camera');
assert.equal(
  profileLabel(
    hydrateProfilePoint({ ...point, entityMetadata: metadata } as any, {
      entityMetadata: { deviceProfileId: 'new', deviceProfileName: 'humidity' },
    }),
  ),
  'humidity',
  '旧运行时保留字段不能遮盖新配置',
);
assert.equal(changed.id, point.id);
assert.equal(changed.longitude, point.longitude);
assert.equal(changed.entityId, point.entityId);
assert.equal(resolveProfilePointStyle(changed, rules).color, '#abcdef');
assert.deepEqual(unifiedDeviceLocationWriteCandidates([changed], [point]), [], '分类变化不写位置');
assert.equal(resolveProfilePointStyle(customized, rules).image, '/api/images/tenant/icon.svg', '仅改颜色仍继承图片');
assert.equal(
  resolveProfilePointStyle({ ...point, pointStyleOverride: { icon: { viewBox: '0 0 1 1', paths: ['M0 0'] } } }, rules)
    .image,
  undefined,
);
assert.equal(
  defaultProfileRule({ deviceProfileId: 'new', deviceProfileName: 'video-temperature' }).pointKind,
  'sensor',
  '禁止关键词猜摄像头',
);
assert.equal(hydrateProfilePoint({ ...point, name: 'camera-fake' }, runtime, rules).type, 'sensor');

const merged = mergePointRuntimeFields(customized, {
  ...runtime,
  longitude: 0,
  pointStyleOverride: { color: 'red' },
  id: 'fake',
});
assert.equal(merged.longitude, 114);
assert.equal(merged.id, point.id);
assert.equal(merged.pointStyleOverride?.color, '#abcdef');
assert.equal(readDeviceProfile(merged).deviceProfileId, metadata.deviceProfileId);
assert.equal(normalizeMapPoint(changed)?.deviceProfileId, 'profile-camera');
assert.deepEqual(normalizeMapPoint(changed)?.pointStyleOverride, changed.pointStyleOverride);
assert.equal(toMapBusinessBinding(changed).deviceProfileId, 'profile-camera');
assert.equal('longitude' in toMapBusinessBinding(changed), false);

const oldPoints = [
  { ...point, deviceType: 'old-a' },
  { ...point, id: 'point2', entityId: 'device2', deviceType: 'old-b' },
];
const legacy = { 'old-a': { color: '#111111' }, 'old-b': { color: '#222222' } };
const conflict = migrateProfileRules(oldPoints, {}, reactive({}), legacy);
assert.equal(conflict.conflicts.length, 1);
assert.equal(conflict.rules[metadata.deviceProfileId], undefined, '冲突不随意选一条');
assert.equal(migrateProfileRules(oldPoints, {}, rules, legacy).conflicts.length, 0, '管理员解决后的规则优先');
assert.equal(migrateProfileRules([oldPoints[0]], {}, {}, legacy).rules[metadata.deviceProfileId].color, '#111111');
assert.equal(oldPoints[0].deviceType, 'old-a', '运行时迁移不改源模板');
const state = normalizeMapTemplateState({
  ...createDefaultMapTemplateState(),
  version: 8,
  mapPoints: [changed],
  deviceProfileStyles: rules,
  profileMigrationBackup: { version: 7, sensorDeviceTypeStyles: legacy },
});
assert.deepEqual(
  normalizeMapTemplateState(JSON.parse(JSON.stringify(state))).profileMigrationBackup,
  state.profileMigrationBackup,
);

const devices = {
  d1: runtime,
  d2: { entityMetadata: { ...metadata, deviceProfileName: 'temperature' } },
  d3: { entityMetadata: { deviceProfileId: 'another-profile', deviceProfileName: 'temperature' } },
};
assert.equal(groupDevicesByType(devices).length, 2, '名称相同但 ID 不同的配置不混为一组');
assert.equal(
  resolveTemplateDevices({
    runtimeDevices: devices,
    selector: { type: 'device-profile', deviceProfile: 'old-name', deviceProfileId: metadata.deviceProfileId },
    telemetryKey: 'temperature',
  }).length,
  2,
);
console.log('设备配置：元数据隔离、改名/换配置、继承、迁移冲突、序列化、统计与位置保护通过');

assert.equal(
  migrateProfileRules(
    [{ ...point, sensorType: 'stale' } as MapPoint],
    { device1: { entityMetadata: metadata, deviceType: { value: 'old-a' } } },
    {},
    legacy,
  ).rules[metadata.deviceProfileId].color,
  '#111111',
  '迁移沿用旧运行时分类优先级并解析包装属性',
);
