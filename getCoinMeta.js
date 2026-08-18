//
//  This file is responsible for caching all of the coin metadata from the CoinGecko API
//  This is done by calling the CoinGecko API for each coin and then adding it to a json object that is then written to a file
//  Coins are cached one at a time with a delay between them so as to not exceed the API rate limit for the CoinGecko metadata endpoint
//

const fs = require('fs');
const pc = require('picocolors');
const { JSDOM } = require('jsdom');
const process = require('node:process');

/* --------------------------------------------

    CoinGecko access.

    This used to go through the coingecko-api npm package, which is from 2019 and sends no
    User-Agent — CoinGecko now answers those requests with HTTP 403, so every call here was
    failing. These helpers use fetch directly, send a descriptive User-Agent, and apply a
    demo/pro key when one is configured (which raises the rate limit from per-IP to per-key).

    They deliberately return { data: ... } to match the shape the old package produced, so the
    consuming code below is unchanged.

  -------------------------------------------- */

const CG_USER_AGENT = 'TsukiBot/1.0 (+https://github.com/EthyMoney/TsukiBot)';

function getCGRestConfig() {
  let keys = {};
  try {
    keys = JSON.parse(fs.readFileSync('./common/keys.api', 'utf8'));
  } catch {
    // No keys file: fall through to keyless access.
  }
  const proApiKey = process.env.COINGECKO_PRO_API_KEY || keys.coingeckoPro;
  if (proApiKey) {
    return { baseUrl: 'https://pro-api.coingecko.com/api/v3', headers: { 'x-cg-pro-api-key': proApiKey } };
  }
  const demoApiKey = process.env.COINGECKO_API_KEY || keys.coingecko || keys.coingeckoDemo;
  if (demoApiKey) {
    return { baseUrl: 'https://api.coingecko.com/api/v3', headers: { 'x-cg-demo-api-key': demoApiKey } };
  }
  return { baseUrl: 'https://api.coingecko.com/api/v3', headers: {} };
}

async function cgRequest(path) {
  const apiConfig = getCGRestConfig();
  const res = await fetch(apiConfig.baseUrl + path, {
    headers: { accept: 'application/json', 'user-agent': CG_USER_AGENT, ...apiConfig.headers }
  });
  if (!res.ok) {
    throw new Error(`CoinGecko ${path} returned HTTP ${res.status}`);
  }
  return { data: await res.json() };
}

const CoinGeckoClient = {
  coins: {
    list: () => cgRequest('/coins/list'),
    fetch: (id) => cgRequest(`/coins/${encodeURIComponent(id)}` +
      '?localization=false&tickers=false&market_data=false&developer_data=false')
  }
};

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
      console.log(pc.yellowBright(`Attempt ${pc.magentaBright(attempt)} failed for ${pc.cyanBright(coin)} : (${index})` + (attempt === 10 ? pc.redBright(' ---> All attempts failed!') : ' --> Re-attempting')));
      attempt++;
      await sleep(queryTimeout);
    }
  }
  if (attempt > 1) pc.greenBright(`Attempt ${attempt} succeeded for ${pc.cyanBright(coin)}`);
  return resJSON;
}

//* collects the metadata for a coin and does some cleanup and formatting on the data before then adding it to the meta object
async function collectMetadata(coin, index) {
  const resJSON = await getCGdata(coin, index);
  if (!resJSON || resJSON.error || !resJSON.data.symbol || !resJSON.data.name) {
    skipped.push(coin);
    console.log(pc.yellowBright(`SKIPPED COIN: ${pc.cyan(coin)} due to missing or bad data. Proceeding...`));
    return;
  }

  // set the description re-formatted, otherwise just leave it blank if there isn't one found (the bot will handle this properly)
  const desc = resJSON.data.description ? formatDescription(resJSON.data.description.en) : '';
  if (!desc) console.log(pc.magenta(`No description found for: ${pc.cyan(coin)} - Saving a blank description and proceeding...`));

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

//* grabs the text sitting between the first occurrence of the left marker and the next right marker after it
//* returns a blank string when the right marker isn't found, same as the old string.js between() this replaced
function between(str, left, right) {
  const startPos = str.indexOf(left);
  const endPos = str.indexOf(right, startPos + left.length);
  if (endPos === -1) return '';
  return str.slice(startPos + left.length, endPos);
}

//* squashes every run of whitespace (non-breaking spaces included) down to a single space and trims the ends
function collapseWhitespace(str) {
  return str.replace(/[\s\xa0]+/g, ' ').replace(/^\s+|\s+$/g, '');
}

//* formatting and cleaning up data in the description field for the coin
function formatDescription(description) {
  const descDOM = new JSDOM(description);
  const elements = descDOM.window.document.getElementsByTagName('a');
  const convertedLinks = Array.from(elements).map(e => `[${e.text}](${e.href})`);

  // replace each html link in the description string its the corresponding converted link we created earlier
  convertedLinks.forEach(link => {
    const locatedString = between(description, '<a href="', '</a>');
    const lookupString = `<a href="${locatedString}</a>`;
    description = description.replace(lookupString, link);
  });

  // clean up the newline formatting and whitespace, then return the description
  try {
    return collapseWhitespace(description).replaceAll('\r\n', '\n');
  }
  catch (e) {
    console.error(pc.yellow('Description formatting failed, returning a blank string. Error details:\n' + e));
    return '';
  }
}

//* once all of the coins have been collected and had their data formatted, this will get called to write the meta object to a file
function writeToFile() {
  fs.writeFileSync('./common/metadata.json', JSON.stringify(meta));
  if (skipped.length > 0) {
    console.log(pc.yellow(`Warning: The following coins were skipped due to missing data on API at their call time: ${pc.cyan(skipped.toString())}`));
  }
  console.log(pc.greenBright('Caching operation completed successfully and file was written!'));
}

//* utility function used to wait in an async function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

//* starts the process of collecting the metadata for all of the coins and handles rate limiting and calling of the other functions
async function startup() {
  // cgRequest throws on a non-OK response, so catch here to keep the original exit behaviour
  // rather than dying with an unhandled rejection.
  try {
    cgCoinsList = await CoinGeckoClient.coins.list();
  } catch (err) {
    console.log(pc.red('Could not grab coins list: ' + err.message + '. Exiting..'));
    process.exit(1);
  }
  if (!cgCoinsList || !Array.isArray(cgCoinsList.data) || cgCoinsList.data.length === 0) {
    console.log(pc.red('Could not grab coins list, likely currently rate limited or API is down. Exiting..'));
    process.exit(1);
  }
  for (let i = 0; i < cgCoinsList.data.length; i++) {
    const coinData = cgCoinsList.data[i];
    const progress = pc.green(` (${i + 1} of ${cgCoinsList.data.length})`);
    if (!coinData.id) {
      console.log(pc.yellow('NO ID FOUND [SKIPPED]') + progress);
    } else {
      console.log(pc.cyan(coinData.id) + progress);
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
