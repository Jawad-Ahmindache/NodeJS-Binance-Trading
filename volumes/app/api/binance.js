const config = require('../config.js');
const querystring = require('querystring');
const crypto = require('crypto');
const https = require('https');
const util = require('../functions.js');
const { Console, clear, time } = require('console');
const Utility = util.utility;
const wsClient = require('websocket').client;
const fs = require('fs');
const e = require('express');
const { parse } = require('path');
const { exec } = require('child_process');
const { query } = require('express');
const { start } = require('repl');
const { client } = require('websocket');
const { waitForDebugger } = require('inspector');



const api = {
    apiName: 'Binance',
    apiKey : config.apiKey.Binance,
    cryptoDepartMise : config.cryptoDepart.cryptoDepartMise,
    pairInfo: null, //Information des pair sur les exchanges
    pairList : {}, 
    numberExecution : 0,
    socketList : {},
    listCombinaison : [],
    depthLimit : 100,
    con : Utility.connMaker(),
    executionList: [],
    apiRestQuery(method, endpoint, data, headers,signature){
        const expires = Date.now();


        let baseEndpoint = endpoint;
        let postData = querystring.stringify(data);

        if(method == 'GET' && Object.keys(data).length > 0)
            endpoint += '?'+postData; 
        
        
        if(signature == true){
            if(Object.keys(data).length <= 0 && method == "GET")
                endpoint += "?";
            data.timestamp = expires;
            data.recvWindow = 30000;
            postData = querystring.stringify(data);
                        
            endpoint += postData;
            const signature = crypto.createHmac('sha256', this.apiKey.secret).update(postData).digest('hex');
            endpoint += "&signature="+signature;

            if(method == "POST"){
                data.signature = signature;
                postData = querystring.stringify(data);
                endpoint = baseEndpoint;
            }

        }
        
        if(method == 'GET')
            postData = null;

        headers['X-MBX-APIKEY'] = this.apiKey.key;
        
        const options = {
          hostname: 'api.binance.com',
          port: 443,
          path: endpoint,
          method: method,
          headers: headers,
          timeout: 5000,
          data: postData
        };

        return options;
    },

    setFeeToPairInfo(){
        return new Promise((resolve,reject) => {         
            this.getTradeFee()
                        .then((value) => {
                                if(value){
                                    let tradeFee = JSON.parse(value);
                                    for(let fee in Object.keys(tradeFee)){
                                        if(this.pairInfo.hasOwnProperty(tradeFee[fee].symbol))
                                            this.pairInfo[tradeFee[fee].symbol].fee = tradeFee[fee].takerCommission;
                                    }
                                    return resolve(true);   
                                }
                                else
                                    return reject(false);         
                    }).catch((value) => {
                        return resolve(false);
                    });
        });
    },
    getTradeFee(){
        const options = this.apiRestQuery('GET','/sapi/v1/asset/tradeFee',{},{},true);
        return new Promise((resolve,reject) => {
            const req = https.request(options,(resp) => {
                let str = '';
                resp.on('data',(chunk) => str += chunk)
                resp.on('end', () => resolve(str));
            })
            req.on('error',(err) => reject(err) )
            req.end();
        })
    },
    getExchangeInfo(){
        const options = this.apiRestQuery('GET','/api/v3/exchangeInfo',{},{},false);
            
        return new Promise((resolve,reject) => {
            const req = https.request(options,(resp) => {
                let str = '';
                resp.on('data',(chunk) => str += chunk)
                resp.on('end', () => resolve(str));
            })
            req.on('error',(err) => reject(err) )
            req.end();
        })
    },
    createWebSocketStream(name,url){
        const socket = new wsClient();
        socket.urlCustom = url;
        socket.isConnected = 'pending';
        socket.reconnectState = false;
        socket.reconnect = function()  {
            
            if(!socket.reconnectState){
                socket.isConnected = 'pending';
                socket.reconnectState = true;
                console.log("Tentative de reconnexion");
                setTimeout(function(){
                    socket.connect(socket.urlCustom);
                },1000);
            }
        }


        socket.on('connectFailed', function(error) {
            console.log('Connect Error: ' + error.toString());
            socket.isConnected = 'disconnected';
            
            socket.reconnectState = false;
            socket.reconnect();
        });
        socket.on('connect', function(connection) {
            console.log('WebSocket Connexion');
            socket.isConnected = 'connected';
            socket.reconnectState = false;
            socket.sendData = function(data){
                connection.sendUTF(data);
            }
            connection.on('error', function(error) {
                console.log("["+name+"] Connection Error: " + error.toString());
            });
            connection.on('close', function(error) {
                console.log(error);
                console.log('['+name+'] Connection Closed');
                socket.isConnected = 'disconnected';
                socket.reconnect();
            });
            
        });
        
        return socket;

    },
    // State : connected,pending,disconnected
    waitSocketState(socketName,state){
        return new Promise((resolve) => {
            let time = 0; // en miliseconde
            let timer = setInterval(() => {
                if(this.socketList[socketName].isConnected == state){
                    clearInterval(timer);
                    return resolve(state);
                }
                time += 10; 
                if(time >= 5000) // 5000 ms
                    throw new Error("["+socketName+"] wait state : " + state + " exceed 5 seconds");
            },10);
                    
        }); 
    },
    wsMsgBuilder(method,data,sign){
        // on créer notre objet pour l'envoyer
        let object = {
            method: method,
            params: data,
            id: Date.now()+Math.floor(Math.random() * 1000)
        }
        

        // on crée notre signature
        if(sign == true){
            data.apiKey = api.apiKey.key;
            data.timestamp = Date.now();
            data.recvWindow = 5000;
            const secretKeyASCII = Buffer.from(api.apiKey.secret,'ascii');
            if(!Array.isArray(data))
                data = Utility.sortObjAlphabet(data);
            object.params = data;
            const payload = Buffer.from(querystring.stringify(object.params),'ascii');

            const signature =  crypto.createHmac('sha256', secretKeyASCII).update(payload).digest('hex');
            object.params.signature = signature;
        }
        //on trie nos paramètres par ordre alphabétique
        if(!Array.isArray(object.params))
                    object.params = Utility.sortObjAlphabet(object.params);

        return JSON.stringify(object);
    },
   
    updateLocalOrderBook(event){
        
        // on check si l'event peut être traité
        if(event.u){
            let pair = event.s;
            let eventUpdateId = event.u;

            // Si la snapshot n'a pas correctement été générée on ne prend pas en compte cette crypto
            if(this.pairList[pair].orderBook == false)
                return false;

            if(event.u >= this.pairList[pair].orderBook.lastUpdateId + 1){
                
                this.pairList[pair].orderBook.lastUpdateId = eventUpdateId;
     
                event.b.forEach((value)=>{
                    let pushValue = true; // si le price n'a pas été trouvé dans le map on l'ajoute
                    this.pairList[pair].orderBook.bids.map((subArray) =>{
                        if(subArray[0] == value[0]){
                            pushValue = false;
                            if(value[1] == 0)
                                this.pairList[pair].orderBook.bids = this.pairList[pair].orderBook.bids.filter(subArray2 => !(subArray2[0] == value[0]));
                            else{
                                subArray[1] = value[1]
                            }
                        }
                    });
                    if(pushValue == true && value[1] > 0)
                        this.pairList[pair].orderBook.bids.push(value);  
                })
                this.pairList[pair].orderBook.bids.sort((a, b) => b[0] - a[0]);

                event.a.forEach((value)=>{
                    let pushValue = true; // si le price n'a pas été trouvé dans le map on l'ajoute
                    this.pairList[pair].orderBook.asks.map((subArray) =>{
                        if(subArray[0] == value[0]){
                            pushValue = false;
                            if(value[1] == 0)
                                this.pairList[pair].orderBook.asks = this.pairList[pair].orderBook.asks.filter(subArray2 => !(subArray2[0] == value[0]));
                            else{
                                subArray[1] = value[1]
                            }
                        }
                    });
                    if(pushValue == true && value[1] > 0)
                        this.pairList[pair].orderBook.asks.push(value);  
                })
                this.pairList[pair].orderBook.asks.sort((a, b) => a[0] - b[0]);
                this.pairList[pair].lastUpdateTime = Date.now();
      
                for(let chemins of this.listCombinaisons){
                    if(chemins[0].pair == pair)   
                        this.execution([...chemins]);
                }
            }
        }
    
    },
    checkCheminsUpdateTime(chemins){
        const isRecent = false;
        for(let chemin of chemins){
            if(( Date.now() - this.pairList[chemin.pair].lastUpdateTime ) <= 250)
                isRecent = true;
            else {
                isRecent = false;
                break;
            }   
       }

       return isRecent;
    },
    detection(){
            let error;
            for(let [...chemins] of this.listCombinaisons){
                error = false;
                let prevMise = null;
                for(let key in chemins){
                    chemins[key] = {...chemins[key]};
                    if(key == 0)
                        chemins[key].miseBefore = config.cryptoDepart.cryptoDepartMise[chemins[key].coinBefore];
                    else
                        chemins[key].miseBefore = prevMise;

                    let pairName = chemins[key].base+chemins[key].quote;
                    if((Date.now() - this.pairList[pairName].lastUpdateTime) > 250){
                        error = true;
                        break;
                    }

                    chemins[key] = this.calculOrderBook(chemins[key],chemins[key].miseBefore,chemins[key].coinBefore);
                    if(!chemins[key].isLiquid)
                        error = true;
                    else{
                        chemins[key].miseAfter = Utility.convertMise(chemins[key].miseBefore,chemins[key].price,chemins[key].coinBefore,{base:chemins[key].base,quote:chemins[key].quote});
                        chemins[key].miseAfter = Utility.calculFees(chemins[key].miseAfter,this.pairInfo[pairName].fee);
                        prevMise = chemins[key].miseAfter;
                    }
                }
                
                if(error)
                    continue;
                else
                   this.calculChemin(chemins);
            }
    },
    updateDetection(){

    },
    async execution(chemin){

        // ON CHECK SI UNE EXECUTION EST EN COURS SUR LA PAIR
            if(!this.executionList.hasOwnProperty(chemin[0].pair))
                this.executionList[chemin[0].pair] = null;

            if(this.executionList[chemin[0].pair] == null)
                this.executionList[chemin[0].pair] = chemin;
            else
                return false;

        let prevMise = chemin[0].miseBefore;
        let prevMiseDevise = chemin[0].coinBefore;
        let lastPrice = null;
        for(let key in chemin){
            
            let orderQty;
            let orderTimeout;
            let setPrice = (useLastPrice = true) => {
                console.log('[EXECUTION] Changement de price pour '+ chemin[key].pair);
                chemin[key] = {...chemin[key]};
                
                if(key != 0 && useLastPrice)
                    chemin[key].price = lastPrice * config.PRICE_MULTIPLIER;
                else
                    chemin[key] = this.calculOrderBook(chemin[key],prevMise,prevMiseDevise);

                chemin[key].price = Utility.calculStepSize(chemin[key].price,this.pairInfo[chemin[key].pair].tickSize);
                
                
                orderQty = Utility.convertMiseForOrder(prevMise,chemin[key].price,prevMiseDevise,{base:chemin[key].base,quote:chemin[key].quote});
                orderQty = Utility.calculStepSize(orderQty,this.pairInfo[chemin[key].pair].stepSize);
                orderTimeout = Date.now();
                
            }
                 
            setPrice();

            let orderResp;
            let executeOrder = async () => {
                return new Promise((resolve) => {
                        setPrice();
                        let orderIntervalExist = false;
                        let orderInterval = setInterval(async () => {
                            if(orderIntervalExist)
                                return false;
                            else{
                                orderIntervalExist = true;
                                chemin[key].queryResult = null;
                                
                                if(key == 0)
                                    timeInForce = 'FOK';
                                if(key != 0)
                                    timeInForce = 'GTC';

                                chemin[key].tif = timeInForce;
                                chemin[key].query = this.sendLimitOrder(chemin[key].pair,chemin[key].price,chemin[key].side,orderQty,timeInForce);
                                chemin[key].lastClientOrderId = chemin[key].query.params.newClientOrderId;
                                orderResp = await this.checkOrderResponse(chemin[key]);
                                
                                
                                //Si on est au premier chemin et que le prix n'est pas bon on change le prix
                                if(key == 0 && (Date.now() - orderTimeout >= 3000) && orderResp != config.Status.success){
                                    setPrice();
                                    console.log(chemin[key].price);
                                }
                                let lastOrderResp = 50;
                                
                                while(orderResp == config.Status.p_filled || orderResp == config.Status.waiting){
                                    if((Date.now() - lastOrderResp) >= 100){
                                        orderResp = await this.checkOrderResponse(chemin[key]);
                                        console.log(orderResp);
                                        lastOrderResp = Date.now();
                                    }
                                    else
                                        orderResp = config.Status.waiting                                    
                                }
                                if(orderResp == config.Status.success){
                                    lastPrice = chemin[key].queryResult.result.price;

                                    if(chemin[key].coinBefore == chemin[key].base)    
                                        prevMise = Number(chemin[key].queryResult.result.cummulativeQuoteQty);
                                    
                                    else
                                        prevMise = Number(chemin[key].queryResult.result.executedQty);


                                    prevMiseDevise = chemin[key].nextCoin;
                                    chemin[key].miseAfter = prevMise;                                    
                                    clearInterval(orderInterval);
                                    return resolve(true);
                                }
                                else
                                    orderIntervalExist = false;
                            }
                    },200);
                })
            }

            await executeOrder();
        }

        this.executionList[chemin[0].pair] = null;
        this.numberExecution++;

        if(this.numberExecution > 5)
            throw new Error('finish');
    },
    async checkOrderResponse(chemin){
        return new Promise(async (resolve) =>{
                chemin.query = this.queryOrderStatus(chemin.pair,chemin.lastClientOrderId);
                let isRetry = false;
                
                let timeOut = Date.now();
                let queryResultExecuter = () => {
                    return new Promise((resolve) => {
                        let queryResultInterval = setInterval(() => {
                            if(chemin.queryResult != null && chemin.queryResult.error == null){
                                clearInterval(queryResultInterval);
                                return resolve(true);
                            }
                               
                            if((Date.now() - timeOut) >= 2000){
                                if(isRetry && chemin.tif == "FOK"){
                                    this.cancelOrder(chemin.pair,chemin.lastClientOrderId);
                                    return resolve(config.Status.cancel);
                                }
                                chemin.queryResult = null;
                                chemin.query = this.queryOrderStatus(chemin.pair,chemin.lastClientOrderId);
                                timeOut = Date.now();
                                isRetry = true;
                            }
                        },10)

                    })
                }
                await queryResultExecuter();

                if(chemin.queryResult.error != null)
                    return resolve(config.Status.cancel);

                if(chemin.queryResult.result.status == "FILLED")
                        return resolve(config.Status.success);
                else if(chemin.queryResult.result.status == "PARTIALLY_FILLED")
                        return resolve(config.Status.p_filled);
                else if(chemin.queryResult.result.status == "NEW")
                        return resolve(config.Status.waiting);
                else
                        return resolve(config.Status.cancel);
        });
    },
    searchExecutionCheminByQueryId(queryId,result){
        for(let value in this.executionList){
            for(let value2 in this.executionList[value]){
                value2 = this.executionList[value][value2];
                
                if(value2.query != null){
                    if(value2.query.id == queryId){
                        value2.queryResult = result;
                        return true;
                    }
                }
            }
        }
        return false;
    },
    wsNewConnexion(name,url){
        if(this.isSocketConnexionExist(name))
            this.socketList[name].abort();
        

        let socket = this.createWebSocketStream(name,url);
       

        this.socketList[name] = socket;
    },
    calculChemin(chemin){
        let lastKey = chemin.length - 1;
        let gainPercent = Utility.ecartPercent(chemin[0].miseBefore,chemin[lastKey].miseAfter); 
        if(gainPercent > 0){ 
            console.log(chemin[0].miseBefore + " | " + chemin[lastKey].miseAfter);

            let info = {
                date : Utility.formatedDate(),
                timestamp : Date.now(), 
                miseDepart : chemin[0].miseBefore,
                miseFinale : chemin[lastKey].miseAfter,
                gainPercent : gainPercent,
                gainDevise : chemin[lastKey].nextCoin
            }
            info.gainPrix = Utility.ecartPrix(info.miseDepart,info.miseFinale);
  

        }

    },
    calculOrderBook(cheminEtape,mise,miseDevise){
        
        side = (cheminEtape.side == "sell") ? 'bids' : 'asks';
        
        cheminEtape.price = 0;
        cheminEtape.liquidite = 0;
        let nbOrder = 0;
        let minLiquidite = 0;

        cheminEtape.obLastUpdateTime = this.pairList[cheminEtape.base+cheminEtape.quote].lastUpdateTime;
        for(let key in this.pairList[cheminEtape.base+cheminEtape.quote].orderBook[side]){
             value = this.pairList[cheminEtape.base+cheminEtape.quote].orderBook[side][key];
             value[0] = Number(value[0]);
             value[1] = Number(value[1]);
             cheminEtape.price += value[0];
             cheminEtape.liquidite +=  (value[0] * value[1]);
             nbOrder++;
      
             minLiquidite = Utility.convertMiseForCalcLiquidity(mise,cheminEtape.price/nbOrder,miseDevise,{base: cheminEtape.base, quote: cheminEtape.quote});
             if(cheminEtape.liquidite >= minLiquidite){
                cheminEtape.isLiquid = true;
                cheminEtape.price = cheminEtape.price/nbOrder;
                return cheminEtape;
             }
        }
        cheminEtape.isLiquid = false;
        return cheminEtape;
    },
    getOrderBook(pair) {
        this.pairList[pair].orderBook = false;
        
        let query = this.apiRestQuery('GET', '/api/v3/depth', {symbol : pair, limit : this.depthLimit}, {},false);
            console.log("getOrderBook : Récupération de l'OB "+ pair + "...");
            return new Promise(async (resolve) => {
                const launchQuery = await new Promise((resolve) => {
                    const req = https.request(query,(resp) => {
                        let str = '';
                        resp.on('data',(chunk) => str += chunk)
                        resp.on('end', () => resolve(JSON.parse(str)));
                    })
                    req.on('error',() => resolve(false) )
                    req.end();
            })
            if(launchQuery){
                if(launchQuery.bids == null || launchQuery.bids.length <= 0 || launchQuery.asks.length <= 0){
                    console.log('getOrderBook : Echec de récupération (json bad response) ' + pair);
                    return resolve(false)
                }
                const orderBook = {
                    lastUpdateId : launchQuery.lastUpdateId,
                    bids : launchQuery.bids,
                    asks : launchQuery.asks
                };

                this.pairList[pair].orderBook = orderBook;
      
                console.log('getOrderBook : récupéré avec succès ' + pair);
                return resolve(true);
            }

            
            console.log('getOrderBook : Echec de récupération (no response) ' + pair);
            return resolve(false);
        })

    },
    hasNullValue(obj) {
        for (const key in obj) {
          if (obj[key] === null) {
            return true;
          }
        }
        return false;
    },
    getSnapshotForAllPair(){
        return new Promise((resolve) => {
            let data = {};
            for(const pair in this.pairList){
                data[pair] = null;
                this.getOrderBook(pair).then((any) => {
                    data[pair] = any;
                    if(!this.hasNullValue(data))
                        resolve(true);
                })        
            }   
        });
    },
    async wsLocalOrderBook(){
        const method = "SUBSCRIBE";
        let data = [];
        
        for(const pair in this.pairList){
            data.push(pair.toLowerCase()+"@depth@100ms");
        }
      

        await this.getSnapshotForAllPair();        
        
        const query = this.wsMsgBuilder(method,data,false);
        
        
        this.wsNewConnexion("subOrderBook","wss://stream.binance.com:9443/ws");
       
       // Déconnecter le socket pour mettre à jour la snapshot de l'orderbook
        setInterval(async () => {
            this.socketList['subOrderBook'].abort();    
            await this.getSnapshotForAllPair();
            this.socketList['subOrderBook'].connect(this.socketList['subOrderBook'].urlCustom);
        },60000);
        
        this.socketList['subOrderBook'].on('connect',function(connection){
            connection.sendUTF(query);
            connection.on('message', function(message) {
                if (message.type === 'utf8') {
                    let event = JSON.parse(message.utf8Data);
                    api.updateLocalOrderBook(event);
                }
            });
        })
        this.socketList['subOrderBook'].connect(this.socketList['subOrderBook'].urlCustom);
    },
wsConvertCoinConnexion(){
        const socketName = 'convertCoin';
        if(!this.isSocketConnexionExist(socketName)){
            this.wsNewConnexion(socketName,'wss://ws-api.binance.com:443/ws-api/v3')
            this.socketList[socketName].on('connect',(connection) => {
                console.log("CONNECTION");
                connection.on('message',(msg) => {
                    console.log(msg);
                    if (msg.type === 'utf8') {
                        let event = JSON.parse(msg.utf8Data);
                        if(typeof event.id !== 'undefined')
                            this.searchExecutionCheminByQueryId(event.id,event);
                    }      
                })
            })

            this.socketList[socketName].connect(this.socketList[socketName].urlCustom);
            
            
            return new Promise(async (resolve) => {
                await this.waitSocketState(socketName,'connected');
                resolve(true);
            });
        }
        
           
    },
    sendOrder(symbol,side,quantity,type){
        side = side.toUpperCase();
        let clientOrderId = Date.now() + Math.floor(Math.random() * 99999);
        let data = {symbol: symbol,side: side ,newClientOrderId : clientOrderId,type: 'MARKET'};
        if(type == "quote") 
            data.quoteOrderQty = quantity;
        else
            data.quantity = quantity;

        let query = this.wsMsgBuilder('order.place',data,true); 
        
        this.socketList['convertCoin'].sendData(query);
        return JSON.parse(query);
    },
    sendLimitOrder(symbol,price,side,quantity,timeInForce){
        side = side.toUpperCase();
        let clientOrderId = Date.now() + Math.floor(Math.random() * 99999);
        let data = {symbol: symbol,side: side ,newClientOrderId : clientOrderId,timeInForce: timeInForce,type: 'LIMIT'};
        data.quantity = quantity;
        data.price = price;
        let query = this.wsMsgBuilder('order.place',data,true); 
        this.socketList['convertCoin'].sendData(query);
        return JSON.parse(query);
    },
    cancelOrder(symbol,clientOrderId){
        let data = {origClientOrderId: clientOrderId,symbol: symbol};
        let query = this.wsMsgBuilder('order.cancel',data,true);
        this.socketList['convertCoin'].sendData(query);
        return JSON.parse(query);
    },
    queryOrderStatus(symbol,orderId){
        let query = this.wsMsgBuilder('order.status',{origClientOrderId: orderId,symbol: symbol},true);
        this.socketList['convertCoin'].sendData(query);
        return JSON.parse(query);
    },
    isSocketConnexionExist(name){
        if(this.socketList.hasOwnProperty(name)){
            if(!Utility.isNotNullOrUndefined(this.socketList[name]))
                    return false;
            else
                    return true;
        }
    },
    exchangeFormatCoin(coin){
        return coin.toUpperCase();
    },
    async exchangeInfoSync(){
        const maxTry = 2;
        let retry = 0;
        while(retry < maxTry){
            try{
                const result = await this.getExchangeInfo();
                return result;
            }
            catch(error){
                console.log(error)
                retry++;
            }
        }
        return false;
    },

    
    setSide(miseDevise,base,quote) {
            if(miseDevise == base)
                    return 'sell';
            if(miseDevise == quote)
                    return 'buy';
    },
    setNextCoin(miseDevise,base,quote){
        if(miseDevise == base)
            return quote;
        if(miseDevise == quote)
            return base;
    },
    getFilterInformation(infoPairFilters,nameFilter,filterProp){
            for(let element in infoPairFilters){
                element = infoPairFilters[element];
                if(element.filterType == nameFilter)
                    return element[filterProp];
            }
            console.log("[getFilterInformation] : " + nameFilter+"."+filterProp+ " non trouvé");
            throw new Error();
    },
    async sortPairInfo(){
        return new Promise((resolve) => {
            api.exchangeInfoSync().then(async (any) => {
                if(any){
                    const result = Utility.jsonDecode(any);
                    const pairTrier = {};
                    
                    if(result.symbols != null){

                        // ETAPE 1 on trie les paires
                        for(let pair in result.symbols){
                            let tmp = result.symbols[pair];
                            if(config.cryptoList.includes(tmp.quoteAsset) && config.cryptoList.includes(tmp.baseAsset) && tmp.isSpotTradingAllowed == true){
                                pairTrier[tmp.symbol] = {
                                    baseAsset : tmp.baseAsset,
                                    quoteAsset : tmp.quoteAsset,
                                    stepSize : this.getFilterInformation(tmp.filters,'LOT_SIZE','stepSize'),
                                    tickSize : this.getFilterInformation(tmp.filters,'PRICE_FILTER','tickSize')
                                }
                            }
                        }

                        api.pairInfo = pairTrier;
                                   
                        
                        let tmpListCoin = {};
                        for(let coin of config.cryptoList){
                            
                            
                            for(let coin2 of config.cryptoList){
                            
                                if(coin != coin2 && (pairTrier.hasOwnProperty(coin+coin2))){
                                    this.pairList[coin+coin2] = {base:coin,quote:coin2,lastUpdateTime:99999};                               
                                }
                                
                                if(coin != coin2 && (pairTrier.hasOwnProperty(coin2+coin))){
                                    this.pairList[coin2+coin] = {base:coin2,quote:coin,lastUpdateTime:99999};
                                }
                            }

                           
                        }
                        await this.setFeeToPairInfo();
                        this.clearPairList();
                        return resolve(true);
                    }
                    else{
                        console.log("Erreur lors de la création de combinaison");
                        return resolve(false);
                    }
                }
            })
        });
    },
    createCheminForCombinaison(base,quote,currentCoin){
            return {
                pair: base+quote,
                base: base,
                quote: quote,
                side: this.setSide(currentCoin,base,quote),
                nextCoin: this.setNextCoin(currentCoin,base,quote),
                coinBefore: currentCoin,
                miseBefore: null,
                coinAfter: this.setNextCoin(currentCoin,base,quote),
                miseAfter: null,
                query: null,
                queryResult: null,
                price:null,
            };
    },
    extractCoinListInPairList(coin){
        let pairs = [];
        for (const key in this.pairList) {
            const pair = this.pairList[key];
            if (pair.base === coin) {
              pairs.push(pair.quote);
            } else if (pair.quote === coin) {
              pairs.push(pair.base);
            }
          }

        return pairs;
          
    },
    isCoinExistInPairList(coin,coin2){
        if(this.pairList[coin+coin2] != null)
            return this.pairList[coin+coin2];

        else if(this.pairList[coin2+coin] != null)
            return this.pairList[coin2+coin];
            
        else return false;
    },
    lastKeyOfArray(myArray){
        return myArray.length-1;
    },
    lastValueOfArray(myArray){
        return myArray[this.lastKeyOfArray(myArray)];
    },
    createIntermediateCheminsFromCombinaison(combinaison,blacklist = []){
        let tmpComb;
        let tmpAllCombinaisons = [];
        let lastChemin = this.lastValueOfArray(combinaison);
        for(let coin of this.extractCoinListInPairList(lastChemin.nextCoin)){
            pair = this.isCoinExistInPairList(lastChemin.nextCoin,coin);
            if(!blacklist.includes(coin) && pair){
                tmpComb = [...combinaison];
                tmpComb.push(this.createCheminForCombinaison(pair.base,pair.quote,lastChemin.nextCoin));
                tmpAllCombinaisons.push(tmpComb);
            }
        }
        return tmpAllCombinaisons;
    },
    createEndCheminForCombinaison(combinaison){
        let lastChemin = this.lastValueOfArray(combinaison);
        let pair = this.isCoinExistInPairList(lastChemin.nextCoin,config.cryptoDepart.cryptoDepartList[0]);
        if(pair)
            return this.createCheminForCombinaison(pair.base,pair.quote,lastChemin.nextCoin);
        else
            return false;
    },
    clearPairList(){
        for(let key in this.pairList){
            if(Number(this.pairInfo[key].fee) != 0){
                delete this.pairList[key];
                delete this.pairInfo[key];
            }
        }
    },
    async makePairCombinaison(){
        return new Promise(async (resolve) => {
                   await this.sortPairInfo().then((result) => {
                        if(result){
                            console.log('Création de la liste des pairs en cours ...');
                            let tmpListCombinaisons = [];

                            // On crée l'étape de départ puis on crée les sous étapes intermédiaires
                            for(let coinDepart of config.cryptoDepart.cryptoDepartList){
                                let tmpCoinWithDepart = this.extractCoinListInPairList(coinDepart);
                                for(let coin2 of tmpCoinWithDepart){
                                    let pair = this.isCoinExistInPairList(coinDepart,coin2);
                                    if(pair){
                                        /****POUR LES TEST****/
                                        if((pair.base+pair.quote) != "BTCTUSD")
                                            continue;
                                        /****POUR LES TEST****/

                                        let combinaison = this.createCheminForCombinaison(pair.base,pair.quote,coinDepart);
                                        combinaison.miseBefore = config.cryptoDepart.cryptoDepartMise[coinDepart];
                                        tmpListCombinaisons.push([combinaison]);
                                        
                                      /*  let combinaison = this.createCheminForCombinaison(pair.base,pair.quote,coinDepart);
                                        let listSubCombinaisons = this.createIntermediateCheminsFromCombinaison([combinaison],[coinDepart]);
                                        tmpListCombinaisons = tmpListCombinaisons.concat(listSubCombinaisons);*/
                                    }
                                }
                            }

                            
                            // On crée l'étape finale
                            for(let key in tmpListCombinaisons)
                                tmpListCombinaisons[key].push(this.createEndCheminForCombinaison(tmpListCombinaisons[key]));
                                                 
                            this.listCombinaisons = tmpListCombinaisons;
                            // On crée étape dernière (qui sera tjr aussi cryptoDepart)
                            console.log('Création de la liste des pairs terminé');
                            return resolve(true);
                        }
                   });

                     
        });
    },

}



module.exports = {api};