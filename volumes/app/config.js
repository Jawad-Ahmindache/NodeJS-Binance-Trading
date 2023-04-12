const apiKey = {
    Binance: {
        key: "",
        secret: "",
        passphrase: null
    },
    Bybit: {
        key: "",
        secret: "",
        passphrase: null
    },
    Kucoin: {
        key: "",
        secret: "",
        passphrase: ""
    },
    Huobi: {
        key: "",
        secret: "",
        passphrase: null
    },
    
    Okex: {
        key: "",
        secret: "",
        passphrase: ""
    },
    
    Coinbase: {
        key: "",
        secret: "",
        passphrase: null
    },
    
    Bitfinex: {
        key: "",
        secret: "",
        passphrase: null
    }
}


const Status = {
    success: "ok",
    waiting: "wait",
    cancel: "cancel",
    p_filled: "partially filled",
    expired: "expired"
}
const EXECUTION_LIMITER = 1;
const EXECUTION_ERROR_LIMITER = 1;
const IS_EXECUTION_LIMITER_ENABLED = true;
const cryptoDepart = {
    cryptoDepartList : [/*'USDT','BUSD',*/'TUSD'],
    cryptoDepartMise : {
        USDT : 20,
        BUSD : 20,
        TUSD : 300
    }
}
const PRICE_MULTIPLIER = 1.0003;
const cryptoList = ['BTC','TUSD','BUSD','BNB','USDT','ETH','SOL','DOGE','XRP','BNB','LTC','MATIC','TRX','AVAX','ADA','DOT','SHIB','UNI','LINK','COSMO','XMR','EOS'];
const ORDERBOOK_EXPIRE_MILISECOND = 10000;
const exchangeSelected = 'Binance';
module.exports = {
    apiKey,
    Status,
    exchangeSelected,
    cryptoDepart,
    EXECUTION_LIMITER,
    IS_EXECUTION_LIMITER_ENABLED,
    EXECUTION_ERROR_LIMITER,
    ORDERBOOK_EXPIRE_MILISECOND,
    cryptoList,
    PRICE_MULTIPLIER
};