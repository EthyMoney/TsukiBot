/* --------------------------------------------------------------------

                   _____          _    _ ____        _
                  |_   ____ _   _| | _(_| __ )  ___ | |_
                    | |/ __| | | | |/ | |  _ \ / _ \| __|
                    | |\__ | |_| |   <| | |_) | (_) | |_
                    |_||___/\__,_|_|\_|_|____/ \___/ \__|



 * Author:      Oscar "Hiro Inu" Fonseca
 * Program:     TsukiBot

 * Discord bot that offers a wide range of services
 * related to cryptocurrencies.

 * No parameters on start, except -d for dev mode.

 * If you like this service, consider donating
 * ETH to my address: 0xE2784BE97A7B993553F20c120c011274974EC505 




 * ------------------------------------------------------------------- */


// -------------------------------------------
// -------------------------------------------
//
//           SETUP AND DECLARATIONS
//
// -------------------------------------------
// -------------------------------------------

// File read for JSON and PostgreSQL
var fs                  = require('fs');
var pg                  = require('pg');
var pgp                 = require('pg-promise');

// Scheduler
var schedule            = require('node-schedule');

// Set the prefix
var prefix              = ['-t', '.tb'];

// Files allowed
const extensions        = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'mov', 'mp4', 'pdf'];

// Allowed coins in commands
const pairs		= JSON.parse(fs.readFileSync("./common/coins.json","utf8"));
const pairs_filtered    = JSON.parse(fs.readFileSync("./common/coins_filtered.json","utf8"));
const volcoins 		= ['ETH', 'ETHX'];

// Coin request counter initialization
var requestCounter      = {};
pairs.forEach(p => requestCounter[p] = 0);

// Coin mention counter initialization
var mentionCounter      = {};
var msgAcc              = "";
const MESSAGE_LIMIT     = 100000;
pairs_filtered.forEach(p => mentionCounter[p] = 0);

// Help string
var title 		= '__**TsukiBot**__ :full_moon: \n'
var github		= 'Check the GitHub repo for more detailed information. <https://github.com/OFRBG/TsukiBot#command-table>'
const helpStr           = fs.readFileSync('./common/help.txt','utf8');
const helpjson          = JSON.parse(fs.readFileSync('./common/help.json','utf8'));

// DiscordBots API
const snekfetch         = require('snekfetch');

// HTTP request
var request             = require("request");

// Get the api keys
var keys                = JSON.parse(fs.readFileSync('keys.api','utf8'));


// Include API things
const Discord 		= require('discord.js');
const Client 		= require('coinbase').Client;
const KrakenClient 	= require('kraken-api');
const bittrex 		= require('node.bittrex.api');
const BFX               = require('bitfinex-api-node');
const api 		= require('etherscan-api').init(keys['etherscan']);
const cc 		= require('cryptocompare');
const binance           = require('node-binance-api');
const clientcmc         = require('coinmarketcap');



// R script calls
var R                   = require("r-script");
var kliArray            = {};
var kliArrayDict        = {};


// CMC Cache
var cmcArray            = {};
var cmcArrayDict        = {};

// ----------------------------------------------------------------------------------------------------------------

// Web3
const web3              = require('web3');
const Web3              = new web3(new web3.providers.HttpProvider('https://kovan.infura.io/' + keys['infura'] /*'http://localhost:8545'*/));

const abi               = [{"constant":true,"inputs":[],"name":"getRating","outputs":[{"name":"","type":"int256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"negative","outputs":[{"name":"","type":"int256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_vote","type":"bool"}],"name":"feedback","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"productName","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_newPrice","type":"uint256"}],"name":"setPrice","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"_id","type":"string"}],"name":"checkPayment","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"price","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_id","type":"string"}],"name":"payment","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"positive","outputs":[{"name":"","type":"int256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"inputs":[{"name":"_price","type":"uint256"},{"name":"_productName","type":"string"},{"name":"_owner","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"}];

var ProductRegister     = new Web3.eth.Contract(abi, "0x27659AB24B40461Bdc9DC3817683CC0508f74c42");

// ----------------------------------------------------------------------------------------------------------------



// CryptoCompare requires global fetch
global.fetch            = require('node-fetch');

// Include stuff
var PythonShell         = require('python-shell');

// Declare channels and message counter
var channelName         = 'general';
var messageCount        = 0;
var referenceTime       = Date.now();

// Permissions configurations
var configIDs           = [];
var serverConfigs       = {};
const availableCommands = ['k','g','c','p','e','b','pa','join','done'];
const emojiConfigs      = ["🇰",
  "🇬",
  "🇨",
  "🇵",
  "🇪",
  "🇧",
  "💰",
  "📧",
  "✅",
];

// Array of IDs for block removal
var blockIDs = [];

// BlockIDs remove function
function removeID(id){
  // index of the passed message.id
  let index = blockIDs.indexOf(id);

  // .indexOf returns -1 if not in array, so this checks if message is infact in blockIDs.
  if (index > -1){
    // removes id from array
    blockIDs.splice(index, 1);
    blockIDs = blockIDs.splice(0,4);
  }

}

// Bittrex handle
var bittrexhandle = {};

// Initialize api things
var clientGDAX          = new Client({'apiKey':keys['coinbase'][0],'apiSecret': keys['coinbase'][1]});
var clientKraken        = new KrakenClient();
var bfxRest             = new BFX().rest;


// -------------------------------------------
// -------------------------------------------
//
//             UTILITY FUNCTIONS
//
// -------------------------------------------
// -------------------------------------------


/* --------------------------------------------

    These methods are calls on the api of the
    respective exchanges. The user can send
    an optional parameter to calculate %
    change on a base price.
    These methods are the core funcionality
    of the bot. Command calls will usually end
    in one of these.

  -------------------------------------------- */


//------------------------------------------
//------------------------------------------

// Function that gets GDAX spot prices
function getPriceGDAX(coin1, coin2, base, chn){

  // Get the spot price and send it to general
  clientGDAX.getSpotPrice({'currencyPair': coin1.toUpperCase() + '-' + coin2.toUpperCase()}, function(err, price){
    if(err){chn.send('API Error.')}
    else {
      let per = "";
      if (base != -1){
        per = "\n Change: `" + Math.round(((price.data.amount/base-1) * 100)*100)/100 + "%`";
      }

      chn.send('__GDAX__ Price for **'  + coin1.toUpperCase()
        + '-' + coin2.toUpperCase() + '** is : `'  + price.data.amount + ' ' + coin2.toUpperCase() + "`." + per);
    }

  });

}


//------------------------------------------
//------------------------------------------

// Function that gets CMC prices

function getPriceCMC(coins, chn, action = '-', ext = 'd'){
  if(!cmcArrayDict['BTC']) return;

  let msg = '__CoinMarketCap__ Price for:\n';

  let bpchg = parseFloat(cmcArrayDict['BTC']['percent_change_24h']);
  for(let i = 0; i < coins.length; i++){
    if(!cmcArrayDict[coins[i].toUpperCase()])
      continue;

    let bp = parseFloat(cmcArrayDict[coins[i].toUpperCase()]['price_btc']).toFixed(8) + ' BTC` (`' +
      Math.round(parseFloat(cmcArrayDict[coins[i].toUpperCase()]['percent_change_24h'] - bpchg)*100)/100 + '%`)';
    let up = parseFloat(cmcArrayDict[coins[i].toUpperCase()]['price_usd']) + ' USD` (`' +
      Math.round(parseFloat(cmcArrayDict[coins[i].toUpperCase()]['percent_change_24h'])*100)/100 + '%`)';

    coins[i] = (coins[i].length > 6) ? coins[i].substring(0,6) : coins[i];
    switch(action){
      case '-':
        msg += ("`• " + coins[i].toUpperCase() + ' '.repeat(6-coins[i].length) + ' ⇒` `' + (ext === 's' ? bp : up) + '\n');
        break;

      case '+':
        msg += ("`• " + coins[i].toUpperCase() + ' '.repeat(6-coins[i].length) + ' ⇒` `' +
          up + ' `⇒` `' + 
          bp + "\n");
        break;

      case '*':
        msg += ("`• " + coins[i].toUpperCase() + ' '.repeat(6-coins[i].length) + ' ⇒ 💵` `' +
          up + '\n`|        ⇒` `' + 
          bp + "\n");
        break;

      default:
        msg += ("`• " + coins[i].toUpperCase() + ' '.repeat(6-coins[i].length) + ' ⇒` `' + (ext === 's' ? bp : up) + '\n');
        break;

    }

  }

  chn.send(msg);


}

//------------------------------------------
//------------------------------------------

// Function that gets CryptoCompare prices

function getPriceCC(coins, chn, action = '-', ext = 'd'){

  let query = coins.concat(['BTC']);

  // Get the spot price of the pair and send it to general
  cc.priceFull(query.map(function(c){return c.toUpperCase();}),['USD', 'BTC'])
    .then(prices => {
      let msg = '__CryptoCompare/CMC__ Price for:\n';
      let ordered = {};

      let bpchg = parseFloat(cmcArrayDict['BTC']['percent_change_24h']);
      
      for(let i = 0; i < coins.length; i++){
        let bp, up;

        try{
          bp = prices[coins[i].toUpperCase()]['BTC']['PRICE'].toFixed(8) + ' BTC` (`' +
            Math.round(prices[coins[i].toUpperCase()]['BTC']['CHANGEPCT24HOUR']*100)/100 + '%`)';
          up = prices[coins[i].toUpperCase()]['USD']['PRICE'] + ' USD` (`' +
            Math.round((prices[coins[i].toUpperCase()]['BTC']['CHANGEPCT24HOUR'] + prices['BTC']['USD']['CHANGEPCT24HOUR'])*100)/100 + '%`)';
        } catch(e){
          bp = parseFloat(cmcArrayDict[coins[i].toUpperCase()]['price_btc']).toFixed(8) + ' BTC` (`' +
            Math.round(parseFloat(cmcArrayDict[coins[i].toUpperCase()]['percent_change_24h'] - bpchg)*100)/100 + '%`)';
          up = parseFloat(cmcArrayDict[coins[i].toUpperCase()]['price_usd']) + ' USD` (`' +
            Math.round(parseFloat(cmcArrayDict[coins[i].toUpperCase()]['percent_change_24h'])*100)/100 + '%`)';
        }
        
        coins[i] = (coins[i].length > 6) ? coins[i].substring(0,6) : coins[i];
        switch(action){
          case '-':
            msg += ("`• " + coins[i].toUpperCase() + ' '.repeat(6-coins[i].length) + ' ⇒` `' + (ext === 's' ? bp : up) + '\n');
            break;

          case '%':
            ordered[prices[coins[i].toUpperCase()]['USD']['CHANGEPCT24HOUR']] = 
              ("`• " + coins[i].toUpperCase() + ' '.repeat(6-coins[i].length) + ' ⇒` `' + (ext === 's' ? bp : up) + '\n');
            break;

          case '+':
            msg += ("`• " + coins[i].toUpperCase() + ' '.repeat(6-coins[i].length) + ' ⇒` `' +
              up + ' `⇒` `' + 
              bp + "\n");
            break;

          case '*':
            msg += ("`• " + coins[i].toUpperCase() + ' '.repeat(6-coins[i].length) + ' ⇒ 💵` `' +
              up + '\n`|        ⇒` `' + 
              bp + "\n");
            break;

          default:
            msg += ("`• " + coins[i].toUpperCase() + ' '.repeat(6-coins[i].length) + ' ⇒` `' + (ext === 's' ? bp : up) + '\n');
            break;

        }

      }

      if(action === '%'){
        let k = Object.keys(ordered).sort(function(a,b){ return parseFloat(b) - parseFloat(a); });
        for(let k0 in k)
          msg += ordered[k[k0]];
      }

      chn.send(msg);

    })
    .catch(console.log);

}


//------------------------------------------
//------------------------------------------


// Function that gets Finex prices

function getPriceFinex(coin1, coin2, chn){
  coin2 = coin2 || (coin1.toUpperCase() === 'BTC' ? 'USD' : 'BTC');

  bfxRest.ticker(coin1.toUpperCase() + coin2.toUpperCase(), (err, res) => {
    if(err) {
      chn.send("API Error: " + err.message);
    } else {
      let s = res['last_price'];

      chn.send('__Bitfinex__ Price for **'  + coin1.toUpperCase()
        + '-' + coin2.toUpperCase() + '** is : `'  + s +' ' + coin2.toUpperCase() + "`.");
    }
  });
}


//------------------------------------------
//------------------------------------------


// Function that gets Kraken prices

function getPriceKraken(coin1, coin2, base, chn){

  // Get the spot price of the pair and send it to general
  clientKraken.api('Ticker', {"pair": '' + coin1.toUpperCase() + '' + coin2.toUpperCase() + ''}, function(error, data){
    if(error){chn.send('520ken API no response.')}
    else {
      let per = ""
      let s = (data.result[Object.keys(data.result)]['c'][0]);
      s = (coin2.toUpperCase() === 'XBT') ? s.toFixed(8) : s;

      if (base != -1){
        per = "\n Change: `" + Math.round(((s/base-1) * 100)*100)/100 + "%`";
      }

      chn.send('__Kraken__ Price for **'  + coin1.toUpperCase()
        + '-' + coin2.toUpperCase() + '** is : `'  + s +' ' + coin2.toUpperCase() + "`." + per);

    }

  });

}


//------------------------------------------
//------------------------------------------


// Function that gets Poloniex prices

function getPricePolo(coin1, coin2, chn){

  let url = "https://poloniex.com/public?command=returnTicker";
  coin2 = coin2.toUpperCase();

  if(coin2 === 'BTC' || coin2 === 'ETH' || coin2 === 'USDT'){
    request({
      url: url,
      json: true
    }, function(error, response, body){
      let pair = coin2.toUpperCase() + '_' + coin1.toUpperCase();

      try {
        let s = body[pair]['last'];

        let ans = ('__Poloniex__ Price for:\n');

        ans += ("`• " + coin1.toUpperCase() + ' '.repeat(6-coin1.length) + '⇒ ' + s + " " + coin2.toUpperCase() + " " +
          "(" + (body[pair]['percentChange']*100).toFixed(2) + "%)` ∭ `(V." + Math.trunc(body[pair]['baseVolume']) + ")`\n" +
          "`-       ⇒` `" + (body['BTC_' + coin1.toUpperCase()]['last'] * body['USDT_BTC']['last']).toFixed(8) + " USDT`" +
          "\n");

        chn.send(ans);        
      } catch (err){
        console.log(err);
        chn.send("Poloniex API Error.");
      }


    });
  }

}


//------------------------------------------
//------------------------------------------


function getPriceBinance(coin1, coin2, chn){

  coin1 = coin1.map(function(c){ return c.toUpperCase(); }).sort();
  coin1.push('BTC');

  binance.prevDay(false, function(data) {

    if(data){
      let markets = data;
      let s = "__Binance__ Price for: \n";
      let sn = [];
      let vp = {};

      for(let idx in markets){

        let c = markets[idx];
        let pd = parseFloat(c.lastPrice);

        let curr = (c.symbol.slice(-4) === 'USDT') ? c.symbol.slice(0,-4) : c.symbol.slice(0,-3);
        if(coin1.indexOf(curr) === -1) continue;

        let base = (c.symbol.slice(-4) === 'USDT') ? c.symbol.slice(-4) : c.symbol.slice(-3);

        pd = (base === 'BTC') ? (pd.toFixed(8)) : pd;

        if(!sn[curr]){
          sn[curr] = [];
        }

        let pch = parseFloat(c.priceChangePercent).toFixed(2);
        if(base === 'BTC')
          sn[curr].unshift("`" + pd + " " + base + " (" + pch + "%)` ∭ `(V." + Math.trunc(parseFloat(c.quoteVolume)) + ")`"); 
        else
          sn[curr].push("`" + pd + " " + base + " (" + pch + "%)` ∭ `(V." + Math.trunc(parseFloat(c.quoteVolume)) + ")`"); 
      }

      for(let coin in sn){
        s += ("`• " + coin + ' '.repeat(6-coin.length) + '⇒` ' + sn[coin].join("\n`-       ⇒` ")
          + (coin !==  "BTC" && coin !== "ETH" && sn[coin][2] == null ? "\n`-       ⇒` `" +
            Math.floor((sn[coin][0].substring(1,10).split(" ")[0]) * (sn["BTC"][0].substring(1,8).split(" ")[0]) * 100000000) / 100000000 + " USDT`" : "" )
          + "\n");

      }

      s += (Math.random() > 0.8) ? "\n`Don't want to donate but still support this awesome bot? Join Binance with my link:` <https://www.binance.com/?ref=10180938>" : "";
      chn.send(s);
    } else {
      chn.send('Binance API error.');
    }

  });

}


//------------------------------------------
//------------------------------------------

// Bittrex API v2

bittrex.options({
  'stream' : false,
  'verbose' : false,
  'cleartext' : true,
});

function getPriceBittrex(coin1, coin2, chn){

  coin1 = coin1.map(function(c){ return c.toUpperCase(); }).sort();
  coin1.push('BTC');

  bittrex.sendCustomRequest('https://bittrex.com/Api/v2.0/pub/Markets/GetMarketSummaries', function( data ){

    data = JSON.parse(data);

    if(data && data['result']){
      let p = data['result'];
      let s = "__Bittrex__ Price for: \n";
      let sn = [];
      let vp = {};

      let markets = p.filter(function(item){ return coin1.indexOf(item.Market.MarketCurrency) > -1});

      for(let idx in markets){
        let c = markets[idx];
        let pd = c.Summary.Last;
        pd = (c.Market.BaseCurrency === 'BTC') ? (pd.toFixed(8)) : pd;

        if(!sn[c.Market.MarketCurrency]){
          sn[c.Market.MarketCurrency] = [];
        }

        let pch = (((pd/c.Summary.PrevDay)-1)*100).toFixed(2);
        sn[c.Market.MarketCurrency].push("`" + pd + " " + c.Market.BaseCurrency + " (" + pch + "%)` ∭ `(V." + Math.trunc(c.Summary.BaseVolume) + ")`"); 
      }


      for(let coin in sn){
        s += ("`• " + coin + ' '.repeat(6-coin.length) + '⇒` ' + sn[coin].join("\n`-       ⇒` ")
          + (coin !==  "BTC" && coin !== "ETH" && sn[coin][2] == null ? "\n`-       ⇒` `" +
            Math.floor((sn[coin][0].substring(1,10).split(" ")[0]) * (sn["BTC"][0].substring(1,8).split(" ")[0]) * 100000000) / 100000000 + " USDT`" : "" )
          + "\n");

      }

      chn.send(s);
    } else {
      chn.send('Bittrex API error.');
    }

  });

}



//------------------------------------------
//------------------------------------------


// This method runs the python script that
// reads from the api's until it is killed
// from outside bot.js. It runs
// on its own.

// Create a logger for a certain set of coins
function createLogger(coins){
  PythonShell.run('./tsukiserverlog.py', {args:coins}, function(err){if(err) console.log(err);});
}


//------------------------------------------
//------------------------------------------


// This function runs python scripts once
// and gets their stdout output. It calls
// tsukiserver, which will call either the
// s command or the p command.

function executeCommand(c, opts, chn){
  console.log(opts)

  let coin = opts.coin;
  let arg1 = opts.arg1 || -1;
  let arg2 = opts.arg2 || 'p';

  let pyshell = new PythonShell('./tsukiserver.py', {args:[coin,arg1,arg2]});

  pyshell.send(c + '\r\n').end(function(err){
    if(err) {
    console.log(err);
    }
    });

  pyshell.stdout.on('data', function (data){
    console.log(data);
    chn.send(data).then(message => {
      message.react("\u274E");
      blockIDs.push(message.id);

      setTimeout(function(){ removeID(message.id); }, 120000);
    })
      .catch(console.log);
  });


}


//------------------------------------------
//------------------------------------------

// KLI functions

function compareCoins(coin1, coin2, chn){
  if(kliArray !== {}){
    let msg = '__KL Comparison__\n';

    if(kliArrayDict[coin1.toUpperCase()] && kliArrayDict[coin2.toUpperCase()]){
      let c1 = kliArrayDict[coin1.toUpperCase()];
      let c2 = kliArrayDict[coin2.toUpperCase()];

      msg += "`Tickers:` `" + c1['h.ticker'] + " " + c2['h.ticker'] + "`\n";
      msg += "`⇒ MCap rel. sizes:` `" + Math.exp(parseFloat(c1.x)-parseFloat(c2.x)).toFixed(4) + " ⬄ " + Math.exp(parseFloat(c2.x)-parseFloat(c1.x)).toFixed(4) + "`\n";
      msg += "`⇒ Vol. rel. sizes:` `" + Math.exp(parseFloat(c1.y)-parseFloat(c2.y)).toFixed(4) + " ⬄ " + Math.exp(parseFloat(c2.y)-parseFloat(c1.y)).toFixed(4) + "`\n";
    }

    chn.send(msg);
  } else {
    chn.send("Invalid crypto supplied.");
  }
}


function getKLI(coins, chn){
  if(kliArray !== {}){
    let msg = '__KL Index Values__\n';

    coins.forEach(function(v){
      if(kliArrayDict[v.toUpperCase()]){
        let c = kliArrayDict[v.toUpperCase()]
        console.log(c)
        msg += '`' + c['h.ticker'] + '` - `' + c.kli + '`\n';
      }
    });

    chn.send(msg);
  }
}


//------------------------------------------
//------------------------------------------


// From the etherscan api, get the balance
// for a given address. The balance is returned
// in weis.

function getEtherBalance(address, chn, action = 'b'){
  if(action === 'b'){
    let balance = api.account.balance(address);
    balance.then(function(res){
      chn.send('The total ether registered for `' + address + '` is: `' + res['result'] / 1000000000000000000 + ' ETH`.');
    });
  } else {
    let block = api.proxy.eth_blockNumber();
    let tx = api.proxy.eth_getTransactionByHash(address);

    tx.then(function(res){
      if(res.result !== null) {
        if(res.result.blockNumber !== null) {
          block.then(function(blockres){
            chn.send('Transaction included in block `' + web3.utils.hexToNumber(res.result.blockNumber) + '`.' + 
              (blockres.result ? ' Confirmations: `' + (1 + web3.utils.hexToNumber(blockres.result) - web3.utils.hexToNumber(res.result.blockNumber)) + '`': ''));
          }).catch(() => {
            chn.send('Transaction included in block `' + web3.utils.hexToNumber(res.result.blockNumber) + '`.');
          });
        } else {
          chn.send('Transaction still not mined.');
        }
      } else {
        chn.send('Transaction not found. (Neither mined nor broadcasted.)')
      }
    });
  }
}


//------------------------------------------
//------------------------------------------

// This is a setup for users to create
// their own arrays of coins. They can check
// the price from they array by typing .tbpa
// as a shortcut.

function getCoinArray(id, chn, coins = '', action = ''){
  const conString = "postgres://tsukibot:" + keys['tsukibot'] + "@localhost:5432/tsukibot";

  if(action === '') 
    coins = '{' + coins + '}';

  let conn = new pg.Client(conString);
  conn.connect();

  let query;


  // .tbpa call
  if(coins === ''){
    query = conn.query("SELECT * FROM profiles where id = $1;", [id], (err, res) => {
      if (err){console.log(err);}
      else {
        if(res.rows[0]){

          let coins = res.rows[0].coins.filter(function(value){
            return !isNaN(value) || pairs.indexOf(value.toUpperCase()) > -1; 
          });

          getPriceCC(coins, chn, action);
        } else {
          chn.send('Set your array with `.tb pa [array]`.');
        }
      }

      conn.end();
    });

    // .tb pa call
  } else { 
    if(action == '') {
      query = conn.query(("INSERT INTO profiles(id, coins) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET coins = $2;"), [ id, coins ], (err, res) => {
        if (err){ console.log(err); }
        else { chn.send("Personal array set: `" + coins + "` for <@" + id + ">.") }

        conn.end();
      });
    } else {
      const command     = (action == '-') ? 'EXCEPT' : 'UNION';
      const sqlq        = "UPDATE profiles SET coins = array(SELECT UNNEST(coins) FROM profiles WHERE id = $1 " + command + " SELECT UNNEST(ARRAY[$2])) WHERE id = $1;";
      const queryp      = pgp.as.format(sqlq, [id, coins]);

      query = conn.query(queryp, (err, res) => {
        if (err){ console.log(err); }
        else { chn.send("Personal array modified."); }

        conn.end();

      });    
    }
  }

}


//------------------------------------------
//------------------------------------------

// Service to self-service roles via commands in chat.
// This method currently handles the 4 following cases:
// 1. Setting the roles themselves, and creating the roles
//      as well as the channels
// 2. Setting the self roles
// 3. Getting the available roles
// 4. Removing the roles from oneself

function setSubscriptions(user, guild, coins){
  const conString = "postgres://tsukibot:" + keys['tsukibot'] + "@localhost:5432/tsukibot";
  coins = coins.map(c => c.toUpperCase());

  const id = user.id;

  let conn = new pg.Client(conString);
  conn.connect();

  let sqlq;

  const change  = coins[0] === 'M'; // Change the currently officially supported roles by merge
  const remove  = coins[0] === 'R'; // Unsub from everything
  const getlst  = coins[0] === 'G'; // Get the current role list
  const restore = coins[0] === 'S'; // Resub to the subbed roled

  // Case R
  if(remove || getlst){
    sqlq = "SELECT coins FROM allowedby WHERE guild = $3;";

    // Case default
  } else if(!change){
    sqlq = "WITH arr AS " +
      "(SELECT ARRAY( SELECT * FROM UNNEST($2) WHERE UNNEST = ANY( ARRAY[(SELECT coins FROM allowedby WHERE guild = $3)] ))) " +
      "INSERT INTO coinsubs(id, coins) VALUES($1, (select * from arr)) " +
      "ON CONFLICT ON CONSTRAINT coinsubs_pkey DO " +
      "UPDATE SET coins=(SELECT ARRAY( SELECT * FROM UNNEST($2) WHERE UNNEST = ANY( ARRAY[(SELECT coins FROM allowedby WHERE guild = $3)] ))) RETURNING coins;";

    // Case M
  } else {
    sqlq = "INSERT INTO allowedby VALUES($3, $2) ON CONFLICT (guild) " +
      "DO UPDATE SET coins = ARRAY(SELECT UNNEST(coins) FROM (SELECT coins FROM allowedby WHERE guild = $3) AS C0 UNION SELECT * FROM UNNEST($2)) RETURNING coins;"
    coins.splice(0,1);
  }


  // Format in a predictable way
  let queryp = pgp.as.format(sqlq, [ id, coins, guild.id ]);

  // Execute the query
  let query = conn.query(queryp, (err, res) => {
    if (err){console.log(err);
    } else {
      const roles = guild.roles;
      const coinans = (res.rows[0] !== undefined) ? (getlst ? res.rows[0]['coins'] : res.rows[0]['coins'].map(c => c + "Sub")) : 'your server doesn\'t have subroles (monkaS)';

      let added = new Array();

      guild.fetchMember(user)
        .then(function(gm){
          roles.forEach(function(r){ if(coinans.indexOf(r.name) > -1){ added.push(r.name); (!change && !getlst) ? (!restore && remove ? gm.removeRole(r)
            : gm.addRole(r)) : (0) } });

          user.send(getlst ? "Available roles are: `[" + coinans.join(' ') + "]`."
            : (remove ? "Unsubbed."
              : (!change ? ("Subscribed to `[" + added.join(' ') + "]`.")
                : ("Added new roles. I cannot delete obsolete sub roles. Those need to be removed manually."))));

          if(!change)
            return;


          // If the operation is to add a new role,
          // this section cycles over the returned
          // list and names it foosubs, assigns the
          // role a random color, and makes it private.

          for(let cr in coinans){

            if(added.indexOf(coinans[cr]) === -1){
              guild.createRole({
                name: coinans[cr],
                color: 'RANDOM',
                mentionable: true
              })
                .then(function(r){
                  guild.createChannel(r.name+'s', 'text', [{'id': r.id, 'type': 'role', 'allow': 1024},
                    {'id': guild.roles.find(r => { return r.name === '@everyone'; } ).id, 'type': 'role', 'deny': 1024}] )
                    .then(console.log)
                    .catch(console.log)
                })
                .catch(console.log);
            }
          }


        })
        .catch(console.log)
    }

    conn.end();
  });

}



// -------------------------------------------
// -------------------------------------------
//
//             PERMISSION MGMT 
//
// -------------------------------------------
// -------------------------------------------

// Get a name for a role and save it into
// the permissions database.
//      
//   Note: Currently inserting only type 3.
//   Type 1: Admin
//   Type 2: User
//   Type 3: Temporary

function setRoles(name, guild, chn){
  const conString = "postgres://tsukibot:" + keys['tsukibot'] + "@localhost:5432/tsukibot";
  const code = name.toUpperCase().slice(0,20);

  guild.createRole({
    name: name,
    color: 'RANDOM',
    mentionable: true
  })
    .then(function(r){
      let conn = new pg.Client(conString);
      conn.connect();

      let sqlq = "INSERT INTO roleperms VALUES($1, $2, $3, $4);";
      let queryp = pgp.as.format(sqlq, [r.id, guild.id, 3, code]);

      let query = conn.query(queryp, (err, res) => {
        if (err){console.log(err);}
        else { chn.send("Created role `" + r.name + "`.") }

        conn.end();
      });
    })
    .catch(channel.send("Missing permissions: **Manage roles**."));
}


//------------------------------------------
//------------------------------------------

// Give a temporary role to a user
// and save the timstamps to the
// database.

function temporarySub(id, code, guild, chn, term){
  const conString = "postgres://tsukibot:" + keys['tsukibot'] + "@localhost:5432/tsukibot";
  term = term || 1;
  code = code.toUpperCase().slice(0,20);

  let conn = new pg.Client(conString);
  conn.connect();

  let sqlq = "INSERT INTO temporaryrole VALUES(DEFAULT, $1, (SELECT roleid FROM roleperms WHERE guild = $2 AND function = 3 AND code = $3), current_timestamp, current_timestamp + (30 * interval '$4 day')) RETURNING roleid;"
  let queryp = pgp.as.format(sqlq, [id, guild.id, code, term]);

  let query = conn.query(queryp, (err, res) => {
    if (err){ console.log(err); }
    else { 
      const role = guild.roles.get(res.rows[0].roleid);
      guild.fetchMember(id)
        .then(function(gm){
          gm.addRole(role);
          chn.send("Added subscriber `" + gm.displayName + "` to role `" + role.name + "`.") 
        })
        .catch(console.log)
    }

    conn.end();
  });

}


//------------------------------------------
//------------------------------------------

// Give a temporary role to a user
// and save the timstamps to the
// database.

function checkSubStatus(){
  const conString = "postgres://tsukibot:" + keys['tsukibot'] + "@localhost:5432/tsukibot";
  console.log("purging")

  let conn = new pg.Client(conString);
  conn.connect();

  let sqlq = "SELECT guild, temporaryrole.roleid, userid FROM roleperms, temporaryrole WHERE temporaryrole.roleid = roleperms.roleid AND end_date < current_date;" 
  let queryp = pgp.as.format(sqlq);

  let query = conn.query(queryp, (err, res) => {
    if (err){ console.log(err); }
    else { 
      for(let expired in res.rows){
        let line        = res.rows[expired];
        let guild       = client.guilds.get(line.guild);
        let role        = guild.roles.get(line.roleid);

        guild.fetchMember(line.userid)
          .then(function(gm){
            gm.removeRole(role);
            console.log("unsubbed user");
          })
          .catch(console.log)
      }
    }

    conn.end();
  });

}

function checkMentions(msg, msgAcc, mentionCounter){
  return new Promise(function(resolve, reject){
    const conString = "postgres://tsukibot:" + keys['tsukibot'] + "@localhost:5432/tsukibot";
    let conn = new pg.Client(conString);

    msgAcc = msgAcc + " " + msg;

    if(msgAcc.length > MESSAGE_LIMIT){
      let acc = msgAcc.split(" ");

      for(let w in acc){
        if(pairs_filtered.indexOf(acc[w].toUpperCase()) > -1) mentionCounter[acc[w].toUpperCase()]++;
      }



      conn.connect();

      let queryline = "";
      for(let c in mentionCounter){
        let sqlq = "INSERT INTO mentiondata VALUES($1, $2, current_timestamp, DEFAULT);";
        let queryp = pgp.as.format(sqlq, [c, mentionCounter[c]]);

        queryline += queryp;
      }

      let query = conn.query(queryline, (err, res) => {
        if (err){console.log(err);}
        else { console.log("insertion complete"); }

        conn.end();
      });

      resolve(mentionCounter);

    }

  });

}



// -------------------------------------------
// -------------------------------------------
//
//              DISCORD FUNCTIONS
//
// -------------------------------------------
// -------------------------------------------

// Create a client and a token
const client = new Discord.Client();
const token = keys['discord'];


// Wait for the client to be ready.
client.on('ready', () => {

  if(process.argv[2] === "-d"){
    console.log('dev mode');
  }

  client.user.setGame('.tbhelp');

  fs.readFile("common/serverPerms.json", function(err, data){
    if(err) return console.log(err);

    serverConfigs = JSON.parse(data);
  });

  var deleter      = schedule.scheduleJob('42 * * * *', checkSubStatus);
  var mentionLog   = schedule.scheduleJob('42 * * * * *', checkMentions);
  
  var klindex      = schedule.scheduleJob('*/1 * * * *', getKLIndex);
  var cmcfetch     = schedule.scheduleJob('*/1 * * * *', getCMCData);

  getKLIndex();
  getCMCData();

  client.fetchUser("217327366102319106")
    .then(u => {
      u.send("TsukiBot loaded.")
        .catch(console.log)
    })
    .catch(console.log);

});

function postHelp(author, code){
  code = code || "none";
  if(code === 'ask' || helpjson[code] !== undefined) {
    const helptext = code === "none" || helpjson[code] === undefined ? helpStr : "Format for " + helpjson[code][0] + "`" + prefix[1] + "` " + helpjson[code][1];
    author.send(helptext);
  } else {
    author.send("Use `.tbhelp` to get a list of commands and their usage.");
  }
}


client.on('guildCreate', guild => {
  if(guild.defaultChannel) {
    guild.defaultChannel.send("ありがとう! Get a list of commands with `.tbhelp`.");
  }
  guild.createRole({
    name: 'File Perms',
    color: 'BLUE',
  })
    .then(role => {
      if(guild.defaultChannel) guild.defaultChannel.send(`Created role ${role} for users who should be allowed to send files!`)
    })
    .catch(console.error)

});

// Event goes off every time a message is read.
client.on('message', message => {

  // Developer mode
  if(process.argv[2] === "-d" && message.author.id !== "217327366102319106")
    return;


  // Keep a counter of messages
  messageCount = (messageCount + 1) % 10000;
  if(messageCount === 0) referenceTime = Date.now();

  if(message.guild && !message.guild.roles.exists('name', 'File Perms')) {
    message.guild.createRole({
      name: 'File Perms',
      color: 'BLUE',
    })
      .then(role => message.channel.send(`Created role ${role} for users who should be allowed to send files!`))
      .catch(0)
  }

  // Remove possibly unsafe files
  if(message.member && !message.member.roles.exists('name', 'File Perms'))
    for(let a of message.attachments){
      if(extensions.indexOf((ar => ar[ar.length-1])(a[1].filename.split('.')).toLowerCase()) === -1){
        message.delete().then(msg => console.log(`Deleted message from ${msg.author}`)).catch(0);
        break;
      }
    }


  // Update every 100 messages
  if(Math.floor(Math.random() * 100) === 42){
    snekfetch.post(`https://discordbots.org/api/bots/${client.user.id}/stats`)
      .set('Authorization', keys['dbots'])
      .send({ server_count: client.guilds.size })
      .then(console.log('updated dbots.org status.'))
      .catch(e => console.warn('dbots.org down'))
  }

  // Check if it's a DM channel
  if(message.guild === null) return;


  // Get the permission settigs
  const config = serverConfigs[message.guild.id] || [];


  // Check for perms (temporary)
  message.guild.fetchMember(message.author)
    .then(function(gm) {
      commands(message, gm.roles.some(r => { return r.name === 'TsukiBoter' }), config);
    })
    .catch(0);

  msgAcc += message;

  checkMentions(message, msgAcc, mentionCounter);

  if(msgAcc.length > MESSAGE_LIMIT) {
    msgAcc = "";
    Object.keys(mentionCounter).forEach(function(m){
      mentionCounter[m] = 0;
    });
  }

})

/* -------------------------------------------------------

   This is the main method. It gets the current message
   and a boolean that states if the sender has a
   botAdmin role.

   The first section checks for multi-parameter inputs,
   such as k or c. Multi-parameter inputs have the
   format [prefix] [command] [parameters].

   The second section checks for simple parameter
   inputs. These are of the form [prefix][command].

   These cases default to posting the help text. The
   reference text is found in common/help.txt.

 ------------------------------------------------------- */


function commands(message, botAdmin, config){

  // Get the channel where the bot will answer.
  let channel = message.channel;

  // Split the message by spaces.
  let code_in = message.content.split(' ');

  // Check for prefix start.
  let hasPfx = "";
  prefix.map(pfx => hasPfx = (code_in[0].indexOf(pfx) === 0 ? pfx : hasPfx));

  // Cut the prefix.
  let code_in_pre = code_in[0];
  code_in[0] = code_in[0].replace(hasPfx,"");

  // Check for bot prefix
  if(hasPfx === ""){
    return;
  } else if(prefix.indexOf(code_in_pre) > -1){

    // Remove the prefix stub
    code_in.splice(0,1);

    // Make lower case
    code_in[0] = code_in[0].toLowerCase();

    // Get the command
    let command = code_in[0];

    // Check if there is content
    if(code_in.length > 1 && code_in.length < 30){

      /* --------------------------------------------------------------------------------
        First we need to get the supplied coin list. Then we apply a filter function.

        Coins not found are skipped for the commands.
      ---------------------------------------------------------------------------------- */

      let params = code_in.slice(1,code_in.length).filter(function(value){

        // --------- Request Counter ---------------------------------------------------
        if(code_in[0]!== 'e' && code_in[0] !== 'sub' && code_in[0] !== 'subrole'){
          requestCounter[value.toUpperCase()]++;
        }
        // -----------------------------------------------------------------------------

        return !isNaN(value) || pairs.indexOf(value.toUpperCase()) > -1; 

      });

      // Keeping the pad
      params.unshift('0');

      if(config.indexOf(command) === -1 && (params.length > 1 || command === 'cmc')){

        // GDAX call
        if(command === 'gdax' || command === 'g'){
          getPriceGDAX(params[1], 'USD', (params[2] != null && !isNaN(params[2]) ? params[2] : -1), channel);

          // Kraken call
        } else if(command === 'krkn' || command === 'k'){
          getPriceKraken(params[1], (params[2] === null ? 'USD' : params[2]), (params[3] != null && !isNaN(params[3]) ? params[3] : -1), channel);

          // Finex call
        } else if(command === 'bfx' || command === 'f'){
          getPriceFinex(params[1], params[2] === null ? '' : params[2], channel);

          // CMC call
        } else if(command === 'cmc' || command === 'cmcs'){
          let ext = command.slice(-1);
          code_in.splice(0,1);
          getPriceCMC(code_in, channel, '-', ext);
          
          // CryptoCompare call
        } else if(command === 'crcp' || command === 'c' || command === 'cs'){
          let ext = command.slice(-1);
          params.splice(0,1);
          getPriceCC(params, channel, '-', ext);

          // KLI call (skip the filter)
        } else if(command === 'kli'){
          code_in.splice(0,1);
          getKLI(code_in, channel);

          // Compare call (skip the filter)
        } else if(command === 'mc'){
          compareCoins(code_in[1], (code_in[2] ? code_in[2] : 'BTC'),  channel);

          // Configure personal array
        } else if( /pa[\+\-]?/.test(command)){
          let action = command[2] || '';
          params.splice(0,1);

          params.map(function(x){ return x.toUpperCase() });
          getCoinArray(message.author.id, channel, params, action);

          // Set coin roles
        } else if(command === 'join'){
          params.splice(0,1);
          setSubscriptions(message.author, message.guild, params);

          // Set coin role perms
        } else if(command === 'setsub'){
          if(hasPermissions(message.author.id, message.guild) || botAdmin){
            params.splice(0,1);
            params.unshift('m');
            setSubscriptions(message.author, message.guild, params);
          }

          // Poloniex call
        } else if(command === 'polo' || command === 'p'){
          getPricePolo(params[1], (params[2] == null ? 'BTC' : params[2]), channel)

          // Bittrex call
        } else if(command === 'bit' || command === 'b'){
          getPriceBittrex(params.slice(1,params.size), (params[2] != null && params[2][0] === "-" ? params[2] : "BTC"), channel)

          // Binance call (no filter)
        } else if(command === 'bin' || command === 'n'){
          getPriceBinance(code_in.slice(1,params.size), (code_in[2] != null && code_in[2][0] === "-" ? code_in[2] : "BTC"), channel)

          // Etherscan call
        } else if((command === 'escan' || command === 'e')){
          if(params[1].length == 42){
            getEtherBalance(params[1], channel);
          } else if(params[1].length == 66){
            getEtherBalance(params[1], channel, 'tx');
          } else {
            channel.send("Format: `.tb e [HEXADDRESS or TXHASH]` (with prefix 0x).");
          }

          // Give a user an expiring role
        } else if(command === 'sub'){
          if(hasPermissions(message.author.id, message.guild)){
            if(typeof(params[2]) === 'string' && message.mentions.users.size > 0){
              message.mentions.users.forEach(function(u){ temporarySub(u.id, params[2], message.guild, message.channel); })
            } else {
              channel.send("Format: `.tb sub @user rolename`.");
            }

          }

          // Create an expiring role
        } else if(command === 'subrole'){
          if(hasPermissions(message.author.id, message.guild)){
            if(typeof(params[1]) === 'string'){
              setRoles(params[1], message.guild, message.channel)
            } else {
              channel.send("Format: `.tb subrole Premium`. (The role title is trimmed to 20 characters.)")
            }
          }

          // Catch-all help
        } else {
          postHelp(channel, command);
        }
      } else {
        postHelp(channel, command);
      }
    } else {
      postHelp(channel, command);
    }

    // Shortcut section
  } else {

    let scommand = code_in[0];

    // Get DiscordID via DM
    if(scommand === 'id'){
      message.author.send("Your ID is `" + message.author.id + "`.");

      // Remove the sub tags
    } else if(scommand === 'leave'){
      setSubscriptions(message.author, message.guild, ['r']);

      // Load configuration message
    } else if(scommand === 'config'){
      if(hasPermissions(message.author.id, message.guild) || botAdmin)
        loadConfiguration(message);

      // Restore the sub tags
    } else if(scommand === 'resub'){
      setSubscriptions(message.author, message.guild, ['S']);

      // Get personal array prices
    } else if( /pa[\+\-\*]?/.test(scommand)){
      // ----------------------------------------------------------------------------------------------------------------
      // ----------------------------------------------------------------------------------------------------------------
      if(message.author.id !== client.user.id)
        ProductRegister.methods.checkPayment(message.author.id).call()
          .then(function(paid) {
            if(paid){
              getCoinArray(message.author.id, channel, '', scommand[2] || '-');
            } else {
              channel.send("Please pay (free KETH) for this service. Visit https://www.tsukibot.com on the Kovan Network.")
            }
          })
          .catch(console.log);
      // ----------------------------------------------------------------------------------------------------------------
      // ----------------------------------------------------------------------------------------------------------------

      // Get available roles
    } else if(scommand === 'list'){
      code_in.splice(0,1);
      code_in.unshift('g');
      setSubscriptions(message.author, message.guild, code_in);

      // Get GDAX ETHX
    } else if (scommand === 'g'){
      if(code_in[1] && code_in[1].toUpperCase() === 'EUR'){
        getPriceGDAX('ETH', 'EUR', -1, channel);
      } else if(code_in[1] && code_in[1].toUpperCase() === 'BTC'){
        getPriceGDAX('BTC', 'USD', -1, channel);
      } else {
        getPriceGDAX('ETH', 'USD', -1, channel);
      }

      // Get Kraken ETHX
    } else if (scommand === 'k'){
      if(code_in[1] && code_in[1].toUpperCase() === 'EUR'){
        getPriceKraken('ETH','EUR',-1, channel)
      } else if(code_in[1] && code_in[1].toUpperCase() === 'BTC'){
        getPriceKraken('XBT', 'USD', -1, channel);
      } else {
        getPriceKraken('ETH','USD',-1, channel);
      }

      // Get Poloniex ETHBTC
    } else if (scommand === 'p'){
      getPricePolo('ETH', 'BTC', channel)

      // Get prices of popular currencies
    } else if (scommand === 'pop'){
      getPriceCC(['ETH','BTC','XRP','LTC','GNT'], channel)

      // Get Bittrex ETHBTC
    } else if (scommand === 'b'){
      getPriceBittrex('ETH', 'BTC', channel)

      // Call help scommand
    } else if (scommand === 'help' || scommand === 'h'){
      postHelp(message.author, 'ask');

      // Call KL Index
    } else if (scommand === 'kli'){
      let title = 'KL Index Highs';
      let kl = '';
      kliArray.forEach(function(v){
        if(v['h.ticker'] !== 'USDT' && v.x > -10 && v.kli > 0.1)
          kl += '`' + v['h.ticker'] + '` - `' + v.kli + '`\n';
      });

      let embed  = new Discord.RichEmbed()
        .addField(title, kl)
        .setColor('WHITE')
        .setFooter('Part of CehhNet', 'https://imgur.com/OG77bXa.png')

      channel.send({embed});

      // Statistics
    } else if (scommand === 'stat'){
      const users       = (client.guilds.reduce(function(sum, guild){ return sum + guild.memberCount;}, 0));
      const guilds      = (client.guilds.size);
      const msgpersec   = Math.trunc(messageCount * 1000 * 60 / (Date.now() - referenceTime));
      const topCrypto   = coinArrayMax(requestCounter);
      const popCrypto   = coinArrayMax(mentionCounter);


      const msgh = ("Serving `" + users + "` users from `" + guilds + "` servers.\n"
        + "⇒ Current uptime is: `" + Math.trunc(client.uptime / (3600000)) + "hr`.\n"
        + "⇒ Current messages per minute is `" + msgpersec + "`.\n"
        + (topCrypto[1] > 0 ? "⇒ Top requested crypto: `" + topCrypto[0] + "` with `" + topCrypto[1] + "%` dominance.\n" : "")
        + (popCrypto[1] > 0 ? "⇒ Top mentioned crypto: `" + popCrypto[0] + "` with `" + popCrypto[1] + "%` dominance.\n" : "")
        + "⇒ Support or share Tsuki here: <https://discordbots.org/bot/313452464399581194>.\n"
        + "`⇒ ETH donations appreciated at: 0xE2784BE97A7B993553F20c120c011274974EC505.`");

      let embed         = new Discord.RichEmbed()
        .addField("TsukiBot Stats", msgh)
        .setColor('WHITE')
        .setThumbnail('https://imgur.com/7pLQHei.png')
        .setFooter('Part of CehhNet', 'https://imgur.com/OG77bXa.png')

      channel.send({embed});

      // Meme
    } else if (scommand === '.dank'){
      channel.send(":ok_hand:           :tiger:"+ '\n' +
        " :eggplant: :zzz: :necktie: :eggplant:"+'\n' +
        "                  :oil:     :nose:"+'\n' +
        "            :zap:  8=:punch: =D:sweat_drops:"+'\n' +
        "         :trumpet:   :eggplant:                       :sweat_drops:"+'\n' +
        "          :boot:    :boot:");

      // Another meme
    } else if (scommand === '.moonwhen'){
      channel.send('Soon™')
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

function coinArrayMax(counter) {
  let max = 0;
  let sum = 1;
  let maxCrypto = "";

  for(let key in counter) {
    sum += counter[key];
    if(counter[key] !== 0) console.log(counter[key] + " " + key)
    if(counter[key] > max) {
      max = counter[key];
      maxCrypto = key;
    }
  }

  console.log(counter)
  return [maxCrypto, Math.trunc((max / sum) * 100)];
}

function loadConfiguration(msg){
  let channel = msg.channel;

  channel.send("__**Commands**__\n\n" +
    ":regional_indicator_k: = Kraken\n\n" +
    ":regional_indicator_g: = GDAX\n\n" +
    ":regional_indicator_c: = CryptoCompare\n\n" +
    ":regional_indicator_p: = Poloniex\n\n" +
    ":regional_indicator_e: = Etherscan\n\n" +
    ":regional_indicator_b: = Bittrex\n\n" +
    ":moneybag: = Volume\n\n" +
    ":envelope: = Subscription Channels\n\n" +
    "`React to the according symbols below to disable a service. Save settings with the checkmark.`")
    .then(msg => {
      configIDs.push(msg.id);
      msg.react(emojiConfigs[0]).catch(console.log);
    });

}



/* ----------------------------------------------------

 EventHandler for reactions added.

   This event handles 2 functions.
   1. Delete messages when the cross emoji is added.
   2. Post the reactions to the server settings.
    2a. First it will recursively add the emoji reacts
    2b. Then it will react when the checkmark is pressed

 ----------------------------------------------------- */

client.on('messageReactionAdd', (messageReaction, user) => {

  const message         = messageReaction.message;
  const guild           = messageReaction.message.guild.id;
  const reactions       = messageReaction.message.reactions;

  // Function 1
  if(removeID(messageReaction.message.id) != -1 && messageReaction.emoji.identifier == "%E2%9D%8E" && messageReaction.count == 2){
    messageReaction.message.delete().catch();
  }


  // Function 2a.
  if(configIDs.indexOf(message.id) > -1 && reactions.size < emojiConfigs.length){
    message.react(emojiConfigs[emojiConfigs.indexOf(messageReaction.emoji.toString()) + 1]).catch(console.log)
  }

  // Function 2b.
  if(configIDs.indexOf(message.id) > -1 && reactions.size === emojiConfigs.length){             // Finished placing options
    if(messageReaction.emoji.toString() === emojiConfigs[emojiConfigs.length - 1]){             // Reacted to checkmark
      if(hasPermissions(user.id, message.guild)){                                               // User has permissions

        // Get from the reactions those which have reactions from someone with permissions
        let validPerms = reactions.filter(r => {
          return r.users.some(function (e, i, a){
            return hasPermissions(e.id, message.guild)
          })
        });

        // Get an array form of the permissions
        serverConfigs[guild] = validPerms.map(e => {
          return availableCommands[emojiConfigs.indexOf(e.emoji.toString())]
        });

        // Write to a file for storage
        fs.writeFile("common/serverPerms.json", JSON.stringify(serverConfigs), function(err){
          if(err) return console.log(err);
          console.log("Server config saved");
        });

        // Delete the message
        message.delete()
          .then(function() {
            if(serverConfigs[guild].length > 1)
              message.channel.send("**Settings updated**\nBlocked services: `" + serverConfigs[guild].slice(0,-1).join(" ") + "`.")
                .catch(console.log);
          })
          .catch(console.log);
      }
    }
  }
});

/* ---------------------------------

  getCMCData()

  Update the array every 5 minutes
  (Endpoint update rate)

 ---------------------------------- */


async function getCMCData(){
  cmcArray = await clientcmc.ticker({limit: 0})

  ccmArrayDict = {};
  cmcArray.forEach(function(v){
    if(!cmcArrayDict[v.symbol])
      cmcArrayDict[v.symbol] = v;
  });
}
/* ---------------------------------

  getKLIndex()

  Assign the top KL Index coins

 ---------------------------------- */


function getKLIndex(){
  try { 
    kliArray = R('kl_idx.R').callSync();

    kliArray.forEach(function(v){
      kliArrayDict[v['h.ticker']] = v;
    });
  } catch(e) {
    console.log('failed R script execution');
  }
}

/* ---------------------------------

  hasPermissions(id, guild)

  id) has to be the ID of the user,
  regardless of the original type of
  object.

  guild) is the guild object where
  the action is executed.

 ---------------------------------- */

function hasPermissions(id, guild){
  return guild.owner.id === id;
}


// Jack in, Megaman. Execute.
client.login(token);

// -------------------------------------------
// -------------------------------------------
// -------------------------------------------
//
//            for a better world.
//
// -------------------------------------------
// -------------------------------------------
// -------------------------------------------
