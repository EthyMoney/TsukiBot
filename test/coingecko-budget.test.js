'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* --------------------------------------------

    CoinGecko credit budget.

    A demo key allows 10,000 credits a month, and one request is one credit. The scheduled work
    alone used to spend about 96,000: the market cache paged through all ~16,000 listed coins
    (65 requests) every 30 minutes, and the price alert scan spent a credit every single minute
    whenever any alert existed.

    None of that was visible in a test. It is the kind of regression that costs nothing in CI and
    silently exhausts a quota in production, so this file does the arithmetic on the constants the
    bot actually ships with, and fails if a change puts the scheduled baseline back over budget.

    These are the FIXED costs - work the bot does on a timer whether or not anyone uses it. User
    commands spend on top, which is exactly why the baseline has to leave headroom.

  -------------------------------------------- */

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

const DEMO_MONTHLY_CREDITS = 10000;
const DAYS_PER_MONTH = 30.4;

/**
 * Reads a numeric constant out of main.js, so the test measures the shipped value rather than a
 * copy that can drift.
 *
 * The whole declaration is evaluated with an empty environment, not pattern-matched for a number:
 * these are written as `Math.max(floor, parseInt(process.env.X, 10) || default)`, and picking the
 * first digits out of that yields the floor instead of the default.
 */
function readConstant(name) {
  const match = new RegExp(`const ${name} = ([^;]+);`).exec(mainSource);
  assert.ok(match, `could not find the ${name} constant in main.js`);
  return Function('process', '"use strict"; return (' + match[1] + ')')({ env: {} });
}

/** Minutes between runs of a scheduled job, from its cron expression in main.js. */
function readScheduleMinutes(jobName) {
  const pattern = new RegExp(`scheduleJob\\('([^']+)'[^)]*?${jobName}`);
  const match = pattern.exec(mainSource);
  assert.ok(match, `could not find the schedule for ${jobName}`);
  const cron = match[1];

  const everyNMinutes = /^\*\/(\d+) \* \* \* \*$/.exec(cron);
  if (everyNMinutes) return Number(everyNMinutes[1]);
  if (cron === '* * * * *') return 1;
  const everyNHours = /^\d+ \*\/(\d+) \* \* \*$/.exec(cron);
  if (everyNHours) return Number(everyNHours[1]) * 60;
  assert.fail(`unrecognised cron expression for ${jobName}: "${cron}"`);
}

test('the market cache is capped instead of walking every listed coin', () => {
  const maxPages = readConstant('CG_MAX_PAGES');
  assert.ok(maxPages >= 1, 'at least one page must be fetched');
  assert.ok(maxPages <= 20,
    `CG_MAX_PAGES is ${maxPages}. Each page is 250 coins and a full sweep of CoinGecko is ~65 ` +
    'pages, which at a 30 minute cadence is roughly ten times a demo key\'s entire monthly quota.');
});

test('the cache pass no longer spends a credit on /coins/list', () => {
  // That call existed only to compute a progress percentage, and cost one credit on every pass.
  const passStart = mainSource.indexOf('async function runCGDataPass');
  assert.notEqual(passStart, -1, 'runCGDataPass not found');
  const passBody = mainSource.slice(passStart, passStart + 4000);
  assert.ok(!passBody.includes('cgFetch(\'/coins/list'),
    'runCGDataPass fetches /coins/list again; that is one wasted credit per pass for a progress bar');
});

test('the pagination loop actually honors the page cap', () => {
  // A cap that the loop condition ignores is worse than no cap, because it reads as safe.
  const passStart = mainSource.indexOf('async function runCGDataPass');
  const passBody = mainSource.slice(passStart, passStart + 6000);
  assert.match(passBody, /while \(lastResSize == 250 && page <= CG_MAX_PAGES\)/,
    'the do/while must terminate on CG_MAX_PAGES, not only on a short page');
});

test('scheduled CoinGecko work stays inside the demo quota', () => {
  const maxPages = readConstant('CG_MAX_PAGES');
  const cacheEveryMinutes = readScheduleMinutes('getCGData');
  const alertIntervalMs = readConstant('ALERT_UNCACHED_INTERVAL_MS');

  const cachePassesPerDay = (24 * 60) / cacheEveryMinutes;
  const cacheCallsPerDay = cachePassesPerDay * maxPages;

  // Alerts on cached coins are free; they ride the cache refresh. This is the ceiling that applies
  // only while an alert exists on a coin outside the pre-cached pages.
  const uncachedAlertCallsPerDay = (24 * 60 * 60 * 1000) / alertIntervalMs;

  // /coins/list, twice a day, for the full coin listing used by autocomplete and id resolution.
  const coinListCallsPerDay = 2;

  const baselinePerDay = cacheCallsPerDay + coinListCallsPerDay;
  const worstCasePerDay = baselinePerDay + uncachedAlertCallsPerDay;
  const worstCasePerMonth = worstCasePerDay * DAYS_PER_MONTH;

  assert.ok(worstCasePerMonth < DEMO_MONTHLY_CREDITS,
    `scheduled CoinGecko work costs up to ~${Math.round(worstCasePerMonth)} credits/month ` +
    `(${Math.round(worstCasePerDay)}/day), over the ${DEMO_MONTHLY_CREDITS} demo allowance. ` +
    `Cache: ${maxPages} pages every ${cacheEveryMinutes}min. ` +
    `Uncached alerts: every ${alertIntervalMs / 60000}min.`);

  // Fixed costs must not consume the whole quota, or every user command pushes it over. Measured
  // against the worst case, since that is the state the bot can actually end up in.
  assert.ok(worstCasePerMonth < DEMO_MONTHLY_CREDITS * 0.8,
    `scheduled work uses ${Math.round(worstCasePerMonth / DEMO_MONTHLY_CREDITS * 100)}% of the ` +
    'quota at worst, leaving too little headroom for user commands');
});

test('alerts cost nothing when every watched coin is in the cache', () => {
  // The normal case, and the whole point of following the cache: an alert on a top-1,000 coin
  // spends no credits at all. A regression here would be invisible until the quota ran out.
  const scanStart = mainSource.indexOf('async function runPriceAlertScan');
  const scanBody = mainSource.slice(scanStart, mainSource.indexOf('\n}', scanStart));

  assert.match(scanBody, /const uncached = coinIds\.filter\(id => prices\[id\] === undefined\)/,
    'the scan must work out which coins the cache cannot price');
  assert.match(scanBody, /if \(uncached\.length > 0 && Date\.now\(\) - lastAlertLiveFetch >= ALERT_UNCACHED_INTERVAL_MS\)/,
    'the fetch must be conditional on there being uncached coins, not run on a bare timer');

  // The request must cover only the uncached ids. Sending every watched coin would charge for
  // prices the cache already had.
  assert.ok(scanBody.includes('uncached.slice(i, i + CHUNK_SIZE)'),
    'the live fetch should request only the uncached coins');
  assert.ok(!scanBody.includes('coinIds.slice(i, i + CHUNK_SIZE)'),
    'the live fetch must not request every watched coin');
});

test('price alerts cannot fall back to a per-minute live fetch', () => {
  // The scan runs every minute. Any path that fetches on something other than the interval puts
  // the cost straight back to 1,440 a day, which is more than four times the daily budget.
  const scanStart = mainSource.indexOf('async function runPriceAlertScan');
  assert.notEqual(scanStart, -1, 'runPriceAlertScan not found');
  const scanBody = mainSource.slice(scanStart, mainSource.indexOf('\n}', scanStart));

  assert.match(scanBody, /lastAlertLiveFetch >= ALERT_UNCACHED_INTERVAL_MS/,
    'the live quote fetch must be gated on ALERT_UNCACHED_INTERVAL_MS');

  const fetchIndex = scanBody.indexOf('cgFetch(`/simple/price');
  assert.notEqual(fetchIndex, -1, 'the alert scan should still be able to fetch live quotes');
  const gateIndex = scanBody.indexOf('lastAlertLiveFetch >= ALERT_UNCACHED_INTERVAL_MS');
  assert.ok(gateIndex < fetchIndex, 'the interval gate must come before the fetch');

  assert.ok(scanBody.includes('findCachedCoinById'),
    'the scan should price from the market cache first, which costs nothing');
});

test('slow-moving endpoints are cached rather than fetched per command', () => {
  // /global and /search/trending are reachable from commands and from scheduled posts that can run
  // every 30 minutes in every server, so uncached they scale with usage without any ceiling.
  assert.match(mainSource, /if \(cgGlobalCache\.data && Date\.now\(\) - cgGlobalCache\.at < CG_GLOBAL_CACHE_MS\)/,
    '/global must be served from a TTL cache');
  assert.match(mainSource, /Date\.now\(\) - cgTrendingCache\.at >= CG_TRENDING_CACHE_MS/,
    '/search/trending must be served from a TTL cache');
});

test('every CoinGecko request is recorded, so spend is measured rather than estimated', () => {
  // cgFetch is the only place requests are made, which is what makes the accounting exact.
  const fetchStart = mainSource.indexOf('async function cgFetch');
  assert.notEqual(fetchStart, -1, 'cgFetch not found');
  const fetchBody = mainSource.slice(fetchStart, fetchStart + 2000);
  assert.match(fetchBody, /telemetry\.recordSystemEvent\('coingecko-call'/,
    'cgFetch must record each call, or /usage credits has nothing to report');
  assert.match(fetchBody, /ratelimited/, 'a 429 still spends the request and should be distinguishable');
});

test('coins outside the cached pages are still reachable', () => {
  // The page cap is only acceptable because nothing becomes unreachable; it just moves from
  // pre-loaded to fetched on demand.
  assert.match(mainSource, /async function resolveCoin\(/, 'single-coin fallback resolver missing');
  assert.match(mainSource, /async function resolveCoinsByIds\(/, 'batched fallback resolver missing');
  assert.ok(!/const coin = findCachedCoin\(coinInput\)/.test(mainSource),
    'a command still reads the cache directly, so it would fail for coins past the page cap');
});

test('autocomplete still covers the full coin list, not just the cached pages', () => {
  // cgCoinList carries {id, symbol, name} for every listed coin and costs no credits to search,
  // so shrinking the market cache must not shrink discovery.
  const suggestStart = mainSource.indexOf('function getCoinSuggestions');
  assert.notEqual(suggestStart, -1, 'getCoinSuggestions not found');
  const body = mainSource.slice(suggestStart, mainSource.indexOf('\n}', suggestStart));
  assert.ok(body.includes('cgCoinList'),
    'autocomplete only searches the market cache, so it would stop suggesting most coins');
});
