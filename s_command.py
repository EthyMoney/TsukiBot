import pandas as pd
import numpy as np

from datetime import datetime, timedelta

TIME_FRAME = 30

class s_command():

    def __init__(self, coin):
        self.coin = coin
    
    # Update the current data to file
    def writeToFile(self, df):
            
        # Set the time margin for the indicator
        margin = timedelta(minutes=TIME_FRAME)

        # Calculate the BTC amount for each TX
        df['amountBTC'] = pd.Series(df['amount'].astype(float) * df['rate'].astype(float))
       
        # Sometimes it decides it doesn't want to work, so I parse it all again
        try:
            df['date'] = df['date'].map(lambda x: datetime.strptime(x + " GMT", '%Y-%m-%d %H:%M:%S %Z'))
        except:
            # Lame nop
            1+1         

    
        # Open file stream to store Discord text 
        
        # Copy and filter by date within margin. Then group by type.
        dfk = df
        dfk = dfk[(datetime.now() - dfk['date']) < margin]
        arr = dfk.groupby('type').sum()['amountBTC'].tolist()
       

        # Write the format
        
        response = '\n**' + self.coin + '** (since approx. ' + str(TIME_FRAME) + ' min. ago)\n__Volume__ (BTC)\n :large_blue_circle: BUY: `' + str(arr[0]) + "` \n :red_circle: SELL: `" + str(arr[1]) + "` \n\nNet change: `" + str(arr[0]-arr[1]) + '`'

        return response 
