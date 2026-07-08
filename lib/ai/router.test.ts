import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  AiRouterError,
  RetriableProviderError,
  extractJson,
  runChain,
  type Provider,
} from './router';
import { TokenBucket } from './token-bucket';
import { captionResultSchema } from './schemas';

const schema = z.object({ value: z.string() });

/** A fake provider whose behavior is scripted per call. */
function fakeProvider(
  id: string,
  script: Array<() => Promise<string>>,
): Provider & { calls: number } {
  let calls = 0;
  const provider = {
    id,
    bucket: new TokenBucket(3, 5000, () => 0),
    calls: 0,
    async generate() {
      const step = script[Math.min(calls, script.length - 1)];
      calls += 1;
      provider.calls = calls;
      return step();
    },
  };
  return provider;
}

const ok = (obj: unknown) => async () => JSON.stringify(obj);
const retriable = (status: number) => async () => {
  throw new RetriableProviderError(`http ${status}`, status);
};

const noWaitDeps = { sleep: async () => {}, now: () => 0 };

describe('runChain — provider fallback (SPEC §6.2)', () => {
  it('uses the first healthy provider', async () => {
    const p1 = fakeProvider('p1', [ok({ value: 'from-p1' })]);
    const p2 = fakeProvider('p2', [ok({ value: 'from-p2' })]);
    const out = await runChain([p1, p2], 'sys', 'usr', schema, noWaitDeps);
    expect(out.data.value).toBe('from-p1');
    expect(out._meta.provider).toBe('p1');
    expect(p2.calls).toBe(0);
  });

  it('falls through to provider 2 on a 429 (the Phase 2 acceptance case)', async () => {
    const p1 = fakeProvider('p1', [retriable(429)]);
    const p2 = fakeProvider('p2', [ok({ value: 'fallback' })]);
    const out = await runChain([p1, p2], 'sys', 'usr', schema, noWaitDeps);
    expect(out.data.value).toBe('fallback');
    expect(out._meta.provider).toBe('p2');
    expect(p1.calls).toBe(1);
  });

  it('falls through on 5xx and timeout-style errors', async () => {
    const p1 = fakeProvider('p1', [retriable(503)]);
    const p2 = fakeProvider('p2', [retriable(500)]);
    const p3 = fakeProvider('p3', [ok({ value: 'third' })]);
    const out = await runChain([p1, p2, p3], 'sys', 'usr', schema, noWaitDeps);
    expect(out._meta.provider).toBe('p3');
  });

  it('throws AiRouterError with the providers tried when all fail', async () => {
    const p1 = fakeProvider('p1', [retriable(429)]);
    const p2 = fakeProvider('p2', [retriable(500)]);
    await expect(
      runChain([p1, p2], 'sys', 'usr', schema, noWaitDeps),
    ).rejects.toBeInstanceOf(AiRouterError);
    try {
      await runChain([p1, p2], 'sys', 'usr', schema, noWaitDeps);
    } catch (e) {
      expect((e as AiRouterError).providersTried).toEqual(['p1', 'p2']);
    }
  });
});

describe('runChain — JSON repair retry (SPEC §6.2)', () => {
  it('retries once on the same provider when JSON is invalid, then succeeds', async () => {
    const p1 = fakeProvider('p1', [
      async () => 'not json at all',
      ok({ value: 'repaired' }),
    ]);
    const out = await runChain([p1], 'sys', 'usr', schema, noWaitDeps);
    expect(out.data.value).toBe('repaired');
    expect(out._meta.repaired).toBe(true);
    expect(p1.calls).toBe(2);
  });

  it('moves to the next provider if repair still fails', async () => {
    const p1 = fakeProvider('p1', [
      async () => 'garbage',
      async () => 'still garbage',
    ]);
    const p2 = fakeProvider('p2', [ok({ value: 'ok2' })]);
    const out = await runChain([p1, p2], 'sys', 'usr', schema, noWaitDeps);
    expect(out.data.value).toBe('ok2');
    expect(p1.calls).toBe(2);
  });
});

describe('runChain — token bucket integration', () => {
  it('waits (via injected sleep) when the bucket is empty rather than failing', async () => {
    let clock = 0;
    const provider: Provider = {
      id: 'slow',
      bucket: new TokenBucket(1, 5000, () => clock),
      generate: async () => JSON.stringify({ value: 'x' }),
    };
    provider.bucket.tryAcquire(); // drain the single token
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const out = await runChain([provider], 'sys', 'usr', schema, {
      sleep,
      now: () => clock,
    });
    expect(out.data.value).toBe('x');
    expect(sleep).toHaveBeenCalled(); // it had to wait for a refill
  });
});

describe('extractJson', () => {
  it('parses bare JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips ```json fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('strips plain ``` fences', () => {
    expect(extractJson('```\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it('skips leading prose before an object', () => {
    expect(extractJson('Here you go: {"a":3}')).toEqual({ a: 3 });
  });
});

describe('schema validation against realistic payloads', () => {
  it('accepts a well-formed caption result', () => {
    const good = {
      variants: [
        { caption: 'Sıcacık kahve', hashtags: ['#kahve'] },
        { caption: 'Bugün ne içsek?', hashtags: ['#kafe'] },
        { caption: 'Kampanya başladı', hashtags: ['#indirim'] },
      ],
    };
    expect(captionResultSchema.safeParse(good).success).toBe(true);
  });
  it('rejects a caption result missing hashtags', () => {
    const bad = { variants: [{ caption: 'x' }] };
    expect(captionResultSchema.safeParse(bad).success).toBe(false);
  });
});
