import assert from 'node:assert/strict';
import {
  CumulativeUsageAccumulator,
  normalizeUsageTrend,
} from '../src/views/tb/dashboard/runtime/widgets/aggregate/cumulativeUsageAccumulator';
import type { UsageSummary } from '../src/views/tb/dashboard/runtime/widgets/aggregate/resourceUsage';

const now = new Date('2026-07-16T10:30:00+08:00').getTime();

function baseSummary(): UsageSummary {
  return {
    today: 10,
    yesterdaySameTime: 8,
    changeRate: 25,
    month: 100,
    currentHour: 2,
    topDevice: {
      deviceId: 'a',
      deviceName: 'Water A',
      key: 'waterConsumption',
      value: 10,
    },
    trend24h: [{ ts: new Date('2026-07-16T10:00:00+08:00').getTime(), value: 2 }],
    trend7d: [{ ts: new Date('2026-07-16T00:00:00+08:00').getTime(), value: 10 }],
    continuousDevices: [],
    deviceTodayValues: [
      {
        deviceId: 'a',
        deviceName: 'Water A',
        key: 'waterConsumption',
        value: 10,
      },
    ],
    latestDeviceReadings: [
      {
        deviceId: 'a',
        deviceName: 'Water A',
        key: 'waterConsumption',
        ts: now,
        value: 100,
      },
    ],
    updatedAt: now,
  };
}

function testFixedBucketCounts() {
  assert.equal(normalizeUsageTrend([], 'sevenDays', now).length, 7);
  assert.equal(normalizeUsageTrend([], 'twentyFourHours', now).length, 24);
}

function testIncrementalUsage() {
  const accumulator = new CumulativeUsageAccumulator(baseSummary());
  assert.equal(
    accumulator.applyLatest({ id: 'a', name: 'Water A' }, 'waterConsumption', { ts: now + 1000, value: 105 }),
    true,
  );
  const result = accumulator.snapshot();
  assert.equal(result.today, 15);
  assert.equal(result.month, 105);
  assert.equal(result.currentHour, 7);
  assert.equal(result.topDevice?.deviceName, 'Water A');
  assert.equal(result.topDevice?.value, 15);

  assert.equal(
    accumulator.applyLatest({ id: 'a', name: 'Water A' }, 'waterConsumption', { ts: now - 1000, value: 200 }),
    false,
  );
  assert.equal(accumulator.snapshot().today, 15);
}

function testMeterResetDoesNotCreateUsage() {
  const accumulator = new CumulativeUsageAccumulator(baseSummary());
  accumulator.applyLatest({ id: 'a', name: 'Water A' }, 'waterConsumption', { ts: now + 1000, value: 2 });
  assert.equal(accumulator.snapshot().today, 10);

  accumulator.applyLatest({ id: 'a', name: 'Water A' }, 'waterConsumption', { ts: now + 2000, value: 5 });
  assert.equal(accumulator.snapshot().today, 13);
}

function testDayBoundaryResetsDailyValues() {
  const accumulator = new CumulativeUsageAccumulator(baseSummary());
  const nextDay = new Date('2026-07-17T00:00:01+08:00').getTime();
  accumulator.advanceTo(nextDay);
  const result = accumulator.snapshot();
  assert.equal(result.today, 0);
  assert.equal(result.currentHour, 0);
  assert.equal(result.topDevice, null);
  assert.equal(result.trend7d.length, 7);
  assert.equal(result.trend24h.length, 24);
}

testFixedBucketCounts();
testIncrementalUsage();
testMeterResetDoesNotCreateUsage();
testDayBoundaryResetsDailyValues();
console.log('cumulative usage accumulator tests passed');
