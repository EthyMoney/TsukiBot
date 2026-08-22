/* ------------------------------------------------------------------------
 *
 *                   TsukiBot - src/telemetry-insights.js
 *
 * Proactive insights: the bot reports to its owner instead of waiting to be
 * asked. /usage answers questions; this module raises them.
 *
 * Two outputs, built on the comparison and watchdog queries in
 * telemetry-reports.js:
 *
 *   1. The weekly digest. One embed of week-over-week deltas - volume, reach,
 *      reliability, latency, credits, which commands and coins moved - plus a
 *      this-week-vs-last-week chart. Deltas rather than totals because a total
 *      needs a memory of last week's total to mean anything, and the owner does
 *      not have one.
 *
 *   2. The watchdog. Threshold checks run every half hour: error-rate spike,
 *      latency regression, CoinGecko rate limiting, credit budget overrun, and
 *      telemetry batches being dropped. Every check has an absolute floor as
 *      well as a multiplier, because hobby-scale traffic makes short baselines
 *      noise: three errors out of five events is a 60% error rate and also
 *      nothing. Alerts are debounced in memory to once per condition per UTC
 *      day, so a condition that stays tripped produces one DM, not forty-eight.
 *
 * The dropped-batch check runs first and without SQL, because the likeliest
 * cause of dropped batches is the database being down - in which case every
 * other check fails, and each is wrapped so that failure is logged and skipped
 * rather than taking the one check that could explain it down with it.
 *
 * Everything is injected (reports, telemetry, charts, send, clock) so the
 * whole module can be driven in tests without a database, a Discord client or
 * a real calendar. Delivery is the caller's concern: `send` is whatever DMs the
 * owners, and this file never touches a client.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

const DIGEST_IMAGE_NAME = 'usage-digest.png';
const COLOR_CRITICAL = '#ff5a76';
const COLOR_WARNING = '#ffb638';

/**
 * Defaults for both jobs. Every number is a floor or a multiplier chosen for a
 * bot that sees tens to hundreds of commands a day; a busier deployment can
 * raise the floors through the config passed to createInsights.
 */
const DEFAULT_CONFIG = {
  digest: {
    enabled: true,
    dayOfWeek: 1,      // Monday, 0 = Sunday
    hour: 9,           // in `timezone`
    timezone: 'UTC',
    days: 7
  },
  watchdog: {
    enabled: true,
    intervalMinutes: 30,
    errorWindowHours: 6,
    minEvents: 20,           // recent events needed before an error rate means anything
    minErrors: 5,            // and at least this many actual failures
    errorRateMultiplier: 3,  // recent rate must be this many times the 7-day baseline...
    errorRateFloor: 0.05,    // ...and at least this, so a 0.1% -> 0.4% blip is not a spike
    latencyWindowHours: 6,
    latencyMinSamples: 20,
    latencyMultiplier: 2,
    latencyFloorMs: 2000,
    rateLimitWindowHours: 24
  }
};

/* --------------------------------------------------------------------------
 *  Pure helpers
 * -------------------------------------------------------------------------- */

/** node-postgres hands back COUNT() and numerics as strings; null means zero here. */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Signed change marker for a week-over-week comparison.
 *
 *   deltaText(112, 100) -> '▲ +12%'
 *   deltaText(92, 100)  -> '▼ 8%'
 *   deltaText(5, 0)     -> '▲ new'     (nothing to compare against, but it exists now)
 *   deltaText(100, 100) -> '= 0%'
 *   deltaText(0, 0)     -> '–'         (nothing either week; also for null/undefined)
 *
 * Accepts the strings node-postgres returns. The suffix (' vs last week') is
 * appended to every form except the empty dash.
 *
 * @param {number|string|null} current
 * @param {number|string|null} prior
 * @param {{suffix?: string}} [options]
 * @returns {string}
 */
function deltaText(current, prior, { suffix = '' } = {}) {
  const c = num(current);
  const p = num(prior);
  if (c === 0 && p === 0) return '–';
  let text;
  if (p === 0) text = '▲ new';
  else {
    const pct = Math.round((c - p) / p * 100);
    if (pct > 0) text = '▲ +' + pct + '%';
    else if (pct < 0) text = '▼ ' + Math.abs(pct) + '%';
    else text = '= 0%';
  }
  return text + (suffix || '');
}

/**
 * Whole UTC days left in the month after today, so a projection lands on the
 * quota's own reset boundary. Computed entirely in UTC: CoinGecko's month and
 * the calls_month count both are.
 * @param {Date} date
 * @returns {number}
 */
function utcDaysRemaining(date) {
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.max(0, daysInMonth - date.getUTCDate());
}

/** Same linear projection the /usage credits report draws: today's rate for every remaining day. */
function projectCredits(monthToDate, perDay, date) {
  return num(monthToDate) + num(perDay) * utcDaysRemaining(date);
}

/** The UTC calendar date a timestamp falls on, the unit the watchdog debounces by. */
function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

/** Two-level merge of plain objects, so a caller can override one threshold without restating the rest. */
function mergeConfig(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    const nested = value && typeof value === 'object' && !Array.isArray(value) &&
      base[key] && typeof base[key] === 'object';
    if (nested) out[key] = mergeConfig(base[key], value);
    else if (value !== undefined) out[key] = value;
  }
  return out;
}

/* --------------------------------------------------------------------------
 *  Factory
 * -------------------------------------------------------------------------- */

/**
 * Builds the digest and watchdog against injected dependencies.
 *
 * @param {object} deps
 * @param {object} deps.reports telemetry-reports (or a fake with the same async functions)
 * @param {object} deps.telemetry telemetry (getWriterStats, recordSystemEvent)
 * @param {(payload: {content?: string, embeds: object[], files?: object[]}) => Promise<void>} deps.send
 *   delivers a message to the owner(s); the only thing here that knows about Discord delivery
 * @param {object} [deps.charts] telemetry-charts; injectable so tests can stub renderPng
 * @param {object} [deps.embeds] telemetry-embeds; only usageEmbed and DEMO_MONTHLY_CREDITS are used
 * @param {object} [deps.render] telemetry-render
 * @param {() => number} [deps.getBudget] monthly CoinGecko credit budget
 * @param {object} [deps.config] deep-merged over DEFAULT_CONFIG
 * @param {(msg: string) => void} [deps.log]
 * @param {(msg: string) => void} [deps.logError]
 * @param {() => Date} [deps.now] clock, for tests
 */
function createInsights({
  reports,
  telemetry,
  charts,
  embeds,
  render,
  send,
  getBudget,
  config,
  log,
  logError,
  now
} = {}) {
  // Lazy requires keep the module free of load-order concerns and let every
  // dependency be swapped out in tests.
  reports = reports || require('./telemetry-reports');
  telemetry = telemetry || require('./telemetry');
  charts = charts || require('./telemetry-charts');
  embeds = embeds || require('./telemetry-embeds');
  render = render || require('./telemetry-render');
  send = typeof send === 'function' ? send : async () => { };
  getBudget = typeof getBudget === 'function'
    ? getBudget
    : () => num(embeds.DEMO_MONTHLY_CREDITS) || 10000;
  log = typeof log === 'function' ? log : () => { };
  logError = typeof logError === 'function' ? logError : () => { };
  now = typeof now === 'function' ? now : () => new Date();

  const resolved = mergeConfig(DEFAULT_CONFIG, config);

  const compact = (v) => render.compactNumber(num(v));
  const budget = () => {
    const b = num(getBudget());
    return b > 0 ? b : 10000;
  };

  /* ------------------------------------------------------------------------
   *  Weekly digest
   * ---------------------------------------------------------------------- */

  /**
   * Runs one optional query of the digest. A section that fails is logged and
   * rendered as unavailable rather than taking the whole digest with it: the
   * headline still goes out, and the missing section is itself a signal.
   */
  async function section(name, fn, fallback) {
    try {
      const value = await fn();
      return value === undefined || value === null ? fallback : value;
    }
    catch (err) {
      logError(`Usage digest: ${name} failed: ` + (err && err.message ? err.message : err));
      return fallback;
    }
  }

  /** Command | Uses | Δ | Rank rows for the top-commands table. */
  function rankCommands(current, prior) {
    const priorRank = new Map();
    (prior || []).forEach((row, index) => {
      if (row && row.name && !priorRank.has(row.name)) priorRank.set(row.name, { index, uses: row.uses });
    });

    return (current || []).slice(0, 5).map((row, index) => {
      const before = priorRank.get(row.name);
      let rank = 'new';
      if (before) {
        const moved = before.index - index;
        rank = moved > 0 ? '↑' + moved : moved < 0 ? '↓' + Math.abs(moved) : '=';
      }
      return {
        name: row.name || '-',
        uses: num(row.uses),
        delta: deltaText(row.uses, before ? before.uses : 0),
        rank
      };
    });
  }

  /** The three coin lines: new entrants to the top 10, biggest risers, first-ever coins. */
  function coinLines({ topNow, topPrior, momentum, newCoins }) {
    const lines = [];

    const priorSet = new Set((topPrior || []).map(row => row.coin));
    const entrants = (topNow || []).map(row => row.coin).filter(coin => coin && !priorSet.has(coin));
    if (entrants.length) lines.push('**Entered the top 10:** ' + entrants.join(', '));

    const risers = (momentum || [])
      .map(row => ({
        coin: row.coin,
        current: num(row.current_requests),
        prior: num(row.prior_requests),
        users: num(row.current_users)
      }))
      // A coin going 1 -> 4 is +300% and also noise; demand has to exist on at least one side.
      .filter(row => row.coin && (row.prior >= 3 || (row.prior === 0 && row.current >= 3)))
      .filter(row => row.current > row.prior)
      .sort((a, b) => (b.current - b.prior) - (a.current - a.prior))
      .slice(0, 3);
    if (risers.length) {
      lines.push('**Rising:** ' + risers
        .map(row => `${row.coin} ${row.prior}→${row.current} (${deltaText(row.current, row.prior)})`)
        .join(' · '));
    }

    const fresh = (newCoins || []).filter(row => row && row.coin);
    if (fresh.length) {
      lines.push('**New to the bot:** ' + fresh
        .map(row => `${row.coin} ×${num(row.requests)}`)
        .join(' · '));
    }

    return lines;
  }

  /**
   * Builds the weekly digest embed (and its chart attachment, when one can be
   * rendered). The overview comparison is the one query that must succeed;
   * every other section degrades on its own.
   * @param {{days?: number, timezone?: string}} [options]
   * @returns {Promise<{embed: EmbedBuilder, files: AttachmentBuilder[]}>}
   */
  async function buildWeeklyDigest({ days = resolved.digest.days, timezone = resolved.digest.timezone } = {}) {
    days = clamp(days, 1, 365, 7);
    timezone = timezone || 'UTC';
    const at = now();

    const overview = (await reports.getOverviewComparison(days)) || {};

    const [topNow, topPrior, coinsNow, coinsPrior, momentum, newCoins, creditTotals, creditMonth,
      rateLimits, churn, series] = await Promise.all([
      section('top commands', () => reports.getTopCommands(days, 10, false), []),
      section('prior top commands', () => reports.getTopCommands(days, 50, false, { priorWindow: true }), []),
      section('top coins', () => reports.getTopCoins(days, 10), []),
      section('prior top coins', () => reports.getTopCoins(days, 10, { priorWindow: true }), []),
      section('coin momentum', () => reports.getCoinMomentum(days, 100), []),
      section('new coins', () => reports.getNewCoins(days, 5), []),
      section('credit totals', () => reports.getApiCreditTotals(), null),
      section('credit month comparison', () => reports.getApiCreditsMonthComparison(), null),
      section('rate limits', () => reports.getRecentRateLimits(days * 24), null),
      section('churn', () => reports.getChurn(days), null),
      section('daily series', () => reports.getDailySeries(days * 2, timezone), [])
    ]);

    const embed = embeds.usageEmbed('Weekly usage digest', days, timezone);

    // Headline ------------------------------------------------------------
    const periodLabel = days === 7 ? 'this week' : `in the last ${days} days`;
    const priorLabel = days === 7 ? ' vs last week' : ' vs the period before';
    const headline = [
      `**${compact(overview.events)}** events ${periodLabel} ` +
        `(${deltaText(overview.events, overview.prior_events, { suffix: priorLabel })})`,
      `**${compact(overview.users)}** active users (${deltaText(overview.users, overview.prior_users)})`,
      `**${compact(overview.errors)}** errors`,
      `**${compact(overview.credits)}** credits`
    ].join(' · ');

    const descriptionLines = [headline];
    let writer;
    try {
      writer = telemetry.getWriterStats ? telemetry.getWriterStats() : null;
    }
    catch {
      writer = null;
    }
    if (writer && num(writer.dropped) > 0) {
      descriptionLines.push(
        `⚠️ **Telemetry writer** has dropped **${compact(writer.dropped)}** events since the last restart, ` +
        'so the numbers here may run low.');
    }
    embed.setDescription(render.truncate(descriptionLines.join('\n'), 4000));

    // This week vs last -----------------------------------------------------
    embed.addFields({
      name: 'This week vs last',
      value: render.codeBlock(render.renderKeyValue([
        ['Events', `${compact(overview.events)} (${deltaText(overview.events, overview.prior_events)})`],
        ['Commands', `${compact(overview.command_events)} (${deltaText(overview.command_events, overview.prior_command_events)})`],
        ['Active users', `${compact(overview.users)} (${deltaText(overview.users, overview.prior_users)})`],
        ['Servers', `${compact(overview.guilds)} (${deltaText(overview.guilds, overview.prior_guilds)})`],
        ['Errors', `${compact(overview.errors)} (${deltaText(overview.errors, overview.prior_errors)})`],
        ['Error rate', `${render.percent(overview.errors, overview.events)} (was ${render.percent(overview.prior_errors, overview.prior_events)})`],
        ['p95 latency', `${render.formatDuration(overview.p95_ms)} (${deltaText(overview.p95_ms, overview.prior_p95_ms)})`],
        ['CoinGecko credits', `${compact(overview.credits)} (${deltaText(overview.credits, overview.prior_credits)})`]
      ]))
    });

    // Top commands ----------------------------------------------------------
    const ranked = rankCommands(topNow, topPrior);
    embed.addFields({
      name: 'Top commands',
      value: render.codeBlock(render.renderTable(ranked, [
        { key: 'name', label: 'Command', width: 18 },
        { key: 'uses', label: 'Uses', width: 6, align: 'right', format: compact },
        { key: 'delta', label: 'Δ', width: 8 },
        { key: 'rank', label: 'Rank', width: 4 }
      ]))
    });

    // Coins -----------------------------------------------------------------
    const coins = coinLines({ topNow: coinsNow, topPrior: coinsPrior, momentum, newCoins });
    if (coins.length) {
      embed.addFields({ name: 'Coins', value: render.truncate(coins.join('\n'), 1000) });
    }

    // CoinGecko credits -----------------------------------------------------
    if (creditTotals) {
      const monthToDate = num(creditTotals.calls_month);
      const perDay = num(creditTotals.calls_24h);
      const projected = projectCredits(monthToDate, perDay, at);
      const cap = budget();
      const ratelimitedThisWeek = rateLimits ? num(rateLimits.ratelimited) : 0;
      const flagged = projected > cap || ratelimitedThisWeek > 0;

      const pairs = [
        ['Month to date', `${compact(monthToDate)} / ${compact(cap)} (${render.percent(monthToDate, cap, 0)})`],
        ['Projected', `${compact(projected)}${projected > cap ? ' over budget' : ''}`],
        ['Last 24h', `${compact(perDay)}/day`]
      ];
      if (creditMonth) {
        pairs.push(['vs last month here', deltaText(monthToDate, creditMonth.prior_month_same_point)]);
        pairs.push(['Last month total', compact(creditMonth.prior_month_total)]);
      }
      if (ratelimitedThisWeek > 0) pairs.push(['Rate limited', compact(ratelimitedThisWeek) + ' this week']);

      embed.addFields({
        name: flagged ? 'CoinGecko credits ⚠️' : 'CoinGecko credits',
        value: render.codeBlock(render.renderKeyValue(pairs))
      });
    }

    // Retention -------------------------------------------------------------
    if (churn) {
      embed.addFields({
        name: 'Retention',
        value: `**${compact(churn.retained)}** of **${compact(churn.active)}** active users were also here last ` +
          `period · **${compact(churn.churned)}** churned · **${compact(churn.resurrected)}** came back`
      });
    }

    // Chart -----------------------------------------------------------------
    let files = [];
    try {
      if (charts && charts.isAvailable() && Array.isArray(series) && series.length >= 2) {
        const svg = charts.weekOverWeekChart({ series, title: 'This week vs last week', metricLabel: 'events' });
        const png = await charts.renderPng(svg);
        if (png) {
          files = [new AttachmentBuilder(png, { name: DIGEST_IMAGE_NAME })];
          embed.setImage('attachment://' + DIGEST_IMAGE_NAME);
        }
      }
    }
    catch (err) {
      // The chart is a bonus on top of the numbers; the digest goes out without it.
      logError('Usage digest: chart failed: ' + (err && err.message ? err.message : err));
      files = [];
    }

    return { embed, files };
  }

  /**
   * Builds and delivers the digest, recording the attempt as a system event.
   * Never throws.
   * @returns {Promise<boolean>} whether it was sent
   */
  async function sendWeeklyDigest() {
    const params = { days: resolved.digest.days, timezone: resolved.digest.timezone };
    try {
      const { embed, files } = await buildWeeklyDigest(params);
      await send({ embeds: [embed], files });
      telemetry.recordSystemEvent('usage-digest', { params, outcome: 'ok' });
      log('Sent the weekly usage digest.');
      return true;
    }
    catch (err) {
      logError('Weekly usage digest failed: ' + (err && err.message ? err.message : err));
      try {
        telemetry.recordSystemEvent('usage-digest', { params, outcome: 'error', error: err });
      }
      catch {
        // telemetry is fire-and-forget by contract; nothing more to do
      }
      return false;
    }
  }

  /* ------------------------------------------------------------------------
   *  Watchdog
   * ---------------------------------------------------------------------- */

  const w = resolved.watchdog;
  let lastDropped = null;          // writer drop count at the previous check; null until the first
  const fired = new Map();         // condition key -> UTC date it last fired

  /**
   * Evaluates every condition and returns the ones that are tripped and have not
   * already fired today. Marking happens here, not on send, so two callers in
   * the same minute cannot both get the same alert.
   *
   * With force, every tripped condition is returned regardless of the debounce
   * and nothing is marked or baselined: that is the on-demand /usage watchdog,
   * which must neither hide a condition the scheduler already reported today
   * nor suppress the scheduler's next report.
   * @param {{force?: boolean}} [options]
   * @returns {Promise<Array<{key: string, severity: 'warning'|'critical', title: string, detail: string}>>}
   */
  async function checkWatchdog({ force = false } = {}) {
    const at = now();
    const today = utcDateKey(at);
    const alerts = [];

    // Entries from earlier days are spent; drop them so the map never grows past the key count.
    if (!force) for (const [key, day] of fired) if (day !== today) fired.delete(key);

    const raise = (key, severity, title, detail) => {
      if (!force) {
        if (fired.get(key) === today) return;
        fired.set(key, today);
      }
      alerts.push({ key, severity, title, detail });
    };

    const check = async (name, fn) => {
      try {
        await fn();
      }
      catch (err) {
        logError(`Usage watchdog: ${name} check failed: ` + (err && err.message ? err.message : err));
      }
    };

    // 1. Dropped batches - in memory, no SQL, and first, because when the
    //    database is down this is the only check that can still speak.
    try {
      const stats = telemetry.getWriterStats ? telemetry.getWriterStats() : null;
      const dropped = stats ? num(stats.dropped) : 0;
      if (force) {
        // A manual run reports the total since restart and leaves the scheduler's baseline alone.
        if (dropped > 0) {
          raise('dropped-batches', 'critical', 'Telemetry batches dropped',
            `**${compact(dropped)}** events have been dropped since the last restart. The usual cause ` +
            'is the database being unreachable, in which case every report is stale too.');
        }
      }
      else {
        if (lastDropped === null) lastDropped = dropped;
        else if (dropped > lastDropped) {
          raise('dropped-batches', 'critical', 'Telemetry batches dropped',
            `**${compact(dropped - lastDropped)}** events were dropped since the last check ` +
            `(${compact(dropped)} since the last restart). The usual cause is the database being ` +
            'unreachable, in which case every report and the other checks here are stale too.');
        }
        lastDropped = dropped;
      }
    }
    catch (err) {
      logError('Usage watchdog: writer stats unavailable: ' + (err && err.message ? err.message : err));
    }

    // 2. Error-rate spike.
    await check('error-spike', async () => {
      const r = (await reports.getErrorRateWindows(w.errorWindowHours)) || {};
      const recentEvents = num(r.recent_events);
      const recentErrors = num(r.recent_errors);
      const baselineEvents = num(r.baseline_events);
      const baselineErrors = num(r.baseline_errors);
      const recentRate = recentEvents > 0 ? recentErrors / recentEvents : 0;
      const baselineRate = baselineEvents > 0 ? baselineErrors / baselineEvents : 0;
      const threshold = Math.max(baselineRate * w.errorRateMultiplier, w.errorRateFloor);

      if (recentEvents >= w.minEvents && recentErrors >= w.minErrors && recentRate >= threshold) {
        let kinds = [];
        try {
          kinds = (await reports.getRecentErrorKinds(w.errorWindowHours, 3)) || [];
        }
        catch (err) {
          logError('Usage watchdog: error kinds unavailable: ' + (err && err.message ? err.message : err));
        }
        const lines = kinds.map(k =>
          `• ${k.command || '?'} · ${k.error_kind || 'unknown'} ×${num(k.occurrences)} ` +
          `(${num(k.users_affected)} user${num(k.users_affected) === 1 ? '' : 's'})`);
        raise('error-spike', 'critical', 'Error rate spike',
          `**${render.percent(recentErrors, recentEvents)}** of commands failed in the last ` +
          `${w.errorWindowHours}h (${recentErrors} of ${recentEvents}) against a 7-day baseline of ` +
          `${render.percent(baselineErrors, baselineEvents)}.` +
          (lines.length ? '\n' + lines.join('\n') : ''));
      }
    });

    // 3. Latency regression.
    await check('latency-regression', async () => {
      const rows = (await reports.getLatencyRegressions(w.latencyWindowHours, w.latencyMinSamples)) || [];
      const tripped = rows.filter(row => {
        const recent = num(row.recent_p95_ms);
        const baseline = num(row.baseline_p95_ms);
        return recent >= baseline * w.latencyMultiplier && recent >= w.latencyFloorMs;
      });
      if (tripped.length) {
        const lines = tripped.slice(0, 5).map(row =>
          `• ${row.command || '?'} p95 ${render.formatDuration(num(row.recent_p95_ms))} ` +
          `(was ${render.formatDuration(num(row.baseline_p95_ms))})`);
        raise('latency-regression', 'warning', 'Latency regression',
          `p95 over the last ${w.latencyWindowHours}h is at least ${w.latencyMultiplier}× the 7-day ` +
          `baseline for ${tripped.length} command${tripped.length === 1 ? '' : 's'}:\n` + lines.join('\n'));
      }
    });

    // 4. CoinGecko rate limiting.
    await check('rate-limited', async () => {
      const r = (await reports.getRecentRateLimits(w.rateLimitWindowHours)) || {};
      const count = num(r.ratelimited);
      if (count > 0) {
        raise('rate-limited', 'warning', 'CoinGecko rate limited',
          `**${compact(count)}** CoinGecko call${count === 1 ? ' was' : 's were'} rate limited in the last ` +
          `${w.rateLimitWindowHours}h (last ${render.formatRelative(r.last_seen, at)}). ` +
          'A 429 still spends the credit and returns nothing.');
      }
    });

    // 5. Credit budget.
    await check('credit-budget', async () => {
      const totals = (await reports.getApiCreditTotals()) || {};
      const monthToDate = num(totals.calls_month);
      const perDay = num(totals.calls_24h);
      const projected = projectCredits(monthToDate, perDay, at);
      const cap = budget();
      if (projected > cap || monthToDate > cap) {
        const daysLeft = utcDaysRemaining(at);
        raise('credit-budget', 'critical', 'CoinGecko credit budget',
          `Month to date **${compact(monthToDate)}** of **${compact(cap)}** ` +
          `(${render.percent(monthToDate, cap, 0)}) · projected **${compact(projected)}** at the last 24h ` +
          `rate of ${compact(perDay)}/day with ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` +
          (monthToDate > cap ? ' · **already over budget**' : '') + '.');
      }
    });

    return alerts;
  }

  /**
   * One embed for a batch of alerts: a field per condition, red if anything is
   * critical, amber otherwise.
   * @param {Array<{key: string, severity: string, title: string, detail: string}>} alerts
   * @returns {EmbedBuilder}
   */
  function buildWatchdogEmbed(alerts) {
    const list = Array.isArray(alerts) ? alerts : [];
    const critical = list.some(a => a.severity === 'critical');
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Usage watchdog')
      .setColor(critical ? COLOR_CRITICAL : COLOR_WARNING)
      .setDescription(`${list.length} condition${list.length === 1 ? '' : 's'} tripped.`)
      .setFooter({ text: 'TsukiBot telemetry watchdog · fires once per condition per day' })
      .setTimestamp();
    for (const alert of list.slice(0, 25)) {
      embed.addFields({
        name: render.truncate(`${alert.severity === 'critical' ? '🔴' : '🟠'} ${alert.title || alert.key}`, 256),
        value: render.truncate(alert.detail || '-', 1024)
      });
    }
    return embed;
  }

  /**
   * Checks, sends if anything tripped, records the firing. Never throws.
   * @returns {Promise<Array<object>>} the alerts that were sent (empty when none or on failure)
   */
  async function runWatchdog() {
    let alerts;
    try {
      alerts = await checkWatchdog();
    }
    catch (err) {
      logError('Usage watchdog failed: ' + (err && err.message ? err.message : err));
      return [];
    }
    if (alerts.length === 0) return alerts;

    const conditions = alerts.map(a => a.key);
    try {
      await send({ embeds: [buildWatchdogEmbed(alerts)] });
      telemetry.recordSystemEvent('usage-watchdog', { params: { conditions }, outcome: 'ok' });
      log('Usage watchdog fired: ' + conditions.join(', '));
      return alerts;
    }
    catch (err) {
      // Delivery failed, so the conditions have not actually been reported: release the debounce
      // and let the next run try again.
      for (const key of conditions) fired.delete(key);
      logError('Usage watchdog could not send: ' + (err && err.message ? err.message : err));
      try {
        telemetry.recordSystemEvent('usage-watchdog', { params: { conditions }, outcome: 'error', error: err });
      }
      catch {
        // fire-and-forget
      }
      return [];
    }
  }

  /* ------------------------------------------------------------------------
   *  Scheduling helpers and test seams
   * ---------------------------------------------------------------------- */

  /**
   * node-schedule's {rule, tz} form for the digest: once a week at the
   * configured local hour.
   * @returns {{rule: string, tz: string}}
   */
  function digestRule() {
    const d = resolved.digest;
    const minute = clamp(d.minute, 0, 59, 0);
    const hour = clamp(d.hour, 0, 23, DEFAULT_CONFIG.digest.hour);
    const dayOfWeek = clamp(d.dayOfWeek, 0, 6, DEFAULT_CONFIG.digest.dayOfWeek);
    return { rule: `${minute} ${hour} * * ${dayOfWeek}`, tz: d.timezone || 'UTC' };
  }

  /**
   * Cron string for the watchdog: every N minutes, N clamped to 5..60.
   * @returns {string}
   */
  function watchdogRule() {
    const n = clamp(resolved.watchdog.intervalMinutes, 5, 60, DEFAULT_CONFIG.watchdog.intervalMinutes);
    return n === 60 ? '0 * * * *' : `*/${n} * * * *`;
  }

  /** Snapshot of the debounce map and drop baseline, for tests and diagnostics. */
  function debounceState() {
    return { fired: Object.fromEntries(fired), lastDropped };
  }

  /** Forgets every debounce and the drop baseline. */
  function resetDebounce() {
    fired.clear();
    lastDropped = null;
  }

  return {
    buildWeeklyDigest,
    sendWeeklyDigest,
    checkWatchdog,
    buildWatchdogEmbed,
    runWatchdog,
    digestRule,
    watchdogRule,
    debounceState,
    resetDebounce,
    get config() {
      return resolved;
    }
  };
}

module.exports = {
  createInsights,
  DEFAULT_CONFIG,
  deltaText
};
