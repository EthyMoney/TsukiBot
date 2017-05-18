import sys

import pandas as pd
import numpy as np

import fetch

# Get the coin and loop reading from the API
coin = str(sys.argv[1]).upper();

f = fetch.Fetcher(coin);
f.startDataLogging();
