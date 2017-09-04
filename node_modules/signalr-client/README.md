# signalr-client

By: [Matthew Whited](mailto:matt@whited.us?subject=signalr-client)  (c) 2015
_____________________________________

## Summary

This is a signalR client for node.js.  The Intent of this project is to allow a node service
to communicate with a signalR hub over websockets.  

This project does not require jQuery but it also only support websockets.  Fallback to other 
communication options such as long polling are not supported.  

[Find on GitHub](https://github.com/mwwhited/signalr-client-nodejs)

_____________________________________

## Usage

_see signalR-sample.js for more examples_

### Create instance of signalR client

	var signalR = require('signalr-client');
	var client  = new signalR.client(

		//signalR service URL
		"http://localhost:8080/signalR",

		// array of hubs to be supported in the connection
		['TestHub']
        //, 10 /* Reconnection Timeout is optional and defaulted to 10 seconds */
        //, false /* doNotStart is option and defaulted to false. If set to true 
                     client will not start until .start() is called */
	);

### Binding callbacks from signalR hub

#### Method pattern

	client.on(
		// Hub Name (case insensitive)
		'TestHub',	

		// Method Name (case insensitive)
		'AddMessage',	

		// Callback function with parameters matching call from hub
		function(name, message) { 
			console.log("revc => " + name + ": " + message); 
		});

#### Direct pattern

	//If you bind directly to the hub handlers as show here any previous
	//	handlers for that hub will be removed!

	// hub name must be all lower case.
	client.handlers.testhub = { 
		// method name must be all lower case
		//		function signature should match call from hub
		addmessage: function(name, message) { 
			console.log("revc => " + name + ": " + message); 
		}
	};

### Invoking methods on the signalR hub (no return values)

#### From the client instance

    client.invoke(
		'TestHub', // Hub Name (case insensitive)
		'Send',	// Method Name (case insensitive)
		'client', 'invoked from client' //additional parameters to match signature
		);

#### From the hub instance

	var hub = client.hub('TestHub'); // Hub Name (case insensitive)
	hub.invoke(
		'Send',	// Method Name (case insensitive) 
		'hub', 'invoked from hub' //additional parameters to match called signature
		);


### Calling methods on the signalR hub (with async return values)

#### From the client instance

    client.call(
		'TestHub', // Hub Name (case insensitive)
		'Send',	// Method Name (case insensitive)
		'client', 'invoked from client' //additional parameters to match signature
		)
	 	.done(function (err, result) {
	 		if (!err)  {
	 			console.log("call returned: ", result);
	 		}
	 	
	 	});

#### From the hub instance

	var hub = client.hub('TestHub'); // Hub Name (case insensitive)
	hub.call(
		'Send',	// Method Name (case insensitive) 
		'hub', 'invoked from hub' //additional parameters to match called signature
		)
	 	.done(function (err, result) {
	 		if (!err)  {
	 			console.log("call returned: ", result);
	 		}
	 	});



### Additional Features

#### Add Custom Headers to Negotiate and Connect

    client.headers['X-MyTest-Header'] = 'Hello World!';


#### Add Custom Values to Connect QueryString

    client.queryString.mVar1 = 'Hello World!';

#### Connect over HTTP Proxy

**Only support HTTP connections as this time**

    client.proxy.host = "127.0.0.1";
    client.proxy.port = "8888";

### Service Handlers

#### Signatures

*These are all found under client.serviceHandlers*

    bound: void function(){}
    connectFailed: void function(error){}
    connected: void function(connection){}
    connectionLost: void function(error){}
    disconnected: void function(){}
    onerror: void function(error){}
    messageReceived: bool function(message){ return true /* if handled */}
    bindingError: function(error) {} 
    onUnauthorized: function(res) {} 
    reconnected: void function(connection){}
    reconnecting: function(retry) { return false; } */

#### Connected / Reconnected
    
    client.serviceHandlers.connected = function(connection) {
        /* connection: this is the connection raised from websocket */
    }

#### Message Received

    client.serviceHandlers.messageReceived = function(message) {
        /* message: this is the raw message received on the websocket */

        return true/false; //if true the client handler for the hub will not be raised.
                           //if false the client handler will be raised.
    }

#### Handler Unauthorized Access

    client.serviceHandlers.onUnauthorized = function (res) {
        //Do your Login Request
        var location = res.headers.location;
        var result = http.get(location, function (loginResult) {
            //Copy "set-cookie" to "client.header.cookie" for future requests
            client.headers.cookie = loginResult.headers['set-cookie'];
        });
    }

#### Reconnecting

    client.serviceHandlers.reconnecting = function (retryData) {
       /* retryData: { inital: true (first retry)/false (following retries),
                       count: retry count } */

        return true; // Abort retry
        return false; // Retry
    }
    
_____________________________________

## Change History

* v0.0.1: Initial Release
* v0.0.2: No functional code changes
	* Update ignore list to exclude project build files
	* Cleaned up README.md and added code samples
	* Updated signalR-sample.js to match samples
* v0.0.3: No functional code changes
	* Updated README.md and signalR-sample.js to correct minor spelling mistakes
* v0.0.4: Corrected messageid for payloads sent to server/hub
	* messageid should increment for each message in the connection instead
	* reset messageid on connection
* v0.0.5: Added support for retrying connection after the client loses contact with hub
* v0.0.6: Fixed reported issue of connection being refused when the client is created before the hub is online.  
    * Added client.serviceHandlers.bindingError handler.
    * if client is in "unbound" or "bindingError" state it will trying to renegotiate binding on next client.invoke or client.hub[]
	* changed client.state to return {code: # desc: ""} instead of just the code.
* v0.0.7: Added support for connections over HTTPS (Thanks Anthony DiPierro)
* v0.0.8: Added support for headers by request (Thanks Vincent Miceli)
    * Added support for headers on "negotiate" and "connect" for signalR
    * Added a new onUnauthorized handler to support 401/302 on failed negotiate
    * Added the ability to forward requests over an HTTP Proxy
    * Added the ability to extend the connect queryString
    * Added the ability to optionally prevent the client from connecting automatically on creation.
    * Removed the thrown exception when errors are unhandled. 
* v0.0.9: Added a mergeable setter syntax to handlers, serviceHandlers, headers, proxy and queryString.
    * Settings values on headers and queryString to undefined will remove their values from being transferred.
* v0.0.10: Fixes for reported bugs (Thanks Vincent Miceli)
    * Connection state was always reported as reconnected 
    * doNotStart setting for client was ignored.
* v0.0.11: Initialization and even order has slightly changed.
    * If client is created with 'doNotStart' set to true binding will not occur until after client.start() is called
    * The 'bound' event will be raised before the system tries to start the connection
    * Fixed the retry timeout to properly calculate seconds.
    * Fixed retry and connection failed
* v0.0.12: Added more detail to the "Protocol Error"
    * The "Protocol Error" refers to when the system can not detect the web-sockets connection.
    * Changed the default error handler to output more details
    * Added the negotiated URL object to the raised error for "Protocol Error"
* v0.0.13: Added MIT License and released project on GitHub
    * No functional changes
    * [Code on GitHub](https://github.com/mwwhited/signalr-client-nodejs)
* v0.0.14: Added HTTPS scheme support 
	* Thanks to Guilherme Ferreira
* v0.0.15: Update to signalR Client Protocol 1.5
	* Thanks to Guilherme Ferreira
* v0.0.16: Fixed lastMessageId issues 
	* Thanks to Sergey Buturlakin
* v0.0.17: Fixed negotiation error handing
    * Thanks to Patrick Hampson
_____________________________________

## Known Issues

* client.Proxy settings currently only work for HTTP and not HTTPS
_____________________________________

_Donations for this project are graciously accepted by paypal <matt@whited.us>
or by bitcoin 1NTVscATbu8fo6an8UMS5xiCpVCHV438sj_
