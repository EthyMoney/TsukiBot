# TsukiBot
*Discord bot with cryptocurrency functionalities*

#OUTDATED. SORRY.

## Features
+ Get the volume for buy and sell orders.
+ Get large market trades from the last 5 minutes.
+ Register a tracker to notify of an extra large trade.

## Usage

`!'tb` is the bot prefix.

`vol XXX` gets the volume of trade of the pair BTCXXX.

`wh XXX` gets the largest trades in the last 5 minutes of BTCXXX.

`trk XX` creates a tracker for coin XXX. When a large trade happens, the bot reports if it's buy or sell, rate and size.

## Installation

### Depends:
+ python 2.7.x
+ node.js >= 6.0.0
+ python-shell
+ Naked
+ discord.js

Clone the repo.

```bash
git clone https://github.com/OFRBG/TsukiBot.git
cd TsukiBot
mkdir common
```

Install the dependencies.

```bash
npm install discord.js --save
npm install python-shell
```

Create a `virtualenv` for the project.

```bash
virtualenv TsukiBot
source TsukiBot/bin/activate
```

Install python dependencies.

```bash
pip install pandas Naked
```

Create a keys file.

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
  "discord": "discord token (long with mixed chars)"
}
```

## Execution

To run the main bot:

```bash
node bot.js
```

To run the bot with tracking features:

```bash
node tracker.js
```
