#!/usr/bin/env node
/**
 * Batch gap analyzer — classify top-N translation gaps via LLM and queue proposals.
 *
 * Run:
 *   node scripts/fonoran-gap-analyze-batch.js --top 50
 *   node scripts/fonoran-gap-analyze-batch.js --top 50 --from stranger
 *   node scripts/fonoran-gap-analyze-batch.js --top 20 --dry-run
 */

import '../load-env.js';
import { analyzeGaps, llmConfigured } from '../tools/fonoran-gap-analyzer.js';
import { createCompoundProposals } from '../tools/fonoran-compound-proposals.js';
import {
  loadLatestGapReport,
  loadStrangerGapReport,
  runTranslationGapReport,
} from '../tools/fonoran-translation-gaps.js';
import { closeStore } from '../tools/fonoran-store.js';

const argv = process.argv.slice(2);

function parseArg(flag, fallback = null) {
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : fallback;
}

async function loadReport(source) {
  if (source === 'stranger') {
    let report = await loadStrangerGapReport();
    if (!report) {
      console.log('No stranger gap report yet — running gap analysis…');
      report = await runTranslationGapReport({ corpus: 'stranger', resetCache: true });
    }
    return report;
  }
  if (source === 'latest') {
    let report = await loadLatestGapReport();
    if (!report) {
      console.log('No latest gap report yet — running golden corpus gap analysis…');
      report = await runTranslationGapReport({ corpus: 'golden', resetCache: true });
    }
    return report;
  }
  throw new Error(`Unknown --from source: ${source} (use stranger or latest)`);
}

async function main() {
  const top = Math.max(1, Number(parseArg('--top', '50')) || 50);
  const source = parseArg('--from', 'stranger');
  const dryRun = argv.includes('--dry-run');

  if (!dryRun && !llmConfigured()) {
    throw new Error('ANTHROPIC_API_KEY not set (add to .env)');
  }

  const report = await loadReport(source);
  const gaps = (report.gaps ?? []).slice(0, top).map(g => ({
    word: g.word,
    role: g.role ?? 'concept',
  }));

  if (!gaps.length) {
    console.log('No gaps to analyze.');
    return;
  }

  console.log(`Analyzing top ${gaps.length} gap(s) from ${source} report…`);

  if (dryRun) {
    for (const g of gaps) {
      console.log(`  ${String(g.word).padEnd(20)} (${g.role})`);
    }
    return;
  }

  const results = await analyzeGaps(gaps, { concurrency: 3 });
  let saved = 0;

  for (const analysis of results) {
    if (analysis.classification === 'unknown') {
      console.log(`  SKIP ${analysis.word}: LLM failed or unclassified`);
      continue;
    }
    const conceptId = analysis.word.toLowerCase().replace(/\s+/g, '_');
    await createCompoundProposals([{
      ...analysis,
      concept_id: conceptId,
      source: `gap-batch:${source}`,
    }]);
    saved += 1;
    console.log(`  OK   ${analysis.word} → ${analysis.classification} (${analysis.valid_compositions?.length ?? 0} valid comps)`);
  }

  console.log(`\nSaved ${saved} proposal(s) to the compound proposal store.`);
  console.log('Review in Word Manager, accept, then npm run fonoran:build');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await closeStore();
});
