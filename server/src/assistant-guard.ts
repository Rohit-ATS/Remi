/**
 * Small in-process guard for the optional paid assistant. It protects a single
 * server instance; production deployments should also enforce a matching edge
 * limit before traffic reaches Render.
 */
export type AssistantGuardOptions = {
  /** Whole-instance request budget per window, including paid model calls. */
  maxRequests: number;
  /** Per-IP request budget per window. */
  maxRequestsPerKey: number;
  windowMs: number;
  maxConcurrent: number;
  maxBuckets: number;
};

type Bucket = { startedAt: number; count: number };

export class AssistantGuard {
  private readonly buckets = new Map<string, Bucket>();
  private global: Bucket = { startedAt: 0, count: 0 };
  private inFlight = 0;
  private readonly options: AssistantGuardOptions;

  constructor(options: AssistantGuardOptions) {
    this.options = options;
  }

  acquire(key: string, now = Date.now()): (() => void) | null {
    if (this.inFlight >= this.options.maxConcurrent) return null;

    this.prune(now);
    if (now - this.global.startedAt >= this.options.windowMs) {
      this.global = { startedAt: now, count: 0 };
    }
    if (this.global.count >= this.options.maxRequests) return null;

    const previous = this.buckets.get(key);
    const bucket =
      previous === undefined || now - previous.startedAt >= this.options.windowMs
        ? { startedAt: now, count: 0 }
        : previous;
    if (bucket.count >= this.options.maxRequestsPerKey) return null;
    if (previous === undefined && this.buckets.size >= this.options.maxBuckets) return null;

    bucket.count += 1;
    this.buckets.set(key, bucket);
    this.global.count += 1;
    this.inFlight += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight -= 1;
    };
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.startedAt >= this.options.windowMs) this.buckets.delete(key);
    }
  }
}
