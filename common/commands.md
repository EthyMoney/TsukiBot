TsukiBot  &nbsp; [![Discord Bots](https://discordbots.org/api/widget/status/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704) [![Discord Bots](https://discordbots.org/api/widget/servers/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704)
========

#### Welcome to the official commands list! Here you can find all available commands and details on how to use them. <br>

(09/01/2022) IMPORTANT UPDATE REGARDING COMMAND INPUTS: 
========
As of September 1st, Discord is now requiring large bots to use slash commands reather than text prefix commands. What this means for TsukiBot is that you will now call the commands by starting with a / rather than the text prefixes like .tb or t

TsukiBot currently supports slash commands at a fairly basic level, and not eveything will be perfect yet. This includes the documentation here, use it as reference, but keep in mind that these have been moved to being slash commands and not all of them are available as a slash command just yet.

I'm working very hard to get things polished up and get everything working well and fully supported on slash commands, I just need to ask that you bear with me for this week as this transition is occurring. Be sure to [join the TsukiBot discord](https://discord.gg/VWNUbR5) for updates as I get this transition finished up.

To use slash commands, simply start typing a "/" in discord and select TsukiBot from the list of bots. You will see all of the currently available commands and how to use them.

If you are an experienced TsukiBot user, here's some quick translations that will help you get going: 
Coin Gecko price shortcut "t" is now /cg
Charts ".tbc" is now /c
Gas ".tb gas" is now /gas
All other ".tb" commands are now just the command name with a / in front. 
Some commands have been renamed, you'll need to look over the list to see what you are looking for. I appologize for this, it will improve in the coming week!


To resolve permissions issues, kick the bot and add it back using [THIS INVITE LINK](https://discordapp.com/oauth2/authorize?client_id=506918730790600704&scope=bot&permissions=268823664) and keep the requested permissions checked! These permissions are **REQUIRED** for the bot to work correctly!! If you need help, join the support server using the link at the bottom of this page.

TsukiBot deletes files that are not photos or videos by default. The bot will create a role named "File Perms" when it joins. Add this role to yourself 
and any users that you authorize to send files. If a user doesn't have this role and the bot has manage messages perms allowed, their files will be deleted.
This a recommended protection measure for crypto users to prevent the spread of malicious scripts, phishing malware, or accidentally shared private key files.
<br>
<br>
<br>
<br>
Below is the old version of this commands doc, use it as reference until it gets rewritten for the newer slash commands very soon:
<br>
<br><br>



#### All commands follow this general structure unless noted otherwise: `.tb <command> <parameters>`


## Simple CoinGecko Price Checks:
##### Usage: `t <coins>` (either a single coin ticker, or a space-separated list of multiple tickers)
This is the most commonly used command in the bot. It's a super simple and fast way to check prices of coins using CoinGecko. The prices available for this command are updated every 2 minutes and supports all (over 6000 and counting) coins listed on CoinGecko.<br><br>The default prefix to call for these prices is just `t`, but you can change this prefix to whatever you want it to be for your server using the shortcut command found down below on this page. You can call the price for just one coin, or multiple coins by listing them out with spaces between them. You must provide the coin TICKER symbol when using this command. For example, Ethereum has the ticker symbol ETH, and Bitcoin has the ticker symbol BTC, and so on..<br><br>You can also call this command and have it give prices in terms of ETH and BTC by adding a symbol behind the prefix. You can do this by adding a `*` or `+` right behind the prefix to call the coin(s) in BTC(satoshi) prices, or a `e` for ETH prices. See the examples down below on this page to see this in action.

Examples:
+ `t eth` : Price of Ethereum
+ `t eth btc glm` : Price of Ethereum, Bitcoin, and Golem
+ `t+ eth` : Price of Ethereum in terms of BTC price
+ `te btc` : price of Bitcoin in terms of ETH price<br>
Simple enough right?

<br>


## TradingView Charts:
##### Usage: `.tbc <tradingview pair/ticker> <timeframe> <indicators> <exchange> <other options>`
TsukiBot supports grabbing charts from TradingView and sending them as an image right in the channel where you called for them. This command is very versatile as its input is basically only limited by whatever TradingView can take. You can put stocks, cryptocurrencies, and whatever else is listed on TradingView these days.<br><br>Providing a timeframe, indicator, exchange, or other options are all completely optional and you can call this command with just a market/tradingview pair and it will default to the other options to TradingView's chart defaults (such as one hour timeframe, no idicators, and so on).<br><br>The following are the options currently tested to be supported by this command (with more on the way):

+ Pairs: Whatever pairs and tickers that TradingView supports. **NOTE:** with cryptos it works best to use a full pairing rather than just the single ticker. Like "btcusd" instead of just  "btc"
+ Timeframes: 1m, 1, 3m, 3, 5m, 5, 15m, 15, 30m, 30, 1h, 60, 2h, 120, 3h, 180, 4h, 240, 1d, d, day, daily, 1w, w, week, weekly, 1mo, m, mo, month, monthly
+ Indicators: bb, bbr, bbw, crsi, ichi, ichimoku, macd, ma, ema, dema, tema, moonphase, pphl, pivotshl, rsi, stoch, stochrsi, williamr
+ Exchanges: binance, bitstamp, bitbay, bitfinex, bittrex, bybit, coinbase, ftx, gemini, hitbtc, kraken, kucoin, okcoin, okex, poloniex
+ Other Options: wide (widens the image to show more history), bera, blul (I won't tell you what these do, go ahead and try them yourself)

Need a visual example? Check out the visual demo down below to see the charts command in action.


<br>

## Specific Real-Time Exchange/Index Price Checks:
##### Usage: `.tb <exchange> <coin> <comparison>` 
`<exchange>` is the symbol of the exchange or index to check from. The available symbols are listed below. `<coin>` is the coin ticker to check the price of and `<comparison>` is the currency ticker to show the price in. Providing a comparison is **optional** and will default to BTC or USD (depending on the exchange) if none is provided. While every exchange and index will support different comparisons, some common ones inlcude USD, BTC, EUR, and ETH. You can use the following shortcut symbols for the `<exchange>` parameter, otherwise you can write the full name of the exchange if you prefer or forget the shortcut.

+ `cb`:   &nbsp; &nbsp; Coinbase
+ `k`:   &nbsp; &nbsp; &nbsp; Kraken
+ `p`:   &nbsp; &nbsp; &nbsp; Poloniex
+ `b`:   &nbsp; &nbsp; &nbsp;  Binance
+ `cg`:  &nbsp; &nbsp;  CoinGecko
+ `f`:   &nbsp; &nbsp; &nbsp;  Bitfinex
+ `m`:   &nbsp; &nbsp; &nbsp;  BitMEX
+ `x`:   &nbsp; &nbsp; &nbsp; Bittrex
+ `st`:  &nbsp; &nbsp; STEX
+ `gr`:  &nbsp; &nbsp; Graviex

The following have this usage: `.tb <exchange> <coins>` Where `<coins>` can be either a single coin, or a space-separated list of multiple coins.
+ `c`:  &nbsp; &nbsp; &nbsp; CryptoCompare in USD
+ `cs`:  &nbsp; &nbsp; CryptoCompare in BTC
+ `cmc`:  &nbsp; CoinMarketCap in USD
+ `cmcs`:  CoinMarketCap in BTC

<br>

## Personal Array (Personal Coin Watchlists):
These commands are for managing and checking your very own personal list of coins which you can call the prices of in various ways. All data for this command is sourced from CoinGecko. <br>
The following 3 commands follow the exact usage shown, followed by a space and then a space-separated list of mulptiple coin tickers. An example of this would be `.tb pa eth btc xrp glm`. This example would create a new personal list for you that contains eth, btc, xrp, and glm.

+ `.tb pa`: &nbsp; &nbsp; &nbsp; Create a new personal array, or overwrite your existing one
+ `.tb pa+`: &nbsp; &nbsp; Add coin(s) to your existing personal array
+ `.tb pa-`: &nbsp; &nbsp; Remove coin(s) from your current personal array

These commands are used exactly as shown:
+ `.tbpa`: &nbsp; &nbsp; &nbsp; Call your array
+ `.tbpa+`: &nbsp; &nbsp; Call your array with BTC prices
+ `.tbpa*`: &nbsp; &nbsp; Call your array in expanded format with BTC prices
+ `.tbpae`: &nbsp; &nbsp; Call your array with ETH prices
+ `.tbpa%`: &nbsp; &nbsp; Call your array ordered by % change (greatest to least)

<br>

## Server Tags
What are server tags? Server tags are an easy way to store links and images within your server that can be referenced by a name that you assign to them. Now instead of needing to find that old link to a page or picture, you can simply pull it up by its tag name. Think of this like bookmarking or "tagging" links that you want to have easily accessable within the server. This will work for direct links to pictures, videos, and webpages. Here's how to use TsukiBot's tag system:

#### Warning: Tag names must have no spaces!

+ To make a new tag, use the createtag command: `.tb createtag <tag name here> <tag link(URL) here>`
+ To view a tag, use the tag command: `.tb tag <tag name here>`
+ To view all available tags in the server, use the taglist command: `.tb taglist`
+ To delete a tag, use the deletetag command: `.tb deletetag <tag name here>`

Here's an example of creating a tag so you get the idea: `.tb createtag google www.google.com` (google being the tag's name, and www.google.com being the tag URL)

<br>

## Miscellaneous Commands
##### Usage: `.tb <command> <parameter>` 
These are commands that didn't cleanly fit into the other catagories, so they are here. They all follow the usage listed above and their parameters vary. Each commands parameter is listed next to the command below (if they have a parameter).

+ `mc` : Total global market cap as well as BTC dominance for all of crypto. (no parameter, and does not require the ".tb" prefix)
+ `mc <coin>`: Market cap, supply, and volume data for the provided coin. (accepts ticker, name, or MC rank number and does not require the ".tb" prefix)
+ `e <addy or tx>`: Etherscan ETH balance details of ethereum address or transaction (accepts both 0x addresses, and ENS (name.eth) addresses!
+ `t <text>`: Translate provided text to English using Google Translate
+ `myavatar` : Display and provide a link to your current avatar
+ `stock <stock ticker>`: NSADAQ/NYSE Averaged price for a stock
+ `info <coin>`: Description about a given coin (accepts ticker, name, or MC rank number)
+ `id` :  Get your unique Discord ID number DM'd to you
+ `funding` : Get the BitMEX perpetual swap contracts funding rates
+ `fg` : Get the current Bitcoin fear and greed index value
+ `ls` : Get the current open long and short positions for BTC on Bitmex
+ `invite` : Get a pre-permissioned link to add TsukiBot to your own server!
+ `@TsukiBot` : If you mention the bot it will reply to you and show the current response ping (doesn't require a command)
+ `gas` : Shows the current Ethereum gas prices required to send a transaction (shows the current slow price, standard price, and fast price)
+ `movers` : Shows the top 5 biggest gainers and losers coins for the day according to their % change. (filters the result to only show coins with a valid market cap and 24hr volume that's over 10k USD)
+ `.tb cv <amount> <coin1> to <coin2>` Currency conversion tool for coins. This will convert a given amount of a coin(coin1) to another coin(coin2). Use the coin tickers for this command, not full names or IDs. You can use either "cv" or "convert" for the command (up to you). Example use:" `.tb cv 100 eth to usd`

This one provides the bot session statistics and is used exactly as shown:
+ `.tb stat` : Bot session stats, most most requested coin, messages per minute, and link to support server

<br>

## Shortcuts
These are shortcuts for getting to things a little faster and easier! All shortcuts follow the exact usage shown below.

+ `.tb shortcut <prefix>` : Set a new custom prefix to quickly access the CoinGecko price command in the server. <br>
Allowed shortcuts can only contain alphanumeric characters and/or `! $ % . _ , < > = + * &` with a max of 3 characters. This can only be set by a server admin.<br>
When calling your shortcut for prices, you can add a `*` or `+` right behind the shortcut to call the coin(s) in satoshi prices, or a `e` for ETH prices. See the examples down below to see this in action.
+ `.tbpop` : Get prices of top 10 coins my market cap
+ `.tbp` : Poloniex ETH/USD price
+ `.tbb` : Bittrex ETH/USD price
+ `.tbm` : Bitmex ETH/USD price
+ `.tbn` : Binance ETH/USD price
+ `.tbf` : Bitfinex ETH/USD price
+ `.tbt <text>` : Translation command shortcut
+ `.tbhmap`: Coin % changes as a heatmap image from Coin360
+ `mc`   : Global market cap command shortcut
+ `mc <coin>` : Specific coin market cap command shortcut

The following can be used like the ones above to get ETH/USD prices **OR** they can have a comparison currency passed to them them. `<comparison>` is optional and will default to USD if none is provided. USD, EUR, and BTC is supported for the comparison.
+ `.tbg <comparison>` : Coinbase ETH price in terms of the proivded comparison currency. 
+ `.tbk <comparison>` : Kraken ETH price in terms of the provided comparison currency.

<br>

## Some helpful examples of usage:
+ `.tb k dash usd`   &nbsp;&nbsp;&nbsp;&nbsp; ⇒ Kraken price for DASHUSD
+ `.tb c btc bch zec` ⇒ CryptoCompare price for BTCUSD, BCHUSD, ZECUSD
+ `.tb p doge xmr`   &nbsp;&nbsp;&nbsp;&nbsp; ⇒ Poloniex price for DOGEXMR
+ `.tb cg eth eur`  &nbsp;&nbsp;&nbsp;&nbsp;  ⇒ CoinGecko price for ETHEUR
+ `.tb m btc`    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;     ⇒ BitMEX price for BTCUSD
+ `mc`        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        ⇒ Total crypto market capitalization and BTC dominance
+ `mc eth`    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        ⇒ Market cap and price history for ETH
+ `.tb t <text>`  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;    ⇒ Translate text to English (Example: `.tb t hola`)
+ `.tbg`        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      ⇒ Shortcut Coinbase price for ETHUSD
+ `.tbg eur`    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      ⇒ Shortcut Coinbase price for ETHEUR
+ `.tbk`      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        ⇒ Shortcut Kraken price for ETHUSD
+ `.tb stock amd`  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;   ⇒ Stock price for $AMD
+ `.tb info eth`  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;    ⇒ Information about Ethereum (ETH)
+ `.tb cv 12 eth to btc` ⇒ See how much btc 12 eth equals (currency conversion)

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
