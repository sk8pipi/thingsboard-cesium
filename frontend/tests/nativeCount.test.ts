import assert from 'node:assert/strict';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { nativeCountQuery, validateNativeCount } from '../src/views/tb/dashboard/runtime/native/nativeCountCore';

const entity = createNativeWidget({ fqn: 'entity_count', name: 'Entity count' });
assert.equal(entity.config.native.family, 'count');
assert.equal(entity.config.native.count.kind, 'entity');
assert.deepEqual(validateNativeWidget(entity), []);
assert.deepEqual(nativeCountQuery(entity.config.native.count), {
  entityFilter: { type: 'entityType', entityType: 'DEVICE' },
});
entity.config.native.count.entityType = 'ASSET';
entity.config.native.count.nameFilter = 'Office';
assert.deepEqual(nativeCountQuery(entity.config.native.count), {
  entityFilter: { type: 'entityName', entityType: 'ASSET', entityNameFilter: 'Office' },
});
entity.config.native.count.entityType = 'DEVICE';
entity.config.native.count.singleEntityId = 'device-1';
assert.deepEqual(nativeCountQuery(entity.config.native.count), {
  entityFilter: { type: 'singleEntity', singleEntity: { entityType: 'DEVICE', id: 'device-1' } },
});
assert.deepEqual(validateNativeWidget(JSON.parse(JSON.stringify(entity))), []);

const alarm = createNativeWidget({ fqn: 'alarm_count', name: 'Alarm count' });
assert.equal(alarm.config.native.count.kind, 'alarm');
assert.equal(alarm.config.native.count.entityType, 'ALL');
assert.deepEqual(validateNativeWidget(alarm), []);
alarm.config.native.count.statusList = ['ACTIVE', 'UNACK'];
alarm.config.native.count.severityList = ['CRITICAL'];
alarm.config.native.count.typeList = 'High temperature, Low pressure, High temperature';
alarm.config.native.count.timeWindowMs = 60000;
assert.deepEqual(nativeCountQuery(alarm.config.native.count, 100000), {
  statusList: ['ACTIVE', 'UNACK'],
  severityList: ['CRITICAL'],
  typeList: ['High temperature', 'Low pressure'],
  startTs: 40000,
  endTs: 100000,
});
const saved = JSON.parse(JSON.stringify(alarm));
assert.deepEqual(validateNativeWidget(saved), []);
assert.deepEqual(saved.config.native.count, alarm.config.native.count);
assert.match(
  validateNativeCount({ ...saved.config.native.count, kind: 'entity' }, 'alarm_count').join(';'),
  /计数类别与原生部件不一致/,
);
alarm.config.datasources = [{ entityType: 'DEVICE', entityId: 'device-1', dataKeys: [] }];
assert.match(validateNativeWidget(alarm).join(';'), /不绑定遥测数据源/);
console.log('Native entity/alarm count query, validation and config round-trip passed');
