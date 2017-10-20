var request     = require("request");
var fs          = require("fs");

var url         = "http://www.cryptocompare.com/api/data/coinlist/";
var extras      = ["USD","EUR","GBP","SGD","XBT","XLM"]; 
var filters     = ["POST", "U", "AND", "IN", "POLL"];

request({url: url, json: true}, function(err, res, body){

  let coins     = Object.keys(body.Data).concat(extras); 
  let coinsf    = Object.keys(body.Data).concat(extras); 

  coins = coins.join('","');
  coins = '["' + coins + '"]';

  filters.forEach(f => coinsf.splice(coinsf.indexOf(f),1));
  
  coinsf = coinsf.join('","');
  coinsf = '["' + coinsf + '"]';

  fs.writeFile("./common/coins.json", coins, function(err) { if(err) return console.log(err)})
  fs.writeFile("./common/coins_filtered.json", coinsf, function(err) { if(err) return console.log(err)})

});
