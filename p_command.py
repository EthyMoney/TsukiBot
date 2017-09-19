import psycopg2

import numpy as np
import os.path as osp

from datetime import datetime, timedelta

INTERVAL = 60

class p_command():
    def __init__(self, coin, timef= 10):
        self.coin = coin
        self.timef = timef;


    def spikeCheck(self, sd = 2):

        conn = psycopg2.connect("dbname=volumes user=tsukibot")
        cur = conn.cursor()
        SQL = "SELECT sum(volume) as amount,  EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - time) / 60 as minutes, sum(type) as type FROM poloniex WHERE coin = %s and time > CURRENT_TIMESTAMP - INTERVAL '%s minutes' GROUP BY time HAVING sum(volume) > (SELECT %s*k.sd + k.m FROM (SELECT stddev_pop(t.sum) as sd, avg(t.sum) as m FROM (SELECT sub.time, sum(volume) as sum FROM (SELECT * FROM poloniex WHERE coin = %s and time > CURRENT_TIMESTAMP - INTERVAL '%s minutes') sub GROUP BY time) t) k) ORDER BY minutes DESC;"

        cur.execute(SQL, (self.coin, int(self.timef), sd, self.coin, INTERVAL))




        response = ("__Large Market Trades for **" + self.coin + "**__\n\n`min ago || ` :red_circle: ` = SELL ` :large_blue_circle: ` = BUY || ETH`\n")

        # Iterate over all the market trades in the DataFrame
        for row in cur:
            response += ((" :red_circle: : " if row[2] < 0 else " :large_blue_circle: : ") +
                    "`" + str(int(row[1])) + "` - `" + str(row[0]) + "`\n")
            #else:
        #    # For the tracker it checks if the DataFrame is empty
        #    if not dfkj.empty:
        #        response += ("__:whale: Trade Alert__\n")
        #
        #        # For each match, calculate the rate of the trade and set the message
        #        for index, row in dfkj.iterrows():
        #            rate = row['amountBTC'] / row['amount']
        #            response += ((" :red_circle: : " if row['val'] < 0 else " :large_blue_circle: : ") +
        #                            "at `" + str(rate) + "` - `" + str(row['amount']) + ' '  + self.coin + "`\n")
        #    else:
        #        # If the DataFrame is empty, return an empty string
        #        response = ""

        cur.close()
        return (response)
