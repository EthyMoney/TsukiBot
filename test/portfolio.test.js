'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* --------------------------------------------

    Tests for weightedChange, which produces /portfolio's multi-timeframe totals. It is extracted
    from main.js by brace matching, so this tests what actually ships rather than a copy that
    can drift out of sync.

  -------------------------------------------- */

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function extractFunction(declaration) {
  const start = mainSource.indexOf(declaration);
  assert.notEqual(start, -1, 'could not find ' + declaration + ' in main.js');
  let depth = 0;
  for (let i = mainSource.indexOf('{', start); i < mainSource.length; i++) {
    if (mainSource[i] === '{') depth++;
    else if (mainSource[i] === '}') {
      depth--;
      if (depth === 0) return mainSource.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces reading ' + declaration);
}

const { weightedChange } = new Function(
  extractFunction('function weightedChange') + '\n' +
  'return { weightedChange };'
)();

// ---------------------------------------------------------------- weighted change

test('weightedChange returns null when no holding has that timeframe', () => {
  const priced = [{ value: 100, change7d: null }, { value: 50, change7d: null }];
  assert.equal(weightedChange(priced, 'change7d'), null);
});

test('weightedChange matches the single-holding percentage exactly', () => {
  // One holding worth $110 that rose 10% must report exactly +10%.
  const result = weightedChange([{ value: 110, change24h: 10 }], 'change24h');
  assert.ok(Math.abs(result.percent - 10) < 1e-9, 'got ' + result.percent);
  assert.ok(Math.abs(result.amount - 10) < 1e-9, 'got ' + result.amount);
});

test('weightedChange weights by holding size, not by a plain average', () => {
  // A $900 position up 10% (now $990) and a $100 position down 10% (now $90).
  // A naive average of the two percentages says 0%. The correct weighted answer is driven by the
  // larger position: $1000 before, $1080 now, so +$80 and +8%.
  const priced = [
    { value: 990, change24h: 10 },
    { value: 90, change24h: -10 }
  ];
  const result = weightedChange(priced, 'change24h');
  assert.ok(Math.abs(result.amount - 80) < 1e-6, 'amount should be +80, got ' + result.amount);
  assert.ok(Math.abs(result.percent - 8) < 1e-9, 'percent should be +8, got ' + result.percent);
  assert.notEqual(result.percent, 0, 'a plain average would wrongly report 0%');
});

test('weightedChange skips holdings missing the timeframe rather than treating them as flat', () => {
  // A holding with no 7d figure must not be counted as 0% — that would dilute the real result.
  const withGap = weightedChange([
    { value: 110, change7d: 10 },
    { value: 500, change7d: null }
  ], 'change7d');
  assert.ok(Math.abs(withGap.percent - 10) < 1e-9,
    'the unpriced holding should be excluded entirely, got ' + withGap.percent);
});

test('weightedChange ignores holdings with no value', () => {
  const result = weightedChange([
    { value: null, change24h: 50 },
    { value: 110, change24h: 10 }
  ], 'change24h');
  assert.ok(Math.abs(result.percent - 10) < 1e-9, 'got ' + result.percent);
});

test('weightedChange survives a -100% move without dividing by zero', () => {
  // A coin that lost all its value would make the prior-value maths divide by zero.
  const result = weightedChange([
    { value: 0, change24h: -100 },
    { value: 110, change24h: 10 }
  ], 'change24h');
  assert.ok(result && Number.isFinite(result.percent), 'should still return a finite result');
});
