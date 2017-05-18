import sys

from Naked.toolshed.shell import execute_js

import pandas as pd
import numpy as np

import s_command as sc
import p_command as pc
import fetch


class server():
    def __init__(self, coin):
        self.coin = coin

    def run(self):
        # First make fetch and command objects
        f = fetch.Fetcher(self.coin)

        scom = sc.s_command(self.coin)
        pcom = pc.p_command(self.coin)
        

        # Wait for the command input from bot.js
        command = raw_input()
            
        # Check each case. No switch because yolo

        if command[0] == 's':
            # Get the latest DataFrame from the CSV
            df = f.getDataFrame()
            s = scom.writeToFile(df)
            
            # Writing to stdout gives the answer to bot.js
            print s    
        
        elif command[0] == 'p':
            # I need to rename writeToFile to something like 'on_demand'
            s = pcom.spikeCheck(writeToFile=True)
            
            # Writing to stdout gives the answer to bot.js
            print s
        
        elif command[0] == 'x':
            # Just in case
            thread.interrupt_main()
         


def main():
    s = server(str(sys.argv[1]).upper())
    s.run()


if __name__ == "__main__":
    main()
