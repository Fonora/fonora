import { FALLBACK_RULES, parseLanguageRulesMarkdown, getQuizEntries } from './rules.js';
import { encodeSounds } from './encode.js';
import { decodeSymbols, decodeText } from './decode.js';
import { normalizeIpa } from './ipa-normalize.js';

const rules = FALLBACK_RULES;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function test(name, fn) {
  try {
    fn();
    return { name, ok: true };
  } catch (e) {
    return { name, ok: false, error: e.message };
  }
}

function enc(sounds) {
  return encodeSounds(sounds, rules);
}

export function runTests() {
  const results = [];
  const t = (name, fn) => results.push(test(name, fn));

  // Vowel symbols (2-symbol only)
  t('a → ⊐⊐', () => assert(enc('a').symbols === '⊐⊐'));
  t('e → ⊐∩', () => assert(enc('e').symbols === '⊐∩'));
  t('i → ⊐⌒', () => assert(enc('i').symbols === '⊐⌒'));
  t('o → ⊐∪', () => assert(enc('o').symbols === '⊐∪'));
  t('u → ⊐○', () => assert(enc('u').symbols === '⊐○'));
  t('no 3-symbol vowel encodings', () => {
    assert(!rules.experimentalVowels.some((v) => /^⌔⊐/.test(v.symbols)));
    assert(enc('pa').symbols === '○⊐⊐');
  });

  // CV examples
  t('pa', () => assert(enc('pa').symbols === '○⊐⊐'));
  t('pe', () => assert(enc('pe').symbols === '○⊐∩'));
  t('pi', () => assert(enc('pi').symbols === '○⊐⌒'));
  t('po', () => assert(enc('po').symbols === '○⊐∪'));
  t('pu', () => assert(enc('pu').symbols === '○⊐○'));

  // Derived consonants
  t('v → ○⌔', () => assert(enc('v').symbols === '○⌔'));
  t('th → ∩⌕', () => assert(enc('th').symbols === '∩⌕'));
  t('dh → ∩⌔', () => assert(enc('dh').symbols === '∩⌔'));
  t('decode ○⊐⊐ → pa', () => assert(decodeSymbols('○⊐⊐', rules).pronunciation === 'pa'));
  t('decode ⊐⊐ → a', () => assert(decodeSymbols('⊐⊐', rules).pronunciation === 'a'));
  t('decode ○⌔ → v', () => assert(decodeSymbols('○⌔', rules).pronunciation === 'v'));
  t('plain ⊐ is undefined', () => {
    const r = decodeSymbols('⊐', rules);
    assert(r.pronunciation === '?');
    assert(r.warnings.some((w) => w.includes('undefined')));
  });
  t('ʔ is not encodable', () => assert(enc('ʔ').symbols === '?'));
  t('plain ⊐ not in quiz', () => assert(!getQuizEntries(rules).some((c) => c.symbols === '⊐')));
  t('quiz includes all vowels', () => {
    for (const v of ['a', 'e', 'i', 'o', 'u']) {
      const entry = getQuizEntries(rules).find((c) => c.sound === v);
      assert(entry, `missing vowel ${v}`);
      assert(/^⊐/.test(entry.symbols), `${v} symbols should start with ⊐`);
    }
  });
  t('vowel quiz decode answer', () => {
    const a = getQuizEntries(rules).find((c) => c.sound === 'a');
    assert(decodeSymbols(a.symbols, rules).pronunciation === 'a');
  });
  t('vowel quiz construct answer', () => {
    const e = getQuizEntries(rules).find((c) => c.sound === 'e');
    assert(enc('e').symbols === e.symbols);
  });
  t('no 3-symbol vowel decode', () => {
    const r = decodeSymbols('⌔⊐⊐', rules);
    assert(r.pronunciation !== 'ā');
  });

  t('decode preserves word spaces', () => {
    const symbols = `${enc('pa').symbols} ${enc('pe').symbols}`;
    assert(decodeText(symbols, rules).pronunciation.includes(' '));
  });
  t('normalize collapses symbol spaces', () => assert(decodeSymbols('⌔ ○', rules).pronunciation === 'b'));

  // IPA normalization (no WASM required)
  t('IPA knife → n a i f', () => {
    const n = normalizeIpa('naɪf');
    assert(n.phonemeString === 'naif');
    assert(n.display === 'n a i f');
    assert(n.unmapped.length === 0);
  });
  t('IPA island strips stress', () => {
    const n = normalizeIpa('ˈaɪlənd');
    assert(n.phonemes.join('') === 'ailend');
  });
  t('IPA ŋ → ng', () => {
    const n = normalizeIpa('sɪŋ');
    assert(n.phonemeString.includes('ng'));
  });
  t('IPA θ → th', () => {
    const n = normalizeIpa('θɪn');
    assert(n.phonemeString.startsWith('th'));
  });
  t('IPA vowel collapse ɪ → i', () => {
    const n = normalizeIpa('sɪt');
    assert(n.phonemeString === 'sit');
  });
  t('IPA unknown phoneme → ?', () => {
    const n = normalizeIpa('ʈ');
    assert(n.phonemeString === '?');
    assert(n.unmapped.includes('ʈ'));
  });
  t('IPA script g (U+0261) → g', () => {
    const n = normalizeIpa('dˈɑːɡ');
    assert(n.phonemeString === 'dag');
    assert(n.unmapped.length === 0);
  });
  t('IPA rhotic schwa ɚ → er', () => {
    const n = normalizeIpa('bˈʌɾɚ');
    assert(n.phonemeString === 'barer');
    assert(n.unmapped.length === 0);
  });
  t('IPA strips combining tilde and maps nasal vowel', () => {
    const n = normalizeIpa('bɔ̃ʒˈuʁ');
    assert(n.phonemeString === 'bojur');
    assert(n.unmapped.length === 0);
  });
  t('IPA encode naif round-trip', () => {
    const n = normalizeIpa('naɪf');
    const encoded = enc(n.phonemeString);
    assert(encoded.symbols.length > 0);
    assert(!encoded.symbols.includes('?'));
  });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  return { passed, total: results.length, failed, results };
}

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('tests.js')) {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');

  const { passed, total, failed } = runTests();

  const parserResult = test('parser loads collapsed vowels from MD', () => {
    const mdPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'language-rules.md');
    const parsed = parseLanguageRulesMarkdown(readFileSync(mdPath, 'utf8'));
    assert(parsed.experimentalVowels.length === 5);
    assert(parsed.experimentalVowels.every((v) => v.symbols.length === 2));
    assert(parsed.experimentalVowelCollapsed.length === 5);
    assert(parsed.experimentalVowelExamples.some((e) => e.word === 'pay' && e.spelling === '○⊐⊐'));
  });

  const allFailed = [...failed, ...(parserResult.ok ? [] : [parserResult])];
  const allPassed = passed + (parserResult.ok ? 1 : 0);
  const allTotal = total + 1;

  for (const f of allFailed) console.error('FAIL:', f.name, '-', f.error);
  console.log(`${allPassed}/${allTotal} tests passed`);
  process.exit(allFailed.length ? 1 : 0);
}
