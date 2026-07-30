#!/usr/bin/env node
/**
 * One English word, one Fonoran concept.
 *
 *   node scripts/fonoran-word-ownership.js            # report
 *   node scripts/fonoran-word-ownership.js --apply    # resolve what can be resolved
 *
 * A word owned by two concepts has no deterministic translation, so the translator has to
 * guess or drop it. 31 words were in that state, and the cause was not that Fonoran splits one
 * idea in two: it is that most concepts had no word bank, so a word attached to whichever
 * concept happened to list it. `plant` claimed "tree" because `tree` had no bank of its own.
 *
 * Most of it resolves without judgement, by the rule that a word belongs to the concept it
 * names. "tree" belongs to `tree` rather than `plant`, "sick" to `sick` rather than `pain`,
 * "eat" to `eat` and "food" to `food`, which are different ideas that were each claiming both
 * words. What is left is genuine ambiguity in English ("cross" is both angry and traverse) or a
 * real duplicate pair, and those are written to data/fonoran-word-ownership.json for a ruling
 * rather than settled by a coin flip.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../tools/is-main.js';
import { sameIdea } from '../tools/fonoran-compound-semantics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALIZATION = 'data/localizations/en.json';
const OWNERSHIP = 'data/fonoran-word-ownership.json';

/** @param {string} rel */
async function readJson(rel) {
  return JSON.parse(await readFile(join(ROOT, rel), 'utf8'));
}

/**
 * Does `word` name `conceptId`, allowing for an inflection ("trees" names `tree`)?
 *
 * @param {string} word
 * @param {string} conceptId
 */
function wordNamesConcept(word, conceptId) {
  const w = String(word).toLowerCase().trim();
  const id = String(conceptId).toLowerCase().replace(/_/g, ' ');
  return w === id || sameIdea(w, id);
}

export async function analyseOwnership() {
  const [localization, inventory, compoundsDoc] = await Promise.all([
    readJson(LOCALIZATION),
    readJson('data/fonoran-concept-inventory.json'),
    readJson('data/fonoran-compounds.json'),
  ]);
  const conceptIds = new Set([
    ...(inventory.primitives ?? []).map(p => String(p.id)),
    ...(compoundsDoc.compounds ?? []).map(c => String(c.concept)),
  ]);

  /** @type {Map<string, string[]>} word -> concepts claiming it */
  const claims = new Map();
  for (const [id, entry] of Object.entries(localization.entries ?? {})) {
    if (!conceptIds.has(id)) continue;
    for (const word of [entry.label, ...(entry.aliases ?? [])]) {
      if (!word) continue;
      const key = String(word).toLowerCase().trim();
      if (!claims.has(key)) claims.set(key, []);
      if (!claims.get(key).includes(id)) claims.get(key).push(id);
    }
  }

  const resolved = [];
  const unresolved = [];
  for (const [word, concepts] of claims) {
    if (concepts.length < 2) continue;
    const named = concepts.filter(id => wordNamesConcept(word, id));
    if (named.length === 1) {
      resolved.push({ word, owner: named[0], release: concepts.filter(id => id !== named[0]) });
    } else {
      unresolved.push({ word, concepts: [...concepts].sort() });
    }
  }
  resolved.sort((a, b) => a.word.localeCompare(b.word));
  unresolved.sort((a, b) => a.word.localeCompare(b.word));
  return { localization, resolved, unresolved, contested: resolved.length + unresolved.length };
}

/**
 * Strip released claims from the localization document.
 *
 * @param {object} localization
 * @param {Array<{ word: string, owner: string, release: string[] }>} resolved
 */
function applyResolutions(localization, resolved) {
  let removed = 0;
  for (const { word, release } of resolved) {
    for (const conceptId of release) {
      const entry = localization.entries?.[conceptId];
      if (!entry?.aliases) continue;
      const before = entry.aliases.length;
      entry.aliases = entry.aliases.filter(a => String(a).toLowerCase().trim() !== word);
      removed += before - entry.aliases.length;
    }
  }
  return removed;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { localization, resolved, unresolved, contested } = await analyseOwnership();

  console.log(`English words claimed by more than one concept: ${contested}`);
  console.log(`  resolvable by the naming rule: ${resolved.length}`);
  for (const r of resolved) {
    console.log(`    "${r.word}" -> ${r.owner} (released by ${r.release.join(', ')})`);
  }
  console.log(`  needing a ruling: ${unresolved.length}`);
  for (const u of unresolved) {
    console.log(`    "${u.word}" contested by ${u.concepts.join(' / ')}`);
  }

  if (!apply) {
    console.log('\nRun with --apply to remove the released claims and record the rest.');
    return;
  }

  const removed = applyResolutions(localization, resolved);
  await writeFile(join(ROOT, LOCALIZATION), `${JSON.stringify(localization, null, 2)}\n`);

  const doc = {
    version: 1,
    status: 'canonical',
    description:
      'English words claimed by more than one Fonoran concept. A word with two owners has no '
      + 'deterministic translation, so the translator must guess or drop it. Words resolvable by '
      + 'the naming rule (a word belongs to the concept it names) are fixed in the localization '
      + 'itself by scripts/fonoran-word-ownership.js and do not appear here. What remains is '
      + 'either English polysemy, where one word carries two unrelated meanings, or a pair of '
      + 'concepts that are genuinely the same idea and should merge.',
    enforcement:
      'scripts/fonoran-verify-invariants.js fails on any contested word not listed here, so new '
      + 'ambiguity cannot be introduced while this backlog is worked down.',
    contested: unresolved.map(u => ({ word: u.word, concepts: u.concepts, ruling: null })),
  };
  await writeFile(join(ROOT, OWNERSHIP), `${JSON.stringify(doc, null, 2)}\n`);

  console.log(`\nRemoved ${removed} released claim(s) from ${LOCALIZATION}.`);
  console.log(`Recorded ${unresolved.length} contested word(s) in ${OWNERSHIP}.`);
}

if (isMainModule(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
