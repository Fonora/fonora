#!/usr/bin/env node
/**
 * Run translation probes — structural frame checks for complex English.
 *
 * Probes with status "pass" gate regression when --assert is set; status
 * "broken" probes are informational (known gaps, not CI failures).
 *
 * Usage:
 *   node scripts/fonoran-translation-probes.js
 *   node scripts/fonoran-translation-probes.js --json
 *   node scripts/fonoran-translation-probes.js --assert
 */
import { runTranslationProbes } from '../tools/fonoran-translation-probes.js';
import { closeStore } from '../tools/fonoran-store.js';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const doAssert = argv.includes('--assert');
const C = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  dim: '\x1b[2m', bold: '\x1b[1m', cyan: '\x1b[36m',
};
const color = (c, s) => (asJson ? s : `${c}${s}${C.reset}`);

const report = await runTranslationProbes();

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const headline = doAssert && !report.ok
    ? color(C.red + C.bold, `✗ Probe regression FAILED`)
    : doAssert
      ? color(C.green + C.bold, `✓ Probe regression passed`)
      : `${C.bold}Translation probes${C.reset}`;
  console.log(`${headline} — ${report.frame_pass}/${report.total} frame checks, ` +
    `${report.committed_pass} committed pass / ${report.committed_broken} known broken\n`);

  for (const p of report.phrases) {
    const isBroken = p.status === 'broken';
    const mark = p.regression
      ? color(C.red, '✗ REGRESSION')
      : p.frame_pass
        ? color(C.green, '✓')
        : isBroken
          ? color(C.yellow, '~ broken')
          : color(C.red, '✗');
    console.log(`${mark} ${p.en}`);
    console.log(`  ${C.dim}→${C.reset} ${p.roman}${p.unresolved.length ? ` ${color(C.red, `[${p.unresolved.join(', ')}]`)}` : ''}`);
    if (!p.frame_pass) {
      console.log(`  ${C.dim}missing frame heads:${C.reset} ${p.missing.join(', ')}`);
    }
    if (p.note) console.log(`  ${C.dim}note:${C.reset} ${p.note}`);
    console.log();
  }

  if (report.committed_broken) {
    console.log(color(C.dim, `${report.committed_broken} probe(s) marked broken — expected failures, not CI gates.`));
  }
  if (doAssert && report.regressions) {
    console.log(color(C.red, `\n${report.regressions} committed pass probe(s) regressed.`));
  }
}

if (doAssert && !report.ok) process.exitCode = 1;

await closeStore();
