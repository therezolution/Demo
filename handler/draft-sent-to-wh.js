"use strict"
var pdf = require('html-pdf');
var fs = require('fs');
var ejs = require('ejs');

const aws = require('aws-sdk')
const async = require('async')
const request = require('request');
const ses = new aws.SES({
    region: 'us-west-2'
});
const { exec } = require('child_process');
const getData = require('../shared/get-data.js');

var apiDataObject = {};
var pdfFileLocation = process.env.PDF_FILE_LOCATION;
var pdfOptions = {
    height: '11in',
    width: '8.5in',
    base: process.env.PDF_BASE
};
if (process.env.NODE_ENV == "aws") {
    pdfOptions.phantomPath = '/tmp/phantomjs_lambda/phantomjs_linux-x86_64';
}

module.exports = (payload, callback) => {

    async.waterfall([
        function WhatEnvironment(next) {
            if (process.env.NODE_ENV == "aws") {
                if (!fs.existsSync(pdfOptions.phantomPath)) {
                    next(null, "Create Executable file");
                } else {
                    next("Executable file already exists, skip to callback", null);
                };
            } else {
                next("No need to create phantomjs file, skip to callback", null);
            }
        },
        function CopyPhantom(msg, next) {
            console.log(msg);
            var dir = '/tmp/phantomjs_lambda';
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            };
            exec('yes | cp phantomjs_lambda/phantomjs_linux-x86_64 ' + pdfOptions.phantomPath, (err, stdout, stderr) => {
                if (err) {
                    next(err, null);
                } else {
                    next(null, stdout);
                };
            });
        },
        function MakePhantomExecutable(msg, next) {
            console.log(msg);
            exec('chmod +x ' + pdfOptions.phantomPath, (err, stdout, stderr) => {
                exec('ls -l /tmp/phantomjs_lambda', (err, stdout, stderr) => {
                    if (err) {
                        next(err, null);
                    } else {
                        next(null, stdout);
                    };
                });
            });
        }
    ], function (msg, result) {
        msg ? console.log(msg) : console.log("Function execution completed.");
        async.parallel([
            async.apply(getData.GetCsilCustomerData, payload.CustomerID),
            async.apply(getData.GetCsilWarehouseData, payload.WarehouseID)
        ], function (err, results) {
            if (err) {
                callback(err);
            } else {
                GeneratePdfFile(results, payload, callback);
            }
        });
    });
};


/*
    Helper Functions
*/

function GetProjectAttachedDocuments(draftData, callback) {
    getData.GetProjectAttachedDocuments(draftData.ProjectID, "Project Details", function (err, results) {
        if (err) {
            callback(err);
        } else {
            draftData.attachedDocumentList = results;
            SendEmailToWh(draftData, callback);
        }
    });
}

//Build and send email.
function SendEmailToWh(draftData, next) {
    let useTestValues = (process.env.TEST_MODE && process.env.TEST_MODE === "true") ? true : false;
    const nodemailer = require('nodemailer');
    let transporter = nodemailer.createTransport({
        SES: ses
    });

    let attachments = [
        {
            filename: 'Project-' + draftData.ProjectID + '_Quote.pdf',
            path: pdfFileLocation,
            contentType: 'application/pdf'
        }
    ];

    let calls = [];

    draftData.attachedDocumentList.forEach(function (document) {
        calls.push(function (callback) {
            getData.GetProjectAttachedDocumentData(document.file_key, function (err, results) {
                if (err) {
                    callback(err);
                } else {
                    let itemToAttach = {
                        filename: document.file_name,
                        content: results
                    }
                    attachments.push(itemToAttach);
                    callback(null, attachments);
                }
            });
        })
    });

    async.parallel(calls, function (err, result) {
        /* this code will run after all calls finished the job or
        when any of the calls passes an error */
        if (err)
            return console.log(err);

        let subject = "Request Received for WA Client Quote - "
            + apiDataObject.customerName + " - " + draftData.Type + " - " + draftData.ProjectID;
        let fromEmailAddress = process.env.WACLIENT_EMAIL_ADDRESS;
        let link = process.env.CSIL_BASE_URL + '/WAClient/Main#/WarehouseQuote/' + draftData.ProjectID;

        //build plain-text email body.
        let emailTextBodyMessage = `Please review the following request and provide a quote at your earliest convenience.`
            + `\n\n`
            + `Project ID - ` + draftData.ProjectID
            + `\nCustomer Name - ` + apiDataObject.customerName
            + `\nWH Name - ` + apiDataObject.warehouseName
            + `\nProject Type - ` + draftData.Type
            + `\n\n`
            + `\nYou may either download the attached PDF and send a quote via email or you can open the link below in Chrome to view the request and generate the quote in CSIL.`
            + `\n` + link
            + `\n\n*** This is an automatically generated email, please do not reply ***`;

        transporter.sendMail({
            from: fromEmailAddress,
            to: useTestValues ? process.env.TEST_RECIPIENT : draftData.FormData.ProjectDetails.RecipientEmail,
            bcc: process.env.BCC_EMAIL,
            subject: subject,
            text: emailTextBodyMessage,
            attachments: attachments
        }, (err, info) => {
            if (!err) console.log('--EMAIL SENT--');
            next(err, info);
        });
    });
}


function GeneratePdfFile(resultsFromAsyncParallel, payload, callback) {

    // console.log("resultsFromAsyncParallel: " + JSON.stringify(resultsFromAsyncParallel));
    // console.log("payload: " + JSON.stringify(payload));

    apiDataObject = getData.ReturnAsyncParallelResultsAsObject(resultsFromAsyncParallel);

    let clientMaterials = [];
    let clientMaterialsHTML = '';
    let clientMaterialsSectionHTML = '';
    let custName = apiDataObject.customerName;
    let dueOrEnd = '';
    let dueOrEndDate = payload.FormData.ProjectBasics.DueDate;
    let materials = payload.FormData.ProjectDetails.Materials;
    let projectDescription = payload.FormData.ProjectDetails.ProjectNotes;
    let projectId = payload.ProjectID;
    let projectType = payload.Type;
    let startDate = payload.FormData.ProjectBasics.WHStartDate;
    let timeLineType = payload.FormData.ProjectBasics.TimeLineType;
    let whLocation = apiDataObject.warehouseName;
    let whMaterials = materials.filter(material => material.WhProvided);
    let whMaterialRatesDesc = [];
    let whMaterialRatesUOM = [];
    let whMaterialRatesQty = [];

    if (dueOrEndDate) {
        dueOrEndDate = new Date(dueOrEndDate);
        dueOrEndDate = ((dueOrEndDate.getMonth() + 1) + "/" + dueOrEndDate.getDate() + "/" + dueOrEndDate.getFullYear());
    }
    if (startDate) {
        startDate = new Date(startDate);
        startDate = ((startDate.getMonth() + 1) + "/" + startDate.getDate() + "/" + startDate.getFullYear());
    }

    clientMaterials = materials.filter(material => !material.WhProvided);
    dueOrEnd = timeLineType == 'Ongoing' ? "End" : "Due";
    clientMaterials.forEach(material => {
        clientMaterialsHTML = clientMaterialsHTML +
            `<div class="section-row">
            <div class="material-desc">` + material.Description + `</div>\n`;
        if (material.UOM) {
            clientMaterialsHTML = clientMaterialsHTML +
                `<div class="material-uom">` + material.UOM + `</div>
            <div class="material-qty text-right">` + material.Quantity + `</div>\n`;
        }
        clientMaterialsHTML = clientMaterialsHTML +
            `</div>`;
    });
    clientMaterialsSectionHTML = clientMaterialsHTML == '' ? '' :
        `<div class="section-header">
        <div class="section-icon">
            <img src="pallet-with-circle.svg" alt="info">
        </div>
        <div class="section-title">
            Client-Provided Materials
            <div class="section-title-spacer-page-1"> </div>
        </div>
    </div>
    <div class="section-line"></div>
    <div class="section-content">
        <p>` + custName + ` is providing the following project materials:</p>
        <div class="section-row">
            <div class="material-desc material-header">Description</div>
            <div class="material-uom material-header">UOM</div>
            <div class="material-qty material-header text-right">Quantity</div>
        </div>`
        + clientMaterialsHTML +
        `</div>`;

    for (let i = 0; i < 4; i++) {
        whMaterialRatesDesc.push(whMaterials[i] ? `<div class="rate-details-desc-with-data  underLined">` + whMaterials[i].Description + `</div>` : `<div class="rate-details-desc underLined">&nbsp;</div>`);
        whMaterialRatesUOM.push(whMaterials[i] && whMaterials[i].UOM ? `<div class="formInfo underLined">` + whMaterials[i].UOM + `</div>` : `<div class="formInfo underLined">&nbsp;</div>`);
        whMaterialRatesQty.push(whMaterials[i] && whMaterials[i].Quantity ? `<div class="formInfo underLined">` + whMaterials[i].Quantity + `</div>` : `<div class="formInfo underLined">&nbsp;</div>`);
    }

    var compiled = ejs.compile(fs.readFileSync('./src/template.html', 'utf8'));
    var html = compiled({
        custName: custName,
        clientMaterialsHTML: clientMaterialsHTML,
        clientMaterialsSectionHTML: clientMaterialsSectionHTML,
        dueOrEnd: dueOrEnd,
        dueOrEndDate: dueOrEndDate,
        projectDescription: projectDescription,
        projectId: projectId,
        projectType: projectType,
        startDate: startDate,
        timeLineType: timeLineType,
        whLocation: whLocation,
        whMaterialRatesDesc: whMaterialRatesDesc,
        whMaterialRatesUOM: whMaterialRatesUOM,
        whMaterialRatesQty: whMaterialRatesQty
    });

    pdf.create(html, pdfOptions).toFile(pdfFileLocation, function (err, res) {
        if (err) {
            console.log(err);
            callback(err, null);
        } else {
            console.log(res);
            fs.readFile(pdfFileLocation, 'base64', (err, data) => {
                if (err) {
                    console.log(err);
                    callback(err, null);
                } else {
                    GetProjectAttachedDocuments(payload, callback);
                }
            });
        }
    });
}


