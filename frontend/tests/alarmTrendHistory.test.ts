import assert from 'node:assert/strict';
import {
  createAlarmTrendRange,
  formatAlarmTrendBucketLabel,
  formatAlarmTrendDate,
  parseAlarmTrendResponse,
  type AlarmTrendMode,
  type AlarmTrendResponse,
} from '../src/views/tb/dashboard/runtime/widgets/alarm/alarmTrend';

const now = Date.parse('2026-09-06T16:15:30Z'); // 北京时间 9月7日 00:15
function response(mode: AlarmTrendMode): AlarmTrendResponse {
  return {
    ...createAlarmTrendRange(mode, now),
    mode,
    timeZone: 'Asia/Shanghai',
    generatedAt: now,
    completeFrom: now - 1000,
    historicalDataIncomplete: true,
  };
}
const daily = response('sevenDays');
assert.equal(daily.buckets.length, 7);
assert.equal(daily.buckets[0].label, '09/01');
assert.equal(daily.buckets[6].label, '09/07');
assert.equal(daily.startTime, Date.parse('2026-09-01T00:00:00+08:00'));
assert.equal(formatAlarmTrendDate(now), '2026-09-07 00:15:30');
assert.equal(formatAlarmTrendBucketLabel(daily.buckets[6], 'sevenDays'), '2026-09-07');
daily.buckets[6].total = 10;
daily.buckets[6].severityCounts.MAJOR = 10;
assert.equal(parseAlarmTrendResponse(daily, 'sevenDays').buckets[6].total, 10);

const hourly = response('twentyFourHours');
assert.equal(hourly.buckets.length, 24);
assert.equal(hourly.buckets[0].label, '01:00');
assert.equal(hourly.buckets[23].label, '00:00');
assert.equal(formatAlarmTrendBucketLabel(hourly.buckets[22], 'twentyFourHours'), '2026-09-06 23:00–00:00');
assert.equal(parseAlarmTrendResponse(hourly, 'twentyFourHours').buckets.length, 24);
assert.throws(() => parseAlarmTrendResponse(null, 'sevenDays'));
assert.throws(() => parseAlarmTrendResponse(daily, 'twentyFourHours'));
assert.throws(() => parseAlarmTrendResponse({ ...daily, buckets: [] }, 'sevenDays'));
const bad = structuredClone(daily);
bad.buckets[6].total = 11;
assert.throws(() => parseAlarmTrendResponse(bad, 'sevenDays'));
bad.buckets[6].severityCounts.MAJOR = -1;
assert.throws(() => parseAlarmTrendResponse(bad, 'sevenDays'));
assert.throws(() => parseAlarmTrendResponse({ ...daily, timeZone: 'UTC' }, 'sevenDays'));
console.log('报警趋势：北京时间边界、分组、覆盖信息和无效响应校验通过');
