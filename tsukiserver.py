import sys

from Naked.toolshed.shell import execute_js

import pandas as pd
import numpy as np

import s_command as sc
import p_command as pc


class server():
    def __init__(self, coin, par):
        self.coin = coin
        self.par = par

    def run(self):

        scom = sc.s_command(self.coin)
        pcom = pc.p_command(self.coin)
        

        # Wait for the command input from bot.js
        command = raw_input()
            
        # Check each case. No switch because yolo

        if command[0] == 's':
            # Get the latest DataFrame from the CSV
            
            self.par = (60 if (int(self.par) > 61 or int(self.par) == -1) else self.par)
            s = scom.writeToFile(self.par)
            
            # Writing to stdout gives the answer to bot.js
            print s
        
        elif command[0] == 'p':
            # I need to rename writeToFile to something like 'on_demand'
            s = pcom.spikeCheck()
            
            # Writing to stdout gives the answer to bot.js
            print s
        
        elif command[0] == 'x':
            # Just in case
            thread.interrupt_main()
         


def main():
    s = server(str(sys.argv[1]).upper(), sys.argv[2])
    s.run()


if __name__ == "__main__":
    main()
