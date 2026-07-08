import { buildChain, type ProviderConfig } from '../../lib/ai/providers';
import { workerEnv } from './env';

/** Assemble the provider chains from worker env (SPEC §6.2). */
export function providerConfig(): ProviderConfig {
  const env = workerEnv();
  return {
    geminiKeyA: env.GEMINI_KEY_A,
    geminiKeyB: env.GEMINI_KEY_B,
    geminiModel: env.GEMINI_MODEL,
    geminiModelLite: env.GEMINI_MODEL_LITE,
    groqApiKey: env.GROQ_API_KEY,
    groqModel: env.GROQ_MODEL,
    openrouterApiKey: env.OPENROUTER_API_KEY,
    openrouterModel: env.OPENROUTER_MODEL,
  };
}

export function hasAnyAiProvider(): boolean {
  const cfg = providerConfig();
  return Boolean(
    cfg.geminiKeyA ||
    cfg.geminiKeyB ||
    (cfg.groqApiKey && cfg.groqModel) ||
    (cfg.openrouterApiKey && cfg.openrouterModel),
  );
}

export { buildChain };
