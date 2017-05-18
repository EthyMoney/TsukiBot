import poloapi
import json

import pandas as pd
import numpy as np

import threading
import sys
import os.path as osp

import p_command as pc

from Naked.toolshed.shell import execute_js, muterun_js
from datetime import datetime, timedelta


class Fetcher():
    def __init__(self,coin,logger=False):
        # Make the coin uppercase (even if it is)
        self.coin = coin.upper()

        with open('keys.api') as json_data:
            keys = json.load(json_data)
        
        # Initialize polo api
        self.p = poloapi.poloniex(keys['polo'][0],keys['polo'][1])
        

        # Check if there is data available (CSV for now)
        if self.existsRecord():    
            self.df = pd.DataFrame.from_csv('./common/record_'+self.coin+'.csv')
        else:
            self.df = self.initializeRecord()

    # Bridge to timer method
    def startDataLogging(self):
        self.UpdateData()
    

    # Get the DataFrame
    def getDataFrame(self):
        return self.df


    # First run initilization. Get data from the API, set the datetime objects and store to csv    
    def initializeRecord(self): 
        df = self.getTradeHistoryAfter()
        df['date'] = df['date'].map(lambda x: datetime.strptime(x + " GMT", '%Y-%m-%d %H:%M:%S %Z'))
        df.to_csv('./common/record_'+self.coin.upper()+'.csv')
        return df


    # Check if record exists
    def existsRecord(self):
        return osp.isfile('./common/record_'+self.coin+'.csv')


    # Data from Poloniex starting after the last saved ID
    def getTradeHistoryAfter(self, lastID = '0'):
        arr = self.p.returnMarketTradeHistory('BTC_' + self.coin)
        d1 = pd.DataFrame(arr)
        return d1.query('tradeID > ' + lastID)


    # Get the highest tradeID
    def LastTradeID(self, df):
        return str(df.max()['tradeID'])


    # Merge the current saved data with the new one
    def mergeUpdate(self, df, df_update):
        return df.append(df_update)


    # Update the current data to file
    def UpdateData(self):
        df = self.getDataFrame()

        # Get the new data and apply the datatime parse
        df_update = self.getTradeHistoryAfter(lastID=self.LastTradeID(df))        
        df_update['date'] = df_update['date'].map(lambda x: datetime.strptime(x + " GMT", '%Y-%m-%d %H:%M:%S %Z'))
        df = self.mergeUpdate(df, df_update)

        # Calculate the BTC amount for each TX
        df['amountBTC'] = pd.Series(df['amount'].astype(float) * df['rate'].astype(float))
         
        # Store the DataFrame to csv
        df.to_csv('./common/record_'+self.coin+'.csv')
        
        # Save DataFrame to instance variable
        self.df = df
        
        # Call a timer set to 5 seconds until repeat
        threading.Timer(5, self.UpdateData).start()


