# sqs-receiver

Fast and easy worker for processing large amounts of SQS messages with a high level of concurrency.
It can handle many more messages than the maximum number from an `sqs.receiveMessage` call because it uses sub-workers to retrieve as many messages as you want.

## Installation

Use NPM to add this library to your project:

```sh
npm install -s sqs-receiver
```

## AWS requirements

In order to use this package, you need to have at least one SQS queue (standard or fifo) created in your AWS account. We need the queue url to setup an SQSReceiver. E.g.: `https://sqs.us-east-1.amazonaws.com/000000000000/my-queue`.

Authentication to AWS can be done using any methods of [setting credentials in the AWS Javascript SDK](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html). Your credential must have the following permissions in the queues that you are going to use in this package:

- `sqs:ReceiveMessage`
- `sqs:DeleteMessage`


## Usage

```js
// Enabling reuse of TCP connections to AWS
process.env.AWS_NODEJS_CONNECTION_REUSE_ENABLED = '1';

const { SQSReceiver } = require('sqs-receiver');

const sqsReceiver = new SQSReceiver({
  queueUrl: '<your-sqs-queue-url>',
  maxConcurrency: 50,
  messageHandler: async (message) => {
    /**
     * Do sync or async work here
     */
    console.log(message.Body);
    return true; // Returning true will delete messages automatically
  },
  sqs: {
    region: 'us-east-1'
  }
});


// Registering event listeners

sqsReceiver.on('fetchError', (err) => {
  console.log('fetcherror', err);
});

sqsReceiver.on('emptyQueue', () => {
  console.log('queue is empty');
});


// Handling process termination

const handleShutdown = async () => {
  try {
    await sqsReceiver.stop(); // This will wait until all fetched messages have been processed
  } catch (err) {
    console.log(err.stack);
    process.exit(1);
  }

  process.exit(0);
};

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);


// Starting sqs receiver
sqsReceiver.start();
```