/**
 * Audit IPA token coverage for eSpeak en-us output over the encoder test corpus.
 * Output: docs/IPA_VOWEL_NORMALIZATION_AUDIT.md
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initEspeak, textToIpa } from '../js/ipa.js';
import { loadActiveRulesFixture, applyBundleMaps } from '../js/load-rules-fixture.js';
import { TEST_CATEGORIES } from '../js/encoder-test-sets.js';
import {
  buildIpaTokenAuditRows,
  collectIpaTokenCounts,
  formatAuditMarkdown,
} from '../js/ipa-normalization-audit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'docs', 'IPA_VOWEL_NORMALIZATION_AUDIT.md');

const EXTENDED_VOWEL_PROBE_WORDS = [
  'bird', 'her', 'word', 'nurse', 'church', 'journey', 'earth', 'girl', 'world', 'learn',
  'roses', 'buses', 'boxes', 'possible', 'terrible', 'experience', 'letter', 'better',
  'butter', 'water', 'father', 'mother', 'reference', 'comfortable',
];

async function main() {
  const bundle = loadActiveRulesFixture();
  applyBundleMaps(bundle);
  await initEspeak();

  const words = [
    ...new Set([
      ...TEST_CATEGORIES.flatMap((c) => c.words),
      ...EXTENDED_VOWEL_PROBE_WORDS,
    ]),
  ];

  const ipaStrings = [];
  for (const word of words) {
    ipaStrings.push(await textToIpa(word, 'en', { englishDialect: 'en-us' }));
  }

  const tokenCounts = collectIpaTokenCounts(ipaStrings, bundle.ipaVowelMap);
  const rows = buildIpaTokenAuditRows(tokenCounts, bundle.ipaVowelMap);
  const markdown = formatAuditMarkdown(rows, {
    dialect: 'en-us',
    wordCount: words.length,
    generatedAt: new Date().toISOString(),
  });

  writeFileSync(outPath, markdown, 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log(`Tokens: ${rows.length}, previously unmapped: ${rows.filter((r) => r.unmappedBefore).length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
