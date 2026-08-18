'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const telemetry = require('../src/telemetry');

/* --------------------------------------------

    Telemetry buffered writer.

    This file lives apart from telemetry.test.js because init() sets module-level state: once a
    pool is attached it stays attached, which would invalidate that file's "inert with no pool"
    test. node --test runs each file in its own process, so the two cannot interfere.

    A fake pool stands in for postgres and records every statement, which is what lets the
    batching and the autocomplete coalescing be asserted directly rather than inferred.

  -------------------------------------------- */

function makeFakePool({ failing = false } = {}) {
  const calls = [];
  return {
    calls,
    async query(text, values) {
      calls.push({ text, values });
      if (failing) throw new Error('connection refused');
      return { rowCount: 0, rows: [] };
    }
  };
}

/**
 * Attaches a clean fake pool. init() clears the buffer, any settling searches and the
 * outage-warning latch, which is what keeps these tests independent of each other: without that,
 * an unflushed event from an earlier test would ride along in the next test's first INSERT and
 * shift every positional assertion by a row.
 */
async function freshPool(options = {}, onError = () => { }) {
  const pool = makeFakePool(options);
  telemetry.init({ dbPool: pool, error: onError });
  return pool;
}

/** Counts the rows in a multi-row INSERT by counting its value tuples. */
function rowsInInsert(call) {
  return call.values.length / telemetry.COLUMNS.length;
}

function commandInteraction(name, { userId = 'u1', options = [] } = {}) {
  return {
    commandName: name,
    user: { id: userId, username: 'tester' },
    guildId: 'g1',
    guild: { name: 'Test Server' },
    channelId: 'c1',
    options: { data: options }
  };
}

test('a recorded command reaches the database with its fields intact', async () => {
  const pool = await freshPool();

  telemetry.recordCommand(
    commandInteraction('price', { options: [{ name: 'coin', type: 3, value: 'btc' }] }),
    { durationMs: 42 }
  );
  const written = await telemetry.flush();

  assert.equal(written, 1);
  assert.equal(pool.calls.length, 1);

  const { values } = pool.calls[0];
  const at = (column) => values[telemetry.COLUMNS.indexOf(column)];
  assert.equal(at('command'), 'price');
  assert.equal(at('user_id'), 'u1');
  assert.equal(at('username'), 'tester');
  assert.equal(at('guild_name'), 'Test Server');
  assert.equal(at('outcome'), 'ok');
  assert.equal(at('duration_ms'), 42);
  assert.equal(at('params'), '{"coin":"btc"}');
  assert.deepEqual(at('coins'), ['BTC']);
});

test('several events are written as one batched insert', async () => {
  const pool = await freshPool();

  for (const name of ['cg', 'mc', 'price']) telemetry.recordCommand(commandInteraction(name));
  await telemetry.flush();

  assert.equal(pool.calls.length, 1, 'three events must not cost three round trips');
  assert.equal(rowsInInsert(pool.calls[0]), 3);
});

test('an error outcome is recorded with a classified kind', async () => {
  const pool = await freshPool();

  telemetry.recordCommand(commandInteraction('hmap'), { outcome: 'error', error: { code: 50013 } });
  await telemetry.flush();

  const { values } = pool.calls[0];
  assert.equal(values[telemetry.COLUMNS.indexOf('outcome')], 'error');
  assert.equal(values[telemetry.COLUMNS.indexOf('error_kind')], '50013');
});

test('flushing an empty buffer touches the database not at all', async () => {
  const pool = await freshPool();

  const written = await telemetry.flush();
  assert.equal(written, 0);
  assert.equal(pool.calls.length, 0);
});

test('a failing database drops the batch instead of throwing', async () => {
  // The whole point of the write path: telemetry going down must not surface into a command.
  const errors = [];
  const pool = await freshPool({ failing: true }, (msg) => errors.push(msg));

  telemetry.recordCommand(commandInteraction('cg'));
  const written = await telemetry.flush();

  assert.equal(written, 0, 'nothing was written');
  assert.equal(errors.length, 1, 'the outage is reported once');

  // The buffer must not keep the failed batch, or a prolonged outage grows without bound.
  telemetry.recordCommand(commandInteraction('mc'));
  await telemetry.flush();
  assert.equal(rowsInInsert(pool.calls[1]), 1, 'the dropped batch must not be retried alongside the new event');
});

test('a repeated failure is reported once, not once per batch', async () => {
  const errors = [];
  await freshPool({ failing: true }, (msg) => errors.push(msg));

  for (let i = 0; i < 5; i++) {
    telemetry.recordCommand(commandInteraction('cg'));
    await telemetry.flush();
  }
  assert.equal(errors.length, 1, 'a sustained outage must not spam the log');
});

test('dropped events are counted so the loss is visible', async () => {
  await freshPool({ failing: true });

  const before = telemetry.getWriterStats().dropped;
  telemetry.recordCommand(commandInteraction('cg'));
  telemetry.recordCommand(commandInteraction('mc'));
  await telemetry.flush();

  assert.equal(telemetry.getWriterStats().dropped - before, 2);
});

/* ---------- autocomplete coalescing ---------- */

function autocompleteInteraction(query, { name = 'coin', command = 'price', userId = 'u1' } = {}) {
  return {
    commandName: command,
    user: { id: userId, username: 'tester' },
    guildId: 'g1',
    guild: { name: 'Test Server' },
    channelId: 'c1',
    options: { getFocused: () => ({ name, value: query }) }
  };
}

test('the keystrokes of one search collapse into a single row', async (t) => {
  // Typing "bitcoin" fires seven autocomplete interactions. Writing seven rows would bury the
  // real signal under prefixes and inflate the table by an order of magnitude.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pool = await freshPool();

  for (const query of ['b', 'bi', 'bit', 'bitc', 'bitco', 'bitcoi', 'bitcoin']) {
    telemetry.recordAutocomplete(autocompleteInteraction(query));
  }
  assert.equal(telemetry.getWriterStats().pendingAutocomplete, 1, 'one search in flight, not seven');

  t.mock.timers.tick(telemetry.AUTOCOMPLETE_SETTLE_MS + 10);
  await telemetry.flush();

  assert.equal(rowsInInsert(pool.calls[0]), 1, 'seven keystrokes must produce one row');
  const { values } = pool.calls[0];
  assert.equal(values[telemetry.COLUMNS.indexOf('params')], '{"query":"bitcoin","option":"coin"}',
    'the row should hold the finished query, not a prefix');
  assert.equal(values[telemetry.COLUMNS.indexOf('event_type')], 'autocomplete');
});

test('backspacing is still treated as one search', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pool = await freshPool();

  for (const query of ['bitcoin', 'bitcoi', 'bitco']) {
    telemetry.recordAutocomplete(autocompleteInteraction(query));
  }
  t.mock.timers.tick(telemetry.AUTOCOMPLETE_SETTLE_MS + 10);
  await telemetry.flush();

  assert.equal(rowsInInsert(pool.calls[0]), 1);
});

test('an unrelated query is counted as a new search', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pool = await freshPool();

  telemetry.recordAutocomplete(autocompleteInteraction('bitcoin'));
  telemetry.recordAutocomplete(autocompleteInteraction('ethereum')); // not a prefix: a fresh search
  t.mock.timers.tick(telemetry.AUTOCOMPLETE_SETTLE_MS + 10);
  await telemetry.flush();

  const total = pool.calls.reduce((sum, call) => sum + rowsInInsert(call), 0);
  assert.equal(total, 2, 'two distinct searches must produce two rows');
});

test('searches by different users are kept apart', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pool = await freshPool();

  telemetry.recordAutocomplete(autocompleteInteraction('bit', { userId: 'u1' }));
  telemetry.recordAutocomplete(autocompleteInteraction('bit', { userId: 'u2' }));
  assert.equal(telemetry.getWriterStats().pendingAutocomplete, 2);

  t.mock.timers.tick(telemetry.AUTOCOMPLETE_SETTLE_MS + 10);
  await telemetry.flush();

  const total = pool.calls.reduce((sum, call) => sum + rowsInInsert(call), 0);
  assert.equal(total, 2);
});

test('opening the picker without typing records nothing', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pool = await freshPool();

  telemetry.recordAutocomplete(autocompleteInteraction(''));
  t.mock.timers.tick(telemetry.AUTOCOMPLETE_SETTLE_MS + 10);
  await telemetry.flush();

  assert.equal(pool.calls.length, 0, 'an empty query is not a search');
});

test('shutdown drains a search still settling', async (t) => {
  // A restart mid-search would otherwise lose it, since the settle timer never fires.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pool = await freshPool();

  telemetry.recordAutocomplete(autocompleteInteraction('doge'));
  assert.equal(pool.calls.length, 0, 'nothing written yet');

  const written = await telemetry.shutdown();
  assert.equal(written, 1, 'the in-flight search should be flushed on shutdown');
  assert.equal(telemetry.getWriterStats().pendingAutocomplete, 0);
});

test('shutdown writes whatever is buffered', async () => {
  await freshPool();

  telemetry.recordCommand(commandInteraction('cg'));
  telemetry.recordCommand(commandInteraction('mc'));
  const written = await telemetry.shutdown();

  assert.equal(written, 2);
  assert.equal(telemetry.getWriterStats().buffered, 0);
});

test('a full buffer flushes without waiting for the timer', async () => {
  const pool = await freshPool();

  for (let i = 0; i < telemetry.MAX_BUFFER; i++) telemetry.recordCommand(commandInteraction('cg'));

  // The threshold flush is async, so give it a turn of the loop to land.
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(pool.calls.length >= 1, 'reaching MAX_BUFFER should trigger a write on its own');
  assert.ok(telemetry.getWriterStats().buffered < telemetry.MAX_BUFFER);
});

test('a malformed interaction degrades instead of throwing at the command', async () => {
  // An interaction with no user or options should never propagate an error into the command
  // handler. It degrades to an "unknown" actor rather than being dropped, so the event still
  // shows up in the totals and the gap is visible in the data instead of silently missing.
  const errors = [];
  const pool = await freshPool({}, (msg) => errors.push(msg));

  assert.doesNotThrow(() => telemetry.recordCommand({ commandName: 'x' }));
  await telemetry.flush();

  assert.deepEqual(errors, [], 'a recoverable shape is not an error worth logging');
  assert.equal(pool.calls.length, 1);
  const { values } = pool.calls[0];
  assert.equal(values[telemetry.COLUMNS.indexOf('command')], 'x');
  assert.equal(values[telemetry.COLUMNS.indexOf('user_id')], 'unknown');
});

test('a system event records without an interaction behind it', async () => {
  const pool = await freshPool();

  telemetry.recordSystemEvent('alert-fired', {
    userId: 'u9', subcommand: 'above', params: { symbol: 'BTC' }, coins: ['BTC']
  });
  await telemetry.flush();

  const { values } = pool.calls[0];
  assert.equal(values[telemetry.COLUMNS.indexOf('event_type')], 'system');
  assert.equal(values[telemetry.COLUMNS.indexOf('command')], 'alert-fired');
  assert.equal(values[telemetry.COLUMNS.indexOf('user_id')], 'u9');
});
