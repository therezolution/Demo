'use strict';

var expect = require('chai').expect;
var lambdaTester = require('lambda-tester');
var lambda = require('../lambda/drafts_process-record-change.js');

describe('lambda function', function() {
    [
        "Started",
        "Sent to WH"
    ].forEach(function(unactionableStatus) {
        it(`does not invoke the handler function for unactionable status: status=${unactionableStatus}`, function() {
            return lambdaTester(lambda.handler)
                .event({Status: unactionableStatus})   
                .expectResult((result) => {
                    console.log(result);
                    expect(result).to.equal("No action needed for status " + unactionableStatus + ".");
                });
        });
    });

});