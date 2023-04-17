//
//  This file is responsible for caching all of the coin metadata from the CoinGecko API
//  This is done by calling the CoinGecko API for each coin and then adding it to a json object that is then written to a file
//  Coins are cached one at a time with a delay between them so as to not exceed the API rate limit for the CoinGecko metadata endpoint
//


//* general setup
const fs = require('fs');
const chalk = require('chalk');
const CoinGecko = require('coingecko-api');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const S = require('string');
const CoinGeckoClient = new CoinGecko();
const process = require('node:process');
let meta = { 'data': [] };
let skipped = [];
let count = 0;
let cgCoinsList = '';
let resJSON = null;
let attempt = 1;


//* makes the call to the CoinGecko API and sets the resJSON global variable to the response
//* also tracks the number of attempts made to get the data and if it fails, it will increase the attempt number and try again
async function getCGdata(coin, index) {
  resJSON = await CoinGeckoClient.coins.fetch(coin, {
    'localization': false, 'tickers': false,
    'market_data': false, 'developer_data': false
  }).catch(() => {
    // notify of failed attempt(s)
    if (attempt < 10) {
      console.log(chalk.yellowBright('Attempt ' + chalk.magentaBright(attempt) + ' failed for ' + chalk.cyanBright(coin) + ' : (' + index + ') --> Re-attempting'));
      attempt += 1;
    }
    else {
      console.log(chalk.yellowBright('Attempt ' + chalk.magentaBright(attempt) + ' failed for ' + chalk.cyanBright(coin) + ' : (' + index + ') ' +
        chalk.redBright('---> All attempts failed! SHUTTING DOWN :(')));
      process.exit(1);
    }
  });
}


//* collects the metadata for a coin and does some cleanup and formatting on the data before then adding it to the meta object
async function collectMetadata(coin, index) {
  let stringResponse = '';
  // Get api data
  await getCGdata(coin, index);
  // Keep trying again on failed attempts (usually this is due to a request timeout or temporary rate limit trip and can be recovered with a retry)
  while (!resJSON) {
    await getCGdata(coin, index);
  }

  // Skip instances where the coin has missing data on API side (this can happen if the API removes it while this process is running or the entry is corrupt)
  if (resJSON.error || !resJSON.data.symbol || !resJSON.data.name) {
    skipped.push(coin);
    console.log(chalk.yellowBright(`SKIPPED COIN: ${chalk.cyan(coin)} due to missing data. Proceeding...`));
    return;
  }

  // Formatting and cleaning up data in the description field for the coin
  if (resJSON.data.description) {
    stringResponse = resJSON.data.description.en;
    const descDOM = new JSDOM(stringResponse);
    let convertedLinks = [];

    // Extract all of the html links, convert them to discord embed links, and then put them into an array
    let elements = descDOM.window.document.getElementsByTagName('a');
    for (let i = 0; i < elements.length; i++) {
      let element = elements[i];
      let url = element.href;
      let hyperlinkText = element.text;
      let discordHyperlink = `[${hyperlinkText}](${url})`;
      convertedLinks.push(discordHyperlink);
    }

    // Replace each html link in the description string its the corresponding converted link we created earlier
    for (let i = 0; i < convertedLinks.length; i++) {
      let locatedString = S(stringResponse).between('<a href="', '</a>').s;
      let lookupString = `<a href="${locatedString}</a>`;
      stringResponse = stringResponse.replace(lookupString, convertedLinks[i]);
    }

    // Clean up the newline formatting
    stringResponse = S(stringResponse).replaceAll('\r\n\r\n', '\n\n').s;
    stringResponse = S(stringResponse).replaceAll('\r\n\r', '\n\n').s;
    stringResponse = S(stringResponse).replaceAll('\r\n', '\n').s;
    stringResponse = S(stringResponse).replaceAll('\n\r', '\n').s;
    stringResponse = S(stringResponse).replaceAll('\n\r\n', '\n\n').s;
    stringResponse = S(stringResponse).replaceAll('\n\r\n\r', '\n\n').s;
  }
  // Otherwise we just leave the description blank if there isn't one found (the bot knows what to do with this when it sees it)
  else {
    stringResponse = '';
    console.log(chalk.magenta(`Blank description saved for: ${chalk.cyan(coin)} due to missing data. Proceeding...`));
  }

  // Now can assemble a new meta object for this coin and then add it to the global meta json array for writing to file later
  let coinMeta = {
    id: ++count,
    coin: resJSON.data.symbol.toUpperCase(),
    name: resJSON.data.name,
    slug: resJSON.data.id,
    logo: resJSON.data.image.large,
    description: stringResponse,
    links: resJSON.data.links
  };
  meta.data.push(coinMeta);

  // Reset for next coin
  resJSON = null;
  attempt = 1;
}


//* once all of the coins have been collected and had their data formatted, this will get called to write the meta object to a file
function writeToFile() {
  fs.writeFileSync('./common/metadata.json', JSON.stringify(meta), function (err) {
    if (err)
      return console.log(err);
  });
  if (skipped.length > 0) {
    console.log(chalk.yellow(`Warning: The following coins were skipped due to missing data on API at their call time: ${chalk.cyan(skipped.toString())}`));
  }
  console.log(chalk.greenBright('Caching operation completed successfully and file was written!'));
}


//* utility function used to wait in an async function
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


//* starts the process of collecting the metadata for all of the coins and handles rate limiting and calling of the other functions
async function startup() {
  cgCoinsList = await CoinGeckoClient.coins.list();
  for (let i = 0; i < cgCoinsList.data.length; i++) {
    // skip coins with no id in api
    if (!cgCoinsList.data[i].id) {
      console.log(chalk.yellow('NO ID FOUND [SKIPPED]') + chalk.green(` (${i + 1} of ${cgCoinsList.data.length})`));
    }
    else {
      console.log(chalk.cyan(cgCoinsList.data[i].id) + chalk.green(` (${i + 1} of ${cgCoinsList.data.length})`));
      await collectMetadata(cgCoinsList.data[i].id, i + 1);
    }
    await sleep(15000); //rate limiting requests to not exceed api limits
  }
  writeToFile();
}


//* starts the script
startup();

//* allows the script to be imported and run from within the bot process
exports.run = startup;
