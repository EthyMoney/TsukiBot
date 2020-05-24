let request = require("request");
let fs = require("fs");
let keys = JSON.parse(fs.readFileSync('./common/keys.api', 'utf8'));
const CoinMarketCap = require('coinmarketcap-api');
const chalk = require('chalk');
clientcmc = new CoinMarketCap(keys['coinmarketcap' + 'failover']);

let update2 = async function () {

    //console.log("Coins list started");

    let extras = ["USD", "EUR", "GBP", "SGD", "XBT", "XLM", "MXN", "BCC", "STR", "QNT", "ELF", "DAI"];
    let filters = ["POST", "U", "AND", "IN", "POLL", "AM", "GOT", "GOOD", "TODAY"];

    let cmcJSON = await clientcmc.getTickers({limit: 2800}).then().catch(console.error);
    cmcArray = cmcJSON['data'];
    cmcArrayDict = {};
    cmcArray.forEach(function (v) {
        if (!cmcArrayDict[v.symbol])
            cmcArrayDict[v.symbol] = v;
    });

    //console.log(chalk.green(chalk.cyan(cmcArray.length) + " known cmc coins active!"));
    //console.log('CMC API call response:', response.data[0]);
    let coins = "";

    for (let i = 0; i < cmcJSON.data.length; i++) {
        let obj = cmcJSON.data[i];
        let coin = obj.symbol;
        if (i > 0) {
            coins = coins + ',' + coin;
        } else {
            coins = coins + coin;
        }
    }

    coins = coins.split(',');
    coins = coins.concat(extras);
    coinsf = coins.concat(extras);
    filters.forEach(f => coinsf.splice(coinsf.indexOf(f), 1));
    //console.log(coins);
    //console.log(coinsf);

    fs.writeFileSync("./common/coins.json", '["' + coins.join('","') + '"]');
    fs.writeFileSync("./common/coins_filtered.json", '["' + coins.join('","') + '"]');

    //console.log(coins);
    //console.log(coinsf);
    //console.log("Coins list complete!");
};

update2();

exports.update = update2;
