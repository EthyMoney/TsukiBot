'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  abbreviateNumber, capitalizeFirstLetter, chunkString, formatUsd, formatUsdAmount,
  isAlphaNumeric, numberWithCommas, respectBracketsSpaceSplit, sleep, trimDecimalPlaces, validURL
} = require('../src/util/format');

/* --------------------------------------------

    These helpers shape every price message the bot sends, so a regression here is invisible
    until users notice the numbers look wrong. Several tests below pin behavior that is
    surprising but deliberate (see the comments) so that a future refactor cannot quietly
    "fix" it without someone making that call on purpose.

  -------------------------------------------- */

test('trimDecimalPlaces shortens values above 10 to two decimals', () => {
  assert.equal(trimDecimalPlaces(1234.56789), '1234.57');
  assert.equal(trimDecimalPlaces('99.999'), '100.00');
});

test('trimDecimalPlaces preserves precision at or below 10', () => {
  // Sub-$10 tokens are exactly where the extra decimals matter, so they pass through untouched.
  assert.equal(trimDecimalPlaces(0.00001234), 0.00001234);
  assert.equal(trimDecimalPlaces(10), 10);
});

test('trimDecimalPlaces passes through values with no decimal point', () => {
  assert.equal(trimDecimalPlaces(1500), 1500);
  assert.equal(trimDecimalPlaces('42'), '42');
});

test('numberWithCommas groups thousands', () => {
  assert.equal(numberWithCommas(1000), '1,000');
  assert.equal(numberWithCommas(1234567), '1,234,567');
  assert.equal(numberWithCommas(999), '999');
});

test('numberWithCommas groups only the integer part', () => {
  assert.equal(numberWithCommas(1234567.891), '1,234,567.89');
});

test('numberWithCommas handles negatives', () => {
  assert.equal(numberWithCommas(-1234567), '-1,234,567');
});

test('abbreviateNumber compacts by magnitude', () => {
  assert.equal(abbreviateNumber(1234, 0), '1.2k');
  assert.equal(abbreviateNumber(1234567, 0), '1.2m');
  assert.equal(abbreviateNumber(1234567890, 0), '1.2b');
  assert.equal(abbreviateNumber(1234567890123, 0), '1.2t');
});

test('abbreviateNumber honors the extra precision argument', () => {
  assert.equal(abbreviateNumber(1250000, 1), '1.25m');
});

test('abbreviateNumber terminates early on null and zero', () => {
  assert.equal(abbreviateNumber(null, 2), null);
  assert.equal(abbreviateNumber(0, 2), '0');
});

test('abbreviateNumber leaves most sub-thousand values unabbreviated', () => {
  assert.equal(abbreviateNumber(500, 0), '500');
  assert.equal(abbreviateNumber(99, 0), '99');
});

test('abbreviateNumber rounds values just under a magnitude boundary up to it', () => {
  // Characterization of a long-standing quirk: the magnitude comes from toPrecision(2), so 999
  // rounds to 1.0e+3 and reports as "1k". Harmless where it is used (market cap and volume
  // summaries), but pinned here so nobody is surprised by it later.
  assert.equal(abbreviateNumber(999, 0), '1k');
});

test('formatUsd keeps two decimals at or above a dollar', () => {
  assert.equal(formatUsd(1), '$1.00');
  assert.equal(formatUsd(65432.1), '$65,432.10');
});

test('formatUsd keeps small prices readable instead of rounding to zero', () => {
  // The whole point: a sub-cent token must not render as "$0.00".
  assert.equal(formatUsd(0.00001234), '$0.00001234');
});

test('formatUsd reports missing values rather than NaN', () => {
  assert.equal(formatUsd(null), 'n/a');
  assert.equal(formatUsd(undefined), 'n/a');
  assert.equal(formatUsd(NaN), 'n/a');
});

test('formatUsd handles zero', () => {
  assert.equal(formatUsd(0), '$0.00000000');
});

test('formatUsdAmount always uses two decimals, unlike formatUsd', () => {
  // This is the distinction: formatUsd keeps precision for sub-dollar coin PRICES, while
  // formatUsdAmount is for money totals. A 25 cent portfolio move must not read $0.25032095.
  assert.equal(formatUsdAmount(0.25032095), '$0.25');
  assert.equal(formatUsd(0.25032095), '$0.25032095');
});

test('formatUsdAmount groups thousands', () => {
  assert.equal(formatUsdAmount(1234567.891), '$1,234,567.89');
  assert.equal(formatUsdAmount(21.107), '$21.11');
});

test('formatUsdAmount handles zero and missing values', () => {
  assert.equal(formatUsdAmount(0), '$0.00');
  assert.equal(formatUsdAmount(null), 'n/a');
  assert.equal(formatUsdAmount(undefined), 'n/a');
  assert.equal(formatUsdAmount(NaN), 'n/a');
});

test('respectBracketsSpaceSplit splits on spaces', () => {
  assert.deepEqual(respectBracketsSpaceSplit('btc eth ada'), ['btc', 'eth', 'ada']);
});

test('respectBracketsSpaceSplit keeps bracketed groups together', () => {
  assert.deepEqual(respectBracketsSpaceSplit('a [b c] d'), ['a', '[b c]', 'd']);
});

test('respectBracketsSpaceSplit escapes embedded double quotes', () => {
  assert.deepEqual(respectBracketsSpaceSplit('say"hi'), ['say\\"hi']);
});

test('chunkString keeps chunks within the limit without splitting words', () => {
  const chunks = chunkString('aaa bbb ccc ddd eee', 7);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 7, `chunk "${chunk}" exceeds the limit`);
  }
  assert.equal(chunks.join(' '), 'aaa bbb ccc ddd eee', 'no content may be lost');
});

test('chunkString returns a single chunk when everything fits', () => {
  assert.deepEqual(chunkString('short text', 100), ['short text']);
});

test('isAlphaNumeric accepts letters and digits only', () => {
  assert.equal(isAlphaNumeric('BTC123'), true);
  assert.equal(isAlphaNumeric('btc-usd'), false);
  assert.equal(isAlphaNumeric('btc usd'), false);
  assert.equal(isAlphaNumeric('0x1f98'), true);
});

test('isAlphaNumeric treats an empty string as valid', () => {
  // Characterization: callers combine this with a truthiness check, so the empty case never
  // reaches it in practice. Pinned so the behavior is not changed by accident.
  assert.equal(isAlphaNumeric(''), true);
});

test('validURL accepts real links with and without a protocol', () => {
  assert.equal(validURL('https://i.imgur.com/abc.png'), true);
  assert.equal(validURL('imgur.com/abc'), true);
  assert.equal(validURL('http://127.0.0.1:8080/path?q=1#frag'), true);
});

test('validURL rejects non-links', () => {
  assert.equal(validURL('not a url'), false);
  assert.equal(validURL('mytag'), false);
});

test('capitalizeFirstLetter uppercases only the first character', () => {
  assert.equal(capitalizeFirstLetter('bitcoin'), 'Bitcoin');
  assert.equal(capitalizeFirstLetter('BTC'), 'BTC');
  assert.equal(capitalizeFirstLetter(''), '');
});

test('sleep resolves after roughly the requested delay', async () => {
  const start = Date.now();
  await sleep(30);
  // Timers are allowed to fire a hair early on some platforms, so allow a small margin.
  assert.ok(Date.now() - start >= 25, 'sleep returned too early');
});
