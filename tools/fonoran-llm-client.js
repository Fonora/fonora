/**
 * Shared Anthropic Messages API client for Fonoran LLM tooling.
 * Uses native fetch — no extra npm dependency.
 */

import '../load-env.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_PROPOSER_MODEL = 'claude-sonnet-4-6';
const DEFAULT_JUDGE_MODEL = 'claude-fable-5';
const DEFAULT_JUDGE_EFFORT = 'medium';
const DEFAULT_MAX_TOKENS = 512;
const ADAPTIVE_THINKING_MIN_MAX_TOKENS = 2048;
const DEFAULT_DELAY_MS = 200;
const MAX_RETRIES = 5;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Models that reject the `temperature` parameter and instead take
 * `thinking: { type: 'adaptive' }` + `output_config: { effort }`.
 */
const ADAPTIVE_THINKING_MODELS = /(?:fable|sonnet-5)/i;

/** Backend/tooling LLM key (gap analysis, playtests, corpus generation). */
export const ANTHROPIC_API_KEY_ENV = 'ANTHROPIC_API_KEY';

/** User-facing translator LLM key (Language app /api/fonoran/translate). */
export const ANTHROPIC_TRANSLATOR_API_KEY_ENV = 'ANTHROPIC_API_KEY_FONORA_TRANSLATOR';

let lastRequestAt = 0;

function resolveApiKey(apiKeyEnv = ANTHROPIC_API_KEY_ENV) {
  return process.env[apiKeyEnv]?.trim() ?? '';
}

export function anthropicConfigured(apiKeyEnv = ANTHROPIC_API_KEY_ENV) {
  return Boolean(resolveApiKey(apiKeyEnv));
}

export function anthropicTranslatorConfigured() {
  return anthropicConfigured(ANTHROPIC_TRANSLATOR_API_KEY_ENV);
}

export function anthropicModel() {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Role-based model resolution (RN-30 propose/judge separation).
 *
 * - 'proposer' generates vocabulary (gap analyzer, vocab survey, llm-candidates).
 * - 'judge' evaluates it (intuition battery, blind meaning grader, proposal gate).
 *
 * Keeping the roles on different model families prevents a model from scoring
 * its own compositional style as "natural" (self-agreement bias).
 *
 * @param {'proposer'|'judge'|null} [role]
 */
export function anthropicModelForRole(role = null) {
  if (role === 'proposer') {
    return process.env.ANTHROPIC_MODEL_PROPOSER?.trim()
      || process.env.ANTHROPIC_MODEL?.trim()
      || DEFAULT_PROPOSER_MODEL;
  }
  if (role === 'judge') {
    return process.env.ANTHROPIC_MODEL_JUDGE?.trim()
      || process.env.ANTHROPIC_MODEL?.trim()
      || DEFAULT_JUDGE_MODEL;
  }
  return anthropicModel();
}

/** Whether a model uses adaptive thinking + effort instead of temperature. */
export function isAdaptiveThinkingModel(model) {
  return ADAPTIVE_THINKING_MODELS.test(String(model ?? ''));
}

/** Reasoning effort for adaptive-thinking judge calls (low|medium|high). */
export function judgeEffort() {
  const raw = process.env.ANTHROPIC_JUDGE_EFFORT?.trim()?.toLowerCase();
  return ['low', 'medium', 'high'].includes(raw) ? raw : DEFAULT_JUDGE_EFFORT;
}

export function anthropicMaxTokens() {
  const n = Number(process.env.ANTHROPIC_MAX_TOKENS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_TOKENS;
}

function requestDelayMs() {
  const n = Number(process.env.LLM_REQUEST_DELAY_MS);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DELAY_MS;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function throttle() {
  const delay = requestDelayMs();
  if (delay <= 0) return;
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < delay) await sleep(delay - elapsed);
  lastRequestAt = Date.now();
}

function extractJsonText(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return '';
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const brace = trimmed.match(/\{[\s\S]*\}/);
  return brace?.[0] ?? trimmed;
}

/**
 * @param {object} opts
 * @param {string} opts.system
 * @param {string} opts.user  the VARIABLE part of the user turn (per-request)
 * @param {string} [opts.cachePrefix]  large STATIC user prefix; when set it is sent
 *   as its own cache-breakpoint block so Anthropic prompt caching reuses it across
 *   calls (huge cost/latency win for the fixed grammar+inventory+few-shot prompt).
 * @param {boolean} [opts.cacheSystem]  cache the system block too (static prompt).
 * @param {number} [opts.temperature]
 * @param {'proposer'|'judge'} [opts.role] resolve the model by pipeline role
 * @param {string} [opts.model] explicit model override (wins over role)
 * @param {string} [opts.effort] adaptive-thinking effort override (judge models)
 * @param {string} [opts.apiKeyEnv] env var name for the API key (default ANTHROPIC_API_KEY)
 * @returns {Promise<{ ok: true, data: object, raw: string, usage?: object, model?: string } | { ok: false, error: string, status?: number }>}
 */
export async function completeJson({
  system,
  user,
  cachePrefix = null,
  cacheSystem = false,
  temperature = 0,
  maxTokens: maxTokensOpt,
  role = null,
  model: modelOpt = null,
  effort = null,
  apiKeyEnv = ANTHROPIC_API_KEY_ENV,
}) {
  const apiKey = resolveApiKey(apiKeyEnv);
  if (!apiKey) {
    return { ok: false, error: `${apiKeyEnv} not set` };
  }
  const model = modelOpt ?? anthropicModelForRole(role);
  const adaptive = isAdaptiveThinkingModel(model);
  let maxTokens = maxTokensOpt ?? anthropicMaxTokens();
  // Adaptive-thinking models spend part of max_tokens on internal reasoning,
  // so small JSON budgets sized for direct output would truncate responses.
  if (adaptive && maxTokens < ADAPTIVE_THINKING_MIN_MAX_TOKENS) {
    maxTokens = ADAPTIVE_THINKING_MIN_MAX_TOKENS;
  }

  // Cache breakpoints (ephemeral, ~5 min TTL): the static system + the static
  // user prefix. Only the small variable tail changes per request, so warm calls
  // are billed at the cache-read rate for the shared prefix.
  const systemField = cacheSystem && system
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system;
  const userContent = cachePrefix
    ? [
      { type: 'text', text: cachePrefix, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: user },
    ]
    : user;

  const body = {
    model,
    max_tokens: maxTokens,
    system: systemField,
    messages: [{ role: 'user', content: userContent }],
  };
  if (adaptive) {
    // Fable-class models: `temperature` is deprecated; control variance via
    // adaptive thinking + effort instead.
    body.thinking = { type: 'adaptive' };
    body.output_config = { effort: effort ?? judgeEffort() };
  } else {
    body.temperature = temperature;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();

    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if ((res.status === 429 || res.status === 529) && attempt < MAX_RETRIES) {
        const backoff = Math.min(8000, 500 * 2 ** attempt);
        await sleep(backoff);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, error: `Anthropic API ${res.status}: ${body.slice(0, 300)}`, status: res.status };
      }

      const payload = await res.json();
      const raw = (payload.content ?? [])
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n')
        .trim();

      try {
        const data = JSON.parse(extractJsonText(raw));
        return { ok: true, data, raw, usage: payload.usage ?? null, model };
      } catch {
        return { ok: false, error: `Failed to parse JSON from model response: ${raw.slice(0, 200)}` };
      }
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  return { ok: false, error: 'Anthropic request failed after retries' };
}

/** Rough USD estimate for dry-run budgeting (Sonnet-class pricing). */
export function estimateCallCost({ inputTokens = 600, outputTokens = 150, model = anthropicModel() } = {}) {
  const isHaiku = /haiku/i.test(model);
  const inputRate = isHaiku ? 0.8 : 3.0;
  const outputRate = isHaiku ? 4.0 : 15.0;
  return (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
}
