import { getEncodableEntries, getQuizEntries } from './rules.js';
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

/**
 * Browser-safe test runner. Requires a loaded rules bundle (from markdown fetch).
 * @param {{ bundle: object, v1Bundle?: object }} options
 */
export function runTests(options) {
  if (!options?.bundle?.rules) {
    throw new Error('runTests requires options.bundle from loaded language rules');
  }

  const v2Bundle = options.bundle;
  const v1Bundle = options.v1Bundle ?? null;
  const rules = v2Bundle.rules;
  const registry = v2Bundle.registry;
  const lips = registry.places.lips;
  const voice = registry.modifiers.voice;
  const friction = registry.modifiers.friction;
  const throat = registry.places.throat;
  const longMarker = registry.derivedWriting.vowel_carrier;
  const front = registry.places.frontTongue;
  const middle = registry.places.middleTongue;
  const back = registry.places.backTongue;

  registerIpaVowelMap(v2Bundle.ipaVowelMode, v2Bundle.ipaVowelMap);
  setActiveIpaVowelMap(v2Bundle.ipaVowelMap);

  const results = [];
  const t = (name, fn) => results.push(test(name, fn));

  t('registry loaded from markdown', () => {
    assert(lips === '⊟');
    assert(lips !== ASCII_EQUALS);
    assert(registry.places.frontTongue === '∩');
    assert(throat === '⊃');
    assert(longMarker === '⊇');
    assert(Object.keys(registry.vowels).length >= 10);
    assert(rules.places.length === 5);
  });

  t('sound grid composed from primaries (5 places only)', () => {
    const pCell = rules.soundGrid.find((c) => c.modifierId === 'plain' && c.placeId === 'lips');
    assert(pCell.symbols === lips);
    const bCell = rules.soundGrid.find((c) => c.sound === 'b');
    assert(bCell.symbols === `${voice}${lips}`);
    assert(rules.places.every((p) => ['lips', 'front_tongue', 'middle_tongue', 'back_tongue', 'throat'].includes(p.id)));
  });

  t('vowels composed from short/long plane + component', () => {
    assert(registry.vowels.a === throat);
    assert(registry.vowels.ā === longMarker);
    assert(registry.vowels.e === `${throat}${front}`);
    assert(registry.vowels.ē === `${longMarker}${front}`);
    assert(registry.vowels.u === `${throat}${lips}`);
    assert(registry.vowels.ū === `${longMarker}${lips}`);
  });

  t('primary symbol swap recomposes derived forms', () => {
    const trial = structuredClone(rules);
    trial.places.find((p) => p.id === 'lips').symbol = '◆';
    applyPrimarySymbols(trial);
    assert(trial.soundGrid.find((c) => c.sound === 'p').symbols === '◆');
    assert(trial.experimentalVowels.find((v) => v.vowel === 'u').symbols === `${throat}◆`);
  });

  t('no ASCII = in inventory', () => {
    assert(!registry.allSymbols.includes(ASCII_EQUALS));
  });

  t('lips consonants use composed symbols', () => {
    assert(enc('p', rules).symbols === lips);
    assert(enc('b', rules).symbols === `${voice}${lips}`);
  });

  t('short open vowel uses throat symbol', () => assert(enc('a', rules).symbols === throat));
  t('long open vowel uses long marker alone', () => assert(enc('ā', rules).symbols === longMarker));
  t('rounded vowel uses throat + lips', () => assert(enc('u', rules).symbols === registry.vowels.u));
  t('pa uses composed lips + short open', () => assert(enc('pa', rules).symbols === `${lips}${throat}`));
  t('pā uses composed lips + long open', () => assert(enc('pā', rules).symbols === `${lips}${longMarker}`));

  t('short and long CV pairs produce distinct spellings', () => {
    const pairs = [
      ['pa', 'pā', `${lips}${throat}`, `${lips}${longMarker}`],
      ['pe', 'pē', `${lips}${throat}${front}`, `${lips}${longMarker}${front}`],
      ['pi', 'pī', `${lips}${throat}${middle}`, `${lips}${longMarker}${middle}`],
      ['po', 'pō', `${lips}${throat}${back}`, `${lips}${longMarker}${back}`],
      ['pu', 'pū', `${lips}${throat}${lips}`, `${lips}${longMarker}${lips}`],
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
    for (const word of ['z', 'zū', 'buzz', 'zīp']) {
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
    const vSym = rules.experimentalDerivedSounds.find((c) => c.sound === 'v').symbols;
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

  t('quiz uses markdown-derived encodable entries', () => {
    const encodable = getEncodableEntries(rules).filter((c) => c.sound && c.sound !== '?');
    const quizSounds = new Set(getQuizEntries(rules).map((c) => c.sound));
    assert(quizSounds.size === encodable.length);
  });

  t('decode composed pa', () => assert(decodeSymbols(`${lips}${throat}`, rules).pronunciation === 'pa'));
  t('normalize collapses symbol spaces', () => assert(decodeSymbols(`${voice} ${lips}`, rules).pronunciation === 'b'));

  t('IPA normalization maps TRAP vowel to front phoneme', () => {
    const n = normalizeIpa('kæt', { vowelMap: v2Bundle.ipaVowelMap });
    assert(n.phonemeString.includes('e'));
    assert(!n.phonemeString.includes('ā'));
  });

  t('IPA length marks map to long vowel phonemes', () => {
    assert(normalizeIpa('iː', { vowelMap: v2Bundle.ipaVowelMap }).phonemeString === 'ī');
    assert(normalizeIpa('uː', { vowelMap: v2Bundle.ipaVowelMap }).phonemeString === 'ū');
    assert(normalizeIpa('eː', { vowelMap: v2Bundle.ipaVowelMap }).phonemeString === 'ē');
  });

  t('cat/cot/cut distinguish via markdown IPA map', () => {
    const cat = encodeFromIpa('kæt', v2Bundle);
    const cot = encodeFromIpa('kɑt', v2Bundle);
    const cut = encodeFromIpa('kʌt', v2Bundle);
    assert(new Set([cat.symbols, cot.symbols, cut.symbols]).size === 3);
  });

  if (v1Bundle) {
    t('V1 fixture loads from markdown', () => {
      assert(v1Bundle.registry.places.lips === '○');
      assert(v1Bundle.rules.experimentalVowels.length === 5);
    });
  }

  t('collision groups defined', () => assert(V2_COLLISION_GROUPS.length === 5));

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  return { passed, total: results.length, failed, results, bundle: v2Bundle };
}
