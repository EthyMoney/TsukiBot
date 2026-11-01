/* ------------------------------------------------------------------------
 *
 *                       TsukiBot - src/ai-tools.js
 *
 * The market data Claude can look up while answering /ask, and the coin
 * fact sheet /why is written from.
 *
 * Every tool is read-only and reads the same caches the slash commands do.
 * main.js passes the data access in as `deps`, so nothing here imports the
 * caches, Discord or an API client, and the tools can be exercised in tests
 * with plain objects.
 *
 * Tool results are JSON. A tool never throws back into the runner: a failed
 * lookup comes back as {"error": "..."} so Claude can say what it could not
 * find instead of the whole answer failing.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const { betaTool } = require('@anthropic-ai/sdk/helpers/beta/json-schema');

/** Rounds to a readable number of significant figures, keeping small prices legible. */
function sig(value, digits = 6) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  return n === 0 ? 0 : Number(n.toPrecision(digits));
}

function pct(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
}

function day(value) {
  return value ? String(value).slice(0, 10) : null;
}

/** Percentage change for a window, from either the `_in_currency` or the plain CoinGecko field. */
function changeFor(coin, window) {
  const inCurrency = coin[`price_change_percentage_${window}_in_currency`];
  if (inCurrency != null) return inCurrency;
  return window === '24h' ? coin.price_change_percentage_24h : null;
}

/**
 * The figures for one coin, in a stable shape with rounded numbers.
 * @param {object} coin a CoinGecko /coins/markets row
 * @returns {object}
 */
function coinFacts(coin) {
  return {
    name: coin.name,
    symbol: (coin.symbol || '').toUpperCase(),
    coingecko_id: coin.id,
    market_cap_rank: coin.market_cap_rank || null,
    price_usd: sig(coin.current_price),
    market_cap_usd: sig(coin.market_cap, 4),
    volume_24h_usd: sig(coin.total_volume, 4),
    change_1h_pct: pct(changeFor(coin, '1h')),
    change_24h_pct: pct(changeFor(coin, '24h')),
    change_7d_pct: pct(changeFor(coin, '7d')),
    change_30d_pct: pct(changeFor(coin, '30d')),
    change_1y_pct: pct(changeFor(coin, '1y')),
    high_24h_usd: sig(coin.high_24h),
    low_24h_usd: sig(coin.low_24h),
    all_time_high_usd: sig(coin.ath),
    all_time_high_date: day(coin.ath_date),
    pct_below_all_time_high: pct(coin.ath_change_percentage),
    circulating_supply: sig(coin.circulating_supply, 6),
    max_supply: sig(coin.max_supply, 6),
    data_as_of: coin.last_updated || null
  };
}

/** The fact sheet as prompt lines, leaving out anything CoinGecko had no value for. */
function coinFactsText(facts) {
  const labels = {
    market_cap_rank: 'Market cap rank',
    price_usd: 'Price (USD)',
    market_cap_usd: 'Market cap (USD)',
    volume_24h_usd: '24h volume (USD)',
    change_1h_pct: '1h change %',
    change_24h_pct: '24h change %',
    change_7d_pct: '7d change %',
    change_30d_pct: '30d change %',
    change_1y_pct: '1y change %',
    high_24h_usd: '24h high (USD)',
    low_24h_usd: '24h low (USD)',
    all_time_high_usd: 'All-time high (USD)',
    all_time_high_date: 'All-time high date',
    pct_below_all_time_high: '% from all-time high',
    data_as_of: 'Data as of'
  };
  return Object.entries(labels)
    .filter(([key]) => facts[key] != null)
    .map(([key, label]) => `${label}: ${facts[key]}`)
    .join('\n');
}

const RANK_WINDOWS = ['1h', '24h', '7d', '30d'];

/**
 * Ranks coins from the market cache.
 * @param {Array<object>} coins CoinGecko market rows
 * @param {{sort_by: string, window?: string, limit?: number, top_n?: number}} options
 * @returns {Array<object>}
 */
function rankCoins(coins, { sort_by, window = '24h', limit = 10, top_n = 100 }) {
  const n = Math.max(1, Math.min(500, Math.round(Number(top_n) || 100)));
  const count = Math.max(1, Math.min(20, Math.round(Number(limit) || 10)));
  const span = RANK_WINDOWS.includes(window) ? window : '24h';

  const pool = (coins || []).filter(coin => coin && coin.market_cap_rank && coin.market_cap_rank <= n);
  let ranked;
  if (sort_by === 'gainers' || sort_by === 'losers') {
    // A thinly traded coin can show any percentage, so movers need some real volume behind them.
    ranked = pool.filter(coin => changeFor(coin, span) != null && (coin.total_volume || 0) >= 1e6);
    ranked.sort((a, b) => changeFor(b, span) - changeFor(a, span));
    if (sort_by === 'losers') ranked.reverse();
  }
  else {
    ranked = [...pool].sort((a, b) => a.market_cap_rank - b.market_cap_rank);
  }

  return ranked.slice(0, count).map(coin => ({
    rank: coin.market_cap_rank,
    name: coin.name,
    symbol: (coin.symbol || '').toUpperCase(),
    price_usd: sig(coin.current_price),
    [`change_${span}_pct`]: pct(changeFor(coin, span))
  }));
}

/**
 * Converts between coins and fiat currencies at CoinGecko and Open Exchange Rates prices.
 *
 * Fiat codes win over coin tickers that happen to match one, except BTC: Open Exchange Rates
 * lists a BTC rate, and nobody asking for BTC means that.
 *
 * @param {{amount: number, from: string, to: string}} input
 * @param {{resolveCoin: Function, forexRates: Function}} deps
 * @returns {Promise<object>}
 */
async function convertAmount({ amount, from, to }, deps) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return { error: 'amount must be a non-negative number' };

  const rates = deps.forexRates() || {};
  const resolveSide = async (code) => {
    const upper = String(code || '').trim().toUpperCase();
    if (!upper) return { error: 'missing currency' };
    if (upper !== 'BTC' && rates[upper]) {
      return { kind: 'fiat', code: upper, usd_price: 1 / rates[upper] };
    }
    const coin = await deps.resolveCoin(code);
    if (!coin || coin.current_price == null) return { error: `no price found for "${code}"` };
    return { kind: 'coin', code: (coin.symbol || '').toUpperCase(), name: coin.name, usd_price: coin.current_price };
  };

  const [source, target] = await Promise.all([resolveSide(from), resolveSide(to)]);
  if (source.error) return source;
  if (target.error) return target;

  return {
    amount: value,
    from: { ...source, usd_price: sig(source.usd_price) },
    to: { ...target, usd_price: sig(target.usd_price) },
    result: sig(value * source.usd_price / target.usd_price, 8)
  };
}

/** Wraps a tool body so a failure comes back to Claude as data rather than an exception. */
function safeRun(fn) {
  return async (input) => {
    try {
      const result = await fn(input || {});
      return JSON.stringify(result == null ? { error: 'no data available' } : result);
    }
    catch (err) {
      return JSON.stringify({ error: err && err.message ? err.message : String(err) });
    }
  };
}

/**
 * The runnable tools for /ask.
 *
 * @param {object} deps
 * @param {(query: string) => Promise<object|null>} deps.resolveCoin cache first, then one live lookup
 * @param {() => Array<object>} deps.marketCoins the cached CoinGecko market rows
 * @param {() => Promise<object>} deps.marketOverview global market figures and Fear & Greed
 * @param {() => object} deps.forexRates fiat rates per 1 USD, keyed by upper-case code
 * @param {() => Promise<Array<object>>} deps.trending CoinGecko's trending searches
 * @param {(base: string) => Promise<Array<object>>} deps.fundingRates perpetual funding by venue
 * @param {() => Promise<object>} deps.ethGas Etherscan gas oracle
 * @returns {Array<object>}
 */
function buildMarketTools(deps) {
  return [
    betaTool({
      name: 'get_coins',
      description: 'Current market data for up to 10 coins: price, market cap, rank, 24h volume, % change over ' +
        '1h/24h/7d/30d/1y, 24h high/low, all-time high and how far below it the price is, and supply. ' +
        'Accepts tickers (btc), names (bitcoin) or CoinGecko ids. A ticker shared by several coins usually resolves ' +
        'to the largest by market cap; check the returned name, and pass the CoinGecko id to be specific.',
      inputSchema: {
        type: 'object',
        properties: {
          coins: { type: 'array', items: { type: 'string' }, description: 'Tickers, names or CoinGecko ids, at most 10' }
        },
        required: ['coins'],
        additionalProperties: false
      },
      run: safeRun(async ({ coins }) => {
        const queries = (Array.isArray(coins) ? coins : []).slice(0, 10);
        if (queries.length === 0) return { error: 'no coins given' };
        return Promise.all(queries.map(async (query) => {
          const coin = await deps.resolveCoin(query);
          return coin ? coinFacts(coin) : { query, error: 'coin not found' };
        }));
      })
    }),

    betaTool({
      name: 'convert',
      description: 'Convert an amount between any two coins or fiat currencies (e.g. 0.5 ETH to EUR, 100 USD to SOL) at current prices.',
      inputSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          from: { type: 'string', description: 'Coin ticker or fiat currency code' },
          to: { type: 'string', description: 'Coin ticker or fiat currency code' }
        },
        required: ['amount', 'from', 'to'],
        additionalProperties: false
      },
      run: safeRun(input => convertAmount(input, deps))
    }),

    betaTool({
      name: 'get_market_overview',
      description: 'Whole-market figures: total crypto market cap and its 24h change, 24h volume, BTC and ETH dominance, ' +
        'number of active coins, and the Crypto Fear & Greed index.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: safeRun(() => deps.marketOverview())
    }),

    betaTool({
      name: 'rank_coins',
      description: 'List coins from the top of the market sorted by market cap, or the biggest gainers or losers over a window. ' +
        'Gainers and losers only include coins with at least $1M of 24h volume.',
      inputSchema: {
        type: 'object',
        properties: {
          sort_by: { type: 'string', enum: ['market_cap', 'gainers', 'losers'] },
          window: { type: 'string', enum: RANK_WINDOWS, description: 'Change window for gainers/losers (default 24h)' },
          limit: { type: 'integer', description: 'How many to return, 1-20 (default 10)' },
          top_n: { type: 'integer', description: 'Only consider the top N coins by market cap, 1-500 (default 100)' }
        },
        required: ['sort_by'],
        additionalProperties: false
      },
      run: safeRun(input => rankCoins(deps.marketCoins(), input))
    }),

    betaTool({
      name: 'get_trending',
      description: 'The coins people are searching for most on CoinGecko right now.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: safeRun(() => deps.trending())
    }),

    betaTool({
      name: 'get_funding_rates',
      description: 'Current perpetual swap funding rates for a coin on the exchanges the bot can reach. ' +
        'A positive rate means longs pay shorts. Some exchanges may be missing if they are unreachable.',
      inputSchema: {
        type: 'object',
        properties: { coin: { type: 'string', description: 'Ticker, e.g. BTC' } },
        required: ['coin'],
        additionalProperties: false
      },
      run: safeRun(async ({ coin }) => {
        const base = String(coin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!base) return { error: 'missing coin' };
        const rates = await deps.fundingRates(base);
        return rates.length ? { coin: base, rates } : { coin: base, error: 'no funding data found on any exchange' };
      })
    }),

    betaTool({
      name: 'get_eth_gas',
      description: 'Current Ethereum gas prices in gwei (safe, standard, fast) and the base fee.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: safeRun(() => deps.ethGas())
    })
  ];
}

module.exports = {
  buildMarketTools,
  coinFacts,
  coinFactsText,
  convertAmount,
  rankCoins
};
