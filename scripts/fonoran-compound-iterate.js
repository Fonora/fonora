#!/usr/bin/env node
/**
 * LLM iteration on compound compositions (NOT a re-rank of ASSOCIATION_SEEDS).
 *
 * Examples:
 *   npm run fonoran:compound-iterate -- law --dry-run
 *   npm run fonoran:compound-iterate -- --concepts=law,government --force --apply
 *   npm run fonoran:compound-iterate -- --limit=20 --apply
 *
 * --concepts implies --replace (apply best LLM proposal, not heuristic re-pick).
 * --force unlocks playtest/human/locked rows for named concepts.
 *
 * Then: npm run fonoran:build:approved
 */

import { runCompoundIterate } from '../tools/fonoran-compound-iterate.js';

const result = await runCompoundIterate(process.argv.slice(2));

console.log(`Compound iterate: ${result.iterated} concept(s) processed`);
if (result.dryRun) console.log('(dry run — no seeds or proposals written)');

if (result.skipped?.length) {
  console.log('\nSkipped:');
  for (const s of result.skipped) {
    console.log(`  ${s.concept.padEnd(16)} ${s.reason}`);
  }
}

console.log('');
for (const r of result.results ?? []) {
  const from = r.from?.join('+') ?? '?';
  const to = r.best?.join('+') ?? '—';
  const llm = r.llm_candidates?.length ? ` [LLM: ${r.llm_candidates.join(' | ')}]` : '';
  const err = r.llm_error ? ` ERROR: ${r.llm_error}` : '';
  console.log(
    `  ${r.concept.padEnd(16)} ${r.action.padEnd(18)} ${from} → ${to}${llm}${err}`,
  );
}

if (result.applied?.length) {
  console.log(`\nApplied to fonoran-compounds.json: ${result.applied.join(', ')}`);
  console.log('Run: npm run fonoran:build:approved');
}
if (result.proposed?.length) {
  console.log(`\nProposals queued: ${result.proposed.join(', ')}`);
}
