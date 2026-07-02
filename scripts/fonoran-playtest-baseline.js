#!/usr/bin/env node
/**
 * Phase IV playtest baseline — smoke-test core teaching-tree compounds in the lab
 * and write human playtest prompts for Puzzle Conversation.
 *
 * Run: npm run fonoran:playtest:baseline
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBucket, getLab } from '../tools/fonoran-sound-bucket.js';
import { buildPuzzleChallenge } from '../tools/fonoran-playtests.js';
import { readDoc } from '../tools/fonoran-store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PRIORITY_CONCEPTS = [
  'community', 'identity', 'memory', 'tribe', 'war',
  'shared_meaning', 'language', 'exchange', 'money',
  'knowledge', 'teacher', 'tool', 'weapon', 'nation',
];

async function main() {
  const lab = await getLab(await loadBucket());
  const compounds = lab?.compounds ?? [];
  const byConcept = new Map(compounds.map(c => [c.concept_id, c]));

  const results = [];
  const missing = [];

  for (const conceptId of PRIORITY_CONCEPTS) {
    const compound = byConcept.get(conceptId);
    if (!compound) {
      missing.push(conceptId);
      continue;
    }
    const challenge = await buildPuzzleChallenge({ lab, conceptId });
    results.push({
      concept_id: conceptId,
      spelling: challenge.spelling,
      composition_readable: challenge.composition_readable,
      understandability: challenge.understandability,
      alternate_count: challenge.alternate_forms?.length ?? 0,
      choices: challenge.choices,
    });
  }

  const playtests = await readDoc('playtests');
  const playtested = new Set((playtests?.rounds ?? []).map(r => r.concept_id));

  const lines = [];
  lines.push('# Phase IV playtest baseline');
  lines.push('');
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Smoke test');
  lines.push('');
  lines.push(`- Priority concepts: ${PRIORITY_CONCEPTS.length}`);
  lines.push(`- Present in lab: ${results.length}`);
  lines.push(`- Missing from lab: ${missing.length}${missing.length ? ` (${missing.join(', ')})` : ''}`);
  lines.push(`- Previously playtested (any concept): ${playtested.size}`);
  lines.push('');
  if (missing.length) {
    lines.push('### Missing (investigate build)');
    lines.push('');
    for (const id of missing) lines.push(`- ${id}`);
    lines.push('');
  }
  lines.push('## Priority teaching-tree prompts');
  lines.push('');
  lines.push('Use Puzzle Conversation at `/language#puzzle` to record recovery for each:');
  lines.push('');
  for (const r of results) {
    lines.push(`### ${r.concept_id}`);
    lines.push('');
    lines.push(`- **Spelling:** \`${r.spelling}\``);
    lines.push(`- **Tree:** ${r.composition_readable ?? 'n/a'}`);
    lines.push(`- **Understandability (heuristic):** ${r.understandability ?? 'n/a'}`);
    lines.push(`- **Alternates in lab:** ${r.alternate_count}`);
    lines.push(`- **Playtested before:** ${playtested.has(r.concept_id) ? 'yes' : 'no'}`);
    lines.push('');
  }
  lines.push('## Recording');
  lines.push('');
  lines.push('After each round, recovery data is stored in `data/fonoran-playtests.json`.');
  lines.push('Compare heuristic rank vs human recovery to validate Phase IV teaching trees.');
  lines.push('');

  const compoundsDoc = await readDoc('compounds');
  const llmPromoted = (compoundsDoc?.compounds ?? []).filter(c => c.preferred_source === 'llm_consensus');
  if (llmPromoted.length) {
    lines.push('## LLM-promoted compounds (Session 4)');
    lines.push('');
    lines.push('These preferred forms changed after v3 intuition ranking. Test each in Puzzle Conversation:');
    lines.push('');
    for (const c of llmPromoted.sort((a, b) => a.concept.localeCompare(b.concept))) {
      const labRow = byConcept.get(c.concept);
      const spelling = labRow?.spelling ?? 'n/a';
      const comp = c.preferred?.composition?.join(' + ') ?? 'n/a';
      lines.push(`- **${c.concept}** — \`${spelling}\` (${comp}) · [/language#puzzle?concept=${c.concept}](/language#puzzle?concept=${c.concept})`);
    }
    lines.push('');
  }

  const outPath = join(ROOT, 'docs/fonoran-phase4-playtest-baseline.md');
  writeFileSync(outPath, lines.join('\n'));

  console.log(`Playtest baseline written to ${outPath}`);
  console.log(`  ${results.length}/${PRIORITY_CONCEPTS.length} priority concepts ready in lab`);
  if (missing.length) {
    console.error(`  Missing: ${missing.join(', ')}`);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
