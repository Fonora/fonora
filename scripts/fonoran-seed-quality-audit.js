#!/usr/bin/env node
/**
 * Campfire seed-quality audit — free, no API calls.
 * Run: npm run fonoran:seed-quality-audit
 *
 * Reports compounds whose preferred compositions fail semantic-role rules
 * (e.g. stone+make for hammer). Gate before expensive LLM full inventory.
 */

import { readDoc } from '../tools/fonoran-store.js';
import { auditCompoundCampfireQuality } from '../tools/fonoran-campfire-composition.js';
import { loadRootSemanticFields } from '../tools/fonoran-root-semantic-fields.js';
import { ASSOCIATION_SEEDS } from '../tools/fonoran-expression-candidates.js';
import { isBannedPrimitiveSpelling } from '../tools/fonoran-phonetic-weights.js';

async function main() {
  const [compoundsDoc, approvedDoc, fields] = await Promise.all([
    readDoc('compounds'),
    readDoc('approved_roots'),
    loadRootSemanticFields(),
  ]);
  const live = (compoundsDoc?.compounds ?? []).filter(c => c.state !== 'rejected');
  const report = auditCompoundCampfireQuality(live, { fields });

  // --- phonetic seed check: no ASSOCIATION_SEEDS should use r/j-onset roots ---
  const rootSpelling = Object.fromEntries((approvedDoc?.roots ?? []).map(r => [r.id, r.spelling]));
  const difficultRoots = new Set(
    Object.entries(rootSpelling).filter(([, sp]) => isBannedPrimitiveSpelling(sp)).map(([id]) => id),
  );
  const dirtySeeds = [];
  for (const [concept, seeds] of Object.entries(ASSOCIATION_SEEDS)) {
    for (const seed of seeds) {
      const bad = seed.filter(r => difficultRoots.has(r));
      if (bad.length) {
        dirtySeeds.push({ concept, seed: seed.join('+'), difficult: bad.map(r => `${r}=${rootSpelling[r]}`).join(', ') });
      }
    }
  }
  const phoneticSeedPass = dirtySeeds.length === 0;

  const bannedRoots = (approvedDoc?.roots ?? []).filter(r => isBannedPrimitiveSpelling(r.spelling));
  const primitivePhoneticPass = bannedRoots.length === 0;

  console.log('Fonoran campfire seed-quality audit');
  console.log(`Compounds: ${report.total}`);
  console.log(`Pass: ${report.pass_count} (${(report.pass_rate * 100).toFixed(1)}%)`);
  console.log(`Failures: ${report.failure_count} | Warnings: ${report.warning_count}`);
  console.log(`Gate: ${report.gate_pass ? 'PASS' : 'FAIL'} (need ≥92% pass, 0 hard failures)`);
  console.log(`Phonetic seed purity: ${phoneticSeedPass ? 'PASS' : 'FAIL'} (${dirtySeeds.length} seeds with r/j-onset roots)`);
  console.log(`Primitive root phonetics: ${primitivePhoneticPass ? 'PASS' : 'FAIL'} (${bannedRoots.length} approved roots with banned r/j onsets)`);
  console.log('');

  if (report.failures.length) {
    console.log('Hard failures (fix before LLM full inventory):');
    for (const f of report.failures.slice(0, 40)) {
      console.log(`  ${f.concept}: ${f.composition} — ${f.issues[0] ?? 'campfire fail'} [${f.preferred_source}]`);
    }
    if (report.failures.length > 40) {
      console.log(`  … and ${report.failures.length - 40} more`);
    }
  }

  if (report.warnings.length) {
    console.log('\nWarnings (review):');
    for (const w of report.warnings.slice(0, 15)) {
      console.log(`  ${w.concept}: ${w.composition} — ${w.issues[0] ?? 'weak'}`);
    }
  }

  if (!phoneticSeedPass) {
    console.log('\nPhonetic seed violations (r/j-onset roots in ASSOCIATION_SEEDS):');
    for (const d of dirtySeeds.slice(0, 20)) {
      console.log(`  ${d.concept}: ${d.seed} — difficult onset: ${d.difficult}`);
    }
    if (dirtySeeds.length > 20) console.log(`  … and ${dirtySeeds.length - 20} more`);
  }

  if (!primitivePhoneticPass) {
    console.log('\nBanned primitive roots (re-run npm run fonoran:build):');
    for (const r of bannedRoots) {
      console.log(`  ${r.id} → ${r.spelling} (onset ${r.spelling?.[0]})`);
    }
  }

  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const outPath = join(root, 'data/fonoran-seed-quality-audit.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify({ generated_at: new Date().toISOString(), phonetic_seed_pass: phoneticSeedPass, primitive_phonetic_pass: primitivePhoneticPass, banned_primitive_roots: bannedRoots.map(r => ({ id: r.id, spelling: r.spelling })), dirty_seeds: dirtySeeds, ...report }, null, 2) + '\n');
  console.log(`\nWrote ${outPath}`);

  const gatePass = report.gate_pass && phoneticSeedPass && primitivePhoneticPass;
  process.exit(gatePass ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
