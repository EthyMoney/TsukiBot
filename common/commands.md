TsukiBot  &nbsp; [![Discord Bots](https://discordbots.org/api/widget/status/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704) [![Discord Bots](https://discordbots.org/api/widget/servers/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704)
========

#### Welcome to the official commands list! Here you can find all available commands and details on how to use them. <br>

TsukiBot uses Discord **slash commands**. To run any command, type `/` in a channel, pick **TsukiBot** from the list, and Discord will show every command along with its inputs and descriptions. All commands and their options are listed below for reference.

Most coin inputs **autocomplete** as you type: start typing a ticker or name and the bot suggests matching coins ranked by market cap, which saves guessing at which of several coins sharing a symbol you meant.

To resolve permissions issues, kick the bot and add it back using [THIS INVITE LINK](https://discordapp.com/oauth2/authorize?client_id=506918730790600704&scope=bot&permissions=268823664) and keep the requested permissions checked. These permissions are **REQUIRED** for the bot to work correctly. If you need help, join the support server using the link at the bottom of this page.

<br>

## Prices

### `/cg <coins>`
Get CoinGecko prices for one or more coins. This is the fastest and most commonly used price command, and it supports thousands of coins listed on CoinGecko plus tokens tracked by CoinGecko Onchain. Provide tickers or one token contract address.
+ `coins` *(required)* — space-separated tickers, e.g. `btc eth glm`, or one contract address, e.g. `0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2`

### `/price <exchange> <coin> [vs]`
Get a real-time price for a coin directly from a specific exchange.
+ `exchange` *(required)* — choose from: **Coinbase, Binance, Kraken, Bitfinex, BitMEX, Poloniex**
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

Every chart comes with timeframe buttons underneath it (15M, 1H, 4H, 1D, 1W). Click one to re-render the same chart at that interval without retyping the command.

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

### `/brief`
Get a short written summary of what the market is doing right now — what moved, the overall tone, and where sentiment sits. Composed from the same data the other commands use, and refreshed every 20 minutes.

### `/trending`
Show the coins people are searching for most on CoinGecko right now, with live prices from the bot's cache.

### `/ath <coin>`
Show a coin's all-time high and low, how far below its ATH it currently sits, and the multiple it would take to get back there.
+ `coin` *(required)* — coin ticker, name, or rank.

### `/compare <coin1> <coin2>`
Compare two coins side by side, including the classic "what would X be worth at Y's market cap" calculation.
+ `coin1` *(required)* — first coin.
+ `coin2` *(required)* — second coin.

### `/hmap`
Show the Coin360 crypto market heatmap image.

### `/fg`
Show the current crypto Fear & Greed index.

### `/funding [coin]`
Show perpetual swap funding rates side by side across Binance, Bybit, OKX, and BitMEX, with the annualized rate and the time until the next funding payment.
+ `coin` *(optional)* — coin ticker, e.g. `eth`. Defaults to BTC.

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

## Price Alerts
Get a direct message when a coin reaches a price you pick. Alerts fire once and are then removed. Everything here is private to you.

### `/alert add <coin> <price>`
Set an alert. Whether it waits for the price to rise or fall is worked out automatically from where the price is now.
+ `coin` *(required)* — coin ticker or name.
+ `price` *(required)* — target price in USD.

### `/alert list`
Show your active alerts, each with its current price and ID.

### `/alert remove <id>`
Remove one of your alerts.
+ `id` *(required)* — the alert ID from `/alert list`.

> Keep your DMs open for this server, otherwise the bot falls back to pinging you in the channel where you created the alert.

<br>

## Portfolio
Track how much of each coin you hold and what it is worth. Only you can see these replies.

### `/portfolio show`
Show your holdings, each one's share of the book, and your total value with its 24h change.

### `/portfolio set <coin> <amount>`
Set how much of a coin you hold. Setting the amount to `0` removes it.
+ `coin` *(required)* — coin ticker or name.
+ `amount` *(required)* — how much you hold, e.g. `2.5`.

### `/portfolio clear`
Remove every holding.

<br>

## Scheduled Posts
Have the bot post market updates into a channel on a repeating schedule. Requires the **Manage Server** permission.

### `/schedule create <command> <channel> <every> [coins]`
Schedule a recurring post.
+ `command` *(required)* — market heatmap, Fear & Greed index, biggest movers, trending coins, top 10 coins, or prices for specific coins.
+ `channel` *(required)* — the channel to post in.
+ `every` *(required)* — every 30 minutes, hourly, every 4 hours, every 12 hours, or daily.
+ `coins` *(optional)* — only for "prices for specific coins", e.g. `btc eth sol`.

### `/schedule list`
Show this server's scheduled posts and when each last ran.

### `/schedule delete <id>`
Remove a scheduled post.
+ `id` *(required)* — the job ID from `/schedule list`.

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
Only the person who created a tag can delete it, or a moderator with the **Manage Messages** permission.
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
Show TsukiBot statistics: users and servers served, uptime, average commands per minute, and
the lifetime command count. The throughput figures come from the usage telemetry table, so
they persist across restarts rather than resetting on every deploy.

### `/help`
Get a link to this full commands guide.

### `/avatar [user]`
Show a user's avatar.
+ `user` *(optional)* — the user to show the avatar of. Defaults to you.

### `/usage`
**Bot owner only.** Usage telemetry and metrics for the bot itself. Every reply is ephemeral,
because these reports name individual users and the servers they use the bot in.

This command is **not registered globally**. It is deployed only to the server named by
`ownerGuild` in `common/keys.api` (or `OWNER_GUILD_ID` in the environment), so it does not appear
in any other server or in DMs. Inside that server it is further restricted, and the handler still
checks that the caller is the application owner (or is listed in `botAdmins`).

Note that `default_member_permissions` alone would not be enough: Discord treats it as a default
that any server admin can override, and it does not apply in DMs at all.

| Subcommand | What it answers |
| --- | --- |
| `/usage overview` | Volume, reach (daily/weekly/monthly actives), error rate, latency percentiles, and a chart of events, errors and distinct users per day. |
| `/usage commands` | Most used commands, with unique users, average time and error counts, as a bar chart with the error share in red. |
| `/usage users` | Most active users, their favorite command, and how many distinct days each was active. |
| `/usage servers` | Busiest servers. DM usage is reported separately in `overview`. |
| `/usage coins` | Most requested coins across every command that names one. |
| `/usage trending` | Coin momentum: the biggest risers and fallers against the previous window, and coins requested for the first time. |
| `/usage activity` | When the bot gets used: a real weekday x hour heatmap with hour and weekday marginals. Takes a `timezone`. |
| `/usage command` | Deep dive on one command: subcommand split, which options people actually supply, and the most common values. |
| `/usage errors` | What is failing, grouped by fault, plus the slowest commands as avg / p95 / max ranges. |
| `/usage growth` | New vs returning users per day, how many days users stay active, and who churned or came back. |
| `/usage funnel` | Do autocomplete searches turn into commands, per command, and what gets searched but never run. |
| `/usage export` | Download raw events as a CSV attachment. |
| `/usage credits` | CoinGecko API credit spend: a month-to-date burn-down against the quota with a projection, and the per-endpoint breakdown. |
| `/usage storage` | Table size, row count, and write-buffer health. |
| `/usage dashboard` | A sign-in link for the browser dashboard (see below). |
| `/usage digest` | Build the weekly digest now instead of waiting for Monday. |
| `/usage watchdog` | Run the watchdog checks now and show what would alert. |
| `/usage prune` | Permanently delete events older than a cutoff. Shows the row count and a red confirm button; `confirm: True` skips the button. |

Most subcommands take a `days` window (default 30) and a `limit`. The time-based ones take an IANA
`timezone` such as `America/Chicago`, since UTC hours do not answer "when are my users awake". The
defaults for all three can be set once in `keys.api` under `usage.defaults` so you stop typing them.

**Charts, buttons and menus.** Reports that have something to draw come with a real chart image
(rendered server-side, no Chromium needed) in place of the old unicode sparklines; the tables and
key-value panels stay because they carry detail a picture cannot. Every report reply carries a row
of window buttons (7d / 30d / 90d / 1y / refresh) and a menu to jump to any other report, all of
which edit the same message in place; `/usage commands` and `/usage errors` add a menu to open the
deep dive on a listed command. `overview`, `commands`, `coins`, `errors` and `credits` take
`compare: True` to show the change against the window before.

**The dashboard.** `/usage dashboard` mints a sign-in link for a browser dashboard the bot serves
on `127.0.0.1:8090` (configurable under `usage.dashboard` in `keys.api`): an overview with KPI
tiles and period comparison, full sortable leaderboards with click-through drill-downs, coin
momentum, the activity heatmap, errors with full fault strings, growth, a credits burn-down with a
projection band, the search funnel, and a filterable raw event view. The link works from the
machine the bot runs on (or through an SSH tunnel); in Docker, see the notes in
`docker-compose.yml`.

**The bot reports to you.** Every Monday at 09:00 (configurable) the application owner gets a DM
with the weekly digest: week-over-week deltas, top commands with rank movement, coin movers, credit
spend against the quota, and a this-week-vs-last-week chart. A watchdog runs every 30 minutes and
DMs only when something trips: an error-rate spike (with the faults behind it), a latency
regression, CoinGecko rate limiting, a credit projection over the quota, or telemetry batches
being dropped. Each condition fires at most once a day. Both are configured under `usage.digest`
and `usage.watchdog` in `keys.api`, and neither runs in dev mode.

**What gets recorded:** every slash command (with its options), every button press, every
autocomplete search, and the bot's own automated actions such as a fired price alert or a scheduled
post. Autocomplete fires once per keystroke, so the keystrokes of one search are collapsed into a
single row holding the finished query.

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
