const fs = require('fs');
let pairs = JSON.parse(fs.readFileSync("./common/coins.json", "utf8"));
const chalk = require('chalk');
let cmcMetaData = {};
const keys = JSON.parse(fs.readFileSync('./common/keys.api', 'utf8'));
const CoinMarketCap = require('coinmarketcap-api');
let clientcmc = new CoinMarketCap(keys['coinmarketcap' + 'failover']);
let meta = {}; // empty Object

/* ---------------------------------
 
 getCMCMetaData()
 
 Collects select metadata for coins
 from CMC and saves it to file for
 the bot to make use of. This function 
 is meant to be run outside of the bot
 as it will take a while to finish.
 
 ---------------------------------- */

function getCMCMetaData() {
    let numberOfCoins = pairs.length;
    meta['contents'] = 'metadata';
    meta['data'] = [];

    for (let i = 1; i !== numberOfCoins + 1; i++) {
        setTimeout(function timer() {
            let key = pairs[i-1];
            clientcmc.getMetadata({symbol: key}).then(function (metaJSON) {
                //console.log(metaJSON);
                let data = {
                    coin: key,
                    logo: metaJSON.data[key].logo,
                    description: metaJSON.data[key].description
                };
                meta['data'].push(data);
                console.log(chalk.blue("COMPLETED " + i + " OF " + numberOfCoins));
            }).catch(console.error);

            if (i === numberOfCoins) {
                soupTime();
            }
        }, i * 2400);
    }
}

function soupTime() {
    console.log(meta);
    fs.writeFile("./common/metadata.json", JSON.stringify(meta), function (err) {
        if (err)
            return console.log(err);
    });
    console.log(chalk.cyan("Operation completed successfully!"));
}

// run the function
getCMCMetaData();
