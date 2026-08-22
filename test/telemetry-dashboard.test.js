'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  createDashboard, DEFAULT_PORT, DEFAULT_TOKEN_TTL_MS, parseCookies, clampInt, commandNameFromParam, localYmd
} = require('../src/telemetry-dashboard');

/* --------------------------------------------

    The telemetry dashboard, driven over real HTTP.

    The app is started on port 0 against a fake reports module whose functions return
    node-postgres-shaped rows (strings for counts, Date objects for timestamps) and record their
    arguments, so every test can assert both what the API returns and what it asked the query
    layer for. Each test stops its server in a finally block; nothing may outlive the file.

  -------------------------------------------- */

function makeReports() {
  const calls = [];
  const now = new Date();
  const ago = (mins) => new Date(now.getTime() - mins * 60000);
  const day = (daysAgo) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
    return d; // local midnight, exactly as pg returns a DATE column
  };
  const rec = (name, result) => (...args) => {
    calls.push({ name, args });
    return Promise.resolve(typeof result === 'function' ? result(...args) : result);
  };

  return {
    calls,
    callsTo(name) {
      return calls.filter((c) => c.name === name);
    },
    normalizeTimezone(tz) {
      calls.push({ name: 'normalizeTimezone', args: [tz] });
      if (!tz) return 'UTC';
      const cleaned = String(tz).trim();
      return /^[A-Za-z0-9_+\-/]{1,64}$/.test(cleaned) ? cleaned : 'UTC';
    },
    getOverview: rec('getOverview', {
      events: '9001', users: '95', guilds: '12', commands: '31', command_events: '7000',
      autocomplete_events: '1800', button_events: '200', system_events: '1', errors: '23', dm_events: '140',
      avg_ms: '412', p50_ms: '300', p95_ms: '1200', first_event: ago(100000),
      dau: '12', wau: '40', mau: '95', events_today: '480',
      lifetimeEvents: '9001', trackingSince: ago(100000), busiest: { day: day(1), events: '512' }
    }),
    getOverviewComparison: rec('getOverviewComparison', {
      events: '9001', prior_events: '8000', users: '95', prior_users: '90', guilds: '12', prior_guilds: '11',
      command_events: '7000', prior_command_events: '6500', errors: '23', prior_errors: '30',
      credits: '3000', prior_credits: '2800', p95_ms: '1200', prior_p95_ms: '1100'
    }),
    getStorageStats: rec('getStorageStats', { rows: '9001', total_size: '12 MB', oldest: ago(100000) }),
    getDailySeries: rec('getDailySeries', [
      { day: day(2), events: '400', users: '30', errors: '2' },
      { day: day(1), events: '512', users: '35', errors: '0' }
    ]),
    getLatencyByDay: rec('getLatencyByDay', [{ day: day(1), samples: '300', p50_ms: '280', p95_ms: '1100' }]),
    getTopCommands: rec('getTopCommands', [
      { name: 'price', uses: '3200', users: '80', guilds: '11', avg_ms: '350', errors: '4', last_used: ago(3) },
      { name: 'portfolio show', uses: '900', users: '40', guilds: '9', avg_ms: '820', errors: '0', last_used: ago(120) }
    ]),
    getSubcommandSplit: rec('getSubcommandSplit', [{ subcommand: 'show', uses: '700', users: '38' }]),
    getOptionCoverage: rec('getOptionCoverage', [{ option: 'coin', supplied: '900', total_invocations: '1000' }]),
    getParameterUsage: rec('getParameterUsage', [{ option: 'coin', value: 'btc', uses: '900', users: '60' }]),
    getTopUsers: rec('getTopUsers', [{
      user_id: '1', username: 'ethy', events: '820', distinct_commands: '14', active_days: '26',
      favorite_command: 'price', first_seen: ago(90000), last_seen: ago(4)
    }]),
    getTopGuilds: rec('getTopGuilds', [{ guild_id: '10', guild_name: 'Crypto Server', events: '4100', users: '61', favorite_command: 'price', last_used: ago(7) }]),
    getTopCoins: rec('getTopCoins', [{ coin: 'BTC', requests: '2600', users: '77', via_command: 'price' }]),
    getCoinMomentum: rec('getCoinMomentum', [{ coin: 'BTC', current_requests: '120', prior_requests: '80', current_users: '20', prior_users: '15', via_command: 'price' }]),
    getNewCoins: rec('getNewCoins', [{ coin: 'NEW', first_seen: ago(60), requests: '4', users: '2', via_command: 'cg' }]),
    getHourlyActivity: rec('getHourlyActivity', [{ hour: 14, events: '600', users: '40' }]),
    getWeekdayActivity: rec('getWeekdayActivity', [{ weekday: 1, events: '900', users: '50' }]),
    getActivityGrid: rec('getActivityGrid', [{ weekday: 1, hour: 14, events: '300', users: '22' }]),
    getErrors: rec('getErrors', [{ command: 'price', error_kind: 'cg-not-found', occurrences: '12', users_affected: '5', last_seen: ago(30) }]),
    getSlowestCommands: rec('getSlowestCommands', [{ command: 'portfolio', samples: '50', avg_ms: '1300', p95_ms: '2400', max_ms: '5000' }]),
    getGrowth: rec('getGrowth', [{ day: day(1), active_users: '30', new_users: '4', returning_users: '26' }]),
    getRetention: rec('getRetention', [{ bucket: '1 day (one-off)', users: '40', sort_key: '1' }]),
    getChurn: rec('getChurn', { active: '95', retained: '60', churned: '20', resurrected: '5' }),
    getApiCreditsByEndpoint: rec('getApiCreditsByEndpoint', [{ endpoint: 'simple/price', calls: '2100', ratelimited: '3', errors: '1', avg_ms: '240', last_call: ago(2) }]),
    getApiCreditTotals: rec('getApiCreditTotals', { calls_total: '50000', calls_1h: '40', calls_24h: '900', calls_7d: '6000', calls_month: '3000', ratelimited: '12', first_call: ago(200000) }),
    getApiCreditsMonthToDate: rec('getApiCreditsMonthToDate', [{ day: day(1), credits: '400' }]),
    getApiCreditsByDayAndEndpoint: rec('getApiCreditsByDayAndEndpoint', [{ day: day(1), endpoint: 'simple/price', calls: '300', ratelimited: '0' }]),
    getApiCreditsMonthComparison: rec('getApiCreditsMonthComparison', { month_to_date: '3000', prior_month_same_point: '2500', prior_month_total: '7800' }),
    getSearchFunnel: rec('getSearchFunnel', [{ command: 'price', searches: '500', converted: '320', users: '60' }]),
    getAbandonedSearches: rec('getAbandonedSearches', [{ command: 'price', query: 'xyzcoin', searches: '9', users: '3' }]),
    getRecentEventsFiltered: rec('getRecentEventsFiltered', [{
      event_id: 1, occurred_at: ago(1), event_type: 'command', command: 'price', subcommand: null, user_id: '1',
      username: 'ethy', guild_id: '10', guild_name: 'Crypto Server', channel_id: '5', params: { coin: 'btc' },
      coins: ['BTC'], outcome: 'ok', error_kind: null, duration_ms: '320'
    }]),
    // Feature inventory: COUNT(*) comes back as strings, MIN/MAX timestamps as Dates.
    getFeatureInventory: rec('getFeatureInventory', {
      alerts: { total: '42', users: '17', coins: '9', above: '25', below: '17', with_expiry: '10', expiring_7d: '3', oldest: ago(80000), newest: ago(30), max_per_user: '8' },
      alertCoins: [
        { symbol: 'BTC', alerts: '20', users: '12', above: '12', below: '8' },
        { symbol: 'ETH', alerts: '10', users: '7', above: '6', below: '4' }
      ],
      portfolios: { users: '33', holdings: '140', coins: '48', max_holdings: '22' },
      portfolioCoins: [{ symbol: 'BTC', holders: '30' }, { symbol: 'ETH', holders: '25' }],
      schedules: { jobs: '6', guilds: '4', users: '5', never_run: '1', stale: '1', oldest_run: ago(50000), latest_run: ago(12) },
      scheduleCommands: [{ command: 'price', jobs: '4', guilds: '3' }, { command: 'chart', jobs: '2', guilds: '2' }],
      scheduleIntervals: [{ interval_minutes: 30, jobs: '1' }, { interval_minutes: 60, jobs: '3' }, { interval_minutes: 1440, jobs: '2' }],
      watchlists: { users: '28', entries: '190', max_size: '25', coins: '70' },
      watchlistCoins: [{ coin: 'BTC', users: '26' }, { coin: 'SOL', users: '15' }]
    }),
    getFeatureActivity: rec('getFeatureActivity', {
      alerts_created: '9', alerts_removed: '3', alert_users: '8', alerts_fired: '14', alerts_dm: '10', alerts_channel: '3', alerts_failed: '1',
      portfolio_uses: '60', portfolio_users: '20', portfolio_sets: '12', schedules_created: '2', schedules_deleted: '1',
      posts_run: '300', posts_failed: '4', watchlist_uses: '45', watchlist_users: '14'
    }),
    // feature_snapshots columns are INTEGER, which node-postgres parses to numbers.
    getFeatureSnapshots: rec('getFeatureSnapshots', [
      { day: day(2), taken_at: ago(2880), alerts: 40, alert_users: 16, holdings: 130, portfolio_users: 31, schedules: 6, schedule_guilds: 4, watchlists: 27, watchlist_entries: 180 },
      { day: day(1), taken_at: ago(1440), alerts: 41, alert_users: 17, holdings: 136, portfolio_users: 32, schedules: 6, schedule_guilds: 4, watchlists: 28, watchlist_entries: 188 },
      { day: day(0), taken_at: ago(30), alerts: 42, alert_users: 17, holdings: 140, portfolio_users: 33, schedules: 6, schedule_guilds: 4, watchlists: 28, watchlist_entries: 190 }
    ])
  };
}

function makeTelemetry() {
  const t = {
    flushCalls: 0,
    flushed: false,
    async flush() {
      t.flushCalls++;
      await new Promise((resolve) => setTimeout(resolve, 3));
      t.flushed = true;
    },
    getWriterStats() {
      return { buffered: 3, pendingAutocomplete: 1, dropped: 0 };
    }
  };
  return t;
}

/** Starts a dashboard on a free port and runs fn; always stops the server. */
async function withDashboard(fn, overrides = {}) {
  const reports = overrides.reports || makeReports();
  const telemetry = 'telemetry' in overrides ? overrides.telemetry : makeTelemetry();
  const errors = [];
  const dash = createDashboard({
    reports,
    telemetry,
    getBudget: () => 12345,
    registeredCommands: ['price', 'cg', 'portfolio'],
    log: () => { },
    logError: (msg) => errors.push(msg)
  });
  await dash.start({ port: 0 });
  const { host, port } = dash.address();
  const base = `http://${host}:${port}`;
  try {
    await fn({ dash, reports, telemetry, errors, base });
  } finally {
    await dash.stop();
  }
}

/** Plain node:http GET with a fresh connection per request, so nothing is kept alive. */
function request(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let json;
        try {
          json = JSON.parse(body);
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });
    req.on('error', reject);
  });
}

function signedIn(dash) {
  const { token } = dash.mintToken();
  return { cookie: `tsuki_dash=${token}` };
}

/* --------------------------------------------------------------------------
 *  Pure helpers
 * -------------------------------------------------------------------------- */

test('exports the documented constants', () => {
  assert.equal(DEFAULT_PORT, 8090);
  assert.equal(DEFAULT_TOKEN_TTL_MS, 12 * 60 * 60 * 1000);
});

test('parseCookies handles the normal, empty and malformed cases', () => {
  assert.deepEqual(parseCookies('a=1; tsuki_dash=abc; b="quoted"'), { a: '1', tsuki_dash: 'abc', b: 'quoted' });
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies('garbage; =novalue; ok=%E2%9C%93; bad=%E0%A4%A'), { ok: '✓', bad: '%E0%A4%A' });
});

test('clampInt clamps, falls back on junk, and accepts the first of a repeated parameter', () => {
  assert.equal(clampInt('99999', 1, 3650, 30), 3650);
  assert.equal(clampInt('0', 1, 3650, 30), 1);
  assert.equal(clampInt('abc', 1, 3650, 30), 30);
  assert.equal(clampInt(undefined, 1, 3650, 30), 30);
  assert.equal(clampInt('', 1, 3650, 30), 30);
  assert.equal(clampInt(['7', '9'], 1, 3650, 30), 7);
  assert.equal(clampInt('12.9', 1, 3650, 30), 12);
});

test('commandNameFromParam strips a leading slash, lowercases and keeps only the command', () => {
  assert.equal(commandNameFromParam('portfolio show'), 'portfolio');
  assert.equal(commandNameFromParam('/PRICE'), 'price');
  assert.equal(commandNameFromParam('  cg  '), 'cg');
  assert.equal(commandNameFromParam('/'), '');
  assert.equal(commandNameFromParam(undefined), '');
});

test('localYmd uses the local calendar fields of a Date', () => {
  assert.equal(localYmd(new Date(2026, 0, 5)), '2026-01-05');
});

/* --------------------------------------------------------------------------
 *  Auth
 * -------------------------------------------------------------------------- */

test('/healthz is open without a token', () => withDashboard(async ({ base }) => {
  const res = await request(`${base}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { ok: true });
}));

test('/dash without a token is a 401 HTML page pointing at /usage dashboard', () => withDashboard(async ({ base }) => {
  const res = await request(`${base}/dash`);
  assert.equal(res.status, 401);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.body, /owner-only/);
  assert.match(res.body, /\/usage dashboard/);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
}));

test('/api/usage/overview without a token is a 401 JSON error', () => withDashboard(async ({ base, reports }) => {
  const res = await request(`${base}/api/usage/overview`);
  assert.equal(res.status, 401);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.deepEqual(res.json, { error: 'unauthorized' });
  assert.equal(reports.callsTo('getOverview').length, 0, 'no report ran for an unauthenticated request');
}));

test('/dash?token=<valid> sets an HttpOnly cookie and redirects to /dash without the token', () => withDashboard(async ({ base, dash }) => {
  const { token, expiresAt } = dash.mintToken();
  assert.match(token, /^[0-9a-f]{32}$/);
  assert.ok(expiresAt > Date.now() + DEFAULT_TOKEN_TTL_MS - 5000);
  assert.equal(dash.tokenCount(), 1);

  const res = await request(`${base}/dash?token=${token}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/dash');
  const cookies = res.headers['set-cookie'];
  assert.ok(Array.isArray(cookies) && cookies.length === 1, 'exactly one Set-Cookie');
  const cookie = cookies[0];
  assert.match(cookie, new RegExp(`^tsuki_dash=${token};`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=\d+/);
  assert.equal(res.headers['cache-control'], 'no-store');
}));

test('the redirect keeps other query parameters and sends / to /dash', () => withDashboard(async ({ base, dash }) => {
  const { token } = dash.mintToken();
  const res = await request(`${base}/dash?days=7&token=${token}&tz=UTC`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/dash?days=7&tz=UTC');

  const root = await request(`${base}/?token=${token}`);
  assert.equal(root.status, 302);
  assert.equal(root.headers.location, '/dash');

  const rootWithCookie = await request(`${base}/`, { cookie: `tsuki_dash=${token}` });
  assert.equal(rootWithCookie.status, 302);
  assert.equal(rootWithCookie.headers.location, '/dash');
}));

test('the cookie grants /api/usage/overview with the expected shape and no-store', () => withDashboard(async ({ base, dash }) => {
  const res = await request(`${base}/api/usage/overview?days=30`, signedIn(dash));
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.match(res.headers['content-type'], /application\/json/);
  assert.deepEqual(Object.keys(res.json).sort(), ['comparison', 'overview', 'storage', 'writer']);
  assert.equal(res.json.overview.events, '9001', 'counts pass through as the strings pg produced');
  assert.deepEqual(res.json.writer, { buffered: 3, pendingAutocomplete: 1, dropped: 0 });
  assert.equal(res.json.storage.total_size, '12 MB');
  assert.match(res.json.overview.busiest.day, /^\d{4}-\d{2}-\d{2}$/, 'DATE columns become plain day strings');
  assert.equal(res.headers['x-frame-options'], 'DENY');
}));

test('invalid and expired tokens are rejected, via query and via cookie', () => withDashboard(async ({ base, dash }) => {
  const bogus = 'f'.repeat(32);
  assert.equal((await request(`${base}/dash?token=${bogus}`)).status, 401);
  assert.equal((await request(`${base}/api/usage/overview`, { cookie: `tsuki_dash=${bogus}` })).status, 401);
  assert.equal((await request(`${base}/api/usage/overview`, { cookie: 'tsuki_dash=not-hex-at-all' })).status, 401);

  const { token } = dash.mintToken(1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal((await request(`${base}/dash?token=${token}`)).status, 401);
  assert.equal((await request(`${base}/api/usage/overview`, { cookie: `tsuki_dash=${token}` })).status, 401);
  assert.equal(dash.tokenCount(), 0, 'expired tokens are purged');
}));

test('revokeTokens() signs every browser out', () => withDashboard(async ({ base, dash }) => {
  const headers = signedIn(dash);
  assert.equal((await request(`${base}/api/usage/meta`, headers)).status, 200);
  dash.revokeTokens();
  assert.equal(dash.tokenCount(), 0);
  assert.equal((await request(`${base}/api/usage/meta`, headers)).status, 401);
  assert.equal((await request(`${base}/dash`, headers)).status, 401);
}));

test('a valid ?token= still signs in when an invalid cookie is present, and an invalid ?token= does not break a valid cookie', () => withDashboard(async ({ base, dash }) => {
  const { token } = dash.mintToken();
  const res = await request(`${base}/dash?token=${token}`, { cookie: 'tsuki_dash=' + 'a'.repeat(32) });
  assert.equal(res.status, 302);
  const ok = await request(`${base}/api/usage/meta?token=${'b'.repeat(32)}`, { cookie: `tsuki_dash=${token}` });
  assert.equal(ok.status, 200);
}));

/* --------------------------------------------------------------------------
 *  Parameter handling
 * -------------------------------------------------------------------------- */

test('days is clamped to 1..3650 and defaults to 30', () => withDashboard(async ({ base, dash, reports }) => {
  const headers = signedIn(dash);
  assert.equal((await request(`${base}/api/usage/overview?days=99999`, headers)).status, 200);
  assert.equal((await request(`${base}/api/usage/overview?days=abc`, headers)).status, 200);
  assert.equal((await request(`${base}/api/usage/overview?days=0`, headers)).status, 200);
  assert.equal((await request(`${base}/api/usage/overview`, headers)).status, 200);
  const days = reports.callsTo('getOverview').map((c) => c.args[0]);
  assert.deepEqual(days, [3650, 30, 1, 30]);
  assert.deepEqual(reports.callsTo('getOverviewComparison').map((c) => c.args[0]), [3650, 30, 1, 30]);
}));

test('limit is clamped to 1..500, defaults to 50, and searches=1 includes autocomplete', () => withDashboard(async ({ base, dash, reports }) => {
  const headers = signedIn(dash);
  assert.equal((await request(`${base}/api/usage/commands?days=7&limit=99999`, headers)).status, 200);
  assert.equal((await request(`${base}/api/usage/commands?days=7&limit=0&searches=1`, headers)).status, 200);
  assert.equal((await request(`${base}/api/usage/commands?days=7&limit=abc&searches=0`, headers)).status, 200);
  const res = await request(`${base}/api/usage/commands?days=7`, headers);
  assert.equal(res.status, 200);
  assert.equal(res.json.commands.length, 2);
  assert.deepEqual(reports.callsTo('getTopCommands').map((c) => c.args), [
    [7, 500, false],
    [7, 1, true],
    [7, 50, false],
    [7, 50, false]
  ]);
}));

test('tz is normalized by the reports module and passed through', () => withDashboard(async ({ base, dash, reports }) => {
  const headers = signedIn(dash);
  assert.equal((await request(`${base}/api/usage/daily?days=14&tz=America/New_York`, headers)).status, 200);
  assert.equal((await request(`${base}/api/usage/daily?days=14&tz=${encodeURIComponent('not a zone!')}`, headers)).status, 200);
  assert.equal((await request(`${base}/api/usage/daily?days=14`, headers)).status, 200);
  assert.deepEqual(reports.callsTo('getDailySeries').map((c) => c.args), [
    [14, 'America/New_York'], [14, 'UTC'], [14, 'UTC']
  ]);
  assert.deepEqual(reports.callsTo('getLatencyByDay').map((c) => c.args), [
    [14, 'America/New_York'], [14, 'UTC'], [14, 'UTC']
  ]);
  assert.ok(reports.callsTo('normalizeTimezone').length >= 3);
}));

test('/api/usage/events passes every filter through under the right keys', () => withDashboard(async ({ base, dash, reports }) => {
  const qs = 'days=9&limit=25&command=price&user=111&guild=222&coin=btc&outcome=error&error_kind=cg-not-found&type=command';
  const res = await request(`${base}/api/usage/events?${qs}`, signedIn(dash));
  assert.equal(res.status, 200);
  assert.equal(res.json.events.length, 1);
  assert.equal(res.json.events[0].params.coin, 'btc');
  assert.deepEqual(reports.callsTo('getRecentEventsFiltered')[0].args[0], {
    days: 9, limit: 25, command: 'price', userId: '111', guildId: '222', coin: 'btc',
    outcome: 'error', errorKind: 'cg-not-found', eventType: 'command'
  });

  const bare = await request(`${base}/api/usage/events`, signedIn(dash));
  assert.equal(bare.status, 200);
  const args = reports.callsTo('getRecentEventsFiltered')[1].args[0];
  assert.equal(args.days, 30);
  assert.equal(args.limit, 50);
  for (const key of ['command', 'userId', 'guildId', 'coin', 'outcome', 'errorKind', 'eventType']) {
    assert.equal(args[key], undefined, `${key} is absent when not supplied`);
  }
}));

test('/api/usage/command/portfolio%20show queries the bare command name', () => withDashboard(async ({ base, dash, reports }) => {
  const headers = signedIn(dash);
  const res = await request(`${base}/api/usage/command/portfolio%20show?days=30&limit=20`, headers);
  assert.equal(res.status, 200);
  assert.equal(res.json.name, 'portfolio');
  assert.deepEqual(Object.keys(res.json).sort(), ['coverage', 'name', 'subcommands', 'values']);
  assert.deepEqual(reports.callsTo('getSubcommandSplit')[0].args, ['portfolio', 30]);
  assert.deepEqual(reports.callsTo('getOptionCoverage')[0].args, ['portfolio', 30]);
  assert.deepEqual(reports.callsTo('getParameterUsage')[0].args, ['portfolio', 30, 20]);

  const slashed = await request(`${base}/api/usage/command/${encodeURIComponent('/PRICE')}`, headers);
  assert.equal(slashed.status, 200);
  assert.equal(slashed.json.name, 'price');
}));

test('/api/usage/features is behind auth, clamps limit to 1..50 (default 10) and days, and plain-days the snapshots', () => withDashboard(async ({ base, dash, reports, telemetry }) => {
  const anon = await request(`${base}/api/usage/features`);
  assert.equal(anon.status, 401);
  assert.deepEqual(anon.json, { error: 'unauthorized' });
  assert.equal(reports.callsTo('getFeatureInventory').length, 0, 'no inventory query for an unauthenticated request');

  const headers = signedIn(dash);
  const res = await request(`${base}/api/usage/features?days=14&limit=999`, headers);
  assert.equal(res.status, 200, res.body);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(Object.keys(res.json).sort(), ['activity', 'inventory', 'snapshots']);
  assert.equal(telemetry.flushCalls, 1, 'flushed before the reports ran');
  assert.equal(res.json.inventory.alerts.total, '42', 'inventory counts pass through as pg strings');
  assert.equal(res.json.inventory.scheduleIntervals[2].interval_minutes, 1440);
  assert.equal(res.json.activity.alerts_fired, '14');
  assert.equal(res.json.snapshots.length, 3);
  for (const row of res.json.snapshots) {
    assert.match(row.day, /^\d{4}-\d{2}-\d{2}$/, 'snapshot DATE columns become plain day strings');
    assert.ok(!Number.isNaN(Date.parse(row.taken_at)), 'taken_at stays an ISO timestamp');
    assert.equal(typeof row.alerts, 'number');
  }

  assert.equal((await request(`${base}/api/usage/features?days=99999&limit=0`, headers)).status, 200);
  assert.equal((await request(`${base}/api/usage/features?days=0&limit=abc`, headers)).status, 200);
  assert.equal((await request(`${base}/api/usage/features`, headers)).status, 200);
  assert.deepEqual(reports.callsTo('getFeatureInventory').map((c) => c.args), [[50], [1], [10], [10]]);
  assert.deepEqual(reports.callsTo('getFeatureActivity').map((c) => c.args), [[14], [3650], [1], [30]]);
  assert.deepEqual(reports.callsTo('getFeatureSnapshots').map((c) => c.args), [[14], [3650], [1], [30]]);
}));

/* --------------------------------------------------------------------------
 *  Flush, errors, meta
 * -------------------------------------------------------------------------- */

test('telemetry.flush() is awaited before a report runs', async () => {
  const reports = makeReports();
  const telemetry = makeTelemetry();
  let flushedWhenQueried = null;
  const original = reports.getOverview;
  reports.getOverview = (...args) => {
    flushedWhenQueried = telemetry.flushed;
    return original(...args);
  };
  await withDashboard(async ({ base, dash }) => {
    const res = await request(`${base}/api/usage/overview`, signedIn(dash));
    assert.equal(res.status, 200);
    assert.equal(telemetry.flushCalls, 1);
    assert.equal(flushedWhenQueried, true, 'the report saw the flush complete first');
  }, { reports, telemetry });
});

test('without a telemetry writer the API still works and reports writer: null', () => withDashboard(async ({ base, dash }) => {
  const res = await request(`${base}/api/usage/overview`, signedIn(dash));
  assert.equal(res.status, 200);
  assert.equal(res.json.writer, null);
  const storage = await request(`${base}/api/usage/storage`, signedIn(dash));
  assert.equal(storage.status, 200);
  assert.equal(storage.json.writer, null);
  assert.equal(storage.json.storage.rows, '9001');
}, { telemetry: null }));

test('a report that throws yields a 500 JSON error and is logged', async () => {
  const reports = makeReports();
  reports.getTopUsers = async () => {
    throw new Error('relation "tsukibot.usage_events" does not exist');
  };
  await withDashboard(async ({ base, dash, errors }) => {
    const res = await request(`${base}/api/usage/users`, signedIn(dash));
    assert.equal(res.status, 500);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.deepEqual(res.json, { error: 'relation "tsukibot.usage_events" does not exist' });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /\/api\/usage\/users/);
  }, { reports });
});

test('/api/usage/meta lists commands, timezones, the budget and the server time', () => withDashboard(async ({ base, dash }) => {
  const res = await request(`${base}/api/usage/meta`, signedIn(dash));
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.commands, ['price', 'cg', 'portfolio']);
  assert.ok(Array.isArray(res.json.timezones) && res.json.timezones.includes('UTC'));
  assert.equal(res.json.budget, 12345);
  assert.ok(!Number.isNaN(Date.parse(res.json.now)));
}));

test('unknown API paths are 404 JSON; unknown pages are 404 text', () => withDashboard(async ({ base, dash }) => {
  const headers = signedIn(dash);
  const api = await request(`${base}/api/usage/nope`, headers);
  assert.equal(api.status, 404);
  assert.deepEqual(api.json, { error: 'not found' });
  const page = await request(`${base}/nope`, headers);
  assert.equal(page.status, 404);
}));

/* --------------------------------------------------------------------------
 *  Every route, once
 * -------------------------------------------------------------------------- */

const ROUTES = [
  ['/api/usage/daily', ['latency', 'series']],
  ['/api/usage/commands', ['commands']],
  ['/api/usage/users', ['users']],
  ['/api/usage/guilds', ['guilds']],
  ['/api/usage/coins', ['coins']],
  ['/api/usage/momentum', ['momentum', 'newCoins']],
  ['/api/usage/activity', ['grid', 'hourly', 'weekday']],
  ['/api/usage/errors', ['errors', 'latency', 'slowest']],
  ['/api/usage/growth', ['churn', 'growth', 'retention']],
  ['/api/usage/credits', ['budget', 'byDayEndpoint', 'byEndpoint', 'comparison', 'monthToDate', 'totals']],
  ['/api/usage/funnel', ['abandoned', 'funnel']],
  ['/api/usage/features', ['activity', 'inventory', 'snapshots']],
  ['/api/usage/events', ['events']],
  ['/api/usage/storage', ['storage', 'writer']]
];

for (const [route, keys] of ROUTES) {
  test(`${route} responds 200 with keys ${keys.join(', ')}`, () => withDashboard(async ({ base, dash, telemetry }) => {
    const res = await request(`${base}${route}?days=30&limit=10&tz=UTC`, signedIn(dash));
    assert.equal(res.status, 200, res.body);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.deepEqual(Object.keys(res.json).sort(), keys);
    assert.equal(telemetry.flushCalls, 1, 'flushed once per request');
    const blob = JSON.stringify(res.json);
    for (const leak of ['undefined', 'NaN', '[object Object]']) {
      assert.ok(!blob.includes(leak), `${route} leaked "${leak}"`);
    }
  }));
}

test('day buckets in series responses are plain YYYY-MM-DD strings', () => withDashboard(async ({ base, dash }) => {
  const headers = signedIn(dash);
  const daily = await request(`${base}/api/usage/daily`, headers);
  for (const row of daily.json.series.concat(daily.json.latency)) assert.match(row.day, /^\d{4}-\d{2}-\d{2}$/);
  const growth = await request(`${base}/api/usage/growth`, headers);
  for (const row of growth.json.growth) assert.match(row.day, /^\d{4}-\d{2}-\d{2}$/);
  const credits = await request(`${base}/api/usage/credits`, headers);
  for (const row of credits.json.monthToDate.concat(credits.json.byDayEndpoint)) assert.match(row.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(credits.json.budget, 12345);
  const errors = await request(`${base}/api/usage/errors`, headers);
  for (const row of errors.json.latency) assert.match(row.day, /^\d{4}-\d{2}-\d{2}$/);
  // Timestamps are left as ISO strings.
  const users = await request(`${base}/api/usage/users`, headers);
  assert.ok(!Number.isNaN(Date.parse(users.json.users[0].last_seen)));
}));

/* --------------------------------------------------------------------------
 *  Static page
 * -------------------------------------------------------------------------- */

test('the page and its assets are served with sensible content types', () => withDashboard(async ({ base, dash }) => {
  const headers = signedIn(dash);

  const page = await request(`${base}/dash`, headers);
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.match(page.body, /<title>TsukiBot Usage<\/title>/);
  assert.match(page.body, /\/dash\/app\.js/);
  assert.match(page.body, /\/dash\/vendor\/chart\.umd\.js/);

  const js = await request(`${base}/dash/app.js`, headers);
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /javascript/);
  assert.match(js.body, /'use strict'/);

  const css = await request(`${base}/dash/style.css`, headers);
  assert.equal(css.status, 200);
  assert.match(css.headers['content-type'], /text\/css/);
  assert.match(css.body, /--accent/);

  const chart = await request(`${base}/dash/vendor/chart.umd.js`, headers);
  assert.equal(chart.status, 200);
  assert.match(chart.headers['content-type'], /javascript/);
  assert.ok(chart.body.length > 100000, 'the full Chart.js bundle');
  assert.match(chart.body, /Chart\.js v4/);

  // Assets are behind the token gate too.
  assert.equal((await request(`${base}/dash/app.js`)).status, 401);
  assert.equal((await request(`${base}/dash/vendor/chart.umd.js`)).status, 401);
}));

/* --------------------------------------------------------------------------
 *  Lifecycle
 * -------------------------------------------------------------------------- */

test('stop() closes the server and address() goes back to null', async () => {
  const dash = createDashboard({ reports: makeReports() });
  const server = await dash.start({ port: 0 });
  const addr = dash.address();
  assert.equal(addr.host, '127.0.0.1');
  assert.ok(addr.port > 0);
  assert.equal(server.address().port, addr.port);

  await dash.stop();
  assert.equal(dash.address(), null);
  await assert.rejects(request(`http://127.0.0.1:${addr.port}/healthz`), /ECONNREFUSED/);
  await dash.stop(); // idempotent
});

test('start() rejects when the port is taken', async () => {
  const first = createDashboard({ reports: makeReports() });
  await first.start({ port: 0 });
  const { port } = first.address();
  const second = createDashboard({ reports: makeReports() });
  try {
    await assert.rejects(second.start({ port }), (err) => err && err.code === 'EADDRINUSE');
    assert.equal(second.address(), null);
  } finally {
    await first.stop();
    await second.stop();
  }
});

test('createDashboard requires a reports module', () => {
  assert.throws(() => createDashboard({}), /reports/);
});

/* --------------------------------------------------------------------------
 *  The page itself, in jsdom against the live API
 *
 *  jsdom is already a runtime dependency (main.js uses it), so the client can
 *  be driven for real: the page's fetch goes over HTTP to the app started
 *  above, Chart.js is stubbed (jsdom has no canvas) with a stub that checks
 *  every dataset lines up with its labels, and every tab is clicked through.
 * -------------------------------------------------------------------------- */

test('the page renders every tab against the API without runtime errors', async (t) => {
  let jsdom;
  try {
    jsdom = require('jsdom');
  } catch {
    t.skip('jsdom is not installed');
    return;
  }
  const { JSDOM, VirtualConsole } = jsdom;
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../src/dashboard/index.html'), 'utf8')
    .replace(/<script[^>]*><\/script>/g, '');
  const appJs = fs.readFileSync(path.join(__dirname, '../src/dashboard/app.js'), 'utf8');

  await withDashboard(async ({ base, dash, reports }) => {
    const cookie = signedIn(dash);
    const errors = [];
    const charts = [];
    const chartLabels = [];
    class FakeChart {
      constructor(canvas, config) {
        charts.push(config.type);
        const labels = config.data && config.data.labels;
        if (labels) chartLabels.push(...labels);
        for (const ds of (config.data && config.data.datasets) || []) {
          if (labels && ds.data.length !== labels.length) {
            errors.push(new Error(`dataset "${ds.label}" has ${ds.data.length} points for ${labels.length} labels (${canvas.id})`));
          }
        }
      }
      destroy() { }
    }
    FakeChart.defaults = { font: {}, plugins: { legend: { labels: {} }, tooltip: {} } };

    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push(e));
    const onRejection = (e) => errors.push(e);
    process.on('unhandledRejection', onRejection);
    const dom = new JSDOM(html, { url: `${base}/dash`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
    const { window } = dom;
    try {
      window.Chart = FakeChart;
      window.fetch = async (url) => {
        const r = await request(String(url), cookie);
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
      };
      window.addEventListener('error', (ev) => errors.push(ev.error || new Error(ev.message)));
      window.eval(appJs);
      const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const $$ = (sel) => Array.from(window.document.querySelectorAll(sel));
      await tick(80);

      const tabs = $$('#tabs .tab');
      assert.equal(tabs.length, 11);
      for (const tab of tabs) {
        tab.click();
        await tick(80);
        const text = window.document.getElementById('view').textContent;
        assert.ok(text.trim().length > 50, `${tab.textContent} rendered something`);
        for (const leak of ['undefined', 'NaN', '[object Object]', 'Infinity']) {
          assert.ok(!text.includes(leak), `${tab.textContent} leaked "${leak}"`);
        }
        assert.equal(window.document.getElementById('banner').textContent, '', `${tab.textContent} showed no error banner`);
      }
      assert.ok(charts.length >= 10, 'charts were created');

      // A user row pivots to the Events tab with the user filter applied.
      tabs.find((b) => b.textContent === 'Users & Servers').click();
      await tick(80);
      $$('#view table tbody tr')[0].click();
      await tick(80);
      assert.equal(window.document.querySelector('#tabs .tab.active').textContent, 'Events');
      assert.equal(window.location.hash, '#events');
      const userInput = $$('#view .filter input').find((i) => i.placeholder === '1234567890');
      assert.equal(userInput.value, '1');

      // Features: populated snapshots draw the trend; an alert coin row pivots to Events with the coin filter.
      const featuresTab = tabs.find((b) => b.textContent === 'Features');
      featuresTab.click();
      await tick(80);
      let text = window.document.getElementById('view').textContent;
      assert.match(text, /Price alerts/);
      assert.match(text, /Standing state over time/);
      assert.ok(!/daily snapshot/.test(text), 'three snapshots show a chart, not the empty note');
      assert.ok(chartLabels.includes('daily') && chartLabels.includes('30m') && chartLabels.includes('1h'), 'intervals render as 30m / 1h / daily on the chart');
      assert.match(text, /1 failed/, 'failed deliveries are called out');
      $$('#view table tbody tr')[0].click();
      await tick(80);
      assert.equal(window.document.querySelector('#tabs .tab.active').textContent, 'Events');
      const coinInput = $$('#view .filter input').find((i) => i.placeholder === 'BTC');
      assert.equal(coinInput.value, 'BTC');

      // A single snapshot, then none at all, with nothing set up: empty states, no errors.
      reports.getFeatureSnapshots = async () => [{
        day: new Date(), taken_at: new Date(), alerts: 1, alert_users: 1, holdings: 0, portfolio_users: 0,
        schedules: 0, schedule_guilds: 0, watchlists: 0, watchlist_entries: 0
      }];
      featuresTab.click();
      await tick(80);
      text = window.document.getElementById('view').textContent;
      assert.match(text, /One snapshot so far/);
      assert.match(text, /next daily snapshot/);

      reports.getFeatureSnapshots = async () => [];
      reports.getFeatureInventory = async () => ({
        alerts: { total: '0', users: '0', coins: '0', above: '0', below: '0', with_expiry: '0', expiring_7d: '0', oldest: null, newest: null, max_per_user: null },
        alertCoins: [],
        portfolios: { users: '0', holdings: '0', coins: '0', max_holdings: null },
        portfolioCoins: [],
        schedules: { jobs: '0', guilds: '0', users: '0', never_run: '0', stale: '0', oldest_run: null, latest_run: null },
        scheduleCommands: [],
        scheduleIntervals: [],
        watchlists: { users: '0', entries: '0', max_size: '0', coins: '0' },
        watchlistCoins: []
      });
      featuresTab.click();
      await tick(80);
      text = window.document.getElementById('view').textContent;
      assert.match(text, /first daily snapshot/);
      assert.match(text, /No price alerts are set up yet/);
      assert.match(text, /No portfolio holdings are set up yet/);
      assert.match(text, /No scheduled posts are set up yet/);
      assert.match(text, /No watchlists are set up yet/);
      for (const leak of ['undefined', 'NaN', '[object Object]', 'Infinity']) {
        assert.ok(!text.includes(leak), `empty Features tab leaked "${leak}"`);
      }
      assert.equal(window.document.getElementById('banner').textContent, '', 'empty Features tab showed no error banner');

      assert.deepEqual(errors.map((e) => String((e && e.message) || e)), []);
    } finally {
      process.off('unhandledRejection', onRejection);
      window.close();
    }
  });
});
