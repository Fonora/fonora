/**
 * Node test runner — not imported by the browser app.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSymbolRegistry,
  validateSymbolRegistry,
  parseLanguageRulesMarkdown,
} from './load-language-rules.js';
import { composeGridSymbol, applyPrimarySymbols, composeDerivedSymbol, composeVowelFromRecipe } from './symbol-compose.js';
import { getVowelEntries } from './vowel-display.js';
import { loadActiveRulesFixture, applyBundleMaps } from './load-rules-fixture.js';
import { runTests } from './tests-core.js';
import { initEspeak, textToIpa } from './ipa.js';
import { normalizeIpa } from './ipa-normalize.js';
import { encodeFromIpa } from './ipa-encode-helper.js';
import { TEST_CATEGORIES } from './encoder-test-sets.js';
import {
  resolveEspeakVoice,
  DEFAULT_ENGLISH_VOICE,
  ENGLISH_DIALECT_CODES,
} from './language-preferences.js';
import { buildPhonemeKeyLexicon } from './fonora-speak-lexicon.js';
import { ipaToEspeakSynthesisInput, segmentIpa } from './ipa-espeak-format.js';
import { ipaToPiperPhonemeIds } from './piper-audio.js';

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

const mdPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'language-rules.md');
const markdown = readFileSync(mdPath, 'utf8');

const parserResult = test('parseLanguageRulesMarkdown builds composed registry', () => {
  const rules = parseLanguageRulesMarkdown(markdown);
  applyPrimarySymbols(rules);
  const registry = buildSymbolRegistry(rules);
  validateSymbolRegistry(registry, rules);
  assert(getVowelEntries(rules).length === 12);
  assert(rules.config.fonora_version === 'v3');
  assert(rules.ipaVowelMap.æ === 'ae');
  assert(rules.ipaVowelMap['ɑː'] === 'o');
  assert(rules.ipaVowelMap['uː'] === 'u');
  const lips = registry.places.lips;
  assert(rules.soundGrid.find((c) => c.sound === 'p').symbols === lips);
  assert(registry.vowels.u === `${registry.modifiers.vowel}${lips}`);
  const ee = getVowelEntries(rules).find((v) => v.key === 'ee');
  assert(ee.symbols === composeVowelFromRecipe(ee.recipe, rules.places, rules.modifiers));
});

const composeResult = test('composeGridSymbol matches sound grid', () => {
  const rules = parseLanguageRulesMarkdown(markdown);
  applyPrimarySymbols(rules);
  const cell = rules.soundGrid.find((c) => c.modifierId === 'voice' && c.placeId === 'lips');
  assert(cell.symbols === composeGridSymbol('voice', 'lips', rules.places, rules.modifiers));
});

const derivedResult = test('derived sounds use composition not stale symbols', () => {
  const rules = parseLanguageRulesMarkdown(markdown);
  applyPrimarySymbols(rules);
  const th = rules.derivedSounds.find((d) => d.sound === 'th');
  const z = rules.derivedSounds.find((d) => d.sound === 'z');
  assert(th.composition === 'reverse_front_tongue_friction');
  assert(th.symbols === composeDerivedSymbol('reverse_front_tongue_friction', rules.places, rules.modifiers));
  assert(z.composition === 'reverse_friction_voice');
  assert(z.symbols === composeDerivedSymbol('reverse_friction_voice', rules.places, rules.modifiers));
});

const ipaFormatResult = test('ipaToEspeakSynthesisInput segments stress and underscores', () => {
  assert(ipaToEspeakSynthesisInput('ðə') === 'ð_ˈə');
  assert(ipaToEspeakSynthesisInput('dʒeɪmz') === 'dʒ_ˈeɪ_m_z');
  assert(ipaToEspeakSynthesisInput('bɔɪ') === 'b_ˈɔɪ');
  assert(segmentIpa('sʌn').join(',') === 's,ʌ,n');
  assert(segmentIpa('bɪg').join(',') === 'b,ɪ,ɡ');
});

const piperGResult = test('ipaToPiperPhonemeIds accepts ASCII g via IPA normalization', () => {
  const map = {
    _: [0], '^': [1], '$': [2], 'ˈ': [120],
    b: [15], ɡ: [66], ɪ: [74], n: [26], ŋ: [44],
  };
  const ids = ipaToPiperPhonemeIds('bɪgɪnɪŋ', map);
  assert(ids.length > 0);
  assert(ids.includes(66), 'expected voiced velar stop phoneme id');
});

const outsideResult = await (async () => {
  try {
    await initEspeak();
    const bundle = loadActiveRulesFixture();
    applyBundleMaps(bundle);
    const ipa = await textToIpa('outside', 'en', { englishDialect: 'en-us' });
    const normalized = normalizeIpa(ipa, {
      vowelMode: bundle.ipaVowelMode,
      vowelMap: bundle.ipaVowelMap,
    });
    const encoded = encodeFromIpa(ipa, bundle);
    assert(normalized.display === 'ow t s eye d', `keys: ${normalized.display}`);
    assert(encoded.symbols === '⚬⊃ᵔ∋∩⌀∩⚬⊃ᵔ∪⌇∩', `symbols: ${encoded.symbols}`);
    assert(!normalized.phonemeString.includes('ch'), 'ts must not merge to ch');
    return { name: 'outside encodes ow t s eye d without ts affricate merge', ok: true };
  } catch (e) {
    return { name: 'outside encodes ow t s eye d without ts affricate merge', ok: false, error: e.message };
  }
})();

const voiceResult = test('resolveEspeakVoice defaults and dialect overrides', () => {
  assert(resolveEspeakVoice('en') === DEFAULT_ENGLISH_VOICE);
  assert(resolveEspeakVoice('en', {}) === DEFAULT_ENGLISH_VOICE);
  assert(resolveEspeakVoice('en', { englishDialect: 'en-gb' }) === 'en-gb');
  assert(resolveEspeakVoice('en', { voice: 'en-au' }) === 'en-au');
  assert(resolveEspeakVoice('es') === 'es');
  assert(resolveEspeakVoice('en', { englishDialect: 'not-a-voice' }) === DEFAULT_ENGLISH_VOICE);
  assert(ENGLISH_DIALECT_CODES.includes('en-uk-rp'));
  assert(ENGLISH_DIALECT_CODES.includes('en-sc'));
});

const { passed, total, failed } = runTests({
  bundle: loadActiveRulesFixture(),
});

async function runCorpusIpaTests() {
  const bundle = loadActiveRulesFixture();
  applyBundleMaps(bundle);
  const results = [];

  const corpusResult = await (async () => {
    try {
      await initEspeak();
      const words = [...new Set(TEST_CATEGORIES.flatMap((c) => c.words))];
      const failures = [];
      for (const word of words) {
        const ipa = await textToIpa(word, 'en', { englishDialect: 'en-us' });
        const normalized = normalizeIpa(ipa, {
          vowelMode: bundle.ipaVowelMode,
          vowelMap: bundle.ipaVowelMap,
        });
        const encoded = encodeFromIpa(ipa, bundle);
        if (normalized.phonemeString.includes('?') || encoded.symbols.includes('?')) {
          failures.push(`${word}: phonemes=${normalized.phonemeString} symbols=${encoded.symbols}`);
        }
        if (normalized.unmapped.length) {
          failures.push(`${word}: unmapped ${normalized.unmapped.join(', ')}`);
        }
      }
      assert(failures.length === 0, failures.slice(0, 8).join('; '));
      return { name: 'English encoder corpus has no ? or unmapped IPA vowels', ok: true };
    } catch (e) {
      return { name: 'English encoder corpus has no ? or unmapped IPA vowels', ok: false, error: e.message };
    }
  })();

  results.push(corpusResult);

  const lexiconResult = await (async () => {
    try {
      await initEspeak();
      const lexicon = await buildPhonemeKeyLexicon(bundle.rules, bundle, ['the'], 'en-us');
      assert(lexicon.get('dh a') === 'the', `expected dh a -> the, got ${lexicon.get('dh a')}`);
      return { name: 'Fonora speak lexicon maps dh a to the', ok: true };
    } catch (e) {
      return { name: 'Fonora speak lexicon maps dh a to the', ok: false, error: e.message };
    }
  })();

  results.push(lexiconResult);
  return results;
}

const corpusResults = await runCorpusIpaTests();

const allFailed = [
  ...failed,
  ...corpusResults.filter((r) => !r.ok),
  ...(parserResult.ok ? [] : [parserResult]),
  ...(composeResult.ok ? [] : [composeResult]),
  ...(derivedResult.ok ? [] : [derivedResult]),
  ...(piperGResult.ok ? [] : [piperGResult]),
  ...(outsideResult.ok ? [] : [outsideResult]),
  ...(ipaFormatResult.ok ? [] : [ipaFormatResult]),
  ...(voiceResult.ok ? [] : [voiceResult]),
];
const allPassed =
  passed
  + corpusResults.filter((r) => r.ok).length
  + (parserResult.ok ? 1 : 0)
  + (composeResult.ok ? 1 : 0)
  + (derivedResult.ok ? 1 : 0)
  + (ipaFormatResult.ok ? 1 : 0)
  + (piperGResult.ok ? 1 : 0)
  + (outsideResult.ok ? 1 : 0)
  + (voiceResult.ok ? 1 : 0);
const allTotal = total + corpusResults.length + 7;

for (const f of allFailed) console.error('FAIL:', f.name, '-', f.error);
console.log(`${allPassed}/${allTotal} tests passed`);
process.exit(allFailed.length ? 1 : 0);
