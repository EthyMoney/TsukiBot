# KL-Index

## Motivation
Among the different types of crypto traders, a few may be classified as weektraders. While weektrading isn't as risky as daytrading,
it involves being able to see future market movements on a macro scale. Saying that either daytrading or weektrading is the harder one
is up to the reader, but both certainly require different supporting tools.

## Translating Experience into Knowledge
One of the hardest things to translate from daytrading and weektrading into an indicator is to identify how gut feelings are triggered.
After a few months of back and forth, KL Index appeared as one of the results of translating experience into knowledge. The current version
of the KL Index is not too elaborate and falls off especially with low market cap coins. However, it serves its purpose.

## Fitting Crypto
Daytraders will know that volume is probably the quintessential indicator needed for every chart. That pushed `volume` as a core indicator.
The second indicator is the best we can currently get from most sources: market cap or `mcap`. For months I've argued that nominal mcap
values are useless, but relative mcaps seems to directly rule the crypto hierarchy. The second core indicator is then `mcap`. Lastly,
I believe that due to the distortion that nominal mcap introduces, the relation is visible after scaling logarithmically.

Now that a visualization is found for the whole market, how should this be interpreted? The construction of the plot should be
easy to understand, but understanding the movements is not trivial. There are several things we can get from the KL Plot. I'll mention
them without going too deep into any.

![KL Plot Example](https://imgur.com/I46EbAC.png)

## Description and characterization

+ There are 3 sections: low mcap, mid mcap, and high mcap.
+ There are 4 types: undertrend, overtrend, ontrend, and noise.

For the 3 sections, I have found that the limits work with 40/20/40. The lower 40%, the middle 20%, and the top 40% of the limits.
The bottom 40% is what seems to be the pump paradise. This is a no-go zone. The top 40% of the mcap is taken by the "blue chips". Unless
one of them is doing a rank relocation, the price movement will usually be within the `[-10,10]%` range daily. Finally, I the middle 20%
is the transition zone. These cryptos are usually the result of coins coming out of the lower 40% with steady price increases. Some others
might end up in this zone due to falling out of the top 40%, but this is less common.

For the 4 types, the evident ones are under-, over- and ontrend. When a crypto moves ontrend, it means it's following the general market
behavior and staying within the range of the usual mcap-volume relation. Undertrend coins are particularly interesting cases worth studying. Undertrend coins are able to hold a large mcap without a correspondingly-high trading volume. Finally we have overtrend coins.
Cryptos that break from being ontrend to become overtrend are usually bullish. On the KL Plot that may be seen as a move upwards and then
diagonally, down and right. The noise category is simply the set of coins that don't relate to their KL movements. The lower 40% usually
outputs noise.

As a week trader, the first thing I need to find is a crypto in the mid 20% range with a move to the overtrend type. While this method
doesn't guarantee "moon missions", the last few 1000% cryptos I've followed have had this behavior.

## Example KL Plot zones
![KL zones](https://imgur.com/BQ1F19s.png)
The green zone has residuals that are above the 10%. The red zone is approximately the 20% section. Combined, coins entering the yellow
zone could become (maybe are) major coins in the next few days/weeks.
