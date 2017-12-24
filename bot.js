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


// Include api things
const Discord 		= require('discord.js');
const Client 		= require('coinbase').Client;
const KrakenClient 	= require('kraken-api');
const bittrex 		= require('node.bittrex.api');
const api 		= require('etherscan-api').init(keys['etherscan']);
const cc 		= require('cryptocompare');



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
var clientGDAX = new Client({'apiKey':keys['coinbase'][0],'apiSecret': keys['coinbase'][1]});
var clientKraken = new KrakenClient();




// -------------------------------------------
// -------------------------------------------
//
//             UTILITY FUNCTIONS
//
// -------------------------------------------
// -------------------------------------------


// These methods are calls on the api of the
// respective exchanges. The user can send
// an optional parameter to calculate %
// change on a base price.

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


// Function that gets CryptoCompare prices

function getPriceCC(coins, chn, action = '-', ext = 'd'){

  // Get the spot price of the pair and send it to general
  cc.priceFull(coins.map(function(c){return c.toUpperCase();}),['USD', 'BTC'])
    .then(prices => {
      let msg = '__CryptoCompare__ Price for:\n';
      let ordered = {};
      
      for(let i = 0; i < coins.length; i++){
        let bp = prices[coins[i].toUpperCase()]['BTC']['PRICE'].toFixed(8) + ' BTC` (`' +
          Math.round(prices[coins[i].toUpperCase()]['BTC']['CHANGEPCT24HOUR']*100)/100 + '%`)';
        let up = prices[coins[i].toUpperCase()]['USD']['PRICE'] + ' USD` (`' +
          Math.round(prices[coins[i].toUpperCase()]['USD']['CHANGEPCT24HOUR']*100)/100 + '%`)';

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


// Function that gets Kraken prices

function getPriceKraken(coin1, coin2, base, chn){

  // Get the spot price of the pair and send it to general
  clientKraken.api('Ticker', {"pair": '' + coin1.toUpperCase() + '' + coin2.toUpperCase() + ''}, function(error, data){
    if(error){chn.send('Unsupported pair')}
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


// Bittrex API v2

bittrex.options({
  'stream' : false,
  'verbose' : false,
  'cleartext' : true,
});

function getPriceBittrex(coin1, coin2, chn){

  coin1 = coin1.map(function(c){ return c.toUpperCase(); }).sort();
  coin1.push('BTC');

  //bittrex.sendCustomRequest( 'https://bittrex.com/Api/v2.0/pub/market/GetMarketSummary?marketName=' + coin2 + '-' + coin1, function( data ){
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


// From the etherscan api, get the balance
// for a given address. The balance is returned
// in weis.

function getEtherBalance(address, chn){
  let balance = api.account.balance(address);
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
          getPriceCC(res.rows[0].coins, chn, action);
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
      console.log(res.rows[0])
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

  // When ready, start a logging script for the coins in the array.
  // createLogger(volcoins);

  var deleter      = schedule.scheduleJob('42 * * * *', checkSubStatus);
  var mentionLog   = schedule.scheduleJob('42 * * * * *', checkMentions);

  client.fetchUser("217327366102319106")
    .then(u => { 
      u.send("TsukiBot loaded.")
        .catch(console.log)
    })
    .catch(console.log);

});


function postHelp(author, code){
  code = code || "none";
  const helptext = code === "none" ? helpStr : "Format for " + helpjson[code][0] + "`" + prefix[1] + "` " + helpjson[code][1];

  author.send(helptext);

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
      .catch(console.log)
  }

  // Remove possibly unsafe files
  if(message.member && !message.member.roles.exists('name', 'File Perms'))
    for(let a of message.attachments){
      if(extensions.indexOf((ar => ar[ar.length-1])(a[1].filename.split('.')).toLowerCase()) === -1){
        message.delete().then(msg => console.log(`Deleted message from ${msg.author}`)).catch(console.log);
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

    // Check if there is content
    if(code_in.length > 1 && code_in.length < 11){

      /* --------------------------------------------------------------------------------
        First we need to get the supplied coin list. Then we apply a filter function
        and check for each value if:

           1. it is in the whitelisted array
           2. is part of a volume command
           3. it is part of an address

        The conditions for the commands to pass are that the command is not blocked
        by server permissions, and that the parameter coins given are whitelisted.

        To check for whitelisted coins, we filter the array and compare final size.
      ---------------------------------------------------------------------------------- */


      if((code_in.slice(1,code_in.length).filter(function(value){

        // --------- Request Counter ---------------------------------------------------
        if(code_in[0] !== 'e' && code_in[0] !== 'sub' && code_in[0] !== 'subrole'){
          requestCounter[value.toUpperCase()]++;
        }
        // -----------------------------------------------------------------------------
        
        return !isNaN(value) || pairs.indexOf(value.toUpperCase()) > -1 || code_in[0] === 'sub' || code_in[0] === 'subrole';

      }).length + 1  == code_in.length && config.indexOf(code_in[0][0]) === -1)){

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
        } else if(code_in[0] === 'gdax' || code_in[0] === 'g'){
          getPriceGDAX(code_in[1], 'USD', (code_in[2] != null && !isNaN(code_in[2]) ? code_in[2] : -1), channel)

          // Kraken call
        } else if(code_in[0] === 'krkn' || code_in[0] === 'k'){
          getPriceKraken(code_in[1], (code_in[2] == null ? 'USD' : code_in[2]), (code_in[3] != null && !isNaN(code_in[3]) ? code_in[3] : -1), channel)

          // CryptoCompare call
        } else if(code_in[0] === 'crcp' || code_in[0] === 'c' || code_in[0] === 'cs'){
          let ext = code_in[0].slice(-1);
          code_in.splice(0,1);
          getPriceCC(code_in, channel, '-', ext);

          // Configure personal array
        } else if( /pa[\+\-]?/.test(code_in[0])){
          let action = code_in[0][2] || '';
          code_in.splice(0,1);

          code_in.map(function(x){ return x.toUpperCase() });
          getCoinArray(message.author.id, channel, code_in, action);

          // Set coin roles
        } else if(code_in[0] === 'join'){
          code_in.splice(0,1);
          setSubscriptions(message.author, message.guild, code_in);

          // Set coin role perms
        } else if(code_in[0] === 'setsub'){
          if(hasPermissions(message.author.id, message.guild) || botAdmin){
            code_in.splice(0,1);
            code_in.unshift('m');
            setSubscriptions(message.author, message.guild, code_in);
          }

          // Poloniex call
        } else if(code_in[0] === 'polo' || code_in[0] === 'p'){
          getPricePolo(code_in[1], (code_in[2] == null ? 'BTC' : code_in[2]), channel)

          // Bittrex call
        } else if(code_in[0] === 'bit' || code_in[0] === 'b'){
          getPriceBittrex(code_in.slice(1,code_in.size), (code_in[2] != null && code_in[2][0] === "-" ? code_in[2] : "BTC"), channel)

          // Etherscan call
        } else if((code_in[0] === 'escan' || code_in[0] === 'e')){
          if(code_in[1].length == 42){
            getEtherBalance(code_in[1], channel);
          } else {
            channel.send("Format: `.tb e HEXADDRESS` with prefix 0x.");
          }

          // Give a user an expiring role
        } else if(code_in[0] === 'sub'){
          if(hasPermissions(message.author.id, message.guild)){
            if(typeof(code_in[2]) === 'string' && message.mentions.users.size > 0){
              message.mentions.users.forEach(function(u){ temporarySub(u.id, code_in[2], message.guild, message.channel); })
            } else {
              channel.send("Format: `.tb sub @user rolename`.");
            }

          }

          // Create an expiring role
        } else if(code_in[0] === 'subrole'){
          if(hasPermissions(message.author.id, message.guild)){
            if(typeof(code_in[1]) === 'string'){
              setRoles(code_in[1], message.guild, message.channel)
            } else {
              channel.send("Format: `.tb subrole Premium`. (The role title is trimmed to 20 characters.)")
            }
          }

          // Catch-all help
        } else {
          postHelp(channel, code_in[0]);
        }
      }
    } else {
      postHelp(channel, code_in[0]);
    }

    // Shortcut section
  } else {

    // Get DiscordID via DM
    if(code_in[0] === 'id'){
      message.author.send("Your ID is `" + message.author.id + "`.");

      // Remove the sub tags
    } else if(code_in[0] === 'leave'){
      setSubscriptions(message.author, message.guild, ['r']);

      // Load configuration message
    } else if(code_in[0] === 'config'){
      if(hasPermissions(message.author.id, message.guild) || botAdmin)
        loadConfiguration(message);

      // Restore the sub tags
    } else if(code_in[0] === 'resub'){
      setSubscriptions(message.author, message.guild, ['S']);

      // Get personal array prices
    } else if( /pa[\+\-\*]?/.test(code_in[0])){
      // ----------------------------------------------------------------------------------------------------------------
      // ----------------------------------------------------------------------------------------------------------------
      if(message.author.id !== client.user.id)
        ProductRegister.methods.checkPayment(message.author.id).call()
          .then(function(paid) {
            if(paid){
              getCoinArray(message.author.id, channel, '', code_in[0][2] || '-');
            } else {
              channel.send("Please pay (free KETH) for this service. Visit https://www.tsukibot.com on the Kovan Network.")
            }
          })
          .catch(console.log);
      // ----------------------------------------------------------------------------------------------------------------
      // ----------------------------------------------------------------------------------------------------------------

      // Get available roles
    } else if(code_in[0] === 'list'){
      code_in.splice(0,1);
      code_in.unshift('g');
      setSubscriptions(message.author, message.guild, code_in);

      // Get GDAX ETHX
    } else if (code_in[0] === 'g'){
      if(code_in[1] && code_in[1].toUpperCase() === 'EUR'){
        getPriceGDAX('ETH', 'EUR', -1, channel);
      } else if(code_in[1] && code_in[1].toUpperCase() === 'BTC'){
        getPriceGDAX('BTC', 'USD', -1, channel);
      } else {
        getPriceGDAX('ETH', 'USD', -1, channel);
      }

      // Get Kraken ETHX
    } else if (code_in[0] === 'k'){
      if(code_in[1] && code_in[1].toUpperCase() === 'EUR'){
        getPriceKraken('ETH','EUR',-1, channel)
      } else if(code_in[1] && code_in[1].toUpperCase() === 'BTC'){
        getPriceKraken('XBT', 'USD', -1, channel);
      } else {
        getPriceKraken('ETH','USD',-1, channel);
      }

      // Get Poloniex ETHBTC
    } else if (code_in[0] === 'p'){
      getPricePolo('ETH', 'BTC', channel)

      // Get prices of popular currencies
    } else if (code_in[0] === 'pop'){
      getPriceCC(['ETH','BTC','XRP','LTC','GNT'], channel)

      // Get Bittrex ETHBTC
    } else if (code_in[0] === 'b'){
      getPriceBittrex('ETH', 'BTC', channel)

      // Call help command
    } else if (code_in[0] === 'help' || code_in[0] === 'h'){
      postHelp(message.author);

      // Statistics
    } else if (code_in[0] === 'stat'){
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
    } else if (code_in[0] === '.dank'){
      channel.send(":ok_hand:           :tiger:"+ '\n' +
        " :eggplant: :zzz: :necktie: :eggplant:"+'\n' +
        "                  :oil:     :nose:"+'\n' +
        "            :zap:  8=:punch: =D:sweat_drops:"+'\n' +
        "         :trumpet:   :eggplant:                       :sweat_drops:"+'\n' +
        "          :boot:    :boot:");

      // Another meme
    } else if (code_in[0] === '.moonwhen'){
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
    messageReaction.message.delete().catch(console.error);
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
