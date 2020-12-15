const assets = Runtime.getAssets();
const firebase = require('firebase-admin');

const serviceAccount = require(assets['/secrets/firebase-key.json'].path);

if (!firebase.apps.length) {
    firebase.initializeApp({
        credential: firebase.credential.cert(serviceAccount),
        databaseURL: "https://bike-lanes-21bdd-default-rtdb.firebaseio.com/"
    });
}

const datastore = firebase.database();

module.exports = datastore;
