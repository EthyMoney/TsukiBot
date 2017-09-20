var request = require("request");
var fs = require("fs");

var url = "http://www.cryptocompare.com/api/data/coinlist/";

request({url: url, json: true}, function(err, res, body){

  coins = Object.keys(body.Data); 
  coins = coins.join('","');
  coins = '["' + coins + '"]';

  fs.writeFile("./common/coins.json", coins, function(err) { if(err) return console.log(err)})

});
