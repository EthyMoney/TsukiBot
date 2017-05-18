//const pairs = ['AMP', 'ARDR', 'BCN', 'BCY', 'BELA', 'BLK', 'BTCD', 'BTM', 'BTS', 'BURST', 'CLAM', 'DASH', 'DCR', 'DGB', 'DOGE', 'EMC2', 'ETC', 'ETH', 'EXP', 'FCT', 'FLDC', 'FLO', 'GAME', 'GNO', 'GNT', 'GRC', 'HUC', 'LBC', 'LSK', 'LTC', 'MAID', 'NAUT', 'NAV', 'NEOS', 'NMC', 'NOTE', 'NXC', 'NXT', 'OMNI', 'PASC', 'PINK', 'POT', 'PPC', 'RADS', 'REP', 'RIC', 'SBD', 'SC', 'SJCX', 'STEEM', 'STR', 'STRAT', 'SYS', 'VIA', 'VRC', 'VTC', 'XBC', 'XCP', 'XEM', 'XMR', 'XPM', 'XRP', 'XVC', 'ZEC'];

var fs = require('fs');	
var keys = JSON.parse(fs.readFileSync('keys.api','utf8'))


const pairs = ['ETH', 'GNT', 'XRP', 'STEEM'];
const helpStr = '```__TsukiBot Commands__\nCheck large trades: !\'tb wh TICKER \nCheck volume records: !\'tb vol TICKER\n\n__Available pairs__\n'+pairs+'```';

// Include discord.js
const Discord = require('discord.js');


// Declare channel and the channel to broadcast
var channel;
var channelName = 'general';


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


// Create a client and a token
const client = new Discord.Client();
const token = keys['discord'];


client.on('ready', () => {
	console.log('ready');	
	
	// Manually create 4 loggers
	createLogger('eth');
	createLogger('gnt');	
	createLogger('xrp');
	createLogger('steem');

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
	if(code_in[0] === "!'tb") {

		// Remove the command prefix
		code_in.splice(0,1);	

		// Check if the command exists and it uses a valid pair
		if(code_in.length > 1 && pairs.filter(function(value){return value == code_in[1].toUpperCase();}).length > 0){ 
		
			// vol (s) command: get the volume change for a period	
			if(code_in[0] === 'vol'){
				executeCommand('s', code_in[1])
			// wh (p) command: get the market TX that are outside normal levels. Forcing the period to 5 minutes
			// for now. Call the python program that checks over the last 5 minutes. 
			} else if(code_in[0] === 'wh'){
				executeCommand('p', code_in[1])
			} else if(code_in[0] === 'trk'){
				console.log('trk execute');
			} else {
				const channel = client.channels.find("name", channelName);
				channel.send(helpStr);
			}
		} else {	
			const channel = client.channels.find("name", channelName);
			channel.send(helpStr);
		}
			
	}
});

client.login(token);
