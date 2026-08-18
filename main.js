/* ------------------------------------------------------------------------
 *
 *                 _____          _    _ ____        _
 *                |_   ____ _   _| | _(_| __ )  ___ | |_
 *                  | |/ __| | | | |/ | |  _ \ / _ \| __|
 *                  | |\__ | |_| |   <| | |_) | (_) | |_
 *                  |_||___/\__,_|_|\_|_|____/ \___/ \__|
 *
 *
 *
 * Author:      Logan S. ~ EthyMoney#5000(Discord) ~ EthyMoney(GitHub)
 * Base:        Forked from "TsukiBot", written by Oscar F. ~ Cehhiro(Discord)
 * Program:     TsukiBot
 * GitHub:      https://github.com/EthyMoney/TsukiBot
 *
 * Discord bot that offers a wide range of services related to cryptocurrencies
 *
 * No parameters on start except -d for developer mode (disables periodic caching)
 *
 * If you like this service, consider donating to show support :)
 * ETH address: 0x169381506870283cbABC52034E4ECc123f3FAD02
 *
 *
 *                        Hello from Minnesota USA!
 *                              ⋆⁺₊⋆ ☾ ⋆⁺₊⋆
 *
 * ------------------------------------------------------------------------ */



// -------------------------------------------
//       IMPORTANT STEPS FOR FIRST RUN
// -------------------------------------------

// 1. Make sure you have node.js and npm installed and ready to use. Node version 22.x or newer is required.
// 2. Open a terminal in the project directory and run the command "npm ci" to install all required dependencies.
// 3. Create a keys.api file in the common folder to include all of your own keys, tokens, and passwords that are needed for normal operation of all services.
//    You can find the template keys.api file to reference in the "How to set up keys file" text file within the docs folder. Just fill in the blanks!
//    Every key can also be supplied as an environment variable instead (see applyEnvironmentOverrides below), which is how the Docker setup avoids a keys file.
// 4. Chromium is located automatically: the bundled one everywhere, /usr/bin/chromium on Linux. Set CHROME_PATH if yours is somewhere else.
//    No source editing needed. The Chromium sandbox stays on; only set CHROME_NO_SANDBOX=true if your host genuinely cannot run it.
// 5. Set up your PostgreSQL database according to the schema defined in the docs folder. The alerts, holdings, and scheduled_posts
//    tables create themselves on first start, so only tsukibot.profiles needs to come from the schema file.
// 6. Register the slash commands once with "npm run deploy" (this talks to Discord, so only run it when your commands change).
// 7. You are now ready to start the bot! Go ahead and run this file to start up. EX: "node main.js"
//    If you have any questions or issues, feel free to contact me in the support discord server and I'll try to help you out. Link: https://discordapp.com/invite/VWNUbR5
//
// Prefer containers? "docker compose up -d" does steps 1, 2, 4, and 5 for you. See the README.
//
// Tip: a free CoinGecko demo key (keys.api "coingecko", or COINGECKO_API_KEY) moves the rate limit from
// per-IP to per-key, which cuts the full market cache refresh from ~30 minutes down to a few.

// Alright the hard part is over. Carry on :)


// -------------------------------------------
// -------------------------------------------
//
//           SETUP AND DECLARATIONS
//
// -------------------------------------------
// -------------------------------------------

// Node stuff
const process = require('node:process');
const crypto = require('node:crypto');

// Dev mode to disable unnecessary operations for testing
const devMode = (process.argv[2] === '-d') ? true : false;

// File read for JSON and PostgreSQL
const fs = require('fs');
const pg = require('pg');

// Scheduler
const schedule = require('node-schedule');

// Include fancy console outputs
const pc = require('picocolors');

// Read in and initialize all files
let keys, pairs_CG_arr, metadata, tagsJSON;
// The full CoinGecko coin list ({id, symbol, name} for every listed coin). Refreshed twice a day
// for one credit, and it carries no market data, which is what lets autocomplete and coin id
// resolution cover all ~18,000 coins while the market cache holds only the top few hundred.
let cgCoinList = [];
initializeFiles();

// Top.gg bot statistics reporter
const { AutoPoster } = require('topgg-autoposter');
let poster;               // Will be initialized upon startup

// Include API things
const { Client, GatewayIntentBits, ShardClientUtil, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags, ApplicationCommandOptionType, AttachmentBuilder } = require('discord.js');
const ccxt = require('ccxt');
const { CoinGeckoOnchainError, getApiConfig, isLikelyContractAddress, lookupOnchainToken } = require('./coingecko-onchain');
const finnhub = require('finnhub');
const { Web3 } = require('web3');

// Google Cloud language translations
const googleProjectID = keys.googleCloudProjectID;
const googleProjectApiKeyPath = keys.googleCloudProjectKeyPath;
const { Translate } = require('@google-cloud/translate').v2;

// Express server for charts
const path = require('path');
const express = require('express');
const app = express();
const dir = path.join(process.cwd(), 'public');
chartServer();

// Express server for coin prices API
const apiApp = express();
const apiAppPort = 3330;

// Automatic color selector for embeds
const colorAverager = require('fast-average-color-node');

// Puppeteer for interacting with the headless server and manipulating charts
const { Cluster } = require('puppeteer-cluster');
let cluster;
chartsProcessingCluster();

// CMC/CG Cache
let cmcArrayDict = {};
let cgArrayDictParsed = [];
let cgArrayDict = {};
let fails = 0;
let auto = true;
let selectedKey = 0;
let cacheUpdateRunning = false;
let startupProgress = 0;
let forexRates = {};

// Spellcheck
const didyoumean = require('didyoumean');

// Usage telemetry. Split across three modules because the write path (hot, fire-and-forget) and the
// read path (cold, admin-only, allowed to be slow) have opposite requirements, and the rendering is
// pure enough to unit test on its own.
const telemetry = require('./src/telemetry');
const telemetryReports = require('./src/telemetry-reports');
const render = require('./src/telemetry-render');

// The /usage report embeds. Extracted so they can be unit tested: requiring main.js would
// start the bot, which is why a formatter bug in three of these reports reached production.
const {
  buildUsageOverview, buildUsageCommands, buildUsageUsers, buildUsageGuilds, buildUsageCoins,
  buildUsageActivity, buildUsageCommandDetail, buildUsageErrors, buildUsageGrowth,
  buildUsageCredits, usageEmbed
} = require('./src/telemetry-embeds');

// The command registry, for /usage command autocomplete. Safe to require: deploy-commands only
// talks to Discord when run directly, so importing it here just builds the builders.
const registeredCommandNames = require('./deploy-commands.js').commands.map(c => c.name).sort();

// Connect to database.
// A pool rather than a fresh client per command: every /tbpa* invocation used to pay TCP and auth
// setup, connect() errors went unhandled, and any early return leaked the connection. pool.query
// acquires and releases around each query, so there is no connection bookkeeping to get wrong.
const conString = 'postgres://bigboi:' + keys.tsukibot + '@' + keys.dbAddress + ':5432/tsukibot';
const dbPool = new pg.Pool({ connectionString: conString, max: 10, idleTimeoutMillis: 30000 });
dbPool.on('error', (err) => {
  // Idle clients can be dropped by the server or network; the pool replaces them automatically.
  console.log(pc.red('Postgres pool error: ' + pc.cyan(err.message)));
});

// Both halves of telemetry share the bot's pool rather than opening their own: the write side is
// low volume (one batched INSERT every few seconds) and the read side runs only when an admin asks.
telemetry.init({
  dbPool,
  info: (msg) => console.log(pc.green(msg)),
  error: (msg) => console.log(pc.red(msg))
});
telemetryReports.init({ dbPool });

// Who may read usage reports. The application owner is resolved from Discord at startup; anyone
// else has to be listed explicitly in keys.api as "botAdmins": ["id", ...]. Falling back to the
// owner means a fresh install has working access control without any configuration.
const configuredAdmins = new Set(Array.isArray(keys.botAdmins) ? keys.botAdmins.map(String) : []);
let applicationOwnerIds = new Set();

/**
 * True when the user may see usage telemetry. Reports expose every user's id and
 * activity across every server, so this is deliberately owner-only by default
 * rather than gated on a per-guild permission like Manage Server.
 * @param {string} userId
 * @returns {boolean}
 */
function isBotAdmin(userId) {
  return configuredAdmins.has(String(userId)) || applicationOwnerIds.has(String(userId));
}

// Declare general global variables
let chartTagID = 0;
// Sleep interval between cg cache update queries. A demo/pro key raises the limit to ~30 req/min,
// which lets a full pass finish in minutes instead of the ~30 the keyless per-IP budget forces.
let globalCGSleepTimeout = cgHasApiKey() ? 2500 : 25000;
const CG_SLEEP_CAP = 120000;      // never back off further than this between pages
const CG_PAGE_ATTEMPTS = 5;       // retries for a single page before the pass gives up

/* --------------------------------------------------------------------------
 *
 *  CoinGecko credit budget.
 *
 *  A demo key allows 10,000 credits per MONTH, which is about 330 a day. The market cache used to
 *  page through every listed coin (65 pages) every 30 minutes: 3,168 calls a day, roughly ten
 *  times the entire monthly allowance. These caps bring it back inside the budget.
 *
 *  Coverage is not lost, only pre-loading. Anything past the cap is fetched on demand by
 *  resolveCoinLive for one credit, and autocomplete still searches the full coin list because that
 *  comes from coinsCG.json, which needs no market data.
 *
 * -------------------------------------------------------------------------- */

// Pages of 250 coins to pre-cache. 4 pages = the top 1,000 by market cap, which covers essentially
// everything anyone asks for. Override with CG_MAX_PAGES to trade credits for coverage.
const CG_MAX_PAGES = Math.max(1, parseInt(process.env.CG_MAX_PAGES, 10) || 4);

// On-demand lookups for coins outside the cache. Held briefly so a burst of commands about the
// same obscure coin costs one credit rather than one per command.
const LIVE_COIN_CACHE_MS = 5 * 60 * 1000;
const liveCoinCache = new Map();

// /global and /search/trending change slowly and were previously fetched per command, so a busy
// server could spend hundreds of credits a day on them alone.
const CG_GLOBAL_CACHE_MS = 10 * 60 * 1000;
const CG_TRENDING_CACHE_MS = 15 * 60 * 1000;
let cgGlobalCache = { at: 0, data: null };
let cgTrendingCache = { at: 0, data: null };

// How often alerts may fetch prices for coins the market cache does not carry.
//
// Alerts on cached coins cost nothing: they ride the cache refresh, so alert latency equals cache
// freshness. This interval only applies to coins outside the pre-cached pages, which have no price
// in the cache at all, and it exists solely to stop one obscure-coin alert from fetching on every
// minute of the scan. Matched to the cache cadence, since being fresher than the cache would be
// spending credits for no gain.
const ALERT_UNCACHED_INTERVAL_MS = Math.max(60000, parseInt(process.env.ALERT_UNCACHED_INTERVAL_MS, 10) || 30 * 60 * 1000);
let lastAlertLiveFetch = 0;
let cgUpdateInProgress = false;   // in-flight guard, separate from the cacheUpdateRunning startup gate
let cgRetryScheduled = false;

// Initialize api things
const clientKraken = new ccxt.kraken();
const bitmex = new ccxt.bitmex();
const clientPoloniex = new ccxt.poloniex();
// Binance's main API host (api.binance.com) geo-restricts some server locations with HTTP 451. The public
// market-data host (data-api.binance.vision) serves the same read-only spot endpoints (exchangeInfo, tickers)
// without that block, so we point Binance's public endpoints there. We also limit loadMarkets() to spot only,
// because the default also fetches futures (fapi/dapi hosts) which are still geo-blocked and would fail the call.
const clientBinance = new ccxt.binance({ options: { fetchMarkets: { types: ['spot'] } }, urls: { api: { public: 'https://data-api.binance.vision/api/v3' } } });
const clientBitfinex = new ccxt.bitfinex();
const clientCoinbase = new ccxt.coinbase();
// Derivatives clients, used for perpetual funding rates. Kept separate from clientBinance above
// because that one is deliberately pinned to spot-only public market data.
const clientBinanceFutures = new ccxt.binance({ options: { defaultType: 'swap' } });
const clientBybit = new ccxt.bybit();
const clientOkx = new ccxt.okx();
const finnhubClient = new finnhub.DefaultApi(keys.finnhub);
const translate = new Translate({ projectId: googleProjectID, keyFilename: googleProjectApiKeyPath });
const web3eth = new Web3(`https://mainnet.infura.io/v3/${keys.infura}`);

// Reload Coins
const reloaderCG = require('./getCoinsCG');

// Shared formatting and string helpers. First extracted module of the main.js split: these are
// pure functions with no dependency on the caches, Discord, or any API client.
const {
  abbreviateNumber, capitalizeFirstLetter, chunkString, formatUsd, formatUsdAmount,
  isAlphaNumeric, numberWithCommas, sleep, trimDecimalPlaces, validURL
} = require('./src/util/format');

// Donation and footer stuff
const quote = 'Enjoying TsukiBot? Tell your friends!';
const botInviteAdd = '\nAdd the bot to other servers by using  `/invite`  for the link  :)';
const inviteLink = 'https://discordapp.com/oauth2/authorize?client_id=506918730790600704&scope=bot&permissions=268823664';

// Scheduled Actions for normal operation
if (!devMode) {
  // Each job is wrapped so a rejection is logged against its job name rather than surfacing as a
  // bare unhandled rejection. The explicit arrow wrappers also stop node-schedule from passing its
  // fireDate in as the function's first argument.
  const scheduledTask = (name, task) => () => {
    task().catch(err => {
      console.log(pc.red(`Scheduled task ${name} failed: ` + pc.cyan(err && err.message ? err.message : err)));
    });
  };

  schedule.scheduleJob('*/10 * * * *', scheduledTask('getCMCData', getCMCData));           // fetch every 10 min
  schedule.scheduleJob('*/30 * * * *', scheduledTask('getCGData', () => getCGData('background'))); // fetch every 30 min
  schedule.scheduleJob('0 12 * * *', scheduledTask('updateCoins', updateCoins));           // update at 12 am and pm every day
  schedule.scheduleJob('*/30 * * * *', scheduledTask('getCoin360Heatmap', getCoin360Heatmap)); // fetch every 30 min
  schedule.scheduleJob('0 */6 * * *', scheduledTask('updateExchangeRates', updateExchangeRates)); // update every 6 hours
  schedule.scheduleJob('* * * * *', scheduledTask('checkPriceAlerts', checkPriceAlerts));  // price alerts every minute
  schedule.scheduleJob('* * * * *', scheduledTask('runDueScheduledPosts', runDueScheduledPosts)); // due recurring posts
  schedule.scheduleJob('1 */1 * * *', function () {  // update cmc key on the first minute after every hour
    updateCmcKey(); // explicit call without arguments to prevent the scheduler fireDate from being sent as a key override.
  });
}


// -------------------------------------------
// -------------------------------------------
//
//             UTILITY FUNCTIONS
//
// -------------------------------------------
// -------------------------------------------


/* --------------------------------------------

    These methods are calls on the api of the
    respective exchanges and other services
    for price checks and so much more.
    These methods are the core functionality
    of the bot. Command calls will usually end
    in one of these.

  -------------------------------------------- */


//------------------------------------------
//------------------------------------------

// Function for Coinbase Pro prices

async function getPriceCoinbase(channel, coin1, coin2) {

  let fail = false;
  let tickerJSON = '';
  if (typeof coin2 === 'undefined') {
    coin2 = 'BTC';
  }
  // toLowerCase() ignores any argument and returns a non-empty string, so the last two terms here
  // used to be unconditionally true: /price coinbase btc eth and btc usdc silently answered in USD.
  if (coin2.toLowerCase() === 'usd' || coin1.toLowerCase() === 'btc' && (coin2.toLowerCase() !== 'gbp' &&
    coin2.toLowerCase() !== 'eur' && coin2.toLowerCase() !== 'dai' && coin2.toLowerCase() !== 'eth' &&
    coin2.toLowerCase() !== 'usdc')) {
    coin2 = 'USD';
  }

  tickerJSON = await clientCoinbase.fetchTicker(coin1.toUpperCase() + '/' + coin2.toUpperCase()).catch(function () {
    console.log(pc.red(pc.bold('Coinbase error: Ticker ' + pc.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!')));
    channel.send('API Error:  Coinbase does not have market symbol __' + coin1.toUpperCase() + '/' + coin2.toUpperCase() + '__');
    fail = true;
  });
  if (fail) {
    //exit the function if ticker didn't exist, or api failed to respond
    return;
  }
  let s = parseFloat(tickerJSON.last).toFixed(8);
  s = trimDecimalPlaces(s);

  let ans = '__Coinbase__ Price for **' + coin1.toUpperCase() + '-' + coin2.toUpperCase() + '** is: `' + s + ' ' + coin2.toUpperCase() + '` .';
  channel.send(ans);
}


//------------------------------------------
//------------------------------------------

// Function for Coin Gecko prices

async function getPriceCoinGecko(coin, coin2, channel, action, author) {

  // The conversion command calls this with a null channel and handles its own output, so every
  // user-facing send in here has to tolerate that. It previously crashed on the error paths.
  const notify = (text) => {
    if (channel) channel.send(text);
  };

  //don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning && !devMode) {
    notify(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
    console.log(pc.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
    return null;
  }

  // determine whether or not the call was from the conversion command to determine if we need to return the values
  let noSend = false;
  if (action && action == 'convert') {
    noSend = true;
  }
  let arr = [];
  let data = [];

  coin = coin.toLowerCase() + '';
  // default to usd if no comparison is provided
  if (!coin2) {
    coin2 = 'usd';
  }
  coin2 = coin2.toLowerCase();

  if (!noSend) console.log(pc.green('CoinGecko price requested by ' + pc.yellow(author.username) + ' for ' + pc.cyan(coin) + '/' + pc.cyan(coin2)));

  // find out the ID for coin requested and also get IDs for any possible duplicate tickers
  let foundCount = 0;
  let coinID, coinID1, coinID2, coinID3 = '';
  for (let i = 0, len = cgArrayDictParsed.length; i < len; i++) {
    if (cgArrayDictParsed[i].symbol.toLowerCase() == coin) {
      if (foundCount == 0)
        coinID = cgArrayDictParsed[i].id;
      if (foundCount == 1)
        coinID1 = cgArrayDictParsed[i].id;
      if (foundCount == 2)
        coinID2 = cgArrayDictParsed[i].id;
      if (foundCount == 3) {
        coinID3 = cgArrayDictParsed[i].id;
      }
      foundCount++;
    }
  }
  // process for if multiple coins are found with the same ticker
  if (foundCount > 1) {
    //special handling for conversion calls
    if (noSend) {
      if (foundCount == 2)
        cgArrayDictParsed.forEach((value) => {
          if (value.id == coinID || value.id == coinID1) {
            data.push(value);
          }
        });
      if (foundCount == 3)
        cgArrayDictParsed.forEach((value) => {
          if (value.id == coinID || value.id == coinID1 || value.id == coinID2) {
            data.push(value);
          }
        });
      if (foundCount == 4)
        cgArrayDictParsed.forEach((value) => {
          if (value.id == coinID || value.id == coinID1 || value.id == coinID2 || value.id == coinID3) {
            data.push(value);
          }
        });
      // sort by MC rank ascending order with nulls placed at the end
      data = data.sort(function (a, b) {
        return (b.market_cap_rank != null) - (a.market_cap_rank != null) || a.market_cap_rank - b.market_cap_rank;
      });
    }
    // normal cg price call, so we need to check pairing currencies
    else {
      if (foundCount == 2)
        data = await cgSimplePrice([coinID, coinID1], ['usd', coin2.toLowerCase()]);
      if (foundCount == 3)
        data = await cgSimplePrice([coinID, coinID1, coinID2], ['usd', coin2.toLowerCase()]);
      if (foundCount == 4)
        data = await cgSimplePrice([coinID, coinID1, coinID2, coinID3], ['usd', coin2.toLowerCase()]);
    }


    // build the reply message that shows all coins found with the given ticker, and label them by full name
    let builtMessage = '';
    let errorMessage = '';
    let cursor = 0;
    if (noSend) {
      arr = data;
    }
    else {
      // cgSimplePrice returns the API response directly, keyed by coin id.
      arr = Object.entries(data);
    }
    let conversionArray1 = [];
    let conversionArray2 = [];
    let conversionArray3 = [];
    arr.forEach(element => {
      cursor++;
      let s, c, name;
      if (noSend) {
        name = element.name;
        s = parseFloat(element.current_price).toFixed(8);
        c = parseFloat(element.price_change_percentage_24h).toFixed(2);
      }
      else {
        name = element[0];
        s = parseFloat(element[1][coin2]).toFixed(8);
        c = Math.round(element[1][coin2.toLowerCase() + '_24h_change'] * 100) / 100;
      }

      s = trimDecimalPlaces(s);
      if (!noSend) {
        if (!isNaN(s)) { // looking for NaN, making sure price is valid
          if (cursor == 1) {
            builtMessage += '__CoinGecko Price for:__\n**' + name.toUpperCase() + '--' + coin2.toUpperCase() + '** is: `' + s +
              ' ' + coin2.toUpperCase() + '` (`' + c + '%`).\n';
          }
          else {
            builtMessage += '**' + name.toUpperCase() + '--' + coin2.toUpperCase() + '** is: `' + s +
              ' ' + coin2.toUpperCase() + '` (`' + c + '%`).\n';
          }
          //console.log(chalk.green('CoinGecko API ticker response: ' + chalk.cyan(s)));
        }
        else {
          errorMessage = 'Pricing not available in terms of **' + coin2.toUpperCase() + '**. Try another pairing!';
        }
      }
      else {
        conversionArray1.push(s);
        conversionArray2.push(c);
        conversionArray3.push(name);
      }
    });
    if (!noSend)
      channel.send(builtMessage + errorMessage);
    else
      return [conversionArray1, conversionArray2, conversionArray3];
  }
  // process for when only one coin is found for a ticker
  else {
    if (foundCount == 1) {
      let s, c;
      if (noSend) {
        cgArrayDictParsed.forEach((value) => {
          if (value.id == coinID) {
            data.push(value);
          }
        });
        s = parseFloat(data[0].current_price).toFixed(8);
        c = parseFloat(data[0].price_change_percentage_24h).toFixed(2);
      }
      else {
        data = await cgSimplePrice([coinID], ['usd', coin2.toLowerCase()]);
        s = parseFloat(data[coinID][coin2]).toFixed(8);
        c = Math.round(data[coinID][coin2.toLowerCase() + '_24h_change'] * 100) / 100;
      }
      s = trimDecimalPlaces(s);
      if (isNaN(s) || !s) { // looking for NaN, making sure price is valid
        notify('**' + coin.toUpperCase() + '** was found, but the pairing currency **' + coin2.toUpperCase() + '** was not found. Try another pairing!');
        return null;
      }
      if (!noSend) {
        channel.send('__CoinGecko__ Price for **' + coin.toUpperCase() + '-' + coin2.toUpperCase() + '** is: `' +
          s + ' ' + coin2.toUpperCase() + '` (`' + c + '%`).');
      }
      else {
        return [[s], [c], [null]];
      }
    }
    else {
      notify('Provided coin **' + coin.toUpperCase() + '** was not found!');
      return null;
    }
  }
}


//------------------------------------------
//------------------------------------------

// Function for CoinMarketCap prices

function getPriceCMC(coins, channel, action = '-', ext = 'd') {

  // don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning && !devMode) {
    channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
    console.log(pc.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
    return;
  }

  if (!cmcArrayDict.BTC) return;

  // check for no input
  if (coins.length == 0) {
    return;
  }

  let ordered = {};
  let messageHeader;

  if (action === 'p') {
    messageHeader = '__CoinMarketCap__ Price for Top 10 Coins:\n';
  }
  else {
    messageHeader = '__CoinMarketCap__ Price for:\n';
  }
  let message = '';
  let ep, bp, up; //pricing values (usd, btc, eth)

  try {
    for (let i = 0; i < coins.length; i++) {
      if (!cmcArrayDict[coins[i].toUpperCase()]) {
        let g = didyoumean(coins[i].toUpperCase(), Object.keys(cmcArrayDict));
        if (!g)
          continue;
        else
          coins[i] = g;
      }

      // Special case for a specific badly formatted coin from the API
      if (coins[i].toLowerCase() == 'lyxe') {
        coins[i] = 'LYXe';
      }

      //log the json entry for selected coin
      //console.log(cmcArrayDict[coins[i].toUpperCase()]);

      // Get the price data from cache and format it accordingly
      let plainPriceUSD = trimDecimalPlaces(parseFloat(cmcArrayDict[coins[i].toUpperCase()].quote.USD.price).toFixed(6));
      let plainPriceETH = trimDecimalPlaces(parseFloat(convertToETHPrice(cmcArrayDict[coins[i].toUpperCase()].quote.USD.price)).toFixed(8));
      let plainPriceBTC = trimDecimalPlaces(parseFloat(convertToBTCPrice(cmcArrayDict[coins[i].toUpperCase()].quote.USD.price)).toFixed(8));
      let upchg = Math.round(parseFloat(cmcArrayDict[coins[i].toUpperCase()].quote.USD.percent_change_24h) * 100) / 100;
      // unused due to api key limits
      //let bpchg = Math.round(parseFloat(cmcArrayDict[coins[i].toUpperCase()].quote.BTC.percent_change_24h) * 100) / 100;
      //let epchg = Math.round(parseFloat(cmcArrayDict[coins[i].toUpperCase()].quote.ETH.percent_change_24h) * 100) / 100;

      // Assembling the text lines for response message
      up = plainPriceUSD + ' '.repeat(8 - plainPriceUSD.length) + ' USD` (`' + upchg + '%`)';
      bp = plainPriceBTC + ' '.repeat(10 - plainPriceBTC.length) + ' BTC` ';//(`' + bpchg + '%`)';
      ep = plainPriceETH + ' '.repeat(10 - plainPriceETH.length) + ' ETH` ';//(`'// + epchg + '%`)';

      coins[i] = (coins[i].length > 6) ? coins[i].substring(0, 6) : coins[i];
      switch (action) {
        case '-':
          message += ('`• ' + coins[i].toUpperCase() + ' '.repeat(6 - coins[i].length) + ' ⇒` `' + (ext === 's' ? bp : up) + '\n');
          break;

        case '+':
          message += ('`• ' + coins[i].toUpperCase() + ' '.repeat(6 - coins[i].length) + ' ⇒` `' +
            bp + '\n');
          break;

        case '*':
          message += ('`• ' + coins[i].toUpperCase() + ' '.repeat(6 - coins[i].length) + ' ⇒ 💵` `' +
            up + '\n`|        ⇒` `' +
            bp + '\n');
          break;

        case 'e':
          message += ('`• ' + coins[i].toUpperCase() + ' '.repeat(6 - coins[i].length) + ' ⇒` `' +
            ep + '\n');
          break;

        case '%':
          if (cmcArrayDict[coins[i].toUpperCase()])
            ordered[cmcArrayDict[coins[i].toUpperCase()].quote.USD.percent_change_24h] =
              ('`• ' + coins[i].toUpperCase() + ' '.repeat(6 - coins[i].length) + ' ⇒` `' + (ext === 's' ? bp : up) + '\n');
          break;

        default:
          message += ('`• ' + coins[i].toUpperCase() + ' '.repeat(6 - coins[i].length) + ' ⇒` `' + (ext === 's' ? bp : up) + '\n');
          break;
      }
    }

    if (action === '%') {
      let k = Object.keys(ordered).sort(function (a, b) { return parseFloat(b) - parseFloat(a); });
      for (let k0 in k)
        message += ordered[k[k0]];
    }
  }
  catch (err) {
    console.log(pc.redBright('Error in CMC price command processing. ') + pc.cyanBright('Here is the trace:'));
    console.error(err);
    return;
  }

  message += (Math.random() > 0.99) ? '\n' + quote + ' ' + botInviteAdd : '';
  if (message !== '')
    channel.send(messageHeader + message).catch((err) => {
      console.log(pc.redBright('Error sending response message in CMC price command...') + pc.cyanBright('Here is the trace:'));
      console.error(err);
    });
}


//------------------------------------------
//------------------------------------------

// Function for CoinGecko prices 
// (in similar format the list-style cmc command above)

function formatOnchainUsdPrice(price) {
  if (!Number.isFinite(price)) return 'n/a';
  if (price === 0) return '0';
  if (Math.abs(price) >= 1) return trimDecimalPlaces(price.toFixed(6));
  return Number(price.toPrecision(8)).toString();
}

function sanitizeCoinGeckoText(value) {
  return String(value).replace(/[`\r\n]/g, '').trim();
}

async function getPriceCGByContract(contractAddress, interaction) {
  try {
    const token = await lookupOnchainToken(contractAddress, { apiConfig: getApiConfig(keys) });
    const symbol = sanitizeCoinGeckoText(token.symbol).toUpperCase().substring(0, 16);
    const name = sanitizeCoinGeckoText(token.name).substring(0, 60);
    const change = Number.isFinite(token.priceChange24h) ? `${Math.round(token.priceChange24h * 100) / 100}%` : 'n/a';
    const shortAddress = token.address.length > 18
      ? `${token.address.substring(0, 8)}…${token.address.substring(token.address.length - 6)}`
      : token.address;
    const message = '__CoinGecko Onchain__ Price for:\n' +
      `**${symbol} — ${name}**\n` +
      `\`• USD ⇒\` \`${formatOnchainUsdPrice(token.priceUsd)} USD\` (\`${change}\`)\n` +
      `Network: \`${sanitizeCoinGeckoText(token.network)}\` • Contract: \`${sanitizeCoinGeckoText(shortAddress)}\``;
    await interaction.editReply(message);
  }
  catch (err) {
    console.log(pc.redBright('CoinGecko onchain lookup failed: ') + pc.cyan(err.message));
    const message = err instanceof CoinGeckoOnchainError
      ? err.message
      : 'Unable to look up that contract address right now. Please try again shortly.';
    await interaction.editReply(`**CoinGecko onchain lookup failed:** ${message}`);
  }
}

function getPriceCG(coins, channel, action = '-', ext = 'd', tbpaIgnoreMultiTickers = false, interaction) {

  // don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning && !devMode) {
    if (interaction) {
      interaction.reply(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      return;
    }
    else {
      channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      console.log(pc.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
      return;
    }
  }

  // check for no input
  if (coins.length == 0) {
    return;
  }

  console.log(pc.magentaBright('Incoming coins for call:'), pc.cyanBright(coins));

  let ordered = {};
  let messageHeader;
  let selectedCoinObjects = [];
  let message_part1 = '';

  if (action === 'p') {
    messageHeader = '__CoinGecko__ Price for Top 10 Coins:\n';
  }
  else if (action === 'm') {
    messageHeader = '__CoinGecko__ Price for Top 5 Gainers and Losers:\n';
  }
  else {
    messageHeader = '__CoinGecko__ Price for:\n';
  }
  let message = '';
  let ep, bp, up; //pricing values (ep=ethprice, bp=btcprice, up=usdprice)

  for (let i = 0; i < coins.length; i++) {
    coins[i] = coins[i].toUpperCase(); //make all input coins uppercase
  }

  for (let i = 0; i < coins.length; i++) {
    // for getting coin by ID (biggest movers action call)
    if (action === 'm') {
      // look through cache and get each matching coin, but skip those damn worthless peg coins!
      cgArrayDictParsed.forEach((coinObject) => {
        if (coinObject.id.toUpperCase() == coins[i]) {
          if (coinObject.name.includes('Binance-Peg')) {
            return; //skip adding this peg coin
          }
          else {
            selectedCoinObjects.push(coinObject);
            // replace the id in the coins array with the symbol (for readability)
            coins[i] = coinObject.symbol.toUpperCase();
          }
        }
      });
    }
    // otherwise process as normal call and look for symbols
    else {
      if (!cgArrayDict[coins[i]]) {
        let g = didyoumean(coins[i], Object.keys(cgArrayDict));
        if (!g)
          continue;
        else {
          coins[i] = g;
        }
      }
      // look through cache and get each matching coin, but skip those damn worthless peg coins!
      cgArrayDictParsed.forEach((coinObject) => {
        if (coinObject.symbol.toUpperCase() == coins[i]) {
          if (coinObject.name.includes('Binance-Peg')) {
            return; //skip adding this peg coin
          }
          else {
            selectedCoinObjects.push(coinObject);
          }
        }
      });
    }


    // iterate through all instances of an identical ticker if applicable
    let coinIdentifier = '';
    let tbpaIterator = 0;
    selectedCoinObjects.forEach((coinObject) => {

      //! This segment is commented since we are not showing the multi tickers for right now
      // if (selectedCoinObjects.length > 1 && !tbpaIgnoreMultiTickers) {
      //   // grab coin name to display next to price in order to differentiate between the other same ticker coins
      //   coinIdentifier = ` (${coinObject.name})`;
      // }


      //!
      //!!! NOTICE, IMPORTANT!
      //! This disables the recently added feature of showing all instances of coins with the same tickers in standard price calls!
      //? After deploying this update to the bot I realized it's very messy and just not a great way to handle the issue. I'm putting this 
      //? feature on pause for now until the user preferences stuff is set up and this feature can be a customizable and configurable option.
      const DISABLED_MULTI_TICKER_SUPPORT = true;

      // don't iterate through all if tbpa display is active
      if (tbpaIgnoreMultiTickers || DISABLED_MULTI_TICKER_SUPPORT) {
        tbpaIterator++;
      }

      if (tbpaIterator > 1) {
        return; //ignore tickers after first one if this is a tbpa call (will be updated later, but this is to prevent tbpa's from suddenly getting all messy)
      }

      // set price string lengths
      let usdLength = 8, btcEthLength = 10;

      // get the price data from cache and format it accordingly (grabs the coin with the highest MC)
      if (!coinObject) {
        console.log(pc.redBright(`ERR in CG price command: Selected coin object came up as undefined for: ${coins[i]}`));
        return;
      }
      // check if the number with 6 decimal places still only shows zeros, switch to 10 places if needed for more resolution
      let plainPriceUSD = (parseFloat(coinObject.current_price).toFixed(6) == 0) ?
        trimDecimalPlaces(parseFloat(coinObject.current_price).toFixed(10)) :
        trimDecimalPlaces(parseFloat(coinObject.current_price).toFixed(6));
      let plainPriceETH = trimDecimalPlaces(parseFloat(convertToETHPrice(coinObject.current_price)).toFixed(8));
      let plainPriceBTC = trimDecimalPlaces(parseFloat(convertToBTCPrice(coinObject.current_price)).toFixed(8));
      let upchg = Math.round(parseFloat(coinObject.price_change_percentage_24h_in_currency) * 100) / 100;

      // ignore percent in cases where it's a new coin and 24hr percent is not yet available
      if (!upchg && upchg != 0) {
        upchg = 'n/a ';
      }
      // unused due to api limits
      //let bpchg = Math.round(parseFloat(cgArrayDict[coins[i]].quote.BTC.percent_change_24h) * 100) / 100;
      //let epchg = Math.round(parseFloat(cgArrayDict[coins[i]].quote.ETH.percent_change_24h) * 100) / 100;

      // assembling the text lines for response message
      if (usdLength - plainPriceUSD.length < 0) {
        // special case for bigger numbers (will skip formatting)
        up = plainPriceUSD + ' USD` (`' + upchg + '%`)';
      }
      else {
        up = plainPriceUSD + ' '.repeat(usdLength - plainPriceUSD.length) + ' USD` (`' + upchg + '%`)';
      }
      if (btcEthLength - plainPriceBTC.length < 0 || btcEthLength - plainPriceETH.length < 0) {
        // special case for bigger numbers (will skip formatting)
        bp = plainPriceBTC + ' BTC` ';
        ep = plainPriceETH + ' ETH` ';
      }
      else {
        bp = plainPriceBTC + ' '.repeat(btcEthLength - plainPriceBTC.length) + ' BTC` '; //(`' + bpchg + '%`)';
        ep = plainPriceETH + ' '.repeat(btcEthLength - plainPriceETH.length) + ' ETH` '; //(`'// + epchg + '%`)';
      }

      // TODO: add eur price and chg as well. (will need to get additional pair data from api to do this)

      coins[i] = (coins[i].length > 6) ? coins[i].substring(0, 6) : coins[i];
      switch (action) {
        case '-':
          message += ('`• ' + coins[i] + ' '.repeat(6 - coins[i].length) + ' ⇒` `' + (ext === 's' ? bp : up) + coinIdentifier + '\n');
          break;

        case '+':
          message += ('`• ' + coins[i] + ' '.repeat(6 - coins[i].length) + ' ⇒` `' + bp + coinIdentifier + '\n');
          break;

        case '*':
          message += ('`• ' + coins[i] + ' '.repeat(6 - coins[i].length) + ' ⇒ 💵` `' + up + '\n`|        ⇒` `' + bp + coinIdentifier + '\n');
          break;

        case 'e':
          message += ('`• ' + coins[i] + ' '.repeat(6 - coins[i].length) + ' ⇒` `' + ep + coinIdentifier + '\n');
          break;

        case '%':
          if (coinObject)
            ordered[coinObject.price_change_percentage_24h_in_currency] =
              ('`• ' + coins[i] + ' '.repeat(6 - coins[i].length) + ' ⇒` `' + (ext === 's' ? bp : up) + coinIdentifier + '\n');
          break;

        default:
          message += ('`• ' + coins[i] + ' '.repeat(6 - coins[i].length) + ' ⇒` `' + (ext === 's' ? bp : up) + coinIdentifier + '\n');
          break;
      }
    });//end of looping through same-ticker coins

    coinIdentifier = ''; // clear coin id
    selectedCoinObjects = []; // clear array for next coin
    // see if we need to overflow into a second message (for really long lists of coins)
    let lineLimit = (action == '*') ? 75 : 40;
    if (message_part1.length == 0 && 1950 - message.length <= lineLimit) {
      message_part1 = message;
      message = '';
    }
  }

  if (action === '%') {
    let k = Object.keys(ordered).sort(function (a, b) { return parseFloat(b) - parseFloat(a); });
    for (let k0 in k) {
      // see if we need to overflow into a second message (for really long lists of coins)
      if (message_part1.length == 0 && 1950 - message.length <= 40) {
        message_part1 = message;
        message = '';
      }
      message += ordered[k[k0]];
    }
  }

  // Random invite notification message
  message += (Math.random() > 0.99) ? '\n' + quote + ' ' + botInviteAdd : '';

  // Check for confused people looking for help, and prompt them for the real help command
  if (coins.length == 1 && coins.includes('HELP')) {
    message += '\nLooking for the help with using the bot? Use `/help`.';
  }

  // Check for message being too long even after the 2-message split
  if (message.length > 2000) {
    if (interaction) {
      interaction.reply('Error: Your tbpa is too long to send! Please remove some coins and try again. Use `/tbpa-remove` to remove coins.');
      return;
    }
    else {
      channel.send('Error: Your tbpa is too long to send! Please remove some coins and try again. Use `/tbpa-remove` to do this.');
      console.log(pc.magenta('Oversize tbpa notification sent to user above. Size overflow message: ') + pc.cyan(message.length));
      return;
    }
  }

  if (message.length > 0) {
    if (interaction) {
      interaction.reply(messageHeader + message);
    }
    else {
      if (message_part1.length > 0) {
        channel.send(messageHeader + message_part1);
        channel.send(message);
      }
      else {
        channel.send(messageHeader + message);
      }
    }
  }
}


//------------------------------------------
//------------------------------------------

// Function for Crypto Compare prices

function getPriceCC(coins, channel, ext = 'd') {

  let query = coins.concat(['BTC']);

  // Get the spot price of the pair and send it to general
  ccPriceFull(query.map(function (c) { return c.toUpperCase(); }), ['USD', 'BTC'])
    .then(prices => {
      let message = '__CryptoCompare__ Price for:\n';
      // CMC nests its 24h change under quote.USD (see getPriceCMC). Reading it off the top level
      // produced NaN in every CMC-fallback line, and threw outright when the cache was empty.
      let bpchg = parseFloat(cmcArrayDict.BTC?.quote?.USD?.percent_change_24h) || 0;

      for (let i = 0; i < coins.length; i++) {
        let bp, up;

        // Attempt to use CC first, then pull from CMC if there's a failure
        try {
          bp = trimDecimalPlaces(prices[coins[i].toUpperCase()].BTC.PRICE.toFixed(8)) + ' BTC` (`' +
            Math.round(prices[coins[i].toUpperCase()].BTC.CHANGEPCT24HOUR * 100) / 100 + '%`)';
          up = trimDecimalPlaces(parseFloat(prices[coins[i].toUpperCase()].USD.PRICE).toFixed(6)) + ' USD` (`' +
            Math.round((prices[coins[i].toUpperCase()].BTC.CHANGEPCT24HOUR + prices.BTC.USD.CHANGEPCT24HOUR) * 100) / 100 + '%`)';
        } catch {
          if (cmcArrayDict[coins[i].toUpperCase()]) {
            bp = trimDecimalPlaces(convertToBTCPrice(parseFloat(cmcArrayDict[coins[i].toUpperCase()].quote.USD.price))) + ' BTC` (`' +
              Math.round(parseFloat(cmcArrayDict[coins[i].toUpperCase()].quote.USD.percent_change_24h - bpchg) * 100) / 100 + '%`)';
            up = trimDecimalPlaces(parseFloat(cmcArrayDict[coins[i].toUpperCase()].quote.USD.price).toFixed(6)) + ' USD` (`' +
              Math.round(parseFloat(cmcArrayDict[coins[i].toUpperCase()].quote.USD.percent_change_24h) * 100) / 100 + '%`)';
          } else {
            bp = 'unavailable`';
            up = 'unavailable`';
          }
        }
        coins[i] = (coins[i].length > 6) ? coins[i].substring(0, 6) : coins[i];
        message += ('`• ' + coins[i].toUpperCase() + ' '.repeat(6 - coins[i].length) + ' ⇒` `' + (ext === 's' ? bp : up) + '\n');
      }
      channel.send(message);
    })
    .catch(err => {
      // A bare console.log here left the deferred /cc interaction hanging until Discord gave up.
      console.log(pc.red('CryptoCompare price lookup failed: ' + pc.cyan(err)));
      channel.send('Sorry, CryptoCompare price data is unavailable right now. Please try again shortly.');
    });
}


//------------------------------------------
//------------------------------------------

// Function for Bitfinex prices

async function getPriceBitfinex(author, coin1, coin2, channel, coin2Failover) {

  let tickerJSON = '';
  if (!coin2) {
    coin2 = 'BTC';
  }
  if (!coin2Failover) {
    if (coin2.toLowerCase() === 'usd' || coin1.toLowerCase() === 'btc' && (coin2.toLowerCase() !== 'gbp' && !coin2Failover &&
      coin2.toLowerCase() !== 'eur' && coin2.toLowerCase() !== 'dai' && coin2.toLowerCase() !== 'jpy' && coin2.toLowerCase() !== 'eos')) {
      coin2 = 'USDT';
    }
  }

  tickerJSON = await clientBitfinex.fetchTicker(coin1.toUpperCase() + '/' + coin2.toUpperCase()).catch(function () {
    //if re-attempted call failed, exit due to error
    if (coin2Failover) {
      console.log(pc.red(pc.bold('Bitfinex error: Ticker ' + pc.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!')));
      channel.send('API Error:  Bitfinex does not have market symbol __' + coin1.toUpperCase() + '/' + coin2.toUpperCase() + '__');
      return;
    }
    //attempt re-calling with usd coin2 correction if failure occurs
    getPriceBitfinex(author, coin1, 'USD', channel, true);
    //Exit rest of loop for re-run
    return;
  });

  //continue only if response was received
  if (tickerJSON) {
    let s = parseFloat(tickerJSON.last).toFixed(6);
    if (coin2.toUpperCase() === 'BTC') {
      s = parseFloat(tickerJSON.last).toFixed(8);
    }
    s = trimDecimalPlaces(s);
    let c = tickerJSON.percentage;
    c = Math.round(c * 100) / 100;

    if (coin2.toUpperCase() === 'USDT') {
      coin2 = 'USD';
    }

    let ans = '__Bitfinex__ Price for **' + coin1.toUpperCase() + '-' + coin2.toUpperCase() + '** is: `' + s + ' ' + coin2.toUpperCase() + '` ' + '(' + '`' + c + '%' + '`' + ')' + '.';
    channel.send(ans);
  }
}


//------------------------------------------
//------------------------------------------

// Function for Kraken prices

async function getPriceKraken(coin1, coin2, channel) {

  let fail = false;
  let tickerJSON = '';
  if (typeof coin2 === 'undefined') {
    coin2 = 'BTC';
  }
  if (coin2.toLowerCase() === 'usd' || coin1.toLowerCase() === 'btc' && (coin2.toLowerCase() !== 'cad' && coin2.toLowerCase() !== 'eur')) {
    coin2 = 'USD';
  }

  tickerJSON = await clientKraken.fetchTicker(coin1.toUpperCase() + '/' + coin2.toUpperCase()).catch(function () {
    console.log(pc.red(pc.bold('Kraken error: Ticker ' + pc.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!')));
    channel.send('API Error:  Kraken does not have market symbol __' + coin1.toUpperCase() + '/' + coin2.toUpperCase() + '__');
    fail = true;
  });
  if (fail) {
    //exit the function if ticker didn't exist, or api failed to respond
    return;
  }
  let s = parseFloat(tickerJSON.last).toFixed(8);
  s = trimDecimalPlaces(s);
  // Calculate % change from daily opening
  let c = tickerJSON.info.o - s;
  c = (c / tickerJSON.info.o) * 100;
  c = Math.round(c * 100) / 100;
  c = c * -1;

  let ans = '__Kraken__ Price for **' + coin1.toUpperCase() + '-' + coin2.toUpperCase() + '** is: `' + s + ' ' + coin2.toUpperCase() + '` ' + '(' + '`' + c + '%' + '`' + ')' + '.';
  channel.send(ans);
}

//------------------------------------------
//------------------------------------------


// Function for Bitmex prices

async function getPriceMex(coin1, coin2, channel) {

  let s = '';
  let c = '';
  let pair = '';
  let tickerJSON = '';
  let today = new Date();
  let dd = String(today.getDate()).padStart(2, '0');
  let mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
  let yy = today.getFullYear() - 2000;
  let m = '';
  let done = false;
  let fail = false;

  // Figure out current contract code
  if ((mm <= 12 && (mm >= 1 && mm <= 3)) && !done) { if ((mm === 3 && dd >= 28)) { m = 'M'; done = true; } else { m = 'H'; done = true; } }
  if (mm >= 3 && mm <= 6 && !done) { if ((mm === 6 && dd >= 28)) { m = 'U'; done = true; } else { m = 'M'; done = true; } }
  if (mm >= 6 && mm <= 9 && !done) { if ((mm === 9 && dd >= 28)) { m = 'Z'; done = true; } else { m = 'U'; done = true; } }
  if (mm >= 9 && mm <= 12 && !done) { if ((mm === 12 && dd >= 28)) { m = 'H'; } else { m = 'Z'; } }
  let contractCode = m + yy;

  // This implementation changes as the BitMEX contract period code changes every 3 months
  if (coin1) {
    switch (coin1.toUpperCase()) {
      case 'BTC':
        pair = 'XBTUSD';
        coin2 = 'usd';
        break;
      case 'ETH':
        if (!coin2 || coin2 !== 'btc') {
          pair = 'ETHUSD';
          coin2 = 'usd';
          break;
        }
        else {
          pair = 'ETH' + contractCode;
        }
        break;
      default:
        //always default the pair to btc value unless it was specified as usd
        pair = coin1.toUpperCase() + contractCode;
        if (!coin2 || coin2.toUpperCase() !== 'USD') {
          coin2 = 'btc';
        }
    }

    tickerJSON = await bitmex.fetchTicker(pair).catch(function () {
      console.log(pc.red(pc.bold('BitMEX error: Ticker ' + pc.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!')));
      channel.send('API Error:  BitMEX does not have market symbol __' + coin1.toUpperCase() + '/' + coin2.toUpperCase() + '__');
      fail = true;
    });
    if (fail) {
      //exit the function if ticker didn't exist, or api failed to respond
      return;
    }
  }

  //usd conversion just for reference in case someone calls a mex price in usd, cus why not
  if (coin1.toUpperCase() !== 'BTC' && coin1.toUpperCase() !== 'ETH' && coin2 && coin2.toUpperCase() === 'USD') {
    s = tickerJSON.last * parseFloat(cmcArrayDict.BTC.quote.USD.price).toFixed(6);
  }
  else {
    s = tickerJSON.last;
  }
  s = trimDecimalPlaces(s);
  c = tickerJSON.percentage;
  c = Math.round(c * 100) / 100;

  let ans = '__BitMEX__ Price for **' + coin1.toUpperCase() + '-' + coin2.toUpperCase() + '** is: `' + s + ' ' + coin2.toUpperCase() + '` ' + '(' + '`' + c + '%' + '`' + ')' + '.';
  channel.send(ans);
}


//------------------------------------------
//------------------------------------------

// Function for Poloniex prices

async function getPricePolo(coin1, coin2, channel) {

  let fail = false;
  let tickerJSON = '';
  if (typeof coin2 === 'undefined') {
    coin2 = 'BTC';
  }
  if (coin2.toLowerCase() === 'usd' || coin1.toLowerCase() === 'btc' && (coin2.toLowerCase() !== 'eth' &&
    coin2.toLowerCase() !== 'usdc' && coin2.toLowerCase() !== 'trx' && coin2.toLowerCase() !== 'xrp')) {
    coin2 = 'USDT';
  }

  tickerJSON = await clientPoloniex.fetchTicker(coin1.toUpperCase() + '/' + coin2.toUpperCase()).catch(function () {
    console.log(pc.red(pc.bold('Poloniex error: Ticker ' + pc.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!')));
    channel.send('API Error:  Poloniex does not have market symbol __' + coin1.toUpperCase() + '/' + coin2.toUpperCase() + '__');
    fail = true;
  });
  if (fail) {
    //exit the function if ticker didn't exist, or api failed to respond
    return;
  }
  let s = parseFloat(tickerJSON.last).toFixed(8);
  s = trimDecimalPlaces(s);
  let c = tickerJSON.info.percentChange * 100;
  c = Math.round(c * 100) / 100;

  let ans = '__Poloniex__ Price for **' + coin1.toUpperCase() + '-' + coin2.toUpperCase() + '** is: `' + s + ' ' + coin2.toUpperCase() + '` ' + '(' + '`' + c + '%' + '`' + ')' + '.';
  channel.send(ans);
}


//------------------------------------------
//------------------------------------------

// Function for Binance prices

async function getPriceBinance(coin1, coin2, channel) {

  let fail = false;
  let tickerJSON = '';
  if (typeof coin2 === 'undefined') {
    coin2 = 'BTC';
  }
  if (coin2.toLowerCase() === 'usd' || coin1.toLowerCase() === 'btc' && (coin2.toLowerCase() !== 'bnb' &&
    coin2.toLowerCase() !== 'eth' && coin2.toLowerCase() !== 'trx' && coin2.toLowerCase() !== 'xrp')) {
    coin2 = 'USDT';
  }

  tickerJSON = await clientBinance.fetchTicker(coin1.toUpperCase() + '/' + coin2.toUpperCase()).catch(function () {
    console.log(pc.red(pc.bold('Binance error: Ticker ' + pc.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!')));
    channel.send('API Error:  Binance does not have market symbol __' + coin1.toUpperCase() + '/' + coin2.toUpperCase() + '__');
    fail = true;
  });
  if (fail) {
    //exit the function if ticker didn't exist, or api failed to respond
    return;
  }
  let s = parseFloat(tickerJSON.last).toFixed(8);
  s = trimDecimalPlaces(s);
  let c = tickerJSON.info.priceChangePercent;
  c = Math.round(c * 100) / 100;

  let ans = '__Binance__ Price for **' + coin1.toUpperCase() + '-' + coin2.toUpperCase() + '** is: `' + s + ' ' + coin2.toUpperCase() + '` ' + '(' + '`' + c + '%' + '`' + ')' + '.';
  channel.send(ans);
}


//------------------------------------------
//------------------------------------------

// Function for Bittrex prices

// NOTE: Bittrex exchange shut down and was removed from ccxt v4, so this command has been retired.


//------------------------------------------
//------------------------------------------

// Function for grabbing prices of stocks using Finnhub

async function getStocks(coin1, channel) {

  finnhubClient.quote(coin1.toUpperCase(), (error, data) => {
    if (error || (data.o == 0 && data.c == 0)) {
      channel.send(`Error: Ticker **${coin1.toUpperCase()}** not found or API failed to respond.`);
      console.log(`${pc.red('Finnhub API call error for ticker:')} ${pc.cyan(coin1.toUpperCase())}`);
    } else {
      channel.send(`Market price for **$${coin1.toUpperCase()}** is: \`${trimDecimalPlaces(data.c)}\` (\`${(((data.c / data.o) * 100) - 100).toFixed(2)}%\`).`);
    }
  });
}


//------------------------------------------
//------------------------------------------

// Function to grab coin purpose and description data from cached CoinGecko metadata

async function getCoinDescription(coin1, channel, author, interaction) {

  // don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning) {
    const notReadyMessage = `I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`;
    if (interaction) { interaction.reply(notReadyMessage); } else { channel.send(notReadyMessage); }
    console.log(pc.magentaBright('Attempted use of coin description command prior to initialization. Notification sent to user.'));
    return;
  }

  const ticker = cgArrayDictParsed;
  const j = ticker.length;
  let foundCoins = [];
  let logos = [];
  let descriptions = [];
  let logoColors = [];

  // check if coin exists on CG by checking for name, ticker, mc rank, and even cg id
  for (let i = 0; i < j; i++) {
    if (ticker[i].symbol.toUpperCase() === coin1 || (ticker[i].name).toUpperCase() === coin1 ||
      ticker[i].market_cap_rank == coin1 || ticker[i].id.toUpperCase() == coin1) {
      foundCoins.push(ticker[i]); // grab all matches
    }
  }

  if (foundCoins.length > 0) {
    //console.log(chalk.green('Coin description requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1)));

    // grabbing for each coin found with matching input
    for (let index = 0, len = foundCoins.length; index < len; index++) {
      // grab logo and description if found by id in the cache
      for (let j = 0, len = metadata.data.length; j < len; j++) {
        if (metadata.data[j].slug === foundCoins[index].id) {
          if (metadata.data[j].logo) {
            logos.push(metadata.data[j].logo);
            let color = await colorAverager.getAverageColor(metadata.data[j].logo);
            logoColors.push(color.hex);
          } else {
            // default to CoinGecko logo if coin doesn't have one yet
            logos.push('https://i.imgur.com/EnWbbrN.png');
            logoColors.push('#1b51be');
          }
          if (metadata.data[j].description) {
            descriptions.push(metadata.data[j].description);
          } else {
            descriptions.push('*No description available for this coin from CoinGecko yet. Check again later!*');
          }
        }
      }

      // for if coin was found in the tickers cache, but not the metadata cache yet (for brand new coins)
      if (!descriptions[index]) {
        logos.push('https://i.imgur.com/EnWbbrN.png');
        descriptions.push('*Data for this coin has not been cached yet. Check again later!*');
      }

      // check against discord's embed field size limit and cleanly split if necessary
      if (descriptions[index].length <= 2048) {
        const embed = new EmbedBuilder()
          .setTitle('About ' + capitalizeFirstLetter(foundCoins[index].name) + ' (' + foundCoins[index].symbol.toUpperCase() + '):')
          .setDescription(descriptions[index])
          .setColor(logoColors[index])
          .setThumbnail(logos[index])
          .setFooter({ text: 'Powered by CoinGecko', iconURL: 'https://i.imgur.com/EnWbbrN.png' });

        if (interaction) {
          interaction.reply({ embeds: [embed] });
        }
        else {
          channel.send({ embeds: [embed] }).catch(function (reject) {
            channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
            console.log(pc.red('Error sending coin info response: ' + pc.cyan(reject)));
          });
        }
      }
      else {
        let pages = chunkString(descriptions[index], 2048);
        let blockCursor = 1;
        pages.forEach(function (element) {
          const embed = new EmbedBuilder()
            .setTitle('About ' + capitalizeFirstLetter(foundCoins[index].name) + ' (' + foundCoins[index].symbol.toUpperCase() + ')  (PAGE ' + blockCursor + '):')
            .setDescription(element)
            .setColor(logoColors[index])
            .setThumbnail(logos[index])
            .setFooter({ text: 'Powered by CoinGecko', iconURL: 'https://i.imgur.com/EnWbbrN.png' });

          if (interaction) {
            interaction.reply({ embeds: [embed] });
          }
          else {
            channel.send({ embeds: [embed] }).catch(function (reject) {
              channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
              console.log(pc.red('Error sending coin info response: ' + pc.cyan(reject)));
            });
          }
          blockCursor++;
        });
      }
    }
  }
  else {
    if (interaction) {
      interaction.reply('**Error:** __' + coin1 + '__ was not found on CoinGecko. Make sure you are entering either the ticker symbol or full name.');
      return;
    }
    else {
      channel.send('**Error:** __' + coin1 + '__ was not found on CoinGecko. Make sure you are entering either the ticker symbol or full name.');
      return;
    }
  }
}


//------------------------------------------
//------------------------------------------

// Function that retrieves current fear/greed index value

async function getFearGreedIndex(channel, author, interaction) {

  //console.log(chalk.green('Fear/greed index requested by ' + chalk.yellow(author.username)));

  const res = await fetch('https://api.alternative.me/fng/?limit=1&format=json');
  if (res.ok) {
    let color = '#ea0215';
    const data = await res.json();
    let tier = data.data[0].value_classification;
    //calculate embed color based on value
    if (data.data[0].value >= 40 && data.data[0].value <= 60) { color = '#f2f207'; }
    else if (data.data[0].value > 60) { color = '#0eed11'; }
    else if (data.data[0].value < 25) { tier = 'Despair'; }
    //calculate next update countdown
    const d = data.data[0].time_until_update;
    const h = Math.floor(d / 3600);
    const m = Math.floor(d % 3600 / 60);
    //create embed and insert data 
    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Fear/Greed Index', iconURL: 'https://en.bitcoin.it/w/images/en/2/29/BC_Logo_.png' })
      .addFields(
        { name: 'Current Value:', value: data.data[0].value + ' (' + tier + ')', inline: true }
      )
      .setColor(color)
      .setFooter({ text: `Next update: ${h} hrs, ${m} mins` });
    if (interaction) {
      interaction.reply({ embeds: [embed] });
    }
    else {
      channel.send({ embeds: [embed] }).catch(function (reject) {
        channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
        console.log(pc.red('Error sending fear/greed index! : ' + pc.cyan(reject)));
      });
    }
  }
  else {
    console.log(pc.red('Issue fetching fear/greed index: ' + res.status));
    if (interaction) {
      interaction.reply('Sorry, there is an issue processing the fear/greed command at this time. Try again later!');
    }
    else {
      channel.send('Sorry, there is an issue processing the fear/greed command at this time. Try again later!');
    }
  }
}


//------------------------------------------
//------------------------------------------

// Perpetual swap funding rates, read across several exchanges.
//
// This used to open a BitMEX realtime websocket per invocation, count to the 4th message, and never
// close the socket. That leaked a live connection on every call, and because no 'error' listener was
// attached, an unhandled 'error' event would take down the whole process. ccxt's unified
// fetchFundingRate is one REST call per exchange with nothing to clean up, and it lets us cover the
// venues that actually carry the open interest instead of BitMEX alone.

const FUNDING_EXCHANGES = [
  { name: 'Binance', client: () => clientBinanceFutures, symbols: base => [`${base}/USDT:USDT`] },
  { name: 'Bybit', client: () => clientBybit, symbols: base => [`${base}/USDT:USDT`] },
  { name: 'OKX', client: () => clientOkx, symbols: base => [`${base}/USDT:USDT`] },
  // BitMEX lists both a linear USDT perp and the classic inverse contract, so try both shapes.
  { name: 'BitMEX', client: () => bitmex, symbols: base => [`${base}/USDT:USDT`, `${base}/USD:${base}`] }
];

async function fetchFundingRateFrom(exchange, base) {
  for (const symbol of exchange.symbols(base)) {
    try {
      const rate = await exchange.client().fetchFundingRate(symbol);
      if (rate && rate.fundingRate != null) {
        return { exchange: exchange.name, symbol: symbol, ...rate };
      }
    }
    catch {
      // This exchange doesn't list that symbol shape (or is unreachable). Try the next shape, and
      // if none work this venue is simply left out of the embed rather than failing the command.
    }
  }
  return null;
}

async function getFundingRates(coin, channel, interaction) {

  const base = (coin || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const responder = interaction ? null : channel;

  const results = (await Promise.all(
    FUNDING_EXCHANGES.map(exchange => fetchFundingRateFrom(exchange, base))
  )).filter(Boolean);

  if (results.length === 0) {
    const notFound = `No perpetual funding data found for **${base}** on any of the supported exchanges (Binance, Bybit, OKX, BitMEX).`;
    if (interaction) await interaction.editReply(notFound);
    else if (responder) responder.send(notFound);
    return;
  }

  const fields = results.map(result => {
    const ratePercent = (result.fundingRate * 100);
    const arrow = ratePercent >= 0 ? '🟢' : '🔴';

    // Funding intervals are not universally 8 hours: plenty of alt perps settle every 4h or 1h, so
    // assuming 3 payments a day overstates or understates the annualized figure badly. ccxt reports
    // the interval as a string like "8h" when the venue provides it; fall back to 8h only if absent.
    const intervalHours = (() => {
      const match = /^(\d+)h$/.exec(result.interval || '');
      if (match) return Number(match[1]);
      return 8;
    })();
    const paymentsPerYear = (24 / intervalHours) * 365;
    const annualized = (ratePercent * paymentsPerYear).toFixed(1);

    const nextFunding = result.fundingTimestamp || result.nextFundingTimestamp;
    const nextLine = nextFunding
      ? `\nNext: <t:${Math.floor(nextFunding / 1000)}:R>`
      : '';
    return {
      name: `${arrow} ${result.exchange}`,
      value: '`' + ratePercent.toFixed(4) + `%\` every ${intervalHours}h\n(${annualized}%/yr)` + nextLine,
      inline: true
    };
  });

  const averageRate = results.reduce((sum, r) => sum + r.fundingRate, 0) / results.length;

  const embed = new EmbedBuilder()
    .setAuthor({ name: `${base} Perpetual Swap Funding Rates` })
    .setDescription(averageRate >= 0
      ? 'Positive funding: longs are paying shorts.'
      : 'Negative funding: shorts are paying longs.')
    .addFields(fields)
    .setColor(averageRate >= 0 ? '#2ee08a' : '#ff5a76')
    .setFooter({ text: 'Funding rates via ccxt' })
    .setTimestamp();

  if (interaction) {
    await interaction.editReply({ embeds: [embed] });
  }
  else if (responder) {
    responder.send({ embeds: [embed] });
  }
}


//------------------------------------------
//------------------------------------------

// Grabs the current data for Binance long and short positions from Coinalyze

async function getBinanceLongsShorts(channel, author, interaction) {

  //console.log(chalk.green('Binance longs/shorts requested by ' + chalk.yellow(author.username)));

  // Check if Coinalyze API key exists
  if (!keys.coinalyze) {
    const errorMsg = 'Coinalyze API key is missing. Please add it to your keys.api file.';
    console.log(pc.redBright(errorMsg));
    if (interaction) {
      interaction.editReply('Sorry, the longs/shorts command is not configured. Contact the bot administrator.');
    }
    else {
      channel.send('Sorry, the longs/shorts command is not configured. Contact the bot administrator.');
    }
    return;
  }

  try {
    // Get current timestamp and 1 hour ago for the latest data point
    const now = Math.floor(Date.now() / 1000);
    const from = now - 3600; // 1 hour ago

    // Fetch long/short ratio data from Coinalyze API for Binance BTC perpetual
    const res = await fetch(
      `https://api.coinalyze.net/v1/long-short-ratio-history?api_key=${keys.coinalyze}&symbols=BTCUSDT_PERP.A&interval=1hour&from=${from}&to=${now}`
    );

    if (!res.ok) {
      throw new Error(`Coinalyze API returned status ${res.status}`);
    }

    const data = await res.json();

    // Check if data is valid and has history
    if (!data || data.length === 0 || !data[0].history || data[0].history.length === 0) {
      throw new Error('Invalid or empty response from Coinalyze API');
    }

    // Get the latest data point (most recent)
    const latestData = data[0].history[data[0].history.length - 1];

    // Extract percentages (l = long %, s = short %)
    const longsPercent = latestData.l.toFixed(2);
    const shortsPercent = latestData.s.toFixed(2);
    const ratio = latestData.r.toFixed(4);

    // Create and send the embed
    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Binance BTC/USDT Long/Short Ratio', iconURL: 'https://en.bitcoin.it/w/images/en/2/29/BC_Logo_.png' })
      .addFields(
        { name: 'Longs:', value: `${longsPercent}%`, inline: true },
        { name: 'Shorts:', value: `${shortsPercent}%`, inline: true },
        { name: 'Ratio:', value: ratio, inline: true }
      )
      .setThumbnail('https://cryptologos.cc/logos/binance-coin-bnb-logo.png?v=014')
      .setColor('#1b51be')
      .setFooter({ text: 'Coinalyze Real-Time', iconURL: 'https://coinalyze.net/og-image.png' });

    if (interaction) {
      interaction.editReply({ embeds: [embed] });
    }
    else {
      channel.send({ embeds: [embed] }).catch(function (reject) {
        channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
        console.log(pc.red('Error sending longs/shorts! : ' + pc.cyan(reject)));
      });
    }
  }
  catch (err) {
    // Handle any errors
    console.log(pc.redBright('Longs/shorts command failed! Error details: \n' + pc.yellow(err.stack)));
    if (interaction) {
      interaction.editReply('Sorry, there was an issue processing the longs/shorts command at this time. Try again later!');
    }
    else {
      channel.send('The longs/shorts command is having issues at the moment. This has been logged and will be looked into shortly.');
    }
  }
}


//------------------------------------------
//------------------------------------------

// Function that converts value of one coin into value in terms of another coin using CG prices

function priceConversionTool(coin1, coin2, amount, channel, author, interaction) {

  // Remove potential commas in amount
  if (amount) amount = amount.replace(/,/g, '');

  // Validate user input
  if (!coin1 || !coin2 || !amount || isNaN(amount)) {
    if (amount && isNaN(amount)) {
      if (interaction) {
        interaction.editReply('Invalid amount! Please enter a valid amount!');
      }
      else {
        channel.send('Invalid amount entered.');
      }
    }
    if (!interaction) {
      // show help message and then exit if wrong input is provided
      channel.send('**Here\'s how to use the currency conversion command:**\n ' +
        ':small_blue_diamond: Format: `/convert <quantity> <FROM coin> <TO coin>`\n ' +
        ':small_blue_diamond: Examples: `/convert 20 eth usd`  `/convert 10 usd cad`\n ' +
        ':small_blue_diamond: Supported cryptos: `All CoinGecko-listed coins`\n ' +
        ':small_blue_diamond: Supported fiat currencies: `' + Object.keys(forexRates).join(', ') + '`');
    }
    return;
  }

  // Don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning) {
    if (interaction) {
      interaction.editReply(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      return;
    }
    else {
      channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      console.log(pc.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
      return;
    }
  }

  // Setup
  coin1 = coin1.toUpperCase() + '';
  coin2 = coin2.toUpperCase() + '';
  let isForexPairingCoin1 = false;
  let isForexPairingCoin2 = false;

  //console.log(chalk.green('Currency conversion tool requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1) + ' --> ' + chalk.cyan(coin2)));

  try {
    if (Object.keys(forexRates).includes(coin1)) {
      isForexPairingCoin1 = true;
    }
    if (Object.keys(forexRates).includes(coin2)) {
      isForexPairingCoin2 = true;
    }

    // Look up IDs for coins requested (if cryptos)
    let found1 = (isForexPairingCoin1) ? true : false;
    let found2 = (isForexPairingCoin2) ? true : false;
    if (!found1 || !found2) {
      for (let i = 0, len = cgArrayDictParsed.length; i < len; i++) {
        if (!found1 && cgArrayDictParsed[i].symbol.toUpperCase() == coin1) {
          found1 = true;
        }
        if (!found2 && cgArrayDictParsed[i].symbol.toUpperCase() == coin2) {
          found2 = true;
        }
      }
    }

    //if both IDs were found, grab price, %change, and name data from API and/or the forex rate cache
    if (found1 && found2) {
      (async () => {
        let cgData, cgData2, price1, price2;
        if (isForexPairingCoin1) {
          price1 = 1 / forexRates[coin1];
        }
        else {
          cgData = await getPriceCoinGecko(coin1, 'usd', channel, 'convert');
        }
        if (isForexPairingCoin2) {
          price2 = 1 / forexRates[coin2];
        }
        else {
          cgData2 = await getPriceCoinGecko(coin2, 'usd', channel, 'convert');
        }

        // A coin can be listed but have no usable cached price (de-listed or inactive listings carry
        // a null current_price). Report that instead of computing with NaN.
        const missingCoin = (!isForexPairingCoin1 && !cgData) ? coin1
          : (!isForexPairingCoin2 && !cgData2) ? coin2
            : null;
        if (missingCoin) {
          const noPriceMessage = `Sorry, no current price is available for **${missingCoin}**. It may be de-listed or inactive on CoinGecko.`;
          if (interaction) await interaction.editReply(noPriceMessage);
          else if (channel) channel.send(noPriceMessage);
          return;
        }

        let builtMessage = '';
        let amount2;
        if (cgData2) {
          for (let i = 0; i < cgData2[0].length; i++) {
            //select the prices from the API response and then calculate the converted amount
            if (!isForexPairingCoin1) price1 = parseFloat(cgData[0][0]).toFixed(8);
            price2 = parseFloat(cgData2[0][i]).toFixed(8);
            let name = cgData2[2][i];
            amount2 = (amount * price1) / (price2);
            if (cgData2[0].length > 1)
              builtMessage += '`' + amount + ' ' + coin1 + ' ` ➪ ` ' + numberWithCommas(amount2.toFixed(6)) + ' ' + coin2 + '` (' + name.toUpperCase() + ')\n';
            else
              builtMessage += '`' + amount + ' ' + coin1 + ' ` ➪ ` ' + numberWithCommas(amount2.toFixed(6)) + ' ' + coin2 + '`';
          }
        }
        else {
          if (!isForexPairingCoin1) price1 = parseFloat(cgData[0][0]).toFixed(8);
          amount2 = (amount * price1) / (price2);
          builtMessage += '`' + amount + ' ' + coin1 + ' ` ➪ ` ' + numberWithCommas(amount2.toFixed(6)) + ' ' + coin2 + '`';
        }

        if (interaction) {
          await interaction.editReply(builtMessage);
        }
        else {
          channel.send(builtMessage);
        }
      })().catch(err => {
        // This IIFE is detached from the try/catch around it, so without this the deferred reply
        // would simply never be edited and the command would appear to hang.
        console.error('Issue with currency conversion command! Details: ' + err);
        if (interaction) {
          interaction.editReply('Sorry, there was an issue processing the conversion command at this time. Try again later!').catch(() => { });
        }
        else if (channel) {
          channel.send('Sorry, there was an issue processing the conversion command at this time. Try again later!');
        }
      });
    }
    else {
      if (interaction) {
        interaction.editReply('One or more of your coins were not found on CoinGecko or available fiat pairs. Check your input and try again!');
      }
      else {
        channel.send('One or more of your coins were not found on CoinGecko or available fiat pairs. Check your input and try again!' + '\nIf you need help, use `/help` to see the guide for this command.');
      }
    }
  }
  catch (err) {
    console.error('Issue with currency conversion command! Details: ' + err);
    // reply to user if this was an interaction
    if (interaction) {
      interaction.editReply('Sorry, there was an issue processing the conversion command at this time. Try again later!');
    }
    else {
      channel.send('Sorry, there was an issue processing the conversion command at this time. Try again later!');
    }
    return;
  }
}


//------------------------------------------
//------------------------------------------

// Tags handler function

// Persist the tags cache. tagsJSON is already the source of truth in memory, so the old
// write-then-read-it-straight-back-in round trip was pure overhead on every mutation.
//
// Writes are chained rather than run concurrently: two tag edits landing together would otherwise
// race on the same temp file, and one rename could publish a half-written snapshot. The unique
// temp name makes that impossible even if a write somehow escapes the chain.
let tagsSaveChain = Promise.resolve();
let tagsSaveCounter = 0;

async function writeTagsSnapshot() {
  const finalPath = 'tags.json';
  const tempPath = `${finalPath}.${process.pid}.${tagsSaveCounter++}.tmp`;
  // Serialized inside the chained task, so each write persists the state current at its turn.
  const json = JSON.stringify(tagsJSON);
  try {
    await fs.promises.writeFile(tempPath, json, 'utf8');
    await fs.promises.rename(tempPath, finalPath);
  }
  catch (err) {
    await fs.promises.unlink(tempPath).catch(() => { /* no temp file to clean up */ });
    throw err;
  }
}

function saveTagsToFile() {
  const result = tagsSaveChain.then(writeTagsSnapshot);
  // The chain we hold onto must always settle successfully. Storing the rejected promise instead
  // would make every later .then() skip its write, so one failed save would disable saving entirely.
  tagsSaveChain = result.catch(() => { });
  return result;
}

function tagsEngine(channel, author, timestamp, guild, command, tagName, tagLink, memberPermissions) {

  console.log(pc.green('Tags engine called by ' + pc.yellow(author.username) + ' with command:tagname:link ' + pc.cyan(command) + ':' + pc.cyan(tagName) + ':' + pc.cyan(tagLink)));

  let valid = false;
  let validTag = false;
  let name = null;
  let tag = null;
  let resultName = null;
  let resultTag = null;
  let resultAuthorName = null;
  let resultAuthorAvatar = null;
  let resultAuthorId = null;
  let resultTimestamp = null;
  let tagList = [];

  if (command && tagName && tagLink && validURL(tagLink)) {
    name = tagName.toString().toLowerCase();
    tag = tagLink;
    valid = true;
  }

  if (tagName && !validURL(tagName)) {
    validTag = true;
  }

  if (command === 'createtag' && valid) {
    //load current tags cache and set checkup flag
    let obj = tagsJSON;
    let tags = tagsJSON.tags;
    let fail = false;

    //collision detection for creating tags that already exist
    for (let i = 0; i < tags.length; i++) {
      if (tags[i].guild === guild.id && !fail) {
        if (name === tags[i].tagName.toLowerCase()) {
          channel.send('That tag already exists! Use a different name and try again.');
          fail = true;
        }
      }
    }

    if (!fail) {
      //proceed to create the new tag upon all checks succeeding
      obj.tags.push({
        guild: guild.id,
        authorName: author.username,
        authorAvatar: author.displayAvatarURL(),
        authorId: author.id,
        timestamp: timestamp,
        tagName: name,
        tagLink: tag
      }); //add a fresh tag
      tagsJSON = obj;
      saveTagsToFile().catch(err => console.log(pc.red('Failed to save tags: ' + pc.cyan(err))));
      console.log(pc.blue('Tag ' + '"' + tagName + '"' + ' created!'));
      channel.send('Tag ' + '"' + tagName + '"' + ' created!');
    }

  } else if (command === 'deletetag' && validTag) {
    let tags = tagsJSON.tags;
    for (let i = 0; i < tags.length; i++) {
      if (tags[i].guild === guild.id) {
        if (tagName.toString().toLowerCase() === tags[i].tagName) {
          // Only the tag's creator or a moderator may delete it. Matching on guild + name alone let
          // any member of the server delete anyone else's tag.
          const isOwner = tags[i].authorId && tags[i].authorId === author.id;
          const isModerator = memberPermissions
            ? (memberPermissions.has(PermissionFlagsBits.ManageMessages) || memberPermissions.has(PermissionFlagsBits.ManageGuild))
            : false;
          if (!isOwner && !isModerator) {
            channel.send(`Only the creator of "${tags[i].tagName}" (or a moderator with Manage Messages) can delete it.`);
            return;
          }

          resultName = tags[i].tagName;
          tags.splice(i, 1);
          tagsJSON.tags = tags;
          saveTagsToFile().catch(err => console.log(pc.red('Failed to save tags: ' + pc.cyan(err))));
          channel.send('Tag ' + '"' + resultName + '"' + ' deleted.');
          console.log(pc.blue('Tag ' + '"' + pc.yellow(tagName) + '"' + ' deleted!'));
          return;
        }
      }
    }
    channel.send(`No tag named "${tagName}" exists in this server.`);

  } else if (command === 'taglist') {
    let tags = tagsJSON.tags;
    let found = false;
    for (let i = 0; i < tags.length; i++) {
      if (tags && (tags[i].guild === guild.id)) {
        tagList.push(tags[i].tagName);
        found = true;
      }
    }
    if (!found) {
      channel.send('There are no tags in this server! Feel free to make one using `/tag create`');
    }
    else {
      let message = '';
      tagList.forEach(function (item) {
        message += item + ', ';
      });

      // check against discord's embed field size limit and split if necessary
      if (message.length <= 1024) {

        const embed = new EmbedBuilder()
          .setAuthor({ name: 'Tsuki Tags', iconURL: 'https://i.imgur.com/r6yCs2T.png' })
          .addFields(
            { name: 'Available tags in this server: ', value: message.substring(0, message.length - 2), inline: false }
          )
          .setColor('#1b51be')
          .setFooter({ text: 'To see a tag, use  /tag view' });

        channel.send({ embeds: [embed] }).catch(function (reject) {
          channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
          console.log(pc.red('Error sending taglist! : ' + pc.cyan(reject)));
        });
      }
      else {
        const pages = message.match(/.{1,1024}/g); //array of the 1024 character chunks of text
        let blockCursor = 1;
        const blockMax = pages.length;

        pages.forEach(function (element) {
          // special case for the final page. This one will remove the trailing the commas in the list.
          if (blockMax === blockCursor) {
            const embed = new EmbedBuilder()
              .setAuthor({ name: 'Tsuki Tags', iconURL: 'https://i.imgur.com/r6yCs2T.png' })
              .addFields(
                { name: 'Available tags in this server (PAGE ' + blockCursor + '): ', value: element.substring(0, element.length - 2), inline: false }
              )
              .setColor('#1b51be')
              .setFooter({ text: 'To see a tag, use  /tag view' });

            channel.send({ embeds: [embed] }).catch(function (reject) {
              channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
              console.log(pc.red('Error sending taglist! : ' + pc.cyan(reject)));
            });
          }

          else {
            const embed = new EmbedBuilder()
              .setAuthor({ name: 'Tsuki Tags', iconURL: 'https://i.imgur.com/r6yCs2T.png' })
              .addFields(
                { name: 'Available tags in this server (PAGE ' + blockCursor + '): ', value: element, inline: false }
              )
              .setColor('#1b51be')
              .setFooter({ text: 'To see a tag, use  /tag view' });

            channel.send({ embeds: [embed] }).catch(function (reject) {
              channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
              console.log(pc.red('Error sending taglist! : ' + pc.cyan(reject)));
            });
            blockCursor++;
          }
        });
      }
    }

  } else if (command === 'tag' && validTag) {
    let tags = tagsJSON.tags;
    for (let i = 0; i < tags.length; i++) {
      if (tags[i].guild === guild.id) {
        if (tagName.toString().toLowerCase() === tags[i].tagName) {
          resultAuthorAvatar = tags[i].authorAvatar;
          resultAuthorName = tags[i].authorName;
          resultAuthorId = tags[i].authorId;
          resultName = tags[i].tagName;
          resultTag = tags[i].tagLink;
          resultTimestamp = tags[i].timestamp;
          break;
        }
      }
    }

    if (null === resultName) {
      channel.send('That tag doesn\'t exist!');
      return;
    }

    // Build and send the tag embed, using the provided footer icon (the creator's current avatar when available)
    const sendTagEmbed = (iconURL) => {
      const tagFooter = { text: resultAuthorName || 'Tsuki Tags' };
      if (iconURL) tagFooter.iconURL = iconURL;

      const embed = new EmbedBuilder()
        .setAuthor({ name: 'Tsuki Tags', iconURL: 'https://i.imgur.com/r6yCs2T.png' })
        .addFields(
          { name: 'Tag: "' + resultName + '"', value: resultTag, inline: false }
        )
        .setImage(resultTag)
        .setColor('#1b51be')
        .setTimestamp(resultTimestamp)
        .setFooter(tagFooter);

      channel.send({ embeds: [embed] }).catch(function (reject) {
        channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
        console.log(pc.red('Error sending tag! : ' + pc.cyan(reject)));
      });
    };

    // Retrieve the creator's current avatar live if we have their ID, otherwise fall back to the stored avatar
    if (resultAuthorId) {
      guild.client.users.fetch(resultAuthorId)
        .then(user => sendTagEmbed(user.displayAvatarURL()))
        .catch(() => sendTagEmbed(resultAuthorAvatar));
    } else {
      sendTagEmbed(resultAuthorAvatar);
    }

  } else {
    channel.send('**Here\'s how to use Tsuki tags:**\n ' +
      ':small_blue_diamond: To make a new tag: `/tag create name:<name> link:<url>`\n' +
      ':small_blue_diamond: To view a tag: `/tag view name:<name>`\n' +
      ':small_blue_diamond: To list every tag in this server: `/tag list`\n' +
      ':small_blue_diamond: To delete a tag you created: `/tag delete name:<name>`');
    return;
  }
}


//------------------------------------------
//------------------------------------------

// From the etherscan api, get the balance
// for a given ethereum address. The balance is returned
// in weis.

async function getEtherBalance(author, address, channel, action = 'b') {

  if (action === 'b') {
    console.log(pc.green(`Etherscan balance lookup called in: ${pc.cyan(describeGuild(channel))} by ${pc.yellow(author.username)}`));
    const res = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=account&action=balance&address=${encodeURIComponent(address)}&tag=latest&apikey=${keys.etherscan}`);
    if (res.ok) {
      const balance = await res.json();
      if (balance.status === '1' && !isNaN(balance.result)) {
        channel.send(`The total ether registered for ${address} is: \`${balance.result / 1000000000000000000} ETH\`.`);
      }
      else {
        console.log(pc.red('Issue fetching account balance from etherscan:'), balance.message, balance.result);
        channel.send('There\'s an issue with fetching account balance from etherscan. Please try again later.');
        return;
      }
    }
    else {
      console.log(pc.red('Issue fetching account balance from etherscan:'), res.status);
      channel.send('There\'s an issue with fetching account balance from etherscan. Please try again later.');
      return;
    }
  } else if (action === 'ens') {
    // Awaited with a catch: an unreachable Infura endpoint or a malformed name used to reject with
    // nothing attached, which left the caller's deferred reply hanging forever.
    let owner;
    try {
      owner = await web3eth.eth.ens.getOwner(address);
    }
    catch (err) {
      console.log(pc.red('ENS lookup failed: ' + pc.cyan(err && err.message ? err.message : err)));
      channel.send('Sorry, I couldn\'t look up that ENS name right now. Please try again later.');
      return;
    }

    // check for unregistered ENS name, and then send not found notification and ENS link to potentially register that name
    if (owner == '0x0000000000000000000000000000000000000000') {
      console.log(pc.green(`Etherscan ENS registration sent for ${pc.yellow(address)} in ${pc.cyan(describeGuild(channel))}`));
      const addy = 'https://app.ens.domains/name/' + encodeURIComponent(address);
      const embed = new EmbedBuilder()
        .setTitle('That ENS name is not yet registered!')
        .setDescription(`Want to make it yours?  [CLICK HERE!](${addy})`)
        .setThumbnail('https://imgur.com/jUMEIgL.png')
        .setColor('#1b51be');
      channel.send({ embeds: [embed] }).catch(function (reject) {
        channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
        console.log(pc.red(`Error sending etherscan command's ENS not found message embed! : ${pc.cyan(reject)}`));
      });
    }
    else {
      await getEtherBalance(author, owner, channel);
    }
  }
  else {
    console.log(pc.green(`Etherscan txn lookup called in: ${pc.cyan(describeGuild(channel))} by ${pc.yellow(author.username)}`));
    const res = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_blockNumber&apikey=${keys.etherscan}`);
    const res2 = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getTransactionByHash&txhash=${encodeURIComponent(address)}&apikey=${keys.etherscan}`);
    if (res.ok && res2.ok) {
      const block = await res.json();
      const tx = await res2.json();
      if (tx.result !== null) {
        if (tx.result.blockNumber !== null) {
          channel.send('Transaction included in block `' + Number(Web3.utils.hexToNumber(tx.result.blockNumber)) + '`.' +
            (block.result ? ' Confirmations: `' + (1 + Number(Web3.utils.hexToNumber(block.result)) - Number(Web3.utils.hexToNumber(tx.result.blockNumber))) + '`' : ''));
        } else {
          channel.send('Transaction not yet mined.');
        }
      } else {
        channel.send('Transaction not found. (Neither mined nor broadcasted.)');
      }
    }
    else {
      console.log(pc.red('Issue fetching transaction details from etherscan:'), res.status, res2.status);
      channel.send('There\'s an issue with fetching transaction details from etherscan. Please try again later.');
      return;
    }
  }
}


//------------------------------------------
//------------------------------------------

// Collect Ethereum gas tracking stats
// from Etherscan.


async function getEtherGas(channel, author, interaction) {

  //console.log(chalk.green('Etherscan gas data requested by ' + chalk.yellow(author.username)));

  const res = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=gastracker&action=gasoracle&apikey=${keys.etherscan}`)
    .catch(function (error) {
      // handle fetch error
      console.log(pc.red('Error encountered during fetch for Etherscan gas command: ' + error));
      channel.send('Sorry, there is temporarily an issue with the gas command. Try again later.');
    });
  if (res && res.ok) {
    const data = await res.json();
    if (data.status !== '1' || typeof data.result !== 'object') {
      console.log(pc.red('Issue fetching gas data from etherscan:'), data.message, data.result);
      const errMsg = 'There\'s an issue with fetching gas data from etherscan. Please try again later.';
      if (interaction) { interaction.reply(errMsg); } else { channel.send(errMsg); }
      return;
    }
    // Format a gas value to a max of 3 decimal places, but show more precision if 3 places would round to all zeros
    const formatGas = (value) => {
      const num = parseFloat(value);
      if (isNaN(num)) return value;
      if (num === 0) return '0';
      const formatted = num.toFixed(3);
      if (parseFloat(formatted) === 0) {
        // 3 decimals would round the value away, so show 3 significant figures instead
        let precise = num.toPrecision(3);
        if (precise.includes('e')) precise = num.toFixed(20).replace(/0+$/, '');
        return precise;
      }
      // trim any trailing zeros from the 3-decimal value
      return formatted.replace(/\.?0+$/, '');
    };

    // assemble the final message as message embed object
    const embed = new EmbedBuilder()
      .setTitle('Ethereum Gas Tracker')
      .addFields(
        { name: 'Slow:', value: `${formatGas(data.result.SafeGasPrice)} gwei\n~ 10 minutes \u200B\u200B`, inline: true },
        { name: 'Average:', value: `${formatGas(data.result.ProposeGasPrice)} gwei\n~ 3 minutes \u200B\u200B`, inline: true },
        { name: 'Fast:', value: `${formatGas(data.result.FastGasPrice)} gwei\n~ 30 seconds \u200B\u200B`, inline: true }
      )
      .setColor('#1b51be')
      .setThumbnail('https://kittyhelper.co/local/templates/main/images/ETHgas.png')
      .setFooter({ text: 'Powered by Etherscan', iconURL: 'https://etherscan.io/images/brandassets/etherscan-logo-circle.png' });

    // Send it
    try {
      if (interaction) {
        interaction.reply({ embeds: [embed] });
      }
      else {
        channel.send({ embeds: [embed] });
      }
    }
    catch (reject) {
      if (interaction) {
        interaction.reply('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
      }
      else {
        channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
      }
      console.log(pc.red('Error sending eth gas response embed: ' + pc.cyan(reject)));
    }
  }
}

//------------------------------------------
//------------------------------------------

// Send top 5 biggest gainer and loser
// coins of the past 24hrs

function getBiggestMovers(channel, author) {

  //don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning) {
    channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
    console.log(pc.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
    return;
  }

  // filter out coins that don't have BOTH a valid mc rank AND 24h % change.
  // The field is price_change_percentage_24h; testing the (non-existent) price_change_percentage
  // meant the check always passed, letting null-change coins reach the comparator below as NaN.
  const cgdatatemp = cgArrayDictParsed.filter(function (value) {
    return value.market_cap_rank != null && value.price_change_percentage_24h != null && value.total_volume >= 10000;
  });
  // now sort the result by 24 % change in descending order
  cgdatatemp.sort(function (a, b) {
    return b.price_change_percentage_24h - a.price_change_percentage_24h;
  });
  // forward to the prices command
  const top5 = cgdatatemp.slice(0, 5);
  const bottom5 = cgdatatemp.slice(cgdatatemp.length - 5, cgdatatemp.length);
  const preparedArr = top5.concat(bottom5);
  let idArr = [];
  preparedArr.forEach((value) => {
    idArr.push(value.id);
  });
  getPriceCG(idArr, channel, 'm');

  console.log(pc.green('CoinGecko biggest movers command called in: ' + pc.yellow(describeGuild(channel)) + ' by ' + pc.yellow(author.username)));
}


//------------------------------------------
//------------------------------------------

// Send Coin360 coins heatmap
function sendCoin360Heatmap(message, interaction) {

  //console.log(`${chalk.green('Coin360 heatmap command called by:')} ${chalk.yellow(message.member.user.tag)}`);

  // Hmap image is cached in 30 min cycles by scheduler, we just need to send it here

  if (interaction) {
    // The cached image is missing until the first successful capture (and after a failed one), so
    // this can reject. Without the catch the user is left with a spinner and no reply at all.
    interaction.reply({
      files: [{
        attachment: 'chartscreens/generated-charts/hmap.png',
        name: 'hmap.png'
      }]
    }).catch(function (error) {
      console.log(pc.red('Error sending hmap image: ' + error));
      interaction.reply('Sorry, the heatmap image isn\'t available right now. It refreshes every 30 minutes, so please try again shortly.')
        .catch(() => interaction.editReply('Sorry, the heatmap image isn\'t available right now. Please try again shortly.').catch(() => { }));
    });
  }
  else {
    message.channel.send({
      files: [{
        attachment: 'chartscreens/generated-charts/hmap.png',
        name: 'hmap.png'
      }]
    }).catch(function (error) {
      console.log(pc.red('Error sending hmap image: ' + error));
      message.channel.send('Sorry, I was unable to send the heatmap image. Please try again later.');
    });
  }
}


//------------------------------------------
//------------------------------------------

// Function for getting total market cap data and BTC/ETH dominance from CG

async function getMarketCap(message, interaction) {

  //console.log(chalk.yellow(message.author.username) + chalk.green(' requested global market cap data'));

  // don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning) {
    if (interaction) {
      interaction.reply(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      return;
    }
    else {
      message.channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      console.log(pc.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
      return;
    }
  }

  await cgGlobal().then((data) => {
    // One .data level, not two: the old package added an envelope on top of the API's own
    // { data: ... } response. cgGlobal returns the API response as-is.
    const mcTotalUSD = data.data.total_market_cap.usd;
    let ethMarketCap;
    for (let i = 0; i < cgArrayDictParsed.length; i++) { if (cgArrayDictParsed[i].id == 'ethereum') { ethMarketCap = cgArrayDictParsed[i].market_cap; break; } }
    const btcDominance = parseFloat((cgArrayDict.BTC.market_cap / mcTotalUSD) * 100).toFixed(2);
    const ethDominance = parseFloat((ethMarketCap / mcTotalUSD) * 100).toFixed(2);
    if (interaction) {
      interaction.reply(`**[all]** \`$ ${numberWithCommas(mcTotalUSD)} \` BTC dominance: \`${btcDominance}%\`,  ETH dominance: \`${ethDominance}%\``);
    }
    else {
      message.channel.send(`**[all]** \`$ ${numberWithCommas(mcTotalUSD)} \` BTC dominance: \`${btcDominance}%\`,  ETH dominance: \`${ethDominance}%\``);
    }
  });
}



//------------------------------------------
//------------------------------------------

// Function for getting market cap data of a specific coin from CG

function getMarketCapSpecific(message, interaction) {

  //don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning) {
    if (interaction) {
      interaction.editReply(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      return;
    }
    else {
      message.channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      console.log(pc.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
      return;
    }
  }

  let cur = '';
  if (interaction) {
    cur = message;
  }
  else {
    //cut the command prefixes and any leading/trailing spaces
    cur = message.content.toLowerCase().replace('.tb', '').replace('-t ', '').replace('mc', '').trimStart().trimEnd();
    cur = cur.toUpperCase();
  }

  //if (cur === 'HAMMER') { message.channel.send('https://youtu.be/otCpCn0l4Wo?t=14'); return; }

  //collect and process cached cg api data 
  (async () => {
    //console.log(chalk.yellow(message.author.username) + chalk.green(' requested MC of: ' + chalk.cyan(cur)));
    let success = false;
    const ticker = cgArrayDictParsed;
    const j = ticker.length;
    for (let i = 0; i < j; i++) {
      if (ticker[i].symbol.toUpperCase() === cur || ticker[i].name.toUpperCase() === cur || ticker[i].market_cap_rank + '' === cur) {
        const name = ticker[i].name;
        const slug = ticker[i].id;
        const price = ticker[i].current_price;
        const percent = ticker[i].price_change_percentage_24h_in_currency;
        const rank = ticker[i].market_cap_rank;
        const percent7 = ticker[i].price_change_percentage_7d_in_currency;
        const percent30 = ticker[i].price_change_percentage_30d_in_currency;
        const percent1y = ticker[i].price_change_percentage_1y_in_currency;
        //const mcappercent = ticker[i].market_cap_change_percentage_24h;
        //const ath = ticker[i].ath;
        //const athdate = (ticker[i].ath_date) ? ticker[i].ath_date.substring(0, 10) : ticker[i].ath_date;
        //const percentath = ticker[i].ath_change_percentage;
        //const low24hr = ticker[i].low_24h;
        //const high24hr = ticker[i].high_24h;
        const symbol = ticker[i].symbol.toUpperCase();
        const volume = ticker[i].total_volume;
        const marketcap = ticker[i].market_cap;
        const supply = ticker[i].circulating_supply;
        const totalSupply = ticker[i].total_supply;
        const maxSupply = ticker[i].max_supply;
        const percent1h = ticker[i].price_change_percentage_1h_in_currency;
        let logoColor = '#1b51be';
        let priceETH, priceBTC;
        if (symbol == 'ETH') { priceETH = 1; } else { priceETH = convertToETHPrice(price).toFixed(6); }
        if (symbol == 'BTC') { priceBTC = 1; } else { priceBTC = convertToBTCPrice(price).toFixed(8); }

        // TODO: Need to add these commented data fields to the message still, but need to figure out a way to make it look pretty first

        //checking for missing data and generating the text lines that will be used in the final response message
        const l1 = (rank) ? `MC Rank: #${rank}\n` : 'MC Rank: n/a\n';
        const l2 = (marketcap) ? `Market Cap: ${abbreviateNumber(parseInt(marketcap), 1)} USD\n` : 'Market Cap: n/a\n';
        const l3 = (volume) ? `24hr volume: ${abbreviateNumber(parseInt(volume), 1)} USD\n` : '24hr volume: n/a\n';
        const l4 = (supply) ? `In Circulation: ${numberWithCommas(parseInt(supply))} ${symbol}\n` : 'In Circulation: n/a\n';
        const l5 = (totalSupply) ? `Total Supply: ${numberWithCommas(parseInt(totalSupply))} ${symbol}\n` : 'Total Supply: n/a\n';
        const l6 = (maxSupply) ? `Max Supply: ${numberWithCommas(parseInt(maxSupply))} ${symbol}\n` : 'Max Supply: n/a\n';
        const l71 = (price) ? `USD: \`${trimDecimalPlaces(parseFloat(price).toFixed(6))}\`\n` : 'USD: n/a\n';
        //const l72 = (price)       ?  `24h H: \`${trimDecimalPlaces(parseFloat(high24hr).toFixed(6))}\`\n`      : `24h H: n/a\n`;
        //const l73 = (price)       ?  `24h L: \`${trimDecimalPlaces(parseFloat(low24hr).toFixed(6))}\`\n`       : `24h L: n/a\n`;
        //const l74 = (ath)         ?  `ATH: \`${trimDecimalPlaces(ath)} \`\n`                                   : `ATH: n/a\n`;
        const l75 = (price) ? `BTC: \`${trimDecimalPlaces(priceBTC)}\`\n` : 'BTC: n/a\n';
        const l76 = (price) ? `ETH: \`${trimDecimalPlaces(priceETH)}\`` : 'ETH: n/a';
        const l81 = (percent1h || percent1h == 0) ? `1h: \u200B\u200B\u200B\u200B  \`${parseFloat(percent1h).toFixed(2)}%\`\n` : '1h:  n/a\n';
        const l82 = (percent || percent == 0) ? `24h: \`${parseFloat(percent).toFixed(2)}%\`\n` : '24h: n/a\n';
        const l83 = (percent7 || percent7 == 0) ? `7d: \u200B\u200B\u200B\u200B  \`${parseFloat(percent7).toFixed(2)}%\`\n` : '7d:  n/a\n';
        const l84 = (percent30 || percent30 == 0) ? `1m: \`${parseFloat(percent30).toFixed(2)}%\`\n` : '1m: n/a\n';
        const l85 = (percent1y || percent1y == 0) ? `1y: \u200B \`${parseFloat(percent1y).toFixed(2)}%\`` : '1y: n/a';
        //l86 = (mcappercent || mcappercent == 0) ?  `MC 24h: \`${parseFloat(mcappercent).toFixed(2)}%\`\n`                    : `MC 24h: n/a\n`;
        //l87 = (percentath || percentath == 0)  ?  `From ATH: \`${parseFloat(percentath).toFixed(2)}%\`\n`                   : `From ATH: n/a\n`;
        //l88 = (athdate)     ?  `ATH day: \`${athdate}\``                                                 : `ATH day: n/a`;

        //grabbing coin logo (defaults to CoinGecko logo if coin logo doesn't exist)
        let logo = 'https://i.imgur.com/EnWbbrN.png';
        for (let j = 0, len = metadata.data.length; j < len; j++) {
          if (metadata.data[j].slug === slug) {
            if (metadata.data[j].logo) {
              logo = metadata.data[j].logo;
              await colorAverager.getAverageColor(logo).then(color => {
                logoColor = color.hex;
              });
            }
          }
        }

        //assemble the final message as message embed object
        const embed = new EmbedBuilder()
          .addFields(
            { name: name + ' (' + symbol + ')', value: l1 + l2 + l3 + l4 + l5 + l6, inline: false },
            { name: 'Current Prices:', value: l71 + l75 + l76, inline: true },
            { name: 'Price Changes:', value: l81 + l82 + l83 + l84 + l85, inline: true },
          )
          .setColor(logoColor)
          .setThumbnail(logo)
          .setFooter({ text: 'Powered by CoinGecko', iconURL: 'https://i.imgur.com/EnWbbrN.png' });

        //send it

        if (interaction) {
          await interaction.editReply({ embeds: [embed] });
          success = true;
        }
        else {
          try {
            message.channel.send({ embeds: [embed] });
            success = true;
          }
          catch (reject) {
            message.channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
            console.log(pc.red('Error sending MC response embed: ' + pc.cyan(reject)));
          }
        }
        // Duplicate tickers are common on CoinGecko. Stop at the first (highest ranked) match rather
        // than replying once per match, which rejected on every reply after the first.
        break;
      }
    }
    if (!success) {
      if (interaction) {
        await interaction.editReply('Sorry, I was unable to find that coin.');
      }
      else {
        message.channel.send('Failed to find a CoinGecko coin associated with that input.\nTry again with either the full name, or the ticker symbol.');
        console.log(pc.red(`Failed to find matching coin for input to mc command of: ${pc.cyan(cur)}`));
      }
    }
  })().catch(err => {
    console.log(pc.red('Error in getMarketCapSpecific: ' + pc.cyan(err)));
    if (interaction) {
      interaction.editReply('Sorry, something went wrong looking up that coin.').catch(() => { });
    }
  });
}


//------------------------------------------
//------------------------------------------

/* --------------------------------------------

    Market math commands (/ath and /compare).

    Both are answered entirely from the in-memory CoinGecko cache, so they cost no API calls.

  -------------------------------------------- */

// Guild name for log lines. Commands can be run in a DM, where there is no guild at all, so
// reading channel.guild.name directly throws and takes the whole command down with it.
function describeGuild(channel) {
  return (channel && channel.guild && channel.guild.name) ? channel.guild.name : 'a DM';
}

// The ten highest ranked coins, as ticker symbols. The cache is rank-sorted but can carry
// unranked entries ahead of rank 1, so this walks forward from wherever rank 1 actually sits.
function getTop10Symbols() {
  let cursor = 0;
  cgArrayDictParsed.forEach((coin, index) => {
    if (coin.market_cap_rank && coin.market_cap_rank == 1) {
      cursor = index;
    }
  });
  const top10 = [];
  for (let i = 0; i < 10; i++) {
    if (cgArrayDictParsed[cursor + i]) top10.push(cgArrayDictParsed[cursor + i].symbol);
  }
  return top10;
}

// Look a coin up by its CoinGecko id. Stored rows keep the id precisely because ticker symbols
// collide (several coins share "BTC"), so pricing a saved holding or alert by symbol can silently
// value it against a different coin than the user picked.
function findCachedCoinById(coinId) {
  if (!coinId) return null;
  for (const coin of cgArrayDictParsed) {
    if (coin && coin.id === coinId) return coin;
  }
  return null;
}

/**
 * Finds a coin's CoinGecko id in the full listing, without spending a credit.
 *
 * cgCoinList holds {id, symbol, name} for every listed coin and is refreshed twice a day, so this
 * resolves coins the market cache never pre-loads. Exact symbol wins over exact name, and name is
 * only matched exactly: a substring match here would send "bit" to some random token.
 *
 * @param {string} query ticker, name, or CoinGecko id
 * @returns {string|null}
 */
function resolveCoinIdFromList(query) {
  const needle = (query || '').trim().toLowerCase();
  if (!needle) return null;

  let nameMatch = null;
  let idMatch = null;
  for (const coin of cgCoinList) {
    if (!coin || !coin.symbol) continue;
    if (coin.symbol.toLowerCase() === needle) return coin.id;
    if (!idMatch && coin.id === needle) idMatch = coin.id;
    if (!nameMatch && (coin.name || '').toLowerCase() === needle) nameMatch = coin.id;
  }
  return idMatch || nameMatch;
}

/**
 * Fetches full market data for one coin that is not in the cache.
 *
 * Costs one credit, which is the trade the page cap buys: instead of pre-loading 16,000 coins every
 * half hour on the chance someone asks, the rare request pays for itself. Results are held briefly
 * so a burst about the same coin does not repeat the charge.
 *
 * Returns the same shape as a cached coin, because callers cannot tell the two apart.
 *
 * @param {string} query
 * @returns {Promise<object|null>}
 */
async function resolveCoinLive(query) {
  const coinId = resolveCoinIdFromList(query);
  if (!coinId) return null;

  const cached = liveCoinCache.get(coinId);
  if (cached && Date.now() - cached.at < LIVE_COIN_CACHE_MS) return cached.coin;

  try {
    const res = await cgFetch('/coins/markets?vs_currency=usd&ids=' + encodeURIComponent(coinId) +
      '&price_change_percentage=1h,24h,7d,14d,30d,1y');
    if (!res.ok) {
      console.log(pc.yellow(`Live CoinGecko lookup for ${coinId} returned HTTP ${res.status}.`));
      return null;
    }
    const data = await res.json();
    const coin = Array.isArray(data) && data.length ? data[0] : null;
    if (coin) {
      liveCoinCache.set(coinId, { at: Date.now(), coin });
      // Bounded so a long uptime cannot grow this without limit.
      if (liveCoinCache.size > 500) {
        liveCoinCache.delete(liveCoinCache.keys().next().value);
      }
    }
    return coin;
  }
  catch (err) {
    console.log(pc.yellow(`Live CoinGecko lookup for ${coinId} failed: ${err.message}`));
    return null;
  }
}

/**
 * The cache first, then one live lookup. Every command that needs market data for a user-named
 * coin should use this rather than findCachedCoin, so the page cap stays invisible to users.
 * @param {string} query
 * @returns {Promise<object|null>}
 */
async function resolveCoin(query) {
  return findCachedCoin(query) || await resolveCoinLive(query);
}


/**
 * Resolves many coin ids at once, for list views.
 *
 * Anything in the market cache is free. Everything else goes into a single /coins/markets request
 * per 250 ids, so a portfolio full of obscure coins costs one credit rather than one per holding.
 * Results share the live lookup cache, so paging through a list repeatedly does not re-charge.
 *
 * @param {Array<string>} coinIds
 * @returns {Promise<Map<string, object>>} id -> coin, missing ids simply absent
 */
async function resolveCoinsByIds(coinIds) {
  const found = new Map();
  const missing = [];

  for (const id of new Set(coinIds)) {
    if (!id) continue;
    const cached = findCachedCoinById(id);
    if (cached) {
      found.set(id, cached);
      continue;
    }
    const live = liveCoinCache.get(id);
    if (live && Date.now() - live.at < LIVE_COIN_CACHE_MS) {
      found.set(id, live.coin);
      continue;
    }
    missing.push(id);
  }

  if (missing.length === 0) return found;

  const CHUNK_SIZE = 250;
  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    const chunk = missing.slice(i, i + CHUNK_SIZE);
    try {
      const res = await cgFetch('/coins/markets?vs_currency=usd&ids=' + encodeURIComponent(chunk.join(',')) +
        '&price_change_percentage=1h,24h,7d,14d,30d,1y');
      if (!res.ok) {
        console.log(pc.yellow(`Batched CoinGecko lookup returned HTTP ${res.status}; those coins will show as unavailable.`));
        continue;
      }
      for (const coin of await res.json()) {
        found.set(coin.id, coin);
        liveCoinCache.set(coin.id, { at: Date.now(), coin });
      }
    }
    catch (err) {
      console.log(pc.yellow('Batched CoinGecko lookup failed: ' + err.message));
    }
  }

  return found;
}

// Resolve user input (ticker, full name, or market cap rank) to a cached coin. Prefers an exact
// ticker match, since that is what people almost always mean when symbols collide.
function findCachedCoin(input) {
  const query = (input || '').trim().toLowerCase();
  if (!query) return null;

  let nameMatch = null;
  let rankMatch = null;
  for (const coin of cgArrayDictParsed) {
    if (!coin || !coin.symbol) continue;
    if (coin.symbol.toLowerCase() === query) return coin;
    if (!nameMatch && (coin.name || '').toLowerCase() === query) nameMatch = coin;
    if (!rankMatch && String(coin.market_cap_rank) === query) rankMatch = coin;
  }
  return nameMatch || rankMatch;
}


async function getAllTimeHigh(coinInput, channel, interaction) {
  const reply = async (payload) => {
    if (interaction) return interaction.editReply(payload);
    if (channel) return channel.send(payload);
  };

  if (cacheUpdateRunning) {
    await reply(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
    return;
  }

  const coin = await resolveCoin(coinInput);
  if (!coin) {
    await reply(`Couldn't find **${coinInput}** on CoinGecko. Try the ticker symbol or the full name.`);
    return;
  }

  const downFromAth = coin.ath_change_percentage;
  const upFromAtl = coin.atl_change_percentage;
  const athDate = coin.ath_date ? `<t:${Math.floor(new Date(coin.ath_date).getTime() / 1000)}:R>` : 'unknown';
  const atlDate = coin.atl_date ? `<t:${Math.floor(new Date(coin.atl_date).getTime() / 1000)}:R>` : 'unknown';

  // Distance back to the all-time high, expressed as the multiple the price would have to do.
  const multipleToAth = (coin.current_price && coin.ath) ? (coin.ath / coin.current_price) : null;

  const embed = new EmbedBuilder()
    .setAuthor({ name: `${coin.name} (${coin.symbol.toUpperCase()})`, iconURL: coin.image || null })
    .addFields(
      { name: 'Current price', value: formatUsd(coin.current_price), inline: true },
      { name: 'All-time high', value: `${formatUsd(coin.ath)}\n${athDate}`, inline: true },
      {
        name: 'Down from ATH',
        value: downFromAth == null ? 'n/a' : `\`${downFromAth.toFixed(1)}%\`` +
          (multipleToAth ? `\n needs a **${multipleToAth.toFixed(2)}x**` : ''),
        inline: true
      },
      { name: 'All-time low', value: `${formatUsd(coin.atl)}\n${atlDate}`, inline: true },
      { name: 'Up from ATL', value: upFromAtl == null ? 'n/a' : `\`+${numberWithCommas(upFromAtl.toFixed(0))}%\``, inline: true },
      { name: 'Rank', value: coin.market_cap_rank ? `#${coin.market_cap_rank}` : 'unranked', inline: true }
    )
    .setColor(downFromAth != null && downFromAth > -25 ? '#2ee08a' : '#ff5a76')
    .setFooter({ text: 'Powered by CoinGecko', iconURL: 'https://i.imgur.com/EnWbbrN.png' });

  await reply({ embeds: [embed] });
}

async function compareCoins(coin1Input, coin2Input, channel, interaction) {
  const reply = async (payload) => {
    if (interaction) return interaction.editReply(payload);
    if (channel) return channel.send(payload);
  };

  if (cacheUpdateRunning) {
    await reply(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
    return;
  }

  const [coinA, coinB] = await Promise.all([resolveCoin(coin1Input), resolveCoin(coin2Input)]);
  const missing = !coinA ? coin1Input : !coinB ? coin2Input : null;
  if (missing) {
    await reply(`Couldn't find **${missing}** on CoinGecko. Try the ticker symbol or the full name.`);
    return;
  }
  if (coinA.id === coinB.id) {
    await reply('Those are the same coin! Pick two different ones to compare.');
    return;
  }

  // The classic "what would X be worth at Y's market cap" calculation.
  let projection = 'n/a';
  if (coinA.market_cap && coinB.market_cap && coinA.current_price) {
    const multiple = coinB.market_cap / coinA.market_cap;
    const projectedPrice = coinA.current_price * multiple;
    projection = `**${coinA.symbol.toUpperCase()}** at **${coinB.symbol.toUpperCase()}**'s market cap would be worth\n` +
      `### ${formatUsd(projectedPrice)}\n` +
      `a **${multiple.toFixed(2)}x** from here`;
  }

  const statLine = (coin) =>
    `Price: \`${formatUsd(coin.current_price)}\`\n` +
    `Cap: \`$${abbreviateNumber(coin.market_cap, 2)}\`\n` +
    `Volume: \`$${abbreviateNumber(coin.total_volume, 2)}\`\n` +
    `Rank: \`${coin.market_cap_rank ? '#' + coin.market_cap_rank : 'unranked'}\`\n` +
    `24h: \`${coin.price_change_percentage_24h == null ? 'n/a' : coin.price_change_percentage_24h.toFixed(2) + '%'}\``;

  const embed = new EmbedBuilder()
    .setTitle(`${coinA.symbol.toUpperCase()} vs ${coinB.symbol.toUpperCase()}`)
    .setDescription(projection)
    .addFields(
      { name: `${coinA.name}`, value: statLine(coinA), inline: true },
      { name: `${coinB.name}`, value: statLine(coinB), inline: true }
    )
    .setThumbnail(coinA.image || null)
    .setColor('#9d8dff')
    .setFooter({ text: 'Powered by CoinGecko', iconURL: 'https://i.imgur.com/EnWbbrN.png' });

  await reply({ embeds: [embed] });
}

// Trending searches on CoinGecko. Prices are resolved from the local cache where possible so the
// embed stays useful even if the trending endpoint returns coins we have no market data for.
async function getTrendingCoins(channel, interaction) {
  const reply = async (payload) => {
    if (interaction) return interaction.editReply(payload);
    if (channel) return channel.send(payload);
  };

  try {
    // Trending is a slow-moving list, and this is reachable from a scheduled post that can run
    // every 30 minutes in every server. Fetching it per invocation was a standing credit drain.
    let data = cgTrendingCache.data;
    if (!data || Date.now() - cgTrendingCache.at >= CG_TRENDING_CACHE_MS) {
      const res = await cgFetch('/search/trending');
      if (!res.ok) {
        await reply('Sorry, CoinGecko trending data is unavailable right now. Please try again shortly.');
        return;
      }
      data = await res.json();
      cgTrendingCache = { at: Date.now(), data };
    }
    const trending = (data.coins || []).slice(0, 10);
    if (trending.length === 0) {
      await reply('CoinGecko returned no trending coins right now. Try again shortly.');
      return;
    }

    let description = '';
    trending.forEach((entry, index) => {
      const item = entry.item || {};
      const cached = cgArrayDict[(item.symbol || '').toUpperCase()];
      const price = cached ? formatUsd(cached.current_price) : 'n/a';
      const change = cached && cached.price_change_percentage_24h != null
        ? `${cached.price_change_percentage_24h >= 0 ? '🟢 +' : '🔴 '}${cached.price_change_percentage_24h.toFixed(2)}%`
        : '';
      const rank = item.market_cap_rank ? `#${item.market_cap_rank}` : 'unranked';
      description += `**${index + 1}.** **${(item.symbol || '?').toUpperCase()}** — ${item.name || 'Unknown'} (${rank})\n` +
        `\u2003${price} ${change}\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle('Trending on CoinGecko')
      .setDescription(description)
      .setThumbnail(trending[0]?.item?.large || null)
      .setColor('#9d8dff')
      .setFooter({ text: 'Most searched in the last 24h · Powered by CoinGecko', iconURL: 'https://i.imgur.com/EnWbbrN.png' })
      .setTimestamp();

    await reply({ embeds: [embed] });
  }
  catch (err) {
    console.log(pc.red('Error fetching trending coins: ' + pc.cyan(err)));
    await reply('Sorry, there was a problem fetching trending coins. Please try again shortly.');
  }
}


/* --------------------------------------------

    Price alerts.

    Users register a target price; a job checks live prices every minute and DMs them when the
    target is crossed. Alerts are one row per alert (rather than a JSON blob per user) so the
    scan can select only what it needs and expiry can be pruned in SQL.

  -------------------------------------------- */

const MAX_ALERTS_PER_USER = 25;

async function ensureAlertsTable() {
  // Created on startup so a fresh deployment needs no manual migration step.
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS tsukibot.pricealerts (
      alert_id     BIGSERIAL PRIMARY KEY,
      user_id      VARCHAR(45)  NOT NULL,
      coin_id      VARCHAR(120) NOT NULL,
      symbol       VARCHAR(32)  NOT NULL,
      coin_name    VARCHAR(200) NOT NULL,
      target_price NUMERIC      NOT NULL,
      direction    VARCHAR(5)   NOT NULL,
      channel_id   VARCHAR(45),
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      expires_at   TIMESTAMPTZ
    );
  `);
  await dbPool.query('CREATE INDEX IF NOT EXISTS pricealerts_user_id_idx ON tsukibot.pricealerts (user_id);');
  console.log(pc.green('Price alerts table ready.'));
}

async function addPriceAlert(interaction, coinInput, targetPrice) {
  const coin = await resolveCoin(coinInput);
  if (!coin) {
    await interaction.editReply(`Couldn't find **${coinInput}** on CoinGecko. Try the ticker symbol or the full name.`);
    return;
  }
  if (!(targetPrice > 0)) {
    await interaction.editReply('Please provide a target price greater than zero.');
    return;
  }
  if (coin.current_price == null) {
    await interaction.editReply(`No current price is available for **${coin.symbol.toUpperCase()}**, so an alert can't be set on it.`);
    return;
  }

  const countResult = await dbPool.query('SELECT COUNT(*) FROM tsukibot.pricealerts WHERE user_id = $1;', [interaction.user.id]);
  if (Number(countResult.rows[0].count) >= MAX_ALERTS_PER_USER) {
    await interaction.editReply(`You already have ${MAX_ALERTS_PER_USER} alerts, which is the maximum. Remove one with \`/alert remove\` first.`);
    return;
  }

  // Direction is inferred from where the price sits now, which is what people mean in practice:
  // a target above the current price is a "rises to" alert, below it is a "falls to" alert.
  const direction = targetPrice > coin.current_price ? 'above' : 'below';

  const inserted = await dbPool.query(
    `INSERT INTO tsukibot.pricealerts (user_id, coin_id, symbol, coin_name, target_price, direction, channel_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING alert_id;`,
    [interaction.user.id, coin.id, coin.symbol.toUpperCase(), coin.name, targetPrice, direction, interaction.channelId]
  );

  const movePercent = ((targetPrice - coin.current_price) / coin.current_price) * 100;
  const embed = new EmbedBuilder()
    .setAuthor({ name: `Alert set for ${coin.name} (${coin.symbol.toUpperCase()})`, iconURL: coin.image || null })
    .setDescription(
      `I'll DM you when **${coin.symbol.toUpperCase()}** goes **${direction}** ${formatUsd(targetPrice)}.\n\n` +
      `Currently ${formatUsd(coin.current_price)} — that's a **${movePercent >= 0 ? '+' : ''}${movePercent.toFixed(2)}%** move away.`
    )
    .setColor(direction === 'above' ? '#2ee08a' : '#ff5a76')
    .setFooter({ text: `Alert #${inserted.rows[0].alert_id} · make sure your DMs are open` });

  await interaction.editReply({ embeds: [embed] });
}

async function listPriceAlerts(interaction) {
  const result = await dbPool.query(
    'SELECT alert_id, coin_id, symbol, coin_name, target_price, direction FROM tsukibot.pricealerts WHERE user_id = $1 ORDER BY alert_id;',
    [interaction.user.id]
  );

  if (result.rows.length === 0) {
    await interaction.editReply('You have no price alerts set. Create one with `/alert add`.');
    return;
  }

  // Resolved as one batch: coins outside the market cache cost a single request for the whole
  // list rather than one apiece.
  const pricedById = await resolveCoinsByIds(result.rows.map(row => row.coin_id));

  const lines = [];
  for (const row of result.rows) {
    // Priced by coin_id, not symbol: duplicate tickers would otherwise show the wrong coin's price.
    const cached = pricedById.get(row.coin_id);
    const current = cached && cached.current_price != null ? formatUsd(cached.current_price) : 'n/a';
    lines.push(`\`#${row.alert_id}\` **${row.symbol}** ${row.direction} ${formatUsd(Number(row.target_price))} — now ${current}\n`);
  }
  const description = fitEmbedDescription(lines, '\n*…and {n} more alerts. Remove some with /alert remove.*');

  const embed = new EmbedBuilder()
    .setTitle('Your price alerts')
    .setDescription(description)
    .setColor('#9d8dff')
    .setFooter({ text: 'Remove one with /alert remove id:<number>' });

  await interaction.editReply({ embeds: [embed] });
}

async function removePriceAlert(interaction, alertId) {
  // Scoped to the requesting user, so one person can never delete another's alert by guessing an id.
  const result = await dbPool.query(
    'DELETE FROM tsukibot.pricealerts WHERE alert_id = $1 AND user_id = $2 RETURNING symbol, target_price, direction;',
    [alertId, interaction.user.id]
  );

  if (result.rows.length === 0) {
    await interaction.editReply(`No alert \`#${alertId}\` found on your account. Use \`/alert list\` to see your alerts.`);
    return;
  }

  const removed = result.rows[0];
  await interaction.editReply(`Removed alert \`#${alertId}\`: **${removed.symbol}** ${removed.direction} ${formatUsd(Number(removed.target_price))}.`);
}

// Runs on a timer. One batched price call covers every coin anyone is watching.
//
// The single-run guard matters because the scan awaits network calls between reading the alerts and
// deleting the triggered ones: a slow CoinGecko response could otherwise let the next minute's run
// select the same rows and deliver every alert twice.
let alertScanRunning = false;

async function checkPriceAlerts() {
  if (alertScanRunning) return;
  alertScanRunning = true;
  try {
    await runPriceAlertScan();
  }
  finally {
    alertScanRunning = false;
  }
}

async function runPriceAlertScan() {
  await dbPool.query('DELETE FROM tsukibot.pricealerts WHERE expires_at IS NOT NULL AND expires_at < NOW();');

  const alerts = await dbPool.query('SELECT * FROM tsukibot.pricealerts;');
  if (alerts.rows.length === 0) return;

  const coinIds = [...new Set(alerts.rows.map(row => row.coin_id))];

  /* This scan runs every minute. It used to spend a CoinGecko credit on every one of those runs
     whenever any alert existed: 1,440 a day, which on a demo key is more than four times the
     entire daily budget on its own.

     Now it reads the market cache first, which is free, and pays for a live quote only every
     ALERT_LIVE_INTERVAL_MS. That call covers every watched coin at once, so the cost is fixed no
     matter how many alerts exist. The interval is therefore the worst-case alert latency, and the
     trade it buys is roughly 96 credits a day instead of 1,440. */
  const prices = {};
  for (const coinId of coinIds) {
    const cached = findCachedCoinById(coinId);
    if (cached && cached.current_price != null) prices[coinId] = { usd: cached.current_price };
  }

  /* Only coins the market cache does not carry cost anything.

     Alerts deliberately ride the cache refresh rather than fetching their own quotes. An earlier
     version fetched fresh quotes on a timer, which sounds prudent but bought almost nothing: the
     cache refreshes every 30 minutes, so paying every 20 improved worst-case alert latency from
     30 minutes to 20 while consuming about a fifth of the entire monthly quota. Following the
     cache costs nothing and gives up ten minutes.

     What the cache genuinely cannot answer is a coin outside the pre-cached pages, which has no
     price at all. Those are fetched here, still gated on an interval: without the gate a single
     alert on an obscure coin would fetch every minute, which is how this cost 1,440 a day
     originally. In the normal case, where every watched coin is in the cache, this block never
     runs and alerts are free. */
  const uncached = coinIds.filter(id => prices[id] === undefined);

  if (uncached.length > 0 && Date.now() - lastAlertLiveFetch >= ALERT_UNCACHED_INTERVAL_MS) {
    lastAlertLiveFetch = Date.now();

    // CoinGecko accepts a comma-separated id list, so all of them cost one request. Chunked to
    // keep the URL a sane length if the bot ever ends up watching hundreds of coins.
    const CHUNK_SIZE = 100;
    for (let i = 0; i < uncached.length; i += CHUNK_SIZE) {
      const chunk = uncached.slice(i, i + CHUNK_SIZE);
      const res = await cgFetch(`/simple/price?ids=${encodeURIComponent(chunk.join(','))}&vs_currencies=usd`);
      if (!res.ok) {
        console.log(pc.yellow(`Price alert check skipped a chunk (status ${res.status}).`));
        continue;
      }
      Object.assign(prices, await res.json());
    }
  }

  const triggered = [];
  for (const alert of alerts.rows) {
    const price = prices[alert.coin_id]?.usd;
    if (price == null) continue;
    const target = Number(alert.target_price);
    if ((alert.direction === 'above' && price >= target) || (alert.direction === 'below' && price <= target)) {
      triggered.push({ alert, price });
    }
  }

  if (triggered.length === 0) return;

  // Claim the rows by deleting them, and act only on what this process actually removed.
  // DELETE ... RETURNING is atomic, so if a second instance of the bot is running, exactly one
  // of them delivers each alert rather than both DMing the user. Deleting before notifying also
  // means a failed DM cannot leave an alert to re-fire every minute.
  const claimed = await dbPool.query(
    'DELETE FROM tsukibot.pricealerts WHERE alert_id = ANY($1::bigint[]) RETURNING alert_id;',
    [triggered.map(t => t.alert.alert_id)]);
  const claimedIds = new Set(claimed.rows.map(row => String(row.alert_id)));
  const toDeliver = triggered.filter(t => claimedIds.has(String(t.alert.alert_id)));
  if (toDeliver.length === 0) return;

  for (const { alert, price } of toDeliver) {
    const embed = new EmbedBuilder()
      .setTitle(`${alert.symbol} is ${alert.direction} ${formatUsd(Number(alert.target_price))}`)
      .setDescription(`**${alert.coin_name}** is now **${formatUsd(price)}**.`)
      .setColor(alert.direction === 'above' ? '#2ee08a' : '#ff5a76')
      .setFooter({ text: 'TsukiBot price alert' })
      .setTimestamp();

    // Recorded per alert with how it was delivered, so "are DMs actually reaching people" is
    // answerable rather than guessed at.
    let delivery = 'dm';
    let outcome = 'ok';

    try {
      const user = await client.users.fetch(alert.user_id);
      await user.send({ embeds: [embed] });
    }
    catch {
      // DMs are closed or the user is gone. Fall back to the channel the alert was created in.
      delivery = 'channel';
      try {
        const channel = await client.channels.fetch(alert.channel_id);
        if (channel && channel.isTextBased()) {
          await channel.send({ content: `<@${alert.user_id}>`, embeds: [embed] });
        }
      }
      catch {
        delivery = 'failed';
        outcome = 'error';
        console.log(pc.yellow(`Could not deliver price alert ${alert.alert_id} to user ${alert.user_id}.`));
      }
    }

    telemetry.recordSystemEvent('alert-fired', {
      userId: alert.user_id,
      channelId: alert.channel_id,
      subcommand: alert.direction,
      params: { symbol: alert.symbol, target: String(alert.target_price), delivery },
      coins: [String(alert.symbol).toUpperCase()],
      outcome
    });
  }

  console.log(pc.green(`Delivered ${toDeliver.length} price alert(s).`));
}


/* --------------------------------------------

    Portfolio tracking.

    Deliberately a separate table from tsukibot.profiles rather than an extra column on it: the
    tbpa watchlist stores its coins as a single delimited string, and bolting amounts onto that
    format would make both features harder to read. /tbpa stays the quick watchlist; /portfolio
    is the one that carries amounts.

  -------------------------------------------- */

const MAX_HOLDINGS_PER_USER = 50;

async function ensureHoldingsTable() {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS tsukibot.holdings (
      user_id   VARCHAR(45)  NOT NULL,
      coin_id   VARCHAR(120) NOT NULL,
      symbol    VARCHAR(32)  NOT NULL,
      coin_name VARCHAR(200) NOT NULL,
      amount    NUMERIC      NOT NULL,
      PRIMARY KEY (user_id, coin_id)
    );
  `);
  console.log(pc.green('Portfolio holdings table ready.'));
}

async function setHolding(interaction, coinInput, amount) {
  const coin = await resolveCoin(coinInput);
  if (!coin) {
    await interaction.editReply(`Couldn't find **${coinInput}** on CoinGecko. Try the ticker symbol or the full name.`);
    return;
  }

  // An amount of zero is the natural way to say "I no longer hold this", so treat it as a removal.
  if (amount === 0) {
    await dbPool.query('DELETE FROM tsukibot.holdings WHERE user_id = $1 AND coin_id = $2;', [interaction.user.id, coin.id]);
    await interaction.editReply(`Removed **${coin.symbol.toUpperCase()}** from your portfolio.`);
    return;
  }
  if (!(amount > 0)) {
    await interaction.editReply('Please provide an amount greater than zero (or exactly 0 to remove a holding).');
    return;
  }

  const countResult = await dbPool.query('SELECT COUNT(*) FROM tsukibot.holdings WHERE user_id = $1;', [interaction.user.id]);
  if (Number(countResult.rows[0].count) >= MAX_HOLDINGS_PER_USER) {
    const existing = await dbPool.query('SELECT 1 FROM tsukibot.holdings WHERE user_id = $1 AND coin_id = $2;', [interaction.user.id, coin.id]);
    if (existing.rows.length === 0) {
      await interaction.editReply(`You already track ${MAX_HOLDINGS_PER_USER} coins, which is the maximum. Remove one first with \`/portfolio set amount:0\`.`);
      return;
    }
  }

  await dbPool.query(
    `INSERT INTO tsukibot.holdings (user_id, coin_id, symbol, coin_name, amount)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, coin_id) DO UPDATE SET amount = $5, symbol = $3, coin_name = $4;`,
    [interaction.user.id, coin.id, coin.symbol.toUpperCase(), coin.name, amount]
  );

  const value = coin.current_price != null ? formatUsd(coin.current_price * amount) : 'n/a';
  await interaction.editReply(`Set **${amount} ${coin.symbol.toUpperCase()}** in your portfolio — currently worth **${value}**.`);
}

// Renders the portfolio chart page to a PNG buffer via the existing puppeteer cluster.
// Returns null on any failure: the chart is a bonus, and must never take the command down with it.
async function renderPortfolioChart(payload) {
  if (!cluster) return null;

  const id = stashPortfolioChart(payload);
  const url = `http://127.0.0.1:${devMode ? 8086 : 8080}/portfolio/${id}`;

  try {
    return await cluster.execute(url, async ({ page, data }) => {
      // Portrait and full-page: the card's height varies with how many holdings there are.
      await page.setViewport({ width: 520, height: 390, deviceScaleFactor: 2 });
      // 'load' rather than 'networkidle0': the page is entirely inline CSS and SVG with no
      // subresources, and waiting for network idle on a page that makes no requests can stall.
      await page.goto(data, { waitUntil: 'load', timeout: 15000 });
      const shot = await page.screenshot({ type: 'png' });
      // Release the page's memory before it goes back to the pool.
      await page.goto('about:blank');
      return shot;
    });
  }
  catch (err) {
    console.log(pc.yellow('Portfolio chart render failed, sending the embed without it: ' + err.message));
    return null;
  }
  finally {
    portfolioChartPayloads.delete(id);
  }
}

// Portfolio-level change over a timeframe, derived by backing each holding's prior value out of
// its own percentage move. Holdings missing that timeframe are excluded from both sides so they
// cannot skew the result.
function weightedChange(priced, field) {
  let now = 0;
  let before = 0;
  for (const holding of priced) {
    if (holding.value == null || holding[field] == null) continue;
    const prior = holding.value / (1 + holding[field] / 100);
    if (!Number.isFinite(prior) || prior <= 0) continue;
    now += holding.value;
    before += prior;
  }
  if (before <= 0) return null;
  return { percent: ((now - before) / before) * 100, amount: now - before };
}

async function showPortfolio(interaction) {
  const holdings = await dbPool.query(
    'SELECT coin_id, symbol, coin_name, amount FROM tsukibot.holdings WHERE user_id = $1;',
    [interaction.user.id]
  );

  if (holdings.rows.length === 0) {
    await interaction.editReply('Your portfolio is empty. Add a holding with `/portfolio set coin:eth amount:2.5`.');
    return;
  }

  // Holdings in the market cache are free. Anything outside it is fetched as one batched request
  // for the whole portfolio, so a wallet full of obscure tokens costs one credit, not one each.
  const pricedById = await resolveCoinsByIds(holdings.rows.map(row => row.coin_id));

  const priced = [];
  let totalValue = 0;

  for (const row of holdings.rows) {
    // By coin_id for the same reason as alerts: symbols are not unique on CoinGecko.
    const coin = pricedById.get(row.coin_id);
    const amount = Number(row.amount);
    if (!coin || coin.current_price == null) {
      priced.push({ symbol: row.symbol, amount, value: null, change24h: null });
      continue;
    }
    const value = coin.current_price * amount;
    totalValue += value;
    priced.push({
      symbol: row.symbol,
      amount,
      value,
      price: coin.current_price,
      image: coin.image,
      change1h: coin.price_change_percentage_1h_in_currency,
      change24h: coin.price_change_percentage_24h_in_currency ?? coin.price_change_percentage_24h,
      change7d: coin.price_change_percentage_7d_in_currency,
      change30d: coin.price_change_percentage_30d_in_currency,
      athChange: coin.ath_change_percentage
    });
  }

  priced.sort((a, b) => (b.value || 0) - (a.value || 0));

  // Discord embeds render in a proportional font, so padding with spaces does nothing there.
  // Everything tabular below therefore lives in a code block, which is the only way to get
  // columns to actually line up. Lines are kept under ~34 characters so they do not wrap on a
  // phone, which is what pushed "30d" onto its own line before.
  // Discord embeds render in a proportional font, so padding with spaces does nothing there.
  // The holdings table therefore lives in a code block, which is the only way to get columns
  // to actually line up.
  const move = (pct) => pct == null ? '  --  ' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;

  const symbolWidth = Math.max(4, ...priced.map(h => h.symbol.length));
  const valueWidth = Math.max(6, ...priced.map(h => h.value == null ? 0 : formatUsdAmount(h.value).length));

  const holdingBlocks = priced.map(holding => {
    if (holding.value == null) {
      return `${holding.symbol.padEnd(symbolWidth)}  no price available`;
    }
    const share = totalValue > 0 ? (holding.value / totalValue) * 100 : 0;
    // The @ price keeps full precision (sub-cent coins need it); the dollar value does not.
    return `${holding.symbol.padEnd(symbolWidth)} ${(share.toFixed(1) + '%').padStart(6)} ` +
      `${formatUsdAmount(holding.value).padStart(valueWidth)}\n` +
      `  ${holding.amount} @ ${formatUsd(holding.price)}`;
  });

  // Portfolio-level performance across every timeframe the cache carries.
  const timeframes = [
    { label: '1h', field: 'change1h' },
    { label: '24h', field: 'change24h' },
    { label: '7d', field: 'change7d' },
    { label: '30d', field: 'change30d' }
  ].map(t => ({ ...t, result: weightedChange(priced, t.field) })).filter(t => t.result);

  const dayChange = timeframes.find(t => t.label === '24h');

  // Render the chart before building the embed, because what the embed needs to say depends on
  // whether the chart is there to say it. With a chart, repeating the total and every timeframe
  // in text just prints the same figures twice a few pixels apart.
  const chartSlices = priced
    .filter(h => h.value != null && totalValue > 0)
    .slice(0, 8)
    .map(h => ({ symbol: h.symbol, share: (h.value / totalValue) * 100, value: formatUsdAmount(h.value) }));

  let chart = null;
  if (chartSlices.length > 0 && timeframes.length > 0) {
    chart = await renderPortfolioChart({
      slices: chartSlices,
      timeframes: timeframes.map(t => ({
        label: t.label,
        percent: t.result.percent,
        amount: t.result.amount,
        amountLabel: formatUsdAmount(Math.abs(t.result.amount))
      })),
      totalLabel: formatUsdAmount(totalValue)
    });
  }

  // Fit as many holdings as the description allows, leaving room for the fences and the note.
  const FENCE_OVERHEAD = 10;
  let descriptionBody = '';
  let shown = 0;
  for (const block of holdingBlocks) {
    if (descriptionBody.length + block.length + FENCE_OVERHEAD > EMBED_DESCRIPTION_LIMIT - 140) break;
    descriptionBody += (shown > 0 ? '\n\n' : '') + block;
    shown++;
  }
  const hiddenCount = holdingBlocks.length - shown;
  const description = '```\n' + descriptionBody + '\n```' +
    (hiddenCount > 0 ? `\n*…and ${hiddenCount} more holdings (the total below includes them).*` : '');

  const embed = new EmbedBuilder()
    .setTitle('Your portfolio')
    .setDescription(description)
    .setColor(dayChange && dayChange.result.percent < 0 ? '#ff5a76' : '#2ee08a')
    .setFooter({ text: 'Prices from the CoinGecko cache · only you can see this' })
    .setTimestamp();

  if (chart) {
    // The chart carries the total and every timeframe, so the text only anchors the total.
    embed.addFields({ name: 'Total value', value: '```\n' + formatUsdAmount(totalValue) + '\n```' });
  }
  else {
    // No chart: the embed has to carry the performance table itself.
    const amountWidth = Math.max(7, ...timeframes.map(t =>
      ((t.result.amount >= 0 ? '+' : '-') + formatUsdAmount(Math.abs(t.result.amount))).length));
    const performanceLines = timeframes.map(t => {
      const percent = `${t.result.percent >= 0 ? '+' : ''}${t.result.percent.toFixed(2)}%`;
      const amount = `${t.result.amount >= 0 ? '+' : '-'}${formatUsdAmount(Math.abs(t.result.amount))}`;
      return `${(t.label + ':').padEnd(5)}${percent.padStart(8)}${amount.padStart(amountWidth + 2)}`;
    }).join('\n');
    const totalRow = `${'total:'.padEnd(5)}${formatUsdAmount(totalValue).padStart(amountWidth + 10)}`;
    embed.addFields({
      name: 'Total value',
      value: '```\n' + totalRow + '\n' + (performanceLines || 'no performance data') + '\n```'
    });
  }

  // Best and worst 24h movers, only meaningful once there is more than one holding to compare.
  const withChange = priced.filter(h => h.value != null && h.change24h != null);
  if (withChange.length >= 2) {
    const sortedByChange = [...withChange].sort((a, b) => b.change24h - a.change24h);
    const best = sortedByChange[0];
    const worst = sortedByChange[sortedByChange.length - 1];
    embed.addFields(
      { name: 'Best 24h', value: `**${best.symbol}** ${move(best.change24h)}`, inline: true },
      { name: 'Worst 24h', value: `**${worst.symbol}** ${move(worst.change24h)}`, inline: true }
    );

    // With a single holding this is just that coin's ATH distance, which /ath answers better.
    const withAth = priced.filter(h => h.value != null && h.athChange != null);
    if (withAth.length > 0) {
      const furthest = [...withAth].sort((a, b) => a.athChange - b.athChange)[0];
      embed.addFields({
        name: 'Furthest below ATH',
        value: `**${furthest.symbol}** ${furthest.athChange.toFixed(1)}%`,
        inline: true
      });
    }
  }

  // Largest holding's icon, as a small visual anchor.
  const largest = priced.find(h => h.image);
  if (largest) embed.setThumbnail(largest.image);

  const reply = { embeds: [embed] };
  if (chart) {
    embed.setImage('attachment://portfolio.png');
    reply.files = [{ attachment: chart, name: 'portfolio.png' }];
  }

  await interaction.editReply(reply);
}

async function clearPortfolio(interaction) {
  const result = await dbPool.query('DELETE FROM tsukibot.holdings WHERE user_id = $1;', [interaction.user.id]);
  await interaction.editReply(result.rowCount > 0
    ? `Cleared your portfolio (${result.rowCount} holding${result.rowCount === 1 ? '' : 's'} removed).`
    : 'Your portfolio was already empty.');
}


/* --------------------------------------------

    AI market brief.

    Composes the data the bot already caches into one glanceable summary. The result is cached
    globally for 20 minutes: the underlying market data is identical for every server, so there is
    no reason to pay for the same summary twice.

    Gracefully unavailable when no Anthropic key is configured, matching how /ls handles a missing
    Coinalyze key.

  -------------------------------------------- */

const BRIEF_CACHE_MS = 20 * 60 * 1000;
let briefCache = { text: null, generatedAt: 0 };

// Discord rejects an embed whose description exceeds 4096 characters. A user with dozens of
// holdings or alerts can generate more than that, so lists are trimmed to fit with a note saying so.
const EMBED_DESCRIPTION_LIMIT = 4096;

function fitEmbedDescription(lines, overflowNote) {
  let description = '';
  let shown = 0;
  for (const line of lines) {
    // Leave room for the overflow note we may still need to append.
    if (description.length + line.length > EMBED_DESCRIPTION_LIMIT - 120) break;
    description += line;
    shown++;
  }
  if (shown < lines.length) {
    description += overflowNote.replace('{n}', String(lines.length - shown));
  }
  return description;
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY || keys.anthropic;
  if (!apiKey) return null;
  const Anthropic = require('@anthropic-ai/sdk');
  const AnthropicClient = Anthropic.default || Anthropic;
  return new AnthropicClient({ apiKey: apiKey });
}

// Gather the market data the brief is written from, entirely out of the existing caches.
async function collectMarketSnapshot() {
  const topCoins = cgArrayDictParsed
    .filter(coin => coin && coin.market_cap_rank && coin.market_cap_rank <= 10)
    .sort((a, b) => a.market_cap_rank - b.market_cap_rank)
    .map(coin => `${coin.symbol.toUpperCase()}: ${formatUsd(coin.current_price)} ` +
      `(24h ${coin.price_change_percentage_24h == null ? 'n/a' : coin.price_change_percentage_24h.toFixed(2) + '%'})`);

  const movable = cgArrayDictParsed.filter(coin =>
    coin.market_cap_rank != null && coin.price_change_percentage_24h != null && coin.total_volume >= 1000000);
  const sorted = [...movable].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
  const describeMover = coin => `${coin.symbol.toUpperCase()} ${coin.price_change_percentage_24h.toFixed(1)}%`;

  let fearGreed = 'unavailable';
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (res.ok) {
      const data = await res.json();
      if (data.data && data.data[0]) {
        fearGreed = `${data.data[0].value} (${data.data[0].value_classification})`;
      }
    }
  }
  catch {
    // Non-fatal: the brief simply omits sentiment.
  }

  let globalStats = 'unavailable';
  try {
    const res = await cgFetch('/global');
    if (res.ok) {
      const { data } = await res.json();
      globalStats = `total market cap $${abbreviateNumber(data.total_market_cap.usd, 2)}, ` +
        `24h volume $${abbreviateNumber(data.total_volume.usd, 2)}, ` +
        `BTC dominance ${data.market_cap_percentage.btc.toFixed(1)}%, ` +
        `market cap 24h change ${data.market_cap_change_percentage_24h_usd.toFixed(2)}%`;
    }
  }
  catch {
    // Non-fatal.
  }

  return [
    `Global: ${globalStats}`,
    `Fear & Greed index: ${fearGreed}`,
    `Top 10 by market cap: ${topCoins.join('; ')}`,
    `Biggest 24h gainers: ${sorted.slice(0, 5).map(describeMover).join(', ')}`,
    `Biggest 24h losers: ${sorted.slice(-5).reverse().map(describeMover).join(', ')}`
  ].join('\n');
}

async function getMarketBrief(interaction) {
  const client = getAnthropicClient();
  if (!client) {
    await interaction.editReply('Sorry, the market brief command is not configured. The bot administrator needs to add an Anthropic API key.');
    return;
  }

  if (cacheUpdateRunning) {
    await interaction.editReply(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
    return;
  }

  const now = Date.now();
  let briefText = null;
  let cached = false;

  if (briefCache.text && (now - briefCache.generatedAt) < BRIEF_CACHE_MS) {
    briefText = briefCache.text;
    cached = true;
  }
  else {
    const snapshot = await collectMarketSnapshot();

    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8000,
      // Summarizing numbers that are already gathered is a simple task, so low effort keeps this
      // fast and cheap. Raise it if you want more interpretation in the write-up.
      output_config: { effort: 'low' },
      // Safety classifiers can decline a request; letting the API re-run it on a fallback model
      // server-side means a decline recovers instead of surfacing as a failed command.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // The embed already carries a "Market Brief" title, so the model is told to open on its first
      // observation. Saying "no markdown headers" alone was not enough — it complied literally and
      // wrote a plain-text title instead, which read as a duplicate of the embed's own.
      system: 'You write short crypto market briefs for a Discord bot. ' +
        'The message already has a title, so open with your first observation about the market. ' +
        'Keep the whole brief under about 120 words, in two or three short paragraphs of plain prose. ' +
        'Use only the data you are given, and never invent numbers, prices, or news. ' +
        'Say what moved and what the overall tone is. Prefer the specific over the general: ' +
        'name the coins and the figures rather than describing the market in the abstract. ' +
        'No headings, no bullet lists, no greeting, no sign-off, and no financial advice.',
      messages: [{
        role: 'user',
        content: `Here is the current crypto market data. Write the brief.\n\n${snapshot}`
      }]
    });

    if (response.stop_reason === 'refusal') {
      console.log(pc.yellow('Market brief request was declined by safety classifiers.'));
      await interaction.editReply('Sorry, I could not generate a market brief right now. Please try again later.');
      return;
    }

    briefText = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim();

    if (!briefText) {
      await interaction.editReply('Sorry, I could not generate a market brief right now. Please try again later.');
      return;
    }

    briefCache = { text: briefText, generatedAt: now };
  }

  const embed = new EmbedBuilder()
    .setTitle('Market Brief')
    .setDescription(briefText.slice(0, 4000))
    .setColor('#9d8dff')
    .setFooter({ text: cached ? 'Cached · refreshes every 20 minutes' : 'Generated just now · data from CoinGecko' })
    .setTimestamp(new Date(briefCache.generatedAt));

  await interaction.editReply({ embeds: [embed] });
}


/* --------------------------------------------

    Recurring scheduled posts.

    A stored job is just {command, args, channel, interval} replayed through the same functions the
    slash commands use. Those functions already accept a Discord channel for their non-interaction
    path, so a real TextChannel can be handed straight to them with no adapter.

    Due jobs are found by polling once a minute rather than by registering a node-schedule entry
    per job. That keeps the schedule in the database as the single source of truth, so nothing has
    to be rehydrated on restart and a job can never be silently lost.

  -------------------------------------------- */

const SCHEDULABLE_COMMANDS = {
  hmap: 'Market heatmap',
  fg: 'Fear & Greed index',
  movers: 'Biggest 24h movers',
  trending: 'Trending coins',
  pop: 'Top 10 coins',
  cg: 'Prices for specific coins'
};

const SCHEDULE_INTERVALS = {
  '30m': 30,
  '1h': 60,
  '4h': 240,
  '12h': 720,
  daily: 1440
};

const MAX_SCHEDULES_PER_GUILD = 10;

async function ensureSchedulesTable() {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS tsukibot.scheduled_posts (
      job_id           BIGSERIAL PRIMARY KEY,
      guild_id         VARCHAR(45)  NOT NULL,
      channel_id       VARCHAR(45)  NOT NULL,
      command          VARCHAR(32)  NOT NULL,
      args             VARCHAR(200),
      interval_minutes INTEGER      NOT NULL,
      created_by       VARCHAR(45)  NOT NULL,
      last_run         TIMESTAMPTZ
    );
  `);
  await dbPool.query('CREATE INDEX IF NOT EXISTS scheduled_posts_guild_idx ON tsukibot.scheduled_posts (guild_id);');
  console.log(pc.green('Scheduled posts table ready.'));
}

async function createSchedule(interaction, command, channel, intervalKey, args) {
  if (!SCHEDULABLE_COMMANDS[command]) {
    await interaction.editReply('That command cannot be scheduled.');
    return;
  }
  const intervalMinutes = SCHEDULE_INTERVALS[intervalKey];
  if (!intervalMinutes) {
    await interaction.editReply('That interval is not supported.');
    return;
  }
  if (command === 'cg' && !args) {
    await interaction.editReply('Scheduling `cg` needs a list of coins. Add them with the `coins` option, e.g. `coins: btc eth`.');
    return;
  }

  if (!channel.isTextBased()) {
    await interaction.editReply('Please choose a text channel.');
    return;
  }

  // Check up front that the bot can actually post there, rather than failing silently every cycle.
  const botPermissions = channel.permissionsFor(interaction.guild.members.me);
  if (!botPermissions || !botPermissions.has(PermissionFlagsBits.SendMessages) || !botPermissions.has(PermissionFlagsBits.EmbedLinks)) {
    await interaction.editReply(`I need permission to send messages and embed links in ${channel} before I can post there.`);
    return;
  }

  const countResult = await dbPool.query('SELECT COUNT(*) FROM tsukibot.scheduled_posts WHERE guild_id = $1;', [interaction.guildId]);
  if (Number(countResult.rows[0].count) >= MAX_SCHEDULES_PER_GUILD) {
    await interaction.editReply(`This server already has ${MAX_SCHEDULES_PER_GUILD} scheduled posts, which is the maximum. Remove one with \`/schedule delete\` first.`);
    return;
  }

  const inserted = await dbPool.query(
    `INSERT INTO tsukibot.scheduled_posts (guild_id, channel_id, command, args, interval_minutes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING job_id;`,
    [interaction.guildId, channel.id, command, args || null, intervalMinutes, interaction.user.id]
  );

  await interaction.editReply(
    `Scheduled **${SCHEDULABLE_COMMANDS[command]}**${args ? ` (\`${args}\`)` : ''} in ${channel}, every **${intervalKey}**.\n` +
    `Job \`#${inserted.rows[0].job_id}\` — the first post goes out within a minute.`
  );
}

async function listSchedules(interaction) {
  const result = await dbPool.query(
    'SELECT job_id, channel_id, command, args, interval_minutes, last_run FROM tsukibot.scheduled_posts WHERE guild_id = $1 ORDER BY job_id;',
    [interaction.guildId]
  );

  if (result.rows.length === 0) {
    await interaction.editReply('This server has no scheduled posts. Create one with `/schedule create`.');
    return;
  }

  const intervalName = (minutes) =>
    Object.keys(SCHEDULE_INTERVALS).find(key => SCHEDULE_INTERVALS[key] === minutes) || `${minutes}m`;

  let description = '';
  for (const row of result.rows) {
    const lastRun = row.last_run ? `<t:${Math.floor(new Date(row.last_run).getTime() / 1000)}:R>` : 'never';
    description += `\`#${row.job_id}\` **${SCHEDULABLE_COMMANDS[row.command] || row.command}**` +
      `${row.args ? ` (\`${row.args}\`)` : ''} in <#${row.channel_id}>\n` +
      ` every ${intervalName(row.interval_minutes)} · last posted ${lastRun}\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle('Scheduled posts')
    .setDescription(description)
    .setColor('#9d8dff')
    .setFooter({ text: 'Remove one with /schedule delete id:<number>' });

  await interaction.editReply({ embeds: [embed] });
}

async function deleteSchedule(interaction, jobId) {
  // Scoped to this guild so an admin can never delete another server's schedule by guessing an id.
  const result = await dbPool.query(
    'DELETE FROM tsukibot.scheduled_posts WHERE job_id = $1 AND guild_id = $2 RETURNING command;',
    [jobId, interaction.guildId]
  );

  if (result.rows.length === 0) {
    await interaction.editReply(`No scheduled post \`#${jobId}\` found in this server. Use \`/schedule list\` to see them.`);
    return;
  }
  await interaction.editReply(`Removed scheduled post \`#${jobId}\` (${SCHEDULABLE_COMMANDS[result.rows[0].command] || result.rows[0].command}).`);
}

// Replays one stored job into its channel using the same functions the slash commands call.
async function runScheduledPost(post) {
  const channel = await client.channels.fetch(post.channel_id);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`channel ${post.channel_id} is not a text channel`);
  }

  // Most of the command functions below send to the channel and handle their own send errors, so a
  // revoked permission would otherwise fail silently and re-fail every cycle forever. Checking here
  // turns that into a thrown error the caller can act on, and the codes below retire the job.
  const botPermissions = channel.guild ? channel.permissionsFor(channel.guild.members.me) : null;
  if (botPermissions && (!botPermissions.has(PermissionFlagsBits.SendMessages) || !botPermissions.has(PermissionFlagsBits.EmbedLinks))) {
    const err = new Error(`missing send or embed permission in channel ${post.channel_id}`);
    err.code = 50013; // Discord's "Missing Permissions", so the caller retires this job
    throw err;
  }

  switch (post.command) {
    case 'hmap':
      await channel.send({ files: [{ attachment: 'chartscreens/generated-charts/hmap.png', name: 'hmap.png' }] });
      break;
    case 'fg':
      await getFearGreedIndex(channel, client.user, null);
      break;
    case 'movers':
      await getBiggestMovers(channel, client.user);
      break;
    case 'trending':
      await getTrendingCoins(channel, null);
      break;
    case 'pop':
      await getPriceCG(getTop10Symbols(), channel, 'p');
      break;
    case 'cg':
      await getPriceCG((post.args || '').split(' ').filter(v => v !== ''), channel, '-', 'd');
      break;
    default:
      throw new Error(`unknown scheduled command "${post.command}"`);
  }
}

async function runDueScheduledPosts() {
  // Claim due jobs by stamping last_run in the same statement that selects them, so a slow post
  // can never be picked up twice by the next tick.
  const due = await dbPool.query(`
    UPDATE tsukibot.scheduled_posts
    SET last_run = NOW()
    WHERE job_id IN (
      SELECT job_id FROM tsukibot.scheduled_posts
      WHERE last_run IS NULL OR last_run + (interval_minutes * INTERVAL '1 minute') <= NOW()
    )
    RETURNING *;
  `);

  for (const post of due.rows) {
    const startedAt = Date.now();
    try {
      await runScheduledPost(post);
      console.log(pc.green(`Posted scheduled job #${post.job_id} (${post.command}) to channel ${post.channel_id}.`));
      telemetry.recordSystemEvent('scheduled-post', {
        userId: String(post.created_by || 'system'),
        guildId: post.guild_id,
        channelId: post.channel_id,
        subcommand: post.command,
        params: { job_id: String(post.job_id), interval_minutes: post.interval_minutes },
        coins: telemetry.extractCoins('cg', { coins: post.args || '' }),
        durationMs: Date.now() - startedAt
      });
    }
    catch (err) {
      console.log(pc.yellow(`Scheduled job #${post.job_id} failed: ${err.message}`));
      telemetry.recordSystemEvent('scheduled-post', {
        userId: String(post.created_by || 'system'),
        guildId: post.guild_id,
        channelId: post.channel_id,
        subcommand: post.command,
        params: { job_id: String(post.job_id) },
        outcome: 'error',
        error: err,
        durationMs: Date.now() - startedAt
      });
      // A channel the bot can no longer reach (deleted, kicked, permissions revoked) would fail
      // forever, so retire the job rather than logging the same error every cycle.
      if (err.code === 10003 || err.code === 50001 || err.code === 50013) {
        await dbPool.query('DELETE FROM tsukibot.scheduled_posts WHERE job_id = $1;', [post.job_id]);
        console.log(pc.yellow(`Removed scheduled job #${post.job_id}: its channel is gone or unreadable.`));
      }
    }
  }
}


//------------------------------------------
//------------------------------------------

// This function handles users personal coin
// lists. Setting, displaying, and editing
// of lists is handled here.

function getCoinArray(id, channel, message, coins = '', action = '', interaction) {

  // don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning) {
    if (interaction) {
      interaction.reply(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      return;
    }
    else {
      channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      console.log(pc.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
      return;
    }
  }

  // delete .tbpa command after 5 min (optional)
  // message.delete({ timeout: 300000 });

  // look for the action (+/-) within the provided coins list
  if (coins[0] == '+') {
    action = coins.shift();
  }
  else if (coins[0] == '-') {
    action = coins.shift();
  }

  // .tbpa call (display action)
  if (coins === '') {
    dbPool.query('SELECT * FROM tsukibot.profiles where id = $1;', [id], (err, res) => {
      if (err) { console.log(pc.red(pc.bold((err + '------TBPA query select error')))); }
      else {
        //Check if current user array is empty or not and exit if it is
        if (res.rows[0] && res.rows[0].coins.replace(/\s+/g, '') !== '{}' && res.rows[0].coins.replace(/\s+/g, '') !== '{,}') {
          //Collect and store the string of coins
          let inStr = res.rows[0].coins;
          //Process coins string
          inStr = inStr.replace(/\s+/g, ''); //remove spaces
          try {
            // console.log(chalk.green(
            //   'tbpa called by ' + chalk.yellow(message.member.user.tag) + ' : ' +
            //   chalk.blue.bold(inStr)
            // ));
          } catch {
            // console.log(chalk.red.bold('Tbpa caller ' + chalk.yellow(message.author) + ' is null, could not get user tag. ' +
            //   '(likely due to them being very new to server or lacking roles)'));
          }
          inStr = inStr.replace(/\{+/g, ''); //remove left bracket
          inStr = inStr.replace(/\}+/g, ''); //remove right bracket
          //Convert processed string to array of coins, then filter the array
          const coins = inStr.split(',').filter(function (value) {
            return !isNaN(value) || pairs_CG_arr.indexOf(value.toUpperCase()) > -1;
          });
          getPriceCG(coins, channel, action, 'd', true, interaction);
        } else {
          //console.log(chalk.green('Sent missing tbpa notice to ') + chalk.blue(message.member.user.tag));
          if (interaction) {
            interaction.reply('You don\'t have any coins in your list. Use `/tbpa-add <coin>` to add some!');
          }
          else {
            channel.send('Looks like you don\'t currently have a saved list. Use `/tbpa-add <coin>` to add some!');
          }
        }
      }
    });


    // .tb pa call (create new list or overwrite existing)
  } else {

    if (coins.length == 0) {
      // help message for when no input is given to modification command
      channel.send('**Here\'s how to set up or modify your tbpa:**\n' +
        ':small_blue_diamond: To add coins to your list, use `/tbpa-add coins:<coins>`.' +
        '\n          **Example:** `/tbpa-add coins: eth btc glm`\n' +
        ':small_blue_diamond: To add or remove from an existing tbpa, simply put a + or - right after the "pa".' +
        '\n          **Example:**  Add: `/tbpa-add coins: dot xlm fil`  Remove: `/tbpa-remove coins: dot eth`\n\n' +
        ':notepad_spiral: You can set/modify one coin, or even multiple coins at a time (as seen above).' +
        ' For any further questions, use `/help` to see the more detailed commands guide and examples.');
      return;
    }
    // filter out any invalid cg coins and other input and notify user of them accordingly
    const cleanedCoins = coins.filter(e => e && isAlphaNumeric(e) && pairs_CG_arr.includes(e.toUpperCase()) && !Web3.utils.isAddress(e));
    const invalidCoins = coins.filter(e => !e || !isAlphaNumeric(e) || !pairs_CG_arr.includes(e.toUpperCase()) || Web3.utils.isAddress(e));
    let invalidCoinsMessage = '';
    if (invalidCoins.length > 0) {
      invalidCoinsMessage = '\nNOTE: The following coins were invalid tickers or not found on CoinGecko and have been automatically excluded: `' + invalidCoins.toString() + '`';
    }

    if (action === '') {
      coins = `{${cleanedCoins}}`;
      dbPool.query(('INSERT INTO tsukibot.profiles(id, coins) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET coins = $2;'), [id, coins.toLowerCase()], (err) => {
        if (err) { console.log(pc.red(pc.bold((err + '------TB PA query insert error')))); }
        else { channel.send('Personal array set: `' + coins.toLowerCase() + '` for <@' + id + '>.' + invalidCoinsMessage); }
      });

      // edit existing tbpa list
    } else {
      const command = (action === '-') ? 'REMOVE' : 'ADD';
      dbPool.query('SELECT * FROM tsukibot.profiles where id = $1;', [id], (err, res) => {
        if (err) { console.log(pc.red(pc.bold(err + '------TB PA query select error'))); }
        else {
          let inStr = '';
          if (res.rows[0]) {
            console.log(pc.green('tbpa modification (' + pc.cyan(command) + ' started of raw array: ' + pc.cyan(res.rows[0].coins.replace(/\s+/g, ''))));
            //Collect and store the string of coins
            inStr = res.rows[0].coins + '';    //load the array
            inStr = inStr.replace(/\s+/g, ''); //remove spaces
            inStr = inStr.replace(/\{+/g, ''); //remove left bracket
            inStr = inStr.replace(/\}+/g, ''); //remove right bracket
          }
          if (command === 'REMOVE') {
            if (typeof inStr === 'undefined') {
              if (interaction) {
                interaction.reply('You don\'t have a saved list to remove from.');
              }
              else {
                channel.send('There\'s nothing to remove! Your request has been ignored.');
                //console.log(chalk.red.bold('Remove action aborted on null tbpa. Request was sent by: ' + chalk.yellow(message.author.username)));
              }
            }
            else {
              //String processing
              coins = coins.toString().toLowerCase();
              const coinsArray = coins.split(',');
              const arrayLength = coinsArray.length;
              for (let i = 0; i < arrayLength; i++) {
                //Remove each coin that was marked for deletion
                inStr = inStr.toLowerCase().replace(coinsArray[i], '');
              }
              //Cleanup
              while (inStr.includes(',,')) { inStr = inStr.replace(',,', ','); } //remove excess commas  
              inStr = '{' + inStr + '}';
              inStr = inStr.replace('{,', '{'); //remove starting commas
              inStr = inStr.replace(',}', '}'); //remove ending commas
              inStr = inStr.replace('{,}', '{}'); //remove lingering commas
              inStr = inStr.replace(/\{+/g, ''); //remove left bracket
              inStr = inStr.replace(/\}+/g, ''); //remove right bracket
              dbPool.query(('INSERT INTO tsukibot.profiles(id, coins) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET coins = $2;'), [id, '{' + inStr + '}'], (err) => {
                if (err) { console.log(pc.red(pc.bold(err + '------TB PA remove insert query error'))); }
                else {
                  if (interaction) {
                    interaction.reply('Personal array modified successfully.');
                  }
                  else {
                    channel.send('Personal array modified successfully.');
                  }
                }
              });
            }
          }
          if (command === 'ADD') {
            coins = cleanedCoins;
            //Check if user has an entry in the DB
            if (typeof inStr === 'undefined') {
              channel.send('You don\'t have a saved list yet. Create one with `/tbpa-add coins: btc eth xrp`');
              //console.log(chalk.red.bold('TBPA add action aborted on null tbpa. The user does not have a DB entry yet! Request was sent by: ' + chalk.yellow(message.author.username)));
            } else {
              //String processing
              while (inStr.includes(',,')) { inStr = inStr.replace(',,', ','); } //remove excess commas
              inStr = inStr + ',' + coins.toString().toLowerCase(); //add selected coins
              inStr = '{' + inStr + '}';
              inStr = inStr.replace('{,', '{'); //remove starting comma
              inStr = inStr.replace(/\{+/g, ''); //remove left bracket
              inStr = inStr.replace(/\}+/g, ''); //remove right bracket
              dbPool.query(('INSERT INTO tsukibot.profiles(id, coins) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET coins = $2;'), [id, '{' + inStr + '}'], (err) => {
                if (err) { console.log(pc.red(pc.bold(err + '------TB PA add insert query error'))); }
                else {
                  if (coins.length > 0) {
                    if (interaction) {
                      interaction.reply('Personal array modified. Added: `' + cleanedCoins.toString() + '`' + invalidCoinsMessage);
                    }
                    else {
                      channel.send('Personal array modified. Added: `' + cleanedCoins.toString() + '`' + invalidCoinsMessage);
                    }
                  }
                  else {
                    if (interaction) {
                      interaction.reply('Your provided coin(s) were invalid or not found listed on CoinGecko. Your request has been aborted.\nMake sure your coins are valid CoinGecko-listed coins!');
                    }
                    else {
                      channel.send('Your provided coin(s) were invalid or not found listed on CoinGecko. Your request has been aborted.\nMake sure your coins are valid CoinGecko-listed coins!');
                    }
                  }
                }
              });
            }
          }
        }
      });
    }
  }
}



// -------------------------------------------
// -------------------------------------------
//
//              DISCORD FUNCTIONS
//
// -------------------------------------------
// -------------------------------------------

// Create a client and set client parameters
const client = new Client({ intents: [GatewayIntentBits.Guilds], shards: 'auto' });
const clientShardHelper = new ShardClientUtil(client);

// Wait for the client to be ready, then load up.
client.on('clientReady', () => {

  if (keys.dbl == 'yes') {
    // Create Top.gg posting process using the bot client
    // Bot stats will be reported automatically every 30 minutes with this
    poster = AutoPoster(keys.dbots, client);
    poster.on('error', (err) => {
      // Catch issues with Top.gg updater
      console.log(pc.yellow('Top.gg poster failed to update due to the following error:  ' + pc.cyan(err)));
    });
  }

  console.log(pc.yellow('------------------------------------------------------ ' + pc.greenBright('Bot Start') + ' ------------------------------------------------------'));
  console.log(pc.green('                                                    Active Shards: ' + pc.blue(clientShardHelper.count)));

  // Show dev mode active status
  if (devMode) console.log(pc.yellow('Dev mode active!'));

  // Display help command on bot's status
  client.user.setActivity('/help', { type: ActivityType.Watching });

  // First run of scheduled executions.
  // Each of these is fire-and-forget, so each needs its own catch: an unhandled rejection here used
  // to be logged by the global handler and then silently skipped, with no retry until the next tick.
  const logStartupFailure = (name) => (err) => {
    console.log(pc.red(`Startup task ${name} failed: ` + pc.cyan(err && err.message ? err.message : err)));
  };

  updateExchangeRates().catch(logStartupFailure('updateExchangeRates'));
  updateCmcKey();
  getCMCData().catch(logStartupFailure('getCMCData'));
  ensureAlertsTable().catch(logStartupFailure('ensureAlertsTable'));
  ensureHoldingsTable().catch(logStartupFailure('ensureHoldingsTable'));
  ensureSchedulesTable().catch(logStartupFailure('ensureSchedulesTable'));
  telemetry.ensureTelemetryTable().catch(logStartupFailure('ensureTelemetryTable'));

  // Resolve who owns the application so /usage has an admin list even when keys.api defines none.
  // Team-owned apps report a team instead of a user, so every team member is accepted.
  client.application.fetch()
    .then(app => {
      const owners = new Set();
      if (app.owner && app.owner.id) owners.add(String(app.owner.id));
      if (app.owner && app.owner.members) {
        for (const member of app.owner.members.values()) owners.add(String(member.id));
      }
      applicationOwnerIds = owners;
      console.log(pc.green('Telemetry admins resolved: ') +
        pc.cyan(`${owners.size} owner(s), ${configuredAdmins.size} configured`));
    })
    .catch(logStartupFailure('resolve application owner'));

  // Load CG cache from file first for instant availability
  const cacheLoaded = loadCGCacheFromFile();

  // Raise the startup gate before kicking off the first pass, not after. getCGData suspends at its
  // first await, so setting this afterwards left a window where commands saw the gate down.
  if (!cacheLoaded) {
    cacheUpdateRunning = true;
  }
  else {
    console.log(pc.cyan('Starting background CoinGecko cache update...'));
  }

  // Then run the update in the background to get fresh data
  getCGData(cacheLoaded ? 'background' : 'firstrun').catch(logStartupFailure('getCGData'));

  // Staggered: getCGData already hits /coins/list, and firing both at once against the keyless
  // per-IP budget is a reliable way to start life rate limited.
  setTimeout(() => {
    updateCoins().catch(logStartupFailure('updateCoins'));
  }, 60000).unref();

  getCoin360Heatmap().catch(logStartupFailure('getCoin360Heatmap'));
});

// Links the caller to the full command guide
function postHelp(interaction) {
  const link = 'https://github.com/EthyMoney/TsukiBot/blob/master/common/commands.md';
  return interaction.reply('Hi there! Here\'s a link to the fancy help document that lists every command and how to use them: \n' + link);
}

// Runs the new-server join procedure when the bot is added to a guild
client.on('guildCreate', guild => {
  joinProcedure(guild);
});

// Log when a server removes the bot
client.on('guildDelete', guild => {
  if (guild && guild.name) {
    console.log(pc.redBright('A SERVER HAS LEFT THE FAMILY :(  Goodbye: ' + pc.cyan(guild.name)));
  }
});


// -------------------------------------------
//        SLASH COMMAND (INTERACTION) HANDLER
// -------------------------------------------

/*
  Adapter that lets the older command functions (which were written to call
  channel.send(...)) work seamlessly with slash command interactions.
  The first message is sent via reply/editReply, and any additional messages
  are sent via followUp, so multi-message commands work correctly.
*/
function makeResponder(interaction) {
  let firstResponseSent = false;
  return {
    // expose the guild for legacy functions that read channel.guild.name
    guild: interaction.guild,
    send: async (payload) => {
      try {
        if (!firstResponseSent) {
          firstResponseSent = true;
          if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(payload);
          }
          return await interaction.reply(payload);
        }
        return await interaction.followUp(payload);
      } catch (err) {
        console.log(pc.red('Error sending interaction response: ' + pc.cyan(err)));
      }
    }
  };
}

/*
  Ticker autocomplete.

  Suggestions come straight out of the in-memory CoinGecko cache, which is already sorted by market
  cap rank, so the most relevant coins surface first with no extra API calls. Exact ticker matches
  are promoted above name matches, which is what disambiguates the many duplicated symbols.
*/
function getCoinSuggestions(rawInput) {
  const input = (rawInput || '').trim().toLowerCase();
  const exactTickerMatches = [];
  const tickerPrefixMatches = [];
  const nameMatches = [];

  for (const coin of cgArrayDictParsed) {
    if (!coin || !coin.symbol) continue;
    const symbol = coin.symbol.toLowerCase();
    const name = (coin.name || '').toLowerCase();

    if (input === '') {
      tickerPrefixMatches.push(coin);
    }
    else if (symbol === input) {
      exactTickerMatches.push(coin);
    }
    else if (symbol.startsWith(input)) {
      tickerPrefixMatches.push(coin);
    }
    else if (name.includes(input)) {
      nameMatches.push(coin);
    }

    // The cache is rank-sorted, so once we have comfortably more than a full page of results
    // from the highest-ranked coins there is nothing better further down the list.
    if (exactTickerMatches.length + tickerPrefixMatches.length >= 25) break;
  }

  let results = [...exactTickerMatches, ...tickerPrefixMatches, ...nameMatches];

  /* The market cache only pre-loads the top CG_MAX_PAGES pages, so on its own it would suggest
     nothing outside the top few hundred coins. cgCoinList carries {id, symbol, name} for every
     listed coin and costs no credits to search, so the tail of the suggestions comes from there.
     Whatever the user picks is resolved later by resolveCoin, which pays for one live lookup only
     if the coin really is outside the cache. */
  if (results.length < 25 && input !== '') {
    const seen = new Set(results.map(coin => coin.symbol.toLowerCase()));
    for (const coin of cgCoinList) {
      if (!coin || !coin.symbol) continue;
      const symbol = coin.symbol.toLowerCase();
      if (seen.has(symbol)) continue;
      if (symbol.startsWith(input) || (coin.name || '').toLowerCase().includes(input)) {
        seen.add(symbol);
        results.push(coin);
        if (results.length >= 25) break;
      }
    }
  }

  return results
    .slice(0, 25)
    .map(coin => ({
      name: `${coin.symbol.toUpperCase()} — ${coin.name}${coin.market_cap_rank ? ` (#${coin.market_cap_rank})` : ''}`.slice(0, 100),
      value: coin.symbol.toLowerCase().slice(0, 100)
    }));
}

async function handleAutocomplete(interaction) {
  try {
    const focused = interaction.options.getFocused(true);

    // /usage command completes command names, not coins. Handled first because the coin lookup
    // below would otherwise return tickers for a field that expects a command.
    if (interaction.commandName === 'usage') {
      const input = (focused.value || '').trim().toLowerCase();
      const matches = registeredCommandNames
        .filter(name => name.includes(input))
        .slice(0, 25)
        .map(name => ({ name: '/' + name, value: name }));
      await interaction.respond(matches);
      return;
    }

    let suggestions = getCoinSuggestions(focused.value);

    // /convert accepts fiat on either side, so offer matching currencies alongside the coins.
    if (interaction.commandName === 'convert') {
      const input = (focused.value || '').trim().toUpperCase();
      const fiatMatches = Object.keys(forexRates)
        .filter(code => code.startsWith(input))
        .slice(0, 5)
        .map(code => ({ name: `${code} — fiat currency`, value: code.toLowerCase() }));
      suggestions = [...fiatMatches, ...suggestions].slice(0, 25);
    }

    await interaction.respond(suggestions);
  }
  catch {
    // Autocomplete responses expire after 3 seconds and cannot be retried. Failing quietly is
    // correct here: the user simply types the ticker themselves.
  }
}

// Re-render a chart at a different timeframe when one of the buttons under it is clicked.
async function handleChartButton(interaction) {
  // Split on the first two colons only: an exchange-qualified pair (e.g. "binance:btcusdt") contains
  // colons of its own, and a plain destructure would drop everything after the first one.
  const parts = interaction.customId.split(':');
  const timeframe = parts[1];
  const baseQuery = parts.slice(2).join(':');
  if (!timeframe || !baseQuery) return;

  if (!cluster) {
    await interaction.reply({ content: 'Chart rendering is unavailable right now.', flags: MessageFlags.Ephemeral });
    return;
  }

  // deferUpdate (rather than deferReply) means the existing chart message is edited in place,
  // so the timeframe swap happens on the original post instead of spawning a new one.
  await interaction.deferUpdate();

  if (chartTagID > 25) chartTagID = 1;
  const newQuery = swapChartInterval(baseQuery, timeframe);
  cluster.queue({
    message: '',
    interaction: interaction,
    args: ('.tbc ' + newQuery).split(' ').filter(v => v !== ''),
    originalQuery: baseQuery,
    activeInterval: timeframe,
    chartMessage: '',
    attempt: 1,
    chartID: ++chartTagID
  });
}

// Renders a command's options for the log line.
//
// Subcommands and subcommand groups carry nested options rather than a value of their own, so
// reading .value on them printed "show: undefined". Recursing gives "show" and "set coin: eth".
function describeCommandOptions(options) {
  return (options || []).map(option => {
    if (option.type === ApplicationCommandOptionType.Subcommand ||
      option.type === ApplicationCommandOptionType.SubcommandGroup) {
      const nested = describeCommandOptions(option.options);
      return nested ? `${option.name} ${nested}` : option.name;
    }
    return `${option.name}: ${option.value}`;
  }).filter(Boolean).join(', ');
}

// This is triggered for every interaction that the bot receives
/**
 * Dispatches /usage. Kept as one function so the admin gate and the deferral
 * are applied in exactly one place rather than per subcommand.
 * @param {object} interaction
 */
async function handleUsageCommand(interaction) {
  if (!isBotAdmin(interaction.user.id)) {
    await interaction.reply({
      content: 'That command is restricted to the bot owner. Usage reports expose activity across every server the bot is in.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const days = interaction.options.getInteger('days') || 30;
  const limit = interaction.options.getInteger('limit') || 15;
  const timezone = telemetryReports.normalizeTimezone(interaction.options.getString('timezone') || 'UTC');

  // Reports are read-only aggregate scans and are always private.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Flush first so a report run right after a command reflects it, instead of
  // missing the last few seconds still sitting in the write buffer.
  await telemetry.flush();

  switch (sub) {
    case 'overview':
      await interaction.editReply({ embeds: [await buildUsageOverview(days, timezone)] });
      break;

    case 'commands':
      await interaction.editReply({
        embeds: [await buildUsageCommands(days, limit, interaction.options.getBoolean('include_searches') || false)]
      });
      break;

    case 'users':
      await interaction.editReply({ embeds: [await buildUsageUsers(days, limit)] });
      break;

    case 'servers':
      await interaction.editReply({ embeds: [await buildUsageGuilds(days, limit)] });
      break;

    case 'coins':
      await interaction.editReply({ embeds: [await buildUsageCoins(days, limit)] });
      break;

    case 'activity':
      await interaction.editReply({ embeds: [await buildUsageActivity(days, timezone)] });
      break;

    case 'command':
      await interaction.editReply({
        embeds: [await buildUsageCommandDetail(interaction.options.getString('name'), days)]
      });
      break;

    case 'errors':
      await interaction.editReply({ embeds: [await buildUsageErrors(days, limit)] });
      break;

    case 'growth':
      await interaction.editReply({ embeds: [await buildUsageGrowth(days, timezone)] });
      break;

    case 'credits':
      await interaction.editReply({ embeds: [await buildUsageCredits(days, timezone)] });
      break;

    case 'export': {
      // Capped well under Discord's attachment limit; a full dump belongs in psql, not here.
      const rows = await telemetryReports.getRecentEvents(days, Math.min(interaction.options.getInteger('rows') || 5000, 50000));
      if (rows.length === 0) {
        await interaction.editReply({ content: 'No events to export in that window.' });
        break;
      }
      let csv = render.renderCsv(rows);
      let exported = rows.length;

      // Discord rejects an oversized attachment outright, which would turn a large export into a
      // bare error. Trimming to the most recent rows that fit degrades it into a smaller export
      // instead, and says so rather than pretending the file is complete.
      const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;
      if (Buffer.byteLength(csv, 'utf8') > MAX_ATTACHMENT_BYTES) {
        const lines = csv.split('\n');
        const header = lines[0];
        let size = Buffer.byteLength(header, 'utf8');
        const kept = [header];
        for (const line of lines.slice(1)) {
          size += Buffer.byteLength(line, 'utf8') + 1;
          if (size > MAX_ATTACHMENT_BYTES) break;
          kept.push(line);
        }
        csv = kept.join('\n');
        exported = kept.length - 1;
      }

      const file = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: `tsukibot-usage-${days}d.csv` });
      await interaction.editReply({
        content: `Exported **${exported}** events from the last ${days} day(s).` +
          (exported < rows.length ? ` Trimmed from ${rows.length} to fit Discord's attachment limit.` : ''),
        files: [file]
      });
      break;
    }

    case 'storage': {
      const storage = await telemetryReports.getStorageStats();
      const writer = telemetry.getWriterStats();
      const embed = usageEmbed('Telemetry storage', days)
        .setDescription('Nothing is pruned automatically. Use `/usage prune` when the table gets large.')
        .addFields({
          name: 'Table', value: render.codeBlock(render.renderKeyValue([
            ['Rows', render.compactNumber(storage.rows)],
            ['On disk', String(storage.total_size)],
            ['Oldest', storage.oldest ? new Date(storage.oldest).toISOString().slice(0, 10) : '-'],
            ['Buffered', String(writer.buffered)],
            ['Settling', String(writer.pendingAutocomplete)],
            ['Dropped', String(writer.dropped)]
          ]))
        });
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case 'prune': {
      const keepDays = interaction.options.getInteger('keep_days');
      if (!interaction.options.getBoolean('confirm')) {
        await interaction.editReply({
          content: `This would permanently delete every event older than **${keepDays} days**. ` +
            'Re-run with `confirm: True` if that is what you want.'
        });
        break;
      }
      const deleted = await telemetryReports.pruneOlderThan(keepDays);
      console.log(pc.yellow(`Telemetry pruned: ${deleted} events older than ${keepDays} days deleted by ${interaction.user.username}`));
      await interaction.editReply({ content: `Deleted **${deleted}** events older than ${keepDays} days.` });
      break;
    }

    default:
      await interaction.editReply({ content: 'Unknown usage report.' });
  }
}

client.on('interactionCreate', async interaction => {
  // Autocomplete and component interactions arrive here too, and used to be dropped by the
  // chat-input-only guard below.
  if (interaction.isAutocomplete()) {
    // Recorded before the handler runs, because what the user typed is interesting even when the
    // lookup finds nothing. Keystrokes of one search are coalesced inside the telemetry module.
    telemetry.recordAutocomplete(interaction);
    await handleAutocomplete(interaction);
    return;
  }

  if (interaction.isButton()) {
    const buttonStart = Date.now();
    try {
      if (interaction.customId.startsWith('chart:')) await handleChartButton(interaction);
      telemetry.recordButton(interaction, { durationMs: Date.now() - buttonStart });
    }
    catch (err) {
      console.log(pc.red('Error handling button interaction: ' + pc.cyan(err)));
      telemetry.recordButton(interaction, { outcome: 'error', error: err, durationMs: Date.now() - buttonStart });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return; // only handle slash commands
  if (interaction.user.bot) return; // ignore bots

  const command = interaction.commandName;
  const opts = interaction.options;
  const author = interaction.user;
  const startedAt = Date.now();

  const inputs = describeCommandOptions(opts.data);
  console.log(pc.green('Slash command ') + pc.cyan('/' + command) + pc.green(' used by ') + pc.yellow(author.username) + (inputs ? pc.green(' with ') + pc.cyan(inputs) : ''));

  try {
    switch (command) {

      // ---- TradingView charts ----
      case 'c': {
        await interaction.deferReply();
        if (!cluster) {
          await interaction.editReply('Sorry, chart rendering is unavailable right now. Please try again later.');
          break;
        }
        if (chartTagID > 25) chartTagID = 1;
        const query = (opts.getString('query') || '').toLowerCase();
        const data = {
          message: '',
          interaction: interaction,
          args: ('.tbc ' + query).split(' ').filter(v => v !== ''),
          originalQuery: query,
          chartMessage: '',
          attempt: 1,
          chartID: ++chartTagID
        };
        cluster.queue(data);
        break;
      }

      // ---- CoinGecko prices ----
      case 'cg': {
        const coins = opts.getString('coins').split(' ').filter(v => v !== '');
        if (coins.length === 1 && isLikelyContractAddress(coins[0])) {
          await interaction.deferReply();
          await getPriceCGByContract(coins[0], interaction);
        }
        else {
          getPriceCG(coins, null, '-', 'd', false, interaction);
        }
        break;
      }

      // ---- Exchange prices ----
      case 'price': {
        await interaction.deferReply();
        const exchange = opts.getString('exchange');
        const coin = opts.getString('coin');
        const vs = opts.getString('vs') || undefined;
        const responder = makeResponder(interaction);
        switch (exchange) {
          case 'coinbase': getPriceCoinbase(responder, coin, vs); break;
          case 'binance': getPriceBinance(coin, vs, responder); break;
          case 'kraken': getPriceKraken(coin, vs, responder); break;
          case 'bitfinex': getPriceBitfinex(author, coin, vs, responder); break;
          case 'bitmex': getPriceMex(coin, vs, responder); break;
          case 'poloniex': getPricePolo(coin, vs, responder); break;
          default: await interaction.editReply('Unknown exchange selected.');
        }
        break;
      }

      // ---- CoinMarketCap prices ----
      case 'cmc': {
        await interaction.deferReply();
        getPriceCMC(opts.getString('coins').split(' ').filter(v => v !== ''), makeResponder(interaction), '-', 'd');
        break;
      }

      // ---- CryptoCompare prices ----
      case 'cc': {
        await interaction.deferReply();
        getPriceCC(opts.getString('coins').split(' ').filter(v => v !== ''), makeResponder(interaction), 'd');
        break;
      }

      // ---- Stocks ----
      case 'stocks': {
        await interaction.deferReply();
        getStocks(opts.getString('symbol'), makeResponder(interaction));
        break;
      }

      // ---- Session stats ----
      case 'stats':
        await postSessionStats(null, interaction);
        break;

      // ---- Help ----
      case 'help':
        await postHelp(interaction);
        break;

      // ---- Fear/Greed index ----
      case 'fg':
        getFearGreedIndex(null, author, interaction);
        break;

      // ---- Perpetual swap funding rates ----
      case 'funding':
        await interaction.deferReply();
        await getFundingRates(opts.getString('coin') || 'BTC', null, interaction);
        break;

      // ---- Binance longs/shorts ----
      case 'ls':
        await interaction.deferReply();
        getBinanceLongsShorts(null, author, interaction);
        break;

      // ---- Ethereum gas ----
      case 'gas':
        getEtherGas(null, author, interaction);
        break;

      // ---- Coin360 heatmap ----
      case 'hmap':
        sendCoin360Heatmap(null, interaction);
        break;

      // ---- Biggest movers ----
      case 'movers':
        await interaction.deferReply();
        getBiggestMovers(makeResponder(interaction), author);
        break;

      // ---- All-time high/low ----
      case 'ath':
        await interaction.deferReply();
        await getAllTimeHigh(opts.getString('coin'), null, interaction);
        break;

      // ---- Side-by-side coin comparison ----
      case 'compare':
        await interaction.deferReply();
        await compareCoins(opts.getString('coin1'), opts.getString('coin2'), null, interaction);
        break;

      // ---- CoinGecko trending ----
      case 'trending':
        await interaction.deferReply();
        await getTrendingCoins(null, interaction);
        break;

      // ---- AI market brief ----
      case 'brief':
        await interaction.deferReply();
        await getMarketBrief(interaction);
        break;

      // ---- Recurring scheduled posts ----
      case 'schedule': {
        if (!interaction.guildId) {
          await interaction.reply({ content: 'Scheduled posts can only be set up inside a server.', flags: MessageFlags.Ephemeral });
          break;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const scheduleSub = opts.getSubcommand();
        if (scheduleSub === 'create') {
          await createSchedule(
            interaction,
            opts.getString('command'),
            opts.getChannel('channel'),
            opts.getString('every'),
            opts.getString('coins')
          );
        } else if (scheduleSub === 'list') {
          await listSchedules(interaction);
        } else if (scheduleSub === 'delete') {
          await deleteSchedule(interaction, opts.getInteger('id'));
        }
        break;
      }

      // ---- Portfolio ----
      case 'portfolio': {
        // Holdings are private, so every response here is ephemeral.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const portfolioSub = opts.getSubcommand();
        if (portfolioSub === 'set') {
          await setHolding(interaction, opts.getString('coin'), opts.getNumber('amount'));
        } else if (portfolioSub === 'show') {
          await showPortfolio(interaction);
        } else if (portfolioSub === 'clear') {
          await clearPortfolio(interaction);
        }
        break;
      }

      // ---- Price alerts ----
      case 'alert': {
        // Alerts are personal, so keep the whole exchange private to the user who ran it.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const alertSub = opts.getSubcommand();
        if (alertSub === 'add') {
          await addPriceAlert(interaction, opts.getString('coin'), opts.getNumber('price'));
        } else if (alertSub === 'list') {
          await listPriceAlerts(interaction);
        } else if (alertSub === 'remove') {
          await removePriceAlert(interaction, opts.getInteger('id'));
        }
        break;
      }

      // ---- Coin info/description ----
      case 'info':
        await interaction.deferReply();
        getCoinDescription(opts.getString('coin').toUpperCase(), makeResponder(interaction), author, null);
        break;

      // ---- Market cap ----
      case 'mc': {
        const mcCoin = opts.getString('coin');
        if (!mcCoin) {
          getMarketCap(null, interaction); // global market cap
        } else {
          // Deferred because the specific-coin path downloads the coin's logo to pick an embed
          // color, which can easily outlast Discord's 3 second acknowledgement window.
          await interaction.deferReply();
          getMarketCapSpecific(mcCoin.toUpperCase(), interaction); // specific coin market cap
        }
        break;
      }

      // ---- Conversion ----
      case 'convert':
        await interaction.deferReply();
        priceConversionTool(opts.getString('from'), opts.getString('to'), String(opts.getNumber('amount')), null, null, interaction);
        break;

      // ---- Translation ----
      case 'translate':
        translateEN(null, opts.getString('text'), interaction);
        break;

      // ---- Etherscan address/tx/ENS lookup ----
      case 'eth': {
        await interaction.deferReply();
        const responder = makeResponder(interaction);
        const queryEth = opts.getString('query').trim();
        // Dispatch on shape, not just length. This value is interpolated into outbound Etherscan
        // URLs and into a Discord markdown link, so characters like & # ? and ) must never reach it.
        // Awaited so a failure lands in the handler's catch rather than leaving the deferred
        // interaction hanging until Discord times it out.
        if (/^0x[0-9a-fA-F]{40}$/.test(queryEth)) {
          await getEtherBalance(author, queryEth, responder, 'b');
        } else if (/^0x[0-9a-fA-F]{64}$/.test(queryEth)) {
          await getEtherBalance(author, queryEth, responder, 'tx');
        } else if (/^[a-zA-Z0-9-]{1,63}(\.[a-zA-Z0-9-]{1,63})*\.eth$/.test(queryEth.toLowerCase())) {
          await getEtherBalance(author, queryEth.toLowerCase(), responder, 'ens');
        } else {
          await interaction.editReply('Please provide a valid ETH address (0x... 42 chars), transaction hash (0x... 66 chars), or ENS name (name.eth).');
        }
        break;
      }

      // ---- Top 10 popular coins ----
      case 'pop': {
        await interaction.deferReply();
        getPriceCG(getTop10Symbols(), makeResponder(interaction), 'p');
        break;
      }

      // ---- Personal price array (tbpa) ----
      case 'tbpa':
        getCoinArray(author.id, null, null, '', null, interaction);
        break;

      case 'tbpa-add':
        getCoinArray(author.id, null, null, opts.getString('coins').split(' ').filter(v => v !== ''), 'ADD', interaction);
        break;

      case 'tbpa-remove':
        getCoinArray(author.id, null, null, opts.getString('coins').split(' ').filter(v => v !== ''), '-', interaction);
        break;

      // ---- Tags ----
      case 'tag': {
        const sub = opts.getSubcommand();
        const responder = makeResponder(interaction);
        const ts = interaction.createdTimestamp;
        if (sub === 'view') {
          tagsEngine(responder, author, ts, interaction.guild, 'tag', opts.getString('name'));
        } else if (sub === 'create') {
          tagsEngine(responder, author, ts, interaction.guild, 'createtag', opts.getString('name'), opts.getString('link'));
        } else if (sub === 'delete') {
          tagsEngine(responder, author, ts, interaction.guild, 'deletetag', opts.getString('name'), null, interaction.memberPermissions);
        } else if (sub === 'list') {
          tagsEngine(responder, author, ts, interaction.guild, 'taglist');
        }
        break;
      }

      // ---- Invite link ----
      case 'invite':
        await interaction.reply('Hi there! You can add me to your server with the following link. Please keep the requested permissions checked to ensure' +
          ' that I\'m able to work fully! \n<' + inviteLink + '>');
        break;

      // ---- GitHub link ----
      case 'github':
        await interaction.reply('Hi there! Here\'s a direct link to stalk my repo on GitHub: \nhttps://github.com/EthyMoney/TsukiBot');
        break;

      // ---- Donation addresses ----
      case 'donate':
        await interaction.reply('ETH & ERC20: `0x169381506870283cbABC52034E4ECc123f3FAD02`\n' +
          'BTC: `3NkBA4PFXZ1RgoBeJNAjeEpxDt9xfXiGg2`\n' +
          'LTC: `MJVUeYbcsEptLvgvwyPrXT1ytCYyY9q9oi`\n' +
          'ETC: `0xC4664CEB646494f0Fd6E2ddDCbF69e3Ee584219B`\n' +
          'ZEC: `t1YwhAZYPHo2LSYg4329kQbSEooWQAJaDxT`\n\n' +
          'Thank you so much for the support!  :beers:');
        break;

      // ---- Avatar ----
      case 'avatar': {
        const targetUser = opts.getUser('user') || author;
        await interaction.reply(targetUser.displayAvatarURL({ size: 1024 }));
        break;
      }

      // ---- Usage telemetry (admin only) ----
      case 'usage':
        await handleUsageCommand(interaction);
        break;

      // ---- Discord ID ----
      case 'id':
        await interaction.reply({ content: 'Your ID is `' + author.id + '`.', flags: MessageFlags.Ephemeral });
        break;

      default:
        await interaction.reply({ content: 'Unknown command. Use `/help` to see all available commands.', flags: MessageFlags.Ephemeral });
        break;
    }
    telemetry.recordCommand(interaction, { durationMs: Date.now() - startedAt });
  } catch (err) {
    // 10062 "Unknown interaction" means Discord has already discarded this interaction — the bot
    // was restarting, or took longer than the 3 second window to acknowledge it. There is nothing
    // left to reply to, so attempting one only produces a second, more confusing error.
    if (err && err.code === 10062) {
      console.log(pc.yellow('Interaction for ') + pc.cyan('/' + command) +
        pc.yellow(' expired before it could be acknowledged (bot restarting, or slow to respond). Nothing to reply to.'));
      // Tracked separately from a real error: an expired interaction says the bot was too slow or
      // restarting, which is an availability signal rather than a bug in the command.
      telemetry.recordCommand(interaction, { outcome: 'expired', durationMs: Date.now() - startedAt });
      return;
    }

    console.log(pc.red('Error handling slash command ') + pc.cyan('/' + command) + pc.red(': ') + pc.cyan(err));
    telemetry.recordCommand(interaction, { outcome: 'error', error: err, durationMs: Date.now() - startedAt });
    // Try to let the user know something went wrong, using whichever response method is still available
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'Sorry, something went wrong while processing that command. Please try again later.', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: 'Sorry, something went wrong while processing that command. Please try again later.', flags: MessageFlags.Ephemeral });
      }
    } catch (innerErr) {
      // Also unknown/expired: the user is already gone, so log quietly rather than as a second error.
      if (innerErr && innerErr.code === 10062) {
        console.log(pc.yellow('Could not notify the user: the interaction had already expired.'));
      } else {
        console.log(pc.red('Also failed to send error notification to user: ' + pc.cyan(innerErr)));
      }
    }
  }
});




// -------------------------------------------
// -------------------------------------------
//
//           SUPPORTING FUNCTIONS
//
// -------------------------------------------
// -------------------------------------------


// Capitalize names and titles

// TODO: Used in future for scheduled action stuff
// Validate HH:MM time and 00:05 minimum
// function validateTime(s) {
//   let t = s.split(':');
//   let formatTest = /^\d\d:\d\d$/.test(s) &&
//     t[0] >= 0 && t[0] < 25 &&
//     t[1] >= 0 && t[1] < 60;
//   // Verify minimum
//   if(formatTest && t[0] == 0){
//     if(t[1] >= 5){
//       return true;
//     }
//     else{
//       return false;
//     }
//   }
//   else{
//     return formatTest;
//   }
// }

// Translate message to english using google cloud
async function translateEN(channel, message, interaction) {

  let messageText = '';

  if (!interaction) {
    messageText = message.content + '';
    // strip out mentions, emojis, and command prefixes
    messageText = messageText.replace(/<.*>/, '');
    messageText = messageText.replace(RegExp('.tb translate', 'gi'), '');
    messageText = messageText.replace(RegExp('-t translate', 'gi'), '');
    messageText = messageText.replace(RegExp('.tb trans', 'gi'), '');
    messageText = messageText.replace(RegExp('-t trans', 'gi'), '');
    messageText = messageText.replace(RegExp('.tb t', 'gi'), '');
    messageText = messageText.replace(RegExp('-t t', 'gi'), '');
    messageText = messageText.replace(RegExp('.tbt', 'gi'), '');
    messageText = messageText.replace(RegExp('-tt', 'gi'), '');
  }
  else {
    messageText = message;
  }

  // check for empty input and send help response
  if (messageText.length == 0) {
    if (interaction) {
      interaction.reply('Please enter a message to translate.');
      return;
    }
    else {
      channel.send('Give me something to translate!\nUsage: `.tbt <your text to translate>`.  Example: `.tbt hola como estas`.');
      //console.log(chalk.green(`Translation command help sent to: ${chalk.yellow(message.author.username)} in ${chalk.cyan(message.guild.name)}`));
      return;
    }
  }
  // do the translation
  const target = 'en';
  const [translation] = await translate.translate(messageText, target).catch((err) => {
    if (interaction) {
      interaction.reply('Translation failed.  Please try again later.');
      return;
    }
    else {
      channel.send('Translation failed. Try again later.');
      console.log(pc.red(`Translation command failed and was rejected at client side: \n ${err}`));
      return;
    }
  });
  console.log(pc.magenta(`Translation: ${pc.cyan(translation)}`));
  if (!translation) {
    if (interaction) {
      interaction.reply('Translation failed.  Please try shortening your input or try again later.');
      return;
    }
    else {
      channel.send('Translation failed. Try shortening your input, otherwise try again later.');
      console.log(pc.red('Translation command failed and was undefined. Sent notification to user.'));
      return;
    }
  }
  //console.log(chalk.green(`Translation command called by: ${chalk.yellow(message.author.username)} in ${chalk.cyan(message.guild.name)}`));

  if (interaction) {
    interaction.reply(`Translation:  \`${translation.trimStart()}\``);
  }
  else {
    channel.send(`Translation:  \`${translation.trimStart()}\``);
  }
}

// Split up large strings by length provided without breaking words or links within them

// Valid string checker

// Split a string by spaces while keeping strings within brackets intact as one chunk (this assists the chunkString function)

// Check if string is a valid URL

// Pauses execution when called within an async function for the given milliseconds

// Send the session stats of the bot
/* --------------------------------------------------------------------------
 *
 *  Throughput for /stats.
 *
 *  This used to be derived from an in-memory `messageCount` that nothing had incremented since
 *  prefix commands were removed, so the figure was permanently zero. It now comes from the usage
 *  telemetry table, which means it survives restarts instead of resetting to zero on every deploy.
 *
 *  /stats is public, so the numbers are cached rather than queried per invocation. The lifetime
 *  total is a full table scan: cheap today, and not something to run on every button press as the
 *  table grows. Five minutes of staleness is invisible in a per-minute average.
 *
 * -------------------------------------------------------------------------- */

const STATS_THROUGHPUT_CACHE_MS = 5 * 60 * 1000;
let statsThroughputCache = { at: 0, value: null };

/**
 * @returns {Promise<{rate: number, total: number, windowLabel: string}|null>} null when telemetry
 *          has nothing to report or is unavailable, in which case /stats omits the lines.
 */
async function getCommandThroughput() {
  if (statsThroughputCache.at && Date.now() - statsThroughputCache.at < STATS_THROUGHPUT_CACHE_MS) {
    return statsThroughputCache.value;
  }

  let value = null;
  try {
    const stats = await telemetryReports.getActivityRate();
    const rate = telemetryReports.perMinuteRate(stats);
    if (rate !== null) {
      value = {
        rate,
        total: Number(stats.events_total),
        // Name the window, because a bot with less than a day of history is measured over its
        // actual runtime rather than over 24 hours.
        windowLabel: Number(stats.tracked_minutes) >= 1440 ? 'last 24h' : 'since tracking began'
      };
    }
  }
  catch (err) {
    // /stats has to keep working with the database unreachable; the throughput lines drop out.
    console.log(pc.yellow('Could not read command throughput for /stats: ' + pc.cyan(err.message)));
  }

  statsThroughputCache = { at: Date.now(), value };
  return value;
}

async function postSessionStats(message, interaction) {
  let users = (client.guilds.cache.reduce(function (sum, guild) { return sum + guild.memberCount; }, 0));
  users = numberWithCommas(users);
  const guilds = numberWithCommas(client.guilds.cache.size);

  const throughput = await getCommandThroughput();
  const throughputLines = throughput
    ? '⇒ Average commands per minute: `' + render.formatRate(throughput.rate) + '` (' + throughput.windowLabel + ').\n' +
    '⇒ Commands served all time: `' + numberWithCommas(throughput.total) + '`.\n'
    : '';

  const messageHeader = ('Serving `' + users + '` users from `' + guilds + '` servers.\n' +
    '⇒ Current uptime: `' + Math.trunc(client.uptime / (3600000)) + 'hr`.\n' +
    throughputLines +
    '⇒ Join the support server! (https://discord.gg/VWNUbR5)\n' +
    '`⇒ ETH donations appreciated at: 0x169381506870283cbABC52034E4ECc123f3FAD02`');

  const embed = new EmbedBuilder()
    .addFields(
      { name: 'TsukiBot Stats', value: messageHeader }
    )
    .setColor('#007fff')
    .setThumbnail('https://i.imgur.com/r6yCs2T.png')
    .setFooter({ text: 'The original cryptobot since 2017', iconURL: 'https://imgur.com/OG77bXa.png' });

  if (interaction) {
    interaction.reply({ embeds: [embed] });
  } else {
    message.channel.send({ embeds: [embed] });
  }
}

// Launches a puppeteer cluster and defines the job for grabbing tradingview charts
/* --------------------------------------------

    Chart interval handling.

    These aliases are shared between the chart server (which maps them to TradingView interval
    codes) and the chart buttons (which swap one alias out for another in the original query).

  -------------------------------------------- */

const CHART_INTERVAL_KEYS = ['1m', '1', '3m', '3', '5m', '5', '15m', '15', '30m', '30', '1h', '60', '2h', '120', '3h', '180', '4h', '240', '1d', 'd',
  'day', 'daily', '1w', 'w', 'week', 'weekly', '1mo', 'm', 'mo', 'month', 'monthly'];

const CHART_INTERVAL_MAP = {
  '1m': '1', '1': '1', '3m': '3', '3': '3', '5m': '5', '5': '5', '15m': '15', '15': '15', '30m': '30', '30': '30', '1h': '60',
  '60': '60', '2h': '120', '120': '120', '3h': '180', '180': '180', '4h': '240', '240': '240', '1d': 'D', 'd': 'D', 'day': 'D', 'daily': 'D', '1w': 'W',
  'w': 'W', 'week': 'W', 'weekly': 'W', '1mo': 'M', 'm': 'M', 'mo': 'M', 'month': 'M', 'monthly': 'M'
};

// Timeframes offered as buttons under a rendered chart.
const CHART_TIMEFRAME_BUTTONS = ['15m', '1h', '4h', '1d', '1w'];

// Rebuild a /c query with a different interval: drop whatever interval alias is in there now and
// append the requested one, leaving the pair, exchange, and any indicators untouched.
function swapChartInterval(query, newInterval) {
  const tokens = query.split(' ').filter(token => token !== '' && !CHART_INTERVAL_KEYS.includes(token));
  tokens.push(newInterval);
  return tokens.join(' ');
}

// Build the timeframe button row shown under a chart. The original (pre-normalization) query is
// carried in the button's customId so a click can re-run the exact same request at a new interval.
function buildChartControls(originalQuery, activeInterval) {
  if (!originalQuery) return [];

  const baseQuery = swapChartInterval(originalQuery.trim(), '').trim();
  const buttons = [];
  for (const timeframe of CHART_TIMEFRAME_BUTTONS) {
    const customId = `chart:${timeframe}:${baseQuery}`;
    // Discord caps customId at 100 characters. Rather than truncate into a broken query, we just
    // skip the controls for unusually long requests; the chart itself still posts normally.
    if (Buffer.byteLength(customId) > 100) return [];
    buttons.push(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(timeframe.toUpperCase())
        .setStyle(timeframe === activeInterval ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  }
  return [new ActionRowBuilder().addComponents(buttons)];
}

async function chartsProcessingCluster() {
  // Chromium location is configuration, not code: set CHROME_PATH to override. On Linux we default to
  // the distro package (which is what the production box uses); everywhere else we fall back to the
  // Chromium puppeteer downloaded itself, so this no longer needs editing per platform.
  const chromiumPath = process.env.CHROME_PATH ||
    (process.platform === 'linux' ? '/usr/bin/chromium' : undefined);

  // The sandbox is Chromium's main containment layer and these pages render user-influenced content
  // (the chart symbol comes from /c). It stays ON unless explicitly disabled. If your host genuinely
  // needs it off (running as root without user namespaces), set CHROME_NO_SANDBOX=true.
  const disableSandbox = String(process.env.CHROME_NO_SANDBOX).toLowerCase() === 'true';
  if (disableSandbox) {
    console.log(pc.yellow('WARNING: Chromium sandbox disabled via CHROME_NO_SANDBOX. Prefer running as a non-root user with user namespaces enabled.'));
  }

  const puppeteerOpts = {
    headless: true,
    executablePath: chromiumPath,
    args: disableSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
  };

  // Start up a puppeteer cluster browser.
  // Chart demand is bursty rather than sustained, and each TradingView widget page peaks at a few
  // hundred MB, so a high concurrency ceiling mostly buys the chance to OOM Chrome mid-render.
  try {
    cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_PAGE,
      maxConcurrency: 6,
      puppeteerOptions: puppeteerOpts,
      retryLimit: 3,
      retryDelay: 200,
      timeout: 85000,
      workerCreationDelay: 100
    });
  }
  catch (err) {
    // Without this the rejection surfaced only as an unhandled rejection and `cluster` stayed
    // undefined, so every chart command and the heatmap job threw "cluster.queue is not a function"
    // forever with no indication of why.
    cluster = null;
    console.error(pc.red(pc.bold('FAILED TO LAUNCH PUPPETEER CLUSTER. Chart and heatmap features will be unavailable.')));
    console.error(pc.red('Reason: ' + err.message));
    console.error(pc.cyan('Set CHROME_PATH to your Chromium/Chrome executable if it is installed somewhere else.'));
    return;
  }

  // Event handler to be called in case of problems
  cluster.on('taskerror', (err, data) => {
    console.log(pc.red(`Puppeteer cluster encountered error processing task: ${err.message}`));
    // The cluster retries internally; once it gives up, whoever asked for the chart is still sitting
    // on a deferred reply that nothing else will ever resolve.
    if (data && data.interaction) {
      data.interaction.editReply('Sorry, chart generation failed. Please try again in a moment.')
        .catch(() => { /* interaction may have expired, nothing more we can do */ });
    }
  });

  // Setting the charts task on the cluster
  await cluster.task(async ({ page, data: data }) => {
    const start = performance.now();
    //Get all data from object
    const message = data.message;
    const args = data.args;
    let chartMessage = data.chartMessage;
    let attempt = data.attempt;
    const chartID = data.chartID;

    try {
      let query = '';

      if (data.interaction) {
        query = args.slice(2);
      }
      else {
        if (args.length < 2) {
          message.reply('Insufficient amount of arguments provided. Check `/help` to see how to use the charts command.');
          return;
        }
        query = args.slice(2);
        if (attempt == 1) {
          message.channel.send('Fetching ``' + message.content + '``')
            .then(sendMessage => {
              chartMessage = sendMessage;
            });
        } else {
          chartMessage.edit('```TradingView Widget threw error' + `, re-attempting ${attempt} of 3` + '```' + 'Fetching ``' + message.content + '``');
        }
      }

      // Load markets from a validation exchange to verify pairs and pick a sensible default exchange for the
      // TradingView chart. The chart image itself comes from TradingView, not this exchange's data. Binance is
      // used as the default reference (the global market leader). Its public endpoints are pointed at
      // data-api.binance.vision (see the client setup above) so this keeps working from geo-restricted servers.
      const chartExchangeName = 'binance';
      let chartMarkets = {};
      let chartMarketsAvailable = true;
      try {
        chartMarkets = await clientBinance.loadMarkets();
      } catch {
        chartMarketsAvailable = false;
        console.log(pc.blue(`(ID:${chartID})`) + pc.yellow(` Unable to load ${chartExchangeName} markets. Skipping pair validation; TradingView will resolve the symbol.`));
      }
      let exchangeProvided = false;
      const exchanges = ['binance', 'bitstamp', 'bitbay', 'bitfinex', 'bittrex', 'bybit', 'coinbase', 'ftx', 'gemini', 'hitbtc', 'kraken',
        'kucoin', 'okcoin', 'okex', 'poloniex'];

      console.log(pc.blue(`(ID:${chartID})`) + ' user input');
      console.log(args);

      // Check for missing pair and replace it with usd for any coin found in the CG cache if only a ticker is provided
      for (let i = 0; i < 500; i++) {
        if (cgArrayDictParsed[i] && args.includes(cgArrayDictParsed[i].symbol)) {
          console.log(pc.blue(`(ID:${chartID})`) + ' matched symbol to cache');
          const pos = args.indexOf(cgArrayDictParsed[i].symbol);
          args[pos] = cgArrayDictParsed[i].symbol + 'usd';
          console.log(args);
        }
      }

      // If the user explicitly named an exchange, prefix it so TradingView uses that exchange.
      // (TradingView resolves the symbol; the pixel-diff check below catches invalid pairs.)
      exchanges.forEach(exchange => {
        if (args.includes(exchange) && !args[1].includes(exchange + ':')) {
          args[1] = exchange + ':' + args[1];
          exchangeProvided = true;
        }
      });

      // If no exchange was provided, match the pair on the validation exchange and default to it (for better
      // chart accuracy). ccxt unified symbols are used so this works regardless of the exchange's raw naming
      // (e.g. Kraken's XBT is normalized to BTC), and both USD and USDT quoting are accepted.
      if (!exchangeProvided && chartMarketsAvailable) {
        const wantedPair = args[1].toLowerCase();
        for (const key in chartMarkets) {
          const unifiedPair = chartMarkets[key].symbol.replace('/', '').toLowerCase();
          if (unifiedPair === wantedPair || unifiedPair === wantedPair + 't') {
            args[1] = chartExchangeName + ':' + unifiedPair;
            console.log(pc.blue(`(ID:${chartID})`) + ` matched pair to ${chartExchangeName}`);
            console.log(args);
            exchangeProvided = true;
            break;
          }
        }
      }

      await page.goto(`http://localhost:${devMode ? 8086 : 8080}/${encodeURIComponent(args[1])}?query=${query}`, { timeout: 20000 });

      // Set the view area to be captured by the screenshot (done before validation so the price axis
      // lands where we expect it)
      const viewWidth = query.includes('wide') ? 1275 : 715;
      await page.setViewport({
        width: viewWidth,
        height: 557
      });

      // Reference-free chart validation + adaptive load wait (replaces the old fixed sleep and the
      // pixel-diff comparison against a reference image). A valid TradingView chart always renders a
      // price axis of light-colored labels down the right edge, while the "symbol doesn't exist"
      // failure page leaves that strip pure black. The volume study draws last (its bars span nearly
      // the full width along the bottom of the price pane), so we use it as the "fully loaded" signal.
      // We first wait for network idle (no screenshots, so the shared browser stays free for the other
      // concurrent chart workers), then take a small number of screenshots to confirm the axis and
      // volume. Only the two regions we care about are scanned, keeping each check cheap.
      const analyzeChart = (dataUrl) => page.evaluate(async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // Price-axis strip (right edge), excluding the top header and bottom attribution corner
        const sx0 = Math.floor(width * 0.90);
        const sx1 = width - 2;
        const sy0 = Math.floor(height * 0.10);
        const sy1 = Math.floor(height * 0.90);
        let lightCount = 0;
        const lightRows = new Set();
        for (let y = sy0; y < sy1; y++) {
          for (let x = sx0; x < sx1; x++) {
            const i = (y * width + x) * 4;
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (lum > 50) { lightCount++; lightRows.add(y); }
          }
        }
        // Volume band (just above the time axis, where the bottom-anchored volume bars sit, between the
        // side logos). Tuned so an empty band reads near zero and a loaded one reads ~0.7+.
        const vx0 = Math.floor(width * 0.12);
        const vx1 = Math.floor(width * 0.88);
        const vy0 = Math.floor(height * 0.90);
        const vy1 = Math.floor(height * 0.94);
        const volCols = new Uint8Array(width);
        for (let y = vy0; y < vy1; y++) {
          for (let x = vx0; x < vx1; x++) {
            const i = (y * width + x) * 4;
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (lum > 35) volCols[x] = 1;
          }
        }
        let coveredCols = 0;
        for (let x = vx0; x < vx1; x++) if (volCols[x]) coveredCols++;
        const volumeCoverage = (vx1 - vx0) > 0 ? coveredCols / (vx1 - vx0) : 0;
        return { lightCount, lightRows: lightRows.size, volumeCoverage };
      }, dataUrl);

      // Wait for the page's assets and initial data to finish loading without burning screenshots.
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 8000 }).catch(() => { });

      // Then confirm the chart with a few cheap screenshots: capture as soon as the volume bars appear
      // (normal charts, within a poll or two), give volume a short grace window before proceeding
      // without it (symbols that have no volume data), or time out with no price axis (failed chart).
      let rendered = false; // have we ever seen a valid price axis (i.e. a real chart)?
      let axisSince = null; // when the price axis first appeared
      const renderDeadline = Date.now() + 4000; // hard cap on the post-idle confirmation wait
      while (Date.now() < renderDeadline) {
        const shot = await page.screenshot({ encoding: 'base64' });
        const stats = await analyzeChart('data:image/png;base64,' + shot);
        const axisOk = stats.lightRows >= 6 && stats.lightCount >= 40;
        if (axisOk) {
          rendered = true;
          if (axisSince === null) axisSince = Date.now();
        }
        const volumeOk = stats.volumeCoverage > 0.5; // volume bars span most of the width once loaded
        if (axisOk && volumeOk) break; // normal chart, volume loaded
        if (axisOk && (Date.now() - axisSince) >= 1500) break; // no-volume chart, gave volume time to appear
        await sleep(250);
      }

      if (!rendered) {
        // Chart never produced a price axis, treat as an invalid pair / failed chart
        console.log(pc.blue(`(ID:${chartID})`) + ` chart validation test ${pc.red('<FAILED>')}`);
        if (data.interaction) {
          data.interaction.editReply('Error: Chart failed to generate with your provided pair. Please try again.');
        }
        else {
          message.reply('Unable to generate chart with your provided pair. Check your pair or try another exchange!')
            .then(() => {
              chartMessage.delete(); // Remove the placeholder
            });
        }
      }
      else {
        console.log(pc.blue(`(ID:${chartID})`) + ` chart validation test ${pc.greenBright('passed!')}`);

        // Apply optional log scale toggle now that the chart has rendered
        if (query.includes('log')) {
          await page.keyboard.down('Alt');
          await page.keyboard.press('KeyL');
          await page.keyboard.up('Alt');
        }

        // Clicking to remove focus dots on price line and the crosshair from cursor
        await page.click('#tsukilogo');

        // Capture the final chart from the browser window.
        // Uploaded straight from the buffer: writing every chart to disk left files that nothing ever
        // deleted, and a synchronous multi-hundred-KB write blocked the event loop on each render.
        const chartScreenshot = await page.screenshot();

        const end = performance.now();
        console.log(pc.blue(`(ID:${chartID})`) + ' Execution time: ' + pc.green(`${((end - start) / 1000).toFixed(3)} seconds`));

        if (data.interaction) {
          await data.interaction.editReply({
            files: [{
              attachment: chartScreenshot,
              name: 'tsukibotchart.png'
            }],
            components: buildChartControls(data.originalQuery, data.activeInterval)
          });
        }
        else {
          message.channel.send({
            files: [{
              attachment: chartScreenshot,
              name: 'tsukibotchart.png'
            }]
          }).then(() => {
            chartMessage.delete(); // Remove the placeholder
          });
        }
      }
      // Free up resources, then close the page
      await page.goto('about:blank');
      await page.close();
    } catch (err) {
      console.log(pc.blue(`(ID:${chartID}) `) + err);
      if (attempt < 3) {
        attempt++;
        let data2 = {
          'message': message,
          'interaction': data.interaction,
          'args': args,
          'originalQuery': data.originalQuery,
          'activeInterval': data.activeInterval,
          'chartMessage': chartMessage,
          'attempt': attempt,
          'chartID': chartID
        };
        cluster.queue(data2);
      }
      else {
        // Every retry is spent. Both callers need telling; the slash-command path used to be left
        // hanging on a deferred reply that nothing would ever edit.
        if (data.interaction) {
          await data.interaction.editReply('Sorry, chart generation failed after 3 attempts. TradingView may be unreachable right now, please try again shortly.')
            .catch(() => { /* interaction expired */ });
        }
        else {
          chartMessage.edit('```TradingView handler threw error' + ', all re-attempts exhausted :(' + '```');
        }
      }
    }
  });
}

// Collect and save Coin360 heatmap to cache
async function getCoin360Heatmap() {

  let fail = false;
  const grabHmap = async ({ page, data: url }) => {
    // Open the page and wait for it to load up
    await page.goto(url).catch(() => {
      console.log(pc.red('Navigation failure while getting heatmap image. Will try again on next cycle.'));
      fail = true;
    });
    if (fail) {
      return;
    }

    // Set the view area to be captured by the screenshot
    await page.setViewport({
      width: 2900,
      height: 2010
    });

    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }).catch(() => {
      // Coin360 keeps websocket activity open; continue if network idle times out.
    });

    // Wait for a large visible rendering surface (canvas/svg) instead of brittle hashed classes.
    await page.waitForFunction(() => {
      const surfaces = document.querySelectorAll('canvas, svg');
      for (const surface of surfaces) {
        const rect = surface.getBoundingClientRect();
        if (rect.width > 1000 && rect.height > 600) {
          return true;
        }
      }
      return false;
    }, { timeout: 15000 });

    // Try to dismiss optional overlays/popups if present, but never fail the fetch over this.
    const popupCloseSelectors = [
      '.pr6pBR',
      'button[aria-label="Close"]',
      'button[title="Close"]',
      '[class*="close"][role="button"]'
    ];
    for (const selector of popupCloseSelectors) {
      const closeBtn = await page.$(selector);
      if (closeBtn) {
        await closeBtn.click().catch(() => { });
        break;
      }
    }

    await sleep(2000);

    // Remove these selectors from the image (top banner)
    const itemsToRemove = ['.d26ypj'];
    for (let i = 0; i < itemsToRemove.length; i++) {
      await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        for (let i = 0; i < elements.length; i++) {
          elements[i].parentNode.removeChild(elements[i]);
        }
      }, itemsToRemove[i]);
    }

    // Hide the onetrust button (id uc-privacy-button) and the popup
    await page.evaluate(() => {
      const elements = document.querySelectorAll('#uc-privacy-button');
      const moreElements = document.querySelectorAll('#usercentrics-cmp-ui');
      const allElements = [...elements, ...moreElements];
      for (let i = 0; i < allElements.length; i++) {
        allElements[i].style.display = 'none';
      }
    });

    // Take screenshot and save it
    await page.screenshot({ path: 'chartscreens/generated-charts/hmap.png' });
    // Free up resources, then close the page
    await page.goto('about:blank');
    await page.close();
    console.log(pc.green('Coin360 heatmap image saved to cache!'));
  };

  // Same guard as the chart command: the cluster is null when Chromium failed to launch, and this
  // runs on a 30 minute timer, so without it every cycle throws "cluster.queue is not a function".
  if (!cluster) {
    console.log(pc.yellow('Skipping heatmap capture: the puppeteer cluster is unavailable.'));
    return;
  }

  await cluster.queue('https://coin360.com/widget/map?utm_source=embed_map', grabHmap);
}

// Convert USD price to ETH value
function convertToETHPrice(priceUSD) {
  let ETHPrice;
  for (let i = 0; i < cgArrayDictParsed.length; i++) {
    if (cgArrayDictParsed[i].id == 'ethereum') {
      ETHPrice = cgArrayDictParsed[i].current_price;
      break;
    }
  }
  return priceUSD / ETHPrice;
}

// Abbreviate very large numbers

// Run through new server procedure when the bot joins
function joinProcedure(/*guild*/) {
  // bail out, not using this
  return;
  // let failGC = false;
  // if (guild) {
  //   console.log(chalk.yellowBright('NEW SERVER ADDED TO THE FAMILY!! Welcome: ' + chalk.cyan(guild.name) + ' with ' + chalk.cyan(guild.memberCount) + ' users!'));
  //   if (guild.systemChannel) {
  //     guild.systemChannel.send('Hello there, thanks for adding me! Get a list of commands and their usage with `.tb help`.\n' +
  //       'If you ever need help or have suggestions, please don\'t hesitate to join the support server and chat with us! ' +
  //       ' Use `.tb stat` for the link.').catch(function () {
  //         console.log(chalk.red('Failed to send introduction message, missing message send permissions'));
  //         failGC = true;
  //       });
  //   }
  //   else {
  //     console.log(chalk.red(chalk.cyan(guild.name) + ' does not have a valid system channel.' + chalk.yellow(' No intro will be sent!')));
  //     failGC = true;
  //   }
  // }
  // // Report join status
  // if (!failGC) {
  //   console.log(chalk.green('Full introduction and join procedure executed successfully!!!'));
  // }
  // else {
  //   console.log(chalk.green('Successfully sent introduction message!'));
  // }
}

// Function to add commas to long numbers

// Function to trim decimal place digits when number is bigger than 10 (for cleaner appearance)

// Convert a passed-in USD value to BTC value and return it
function convertToBTCPrice(priceUSD) {
  const BTCPrice = cgArrayDict.BTC.current_price;
  return priceUSD / BTCPrice;
}

// I do a lot of CMC calls and I'm trying to keep the bot free to use, 
// so I alternate between keys to keep using free credits and still update frequently.
function updateCmcKey(override) {

  //Get the time
  const d = new Date();
  const hour = d.getUTCHours();

  if (override) {
    selectedKey = override;
  }

  if (auto) {
    //Key assignment by time
    switch (hour) {
      case 0: case 1: selectedKey = 1; break;
      case 2: case 3: selectedKey = 2; break;
      case 4: case 5: selectedKey = 3; break;
      case 6: case 7: selectedKey = 4; break;
      case 8: case 9: selectedKey = 5; break;
      case 10: case 11: selectedKey = 6; break;
      case 12: case 13: selectedKey = 7; break;
      case 14: case 15: selectedKey = 8; break;
      case 16: case 17: selectedKey = 9; break;
      case 18: case 19: selectedKey = 10; break;
      case 20: case 21: selectedKey = 11; break;
      case 22: case 23: selectedKey = 12;
    }
  }
  // There is no client object to rebuild any more: cmcGetTickers reads selectedKey when it runs,
  // so setting it here is the whole job.
  return selectedKey;
}

// Resolves which CMC key the current rotation slot points at. selectedKey is normally 1-12 (set by
// the hourly rotation above); a longer value is treated as a literal key name, which is how the
// override parameter was always meant to select a named failover key.
function getCurrentCmcKey() {
  if (selectedKey.toString().length <= 2) {
    return keys['coinmarketcap' + selectedKey] || keys.coinmarketcapfailover;
  }
  return keys[selectedKey] || keys.coinmarketcapfailover;
}


/* ---------------------------------

  getCMCData()

  Update the cmc data array every
  8 minutes (Endpoint update rate)

 ---------------------------------- */

async function getCMCData() {

  //WARNING! This will pull ALL cmc coins and cost you up to 22 credits (limit/200) on your api account for each call. This is why I alternate keys!
  const limit = devMode ? 100 : 4400;

  const cmcJSON = await cmcGetTickers(limit).catch(err => {
    console.error(pc.red('CMC request failed: ' + (err && err.message ? err.message : err)));
    return null;
  });

  // Validate before touching the live cache. Building into a temp dict and swapping on success means
  // a failed refresh keeps serving the last good snapshot instead of emptying the cache and taking
  // /cmc and /cc down with it until the next successful poll.
  if (!cmcJSON || !Array.isArray(cmcJSON.data) || cmcJSON.data.length === 0) {
    fails++;
    console.error(pc.red(pc.bold('ERROR UPDATING CMC CACHE! This is attempt number: ' + pc.cyan(fails) + ' : API response below:')));
    console.log(cmcJSON);
    return;
  }

  const nextCmcArrayDict = {};
  for (const ticker of cmcJSON.data) {
    if (ticker && ticker.symbol && !nextCmcArrayDict[ticker.symbol]) {
      nextCmcArrayDict[ticker.symbol] = ticker;
    }
  }

  cmcArrayDict = nextCmcArrayDict;
  fails = 0;
}


/* ---------------------------------

  getCGData()

  Update the CoinGecko data array
  every 20 minutes (as per cron job at top of file)

  Caching process takes around 10-15 minutes
  and could end up taking longer depending on API
  limited and current availability

 ---------------------------------- */

/* --------------------------------------------

  Shared config for the standard CoinGecko v3 REST API.

  A pro or demo key raises the rate limit and makes it per-key rather than
  per-IP, which is what keeps the full market pass from taking half an hour.
  Note this is deliberately NOT the same as getApiConfig() in coingecko-onchain.js:
  that one falls back to GeckoTerminal, which does not serve these endpoints.

  -------------------------------------------- */

function getCGRestConfig() {
  const proApiKey = process.env.COINGECKO_PRO_API_KEY || keys.coingeckoPro;
  if (proApiKey) {
    return { baseUrl: 'https://pro-api.coingecko.com/api/v3', headers: { 'x-cg-pro-api-key': proApiKey } };
  }
  const demoApiKey = process.env.COINGECKO_API_KEY || keys.coingecko || keys.coingeckoDemo;
  if (demoApiKey) {
    return { baseUrl: 'https://api.coingecko.com/api/v3', headers: { 'x-cg-demo-api-key': demoApiKey } };
  }
  return { baseUrl: 'https://api.coingecko.com/api/v3', headers: {} };
}

function cgHasApiKey() {
  return Object.keys(getCGRestConfig().headers).length > 0;
}

// Minimum spacing between paged CoinGecko calls, based on which tier we're on.
function cgSleepFloor() {
  return cgHasApiKey() ? 2500 : 25000;
}

// CoinGecko rejects requests without a descriptive User-Agent (HTTP 403, "Please add a descriptive
// User-Agent to your request"). This is exactly what broke every call made through the old
// coingecko-api package, which sent none. Set it explicitly rather than relying on a runtime default.
const CG_USER_AGENT = 'TsukiBot/1.0 (+https://github.com/EthyMoney/TsukiBot)';

// fetch() wrapper that applies the CoinGecko base URL, auth headers and User-Agent.
/**
 * The single choke point for every CoinGecko request, which is what makes credit accounting
 * possible: one call here is one credit, so recording each one gives an exact spend rather than an
 * estimate. A demo key allows only 10,000 a month, and the endpoint breakdown is the difference
 * between guessing at where they went and knowing.
 *
 * Recording is fire-and-forget through the telemetry buffer, so it adds no latency to the request.
 *
 * @param {string} path endpoint path beginning with /
 * @param {object} [init] fetch options
 * @returns {Promise<Response>}
 */
async function cgFetch(path, init = {}) {
  const apiConfig = getCGRestConfig();
  const startedAt = Date.now();
  // Group by endpoint, not full URL: the query string carries coin ids and page numbers, which
  // would make every request its own unique row and the report useless.
  const endpoint = path.split('?')[0];

  try {
    const res = await fetch(apiConfig.baseUrl + path, {
      ...init,
      headers: {
        accept: 'application/json',
        'user-agent': CG_USER_AGENT,
        ...apiConfig.headers,
        ...(init.headers || {})
      }
    });

    telemetry.recordSystemEvent('coingecko-call', {
      subcommand: endpoint,
      params: { endpoint, status: res.status, keyed: cgHasApiKey() },
      // 429 still consumes the request even though it returns nothing useful, and separating it is
      // how a rate limit becomes visible in the report instead of looking like ordinary traffic.
      outcome: res.ok ? 'ok' : (res.status === 429 ? 'ratelimited' : 'error'),
      errorKind: res.ok ? null : 'HTTP ' + res.status,
      durationMs: Date.now() - startedAt
    });

    return res;
  }
  catch (err) {
    telemetry.recordSystemEvent('coingecko-call', {
      subcommand: endpoint,
      params: { endpoint, status: 0, keyed: cgHasApiKey() },
      outcome: 'error',
      error: err,
      durationMs: Date.now() - startedAt
    });
    throw err;
  }
}

/*
  Direct replacements for the coingecko-api npm package.

  That package is from 2019 and predates CoinGecko's API keys entirely, so every call made through
  it was sent unauthenticated no matter what key was configured — meaning /cg and /convert stayed on
  the public per-IP rate limit while the cache refresh enjoyed the demo tier.

  Note these return the API response directly. The old package wrapped everything in an extra
  { success, message, code, data } envelope, which is why the call sites used to read `data.data`.
*/

async function cgSimplePrice(ids, vsCurrencies) {
  const params = new URLSearchParams({
    ids: ids.join(','),
    vs_currencies: vsCurrencies.join(','),
    include_24hr_vol: 'true',
    include_24hr_change: 'true'
  });
  const res = await cgFetch('/simple/price?' + params.toString());
  if (!res.ok) {
    throw new Error(`CoinGecko /simple/price returned HTTP ${res.status}`);
  }
  return res.json();
}

async function cgGlobal() {
  // Global market stats move slowly and this used to be fetched per /mc invocation, so a busy
  // server could spend more credits here than on the entire market cache.
  if (cgGlobalCache.data && Date.now() - cgGlobalCache.at < CG_GLOBAL_CACHE_MS) {
    return cgGlobalCache.data;
  }
  const res = await cgFetch('/global');
  if (!res.ok) {
    throw new Error(`CoinGecko /global returned HTTP ${res.status}`);
  }
  const data = await res.json();
  cgGlobalCache = { at: Date.now(), data };
  return data;
}

/*
  Direct replacements for the cryptocompare and coinmarketcap-api npm packages.

  Both were thin single-endpoint wrappers around one GET each, and both are long unmaintained.
  Calling the endpoints ourselves removes two dependencies, puts error handling under our control,
  and lets us send the API key in a header rather than the query string.
*/

// CryptoCompare full price data. Returns the RAW block, which is what the old package handed back
// and what getPriceCC indexes into as prices[SYMBOL][CURRENCY].PRICE.
async function ccPriceFull(fromSymbols, toSymbols) {
  const params = new URLSearchParams({
    fsyms: fromSymbols.join(','),
    tsyms: toSymbols.join(',')
  });

  // Key goes in a header rather than the query string the old package used, so it stays out of
  // URLs, logs and error messages.
  const headers = { accept: 'application/json' };
  if (keys.cryptocompare) {
    headers.authorization = 'Apikey ' + keys.cryptocompare;
  }

  const res = await fetch('https://min-api.cryptocompare.com/data/pricemultifull?' + params.toString(), { headers });
  if (!res.ok) {
    throw new Error(`CryptoCompare pricemultifull returned HTTP ${res.status}`);
  }

  const body = await res.json();
  // CryptoCompare signals errors in the body with a 200 status, so this has to be checked.
  if (body.Response === 'Error') {
    throw new Error('CryptoCompare error: ' + body.Message);
  }
  return body.RAW;
}

// CoinMarketCap latest listings. Returns the parsed response, so callers read .data as before.
async function cmcGetTickers(limit) {
  const apiKey = getCurrentCmcKey();
  const params = new URLSearchParams({ limit: String(limit) });

  const res = await fetch('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?' + params.toString(), {
    headers: { accept: 'application/json', 'X-CMC_PRO_API_KEY': apiKey }
  });

  // CMC returns its error detail in the body, which is more useful than the bare status.
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body && body.status && body.status.error_message ? body.status.error_message : res.statusText;
    throw new Error(`CoinMarketCap listings returned HTTP ${res.status}: ${detail}`);
  }
  return body;
}

// Load CG cache from file if it exists (for instant startup)
function loadCGCacheFromFile() {
  try {
    if (fs.existsSync('./common/cgCache.json')) {
      const cacheData = JSON.parse(fs.readFileSync('./common/cgCache.json', 'utf8'));
      if (cacheData && cacheData.data && Array.isArray(cacheData.data) && cacheData.data.length > 0) {
        cgArrayDictParsed = [...cacheData.data];
        // Rebuild the dictionary
        cgArrayDict = {};
        for (const coinObject of cacheData.data) {
          const upperCaseSymbol = coinObject.symbol.toUpperCase();
          if (!cgArrayDict[upperCaseSymbol]) {
            cgArrayDict[upperCaseSymbol] = coinObject;
          }
        }
        console.log(pc.greenBright('Loaded CoinGecko cache from file (' + cacheData.data.length + ' coins). Commands are available immediately!'));
        console.log(pc.cyan('Cache last updated: ' + new Date(cacheData.timestamp).toLocaleString()));
        return true;
      }
    }
  } catch (err) {
    console.log(pc.yellow('Could not load CG cache from file: ' + err.message));
  }
  return false;
}

// Save CG cache to file for next startup.
// Written to a temp file and renamed, because rename is atomic on the same volume: a crash
// mid-write can then never leave a truncated cgCache.json that fails to parse on next boot.
async function saveCGCacheToFile() {
  const finalPath = './common/cgCache.json';
  const tempPath = finalPath + '.tmp';
  try {
    const cacheData = {
      timestamp: Date.now(),
      data: cgArrayDictParsed
    };
    await fs.promises.writeFile(tempPath, JSON.stringify(cacheData));
    await fs.promises.rename(tempPath, finalPath);
    console.log(pc.greenBright('CoinGecko cache saved to file for next startup.'));
  } catch (err) {
    console.log(pc.red('Error saving CG cache to file: ' + err.message));
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // no temp file to clean up, nothing to do
    }
  }
}

async function getCGData(status) {

  // if in dev mode, pre-fill the cache with a few coins and fake prices
  if (devMode) {
    cgArrayDictParsed.push({
      'id': 'bitcoin',
      'symbol': 'btc',
      'name': 'Bitcoin',
      'image': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png?1547033579',
      'current_price': 10000,
      'market_cap': 100000000,
      'market_cap_rank': 1,
      'total_volume': 100000000,
      'high_24h': 10000,
      'low_24h': 10000,
      'price_change_24h': 0,
      'price_change_percentage_24h': 0,
      'market_cap_change_24h': 0,
      'market_cap_change_percentage_24h': 0,
      'circulating_supply': 10000000,
      'total_supply': 10000000,
      'ath': 10000,
      'ath_change_percentage': 0,
      'ath_date': '2021-01-01T00:00:00.000Z',
      'roi': null,
      'last_updated': '2021-01-01T00:00:00.000Z'
    });
    cgArrayDictParsed.push({
      'id': 'ethereum',
      'symbol': 'eth',
      'name': 'Ethereum',
      'image': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png?1595348880',
      'current_price': 1000,
      'market_cap': 100000000,
      'market_cap_rank': 2,
      'total_volume': 100000000,
      'high_24h': 1000,
      'low_24h': 1000,
      'price_change_24h': 0,
      'price_change_percentage_24h': 0,
      'market_cap_change_24h': 0,
      'market_cap_change_percentage_24h': 0,
      'circulating_supply': 10000000,
      'total_supply': 10000000,
      'ath': 1000,
      'ath_change_percentage': 0,
      'ath_date': '2021-01-01T00:00:00.000Z',
      'roi': null,
      'last_updated': '2021-01-01T00:00:00.000Z'
    });
    cgArrayDict['BTC'] = cgArrayDictParsed[0];
    cgArrayDict['ETH'] = cgArrayDictParsed[1];
    console.log(pc.green('Dev mode enabled, pre-filled cache with 2 coins!'));
    //return;
  }

  // Only one pass may be in flight at a time. A full keyless pass can run longer than the 30 minute
  // cron interval, so without this the next tick would start a second concurrent crawl against the
  // same rate-limit budget. This is deliberately separate from cacheUpdateRunning (the startup gate
  // that makes commands reply "still starting up"): conflating the two is what used to wedge the bot
  // permanently when a pass failed.
  if (cgUpdateInProgress) {
    console.log(pc.yellow('CoinGecko cache update already in progress, skipping this run.'));
    return;
  }
  cgUpdateInProgress = true;
  try {
    await runCGDataPass(status);
  }
  catch (err) {
    console.error(pc.red('CoinGecko cache update failed: ' + (err && err.message ? err.message : err)));
    scheduleCGRetry();
  }
  finally {
    cgUpdateInProgress = false;
  }
}

// Retry a failed pass on its own timer rather than waiting out the full cron interval. Without this,
// a first-run failure would leave every CG-backed command gated until the next scheduled tick.
function scheduleCGRetry() {
  if (cgRetryScheduled || devMode) return;
  cgRetryScheduled = true;
  const retryDelay = 60000;
  console.log(pc.yellow(`Retrying CoinGecko cache update in ${retryDelay / 1000}s.`));
  setTimeout(() => {
    cgRetryScheduled = false;
    getCGData(cacheUpdateRunning ? 'firstrun' : 'background').catch(err => {
      console.error(pc.red('CoinGecko retry failed: ' + err.message));
    });
  }, retryDelay).unref();
}

async function runCGDataPass(status) {

  if (status == 'firstrun' || cgArrayDictParsed.length == 0) {
    console.log(pc.yellowBright('Initializing CoinGecko data cache...\n' +
      pc.cyan(' ▶ This could take up to several minutes, hang in there. CoinGecko commands will be unavailable until this is complete.')));
  }
  else if (status == 'background') {
    console.log(pc.cyan('Updating CoinGecko cache in background...'));
  }

  let page = 1;
  let lastResSize = 0;
  let coinDataJsonArr = [];
  let progressPercentage = 0;
  const startTime = Date.now();

  const isFirstRun = (status == 'firstrun' || cgArrayDictParsed.length == 0);

  // Progress is measured against the page cap. This used to call /coins/list purely to compute a
  // percentage, which cost a credit on every pass for a cosmetic number.

  // query for sets of 250 until we got them all
  do {
    // Retry the current page rather than discarding every page fetched so far. Aborting the whole
    // pass on one bad response is what used to make the cache silently go stale for hours.
    let data = null;
    for (let attempt = 1; attempt <= CG_PAGE_ATTEMPTS && data == null; attempt++) {
      let res;
      try {
        res = await cgFetch(`/coins/markets?vs_currency=usd&per_page=250&page=${page}&order=market_cap_desc&price_change_percentage=1h,24h,7d,14d,30d,1y`);
      }
      catch (err) {
        console.log(pc.red(`CG network error on page ${page} (attempt ${attempt}/${CG_PAGE_ATTEMPTS}): ${err.message}`));
        await sleep(globalCGSleepTimeout);
        continue;
      }

      if (res.ok) {
        data = await res.json();
        break;
      }

      console.log(pc.red('CG update error at page: ' + page + ', status: ') + res.status + pc.red(` (attempt ${attempt}/${CG_PAGE_ATTEMPTS})`));
      if (res.status == 429) {
        // Honor Retry-After when the API sends it, and ratchet the between-page sleep up a little so
        // the rest of this pass is gentler. The ratchet is capped and decays again after a clean pass.
        const retryAfterSeconds = Number(res.headers.get('retry-after'));
        const backoff = (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0)
          ? retryAfterSeconds * 1000
          : globalCGSleepTimeout;
        globalCGSleepTimeout = Math.min(globalCGSleepTimeout + 1000, CG_SLEEP_CAP);
        console.log(pc.yellow(`Rate limited. Waiting ${Math.round(backoff / 1000)}s then retrying page ${page}. Page spacing is now ${globalCGSleepTimeout}ms.`));
        await sleep(backoff);
        continue;
      }
      await sleep(globalCGSleepTimeout);
    }

    if (data == null) {
      throw new Error(`CoinGecko did not return page ${page} after ${CG_PAGE_ATTEMPTS} attempts.`);
    }

    for (const coin of data) {
      coinDataJsonArr.push(coin);
    }
    page++;
    lastResSize = data.length;

    // progress report for first run (only show if no cache was loaded)
    if (isFirstRun) {
      progressPercentage = Math.min(100, Math.round(((page - 1) / CG_MAX_PAGES) * 100));
      console.log(pc.blueBright(` ▶ ${progressPercentage}%`));
      startupProgress = Math.round(progressPercentage); // update global
    }

    if (progressPercentage < 100 && page <= CG_MAX_PAGES) {
      await sleep(globalCGSleepTimeout); //wait to make next query (CoinGecko is touchy with rate limits)
    }
    // Stop at the page cap rather than walking all ~16,000 listed coins. A full sweep was 65 pages
    // every 30 minutes, which is roughly ten times a demo key's entire monthly allowance. Coins
    // past the cap are still reachable: resolveCoinLive fetches one on demand for a single credit.
  } while (lastResSize == 250 && page <= CG_MAX_PAGES);

  // A clean pass earns back some of the ratchet, so one rate-limited day doesn't slow the bot forever.
  globalCGSleepTimeout = Math.max(cgSleepFloor(), globalCGSleepTimeout - 1000);


  // sort by MC rank ascending order with nulls placed at the end
  let marketDataFiltered = coinDataJsonArr.sort(function (a, b) {
    return (b.market_cap_rank != null) - (a.market_cap_rank != null) || a.market_cap_rank - b.market_cap_rank;
  });

  // update global
  cgArrayDictParsed = [...marketDataFiltered];

  // Build the symbol-keyed cache from scratch and swap it in, rather than upserting into the old
  // object. Upserting never dropped de-listed coins, so the dictionary only ever grew.
  const nextCgArrayDict = {};
  for (const coinObject of marketDataFiltered) {
    const upperCaseSymbol = coinObject.symbol.toUpperCase();
    // first one wins, which keeps the highest market cap rank for duplicated tickers
    if (!nextCgArrayDict[upperCaseSymbol]) {
      nextCgArrayDict[upperCaseSymbol] = coinObject;
    }
  }
  cgArrayDict = nextCgArrayDict;

  if (cacheUpdateRunning) {
    console.log(pc.greenBright(' ▶ 100%\n' + 'CoinGecko data cache initialization complete. Commands are now active.'));
    cacheUpdateRunning = false;
    startupProgress = null;
  }

  const runTime = Date.now() - startTime;
  let milliseconds = parseInt((runTime % 1000));
  let seconds = parseInt((runTime / 1000) % 60);
  let minutes = parseInt((runTime / (1000 * 60)) % 60);
  let hours = parseInt((runTime / (1000 * 60 * 60)) % 24);
  hours = (hours < 10) ? '0' + hours : hours;
  minutes = (minutes < 10) ? '0' + minutes : minutes;
  seconds = (seconds < 10) ? '0' + seconds : seconds;

  console.log('Update completed in', hours + ':' + minutes + ':' + seconds + '.' + milliseconds);

  // Save the cache to file for next startup
  await saveCGCacheToFile();
}


// This function queries and updates the local cache of fiat exchange rates (for the convert command)
async function updateExchangeRates() {
  const res = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${keys['openexchangerates.org']}&base=USD`);
  if (res.ok) {
    const apiRes = await res.json();
    forexRates = apiRes.rates;
    if (Object.keys(forexRates).length > 0) {
      console.log(pc.green(Object.keys(forexRates).length + ' fiat exchange rates updated!'));
    }
  }
  else {
    console.log(pc.red('Issue fetching exchange rates: ' + res.status));
    return;
  }
}


/* ---------------------------------

  updateCoins()

  Update known existing CMC/CG coins

 ---------------------------------- */

async function updateCoins() {
  // Awaited: the refresh is async, so reading the file first meant pairs_CG_arr was always reloaded
  // with the *previous* run's contents and newly listed coins stayed unknown for an extra cycle.
  // Pass the key config through so this call gets the same rate limit as the rest of the refresh.
  const updated = await reloaderCG.update(getCGRestConfig());
  if (!updated) {
    console.log(pc.yellow('Coin list refresh failed, keeping the previously known coins.'));
    return;
  }
  // Re-read the new set of coins
  pairs_CG_arr = JSON.parse(await fs.promises.readFile('./common/coinsCGtickers.json', 'utf8'));
  try {
    cgCoinList = JSON.parse(await fs.promises.readFile('./common/coinsCG.json', 'utf8'));
  } catch (err) {
    console.log(pc.yellow('Could not reload the full coin list: ' + err.message));
  }
  console.log(pc.green(pc.bold('Reloaded known coins')));
}


/* ---------------------------------

  initializeFiles()

  Reads and checks all files needed for operation

 ---------------------------------- */

function initializeFiles() {

  // Output directory for the cached heatmap image. It is gitignored, so a fresh clone does not
  // have it and every heatmap capture failed with ENOENT until someone created it by hand.
  fs.mkdirSync('./chartscreens/generated-charts', { recursive: true });

  //allowed coin pairs data from coin gecko (ticker symbols only, as array)
  try {
    pairs_CG_arr = JSON.parse(fs.readFileSync('./common/coinsCGtickers.json', 'utf8'));
  } catch {
    fs.appendFileSync('./common/coinsCGtickers.json', '[]');
    console.log(pc.green('Automatically created new coinsCGtickers.json file.'));
    pairs_CG_arr = JSON.parse(fs.readFileSync('./common/coinsCGtickers.json', 'utf8'));
  }

  // Full coin list, for resolving anything the market cache does not pre-load.
  try {
    cgCoinList = JSON.parse(fs.readFileSync('./common/coinsCG.json', 'utf8'));
  } catch {
    cgCoinList = [];
    console.log(pc.yellow('coinsCG.json missing, so coins outside the market cache cannot be resolved until the next coin list refresh.'));
  }

  //server tags
  if (fs.existsSync('tags.json')) {
    try {
      tagsJSON = JSON.parse(fs.readFileSync('tags.json', 'utf8'));
    } catch {
      console.log(pc.red('Error reading tags.json during initialization. Check the file for problems!'));
    }
  }
  else {
    fs.appendFileSync('tags.json', '{"tags":[]}');
    console.log(pc.green('Automatically created new tags.json file.'));
    tagsJSON = JSON.parse(fs.readFileSync('tags.json', 'utf8'));
  }

  //coin metadata
  if (fs.existsSync('./common/metadata.json')) {
    try {
      metadata = JSON.parse(fs.readFileSync('./common/metadata.json', 'utf8'));
    } catch {
      console.log(pc.red('Error reading metadata.json during initialization. Check the file for problems or regenerate it using getCoinMeta.js'));
    }
  }
  else {
    fs.appendFileSync('./common/metadata.json', '{}');
    console.log(pc.green('Automatically created new metadata.json file.'));
    metadata = JSON.parse(fs.readFileSync('./common/metadata.json', 'utf8'));
  }

  //api keys
  if (fs.existsSync('./common/keys.api')) {
    try {
      keys = JSON.parse(fs.readFileSync('./common/keys.api', 'utf8'));
    } catch {
      console.log(pc.red('Error reading keys.api during initialization. Check the file for problems and verify its structure.'));
      console.log(pc.blue('See step 3 in the first run steps at the top of main.js for how to setup this file with the needed keys'));
      process.exit(1);
    }
  }
  else {
    fs.appendFileSync('./common/keys.api', '{}');
    console.log(pc.yellowBright('Automatically created new keys.api file. YOU NEED TO POPULATE IT WITH YOUR API KEYS!!'));
    console.log(pc.blue('See step 3 in the first run steps at the top of main.js for how to setup this file with the needed keys'));
    process.exit(1);
  }

  applyEnvironmentOverrides();
  validateRequiredKeys();
}

/* ---------------------------------

  Configuration overrides and validation.

  Environment variables win over keys.api, which is what makes the bot deployable in Docker or CI
  without baking a secrets file into an image. Validation happens once at startup so a missing key
  is a clear fatal message rather than a confusing failure deep inside a command hours later.

 ---------------------------------- */

// Note: these tables live inside their functions rather than at module scope because
// initializeFiles() is called near the top of this file, long before a module-level `const`
// down here would be initialized.

function applyEnvironmentOverrides() {
  const envKeyOverrides = {
    TSUKIBOT_TOKEN: 'token',
    TSUKIBOT_DEV_TOKEN: 'devToken',
    TSUKIBOT_DB_PASSWORD: 'tsukibot',
    TSUKIBOT_DB_ADDRESS: 'dbAddress',
    ETHERSCAN_API_KEY: 'etherscan',
    INFURA_API_KEY: 'infura',
    FINNHUB_API_KEY: 'finnhub',
    CRYPTOCOMPARE_API_KEY: 'cryptocompare',
    COINALYZE_API_KEY: 'coinalyze',
    OPENEXCHANGERATES_APP_ID: 'openexchangerates.org',
    COINGECKO_API_KEY: 'coingecko',
    COINGECKO_PRO_API_KEY: 'coingeckoPro',
    GOOGLE_CLOUD_PROJECT_ID: 'googleCloudProjectID',
    GOOGLE_CLOUD_KEY_PATH: 'googleCloudProjectKeyPath'
  };

  for (const [envName, keyName] of Object.entries(envKeyOverrides)) {
    if (process.env[envName]) {
      keys[keyName] = process.env[envName];
    }
  }
}

function validateRequiredKeys() {
  // Only keys without which the bot cannot start at all. Feature-specific keys (translate,
  // coinalyze, top.gg) are deliberately not required: those commands degrade gracefully.
  const requiredKeys = ['token', 'tsukibot', 'dbAddress'];
  const missing = requiredKeys.filter(keyName => !keys[keyName]);
  if (devMode && !keys.devToken) {
    missing.push('devToken (required because the bot was started with -d)');
  }
  if (missing.length > 0) {
    console.log(pc.red(pc.bold('FATAL: required configuration is missing: ' + missing.join(', '))));
    console.log(pc.blue('Set these in common/keys.api, or supply them as environment variables (see ENV_KEY_OVERRIDES in main.js).'));
    process.exit(1);
  }
}

/* ---------------------------------

  chartServer()

  Starts a server to show TradingView chart widgets
  at http://localhost:${port}

    e.g. http://localhost:8080/ethbtc?query=sma,ema,macd,log,wide

    ---------------------------------- */

/* --------------------------------------------

    Portfolio chart rendering.

    The page is served from the same loopback-only express server the TradingView charts use, and
    screenshotted by the same puppeteer cluster. Payloads are held in memory and referenced by a
    random id rather than passed through the URL: portfolio data is both too large for a query
    string and not something to put in a URL at all.

  -------------------------------------------- */

const portfolioChartPayloads = new Map();
const PORTFOLIO_CHART_TTL_MS = 60000;

function stashPortfolioChart(payload) {
  const id = crypto.randomBytes(16).toString('hex');
  portfolioChartPayloads.set(id, { payload, expiresAt: Date.now() + PORTFOLIO_CHART_TTL_MS });

  // Opportunistic sweep, so a render that never happens can't leak the entry.
  for (const [key, entry] of portfolioChartPayloads) {
    if (entry.expiresAt < Date.now()) portfolioChartPayloads.delete(key);
  }
  return id;
}

// Slice colours, reused between the donut and its legend.
const PORTFOLIO_SLICE_COLORS = ['#9d8dff', '#2ee08a', '#ffb638', '#ff5a76', '#5ad1ff', '#c78dff', '#8dffd1', '#ff9d5a'];

function buildPortfolioChartHtml(data) {
  const { slices, timeframes, totalLabel } = data;

  // Discord displays an embed image inside roughly a 400x300 box, constrained on BOTH axes.
  // A portrait card is therefore limited by height, and its displayed width shrinks — which is
  // why the earlier taller layouts all ended up scaled to about 0.44x however wide they were.
  // A 4:3 card fills the box exactly, and keeping the source small means less downscaling:
  // 520x390 displays at 400x300, a scale of 0.77x.
  const CARD_WIDTH = 520;
  const CARD_HEIGHT = 390;

  const radius = 46;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const donutSegments = slices.map((slice, index) => {
    const length = (slice.share / 100) * circumference;
    const seg = `<circle cx="70" cy="70" r="${radius}" fill="none" stroke="${PORTFOLIO_SLICE_COLORS[index % PORTFOLIO_SLICE_COLORS.length]}" ` +
      `stroke-width="${strokeWidth}" stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}" ` +
      `stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 70 70)" />`;
    offset += length;
    return seg;
  }).join('');

  // The card has a fixed height, so the legend is capped and the remainder summarised rather
  // than allowed to overflow the panel.
  const LEGEND_ROWS = 5;
  const visible = slices.slice(0, LEGEND_ROWS);
  const remainder = slices.slice(LEGEND_ROWS);
  const legendRows = visible.map((slice, index) => `
    <div class="legend-row">
      <span class="dot" style="background:${PORTFOLIO_SLICE_COLORS[index % PORTFOLIO_SLICE_COLORS.length]}"></span>
      <span class="sym">${slice.symbol}</span>
      <span class="share">${slice.share.toFixed(1)}%</span>
    </div>`).join('') + (remainder.length
    ? `<div class="legend-row more">+${remainder.length} more (${remainder.reduce((sum, s) => sum + s.share, 0).toFixed(1)}%)</div>`
    : '');

  // The 24h move is the headline: it is what someone glancing at the card wants to know.
  const headline = timeframes.find(t => t.label === '24h') || timeframes[0];
  const headlinePositive = !headline || headline.percent >= 0;
  const headlineHtml = headline
    ? `<div class="delta ${headlinePositive ? 'pos' : 'neg'}">` +
      `${headlinePositive ? '▲' : '▼'} ${headlinePositive ? '+' : ''}${headline.percent.toFixed(2)}%` +
      `<span class="delta-amt">${headline.amount >= 0 ? '+' : '-'}${headline.amountLabel}</span>` +
      '<span class="delta-tf">24h</span></div>'
    : '';

  const maxMagnitude = Math.max(1, ...timeframes.map(t => Math.abs(t.percent)));
  const barRows = timeframes.map(t => {
    const width = Math.max(2, (Math.abs(t.percent) / maxMagnitude) * 47);
    const positive = t.percent >= 0;
    return `
      <div class="bar-row">
        <span class="bar-label">${t.label}</span>
        <div class="bar-track">
          <div class="bar-centre"></div>
          <div class="bar-fill ${positive ? 'pos' : 'neg'}" style="width:${width.toFixed(2)}%; ${positive ? 'left:50%' : 'right:50%'}"></div>
        </div>
        <span class="bar-val ${positive ? 'pos' : 'neg'}">${positive ? '+' : ''}${t.percent.toFixed(2)}%</span>
      </div>`;
  }).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${CARD_WIDTH}px; height: ${CARD_HEIGHT}px; overflow: hidden; background: #1a1c22;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color: #e9ecf7;
    padding: 16px 18px 18px; display: flex; flex-direction: column;
  }
  .hero { text-align: center; flex: 0 0 auto; }
  .hero .cap { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: #8b93ab; font-weight: 600; }
  .hero .total { font-size: 46px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; margin-top: 3px; }
  .delta {
    display: inline-flex; align-items: baseline; gap: 9px; margin-top: 8px;
    font-size: 21px; font-weight: 700; padding: 5px 14px; border-radius: 999px;
  }
  .delta.pos { background: rgba(46,224,138,.13); }
  .delta.neg { background: rgba(255,90,118,.13); }
  .delta-amt { font-size: 17px; font-weight: 600; opacity: .85; }
  .delta-tf { font-size: 12px; font-weight: 600; color: #8b93ab; letter-spacing: .1em; text-transform: uppercase; }
  .panels { display: flex; gap: 14px; margin-top: 14px; flex: 1; min-height: 0; }
  .panel {
    background: #22252e; border: 1px solid #30343f; border-radius: 13px; padding: 13px 15px;
    flex: 1; min-width: 0; display: flex; flex-direction: column;
  }
  h2 { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: #8b93ab; font-weight: 600; margin-bottom: 10px; }
  .alloc { display: flex; align-items: center; gap: 10px; flex: 1; min-height: 0; }
  .donut-wrap { width: 98px; height: 98px; flex: 0 0 auto; }
  .legend { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .legend-row { display: flex; align-items: center; gap: 6px; font-size: 13px; white-space: nowrap; }
  .legend-row.more { color: #8b93ab; font-size: 12px; padding-left: 1px; }
  .dot { width: 9px; height: 9px; border-radius: 2px; flex: 0 0 auto; }
  .sym { font-weight: 650; flex: 0 0 auto; }
  .share { color: #8b93ab; margin-left: auto; font-variant-numeric: tabular-nums; }
  .bars { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 12px; }
  .bar-row { display: flex; align-items: center; gap: 10px; }
  .bar-label { width: 30px; font-size: 15px; color: #8b93ab; font-weight: 650; flex: 0 0 auto; }
  .bar-track { flex: 1; height: 20px; background: #1a1c22; border-radius: 6px; position: relative; overflow: hidden; min-width: 0; }
  .bar-centre { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #3a3f4d; }
  .bar-fill { position: absolute; top: 4px; bottom: 4px; border-radius: 4px; }
  .bar-fill.pos { background: linear-gradient(90deg, #2ee08a88, #2ee08a); }
  .bar-fill.neg { background: linear-gradient(270deg, #ff5a7688, #ff5a76); }
  .bar-val { width: 66px; text-align: right; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; flex: 0 0 auto; }
  .pos { color: #2ee08a; } .neg { color: #ff5a76; }
</style></head><body>
  <div class="hero">
    <div class="cap">Portfolio value</div>
    <div class="total">${totalLabel}</div>
    ${headlineHtml}
  </div>
  <div class="panels">
    <div class="panel">
      <h2>Allocation</h2>
      <div class="alloc">
        <div class="donut-wrap"><svg width="98" height="98" viewBox="0 0 140 140">${donutSegments}</svg></div>
        <div class="legend">${legendRows}</div>
      </div>
    </div>
    <div class="panel">
      <h2>Performance</h2>
      <div class="bars">${barRows}</div>
    </div>
  </div>
</body></html>`;
}

function chartServer() {
  const port = devMode ? 8086 : 8080;
  app.use(express.static(dir));

  // Registered before the single-segment /:ticker route for clarity. Only serves ids that are
  // already in memory, so there is nothing user-controlled reaching the page.
  app.get('/portfolio/:id', function (req, res) {
    const entry = portfolioChartPayloads.get(req.params.id);
    if (!entry || entry.expiresAt < Date.now()) {
      portfolioChartPayloads.delete(req.params.id);
      res.status(404).type('text/plain').send('Chart data expired.');
      return;
    }
    res.type('text/html').send(buildPortfolioChartHtml(entry.payload));
  });

  app.get('/:ticker', function (req, res) {
    // The ticker lands inside an inline <script> below, and it originates from user input to /c.
    // Anything outside this character set is rejected outright rather than escaped, because a
    // TradingView symbol never needs more than this (e.g. "BINANCE:BTCUSDT", "BTC_USD.P").
    const ticker = req.params.ticker;
    if (!/^[A-Za-z0-9:._-]{1,32}$/.test(ticker)) {
      res.status(400).type('text/plain').send('Invalid ticker symbol.');
      return;
    }

    let query = [];
    if (req.query.query) {
      query = req.query.query.split(',');
    }

    const intervalKeys = CHART_INTERVAL_KEYS;
    const intervalMap = CHART_INTERVAL_MAP;
    const studiesKeys = ['bb', 'bbr', 'bbw', 'crsi', 'ichi', 'ichimoku', 'macd', 'ma', 'ema', 'dema', 'tema', 'moonphase', 'pphl',
      'pivotshl', 'rsi', 'stoch', 'stochrsi', 'williamr'];
    const studiesMap = {
      'bb': 'BB@tv-basicstudies',
      'bbr': 'BollingerBandsR@tv-basicstudies',
      'bbw': 'BollingerBandsWidth@tv-basicstudies',
      'crsi': 'CRSI@tv-basicstudies',
      'ichi': 'IchimokuCloud@tv-basicstudies',
      'ichimoku': 'IchimokuCloud@tv-basicstudies',
      'macd': 'MACD@tv-basicstudies',
      'ma': 'MASimple@tv-basicstudies',
      'ema': 'MAExp@tv-basicstudies',
      'dema': 'DoubleEMA@tv-basicstudies',
      'tema': 'TripleEMA@tv-basicstudies',
      'moonphase': 'MoonPhases@tv-basicstudies',
      'pphl': 'PivotPointsHighLow@tv-basicstudies',
      'pivotshl': 'PivotPointsHighLow@tv-basicstudies',
      'rsi': 'RSI@tv-basicstudies',
      'stoch': 'Stochastic@tv-basicstudies',
      'stochrsi': 'StochasticRSI@tv-basicstudies',
      'williamr': 'WilliamR@tv-basicstudies'
    };

    let intervalKey = '1h';
    let selectedStudies = [];

    // Tokens that are studies or display flags, never intervals. The suffix-trimming fallbacks
    // below would otherwise match some of them by accident: "ma" (moving average) trims to "m"
    // and "moro" (light theme) trims to "mo", both of which are the monthly interval, so those
    // two options silently rendered a monthly chart.
    const nonIntervalKeys = new Set([...studiesKeys, 'wide', 'moro', 'light', 'bera', 'blul', 'crab', 'mmsoy', 'log']);

    query.forEach(i => {
      if (intervalKeys.indexOf(i) >= 0) {
        intervalKey = i;
      }
      else if (!nonIntervalKeys.has(i)) {
        // checking if the user put something like "4hr" instead of just "4h"
        if (intervalKeys.indexOf(i.substring(0, i.length - 1)) >= 0) {
          intervalKey = i.substring(0, i.length - 1);
        }
        // checking if the user put something like "5min" instead of just "5m" or "5"
        else if (intervalKeys.indexOf(i.substring(0, i.length - 2)) >= 0) {
          intervalKey = i.substring(0, i.length - 2);
        }
      }
      if (studiesKeys.indexOf(i) >= 0) {
        selectedStudies.push('"' + studiesMap[i] + '"');
      }
    });

    res.type('text/html');
    res.write(`
    <div id="ccchart-container" style="width:${query.includes('wide') ? '1280' : '720'}px; height: 600px; position:relative; top:-50px; left:-10px;">
      <!-- TradingView Widget BEGIN -->
      <div class="tradingview-widget-container">
        <div id="tradingview_bc0b0"></div>
        <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
        <script type="text/javascript">
          new TradingView.widget(
          {
            "width": ${query.includes('wide') ? '1280' : '720'},
          "height": 600,
          "symbol": ${JSON.stringify(ticker)},
          "interval": "${intervalMap[intervalKey]}",
          "timezone": "Etc/UTC",
          "theme": "${query.includes('moro') || query.includes('light') ? 'light' : 'dark'}",
          "style": "1",
          "locale": "en",
          "toolbar_bg": "#f1f3f6",
          "enable_publishing": false,
          "allow_symbol_change": true,
          "studies": [
          ${selectedStudies.join(',')}
          ],
          "container_id": "tradingview_bc0b0"
      }
          );
        </script>
      </div>
      <!-- TradingView Widget END -->
      <div id="tsukilogo" style="background: url('tsukilogo.png'); background-size:35px; height:35px; width:35px; position:absolute; bottom:44px; left:50px;"></div>
      <div id="bera1" style="background: url('bera1.png'); background-size:144px; height:235px; width:144px; position:absolute; bottom:0px; left:0px; display:${query.includes('bera') ? 'block' : 'none'};"></div>
      <div id="bera2" style="background: url('bera2.png'); background-size:107px; height:267px; width:107px; position:absolute; bottom:0px; right:0px; display:${query.includes('bera') ? 'block' : 'none'};"></div>
      <div id="blul1" style="background: url('blul1.png'); background-size:144px; height:235px; width:144px; position:absolute; bottom:0px; left:0px; display:${query.includes('blul') ? 'block' : 'none'};"></div>
      <div id="blul2" style="background: url('blul2.png'); background-size:107px; height:267px; width:107px; position:absolute; bottom:0px; right:0px; display:${query.includes('blul') ? 'block' : 'none'};"></div>
      <div id="crab0" style="background: url('crab0.png'); background-size:${query.includes('wide') ? '1280' : '720'}px 600px; height:100%; width:100%; position:absolute; bottom:0px; opacity:30%; display:${query.includes('crab') ? 'block' : 'none'};"></div>
      <div id="crab1" style="background: url('crab1.png'); background-size:125px; height:117px; width:126px; position:absolute; bottom:0px; left:30%; display:${query.includes('crab') ? 'block' : 'none'};"></div>
      <div id="crab2" style="background: url('crab2.png'); background-size:346px; height:206px; width:345px; position:absolute; bottom:15%; left:50%; transform:translate(-50%, -50%); display:${query.includes('crab') ? 'block' : 'none'};"></div>
      <div id="crab3" style="background: url('crab3.png'); background-size:95px; height:109px; width:93px; position:absolute; bottom:0px; right:30%; display:${query.includes('crab') ? 'block' : 'none'};"></div>
      <div id="cryptosoy1" style="background: url('cryptosoy1.png'); background-size:160px; height:263px; width:160px; position:absolute; bottom:0px; left:0px; display:${query.includes('mmsoy') ? 'block' : 'none'};"></div>
      <div id="cryptosoy2" style="background: url('cryptosoy2.png'); background-size:130px; height:318px; width:130px; position:absolute; bottom:-5px; right:0px; display:${query.includes('mmsoy') ? 'block' : 'none'};"></div>
    </div>`);
    res.end();
  });
  // Bound to loopback on purpose: this server exists only so the bot's own Puppeteer pages can load
  // the TradingView widget. Omitting the host makes Node listen on 0.0.0.0, which exposed it to
  // anyone who could reach the box.
  app.listen(port, '127.0.0.1', () => {
    console.log(`Chart server listening at http://127.0.0.1:${port}`);
  });
}

// Error event logging
client.on('error', (err) => {
  console.log(pc.red(pc.bold('General bot client Error. ' + pc.cyan('(Likely a connection interruption, check network connection) Here is the details:'))));
  console.error(err);
});

// Telemetry lives in a memory buffer between flushes, so a restart would otherwise lose the last
// few seconds of activity. pm2 sends SIGINT on restart and SIGTERM on stop; both drain the buffer
// before exiting. The timeout is the point: a database that is refusing writes must not turn a
// restart into a hang, so the drain gets a bounded window and then the process leaves anyway.
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (shuttingDown) return; // a second Ctrl-C should not start a second drain
    shuttingDown = true;
    console.log(pc.yellow(`\nReceived ${signal}, flushing telemetry before exit...`));
    try {
      const written = await Promise.race([
        telemetry.shutdown(),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 3000))
      ]);
      if (written === 'timeout') console.log(pc.yellow('Telemetry flush timed out, exiting anyway.'));
      else console.log(pc.green(`Telemetry flushed (${written} events written).`));
    }
    catch (err) {
      console.log(pc.red('Telemetry flush failed on shutdown: ' + pc.cyan(err && err.message)));
    }
    process.exit(0);
  });
}

process.on('unhandledRejection', err => {
  // If the error is a chromium restart failure from within puppeteer, we will restart the whole bot process because puppeteer will stop working if we don't.
  // This is really rare to happen, but if it does, this will keep the bot working normally without manual intervention.
  if (err.toString().includes('Unable to restart chrome.')) {
    console.log(pc.yellowBright('CHROMIUM RESTART FAILURE DETECTED!  RESTARTING BOT PROCESS TO FIX...'));
    process.kill(process.pid, 'SIGTERM'); //graceful exit, then pm2 will detect this and restart again
  }
  console.error(pc.redBright('----------------------------------UNHANDLED REJECTION DETECTED----------------------------------'));
  console.error(err);
  console.error(pc.redBright('------------------------------------------------------------------------------------------------'));
});

apiApp.get('/coin/:ticker', (req, res) => {
  const { ticker } = req.params;
  const coin = cgArrayDictParsed.find(coin => coin.symbol.toUpperCase() === ticker.toUpperCase());
  if (coin) {
    res.json(coin);
  } else {
    res.status(404).send('Coin not found');
  }
});

const ip = '127.0.0.1';
if (!devMode) {
  // Loopback only. This API has no authentication, so it must not be reachable off the host.
  apiApp.listen(apiAppPort, ip, () => {
    console.log(`Prices API server running at http://${ip}:${apiAppPort}`);
  });
}


// Jack in, Megaman. Execute.
if (devMode) {
  console.log(pc.cyan('Logging in with dev token...'));
  client.login(keys.devToken);
}
else {
  client.login(keys.token);
}



// Wow, you made it to the bottom! Here's a big yeet.

// -------------------------------------------
// -------------------------------------------
// -------------------------------------------
//
//            YEEEEEEEEEEEEEEEET
//
// -------------------------------------------
// -------------------------------------------
// -------------------------------------------
