#!/usr/bin/env node
/**
 * Fonoran translation gap report (CLI).
 *
 * Runs the English phrase corpus (data/fonoran-translation-tests.json) through
 * the translator and surfaces where the language is missing roots/compounds.
 * Shares its analysis with the lab GUI via tools/fonoran-translation-gaps.js.
 *
 * Usage:
 *   node scripts/fonoran-translation-gaps.js            # full report
 *   node scripts/fonoran-translation-gaps.js --gaps     # only the gap summary
 *   node scripts/fonoran-translation-gaps.js --json     # machine-readable JSON
 *   node scripts/fonoran-translation-gaps.js --level 7  # one level only
 */
import { runTranslationGapReport } from '../tools/fonoran-translation-gaps.js';
import { closeStore } from '../tools/fonoran-store.js';

const argv = process.argv.slice(2);
const gapsOnly = argv.includes('--gaps');
const asJson = argv.includes('--json');
const levelIdx = argv.indexOf('--level');
const onlyLevel = levelIdx !== -1 ? Number(argv[levelIdx + 1]) : null;

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const color = (c, s) => (asJson ? s : `${c}${s}${C.reset}`);

async function main() {
  const report = await runTranslationGapReport({ level: onlyLevel, resetCache: true });

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!gapsOnly) {
    const byLevel = new Map();
    for (const p of report.phrases) {
      if (!byLevel.has(p.level)) byLevel.set(p.level, []);
      byLevel.get(p.level).push(p);
    }
    for (const lvl of report.levels) {
      console.log(`\n${color(C.bold + C.cyan, `Level ${lvl.level}: ${lvl.name}`)}`);
      console.log(color(C.dim, '─'.repeat(56)));
      for (const p of byLevel.get(lvl.level) ?? []) {
        const status = p.unresolved.length === 0
          ? color(C.green, '✓')
          : color(C.red, `✗ ${p.unresolved.length}`);
        console.log(`  ${status}  ${color(C.dim, p.phrase)}`);
        console.log(`      ${color(C.yellow, p.roman || '(empty)')}`);
        if (p.unresolved.length) {
          console.log(`      ${color(C.red, 'missing: ' + p.unresolved.join(', '))}`);
        }
      }
    }
  }

  console.log(`\n${color(C.bold + C.cyan, 'Coverage by level')}`);
  console.log(color(C.dim, '─'.repeat(56)));
  for (const s of report.levels) {
    const pct = s.coverage === 100 ? color(C.green, `${s.coverage}%`) : color(C.yellow, `${s.coverage}%`);
    console.log(`  L${String(s.level).padStart(2)}  ${pct.padEnd(16)} ${s.clean}/${s.phrases} clean  ${color(C.dim, s.name)}`);
  }

  console.log(`\n${color(C.bold + C.cyan, 'Gap summary — missing concepts (by frequency)')}`);
  console.log(color(C.dim, '─'.repeat(56)));
  if (report.gaps.length === 0) {
    console.log(color(C.green, '  No gaps — every phrase fully resolved.'));
  } else {
    for (const g of report.gaps) {
      console.log(`  ${color(C.red, String(g.count).padStart(2))}×  ${color(C.bold, g.word)}`);
      console.log(`        ${color(C.dim, g.samples[0] ?? '')}`);
    }
  }

  console.log(`\n${color(C.bold, 'Overall')}: ${report.clean_phrases}/${report.total_phrases} phrases fully resolved ` +
    `(${color(C.cyan, report.coverage_pct + '%')}), ` +
    `${color(C.red, String(report.distinct_gaps))} distinct missing concepts.`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await closeStore();
});
