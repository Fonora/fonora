#!/usr/bin/env node
/**
 * Automated Fonoran refinement loop — gap → propose → gate → accept → build → measure.
 *
 * Run:
 *   npm run fonoran:refine
 *   npm run fonoran:refine -- --max-iterations 3 --top-gaps 30
 *   npm run fonoran:refine -- --dry-run
 *   npm run fonoran:refine -- --skip-llm
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import '../load-env.js';
import {
  runTranslationGapReport,
  diffGapsAgainstBaseline,
  loadGapBaseline,
} from '../tools/fonoran-translation-gaps.js';
import { analyzeGaps } from '../tools/fonoran-gap-analyzer.js';
import {
  createCompoundProposals,
  resolveCompoundProposal,
  resetProposalsCache,
} from '../tools/fonoran-compound-proposals.js';
import { evaluateProposalGate, loadGateContext } from '../tools/fonoran-proposal-gate.js';
import {
  computePhoneticAnalytics,
  savePhoneticAnalytics,
  loadPhoneticAnalytics,
} from '../tools/fonoran-phonetic-analytics.js';
import { promoteAcceptedProposals, promoteAcceptedAliases } from '../tools/fonoran-regen.js';
import { buildFonoran } from '../tools/fonoran-build.js';
import { resolveDataPath } from '../tools/fonoran-data-paths.js';
import { closeStore } from '../tools/fonoran-store.js';
import { resetTranslatorCache } from '../tools/fonoran-translator.js';

function parseArgs(argv) {
  const maxIdx = argv.indexOf('--max-iterations');
  const topIdx = argv.indexOf('--top-gaps');
  return {
    dryRun: argv.includes('--dry-run'),
    skipLlm: argv.includes('--skip-llm'),
    maxIterations: maxIdx !== -1 ? Number(argv[maxIdx + 1]) || 3 : 3,
    topGaps: topIdx !== -1 ? Number(argv[topIdx + 1]) || 30 : 30,
    corpus: argv.includes('--corpus') ? argv[argv.indexOf('--corpus') + 1] : 'stranger',
  };
}

async function loadIterationsDoc() {
  const path = resolveDataPath('refine_iterations');
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return { version: '1.0', iterations: [] };
  }
}

async function saveIterationsDoc(doc) {
  const path = resolveDataPath('refine_iterations');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

function summarizeReport(report) {
  if (!report) return null;
  return {
    generated_at: report.generated_at,
    corpus: report.corpus,
    total_phrases: report.total_phrases,
    clean_phrases: report.clean_phrases,
    coverage_pct: report.coverage_pct,
    distinct_gaps: report.distinct_gaps,
    quality: report.quality,
    levels: (report.levels ?? []).map(l => ({
      level: l.level,
      name: l.name,
      coverage: l.coverage,
      unresolved_words: l.unresolved_words,
    })),
  };
}

function summarizeAnalytics(analytics) {
  if (!analytics) return null;
  return {
    generated_at: analytics.generated_at,
    iteration: analytics.iteration,
    coverage_pct: analytics.coverage_pct,
    distinct_gaps: analytics.distinct_gaps,
    onset_tier_share: analytics.onset_tier_share,
    rhyme_family_share: analytics.rhyme_family_share,
    avg_phonetic_score: analytics.avg_phonetic_score,
    avg_flattened_syllables: analytics.avg_flattened_syllables,
  };
}

function shouldStop(report, iteration) {
  if (report.coverage_pct >= 85) return 'coverage';
  if (report.distinct_gaps <= 40) return 'gaps';
  return null;
}

async function runIteration(n, opts) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Refine iteration ${n}`);
  console.log('='.repeat(60));

  resetTranslatorCache();
  const report = await runTranslationGapReport({
    corpus: opts.corpus,
    resetCache: true,
  });

  const analytics = computePhoneticAnalytics(report, null, n);
  if (!opts.dryRun) await savePhoneticAnalytics(analytics);

  console.log(`Coverage: ${report.coverage_pct}% (${report.clean_phrases}/${report.total_phrases})`);
  console.log(`Distinct gaps: ${report.distinct_gaps}`);

  const baseline = await loadGapBaseline();
  const gapDiff = baseline ? diffGapsAgainstBaseline(report, baseline) : null;
  if (gapDiff?.resolved?.length) {
    console.log(`Resolved vs baseline: ${gapDiff.resolved.length}`);
  }

  const batch = (report.gaps ?? []).slice(0, opts.topGaps).map(g => ({
    word: g.word,
    role: g.role ?? 'concept',
  }));

  if (!batch.length) {
    return { report, analytics, auto_accepted: 0, rejected: 0, deferred: 0, promoted: 0 };
  }

  console.log(`Analyzing top ${batch.length} gap(s)…`);
  const analyses = await analyzeGaps(batch, { concurrency: 3 });

  const gateCtx = await loadGateContext(analytics);
  gateCtx.skipLlm = opts.skipLlm;

  let autoAccepted = 0;
  let rejected = 0;
  let deferred = 0;
  const details = [];

  for (const analysis of analyses) {
    const conceptId = analysis.word?.toLowerCase().replace(/\s+/g, '_') ?? 'gap';
    analysis.concept_id = conceptId;
    analysis.gloss = analysis.word;

    if (opts.dryRun) {
      const gate = await evaluateProposalGate(analysis, gateCtx);
      console.log(`  [dry-run] ${analysis.word}: ${gate.pass ? 'PASS' : gate.reasons.join('; ') || 'fail'}`);
      if (gate.pass) autoAccepted++;
      else if (gate.deferred) deferred++;
      else rejected++;
      details.push({ word: analysis.word, pass: gate.pass, reasons: gate.reasons, deferred: gate.deferred });
      continue;
    }

    const [record] = await createCompoundProposals([{
      ...analysis,
      concept_id: conceptId,
      gloss: analysis.word,
      source: `refine-loop:iter${n}`,
    }]);

    const gate = await evaluateProposalGate(analysis, gateCtx);

    if (gate.pass && (gate.chosenComposition || gate.aliasTarget)) {
      await resolveCompoundProposal(record.id, 'accepted', {
        resolvedBy: 'refine-loop',
        note: gate.aliasTarget
          ? `auto-accept alias → ${gate.aliasTarget}`
          : `auto-accept phonetic=${gate.scores.phonetic?.score?.toFixed(2)} u=${gate.scores.understandability?.score?.toFixed(2)}`,
        chosenComposition: gate.chosenComposition ?? undefined,
      });
      autoAccepted++;
      const label = gate.aliasTarget
        ? `alias → ${gate.aliasTarget}`
        : `[${gate.chosenComposition.join('+')}]`;
      console.log(`  ACCEPT ${analysis.word} → ${label}`);
      details.push({
        word: analysis.word,
        pass: true,
        composition: gate.chosenComposition,
        aliasTarget: gate.aliasTarget ?? null,
      });
    } else if (gate.deferred) {
      deferred++;
      console.log(`  DEFER  ${analysis.word}: ${gate.reasons[0] ?? 'deferred'}`);
      details.push({ word: analysis.word, deferred: true, reasons: gate.reasons });
    } else {
      rejected++;
      console.log(`  REJECT ${analysis.word}: ${gate.reasons.join('; ') || 'failed gates'}`);
      details.push({ word: analysis.word, pass: false, reasons: gate.reasons });
    }
  }

  resetProposalsCache();

  let promoted = { promoted: 0, skipped: 0, already_present: 0 };
  let build = null;

  if (!opts.dryRun && autoAccepted > 0) {
    promoted = await promoteAcceptedProposals();
    const aliasPromoted = await promoteAcceptedAliases();
    console.log(`Promoted ${promoted.promoted} compound(s), ${aliasPromoted.promoted} alias(es) to editorial store`);
    build = await buildFonoran({ approveAll: true });
    console.log(`Build: ${build.roots} roots, ${build.compounds} compounds`);
    try {
      const root = join(dirname(fileURLToPath(import.meta.url)), '..');
      console.log('Rebuilding course phrases from translation cache…');
      execSync('node tools/fonoran-course-phrases-build.js --cache-only', {
        cwd: root,
        stdio: 'inherit',
      });
    } catch (err) {
      console.warn('Course phrase rebuild skipped:', err?.message ?? err);
    }
  }

  const afterReport = opts.dryRun
    ? report
    : await runTranslationGapReport({ corpus: opts.corpus, resetCache: true });

  return {
    report: afterReport,
    analytics,
    before: { coverage_pct: report.coverage_pct, distinct_gaps: report.distinct_gaps },
    after: { coverage_pct: afterReport.coverage_pct, distinct_gaps: afterReport.distinct_gaps },
    auto_accepted: autoAccepted,
    rejected,
    deferred,
    promoted,
    build: build ? { roots: build.roots, compounds: build.compounds } : null,
    top_unresolved_gaps: (afterReport.gaps ?? []).slice(0, 15).map(g => ({ word: g.word, count: g.count })),
    details,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Fonoran refine loop — max ${opts.maxIterations} iter, top ${opts.topGaps} gaps, corpus=${opts.corpus}`);
  if (opts.dryRun) console.log('DRY RUN — no writes except iteration log');
  if (opts.skipLlm) console.log('SKIP LLM — phonetic + understandability gates only');

  const iterDoc = await loadIterationsDoc();
  let lastResult = null;

  for (let i = 1; i <= opts.maxIterations; i++) {
    lastResult = await runIteration(i, opts);

    iterDoc.iterations.push({
      iteration: i,
      at: new Date().toISOString(),
      dry_run: opts.dryRun,
      skip_llm: opts.skipLlm,
      report: summarizeReport(lastResult.report),
      analytics: summarizeAnalytics(lastResult.analytics),
      before: lastResult.before,
      after: lastResult.after,
      auto_accepted: lastResult.auto_accepted,
      rejected: lastResult.rejected,
      deferred: lastResult.deferred,
      promoted: lastResult.promoted,
      build: lastResult.build,
      top_unresolved_gaps: lastResult.top_unresolved_gaps,
      details: lastResult.details,
    });

    if (!opts.dryRun) {
      await saveIterationsDoc(iterDoc);
    }

    const stop = shouldStop(lastResult.report, i);
    if (stop) {
      console.log(`\nStop condition met: ${stop}`);
      break;
    }
  }

  console.log('\nRefine loop complete.');
  if (lastResult) {
    console.log(`Final coverage: ${lastResult.report.coverage_pct}%`);
    console.log(`Final distinct gaps: ${lastResult.report.distinct_gaps}`);
    console.log(`Auto-accepted (last iter): ${lastResult.auto_accepted}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await closeStore();
  const { closeCompoundProposalsStore } = await import('../tools/fonoran-compound-proposals.js');
  await closeCompoundProposalsStore();
});
