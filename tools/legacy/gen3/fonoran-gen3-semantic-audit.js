#!/usr/bin/env node
/** Gen 3.1 semantic integrity audit → reports/ (gitignored). */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  runSemanticIntegrityAudit,
  generateSemanticIntegrityMarkdown,
} from './fonoran-gen3-semantic-integrity.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

async function main() {
  const gen31 = JSON.parse(await readFile(join(ROOT, 'data/fonoran-gen3-1-roots.json'), 'utf8'));
  const gen3 = JSON.parse(await readFile(join(ROOT, 'data/fonoran-gen3-roots.json'), 'utf8'));
  const config = JSON.parse(await readFile(join(ROOT, 'data/fonoran-gen3-1-config.json'), 'utf8'));

  const audit = runSemanticIntegrityAudit(gen31, gen3, config);
  const md = generateSemanticIntegrityMarkdown(audit);
  const outPath = join(ROOT, 'reports', 'fonoran-gen3-1-semantic-integrity-audit.md');
  await mkdir(join(ROOT, 'reports'), { recursive: true });
  await writeFile(outPath, md + '\n');

  console.log(`Semantic integrity audit: ${outPath}`);
  console.log(`Average fidelity: ${audit.summary.average_fidelity}`);
  console.log(`High repair core: ${audit.summary.high_repair_core_count}`);
  console.log(`Compounds elegant: ${audit.summary.compounds_elegant}/${audit.summary.compounds_total}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
