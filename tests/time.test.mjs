import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getClientMonthBoundsTs,
  getClientTodayStartTs,
  resolveTimezoneOffset,
  toClientDateStr,
} from '../server/utils/time.js';

test('resolves timezone offset from beacon body before header', () => {
  assert.equal(resolveTimezoneOffset('-480', { tz_offset: 300 }), 300);
  assert.equal(resolveTimezoneOffset('-480', {}), -480);
  assert.equal(resolveTimezoneOffset(undefined, {}), 0);
});

test('computes UTC timestamp for UTC+8 local day start', () => {
  const now = Date.UTC(2026, 5, 23, 10, 30, 0);
  const startTs = getClientTodayStartTs(-480, now);
  assert.equal(startTs, Date.UTC(2026, 5, 22, 16, 0, 0) / 1000);
});

test('computes UTC timestamp for UTC-5 local day start', () => {
  const now = Date.UTC(2026, 5, 23, 10, 30, 0);
  const startTs = getClientTodayStartTs(300, now);
  assert.equal(startTs, Date.UTC(2026, 5, 23, 5, 0, 0) / 1000);
});

test('computes client month bounds for UTC+8', () => {
  const bounds = getClientMonthBoundsTs(2026, 6, -480);
  assert.deepEqual(bounds, {
    startTs: Date.UTC(2026, 4, 31, 16, 0, 0) / 1000,
    endTs: Date.UTC(2026, 5, 30, 16, 0, 0) / 1000,
  });
});

test('formats UTC timestamp as client date', () => {
  const ts = Date.UTC(2026, 5, 22, 16, 30, 0) / 1000;
  assert.equal(toClientDateStr(ts, -480), '2026-06-23');
  assert.equal(toClientDateStr(ts, 0), '2026-06-22');
});
