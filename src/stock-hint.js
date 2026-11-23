'use strict';

/* --------------------------------------------

    Stock hints for coin lookups that found nothing.

    People ask the crypto commands for stocks ("apple", "nvidia", "anthropic"). When a coin
    lookup finds nothing, this asks Finnhub's symbol search whether the query is a listed
    company, so the reply can point at /stocks with a one-tap button instead of only offering
    coin typos.

    Only confident matches count: the exact ticker, or the company name once "Inc", "Corp" and
    the like are dropped. "Apple" finds Apple Inc. (AAPL) but not Apple Hospitality REIT, and
    "pepe" finds nothing even though a Polish company's name contains it. Only US listings
    (no exchange suffix such as ".TO") are offered, because /stocks quotes those.

    Short tickers collide with coins and dead listings all the time (LYNX is a coin and a
    company; ANTH is a delisted drug maker), so a match on the ticker alone is marked as such
    and only kept when a quote shows the stock is trading. The caller also drops it when
    CoinGecko knows a coin with that exact ticker.

    Answers are cached for 12 hours, misses included, so a dead coin in a scheduled post does
    not cost a search every half hour. Searches run one at a time a little over a second apart,
    because Finnhub's free tier rejects bursts, and give up after a few seconds so a slow
    answer never holds the not-found reply back. A failed search is cached for 5 minutes only.

  -------------------------------------------- */

const CACHE_MS = 12 * 60 * 60 * 1000;
const ERROR_CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 3000;
const MIN_GAP_MS = 1100;
const MAX_CACHE_ENTRIES = 2000;

/** Security types /stocks can quote. */
const STOCK_TYPES = new Set(['Common Stock', 'ADR', 'ETP', 'REIT']);

/** Well-known names whose company is listed under another name. */
const ALIASES = {
  GOOGLE: 'GOOGL',
  FACEBOOK: 'META',
  INSTAGRAM: 'META'
};

const NAME_NOISE = /\b(INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|LIMITED|LTD|PLC|PBC|HOLDINGS?|GROUP|SA|NV|AG|SE|THE|CLASS [A-C]|CL [A-C])\b/g;

/**
 * Upper-cases a query or company name and drops punctuation and legal suffixes, so
 * "Apple Inc." and "apple" compare equal.
 * @param {string} text
 * @returns {string}
 */
function normalizeName(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(NAME_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A symbol /stocks can take: letters, digits, dots and dashes, as Discord customIds carry it. */
function isStockSymbol(symbol) {
  return typeof symbol === 'string' && /^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(symbol);
}

/**
 * Picks the listing a query clearly names out of Finnhub search results, or null.
 * @param {string} query what the user typed
 * @param {Array<{symbol?: string, description?: string, type?: string}>} results
 * @returns {{symbol: string, name: string, byTicker: boolean}|null}
 */
function pickStock(query, results) {
  const wanted = normalizeName(query);
  if (wanted.length < 2) return null;
  const aliased = ALIASES[wanted.replace(/ /g, '')];
  const listings = (results || []).filter(r => r && typeof r.symbol === 'string' && !r.symbol.includes('.')
    && STOCK_TYPES.has(r.type) && isStockSymbol(r.symbol.toUpperCase()));
  const compact = wanted.replace(/ /g, '');
  const match = listings.find(r => r.symbol.toUpperCase() === (aliased || compact))
    || listings.find(r => normalizeName(r.description) === wanted);
  if (!match) return null;
  const byName = !aliased && normalizeName(match.description) === wanted;
  return { symbol: match.symbol.toUpperCase(), name: String(match.description || match.symbol).trim(), byTicker: !aliased && !byName };
}

/**
 * The line added under a not-found reply.
 * @param {{symbol: string, name: string}} stock
 * @returns {string}
 */
function formatStockHint(stock) {
  return `Looking for the stock **${stock.name} (${stock.symbol})**? Crypto commands only know coins; use \`/stocks ${stock.symbol}\`.`;
}

const BUTTON_PREFIX = 'stocks:';

/** The customId of a quick-tap /stocks button. */
function stockButtonId(symbol) {
  return BUTTON_PREFIX + symbol;
}

/** The symbol a quick-tap /stocks button carries, or null when the customId is not one. */
function parseStockButtonId(customId) {
  if (typeof customId !== 'string' || !customId.startsWith(BUTTON_PREFIX)) return null;
  const symbol = customId.slice(BUTTON_PREFIX.length).toUpperCase();
  return isStockSymbol(symbol) ? symbol : null;
}

/**
 * @param {{client: {symbolSearch: Function}|null, now?: () => number, sleep?: (ms: number) => Promise<void>, timeoutMs?: number, minGapMs?: number}} options
 *   client is the Finnhub DefaultApi; without one every lookup answers null.
 */
function createStockHints({ client, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), timeoutMs = TIMEOUT_MS, minGapMs = MIN_GAP_MS }) {
  const cache = new Map(); // normalized query -> { stock, expires }
  const pending = new Map(); // normalized query -> Promise, so one query is searched once at a time
  let queue = Promise.resolve();
  let lastCallAt = -Infinity;

  function remember(key, stock, ttl) {
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { stock, expires: now() + ttl });
  }

  /** Calls one Finnhub method with a timeout; resolves { data } or { error: true }. */
  function call(method, args) {
    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => { settled = true; resolve({ error: true }); }, timeoutMs);
      try {
        client[method](...args, (error, data) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(error || !data ? { error: true } : { data });
        });
      } catch {
        settled = true;
        clearTimeout(timer);
        resolve({ error: true });
      }
    });
  }

  /** Runs Finnhub calls one at a time, at least minGapMs apart. */
  function throttled(method, ...args) {
    const run = queue.then(async () => {
      const wait = lastCallAt + minGapMs - now();
      if (wait > 0) await sleep(wait);
      lastCallAt = now();
      return call(method, args);
    });
    queue = run.catch(() => { });
    return run;
  }

  /**
   * The listed company a failed coin query names, or null. Never throws. byTicker is true when
   * only the ticker matched (the name did not), which the caller treats as weaker.
   * @param {string} query
   * @returns {Promise<{symbol: string, name: string, byTicker: boolean}|null>}
   */
  async function lookup(query) {
    const key = normalizeName(query);
    if (!client || key.length < 2 || key.length > 60) return null;
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.stock;
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
      const term = ALIASES[key.replace(/ /g, '')] || key;
      const answer = await throttled('symbolSearch', term, {});
      if (answer.error) {
        remember(key, null, ERROR_CACHE_MS);
        return null;
      }
      let stock = pickStock(query, answer.data.result || []);
      if (stock && stock.byTicker) {
        // A bare ticker match only counts for a stock that is actually trading.
        const quote = await throttled('quote', stock.symbol);
        if (quote.error) {
          remember(key, null, ERROR_CACHE_MS);
          return null;
        }
        if (!(Number(quote.data.c) > 0)) stock = null;
      }
      remember(key, stock, CACHE_MS);
      return stock;
    })().catch(() => null).finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  }

  /** The cached answer for a query, without searching (undefined when not cached). */
  function peek(query) {
    const cached = cache.get(normalizeName(query));
    return cached && cached.expires > now() ? cached.stock : undefined;
  }

  return { lookup, peek };
}

module.exports = {
  createStockHints,
  formatStockHint,
  normalizeName,
  parseStockButtonId,
  pickStock,
  stockButtonId
};
