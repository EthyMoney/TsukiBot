var request     = require("request");
var fs          = require("fs");


var update = function(){
  return new Promise(function(resolve, reject){
    let url         = "http://www.cryptocompare.com/api/data/coinlist/";
    let extras      = ["USD","EUR","GBP","SGD","XBT","XLM","MXN","BCC","STR"]; 
    let filters     = ["POST", "U", "AND", "IN", "POLL","AM","GOT","GOOD","TODAY"];

    request({url: url, json: true}, function(err, res, body){

      let coins     = Object.keys(body.Data).concat(extras); 
      let coinsf    = Object.keys(body.Data).concat(extras); 
      
      const coinsa  = coins.slice();
      coins = coins.join('","');
      coins = '["' + coins + '"]';

      filters.forEach(f => coinsf.splice(coinsf.indexOf(f),1));

      const coinsfa = coinsf.slice();
      coinsf = coinsf.join('","');
      coinsf = '["' + coinsf + '"]';

      fs.writeFile("./common/coins.json", coins, function(err) { if(err) return console.log(err)})
      fs.writeFile("./common/coins_filtered.json", coinsf, function(err) { if(err) return console.log(err)})

      resolve([coinsa, coinsfa]);

    });

  });
}

exports.update = update;
