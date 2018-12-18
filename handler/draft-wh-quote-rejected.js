"use strict"

const aws = require('aws-sdk')
const async = require('async')
const ses = new aws.SES({
    region: 'us-west-2'
});

const getData = require('../shared/get-data.js');

module.exports = (payload, callback) => {
    console.log("payload: " + JSON.stringify(payload));
    async.parallel([
        async.apply(getData.GetCsilCustomerData, payload.CustomerID),
        async.apply(getData.GetCsilWarehouseData, payload.WarehouseID),
    ], function (err, results) {
        if (err) {
            callback(err);
        } else {
            SendEmailToWh(results, payload, callback);
        }
    });
};

//Build and send email.
function SendEmailToWh(resultsFromAsyncParallel, draftData, next) {
    let useTestValues = (process.env.TEST_MODE && process.env.TEST_MODE === "true") ? true : false;
    const nodemailer = require('nodemailer');
    let transporter = nodemailer.createTransport({
        SES: ses
    });

    let apiDataObject = getData.ReturnAsyncParallelResultsAsObject(resultsFromAsyncParallel);

    let subject = "Action Needed for WA Client - "
        + apiDataObject.customerName + " - " + draftData.Type + " - " + draftData.ProjectID;
    let fromEmailAddress = process.env.WACLIENT_EMAIL_ADDRESS;
    let link = process.env.CSIL_BASE_URL + '/WAClient/Main#/WarehouseQuote/' + draftData.ProjectID;
    let lastPushBackExplanation = getData.ReturnMostRecentPushbackReason(draftData.FormData.WarehouseQuote.PushBackExplanations);

    //build plain-text email body.
    let emailTextBodyMessage = `Please review and respond to the below comment from WAClient at your earliest convenience.`
        + `\n\n`
        + `Project ID - ` + draftData.ProjectID
        + `\nCustomer Name - ` + apiDataObject.customerName
        + `\nWH Name - ` + apiDataObject.warehouseName
        + `\nProject Type - ` + draftData.Type
        + `\n`
        + `\n` + lastPushBackExplanation
        + `\n`
        + `\nOpen the link below in Chrome to view and respond to the comment from WAClient`
        + `\n` + link
        + `\n\n*** This is an automatically generated email, please do not reply ***`;


    transporter.sendMail({
        from: fromEmailAddress,
        to: useTestValues ? process.env.TEST_RECIPIENT : draftData.FormData.ProjectDetails.RecipientEmail,
        bcc: process.env.BCC_EMAIL,
        subject: subject,
        text: emailTextBodyMessage
    }, (err, info) => {
        if (!err) console.log('--EMAIL SENT--');
        next(err, info);
    });
}
