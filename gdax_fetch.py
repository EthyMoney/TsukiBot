import poloapi
import json
import psycopg2
import GDAX

import numpy as np

import threading
import sys
import os.path as osp
import time

import p_command as pc

from Naked.toolshed.shell import execute_js, muterun_js
from datetime import datetime, timedelta


class GDAXDB(GDAX.WebsocketClient):
    def mapType(self,typer):
        return 1 if typer == 'sell' else -1
    
    def onOpen(self):
        self.conn = psycopg2.connect("dbname=volumes user=tsukibot")

    def onMessage(self, msg):
        if 'price' in msg and 'type' in msg and msg['type'] == 'match':
            print msg['maker_order_id'] + " - " + msg['side']  + " -  %0.2f" %  float(msg['size']) + " - %0.2f" % float(msg['price']) 

            cur = self.conn.cursor()
            
            usd = float(msg['size']) * float(msg['price']) 
            cur.execute( "INSERT INTO gdax(trade_id, volume, time, volumeusd, type, rate) VALUES (%s,%s,%s,%s,%s,%s);",
                (msg['maker_order_id'],
                float(msg['size']),
                msg['time'],
                float(usd),
                self.mapType(msg['side']),
                float(msg['price'])));
       
        
            self.conn.commit() 
            cur.close()

    def onClose(self):
        self.conn.close()

class fetcher():
    def __init__(self):

        self.client = GDAXDB(products="ETH-USD")
        self.client.start()
