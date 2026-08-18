'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CoinGeckoOnchainError,
  getApiConfig,
  isLikelyContractAddress,
  lookupOnchainToken
} = require('../coingecko-onchain.js');

const PUBLIC_API_BASE_URL = 'https://api.coingecko.com/api/v3';
const PRO_API_BASE_URL = 'https://pro-api.coingecko.com/api/v3';
const GECKOTERMINAL_API_BASE_URL = 'https://api.geckoterminal.com/api/v2';

// A real checksummed EVM address. GeckoTerminal returns addresses lowercased, so the fixtures
// below deliberately use the lowercase form to exercise the case-insensitive matching.
const ADDRESS = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
const ADDRESS_LOWER = ADDRESS.toLowerCase();
const TOKEN_ID_ETH = `eth_${ADDRESS_LOWER}`;
const TOKEN_ID_BASE = `base_${ADDRESS_LOWER}`;

/* --------------------------------------------

    Test doubles

  -------------------------------------------- */

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    json: async () => body
  };
}

// Returns a fetch stub that hands back the queued responses in order and records every call it
// received, so tests can assert on the exact URLs and headers the module built.
function createFetchStub(queue) {
  const calls = [];
  const remaining = queue.slice();

  const fetchImpl = async (url, init) => {
    calls.push({ url: url, init: init });
    if (remaining.length === 0) {
      throw new Error(`Unexpected extra fetch call: ${url}`);
    }
    const next = remaining.shift();
    if (next instanceof Error) throw next;
    return next;
  };

  fetchImpl.calls = calls;
  fetchImpl.remaining = remaining;
  return fetchImpl;
}

/* --------------------------------------------

    Fixtures matching the shapes the module actually parses

  -------------------------------------------- */

// Two pools hold the same token on two different networks. The Base pool has far more liquidity,
// so getTokenAndNetwork should pick it. A third, unrelated token is included as noise.
function searchPoolsFixture() {
  return {
    data: [
      {
        id: 'eth_pool_small',
        type: 'pool',
        attributes: { reserve_in_usd: '1000.5' },
        relationships: {
          base_token: { data: { id: TOKEN_ID_ETH } },
          network: { data: { id: 'eth' } }
        }
      },
      {
        id: 'base_pool_big',
        type: 'pool',
        attributes: { reserve_in_usd: '9000000' },
        relationships: {
          quote_token: { data: { id: TOKEN_ID_BASE } },
          network: { data: { id: 'base' } }
        }
      }
    ],
    included: [
      {
        id: TOKEN_ID_ETH,
        type: 'token',
        attributes: { address: ADDRESS_LOWER, name: 'Uniswap', symbol: 'UNI' }
      },
      {
        id: TOKEN_ID_BASE,
        type: 'token',
        attributes: { address: ADDRESS_LOWER, name: 'Uniswap', symbol: 'UNI' }
      },
      {
        id: 'eth_0xdac17f958d2ee523a2206206994597c13d831ec7',
        type: 'token',
        attributes: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', name: 'Tether', symbol: 'USDT' }
      }
    ]
  };
}

function tokenFixture(overrides = {}) {
  return {
    data: {
      id: TOKEN_ID_BASE,
      type: 'token',
      attributes: Object.assign({
        address: ADDRESS_LOWER,
        name: 'Uniswap',
        symbol: 'UNI',
        price_usd: '7.5',
        market_cap_usd: '4500000000',
        volume_usd: { h24: '123456.78' }
      }, overrides)
    },
    // The non-pool entry comes first on purpose so the `find(item => item.type === 'pool')` is
    // genuinely doing work rather than just grabbing element zero.
    included: [
      { id: TOKEN_ID_BASE, type: 'token', attributes: { address: ADDRESS_LOWER } },
      {
        id: 'base_pool_big',
        type: 'pool',
        attributes: { price_change_percentage: { h24: '-3.25' } }
      }
    ]
  };
}

/* --------------------------------------------

    getApiConfig

  -------------------------------------------- */

test('getApiConfig: env pro key wins over every other credential', () => {
  const config = getApiConfig(
    { coingeckoPro: 'keys-pro', coingecko: 'keys-demo', coingeckoDemo: 'keys-demo-alt' },
    { COINGECKO_PRO_API_KEY: 'env-pro', COINGECKO_API_KEY: 'env-demo' }
  );

  assert.equal(config.baseUrl, PRO_API_BASE_URL);
  assert.deepEqual(config.headers, { 'x-cg-pro-api-key': 'env-pro' });
});

test('getApiConfig: keys.coingeckoPro beats any demo key', () => {
  const config = getApiConfig(
    { coingeckoPro: 'keys-pro', coingecko: 'keys-demo' },
    { COINGECKO_API_KEY: 'env-demo' }
  );

  assert.equal(config.baseUrl, PRO_API_BASE_URL);
  assert.deepEqual(config.headers, { 'x-cg-pro-api-key': 'keys-pro' });
  assert.equal(Object.prototype.hasOwnProperty.call(config.headers, 'x-cg-demo-api-key'), false);
});

test('getApiConfig: env demo key is used when no pro key exists', () => {
  const config = getApiConfig({ coingecko: 'keys-demo' }, { COINGECKO_API_KEY: 'env-demo' });

  assert.equal(config.baseUrl, PUBLIC_API_BASE_URL);
  assert.deepEqual(config.headers, { 'x-cg-demo-api-key': 'env-demo' });
});

test('getApiConfig: keys.coingecko is preferred over keys.coingeckoDemo', () => {
  const config = getApiConfig({ coingecko: 'keys-demo', coingeckoDemo: 'keys-demo-alt' }, {});

  assert.equal(config.baseUrl, PUBLIC_API_BASE_URL);
  assert.deepEqual(config.headers, { 'x-cg-demo-api-key': 'keys-demo' });
});

test('getApiConfig: keys.coingeckoDemo is the last demo fallback', () => {
  const config = getApiConfig({ coingeckoDemo: 'keys-demo-alt' }, {});

  assert.equal(config.baseUrl, PUBLIC_API_BASE_URL);
  assert.deepEqual(config.headers, { 'x-cg-demo-api-key': 'keys-demo-alt' });
});

test('getApiConfig: falls back to keyless GeckoTerminal with no headers', () => {
  const config = getApiConfig({}, {});

  assert.equal(config.baseUrl, GECKOTERMINAL_API_BASE_URL);
  assert.deepEqual(config.headers, {});
});

test('getApiConfig: empty-string credentials are treated as absent', () => {
  const config = getApiConfig({ coingeckoPro: '', coingecko: '' }, { COINGECKO_PRO_API_KEY: '', COINGECKO_API_KEY: '' });

  assert.equal(config.baseUrl, GECKOTERMINAL_API_BASE_URL);
  assert.deepEqual(config.headers, {});
});

/* --------------------------------------------

    isLikelyContractAddress

  -------------------------------------------- */

test('isLikelyContractAddress: accepts a valid 0x EVM address', () => {
  assert.equal(isLikelyContractAddress(ADDRESS), true);
  assert.equal(isLikelyContractAddress(ADDRESS_LOWER), true);
  assert.equal(isLikelyContractAddress(`  ${ADDRESS}  `), true);
});

test('isLikelyContractAddress: accepts a Solana-length base58 string', () => {
  assert.equal(isLikelyContractAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), true);
  assert.equal(isLikelyContractAddress('So11111111111111111111111111111111111111112'), true);
});

test('isLikelyContractAddress: rejects strings that are too short', () => {
  assert.equal(isLikelyContractAddress(''), false);
  assert.equal(isLikelyContractAddress('btc'), false);
  assert.equal(isLikelyContractAddress('0x1234'), false);
  // 31 characters: one below the non-EVM minimum.
  assert.equal(isLikelyContractAddress('a'.repeat(31)), false);
  assert.equal(isLikelyContractAddress('a'.repeat(32)), true);
});

test('isLikelyContractAddress: rejects strings longer than 128 characters', () => {
  assert.equal(isLikelyContractAddress('a'.repeat(128)), true);
  assert.equal(isLikelyContractAddress('a'.repeat(129)), false);
});

test('isLikelyContractAddress: rejects strings containing whitespace', () => {
  assert.equal(isLikelyContractAddress('a'.repeat(20) + ' ' + 'b'.repeat(20)), false);
  assert.equal(isLikelyContractAddress('a'.repeat(20) + '\t' + 'b'.repeat(20)), false);
  assert.equal(isLikelyContractAddress('a'.repeat(20) + '\n' + 'b'.repeat(20)), false);
});

test('isLikelyContractAddress: rejects non-strings', () => {
  assert.equal(isLikelyContractAddress(undefined), false);
  assert.equal(isLikelyContractAddress(null), false);
  assert.equal(isLikelyContractAddress(1234567890), false);
  assert.equal(isLikelyContractAddress(12345678901234567890n), false);
  assert.equal(isLikelyContractAddress({ address: ADDRESS }), false);
  assert.equal(isLikelyContractAddress([ADDRESS]), false);
});

/* --------------------------------------------

    lookupOnchainToken

  -------------------------------------------- */

test('lookupOnchainToken: rejects a bad address before making any request', async () => {
  const fetchImpl = createFetchStub([]);

  await assert.rejects(
    () => lookupOnchainToken('btc', { fetchImpl: fetchImpl }),
    (err) => {
      assert.ok(err instanceof CoinGeckoOnchainError);
      assert.match(err.message, /valid token contract address/);
      return true;
    }
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test('lookupOnchainToken: normalizes a successful two-call lookup', async () => {
  const fetchImpl = createFetchStub([
    jsonResponse(searchPoolsFixture()),
    jsonResponse(tokenFixture())
  ]);
  const apiConfig = { baseUrl: PUBLIC_API_BASE_URL, headers: { 'x-cg-demo-api-key': 'demo-key' } };

  const result = await lookupOnchainToken(ADDRESS, { fetchImpl: fetchImpl, apiConfig: apiConfig });

  assert.deepEqual(result, {
    address: ADDRESS_LOWER,
    name: 'Uniswap',
    symbol: 'UNI',
    // The Base pool holds far more reserve than the Ethereum one, so it wins the sort.
    network: 'base',
    priceUsd: 7.5,
    priceChange24h: -3.25,
    marketCapUsd: 4500000000,
    volume24hUsd: 123456.78
  });

  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(
    fetchImpl.calls[0].url,
    `${PUBLIC_API_BASE_URL}/onchain/search/pools?query=${ADDRESS}&include=base_token%2Cquote_token`
  );
  assert.equal(
    fetchImpl.calls[1].url,
    `${PUBLIC_API_BASE_URL}/onchain/networks/base/tokens/${ADDRESS}?include=top_pools`
  );
  assert.deepEqual(fetchImpl.calls[0].init.headers, {
    accept: 'application/json',
    'x-cg-demo-api-key': 'demo-key'
  });
});

test('lookupOnchainToken: derives the network from the token id when the pool omits it', async () => {
  const search = searchPoolsFixture();
  // Keep only the Ethereum pool and strip its network relationship, forcing the id-prefix fallback.
  search.data = [search.data[0]];
  delete search.data[0].relationships.network;

  const fetchImpl = createFetchStub([
    jsonResponse(search),
    jsonResponse(tokenFixture())
  ]);

  const result = await lookupOnchainToken(ADDRESS, {
    fetchImpl: fetchImpl,
    apiConfig: { baseUrl: GECKOTERMINAL_API_BASE_URL, headers: {} }
  });

  assert.equal(result.network, 'eth');
  assert.equal(
    fetchImpl.calls[1].url,
    `${GECKOTERMINAL_API_BASE_URL}/networks/eth/tokens/${ADDRESS}?include=top_pools`
  );
});

test('lookupOnchainToken: maps missing optional fields to null', async () => {
  const token = tokenFixture({ market_cap_usd: null, volume_usd: {} });
  token.included = [];

  const fetchImpl = createFetchStub([
    jsonResponse(searchPoolsFixture()),
    jsonResponse(token)
  ]);

  const result = await lookupOnchainToken(ADDRESS, {
    fetchImpl: fetchImpl,
    apiConfig: { baseUrl: GECKOTERMINAL_API_BASE_URL, headers: {} }
  });

  assert.equal(result.marketCapUsd, null);
  assert.equal(result.volume24hUsd, null);
  assert.equal(result.priceChange24h, null);
  assert.equal(result.priceUsd, 7.5);
});

test('lookupOnchainToken: a 404 becomes a CoinGeckoOnchainError carrying the status', async () => {
  const fetchImpl = createFetchStub([jsonResponse({}, 404)]);

  await assert.rejects(
    () => lookupOnchainToken(ADDRESS, {
      fetchImpl: fetchImpl,
      apiConfig: { baseUrl: GECKOTERMINAL_API_BASE_URL, headers: {} }
    }),
    (err) => {
      assert.ok(err instanceof CoinGeckoOnchainError);
      assert.equal(err.name, 'CoinGeckoOnchainError');
      assert.equal(err.status, 404);
      assert.equal(err.message, 'No onchain token was found for that contract address.');
      return true;
    }
  );
  assert.equal(fetchImpl.calls.length, 1);
});

test('lookupOnchainToken: a search with no matching token errors without a second call', async () => {
  const fetchImpl = createFetchStub([jsonResponse({ data: [], included: [] })]);

  await assert.rejects(
    () => lookupOnchainToken(ADDRESS, {
      fetchImpl: fetchImpl,
      apiConfig: { baseUrl: GECKOTERMINAL_API_BASE_URL, headers: {} }
    }),
    (err) => {
      assert.equal(err.status, 404);
      assert.match(err.message, /No active CoinGecko onchain pool/);
      return true;
    }
  );
  assert.equal(fetchImpl.calls.length, 1);
});

test('lookupOnchainToken: a token with no price errors out', async () => {
  const fetchImpl = createFetchStub([
    jsonResponse(searchPoolsFixture()),
    jsonResponse(tokenFixture({ price_usd: null }))
  ]);

  await assert.rejects(
    () => lookupOnchainToken(ADDRESS, {
      fetchImpl: fetchImpl,
      apiConfig: { baseUrl: GECKOTERMINAL_API_BASE_URL, headers: {} }
    }),
    (err) => {
      assert.ok(err instanceof CoinGeckoOnchainError);
      assert.match(err.message, /no current price is available/);
      return true;
    }
  );
});

test('lookupOnchainToken: 401 on a keyed config retries against GeckoTerminal', async () => {
  const fetchImpl = createFetchStub([
    jsonResponse({}, 401),
    jsonResponse(searchPoolsFixture()),
    jsonResponse(tokenFixture())
  ]);

  const result = await lookupOnchainToken(ADDRESS, {
    fetchImpl: fetchImpl,
    apiConfig: { baseUrl: PRO_API_BASE_URL, headers: { 'x-cg-pro-api-key': 'bad-key' } }
  });

  assert.equal(result.symbol, 'UNI');
  assert.equal(fetchImpl.calls.length, 3);

  // First attempt used the pro base URL (and the /onchain path prefix)...
  assert.ok(fetchImpl.calls[0].url.startsWith(`${PRO_API_BASE_URL}/onchain/search/pools`));
  // ...and the retry ran the whole lookup again on the keyless GeckoTerminal base, which has no
  // /onchain prefix and sends no API key header.
  assert.equal(
    fetchImpl.calls[1].url,
    `${GECKOTERMINAL_API_BASE_URL}/search/pools?query=${ADDRESS}&include=base_token%2Cquote_token`
  );
  assert.equal(
    fetchImpl.calls[2].url,
    `${GECKOTERMINAL_API_BASE_URL}/networks/base/tokens/${ADDRESS}?include=top_pools`
  );
  assert.deepEqual(fetchImpl.calls[1].init.headers, { accept: 'application/json' });
});

test('lookupOnchainToken: 403 on a demo config also falls back to GeckoTerminal', async () => {
  const fetchImpl = createFetchStub([
    jsonResponse({}, 403),
    jsonResponse(searchPoolsFixture()),
    jsonResponse(tokenFixture())
  ]);

  const result = await lookupOnchainToken(ADDRESS, {
    fetchImpl: fetchImpl,
    apiConfig: { baseUrl: PUBLIC_API_BASE_URL, headers: { 'x-cg-demo-api-key': 'bad-key' } }
  });

  assert.equal(result.network, 'base');
  assert.ok(fetchImpl.calls[1].url.startsWith(GECKOTERMINAL_API_BASE_URL));
});

test('lookupOnchainToken: a 401 already on GeckoTerminal is not retried', async () => {
  const fetchImpl = createFetchStub([jsonResponse({}, 401)]);

  await assert.rejects(
    () => lookupOnchainToken(ADDRESS, {
      fetchImpl: fetchImpl,
      apiConfig: { baseUrl: GECKOTERMINAL_API_BASE_URL, headers: {} }
    }),
    (err) => {
      assert.equal(err.status, 401);
      return true;
    }
  );
  assert.equal(fetchImpl.calls.length, 1);
});

test('lookupOnchainToken: rate limiting and unexpected statuses are not retried', async () => {
  const rateLimited = createFetchStub([jsonResponse({}, 429)]);
  await assert.rejects(
    () => lookupOnchainToken(ADDRESS, {
      fetchImpl: rateLimited,
      apiConfig: { baseUrl: PRO_API_BASE_URL, headers: { 'x-cg-pro-api-key': 'k' } }
    }),
    (err) => {
      assert.equal(err.status, 429);
      assert.match(err.message, /rate limiting/);
      return true;
    }
  );
  assert.equal(rateLimited.calls.length, 1);

  const serverError = createFetchStub([jsonResponse({}, 500)]);
  await assert.rejects(
    () => lookupOnchainToken(ADDRESS, {
      fetchImpl: serverError,
      apiConfig: { baseUrl: PRO_API_BASE_URL, headers: { 'x-cg-pro-api-key': 'k' } }
    }),
    (err) => {
      assert.equal(err.status, 500);
      assert.match(err.message, /unexpected error \(500\)/);
      return true;
    }
  );
  assert.equal(serverError.calls.length, 1);
});

test('lookupOnchainToken: network failures surface a friendly error', async () => {
  const fetchImpl = createFetchStub([new Error('ECONNRESET')]);

  await assert.rejects(
    () => lookupOnchainToken(ADDRESS, {
      fetchImpl: fetchImpl,
      apiConfig: { baseUrl: GECKOTERMINAL_API_BASE_URL, headers: {} }
    }),
    (err) => {
      assert.ok(err instanceof CoinGeckoOnchainError);
      assert.equal(err.status, undefined);
      assert.match(err.message, /could not be reached/);
      return true;
    }
  );
});

test('lookupOnchainToken: unparseable JSON surfaces an invalid-response error', async () => {
  const fetchImpl = createFetchStub([{
    ok: true,
    status: 200,
    json: async () => { throw new SyntaxError('Unexpected token <'); }
  }]);

  await assert.rejects(
    () => lookupOnchainToken(ADDRESS, {
      fetchImpl: fetchImpl,
      apiConfig: { baseUrl: GECKOTERMINAL_API_BASE_URL, headers: {} }
    }),
    (err) => {
      assert.ok(err instanceof CoinGeckoOnchainError);
      assert.match(err.message, /invalid response/);
      return true;
    }
  );
});
