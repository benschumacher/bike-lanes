const assets = Runtime.getAssets();

//const got = require('got');
const crypto = require('crypto');
const firebase = require('firebase-admin');
const got = require('got');

let encodeFrom = function(number) {
    const sha256 = crypto.Hash('sha256');
    var b64h = sha256.update(number).digest('base64');
    return b64h.replace('+', '-').replace('/', '_').replace(/=+$/, '');
};

exports.handler = async function(context, event, callback) {
    let twiml = new Twilio.twiml.MessagingResponse();
    const { NumMedia, From: SenderNumber, MessageSid } = event;
    const { Body: MessageBody, MediaContentType0: ContentType } = event;
    if (!SenderNumber) {
        return;
    }
    console.log(`msgid = ${MessageSid}, begin`);

    const counterParty = encodeFrom(SenderNumber);

    if (1 < NumMedia) {
        console.log(`msgid = ${MessageSid}, done.`);

        twiml.message("Please send a single image at a time.");
        callback(null, twiml);
        return;
    }
    else if (0 < NumMedia) {
        // acceptable media types
        const acceptTypes = [ 'image/jpeg' ];
        if (!acceptTypes.includes(ContentType)) {
            console.log(`Unknown media type = ${ContentType}`);
            console.log(`msgid = ${MessageSid}, done.`);

            twiml.message(`Unknown media type, '${ContentType}'. Please send a picture of the obstruction as a JPEG.`);
            callback(null, twiml);
            return;
        };
    }

    let userLoad = User.load(counterParty);

    var [ user ] = await Promise.all([ userLoad ]);
    console.log("user = %s, className = %s", JSON.stringify(user), user.constructor.name);
    if (!user.totalReports) {
        console.log(`user = ${counterParty} has no reports`);
    }
    else {
        console.log(`msgid = ${MessageSid}, user = ${counterParty} has ${user.totalReports} reports`);
    }

    if (user.openReport) {
        var report = await Report.load(user.openReport);
        if (report && 1 == NumMedia) {
            await report.tombstone();
        }
        if (0 == NumMedia) {
            console.log(`user = ${counterParty} has completed a report`);
            await user.completeReport(report, MessageBody).then((error) => {
                console.log(`msgid = ${MessageSid}, done.`);
                twiml.message(`Thank you. Your report has been saved.`);
                callback(null, twiml);
            });
            return;
        }
    }

    if (1 == NumMedia) {
        let mediaUrl = event.MediaUrl0;
        let ops = [];
        ops.push(user.createReport(mediaUrl, ContentType, MessageBody));
        return Promise.all(ops).then(() => {
            console.log(`msgid = ${MessageSid}, done.`);
            if (!MessageBody) {
                twiml.message('Thank you! Can you share the location where you took this photo?');
            }
            else {
                twiml.message(`Thank you. Your report has been saved.`);
            }
            callback(null, twiml);
        });
    }

    console.log(`msgid = ${MessageSid}, done.`);
    twiml.message(  'Welcome to the Things in Bike Lanes App. '
                + 'To use this service, please share a picture '
                + 'of an obstructed bike lane.')
    callback(null, twiml);
};

// class-y things?
if (!firebase.apps.length) {
    const fs = require('fs');
    const serviceAccount = JSON.parse(fs.readFileSync(assets['/firebase-key.json'].path));
    firebase.initializeApp({
        credential: firebase.credential.cert(serviceAccount),
        databaseURL: "https://bike-lanes-21bdd-default-rtdb.firebaseio.com/"
    });
}

const hydrateFunc = function(data) {
    for (var propName in data) {
        //console.log(`${this.constructor.name}, propName=${propName}, value=${data[propName]}`);
        this[propName] = data[propName];
    }
};

const loadStaticFunc = async function(id) {
    const className = this.name;
    let obj = eval(`new ${className}(id);`);

    let ref = obj.ref;
    return ref.once('value').then((snapshot) => {
        var data = snapshot.val();
        obj.hydrate(data);
        return obj;
    }).catch((error) => {
        console.log(`error loading ${className}(${id}): ${error}`);
    });
};

const Report = function(report_id) {
    this.report_id = report_id;
    this.ref = Report.datastore.ref(`reports/${this.report_id}`);
};
Report.datastore = firebase.database();
Report.load = loadStaticFunc;

Report.prototype.hydrate = hydrateFunc;
Report.prototype.addLocation = function(location) { 
    return this.ref.update({
        location: location,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
};
Report.prototype.tombstone = async function() {
    let ref = Report.datastore.ref();

    const newTombstoneKey = ref.child('tombstone').push().key;

    let updates = {};
    updates[`tombstones/${newTombstoneKey}`] = {
        report: this.report_id,
        markedAt: firebase.database.ServerValue.TIMESTAMP
    };
    return ref.update(updates);
};

const User = function(user_id) {
    this.user_id = user_id;
    this.ref = User.datastore.ref(`users/${user_id}`);
};
User.datastore = firebase.database();
User.load = loadStaticFunc;

User.prototype.createReport = async function(mediaUrl, contentType, messageBody) {
    let ref = User.datastore.ref();

    const newMediaKey = ref.child('media').push().key;
    const newReportKey = ref.child('reports').push().key;

    let updates = {};
    updates[`/media/${newMediaKey}`] = {
        mediaUrl: mediaUrl,
        contentType: contentType,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    updates[`/reports/${newReportKey}`] = {
        media: newMediaKey,
        reporter: this.user_id,
        location: messageBody || null,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    updates[`/users/${this.user_id}`] = {
        openReport: newReportKey, 
        totalReports: firebase.database.ServerValue.increment(1),
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (messageBody) {
        updates[`/users/${this.user_id}`].openReport = null;
    }

    return ref.update(updates);
}

User.prototype.completeReport = async function(report, msg, callback) {
    return Promise.all([
        report.addLocation(msg),
        this.ref.update({
            openReport: null,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        })
    ]);
}

User.prototype.hydrate = hydrateFunc;

