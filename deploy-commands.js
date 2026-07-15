/* ------------------------------------------------------------------------
 *
 *                        TsukiBot - deploy-commands.js
 *
 * Registers (or refreshes) all of TsukiBot's slash commands with Discord.
 *
 * Usage:
 *   node deploy-commands.js                 Register commands GLOBALLY (prod token)
 *   node deploy-commands.js --dev           Register commands GLOBALLY (dev token)
 *   node deploy-commands.js --guild <id>    Register to a single guild (instant, prod token)
 *   node deploy-commands.js --dev --guild <id>  Register to a single guild using dev token
 *
 * Notes:
 *   - Global command updates can take up to an hour to propagate across Discord.
 *   - Guild command updates are instant, so use --guild while developing/testing.
 *   - The bot token is read from common/keys.api (token / devToken fields).
 *
 * ------------------------------------------------------------------------ */

'use strict';

const fs = require('fs');
const path = require('path');
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// ---- Parse CLI args ----
const args = process.argv.slice(2);
const useDevToken = args.includes('--dev');
const guildIndex = args.indexOf('--guild');
const guildId = guildIndex > -1 ? args[guildIndex + 1] : null;

// ---- Load keys ----
const keysPath = path.join(__dirname, 'common', 'keys.api');
if (!fs.existsSync(keysPath)) {
  console.error('ERROR: common/keys.api not found. Set up your keys file first (see docs/How to set up keys file.txt).');
  process.exit(1);
}
const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
const token = useDevToken ? keys.devToken : keys.token;
if (!token) {
  console.error(`ERROR: ${useDevToken ? 'devToken' : 'token'} is missing from common/keys.api.`);
  process.exit(1);
}

// Supported exchanges for the /price command
const priceExchangeChoices = [
  { name: 'Coinbase', value: 'coinbase' },
  { name: 'Binance', value: 'binance' },
  { name: 'Kraken', value: 'kraken' },
  { name: 'Bitfinex', value: 'bitfinex' },
  { name: 'BitMEX', value: 'bitmex' },
  { name: 'Poloniex', value: 'poloniex' },
  { name: 'Graviex', value: 'graviex' }
];

// ---- Command definitions ----
const commands = [
  new SlashCommandBuilder()
    .setName('c')
    .setDescription('Generate a TradingView chart for a trading pair.')
    .addStringOption(o => o.setName('query').setDescription('Pair + optional exchange/interval/indicators, e.g. "ethusd binance 4h rsi macd"').setRequired(true)),

  new SlashCommandBuilder()
    .setName('cg')
    .setDescription('Get CoinGecko prices by ticker(s) or token contract address.')
    .addStringOption(o => o.setName('coins').setDescription('Tickers ("btc eth") or one token contract address').setRequired(true)),

  new SlashCommandBuilder()
    .setName('price')
    .setDescription('Get a coin price from a specific exchange.')
    .addStringOption(o => o.setName('exchange').setDescription('Exchange to query').setRequired(true).addChoices(...priceExchangeChoices))
    .addStringOption(o => o.setName('coin').setDescription('Base coin ticker, e.g. "eth"').setRequired(true))
    .addStringOption(o => o.setName('vs').setDescription('Quote currency, e.g. "usd" (optional)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('cmc')
    .setDescription('Get CoinMarketCap prices for one or more coins.')
    .addStringOption(o => o.setName('coins').setDescription('Space-separated tickers, e.g. "btc eth"').setRequired(true)),

  new SlashCommandBuilder()
    .setName('cc')
    .setDescription('Get CryptoCompare prices for one or more coins.')
    .addStringOption(o => o.setName('coins').setDescription('Space-separated tickers, e.g. "btc eth"').setRequired(true)),

  new SlashCommandBuilder()
    .setName('stocks')
    .setDescription('Get the current market price for a stock ticker.')
    .addStringOption(o => o.setName('symbol').setDescription('Stock ticker symbol, e.g. "AAPL"').setRequired(true)),

  new SlashCommandBuilder().setName('stats').setDescription('Show TsukiBot session statistics.'),
  new SlashCommandBuilder().setName('help').setDescription('Get a link to the full TsukiBot commands guide.'),
  new SlashCommandBuilder().setName('fg').setDescription('Show the current crypto Fear & Greed index.'),
  new SlashCommandBuilder().setName('funding').setDescription('Show BitMEX XBTUSD swap funding data.'),
  new SlashCommandBuilder().setName('ls').setDescription('Show Binance long/short position ratios.'),
  new SlashCommandBuilder().setName('gas').setDescription('Show current Ethereum gas prices.'),
  new SlashCommandBuilder().setName('hmap').setDescription('Show the Coin360 crypto market heatmap.'),
  new SlashCommandBuilder().setName('movers').setDescription('Show the biggest 24h gainers and losers.'),

  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Get a coin\'s description and purpose.')
    .addStringOption(o => o.setName('coin').setDescription('Coin ticker, name, or rank').setRequired(true)),

  new SlashCommandBuilder()
    .setName('mc')
    .setDescription('Get total market cap, or market cap data for a specific coin.')
    .addStringOption(o => o.setName('coin').setDescription('Coin ticker, name, or rank (optional)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('convert')
    .setDescription('Convert an amount of one coin/currency into another at CoinGecko rates.')
    .addNumberOption(o => o.setName('amount').setDescription('Amount to convert').setRequired(true))
    .addStringOption(o => o.setName('from').setDescription('Coin/currency to convert from').setRequired(true))
    .addStringOption(o => o.setName('to').setDescription('Coin/currency to convert to').setRequired(true)),

  new SlashCommandBuilder()
    .setName('translate')
    .setDescription('Translate text to English.')
    .addStringOption(o => o.setName('text').setDescription('Text to translate').setRequired(true)),

  new SlashCommandBuilder()
    .setName('eth')
    .setDescription('Look up an Ethereum address balance, transaction, or ENS name.')
    .addStringOption(o => o.setName('query').setDescription('ETH address (0x...), tx hash (0x...), or ENS name (name.eth)').setRequired(true)),

  new SlashCommandBuilder().setName('invite').setDescription('Get a link to add TsukiBot to your server.'),
  new SlashCommandBuilder().setName('github').setDescription('Get a link to TsukiBot\'s source code on GitHub.'),
  new SlashCommandBuilder().setName('donate').setDescription('Show donation addresses to support TsukiBot.'),

  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Show a user\'s avatar.')
    .addUserOption(o => o.setName('user').setDescription('User to show the avatar of (defaults to you)').setRequired(false)),

  new SlashCommandBuilder().setName('id').setDescription('Get your Discord user ID.'),
  new SlashCommandBuilder().setName('pop').setDescription('Show prices of the top 10 coins by market cap.'),

  new SlashCommandBuilder().setName('tbpa').setDescription('Show your personal coin price array.'),

  new SlashCommandBuilder()
    .setName('tbpa-add')
    .setDescription('Add one or more coins to your personal price array.')
    .addStringOption(o => o.setName('coins').setDescription('Space-separated tickers to add').setRequired(true)),

  new SlashCommandBuilder()
    .setName('tbpa-remove')
    .setDescription('Remove one or more coins from your personal price array.')
    .addStringOption(o => o.setName('coins').setDescription('Space-separated tickers to remove').setRequired(true)),

  new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Create, view, list, or delete server image tags.')
    .addSubcommand(s => s.setName('view').setDescription('View a tag.')
      .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true)))
    .addSubcommand(s => s.setName('create').setDescription('Create a new tag.')
      .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true))
      .addStringOption(o => o.setName('link').setDescription('Tag image/link URL').setRequired(true)))
    .addSubcommand(s => s.setName('delete').setDescription('Delete a tag.')
      .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List all tags in this server.'))
].map(c => c.toJSON());

// ---- Register ----
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    // Resolve the application (client) ID directly from the token's identity.
    const app = await rest.get(Routes.oauth2CurrentApplication());
    const clientId = app.id;

    console.log(`Registering ${commands.length} slash commands for application ${clientId}${guildId ? ` in guild ${guildId}` : ' globally'}...`);

    const route = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId);

    const data = await rest.put(route, { body: commands });

    console.log(`Successfully registered ${data.length} slash commands${guildId ? ' to the guild (available immediately)' : ' globally (may take up to ~1 hour to appear)'}.`);
  } catch (error) {
    console.error('Failed to register slash commands:');
    console.error(error);
    process.exit(1);
  }
})();
