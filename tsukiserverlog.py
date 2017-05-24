import sys

import pandas as pd
import numpy as np

import db_fetch as db

# Get the coin and loop reading from the API

coins = sys.argv;
del coins[0]

f = db.fetcher(coins);
