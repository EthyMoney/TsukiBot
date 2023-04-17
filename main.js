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

// Dev mode to disable unnecessary operations for testing
const devMode = (process.argv[2] === '-d') ? true : false;

// File read for JSON and PostgreSQL
const fs = require('fs');
const pg = require('pg');
//const pgp                 = require('pg-promise')(); // TODO: switch non-promise implementation to use this promise based one

// Scheduler
const schedule = require('node-schedule');

// Set the prefix
const prefix = ['-t', '.tb', '-T', '.TB', '.Tb', '.tB'];

// Files allowed
const extensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'mov', 'mp4'];

// Include fancy console outputs
const chalk = require('chalk');

// Read in and initialize all files
let keys, pairs_CG, pairs_CG_arr, metadata, admin, shortcutConfig, restricted, tagsJSON;
initializeFiles();

// Top.gg bot statistics reporter
const { AutoPoster } = require('topgg-autoposter');
let poster;               // Will be initialized upon startup

// HTTP stuff
const WebSocket = require('ws');

// Include API things
const { Client, GatewayIntentBits, ShardClientUtil, Permissions, EmbedBuilder } = require('discord.js');
const cc = require('cryptocompare');
const CoinMarketCap = require('coinmarketcap-api');
const ccxt = require('ccxt');
const graviex = require('graviex');
const CoinGecko = require('coingecko-api');
const NodeExr = require('currencyexchanges');
const finnhub = require('finnhub');
const Web3 = require('web3');

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

// Automatic color selector for embeds
const colorAverager = require('fast-average-color-node');

// Puppeteer for interacting with the headless server and manipulating charts
const { Cluster } = require('puppeteer-cluster');
let cluster;
chartsProcessingCluster();

// PNG image comparison tool for validating charts images
const PixelDiff = require('pixel-diff');

// Unique ID generator // TODO: (will get used in the future for scheduled actions stuff)
//const uniqid              = require('uniqid');

// CMC/CG Cache
let cmcArray = {};
let cmcArrayDict = {};
let cmcArrayDictParsed = [];
let cgArrayDictParsed = [];
let cgArrayDict = {};
let fails = 0;
let auto = true;
let selectedKey = 0;
let cacheUpdateRunning = false;
let startupProgress = 0;

// Spellcheck
const didyoumean = require('didyoumean');

// JS DOM Selections
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

// Connect to database
const conString = 'postgres://bigboi:' + keys.tsukibot + '@' + keys.dbAddress + ':5432/tsukibot';
//const connp               = pgp(conString); // TODO: switch non-promise implementation to use this promise based one

// Declare general global variables
let messageCount = 0;
let referenceTime = Date.now();
let yeetLimit = 0; // Spam limit count
let chartTagID = 0;
let globalCGSleepTimeout = 15000; // used to set sleep interval between cg cache update queries

// Initialize api things
const clientKraken = new ccxt.kraken();
const bitmex = new ccxt.bitmex();
const CoinGeckoClient = new CoinGecko();
const clientPoloniex = new ccxt.poloniex();
const clientBinance = new ccxt.binance();
const clientBittrex = new ccxt.bittrex();
const clientBitfinex = new ccxt.bitfinex2();
const clientCoinbase = new ccxt.coinbasepro();
const clientStex = new ccxt.stex();
const finnhubClient = new finnhub.DefaultApi();
const translate = new Translate({ projectId: googleProjectID, keyFilename: googleProjectApiKeyPath });
const web3eth = new Web3(`https://mainnet.infura.io/v3/${keys.infura}`);
const ExchangeRate = new NodeExr({ primaryCurrency: 'USD' });
//clientcmc will be re-initialized upon bot startup, key selection will be automatic and this selected key here is temporary
let clientcmc = new CoinMarketCap(keys.coinmarketcapfailover);
graviex.accessKey = keys.graviexAccessKey;
graviex.secretKey = keys.graviexSecretKey;
const fh_api_key = finnhub.ApiClient.instance.authentications.api_key;
fh_api_key.apiKey = keys.finnhub;

// Reload Coins
const reloaderCG = require('./getCoinsCG');

// Donation and footer stuff
const quote = 'Enjoying TsukiBot? Tell your friends!';
const botInviteAdd = '\nAdd the bot to other servers by using  `.tb invite`  for the link  :)';
const inviteLink = 'https://discordapp.com/oauth2/authorize?client_id=506918730790600704&scope=bot&permissions=268823664';

// Scheduled Actions for normal operation
if (!devMode) {
  schedule.scheduleJob('*/10 * * * *', getCMCData);      // fetch every 10 min
  schedule.scheduleJob('*/20 * * * *', getCGData);       // fetch every 20 min
  schedule.scheduleJob('*/2 * * * *', resetSpamLimit);  // reset every 2 min
  schedule.scheduleJob('0 12 * * *', updateCoins);      // update at 12 am and pm every day
  schedule.scheduleJob('*/30 * * * *', getCoin360Heatmap);   // fetch every 30 min
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

async function getPriceCoinbase(channel, coin1, coin2, author) {

  let fail = false;
  let tickerJSON = '';
  if (typeof coin2 === 'undefined') {
    coin2 = 'BTC';
  }
  if (coin2.toLowerCase() === 'usd' || coin1.toLowerCase() === 'btc' && (coin2.toLowerCase() !== 'gbp' &&
    coin2.toLowerCase() !== 'eur' && coin2.toLowerCase() !== 'dai' && coin2.toLowerCase('eth') && coin2.toLowerCase('usdc'))) {
    coin2 = 'USD';
  }

  console.log(chalk.green('Coinbase price requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1) + '/' + chalk.cyan(coin2)));

  tickerJSON = await clientCoinbase.fetchTicker(coin1.toUpperCase() + '/' + coin2.toUpperCase()).catch(function () {
    console.log(chalk.red.bold('Coinbase error: Ticker ' + chalk.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!'));
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

async function getPriceGraviex(channel, coin1, coin2, author) {

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

  console.log(chalk.green('Graviex price requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1) + '/' + chalk.cyan(coin2)));

  await graviex.ticker(coin1.toLowerCase() + coin2.toLowerCase(), function (res) {
    let moon = '';
    graviexJSON = res;
    if (typeof graviexJSON.ticker === 'undefined') {
      channel.send('Internal error. Requested pair does not exist or Graviex is overloaded.');
      console.log((chalk.red('Graviex error : graviex failed to respond.')));
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

// Function for STEX prices

async function getPriceSTEX(channel, coin1, coin2, author) {

  let fail = false;
  let tickerJSON = '';
  if (typeof coin2 === 'undefined') {
    coin2 = 'BTC';
  }
  if (coin2.toLowerCase() === 'usd' || coin1.toLowerCase() === 'btc') {
    coin2 = 'USDT';
  }

  console.log(chalk.green('STEX price requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1) + '/' + chalk.cyan(coin2)));

  tickerJSON = await clientStex.fetchTicker(coin1.toUpperCase() + '/' + coin2.toUpperCase()).catch(function () {
    console.log(chalk.red.bold('STEX error: Ticker ' + chalk.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!'));
    channel.send('API Error:  STEX does not have market symbol __' + coin1.toUpperCase() + '/' + coin2.toUpperCase() + '__ or the API failed to respond at this time.');
    fail = true;
  });
  if (fail) {
    //exit the function if ticker didn't exist, or api failed to respond
    return;
  }
  let s = parseFloat(tickerJSON.last).toFixed(8);
  s = trimDecimalPlaces(s);
  let c = tickerJSON.info.change;
  c = parseFloat(c).toFixed(2);

  let ans = '__STEX__ Price for **' + coin1.toUpperCase() + '-' + coin2.toUpperCase() + '** is: `' + s + ' ' + coin2.toUpperCase() + '` ' + '(' + '`' + c + '%' + '`' + ')' + '.';
  channel.send(ans);
}


//------------------------------------------
//------------------------------------------

// Function for Coin Gecko prices

async function getPriceCoinGecko(coin, coin2, channel, action, author) {

  // don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning) {
    channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
    console.log(chalk.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
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

  if (!noSend) console.log(chalk.green('CoinGecko price requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin) + '/' + chalk.cyan(coin2)));

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
  if (cacheUpdateRunning) {
    channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
    console.log(chalk.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
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
    console.log(chalk.redBright('Error in CMC price command processing. ') + chalk.cyanBright('Here is the trace:'));
    console.error(err);
    return;
  }

  message += (Math.random() > 0.99) ? '\n' + quote + ' ' + botInviteAdd : '';
  if (message !== '')
    channel.send(messageHeader + message).catch((err) => {
      console.log(chalk.redBright('Error sending response message in CMC price command...') + chalk.cyanBright('Here is the trace:'));
      console.error(err);
    });
}


//------------------------------------------
//------------------------------------------

// Function for CoinGecko prices 
// (in similar format the list-style cmc command above)

function getPriceCG(coins, channel, action = '-', ext = 'd', tbpaIgnoreMultiTickers = false, interaction) {

  // don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning) {
    if (interaction) {
      interaction.reply(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      return;
    }
    else {
      channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      console.log(chalk.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
      return;
    }
  }

  // check for no input
  if (coins.length == 0) {
    return;
  }

  console.log(chalk.magentaBright('Incoming coins for call:'), chalk.cyanBright(coins));

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
        console.log(chalk.redBright(`ERR in CG price command: Selected coin object came up as undefined for: ${coins[i]}`));
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
      console.log(chalk.magenta('Oversize tbpa notification sent to user above. Size overflow message: ') + chalk.cyan(message.length));
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

function getPriceCC(coins, channel, author, ext = 'd') {

  console.log(chalk.green('CryptoCompare price(s) requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coins.toString())));
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
        } catch (e) {
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

  console.log(chalk.green('Bitfinex price requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1) + '/' + chalk.cyan(coin2)));

  tickerJSON = await clientBitfinex.fetchTicker(coin1.toUpperCase() + '/' + coin2.toUpperCase()).catch(function () {
    //if re-attempted call failed, exit due to error
    if (coin2Failover) {
      console.log(chalk.red.bold('Bitfinex error: Ticker ' + chalk.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!'));
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

async function getPriceKraken(coin1, coin2, channel, author) {

  let fail = false;
  let tickerJSON = '';
  if (typeof coin2 === 'undefined') {
    coin2 = 'BTC';
  }
  if (coin2.toLowerCase() === 'usd' || coin1.toLowerCase() === 'btc' && (coin2.toLowerCase() !== 'cad' && coin2.toLowerCase() !== 'eur')) {
    coin2 = 'USD';
  }

  console.log(chalk.green('Kraken price requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1) + '/' + chalk.cyan(coin2)));

  tickerJSON = await clientKraken.fetchTicker(coin1.toUpperCase() + '/' + coin2.toUpperCase()).catch(function () {
    console.log(chalk.red.bold('Kraken error: Ticker ' + chalk.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!'));
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

async function getPriceMex(coin1, coin2, channel, author) {

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

    console.log(chalk.green('BitMEX price requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1) + '/' + chalk.cyan(coin2)));

    tickerJSON = await bitmex.fetchTicker(pair).catch(function () {
      console.log(chalk.red.bold('BitMEX error: Ticker ' + chalk.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!'));
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

async function getPricePolo(coin1, coin2, channel, author) {

  let fail = false;
  let tickerJSON = '';
  if (typeof coin2 === 'undefined') {
    coin2 = 'BTC';
  }
  if (coin2.toLowerCase() === 'usd' || coin1.toLowerCase() === 'btc' && (coin2.toLowerCase() !== 'eth' &&
    coin2.toLowerCase() !== 'usdc' && coin2.toLowerCase() !== 'trx' && coin2.toLowerCase() !== 'xrp')) {
    coin2 = 'USDT';
  }

  console.log(chalk.green('Poloniex price requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1) + '/' + chalk.cyan(coin2)));

  tickerJSON = await clientPoloniex.fetchTicker(coin1.toUpperCase() + '/' + coin2.toUpperCase()).catch(function () {
    console.log(chalk.red.bold('Poloniex error: Ticker ' + chalk.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!'));
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

async function getPriceBinance(coin1, coin2, channel, author) {

  let fail = false;
  let tickerJSON = '';
  if (typeof coin2 === 'undefined') {
    coin2 = 'BTC';
  }
  if (coin2.toLowerCase() === 'usd' || coin1.toLowerCase() === 'btc' && (coin2.toLowerCase() !== 'bnb' &&
    coin2.toLowerCase() !== 'eth' && coin2.toLowerCase() !== 'trx' && coin2.toLowerCase() !== 'xrp')) {
    coin2 = 'USDT';
  }

  console.log(chalk.green('Binance price requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1) + '/' + chalk.cyan(coin2)));

  tickerJSON = await clientBinance.fetchTicker(coin1.toUpperCase() + '/' + coin2.toUpperCase()).catch(function () {
    console.log(chalk.red.bold('Binance error: Ticker ' + chalk.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!'));
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

async function getPriceBittrex(coin1, coin2, channel, author) {

  let fail = false;
  let tickerJSON = '';
  if (typeof coin2 === 'undefined') {
    coin2 = 'BTC';
  }
  if (coin2.toLowerCase() === 'usdt' || coin1.toLowerCase() === 'btc' && (coin2.toLowerCase() !== 'eth')) {
    coin2 = 'USD';
  }

  console.log(chalk.green('Bittrex price requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1) + '/' + chalk.cyan(coin2)));

  tickerJSON = await clientBittrex.fetchTicker(coin1.toUpperCase() + '/' + coin2.toUpperCase()).catch(function () {
    console.log(chalk.red.bold('Bittrex error: Ticker ' + chalk.cyan(coin1.toUpperCase() + '/' + coin2.toUpperCase()) + ' not found!'));
    channel.send('API Error:  Bittrex does not have market symbol __' + coin1.toUpperCase() + '/' + coin2.toUpperCase() + '__');
    fail = true;
  });
  if (fail) {
    //exit the function if ticker didn't exist, or api failed to respond
    return;
  }
  let s = parseFloat(tickerJSON.last).toFixed(8);
  s = trimDecimalPlaces(s);

  let ans = '__Bittrex__ Price for **' + coin1.toUpperCase() + '-' + coin2.toUpperCase() + '** is: `' + s + ' ' + coin2.toUpperCase() + '`.';
  channel.send(ans);
}


//------------------------------------------
//------------------------------------------

// Function for grabbing prices of stocks using Finnhub

async function getStocks(coin1, channel, author) {

  console.log(chalk.green('Finnhub stocks requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1)));

  finnhubClient.quote(coin1.toUpperCase(), (error, data) => {
    if (error || (data.o == 0 && data.c == 0)) {
      channel.send(`Error: Ticker **${coin1.toUpperCase()}** not found or API failed to respond.`);
      console.log(`${chalk.red('Finnhub API call error for ticker:')} ${chalk.cyan(coin1.toUpperCase())}`);
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
    channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
    console.log(chalk.magentaBright('Attempted use of coin description command prior to initialization. Notification sent to user.'));
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
            console.log(chalk.red('Error sending coin info response: ' + chalk.cyan(reject)));
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
              console.log(chalk.red('Error sending coin info response: ' + chalk.cyan(reject)));
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
        console.log(chalk.red('Error sending fear/greed index! : ' + chalk.cyan(reject)));
      });
    }
  }
  else {
    console.log(chalk.red('Issue fetching fear/greed index: ' + res.status));
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
          console.log(chalk.red('Error sending bitmex funding! : ' + chalk.cyan(reject)));
        });
      }
    }
  });
}


//------------------------------------------
//------------------------------------------

// Grabs the current data for Binance long and short positions

async function getBinanceLongsShorts(channel, author, interaction) {

  //console.log(chalk.green('Binance longs/shorts requested by ' + chalk.yellow(author.username)));

  // First, let's grab the data from the page, which includes the HTML we want
  const res = await fetch('http://blockchainwhispers.com/bitmex-position-calculator').catch(function (error) {
    // handle error
    console.log(chalk.redBright('Longs/shorts command failed to collect data! Response details: \n' + chalk.yellow(error)));
    if (interaction) {
      interaction.reply('Sorry, there was an issue processing the longs/shorts command at this time. Try again later!');
      return;
    }
    else {
      channel.send('The longs/shorts command is having issues at the moment. This has been logged and will be looked into. Try again later!');
      return;
    }
  });
  if (res.ok) {
    const data = await res.text();
    // Using the HTML of the page, make a new DOM object that we can navigate
    const dom = new JSDOM(data);
    // Response may have unexpected output as it relies on the site not changing. We'll be cautious and look for problems here
    try {
      // Grabbing all exchange data from selected class name
      const block = dom.window.document.getElementsByClassName('col-lg-3 col-sm-6 col-12 hover-up-block');
      // block index 0 is finex, 1 is mex, 2 is binance, 3 is total for all of them together (currently using mex as written "block[1]")
      const title = block[2].querySelector('div:nth-child(1) > h6:nth-child(1)').textContent;
      const longsPercent = block[2].querySelector('div:nth-child(1) > span:nth-child(2)').textContent.trim().split(' ')[0].trim();
      const longs = block[2].querySelector('div:nth-child(2) > span:nth-child(1)').textContent;
      const shorts = block[2].querySelector('div:nth-child(3) > div:nth-child(2) > span:nth-child(1)').textContent.trim().split(' ')[0].trim();
      const shortsPercent = block[2].querySelector('div:nth-child(3) > div:nth-child(1) > span:nth-child(2)').textContent;
      // If all is good, assemble the embed object and send it off
      const embed = new EmbedBuilder()
        .setAuthor({ name: title, iconURL: 'https://en.bitcoin.it/w/images/en/2/29/BC_Logo_.png' })
        .addFields(
          { name: 'Longs:', value: longs + ' (' + longsPercent + ')', inline: false },
          { name: 'Shorts:', value: shorts + ' (' + shortsPercent + ')', inline: false }
        )
        .setThumbnail('https://cryptologos.cc/logos/binance-coin-bnb-logo.png?v=014')
        .setColor('#1b51be')
        .setFooter({ text: 'BlockchainWhispers Real-Time', iconURL: 'https://blockchainwhispers.com/images/bw.png' });
      if (interaction) {
        interaction.reply({ embeds: [embed] });
      }
      else {
        channel.send({ embeds: [embed] }).catch(function (reject) {
          channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
          console.log(chalk.red('Error sending longs/shorts! : ' + chalk.cyan(reject)));
        });
      }
    }
    catch (err) {
      // Check for errors during data parsing and report them
      console.log(chalk.redBright('Longs/shorts command failed to process data! Error details: \n' + chalk.yellow(err.stack)));
      if (interaction) {
        interaction.reply('Sorry, there was an issue processing the longs/shorts command at this time. Try again later!');
        return;
      }
      else {
        channel.send('The longs/shorts command is having issues at the moment. This has been logged and will be looked into shortly.');
        return;
      }
    }
  }
}


//------------------------------------------
//------------------------------------------

// Function that converts value of one coin into value in terms of another coin using CG prices

function priceConversionTool(coin1, coin2, amount, channel, author, interaction) {

  const fiatPairs = ['USD', 'CAD', 'EUR', 'AED', 'JPY', 'CHF', 'CNY', 'GBP', 'AUD', 'NOK', 'KRW', 'JMD', 'RUB', 'INR', 'PHP',
    'HKD', 'TWD', 'BRL', 'THB', 'MXN', 'SAR', 'SGD', 'SEK', 'IDR', 'ILS', 'MYR', 'VND', 'PLN', 'TRY', 'CLP', 'EGP', 'ZAR', 'NZD',
    'DKK', 'CZK', 'COP', 'MAD', 'QAR', 'PKR', 'LBP', 'KWD'];

  // Remove potential commas in amount
  if (amount) amount = amount.replace(/,/g, '');

  // Validate user input
  if (!coin1 || !coin2 || !amount || isNaN(amount)) {
    if (amount && isNaN(amount)) {
      if (interaction) {
        interaction.reply('Invalid amount! Please enter a valid amount!');
      }
      else {
        channel.send('Invalid amount entered.');
      }
    }
    if (!interaction) {
      // show help message and then exit if wrong input is provided
      channel.send('**Here\'s how to use the currency conversion command:**\n ' +
        ':small_blue_diamond: Format: `.tb cv <quantity> <FROM coin> <TO coin>`\n ' +
        ':small_blue_diamond: Examples: `.tb cv 20 eth usd`  `.tb cv 10 usd cad`\n ' +
        ':small_blue_diamond: Supported cryptos: `All CoinGecko-listed coins`\n ' +
        ':small_blue_diamond: Supported fiat currencies: `' + fiatPairs + '`');
    }
    return;
  }

  // Don't let command run if cache is still updating for the first time
  if (cacheUpdateRunning) {
    if (interaction) {
      interaction.reply(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      return;
    }
    else {
      channel.send(`I'm still completing my initial startup procedures. Currently ${startupProgress}% done, try again in a moment please.`);
      console.log(chalk.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
      return;
    }
  }

  // Setup
  coin1 = coin1.toUpperCase() + '';
  coin2 = coin2.toUpperCase() + '';
  let isForexPairingCoin1 = false;
  let isForexPairingCoin2 = false;
  let forexRates = null; // will hold our rates if needed to be collected below

  //console.log(chalk.green('Currency conversion tool requested by ' + chalk.yellow(author.username) + ' for ' + chalk.cyan(coin1) + ' --> ' + chalk.cyan(coin2)));

  // Collect our forex pairs and then proceed with that data
  ExchangeRate.getBulkExchangeRates(fiatPairs).then(async rates => {
    forexRates = rates;
    if (fiatPairs.includes(coin1)) {
      isForexPairingCoin1 = true;
    }
    if (fiatPairs.includes(coin2)) {
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
        interaction.reply(builtMessage);
      }
      else {
        channel.send(builtMessage);
      }
    }
    else {
      if (!interaction) {
        interaction.reply('One or more of your coins were not found on CoinGecko or available fiat pairs. Check your input and try again!');
      }
      else {
        channel.send('One or more of your coins were not found on CoinGecko or available fiat pairs. Check your input and try again!' + '\nIf you need help, just use `.tb cv` to see the guide for this command.');
      }
    }
  }).catch(err => {
    console.error('Issue with currency conversion command! Details: ' + err);
    return;
  });
}


//------------------------------------------
//------------------------------------------

// Tags handler function

function tagsEngine(channel, author, timestamp, guild, command, tagName, tagLink) {

  console.log(chalk.green('Tags engine called by ' + chalk.yellow(author.username) + ' with command:tagname:link ' + chalk.cyan(command) + ':' + chalk.cyan(tagName) + ':' + chalk.cyan(tagLink)));

  let valid = false;
  let validTag = false;
  let name = null;
  let tag = null;
  let resultName = null;
  let resultTag = null;
  let resultAuthorName = null;
  let resultAuthorAvatar = null;
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
        authorAvatar: author.avatarURL(),
        timestamp: timestamp,
        tagName: name,
        tagLink: tag
      }); //add a fresh tag
      let json = JSON.stringify(obj); //convert it back to json
      fs.writeFileSync('tags.json', json, 'utf8');
      tagsJSON = JSON.parse(fs.readFileSync('tags.json', 'utf8')); //read and reload the tags cache
      console.log(chalk.blue('Tag ' + '"' + tagName + '"' + ' created!'));
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
          console.log(chalk.blue('Tag ' + '"' + chalk.yellow(tagName) + '"' + ' deleted!'));
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
          .setAuthor({ name: 'Tsuki Tags', iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/OneDrive_Folder_Icon.svg/1024px-OneDrive_Folder_Icon.svg.png' })
          .addFields(
            { name: 'Available tags in this server: ', value: message.substring(0, message.length - 2), inline: false }
          )
          .setColor('#1b51be')
          .setFooter({ text: 'To see a tag, use  .tb tag <tag name here>' });

        channel.send({ embeds: [embed] }).catch(function (reject) {
          channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
          console.log(chalk.red('Error sending taglist! : ' + chalk.cyan(reject)));
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
              .setAuthor({ name: 'Tsuki Tags', iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/OneDrive_Folder_Icon.svg/1024px-OneDrive_Folder_Icon.svg.png' })
              .addFields(
                { name: 'Available tags in this server (PAGE ' + blockCursor + '): ', value: element.substring(0, element.length - 2), inline: false }
              )
              .setColor('#1b51be')
              .setFooter({ text: 'To see a tag, use  .tb tag <tag name here>' });

            channel.send({ embeds: [embed] }).catch(function (reject) {
              channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
              console.log(chalk.red('Error sending taglist! : ' + chalk.cyan(reject)));
            });
          }

          else {
            const embed = new EmbedBuilder()
              .setAuthor({ name: 'Tsuki Tags', iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/OneDrive_Folder_Icon.svg/1024px-OneDrive_Folder_Icon.svg.png' })
              .addFields(
                { name: 'Available tags in this server (PAGE ' + blockCursor + '): ', value: element, inline: false }
              )
              .setColor('#1b51be')
              .setFooter({ text: 'To see a tag, use  .tb tag <tag name here>' });

            channel.send({ embeds: [embed] }).catch(function (reject) {
              channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
              console.log(chalk.red('Error sending taglist! : ' + chalk.cyan(reject)));
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

    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Tsuki Tags', iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/OneDrive_Folder_Icon.svg/1024px-OneDrive_Folder_Icon.svg.png' })
      .addFields(
        { name: 'Tag: "' + resultName + '"', value: resultTag, inline: false }
      )
      .setImage(resultTag)
      .setColor('#1b51be')
      .setTimestamp(resultTimestamp)
      .setFooter({ text: resultAuthorName, iconURL: resultAuthorAvatar });

    channel.send({ embeds: [embed] }).catch(function (reject) {
      channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
      console.log(chalk.red('Error sending tag! : ' + chalk.cyan(reject)));
    });

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
    console.log(chalk.green(`Etherscan balance lookup called in: ${chalk.cyan(channel.guild.name)} by ${chalk.yellow(author.username)}`));
    const res = await fetch(`https://api.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest&apikey=${keys.etherscan}`);
    if (res.ok) {
      const balance = await res.json();
      channel.send(`The total ether registered for ${address} is: \`${balance.result / 1000000000000000000} ETH\`.`);
    }
    else {
      console.log(chalk.red('Issue fetching account balance from etherscan:'), res.status);
      channel.send('There\'s an issue with fetching account balance from etherscan. Please try again later.');
      return;
    }
  } else if (action === 'ens') {
    web3eth.eth.ens.getOwner(address).then(function (owner) {
      // check for unregistered ENS name, and then send not found notification and ENS link to potentially register that name
      if (owner == '0x0000000000000000000000000000000000000000') {
        console.log(chalk.green(`Etherscan ENS registration sent for ${chalk.yellow(address)} in ${chalk.cyan(channel.guild.name)}`));
        const addy = 'https://app.ens.domains/name/' + address;
        const embed = new EmbedBuilder()
          .setTitle('That ENS name is not yet registered!')
          .setDescription(`Want to make it yours?  [CLICK HERE!](${addy})`)
          .setThumbnail('https://imgur.com/jUMEIgL.png')
          .setColor('#1b51be');
        channel.send({ embeds: [embed] }).catch(function (reject) {
          channel.send('Sorry, I was unable to process this command. Make sure that I have full send permissions for embeds and messages and then try again!');
          console.log(chalk.red(`Error sending etherscan command's ENS not found message embed! : ${chalk.cyan(reject)}`));
        });
      }
      else {
        getEtherBalance(author, owner, channel);
      }
    });
  }
  else {
    console.log(chalk.green(`Etherscan txn lookup called in: ${chalk.cyan(channel.guild.name)} by ${chalk.yellow(author.username)}`));
    const res = await fetch(`https://api.etherscan.io/api?module=proxy&action=eth_blockNumber&apikey=${keys.etherscan}`);
    const res2 = await fetch(`https://api.etherscan.io/api?module=proxy&action=eth_getTransactionByHash&txhash=${address}&apikey=${keys.etherscan}`);
    if (res.ok && res2.ok) {
      const block = await res.json();
      const tx = await res2.json();
      if (tx.result !== null) {
        if (tx.result.blockNumber !== null) {
          channel.send('Transaction included in block `' + Web3.utils.hexToNumber(tx.result.blockNumber) + '`.' +
            (block.result ? ' Confirmations: `' + (1 + Web3.utils.hexToNumber(block.result) - Web3.utils.hexToNumber(tx.result.blockNumber)) + '`' : ''));
        } else {
          channel.send('Transaction not yet mined.');
        }
      } else {
        channel.send('Transaction not found. (Neither mined nor broadcasted.)');
      }
    }
    else {
      console.log(chalk.red('Issue fetching transaction details from etherscan:'), res.status, res2.status);
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

  const res = await fetch(`https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${keys.etherscan}`)
    .catch(function (error) {
      // handle fetch error
      console.log(chalk.red('Error encountered during fetch for Etherscan gas command:', error));
      channel.send('Sorry, there is temporarily an issue with the gas command. Try again later.');
    });
  if (res.ok) {
    const data = await res.json();
    // assemble the final message as message embed object
    const embed = new EmbedBuilder()
      .setTitle('Ethereum Gas Tracker')
      .addFields(
        { name: 'Slow:', value: `${data.result.SafeGasPrice} gwei\n~ 10 minutes \u200B\u200B`, inline: true },
        { name: 'Average:', value: `${data.result.ProposeGasPrice} gwei\n~ 3 minutes \u200B\u200B`, inline: true },
        { name: 'Fast:', value: `${data.result.FastGasPrice} gwei\n~ 30 seconds \u200B\u200B`, inline: true }
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
      console.log(chalk.red('Error sending eth gas response embed: ' + chalk.cyan(reject)));
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
    console.log(chalk.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
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

  console.log(chalk.green('CoinGecko biggest movers command called in: ' + chalk.yellow(channel.guild.name) + ' by ' + chalk.yellow(author.username)));
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
        attachment: 'chartscreens/hmap.png',
        name: 'hmap.png'
      }]
    });
  }
  else {
    message.channel.send({
      files: [{
        attachment: 'chartscreens/hmap.png',
        name: 'hmap.png'
      }]
    }).catch(function (error) {
      console.log(chalk.red('Error sending hmap image:', error));
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
      console.log(chalk.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
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
      console.log(chalk.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
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
            console.log(chalk.red('Error sending MC response embed: ' + chalk.cyan(reject)));
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
        console.log(chalk.red(`Failed to find matching coin for input to mc command of: ${chalk.cyan(cur)}`));
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
      console.log(chalk.magentaBright('Attempted use of CG command prior to initialization. Notification sent to user.'));
      return;
    }
  }

  const conn = new pg.Client(conString);
  conn.connect();

  // delete .tbpa command after 5 min (optional)
  // message.delete({ timeout: 300000 });

  // look for action within the provided coins list (for in case the user didn't use shortcut call like they should have)
  if (coins[0] == '+') {
    action = coins.shift();
  }
  else if (coins[0] == '-') {
    action = coins.shift();
  }

  // .tbpa call (display action)
  if (coins === '') {
    conn.query('SELECT * FROM tsukibot.profiles where id = $1;', [id], (err, res) => {
      if (err) { console.log(chalk.red.bold((err + '------TBPA query select error'))); }
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
          } catch (e) {
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
        if (err) { console.log(chalk.red.bold((err + '------TB PA query insert error'))); }
        else { channel.send('Personal array set: `' + coins.toLowerCase() + '` for <@' + id + '>.' + invalidCoinsMessage); }
        conn.end();
      });

      // edit existing tbpa list
    } else {
      const command = (action === '-') ? 'REMOVE' : 'ADD';
      conn.query('SELECT * FROM tsukibot.profiles where id = $1;', [id], (err, res) => {
        if (err) { console.log(chalk.red.bold(err + '------TB PA query select error')); }
        else {
          let inStr = '';
          if (res.rows[0]) {
            console.log(chalk.green('tbpa modification (' + chalk.cyan(command) + ' started of raw array: ' + chalk.cyan(res.rows[0].coins.replace(/\s+/g, ''))));
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
                if (err) { console.log(chalk.red.bold(err + '------TB PA remove insert query error')); }
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
                if (err) { console.log(chalk.red.bold(err + '------TB PA add insert query error')); }
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
client.on('ready', () => {

  if (keys.dbl == 'yes') {
    // Create Top.gg posting process using the bot client
    // Bot stats will be reported automatically every 30 minutes with this
    poster = AutoPoster(keys.dbots, client);
    poster.on('error', (err) => {
      // Catch issues with Top.gg updater
      console.log(chalk.yellow('Top.gg poster failed to update due to the following error:  ' + chalk.cyan(err)));
    });
  }

  console.log(chalk.yellow('------------------------------------------------------ ' + chalk.greenBright('Bot Start') + ' ------------------------------------------------------'));
  console.log(chalk.green('                                                    Active Shards: ' + chalk.blue(clientShardHelper.count)));

  // Show dev mode active status
  if (devMode) console.log(chalk.yellow('Dev mode active!'));

  // Display help command on bot's status
  client.user.setActivity('/help', { type: 'WATCHING' });

  // First run of scheduled executions
  updateCoins();
  updateCmcKey();
  getCMCData();
  getCGData('firstrun');
  cacheUpdateRunning = true; // prevents the scheduler from creating an overlapping process with the first run
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
      console.log(chalk.yellow('Failed to send help text to ' + author.username + ' via DM, sent link in server instead.'));
      message.reply('I tried to DM you the commands but you don\'t allow DMs. Hey, it\'s cool, I\'ll just leave the link for you here instead: \n' + link).then(function () {
        fail = true;
      });
    });
    // wait for promises to resolve
    setTimeout(function () {
      if (!fail) {
        message.reply('I sent you a DM with a link to my commands!').catch(function () {
          console.log(chalk.red('Failed to reply to tbhelp message in chat!'));
          fail = true;
        });
      }
    }, 1000);
    setTimeout(function () {
      if (!fail) {
        console.log(chalk.green('Successfully sent help message to: ' + chalk.yellow(author.username)));
      }
    }, 1800);
  } else {
    message.channel.send('Command not recognized. Use `.tb help` to see the commands and their usage. \n' +
      'Keep in mind that commands follow this format: `.tb <command> <parameter(s)>`');
  }
}

// Sends the help command reminder and creates file permission role upon being added to a new server
client.on('guildCreate', guild => {
  //joinProcedure(guild);
});

// Log when a server removes the bot
client.on('guildDelete', guild => {
  if (guild && guild.name) {
    console.log(chalk.redBright('A SERVER HAS LEFT THE FAMILY :(  Goodbye: ' + chalk.cyan(guild.name)));
  }
});



/////////////////////////////////////////////////////
/////////////////////////////////////////////////////
//                                                 //
//             MESSAGE EVENT HANDLER               //
//                                                 //
/////////////////////////////////////////////////////
/////////////////////////////////////////////////////


// This is triggered for every message that the bot sees
client.on('messageCreate', async message => {

  // Developer mode
  if (process.argv[2] === '-d' && message.author.id !== '210259922888163329')
    return;

  // Check for Ghost users
  if (message.author === null) return;

  // Check for bot users (we ignore other bots, including ourself)
  if (message.author == client.user || message.author.bot) {
    return;
  }

  // Keep a counter of messages
  messageCount = (messageCount + 1) % 10000;
  if (messageCount === 0) referenceTime = Date.now();
  //  if(messageCount % 100 === 0){
  //  console.log(chalk.green("messages so far: " + chalk.cyan(messageCount)));}


  // Special features for Spacestation server. Don't worry about these, they are only for the official bot to use.
  if (message.guild && message.guild.id === '290891518829658112') {
    // bad words cleanup
    let found = false;
    for (let i = 0, len = restricted.length; i < len; i++) {
      if (message.content.includes(restricted[i])) { found = true; }
    }
    if (found) {
      message.delete({ timeout: 0, reason: 'Naughty words' }).catch(function (reject) {
        console.log(chalk.red('Failed to delete banned word from user: ' + chalk.yellow(message.author.username) + ' in server: ' + chalk.cyan(message.guild.name) + ' Due to rejection: ' + chalk.cyan(reject)));
      });
      console.log(chalk.cyan('deleted banned word from ' + chalk.yellow(message.author.username)));
    }
    // frostwalker welcome message cleanup
    if (message.channel.name === 'rules-and-information' && message.author.id === '205190545914462208') {
      message.delete({ timeout: 5000, reason: 'Cleanup' }).catch(function (err) {
        console.log(chalk.red('Failed to delete frostwalker user mention in new users channel of SS due to the following: ' + err));
      });
    }
    // ignore commands from new users
    await message.guild.members.fetch(message.author).then(function (member) {
      if (member && false === (member.roles.cache.some(r => r.name == 'Node +2') && member.joinedTimestamp < (Date.now() - 7200000))) {
        console.log(chalk.blue('Ignoring command from new user in SS: ') + chalk.yellow(message.author.username));
        message.content = 'skipped';
        return;
      }
    });
  }

  // Check for unsafe files and delete them if author doesn't have the File Perms role
  if (message.guild) {
    message.guild.members.fetch(message.author).then(function (member) {
      if (member && member.roles.cache.some(r => ['File Perms', 'File Perm', 'File perm', 'file perms'].includes(r.name))) {
        // file perms found, skipping file extension check.
      }
      else {
        // file perms missing, checking for files and verifying extensions.
        for (let a of message.attachments) {
          if (extensions.indexOf((ar => ar[ar.length - 1])(a[1].filename.split('.')).toLowerCase()) === -1) {
            /*jshint -W083 */
            message.delete({ timeout: 10, reason: 'Detected potential dangerous file' })
              .then(message => console.log(chalk.yellow(`Deleted file message from ${message.author.username}` + ' : ' + message.author)))
              .catch(function (reject) {
                console.log(chalk.red('Failed to delete unsafe file from user: ' + chalk.yellow(message.author.username) + ' in server: ' + chalk.cyan(message.guild.name) + ' Due to rejection: ' + chalk.cyan(reject)));
              });
            return;
          }
        }
      }
    }).catch(() => (0)); // Ignore the API "unknown user" error that sometimes shows. This is a false error and the action still completes normally.
  }

  // Check for, and ignore DM channels (this is a safety precaution)
  if (message.channel.type !== 'GUILD_TEXT') return;

  // Internal bot admin controls (For official bot use only. You can ignore this.)
  if (message.author.id === '210259922888163329' && (keys.dbl == 'yes' || process.argv[2] === '-d')) {
    const adminMessage = message.content.toLowerCase();
    if (adminMessage.includes(admin['1'])) {
      if (auto) {
        message.channel.send('Already set to auto.');
      }
      else {
        auto = true;
        updateCmcKey();
        message.channel.send(admin['11'] + selectedKey);
        getCMCData();
      }
    }
    if (adminMessage.includes(admin['2'])) {
      auto = false;
      updateCmcKey(message.content.split(' ').slice(-1));
      message.channel.send(admin['22'] + selectedKey);
      getCMCData();
    }
    if (adminMessage.includes(admin['3'])) {
      message.channel.send(admin['33'] + selectedKey);
    }
    if (adminMessage.includes(admin['4'])) {
      keys = JSON.parse(fs.readFileSync('./common/keys.api', 'utf8'));
      message.channel.send(admin['44']);
      updateCmcKey();
      getCMCData();
    }
    if (adminMessage.includes(admin['5'])) {
      if (cmcArrayDictParsed.length) {
        message.channel.send(admin['55'] + cmcArrayDictParsed.length);
      }
      else {
        message.channel.send('Error: CMC cache is empty. There is likely an issue with the current CMC key!');
      }
      if (cgArrayDictParsed.length) {
        message.channel.send(admin['66'] + cgArrayDictParsed.length);
      }
      else {
        message.channel.send('Error: CG cache is empty. Cacher may still be initializing or there may be an API issue.');
      }
    }
  }

  // Forward message to the commands processor (but only if send message perms are allowed to the bot)
  if (message.guild.me.permissionsIn(message.channel).has(Permissions.FLAGS.SEND_MESSAGES) && message.content !== 'skipped') {
    // message.channel.send('PREFIX STYLE COMMANDS LIKE THIS WILL STOP WORKING IMMINENTLY! START USING SLASH COMMANDS NOW!\nUse a / now instead of what you\'ve been using. For example, `.tbc` is now `/c`. Try it out!');
    commands(message);
  }
});


//? OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOHHHHH
//! ----------------------------------------------------
//! ----------------------------------------------------
//! ----------------------------------------------------
//! ----------------------------------------------------
//! ----------------------------------------------------
//! ----------------------------------------------------
//! ----------------------------------------------------
//! ----------------------------------------------------
//? OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOHHHHH

// this is the new interaction hell for slash commands of modern discord
// I hate these, but here it is

client.on('interactionCreate', async interaction => {
  if (interaction.user.bot) return; // ignore bots


  const command = interaction.commandName;

  console.log('incoming command:', command);
  console.log('opts', interaction.options._hoistedOptions);

  //! charts
  //* WORKING
  if (command === 'c') {
    interaction.deferReply(); // wait actual commands to process and reply later!
    let optsString = '';
    if (interaction.options._hoistedOptions) {
      optsString = interaction.options._hoistedOptions.map(opt => opt.value).join(' ').toLowerCase();
    }
    if (chartTagID > 25) {
      chartTagID = 1;
    }
    // Build data object for the cluster task
    const data = {
      'message': '',
      'interaction': interaction,
      'args': ('.tbc ' + optsString).split(' '),
      'chartMessage': '',
      'attempt': 1,
      'chartID': ++chartTagID
    };
    // Send the request to the cluster queue
    cluster.queue(data);

    //! cg prices
    //* WORKING
  } else if (command === 'cg') {
    getPriceCG(interaction.options._hoistedOptions[0].value.split(' '), null, '-', 'd', false, interaction);

    //! stats
    //* WORKING
  } else if (command === 'stats') {
    postSessionStats(null, interaction);

    //! help
    //* WORKING
  } else if (command === 'help') {
    postHelp(null, null, null, interaction);

    //! fg
    //* WORKING
  } else if (command === 'fg') {
    getFearGreedIndex(null, null, interaction);

    //! funding
    //* WORKING
  } else if (command === 'funding') {
    interaction.deferReply();
    getMexFunding(null, null, interaction);

    //! longs/shorts
    //* WORKING
  } else if (command === 'ls') {
    getBinanceLongsShorts(null, null, interaction);

    //! gas
    //* WORKING
  } else if (command === 'gas') {
    getEtherGas(null, null, interaction);

    //! heatmap
    //* PARTIALLY WORKING //
    //TODO fix the screenshot cleanup, need to remove more elements
  } else if (command === 'hmap') {
    sendCoin360Heatmap(null, interaction);

    //! info
    //* PARTIALLY WORKING //
    //TODO find a workaround for the multi-message reply, we can currently only send the first message and the rest error out because the interaction has already been replied to...
  } else if (command === 'info') {
    getCoinDescription(interaction.options._hoistedOptions[0].value.toUpperCase(), null, null, interaction);

    //! mc
    //* PARTIALLY WORKING //
    //TODO Same issue as above, find a workaround for the multi-message reply, we can currently only send the first message and the rest error out because the interaction has already been replied to...
    //? maybe try to ask user if they want them all? Idk, we really don't need all to send, but we need preference selection set up for which they want of the same ticker
  } else if (command === 'mc') {
    if (interaction.options._hoistedOptions.length === 0) {
      getMarketCap(null, interaction); // base global mc call
    }
    else {
      getMarketCapSpecific(interaction.options._hoistedOptions[0].value.toUpperCase(), interaction); // specific mc call
    }

    //! conversion
    //* WORKING
  } else if (command === 'convert') {
    priceConversionTool(interaction.options._hoistedOptions[1].value, interaction.options._hoistedOptions[2].value, interaction.options._hoistedOptions[0].value, null, null, interaction);

    //! translation
    //* WORKING
  } else if (command === 'translate') {
    translateEN(null, interaction.options._hoistedOptions[0].value, interaction);

    //! tbpa call
    //* WORKING
  } else if (command === 'tbpa') {
    getCoinArray(interaction.user.id, null, null, '', null, interaction);

    //! tbpa-add call
    //* WORKING
  } else if (command === 'tbpa-add') {
    getCoinArray(interaction.user.id, null, null, [interaction.options._hoistedOptions[0].value], 'ADD', interaction);

    //! tbpa-remove call
    //* WORKING
  } else if (command === 'tbpa-remove') {
    getCoinArray(interaction.user.id, null, null, [interaction.options._hoistedOptions[0].value], '-', interaction);
  }
});




/* -------------------------------------------------------

  This is the commands function. Every message that the bot
  receives that passed through the previous tests and
  filtering of the message event handler will be forwarded
  to here. This function receives that forwarded message
  as well as a Boolean that states if the message author
  has a botAdmin role assigned to them.

  This function has a LOT going on here. It's in charge
  of doing the heavy lifting to format and route incoming
  message traffic to the correct commands.

  To make what's going on here a little easier to
  read, we will split up all the input processing into
  labeled sections below. Sections 1, 2, and 3.

  *SECTION 1: Handles commands that take no parameters.
  These have the usage format [prefix] [command]

  *SECTION 2: Handles commands with one or more parameters.
  The parameters received for these commands
  get broken up and placed into an array called code_in
  for easier processing and organization.
  These commands have the usage format
  [prefix] [command] [parameter(s)].

  *SECTION 3: Handles shortcut commands
  This section takes care of the shortcut commands
  and some of the other random addon commands. These
  command calls will have no spaces in their input
  and don't take parameters unless otherwise stated.
  These calls typically consist of the prefix and a
  short phrase or letter right next to it that
  represents the command. These have the usage format
  [prefix][command/symbol] (remember, no spaces at all)

  Side note:
  Sections 1 and 2 will default to posting the commands
  help message if the provided command is not recognized
  or the input is invalid. This message contains the
  suggestion to use the ".tb help" command to get a link to
  the commands documentation on GitHub. This document can
  be found in "common/commands.md" for your reference.
  Section 3 does NOT have this verification in place. The
  bot will simply ignore the message and not do anything
  if the checks for shortcut commands fails.

  Got the hang of it now? Let’s do this! I clearly
  labeled each of the sections below so you don't get too lost :)


 ------------------------------------------------------- */


function commands(message) {

  // Get the channel where the bot will answer.
  const channel = message.channel;

  // Get the guild(server) id of the message
  const guildID = message.guild.id;

  // Integrated Market Cap functionality
  if (message.content.toUpperCase() === 'MC') {
    getMarketCap(message);
    return;
  }
  // Check if message requests a specific coin (market cap)
  if (message.content.split(' ')[0].toUpperCase() === 'MC') {
    getMarketCapSpecific(message);
    return;
  }

  // Check for bot mention and reply with response ping latency
  const collection = message.mentions.members;
  if (collection.has('506918730790600704') && !message.reference) {
    let ping = new Date().getTime() - message.createdTimestamp;
    if (Math.sign(ping) === -1) { ping = ping * -1; }
    channel.send('Sup! ' + '<@!' + message.author.id + '>' + ' (`' + ping + ' ms`)');
    return;
  }

  // Split the message by spaces.
  const code_in = message.content.split(' ').filter(function (v) { return v !== ''; });
  if (code_in.length < 1) return;

  // Check for prefix start.
  let hasPfx = '';
  prefix.map(pfx => hasPfx = (code_in[0].indexOf(pfx) === 0 ? pfx : hasPfx));

  // Cut the prefix.
  const code_in_pre = code_in[0];
  code_in[0] = code_in[0].replace(hasPfx, '');

  // Check for *BTC CG call (show prices in terms of btc)
  if (shortcutConfig[message.guild.id] + '*' === code_in[0].toLowerCase() || shortcutConfig[message.guild.id] + '+' === code_in[0].toLowerCase()) {
    code_in.shift();
    console.log(chalk.green('CG *BTC call on: ' + chalk.cyan(code_in) + ' by ' + chalk.yellow(message.author.username)));
    getPriceCG(code_in, channel, '+');
    return;
  }

  // Check for *ETH CG call (show prices in terms of btc via putting an e right before the shortcut, ex: <shortcut>e btc => eth price of btc)
  if (shortcutConfig[message.guild.id] + 'e' === code_in[0].toLowerCase() || shortcutConfig[message.guild.id] + 'eth' === code_in[0].toLowerCase()) {
    code_in.shift();
    console.log(chalk.green('CG *ETH call on: ' + chalk.cyan(code_in) + ' by ' + chalk.yellow(message.author.username)));
    getPriceCG(code_in, channel, 'e');
    return;
  }

  // Check for CG shortcut then run CG check
  if (hasPfx === '') {
    if (shortcutConfig[message.guild.id] === code_in[0].toLowerCase()) {
      code_in.shift();
      console.log(chalk.green('CG shortcut call on: ' + chalk.cyan(code_in) + ' by ' + chalk.yellow(message.author.username)));
      getPriceCG(code_in, channel, '-');
      return;
    }

  } else if (prefix.indexOf(code_in_pre) > -1) {

    // Remove the prefix stub
    code_in.splice(0, 1);

    // Get the command
    let command = 'not set!';
    if (code_in[0]) {
      command = code_in[0].toLowerCase();
    }



    //
    //
    // * SECTION 1: Check commands that don't require parameters
    //
    //



    // Get DiscordID via DM
    if (command === 'id') {
      message.author.send('Your ID is `' + message.author.id + '`.');

      // Statistics
    } else if (command === 'stat') {
      postSessionStats(message);

      // Call help scommand
    } else if (command === 'help' || command === 'h') {
      postHelp(message, message.author, 'ask');

      // Feer/Greed index call
    } else if (command === 'fg' || command === 'feargreed' || command === 'fear/greed') {
      getFearGreedIndex(channel, message.author);

      // Bitmex funding data
    } else if (command === 'fund' || command === 'funding') {
      getMexFunding(channel, message);

      // Binance positions data
    } else if (command === 'ls' || command === 'longs' || command === 'shorts' || command === 'positions' || command === 'longs/shorts') {
      getBinanceLongsShorts(channel, message.author);

      // Call the tag list for current server
    } else if (command === 'taglist' || command === 'tags' || command === 'listtags') {
      if (command == 'tags' || command == 'listtags') {
        command = 'taglist';
      }
      tagsEngine(message.channel, message.author, message.createdTimestamp, message.guild, command.toString().toLowerCase(), code_in[1]);

      // Dev option to show the tags cache in console (be careful with this, it will spam your console HARD)
    } else if (command === 'showjson') {
      console.log(tagsJSON);

      // Etherscan gas call
    } else if (command === 'gas') {
      getEtherGas(channel, message.author);

      // Send an invite link for the bot
    } else if (command === 'invite') {
      console.log(chalk.green('Bot invite link requested by ' + chalk.yellow(message.author.username)));
      message.channel.send('Hi there! You can add me to your server with the following link. Please keep the requested permissions checked to ensure' +
        ' that I\'m able to work fully! \n<' + inviteLink + '>');

      // Send link to bot's source code repo on github
    } else if (command === 'github') {
      console.log(chalk.green('Github link requested by ' + chalk.yellow(message.author.username)));
      message.channel.send('Hi there! Here\'s a direct link to stalk my repo on Github: \n' + 'https://github.com/EthyMoney/TsukiBot');

      // Send donation ETH address
    } else if (command === 'donate') {
      message.channel.send('ETH & ERC20: `0x169381506870283cbABC52034E4ECc123f3FAD02`\n' +
        'BTC: `3NkBA4PFXZ1RgoBeJNAjeEpxDt9xfXiGg2`\n' +
        'LTC: `MJVUeYbcsEptLvgvwyPrXT1ytCYyY9q9oi`\n' +
        'ETC: `0xC4664CEB646494f0Fd6E2ddDCbF69e3Ee584219B`\n' +
        'ZEC: `t1YwhAZYPHo2LSYg4329kQbSEooWQAJaDxT`\n\n' +
        'Thank you so much for the support!  :beers:');

      // Send link to the the user's avatar
    } else if (command === 'avatar' || command === 'myavatar') {
      console.log(chalk.green('Avatar requested by ' + chalk.yellow(message.author.username)));
      message.channel.send(message.author.avatarURL());

      // Send the biggest gainers and losers in terms of % change over 24h
    } else if (command === 'gainz' || command === 'movers' || command === 'gains') {
      getBiggestMovers(message.channel, message.author);

      // Coin360 heatmap
    } else if (command === 'hmap') {
      sendCoin360Heatmap(message);

    } else {



      //
      // 
      // * SECTION 2: Commands with parameter(s)
      //
      //



      // Check if there is parameter content
      // ("pa", "mc", and "cv"/"convert" commands are exceptions to this rule since they can be called as standalone commands either for help responses or default values)
      if ((code_in.length > 1 && code_in.length < 30) || (['mc'].indexOf(command) > -1) || (['pa'].indexOf(command) > -1) ||
        (['cv'].indexOf(command) > -1) || (['convert'].indexOf(command) > -1)) {

        /* --------------------------------------------------------------------------------
          First we need to get the supplied coin list. Then we apply a filter function. 
  
          Coins not found are skipped for the commands that don't skip this filter.
        ---------------------------------------------------------------------------------- */

        const paramsUnfiltered = code_in.slice(1, code_in.length);
        const params = code_in.slice(1, code_in.length).filter(function (value) {
          return !isNaN(value) || pairs_CG_arr.indexOf(value.toUpperCase()) > -1;
        });

        // Keeping the pad
        params.unshift('0');
        if (params.length > 1 || ['cg', 'coingecko', 'translate', 'trans', 't', 'shortcut', 'mc', 'stocks', 'stock', 'info',
          'gr', 'graviex', 'grav', 'pa', 'pa+', 'pa-', 'cmc', 'e', 'etherscan', 'binance', 'n', 'convert', 'cv', 'tag', 'createtag',
          'tagcreate', 'deletetag', 'newtag', 'schedule'].indexOf(command) > -1) {

          // Coinbase call
          if (command === 'gdax' || command === 'g' || command === 'cb' || command === 'coinbase') {
            getPriceCoinbase(channel, code_in[1], code_in[2], message.author);

            // Kraken call
          } else if (command === 'kraken' || command === 'k') {
            getPriceKraken(code_in[1], code_in[2], channel, message.author);

            // Finex call
          } else if (command === 'bitfinex' || command === 'f') {
            getPriceBitfinex(message.author, code_in[1], code_in[2], channel);

            // Bitmex call
          } else if (command === 'bitmex' || command === 'm' || command === 'mex') {
            getPriceMex(code_in[1], code_in[2], channel, message.author);

            // CMC call
          } else if (command === 'cmc' || command === 'cmcs') {
            const ext = command.slice(-1);
            code_in.splice(0, 1);
            console.log(chalk.green('CMC long-hand call on: ' + chalk.cyan(code_in) + ' by ' + chalk.yellow(message.author.username)));
            getPriceCMC(code_in, channel, '-', ext);

            // Coin description call
          } else if (command === 'info') {
            let preppedInput = message.content.substring(8).trim().toUpperCase(); //cut prefix and end spaces, then capitalize
            getCoinDescription(preppedInput, channel, message.author);

            // CG call (skip the filter)
          } else if (command.toString().trim() === 'cg' || command.toString().trim() === 'coingecko') {
            getPriceCoinGecko(code_in[1], code_in[2], channel, 'price', message.author);

            // STEX call (skip the filter)
          } else if (command === 'st' || command === 'stex') {
            getPriceSTEX(channel, code_in[1], code_in[2], message.author);

            // Finnhub call (skip the filter)
          } else if (command === 'stocks' || command === 'stock') {
            getStocks(code_in[1], channel, message.author);

            // CryptoCompare call
          } else if (command === 'cryptocompare' || command === 'c' || command === 'cs' || command === 'cc') {
            const ext = command.slice(-1);
            params.splice(0, 1);
            getPriceCC(params, channel, message.author, ext);

            // MC call (skip the filter)
          } else if (command.toString().trim() === 'mc') {
            if (typeof code_in[1] === 'undefined') {
              getMarketCap(message);
            }
            else {
              getMarketCapSpecific(message);
            }

            // Configure personal array
          } else if (/pa[+-]?/.test(command)) {
            const action = command[2] || '';
            getCoinArray(message.author.id, channel, message, paramsUnfiltered, action);

            // Scheduled actions
          } else if (command === 'schedule') {
            //                             action    frequency    channel
            //scheduledCommandsEngine(message, code_in[1], code_in[2], code_in[3]);

            // Toggle shortcut
          } else if (command === 'shortcut') {
            if (message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
              toggleShortcut(message.guild.id, code_in[1], channel, false, channel.guild.name, message.author);
            }
            else {
              channel.send('Error: Only the server owner or an admin has permission to change the CoinGecko price shortcut.');
            }

            // Convert cryptos at CoinGecko rates
          } else if (command === 'convert' || command === 'cv') {
            if (code_in[4]) {
              priceConversionTool(code_in[2], code_in[4], code_in[1], channel, message.author);
            }
            else {
              priceConversionTool(code_in[2], code_in[3], code_in[1], channel, message.author);
            }

            // Create a new tag
          } else if (command === 'createtag' || command === 'tagcreate' || command === 'newtag') {
            if (command == 'tagcreate' || command == 'newtag') {
              command = 'createtag';
            }
            tagsEngine(message.channel, message.author, message.createdTimestamp, message.guild, command.toString().toLowerCase(), code_in[1], code_in[2]);

            // Call an existing tag
          } else if (command === 'tag') {
            tagsEngine(message.channel, message.author, message.createdTimestamp, message.guild, command.toString().toLowerCase(), code_in[1]);

            // Delete a tag
          } else if (command === 'deletetag') {
            tagsEngine(message.channel, message.author, message.createdTimestamp, message.guild, command.toString().toLowerCase(), code_in[1]);

            // Poloniex call (no filter)
          } else if (command === 'polo' || command === 'p' || command === 'poloniex') {
            getPricePolo(code_in[1], code_in[2], channel, message.author);

            // Graviex call (no filter)
          } else if (command === 'graviex' || command === 'gr' || command === 'grav') {
            getPriceGraviex(channel, code_in[1], code_in[2], message.author);

            // Bittrex call (no filter)
          } else if (command === 'bittrex' || command === 'x') {
            getPriceBittrex(code_in[1], code_in[2], channel, message.author);

            // Binance call (no filter)
          } else if (command === 'binance' || command === 'n' || command === 'b') {
            getPriceBinance(code_in[1], code_in[2], channel, message.author);

            // Etherscan call
          } else if ((command === 'etherscan' || command === 'e')) {
            if (code_in[1].length === 42) {
              getEtherBalance(message.author, code_in[1], channel);
            } else if (code_in[1].length === 66) {
              getEtherBalance(message.author, code_in[1], channel, 'tx');
            } else if (code_in[1].toLowerCase().includes('.eth')) {
              getEtherBalance(message.author, code_in[1], channel, 'ens');
            }
            else {
              channel.send('Format: `.tb e [HEXADDRESS, TXHASH, or ENS.eth address]` (hexaddress or txhash have prefix 0x).');
            }

          } else if (command === 'translate' || command === 't' || command === 'trans') {
            translateEN(channel, message);

            // Catch-all help
          } else {
            // Before giving up, lest see if this is a command-less price call
            const potentialCoins = code_in.filter(function (value) {
              return !isNaN(value) || pairs_CG_arr.indexOf(value.toUpperCase()) > -1;
            });
            if (potentialCoins.length > 0) {
              console.log(chalk.green('CG base command-less call on: ' + chalk.cyan(code_in) + ' by ' + chalk.yellow(message.author.username)));
              getPriceCG(potentialCoins, channel, '-');
            }
            else {
              postHelp(message, message.author, command);
            }
          }
        } else {
          postHelp(message, message.author, command);
        }
      } else {
        // Before giving up, lest see if this is a command-less price call
        const potentialCoins = code_in.filter(function (value) {
          return !isNaN(value) || pairs_CG_arr.indexOf(value.toUpperCase()) > -1;
        });
        if (potentialCoins.length > 0) {
          console.log(chalk.green('CG base command-less call on: ' + chalk.cyan(code_in) + ' by ' + chalk.yellow(message.author.username)));
          getPriceCG(potentialCoins, channel, '-');
        }
        else {
          postHelp(message, message.author, command);
        }
      }
    }



    //
    //
    // * SECTION 3: Shortcut commands. Format: [prefix][shortcut] (no spaces in input, no parameters)
    //
    // --------------------------------------------------------------------------------------------------------
    //                                          Shortcut Commands
    // --------------------------------------------------------------------------------------------------------

  } else {

    const scommand = code_in[0].toLowerCase();

    // Get personal array prices
    if (/pa[+\-*]?/.test(scommand)) {
      if (message.channel.id == '746425894498730085') {
        message.reply('Admins have disabled the tbpa command in this channel. Use another channel please!').then(message => {
          message.delete({ timeout: 5000 });
        })
          .catch(console.log(chalk.green('Sent notice for disabled tbpa command in channel')));
        message.delete({ timeout: 0 });
        return;
      }
      if (message.author.id !== client.user.id) {
        getCoinArray(message.author.id, channel, message, '', scommand[2] || '-');
      }

      // Get Coinbase ETHX (exception to the "no spaces" rule: this shortcut can take one parameter)
    } else if (scommand === 'g' || scommand === 'cb') {
      if (code_in[1] && code_in[1].toUpperCase() === 'EUR') {
        getPriceCoinbase(channel, 'ETH', 'EUR', message.author);
      } else if (code_in[1] && code_in[1].toUpperCase() === 'BTC') {
        getPriceCoinbase(channel, 'BTC', 'USD', message.author);
      } else {
        getPriceCoinbase(channel, 'ETH', 'USD', message.author);
      }

      // Get Kraken ETHX (exception to the "no spaces" rule: this shortcut can take one parameter)
    } else if (scommand === 'k') {
      if (code_in[1] && code_in[1].toUpperCase() === 'EUR') {
        getPriceKraken('ETH', 'EUR', channel, message.author);
      } else if (code_in[1] && code_in[1].toUpperCase() === 'BTC') {
        getPriceKraken('BTC', 'USD', channel, message.author);
      } else {
        getPriceKraken('ETH', 'USD', channel, message.author);
      }

      // Get Poloniex ETHUSDT
    } else if (scommand === 'p') {
      getPricePolo('ETH', 'USD', channel, message.author);

      // Get Bitfinex ETHUSD
    } else if (scommand === 'f') {
      getPriceBitfinex(message.author, 'ETH', 'USD', channel);

      // Get prices of popular currencies (the top 10 by market cap)
    } else if (scommand === 'pop') {
      let cursor = 0;
      // there are a lot fo null values, so lets find the first actual value and move from there
      cgArrayDictParsed.forEach((coin, index) => {
        if (coin.market_cap_rank && coin.market_cap_rank == 1) {
          cursor = index;
        }
      });
      getPriceCG([cgArrayDictParsed[cursor].symbol, cgArrayDictParsed[cursor + 1].symbol,
      cgArrayDictParsed[cursor + 2].symbol, cgArrayDictParsed[cursor + 3].symbol,
      cgArrayDictParsed[cursor + 4].symbol, cgArrayDictParsed[cursor + 5].symbol,
      cgArrayDictParsed[cursor + 6].symbol, cgArrayDictParsed[cursor + 7].symbol,
      cgArrayDictParsed[cursor + 8].symbol, cgArrayDictParsed[cursor + 9].symbol], channel, 'p');

      // Get Bittrex ETHUSDT
    } else if (scommand === 'b') {
      getPriceBittrex('ETH', 'USD', channel, message.author);

      // Get BitMEX ETHUSD
    } else if (scommand === 'm') {
      getPriceMex('ETH', 'none', channel, message.author);

      // Get Binance ETHUSD
    } else if (scommand === 'n') {
      getPriceBinance('ETH', 'USD', channel, message.author);

      // Call help scommand
    } else if (scommand === 'help' || scommand === 'h') {
      postHelp(message, message.author, 'ask');

      // Message Translation
    } else if (scommand === 't') {
      translateEN(channel, message);

      // Statistics
    } else if (scommand === 'stat') {
      postSessionStats(message);

      // Charts
    } else if (scommand === 'c') {
      // Assigning an ID tag to each chart to keep track of them when there are several being called at a time
      if (chartTagID > 25) {
        chartTagID = 1;
      }
      getTradingViewChart(message, ++chartTagID);

      // Coin360 Heatmap
    } else if (scommand === 'hmap') {
      sendCoin360Heatmap(message);

      //
      // The following meme commands are set to only work in the SpaceStation server until a configuration option is added to disable them when not wanted
      //

      // Meme
    } else if (scommand === '.dank' && guildID === '290891518829658112') {
      channel.send(':ok_hand:           :tiger:' + '\n' +
        ' :eggplant: :zzz: :necktie: :eggplant:' + '\n' +
        '                  :oil:     :nose:' + '\n' +
        '            :zap:  8=:punch: =D:sweat_drops:' + '\n' +
        '         :trumpet:   :eggplant:                       :sweat_drops:' + '\n' +
        '          :boot:    :boot:');

      // Memes
    } else if (scommand === '.moonwhen' || scommand === '.whenmoon') {
      channel.send('Soon™');

    } else if (scommand === 'juice') {
      channel.send('https://cdn.discordapp.com/attachments/456273188033396736/549189762116878349/juice_1.mp4');

    } else if (scommand === 'soup') {
      channel.send('https://ih1.redbubble.net/image.540280332.2834/pp,550x550.jpg');

      // George's Kool Commands
    } else if (scommand === 'tomato') {
      channel.send('https://cdn.discordapp.com/attachments/549161532315926540/551842468044472320/3451788.6999999974_52701949_2330481980303317_1952146104426430464_n.mp4');
    } else if (scommand === 'shit') {
      channel.send('https://cdn.discordapp.com/attachments/549161532315926540/551289660740206604/49709174_2276776759276874_4440576140557418496_n.mp4');
    } else if (scommand === 'gnome') {
      channel.send('https://tenor.com/view/gnomed-gnome-meme-epic-prank-gif-13288669');
    } else if (scommand === 'monster') {
      channel.send('https://cdn.discordapp.com/attachments/549162488860639252/557655812105830425/20190320_090414.jpg');
    } else if (scommand === 'thomas') {
      channel.send('https://cdn.discordapp.com/attachments/549162488860639252/557657026952429568/Screenshot_20190206-195127_Instagram.jpg');

      // Praise the moon!
    } else if (scommand === '.worship') {
      channel.send(':last_quarter_moon_with_face: :candle: :first_quarter_moon_with_face:');
    }

    // Displays the caller's avatar 
    else if (scommand === '.myavatar' || scommand === '.avatar') {
      channel.send(message.author.avatarURL());
    }

    // Say hi to my pal George
    if (message.member && message.member.id === '221172361813032961' && guildID === '290891518829658112' && Math.random() < 0.05) {
      channel.send('Hi George! :sunglasses:');
    }

    // YEET on 'em
    if ((scommand === '.yeet' || scommand === 'yeet') && (guildID === '290891518829658112' || guildID === '524594133264760843' || guildID === '417982588498477060' || guildID === '349720796035284993')) {
      const author = message.author.username;
      // Delete the command message
      console.log(chalk.magenta('Yeet called, watch for deletion failure!'));
      message.delete({ timeout: 0, reason: 'You know I had to do it to em' }).then(console.log(chalk.green('Deleted yeet command message from ' + chalk.yellow(author)))).catch(function (reject) {
        // Report if delete permissions are missing
        console.log(chalk.yellow('Warning: ') + chalk.red.bold('Could not delete yeet command from ') + chalk.yellow(author) + chalk.red.bold(' due to failure: ' +
          chalk.cyan(reject.name) + ' with reason: ' + chalk.cyan(reject.message)));
      });
      // Deliver the yeet
      if (yeetLimit <= 2) {
        channel.send(':regional_indicator_y:' + makeYeet() + ':regional_indicator_t:');
        yeetLimit++;
      }
      else {
        message.reply('Yeet spam protection active :upside_down:')
          .then(message => {
            message.delete({ timeout: 3500 });
          })
          .catch(console.log(chalk.green('Yeet spam protection triggered')));
      }
    }
  }
}



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
      console.log(chalk.red(`Translation command failed and was rejected at client side: \n ${err}`));
      return;
    }
  });
  console.log(chalk.magenta(`Translation: ${chalk.cyan(translation)}`));
  if (!translation) {
    if (interaction) {
      interaction.reply('Translation failed.  Please try shortening your input or try again later.');
      return;
    }
    else {
      channel.send('Translation failed. Try shortening your input, otherwise try again later.');
      console.log(chalk.red('Translation command failed and was undefined. Sent notification to user.'));
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
    //executablePath:'/author/bin/chromium-browser',
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
    console.log(chalk.red(`Puppeteer cluster encountered error processing task: ${data}: ${err.message}`));
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

      const binancePairs = await clientBinance.loadMarkets();
      let expandedPair = false;
      let basePair;
      let exchangeProvided = false;
      const exchanges = ['binance', 'bitstamp', 'bitbay', 'bitfinex', 'bittrex', 'bybit', 'coinbase', 'ftx', 'gemini', 'hitbtc', 'kraken',
        'kucoin', 'okcoin', 'okex', 'poloniex'];

      console.log(chalk.blue(`(ID:${chartID})`) + ' user input');
      console.log(args);

      // Check for missing pair and replace it with usd for any coin found in the CG cache if only a ticker is provided
      for (let i = 0; i < 500; i++) {
        if (cgArrayDictParsed[i] && args.includes(cgArrayDictParsed[i].symbol)) {
          console.log(chalk.blue(`(ID:${chartID})`) + ' matched symbol to cache');
          const pos = args.indexOf(cgArrayDictParsed[i].symbol);
          args[pos] = cgArrayDictParsed[i].symbol + 'usd';
          console.log(args);
          expandedPair = true;
          basePair = cgArrayDictParsed[i].symbol;
        }
      }

      // Check for provided exchange
      let found = false;
      exchanges.forEach(exchange => {
        if (args.includes(exchange) && !args[1].includes(exchange + ':')) {
          if (exchange == 'binance') {
            if (expandedPair && basePair != 'eth' && basePair != 'btc') {
              args[1] = args[1] + 't'; // use tether if Binance
            }
            // Make sure that the pair exists on Binance before attempting to call it
            Object.keys(binancePairs).forEach(key => {
              let cur = binancePairs[key];
              if (cur.info.symbol.toLowerCase() == args[1] || cur.info.symbol.toLowerCase() == args[1] + 't' || (args[1] == 'ethusd' || args[1] == 'btcusd')) {
                found = true;
                console.log(chalk.blue(`(ID:${chartID})`) + ' verified pair with binance');
                console.log(args);
                args[1] = exchange + ':' + cur.info.symbol.toLowerCase();
                exchangeProvided = true;
              }
            });
          }
          else {
            // If another exchange is found other than Binance, update the pair input to match selected exchange
            args[1] = exchange + ':' + args[1];
          }
        }
      });

      // Attempt to default exchange to Binance if no exchange was provided (for better accuracy on charts)
      if (!exchangeProvided) {
        Object.keys(binancePairs).forEach(key => {
          const cur = binancePairs[key];
          if (((expandedPair && args[1] + 't' == cur.info.symbol.toLowerCase()) || (args[1] + 't' == cur.info.symbol.toLowerCase())) && basePair != 'eth' && basePair != 'btc') {
            args[1] = args[1] + 't';
          }
          if (cur.info.symbol.toLowerCase() == args[1] || (args[1] == 'ethusd' || args[1] == 'btcusd')) {
            console.log(chalk.blue(`(ID:${chartID})`) + ' matched pair to binance');
            args[1] = 'binance' + ':' + args[1];
            console.log(args);
          }
        });
      }

      // Inform user of unknown pair if pair wasn't located and exchange was explicitly defined as Binance
      if (!found && args.includes('binance')) {
        if (data.interaction) {
          await data.interaction.editReply('Pair not found on Binance. Check pair or try another exchange!');
          return;
        }
        else {
          message.channel.send('Error: Your requested pair was not found on Binance. Check your spelling or try another pair or exchange!');
          await sleep(1500);
          chartMessage.delete();
          return;
        }
      }

      await page.goto(`http://localhost:8080/${encodeURIComponent(args[1])}?query=${query}`, { timeout: 20000 });

      // Wait for the chart to load (this is a hacky workaround for now)
      await sleep(3500);

      const elementHandle = await page.$('div#tradingview_bc0b0 iframe');
      await elementHandle.contentFrame();
      //await frame.waitForSelector('div[data-name="legend-series-item"', { visible: true });
      await elementHandle.click({ button: 'right' });

      if (query.includes('log')) {
        await page.keyboard.down('Alt');
        await page.keyboard.press('KeyL');
        await page.keyboard.up('Alt');
      }

      // Clicking to remove focus dots on price line
      await page.click('#tsukilogo');

      // Set the view area to be captured by the screenshot
      await page.setViewport({
        width: query.includes('wide') ? 1275 : 715,
        height: 557
      });

      // Wait a moment just to make sure that all elements are loaded up
      //await sleep(720);

      // Capture and save the chart from the browser window
      const chartScreenshot = await page.screenshot();

      try {
        // Run pixel comparison between the received chart and a known failure
        const diff = new PixelDiff({
          imageA: chartScreenshot,
          imageBPath: 'chartscreens/failchart.png',
          thresholdType: PixelDiff.THRESHOLD_PERCENT,
          threshold: 0.99 // 99% threshold
        });

        // Check if the difference count is within threshold to verify if the chart has generated correctly or is blank
        diff.run((error, result) => {
          if (error) {
            console.error(error);
            console.log(chalk.blue(`ID:${chartID}`) + chalk.yellow(' Pixel Diff chart comparison error was thrown. Skipping validation of this chart.'));
            if (data.interaction) {
              data.interaction.editReply({
                files: [{
                  attachment: chartScreenshot,
                  name: 'tsukibotchart.png'
                }]
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
          } else {
            const status = (result.differences < 5000) ? chalk.red('<FAILED>') : chalk.greenBright('passed!');
            console.log(chalk.blue(`(ID:${chartID})`) + ` chart validation test ${status}`);
            console.log(chalk.blue(`(ID:${chartID})`) + ` found ${result.differences} differences from failure`);
            if (result.differences < 5000) {
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
              const end = performance.now();
              console.log(chalk.blue(`(ID:${chartID})`) + ' Execution time: ' + chalk.green(`${((end - start) / 1000).toFixed(3)} seconds`));
              if (data.interaction) {
                data.interaction.editReply({
                  files: [{
                    attachment: chartScreenshot,
                    name: 'tsukibotchart.png'
                  }]
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
          }
        });
      }
      catch (pixelDiffErr) {
        console.log(chalk.blue(`ID:${chartID}`) + chalk.yellow(' Caught Pixel Diff chart comparison error. Skipping validation of this chart.'));
        const end = performance.now();
        console.log(chalk.blue(`(ID:${chartID})`) + ' Execution time: ' + chalk.green(`${((end - start) / 1000).toFixed(3)} seconds`));
        if (data.interaction) {
          data.interaction.editReply({
            files: [{
              attachment: chartScreenshot,
              name: 'tsukibotchart.png'
            }]
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
      console.log(chalk.blue(`(ID:${chartID}) `) + err);
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

// Request a TradingView widget chart from the express server
async function getTradingViewChart(message, chartID) {
  const args = message.content.toLowerCase().split(' ');
  // Clean up input of things that new people forget to change from the help doc
  await args.forEach((value, index) => {
    if (value.includes('tradingview')) {
      args.pop(index);
    }
    args[index] = value.replace(/[<>]+/g, '');
  });
  let chartMessage;
  console.log(`${chalk.green('TradingView chart command called by:')} ${chalk.yellow(message.member.user.tag)} ${chalk.green('for:')} ${chalk.cyan(message.content.toLowerCase().replace('.tbc', '').trim())}`);

  // Build data object for the cluster task
  const data = {
    'message': message,
    'args': args,
    'chartMessage': chartMessage,
    'attempt': 1,
    'chartID': chartID
  };
  // Send the request to the cluster queue
  cluster.queue(data);
}

// Collect and save Coin360 heatmap to cache
async function getCoin360Heatmap() {

  let fail = false;
  const grabHmap = async ({ page, data: url }) => {
    // Open the page and wait for it to load up
    await page.goto(url).catch(() => {
      console.log(chalk.red('Navigation failure while getting heatmap image. Will try again on next cycle.'));
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

    // Wait for full hmap to be rendered by looking for BTC's tags
    await page.waitForSelector('#SHA256 > a:nth-child(2) > div:nth-child(1) > div:nth-child(1)', { visible: true, timeout: 85000 });
    sleep(1000);

    // Remove headers, banner ads, footers, and zoom buttons from the page screenshot
    const removalItems = ['.styles_zoomControls__YlWVe', 'styles_closer___Gbhu', '.ad_wrapper', '.styles_header__AHV_y', '.styles_cookiesBanner__Dd7rR', '.Header', '.MapFiltersContainer', '.styles_newsFeed__Ep1gS', '.TopLeaderboard', '.StickyCorner', '.styles_filters__AtA4G', '.styles_filters__yxiC0'];
    for (let index in removalItems) {
      await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        for (let i = 0; i < elements.length; i++) {
          elements[i].parentNode.removeChild(elements[i]);
        }
      }, removalItems[index]);
    }

    // Take screenshot and save it
    await page.screenshot({ path: 'chartscreens/hmap.png' });
    // Free up resources, then close the page
    await page.goto('about:blank');
    await page.close();
  };

  cluster.queue('https://coin360.com/', grabHmap);
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
function joinProcedure(guild) {

  let failGC = false;
  let fail2GC = false;
  let fail3GC = false;
  if (guild) {
    console.log(chalk.yellowBright('NEW SERVER ADDED TO THE FAMILY!! Welcome: ' + chalk.cyan(guild.name) + ' with ' + chalk.cyan(guild.memberCount) + ' users!'));
    if (guild.systemChannel) {
      guild.systemChannel.send('Hello there, thanks for adding me! Get a list of commands and their usage with `.tb help`.\n' +
        'Your default price command shortcut is `t` and you can change it at any time using `.tb shortcut`.' +
        '\nIf you ever need help or have suggestions, please don\'t hesitate to join the support server and chat with us! ' +
        ' Use `.tb stat` for the link.').catch(function () {
          console.log(chalk.red('Failed to send introduction message, missing message send permissions'));
          failGC = true;
        });
    }
    else {
      console.log(chalk.red(chalk.cyan(guild.name) + ' does not have a valid system channel.' + chalk.yellow(' No intro will be sent!')));
      failGC = true;
    }
    guild.roles.create({
      name: 'File Perms',
      color: 'BLUE'
    }).catch(function () {
      console.log(chalk.red('Failed to create file perms role, missing role permissions!'));
      fail2GC = true;
    })
      .then(role => {
        if (guild.systemChannel && !fail2GC) {
          guild.systemChannel.send(`Created role ${role} for users who should be allowed to send files! Simply delete this role if you wish to disable this feature.`).catch(function () {
            console.log(chalk.red('Failed to send file perms creation message, missing message send permissions'));
            fail3GC = true;
          });
        }
        else {
          fail3GC = true;
        }
      });
  }
  // Wait for all promises to resolve, then check status
  setTimeout(function () {
    if (!failGC && !fail2GC && !fail3GC) {
      console.log(chalk.green('Full introduction and join procedure executed successfully!!!'));
      // Create default shortcut if the welcome message appeared
      toggleShortcut(guild.id, 't', guild.systemChannel, true, guild.name);
    }
    else {
      if (!failGC) { console.log(chalk.green('Successfully sent introduction message!')); }
      // Create default shortcut regardless of perms status
      toggleShortcut(guild.id, 't', guild.systemChannel, true, guild.name);
      if (!fail2GC) { console.log(chalk.green('Successfully created file perms role!')); }
      if (!fail3GC && !fail2GC) { console.log(chalk.green('Successfully sent file perms role creation message!')); }
    }
  }, 2000);
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

// Generate random-length yeet
function makeYeet() {
  let text = '';
  const possible = ':regional_indicator_e:';
  const numberOfE = Math.random() * (85 - 1) + 1;
  for (let i = 0; i < numberOfE; i++)
    text += possible;
  //console.log(chalk.green("Yeet of size " + chalk.cyan(numberOfE) + " generated!"));
  return text;
}

// Reset the spam counter
function resetSpamLimit() {
  yeetLimit = 0;
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
  cmcArrayDictParsed = cmcArray;
  cmcArrayDict = {};
  try {
    cmcArray.forEach(function (v) {
      if (!cmcArrayDict[v.symbol])
        cmcArrayDict[v.symbol] = v;
    });
  } catch (err) {
    fails++;
    console.error(chalk.red.bold('ERROR UPDATING CMC CACHE! This is attempt number: ' + chalk.cyan(fails) + ' : API response below:'));
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

async function getCGData(status) {

  // startup handling
  if (cacheUpdateRunning) {
    return;
  }
  if (status == 'firstrun') {
    console.log(chalk.yellowBright('Initializing CoinGecko data cache...\n' +
      chalk.cyan(' ▶ This could take up to several minutes, hang in there. CoinGecko commands will be unavailable until this is complete.')));
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

      // progress report for first run
      if (status == 'firstrun') {
        progressPercentage = Math.round((coinDataJsonArr.length / totalCoinsCount) * 100);
        console.log(chalk.blueBright(` ▶ ${progressPercentage}%`));
        startupProgress = Math.round(progressPercentage); // update global
      }
    }
    else {
      console.log(chalk.red('CG update error at page:', page, ', status: ') + res.status);
      // 429 is rate limiting
      if (res.status == 429) {
        console.log('Whelp, looks like we got rate limited on that run. Increasing sleep timeout to', globalCGSleepTimeout + 1000, 'for the next run.')
        // try increasing the sleep timeout by a second for the next run (attempted auto healing for rate limiting)
        globalCGSleepTimeout += 1000;
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
    console.log(chalk.greenBright(' ▶ 100%\n' + 'CoinGecko data cache initialization complete. Commands are now active.'));
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

  // write the cache to file
  // fs.writeFile('cg-cache.json', JSON.stringify(cgArrayDictParsed), (err) => {
  //   if (err) {
  //     console.log(chalk.red('Error writing CG cache file: ' + err));
  //   }
  //   else {
  //     console.log(chalk.greenBright('CoinGecko cache file updated.'));
  //   }
  // });
}


/* ---------------------------------

  updateCoins()

  Update known existing CMC/CG coins

 ---------------------------------- */

function updateCoins() {

  reloaderCG.update();
  // Re-read the new set of coins
  pairs_CG = JSON.parse(fs.readFileSync('./common/coinsCG.json', 'utf8'));
  pairs_CG_arr = JSON.parse(fs.readFileSync('./common/coinsCGtickers.json', 'utf8'));
  console.log(chalk.green.bold('Reloaded known coins'));
}


/* ---------------------------------

  toggleShortcut(guildid, shortcut string, channel, new server join (bool), server name)

  Sets CMC price command shortcut

 ---------------------------------- */

function toggleShortcut(id, shortcut, channel, join, name) {

  if (/(\w|[!$%._,<>=+*&]){1,3}/.test(shortcut) && shortcut.length < 4) {
    shortcutConfig[id] = shortcut;
    let startMessage = 'S';
    fs.writeFileSync('common/shortcuts.json', JSON.stringify(shortcutConfig));
    // Dont show message when setting default shortcut during join procedure
    if (!join) {
      channel.send('Successfully set shortcut to `' + shortcut + '`.');
    }
    if (join) {
      startMessage = 'Default s';
    }
    console.log(chalk.green(startMessage + 'hortcut config ' + chalk.blue('"' + shortcut + '" ') + 'saved for: ' + chalk.yellow(name)));
  } else {
    channel.send('Shortcut format not allowed. (Max. 3 alphanumeric and `!$%._,<>=+*&`)');
  }
}


/* ---------------------------------

  initializeFiles()

  Reads and checks all files needed for operation

 ---------------------------------- */

function initializeFiles() {

  //allowed coin pairs data from coin gecko
  try {
    pairs_CG = JSON.parse(fs.readFileSync('./common/coinsCG.json', 'utf8'));
  } catch (err) {
    fs.appendFileSync('./common/coinsCG.json', '[]');
    console.log(chalk.green('Automatically created new coinsCG.json file.'));
    pairs_CG = JSON.parse(fs.readFileSync('./common/coinsCG.json', 'utf8'));
  }

  //allowed coin pairs data from coin gecko (ticker symbols only, as array)
  try {
    pairs_CG_arr = JSON.parse(fs.readFileSync('./common/coinsCGtickers.json', 'utf8'));
  } catch (err) {
    fs.appendFileSync('./common/coinsCGtickers.json', '[]');
    console.log(chalk.green('Automatically created new coinsCGtickers.json file.'));
    pairs_CG_arr = JSON.parse(fs.readFileSync('./common/coinsCGtickers.json', 'utf8'));
  }

  //server tags
  if (fs.existsSync('tags.json')) {
    try {
      tagsJSON = JSON.parse(fs.readFileSync('tags.json', 'utf8'));
    } catch (err) {
      console.log(chalk.red('Error reading tags.json during initialization. Check the file for problems!'));
    }
  }
  else {
    fs.appendFileSync('tags.json', '{"tags":[]}');
    console.log(chalk.green('Automatically created new tags.json file.'));
    tagsJSON = JSON.parse(fs.readFileSync('tags.json', 'utf8'));
  }

  //coin metadata
  if (fs.existsSync('./common/metadata.json')) {
    try {
      metadata = JSON.parse(fs.readFileSync('./common/metadata.json', 'utf8'));
    } catch (err) {
      console.log(chalk.red('Error reading metadata.json during initialization. Check the file for problems or regenerate it using getCoinMeta.js'));
    }
  }
  else {
    fs.appendFileSync('./common/metadata.json', '{}');
    console.log(chalk.green('Automatically created new metadata.json file.'));
    metadata = JSON.parse(fs.readFileSync('./common/metadata.json', 'utf8'));
  }

  //banned words
  if (fs.existsSync('./common/bannedWords.json')) {
    restricted = JSON.parse(fs.readFileSync('./common/bannedWords.json', 'utf8'));
  }
  else {
    fs.appendFileSync('./common/bannedWords.json', '[]');
    console.log(chalk.green('Automatically created new bannedWords.json file.'));
    restricted = JSON.parse(fs.readFileSync('./common/bannedWords.json', 'utf8'));
  }

  //admin commands
  if (fs.existsSync('./common/admin.json')) {
    admin = JSON.parse(fs.readFileSync('./common/admin.json', 'utf8'));
  }
  else {
    fs.appendFileSync('./common/admin.json', '{}');
    console.log(chalk.green('Automatically created new admin.json file.'));
    admin = JSON.parse(fs.readFileSync('./common/admin.json', 'utf8'));
  }

  //shortcuts
  try {
    shortcutConfig = JSON.parse(fs.readFileSync('./common/shortcuts.json', 'utf8'));
  } catch (err) {
    fs.appendFileSync('./common/shortcuts.json', '{}');
    console.log(chalk.green('Automatically created new shortcuts.json file.'));
    shortcutConfig = JSON.parse(fs.readFileSync('./common/shortcuts.json', 'utf8'));
  }

  //api keys
  if (fs.existsSync('./common/keys.api')) {
    try {
      keys = JSON.parse(fs.readFileSync('./common/keys.api', 'utf8'));
    } catch (err) {
      console.log(chalk.red('Error reading keys.api during initialization. Check the file for problems and verify its structure.'));
      console.log(chalk.blue('See step 3 in the first run steps at the top of main.js for how to setup this file with the needed keys'));
      process.exit();
    }
  }
  else {
    fs.appendFileSync('./common/keys.api', '{}');
    console.log(chalk.yellowBright('Automatically created new keys.api file. YOU NEED TO POPULATE IT WITH YOUR API KEYS!!'));
    console.log(chalk.blue('See step 3 in the first run steps at the top of main.js for how to setup this file with the needed keys'));
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
  const port = 8080;
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
    <div id="tsukilogo" style="background: url('tsukilogo.png'); background-size:35px; height:35px; width:35px; position:absolute; bottom:43px; left:50px;"></div>
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
  console.log(chalk.red.bold('General bot client Error. ' + chalk.cyan('(Likely a connection interruption, check network connection) Here is the details:')));
  console.error(err);
});

process.on('unhandledRejection', err => {
  // If the error is a chromium restart failure from within puppeteer, we will restart the whole bot process because puppeteer will stop working if we don't.
  // This is really rare to happen, but if it does, this will keep the bot working normally without manual intervention.
  if (err.toString().includes('Unable to restart chrome.')) {
    console.log(chalk.yellowBright('CHROMIUM RESTART FAILURE DETECTED!  RESTARTING BOT PROCESS TO FIX...'));
    process.kill(process.pid, 'SIGTERM'); //graceful exit, then pm2 will detect this and restart again
  }
  console.error(chalk.redBright('----------------------------------UNHANDLED REJECTION DETECTED----------------------------------'));
  console.error(err);
  console.error(chalk.redBright('------------------------------------------------------------------------------------------------'));
});


// Jack in, Megaman. Execute.
if (devMode) {
  console.log(chalk.cyan('Logging in with dev token...'));
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
