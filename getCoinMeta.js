const fs = require('fs');
const chalk = require('chalk');
let cmcMetaData = {};
const keys = JSON.parse(fs.readFileSync('./common/keys.api', 'utf8'));
const CoinMarketCap = require('coinmarketcap-api');
let clientcmc = new CoinMarketCap(keys['coinmarketcap' + 'failover2']);
let meta = {}; // empty Object
let cmcArray = '';
let cmcArrayDictParsed = '';
let cmcArrayDict = '';



/* ---------------------------------

  getCMCData()

  Create a dictionary of all coins
  names and tickers to be used to 
  reference their metadata.

 ---------------------------------- */

async function getCMCData() {
    //WARNING! This will pull ALL cmc coins and cost you about 11 credits on your api account!
    let cmcJSON = await clientcmc.getTickers({ limit: 4200 }).then().catch(console.error);
    cmcArray = cmcJSON['data'];
    cmcArrayDictParsed = cmcArray;
    cmcArrayDict = {};
    try {
        cmcArray.forEach(function (v) {
            if (!cmcArrayDict[v.symbol])
                cmcArrayDict[v.symbol] = v;
        });
    } catch (err) {
        console.error(chalk.red.bold("failed to get cmc dictionary for metadata caching!"));
    }
    //console.log(chalk.green(chalk.cyan(cmcArray.length) + " CMC tickers updated!"));
}



/* ---------------------------------
 
 getCMCMetaData()
 
 Collects select metadata for coins
 from CMC and saves it to file for
 the bot to make use of. This function 
 is meant to be run outside of the bot
 as it will take a while to finish.
 
 ---------------------------------- */

function getCMCMetaData() {
    let numberOfCoins = cmcArrayDictParsed.length;
    meta['contents'] = 'metadata';
    meta['data'] = [];

    for (let i = 1; i !== numberOfCoins + 1; i++) {
        setTimeout(function timer() {
            let key = cmcArrayDictParsed[i - 1];
            //console.log(key);
            clientcmc.getMetadata({ id: key.id }).then(function (metaJSON) {
                //console.log(metaJSON);
                let data = {
                    id: key.id,
                    coin: key.symbol,
                    name: key.name,
                    slug: key.slug,
                    logo: metaJSON.data[key.id].logo,
                    description: metaJSON.data[key.id].description,
                    links: metaJSON.data[key.id]["urls"]
                };
                meta['data'].push(data);
                console.log(chalk.blue("COMPLETED " + chalk.cyan(i) + " OF " + chalk.cyan(numberOfCoins)));
            }).catch(console.error);

            if (i === numberOfCoins) {
                soupTime();
            }
        }, i * 2400);
    }
}

function soupTime() {
    //console.log(meta);
    fs.writeFile("./common/metadata.json", JSON.stringify(meta), function (err) {
        if (err)
            return console.log(err);
    });
    console.log(chalk.greenBright("Operation completed successfully!"));
}

// run the functions
getCMCData();
console.log(chalk.blue("Starting caching process, please wait.."));
setTimeout(function () {
    getCMCMetaData();
}, 5000);
