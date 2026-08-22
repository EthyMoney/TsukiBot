/* ------------------------------------------------------------------------
 *
 *                    TsukiBot - src/telemetry-charts.js
 *
 * Real chart images for the /usage reports, replacing the unicode sparklines
 * and block bars that Discord's proportional font forced on the embeds.
 *
 * Two halves, kept deliberately apart:
 *
 *   1. The chart builders. Pure functions from report rows to an SVG string.
 *      No database, no Discord, no fonts loaded: they can be unit tested by
 *      asserting on the markup, and the same SVG could be served to a browser.
 *
 *   2. renderPng, which rasterises an SVG with sharp. sharp is already in the
 *      dependency tree (fast-average-color-node pulls it in) and renders SVG
 *      text with the system fonts, which is why this does not go through the
 *      puppeteer cluster the way the portfolio card does: no page to serve, no
 *      payload stash to expire, no browser round trip, and it keeps working
 *      when Chromium fails to launch. If sharp itself is unavailable every
 *      render returns null and the embeds fall back to their text charts.
 *
 * Every card is the same 4:3 size. Discord shows an embed image inside roughly
 * a 400x300 box, constrained on both axes, so 4:3 fills it and nothing is
 * wasted to letterboxing. Cards are rendered at 2x for retina displays.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const render = require('./telemetry-render');

const CARD_WIDTH = 760;
const CARD_HEIGHT = 570;
const RENDER_SCALE = 2;

const COLORS = {
  bg: '#1a1c22',
  panel: '#22252e',
  border: '#30343f',
  grid: '#2b2f3a',
  text: '#e9ecf7',
  muted: '#8b93ab',
  primary: '#9d8dff',
  green: '#2ee08a',
  red: '#ff5a76',
  blue: '#5ad1ff',
  amber: '#ffb638',
  pink: '#c78dff'
};

const FONT = '"Segoe UI", "Liberation Sans", "DejaVu Sans", Arial, sans-serif';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let sharp = null;
let sharpError = null;
try {
  sharp = require('sharp');
}
catch (err) {
  sharpError = err;
}

/* --------------------------------------------------------------------------
 *  Small helpers
 * -------------------------------------------------------------------------- */

/** @param {any} value */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Escapes text for an SVG attribute or text node. */
function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Rounds to a short decimal for attribute values. */
function r(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Turns a day value from the database into a YYYY-MM-DD key. node-postgres
 * hands DATE columns back as a Date at local midnight, so local getters are
 * the ones that recover the date it meant; a string is taken as-is.
 * @param {Date|string} value
 * @returns {string}
 */
function dayKey(value) {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
  }
  const text = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? '' : dayKey(parsed);
}

/** 'Aug 5' from a day key. */
function dayLabel(key) {
  const k = dayKey(key);
  if (!k) return '';
  return MONTHS[Number(k.slice(5, 7)) - 1] + ' ' + Number(k.slice(8, 10));
}

/** 0 = Sunday .. 6 = Saturday, from a day key. */
function weekdayOf(key) {
  const k = dayKey(key);
  if (!k) return -1;
  return new Date(Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)))).getUTCDay();
}

/**
 * A "nice" axis ceiling at or above max: 1, 2, 2.5, 5 or 10 times a power of ten.
 * @param {number} max
 * @returns {number}
 */
function niceCeil(max) {
  const value = Math.max(0, num(max));
  if (value === 0) return 1;
  if (value <= 5) return Math.ceil(value);
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

/**
 * Tick values from 0 to a nice ceiling.
 * @param {number} ceiling
 * @param {number} count
 */
function ticks(ceiling, count = 4) {
  const out = [];
  for (let i = 0; i <= count; i++) out.push(ceiling * i / count);
  return out;
}

/** Rough width of a run of text, for layout without font metrics. */
function textWidth(text, size) {
  return String(text).length * size * 0.56;
}

/** Compact number for axis labels and annotations. */
function fmt(value) {
  return render.compactNumber(value);
}

/** Truncates a label to fit a column. */
function clip(text, max) {
  return render.truncate(text, max);
}

/**
 * Row height for a bar list: tall enough to read when there are few rows,
 * compact enough to fit when there are many.
 */
function adaptiveRowHeight(count, available) {
  return Math.min(54, Math.max(30, Math.floor(available / Math.max(1, count))));
}

/** Signed percent change, or null when the base is zero. */
function pctChange(current, prior) {
  const c = num(current);
  const p = num(prior);
  if (p === 0) return null;
  return (c - p) / p * 100;
}

/* --------------------------------------------------------------------------
 *  SVG building blocks
 * -------------------------------------------------------------------------- */

function text(x, y, content, { size = 12, color = COLORS.muted, anchor = 'start', weight = 400, opacity = 1 } = {}) {
  return `<text x="${r(x)}" y="${r(y)}" font-size="${size}" fill="${color}" text-anchor="${anchor}" ` +
    `font-weight="${weight}"${opacity < 1 ? ` opacity="${opacity}"` : ''}>${esc(content)}</text>`;
}

function line(x1, y1, x2, y2, { color = COLORS.grid, width = 1, dash = '', opacity = 1 } = {}) {
  return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${color}" stroke-width="${width}"` +
    (dash ? ` stroke-dasharray="${dash}"` : '') + (opacity < 1 ? ` opacity="${opacity}"` : '') + '/>';
}

function rect(x, y, w, h, { fill = COLORS.panel, radius = 0, opacity = 1, stroke = '' } = {}) {
  return `<rect x="${r(x)}" y="${r(y)}" width="${r(Math.max(0, w))}" height="${r(Math.max(0, h))}" fill="${fill}"` +
    (radius ? ` rx="${radius}"` : '') + (opacity < 1 ? ` opacity="${opacity}"` : '') +
    (stroke ? ` stroke="${stroke}"` : '') + '/>';
}

function circle(cx, cy, radius, { fill = COLORS.primary, stroke = COLORS.bg, strokeWidth = 2 } = {}) {
  return `<circle cx="${r(cx)}" cy="${r(cy)}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function polyline(points, { color = COLORS.primary, width = 2, dash = '', opacity = 1 } = {}) {
  if (points.length === 0) return '';
  return `<polyline points="${points.map(p => r(p[0]) + ',' + r(p[1])).join(' ')}" fill="none" stroke="${color}" ` +
    `stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"` +
    (dash ? ` stroke-dasharray="${dash}"` : '') + (opacity < 1 ? ` opacity="${opacity}"` : '') + '/>';
}

function area(points, baselineY, { color = COLORS.primary, opacity = 0.18 } = {}) {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  const path = [`${r(first[0])},${r(baselineY)}`, ...points.map(p => r(p[0]) + ',' + r(p[1])), `${r(last[0])},${r(baselineY)}`];
  return `<polygon points="${path.join(' ')}" fill="${color}" opacity="${opacity}"/>`;
}

/**
 * The card frame every chart shares: dark ground, a title row, and a footer.
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.subtitle] rendered to the right of the title, muted
 * @param {string} [options.subtitleColor]
 * @param {string} [options.footer]
 * @param {string} options.body inner SVG markup
 * @param {Array<{label: string, color: string, dash?: boolean}>} [options.legend]
 * @returns {string}
 */
function card({ title, subtitle = '', subtitleColor = COLORS.muted, footer = '', body = '', legend = [] }) {
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" font-family='${FONT}'>`);
  parts.push(rect(0, 0, CARD_WIDTH, CARD_HEIGHT, { fill: COLORS.bg }));
  parts.push(text(24, 36, title, { size: 19, color: COLORS.text, weight: 700 }));
  if (subtitle) {
    // Bold runs wider than the plain-text estimate, hence the extra factor.
    parts.push(text(24 + textWidth(title, 19) * 1.12 + 14, 36, subtitle, { size: 13, color: subtitleColor, weight: 600 }));
  }

  // Legend along the right of the title row.
  let legendX = CARD_WIDTH - 24;
  for (const item of [...legend].reverse()) {
    const labelWidth = textWidth(item.label, 11.5);
    legendX -= labelWidth;
    parts.push(text(legendX, 36, item.label, { size: 11.5, color: COLORS.muted }));
    legendX -= 22;
    if (item.dash) parts.push(line(legendX, 32, legendX + 16, 32, { color: item.color, width: 2.5, dash: '4 3' }));
    else parts.push(rect(legendX, 29, 16, 6, { fill: item.color, radius: 3 }));
    legendX -= 16;
  }

  parts.push(body);
  if (footer) parts.push(text(24, CARD_HEIGHT - 16, footer, { size: 11, color: COLORS.muted }));
  parts.push('</svg>');
  return parts.join('');
}

/**
 * Horizontal gridlines with left labels for a y axis from 0 to ceiling.
 */
function yAxis(x0, x1, y0, y1, ceiling, { count = 4, format = fmt } = {}) {
  return ticks(ceiling, count).map(value => {
    const y = y1 - (value / ceiling) * (y1 - y0);
    return line(x0, y, x1, y, { color: COLORS.grid }) +
      text(x0 - 8, y + 4, format(value), { size: 11, anchor: 'end' });
  }).join('');
}

/**
 * Picks up to `max` evenly spaced indices for x labels, always including the
 * first and last.
 */
function labelIndices(length, max = 6) {
  if (length <= max) return Array.from({ length }, (_, i) => i);
  const step = (length - 1) / (max - 1);
  const out = new Set();
  for (let i = 0; i < max; i++) out.add(Math.round(i * step));
  return [...out].sort((a, b) => a - b);
}

/**
 * A horizontal bar row: label on the left, track, a filled bar and a value.
 */
function barRow({ x, y, width, rowHeight, label, labelWidth, value, max, color = COLORS.primary, valueText = '', secondary = 0, secondaryColor = COLORS.red }) {
  const trackX = x + labelWidth;
  const trackWidth = width - labelWidth - 8;
  const barHeight = Math.max(8, rowHeight - 12);
  const barY = y + (rowHeight - barHeight) / 2;
  const share = max > 0 ? Math.min(1, value / max) : 0;
  const filled = value > 0 ? Math.max(3, trackWidth * share) : 0;
  const secondaryShare = max > 0 ? Math.min(1, secondary / max) : 0;
  const secondaryFilled = secondary > 0 ? Math.max(3, trackWidth * secondaryShare) : 0;
  return rect(trackX, barY, trackWidth, barHeight, { fill: COLORS.panel, radius: 4 }) +
    (filled ? rect(trackX, barY, filled, barHeight, { fill: color, radius: 4 }) : '') +
    (secondaryFilled ? rect(trackX, barY, secondaryFilled, barHeight, { fill: secondaryColor, radius: 4 }) : '') +
    text(x + labelWidth - 10, y + rowHeight / 2 + 4, label, { size: 12, color: COLORS.text, anchor: 'end' }) +
    (valueText ? text(trackX + trackWidth + 6, y + rowHeight / 2 + 4, valueText, { size: 11, color: COLORS.muted }) : '');
}

/* --------------------------------------------------------------------------
 *  Charts
 * -------------------------------------------------------------------------- */

/**
 * Events, errors and distinct users per day as two stacked panels that share an
 * x axis. Two panels rather than two y axes: events and users differ by an
 * order of magnitude and a dual axis invites reading a crossing as meaningful.
 * @param {object} data
 * @param {Array<{day: any, events: any, users: any, errors?: any}>} data.series
 * @param {number} data.days
 * @param {string} [data.timezone]
 * @param {string} [data.title]
 * @returns {string} svg
 */
function dailyTrendChart({ series, days, timezone = 'UTC', title = 'Daily activity' }) {
  const rows = (series || []).map(row => ({
    key: dayKey(row.day), events: num(row.events), users: num(row.users), errors: num(row.errors)
  })).filter(row => row.key);

  const left = 62;
  const right = CARD_WIDTH - 30;
  const top1 = 70;
  const bottom1 = 340;
  const top2 = 385;
  const bottom2 = 505;
  const plotWidth = right - left;
  const n = rows.length;
  const x = (i) => n <= 1 ? left + plotWidth / 2 : left + (i / (n - 1)) * plotWidth;

  const eventsCeil = niceCeil(Math.max(...rows.map(row => row.events), 1));
  const usersCeil = niceCeil(Math.max(...rows.map(row => row.users), 1));
  const y1 = (v) => bottom1 - (v / eventsCeil) * (bottom1 - top1);
  const y2 = (v) => bottom2 - (v / usersCeil) * (bottom2 - top2);

  const parts = [];

  // Weekend shading, both panels, only when the columns are wide enough to read.
  if (n > 1 && n <= 120) {
    const slot = plotWidth / (n - 1);
    rows.forEach((row, i) => {
      const weekday = weekdayOf(row.key);
      if (weekday === 0 || weekday === 6) {
        parts.push(rect(x(i) - slot / 2, top1, slot, bottom1 - top1, { fill: COLORS.panel, opacity: 0.55 }));
        parts.push(rect(x(i) - slot / 2, top2, slot, bottom2 - top2, { fill: COLORS.panel, opacity: 0.55 }));
      }
    });
  }

  parts.push(text(left, top1 - 10, 'EVENTS PER DAY', { size: 10.5, weight: 600 }));
  parts.push(yAxis(left, right, top1, bottom1, eventsCeil));
  parts.push(text(left, top2 - 10, 'DISTINCT USERS PER DAY', { size: 10.5, weight: 600 }));
  parts.push(yAxis(left, right, top2, bottom2, usersCeil, { count: 2 }));

  if (n > 0) {
    const eventPoints = rows.map((row, i) => [x(i), y1(row.events)]);
    const userPoints = rows.map((row, i) => [x(i), y2(row.users)]);
    parts.push(area(eventPoints, bottom1, { color: COLORS.primary }));
    parts.push(polyline(eventPoints, { color: COLORS.primary, width: 2 }));

    // Errors as bars on the same axis: they are a subset of events, so sharing the
    // scale is honest, and a nonzero day always gets a visible 2px stub.
    const slot = n > 1 ? plotWidth / (n - 1) : plotWidth;
    const barWidth = Math.max(2, Math.min(10, slot * 0.5));
    rows.forEach((row, i) => {
      if (row.errors > 0) {
        const h = Math.max(2, bottom1 - y1(row.errors));
        parts.push(rect(x(i) - barWidth / 2, bottom1 - h, barWidth, h, { fill: COLORS.red, radius: 1 }));
      }
    });

    parts.push(area(userPoints, bottom2, { color: COLORS.green, opacity: 0.14 }));
    parts.push(polyline(userPoints, { color: COLORS.green, width: 2 }));

    const last = rows[n - 1];
    parts.push(circle(x(n - 1), y1(last.events), 4, { fill: COLORS.primary }));
    parts.push(circle(x(n - 1), y2(last.users), 4, { fill: COLORS.green }));

    // Direct labels on the end points, nudged inside the frame.
    const labelX = Math.min(x(n - 1) + 8, right - 30);
    parts.push(text(labelX, y1(last.events) + 4, fmt(last.events), { size: 11.5, color: COLORS.text, weight: 600 }));
    parts.push(text(labelX, y2(last.users) + 4, fmt(last.users), { size: 11.5, color: COLORS.text, weight: 600 }));

    // Peak annotation.
    const peakIndex = rows.reduce((best, row, i) => row.events > rows[best].events ? i : best, 0);
    if (peakIndex !== n - 1) {
      parts.push(circle(x(peakIndex), y1(rows[peakIndex].events), 3.5, { fill: COLORS.primary }));
      parts.push(text(x(peakIndex), y1(rows[peakIndex].events) - 9, fmt(rows[peakIndex].events) + ' peak', { size: 10.5, anchor: 'middle', color: COLORS.text }));
    }

    // Shared x labels under the bottom panel.
    for (const i of labelIndices(n, 7)) {
      parts.push(text(x(i), bottom2 + 18, dayLabel(rows[i].key), { size: 11, anchor: 'middle' }));
    }
  }
  else {
    parts.push(text(CARD_WIDTH / 2, (top1 + bottom1) / 2, 'No activity recorded in this window', { size: 14, anchor: 'middle' }));
  }

  const totalEvents = rows.reduce((sum, row) => sum + row.events, 0);
  const totalErrors = rows.reduce((sum, row) => sum + row.errors, 0);
  return card({
    title,
    subtitle: `last ${days} day${days === 1 ? '' : 's'} · ${timezone}`,
    legend: [
      { label: 'events', color: COLORS.primary },
      { label: 'errors', color: COLORS.red },
      { label: 'users', color: COLORS.green }
    ],
    footer: `${fmt(totalEvents)} events over ${n} day${n === 1 ? '' : 's'} · ${fmt(totalErrors)} errors · weekends shaded`,
    body: parts.join('')
  });
}

/**
 * CoinGecko credit burn-down for the current month: cumulative spend against an
 * even-pace line and the quota, with the projection drawn to month end so the
 * crossing point, if there is one, is visible rather than implied by a colour.
 * @param {object} data
 * @param {Array<{day: any, credits: any}>} data.monthDaily per-day credits since the 1st
 * @param {number} data.budget monthly quota
 * @param {number} data.monthToDate
 * @param {number} data.projected month-end projection
 * @param {number} data.perDay the rate the projection used
 * @param {number} data.daysInMonth
 * @param {number} data.dayOfMonth today, 1-based
 * @param {string} data.monthLabel e.g. 'August 2026'
 * @param {Array<{endpoint: string, calls: any, ratelimited?: any}>} [data.byEndpoint]
 * @returns {string} svg
 */
function creditBurndownChart({ monthDaily, budget, monthToDate, projected, perDay, daysInMonth, dayOfMonth, monthLabel, byEndpoint = [] }) {
  const left = 66;
  const right = CARD_WIDTH - 90;
  const top = 70;
  const bottom = 330;
  const plotWidth = right - left;
  const today = Math.max(1, Math.min(daysInMonth, num(dayOfMonth) || 1));
  const quota = Math.max(1, num(budget));

  // Cumulate per-day credits onto a 1..today axis, treating missing days as zero.
  const perDayMap = new Map();
  for (const row of monthDaily || []) {
    const key = dayKey(row.day);
    if (key) perDayMap.set(Number(key.slice(8, 10)), num(row.credits));
  }
  const cumulative = [];
  let running = 0;
  for (let day = 1; day <= today; day++) {
    running += perDayMap.get(day) || 0;
    cumulative.push(running);
  }
  const spent = Math.max(running, num(monthToDate));
  const projection = Math.max(spent, num(projected));
  const ceiling = niceCeil(Math.max(quota, projection, spent) * 1.05);

  const x = (day) => left + ((day - 1) / Math.max(1, daysInMonth - 1)) * plotWidth;
  const y = (v) => bottom - (v / ceiling) * (bottom - top);
  const withinQuota = projection <= quota;
  const accent = withinQuota ? COLORS.green : COLORS.red;

  const parts = [];
  // Five divisions so a 12.5k ceiling ticks at round 2.5k steps.
  parts.push(yAxis(left, right, top, bottom, ceiling, { count: 5 }));

  // Day ticks along the bottom of the plot.
  for (const day of [1, 5, 10, 15, 20, 25, daysInMonth]) {
    if (day <= daysInMonth) parts.push(text(x(day), bottom + 18, String(day), { size: 11, anchor: 'middle' }));
  }
  parts.push(text(right + 22, bottom + 18, 'day of month', { size: 10.5 }));

  // Even pace and the quota.
  parts.push(line(x(1), y(0), x(daysInMonth), y(quota), { color: COLORS.muted, width: 1.5, dash: '2 4' }));
  parts.push(line(left, y(quota), right, y(quota), { color: COLORS.red, width: 1.5, dash: '6 4' }));
  parts.push(text(right + 6, y(quota) + 4, 'quota ' + fmt(quota), { size: 11, color: COLORS.red, weight: 600 }));
  const paceLabelDay = Math.max(2, Math.round(daysInMonth * 0.62));
  parts.push(text(x(paceLabelDay) + 6, y(quota * paceLabelDay / daysInMonth) - 8, 'even pace', { size: 10.5 }));

  // Today.
  parts.push(line(x(today), top, x(today), bottom, { color: COLORS.border, width: 1, dash: '2 3' }));
  parts.push(text(x(today), top - 8, 'today', { size: 10.5, anchor: 'middle' }));

  // Actual spend.
  const points = cumulative.map((value, i) => [x(i + 1), y(value)]);
  parts.push(area(points, bottom, { color: COLORS.primary }));
  parts.push(polyline(points, { color: COLORS.primary, width: 2.5 }));

  // Projection to month end.
  if (today < daysInMonth) {
    parts.push(line(x(today), y(spent), x(daysInMonth), y(projection), { color: accent, width: 2, dash: '5 5', opacity: 0.9 }));
    parts.push(circle(x(daysInMonth), y(projection), 4, { fill: accent }));
    parts.push(text(right + 6, y(projection) + 4, '≈' + fmt(projection) + ' proj.', { size: 11, color: accent, weight: 600 }));
  }
  parts.push(circle(x(today), y(spent), 4.5, { fill: COLORS.primary }));
  parts.push(text(x(today) - 8, y(spent) - 10, fmt(spent) + ' spent', { size: 11.5, color: COLORS.text, weight: 600, anchor: 'end' }));

  // Endpoint bars beneath: where the credits go.
  const endpoints = (byEndpoint || []).slice(0, 5).map(row => ({
    label: clip(String(row.endpoint || '').replace(/^\//, ''), 26),
    calls: num(row.calls),
    ratelimited: num(row.ratelimited)
  }));
  const barsTop = 378;
  parts.push(text(24, barsTop - 6, 'WHERE THE CREDITS GO', { size: 10.5, weight: 600 }));
  const endpointMax = Math.max(1, ...endpoints.map(e => e.calls));
  endpoints.forEach((endpoint, i) => {
    parts.push(barRow({
      x: 24, y: barsTop + i * 30, width: CARD_WIDTH - 48, rowHeight: 30,
      label: endpoint.label, labelWidth: 200, value: endpoint.calls, max: endpointMax,
      valueText: fmt(endpoint.calls) + (endpoint.ratelimited ? ` · ${endpoint.ratelimited} × 429` : '')
    }));
  });
  if (endpoints.length === 0) {
    parts.push(text(24, barsTop + 20, 'No calls recorded in this window.', { size: 12 }));
  }

  const pct = Math.round(spent / quota * 100);
  return card({
    title: 'CoinGecko credits',
    subtitle: `${monthLabel} · ${fmt(spent)} of ${fmt(quota)} used (${pct}%)`,
    subtitleColor: accent,
    legend: [
      { label: 'spent', color: COLORS.primary },
      { label: 'projection', color: accent, dash: true },
      { label: 'quota', color: COLORS.red }
    ],
    footer: `${fmt(perDay)}/day over the last 24h · projection = month-to-date + rate × ${Math.max(0, daysInMonth - today)} days remaining · ${withinQuota ? 'within budget' : 'OVER BUDGET'}`,
    body: parts.join('')
  });
}

/**
 * Weekday x hour heatmap with hour-of-day and weekday marginals. Cells are
 * coloured on a continuous scale, so one hot cell no longer flattens the rest
 * into the same shade, and the busiest cells carry their exact counts.
 * @param {object} data
 * @param {Array<{weekday: any, hour: any, events: any, users?: any}>} data.grid
 * @param {Array<{hour: any, events: any, users?: any}>} [data.hourly]
 * @param {Array<{weekday: any, events: any, users?: any}>} [data.weekday]
 * @param {number} data.days
 * @param {string} data.timezone
 * @param {'events'|'users'} [data.metric]
 * @returns {string} svg
 */
function activityHeatmapChart({ grid, hourly = [], weekday = [], days, timezone = 'UTC', metric = 'events' }) {
  const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const cell of grid || []) {
    const dow = num(cell.weekday);
    const hour = num(cell.hour);
    if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) matrix[dow][hour] += num(cell[metric]);
  }
  // Display Monday first: rows 0..6 map to DOW 1..6,0.
  const rowOrder = [1, 2, 3, 4, 5, 6, 0];
  const max = Math.max(1, ...matrix.flat());

  const gridLeft = 70;
  const gridTop = 168;
  const cellWidth = 22;
  const cellHeight = 38;
  const gap = 2;
  const gridWidth = 24 * cellWidth;
  const gridHeight = 7 * cellHeight;

  const parts = [];

  // Hour marginal above the grid.
  const hourTotals = new Array(24).fill(0);
  for (const row of hourly) hourTotals[num(row.hour)] += num(row[metric]);
  const hourMax = Math.max(1, ...hourTotals);
  const marginalTop = 66;
  const marginalHeight = 82;
  parts.push(text(gridLeft, marginalTop - 6, `BY HOUR (${metric})`, { size: 10.5, weight: 600 }));
  hourTotals.forEach((value, hour) => {
    const h = value > 0 ? Math.max(2, value / hourMax * marginalHeight) : 0;
    parts.push(rect(gridLeft + hour * cellWidth + 1, marginalTop + marginalHeight - h, cellWidth - gap, h, { fill: COLORS.primary, radius: 2, opacity: 0.85 }));
  });
  const peakHour = hourTotals.indexOf(Math.max(...hourTotals));
  if (hourMax > 1) {
    parts.push(text(gridLeft + gridWidth, marginalTop - 6, `peak ${String(peakHour).padStart(2, '0')}:00 · ${fmt(hourMax)}`, { size: 10.5, anchor: 'end', color: COLORS.text }));
  }

  // Cells.
  rowOrder.forEach((dow, rowIndex) => {
    const y = gridTop + rowIndex * cellHeight;
    parts.push(text(gridLeft - 10, y + cellHeight / 2 + 4, WEEKDAYS_MON_FIRST[rowIndex], { size: 11.5, anchor: 'end', color: COLORS.text }));
    for (let hour = 0; hour < 24; hour++) {
      const value = matrix[dow][hour];
      const x = gridLeft + hour * cellWidth;
      // Gamma lifts the quiet cells so a 10% cell is visibly not zero.
      const intensity = value === 0 ? 0 : 0.12 + 0.88 * Math.pow(value / max, 0.7);
      parts.push(rect(x + 1, y + 1, cellWidth - gap, cellHeight - gap, { fill: COLORS.panel, radius: 3 }));
      if (value > 0) parts.push(rect(x + 1, y + 1, cellWidth - gap, cellHeight - gap, { fill: COLORS.primary, radius: 3, opacity: intensity }));
      if (value > 0 && value >= max * 0.6) {
        parts.push(text(x + cellWidth / 2, y + cellHeight / 2 + 3.5, fmt(value), { size: 9, anchor: 'middle', color: COLORS.bg, weight: 700 }));
      }
    }
  });

  // Hour ruler under the grid.
  for (const hour of [0, 3, 6, 9, 12, 15, 18, 21]) {
    parts.push(text(gridLeft + hour * cellWidth + 1, gridTop + gridHeight + 16, String(hour).padStart(2, '0'), { size: 10.5 }));
  }
  parts.push(text(gridLeft + gridWidth, gridTop + gridHeight + 16, '23', { size: 10.5, anchor: 'end' }));

  // Weekday marginal to the right of the grid.
  const weekdayTotals = new Array(7).fill(0);
  for (const row of weekday) weekdayTotals[num(row.weekday)] += num(row[metric]);
  const weekdayMax = Math.max(1, ...weekdayTotals);
  const marginalLeft = gridLeft + gridWidth + 24;
  const marginalWidth = CARD_WIDTH - marginalLeft - 64;
  rowOrder.forEach((dow, rowIndex) => {
    const y = gridTop + rowIndex * cellHeight;
    const value = weekdayTotals[dow];
    const w = value > 0 ? Math.max(2, value / weekdayMax * marginalWidth) : 0;
    parts.push(rect(marginalLeft, y + 6, marginalWidth, cellHeight - 12, { fill: COLORS.panel, radius: 3 }));
    if (w) parts.push(rect(marginalLeft, y + 6, w, cellHeight - 12, { fill: COLORS.primary, radius: 3, opacity: 0.85 }));
    parts.push(text(marginalLeft + marginalWidth + 6, y + cellHeight / 2 + 4, fmt(value), { size: 11, color: COLORS.text }));
  });
  parts.push(text(marginalLeft, gridTop - 8, 'BY WEEKDAY', { size: 10.5, weight: 600 }));

  // Colour legend.
  const legendY = gridTop + gridHeight + 48;
  parts.push(text(gridLeft, legendY + 4, 'quiet', { size: 10.5 }));
  for (let i = 0; i < 8; i++) {
    parts.push(rect(gridLeft + 40 + i * 18, legendY - 6, 16, 12, { fill: COLORS.panel, radius: 2 }));
    parts.push(rect(gridLeft + 40 + i * 18, legendY - 6, 16, 12, { fill: COLORS.primary, radius: 2, opacity: i === 0 ? 0 : 0.12 + 0.88 * Math.pow(i / 7, 0.7) }));
  }
  parts.push(text(gridLeft + 40 + 8 * 18 + 6, legendY + 4, `busy (${fmt(max)} ${metric} in the busiest hour)`, { size: 10.5 }));

  return card({
    title: 'Activity patterns',
    subtitle: `last ${days} day${days === 1 ? '' : 's'} · ${timezone}`,
    footer: `Each cell is one weekday-hour over the window · Monday first · counts are ${metric}`,
    body: parts.join('')
  });
}

/**
 * Command leaderboard as bars with the error share overlaid in red, annotated
 * with the reach columns the text table has no room for.
 * @param {object} data
 * @param {Array<{name: string, uses: any, users: any, guilds?: any, errors?: any, avg_ms?: any}>} data.rows
 * @param {number} data.days
 * @param {string} [data.title]
 * @returns {string} svg
 */
function commandBreakdownChart({ rows, days, title = 'Top commands' }) {
  const items = (rows || []).slice(0, 12).map(row => ({
    name: clip(String(row.name || ''), 24),
    uses: num(row.uses), users: num(row.users), guilds: num(row.guilds), errors: num(row.errors), avg: num(row.avg_ms)
  }));
  const max = Math.max(1, ...items.map(item => item.uses));
  const rowHeight = adaptiveRowHeight(items.length, 440);
  const top = 66;
  const parts = [];
  parts.push(text(24 + 190, top - 8, 'USES (errors in red)', { size: 10.5, weight: 600 }));
  parts.push(text(CARD_WIDTH - 24, top - 8, 'users · servers · avg', { size: 10.5, weight: 600, anchor: 'end' }));
  items.forEach((item, i) => {
    parts.push(barRow({
      x: 24, y: top + i * rowHeight, width: CARD_WIDTH - 48 - 150, rowHeight,
      label: item.name, labelWidth: 190, value: item.uses, max,
      secondary: item.errors, valueText: fmt(item.uses)
    }));
    parts.push(text(CARD_WIDTH - 24, top + i * rowHeight + rowHeight / 2 + 4,
      `${fmt(item.users)} · ${fmt(item.guilds)} · ${render.formatDuration(item.avg)}`,
      { size: 11, anchor: 'end', color: COLORS.muted }));
  });
  if (items.length === 0) parts.push(text(24, top + 20, 'No commands recorded in this window.', { size: 12 }));

  const total = items.reduce((sum, item) => sum + item.uses, 0);
  const errors = items.reduce((sum, item) => sum + item.errors, 0);
  return card({
    title,
    subtitle: `last ${days} day${days === 1 ? '' : 's'} · top ${items.length}`,
    legend: [{ label: 'uses', color: COLORS.primary }, { label: 'errors', color: COLORS.red }],
    footer: `${fmt(total)} invocations shown · ${fmt(errors)} errors · right column: distinct users · distinct servers · average time`,
    body: parts.join('')
  });
}

/**
 * What is failing and what is slow. Faults as bars sized by occurrences with the
 * users-affected count alongside; the slowest commands as avg / p95 / max ranges
 * on one shared time axis.
 * @param {object} data
 * @param {Array<{command: string, error_kind: string, occurrences: any, users_affected?: any}>} data.errors
 * @param {Array<{command: string, avg_ms: any, p95_ms: any, max_ms: any, samples?: any}>} data.slowest
 * @param {number} data.days
 * @returns {string} svg
 */
function errorsChart({ errors, slowest, days }) {
  const faults = (errors || []).slice(0, 7).map(row => ({
    label: clip(`${row.command} · ${row.error_kind}`, 40),
    occurrences: num(row.occurrences), users: num(row.users_affected)
  }));
  const slow = (slowest || []).slice(0, 6).map(row => ({
    command: clip(String(row.command || ''), 16),
    avg: num(row.avg_ms), p95: num(row.p95_ms), max: num(row.max_ms), samples: num(row.samples)
  }));

  const parts = [];
  const faultTop = 68;
  const faultRow = 30;
  parts.push(text(24, faultTop - 8, 'FAILURES BY FAULT', { size: 10.5, weight: 600 }));
  const faultMax = Math.max(1, ...faults.map(f => f.occurrences));
  faults.forEach((fault, i) => {
    parts.push(barRow({
      x: 24, y: faultTop + i * faultRow, width: CARD_WIDTH - 48 - 110, rowHeight: faultRow,
      label: fault.label, labelWidth: 300, value: fault.occurrences, max: faultMax, color: COLORS.red,
      valueText: `${fmt(fault.occurrences)} · ${fmt(fault.users)} user${fault.users === 1 ? '' : 's'}`
    }));
  });
  if (faults.length === 0) parts.push(text(24, faultTop + 20, 'No command errors in this window.', { size: 12, color: COLORS.green }));

  // Latency ranges, starting under the faults (with room for at least three rows).
  const latencyTop = faultTop + Math.max(3, faults.length) * faultRow + 56;
  const labelWidth = 130;
  const axisLeft = 24 + labelWidth;
  const axisRight = CARD_WIDTH - 90;
  const latencyMax = niceCeil(Math.max(1, ...slow.map(s => s.max)));
  const xAt = (ms) => axisLeft + (ms / latencyMax) * (axisRight - axisLeft);
  parts.push(text(24, latencyTop - 8, 'SLOWEST COMMANDS · avg ● p95 | max ▸', { size: 10.5, weight: 600 }));
  for (const tick of ticks(latencyMax, 4)) {
    parts.push(line(xAt(tick), latencyTop, xAt(tick), latencyTop + slow.length * 30, { color: COLORS.grid }));
    parts.push(text(xAt(tick), latencyTop + slow.length * 30 + 14, render.formatDuration(tick), { size: 10.5, anchor: 'middle' }));
  }
  slow.forEach((item, i) => {
    const y = latencyTop + i * 30 + 15;
    parts.push(text(24 + labelWidth - 10, y + 4, item.command, { size: 12, anchor: 'end', color: COLORS.text }));
    parts.push(line(xAt(0), y, xAt(item.max), y, { color: COLORS.border, width: 6 }));
    parts.push(line(xAt(item.avg), y, xAt(item.p95), y, { color: COLORS.amber, width: 6 }));
    parts.push(circle(xAt(item.avg), y, 5, { fill: COLORS.primary }));
    parts.push(line(xAt(item.p95), y - 7, xAt(item.p95), y + 7, { color: COLORS.amber, width: 2 }));
    parts.push(circle(xAt(item.max), y, 3, { fill: COLORS.red, strokeWidth: 0 }));
    parts.push(text(axisRight + 8, y + 4, `${render.formatDuration(item.avg)} · n=${fmt(item.samples)}`, { size: 10.5 }));
  });
  if (slow.length === 0) parts.push(text(24, latencyTop + 20, 'Not enough timed samples yet (5+ per command).', { size: 12 }));

  const total = faults.reduce((sum, f) => sum + f.occurrences, 0);
  return card({
    title: 'Errors and latency',
    subtitle: `last ${days} day${days === 1 ? '' : 's'}`,
    legend: [{ label: 'failures', color: COLORS.red }, { label: 'avg', color: COLORS.primary }, { label: 'avg→p95', color: COLORS.amber }],
    footer: `${fmt(total)} failures across ${faults.length} fault${faults.length === 1 ? '' : 's'} shown · latency bars span 0 → max, gold = avg to p95`,
    body: parts.join('')
  });
}

/**
 * New versus returning users per day as stacked bars, with the retention
 * buckets and the churn counts beneath.
 * @param {object} data
 * @param {Array<{day: any, active_users: any, new_users: any, returning_users: any}>} data.growth
 * @param {Array<{bucket: string, users: any}>} [data.retention]
 * @param {{active?: any, retained?: any, churned?: any, resurrected?: any}|null} [data.churn]
 * @param {number} data.days
 * @param {string} [data.timezone]
 * @returns {string} svg
 */
function growthChart({ growth, retention = [], churn = null, days, timezone = 'UTC' }) {
  const rows = (growth || []).map(row => ({
    key: dayKey(row.day), active: num(row.active_users), fresh: num(row.new_users), returning: num(row.returning_users)
  })).filter(row => row.key);
  const n = rows.length;
  const left = 62;
  const right = CARD_WIDTH - 30;
  const top = 70;
  const bottom = 300;
  const plotWidth = right - left;
  const ceiling = niceCeil(Math.max(1, ...rows.map(row => row.fresh + row.returning)));
  const y = (v) => bottom - (v / ceiling) * (bottom - top);
  const slot = plotWidth / Math.max(1, n);
  const barWidth = Math.max(2, Math.min(26, slot * 0.7));

  const parts = [];
  parts.push(text(left, top - 10, 'ACTIVE USERS PER DAY · returning + new', { size: 10.5, weight: 600 }));
  parts.push(yAxis(left, right, top, bottom, ceiling));
  rows.forEach((row, i) => {
    const cx = left + slot * i + slot / 2;
    const returningTop = y(row.returning);
    const newTop = y(row.returning + row.fresh);
    if (row.returning > 0) parts.push(rect(cx - barWidth / 2, returningTop, barWidth, bottom - returningTop, { fill: COLORS.primary, radius: 2 }));
    if (row.fresh > 0) parts.push(rect(cx - barWidth / 2, newTop, barWidth, Math.max(2, returningTop - newTop - 1), { fill: COLORS.green, radius: 2 }));
  });
  for (const i of labelIndices(n, 7)) {
    parts.push(text(left + slot * i + slot / 2, bottom + 18, dayLabel(rows[i].key), { size: 11, anchor: 'middle' }));
  }
  if (n === 0) parts.push(text(CARD_WIDTH / 2, (top + bottom) / 2, 'No activity recorded in this window', { size: 14, anchor: 'middle' }));

  // Retention buckets, bottom left.
  const bucketsTop = 360;
  parts.push(text(24, bucketsTop - 8, 'DAYS ACTIVE PER USER', { size: 10.5, weight: 600 }));
  const buckets = (retention || []).slice(0, 5).map(row => ({ label: clip(row.bucket, 18), users: num(row.users) }));
  const bucketMax = Math.max(1, ...buckets.map(b => b.users));
  buckets.forEach((bucket, i) => {
    parts.push(barRow({
      x: 24, y: bucketsTop + i * 28, width: 400, rowHeight: 28,
      label: bucket.label, labelWidth: 130, value: bucket.users, max: bucketMax, valueText: fmt(bucket.users)
    }));
  });
  if (buckets.length === 0) parts.push(text(24, bucketsTop + 20, 'No retention data yet.', { size: 12 }));

  // Churn tiles, bottom right.
  const tiles = [
    ['Active', churn ? num(churn.active) : null, COLORS.text],
    ['Retained', churn ? num(churn.retained) : null, COLORS.primary],
    ['Churned', churn ? num(churn.churned) : null, COLORS.red],
    ['Came back', churn ? num(churn.resurrected) : null, COLORS.green]
  ];
  const tileLeft = 470;
  const tileWidth = (CARD_WIDTH - 24 - tileLeft - 12) / 2;
  parts.push(text(tileLeft, bucketsTop - 8, `VS THE ${days} DAYS BEFORE`, { size: 10.5, weight: 600 }));
  tiles.forEach(([label, value, color], i) => {
    const tx = tileLeft + (i % 2) * (tileWidth + 12);
    const ty = bucketsTop + Math.floor(i / 2) * 72;
    parts.push(rect(tx, ty, tileWidth, 62, { fill: COLORS.panel, radius: 8 }));
    parts.push(text(tx + 12, ty + 20, label.toUpperCase(), { size: 10, weight: 600 }));
    parts.push(text(tx + 12, ty + 48, value === null ? '–' : fmt(value), { size: 22, color, weight: 700 }));
  });

  const newTotal = rows.reduce((sum, row) => sum + row.fresh, 0);
  return card({
    title: 'Growth and retention',
    subtitle: `last ${days} day${days === 1 ? '' : 's'} · ${timezone}`,
    legend: [{ label: 'returning', color: COLORS.primary }, { label: 'new', color: COLORS.green }],
    footer: `${fmt(newTotal)} first-time users in the window · churned = active in the prior window but not this one · came back = returned after skipping a window`,
    body: parts.join('')
  });
}

/**
 * Coin demand momentum: the biggest risers and fallers against the previous
 * window, side by side.
 * @param {object} data
 * @param {Array<{coin: string, current_requests: any, prior_requests: any, current_users?: any}>} data.risers
 * @param {Array<{coin: string, current_requests: any, prior_requests: any, current_users?: any}>} data.fallers
 * @param {number} data.days
 * @returns {string} svg
 */
function momentumChart({ risers, fallers, days }) {
  const prep = (rows) => (rows || []).slice(0, 8).map(row => {
    const current = num(row.current_requests);
    const prior = num(row.prior_requests);
    const pct = pctChange(current, prior);
    return {
      coin: clip(row.coin, 10), current, prior, delta: current - prior,
      users: num(row.current_users),
      pctText: pct === null ? 'new' : `${pct >= 0 ? '+' : ''}${Math.round(pct)}%`
    };
  });
  const up = prep(risers);
  const down = prep(fallers);
  const max = Math.max(1, ...up.map(r => Math.abs(r.delta)), ...down.map(r => Math.abs(r.delta)));
  const parts = [];
  const top = 76;
  const rowHeight = adaptiveRowHeight(Math.max(up.length, down.length), 430);
  const columnWidth = (CARD_WIDTH - 48 - 24) / 2;

  const renderColumn = (items, x, heading, color) => {
    parts.push(text(x, top - 12, heading, { size: 10.5, weight: 600 }));
    items.forEach((item, i) => {
      // Label, a short bar, then the numbers: delta (pct) · requests now · users now.
      parts.push(barRow({
        x, y: top + i * rowHeight, width: columnWidth - 165, rowHeight,
        label: item.coin, labelWidth: 64, value: Math.abs(item.delta), max, color,
        valueText: `${item.delta >= 0 ? '+' : ''}${fmt(item.delta)} (${item.pctText}) · ${fmt(item.current)} req · ${fmt(item.users)}u`
      }));
    });
    if (items.length === 0) parts.push(text(x, top + 20, 'Nothing moved enough to rank.', { size: 12 }));
  };
  renderColumn(up, 24, 'RISERS · change vs the previous window', COLORS.green);
  renderColumn(down, 24 + columnWidth + 24, 'FALLERS', COLORS.red);
  parts.push(line(24 + columnWidth + 12, top - 20, 24 + columnWidth + 12, top + Math.max(up.length, down.length, 1) * rowHeight, { color: COLORS.border }));

  return card({
    title: 'Coin momentum',
    subtitle: `last ${days} day${days === 1 ? '' : 's'} vs the ${days} before`,
    legend: [{ label: 'rising', color: COLORS.green }, { label: 'falling', color: COLORS.red }],
    footer: 'Bar length = change in requests · right column: requests this window · distinct users · "new" = not requested in the prior window',
    body: parts.join('')
  });
}

/**
 * Autocomplete searches that became commands, per command.
 * @param {object} data
 * @param {Array<{command: string, searches: any, converted: any, users?: any}>} data.funnel
 * @param {number} data.days
 * @returns {string} svg
 */
function funnelChart({ funnel, days }) {
  const items = (funnel || []).slice(0, 10).map(row => ({
    command: clip('/' + row.command, 18), searches: num(row.searches), converted: num(row.converted), users: num(row.users)
  }));
  const max = Math.max(1, ...items.map(item => item.searches));
  const top = 70;
  const rowHeight = adaptiveRowHeight(items.length, 440);
  const parts = [];
  parts.push(text(24 + 150, top - 8, 'SEARCHES · converted share in green', { size: 10.5, weight: 600 }));
  items.forEach((item, i) => {
    const share = item.searches ? item.converted / item.searches : 0;
    parts.push(barRow({
      x: 24, y: top + i * rowHeight, width: CARD_WIDTH - 48 - 120, rowHeight,
      label: item.command, labelWidth: 150, value: item.searches, max, color: COLORS.panel
    }));
    // Converted share drawn inside the searches bar.
    const trackX = 24 + 150;
    const trackWidth = CARD_WIDTH - 48 - 120 - 150 - 8;
    const full = item.searches > 0 ? Math.max(3, trackWidth * Math.min(1, item.searches / max)) : 0;
    const barHeight = Math.max(8, rowHeight - 12);
    const barY = top + i * rowHeight + (rowHeight - barHeight) / 2;
    if (full) parts.push(rect(trackX, barY, full, barHeight, { fill: COLORS.border, radius: 4 }));
    if (item.converted > 0) parts.push(rect(trackX, barY, Math.max(3, full * share), barHeight, { fill: COLORS.green, radius: 4 }));
    parts.push(text(CARD_WIDTH - 24, top + i * rowHeight + rowHeight / 2 + 4,
      `${Math.round(share * 100)}% · ${fmt(item.converted)}/${fmt(item.searches)}`, { size: 11.5, anchor: 'end', color: COLORS.text }));
  });
  if (items.length === 0) parts.push(text(24, top + 20, 'No autocomplete searches recorded in this window.', { size: 12 }));

  const searches = items.reduce((sum, item) => sum + item.searches, 0);
  const converted = items.reduce((sum, item) => sum + item.converted, 0);
  return card({
    title: 'Search → command funnel',
    subtitle: `last ${days} day${days === 1 ? '' : 's'} · ${searches ? Math.round(converted / searches * 100) : 0}% overall`,
    legend: [{ label: 'searches', color: COLORS.border }, { label: 'converted', color: COLORS.green }],
    footer: 'A search converts when the same user runs that command within a minute of settling on the query',
    body: parts.join('')
  });
}

/**
 * This week against last week, day by day, for the digest.
 * @param {object} data
 * @param {Array<{day: any, events: any}>} data.series 14 (or so) daily rows, oldest first
 * @param {string} [data.title]
 * @param {string} [data.metricLabel]
 * @returns {string} svg
 */
function weekOverWeekChart({ series, title = 'This week vs last week', metricLabel = 'events' }) {
  const rows = (series || []).map(row => ({ key: dayKey(row.day), value: num(row.events) })).filter(row => row.key);
  const current = rows.slice(-7);
  const prior = rows.slice(Math.max(0, rows.length - 14), Math.max(0, rows.length - 7));
  const left = 62;
  const right = CARD_WIDTH - 30;
  const top = 76;
  const bottom = 470;
  const plotWidth = right - left;
  const ceiling = niceCeil(Math.max(1, ...current.map(r => r.value), ...prior.map(r => r.value)));
  const x = (i) => left + (i / 6) * plotWidth;
  const y = (v) => bottom - (v / ceiling) * (bottom - top);
  const parts = [];
  parts.push(yAxis(left, right, top, bottom, ceiling));
  for (let i = 0; i < 7; i++) {
    const label = current[i] ? WEEKDAYS_MON_FIRST[(weekdayOf(current[i].key) + 6) % 7] + ' ' + dayLabel(current[i].key) : `day ${i + 1}`;
    parts.push(text(x(i), bottom + 18, label, { size: 11, anchor: 'middle' }));
  }
  // Align prior week by position (day 1..7), padding a short prior week on the left.
  const priorOffset = 7 - prior.length;
  const priorPoints = prior.map((row, i) => [x(i + priorOffset), y(row.value)]);
  const currentOffset = 7 - current.length;
  const currentPoints = current.map((row, i) => [x(i + currentOffset), y(row.value)]);
  parts.push(polyline(priorPoints, { color: COLORS.muted, width: 2, dash: '5 4' }));
  parts.push(area(currentPoints, bottom, { color: COLORS.primary }));
  parts.push(polyline(currentPoints, { color: COLORS.primary, width: 2.5 }));
  currentPoints.forEach(p => parts.push(circle(p[0], p[1], 4, { fill: COLORS.primary })));
  priorPoints.forEach(p => parts.push(circle(p[0], p[1], 3, { fill: COLORS.muted })));
  if (rows.length === 0) parts.push(text(CARD_WIDTH / 2, (top + bottom) / 2, 'No activity recorded', { size: 14, anchor: 'middle' }));

  const currentTotal = current.reduce((sum, row) => sum + row.value, 0);
  const priorTotal = prior.reduce((sum, row) => sum + row.value, 0);
  const pct = pctChange(currentTotal, priorTotal);
  return card({
    title,
    subtitle: `${fmt(currentTotal)} ${metricLabel} · ${pct === null ? 'no prior week' : (pct >= 0 ? '▲ +' : '▼ ') + Math.round(pct) + '% vs last week'}`,
    subtitleColor: pct === null ? COLORS.muted : (pct >= 0 ? COLORS.green : COLORS.red),
    legend: [{ label: 'this week', color: COLORS.primary }, { label: 'last week', color: COLORS.muted, dash: true }],
    footer: `Last week totalled ${fmt(priorTotal)} ${metricLabel}`,
    body: parts.join('')
  });
}

/**
 * What users have set up: standing alerts, portfolios, scheduled posts and
 * watchlists, as four quadrants each with its headline counts and a short bar
 * list of the coins (or post types) involved.
 * @param {object} data
 * @param {object} data.inventory a getFeatureInventory result
 * @param {object} [data.activity] a getFeatureActivity row, for the footer
 * @param {{latest: object|null, prior: object|null}} [data.delta] snapshots for the subtitle
 * @param {number} data.days
 * @returns {string} svg
 */
function featuresChart({ inventory, activity = null, delta = null, days }) {
  const inv = inventory || {};
  const alerts = inv.alerts || {};
  const portfolios = inv.portfolios || {};
  const schedules = inv.schedules || {};
  const watchlists = inv.watchlists || {};
  const parts = [];

  const quadrant = (col, row, title, kpi, items, color, emptyText, note = '') => {
    const x = 24 + col * 368;
    const y = 66 + row * 252;
    const width = 344;
    parts.push(rect(x, y, width, 236, { fill: COLORS.panel, radius: 10 }));
    parts.push(text(x + 14, y + 22, title.toUpperCase(), { size: 10.5, weight: 600 }));
    parts.push(text(x + 14, y + 44, clip(kpi, 42), { size: 13, color: COLORS.text, weight: 600 }));
    if (note) parts.push(text(x + 14, y + 60, clip(note, 52), { size: 10.5 }));
    const max = Math.max(1, ...items.map(item => item.value));
    const rowHeight = 30;
    const barsTop = y + (note ? 70 : 56);
    items.slice(0, 5).forEach((item, i) => {
      parts.push(barRow({
        x: x + 14, y: barsTop + i * rowHeight, width: width - 28 - 96, rowHeight,
        label: clip(item.label, 12), labelWidth: 88, value: item.value, max, color,
        valueText: item.text
      }));
    });
    if (items.length === 0) parts.push(text(x + 14, barsTop + 24, emptyText, { size: 11.5 }));
  };

  quadrant(0, 0, 'Price alerts',
    `${fmt(alerts.total)} active · ${fmt(alerts.users)} users · ${fmt(alerts.coins)} coins`,
    (inv.alertCoins || []).map(row => ({
      label: row.symbol, value: num(row.alerts),
      text: `${fmt(row.alerts)} · ${fmt(row.users)}u · ▲${fmt(row.above)} ▼${fmt(row.below)}`
    })),
    COLORS.amber, 'No price alerts set.');

  quadrant(1, 0, 'Portfolios',
    `${fmt(portfolios.users)} users · ${fmt(portfolios.holdings)} holdings · ${fmt(portfolios.coins)} coins`,
    (inv.portfolioCoins || []).map(row => ({
      label: row.symbol, value: num(row.holders), text: `${fmt(row.holders)} holder${num(row.holders) === 1 ? '' : 's'}`
    })),
    COLORS.green, 'No portfolios yet.');

  const intervalLabel = (minutes) => {
    const m = num(minutes);
    if (m >= 1440) return m === 1440 ? 'daily' : `${Math.round(m / 1440)}d`;
    if (m >= 60) return `${Math.round(m / 60)}h`;
    return `${m}m`;
  };
  const intervals = (inv.scheduleIntervals || []).map(row => `${intervalLabel(row.interval_minutes)} ×${fmt(row.jobs)}`).join(' ');
  quadrant(0, 1, 'Scheduled posts',
    `${fmt(schedules.jobs)} jobs · ${fmt(schedules.guilds)} servers` + (num(schedules.stale) ? ` · ${fmt(schedules.stale)} stale` : ''),
    (inv.scheduleCommands || []).map(row => ({
      label: '/' + row.command, value: num(row.jobs), text: `${fmt(row.jobs)} · ${fmt(row.guilds)} server${num(row.guilds) === 1 ? '' : 's'}`
    })),
    COLORS.blue, 'No scheduled posts.', intervals ? `every ${intervals}` : '');

  quadrant(1, 1, 'Watchlists',
    `${fmt(watchlists.users)} users · ${fmt(watchlists.entries)} entries · ${fmt(watchlists.coins)} coins`,
    (inv.watchlistCoins || []).map(row => ({
      label: row.coin, value: num(row.users), text: `on ${fmt(row.users)} list${num(row.users) === 1 ? '' : 's'}`
    })),
    COLORS.primary, 'No watchlists yet.');

  // Subtitle: change since the prior snapshot, when there is one.
  let subtitle = '';
  if (delta && delta.latest && delta.prior) {
    const d = (a, b) => { const v = num(a) - num(b); return v === 0 ? '=' : (v > 0 ? '+' : '') + v; };
    subtitle = `vs ${days}d ago: alerts ${d(delta.latest.alerts, delta.prior.alerts)} · portfolios ${d(delta.latest.portfolio_users, delta.prior.portfolio_users)}` +
      ` · schedules ${d(delta.latest.schedules, delta.prior.schedules)} · watchlists ${d(delta.latest.watchlists, delta.prior.watchlists)}`;
  }

  const a = activity || {};
  const footer = activity
    ? `last ${days}d: ${fmt(a.alerts_created)} alerts set · ${fmt(a.alerts_fired)} fired` +
      (num(a.alerts_failed) ? ` (${fmt(a.alerts_failed)} undeliverable)` : '') +
      ` · ${fmt(a.portfolio_sets)} holdings set · ${fmt(a.schedules_created)} schedules created · ${fmt(a.posts_run)} posts run` +
      (num(a.posts_failed) ? ` (${fmt(a.posts_failed)} failed)` : '') +
      ` · ${fmt(a.watchlist_uses)} watchlist uses`
    : 'Standing state right now';
  return card({ title: 'What users have set up', subtitle, body: parts.join(''), footer });
}

/* --------------------------------------------------------------------------
 *  Rasterising
 * -------------------------------------------------------------------------- */

/**
 * Whether chart images can be produced at all. False only when sharp failed to
 * load, in which case every report keeps its text charts.
 * @returns {boolean}
 */
function isAvailable() {
  return sharp !== null;
}

/**
 * Why isAvailable() is false, for the startup log.
 * @returns {string|null}
 */
function unavailableReason() {
  return sharpError ? (sharpError.message || String(sharpError)) : null;
}

/**
 * Rasterises an SVG card to a PNG buffer at RENDER_SCALE. Never throws: a chart
 * is a bonus on top of the numbers, so any failure returns null and the caller
 * sends the embed without it.
 * @param {string} svg
 * @returns {Promise<Buffer|null>}
 */
async function renderPng(svg) {
  if (!sharp || !svg) return null;
  try {
    return await sharp(Buffer.from(svg, 'utf8'), { density: 72 * RENDER_SCALE }).png().toBuffer();
  }
  catch {
    return null;
  }
}

module.exports = {
  CARD_WIDTH,
  CARD_HEIGHT,
  RENDER_SCALE,
  COLORS,
  isAvailable,
  unavailableReason,
  renderPng,
  dailyTrendChart,
  creditBurndownChart,
  activityHeatmapChart,
  commandBreakdownChart,
  errorsChart,
  growthChart,
  momentumChart,
  funnelChart,
  weekOverWeekChart,
  featuresChart,
  // exposed for tests
  dayKey,
  dayLabel,
  niceCeil,
  pctChange
};
