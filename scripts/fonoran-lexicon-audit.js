#!/usr/bin/env node
/**
 * Lexicon hygiene audit — inflected concept ids, agentive duplicates, alias gaps.
 *
 * Run: node scripts/fonoran-lexicon-audit.js
 */

import '../load-env.js';
import { readFile } from 'node:fs/promises';
import { readDoc, closeStore } from '../tools/fonoran-store.js';
import { loadConceptInventory } from '../tools/fonoran-concepts.js';
import { loadLocalization } from '../tools/fonoran-concepts.js';
import {
  auditAgentiveDuplicates,
  inferLemma,
  inferReliableLemma,
  isInflectedSurface,
} from '../tools/fonoran-lexicon-hygiene.js';
import { loadInterpretationRules } from '../tools/fonoran-interpretation.js';
import { resolveDataPath } from '../tools/fonoran-data-paths.js';

async function auditAliasGaps(report, locData, compoundIds) {
  const gaps = [];
  for (const row of report.gaps ?? []) {
    const word = String(row.word ?? '').toLowerCase();
    if (!word) continue;
    const rules = await loadInterpretationRules().catch(() => null);
    if (!isInflectedSurface(word, rules)) continue;
    const lemma = inferLemma(word, rules);
    const target = compoundIds.has(lemma) ? lemma : null;
    if (!target) continue;
    const aliases = new Set((locData[target]?.aliases ?? []).map(a => a.toLowerCase()));
    if (aliases.has(word)) continue;
    gaps.push({ surface: word, lemma: target });
  }
  return gaps;
}

async function main() {
  const [compoundsDoc, inventory, locData, rules] = await Promise.all([
    readDoc('compounds'),
    loadConceptInventory(),
    loadLocalization('en'),
    loadInterpretationRules().catch(() => null),
  ]);

  const compoundDefs = compoundsDoc?.compounds ?? [];
  const primitiveIds = (inventory?.primitives ?? []).map(p => p.id);
  const compoundIds = new Set(compoundDefs.map(c => c.concept));
  const lexicon = { compoundIds, primitiveIds: new Set(primitiveIds) };

  const inflected = (compoundDefs ?? [])
    .map(def => {
      const concept = def.concept;
      if (!concept) return null;
      const lemma = inferReliableLemma(concept, rules, lexicon);
      if (!lemma || lemma === concept) return null;
      return { concept, suggested_lemma: lemma, gloss: def.preferred?.gloss ?? def.gloss };
    })
    .filter(Boolean);
  const agentiveDups = auditAgentiveDuplicates(primitiveIds, compoundDefs);

  let aliasGaps = [];
  try {
    const reportPath = resolveDataPath('stranger_gap_report');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    aliasGaps = await auditAliasGaps(report, locData, compoundIds);
  } catch {
    /* gap report optional */
  }

  console.log('Fonoran lexicon hygiene audit\n');
  console.log(`Compounds: ${compoundDefs.length}`);

  console.log(`\nInflected concept ids (${inflected.length}):`);
  if (!inflected.length) {
    console.log('  (none)');
  } else {
    for (const row of inflected) {
      console.log(`  ${row.concept} → suggested lemma: ${row.suggested_lemma}`);
    }
  }

  console.log(`\nAgentive duplicate groups (${agentiveDups.length}):`);
  if (!agentiveDups.length) {
    console.log('  (none)');
  } else {
    for (const g of agentiveDups) {
      const names = g.members.map(m => m.concept).join(', ');
      console.log(`  [${g.root_multiset}] ${names}`);
    }
  }

  console.log(`\nInflected gap words missing localization alias (${aliasGaps.length}):`);
  if (!aliasGaps.length) {
    console.log('  (none)');
  } else {
    for (const row of aliasGaps.slice(0, 20)) {
      console.log(`  ${row.surface} → add alias on "${row.lemma}"`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await closeStore();
});
