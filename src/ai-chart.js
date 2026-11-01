/* ------------------------------------------------------------------------
 *
 *                       TsukiBot - src/ai-chart.js
 *
 * Supporting pieces for the "Explain" button under a /c chart: the button's
 * customId, mapping a chart request to exchange candles, and the candle
 * statistics handed to Claude alongside the chart image.
 *
 * The statistics are computed here rather than read off the image, so the
 * figures in an explanation (moving averages, RSI, the range) are exact. The
 * image still matters for what the numbers do not capture: the shape of the
 * move and the levels price has reacted to.
 *
 * Pure functions only; main.js fetches the candles.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const EXPLAIN_PREFIX = 'chartai:';

/**
 * customId for the Explain button. Carries the interval and the query so the click knows what
 * the chart shows without parsing the image.
 * @param {string} intervalCode TradingView interval code (e.g. '60', 'D')
 * @param {string} baseQuery the chart query without its interval
 * @returns {string|null} null when it would exceed Discord's 100 character limit
 */
function encodeExplainId(intervalCode, baseQuery) {
  const id = `${EXPLAIN_PREFIX}${intervalCode}:${baseQuery}`;
  return Buffer.byteLength(id) > 100 ? null : id;
}

/**
 * Inverse of encodeExplainId. The query can contain colons of its own (binance:btcusdt), so
 * everything after the interval is rejoined.
 * @param {string} customId
 * @returns {{intervalCode: string, baseQuery: string}|null}
 */
function decodeExplainId(customId) {
  if (!customId || !customId.startsWith(EXPLAIN_PREFIX)) return null;
  const parts = customId.slice(EXPLAIN_PREFIX.length).split(':');
  const intervalCode = parts[0];
  const baseQuery = parts.slice(1).join(':');
  if (!intervalCode || !baseQuery) return null;
  return { intervalCode, baseQuery };
}

/** TradingView interval codes, as the chart server uses them, to ccxt timeframes and labels. */
const INTERVALS = {
  1: { timeframe: '1m', label: '1-minute' },
  3: { timeframe: '3m', label: '3-minute' },
  5: { timeframe: '5m', label: '5-minute' },
  15: { timeframe: '15m', label: '15-minute' },
  30: { timeframe: '30m', label: '30-minute' },
  60: { timeframe: '1h', label: '1-hour' },
  120: { timeframe: '2h', label: '2-hour' },
  180: { timeframe: null, label: '3-hour' },
  240: { timeframe: '4h', label: '4-hour' },
  D: { timeframe: '1d', label: 'daily' },
  W: { timeframe: '1w', label: 'weekly' },
  M: { timeframe: '1M', label: 'monthly' }
};

function intervalInfo(intervalCode) {
  return INTERVALS[intervalCode] || { timeframe: null, label: String(intervalCode) };
}

/** Friendly names for the indicator shortcuts /c accepts. */
const STUDY_NAMES = {
  bb: 'Bollinger Bands',
  bbr: 'Bollinger Bands %B',
  bbw: 'Bollinger Bands Width',
  crsi: 'Connors RSI',
  ichi: 'Ichimoku Cloud',
  ichimoku: 'Ichimoku Cloud',
  macd: 'MACD',
  ma: 'simple moving average',
  ema: 'exponential moving average',
  dema: 'double EMA',
  tema: 'triple EMA',
  pphl: 'pivot points high/low',
  pivotshl: 'pivot points high/low',
  rsi: 'RSI',
  stoch: 'Stochastic',
  stochrsi: 'Stochastic RSI',
  williamr: 'Williams %R'
};

/**
 * Splits a chart query into its pair and indicators.
 * @param {string} baseQuery e.g. "binance:btcusdt rsi macd"
 * @returns {{pairToken: string, exchange: string|null, studies: Array<string>}}
 */
function parseChartQuery(baseQuery) {
  const tokens = String(baseQuery || '').toLowerCase().split(' ').filter(Boolean);
  const first = tokens[0] || '';
  const colon = first.indexOf(':');
  const exchange = colon > 0 ? first.slice(0, colon) : null;
  const pairToken = colon > 0 ? first.slice(colon + 1) : first;
  const studies = [...new Set(tokens.slice(1).filter(token => STUDY_NAMES[token]).map(token => STUDY_NAMES[token]))];
  return { pairToken, exchange, studies };
}

/**
 * Finds the ccxt market that matches a chart pair, accepting USD for USDT the way the chart
 * command does. A bare ticker ("eth") is tried against USD and USDT.
 * @param {object} markets ccxt loadMarkets() result
 * @param {string} pairToken
 * @returns {string|null} unified symbol, e.g. "ETH/USDT"
 */
function findMarketSymbol(markets, pairToken) {
  const wanted = String(pairToken || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!wanted) return null;
  const candidates = [wanted, wanted + 't', wanted + 'usdt', wanted + 'usd'];
  const bySymbol = new Map();
  for (const key of Object.keys(markets || {})) {
    const market = markets[key];
    if (!market || !market.symbol || market.symbol.includes(':')) continue; // spot only
    bySymbol.set(market.symbol.replace('/', '').toLowerCase(), market.symbol);
  }
  for (const candidate of candidates) {
    if (bySymbol.has(candidate)) return bySymbol.get(candidate);
  }
  return null;
}

/* --------------------------------------------------------------------------
 *  Candle statistics
 * -------------------------------------------------------------------------- */

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sma(closes, period) {
  return closes.length >= period ? mean(closes.slice(-period)) : null;
}

/** Exponential moving average series, seeded with the simple average of the first period. */
function emaSeries(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const series = [mean(values.slice(0, period))];
  for (let i = period; i < values.length; i++) {
    series.push(values[i] * k + series[series.length - 1] * (1 - k));
  }
  return series;
}

/** Wilder's RSI. */
function rsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gain += change; else loss -= change;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

/** MACD(12, 26, 9): the MACD line, its signal line and the histogram, at the last candle. */
function macd(closes) {
  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  if (slow.length === 0) return null;
  // Align the fast series to the slow one, which starts 14 candles later.
  const line = slow.map((value, i) => fast[i + (26 - 12)] - value);
  const signal = emaSeries(line, 9);
  if (signal.length === 0) return null;
  const last = line[line.length - 1];
  const lastSignal = signal[signal.length - 1];
  return { line: last, signal: lastSignal, histogram: last - lastSignal };
}

function bollinger(closes, period = 20, width = 2) {
  if (closes.length < period) return null;
  const window = closes.slice(-period);
  const middle = mean(window);
  const deviation = Math.sqrt(mean(window.map(v => (v - middle) ** 2)));
  return { upper: middle + width * deviation, middle, lower: middle - width * deviation };
}

function fmt(value) {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return String(Number(value.toPrecision(6)));
}

function fmtPct(value) {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

/**
 * About how many candles a default-width TradingView chart shows, and a wide one. The window
 * the change and range figures cover should match what the reader is looking at; indicators
 * still use the whole history, since SMA200 and a settled RSI need more than is on screen.
 */
const VISIBLE_CANDLES = { normal: 100, wide: 180 };

/** Candles to fetch: enough for SMA200 plus the visible window. */
const CANDLES_TO_FETCH = 300;

/**
 * Statistics over the candles, as prompt lines.
 * @param {Array<Array<number>>} ohlcv ccxt rows: [timestamp, open, high, low, close, volume]
 * @param {{symbol: string, exchange: string, timeframeLabel: string, visible?: number}} meta
 * @returns {string|null} null when there are too few candles to say anything useful
 */
function summarizeCandles(ohlcv, meta) {
  const rows = (ohlcv || []).filter(row => Array.isArray(row) && row.length >= 6 && Number.isFinite(row[4]));
  if (rows.length < 30) return null;

  const closes = rows.map(row => row[4]);
  const highs = rows.map(row => row[2]);
  const lows = rows.map(row => row[3]);
  const volumes = rows.map(row => row[5]);
  const visible = rows.slice(-(meta.visible || VISIBLE_CANDLES.normal));
  const last = rows[rows.length - 1];
  const close = last[4];
  const high = Math.max(...visible.map(row => row[2]));
  const low = Math.min(...visible.map(row => row[3]));
  const startDate = new Date(visible[0][0]).toISOString().slice(0, 16).replace('T', ' ');
  const endDate = new Date(last[0]).toISOString().slice(0, 16).replace('T', ' ');
  const avgVolume = mean(volumes.slice(-21, -1));

  const lines = [
    `Source: ${meta.exchange} ${meta.symbol}, ${meta.timeframeLabel} candles. The chart shows roughly the last ${visible.length} ` +
      `(${startDate} to ${endDate} UTC; the last one may still be forming)`,
    `Last close: ${fmt(close)} (${fmtPct((close / rows[rows.length - 2][4] - 1) * 100)} on the previous candle)`,
    `Change across the visible candles: ${fmtPct((close / visible[0][1] - 1) * 100)}`,
    `Range across the visible candles: high ${fmt(high)}, low ${fmt(low)}; last close is ${Math.round((close - low) / (high - low || 1) * 100)}% of the way up`,
    `Last 20 candles: high ${fmt(Math.max(...highs.slice(-20)))}, low ${fmt(Math.min(...lows.slice(-20)))}`,
    `SMA20 ${fmt(sma(closes, 20))}, SMA50 ${fmt(sma(closes, 50))}, SMA200 ${fmt(sma(closes, 200))}`,
    `RSI(14): ${fmt(rsi(closes))}`
  ];

  const m = macd(closes);
  if (m) lines.push(`MACD(12,26,9): line ${fmt(m.line)}, signal ${fmt(m.signal)}, histogram ${fmt(m.histogram)}`);
  const bands = bollinger(closes);
  if (bands) lines.push(`Bollinger(20,2): upper ${fmt(bands.upper)}, middle ${fmt(bands.middle)}, lower ${fmt(bands.lower)}`);
  if (avgVolume > 0) lines.push(`Last candle volume is ${(last[5] / avgVolume).toFixed(2)}x the previous 20-candle average`);

  return lines.join('\n');
}

module.exports = {
  CANDLES_TO_FETCH,
  EXPLAIN_PREFIX,
  VISIBLE_CANDLES,
  decodeExplainId,
  encodeExplainId,
  findMarketSymbol,
  intervalInfo,
  macd,
  parseChartQuery,
  rsi,
  summarizeCandles
};
