#!/usr/bin/env node
/**
 * Spoken confusability audit CLI.
 * Run: npm run fonoran:compound-confusability
 */

import { readDoc } from '../tools/fonoran-store.js';
import { buildCompositionResolver } from '../tools/fonoran-composition-resolve.js';
import { auditCompoundConfusability } from '../tools/fonoran-compound-confusability.js';

async function main() {
  const json = process.argv.includes('--json');
  const [compoundsDoc, approved] = await Promise.all([
    readDoc('compounds'),
    readDoc('approved_roots'),
  ]);
  const rootById = Object.fromEntries((approved?.roots ?? []).map(r => [r.id, r.spelling]));
  const primitiveIds = (approved?.roots ?? []).map(r => r.id);
  const resolver = buildCompositionResolver(primitiveIds, compoundsDoc?.compounds ?? []);
  const report = auditCompoundConfusability(compoundsDoc?.compounds ?? [], rootById, resolver);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('Fonoran compound confusability audit');
  console.log(`  Compounds: ${report.compound_count}`);
  console.log(`  Near pairs: ${report.near_pair_count}`);
  console.log(`  Avg boundary score: ${(report.avg_boundary_score * 100).toFixed(1)}%`);
  if (report.near_pairs.length) {
    console.log('\nTop near-confusable pairs:');
    for (const p of report.near_pairs.slice(0, 15)) {
      console.log(`  ${p.a} (${p.surfaceA}) ↔ ${p.b} (${p.surfaceB}) — distinctness ${(p.distinctness * 100).toFixed(0)}%`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
