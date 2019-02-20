var request     = require("request");
var fs          = require("fs");
var keys        = JSON.parse(fs.readFileSync('./common/keys.api','utf8'));

var update2 = function(){
    
console.log("Coins list started");

const rp = require('request-promise');
const requestOptions = {
  method: 'GET',
  uri: 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest',
  qs: {
    start:      1,
    limit:      5000,
    convert:    'USD'
  },
  headers: {
    'X-CMC_PRO_API_KEY':         keys['coinmarketcap']
  },
  json: true,
  gzip: true
};

rp(requestOptions).then(response => {
  //console.log('CMC API call response:', response.data[0]);
  var coins      = ["CEHH","YEET"];
  var coinsf     = ["CEHH","YEET"];
  let filters    = ["POST", "U", "AND", "IN", "POLL","AM","GOT","GOOD","TODAY"];
  
  
  for (var i = 0; i < response.data.length; i++){
    var obj = response.data[i];
    var coin = obj.symbol;
    coins.concat(coin);
    coinsf.concat(coin);
  }
  
      console.log(coins);
    console.log(coinsf);

    const coinsa  = coins.slice();
    coins = coins.join('","');
    coins = '["' + coins + '"]';

    filters.forEach(f => coinsf.splice(coinsf.indexOf(f),1));

    const coinsfa = coinsf.slice();
    coinsf = coinsf.join('","');
    coinsf = '["' + coinsf + '"]';

    fs.writeFile("./common/coins.json", coins, function(err) { if(err) return console.log(err);});
    fs.writeFile("./common/coins_filtered.json", coinsf, function(err) { if(err) return console.log(err);});

    console.log(coins);
    console.log(coinsf);
    console.log("Coins list complete!");

}).catch((err) => {
  console.log('CMC API call error:', err.message);
});

};


var update = function(){
  //console.log("Coins list started");
  return new Promise(function(resolve, reject){
    let url         = "https://min-api.cryptocompare.com/data/all/coinlist";
    let extras      = ["USD","EUR","GBP","SGD","XBT","XLM","MXN","BCC","STR","QNT","ELF","MIOTA"]; 
    let filters     = ["POST", "U", "AND", "IN", "POLL","AM","GOT","GOOD","TODAY"];

    request({url: url, json: true}, function(err, res, body){

      if(err){console.error(err);};
      let coins     = Object.keys(body.Data).concat(extras); 
      let coinsf    = Object.keys(body.Data).concat(extras); 
	  
      //console.log(coins);
      
      const coinsa  = coins.slice();
      coins = coins.join('","');
      coins = '["' + coins + '"]';

      filters.forEach(f => coinsf.splice(coinsf.indexOf(f),1));

      const coinsfa = coinsf.slice();
      coinsf = coinsf.join('","');
      coinsf = '["' + coinsf + '"]';

      fs.writeFile("./common/coins.json", coins, function(err) { if(err) return console.log(err);});
      fs.writeFile("./common/coins_filtered.json", coinsf, function(err) { if(err) return console.log(err);});

      resolve([coinsa, coinsfa]);
      
      //console.log("Coins list complete!");

    });

  });
};

update();

exports.update = update;
