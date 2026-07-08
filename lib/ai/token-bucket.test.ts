import { describe, expect, it } from 'vitest';

import { TokenBucket } from './token-bucket';

describe('TokenBucket (SPEC §6.2: 1 req / 5s sustained, burst 3)', () => {
  it('allows a burst up to capacity, then blocks', () => {
    let t = 1_000_000;
    const bucket = new TokenBucket(3, 5000, () => t);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(false); // burst exhausted
    expect(bucket.available).toBe(0);
  });

  it('reports the wait until the next token', () => {
    let t = 0;
    const bucket = new TokenBucket(3, 5000, () => t);
    bucket.tryAcquire();
    bucket.tryAcquire();
    bucket.tryAcquire();
    expect(bucket.msUntilNext()).toBe(5000);
    t += 2000;
    expect(bucket.msUntilNext()).toBe(3000);
  });

  it('refills one token per refill interval, capped at capacity', () => {
    let t = 0;
    const bucket = new TokenBucket(3, 5000, () => t);
    bucket.tryAcquire();
    bucket.tryAcquire();
    bucket.tryAcquire();
    expect(bucket.tryAcquire()).toBe(false);

    t += 5000; // one token back
    expect(bucket.available).toBe(1);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(false);

    t += 100_000; // long idle — must not exceed capacity
    expect(bucket.available).toBe(3);
  });

  it('sustains ~1 request per interval over time', () => {
    let t = 0;
    const bucket = new TokenBucket(1, 5000, () => t);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(false);
    t += 5000;
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(false);
  });
});
