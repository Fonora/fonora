/**
 * LLM-assisted gap analyzer.
 *
 * For each honest translation gap, the LLM classifies it as:
 *   - compound  → propose 3–5 compositions from allowed concept IDs
 *   - primitive → propose a new concept record (id, gloss, domain, campfire rationale)
 *   - alias     → suggest mapping to an existing concept
 *
 * Output is advisory proposals for human review. Nothing enters the lexicon
 * automatically; all proposals flow through fonoran-compound-proposals.js.
 */

import { anthropicConfigured, completeJson } from './fonoran-llm-client.js';
import { buildCompositionResolver, detectRedundantRootPattern } from './fonoran-composition-resolve.js';
import { readDoc } from './fonoran-store.js';
import { loadConceptInventory } from './fonoran-concepts.js';

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

function buildGlossary(primitiveIds, inventory) {
  const concepts = inventory?.concepts ?? [];
  const entries = [];
  for (const c of concepts) {
    if (primitiveIds.includes(c.id)) {
      entries.push(`  ${c.id}: ${c.gloss ?? c.description ?? c.id}`);
    }
  }
  return entries.join('\n');
}

/**
 * Classify a single gap word and propose solutions.
 *
 * @param {string} word  - English word/phrase that is a translation gap
 * @param {string} role  - semantic role: path, subject, object, event, modifier, etc.
 * @param {string[]} primitiveIds
 * @param {object[]} compoundDefs
 * @param {object} inventory
 * @param {object} [opts]
 * @returns {Promise<GapProposal>}
 */
export async function analyzeGap(word, role, primitiveIds, compoundDefs, inventory, opts = {}) {
  const allowed = allowedConceptIds(primitiveIds, compoundDefs);
  const resolver = buildCompositionResolver(primitiveIds, compoundDefs);
  const glossary = buildGlossary(primitiveIds, inventory);
  const maxFlattened = opts.maxFlattened ?? 4;
  const count = opts.count ?? 4;

  const prompt = [
    `You are helping grow a constructed language called Fonoran.`,
    `Fonoran expresses meaning through small compounds of ~100 primitive roots.`,
    ``,
    `Primitive root glossary (id: meaning):`,
    glossary,
    ``,
    `Allowed concept IDs (primitives + approved compounds):`,
    allowed.join(', '),
    ``,
    `Task: classify the English word/phrase "${word}" (semantic role: ${role}).`,
    ``,
    `Choose ONE classification:`,
    `- "compound": it can be naturally expressed by combining 2–4 existing Fonoran concepts.`,
    `  The resulting compound must be intuitively recoverable by a stranger knowing only the roots.`,
    `- "primitive": it represents a fundamental human experience that CANNOT be naturally expressed`,
    `  from existing roots. Reserved for truly irreducible concepts (like behind, water, fire).`,
    `- "alias": it maps well to an existing single Fonoran concept already in the allowed list.`,
    ``,
    `Respond with a JSON object matching this schema:`,
    `{`,
    `  "classification": "compound" | "primitive" | "alias",`,
    `  "rationale": "1-2 sentence explanation",`,
    `  "compositions": [  // if compound: up to ${count} arrays of concept ids, best first`,
    `    ["concept_id", "concept_id"],`,
    `    ...`,
    `  ],`,
    `  "primitive_proposal": {  // if primitive:`,
    `    "suggested_id": "snake_case_id",`,
    `    "gloss": "short definition",`,
    `    "domain": "space|time|body|social|emotion|thought|abstract",`,
    `    "priority_class": "essential|common|useful|rare",`,
    `    "campfire_rationale": "why two stranded strangers would need this in week one"`,
    `  } | null,`,
    `  "alias_proposal": {  // if alias:`,
    `    "existing_concept_id": "id from allowed list",`,
    `    "rationale": "why this concept best covers the meaning"`,
    `  } | null`,
    `}`,
    ``,
    `Rules for compounds:`,
    `- Use ONLY ids from the allowed list above.`,
    `- Prefer 2–3 direct components; flattened spelling must stay ≤ ${maxFlattened} atomic roots.`,
    `- Order matters: modifier before head (e.g. water + path = river, not path + water).`,
    `- Do NOT invent new concept ids.`,
  ].join('\n');

  const empty = {
    word,
    role,
    classification: 'unknown',
    rationale: 'LLM not configured or request failed',
    compositions: [],
    primitive_proposal: null,
    alias_proposal: null,
    valid_compositions: [],
  };

  if (!llmConfigured()) return empty;

  try {
    const result = await completeJson({
      system: 'You output only valid JSON matching the requested schema. No commentary.',
      user: prompt,
      temperature: 0.3,
    });

    if (!result.ok || !result.data) return empty;

    const data = result.data;
    const classification = ['compound', 'primitive', 'alias'].includes(data.classification)
      ? data.classification
      : 'unknown';

    // Validate and filter compositions
    const allowedSet = new Set(allowed);
    const validCompositions = [];
    const redundancyWarnings = [];
    for (const comp of (data.compositions ?? [])) {
      if (!Array.isArray(comp) || comp.length < 2) continue;
      if (!comp.every(id => typeof id === 'string' && allowedSet.has(id))) continue;
      const flatRoots = resolver.flatRoots(comp);
      if (flatRoots == null || flatRoots.length > maxFlattened) continue;
      validCompositions.push(comp);
      const redundancy = detectRedundantRootPattern(flatRoots);
      redundancyWarnings.push(redundancy ? redundancy.pattern : null);
      if (validCompositions.length >= count) break;
    }

    // Validate alias
    const aliasProposal = data.alias_proposal?.existing_concept_id
      && allowedSet.has(data.alias_proposal.existing_concept_id)
      ? data.alias_proposal
      : null;

    return {
      word,
      role,
      classification,
      rationale: typeof data.rationale === 'string' ? data.rationale.slice(0, 400) : '',
      compositions: data.compositions ?? [],
      primitive_proposal: classification === 'primitive' ? (data.primitive_proposal ?? null) : null,
      alias_proposal: classification === 'alias' ? aliasProposal : null,
      valid_compositions: validCompositions,
      redundancy_warnings: redundancyWarnings,
    };
  } catch {
    return empty;
  }
}

/**
 * Analyze a batch of translation gaps and return proposals.
 *
 * @param {Array<{word: string, role: string}>} gaps
 * @param {object} [opts]
 * @param {string[]} [opts.primitiveIds]
 * @param {object[]} [opts.compoundDefs]
 * @param {object} [opts.inventory]
 * @param {number} [opts.concurrency] - max parallel LLM calls (default 3)
 */
export async function analyzeGaps(gaps, opts = {}) {
  if (!gaps.length) return [];
  if (!llmConfigured()) {
    console.warn('[gap-analyzer] No LLM configured; skipping gap analysis.');
    return [];
  }

  let { primitiveIds, compoundDefs, inventory } = opts;

  // Load from store if not provided
  if (!primitiveIds || !compoundDefs || !inventory) {
    const [inv, compoundsDoc] = await Promise.all([
      inventory ? Promise.resolve({ concepts: [] }) : loadConceptInventory(),
      compoundDefs ? Promise.resolve({ compounds: [] }) : readDoc('compounds'),
    ]);
    if (!primitiveIds) primitiveIds = (inv?.concepts ?? []).map(c => c.id);
    if (!compoundDefs) compoundDefs = compoundsDoc?.compounds ?? [];
    if (!inventory) inventory = inv;
  }

  const concurrency = opts.concurrency ?? 3;
  const results = [];

  for (let i = 0; i < gaps.length; i += concurrency) {
    const batch = gaps.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(g => analyzeGap(
        g.word,
        g.role ?? 'concept',
        primitiveIds,
        compoundDefs,
        inventory,
        opts,
      )),
    );
    results.push(...batchResults);
  }

  return results;
}

export { llmConfigured };
