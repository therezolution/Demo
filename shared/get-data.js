const async = require('async');
const request = require('request');
const stream = require('stream')

let methods = {};

//retry options for API requests.
const retryOptions = {
    times: 5,
    interval: function (retryCount) {
        return 200 * Math.pow(2, retryCount);
    }
};

function requestUseErrStream(options, cb) {
    const response_stream = request(options).pipe(stream.PassThrough());
    cb(null, response_stream);
}

//Function to make a request and use the error for anything other than 200 response code.
function requestUseErr(options, cb) {
    request(options, (err, response, body) => {
        if (err) {
            console.log(err);
            cb(err);
        } else if (response.statusCode != 200) {
            cb(response);
        } else {
            cb(null, response, body);
        }
    });
}

methods.GetCsilCustomerContactData = function (customerId, callback) {
    let apiCallUrl = process.env.CSIL_API_BASE_URL + '/api/v1/customers/' + customerId + '/associatepersonnel/get';
    let options = {
        url: apiCallUrl,
        timeout: 5000, //5s timeout
        method: 'GET',
        json: true,
        headers: {
            'Authorization': 'Basic ' + process.env.CSIL_API_AUTH
        }
    };

    async.retry(retryOptions, async.apply(requestUseErr, options), function (error, response, body) {
        if (error) {
            callback(JSON.stringify(error), null);
        } else {
            let responseObject = body;
            let result = { cdmName: "", cdmEmail: "" };

            //API route returns an object.
            //Check that it has everything we need.
            if (responseObject && responseObject.cdmName && responseObject.cdmEmail) {
                result.cdmName = responseObject.cdmName;
                result.cdmEmail = responseObject.cdmEmail;

                callback(null, result);
            } else {
                callback('Unexpected response while trying to retrieve Customer Personnel data.', null);
            }
        }
    });
}

//Call CSIL API for Customer Name.
methods.GetCsilCustomerData = function (customerId, callback) {
    let apiCallUrl = process.env.CSIL_API_BASE_URL + '/api/v1/customers/get/' + customerId;
    let options = {
        url: apiCallUrl,
        timeout: 5000, //5s timeout
        method: 'GET',
        json: true,
        headers: {
            'Authorization': 'Basic ' + process.env.CSIL_API_AUTH
        }
    };

    async.retry(retryOptions, async.apply(requestUseErr, options), function (error, response, body) {
        if (error) {
            callback(JSON.stringify(error), null);
        } else {
            let responseObject = body;
            let result = { companyName: "" };

            //API route returns an array
            //Check that we only received 1 result when searching by ID.
            if (responseObject.length === 1) {
                result.companyName = responseObject[0].companyName;
            } else {
                callback('Unexpected response while trying to retrieve Customer Personnel data.', null);
            }
            callback(null, result);
        }
    });
}

//Call CSIL API for Warehouse name.
methods.GetCsilWarehouseData = function (warehouseId, callback) {
    let apiCallUrl = process.env.CSIL_API_BASE_URL + '/api/v1/warehouse/active';
    let options = {
        url: apiCallUrl,
        timeout: 5000, //5s timeout
        method: 'GET',
        json: true,
        headers: {
            'Authorization': 'Basic ' + process.env.CSIL_API_AUTH
        }
    };

    async.retry(retryOptions, async.apply(requestUseErr, options), function (error, response, body) {
        if (error) {
            callback(JSON.stringify(error), null);
        } else {
            let responseObject = body;
            let result = { whName: "" };

            //Iterate through array of warehouse objects & match by warehouse ID.
            if (responseObject.length > 0) {
                for (let i = 0; i < responseObject.length; i++) {
                    if (responseObject[i].warehouseID === warehouseId) {
                        result.whName = responseObject[i].warehouseName;
                        break;
                    }
                }
            } else {
                callback('Unexpected response while trying to retrieve Customer Personnel data.', null);
            }
            callback(null, result);
        }
    });
}

methods.GetProjectAttachedDocuments = function (projectID, documentType, callback) {
    let apiCallUrl = process.env.DMS_API_URL + "/documents?waclient_id=equals(" + projectID + ")&waclient_document_type=equals(" + documentType + ")&file_name=project()";
    let options = {
        url: apiCallUrl,
        timeout: 5000, //5s timeout
        method: 'GET',
        json: true,
        headers: {
            'Authorization': 'Basic ' + process.env.DMS_WACLIENT_API_AUTH
        }
    };

    async.retry(retryOptions, async.apply(requestUseErr, options), function (error, response, body) {
        if (error) {
            callback(JSON.stringify(error), null);
        } else {
            if (body) {
                callback(null, body);
            } else {
                callback('Unexpected response while trying to retrieve attached document list data.', null);
            }

        }
    });
}

methods.GetProjectAttachedDocumentData = function (fileKey, callback) {
    let apiCallUrl = process.env.DMS_API_URL + "/documents/" + fileKey;
    let options = {
        url: apiCallUrl,
        timeout: 5000, //5s timeout
        method: 'GET',
        json: true,
        headers: {
            'Authorization': 'Basic ' + process.env.DMS_WACLIENT_API_AUTH
        }
    };

    async.retry(retryOptions, async.apply(requestUseErrStream, options), function (error, response_stream) {
        if (error) {
            callback(JSON.stringify(error), null);
        } else {
            if (response_stream) {
                callback(null, response_stream);
            } else {
                callback('Unexpected response while trying to retrieve attached document data.', null);
            }
        }
    });
}

//Async parallel returns all results in an array.
//Iterate through the array and return an object.
methods.ReturnAsyncParallelResultsAsObject = function (resultsFromAsyncParallel) {
    let custName = "";
    let whName = "";
    let cdmName = "";
    let cdmEmail = "";

    for (var i = 0; i < resultsFromAsyncParallel.length; i++) {
        if (resultsFromAsyncParallel[i].companyName) {
            custName = resultsFromAsyncParallel[i].companyName;
        } else if (resultsFromAsyncParallel[i].whName) {
            whName = resultsFromAsyncParallel[i].whName;
        } else if (resultsFromAsyncParallel[i].cdmName) {
            cdmName = resultsFromAsyncParallel[i].cdmName;
            cdmEmail = resultsFromAsyncParallel[i].cdmEmail;
        }
    }

    return { warehouseName: whName, customerName: custName, cdmName: cdmName, cdmEmail: cdmEmail };
}

//The warehouse can deny the same project multiple times.
//Iterate through the array of reasons, and return the most recent explanation.
methods.ReturnMostRecentPushbackReason = function (reasons) {
    function compare(a, b) {
        return b.Timestamp - a.Timestamp;
    }
    return reasons.sort(compare)[0].Explanation;
}

module.exports = methods
