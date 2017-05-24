//const pairs = ['AMP', 'ARDR', 'BCN', 'BCY', 'BELA', 'BLK', 'BTCD', 'BTM', 'BTS', 'BURST', 'CLAM', 'DASH', 'DCR', 'DGB', 'DOGE', 'EMC2', 'ETC', 'ETH', 'EXP', 'FCT', 'FLDC', 'FLO', 'GAME', 'GNO', 'GNT', 'GRC', 'HUC', 'LBC', 'LSK', 'LTC', 'MAID', 'NAUT', 'NAV', 'NEOS', 'NMC', 'NOTE', 'NXC', 'NXT', 'OMNI', 'PASC', 'PINK', 'POT', 'PPC', 'RADS', 'REP', 'RIC', 'SBD', 'SC', 'SJCX', 'STEEM', 'STR', 'STRAT', 'SYS', 'VIA', 'VRC', 'VTC', 'XBC', 'XCP', 'XEM', 'XMR', 'XPM', 'XRP', 'XVC', 'ZEC'];


// Set the prefix
var prefix = '.tb'


// Allowed coins in commands
const pairs = ['ETH', 'ETC', 'GNT', 'XRP', 'LTC', 'BTC', 'XBT', 'MLN', 'ICN'];
const volcoins = ['ETH', 'GNT', 'XRP', 'XMR', 'LTC']

// Help string
//
var title 		= '__**TsukiBot**__ :full_moon: \n'
var krakenhelp 		= '* ' + prefix + ' (k)rkn XXX [YYY] [op. base price]\n'
var gdaxhelp		= '* ' + prefix + ' (g)dax XXX [op. base price]\n' 
var poloniexhelp	= '* ' + prefix + ' (w)h XXX (poloniex)\n'
var escanhelp		= '* ' + prefix + ' (e)scan address\n'
var shortcuts		= '`' + prefix + 'g = GDAX ETH-USD\n' + prefix + 'k = Kraken ETH-USD`\n\n'
var ticker		= '__Available Tickers__\n`' + pairs + '`\n'
var volumehelp		= '__Available vol. records__\n`' + volcoins + '`\n'
var tips		= '`ETH tips to: 0x6A0D0eBf1e532840baf224E1bD6A1d4489D5D78d`';

const helpStr = title + '```Markdown\n' + krakenhelp + gdaxhelp + poloniexhelp + escanhelp + '```' + shortcuts + ticker + volumehelp + tips;

//const helpStr = '__**TsukiBot**__ :full_moon: \n```Markdown\n* ' + prefix + ' (k)rkn XXX [YYY] [op. base price]\n* ' + prefix + ' (g)dax XXX [op. base price]\n* ' + prefix + ' (w)h XXX (poloniex)\n* ' + prefix + ' (v)ol XXX [minutes] (poloniex)\n* ' + prefix +' (e)scan address\n' + prefix +'g = ' + prefix + ' gdax eth\n' + prefix +'k = ' + prefix + ' krkn eth usd```\n__Available tickers__\n`'+pairs + '`\n__Available vol. records__\n`ETH,GNT,XRP,SC`\n`ETH tips to: 0x6A0D0eBf1e532840baf224E1bD6A1d4489D5D78d`';


// Include api things
//const bittrex 		= require('./node.bittrex.api.js');
const Discord 		= require('discord.js');
const Client 		= require('coinbase').Client;
const KrakenClient 	= require('kraken-api');
const Gdax 		= require('gdax');
const api = require('etherscan-api').init('7VWN4TVXM92WN56TW57ZD474R5S88JA4HF');


// Include stuff
var fs = require('fs');	
var PythonShell = require('python-shell');

// Get the api keys
var keys = JSON.parse(fs.readFileSync('keys.api','utf8'))

// Declare channels and the channels to broadcast
var channel, channelGDAX;
var channelName = 'general';
var gdaxchannel = 'live-prices';

// ID for block removal
var lastblockid;
var gdaxhandle;

// Initialize api things
var clientGDAX = new Client({'apiKey':keys['coinbase'][0],'apiSecret': keys['coinbase'][1]});
var clientKraken = new KrakenClient();
var websocket = new Gdax.WebsocketClient(['ETH-USD', 'BTC-USD']);

//------------------------------------------
//------------------------------------------


// This methods are calls on the api of the
// respective exchanges. The user can send
// an optional parameter to calculate % 
// change on a base price.

// Function that gets GDAX spot prices
function getPriceGDAX(coin1, coin2, base) {

	// Get the spot price and send it to general
	clientGDAX.getSpotPrice({'currencyPair': coin1.toUpperCase() + '-' + coin2.toUpperCase()}, function(err, price) {
		if(err) {channel.send('Unsupported currency')}
		else {
			var per = "";
			if (base != -1) per = "\n Change: `" + Math.round(((price.data.amount/base-1) * 100)*100)/100 + "%`";
			channel.send('__GDAX__ Price for **'  + coin1.toUpperCase() 
			+ '-' + coin2.toUpperCase() + '** is : `'  + price.data.amount + ' ' + coin2.toUpperCase() + "`." + per);
		}
	});
}


//------------------------------------------
//------------------------------------------


// Function that gets Kraken prices
function getPriceKraken(coin1, coin2, base) {

	// Get the spot price of the pair and send it to general
	clientKraken.api('Ticker', {"pair": '' + coin1.toUpperCase() + '' + coin2.toUpperCase() + ''}, function(error, data) {
		if(error) {channel.send('Unsupported pair')}
	    	else {
			var per = ""
			var s = (data.result[Object.keys(data.result)]['c'][0]);
			if (base != -1) per = "\n Change: `" + Math.round(((s/base-1) * 100)*100)/100 + "%`";
			channel.send('__Kraken__ Price for **'  + coin1.toUpperCase()
			+ '-' + coin2.toUpperCase() + '** is : `'  + s +' ' + coin2.toUpperCase() + "`." + per);

		} 
	});
}


//------------------------------------------
//------------------------------------------
/*
bittrex.options({
    'apikey' : API_KEY,
    'apisecret' : API_SECRET, 
    'stream' : true,
    'verbose' : true,
    'cleartext' : false 
});

*/






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

function executeCommand(c, coin, par) {
	var pyshell = new PythonShell('./tsukiserver.py', {args:[coin, par]});
	pyshell.send(c + '\r\n').end(function(err){if(err) console.log(err);});		

	// Add a react that allows the users to delete the message.
	pyshell.stdout.on('data', function (data) {
		console.log(data); 	
		channel.send(data).then(message => {message.react("\u274E"); lastblockid = message.id;});
	});
}


//------------------------------------------
//------------------------------------------


// From the etherscan api, get the balance
// for a given address. The balance is returned
// in weis.

function getEtherBalance(address){
	var balance = api.account.balance(address);
	balance.then(function(res){
		channel.send('The total ether registered for `' + address + '` is: `' + res['result'] / 1000000000000000000 + ' ETH`.');
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
	
	// Get the channel handles
	channel = client.channels.find("name", channelName);
	channelGDAX = client.channels.find("name", gdaxchannel);
	
	
	// Start the websocket and edit the message when new data comes.
	channelGDAX.send('__GDAX__ Price for **'  + 'ETH'
		+ '-' + 'USD' + '** is : `'  + '...' + ' ' + 'USD' + "`.").then(message =>  gdaxhandle = message)
	
	channelGDAX.send('__GDAX__ Price for **'  + 'BTC'
		+ '-' + 'USD' + '** is : `'  + '...' + ' ' + 'USD' + "`.").then(message =>  gdaxhandle2 = message)
	
	websocket.on('message', function(data) { if(data.type === 'match')
							if(data.product_id === 'BTC-USD')
								gdaxhandle2.edit('__GDAX__ Price for **'  + 'BTC'
								+ '-' + 'USD' + '** is : `'  + data.price + ' ' + 'USD' + "`.")
							else
								gdaxhandle.edit('__GDAX__ Price for **'  + 'ETH'
								+ '-' + 'USD' + '** is : `'  + data.price + ' ' + 'USD' + "`.")

						});
});



// Event goes off every time a message is read.
client.on('message', message => {

	// Split the message by spaces.
	var code_in = message.content.split(' ');
	
	// Check for bot prefix
	if(code_in[0] === prefix) {

		// Remove the prefix
		code_in.splice(0,1);
			
		// Check if there is content	
		if(code_in.length > 1) {
			
			// Check if the command exists and it uses a valid pair
			if(pairs.filter(function(value){return value == code_in[1].toUpperCase();}).length > 0){ 		
				
				if(code_in[0] === 'vol' || code_in[0] === 'v'){
					executeCommand('s', code_in[1], (code_in[2] != null && !isNaN(Math.floor(code_in[2])) ? code_in[2] : -1))
			
				} else if(code_in[0] === 'wh' || code_in[0] === 'w'){
					executeCommand('p', code_in[1] )
				
				} else if(code_in[0] === 'gdax' || code_in[0] === 'g') {
					getPriceGDAX(code_in[1], 'USD', (code_in[2] != null && !isNaN(code_in[2]) ? code_in[2] : -1))
				
				} else if(code_in[0] === 'krkn' || code_in[0] === 'k') {
					getPriceKraken(code_in[1], (code_in[2] == null ? 'USD' : code_in[2]), (code_in[3] != null && !isNaN(code_in[3]) ? code_in[3] : -1))
				} else if(code_in[0] === 'trk'){
					console.log('trk called.');
				
				} else {
					const channel = client.channels.find("name", channelName);
					channel.send(helpStr);
				}

			// If is it not a price command, check if the address is 42 chars long
			} else if(code_in[1].length == 42){
				if(code_in[0] === 'escan' || code_in[0] === 'e') {
					getEtherBalance(code_in[1]);
				}
			} else {	
				const channel = client.channels.find("name", channelName);
				channel.send(helpStr);
			}
		}

	// Shortcut section
	} else if (code_in[0] === '.tbg') {
		getPriceGDAX('ETH', 'USD', -1);
	} else if (code_in[0] === '.tbk') {
		getPriceKraken('ETH','USD',-1)
	} else if (code_in[0] === '.help' || code_in[0] === '.th') {
		const channel = client.channels.find("name", channelName);
		channel.send(helpStr);

	// Or dank command	
	} else if (code_in[0] === '.dank') {
		const channel = client.channels.find("name", channelName);
		channel.send(":ok_hand:           :tiger:"+ '\n' + 
		" :eggplant: :zzz: :necktie: :eggplant:"+'\n' + 
		"                  :oil:     :nose:"+'\n' + 
		"            :zap:  8=:punch: =D:sweat_drops:"+'\n' + 
		"         :trumpet:   :eggplant:                       :sweat_drops:"+'\n' + 
		"          :boot:    :boot:");
		
	// Or XRP joke	
	/*} else if (code_in.indexOf('xrp') > -1) {
		message.react('🌑')
		message.react('🔭')
		message.react('🐑')
	}*/
});


// If the message gets 3 reacts for cross, it deletes the info. No idea why 3.
client.on('messageReactionAdd', messageReaction => {
	if(messageReaction.message.id == lastblockid && messageReaction.emoji.identifier == "%E2%9D%8E" && messageReaction.count == 3) {
		messageReaction.message.delete().catch(console.error)
	}
});


// Jack in, Megaman. Execute.
client.login(token);
