import assert from 'node:assert/strict';
import { normalizeAggregateMetricConfig } from '../src/views/tb/dashboard/runtime/widgets/aggregate/aggregateMetricTypes';
import { IncrementalAggregation } from '../src/views/tb/dashboard/runtime/widgets/aggregate/incrementalAggregation';
import { resolveTemplateDevices } from '../src/views/tb/dashboard/runtime/widgets/aggregate/templateDeviceResolver';

function testResolver() {
  const devices = resolveTemplateDevices({
    runtimeDevices: {
      a: { entityName: 'Meter A', deviceCategory: 'electricity_consumption' },
      b: { entityName: 'Meter B', deviceProfileName: 'electricity_consumption' },
      c: { entityName: 'Legacy meter' },
      d: { entityName: 'Temperature', deviceCategory: 'environment' },
    },
    templatePoints: [
      { entityType: 'DEVICE', entityId: 'a', datasource: { keys: [{ name: 'electricityConsumption' }] } },
      { entityType: 'DEVICE', entityId: 'c', datasource: { keys: [{ name: 'electricityConsumption' }] } },
      { entityType: 'DEVICE', entityId: 'c' },
    ],
    selector: { type: 'device-category', deviceCategory: 'electricity_consumption' },
    telemetryKey: 'electricityConsumption',
  });
  assert.deepEqual(
    devices.map((device) => device.deviceId),
    ['a', 'b', 'c'],
  );
}

function testIncrementalSum() {
  const aggregation = new IncrementalAggregation('SUM', 'IGNORE');
  aggregation.replaceEntities(['a', 'b', 'c']);
  aggregation.apply('a', { ts: 10, value: '4.5' });
  aggregation.apply('b', { ts: 11, value: 5.5 });
  aggregation.apply('c', { ts: 12, value: null });
  assert.deepEqual(aggregation.result(), {
    value: 10,
    validEntityCount: 2,
    totalEntityCount: 3,
    missingEntityCount: 1,
    latestTimestamp: 12,
  });

  aggregation.apply('a', { ts: 13, value: 7 });
  assert.equal(aggregation.result().value, 12.5);
  aggregation.apply('a', { ts: 9, value: 100 });
  assert.equal(aggregation.result().value, 12.5);
  aggregation.removeEntity('b');
  assert.equal(aggregation.result().value, 7);
}

function testAverageAndZero() {
  const aggregation = new IncrementalAggregation('AVG', 'ZERO');
  aggregation.replaceEntities(['a', 'b']);
  aggregation.apply('a', { ts: 1, value: 8 });
  aggregation.apply('b', { ts: 1, value: 'invalid' });
  assert.equal(aggregation.result().value, 4);
  assert.equal(aggregation.result().validEntityCount, 1);
}

function testConfigCompatibility() {
  const config = normalizeAggregateMetricConfig({ settings: { key: 'waterConsumption', decimals: 3 } });
  assert.equal(config.dataSource.telemetryKey, 'waterConsumption');
  assert.equal(config.display.decimals, 3);
  assert.equal(config.aggregation.function, 'SUM');
}

function testUnclassifiedLegacySensorFallback() {
  const devices = resolveTemplateDevices({
    runtimeDevices: {
      sensor: { entityName: 'Legacy sensor' },
      camera: { entityName: 'Legacy camera' },
    },
    templatePoints: [
      { type: 'sensor', entityType: 'DEVICE', entityId: 'sensor' },
      { type: 'camera', entityType: 'DEVICE', entityId: 'camera' },
    ],
    selector: { type: 'device-category', deviceCategory: 'electricity_consumption' },
    telemetryKey: 'electricityConsumption',
  });
  assert.deepEqual(
    devices.map((device) => device.deviceId),
    ['sensor'],
  );
}

testResolver();
testIncrementalSum();
testUnclassifiedLegacySensorFallback();
testAverageAndZero();
testConfigCompatibility();
console.log('template aggregate core tests passed');
