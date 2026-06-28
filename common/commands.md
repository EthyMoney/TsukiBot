TsukiBot  &nbsp; [![Discord Bots](https://discordbots.org/api/widget/status/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704) [![Discord Bots](https://discordbots.org/api/widget/servers/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704)
========

#### Welcome to the official commands list! Here you can find all available commands and details on how to use them. <br>

TsukiBot uses Discord **slash commands**. To run any command, type `/` in a channel, pick **TsukiBot** from the list, and Discord will show every command along with its inputs and descriptions. All commands and their options are listed below for reference.

To resolve permissions issues, kick the bot and add it back using [THIS INVITE LINK](https://discordapp.com/oauth2/authorize?client_id=506918730790600704&scope=bot&permissions=268823664) and keep the requested permissions checked. These permissions are **REQUIRED** for the bot to work correctly. If you need help, join the support server using the link at the bottom of this page.

<br>

## Prices

### `/cg <coins>`
Get CoinGecko prices for one or more coins. This is the fastest and most commonly used price command, and it supports thousands of coins listed on CoinGecko. Provide a single ticker or a space-separated list.
+ `coins` *(required)* — space-separated tickers, e.g. `btc eth glm`

### `/price <exchange> <coin> [vs]`
Get a real-time price for a coin directly from a specific exchange.
+ `exchange` *(required)* — choose from: **Coinbase, Binance, Kraken, Bitfinex, BitMEX, Poloniex, Graviex**
+ `coin` *(required)* — base coin ticker, e.g. `eth`
+ `vs` *(optional)* — quote currency, e.g. `usd`. Defaults to USD/BTC depending on the exchange if omitted.

### `/cmc <coins>`
Get CoinMarketCap prices (in USD) for one or more coins.
+ `coins` *(required)* — space-separated tickers, e.g. `btc eth`

### `/cc <coins>`
Get CryptoCompare prices for one or more coins.
+ `coins` *(required)* — space-separated tickers, e.g. `btc eth`

### `/stocks <symbol>`
Get the current market price for a stock ticker (NASDAQ/NYSE).
+ `symbol` *(required)* — stock ticker symbol, e.g. `AAPL`

### `/pop`
Show prices of the top 10 coins by market cap.

### `/convert <amount> <from> <to>`
Convert an amount of one coin/currency into another at CoinGecko rates. Use tickers, not full names.
+ `amount` *(required)* — amount to convert
+ `from` *(required)* — coin/currency to convert from
+ `to` *(required)* — coin/currency to convert to

Example: `/convert amount:100 from:eth to:usd`

<br>

## TradingView Charts

### `/c <query>`
Generate a TradingView chart and post it as an image in the channel. The `query` is very flexible — provide a pair, then optionally an exchange, an interval, and one or more indicators, all in the same field.
+ `query` *(required)* — pair plus optional exchange / interval / indicators, e.g. `ethusd binance 4h rsi macd`

Supported options inside the query:
+ **Pairs:** anything TradingView supports. For cryptos a full pair works best, e.g. `btcusd` instead of just `btc`.
+ **Intervals:** 1m, 1, 3m, 3, 5m, 5, 15m, 15, 30m, 30, 1h, 60, 2h, 120, 3h, 180, 4h, 240, 1d, d, day, daily, 1w, w, week, weekly, 1mo, m, mo, month, monthly
+ **Indicators:** bb, bbr, bbw, crsi, ichi, ichimoku, macd, ma, ema, dema, tema, moonphase, pphl, pivotshl, rsi, stoch, stochrsi, williamr
+ **Exchanges:** binance, bitstamp, bitbay, bitfinex, bittrex, bybit, coinbase, gemini, hitbtc, kraken, kucoin, okcoin, okex, poloniex
+ **Other options:** `wide` (widens the image to show more history), plus a couple of fun easter eggs — try `bera`, `blul`, or `crab`.

<br>

## Market Data

### `/mc [coin]`
Get total crypto market cap and BTC dominance, or market cap details for a specific coin.
+ `coin` *(optional)* — ticker, name, or market cap rank. Omit it for the global total.

### `/info <coin>`
Get a coin's description and purpose.
+ `coin` *(required)* — ticker, name, or market cap rank.

### `/movers`
Show the biggest 24h gainers and losers (filtered to coins with a valid market cap and 24h volume over 10k USD).

### `/hmap`
Show the Coin360 crypto market heatmap image.

### `/fg`
Show the current crypto Fear & Greed index.

### `/funding`
Show BitMEX XBTUSD perpetual swap funding data.

### `/ls`
Show Binance BTC long/short position ratios.

### `/gas`
Show current Ethereum gas prices (slow, average, and fast).

<br>

## Ethereum

### `/eth <query>`
Look up an Ethereum address balance, a transaction, or an ENS name. The bot automatically detects which one you provided.
+ `query` *(required)* — an ETH address (`0x...`, 42 chars), a transaction hash (`0x...`, 66 chars), or an ENS name (`name.eth`).

<br>

## Personal Price Array
Your own personal watchlist of coins (sourced from CoinGecko) that you can call up at any time.

### `/tbpa`
Show your personal coin price array.

### `/tbpa-add <coins>`
Add one or more coins to your personal price array.
+ `coins` *(required)* — space-separated tickers to add.

### `/tbpa-remove <coins>`
Remove one or more coins from your personal price array.
+ `coins` *(required)* — space-separated tickers to remove.

<br>

## Server Tags
Server tags let you store links and images under a name you choose, so you can pull them back up later. Works for direct links to pictures, videos, and webpages.

#### Note: tag names must not contain spaces.

### `/tag create <name> <link>`
Create a new tag.
+ `name` *(required)* — tag name
+ `link` *(required)* — tag image/link URL

### `/tag view <name>`
View a tag.
+ `name` *(required)* — tag name

### `/tag list`
List all tags in this server.

### `/tag delete <name>`
Delete a tag.
+ `name` *(required)* — tag name

Example: `/tag create name:google link:www.google.com`

<br>

## Translation

### `/translate <text>`
Translate the provided text to English using Google Translate.
+ `text` *(required)* — text to translate

<br>

## Utility & Info

### `/stats`
Show TsukiBot session statistics, including the most requested coin and messages per minute.

### `/help`
Get a link to this full commands guide.

### `/avatar [user]`
Show a user's avatar.
+ `user` *(optional)* — the user to show the avatar of. Defaults to you.

### `/id`
Get your Discord user ID.

### `/invite`
Get a pre-permissioned link to add TsukiBot to your own server.

### `/github`
Get a direct link to TsukiBot's source code on GitHub.

### `/donate`
Show donation addresses to support TsukiBot.

<br>

## More of a visual learner? Check out these demonstration screenshots:
<blockquote class="imgur-embed-pub" lang="en" data-id="a/EhZ8sQw"  ><a href="//imgur.com/a/EhZ8sQw">TsukiBot Demo</a></blockquote>
<br><br>

---

This document is subject to change as development continues. <br>
Be sure to join the support server for help with using the bot or understanding these commands. You can get help, report problems, and make suggestions for future updates and features!<br>
Join the support server here: [discordapp.com/TsukiBot](https://discord.gg/VWNUbR5)<br>
We also have a live [Trello board](https://trello.com/b/EVy3p2IU/tsukibot-development) where you can see what we're working on!

---

ETH donations to: `0x169381506870283cbABC52034E4ECc123f3FAD02` are greatly appreciated! The bot is 100% free to use and a lot work goes into making TsukiBot the best crypto bot on Discord. We don't have any paid features, ads, or commissions whatsoever. A donation is an excellent way to say thanks and to help support future development!

[![Discord Bots](https://discordbots.org/api/widget/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704)
