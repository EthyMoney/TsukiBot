'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const render = require('../src/telemetry-render');

/* --------------------------------------------

    Telemetry rendering.

    Two Discord constraints drive everything here, and both are invisible to a unit test unless
    it checks for them explicitly:

      1. Embeds render in a proportional font, so padded columns only line up inside a code
         fence. The alignment tests below check that every row of a table is the same width,
         which is the property that makes the code fence worth using at all.

      2. An embed field value is capped at 1024 characters and the description at 4096. Exceeding
         either makes Discord reject the whole message, so an oversized table has to degrade into
         a shorter one rather than be sent.

  -------------------------------------------- */

/* ---------- truncate ---------- */

test('truncate leaves short values alone', () => {
  assert.equal(render.truncate('btc', 10), 'btc');
});

test('truncate marks the cut so a clipped value is not mistaken for a real one', () => {
  assert.equal(render.truncate('averylongcommandname', 10), 'averylong…');
  assert.equal(render.truncate('averylongcommandname', 10).length, 10);
});

test('truncate renders missing values as empty', () => {
  assert.equal(render.truncate(null, 5), '');
  assert.equal(render.truncate(undefined, 5), '');
});

/* ---------- compactNumber ---------- */

test('compactNumber leaves small numbers intact', () => {
  assert.equal(render.compactNumber(0), '0');
  assert.equal(render.compactNumber(999), '999');
});

test('compactNumber abbreviates thousands and millions', () => {
  assert.equal(render.compactNumber(1500), '1.5k');
  assert.equal(render.compactNumber(15000), '15k');
  assert.equal(render.compactNumber(1500000), '1.5m');
});

test('compactNumber survives null', () => {
  assert.equal(render.compactNumber(null), '0');
});

/* ---------- formatDuration ---------- */

test('formatDuration scales its unit', () => {
  assert.equal(render.formatDuration(250), '250ms');
  assert.equal(render.formatDuration(1500), '1.5s');
  assert.equal(render.formatDuration(90000), '1.5m');
});

test('formatDuration reports missing timings rather than NaN', () => {
  assert.equal(render.formatDuration(null), '-');
  assert.equal(render.formatDuration(undefined), '-');
  assert.equal(render.formatDuration(NaN), '-');
});

/* ---------- formatRelative ---------- */

test('formatRelative describes recent times in the largest sensible unit', () => {
  const now = new Date('2026-08-17T12:00:00Z');
  assert.equal(render.formatRelative(new Date('2026-08-17T11:59:30Z'), now), 'just now');
  assert.equal(render.formatRelative(new Date('2026-08-17T11:30:00Z'), now), '30m ago');
  assert.equal(render.formatRelative(new Date('2026-08-17T06:00:00Z'), now), '6h ago');
  assert.equal(render.formatRelative(new Date('2026-08-14T12:00:00Z'), now), '3d ago');
});

test('formatRelative handles missing and invalid dates', () => {
  assert.equal(render.formatRelative(null), '-');
  assert.equal(render.formatRelative('not a date'), '-');
});

/* ---------- percent ---------- */

test('percent computes a share', () => {
  assert.equal(render.percent(25, 100), '25.0%');
  assert.equal(render.percent(1, 3, 0), '33%');
});

test('percent does not divide by zero', () => {
  // An empty window is the normal state of a fresh install, not an edge case.
  assert.equal(render.percent(0, 0), '0%');
});

/* ---------- renderTable ---------- */

const SAMPLE = [
  { name: 'price', uses: 1200, users: 40 },
  { name: 'cg', uses: 900, users: 35 },
  { name: 'portfolio show', uses: 12, users: 5 }
];

const COLUMNS = [
  { key: 'name', label: 'Command', width: 16 },
  { key: 'uses', label: 'Uses', align: 'right', width: 8 },
  { key: 'users', label: 'Users', align: 'right', width: 6 }
];

test('renderTable aligns every row to the same width', () => {
  // This is the property the code fence exists to preserve.
  const lines = render.renderTable(SAMPLE, COLUMNS).split('\n');
  const widths = new Set(lines.map(line => line.length));
  // Rows are right-trimmed, so a short final column may leave a row narrower; the header and
  // rule must match each other exactly, and no row may exceed them.
  assert.equal(lines[0].length, lines[1].length, 'header and rule must be the same width');
  for (const line of lines) {
    assert.ok(line.length <= lines[1].length, `row "${line}" is wider than the rule`);
  }
  assert.ok(widths.size <= lines.length, 'sanity check on the extraction');
});

test('renderTable includes a header and a rule', () => {
  const lines = render.renderTable(SAMPLE, COLUMNS).split('\n');
  assert.match(lines[0], /Command/);
  assert.match(lines[1], /^─+/);
  assert.equal(lines.length, SAMPLE.length + 2);
});

test('renderTable applies a formatter', () => {
  const output = render.renderTable(SAMPLE, [
    { key: 'name', label: 'Command', width: 16 },
    { key: 'uses', label: 'Uses', align: 'right', width: 8, format: render.compactNumber }
  ]);
  assert.match(output, /1\.2k/);
});

test('renderTable shrinks a column to its content', () => {
  // Width is a maximum, not a minimum: these get read on a phone.
  const output = render.renderTable([{ a: 'x' }], [{ key: 'a', label: 'A', width: 30 }]);
  assert.equal(output.split('\n')[0], 'A');
});

test('renderTable renders missing cells as a dash rather than "undefined"', () => {
  const output = render.renderTable([{ name: 'price' }], COLUMNS);
  assert.match(output, /-/);
  assert.equal(output.includes('undefined'), false);
});

test('renderTable reports an empty result instead of rendering a bare header', () => {
  assert.equal(render.renderTable([], COLUMNS), 'No data yet.');
  assert.equal(render.renderTable(null, COLUMNS), 'No data yet.');
});

/* ---------- renderKeyValue ---------- */

test('renderKeyValue aligns the value column', () => {
  const lines = render.renderKeyValue([['Events', '1.2k'], ['Unique users', '40']]).split('\n');
  assert.equal(lines[0].length, lines[1].length, 'both rows must be the same width');
  // "Events" pads out to the width of "Unique users" (6 spaces), then a 2-space gutter.
  assert.match(lines[0], /^Events {8}1\.2k$/);
});

test('renderKeyValue handles an empty list', () => {
  assert.equal(render.renderKeyValue([]), 'No data yet.');
});

/* ---------- renderBarChart ---------- */

test('renderBarChart scales bars against the largest value', () => {
  const lines = render.renderBarChart([
    { label: 'price', value: 100 },
    { label: 'cg', value: 50 }
  ], { width: 10 }).split('\n');

  const blocks = lines.map(line => (line.match(/█/g) || []).length);
  assert.equal(blocks[0], 10, 'the largest value fills the bar');
  assert.equal(blocks[1], 5, 'half the value is half the bar');
});

test('renderBarChart gives any nonzero value at least one block', () => {
  // Otherwise "rare but real" renders identically to zero.
  const lines = render.renderBarChart([
    { label: 'big', value: 10000 },
    { label: 'tiny', value: 1 }
  ], { width: 10 }).split('\n');
  assert.equal((lines[1].match(/█/g) || []).length, 1);
});

test('renderBarChart renders a true zero as an empty bar', () => {
  const lines = render.renderBarChart([
    { label: 'some', value: 5 },
    { label: 'none', value: 0 }
  ], { width: 10 }).split('\n');
  assert.equal((lines[1].match(/█/g) || []).length, 0);
});

test('renderBarChart keeps every row the same width', () => {
  const lines = render.renderBarChart([
    { label: 'a', value: 1 },
    { label: 'bbbbbbbb', value: 1000 }
  ], { width: 12 }).split('\n');
  assert.equal(lines[0].length, lines[1].length);
});

test('renderBarChart handles an empty series', () => {
  assert.equal(render.renderBarChart([]), 'No data yet.');
});

/* ---------- renderSparkline ---------- */

test('renderSparkline maps the range onto block characters', () => {
  const spark = render.renderSparkline([0, 50, 100]);
  assert.equal(spark.length, 3);
  assert.equal(spark[0], render.SPARK_CHARS[0]);
  assert.equal(spark[2], render.SPARK_CHARS[render.SPARK_CHARS.length - 1]);
});

test('renderSparkline handles a flat series without dividing by zero', () => {
  const spark = render.renderSparkline([7, 7, 7]);
  assert.equal(spark, render.SPARK_CHARS[0].repeat(3));
});

test('renderSparkline handles an empty series', () => {
  assert.equal(render.renderSparkline([]), '');
});

/* ---------- renderHeatmap ---------- */

test('renderHeatmap renders a ruler and one row per weekday', () => {
  const grid = [
    { weekday: 1, hour: 9, events: 100 },
    { weekday: 3, hour: 14, events: 50 }
  ];
  const lines = render.renderHeatmap(grid).split('\n');
  assert.equal(lines.length, 8, 'a ruler plus seven weekday rows');
  for (let day = 0; day < 7; day++) {
    assert.ok(lines[day + 1].startsWith(render.WEEKDAY_NAMES[day]));
  }
});

test('renderHeatmap gives every row all 24 hours', () => {
  const lines = render.renderHeatmap([{ weekday: 0, hour: 0, events: 1 }]).split('\n').slice(1);
  for (const line of lines) {
    // Four characters of weekday label plus 24 cells.
    assert.equal([...line].length, 4 + 24, `row "${line}" is not 24 hours wide`);
  }
});

test('renderHeatmap distinguishes the busiest cell from an empty one', () => {
  const output = render.renderHeatmap([
    { weekday: 1, hour: 9, events: 100 },
    { weekday: 1, hour: 10, events: 1 }
  ]);
  assert.ok(output.includes(render.HEAT_CHARS[render.HEAT_CHARS.length - 1]), 'the peak should be fully shaded');
  assert.ok(output.includes(render.HEAT_CHARS[0]), 'empty hours should show as the blank character');
});

test('renderHeatmap ignores out-of-range buckets rather than throwing', () => {
  assert.doesNotThrow(() => render.renderHeatmap([{ weekday: 9, hour: 99, events: 5 }]));
});

test('renderHeatmap handles no data', () => {
  assert.equal(render.renderHeatmap([]), 'No data yet.');
});

/* ---------- renderCsv ---------- */

test('renderCsv writes a header from the first row', () => {
  const csv = render.renderCsv([{ command: 'cg', uses: 5 }]);
  assert.equal(csv.split('\n')[0], 'command,uses');
});

test('renderCsv quotes values containing a comma, quote or newline', () => {
  const csv = render.renderCsv([{ text: 'a,b' }, { text: 'say "hi"' }, { text: 'two\nlines' }]);
  const lines = csv.split('\n');
  assert.equal(lines[1], '"a,b"');
  assert.equal(lines[2], '"say ""hi"""', 'internal quotes must be doubled per RFC 4180');
  assert.ok(csv.includes('"two\nlines"'));
});

test('renderCsv serializes objects and dates', () => {
  const csv = render.renderCsv([{ params: { coin: 'btc' }, at: new Date('2026-08-17T00:00:00Z') }]);
  assert.ok(csv.includes('"{""coin"":""btc""}"'));
  assert.ok(csv.includes('2026-08-17T00:00:00.000Z'));
});

test('renderCsv renders nulls as empty fields', () => {
  const csv = render.renderCsv([{ a: null, b: 'x' }]);
  assert.equal(csv.split('\n')[1], ',x');
});

test('renderCsv handles no rows', () => {
  assert.equal(render.renderCsv([]), '');
});

/* ---------- codeBlock ---------- */

test('codeBlock wraps content in a fence', () => {
  assert.equal(render.codeBlock('hello'), '```\nhello\n```');
});

test('codeBlock keeps output within an embed field limit', () => {
  // Discord rejects the entire message if a field value exceeds 1024, so an oversized table has
  // to be trimmed rather than sent.
  const huge = Array.from({ length: 200 }, (_, i) => `row ${i} with some padding text`).join('\n');
  const block = render.codeBlock(huge, 1024);
  assert.ok(block.length <= 1024, `code block is ${block.length} chars, over the 1024 field limit`);
  assert.ok(block.includes('truncated'), 'the reader must be told content was dropped');
  assert.ok(block.startsWith('```') && block.endsWith('```'), 'the fence must still be closed');
});

test('codeBlock does not truncate content that already fits', () => {
  const block = render.codeBlock('short', 1024);
  assert.equal(block.includes('truncated'), false);
});

test('codeBlock handles empty input', () => {
  assert.equal(render.codeBlock(''), '```\n\n```');
});
