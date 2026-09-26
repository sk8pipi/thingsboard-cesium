import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import {
  nativeLocationSpec,
  parseNativeCoordinate,
  writeAndReadNativeLocation,
} from '../src/views/tb/dashboard/runtime/native/nativeLocationInputCore';

const root = resolve('../backend/application/src/main/data/json/system/widget_types');
const names = ['update_location_timeseries', 'update_server_location_attribute', 'update_shared_location_attribute'];
for (const name of names) {
  const original = JSON.parse(readFileSync(resolve(root, `${name}.json`), 'utf8'));
  const widget = createNativeWidget(original);
  const spec = nativeLocationSpec(original.fqn)!;
  assert.equal(widget.config.native.family, 'locationInput');
  widget.config.datasources = [
    {
      type: 'entity',
      entityType: 'DEVICE',
      entityId: 'location-test',
      dataKeys: [
        { name: 'latitude', type: spec.mode, scope: spec.scope },
        { name: 'longitude', type: spec.mode, scope: spec.scope },
      ],
    },
  ];
  widget.config.native.locationInput.showGetLocation = false;
  widget.config.native.locationInput.enableHighAccuracy = true;
  widget.config.native.locationInput.latLabel = '北纬';
  assert.deepEqual(validateNativeWidget(widget), [], name);
  const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
  assert.equal(reopened.config.native.locationInput.showGetLocation, false);
  assert.equal(reopened.config.native.locationInput.enableHighAccuracy, true);
  assert.equal(reopened.config.native.locationInput.latLabel, '北纬');
  assert.deepEqual(validateNativeWidget(reopened), []);
  const broken = JSON.parse(JSON.stringify(widget));
  broken.config.datasources[0].dataKeys[1].name = 'other';
  assert.match(validateNativeWidget(broken).join(','), /经纬度字段/);
  if (spec.scope === 'SHARED_SCOPE') {
    broken.config.datasources[0].entityType = 'ASSET';
    assert.match(validateNativeWidget(broken).join(','), /仅支持设备/);
  }
}
assert.equal(nativeLocationSpec('input_widgets.update_location_timeseries')?.mode, 'timeseries');
assert.equal(nativeLocationSpec('input_widgets.not_location'), null);
assert.equal(parseNativeCoordinate('0', 'lat', true), 0);
assert.equal(parseNativeCoordinate('-180', 'lng', true), -180);
assert.equal(parseNativeCoordinate('', 'lng', false), null);
assert.throws(() => parseNativeCoordinate('', 'lat', true), /纬度/);
assert.throws(() => parseNativeCoordinate('91', 'lat', true), /-90/);
assert.throws(() => parseNativeCoordinate('NaN', 'lng', true), /-180/);

const settings = createNativeWidget(JSON.parse(readFileSync(resolve(root, `${names[0]}.json`), 'utf8'))).config.native
  .locationInput;
const calls: string[] = [];
const transport = {
  writeAttributes: async (scope: string, data: Record<string, unknown>) => {
    calls.push(`write:${scope}:${JSON.stringify(data)}`);
  },
  writeTelemetry: async (data: Record<string, unknown>) => {
    calls.push(`write:telemetry:${JSON.stringify(data)}`);
  },
  readAttributes: async (scope: string, keys: string[]) => {
    calls.push(`read:${scope}:${keys.join(',')}`);
    return { latitude: 0, longitude: 121.5 };
  },
  readTelemetry: async (keys: string[]) => {
    calls.push(`read:telemetry:${keys.join(',')}`);
    return { latitude: 0, longitude: 121.5 };
  },
};
assert.deepEqual(
  await writeAndReadNativeLocation(
    nativeLocationSpec('input_widgets.update_location_timeseries')!,
    settings,
    0,
    121.5,
    transport,
  ),
  { latitude: 0, longitude: 121.5 },
);
assert.deepEqual(calls.splice(0), [
  'write:telemetry:{"latitude":0,"longitude":121.5}',
  'read:telemetry:latitude,longitude',
]);
assert.deepEqual(
  await writeAndReadNativeLocation(
    nativeLocationSpec('input_widgets.update_shared_location_attribute')!,
    settings,
    0,
    121.5,
    transport,
  ),
  { latitude: 0, longitude: 121.5 },
);
assert.deepEqual(calls.splice(0), [
  'write:SHARED_SCOPE:{"latitude":0,"longitude":121.5}',
  'read:SHARED_SCOPE:latitude,longitude',
]);
console.log(
  'Three native location inputs: config roundtrip, key and scope validation, coordinate bounds, atomic write and readback passed',
);
