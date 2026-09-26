import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import {
  batteryLevel,
  batterySegments,
  indicatorColor,
  indicatorNumber,
  signalBars,
} from '../src/views/tb/dashboard/runtime/native/nativeIndicatorCore';
import { withNativeSettings } from '../src/views/tb/dashboard/runtime/native/nativeWidgetSettings';

const root = '../backend/application/src/main/data/json/system/widget_types/';
function widget(fqn: string) {
  const raw = JSON.parse(readFileSync(`${root}${fqn}.json`, 'utf8'));
  const selected = createNativeWidget(raw);
  selected.config.datasources = [
    {
      type: 'entity',
      entityType: 'DEVICE',
      entityId: 'device-1',
      dataKeys: [
        {
          name: fqn === 'battery_level' ? 'battery' : 'rssi',
          type: 'timeseries',
          decimals: 0,
          units: fqn === 'battery_level' ? '%' : 'dBm',
        },
      ],
    },
  ];
  return selected;
}

assert.equal(indicatorNumber(''), null);
assert.equal(indicatorNumber(false), null);
assert.equal(indicatorNumber('-70'), -70);
assert.equal(batteryLevel(125), 100);
assert.equal(batteryLevel(-1), 0);
assert.equal(batteryLevel(null), null);
assert.deepEqual(batterySegments(25, 4), [true, false, false, false]);
assert.deepEqual(batterySegments(25.1, 4), [true, true, false, false]);
assert.deepEqual(batterySegments(null, 4), [false, false, false, false]);
assert.deepEqual(signalBars(null, -100), [false, false, false, false]);
assert.deepEqual(signalBars(-100, -100), [false, false, false, false]);
assert.deepEqual(signalBars(-85, -100), [true, true, false, false]);
assert.deepEqual(signalBars(-55, -100), [true, true, true, true]);
assert.deepEqual(signalBars(-60, -50), [false, false, false, false]);

for (const fqn of ['battery_level', 'signal_strength']) {
  const selected = widget(fqn);
  assert.deepEqual(validateNativeWidget(selected), []);
  const original = JSON.parse(JSON.stringify(selected));
  const settings = withNativeSettings(selected.config.native);
  if (fqn === 'battery_level') {
    settings.battery.layout = 'horizontal_divided';
    settings.battery.sectionsCount = 6;
    settings.battery.batteryLevelColor.ranges[0].color = '#123456';
    assert.equal(indicatorColor(settings.battery.batteryLevelColor, 10), '#123456');
  } else {
    settings.signal.layout = 'cellular_bar';
    settings.signal.showDate = true;
    settings.signal.noSignalRssiValue = -95;
    settings.signal.activeBarsColor.ranges[1].color = '#654321';
    assert.equal(indicatorColor(settings.signal.activeBarsColor, -75), '#654321');
  }
  selected.config.native = settings;
  assert.deepEqual(validateNativeWidget(selected), []);
  const saved = JSON.parse(JSON.stringify(selected));
  const reedited = createNativeWidget(saved);
  assert.deepEqual(reedited.config.native, saved.config.native);
  assert.notDeepEqual(reedited.config.native, original.config.native);
  reedited.config.datasources.push({ type: 'entity', entityType: 'DEVICE', entityId: 'extra', dataKeys: [] });
  assert.ok(validateNativeWidget(reedited).length > 0);
}

console.log('Native indicator settings, thresholds and re-edit tests passed');
