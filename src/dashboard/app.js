/* ------------------------------------------------------------------------
 *
 *                    TsukiBot - src/dashboard/app.js
 *
 * The usage dashboard page. Vanilla JS, no build step; Chart.js 4 is served
 * from /dash/vendor by the same Express app that serves this file.
 *
 * Sections, in order:
 *   config & state · persistence · formatters · fetch · DOM helpers ·
 *   tables · charts · tab renderers (one function per tab) · shell wiring.
 *
 * Every numeric value from the API is passed through num(): node-postgres
 * returns COUNT(*) and numerics as strings, and the server leaves them alone.
 * Day buckets arrive as 'YYYY-MM-DD' strings; timestamps as ISO strings.
 *
 * ------------------------------------------------------------------------ */

'use strict';
/* global Chart */

(function () {
  /* ======================================================================
   *  Config & state
   * ====================================================================== */

  const C = {
    bg: '#1a1c22', panel: '#22252e', border: '#30343f', text: '#e9ecf7', muted: '#8b93ab',
    accent: '#9d8dff', green: '#2ee08a', red: '#ff5a76', blue: '#5ad1ff', amber: '#ffb638'
  };
  const SERIES = [C.accent, C.blue, C.green, C.amber, C.red, '#ff8ad8', '#7ef0e0', '#c9c9c9'];
  const ACCENT_RGB = '157, 141, 255';

  const FALLBACK_TZ = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata',
    'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const HEAT_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first, Sunday last
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MAX_DAYS = 3650;
  const AUTO_REFRESH_MS = 60000;
  const STORAGE_KEY = 'tsuki-dash';
  const EVENT_FILTER_DEFAULTS = { command: '', user: '', guild: '', coin: '', outcome: '', error_kind: '', type: '', limit: 200 };

  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const state = {
    days: 30,
    tz: 'UTC',
    tab: 'overview',
    autoRefresh: false,
    compare: false,
    includeSearches: false,
    heatMetric: 'events',
    commandFilter: '',
    selectedCommand: null,
    eventFilters: Object.assign({}, EVENT_FILTER_DEFAULTS),
    meta: { commands: [], timezones: [], budget: 10000 },
    lastUpdated: null
  };

  let renderSeq = 0;
  let autoTimer = null;

  /* ======================================================================
   *  Persistence (localStorage is a convenience, never a requirement)
   * ====================================================================== */

  const PERSISTED = ['days', 'tz', 'tab', 'autoRefresh', 'compare', 'includeSearches', 'heatMetric'];

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      if (Number.isFinite(Number(saved.days))) state.days = clampDays(saved.days);
      if (typeof saved.tz === 'string' && saved.tz) state.tz = saved.tz;
      if (typeof saved.tab === 'string') state.tab = saved.tab;
      state.autoRefresh = !!saved.autoRefresh;
      state.compare = !!saved.compare;
      state.includeSearches = !!saved.includeSearches;
      if (saved.heatMetric === 'users' || saved.heatMetric === 'events') state.heatMetric = saved.heatMetric;
    } catch {
      /* private mode, disabled storage: ignore */
    }
  }

  function saveState() {
    try {
      const out = {};
      for (const key of PERSISTED) out[key] = state[key];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    } catch {
      /* ignore */
    }
  }

  function clampDays(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return 30;
    return Math.min(MAX_DAYS, Math.max(1, n));
  }

  /* ======================================================================
   *  Formatters
   * ====================================================================== */

  const intFmt = new Intl.NumberFormat('en-US');
  const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function n0(v) { return num(v) || 0; }
  function pad2(n) { return String(n).padStart(2, '0'); }

  function fmtInt(v) {
    const n = num(v);
    return n === null ? '–' : intFmt.format(Math.round(n));
  }
  function fmtCompact(v) {
    const n = num(v);
    if (n === null) return '–';
    return Math.abs(n) >= 10000 ? compactFmt.format(n) : intFmt.format(Math.round(n));
  }
  function fmtPct(part, total, decimals) {
    const p = num(part);
    const t = num(total);
    if (p === null || !t) return '–';
    return (100 * p / t).toFixed(decimals === undefined ? 1 : decimals) + '%';
  }
  function fmtPctValue(x, decimals) {
    return x === null || x === undefined || !Number.isFinite(x) ? '–' : x.toFixed(decimals === undefined ? 1 : decimals) + '%';
  }
  function fmtMs(v) {
    const n = num(v);
    if (n === null) return '–';
    if (n < 1000) return Math.round(n) + ' ms';
    if (n < 60000) return (n / 1000).toFixed(n < 10000 ? 2 : 1) + ' s';
    return (n / 60000).toFixed(1) + ' min';
  }
  function toDate(v) {
    if (v === null || v === undefined || v === '') return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function fmtRelative(v, now) {
    const d = toDate(v);
    if (!d) return '–';
    const ref = now === undefined ? Date.now() : now;
    let diff = (ref - d.getTime()) / 1000;
    const future = diff < 0;
    diff = Math.abs(diff);
    let s;
    if (diff < 45) return 'just now';
    else if (diff < 3600) s = Math.round(diff / 60) + 'm';
    else if (diff < 86400) s = Math.round(diff / 3600) + 'h';
    else if (diff < 86400 * 30) s = Math.round(diff / 86400) + 'd';
    else if (diff < 86400 * 365) s = Math.round(diff / (86400 * 30)) + 'mo';
    else s = (diff / (86400 * 365)).toFixed(1).replace(/\.0$/, '') + 'y';
    return future ? 'in ' + s : s + ' ago';
  }
  function dtf(opts) {
    try {
      return new Intl.DateTimeFormat(undefined, Object.assign({ timeZone: state.tz }, opts));
    } catch {
      return new Intl.DateTimeFormat(undefined, opts);
    }
  }
  function fmtDateTime(v) {
    const d = toDate(v);
    if (!d) return '–';
    return dtf({ year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
  }
  function fmtDate(v) {
    const d = toDate(v);
    if (!d) return '–';
    return dtf({ year: 'numeric', month: 'short', day: '2-digit' }).format(d);
  }
  function fmtTime(v) {
    const d = toDate(v);
    if (!d) return '–';
    return dtf({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
  }

  /* ---- day keys ('YYYY-MM-DD') ------------------------------------------ */

  function localYmd(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function dayKey(v) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(v)) return v.slice(0, 10);
    const d = toDate(v);
    return d ? localYmd(d) : null;
  }
  function todayKey() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: state.tz, year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date());
      const get = (t) => parts.find((p) => p.type === t).value;
      return get('year') + '-' + get('month') + '-' + get('day');
    } catch {
      return localYmd(new Date());
    }
  }
  function ymdAddDays(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
    return x.getUTCFullYear() + '-' + pad2(x.getUTCMonth() + 1) + '-' + pad2(x.getUTCDate());
  }
  function dayRange(count, endKey) {
    const out = [];
    for (let i = count - 1; i >= 0; i--) out.push(ymdAddDays(endKey, -i));
    return out;
  }
  /** Whole days from key a to key b (positive when b is later). */
  function ymdDiff(a, b) {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  }
  function shortDay(ymd, withYear) {
    const [y, m, d] = ymd.split('-').map(Number);
    return MONTHS[m - 1] + ' ' + d + (withYear ? ', ' + y : '');
  }
  function dayLabels(keys) {
    const withYear = keys.length > 400 || (keys.length > 1 && keys[0].slice(0, 4) !== keys[keys.length - 1].slice(0, 4));
    return keys.map((k) => shortDay(k, withYear));
  }
  /**
   * Zero-fills a day series over the given keys. Rows before the first key or
   * after the last are dropped; rows for the same day are summed.
   */
  function fillSeries(rows, keys, fields) {
    const map = new Map();
    for (const r of rows || []) {
      const k = dayKey(r.day);
      if (!k) continue;
      let o = map.get(k);
      if (!o) {
        o = {};
        map.set(k, o);
      }
      for (const f of fields) o[f] = (o[f] || 0) + n0(r[f]);
    }
    return keys.map((k) => {
      const r = map.get(k) || {};
      const o = { day: k };
      for (const f of fields) o[f] = r[f] || 0;
      return o;
    });
  }
  function firstDayKey(rows) {
    let min = null;
    for (const r of rows || []) {
      const k = dayKey(r.day);
      if (k && (min === null || k < min)) min = k;
    }
    return min;
  }
  /** Keys for the last `days` days ending today, trimmed to the first day with data. */
  function windowKeys(days, rows) {
    const keys = dayRange(days + 1, todayKey());
    const first = firstDayKey(rows);
    if (!first) return keys;
    const idx = keys.findIndex((k) => k >= first);
    return idx > 0 ? keys.slice(idx) : keys;
  }

  function mean(values) {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }
  function stddev(values) {
    if (values.length < 2) return 0;
    const m = mean(values);
    return Math.sqrt(values.reduce((a, b) => a + (b - m) * (b - m), 0) / values.length);
  }
  function truncate(s, max) {
    const str = String(s);
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  /* ======================================================================
   *  Fetch
   * ====================================================================== */

  async function api(path, params) {
    const url = new URL(path, window.location.origin);
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
    let res;
    try {
      res = await fetch(url.toString(), { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    } catch (e) {
      throw new Error('Could not reach the dashboard server (' + (e && e.message ? e.message : 'network error') + ').', { cause: e });
    }
    let body;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (res.status === 401) {
      stopAutoRefresh();
      const err = new Error('Your dashboard session has expired. Run /usage dashboard in Discord for a fresh sign-in link.');
      err.unauthorized = true;
      throw err;
    }
    if (!res.ok) {
      throw new Error((body && body.error) || ('Request failed with HTTP ' + res.status));
    }
    return body;
  }

  /* ======================================================================
   *  DOM helpers
   * ====================================================================== */

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
        else if (k === 'value') el.value = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children) {
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) {
        append(el, c);
        continue;
      }
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }
  function $(id) {
    return document.getElementById(id);
  }
  function panel(title, ...children) {
    return h('section', { class: 'panel' }, title ? h('h2', { class: 'panel-title' }, title) : null, ...children);
  }
  function emptyState(msg) {
    return h('div', { class: 'empty' }, msg || 'Nothing recorded in this window yet.');
  }
  function mutedText(text) {
    return h('span', { class: 'muted' }, text);
  }
  function tile(label, value, delta, sub) {
    return h('div', { class: 'tile', title: typeof sub === 'string' ? sub : null },
      h('div', { class: 'label' }, label),
      h('div', { class: 'value' }, value),
      (delta || sub) ? h('div', { class: 'sub' }, delta, typeof sub === 'string' ? h('span', null, sub) : sub) : null);
  }
  /**
   * "vs prior window" marker: arrow, percentage, green when the move is good.
   * invert flips the sense for metrics where up is bad (errors, latency).
   */
  function delta(current, prior, opts) {
    const cur = num(current);
    const pri = num(prior);
    const invert = !!(opts && opts.invert);
    if (cur === null || pri === null) return h('span', { class: 'delta flat' }, '–');
    if (pri === 0) return h('span', { class: 'delta flat', title: 'no data in the prior window' }, cur > 0 ? 'new' : '–');
    const pct = (cur - pri) / pri * 100;
    if (Math.abs(pct) < 0.05) return h('span', { class: 'delta flat', title: 'prior: ' + fmtInt(pri) }, '0%');
    const up = pct > 0;
    const good = invert ? !up : up;
    return h('span', {
      class: 'delta ' + (up ? 'up' : 'down') + ' ' + (good ? 'good' : 'bad'),
      title: 'prior window: ' + fmtInt(pri)
    }, (up ? '▲ ' : '▼ ') + Math.abs(pct).toFixed(Math.abs(pct) >= 100 ? 0 : 1) + '%');
  }
  /** Percentage-point change of a ratio between windows. */
  function deltaRate(part, total, priorPart, priorTotal, opts) {
    const t = num(total);
    const pt = num(priorTotal);
    if (!t || !pt) return h('span', { class: 'delta flat' }, '–');
    const cur = n0(part) / t * 100;
    const pri = n0(priorPart) / pt * 100;
    const diff = cur - pri;
    const invert = !!(opts && opts.invert);
    if (Math.abs(diff) < 0.005) return h('span', { class: 'delta flat', title: 'prior: ' + pri.toFixed(2) + '%' }, '0 pp');
    const up = diff > 0;
    const good = invert ? !up : up;
    return h('span', {
      class: 'delta ' + (up ? 'up' : 'down') + ' ' + (good ? 'good' : 'bad'),
      title: 'prior window: ' + pri.toFixed(2) + '%'
    }, (up ? '▲ ' : '▼ ') + Math.abs(diff).toFixed(2) + ' pp');
  }
  function relativeCell(v) {
    const d = toDate(v);
    if (!d) return '–';
    return h('span', { title: fmtDateTime(d) }, fmtRelative(d));
  }
  function datetimeCell(v) {
    const d = toDate(v);
    if (!d) return '–';
    return h('span', { title: fmtRelative(d), class: 'nowrap' }, fmtDateTime(d));
  }
  function barCell(value, max, text, color) {
    const pct = max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
    return h('div', { class: 'bar-cell' },
      h('span', { class: 'bar ' + (color || ''), style: { width: Math.max(2, pct * 1.2) + 'px' } }),
      h('span', { class: 'num' }, text));
  }
  function outcomeCell(v) {
    if (!v) return '–';
    const s = String(v);
    return h('span', { class: 'outcome ' + s.replace(/[^a-z0-9_-]/gi, '') }, s);
  }
  /* ======================================================================
   *  Tables (sortable by clicking a header)
   * ====================================================================== */

  const tableSorts = new Map(); // table id -> { key, dir }

  /**
   * @param {object} opts
   * @param {string} opts.id stable id so the chosen sort survives refreshes
   * @param {Array<{key:string,label:string,type?:'string'|'number'|'ms'|'date'|'datetime',format?:Function,
   *                sortValue?:Function,className?:string,title?:string}>} opts.columns
   * @param {object[]} opts.rows
   * @param {{key:string,dir:'asc'|'desc'}} [opts.defaultSort]
   * @param {(row:object)=>void} [opts.onRowClick]
   * @param {(row:object)=>boolean} [opts.isSelected]
   * @param {string} [opts.emptyText]
   */
  function renderTable(opts) {
    const columns = opts.columns;
    const rows = opts.rows || [];
    const wrap = h('div', { class: 'table-wrap' });
    if (!rows.length) {
      wrap.appendChild(emptyState(opts.emptyText));
      return wrap;
    }
    let sort = tableSorts.get(opts.id) || opts.defaultSort || { key: columns[0].key, dir: 'asc' };
    if (!columns.some((c) => c.key === sort.key)) sort = { key: columns[0].key, dir: 'asc' };

    const isNumeric = (col) => col.type === 'number' || col.type === 'ms';

    function sortValue(row, col) {
      if (col.sortValue) return col.sortValue(row);
      const v = row[col.key];
      if (isNumeric(col)) return num(v);
      if (col.type === 'date' || col.type === 'datetime') {
        const d = toDate(v);
        return d ? d.getTime() : null;
      }
      return v === null || v === undefined ? null : String(v).toLowerCase();
    }
    function sortedRows() {
      const col = columns.find((c) => c.key === sort.key) || columns[0];
      const dir = sort.dir === 'asc' ? 1 : -1;
      return rows.slice().sort((a, b) => {
        const va = sortValue(a, col);
        const vb = sortValue(b, col);
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb)) * dir;
      });
    }
    function cellContent(row, col) {
      if (col.format) return col.format(row[col.key], row);
      const v = row[col.key];
      switch (col.type) {
        case 'number': return fmtInt(v);
        case 'ms': return fmtMs(v);
        case 'date': return relativeCell(v);
        case 'datetime': return datetimeCell(v);
        default: return v === null || v === undefined || v === '' ? '–' : String(v);
      }
    }

    const thead = h('thead');
    const tbody = h('tbody');

    function drawHead() {
      clear(thead);
      const tr = h('tr');
      for (const col of columns) {
        const active = sort.key === col.key;
        tr.appendChild(h('th', {
          class: [isNumeric(col) ? 'num' : '', active ? 'sorted ' + sort.dir : ''].join(' ').trim() || null,
          title: col.title || ('Sort by ' + col.label),
          onclick: () => {
            if (sort.key === col.key) sort = { key: col.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
            else sort = { key: col.key, dir: (col.type && col.type !== 'string') ? 'desc' : 'asc' };
            tableSorts.set(opts.id, sort);
            drawHead();
            drawBody();
          }
        }, col.label, h('span', { class: 'sort-ind' }, active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '')));
      }
      thead.appendChild(tr);
    }
    function drawBody() {
      clear(tbody);
      for (const row of sortedRows()) {
        const selected = opts.isSelected ? opts.isSelected(row) : false;
        const tr = h('tr', {
          class: [opts.onRowClick ? 'clickable' : '', selected ? 'selected' : ''].join(' ').trim() || null,
          onclick: opts.onRowClick ? () => opts.onRowClick(row) : null
        });
        for (const col of columns) {
          const td = h('td', { class: [isNumeric(col) ? 'num' : '', col.className || ''].join(' ').trim() || null });
          append(td, [cellContent(row, col)]);
          if (col.cellTitle) td.title = col.cellTitle(row);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }
    drawHead();
    drawBody();
    wrap.appendChild(h('table', { class: 'data' }, thead, tbody));
    return wrap;
  }

  /* ======================================================================
   *  Charts
   * ====================================================================== */

  const charts = new Map(); // canvas id -> Chart

  function destroyCharts() {
    for (const chart of charts.values()) {
      try { chart.destroy(); } catch { /* already gone */ }
    }
    charts.clear();
  }
  function chartBox(id, size) {
    return h('div', { class: 'chart-box' + (size ? ' ' + size : '') }, h('canvas', { id, role: 'img' }));
  }
  function makeChart(id, config) {
    if (typeof Chart === 'undefined') return null;
    const canvas = $(id);
    if (!canvas) return null;
    const prev = charts.get(id);
    if (prev) {
      try { prev.destroy(); } catch { /* ignore */ }
      charts.delete(id);
    }
    const chart = new Chart(canvas, config);
    charts.set(id, chart);
    return chart;
  }
  function setupChartDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = C.muted;
    Chart.defaults.borderColor = C.border;
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.plugins.tooltip.backgroundColor = '#2a2e3a';
    Chart.defaults.plugins.tooltip.borderColor = C.border;
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = C.text;
    Chart.defaults.plugins.tooltip.bodyColor = C.text;
    Chart.defaults.plugins.tooltip.padding = 8;
    if (reducedMotion) Chart.defaults.animation = false;
  }
  function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }
  function mergeOpts(base, extra) {
    const out = Object.assign({}, base);
    for (const [k, v] of Object.entries(extra || {})) {
      out[k] = isPlainObject(v) && isPlainObject(base[k]) ? mergeOpts(base[k], v) : v;
    }
    return out;
  }
  function baseOptions(extra) {
    const base = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { color: C.border, drawTicks: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 14 } },
        y: { beginAtZero: true, grid: { color: C.border }, ticks: { callback: (v) => fmtCompact(v), maxTicksLimit: 7 } }
      },
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed && ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed;
              return ' ' + ctx.dataset.label + ': ' + (typeof v === 'number' ? intFmt.format(Math.round(v * 100) / 100) : v);
            }
          }
        }
      }
    };
    return mergeOpts(base, extra);
  }
  function lineDataset(label, data, color, extra) {
    return Object.assign({
      label, data, borderColor: color, backgroundColor: color, tension: 0.25,
      pointRadius: data.length > 90 ? 0 : 2, pointHoverRadius: 4, borderWidth: 2, fill: false, spanGaps: false
    }, extra || {});
  }
  function barDataset(label, data, color, extra) {
    return Object.assign({ label, data, backgroundColor: color, borderWidth: 0, borderRadius: 2, maxBarThickness: 28 }, extra || {});
  }
  function msOptions(extra) {
    return baseOptions(mergeOpts({
      scales: { y: { ticks: { callback: (v) => fmtMs(v) } } },
      plugins: { tooltip: { callbacks: { label: (ctx) => ' ' + ctx.dataset.label + ': ' + fmtMs(ctx.parsed.y) } } }
    }, extra || {}));
  }

  /* ======================================================================
   *  Shell helpers used by tabs
   * ====================================================================== */

  function stale(seq) {
    return seq !== renderSeq;
  }
  function showBanner(message, kind) {
    const banner = $('banner');
    clear(banner);
    banner.className = 'banner' + (kind ? ' ' + kind : '');
    banner.appendChild(h('span', null, message));
    banner.appendChild(h('button', { class: 'btn small ghost close', type: 'button', onclick: hideBanner }, 'dismiss'));
  }
  function hideBanner() {
    const banner = $('banner');
    banner.className = 'banner hidden';
    clear(banner);
  }
  function pivotToEvents(filters) {
    state.eventFilters = Object.assign({}, EVENT_FILTER_DEFAULTS, filters || {});
    switchTab('events');
  }
  function windowLabel() {
    return state.days === 1 ? 'last 24 hours' : 'last ' + state.days + ' days';
  }

  /* ======================================================================
   *  Tab: Overview
   * ====================================================================== */

  async function renderOverview(root, seq) {
    const fetchDays = state.compare ? Math.min(MAX_DAYS, state.days * 2) : state.days;
    const [ov, daily] = await Promise.all([
      api('/api/usage/overview', { days: state.days }),
      api('/api/usage/daily', { days: fetchDays, tz: state.tz })
    ]);
    if (stale(seq)) return;
    clear(root);

    const o = ov.overview || {};
    const cmp = ov.comparison || {};
    const writer = ov.writer;
    const storage = ov.storage || {};

    // KPI tiles
    root.appendChild(h('div', { class: 'tiles' },
      tile('Events', fmtCompact(o.events), delta(cmp.events, cmp.prior_events), fmtInt(o.events) + ' in the ' + windowLabel()),
      tile('Commands', fmtCompact(o.command_events), delta(cmp.command_events, cmp.prior_command_events),
        fmtInt(o.commands) + ' distinct'),
      tile('Unique users', fmtCompact(o.users), delta(cmp.users, cmp.prior_users)),
      tile('DAU / WAU / MAU', fmtInt(o.dau) + ' / ' + fmtInt(o.wau) + ' / ' + fmtInt(o.mau), null,
        'rolling 1 / 7 / 30 days, independent of the window'),
      tile('Servers', fmtInt(o.guilds), delta(cmp.guilds, cmp.prior_guilds)),
      tile('Error rate', fmtPct(o.errors, o.events, 2), deltaRate(cmp.errors, cmp.events, cmp.prior_errors, cmp.prior_events, { invert: true }),
        fmtInt(o.errors) + ' errors'),
      tile('p50 latency', fmtMs(o.p50_ms), null, 'slash commands only; avg ' + fmtMs(o.avg_ms)),
      tile('p95 latency', fmtMs(o.p95_ms), delta(cmp.p95_ms, cmp.prior_p95_ms, { invert: true })),
      tile('DM share', fmtPct(o.dm_events, o.events), null, fmtInt(o.dm_events) + ' events in DMs'),
      tile('Lifetime events', fmtCompact(o.lifetimeEvents), null, fmtInt(o.lifetimeEvents) + ' rows recorded'),
      tile('Tracking since', o.trackingSince ? fmtDate(o.trackingSince) : '–', null,
        o.trackingSince ? fmtRelative(o.trackingSince) : 'no events yet'),
      tile('Disk size', storage.total_size || '–', null, fmtInt(storage.rows) + ' rows on disk')
    ));

    // Writer health and busiest day
    const dropped = writer ? n0(writer.dropped) : 0;
    const chipClass = !writer ? '' : dropped > 0 ? 'bad' : 'ok';
    const chipText = !writer
      ? 'Writer: not attached'
      : 'Writer: ' + fmtInt(writer.buffered) + ' buffered · ' + fmtInt(writer.pendingAutocomplete) + ' searches pending · '
        + fmtInt(writer.dropped) + ' dropped';
    const busiest = o.busiest && o.busiest.day
      ? 'Busiest day: ' + shortDay(dayKey(o.busiest.day), true) + ' (' + fmtInt(o.busiest.events) + ' events)'
      : null;
    const mix = 'Mix: ' + fmtInt(o.command_events) + ' commands · ' + fmtInt(o.autocomplete_events) + ' searches · '
      + fmtInt(o.button_events) + ' buttons · ' + fmtInt(o.system_events) + ' system';
    root.appendChild(h('div', { class: 'row' },
      h('span', { class: 'chip ' + chipClass, title: 'Telemetry writer buffer. Dropped > 0 means events were lost because the database was down.' }, chipText),
      busiest ? mutedText(busiest) : null,
      mutedText(mix)));

    // Daily series
    const rows = daily.series || [];
    const latency = daily.latency || [];
    if (!rows.length) {
      root.appendChild(panel('Events per day', emptyState('No events in this window yet.')));
      return;
    }

    const N = state.days;
    let keys;
    let current;
    let prior = null;
    if (state.compare) {
      const allKeys = dayRange(2 * N + 1, todayKey());
      const filled = fillSeries(rows, allKeys, ['events', 'users', 'errors']);
      const first = firstDayKey(rows);
      const f = first ? Math.max(0, allKeys.findIndex((k) => k >= first)) : 0;
      const cut = Math.max(0, f - N);
      current = filled.slice(N + cut);
      prior = filled.slice(cut, N + 1);
      keys = current.map((r) => r.day);
    } else {
      keys = windowKeys(N, rows);
      current = fillSeries(rows, keys, ['events', 'users', 'errors']);
    }
    const labels = dayLabels(keys);

    const compareBox = h('label', { class: 'control toggle', title: 'Overlay the previous period of the same length as a dashed line' },
      h('input', {
        type: 'checkbox', checked: state.compare, onchange: (ev) => {
          state.compare = !!ev.target.checked;
          saveState();
          refresh();
        }
      }), h('span', null, 'compare previous period'));

    root.appendChild(h('div', { class: 'grid-2' },
      panel(h('span', null, 'Events per day', h('span', { class: 'spacer' }), compareBox), chartBox('ov-events')),
      panel('Distinct users per day', chartBox('ov-users'))));
    root.appendChild(panel('Command latency per day (p50 / p95)', chartBox('ov-latency', 'short')));

    const eventDatasets = [
      lineDataset('Events', current.map((r) => r.events), C.accent, { order: 1 }),
      barDataset('Errors', current.map((r) => r.errors), C.red, { type: 'bar', order: 2 })
    ];
    const userDatasets = [lineDataset('Users', current.map((r) => r.users), C.blue)];
    if (prior) {
      eventDatasets.splice(1, 0, lineDataset('Events (previous period)', prior.map((r) => r.events), C.muted,
        { borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5, order: 1 }));
      userDatasets.push(lineDataset('Users (previous period)', prior.map((r) => r.users), C.muted,
        { borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 }));
    }
    makeChart('ov-events', { type: 'line', data: { labels, datasets: eventDatasets }, options: baseOptions() });
    makeChart('ov-users', { type: 'line', data: { labels, datasets: userDatasets }, options: baseOptions() });

    const latFilled = fillSeries(latency, keys, ['p50_ms', 'p95_ms', 'samples']);
    makeChart('ov-latency', {
      type: 'line',
      data: {
        labels,
        datasets: [
          lineDataset('p50', latFilled.map((r) => (r.samples ? r.p50_ms : null)), C.green),
          lineDataset('p95', latFilled.map((r) => (r.samples ? r.p95_ms : null)), C.amber)
        ]
      },
      options: msOptions()
    });
  }

  /* ======================================================================
   *  Tab: Commands
   * ====================================================================== */

  async function renderCommands(root, seq) {
    const data = await api('/api/usage/commands', { days: state.days, limit: 500, searches: state.includeSearches ? '1' : '0' });
    if (stale(seq)) return;
    clear(root);
    const rows = data.commands || [];

    const tableHost = h('div');
    const detailHost = h('div', { class: 'panel detail-panel' });

    const searchInput = h('input', {
      type: 'search', placeholder: 'filter commands…', list: 'command-list', value: state.commandFilter,
      oninput: (ev) => {
        state.commandFilter = ev.target.value;
        drawTable();
      }
    });
    const datalist = h('datalist', { id: 'command-list' }, (state.meta.commands || []).map((c) => h('option', { value: c })));
    const searchesBox = h('label', { class: 'control toggle', title: 'Count autocomplete searches and button presses as uses' },
      h('input', {
        type: 'checkbox', checked: state.includeSearches, onchange: (ev) => {
          state.includeSearches = !!ev.target.checked;
          saveState();
          refresh();
        }
      }), h('span', null, 'include searches'));

    function drawTable() {
      clear(tableHost);
      const filter = state.commandFilter.trim().toLowerCase();
      const shown = filter ? rows.filter((r) => String(r.name || '').toLowerCase().includes(filter)) : rows;
      tableHost.appendChild(renderTable({
        id: 'commands',
        rows: shown,
        defaultSort: { key: 'uses', dir: 'desc' },
        emptyText: rows.length ? 'No command matches that filter.' : 'No commands recorded in this window yet.',
        isSelected: (r) => state.selectedCommand && String(r.name).split(/\s+/)[0] === state.selectedCommand,
        onRowClick: (r) => {
          state.selectedCommand = String(r.name).split(/\s+/)[0];
          drawTable();
          loadCommandDetail(detailHost, state.selectedCommand);
        },
        columns: [
          { key: 'name', label: 'Command', format: (v) => '/' + v },
          { key: 'uses', label: 'Uses', type: 'number' },
          { key: 'users', label: 'Users', type: 'number' },
          { key: 'guilds', label: 'Servers', type: 'number' },
          { key: 'avg_ms', label: 'Avg', type: 'ms' },
          { key: 'errors', label: 'Errors', type: 'number' },
          { key: 'err_rate', label: 'Err %', type: 'number', sortValue: (r) => (n0(r.uses) ? n0(r.errors) / n0(r.uses) : null),
            format: (v, r) => fmtPct(r.errors, r.uses) },
          { key: 'last_used', label: 'Last used', type: 'date' }
        ]
      }));
    }
    drawTable();

    root.appendChild(h('div', { class: 'split' },
      panel(h('span', null, 'Commands', h('span', { class: 'spacer' }),
        h('span', { class: 'search' }, searchInput, datalist), searchesBox),
      h('p', { class: 'panel-sub' }, 'Click a row for its subcommand split, option coverage and top values. Subcommands are folded into the name.'),
      tableHost),
      detailHost));

    if (state.selectedCommand) loadCommandDetail(detailHost, state.selectedCommand);
    else {
      clear(detailHost);
      detailHost.appendChild(h('h3', null, 'Command detail'));
      detailHost.appendChild(emptyState('Select a command to see how it is used.'));
    }
  }

  async function loadCommandDetail(host, name) {
    const mySeq = renderSeq;
    clear(host);
    host.appendChild(h('h3', null, '/' + name));
    host.appendChild(h('p', { class: 'muted' }, 'Loading…'));
    let d;
    try {
      d = await api('/api/usage/command/' + encodeURIComponent(name), { days: state.days, limit: 100 });
    } catch (err) {
      if (stale(mySeq)) return;
      clear(host);
      host.appendChild(h('h3', null, '/' + name));
      host.appendChild(h('div', { class: 'banner' }, err.message));
      return;
    }
    if (stale(mySeq)) return;
    clear(host);
    host.appendChild(h('h3', null, '/' + name, ' ', mutedText(windowLabel())));

    const subs = d.subcommands || [];
    const coverage = d.coverage || [];
    const values = d.values || [];

    host.appendChild(h('h2', { class: 'panel-title' }, 'Subcommand split'));
    if (!subs.length) host.appendChild(emptyState('No runs of this command in the window.'));
    else host.appendChild(chartBox('cmd-subs', 'short'));

    host.appendChild(h('h2', { class: 'panel-title', style: { marginTop: '14px' } }, 'Option coverage'));
    if (!coverage.length) host.appendChild(emptyState('No options supplied (or the command takes none).'));
    else host.appendChild(chartBox('cmd-cov', coverage.length > 6 ? '' : 'short'));

    host.appendChild(h('h2', { class: 'panel-title', style: { marginTop: '14px' } }, 'Top values'));
    host.appendChild(renderTable({
      id: 'cmd-values',
      rows: values,
      defaultSort: { key: 'uses', dir: 'desc' },
      emptyText: 'No parameter values recorded.',
      columns: [
        { key: 'option', label: 'Option' },
        { key: 'value', label: 'Value', className: 'wrap', format: (v) => truncate(v === null || v === undefined ? '(none)' : v, 80),
          cellTitle: (r) => String(r.value) },
        { key: 'uses', label: 'Uses', type: 'number' },
        { key: 'users', label: 'Users', type: 'number' }
      ]
    }));

    if (subs.length) {
      makeChart('cmd-subs', {
        type: 'doughnut',
        data: {
          labels: subs.map((s) => s.subcommand),
          datasets: [{ data: subs.map((s) => n0(s.uses)), backgroundColor: subs.map((s, i) => SERIES[i % SERIES.length]), borderColor: C.panel, borderWidth: 2 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '60%',
          plugins: {
            legend: { position: 'right' },
            tooltip: { callbacks: { label: (ctx) => ' ' + ctx.label + ': ' + fmtInt(ctx.parsed) + ' (' + fmtInt(subs[ctx.dataIndex].users) + ' users)' } }
          }
        }
      });
    }
    if (coverage.length) {
      const total = n0(coverage[0].total_invocations);
      makeChart('cmd-cov', {
        type: 'bar',
        data: {
          labels: coverage.map((c) => c.option),
          datasets: [barDataset('% of runs supplying the option', coverage.map((c) => (total ? n0(c.supplied) / total * 100 : 0)), C.blue)]
        },
        options: baseOptions({
          indexAxis: 'y',
          scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } }, y: { grid: { display: false } } },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ' ' + fmtPctValue(ctx.parsed.x) + ' (' + fmtInt(coverage[ctx.dataIndex].supplied) + ' of ' + fmtInt(total) + ' runs)' } }
          }
        })
      });
    }
  }

  /* ======================================================================
   *  Tab: Users & Servers
   * ====================================================================== */

  async function renderUsers(root, seq) {
    const [u, g] = await Promise.all([
      api('/api/usage/users', { days: state.days, limit: 500 }),
      api('/api/usage/guilds', { days: state.days, limit: 500 })
    ]);
    if (stale(seq)) return;
    clear(root);

    root.appendChild(panel('Users',
      h('p', { class: 'panel-sub' }, 'Click a user to see their raw events.'),
      renderTable({
        id: 'users',
        rows: u.users || [],
        defaultSort: { key: 'events', dir: 'desc' },
        emptyText: 'No user activity in this window.',
        onRowClick: (r) => pivotToEvents({ user: r.user_id }),
        columns: [
          { key: 'username', label: 'User', format: (v) => v || '(unknown)' },
          { key: 'user_id', label: 'ID', className: 'mono' },
          { key: 'events', label: 'Events', type: 'number' },
          { key: 'active_days', label: 'Active days', type: 'number' },
          { key: 'distinct_commands', label: 'Commands', type: 'number' },
          { key: 'favorite_command', label: 'Favorite', format: (v) => (v ? '/' + v : '–') },
          { key: 'first_seen', label: 'First seen', type: 'date' },
          { key: 'last_seen', label: 'Last seen', type: 'date' }
        ]
      })));

    root.appendChild(panel('Servers',
      h('p', { class: 'panel-sub' }, 'DM traffic has no server and is shown as a share on the Overview tab.'),
      renderTable({
        id: 'guilds',
        rows: g.guilds || [],
        defaultSort: { key: 'events', dir: 'desc' },
        emptyText: 'No server activity in this window.',
        onRowClick: (r) => pivotToEvents({ guild: r.guild_id }),
        columns: [
          { key: 'guild_name', label: 'Server', format: (v) => v || '(unknown)' },
          { key: 'guild_id', label: 'ID', className: 'mono' },
          { key: 'events', label: 'Events', type: 'number' },
          { key: 'users', label: 'Users', type: 'number' },
          { key: 'favorite_command', label: 'Favorite', format: (v) => (v ? '/' + v : '–') },
          { key: 'last_used', label: 'Last used', type: 'date' }
        ]
      })));
  }

  /* ======================================================================
   *  Tab: Coins
   * ====================================================================== */

  async function renderCoins(root, seq) {
    const [c, m] = await Promise.all([
      api('/api/usage/coins', { days: state.days, limit: 500 }),
      api('/api/usage/momentum', { days: state.days, limit: 500 })
    ]);
    if (stale(seq)) return;
    clear(root);

    const coins = c.coins || [];
    const momentum = (m.momentum || []).map((r) => {
      const cur = n0(r.current_requests);
      const pri = n0(r.prior_requests);
      return {
        coin: r.coin, via_command: r.via_command,
        current_requests: cur, prior_requests: pri,
        current_users: n0(r.current_users), prior_users: n0(r.prior_users),
        delta: cur - pri,
        pct: pri >= 3 ? (cur - pri) / pri * 100 : null
      };
    });
    const risers = momentum.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 15);
    const fallers = momentum.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 15);
    const newCoins = m.newCoins || [];

    const top = coins.slice().sort((a, b) => n0(b.requests) - n0(a.requests)).slice(0, 25);
    root.appendChild(panel('Top coins',
      coins.length ? chartBox('coins-top') : emptyState('No coin requests in this window.'),
      h('p', { class: 'panel-sub', style: { marginTop: '10px' } }, 'Click a coin to see the events that named it.'),
      renderTable({
        id: 'coins',
        rows: coins,
        defaultSort: { key: 'requests', dir: 'desc' },
        emptyText: 'No coin requests in this window.',
        onRowClick: (r) => pivotToEvents({ coin: r.coin }),
        columns: [
          { key: 'coin', label: 'Coin' },
          { key: 'requests', label: 'Requests', type: 'number' },
          { key: 'users', label: 'Users', type: 'number' },
          { key: 'via_command', label: 'Mostly via', format: (v) => (v ? '/' + v : '–') }
        ]
      })));

    const momentumColumns = [
      { key: 'coin', label: 'Coin' },
      { key: 'current_requests', label: 'Now', type: 'number' },
      { key: 'prior_requests', label: 'Before', type: 'number' },
      { key: 'delta', label: 'Δ', type: 'number', format: (v) => h('span', { class: v > 0 ? 'good' : v < 0 ? 'bad' : '' }, (v > 0 ? '+' : '') + fmtInt(v)) },
      { key: 'pct', label: '%', type: 'number', format: (v) => (v === null ? mutedText('n/a') : h('span', { class: v > 0 ? 'good' : 'bad' }, (v > 0 ? '+' : '') + v.toFixed(0) + '%')),
        title: 'Shown only when the prior window had at least 3 requests' },
      { key: 'current_users', label: 'Users now', type: 'number' },
      { key: 'prior_users', label: 'Users before', type: 'number' },
      { key: 'via_command', label: 'Via', format: (v) => (v ? '/' + v : '–') }
    ];
    root.appendChild(h('div', { class: 'grid-2' },
      panel('Risers (vs the previous ' + state.days + ' days)', renderTable({
        id: 'risers', rows: risers, defaultSort: { key: 'delta', dir: 'desc' }, columns: momentumColumns,
        emptyText: 'No coin gained requests against the previous window.',
        onRowClick: (r) => pivotToEvents({ coin: r.coin })
      })),
      panel('Fallers', renderTable({
        id: 'fallers', rows: fallers, defaultSort: { key: 'delta', dir: 'asc' }, columns: momentumColumns,
        emptyText: 'No coin lost requests against the previous window.',
        onRowClick: (r) => pivotToEvents({ coin: r.coin })
      }))));

    root.appendChild(panel('New coins (first ever request inside the window)', renderTable({
      id: 'new-coins',
      rows: newCoins,
      defaultSort: { key: 'requests', dir: 'desc' },
      emptyText: 'No coin was requested for the first time in this window.',
      onRowClick: (r) => pivotToEvents({ coin: r.coin }),
      columns: [
        { key: 'coin', label: 'Coin' },
        { key: 'first_seen', label: 'First seen', type: 'date' },
        { key: 'requests', label: 'Requests', type: 'number' },
        { key: 'users', label: 'Users', type: 'number' },
        { key: 'via_command', label: 'Via', format: (v) => (v ? '/' + v : '–') }
      ]
    })));

    if (coins.length) {
      makeChart('coins-top', {
        type: 'bar',
        data: {
          labels: top.map((r) => r.coin),
          datasets: [
            barDataset('Requests', top.map((r) => n0(r.requests)), C.accent),
            barDataset('Users', top.map((r) => n0(r.users)), C.blue)
          ]
        },
        options: baseOptions({ scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 30 } } } })
      });
    }
  }

  /* ======================================================================
   *  Tab: Features (what users have SET UP, not just what they did)
   * ====================================================================== */

  /** 30 -> "30m", 60 -> "1h", 720 -> "12h", 1440 -> "daily", 2880 -> "2d". */
  function fmtInterval(minutes) {
    const m = num(minutes);
    if (m === null || m <= 0) return '–';
    if (m % 1440 === 0) return m === 1440 ? 'daily' : (m / 1440) + 'd';
    if (m % 60 === 0) return (m / 60) + 'h';
    return m + 'm';
  }
  /** part / total to one decimal, or a dash when there is nothing to divide by. */
  function fmtAvg(part, total) {
    const t = num(total);
    return t ? (n0(part) / t).toFixed(1) : '–';
  }
  function stat(label, value, opts) {
    const o = opts || {};
    return h('div', { class: 'stat', title: o.title || null },
      h('div', { class: 'stat-value' + (o.tone ? ' ' + o.tone : '') }, value),
      h('div', { class: 'stat-label' }, label));
  }
  /** "3 failed" in the tone colour when > 0, plain muted otherwise. */
  function toned(count, label, tone) {
    const v = n0(count);
    return h('span', { class: v > 0 ? tone : null }, fmtInt(v) + ' ' + label);
  }
  function featureGroup(title, stats, activity) {
    return h('section', { class: 'panel feature-group' },
      h('h2', { class: 'panel-title' }, title),
      h('div', { class: 'stat-grid' }, stats),
      h('div', { class: 'feature-activity muted' }, activity));
  }

  async function renderFeatures(root, seq) {
    const d = await api('/api/usage/features', { days: state.days, limit: 20 });
    if (stale(seq)) return;
    clear(root);

    const inv = d.inventory || {};
    const al = inv.alerts || {};
    const pf = inv.portfolios || {};
    const sc = inv.schedules || {};
    const wl = inv.watchlists || {};
    const alertCoins = inv.alertCoins || [];
    const portfolioCoins = inv.portfolioCoins || [];
    const scheduleCommands = inv.scheduleCommands || [];
    const scheduleIntervals = inv.scheduleIntervals || [];
    const watchlistCoins = inv.watchlistCoins || [];
    const act = d.activity || {};
    const snapshots = d.snapshots || [];
    const win = 'In the ' + windowLabel() + ': ';
    const sep = ' · ';

    // 1. Standing state per feature, with the window's activity beneath.
    root.appendChild(h('div', { class: 'feature-groups' },
      featureGroup('Price alerts', [
        stat('Active alerts', fmtInt(al.total)),
        stat('Users', fmtInt(al.users)),
        stat('Coins', fmtInt(al.coins)),
        stat('Above / below', fmtInt(al.above) + ' / ' + fmtInt(al.below)),
        stat('Expiring ≤ 7d', fmtInt(al.expiring_7d), { title: fmtInt(al.with_expiry) + ' alerts carry an expiry' })
      ], [
        h('div', null, win + fmtInt(act.alerts_created) + ' created' + sep + fmtInt(act.alerts_removed) + ' removed' + sep + fmtInt(act.alert_users) + ' users'),
        h('div', null, fmtInt(act.alerts_fired) + ' fired: ' + fmtInt(act.alerts_dm) + ' DM' + sep + fmtInt(act.alerts_channel) + ' channel' + sep,
          toned(act.alerts_failed, 'failed', 'bad')),
        al.newest ? h('div', null, 'Newest alert ' + fmtRelative(al.newest) + ', oldest ' + fmtRelative(al.oldest) + sep + 'max ' + fmtInt(al.max_per_user) + ' per user') : null
      ]),
      featureGroup('Portfolios', [
        stat('Users', fmtInt(pf.users)),
        stat('Holdings', fmtInt(pf.holdings)),
        stat('Coins', fmtInt(pf.coins)),
        stat('Avg / user', fmtAvg(pf.holdings, pf.users)),
        stat('Max / user', fmtInt(pf.max_holdings))
      ], [
        h('div', null, win + fmtInt(act.portfolio_sets) + ' sets' + sep + fmtInt(act.portfolio_uses) + ' uses by ' + fmtInt(act.portfolio_users) + ' users')
      ]),
      featureGroup('Scheduled posts', [
        stat('Jobs', fmtInt(sc.jobs)),
        stat('Servers', fmtInt(sc.guilds)),
        stat('Creators', fmtInt(sc.users)),
        stat('Never run', fmtInt(sc.never_run)),
        stat('Stale', fmtInt(sc.stale), { tone: n0(sc.stale) > 0 ? 'warn' : null, title: 'Not run within twice its interval' })
      ], [
        h('div', null, win + fmtInt(act.schedules_created) + ' created' + sep + fmtInt(act.schedules_deleted) + ' deleted'),
        h('div', null, fmtInt(act.posts_run) + ' posts run' + sep, toned(act.posts_failed, 'failed', 'bad')),
        sc.latest_run ? h('div', null, 'Last post ran ' + fmtRelative(sc.latest_run)) : null
      ]),
      featureGroup('Watchlists', [
        stat('Users', fmtInt(wl.users)),
        stat('Entries', fmtInt(wl.entries)),
        stat('Coins', fmtInt(wl.coins)),
        stat('Avg size', fmtAvg(wl.entries, wl.users)),
        stat('Max size', fmtInt(wl.max_size))
      ], [
        h('div', null, win + fmtInt(act.watchlist_uses) + ' uses by ' + fmtInt(act.watchlist_users) + ' users')
      ])));

    // 2. Standing state over time, from the daily snapshots.
    const snapKeys = snapshots.map((r) => dayKey(r.day)).filter(Boolean).sort();
    if (snapKeys.length < 2) {
      const note = snapKeys.length === 0
        ? 'No snapshots yet. The trend appears after the first daily snapshot.'
        : 'One snapshot so far (taken ' + fmtRelative(snapshots[0].taken_at) + '). The trend appears after the next daily snapshot.';
      root.appendChild(panel('Standing state over time', emptyState(note)));
    } else {
      root.appendChild(h('div', { class: 'grid-2' },
        panel('Standing state over time', chartBox('feat-trend')),
        panel('Holdings and watchlist entries over time', chartBox('feat-sizes'))));
    }

    // 3. What is set up, by coin / command / interval.
    const coinPivot = (key) => (r) => pivotToEvents({ coin: r[key] });
    const clickNote = h('p', { class: 'panel-sub', style: { marginTop: '10px' } }, 'Click a coin to see the events that named it.');
    root.appendChild(h('div', { class: 'grid-2' },
      panel('Alerts by coin',
        alertCoins.length ? chartBox('feat-alerts', 'short') : null,
        alertCoins.length ? clickNote.cloneNode(true) : null,
        renderTable({
          id: 'feat-alert-coins',
          rows: alertCoins,
          defaultSort: { key: 'alerts', dir: 'desc' },
          emptyText: 'No price alerts are set up yet.',
          onRowClick: coinPivot('symbol'),
          columns: [
            { key: 'symbol', label: 'Coin' },
            { key: 'alerts', label: 'Alerts', type: 'number' },
            { key: 'users', label: 'Users', type: 'number' },
            { key: 'above', label: 'Above', type: 'number' },
            { key: 'below', label: 'Below', type: 'number' }
          ]
        })),
      panel('Most held coins',
        portfolioCoins.length ? chartBox('feat-held', 'short') : null,
        portfolioCoins.length ? clickNote.cloneNode(true) : null,
        renderTable({
          id: 'feat-held-coins',
          rows: portfolioCoins,
          defaultSort: { key: 'holders', dir: 'desc' },
          emptyText: 'No portfolio holdings are set up yet.',
          onRowClick: coinPivot('symbol'),
          columns: [
            { key: 'symbol', label: 'Coin' },
            { key: 'holders', label: 'Holders', type: 'number' },
            { key: 'share', label: 'Share of portfolio users', type: 'number', sortValue: (r) => n0(r.holders),
              format: (v, r) => barCell(n0(r.holders), n0(pf.users), fmtPct(r.holders, pf.users), 'green') }
          ]
        }))));
    root.appendChild(h('div', { class: 'grid-2' },
      panel('Scheduled posts by command',
        renderTable({
          id: 'feat-sched-cmds',
          rows: scheduleCommands,
          defaultSort: { key: 'jobs', dir: 'desc' },
          emptyText: 'No scheduled posts are set up yet.',
          columns: [
            { key: 'command', label: 'Command', format: (v) => (v ? '/' + v : '–') },
            { key: 'jobs', label: 'Jobs', type: 'number' },
            { key: 'guilds', label: 'Servers', type: 'number' }
          ]
        }),
        scheduleIntervals.length ? h('h2', { class: 'panel-title', style: { marginTop: '14px' } }, 'By interval') : null,
        scheduleIntervals.length ? chartBox('feat-intervals', 'short') : null),
      panel('Watchlist favourites',
        watchlistCoins.length ? chartBox('feat-watch', 'short') : null,
        watchlistCoins.length ? clickNote.cloneNode(true) : null,
        renderTable({
          id: 'feat-watch-coins',
          rows: watchlistCoins,
          defaultSort: { key: 'users', dir: 'desc' },
          emptyText: 'No watchlists are set up yet.',
          onRowClick: coinPivot('coin'),
          columns: [
            { key: 'coin', label: 'Coin' },
            { key: 'users', label: 'Watchlists', type: 'number' },
            { key: 'share', label: 'Share of watchlists', type: 'number', sortValue: (r) => n0(r.users),
              format: (v, r) => barCell(n0(r.users), n0(wl.users), fmtPct(r.users, wl.users)) }
          ]
        }))));

    // Charts. Counts are small integers here, so whole-number ticks only.
    const countAxis = { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 30 } }, y: { ticks: { precision: 0 } } } };
    const noLegend = mergeOpts(countAxis, { plugins: { legend: { display: false } } });

    if (snapKeys.length >= 2) {
      // One point per calendar day from the first snapshot to today (or the last
      // snapshot, if the database's day is ahead of the chosen timezone). Days
      // the daily job missed stay null and are bridged, never zero-filled: the
      // state did not drop to nothing, it just went unmeasured.
      const today = todayKey();
      const last = snapKeys[snapKeys.length - 1];
      const end = last > today ? last : today;
      const count = Math.min(MAX_DAYS + 1, Math.max(2, ymdDiff(snapKeys[0], end) + 1));
      const keys = dayRange(count, end);
      const byDay = new Map();
      for (const r of snapshots) {
        const k = dayKey(r.day);
        if (k) byDay.set(k, r);
      }
      const series = (field) => keys.map((k) => (byDay.has(k) ? n0(byDay.get(k)[field]) : null));
      const labels = dayLabels(keys);
      const gap = { spanGaps: true };
      makeChart('feat-trend', {
        type: 'line',
        data: {
          labels,
          datasets: [
            lineDataset('Alerts', series('alerts'), C.amber, gap),
            lineDataset('Portfolio users', series('portfolio_users'), C.green, gap),
            lineDataset('Scheduled posts', series('schedules'), C.blue, gap),
            lineDataset('Watchlists', series('watchlists'), C.accent, gap)
          ]
        },
        options: baseOptions(countAxis)
      });
      makeChart('feat-sizes', {
        type: 'line',
        data: {
          labels,
          datasets: [
            lineDataset('Holdings', series('holdings'), C.green, gap),
            lineDataset('Watchlist entries', series('watchlist_entries'), C.accent, gap)
          ]
        },
        options: baseOptions(countAxis)
      });
    }
    if (alertCoins.length) {
      makeChart('feat-alerts', {
        type: 'bar',
        data: {
          labels: alertCoins.map((r) => r.symbol),
          datasets: [
            barDataset('Above', alertCoins.map((r) => n0(r.above)), C.green),
            barDataset('Below', alertCoins.map((r) => n0(r.below)), C.red)
          ]
        },
        options: baseOptions(mergeOpts(countAxis, {
          scales: { x: { stacked: true }, y: { stacked: true } },
          plugins: { tooltip: { callbacks: { footer: (items) => (items.length ? fmtInt(alertCoins[items[0].dataIndex].users) + ' users' : '') } } }
        }))
      });
    }
    if (portfolioCoins.length) {
      makeChart('feat-held', {
        type: 'bar',
        data: { labels: portfolioCoins.map((r) => r.symbol), datasets: [barDataset('Holders', portfolioCoins.map((r) => n0(r.holders)), C.green)] },
        options: baseOptions(noLegend)
      });
    }
    if (scheduleIntervals.length) {
      makeChart('feat-intervals', {
        type: 'bar',
        data: { labels: scheduleIntervals.map((r) => fmtInterval(r.interval_minutes)), datasets: [barDataset('Jobs', scheduleIntervals.map((r) => n0(r.jobs)), C.blue)] },
        options: baseOptions(noLegend)
      });
    }
    if (watchlistCoins.length) {
      makeChart('feat-watch', {
        type: 'bar',
        data: { labels: watchlistCoins.map((r) => r.coin), datasets: [barDataset('Watchlists', watchlistCoins.map((r) => n0(r.users)), C.accent)] },
        options: baseOptions(noLegend)
      });
    }
  }

  /* ======================================================================
   *  Tab: Activity
   * ====================================================================== */

  async function renderActivity(root, seq) {
    const a = await api('/api/usage/activity', { days: state.days, tz: state.tz });
    if (stale(seq)) return;
    clear(root);

    const grid = a.grid || [];
    const hourly = a.hourly || [];
    const weekday = a.weekday || [];
    if (!grid.length && !hourly.length) {
      root.appendChild(panel('Activity', emptyState('No activity in this window yet.')));
      return;
    }

    const heatHost = h('div', { class: 'table-wrap' });
    const toggle = h('div', { class: 'row' },
      ['events', 'users'].map((metric) => h('button', {
        type: 'button', class: 'btn small' + (state.heatMetric === metric ? ' active' : ''),
        onclick: () => {
          state.heatMetric = metric;
          saveState();
          drawHeatmap();
          for (const b of toggle.querySelectorAll('button')) b.classList.toggle('active', b.dataset.metric === metric);
        },
        dataset: { metric }
      }, metric)));

    function drawHeatmap() {
      clear(heatHost);
      const metric = state.heatMetric;
      const cells = new Map();
      let max = 0;
      for (const r of grid) {
        const key = n0(r.weekday) * 24 + n0(r.hour);
        const v = { events: n0(r.events), users: n0(r.users) };
        cells.set(key, v);
        if (v[metric] > max) max = v[metric];
      }
      const hm = h('div', { class: 'heatmap', role: 'table', 'aria-label': 'Weekday by hour heatmap' });
      hm.appendChild(h('div'));
      for (let hr = 0; hr < 24; hr++) hm.appendChild(h('div', { class: 'hm-col' }, pad2(hr)));
      for (const wd of HEAT_ORDER) {
        hm.appendChild(h('div', { class: 'hm-label' }, WEEKDAYS[wd]));
        for (let hr = 0; hr < 24; hr++) {
          const v = cells.get(wd * 24 + hr) || { events: 0, users: 0 };
          const value = v[metric];
          const alpha = max > 0 && value > 0 ? 0.12 + 0.88 * (value / max) : 0;
          hm.appendChild(h('div', {
            class: 'hm-cell',
            style: alpha ? { background: 'rgba(' + ACCENT_RGB + ', ' + alpha.toFixed(3) + ')' } : null,
            title: WEEKDAYS[wd] + ' ' + pad2(hr) + ':00–' + pad2(hr) + ':59 · ' + fmtInt(v.events) + ' events · ' + fmtInt(v.users) + ' users',
            'aria-label': WEEKDAYS[wd] + ' ' + pad2(hr) + ':00 ' + fmtInt(value) + ' ' + metric
          }));
        }
      }
      heatHost.appendChild(hm);
      heatHost.appendChild(h('div', { class: 'heat-legend' }, h('span', null, '0'), h('span', { class: 'scale' }), h('span', null, fmtInt(max) + ' ' + metric),
        h('span', { style: { marginLeft: 'auto' } }, 'hours in ' + state.tz)));
    }
    drawHeatmap();

    root.appendChild(panel(h('span', null, 'When people use the bot', h('span', { class: 'spacer' }), toggle), heatHost));
    root.appendChild(h('div', { class: 'grid-2' },
      panel('Events by hour of day', chartBox('act-hour')),
      panel('Events by weekday', chartBox('act-weekday'))));
    root.appendChild(h('div', { class: 'grid-2' },
      panel('Distinct users by hour', chartBox('act-hour-users', 'short')),
      panel('Distinct users by weekday', chartBox('act-weekday-users', 'short'))));

    const hours = Array.from({ length: 24 }, () => ({ events: 0, users: 0 }));
    for (const r of hourly) {
      const i = n0(r.hour);
      if (i >= 0 && i < 24) hours[i] = { events: n0(r.events), users: n0(r.users) };
    }
    const days = HEAT_ORDER.map(() => ({ events: 0, users: 0 }));
    for (const r of weekday) {
      const i = HEAT_ORDER.indexOf(n0(r.weekday));
      if (i >= 0) days[i] = { events: n0(r.events), users: n0(r.users) };
    }
    const hourLabels = hours.map((_, i) => pad2(i) + ':00');
    const dayLabelsW = HEAT_ORDER.map((wd) => WEEKDAYS[wd]);
    const noGridX = { scales: { x: { grid: { display: false } } }, plugins: { legend: { display: false } } };
    makeChart('act-hour', { type: 'bar', data: { labels: hourLabels, datasets: [barDataset('Events', hours.map((x) => x.events), C.accent)] }, options: baseOptions(noGridX) });
    makeChart('act-weekday', { type: 'bar', data: { labels: dayLabelsW, datasets: [barDataset('Events', days.map((x) => x.events), C.accent)] }, options: baseOptions(noGridX) });
    makeChart('act-hour-users', { type: 'bar', data: { labels: hourLabels, datasets: [barDataset('Users', hours.map((x) => x.users), C.blue)] }, options: baseOptions(noGridX) });
    makeChart('act-weekday-users', { type: 'bar', data: { labels: dayLabelsW, datasets: [barDataset('Users', days.map((x) => x.users), C.blue)] }, options: baseOptions(noGridX) });
  }

  /* ======================================================================
   *  Tab: Errors
   * ====================================================================== */

  async function renderErrors(root, seq) {
    const e = await api('/api/usage/errors', { days: state.days, limit: 500, tz: state.tz });
    if (stale(seq)) return;
    clear(root);

    const errors = e.errors || [];
    const slowest = e.slowest || [];
    const latency = e.latency || [];

    root.appendChild(panel('Faults',
      h('p', { class: 'panel-sub' }, 'Grouped by command and classified error kind. Click a row to see the matching raw events.'),
      renderTable({
        id: 'errors',
        rows: errors,
        defaultSort: { key: 'occurrences', dir: 'desc' },
        emptyText: 'No errors in this window. Nice.',
        onRowClick: (r) => pivotToEvents({
          command: r.command || '',
          error_kind: r.error_kind && r.error_kind !== 'unknown' ? r.error_kind : '',
          outcome: 'error'
        }),
        columns: [
          { key: 'command', label: 'Command', format: (v) => (v ? '/' + v : '–') },
          { key: 'error_kind', label: 'Error kind', className: 'wrap' },
          { key: 'occurrences', label: 'Occurrences', type: 'number' },
          { key: 'users_affected', label: 'Users affected', type: 'number' },
          { key: 'last_seen', label: 'Last seen', type: 'date' }
        ]
      })));

    root.appendChild(h('div', { class: 'grid-2' },
      panel('Slowest commands (5+ samples)', renderTable({
        id: 'slowest',
        rows: slowest,
        defaultSort: { key: 'avg_ms', dir: 'desc' },
        emptyText: 'Not enough timed samples yet.',
        columns: [
          { key: 'command', label: 'Command', format: (v) => (v ? '/' + v : '–') },
          { key: 'samples', label: 'Samples', type: 'number' },
          { key: 'avg_ms', label: 'Avg', type: 'ms' },
          { key: 'p95_ms', label: 'p95', type: 'ms' },
          { key: 'max_ms', label: 'Max', type: 'ms' }
        ]
      })),
      panel('Command latency per day', latency.length ? chartBox('err-latency') : emptyState('No timed commands in this window.'))));

    if (latency.length) {
      const keys = windowKeys(state.days, latency);
      const filled = fillSeries(latency, keys, ['p50_ms', 'p95_ms', 'samples']);
      makeChart('err-latency', {
        type: 'line',
        data: {
          labels: dayLabels(keys),
          datasets: [
            lineDataset('p50', filled.map((r) => (r.samples ? r.p50_ms : null)), C.green),
            lineDataset('p95', filled.map((r) => (r.samples ? r.p95_ms : null)), C.amber)
          ]
        },
        options: msOptions()
      });
    }
  }

  /* ======================================================================
   *  Tab: Growth
   * ====================================================================== */

  async function renderGrowth(root, seq) {
    const g = await api('/api/usage/growth', { days: state.days, tz: state.tz });
    if (stale(seq)) return;
    clear(root);

    const growth = g.growth || [];
    const retention = g.retention || [];
    const churn = g.churn || {};

    const active = n0(churn.active);
    const retained = n0(churn.retained);
    const churned = n0(churn.churned);
    const resurrected = n0(churn.resurrected);
    const priorActive = retained + churned;
    root.appendChild(h('div', { class: 'tiles' },
      tile('Active users', fmtInt(active), null, 'in the ' + windowLabel()),
      tile('Retained', fmtInt(retained), null, priorActive ? fmtPct(retained, priorActive) + ' of the previous window’s users came back' : 'active in both windows'),
      tile('Churned', fmtInt(churned), null, priorActive ? fmtPct(churned, priorActive) + ' of the previous window’s users did not return' : 'active before, absent now'),
      tile('Resurrected', fmtInt(resurrected), null, 'back after skipping the previous window'),
      tile('New this window', fmtInt(growth.reduce((s, r) => s + n0(r.new_users), 0)), null, 'first ever event inside the window')
    ));

    root.appendChild(h('div', { class: 'grid-2' },
      panel('New vs returning users per day', growth.length ? chartBox('growth-daily') : emptyState('No activity in this window yet.')),
      panel('Retention: days active per user', retention.length ? chartBox('growth-retention') : emptyState('No users in this window yet.'))));

    if (growth.length) {
      const keys = windowKeys(state.days, growth);
      const filled = fillSeries(growth, keys, ['new_users', 'returning_users', 'active_users']);
      makeChart('growth-daily', {
        type: 'bar',
        data: {
          labels: dayLabels(keys),
          datasets: [
            barDataset('New', filled.map((r) => r.new_users), C.green),
            barDataset('Returning', filled.map((r) => r.returning_users), C.accent)
          ]
        },
        options: baseOptions({ scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true } } })
      });
    }
    if (retention.length) {
      const sorted = retention.slice().sort((a, b) => n0(a.sort_key) - n0(b.sort_key));
      const totalUsers = sorted.reduce((s, r) => s + n0(r.users), 0);
      makeChart('growth-retention', {
        type: 'bar',
        data: { labels: sorted.map((r) => r.bucket), datasets: [barDataset('Users', sorted.map((r) => n0(r.users)), C.blue)] },
        options: baseOptions({
          scales: { x: { grid: { display: false } } },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ' ' + fmtInt(ctx.parsed.y) + ' users (' + fmtPct(ctx.parsed.y, totalUsers) + ')' } }
          }
        })
      });
    }
  }

  /* ======================================================================
   *  Tab: Credits
   * ====================================================================== */

  async function renderCredits(root, seq) {
    const d = await api('/api/usage/credits', { days: state.days, tz: state.tz });
    if (stale(seq)) return;
    clear(root);

    const budget = n0(d.budget) || n0(state.meta.budget) || 10000;
    const totals = d.totals || {};
    const cmp = d.comparison || {};
    const byEndpoint = d.byEndpoint || [];
    const monthToDate = d.monthToDate || [];
    const byDayEndpoint = d.byDayEndpoint || [];

    // Month geometry, in the selected timezone.
    const today = todayKey();
    const [y, mo, dom] = today.split('-').map(Number);
    const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const dailyCredits = new Array(dim).fill(0);
    for (const r of monthToDate) {
      const k = dayKey(r.day);
      if (!k) continue;
      const [ry, rm, rd] = k.split('-').map(Number);
      if (ry === y && rm === mo && rd >= 1 && rd <= dim) dailyCredits[rd - 1] += n0(r.credits);
    }
    const cumulative = [];
    let spent = 0;
    for (let i = 0; i < dim; i++) {
      if (i < dom) {
        spent += dailyCredits[i];
        cumulative.push(spent);
      } else cumulative.push(null);
    }
    const monthSpent = n0(cmp.month_to_date) || n0(totals.calls_month) || spent;
    const remainingDays = dim - dom;
    let trailing = dailyCredits.slice(Math.max(0, dom - 8), Math.max(0, dom - 1));
    if (!trailing.length) trailing = [dailyCredits[dom - 1]];
    const rate = mean(trailing);
    const sd = stddev(trailing);
    const projectedEnd = spent + rate * remainingDays;
    const projection = [];
    const upper = [];
    const lower = [];
    for (let i = 0; i < dim; i++) {
      const k = i - (dom - 1);
      if (k < 0) {
        projection.push(null);
        upper.push(null);
        lower.push(null);
      } else {
        projection.push(spent + rate * k);
        upper.push(spent + (rate + sd) * k);
        lower.push(spent + Math.max(0, rate - sd) * k);
      }
    }
    let runsOutDay = null;
    for (let i = dom - 1; i < dim; i++) {
      if (projection[i] !== null && projection[i] > budget) {
        runsOutDay = i + 1;
        break;
      }
    }

    // Tiles
    const budgetPct = budget ? monthSpent / budget * 100 : null;
    root.appendChild(h('div', { class: 'tiles' },
      tile('Month to date', fmtInt(monthSpent), null, fmtPctValue(budgetPct) + ' of ' + fmtInt(budget) + ' budget'),
      tile('Remaining', fmtInt(Math.max(0, budget - monthSpent)), null, remainingDays + ' day' + (remainingDays === 1 ? '' : 's') + ' left in the month'),
      tile('Projected month end', fmtInt(Math.round(projectedEnd)), null,
        '±' + fmtInt(Math.round(sd * remainingDays)) + ' at ' + fmtInt(Math.round(rate)) + '/day (trailing 7-day rate)'),
      tile('Last 24 h', fmtInt(totals.calls_24h), null, fmtInt(totals.calls_1h) + ' in the last hour'),
      tile('Last 7 days', fmtInt(totals.calls_7d), null, 'avg ' + fmtInt(Math.round(n0(totals.calls_7d) / 7)) + '/day'),
      tile('Rate limited', fmtInt(totals.ratelimited), null, 'lifetime 429s; each still spends a credit'),
      tile('Lifetime calls', fmtCompact(totals.calls_total), null, totals.first_call ? 'since ' + fmtDate(totals.first_call) : '')
    ));

    // Comparison line
    const mtd = n0(cmp.month_to_date);
    const samePoint = n0(cmp.prior_month_same_point);
    const priorTotal = n0(cmp.prior_month_total);
    const cmpDelta = samePoint ? ((mtd - samePoint) / samePoint * 100) : null;
    const runsOutText = runsOutDay
      ? ' At this pace the budget runs out around ' + MONTHS[mo - 1] + ' ' + runsOutDay + '.'
      : ' At this pace the month ends at ' + fmtPctValue(budget ? projectedEnd / budget * 100 : null, 0) + ' of budget.';
    root.appendChild(h('div', { class: 'row' },
      h('span', { class: 'chip ' + (budgetPct !== null && budgetPct >= 90 ? 'bad' : budgetPct !== null && budgetPct >= 70 ? 'warn' : 'ok') },
        fmtInt(mtd) + ' this month vs ' + fmtInt(samePoint) + ' at this point last month'
        + (cmpDelta === null ? '' : ' (' + (cmpDelta >= 0 ? '+' : '') + cmpDelta.toFixed(0) + '%)')
        + ', last month total ' + fmtInt(priorTotal)),
      mutedText(runsOutText)));

    // Charts
    root.appendChild(panel('Burn-down: ' + MONTHS[mo - 1] + ' ' + y + ' (budget ' + fmtInt(budget) + ')', chartBox('cr-burn', 'tall'),
      h('p', { class: 'legend-note' }, 'Solid: cumulative credits spent. Dotted: even pace to the budget. Dashed: projection at the trailing 7-day average rate, band = ±1 standard deviation of those 7 days × remaining days.')));
    root.appendChild(panel('Credits per day by endpoint', byDayEndpoint.length ? chartBox('cr-endpoints') : emptyState('No CoinGecko calls in this window.')));

    // Endpoint table
    const totalCalls = byEndpoint.reduce((s, r) => s + n0(r.calls), 0);
    root.appendChild(panel('Endpoints (' + windowLabel() + ')', renderTable({
      id: 'endpoints',
      rows: byEndpoint,
      defaultSort: { key: 'calls', dir: 'desc' },
      emptyText: 'No CoinGecko calls in this window.',
      columns: [
        { key: 'endpoint', label: 'Endpoint', className: 'mono' },
        { key: 'calls', label: 'Calls', type: 'number' },
        { key: 'share', label: 'Share', type: 'number', sortValue: (r) => n0(r.calls), format: (v, r) => barCell(n0(r.calls), totalCalls, fmtPct(r.calls, totalCalls)) },
        { key: 'ratelimited', label: '429s', type: 'number', format: (v) => h('span', { class: n0(v) > 0 ? 'warn' : '' }, fmtInt(v)) },
        { key: 'errors', label: 'Errors', type: 'number', format: (v) => h('span', { class: n0(v) > 0 ? 'bad' : '' }, fmtInt(v)) },
        { key: 'avg_ms', label: 'Avg', type: 'ms' },
        { key: 'last_call', label: 'Last call', type: 'date' }
      ]
    })));

    const dayNums = Array.from({ length: dim }, (_, i) => String(i + 1));
    makeChart('cr-burn', {
      type: 'line',
      data: {
        labels: dayNums,
        datasets: [
          lineDataset('Spent', cumulative, C.accent, { fill: true, backgroundColor: 'rgba(' + ACCENT_RGB + ', 0.15)', order: 1, pointRadius: 2 }),
          lineDataset('Even pace', dayNums.map((_, i) => budget * (i + 1) / dim), C.muted, { borderDash: [2, 4], borderWidth: 1.5, pointRadius: 0, order: 3 }),
          lineDataset('Budget', dayNums.map(() => budget), C.red, { borderDash: [8, 4], borderWidth: 1.5, pointRadius: 0, order: 4 }),
          lineDataset('_band_low', lower, 'rgba(0,0,0,0)', { borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, fill: false, order: 5 }),
          lineDataset('_band_high', upper, 'rgba(0,0,0,0)', { borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, fill: '-1', backgroundColor: 'rgba(255, 182, 56, 0.14)', order: 6 }),
          lineDataset('Projected', projection, C.amber, { borderDash: [6, 4], borderWidth: 2, pointRadius: 0, order: 2 })
        ]
      },
      options: baseOptions({
        plugins: {
          legend: { labels: { filter: (item) => !String(item.text).startsWith('_') } },
          tooltip: {
            filter: (item) => !String(item.dataset.label).startsWith('_'),
            callbacks: { title: (items) => (items.length ? MONTHS[mo - 1] + ' ' + items[0].label : '') }
          }
        },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 31 } } }
      })
    });

    if (byDayEndpoint.length) {
      const totalsByEndpoint = new Map();
      for (const r of byDayEndpoint) totalsByEndpoint.set(r.endpoint, (totalsByEndpoint.get(r.endpoint) || 0) + n0(r.calls));
      const ranked = Array.from(totalsByEndpoint.entries()).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      const keep = ranked.slice(0, 6);
      const hasOther = ranked.length > keep.length;
      const keys = windowKeys(state.days, byDayEndpoint);
      const index = new Map(keys.map((k, i) => [k, i]));
      const series = new Map(keep.concat(hasOther ? ['Other'] : []).map((name) => [name, new Array(keys.length).fill(0)]));
      for (const r of byDayEndpoint) {
        const i = index.get(dayKey(r.day));
        if (i === undefined) continue;
        const name = keep.includes(r.endpoint) ? r.endpoint : 'Other';
        series.get(name)[i] += n0(r.calls);
      }
      makeChart('cr-endpoints', {
        type: 'bar',
        data: {
          labels: dayLabels(keys),
          datasets: Array.from(series.entries()).map(([name, data], i) => barDataset(name, data, name === 'Other' ? C.muted : SERIES[i % SERIES.length]))
        },
        options: baseOptions({ scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true } } })
      });
    }
  }

  /* ======================================================================
   *  Tab: Funnel
   * ====================================================================== */

  async function renderFunnel(root, seq) {
    const f = await api('/api/usage/funnel', { days: state.days, limit: 500 });
    if (stale(seq)) return;
    clear(root);

    const funnel = f.funnel || [];
    const abandoned = f.abandoned || [];

    root.appendChild(panel('Search to command conversion',
      h('p', { class: 'panel-sub' }, 'A search converts when the same user runs the same command within about a minute of it settling.'),
      renderTable({
        id: 'funnel',
        rows: funnel,
        defaultSort: { key: 'searches', dir: 'desc' },
        emptyText: 'No autocomplete searches in this window.',
        columns: [
          { key: 'command', label: 'Command', format: (v) => (v ? '/' + v : '–') },
          { key: 'searches', label: 'Searches', type: 'number' },
          { key: 'converted', label: 'Converted', type: 'number' },
          { key: 'users', label: 'Users', type: 'number' },
          { key: 'rate', label: 'Conversion', type: 'number', sortValue: (r) => (n0(r.searches) ? n0(r.converted) / n0(r.searches) : null),
            format: (v, r) => barCell(n0(r.searches) ? n0(r.converted) / n0(r.searches) * 100 : 0, 100, fmtPct(r.converted, r.searches), 'green') }
        ]
      })));

    root.appendChild(panel('Abandoned searches',
      h('p', { class: 'panel-sub' }, 'Typed into a picker and never followed by a command: coins the picker cannot find, or tickers the normaliser misses.'),
      renderTable({
        id: 'abandoned',
        rows: abandoned,
        defaultSort: { key: 'searches', dir: 'desc' },
        emptyText: 'Every search in this window led to a command.',
        columns: [
          { key: 'command', label: 'Command', format: (v) => (v ? '/' + v : '–') },
          { key: 'query', label: 'Query', className: 'wrap mono' },
          { key: 'searches', label: 'Searches', type: 'number' },
          { key: 'users', label: 'Users', type: 'number' }
        ]
      })));
  }

  /* ======================================================================
   *  Tab: Events (the pivot target)
   * ====================================================================== */

  async function renderEvents(root, seq) {
    const f = state.eventFilters;
    clear(root);

    function field(label, key, opts) {
      const o = opts || {};
      let input;
      if (o.options) {
        input = h('select', { onchange: (ev) => { f[key] = ev.target.value; } },
          h('option', { value: '' }, 'any'),
          o.options.map((v) => h('option', { value: v }, v)));
        input.value = o.options.includes(f[key]) ? f[key] : '';
      } else {
        input = h('input', {
          type: o.type || 'text', value: f[key] === null || f[key] === undefined ? '' : f[key], placeholder: o.placeholder || '',
          class: o.className || null, list: o.list || null, min: o.min || null, max: o.max || null,
          oninput: (ev) => { f[key] = ev.target.value; },
          onkeydown: (ev) => { if (ev.key === 'Enter') apply(); }
        });
      }
      return h('label', null, h('span', null, label), input);
    }
    function apply() {
      f.limit = Math.min(500, Math.max(1, Math.round(Number(f.limit)) || 200));
      refresh();
    }
    const filterBar = h('div', { class: 'filter' },
      field('Command', 'command', { placeholder: 'price', list: 'command-list' }),
      h('datalist', { id: 'command-list' }, (state.meta.commands || []).map((c) => h('option', { value: c }))),
      field('User ID', 'user', { placeholder: '1234567890', className: 'wide' }),
      field('Guild ID', 'guild', { placeholder: '1234567890', className: 'wide' }),
      field('Coin', 'coin', { placeholder: 'BTC', className: 'narrow' }),
      field('Outcome', 'outcome', { options: ['ok', 'error', 'ratelimited', 'timeout', 'cancelled', 'noop'] }),
      field('Error kind', 'error_kind', { placeholder: 'e.g. cg-not-found' }),
      field('Type', 'type', { options: ['command', 'autocomplete', 'button', 'system'] }),
      field('Limit', 'limit', { type: 'number', min: 1, max: 500, className: 'narrow' }),
      h('button', { type: 'button', class: 'btn', onclick: apply }, 'Apply'),
      h('button', {
        type: 'button', class: 'btn ghost', onclick: () => {
          state.eventFilters = Object.assign({}, EVENT_FILTER_DEFAULTS);
          refresh();
        }
      }, 'Clear'));

    const tableHost = h('div', null, h('p', { class: 'muted' }, 'Loading…'));
    root.appendChild(panel('Raw events (' + windowLabel() + ')', filterBar));
    root.appendChild(panel(null, tableHost));

    const data = await api('/api/usage/events', {
      days: state.days, limit: f.limit,
      command: f.command, user: f.user, guild: f.guild, coin: f.coin,
      outcome: f.outcome, error_kind: f.error_kind, type: f.type
    });
    if (stale(seq)) return;
    clear(tableHost);

    const events = data.events || [];
    const active = Object.entries(f).filter(([k, v]) => k !== 'limit' && v !== '' && v !== null && v !== undefined);
    tableHost.appendChild(h('p', { class: 'panel-sub' },
      fmtInt(events.length) + ' event' + (events.length === 1 ? '' : 's') + (events.length >= n0(f.limit) ? ' (limit reached; narrow the filters or raise the limit)' : ''),
      active.length ? ' · filters: ' + active.map(([k, v]) => k + '=' + v).join(', ') : ''));
    tableHost.appendChild(renderTable({
      id: 'events',
      rows: events,
      defaultSort: { key: 'occurred_at', dir: 'desc' },
      emptyText: 'No events match these filters in the window.',
      columns: [
        { key: 'occurred_at', label: 'When', type: 'datetime' },
        { key: 'event_type', label: 'Type' },
        { key: 'command', label: 'Command', format: (v, r) => (v ? '/' + v + (r.subcommand ? ' ' + r.subcommand : '') : '–') },
        { key: 'username', label: 'User', format: (v, r) => h('span', { title: r.user_id || '' }, v || r.user_id || '–') },
        { key: 'guild_name', label: 'Server', format: (v, r) => (r.guild_id ? h('span', { title: r.guild_id }, v || r.guild_id) : mutedText('DM')) },
        { key: 'outcome', label: 'Outcome', format: outcomeCell },
        { key: 'error_kind', label: 'Error', className: 'wrap', format: (v) => v || '' },
        { key: 'duration_ms', label: 'Duration', type: 'ms' },
        { key: 'params', label: 'Params', format: (v) => {
          if (v === null || v === undefined) return '';
          const json = typeof v === 'string' ? v : JSON.stringify(v);
          return h('span', { class: 'json', title: json }, truncate(json, 80));
        } },
        { key: 'coins', label: 'Coins', format: (v) => (Array.isArray(v) && v.length ? v.join(', ') : '') }
      ]
    }));
  }

  /* ======================================================================
   *  Shell: tabs, controls, refresh loop
   * ====================================================================== */

  const TABS = [
    { id: 'overview', label: 'Overview', render: renderOverview },
    { id: 'commands', label: 'Commands', render: renderCommands },
    { id: 'users', label: 'Users & Servers', render: renderUsers },
    { id: 'coins', label: 'Coins', render: renderCoins },
    { id: 'features', label: 'Features', render: renderFeatures },
    { id: 'activity', label: 'Activity', render: renderActivity },
    { id: 'errors', label: 'Errors', render: renderErrors },
    { id: 'growth', label: 'Growth', render: renderGrowth },
    { id: 'credits', label: 'Credits', render: renderCredits },
    { id: 'funnel', label: 'Funnel', render: renderFunnel },
    { id: 'events', label: 'Events', render: renderEvents }
  ];

  function currentTab() {
    return TABS.find((t) => t.id === state.tab) || TABS[0];
  }

  async function refresh() {
    const seq = ++renderSeq;
    const tab = currentTab();
    const root = $('view');
    hideBanner();
    destroyCharts();
    root.classList.add('loading');
    try {
      await tab.render(root, seq);
      if (stale(seq)) return;
      state.lastUpdated = Date.now();
      updateStamp();
    } catch (err) {
      if (stale(seq)) return;
      showBanner(err && err.message ? err.message : String(err), err && err.unauthorized ? 'info' : null);
      if (!root.firstChild) root.appendChild(emptyState('Could not load this tab.'));
    } finally {
      if (!stale(seq)) root.classList.remove('loading');
    }
  }

  function switchTab(id) {
    if (!TABS.some((t) => t.id === id)) id = TABS[0].id;
    state.tab = id;
    saveState();
    if (window.location.hash !== '#' + id) {
      try {
        window.history.replaceState(null, '', '#' + id);
      } catch {
        window.location.hash = id;
      }
    }
    drawTabs();
    refresh();
  }

  function drawTabs() {
    const strip = $('tabs');
    clear(strip);
    for (const t of TABS) {
      strip.appendChild(h('button', {
        type: 'button', role: 'tab', class: 'tab' + (t.id === state.tab ? ' active' : ''),
        'aria-selected': t.id === state.tab ? 'true' : 'false',
        onclick: () => switchTab(t.id)
      }, t.label));
    }
  }

  function setDays(days) {
    state.days = clampDays(days);
    saveState();
    drawRange();
    refresh();
  }
  function drawRange() {
    for (const b of $('range-buttons').querySelectorAll('button[data-days]')) {
      b.classList.toggle('active', Number(b.dataset.days) === state.days);
    }
    const input = $('days-input');
    if (document.activeElement !== input) input.value = String(state.days);
  }

  function populateTimezones() {
    const select = $('tz-select');
    clear(select);
    let zones = Array.isArray(state.meta.timezones) && state.meta.timezones.length ? state.meta.timezones.slice() : FALLBACK_TZ.slice();
    if (!zones.includes('UTC')) zones.unshift('UTC');
    if (!zones.includes(state.tz)) zones.push(state.tz);
    // A browser-local zone first makes the common pick one click away.
    let local = null;
    try {
      local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      local = null;
    }
    if (local && zones.includes(local)) zones = [local].concat(zones.filter((z) => z !== local));
    for (const z of zones) select.appendChild(h('option', { value: z, selected: z === state.tz }, z));
    select.value = state.tz;
  }

  function updateStamp() {
    const stamp = $('updated-stamp');
    if (!state.lastUpdated) {
      stamp.textContent = 'not loaded';
      return;
    }
    stamp.textContent = 'updated ' + fmtTime(state.lastUpdated) + ' (' + fmtRelative(state.lastUpdated) + ')';
    stamp.title = 'Last successful load; times shown in ' + state.tz;
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    autoTimer = window.setInterval(() => {
      if (document.hidden) return;
      refresh();
    }, AUTO_REFRESH_MS);
  }
  function stopAutoRefresh() {
    if (autoTimer) {
      window.clearInterval(autoTimer);
      autoTimer = null;
    }
  }
  function applyAutoRefresh() {
    $('auto-refresh').checked = state.autoRefresh;
    if (state.autoRefresh) startAutoRefresh();
    else stopAutoRefresh();
  }

  function wireControls() {
    for (const b of $('range-buttons').querySelectorAll('button[data-days]')) {
      b.addEventListener('click', () => setDays(b.dataset.days));
    }
    const daysInput = $('days-input');
    daysInput.addEventListener('change', () => setDays(daysInput.value));
    daysInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        setDays(daysInput.value);
        daysInput.blur();
      }
    });
    $('tz-select').addEventListener('change', (ev) => {
      state.tz = ev.target.value || 'UTC';
      saveState();
      refresh();
    });
    $('auto-refresh').addEventListener('change', (ev) => {
      state.autoRefresh = !!ev.target.checked;
      saveState();
      applyAutoRefresh();
    });
    $('refresh-btn').addEventListener('click', () => refresh());
    window.addEventListener('hashchange', () => {
      const id = window.location.hash.replace(/^#/, '');
      if (id && id !== state.tab && TABS.some((t) => t.id === id)) switchTab(id);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.autoRefresh) refresh();
    });
    window.setInterval(updateStamp, 15000);
  }

  async function loadMeta() {
    try {
      const meta = await api('/api/usage/meta');
      state.meta = {
        commands: Array.isArray(meta.commands) ? meta.commands.slice().sort() : [],
        timezones: Array.isArray(meta.timezones) ? meta.timezones : [],
        budget: n0(meta.budget) || 10000
      };
    } catch (err) {
      if (err && err.unauthorized) throw err;
      // Meta is a convenience: a failure leaves the fallbacks in place.
    }
  }

  async function init() {
    loadState();
    const fromHash = window.location.hash.replace(/^#/, '');
    if (fromHash && TABS.some((t) => t.id === fromHash)) state.tab = fromHash;
    if (!TABS.some((t) => t.id === state.tab)) state.tab = 'overview';

    setupChartDefaults();
    wireControls();
    drawTabs();
    drawRange();
    populateTimezones();
    applyAutoRefresh();
    updateStamp();

    try {
      await loadMeta();
    } catch (err) {
      showBanner(err.message, 'info');
      return;
    }
    populateTimezones();
    if (typeof Chart === 'undefined') {
      showBanner('Chart.js failed to load, so charts will be blank; tables still work.');
    }
    switchTab(state.tab);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
