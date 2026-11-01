/* ------------------------------------------------------------------------
 *
 *                       TsukiBot - src/error-log.js
 *
 * Turns the tail of the bot's own error log into something short enough to
 * summarize: the last day's lines only, repeats collapsed into one line with
 * a count, stack traces reduced to the frame that says where, and every
 * secret removed before any of it leaves the machine.
 *
 * PM2 writes the log with a "YYYY-MM-DD HH:mm: " prefix on every line (the
 * log_date_format in process.json), in the host's local time. Lines without
 * the prefix (a log written some other way) are kept and treated as recent.
 *
 * Pure functions; main.js reads the file.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const PREFIX = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}): ?/;

// The bot colours its console output, so the log is full of ANSI escapes. Built from the escape
// character's code because a literal one in a regex trips no-control-regex.
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*[A-Za-z]', 'g');

/** Lines that say nothing about a fault and would only crowd out the ones that do. */
const NOISE = [
  /DeprecationWarning/,
  /Use `node --trace-deprecation/
];

/**
 * The lines logged at or after sinceMs, without their timestamp prefix.
 * @param {string} text
 * @param {number} sinceMs
 * @returns {Array<string>}
 */
function recentLines(text, sinceMs) {
  const out = [];
  for (const raw of String(text || '').replace(ANSI, '').split('\n')) {
    if (!raw.trim()) continue;
    const match = PREFIX.exec(raw);
    if (match) {
      const at = new Date(`${match[1]}T${match[2]}:00`).getTime(); // local time, as PM2 wrote it
      if (Number.isFinite(at) && at < sinceMs) continue;
      out.push(raw.slice(match[0].length));
    }
    else {
      out.push(raw);
    }
  }
  return out;
}

/** The grouping key for a line: ids, numbers, hex and quoted values replaced, so repeats match. */
function shapeOf(line) {
  return line
    .replace(/0x[0-9a-fA-F]+/g, '0x#')
    .replace(/\b\d+(\.\d+)?\b/g, '#')
    .replace(/'[^']{1,80}'|"[^"]{1,80}"/g, '"…"')
    .trim();
}

/**
 * Collapses repeated lines into one example with a count, keeping the first stack frame under
 * each message so the summary can say where it happened. Most frequent first.
 * @param {Array<string>} lines
 * @param {{limit?: number}} [options]
 * @returns {Array<{line: string, count: number, frame: string|null}>}
 */
function collapseLines(lines, { limit = 40 } = {}) {
  const groups = new Map();
  let last = null;
  for (const line of lines) {
    if (NOISE.some(pattern => pattern.test(line))) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith('at ')) {
      if (last && !last.frame) last.frame = trimmed.slice(0, 200);
      continue;
    }
    const key = shapeOf(trimmed);
    let group = groups.get(key);
    if (!group) {
      group = { line: trimmed.slice(0, 300), count: 0, frame: null };
      groups.set(key, group);
    }
    group.count++;
    last = group;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/**
 * Removes anything that could be a credential: every configured secret verbatim, plus the usual
 * shapes of keys and tokens in case one came from somewhere else.
 * @param {string} text
 * @param {Array<string>} secrets known secret values (keys.api strings)
 * @returns {string}
 */
function redactSecrets(text, secrets = []) {
  let out = String(text || '');
  const known = [...new Set(secrets.filter(s => typeof s === 'string' && s.length >= 8))]
    .sort((a, b) => b.length - a.length);
  for (const secret of known) {
    out = out.split(secret).join('[redacted]');
  }
  return out
    .replace(/(\b(?:api_?key|key|token|access_token|app_id|appid|secret|password)=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    .replace(/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g, '[redacted-token]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-jwt]')
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, 'postgres://[redacted]')
    .replace(/\b[0-9a-fA-F]{32,}\b/g, '[redacted-hex]');
}

/**
 * The whole pipeline: recent lines, collapsed, rendered as prompt text, then redacted.
 * @param {string} text the log file's tail
 * @param {{sinceMs: number, secrets?: Array<string>, limit?: number}} options
 * @returns {{text: string, distinct: number, total: number}}
 */
function summarizeLogTail(text, { sinceMs, secrets = [], limit = 40 }) {
  const lines = recentLines(text, sinceMs);
  const groups = collapseLines(lines, { limit: Infinity });
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const rendered = groups.slice(0, limit)
    .map(group => `${group.count}x ${group.line}` + (group.frame ? `\n    ${group.frame}` : ''))
    .join('\n');
  return { text: redactSecrets(rendered, secrets), distinct: groups.length, total };
}

module.exports = {
  collapseLines,
  recentLines,
  redactSecrets,
  summarizeLogTail
};
