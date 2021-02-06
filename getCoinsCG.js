var fs = require("fs");

//
//
// The purpose of this function is to gather all available tickers on CoinGecko and write them in JSON format to file.
// This is so the bot can check and verify coin existance, and also refer to the coins by their market ticker instead of the full name.
// This file should be run once before starting the bot for the first time. It will be auto-run by the bot after.
//
//


// Import coingecko-api
const CoinGecko = require('coingecko-api');

// Initiate the CoinGecko API Client
const CoinGeckoClient = new CoinGecko();

// Make API call and do JSON build operation
var update = async() => {
  let data = await CoinGeckoClient.coins.list();
  let tickers = [];
  await data.data.forEach((value) => {
    tickers.push(value.symbol.toUpperCase());
  });
  
  //console.log(data);
  
  // Write the identification JSON to file
  fs.writeFileSync("./common/coinsCG.json", JSON.stringify(data.data));
  fs.writeFileSync("./common/coinsCGtickers.json", JSON.stringify(tickers));
  //console.log("CoinGecko coin list complete!");
};

update();

exports.update = update;

