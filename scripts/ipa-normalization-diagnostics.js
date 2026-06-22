/**
 * Per-word IPA normalization diagnostics for the encoder test corpus.
 * Output: reports/ipa-normalization-diagnostics.md
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initEspeak, textToIpa } from '../js/ipa.js';
import { loadActiveRulesFixture, applyBundleMaps } from '../js/load-rules-fixture.js';
import { ipaPhonemesToFonora } from '../js/ipa-to-fonora.js';
import { TEST_CATEGORIES } from '../js/encoder-test-sets.js';
import { buildDiagnosticRow, formatDiagnosticsMarkdown } from '../js/ipa-normalization-audit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'reports');
const outPath = join(outDir, 'ipa-normalization-diagnostics.md');

const EXTENDED_VOWEL_PROBE_WORDS = [
  'bird', 'her', 'word', 'nurse', 'church', 'journey', 'earth', 'girl', 'world', 'learn',
  'roses', 'buses', 'boxes', 'possible', 'terrible', 'experience', 'letter', 'better',
  'butter', 'water', 'father', 'mother', 'reference', 'comfortable',
];

function encodeFn(phonemes, rules) {
  const result = ipaPhonemesToFonora(phonemes, rules);
  return {
    symbols: result.symbols,
    decoded: result.decoded,
    warnings: [...(result.warnings || []), ...(result.decodeWarnings || [])],
  };
}

async function main() {
  const bundle = loadActiveRulesFixture();
  applyBundleMaps(bundle);
  await initEspeak();

  const words = [
    ...new Set([
      ...TEST_CATEGORIES.flatMap((c) => c.words),
      ...EXTENDED_VOWEL_PROBE_WORDS,
    ]),
  ].sort();

  const rows = [];
  for (const word of words) {
    const ipa = await textToIpa(word, 'en', { englishDialect: 'en-us' });
    rows.push(buildDiagnosticRow(word, ipa, bundle, encodeFn));
  }

  const markdown = formatDiagnosticsMarkdown(rows, {
    dialect: 'en-us',
    generatedAt: new Date().toISOString(),
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, markdown, 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log(`Words: ${rows.length}, with ? mark: ${rows.filter((r) => r.hasQuestionMark).length}`);
  console.log(`Unmapped warnings: ${rows.filter((r) => r.unmapped?.length).length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
