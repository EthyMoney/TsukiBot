const bittrex = require('node.bittrex.api');
var fs = require('fs')


var keys = JSON.parse(fs.readFileSync('keys.api','utf8'))

bittrex.options({
    'apikey': keys['bittrex'][0], 
    'apisecret': keys['bittrex'][1],
    'stream' : true,
    'verbose' : true,
    'cleartext' :true
});

bittrex.getmarketsummaries( function( data ) {
    for( var i in data ) {
        console.log(data[i].MarketName)
	bittrex.getticker( { market : data[i].MarketName }, function( ticker ) {
            console.log( ticker );
        });
    }
});
