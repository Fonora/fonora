#!/usr/bin/env node
/**
 * Apply lexicon hygiene rules across the full compounds + localization store.
 *
 * Preview:  npm run fonoran:lexicon:hygiene
 * Apply:     npm run fonoran:lexicon:hygiene -- --apply
 * Apply+build: npm run fonoran:lexicon:hygiene -- --apply --rebuild
 *
 * Rules (see tools/fonoran-lexicon-hygiene.js):
 *   - Inflected English concept ids → lemma rename or alias collapse
 *   - Agentive duplicates (same person+root multiset) → one canonical + aliases
 */

import '../load-env.js';
import { readDoc, writeDoc, closeStore } from '../tools/fonoran-store.js';
import { loadConceptInventory } from '../tools/fonoran-concepts.js';
import { clearLocalizationCache } from '../tools/fonoran-concepts.js';
import {
  planLexiconHygiene,
  applyLexiconHygienePlan,
} from '../tools/fonoran-lexicon-hygiene.js';
import { buildFonoran } from '../tools/fonoran-build.js';

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    rebuild: argv.includes('--rebuild'),
  };
}

function printPlan(plan) {
  const structural = plan.actions.filter(a => a.kind !== 'add_alias');
  const aliases = plan.actions.filter(a => a.kind === 'add_alias');

  console.log(`Planned actions: ${structural.length} structural, ${aliases.length} alias additions\n`);

  if (!structural.length) {
    console.log('No structural changes needed.');
    return;
  }

  for (const a of structural) {
    console.log(`  [${a.kind}] ${a.from} → ${a.to}`);
    console.log(`    ${a.reason}`);
  }

  if (aliases.length) {
    console.log(`\nAlias additions (${aliases.length}):`);
    for (const a of aliases.slice(0, 25)) {
      console.log(`  "${a.alias}" → ${a.target}`);
    }
    if (aliases.length > 25) console.log(`  … and ${aliases.length - 25} more`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const [compoundsDoc, inventory, localeDoc] = await Promise.all([
    readDoc('compounds'),
    loadConceptInventory(),
    readDoc('localization_en'),
  ]);

  const primitiveIds = (inventory?.primitives ?? []).map(p => p.id);
  const plan = await planLexiconHygiene(compoundsDoc?.compounds ?? [], localeDoc?.entries ?? {}, primitiveIds);

  console.log('Fonoran lexicon hygiene apply\n');
  printPlan(plan);

  if (!opts.apply) {
    console.log('\nDry run — no files written. Re-run with --apply to execute, --apply --rebuild to rebuild lab.');
    return;
  }

  if (!plan.actions.some(a => a.kind !== 'add_alias')) {
    console.log('\nNothing to apply.');
    return;
  }

  const result = applyLexiconHygienePlan(plan, compoundsDoc, localeDoc);
  await writeDoc('compounds', result.compoundsDoc);
  await writeDoc('localization_en', result.locale);
  clearLocalizationCache('en');

  console.log(`\nApplied: ${result.summary.renamed} renamed, ${result.summary.removed} removed, ${result.summary.aliases_added} aliases added`);

  if (opts.rebuild) {
    const build = await buildFonoran({ approveAll: true });
    console.log(`Rebuild: ${build.roots} roots, ${build.compounds} compounds (${build.dropped?.length ?? 0} dropped)`);
  } else {
    console.log('Run npm run fonoran:build:approved to sync the lab bucket.');
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await closeStore();
});
