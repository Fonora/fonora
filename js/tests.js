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
import { runKeyboardComposeTests } from './fonora-keyboard-compose.test.js';
import { runFonoranAuthTests } from '../tools/fonoran-auth.test.js';
import { runFonoranLabSearchTests } from '../tools/fonoran-lab-search.test.js';
import { runFonoranCoursePhrasesTests } from '../tools/fonoran-course-phrases.test.js';
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
import {
  ipaToPiperPhonemeIds,
  canMapIpaToPiper,
  getPiperVoiceForLang,
  getSamplePlaybackPlan,
  PIPER_VOICE_BY_LANG,
  resolvePiperPhonemeId,
  piperVoiceCoversFonoranCore,
  piperSkipsLaxAutoStress,
} from './piper-audio.js';
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
import {
  findPrefixConflicts,
  isPrefixSafe,
  buildPrefixSafeInventory,
} from '../tools/fonoran-prefix-safe.js';

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
  assert(ipaToEspeakSynthesisInput('nɑ gɪ sɑ') === 'n_ˈɑ ɡ_ˈɪ s_ˈɑ');
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

const piperMultiWordResult = test('ipaToPiperPhonemeIds keeps word boundaries in multi-word clauses', () => {
  const map = {
    _: [0], '^': [1], '$': [2], 'ˈ': [120],
    n: [26], ɑ: [10], g: [66], ɡ: [66], ɪ: [74], s: [48],
  };
  const merged = ipaToPiperPhonemeIds('nɑgɪsɑ', map);
  const spaced = ipaToPiperPhonemeIds('nɑ gɪ sɑ', map);
  const stressId = 120;
  const mergedStress = merged.filter((id) => id === stressId).length;
  const spacedStress = spaced.filter((id) => id === stressId).length;
  assert(mergedStress === 1, 'merged clause should stress only the first vowel');
  assert(spacedStress === 3, 'spaced clause should stress each word by default');
  assert(spaced.length > merged.length, 'spaced clause should not collapse into one word');
});

const piperLaxStressResult = test('LibriTTS skips lax auto-stress; Lessac keeps it', () => {
  const map = {
    _: [0], '^': [1], '$': [2], 'ˈ': [120],
    m: [25], ɪ: [74], i: [73],
  };
  const kitDefault = ipaToPiperPhonemeIds('mɪ', map);
  const kitLibri = ipaToPiperPhonemeIds('mɪ', map, { skipLaxAutoStress: true });
  const fleece = ipaToPiperPhonemeIds('mi', map);
  assert(kitDefault.includes(120), 'Lessac/Alba path keeps stress on KIT');
  assert(!kitLibri.includes(120), 'LibriTTS path skips stress on KIT');
  assert(fleece.includes(120), 'FLEECE still receives primary stress');
  assert(piperSkipsLaxAutoStress('en_US-libritts_r-medium'));
  assert(!piperSkipsLaxAutoStress('en_US-lessac-medium'));
  assert(!piperSkipsLaxAutoStress('en_GB-alba-medium'));
});

const piperSoftMapResult = test('resolvePiperPhonemeId soft-maps missing phones instead of throwing', () => {
  const map = {
    _: [0], '^': [1], '$': [2], 'ˈ': [120],
    g: [66], m: [25], ɪ: [74],
  };
  assert(resolvePiperPhonemeId('ɡ', map) === 66, 'ɡ soft-maps to g');
  assert(resolvePiperPhonemeId('ʕ', map) == null || typeof resolvePiperPhonemeId('ʕ', map) === 'number');
  const ids = ipaToPiperPhonemeIds('mɪɡ', map);
  assert(ids.includes(66), 'soft-mapped ɡ still synthesizes');
  assert(piperVoiceCoversFonoranCore({
    _: [0], '^': [1], '$': [2], 'ˈ': [120],
    m: [1], b: [2], s: [3],
    ɪ: [74], i: [73], ɛ: [70], æ: [60], ʌ: [61], ʊ: [62], ɑ: [10],
  }));
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
        symbols: '⌇∩⚬∩⌇∪⏌∩⚬∩∩⚬∩',
      },
      {
        word: 'city',
        phonemes: 's i t i',
        symbols: '⌀∩⚬∩∩⚬∩',
      },
      {
        word: 'pretty',
        phonemes: 'p r i t i',
        symbols: '∋ᵔ⌓⚬∩∩⚬∩',
      },
      {
        word: 'water',
        phonemes: 'w o t a',
        symbols: 'ᵔ∋⚬⊃∩⚬∪',
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
    assert(result.symbols === '∋⚬⌓ᵔ⌓⚬⏌', `symbols: ${result.symbols}`);
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
    // The parser lemmatizes, so the token reports `jump` rather than the surface `jumped`.
    const movedRoman = jumped.tokens.find(t => t.english === 'jumped' || t.english === 'jump')?.fonoran;
    assert(Boolean(movedRoman), `jumped move token: ${JSON.stringify(jumped.tokens)}`);
    assert(jumped.surface.roman === `ba ta ${movedRoman}`, `jumped roman: ${jumped.surface.roman}`);
    // 'jump' is now a compound; it resolves directly (not via interpretation), so check tokens
    const jumpedToken = jumped.tokens.find(t => t.english === 'jumped' || t.english === 'jump');
    assert(jumpedToken && (jumpedToken.concept_id === 'jump' || jumpedToken.concept_id === 'move'), `jumped concept: ${jumpedToken?.concept_id}`);
    assert(jumped.semantic?.slots?.time?.length === 1, 'past tense adds time slot');

    const future = await translateEnglish('the man is going to jump');
    assert(future.unresolved.length === 0, `future unresolved: ${future.unresolved.join(', ')}`);
    const futureMove = future.tokens.find(t => t.english === 'jump' || t.concept_id === 'move')?.fonoran ?? movedRoman;
    // Future is a single particle `sa` (the near-future `na` was retired when the
    // particle inventory was trimmed to a rule-compliant core).
    assert(future.surface.roman === `ba sa ${futureMove}`, `future roman: ${future.surface.roman}`);
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
    // Inflection is resolved by the lemmatizer rather than by a per-form irregular table,
    // so the reported reason is the general one instead of 'irregular past'.
    assert(ate.interpretations.some(i => i.english === 'ate' && i.reason === 'inflected form'), `ate interp: ${JSON.stringify(ate.interpretations)}`);

    const futureEat = await translateEnglish('the man will eat animal');
    assert(futureEat.unresolved.length === 0, `futureEat unresolved: ${futureEat.unresolved.join(', ')}`);
    const feEat = futureEat.tokens.find(t => t.english === 'eat' || t.concept_id === 'eat')?.fonoran;
    const feAnimal = futureEat.tokens.find(t => t.english === 'animal' || t.concept_id === 'animal')?.fonoran;
    assert(futureEat.surface.roman === `ba sa ${feEat} ${feAnimal}`, `futureEat roman: ${futureEat.surface.roman}`);

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

    // 'jump' is now a compound so 'jumped' resolves directly, not via interpretation
    const jumpedKind = jumped.tokens.find(t => t.english === 'jumped');
    assert(
      jumpedKind?.resolution_kind === 'direct' || jumpedKind?.resolution_kind === 'interpreted',
      `jumped resolution_kind: ${jumpedKind?.resolution_kind}`,
    );

    const atWar = await translateEnglish('the tribe is at war');
    assert(atWar.unresolved.length === 0, `at war unresolved: ${atWar.unresolved.join(', ')}`);
    assert(atWar.tokens.some(t => t.english === 'at war' && t.resolution_kind === 'interpreted'), `at war idiom: ${JSON.stringify(atWar.tokens)}`);

    // mountain resolves via a curated strong alias (earth) or its own root —
    // always 'direct'. The old WordNet 'semantic' tier is gone from runtime.
    const mountain = await translateEnglish('mountain');
    assert(mountain.tokens[0]?.resolved, 'mountain should resolve');
    assert(mountain.tokens[0]?.resolution_kind === 'direct', `mountain tier: ${mountain.tokens[0]?.resolution_kind}`);

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

    // Regression: weak (description/gloss-derived) aliases must never shadow a
    // real root. `light` previously resolved to dark (ges) and `travels` to path
    // (kal) via gloss tokens leaked through lab-sound aliases.
    const light = await translateEnglish('Light travels fast.');
    // Trailing `.` is retained from the English source for Listen/readback.
    assert(light.surface.roman === 'kek gi nek.', `light roman: ${light.surface.roman}`);
    assert(light.tokens.some((t) => t.kind === 'punctuation' && t.fonoran === '.'), 'light keeps period token');
    const lightTok = light.tokens.find(t => t.english === 'light');
    assert(lightTok?.fonoran === 'kek' && lightTok?.resolution_kind === 'direct', `light token: ${JSON.stringify(lightTok)}`);
    const travelsTok = light.tokens.find(t => t.english === 'travels');
    assert(travelsTok?.concept_id === 'move' && travelsTok?.fonoran === 'gi', `travels token: ${JSON.stringify(travelsTok)}`);

    // Regression: second-person `you` resolves to the addressee root (`ti`).
    const youSleep = await translateEnglish('You sleep.');
    assert(youSleep.unresolved.length === 0, `you sleep unresolved: ${youSleep.unresolved.join(', ')}`);
    const youTok = youSleep.tokens.find(t => t.english === 'you');
    assert(youTok?.concept_id === 'addressee' && youTok?.fonoran === 'be', `you token: ${JSON.stringify(youTok)}`);

    const doYouWant = await translateEnglish('do you want to eat in the city');
    const doYouTok = doYouWant.tokens.find(t => t.english === 'you');
    assert(doYouTok?.concept_id === 'addressee' && doYouTok?.fonoran === 'be', `do-you token: ${JSON.stringify(doYouTok)}`);

    // Regression: `from` carries origin meaning and resolves to the `source`
    // root (bel) instead of being silently dropped as a function word.
    const fromRiver = await translateEnglish('I come from the river.');
    const fromTok = fromRiver.tokens.find(t => t.english === 'from');
    assert(fromTok?.concept_id === 'source' && fromTok?.role === 'path' && Boolean(fromTok?.fonoran), `from -> source path: ${JSON.stringify(fromTok)}`);

    const goToCity = await translateEnglish('I go to the city.');
    assert(goToCity.unresolved.length === 0, `go to city unresolved: ${goToCity.unresolved.join(', ')}`);
    assert(!goToCity.surface.roman.includes(' sa '), `go to city should not use sa: ${goToCity.surface.roman}`);
    assert(goToCity.tokens.some(t => t.concept_id === 'move' && t.role === 'event'), 'go -> move event');
    assert(goToCity.tokens.some(t => t.concept_id === 'path' && t.role === 'path'), 'to -> path slot');

    const willGoCity = await translateEnglish('I will go to the city.');
    assert(willGoCity.surface.roman.includes(' sa '), `will go to city needs sa: ${willGoCity.surface.roman}`);
    assert(willGoCity.tokens.some(t => t.concept_id === 'path' && t.role === 'path'), 'will go path slot');

    const goingToGo = await translateEnglish('I am going to go to the city.');
    assert(goingToGo.tokens.some(t => t.fonoran === 'sa'), `going to go future: ${goingToGo.surface.roman}`);
    assert(goingToGo.tokens.filter(t => t.concept_id === 'path').length >= 1, 'going to go path');

    const walkToward = await translateEnglish('I walk toward the city.');
    // 'walk' is now a compound (still+move); it resolves directly to its own spelling rather
    // than collapsing to 'move' — verify the path and destination still parse correctly.
    assert(
      walkToward.tokens.some(t => (t.concept_id === 'walk' || t.concept_id === 'move') && t.resolved),
      `walk toward event: ${walkToward.surface.roman}`,
    );
    assert(
      walkToward.tokens.some(t => t.concept_id === 'path' && t.role === 'path'),
      `walk toward path slot: ${walkToward.surface.roman}`,
    );

    const awayFrom = await translateEnglish('I go away from the city.');
    assert(awayFrom.tokens.some(t => t.concept_id === 'far' && t.role === 'path'), 'away -> far path');
    assert(awayFrom.tokens.some(t => t.concept_id === 'source' && t.role === 'path'), 'from -> source path');

    const seafoodA = await translateEnglish('I want to eat seafood.');
    const seafoodB = await translateEnglish('I want to eat sea food.');
    // Spelling is a regen artifact (food+fish / food+sea); assert structure + convergence.
    assert(seafoodA.unresolved.length === 0, `seafood unresolved: ${seafoodA.unresolved.join(', ')}`);
    assert(
      seafoodA.surface.roman.startsWith('mi sak tel '),
      `seafood roman should be want+eat+seafood: ${seafoodA.surface.roman}`,
    );
    assert(seafoodB.surface.roman === seafoodA.surface.roman, `sea food diverged: ${seafoodB.surface.roman}`);
    assert(
      seafoodA.tokens.some(t => t.concept_id === 'seafood' || t.concept_id === 'sea' || t.concept_id === 'fish'),
      `seafood must keep a sea/fish concept: ${JSON.stringify(seafoodA.tokens)}`,
    );
    assert(!seafoodA.tokens.some(t => t.interpret_reason?.includes('hypernym:eat')), 'seafood must not collapse to eat');

    // Concept-first honest gaps (docs Design Rule 0): `behind` is a preposition
    // 'behind' is now a compound (outside+back = nenso) added by the vocab survey.
    // Regression: it must resolve to 'behind' directly, NOT fabricate via WordNet
    // (old bug: behind → buttocks → can → metal → ja).
    const behind = await translateEnglish('behind');
    const behindTok = behind.tokens.find(t => t.english === 'behind');
    assert(behindTok?.resolved && behindTok?.concept_id === 'behind', `behind must resolve to behind concept: ${JSON.stringify(behindTok)}`);
    assert(!behindTok?.guessed, `behind must not be guessed/fabricated: ${JSON.stringify(behindTok)}`);

    // Locative predicate (grammar Rule 7): a spatial relation in "X is <prep> Y"
    // must reach the Place slot instead of being silently dropped by head-noun
    // reduction. 'behind' and 'tree' are now both compounds; the old parser
    // collapsed "the cat is behind the tree" to just "cat tree".
    const catBehind = await translateEnglish('the cat is behind the tree');
    assert(catBehind.tokens.some(t => t.concept_id === 'behind' && t.resolved),
      `behind must resolve in locative: ${catBehind.surface.roman}`);
    assert(
      catBehind.tokens.some(t => (t.concept_id === 'tree' || t.concept_id === 'plant') && t.resolved),
      `tree/plant must remain the locative ground: ${catBehind.surface.roman}`,
    );

    // 'between' is now a compound; verify it resolves and occupies the path/place slot
    const boxBetween = await translateEnglish('the box is between the trees');
    assert(boxBetween.tokens.some(t => t.concept_id === 'between' && t.resolved),
      `between must resolve: ${boxBetween.surface.roman}`);

    // A spatial relation that HAS a Fonoran concept resolves in the Place slot.
    const birdAbove = await translateEnglish('the bird is above the tree');
    assert(birdAbove.frame?.place?.some(p => p.concept_id === 'up'),
      `above must resolve to the up concept in Place: ${JSON.stringify(birdAbove.frame?.place)}`);

    // The semantic frame (grammar Rule 7) is a real pivot: filled roles carry a
    // concept_id + provenance (resolution_kind), never a raw English token.
    const framed = await translateEnglish('the man jumped');
    assert(framed.frame && Array.isArray(framed.frame.actor), 'frame object present');
    assert(framed.frame.actor.some(a => a.concept_id === 'person' && a.resolution_kind), `frame actor: ${JSON.stringify(framed.frame.actor)}`);
    // 'jump' is now a compound; frame action resolves to 'jump' directly rather than 'move'
    assert(framed.frame.action.some(a => a.concept_id === 'jump' || a.concept_id === 'move'), `frame action: ${JSON.stringify(framed.frame.action)}`);

    // Curated backfill replaces fabricated matches: flower -> plant or its own compound
    // (was WordNet-fabricated flower → person), king -> person (was → strong).
    // 'flower' is now a compound (plant+light), so it resolves to concept_id 'flower'.
    const flower = await translateEnglish('flower');
    assert(
      (flower.tokens[0]?.concept_id === 'flower' || flower.tokens[0]?.concept_id === 'plant') &&
      flower.tokens[0]?.resolution_kind === 'direct',
      `flower -> flower or plant (direct): ${JSON.stringify(flower.tokens[0])}`,
    );

    // No runtime WordNet/weak-alias fabrication: every resolved token is a
    // curated 'direct' or deliberate 'interpreted' hit — never 'semantic' or
    // 'alias_weak'.
    const kingGuard = await translateEnglish('The king trusts the guard.');
    assert(kingGuard.tokens.some(t => t.english === 'king' && t.concept_id === 'person'), `king -> person: ${JSON.stringify(kingGuard.tokens)}`);
    for (const t of kingGuard.tokens) {
      assert(t.resolution_kind !== 'semantic' && t.resolution_kind !== 'alias_weak',
        `runtime must not use WordNet/weak tier: ${t.english} -> ${t.resolution_kind}`);
    }

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

const keyboardComposeResults = runKeyboardComposeTests({
  rules: loadActiveRulesFixture().rules,
});
const keyboardPassed = keyboardComposeResults.passed;
const keyboardTotal = keyboardComposeResults.total;
const keyboardFailed = keyboardComposeResults.failed;



const authResults = await runFonoranAuthTests();
const authFailed = authResults.filter((r) => !r.ok);
const authPassed = authResults.length - authFailed.length;

let labSearchResult = { ok: true, name: 'fonoran lab search' };
try {
  runFonoranLabSearchTests();
} catch (e) {
  labSearchResult = { ok: false, name: 'fonoran lab search', error: e.message };
}

const coursePhrasesResults = runFonoranCoursePhrasesTests();
const coursePhrasesFailed = coursePhrasesResults.filter((r) => !r.ok);
const coursePhrasesPassed = coursePhrasesResults.length - coursePhrasesFailed.length;

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

/**
 * Guards the single-source-of-truth contract for grammar policy.
 *
 * Each assertion here corresponds to a bug that shipped because a consumer kept its
 * own copy of a language fact: the Showcase aligner pointed English "not" at `ko`
 * (the live root for *to drink*) and at `ban` (a form absent from every seed), had no
 * entry for the real negation particle, and attributed "we/us/our" to the first-person
 * singular instead of the collective. A stale generated module is caught separately by
 * `npm run fonoran:policy:check`; these tests catch a policy that is fresh but wrong.
 */
async function runLanguagePolicyTests() {
  const policy = await import('../tools/fonoran-language-policy.js');
  const seedParticles = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data/fonoran-grammar-particles.json'), 'utf8'),
  ).particles ?? [];
  const results = [];

  results.push(test('language policy: particle list matches the seed exactly', () => {
    const expected = seedParticles.map(p => p.form).filter(Boolean);
    const actual = policy.particleForms();
    assert(actual.length === expected.length, `expected ${expected.length} particles, got ${actual.length}`);
    for (const form of expected) assert(actual.includes(form), `missing particle ${form}`);
  }));

  results.push(test('language policy: negation is mapped, and not to a lexical root', () => {
    const negation = seedParticles.find(p => p.id === 'logic_not')?.form;
    assert(negation, 'seed has no logic_not particle');
    const byForm = policy.functionWordEnglishByForm();
    assert(byForm.has(negation), `English "not" has no link target: ${negation} is absent from the mapping`);
    assert(byForm.get(negation).includes('not'), `${negation} does not claim the word "not"`);
    // `ko` is the approved root for `drink`. It must never carry negation again.
    assert(!byForm.has('ko'), 'negation is mapped onto ko, which is the root for drink');
    assert(!byForm.has('ban'), 'mapping references ban, which exists in no seed');
  }));

  results.push(test('language policy: every mapped form exists in the seeds', () => {
    for (const [form, english] of policy.functionWordEnglishByForm()) {
      assert(typeof form === 'string' && form.length > 0, 'empty form in mapping');
      assert(Array.isArray(english) && english.length > 0, `${form} maps to no English words`);
      assert(policy.formForConcept(form) !== undefined, `${form} does not resolve`);
    }
  }));

  results.push(test('language policy: first person singular does not claim the plural', () => {
    const byForm = policy.functionWordEnglishByForm();
    const singular = seedParticles.find(p => p.id === 'pronoun_i')?.form;
    assert(singular, 'seed has no pronoun_i');
    for (const word of ['we', 'us', 'our']) {
      assert(!byForm.get(singular).includes(word), `${singular} wrongly claims "${word}"`);
    }
  }));

  results.push(test('language policy: interrogatives compose from a dimension, never a scale value', () => {
    assert(policy.whSurface('why') === `${policy.unknownWord().form} ${policy.formForConcept('cause')}`);
    assert(policy.whSurface('who') === `${policy.unknownWord().form} ${policy.formForConcept('person')}`);
    // `how` pairs with manner (do+form). Quantity is unknown+count: English how many / how much
    // are one interrogative, never unknown+many (a value on the scale).
    assert(policy.whSurface('how') === `${policy.unknownWord().form} ${policy.formForConcept('manner')}`);
    assert(policy.whSurface('how many') === `${policy.unknownWord().form} ${policy.formForConcept('count')}`);
    assert(policy.whSurface('how much') === `${policy.unknownWord().form} ${policy.formForConcept('count')}`);
    assert(policy.whComposition().how?.[1] === 'manner', '`how` must compose with the manner dimension');
    assert(policy.whComposition()['how many']?.[1] === 'count', '`how many` must compose with count');
    assert(!policy.whBlocked()['how many'], '`how many` is expressible via count');
  }));

  results.push(test('language policy: unknown probe is derived from its parts, not a literal', () => {
    const unknown = policy.unknownWord();
    assert(unknown.parts.length === unknown.concepts.length, 'a part failed to resolve');
    assert(unknown.form === unknown.parts.join(''), `${unknown.form} is not the concatenation of ${unknown.parts}`);
  }));

  results.push(test('language policy: modal markers resolve and stay distinct', () => {
    const markers = ['ability', 'necessity', 'possibility'].map(s => policy.modalMarker(s));
    for (const m of markers) assert(m, 'a modal sense has no marker');
    assert(new Set(markers).size === markers.length, 'two modal senses share one marker');
    // `should` must stay a gap: routed through `need` it reverses under negation.
    assert(policy.modalBlocked().should, '`should` must stay explicitly blocked with a reason');
    assert(!policy.modalComposition().should, '`should` must not acquire a composition');
  }));

  results.push(test('language policy: disjunction marker is a real form and conjunction has none', () => {
    const d = policy.disjunction();
    assert(d.marker_form, 'disjunction marker does not resolve');
    assert(d.marker_form === policy.formForConcept(d.marker_concept));
    assert(d.english.includes('or'), 'disjunction does not claim "or"');
    assert(d.conjunction_english.includes('and'), 'conjunction words not recorded');
  }));

  /**
   * Rings are the one place where the direction of truth runs the other way:
   * `scripts/fonoran-root-rings-apply.js` generates data/fonoran-root-rings.json from the
   * hardcoded RING_*_IDS in tools/fonoran-experience-tiers.js, so the JS is upstream and
   * the seed is derived. That is a legitimate arrangement, but nothing asserted the two
   * agreed, so a hand-edit of either side could drift silently. This is the same
   * guarantee the policy codegen gets from `--check`, pointed the other way.
   */
  const tiers = await import('../tools/fonoran-experience-tiers.js');
  const ringSeed = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data/fonoran-root-rings.json'), 'utf8'),
  );
  results.push(test('root rings: the generated seed matches the ring definitions in code', () => {
    const seedById = Object.fromEntries((ringSeed.rings ?? []).map(r => [r.id, r.concept_ids ?? []]));
    const pairs = [
      ['communicative_core', tiers.RING_1_IDS],
      ['extended_core', tiers.RING_2_IDS],
      ['fluent_core', tiers.RING_3_IDS],
    ];
    for (const [ringId, codeIds] of pairs) {
      const seedIds = seedById[ringId] ?? [];
      assert(seedIds.length === codeIds.length, `${ringId}: seed has ${seedIds.length}, code has ${codeIds.length}`);
      for (const id of codeIds) assert(seedIds.includes(id), `${ringId}: ${id} is in code but not the seed`);
      for (const id of seedIds) assert(codeIds.includes(id), `${ringId}: ${id} is in the seed but not code`);
    }
    // The policy module reads the seed, so it must agree with both.
    for (const [ringId, codeIds] of pairs) {
      for (const id of codeIds) assert(policy.ringFor(id) === ringId, `${id} resolves to the wrong ring`);
    }
  }));

  /**
   * Publishing guarantee: the public surfaces show exactly the vocabulary that was committed.
   * This used to be a runtime check that the default read mode was "seeds", because the language
   * also lived in Postgres and a populated database kept serving whatever existed at its first
   * boot. The language store no longer has a database at all, so the guarantee is now structural
   * and this asserts the structure instead of the setting: if a connection ever reappears in the
   * language store, a stale copy can be published again.
   */
  const storeSource = readFileSync(new URL('../tools/fonoran-store.js', import.meta.url), 'utf8');
  results.push(test('publishing: the language store has no database connection', () => {
    for (const marker of ['DATABASE_URL', "'pg'", 'fonoran_lab_bucket', 'fonoran_editorial_docs']) {
      assert(
        !storeSource.includes(marker),
        `fonoran-store.js mentions ${marker}: the language must come from the committed seeds only`,
      );
    }
  }));

  results.push(test('language policy: every root is assigned to exactly one ring', () => {
    const caps = policy.ringCaps();
    assert(caps.ring_3_cumulative === 150, `root cap changed: ${caps.ring_3_cumulative}`);
    assert(policy.ringFor('water'), 'a Ring 1 concept has no ring assignment');
  }));

  /**
   * Composition policy: the translator may build a word from approved parts at runtime,
   * but the human owns the lexicon, so such a word must never pass as approved vocabulary.
   * The distinction is what lets Lessons refuse it while the Translator still offers it.
   */
  const resolve = await import('../tools/fonoran-english-resolve.js');
  const ctx = await resolve.buildResolveContext();

  results.push(test('composition: parts that spell an approved word resolve to that word', () => {
    const token = resolve.composeConceptToken(ctx, ['feel', 'good'], { role: 'object' });
    assert(token?.fonoran === 'nesgu', `expected nesgu, got ${token?.fonoran}`);
    assert(token.concept_id === 'relieved', `expected the approved concept, got ${token.concept_id}`);
    assert(!token.ad_hoc_composition, 'an approved word must not be marked as composed');
  }));

  results.push(test('composition: a word the lexicon does not own is marked as composed', () => {
    const token = resolve.composeConceptToken(ctx, ['animal', 'body'], { role: 'object' });
    assert(token?.fonoran === 'kalfem', `expected kalfem, got ${token?.fonoran}`);
    assert(token.ad_hoc_composition, 'an unapproved composition must be marked');
    assert(token.concept_id === 'animal+body', `expected concept ids, got ${token.concept_id}`);
  }));

  results.push(test('composition: spelled-out parts are described in concept ids', () => {
    // The LLM sometimes writes spellings ("tes") where a concept id ("pain") belongs.
    const token = resolve.composeConceptToken(ctx, ['tes', 'temkan'], { role: 'object' });
    assert(token?.concept_id === 'pain+ending', `expected pain+ending, got ${token?.concept_id}`);
  }));

  /**
   * Seed invariants: a rule the project wrote down but checks only at generation time
   * is a comment. These guard the checker itself, so the rule cannot quietly stop
   * matching the lexicon the way the excluded-syllable list did.
   */
  const invariants = await import('../tools/fonoran-invariants.js');
  const invariantCtx = await invariants.loadInvariantContext();
  const invariantRun = await invariants.runInvariants(invariantCtx);

  results.push(test('invariants: the committed lexicon has no unrecorded violations', () => {
    const detail = invariantRun.violations.map(v => `${v.subject} (${v.concept})`).join(', ');
    assert(invariantRun.violations.length === 0, `unrecorded violation(s): ${detail}`);
  }));

  /**
   * A CLI whose entry-point guard never matches runs to completion doing nothing and still
   * exits 0. That is how the compound audit sat dead: it compared import.meta.url against a
   * raw `file://` path, and this checkout lives under "Fonora Org", so the space encoded to
   * %20 on one side only. Five CLIs were affected and npm reported success every time.
   */
  const isMain = await import('../tools/is-main.js');
  const { pathToFileURL } = await import('node:url');

  results.push(test('cli: an entry point is recognised through a path that needs encoding', () => {
    const spaced = '/tmp/Fonora Org/tool.js';
    const argv = process.argv[1];
    try {
      process.argv[1] = spaced;
      assert(
        isMain.isMainModule(pathToFileURL(spaced).href),
        'a tool invoked through a path containing a space must be recognised as the entry point',
      );
      assert(
        !isMain.isMainModule(pathToFileURL('/tmp/other.js').href),
        'a module that is not the entry point must not claim to be',
      );
    } finally {
      process.argv[1] = argv;
    }
  }));

  /**
   * Deterministic compound semantics. The signal these replace was an LLM playtest scored by
   * exact match on the English headword, which ranked world as whole+place+earth+life above
   * earth+life. These assert the scorer measures gloss agreement and resists the two ways a
   * loose match makes it untrustworthy.
   */
  const semantics = await import('../tools/fonoran-compound-semantics.js');
  const semanticFixture = semantics.buildSemanticContext({
    inventory: {
      primitives: [
        { id: 'person', domain: 'being', plain_description: 'a person; someone' },
        { id: 'back', domain: 'space', plain_description: 'behind; the back side; rear' },
        { id: 'before', domain: 'time', plain_description: 'earlier; in the past' },
        { id: 'place', domain: 'space', plain_description: 'a location' },
        { id: 'star', domain: 'element', plain_description: 'a star in the sky' },
        { id: 'source', domain: 'abstract', plain_description: 'the origin of something' },
        { id: 'life', domain: 'being', plain_description: 'being alive' },
      ],
    },
    compounds: [{ concept: 'distant_place', preferred: { composition: ['far', 'place'], gloss: 'a place far away' } }],
    candidatesByConcept: {
      elder: [['person', 'before'], ['person', 'back']],
      birth: [['life', 'before'], ['source', 'life']],
    },
  });

  results.push(test('semantics: a gloss naming a listed candidate outranks the preferred form', () => {
    const ranked = semantics.rankCandidatesByGloss({
      concept: 'elder',
      preferred: { composition: ['person', 'back'], gloss: 'an older person; one who came before' },
      preferred_source: 'playtest',
    }, semanticFixture);
    assert(ranked.better_available, 'the gloss says "came before" while the composition says back');
    assert(
      ranked.best.composition.join('+') === 'person+before',
      `expected person+before, got ${ranked.best.composition.join('+')}`,
    );
  }));

  results.push(test('semantics: "start" is not read as the root for star', () => {
    const ranked = semantics.rankCandidatesByGloss({
      concept: 'birth',
      preferred: { composition: ['life', 'before'], gloss: 'the start of life' },
    }, semanticFixture);
    const proposed = ranked.best.composition.join('+');
    assert(!proposed.includes('star'), `a celestial body has no business in birth: got ${proposed}`);
  }));

  results.push(test('semantics: a gloss that only restates the headword is not scored', () => {
    const ranked = semantics.rankCandidatesByGloss({
      concept: 'breathe',
      preferred: { composition: ['inside', 'air'], gloss: 'breathe' },
    }, semanticFixture);
    assert(!ranked.informative, 'a gloss identical to the headword cannot check a composition');
    assert(!ranked.better_available, 'an uninformative gloss must not drive a recommendation');
  }));

  results.push(test('semantics: a two-word concept is not named by half of its name', () => {
    const scored = semantics.scoreCompound({
      concept: 'campfire',
      preferred: { composition: ['fire', 'near'], gloss: 'fire at a place' },
    }, semanticFixture);
    assert(
      !scored.gloss_named_absent.includes('distant_place'),
      'a gloss saying "place" must not name distant_place, or every locative proposes every other',
    );
  }));

  results.push(test('invariants: an English word owned by two concepts is caught', () => {
    const found = invariants.englishWordOwnershipRule.run({
      conceptIds: new Set(['plant', 'tree']),
      localization: {
        entries: {
          plant: { label: 'plant', aliases: ['tree'] },
          tree: { label: 'tree', aliases: [] },
        },
      },
      ownership: { contested: [] },
    });
    assert(found.length === 1, `expected one finding, got ${found.length}`);
    assert(!found[0].waived, 'an unrecorded collision must fail: the translator would have to guess');
  }));

  results.push(test('invariants: a recorded contested word is visible debt, not a failure', () => {
    const found = invariants.englishWordOwnershipRule.run({
      conceptIds: new Set(['angry', 'move']),
      localization: {
        entries: {
          angry: { label: 'angry', aliases: ['cross'] },
          move: { label: 'move', aliases: ['cross'] },
        },
      },
      ownership: { contested: [{ word: 'cross', concepts: ['angry', 'move'] }] },
    });
    assert(found.length === 1 && found[0].waived, 'a recorded ruling-pending word must not fail the build');
    assert(found[0].reason, 'a waived finding has to say why it is waived');
  }));

  results.push(test('invariants: an excluded syllable is caught, not assumed absent', () => {
    const found = invariants.excludedSyllableRule.run({
      config: { excluded_syllables: { forms: ['poo'] } },
      roots: [{ id: 'test_concept', spelling: 'poo', ipa: '/puː/' }],
      compounds: [],
    });
    assert(found.length === 1, `expected one finding, got ${found.length}`);
    assert(!found[0].waived, 'an unrecorded violation must not be waived');
  }));

  results.push(test('invariants: fusing two clean parts into an excluded sound is caught', () => {
    const found = invariants.excludedSyllableRule.run({
      config: { excluded_syllables: { forms: ['po'] } },
      roots: [],
      compounds: [{ spelling: 'lapo', concept_id: 'test_fusion', parts: ['la', 'o'], state: 'approved' }],
    });
    assert(found.length === 1, `expected the fused sequence to be caught, got ${found.length}`);
  }));

  results.push(test('invariants: a waiver is honoured but must carry a reason', () => {
    const waivedRun = invariants.excludedSyllableRule.run({
      config: {
        excluded_syllables: {
          forms: ['poo'],
          known_violations: [{ form: 'poo', concept: 'test_concept', reason: 'recorded exception' }],
        },
      },
      roots: [{ id: 'test_concept', spelling: 'poo' }],
      compounds: [],
    });
    assert(waivedRun.length === 1 && waivedRun[0].waived, 'a recorded exception should be waived, not failed');
    for (const w of invariantRun.waived) {
      assert(w.reason, `${w.subject} is waived without a reason`);
    }
  }));

  results.push(test('invariants: reusing a retired spelling is caught', () => {
    // `fa` was retired and then approved for `child` because retirement lived in code.
    const retired = invariants.retiredReassignmentRule.run({
      roots: [{ id: 'some_new_concept', spelling: 'fa' }],
      compounds: [],
      retired: [{ form: 'fa', concept: 'child', retired_at: '2026-07-29' }],
    });
    assert(retired.length === 1, `expected the reused spelling to be caught, got ${retired.length}`);
    assert(retired[0].severity === 'error', 'reuse must gate, not merely advise');
  }));

  results.push(test('invariants: the dimension rule reports without gating', () => {
    const advisory = invariants.dimensionConsistencyRule.run({
      dimensions: {
        dimensions: [
          { id: 'time_past', owner: 'before' },
          { id: 'space_rear', owner: 'back', reserved_for: 'space' },
        ],
        sense_markers: { time: ['older'] },
      },
      compoundSeed: [
        { concept: 'elder', preferred: { composition: ['person', 'back'], gloss: 'an older person' } },
        { concept: 'behind', preferred: { composition: ['outside', 'back'], gloss: 'to the rear of' } },
      ],
    });
    assert(advisory.length === 1, `expected only the temporal misuse, got ${advisory.length}`);
    assert(advisory[0].concept === 'elder', `flagged ${advisory[0].concept}`);
    assert(advisory[0].severity === 'advisory', 'the gloss heuristic must not gate CI');
    assert(!invariantRun.violations.some(v => v.rule === 'dimension-consistency'), 'advisories must stay out of violations');
  }));

  // Possessive determiners sat in the parser's SKIP set, so the possessor was deleted
  // before the parse and `mi`/`be` were the two most-dropped tokens in the corpus. `your`
  // was also aliased to `skin`, so where it did survive it meant the wrong thing.
  const translateModule = await import('../tools/fonoran-translate.js');
  const [possessed, yourResolution, wantQuestion, wantStatement] = await Promise.all([
    translateModule.translate('I am not your enemy.', { engine: 'legacy' }),
    (async () => {
      const resolve = await import('../tools/fonoran-english-resolve.js');
      const bucket = await import('../tools/fonoran-sound-bucket.js');
      const ctx = await resolve.buildResolveContext(await bucket.loadBucket());
      return resolve.resolveEnglishToken('your', ctx, { role: 'object' });
    })(),
    // No engine is named, so these also assert what the public translator now answers with.
    translateModule.translate('Do you want to go to the beach?', {}),
    translateModule.translate('I want to go to the beach', {}),
  ]);

  results.push(test('translation: the default engine needs no API key', () => {
    assert(
      wantQuestion.engine !== 'llm',
      `the default engine is ${wantQuestion.engine}: an unset key makes the public translator fail`,
    );
    assert(wantQuestion.ok !== false, `default engine errored: ${wantQuestion.error ?? ''}`);
  }));

  // A motion reading was attempted before the desire reading and matched on the infinitive
  // alone, so the desire verb was swallowed: the statement asserted going rather than wanting,
  // and in the question everything before `go` was joined into one pseudo-token ("you want to")
  // that resolved to an unrelated root with no gap reported.
  results.push(test('translation: "want to go" wants, it does not just go', () => {
    for (const [label, res] of [['question', wantQuestion], ['statement', wantStatement]]) {
      const roman = String(res.surface?.roman ?? '');
      assert(roman.includes('sak'), `${label} dropped want entirely: got "${roman}"`);
    }
  }));

  // `how` was blocked while no manner concept existed, and the word was then dropped without
  // a gap in every sentence that was not a question, so "I do not know how" claimed to be a
  // complete translation of "I do not know".
  const [howMake, howFar, howMany, howKnow, howNotKnow] = await Promise.all([
    translateEnglish('How do you make fire?'),
    translateEnglish('How far is the water?'),
    translateEnglish('How many people are there?'),
    translateEnglish('I know how to make fire.'),
    translateEnglish('I do not know how.'),
  ]);

  results.push(test('translation: a manner question asks unknown + manner', () => {
    const roman = String(howMake.surface?.roman ?? '');
    assert(roman.startsWith('ka nohu moyu '), `manner question: ${roman}`);
    assert(howMake.unresolved.length === 0, `manner question gaps: ${howMake.unresolved.join(', ')}`);
    const manner = howMake.tokens.find(t => t.concept_id === 'manner');
    assert(manner?.fonoran === 'moyu', `manner token: ${JSON.stringify(manner)}`);
  }));

  results.push(test('translation: a degree question probes the scale, it does not assert it', () => {
    // "how far" has no dimension yet, so it is asked as "is the water far".
    assert(howFar.surface.roman === 'ka ye fet.', `how far: ${howFar.surface.roman}`);
    assert(!howFar.surface.roman.includes('moyu'), 'a degree question is not a manner question');
    assert(!howFar.surface.roman.includes('tan'), 'a degree question is not a count question');
    assert(howFar.interpretations.some(i => /degree/.test(i.reason ?? '')), 'the narrowing must be reported');
  }));

  results.push(test('translation: a quantity question asks unknown + count', () => {
    const roman = String(howMany.surface?.roman ?? '');
    assert(roman.startsWith('ka nohu tan '), `how many: ${roman}`);
    assert(!roman.includes('lek'), 'quantity must not assert many');
    assert(howMany.unresolved.length === 0, `how many gaps: ${howMany.unresolved.join(', ')}`);
    const count = howMany.tokens.find(t => t.concept_id === 'count');
    assert(count?.fonoran === 'tan', `count token: ${JSON.stringify(count)}`);
  }));

  results.push(test('translation: outside a question `how` is the manner word, never silence', () => {
    assert(howNotKnow.surface.roman === 'mi no hu moyu.', `not know how: ${howNotKnow.surface.roman}`);
    // "know how to" is carried by the infinitive: `hu kel dat` already says it.
    assert(!howKnow.surface.roman.includes('moyu'), `know how to: ${howKnow.surface.roman}`);
  }));

  results.push(test('translation: a subject is one word, not a joined span', () => {
    const subjects = (wantQuestion.tokens ?? []).filter(t => t.role === 'subject');
    for (const t of subjects) {
      assert(
        !String(t.english ?? '').includes(' '),
        `subject "${t.english}" is a joined span resolved as one word (${t.fonoran})`,
      );
    }
  }));

  results.push(test('translation: a possessor is not dropped on the floor', () => {
    const roman = String(possessed.surface?.roman ?? '');
    assert(roman.includes('be'), `the possessor should survive: got "${roman}"`);
  }));

  results.push(test('lexicon: "your" is a possessor, never the word for skin', () => {
    assert(
      yourResolution.concept_id !== 'skin',
      `"your" resolved to skin (${yourResolution.fonoran}), which mistranslates every possessive`,
    );
  }));

  // The lab bucket is gitignored, so any fresh checkout or deploy derives it from the
  // seeds on first read. That derivation used to fall back to a blank-slate bucket on any
  // error and persist it, publishing an empty Dictionary, Translator and Learn while
  // answering 200 with health at 100.
  const soundBucket = await import('../tools/fonoran-sound-bucket.js');
  const publishedLab = await soundBucket.loadBucket();
  const approvedSeedRoots = JSON.parse(
    readFileSync(new URL('../data/fonoran-approved-roots.json', import.meta.url), 'utf8'),
  ).roots ?? [];

  results.push(test('publishing: a lab derived from the seeds is never an empty language', () => {
    assert(approvedSeedRoots.length > 0, 'the seeds should hold approved roots for this to mean anything');
    assert(
      (publishedLab.sounds ?? []).length > 0,
      `the published lab has no roots while the seeds hold ${approvedSeedRoots.length}`,
    );
    assert((publishedLab.compounds ?? []).length > 0, 'the published lab has no compound words');
    assert(
      publishedLab.version !== '2.0-blank-slate',
      'a blank slate must not be served while the seeds hold an approved lexicon',
    );
  }));

  // `test` is synchronous, so the frames are compiled before the assertions run.
  const translator = await import('../tools/fonoran-translator.js');
  const ownedGapFrame = await translator.translateFromFrame({
    slots: { object: ['tes+temkan'] },
    unresolved: ['relieved'],
  }, { input: 'relieved' });
  const openGapFrame = await translator.translateFromFrame({
    slots: { object: ['animal+body'] },
    unresolved: ['meat'],
  }, { input: 'meat' });

  results.push(test('composition: an approved word beats a composed stand-in for the same gap', () => {
    assert(ownedGapFrame.surface.roman.includes('nesgu'), `expected nesgu, got ${ownedGapFrame.surface.roman}`);
    assert(ownedGapFrame.unresolved.length === 0, `gap should close: ${JSON.stringify(ownedGapFrame.unresolved)}`);
  }));

  results.push(test('composition: a gap the lexicon cannot fill stays an honest gap', () => {
    assert(openGapFrame.unresolved.includes('meat'), `gap should survive: ${JSON.stringify(openGapFrame.unresolved)}`);
    assert(
      openGapFrame.tokens.some(t => t.ad_hoc_composition),
      'the stand-in must stay marked as composed',
    );
  }));

  return results;
}

const languagePolicyResults = await runLanguagePolicyTests();

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

const prefixSafeResult = test('prefix-safe inventory: no approved root prefixes another', () => {
  assert(isPrefixSafe('du', ['dak', 'dal', 'fa']), 'du does not conflict with dak family');
  assert(!isPrefixSafe('da', ['dak', 'dal']), 'da prefixes dak/dal');
  assert(findPrefixConflicts('dak', ['da', 'fa']).includes('da'), 'dak reports da blocker');

  const approvedRoots = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../data/fonoran-approved-roots.json'), 'utf8'));
  const phoneticsConfig = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../data/fonoran-primitive-roots-config.json'), 'utf8'));
  const inv = buildPrefixSafeInventory({ approvedRoots, phoneticsConfig });
  assert(inv.prefix_pairs.length === 0, `expected 0 prefix pairs, got ${inv.prefix_pairs.length}`);
  assert(inv.approved_prefix_unsafe.length === 0, 'no approved root should be prefix-unsafe');
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
  ...keyboardFailed,
  ...authFailed,
  ...corpusResults.filter((r) => !r.ok),
  ...languagePolicyResults.filter((r) => !r.ok),
  ...(rootWorkflowResult.ok ? [] : [rootWorkflowResult]),
  ...(parserResult.ok ? [] : [parserResult]),
  ...(composeResult.ok ? [] : [composeResult]),
  ...(derivedResult.ok ? [] : [derivedResult]),
  ...(graphResult.ok ? [] : [graphResult]),
  ...(pronunciationResult.ok ? [] : [pronunciationResult]),
  ...(syllableCatalogResult.ok ? [] : [syllableCatalogResult]),
  ...(piperGResult.ok ? [] : [piperGResult]),
  ...(piperMultiWordResult.ok ? [] : [piperMultiWordResult]),
  ...(piperLaxStressResult.ok ? [] : [piperLaxStressResult]),
  ...(piperSoftMapResult.ok ? [] : [piperSoftMapResult]),
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
  ...(prefixSafeResult.ok ? [] : [prefixSafeResult]),
  ...(labSearchResult.ok ? [] : [labSearchResult]),
  ...coursePhrasesFailed,
];
const allPassed =
  passed
  + keyboardPassed
  + authPassed
  + coursePhrasesPassed
  + corpusResults.filter((r) => r.ok).length
  + languagePolicyResults.filter((r) => r.ok).length
  + (parserResult.ok ? 1 : 0)
  + (composeResult.ok ? 1 : 0)
  + (derivedResult.ok ? 1 : 0)
  + (graphResult.ok ? 1 : 0)
  + (pronunciationResult.ok ? 1 : 0)
  + (syllableCatalogResult.ok ? 1 : 0)
  + (ipaFormatResult.ok ? 1 : 0)
  + (piperGResult.ok ? 1 : 0)
  + (piperMultiWordResult.ok ? 1 : 0)
  + (piperLaxStressResult.ok ? 1 : 0)
  + (piperSoftMapResult.ok ? 1 : 0)
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
  + (prefixSafeResult.ok ? 1 : 0)
  + (rootWorkflowResult.ok ? 1 : 0)
  + (labSearchResult.ok ? 1 : 0);
const allTotal = total + keyboardTotal + authResults.length + coursePhrasesResults.length + corpusResults.length + languagePolicyResults.length + 27;

for (const f of allFailed) console.error('FAIL:', f.name, '-', f.error);
console.log(`${allPassed}/${allTotal} tests passed`);
process.exit(allFailed.length ? 1 : 0);
