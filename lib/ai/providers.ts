/**
 * Concrete providers built from plain config (the worker supplies values from
 * workerEnv — this file stays portable). Chain per SPEC §6.2:
 *   drafting (caption/reply/plan/report): flash(KEY_A) → flash-lite(KEY_A) → groq → openrouter
 *   translate:                            flash(KEY_B) → flash-lite(KEY_B) → groq → openrouter
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
}

export type DraftingKind = 'caption' | 'reply' | 'plan' | 'report';

const BUCKET_CAPACITY = 3;
const BUCKET_REFILL_MS = 5000;

const RETRIABLE_STATUS = (s: number) => s === 429 || s >= 500;

function geminiProvider(id: string, apiKey: string, model: string): Provider {
  return {
    id,
    bucket: new TokenBucket(BUCKET_CAPACITY, BUCKET_REFILL_MS),
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
): Provider {
  return {
    id,
    bucket: new TokenBucket(BUCKET_CAPACITY, BUCKET_REFILL_MS),
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
export function buildChain(
  kind: DraftingKind | 'translate',
  cfg: ProviderConfig,
): Provider[] {
  const chain: Provider[] = [];
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
