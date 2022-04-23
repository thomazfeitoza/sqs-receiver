import { promisify } from 'util';

const setTimeoutWithPromise = promisify(setTimeout);

export default class BackoffTimeout {

  private counter: number = 0;

  public reset() {
    this.counter = 0;
  }

  public async wait() {
    const updatedCounter = Math.min(this.counter + 1, 100);
    let seconds = Math.pow(2, this.counter);
    seconds = Math.min(seconds, 300);
    await setTimeoutWithPromise(seconds * 1000);
    this.counter = updatedCounter;
  }

}