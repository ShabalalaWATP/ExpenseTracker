type Work = () => Promise<unknown>;

type QueueEntry = {
  key: string;
  work: Work;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

export class ReceiptWorkScheduler {
  private readonly queued: QueueEntry[] = [];
  private readonly workByKey = new Map<string, Promise<unknown>>();
  private readonly concurrency: number;
  private running = 0;

  constructor(concurrency = 2) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new Error("Receipt queue concurrency must be a positive integer.");
    }
    this.concurrency = concurrency;
  }

  schedule<T>(key: string, work: () => Promise<T>): Promise<T> {
    const existing = this.workByKey.get(key);
    if (existing) return existing as Promise<T>;

    let resolve!: (value: unknown) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<unknown>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    this.workByKey.set(key, promise);
    this.queued.push({ key, work, resolve, reject });
    this.drain();
    return promise as Promise<T>;
  }

  cancelPending(key: string): boolean {
    const index = this.queued.findIndex((entry) => entry.key === key);
    if (index < 0) return false;
    const [entry] = this.queued.splice(index, 1);
    this.workByKey.delete(key);
    entry.resolve(undefined);
    return true;
  }

  snapshot(): { queued: number; running: number; total: number } {
    return {
      queued: this.queued.length,
      running: this.running,
      total: this.queued.length + this.running,
    };
  }

  private drain(): void {
    while (this.running < this.concurrency && this.queued.length) {
      const entry = this.queued.shift();
      if (!entry) return;
      this.running += 1;
      void entry
        .work()
        .then(entry.resolve, entry.reject)
        .finally(() => {
          this.running -= 1;
          this.workByKey.delete(entry.key);
          this.drain();
        });
    }
  }
}
