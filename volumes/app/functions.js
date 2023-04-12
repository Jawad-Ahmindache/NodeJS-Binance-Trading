const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const { connection } = require('websocket');

  

const utility = {

    calculateMedian: function(tableau) {
        const count = arr.length; //total numbers in array
        const middleval = Math.floor((count - 1) / 2); // find the middle value, or the lowest middle value
        if (count % 2) { // odd number, middle is the median
          return arr[middleval];
        } else { // even number, calculate avg of 2 medians
          const low = arr[middleval];
          const high = arr[middleval + 1];
          return (low + high) / 2;
        }
    },
    sortObjAlphabet(obj) {
        // Récupération des clés de l'objet dans un tableau
        const keys = Object.keys(obj);
      
        // Tri du tableau en utilisant une fonction de comparaison qui compare les chaînes de caractères de manière alphabétique
        keys.sort((a, b) => a.localeCompare(b));
      
        // Création d'un nouvel objet vide
        const sortedObj = {};
      
        // Ajout des propriétés triées à l'objet vide
        keys.forEach(key => {
          sortedObj[key] = obj[key];
        });
      
        return sortedObj
    },
    jsonDecode: function(resultat){
        try {
            resultat = JSON.parse(resultat);
        } catch (e) {
            resultat = JSON.stringify(resultat);
        }
        return resultat;
    },

    prettyPrint: function(variable){
        return "<pre>"+JSON.stringify(variable,null,5)+"<pre>";
    },
    /**
     * Si la valeur est positive ont est en hausse par rapport à la valeur initiale, si négatif on est en baisse
     */
    ecartPrix: function(valeurInitiale,valeurFinale){
        return valeurFinale - valeurInitiale;
    },
    ecartPercent: function(valeurInitiale,valeurFinale){
        valeurInitiale = Number(valeurInitiale);
        valeurFinale = Number(valeurFinale);   
        
        if(valeurInitiale == 0)
                return 0;
                
            return ((valeurFinale - valeurInitiale) / valeurInitiale) * 100;
    },
    calculStepSize: function(qty, stepSize) {
              // Integers do not require rounding
              if ( Number.isInteger( qty ) ) return qty;
              const qtyString = parseFloat( qty ).toFixed( 16 );
              const desiredDecimals = Math.max( stepSize.indexOf( '1' ) - 1, 0 );
              const decimalIndex = qtyString.indexOf( '.' );
              return parseFloat( qtyString.slice( 0, decimalIndex + desiredDecimals + 1 ) );
    },
    convertMise: function(montantMise,price,miseDevise,pairRole){
        
        if(miseDevise == pairRole.base){
            return Number(montantMise) * Number(price);
        }
        else if (miseDevise == pairRole.quote){
            return Number(montantMise) / Number(price);
        }
        else{
              return 0; // si y'a un soucis la mise sera à 0
        }
    },
    calculFees: function(montantMise,fees){
        return montantMise - ( montantMise * fees);
    },
    sleep(ms) {
        return new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
    },  
    formatedDate(){
        let toString = function(number, padLength) {
            return number.toString().padStart(padLength, '0');
        }
        
        let date = new Date();
        
        let dateTimeNow =
                         toString( date.getFullYear(),     4 )
                + '-'  + toString( date.getMonth() + 1,    2 )
                + '-'  + toString( date.getDate(),         2 )
                + ' ' + toString( date.getHours(),        2 )
                + ':'  + toString( date.getMinutes(),      2 )
                + ':'  + toString( date.getSeconds(),      2 )

        return dateTimeNow;
    },
    convertMiseForCalcLiquidity: function(montantMise,price,miseDevise,pairRole){
        
        if(miseDevise == pairRole.base){
            return Number(montantMise) * Number(price);
        }
        else if (miseDevise == pairRole.quote){
            return Number(montantMise);
        }
        else{
              return 999999999999999; // si y'a un soucis la mise sera à 0
        }
    },
 
    convertMiseForOrder: function(montantMise,price,miseDevise,pairRole){
        
        if(miseDevise == pairRole.base){
            return Number(montantMise);
        }
        else if (miseDevise == pairRole.quote){
            return Number(montantMise)/Number(price);
        }
        else{
              return 999999999999999; // si y'a un soucis la mise sera à 0
        }
    },
    isNotNullOrUndefined(val){
        if(val == 'undefined' || val == null )
            return false;
        else
            return true;
    },
    connMaker(){
        let connection = mysql.createConnection({
            host: "mariadb",
            user: "root",
            password: "zQ6JvdXQL%E7hyO15684jnSJA*MIJVZfB7mf#qWFNsRHB@Aoxl",
            database: "bot_triangle_market_node"
        });
    
        // reconnect when disconnected
        connection.on('error', function(err) {
            if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                console.log('reconnecting lost connection: ' + err.stack);
                handleDisconnect();
            } else {
                throw err;
            }
        });
        
        return connection;
    },
    resultScanDB(info,con) {
        con.ping(function(err) {
            if(!err){
                let sql = `SELECT * FROM detection_scan WHERE pairChemins = "${info.pairChemins}" ORDER BY timestamp DESC LIMIT 1`;
                con.query(sql, function (err, result) {
                  if (err) throw err;
                  if (result.length === 0) {
                    utility.insertResultScan(info,con);
                  } else if (info.timestamp - result[0].timestamp > 90000) {
                    utility.insertResultScan(info,con);
                  } else {
                    utility.updateResultScan(info, result[0].id,con);
                  }
                });
            }
        })
        
            
        
    },
    updateResultScan(info, id,con) {
        let sql = `UPDATE detection_scan SET date = "${info.date}", timestamp = "${info.timestamp}", pairChemins = "${info.pairChemins}", miseDepart = ${info.miseDepart}, miseFinale = ${info.miseFinale}, gainPercent = ${info.gainPercent}, gainDevise = "${info.gainDevise}", gainPrix = ${info.gainPrix}, liqE1 = ${info.liqE1}, liqE2 = ${info.liqE2}, liqE3 = ${info.liqE3}`;
        if (info.gainPercent >= info.most_high_price) {
          sql += `, most_high_price = ${info.gainPercent}, mh_price_date = "${info.date}"`;
        }
        sql += ` WHERE id = ${id}`;
        con.query(sql, function (err, result) {
          if (err) throw err;
        //  console.log(result.affectedRows + " record(s) updated");
        });
    },
    insertResultScan(info,con) {
        let sql = "INSERT INTO detection_scan (date, timestamp, pairChemins, miseDepart, miseFinale, gainPercent, gainDevise, gainPrix, liqE1, liqE2, liqE3, most_high_price, mh_price_date) VALUES ?";
        let values = [
          [info.date, info.timestamp, info.pairChemins, info.miseDepart, info.miseFinale, info.gainPercent, info.gainDevise, info.gainPrix, info.liqE1, info.liqE2, info.liqE3, info.gainPercent, info.date]
        ];
        con.query(sql, [values], function (err, result) {
          if (err) throw err;
       //   console.log("Number of records inserted: " + result.affectedRows);
        });
      },
    getFrenchDate() {
        const date = new Date();
        const year = date.getFullYear();
        const month = ("0" + (date.getMonth() + 1)).slice(-2);
        const day = ("0" + date.getDate()).slice(-2);
        const hours = ("0" + date.getHours()).slice(-2);
        const minutes = ("0" + date.getMinutes()).slice(-2);
        const seconds = ("0" + date.getSeconds()).slice(-2);

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      }
      
      

      
    

      
    
      

}

module.exports = {utility};