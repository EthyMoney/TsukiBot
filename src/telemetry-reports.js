/* ------------------------------------------------------------------------
 *
 *                   TsukiBot - src/telemetry-reports.js
 *
 * The read side of usage telemetry: every question the /usage command can
 * answer, as one function per report.
 *
 * Kept apart from telemetry.js because the two halves have opposite shapes.
 * The write side is hot, fire-and-forget, and must never throw; this side is
 * cold, runs only when an admin asks, and is allowed to be slow and to
 * propagate errors up to the command handler.
 *
 * Every value that varies is passed as a bind parameter, including the time
 * window and the timezone, so no report interpolates user input into SQL.
 *
 * ------------------------------------------------------------------------ */

'use strict';

let pool = null;

function init({ dbPool } = {}) {
  pool = dbPool || null;
}

/**
 * Turns a day count into a Postgres interval literal. Bounded so a typo cannot
 * ask for a million-day scan.
 * @param {number} days
 * @returns {string}
 */
function windowInterval(days) {
  const n = Math.max(1, Math.min(3650, Math.round(Number(days) || 30)));
  return `${n} days`;
}

/**
 * Rejects anything that is not an IANA-shaped timezone name before it reaches
 * Postgres. The value is bound, not interpolated, so this is about giving a
 * clear error rather than about injection.
 * @param {string} tz
 * @returns {string}
 */
function normalizeTimezone(tz) {
  if (!tz) return 'UTC';
  const cleaned = String(tz).trim();
  if (!/^[A-Za-z0-9_+\-/]{1,64}$/.test(cleaned)) return 'UTC';
  return cleaned;
}

/**
 * How far back a window is shifted. A report comparing "these N days" with "the
 * N days before" runs the same query twice, the second time shifted by one whole
 * window; everything else passes zero so the window ends at NOW().
 * @param {number} days
 * @param {boolean} priorWindow
 * @returns {string}
 */
function shiftInterval(days, priorWindow) {
  return priorWindow ? windowInterval(days) : '0 days';
}

/**
 * Hour-granularity window for the watchdog checks, which look at the last few
 * hours rather than days. Bounded like windowInterval.
 * @param {number} hours
 * @returns {string}
 */
function hoursInterval(hours) {
  const n = Math.max(1, Math.min(24 * 30, Math.round(Number(hours) || 24)));
  return `${n} hours`;
}

async function query(text, values) {
  if (!pool) throw new Error('Telemetry reports are not connected to a database.');
  const result = await pool.query(text, values);
  return result.rows;
}

/* --------------------------------------------------------------------------
 *  Headline numbers
 * -------------------------------------------------------------------------- */

/**
 * The at-a-glance panel: volume, reach, reliability and speed over the window,
 * plus the rolling active-user counts that do not depend on it.
 * @param {number} days
 */
async function getOverview(days) {
  const interval = windowInterval(days);

  const [totals] = await query(`
    SELECT
      COUNT(*)                                                    AS events,
      COUNT(DISTINCT user_id)                                     AS users,
      COUNT(DISTINCT guild_id)                                    AS guilds,
      COUNT(DISTINCT command)                                     AS commands,
      COUNT(*) FILTER (WHERE event_type = 'command')              AS command_events,
      COUNT(*) FILTER (WHERE event_type = 'autocomplete')         AS autocomplete_events,
      COUNT(*) FILTER (WHERE event_type = 'button')               AS button_events,
      COUNT(*) FILTER (WHERE event_type = 'system')               AS system_events,
      COUNT(*) FILTER (WHERE outcome = 'error')                   AS errors,
      COUNT(*) FILTER (WHERE guild_id IS NULL)                    AS dm_events,
      ROUND(AVG(duration_ms))     FILTER (WHERE event_type = 'command')  AS avg_ms,
      PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY duration_ms)
                                  FILTER (WHERE event_type = 'command')  AS p50_ms,
      PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms)
                                  FILTER (WHERE event_type = 'command')  AS p95_ms,
      MIN(occurred_at)                                            AS first_event
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
  `, [interval]);
  // The latency figures are restricted to slash commands on purpose. Autocomplete rows carry no
  // duration (Postgres ignores the NULLs), but every CoinGecko call and button press records one,
  // and letting those in made "median command time" describe the bot's HTTP client instead.

  // Rolling actives are absolute, not window-relative: DAU means today whatever
  // window the rest of the report uses.
  const [actives] = await query(`
    SELECT
      COUNT(DISTINCT user_id) FILTER (WHERE occurred_at > NOW() - INTERVAL '1 day')   AS dau,
      COUNT(DISTINCT user_id) FILTER (WHERE occurred_at > NOW() - INTERVAL '7 days')  AS wau,
      COUNT(DISTINCT user_id) FILTER (WHERE occurred_at > NOW() - INTERVAL '30 days') AS mau,
      COUNT(*)                FILTER (WHERE occurred_at > NOW() - INTERVAL '1 day')   AS events_today
    FROM tsukibot.usage_events
  `);

  const [{ lifetime_events: lifetimeEvents, tracking_since: trackingSince }] = await query(`
    SELECT COUNT(*) AS lifetime_events, MIN(occurred_at) AS tracking_since
    FROM tsukibot.usage_events
  `);

  const [busiest] = await query(`
    SELECT DATE(occurred_at) AS day, COUNT(*) AS events
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
    GROUP BY day ORDER BY events DESC LIMIT 1
  `, [interval]);

  return { ...totals, ...actives, lifetimeEvents, trackingSince, busiest: busiest || null };
}

/**
 * The throughput numbers behind /stats.
 *
 * Only user-initiated actions count: commands and button presses. Autocomplete is excluded
 * because a keystroke is not a request anyone made, and 'system' is excluded because the bot's
 * own scheduled work is not traffic.
 *
 * The windowed counts use the occurred_at index. The lifetime total is a full scan, which is why
 * the caller caches this rather than running it per invocation.
 */
async function getActivityRate() {
  const [row] = await query(`
    SELECT
      COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '1 hour')    AS events_1h,
      COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '24 hours')  AS events_24h,
      COUNT(*)                                                           AS events_total,
      MIN(occurred_at)                                                   AS first_event,
      EXTRACT(EPOCH FROM (NOW() - MIN(occurred_at))) / 60                AS tracked_minutes
    FROM tsukibot.usage_events
    WHERE event_type IN ('command', 'button')
  `);
  return row;
}

/**
 * Converts those counts into a per-minute rate.
 *
 * Once there is a full day of history the rate is measured over the last 24 hours, which keeps it
 * current rather than diluting it with every quiet night since install. Before that there is no
 * full day to average over, so it falls back to the actual observed span - otherwise a bot running
 * for ten minutes would divide its traffic by 1440 and report roughly zero.
 *
 * @param {object} stats a getActivityRate row
 * @returns {number|null} events per minute, or null when there is nothing to measure
 */
function perMinuteRate(stats) {
  if (!stats) return null;
  const trackedMinutes = Number(stats.tracked_minutes);
  const total = Number(stats.events_total) || 0;
  if (!Number.isFinite(trackedMinutes) || total === 0) return null;

  const DAY_MINUTES = 1440;
  if (trackedMinutes >= DAY_MINUTES) return Number(stats.events_24h) / DAY_MINUTES;

  // Guard the denominator: the first event of a fresh install can be seconds old.
  return total / Math.max(trackedMinutes, 1);
}

/* --------------------------------------------------------------------------
 *  External API credits
 * -------------------------------------------------------------------------- */

/**
 * CoinGecko spend, broken down by endpoint.
 *
 * cgFetch records one row per request, and one request is one credit, so this is an exact count
 * rather than an estimate. A demo key allows 10,000 a month, which is easy to blow through without
 * knowing where it went.
 *
 * @param {number} days
 */
async function getApiCreditsByEndpoint(days) {
  return query(`
    SELECT
      COALESCE(params->>'endpoint', subcommand, 'unknown')       AS endpoint,
      COUNT(*)                                                   AS calls,
      COUNT(*) FILTER (WHERE outcome = 'ratelimited')            AS ratelimited,
      COUNT(*) FILTER (WHERE outcome = 'error')                  AS errors,
      ROUND(AVG(duration_ms))                                    AS avg_ms,
      MAX(occurred_at)                                           AS last_call
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
      AND command = 'coingecko-call'
    GROUP BY endpoint
    ORDER BY calls DESC
  `, [windowInterval(days)]);
}

/**
 * Rolling credit totals, plus a projection.
 *
 * The month-to-date figure is what the quota is actually measured against; the 24h rate is what
 * says whether the current configuration will survive the rest of the month.
 */
async function getApiCreditTotals() {
  const [row] = await query(`
    SELECT
      COUNT(*)                                                                    AS calls_total,
      COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '1 hour')             AS calls_1h,
      COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '24 hours')           AS calls_24h,
      COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '7 days')             AS calls_7d,
      COUNT(*) FILTER (WHERE occurred_at >= DATE_TRUNC('month', NOW()))           AS calls_month,
      COUNT(*) FILTER (WHERE outcome = 'ratelimited')                             AS ratelimited,
      MIN(occurred_at)                                                            AS first_call
    FROM tsukibot.usage_events
    WHERE command = 'coingecko-call'
  `);
  return row;
}

/**
 * Credits per day, for the trend line.
 * @param {number} days
 * @param {string} timezone
 */
async function getApiCreditsByDay(days, timezone) {
  return query(`
    SELECT DATE(occurred_at AT TIME ZONE $2) AS day, COUNT(*) AS calls
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval AND command = 'coingecko-call'
    GROUP BY day ORDER BY day
  `, [windowInterval(days), normalizeTimezone(timezone)]);
}

/* --------------------------------------------------------------------------
 *  Leaderboards
 * -------------------------------------------------------------------------- */

/**
 * Most used commands, with the reach and reliability of each. Subcommands are
 * folded into the name ("portfolio show") because that is the unit a user
 * actually invokes.
 * @param {number} days
 * @param {number} limit
 * @param {boolean} includeAutocomplete
 * @param {{priorWindow?: boolean}} [options] priorWindow shifts the window back by its own length,
 *   which is how the compare option gets "the N days before these N days" from the same query
 */
async function getTopCommands(days, limit, includeAutocomplete = false, { priorWindow = false } = {}) {
  return query(`
    SELECT
      command || COALESCE(' ' || subcommand, '')  AS name,
      COUNT(*)                                    AS uses,
      COUNT(DISTINCT user_id)                     AS users,
      COUNT(DISTINCT guild_id)                    AS guilds,
      ROUND(AVG(duration_ms))                     AS avg_ms,
      COUNT(*) FILTER (WHERE outcome = 'error')   AS errors,
      MAX(occurred_at)                            AS last_used
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $4::interval - $1::interval
      AND occurred_at <= NOW() - $4::interval
      AND (event_type = 'command' OR ($3 AND event_type <> 'system'))
    GROUP BY name
    ORDER BY uses DESC
    LIMIT $2
  `, [windowInterval(days), limit, includeAutocomplete, shiftInterval(days, priorWindow)]);
}

/**
 * Heaviest users, with the command each one reaches for most.
 * @param {number} days
 * @param {number} limit
 */
async function getTopUsers(days, limit) {
  return query(`
    SELECT
      user_id,
      MAX(username)                                 AS username,
      COUNT(*)                                      AS events,
      COUNT(DISTINCT command)                       AS distinct_commands,
      COUNT(DISTINCT DATE(occurred_at))             AS active_days,
      MODE() WITHIN GROUP (ORDER BY command)        AS favorite_command,
      MIN(occurred_at)                              AS first_seen,
      MAX(occurred_at)                              AS last_seen
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
      AND event_type <> 'system'
    GROUP BY user_id
    ORDER BY events DESC
    LIMIT $2
  `, [windowInterval(days), limit]);
}

/**
 * Busiest servers. DM traffic has no guild id and is reported separately in the
 * overview rather than being lumped in here as a null row.
 * @param {number} days
 * @param {number} limit
 */
async function getTopGuilds(days, limit) {
  return query(`
    SELECT
      guild_id,
      MAX(guild_name)                        AS guild_name,
      COUNT(*)                               AS events,
      COUNT(DISTINCT user_id)                AS users,
      MODE() WITHIN GROUP (ORDER BY command) AS favorite_command,
      MAX(occurred_at)                       AS last_used
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
      AND guild_id IS NOT NULL
    GROUP BY guild_id
    ORDER BY events DESC
    LIMIT $2
  `, [windowInterval(days), limit]);
}

/**
 * Most requested coins across every command that names one. Unnesting the coins
 * array is what makes this a single grouped scan instead of a reparse of params.
 * @param {number} days
 * @param {number} limit
 * @param {{priorWindow?: boolean}} [options] see getTopCommands
 */
async function getTopCoins(days, limit, { priorWindow = false } = {}) {
  return query(`
    SELECT
      coin,
      COUNT(*)                               AS requests,
      COUNT(DISTINCT user_id)                AS users,
      MODE() WITHIN GROUP (ORDER BY command) AS via_command
    FROM tsukibot.usage_events, UNNEST(coins) AS coin
    WHERE occurred_at > NOW() - $3::interval - $1::interval
      AND occurred_at <= NOW() - $3::interval
    GROUP BY coin
    ORDER BY requests DESC
    LIMIT $2
  `, [windowInterval(days), limit, shiftInterval(days, priorWindow)]);
}

/* --------------------------------------------------------------------------
 *  Time of day
 * -------------------------------------------------------------------------- */

/**
 * Activity by hour of day in the requested timezone. UTC hours are close to
 * useless for "when are people awake", which is the actual question.
 * @param {number} days
 * @param {string} timezone IANA name
 */
async function getHourlyActivity(days, timezone) {
  return query(`
    SELECT
      EXTRACT(HOUR FROM occurred_at AT TIME ZONE $2)::int AS hour,
      COUNT(*)                                            AS events,
      COUNT(DISTINCT user_id)                             AS users
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
    GROUP BY hour
    ORDER BY hour
  `, [windowInterval(days), normalizeTimezone(timezone)]);
}

/**
 * Activity by day of week, 0 = Sunday to match EXTRACT(DOW).
 * @param {number} days
 * @param {string} timezone
 */
async function getWeekdayActivity(days, timezone) {
  return query(`
    SELECT
      EXTRACT(DOW FROM occurred_at AT TIME ZONE $2)::int AS weekday,
      COUNT(*)                                           AS events,
      COUNT(DISTINCT user_id)                            AS users
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
    GROUP BY weekday
    ORDER BY weekday
  `, [windowInterval(days), normalizeTimezone(timezone)]);
}

/**
 * The weekday x hour grid behind the heatmap.
 * @param {number} days
 * @param {string} timezone
 */
async function getActivityGrid(days, timezone) {
  return query(`
    SELECT
      EXTRACT(DOW  FROM occurred_at AT TIME ZONE $2)::int AS weekday,
      EXTRACT(HOUR FROM occurred_at AT TIME ZONE $2)::int AS hour,
      COUNT(*)                                            AS events,
      COUNT(DISTINCT user_id)                             AS users
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
    GROUP BY weekday, hour
  `, [windowInterval(days), normalizeTimezone(timezone)]);
}

/**
 * Events per day, for the trend sparkline.
 * @param {number} days
 * @param {string} timezone
 */
async function getDailySeries(days, timezone) {
  return query(`
    SELECT
      DATE(occurred_at AT TIME ZONE $2)  AS day,
      COUNT(*)                           AS events,
      COUNT(DISTINCT user_id)            AS users,
      COUNT(*) FILTER (WHERE outcome = 'error') AS errors
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
    GROUP BY day
    ORDER BY day
  `, [windowInterval(days), normalizeTimezone(timezone)]);
}

/* --------------------------------------------------------------------------
 *  How commands are used
 * -------------------------------------------------------------------------- */

/**
 * Value frequency per option for one command: the "how do people actually use
 * this" report. jsonb_each_text turns the params object into rows, so an option
 * added later needs no schema change to show up here.
 * @param {string} command
 * @param {number} days
 * @param {number} limit
 */
async function getParameterUsage(command, days, limit) {
  return query(`
    SELECT
      kv.key                  AS option,
      kv.value                AS value,
      COUNT(*)                AS uses,
      COUNT(DISTINCT user_id) AS users
    FROM tsukibot.usage_events, LATERAL jsonb_each_text(params) AS kv
    WHERE occurred_at > NOW() - $2::interval
      AND command = $1
      AND params IS NOT NULL
    GROUP BY kv.key, kv.value
    ORDER BY uses DESC
    LIMIT $3
  `, [command, windowInterval(days), limit]);
}

/**
 * Which options of a command get supplied at all, and how often the command is
 * run bare. Answers "is this option worth keeping".
 * @param {string} command
 * @param {number} days
 */
async function getOptionCoverage(command, days) {
  return query(`
    WITH invocations AS (
      SELECT event_id, params
      FROM tsukibot.usage_events
      WHERE occurred_at > NOW() - $2::interval
        AND command = $1
        AND event_type = 'command'
    )
    SELECT
      kv.key                                        AS option,
      COUNT(*)                                      AS supplied,
      (SELECT COUNT(*) FROM invocations)            AS total_invocations
    FROM invocations LEFT JOIN LATERAL jsonb_each_text(invocations.params) AS kv ON TRUE
    WHERE kv.key IS NOT NULL
    GROUP BY kv.key
    ORDER BY supplied DESC
  `, [command, windowInterval(days)]);
}

/**
 * Subcommand split for a command that has one.
 * @param {string} command
 * @param {number} days
 */
async function getSubcommandSplit(command, days) {
  return query(`
    SELECT COALESCE(subcommand, '(none)') AS subcommand,
           COUNT(*)                       AS uses,
           COUNT(DISTINCT user_id)        AS users
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $2::interval AND command = $1 AND event_type = 'command'
    GROUP BY subcommand ORDER BY uses DESC
  `, [command, windowInterval(days)]);
}

/* --------------------------------------------------------------------------
 *  Reliability
 * -------------------------------------------------------------------------- */

/**
 * What is failing, grouped by the classified error kind rather than the raw
 * message so the same fault does not spread across dozens of rows.
 * @param {number} days
 * @param {number} limit
 * @param {{priorWindow?: boolean}} [options] see getTopCommands
 */
async function getErrors(days, limit, { priorWindow = false } = {}) {
  return query(`
    SELECT
      command,
      COALESCE(error_kind, 'unknown') AS error_kind,
      COUNT(*)                        AS occurrences,
      COUNT(DISTINCT user_id)         AS users_affected,
      MAX(occurred_at)                AS last_seen
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $3::interval - $1::interval
      AND occurred_at <= NOW() - $3::interval
      AND outcome = 'error'
    GROUP BY command, error_kind
    ORDER BY occurrences DESC
    LIMIT $2
  `, [windowInterval(days), limit, shiftInterval(days, priorWindow)]);
}

/**
 * The slowest commands, which is where latency work would actually pay off.
 * The floor keeps commands with a handful of samples from topping the list on
 * one unlucky call.
 * @param {number} days
 * @param {number} limit
 */
async function getSlowestCommands(days, limit) {
  return query(`
    SELECT
      command,
      COUNT(*)                                                  AS samples,
      ROUND(AVG(duration_ms))                                   AS avg_ms,
      PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms,
      MAX(duration_ms)                                          AS max_ms
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
      AND duration_ms IS NOT NULL
    GROUP BY command
    HAVING COUNT(*) >= 5
    ORDER BY avg_ms DESC
    LIMIT $2
  `, [windowInterval(days), limit]);
}

/* --------------------------------------------------------------------------
 *  Growth and retention
 * -------------------------------------------------------------------------- */

/**
 * New versus returning users per day. A user counts as new on the day of their
 * first ever recorded event, which is why the CTE scans all of history rather
 * than the window.
 * @param {number} days
 * @param {string} timezone
 */
async function getGrowth(days, timezone) {
  return query(`
    WITH firsts AS (
      SELECT user_id, MIN(occurred_at) AS first_seen
      FROM tsukibot.usage_events
      GROUP BY user_id
    ),
    daily AS (
      SELECT DATE(e.occurred_at AT TIME ZONE $2) AS day, e.user_id,
             MIN(f.first_seen) AS first_seen
      FROM tsukibot.usage_events e JOIN firsts f ON f.user_id = e.user_id
      WHERE e.occurred_at > NOW() - $1::interval
      GROUP BY day, e.user_id
    )
    SELECT day,
           COUNT(*)                                                                   AS active_users,
           COUNT(*) FILTER (WHERE DATE(first_seen AT TIME ZONE $2) = day)             AS new_users,
           COUNT(*) FILTER (WHERE DATE(first_seen AT TIME ZONE $2) <> day)            AS returning_users
    FROM daily
    GROUP BY day
    ORDER BY day
  `, [windowInterval(days), normalizeTimezone(timezone)]);
}

/**
 * How sticky the bot is: the share of users who came back on more than one day,
 * bucketed. One-day-only users are the churn signal.
 * @param {number} days
 */
async function getRetention(days) {
  return query(`
    WITH per_user AS (
      SELECT user_id, COUNT(DISTINCT DATE(occurred_at)) AS active_days
      FROM tsukibot.usage_events
      WHERE occurred_at > NOW() - $1::interval AND event_type <> 'system'
      GROUP BY user_id
    )
    SELECT
      CASE
        WHEN active_days = 1  THEN '1 day (one-off)'
        WHEN active_days <= 3 THEN '2-3 days'
        WHEN active_days <= 7 THEN '4-7 days'
        WHEN active_days <= 20 THEN '8-20 days'
        ELSE '21+ days'
      END        AS bucket,
      COUNT(*)   AS users,
      MIN(active_days) AS sort_key
    FROM per_user
    GROUP BY bucket
    ORDER BY sort_key
  `, [windowInterval(days)]);
}

/* --------------------------------------------------------------------------
 *  Raw access
 * -------------------------------------------------------------------------- */

/**
 * Recent raw events, for spot-checking that recording works and for the CSV
 * export.
 * @param {number} days
 * @param {number} limit
 */
async function getRecentEvents(days, limit) {
  return query(`
    SELECT occurred_at, event_type, command, subcommand, user_id, username,
           guild_name, params, coins, outcome, error_kind, duration_ms
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
    ORDER BY occurred_at DESC
    LIMIT $2
  `, [windowInterval(days), limit]);
}

/**
 * Table size and row count, so the operator can see telemetry growth before it
 * becomes a problem.
 */
async function getStorageStats() {
  const [row] = await query(`
    SELECT
      (SELECT COUNT(*) FROM tsukibot.usage_events)                          AS rows,
      pg_size_pretty(pg_total_relation_size('tsukibot.usage_events'))       AS total_size,
      (SELECT MIN(occurred_at) FROM tsukibot.usage_events)                  AS oldest
  `);
  return row;
}

/**
 * Deletes events older than the retention period. Not scheduled automatically:
 * the whole point of this table is history, so trimming it is a deliberate act.
 * @param {number} days
 * @returns {Promise<number>} rows deleted
 */
async function pruneOlderThan(days) {
  const result = await pool.query(
    'DELETE FROM tsukibot.usage_events WHERE occurred_at < NOW() - $1::interval',
    [windowInterval(days)]
  );
  return result.rowCount;
}

/**
 * How many rows a prune would remove. Shown on the confirmation button so the
 * admin confirms a number they have seen, not a cutoff they have imagined.
 * @param {number} days
 * @returns {Promise<number>}
 */
async function countOlderThan(days) {
  const [row] = await query(
    'SELECT COUNT(*) AS rows FROM tsukibot.usage_events WHERE occurred_at < NOW() - $1::interval',
    [windowInterval(days)]
  );
  return Number(row.rows) || 0;
}

/**
 * Raw events narrowed by whatever the caller supplies. This is what the
 * dashboard's drill-downs (click a coin, a user, an error kind) run, and it
 * exists because filtering a LIMIT-capped getRecentEvents client-side silently
 * shows a partial picture. Every filter is a bind parameter; the SQL is
 * assembled only from fixed fragments.
 * @param {object} filters
 * @param {number} [filters.days]
 * @param {number} [filters.limit]
 * @param {string} [filters.command]
 * @param {string} [filters.userId]
 * @param {string} [filters.guildId]
 * @param {string} [filters.coin] ticker, matched against the coins array
 * @param {string} [filters.outcome]
 * @param {string} [filters.errorKind]
 * @param {string} [filters.eventType]
 */
async function getRecentEventsFiltered(filters = {}) {
  const values = [windowInterval(filters.days)];
  const clauses = ['occurred_at > NOW() - $1::interval'];
  const add = (clause, value) => {
    values.push(value);
    clauses.push(clause.replace('?', '$' + values.length));
  };
  if (filters.command) add('command = ?', String(filters.command));
  if (filters.userId) add('user_id = ?', String(filters.userId));
  if (filters.guildId) add('guild_id = ?', String(filters.guildId));
  if (filters.coin) add('coins @> ARRAY[?]::text[]', String(filters.coin).toUpperCase());
  if (filters.outcome) add('outcome = ?', String(filters.outcome));
  if (filters.errorKind) add('error_kind = ?', String(filters.errorKind));
  if (filters.eventType) add('event_type = ?', String(filters.eventType));

  values.push(Math.max(1, Math.min(5000, Math.round(Number(filters.limit) || 200))));
  return query(`
    SELECT event_id, occurred_at, event_type, command, subcommand, user_id, username,
           guild_id, guild_name, channel_id, params, coins, outcome, error_kind, duration_ms
    FROM tsukibot.usage_events
    WHERE ${clauses.join(' AND ')}
    ORDER BY occurred_at DESC
    LIMIT $${values.length}
  `, values);
}

/* --------------------------------------------------------------------------
 *  Comparisons over time
 *
 *  The reports above all answer "what happened in the last N days". The ones
 *  here answer "compared with what": the same window one step earlier, or the
 *  same point in the previous month. That is what the compare option, the
 *  weekly digest and the momentum report are built on.
 * -------------------------------------------------------------------------- */

/**
 * The headline numbers for a window and for the window before it, in one scan
 * of 2N days. Percentiles are command-only for the reason given in getOverview.
 * @param {number} days
 */
async function getOverviewComparison(days) {
  const [row] = await query(`
    SELECT
      COUNT(*)                FILTER (WHERE occurred_at >  NOW() - $1::interval)   AS events,
      COUNT(*)                FILTER (WHERE occurred_at <= NOW() - $1::interval)   AS prior_events,
      COUNT(DISTINCT user_id) FILTER (WHERE occurred_at >  NOW() - $1::interval)   AS users,
      COUNT(DISTINCT user_id) FILTER (WHERE occurred_at <= NOW() - $1::interval)   AS prior_users,
      COUNT(DISTINCT guild_id) FILTER (WHERE occurred_at >  NOW() - $1::interval)  AS guilds,
      COUNT(DISTINCT guild_id) FILTER (WHERE occurred_at <= NOW() - $1::interval)  AS prior_guilds,
      COUNT(*) FILTER (WHERE event_type = 'command' AND occurred_at >  NOW() - $1::interval) AS command_events,
      COUNT(*) FILTER (WHERE event_type = 'command' AND occurred_at <= NOW() - $1::interval) AS prior_command_events,
      COUNT(*) FILTER (WHERE outcome = 'error' AND occurred_at >  NOW() - $1::interval)      AS errors,
      COUNT(*) FILTER (WHERE outcome = 'error' AND occurred_at <= NOW() - $1::interval)      AS prior_errors,
      COUNT(*) FILTER (WHERE command = 'coingecko-call' AND occurred_at >  NOW() - $1::interval) AS credits,
      COUNT(*) FILTER (WHERE command = 'coingecko-call' AND occurred_at <= NOW() - $1::interval) AS prior_credits,
      PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms)
        FILTER (WHERE event_type = 'command' AND occurred_at >  NOW() - $1::interval)         AS p95_ms,
      PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms)
        FILTER (WHERE event_type = 'command' AND occurred_at <= NOW() - $1::interval)         AS prior_p95_ms
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - ($1::interval * 2)
  `, [windowInterval(days)]);
  return row;
}

/**
 * This month's CoinGecko spend against the same point of last month, and last
 * month's final total. The same-point comparison is what makes "are we burning
 * faster than last month" answerable on the 8th rather than the 31st.
 */
async function getApiCreditsMonthComparison() {
  const [row] = await query(`
    SELECT
      COUNT(*) FILTER (WHERE occurred_at >= DATE_TRUNC('month', NOW()))                       AS month_to_date,
      COUNT(*) FILTER (WHERE occurred_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                         AND occurred_at <  DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                                            + (NOW() - DATE_TRUNC('month', NOW())))           AS prior_month_same_point,
      COUNT(*) FILTER (WHERE occurred_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                         AND occurred_at <  DATE_TRUNC('month', NOW()))                       AS prior_month_total
    FROM tsukibot.usage_events
    WHERE command = 'coingecko-call'
      AND occurred_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
  `);
  return row;
}

/**
 * Credits per day since the start of the current month, for the burn-down
 * chart. Anchored to the month boundary rather than to "the last N days": a
 * trailing window misses the first of the month on the 31st and can include
 * last month's tail, and the chart would be wrong exactly when it matters.
 * Days are bucketed the same way calls_month is counted, so the two agree.
 */
async function getApiCreditsMonthToDate() {
  return query(`
    SELECT DATE(occurred_at) AS day, COUNT(*) AS credits
    FROM tsukibot.usage_events
    WHERE occurred_at >= DATE_TRUNC('month', NOW()) AND command = 'coingecko-call'
    GROUP BY day ORDER BY day
  `);
}

/**
 * Credits per day split by endpoint, for the stacked chart that shows which
 * work is eating the budget over time rather than in total.
 * @param {number} days
 * @param {string} timezone
 */
async function getApiCreditsByDayAndEndpoint(days, timezone) {
  return query(`
    SELECT
      DATE(occurred_at AT TIME ZONE $2)                       AS day,
      COALESCE(params->>'endpoint', subcommand, 'unknown')    AS endpoint,
      COUNT(*)                                                AS calls,
      COUNT(*) FILTER (WHERE outcome = 'ratelimited')         AS ratelimited
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval AND command = 'coingecko-call'
    GROUP BY day, endpoint
    ORDER BY day, calls DESC
  `, [windowInterval(days), normalizeTimezone(timezone)]);
}

/**
 * Command latency per day. Nothing else gives latency a time axis, so a
 * regression that crept in last Tuesday is invisible in the window percentiles.
 * @param {number} days
 * @param {string} timezone
 */
async function getLatencyByDay(days, timezone) {
  return query(`
    SELECT
      DATE(occurred_at AT TIME ZONE $2)                          AS day,
      COUNT(*)                                                   AS samples,
      PERCENTILE_DISC(0.5)  WITHIN GROUP (ORDER BY duration_ms)  AS p50_ms,
      PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms)  AS p95_ms
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
      AND event_type = 'command' AND duration_ms IS NOT NULL
    GROUP BY day
    ORDER BY day
  `, [windowInterval(days), normalizeTimezone(timezone)]);
}

/**
 * Coin demand in this window against the one before it. Returns every coin seen
 * in either window (capped), with the request and user counts on both sides, so
 * the caller can rank risers and fallers and tell one power user hammering a
 * coin from broad new interest.
 * @param {number} days
 * @param {number} limit
 */
async function getCoinMomentum(days, limit) {
  return query(`
    SELECT
      coin,
      COUNT(*)                FILTER (WHERE e.occurred_at >  NOW() - $1::interval) AS current_requests,
      COUNT(*)                FILTER (WHERE e.occurred_at <= NOW() - $1::interval) AS prior_requests,
      COUNT(DISTINCT user_id) FILTER (WHERE e.occurred_at >  NOW() - $1::interval) AS current_users,
      COUNT(DISTINCT user_id) FILTER (WHERE e.occurred_at <= NOW() - $1::interval) AS prior_users,
      MODE() WITHIN GROUP (ORDER BY command)                                       AS via_command
    FROM tsukibot.usage_events e, UNNEST(e.coins) AS coin
    WHERE e.occurred_at > NOW() - ($1::interval * 2)
    GROUP BY coin
    ORDER BY GREATEST(
      COUNT(*) FILTER (WHERE e.occurred_at >  NOW() - $1::interval),
      COUNT(*) FILTER (WHERE e.occurred_at <= NOW() - $1::interval)) DESC
    LIMIT $2
  `, [windowInterval(days), limit]);
}

/**
 * Coins requested for the first time ever inside the window. The all-history
 * scan is the point: "new" means new to the bot, not new to this window.
 * @param {number} days
 * @param {number} limit
 */
async function getNewCoins(days, limit) {
  return query(`
    WITH first_seen AS (
      SELECT coin,
             MIN(e.occurred_at)                     AS first_seen,
             COUNT(*)                               AS requests,
             COUNT(DISTINCT e.user_id)              AS users,
             MODE() WITHIN GROUP (ORDER BY command) AS via_command
      FROM tsukibot.usage_events e, UNNEST(e.coins) AS coin
      GROUP BY coin
    )
    SELECT coin, first_seen, requests, users, via_command
    FROM first_seen
    WHERE first_seen > NOW() - $1::interval
    ORDER BY requests DESC
    LIMIT $2
  `, [windowInterval(days), limit]);
}

/**
 * Did a search turn into a command? Each settled autocomplete row is paired with
 * a command event by the same user on the same command close to it in time.
 *
 * The join window starts BEFORE the search row, not at it: a search's
 * occurred_at is its settle time, stamped a few seconds after the last
 * keystroke, so a user who picks a suggestion and submits at once produces a
 * command event timestamped before their own search. A forward-only window
 * would undercount exactly the conversions that worked best.
 * @param {number} days
 * @param {number} limit
 */
async function getSearchFunnel(days, limit) {
  return query(`
    WITH searches AS (
      SELECT event_id, occurred_at, user_id, command
      FROM tsukibot.usage_events
      WHERE occurred_at > NOW() - $1::interval AND event_type = 'autocomplete'
    )
    SELECT
      s.command,
      COUNT(*) AS searches,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM tsukibot.usage_events c
        WHERE c.event_type = 'command' AND c.user_id = s.user_id AND c.command = s.command
          AND c.occurred_at BETWEEN s.occurred_at - INTERVAL '10 seconds'
                                AND s.occurred_at + INTERVAL '60 seconds'
      )) AS converted,
      COUNT(DISTINCT s.user_id) AS users
    FROM searches s
    GROUP BY s.command
    ORDER BY searches DESC
    LIMIT $2
  `, [windowInterval(days), limit]);
}

/**
 * What people type into a picker and then never run: direct evidence of coins
 * the picker cannot find or tickers the normaliser misses.
 * @param {number} days
 * @param {number} limit
 */
async function getAbandonedSearches(days, limit) {
  return query(`
    WITH searches AS (
      SELECT event_id, occurred_at, user_id, command, params->>'query' AS query
      FROM tsukibot.usage_events
      WHERE occurred_at > NOW() - $1::interval AND event_type = 'autocomplete'
        AND params->>'query' IS NOT NULL
    )
    SELECT s.command, s.query, COUNT(*) AS searches, COUNT(DISTINCT s.user_id) AS users
    FROM searches s
    WHERE NOT EXISTS (
      SELECT 1 FROM tsukibot.usage_events c
      WHERE c.event_type = 'command' AND c.user_id = s.user_id AND c.command = s.command
        AND c.occurred_at BETWEEN s.occurred_at - INTERVAL '10 seconds'
                              AND s.occurred_at + INTERVAL '60 seconds'
    )
    GROUP BY s.command, s.query
    ORDER BY searches DESC
    LIMIT $2
  `, [windowInterval(days), limit]);
}

/**
 * Who stopped coming and who came back: users active in the previous window but
 * not this one (churned), and users active now who skipped the previous window
 * after being seen before it (resurrected). The simple counts that a proper
 * cohort curve would need a year of data to improve on.
 * @param {number} days
 */
async function getChurn(days) {
  const [row] = await query(`
    WITH current_users AS (
      SELECT DISTINCT user_id FROM tsukibot.usage_events
      WHERE occurred_at > NOW() - $1::interval AND event_type <> 'system'
    ),
    prior_users AS (
      SELECT DISTINCT user_id FROM tsukibot.usage_events
      WHERE occurred_at <= NOW() - $1::interval AND occurred_at > NOW() - ($1::interval * 2)
        AND event_type <> 'system'
    ),
    older_users AS (
      SELECT DISTINCT user_id FROM tsukibot.usage_events
      WHERE occurred_at <= NOW() - ($1::interval * 2) AND event_type <> 'system'
    )
    SELECT
      (SELECT COUNT(*) FROM current_users)                                                   AS active,
      (SELECT COUNT(*) FROM current_users WHERE user_id IN (SELECT user_id FROM prior_users)) AS retained,
      (SELECT COUNT(*) FROM prior_users WHERE user_id NOT IN (SELECT user_id FROM current_users)) AS churned,
      (SELECT COUNT(*) FROM current_users
        WHERE user_id NOT IN (SELECT user_id FROM prior_users)
          AND user_id IN (SELECT user_id FROM older_users))                                  AS resurrected
  `, [windowInterval(days)]);
  return row;
}

/* --------------------------------------------------------------------------
 *  Watchdog windows
 *
 *  Short recent windows against a seven-day baseline. Hobby-scale traffic makes
 *  one-hour baselines noise, so callers are expected to use windows of several
 *  hours and to apply minimum-volume floors before calling anything a spike.
 * -------------------------------------------------------------------------- */

/**
 * Error rate over the last N hours and over the trailing seven days, for
 * user-initiated events only (a failed CoinGecko call is reported separately).
 * @param {number} hours
 */
async function getErrorRateWindows(hours) {
  const [row] = await query(`
    SELECT
      COUNT(*) FILTER (WHERE occurred_at > NOW() - $1::interval)                          AS recent_events,
      COUNT(*) FILTER (WHERE occurred_at > NOW() - $1::interval AND outcome = 'error')    AS recent_errors,
      COUNT(*)                                                                             AS baseline_events,
      COUNT(*) FILTER (WHERE outcome = 'error')                                            AS baseline_errors
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - INTERVAL '7 days'
      AND event_type IN ('command', 'button')
  `, [hoursInterval(hours)]);
  return row;
}

/**
 * The faults behind a recent error spike, so the alert can say which one.
 * @param {number} hours
 * @param {number} limit
 */
async function getRecentErrorKinds(hours, limit) {
  return query(`
    SELECT command, COALESCE(error_kind, 'unknown') AS error_kind,
           COUNT(*) AS occurrences, COUNT(DISTINCT user_id) AS users_affected
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval AND outcome = 'error'
      AND event_type IN ('command', 'button')
    GROUP BY command, error_kind
    ORDER BY occurrences DESC
    LIMIT $2
  `, [hoursInterval(hours), limit]);
}

/**
 * Per-command p95 over the last N hours against the trailing week, for commands
 * with enough recent samples to mean anything.
 * @param {number} hours
 * @param {number} minSamples
 */
async function getLatencyRegressions(hours, minSamples) {
  return query(`
    SELECT
      command,
      COUNT(*) FILTER (WHERE occurred_at > NOW() - $1::interval)                          AS recent_samples,
      PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms)
        FILTER (WHERE occurred_at > NOW() - $1::interval)                                 AS recent_p95_ms,
      COUNT(*)                                                                             AS baseline_samples,
      PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms)                            AS baseline_p95_ms
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - INTERVAL '7 days'
      AND event_type = 'command' AND duration_ms IS NOT NULL
    GROUP BY command
    HAVING COUNT(*) FILTER (WHERE occurred_at > NOW() - $1::interval) >= $2
    ORDER BY recent_p95_ms DESC
  `, [hoursInterval(hours), minSamples]);
}

/**
 * CoinGecko calls that were rate limited recently. Any at all is worth a word:
 * a 429 still spends the credit and returns nothing.
 * @param {number} hours
 */
async function getRecentRateLimits(hours) {
  const [row] = await query(`
    SELECT COUNT(*) AS ratelimited, MAX(occurred_at) AS last_seen
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
      AND command = 'coingecko-call' AND outcome = 'ratelimited'
  `, [hoursInterval(hours)]);
  return row;
}

module.exports = {
  init,
  windowInterval,
  hoursInterval,
  normalizeTimezone,
  getActivityRate,
  getApiCreditsByEndpoint,
  getApiCreditTotals,
  getApiCreditsByDay,
  getApiCreditsMonthToDate,
  getApiCreditsByDayAndEndpoint,
  getApiCreditsMonthComparison,
  perMinuteRate,
  getOverview,
  getOverviewComparison,
  getTopCommands,
  getTopUsers,
  getTopGuilds,
  getTopCoins,
  getCoinMomentum,
  getNewCoins,
  getHourlyActivity,
  getWeekdayActivity,
  getActivityGrid,
  getDailySeries,
  getLatencyByDay,
  getParameterUsage,
  getOptionCoverage,
  getSubcommandSplit,
  getErrors,
  getSlowestCommands,
  getSearchFunnel,
  getAbandonedSearches,
  getGrowth,
  getRetention,
  getChurn,
  getErrorRateWindows,
  getRecentErrorKinds,
  getLatencyRegressions,
  getRecentRateLimits,
  getRecentEvents,
  getRecentEventsFiltered,
  getStorageStats,
  countOlderThan,
  pruneOlderThan
};
