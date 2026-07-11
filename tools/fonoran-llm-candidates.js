/**
 * Optional LLM proposer for compound composition candidates.
 *
 * Advisory only — output is ranked by understandability and must pass build validation
 * before any human/playtest promotion. Requires ANTHROPIC_API_KEY or LLM_API_KEY.
 */

import { anthropicConfigured, completeJson } from './fonoran-llm-client.js';
import { buildCompositionResolver } from './fonoran-composition-resolve.js';

function llmConfigured() {
  return anthropicConfigured() || Boolean(process.env.LLM_API_KEY?.trim());
}

function allowedConceptIds(primitiveIds, compoundDefs) {
  const ids = new Set(primitiveIds);
  for (const def of compoundDefs ?? []) {
    if (def.concept) ids.add(def.concept);
  }
  return [...ids].sort();
}

function parseCompositionsFromText(text, allowed) {
  const allowedSet = new Set(allowed);
  const out = [];
  const seen = new Set();

  for (const line of String(text).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const jsonMatch = trimmed.match(/^\d+\.\s*(\[.+\])\s*$/);
    const bracketMatch = trimmed.match(/^(\[.+\])\s*$/);
    const raw = jsonMatch?.[1] ?? bracketMatch?.[1];
    if (!raw) continue;
    try {
      const comp = JSON.parse(raw);
      if (!Array.isArray(comp) || !comp.length) continue;
      if (!comp.every(id => typeof id === 'string' && allowedSet.has(id))) continue;
      const key = comp.join('+');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(comp);
    } catch {
      /* skip malformed lines */
    }
  }
  return out;
}

function buildProposerPrompt(conceptId, gloss, allowed, maxFlattened, count) {
  return [
    `You propose Fonoran compound compositions: arrays of concept ids joined in speech.`,
    `Target concept: "${conceptId}" (${gloss})`,
    `Rules:`,
    `- Return exactly ${count} lines, each a JSON array of concept ids.`,
    `- Use ONLY ids from this allowed list: ${allowed.join(', ')}`,
    `- Prefer 2–3 direct components; flattened spelling must stay ≤ ${maxFlattened} atomic roots.`,
    `- Favor intuitive, recoverable meanings over deep semantic trees.`,
    `Format (one per line):`,
    `["collective", "person"]`,
    `["community", "bond"]`,
  ].join('\n');
}

async function proposeViaAnthropic(prompt) {
  const result = await completeJson({
    role: 'proposer',
    system: 'You output only JSON arrays of concept ids, one per line. No commentary.',
    user: prompt,
    temperature: 0.4,
  });
  if (!result.ok) return '';
  if (Array.isArray(result.data?.compositions)) {
    return result.data.compositions.map(c => JSON.stringify(c)).join('\n');
  }
  return typeof result.raw === 'string' ? result.raw : JSON.stringify(result.data);
}

async function proposeViaOpenAI(prompt) {
  const apiUrl = process.env.LLM_API_URL?.trim() || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.LLM_MODEL?.trim() || 'gpt-4o-mini';
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LLM_API_KEY.trim()}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: 'You output only JSON arrays of concept ids, one per line. No commentary.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Ask an LLM for 1–3 composition proposals using only approved concept ids.
 * Returns [] when no API key is set or the request fails.
 */
export async function proposeLlmCandidates(conceptId, opts = {}) {
  if (!llmConfigured()) return [];

  const allowed = allowedConceptIds(opts.primitiveIds ?? [], opts.compoundDefs ?? []);
  const maxFlattened = opts.maxFlattened ?? 4;
  const count = opts.count ?? 3;
  const gloss = opts.gloss ?? conceptId;
  const resolver = buildCompositionResolver(opts.primitiveIds ?? [], opts.compoundDefs ?? []);
  const prompt = buildProposerPrompt(conceptId, gloss, allowed, maxFlattened, count);

  try {
    const text = anthropicConfigured()
      ? await proposeViaAnthropic(prompt)
      : await proposeViaOpenAI(prompt);
    const parsed = parseCompositionsFromText(text, allowed);
    return parsed.filter(comp => {
      const flat = resolver.flatCount(comp);
      return flat != null && flat <= maxFlattened;
    }).slice(0, count);
  } catch {
    return [];
  }
}

export { llmConfigured };
