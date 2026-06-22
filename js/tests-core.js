import { getEncodableEntries, getQuizEntries, getVowelPhonemeKeys, vowelSymbolForKey } from './rules.js';
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
    assert(registry.vowels.eye === `${vowelMarker}${throat}${glide}${front}`);
    assert(registry.vowels.ow === `${vowelMarker}${throat}${glide}${lips}`);
    assert(registry.vowels.oy === `${vowelMarker}${back}${glide}${front}`);
    assert(registry.vowels.ay === `${vowelMarker}${voice}${glide}${front}`);
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
    const quizSounds = new Set(getQuizEntries(rules).map((c) => c.sound));
    assert(quizSounds.size === encodable.length);
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

  t('IPA length marks map to vowel phonemes', () => {
    assert(normalizeIpa('iː', { vowelMap: rulesBundle.ipaVowelMap }).phonemeString === 'ee');
    assert(normalizeIpa('uː', { vowelMap: rulesBundle.ipaVowelMap }).phonemeString === 'u');
    assert(normalizeIpa('eː', { vowelMap: rulesBundle.ipaVowelMap }).phonemeString === 'e');
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

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  return { passed, total: results.length, failed, results, bundle: rulesBundle };
}
