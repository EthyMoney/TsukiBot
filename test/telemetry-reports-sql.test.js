'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'telemetry-reports.js'), 'utf8');

// Postgres only accepts FILTER directly on an aggregate. ROUND(AVG(x)) FILTER (...) fails with
// "FILTER specified, but round is not an aggregate function", which broke every usage overview
// from August to November 2026.
test('FILTER is never attached to a non-aggregate wrapper such as ROUND', () => {
  const offenders = source.split('\n')
    .filter(line => /\b(ROUND|COALESCE|GREATEST|LEAST)\s*\([^\n]*\)\)\s*FILTER\b/i.test(line));
  assert.deepEqual(offenders, []);
});
