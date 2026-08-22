/* ------------------------------------------------------------------------
 *
 *                  TsukiBot - src/telemetry-dashboard.js
 *
 * The localhost telemetry dashboard: a small Express app that serves the
 * usage reports as JSON plus a single-page viewer for the bot owner's browser.
 * It exists because the /usage embeds are one-shot, ephemeral and capped by
 * Discord's field limits; a page can hold every column, every row, and a chart
 * you can actually read.
 *
 * Design:
 *
 *   1. Owner-only. Nothing is served without a token (except /healthz).
 *      Tokens are random 128-bit values minted on demand by the caller - in
 *      practice the /usage dashboard subcommand, which already sits behind
 *      the bot-admin check - held in an in-memory Map with a TTL and never
 *      written anywhere. A restart forgets them all, which is the point.
 *
 *   2. The token travels once. The sign-in link carries ?token=; the first
 *      request exchanges it for an HttpOnly, SameSite=Strict cookie and
 *      302-redirects to the same path without the query string, so the secret
 *      leaves the URL bar and the browser history. The cookie is parsed by
 *      hand from the Cookie header: there is exactly one cookie and its value
 *      is 32 hex characters, which does not justify a cookie-parser dependency.
 *
 *   3. Loopback by default. start() binds 127.0.0.1 like the chart and price
 *      servers in main.js, so only a browser on the bot's host - or an SSH
 *      tunnel (ssh -L 8090:127.0.0.1:8090 host) - can reach it. Docker note:
 *      a loopback bind inside a container is unreachable from the host, so
 *      in a container the app must bind 0.0.0.0 (start({ host: '0.0.0.0' }))
 *      and docker-compose should publish the port host-loopback-only as
 *      "127.0.0.1:8090:8090". The token gate is what keeps that publish safe.
 *
 *   4. Thin API. Every /api/usage/* route is a few lines: clamp the query
 *      parameters, flush the telemetry buffer so the page is current, run the
 *      report functions (independent ones in parallel), return JSON. All the
 *      SQL, window bounding and bind parameters live in telemetry-reports.js;
 *      nothing here assembles a query. The one transformation applied is
 *      turning DATE columns (which node-postgres hands back as local-midnight
 *      Date objects) into plain 'YYYY-MM-DD' strings, because a Date
 *      serialised to UTC can land on the wrong calendar day when the process
 *      timezone is not UTC.
 *
 * The reports module, the telemetry writer and the credit budget are injected
 * through createDashboard() so the app can run in tests against fakes and so
 * this file stays free of main.js globals.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const express = require('express');

const DEFAULT_PORT = 8090;
const DEFAULT_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_BUDGET = 10000;

const COOKIE_NAME = 'tsuki_dash';
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

const DEFAULT_DAYS = 30;
const MAX_DAYS = 3650;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
// The Features tab's "top coins" lists are short by design: they sit beside a
// chart each, and the inventory queries group whole tables rather than a window.
const DEFAULT_FEATURE_LIMIT = 10;
const MAX_FEATURE_LIMIT = 50;

const STATIC_DIR = path.join(__dirname, 'dashboard');

/* --------------------------------------------------------------------------
 *  Small helpers
 * -------------------------------------------------------------------------- */

/**
 * Locates Chart.js's UMD bundle. The package's exports map does not expose its
 * dist files, so the bundle is found relative to the entry that does resolve.
 * @returns {string|null} absolute path, or null when the package is missing
 */
function resolveChartJs() {
  try {
    return path.join(path.dirname(require.resolve('chart.js')), 'chart.umd.js');
  } catch {
    return null;
  }
}

/**
 * Parses a Cookie header into a name -> value map. Deliberately minimal: the
 * dashboard sets one cookie whose value is hex, so quoting and encoding edge
 * cases never arise, but a malformed header must still not throw.
 * @param {string|undefined} header
 * @returns {Object<string, string>}
 */
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    let value = part.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/** Express's simple query parser yields arrays for repeated keys; take the first. */
function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Integer query parameter, clamped. Unparseable input falls back to the
 * default rather than erroring: a typo in the URL bar should still show a page.
 */
function clampInt(value, min, max, fallback) {
  const raw = first(value);
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Free-text query parameter: trimmed, bounded, undefined when absent or blank. */
function text(value, max = 200) {
  const raw = first(value);
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim();
  return s ? s.slice(0, max) : undefined;
}

/** 'YYYY-MM-DD' from a Date's local calendar fields (see header note 4). */
function localYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function plainDay(row) {
  return row && row.day instanceof Date ? { ...row, day: localYmd(row.day) } : row;
}

/** Applies plainDay to a row or to every row of an array. */
function plainDays(rows) {
  return Array.isArray(rows) ? rows.map(plainDay) : plainDay(rows);
}

/** The command part of a leaderboard name: "portfolio show" -> "portfolio". */
function commandNameFromParam(raw) {
  const cleaned = String(raw || '').trim().toLowerCase().replace(/^\/+/, '').trim();
  return cleaned.split(/\s+/)[0] || '';
}

function unauthorizedHtml() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>TsukiBot dashboard - sign in required</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a1c22;color:#e9ecf7;
       font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  main{max-width:32rem;padding:2rem;background:#22252e;border:1px solid #30343f;border-radius:12px}
  h1{font-size:1.2rem;margin:0 0 .5rem}
  p{margin:.5rem 0;color:#8b93ab}
  code{color:#9d8dff;background:#1a1c22;padding:.1rem .4rem;border-radius:4px}
</style></head>
<body><main>
  <h1>TsukiBot dashboard is owner-only</h1>
  <p>This page needs a sign-in link. Run <code>/usage dashboard</code> in Discord and open the link it gives you;
     the link sets a session cookie and expires after a while.</p>
  <p>No token, an expired token, or a revoked token all land here.</p>
</main></body></html>`;
}

/* --------------------------------------------------------------------------
 *  Factory
 * -------------------------------------------------------------------------- */

/**
 * Builds the dashboard app and its token store.
 *
 * @param {object} options
 * @param {object} options.reports the telemetry-reports module (or a fake with the same functions)
 * @param {object} [options.telemetry] the telemetry writer; when given, flush() is awaited before
 *   every report so the page reflects events still sitting in the buffer
 * @param {() => number} [options.getBudget] monthly CoinGecko credit budget, read per request so a
 *   config change needs no restart
 * @param {string[]} [options.registeredCommands] slash command names, for the page's command picker
 * @param {(msg: string) => void} [options.log]
 * @param {(msg: string, err?: Error) => void} [options.logError]
 * @returns {{
 *   app: import('express').Express,
 *   mintToken: (ttlMs?: number) => { token: string, expiresAt: number },
 *   revokeTokens: () => void,
 *   tokenCount: () => number,
 *   start: (opts?: { host?: string, port?: number }) => Promise<import('http').Server>,
 *   stop: () => Promise<void>,
 *   address: () => ({ host: string, port: number } | null)
 * }}
 */
function createDashboard({
  reports,
  telemetry = null,
  getBudget = () => DEFAULT_BUDGET,
  registeredCommands = [],
  log = () => { },
  logError = () => { }
} = {}) {
  if (!reports) throw new Error('createDashboard requires the telemetry reports module.');

  /* ---- token store ------------------------------------------------------ */

  const tokens = new Map(); // token -> expiry (epoch ms)

  function purgeExpired(now = Date.now()) {
    for (const [token, expiresAt] of tokens) {
      if (expiresAt <= now) tokens.delete(token);
    }
  }

  function isValidToken(candidate) {
    if (typeof candidate !== 'string' || !TOKEN_PATTERN.test(candidate)) return false;
    purgeExpired();
    return tokens.has(candidate);
  }

  /**
   * Creates a sign-in token. The caller puts it in a link such as
   * http://127.0.0.1:8090/dash?token=<token>.
   * @param {number} [ttlMs] lifetime; defaults to DEFAULT_TOKEN_TTL_MS
   * @returns {{ token: string, expiresAt: number }} expiresAt is epoch milliseconds
   */
  function mintToken(ttlMs = DEFAULT_TOKEN_TTL_MS) {
    purgeExpired();
    const ttl = Number(ttlMs);
    const life = Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TOKEN_TTL_MS;
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + life;
    tokens.set(token, expiresAt);
    return { token, expiresAt };
  }

  /** Invalidates every outstanding token (and so every signed-in browser). */
  function revokeTokens() {
    tokens.clear();
  }

  /** Number of unexpired tokens. */
  function tokenCount() {
    purgeExpired();
    return tokens.size;
  }

  /* ---- app -------------------------------------------------------------- */

  const app = express();
  app.disable('x-powered-by');

  // Security headers and the token gate, for everything but the health probe.
  app.use((req, res, next) => {
    res.set('X-Frame-Options', 'DENY');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');

    if (req.path === '/healthz') {
      next();
      return;
    }

    const queryToken = first(req.query.token);
    if (queryToken !== undefined) {
      if (isValidToken(queryToken)) {
        const remainingMs = Math.max(1000, tokens.get(queryToken) - Date.now());
        res.cookie(COOKIE_NAME, queryToken, {
          httpOnly: true,
          sameSite: 'strict',
          path: '/',
          maxAge: remainingMs
        });
        const target = new URL(req.originalUrl, 'http://localhost');
        target.searchParams.delete('token');
        const pathname = target.pathname === '/' ? '/dash' : target.pathname;
        res.set('Cache-Control', 'no-store');
        res.redirect(302, pathname + target.search);
        return;
      }
      // An invalid ?token= falls through: the cookie may still be good.
    }

    const cookies = parseCookies(req.headers.cookie);
    if (isValidToken(cookies[COOKIE_NAME])) {
      next();
      return;
    }

    res.set('Cache-Control', 'no-store');
    if (req.path.startsWith('/api/')) {
      res.status(401).json({ error: 'unauthorized' });
    } else {
      res.status(401).type('html').send(unauthorizedHtml());
    }
  });

  app.get('/healthz', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true });
  });

  app.get('/', (req, res) => {
    res.redirect(302, '/dash');
  });

  /* ---- static page ------------------------------------------------------ */

  const staticFiles = {
    '/dash': { file: path.join(STATIC_DIR, 'index.html'), type: 'text/html; charset=utf-8', cache: 'no-store' },
    '/dash/app.js': { file: path.join(STATIC_DIR, 'app.js'), type: 'text/javascript; charset=utf-8', cache: 'no-cache' },
    '/dash/style.css': { file: path.join(STATIC_DIR, 'style.css'), type: 'text/css; charset=utf-8', cache: 'no-cache' },
    '/dash/vendor/chart.umd.js': { file: resolveChartJs(), type: 'text/javascript; charset=utf-8', cache: 'private, max-age=86400' }
  };

  for (const [route, spec] of Object.entries(staticFiles)) {
    app.get(route, (req, res, next) => {
      if (!spec.file) {
        res.status(404).type('text/plain').send('Not found');
        return;
      }
      res.sendFile(spec.file, {
        cacheControl: false,
        headers: { 'Content-Type': spec.type, 'Cache-Control': spec.cache }
      }, (err) => {
        if (err) next(err);
      });
    });
  }

  /* ---- JSON API --------------------------------------------------------- */

  async function flushQuietly() {
    if (!telemetry || typeof telemetry.flush !== 'function') return;
    try {
      await telemetry.flush();
    } catch (err) {
      logError('Telemetry dashboard: flush before report failed: ' + (err && err.message), err);
    }
  }

  function writerStats() {
    if (!telemetry || typeof telemetry.getWriterStats !== 'function') return null;
    return telemetry.getWriterStats();
  }

  function windowParams(req) {
    return {
      days: clampInt(req.query.days, 1, MAX_DAYS, DEFAULT_DAYS),
      limit: clampInt(req.query.limit, 1, MAX_LIMIT, DEFAULT_LIMIT),
      tz: reports.normalizeTimezone(first(req.query.tz))
    };
  }

  /**
   * Wraps a report handler: flush first, run, send JSON with no-store, and
   * turn any throw into a 500 (or the error's own status) with the message.
   */
  function handle(fn, { flush = true } = {}) {
    return async (req, res) => {
      try {
        if (flush) await flushQuietly();
        const body = await fn(req, windowParams(req));
        res.set('Cache-Control', 'no-store');
        res.json(body);
      } catch (err) {
        const status = err && Number.isInteger(err.status) ? err.status : 500;
        if (status >= 500) logError(`Telemetry dashboard: ${req.method} ${req.originalUrl} failed: ${err && err.message}`, err);
        res.set('Cache-Control', 'no-store');
        res.status(status).json({ error: (err && err.message) || 'Internal error' });
      }
    };
  }

  const api = express.Router();

  api.get('/meta', handle(async () => {
    let timezones;
    try {
      timezones = Intl.supportedValuesOf('timeZone');
    } catch {
      timezones = [];
    }
    // ICU's list omits plain "UTC" on some Node builds, and UTC is the default everywhere else.
    if (!timezones.includes('UTC')) timezones = ['UTC', ...timezones];
    return {
      commands: Array.isArray(registeredCommands) ? registeredCommands : [],
      timezones,
      budget: getBudget(),
      now: new Date().toISOString()
    };
  }, { flush: false }));

  api.get('/overview', handle(async (req, { days }) => {
    const [overview, comparison, storage] = await Promise.all([
      reports.getOverview(days),
      reports.getOverviewComparison(days),
      reports.getStorageStats()
    ]);
    if (overview && overview.busiest) overview.busiest = plainDay(overview.busiest);
    return { overview, comparison, writer: writerStats(), storage };
  }));

  api.get('/daily', handle(async (req, { days, tz }) => {
    const [series, latency] = await Promise.all([
      reports.getDailySeries(days, tz),
      reports.getLatencyByDay(days, tz)
    ]);
    return { series: plainDays(series), latency: plainDays(latency) };
  }));

  api.get('/commands', handle(async (req, { days, limit }) => {
    const includeSearches = first(req.query.searches) === '1';
    const commands = await reports.getTopCommands(days, limit, includeSearches);
    return { commands };
  }));

  api.get('/command/:name', handle(async (req, { days, limit }) => {
    const name = commandNameFromParam(req.params.name);
    if (!name) {
      const err = new Error('A command name is required.');
      err.status = 400;
      throw err;
    }
    const [subcommands, coverage, values] = await Promise.all([
      reports.getSubcommandSplit(name, days),
      reports.getOptionCoverage(name, days),
      reports.getParameterUsage(name, days, limit)
    ]);
    return { name, subcommands, coverage, values };
  }));

  api.get('/users', handle(async (req, { days, limit }) => ({
    users: await reports.getTopUsers(days, limit)
  })));

  api.get('/guilds', handle(async (req, { days, limit }) => ({
    guilds: await reports.getTopGuilds(days, limit)
  })));

  api.get('/coins', handle(async (req, { days, limit }) => ({
    coins: await reports.getTopCoins(days, limit)
  })));

  api.get('/momentum', handle(async (req, { days, limit }) => {
    const [momentum, newCoins] = await Promise.all([
      reports.getCoinMomentum(days, limit),
      reports.getNewCoins(days, limit)
    ]);
    return { momentum, newCoins };
  }));

  api.get('/activity', handle(async (req, { days, tz }) => {
    const [hourly, weekday, grid] = await Promise.all([
      reports.getHourlyActivity(days, tz),
      reports.getWeekdayActivity(days, tz),
      reports.getActivityGrid(days, tz)
    ]);
    return { hourly, weekday, grid };
  }));

  api.get('/errors', handle(async (req, { days, limit, tz }) => {
    const [errors, slowest, latency] = await Promise.all([
      reports.getErrors(days, limit),
      reports.getSlowestCommands(days, limit),
      reports.getLatencyByDay(days, tz)
    ]);
    return { errors, slowest, latency: plainDays(latency) };
  }));

  api.get('/growth', handle(async (req, { days, tz }) => {
    const [growth, retention, churn] = await Promise.all([
      reports.getGrowth(days, tz),
      reports.getRetention(days),
      reports.getChurn(days)
    ]);
    return { growth: plainDays(growth), retention, churn };
  }));

  api.get('/credits', handle(async (req, { days, tz }) => {
    const [byEndpoint, totals, monthToDate, byDayEndpoint, comparison] = await Promise.all([
      reports.getApiCreditsByEndpoint(days),
      reports.getApiCreditTotals(),
      reports.getApiCreditsMonthToDate(),
      reports.getApiCreditsByDayAndEndpoint(days, tz),
      reports.getApiCreditsMonthComparison()
    ]);
    return {
      byEndpoint,
      totals,
      monthToDate: plainDays(monthToDate),
      byDayEndpoint: plainDays(byDayEndpoint),
      comparison,
      budget: getBudget()
    };
  }));

  api.get('/funnel', handle(async (req, { days, limit }) => {
    const [funnel, abandoned] = await Promise.all([
      reports.getSearchFunnel(days, limit),
      reports.getAbandonedSearches(days, limit)
    ]);
    return { funnel, abandoned };
  }));

  // Standing state (alerts, portfolios, schedules, watchlists) plus what happened
  // to those features in the window and the daily snapshots that give it a trend.
  api.get('/features', handle(async (req, { days }) => {
    const limit = clampInt(req.query.limit, 1, MAX_FEATURE_LIMIT, DEFAULT_FEATURE_LIMIT);
    const [inventory, activity, snapshots] = await Promise.all([
      reports.getFeatureInventory(limit),
      reports.getFeatureActivity(days),
      reports.getFeatureSnapshots(days)
    ]);
    return { inventory, activity, snapshots: plainDays(snapshots) };
  }));

  api.get('/events', handle(async (req, { days, limit }) => {
    const events = await reports.getRecentEventsFiltered({
      days,
      limit,
      command: text(req.query.command),
      userId: text(req.query.user),
      guildId: text(req.query.guild),
      coin: text(req.query.coin),
      outcome: text(req.query.outcome),
      errorKind: text(req.query.error_kind),
      eventType: text(req.query.type)
    });
    return { events };
  }));

  api.get('/storage', handle(async () => ({
    storage: await reports.getStorageStats(),
    writer: writerStats()
  })));

  api.use((req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(404).json({ error: 'not found' });
  });

  app.use('/api/usage', api);

  app.use((req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(404).type('text/plain').send('Not found');
  });

  // Express 5 forwards thrown and rejected errors here (e.g. a missing static file).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err && Number.isInteger(err.status) ? err.status : 500;
    if (status >= 500) logError(`Telemetry dashboard: ${req.method} ${req.originalUrl} failed: ${err && err.message}`, err);
    res.set('Cache-Control', 'no-store');
    if (req.path.startsWith('/api/')) {
      res.status(status).json({ error: (err && err.message) || 'Internal error' });
    } else {
      res.status(status).type('text/plain').send(status === 404 ? 'Not found' : 'Internal error');
    }
  });

  /* ---- lifecycle -------------------------------------------------------- */

  let server = null;

  /**
   * Starts listening. Resolves once bound; rejects on a bind error such as
   * EADDRINUSE so the caller can log it and carry on without a dashboard.
   * @param {{ host?: string, port?: number }} [opts] port 0 picks a free port
   * @returns {Promise<import('http').Server>}
   */
  function start({ host = '127.0.0.1', port = DEFAULT_PORT } = {}) {
    return new Promise((resolve, reject) => {
      if (server) {
        resolve(server);
        return;
      }
      const s = http.createServer(app);
      const onError = (err) => {
        s.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        s.removeListener('error', onError);
        server = s;
        s.on('error', (err) => logError('Telemetry dashboard server error: ' + (err && err.message), err));
        const addr = s.address();
        log(`Telemetry dashboard listening at http://${addr.address}:${addr.port}/dash`);
        resolve(s);
      };
      s.once('error', onError);
      s.once('listening', onListening);
      s.listen(port, host);
    });
  }

  /**
   * Stops listening and drops open connections, so a shutdown (or a test)
   * does not wait out keep-alive timeouts.
   * @returns {Promise<void>}
   */
  function stop() {
    return new Promise((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }
      const s = server;
      server = null;
      s.close((err) => (err ? reject(err) : resolve()));
      if (typeof s.closeAllConnections === 'function') s.closeAllConnections();
    });
  }

  /** The bound host and port, or null when not listening. */
  function address() {
    if (!server) return null;
    const addr = server.address();
    if (!addr || typeof addr !== 'object') return null;
    return { host: addr.address, port: addr.port };
  }

  return { app, mintToken, revokeTokens, tokenCount, start, stop, address };
}

module.exports = {
  createDashboard,
  DEFAULT_PORT,
  DEFAULT_TOKEN_TTL_MS,
  // exported for tests
  parseCookies,
  clampInt,
  commandNameFromParam,
  localYmd
};
