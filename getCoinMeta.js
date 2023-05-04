//
//  This file is responsible for caching all of the coin metadata from the CoinGecko API
//  This is done by calling the CoinGecko API for each coin and then adding it to a json object that is then written to a file
//  Coins are cached one at a time with a delay between them so as to not exceed the API rate limit for the CoinGecko metadata endpoint
//

const fs = require('fs');
const chalk = require('chalk');
const CoinGecko = require('coingecko-api');
const { JSDOM } = require('jsdom');
const S = require('string');
const CoinGeckoClient = new CoinGecko();
const process = require('node:process');

let meta = { 'data': [] };
let skipped = [];
let count = 0;
let cgCoinsList = '';
let queryTimeout = 15000; // milliseconds for sleeping between api calls to avoid rate limiting


//* makes the call to the CoinGecko API and sets the resJSON global variable to the response
//* also tracks the number of attempts made to get the data and if it fails, it will increase the attempt number and try again
async function getCGdata(coin, index) {
  let attempt = 1;
  let resJSON;
  while (!resJSON && attempt <= 10) {
    try {
      resJSON = await CoinGeckoClient.coins.fetch(coin, {
        'localization': false, 'tickers': false,
        'market_data': false, 'developer_data': false
      });
    } catch {
      console.log(chalk.yellowBright(`Attempt ${chalk.magentaBright(attempt)} failed for ${chalk.cyanBright(coin)} : (${index})` + (attempt === 10 ? chalk.redBright(' ---> All attempts failed!') : ' --> Re-attempting')));
      attempt++;
      await sleep(queryTimeout);
    }
  }
  if (attempt > 1) chalk.greenBright(`Attempt ${attempt} succeeded for ${chalk.cyanBright(coin)}`);
  return resJSON;
}

//* collects the metadata for a coin and does some cleanup and formatting on the data before then adding it to the meta object
async function collectMetadata(coin, index) {
  const resJSON = await getCGdata(coin, index);
  if (!resJSON || resJSON.error || !resJSON.data.symbol || !resJSON.data.name) {
    skipped.push(coin);
    console.log(chalk.yellowBright(`SKIPPED COIN: ${chalk.cyan(coin)} due to missing or bad data. Proceeding...`));
    return;
  }

  // set the description re-formatted, otherwise just leave it blank if there isn't one found (the bot will handle this properly)
  const desc = resJSON.data.description ? formatDescription(resJSON.data.description.en) : '';
  if (!desc) console.log(chalk.magenta(`No description found for: ${chalk.cyan(coin)} - Saving a blank description and proceeding...`));

  // now can assemble a new meta object for this coin and then add it to the global meta json array for writing to file later
  meta.data.push({
    id: ++count,
    coin: resJSON.data.symbol.toUpperCase(),
    name: resJSON.data.name,
    slug: resJSON.data.id,
    logo: resJSON.data.image.large,
    description: desc,
    links: resJSON.data.links
  });
}

//* formatting and cleaning up data in the description field for the coin
function formatDescription(description) {
  const descDOM = new JSDOM(description);
  const elements = descDOM.window.document.getElementsByTagName('a');
  const convertedLinks = Array.from(elements).map(e => `[${e.text}](${e.href})`);

  // replace each html link in the description string its the corresponding converted link we created earlier
  convertedLinks.forEach(link => {
    const locatedString = S(description).between('<a href="', '</a>').s;
    const lookupString = `<a href="${locatedString}</a>`;
    description = description.replace(lookupString, link);
  });

  // clean up the newline formatting and whitespace, then return the description
  // Clean up the newline formatting and whitespace, then return the description
  try {
    return S(description).collapseWhitespace().replaceAll('\r\n', '\n').s;
  }
  catch (e) {
    console.error(chalk.yellow('Description formatting failed, returning a blank string. Error details:\n', e));
    return '';
  }
}

//* once all of the coins have been collected and had their data formatted, this will get called to write the meta object to a file
function writeToFile() {
  fs.writeFileSync('./common/metadata.json', JSON.stringify(meta));
  if (skipped.length > 0) {
    console.log(chalk.yellow(`Warning: The following coins were skipped due to missing data on API at their call time: ${chalk.cyan(skipped.toString())}`));
  }
  console.log(chalk.greenBright('Caching operation completed successfully and file was written!'));
}

//* utility function used to wait in an async function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

//* starts the process of collecting the metadata for all of the coins and handles rate limiting and calling of the other functions
async function startup() {
  cgCoinsList = await CoinGeckoClient.coins.list();
  if (cgCoinsList == 0) {
    console.log(chalk.red('Could not grab coins list, likely currently rate limited or API is down. Exiting..'));
    process.exit(1);
  }
  for (let i = 0; i < cgCoinsList.data.length; i++) {
    const coinData = cgCoinsList.data[i];
    const progress = chalk.green(` (${i + 1} of ${cgCoinsList.data.length})`);
    if (!coinData.id) {
      console.log(chalk.yellow('NO ID FOUND [SKIPPED]') + progress);
    } else {
      console.log(chalk.cyan(coinData.id) + progress);
      await collectMetadata(coinData.id, i + 1);
    }
    await sleep(queryTimeout); // Rate limiting requests to not exceed API limits
  }
  writeToFile();
}

// for starting when running this file directly
startup();
// for exporting to be imported and used in other files like the bot files
exports.run = startup;
