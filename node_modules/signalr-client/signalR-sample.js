//# signalr-client
//By: [Matthew Whited](mailto:matt@whited.us?subject=signalr-client)  (c) 2016

// ## Usage

var http = require('http');

//### Create instance of signalR client

//var signalR = require('signalr-client');
var signalR = require('./signalr.js');
var client  = new signalR.client(
	"http://localhost:8080/signalR",  //signalR service URL
	['TestHub'],                      // array of hubs to be supported in the connection
    2,                                //optional: retry timeout in seconds (default: 10)
    true                              //optional: doNotStart default false
);

////Use HTTP Proxy
//client.proxy = {
//    host: "127.0.0.1",
//    port: "8888"
//};


////Add Headers to HTTP Requests (this will be added to signalR negotiation and connect
////these now support a mergeable syntax
//client.headers['X-MyTest-Header'] = 'Hello World!';
//client.headers = {
//    'X-Other-Header-1': 'Hello World 1',
//    'X-Other-Header-2': 'Hello World 2'
//};
//client.headers['X-MyTest-Header'] = undefined; //Setting values to undefined will remove from from the collection
//client.headers = {
//    'X-Other-Header-1': undefined
//};
//console.log(client.headers);

////Add Variables to the connections query string
//client.queryString.mVar1 = 'Hello World!';
//client.queryString = {
//    mVar2: 'Hello World!',
//    mVar3: 'Hello World!'
//};
//client.queryString.mVar3 = undefined; // this works just like headers


//### Binding callbacks from signalR hub

////#### Method pattern
//client.on(
//	'TestHub',		// Hub Name (case insensitive)
//	'addmessage',	// Method Name (case insensitive)
//	function(name, message) { // Callback function with parameters matching call from hub
//		console.log("revc => " + name + ": " + message); 
//	});

//#### Direct pattern

//If you bind directly to the hub handlers as show here any previous
//	handlers for that hub will be removed!
client.handlers.testhub = { // hub name must be all lower case.
	addmessage: function(name, message) { // method name must be all lower case, function signature should match call from hub
		console.log("revc => " + name + ": " + message); 
	}
};

//==== Optional function bindings to these names will allow for handling of these system events.

client.serviceHandlers = { //Yep, I even added the merge syntax here.
    bound: function() { console.log("Websocket bound"); },
    connectFailed: function(error) { console.log("Websocket connectFailed: ", error); },
    connected: function(connection) { console.log("Websocket connected"); },
    disconnected: function() { console.log("Websocket disconnected"); },
    onerror: function (error) { console.log("Websocket onerror: ", error); },
    messageReceived: function (message) { console.log("Websocket messageReceived: ", message); return false; },
    bindingError: function (error) { console.log("Websocket bindingError: ", error); },
    connectionLost: function (error) { console.log("Connection Lost: ", error); },
    reconnecting: function (retry /* { inital: true/false, count: 0} */) {
        console.log("Websocket Retrying: ", retry);
        //return retry.count >= 3; /* cancel retry true */
        return true; 
    }
};

//Handle Authentication
client.serviceHandlers.onUnauthorized = function (res) {
    console.log("Websocket onUnauthorized:");
    
    //Do your Login Request
    var location = res.headers.location;
    var result = http.get(location, function (loginResult) {
        //Copy "set-cookie" to "client.header.cookie" for future requests
        client.headers.cookie = loginResult.headers['set-cookie'];
    });
}


//### Calling methods on the signalR hub

//#### From the client instance
setInterval(function () {
    console.log(client.state);
    client.invoke(
		'TestHub', // Hub Name (case insensitive)
		'Send',	// Method Name (case insensitive)
		'client', 'invoked from client' //additional parameters to match called signature
		);
},2000);

//#### From the hub instance
setTimeout(function() {
    (function sendMessage() {
        console.log("Client State Code: ", client.state.code);
        console.log("Client State Description: ", client.state.desc);
        console.log("==>> try to get hub");
       	var hub = client.hub('TestHub'); // Hub Name (case insensitive)

        // if not bound set the hub will be undefined
       	if (!hub) {
       	    console.log("==>> hub not found. retry in 10 seconds");
       	    setTimeout(sendMessage, 10000);
            return;
       	}
       	console.log("==>> send message");
        hub.invoke(
		    'Send',	// Method Name (case insensitive) 
		    'hub', 'invoked from hub' //additional parameters to match called signature
		    );

    })();
},3000);

console.log('Waiting!');
process.stdin.resume();

setTimeout(function() {
    // explicitly disconnect
    client.end();
}, 1500);

//Manually Start Client
client.start();

/*
setTimeout(function() {
    console.log('Bye!');
    process.exit();
}, 10000);
*/