import psycopg2
import numpy as np

from datetime import datetime, timedelta

class s_command():

    def __init__(self, coin):
        self.coin = coin

    # Update the current data to file
    def writeToFile(self, timef, ex):
        conn = psycopg2.connect("dbname=volumes user=tsukibot")
        cur = conn.cursor()

        SQL = ""
        response = ""

        if ex == 'g':
            SQL = "SELECT sub.type, SUM(sub.volume) FROM (SELECT * FROM gdax WHERE time > CURRENT_TIMESTAMP - INTERVAL '%s minutes') sub GROUP BY type ORDER BY sub.type DESC;"
            cur.execute(SQL, (int(timef),))
            response += "__GDAX Volume__"
        else:
            SQL = "SELECT sub.type, SUM(sub.volume) FROM (SELECT * FROM poloniex WHERE coin = %s and time > CURRENT_TIMESTAMP - INTERVAL '%s minutes') sub GROUP BY type ORDER BY sub.type DESC;"
            cur.execute(SQL, (self.coin, int(timef)))
            response += "__Poloniex Volume__"


        buy = cur.fetchone()
        sell = cur.fetchone()

        if buy is None:
            buy = 1
        else:
            buy = buy[1]

        if sell is None:
            sell = 1
        else:
            sell = sell[1]

        # Write the format

        response += '\n**' + self.coin + '** (since approx. ' + str(timef) +' min. ago)\n :large_blue_circle: BUY: `' + str(buy) + "` \n :red_circle: SELL: `" + str(sell) + "` \n\nNet difference: `" + str(buy-sell) + '`\nRatio: `' + str(   int((buy-sell)/(buy+sell) * 10000)/100.0  ) + ' %`';
        response += '\n`Press cross to delete this message. Avoid spam.`'

        cur.close()
        return response
