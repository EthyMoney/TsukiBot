'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* --------------------------------------------

    Scheduled actions timing & anti-drift tests.

    Recurring posts (/schedule) check every minute via runDueScheduledPosts().
    Previously, stamping `last_run = NOW()` unconditionally caused compounding
    forward drift because:
      1. NOW() records sub-minute seconds/milliseconds.
      2. The runner triggers on :00, so `last_run + interval` fell slightly
         in the future and missed the top-of-minute tick, slipping to the next.
      3. Stamping the new execution time permanently advanced the baseline.

    These tests verify that the SQL query in main.js anchors to whole minutes,
    advances from the scheduled baseline rather than NOW(), and mathematically
    prevents execution drift over repeated runs.

  -------------------------------------------- */

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function extractRunDueQuery() {
  const funcStart = mainSource.indexOf('async function runDueScheduledPosts()');
  assert.notEqual(funcStart, -1, 'runDueScheduledPosts not found in main.js');
  const queryStart = mainSource.indexOf('UPDATE tsukibot.scheduled_posts', funcStart);
  assert.notEqual(queryStart, -1, 'UPDATE query not found in runDueScheduledPosts');
  const queryEnd = mainSource.indexOf('RETURNING *;', queryStart);
  assert.notEqual(queryEnd, -1, 'RETURNING clause not found');
  return mainSource.slice(queryStart, queryEnd + 'RETURNING *;'.length);
}

test('runDueScheduledPosts query anchors to minute and does not use bare NOW()', () => {
  const query = extractRunDueQuery();

  // Must not unconditionally set last_run = NOW()
  assert.ok(!/SET\s+last_run\s*=\s*NOW\(\)/i.test(query),
    'query must not set last_run = NOW() directly as that causes monotonic drift');

  // Must use date_trunc('minute', ...) to zero out sub-minute precision
  assert.match(query, /date_trunc\('minute',\s*NOW\(\)\)/i,
    'query must anchor new jobs with date_trunc on NOW()');
  assert.match(query, /date_trunc\('minute',\s*last_run\)/i,
    'query must truncate existing last_run to whole minutes');

  // Must include jitter buffer
  assert.match(query, /INTERVAL '30 seconds'/i,
    'query must include a jitter buffer so top-of-minute cron ticks are never missed');

  // Must advance from scheduled anchor rather than actual run time
  assert.match(query, /last_run\)\s*\+\s*\(interval_minutes \* INTERVAL '1 minute'\)/i,
    'query must advance from last_run by interval_minutes');
});

/* --------------------------------------------------------------------------
 *  Mathematical simulation of the advancement logic
 * -------------------------------------------------------------------------- */

/**
 * JS equivalent of the Postgres UPDATE expression:
 *   CASE
 *     WHEN last_run IS NULL THEN date_trunc('minute', now)
 *     ELSE date_trunc('minute', last_run) + interval_ms *
 *          GREATEST(1, FLOOR((now - date_trunc('minute', last_run) + 30s) / interval_ms))
 *   END
 */
function advanceScheduledPost(lastRunMs, intervalMinutes, nowMs) {
  const intervalMs = intervalMinutes * 60 * 1000;
  if (lastRunMs === null || lastRunMs === undefined) {
    // date_trunc('minute', now)
    return Math.floor(nowMs / 60000) * 60000;
  }
  const anchorMs = Math.floor(lastRunMs / 60000) * 60000;
  const elapsedWithJitter = nowMs - anchorMs + 30000;
  const intervalsPassed = Math.max(1, Math.floor(elapsedWithJitter / intervalMs));
  return anchorMs + (intervalsPassed * intervalMs);
}

function isDue(lastRunMs, intervalMinutes, nowMs) {
  if (lastRunMs === null || lastRunMs === undefined) return true;
  const intervalMs = intervalMinutes * 60 * 1000;
  const anchorMs = Math.floor(lastRunMs / 60000) * 60000;
  return anchorMs + intervalMs - 30000 <= nowMs;
}

test('repeated 12-hour schedule runs do not drift over 100 iterations (50 days)', () => {
  const intervalMinutes = 720; // 12 hours
  const startMinute = Date.UTC(2026, 7, 1, 14, 0, 0); // 14:00:00 UTC

  // User creates schedule at 14:00:25
  let lastRun = null;
  const creationTime = startMinute + 25000;

  // First run fires on next tick at 14:00:45 (or 14:01:00)
  const firstTick = startMinute + 45000;
  assert.ok(isDue(lastRun, intervalMinutes, firstTick));
  lastRun = advanceScheduledPost(lastRun, intervalMinutes, firstTick);
  assert.equal(lastRun, startMinute, 'first run must anchor exactly to 14:00:00');

  // Simulate 100 subsequent runs (50 days) with random jitter
  let currentTarget = startMinute;
  for (let run = 1; run <= 100; run++) {
    currentTarget += intervalMinutes * 60 * 1000;

    // Cron runs at minute boundary with varying realistic jitter (-50ms to +1500ms)
    const jitterMs = Math.floor((Math.random() * 1550) - 50);
    const cronTick = currentTarget + jitterMs;

    // Must be recognized as due
    assert.ok(isDue(lastRun, intervalMinutes, cronTick), `run #${run} was not marked due`);

    // Advance
    lastRun = advanceScheduledPost(lastRun, intervalMinutes, cronTick);

    // Exact match to the target minute: ZERO drift!
    assert.equal(lastRun, currentTarget,
      `run #${run} drifted: expected ${new Date(currentTarget).toISOString()}, got ${new Date(lastRun).toISOString()}`);
    assert.equal(new Date(lastRun).getUTCMinutes(), 0, 'minute must remain 0');
    assert.equal(new Date(lastRun).getUTCSeconds(), 0, 'seconds must remain 0');
  }
});

test('bot offline for multiple intervals catches up cleanly to the latest interval', () => {
  const intervalMinutes = 60; // 1 hour
  const start = Date.UTC(2026, 7, 1, 12, 0, 0);
  let lastRun = start;

  // Bot is down for 4 hours and 15 minutes, restarts at 16:15
  const restartTime = start + (4 * 60 + 15) * 60 * 1000;
  assert.ok(isDue(lastRun, intervalMinutes, restartTime));

  // Should advance by 4 intervals to 16:00
  lastRun = advanceScheduledPost(lastRun, intervalMinutes, restartTime);
  const expected = Date.UTC(2026, 7, 1, 16, 0, 0);
  assert.equal(lastRun, expected, 'should advance to 16:00 without missing minute alignment');

  // Next check at 16:16 is NOT due
  assert.ok(!isDue(lastRun, intervalMinutes, restartTime + 60000), 'should not be due immediately again');

  // Due at 17:00
  const nextHour = Date.UTC(2026, 7, 1, 17, 0, 5);
  assert.ok(isDue(lastRun, intervalMinutes, nextHour));
  lastRun = advanceScheduledPost(lastRun, intervalMinutes, nextHour);
  assert.equal(lastRun, Date.UTC(2026, 7, 1, 17, 0, 0));
});
