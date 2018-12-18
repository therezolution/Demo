"use strict"

const aws = require('aws-sdk')
const async = require('async')
const ses = new aws.SES({
    region: 'us-west-2'
});

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
            SendEmailToCDM(results, payload, callback);
        }
    });
};

//Build and send email.
function SendEmailToCDM(resultsFromAsyncParallel, draftData, next) {
    let useTestValues = (process.env.TEST_MODE && process.env.TEST_MODE === "true") ? true : false;
    const nodemailer = require('nodemailer');
    let transporter = nodemailer.createTransport({
        SES: ses
    });

    let apiDataObject = getData.ReturnAsyncParallelResultsAsObject(resultsFromAsyncParallel);

    let subject = "Quote Received for WA Client - "
        + apiDataObject.customerName + " - " + draftData.Type + " - " + draftData.ProjectID;
    let fromEmailAddress = process.env.WACLIENT_EMAIL_ADDRESS;
    let link = process.env.CSIL_BASE_URL + '/WAClient/Main#/WarehouseQuote/' + draftData.ProjectID;

    //build plain-text email body.
    let emailTextBodyMessage = `Please review and respond to the below quote from the warehouse at your earliest convenience.`
        + `\n\n`
        + `Project ID - ` + draftData.ProjectID
        + `\nCustomer Name - ` + apiDataObject.customerName
        + `\nWH Name - ` + apiDataObject.warehouseName
        + `\nProject Type - ` + draftData.Type
        + `\n\n`
        + `\nOpen the link below in Chrome to view and respond to the Warehouse Quote.`
        + `\n` + link
        + `\n\n*** This is an automatically generated email, please do not reply ***`;

    //build html email body.
    let emailHtmlBodyMessage = `<p>Please review and respond to the below quote from the warehouse at your earliest convenience.</p>`
        + `<p>Project ID - ` + draftData.ProjectID
        + `<br>Customer Name - ` + apiDataObject.customerName
        + `<br>WH Name - ` + apiDataObject.warehouseName
        + `<br>Project Type - ` + draftData.Type
        + `</p><br>`
        + `<p>Open the link below in Chrome to view and respond to the Warehouse Quote.</p>`
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
