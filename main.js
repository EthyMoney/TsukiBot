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

// 1. Make sure you have node.js and npm installed and ready to use. Node version 14.x or newer is required.
// 2. Open a terminal in the project directory and run the command "npm install" to install all required dependencies.
// 3. Create a keys.api file in the common folder to include all of your own keys, tokens, and passwords that are needed for normal operation of all services.
//    You can find the template keys.api file to reference in the "How to set up keys file" text file within the docs folder. Just fill in the blanks!
// 4. Head down toward the bottom of this file and take note of the comment in the getChart function. You may need to comment out that executable path for 
//    chromium depending on your environment. The commend there tells you whether you need to do it or not. (charts may not work if you don't check this!)
//    For details on how to structure this file and what you need in it, check the "How to set up keys file" guide in the docs folder.
// 5. Set up your PostgreSQL database according to the schema defined in the docs folder.
// 6. Head into the docs folder and check the fix guide for the graviex package and apply that fix.
// 7. You are now ready to start the bot! Go ahead and run this file to start up. EX: "node main.js"
//    If you have any questions or issues, feel free to contact me in the support discord server and I'll try to help you out. Link: https://discordapp.com/invite/VWNUbR5

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
initializeFiles();

// Top.gg bot statistics reporter
const { AutoPoster } = require('topgg-autoposter');
let poster;               // Will be initialized upon startup

// HTTP stuff
const WebSocket = require('ws');

// Include API things
const { Client, GatewayIntentBits, ShardClientUtil, ActivityType, EmbedBuilder } = require('discord.js');
const cc = require('cryptocompare');
const CoinMarketCap = require('coinmarketcap-api');
const ccxt = require('ccxt');
const graviex = require('graviex');
const CoinGecko = require('coingecko-api');
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
let cmcArray = {};
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

// Connect to database
const conString = 'postgres://bigboi:' + keys.tsukibot + '@' + keys.dbAddress + ':5432/tsukibot';

// Declare general global variables
let messageCount = 0;
let referenceTime = Date.now();
let chartTagID = 0;
let globalCGSleepTimeout = 25000; // used to set sleep interval between cg cache update queries

// Initialize api things
const clientKraken = new ccxt.kraken();
const bitmex = new ccxt.bitmex();
const CoinGeckoClient = new CoinGecko();
const clientPoloniex = new ccxt.poloniex();
// Binance's main API host (api.binance.com) geo-restricts some server locations with HTTP 451. The public
// market-data host (data-api.binance.vision) serves the same read-only spot endpoints (exchangeInfo, tickers)
// without that block, so we point Binance's public endpoints there. We also limit loadMarkets() to spot only,
// because the default also fetches futures (fapi/dapi hosts) which are still geo-blocked and would fail the call.
const clientBinance = new ccxt.binance({ options: { fetchMarkets: { types: ['spot'] } }, urls: { api: { public: 'https://data-api.binance.vision/api/v3' } } });
const clientBitfinex = new ccxt.bitfinex();
const clientCoinbase = new ccxt.coinbase();
const finnhubClient = new finnhub.DefaultApi(keys.finnhub);
const translate = new Translate({ projectId: googleProjectID, keyFilename: googleProjectApiKeyPath });
const web3eth = new Web3(`https://mainnet.infura.io/v3/${keys.infura}`);
//clientcmc will be re-initialized upon bot startup, key selection will be automatic and this selected key here is temporary
let clientcmc = new CoinMarketCap(keys.coinmarketcapfailover);
graviex.accessKey = keys.graviexAccessKey;
graviex.secretKey = keys.graviexSecretKey;
cc.setApiKey(keys.cryptocompare);

// Reload Coins
const reloaderCG = require('./getCoinsCG');

// Donation and footer stuff
const quote = 'Enjoying TsukiBot? Tell your friends!';
const botInviteAdd = '\nAdd the bot to other servers by using  `.tb invite`  for the link  :)';
const inviteLink = 'https://discordapp.com/oauth2/authorize?client_id=506918730790600704&scope=bot&permissions=268823664';

// Scheduled Actions for normal operation
if (!devMode) {
  schedule.scheduleJob('*/10 * * * *', getCMCData);      // fetch every 10 min
  schedule.scheduleJob('*/30 * * * *', getCGData);       // fetch every 30 min
  schedule.scheduleJob('0 12 * * *', updateCoins);      // update at 12 am and pm every day
  schedule.scheduleJob('*/30 * * * *', getCoin360Heatmap);   // fetch every 30 min
  schedule.scheduleJob('0 */6 * * *', updateExchangeRates); // update every 6 hours
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
  if (coin2.toLowerCase() === 'usd' || coin1.toLowerCase() === 'btc' && (coin2.toLowerCase() !== 'gbp' &&
    coin2.toLowerCase() !== 'eur' && coin2.toLowerCase() !== 'dai' && coin2.toLowerCase('eth') && coin2.toLowerCase('usdc'))) {
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

// Function for Graviex prices

async function getPriceGraviex(channel, coin1, coin2) {

  let graviexJSON;
  let price = 0;
  let change = 0;
  let volume = 0;
  let volumeCoin = 0;
  if (typeof coin2 === 'undefined') {
    coin2 = 'BTC';
  }
  if (coin2.toLowerCase() === 'usd' || coin1.toLowerCase() === 'btc') {
    coin2 = 'USDT';
  }
  coin1 = coin1 + '';
  coin2 = coin2 + '';

  await graviex.ticker(coin1.toLowerCase() + coin2.toLowerCase(), function (res) {
    let moon = '';
    graviexJSON = res;
    if (typeof graviexJSON.ticker === 'undefined') {
      channel.send('Internal error. Requested pair does not exist or Graviex is overloaded.');
      console.log((pc.red('Graviex error : graviex failed to respond.')));
      return;
    }
    price = trimDecimalPlaces(graviexJSON.ticker.last);
    change = graviexJSON.ticker.change;
    change = parseFloat(change * 100).toFixed(2);
    volume = graviexJSON.ticker.volbtc;
    volumeCoin = graviexJSON.ticker.vol;

    if (change > 20) { moon = ':full_moon_with_face:'; }

    let ans = '__Graviex__ Price for **' + coin1.toUpperCase() + '-' + coin2.toUpperCase() + '** is: `' + price + ' ' + coin2.toUpperCase() + '` ' + '(' + '`' + change + '%' + '`' + ') ' + moon;

    if (coin2.toLowerCase() === 'btc') {
      ans = ans + '\n \\/\\/\\/\\/**24hr volume **➪ `' + parseFloat(volume).toFixed(4) + ' ' + coin2.toUpperCase() + '` ' + '➪ `' + numberWithCommas(parseFloat(volumeCoin).toFixed(0)) + ' ' + coin1.toUpperCase() + '`';
    }
    channel.send(ans);
  });
}


//------------------------------------------
//------------------------------------------

// Function for Coin Gecko prices

async function getPriceCoinGecko(coin, coin2, channel, action, author) {

  //don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning && !devMode) {
    channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
    console.log(pc.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
    return;
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
        data = await CoinGeckoClient.simple.price({
          ids: [coinID, coinID1],
          vs_currencies: ['usd', coin2.toLowerCase()],
          include_24hr_vol: [true],
          include_24hr_change: [true]
        });
      if (foundCount == 3)
        data = await CoinGeckoClient.simple.price({
          ids: [coinID, coinID1, coinID2],
          vs_currencies: ['usd', coin2.toLowerCase()],
          include_24hr_vol: [true],
          include_24hr_change: [true]
        });
      if (foundCount == 4)
        data = await CoinGeckoClient.simple.price({
          ids: [coinID, coinID1, coinID2, coinID3],
          vs_currencies: ['usd', coin2.toLowerCase()],
          include_24hr_vol: [true],
          include_24hr_change: [true]
        });
    }


    // build the reply message that shows all coins found with the given ticker, and label them by full name
    let builtMessage = '';
    let errorMessage = '';
    let cursor = 0;
    if (noSend) {
      arr = data;
    }
    else {
      arr = Object.entries(data.data);
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
        data = await CoinGeckoClient.simple.price({
          ids: [coinID],
          vs_currencies: ['usd', coin2.toLowerCase()],
          include_24hr_vol: [true],
          include_24hr_change: [true]
        });
        s = parseFloat(data.data[coinID][coin2]).toFixed(8);
        c = Math.round(data.data[coinID][coin2.toLowerCase() + '_24h_change'] * 100) / 100;
      }
      s = trimDecimalPlaces(s);
      if (isNaN(s) || !s) { // looking for NaN, making sure price is valid
        channel.send('**' + coin.toUpperCase() + '** was found, but the pairing currency **' + coin2.toUpperCase() + '** was not found. Try another pairing!');
        return;
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
      channel.send('Provided coin **' + coin.toUpperCase() + '** was not found!');
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
      channel.send('Error: Your tbpa is too long to send! Please remove some coins and try again. Use `.tb pa` to see how to do this.');
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
  cc.priceFull(query.map(function (c) { return c.toUpperCase(); }), ['USD', 'BTC'])
    .then(prices => {
      let message = '__CryptoCompare__ Price for:\n';
      let bpchg = parseFloat(cmcArrayDict.BTC.percent_change_24h);

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
    .catch(console.log);
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

// Function for grabbing Bitmex swap contract funding data

async function getMexFunding(channel, message, interaction) {

  //console.log(chalk.green('BitMEX funding stats requested by ' + chalk.yellow(message.author.username)));

  let messageNumber = 0;
  //create websocket listener
  const ws = new WebSocket('wss://www.bitmex.com/realtime?subscribe=instrument,orderBook:XBTUSD', {
    perMessageDeflate: false
  });

  ws.on('message', function incoming(data) {
    messageNumber++;
    if (messageNumber === 4) {
      let btc = '';
      let eth = '';

      //find the btc and eth objects
      const dataJSON = JSON.parse(data).data;
      for (let i = 0; i < dataJSON.length; i++) {
        if (dataJSON[i].symbol === 'XBTUSD') {
          btc = dataJSON[i];
        }
        if (dataJSON[i].symbol === 'ETHUSD') {

          eth = dataJSON[i];
        }
      }

      const text = 'Current Rate: `' + parseFloat(btc.fundingRate * 100).toFixed(4) + '%` \n' +
        'Predicted Rate: `' + parseFloat(btc.indicativeFundingRate * 100).toFixed(4) + '%`';
      const text2 = 'Current Rate: `' + parseFloat(eth.fundingRate * 100).toFixed(4) + '%` \n' +
        'Predicted Rate: `' + parseFloat(eth.indicativeFundingRate * 100).toFixed(4) + '%`';

      const embed = new EmbedBuilder()
        .setAuthor({ name: 'BitMEX Perpetual Swap Contract Funding Stats' })
        .addFields(
          { name: 'XBT/USD:', value: text },
          { name: 'ETH/USD:', value: text2 }
        )
        .setThumbnail('https://firebounty.com/image/751-bitmex')
        .setColor('#1b51be')
        .setFooter({ text: 'BitMEX Real-Time', iconURL: 'https://firebounty.com/image/751-bitmex' });

      if (interaction) {
        interaction.editReply({ embeds: [embed] });
      }
      else {
        channel.send({ embeds: [embed] }).catch(function (reject) {
          channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
          console.log(pc.red('Error sending bitmex funding! : ' + pc.cyan(reject)));
        });
      }
    }
  });
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
          interaction.editReply(builtMessage);
        }
        else {
          channel.send(builtMessage);
        }
      })();
    }
    else {
      if (interaction) {
        interaction.editReply('One or more of your coins were not found on CoinGecko or available fiat pairs. Check your input and try again!');
      }
      else {
        channel.send('One or more of your coins were not found on CoinGecko or available fiat pairs. Check your input and try again!' + '\nIf you need help, just use `.tb cv` to see the guide for this command.');
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

function tagsEngine(channel, author, timestamp, guild, command, tagName, tagLink) {

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
      let json = JSON.stringify(obj); //convert it back to json
      fs.writeFileSync('tags.json', json, 'utf8');
      tagsJSON = JSON.parse(fs.readFileSync('tags.json', 'utf8')); //read and reload the tags cache
      console.log(pc.blue('Tag ' + '"' + tagName + '"' + ' created!'));
      channel.send('Tag ' + '"' + tagName + '"' + ' created!');
    }

  } else if (command === 'deletetag' && validTag) {
    let tags = tagsJSON.tags;
    for (let i = 0; i < tags.length; i++) {
      if (tags[i].guild === guild.id) {
        if (tagName.toString().toLowerCase() === tags[i].tagName) {
          resultName = tags[i].tagName;
          tags.splice(i, 1);
          tagsJSON.tags = tags;
          let json = JSON.stringify(tagsJSON); //convert it back to json
          fs.writeFileSync('tags.json', json, 'utf8');
          tagsJSON = JSON.parse(fs.readFileSync('tags.json', 'utf8')); //read and reload the tags cache
          channel.send('Tag ' + '"' + resultName + '"' + ' deleted.');
          console.log(pc.blue('Tag ' + '"' + pc.yellow(tagName) + '"' + ' deleted!'));
          return;
        }
      }
    }

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
      channel.send('There are no tags in this server! Feel free to make one using `.tb createtag <tag name here> <tag link here>`');
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
          .setFooter({ text: 'To see a tag, use  .tb tag <tag name here>' });

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
              .setFooter({ text: 'To see a tag, use  .tb tag <tag name here>' });

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
              .setFooter({ text: 'To see a tag, use  .tb tag <tag name here>' });

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
      ':small_blue_diamond: To make a new tag, use the createtag command: `.tb createtag <tag name here> <tag link(URL) here>`\n' +
      ':small_blue_diamond: To view a tag, use the tag command: `.tb tag <tag name here>`\n' +
      ':small_blue_diamond: To view all available tags in the server, use the taglist command: `.tb taglist\n`' +
      ':small_blue_diamond: To delete a tag, use the deletetag command: `.tb deletetag <tag name here>`');
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
    console.log(pc.green(`Etherscan balance lookup called in: ${pc.cyan(channel.guild.name)} by ${pc.yellow(author.username)}`));
    const res = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=account&action=balance&address=${address}&tag=latest&apikey=${keys.etherscan}`);
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
    web3eth.eth.ens.getOwner(address).then(function (owner) {
      // check for unregistered ENS name, and then send not found notification and ENS link to potentially register that name
      if (owner == '0x0000000000000000000000000000000000000000') {
        console.log(pc.green(`Etherscan ENS registration sent for ${pc.yellow(address)} in ${pc.cyan(channel.guild.name)}`));
        const addy = 'https://app.ens.domains/name/' + address;
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
        getEtherBalance(author, owner, channel);
      }
    });
  }
  else {
    console.log(pc.green(`Etherscan txn lookup called in: ${pc.cyan(channel.guild.name)} by ${pc.yellow(author.username)}`));
    const res = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_blockNumber&apikey=${keys.etherscan}`);
    const res2 = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getTransactionByHash&txhash=${address}&apikey=${keys.etherscan}`);
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

  // filter out coins that don't have BOTH a valid mc rank AND 24h % change
  const cgdatatemp = cgArrayDictParsed.filter(function (value) {
    return value.market_cap_rank !== null && value.price_change_percentage !== null && value.total_volume >= 10000;
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

  console.log(pc.green('CoinGecko biggest movers command called in: ' + pc.yellow(channel.guild.name) + ' by ' + pc.yellow(author.username)));
}


//------------------------------------------
//------------------------------------------

// Send Coin360 coins heatmap
function sendCoin360Heatmap(message, interaction) {

  //console.log(`${chalk.green('Coin360 heatmap command called by:')} ${chalk.yellow(message.member.user.tag)}`);

  // Hmap image is cached in 30 min cycles by scheduler, we just need to send it here

  if (interaction) {
    interaction.reply({
      files: [{
        attachment: 'chartscreens/generated-charts/hmap.png',
        name: 'hmap.png'
      }]
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

  await CoinGeckoClient.global().then((data) => {
    const mcTotalUSD = data.data.data.total_market_cap.usd;
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
      interaction.reply(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
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
          interaction.reply({ embeds: [embed] });
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
      }
    }
    if (!success) {
      if (interaction) {
        interaction.reply('Sorry, I was unable to find that coin.');
      }
      else {
        message.channel.send('Failed to find a CoinGecko coin associated with that input.\nTry again with either the full name, or the ticker symbol.');
        console.log(pc.red(`Failed to find matching coin for input to mc command of: ${pc.cyan(cur)}`));
      }
    }
  })();
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

  const conn = new pg.Client(conString);
  conn.connect();

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
    conn.query('SELECT * FROM tsukibot.profiles where id = $1;', [id], (err, res) => {
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
      conn.end();
    });


    // .tb pa call (create new list or overwrite existing)
  } else {

    if (coins.length == 0) {
      // help message for when no input is given to modification command
      channel.send('**Here\'s how to set up or modify your tbpa:**\n' +
        ':small_blue_diamond: To set a new tbpa or overwrite an existing one, use `.tb pa <coins list>`.' +
        '\n          **Example:** `.tb pa eth btc glm ...`\n' +
        ':small_blue_diamond: To add or remove from an existing tbpa, simply put a + or - right after the "pa".' +
        '\n          **Example:**  Add: `.tb pa+ dot xlm fil ...`  Remove: `.tb pa- dot eth ...`\n\n' +
        ':notepad_spiral: You can set/modify one coin, or even multiple coins at a time (as seen above).' +
        ' For any further questions, use `.tb help` to see the more detailed commands guide and examples.');
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
      conn.query(('INSERT INTO tsukibot.profiles(id, coins) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET coins = $2;'), [id, coins.toLowerCase()], (err) => {
        if (err) { console.log(pc.red(pc.bold((err + '------TB PA query insert error')))); }
        else { channel.send('Personal array set: `' + coins.toLowerCase() + '` for <@' + id + '>.' + invalidCoinsMessage); }
        conn.end();
      });

      // edit existing tbpa list
    } else {
      const command = (action === '-') ? 'REMOVE' : 'ADD';
      conn.query('SELECT * FROM tsukibot.profiles where id = $1;', [id], (err, res) => {
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
              conn.query(('INSERT INTO tsukibot.profiles(id, coins) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET coins = $2;'), [id, '{' + inStr + '}'], (err) => {
                if (err) { console.log(pc.red(pc.bold(err + '------TB PA remove insert query error'))); }
                else {
                  if (interaction) {
                    interaction.reply('Personal array modified successfully.');
                  }
                  else {
                    channel.send('Personal array modified successfully.');
                  }
                }
                conn.end();
              });
            }
          }
          if (command === 'ADD') {
            coins = cleanedCoins;
            //Check if user has an entry in the DB
            if (typeof inStr === 'undefined') {
              channel.send('There is no tbpa entry found yet for your profile, create one by using the command `.tb pa <coins list>` Example: `.tb pa btc eth xrp glm .....`');
              //console.log(chalk.red.bold('TBPA add action aborted on null tbpa. The user does not have a DB entry yet! Request was sent by: ' + chalk.yellow(message.author.username)));
            } else {
              //String processing
              while (inStr.includes(',,')) { inStr = inStr.replace(',,', ','); } //remove excess commas
              inStr = inStr + ',' + coins.toString().toLowerCase(); //add selected coins
              inStr = '{' + inStr + '}';
              inStr = inStr.replace('{,', '{'); //remove starting comma
              inStr = inStr.replace(/\{+/g, ''); //remove left bracket
              inStr = inStr.replace(/\}+/g, ''); //remove right bracket
              conn.query(('INSERT INTO tsukibot.profiles(id, coins) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET coins = $2;'), [id, '{' + inStr + '}'], (err) => {
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
                conn.end();
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

  // First run of scheduled executions
  updateExchangeRates();
  updateCoins();
  updateCmcKey();
  getCMCData();

  // Load CG cache from file first for instant availability
  const cacheLoaded = loadCGCacheFromFile();

  // Then run the update in the background to get fresh data
  if (cacheLoaded) {
    console.log(pc.cyan('Starting background CoinGecko cache update...'));
  }
  getCGData(cacheLoaded ? 'background' : 'firstrun');
  if (!cacheLoaded) {
    cacheUpdateRunning = true; // prevents the scheduler from creating an overlapping process with the first run
  }
  getCoin360Heatmap();
});

// DM's the command list to the caller
function postHelp(message, author, code, interaction) {

  const link = 'https://github.com/EthyMoney/TsukiBot/blob/master/common/commands.md';

  if (interaction) {
    interaction.reply('Hi there! Here\'s a link to the fancy help document that lists every command and how to use them: \n' + link);
    return;
  }

  code = code || 'none';
  let fail = false;
  if (code === 'ask') {
    author.send('Hi there! Here\'s a link to the fancy help document that lists every command and how to use them: \n' + link).catch(function () {
      console.log(pc.yellow('Failed to send help text to ' + author.username + ' via DM, sent link in server instead.'));
      message.reply('I tried to DM you the commands but you don\'t allow DMs. Hey, it\'s cool, I\'ll just leave the link for you here instead: \n' + link).then(function () {
        fail = true;
      });
    });
    // wait for promises to resolve
    setTimeout(function () {
      if (!fail) {
        message.reply('I sent you a DM with a link to my commands!').catch(function () {
          console.log(pc.red('Failed to reply to tbhelp message in chat!'));
          fail = true;
        });
      }
    }, 1000);
    setTimeout(function () {
      if (!fail) {
        console.log(pc.green('Successfully sent help message to: ' + pc.yellow(author.username)));
      }
    }, 1800);
  } else {
    message.channel.send('Command not recognized. Use `.tb help` to see the commands and their usage. \n' +
      'Keep in mind that commands follow this format: `.tb <command> <parameter(s)>`');
  }
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

// This is triggered for every slash command that the bot receives
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return; // only handle slash commands
  if (interaction.user.bot) return; // ignore bots

  const command = interaction.commandName;
  const opts = interaction.options;
  const author = interaction.user;

  const inputs = opts.data.map(o => `${o.name}: ${o.value}`).join(', ');
  console.log(pc.green('Slash command ') + pc.cyan('/' + command) + pc.green(' used by ') + pc.yellow(author.username) + (inputs ? pc.green(' with ') + pc.cyan(inputs) : ''));

  try {
    switch (command) {

      // ---- TradingView charts ----
      case 'c': {
        await interaction.deferReply();
        if (chartTagID > 25) chartTagID = 1;
        const query = (opts.getString('query') || '').toLowerCase();
        const data = {
          message: '',
          interaction: interaction,
          args: ('.tbc ' + query).split(' ').filter(v => v !== ''),
          chartMessage: '',
          attempt: 1,
          chartID: ++chartTagID
        };
        cluster.queue(data);
        break;
      }

      // ---- CoinGecko prices ----
      case 'cg':
        getPriceCG(opts.getString('coins').split(' ').filter(v => v !== ''), null, '-', 'd', false, interaction);
        break;

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
          case 'graviex': getPriceGraviex(responder, coin, vs); break;
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
        postSessionStats(null, interaction);
        break;

      // ---- Help ----
      case 'help':
        postHelp(null, null, null, interaction);
        break;

      // ---- Fear/Greed index ----
      case 'fg':
        getFearGreedIndex(null, author, interaction);
        break;

      // ---- BitMEX funding ----
      case 'funding':
        await interaction.deferReply();
        getMexFunding(null, null, interaction);
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
        if (queryEth.length === 42) {
          getEtherBalance(author, queryEth, responder, 'b');
        } else if (queryEth.length === 66) {
          getEtherBalance(author, queryEth, responder, 'tx');
        } else if (queryEth.toLowerCase().includes('.eth')) {
          getEtherBalance(author, queryEth, responder, 'ens');
        } else {
          await interaction.editReply('Please provide a valid ETH address (0x... 42 chars), transaction hash (0x... 66 chars), or ENS name (name.eth).');
        }
        break;
      }

      // ---- Top 10 popular coins ----
      case 'pop': {
        await interaction.deferReply();
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
        getPriceCG(top10, makeResponder(interaction), 'p');
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
          tagsEngine(responder, author, ts, interaction.guild, 'deletetag', opts.getString('name'));
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

      // ---- Discord ID ----
      case 'id':
        await interaction.reply({ content: 'Your ID is `' + author.id + '`.', ephemeral: true });
        break;

      default:
        await interaction.reply({ content: 'Unknown command. Use `/help` to see all available commands.', ephemeral: true });
        break;
    }
  } catch (err) {
    console.log(pc.red('Error handling slash command ') + pc.cyan('/' + command) + pc.red(': ') + pc.cyan(err));
    // Try to let the user know something went wrong, using whichever response method is still available
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'Sorry, something went wrong while processing that command. Please try again later.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Sorry, something went wrong while processing that command. Please try again later.', ephemeral: true });
      }
    } catch (innerErr) {
      console.log(pc.red('Also failed to send error notification to user: ' + pc.cyan(innerErr)));
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
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

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
function chunkString(str, len) {
  const input = respectBracketsSpaceSplit(str.trim());
  let [index, output] = [0, []];
  output[index] = '';
  input.forEach(word => {
    let temp = `${output[index]} ${word}`.trim();
    if (temp.length <= len) {
      output[index] = temp;
    } else {
      index++;
      output[index] = word;
    }
  });
  return output;
}

// Valid string checker
function isAlphaNumeric(str) {
  let code, i, len;
  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i);
    if (!(code > 47 && code < 58) && // numeric (0-9)
      !(code > 64 && code < 91) && // upper alpha (A-Z)
      !(code > 96 && code < 123)) { // lower alpha (a-z)
      return false;
    }
  }
  return true;
}

// Split a string by spaces while keeping strings within brackets intact as one chunk (this assists the chunkString function)
function respectBracketsSpaceSplit(input) {
  let i = 0, stack = [], parts = [], part = '';
  while (i < input.length) {
    let c = input[i]; i++;  // get character
    if (c == ' ' && stack.length == 0) {
      parts.push(part.replace(/"/g, '\\"'));  // append part
      part = '';  // reset part accumulator
      continue;
    }
    if (c == '[') stack.push(c);  // begin square brace
    else if (c == ']' && stack[stack.length - 1] == '[') stack.pop();  // end square brace
    part += c; // append character to current part
  }
  if (part.length > 0) parts.push(part.replace(/"/g, '\\"'));  // append remaining part
  return parts;
}

// Check if string is a valid URL
function validURL(str) {
  const pattern = new RegExp('^(https?:\\/\\/)?' + // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
    '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locator
  return !!pattern.test(str);
}

// Pauses execution when called within an async function for the given milliseconds
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Send the session stats of the bot
function postSessionStats(message, interaction) {
  //console.log(chalk.green('Session stats requested by: ' + chalk.yellow(message.author.username)));
  let users = (client.guilds.cache.reduce(function (sum, guild) { return sum + guild.memberCount; }, 0));
  users = numberWithCommas(users);
  const guilds = numberWithCommas(client.guilds.cache.size);
  const messagesPerSecond = Math.trunc(messageCount * 1000 * 60 / (Date.now() - referenceTime));
  //const topCrypto   = coinArrayMax(requestCounter);
  //const popCrypto   = coinArrayMax(mentionCounter);
  const messageHeader = ('Serving `' + users + '` users from `' + guilds + '` servers.\n' +
    '⇒ Current uptime: `' + Math.trunc(client.uptime / (3600000)) + 'hr`.\n' +
    '⇒ Average messages per minute: `' + messagesPerSecond + '`.\n' +
    // + (topCrypto[1] > 0 ? "⇒ Top requested crypto: `" + topCrypto[0] + "` with `" + topCrypto[1] + "%` dominance.\n" : "")
    // + (popCrypto[1] > 0 ? "⇒ Top mentioned crypto: `" + popCrypto[0] + "` with `" + popCrypto[1] + "%` dominance.\n" : "")
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
async function chartsProcessingCluster() {
  const puppeteerOpts = {
    headless: true,
    // !!! NOTICE: comment out the following line if running on Windows or MacOS. Setting the executable path like this is for linux systems.
    // adjust the path as needed based on what environment and executable you're using
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  // Start up a puppeteer cluster browser
  cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency: 20,
    puppeteerOptions: puppeteerOpts,
    retryLimit: 3,
    retryDelay: 200,
    timeout: 85000,
    workerCreationDelay: 100
  });
  // Event handler to be called in case of problems
  cluster.on('taskerror', (err, data) => {
    console.log(pc.red(`Puppeteer cluster encountered error processing task: ${data}: ${err.message}`));
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
          message.reply('Insufficient amount of arguments provided. Check `.tb help` to see how to use the charts command.');
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

        // Capture the final chart from the browser window
        const chartScreenshot = await page.screenshot();

        // Save screenshot to file with random identifier
        const fileName = `chartscreens/generated-charts/chart${crypto.randomBytes(8).toString('hex')}.png`;
        fs.writeFileSync(fileName, chartScreenshot);

        const end = performance.now();
        console.log(pc.blue(`(ID:${chartID})`) + ' Execution time: ' + pc.green(`${((end - start) / 1000).toFixed(3)} seconds`));

        if (data.interaction) {
          data.interaction.editReply({
            files: [{
              attachment: fileName,
              name: 'tsukibotchart.png'
            }]
          });
        }
        else {
          message.channel.send({
            files: [{
              attachment: fileName,
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
          'chartMessage': chartMessage,
          'attempt': attempt,
          'chartID': chartID
        };
        cluster.queue(data2);
      }
      else {
        if (!data.interaction) chartMessage.edit('```TradingView handler threw error' + ', all re-attempts exhausted :(' + '```');
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

  cluster.queue('https://coin360.com/widget/map?utm_source=embed_map', grabHmap);
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
function abbreviateNumber(num, fixed) {
  if (num === null) { return null; } // terminate early
  if (num === 0) { return '0'; } // terminate early
  fixed = (!fixed || fixed < 0) ? 0 : fixed; // number of decimal places to show
  const b = (num).toPrecision(2).split('e'), // get power
    k = b.length === 1 ? 0 : Math.floor(Math.min(b[1].slice(1), 14) / 3), // floor at decimals, ceiling at trillions
    c = k < 1 ? num.toFixed(0 + fixed) : (num / Math.pow(10, k * 3)).toFixed(1 + fixed), // divide by power
    d = c < 0 ? c : Math.abs(c), // enforce -0 is 0
    e = d + ['', 'k', 'm', 'b', 't'][k]; // append power
  return e;
}

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
function numberWithCommas(x) {
  x = trimDecimalPlaces(x);
  let parts = x.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// Function to trim decimal place digits when number is bigger than 10 (for cleaner appearance)
function trimDecimalPlaces(x) {
  if (x > 10 && x.toString().indexOf('.') !== -1) {
    x = parseFloat(x);
    return x.toFixed(2); //shorten the decimal places
  }
  else {
    return x;
  }
}

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
  //Update client to operate with new key
  if (selectedKey.toString().length <= 2) {
    clientcmc = new CoinMarketCap(keys['coinmarketcap' + selectedKey]);
    //console.log(chalk.greenBright("Updated CMC key! Selected CMC key is " + chalk.cyan(selectedKey) + ", with key value: " + chalk.cyan(keys['coinmarketcap' + selectedKey]) +
    //" and hour is " + chalk.cyan(hour) + ". TS: " + d.getTime()));
  }
  else {
    clientcmc = new CoinMarketCap(keys[selectedKey]);
  }

  return selectedKey;
}


/* ---------------------------------

  getCMCData()

  Update the cmc data array every
  8 minutes (Endpoint update rate)

 ---------------------------------- */

async function getCMCData() {

  //WARNING! This will pull ALL cmc coins and cost you up to 22 credits (limit/200) on your api account for each call. This is why I alternate keys!
  const limit = devMode ? 100 : 4400;
  const cmcJSON = await clientcmc.getTickers({ limit: limit }).then().catch(console.error);
  cmcArray = cmcJSON.data;
  cmcArrayDict = {};
  try {
    cmcArray.forEach(function (v) {
      if (!cmcArrayDict[v.symbol])
        cmcArrayDict[v.symbol] = v;
    });
  } catch {
    fails++;
    console.error(pc.red(pc.bold('ERROR UPDATING CMC CACHE! This is attempt number: ' + pc.cyan(fails) + ' : API response below:')));
    console.log(cmcJSON);
  }
  //console.log(chalk.green(chalk.cyan(cmcArray.length) + " CMC tickers updated!"));
}


/* ---------------------------------

  getCGData()

  Update the CoinGecko data array
  every 20 minutes (as per cron job at top of file)

  Caching process takes around 10-15 minutes
  and could end up taking longer depending on API
  limited and current availability

 ---------------------------------- */

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

// Save CG cache to file for next startup
function saveCGCacheToFile() {
  try {
    const cacheData = {
      timestamp: Date.now(),
      data: cgArrayDictParsed
    };
    fs.writeFileSync('./common/cgCache.json', JSON.stringify(cacheData));
    console.log(pc.greenBright('CoinGecko cache saved to file for next startup.'));
  } catch (err) {
    console.log(pc.red('Error saving CG cache to file: ' + err.message));
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

  // startup handling
  if (cacheUpdateRunning) {
    return;
  }
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
  let totalCoinsCount = 0;
  const startTime = Date.now();

  // first, lets see how many coins are on the API so we can accurately report progress
  const resList = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=false');
  if (resList.ok) {
    const data = await resList.json();
    totalCoinsCount = data.length;
  }
  else {
    console.log('Couldn\'t get total CG coins, aborting this cache update..');
    cacheUpdateRunning = false;
    return;
  }

  // query for sets of 250 until we got them all
  do {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&page=${page}&order=market_cap_desc&price_change_percentage=1h,24h,7d,14d,30d,1y`);
    if (res.ok) {
      const data = await res.json();
      for (const coin of data) {
        coinDataJsonArr.push(coin);
      }
      page++;
      lastResSize = data.length;

      // progress report for first run (only show if no cache was loaded)
      if (status == 'firstrun' || cgArrayDictParsed.length == 0) {
        progressPercentage = Math.round((coinDataJsonArr.length / totalCoinsCount) * 100);
        console.log(pc.blueBright(` ▶ ${progressPercentage}%`));
        startupProgress = Math.round(progressPercentage); // update global
      }
    }
    else {
      console.log(pc.red('CG update error at page: ' + page + ', status: ') + res.status);
      // 429 is rate limiting
      if (res.status == 429) {
        console.log('Whelp, looks like we got rate limited on that run. Increasing sleep timeout to', globalCGSleepTimeout + 1000, 'for the next run.');
        // try increasing the sleep timeout by a second for the next run (attempted auto healing for rate limiting)
        globalCGSleepTimeout += 1000;
        cacheUpdateRunning = false;
      }
      return;
    }
    if (progressPercentage < 100) {
      await sleep(globalCGSleepTimeout); //wait to make next query (CoinGecko is touchy with rate limits)
    }
  } while (lastResSize == 250);


  // sort by MC rank ascending order with nulls placed at the end
  let marketDataFiltered = coinDataJsonArr.sort(function (a, b) {
    return (b.market_cap_rank != null) - (a.market_cap_rank != null) || a.market_cap_rank - b.market_cap_rank;
  });

  // update global
  cgArrayDictParsed = [...marketDataFiltered];

  //build cache with the coin symbols as keys
  for (const coinObject of marketDataFiltered) {
    const upperCaseSymbol = coinObject.symbol.toUpperCase();
    // add if not present already
    if (!cgArrayDict[upperCaseSymbol]) {
      cgArrayDict[upperCaseSymbol] = coinObject;
    }
    // otherwise just update the one that's there
    else {
      if (cgArrayDict[upperCaseSymbol]) {
        cgArrayDict[upperCaseSymbol] = coinObject;
      }
      // ! WARNING:
      // TODO: (MEMORY LEAK!) Need to look for symbols in the cache that no longer exist in the data received.
      // TODO:    This means they are not longer on coingecko and should be removed from the cache when seen.
      // TODO:    If left to run for a long time, residual de-listed coins will stack up in the cache unhandled (which = memory leak)
    }
  }

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
  saveCGCacheToFile();
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

function updateCoins() {
  reloaderCG.update();
  // Re-read the new set of coins
  pairs_CG_arr = JSON.parse(fs.readFileSync('./common/coinsCGtickers.json', 'utf8'));
  console.log(pc.green(pc.bold('Reloaded known coins')));
}


/* ---------------------------------

  initializeFiles()

  Reads and checks all files needed for operation

 ---------------------------------- */

function initializeFiles() {

  //allowed coin pairs data from coin gecko (ticker symbols only, as array)
  try {
    pairs_CG_arr = JSON.parse(fs.readFileSync('./common/coinsCGtickers.json', 'utf8'));
  } catch {
    fs.appendFileSync('./common/coinsCGtickers.json', '[]');
    console.log(pc.green('Automatically created new coinsCGtickers.json file.'));
    pairs_CG_arr = JSON.parse(fs.readFileSync('./common/coinsCGtickers.json', 'utf8'));
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
      process.exit();
    }
  }
  else {
    fs.appendFileSync('./common/keys.api', '{}');
    console.log(pc.yellowBright('Automatically created new keys.api file. YOU NEED TO POPULATE IT WITH YOUR API KEYS!!'));
    console.log(pc.blue('See step 3 in the first run steps at the top of main.js for how to setup this file with the needed keys'));
    process.exit();
  }
}

/* ---------------------------------

  chartServer()

  Starts a server to show TradingView chart widgets
  at http://localhost:${port}

    e.g. http://localhost:8080/ethbtc?query=sma,ema,macd,log,wide

    ---------------------------------- */

function chartServer() {
  const port = devMode ? 8086 : 8080;
  app.use(express.static(dir));
  app.get('/:ticker', function (req, res) {
    let query = [];
    if (req.query.query) {
      query = req.query.query.split(',');
    }

    const intervalKeys = ['1m', '1', '3m', '3', '5m', '5', '15m', '15', '30m', '30', '1h', '60', '2h', '120', '3h', '180', '4h', '240', '1d', 'd',
      'day', 'daily', '1w', 'w', 'week', 'weekly', '1mo', 'm', 'mo', 'month', 'monthly'];
    const intervalMap = {
      '1m': '1', '1': '1', '3m': '3', '3': '3', '5m': '5', '5': '5', '15m': '15', '15': '15', '30m': '30', '30': '30', '1h': '60',
      '60': '60', '2h': '120', '120': '120', '3h': '180', '180': '180', '4h': '240', '240': '240', '1d': 'D', 'd': 'D', 'day': 'D', 'daily': 'D', '1w': 'W',
      'w': 'W', 'week': 'W', 'weekly': 'W', '1mo': 'M', 'm': 'M', 'mo': 'M', 'month': 'M', 'monthly': 'M'
    };
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
    query.forEach(i => {
      if (intervalKeys.indexOf(i) >= 0) {
        intervalKey = i;
      }
      // checking if the user put something like "4hr" instead of just "4h"
      else if (intervalKeys.indexOf(i.substring(0, i.length - 1)) >= 0) {
        intervalKey = i.substring(0, i.length - 1);
      }
      // checking if the user put something like "5min" instead of just "5m" or "5"
      else if (intervalKeys.indexOf(i.substring(0, i.length - 2)) >= 0) {
        intervalKey = i.substring(0, i.length - 2);
      }
      if (studiesKeys.indexOf(i) >= 0) {
        selectedStudies.push('"' + studiesMap[i] + '"');
      }
    });

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
          "symbol": "${req.params.ticker}",
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
  app.listen(port, () => {
    console.log(`Chart server listening at http://localhost:${port}`);
  });
}

// Error event logging
client.on('error', (err) => {
  console.log(pc.red(pc.bold('General bot client Error. ' + pc.cyan('(Likely a connection interruption, check network connection) Here is the details:'))));
  console.error(err);
});

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

const ip = '127.0.0.1';//getLocalIP();
if (!devMode) {
  apiApp.listen(apiAppPort, () => {
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
