'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ENS_REGISTRY, getEnsOwner, hexToNumber, isAddress, namehash } = require('../src/util/ethereum');

/* --------------------------------------------

    These replaced web3.js, so the vectors below are the published ones (EIP-137 for namehash,
    EIP-55 for checksums) rather than whatever the implementation happens to return. A wrong
    namehash does not fail loudly: it just makes every ENS name look unregistered.

  -------------------------------------------- */

test('namehash matches the EIP-137 vectors', () => {
  assert.equal(namehash(''), '0x' + '0'.repeat(64));
  assert.equal(namehash('eth'), '0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae');
  assert.equal(namehash('foo.eth'), '0xde9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f');
});

test('namehash normalizes case before hashing, as ENS resolution does', () => {
  assert.equal(namehash('Foo.ETH'), namehash('foo.eth'));
});

test('namehash rejects a name that cannot be normalized', () => {
  assert.throws(() => namehash('foo..eth'));
});

test('isAddress accepts valid EIP-55 checksummed addresses', () => {
  for (const address of [
    '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
    '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
    '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb'
  ]) {
    assert.equal(isAddress(address), true, address);
  }
});

test('isAddress skips the checksum for single-case input and allows a missing 0x', () => {
  assert.equal(isAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'), true);
  assert.equal(isAddress('0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED'), true);
  assert.equal(isAddress('5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'), true);
});

test('isAddress rejects a bad checksum, wrong length, non-hex and non-strings', () => {
  assert.equal(isAddress('0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'), false);
  assert.equal(isAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1bea'), false);
  assert.equal(isAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaeg'), false);
  assert.equal(isAddress('BTC'), false);
  assert.equal(isAddress(null), false);
});

test('hexToNumber parses JSON-RPC quantities and refuses anything else', () => {
  assert.equal(hexToNumber('0x0'), 0);
  assert.equal(hexToNumber('0x1406f40'), 21000000);
  assert.throws(() => hexToNumber('21000000'), TypeError);
  assert.throws(() => hexToNumber('0x'), TypeError);
  assert.throws(() => hexToNumber(undefined), TypeError);
});

/** A fetch stand-in that records the request and answers with the given status and body. */
function fakeFetch(status, body) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { impl, calls };
}

test('getEnsOwner calls owner(namehash) on the registry and checksums the result', async () => {
  const { impl, calls } = fakeFetch(200, { jsonrpc: '2.0', id: 1, result: '0x' + '0'.repeat(24) + 'd8da6bf26964af9d7eed9e03e53415d37aa96045' });
  const owner = await getEnsOwner('https://rpc.example/key', 'foo.eth', impl);
  assert.equal(owner, '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.method, 'eth_call');
  assert.equal(sent.params[0].to, ENS_REGISTRY);
  assert.equal(sent.params[0].data, '0x02571be3' + namehash('foo.eth').slice(2));
  assert.equal(sent.params[1], 'latest');
});

test('getEnsOwner returns the zero address for an unregistered name', async () => {
  const { impl } = fakeFetch(200, { jsonrpc: '2.0', id: 1, result: '0x' + '0'.repeat(64) });
  assert.equal(await getEnsOwner('https://rpc.example/key', 'unregistered.eth', impl), '0x' + '0'.repeat(40));
});

test('getEnsOwner errors never include the endpoint URL, which carries the API key', async () => {
  const url = 'https://rpc.example/secret-key';
  for (const [status, body] of [
    [500, {}],
    [200, { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'rate limited' } }],
    [200, { jsonrpc: '2.0', id: 1, result: '0x1234' }]
  ]) {
    await assert.rejects(getEnsOwner(url, 'foo.eth', fakeFetch(status, body).impl), err => {
      assert.ok(!err.message.includes('secret-key'), err.message);
      return true;
    });
  }
});
