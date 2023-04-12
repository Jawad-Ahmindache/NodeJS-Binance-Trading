const config = require('./config.js');

const api = require('./api/'+config.exchangeSelected+'.js');
const util = require('./functions.js');

const Api = api.api;



(async () => {

    
    const etapeCreateChemin = await Api.makePairCombinaison();
    await Api.wsConvertCoinConnexion();

    if(etapeCreateChemin && Api.socketList['convertCoin'].isConnected == 'connected')
        console.log('Premières étapes passées avec succès');
    else    
        return console.log("erreur à l'étape createChemin et setFeeToPairInfo ou convertCoinSocket n'a pas pu se connecter");
  

    Api.wsLocalOrderBook();
})();

