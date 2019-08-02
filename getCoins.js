let request = require("request");
let fs = require("fs");
let keys = JSON.parse(fs.readFileSync('./common/keys.api', 'utf8'));
const CoinMarketCap = require('coinmarketcap-api');
const chalk = require('chalk');
clientcmc = new CoinMarketCap(keys['coinmarketcap' + 'failover']);

let update2 = async function () {

    //console.log("Coins list started");

    let extras = [];
    let filters = ["POST", "U", "AND", "IN", "POLL", "AM", "GOT", "GOOD", "TODAY"];

    let cmcJSON = await clientcmc.getTickers({limit: 2500}).then().catch(console.error);
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

    fs.writeFile("./common/coins.json", '["' + coins.join('","') + '"]', function (err) {
        if (err)
            return console.log(err);
    });
    fs.writeFile("./common/coins_filtered.json", '["' + coins.join('","') + '"]', function (err) {
        if (err)
            return console.log(err);
    });

    //console.log(coins);
    //console.log(coinsf);
    //console.log("Coins list complete!");
    return "fuck";
};


var update = function () {
    //console.log("Coins list started");
    return new Promise(function (resolve, reject) {
        let url = "https://min-api.cryptocompare.com/data/all/coinlist";
        let extras = ["USD", "EUR", "GBP", "SGD", "XBT", "XLM", "MXN", "BCC", "STR", "QNT", "ELF", "MIOTA", "UPX"];
        let filters = ["POST", "U", "AND", "IN", "POLL", "AM", "GOT", "GOOD", "TODAY"];

        request({url: url, json: true}, function (err, res, body) {

            if (err) {
                console.error(err);
            }
            ;
            let coins = Object.keys(body.Data).concat(extras);
            let coinsf = Object.keys(body.Data).concat(extras);

            //console.log(coins);

            const coinsa = coins.slice();
            coins = coins.join('","');
            coins = '["' + coins + '"]';

            filters.forEach(f => coinsf.splice(coinsf.indexOf(f), 1));

            const coinsfa = coinsf.slice();
            coinsf = coinsf.join('","');
            coinsf = '["' + coinsf + '"]';

            fs.writeFile("./common/coins.json", coins, function (err) {
                if (err)
                    return console.log(err);
            });
            fs.writeFile("./common/coins_filtered.json", coinsf, function (err) {
                if (err)
                    return console.log(err);
            });

            resolve([coinsa, coinsfa]);

            //console.log("Coins list complete!");

        });

    });
};

update2();

exports.update = update2;
