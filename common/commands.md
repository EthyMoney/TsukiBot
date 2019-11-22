TsukiBot  &nbsp; [![Discord Bots](https://discordbots.org/api/widget/status/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704) [![Discord Bots](https://discordbots.org/api/widget/servers/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704) [![Discord Bots](https://discordbots.org/api/widget/lib/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704)
========

#### Welcome to the commands list! Here you can find all available commands and details on how to use them. <br>

### NOTE: If you didn't see an introduction message when the bot joined or the bot does not respond to you, it is missing permissions! 

Please make sure that TsukiBot has permission to send and read messages, manage roles, manage channels, and manage messages. These permissions are **REQUIRED** for the bot to work correctly!! If you need help, join the support server using the link at the bottom of this document.

TsukiBot deletes files that are not photos or videos by default. The bot will create a role named "File Perms" when it joins. Add this role to yourself 
and any users that you authorize to send files. If a user doesn't have this role and the bot has manage messages perms, their files will be deleted.
This a recommended protection measure for crypo users to prevent spread of malicious scripts, phishing malware, or accidentally shared key files.

#### All commands follow this general structure: `.tb <command> <parameters>`

<br>


## Exchange/Index Price Checks:
##### Usage: `.tb <exchange> <coin> <comparison>` 
`<exchange>` is the symbol of the exchange or index to check from. The available symbols are listed below. `<coin>` is the coin to check the price of and `<comparison>` is the currency to show the price in. Providing a comparison is **optional** and will default to BTC or USD (depending on exchange) if none is provided. While every exchange and index will support different comparisons, some common ones inlcude USD, BTC, EUR, and ETH. You can use the following shortcut symbols for the `<exchange>` parameter, otherwise you can write the full name if you prefer.

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

The following have this usage: `.tb <exchange> <coins>` Where `<coins>` can be either a single coin, or a space-separated list of multiple coins. Note, CMC can be called using a custom shortcut to access easier. See further down for details.
+ `c`:  &nbsp; &nbsp; &nbsp; CryptoCompare in USD
+ `cs`:  &nbsp; &nbsp; CryptoCompare in BTC
+ `cmc`:  &nbsp; CoinMarketCap in USD
+ `cmcs`:  CoinMarketCap in BTC

<br>

## Personal Array:
These commands are for managing and checking your own personal list of coins. <br>
The following 3 commands follow the exact usage shown, followed by a space and a space-separated list of mulptiple coins. An example of this would be `.tb pa eth btc xrp gnt`. This example would
create a new personal list for you that contains eth, btc, xrp, and gnt.

+ `.tb pa`: &nbsp; &nbsp; &nbsp; Create new or overwrite your existing personal array
+ `.tb pa+`: &nbsp; &nbsp; Add coins to your existing personal array
+ `.tb pa-`: &nbsp; &nbsp; Remove coins from your current personal array

These commands are used exactly as shown:
+ `.tbpa`: &nbsp; &nbsp; &nbsp; Call the array
+ `.tbpa+`: &nbsp; &nbsp; Call the array with BTC prices
+ `.tbpa*`: &nbsp; &nbsp; Call the array in expanded format with BTC prices
+ `.tbpae`: &nbsp; &nbsp; Call the array with ETH prices
+ `.tbpa%`: &nbsp; &nbsp; Call the array ordered by % change (least to greatest)

<br>

## Server Tags
What are server tags? Server tags are an easy way to store links and images within your server that can be referenced by a name that you assign to them. Now instead of needing to find that old link to a page or picture, you can simply pull it up by its tag name. Think of this like bookmarking or "tagging" links that you want to have easily accessable within the server. This will work for direct links to pictures, videos, and webpages. Here's how to use TsukiBot's tags system:

#####Warning: Tag names must have no spaces!

+ To make a new tag, use the createtag command: `.tb createtag <tag name here> <tag link(URL) here>`
+ To view a tag, use the tag command: `.tb tag <tag name here>`
+ To view all available tags in the server, use the taglist command: `.tb taglist`
+ To delete a tag, use the deletetag command: `.tb deletetag <tag name here>`

Here's an example of creating a tag so you get the idea: `.tb createtag google www.google.com` (google being the tag's name, and www.google.com being the tag URL)

<br>

## Miscellaneous Commands
##### Usage: `.tb <command> <parameter>` 
These are commands that didn't cleanly fit into the other catagories, so they are here. They all follow the usage listed above and their parameters vary. Each commands parameter is listed next to the command below.

+ `mc` : &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Total global market cap as well as BTC dominance for all of crypto. (no parameter)
+ `mc <coin>`:  &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Market cap, supply, and volume data for the provided coin
+ `e <add or tx>`:  &nbsp; &nbsp;  Etherscan details of ethereum address or transaction
+ `t <text>`:   &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Translate provided text to English using Google Translate
+ `subrole <name>` : &nbsp; Create a general role in the server with provided name
+ `.tbmyavatar` : &nbsp; &nbsp; &nbsp; &nbsp; Display and provide a link to your current avatar
+ `stock <stock ticker>`: &nbsp; NSADAQ/NYSE Averaged price for a stock
+ `info <coin>`:&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Description about a given coin (accepts ticker, name, or MC rank number)
+ `id` :  &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Get your unique Discord ID number DM'd to you
+ `funding` :  &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Get the BitMEX perpetual swap contracts funding rates
+ `fg` : &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Get the current Bitcoin fear and greed index value
+ `ls` : &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Get the current open long and short positions for BTC on Bitmex
+ `invite` : &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Get a pre-permissioned link to add TsukiBot to your own server!
+ `@TsukiBot` : &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; If you mention the bot it will reply to you and show the current response ping

This one provides the bot session statistics and is used exactly as shown:
+ `.tb stat` : &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Bot session stats, most most requested coin, messages per minute, and link to support server
+ `.tb cv <amount> <coin1> to <coin2>` Currency conversion tool for Binance coins. This will convert a given amound of a coin(coin1) to another coin(coin2). Use the coin tickers, not full names.

<br>

## Shortcuts
These are shortcuts for getting to things a little faster and easier! All shortcuts follow the exact usage shown below.

+ `.tb shortcut <prefix>` : Set a custom prefix to access CMC in the server. <br>
Alphanumeric and/or `! $ % . _ , < > = + * &`; max. 3 characters and can only be set by a server admin.<br>
When calling your shortcut for prices, you can add a `*` or `+` right behind the shortcut to call the coin(s) in satoshi prices. See the examples down below to see this in action.
+ `.tbpop` : Get prices of top 10 coins my market cap
+ `.tbp` : Poloniex ETH/USD price
+ `.tbb` : Bittrex ETH/USD price
+ `.tbm` : Bitmex ETH/USD price

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

## Need a visual example? Check out these screenshots:
<blockquote class="imgur-embed-pub" lang="en" data-id="a/sQaEkah"><a href="//imgur.com/a/sQaEkah">View Examples Here</a></blockquote>

<br><br>

---

This document is subject to change as development continues. <br>
Be sure to join the support server for help with using the bot or understanding these commands. You can get help, report problems, and make suggestions for future updates and features!<br>
Join the support server here: [discordapp.com/TsukiBot](https://discord.gg/VWNUbR5)

---

ETH donations to: `0x169381506870283cbABC52034E4ECc123f3FAD02` are greatly appreciated! The bot is 100% free to use and a lot work goes into making TsukiBot the best crypto bot on Discord. Consider a donation to say thanks and help support future development!

[![Discord Bots](https://discordbots.org/api/widget/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704)
