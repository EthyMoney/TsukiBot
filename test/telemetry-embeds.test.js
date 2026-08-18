'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const embeds = require('../src/telemetry-embeds');
const reports = require('../src/telemetry-reports');
const render = require('../src/telemetry-render');

/* --------------------------------------------

    The /usage report embeds, built end to end.

    This file exists because of a bug that reached production: renderTable calls every column
    formatter as format(value, row), and formatRelative's second parameter is its reference time,
    so the database row landed in `now` and threw "now.getTime is not a function". It took out
    /usage users, /usage servers and /usage errors.

    The unit tests missed it because they exercised formatRelative and renderTable separately and
    never the wiring between them, and because the builders themselves lived in main.js where
    nothing could reach them without starting the bot.

    So these tests drive the real builder functions with a fake pool that returns realistic rows -
    strings for bigints and numerics, real Dates for timestamps, exactly as node-postgres does.

  -------------------------------------------- */

/**
 * A pool whose responses mimic node-postgres: COUNT(*) and EXTRACT come back as strings, and
 * timestamps as Date objects. Returning plain numbers here would let type bugs pass.
 */
function makePool(overrides = {}) {
  const now = new Date();
  const ago = (mins) => new Date(now.getTime() - mins * 60000);

  const defaults = {
    // matched by a distinctive fragment of each query
    'AS events_1h': [{
      events_1h: '12', events_24h: '480', events_total: '9001',
      first_event: ago(100000), tracked_minutes: '100000.5'
    }],
    'AS dau': [{ dau: '12', wau: '40', mau: '95', events_today: '480' }],
    'AS lifetime_events': [{ lifetime_events: '9001', tracking_since: ago(100000) }],
    'GROUP BY day ORDER BY events DESC': [{ day: ago(1440), events: '512' }],
    'AS command_events': [{
      events: '9001', users: '95', guilds: '12', commands: '31',
      command_events: '7000', autocomplete_events: '1800', button_events: '200', system_events: '1',
      errors: '23', dm_events: '140', avg_ms: '412', p50_ms: '300', p95_ms: '1200',
      first_event: ago(100000)
    }],
    'COALESCE(\' \' || subcommand': [
      { name: 'price', uses: '3200', users: '80', guilds: '11', avg_ms: '350', errors: '4', last_used: ago(3) },
      { name: 'portfolio show', uses: '900', users: '40', guilds: '9', avg_ms: '820', errors: '0', last_used: ago(120) }
    ],
    'AS distinct_commands': [
      { user_id: '1', username: 'ethy', events: '820', distinct_commands: '14', active_days: '26', favorite_command: 'price', first_seen: ago(90000), last_seen: ago(4) },
      { user_id: '2', username: 'someone', events: '310', distinct_commands: '6', active_days: '9', favorite_command: 'cg', first_seen: ago(40000), last_seen: ago(900) }
    ],
    'MAX(guild_name)': [
      { guild_id: '10', guild_name: 'Crypto Server', events: '4100', users: '61', favorite_command: 'price', last_used: ago(7) }
    ],
    'UNNEST(coins)': [
      { coin: 'BTC', requests: '2600', users: '77', via_command: 'price' },
      { coin: 'ETH', requests: '1900', users: '70', via_command: 'cg' }
    ],
    'AS hour,': [{ hour: 14, events: '600', users: '40' }, { hour: 15, events: '450', users: '35' }],
    'AS weekday,\n      COUNT': [{ weekday: 1, events: '900', users: '50' }],
    'AS weekday,': [{ weekday: 1, events: '900', users: '50' }],
    'AS hour,\n      COUNT(*)                                            AS events': [
      { weekday: 1, hour: 14, events: '300' }
    ],
    'AS day,\n      COUNT(*)                           AS events': [
      { day: ago(2880), events: '400', users: '30' }, { day: ago(1440), events: '512', users: '35' }
    ],
    'jsonb_each_text(params) AS kv': [{ option: 'coin', value: 'btc', uses: '900', users: '60' }],
    'WITH invocations AS': [{ option: 'coin', supplied: '900', total_invocations: '1000' }],
    'COALESCE(subcommand, \'(none)\')': [{ subcommand: 'show', uses: '700', users: '38' }],
    'AS occurrences': [
      { command: 'hmap', error_kind: '50013', occurrences: '11', users_affected: '4', last_seen: ago(30) }
    ],
    'AS samples': [{ command: 'hmap', samples: '120', avg_ms: '4200', p95_ms: '9000', max_ms: '15000' }],
    'WITH firsts AS': [
      { day: ago(2880), active_users: '30', new_users: '5', returning_users: '25' },
      { day: ago(1440), active_users: '35', new_users: '3', returning_users: '32' }
    ],
    'WITH per_user AS': [{ bucket: '1 day (one-off)', users: '40', sort_key: 1 }],
    'pg_size_pretty': [{ rows: '9001', total_size: '3128 kB', oldest: ago(100000) }],
    'AS endpoint': [
      { endpoint: '/coins/markets', calls: '192', ratelimited: '0', errors: '0', avg_ms: '640', last_call: ago(2) },
      { endpoint: '/simple/price', calls: '96', ratelimited: '2', errors: '0', avg_ms: '210', last_call: ago(9) },
      { endpoint: '/global', calls: '14', ratelimited: '0', errors: '1', avg_ms: '180', last_call: ago(30) }
    ],
    'AS calls_total': [{
      calls_total: '4820', calls_1h: '9', calls_24h: '302', calls_7d: '2100',
      calls_month: '4820', ratelimited: '2', first_call: ago(40000)
    }],
    'AS day, COUNT(*) AS calls': [
      { day: ago(2880), calls: '288' }, { day: ago(1440), calls: '302' }
    ],
    'ORDER BY occurred_at DESC': [
      { occurred_at: ago(1), event_type: 'command', command: 'price', subcommand: null, user_id: '1', username: 'ethy', guild_name: 'Crypto Server', params: { coin: 'btc' }, coins: ['BTC'], outcome: 'ok', error_kind: null, duration_ms: 320 }
    ]
  };

  const table = { ...defaults, ...overrides };

  return {
    async query(text) {
      for (const [fragment, rows] of Object.entries(table)) {
        if (text.includes(fragment)) return { rows, rowCount: rows.length };
      }
      throw new Error('no fake result registered for query:\n' + text.trim().slice(0, 200));
    }
  };
}

/** Every builder, with the arguments handleUsageCommand passes it. */
const BUILDERS = [
  ['overview', (d, tz) => embeds.buildUsageOverview(d, tz)],
  ['commands', (d) => embeds.buildUsageCommands(d, 15, false)],
  ['users', (d) => embeds.buildUsageUsers(d, 15)],
  ['servers', (d) => embeds.buildUsageGuilds(d, 15)],
  ['coins', (d) => embeds.buildUsageCoins(d, 15)],
  ['activity', (d, tz) => embeds.buildUsageActivity(d, tz)],
  ['command detail', (d) => embeds.buildUsageCommandDetail('price', d)],
  ['errors', (d) => embeds.buildUsageErrors(d, 15)],
  ['growth', (d, tz) => embeds.buildUsageGrowth(d, tz)],
  ['credits', (d, tz) => embeds.buildUsageCredits(d, tz)]
];

for (const [name, build] of BUILDERS) {
  test(`/usage ${name} builds an embed from realistic rows`, async () => {
    reports.init({ dbPool: makePool() });
    const embed = await build(30, 'UTC');
    const json = embed.toJSON();

    assert.ok(json.title, `/usage ${name} produced no title`);

    // Discord rejects the whole message if any field value exceeds 1024 or the description 4096.
    for (const field of json.fields || []) {
      assert.ok(field.value.length <= 1024,
        `/usage ${name}: field "${field.name}" is ${field.value.length} chars, over the 1024 limit`);
      assert.ok(field.name.length <= 256, `/usage ${name}: field name too long`);
    }
    if (json.description) {
      assert.ok(json.description.length <= 4096,
        `/usage ${name}: description is ${json.description.length} chars, over the 4096 limit`);
    }

    // A formatter that throws is one bug; a formatter that silently stringifies the row is the
    // other. Both show up here.
    const blob = JSON.stringify(json);
    for (const leak of ['undefined', 'NaN', '[object Object]', 'Infinity']) {
      assert.ok(!blob.includes(leak), `/usage ${name} leaked "${leak}" into its output`);
    }
  });
}

for (const [name, build] of BUILDERS) {
  test(`/usage ${name} handles an empty result set`, async () => {
    // What a fresh deployment sees. Every builder must degrade rather than throw.
    const empty = new Proxy({}, { get: () => undefined });
    reports.init({
      dbPool: {
        async query(text) {
          // The aggregate queries still return one all-null row when the table is empty.
          if (text.includes('AS events_1h')) return { rows: [{ events_1h: '0', events_24h: '0', events_total: '0', first_event: null, tracked_minutes: null }] };
          if (text.includes('AS dau')) return { rows: [{ dau: '0', wau: '0', mau: '0', events_today: '0' }] };
          if (text.includes('AS lifetime_events')) return { rows: [{ lifetime_events: '0', tracking_since: null }] };
          if (text.includes('AS command_events')) return { rows: [{ events: '0', users: '0', guilds: '0', commands: '0', command_events: '0', autocomplete_events: '0', button_events: '0', system_events: '0', errors: '0', dm_events: '0', avg_ms: null, p50_ms: null, p95_ms: null, first_event: null }] };
          if (text.includes('pg_size_pretty')) return { rows: [{ rows: '0', total_size: '0 bytes', oldest: null }] };
          if (text.includes('AS calls_total')) return { rows: [{ calls_total: '0', calls_1h: '0', calls_24h: '0', calls_7d: '0', calls_month: '0', ratelimited: '0', first_call: null }] };
          return { rows: [] };
        }
      }
    });
    void empty;

    const embed = await build(30, 'UTC');
    const json = embed.toJSON();
    assert.ok(json.title, `/usage ${name} produced no title when empty`);

    const blob = JSON.stringify(json);
    for (const leak of ['undefined', 'NaN', '[object Object]', 'Infinity']) {
      assert.ok(!blob.includes(leak), `/usage ${name} leaked "${leak}" on an empty table`);
    }
  });
}

/* --------------------------------------------

    The formatter contract itself.

    renderTable calls format(value, row). Any helper whose second parameter means something else
    will misread that row, which is exactly how the shipped bug worked. This checks every formatter
    main.js and telemetry-embeds.js actually use, so a new one cannot reintroduce it.

  -------------------------------------------- */

const embedSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'telemetry-embeds.js'), 'utf8');

test('every render helper used as a column formatter tolerates being handed the row', () => {
  const used = [...embedSource.matchAll(/format:\s*render\.(\w+)/g)].map(m => m[1]);
  const unique = [...new Set(used)];
  assert.ok(unique.length >= 3, `only found ${unique.length} formatters, the pattern is probably stale`);

  const row = { v: new Date(), other: 'x', count: 5 };
  for (const name of unique) {
    const formatter = render[name];
    assert.equal(typeof formatter, 'function', `render.${name} is not a function`);

    for (const value of [new Date(), '2026-08-17T20:00:00Z', 1234, '5678', 0, null, undefined]) {
      assert.doesNotThrow(
        () => formatter(value, row),
        `render.${name}(${JSON.stringify(value)}, row) threw - renderTable always passes the row as ` +
        'the second argument, so a formatter must not treat it as a meaningful parameter');
    }
  }
});

test('formatRelative ignores a non-Date second argument instead of throwing', () => {
  // The exact production failure, pinned.
  const row = { user_id: '1', username: 'ethy', last_seen: new Date() };
  assert.doesNotThrow(() => render.formatRelative(new Date(), row));
  assert.match(render.formatRelative(new Date(Date.now() - 3600000), row), /1h ago/);
});

test('formatRelative still honors a real Date as its reference time', () => {
  // The test seam must keep working, or the deterministic tests elsewhere become meaningless.
  const now = new Date('2026-08-17T12:00:00Z');
  assert.equal(render.formatRelative(new Date('2026-08-17T09:00:00Z'), now), '3h ago');
});

test('renderTable with formatRelative produces a relative stamp, not a crash', () => {
  // The integration the original tests never covered.
  const rows = [{ username: 'ethy', last_seen: new Date(Date.now() - 7200000) }];
  const out = render.renderTable(rows, [
    { key: 'username', label: 'User', width: 12 },
    { key: 'last_seen', label: 'Last', width: 9, format: render.formatRelative }
  ]);
  assert.match(out, /2h ago/);
  assert.ok(!out.includes('[object Object]'));
});
