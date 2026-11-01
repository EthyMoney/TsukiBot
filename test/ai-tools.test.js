'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMarketTools, coinFacts, coinFactsText, convertAmount, rankCoins } = require('../src/ai-tools');
const chartAi = require('../src/ai-chart');

/* --------------------------------------------

    The /ask market tools and the chart explanation helpers.

    Every figure Claude quotes in /ask comes out of these tools, so the arithmetic and the
    selection logic are pinned here rather than trusted to the model.

  -------------------------------------------- */

function coin(symbol, rank, price, extra = {}) {
  return {
    id: symbol + '-id',
    symbol,
    name: symbol.toUpperCase() + ' Coin',
    market_cap_rank: rank,
    current_price: price,
    total_volume: 5e6,
    price_change_percentage_24h: 0,
    ...extra
  };
}

const COINS = [
  coin('btc', 1, 77889.123, { price_change_percentage_7d_in_currency: -3.77, price_change_percentage_24h_in_currency: 0.89 }),
  coin('eth', 2, 2269.61, { price_change_percentage_7d_in_currency: -5.1, price_change_percentage_24h_in_currency: 1.24 }),
  coin('sol', 7, 95.68, { price_change_percentage_7d_in_currency: -6.75, price_change_percentage_24h_in_currency: -0.22 }),
  coin('ada', 18, 0.1936, { price_change_percentage_7d_in_currency: -6.85, price_change_percentage_24h_in_currency: 0.4 }),
  coin('thin', 9, 1, { price_change_percentage_7d_in_currency: -40, total_volume: 1000 }),
  coin('deep', 300, 1, { price_change_percentage_7d_in_currency: 90 })
];

const deps = {
  resolveCoin: async (query) => COINS.find(c => c.symbol === String(query).toLowerCase()) || null,
  forexRates: () => ({ USD: 1, EUR: 0.92, BTC: 0.0000128 })
};

test('coinFacts rounds figures and keeps the stable field names Claude is told about', () => {
  const facts = coinFacts(COINS[0]);
  assert.equal(facts.symbol, 'BTC');
  assert.equal(facts.price_usd, 77889.1);
  assert.equal(facts.change_7d_pct, -3.77);
  assert.equal(facts.change_24h_pct, 0.89);
  assert.ok(!coinFactsText(facts).includes('null'), 'missing values are left out of the prompt text');
});

test('rankCoins finds this week\'s worst performer among the top 20, ignoring thin volume', () => {
  const losers = rankCoins(COINS, { sort_by: 'losers', window: '7d', top_n: 20, limit: 2 });
  assert.deepEqual(losers.map(c => c.symbol), ['ADA', 'SOL'], 'the -40% coin has no real volume behind it');
  assert.equal(losers[0].change_7d_pct, -6.85);
});

test('rankCoins respects top_n and sorts by market cap by default', () => {
  const gainers = rankCoins(COINS, { sort_by: 'gainers', window: '7d', top_n: 100 });
  assert.ok(!gainers.some(c => c.symbol === 'DEEP'), 'rank 300 is outside the top 100');
  assert.deepEqual(rankCoins(COINS, { sort_by: 'market_cap', limit: 3 }).map(c => c.rank), [1, 2, 7]);
});

test('convertAmount handles coin to fiat, fiat to coin, and treats BTC as the coin', async () => {
  const ethToEur = await convertAmount({ amount: 0.5, from: 'eth', to: 'eur' }, deps);
  assert.equal(ethToEur.to.kind, 'fiat');
  assert.equal(ethToEur.result, Number((0.5 * 2269.61 * 0.92).toPrecision(8)));

  const usdToSol = await convertAmount({ amount: 100, from: 'USD', to: 'sol' }, deps);
  assert.equal(usdToSol.result, Number((100 / 95.68).toPrecision(8)));

  const btc = await convertAmount({ amount: 1, from: 'btc', to: 'usd' }, deps);
  assert.equal(btc.from.kind, 'coin', 'Open Exchange Rates lists BTC, but users mean the coin');
});

test('convertAmount reports what it could not find instead of guessing', async () => {
  assert.match((await convertAmount({ amount: 1, from: 'nope', to: 'usd' }, deps)).error, /no price found/);
  assert.match((await convertAmount({ amount: -1, from: 'btc', to: 'usd' }, deps)).error, /non-negative/);
});

test('a failing tool returns its error as data, so one bad lookup does not sink the answer', async () => {
  const tools = buildMarketTools({ ...deps, marketOverview: async () => { throw new Error('CoinGecko down'); } });
  const overview = tools.find(t => t.name === 'get_market_overview');
  assert.deepEqual(JSON.parse(await overview.run({})), { error: 'CoinGecko down' });
});

test('every /ask tool has a description and an object schema that forbids extra fields', () => {
  const tools = buildMarketTools(deps);
  assert.ok(tools.length >= 6);
  for (const tool of tools) {
    assert.ok(tool.description && tool.description.length > 20, `${tool.name} needs a real description`);
    assert.equal(tool.input_schema.type, 'object');
    assert.equal(tool.input_schema.additionalProperties, false, `${tool.name} should reject unexpected input`);
  }
});

/* --------------------------------------------
    Chart explanation helpers
  -------------------------------------------- */

test('the Explain button customId survives an exchange-qualified pair and stays under 100 bytes', () => {
  const id = chartAi.encodeExplainId('240', 'binance:btcusdt rsi macd');
  assert.deepEqual(chartAi.decodeExplainId(id), { intervalCode: '240', baseQuery: 'binance:btcusdt rsi macd' });
  assert.equal(chartAi.encodeExplainId('D', 'x'.repeat(100)), null);
  assert.equal(chartAi.decodeExplainId('chart:4h:btcusd'), null, 'timeframe buttons are not explain buttons');
});

test('parseChartQuery separates the pair, exchange and indicators', () => {
  assert.deepEqual(chartAi.parseChartQuery('binance:ethusdt rsi macd wide'),
    { pairToken: 'ethusdt', exchange: 'binance', studies: ['RSI', 'MACD'] });
  assert.deepEqual(chartAi.parseChartQuery('btcusd'), { pairToken: 'btcusd', exchange: null, studies: [] });
});

test('findMarketSymbol accepts USD for USDT and a bare ticker, and ignores derivatives', () => {
  const markets = {
    'ETH/USDT': { symbol: 'ETH/USDT' },
    'ETH/BTC': { symbol: 'ETH/BTC' },
    'BTC/USDT:USDT': { symbol: 'BTC/USDT:USDT' }
  };
  assert.equal(chartAi.findMarketSymbol(markets, 'ethusd'), 'ETH/USDT');
  assert.equal(chartAi.findMarketSymbol(markets, 'eth'), 'ETH/USDT');
  assert.equal(chartAi.findMarketSymbol(markets, 'ethbtc'), 'ETH/BTC');
  assert.equal(chartAi.findMarketSymbol(markets, 'btcusd'), null, 'only the perpetual lists BTC here');
});

test('RSI matches the textbook values for a steady rise and a steady fall', () => {
  const up = Array.from({ length: 40 }, (_, i) => 100 + i);
  const down = Array.from({ length: 40 }, (_, i) => 100 - i);
  assert.equal(chartAi.rsi(up), 100);
  assert.equal(chartAi.rsi(down), 0);
});

test('MACD is zero on a flat series', () => {
  const flat = Array(60).fill(50);
  const m = chartAi.macd(flat);
  assert.ok(Math.abs(m.line) < 1e-9 && Math.abs(m.signal) < 1e-9 && Math.abs(m.histogram) < 1e-9);
});

test('summarizeCandles reports the visible window, not the whole fetch', () => {
  const start = Date.parse('2026-10-01T00:00:00Z');
  // 300 candles: the first 200 at 200, the last 100 rising from 100 to 199.
  const rows = Array.from({ length: 300 }, (_, i) => {
    const close = i < 200 ? 200 : 100 + (i - 200);
    return [start + i * 3600e3, close, close + 1, close - 1, close, 10];
  });
  const text = chartAi.summarizeCandles(rows, { symbol: 'TST/USDT', exchange: 'Binance', timeframeLabel: '1-hour' });
  assert.match(text, /roughly the last 100/);
  assert.match(text, /Range across the visible candles: high 200, low 99/);
  assert.match(text, /SMA200 /, 'indicators still use the full history');
  assert.equal(chartAi.summarizeCandles(rows.slice(0, 10), { symbol: 'x', exchange: 'y', timeframeLabel: 'z' }), null);
});
