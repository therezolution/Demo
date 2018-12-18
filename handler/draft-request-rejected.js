"use strict"

const aws = require('aws-sdk')
const async = require('async')
const request = require('request');
const ses = new aws.SES({
    region: 'us-west-2'
});

//retry options for API requests.
const retryOptions = {
    times: 5,
    interval: function (retryCount) {
        return 200 * Math.pow(2, retryCount);
    }
};

const getData = require('../shared/get-data.js');

module.exports = (payload, callback) => {
    async.parallel([
        async.apply(getData.GetCsilCustomerContactData, payload.CustomerID),
        async.apply(getData.GetCsilCustomerData, payload.CustomerID),
        async.apply(getData.GetCsilWarehouseData, payload.WarehouseID),
    ], function (err, results) {
        if (err) {
            callback(err);
        } else {
            SendEmailToCdm(results, payload, callback);
        }
    });
};

//Build and send email.
function SendEmailToCdm(resultsFromAsyncParallel, draftData, next) {
    let useTestValues = (process.env.TEST_MODE && process.env.TEST_MODE === "true") ? true : false;
    const nodemailer = require('nodemailer');
    let transporter = nodemailer.createTransport({
        SES: ses
    });

    let apiDataObject = getData.ReturnAsyncParallelResultsAsObject(resultsFromAsyncParallel);
    let pushBackReason = getData.ReturnMostRecentPushbackReason(draftData.FormData.WarehouseQuote.PushBackExplanations);

    let subject = "Action Needed for WA Client - "
        + apiDataObject.customerName + " - " + draftData.Type + " - " + draftData.ProjectID;
    let fromEmailAddress = process.env.WACLIENT_EMAIL_ADDRESS;
    let link = process.env.CSIL_BASE_URL + '/WAClient/Main#/WarehouseQuote/' + draftData.ProjectID;

    //build plain-text email body.
    let emailTextBodyMessage = `Please review the comment below from the warehouse and respond at your earliest convenience.`
        + `\n\n`
        + `Project ID - ` + draftData.ProjectID
        + `\nCustomer Name - ` + apiDataObject.customerName
        + `\nWH Name - ` + apiDataObject.warehouseName
        + `\nProject Type - ` + draftData.Type
        + `\n`
        + `\nWH Comment: ` + pushBackReason
        + `\n\n`
        + `\nVisit the page below in Google Chrome to Respond to the Warehouse's request.`
        + `\n` + link
        + `\n\n*** This is an automatically generated email, please do not reply ***`;

    //build html email body.
    let emailHtmlBodyMessage = `<p>Please review the comment below from the warehouse and respond at your earliest convenience.</p>`
        + `<p>Project ID - ` + draftData.ProjectID
        + `<br>Customer Name - ` + apiDataObject.customerName
        + `<br>WH Name - ` + apiDataObject.warehouseName
        + `<br>Project Type - ` + draftData.Type
        + `</p>`
        + `<p>WH Comment: ` + pushBackReason
        + `</p><br>`
        + `<p>Follow the link below in Google Chrome to Respond to the Warehouse's request.</p>`
        + `<p><a href="` + link + `">` + link + `</a></p>`
        + `<p>*** This is an automatically generated email, please do not reply ***</p>`;

    transporter.sendMail({
        from: fromEmailAddress,
        to: useTestValues ? process.env.TEST_RECIPIENT : apiDataObject.cdmEmail,
        bcc: process.env.BCC_EMAIL,
        subject: subject,
        text: emailTextBodyMessage,
        html: emailHtmlBodyMessage
    }, (err, info) => {
        if (!err) console.log('--EMAIL SENT--');
        next(err, info);
    });
}
