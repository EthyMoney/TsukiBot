'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* --------------------------------------------

    Discord renders markdown headings (#, ##, ###) in message content and in an embed's
    description, but NOT inside an embed field value — there the hashes are shown literally.

    That is a real bug that shipped: /portfolio's "Total value" field rendered as "### $21.11".
    It is invisible in unit tests and only shows up in Discord, so this test reads main.js and
    checks that no heading string is passed to a field value.

  -------------------------------------------- */

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

// Pull out every addFields({...}) / addFields(...) argument region so field values can be inspected
// separately from descriptions, where headings are legitimate.
function getAddFieldsRegions(source) {
  const regions = [];
  let searchFrom = 0;
  for (;;) {
    const start = source.indexOf('.addFields(', searchFrom);
    if (start === -1) break;
    let depth = 0;
    let i = source.indexOf('(', start);
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    regions.push({ index: start, text: source.slice(start, i + 1) });
    searchFrom = i + 1;
  }
  return regions;
}

function lineNumberOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

test('no markdown heading is used inside an embed field value', () => {
  const offenders = [];
  for (const region of getAddFieldsRegions(mainSource)) {
    // A heading only counts when it starts a line or immediately follows a newline escape,
    // which is how Discord parses it.
    if (/(?:`|\\n)\s*#{1,3}\s/.test(region.text)) {
      offenders.push('main.js:' + lineNumberOf(mainSource, region.index));
    }
  }
  assert.deepEqual(offenders, [],
    'markdown headings do not render in embed field values (they show as literal #). ' +
    'Use **bold** instead, or move the content into setDescription. Found at: ' + offenders.join(', '));
});

test('addFields regions were actually found, so the test above can fail', () => {
  // Guards against the extraction silently matching nothing and the test passing vacuously.
  const regions = getAddFieldsRegions(mainSource);
  assert.ok(regions.length >= 3, 'expected several addFields call sites, found ' + regions.length);
});

test('the extraction can detect a heading when one is present', () => {
  // Prove the detector has teeth by running it over a known-bad synthetic sample.
  const bad = '.addFields({ name: \'Total\', value: `### ${x}\\n` + `more` })';
  const found = getAddFieldsRegions(bad);
  assert.equal(found.length, 1, 'should find the synthetic addFields call');
  assert.ok(/(?:`|\\n)\s*#{1,3}\s/.test(found[0].text), 'detector failed to flag a heading it should catch');
});
