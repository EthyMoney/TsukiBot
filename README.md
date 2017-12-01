[![Codacy Badge](https://api.codacy.com/project/badge/Grade/9dc99ab109574f63ba09427dbde80886)](https://www.codacy.com/app/ofonsk/TsukiBot?utm_source=github.com&utm_medium=referral&utm_content=OFRBG/TsukiBot&utm_campaign=badger)
[![Discord Bots 1](https://discordbots.org/api/widget/status/313452464399581194.png)](https://discordbots.org/bot/313452464399581194)
[![Discord Bots 2](https://discordbots.org/api/widget/servers/313452464399581194.png)](https://discordbots.org/bot/313452464399581194)

<p align="center">
  <a href="https://discordbots.org/bot/313452464399581194">
    <img src="https://imgur.com/95F1V53.png"/>
  </a>
  <a href="https://discordapp.com/oauth2/authorize?client_id=313452464399581194&scope=bot&permissions=268438608">Invite Link</a>
</p>


## Features
+ Fetch detailed data for specific pairs on major exhanges.
+ Check price averages in real time.
+ Fetch volume data on selected pairs.
+ Automanage private channels for crypto subgroups.
+ Automanage paid subscriptions and expiring roles.

# Usage

## Command Table for Price Checking

|  Command Name   |  Command Call    |  Options    | Shortcuts |
|------|------|------|------|
|   Kraken   | `k` or `krkn`     |  `XXX`, [`YYY`], [base price]    | `.tbk`, `.tbk eur`, `.tbk btc`|
|   GDAX   | `g` or `gdax`     |  `XXX`, [`YYY`], [base price]    | `.tbg`, `.tbg eur`, `.tbg btc`|
|   Poloniex   | `p` or `polo`     |  `XXX`, [`YYY`]    | `.tbp`|
| CryptoCompare | `c` or `crcp` | `XXX` [`YYY` ... `ZZZ`] | n.a. |
|   Bittrex   | `b` or `bit`     |  `XXX`, [`YYY`]    | `.tbb`|
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

This project is open-source, and if you think you can improve it, make a pull request.

---

ETH donations to: `0x6A0D0eBf1e532840baf224E1bD6A1d4489D5D78d` are appreciated.

Or just upvote here:

[![Discord Bots](https://discordbots.org/api/widget/313452464399581194.png)](https://discordbots.org/bot/313452464399581194)
