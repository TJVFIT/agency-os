/**
 * Token bucket per provider key (SPEC §6.2): 1 request / 5 s sustained,
 * burst 3. Clock is injectable so timing is deterministic in tests.
 */

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    public readonly capacity: number,
    public readonly refillMs: number,
    private readonly clock: () => number = () => Date.now(),
  ) {
    this.tokens = capacity;
    this.lastRefill = clock();
  }

  private refill(): void {
    const now = this.clock();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    const gained = Math.floor(elapsed / this.refillMs);
    if (gained > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + gained);
      this.lastRefill += gained * this.refillMs;
    }
  }

  /** Consume a token if available; returns false when the bucket is empty. */
  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Milliseconds until the next token becomes available (0 if one is ready). */
  msUntilNext(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.max(0, this.refillMs - (this.clock() - this.lastRefill));
  }

  get available(): number {
    this.refill();
    return this.tokens;
  }
}
