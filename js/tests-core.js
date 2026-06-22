import { getEncodableEntries, getQuizEntries, getVowelPhonemeKeys, vowelSymbolForKey } from './rules.js';
import { encodeSounds } from './encode.js';
import { decodeSymbols, decodeText } from './decode.js';
import { normalizeIpa, registerIpaVowelMap, setActiveIpaVowelMap } from './ipa-normalize.js';
import { applyPrimarySymbols } from './symbol-compose.js';
import { encodeFromIpa } from './ipa-encode-helper.js';
import { V2_COLLISION_GROUPS } from './vowel-v2-collision-groups.js';
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

  const v2Bundle = options.bundle;
  const rules = v2Bundle.rules;
  const registry = v2Bundle.registry;
  const lips = registry.places.lips;
  const voice = registry.modifiers.voice;
  const friction = registry.modifiers.friction;
  const throat = registry.places.throat;
  const vowelMarker = registry.modifiers.vowel;
  const front = registry.places.frontTongue;
  const middle = registry.places.middleTongue;
  const back = registry.places.backTongue;

  registerIpaVowelMap(v2Bundle.ipaVowelMode, v2Bundle.ipaVowelMap);
  setActiveIpaVowelMap(v2Bundle.ipaVowelMap);

  const results = [];
  const t = (name, fn) => results.push(test(name, fn));

  t('registry loaded from markdown', () => {
    assert(lips === '∋');
    assert(lips !== ASCII_EQUALS);
    assert(registry.places.frontTongue === '∩');
    assert(throat === '⊃');
    assert(vowelMarker === '⚬');
    assert(Object.keys(registry.vowels).length >= 13);
    assert(rules.places.length === 5);
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
    assert(registry.vowels.e === `${vowelMarker}${vowelMarker}${front}`);
    assert(registry.vowels.ae === `${vowelMarker}${vowelMarker}${middle}`);
    assert(registry.vowels.a === `${vowelMarker}${throat}`);
    assert(registry.vowels.o === `${vowelMarker}${vowelMarker}${back}`);
    assert(registry.vowels.oh === `${vowelMarker}${back}`);
    assert(registry.vowels.u === `${vowelMarker}${lips}`);
    assert(registry.vowels.oo === `${vowelMarker}${vowelMarker}${lips}`);
  });

  t('composite vowels composed from recipes', () => {
    const glide = registry.modifiers.glide;
    assert(registry.vowels.eye === `${vowelMarker}${vowelMarker}${back}${glide}${front}`);
    assert(registry.vowels.ow === `${vowelMarker}${vowelMarker}${back}${glide}${lips}`);
    assert(registry.vowels.oy === `${vowelMarker}${vowelMarker}${back}${glide}${middle}`);
    assert(registry.vowels.ay === `${vowelMarker}${vowelMarker}${front}${glide}${front}`);
    assert(registry.vowels.eye !== registry.vowels.oy);
  });

  t('primary symbol swap recomposes vowel recipes', () => {
    const trial = structuredClone(rules);
    trial.places.find((p) => p.id === 'lips').symbol = '◆';
    applyPrimarySymbols(trial);
    assert(trial.vowels.find((v) => v.key === 'u').symbols === `${vowelMarker}◆`);
    assert(trial.vowels.find((v) => v.key === 'oo').symbols === `${vowelMarker}${vowelMarker}◆`);
  });

  t('no ASCII = in inventory', () => {
    assert(!registry.allSymbols.includes(ASCII_EQUALS));
  });

  t('lips consonants use composed symbols', () => {
    assert(enc('p', rules).symbols === lips);
    assert(enc('b', rules).symbols === `${voice}${lips}`);
  });

  t('schwa vowel encodes as ⚬⊃', () => assert(enc('a', rules).symbols === vowelSym(rules, 'a')));
  t('FLEECE vowel encodes as ⚬∩', () => assert(enc('ee', rules).symbols === vowelSym(rules, 'ee')));
  t('pa uses lips + schwa', () => assert(enc('pa', rules).symbols === `${lips}${vowelSym(rules, 'a')}`));
  t('pee uses lips + FLEECE', () => assert(enc('pee', rules).symbols === `${lips}${vowelSym(rules, 'ee')}`));

  t('vowel length pairs produce distinct spellings', () => {
    const pairs = [
      ['pi', 'pee', `${lips}${vowelSym(rules, 'i')}`, `${lips}${vowelSym(rules, 'ee')}`],
      ['pu', 'poo', `${lips}${vowelSym(rules, 'u')}`, `${lips}${vowelSym(rules, 'oo')}`],
    ];
    for (const [shortWord, longWord, shortSym, longSym] of pairs) {
      assert(enc(shortWord, rules).symbols === shortSym, `${shortWord} expected ${shortSym}`);
      assert(enc(longWord, rules).symbols === longSym, `${longWord} expected ${longSym}`);
      assert(shortSym !== longSym, `${shortWord} and ${longWord} must differ`);
    }
  });

  t('th/dh composed from primary alphabet only', () => {
    const th = rules.specialDerivedSounds.find((d) => d.sound === 'th');
    const dh = rules.specialDerivedSounds.find((d) => d.sound === 'dh');
    const ft = registry.places.frontTongue;
    assert(th.symbols === `${ft}${friction}`);
    assert(dh.symbols === `${ft}${voice}`);
    assert(enc('th', rules).symbols === th.symbols);
  });

  t('z derived sound uses reversed friction+voice (voiced counterpart of s)', () => {
    const z = rules.specialDerivedSounds.find((d) => d.sound === 'z');
    const s = rules.soundGrid.find((c) => c.sound === 's');
    assert(z.composition === 'reverse_friction_voice');
    assert(z.symbols === `${friction}${voice}`);
    assert(s.symbols === `${friction}${front}`);
    assert(enc('z', rules).symbols === z.symbols);
    assert(decodeSymbols(z.symbols, rules).pronunciation === 'z');
  });

  t('z round-trip encoding and decoding', () => {
    const zSym = rules.specialDerivedSounds.find((d) => d.sound === 'z').symbols;
    for (const word of ['z', 'zoo', 'buzz']) {
      const encoded = enc(word, rules);
      assert(encoded.symbols.includes(zSym), `${word} should contain z symbols`);
      const decoded = decodeSymbols(encoded.symbols, rules);
      assert(decoded.pronunciation === word, `${word} round-trip expected ${word}, got ${decoded.pronunciation}`);
    }
  });

  t('z words from IPA contain z phoneme', () => {
    const zSym = rules.specialDerivedSounds.find((d) => d.sound === 'z').symbols;
    for (const ipa of ['zuː', 'zɪɹoʊ', 'zɪp']) {
      const result = encodeFromIpa(ipa, v2Bundle);
      assert(result.symbols.includes(zSym), `IPA ${ipa} should encode z as ${zSym}`);
      assert(result.decoded.includes('z'), `IPA ${ipa} should decode with z phoneme`);
    }
  });

  t('buzz decodes correctly from IPA', () => {
    const zSym = rules.specialDerivedSounds.find((d) => d.sound === 'z').symbols;
    const result = encodeFromIpa('bʌz', v2Bundle);
    assert(result.symbols.includes(zSym));
    assert(result.decoded === 'baz');
    const decoded = decodeSymbols(result.symbols, rules);
    assert(decoded.pronunciation === 'baz');
  });

  t('music encoding remains unaffected by z derived sound', () => {
    const zSym = rules.specialDerivedSounds.find((d) => d.sound === 'z').symbols;
    const sSym = rules.soundGrid.find((c) => c.sound === 's').symbols;
    const result = encodeFromIpa('mjuzɪk', v2Bundle);
    assert(result.symbols.includes(zSym), 'music should still encode medial /z/');
    assert(!result.symbols.includes(sSym), 'music should not gain spurious /s/ symbols');
    const roundTrip = decodeSymbols(result.symbols, rules);
    assert(roundTrip.pronunciation.includes('z'));
    assert(roundTrip.warnings.length === 0);
  });

  t('z derived sound has no symbol collisions with s, v, th, or dh', () => {
    const zSym = rules.specialDerivedSounds.find((d) => d.sound === 'z').symbols;
    const sSym = rules.soundGrid.find((c) => c.sound === 's').symbols;
    const vSym = rules.specialDerivedSounds.find((c) => c.sound === 'v').symbols;
    const thSym = rules.specialDerivedSounds.find((d) => d.sound === 'th').symbols;
    const dhSym = rules.specialDerivedSounds.find((d) => d.sound === 'dh').symbols;
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
    const th = trial.specialDerivedSounds.find((d) => d.sound === 'th');
    assert(th.symbols.endsWith('ƒ'));
    assert(!th.symbols.includes(friction));
  });

  t('vowel phoneme keys come from markdown definitions', () => {
    const keys = getVowelPhonemeKeys(rules);
    assert(keys.includes('ee'));
    assert(keys.includes('ae'));
    assert(keys.includes('oh'));
    assert(keys.includes('eye'));
    assert(keys.length === 13);
  });

  t('quiz uses markdown-derived encodable entries', () => {
    const encodable = getEncodableEntries(rules).filter((c) => c.sound && c.sound !== '?');
    const quizSounds = new Set(getQuizEntries(rules).map((c) => c.sound));
    assert(quizSounds.size === encodable.length);
  });

  t('decode composed pa', () => assert(decodeSymbols(`${lips}${vowelSym(rules, 'a')}`, rules).pronunciation === 'pa'));
  t('normalize collapses symbol spaces', () => assert(decodeSymbols(`${voice} ${lips}`, rules).pronunciation === 'b'));

  t('IPA normalization maps TRAP vowel to ae phoneme', () => {
    const n = normalizeIpa('kæt', { vowelMap: v2Bundle.ipaVowelMap });
    assert(n.phonemeString.includes('ae'));
    assert(!n.phonemeString.includes('ee'));
  });

  t('IPA length marks map to long vowel phonemes', () => {
    assert(normalizeIpa('iː', { vowelMap: v2Bundle.ipaVowelMap }).phonemeString === 'ee');
    assert(normalizeIpa('uː', { vowelMap: v2Bundle.ipaVowelMap }).phonemeString === 'oo');
    assert(normalizeIpa('eː', { vowelMap: v2Bundle.ipaVowelMap }).phonemeString === 'e');
  });

  t('cat/cot/cut distinguish via markdown IPA map', () => {
    const cat = encodeFromIpa('kæt', v2Bundle);
    const cot = encodeFromIpa('kɑt', v2Bundle);
    const cut = encodeFromIpa('kʌt', v2Bundle);
    assert(new Set([cat.symbols, cot.symbols, cut.symbols]).size === 3);
  });

  t('composite diphthongs encode as single vowel symbols', () => {
    const pie = encodeFromIpa('paɪ', v2Bundle);
    assert(pie.symbols.includes(vowelSym(rules, 'eye')));
    const say = encodeFromIpa('seɪ', v2Bundle);
    assert(say.symbols.includes(vowelSym(rules, 'ay')));
  });

  t('collision groups defined', () => assert(V2_COLLISION_GROUPS.length === 5));

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  return { passed, total: results.length, failed, results, bundle: v2Bundle };
}
