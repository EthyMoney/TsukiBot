/* ------------------------------------------------------------------------
 *
 *                  TsukiBot - src/telemetry-components.js
 *
 * The interactive parts of /usage: window buttons, the report menu, the
 * drill-down menu and the prune confirmation. Everything here is pure
 * (state in, discord.js builders out) so the customId scheme can be unit
 * tested without an interaction.
 *
 * Discord components carry no state of their own; a click arrives with only
 * the customId, so the whole report state rides inside it. The scheme:
 *
 *   usage:<report>:<days>:<limit>:<tz>:<flags>[:<name>]  re-render a report
 *   usage-nav:<days>:<limit>:<tz>:<flags>                 report menu (value = report)
 *   usage-drill:<days>:<limit>:<tz>:<flags>               drill-down menu (value = command)
 *   usage-prune:<keepDays>:<count>                        confirm a prune
 *   usage-prune-cancel                                    abandon a prune
 *
 * flags is a run of letters: s = count autocomplete searches, c = compare
 * with the previous window, i = the reply carries chart images. Colons are
 * safe separators because none of the parts can contain one: report and
 * command names are [a-z0-9-], and normalizeTimezone rejects anything outside
 * [A-Za-z0-9_+\-/]. Discord caps a customId at 100 characters, which the
 * longest realistic id ('usage:command:3650:50:America/Argentina/ComodRivadavia:sci:portfolio')
 * stays inside, but buildUsageCustomId still refuses anything over the cap
 * rather than truncate it into a broken id.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} = require('discord.js');
const { REPORTS, REPORT_NAMES } = require('./telemetry-embeds');
const { normalizeTimezone } = require('./telemetry-reports');

const CUSTOM_ID_MAX = 100;
const WINDOW_PRESETS = [7, 30, 90, 365];
const WINDOW_LABELS = { 7: '7d', 30: '30d', 90: '90d', 365: '1y' };
const SELECT_OPTION_CAP = 25;

/* --------------------------------------------------------------------------
 *  State <-> customId
 * -------------------------------------------------------------------------- */

/**
 * Clamps and fills a report state so every encoded id is well formed.
 * @param {object} [state]
 * @returns {{days: number, limit: number, timezone: string, includeSearches: boolean, compare: boolean, image: boolean, name: string}}
 */
function normalizeState(state = {}) {
  return {
    days: Math.max(1, Math.min(3650, Math.round(Number(state.days) || 30))),
    limit: Math.max(1, Math.min(50, Math.round(Number(state.limit) || 15))),
    timezone: normalizeTimezone(state.timezone),
    includeSearches: Boolean(state.includeSearches),
    compare: Boolean(state.compare),
    image: Boolean(state.image),
    name: String(state.name || '').replace(/^\//, '').trim().toLowerCase().split(/\s+/)[0] || ''
  };
}

/** @param {object} state normalized */
function encodeFlags(state) {
  return (state.includeSearches ? 's' : '') + (state.compare ? 'c' : '') + (state.image ? 'i' : '');
}

/** @param {string} flags */
function decodeFlags(flags) {
  const text = String(flags || '');
  return { includeSearches: text.includes('s'), compare: text.includes('c'), image: text.includes('i') };
}

/**
 * The shared tail of every state-carrying id: days:limit:tz:flags.
 * @param {object} state
 * @returns {string}
 */
function encodeState(state) {
  const s = normalizeState(state);
  return `${s.days}:${s.limit}:${s.timezone}:${encodeFlags(s)}`;
}

/**
 * Reads days:limit:tz:flags back out of split id parts.
 * @param {string[]} parts the four parts, in order
 * @returns {object} state
 */
function decodeState(parts) {
  const [days, limit, timezone, flags] = parts;
  return normalizeState({ days, limit, timezone, ...decodeFlags(flags) });
}

/**
 * The id for a button that re-renders `report` with `state`.
 * @param {string} report
 * @param {object} state
 * @returns {string|null} null when the id would exceed Discord's cap
 */
function buildUsageCustomId(report, state) {
  const s = normalizeState(state);
  const parts = ['usage', report, encodeState(s)];
  if (REPORTS[report] && REPORTS[report].needsName) parts.push(s.name);
  const id = parts.join(':');
  return Buffer.byteLength(id) > CUSTOM_ID_MAX ? null : id;
}

/**
 * Decodes any /usage component id.
 * @param {string} customId
 * @returns {null|{kind: 'report', report: string, state: object}|{kind: 'nav'|'drill', state: object}|{kind: 'prune', keepDays: number, count: number}|{kind: 'prune-cancel'}}
 */
function parseUsageCustomId(customId) {
  const id = String(customId || '');
  const parts = id.split(':');
  const head = parts[0];

  if (head === 'usage-prune-cancel') return { kind: 'prune-cancel' };

  if (head === 'usage-prune') {
    const keepDays = Math.round(Number(parts[1]));
    if (!Number.isFinite(keepDays) || keepDays < 1) return null;
    return { kind: 'prune', keepDays, count: Math.max(0, Math.round(Number(parts[2]) || 0)) };
  }

  if (head === 'usage-nav' || head === 'usage-drill') {
    if (parts.length < 5) return null;
    return { kind: head === 'usage-nav' ? 'nav' : 'drill', state: decodeState(parts.slice(1, 5)) };
  }

  if (head === 'usage') {
    const report = parts[1];
    if (!REPORTS[report] || parts.length < 6) return null;
    const state = decodeState(parts.slice(2, 6));
    if (REPORTS[report].needsName) state.name = normalizeState({ name: parts[6] }).name;
    return { kind: 'report', report, state };
  }

  return null;
}

/* --------------------------------------------------------------------------
 *  Component rows
 * -------------------------------------------------------------------------- */

/**
 * The window presets plus a refresh button. The active window is Primary, the
 * rest Secondary, exactly like the chart timeframe buttons. Five buttons is
 * Discord's cap for one row.
 * @param {string} report
 * @param {object} state
 * @returns {ActionRowBuilder|null}
 */
function buildWindowRow(report, state) {
  const s = normalizeState(state);
  const buttons = [];
  for (const days of WINDOW_PRESETS) {
    const id = buildUsageCustomId(report, { ...s, days });
    if (!id) return null;
    buttons.push(new ButtonBuilder()
      .setCustomId(id)
      .setLabel(WINDOW_LABELS[days])
      .setStyle(days === s.days ? ButtonStyle.Primary : ButtonStyle.Secondary));
  }
  const refreshId = buildUsageCustomId(report, s);
  if (!refreshId) return null;
  // Refresh re-renders the same state. Discord rejects duplicate ids in one
  // message, so when the current window is a preset the refresh id gets a
  // harmless extra segment that the parser ignores.
  const duplicate = WINDOW_PRESETS.includes(s.days);
  buttons.push(new ButtonBuilder()
    .setCustomId(duplicate ? refreshId + (REPORTS[report].needsName ? '' : ':r') : refreshId)
    .setLabel('↻ Refresh')
    .setStyle(ButtonStyle.Secondary));
  return new ActionRowBuilder().addComponents(buttons);
}

/**
 * The report menu: one message hops between every report that does not need
 * a command name.
 * @param {string} current report name shown as selected
 * @param {object} state
 * @returns {ActionRowBuilder|null}
 */
function buildReportMenuRow(current, state) {
  const id = `usage-nav:${encodeState(state)}`;
  if (Buffer.byteLength(id) > CUSTOM_ID_MAX) return null;
  const options = REPORT_NAMES
    .filter(name => !REPORTS[name].needsName)
    .slice(0, SELECT_OPTION_CAP)
    .map(name => new StringSelectMenuOptionBuilder()
      .setLabel(REPORTS[name].label)
      .setValue(name)
      .setDefault(name === current));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(id).setPlaceholder('Jump to another report…').addOptions(options));
}

/**
 * Bare command names from leaderboard rows: the subcommand suffix is stripped
 * ("portfolio show" → "portfolio"), duplicates collapse, and the list is capped
 * at what one select menu can hold.
 * @param {Array<string>} names
 * @returns {string[]}
 */
function drillDownNames(names) {
  const seen = new Set();
  for (const raw of names || []) {
    const bare = normalizeState({ name: raw }).name;
    if (bare && /^[a-z0-9-]{1,32}$/.test(bare)) seen.add(bare);
    if (seen.size >= SELECT_OPTION_CAP) break;
  }
  return [...seen];
}

/**
 * The drill-down menu under a leaderboard: pick a command to open its deep dive.
 * @param {Array<string>} names command names as the leaderboard showed them
 * @param {object} state
 * @returns {ActionRowBuilder|null}
 */
function buildDrillDownRow(names, state) {
  const id = `usage-drill:${encodeState(state)}`;
  const options = drillDownNames(names);
  if (options.length === 0 || Buffer.byteLength(id) > CUSTOM_ID_MAX) return null;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id)
      .setPlaceholder('Deep dive on a command…')
      .addOptions(options.map(name => new StringSelectMenuOptionBuilder().setLabel('/' + name).setValue(name))));
}

/**
 * Every row a report reply carries: window buttons, the report menu, and a
 * drill-down menu when the report lists commands.
 * @param {string} report
 * @param {object} state
 * @param {{commandNames?: string[]}} [extras]
 * @returns {ActionRowBuilder[]}
 */
function buildUsageComponents(report, state, { commandNames = [] } = {}) {
  if (!REPORTS[report]) return [];
  const rows = [];
  const windowRow = buildWindowRow(report, state);
  if (windowRow) rows.push(windowRow);
  const menuRow = buildReportMenuRow(report, state);
  if (menuRow) rows.push(menuRow);
  if (commandNames.length > 0) {
    const drill = buildDrillDownRow(commandNames, state);
    if (drill) rows.push(drill);
  }
  return rows;
}

/**
 * The confirmation under a prune preview: a red button that names the number
 * of rows it will delete, and a cancel.
 * @param {number} keepDays
 * @param {number} count rows the prune would delete
 * @returns {ActionRowBuilder[]}
 */
function buildPruneComponents(keepDays, count) {
  const rows = Math.max(0, Math.round(Number(count) || 0));
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`usage-prune:${Math.round(keepDays)}:${rows}`)
      .setLabel(`Delete ${rows.toLocaleString('en-US')} event${rows === 1 ? '' : 's'}`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('usage-prune-cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  )];
}

/**
 * The prune row with both buttons disabled, for after a decision.
 * @param {string} label what the danger button should now read
 * @returns {ActionRowBuilder[]}
 */
function buildPruneResolvedComponents(label) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('usage-prune-done').setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(true)
  )];
}

module.exports = {
  CUSTOM_ID_MAX,
  WINDOW_PRESETS,
  normalizeState,
  encodeState,
  decodeState,
  buildUsageCustomId,
  parseUsageCustomId,
  drillDownNames,
  buildWindowRow,
  buildReportMenuRow,
  buildDrillDownRow,
  buildUsageComponents,
  buildPruneComponents,
  buildPruneResolvedComponents
};
