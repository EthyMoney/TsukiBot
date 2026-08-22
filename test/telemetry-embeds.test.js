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

    Every builder returns { embed, chart }: the chart is an SVG card when the caller asked for
    images and the data supports one, and null otherwise. Both paths are driven here.

  -------------------------------------------- */

/**
 * A pool whose responses mimic node-postgres: COUNT(*) and EXTRACT come back as strings, and
 * timestamps as Date objects. Returning plain numbers here would let type bugs pass.
 *
 * Lookup is by the first registered fragment the SQL contains, in insertion order, so the more
 * specific fragments are listed before the generic ones they would otherwise lose to.
 */
function makePool(overrides = {}) {
  const now = new Date();
  const ago = (mins) => new Date(now.getTime() - mins * 60000);

  const defaults = {
    // ---- specific fragments first ----
    'AS prior_events': [{
      events: '9001', prior_events: '8000', users: '95', prior_users: '100', guilds: '12', prior_guilds: '12',
      command_events: '7000', prior_command_events: '6000', errors: '23', prior_errors: '40',
      credits: '4820', prior_credits: '5100', p95_ms: '1200', prior_p95_ms: '900'
    }],
    'AS prior_month_same_point': [{ month_to_date: '4820', prior_month_same_point: '5300', prior_month_total: '8100' }],
    'AS day, COUNT(*) AS credits': [
      { day: ago(2880), credits: '288' }, { day: ago(1440), credits: '302' }, { day: ago(10), credits: '120' }
    ],
    'AS current_requests': [
      { coin: 'SOL', current_requests: '140', prior_requests: '40', current_users: '22', prior_users: '9', via_command: 'price' },
      { coin: 'DOGE', current_requests: '20', prior_requests: '90', current_users: '6', prior_users: '20', via_command: 'cg' },
      { coin: 'PEPE', current_requests: '12', prior_requests: '0', current_users: '5', prior_users: '0', via_command: 'price' }
    ],
    'WITH first_seen AS': [{ coin: 'WIF', first_seen: ago(400), requests: '9', users: '3', via_command: 'price' }],
    'FILTER (WHERE EXISTS': [
      { command: 'price', searches: '400', converted: '320', users: '60' },
      { command: 'cg', searches: '150', converted: '90', users: '30' }
    ],
    'WHERE NOT EXISTS': [{ command: 'price', query: 'hypercoin', searches: '6', users: '4' }],
    'WITH current_users AS': [{ active: '61', retained: '40', churned: '9', resurrected: '4' }],
    // feature inventory
    'AS max_per_user': [{ total: '42', users: '17', coins: '12', above: '30', below: '12', with_expiry: '5', expiring_7d: '2', oldest: ago(90000), newest: ago(30), max_per_user: '6' }],
    'AS alerts,': [{ symbol: 'BTC', alerts: '12', users: '9', above: '8', below: '4' }, { symbol: 'ETH', alerts: '7', users: '6', above: '5', below: '2' }],
    'AS max_holdings': [{ users: '23', holdings: '88', coins: '31', max_holdings: '14' }],
    'AS holders': [{ symbol: 'BTC', holders: '19' }, { symbol: 'SOL', holders: '11' }],
    'AS never_run': [{ jobs: '9', guilds: '6', users: '7', never_run: '1', stale: '1', oldest_run: ago(9000), latest_run: ago(12) }],
    'GROUP BY command ORDER BY jobs DESC': [{ command: 'hmap', jobs: '4', guilds: '4' }, { command: 'fg', jobs: '3', guilds: '2' }],
    'GROUP BY interval_minutes': [{ interval_minutes: 60, jobs: '5' }, { interval_minutes: 1440, jobs: '4' }],
    'CARDINALITY(coins)': [{ users: '34', entries: '210', max_size: '22', coins: '61' }],
    'GROUP BY UPPER(c)': [{ coin: 'BTC', users: '29' }, { coin: 'ETH', users: '24' }],
    'AS alerts_created': [{
      alerts_created: '15', alerts_removed: '3', alert_users: '11', alerts_fired: '9', alerts_dm: '7', alerts_channel: '1', alerts_failed: '1',
      portfolio_uses: '60', portfolio_users: '14', portfolio_sets: '22', schedules_created: '2', schedules_deleted: '1',
      posts_run: '300', posts_failed: '4', watchlist_uses: '80', watchlist_users: '20'
    }],
    'FROM tsukibot.feature_snapshots': [{ taken_at: ago(10), alerts: '42', alert_users: '17', holdings: '88', portfolio_users: '23', schedules: '9', schedule_guilds: '6', watchlists: '34', watchlist_entries: '210' }],

    // ---- the originals ----
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
    'AS hour,\n      COUNT(*)                                            AS events': [
      { weekday: 1, hour: 14, events: '300', users: '20' }, { weekday: 5, hour: 20, events: '500', users: '31' }
    ],
    'AS hour,': [{ hour: 14, events: '600', users: '40' }, { hour: 15, events: '450', users: '35' }],
    'AS weekday,\n      COUNT': [{ weekday: 1, events: '900', users: '50' }],
    'AS weekday,': [{ weekday: 1, events: '900', users: '50' }],
    'AS day,\n      COUNT(*)                           AS events': [
      { day: ago(2880), events: '400', users: '30', errors: '2' }, { day: ago(1440), events: '512', users: '35', errors: '0' }
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

/** A pool that behaves like an empty table: aggregates return one all-null row, lists nothing. */
function emptyPool() {
  return {
    async query(text) {
      if (text.includes('AS events_1h')) return { rows: [{ events_1h: '0', events_24h: '0', events_total: '0', first_event: null, tracked_minutes: null }] };
      if (text.includes('AS dau')) return { rows: [{ dau: '0', wau: '0', mau: '0', events_today: '0' }] };
      if (text.includes('AS lifetime_events')) return { rows: [{ lifetime_events: '0', tracking_since: null }] };
      if (text.includes('AS prior_events')) return { rows: [{ events: '0', prior_events: '0', users: '0', prior_users: '0', guilds: '0', prior_guilds: '0', command_events: '0', prior_command_events: '0', errors: '0', prior_errors: '0', credits: '0', prior_credits: '0', p95_ms: null, prior_p95_ms: null }] };
      if (text.includes('AS command_events')) return { rows: [{ events: '0', users: '0', guilds: '0', commands: '0', command_events: '0', autocomplete_events: '0', button_events: '0', system_events: '0', errors: '0', dm_events: '0', avg_ms: null, p50_ms: null, p95_ms: null, first_event: null }] };
      if (text.includes('pg_size_pretty')) return { rows: [{ rows: '0', total_size: '0 bytes', oldest: null }] };
      if (text.includes('AS calls_total')) return { rows: [{ calls_total: '0', calls_1h: '0', calls_24h: '0', calls_7d: '0', calls_month: '0', ratelimited: '0', first_call: null }] };
      if (text.includes('AS prior_month_same_point')) return { rows: [{ month_to_date: '0', prior_month_same_point: '0', prior_month_total: '0' }] };
      if (text.includes('WITH current_users AS')) return { rows: [{ active: '0', retained: '0', churned: '0', resurrected: '0' }] };
      if (text.includes('AS max_per_user')) return { rows: [{ total: '0', users: '0', coins: '0', above: '0', below: '0', with_expiry: '0', expiring_7d: '0', oldest: null, newest: null, max_per_user: null }] };
      if (text.includes('AS max_holdings')) return { rows: [{ users: '0', holdings: '0', coins: '0', max_holdings: null }] };
      if (text.includes('AS never_run')) return { rows: [{ jobs: '0', guilds: '0', users: '0', never_run: '0', stale: '0', oldest_run: null, latest_run: null }] };
      if (text.includes('CARDINALITY(coins)')) return { rows: [{ users: '0', entries: '0', max_size: '0', coins: '0' }] };
      if (text.includes('AS alerts_created')) return { rows: [{ alerts_created: '0', alerts_removed: '0', alert_users: '0', alerts_fired: '0', alerts_dm: '0', alerts_channel: '0', alerts_failed: '0', portfolio_uses: '0', portfolio_users: '0', portfolio_sets: '0', schedules_created: '0', schedules_deleted: '0', posts_run: '0', posts_failed: '0', watchlist_uses: '0', watchlist_users: '0' }] };
      return { rows: [] };
    }
  };
}

/** Every builder, with the arguments handleUsageCommand passes it, in text mode. */
const BUILDERS = [
  ['overview', (d, tz, o) => embeds.buildUsageOverview(d, tz, o)],
  ['commands', (d, tz, o) => embeds.buildUsageCommands(d, 15, false, o)],
  ['users', (d) => embeds.buildUsageUsers(d, 15)],
  ['servers', (d) => embeds.buildUsageGuilds(d, 15)],
  ['coins', (d, tz, o) => embeds.buildUsageCoins(d, 15, o)],
  ['activity', (d, tz, o) => embeds.buildUsageActivity(d, tz, o)],
  ['command detail', (d) => embeds.buildUsageCommandDetail('price', d)],
  ['errors', (d, tz, o) => embeds.buildUsageErrors(d, 15, o)],
  ['growth', (d, tz, o) => embeds.buildUsageGrowth(d, tz, o)],
  ['credits', (d, tz, o) => embeds.buildUsageCredits(d, tz, o)],
  ['storage', (d) => embeds.buildUsageStorage(d)],
  ['trending', (d, tz, o) => embeds.buildUsageTrending(d, 15, o)],
  ['funnel', (d, tz, o) => embeds.buildUsageFunnel(d, 15, o)],
  ['features', (d, tz, o) => embeds.buildUsageFeatures(d, 15, o)]
];

function assertWellFormed(name, json) {
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
}

for (const [name, build] of BUILDERS) {
  test(`/usage ${name} builds an embed from realistic rows`, async () => {
    reports.init({ dbPool: makePool() });
    const result = await build(30, 'UTC', {});
    assert.ok(result && result.embed, `/usage ${name} must return { embed, chart }`);
    assert.equal(result.chart, null, `/usage ${name} must not produce a chart unless images were requested`);
    assertWellFormed(name, result.embed.toJSON());
  });
}

for (const [name, build] of BUILDERS) {
  test(`/usage ${name} handles an empty result set`, async () => {
    // What a fresh deployment sees. Every builder must degrade rather than throw.
    reports.init({ dbPool: emptyPool() });
    const { embed, chart } = await build(30, 'UTC', { image: true, compare: true });
    const json = embed.toJSON();
    assert.ok(json.title, `/usage ${name} produced no title when empty`);
    assert.equal(chart, null, `/usage ${name} drew a chart of nothing`);

    const blob = JSON.stringify(json);
    for (const leak of ['undefined', 'NaN', '[object Object]', 'Infinity']) {
      assert.ok(!blob.includes(leak), `/usage ${name} leaked "${leak}" on an empty table`);
    }
  });
}

/* --------------------------------------------

    Image mode: the chart replaces the text chart fields and the embed points at the attachment
    the caller will add under that exact name.

  -------------------------------------------- */

const IMAGE_REPORTS = ['overview', 'commands', 'activity', 'errors', 'growth', 'credits', 'trending', 'funnel', 'features'];

for (const [name, build] of BUILDERS.filter(([n]) => IMAGE_REPORTS.includes(n))) {
  test(`/usage ${name} with images returns an SVG chart and names the attachment`, async () => {
    reports.init({ dbPool: makePool() });
    const { embed, chart } = await build(30, 'UTC', { image: true });
    const json = embed.toJSON();
    assertWellFormed(name, json);

    assert.ok(chart, `/usage ${name} produced no chart in image mode`);
    assert.match(chart.name, /^usage-[a-z]+\.png$/);
    assert.ok(chart.svg.startsWith('<svg'), 'chart must be an SVG document');
    assert.equal(json.image && json.image.url, `attachment://${chart.name}`,
      'the embed must reference the attachment by the chart name');

    // The unicode sparkline and block bars are what the image replaces.
    const fieldNames = (json.fields || []).map(f => f.name);
    assert.ok(!fieldNames.some(n => /^Daily volume|^Share$|^By hour|^Heatmap|^Daily active users|^Where the credits go|^Daily credits|^Risers|^Fallers|^Alerts by coin|^Watchlist favourites|^Most held coins|^Scheduled posts by type/.test(n)),
      `/usage ${name} kept a text chart field alongside the image: ${fieldNames.join(', ')}`);
  });
}

test('/usage overview in image mode asks for the full window rather than the 60 day sparkline cap', async () => {
  const seen = [];
  const pool = makePool();
  reports.init({
    dbPool: {
      async query(text, values) {
        if (text.includes('AS day,\n      COUNT(*)                           AS events')) seen.push(values[0]);
        return pool.query(text, values);
      }
    }
  });
  await embeds.buildUsageOverview(400, 'UTC', { image: false });
  await embeds.buildUsageOverview(400, 'UTC', { image: true });
  assert.deepEqual(seen, ['60 days', '400 days']);
});

test('/usage credits in image mode draws the month from its first day, not a trailing window', async () => {
  const queries = [];
  const pool = makePool();
  reports.init({ dbPool: { async query(text, values) { queries.push(text); return pool.query(text, values); } } });
  await embeds.buildUsageCredits(30, 'UTC', { image: true });
  assert.ok(queries.some(q => q.includes('DATE_TRUNC(\'month\', NOW()) AND command = \'coingecko-call\'')),
    'the burn-down must query from the month boundary');
  assert.ok(!queries.some(q => q.includes('AS day, COUNT(*) AS calls')),
    'the trailing-window daily series is not needed when the chart is drawn');
});

test('/usage credits measures against the configured budget', async () => {
  reports.init({ dbPool: makePool() });
  try {
    embeds.setMonthlyCreditBudget(500000);
    const { embed } = await embeds.buildUsageCredits(30, 'UTC');
    assert.match(embed.toJSON().description, /of \*\*500k\*\*/);
    assert.equal(embed.toJSON().color, 0x2ee08a, 'a huge budget means the projection is within quota');
  }
  finally {
    embeds.setMonthlyCreditBudget(null);
  }
  assert.equal(embeds.getMonthlyCreditBudget(), embeds.DEMO_MONTHLY_CREDITS, 'a bad value restores the demo default');
});

/* --------------------------------------------

    Compare mode: the same window one step earlier, shown as a delta.

  -------------------------------------------- */

test('/usage overview with compare adds a delta panel', async () => {
  reports.init({ dbPool: makePool() });
  const { embed } = await embeds.buildUsageOverview(30, 'UTC', { compare: true });
  const json = embed.toJSON();
  const panel = json.fields.find(f => /vs the 30 days before/.test(f.name));
  assert.ok(panel, 'compare must add a "vs the N days before" panel');
  assert.match(panel.value, /Events.*▲ \+13%/, 'events 9001 vs 8000 is +13%');
  assert.match(panel.value, /Errors.*▼ 42%/, 'errors 23 vs 40 is -42.5%, rounded half up');
  assertWellFormed('overview compare', json);
});

test('/usage commands with compare adds rank movement', async () => {
  reports.init({ dbPool: makePool() });
  const { embed } = await embeds.buildUsageCommands(30, 15, false, { compare: true });
  const json = embed.toJSON();
  const detail = json.fields.find(f => f.name === 'Detail');
  assert.match(detail.value, /Rank/);
  assert.match(detail.value, /= 0%/, 'identical prior rows give a zero delta');
  assertWellFormed('commands compare', json);
});

test('/usage coins, errors and credits accept compare without leaking', async () => {
  reports.init({ dbPool: makePool() });
  for (const [name, build] of [
    ['coins', () => embeds.buildUsageCoins(30, 15, { compare: true })],
    ['errors', () => embeds.buildUsageErrors(30, 15, { compare: true })],
    ['credits', () => embeds.buildUsageCredits(30, 'UTC', { compare: true })]
  ]) {
    const { embed } = await build();
    assertWellFormed(name + ' compare', embed.toJSON());
  }
  const { embed } = await embeds.buildUsageCredits(30, 'UTC', { compare: true });
  assert.match(embed.toJSON().description, /Last month at this point/);
});

test('/usage features reports standing state, window activity and the change since the snapshot', async () => {
  reports.init({ dbPool: makePool() });
  const { embed } = await embeds.buildUsageFeatures(30, 15);
  const json = embed.toJSON();
  assert.match(json.description, /\*\*42\*\* active price alerts/);
  assert.match(json.description, /\*\*23\*\* portfolios/);
  assert.match(json.description, /\*\*9\*\* scheduled posts in \*\*6\*\* servers/);
  assert.match(json.description, /\*\*34\*\* watchlists/);
  assert.match(json.description, /Since 30 days ago: alerts ±0/, 'the same snapshot on both sides is a zero change');
  const names = json.fields.map(f => f.name);
  for (const expected of ['Price alerts', 'Portfolios', 'Scheduled posts', 'Watchlists', 'Alerts by coin', 'Watchlist favourites', 'Most held coins', 'Scheduled posts by type']) {
    assert.ok(names.includes(expected), `missing field ${expected}: ${names.join(', ')}`);
  }
  const alertsField = json.fields.find(f => f.name === 'Price alerts').value;
  assert.match(alertsField, /Above \/ below\s+30 \/ 12/);
  assert.match(alertsField, /Fired \(30d\)\s+9/);
  assertWellFormed('features', json);
});

test('deltaText describes change compactly', () => {
  assert.equal(embeds.deltaText(110, 100), '▲ +10%');
  assert.equal(embeds.deltaText(90, 100), '▼ 10%');
  assert.equal(embeds.deltaText(100, 100), '= 0%');
  assert.equal(embeds.deltaText(5, 0), '▲ new');
  assert.equal(embeds.deltaText(0, 0), '–');
  assert.equal(embeds.deltaText('12', '10'), '▲ +20%');
});

test('rankMomentum separates risers from fallers and floors the noise', () => {
  const { risers, fallers } = embeds.rankMomentum([
    { coin: 'SOL', current_requests: '140', prior_requests: '40' },
    { coin: 'DOGE', current_requests: '20', prior_requests: '90' },
    { coin: 'TINY', current_requests: '6', prior_requests: '2' },
    { coin: 'NEW', current_requests: '12', prior_requests: '0' },
    { coin: 'FLAT', current_requests: '50', prior_requests: '50' }
  ]);
  assert.deepEqual(risers.map(r => r.coin), ['NEW', 'SOL'], 'a brand-new coin ranks as the biggest riser, the 2-to-6 one is noise');
  assert.deepEqual(fallers.map(r => r.coin), ['DOGE']);
});

test('projectMonthEnd extrapolates the 24h rate over the UTC days left', () => {
  const totals = { calls_month: '3000', calls_24h: '100' };
  const tenth = new Date(Date.UTC(2026, 7, 10, 12));
  const projection = embeds.projectMonthEnd(totals, tenth);
  assert.equal(projection.daysInMonth, 31);
  assert.equal(projection.daysRemaining, 21);
  assert.equal(projection.projected, 3000 + 21 * 100);
});

/* --------------------------------------------

    The dispatcher: every report reachable by name with a normalized state.

  -------------------------------------------- */

test('buildUsageReport resolves every report name and normalizes the state', async () => {
  reports.init({ dbPool: makePool() });
  for (const name of embeds.REPORT_NAMES) {
    const { embed } = await embeds.buildUsageReport(name, { days: '99999', limit: 0, timezone: 'not a zone', name: '/portfolio show' });
    const json = embed.toJSON();
    assert.ok(json.title, `report ${name} built nothing`);
    assert.match(json.footer.text, /Last 3650 days/, `report ${name} did not clamp the window`);
  }
  await assert.rejects(() => embeds.buildUsageReport('nope', {}), /Unknown usage report/);
});

test('buildUsageReport hands the command detail its bare command name', async () => {
  const seen = [];
  const pool = makePool();
  reports.init({ dbPool: { async query(text, values) { if (text.includes('COALESCE(subcommand')) seen.push(values[0]); return pool.query(text, values); } } });
  await embeds.buildUsageReport('command', { days: 30, name: 'Portfolio show' });
  assert.deepEqual(seen, ['portfolio']);
});

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
