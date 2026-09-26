import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createNativeWidget,
  getNativeWidgetSupport,
  validateNativeWidget,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';

const source = JSON.parse(
  readFileSync(resolve('../backend/application/src/main/data/json/system/widget_types/thermometer_scale.json'), 'utf8'),
);
assert.equal(getNativeWidgetSupport(source).supported, true);
const widget = createNativeWidget(source);
assert.equal(widget.config.native.family, 'gauge');
assert.equal(widget.config.native.gauge.type, 'thermometer');
assert.equal(widget.config.native.min, -60);
assert.equal(widget.config.native.max, 100);
widget.config.datasources = [
  {
    type: 'entity',
    entityType: 'DEVICE',
    entityId: 'temp-device',
    dataKeys: [{ name: 'temperature', type: 'timeseries', label: 'Temperature', units: '°C', decimals: 1 }],
  },
];
assert.deepEqual(validateNativeWidget(widget), []);
const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
assert.equal(reopened.config.native.gauge.type, 'thermometer');
assert.equal(reopened.config.native.min, -60);
console.log('Thermometer source, vertical gauge preset, range and configuration roundtrip passed');
