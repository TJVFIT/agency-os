/**
 * Provider router (SPEC §6.2). Ordered chain, first healthy provider wins;
 * on 429 / 5xx / timeout → next provider. Per-provider token bucket. All
 * outputs JSON, zod-validated, with one repair retry before the provider is
 * abandoned. Latency + provider are recorded in `_meta`.
 *
 * Pure and portable — no `server-only`, no Supabase, no env access. The
 * worker builds providers (see providers.ts) and passes them in; tests pass
 * fakes. Modules here only import each other relatively + zod, so the worker
 * can import this file across the workspace without path aliases.
 */

import type { ZodType } from 'zod';

import { TokenBucket } from './token-bucket';

/** Raised by a provider for a retriable condition — router moves to the next. */
export class RetriableProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'RetriableProviderError';
  }
}

/** All providers exhausted without a valid result. */
export class AiRouterError extends Error {
  constructor(
    message: string,
    public readonly providersTried: string[],
  ) {
    super(message);
    this.name = 'AiRouterError';
  }
}

export interface Provider {
  readonly id: string;
  readonly bucket: TokenBucket;
  /** Return the model's raw text (may be fenced JSON). Throw
   * RetriableProviderError for 429/5xx/timeout, other errors otherwise. */
  generate(system: string, user: string, signal?: AbortSignal): Promise<string>;
}

export interface RouterDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Per-call timeout; omit to disable. */
  timeoutMs?: number;
  /** Safety cap on bucket waits per provider (avoids unbounded loops). */
  maxBucketWaits?: number;
  log?: (line: Record<string, unknown>) => void;
}

export interface RouterMeta {
  provider: string;
  latencyMs: number;
  repaired: boolean;
}

export interface RouterOutput<T> {
  data: T;
  _meta: RouterMeta;
}

const REPAIR_SUFFIX =
  '\n\nYour previous response was not valid JSON for the required schema. Return ONLY valid JSON matching the schema, with no markdown, no code fences, and no commentary.';

/** Pull a JSON object/array out of raw model text (handles ```json fences). */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  // Fall back to the first {...} or [...] span if there's leading prose.
  const firstBrace = candidate.search(/[{[]/);
  const body = firstBrace > 0 ? candidate.slice(firstBrace) : candidate;
  return JSON.parse(body);
}

async function callWithTimeout(
  provider: Provider,
  system: string,
  user: string,
  deps: RouterDeps,
): Promise<string> {
  if (!deps.timeoutMs) return provider.generate(system, user);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    return await provider.generate(system, user, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForToken(
  provider: Provider,
  deps: RouterDeps,
): Promise<void> {
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const maxWaits = deps.maxBucketWaits ?? 20;
  for (let i = 0; i < maxWaits; i++) {
    if (provider.bucket.tryAcquire()) return;
    await sleep(provider.bucket.msUntilNext());
  }
  // One last try after the final sleep.
  if (!provider.bucket.tryAcquire()) {
    throw new RetriableProviderError(
      `token bucket exhausted for ${provider.id}`,
    );
  }
}

/**
 * Run the ordered provider chain until one returns a schema-valid result.
 * Throws AiRouterError if the whole chain fails.
 */
export async function runChain<T>(
  providers: Provider[],
  system: string,
  user: string,
  schema: ZodType<T>,
  deps: RouterDeps = {},
): Promise<RouterOutput<T>> {
  const now = deps.now ?? (() => Date.now());
  const tried: string[] = [];
  let lastError = 'no providers configured';

  for (const provider of providers) {
    tried.push(provider.id);
    const started = now();
    try {
      await waitForToken(provider, deps);

      const raw = await callWithTimeout(provider, system, user, deps);
      const parsed = tryValidate(raw, schema);
      if (parsed.ok) {
        deps.log?.({ provider: provider.id, latencyMs: now() - started });
        return {
          data: parsed.data,
          _meta: {
            provider: provider.id,
            latencyMs: now() - started,
            repaired: false,
          },
        };
      }

      // One repair retry on the same provider.
      await waitForToken(provider, deps);
      const rawRepair = await callWithTimeout(
        provider,
        system,
        user + REPAIR_SUFFIX,
        deps,
      );
      const repaired = tryValidate(rawRepair, schema);
      if (repaired.ok) {
        deps.log?.({ provider: provider.id, repaired: true });
        return {
          data: repaired.data,
          _meta: {
            provider: provider.id,
            latencyMs: now() - started,
            repaired: true,
          },
        };
      }

      lastError = `invalid JSON from ${provider.id}: ${repaired.error}`;
      deps.log?.({ provider: provider.id, error: lastError });
    } catch (err) {
      if (err instanceof RetriableProviderError) {
        lastError = `${provider.id}: ${err.message}`;
        deps.log?.({ provider: provider.id, retriable: err.message });
        continue;
      }
      // Non-retriable provider error → still try the next provider, but note it.
      lastError = `${provider.id}: ${err instanceof Error ? err.message : String(err)}`;
      deps.log?.({ provider: provider.id, fatal: lastError });
    }
  }

  throw new AiRouterError(lastError, tried);
}

function tryValidate<T>(
  raw: string,
  schema: ZodType<T>,
): { ok: true; data: T } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = extractJson(raw);
  } catch (e) {
    return {
      ok: false,
      error: `not JSON (${e instanceof Error ? e.message : e})`,
    };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: result.error.issues.map((i) => i.message).join('; '),
  };
}
