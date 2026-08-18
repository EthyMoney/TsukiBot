'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* --------------------------------------------

    Module-scope initialization order.

    main.js runs top to bottom on require. A `const` is in its temporal dead zone until the line
    that declares it executes, so a top-level call that touches a const declared further down
    throws "Cannot access 'X' before initialization" the instant the bot starts.

    This has now happened twice: once with a lookup table declared below the function that used
    it at startup, and once with telemetry.init() placed above its own require. Neither was
    caught by `node --check` - a TDZ violation is valid syntax - and neither showed up in any
    unit test, because nothing unit-tests a 6000-line module's top-level side effects.

    So this test reads main.js and checks the ordering directly. It only inspects statements at
    column zero (module scope) and only flags calls, which is the pattern that actually executes
    during require. Function declarations are hoisted and are correctly ignored.

  -------------------------------------------- */

const FILES = ['main.js', 'deploy-commands.js', 'getCoinsCG.js', 'getCoinMeta.js', 'coingecko-onchain.js'];

/** Collects `const`/`let` bindings declared at module scope, with the line each appears on. */
function collectTopLevelBindings(source) {
  const bindings = new Map();
  const lines = source.split('\n');

  lines.forEach((line, index) => {
    // Column zero only: anything indented is inside a function or block.
    const simple = /^(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line);
    if (simple && !bindings.has(simple[1])) {
      bindings.set(simple[1], index + 1);
      return;
    }
    // Destructured requires, e.g. `const { EmbedBuilder, Client } = require('discord.js');`
    const destructured = /^(?:const|let)\s*\{([^}]*)\}\s*=/.exec(line);
    if (destructured) {
      for (const part of destructured[1].split(',')) {
        const name = part.split(':').pop().trim().split('=')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name) && !bindings.has(name)) bindings.set(name, index + 1);
      }
    }
  });

  return bindings;
}

/**
 * Collects module-scope calls: `foo(...)` and `foo.bar(...)` starting at column zero. These are
 * the statements that actually run during require, and therefore the ones that can hit a TDZ.
 */
function collectTopLevelCalls(source) {
  const calls = [];
  source.split('\n').forEach((line, index) => {
    const match = /^([A-Za-z_$][\w$]*)(?:\.[\w$]+)*\s*\(/.exec(line);
    if (!match) return;
    // Keywords that look like calls but are control flow, not references to a binding.
    if (['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'require'].includes(match[1])) return;
    calls.push({ name: match[1], line: index + 1, text: line.trim() });
  });
  return calls;
}

for (const file of FILES) {
  test(`${file} never calls a const before it is declared`, () => {
    const fullPath = path.join(__dirname, '..', file);
    if (!fs.existsSync(fullPath)) return; // optional file

    const source = fs.readFileSync(fullPath, 'utf8');
    const bindings = collectTopLevelBindings(source);
    const violations = [];

    for (const call of collectTopLevelCalls(source)) {
      const declaredAt = bindings.get(call.name);
      if (declaredAt !== undefined && declaredAt > call.line) {
        violations.push(
          `${file}:${call.line} calls "${call.name}", which is not declared until line ${declaredAt}\n` +
          `      ${call.text}`);
      }
    }

    assert.deepEqual(violations, [],
      'temporal dead zone: these run at require time and would crash the bot on startup.\n' +
      '    Move the declaration above its first use.\n\n    ' + violations.join('\n    '));
  });
}

test('the checker finds the bindings and calls it is meant to inspect', () => {
  // Guards against a stale regex making every test above pass vacuously.
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const bindings = collectTopLevelBindings(source);
  const calls = collectTopLevelCalls(source);

  assert.ok(bindings.size > 30, `only found ${bindings.size} top-level bindings, the pattern is probably stale`);
  assert.ok(calls.length > 5, `only found ${calls.length} top-level calls, the pattern is probably stale`);
  assert.ok(bindings.has('dbPool'), 'expected to find the dbPool binding');
  assert.ok(bindings.has('telemetry'), 'expected to find the telemetry binding');
});

test('the checker detects a violation when one is present', () => {
  // Prove it has teeth against a synthetic sample matching the exact bug that shipped.
  const bad = [
    'telemetry.init({ dbPool });',
    'const telemetry = require(\'./src/telemetry\');'
  ].join('\n');

  const bindings = collectTopLevelBindings(bad);
  const calls = collectTopLevelCalls(bad);
  assert.equal(bindings.get('telemetry'), 2);
  assert.equal(calls[0].name, 'telemetry');
  assert.ok(bindings.get('telemetry') > calls[0].line, 'the detector failed to flag a real TDZ violation');
});

test('the checker does not flag a correctly ordered call', () => {
  const good = [
    'const telemetry = require(\'./src/telemetry\');',
    'telemetry.init({ dbPool });'
  ].join('\n');

  const bindings = collectTopLevelBindings(good);
  const calls = collectTopLevelCalls(good);
  assert.ok(bindings.get('telemetry') < calls[0].line, 'a correctly ordered call must not be flagged');
});
