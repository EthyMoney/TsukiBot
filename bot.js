// File read for JSON and PostgreSQL
var fs = require('fs');
var pg = require('pg');

// Set the prefix
var prefix = ['-t', '.tb', 'scottyisgay', 't'];

// Files allowed
const extensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'mov', 'mp4'];

// Allowed coins in commands
const pairs		= JSON.parse(fs.readFileSync("./common/coins.json","utf8"))
const volcoins 		= ['ETH', 'ETHX']
const bittrexcoins 	= ['GNT', 'RLC', 'ANT', 'DGD', 'TKN']
const trexthrottle	= 5000
const gdaxthrottle	= 2

// Help string
var title 		= '__**TsukiBot**__ :full_moon: \n'
var github		= 'Check the GitHub repo for more detailed information. <https://github.com/OFRBG/TsukiBot#command-table>'

//const helpStr = title + '```Markdown\n' + krakenhelp + gdaxhelp + poloniexhelp + escanhelp + '```' + shortcuts + ticker + volumehelp + tips + github;
const helpStr = fs.readFileSync('./common/help.txt','utf8');


// HTTP request
var request = require("request")

// Get the api keys
var keys = JSON.parse(fs.readFileSync('keys.api','utf8'))


// Include api things
const Discord 		= require('discord.js');
const Client 		= require('coinbase').Client;
const KrakenClient 	= require('kraken-api');
const Gdax 		= require('gdax');
const bittrex 		= require('node.bittrex.api');
const api 		= require('etherscan-api').init(keys['etherscan']);
const cc 		= require('cryptocompare');

// ----------------------------------------------------------------------------------------------------------------
// Web3
const web3              = require('web3');
const Web3              = new web3(new web3.providers.HttpProvider('https://kovan.infura.io/' + keys['infura']));

// ----------------------------------------------------------------------------------------------------------------

var ProductRegister     = new Web3.eth.Contract([{"constant":true,"inputs":[{"name":"_id","type":"string"}],"name":"checkPayment","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"}],"0x1B6f90a42cc86749052B4C9ca9ae9343E8a90d17");


// CryptoCompare requires global fetch
global.fetch = require('node-fetch');

// Include stuff
var PythonShell = require('python-shell');

// Declare channels and the channels to broadcast
var channelName = 'general';

// array of IDs for block removal
var blockIDs = [];

// blockIDs remove function
function removeID(id) {
  // index of the passed message.id
  var index = blockIDs.indexOf(id);

  // .indexOf returns -1 if not in array, so this checks if message is infact in blockIDs.
  if (index > -1) {
    // removes id from array
    blockIDs.splice(index, 1);
    blockIDs = blockIDs.splice(0,4);
  }

}

//GDAX vars
var gdaxhandle, gdaxhandle2;
var seconds = 0;
var btcusd = 0;

// Bittrex handle
var bittrexhandle = {};

// Initialize api things
var clientGDAX = new Client({'apiKey':keys['coinbase'][0],'apiSecret': keys['coinbase'][1]});
var clientKraken = new KrakenClient();


//------------------------------------------
//------------------------------------------


// This methods are calls on the api of the
// respective exchanges. The user can send
// an optional parameter to calculate %
// change on a base price.

// Function that gets GDAX spot prices
function getPriceGDAX(coin1, coin2, base, chn) {

  // Get the spot price and send it to general
  clientGDAX.getSpotPrice({'currencyPair': coin1.toUpperCase() + '-' + coin2.toUpperCase()}, function(err, price) {
    if(err) {chn.send('API Error.')}
    else {
      var per = "";
      if (base != -1) per = "\n Change: `" + Math.round(((price.data.amount/base-1) * 100)*100)/100 + "%`";
      chn.send('__GDAX__ Price for **'  + coin1.toUpperCase()
          + '-' + coin2.toUpperCase() + '** is : `'  + price.data.amount + ' ' + coin2.toUpperCase() + "`." + per);
    }


  });

}


//------------------------------------------
//------------------------------------------


// Function that gets CryptoCompare prices
function getPriceCC(coins, chn) {

  // Get the spot price of the pair and send it to general
  cc.priceFull(coins.map(function(c){return c.toUpperCase();}),['USD', 'EUR'])
    .then(prices => {
      var msg = '__**CryptoCompare**__\n';

      for(var i = 0; i < coins.length; i++)
        msg += ('- **' + coins[i].toUpperCase() + '-USD** is : `' +
            prices[coins[i].toUpperCase()]['USD']['PRICE'] + ' USD` (`' +
              Math.round(prices[coins[i].toUpperCase()]['USD']['CHANGEPCT24HOUR']*100)/100 + '%`).\n'
            );

      chn.send(msg);

    })
  .catch(console.log);

}


//------------------------------------------
//------------------------------------------


// Function that gets Kraken prices
function getPriceKraken(coin1, coin2, base, chn) {

  // Get the spot price of the pair and send it to general
  clientKraken.api('Ticker', {"pair": '' + coin1.toUpperCase() + '' + coin2.toUpperCase() + ''}, function(error, data) {
    if(error) {chn.send('Unsupported pair')}
    else {
      var per = ""
        var s = (data.result[Object.keys(data.result)]['c'][0]);
      if (base != -1) per = "\n Change: `" + Math.round(((s/base-1) * 100)*100)/100 + "%`";
      chn.send('__Kraken__ Price for **'  + coin1.toUpperCase()
          + '-' + coin2.toUpperCase() + '** is : `'  + s +' ' + coin2.toUpperCase() + "`." + per);

    }

  });

}


//------------------------------------------
//------------------------------------------


// Function that gets Poloniex prices
function getPricePolo(coin1, coin2, chn) {

  url = "https://poloniex.com/public?command=returnTicker";
  coin2 = coin2.toUpperCase();

  if(coin2 === 'BTC' || coin2 === 'ETH' || coin2 === 'USDT'){
    request({
      url: url,
      json: true
    }, function(error, response, body){
      var pair = coin2.toUpperCase() + '_' + coin1.toUpperCase();

      try {
        var s = body[pair]['last']
          chn.send('__Poloniex__ Price for **'  + coin2.toUpperCase()
              + '-' + coin1.toUpperCase() + '** is : `'  + s + ' ' + coin2.toUpperCase() + "`.");
      } catch (err) {
        console.log(err);
        chn.send("Poloniex API Error.")
      }


    });
  }

}


//------------------------------------------
//------------------------------------------


// Bittrex API v2

bittrex.options({
  'stream' : false,
  'verbose' : false,
  'cleartext' : true,
});

function getPriceBittrex(coin1, coin2, chn) {

  coin1 = coin1.toUpperCase()
    coin2 = coin2.toUpperCase() || 'BTC'
    if(coin2 === 'BTC' || coin2 === 'ETH' || coin2 === 'USDT'){
      bittrex.sendCustomRequest( 'https://bittrex.com/Api/v2.0/pub/market/GetMarketSummary?marketName=' + coin2 + '-' + coin1, function( data ) {
          data = JSON.parse(data)

          if(data && data['result']){
            var p = data['result'];
            chn.send('__Bittrex__ Price for **'  + coin2.toUpperCase()
                + '-' + coin1.toUpperCase() + '** is : `'  + p['Last'] + ' ' + coin2.toUpperCase() + "`.");
          } else {
            chn.send('Bittrex API error.')
          }

          });
    } else {
      chn.send('Invalid pair. (Use `ETHX, BTCX, USDTX` only.)')
    }
}


//------------------------------------------
//------------------------------------------


// This method runs the python script that
// reads from the api's until it is killed
// from outside bot.js. It runs
// on its own.

// Create a logger for a certain set of coins
function createLogger(coins){
  PythonShell.run('./tsukiserverlog.py', {args:coins}, function(err) {if(err) console.log(err);});
}


//------------------------------------------
//------------------------------------------


// This function runs python scripts once
// and gets their stdout output. It calls
// tsukiserver, which will call either the
// s command or the p command.

function executeCommand(c, opts, chn) {
  console.log(opts)

    coin = opts.coin;
  arg1 = opts.arg1 || -1;
  arg2 = opts.arg2 || 'p';

  var pyshell = new PythonShell('./tsukiserver.py', {args:[coin,arg1,arg2]});
  pyshell.send(c + '\r\n').end(function(err){if(err) console.log(err);});

  pyshell.stdout.on('data', function (data) {
    console.log(data);
    chn.send(data).then(message => {
      message.react("\u274E");
      blockIDs.push(message.id);

      // if no removal is asked for in 2 minutes, removes message id from blockIDs so array doesnt get stacked infinitely
      setTimeout(function(){ removeID(message.id); }, 120000);
    });
  });


}


//------------------------------------------
//------------------------------------------


// From the etherscan api, get the balance
// for a given address. The balance is returned
// in weis.

function getEtherBalance(address, chn){
  var balance = api.account.balance(address);
  balance.then(function(res){
    chn.send('The total ether registered for `' + address + '` is: `' + res['result'] / 1000000000000000000 + ' ETH`.');
  });
}


//------------------------------------------
//------------------------------------------


// This is a setup for users to create
// their own arrays of coins. They can check
// the price from they array by typing .tbpa
// as a shortcut.

function getCoinArray(id, chn, coins = ''){
  const conString = "postgres://tsukibot:" + keys['tsukibot'] + "@localhost:5432/tsukibot";
  coins = '{' + coins + '}';

  var conn = new pg.Client(conString);
  conn.connect();

  var query;
  if(coins === '{}') {
    query = conn.query("SELECT * FROM profiles where id = $1;", [id], (err, res) => {
      if (err) {console.log(err);}
      else {
        if(res.rows[0])
          getPriceCC(res.rows[0].coins,chn)
        else
          chn.send('Set your array with `.tb pa [array]`.')
      }

      conn.end();
    });
  } else {
    query = conn.query(("INSERT INTO profiles(id, coins) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET coins = $2;"), [ id, coins ], (err, res) => {
      if (err) {console.log(err);}

      conn.end();
    });
  }

}



//------------------------------------------
//------------------------------------------
//------------------------------------------
//------------------------------------------
//------------------------------------------
//------------------------------------------

// Create a client and a token
const client = new Discord.Client();
const token = keys['discord'];

// Wait for the client to be ready.
client.on('ready', () => {

  console.log('ready');

  // When ready, start a logging script for the coins in the array.
  createLogger(volcoins);


});


function postHelp(chn){
  chn.send(helpStr).then(message => {
    message.react("\u274E");
    blockIDs.push(message.id);

    // if no removal is asked for in 2 minutes, removes message id from blockIDs so array doesnt get stacked infinitely
    setTimeout(function(){ removeID(message.id); }, 120000);
  });
}


// Event goes off every time a message is read.
client.on('message', message => {

  for(let a of message.attachments){
    if(extensions.indexOf((ar => ar[ar.length-1])(a[1].filename.split('.')).toLowerCase()) === -1){
      message.delete().then(msg => console.log(`Deleted message from ${msg.author}`));
      break;
    }
  }

  commands(message);

})


function commands(message) {

  // Get the channel where the bot will answer.
  channel = message.channel;

  // Split the message by spaces.
  code_in = message.content.split(' ');

  // Check for bot prefix
  if(prefix.indexOf(code_in[0].toLowerCase()) > -1) {

    // Remove the prefix
    code_in.splice(0,1);

    // Check if there is content
    if(code_in.length > 1) {

      // Check if the command exists and it uses a valid pair
      if((code_in.slice(1,code_in.length).filter(function(value){ return !isNaN(value) || pairs.indexOf(value.toUpperCase()) > -1;  }).length + 1  == code_in.length)) {

        // Volume command
        if((code_in[0] === 'vol' || code_in[0] === 'v') && volcoins.indexOf(code_in[1].toUpperCase()) > -1){
          executeCommand('s',
              {
                'coin' 	: code_in[1],
                'arg1' 	: (code_in[2] != null && !isNaN(Math.floor(code_in[2])) ? code_in[2] : -1),
                'arg2' 	: (code_in[3] != null && code_in[3][0] === 'g') ? 'g' : 'p'
              }, channel)

          // Whale command (inactive)
        } else if(false && code_in[0] === 'wh' || code_in[0] === 'w'){
          executeCommand('p',
              {
                'coin' 	: code_in[1],
              }, channel)

          // GDAX call
        } else if(code_in[0] === 'gdax' || code_in[0] === 'g') {
          getPriceGDAX(code_in[1], 'USD', (code_in[2] != null && !isNaN(code_in[2]) ? code_in[2] : -1), channel)

            // Kraken call
        } else if(code_in[0] === 'krkn' || code_in[0] === 'k') {
          getPriceKraken(code_in[1], (code_in[2] == null ? 'USD' : code_in[2]), (code_in[3] != null && !isNaN(code_in[3]) ? code_in[3] : -1), channel)

            // CryptoCompare call
        } else if(code_in[0] === 'crcp' || code_in[0] === 'c') {
          code_in.splice(0,1);
          getPriceCC(code_in, channel);

          // Set personal array
        } else if(code_in[0] === 'pa'){
          code_in.splice(0,1);
          getCoinArray(message.author.id, channel, code_in);

          // Poloniex call
        } else if(code_in[0] === 'polo' || code_in[0] === 'p'){
          getPricePolo(code_in[1], (code_in[2] == null ? 'USDT' : code_in[2]), channel)

            // Bittrex call
        } else if(code_in[0] === 'bit' || code_in[0] === 'b'){
          getPriceBittrex(code_in[1], (code_in[2] == null ? 'BTC' : code_in[2]), channel)

            // Etherscan call
        } else if((code_in[0] === 'escan' || code_in[0] === 'e') && code_in[1].length == 42) {
          getEtherBalance(code_in[1], channel);

          // Catch-all help
        } else {
          postHelp(channel);
        }
      }
    }


    // Shortcut section


  } else if(code_in[0].length > 1) {

    hasPfx = "";
    prefix.map(pfx => hasPfx = (code_in[0].indexOf(pfx) === 0 ? pfx : hasPfx));

    code_in[0] = code_in[0].replace(hasPfx,"");

    // Get DiscordID via DM
    if(code_in[0] === 'id') {
      message.author.send("Your ID is `" + message.author.id + "`.");

      // Get personal array prices
    } else if(code_in[0] === 'pa') {
      // ----------------------------------------------------------------------------------------------------------------
      // ----------------------------------------------------------------------------------------------------------------
      if(message.author.id !== client.user.id)
        ProductRegister.methods.checkPayment(message.author.id).call()
          .then((paid) => {
            if(paid)
              getCoinArray(message.author.id, channel);
            else
              channel.send("Please pay for this service. Visit https://www.tsukibot.tk on the Kovan Network.")
          });
      // ----------------------------------------------------------------------------------------------------------------
      // ----------------------------------------------------------------------------------------------------------------

      // Get GDAX ETHX
    } else if (code_in[0] === 'g') {
      if(code_in[1] && code_in[1].toUpperCase() === 'EUR')
        getPriceGDAX('ETH', 'EUR', -1, channel);
      else if(code_in[1] && code_in[1].toUpperCase() === 'BTC')
        getPriceGDAX('BTC', 'USD', -1, channel);
      else
        getPriceGDAX('ETH', 'USD', -1, channel);

      // Get Kraken ETHX
    } else if (code_in[0] === 'k') {
      if(code_in[1] && code_in[1].toUpperCase() === 'EUR')
        getPriceKraken('ETH','EUR',-1, channel)
      else if(code_in[1] && code_in[1].toUpperCase() === 'BTC')
        getPriceKraken('XBT', 'USD', -1, channel);
      else
        getPriceKraken('ETH','USD',-1, channel);

      // Get Poloniex ETHBTC
    } else if (code_in[0] === 'p') {
      getPricePolo('ETH', 'BTC', channel)

        // Get prices of popular currencies
    } else if (code_in[0] === 'pop') {
      getPriceCC(['ETH','BTC','XRP','LTC','GNT'], channel)

        // Get Bittrex ETHBTC
    } else if (code_in[0] === 'b') {
      getPriceBittrex('ETH', 'BTC', channel)

        // Call help command
    } else if (code_in[0] === 'bothelp' || code_in[0] === 'th') {
      postHelp(channel);

      // Meme
    } else if (code_in[0] === '.dank') {
      channel.send(":ok_hand:           :tiger:"+ '\n' +
          " :eggplant: :zzz: :necktie: :eggplant:"+'\n' +
          "                  :oil:     :nose:"+'\n' +
          "            :zap:  8=:punch: =D:sweat_drops:"+'\n' +
          "         :trumpet:   :eggplant:                       :sweat_drops:"+'\n' +
          "          :boot:    :boot:");

      // Another meme
    } else if (code_in[0] === '.moonwhen') {
      channel.send('Soon™')
    }
  }

}


// If the message gets 3 reacts for cross, it deletes the info. No idea why 3.
// Update: Now it's only 2.
client.on('messageReactionAdd', messageReaction => {
  if(removeID(messageReaction.message.id) != -1&& messageReaction.emoji.identifier == "%E2%9D%8E" && messageReaction.count == 2) {
    messageReaction.message.delete().catch(console.error)
  }
});


// Jack in, Megaman. Execute.
client.login(token);
