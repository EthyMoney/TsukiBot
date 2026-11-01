/* ------------------------------------------------------------------------
 *
 *                       TsukiBot - src/util/ethereum.js
 *
 * The few Ethereum helpers the bot needs: reading a hex quantity, spotting an
 * address, and looking up who owns an ENS name.
 *
 * These replace web3.js, which the bot only used for those three things.
 * web3.js was archived by its maintainers in March 2025 and pins zod 3, which
 * has an advisory that is only fixed in zod 4 (GHSA-mrhx-c7xc-m3w5), so the
 * whole web3 tree would have stayed flagged for good. Hashing uses Node's
 * built-in keccak-256 (OpenSSL 3.2+), and names are normalized with
 * @adraffy/ens-normalize, the same library web3.js used for it.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const crypto = require('crypto');
const { ens_normalize } = require('@adraffy/ens-normalize');

/** The ENS registry contract, at the same address on mainnet since 2020. */
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

/** Function selector of the registry's owner(bytes32). */
const OWNER_SELECTOR = '02571be3';

/** How long an ENS lookup may take before the caller gets an error instead of a hung reply. */
const RPC_TIMEOUT_MS = 10000;

/**
 * @param {string|Buffer} data a string is hashed as UTF-8
 * @returns {Buffer}
 */
function keccak256(data) {
  return crypto.createHash('keccak-256').update(data).digest();
}

/**
 * Parses a 0x-prefixed hex quantity, as JSON-RPC returns block numbers.
 * @param {string} hex
 * @returns {number}
 */
function hexToNumber(hex) {
  if (typeof hex !== 'string' || !/^0x[0-9a-f]+$/i.test(hex)) {
    throw new TypeError(`Not a hex quantity: ${hex}`);
  }
  return Number(BigInt(hex));
}

/**
 * Applies EIP-55 mixed-case checksumming to 40 hex characters.
 * @param {string} hex no 0x prefix, any case
 * @returns {string} with 0x prefix
 */
function checksum(hex) {
  const lower = hex.toLowerCase();
  const hash = keccak256(lower).toString('hex');
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

/**
 * Whether a value is an Ethereum address, with the same rules web3.js used:
 * 40 hex characters with an optional 0x, and if the letters are mixed case they
 * must carry a valid EIP-55 checksum. All-lower or all-upper skips the check.
 * @param {*} value
 * @returns {boolean}
 */
function isAddress(value) {
  if (typeof value !== 'string' || !/^(0x)?[0-9a-f]{40}$/i.test(value)) return false;
  const hex = value.replace(/^0x/i, '');
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) return true;
  return checksum(hex).slice(2) === hex;
}

/**
 * ENS namehash of a name, after ENSIP-15 normalization. Throws on a name that
 * cannot be normalized (disallowed characters, empty labels and so on).
 * @param {string} name e.g. 'vitalik.eth'
 * @returns {string} 0x-prefixed 32-byte hash
 */
function namehash(name) {
  let node = Buffer.alloc(32);
  const normalized = name ? ens_normalize(name) : '';
  if (normalized) {
    for (const label of normalized.split('.').reverse()) {
      node = keccak256(Buffer.concat([node, keccak256(label)]));
    }
  }
  return '0x' + node.toString('hex');
}

/**
 * Owner of an ENS name in the registry, read with a single eth_call. An
 * unregistered name returns the zero address, as web3's ens.getOwner did.
 * @param {string} rpcUrl an Ethereum mainnet JSON-RPC endpoint
 * @param {string} name
 * @param {typeof fetch} [fetchImpl] injectable for tests
 * @returns {Promise<string>} checksummed owner address
 */
async function getEnsOwner(rpcUrl, name, fetchImpl = fetch) {
  const res = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: ENS_REGISTRY, data: '0x' + OWNER_SELECTOR + namehash(name).slice(2) }, 'latest']
    }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS)
  });
  // The endpoint URL carries the Infura key, so no error here may include it.
  if (!res.ok) throw new Error(`ENS lookup failed with HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`ENS lookup failed: ${body.error.message || body.error.code}`);
  if (typeof body.result !== 'string' || !/^0x[0-9a-f]{64}$/i.test(body.result)) {
    throw new Error('ENS lookup returned an unexpected result');
  }
  return checksum(body.result.slice(-40));
}

module.exports = {
  ENS_REGISTRY,
  getEnsOwner,
  hexToNumber,
  isAddress,
  namehash
};
