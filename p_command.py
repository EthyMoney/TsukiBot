import pandas as pd
import numpy as np
import os.path as osp 
  
from datetime import datetime, timedelta
 

class p_command():
    def __init__(self, coin, tframe = 0.09): 
        self.coin = coin
        self.tframe = tframe

    def existsRecord(self):
        return osp.isfile('./common/record_'+self.coin+'.csv')


    # Check for large market TX outside of one sd from an n hour period sample.
    # The default is to check within 1 sd of the mean over tframe. 
 

    def spikeCheck(self, sd = 1, writeToFile = False, last_id = '0'):    
        
        if self.existsRecord():
            dfk = pd.DataFrame.from_csv('./common/record_' + self.coin + '.csv');
        else:
            print('No CSV file. Create a follower first.')
            sys.exit()

        # Limit the timeframe to 12 hours and make timedelta
        tframeD = timedelta(seconds = (12 if self.tframe % 12 == 0 else self.tframe % 12) * 3600)

        # Calculate the BTC amount traded. Then make buy TX > 0 and < 0 for sell
        dfk['amountBTC'] = pd.Series(dfk['amount'].astype(float) * dfk['rate'].astype(float))
        dfk['val'] = dfk['type'].map(lambda x: 1 if x == 'buy' else -1)

        # Assuming only one market buy happens at each moment, group by date and get parameters.
        dfkj = dfk.groupby('date').sum()
        m = dfkj['amountBTC'].mean()
        s = dfkj['amountBTC'].std()

        # Make date a column and parse to datetime
        dfkj = dfkj.reset_index()
        dfkj['date'] = dfkj['date'].map(lambda x: datetime.strptime(x + " GMT", '%Y-%m-%d %H:%M:%S %Z'))

        # Filter the results within one sd
        dfkj = dfkj[abs(dfkj['amountBTC']-m) > sd*s]

        # Filter the results to be within the timeframe
        dfkj = dfkj[datetime.now() - dfkj['date'] < tframeD]
        dfkj.sort_values('date', ascending = 'False') 
        response = ""

        # Check if the response is for tracker or for record
        if writeToFile:
            # Create the header line
            response += ("__Large Market Trades for **" + self.coin + "**__\n\n`min ago || ` :red_circle: ` = SELL ` :large_blue_circle: ` = BUY || ETH`\n")
            
            # Iterate over all the market trades in the DataFrame
            for index, row in dfkj.iterrows():
                response += ((" :red_circle: : " if row['val'] < 0 else " :large_blue_circle: : ") +
                                "`" + str((datetime.now()-row['date']).seconds/60) + "` - `" + str(row['amount']) + "`\n")
        else:
            # For the tracker it checks if the DataFrame is empty
            if not dfkj.empty:
                response += ("__:whale: Trade Alert__\n") 

                # For each match, calculate the rate of the trade and set the message
                for index, row in dfkj.iterrows():
                    rate = row['amountBTC'] / row['amount']
                    response += ((" :red_circle: : " if row['val'] < 0 else " :large_blue_circle: : ") +
                                    "at `" + str(rate) + "` - `" + str(row['amount']) + ' '  + self.coin + "`\n")
            else:
                # If the DataFrame is empty, return an empty string
                response = ""
        
        return (response)
