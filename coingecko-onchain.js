const PUBLIC_API_BASE_URL = 'https://api.coingecko.com/api/v3';
const PRO_API_BASE_URL = 'https://pro-api.coingecko.com/api/v3';

class CoinGeckoOnchainError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'CoinGeckoOnchainError';
    this.status = status;
  }
}

function isLikelyContractAddress(value) {
  if (typeof value !== 'string') return false;

  const address = value.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return true;

  // Non-EVM addresses (for example Solana) do not share one universal format.
  return address.length >= 32 && address.length <= 128 && !/\s/.test(address);
}

function getApiConfig(keys = {}, env = process.env) {
  const proApiKey = env.COINGECKO_PRO_API_KEY || keys.coingeckoPro;
  if (proApiKey) {
    return {
      baseUrl: PRO_API_BASE_URL,
      headers: { 'x-cg-pro-api-key': proApiKey }
    };
  }

  const demoApiKey = env.COINGECKO_API_KEY || keys.coingecko || keys.coingeckoDemo;
  return {
    baseUrl: PUBLIC_API_BASE_URL,
    headers: demoApiKey ? { 'x-cg-demo-api-key': demoApiKey } : {}
  };
}

async function requestJson(path, apiConfig, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(apiConfig.baseUrl + path, {
      headers: {
        accept: 'application/json',
        ...apiConfig.headers
      }
    });
  }
  catch {
    throw new CoinGeckoOnchainError('CoinGecko could not be reached. Please try again shortly.');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new CoinGeckoOnchainError('CoinGecko onchain lookup requires a valid Demo or Pro API key.', response.status);
    }
    if (response.status === 429) {
      throw new CoinGeckoOnchainError('CoinGecko is rate limiting requests. Please try again shortly.', response.status);
    }
    if (response.status === 404) {
      throw new CoinGeckoOnchainError('No onchain token was found for that contract address.', response.status);
    }
    throw new CoinGeckoOnchainError(`CoinGecko returned an unexpected error (${response.status}).`, response.status);
  }

  try {
    return await response.json();
  }
  catch {
    throw new CoinGeckoOnchainError('CoinGecko returned an invalid response.');
  }
}

function getTokenAndNetwork(searchResult, contractAddress) {
  const normalizedAddress = contractAddress.toLowerCase();
  const tokens = (searchResult.included || []).filter(item =>
    item.type === 'token' && item.attributes?.address?.toLowerCase() === normalizedAddress
  );

  if (tokens.length === 0) return null;

  const pools = searchResult.data || [];
  const candidates = [];
  for (const token of tokens) {
    for (const pool of pools) {
      const relationships = pool.relationships || {};
      const isTokenInPool = relationships.base_token?.data?.id === token.id ||
        relationships.quote_token?.data?.id === token.id;
      if (!isTokenInPool) continue;

      const network = relationships.network?.data?.id ||
        token.id.substring(0, token.id.length - token.attributes.address.length - 1);
      if (!network) continue;

      candidates.push({
        network: network,
        token: token,
        reserve: Number(pool.attributes?.reserve_in_usd) || 0
      });
    }
  }

  candidates.sort((a, b) => b.reserve - a.reserve);
  return candidates[0] || null;
}

async function lookupOnchainToken(contractAddress, options = {}) {
  if (!isLikelyContractAddress(contractAddress)) {
    throw new CoinGeckoOnchainError('That does not look like a valid token contract address.');
  }

  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new CoinGeckoOnchainError('This Node.js version does not provide fetch support.');
  }

  const apiConfig = options.apiConfig || getApiConfig(options.keys);
  const encodedAddress = encodeURIComponent(contractAddress);
  const searchResult = await requestJson(
    `/onchain/search/pools?query=${encodedAddress}&include=base_token%2Cquote_token`,
    apiConfig,
    fetchImpl
  );
  const match = getTokenAndNetwork(searchResult, contractAddress);
  if (!match) {
    throw new CoinGeckoOnchainError('No active CoinGecko onchain pool was found for that contract address.', 404);
  }

  const tokenResult = await requestJson(
    `/onchain/networks/${encodeURIComponent(match.network)}/tokens/${encodedAddress}?include=top_pools`,
    apiConfig,
    fetchImpl
  );
  const attributes = tokenResult.data?.attributes;
  if (!attributes || attributes.price_usd == null) {
    throw new CoinGeckoOnchainError('CoinGecko found the token, but no current price is available.');
  }

  const topPool = (tokenResult.included || []).find(item => item.type === 'pool');
  return {
    address: attributes.address || contractAddress,
    name: attributes.name || match.token.attributes.name || 'Unknown token',
    symbol: attributes.symbol || match.token.attributes.symbol || 'TOKEN',
    network: match.network,
    priceUsd: Number(attributes.price_usd),
    priceChange24h: topPool?.attributes?.price_change_percentage?.h24 == null
      ? null
      : Number(topPool.attributes.price_change_percentage.h24),
    marketCapUsd: attributes.market_cap_usd == null ? null : Number(attributes.market_cap_usd),
    volume24hUsd: attributes.volume_usd?.h24 == null ? null : Number(attributes.volume_usd.h24)
  };
}

module.exports = {
  CoinGeckoOnchainError,
  getApiConfig,
  isLikelyContractAddress,
  lookupOnchainToken
};
