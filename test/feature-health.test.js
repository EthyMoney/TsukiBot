'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createFeatureHealth } = require('../src/feature-health');

/* --------------------------------------------

    Per-feature failure alerts: the owner hears about a broken feature from the bot,
    not from a user.

  -------------------------------------------- */

function harness(config) {
  let clock = Date.UTC(2026, 10, 18, 12, 0);
  const sent = [];
  const errors = [];
  const health = createFeatureHealth({
    send: async (payload) => { sent.push(payload.embeds[0].toJSON()); },
    logError: (msg) => errors.push(msg),
    now: () => clock,
    config
  });
  return { health, sent, errors, advance: (ms) => { clock += ms; } };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('three hard failures in a row alert once, with the last error', async () => {
  const { health, sent, errors } = harness();
  assert.equal(health.fail('/c chart', { detail: 'boom 1' }), false);
  assert.equal(health.fail('/c chart', { detail: 'boom 2' }), false);
  assert.equal(health.fail('/c chart', { detail: new Error('ReqResourceType') }), true);
  assert.equal(health.fail('/c chart', { detail: 'boom 4' }), false, 'no repeat inside the re-alert window');
  await flush();
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /\/c chart is failing/);
  assert.match(sent[0].description, /\*\*3\*\* \/c chart requests in a row failed/);
  assert.match(sent[0].description, /ReqResourceType/);
  assert.equal(errors.length, 1, 'the alert is also written to the error log');
  assert.match(errors[0], /^FEATURE FAILING: \/c chart: 3 consecutive/);
});

test('a success in between resets the streak', async () => {
  const { health, sent } = harness();
  health.fail('/c chart');
  health.fail('/c chart');
  health.ok('/c chart');
  health.fail('/c chart');
  health.fail('/c chart');
  await flush();
  assert.equal(sent.length, 0);
});

test('soft failures need a longer streak, and count towards it with hard ones', async () => {
  const { health, sent } = harness();
  for (let i = 0; i < 5; i++) assert.equal(health.fail('/c chart', { soft: true }), false);
  assert.equal(health.fail('/c chart', { soft: true }), true);
  await flush();
  assert.equal(sent.length, 1);
});

test('a failed self-test alerts on its own', async () => {
  const { health, sent } = harness();
  assert.equal(health.fail('/c chart', { selfTest: true, detail: 'no image' }), true);
  await flush();
  assert.match(sent[0].description, /scheduled self-test/);
});

test('recovery after an alert sends a note; recovery without one stays quiet', async () => {
  const { health, sent } = harness();
  health.fail('portfolio card');
  assert.equal(health.ok('portfolio card'), false);
  for (let i = 0; i < 3; i++) health.fail('/c chart');
  assert.equal(health.ok('/c chart'), true);
  await flush();
  assert.equal(sent.length, 2);
  assert.match(sent[1].title, /\/c chart is working again/);
  assert.match(sent[1].description, /failed 3 times in a row/);
});

test('a feature that stays broken re-alerts after the window', async () => {
  const { health, sent, advance } = harness({ realertHours: 6 });
  for (let i = 0; i < 3; i++) health.fail('/c chart');
  advance(5 * 3600 * 1000);
  assert.equal(health.fail('/c chart'), false);
  advance(1 * 3600 * 1000);
  assert.equal(health.fail('/c chart'), true);
  await flush();
  assert.equal(sent.length, 2);
  assert.match(sent[1].description, /\*\*5\*\*/);
});

test('features are tracked separately', async () => {
  const { health, sent } = harness();
  health.fail('/c chart');
  health.fail('/c chart');
  health.fail('portfolio card');
  await flush();
  assert.equal(sent.length, 0);
  assert.equal(health.snapshot()['/c chart'].hard, 2);
});

test('a send that throws is logged, not thrown', async () => {
  const errors = [];
  const health = createFeatureHealth({ send: async () => { throw new Error('DMs closed'); }, logError: (m) => errors.push(m) });
  assert.doesNotThrow(() => health.fail('/c chart', { selfTest: true }));
  await flush();
  assert.ok(errors.some(e => /could not send .*DMs closed/.test(e)));
});
