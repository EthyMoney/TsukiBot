const fs = require('fs');
const pc = require('picocolors');

//
//
// The purpose of this function is to gather all available tickers on CoinGecko and write them in JSON format to file.
// This is so the bot can check and verify coin existence, and also refer to the coins by their market ticker instead of the full name.
// This file should be run once before starting the bot for the first time. It will be auto-run by the bot after.
//
//

// Make API call and do JSON build operation.
//
// apiConfig is { baseUrl, headers } as produced by getCGRestConfig() in main.js. Passing it in keeps
// this module free of any key handling of its own while still getting the demo/pro rate limit —
// without it, this call was the one part of the refresh path still going out unauthenticated.
var update = async (apiConfig) => {
  const baseUrl = (apiConfig && apiConfig.baseUrl) || 'https://api.coingecko.com/api/v3';
  // CoinGecko returns 403 without a descriptive User-Agent.
  const headers = {
    accept: 'application/json',
    'user-agent': 'TsukiBot/1.0 (+https://github.com/EthyMoney/TsukiBot)',
    ...((apiConfig && apiConfig.headers) || {})
  };

  let data, tickers = [];
  try {
    const response = await fetch(baseUrl + '/coins/list?include_platform=false', { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    data = await response.json();

    for (const value of data) {
      tickers.push(value.symbol.toUpperCase());
    }
  } catch (err) {
    console.log(pc.red(`Unable to grab list of all CG coins: ${err.message}`));
    // Bail out rather than falling through to the writes below. On a failed fetch `data` is
    // undefined, and JSON.stringify(undefined) returns undefined, which makes writeFileSync throw.
    return false;
  }

  // Write the identification JSON to file
  await fs.promises.writeFile('./common/coinsCG.json', JSON.stringify(data));
  await fs.promises.writeFile('./common/coinsCGtickers.json', JSON.stringify(tickers));
  return true;
};

// Note: deliberately no update() call at import time. Requiring this module used to kick off a
// fetch as a side effect, which duplicated the startup call and burned rate-limit budget.

exports.update = update;
