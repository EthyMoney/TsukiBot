'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const components = require('../src/telemetry-components');
const { REPORT_NAMES, REPORTS } = require('../src/telemetry-embeds');

/* --------------------------------------------

    The customId scheme behind the /usage buttons and menus.

    A component click arrives carrying nothing but its customId, so the whole report state has to
    survive a round trip through it, inside Discord's 100 character cap. These tests pin the
    encoding, the cap, and the menus' option rules (no duplicates, at most 25, bare command names).

  -------------------------------------------- */

test('a report state survives the customId round trip', () => {
  const state = { days: 90, limit: 25, timezone: 'America/Chicago', includeSearches: true, compare: true, image: true };
  const id = components.buildUsageCustomId('commands', state);
  assert.equal(id, 'usage:commands:90:25:America/Chicago:sci');
  const parsed = components.parseUsageCustomId(id);
  assert.equal(parsed.kind, 'report');
  assert.equal(parsed.report, 'commands');
  assert.deepEqual(parsed.state, { ...state, name: '' });
});

test('the command detail carries its command name and strips a subcommand', () => {
  const id = components.buildUsageCustomId('command', { days: 30, limit: 15, timezone: 'UTC', name: '/Portfolio show' });
  assert.equal(id, 'usage:command:30:15:UTC::portfolio');
  assert.equal(components.parseUsageCustomId(id).state.name, 'portfolio');
});

test('state is normalized before it is encoded', () => {
  const id = components.buildUsageCustomId('overview', { days: 99999, limit: -4, timezone: 'bad zone!' });
  assert.equal(id, 'usage:overview:3650:1:UTC:');
});

test('an id over Discord\'s cap is refused rather than truncated', () => {
  const long = components.buildUsageCustomId('command', { days: 3650, limit: 50, timezone: 'America/Argentina/ComodRivadavia', name: 'a'.repeat(80) });
  assert.equal(long, null);
  // The longest realistic id stays inside the cap.
  const realistic = components.buildUsageCustomId('command', { days: 3650, limit: 50, timezone: 'America/Argentina/ComodRivadavia', includeSearches: true, compare: true, image: true, name: 'portfolio' });
  assert.ok(realistic && Buffer.byteLength(realistic) <= components.CUSTOM_ID_MAX, realistic);
});

test('parseUsageCustomId rejects foreign and malformed ids', () => {
  assert.equal(components.parseUsageCustomId('chart:1d:btcusd'), null);
  assert.equal(components.parseUsageCustomId('usage:nope:30:15:UTC:'), null);
  assert.equal(components.parseUsageCustomId('usage:overview:30'), null);
  assert.equal(components.parseUsageCustomId('usage-prune:abc'), null);
  assert.equal(components.parseUsageCustomId(''), null);
  assert.equal(components.parseUsageCustomId(undefined), null);
});

test('a refresh id with a trailing marker still parses as the same report', () => {
  const parsed = components.parseUsageCustomId('usage:overview:30:15:UTC:i:r');
  assert.equal(parsed.kind, 'report');
  assert.equal(parsed.state.days, 30);
  assert.equal(parsed.state.image, true);
});

test('menu ids decode to a state and the selection is the value', () => {
  const nav = components.parseUsageCustomId('usage-nav:7:15:Europe/Berlin:c');
  assert.deepEqual(nav, { kind: 'nav', state: components.normalizeState({ days: 7, limit: 15, timezone: 'Europe/Berlin', compare: true }) });
  const drill = components.parseUsageCustomId('usage-drill:7:15:UTC:');
  assert.equal(drill.kind, 'drill');
});

test('prune ids carry the cutoff and the previewed count', () => {
  assert.deepEqual(components.parseUsageCustomId('usage-prune:90:12345'), { kind: 'prune', keepDays: 90, count: 12345 });
  assert.deepEqual(components.parseUsageCustomId('usage-prune-cancel'), { kind: 'prune-cancel' });
});

/* ---------- rows ---------- */

test('the window row has five buttons with the active window highlighted and unique ids', () => {
  const [row] = [components.buildWindowRow('overview', { days: 30, limit: 15, timezone: 'UTC', image: true })];
  const json = row.toJSON();
  assert.equal(json.components.length, 5, 'four presets and refresh is exactly one row');
  const labels = json.components.map(c => c.label);
  assert.deepEqual(labels, ['7d', '30d', '90d', '1y', '↻ Refresh']);
  const styles = json.components.map(c => c.style);
  assert.equal(styles[1], 1, 'the 30d button is Primary when the window is 30 days');
  assert.equal(styles[0], 2);
  const ids = json.components.map(c => c.custom_id);
  assert.equal(new Set(ids).size, 5, 'Discord rejects duplicate custom ids in one message');
  for (const id of ids) {
    const parsed = components.parseUsageCustomId(id);
    assert.equal(parsed.report, 'overview');
    assert.equal(parsed.state.image, true, 'every button keeps the image flag');
  }
});

test('a non-preset window highlights nothing', () => {
  const json = components.buildWindowRow('overview', { days: 45, limit: 15, timezone: 'UTC' }).toJSON();
  assert.ok(json.components.slice(0, 4).every(c => c.style === 2));
});

test('the report menu offers every report that needs no name, with the current one selected', () => {
  const json = components.buildReportMenuRow('credits', { days: 30, limit: 15, timezone: 'UTC' }).toJSON();
  const menu = json.components[0];
  assert.equal(menu.custom_id, 'usage-nav:30:15:UTC:');
  const values = menu.options.map(o => o.value);
  assert.ok(!values.includes('command'), 'the command detail needs a name and cannot be a menu target');
  assert.deepEqual(values, REPORT_NAMES.filter(n => !REPORTS[n].needsName));
  assert.ok(values.length <= 25);
  assert.equal(menu.options.find(o => o.value === 'credits').default, true);
});

test('drill-down names are bare, deduplicated and capped at 25', () => {
  const names = ['portfolio show', 'portfolio set', 'Price', '/cg', 'wat?!', ...Array.from({ length: 40 }, (_, i) => `cmd${i}`)];
  const bare = components.drillDownNames(names);
  assert.equal(bare[0], 'portfolio');
  assert.equal(bare.filter(n => n === 'portfolio').length, 1);
  assert.ok(bare.includes('price') && bare.includes('cg'));
  assert.ok(!bare.some(n => n.includes('wat')), 'a name that is not a command shape is dropped');
  assert.equal(bare.length, 25);
});

test('buildUsageComponents assembles the rows a report reply carries', () => {
  const rows = components.buildUsageComponents('commands', { days: 30, limit: 15, timezone: 'UTC' }, { commandNames: ['price', 'portfolio show'] });
  assert.equal(rows.length, 3, 'window buttons, report menu, drill-down');
  const drill = rows[2].toJSON().components[0];
  assert.equal(drill.custom_id, 'usage-drill:30:15:UTC:');
  assert.deepEqual(drill.options.map(o => o.value), ['price', 'portfolio']);

  const plain = components.buildUsageComponents('credits', { days: 7, limit: 15, timezone: 'UTC' });
  assert.equal(plain.length, 2, 'no drill-down without command names');
  assert.deepEqual(components.buildUsageComponents('nope', {}), []);
});

test('the prune confirmation names the row count and is red', () => {
  const [row] = components.buildPruneComponents(90, 12345);
  const json = row.toJSON();
  assert.equal(json.components[0].custom_id, 'usage-prune:90:12345');
  assert.equal(json.components[0].label, 'Delete 12,345 events');
  assert.equal(json.components[0].style, 4, 'ButtonStyle.Danger');
  assert.equal(json.components[1].custom_id, 'usage-prune-cancel');
  const [done] = components.buildPruneResolvedComponents('Deleted');
  assert.equal(done.toJSON().components[0].disabled, true);
});
