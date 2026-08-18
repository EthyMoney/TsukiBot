'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* --------------------------------------------

    Why this test reads main.js as text instead of requiring it

    main.js is still one big script: requiring it logs in to Discord, launches a puppeteer cluster,
    and binds an express server. It also exports nothing. So until the module split lands and the
    chart-interval helpers move into their own file, this test pulls the two data tables straight
    out of the main.js source text and mirrors the one pure function below.

    Reading the tables as text (rather than copying them here) means drift in main.js is caught:
    if someone adds an alias to CHART_INTERVAL_KEYS without a CHART_INTERVAL_MAP entry, or adds a
    mapping that is not a real TradingView interval code, these tests fail.

  -------------------------------------------- */

const MAIN_JS_PATH = path.join(__dirname, '..', 'main.js');
const mainSource = fs.readFileSync(MAIN_JS_PATH, 'utf8');

// Pulls a top-level `const NAME = <literal>;` out of the source and parses the literal. The
// literals in question are plain single-quoted string arrays/objects, so swapping the quote style
// makes them valid JSON. No eval, no importing main.js.
function extractLiteral(name, opening, closing) {
  const pattern = new RegExp(`const ${name} = (\\${opening}[\\s\\S]*?\\${closing});`);
  const match = mainSource.match(pattern);
  assert.ok(match, `Could not find "const ${name} = ..." in main.js. Did it get renamed or moved?`);

  const asJson = match[1]
    .replace(/'/g, '"')
    .replace(/,(\s*[\]}])/g, '$1');

  try {
    return JSON.parse(asJson);
  }
  catch (err) {
    assert.fail(`Could not parse ${name} from main.js as a plain literal: ${err.message}`);
  }
}

const CHART_INTERVAL_KEYS = extractLiteral('CHART_INTERVAL_KEYS', '[', ']');
const CHART_INTERVAL_MAP = extractLiteral('CHART_INTERVAL_MAP', '{', '}');

// MIRROR OF main.js `swapChartInterval`. Keep this in sync with main.js by hand until the chart
// helpers are extracted into a requireable module, at which point this copy should be deleted and
// the real function imported instead. The alias list it filters against is the live one read from
// main.js above, so only the four lines of logic below are duplicated.
function swapChartInterval(query, newInterval) {
  const tokens = query.split(' ').filter(token => token !== '' && !CHART_INTERVAL_KEYS.includes(token));
  tokens.push(newInterval);
  return tokens.join(' ');
}

/* --------------------------------------------

    The alias tables

  -------------------------------------------- */

test('CHART_INTERVAL_KEYS and CHART_INTERVAL_MAP were both found and are non-empty', () => {
  assert.ok(Array.isArray(CHART_INTERVAL_KEYS));
  assert.ok(CHART_INTERVAL_KEYS.length > 0);
  assert.equal(typeof CHART_INTERVAL_MAP, 'object');
  assert.ok(Object.keys(CHART_INTERVAL_MAP).length > 0);
});

test('every alias in CHART_INTERVAL_KEYS has a CHART_INTERVAL_MAP entry', () => {
  const missing = CHART_INTERVAL_KEYS.filter(key => !Object.prototype.hasOwnProperty.call(CHART_INTERVAL_MAP, key));
  assert.deepEqual(missing, [], `Aliases accepted by /c but not mapped to a TradingView interval: ${missing.join(', ')}`);
});

test('every CHART_INTERVAL_MAP key is an accepted alias', () => {
  const orphans = Object.keys(CHART_INTERVAL_MAP).filter(key => !CHART_INTERVAL_KEYS.includes(key));
  assert.deepEqual(orphans, [], `Mapped intervals that the alias list will never match: ${orphans.join(', ')}`);
});

test('every CHART_INTERVAL_MAP value is a valid TradingView interval code', () => {
  // TradingView accepts a minute count ("1", "240") or one of D / W / M.
  const valid = /^(\d+|D|W|M)$/;
  const invalid = Object.entries(CHART_INTERVAL_MAP).filter(([, value]) => !valid.test(value));
  assert.deepEqual(invalid, [], `Interval codes TradingView will not understand: ${JSON.stringify(invalid)}`);
});

test('CHART_INTERVAL_KEYS contains no duplicates', () => {
  assert.equal(new Set(CHART_INTERVAL_KEYS).size, CHART_INTERVAL_KEYS.length);
});

test('the aliases used by the chart buttons all resolve', () => {
  // These are the timeframes rendered as buttons under every chart (CHART_TIMEFRAME_BUTTONS in
  // main.js). If any of them stopped resolving, clicking a button would render the default 1h.
  for (const timeframe of ['15m', '1h', '4h', '1d', '1w']) {
    assert.ok(CHART_INTERVAL_KEYS.includes(timeframe), `${timeframe} is not an accepted alias`);
    assert.ok(CHART_INTERVAL_MAP[timeframe], `${timeframe} has no interval code`);
  }
  assert.equal(CHART_INTERVAL_MAP['15m'], '15');
  assert.equal(CHART_INTERVAL_MAP['1h'], '60');
  assert.equal(CHART_INTERVAL_MAP['4h'], '240');
  assert.equal(CHART_INTERVAL_MAP['1d'], 'D');
  assert.equal(CHART_INTERVAL_MAP['1w'], 'W');
});

/* --------------------------------------------

    swapChartInterval

  -------------------------------------------- */

test('swapChartInterval: replaces an interval that is already present', () => {
  assert.equal(swapChartInterval('btc 1h', '4h'), 'btc 4h');
  assert.equal(swapChartInterval('btc 1d', '15m'), 'btc 15m');
  // Aliases are dropped by name, not by position.
  assert.equal(swapChartInterval('daily btc', '1w'), 'btc 1w');
});

test('swapChartInterval: appends an interval to a query that has none', () => {
  assert.equal(swapChartInterval('btc', '1h'), 'btc 1h');
  assert.equal(swapChartInterval('eth binance', '4h'), 'eth binance 4h');
});

test('swapChartInterval: strips every interval alias, not just the first', () => {
  assert.equal(swapChartInterval('btc 1h 4h', '1d'), 'btc 1d');
});

test('swapChartInterval: preserves pair, exchange, and indicator tokens in order', () => {
  assert.equal(
    swapChartInterval('ethusdt binance 1h rsi macd wide', '4h'),
    'ethusdt binance rsi macd wide 4h'
  );
  assert.equal(
    swapChartInterval('btc kraken ichimoku bb', '1d'),
    'btc kraken ichimoku bb 1d'
  );
});

test('swapChartInterval: collapses extra whitespace between tokens', () => {
  assert.equal(swapChartInterval('btc   binance    1h', '4h'), 'btc binance 4h');
});

test('swapChartInterval: an empty replacement clears the interval (the buildChartControls case)', () => {
  // buildChartControls calls swapChartInterval(query, '') and trims, to get the interval-free base
  // query it stores in the button customId.
  assert.equal(swapChartInterval('btc binance 1h rsi', '').trim(), 'btc binance rsi');
  assert.equal(swapChartInterval('btc', '').trim(), 'btc');
  assert.equal(swapChartInterval('1h', '').trim(), '');
});

test('swapChartInterval: a base query round-trips through the button flow', () => {
  // What actually happens on a button click: buildChartControls strips the interval out of the
  // original query, stashes the rest in the customId, then handleChartButton swaps the clicked
  // timeframe back in.
  const originalQuery = 'ethusdt binance 15m rsi';
  const baseQuery = swapChartInterval(originalQuery.trim(), '').trim();

  assert.equal(baseQuery, 'ethusdt binance rsi');
  assert.equal(swapChartInterval(baseQuery, '4h'), 'ethusdt binance rsi 4h');
  assert.equal(swapChartInterval(baseQuery, '1d'), 'ethusdt binance rsi 1d');
});

test('swapChartInterval: every alias is recognized and removed', () => {
  for (const alias of CHART_INTERVAL_KEYS) {
    assert.equal(
      swapChartInterval(`btc ${alias}`, '1h'),
      'btc 1h',
      `alias "${alias}" was not stripped from the query`
    );
  }
});

test('swapChartInterval: alias matching is case sensitive', () => {
  // Documents current behavior rather than endorsing it: an uppercase alias survives the filter and
  // ends up alongside the new interval. See the note in the test report.
  assert.equal(swapChartInterval('btc 1H', '4h'), 'btc 1H 4h');
  assert.equal(swapChartInterval('BTC 1h', '4h'), 'BTC 4h');
});
