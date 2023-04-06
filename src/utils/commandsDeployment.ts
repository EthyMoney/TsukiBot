// Place your client and guild ids here
// test bot
//const clientId = '508103160645025802';
// production bot
const clientId = '';
// test bot
//const token = '..FVg-';
// production bot
const token = '..';
import { SlashCommandBuilder, Routes } from 'discord.js';
import { REST } from '@discordjs/rest';

const commands = [
  //! charts
  new SlashCommandBuilder()
    .setName('c')
    .setDescription('Grabs a tradingview chart')
    .addStringOption(option =>
      option.setName('pair')
        .setDescription('The ticker or pair to chart. Example: btcusd')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('timeframe')
        .setDescription('The timeframe to display on the chart. Example: 4h  (defaults to 1 hour)')
        .setRequired(false)
        .addChoices(
          { name: '1 Minute', value: '1' },
          { name: '5 Minutes', value: '5' },
          { name: '15 Minutes', value: '15' },
          { name: '30 Minutes', value: '30' },
          { name: '1 Hour', value: '60' },
          { name: '4 Hours', value: '240' },
          { name: '1 Day', value: 'D' },
          { name: '1 Week', value: 'W' },
          { name: '1 Month', value: 'M' }))
    .addStringOption(option =>
      option.setName('indicator')
        .setDescription('An indicator to display on the chart. Example: rsi  (defaults to none)')
        .setRequired(false)
        .addChoices(
          { name: 'RSI', value: 'rsi' },
          { name: 'MACD', value: 'macd' },
          { name: 'Stochastic', value: 'stoch' },
          { name: 'Bollinger Bands', value: 'bb' },
          { name: 'Ichimoku Cloud', value: 'ichi' },
          { name: 'Stochastic RSI', value: 'stochrsi' },
          { name: 'Williams %R', value: 'williamr' },
          { name: 'Awesome Oscillator', value: 'ao' },
          { name: 'Commodity Channel Index', value: 'cci' },
          { name: 'Force Index', value: 'fi' },
          { name: 'Bollinger Bands Width', value: 'bbw' },
          { name: 'MA', value: 'ma' },
          { name: 'EMA', value: 'ema' },
          { name: 'DEMA', value: 'dema' },
          { name: 'TEMA', value: 'tema' },
          { name: 'Moonphase', value: 'moonphase' }))
    .addStringOption(option =>
      option.setName('exchange')
        .setDescription('The exchange use for price data. Example: binance  (defaults to binance when possible)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('additional-indicator')
        .setDescription('An optional additional indicator to display on the chart. Example: macd  (defaults to none)')
        .setRequired(false)
        .addChoices(
          { name: 'RSI', value: 'rsi' },
          { name: 'MACD', value: 'macd' },
          { name: 'Stochastic', value: 'stoch' },
          { name: 'Bollinger Bands', value: 'bb' },
          { name: 'Ichimoku Cloud', value: 'ichi' },
          { name: 'Stochastic RSI', value: 'stochrsi' },
          { name: 'Williams %R', value: 'williamr' },
          { name: 'Awesome Oscillator', value: 'ao' },
          { name: 'Commodity Channel Index', value: 'cci' },
          { name: 'Force Index', value: 'fi' },
          { name: 'Bollinger Bands Width', value: 'bbw' },
          { name: 'MA', value: 'ma' },
          { name: 'EMA', value: 'ema' },
          { name: 'DEMA', value: 'dema' },
          { name: 'TEMA', value: 'tema' },
          { name: 'Moonphase', value: 'moonphase' }))
    .addStringOption(option =>
      option.setName('additional-indicator2')
        .setDescription('An optional additional indicator to display on the chart. Example: stochrsi  (defaults to none)')
        .setRequired(false)
        .addChoices(
          { name: 'RSI', value: 'rsi' },
          { name: 'MACD', value: 'macd' },
          { name: 'Stochastic', value: 'stoch' },
          { name: 'Bollinger Bands', value: 'bb' },
          { name: 'Ichimoku Cloud', value: 'ichi' },
          { name: 'Stochastic RSI', value: 'stochrsi' },
          { name: 'Williams %R', value: 'williamr' },
          { name: 'Awesome Oscillator', value: 'ao' },
          { name: 'Commodity Channel Index', value: 'cci' },
          { name: 'Force Index', value: 'fi' },
          { name: 'Bollinger Bands Width', value: 'bbw' },
          { name: 'MA', value: 'ma' },
          { name: 'EMA', value: 'ema' },
          { name: 'DEMA', value: 'dema' },
          { name: 'TEMA', value: 'tema' },
          { name: 'Moonphase', value: 'moonphase' })),
  //! cg prices
  new SlashCommandBuilder()
    .setName('cg')
    .setDescription('Grabs the current price of a coin from CoinGecko')
    .addStringOption(option =>
      option.setName('coin-ticker')
        .setDescription('The ticker of the coin to get the price of. Example: btc')
        .setRequired(true)),
  //! exchange prices
  // new SlashCommandBuilder()
  //   .setName('price')
  //   .setDescription('Grabs the current price of a coin from a specified exchange')
  //   .addStringOption(option =>
  //     option.setName('coin-ticker')
  //       .setDescription('The ticker of the coin to get the price of. Example: btc')
  //       .setRequired(true))
  //   .addStringOption(option =>
  //     option.setName('exchange')
  //       .setDescription('The exchange to get the price from. Example: binance')
  //       .setRequired(true)
  //       .addChoices(
  //         { name: 'Binance', value: 'binance' },
  //         { name: 'Bittrex', value: 'bittrex' },
  //         { name: 'Bitfinex', value: 'bitfinex' },
  //         { name: 'Coinbase', value: 'coinbase' },
  //         { name: 'BitMEX', value: 'bitmex' },
  //         { name: 'Kraken', value: 'kraken' },
  //         { name: 'Poloniex', value: 'poloniex' }))
  //   .addStringOption(option =>
  //     option.setName('currency')
  //       .setDescription('The currency to get the price in. Example: usd  (defaults to usd or btc when possible)')
  //       .setRequired(true)),
  //! bot stats
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Grabs the current session stats of the bot'),
  //! help
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Provides the link to the commands help page (note that this is a work in progress, hang in there!)'),
  //! fear/greed
  new SlashCommandBuilder()
    .setName('fg')
    .setDescription('Grabs the current Bitcoin market fear/greed index value'),
  //! funding
  new SlashCommandBuilder()
    .setName('funding')
    .setDescription('Grabs the current Bitcoin market funding rates from BitMEX'),
  //! longs/shorts
  new SlashCommandBuilder()
    .setName('ls')
    .setDescription('Grabs the current Bitcoin market long/short position totals from Binance'),
  //! gas
  new SlashCommandBuilder()
    .setName('gas')
    .setDescription('Grabs the current Ethereum gas prices for transactions'),
  //! invite
  // new SlashCommandBuilder()
  //   .setName('invite')
  //   .setDescription('Provides the link to invite the bot to your server!'),
  //! donate
  // new SlashCommandBuilder()
  //   .setName('donate')
  //   .setDescription('Provides the details to donate to the bot and support development!'),
  //! source (github)
  // new SlashCommandBuilder()
  //   .setName('github')
  //   .setDescription('Provides the link to the bot source code on GitHub'),
  //! movers (gainz)
  // new SlashCommandBuilder()
  //   .setName('gainz')
  //   .setDescription('Shows the tickers and prices of the top gainers and losers of the day'),
  //! heatmap
  new SlashCommandBuilder()
    .setName('hmap')
    .setDescription('Shows a price change heatmap of the overall crypto market from Coin360.com'),
  //! info
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Shows a brief description of a coin from CoinGecko')
    .addStringOption(option =>
      option.setName('coin-ticker')
        .setDescription('The ticker or exact name of the coin to get the description of. Example: btc or bitcoin')
        .setRequired(true)),
  //! stocks
  // new SlashCommandBuilder()
  //   .setName('stocks')
  //   .setDescription('Shows the current price for a US stock market ticker')
  //   .addStringOption(option =>
  //     option.setName('stock-ticker')
  //       .setDescription('The ticker of the stock to get the price of. Example: msft')
  //       .setRequired(true)),
  //! market cap
  new SlashCommandBuilder()
    .setName('mc')
    .setDescription('Shows the current market of the entire crypto market or a specific coin')
    .addStringOption(option =>
      option.setName('coin-ticker')
        .setDescription('The optional ticker of the coin to get the market cap of. Example: btc')
        .setRequired(false)),
  //! currency conversion
  new SlashCommandBuilder()
    .setName('convert')
    .setDescription('Converts an amount from one currency to another. Example: 40 usd to btc')
    .addStringOption(option =>
      option.setName('amount')
        .setDescription('The amount to convert')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('from-currency')
        .setDescription('The currency to convert from. Example: usd')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('to-currency')
        .setDescription('The currency to convert to. Example: btc')
        .setRequired(true)),
  //! etherscan balance (do laterrrrrr)
  //! translation
  new SlashCommandBuilder()
    .setName('translate')
    .setDescription('Translates a text string from any language to English. Example: "Bonjour" in French to "Hello"')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('The text to translate')
        .setRequired(true)),
  //! tbpa
  new SlashCommandBuilder()
    .setName('tbpa')
    .setDescription('Shows your personal coin watch list prices (TsukiBot Personal Array, or "tbpa")'),
  //! tbpa add
  new SlashCommandBuilder()
    .setName('tbpa-add')
    .setDescription('Adds a coin to your personal coin watch list (TsukiBot Personal Array, or "tbpa")')
    .addStringOption(option =>
      option.setName('coin-ticker')
        .setDescription('The ticker of the coin to add to your tbpa. Example: btc')
        .setRequired(true)),
  //! tbpa remove
  new SlashCommandBuilder()
    .setName('tbpa-remove')
    .setDescription('Removes a coin from your personal coin watch list (TsukiBot Personal Array, or "tbpa")')
    .addStringOption(option =>
      option.setName('coin-ticker')
        .setDescription('The ticker of the coin to remove from your tbpa. Example: btc')
        .setRequired(true))
  //! tbpa clear
  // new SlashCommandBuilder()
  //   .setName('tbpa-clear')
  //   .setDescription('Clears your personal coin watch list (TsukiBot Personal Array, or "tbpa")'),
  //! popular coins
  // new SlashCommandBuilder()
  //   .setName('popular')
  //   .setDescription('Shows the prices of the top 10 most popular coins on CoinGecko')
]
  .map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

rest.put(Routes.applicationCommands(clientId), { body: commands })
  .then((data: any) => console.log(`Successfully registered ${data.length} application commands.`))
  .catch(console.error);
