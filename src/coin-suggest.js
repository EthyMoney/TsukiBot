/* ------------------------------------------------------------------------
 *
 *                     TsukiBot - src/coin-suggest.js
 *
 * "Did you mean" for coin lookups that found nothing.
 *
 * This is the cheap first pass: typo distance and prefix matching against
 * CoinGecko's full coin list, ranked so a popular coin beats an obscure one
 * at the same distance. Only when it finds nothing does main.js ask Claude,
 * which handles what string matching cannot: nicknames, descriptions and
 * renamed coins.
 *
 * Pure functions with no imports, so they can be tested directly.
 *
 * ------------------------------------------------------------------------ */

'use strict';

/** Lower case, letters and digits only, so "Shiba-Inu" and "shiba inu" compare equal. */
function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Levenshtein distance, giving up once it is certain to exceed max.
 * @param {string} a
 * @param {string} b
 * @param {number} max
 * @returns {number} the distance, or max + 1 when it is larger than max
 */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/** How far off a query of this length may be and still count as a typo. */
function allowedDistance(length) {
  if (length <= 4) return 1;
  if (length <= 8) return 2;
  return 3;
}

/**
 * Coins the query is probably a typo or a partial name of, best first.
 *
 * Tickers only match on near-exact typos, since three letters are one edit away from hundreds of
 * other tickers. Names and ids get the length-based allowance, and a name or id that starts with
 * the query counts as a close match ("shib" finds Shiba Inu).
 *
 * @param {string} query what the user typed
 * @param {Array<{id: string, symbol: string, name: string, rank?: number|null}>} coins
 * @param {{limit?: number}} [options]
 * @returns {Array<{id: string, symbol: string, name: string, rank: number|null, score: number}>}
 *          score is the edit distance plus one for an unranked coin; 0 or 1 is a close match
 */
function suggestCoins(query, coins, { limit = 3 } = {}) {
  const q = normalize(query);
  if (q.length < 2) return [];
  const maxName = allowedDistance(q.length);
  const maxSymbol = q.length >= 3 ? 1 : 0;

  const within = (a, b, max) => {
    const d = editDistance(a, b, max);
    return d <= max ? d : Infinity;
  };

  const scored = [];
  for (const coin of coins || []) {
    if (!coin || !coin.symbol) continue;
    const name = normalize(coin.name);
    const id = normalize(coin.id);

    let distance = Math.min(within(q, normalize(coin.symbol), maxSymbol), within(q, name, maxName), within(q, id, maxName));
    if (q.length >= 3 && (name.startsWith(q) || id.startsWith(q))) distance = Math.min(distance, 1);
    if (distance === Infinity) continue;
    // A coin outside the market cap rankings counts as one edit further away. CoinGecko lists
    // plenty of tokens named one letter off a major coin, and a typo of "ethereum" should
    // offer Ethereum before a lookalike nobody trades.
    scored.push({ coin, score: distance + (coin.rank ? 0 : 1), rank: coin.rank || Infinity });
  }

  scored.sort((a, b) => a.score - b.score || a.rank - b.rank);

  // When any traded coin matches, unranked ones are left out entirely: next to Ethereum, a token
  // that happens to use "ETHEREUM" as its ticker is noise, not a suggestion.
  const pool = scored.some(entry => entry.coin.rank) ? scored.filter(entry => entry.coin.rank) : scored;

  const seen = new Set();
  const results = [];
  for (const { coin, score } of pool) {
    if (seen.has(coin.id)) continue;
    seen.add(coin.id);
    results.push({ id: coin.id, symbol: coin.symbol, name: coin.name, rank: coin.rank || null, score });
    if (results.length >= limit) break;
  }
  return results;
}

/**
 * Whether the query reads like a description rather than a misspelled ticker or name, which
 * typo matching cannot help with ("the dog coin with a hat").
 * @param {string} query
 * @returns {boolean}
 */
function looksDescriptive(query) {
  const words = String(query || '').trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 || normalize(query).length >= 15;
}

/**
 * The reply line offering suggestions, or an empty string when there are none.
 * @param {Array<{symbol: string, name: string}>} suggestions
 * @returns {string}
 */
function formatSuggestions(suggestions) {
  const named = (suggestions || []).map(s => `**${s.name} (${String(s.symbol).toUpperCase()})**`);
  if (named.length === 0) return '';
  if (named.length === 1) return `Did you mean ${named[0]}?`;
  return `Did you mean ${named.slice(0, -1).join(', ')} or ${named[named.length - 1]}?`;
}

module.exports = {
  editDistance,
  formatSuggestions,
  looksDescriptive,
  normalize,
  suggestCoins
};
