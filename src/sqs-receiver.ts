import { SQS } from 'aws-sdk';
import { EventEmitter } from 'stream';
import BackoffTimeout from './backoff-timeout';
import TaskManager from './task-manager';


const SQS_FETCH_LIMIT = 10;

export type SQSReceiverOptions = {
  /**
   * URL of the AWS SQS queue to consume from.
   */
  queueUrl: string

  /**
   * Maximum number of messages which can be processed at the same time.
   */
  maxConcurrency: number

  /**
   * A function that handles message processing.
   * It can do sync or async work.
   */
  messageHandler: (message: SQS.Message) => any

  /**
   * The duration (in seconds) for which a call of receiveMessage waits
   * for a message to arrive in the queue before returning.
   * Defaults to 20 seconds.
   */
  waitSeconds?: number

  /**
   * A flag to indicate if message attibutes should be fetched.
   * Passing true will result in every message being processed together with
   * its attributes.
   * Defaults to false.
   */
  includeAttributes?: boolean

  /**
   * When enabled the message will be deleted from SQS queue
   * if onMessage() handler returns a truthy value.
   * Defaults to true.
   */
  autoDelete?: boolean

  /**
   * Additional SQS client options.
   */
  sqs?: SQS.ClientConfiguration
}


export class SQSReceiver extends EventEmitter {

  private options: SQSReceiverOptions;
  private running: boolean;
  private backoffTimeout: BackoffTimeout;
  private taskManager: TaskManager;
  private taskHandler: (m: SQS.Message) => unknown;

  constructor(options: SQSReceiverOptions) {
    super();

    const defaultOptions: SQSReceiverOptions = {
      queueUrl: '',
      maxConcurrency: 10,
      messageHandler: () => null,
      waitSeconds: 20,
      includeAttributes: false,
      autoDelete: true,
    };

    this.options = Object.assign(defaultOptions, options);
    this.running = false;
    this.backoffTimeout = new BackoffTimeout();
    this.taskManager = new TaskManager();
    this.taskHandler = async (m: SQS.Message) => this.callMessageHandler(m);
  }

  public async start() {
    if (this.running) {
      return;
    }

    await this.stop();
    this.running = true;

    const numWorkers = Math.ceil(this.options.maxConcurrency / SQS_FETCH_LIMIT);
    for (let i = 0; i < numWorkers; i++) {
      process.nextTick(() => this.runWorker());
    }
  }

  public async stop() {
    this.running = false;
    await this.taskManager.waitAll();
  }

  private async runWorker() {
    try {
      const messages = await this.fetchMessages();

      if (messages) {
        for (const m of messages) {
          this.taskManager.add(m.MessageId!, this.taskHandler(m));
        }

        if (this.getAvailableSlots() <= 0) {
          await this.taskManager.waitOne();
        }

      } else {
        this.emit('emptyQueue');
      }

      this.backoffTimeout.reset();
    } catch (err) {
      this.emit('fetchError', err);
      await this.backoffTimeout.wait();
    }

    if (this.running) {
      process.nextTick(() => this.runWorker());
    }
  }

  private async fetchMessages() {
    const availableSlots = this.getAvailableSlots();
    const maxMessages = availableSlots <= SQS_FETCH_LIMIT ? availableSlots : SQS_FETCH_LIMIT;

    const req: SQS.ReceiveMessageRequest = {
      QueueUrl: this.options.queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: this.options.waitSeconds,
      MessageAttributeNames: this.options.includeAttributes ? ['All'] : undefined
    };

    const sqs = new SQS(this.options.sqs);
    const resp = await sqs.receiveMessage(req).promise();

    return resp.Messages;
  }

  private getAvailableSlots() {
    return this.options.maxConcurrency - this.taskManager.getCount();
  }

  private async callMessageHandler(message: SQS.Message) {
    try {
      const result = await this.options.messageHandler(message);

      if (this.options.autoDelete && result) {
        await this.deleteMessage(message);
      }
    } catch (err) {
      this.emit('messageError', err);
    }
  }

  private async deleteMessage(message: SQS.Message) {
    const sqs = new SQS(this.options.sqs);
    const deleteMessageOpts: SQS.DeleteMessageRequest = {
      QueueUrl: this.options.queueUrl,
      ReceiptHandle: message.ReceiptHandle!,
    };
    await sqs.deleteMessage(deleteMessageOpts).promise();
  }

}
