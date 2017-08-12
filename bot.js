//var pairs = ['AMP', 'ARDR', 'BCN', 'BCY', 'BELA', 'BLK', 'BTCD', 'BTM', 'BTS', 'BURST', 'CLAM', 'DASH', 'DCR', 'DGB', 'DOGE', 'EMC2', 'ETC', 'ETH', 'EXP', 'FCT', 'FLDC', 'FLO', 'GAME', 'GNO', 'GNT', 'GRC', 'HUC', 'LBC', 'LSK', 'LTC', 'MAID', 'NAUT', 'NAV', 'NEOS', 'NMC', 'NOTE', 'NXC', 'NXT', 'OMNI', 'PASC', 'PINK', 'POT', 'PPC', 'RADS', 'REP', 'RIC', 'SBD', 'SC', 'SJCX', 'STEEM', 'STR', 'STRAT', 'SYS', 'VIA', 'VRC', 'VTC', 'XBC', 'XCP', 'XEM', 'XMR', 'XPM', 'XRP', 'XVC', 'ZEC'];

// File read for JSON
var fs = require('fs');	

// Set the prefix
var prefix = '.tb'


// Allowed coins in commands
//const pairs 		= ['ETH', 'ANT', 'ETHX', 'ETC', 'EOS', 'GNT', 'XRP', 'LTC', 'BTC', 'XBT', 'MLN', 'ICN', 'STEEM', 'USDT']
const pairs		= JSON.parse(fs.readFileSync("./common/coins.json","utf8"))
const volcoins 		= ['ETH', 'ETHX']
const bittrexcoins 	= ['GNT', 'RLC', 'ANT', 'DGD', 'TKN']
const trexthrottle	= 5000
const gdaxthrottle	= 2

// Help string
//
var title 		= '__**TsukiBot**__ :full_moon: \n'
//var krakenhelp 		= '* ' + prefix + ' (k)rkn XXX [YYY] [op. base price]\n'
//var gdaxhelp		= '* ' + prefix + ' (g)dax XXX[op. base price]\n' 
//var poloniexhelp	= '* ' + prefix + ' (p)olo XXX [YYY]\n'
//var trexhelp		= '* ' + prefix + ' (b)it XXX [YYY]\n' 
//var escanhelp		= '* ' + prefix + ' (e)scan address\n'
//var shortcuts		= '`' + prefix + 'g = GDAX ETH-USD\n' + prefix + 'b = Bittrex BTC-ETH\n' + prefix + 'k = Kraken ETH-USD\n' + prefix + 'p = Poloniex BTC-ETH`\n\n'
//var ticker		= '__Available Tickers__\n`' + pairs + '`\n'
//var volumehelp		= '__Available vol. records__\n`' + volcoins + '`\n'
//var tips		= '`ETH tips to: 0x6A0D0eBf1e532840baf224E1bD6A1d4489D5D78d`\n';
var github		= 'Check the GitHub repo for more detailed information. <https://github.com/OFRBG/TsukiBot#command-table>'

//const helpStr = title + '```Markdown\n' + krakenhelp + gdaxhelp + poloniexhelp + escanhelp + '```' + shortcuts + ticker + volumehelp + tips + github;
const helpStr = title + github;


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
		if(err) {msg.channel.send('API Error.')}
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
	cc.priceFull(coins.map(function(c){return c.toUpperCase();}),['USD', 'EUR']).
	then(prices => {
		var msg = '__**CryptoCompare**__\n';
                
		for(var i = 0; i < coins.length; i++)
			msg += ('- **' + coins[i].toUpperCase() + '-USD** is : `' + 
                            prices[coins[i].toUpperCase()]['USD']['PRICE'] + ' USD` (`' +
                            Math.round(prices[coins[i].toUpperCase()]['USD']['CHANGEPCT24HOUR']*100)/100 + '%`).\n'
                            );
		

		chn.send(msg);
		})
	.catch(console.error);
}


//------------------------------------------
//------------------------------------------
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
	var url = "https://poloniex.com/public?command=returnTicker";
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
				p = data['result'];
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

	// Add a react that allows the users to delete the message.
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

        channel = message.channel;

	// Split the message by spaces.
	var code_in = message.content.split(' ');
	
	// Check for bot prefix
	if(code_in[0] === prefix) {

		// Remove the prefix
		code_in.splice(0,1);
		

		// Check if there is content	
		if(code_in.length > 1) {

			// Check if the command exists and it uses a valid pair
			if((code_in.slice(1,code_in.length).filter(function(value){ return !isNaN(value) || pairs.indexOf(value.toUpperCase()) > -1;  }).length + 1  == code_in.length)) {
				
				if((code_in[0] === 'vol' || code_in[0] === 'v') && volcoins.indexOf(code_in[1].toUpperCase()) > -1){
					executeCommand('s',
						{
							'coin' 	: code_in[1],
							'arg1' 	: (code_in[2] != null && !isNaN(Math.floor(code_in[2])) ? code_in[2] : -1),
							'arg2' 	: (code_in[3] != null && code_in[3][0] === 'g') ? 'g' : 'p'
						}, channel)
			
				} else if(false && code_in[0] === 'wh' || code_in[0] === 'w'){
					executeCommand('p',
						{
							'coin' 	: code_in[1],
						}, channel)
				
				} else if(code_in[0] === 'gdax' || code_in[0] === 'g') {
					getPriceGDAX(code_in[1], 'USD', (code_in[2] != null && !isNaN(code_in[2]) ? code_in[2] : -1), channel)
				
				} else if(code_in[0] === 'krkn' || code_in[0] === 'k') {
					getPriceKraken(code_in[1], (code_in[2] == null ? 'USD' : code_in[2]), (code_in[3] != null && !isNaN(code_in[3]) ? code_in[3] : -1), channel)
				
				} else if(code_in[0] === 'crcp' || code_in[0] === 'c') {
					code_in.splice(0,1);
					getPriceCC(code_in, channel);
				
				} else if(code_in[0] === 'trk'){
					console.log('trk called.');
			
				} else if(code_in[0] === 'polo' || code_in[0] === 'p'){
					getPricePolo(code_in[1], (code_in[2] == null ? 'USDT' : code_in[2]), channel)
				
				} else if(code_in[0] === 'bit' || code_in[0] === 'b'){
					getPriceBittrex(code_in[1], (code_in[2] == null ? 'BTC' : code_in[2]), channel)
				
                                } else if((code_in[0] === 'escan' || code_in[0] === 'e') && code_in[1].length == 42) {
                                         getEtherBalance(code_in[1], channel);
				
                                } else {
					postHelp(channel);
				}
		    }	
	    }

	// Shortcut section
	} else if (code_in[0] === '.tbg') {
		if(code_in[1] && code_in[1].toUpperCase() === 'EUR')
			getPriceGDAX('ETH', 'EUR', -1, channel);
		else if(code_in[1] && code_in[1].toUpperCase() === 'BTC')
			getPriceGDAX('BTC', 'USD', -1, channel);
		else
			getPriceGDAX('ETH', 'USD', -1, channel);

	} else if (code_in[0] === '.tbk') {
		if(code_in[1] && code_in[1].toUpperCase() === 'EUR')
			getPriceKraken('ETH','EUR',-1, channel)
		else if(code_in[1] && code_in[1].toUpperCase() === 'BTC')
			getPriceKraken('XBT', 'USD', -1, channel);
		else
			getPriceKraken('ETH','USD',-1, channel);
	
	} else if (code_in[0] === '.tbp') {
		getPricePolo('ETH', 'BTC', channel)

	} else if (code_in[0] === '.tbpop') {
		getPriceCC(['ETH','BTC','XRP','LTC','GNT'], channel)

	} else if (code_in[0] === '.tbb') {
		getPriceBittrex('ETH', 'BTC', channel)
	
	} else if (code_in[0] === '.help' || code_in[0] === '.th') {
		postHelp(channel);
	
	} else if (code_in[0] === '.dank') {
		const channel = message.channel; 
		channel.send(":ok_hand:           :tiger:"+ '\n' + 
		" :eggplant: :zzz: :necktie: :eggplant:"+'\n' + 
		"                  :oil:     :nose:"+'\n' + 
		"            :zap:  8=:punch: =D:sweat_drops:"+'\n' + 
		"         :trumpet:   :eggplant:                       :sweat_drops:"+'\n' + 
		"          :boot:    :boot:");
	} else if (code_in[0] === '.moonwhen') {
		const channel = message.channel;
		channel.send('Soon™')
	}

        delete channel;
});


// If the message gets 3 reacts for cross, it deletes the info. No idea why 3.
client.on('messageReactionAdd', messageReaction => {
	if(removeID(messageReaction.message.id) != -1&& messageReaction.emoji.identifier == "%E2%9D%8E" && messageReaction.count == 3) {
		messageReaction.message.delete().catch(console.error)
	}
});


// Jack in, Megaman. Execute.
client.login(token);
