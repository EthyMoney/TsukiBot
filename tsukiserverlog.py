import sys

import pandas as pd
import numpy as np

import db_fetch as db
import gdax_fetch as gdb

# Get the coin and loop reading from the API

coins = sys.argv;
del coins[0]

f = db.fetcher(coins);
g = gdb.fetcher();
