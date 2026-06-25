/**
 * Node test runner — not imported by the browser app.
 */
import { readFileSync, existsSync } from 'node:fs';
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
import { LANGUAGE_RULES_PATH } from './fonora-config.js';
import { runTests } from './tests-core.js';
import { initEspeak, textToIpa } from './ipa.js';
import { normalizeIpa } from './ipa-normalize.js';
import { encodeFromIpa } from './ipa-encode-helper.js';
import { translateIpaPhrase } from './ipa-pipeline.js';
import { TEST_CATEGORIES } from './encoder-test-sets.js';
import {
  resolveEspeakVoice,
  DEFAULT_ENGLISH_VOICE,
  ENGLISH_DIALECT_CODES,
} from './language-preferences.js';
import { buildPhonemeKeyLexicon } from './fonora-speak-lexicon.js';
import { ipaToEspeakSynthesisInput, segmentIpa } from './ipa-espeak-format.js';
import { ipaToPiperPhonemeIds, canMapIpaToPiper, getPiperVoiceForLang, getSamplePlaybackPlan, PIPER_VOICE_BY_LANG } from './piper-audio.js';
import { buildMermaidGraph } from '../tools/fonoran-graph.js';
import { parseSyllable, isValidSyllable, buildSyllable, enumerateOpenSyllables, enumerateAllSyllables } from '../tools/fonoran-pronunciation.js';

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

const mdPath = join(dirname(fileURLToPath(import.meta.url)), '..', LANGUAGE_RULES_PATH.replace(/^\//, ''));
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

const graphResult = test('buildMermaidGraph links components to focus word', () => {
  const bucket = {
    sounds: [
      { spelling: 'ka', meaning: 'person', state: 'approved' },
      { spelling: 'so', meaning: 'bond', state: 'approved' },
    ],
    compounds: [{
      id: 'cmp-kaso',
      spelling: 'kaso',
      meaning: 'love',
      state: 'approved',
      components: [{ type: 'root', ref: 'ka' }, { type: 'root', ref: 'so' }],
    }],
  };
  const graph = buildMermaidGraph(bucket, { kind: 'word', ref: 'cmp-kaso' });
  assert(graph.source.includes('word_cmp_kaso'));
  assert(graph.source.includes('root_ka --> word_cmp_kaso'));
  assert(graph.source.includes('root_so --> word_cmp_kaso'));
  assert(graph.nodes.some(n => n.id === 'word_cmp_kaso'));
});

const pronunciationResult = test('fonoran pronunciation parses vowel-only and full sound grid', () => {
  assert(isValidSyllable('a'));
  assert(parseSyllable('a').vowel === 'a' && !parseSyllable('a').onset);
  assert(isValidSyllable('eye'));
  assert(parseSyllable('say').onset === 's' && parseSyllable('say').vowel === 'ay');
  assert(parseSyllable('va').onset === 'v' && parseSyllable('va').vowel === 'a');
  assert(parseSyllable('za').onset === 'z' && parseSyllable('za').vowel === 'a');
  assert(parseSyllable('tha').onset === 'th' && parseSyllable('tha').vowel === 'a');
  assert(parseSyllable('dha').onset === 'dh' && parseSyllable('dha').vowel === 'a');
  assert(buildSyllable('', 'ow', '') === 'ow');
  assert(!isValidSyllable(''));
});

const syllableCatalogResult = test('fonoran syllable catalogs match sound picker counts', () => {
  const open = enumerateOpenSyllables();
  assert(open.length === 336, `expected 336 open syllables, got ${open.length}`);
  assert(open.some(s => s.spelling === 'a' && !s.onset));
  assert(open.some(s => s.spelling === 'ba' && s.onset === 'b'));
  assert(open.some(s => s.spelling === 'sha' && s.onset === 'sh'));
  assert(!open.some(s => s.spelling === 'bat'));
  assert(enumerateAllSyllables().length === 7728);
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

const sampleVoiceResult = test('getPiperVoiceForLang maps sample languages', () => {
  assert(getPiperVoiceForLang('es') === 'es_ES-davefx-medium');
  assert(getPiperVoiceForLang('ja') === null);
});

const samplePlanResult = test('getSamplePlaybackPlan uses Piper for supported languages', () => {
  assert(getSamplePlaybackPlan('ja') === null);
  const es = getSamplePlaybackPlan('es');
  assert(es.engine === 'piper');
  assert(es.piperVoice === PIPER_VOICE_BY_LANG.es);
});

const vendorOnnxResult = test('vendor/onnx WASM bundle matches Piper runtime', () => {
  const vendorRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'onnx');
  assert(
    existsSync(join(vendorRoot, 'ort-wasm-simd-threaded.wasm')),
    'vendor/onnx/ort-wasm-simd-threaded.wasm missing — run npm install',
  );
  assert(
    existsSync(join(vendorRoot, 'ort-wasm-simd-threaded.mjs')),
    'vendor/onnx/ort-wasm-simd-threaded.mjs missing — run npm install',
  );
});

const piperLengthResult = test('ipaToPiperPhonemeIds splits vowel length marks for Piper', () => {
  const map = {
    _: [0], '^': [1], '$': [2], 'ˈ': [120], a: [10], 'ː': [11], n: [26], s: [48],
  };
  assert(canMapIpaToPiper('aː', map));
  const ids = ipaToPiperPhonemeIds('aː', map);
  assert(ids.includes(10));
  assert(ids.includes(11));
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

const flapResult = await (async () => {
  try {
    await initEspeak();
    const bundle = loadActiveRulesFixture();
    applyBundleMaps(bundle);
    const cases = [
      {
        word: 'dignity',
        phonemes: 'd i g n i t i',
        symbols: '⌇∩⚬⌓⌇∪⏌∩⚬⌓∩⚬⌓',
      },
      {
        word: 'city',
        phonemes: 's i t i',
        symbols: '⌀∩⚬⌓∩⚬⌓',
      },
      {
        word: 'pretty',
        phonemes: 'p r i t i',
        symbols: '∋ᵔ⌓⚬⌓∩⚬⌓',
      },
      {
        word: 'water',
        phonemes: 'w o t a',
        symbols: 'ᵔ∋⚬∪∩⚬⊃',
      },
    ];
    for (const { word, phonemes, symbols } of cases) {
      const ipa = await textToIpa(word, 'en', { englishDialect: 'en-us' });
      assert(ipa.includes('ɾ'), `${word} IPA should contain flapped ɾ from eSpeak: ${ipa}`);
      const normalized = normalizeIpa(ipa, {
        vowelMode: bundle.ipaVowelMode,
        vowelMap: bundle.ipaVowelMap,
      });
      const encoded = encodeFromIpa(ipa, bundle);
      assert(normalized.display === phonemes, `${word} keys: ${normalized.display}`);
      assert(encoded.symbols === symbols, `${word} symbols: ${encoded.symbols}`);
      if (word === 'dignity' || word === 'city') {
        assert(!normalized.display.includes(' r '), `${word} must not map ɾ to glide r`);
      }
    }
    return { name: 'English flapped t (ɾ) encodes as plain t not glide r', ok: true };
  } catch (e) {
    return { name: 'English flapped t (ɾ) encodes as plain t not glide r', ok: false, error: e.message };
  }
})();

const perroResult = await (async () => {
  try {
    await initEspeak();
    const bundle = loadActiveRulesFixture();
    applyBundleMaps(bundle);
    const result = await translateIpaPhrase('perro', bundle.rules, 'es', { lang: 'es', voice: 'es' });
    assert(result.symbols === '∋⚬⌇ᵔ⌓⚬⏌', `symbols: ${result.symbols}`);
    assert(result.normalizedPhonemes === 'p e r oh', `phonemes: ${result.normalizedPhonemes}`);
    return { name: 'Spanish perro encodes with oh vowel ending', ok: true };
  } catch (e) {
    return { name: 'Spanish perro encodes with oh vowel ending', ok: false, error: e.message };
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
  ...(graphResult.ok ? [] : [graphResult]),
  ...(pronunciationResult.ok ? [] : [pronunciationResult]),
  ...(syllableCatalogResult.ok ? [] : [syllableCatalogResult]),
  ...(piperGResult.ok ? [] : [piperGResult]),
  ...(piperLengthResult.ok ? [] : [piperLengthResult]),
  ...(sampleVoiceResult.ok ? [] : [sampleVoiceResult]),
  ...(samplePlanResult.ok ? [] : [samplePlanResult]),
  ...(vendorOnnxResult.ok ? [] : [vendorOnnxResult]),
  ...(outsideResult.ok ? [] : [outsideResult]),
  ...(flapResult.ok ? [] : [flapResult]),
  ...(perroResult.ok ? [] : [perroResult]),
  ...(ipaFormatResult.ok ? [] : [ipaFormatResult]),
  ...(voiceResult.ok ? [] : [voiceResult]),
];
const allPassed =
  passed
  + corpusResults.filter((r) => r.ok).length
  + (parserResult.ok ? 1 : 0)
  + (composeResult.ok ? 1 : 0)
  + (derivedResult.ok ? 1 : 0)
  + (graphResult.ok ? 1 : 0)
  + (pronunciationResult.ok ? 1 : 0)
  + (syllableCatalogResult.ok ? 1 : 0)
  + (ipaFormatResult.ok ? 1 : 0)
  + (piperGResult.ok ? 1 : 0)
  + (piperLengthResult.ok ? 1 : 0)
  + (sampleVoiceResult.ok ? 1 : 0)
  + (samplePlanResult.ok ? 1 : 0)
  + (vendorOnnxResult.ok ? 1 : 0)
  + (outsideResult.ok ? 1 : 0)
  + (flapResult.ok ? 1 : 0)
  + (perroResult.ok ? 1 : 0)
  + (voiceResult.ok ? 1 : 0);
const allTotal = total + corpusResults.length + 16;

for (const f of allFailed) console.error('FAIL:', f.name, '-', f.error);
console.log(`${allPassed}/${allTotal} tests passed`);
process.exit(allFailed.length ? 1 : 0);
