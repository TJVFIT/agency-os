/**
 * Concrete providers built from plain config (the worker supplies values from
 * workerEnv — this file stays portable). Chain per SPEC §6.2:
 *   drafting (caption/reply/plan/report): flash(KEY_A) → flash-lite(KEY_A) → groq → openrouter
 *   translate:                            flash(KEY_B) → flash-lite(KEY_B) → groq → openrouter
 *   chat (v4 staff assistant):            groq (open Llama) → openrouter (:free open-weight)
 *                                         → gemini-flash-lite(KEY_A) last resort
 * A provider is included only when its key is present; missing keys are
 * skipped so the chain degrades gracefully.
 */

import { RetriableProviderError, type Provider } from './router';
import { TokenBucket } from './token-bucket';

export interface ProviderConfig {
  geminiKeyA?: string;
  geminiKeyB?: string;
  geminiModel: string;
  geminiModelLite: string;
  groqApiKey?: string;
  groqModel?: string;
  openrouterApiKey?: string;
  openrouterModel?: string;
  /** Chat-chain model overrides (v4 assistant). Fall back to the
   * GROQ_CHAT_MODEL / OPENROUTER_CHAT_MODEL env vars, then to the
   * open-weight defaults below. */
  groqChatModel?: string;
  openrouterChatModel?: string;
}

export type DraftingKind = 'caption' | 'reply' | 'plan' | 'report';

/** Every chain buildChain can assemble. */
export type ChainKind = DraftingKind | 'translate' | 'chat';

/**
 * Open-weight defaults for the assistant chat chain (verified 2026-07-15).
 * Groq llama-3.3-70b-versatile: production open-weight Llama, 30 RPM /
 * 1K RPD free — chat is low-volume (6–10 staff) and quality-sensitive, so
 * the 70B beats llama-3.1-8b-instant here (that one stays the bulk-drafting
 * default via GROQ_MODEL). OpenRouter qwen3-next-80b instruct: best free
 * all-round TR/EN instruct with response_format support.
 */
const GROQ_CHAT_MODEL_DEFAULT = 'llama-3.3-70b-versatile';
const OPENROUTER_CHAT_MODEL_DEFAULT = 'qwen/qwen3-next-80b-a3b-instruct:free';

/** Guarded env read — the worker maps most config via workerEnv/ai-config,
 * but the chat model ids are additive knobs read here so ProviderConfig
 * callers don't all have to plumb them through. */
function envModel(name: string): string | undefined {
  return typeof process !== 'undefined' ? process.env?.[name] : undefined;
}

const BUCKET_CAPACITY = 3;
const BUCKET_REFILL_MS = 5000;

const RETRIABLE_STATUS = (s: number) => s === 429 || s >= 500;

/**
 * Token buckets are hoisted to module scope so SPEC §6.2's per-provider-key
 * limit (1 req/5 s, burst 3) actually accumulates: buildChain runs once per
 * job, so a fresh bucket per call would reset the budget on every request and
 * never throttle. Keyed by provider id + API key, the state persists for the
 * lifetime of the worker process.
 */
const buckets = new Map<string, TokenBucket>();

function bucketFor(providerKey: string): TokenBucket {
  let bucket = buckets.get(providerKey);
  if (!bucket) {
    bucket = new TokenBucket(BUCKET_CAPACITY, BUCKET_REFILL_MS);
    buckets.set(providerKey, bucket);
  }
  return bucket;
}

function geminiProvider(id: string, apiKey: string, model: string): Provider {
  return {
    id,
    bucket: bucketFor(`${id}:${apiKey}`),
    async generate(system, user, signal) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        });
      } catch (e) {
        // Network error / abort → retriable.
        throw new RetriableProviderError(
          `${id} fetch failed: ${e instanceof Error ? e.message : e}`,
        );
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (RETRIABLE_STATUS(res.status))
          throw new RetriableProviderError(`${id} ${res.status}`, res.status);
        throw new Error(`${id} ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new RetriableProviderError(`${id} empty response`);
      return text;
    },
  };
}

function openAiCompatibleProvider(
  id: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  // Distinct chains may hit the same upstream API key (e.g. groq drafting +
  // groq chat); pass the shared key so the per-key budget stays honest.
  bucketKey = `${id}:${apiKey}`,
): Provider {
  return {
    id,
    bucket: bucketFor(bucketKey),
    async generate(system, user, signal) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          signal,
          body: JSON.stringify({
            model,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });
      } catch (e) {
        throw new RetriableProviderError(
          `${id} fetch failed: ${e instanceof Error ? e.message : e}`,
        );
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (RETRIABLE_STATUS(res.status))
          throw new RetriableProviderError(`${id} ${res.status}`, res.status);
        throw new Error(`${id} ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content;
      if (!text) throw new RetriableProviderError(`${id} empty response`);
      return text;
    },
  };
}

/** Build the ordered chain for a job kind. */
export function buildChain(kind: ChainKind, cfg: ProviderConfig): Provider[] {
  const chain: Provider[] = [];

  // Chat is open-source-model-first (v4): Groq's open-weight Llama, then an
  // OpenRouter :free open-weight model, with gemini-flash-lite (KEY_A) only
  // as the last resort. Chat needs no per-kind key: it reuses the existing
  // Groq/OpenRouter keys and only swaps the model id.
  if (kind === 'chat') {
    if (cfg.groqApiKey) {
      chain.push(
        openAiCompatibleProvider(
          'groq-chat',
          'https://api.groq.com/openai/v1',
          cfg.groqApiKey,
          cfg.groqChatModel ??
            envModel('GROQ_CHAT_MODEL') ??
            GROQ_CHAT_MODEL_DEFAULT,
          `groq:${cfg.groqApiKey}`,
        ),
      );
    }
    if (cfg.openrouterApiKey) {
      chain.push(
        openAiCompatibleProvider(
          'openrouter-chat',
          'https://openrouter.ai/api/v1',
          cfg.openrouterApiKey,
          cfg.openrouterChatModel ??
            envModel('OPENROUTER_CHAT_MODEL') ??
            OPENROUTER_CHAT_MODEL_DEFAULT,
          `openrouter:${cfg.openrouterApiKey}`,
        ),
      );
    }
    if (cfg.geminiKeyA) {
      chain.push(
        geminiProvider('gemini-flash-lite:A', cfg.geminiKeyA, cfg.geminiModelLite),
      );
    }
    return chain;
  }

  const geminiKey = kind === 'translate' ? cfg.geminiKeyB : cfg.geminiKeyA;
  const keyLabel = kind === 'translate' ? 'B' : 'A';

  if (geminiKey) {
    chain.push(
      geminiProvider(`gemini-flash:${keyLabel}`, geminiKey, cfg.geminiModel),
    );
    chain.push(
      geminiProvider(
        `gemini-flash-lite:${keyLabel}`,
        geminiKey,
        cfg.geminiModelLite,
      ),
    );
  }
  if (cfg.groqApiKey && cfg.groqModel) {
    chain.push(
      openAiCompatibleProvider(
        'groq',
        'https://api.groq.com/openai/v1',
        cfg.groqApiKey,
        cfg.groqModel,
      ),
    );
  }
  if (cfg.openrouterApiKey && cfg.openrouterModel) {
    chain.push(
      openAiCompatibleProvider(
        'openrouter',
        'https://openrouter.ai/api/v1',
        cfg.openrouterApiKey,
        cfg.openrouterModel,
      ),
    );
  }
  return chain;
}
