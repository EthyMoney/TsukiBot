TsukiBot  &nbsp; [![Discord Bots](https://discordbots.org/api/widget/status/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704) [![Discord Bots](https://discordbots.org/api/widget/servers/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704) [![Discord Bots](https://discordbots.org/api/widget/lib/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704)
========

#### Welcome to the commands list! Here you can find all available commands and details on how to use them. <br>

### NOTE: If you didn't see an introduction message when the bot joined or the bot does not respond to you, it is missing permissions! 
Please make sure that TsukiBot has permission to send and read messages, manage roles, manage channels, and manage messages. These permissions are **REQUIRED** for the bot to work correctly!! If you need help, join the support server using the link at the bottom of this document.

#### All commands follow this general structure: `.tb <command> <parameters>`

<br>


## Exchange/Index Price Checks:
##### Usage: `.tb <exchange> <coin> <comparison>` 
`<exchange>` is the symbol of the exchange or index to check from. The available symbols are listed below. `<coin>` is the coin to check the price of and `<comparison>` is the currency to show the price in. Providing a comparison is **optional** and will default to USD if none is provided.

+ `g`:   &nbsp; &nbsp; &nbsp; Coinbase
+ `k`:   &nbsp; &nbsp; &nbsp; Kraken
+ `p`:   &nbsp; &nbsp; &nbsp; Poloniex
+ `n`:   &nbsp; &nbsp; &nbsp;  Binance
+ `cg`:  &nbsp; &nbsp;  CoinGecko
+ `f`:   &nbsp; &nbsp; &nbsp;  Bitfinex
+ `m`:   &nbsp; &nbsp; &nbsp;  BitMEX
+ `b`:   &nbsp; &nbsp; &nbsp; Bittrex
+ `st`:  &nbsp; &nbsp; STEX

The following have this usage: `.tb <exchange> <coins>` Where `<coins>` can be either a single coin, or a space-separated list of multiple coins. Note, CMC can be called using a custom shortcut to access easier. See further down for details.
+ `c`:  &nbsp; &nbsp; &nbsp; CryptoCompare in USD
+ `cs`:  &nbsp; &nbsp; CryptoCompare in BTC
+ `cmc`:  &nbsp; CoinMarketCap in USD
+ `cmcs`:  CoinMarketCap in BTC

<br>

## Personal Array:
These commands are for managing and checking your own personal list of coins. <br>
The following 3 commands follow the exact usage shown, followed by a space and a space-separated list of mulptiple coins. An example of this would be `.tb pa eth btc xrp gnt`

+ `.tb pa`: &nbsp; &nbsp; &nbsp; Create or overwrite your personal array
+ `.tb pa+`: &nbsp; &nbsp; Add coins to your current pa
+ `.tb pa-`: &nbsp; &nbsp; Remove coins from your current pa

These commands are used exactly as shown:
+ `.tbpa`: &nbsp; &nbsp; &nbsp; Call the array
+ `.tbpa+`: &nbsp; &nbsp; Call the array with BTC prices
+ `.tbpa*`: &nbsp; &nbsp; Call the array in expanded format with BTC prices
+ `.tbpa%`: &nbsp; &nbsp; Call the array ordered by % change (least to greatest)

<br>

## Server Management and Coin Subs
These commands allow a server owner to create private crypto channels(subs) that only users with the matching role can see. Users can check available subs and can join subs that they wish to be in. TsukiBot fully automates creation of roles and channels for these subs while also handling the assignment of users to them.
All of the following commands are used exactly as shown aside from replacing `<coin>` with a valid coin ticker/symbol and replacing `<name>` with the name you would like to give the role.

+ `.tb join <coin>` : &nbsp; Get assigned the sub role and gain access to the corresponding room
+ `.tbleave` : &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Leave all rooms
+ `.tblist` : &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Get the available rooms for the server

This command is for the server owner **only**. There will not be any subs to join until the following command is used to make them:
+ `.tb makeroom <coin>`: Create a private room and a sub role for a whitelisted coin

<br>

## Miscellaneous Commands
##### Usage: `.tb <command> <parameter>` 
These are commands that didn't cleanly fit into the other catagories, so they are here. They all follow the usage listed above and their parameters vary. Each commands parameter is listed next to the command below.

+ `mc` : &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Total global market cap as well as BTC dominance for all of crypto. (no parameter)
+ `mc <coin>`:  &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Market cap, supply, and volume data for the provided coin
+ `e <add or tx>`:  &nbsp; &nbsp;  Etherscan details of ethereum address or transaction
+ `t <text>`:   &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Translate provided text to English using Google Translate
+ `subrole <name>` : &nbsp; Create a general role in the server with provided name

This one provides the bot session statistics and is used exactly as shown:
+ `.tbstat` : &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; Bot session stats, most most requested coin, messages per minute, and link to support server

<br>

## Shortcuts
These are shortcuts for getting to things a little faster and easier! All shortcuts follow the exact usage shown below.

+ `.tb shortcut <prefix>` : Set a custom prefix to access CMC in the server. <br>
Alphanumeric and/or `! $ % . _ , < > = + * &`; max. 3 characters and can only be set by a server admin.<br>
When calling your shortcut for prices, you can add a `*` or `+` right behind the shortcut set to call the coin(s) in satoshi prices. See the examples down below to see this in action.
+ `.tbpop` : Get prices of some popular coins
+ `.tbp` : Poloniex ETH/USD price
+ `.tbb` : Bittrex ETH/USD price

The following can be used like the ones above to get ETH/USD prices **OR** they can have a comparison currency passed to them them. `<comparison>` is optional and will default to USD if none is provided. USD, EUR, and BTC is supported for the comparison.
`.tbg <comparison>` : Coinbase ETH price in terms of the proivded comparison currency. 
`.tbk <comparison>` : Kraken ETH price in terms of the provided comparison currency.

<br>

## Some helpful examples of usage:
+ `.tb k dash usd`    ⇒ Kraken price for DASHUSD
+ `.tb c btc bch zec` ⇒ CryptoCompare price for BTCUSD, BCHUSD, ZECUSD
+ `.tb p doge xmr`    ⇒ Poloniex price for DOGEXMR
+ `.tb cg eth eur`    ⇒ CoinGecko price for ETHEUR
+ `.tb m btc`         ⇒ BitMEX price for BTCUSD
+ `mc`                ⇒ Total crypto market capitalization and BTC dominance
+ `mc eth`            ⇒ Market cap and price history for ETH
+ `.tb t <text>`      ⇒ Translate text to English (Example: `.tb t hola`)
+ `.tbg`              ⇒ Shortcut Coinbase price for ETHUSD
+ `.tbg eur`          ⇒ Shortcut Coinbase price for ETHEUR
+ `.tbk`              ⇒ Shortcut Kraken price for ETHUSD

<br>

## Need a visual example? Check out these screenshots:
<blockquote class="imgur-embed-pub" lang="en" data-id="a/sQaEkah"><a href="//imgur.com/a/sQaEkah">View Examples Here</a></blockquote>

<br><br>

---

This document is subject to change as development continues. <br>
Be sure to join the support server for help with using the bot or understanding these commands. You can get help, report problems, and make suggestions for future updates and features!<br>
Join the support server here: [discordapp.com/TsukiBot](https://discord.gg/VWNUbR5)

---

ETH donations to: `0x169381506870283cbABC52034E4ECc123f3FAD02` are greatly appreciated! A lot work goes into making TsukiBot the best crypto bot on Discord. Consider a donation to say thanks and help support future development!

[![Discord Bots](https://discordbots.org/api/widget/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704)
