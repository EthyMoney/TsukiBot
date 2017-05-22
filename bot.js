//const pairs = ['AMP', 'ARDR', 'BCN', 'BCY', 'BELA', 'BLK', 'BTCD', 'BTM', 'BTS', 'BURST', 'CLAM', 'DASH', 'DCR', 'DGB', 'DOGE', 'EMC2', 'ETC', 'ETH', 'EXP', 'FCT', 'FLDC', 'FLO', 'GAME', 'GNO', 'GNT', 'GRC', 'HUC', 'LBC', 'LSK', 'LTC', 'MAID', 'NAUT', 'NAV', 'NEOS', 'NMC', 'NOTE', 'NXC', 'NXT', 'OMNI', 'PASC', 'PINK', 'POT', 'PPC', 'RADS', 'REP', 'RIC', 'SBD', 'SC', 'SJCX', 'STEEM', 'STR', 'STRAT', 'SYS', 'VIA', 'VRC', 'VTC', 'XBC', 'XCP', 'XEM', 'XMR', 'XPM', 'XRP', 'XVC', 'ZEC'];

//var bittrex = require('bittrex-api');
var fs = require('fs');	
var keys = JSON.parse(fs.readFileSync('keys.api','utf8'))
var prefix = '.tb'

const pairs = ['ETH', 'ETC', 'GNT', 'XRP', 'LTC', 'BTC', 'XBT', 'MLN', 'ICN'];
//const helpStr = '__**TsukiBot**__ :moon: \nCheck Kraken spot price in X: !\'tb gdax {ETH,LTC,BTC,XRP}\nCheck GDAX spot price in USD: !\'tb gdax {ETH,LTC,BTC}\nCheck large trades: !\'tb wh TICKER \nCheck volume records: !\'tb vol TICKER\n\n__Available tickers__\n'+pairs;


const helpStr = '__**TsukiBot**__ :full_moon: \n```Markdown\n* ' + prefix + ' (k)rkn XXX [YYY] [op. base price]\n* ' + prefix + ' (g)dax XXX [op. base price]\n* ' + prefix + ' (w)h XXX (poloniex)\n* ' + prefix + ' (v)ol XXX (poloniex)\n* ' + prefix +' (e)scan address\n' + prefix +'g = ' + prefix + ' gdax eth\n' + prefix +'k = ' + prefix + ' krkn eth usd```\n__Available tickers__\n`'+pairs + '`\n`ETH tips to: 0x6A0D0eBf1e532840baf224E1bD6A1d4489D5D78d`';

// Include discord.js
const Discord = require('discord.js');

const Client = require('coinbase').Client;
const KrakenClient = require('kraken-api');


var api = require('etherscan-api').init('7VWN4TVXM92WN56TW57ZD474R5S88JA4HF');



// Declare channel and the channel to broadcast
var channel;
var channelName = 'general';

var clientGDAX = new Client({'apiKey':keys['coinbase'][0],'apiSecret': keys['coinbase'][1]});
var clientKraken = new KrakenClient();

//-----
//-----


function getPriceGDAX(coin1, coin2, base) {
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

function getPriceKraken(coin1, coin2, base) {
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


//------
//------

// Include python-shell
var PythonShell = require('python-shell');


// Create a logger for a certain coin
function createLogger(coin){
	PythonShell.run('./tsukiserverlog.py', {args:[coin]}, function(err) {if(err) console.log(err);});
}



// Given a command and a coin, it calls a python script which returns the message to broadcast
function executeCommand(c, coin) {
	var pyshell = new PythonShell('./tsukiserver.py', {args:[coin]});
	pyshell.send(c + '\r\n').end(function(err){if(err) console.log(err);});		

	pyshell.stdout.on('data', function (data) {
		console.log(data); 	
		channel.send(data);
	});
}



function getEtherBalance(address){
	var balance = api.account.balance(address);
	balance.then(function(res){
		channel.send('The total ether registered for `' + address + '` is: `' + res['result'] / 1000000000000000000 + ' ETH`.');
	});
}


// Create a client and a token
const client = new Discord.Client();
const token = keys['discord'];

client.on('ready', () => {
	console.log('ready');	
	
	// Manually create 4 loggers
	createLogger('eth');
	createLogger('gnt');	
	createLogger('xrp');
	createLogger('ltc');

	// Get the channel
	channel = client.channels.find("name", channelName);
	
});

client.on('message', message => {

	// The template for the messages is currently !'tb [command code] [coin] [arg]
	// The vol command (previously s) checks for volume
	// The wh command (previously p) check for large trades
	// The trk command is managed by another node at tracker.js
	
	
	// Split the message by spaces.
	var code_in = message.content.split(' ');
	
	// Check for bot prefix <!'m>
	if(code_in[0] === ".tb") {

		// Remove the command prefix
		code_in.splice(0,1);	
		if(code_in.length > 1) {
			// Check if the command exists and it uses a valid pair
			if(pairs.filter(function(value){return value == code_in[1].toUpperCase();}).length > 0){ 		
				// vol (s) command: get the volume change for a period	
				if(code_in[0] === 'vol' || code_in[0] === 'v'){
					executeCommand('s', code_in[1])
				} else if(code_in[0] === 'wh' || code_in[0] === 'w'){
					executeCommand('p', code_in[1])
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
			} else if(code_in[1].length == 42){
				if(code_in[0] === 'escan' || code_in[0] === 'e') {
					getEtherBalance(code_in[1]);
				}
			} else {	
				const channel = client.channels.find("name", channelName);
				channel.send(helpStr);
			}
		}
			
	} else if (code_in[0] === '.tbg') {
		getPriceGDAX('ETH', 'USD', -1);
	} else if (code_in[0] === '.tbk') {
		getPriceKraken('ETH','USD',-1)
	} else if (code_in[0] === '.help' || code_in[0] === '.th') {
		const channel = client.channels.find("name", channelName);
		channel.send(helpStr);
	} else if (code_in[0] === '.dank') {
		const channel = client.channels.find("name", channelName);
		channel.send(":ok_hand:           :tiger:"+ '\n' + 
		" :eggplant: :zzz: :necktie: :eggplant:"+'\n' + 
		"                  :oil:     :nose:"+'\n' + 
		"            :zap:  8=:punch: =D:sweat_drops:"+'\n' + 
		"         :trumpet:   :eggplant:                       :sweat_drops:"+'\n' + 
		"          :boot:    :boot:");	
	}
});

client.login(token);
