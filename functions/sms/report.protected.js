const assets = Runtime.getAssets();

// This is your new function. To start, set the name and path on the left.
// const EXIF = require('exif-js');
// EXIF.debug = true;

const firebase = require('firebase-admin');

const got = require('got');
const sha256 = require('crypto').createHash('sha256');
const db = require(assets['/lib/datastore.js'].path)

exports.handler = function(context, event, callback) {
    let twiml = new Twilio.twiml.MessagingResponse();
    const { NumMedia, From: SenderNumber, MessageSid } = event;

    const counterParty = sha256.update(SenderNumber).digest('base64').replace('+', '-').replace('/', '_').replace(/=+$/, '');
    const rootRef = db.ref();
    const userRef = db.ref(`phone-numbers/${counterParty}`);

    console.log("event = " + JSON.stringify(event));
    console.log("Got message with " + NumMedia + " attachments.");
    
    var user = {totalReports: 0};
    userRef.once("value").then((snapshot) => {
        console.log("snapshot.val() = " + snapshot.val())
        user = snapshot.val() || user;        
    });

    if (NumMedia > 1) {
        twiml.message("Please send a single image at a time.");
        return callback(null, twiml);
    }

    if (user.lastOpenReport && 0 == NumMedia) {
        var location = event.message;
        console.log("location = ${location}");
        twiml.message("Thank you for your report!");
        return callback(null, twiml);
    }
    
    const mediaUrl = event.MediaUrl0;
    console.log(`mediaUrl = ${mediaUrl}`);
    
    got(mediaUrl).buffer().then(image => {
        console.log(`image size = ${image.length}`);
    }).catch(error => {
        console.log(`can't load image: ${error}`);
        return callback(error);
    });

    const newMediaKey = rootRef.child('media').push().key;
    const newReportKey = rootRef.child('reports').push().key;
    var updates = {};
    updates[`/media/${newMediaKey}`] = {mediaUrl: mediaUrl, dimensions: {}};
    updates[`/reports/${newReportKey}`] = {media: newMediaKey, reporter: counterParty, loction: {}}
    updates[`/phone-numbers/${counterParty}`] = {
        lastOpenReport: newReportKey,
        totalReports: firebase.database.ServerValue.increment(1)
    };
    rootRef.update(updates);

    twiml.message("Thank you. Will you share your location?");
    callback(null, twiml);
    // got('https://dog-api.kinduff.com/api/facts', {json: true}).then(response => {
    //     twiml.message(response.body.facts[0]);
    //     callback(null, twiml);
    // }).catch(error => {
    //     console.log(error);
    //     callback(error);
    // });
};
