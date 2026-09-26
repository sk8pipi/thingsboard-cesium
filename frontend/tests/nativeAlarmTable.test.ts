import assert from 'node:assert/strict';
import { createNativeWidget, validateNativeWidget } from '../src/views/tb/dashboard/runtime/native/nativeWidgetCatalog';
import { nativeAlarmTableQuery } from '../src/views/tb/dashboard/runtime/native/nativeAlarmTableCore';
import { withNativeSettings } from '../src/views/tb/dashboard/runtime/native/nativeWidgetSettings';

const widget = createNativeWidget({ fqn: 'alarm_widgets.alarms_table' });
assert.equal(widget.config.native.family, 'alarmTable');
assert.deepEqual(validateNativeWidget(widget), []);
const settings = widget.config.native.alarmTable;
settings.defaultPageSize = 25;
settings.defaultSortOrder = 'ASC';
settings.statusList = ['ACTIVE'];
settings.severityList = ['CRITICAL'];
settings.singleEntityId = 'device-1';
settings.useTimeWindow = true;
widget.config.native.window.realtime = true;
widget.config.native.window.durationMs = 300_000;
const query = nativeAlarmTableQuery(settings, widget.config.native, 2, '  pump  ', '', '', 1_000_000);
assert.equal(query.page, 2);
assert.equal(query.pageSize, 25);
assert.equal(query.sortOrder, 'ASC');
assert.equal(query.searchText, 'pump');
assert.deepEqual(query.statusList, ['ACTIVE']);
assert.deepEqual(query.severityList, ['CRITICAL']);
assert.equal(query.entityId, 'device-1');
assert.equal(query.startTime, 700_000);
assert.equal(query.endTime, 1_000_000);
settings.displayPagination = false;
settings.enableSearch = false;
assert.equal(nativeAlarmTableQuery(settings, widget.config.native, 0, 'ignored', 'CLEARED', 'MAJOR').pageSize, 100);
assert.equal(nativeAlarmTableQuery(settings, widget.config.native, 0, 'ignored', 'CLEARED', 'MAJOR').searchText, '');
assert.equal(
  withNativeSettings(JSON.parse(JSON.stringify(widget.config.native))).alarmTable.singleEntityId,
  'device-1',
);
settings.defaultPageSize = 101;
assert.ok(validateNativeWidget(widget).length > 0);
console.log('native alarm table passed');
