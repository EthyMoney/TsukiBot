'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* --------------------------------------------

    Slash command registry checks.

    deploy-commands.js exports its command array and only registers with Discord when run
    directly, so requiring it here builds every SlashCommandBuilder without any network calls.

    The value of this file is drift: main.js dispatches commands from a switch statement, and
    deploy-commands.js declares them separately. Nothing but these tests connects the two, so a
    command registered with Discord but missing a handler (or the reverse) would otherwise only
    show up as a silent no-op in production.

  -------------------------------------------- */

const { commands, globalCommands, ownerGuildCommands, OWNER_ONLY_COMMANDS } = require('../deploy-commands.js');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

// Pull the command names the interactionCreate switch actually handles.
//
// Anchored to the outer switch's exact indentation (6 spaces). /price contains a nested
// `switch (exchange)` whose cases are exchange names rather than commands, and those sit deeper,
// so matching on indentation is what keeps them out.
const OUTER_CASE_PATTERN = /^ {6}case '([a-z0-9-]+)':/gm;

function getHandledCommandNames() {
  const switchStart = mainSource.indexOf('switch (command) {');
  assert.notEqual(switchStart, -1, 'could not find the command switch in main.js');
  const switchBody = mainSource.slice(switchStart, mainSource.indexOf('\n  } catch', switchStart));

  const names = new Set();
  for (const match of switchBody.matchAll(OUTER_CASE_PATTERN)) {
    names.add(match[1]);
  }
  assert.ok(names.size > 20, `only found ${names.size} command cases, the extraction pattern is probably stale`);
  return names;
}

test('every command has a unique name', () => {
  const names = commands.map(c => c.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  assert.deepEqual(duplicates, [], `duplicate command names: ${duplicates.join(', ')}`);
});

test('every command name and description satisfies Discord constraints', () => {
  for (const command of commands) {
    assert.match(command.name, /^[a-z0-9-]{1,32}$/, `invalid command name: ${command.name}`);
    assert.ok(command.description.length > 0 && command.description.length <= 100,
      `description for /${command.name} must be 1-100 chars, got ${command.description.length}`);
  }
});

test('every option name and description satisfies Discord constraints', () => {
  const checkOptions = (options, trail) => {
    for (const option of options || []) {
      assert.match(option.name, /^[a-z0-9_-]{1,32}$/, `invalid option name: ${trail}.${option.name}`);
      assert.ok(option.description.length > 0 && option.description.length <= 100,
        `description for ${trail}.${option.name} must be 1-100 chars`);
      checkOptions(option.options, `${trail}.${option.name}`);
    }
  };
  for (const command of commands) {
    checkOptions(command.options, `/${command.name}`);
  }
});

test('required options come before optional ones', () => {
  // Discord rejects a command outright if an optional option precedes a required one.
  const checkOrder = (options, trail) => {
    let seenOptional = false;
    for (const option of options || []) {
      // Subcommands and groups (types 1 and 2) carry their own option lists.
      if (option.type === 1 || option.type === 2) {
        checkOrder(option.options, `${trail} ${option.name}`);
        continue;
      }
      if (option.required) {
        assert.ok(!seenOptional, `${trail}: required option "${option.name}" comes after an optional one`);
      }
      else {
        seenOptional = true;
      }
    }
  };
  for (const command of commands) {
    checkOrder(command.options, `/${command.name}`);
  }
});

test('every registered command has a handler in the main.js switch', () => {
  const handled = getHandledCommandNames();
  const missing = commands.map(c => c.name).filter(name => !handled.has(name));
  assert.deepEqual(missing, [], `registered with Discord but not handled in main.js: ${missing.join(', ')}`);
});

test('every handled command is registered with Discord', () => {
  const registered = new Set(commands.map(c => c.name));
  const orphaned = [...getHandledCommandNames()].filter(name => !registered.has(name));
  assert.deepEqual(orphaned, [], `handled in main.js but never registered: ${orphaned.join(', ')}`);
});

test('autocomplete is only enabled on string options, and the handler exists', () => {
  const autocompleteOptions = [];
  const collect = (options, trail) => {
    for (const option of options || []) {
      if (option.autocomplete) {
        // Type 3 is STRING. Discord rejects autocomplete on any other option type.
        assert.equal(option.type, 3, `${trail}.${option.name} has autocomplete but is not a string option`);
        assert.ok(!option.choices || option.choices.length === 0,
          `${trail}.${option.name} cannot have both autocomplete and fixed choices`);
        autocompleteOptions.push(`${trail}.${option.name}`);
      }
      collect(option.options, `${trail} ${option.name}`);
    }
  };
  for (const command of commands) {
    collect(command.options, `/${command.name}`);
  }

  assert.ok(autocompleteOptions.length > 0, 'expected at least one autocomplete option');
  assert.match(mainSource, /interaction\.isAutocomplete\(\)/,
    'commands declare autocomplete but main.js has no isAutocomplete handler');
});

/* --------------------------------------------

    Chart button customId round trip.

    buildChartControls encodes the query into a button customId and handleChartButton decodes it.
    An exchange-qualified pair contains a colon of its own, which a naive destructuring split
    silently truncated, so the round trip is pinned here.

  -------------------------------------------- */

// Mirrors the decode in main.js handleChartButton. Kept in sync manually until the module split.
function decodeChartCustomId(customId) {
  const parts = customId.split(':');
  return { timeframe: parts[1], baseQuery: parts.slice(2).join(':') };
}

test('chart button customId survives a plain pair', () => {
  const decoded = decodeChartCustomId('chart:4h:btcusd rsi');
  assert.equal(decoded.timeframe, '4h');
  assert.equal(decoded.baseQuery, 'btcusd rsi');
});

test('chart button customId survives an exchange-qualified pair', () => {
  const decoded = decodeChartCustomId('chart:1d:binance:btcusdt macd');
  assert.equal(decoded.timeframe, '1d');
  assert.equal(decoded.baseQuery, 'binance:btcusdt macd', 'the pair after the exchange prefix must not be dropped');
});

test('main.js decodes chart customIds with a rejoining split, not a bare destructure', () => {
  // A plain `const [, timeframe, baseQuery] = customId.split(':')` drops everything after the
  // second colon. Guard against that regression reappearing.
  const handlerStart = mainSource.indexOf('async function handleChartButton');
  assert.notEqual(handlerStart, -1, 'handleChartButton not found in main.js');
  const handlerBody = mainSource.slice(handlerStart, handlerStart + 800);
  assert.doesNotMatch(handlerBody, /\[\s*,\s*timeframe\s*,\s*baseQuery\s*\]\s*=\s*interaction\.customId\.split/,
    'handleChartButton uses a destructuring split, which truncates exchange-qualified pairs');
  assert.match(handlerBody, /slice\(2\)\.join\(':'\)/,
    'handleChartButton should rejoin the query tail after splitting on colons');
});

/* --------------------------------------------

    Registration scope.

    /usage reports activity across every server the bot is in, so it must not be a global command.
    default_member_permissions is not a substitute: Discord treats it as a default that any server
    admin can override in their integration settings, and it does not apply in DMs at all, where an
    unset dm_permission defaults to true. A global /usage would therefore be visible to every admin
    everywhere and to everyone in DMs.

    Scoping it to a single guild is what actually restricts it, and these tests keep it that way.

  -------------------------------------------- */

test('owner-only commands are excluded from the global registration', () => {
  for (const name of OWNER_ONLY_COMMANDS) {
    assert.ok(!globalCommands.some(c => c.name === name),
      `/${name} is owner-only but would be registered globally, making it visible to every ` +
      'server admin and to everyone in DMs');
  }
});

test('owner-only commands are registered to the owner guild instead', () => {
  const scoped = ownerGuildCommands.map(c => c.name);
  for (const name of OWNER_ONLY_COMMANDS) {
    assert.ok(scoped.includes(name), `/${name} is owner-only but is not registered anywhere`);
  }
});

test('the two registration sets partition the full command list', () => {
  // Neither dropped nor double-registered: a command in both would exist twice in the owner guild.
  assert.equal(globalCommands.length + ownerGuildCommands.length, commands.length);

  const overlap = globalCommands.filter(g => ownerGuildCommands.some(o => o.name === g.name));
  assert.deepEqual(overlap.map(c => c.name), [], 'a command must not be in both sets');

  const covered = new Set([...globalCommands, ...ownerGuildCommands].map(c => c.name));
  const missing = commands.map(c => c.name).filter(n => !covered.has(n));
  assert.deepEqual(missing, [], `not registered anywhere: ${missing.join(', ')}`);
});

test('/usage is the command being scoped', () => {
  // Guards against OWNER_ONLY_COMMANDS being emptied and these tests passing vacuously.
  assert.ok(OWNER_ONLY_COMMANDS.has('usage'), '/usage must stay owner-only');
  assert.ok(OWNER_ONLY_COMMANDS.size > 0);
});

test('owner-only commands still carry a restrictive permission default', () => {
  // Belt and braces: guild scoping is the real gate, but inside that one guild the command should
  // not be offered to every member either.
  for (const command of ownerGuildCommands) {
    assert.ok(command.default_member_permissions,
      `/${command.name} should still set default_member_permissions inside the owner guild`);
  }
});
