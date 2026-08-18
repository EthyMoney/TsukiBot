/* ------------------------------------------------------------------------
 *
 *                        TsukiBot - src/telemetry.js
 *
 * Usage telemetry: what commands people run, how they run them, when, and
 * whether it worked.
 *
 * Design constraints that shaped this file:
 *
 *   1. Telemetry must never break a command. Every write path swallows its
 *      own errors and recording is fire-and-forget. If the database is down
 *      the bot keeps serving prices; it just stops counting.
 *
 *   2. Telemetry must never slow a command down. Events go into an in-memory
 *      buffer and are flushed on a timer as one multi-row INSERT, so a user's
 *      interaction never waits on a database round trip.
 *
 *   3. Autocomplete fires once per keystroke. Logging all of those would bury
 *      the real signal under partial words ("b", "bi", "bit", "bitc"...) and
 *      inflate the table by an order of magnitude, so successive keystrokes of
 *      one search are coalesced into a single row holding the final query.
 *      See recordAutocomplete.
 *
 * The pool is injected via init() rather than imported, which keeps this
 * module free of main.js's globals and lets the pure helpers be unit tested
 * without a database.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const MAX_BUFFER = 200;              // flush early once this many events are queued
const FLUSH_INTERVAL_MS = 5000;      // otherwise flush on this cadence
const AUTOCOMPLETE_SETTLE_MS = 3000; // how long a search must be idle before it counts as finished
const MAX_PARAM_CHARS = 300;         // free-text options (translate, tag) get truncated to this

let pool = null;
let log = () => { };
let logError = () => { };
let buffer = [];
let flushTimer = null;
const pendingAutocomplete = new Map();
let droppedEvents = 0;
let warnedAboutFailure = false;

/**
 * Wires the module to a database pool and logger. Until this is called every
 * record* function is a no-op, which is what makes the bot safe to run with
 * telemetry unconfigured.
 * @param {object} options
 * @param {object} options.dbPool a pg.Pool
 * @param {(msg: string) => void} [options.info]
 * @param {(msg: string) => void} [options.error]
 */
function init({ dbPool, info, error } = {}) {
  pool = dbPool || null;
  log = info || (() => { });
  logError = error || (() => { });

  // Attaching a pool is a fresh start, so every piece of transient state is cleared with it.
  // In production init runs exactly once at boot and this is a no-op; it matters for tests, where
  // a leftover buffer would ride along in the next test's first INSERT and shift every positional
  // assertion by a row, and a sticky warnedAboutFailure would suppress the next outage's warning.
  for (const pending of pendingAutocomplete.values()) clearTimeout(pending.timer);
  pendingAutocomplete.clear();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  buffer = [];
  droppedEvents = 0;
  warnedAboutFailure = false;
}

/* --------------------------------------------------------------------------
 *  Schema
 * -------------------------------------------------------------------------- */

/**
 * Creates the event table and its indexes if absent, so a fresh deployment
 * needs no manual migration step.
 */
async function ensureTelemetryTable() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tsukibot.usage_events (
      event_id     BIGSERIAL PRIMARY KEY,
      occurred_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      event_type   VARCHAR(16)  NOT NULL,
      command      VARCHAR(64)  NOT NULL,
      subcommand   VARCHAR(96),
      user_id      VARCHAR(45)  NOT NULL,
      username     VARCHAR(64),
      guild_id     VARCHAR(45),
      guild_name   VARCHAR(120),
      channel_id   VARCHAR(45),
      params       JSONB,
      coins        TEXT[],
      outcome      VARCHAR(16)  NOT NULL DEFAULT 'ok',
      error_kind   VARCHAR(160),
      duration_ms  INTEGER
    );
  `);

  // Every report filters by a time window first, so occurred_at leads each index.
  const indexes = [
    'usage_events_occurred_idx ON tsukibot.usage_events (occurred_at DESC)',
    'usage_events_command_idx  ON tsukibot.usage_events (command, occurred_at DESC)',
    'usage_events_user_idx     ON tsukibot.usage_events (user_id, occurred_at DESC)',
    'usage_events_guild_idx    ON tsukibot.usage_events (guild_id, occurred_at DESC)',
    'usage_events_type_idx     ON tsukibot.usage_events (event_type, occurred_at DESC)',
    'usage_events_coins_idx    ON tsukibot.usage_events USING GIN (coins)',
    'usage_events_params_idx   ON tsukibot.usage_events USING GIN (params)'
  ];
  for (const index of indexes) {
    await pool.query(`CREATE INDEX IF NOT EXISTS ${index};`);
  }
  log('Usage telemetry table ready.');
}

/* --------------------------------------------------------------------------
 *  Extraction helpers (pure - unit tested)
 * -------------------------------------------------------------------------- */

// Options whose value names a coin. /convert's from and to are included because
// a conversion is a genuine expression of interest in both sides.
const COIN_OPTION_NAMES = new Set(['coin', 'coins', 'coin1', 'coin2', 'from', 'to']);

// Quote currencies stripped off a trading pair so "BTCUSDT" counts as BTC.
const QUOTE_SUFFIXES = ['USDT', 'USDC', 'BUSD', 'TUSD', 'PERP', 'USD', 'BTC', 'ETH', 'EUR', 'GBP'];

/**
 * Flattens an interaction's options into a plain object, walking into
 * subcommands and subcommand groups.
 *
 * Discord models a subcommand as an option of type 1 whose own options carry
 * the real values, so a naive one-level read yields {show: undefined} rather
 * than the arguments the user actually typed.
 *
 * @param {Array<object>} options interaction.options.data
 * @returns {{params: object, subcommand: string|null}}
 */
function flattenOptions(options) {
  const params = {};
  const trail = [];

  const walk = (list) => {
    for (const option of list || []) {
      // 1 = Subcommand, 2 = SubcommandGroup. Both carry nested options.
      if (option.type === 1 || option.type === 2) {
        trail.push(option.name);
        walk(option.options);
        continue;
      }
      if (option.value === undefined || option.value === null) continue;
      let value = option.value;
      if (typeof value === 'string' && value.length > MAX_PARAM_CHARS) {
        value = value.slice(0, MAX_PARAM_CHARS);
      }
      params[option.name] = value;
    }
  };
  walk(options);

  return { params, subcommand: trail.length ? trail.join(' ') : null };
}

/**
 * Reduces a raw pair or ticker to its base asset: strips an exchange prefix
 * ("binance:btcusdt"), a separator ("btc/usd", "btc-usd"), and a known quote
 * suffix ("btcusdt"). Returns null for anything that is not ticker-shaped.
 * @param {string} raw
 * @returns {string|null}
 */
function normalizeCoinToken(raw) {
  if (typeof raw !== 'string') return null;
  let token = raw.trim().toUpperCase();
  if (!token) return null;

  // "binance:btcusdt" -> "btcusdt"
  if (token.includes(':')) token = token.slice(token.lastIndexOf(':') + 1);
  // "btc/usd" or "btc-usd" -> "btc"
  const separator = token.search(/[/-]/);
  if (separator > 0) token = token.slice(0, separator);

  // Contract addresses are not tickers; each one would otherwise be its own "coin".
  if (/^0X[0-9A-F]{20,}$/.test(token)) return null;
  if (!/^[A-Z0-9.]{1,20}$/.test(token)) return null;

  // "btcusdt" -> "btc", but never reduce a ticker to nothing.
  for (const suffix of QUOTE_SUFFIXES) {
    if (token.length > suffix.length && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

/**
 * Pulls every coin referenced by an invocation, so "top coins" can be answered
 * without reparsing raw params at query time.
 * @param {string} command the slash command name
 * @param {object} params flattened option values
 * @returns {string[]} unique uppercase tickers, possibly empty
 */
function extractCoins(command, params) {
  const found = [];

  for (const [name, value] of Object.entries(params || {})) {
    if (typeof value !== 'string') continue;

    if (COIN_OPTION_NAMES.has(name)) {
      // "btc eth,ada" is a valid multi-coin value on /cg and friends.
      for (const piece of value.split(/[\s,]+/)) {
        const coin = normalizeCoinToken(piece);
        if (coin) found.push(coin);
      }
      continue;
    }

    // /c is a chart query like "btcusd rsi" or "binance:btcusdt macd", where the
    // first token is the pair. /eth's query is a wallet address, not a coin, so
    // it is deliberately excluded.
    if (name === 'query' && command === 'c') {
      const coin = normalizeCoinToken(value.split(/\s+/)[0]);
      if (coin) found.push(coin);
    }
  }

  return [...new Set(found)];
}

/**
 * Classifies a thrown error into a short, groupable label. Raw messages carry
 * ids and coin names, which would make every error its own unique "kind".
 * @param {any} err
 * @returns {string}
 */
function classifyError(err) {
  if (!err) return 'unknown';
  if (err.code) return String(err.code).slice(0, 160);
  const name = err.name || 'Error';
  const message = (err.message || '').split('\n')[0]
    .replace(/\b\d{5,}\b/g, '#')          // ids
    .replace(/0x[0-9a-fA-F]{6,}/g, '0x#') // addresses
    .slice(0, 120);
  return `${name}: ${message}`.slice(0, 160);
}

/* --------------------------------------------------------------------------
 *  Buffered writer
 * -------------------------------------------------------------------------- */

const COLUMNS = ['occurred_at', 'event_type', 'command', 'subcommand', 'user_id', 'username',
  'guild_id', 'guild_name', 'channel_id', 'params', 'coins', 'outcome', 'error_kind', 'duration_ms'];

/**
 * Builds the multi-row INSERT for a batch. Split out from flush() so the
 * placeholder arithmetic can be tested without a database.
 * @param {Array<object>} events
 * @returns {{text: string, values: Array<any>}}
 */
function buildInsert(events) {
  const values = [];
  const tuples = events.map((event, row) => {
    const placeholders = COLUMNS.map((_, column) => '$' + (row * COLUMNS.length + column + 1));
    values.push(
      event.occurredAt, event.eventType, event.command, event.subcommand,
      event.userId, event.username, event.guildId, event.guildName, event.channelId,
      event.params ? JSON.stringify(event.params) : null,
      event.coins && event.coins.length ? event.coins : null,
      event.outcome, event.errorKind, event.durationMs
    );
    return '(' + placeholders.join(', ') + ')';
  });

  return {
    text: `INSERT INTO tsukibot.usage_events (${COLUMNS.join(', ')}) VALUES ${tuples.join(', ')}`,
    values
  };
}

function scheduleFlush() {
  if (flushTimer || !pool) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
  // Never hold the process open just to write telemetry.
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

/**
 * Writes everything currently buffered. Safe to call at any time, including
 * concurrently with itself: the buffer is swapped out before the await.
 * @returns {Promise<number>} rows written
 */
async function flush() {
  if (!pool || buffer.length === 0) return 0;
  const batch = buffer;
  buffer = [];

  // A scheduled flush is redundant once the buffer has been drained by hand (the MAX_BUFFER
  // threshold, an admin running /usage, shutdown). Cancelling it avoids a pointless wake-up, and
  // the next record() schedules a fresh one.
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  try {
    const { text, values } = buildInsert(batch);
    await pool.query(text, values);
    if (warnedAboutFailure) {
      log('Telemetry writes have recovered.');
      warnedAboutFailure = false;
    }
    return batch.length;
  }
  catch (err) {
    // Losing telemetry is strictly better than surfacing an error into a
    // command, so the batch is dropped. Warn once per outage, not per batch.
    droppedEvents += batch.length;
    if (!warnedAboutFailure) {
      warnedAboutFailure = true;
      logError('Telemetry write failed, events are being dropped: ' + (err && err.message));
    }
    return 0;
  }
}

/**
 * Queues one event. Fire and forget: never awaited by a command handler.
 * @param {object} event
 */
function record(event) {
  if (!pool) return;
  buffer.push({
    occurredAt: event.occurredAt || new Date(),
    eventType: event.eventType || 'command',
    command: event.command,
    subcommand: event.subcommand || null,
    userId: event.userId,
    username: event.username || null,
    guildId: event.guildId || null,
    guildName: event.guildName || null,
    channelId: event.channelId || null,
    params: event.params && Object.keys(event.params).length ? event.params : null,
    coins: event.coins || null,
    outcome: event.outcome || 'ok',
    errorKind: event.errorKind || null,
    durationMs: Number.isFinite(event.durationMs) ? Math.round(event.durationMs) : null
  });

  if (buffer.length >= MAX_BUFFER) void flush();
  else scheduleFlush();
}

/* --------------------------------------------------------------------------
 *  Interaction recording
 * -------------------------------------------------------------------------- */

/**
 * Pulls the identity fields off any interaction. Guild fields stay null in a
 * DM, which is what makes "how much use comes from DMs" answerable.
 * @param {object} interaction
 */
function describeActor(interaction) {
  return {
    userId: interaction.user ? interaction.user.id : 'unknown',
    username: interaction.user ? interaction.user.username : null,
    guildId: interaction.guildId || null,
    guildName: interaction.guild ? interaction.guild.name : null,
    channelId: interaction.channelId || null
  };
}

/**
 * Records a completed slash command.
 * @param {object} interaction
 * @param {object} [result]
 * @param {string} [result.outcome] ok | error | expired
 * @param {any} [result.error]
 * @param {number} [result.durationMs]
 */
function recordCommand(interaction, result = {}) {
  if (!pool) return;
  try {
    const command = interaction.commandName;
    const { params, subcommand } = flattenOptions(interaction.options && interaction.options.data);
    record({
      eventType: 'command',
      command,
      subcommand,
      ...describeActor(interaction),
      params,
      coins: extractCoins(command, params),
      outcome: result.outcome || 'ok',
      errorKind: result.error ? classifyError(result.error) : null,
      durationMs: result.durationMs
    });
  }
  catch (err) {
    logError('Telemetry could not record a command: ' + (err && err.message));
  }
}

/**
 * Records a button press. The customId carries the meaning (which chart, which
 * timeframe), so it is stored as a param rather than discarded.
 * @param {object} interaction
 * @param {object} [result]
 */
function recordButton(interaction, result = {}) {
  if (!pool) return;
  try {
    const customId = interaction.customId || '';
    const [kind, ...rest] = customId.split(':');
    record({
      eventType: 'button',
      command: kind || 'button',
      subcommand: rest.length ? rest[0] : null,
      ...describeActor(interaction),
      params: { custom_id: customId.slice(0, MAX_PARAM_CHARS) },
      coins: extractCoins('c', { query: rest.slice(1).join(':') }),
      outcome: result.outcome || 'ok',
      errorKind: result.error ? classifyError(result.error) : null,
      durationMs: result.durationMs
    });
  }
  catch (err) {
    logError('Telemetry could not record a button: ' + (err && err.message));
  }
}

/**
 * Records an autocomplete search, coalescing the keystrokes of one search into
 * a single row.
 *
 * Typing "bitcoin" fires seven interactions. Each is a prefix of the next, so
 * rather than writing seven rows the pending row for that user and option is
 * overwritten and its settle timer reset. Only when the user stops typing for
 * AUTOCOMPLETE_SETTLE_MS does the final query get queued. Backspacing is the
 * same relationship in reverse and is treated the same way.
 *
 * A query that is unrelated to the pending one means a new search began, so the
 * pending row is committed before the new one starts.
 *
 * @param {object} interaction
 */
function recordAutocomplete(interaction) {
  if (!pool) return;
  try {
    const focused = interaction.options.getFocused(true);
    const query = String(focused.value || '');
    const command = interaction.commandName;
    const key = `${interaction.user.id}|${command}|${focused.name}`;

    const previous = pendingAutocomplete.get(key);
    if (previous) {
      clearTimeout(previous.timer);
      const older = previous.event.params.query;
      const continuation = query.startsWith(older) || older.startsWith(query);
      // An unrelated query means the earlier search finished; keep it.
      if (!continuation) record(previous.event);
    }

    const event = {
      eventType: 'autocomplete',
      command,
      subcommand: focused.name,
      ...describeActor(interaction),
      params: { query: query.slice(0, MAX_PARAM_CHARS), option: focused.name },
      coins: extractCoins(command, { [focused.name]: query }),
      outcome: 'ok'
    };

    const timer = setTimeout(() => {
      pendingAutocomplete.delete(key);
      // An empty search is the user opening the picker, not looking for anything.
      if (event.params.query) record(event);
    }, AUTOCOMPLETE_SETTLE_MS);
    if (typeof timer.unref === 'function') timer.unref();

    pendingAutocomplete.set(key, { event, timer });
  }
  catch (err) {
    logError('Telemetry could not record an autocomplete: ' + (err && err.message));
  }
}

/**
 * Records something the bot did on its own behalf, with no interaction behind
 * it: a fired price alert, a scheduled post, a cache refresh. The user id is
 * whoever the action was for, which keeps per-user totals honest.
 * @param {string} command
 * @param {object} details
 */
function recordSystemEvent(command, details = {}) {
  if (!pool) return;
  record({
    eventType: 'system',
    command,
    subcommand: details.subcommand || null,
    userId: details.userId || 'system',
    username: details.username || null,
    guildId: details.guildId || null,
    guildName: details.guildName || null,
    channelId: details.channelId || null,
    params: details.params || null,
    coins: details.coins || null,
    outcome: details.outcome || 'ok',
    errorKind: details.error ? classifyError(details.error) : null,
    durationMs: details.durationMs
  });
}

/**
 * Drains pending autocomplete searches and writes everything buffered. Call on
 * shutdown so the last few seconds of activity are not lost.
 * @returns {Promise<number>} rows written
 */
async function shutdown() {
  for (const [key, pending] of pendingAutocomplete) {
    clearTimeout(pending.timer);
    if (pending.event.params.query) record(pending.event);
    pendingAutocomplete.delete(key);
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return flush();
}

/**
 * Current buffer state, for the diagnostics line in /usage overview.
 */
function getWriterStats() {
  return {
    buffered: buffer.length,
    pendingAutocomplete: pendingAutocomplete.size,
    dropped: droppedEvents
  };
}

module.exports = {
  init,
  ensureTelemetryTable,
  record,
  recordCommand,
  recordButton,
  recordAutocomplete,
  recordSystemEvent,
  flush,
  shutdown,
  getWriterStats,
  // pure helpers, exported for tests
  flattenOptions,
  normalizeCoinToken,
  extractCoins,
  classifyError,
  buildInsert,
  COLUMNS,
  MAX_PARAM_CHARS,
  AUTOCOMPLETE_SETTLE_MS,
  FLUSH_INTERVAL_MS,
  MAX_BUFFER
};
