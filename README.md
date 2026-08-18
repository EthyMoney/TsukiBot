TsukiBot  &nbsp; [![Discord Bots](https://discordbots.org/api/widget/status/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704) [![Discord Bots](https://discordbots.org/api/widget/servers/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704)
=======
### Welcome to the official GitHub repository for the ultimate all-in-one cryptocurrency bot for Discord! All features and code used in the production instance of TsukiBot is housed and maintained right here in this repo. If you have any questions, issues, suggestions, or just want to chat with us, feel free to join the TsukiBot discord server [here](https://discord.gg/VWNUbR5).

---

##### No annoying ads, no limits, no locked features, no BS! TsukiBot is a very powerful and easy to use Discord bot that makes for an excellent addition to your Discord crypto community!

##### Founded in 2017 and widely used in the earliest crypto Discord servers, TsukiBot is one of the oldest and most featured bots around with a proven reputation. TsukiBot is still in very active development with new features and enhancements being added regularly. So, what are you waiting for? Add TsukiBot to your server today and transform your community into a cryptocurrency powerhouse!

<br></br>
### The full detailed list of commands and their usage can be found in the commands document [right here in the repo.](https://github.com/EthyMoney/TsukiBot/blob/master/common/commands.md)



## Main Features:
+ Simple and detailed crypto prices, with ticker autocomplete as you type
+ Price alerts delivered by DM when a coin hits your target
+ Portfolio tracking with live value and 24h profit/loss
+ Recurring scheduled market posts in any channel
+ Customizable personal coin watch lists
+ TradingView charts with one-click timeframe switching
+ Perpetual swap funding rates across Binance, Bybit, OKX, and BitMEX
+ Coin market stats, all-time highs, and side-by-side coin comparisons
+ Coin info and descriptions
+ Currency conversion tools
+ Global crypto market stats
+ Trending coins on CoinGecko
+ Specific price pairs from exchanges
+ Coin price movement heat maps
+ Traditional stocks prices
+ ETH gas fees tracking
+ Ethereum address balances lookup
+ Language translations
+ Server tags for saving links
+ Market fear/greed index ratings
+ Biggest gainer and loser coin prices
+ Metrics for trending coins and bot usage
+ Protection from malicious files
+ ....and more! Join the support server to suggest features you want to see. We are listening!

<br>

## Running your own instance

**With Docker (recommended):** copy your keys into `common/keys.api`, set `POSTGRES_PASSWORD` in a `.env`
file to match the `tsukibot` value in that file, set `"dbAddress": "postgres"`, then run
`docker compose up -d`. Postgres initializes itself from the schema in `docs/` on first start.

**Manually:** you need Node 22+ and a PostgreSQL database set up from `docs/TsukiBotDB_Schema`.
Run `npm ci`, create `common/keys.api` (see `docs/How to set up keys file.txt`), then `npm start`.
Register the slash commands once with `npm run deploy`.

A few things worth knowing:

+ **Chromium** is located automatically. Set `CHROME_PATH` if yours lives somewhere unusual. The
  sandbox stays enabled; only set `CHROME_NO_SANDBOX=true` if your host truly cannot run it.
+ **A free CoinGecko demo key** makes a big difference. Put it in `keys.api` as `coingecko` (or set
  `COINGECKO_API_KEY`) and the full market cache refresh drops from roughly half an hour to a few
  minutes, because the rate limit becomes per-key instead of per-IP.
+ **Any key can come from the environment** instead of `keys.api`, which is what makes the Docker
  setup work without baking secrets into an image.
+ `npm test` runs the unit test suite.

<br>

## More of a visual person? Check out the screenshot gallery:
<blockquote class="imgur-embed-pub" lang="en" data-id="a/EhZ8sQw"  ><a href="//imgur.com/a/EhZ8sQw">TsukiBot Demo</a></blockquote>
<br>

## Free Forever
Wanna know a little secret? We don't operate on advertising, referrals, or commissions whatsoever. We operate solely on donations from kind users like yourself! If you like TsukiBot and want to show support for this effort, you can do so with a generous donation :)

ETH & ERC20 donations to: `0x169381506870283cbABC52034E4ECc123f3FAD02` are greatly appreciated and help support future development!
<br><br>

---

Let's keep in touch! Join our support Discord server where you can get help, report problems, and make suggestions for future updates and features!<br>
Join the support server here: [discord.gg/TsukiBot](https://discord.gg/VWNUbR5)
<br><br>


[![Discord Bots](https://discordbots.org/api/widget/506918730790600704.svg)](https://discordbots.org/bot/506918730790600704)

