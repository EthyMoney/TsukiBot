'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { editDistance, formatSuggestions, looksDescriptive, normalize, suggestCoins } = require('../src/coin-suggest');

/* --------------------------------------------

    "Did you mean" matching for coin lookups that found nothing.

    The pool mirrors CoinGecko's list: popular coins have a market cap rank, and plenty of
    obscure tokens share their tickers or names. The ranking rules (a close typo beats a prefix,
    a popular coin beats an obscure one at the same distance) are what make the first suggestion
    the right one, so they are pinned here.

  -------------------------------------------- */

const POOL = [
  { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', rank: 1 },
  { id: 'ethereum', symbol: 'eth', name: 'Ethereum', rank: 2 },
  { id: 'ethereum-classic', symbol: 'etc', name: 'Ethereum Classic', rank: 40 },
  { id: 'shiba-inu', symbol: 'shib', name: 'Shiba Inu', rank: 20 },
  { id: 'dogwifcoin', symbol: 'wif', name: 'dogwifhat', rank: 60 },
  { id: 'solana', symbol: 'sol', name: 'Solana', rank: 7 },
  { id: 'solana-fake', symbol: 'sola', name: 'Solanax', rank: null },
  { id: 'etherium-scam', symbol: 'ethr', name: 'Etherium', rank: null }
];

test('normalize ignores case, spaces and punctuation', () => {
  assert.equal(normalize('Shiba-Inu '), 'shibainu');
  assert.equal(normalize('Ethereum Classic'), 'ethereumclassic');
});

test('editDistance is exact within the limit and gives up beyond it', () => {
  assert.equal(editDistance('etherium', 'ethereum', 3), 1);
  assert.equal(editDistance('kitten', 'sitting', 3), 3);
  assert.equal(editDistance('abc', 'xyzxyzxyz', 2), 3, 'returns max + 1 once it cannot fit');
});

test('a misspelling offers the real coin, and leaves out an unranked lookalike spelled exactly that way', () => {
  const ids = suggestCoins('etherium', POOL).map(c => c.id);
  assert.equal(ids[0], 'ethereum', 'one edit from a ranked coin beats an exact match on an unranked one');
  assert.ok(!ids.includes('etherium-scam'), 'unranked coins are dropped once a ranked one matches');
});

test('unranked coins are still offered when nothing ranked is close', () => {
  const [only] = suggestCoins('solanx', POOL.filter(c => c.id !== 'solana'));
  assert.equal(only.id, 'solana-fake');
  assert.equal(only.score, 2, 'one edit plus the unranked penalty');
});

test('the most popular coin wins a tie', () => {
  const [first] = suggestCoins('solan', POOL);
  assert.equal(first.id, 'solana', 'Solana (rank 7) beats Solanax (unranked) at the same distance');
});

test('a name prefix and a spaced or dashed name both match', () => {
  assert.equal(suggestCoins('shib inu', POOL)[0].id, 'shiba-inu');
  assert.equal(suggestCoins('dogwif', POOL)[0].id, 'dogwifcoin');
});

test('short queries only match near-exact tickers, not every three-letter coin', () => {
  assert.deepEqual(suggestCoins('xq', POOL), []);
  const ethTypos = suggestCoins('ehh', POOL).map(c => c.symbol);
  assert.ok(ethTypos.includes('eth'));
  assert.ok(ethTypos.length <= 3);
});

test('nothing close means no suggestions rather than a random coin', () => {
  assert.deepEqual(suggestCoins('totally unrelated words', POOL), []);
});

test('looksDescriptive spots descriptions that typo matching cannot help with', () => {
  assert.equal(looksDescriptive('the dog coin with a hat'), true);
  assert.equal(looksDescriptive('etherium'), false);
  assert.equal(looksDescriptive('averyveryverylongname'), true);
});

test('formatSuggestions reads naturally for one, two and three coins', () => {
  const coins = [{ symbol: 'eth', name: 'Ethereum' }, { symbol: 'etc', name: 'Ethereum Classic' }, { symbol: 'ethr', name: 'Etherium' }];
  assert.equal(formatSuggestions([]), '');
  assert.equal(formatSuggestions(coins.slice(0, 1)), 'Did you mean **Ethereum (ETH)**?');
  assert.equal(formatSuggestions(coins.slice(0, 2)), 'Did you mean **Ethereum (ETH)** or **Ethereum Classic (ETC)**?');
  assert.equal(formatSuggestions(coins), 'Did you mean **Ethereum (ETH)**, **Ethereum Classic (ETC)** or **Etherium (ETHR)**?');
});
