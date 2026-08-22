/* ------------------------------------------------------------------------
 *
 *                    TsukiBot - src/telemetry-embeds.js
 *
 * Builds the embeds behind /usage: one function per report.
 *
 * These lived in main.js until a formatter contract bug shipped in three of
 * them at once (renderTable hands a formatter (value, row), and formatRelative
 * read that row as its reference time). Nothing could test them there, because
 * requiring main.js starts the bot. Here they are ordinary functions over a
 * database pool, so every report can be built and inspected in a test.
 *
 * Every builder returns { embed, chart }. The chart is null, or an SVG card
 * built by telemetry-charts.js that the caller rasterises and attaches; the
 * embed already names it with setImage('attachment://...'). Builders take an
 * options object:
 *
 *   image:   true when the caller can attach images. The text sparklines and
 *            block bars are then left out in favour of the real chart, while
 *            the key-value panels and tables stay, because they carry detail
 *            a picture cannot.
 *   compare: true to run the same window one step earlier as well and show
 *            the change, where a report supports it.
 *
 * The dispatcher stays in main.js: it needs the interaction, the admin gate and
 * the deferral, none of which belong in a rendering module. buildUsageReport
 * below is the one place that knows which arguments each report takes, so the
 * slash command, the window buttons and the report menu all go through it.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const { EmbedBuilder } = require('discord.js');

// Same module instances main.js initialized: require() caches, so telemetry here
// is the one holding the live write buffer.
const telemetry = require('./telemetry');
const telemetryReports = require('./telemetry-reports');
const render = require('./telemetry-render');
const charts = require('./telemetry-charts');

/* --------------------------------------------------------------------------
 *
 *  /usage - usage telemetry reports
 *
 *  Everything here is admin-only and replies ephemerally, because the reports
 *  name individual users and the servers they use the bot in.
 *
 *  Layout note: Discord embeds render in a proportional font, so any column
 *  that needs to line up has to live inside a code fence. That is why these
 *  build monospace text through src/telemetry-render.js rather than padding
 *  strings into plain embed fields.
 *
 * -------------------------------------------------------------------------- */

// A CoinGecko demo key's monthly allowance. One request is one credit. The
// effective budget can be raised for a paid plan with setMonthlyCreditBudget.
const DEMO_MONTHLY_CREDITS = 10000;
let monthlyCreditBudget = DEMO_MONTHLY_CREDITS;

const USAGE_EMBED_COLOR = '#5865F2';

/**
 * Overrides the credit budget the credits report measures against. Anything
 * that is not a positive number keeps the demo default.
 * @param {number|string} value
 * @returns {number} the budget now in effect
 */
function setMonthlyCreditBudget(value) {
  const n = Number(value);
  monthlyCreditBudget = Number.isFinite(n) && n > 0 ? Math.round(n) : DEMO_MONTHLY_CREDITS;
  return monthlyCreditBudget;
}

/** @returns {number} */
function getMonthlyCreditBudget() {
  return monthlyCreditBudget;
}

/**
 * Base embed for every usage report, so the window and timezone a report was
 * built from are always visible rather than assumed.
 * @param {string} title
 * @param {number} days
 * @param {string} [timezone]
 * @returns {EmbedBuilder}
 */
function usageEmbed(title, days, timezone) {
  return new EmbedBuilder()
    .setTitle('📊 ' + title)
    .setColor(USAGE_EMBED_COLOR)
    .setFooter({ text: `Last ${days} day${days === 1 ? '' : 's'}` + (timezone ? ` · ${timezone}` : '') + ' · TsukiBot telemetry' })
    .setTimestamp();
}

/**
 * Change between two counts as a compact arrow string, for the compare option.
 * @param {number|string} current
 * @param {number|string} prior
 * @returns {string} e.g. '▲ +12%', '▼ 8%', '▲ new', '–'
 */
function deltaText(current, prior) {
  const c = Number(current) || 0;
  const p = Number(prior) || 0;
  if (c === 0 && p === 0) return '–';
  if (p === 0) return '▲ new';
  const pct = Math.round((c - p) / p * 100);
  if (pct === 0) return '= 0%';
  return pct > 0 ? `▲ +${pct}%` : `▼ ${Math.abs(pct)}%`;
}

/**
 * Names the chart attachment and points the embed at it.
 * @param {EmbedBuilder} embed
 * @param {string} report
 * @param {string} svg
 * @returns {{embed: EmbedBuilder, chart: {name: string, svg: string}}}
 */
function withChart(embed, report, svg) {
  const name = `usage-${report}.png`;
  embed.setImage(`attachment://${name}`);
  return { embed, chart: { name, svg } };
}

/** @param {EmbedBuilder} embed */
function textOnly(embed) {
  return { embed, chart: null };
}

/** A YYYY-MM-DD label from whatever node-postgres hands back for a date. */
function isoDay(value) {
  if (!value) return '-';
  const key = charts.dayKey(value);
  return key || '-';
}

/* --------------------------------------------------------------------------
 *  Reports
 * -------------------------------------------------------------------------- */

/**
 * Renders the headline panel: how much the bot is used, by how many people,
 * how reliably, and how fast.
 * @param {number} days
 * @param {string} timezone
 * @param {{image?: boolean, compare?: boolean}} [options]
 * @returns {Promise<{embed: EmbedBuilder, chart: object|null}>}
 */
async function buildUsageOverview(days, timezone, { image = false, compare = false } = {}) {
  const [stats, series, storage, comparison] = await Promise.all([
    telemetryReports.getOverview(days),
    // The text sparkline is one character per day and cannot show more than ~60;
    // the image has no such limit.
    telemetryReports.getDailySeries(image ? days : Math.min(days, 60), timezone),
    telemetryReports.getStorageStats(),
    compare ? telemetryReports.getOverviewComparison(days) : null
  ]);

  const events = Number(stats.events) || 0;
  const embed = usageEmbed('Usage overview', days, timezone);

  const volume = render.renderKeyValue([
    ['Events', render.compactNumber(events)],
    ['Commands', render.compactNumber(stats.command_events)],
    ['Autocomplete', render.compactNumber(stats.autocomplete_events)],
    ['Buttons', render.compactNumber(stats.button_events)],
    ['Automated', render.compactNumber(stats.system_events)],
    ['From DMs', render.compactNumber(stats.dm_events) + ' (' + render.percent(stats.dm_events, events) + ')']
  ]);

  const reach = render.renderKeyValue([
    ['Active today', render.compactNumber(stats.dau)],
    ['Active 7d', render.compactNumber(stats.wau)],
    ['Active 30d', render.compactNumber(stats.mau)],
    ['Unique users', render.compactNumber(stats.users)],
    ['Servers', render.compactNumber(stats.guilds)],
    ['Commands used', render.compactNumber(stats.commands)]
  ]);

  const health = render.renderKeyValue([
    ['Errors', render.compactNumber(stats.errors) + ' (' + render.percent(stats.errors, events) + ')'],
    ['Avg time', render.formatDuration(stats.avg_ms)],
    ['Median', render.formatDuration(stats.p50_ms)],
    ['95th pct', render.formatDuration(stats.p95_ms)],
    ['Busiest day', stats.busiest ? `${isoDay(stats.busiest.day)} (${render.compactNumber(stats.busiest.events)})` : '-'],
    ['Events today', render.compactNumber(stats.events_today)]
  ]);

  embed.addFields(
    { name: 'Volume', value: render.codeBlock(volume), inline: true },
    { name: 'Reach', value: render.codeBlock(reach), inline: true },
    { name: 'Health', value: render.codeBlock(health), inline: false }
  );

  if (comparison) {
    embed.addFields({
      name: `vs the ${days} day${days === 1 ? '' : 's'} before`,
      value: render.codeBlock(render.renderKeyValue([
        ['Events', `${render.compactNumber(comparison.events)} ${deltaText(comparison.events, comparison.prior_events)}`],
        ['Commands', `${render.compactNumber(comparison.command_events)} ${deltaText(comparison.command_events, comparison.prior_command_events)}`],
        ['Users', `${render.compactNumber(comparison.users)} ${deltaText(comparison.users, comparison.prior_users)}`],
        ['Servers', `${render.compactNumber(comparison.guilds)} ${deltaText(comparison.guilds, comparison.prior_guilds)}`],
        ['Errors', `${render.compactNumber(comparison.errors)} ${deltaText(comparison.errors, comparison.prior_errors)}`],
        ['95th pct', `${render.formatDuration(comparison.p95_ms)} ${deltaText(comparison.p95_ms, comparison.prior_p95_ms)}`],
        ['CG credits', `${render.compactNumber(comparison.credits)} ${deltaText(comparison.credits, comparison.prior_credits)}`]
      ]))
    });
  }

  const writer = telemetry.getWriterStats();
  embed.setDescription(
    `Tracking since **${isoDay(stats.trackingSince)}** · ` +
    `**${render.compactNumber(stats.lifetimeEvents)}** events all time · ` +
    `**${storage.total_size}** on disk` +
    (writer.buffered || writer.dropped
      ? `\nBuffer: ${writer.buffered} queued, ${writer.pendingAutocomplete} searches settling` +
        (writer.dropped ? `, ⚠️ ${writer.dropped} dropped` : '')
      : '')
  );

  if (image && series.length > 1) {
    return withChart(embed, 'overview', charts.dailyTrendChart({ series, days, timezone }));
  }

  if (series.length > 1) {
    const spark = render.renderSparkline(series.map(row => row.events));
    embed.addFields({
      name: `Daily volume (${series.length}d)`,
      value: render.codeBlock(spark + '\n' +
        `low ${render.compactNumber(Math.min(...series.map(r => Number(r.events))))}` +
        `   high ${render.compactNumber(Math.max(...series.map(r => Number(r.events))))}`)
    });
  }

  return textOnly(embed);
}

/**
 * Most used commands, ordered by invocation count.
 * @param {number} days
 * @param {number} limit
 * @param {boolean} includeAutocomplete
 * @param {{image?: boolean, compare?: boolean}} [options]
 * @returns {Promise<{embed: EmbedBuilder, chart: object|null}>}
 */
async function buildUsageCommands(days, limit, includeAutocomplete, { image = false, compare = false } = {}) {
  const [rows, prior] = await Promise.all([
    telemetryReports.getTopCommands(days, limit, includeAutocomplete),
    compare ? telemetryReports.getTopCommands(days, 200, includeAutocomplete, { priorWindow: true }) : []
  ]);
  const embed = usageEmbed('Top commands', days);

  if (rows.length === 0) {
    return textOnly(embed.setDescription('No commands recorded yet in this window.'));
  }

  const total = rows.reduce((sum, row) => sum + Number(row.uses), 0);
  const priorByName = new Map((prior || []).map((row, index) => [row.name, { uses: Number(row.uses), rank: index + 1 }]));

  const columns = [
    { key: 'name', label: 'Command', width: 18 },
    { key: 'uses', label: 'Uses', align: 'right', width: 7, format: render.compactNumber },
    { key: 'users', label: 'Users', align: 'right', width: 6, format: render.compactNumber },
    { key: 'avg_ms', label: 'Avg', align: 'right', width: 7, format: render.formatDuration },
    { key: 'errors', label: 'Err', align: 'right', width: 5, format: render.compactNumber }
  ];
  let tableRows = rows;
  if (compare) {
    tableRows = rows.map((row, index) => {
      const before = priorByName.get(row.name);
      const rank = !before ? 'new' : before.rank === index + 1 ? '=' : before.rank > index + 1 ? `↑${before.rank - index - 1}` : `↓${index + 1 - before.rank}`;
      return { ...row, delta: deltaText(row.uses, before ? before.uses : 0), rank };
    });
    columns.splice(2, 0, { key: 'delta', label: 'Δ', align: 'right', width: 7 }, { key: 'rank', label: 'Rank', align: 'right', width: 4 });
    // Drop the average to keep the row inside a phone-width code block.
    columns.splice(columns.findIndex(c => c.key === 'avg_ms'), 1);
  }
  const table = render.renderTable(tableRows, columns);

  embed.setDescription(`**${render.compactNumber(total)}** invocations across **${rows.length}** commands.` +
    (compare ? ` Δ and rank are against the ${days} days before.` : ''));

  // The names feed the drill-down menu under the reply.
  const commandNames = rows.map(row => row.name);

  if (image) {
    embed.addFields({ name: 'Detail', value: render.codeBlock(table) });
    return { ...withChart(embed, 'commands', charts.commandBreakdownChart({ rows, days })), commandNames };
  }

  const chart = render.renderBarChart(
    rows.slice(0, 12).map(row => ({ label: row.name, value: Number(row.uses) })),
    { width: 18 }
  );
  embed.addFields(
    { name: 'Share', value: render.codeBlock(chart) },
    { name: 'Detail', value: render.codeBlock(table) }
  );
  return { ...textOnly(embed), commandNames };
}

/**
 * Heaviest users. Ids are included because a username is not stable and is not
 * what any follow-up query would key on.
 * @param {number} days
 * @param {number} limit
 * @returns {Promise<{embed: EmbedBuilder, chart: null}>}
 */
async function buildUsageUsers(days, limit) {
  const rows = await telemetryReports.getTopUsers(days, limit);
  const embed = usageEmbed('Top users', days);

  if (rows.length === 0) {
    return textOnly(embed.setDescription('No users recorded yet in this window.'));
  }

  const table = render.renderTable(rows, [
    { key: 'username', label: 'User', width: 16 },
    { key: 'events', label: 'Events', align: 'right', width: 7, format: render.compactNumber },
    { key: 'active_days', label: 'Days', align: 'right', width: 5 },
    { key: 'distinct_commands', label: 'Cmds', align: 'right', width: 5 },
    { key: 'favorite_command', label: 'Favorite', width: 12 },
    { key: 'last_seen', label: 'Last', width: 9, format: render.formatRelative }
  ]);

  const chart = render.renderBarChart(
    rows.slice(0, 10).map(row => ({ label: row.username || row.user_id, value: Number(row.events) })),
    { width: 16 }
  );

  embed.setDescription(`**${rows.length}** most active users in this window.`);
  embed.addFields(
    { name: 'Activity', value: render.codeBlock(chart) },
    { name: 'Detail', value: render.codeBlock(table) }
  );
  return textOnly(embed);
}

/**
 * Busiest servers.
 * @param {number} days
 * @param {number} limit
 * @returns {Promise<{embed: EmbedBuilder, chart: null}>}
 */
async function buildUsageGuilds(days, limit) {
  const rows = await telemetryReports.getTopGuilds(days, limit);
  const embed = usageEmbed('Top servers', days);

  if (rows.length === 0) {
    return textOnly(embed.setDescription('No server activity recorded yet in this window.'));
  }

  const table = render.renderTable(rows, [
    { key: 'guild_name', label: 'Server', width: 20 },
    { key: 'events', label: 'Events', align: 'right', width: 7, format: render.compactNumber },
    { key: 'users', label: 'Users', align: 'right', width: 6, format: render.compactNumber },
    { key: 'favorite_command', label: 'Favorite', width: 12 },
    { key: 'last_used', label: 'Last', width: 9, format: render.formatRelative }
  ]);

  embed.setDescription(`**${rows.length}** servers with activity. DM usage is counted in \`/usage overview\`.`);
  embed.addFields({ name: 'Detail', value: render.codeBlock(table) });
  return textOnly(embed);
}

/**
 * Most requested coins.
 * @param {number} days
 * @param {number} limit
 * @param {{compare?: boolean}} [options]
 * @returns {Promise<{embed: EmbedBuilder, chart: null}>}
 */
async function buildUsageCoins(days, limit, { compare = false } = {}) {
  const [rows, prior] = await Promise.all([
    telemetryReports.getTopCoins(days, limit),
    compare ? telemetryReports.getTopCoins(days, 200, { priorWindow: true }) : []
  ]);
  const embed = usageEmbed('Top coins', days);

  if (rows.length === 0) {
    return textOnly(embed.setDescription('No coin lookups recorded yet in this window.'));
  }

  const total = rows.reduce((sum, row) => sum + Number(row.requests), 0);
  const chart = render.renderBarChart(
    rows.slice(0, 15).map(row => ({ label: row.coin, value: Number(row.requests) })),
    { width: 18, labelWidth: 8 }
  );

  const priorByCoin = new Map((prior || []).map(row => [row.coin, Number(row.requests)]));
  const columns = [
    { key: 'coin', label: 'Coin', width: 10 },
    { key: 'requests', label: 'Lookups', align: 'right', width: 8, format: render.compactNumber },
    { key: 'users', label: 'Users', align: 'right', width: 6, format: render.compactNumber },
    { key: 'via_command', label: 'Mostly via', width: 12 }
  ];
  let tableRows = rows;
  if (compare) {
    tableRows = rows.map(row => ({ ...row, delta: deltaText(row.requests, priorByCoin.get(row.coin) || 0) }));
    columns.splice(2, 0, { key: 'delta', label: 'Δ', align: 'right', width: 7 });
  }

  embed.setDescription(`**${render.compactNumber(total)}** coin lookups across **${rows.length}** distinct assets.` +
    (compare ? ` Δ is against the ${days} days before; see \`/usage trending\` for risers and fallers.` : ''));
  embed.addFields(
    { name: 'Demand', value: render.codeBlock(chart) },
    { name: 'Detail', value: render.codeBlock(render.renderTable(tableRows, columns)) }
  );
  return textOnly(embed);
}

/**
 * When the bot gets used: hour of day, day of week, and the two combined as a
 * heatmap. Rendered in the requested timezone, since UTC hours do not answer
 * the question anyone is actually asking.
 * @param {number} days
 * @param {string} timezone
 * @param {{image?: boolean}} [options]
 * @returns {Promise<{embed: EmbedBuilder, chart: object|null}>}
 */
async function buildUsageActivity(days, timezone, { image = false } = {}) {
  const [hourly, weekly, grid] = await Promise.all([
    telemetryReports.getHourlyActivity(days, timezone),
    telemetryReports.getWeekdayActivity(days, timezone),
    telemetryReports.getActivityGrid(days, timezone)
  ]);

  const embed = usageEmbed('Activity patterns', days, timezone);
  if (hourly.length === 0) {
    return textOnly(embed.setDescription('No activity recorded yet in this window.'));
  }

  // Fill missing hours so a quiet 3am shows as an empty row rather than vanishing.
  const byHour = new Map(hourly.map(row => [Number(row.hour), Number(row.events)]));
  const hourItems = Array.from({ length: 24 }, (_, hour) => ({
    label: String(hour).padStart(2, '0') + ':00',
    value: byHour.get(hour) || 0
  }));

  const byWeekday = new Map(weekly.map(row => [Number(row.weekday), Number(row.events)]));
  const weekdayItems = render.WEEKDAY_NAMES.map((name, index) => ({
    label: name,
    value: byWeekday.get(index) || 0
  }));

  const peakHour = hourItems.reduce((best, item) => item.value > best.value ? item : best, hourItems[0]);
  const peakDay = weekdayItems.reduce((best, item) => item.value > best.value ? item : best, weekdayItems[0]);

  embed.setDescription(`Busiest hour is **${peakHour.label}** and the busiest day is **${peakDay.label}**, in \`${timezone}\`.`);

  if (image) {
    return withChart(embed, 'activity', charts.activityHeatmapChart({ grid, hourly, weekday: weekly, days, timezone }));
  }

  embed.addFields(
    { name: 'By hour', value: render.codeBlock(render.renderBarChart(hourItems, { width: 14, labelWidth: 5 })) },
    { name: 'By weekday', value: render.codeBlock(render.renderBarChart(weekdayItems, { width: 18, labelWidth: 3 })), inline: true },
    { name: 'Heatmap', value: render.codeBlock(render.renderHeatmap(grid) + '\n' + render.heatmapLegend()) }
  );
  return textOnly(embed);
}

/**
 * Deep dive on a single command: which subcommands people reach for, which
 * options they actually supply, and what values they pass.
 * @param {string} command
 * @param {number} days
 * @returns {Promise<{embed: EmbedBuilder, chart: null}>}
 */
async function buildUsageCommandDetail(command, days) {
  // Leaderboard names fold the subcommand in ("portfolio show"); the detail
  // queries key on the bare command, so only the first token is used.
  const name = String(command || '').replace(/^\//, '').trim().toLowerCase().split(/\s+/)[0] || '';
  const [subcommands, coverage, values] = await Promise.all([
    telemetryReports.getSubcommandSplit(name, days),
    telemetryReports.getOptionCoverage(name, days),
    telemetryReports.getParameterUsage(name, days, 25)
  ]);

  const embed = usageEmbed(`/${name} usage`, days);
  const total = subcommands.reduce((sum, row) => sum + Number(row.uses), 0);

  if (total === 0) {
    return textOnly(embed.setDescription(`No recorded invocations of \`/${name}\` in this window. Check the spelling, or widen the window.`));
  }

  embed.setDescription(`**${render.compactNumber(total)}** invocations of \`/${name}\`.`);

  if (subcommands.length > 1 || (subcommands[0] && subcommands[0].subcommand !== '(none)')) {
    embed.addFields({
      name: 'Subcommands',
      value: render.codeBlock(render.renderTable(subcommands, [
        { key: 'subcommand', label: 'Subcommand', width: 16 },
        { key: 'uses', label: 'Uses', align: 'right', width: 7, format: render.compactNumber },
        { key: 'users', label: 'Users', align: 'right', width: 6, format: render.compactNumber }
      ]))
    });
  }

  if (coverage.length > 0) {
    const withShare = coverage.map(row => ({
      ...row,
      share: render.percent(row.supplied, row.total_invocations, 0)
    }));
    embed.addFields({
      name: 'Option usage',
      value: render.codeBlock(render.renderTable(withShare, [
        { key: 'option', label: 'Option', width: 14 },
        { key: 'supplied', label: 'Supplied', align: 'right', width: 8, format: render.compactNumber },
        { key: 'share', label: 'Of runs', align: 'right', width: 8 }
      ]))
    });
  }

  if (values.length > 0) {
    embed.addFields({
      name: 'Most common values',
      value: render.codeBlock(render.renderTable(values, [
        { key: 'option', label: 'Option', width: 10 },
        { key: 'value', label: 'Value', width: 20 },
        { key: 'uses', label: 'Uses', align: 'right', width: 7, format: render.compactNumber },
        { key: 'users', label: 'Users', align: 'right', width: 6, format: render.compactNumber }
      ]))
    });
  }

  return textOnly(embed);
}

/**
 * What is failing and what is slow, the two things worth acting on.
 * @param {number} days
 * @param {number} limit
 * @param {{image?: boolean, compare?: boolean}} [options]
 * @returns {Promise<{embed: EmbedBuilder, chart: object|null}>}
 */
async function buildUsageErrors(days, limit, { image = false, compare = false } = {}) {
  const [errors, slowest, prior] = await Promise.all([
    telemetryReports.getErrors(days, limit),
    telemetryReports.getSlowestCommands(days, 10),
    compare ? telemetryReports.getErrors(days, 200, { priorWindow: true }) : []
  ]);

  const embed = usageEmbed('Errors and latency', days);

  if (errors.length === 0) {
    embed.setDescription('✅ No command errors recorded in this window.');
  }
  else {
    const total = errors.reduce((sum, row) => sum + Number(row.occurrences), 0);
    const priorTotal = (prior || []).reduce((sum, row) => sum + Number(row.occurrences), 0);
    embed.setDescription(`**${render.compactNumber(total)}** failures across **${errors.length}** distinct faults.` +
      (compare ? ` ${deltaText(total, priorTotal)} vs the ${days} days before.` : ''));

    const priorByFault = new Map((prior || []).map(row => [`${row.command}|${row.error_kind}`, Number(row.occurrences)]));
    const columns = [
      { key: 'command', label: 'Command', width: 12 },
      { key: 'error_kind', label: 'Error', width: 24 },
      { key: 'occurrences', label: 'Count', align: 'right', width: 6, format: render.compactNumber },
      { key: 'users_affected', label: 'Users', align: 'right', width: 5, format: render.compactNumber },
      { key: 'last_seen', label: 'Last', width: 9, format: render.formatRelative }
    ];
    let tableRows = errors;
    if (compare) {
      tableRows = errors.map(row => ({ ...row, delta: deltaText(row.occurrences, priorByFault.get(`${row.command}|${row.error_kind}`) || 0) }));
      columns.splice(3, 0, { key: 'delta', label: 'Δ', align: 'right', width: 7 });
      columns.splice(columns.findIndex(c => c.key === 'last_seen'), 1);
    }
    embed.addFields({ name: 'Failures', value: render.codeBlock(render.renderTable(tableRows, columns)) });
  }

  if (slowest.length > 0) {
    embed.addFields({
      name: 'Slowest commands (5+ samples)',
      value: render.codeBlock(render.renderTable(slowest, [
        { key: 'command', label: 'Command', width: 14 },
        { key: 'avg_ms', label: 'Avg', align: 'right', width: 8, format: render.formatDuration },
        { key: 'p95_ms', label: 'p95', align: 'right', width: 8, format: render.formatDuration },
        { key: 'max_ms', label: 'Max', align: 'right', width: 8, format: render.formatDuration },
        { key: 'samples', label: 'N', align: 'right', width: 6, format: render.compactNumber }
      ]))
    });
  }

  const commandNames = [...new Set([...errors.map(row => row.command), ...slowest.map(row => row.command)])];
  if (image && (errors.length > 0 || slowest.length > 0)) {
    return { ...withChart(embed, 'errors', charts.errorsChart({ errors, slowest, days })), commandNames };
  }
  return { ...textOnly(embed), commandNames };
}

/**
 * New versus returning users, how many days people stick around for, and who
 * churned or came back against the previous window.
 * @param {number} days
 * @param {string} timezone
 * @param {{image?: boolean}} [options]
 * @returns {Promise<{embed: EmbedBuilder, chart: object|null}>}
 */
async function buildUsageGrowth(days, timezone, { image = false } = {}) {
  const [growth, retention, churn] = await Promise.all([
    telemetryReports.getGrowth(days, timezone),
    telemetryReports.getRetention(days),
    telemetryReports.getChurn(days).catch(() => null)
  ]);

  const embed = usageEmbed('Growth and retention', days, timezone);
  if (growth.length === 0) {
    return textOnly(embed.setDescription('No activity recorded yet in this window.'));
  }

  const newTotal = growth.reduce((sum, row) => sum + Number(row.new_users), 0);
  const returningPeak = Math.max(...growth.map(row => Number(row.returning_users)));

  embed.setDescription(
    `**${render.compactNumber(newTotal)}** first-time users in this window. ` +
    `Peak returning users in a day: **${render.compactNumber(returningPeak)}**.` +
    (churn
      ? `\nVs the ${days} days before: **${render.compactNumber(churn.retained)}** retained, ` +
        `**${render.compactNumber(churn.churned)}** churned, **${render.compactNumber(churn.resurrected)}** came back.`
      : '')
  );

  if (!image) {
    embed.addFields({
      name: 'Daily active users',
      value: render.codeBlock(
        render.renderSparkline(growth.map(row => row.active_users)) + '\n' +
        'new      ' + render.renderSparkline(growth.map(row => row.new_users))
      )
    });
  }

  const recent = growth.slice(-12);
  embed.addFields({
    name: 'Recent days',
    value: render.codeBlock(render.renderTable(recent, [
      { key: 'day', label: 'Day', width: 10, format: (value) => isoDay(value).slice(5) },
      { key: 'active_users', label: 'Active', align: 'right', width: 7, format: render.compactNumber },
      { key: 'new_users', label: 'New', align: 'right', width: 5, format: render.compactNumber },
      { key: 'returning_users', label: 'Return', align: 'right', width: 7, format: render.compactNumber }
    ]))
  });

  if (image) {
    return withChart(embed, 'growth', charts.growthChart({ growth, retention, churn, days, timezone }));
  }

  if (retention.length > 0) {
    embed.addFields({
      name: 'How many days users stayed active',
      value: render.codeBlock(render.renderBarChart(
        retention.map(row => ({ label: row.bucket, value: Number(row.users) })),
        { width: 16, labelWidth: 16 }
      ))
    });
  }

  return textOnly(embed);
}

/**
 * Month-end projection for the credits report and the watchdog: month-to-date
 * plus the last 24 hours' rate for every UTC day left in the month.
 * @param {object} totals a getApiCreditTotals row
 * @param {Date} [now]
 */
function projectMonthEnd(totals, now = new Date()) {
  const monthToDate = Number(totals.calls_month) || 0;
  const perDay = Number(totals.calls_24h) || 0;
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const daysRemaining = Math.max(0, daysInMonth - dayOfMonth);
  return { monthToDate, perDay, daysInMonth, dayOfMonth, daysRemaining, projected: monthToDate + perDay * daysRemaining };
}

/**
 * CoinGecko credit spend.
 *
 * A demo key allows 10,000 credits a month and one request is one credit, so this turns the quota
 * from something you find out about when calls start failing into something you can watch.
 *
 * @param {number} days window for the endpoint breakdown
 * @param {string} timezone
 * @param {{image?: boolean, compare?: boolean}} [options]
 * @returns {Promise<{embed: EmbedBuilder, chart: object|null}>}
 */
async function buildUsageCredits(days, timezone, { image = false, compare = false } = {}) {
  const [byEndpoint, totals, daily, monthDaily, comparison] = await Promise.all([
    telemetryReports.getApiCreditsByEndpoint(days),
    telemetryReports.getApiCreditTotals(),
    image ? [] : telemetryReports.getApiCreditsByDay(Math.min(days, 60), timezone),
    image ? telemetryReports.getApiCreditsMonthToDate() : [],
    compare ? telemetryReports.getApiCreditsMonthComparison() : null
  ]);

  const embed = usageEmbed('CoinGecko credits', days, timezone);
  const budget = getMonthlyCreditBudget();

  if (!totals || Number(totals.calls_total) === 0) {
    return textOnly(embed.setDescription(
      'No CoinGecko calls recorded yet. Tracking starts when the bot next makes one, so this fills ' +
      'in within a few minutes of a restart.'));
  }

  const now = new Date();
  const { monthToDate, perDay, daysInMonth, dayOfMonth, projected } = projectMonthEnd(totals, now);
  const withinQuota = projected <= budget;
  embed.setColor(withinQuota ? '#2ee08a' : '#ff5a76');

  embed.setDescription(
    `**${render.compactNumber(monthToDate)}** of **${render.compactNumber(budget)}** ` +
    `credits used this month (${render.percent(monthToDate, budget, 0)}).\n` +
    `At the last 24 hours' rate of **${render.compactNumber(perDay)}/day**, the month ends at ` +
    `**${render.compactNumber(projected)}** — ` +
    (withinQuota ? 'within budget. ✅' : '**over budget.** ⚠️') +
    (comparison
      ? `\nLast month at this point: **${render.compactNumber(comparison.prior_month_same_point)}** ` +
        `(${deltaText(monthToDate, comparison.prior_month_same_point)} now) · last month's total: ` +
        `**${render.compactNumber(comparison.prior_month_total)}**.`
      : ''));

  embed.addFields({
    name: 'Rate',
    value: render.codeBlock(render.renderKeyValue([
      ['Last hour', render.compactNumber(totals.calls_1h)],
      ['Last 24h', render.compactNumber(totals.calls_24h)],
      ['Last 7d', render.compactNumber(totals.calls_7d)],
      ['This month', render.compactNumber(monthToDate)],
      ['Projected', render.compactNumber(projected)],
      ['Budget', render.compactNumber(budget)],
      ['Rate limited', render.compactNumber(totals.ratelimited)]
    ]))
  });

  if (byEndpoint.length > 0) {
    const total = byEndpoint.reduce((sum, row) => sum + Number(row.calls), 0);
    const withShare = byEndpoint.map(row => ({
      ...row,
      endpoint: String(row.endpoint).replace(/^\//, ''),
      share: render.percent(row.calls, total, 1)
    }));

    if (!image) {
      embed.addFields({
        name: 'Where the credits go',
        value: render.codeBlock(render.renderBarChart(
          withShare.slice(0, 10).map(row => ({ label: row.endpoint, value: Number(row.calls) })),
          { width: 16, labelWidth: 16 }))
      });
    }
    embed.addFields({
      name: 'Detail',
      value: render.codeBlock(render.renderTable(withShare, [
        { key: 'endpoint', label: 'Endpoint', width: 18 },
        { key: 'calls', label: 'Calls', align: 'right', width: 7, format: render.compactNumber },
        { key: 'share', label: 'Share', align: 'right', width: 7 },
        { key: 'ratelimited', label: '429s', align: 'right', width: 5, format: render.compactNumber },
        { key: 'errors', label: 'Err', align: 'right', width: 5, format: render.compactNumber },
        { key: 'avg_ms', label: 'Avg', align: 'right', width: 7, format: render.formatDuration }
      ]))
    });
  }

  if (image) {
    const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return withChart(embed, 'credits', charts.creditBurndownChart({
      monthDaily, budget, monthToDate, projected, perDay, daysInMonth, dayOfMonth, monthLabel, byEndpoint
    }));
  }

  if (daily.length > 1) {
    embed.addFields({
      name: `Daily credits (${daily.length}d)`,
      value: render.codeBlock(
        render.renderSparkline(daily.map(row => row.calls)) + '\n' +
        `low ${render.compactNumber(Math.min(...daily.map(r => Number(r.calls))))}` +
        `   high ${render.compactNumber(Math.max(...daily.map(r => Number(r.calls))))}`)
    });
  }

  return textOnly(embed);
}

/**
 * Table size, row count and writer health.
 * @param {number} days only used for the footer
 * @returns {Promise<{embed: EmbedBuilder, chart: null}>}
 */
async function buildUsageStorage(days) {
  const storage = await telemetryReports.getStorageStats();
  const writer = telemetry.getWriterStats();
  const embed = usageEmbed('Telemetry storage', days)
    .setDescription('Nothing is pruned automatically. Use `/usage prune` when the table gets large.')
    .addFields({
      name: 'Table',
      value: render.codeBlock(render.renderKeyValue([
        ['Rows', render.compactNumber(storage.rows)],
        ['On disk', String(storage.total_size)],
        ['Oldest', isoDay(storage.oldest)],
        ['Buffered', String(writer.buffered)],
        ['Settling', String(writer.pendingAutocomplete)],
        ['Dropped', String(writer.dropped)]
      ]))
    });
  if (writer.dropped) {
    embed.setDescription(embed.data.description +
      `\n⚠️ **${writer.dropped}** events were dropped because a write failed; check the database connection.`);
  }
  return textOnly(embed);
}

/**
 * Splits momentum rows into risers and fallers. A prior-window floor keeps
 * "2 requests became 6" out of the risers; coins below it are left to the
 * new-coins list.
 * @param {Array<object>} rows getCoinMomentum rows
 * @param {number} [minPrior]
 */
function rankMomentum(rows, minPrior = 3) {
  const scored = (rows || []).map(row => {
    const current = Number(row.current_requests) || 0;
    const prior = Number(row.prior_requests) || 0;
    return { ...row, current, prior, delta: current - prior, pct: prior > 0 ? (current - prior) / prior : null };
  });
  const risers = scored
    .filter(row => row.delta > 0 && (row.prior >= minPrior || (row.prior === 0 && row.current >= minPrior)))
    .sort((a, b) => (b.pct === null ? Infinity : b.pct) - (a.pct === null ? Infinity : a.pct) || b.delta - a.delta);
  const fallers = scored
    .filter(row => row.delta < 0 && row.prior >= minPrior)
    .sort((a, b) => (a.pct - b.pct) || (a.delta - b.delta));
  return { risers, fallers };
}

/**
 * Coin demand momentum: what is rising, what is fading, and what is new.
 * @param {number} days
 * @param {number} limit
 * @param {{image?: boolean}} [options]
 * @returns {Promise<{embed: EmbedBuilder, chart: object|null}>}
 */
async function buildUsageTrending(days, limit, { image = false } = {}) {
  const [momentum, fresh] = await Promise.all([
    telemetryReports.getCoinMomentum(days, 300),
    telemetryReports.getNewCoins(days, limit)
  ]);
  const embed = usageEmbed('Coin momentum', days);
  const { risers, fallers } = rankMomentum(momentum);

  if (momentum.length === 0) {
    return textOnly(embed.setDescription('No coin lookups recorded in this window or the one before it.'));
  }

  const top = risers.slice(0, limit);
  const bottom = fallers.slice(0, limit);
  embed.setDescription(
    `Against the **${days}** days before: **${risers.length}** coins rising, **${fallers.length}** fading, ` +
    `**${fresh.length}** requested for the first time.` +
    (top[0] ? ` Biggest riser: **${top[0].coin}** (${deltaText(top[0].current, top[0].prior)}).` : ''));

  const pctLabel = (row) => row.pct === null ? 'new' : `${row.pct >= 0 ? '+' : ''}${Math.round(row.pct * 100)}%`;
  if (!image) {
    if (top.length > 0) {
      embed.addFields({
        name: 'Risers',
        value: render.codeBlock(render.renderBarChart(
          top.slice(0, 10).map(row => ({ label: `${row.coin} ${pctLabel(row)}`, value: row.delta })),
          { width: 14, labelWidth: 12 }))
      });
    }
    if (bottom.length > 0) {
      embed.addFields({
        name: 'Fallers',
        value: render.codeBlock(render.renderBarChart(
          bottom.slice(0, 10).map(row => ({ label: `${row.coin} ${pctLabel(row)}`, value: Math.abs(row.delta) })),
          { width: 14, labelWidth: 12 }))
      });
    }
  }

  const movers = [...top.slice(0, Math.ceil(limit / 2)), ...bottom.slice(0, Math.floor(limit / 2))];
  if (movers.length > 0) {
    embed.addFields({
      name: 'Movers',
      value: render.codeBlock(render.renderTable(movers.map(row => ({
        coin: row.coin, now: row.current, before: row.prior, change: pctLabel(row),
        users: row.current_users, via: row.via_command
      })), [
        { key: 'coin', label: 'Coin', width: 8 },
        { key: 'now', label: 'Now', align: 'right', width: 6, format: render.compactNumber },
        { key: 'before', label: 'Before', align: 'right', width: 6, format: render.compactNumber },
        { key: 'change', label: 'Change', align: 'right', width: 6 },
        { key: 'users', label: 'Users', align: 'right', width: 5, format: render.compactNumber },
        { key: 'via', label: 'Via', width: 9 }
      ]))
    });
  }

  if (fresh.length > 0) {
    embed.addFields({
      name: 'Requested for the first time',
      value: render.codeBlock(render.renderTable(fresh, [
        { key: 'coin', label: 'Coin', width: 10 },
        { key: 'requests', label: 'Lookups', align: 'right', width: 7, format: render.compactNumber },
        { key: 'users', label: 'Users', align: 'right', width: 5, format: render.compactNumber },
        { key: 'via_command', label: 'Via', width: 9 },
        { key: 'first_seen', label: 'First', width: 9, format: render.formatRelative }
      ]))
    });
  }

  if (image && (top.length > 0 || bottom.length > 0)) {
    return withChart(embed, 'trending', charts.momentumChart({ risers: top, fallers: bottom, days }));
  }
  return textOnly(embed);
}

/**
 * Do autocomplete searches turn into commands, and what do people search for
 * that they never run?
 * @param {number} days
 * @param {number} limit
 * @param {{image?: boolean}} [options]
 * @returns {Promise<{embed: EmbedBuilder, chart: object|null}>}
 */
async function buildUsageFunnel(days, limit, { image = false } = {}) {
  const [funnel, abandoned] = await Promise.all([
    telemetryReports.getSearchFunnel(days, limit),
    telemetryReports.getAbandonedSearches(days, limit)
  ]);
  const embed = usageEmbed('Search → command funnel', days);

  if (funnel.length === 0) {
    return textOnly(embed.setDescription('No autocomplete searches recorded in this window.'));
  }

  const searches = funnel.reduce((sum, row) => sum + Number(row.searches), 0);
  const converted = funnel.reduce((sum, row) => sum + Number(row.converted), 0);
  embed.setDescription(
    `**${render.compactNumber(searches)}** searches, **${render.compactNumber(converted)}** followed by the command ` +
    `within a minute (**${render.percent(converted, searches, 0)}**). A search that never converts is a coin the ` +
    'picker could not find, or a user who changed their mind.');

  const rows = funnel.map(row => ({ ...row, rate: render.percent(row.converted, row.searches, 0) }));
  embed.addFields({
    name: 'By command',
    value: render.codeBlock(render.renderTable(rows, [
      { key: 'command', label: 'Command', width: 12 },
      { key: 'searches', label: 'Searches', align: 'right', width: 8, format: render.compactNumber },
      { key: 'converted', label: 'Ran it', align: 'right', width: 7, format: render.compactNumber },
      { key: 'rate', label: 'Rate', align: 'right', width: 5 },
      { key: 'users', label: 'Users', align: 'right', width: 5, format: render.compactNumber }
    ]))
  });

  if (abandoned.length > 0) {
    embed.addFields({
      name: 'Searched but never run',
      value: render.codeBlock(render.renderTable(abandoned, [
        { key: 'command', label: 'Command', width: 10 },
        { key: 'query', label: 'Query', width: 18 },
        { key: 'searches', label: 'Times', align: 'right', width: 5, format: render.compactNumber },
        { key: 'users', label: 'Users', align: 'right', width: 5, format: render.compactNumber }
      ]))
    });
  }

  if (image) {
    return withChart(embed, 'funnel', charts.funnelChart({ funnel, days }));
  }
  return textOnly(embed);
}

/**
 * What users have set up, as opposed to what they ran: standing price alerts,
 * portfolios, scheduled posts and watchlists, with the window's activity
 * against each and the change since the snapshot taken `days` ago.
 * @param {number} days
 * @param {number} limit rows per "top coins" list
 * @param {{image?: boolean}} [options]
 * @returns {Promise<{embed: EmbedBuilder, chart: object|null}>}
 */
async function buildUsageFeatures(days, limit, { image = false } = {}) {
  const [inventory, activity, delta] = await Promise.all([
    telemetryReports.getFeatureInventory(limit),
    telemetryReports.getFeatureActivity(days),
    // The snapshot table fills in daily; a fresh install has no trend yet and that is fine.
    telemetryReports.getFeatureSnapshotDelta(days).catch(() => ({ latest: null, prior: null }))
  ]);
  const { alerts, portfolios, schedules, watchlists } = inventory;
  const embed = usageEmbed('What users have set up', days);
  const n = (v) => Number(v) || 0;

  const totalThings = n(alerts.total) + n(portfolios.holdings) + n(schedules.jobs) + n(watchlists.users);
  if (totalThings === 0) {
    return textOnly(embed.setDescription('Nothing is set up yet: no price alerts, portfolios, scheduled posts or watchlists.'));
  }

  const change = (a, b) => { const v = n(a) - n(b); return v === 0 ? '±0' : (v > 0 ? '+' : '') + v; };
  embed.setDescription(
    `**${render.compactNumber(alerts.total)}** active price alerts · **${render.compactNumber(portfolios.users)}** portfolios · ` +
    `**${render.compactNumber(schedules.jobs)}** scheduled posts in **${render.compactNumber(schedules.guilds)}** servers · ` +
    `**${render.compactNumber(watchlists.users)}** watchlists.` +
    (delta.latest && delta.prior
      ? `\nSince ${days} day${days === 1 ? '' : 's'} ago: alerts ${change(delta.latest.alerts, delta.prior.alerts)}, ` +
        `portfolios ${change(delta.latest.portfolio_users, delta.prior.portfolio_users)}, ` +
        `schedules ${change(delta.latest.schedules, delta.prior.schedules)}, ` +
        `watchlists ${change(delta.latest.watchlists, delta.prior.watchlists)}.`
      : ''));

  embed.addFields(
    {
      name: 'Price alerts', inline: true,
      value: render.codeBlock(render.renderKeyValue([
        ['Active', render.compactNumber(alerts.total)],
        ['Users', render.compactNumber(alerts.users)],
        ['Coins', render.compactNumber(alerts.coins)],
        ['Above / below', `${render.compactNumber(alerts.above)} / ${render.compactNumber(alerts.below)}`],
        ['Expiring 7d', render.compactNumber(alerts.expiring_7d)],
        ['Most per user', render.compactNumber(alerts.max_per_user)],
        [`Set (${days}d)`, render.compactNumber(activity.alerts_created)],
        [`Fired (${days}d)`, render.compactNumber(activity.alerts_fired)],
        ['  via DM / chan', `${render.compactNumber(activity.alerts_dm)} / ${render.compactNumber(activity.alerts_channel)}`],
        ['  undeliverable', render.compactNumber(activity.alerts_failed)]
      ]))
    },
    {
      name: 'Portfolios', inline: true,
      value: render.codeBlock(render.renderKeyValue([
        ['Users', render.compactNumber(portfolios.users)],
        ['Holdings', render.compactNumber(portfolios.holdings)],
        ['Coins', render.compactNumber(portfolios.coins)],
        ['Avg per user', n(portfolios.users) ? (n(portfolios.holdings) / n(portfolios.users)).toFixed(1) : '0'],
        ['Most per user', render.compactNumber(portfolios.max_holdings)],
        [`Set (${days}d)`, render.compactNumber(activity.portfolio_sets)],
        [`Viewed by (${days}d)`, render.compactNumber(activity.portfolio_users) + ' users']
      ]))
    },
    {
      name: 'Scheduled posts', inline: true,
      value: render.codeBlock(render.renderKeyValue([
        ['Jobs', render.compactNumber(schedules.jobs)],
        ['Servers', render.compactNumber(schedules.guilds)],
        ['Set up by', render.compactNumber(schedules.users) + ' users'],
        ['Never run', render.compactNumber(schedules.never_run)],
        ['Stale', render.compactNumber(schedules.stale)],
        [`Created (${days}d)`, render.compactNumber(activity.schedules_created)],
        [`Deleted (${days}d)`, render.compactNumber(activity.schedules_deleted)],
        [`Posts run (${days}d)`, render.compactNumber(activity.posts_run)],
        ['  failed', render.compactNumber(activity.posts_failed)]
      ]))
    },
    {
      name: 'Watchlists', inline: true,
      value: render.codeBlock(render.renderKeyValue([
        ['Users', render.compactNumber(watchlists.users)],
        ['Entries', render.compactNumber(watchlists.entries)],
        ['Coins', render.compactNumber(watchlists.coins)],
        ['Avg size', n(watchlists.users) ? (n(watchlists.entries) / n(watchlists.users)).toFixed(1) : '0'],
        ['Largest', render.compactNumber(watchlists.max_size)],
        [`Uses (${days}d)`, render.compactNumber(activity.watchlist_uses)],
        [`Users (${days}d)`, render.compactNumber(activity.watchlist_users)]
      ]))
    }
  );

  if (image) {
    return withChart(embed, 'features', charts.featuresChart({ inventory, activity, delta, days }));
  }

  if (inventory.alertCoins.length > 0) {
    embed.addFields({
      name: 'Alerts by coin',
      value: render.codeBlock(render.renderBarChart(
        inventory.alertCoins.slice(0, 10).map(row => ({ label: row.symbol, value: n(row.alerts) })),
        { width: 14, labelWidth: 8 }))
    });
  }
  if (inventory.scheduleCommands.length > 0) {
    embed.addFields({
      name: 'Scheduled posts by type',
      value: render.codeBlock(render.renderBarChart(
        inventory.scheduleCommands.map(row => ({ label: '/' + row.command, value: n(row.jobs) })),
        { width: 14, labelWidth: 10 })), inline: true
    });
  }
  if (inventory.watchlistCoins.length > 0) {
    embed.addFields({
      name: 'Watchlist favourites',
      value: render.codeBlock(render.renderBarChart(
        inventory.watchlistCoins.slice(0, 10).map(row => ({ label: row.coin, value: n(row.users) })),
        { width: 14, labelWidth: 8 })), inline: true
    });
  }
  if (inventory.portfolioCoins.length > 0) {
    embed.addFields({
      name: 'Most held coins',
      value: render.codeBlock(render.renderBarChart(
        inventory.portfolioCoins.slice(0, 10).map(row => ({ label: row.symbol, value: n(row.holders) })),
        { width: 14, labelWidth: 8 })), inline: true
    });
  }
  return textOnly(embed);
}

/* --------------------------------------------------------------------------
 *  Dispatch
 * -------------------------------------------------------------------------- */

/**
 * Every report a window button or the report menu can re-render, with the
 * arguments each one takes. The slash command, the buttons and the menu all
 * resolve through here so the argument mapping exists exactly once.
 *
 * state: { days, limit, timezone, includeSearches, compare, name, image }
 */
const REPORTS = {
  overview: { label: 'Overview', build: (s) => buildUsageOverview(s.days, s.timezone, { image: s.image, compare: s.compare }) },
  commands: { label: 'Commands', build: (s) => buildUsageCommands(s.days, s.limit, s.includeSearches, { image: s.image, compare: s.compare }) },
  users: { label: 'Users', build: (s) => buildUsageUsers(s.days, s.limit) },
  servers: { label: 'Servers', build: (s) => buildUsageGuilds(s.days, s.limit) },
  coins: { label: 'Coins', build: (s) => buildUsageCoins(s.days, s.limit, { compare: s.compare }) },
  trending: { label: 'Coin momentum', build: (s) => buildUsageTrending(s.days, s.limit, { image: s.image }) },
  activity: { label: 'Activity', build: (s) => buildUsageActivity(s.days, s.timezone, { image: s.image }) },
  command: { label: 'Command detail', build: (s) => buildUsageCommandDetail(s.name, s.days), needsName: true },
  errors: { label: 'Errors & latency', build: (s) => buildUsageErrors(s.days, s.limit, { image: s.image, compare: s.compare }) },
  growth: { label: 'Growth', build: (s) => buildUsageGrowth(s.days, s.timezone, { image: s.image }) },
  funnel: { label: 'Search funnel', build: (s) => buildUsageFunnel(s.days, s.limit, { image: s.image }) },
  credits: { label: 'CoinGecko credits', build: (s) => buildUsageCredits(s.days, s.timezone, { image: s.image, compare: s.compare }) },
  features: { label: 'Alerts, portfolios, schedules, watchlists', build: (s) => buildUsageFeatures(s.days, s.limit, { image: s.image }) },
  storage: { label: 'Storage', build: (s) => buildUsageStorage(s.days) }
};

/** Report names in menu order. */
const REPORT_NAMES = Object.keys(REPORTS);

/**
 * Builds any report by name from a state object.
 * @param {string} report one of REPORT_NAMES
 * @param {{days: number, limit: number, timezone: string, includeSearches?: boolean, compare?: boolean, name?: string, image?: boolean}} state
 * @returns {Promise<{embed: EmbedBuilder, chart: object|null}>}
 */
async function buildUsageReport(report, state) {
  const entry = REPORTS[report];
  if (!entry) throw new Error(`Unknown usage report: ${report}`);
  const normalized = {
    days: Math.max(1, Math.min(3650, Math.round(Number(state.days) || 30))),
    limit: Math.max(1, Math.min(50, Math.round(Number(state.limit) || 15))),
    timezone: telemetryReports.normalizeTimezone(state.timezone),
    includeSearches: Boolean(state.includeSearches),
    compare: Boolean(state.compare),
    name: state.name || '',
    image: Boolean(state.image)
  };
  return entry.build(normalized);
}

module.exports = {
  usageEmbed,
  deltaText,
  projectMonthEnd,
  rankMomentum,
  buildUsageOverview,
  buildUsageCommands,
  buildUsageUsers,
  buildUsageGuilds,
  buildUsageCoins,
  buildUsageActivity,
  buildUsageCommandDetail,
  buildUsageErrors,
  buildUsageGrowth,
  buildUsageCredits,
  buildUsageStorage,
  buildUsageTrending,
  buildUsageFunnel,
  buildUsageFeatures,
  buildUsageReport,
  REPORTS,
  REPORT_NAMES,
  setMonthlyCreditBudget,
  getMonthlyCreditBudget,
  DEMO_MONTHLY_CREDITS,
  USAGE_EMBED_COLOR
};
