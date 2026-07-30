#!/usr/bin/env node
/**
 * Propose an English word bank for every concept, from WordNet, offline.
 *
 *   node scripts/fonoran-word-bank-propose.js
 *   node scripts/fonoran-word-bank-propose.js --json
 *
 * A Fonoran word names an idea, so the English words that reach it are a bank rather than a
 * single headword. 439 of 589 concepts had no bank at all, which is why an English word landed
 * on whichever concept happened to carry a matching alias: `plant` claimed "tree" because
 * `tree` had no bank of its own.
 *
 * This writes a proposal for review and does not touch data/localizations/en.json. Two rules
 * keep it honest: a word already owned by another concept is reported as a conflict rather
 * than taken, and a concept whose sense cannot be chosen deterministically is skipped with the
 * reason stated instead of filled by guesswork.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../tools/is-main.js';
import { proposeAllWordBanks, posForDomain, posForGloss } from '../tools/fonoran-word-bank.js';
import { isInformativeDescription } from '../tools/fonoran-compound-semantics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} rel */
async function readJson(rel) {
  return JSON.parse(await readFile(join(ROOT, rel), 'utf8'));
}

export async function buildProposal() {
  const [inventory, compoundsDoc, localization] = await Promise.all([
    readJson('data/fonoran-concept-inventory.json'),
    readJson('data/fonoran-compounds.json'),
    readJson('data/localizations/en.json'),
  ]);

  const primitives = inventory.primitives ?? [];
  const compounds = compoundsDoc.compounds ?? [];

  /** @type {Array<{ id: string, description: string, domain?: string, pos?: string[] | null, kind: string }>} */
  const concepts = [
    ...primitives.map(p => ({
      id: String(p.id),
      description: p.plain_description ?? p.description ?? '',
      domain: p.domain ?? null,
      pos: posForDomain(p.domain),
      kind: 'root',
    })),
    ...compounds.map(c => ({
      id: String(c.concept),
      description: c.preferred?.gloss ?? '',
      domain: null,
      pos: posForGloss(c.preferred?.gloss ?? ''),
      kind: 'compound',
    })),
  ];

  // Every English word already spoken for, so a proposal can only ever add.
  const claimedBy = new Map();
  for (const [id, entry] of Object.entries(localization.entries ?? {})) {
    for (const word of [entry.label, ...(entry.aliases ?? [])]) {
      if (word) claimedBy.set(String(word).toLowerCase().trim(), id);
    }
  }
  for (const concept of concepts) {
    const surface = concept.id.replace(/_/g, ' ').toLowerCase();
    if (!claimedBy.has(surface)) claimedBy.set(surface, concept.id);
  }

  // A concept whose description only restates its own name gives the sense scorer nothing to
  // work with, and scores a spurious 100% against any sense containing that name. `plan` came
  // back "be after" at full confidence. Withhold these rather than propose from noise.
  const uninformative = concepts.filter(c => !isInformativeDescription(c.id, c.description));
  const scorable = concepts.filter(c => isInformativeDescription(c.id, c.description));

  const proposals = await proposeAllWordBanks(scorable, claimedBy);
  const byId = new Map(concepts.map(c => [c.id, c]));
  for (const proposal of proposals) {
    const concept = byId.get(proposal.concept);
    proposal.kind = concept?.kind ?? 'unknown';
    proposal.pos = concept?.pos ?? null;
    // Confident means the description settled the sense on its own *and* covered half of
    // itself in the match. Absence of a tie is not enough on its own: `jump` matched "startle"
    // and `tongue` matched the striker inside a bell, both uniquely, both at 33%. A third of a
    // short description is a coincidence, not evidence.
    proposal.confident = Boolean(
      proposal.accepted.length && !proposal.tie_broken && (proposal.score ?? 0) >= 0.5,
    );
  }

  const filled = proposals.filter(p => p.accepted.length);
  const conflicted = proposals.filter(p => p.conflicts.length);
  const skipped = proposals.filter(p => p.skipped);
  const newWords = new Set(filled.flatMap(p => p.accepted));

  return {
    summary: {
      generated_at: new Date().toISOString(),
      concepts: concepts.length,
      concepts_scorable: scorable.length,
      concepts_without_a_usable_description: uninformative.length,
      concepts_with_new_words: filled.length,
      confident: filled.filter(p => p.confident).length,
      needs_review: filled.filter(p => !p.confident).length,
      distinct_new_words: newWords.size,
      concepts_with_conflicts: conflicted.length,
      total_conflicts: proposals.reduce((n, p) => n + p.conflicts.length, 0),
      concepts_skipped: skipped.length,
      english_words_before: claimedBy.size,
    },
    uninformative: uninformative.map(c => c.id),
    proposals,
  };
}

/** @param {Awaited<ReturnType<typeof buildProposal>>} result */
function renderMarkdown({ summary, proposals }) {
  const lines = [];
  lines.push('# Fonoran word bank proposal');
  lines.push('');
  lines.push('Generated by `node scripts/fonoran-word-bank-propose.js` from WordNet, offline.');
  lines.push('Nothing here is applied. Accepting a bank means copying it into');
  lines.push('`data/localizations/en.json`, which is the file the translator reads.');
  lines.push('');
  lines.push('| Measure | Count |');
  lines.push('| --- | --- |');
  lines.push(`| Concepts examined | ${summary.concepts} |`);
  lines.push(`| English words mapped before this proposal | ${summary.english_words_before} |`);
  lines.push(`| Concepts with no usable description, withheld | ${summary.concepts_without_a_usable_description} |`);
  lines.push(`| Concepts gaining words | ${summary.concepts_with_new_words} |`);
  lines.push(`| Distinct new English words | ${summary.distinct_new_words} |`);
  lines.push(`| Sense settled by the description | ${summary.confident} |`);
  lines.push(`| Sense settled by WordNet frequency, needs a read | ${summary.needs_review} |`);
  lines.push(`| Concepts with a contested word | ${summary.concepts_with_conflicts} (${summary.total_conflicts} words) |`);
  lines.push(`| Concepts skipped, sense not determinable | ${summary.concepts_skipped} |`);
  lines.push('');

  const groups = [
    ['Sense settled by the description', proposals.filter(x => x.accepted.length && x.confident),
      'The concept description picked this sense outright. Spot check and accept.'],
    ['Sense settled by frequency', proposals.filter(x => x.accepted.length && !x.confident),
      'Several senses matched the description equally, so WordNet ordering broke the tie. '
      + 'This is where the wrong senses live: `wheel` proposing "roll" came from here.'],
  ];
  for (const [title, rows, note] of groups) {
    if (!rows.length) continue;
    lines.push(`## ${title} (${rows.length})`);
    lines.push('');
    lines.push(note);
    lines.push('');
    lines.push('| Concept | Kind | Sense chosen | Words to add |');
    lines.push('| --- | --- | --- | --- |');
    for (const p of rows) {
      const def = String(p.definition ?? '').replace(/\|/g, ' ').slice(0, 70);
      lines.push(`| \`${p.concept}\` | ${p.kind} | ${def} | ${p.accepted.join(', ')} |`);
    }
    lines.push('');
  }

  const conflicted = proposals.filter(x => x.conflicts.length);
  if (conflicted.length) {
    lines.push('## Contested words');
    lines.push('');
    lines.push('An English word can belong to one concept only, otherwise translation has no');
    lines.push('deterministic answer. These need a ruling: either the word belongs to the');
    lines.push('concept below, or to the one that already holds it.');
    lines.push('');
    lines.push('| Concept | Wants | Currently owned by |');
    lines.push('| --- | --- | --- |');
    for (const p of conflicted) {
      for (const c of p.conflicts) {
        lines.push(`| \`${p.concept}\` | ${c.word} | \`${c.claimed_by}\` |`);
      }
    }
    lines.push('');
  }

  const skipped = proposals.filter(x => x.skipped);
  if (skipped.length) {
    lines.push('## Skipped');
    lines.push('');
    lines.push('| Concept | Reason |');
    lines.push('| --- | --- |');
    for (const p of skipped) {
      lines.push(`| \`${p.concept}\` | ${p.skipped} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const result = await buildProposal();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const mdPath = join(ROOT, 'docs/fonoran-word-bank-proposal.md');
  const jsonPath = join(ROOT, 'docs/fonoran-word-bank-proposal.json');
  await writeFile(mdPath, renderMarkdown(result));
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  const s = result.summary;
  console.log(`Word bank proposal written to ${mdPath}`);
  console.log(`  ${s.concepts} concepts: ${s.concepts_with_new_words} gain words, ${s.concepts_skipped} skipped`);
  console.log(`  ${s.distinct_new_words} distinct new English words (was ${s.english_words_before} mapped)`);
  console.log(`  ${s.total_conflicts} contested word(s) need a ruling`);
}

if (isMainModule(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
