import sys
import threading

import pandas as pd
import numpy as np

import p_command as pc 

# Loop until there is a spike/pump/dump in the market.

def loop():
    while True:

        try:
            # Sometimes it gives an error that can be easilt avoided
            s = pcom.spikeCheck(sd = 2.5);
        except:
            # Do nothing
            s = ""

        if not s == '':
            # Write back to tracker.js and exit loop
            print(s)
            return 

coin = str(sys.argv[1]).upper();

# Create a wh (p) command with 30 second timeframe
pcom = pc.p_command(coin=coin, tframe = 0.5/60);

loop()
