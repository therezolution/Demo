"use strict"

const aws = require('aws-sdk')
const async = require('async')

const sqs = new aws.SQS()
const doc_client = new aws.DynamoDB.DocumentClient();

exports.handler = (event, context, callback) => {
    console.log(event);
    async.eachSeries(event.Records, (record, next_record) => {
        if( record.eventName === "MODIFY" && 
            (   GetValue(record, "OldImage", "Status", "S") !==
                GetValue(record, "NewImage", "Status", "S")
            )
        ) {
            async.waterfall([
                async.apply(GetDraft, record.dynamodb.Keys['ProjectID'].S),
                InsertIntoQueue
            ], callback)
        } else {
            setImmediate(callback);
        }
    }, callback)
}

//Pull draft from DynamoDB.
function GetDraft(draft_key, next) {
    const params = {
        TableName: process.env.DRAFTS_TABLE_NAME,
        Key: {
            "ProjectID": draft_key
        },
        ConsistentRead: true
    }
    doc_client.get(params, (error, result) => {
        next(error, result.Item)
    })
}

//Insert draft into queue to be processed.
function InsertIntoQueue(draft, next) {
    console.log(draft);
    if(draft) {
        let params = {
            MessageBody: JSON.stringify(draft),
            QueueUrl: process.env.SQS_QUEUE
        };
    
        sqs.sendMessage(params, function(err, response) {
            if (err) {
                next(err);
            } else {
                console.log('Inserted in SQS queue: ' + JSON.stringify(response));
                next(null, 'Inserted in SQS queue: ' + JSON.stringify(response));
            }
        });
    } else {
        next('No draft found for ID.', null);
    }
}

/*
    Helper Functions
*/

function GetValue(record, image, property, type) {
    if( record.dynamodb[image] &&
        record.dynamodb[image][property] &&
        record.dynamodb[image][property][type] !== undefined
    ) {
        return record.dynamodb[image][property][type];
    } else {
        return undefined;
    }
}
