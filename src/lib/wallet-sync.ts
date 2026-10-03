/** One owner for asynchronous snapshots. Never merge an older page into newer edits. */
export class WalletSync<T> {
  private epoch = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly publish: (value: T) => void) {}

  invalidate() {
    this.epoch += 1;
  }

  async read(load: () => Promise<T>): Promise<T | undefined> {
    const epoch = ++this.epoch;
    try {
      const result = await load();
      if (epoch !== this.epoch) return undefined;
      this.publish(result);
      return result;
    } catch (error) {
      if (epoch !== this.epoch) return undefined;
      throw error;
    }
  }

  refresh(load: () => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const result = await this.read(load);
      if (result === undefined)
        throw new Error("Wallet changed during refresh. Retry loading.");
      return result;
    });
  }

  mutate<R>(write: () => Promise<R>, reload: () => Promise<T>): Promise<R> {
    this.invalidate();
    return this.enqueue(async () => {
      this.invalidate();
      let result: R;
      try {
        result = await write();
      } catch (error) {
        // A multi-batch import may have committed earlier chunks. Reconcile them
        // even when the write reports a partial failure, preserving that error.
        try {
          await this.read(reload);
        } catch {
          /* Retry feedback is handled by caller. */
        }
        throw error;
      }
      try {
        await this.read(reload);
      } catch (error) {
        throw new Error(
          `Change saved, but wallet refresh failed. Reload before retrying the action. ${error instanceof Error ? error.message : ""}`,
        );
      }
      return result;
    });
  }

  private enqueue<R>(work: () => Promise<R>): Promise<R> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
