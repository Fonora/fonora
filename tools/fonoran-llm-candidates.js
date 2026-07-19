/**
 * Optional LLM proposer for compound composition candidates.
 */

import { anthropicConfigured, completeJson } from './fonoran-llm-client.js';
import { buildCompositionResolver } from './fonoran-composition-resolve.js';
import { phoneticPromptBrief } from './fonoran-phonetic-weights.js';

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

function extractCompositionsFromJson(data, allowed, seen) {
  const allowedSet = new Set(allowed);
  const out = [];
  const push = (comp) => {
    if (!Array.isArray(comp) || !comp.length) return;
    if (!comp.every(id => typeof id === 'string' && allowedSet.has(id))) return;
    const key = comp.join('+');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(comp);
  };
  if (Array.isArray(data?.compositions)) {
    for (const comp of data.compositions) push(comp);
  }
  if (Array.isArray(data)) {
    for (const comp of data) push(comp);
  }
  return out;
}

function buildProposerPrompt(conceptId, gloss, allowed, maxFlattened, count, opts = {}) {
  const glossary = opts.glossaryLines?.length
    ? ['Available primitives (id = meaning):', ...opts.glossaryLines, '']
    : [];
  const reject = opts.rejectComposition?.length
    ? [`REJECTED — do NOT propose this composition or close variants: ${JSON.stringify(opts.rejectComposition)}`, '']
    : [];
  const hint = opts.conceptHint ? [`Concept guidance: ${opts.conceptHint}`, ''] : [];
  return [
    `You propose Fonoran compound compositions for a constructed language experiment.`,
    `Two strangers with no shared language combine ~150 primitive roots like LEGO to communicate.`,
    ``,
    `Target concept: "${conceptId}"`,
    `English gloss to express: ${gloss}`,
    ...reject,
    ...hint,
    `Rules:`,
    `- Return exactly ${count} DIFFERENT compositions as JSON arrays of concept ids.`,
    `- Use ONLY ids from this allowed list: ${allowed.join(', ')}`,
    `- Prefer 2–3 direct components; flattened atomic roots must stay ≤ ${maxFlattened}.`,
    `- Culture-neutral: express human experience, not English idiom or religion.`,
    `- A root-knower hearing the parts should plausibly recover the meaning.`,
    `- Avoid lazy glue pairs (thing+make, give+mark) unless functionally necessary.`,
    phoneticPromptBrief(),
    ...glossary,
    `Respond as JSON: { "compositions": [["id1","id2"], ...] }`,
  ].filter(Boolean).join('\n');
}

async function proposeViaAnthropic(prompt) {
  return completeJson({
    role: 'proposer',
    system: 'You output JSON only: { "compositions": [ ["concept_id", ...], ... ] }. No commentary.',
    user: prompt,
    temperature: 0.5,
  });
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
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You output JSON only: { "compositions": [ ["concept_id", ...], ... ] }.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  try {
    return { ok: true, data: JSON.parse(content), raw: content };
  } catch {
    return { ok: true, raw: content };
  }
}

/**
 * Ask an LLM for composition proposals using only approved concept ids.
 * @returns {Promise<{ compositions: string[][], error?: string, raw?: string }>}
 */
export async function proposeLlmCandidates(conceptId, opts = {}) {
  if (!llmConfigured()) return { compositions: [], error: 'no API key' };

  const allowed = allowedConceptIds(opts.primitiveIds ?? [], opts.compoundDefs ?? []);
  const maxFlattened = opts.maxFlattened ?? 4;
  const count = opts.count ?? 5;
  const gloss = opts.gloss ?? conceptId;
  const resolver = buildCompositionResolver(opts.primitiveIds ?? [], opts.compoundDefs ?? []);
  const glossaryLines = (opts.glossaryLines ?? []).length
    ? opts.glossaryLines
    : buildGlossaryLines(opts.primitiveIds ?? [], opts.glossById ?? {});
  const prompt = buildProposerPrompt(conceptId, gloss, allowed, maxFlattened, count, {
    rejectComposition: opts.rejectComposition,
    conceptHint: opts.conceptHint,
    glossaryLines,
  });

  try {
    const result = anthropicConfigured()
      ? await proposeViaAnthropic(prompt)
      : await proposeViaOpenAI(prompt);

    if (!result.ok) {
      return { compositions: [], error: result.error ?? 'LLM request failed', raw: result.raw };
    }

    const seen = new Set();
    const parsed = [
      ...extractCompositionsFromJson(result.data, allowed, seen),
      ...parseCompositionsFromText(result.raw ?? '', allowed),
    ];

    const compositions = parsed.filter(comp => {
      const flat = resolver.flatCount(comp);
      return flat != null && flat <= maxFlattened;
    }).slice(0, count);

    return { compositions, raw: result.raw, error: compositions.length ? undefined : 'no valid compositions parsed' };
  } catch (err) {
    return { compositions: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export { llmConfigured };

function buildGlossaryLines(primitiveIds, glossById) {
  return primitiveIds.map(id => `- ${id}: ${glossById[id] ?? id}`);
}
