'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createStockHints, formatStockHint, normalizeName, parseStockButtonId, pickStock, stockButtonId
} = require('../src/stock-hint');

/* --------------------------------------------

    Stock hints for coin lookups that found nothing.

    The results below are shaped like Finnhub's /search answers for real queries. The point of
    the matching rules is to offer /stocks only when the query plainly names a company, so a
    coin typo never gets a stock suggested at it.

  -------------------------------------------- */

const APPLE = [
  { symbol: 'AAPL', description: 'Apple Inc.', type: 'Common Stock' },
  { symbol: 'APLE', description: 'Apple Hospitality REIT Inc', type: 'Common Stock' },
  { symbol: '603020.SS', description: 'Apple Flavor & Fragrance Group Co Ltd', type: 'Common Stock' }
];
const TSLA = [
  { symbol: 'TSLA', description: 'TESLA INC', type: 'Common Stock' },
  { symbol: 'TSLA.TO', description: 'TESLA INC - CDR', type: 'Canadian DR' }
];
const PEPE = [{ symbol: 'PPS.WA', description: 'Przedsiebiorstwo Przemyslu Spozywczego PEPEES SA', type: 'Common Stock' }];

test('normalizeName drops case, punctuation and legal suffixes', () => {
  assert.equal(normalizeName('Apple Inc.'), 'APPLE');
  assert.equal(normalizeName('Anthropic, PBC'), 'ANTHROPIC');
  assert.equal(normalizeName('NVIDIA Corporation'), 'NVIDIA');
  assert.equal(normalizeName('  apple '), 'APPLE');
});

test('a company name finds its own listing, not one that merely starts with it', () => {
  assert.deepEqual(pickStock('apple', APPLE), { symbol: 'AAPL', name: 'Apple Inc.', byTicker: false });
  assert.deepEqual(pickStock('NVIDIA', [{ symbol: 'NVDA', description: 'NVIDIA Corporation', type: 'Common Stock' }]),
    { symbol: 'NVDA', name: 'NVIDIA Corporation', byTicker: false });
});

test('an exact ticker matches, and only US listings are offered', () => {
  assert.deepEqual(pickStock('tsla', TSLA), { symbol: 'TSLA', name: 'TESLA INC', byTicker: true });
  assert.equal(pickStock('603020', APPLE), null);
});

test('a coin name inside a company name is not a match', () => {
  assert.equal(pickStock('pepe', PEPE), null);
  assert.equal(pickStock('bacon', []), null);
  assert.equal(pickStock('x', APPLE), null);
});

test('aliases send well-known names to the listed ticker', () => {
  assert.deepEqual(pickStock('google', [{ symbol: 'GOOGL', description: 'Alphabet Inc', type: 'Common Stock' }]),
    { symbol: 'GOOGL', name: 'Alphabet Inc', byTicker: false });
});

test('the hint names the company and the command', () => {
  assert.equal(formatStockHint({ symbol: 'AAPL', name: 'Apple Inc.', byTicker: false }),
    'Looking for the stock **Apple Inc. (AAPL)**? Crypto commands only know coins; use `/stocks AAPL`.');
});

test('button ids round-trip and reject anything that is not a ticker', () => {
  assert.equal(parseStockButtonId(stockButtonId('AAPL')), 'AAPL');
  assert.equal(parseStockButtonId('stocks:brk.b'), 'BRK.B');
  assert.equal(parseStockButtonId('stocks:'), null);
  assert.equal(parseStockButtonId('stocks:a b'), null);
  assert.equal(parseStockButtonId('chart:1d:aapl'), null);
});

/** A fake Finnhub client that answers from a table and counts calls. */
function fakeClient(table, { fail = false, silent = false } = {}) {
  const calls = [];
  return {
    calls,
    symbolSearch(q, opts, cb) {
      calls.push(q);
      if (silent) return;
      setImmediate(() => fail ? cb(new Error('429'), null) : cb(null, { count: (table[q] || []).length, result: table[q] || [] }));
    },
    quote(symbol, cb) {
      calls.push('quote ' + symbol);
      setImmediate(() => cb(null, (table.quotes || {})[symbol] || { c: 0, o: 0 }));
    }
  };
}

const noSleep = () => Promise.resolve();

test('lookup searches once and serves repeats from the cache, misses included', async () => {
  const client = fakeClient({ APPLE, BACON: [] });
  const hints = createStockHints({ client, sleep: noSleep });
  assert.deepEqual(await hints.lookup('apple'), { symbol: 'AAPL', name: 'Apple Inc.', byTicker: false });
  assert.deepEqual(await hints.lookup('APPLE'), { symbol: 'AAPL', name: 'Apple Inc.', byTicker: false });
  assert.equal(await hints.lookup('bacon'), null);
  assert.equal(await hints.lookup('bacon'), null);
  assert.deepEqual(client.calls, ['APPLE', 'BACON']);
  assert.deepEqual(hints.peek('apple'), { symbol: 'AAPL', name: 'Apple Inc.', byTicker: false });
  assert.equal(hints.peek('nvidia'), undefined);
});

test('concurrent lookups of one query share a single search', async () => {
  const client = fakeClient({ APPLE });
  const hints = createStockHints({ client, sleep: noSleep });
  const [a, b] = await Promise.all([hints.lookup('apple'), hints.lookup('Apple')]);
  assert.deepEqual(a, b);
  assert.equal(client.calls.length, 1);
});

test('a ticker-only match needs a trading quote; a name match does not', async () => {
  const client = fakeClient({
    TSLA,
    ANTH: [{ symbol: 'ANTH', description: 'ANTHERA PHARMACEUTICALS INC', type: 'Common Stock' }],
    APPLE,
    quotes: { TSLA: { c: 391.2, o: 388 } }
  });
  const hints = createStockHints({ client, sleep: noSleep });
  assert.deepEqual(await hints.lookup('tsla'), { symbol: 'TSLA', name: 'TESLA INC', byTicker: true });
  assert.equal(await hints.lookup('anth'), null);
  assert.deepEqual(await hints.lookup('apple'), { symbol: 'AAPL', name: 'Apple Inc.', byTicker: false });
  assert.deepEqual(client.calls, ['TSLA', 'quote TSLA', 'ANTH', 'quote ANTH', 'APPLE']);
});

test('searches are spaced apart so Finnhub does not reject a burst', async () => {
  let clock = 0;
  const waits = [];
  const client = fakeClient({});
  const hints = createStockHints({ client, now: () => clock, sleep: ms => { waits.push(ms); clock += ms; return Promise.resolve(); }, minGapMs: 1100 });
  await Promise.all([hints.lookup('one'), hints.lookup('two'), hints.lookup('three')]);
  assert.deepEqual(waits, [1100, 1100]);
});

test('a failed or silent search answers null, briefly cached, and never throws', async () => {
  let clock = 0;
  const failing = fakeClient({}, { fail: true });
  const hints = createStockHints({ client: failing, now: () => clock, sleep: noSleep });
  assert.equal(await hints.lookup('apple'), null);
  assert.equal(await hints.lookup('apple'), null);
  assert.equal(failing.calls.length, 1);
  clock += 6 * 60 * 1000;
  await hints.lookup('apple');
  assert.equal(failing.calls.length, 2);

  const silent = createStockHints({ client: fakeClient({}, { silent: true }), sleep: noSleep, timeoutMs: 20 });
  assert.equal(await silent.lookup('apple'), null);

  const none = createStockHints({ client: null });
  assert.equal(await none.lookup('apple'), null);
});
