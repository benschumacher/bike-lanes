
// This is your new function. To start, set the name and path on the left.
const EXIF = require('exif-js');
EXIF.debug = true;

const extName = require('ext-name');
const got = require('got');
const session = require('express-session');

exports.handler = function(context, event, callback) {
    let twiml = new Twilio.twiml.MessagingResponse();
    const { NumMedia, From: SenderNumber, MessageSid } = event;
    console.log("event = " + JSON.stringify(event));
    console.log("Got message with " + NumMedia + " attachments.");
    
    if (NumMedia != 1) {
        twiml.message("Please send a single message at a time.");
        return callback(null, twiml);
    }
    
    const mediaUrl = event.MediaUrl0;
    console.log(`mediaUrl = ${mediaUrl}`);
    
    got(mediaUrl).buffer().then(image => {
        console.log(`image size = ${image.length}`);
        EXIF.readFromBinaryFile(image.buffer, function() {
            console.log(JSON.stringify(this));
    		if (EXIF.getTag(this, "GPSLatitude")) {
    			var lat_deg = EXIF.getTag(this, "GPSLatitude")[0];
    			var lat_min = EXIF.getTag(this, "GPSLatitude")[1];
    			var lat_sec = EXIF.getTag(this, "GPSLatitude")[2];
    			var lng_deg = EXIF.getTag(this, "GPSLongitude")[0];
    			var lng_min = EXIF.getTag(this, "GPSLongitude")[1];
    			var lng_sec = EXIF.getTag(this, "GPSLongitude")[2];
    			var gps_lat = (lat_deg+(((lat_min*60)+lat_sec))/3600); //DMS to decimal
                var gps_lng = -(lng_deg+(((lng_min*60)+lng_sec))/3600); //DMS to decimal
            }
            else {
                console.log("no EXIF data on media");
            }
    
    		if (EXIF.getTag(this, "DateTimeOriginal")) {
    			var capturetime = EXIF.getTag(this, "DateTimeOriginal");
    			var isotime = capturetime.split(" ")[1].split(':')[0] + ':' + capturetime.split(" ")[1].split(':')[1] + ':00';
    			var isodate = capturetime.split(" ")[0].replace(/:/g,'-');
    			var iso_date_time = isodate + 'T' + isotime;
    			twiml.message('This image was captured at: ' + iso_date_time);
    			return callback(null, twiml);
    		}
        })
    }).catch(error => {
        console.log(`can't load image: ${error}`);
        return callback(error);
    });

    twiml.message("Couldn't process message, please try again later.");
    callback(null, twiml);
    // got('https://dog-api.kinduff.com/api/facts', {json: true}).then(response => {
    //     twiml.message(response.body.facts[0]);
    //     callback(null, twiml);
    // }).catch(error => {
    //     console.log(error);
    //     callback(error);
    // });
};
