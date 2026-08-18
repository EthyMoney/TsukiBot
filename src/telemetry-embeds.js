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
 * The dispatcher stays in main.js: it needs the interaction, the admin gate and
 * the deferral, none of which belong in a rendering module.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const { EmbedBuilder } = require('discord.js');

// Same module instances main.js initialized: require() caches, so telemetry here
// is the one holding the live write buffer.
const telemetry = require('./telemetry');
const telemetryReports = require('./telemetry-reports');
const render = require('./telemetry-render');

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

const USAGE_EMBED_COLOR = '#5865F2';

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
 * Renders the headline panel: how much the bot is used, by how many people,
 * how reliably, and how fast.
 * @param {number} days
 * @param {string} timezone
 * @returns {Promise<EmbedBuilder>}
 */
async function buildUsageOverview(days, timezone) {
  const [stats, series, storage] = await Promise.all([
    telemetryReports.getOverview(days),
    telemetryReports.getDailySeries(Math.min(days, 60), timezone),
    telemetryReports.getStorageStats()
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
    ['Busiest day', stats.busiest ? `${new Date(stats.busiest.day).toISOString().slice(0, 10)} (${render.compactNumber(stats.busiest.events)})` : '-'],
    ['Events today', render.compactNumber(stats.events_today)]
  ]);

  embed.addFields(
    { name: 'Volume', value: render.codeBlock(volume), inline: true },
    { name: 'Reach', value: render.codeBlock(reach), inline: true },
    { name: 'Health', value: render.codeBlock(health), inline: false }
  );

  if (series.length > 1) {
    const spark = render.renderSparkline(series.map(row => row.events));
    embed.addFields({
      name: `Daily volume (${series.length}d)`,
      value: render.codeBlock(spark + '\n' +
        `low ${render.compactNumber(Math.min(...series.map(r => Number(r.events))))}` +
        `   high ${render.compactNumber(Math.max(...series.map(r => Number(r.events))))}`)
    });
  }

  const writer = telemetry.getWriterStats();
  embed.setDescription(
    `Tracking since **${stats.trackingSince ? new Date(stats.trackingSince).toISOString().slice(0, 10) : 'n/a'}** · ` +
    `**${render.compactNumber(stats.lifetimeEvents)}** events all time · ` +
    `**${storage.total_size}** on disk` +
    (writer.buffered || writer.dropped
      ? `\nBuffer: ${writer.buffered} queued, ${writer.pendingAutocomplete} searches settling` +
        (writer.dropped ? `, ⚠️ ${writer.dropped} dropped` : '')
      : '')
  );

  return embed;
}

/**
 * Most used commands, ordered by invocation count.
 * @param {number} days
 * @param {number} limit
 * @param {boolean} includeAutocomplete
 * @returns {Promise<EmbedBuilder>}
 */
async function buildUsageCommands(days, limit, includeAutocomplete) {
  const rows = await telemetryReports.getTopCommands(days, limit, includeAutocomplete);
  const embed = usageEmbed('Top commands', days);

  if (rows.length === 0) {
    return embed.setDescription('No commands recorded yet in this window.');
  }

  const total = rows.reduce((sum, row) => sum + Number(row.uses), 0);
  const chart = render.renderBarChart(
    rows.slice(0, 12).map(row => ({ label: row.name, value: Number(row.uses) })),
    { width: 18 }
  );

  const table = render.renderTable(rows, [
    { key: 'name', label: 'Command', width: 18 },
    { key: 'uses', label: 'Uses', align: 'right', width: 7, format: render.compactNumber },
    { key: 'users', label: 'Users', align: 'right', width: 6, format: render.compactNumber },
    { key: 'avg_ms', label: 'Avg', align: 'right', width: 7, format: render.formatDuration },
    { key: 'errors', label: 'Err', align: 'right', width: 5, format: render.compactNumber }
  ]);

  embed.setDescription(`**${render.compactNumber(total)}** invocations across **${rows.length}** commands.`);
  embed.addFields(
    { name: 'Share', value: render.codeBlock(chart) },
    { name: 'Detail', value: render.codeBlock(table) }
  );
  return embed;
}

/**
 * Heaviest users. Ids are included because a username is not stable and is not
 * what any follow-up query would key on.
 * @param {number} days
 * @param {number} limit
 * @returns {Promise<EmbedBuilder>}
 */
async function buildUsageUsers(days, limit) {
  const rows = await telemetryReports.getTopUsers(days, limit);
  const embed = usageEmbed('Top users', days);

  if (rows.length === 0) {
    return embed.setDescription('No users recorded yet in this window.');
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
  return embed;
}

/**
 * Busiest servers.
 * @param {number} days
 * @param {number} limit
 * @returns {Promise<EmbedBuilder>}
 */
async function buildUsageGuilds(days, limit) {
  const rows = await telemetryReports.getTopGuilds(days, limit);
  const embed = usageEmbed('Top servers', days);

  if (rows.length === 0) {
    return embed.setDescription('No server activity recorded yet in this window.');
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
  return embed;
}

/**
 * Most requested coins.
 * @param {number} days
 * @param {number} limit
 * @returns {Promise<EmbedBuilder>}
 */
async function buildUsageCoins(days, limit) {
  const rows = await telemetryReports.getTopCoins(days, limit);
  const embed = usageEmbed('Top coins', days);

  if (rows.length === 0) {
    return embed.setDescription('No coin lookups recorded yet in this window.');
  }

  const total = rows.reduce((sum, row) => sum + Number(row.requests), 0);
  const chart = render.renderBarChart(
    rows.slice(0, 15).map(row => ({ label: row.coin, value: Number(row.requests) })),
    { width: 18, labelWidth: 8 }
  );

  const table = render.renderTable(rows, [
    { key: 'coin', label: 'Coin', width: 10 },
    { key: 'requests', label: 'Lookups', align: 'right', width: 8, format: render.compactNumber },
    { key: 'users', label: 'Users', align: 'right', width: 6, format: render.compactNumber },
    { key: 'via_command', label: 'Mostly via', width: 12 }
  ]);

  embed.setDescription(`**${render.compactNumber(total)}** coin lookups across **${rows.length}** distinct assets.`);
  embed.addFields(
    { name: 'Demand', value: render.codeBlock(chart) },
    { name: 'Detail', value: render.codeBlock(table) }
  );
  return embed;
}

/**
 * When the bot gets used: hour of day, day of week, and the two combined as a
 * heatmap. Rendered in the requested timezone, since UTC hours do not answer
 * the question anyone is actually asking.
 * @param {number} days
 * @param {string} timezone
 * @returns {Promise<EmbedBuilder>}
 */
async function buildUsageActivity(days, timezone) {
  const [hourly, weekly, grid] = await Promise.all([
    telemetryReports.getHourlyActivity(days, timezone),
    telemetryReports.getWeekdayActivity(days, timezone),
    telemetryReports.getActivityGrid(days, timezone)
  ]);

  const embed = usageEmbed('Activity patterns', days, timezone);
  if (hourly.length === 0) {
    return embed.setDescription('No activity recorded yet in this window.');
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
  embed.addFields(
    { name: 'By hour', value: render.codeBlock(render.renderBarChart(hourItems, { width: 14, labelWidth: 5 })) },
    { name: 'By weekday', value: render.codeBlock(render.renderBarChart(weekdayItems, { width: 18, labelWidth: 3 })), inline: true },
    { name: 'Heatmap', value: render.codeBlock(render.renderHeatmap(grid) + '\n' + render.heatmapLegend()) }
  );
  return embed;
}

/**
 * Deep dive on a single command: which subcommands people reach for, which
 * options they actually supply, and what values they pass.
 * @param {string} command
 * @param {number} days
 * @returns {Promise<EmbedBuilder>}
 */
async function buildUsageCommandDetail(command, days) {
  const name = String(command || '').replace(/^\//, '').trim().toLowerCase();
  const [subcommands, coverage, values] = await Promise.all([
    telemetryReports.getSubcommandSplit(name, days),
    telemetryReports.getOptionCoverage(name, days),
    telemetryReports.getParameterUsage(name, days, 25)
  ]);

  const embed = usageEmbed(`/${name} usage`, days);
  const total = subcommands.reduce((sum, row) => sum + Number(row.uses), 0);

  if (total === 0) {
    return embed.setDescription(`No recorded invocations of \`/${name}\` in this window. Check the spelling, or widen the window.`);
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
        { key: 'uses', label: 'Uses', align: 'right', width: 7, format: render.compactNumber }
      ]))
    });
  }

  return embed;
}

/**
 * What is failing and what is slow, the two things worth acting on.
 * @param {number} days
 * @param {number} limit
 * @returns {Promise<EmbedBuilder>}
 */
async function buildUsageErrors(days, limit) {
  const [errors, slowest] = await Promise.all([
    telemetryReports.getErrors(days, limit),
    telemetryReports.getSlowestCommands(days, 10)
  ]);

  const embed = usageEmbed('Errors and latency', days);

  if (errors.length === 0) {
    embed.setDescription('✅ No command errors recorded in this window.');
  }
  else {
    const total = errors.reduce((sum, row) => sum + Number(row.occurrences), 0);
    embed.setDescription(`**${render.compactNumber(total)}** failures across **${errors.length}** distinct faults.`);
    embed.addFields({
      name: 'Failures',
      value: render.codeBlock(render.renderTable(errors, [
        { key: 'command', label: 'Command', width: 12 },
        { key: 'error_kind', label: 'Error', width: 24 },
        { key: 'occurrences', label: 'Count', align: 'right', width: 6, format: render.compactNumber },
        { key: 'last_seen', label: 'Last', width: 9, format: render.formatRelative }
      ]))
    });
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

  return embed;
}

/**
 * New versus returning users, and how many days people stick around for.
 * @param {number} days
 * @param {string} timezone
 * @returns {Promise<EmbedBuilder>}
 */
async function buildUsageGrowth(days, timezone) {
  const [growth, retention] = await Promise.all([
    telemetryReports.getGrowth(days, timezone),
    telemetryReports.getRetention(days)
  ]);

  const embed = usageEmbed('Growth and retention', days, timezone);
  if (growth.length === 0) {
    return embed.setDescription('No activity recorded yet in this window.');
  }

  const newTotal = growth.reduce((sum, row) => sum + Number(row.new_users), 0);
  const returningPeak = Math.max(...growth.map(row => Number(row.returning_users)));

  embed.setDescription(
    `**${render.compactNumber(newTotal)}** first-time users in this window. ` +
    `Peak returning users in a day: **${render.compactNumber(returningPeak)}**.`
  );

  embed.addFields({
    name: 'Daily active users',
    value: render.codeBlock(
      render.renderSparkline(growth.map(row => row.active_users)) + '\n' +
      'new      ' + render.renderSparkline(growth.map(row => row.new_users))
    )
  });

  const recent = growth.slice(-12);
  embed.addFields({
    name: 'Recent days',
    value: render.codeBlock(render.renderTable(recent, [
      { key: 'day', label: 'Day', width: 10, format: (value) => new Date(value).toISOString().slice(5, 10) },
      { key: 'active_users', label: 'Active', align: 'right', width: 7, format: render.compactNumber },
      { key: 'new_users', label: 'New', align: 'right', width: 5, format: render.compactNumber },
      { key: 'returning_users', label: 'Return', align: 'right', width: 7, format: render.compactNumber }
    ]))
  });

  if (retention.length > 0) {
    embed.addFields({
      name: 'How many days users stayed active',
      value: render.codeBlock(render.renderBarChart(
        retention.map(row => ({ label: row.bucket, value: Number(row.users) })),
        { width: 16, labelWidth: 16 }
      ))
    });
  }

  return embed;
}

module.exports = {
  usageEmbed,
  buildUsageOverview,
  buildUsageCommands,
  buildUsageUsers,
  buildUsageGuilds,
  buildUsageCoins,
  buildUsageActivity,
  buildUsageCommandDetail,
  buildUsageErrors,
  buildUsageGrowth,
  USAGE_EMBED_COLOR
};
