/* ------------------------------------------------------------------------
 *
 *                    TsukiBot - src/telemetry-render.js
 *
 * Turns telemetry query rows into text a human can read in Discord.
 *
 * The one rule that dictates everything here: Discord embeds render in a
 * proportional font, so space padding does not line up. Any table or bar chart
 * has to sit inside a code fence to be aligned at all. Every function below
 * therefore produces monospace-ready text and the caller wraps it.
 *
 * All pure - no database, no Discord objects - so the layout is unit testable.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const HEAT_CHARS = ['·', '░', '▒', '▓', '█'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Shortens a string to fit a column, marking the cut so a truncated value is
 * never mistaken for a real one.
 * @param {any} value
 * @param {number} max
 * @returns {string}
 */
function truncate(value, max) {
  const text = value === null || value === undefined ? '' : String(value);
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max);
  return text.slice(0, max - 1) + '…';
}

/**
 * Compact thousands formatting for table cells, where width is scarce.
 * @param {number} n
 * @returns {string}
 */
function compactNumber(n) {
  const value = Number(n) || 0;
  if (value < 1000) return String(value);
  if (value < 1000000) return (value / 1000).toFixed(value < 10000 ? 1 : 0) + 'k';
  return (value / 1000000).toFixed(1) + 'm';
}

/**
 * @param {number|null} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return '-';
  const value = Number(ms);
  if (value < 1000) return Math.round(value) + 'ms';
  if (value < 60000) return (value / 1000).toFixed(1) + 's';
  return (value / 60000).toFixed(1) + 'm';
}

/**
 * "3d ago" style stamps, which read faster than absolute times in a leaderboard.
 * @param {Date|string|null} date
 * @param {Date} [now]
 * @returns {string}
 */
function formatRelative(date, now = new Date()) {
  if (!date) return '-';
  const then = date instanceof Date ? date : new Date(date);
  if (isNaN(then.getTime())) return '-';
  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 2592000) return Math.floor(seconds / 86400) + 'd ago';
  return Math.floor(seconds / 2592000) + 'mo ago';
}

/**
 * Formats a per-minute rate at a precision that suits its magnitude.
 *
 * A quiet bot runs at a fraction of a command per minute, and rounding that to an integer prints
 * "0" - which is exactly the uninformative number this metric used to show. Small rates therefore
 * keep decimals, while busy ones drop them because nobody needs "142.7".
 *
 * @param {number|null} rate
 * @returns {string}
 */
function formatRate(rate) {
  if (rate === null || rate === undefined || !Number.isFinite(Number(rate))) return 'n/a';
  const value = Number(rate);
  if (value === 0) return '0';
  if (value >= 10) return String(Math.round(value));
  if (value >= 1) return value.toFixed(1);
  if (value >= 0.01) return value.toFixed(2);
  return '<0.01';
}

/**
 * @param {number} part
 * @param {number} total
 * @param {number} [decimals]
 * @returns {string}
 */
function percent(part, total, decimals = 1) {
  const t = Number(total) || 0;
  if (t === 0) return '0%';
  return ((Number(part) || 0) / t * 100).toFixed(decimals) + '%';
}

/**
 * Renders an aligned text table.
 *
 * Columns are {key, label, width, align}. Width is a maximum, not a minimum:
 * a column of short values shrinks to its content so the table stays narrow
 * enough for a phone screen, which is where these get read.
 *
 * @param {Array<object>} rows
 * @param {Array<{key: string, label: string, width?: number, align?: 'left'|'right', format?: Function}>} columns
 * @returns {string} newline separated, ready for a code fence
 */
function renderTable(rows, columns) {
  if (!rows || rows.length === 0) return 'No data yet.';

  const cells = rows.map(row => columns.map(column => {
    const raw = column.format ? column.format(row[column.key], row) : row[column.key];
    return truncate(raw === null || raw === undefined ? '-' : raw, column.width || 20);
  }));

  const widths = columns.map((column, i) => {
    const longest = Math.max(column.label.length, ...cells.map(row => row[i].length));
    return Math.min(longest, column.width || 20);
  });

  const line = (values) => values
    .map((value, i) => columns[i].align === 'right' ? value.padStart(widths[i]) : value.padEnd(widths[i]))
    .join('  ')
    .trimEnd();

  const header = line(columns.map(c => c.label));
  const rule = widths.map(w => '─'.repeat(w)).join('  ');
  return [header, rule, ...cells.map(line)].join('\n');
}

/**
 * Two-column label/value block, right-aligning the values so the numbers form a
 * readable column. Used for the summary panels, where a full table would be
 * more structure than the content needs.
 * @param {Array<[string, string]>} pairs
 * @returns {string}
 */
function renderKeyValue(pairs) {
  if (!pairs || pairs.length === 0) return 'No data yet.';
  const labelWidth = Math.max(...pairs.map(([label]) => String(label).length));
  const valueWidth = Math.max(...pairs.map(([, value]) => String(value).length));
  return pairs
    .map(([label, value]) => String(label).padEnd(labelWidth) + '  ' + String(value).padStart(valueWidth))
    .join('\n');
}

/**
 * Horizontal bar chart with the label and value on the same line.
 * @param {Array<{label: string, value: number}>} items
 * @param {object} [options]
 * @param {number} [options.width] bar width in characters
 * @param {number} [options.labelWidth]
 * @returns {string}
 */
function renderBarChart(items, options = {}) {
  if (!items || items.length === 0) return 'No data yet.';
  const width = options.width || 20;
  const labelWidth = options.labelWidth ||
    Math.min(16, Math.max(...items.map(item => String(item.label).length)));
  const max = Math.max(...items.map(item => Number(item.value) || 0), 1);
  const valueWidth = Math.max(...items.map(item => compactNumber(item.value).length));

  return items.map(item => {
    const value = Number(item.value) || 0;
    // A nonzero value always gets at least one block, so "rare but real" never
    // renders as an empty row indistinguishable from zero.
    const filled = value === 0 ? 0 : Math.max(1, Math.round(value / max * width));
    return truncate(item.label, labelWidth).padEnd(labelWidth) + ' ' +
      '█'.repeat(filled).padEnd(width) + ' ' +
      compactNumber(value).padStart(valueWidth);
  }).join('\n');
}

/**
 * One-line sparkline over a numeric series.
 * @param {Array<number>} values
 * @returns {string}
 */
function renderSparkline(values) {
  if (!values || values.length === 0) return '';
  const numbers = values.map(v => Number(v) || 0);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  if (max === min) return SPARK_CHARS[0].repeat(numbers.length);
  return numbers.map(value => {
    const index = Math.round((value - min) / (max - min) * (SPARK_CHARS.length - 1));
    return SPARK_CHARS[index];
  }).join('');
}

/**
 * Weekday x hour heatmap.
 *
 * Rows are days, columns are hours 0-23. Intensity is scaled against the single
 * busiest cell, so the picture always uses the full character range no matter
 * the absolute volume.
 *
 * @param {Array<{weekday: number, hour: number, events: number}>} grid
 * @returns {string}
 */
function renderHeatmap(grid) {
  if (!grid || grid.length === 0) return 'No data yet.';

  const counts = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const cell of grid) {
    const weekday = Number(cell.weekday);
    const hour = Number(cell.hour);
    if (weekday >= 0 && weekday < 7 && hour >= 0 && hour < 24) {
      counts[weekday][hour] += Number(cell.events) || 0;
    }
  }

  const max = Math.max(...counts.flat(), 1);
  const scale = (value) => {
    if (value === 0) return HEAT_CHARS[0];
    // Nonzero always reaches at least the first shaded level.
    const index = Math.max(1, Math.round(value / max * (HEAT_CHARS.length - 1)));
    return HEAT_CHARS[index];
  };

  // Hour ruler every six hours, aligned under the grid.
  const ruler = '    0     6     12    18   ';
  const rows = counts.map((day, index) =>
    WEEKDAY_NAMES[index] + ' ' + day.map(scale).join(''));

  return [ruler, ...rows].join('\n');
}

/**
 * The legend that makes the heatmap readable.
 * @returns {string}
 */
function heatmapLegend() {
  return 'quiet ' + HEAT_CHARS.join(' ') + ' busy';
}

/**
 * Renders rows as CSV for the export subcommand. Values containing a comma,
 * quote or newline are quoted and internal quotes doubled, per RFC 4180.
 * @param {Array<object>} rows
 * @returns {string}
 */
function renderCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);

  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' && !(value instanceof Date)
      ? JSON.stringify(value)
      : String(value instanceof Date ? value.toISOString() : value);
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };

  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => escape(row[header])).join(','))
  ].join('\n');
}

/**
 * Wraps text in a code fence, trimming it to fit a Discord limit first so an
 * oversized table degrades into a shorter one instead of a rejected request.
 * @param {string} text
 * @param {number} [limit] the field or description limit being targeted
 * @returns {string}
 */
function codeBlock(text, limit = 1024) {
  const fence = 6; // ```\n and \n```
  const body = String(text || '');
  if (body.length + fence <= limit) return '```\n' + body + '\n```';

  const lines = body.split('\n');
  const kept = [];
  let used = fence + 20; // headroom for the truncation note
  for (const line of lines) {
    if (used + line.length + 1 > limit) break;
    kept.push(line);
    used += line.length + 1;
  }
  return '```\n' + kept.join('\n') + '\n… truncated\n```';
}

module.exports = {
  truncate,
  compactNumber,
  formatDuration,
  formatRelative,
  formatRate,
  percent,
  renderKeyValue,
  renderTable,
  renderBarChart,
  renderSparkline,
  renderHeatmap,
  heatmapLegend,
  renderCsv,
  codeBlock,
  WEEKDAY_NAMES,
  SPARK_CHARS,
  HEAT_CHARS
};
