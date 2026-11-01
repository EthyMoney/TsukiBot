'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { collapseLines, recentLines, redactSecrets, summarizeLogTail } = require('../src/error-log');

/* --------------------------------------------

    The error log tail behind the daily error summary.

    The redaction tests matter most: this text is sent to an outside API, and the log has held
    URLs with keys in them before.

  -------------------------------------------- */

// PM2 writes local time; build the fixture the same way so the test passes in any timezone.
function stamp(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const NOW = new Date(2026, 10, 1, 12, 0);
const OLD = new Date(2026, 10, 1, 9, 0);
const RECENT = new Date(2026, 10, 1, 11, 30);

test('recentLines keeps only lines at or after the cutoff and strips the PM2 prefix', () => {
  const text = [
    `${stamp(OLD)}: old failure`,
    `${stamp(RECENT)}: TypeError: boom`,
    `${stamp(RECENT)}:     at handler (main.js:5:1)`,
    'no prefix at all'
  ].join('\n');
  const lines = recentLines(text, NOW.getTime() - 60 * 60 * 1000);
  assert.deepEqual(lines, ['TypeError: boom', '    at handler (main.js:5:1)', 'no prefix at all']);
});

test('recentLines strips the colour codes the bot writes into its log', () => {
  const esc = String.fromCharCode(27);
  const text = `${stamp(RECENT)}: ${esc}[31m${esc}[1mERROR UPDATING CMC CACHE!${esc}[22m${esc}[39m`;
  assert.deepEqual(recentLines(text, 0), ['ERROR UPDATING CMC CACHE!']);
});

test('collapseLines counts repeats that differ only in ids and numbers, and keeps the first frame', () => {
  const groups = collapseLines([
    'Scheduled job #12 failed: Missing Access',
    '    at post (main.js:100:5)',
    '    at run (main.js:200:5)',
    'Scheduled job #873 failed: Missing Access',
    '(node:1234) DeprecationWarning: ready is deprecated',
    'Could not DM user 123456789012345678'
  ]);
  assert.equal(groups.length, 2, 'the deprecation warning is noise and is dropped');
  assert.deepEqual(groups[0], { line: 'Scheduled job #12 failed: Missing Access', count: 2, frame: 'at post (main.js:100:5)' });
});

test('redactSecrets removes configured secrets and anything shaped like a credential', () => {
  const secrets = ['sk-ant-api03-supersecretvalue', 'short'];
  // Assembled at runtime so secret scanners do not flag this fake as a real Discord token.
  const fakeDiscordToken = ['MTIzNDU2Nzg5MDEyMzQ1Njc4', 'Gabcde', 'abcdefghijklmnopqrstuvwxyz123456'].join('.');
  const text = [
    'Anthropic key sk-ant-api03-supersecretvalue leaked',
    'GET https://api.etherscan.io/v2/api?module=gas&apikey=ABC123DEF456 failed',
    'Authorization: Bearer abc.def-ghi',
    `token ${fakeDiscordToken} rejected`,
    'connect postgres://tsuki:hunter2@db.example.com:5432/tsukibot refused',
    'hash 0123456789abcdef0123456789abcdef01 seen',
    'a short word stays'
  ].join('\n');
  const out = redactSecrets(text, secrets);
  for (const leaked of ['supersecretvalue', 'ABC123DEF456', 'abc.def-ghi', 'MTIzNDU2', 'hunter2', '0123456789abcdef0123456789abcdef01']) {
    assert.ok(!out.includes(leaked), `still contains ${leaked}:\n${out}`);
  }
  assert.ok(out.includes('module=gas'), 'ordinary parameters are kept');
  assert.ok(out.includes('short'), 'values too short to be a key are not treated as secrets');
});

test('summarizeLogTail totals every line, renders the top groups, and redacts the result', () => {
  const lines = [];
  for (let i = 0; i < 50; i++) lines.push(`${stamp(RECENT)}: Error number ${i} with key=SECRETKEY123`);
  lines.push(`${stamp(RECENT)}: fetch failed`);
  const result = summarizeLogTail(lines.join('\n'), { sinceMs: NOW.getTime() - 3600e3, secrets: [], limit: 1 });
  assert.equal(result.total, 51);
  assert.equal(result.distinct, 2);
  assert.match(result.text, /^50x Error number 0 with key=\[redacted\]$/);
});
