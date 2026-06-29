/**
 * Node test runner: not imported by the browser app.
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
import { translateEnglish, resetTranslatorCache } from '../tools/fonoran-translator.js';
import { loadLanguageRulesFromMarkdown } from './load-language-rules.js';
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';
import { parseSyllable, isValidSyllable, buildSyllable, enumerateOpenSyllables, enumerateAllSyllables } from '../tools/fonoran-pronunciation.js';
import { checkCompoundBoundary } from '../tools/fonoran-gen3-readability.js';
import { priorityWeight, derivePriority } from '../tools/fonoran-priority.js';
import { loadCollisionProfile, scoreEditorialCollision, collisionSafetyScore } from '../tools/fonoran-root-collision.js';
import { buildCompoundPartnerMap, scoreCompoundBoundary } from '../tools/fonoran-root-boundary-score.js';
import { assignRoots, buildSyllablePool, regenerateRoot } from '../tools/fonoran-root-sound-assign.js';

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
    'vendor/onnx/ort-wasm-simd-threaded.wasm missing: run npm install',
  );
  assert(
    existsSync(join(vendorRoot, 'ort-wasm-simd-threaded.mjs')),
    'vendor/onnx/ort-wasm-simd-threaded.mjs missing: run npm install',
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

const fonoranTranslatorResult = await (async () => {
  const testName = 'Fonoran translator compiles root vocabulary sentences';
  try {
    resetTranslatorCache();

    const person = await translateEnglish('Person');
    assert(person.surface.roman === 'ba', `person roman: ${person.surface.roman}`);
    assert(person.tokens[0].parts.join('') === 'ba', `person parts: ${person.tokens[0].parts.join('')}`);

    const md = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'docs/language-rules.md'), 'utf8');
    const { rules } = loadLanguageRulesFromMarkdown(md);
    const script = romanToFonoraScript(person.tokens[0].parts, rules).phrase;
    assert(script.length > 0, 'person script empty');

    const jumped = await translateEnglish('the man jumped');
    assert(jumped.unresolved.length === 0, `jumped unresolved: ${jumped.unresolved.join(', ')}`);
    // The 'move' root spelling is a generated artifact; assert structure (man + past particle + move)
    // rather than a fixed spelling so the test survives regeneration.
    const movedRoman = jumped.tokens.find(t => t.english === 'jumped')?.fonoran;
    assert(Boolean(movedRoman), `jumped move token: ${JSON.stringify(jumped.tokens)}`);
    assert(jumped.surface.roman === `ba ta ${movedRoman}`, `jumped roman: ${jumped.surface.roman}`);
    assert(jumped.interpretations.some(i => i.english === 'jumped' && i.concept_id === 'move'), `jumped move interp: ${JSON.stringify(jumped.interpretations)}`);
    assert(jumped.semantic?.slots?.time?.length === 1, 'past tense adds time slot');

    const future = await translateEnglish('the man is going to jump');
    assert(future.unresolved.length === 0, `future unresolved: ${future.unresolved.join(', ')}`);
    const futureMove = future.tokens.find(t => t.english === 'jump' || t.concept_id === 'move')?.fonoran ?? movedRoman;
    assert(future.surface.roman === `ba na ${futureMove}`, `future roman: ${future.surface.roman}`);
    assert(!future.surface.roman.includes(' la '), `future should not have la: ${future.surface.roman}`);
    assert(!future.surface.roman.includes(' fi '), `future should not use retired fi: ${future.surface.roman}`);
    assert(future.semantic?.slots?.time?.[0]?.english === 'future', 'future time slot');

    const ate = await translateEnglish('the man ate animal');
    assert(ate.unresolved.length === 0, `ate unresolved: ${ate.unresolved.join(', ')}`);
    // eat/animal root spellings are generated artifacts; assert structure
    // (man + past particle + eat + animal) so the test survives regeneration.
    const ateEat = ate.tokens.find(t => t.english === 'ate' || t.concept_id === 'eat')?.fonoran;
    const ateAnimal = ate.tokens.find(t => t.english === 'animal' || t.concept_id === 'animal')?.fonoran;
    assert(Boolean(ateEat) && Boolean(ateAnimal), `ate tokens: ${JSON.stringify(ate.tokens)}`);
    assert(ate.surface.roman === `ba ta ${ateEat} ${ateAnimal}`, `ate roman: ${ate.surface.roman}`);
    assert(ate.interpretations.some(i => i.english === 'ate' && i.reason === 'irregular past'), `ate interp: ${JSON.stringify(ate.interpretations)}`);

    const futureEat = await translateEnglish('the man will eat animal');
    assert(futureEat.unresolved.length === 0, `futureEat unresolved: ${futureEat.unresolved.join(', ')}`);
    const feEat = futureEat.tokens.find(t => t.english === 'eat' || t.concept_id === 'eat')?.fonoran;
    const feAnimal = futureEat.tokens.find(t => t.english === 'animal' || t.concept_id === 'animal')?.fonoran;
    assert(futureEat.surface.roman === `ba na ${feEat} ${feAnimal}`, `futureEat roman: ${futureEat.surface.roman}`);

    const morningLab = {
      sounds: [],
      compounds: [{
        spelling: 'kembemkat',
        meaning: 'morning',
        aliases: ['morning', 'dawn', 'every morning'],
        parts: ['kembem', 'kat'],
        state: 'approved',
      }],
    };
    const everyMorning = await translateEnglish('Every morning', { lab: morningLab });
    assert(everyMorning.unresolved.length === 0, `every morning unresolved: ${everyMorning.unresolved.join(', ')}`);
    assert(
      everyMorning.tokens.some(t => t.role === 'time' && t.fonoran === 'kembemkat'),
      `morning time slot: ${JSON.stringify(everyMorning.tokens)}`,
    );

    const jumpedKind = jumped.tokens.find(t => t.english === 'jumped');
    assert(jumpedKind?.resolution_kind === 'interpreted', `jumped resolution_kind: ${jumpedKind?.resolution_kind}`);

    const atWar = await translateEnglish('the tribe is at war');
    assert(atWar.unresolved.length === 0, `at war unresolved: ${atWar.unresolved.join(', ')}`);
    assert(atWar.tokens.some(t => t.english === 'at war' && t.resolution_kind === 'interpreted'), `at war idiom: ${JSON.stringify(atWar.tokens)}`);

    const mountain = await translateEnglish('mountain');
    assert(mountain.tokens[0]?.resolved, 'mountain should resolve');
    assert(['direct', 'semantic'].includes(mountain.tokens[0]?.resolution_kind), `mountain tier: ${mountain.tokens[0]?.resolution_kind}`);

    const timeTravelerLab = {
      sounds: [],
      compounds: [{
        spelling: 'sekba',
        meaning: 'time traveler',
        aliases: ['time traveler', 'time traveller'],
        parts: ['sek', 'ba'],
        concept_id: 'person',
        state: 'approved',
      }],
    };
    const timeTraveler = await translateEnglish('time traveler', { lab: timeTravelerLab });
    assert(timeTraveler.unresolved.length === 0, `time traveler unresolved: ${timeTraveler.unresolved.join(', ')}`);
    assert(timeTraveler.tokens.some(t => t.fonoran === 'sekba'), `time traveler phrase: ${JSON.stringify(timeTraveler.tokens)}`);

    const createdEqual = await translateEnglish('all men are created equal');
    assert(createdEqual.unresolved.length === 0, `created equal unresolved: ${createdEqual.unresolved.join(', ')}`);
    assert(createdEqual.tokens.some(t => t.english === 'created' && t.concept_id === 'make' && Boolean(t.fonoran)), `created -> make: ${JSON.stringify(createdEqual.tokens)}`);
    assert(createdEqual.tokens.some(t => t.english === 'equal'), 'equal slot present');
    assert(!createdEqual.surface.roman.includes(' ta '), `passive present should omit ta: ${createdEqual.surface.roman}`);

    const ourTribeWar = await translateEnglish('our tribe is at war with a powerful mountain king');
    assert(ourTribeWar.tokens.some(t => t.role === 'subject' && t.resolved && t.english.includes('tribe')), `tribe subject: ${JSON.stringify(ourTribeWar.tokens)}`);
    assert(ourTribeWar.tokens.some(t => t.english === 'at war' && t.resolved), 'at war idiom');
    assert(ourTribeWar.tokens.some(t => t.role === 'object' && t.english.includes('mountain')), `object NP: ${JSON.stringify(ourTribeWar.tokens)}`);
    assert(!ourTribeWar.tokens.some(t => t.english === 'with'), 'with should not appear as token');

    const airFeels = await translateEnglish('the air feels cool');
    assert(airFeels.tokens.some(t => t.english === 'air' && t.role === 'subject'), `air subject: ${JSON.stringify(airFeels.tokens)}`);
    assert(airFeels.tokens.some(t => t.english === 'feels' && t.concept_id === 'feel' && Boolean(t.fonoran)), `feel resolves: ${JSON.stringify(airFeels.tokens)}`);
    assert(airFeels.tokens.some(t => t.english.includes('cool')), 'cool modifier present');

    const morningWalk = await translateEnglish('every morning I take a walk');
    assert(morningWalk.tokens.some(t => t.english === 'every morning'), 'time adverbial slot');
    assert(morningWalk.tokens.some(t => t.english.toLowerCase() === 'i' && t.fonoran === 'mi'), `I -> mi: ${JSON.stringify(morningWalk.tokens)}`);

    const paragraph = await translateEnglish(
      'Every morning I take a walk. The air feels cool. Birds sing and the city wakes up slowly.',
    );
    assert(paragraph.mode === 'discourse', `paragraph mode: ${paragraph.mode}`);
    assert(paragraph.tokens.some(t => t.fonoran === 'mi'), 'paragraph has mi');
    assert(paragraph.tokens.some(t => t.english === 'feels' && t.concept_id === 'feel'), `paragraph feel: ${JSON.stringify(paragraph.tokens)}`);
    assert(!paragraph.tokens.some(t => t.english === 'every' && t.role === 'subject'), 'every should not be subject');

    const udhr = await translateEnglish(
      'All human beings are born free and equal in dignity and rights. They are endowed with reason and conscience and should act towards one another in a spirit of brotherhood.',
    );
    assert(udhr.mode === 'discourse', `udhr mode: ${udhr.mode}`);
    assert(!udhr.surface.roman.includes(' ta '), `udhr present should omit ta: ${udhr.surface.roman}`);
    assert(!udhr.tokens.some(t => t.english === 'born free and equal in dignity and rights'), 'udhr must not blob predicate');
    // born now resolves through the birth compound (birth = source + life), not a root.
    assert(udhr.tokens.some(t => t.english === 'born' && t.concept_id === 'birth' && t.resolved && Boolean(t.fonoran)), `udhr born -> birth: ${udhr.surface.roman}`);
    assert(udhr.tokens.some(t => t.english === 'equal' && t.concept_id === 'equal' && Boolean(t.fonoran)), 'udhr equal resolved');
    assert(udhr.tokens.some(t => t.english === 'endowed' && t.concept_id === 'give' && Boolean(t.fonoran)), 'udhr endowed -> give');
    assert(udhr.tokens.some(t => t.english === 'reason' && t.concept_id === 'think' && Boolean(t.fonoran)), 'udhr reason -> think not earth');
    assert(udhr.tokens.some(t => t.english === 'one another' && t.resolved && Boolean(t.fonoran)), 'udhr reciprocal idiom resolved');
    assert(!udhr.tokens.some(t => t.english === 'should'), 'udhr modal should omitted');
    assert(!udhr.tokens.some(t => t.english === 'spirit' && t.concept_id === 'feel'), 'udhr spirit must not map to feel');
    assert(udhr.unresolved.includes('free') && udhr.unresolved.includes('dignity'), `udhr expected reds: ${udhr.unresolved.join(', ')}`);

    return { name: testName, ok: true };
  } catch (e) {
    return { name: testName, ok: false, error: e.message };
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

const boundaryResult = test('checkCompoundBoundary rejects identical consonant collision', () => {
  // C + same C → invalid
  const bemMam = checkCompoundBoundary(['bem', 'mam']);
  assert(!bemMam.valid, 'bem+mam should be invalid (m+m)');
  assert(bemMam.violations.length === 1);
  assert(bemMam.violations[0].phoneme === 'm');
  assert(bemMam.violations[0].left === 'bem');
  assert(bemMam.violations[0].right === 'mam');

  const kalLum = checkCompoundBoundary(['kal', 'lum']);
  assert(!kalLum.valid, 'kal+lum should be invalid (l+l)');
  assert(kalLum.violations[0].phoneme === 'l');
});

const boundaryPassResult = test('checkCompoundBoundary passes valid boundaries', () => {
  // C + different C → valid
  const bemLam = checkCompoundBoundary(['bem', 'lam']);
  assert(bemLam.valid, 'bem+lam should be valid (m+l)');
  assert(bemLam.violations.length === 0);

  const benMam = checkCompoundBoundary(['ben', 'mam']);
  assert(benMam.valid, 'ben+mam should be valid (n+m)');

  // C + V → valid
  const kalA = checkCompoundBoundary(['kal', 'a']);
  assert(kalA.valid, 'kal+a should be valid (l+vowel)');

  // V + C → valid
  const kaSo = checkCompoundBoundary(['ka', 'so']);
  assert(kaSo.valid, 'ka+so should be valid (vowel+s)');

  // Single part → always valid (no boundary to check)
  const single = checkCompoundBoundary(['bem']);
  assert(single.valid, 'single part should have no violations');
});

const boundaryMultiResult = test('checkCompoundBoundary checks every boundary in multi-part compounds', () => {
  // All clean → valid
  const allClean = checkCompoundBoundary(['ben', 'mam', 'lak']);
  assert(allClean.valid, 'ben+mam+lak should be valid');

  // First boundary clean, second boundary bad → invalid
  const lastBad = checkCompoundBoundary(['ben', 'mak', 'kal']);
  assert(!lastBad.valid, 'ben+mak+kal should be invalid (k+k at boundary 2)');
  assert(lastBad.violations.length === 1);
  assert(lastBad.violations[0].position === 1);

  // Both boundaries bad → two violations
  const bothBad = checkCompoundBoundary(['bem', 'mak', 'kal']);
  assert(!bothBad.valid, 'bem+mak+kal should be invalid at both boundaries');
  assert(bothBad.violations.length === 2);
});

const boundaryDigraphResult = test('checkCompoundBoundary handles digraph boundaries', () => {
  // sh + sh → invalid
  const shSh = checkCompoundBoundary(['besh', 'shak']);
  assert(!shSh.valid, 'besh+shak should be invalid (sh+sh)');
  assert(shSh.violations[0].phoneme === 'sh');

  // sh + k → valid
  const shK = checkCompoundBoundary(['besh', 'kal']);
  assert(shK.valid, 'besh+kal should be valid (sh+k)');

  // ng + n → valid (different phonemes)
  const ngN = checkCompoundBoundary(['beng', 'nal']);
  assert(ngN.valid, 'beng+nal should be valid (ng+n)');
});

const rootWorkflowResult = await (async () => {
  const name = 'Root editorial workflow: priority, collision, boundary, assignment';
  try {
    // Priority class -> weight mapping and ordering.
    assert(priorityWeight('essential') === 100, 'essential weight');
    assert(priorityWeight('questionable') === 20, 'questionable weight');
    assert(priorityWeight('unknown') === 80, 'unknown defaults to common');
    assert(derivePriority('essential', 0) > derivePriority('common', 0), 'essential outranks common');
    assert(derivePriority('common', 0) > derivePriority('common', 5), 'lower index wins within class');

    // Editorial collision profile (English default).
    const en = await loadCollisionProfile('en');
    assert(scoreEditorialCollision('fak', en).blocked === true, 'fak is blocked');
    const gas = scoreEditorialCollision('gas', en);
    assert(gas.blocked === false && gas.penalty >= 2000, 'gas is discouraged with strong penalty');
    assert(scoreEditorialCollision('fi', en).warnings.some(w => w.type === 'homophone'), 'fi raises homophone warning');
    assert(collisionSafetyScore(0, false) === 100 && collisionSafetyScore(0, true) === 0, 'safety score bounds');
    // Profile swap smoke test: a missing profile blocks nothing.
    const missing = await loadCollisionProfile('zz-nonexistent');
    assert(scoreEditorialCollision('fak', missing).blocked === false, 'missing profile blocks nothing');

    // Compound-boundary scoring.
    const partnerMap = buildCompoundPartnerMap([{ concept: 'c', composition: ['a', 'b'] }]);
    assert(partnerMap.get('a')?.has('b'), 'partner map links co-occurring concepts');
    const badBoundary = scoreCompoundBoundary('a', 'bem', partnerMap, { b: 'mam' });
    assert(badBoundary.warnings.length === 1 && badBoundary.score < 100, 'bem+mam boundary flagged');
    const goodBoundary = scoreCompoundBoundary('a', 'ben', partnerMap, { b: 'mam' });
    assert(goodBoundary.warnings.length === 0 && goodBoundary.score === 100, 'ben+mam boundary clean');

    // Assignment integration: blocked never assigned, rejected reserved, regenerate differs.
    const config = {
      phonetics: {
        preferred_onsets: ['b', 'd', 'f'], secondary_onsets: [], tertiary_onsets: [],
        vowels_by_cost: ['a', 'e', 'i'], coda_onsets: [], max_cv_per_rhyme: 4, max_same_onset: 5,
      },
      reserved_particles: { forms: [] },
      excluded_syllables: { forms: [] },
    };
    const pool = buildSyllablePool(config);
    const blockBa = {
      penalties: { discouraged: 2000, homophone: 500, particle_near_miss: 800 },
      blocked: new Map([['ba', { reason: 'test' }]]),
      discouraged: new Map(), homophones: new Map(), particles: new Map(),
    };
    const concepts = [
      { id: 'one', gloss: 'one', domain: 'x', priority: 100, priority_weight: 100 },
      { id: 'two', gloss: 'two', domain: 'x', priority: 90, priority_weight: 80 },
    ];
    const assigned = assignRoots(concepts, pool, config, { collisionProfile: blockBa, reservedForms: ['be'] });
    const roots = assigned.map(a => a.root);
    assert(!roots.includes('ba'), 'blocked form is never assigned');
    assert(!roots.includes('be'), 'reserved (rejected) form is never reused');

    const regen = regenerateRoot(
      { id: 'one', gloss: 'one', domain: 'x', priority: 100, priority_weight: 100 },
      pool, config, ['ba'], { collisionProfile: blockBa },
    );
    assert(regen.root !== 'ba', 'regenerate excludes the current/blocked spelling');
    assert(regen.scores && typeof regen.scores.distinctiveness_score === 'number', 'regenerate returns display scores');

    return { name, ok: true };
  } catch (e) {
    return { name, ok: false, error: e.message };
  }
})();

const allFailed = [
  ...failed,
  ...corpusResults.filter((r) => !r.ok),
  ...(rootWorkflowResult.ok ? [] : [rootWorkflowResult]),
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
  ...(fonoranTranslatorResult.ok ? [] : [fonoranTranslatorResult]),
  ...(ipaFormatResult.ok ? [] : [ipaFormatResult]),
  ...(voiceResult.ok ? [] : [voiceResult]),
  ...(boundaryResult.ok ? [] : [boundaryResult]),
  ...(boundaryPassResult.ok ? [] : [boundaryPassResult]),
  ...(boundaryMultiResult.ok ? [] : [boundaryMultiResult]),
  ...(boundaryDigraphResult.ok ? [] : [boundaryDigraphResult]),
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
  + (fonoranTranslatorResult.ok ? 1 : 0)
  + (voiceResult.ok ? 1 : 0)
  + (boundaryResult.ok ? 1 : 0)
  + (boundaryPassResult.ok ? 1 : 0)
  + (boundaryMultiResult.ok ? 1 : 0)
  + (boundaryDigraphResult.ok ? 1 : 0)
  + (rootWorkflowResult.ok ? 1 : 0);
const allTotal = total + corpusResults.length + 22;

for (const f of allFailed) console.error('FAIL:', f.name, '-', f.error);
console.log(`${allPassed}/${allTotal} tests passed`);
process.exit(allFailed.length ? 1 : 0);
