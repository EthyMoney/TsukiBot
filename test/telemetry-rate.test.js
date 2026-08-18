'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const reports = require('../src/telemetry-reports');
const render = require('../src/telemetry-render');

/* --------------------------------------------

    The /stats throughput number.

    /stats used to compute "average messages per minute" from an in-memory counter that nothing
    incremented once prefix commands were removed, so it displayed 0 forever. It now comes from
    the telemetry table, and these tests pin the two pieces of that calculation.

    Every value below is a STRING, because that is what node-postgres actually returns: COUNT(*)
    is a bigint and EXTRACT is a numeric, and both come back as strings to avoid precision loss.
    Testing with real numbers would pass while the production path silently concatenated them.

  -------------------------------------------- */

/** Builds a getActivityRate row the way pg returns one. */
function row({ total, events24h, trackedMinutes }) {
  return {
    events_1h: String(Math.min(total, 10)),
    events_24h: String(events24h),
    events_total: String(total),
    first_event: new Date(),
    tracked_minutes: String(trackedMinutes)
  };
}

/* ---------- perMinuteRate ---------- */

test('perMinuteRate averages over 24 hours once a full day has been tracked', () => {
  // 2880 events in the last day is exactly two per minute.
  const rate = reports.perMinuteRate(row({ total: 99999, events24h: 2880, trackedMinutes: 10000 }));
  assert.equal(rate, 2);
});

test('perMinuteRate ignores older traffic once the 24h window applies', () => {
  // A busy launch month must not inflate today's rate.
  const rate = reports.perMinuteRate(row({ total: 5000000, events24h: 1440, trackedMinutes: 50000 }));
  assert.equal(rate, 1, 'only the last 24h should count');
});

test('perMinuteRate falls back to the observed span before a full day exists', () => {
  // 600 events over 60 tracked minutes is 10/min. Dividing by 1440 instead would report 0.4 and
  // make a busy new deployment look idle.
  const rate = reports.perMinuteRate(row({ total: 600, events24h: 600, trackedMinutes: 60 }));
  assert.equal(rate, 10);
});

test('perMinuteRate switches to the 24h window exactly at a day', () => {
  const justUnder = reports.perMinuteRate(row({ total: 1439, events24h: 1439, trackedMinutes: 1439 }));
  const exactly = reports.perMinuteRate(row({ total: 2880, events24h: 1440, trackedMinutes: 1440 }));
  assert.equal(justUnder, 1439 / 1439);
  assert.equal(exactly, 1, 'at 1440 minutes it should divide by the full day');
});

test('perMinuteRate does not divide by a near-zero span', () => {
  // The first event of a fresh install can be seconds old, which would otherwise produce a
  // nonsensical spike like 12000 commands per minute.
  const rate = reports.perMinuteRate(row({ total: 3, events24h: 3, trackedMinutes: 0.01 }));
  assert.equal(rate, 3, 'the denominator floors at one minute');
});

test('perMinuteRate reports nothing rather than zero when there is no data', () => {
  // An empty table makes MIN(occurred_at) null, so tracked_minutes comes back null.
  assert.equal(reports.perMinuteRate({ events_total: '0', events_24h: '0', tracked_minutes: null }), null);
  assert.equal(reports.perMinuteRate(null), null);
  assert.equal(reports.perMinuteRate(undefined), null);
});

test('perMinuteRate returns a real number, not a concatenated string', () => {
  // The bug this guards: "2880" / 1440 works in JS, but Number() on the wrong field would give
  // string concatenation or NaN elsewhere in the chain.
  const rate = reports.perMinuteRate(row({ total: 2880, events24h: 2880, trackedMinutes: 5000 }));
  assert.equal(typeof rate, 'number');
  assert.ok(Number.isFinite(rate));
});

/* ---------- formatRate ---------- */

test('formatRate keeps decimals for a quiet bot instead of rounding to zero', () => {
  // This is the whole point: most small servers run well under one command per minute, and the
  // old metric's Math.trunc turned every one of those into "0".
  assert.equal(render.formatRate(0.4), '0.40');
  assert.equal(render.formatRate(0.03), '0.03');
});

test('formatRate floors tiny but nonzero rates visibly', () => {
  assert.equal(render.formatRate(0.0004), '<0.01', 'rare traffic must not read as no traffic');
});

test('formatRate drops precision as the number grows', () => {
  assert.equal(render.formatRate(1.24), '1.2');
  assert.equal(render.formatRate(12.4), '12');
  assert.equal(render.formatRate(142.7), '143');
});

test('formatRate reports a genuine zero as zero', () => {
  assert.equal(render.formatRate(0), '0');
});

test('formatRate handles missing and invalid values', () => {
  assert.equal(render.formatRate(null), 'n/a');
  assert.equal(render.formatRate(undefined), 'n/a');
  assert.equal(render.formatRate(NaN), 'n/a');
  assert.equal(render.formatRate(Infinity), 'n/a');
});

/* ---------- the two together ---------- */

test('a realistic quiet bot renders a useful number end to end', () => {
  // 200 commands a day is a normal small bot, and it must not display as "0".
  const rate = reports.perMinuteRate(row({ total: 6000, events24h: 200, trackedMinutes: 43200 }));
  const shown = render.formatRate(rate);
  assert.equal(shown, '0.14');
  assert.notEqual(shown, '0', 'the regression this whole change exists to fix');
});

test('a realistic busy bot renders a whole number', () => {
  const rate = reports.perMinuteRate(row({ total: 900000, events24h: 43200, trackedMinutes: 43200 }));
  assert.equal(render.formatRate(rate), '30');
});
