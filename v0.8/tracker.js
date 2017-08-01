const pairs = ['ETH', 'GNT', 'XRP', 'LTC'];

// Create an array to keep track of current programs running
var active = [];

var fs = require('fs');	
var keys = JSON.parse(fs.readFileSync('keys.api','utf8'))


// Include discord.js
const Discord = require('discord.js');


// Create channel and select channel
var channel;
var channelName = 'general';


//------
//------

// Include python-shell
var PythonShell = require('python-shell');


function executeCommand(c, coin) {

	// Run a tracker for [coin]
	var pyshell = new PythonShell('./tsukiservereye.py', {args:[coin]}) 

	// Once started, notify
	channel.send('Registered tracker for **' + coin.toUpperCase() + "**.");


	// Close stdin to signal the tracker to continue execution
	pyshell.end(function (err) {
		if (err) channel.send('Tracker for **' + coin.toUpperCase() + '** died.')
	});

	// Get the response printed and send it to discord
	pyshell.stdout.on('data', function (data) {
		console.log(data); 	
		channel.send(data);

		// Remove the coin from the active trackers
		active.splice(active.indexOf(coin), 1);
	});
}


// Create discord thingies
const client = new Discord.Client();
const token = keys['discord'];


client.on('ready', () => {
	console.log('ready');	
	channel = client.channels.find("name", channelName);
});



client.on('message', message => {

	// The explanation for the commands is in bot.js
	
	// Split the input	
	var code_in = message.content.split(' ');

	// Check for bot prefix
	if(code_in[0] === "!'tb") {
		
		// Remove the command prefix 
		code_in.splice(0,1);	

		// Check if the command exists and it uses a valid pair
		if(code_in.length > 1 && pairs.filter(function(value){return value == code_in[1].toUpperCase();}).length > 0){ 
			if(code_in[0] === 'trk'){
				if(active.indexOf(code_in[1]) == -1){
					// Execute the command if the wasn't an active tracker. Add to array.
					executeCommand('', code_in[1]);
					active.push(code_in[1]);
				} else {
					channel.send('There is already an active tracker for **' + code_in[1].toUpperCase() + "**.");
				}
			} else {
			}
		} else {	
		}
			
	}
});

client.login(token);
