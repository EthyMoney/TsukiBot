'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const charts = require('../src/telemetry-charts');

/* --------------------------------------------

    The chart cards behind the /usage images.

    The builders are pure (rows in, SVG out), so these tests assert on the markup: every card is
    a well-formed SVG document of the agreed size, carries the labels a reader would look for,
    survives empty input, and never leaks NaN into a coordinate - the failure mode of a chart
    that gets a string count from node-postgres and forgets to Number() it.

  -------------------------------------------- */

const day = (offset) => new Date(Date.UTC(2026, 7, 1 + offset, 12));

function dailyRows(n) {
  return Array.from({ length: n }, (_, i) => ({ day: day(i), events: String(100 + i * 3), users: String(10 + (i % 5)), errors: i % 4 === 0 ? '2' : '0' }));
}

function assertCard(svg, ...labels) {
  assert.equal(typeof svg, 'string');
  assert.ok(svg.startsWith('<svg'), 'must be an SVG document');
  assert.ok(svg.endsWith('</svg>'));
  assert.match(svg, new RegExp(`width="${charts.CARD_WIDTH}" height="${charts.CARD_HEIGHT}"`));
  assert.ok(!svg.includes('NaN'), 'a NaN reached the markup: ' + (svg.match(/.{0,40}NaN.{0,40}/) || [])[0]);
  assert.ok(!svg.includes('undefined'), 'an undefined reached the markup');
  for (const label of labels) assert.ok(svg.includes(label), `expected "${label}" in the card`);
}

test('dailyTrendChart draws events, errors and users from string counts', () => {
  const svg = charts.dailyTrendChart({ series: dailyRows(30), days: 30, timezone: 'America/Chicago' });
  assertCard(svg, 'Daily activity', 'EVENTS PER DAY', 'DISTINCT USERS PER DAY', 'America/Chicago', 'Aug 1', 'Aug 30', 'weekends shaded');
  assert.ok(svg.includes('<polyline'), 'the series are polylines');
  assert.ok(svg.includes('<polygon'), 'the events series has an area fill');
});

test('dailyTrendChart survives one point and no points', () => {
  assertCard(charts.dailyTrendChart({ series: dailyRows(1), days: 1 }), 'Daily activity');
  assertCard(charts.dailyTrendChart({ series: [], days: 30 }), 'No activity recorded');
});

test('dailyTrendChart thins its labels on a long window', () => {
  const svg = charts.dailyTrendChart({ series: dailyRows(365), days: 365 });
  const dateLabels = svg.match(/>[A-Z][a-z]{2} \d{1,2}</g) || [];
  assert.ok(dateLabels.length <= 8, `expected a handful of date labels, got ${dateLabels.length}`);
});

test('creditBurndownChart places the quota, the projection and today', () => {
  const monthDaily = Array.from({ length: 20 }, (_, i) => ({ day: day(i), credits: '150' }));
  const svg = charts.creditBurndownChart({
    monthDaily, budget: 10000, monthToDate: 3000, projected: 4650, perDay: 155,
    daysInMonth: 31, dayOfMonth: 20, monthLabel: 'August 2026',
    byEndpoint: [{ endpoint: '/coins/markets', calls: '1920', ratelimited: '3' }]
  });
  assertCard(svg, 'CoinGecko credits', 'August 2026', 'quota 10k', 'proj.', 'today', 'even pace', 'coins/markets', '3 × 429', 'within budget');
});

test('creditBurndownChart flags an over-budget projection', () => {
  const svg = charts.creditBurndownChart({
    monthDaily: [], budget: 1000, monthToDate: 900, projected: 2400, perDay: 150,
    daysInMonth: 30, dayOfMonth: 20, monthLabel: 'September 2026', byEndpoint: []
  });
  assertCard(svg, 'OVER BUDGET', 'No calls recorded');
});

test('activityHeatmapChart lays out a Monday-first grid with marginals', () => {
  const grid = [];
  for (let w = 0; w < 7; w++) for (let h = 0; h < 24; h++) grid.push({ weekday: w, hour: h, events: String((h + w) % 9), users: '1' });
  const svg = charts.activityHeatmapChart({
    grid, hourly: [{ hour: 20, events: '50', users: '9' }], weekday: [{ weekday: 1, events: '90', users: '30' }],
    days: 30, timezone: 'UTC'
  });
  assertCard(svg, 'Activity patterns', 'Mon', 'Sun', 'BY HOUR', 'BY WEEKDAY', 'peak 20:00', 'quiet', 'busy');
  assert.ok((svg.match(/<rect/g) || []).length > 7 * 24, 'one rect per cell at least');
});

test('activityHeatmapChart can colour by users instead of events', () => {
  const svg = charts.activityHeatmapChart({ grid: [{ weekday: 1, hour: 1, events: '100', users: '7' }], days: 7, timezone: 'UTC', metric: 'users' });
  assertCard(svg, 'counts are users', 'BY HOUR (users)');
});

test('commandBreakdownChart lists commands with error shares and reach', () => {
  const svg = charts.commandBreakdownChart({
    rows: [
      { name: 'price', uses: '3200', users: '80', guilds: '11', errors: '40', avg_ms: '350' },
      { name: 'portfolio show', uses: '900', users: '40', guilds: '9', errors: '0', avg_ms: '820' }
    ],
    days: 30
  });
  assertCard(svg, 'Top commands', 'price', 'portfolio show', '3.2k', '80 · 11 · 350ms', 'errors');
});

test('errorsChart shows faults and latency ranges, and an all-clear', () => {
  const svg = charts.errorsChart({
    errors: [{ command: 'hmap', error_kind: '50013', occurrences: '11', users_affected: '4' }],
    slowest: [{ command: 'c', avg_ms: '4200', p95_ms: '9000', max_ms: '15000', samples: '120' }],
    days: 30
  });
  assertCard(svg, 'Errors and latency', 'hmap · 50013', '11 · 4 users', 'SLOWEST COMMANDS', '4.2s · n=120');
  assertCard(charts.errorsChart({ errors: [], slowest: [], days: 7 }), 'No command errors', 'Not enough timed samples');
});

test('growthChart stacks new on returning and prints the churn tiles', () => {
  const growth = Array.from({ length: 10 }, (_, i) => ({ day: day(i), active_users: '30', new_users: '5', returning_users: '25' }));
  const svg = charts.growthChart({
    growth, retention: [{ bucket: '1 day (one-off)', users: '40' }],
    churn: { active: '61', retained: '40', churned: '9', resurrected: '4' }, days: 10, timezone: 'UTC'
  });
  assertCard(svg, 'Growth and retention', 'ACTIVE', 'RETAINED', 'CHURNED', 'CAME BACK', '61', '1 day (one-off)', '50 first-time users');
  assertCard(charts.growthChart({ growth: [], days: 30 }), 'No activity recorded', '–');
});

test('momentumChart renders risers and fallers with signed changes', () => {
  const svg = charts.momentumChart({
    risers: [{ coin: 'SOL', current_requests: '140', prior_requests: '40', current_users: '22' }, { coin: 'PEPE', current_requests: '12', prior_requests: '0', current_users: '5' }],
    fallers: [{ coin: 'DOGE', current_requests: '20', prior_requests: '90', current_users: '6' }],
    days: 30
  });
  assertCard(svg, 'Coin momentum', 'SOL', '+100 (+250%)', 'PEPE', '(new)', 'DOGE', '-70 (-78%)');
  assertCard(charts.momentumChart({ risers: [], fallers: [], days: 30 }), 'Nothing moved enough to rank');
});

test('funnelChart shows conversion per command', () => {
  const svg = charts.funnelChart({ funnel: [{ command: 'price', searches: '400', converted: '320', users: '60' }], days: 30 });
  assertCard(svg, 'funnel', '/price', '80% · 320/400', '80% overall');
  assertCard(charts.funnelChart({ funnel: [], days: 30 }), 'No autocomplete searches');
});

test('weekOverWeekChart overlays the prior seven days and states the change', () => {
  const series = Array.from({ length: 14 }, (_, i) => ({ day: day(i), events: i < 7 ? '100' : '120' }));
  const svg = charts.weekOverWeekChart({ series });
  assertCard(svg, 'This week vs last week', '▲ +20% vs last week', 'this week', 'last week', 'Last week totalled 700');
  assertCard(charts.weekOverWeekChart({ series: [] }), 'No activity recorded');
});

test('featuresChart lays out four quadrants with their headline counts', () => {
  const svg = charts.featuresChart({
    inventory: {
      alerts: { total: '42', users: '17', coins: '12' },
      alertCoins: [{ symbol: 'BTC', alerts: '12', users: '9', above: '8', below: '4' }],
      portfolios: { users: '23', holdings: '88', coins: '31' },
      portfolioCoins: [{ symbol: 'BTC', holders: '19' }],
      schedules: { jobs: '9', guilds: '6', stale: '1' },
      scheduleCommands: [{ command: 'hmap', jobs: '4', guilds: '4' }],
      scheduleIntervals: [{ interval_minutes: 60, jobs: '5' }, { interval_minutes: 1440, jobs: '4' }],
      watchlists: { users: '34', entries: '210', coins: '61' },
      watchlistCoins: [{ coin: 'ETH', users: '24' }]
    },
    activity: { alerts_created: '15', alerts_fired: '9', alerts_failed: '1', portfolio_sets: '22', schedules_created: '2', posts_run: '300', posts_failed: '4', watchlist_uses: '80' },
    delta: { latest: { alerts: 42, portfolio_users: 23, schedules: 9, watchlists: 34 }, prior: { alerts: 40, portfolio_users: 23, schedules: 10, watchlists: 30 } },
    days: 30
  });
  assertCard(svg, 'What users have set up', 'PRICE ALERTS', '42 active · 17 users · 12 coins', 'PORTFOLIOS', '19 holders',
    'SCHEDULED POSTS', '9 jobs · 6 servers · 1 stale', 'every 1h ×5 daily ×4', '/hmap', 'WATCHLISTS', 'on 24 lists',
    'vs 30d ago: alerts +2 · portfolios = · schedules -1 · watchlists +4', '15 alerts set · 9 fired (1 undeliverable)');
  assertCard(charts.featuresChart({ inventory: {}, days: 7 }), 'No price alerts set.', 'No portfolios yet.', 'No scheduled posts.', 'No watchlists yet.');
});

test('dayKey reads a local-midnight Date and a YYYY-MM-DD string alike', () => {
  assert.equal(charts.dayKey(new Date(2026, 7, 5)), '2026-08-05', 'node-postgres DATE values are local midnight');
  assert.equal(charts.dayKey('2026-08-05'), '2026-08-05');
  assert.equal(charts.dayKey('2026-08-05T00:00:00.000Z'), '2026-08-05');
  assert.equal(charts.dayKey(null), '');
  assert.equal(charts.dayLabel('2026-08-05'), 'Aug 5');
});

test('niceCeil picks a round axis top at or above the maximum', () => {
  assert.equal(charts.niceCeil(0), 1);
  assert.equal(charts.niceCeil(3), 3);
  assert.equal(charts.niceCeil(7), 8);
  assert.equal(charts.niceCeil(42), 50);
  assert.equal(charts.niceCeil(10500), 12500);
  assert.equal(charts.niceCeil(1000), 1000);
});

test('pctChange is null against a zero base', () => {
  assert.equal(charts.pctChange(10, 0), null);
  assert.equal(charts.pctChange(150, 100), 50);
  assert.equal(charts.pctChange('90', '100'), -10);
});

test('renderPng rasterises a card to a PNG and never throws', async () => {
  if (!charts.isAvailable()) {
    // sharp failed to load on this machine: the bot degrades to text charts, and so do we.
    assert.equal(await charts.renderPng('<svg xmlns="http://www.w3.org/2000/svg"/>'), null);
    return;
  }
  const png = await charts.renderPng(charts.funnelChart({ funnel: [], days: 7 }));
  assert.ok(Buffer.isBuffer(png), 'expected a buffer');
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'PNG signature');
  assert.equal(await charts.renderPng(''), null, 'nothing to render');
  assert.equal(await charts.renderPng('<not svg'), null, 'garbage must not throw');
});
