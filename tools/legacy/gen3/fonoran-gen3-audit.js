#!/usr/bin/env node
/**
 * Gen 3 human-readability audit report (frozen reference inventory).
 * Writes reports/fonoran-gen3-human-readability-audit.md: not committed (see .gitignore).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  analyzeAmbiguity,
  auditScores,
  generateAuditMarkdown,
} from '../../fonoran-gen3-readability.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ROOTS_PATH = join(ROOT, 'data', 'fonoran-gen3-roots.json');
const AUDIT_PATH = join(ROOT, 'reports', 'fonoran-gen3-human-readability-audit.md');

async function main() {
  const data = JSON.parse(await readFile(ROOTS_PATH, 'utf8'));
  const inventory = data.inventory;
  const derivations = data.derivations ?? [];
  const warnings = analyzeAmbiguity(inventory, derivations);
  const scores = auditScores(inventory, derivations, warnings);
  const md = generateAuditMarkdown({
    inventory,
    derivations,
    warnings,
    scores,
    generatedAt: new Date().toISOString(),
  });
  await mkdir(join(ROOT, 'reports'), { recursive: true });
  await writeFile(AUDIT_PATH, md + '\n');
  console.log(`Audit written: ${AUDIT_PATH}`);
  console.log(`Scores: learnability=${scores.learnability} pronounce=${scores.pronounceability} parse=${scores.parseability}`);
  console.log(`Warnings: ${warnings.length} (${scores.highSeverityCount} high)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
