import poloapi
import json
import psycopg2
import gdax

import numpy as np

import threading
import sys
import os.path as osp

import p_command as pc

from Naked.toolshed.shell import execute_js, muterun_js
from datetime import datetime, timedelta



class fetcher():
    def __init__(self,coins):

        self.coins = coins


        with open('keys.api') as json_data:
            keys = json.load(json_data)

        # Initialize polo api
        self.p = poloapi.poloniex(keys['polo'][0],keys['polo'][1])

        self.conn = psycopg2.connect("dbname=volumes user=tsukibot")

        self.UpdateData()




    # Data from Poloniex starting after the last saved ID
    def getTradeHistory(self, coin):
        if coin[-1] == 'X':
            return self.p.returnMarketTradeHistory('USDT_' + coin[:-1]);
        else:
            return self.p.returnMarketTradeHistory('BTC_' + coin)



    # Get the highest tradeID
    def LastTradeID(self, coin):
        cur = self.conn.cursor()
        cur.execute("SELECT max(trade_id) FROM poloniex WHERE coin = %s;", (coin,))

        lt = cur.fetchone()

        ans = 0 if lt[0] == None else lt[0]
        cur.close()

        return ans

    def mapType(self,type):
        return 1 if type == 'buy' else -1

    # Update the current data to file
    def UpdateData(self):

        cur = self.conn.cursor()
        for coin in self.coins:

            coin = coin.upper()

            if coin[-1] == 'X':
                coin[:-1]

            lt = self.LastTradeID(coin)

            arr = np.array(self.getTradeHistory(coin)),

            arr = arr[-1]

            for row in arr:
                if int(row['tradeID']) > lt:
                    btc = float(row['amount']) * float(row['rate'])
                    cur.execute( "INSERT INTO poloniex (trade_id, volume, time, coin, volumebtc, type) VALUES (%s,%s,%s,%s,%s,%s);",
                        (int(row['tradeID']),
                        float(row['amount']),
                        datetime.strptime(row['date'],
                        '%Y-%m-%d %H:%M:%S'),
                        str(coin),
                        float(btc),
                        self.mapType(row['type'])));


        self.conn.commit()
        cur.close()

        threading.Timer(5,self. UpdateData).start()
