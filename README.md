[![Codacy Badge](https://api.codacy.com/project/badge/Grade/9dc99ab109574f63ba09427dbde80886)](https://www.codacy.com/app/ofonsk/TsukiBot?utm_source=github.com&utm_medium=referral&utm_content=OFRBG/TsukiBot&utm_campaign=badger)

<p align="center">
  <img src="https://github.com/CehhNet/TsukiBot-Web/blob/master/src/img/TsukiBotBanner.png?raw=true"/>
  <a href="https://discordapp.com/oauth2/authorize?client_id=313452464399581194&scope=bot&permissions=268438608">Invite Link</a>
</p>


## Features
+ Get the volume for buy and sell orders.
+ Check prices from various exchanges in real time.
+ Fetch volume data on selected pairs.
+ And more.

# Usage

## Command Table

|  Command Name   |  Command Call    |  Options    | Shortcuts |
|------|------|------|------|
|   Kraken   | `k` or `krkn`     |  `XXX`, [`YYY`], [base price]    | `.tbk`, `.tbk eur`, `.tbk btc`|
|   GDAX   | `g` or `gdax`     |  `XXX`, [`YYY`], [base price]    | `.tbg`, `.tbg eur`, `.tbg btc`|
|   Poloniex   | `p` or `polo`     |  `XXX`, [`YYY`]    | `.tbp`|
| CryptoCompare | `c` or `crcp` | `XXX` [`YYY` ... `ZZZ`] | n.a. |
|   Bittrex   | `b` or `bit`     |  `XXX`, [`YYY`]    | `.tbb`|
|   Etherscan   | `e` or `escan`     |  hex address   |  n.a. |
| Personal Arrays  | `pa`| to set: [`XXX` ... `ZZZ`] | .tbpa |
|   Help   | `.tbhelp`     |  n.a.   |  n.a. |

[`YYY`] defaults to the main fiat pair. Usually `USD` or `USDT`.

If a [base price] is provided, the result will return the percent change from that price to the current one.

### _Available Tickers_
```
All from CryptoCompare
```

This may change on later versions.

### _Available Volume Records_
```
ETH, ETHX
```

`ETHX` is the custom ticker to fetch the volume record of `ETHUSDT`.

ETH donations to: `0x6A0D0eBf1e532840baf224E1bD6A1d4489D5D78d` are appreciated.


## Installation

### Use `npm` 

(Not fully tested.)

```
npm install tsukibot
```

### Depends:
+ python 2.7.x
+ node.js >= 6.0.0
+ python-shell
+ Naked
+ discord.js

1. Clone the repo.

```bash
git clone https://github.com/OFRBG/TsukiBot.git
cd TsukiBot
mkdir common
```

2. Install the dependencies.

```bash
npm install
```

3. Create a `virtualenv` for the project.

```bash
virtualenv TsukiBot
source TsukiBot/bin/activate
```

4. Install python dependencies.

```bash
pip install psycopg2 pandas Naked
```

5. Create a keys file.

```bash
nano keys.api
```

6. Inside keys.api add the following JSON substituting with your keys.

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
  "etherscan" : "api key",
  …
}
```


## Execution

To run the main bot:

```bash
node bot.js
```

### Note: use pm2 to keep the bot running! Execute from the main directory with `pm2 start bot.js`.

ETH donations to: `0x6A0D0eBf1e532840baf224E1bD6A1d4489D5D78d` are appreciated.
