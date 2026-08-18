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
      ROUND(AVG(duration_ms))                                     AS avg_ms,
      PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY duration_ms)    AS p50_ms,
      PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms)   AS p95_ms,
      MIN(occurred_at)                                            AS first_event
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
  `, [interval]);

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
 *  Leaderboards
 * -------------------------------------------------------------------------- */

/**
 * Most used commands, with the reach and reliability of each. Subcommands are
 * folded into the name ("portfolio show") because that is the unit a user
 * actually invokes.
 * @param {number} days
 * @param {number} limit
 * @param {boolean} includeAutocomplete
 */
async function getTopCommands(days, limit, includeAutocomplete = false) {
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
    WHERE occurred_at > NOW() - $1::interval
      AND (event_type = 'command' OR ($3 AND event_type <> 'system'))
    GROUP BY name
    ORDER BY uses DESC
    LIMIT $2
  `, [windowInterval(days), limit, includeAutocomplete]);
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
 */
async function getTopCoins(days, limit) {
  return query(`
    SELECT
      coin,
      COUNT(*)                               AS requests,
      COUNT(DISTINCT user_id)                AS users,
      MODE() WITHIN GROUP (ORDER BY command) AS via_command
    FROM tsukibot.usage_events, UNNEST(coins) AS coin
    WHERE occurred_at > NOW() - $1::interval
    GROUP BY coin
    ORDER BY requests DESC
    LIMIT $2
  `, [windowInterval(days), limit]);
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
      COUNT(*)                                            AS events
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
      COUNT(DISTINCT user_id)            AS users
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
 */
async function getErrors(days, limit) {
  return query(`
    SELECT
      command,
      COALESCE(error_kind, 'unknown') AS error_kind,
      COUNT(*)                        AS occurrences,
      COUNT(DISTINCT user_id)         AS users_affected,
      MAX(occurred_at)                AS last_seen
    FROM tsukibot.usage_events
    WHERE occurred_at > NOW() - $1::interval
      AND outcome = 'error'
    GROUP BY command, error_kind
    ORDER BY occurrences DESC
    LIMIT $2
  `, [windowInterval(days), limit]);
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

module.exports = {
  init,
  windowInterval,
  normalizeTimezone,
  getActivityRate,
  perMinuteRate,
  getOverview,
  getTopCommands,
  getTopUsers,
  getTopGuilds,
  getTopCoins,
  getHourlyActivity,
  getWeekdayActivity,
  getActivityGrid,
  getDailySeries,
  getParameterUsage,
  getOptionCoverage,
  getSubcommandSplit,
  getErrors,
  getSlowestCommands,
  getGrowth,
  getRetention,
  getRecentEvents,
  getStorageStats,
  pruneOlderThan
};
