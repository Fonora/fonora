#!/usr/bin/env node
/**
 * Fonoran translation gap report + golden regression runner (CLI).
 *
 * Runs the English phrase corpus (data/fonoran-translation-tests.json) through
 * the translator. The corpus is a GOLDEN snapshot: every phrase carries the
 * expected `fon` (roman) output the project commits to. This is the permanent
 * regression suite — run it on every grammar/root/rule change.
 *
 * Usage:
 *   node scripts/fonoran-translation-gaps.js              # full human report
 *   node scripts/fonoran-translation-gaps.js --gaps       # only the gap summary
 *   node scripts/fonoran-translation-gaps.js --json       # machine-readable JSON
 *   node scripts/fonoran-translation-gaps.js --level 7    # one level only
 *   node scripts/fonoran-translation-gaps.js --assert     # FAIL (exit 1) on any
 *                                                         #   drift from golden
 *                                                         #   or any NEW gap
 *                                                         #   beyond the baseline
 *   node scripts/fonoran-translation-gaps.js --update-golden  # accept current
 *                                                         #   output as the new
 *                                                         #   golden + gap baseline
 *   node scripts/fonoran-translation-gaps.js --update-gap-baseline # accept the
 *                                                         #   current honest gaps
 *                                                         #   as the new baseline
 *   node scripts/fonoran-translation-gaps.js --corpus stranger   # stranger corpus gap report
 *   node scripts/fonoran-translation-gaps.js --corpus stranger --json
 *   node scripts/fonoran-translation-gaps.js --engine llm   # LLM semantic compiler
 */
import {
  runTranslationGapReport,
  updateGoldenCorpus,
  loadGapBaseline,
  saveGapBaseline,
  diffGapsAgainstBaseline,
} from '../tools/fonoran-translation-gaps.js';
import { closeStore } from '../tools/fonoran-store.js';

const argv = process.argv.slice(2);
const gapsOnly = argv.includes('--gaps');
const asJson = argv.includes('--json');
const doAssert = argv.includes('--assert');
const doUpdate = argv.includes('--update-golden');
const doUpdateBaseline = argv.includes('--update-gap-baseline');
const levelIdx = argv.indexOf('--level');
const onlyLevel = levelIdx !== -1 ? Number(argv[levelIdx + 1]) : null;
const corpusIdx = argv.indexOf('--corpus');
const corpusArg = corpusIdx !== -1 ? argv[corpusIdx + 1] : 'golden';
const engineIdx = argv.indexOf('--engine');
const engineArg = engineIdx !== -1 ? argv[engineIdx + 1] : 'legacy';

const gapReportOpts = () => ({
  level: onlyLevel,
  resetCache: true,
  corpus: corpusArg,
  engine: engineArg,
});

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const color = (c, s) => (asJson ? s : `${c}${s}${C.reset}`);

/** Strict regression mode: diff actual roman vs golden `fon`, fail on any drift. */
async function runAssert() {
  const report = await runTranslationGapReport({ ...gapReportOpts(), suggest: false });
  const graded = report.phrases.filter(p => typeof p.expected === 'string');
  const mismatches = graded.filter(p => !p.matches_golden);

  // Gap-baseline regression: fail on any NEW honest gap beyond the tracked
  // baseline (curation may only shrink it). Skipped if no baseline exists yet.
  const baseline = await loadGapBaseline();
  const gapDiff = baseline ? diffGapsAgainstBaseline(report, baseline) : null;
  const newGaps = gapDiff?.new ?? [];
  const ok = mismatches.length === 0 && newGaps.length === 0;

  if (asJson) {
    console.log(JSON.stringify({
      ok,
      total: graded.length,
      mismatches: mismatches.map(p => ({ phrase: p.phrase, expected: p.expected, got: p.roman })),
      new_gaps: newGaps,
      resolved_gaps: gapDiff?.resolved ?? [],
      quality: report.quality,
      collapses: report.collapses,
    }, null, 2));
    return ok;
  }

  if (newGaps.length) {
    console.log(color(C.red + C.bold, `✗ New translation gap(s) beyond baseline`) +
      ` — ${newGaps.length}: ${newGaps.join(', ')}`);
    console.log(color(C.dim, 'If intended, accept them with: node scripts/fonoran-translation-gaps.js --update-gap-baseline\n'));
  } else if (baseline && gapDiff.resolved.length) {
    console.log(color(C.green, `✓ ${gapDiff.resolved.length} gap(s) newly resolved: ${gapDiff.resolved.join(', ')}`) +
      color(C.dim, ' — shrink the baseline with --update-gap-baseline\n'));
  }

  if (!graded.length) {
    console.log(color(C.yellow, 'No golden `fon` values found in corpus — nothing to assert.'));
    console.log(color(C.dim, 'Seed them with: node scripts/fonoran-translation-gaps.js --update-golden'));
    return true;
  }

  if (mismatches.length === 0) {
    console.log(color(C.green + C.bold, `✓ Golden regression passed`) +
      ` — ${graded.length}/${graded.length} phrases match.`);
  } else {
    console.log(color(C.red + C.bold, `✗ Golden regression FAILED`) +
      ` — ${mismatches.length}/${graded.length} phrase(s) drifted:\n`);
    for (const p of mismatches) {
      console.log(`  ${color(C.bold, p.phrase)}`);
      console.log(`    ${color(C.dim, 'expected')} ${color(C.green, p.expected || '(empty)')}`);
      console.log(`    ${color(C.dim, 'got     ')} ${color(C.red, p.roman || '(empty)')}`);
    }
    console.log(`\n${color(C.dim, 'If these changes are intentional, accept them with:')}`);
    console.log(color(C.dim, '  node scripts/fonoran-translation-gaps.js --update-golden'));
  }

  // Informational: soft reviews + concept collapses (do not fail the suite).
  const q = report.quality;
  console.log(`\n${color(C.cyan, 'Quality')}: ${color(C.green, q.pass_phrases + ' pass')}, ` +
    `${color(C.yellow, q.soft_phrases + ' review')}, ${color(C.red, q.hard_phrases + ' with gaps')} ` +
    `(${q.tokens.pass} pass / ${q.tokens.soft} soft / ${q.tokens.hard} gap tokens).`);
  if (report.collapses.length) {
    console.log(`${color(C.dim, 'Concept collapses (distinct words sharing one root) — review:')}`);
    for (const c of report.collapses.slice(0, 8)) {
      console.log(`  ${color(C.bold, c.root)} ← ${c.words.join(', ')}`);
    }
  }
  return ok;
}

async function runUpdate() {
  const { updated, levels, gaps } = await updateGoldenCorpus();
  console.log(color(C.green + C.bold, `Updated golden corpus`) +
    ` — ${updated} phrases across ${levels} levels rewritten from current output.`);
  console.log(color(C.dim, `Gap baseline refreshed — ${gaps} distinct honest gap(s).`));
  console.log(color(C.dim, 'Review the git diff to confirm the new baseline is intended.'));
}

async function runUpdateBaseline() {
  const report = await runTranslationGapReport({ ...gapReportOpts(), suggest: false });
  const words = (report.gaps ?? []).map(g => g.word);
  const gaps = await saveGapBaseline(words);
  console.log(color(C.green + C.bold, `Updated gap baseline`) +
    ` — ${gaps.length} distinct honest gap(s) accepted.`);
  console.log(color(C.dim, 'Review the git diff to confirm the new baseline is intended.'));
}

async function runReport() {
  const report = await runTranslationGapReport({
    ...gapReportOpts(),
    suggest: true,
  });

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
        const drift = typeof p.expected === 'string' && !p.matches_golden;
        const status = drift
          ? color(C.red, '≠ golden')
          : p.quality.gate === 'hard'
            ? color(C.red, `✗ ${p.quality.hard}`)
            : p.quality.gate === 'soft'
              ? color(C.yellow, '~ review')
              : color(C.green, '✓');
        console.log(`  ${status}  ${color(C.dim, p.phrase)}`);
        console.log(`      ${color(C.yellow, p.roman || '(empty)')}`);
        if (drift) console.log(`      ${color(C.dim, 'expected:')} ${color(C.green, p.expected || '(empty)')}`);
        if (p.gaps?.length) console.log(`      ${color(C.red, 'gap: ' + p.gaps.map(g => g.english).join(', '))}`);
        if (p.review?.length) console.log(`      ${color(C.yellow, 'review: ' + p.review.map(r => `${r.english}→${r.fonoran}(${r.kind})`).join(', '))}`);
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
      console.log(`  ${color(C.red, String(g.count).padStart(2))}×  ${color(C.bold, g.word)} ${color(C.dim, `(${g.role})`)}`);
      console.log(`        ${color(C.dim, g.samples[0] ?? '')}`);
      if (g.suggestions?.length) {
        const s = g.suggestions
          .map(x => `${x.fonoran}=${x.concept_id} ${color(C.dim, `(${x.reason})`)}`)
          .join(', ');
        console.log(`        ${color(C.cyan, 'suggest:')} ${s}`);
      }
    }
    console.log(color(C.dim, '\n  Suggestions are WordNet proposals for human review — approve into localizations/en.json.'));
  }

  if (report.collapses.length) {
    console.log(`\n${color(C.bold + C.cyan, 'Concept collapses — distinct words sharing one root')}`);
    console.log(color(C.dim, '─'.repeat(56)));
    for (const c of report.collapses.slice(0, 12)) {
      console.log(`  ${color(C.bold, c.root)}  ${color(C.dim, '←')} ${c.words.join(', ')}`);
    }
  }

  const q = report.quality;
  console.log(`\n${color(C.bold, 'Overall')}: ${report.clean_phrases}/${report.total_phrases} phrases fully resolved ` +
    `(${color(C.cyan, report.coverage_pct + '%')}), ` +
    `${color(C.red, String(report.distinct_gaps))} distinct missing concepts.`);
  console.log(`${color(C.dim, 'Quality:')} ${color(C.green, q.pass_phrases + ' pass')} · ` +
    `${color(C.yellow, q.soft_phrases + ' review')} · ${color(C.red, q.hard_phrases + ' with gaps')}.`);
}

async function main() {
  if (doUpdate) return runUpdate();
  if (doUpdateBaseline) return runUpdateBaseline();
  if (doAssert) {
    const ok = await runAssert();
    if (!ok) process.exitCode = 1;
    return;
  }
  return runReport();
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await closeStore();
});
