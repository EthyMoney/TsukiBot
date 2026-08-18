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
 * Owner-only commands (see OWNER_ONLY_COMMANDS) are NOT registered globally. A global command is
 * visible to every administrator in every server the bot is in, and to everyone in DMs, because
 * default_member_permissions is only a default that server admins can override and it does not
 * apply to DMs at all. Registering those commands to a single guild means they do not exist
 * anywhere else, which is a real restriction rather than a hidden one.
 *
 * The owner guild is read from OWNER_GUILD_ID or the "ownerGuild" field in common/keys.api, so a
 * specific server ID never has to live in this file.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const fs = require('fs');
const path = require('path');
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

// ---- Parse CLI args ----
const args = process.argv.slice(2);
const useDevToken = args.includes('--dev');
const guildIndex = args.indexOf('--guild');
const guildId = guildIndex > -1 ? args[guildIndex + 1] : null;

// Commands that must never be registered globally. See the header for why a guild-scoped command
// is a genuine restriction and default_member_permissions is not.
const OWNER_ONLY_COMMANDS = new Set(['usage']);

/**
 * Reads common/keys.api, or an empty object if it is absent. Never exits: callers decide whether a
 * missing value is fatal.
 * @returns {object}
 */
function readKeys() {
  const keysPath = path.join(__dirname, 'common', 'keys.api');
  if (!fs.existsSync(keysPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  }
  catch {
    return {};
  }
}

// Reads the bot token, preferring an environment variable so this works in Docker/CI without a
// keys file. Called only on a direct run, so requiring this module never exits the process.
function loadToken() {
  const envToken = useDevToken ? process.env.TSUKIBOT_DEV_TOKEN : process.env.TSUKIBOT_TOKEN;
  if (envToken) return envToken;

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
  return token;
}

/**
 * The guild that owner-only commands are registered to.
 * @returns {string|null} null when unconfigured, which the caller reports rather than guessing.
 */
function resolveOwnerGuildId() {
  const id = process.env.OWNER_GUILD_ID || readKeys().ownerGuild;
  return id ? String(id) : null;
}

// Supported exchanges for the /price command
const priceExchangeChoices = [
  { name: 'Coinbase', value: 'coinbase' },
  { name: 'Binance', value: 'binance' },
  { name: 'Kraken', value: 'kraken' },
  { name: 'Bitfinex', value: 'bitfinex' },
  { name: 'BitMEX', value: 'bitmex' },
  { name: 'Poloniex', value: 'poloniex' }
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
  new SlashCommandBuilder()
    .setName('funding')
    .setDescription('Show perpetual swap funding rates across Binance, Bybit, OKX, and BitMEX.')
    .addStringOption(o => o.setName('coin').setDescription('Coin ticker, e.g. "btc" (defaults to BTC)').setRequired(false).setAutocomplete(true)),
  new SlashCommandBuilder().setName('ls').setDescription('Show Binance long/short position ratios.'),
  new SlashCommandBuilder().setName('gas').setDescription('Show current Ethereum gas prices.'),
  new SlashCommandBuilder().setName('hmap').setDescription('Show the Coin360 crypto market heatmap.'),
  new SlashCommandBuilder().setName('movers').setDescription('Show the biggest 24h gainers and losers.'),
  new SlashCommandBuilder().setName('trending').setDescription('Show the coins people are searching for most right now.'),
  new SlashCommandBuilder().setName('brief').setDescription('Get a short written summary of what the market is doing right now.'),

  new SlashCommandBuilder()
    .setName('ath')
    .setDescription('Show a coin\'s all-time high and low, and how far it is from each.')
    .addStringOption(o => o.setName('coin').setDescription('Coin ticker, name, or rank').setRequired(true).setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Compare two coins, including what one would be worth at the other\'s market cap.')
    .addStringOption(o => o.setName('coin1').setDescription('First coin').setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName('coin2').setDescription('Second coin').setRequired(true).setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Get a coin\'s description and purpose.')
    .addStringOption(o => o.setName('coin').setDescription('Coin ticker, name, or rank').setRequired(true).setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName('mc')
    .setDescription('Get total market cap, or market cap data for a specific coin.')
    .addStringOption(o => o.setName('coin').setDescription('Coin ticker, name, or rank (optional)').setRequired(false).setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName('convert')
    .setDescription('Convert an amount of one coin/currency into another at CoinGecko rates.')
    .addNumberOption(o => o.setName('amount').setDescription('Amount to convert').setRequired(true))
    .addStringOption(o => o.setName('from').setDescription('Coin/currency to convert from').setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName('to').setDescription('Coin/currency to convert to').setRequired(true).setAutocomplete(true)),

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
    .setName('schedule')
    .setDescription('Set up recurring market posts in a channel.')
    // Server-configuration command, so restrict it to members who can manage the server.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('create').setDescription('Schedule a recurring post.')
      .addStringOption(o => o.setName('command').setDescription('What to post').setRequired(true).addChoices(
        { name: 'Market heatmap', value: 'hmap' },
        { name: 'Fear & Greed index', value: 'fg' },
        { name: 'Biggest 24h movers', value: 'movers' },
        { name: 'Trending coins', value: 'trending' },
        { name: 'Top 10 coins', value: 'pop' },
        { name: 'Prices for specific coins', value: 'cg' }
      ))
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post in').setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption(o => o.setName('every').setDescription('How often to post').setRequired(true).addChoices(
        { name: 'Every 30 minutes', value: '30m' },
        { name: 'Hourly', value: '1h' },
        { name: 'Every 4 hours', value: '4h' },
        { name: 'Every 12 hours', value: '12h' },
        { name: 'Daily', value: 'daily' }
      ))
      .addStringOption(o => o.setName('coins').setDescription('Coins to post, only for the "Prices for specific coins" option').setRequired(false)))
    .addSubcommand(s => s.setName('list').setDescription('Show this server\'s scheduled posts.'))
    .addSubcommand(s => s.setName('delete').setDescription('Remove a scheduled post.')
      .addIntegerOption(o => o.setName('id').setDescription('Job ID (from /schedule list)').setRequired(true))),

  new SlashCommandBuilder()
    .setName('portfolio')
    .setDescription('Track your holdings and see what they are worth.')
    .addSubcommand(s => s.setName('show').setDescription('Show your portfolio value and 24h change.'))
    .addSubcommand(s => s.setName('set').setDescription('Set (or remove, with amount 0) how much of a coin you hold.')
      .addStringOption(o => o.setName('coin').setDescription('Coin ticker or name').setRequired(true).setAutocomplete(true))
      .addNumberOption(o => o.setName('amount').setDescription('How much you hold (0 removes it)').setRequired(true)))
    .addSubcommand(s => s.setName('clear').setDescription('Remove every holding from your portfolio.')),

  new SlashCommandBuilder()
    .setName('alert')
    .setDescription('Get a DM when a coin hits a price you choose.')
    .addSubcommand(s => s.setName('add').setDescription('Set a new price alert.')
      .addStringOption(o => o.setName('coin').setDescription('Coin ticker or name').setRequired(true).setAutocomplete(true))
      .addNumberOption(o => o.setName('price').setDescription('Target price in USD').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('Show your active price alerts.'))
    .addSubcommand(s => s.setName('remove').setDescription('Remove one of your price alerts.')
      .addIntegerOption(o => o.setName('id').setDescription('Alert ID (from /alert list)').setRequired(true))),

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
    .addSubcommand(s => s.setName('list').setDescription('List all tags in this server.')),

  // Usage telemetry. The real gate is in the handler, which checks the application owner (or the
  // botAdmins list in keys.api) - a per-guild permission would be the wrong gate for reports that
  // span every server. Administrator here is only to keep the command out of ordinary members'
  // pickers, since they could never use it; it does not restrict DMs, so the owner always has it.
  new SlashCommandBuilder()
    .setName('usage')
    .setDescription('Bot owner only: usage telemetry and metrics.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('overview').setDescription('Headline numbers: volume, reach, reliability, speed.')
      .addIntegerOption(o => o.setName('days').setDescription('Window in days (default 30)').setMinValue(1).setMaxValue(3650))
      .addStringOption(o => o.setName('timezone').setDescription('IANA timezone for daily buckets (default UTC)')))
    .addSubcommand(s => s.setName('commands').setDescription('Most used commands.')
      .addIntegerOption(o => o.setName('days').setDescription('Window in days (default 30)').setMinValue(1).setMaxValue(3650))
      .addIntegerOption(o => o.setName('limit').setDescription('How many to list (default 15)').setMinValue(1).setMaxValue(50))
      .addBooleanOption(o => o.setName('include_searches').setDescription('Count autocomplete searches as uses too')))
    .addSubcommand(s => s.setName('users').setDescription('Most active users.')
      .addIntegerOption(o => o.setName('days').setDescription('Window in days (default 30)').setMinValue(1).setMaxValue(3650))
      .addIntegerOption(o => o.setName('limit').setDescription('How many to list (default 15)').setMinValue(1).setMaxValue(50)))
    .addSubcommand(s => s.setName('servers').setDescription('Most active servers.')
      .addIntegerOption(o => o.setName('days').setDescription('Window in days (default 30)').setMinValue(1).setMaxValue(3650))
      .addIntegerOption(o => o.setName('limit').setDescription('How many to list (default 15)').setMinValue(1).setMaxValue(50)))
    .addSubcommand(s => s.setName('coins').setDescription('Most requested coins.')
      .addIntegerOption(o => o.setName('days').setDescription('Window in days (default 30)').setMinValue(1).setMaxValue(3650))
      .addIntegerOption(o => o.setName('limit').setDescription('How many to list (default 15)').setMinValue(1).setMaxValue(50)))
    .addSubcommand(s => s.setName('activity').setDescription('When the bot gets used: hour, weekday, heatmap.')
      .addIntegerOption(o => o.setName('days').setDescription('Window in days (default 30)').setMinValue(1).setMaxValue(3650))
      .addStringOption(o => o.setName('timezone').setDescription('IANA timezone, e.g. America/Chicago (default UTC)')))
    .addSubcommand(s => s.setName('command').setDescription('Deep dive on one command: subcommands, options, values.')
      .addStringOption(o => o.setName('name').setDescription('Command name, without the slash').setRequired(true).setAutocomplete(true))
      .addIntegerOption(o => o.setName('days').setDescription('Window in days (default 30)').setMinValue(1).setMaxValue(3650)))
    .addSubcommand(s => s.setName('errors').setDescription('What is failing, and what is slow.')
      .addIntegerOption(o => o.setName('days').setDescription('Window in days (default 30)').setMinValue(1).setMaxValue(3650))
      .addIntegerOption(o => o.setName('limit').setDescription('How many to list (default 15)').setMinValue(1).setMaxValue(50)))
    .addSubcommand(s => s.setName('growth').setDescription('New vs returning users, and retention.')
      .addIntegerOption(o => o.setName('days').setDescription('Window in days (default 30)').setMinValue(1).setMaxValue(3650))
      .addStringOption(o => o.setName('timezone').setDescription('IANA timezone for daily buckets (default UTC)')))
    .addSubcommand(s => s.setName('export').setDescription('Download raw events as a CSV file.')
      .addIntegerOption(o => o.setName('days').setDescription('Window in days (default 30)').setMinValue(1).setMaxValue(3650))
      .addIntegerOption(o => o.setName('rows').setDescription('Row cap (default 5000, max 50000)').setMinValue(1).setMaxValue(50000)))
    .addSubcommand(s => s.setName('storage').setDescription('Table size, row count, and writer health.'))
    .addSubcommand(s => s.setName('prune').setDescription('Permanently delete events older than a cutoff.')
      .addIntegerOption(o => o.setName('keep_days').setDescription('Keep events newer than this many days').setRequired(true).setMinValue(1).setMaxValue(3650))
      .addBooleanOption(o => o.setName('confirm').setDescription('Must be True to actually delete'))),
].map(c => c.toJSON());

// Split by where each command gets registered. `commands` remains the full set so drift tests can
// check every command against main.js's handler switch regardless of scope.
const globalCommands = commands.filter(c => !OWNER_ONLY_COMMANDS.has(c.name));
const ownerGuildCommands = commands.filter(c => OWNER_ONLY_COMMANDS.has(c.name));

// Exported so the command definitions can be inspected and validated without registering anything
// with Discord (see test/commands.test.js).
module.exports = { commands, globalCommands, ownerGuildCommands, OWNER_ONLY_COMMANDS };

// ---- Register ----
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(loadToken());
  try {
    // Resolve the application (client) ID directly from the token's identity.
    const app = await rest.get(Routes.oauth2CurrentApplication());
    const clientId = app.id;

    // --guild puts everything in one guild, which is the development path: guild updates are
    // instant while global ones take up to an hour to propagate.
    if (guildId) {
      console.log(`Registering all ${commands.length} slash commands for application ${clientId} in guild ${guildId}...`);
      const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`Successfully registered ${data.length} slash commands to the guild (available immediately).`);
      return;
    }

    // Normal path: everything public goes global, owner-only commands go to one guild.
    //
    // This PUT is a full replacement of the global set, so dropping a command from globalCommands
    // is also what deregisters it. That is how /usage stops being globally visible if it ever was.
    console.log(`Registering ${globalCommands.length} global slash commands for application ${clientId}...`);
    const global = await rest.put(Routes.applicationCommands(clientId), { body: globalCommands });
    console.log(`Successfully registered ${global.length} slash commands globally (may take up to ~1 hour to appear).`);

    const ownerGuildId = resolveOwnerGuildId();
    const ownerNames = ownerGuildCommands.map(c => '/' + c.name).join(', ');

    if (!ownerGuildId) {
      console.warn(`\nWARNING: ${ownerNames} was NOT registered anywhere: no owner guild is configured.`);
      console.warn('Set "ownerGuild" in common/keys.api (or OWNER_GUILD_ID in the environment) to a server ID, then re-run.');
      return;
    }

    // Also a full replacement, of that guild's command set. Nothing else is registered per-guild,
    // so this leaves exactly the owner-only commands there.
    const owner = await rest.put(Routes.applicationGuildCommands(clientId, ownerGuildId), { body: ownerGuildCommands });
    console.log(`Successfully registered ${owner.length} owner-only command(s) to guild ${ownerGuildId} (available immediately): ${ownerNames}.`);
  } catch (error) {
    console.error('Failed to register slash commands:');
    console.error(error);
    process.exit(1);
  }
}

// Registration only runs when this file is executed directly, never on require, so the command
// definitions above can be imported and validated without talking to Discord.
if (require.main === module) {
  registerCommands();
}
