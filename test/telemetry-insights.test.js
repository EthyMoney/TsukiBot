'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createInsights, DEFAULT_CONFIG, deltaText } = require('../src/telemetry-insights');

/* --------------------------------------------

    The proactive insights module: weekly digest and watchdog.

    Everything is driven through injected fakes - a reports object returning rows shaped the way
    node-postgres returns them (strings for COUNT() and numerics, Dates for timestamps), an
    in-memory telemetry stub, a charts stub whose renderPng can be flipped, a send spy and a
    fixed clock - so nothing here touches a database, a Discord client, sharp or the calendar.

  -------------------------------------------- */

// A Wednesday, mid-month: 12 UTC days remain in August after the 19th.
const FIXED_NOW = new Date('2026-08-19T09:00:00Z');
const LEAKS = ['undefined', 'NaN', '[object Object]', 'Infinity'];

function ago(mins, from = FIXED_NOW) {
  return new Date(from.getTime() - mins * 60000);
}

/**
 * Fake telemetry-reports. Each entry is either a canned value or a function of the call's
 * arguments; Error instances are thrown. Every call is recorded for assertions.
 */
function makeReports(overrides = {}) {
  const series = [];
  for (let i = 13; i >= 0; i--) {
    series.push({ day: ago(i * 1440), events: String(100 + (13 - i) * 7), users: '20', errors: '1' });
  }

  const canned = {
    getOverviewComparison: {
      events: '1240', prior_events: '1090',
      users: '61', prior_users: '63',
      guilds: '12', prior_guilds: '11',
      command_events: '900', prior_command_events: '800',
      errors: '9', prior_errors: '7',
      credits: '2100', prior_credits: '1800',
      p95_ms: '1200', prior_p95_ms: '1100'
    },
    getTopCommands: (days, limit, includeAutocomplete, opts = {}) => opts.priorWindow
      ? [
        { name: 'price', uses: '3000', users: '70' },
        { name: 'portfolio show', uses: '950', users: '40' },
        { name: 'cg', uses: '1200', users: '50' },
        { name: 'hmap', uses: '500', users: '30' }
      ]
      : [
        { name: 'price', uses: '3200', users: '80' },
        { name: 'cg', uses: '1500', users: '55' },
        { name: 'portfolio show', uses: '900', users: '38' },
        { name: 'c', uses: '400', users: '25' },
        { name: 'alerts', uses: '120', users: '10' },
        { name: 'hmap', uses: '90', users: '8' }
      ],
    getTopCoins: (days, limit, opts = {}) => opts.priorWindow
      ? [{ coin: 'BTC', requests: '500' }, { coin: 'ETH', requests: '300' }, { coin: 'DOGE', requests: '50' }]
      : [{ coin: 'BTC', requests: '520' }, { coin: 'ETH', requests: '280' }, { coin: 'SOL', requests: '60' }],
    getCoinMomentum: [
      { coin: 'BTC', current_requests: '110', prior_requests: '100', current_users: '40', prior_users: '38', via_command: 'price' },
      { coin: 'SOL', current_requests: '15', prior_requests: '3', current_users: '6', prior_users: '2', via_command: 'price' },
      { coin: 'DOGE', current_requests: '4', prior_requests: '10', current_users: '2', prior_users: '5', via_command: 'cg' },
      { coin: 'PEPE', current_requests: '6', prior_requests: '0', current_users: '3', prior_users: '0', via_command: 'cg' },
      { coin: 'XRP', current_requests: '9', prior_requests: '1', current_users: '1', prior_users: '1', via_command: 'price' }
    ],
    getNewCoins: [{ coin: 'PEPE', first_seen: ago(2000), requests: '6', users: '3', via_command: 'cg' }],
    getDailySeries: series,
    getApiCreditTotals: {
      calls_total: '4820', calls_1h: '9', calls_24h: '300', calls_7d: '2100',
      calls_month: '4800', ratelimited: '2', first_call: ago(40000)
    },
    getApiCreditsMonthComparison: { month_to_date: '4800', prior_month_same_point: '3900', prior_month_total: '7400' },
    getChurn: { active: '61', retained: '40', churned: '23', resurrected: '4' },
    getErrorRateWindows: { recent_events: '5', recent_errors: '3', baseline_events: '1000', baseline_errors: '20' },
    getRecentErrorKinds: [
      { command: 'hmap', error_kind: '50013', occurrences: '6', users_affected: '3' },
      { command: 'price', error_kind: 'TypeError: boom', occurrences: '2', users_affected: '1' }
    ],
    getLatencyRegressions: [],
    getRecentRateLimits: { ratelimited: '0', last_seen: null }
  };

  const table = { ...canned, ...overrides };
  const calls = [];
  const reports = { calls };
  for (const [name, value] of Object.entries(table)) {
    reports[name] = async (...args) => {
      calls.push([name, ...args]);
      if (value instanceof Error) throw value;
      return typeof value === 'function' ? value(...args) : value;
    };
  }
  return reports;
}

/** Every reports function throwing, as when the database is down. */
function makeBrokenReports() {
  const names = Object.keys(makeReports()).filter(k => k !== 'calls');
  const overrides = {};
  for (const name of names) overrides[name] = new Error('connection refused');
  return makeReports(overrides);
}

function makeTelemetry() {
  const t = {
    stats: { buffered: 0, pendingAutocomplete: 0, dropped: 0 },
    events: [],
    getWriterStats() { return { ...t.stats }; },
    recordSystemEvent(command, details = {}) { t.events.push({ command, ...details }); },
    async flush() { return 0; }
  };
  return t;
}

function makeCharts({ png = Buffer.from('png'), available = true } = {}) {
  const c = {
    calls: [],
    png,
    isAvailable: () => available,
    weekOverWeekChart(opts) { c.calls.push(['weekOverWeekChart', opts]); return '<svg/>'; },
    async renderPng(svg) { c.calls.push(['renderPng', svg]); return c.png; },
    pctChange(current, prior) {
      const p = Number(prior) || 0;
      return p === 0 ? null : (Number(current) - p) / p * 100;
    }
  };
  return c;
}

/** One fully wired instance with a movable clock and a send spy. */
function setup({ reports, telemetry, charts, config, send, getBudget, clock = FIXED_NOW } = {}) {
  const state = { clock, sent: [], logged: [], errors: [] };
  const deps = {
    reports: reports || makeReports(),
    telemetry: telemetry || makeTelemetry(),
    charts: charts || makeCharts(),
    send: send || (async (payload) => { state.sent.push(payload); }),
    getBudget: getBudget || (() => 10000),
    config,
    log: (m) => state.logged.push(m),
    logError: (m) => state.errors.push(m),
    now: () => state.clock
  };
  const insights = createInsights(deps);
  return { insights, state, ...deps };
}

/* --------------------------------------------
    deltaText
  -------------------------------------------- */

test('deltaText marks rises, falls, new and nothing', () => {
  assert.equal(deltaText(112, 100), '▲ +12%');
  assert.equal(deltaText(92, 100), '▼ 8%');
  assert.equal(deltaText(5, 0), '▲ new');
  assert.equal(deltaText(0, 0), '–');
  assert.equal(deltaText(null, null), '–');
  assert.equal(deltaText(undefined, undefined), '–');
  assert.equal(deltaText(0, 10), '▼ 100%');
  assert.equal(deltaText(100, 100), '= 0%');
});

test('deltaText accepts the strings node-postgres returns', () => {
  assert.equal(deltaText('112', '100'), '▲ +12%');
  assert.equal(deltaText('7', '0'), '▲ new');
  assert.equal(deltaText('0', '0'), '–');
});

test('deltaText appends the suffix to everything but the dash', () => {
  assert.equal(deltaText(114, 100, { suffix: ' vs last week' }), '▲ +14% vs last week');
  assert.equal(deltaText(3, 0, { suffix: ' vs last week' }), '▲ new vs last week');
  assert.equal(deltaText(0, 0, { suffix: ' vs last week' }), '–');
});

/* --------------------------------------------
    Weekly digest
  -------------------------------------------- */

test('digest embed carries the expected fields and a ▲/▼ headline', async () => {
  const { insights } = setup();
  const { embed, files } = await insights.buildWeeklyDigest();
  const json = embed.toJSON();

  assert.match(json.title, /Weekly usage digest/);
  const names = (json.fields || []).map(f => f.name);
  for (const expected of ['This week vs last', 'Top commands', 'Coins', 'CoinGecko credits', 'Retention']) {
    assert.ok(names.includes(expected), `missing field "${expected}" in ${JSON.stringify(names)}`);
  }

  assert.ok(json.description.includes('▲'), 'description should carry a rise marker');
  assert.ok(json.description.includes('▼'), 'description should carry a fall marker');
  assert.match(json.description, /\*\*1\.2k\*\* events this week \(▲ \+14% vs last week\)/);
  assert.match(json.description, /\*\*61\*\* active users \(▼ 3%\)/);
  assert.match(json.description, /\*\*9\*\* errors/);
  assert.match(json.description, /\*\*2\.1k\*\* credits/);
  assert.ok(json.description.length <= 4096);

  for (const field of json.fields) {
    assert.ok(field.value.length <= 1024, `field "${field.name}" is ${field.value.length} chars`);
    assert.ok(field.name.length <= 256);
  }

  const blob = JSON.stringify(json);
  for (const leak of LEAKS) assert.ok(!blob.includes(leak), `leaked "${leak}"`);

  // Chart attached: fake renderPng returned a buffer.
  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'usage-digest.png');
  assert.equal(json.image && json.image.url, 'attachment://usage-digest.png');
});

test('digest comparison block shows every metric with its delta', async () => {
  const { insights } = setup();
  const { embed } = await insights.buildWeeklyDigest();
  const field = embed.toJSON().fields.find(f => f.name === 'This week vs last');
  assert.ok(field.value.startsWith('```'));
  for (const label of ['Events', 'Commands', 'Active users', 'Servers', 'Errors', 'Error rate', 'p95 latency', 'CoinGecko credits']) {
    assert.ok(field.value.includes(label), `missing row "${label}"`);
  }
  assert.match(field.value, /1\.2k \(▲ \+14%\)/);
  assert.match(field.value, /0\.7% \(was 0\.6%\)/);
  assert.match(field.value, /1\.2s \(▲ \+9%\)/);
});

test('digest top commands table ranks against last week', async () => {
  const { insights, reports } = setup();
  const { embed } = await insights.buildWeeklyDigest();
  const field = embed.toJSON().fields.find(f => f.name === 'Top commands');

  // Five rows only, even though the query returned six.
  const rows = field.value.split('\n').filter(l => /^[a-z]/.test(l));
  assert.equal(rows.length, 5);
  assert.ok(!field.value.includes('hmap'), 'sixth command should be cut');

  assert.match(field.value, /price\s+3\.2k\s+▲ \+7%\s+=/);     // rank 1 -> 1
  assert.match(field.value, /cg\s+1\.5k\s+▲ \+25%\s+↑1/);    // rank 3 -> 2
  assert.match(field.value, /portfolio show\s+900\s+▼ 5%\s+↓1/); // rank 2 -> 3
  assert.match(field.value, /c\s+400\s+▲ new\s+new/);        // not in the prior top 50

  const topCalls = reports.calls.filter(c => c[0] === 'getTopCommands');
  assert.equal(topCalls.length, 2);
  assert.deepEqual(topCalls.find(c => !c[4] || !c[4].priorWindow).slice(1, 4), [7, 10, false]);
  assert.deepEqual(topCalls.find(c => c[4] && c[4].priorWindow).slice(1, 4), [7, 50, false]);
});

test('digest coins field lists entrants, risers and new coins with the noise filtered', async () => {
  const { insights } = setup();
  const { embed } = await insights.buildWeeklyDigest();
  const field = embed.toJSON().fields.find(f => f.name === 'Coins');

  assert.match(field.value, /Entered the top 10:\*\* SOL/);
  assert.match(field.value, /Rising:\*\*.*SOL 3→15 \(▲ \+400%\)/);
  assert.match(field.value, /BTC 100→110 \(▲ \+10%\)/);
  assert.match(field.value, /PEPE 0→6 \(▲ new\)/);
  assert.match(field.value, /New to the bot:\*\* PEPE ×6/);
  // 1 -> 9 is +800% and also noise: prior must be >= 3 (or zero with a real current count).
  assert.ok(!field.value.includes('XRP'), 'XRP should be filtered as noise');
  // A faller never shows up under "Rising".
  assert.ok(!/Rising:.*DOGE/.test(field.value));
});

test('digest skips the coins field when there is nothing to say', async () => {
  const { insights } = setup({
    reports: makeReports({
      getTopCoins: [],
      getCoinMomentum: [],
      getNewCoins: []
    })
  });
  const { embed } = await insights.buildWeeklyDigest();
  assert.ok(!embed.toJSON().fields.some(f => f.name === 'Coins'));
});

test('digest credits field projects the month and compares with last month', async () => {
  const { insights } = setup();
  const { embed } = await insights.buildWeeklyDigest();
  const field = embed.toJSON().fields.find(f => f.name.startsWith('CoinGecko credits'));

  // 4800 + 300/day * 12 days left = 8400 < 10000; but 2 calls were rate limited this week... no,
  // the digest asks getRecentRateLimits for the week, which says 0 here. So: no flag.
  assert.equal(field.name, 'CoinGecko credits');
  assert.match(field.value, /Month to date\s+4\.8k \/ 10k \(48%\)/);
  assert.match(field.value, /Projected\s+8\.4k/);
  assert.ok(!field.value.includes('over budget'));
  assert.match(field.value, /vs last month here\s+▲ \+23%/);
  assert.match(field.value, /Last month total\s+7\.4k/);
});

test('digest flags credits when the projection overruns the budget', async () => {
  const { insights } = setup({
    reports: makeReports({
      getApiCreditTotals: {
        calls_total: '9000', calls_1h: '30', calls_24h: '600', calls_7d: '4000',
        calls_month: '4800', ratelimited: '0', first_call: ago(40000)
      }
    })
  });
  const { embed } = await insights.buildWeeklyDigest();
  const field = embed.toJSON().fields.find(f => f.name.startsWith('CoinGecko credits'));
  assert.equal(field.name, 'CoinGecko credits ⚠️');
  assert.match(field.value, /Projected\s+12k over budget/);
});

test('digest flags credits when any call was rate limited this week', async () => {
  const { insights, reports } = setup({
    reports: makeReports({ getRecentRateLimits: { ratelimited: '3', last_seen: ago(60) } })
  });
  const { embed } = await insights.buildWeeklyDigest();
  const field = embed.toJSON().fields.find(f => f.name.startsWith('CoinGecko credits'));
  assert.equal(field.name, 'CoinGecko credits ⚠️');
  assert.match(field.value, /Rate limited\s+3 this week/);
  // Asked for the digest window in hours, not the watchdog's window.
  const call = reports.calls.find(c => c[0] === 'getRecentRateLimits');
  assert.equal(call[1], 7 * 24);
});

test('digest retention line comes from getChurn', async () => {
  const { insights } = setup();
  const { embed } = await insights.buildWeeklyDigest();
  const field = embed.toJSON().fields.find(f => f.name === 'Retention');
  assert.match(field.value, /\*\*40\*\* of \*\*61\*\*/);
  assert.match(field.value, /\*\*23\*\* churned/);
  assert.match(field.value, /\*\*4\*\* came back/);
});

test('digest warns in the description when the writer has dropped events', async () => {
  const telemetry = makeTelemetry();
  telemetry.stats.dropped = 5;
  const { insights } = setup({ telemetry });
  const { embed } = await insights.buildWeeklyDigest();
  assert.match(embed.toJSON().description, /⚠️ \*\*Telemetry writer\*\* has dropped \*\*5\*\* events/);

  const { insights: quiet } = setup();
  const { embed: clean } = await quiet.buildWeeklyDigest();
  assert.ok(!clean.toJSON().description.includes('Telemetry writer'));
});

test('digest attaches no image when renderPng returns null or charts are unavailable', async () => {
  const nullPng = setup({ charts: makeCharts({ png: null }) });
  const a = await nullPng.insights.buildWeeklyDigest();
  assert.equal(a.files.length, 0);
  assert.equal(a.embed.toJSON().image, undefined);
  assert.ok(nullPng.charts.calls.some(c => c[0] === 'renderPng'), 'renderPng should have been tried');

  const noCharts = setup({ charts: makeCharts({ available: false }) });
  const b = await noCharts.insights.buildWeeklyDigest();
  assert.equal(b.files.length, 0);
  assert.equal(b.embed.toJSON().image, undefined);
  assert.equal(noCharts.charts.calls.length, 0, 'nothing should be rendered when sharp is missing');
});

test('digest chart failures never escape', async () => {
  const charts = makeCharts();
  charts.weekOverWeekChart = () => { throw new Error('svg exploded'); };
  const { insights, state } = setup({ charts });
  const { embed, files } = await insights.buildWeeklyDigest();
  assert.equal(files.length, 0);
  assert.equal(embed.toJSON().image, undefined);
  assert.ok(state.errors.some(m => /chart failed/.test(m)));
});

test('digest passes the two-week series and the configured timezone to the chart', async () => {
  const { insights, charts, reports } = setup({ config: { digest: { timezone: 'America/Chicago' } } });
  await insights.buildWeeklyDigest();
  const seriesCall = reports.calls.find(c => c[0] === 'getDailySeries');
  assert.deepEqual(seriesCall.slice(1), [14, 'America/Chicago']);
  const chartCall = charts.calls.find(c => c[0] === 'weekOverWeekChart');
  assert.equal(chartCall[1].series.length, 14);
  assert.equal(chartCall[1].metricLabel, 'events');
});

test('digest degrades on an empty deployment without leaking', async () => {
  const { insights } = setup({
    reports: makeReports({
      getOverviewComparison: {
        events: '0', prior_events: '0', users: '0', prior_users: '0', guilds: '0', prior_guilds: '0',
        command_events: '0', prior_command_events: '0', errors: '0', prior_errors: '0',
        credits: '0', prior_credits: '0', p95_ms: null, prior_p95_ms: null
      },
      getTopCommands: [],
      getTopCoins: [],
      getCoinMomentum: [],
      getNewCoins: [],
      getDailySeries: [],
      getApiCreditTotals: { calls_total: '0', calls_1h: '0', calls_24h: '0', calls_7d: '0', calls_month: '0', ratelimited: '0', first_call: null },
      getApiCreditsMonthComparison: { month_to_date: '0', prior_month_same_point: '0', prior_month_total: '0' },
      getRecentRateLimits: { ratelimited: '0', last_seen: null },
      getChurn: { active: '0', retained: '0', churned: '0', resurrected: '0' }
    })
  });
  const { embed, files } = await insights.buildWeeklyDigest();
  const json = embed.toJSON();
  assert.ok(json.title);
  assert.equal(files.length, 0, 'no chart from a one-row series');
  const blob = JSON.stringify(json);
  for (const leak of LEAKS) assert.ok(!blob.includes(leak), `leaked "${leak}" on empty data`);
  assert.ok(json.description.includes('–'), 'empty comparisons render as a dash');
});

test('digest survives an optional section failing but not the overview failing', async () => {
  const partial = setup({ reports: makeReports({ getCoinMomentum: new Error('timeout') }) });
  const { embed } = await partial.insights.buildWeeklyDigest();
  assert.ok(embed.toJSON().fields.some(f => f.name === 'Top commands'));
  assert.ok(partial.state.errors.some(m => /coin momentum failed/.test(m)));

  const broken = setup({ reports: makeReports({ getOverviewComparison: new Error('down') }) });
  await assert.rejects(() => broken.insights.buildWeeklyDigest(), /down/);
});

test('sendWeeklyDigest sends once and records a system event', async () => {
  const { insights, state, telemetry } = setup();
  const ok = await insights.sendWeeklyDigest();
  assert.equal(ok, true);
  assert.equal(state.sent.length, 1);
  assert.equal(state.sent[0].embeds.length, 1);
  assert.equal(state.sent[0].files.length, 1);

  const events = telemetry.events.filter(e => e.command === 'usage-digest');
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, 'ok');
  assert.deepEqual(events[0].params, { days: 7, timezone: 'UTC' });
});

test('sendWeeklyDigest never throws and records the failure', async () => {
  const { insights, telemetry, state } = setup({
    send: async () => { throw new Error('DMs closed'); }
  });
  const ok = await insights.sendWeeklyDigest();
  assert.equal(ok, false);
  const events = telemetry.events.filter(e => e.command === 'usage-digest');
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, 'error');
  assert.ok(state.errors.some(m => /DMs closed/.test(m)));

  const down = setup({ reports: makeReports({ getOverviewComparison: new Error('db down') }) });
  assert.equal(await down.insights.sendWeeklyDigest(), false);
  assert.equal(down.telemetry.events[0].outcome, 'error');
});

/* --------------------------------------------
    Watchdog
  -------------------------------------------- */

test('watchdog stays quiet under the floors', async () => {
  // 3 errors of 5 events is a 60% "rate" and also nothing.
  const { insights, reports } = setup();
  const alerts = await insights.checkWatchdog();
  assert.deepEqual(alerts, []);
  // Every SQL check still ran (and the dropped-batch check needs no SQL).
  for (const name of ['getErrorRateWindows', 'getLatencyRegressions', 'getRecentRateLimits', 'getApiCreditTotals']) {
    assert.ok(reports.calls.some(c => c[0] === name), `${name} was not consulted`);
  }
});

test('watchdog error-spike fires above the floors with the error kinds in the detail', async () => {
  const { insights } = setup({
    reports: makeReports({
      // 20% recent vs 2% baseline: over 3x and over the 5% floor, with enough volume.
      getErrorRateWindows: { recent_events: '40', recent_errors: '8', baseline_events: '1000', baseline_errors: '20' }
    })
  });
  const alerts = await insights.checkWatchdog();
  assert.equal(alerts.length, 1);
  const [alert] = alerts;
  assert.equal(alert.key, 'error-spike');
  assert.equal(alert.severity, 'critical');
  assert.match(alert.detail, /20\.0%/);
  assert.match(alert.detail, /hmap · 50013 ×6 \(3 users\)/);
  assert.match(alert.detail, /price · TypeError: boom ×2 \(1 user\)/);
});

test('watchdog error-spike respects the multiplier and the floors separately', async () => {
  // Enough volume, but only 2x the baseline.
  const under = setup({
    reports: makeReports({
      getErrorRateWindows: { recent_events: '40', recent_errors: '8', baseline_events: '1000', baseline_errors: '100' }
    })
  });
  assert.deepEqual(await under.insights.checkWatchdog(), []);

  // Plenty of rate and multiplier, but fewer than minErrors failures.
  const fewErrors = setup({
    reports: makeReports({
      getErrorRateWindows: { recent_events: '40', recent_errors: '4', baseline_events: '1000', baseline_errors: '5' }
    })
  });
  assert.deepEqual(await fewErrors.insights.checkWatchdog(), []);

  // Fewer than minEvents.
  const fewEvents = setup({
    reports: makeReports({
      getErrorRateWindows: { recent_events: '19', recent_errors: '10', baseline_events: '1000', baseline_errors: '5' }
    })
  });
  assert.deepEqual(await fewEvents.insights.checkWatchdog(), []);

  // A zero baseline: the floor alone decides (6% >= 5%).
  const zeroBaseline = setup({
    reports: makeReports({
      getErrorRateWindows: { recent_events: '100', recent_errors: '6', baseline_events: '1000', baseline_errors: '0' }
    })
  });
  const alerts = await zeroBaseline.insights.checkWatchdog();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].key, 'error-spike');
});

test('watchdog latency regression needs both the multiplier and the floor', async () => {
  const fires = setup({
    reports: makeReports({
      getLatencyRegressions: [
        { command: 'hmap', recent_samples: '25', recent_p95_ms: '5000', baseline_samples: '300', baseline_p95_ms: '2000' },
        { command: 'price', recent_samples: '40', recent_p95_ms: '400', baseline_samples: '900', baseline_p95_ms: '350' }
      ]
    })
  });
  const alerts = await fires.insights.checkWatchdog();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].key, 'latency-regression');
  assert.equal(alerts[0].severity, 'warning');
  assert.match(alerts[0].detail, /hmap p95 5\.0s \(was 2\.0s\)/);
  assert.ok(!alerts[0].detail.includes('price'), 'a command within bounds must not be listed');

  // 3x the baseline but under the 2s floor.
  const belowFloor = setup({
    reports: makeReports({
      getLatencyRegressions: [{ command: 'price', recent_samples: '40', recent_p95_ms: '1500', baseline_samples: '900', baseline_p95_ms: '500' }]
    })
  });
  assert.deepEqual(await belowFloor.insights.checkWatchdog(), []);

  // Over the floor but under 2x.
  const belowMultiplier = setup({
    reports: makeReports({
      getLatencyRegressions: [{ command: 'hmap', recent_samples: '40', recent_p95_ms: '3000', baseline_samples: '900', baseline_p95_ms: '2500' }]
    })
  });
  assert.deepEqual(await belowMultiplier.insights.checkWatchdog(), []);
});

test('watchdog rate-limited fires on any recent 429', async () => {
  const { insights } = setup({
    reports: makeReports({ getRecentRateLimits: { ratelimited: '3', last_seen: ago(90) } })
  });
  const alerts = await insights.checkWatchdog();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].key, 'rate-limited');
  assert.equal(alerts[0].severity, 'warning');
  assert.match(alerts[0].detail, /\*\*3\*\* CoinGecko calls were rate limited/);
  assert.match(alerts[0].detail, /1h ago/);
});

test('watchdog credit-budget fires when the projection or the month exceeds the budget', async () => {
  // 9000 + 500 * 12 = 15000 > 10000.
  const projected = setup({
    reports: makeReports({
      getApiCreditTotals: { calls_total: '9000', calls_1h: '20', calls_24h: '500', calls_7d: '3500', calls_month: '9000', ratelimited: '0', first_call: ago(40000) }
    })
  });
  let alerts = await projected.insights.checkWatchdog();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].key, 'credit-budget');
  assert.equal(alerts[0].severity, 'critical');
  assert.match(alerts[0].detail, /\*\*9\.0k\*\* of \*\*10k\*\* \(90%\)/);
  assert.match(alerts[0].detail, /projected \*\*15k\*\*/);
  assert.match(alerts[0].detail, /12 days left/);
  assert.ok(!alerts[0].detail.includes('already over'));

  // Already over, even with no traffic in the last day.
  const over = setup({
    reports: makeReports({
      getApiCreditTotals: { calls_total: '11000', calls_1h: '0', calls_24h: '0', calls_7d: '100', calls_month: '11000', ratelimited: '0', first_call: ago(40000) }
    })
  });
  alerts = await over.insights.checkWatchdog();
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].detail, /already over budget/);

  // A bigger budget silences the same numbers.
  const roomy = setup({
    reports: makeReports({
      getApiCreditTotals: { calls_total: '9000', calls_1h: '20', calls_24h: '500', calls_7d: '3500', calls_month: '9000', ratelimited: '0', first_call: ago(40000) }
    }),
    getBudget: () => 50000
  });
  assert.deepEqual(await roomy.insights.checkWatchdog(), []);
});

test('watchdog dropped-batches fires on an increase, not on the baseline run', async () => {
  const telemetry = makeTelemetry();
  telemetry.stats.dropped = 7;
  const { insights } = setup({ telemetry });

  assert.deepEqual(await insights.checkWatchdog(), [], 'first run only records the baseline');
  assert.equal(insights.debounceState().lastDropped, 7);

  assert.deepEqual(await insights.checkWatchdog(), [], 'no change, no alert');

  telemetry.stats.dropped = 12;
  const alerts = await insights.checkWatchdog();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].key, 'dropped-batches');
  assert.equal(alerts[0].severity, 'critical');
  assert.match(alerts[0].detail, /\*\*5\*\* events were dropped/);
  assert.match(alerts[0].detail, /12 since the last restart/);
  assert.equal(insights.debounceState().lastDropped, 12);
});

test('watchdog dropped-batches still fires when every report throws', async () => {
  const telemetry = makeTelemetry();
  const { insights, state } = setup({ telemetry, reports: makeBrokenReports() });

  await insights.checkWatchdog();             // baseline
  telemetry.stats.dropped = 40;
  const alerts = await insights.checkWatchdog();

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].key, 'dropped-batches');
  // Each SQL check failed on its own and was logged, not thrown.
  assert.ok(state.errors.filter(m => /check failed: connection refused/.test(m)).length >= 4);
});

test('watchdog debounces each condition to once per UTC day', async () => {
  const { insights, state } = setup({
    reports: makeReports({ getRecentRateLimits: { ratelimited: '2', last_seen: ago(30) } })
  });

  let alerts = await insights.checkWatchdog();
  assert.deepEqual(alerts.map(a => a.key), ['rate-limited']);
  assert.equal(insights.debounceState().fired['rate-limited'], '2026-08-19');

  alerts = await insights.checkWatchdog();
  assert.deepEqual(alerts, [], 'same condition, same day: silent');

  // 23:59 the same UTC day: still silent.
  state.clock = new Date('2026-08-19T23:59:00Z');
  assert.deepEqual(await insights.checkWatchdog(), []);

  // Past midnight UTC: fires again.
  state.clock = new Date('2026-08-20T00:01:00Z');
  alerts = await insights.checkWatchdog();
  assert.deepEqual(alerts.map(a => a.key), ['rate-limited']);
  assert.equal(insights.debounceState().fired['rate-limited'], '2026-08-20');

  insights.resetDebounce();
  assert.deepEqual(insights.debounceState(), { fired: {}, lastDropped: null });
});

test('watchdog checks run in order and independently', async () => {
  const telemetry = makeTelemetry();
  const reports = makeReports({
    getErrorRateWindows: { recent_events: '40', recent_errors: '8', baseline_events: '1000', baseline_errors: '20' },
    getLatencyRegressions: new Error('timeout'),
    getRecentRateLimits: { ratelimited: '1', last_seen: ago(10) },
    getApiCreditTotals: { calls_total: '11000', calls_1h: '0', calls_24h: '0', calls_7d: '100', calls_month: '11000', ratelimited: '0', first_call: ago(40000) }
  });
  const { insights, state } = setup({ telemetry, reports });
  await insights.checkWatchdog();                 // baseline for the drop counter (and today's debounce)
  state.clock = new Date('2026-08-20T09:00:00Z'); // next day: everything may fire again
  telemetry.stats.dropped = 1;
  const alerts = await insights.checkWatchdog();
  // dropped-batches first because it needs no SQL; latency skipped because its query failed.
  assert.deepEqual(alerts.map(a => a.key), ['dropped-batches', 'error-spike', 'rate-limited', 'credit-budget']);
  assert.ok(state.errors.some(m => /latency-regression check failed: timeout/.test(m)));
});

test('buildWatchdogEmbed has one field per alert and colors by severity', () => {
  const { insights } = setup();
  const warning = insights.buildWatchdogEmbed([
    { key: 'rate-limited', severity: 'warning', title: 'CoinGecko rate limited', detail: 'three calls' }
  ]).toJSON();
  assert.equal(warning.title, '⚠️ Usage watchdog');
  assert.equal(warning.color, 0xffb638);
  assert.equal(warning.fields.length, 1);
  assert.match(warning.fields[0].name, /CoinGecko rate limited/);
  assert.equal(warning.fields[0].value, 'three calls');
  assert.match(warning.footer.text, /fires once per condition per day/);

  const critical = insights.buildWatchdogEmbed([
    { key: 'rate-limited', severity: 'warning', title: 'A', detail: 'a' },
    { key: 'error-spike', severity: 'critical', title: 'B', detail: 'b' }
  ]).toJSON();
  assert.equal(critical.color, 0xff5a76);
  assert.equal(critical.fields.length, 2);

  // An over-long detail is cut to Discord's field limit rather than rejected.
  const long = insights.buildWatchdogEmbed([
    { key: 'x', severity: 'warning', title: 'Long', detail: 'y'.repeat(3000) }
  ]).toJSON();
  assert.ok(long.fields[0].value.length <= 1024);
});

test('runWatchdog sends one embed with one field per alert and records the firing', async () => {
  const telemetry = makeTelemetry();
  const { insights, state } = setup({
    telemetry,
    reports: makeReports({
      getErrorRateWindows: { recent_events: '40', recent_errors: '8', baseline_events: '1000', baseline_errors: '20' },
      getRecentRateLimits: { ratelimited: '2', last_seen: ago(30) }
    })
  });

  const alerts = await insights.runWatchdog();
  assert.deepEqual(alerts.map(a => a.key), ['error-spike', 'rate-limited']);
  assert.equal(state.sent.length, 1);
  assert.equal(state.sent[0].embeds.length, 1);
  const json = state.sent[0].embeds[0].toJSON();
  assert.equal(json.fields.length, 2);
  assert.equal(json.color, 0xff5a76);

  const events = telemetry.events.filter(e => e.command === 'usage-watchdog');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].params.conditions, ['error-spike', 'rate-limited']);

  // Second run the same day: nothing new, nothing sent.
  assert.deepEqual(await insights.runWatchdog(), []);
  assert.equal(state.sent.length, 1);
});

test('runWatchdog sends nothing when nothing tripped', async () => {
  const { insights, state, telemetry } = setup();
  assert.deepEqual(await insights.runWatchdog(), []);
  assert.equal(state.sent.length, 0);
  assert.equal(telemetry.events.length, 0);
});

test('runWatchdog never throws and releases the debounce when delivery fails', async () => {
  const { insights, state } = setup({
    reports: makeReports({ getRecentRateLimits: { ratelimited: '2', last_seen: ago(30) } }),
    send: async () => { throw new Error('DMs closed'); }
  });
  assert.deepEqual(await insights.runWatchdog(), []);
  assert.ok(state.errors.some(m => /DMs closed/.test(m)));
  // Not marked as fired, so the next successful run can still deliver it.
  assert.equal(insights.debounceState().fired['rate-limited'], undefined);
  const again = await insights.checkWatchdog();
  assert.deepEqual(again.map(a => a.key), ['rate-limited']);
});

/* --------------------------------------------
    Scheduling and config
  -------------------------------------------- */

test('digestRule and watchdogRule reflect the defaults', () => {
  const { insights } = setup();
  assert.deepEqual(insights.digestRule(), { rule: '0 9 * * 1', tz: 'UTC' });
  assert.equal(insights.watchdogRule(), '*/30 * * * *');
});

test('digestRule clamps hour and day of week and carries the timezone', () => {
  const { insights } = setup({ config: { digest: { hour: 30, dayOfWeek: 9, timezone: 'America/Chicago' } } });
  assert.deepEqual(insights.digestRule(), { rule: '0 23 * * 6', tz: 'America/Chicago' });

  const negative = setup({ config: { digest: { hour: -4, dayOfWeek: -1 } } });
  assert.deepEqual(negative.insights.digestRule(), { rule: '0 0 * * 0', tz: 'UTC' });

  const garbage = setup({ config: { digest: { hour: 'noon', dayOfWeek: 'tuesday' } } });
  assert.deepEqual(garbage.insights.digestRule(), { rule: '0 9 * * 1', tz: 'UTC' });
});

test('watchdogRule clamps the interval to 5..60 minutes', () => {
  assert.equal(setup({ config: { watchdog: { intervalMinutes: 1 } } }).insights.watchdogRule(), '*/5 * * * *');
  assert.equal(setup({ config: { watchdog: { intervalMinutes: 15 } } }).insights.watchdogRule(), '*/15 * * * *');
  assert.equal(setup({ config: { watchdog: { intervalMinutes: 60 } } }).insights.watchdogRule(), '0 * * * *');
  assert.equal(setup({ config: { watchdog: { intervalMinutes: 240 } } }).insights.watchdogRule(), '0 * * * *');
  assert.equal(setup({ config: { watchdog: { intervalMinutes: 'often' } } }).insights.watchdogRule(), '*/30 * * * *');
});

test('config is deep-merged over the defaults and exposed', () => {
  const { insights } = setup({ config: { watchdog: { minErrors: 10 }, digest: { hour: 7 } } });
  assert.equal(insights.config.watchdog.minErrors, 10);
  assert.equal(insights.config.watchdog.minEvents, DEFAULT_CONFIG.watchdog.minEvents);
  assert.equal(insights.config.digest.hour, 7);
  assert.equal(insights.config.digest.days, 7);
  // The defaults themselves are untouched.
  assert.equal(DEFAULT_CONFIG.watchdog.minErrors, 5);
  assert.equal(DEFAULT_CONFIG.digest.hour, 9);
});

test('DEFAULT_CONFIG has the documented shape', () => {
  assert.deepEqual(Object.keys(DEFAULT_CONFIG).sort(), ['digest', 'watchdog']);
  assert.deepEqual(DEFAULT_CONFIG.digest, { enabled: true, dayOfWeek: 1, hour: 9, timezone: 'UTC', days: 7 });
  assert.deepEqual(Object.keys(DEFAULT_CONFIG.watchdog).sort(), [
    'enabled', 'errorRateFloor', 'errorRateMultiplier', 'errorWindowHours', 'intervalMinutes',
    'latencyFloorMs', 'latencyMinSamples', 'latencyMultiplier', 'latencyWindowHours',
    'minErrors', 'minEvents', 'rateLimitWindowHours'
  ]);
});

test('the watchdog thresholds reach the queries as configured', async () => {
  const { insights, reports } = setup({
    config: { watchdog: { errorWindowHours: 3, latencyWindowHours: 4, latencyMinSamples: 10, rateLimitWindowHours: 12 } }
  });
  await insights.checkWatchdog();
  assert.deepEqual(reports.calls.find(c => c[0] === 'getErrorRateWindows').slice(1), [3]);
  assert.deepEqual(reports.calls.find(c => c[0] === 'getLatencyRegressions').slice(1), [4, 10]);
  assert.deepEqual(reports.calls.find(c => c[0] === 'getRecentRateLimits').slice(1), [12]);
});

test('a forced check reports everything tripped without touching the debounce or the drop baseline', async () => {
  // /usage watchdog runs this on demand: it must show a condition the scheduler already reported
  // today, and it must not stop the scheduler from reporting it tomorrow or baseline the drops.
  const telemetry = makeTelemetry();
  telemetry.stats.dropped = 9;
  const { insights } = setup({
    telemetry,
    reports: makeReports({ getRecentRateLimits: { ratelimited: '2', last_seen: ago(30) } })
  });

  let alerts = await insights.checkWatchdog({ force: true });
  assert.deepEqual(alerts.map(a => a.key), ['dropped-batches', 'rate-limited']);
  assert.match(alerts[0].detail, /\*\*9\*\* events have been dropped since the last restart/);
  assert.deepEqual(insights.debounceState(), { fired: {}, lastDropped: null }, 'a forced run marks nothing');

  // The scheduled run still fires, and then a forced run still shows it.
  alerts = await insights.checkWatchdog();
  assert.deepEqual(alerts.map(a => a.key), ['rate-limited']);
  alerts = await insights.checkWatchdog({ force: true });
  assert.deepEqual(alerts.map(a => a.key), ['dropped-batches', 'rate-limited'], 'a forced run always states the total dropped since restart');
  assert.deepEqual(await insights.checkWatchdog(), [], 'and the scheduled debounce is intact');
});

/* --------------------------------------------
    What users have set up (feature snapshots)
  -------------------------------------------- */

test('digest reports the standing state with its change when snapshots exist', async () => {
  const { insights } = setup({
    reports: makeReports({
      getFeatureSnapshotDelta: () => ({
        latest: { alerts: '42', portfolio_users: '23', schedules: '9', watchlists: '34' },
        prior: { alerts: '40', portfolio_users: '23', schedules: '10', watchlists: '30' }
      })
    })
  });
  const { embed } = await insights.buildWeeklyDigest();
  const field = embed.toJSON().fields.find(f => f.name.startsWith('Set up'));
  assert.ok(field, 'expected a "Set up" field');
  assert.match(field.name, /vs 7 days ago/);
  assert.match(field.value, /Price alerts \*\*42\*\* \(▲ \+5%\)/);
  assert.match(field.value, /Portfolios \*\*23\*\* \(= 0%\)/);
  assert.match(field.value, /Scheduled posts \*\*9\*\* \(▼ 10%\)/);
  assert.match(field.value, /Watchlists \*\*34\*\* \(▲ \+13%\)/);
});

test('digest shows the standing state without deltas when only one snapshot exists, and skips it with none', async () => {
  const one = setup({
    reports: makeReports({
      getFeatureSnapshotDelta: () => ({ latest: { alerts: '3', portfolio_users: '1', schedules: '0', watchlists: '2' }, prior: null })
    })
  });
  const field = (await one.insights.buildWeeklyDigest()).embed.toJSON().fields.find(f => f.name.startsWith('Set up'));
  assert.ok(field);
  assert.equal(field.name, 'Set up');
  assert.match(field.value, /Price alerts \*\*3\*\* · Portfolios \*\*1\*\*/);
  assert.ok(!field.value.includes('▲'), 'no deltas without a prior snapshot');

  const none = setup({ reports: makeReports({ getFeatureSnapshotDelta: () => ({ latest: null, prior: null }) }) });
  const fields = (await none.insights.buildWeeklyDigest()).embed.toJSON().fields;
  assert.ok(!fields.some(f => f.name.startsWith('Set up')));
  assert.equal(none.state.errors.length, 0, 'an empty snapshot table is not an error');
});
