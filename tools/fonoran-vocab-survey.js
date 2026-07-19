#!/usr/bin/env node
/**
 * Fonoran vocabulary survey — proactive LLM-driven compound discovery.
 *
 * Instead of seeding ASSOCIATION_SEEDS one concept at a time, this script asks
 * the LLM in domain batches to propose 300-500 compound concepts from the full
 * primitive set, validates compositions, and routes them into the proposal queue
 * for human review.
 *
 * Run:
 *   node tools/fonoran-vocab-survey.js              # full survey, all domains
 *   node tools/fonoran-vocab-survey.js --domain survival
 *   node tools/fonoran-vocab-survey.js --dry-run    # print proposals, don't save
 *   node tools/fonoran-vocab-survey.js --seeds      # also print ASSOCIATION_SEEDS JS
 *
 * After running: review proposals in the Word Manager queue (npm start → Language Lab).
 */

import '../load-env.js';
import { readDoc } from './fonoran-store.js';
import { createCompoundProposals } from './fonoran-compound-proposals.js';
import { buildCompositionResolver, detectRedundantRootPattern } from './fonoran-composition-resolve.js';
import { anthropicModelForRole, completeJson } from './fonoran-llm-client.js';
import { phoneticPromptBrief } from './fonoran-phonetic-weights.js';
import { semanticFieldsPromptBrief, loadRootSemanticFields } from './fonoran-root-semantic-fields.js';
import { evaluateCampfireComposition } from './fonoran-campfire-composition.js';

const MAX_TOKENS = 4096;

/**
 * Domain batches: each describes a slice of the vocabulary the LLM will focus on.
 * ~35-45 concepts per domain, ~8-10 domains = 300-450 total proposals.
 */
const SURVEY_DOMAINS = [
  {
    id: 'survival',
    label: 'Survival & basic needs',
    focus: 'food, water, shelter, danger, health, injury, rest, help in emergencies',
    examples: 'hungry, thirsty, shelter, danger, wound, medicine, rest, safe, fire-making',
    count: 40,
  },
  {
    id: 'space_direction',
    label: 'Space, direction & navigation',
    focus: 'positions (behind, ahead, beside), directions (toward, away), traversal (cross, enter), spatial relationships (between, surrounding, along)',
    examples: 'behind, ahead, beside, between, along, toward, away, encircle, cross, enter, exit, tunnel',
    count: 40,
  },
  {
    id: 'body_health',
    label: 'Body parts, health & physical states',
    focus: 'body parts not in the primitives (nose, ear, foot, leg, arm, shoulder, back, stomach, teeth, tongue), physical conditions (sick, tired, hungry, cold, hot, strong, weak)',
    examples: 'nose, ear, foot, arm, shoulder, stomach, teeth, tongue, tired, strong, weak, sweat, blood, breath',
    count: 40,
  },
  {
    id: 'social',
    label: 'Social interactions & relationships',
    focus: 'kinship, roles, communication acts, social states',
    examples: 'friend, enemy, leader, helper, family, stranger, promise, greeting, thank, refuse, agree, disagree, ask, answer, share',
    count: 40,
  },
  {
    id: 'emotion_mind',
    label: 'Emotions & mental states',
    focus: 'specific emotions, cognitive states, attitudes — expressed as compounds of feel/know/want/think',
    examples: 'happy, angry, calm, afraid, proud, shame, bored, curious, confused, certain, doubt, remember, forget, dream, imagine',
    count: 40,
  },
  {
    id: 'time_change',
    label: 'Time, change & process',
    focus: 'temporal concepts, change states, cycles, repetition, sequence',
    examples: 'again, return, always, never, already, soon, meanwhile, beginning, ending, grow, shrink, break, fix, transform',
    count: 40,
  },
  {
    id: 'nature_environment',
    label: 'Nature & environment',
    focus: 'weather, terrain, plants, animals (beyond the generic primitives), natural phenomena',
    examples: 'rain, cloud, wind, mountain, river, forest, beach, desert, flower, fruit, seed, insect, fish, bird, snake',
    count: 40,
  },
  {
    id: 'tools_objects',
    label: 'Tools, objects & materials',
    focus: 'everyday objects, materials, tools, structures',
    examples: 'knife, rope, bag, bowl, door, window, wall, floor, bridge, boat, wheel, cloth, thread, cup, lamp, weapon',
    count: 40,
  },
  {
    id: 'action_motion',
    label: 'Actions & motion verbs',
    focus: 'specific actions and motion verbs built from primitives',
    examples: 'run, swim, fly, walk, climb, fall, throw, catch, push, pull, cut, tie, wrap, open, close, spin, hide, chase',
    count: 40,
  },
];

function buildGlossary(primitives, rootById = {}) {
  return primitives
    .filter(p => p.suggested_status === 'primitive')
    .map(p => {
      const spelling = rootById[p.id];
      const suffix = spelling ? ` — spoken "${spelling}"` : '';
      return `  ${p.id}: ${p.plain_description ?? p.description ?? p.id}${suffix}`;
    })
    .join('\n');
}

function buildExistingList(compoundsDoc, primitives) {
  const existing = new Set(primitives.map(p => p.id));
  for (const c of compoundsDoc?.compounds ?? []) {
    existing.add(c.concept);
  }
  return [...existing].sort();
}

function buildSurveyPrompt(domain, glossary, existingConcepts, semanticBrief = '') {
  // Full existing list — truncating it caused duplicate proposals for concepts
  // the model could not see.
  const existing = existingConcepts.join(', ');
  return [
    `You are helping design Fonoran, a constructed language built on ~89 primitive roots.`,
    ``,
    `Fonoran's core idea: roots are IDEAS/CONCEPTS, not English words. Compositions express`,
    `communicative strategies — a stranger who knows the roots must GUESS the meaning.`,
    `This is the "campfire test." Etymology and English taxonomy are WRONG guides.`,
    ``,
    semanticBrief ? `${semanticBrief}\n` : '',
    `PRIMITIVE ROOTS (complete list — use ONLY these as composition components):`,
    glossary,
    ``,
    phoneticPromptBrief(),
    ``,
    `Already defined concepts (do NOT propose these again):`,
    existing,
    ``,
    `TASK: Propose exactly ${domain.count} compound concepts for the domain:`,
    `  "${domain.label}"`,
    `  Focus: ${domain.focus}`,
    `  Examples of the KIND of concepts wanted: ${domain.examples}`,
    ``,
    `RULES:`,
    `- Each composition must use ONLY ids from the primitive list above.`,
    `- Prefer 2-component compositions. Use 3 only when 2 is unclear. Never more than 4.`,
    `- Order: modifier before head (descriptive part first, then the core concept).`,
    `- The composition must be intuitively recoverable: a stranger guesses the meaning.`,
    `- Tools/objects: use functional anchors (hand, use, hold, take, bound, conflict) —`,
    `  NEVER name a tool as material+make (e.g. stone+make is NOT hammer).`,
    `- The composition must also SOUND clear: follow the phonetic rules above and avoid`,
    `  root sequences that blur together when spoken.`,
    `- Concept ids must be English snake_case, NOT already in the "already defined" list.`,
    `- Propose CONCEPTS (meaning-units), not words. "behind" is a concept; don't propose`,
    `  "tree behind rock" (that's a sentence, not a concept).`,
    ``,
    `OUTPUT FORMAT — respond with ONLY this JSON (no markdown, no explanation):`,
    `{`,
    `  "proposals": [`,
    `    {`,
    `      "id": "concept_id",`,
    `      "compositions": [["prim1","prim2"], ["alt1","alt2"]],`,
    `      "gloss": "short English definition",`,
    `      "campfire": "why two stranded strangers would need this in week one"`,
    `    }`,
    `  ]`,
    `}`,
  ].join('\n');
}

async function callLlm(prompt) {
  const result = await completeJson({
    role: 'proposer',
    maxTokens: MAX_TOKENS,
    temperature: 0.4,
    system: 'You output only valid JSON matching the requested schema. No commentary, no markdown fences.',
    user: prompt,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function validateProposal(proposal, allowedIds, resolver, existingSet) {
  const { id, compositions } = proposal;
  if (!id || typeof id !== 'string') return { valid: false, reason: 'missing id' };
  if (existingSet.has(id)) return { valid: false, reason: `already exists: ${id}` };
  if (!Array.isArray(compositions) || !compositions.length) return { valid: false, reason: 'no compositions' };

  const validComps = [];
  const redundancyWarnings = [];
  const campfireIssues = [];
  for (const comp of compositions) {
    if (!Array.isArray(comp) || comp.length < 2) continue;
    if (!comp.every(c => allowedIds.has(c))) continue;
    const flatRoots = resolver.flatRoots(comp);
    if (flatRoots == null || flatRoots.length > 4) continue;
    const campfire = evaluateCampfireComposition(id, comp);
    if (!campfire.pass && campfire.score < 0.5) {
      campfireIssues.push(`${comp.join('+')}: ${campfire.issues[0] ?? 'campfire fail'}`);
      continue;
    }
    validComps.push(comp);
    const redundancy = detectRedundantRootPattern(flatRoots);
    redundancyWarnings.push(redundancy ? redundancy.pattern : null);
  }

  if (!validComps.length) {
    const reason = campfireIssues[0] ?? 'no valid compositions (check primitive IDs)';
    return { valid: false, reason };
  }
  return { valid: true, validCompositions: validComps, redundancyWarnings };
}

function proposalToSeedLine(id, compositions) {
  const comps = compositions
    .map(c => `['${c.join("', '")}']`)
    .join(', ');
  return `  ${id}: [${comps}],`;
}

async function runDomain(domain, context, opts) {
  const { primitiveIds, allowedIds, resolver, existingSet, glossary, existingConcepts, dryRun, printSeeds } = context;

  console.log(`\n[${'='.repeat(50)}]`);
  console.log(`Domain: ${domain.label}`);
  console.log(`${'='.repeat(52)}\n`);

  const prompt = buildSurveyPrompt(domain, glossary, existingConcepts, context.semanticBrief ?? '');

  let parsed;
  try {
    parsed = await callLlm(prompt);
  } catch (err) {
    console.error(`  ERROR calling LLM: ${err.message}`);
    return { proposed: 0, valid: 0, saved: 0 };
  }

  const proposals = parsed?.proposals ?? [];
  console.log(`  LLM proposed: ${proposals.length} concepts`);

  let validCount = 0;
  let savedCount = 0;
  const seedLines = [];

  for (const proposal of proposals) {
    const check = validateProposal(proposal, allowedIds, resolver, existingSet);
    if (!check.valid) {
      console.log(`  SKIP ${proposal.id ?? '?'}: ${check.reason}`);
      continue;
    }
    validCount++;
    const { validCompositions, redundancyWarnings } = check;
    const hasRedundancy = redundancyWarnings.some(Boolean);

    if (printSeeds) {
      seedLines.push(proposalToSeedLine(proposal.id, validCompositions));
    }

    const warnSuffix = hasRedundancy ? ` ⚠ ${redundancyWarnings.find(Boolean)}` : '';
    console.log(`  OK   ${proposal.id}: [${validCompositions[0].join('+')}] — ${proposal.gloss ?? ''}${warnSuffix}`);

    if (!dryRun) {
      try {
        await createCompoundProposals([{
          word: proposal.id,
          role: domain.id,
          concept_id: proposal.id,
          gloss: proposal.gloss ?? proposal.id,
          classification: 'compound',
          rationale: proposal.campfire ?? proposal.gloss ?? '',
          compositions: validCompositions,
          valid_compositions: validCompositions,
          redundancy_warnings: redundancyWarnings,
          primitive_proposal: null,
          alias_proposal: null,
          source: 'vocab_survey',
        }]);
        savedCount++;
        existingSet.add(proposal.id);
        allowedIds.add(proposal.id);
      } catch (err) {
        console.error(`  ERROR saving ${proposal.id}: ${err.message}`);
      }
    } else {
      existingSet.add(proposal.id);
      allowedIds.add(proposal.id);
    }
  }

  if (printSeeds && seedLines.length) {
    console.log('\n  // ASSOCIATION_SEEDS entries for this domain:');
    for (const line of seedLines) console.log(line);
  }

  return { proposed: proposals.length, valid: validCount, saved: savedCount };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const printSeeds = args.includes('--seeds');
  const domainFilter = args.find(a => a.startsWith('--domain'))?.replace('--domain', '').trim()
    || args.find((a, i) => args[i - 1] === '--domain');

  console.log('Fonoran Vocabulary Survey');
  console.log(`Model: ${anthropicModelForRole('proposer')} (proposer role) | Max tokens: ${MAX_TOKENS}`);
  if (dryRun) console.log('DRY RUN — proposals will not be saved.\n');

  const [inventory, compoundsDoc, approved] = await Promise.all([
    readDoc('concept_inventory'),
    readDoc('compounds'),
    readDoc('approved_roots'),
  ]);

  if (!inventory) throw new Error('Concept inventory not found');

  const primitives = (inventory.primitives ?? []).filter(p => p.suggested_status === 'primitive');
  const primitiveIds = primitives.map(p => p.id);
  const allowedIds = new Set(primitiveIds);
  for (const c of compoundsDoc?.compounds ?? []) allowedIds.add(c.concept);

  const rootById = Object.fromEntries((approved?.roots ?? []).map(r => [r.id, r.spelling]));
  const existingSet = new Set(allowedIds);
  const resolver = buildCompositionResolver(primitiveIds, compoundsDoc?.compounds ?? []);
  const glossary = buildGlossary(inventory.primitives ?? [], rootById);
  const existingConcepts = buildExistingList(compoundsDoc, inventory.primitives ?? []);

  console.log(`Primitives: ${primitiveIds.length}`);
  console.log(`Existing compounds: ${(compoundsDoc?.compounds ?? []).length}`);
  console.log(`Total allowed concept IDs: ${allowedIds.size}\n`);

  const semanticFields = await loadRootSemanticFields();
  const semanticBrief = semanticFieldsPromptBrief(semanticFields);

  const domains = domainFilter
    ? SURVEY_DOMAINS.filter(d => d.id === domainFilter)
    : SURVEY_DOMAINS;

  if (!domains.length) {
    console.error(`No domain found matching "${domainFilter}". Available: ${SURVEY_DOMAINS.map(d => d.id).join(', ')}`);
    process.exit(1);
  }

  const context = { primitiveIds, allowedIds, resolver, existingSet, glossary, existingConcepts, dryRun, printSeeds, semanticBrief };

  let totalProposed = 0;
  let totalValid = 0;
  let totalSaved = 0;

  for (const domain of domains) {
    const result = await runDomain(domain, context, {});
    totalProposed += result.proposed;
    totalValid += result.valid;
    totalSaved += result.saved;
    // Small delay between domain batches
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + '='.repeat(54));
  console.log('Survey complete.');
  console.log(`  Proposed: ${totalProposed} | Valid: ${totalValid} | Saved: ${totalSaved}`);
  if (dryRun) {
    console.log('\nDry run — run without --dry-run to save proposals.');
  } else {
    if (totalSaved === 0) {
      const err = new Error(
        'Vocab survey completed but wrote 0 proposals. '
        + 'No durable output — do not treat this run as successful.',
      );
      err.code = 'LLM_NO_OUTPUT';
      throw err;
    }
    console.log('\nProposals saved. Review in Gap Workshop (/tools#gap-workshop).');
    console.log('Edit in Word Manager, then Build dictionary. Commit data/*.json when ready.');
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(err => { console.error(err); process.exit(1); });
}
