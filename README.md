# TsukiBot 🌑 
**Discord bot with cryptocurrency functionalities**

Crypto trading is an unfriendly task. May this aid you in your journey to Woyakland.

## Features
+ Get the volume for buy and sell orders.
+ Check prices from various exchanges in real time.
+ Fetch volume data on selected pairs.

# Usage

## Command Table

|  Command Name   |  Command Call    |  Options    | Shortcuts |
|------|------|------|------|
|   Kraken   | `k` or `krkn`     |  `XXX`, [`YYY`], [base price]    | `.tbk`, `.tbk eur`, `.tbk btc`|
|   GDAX   | `g` or `gdax`     |  `XXX`, [`YYY`], [base price]    | `.tbg`, `.tbg eur`, `.tbg btc`|
|   Poloniex   | `p` or `polo`     |  `XXX`, [`YYY`]    | `.tbp`|
|   Bittrex   | `b` or `bit`     |  `XXX`, [`YYY`]    | `.tbb`|
|   Etherscan   | `e` or `escan`     |  hex address   |  n.a. |
|   Help   | `.help` or `.th`     |  n.a.   |  n.a. |

[`YYY`] defaults to the main fiat pair. Usually `USD` or `USDT`.

If a [base price] is provided, the result will return the percent change from that price to the current one.

### _Available Tickers_
```
ETH, ETHX, ETC, EOS, GNT, XRP, LTC, BTC, XBT, MLN, ICN, STEEM, USDT
```

This may change on later versions.

### _Available Volume Records_
```
ETH, GNT, LTC, ETHX
```

`ETHX` is the custom ticker to fetch the volume record of `ETHUSDT`.

ETH tips to: `0x6A0D0eBf1e532840baf224E1bD6A1d4489D5D78d`


## Installation

### Depends:
+ python 2.7.x
+ node.js >= 6.0.0
+ python-shell
+ Naked
+ discord.js

*Clone the repo.*

```bash
git clone https://github.com/OFRBG/TsukiBot.git
cd TsukiBot
mkdir common
```

*Install the dependencies.*

```bash
npm install discord.js --save
npm install python-shell
```

*Create a `virtualenv` for the project.*

```bash
virtualenv TsukiBot
source TsukiBot/bin/activate
```

*Install python dependencies.*

```bash
pip install pandas Naked
```

*Create a keys file.*

```bash
nano keys.api
```

Inside keys.api add the following JSON substituting with your keys.

```json
{
  "polo": [
    "poloniex short key",
    "poloniex long key"
  ],
  "discord": "discord token (long with mixed chars)",
  "bittrex" : [
    "bittrex short key",
    "bittrex long key"
  ],
  "coinbase" : [
    "coinbase short key",
    "coinbase long key"
  ],
  "etherscan" : "api key"
}
```

## Execution

To run the main bot:

```bash
node bot.js
```
