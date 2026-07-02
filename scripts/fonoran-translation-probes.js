#!/usr/bin/env node
/**
 * Run soft translation probes (structural frame checks, no CI assert).
 *
 * Usage:
 *   node scripts/fonoran-translation-probes.js
 *   node scripts/fonoran-translation-probes.js --json
 */
import { runTranslationProbes } from '../tools/fonoran-translation-probes.js';

const asJson = process.argv.includes('--json');
const C = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', bold: '\x1b[1m' };

const report = await runTranslationProbes();

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`${C.bold}Translation probes${C.reset} — ${report.frame_pass}/${report.total} frame checks passed\n`);

for (const p of report.phrases) {
  const mark = p.frame_pass ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
  console.log(`${mark} ${p.en}`);
  console.log(`  ${C.dim}→${C.reset} ${p.roman}${p.unresolved.length ? ` ${C.red}[${p.unresolved.join(', ')}]${C.reset}` : ''}`);
  if (!p.frame_pass) {
    console.log(`  ${C.dim}missing frame heads:${C.reset} ${p.missing.join(', ')}`);
  }
  if (p.note) console.log(`  ${C.dim}note:${C.reset} ${p.note}`);
  console.log();
}
