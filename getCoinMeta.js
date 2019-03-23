const fs                = require('fs');
let pairs		= JSON.parse(fs.readFileSync("./common/coins.json","utf8"));
const chalk             = require('chalk');
let cmcMetaData         = {};
const keys              = JSON.parse(fs.readFileSync('./common/keys.api','utf8'));
const CoinMarketCap     = require('coinmarketcap-api');
let clientcmc           = new CoinMarketCap(keys['coinmarketcap' + 2]);
    let meta            = []; // empty Object

                                                                            
/* ---------------------------------

  getCMCMetaData()

  Updates once upon bot startup
  and stores all coins meta data

 ---------------------------------- */
                                                                            
function getCMCMetaData(){
    let numberOfCoins = pairs.length;
    console.log(numberOfCoins);
    
    for (let i=1; i !== numberOfCoins; i++) {
    setTimeout( function timer(){
      
        let key = pairs[i];
        
        
      clientcmc.getMetadata({symbol: key}).then(function(metaJSON){
          //console.log(metaJSON);
          let data = {
            coin : key,
            logo: metaJSON.data[key].logo,
            description : metaJSON.data[key].description
          };
          meta.push(data);
          console.log(chalk.blue("COMPLETED " + i + " OF " + numberOfCoins));
        }).catch(console.error);
        
        if(i === numberOfCoins-1){
           soupTime();
        } 
    }, i*2800 );
    }
    
}

function soupTime(){
    console.log(meta);
    
    fs.writeFile("./common/metadata.json", meta, function (err) {
        if (err)
            return console.log(err);
    });
    
    console.log(chalk.cyan("Operation completed successfully!"));
}

getCMCMetaData();