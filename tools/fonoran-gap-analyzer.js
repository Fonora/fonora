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
    `You are helping grow a constructed language called Fonoran for two strangers with no shared language.`,
    `Success = campfire recovery: another root-knower would GUESS the meaning, not perfect semantic taxonomy.`,
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
    `- "compound": express by combining 2–4 EXISTING concept ids into something a stranger would guess.`,
    `  Prefer concrete survival/social/body/space roots — NOT abstract stacks like change+form+substance.`,
    `  Politeness (please, sorry): use gesture compounds (want+good, feel+bad, give+good) not abstract "request".`,
    `- "primitive": ONLY if truly irreducible AND a campfire-week-one need. Most gaps are compounds or aliases.`,
    `- "alias": maps to an existing single concept in the allowed list.`,
    ``,
    `English lemma hygiene (Fonoran words never inflect):`,
    `- NEVER create a new concept for English inflections (-ed, -ing, -s, irregular past). Classify as "alias" to the lemma concept (e.g. laughed → laugh, teaches → teach).`,
    `- Concept ids must be invariant English lemmas (the idea), not surface grammar.`,
    `- Do NOT create a new agentive compound when an existing one covers the role (e.g. mentor → alias teacher; do not mint person+know+give if teacher exists).`,
    ``,
    `Campfire rules for compounds:`,
    `- Optimize for human guessability, not logical ontology or English taxonomy.`,
    `- Use ONLY ids from the allowed list. 2–3 components ideal; flattened ≤ ${maxFlattened} atomic roots.`,
    `- Include at least one concrete component (food, person, move, feel, good, bad, want, know, place, …).`,
    `- Order: modifier before head (water+path = river).`,
    `- Provide ${count} compositions, best guessability first.`,
    `- Also include "alternates_wrong": 2 plausible-but-weaker compositions for testing (not for auto-accept).`,
    ``,
    `Respond with JSON:`,
    `{`,
    `  "classification": "compound" | "primitive" | "alias",`,
    `  "rationale": "1-2 sentences focused on stranger recovery",`,
    `  "compositions": [["id", "id"], ...],`,
    `  "alternates_wrong": [["id", "id"], ...],`,
    `  "primitive_proposal": { ... } | null,`,
    `  "alias_proposal": { "existing_concept_id": "...", "rationale": "..." } | null`,
    `}`,
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
      system: 'You output only valid JSON. Optimize for campfire stranger recovery, not semantic taxonomy. No commentary.',
      user: prompt,
      temperature: 0.35,
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
