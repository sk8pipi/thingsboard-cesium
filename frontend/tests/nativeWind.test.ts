import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createNativeWidget,
  getNativeWidgetSupport,
  validateNativeWidget,
} from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import {
  windReading,
  windTickLabel,
  validateWindSettings,
} from '../src/views/tb/dashboard/runtime/native/nativeWindCore';

for (const fqn of ['wind_speed_and_direction', 'wind_speed_and_direction_with_background']) {
  const source = JSON.parse(
    readFileSync(resolve(`../backend/application/src/main/data/json/system/widget_types/${fqn}.json`), 'utf8'),
  );
  assert.equal(getNativeWidgetSupport(source).supported, true);
  const widget = createNativeWidget(source);
  assert.equal(widget.config.native.family, 'wind');
  widget.config.datasources = [
    {
      type: 'entity',
      entityType: 'DEVICE',
      entityId: 'wind-device',
      dataKeys: [
        { name: 'direction', type: 'timeseries', label: 'Wind Direction' },
        { name: 'speed', type: 'timeseries', label: 'Wind Speed', units: 'm/s', decimals: 1 },
      ],
    },
  ];
  assert.deepEqual(validateNativeWidget(widget), []);
  const settings = widget.config.native.wind;
  assert.equal(settings.backgroundType, fqn.endsWith('with_background') ? 'image' : 'color');
  settings.layout = 'advanced';
  settings.directionalNamesElseDegrees = false;
  settings.centerValueFontSize = 30;
  settings.arrowColor = '#cc22aa';
  const reopened = createNativeWidget(JSON.parse(JSON.stringify(widget)));
  assert.equal(reopened.config.native.wind.layout, 'advanced');
  assert.equal(reopened.config.native.wind.centerValueFontSize, 30);
  assert.equal(reopened.config.native.wind.arrowColor, '#cc22aa');
  assert.deepEqual(validateNativeWidget(reopened), []);
  const oneField = JSON.parse(JSON.stringify(widget));
  oneField.config.datasources[0].dataKeys.pop();
  assert.deepEqual(validateNativeWidget(oneField), []);
  const tooMany = JSON.parse(JSON.stringify(widget));
  tooMany.config.datasources[0].dataKeys.push({ name: 'extra', type: 'timeseries' });
  assert.match(validateNativeWidget(tooMany).join(','), /风向字段/);
}
const compassSource = JSON.parse(
  readFileSync(resolve('../backend/application/src/main/data/json/system/widget_types/compass.json'), 'utf8'),
);
assert.equal(getNativeWidgetSupport(compassSource).supported, true);
const compass = createNativeWidget(compassSource);
assert.equal(compass.config.native.family, 'wind');
assert.equal(compass.config.native.wind.layout, 'advanced');
assert.equal(compass.config.native.wind.arrowColor, '#f08080');
compass.config.datasources = [
  {
    type: 'entity',
    entityType: 'DEVICE',
    entityId: 'compass-device',
    dataKeys: [{ name: 'direction', type: 'timeseries', label: 'Direction' }],
  },
];
assert.deepEqual(validateNativeWidget(compass), []);
assert.equal(createNativeWidget(JSON.parse(JSON.stringify(compass))).config.native.wind.layout, 'advanced');
assert.equal(windTickLabel(45, true), 'NE');
assert.equal(windTickLabel(270, true), 'W');
assert.equal(windTickLabel(315, false), '315');
const defaultWind = createNativeWidget({ fqn: 'wind_speed_and_direction' }).config.native.wind;
assert.deepEqual(windReading(0, undefined, false, 1, 'm/s', defaultWind), {
  angle: 0,
  text: '0°',
  units: '',
  color: '#7191EF',
});
assert.equal(windReading(-45, 2.5, true, 1, 'm/s', defaultWind).angle, 315);
assert.equal(windReading(45, 2.5, true, 1, 'm/s', defaultWind).text, '2.5');
assert.equal(windReading(45, undefined, true, 1, 'm/s', defaultWind).text, 'N/A');
assert.equal(windReading(null, 0, true, 1, 'm/s', defaultWind).text, '0.0');
assert.deepEqual(validateWindSettings({ ...defaultWind, layout: 'unknown' } as any), ['风向布局无效']);
console.log(
  'Two wind direction definitions and compass, layout settings, color, field order and JSON roundtrip passed',
);
