const https = require("https");
const fs = require("fs");
const express = require("express");
const config = require('./config.js');

const api = require('./api/'+config.exchangeSelected+'.js');
const util = require('./functions.js');

// Instantiate an Express application
const app = express();

require("./index.js");
// test combinaison
app.get('/a', (req, res) => {
  api.api.makePairCombinaison().then((value) => {
      res.send(util.utility.prettyPrint(value));  
  })

})

// test tradeFee
app.get('/b', (req, res) => {
  api.api.getTradeFee().then((value) => {
      res.send(util.utility.prettyPrint(value));  
  })

})
// test tradeFee
app.get('/orderbook', (req, res) => {
  let code = `<script>function test() { let data = JSON.parse(document.querySelector('pre').innerHTML);let html = '<div>';// Génération du tableau des enchèreshtml += '<table style="display: inline-block"><tr><th>Prix</th><th>Quantité</th></tr>';data.bids.forEach(function(bid) {  html += '<tr style="color: green"><td>' + bid[0] + '</td><td>' + bid[1] + '</td></tr>';});html += '</table>';// Génération du tableau des demandeshtml += '<table style="display: inline-block"><tr><th>Prix</th><th>Quantité</th></tr>';data.asks.forEach(function(ask) {  html += '<tr style="color: red"><td>' + ask[0] + '</td><td>' + ask[1] + '</td></tr>';});html += '</table></div>';document.body.innerHTML = html;}</script>`;
  api.api.getTradeFee().then((value) => {
      res.send("<pre>"+fs.readFileSync('./orderbook.txt',
      {encoding:'utf8', flag:'r'})+"</pre>"+code);  
  })

})
https
  .createServer(
  {
    key: fs.readFileSync("/etc/ssl_cert/key.pem"),
    cert: fs.readFileSync("/etc/ssl_cert/cert.pem"),
  },
  app
)
  .listen(443, ()=>{
    console.log('server is runing at port 443')
  });

