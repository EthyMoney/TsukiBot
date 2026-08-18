'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const telemetry = require('../src/telemetry');

/* --------------------------------------------

    Telemetry write path.

    The functions under test here decide what a usage event actually contains, so a bug in them
    is silent: the bot keeps working, the table keeps filling, and every report built on top is
    quietly wrong. That is the case for pinning them.

    Nothing here touches a database. telemetry.init is never called, which leaves the module
    pool-less, and every record* function returns early in that state - which is itself the first
    thing worth proving.

  -------------------------------------------- */

test('recording is inert until a pool is provided', () => {
  // A bot started with no database must not accumulate events in memory forever.
  assert.doesNotThrow(() => telemetry.recordCommand({ commandName: 'cg', user: { id: '1' }, options: { data: [] } }));
  assert.equal(telemetry.getWriterStats().buffered, 0);
});

/* ---------- flattenOptions ---------- */

test('flattenOptions reads a flat option list', () => {
  const { params, subcommand } = telemetry.flattenOptions([
    { name: 'coin', type: 3, value: 'btc' },
    { name: 'amount', type: 10, value: 1.5 }
  ]);
  assert.deepEqual(params, { coin: 'btc', amount: 1.5 });
  assert.equal(subcommand, null);
});

test('flattenOptions descends into a subcommand', () => {
  // This is the bug that produced "show: undefined" in the logs: a subcommand is an option of
  // type 1 with no value of its own, carrying the real arguments underneath.
  const { params, subcommand } = telemetry.flattenOptions([
    { name: 'set', type: 1, options: [{ name: 'coin', type: 3, value: 'eth' }, { name: 'amount', type: 10, value: 2 }] }
  ]);
  assert.equal(subcommand, 'set');
  assert.deepEqual(params, { coin: 'eth', amount: 2 });
});

test('flattenOptions descends into a subcommand group', () => {
  const { params, subcommand } = telemetry.flattenOptions([
    { name: 'group', type: 2, options: [{ name: 'inner', type: 1, options: [{ name: 'coin', type: 3, value: 'ada' }] }] }
  ]);
  assert.equal(subcommand, 'group inner');
  assert.deepEqual(params, { coin: 'ada' });
});

test('flattenOptions records a valueless subcommand', () => {
  const { params, subcommand } = telemetry.flattenOptions([{ name: 'show', type: 1, options: [] }]);
  assert.equal(subcommand, 'show');
  assert.deepEqual(params, {});
});

test('flattenOptions truncates long free text', () => {
  const long = 'x'.repeat(1000);
  const { params } = telemetry.flattenOptions([{ name: 'text', type: 3, value: long }]);
  assert.equal(params.text.length, telemetry.MAX_PARAM_CHARS);
});

test('flattenOptions skips options the user did not supply', () => {
  const { params } = telemetry.flattenOptions([
    { name: 'coin', type: 3, value: 'btc' },
    { name: 'vs', type: 3, value: undefined },
    { name: 'exchange', type: 3, value: null }
  ]);
  assert.deepEqual(params, { coin: 'btc' }, 'absent options must not become null-valued keys');
});

test('flattenOptions tolerates a missing option list', () => {
  assert.deepEqual(telemetry.flattenOptions(undefined), { params: {}, subcommand: null });
});

/* ---------- normalizeCoinToken ---------- */

test('normalizeCoinToken uppercases a plain ticker', () => {
  assert.equal(telemetry.normalizeCoinToken('btc'), 'BTC');
});

test('normalizeCoinToken strips an exchange prefix', () => {
  assert.equal(telemetry.normalizeCoinToken('binance:btcusdt'), 'BTC');
});

test('normalizeCoinToken strips a separator', () => {
  assert.equal(telemetry.normalizeCoinToken('btc/usd'), 'BTC');
  assert.equal(telemetry.normalizeCoinToken('eth-usd'), 'ETH');
});

test('normalizeCoinToken strips a quote suffix', () => {
  assert.equal(telemetry.normalizeCoinToken('btcusdt'), 'BTC');
  assert.equal(telemetry.normalizeCoinToken('ethusd'), 'ETH');
});

test('normalizeCoinToken never reduces a ticker to nothing', () => {
  // USD and BTC are themselves quote suffixes. Stripping blindly would erase them.
  assert.equal(telemetry.normalizeCoinToken('btc'), 'BTC');
  assert.equal(telemetry.normalizeCoinToken('usd'), 'USD');
  assert.equal(telemetry.normalizeCoinToken('eth'), 'ETH');
});

test('normalizeCoinToken rejects contract addresses', () => {
  // Otherwise every address queried becomes its own entry and floods the top-coins report.
  assert.equal(telemetry.normalizeCoinToken('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), null);
});

test('normalizeCoinToken rejects non-tickers', () => {
  assert.equal(telemetry.normalizeCoinToken(''), null);
  assert.equal(telemetry.normalizeCoinToken('   '), null);
  assert.equal(telemetry.normalizeCoinToken('hello world'), null);
  assert.equal(telemetry.normalizeCoinToken(null), null);
  assert.equal(telemetry.normalizeCoinToken(42), null);
});

/* ---------- extractCoins ---------- */

test('extractCoins reads the standard coin option', () => {
  assert.deepEqual(telemetry.extractCoins('price', { coin: 'btc' }), ['BTC']);
});

test('extractCoins splits a multi-coin value', () => {
  assert.deepEqual(telemetry.extractCoins('cg', { coins: 'btc eth,ada' }), ['BTC', 'ETH', 'ADA']);
});

test('extractCoins reads both sides of a comparison', () => {
  assert.deepEqual(telemetry.extractCoins('compare', { coin1: 'btc', coin2: 'eth' }), ['BTC', 'ETH']);
});

test('extractCoins reads both sides of a conversion', () => {
  assert.deepEqual(telemetry.extractCoins('convert', { from: 'btc', to: 'eur', amount: 1 }), ['BTC', 'EUR']);
});

test('extractCoins parses the pair out of a chart query', () => {
  assert.deepEqual(telemetry.extractCoins('c', { query: 'btcusd rsi' }), ['BTC']);
  assert.deepEqual(telemetry.extractCoins('c', { query: 'binance:ethusdt macd' }), ['ETH']);
});

test('extractCoins ignores an /eth wallet address', () => {
  // /eth and /c share the option name "query" but only one of them holds a coin.
  assert.deepEqual(
    telemetry.extractCoins('eth', { query: '0x169381506870283cbABC52034E4ECc123f3FAD02' }),
    []
  );
});

test('extractCoins deduplicates', () => {
  assert.deepEqual(telemetry.extractCoins('cg', { coins: 'btc btc BTC' }), ['BTC']);
});

test('extractCoins ignores unrelated options', () => {
  assert.deepEqual(telemetry.extractCoins('translate', { text: 'hello there' }), []);
  assert.deepEqual(telemetry.extractCoins('portfolio', { amount: 5 }), []);
});

test('extractCoins tolerates missing params', () => {
  assert.deepEqual(telemetry.extractCoins('price', null), []);
  assert.deepEqual(telemetry.extractCoins('price', {}), []);
});

/* ---------- classifyError ---------- */

test('classifyError prefers a numeric Discord code', () => {
  assert.equal(telemetry.classifyError({ code: 10062 }), '10062');
});

test('classifyError strips ids so one fault does not become many', () => {
  const kind = telemetry.classifyError(new Error('Failed to fetch coin 1234567 for user 987654321'));
  assert.equal(kind.includes('1234567'), false, 'numeric ids must be masked');
  assert.match(kind, /Error: Failed to fetch coin # for user #/);
});

test('classifyError strips hex addresses', () => {
  const kind = telemetry.classifyError(new Error('bad token 0x2260fac5e5542a773aa44f'));
  assert.match(kind, /0x#/);
});

test('classifyError keeps only the first line', () => {
  const kind = telemetry.classifyError(new Error('boom\n    at somewhere.js:1:1\n    at more'));
  assert.equal(kind.includes('at somewhere'), false);
});

test('classifyError handles a missing error', () => {
  assert.equal(telemetry.classifyError(null), 'unknown');
  assert.equal(telemetry.classifyError(undefined), 'unknown');
});

test('classifyError stays within the column width', () => {
  const kind = telemetry.classifyError(new Error('y'.repeat(500)));
  assert.ok(kind.length <= 160, `error_kind is VARCHAR(160), got ${kind.length}`);
});

/* ---------- buildInsert ---------- */

test('buildInsert numbers placeholders across every row', () => {
  const events = [
    { occurredAt: new Date(0), eventType: 'command', command: 'cg', userId: '1', outcome: 'ok' },
    { occurredAt: new Date(0), eventType: 'command', command: 'mc', userId: '2', outcome: 'ok' }
  ];
  const { text, values } = telemetry.buildInsert(events);

  const columnCount = telemetry.COLUMNS.length;
  assert.equal(values.length, columnCount * 2, 'one value per column per row');
  assert.ok(text.includes('$1,'), 'first row starts at $1');
  assert.ok(text.includes('$' + (columnCount + 1) + ','), 'second row continues the numbering');
  assert.ok(text.includes('$' + columnCount * 2 + ')'), 'last placeholder matches the value count');
});

test('buildInsert serializes params and leaves empty arrays null', () => {
  const { values } = telemetry.buildInsert([{
    occurredAt: new Date(0), eventType: 'command', command: 'price', userId: '1',
    params: { coin: 'btc' }, coins: [], outcome: 'ok'
  }]);
  const paramsIndex = telemetry.COLUMNS.indexOf('params');
  const coinsIndex = telemetry.COLUMNS.indexOf('coins');
  assert.equal(values[paramsIndex], '{"coin":"btc"}', 'params must be JSON text for a jsonb column');
  assert.equal(values[coinsIndex], null, 'an empty coins array should be NULL, not {}');
});

test('buildInsert passes a populated coins array through as an array', () => {
  const { values } = telemetry.buildInsert([{
    occurredAt: new Date(0), eventType: 'command', command: 'price', userId: '1',
    coins: ['BTC', 'ETH'], outcome: 'ok'
  }]);
  assert.deepEqual(values[telemetry.COLUMNS.indexOf('coins')], ['BTC', 'ETH']);
});

test('buildInsert targets the right table and column list', () => {
  const { text } = telemetry.buildInsert([{ occurredAt: new Date(0), command: 'x', userId: '1' }]);
  assert.match(text, /INSERT INTO tsukibot\.usage_events/);
  for (const column of telemetry.COLUMNS) {
    assert.ok(text.includes(column), `column ${column} missing from the insert`);
  }
});
