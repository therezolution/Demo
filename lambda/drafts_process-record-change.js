//For Debugging
if (process.env.NODE_ENV == "development") {
    var ctx = {};
    var event = {
        "CreatedOn": 1530552076418,
        "ProjectID": "1530645155059",
        "ModifiedOn": 1530558673391,
        "Status": "Request Rejected",
        "WarehouseID": 73,
        "FormData": {
            "WarehouseQuote": {
                "PushBackExplanations": [
                    {
                        "Timestamp": 1530557815105,
                        "Explanation": "PUSH BACK Test 1"
                    },
                    {
                        "Timestamp": 1530558345196,
                        "Explanation": "Push back Test 2"
                    },
                    {
                        "Timestamp": 1530558673391,
                        "Explanation": "Push Back Test 3"
                    }
                ],
                "MaterialRates": [],
                "GeneralRates": [],
                "LaborRates": []
            },
            "ProjectBasics": {
                "TimeLineType": "One-time"
            },
            "ProjectDetails": {
                "Products": [
                    {
                        "LotCode": "10",
                        "Quantity": 10,
                        "SKU": "00200",
                        "UnitType": "Cases"
                    }
                ],
                "ProjectNotes": "Text Area Test",
                "RecipientEmail": "reza@webangeles.com",
                "Materials": []
            }
        },
        "Type": "Kit Assembly",
        "CustomerID": 25793
    }
}

"use strict"

const aws = require('aws-sdk');
const async = require('async');

const event_handler_map = {
    'Request Rejected': require('../handler/draft-request-rejected'),
    'WH Quote Received': require('../handler/draft-wh-quote-received'),
    'Sent to WH': require('../handler/draft-sent-to-wh'),
    'WH Quote Rejected': require('../handler/draft-wh-quote-rejected')
};

exports.handler = (event, context, callback) => {

    if (event && event.Status) {
        var Handler = event_handler_map[event.Status];
        if (Handler) {
            Handler(event, callback);
        } else {
            let message = "No action needed for status " + event.Status + "."
            console.log(message);
            callback(null, message);
        }
    } else {
        callback("No event status found.");
    }
}

//Debugging.
if (process.env.NODE_ENV == "development") {
    exports.handler(event, ctx, function () { });
}
