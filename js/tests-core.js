import { getEncodableEntries, getQuizEntries, getVowelPhonemeKeys, vowelSymbolForKey, buildPhonemeInventory } from './rules.js';
import { encodeSounds } from './encode.js';
import { decodeSymbols, decodeText, decodeToPhonemeKeys, normalizeSymbolInput } from './decode.js';
import { normalizeIpa, registerIpaVowelMap, setActiveIpaVowelMap, registerConsonantMapFromRules, findConsonantMapSyncIssues, buildConsonantMapFromRules } from './ipa-normalize.js';
import { applyPrimarySymbols } from './symbol-compose.js';
import { encodeFromIpa } from './ipa-encode-helper.js';
import { ipaPhonemesToFonora } from './ipa-to-fonora.js';
import { findConcatenationCollisions } from './collision-audit.js';
import { resolvePipelineOptions, setActiveLanguageRulesBundle } from './fonora-config.js';
import {
  groupsToIpa,
  normalizeIpaForComparison,
  symbolsToRecoveredIpa,
  phonemeKeysToRecoveredIpa,
  detectCollisionWarnings,
  summarizeValidationResults,
} from './pronunciation-validation.js';
import { V2_COLLISION_GROUPS } from './vowel-v2-collision-groups.js';
import { containsDoubleVowelMarker, validateVowelSymbolString } from './vowel-grammar.js';
import { VOWEL_ARCHITECTURE_WORDS } from './vowel-architecture-set.js';
import { docViewerHref, githubDocUrl, normalizeDocPath, parseDocFromLocation } from './doc-urls.js';
import { renderMarkdown } from './markdown-render.js';
import { ASCII_EQUALS } from './load-language-rules.js';

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

function enc(sounds, rules) {
  return encodeSounds(sounds, rules);
}

function vowelSym(rules, key) {
  return vowelSymbolForKey(rules, key);
}

/**
 * Browser-safe test runner. Requires a loaded rules bundle (from markdown fetch).
 * @param {{ bundle: object }} options
 */
export function runTests(options) {
  if (!options?.bundle?.rules) {
    throw new Error('runTests requires options.bundle from loaded language rules');
  }

  const rulesBundle = options.bundle;
  const rules = rulesBundle.rules;
  const registry = rulesBundle.registry;
  const lips = registry.places.lips;
  const voice = registry.modifiers.voice;
  const friction = registry.modifiers.friction;
  const nasal = registry.modifiers.nasal;
  const glide = registry.modifiers.glide;
  const throat = registry.places.throat;
  const vowelMarker = registry.modifiers.vowel;
  const front = registry.places.frontTongue;
  const middle = registry.places.middleTongue;
  const back = registry.places.backTongue;

  registerIpaVowelMap(rulesBundle.ipaVowelMode, rulesBundle.ipaVowelMap);
  setActiveIpaVowelMap(rulesBundle.ipaVowelMap);
  registerConsonantMapFromRules(rules);
  setActiveLanguageRulesBundle(rulesBundle);

  const results = [];
  const t = (name, fn) => results.push(test(name, fn));

  t('registry loaded from markdown', () => {
    assert(lips === '∋');
    assert(lips !== ASCII_EQUALS);
    assert(registry.places.frontTongue === '∩');
    assert(throat === '⊃');
    assert(vowelMarker === '⚬');
    assert(Object.keys(registry.vowels).length === 12);
    assert(!registry.vowels.oo);
    assert(rules.places.length === 5);
    assert(rulesBundle.fonoraVersion === 'v3');
    assert(rulesBundle.ipaVowelMode === 'v3');
  });

  t('resolvePipelineOptions defaults to v3', () => {
    assert(resolvePipelineOptions({}).fonoraVersion === 'v3');
    assert(resolvePipelineOptions({}).vowelMode === 'v3');
    setActiveLanguageRulesBundle(null);
    assert(resolvePipelineOptions({}).fonoraVersion === 'v3');
    setActiveLanguageRulesBundle(rulesBundle);
  });

  t('consonant map is built from language rules', () => {
    const built = buildConsonantMapFromRules(rules);
    assert(Object.keys(built).length >= 20, 'expected grid + derived IPA tokens');
    const issues = findConsonantMapSyncIssues(rules);
    assert(issues.length === 0, issues.join('; '));
  });

  t('v3 vowel inventory conforms to grammar', () => {
    for (const [key, sym] of Object.entries(registry.vowels)) {
      const result = validateVowelSymbolString(sym);
      assert(result.ok, `${key} "${sym}": ${result.reason}`);
      assert(!containsDoubleVowelMarker(sym), `${key} must not contain ⚬⚬`);
    }
  });

  t('sound grid composed from primaries (5 places only)', () => {
    const pCell = rules.soundGrid.find((c) => c.modifierId === 'plain' && c.placeId === 'lips');
    assert(pCell.symbols === lips);
    const bCell = rules.soundGrid.find((c) => c.sound === 'b');
    assert(bCell.symbols === `${voice}${lips}`);
    assert(rules.places.every((p) => ['lips', 'front_tongue', 'middle_tongue', 'back_tongue', 'throat'].includes(p.id)));
  });

  t('phoneme inventory groups encodable sounds accurately', () => {
    const inventory = buildPhonemeInventory(rules);
    const bRow = inventory.consonants.find((r) => r.key === 'b');
    assert(bRow, 'b consonant row missing');
    assert(bRow.symbols === `${voice}${lips}`, `b should be ${voice}${lips}, got ${bRow.symbols}`);
    assert(bRow.symbols !== voice, 'b must not be voice modifier alone');

    const shRow = inventory.consonants.find((r) => r.key === 'sh');
    assert(shRow, 'sh consonant row missing');
    assert(shRow.symbols === `${friction}${middle}`);

    const thRow = inventory.derived.find((r) => r.key === 'th');
    assert(thRow, 'th derived row missing');

    const eeRow = inventory.vowels.find((r) => r.key === 'ee');
    assert(eeRow, 'ee vowel row missing');
    assert(eeRow.symbols === `${vowelMarker}${front}`);
    assert(eeRow.symbols.length === 2, 'ee should be 2-symbol vowel spelling');
  });

  t('core vowels composed from recipes', () => {
    assert(registry.vowels.ee === `${vowelMarker}${front}`);
    assert(registry.vowels.i === `${vowelMarker}${middle}`);
    assert(registry.vowels.e === `${vowelMarker}${voice}`);
    assert(registry.vowels.ae === `${vowelMarker}${friction}`);
    assert(registry.vowels.a === `${vowelMarker}${throat}`);
    assert(registry.vowels.o === `${vowelMarker}${back}`);
    assert(registry.vowels.oh === `${vowelMarker}${nasal}`);
    assert(registry.vowels.u === `${vowelMarker}${lips}`);
  });

  t('composite vowels composed from recipes', () => {
    assert(registry.vowels.eye === `${vowelMarker}${throat}${glide}${back}`);
    assert(registry.vowels.ow === `${vowelMarker}${throat}${glide}${lips}`);
    assert(registry.vowels.oy === `${vowelMarker}${back}${glide}${back}`);
    assert(registry.vowels.ay === `${vowelMarker}${voice}${glide}${back}`);
    assert(registry.vowels.eye !== registry.vowels.oy);
    assert(registry.vowels.oy !== `${vowelMarker}${back}${glide}${middle}`);
  });

  t('primary symbol swap recomposes vowel recipes', () => {
    const trial = structuredClone(rules);
    trial.places.find((p) => p.id === 'lips').symbol = '◆';
    applyPrimarySymbols(trial);
    assert(trial.vowels.find((v) => v.key === 'u').symbols === `${vowelMarker}◆`);
  });

  t('no ASCII = in inventory', () => {
    assert(!registry.allSymbols.includes(ASCII_EQUALS));
  });

  t('lips consonants use composed symbols', () => {
    assert(enc('p', rules).symbols === lips);
    assert(enc('b', rules).symbols === `${voice}${lips}`);
  });

  t('plain throat /h/ encodes as ⊃ per sound grid', () => {
    assert(enc('h', rules).symbols === throat);
    assert(decodeSymbols(throat, rules).pronunciation === 'h');
  });

  t('throat grid fricatives encode and decode as kh and gh', () => {
    const frictionThroat = `${friction}${throat}`;
    const voiceThroat = `${voice}${throat}`;
    const backFricative = `${friction}${back}`;

    assert(frictionThroat !== backFricative);
    assert(decodeToPhonemeKeys(frictionThroat, rules).phonemeKeys === 'kh');
    assert(decodeToPhonemeKeys(voiceThroat, rules).phonemeKeys === 'gh');
    assert(decodeSymbols(frictionThroat, rules).pronunciation === 'kh');
    assert(decodeSymbols(voiceThroat, rules).pronunciation === 'gh');

    assert(normalizeIpa('bax', { vowelMap: rulesBundle.ipaVowelMap }).phonemeString === 'bax');
    assert(normalizeIpa('lɒx', { vowelMap: rulesBundle.ipaVowelMap }).phonemeString === 'lox');
    assert(normalizeIpa('χa', { vowelMap: rulesBundle.ipaVowelMap }).phonemeString === 'kha');
    assert(normalizeIpa('ɣajn', { vowelMap: rulesBundle.ipaVowelMap }).phonemeString === 'ghayn');

    const bach = encodeFromIpa('bax', rulesBundle);
    assert(bach.symbols.includes(backFricative));
    assert(!bach.symbols.includes(frictionThroat));
    assert(bach.decoded === 'b a x');

    const ghain = encodeFromIpa('ɣajn', rulesBundle);
    assert(ghain.symbols.includes(voiceThroat));
    assert(ghain.decoded === 'gh ay n');

    const kha = encodeFromIpa('χa', rulesBundle);
    assert(kha.symbols.includes(frictionThroat));
    assert(kha.decoded === 'kh a');
  });

  t('symbol round-trip recovers phoneme keys without English spelling confusion', () => {
    const cases = [
      ['bor', 'b o r'],
      ['boy', 'b oy'],
      ['bohr', 'b oh r'],
    ];
    for (const [phonemes, expected] of cases) {
      const result = ipaPhonemesToFonora(phonemes, rules);
      assert(result.decoded === expected, `${phonemes} recovered "${result.decoded}", expected "${expected}"`);
    }
    assert(
      ipaPhonemesToFonora('bor', rules).decoded !== ipaPhonemesToFonora('boy', rules).decoded,
      'bar-like b o r must not recover as b oy',
    );
  });

  t('decodeToPhonemeKeys keeps diphthong oy distinct from o + r', () => {
    const barLike = ipaPhonemesToFonora('bor', rules).symbols;
    const boyLike = ipaPhonemesToFonora('boy', rules).symbols;
    assert(decodeToPhonemeKeys(barLike, rules).phonemeKeys === 'b o r');
    assert(decodeToPhonemeKeys(boyLike, rules).phonemeKeys === 'b oy');
  });

  t('schwa vowel encodes as ⚬⊃', () => assert(enc('a', rules).symbols === vowelSym(rules, 'a')));
  t('FLEECE vowel encodes as ⚬∩', () => assert(enc('ee', rules).symbols === vowelSym(rules, 'ee')));
  t('pa uses lips + schwa', () => assert(enc('pa', rules).symbols === `${lips}${vowelSym(rules, 'a')}`));
  t('pee uses lips + FLEECE', () => assert(enc('pee', rules).symbols === `${lips}${vowelSym(rules, 'ee')}`));

  t('vowel length pairs produce distinct spellings', () => {
    const pairs = [
      ['pi', 'pee', `${lips}${vowelSym(rules, 'i')}`, `${lips}${vowelSym(rules, 'ee')}`],
    ];
    for (const [shortWord, longWord, shortSym, longSym] of pairs) {
      assert(enc(shortWord, rules).symbols === shortSym, `${shortWord} expected ${shortSym}`);
      assert(enc(longWord, rules).symbols === longSym, `${longWord} expected ${longSym}`);
      assert(shortSym !== longSym, `${shortWord} and ${longWord} must differ`);
    }
  });

  t('th/dh composed from primary alphabet only', () => {
    const th = rules.derivedSounds.find((d) => d.sound === 'th');
    const dh = rules.derivedSounds.find((d) => d.sound === 'dh');
    const ft = registry.places.frontTongue;
    assert(th.symbols === `${ft}${friction}`);
    assert(dh.symbols === `${ft}${voice}`);
    assert(enc('th', rules).symbols === th.symbols);
  });

  t('z derived sound uses reversed friction+voice (voiced counterpart of s)', () => {
    const z = rules.derivedSounds.find((d) => d.sound === 'z');
    const s = rules.soundGrid.find((c) => c.sound === 's');
    assert(z.composition === 'reverse_friction_voice');
    assert(z.symbols === `${friction}${voice}`);
    assert(s.symbols === `${friction}${front}`);
    assert(enc('z', rules).symbols === z.symbols);
    assert(decodeSymbols(z.symbols, rules).pronunciation === 'z');
  });

  t('z round-trip encoding and decoding', () => {
    const zSym = rules.derivedSounds.find((d) => d.sound === 'z').symbols;
    for (const [phonemes, expectedKeys] of [['z', 'z'], ['z u', 'z u'], ['b a z', 'b a z']]) {
      const encoded = ipaPhonemesToFonora(phonemes, rules);
      assert(encoded.symbols.includes(zSym), `${phonemes} should contain z symbols`);
      const decoded = decodeToPhonemeKeys(encoded.symbols, rules);
      assert(decoded.phonemeKeys === expectedKeys, `${phonemes} round-trip expected "${expectedKeys}", got "${decoded.phonemeKeys}"`);
    }
  });

  t('z words from IPA contain z phoneme', () => {
    const zSym = rules.derivedSounds.find((d) => d.sound === 'z').symbols;
    for (const ipa of ['zuː', 'zɪɹoʊ', 'zɪp']) {
      const result = encodeFromIpa(ipa, rulesBundle);
      assert(result.symbols.includes(zSym), `IPA ${ipa} should encode z as ${zSym}`);
      assert(result.decoded.includes('z'), `IPA ${ipa} should recover z phoneme key`);
    }
  });

  t('buzz decodes correctly from IPA', () => {
    const zSym = rules.derivedSounds.find((d) => d.sound === 'z').symbols;
    const result = encodeFromIpa('bʌz', rulesBundle);
    assert(result.symbols.includes(zSym));
    assert(result.decoded === 'b a z');
    assert(decodeToPhonemeKeys(result.symbols, rules).phonemeKeys === 'b a z');
  });

  t('music encoding remains unaffected by z derived sound', () => {
    const zSym = rules.derivedSounds.find((d) => d.sound === 'z').symbols;
    const sSym = rules.soundGrid.find((c) => c.sound === 's').symbols;
    const result = encodeFromIpa('mjuzɪk', rulesBundle);
    assert(result.symbols.includes(zSym), 'music should still encode medial /z/');
    assert(!result.symbols.includes(sSym), 'music should not gain spurious /s/ symbols');
    const roundTrip = decodeToPhonemeKeys(result.symbols, rules);
    assert(roundTrip.phonemeKeys.includes('z'));
    assert(roundTrip.warnings.length === 0);
  });

  t('z derived sound has no symbol collisions with s, v, th, or dh', () => {
    const zSym = rules.derivedSounds.find((d) => d.sound === 'z').symbols;
    const sSym = rules.soundGrid.find((c) => c.sound === 's').symbols;
    const vSym = rules.derivedSounds.find((c) => c.sound === 'v').symbols;
    const thSym = rules.derivedSounds.find((d) => d.sound === 'th').symbols;
    const dhSym = rules.derivedSounds.find((d) => d.sound === 'dh').symbols;
    const symbols = [sSym, vSym, thSym, dhSym, zSym];
    assert(new Set(symbols).size === symbols.length, `collision among derived/grid fricatives: ${symbols.join(', ')}`);
    assert(enc('s', rules).symbols === sSym);
    assert(enc('v', rules).symbols === vSym);
    assert(enc('th', rules).symbols === thSym);
    assert(enc('dh', rules).symbols === dhSym);
    assert(enc('z', rules).symbols === zSym);
  });

  t('derived th recomposes when primaries change', () => {
    const trial = structuredClone(rules);
    trial.modifiers.find((m) => m.id === 'friction').symbol = 'ƒ';
    applyPrimarySymbols(trial);
    const th = trial.derivedSounds.find((d) => d.sound === 'th');
    assert(th.symbols.endsWith('ƒ'));
    assert(!th.symbols.includes(friction));
  });

  t('vowel phoneme keys come from markdown definitions', () => {
    const keys = getVowelPhonemeKeys(rules);
    assert(keys.includes('ee'));
    assert(keys.includes('ae'));
    assert(keys.includes('oh'));
    assert(keys.includes('eye'));
    assert(!keys.includes('oo'));
    assert(keys.length === 12);
  });

  t('quiz uses markdown-derived encodable entries', () => {
    const encodable = getEncodableEntries(rules).filter((c) => c.sound && c.sound !== '?');
    const quiz = getQuizEntries(rules);
    assert(quiz.length === encodable.length);
  });

  t('decode composed pa', () => assert(decodeSymbols(`${lips}${vowelSym(rules, 'a')}`, rules).pronunciation === 'pa'));
  t('normalize collapses errant spaces within one phoneme symbol', () => {
    assert(decodeSymbols(`${voice} ${lips}`, rules).pronunciation === 'b');
  });

  t('ipaPhonemesToFonora outputs contiguous symbols without phoneme spaces', () => {
    const result = ipaPhonemesToFonora('bor', rules);
    assert(!result.symbols.includes(' '), 'symbols must not contain phoneme boundary spaces');
    assert(decodeToPhonemeKeys(result.symbols, rules).phonemeKeys === 'b o r');
  });

  t('decode accepts optional manual spaces between phoneme groups', () => {
    const contiguous = ipaPhonemesToFonora('bor', rules).symbols;
    const bSym = enc('b', rules).symbols;
    const oSym = vowelSym(rules, 'o');
    const rSym = enc('r', rules).symbols;
    const spaced = `${bSym} ${oSym} ${rSym}`;
    assert(normalizeSymbolInput(spaced, rules) === spaced);
    assert(decodeToPhonemeKeys(normalizeSymbolInput(spaced, rules), rules).phonemeKeys === 'b o r');
    assert(contiguous.replace(/\s+/g, '') === spaced.replace(/\s+/g, ''));
  });

  t('v3: o+r and oy produce distinct unspaced symbol strings', () => {
    const barLike = ipaPhonemesToFonora('bor', rules);
    const boyLike = ipaPhonemesToFonora('boy', rules);
    assert(barLike.decoded === 'b o r');
    assert(boyLike.decoded === 'b oy');
    assert(barLike.symbols.replace(/\s+/g, '') !== boyLike.symbols.replace(/\s+/g, ''));
    assert(decodeToPhonemeKeys(barLike.symbols.replace(/\s+/g, ''), rules).phonemeKeys === 'b o r');
  });

  t('collision audit: th+t and t+s share symbols (sequence collision)', () => {
    const sym = enc('tht', rules).symbols;
    const hits = findConcatenationCollisions(rules).filter((h) => h.symbols === sym);
    assert(hits.some((h) => h.sequenceA === 'th + t' && h.sequenceB === 't + s'));
  });

  t('IPA normalization maps TRAP vowel to ae phoneme', () => {
    const n = normalizeIpa('kæt', { vowelMap: rulesBundle.ipaVowelMap });
    assert(n.phonemeString.includes('ae'));
    assert(!n.phonemeString.includes('ee'));
  });

  t('English IPA engineering table maps NURSE and weak vowels', () => {
    const map = { vowelMap: rulesBundle.ipaVowelMap };
    assert(normalizeIpa('bˈɜːd', map).phonemeString === 'bad');
    assert(normalizeIpa('tʃˈɜːtʃ', map).phonemeString === 'chach');
    assert(normalizeIpa('ɹˈoʊzᵻz', map).phonemeString === 'rohziz');
    assert(normalizeIpa('fˈɑːðɚ', map).phonemeString === 'fodha');
    assert(normalizeIpa('ɛkspˈiəɹɪəns', map).phonemeString === 'ekspirins');
    for (const result of [
      normalizeIpa('bˈɜːd', map),
      normalizeIpa('ɹˈoʊzᵻz', map),
      normalizeIpa('ɛkspˈiəɹɪəns', map),
    ]) {
      assert(!result.phonemeString.includes('?'), `unexpected ? in ${result.phonemeString}`);
      assert(result.unmapped.length === 0, `unexpected unmapped: ${result.unmapped.join(', ')}`);
    }
  });

  t('unknown IPA vowel falls back to safe category without ? phoneme', () => {
    const result = normalizeIpa('kœt', { vowelMap: rulesBundle.ipaVowelMap });
    assert(result.phonemeString === 'kat');
    assert(!result.phonemeString.includes('?'));
    assert(result.unmapped.includes('œ'));
    assert(result.warnings.some((w) => w.includes('fallback vowel "a"')));
    const encoded = ipaPhonemesToFonora(result.phonemeString, rules);
    assert(!encoded.symbols.includes('?'));
    assert(encoded.decoded.includes('a'));
  });

  t('encodeFromIpa round-trip survives English NURSE vowels', () => {
    for (const ipa of ['bˈɜːd', 'tʃˈɜːtʃ', 'nˈɜːs']) {
      const result = encodeFromIpa(ipa, rulesBundle);
      assert(!result.symbols.includes('?'), `${ipa} produced ? symbols`);
      assert(result.decoded, `${ipa} missing decoded keys`);
      assert(decodeToPhonemeKeys(result.symbols, rules).warnings.length === 0);
    }
  });

  t('IPA length marks map to vowel phonemes', () => {
    assert(normalizeIpa('iː', { vowelMap: rulesBundle.ipaVowelMap }).phonemeString === 'ee');
    assert(normalizeIpa('uː', { vowelMap: rulesBundle.ipaVowelMap }).phonemeString === 'u');
    assert(normalizeIpa('eː', { vowelMap: rulesBundle.ipaVowelMap }).phonemeString === 'e');
  });

  t('English flapped ɾ normalizes to t (not glide r)', () => {
    const map = { vowelMap: rulesBundle.ipaVowelMap };
    assert(normalizeIpa('dˈɪɡnᵻɾi', map).display === 'd i g n i t i');
    assert(normalizeIpa('sˈɪɾi', map).display === 's i t i');
    assert(normalizeIpa('pɹˈɪɾi', map).display === 'p r i t i');
    assert(normalizeIpa('wˈɔːɾɚ', map).display === 'w o t a');
  });

  t('Spanish perro final o uses rules oh vowel (not English LOT o)', () => {
    const map = { vowelMap: rulesBundle.ipaVowelMap, lang: 'es' };
    assert(normalizeIpa('pˈero', map).phonemeString === 'peroh');
    assert(normalizeIpa('pˈero', map).display === 'p e r oh');
    assert(normalizeIpa('pˈero', { vowelMap: rulesBundle.ipaVowelMap, lang: 'en' }).phonemeString === 'pero');
  });

  t('English flapped ɾ encodes as plain t symbol (not glide r)', () => {
    const tSym = enc('t', rules).symbols;
    const rSym = enc('r', rules).symbols;
    assert(tSym === front);

    const dignity = encodeFromIpa('dˈɪɡnᵻɾi', rulesBundle);
    assert(dignity.decoded === 'd i g n i t i');
    assert(dignity.symbols === `${enc('d', rules).symbols}${vowelSym(rules, 'i')}${enc('g', rules).symbols}${enc('n', rules).symbols}${vowelSym(rules, 'i')}${tSym}${vowelSym(rules, 'i')}`);
    assert(!dignity.symbols.includes(rSym));

    const city = encodeFromIpa('sˈɪɾi', rulesBundle);
    assert(city.decoded === 's i t i');
    assert(city.symbols === `${enc('s', rules).symbols}${vowelSym(rules, 'i')}${tSym}${vowelSym(rules, 'i')}`);
    assert(!city.symbols.includes(rSym));

    const pretty = encodeFromIpa('pɹˈɪɾi', rulesBundle);
    assert(pretty.decoded === 'p r i t i');
    assert(pretty.symbols.includes(tSym));
    assert(pretty.symbols === `${enc('p', rules).symbols}${rSym}${vowelSym(rules, 'i')}${tSym}${vowelSym(rules, 'i')}`);

    const water = encodeFromIpa('wˈɔːɾɚ', rulesBundle);
    assert(water.decoded === 'w o t a');
    assert(water.symbols.includes(tSym));
    assert(!water.symbols.includes(rSym));
  });

  t('vowel architecture word set uses v3 symbols only', () => {
    const ipaFixtures = {
      cat: 'kæt',
      bed: 'bɛd',
      sit: 'sɪt',
      see: 'siː',
      cup: 'kʌp',
      father: 'fɑːðɚ',
      go: 'ɡoʊ',
      book: 'bʊk',
      boot: 'buːt',
      pie: 'paɪ',
      now: 'naʊ',
      boy: 'bɔɪ',
      say: 'seɪ',
    };
    for (const word of VOWEL_ARCHITECTURE_WORDS) {
      const ipa = ipaFixtures[word];
      assert(ipa, `missing IPA fixture for ${word}`);
      const encoded = encodeFromIpa(ipa, rulesBundle);
      assert(!containsDoubleVowelMarker(encoded.symbols), `${word} must not contain ⚬⚬`);
      for (const sym of Object.values(registry.vowels)) {
        if (!encoded.symbols.includes(sym)) continue;
        const result = validateVowelSymbolString(sym);
        assert(result.ok, `${word} vowel ${sym}: ${result.reason}`);
      }
    }
  });

  t('cat/cot/cut distinguish via markdown IPA map', () => {
    const cat = encodeFromIpa('kæt', rulesBundle);
    const cot = encodeFromIpa('kɑt', rulesBundle);
    const cut = encodeFromIpa('kʌt', rulesBundle);
    assert(new Set([cat.symbols, cot.symbols, cut.symbols]).size === 3);
  });

  t('composite diphthongs encode as single vowel symbols', () => {
    const pie = encodeFromIpa('paɪ', rulesBundle);
    assert(pie.symbols.includes(vowelSym(rules, 'eye')));
    const say = encodeFromIpa('seɪ', rulesBundle);
    assert(say.symbols.includes(vowelSym(rules, 'ay')));
  });

  t('collision groups defined', () => assert(V2_COLLISION_GROUPS.length === 5));

  t('pronunciation validation: groupsToIpa joins cell IPA', () => {
    const ipa = groupsToIpa([
      { sound: 'b', ipa: '/b/' },
      { sound: 'oy', ipa: '/ɔɪ/' },
    ]);
    assert(ipa === 'bɔɪ');
    assert(normalizeIpaForComparison('bˈɔɪ') === 'bɔɪ');
    assert(normalizeIpaForComparison('bɔɪ') === normalizeIpaForComparison('bˈɔɪ'));
  });

  t('pronunciation validation: symbols round-trip IPA for boy', () => {
    const encoded = ipaPhonemesToFonora('boy', rules);
    const recovery = symbolsToRecoveredIpa(encoded.symbols, rules);
    const normalized = normalizeIpa('bɔɪ', { vowelMap: rulesBundle.ipaVowelMap });
    const recoveredIpa = recovery.phonemeKeys === normalized.display
      ? normalized.ipaFromSegments
      : phonemeKeysToRecoveredIpa(recovery.phonemeKeys, rules, 'bɔɪ');
    assert(normalizeIpaForComparison(recoveredIpa) === normalizeIpaForComparison('bɔɪ'));
  });

  t('pronunciation validation: detectCollisionWarnings for vowel+glide sequences', () => {
    const oPlusR = detectCollisionWarnings('b o r', rules);
    assert(!oPlusR.some((w) => w.label.includes('o + r')), 'v3 o+r must not collide with oy');
    const oPlusY = detectCollisionWarnings('b o y', rules);
    assert(oPlusY.some((w) => w.label.includes('o + y')));
  });

  t('pronunciation validation: summarizeValidationResults', () => {
    const summary = summarizeValidationResults([
      { ipaMatch: true, phonemeKeysMatch: true, collisionWarnings: [] },
      { ipaMatch: false, phonemeKeysMatch: false, collisionWarnings: [{}] },
    ]);
    assert(summary.wordsTested === 2);
    assert(summary.exactIpaMatches === 1);
    assert(summary.mismatches === 1);
    assert(summary.collisionWarnings === 1);
    assert(summary.recoverySuccessRate === 50);
  });

  t('doc viewer allows docs paths only', () => {
    assert(normalizeDocPath('docs/language-rules.md') === 'docs/language-rules.md');
    assert(normalizeDocPath('CONTRIBUTING.md') === 'CONTRIBUTING.md');
    let threw = false;
    try {
      normalizeDocPath('../secrets.md');
    } catch {
      threw = true;
    }
    assert(threw);
  });

  t('doc viewer builds GitHub and in-app URLs', () => {
    assert(githubDocUrl('docs/foo.md').includes('github.com/jamesc137/fonora/blob/main/docs/foo.md'));
    assert(docViewerHref('docs/foo.md') === '/?path=docs%2Ffoo.md');
    assert(docViewerHref('docs/foo.md#section') === '/?path=docs%2Ffoo.md#section');
    assert(docViewerHref('docs/platform-overview.md') === '/#docs');
    assert(parseDocFromLocation({ pathname: '/', hash: '#docs', search: '' })?.path === 'docs/platform-overview.md');
    assert(parseDocFromLocation({ pathname: '/', hash: '', search: '?path=docs%2Flanguage-rules.md' })?.path === 'docs/language-rules.md');
    assert(parseDocFromLocation({ pathname: '/docs', hash: '', search: '' })?.path === 'docs/platform-overview.md');
  });

  t('navigable doc catalog excludes runtime research routes', async () => {
    const { getNavigableDocCatalog, setResearchDocEntries } = await import('./doc-urls.js');
    setResearchDocEntries([
      { path: 'research/example', label: 'RN-01 · Example', layer: 'research' },
    ]);
    const paths = getNavigableDocCatalog().map((entry) => entry.path);
    assert(!paths.includes('research/example'));
    assert(paths.includes('docs/fonoran-constitution.md'));
    setResearchDocEntries([]);
  });

  t('markdown renderer handles headings and tables', () => {
    const html = renderMarkdown('# Title\n\n| a | b |\n| --- | --- |\n| 1 | 2 |', {
      docPath: 'docs/README.md',
    });
    assert(html.includes('<h1 id="title" class="doc-heading doc-heading--h1">Title</h1>'));
    assert(html.includes('<table'));
    assert(html.includes('<td>1</td>'));
  });

  t('markdown renderer supports heading anchors and horizontal rules', () => {
    const html = renderMarkdown('## Section\n\n---\n\nBody', {
      docPath: 'docs/README.md',
      headingAnchors: true,
    });
    assert(html.includes('class="doc-heading__anchor" href="#section"'));
    assert(html.includes('<hr class="doc-hr">'));
  });

  t('markdown renderer can skip the first h1 title', () => {
    const html = renderMarkdown('# Title\n\nBody text', {
      docPath: 'docs/README.md',
      skipTitle: true,
    });
    assert(!html.includes('<h1'));
    assert(html.includes('<p>Body text</p>'));
  });

  t('markdown renderer handles bold and italic', () => {
    const html = renderMarkdown('**bold** and *italic*', { docPath: 'docs/README.md' });
    assert(html.includes('<strong>bold</strong>'));
    assert(html.includes('<em>italic</em>'));
    assert(!html.includes('*italic*'));
  });

  t('markdown renderer emits mermaid containers', () => {
    const html = renderMarkdown('```mermaid\nflowchart TD\n  A --> B\n```', { docPath: 'docs/README.md' });
    assert(html.includes('class="mermaid-pan-zoom'));
    assert(html.includes('class="mermaid"'));
    assert(html.includes('flowchart TD'));
    assert(!html.includes('language-mermaid'));
  });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  return { passed, total: results.length, failed, results, bundle: rulesBundle };
}
