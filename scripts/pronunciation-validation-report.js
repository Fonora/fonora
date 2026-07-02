/**
 * Batch pronunciation validation report: uses eSpeak for real-word IPA.
 * Output: reports/pronunciation-validation-report.md
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initEspeak } from '../js/ipa.js';
import { loadActiveRulesFixture } from '../js/load-rules-fixture.js';
import {
  DEFAULT_VALIDATION_WORDS,
  validatePronunciationBatch,
  summarizeValidationResults,
} from '../js/pronunciation-validation.js';
import { escapeMarkdownTableCell } from '../js/utils.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'reports');
const outPath = join(outDir, 'pronunciation-validation-report.md');

async function main() {
  const bundle = loadActiveRulesFixture();
  await initEspeak();

  const results = await validatePronunciationBatch(
    DEFAULT_VALIDATION_WORDS,
    bundle.rules,
    bundle,
    { lang: 'en', englishDialect: 'en-us' },
  );
  const summary = summarizeValidationResults(results);

  const lines = [
    '# Pronunciation Validation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Dialect: en-us`,
    `Words: ${DEFAULT_VALIDATION_WORDS.length}`,
    '',
    '## Summary',
    '',
    `- Words tested: ${summary.wordsTested}`,
    `- Exact IPA matches: ${summary.exactIpaMatches}`,
    `- Mismatches: ${summary.mismatches}`,
    `- Phoneme key mismatches: ${summary.phonemeKeyMismatches}`,
    `- Collision warnings: ${summary.collisionWarnings}`,
    `- Recovery success rate: ${summary.recoverySuccessRate}%`,
    `- Errors: ${summary.errors}`,
    '',
    '## Results',
    '',
    '| Word | Source IPA | Recovered IPA | Keys match | IPA match | Collision warnings |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const r of results) {
    if (r.error) {
      lines.push(`| ${escapeMarkdownTableCell(r.word)} | n/a | n/a | n/a | ✗ | ${escapeMarkdownTableCell(r.error)} |`);
      continue;
    }
    const warn = r.collisionWarnings?.length
      ? r.collisionWarnings.map((w) => w.label).join('; ')
      : '-';
    lines.push(
      `| ${escapeMarkdownTableCell(r.word)} | ${escapeMarkdownTableCell(r.sourceIpa || '')} | ${escapeMarkdownTableCell(r.recoveredIpa || '')} | ${r.phonemeKeysMatch ? '✓' : '✗'} | ${r.ipaMatch ? '✓' : '✗'} | ${escapeMarkdownTableCell(warn)} |`,
    );
  }

  lines.push('');
  lines.push('## Mismatches (detail)');
  lines.push('');

  const mismatches = results.filter((r) => !r.error && !r.ipaMatch);
  if (!mismatches.length) {
    lines.push('No IPA mismatches in the default word list.');
  } else {
    for (const r of mismatches) {
      lines.push(`### ${r.word}`);
      lines.push('');
      lines.push(`- Source IPA: \`${r.sourceIpa}\``);
      lines.push(`- Recovered IPA: \`${r.recoveredIpa}\``);
      lines.push(`- Source keys: \`${r.sourcePhonemeKeys}\``);
      lines.push(`- Recovered keys: \`${r.recoveredPhonemeKeys}\``);
      lines.push(`- Symbols: \`${r.symbols}\``);
      lines.push(`- Decoder: ${r.decoderPath}`);
      if (r.mismatchNotes?.length) {
        lines.push('- Notes:');
        for (const n of r.mismatchNotes) lines.push(`  - ${n}`);
      }
      lines.push('');
    }
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log(`Recovery success rate: ${summary.recoverySuccessRate}% (${summary.exactIpaMatches}/${summary.wordsTested} IPA matches)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
