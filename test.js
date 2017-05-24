const bittrex = require('node.bittrex.api');
var fs = require('fs')


var keys = JSON.parse(fs.readFileSync('keys.api','utf8'))

bittrex.options({
//    'apikey': keys['bittrex'][0], 
//    'apisecret': keys['bittrex'][1],
    'stream' : true,
    'verbose' : false,
    'cleartext' : true,
});

*/
bittrex.sendCustomRequest( 'https://bittrex.com/Api/v2.0/pub/market/GetMarketSummary?marketName=BTC-GNT', function( data ) {
    if(data['Last']) console.log(data['Last']);
}, true );

