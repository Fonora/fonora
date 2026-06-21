import { FALLBACK_RULES, parseLanguageRulesMarkdown, getQuizEntries } from './rules.js';
import { normalizeEnglishWord } from './normalize.js';
import { encodeSounds, translateEnglishWord, translateEnglishPhrase } from './encode.js';
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

function norm(word) {
  return normalizeEnglishWord(word);
}

function enc(sounds) {
  return encodeSounds(sounds, rules);
}

function tw(word) {
  return translateEnglishWord(word, rules);
}

function hasVowelSymbol(word, vowelSym) {
  assert(tw(word).symbols.includes(vowelSym), `${word} should contain ${vowelSym}, got ${tw(word).symbols}`);
}

function sameVowelSymbol(shortWord, longWord, vowelSym) {
  assert(tw(shortWord).symbols === tw(longWord).symbols, `${shortWord} vs ${longWord}`);
  assert(
    norm(longWord).actions.some((x) => x.includes('long vowel collapsed')),
    `${longWord} should note long vowel collapse`,
  );
  if (vowelSym) {
    hasVowelSymbol(shortWord, vowelSym);
    hasVowelSymbol(longWord, vowelSym);
  }
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
    assert(tw('pay').symbols === '○⊐⊐');
  });

  // CV examples
  t('pa', () => assert(tw('pa').symbols === '○⊐⊐'));
  t('pe', () => assert(tw('pe').symbols === '○⊐∩'));
  t('pi', () => assert(tw('pi').symbols === '○⊐⌒'));
  t('po', () => assert(tw('po').symbols === '○⊐∪'));
  t('pu', () => assert(tw('pu').symbols === '○⊐○'));
  t('pay same as pa', () => assert(tw('pay').symbols === '○⊐⊐'));
  t('pee same as pe', () => assert(tw('pee').symbols === '○⊐∩'));
  t('pie same as pi', () => assert(tw('pie').symbols === '○⊐⌒'));
  t('poe same as po', () => assert(tw('poe').symbols === '○⊐∪'));
  t('pew same as pu', () => assert(tw('pew').symbols === '○⊐○'));

  // Short vs long collapsed pairs
  t('pat / pate same vowel', () => sameVowelSymbol('pat', 'pate', '⊐⊐'));
  t('pet / pete same vowel', () => sameVowelSymbol('pet', 'pete', '⊐∩'));
  t('sit / site same vowel', () => sameVowelSymbol('sit', 'site', '⊐⌒'));
  t('not / note same vowel', () => sameVowelSymbol('not', 'note', '⊐∪'));
  t('cut / cute same vowel', () => sameVowelSymbol('cut', 'cute', '⊐○'));

  // Normalized phonetic uses short vowels
  t('make → mak', () => assert(norm('make').sounds === 'mak'));
  t('take → tak', () => assert(norm('take').sounds === 'tak'));
  t('lake → lak', () => assert(norm('lake').sounds === 'lak'));
  t('name → nam', () => assert(norm('name').sounds === 'nam'));
  t('save → sav', () => assert(norm('save').sounds === 'sav'));
  t('bike → bik', () => assert(norm('bike').sounds === 'bik'));
  t('time → tim', () => assert(norm('time').sounds === 'tim'));
  t('home → hom', () => assert(norm('home').sounds === 'hom'));
  t('cube → kub', () => assert(norm('cube').sounds === 'kub'));
  t('rule → rul', () => assert(norm('rule').sounds === 'rul'));
  t('meet → met', () => assert(norm('meet').sounds === 'met'));
  t('see → se', () => assert(norm('see').sounds === 'se'));
  t('boat → bot', () => assert(norm('boat').sounds === 'bot'));
  t('moon → mun', () => assert(norm('moon').sounds === 'mun'));

  // Pronunciation-first: same-sound groups
  function sameSoundOutput(...words) {
    const forms = words.map((w) => norm(w).sounds);
    const symbols = words.map((w) => tw(w).symbols);
    for (let i = 1; i < words.length; i++) {
      assert(forms[i] === forms[0], `${words[i]} sounds ${forms[i]} vs ${forms[0]}`);
      assert(symbols[i] === symbols[0], `${words[i]} symbols differ`);
    }
  }

  t('eight ate ayt → at', () => {
    assert(norm('eight').sounds === 'at');
    assert(norm('ate').sounds === 'at');
    assert(norm('ayt').sounds === 'at');
    sameSoundOutput('eight', 'ate', 'ayt');
    assert(norm('eight').pronunciationActions.some((a) => a.includes('eigh')));
  });
  t('rain rane rayn same output', () => sameSoundOutput('rain', 'rane', 'rayn'));
  t('say sei sae same output', () => sameSoundOutput('say', 'sei', 'sae'));
  t('see sea same output', () => {
    assert(norm('see').sounds === 'se');
    assert(norm('sea').sounds === 'se');
    sameSoundOutput('see', 'sea');
  });
  t('meet meat same output', () => {
    assert(norm('meet').sounds === 'met');
    assert(norm('meat').sounds === 'met');
    sameSoundOutput('meet', 'meat');
  });
  t('toe tow same output', () => {
    assert(norm('toe').sounds === 'to');
    assert(norm('tow').sounds === 'to');
    sameSoundOutput('toe', 'tow');
  });
  t('rain rane rayn reign same output', () => sameSoundOutput('rain', 'rane', 'rayn', 'reign'));
  t('night nite same output', () => sameSoundOutput('night', 'nite'));
  t('phone fone same output', () => sameSoundOutput('phone', 'fone'));
  t('right write same output', () => sameSoundOutput('right', 'write'));
  t('know no same output', () => sameSoundOutput('know', 'no'));
  t('there their same output', () => sameSoundOutput('there', 'their'));

  // ch → c and z → s
  t('chat uses c not sh', () => {
    assert(norm('chat').sounds === 'cat');
    assert(tw('chat').symbols.startsWith('⌒'));
    assert(!tw('chat').symbols.startsWith('⌕⌒'));
  });
  t('chip uses c', () => assert(norm('chip').sounds.startsWith('c')));
  t('change uses c', () => {
    assert(norm('change').sounds.startsWith('c'));
    assert(tw('change').symbols.includes('⌒'));
  });
  t('church uses c', () => assert(norm('church').sounds.startsWith('c')));
  t('ship still uses sh', () => {
    assert(norm('ship').sounds.startsWith('sh'));
    assert(tw('ship').symbols.startsWith('⌕⌒'));
  });
  t('z maps to s', () => {
    for (const w of ['zoo', 'zero', 'zip', 'lazy', 'amazing']) {
      const n = norm(w);
      assert(n.conversionActions.some((a) => a.includes('z → s')), w);
      assert(!n.sounds.includes('?'), w);
      assert(!tw(w).symbols.includes('?'), w);
    }
  });

  // Pronunciation normalization
  t('hello → helo', () => {
    assert(norm('hello').sounds === 'helo');
    assert(norm('hello').pronunciationActions.some((a) => a.includes('double l')));
  });
  t('shell → shel', () => assert(norm('shell').sounds === 'shel'));
  t('phone → fon', () => assert(norm('phone').sounds === 'fon'));
  t('laugh → laf', () => assert(norm('laugh').sounds === 'laf'));
  t('enough → enuf', () => assert(norm('enough').sounds === 'enuf'));
  t('weigh → wa', () => assert(norm('weigh').sounds === 'wa'));
  t('night → nit', () => assert(norm('night').sounds === 'nit'));
  t('light → lit', () => assert(norm('light').sounds === 'lit'));
  t('he me we keep final e', () => {
    assert(norm('he').sounds === 'he');
    assert(norm('me').sounds === 'me');
    assert(norm('we').sounds === 'we');
  });
  t('the has dh', () => assert(norm('the').sounds.includes('dh')));

  // Normalization notes
  t('line fine mine same i vowel', () => {
    for (const w of ['line', 'fine', 'mine']) hasVowelSymbol(w, '⊐⌒');
  });
  t('bone stone rope hope same o vowel', () => {
    for (const w of ['bone', 'stone', 'rope', 'hope']) hasVowelSymbol(w, '⊐∪');
  });
  t('tune use mule same u vowel', () => {
    for (const w of ['tune', 'use', 'mule']) hasVowelSymbol(w, '⊐○');
  });
  t('seed team clean same e vowel', () => {
    for (const w of ['seed', 'team', 'clean']) hasVowelSymbol(w, '⊐∩');
  });
  t('road coat slow snow same o vowel', () => {
    for (const w of ['road', 'coat', 'slow', 'snow']) hasVowelSymbol(w, '⊐∪');
  });

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

  // Normalization notes
  t('make notes collapse', () =>
    assert(norm('make').actions.some((a) => a.includes('long vowel collapsed'))),
  );
  t('quick uses kw', () => {
    const n = norm('quick');
    assert(n.sounds.startsWith('kw'));
    assert(n.actions.some((a) => a.includes('qu → kw')));
  });
  t('white uses w', () => assert(norm('white').sounds.startsWith('w')));
  t('write uses r', () => assert(norm('write').sounds.startsWith('r')));
  t('phone has f', () => assert(norm('phone').sounds.startsWith('f')));
  t('back', () => assert(norm('back').sounds === 'bak'));
  t('city soft c', () => assert(norm('city').sounds.includes('s')));
  t('cycle soft c', () => assert(norm('cycle').sounds.startsWith('s')));
  t('gentle soft g', () => assert(norm('gentle').sounds.startsWith('j')));
  t('have short a exception', () => {
    const n = norm('have');
    assert(n.sounds === 'hav');
    assert(n.actions.some((a) => a.includes('silent final e')));
  });
  t('voice has v', () => assert(norm('voice').sounds.startsWith('v')));
  t('very has v', () => assert(norm('very').sounds.startsWith('v')));
  t('move long o collapsed', () => {
    const n = norm('move');
    assert(n.sounds.includes('o'));
    assert(!n.sounds.includes('ō'));
  });
  t('seven', () => assert(norm('seven').sounds.startsWith('s')));
  t('called → kold', () => assert(norm('called').sounds === 'kold'));
  t('jumped → jumpt', () => assert(norm('jumped').sounds === 'jumpt'));

  // Readability paragraphs
  t('sentence: hello james', () => assert(translateEnglishPhrase('hello my name is james', rules).symbols.length > 0));
  t('sentence: new vowel system', () =>
    assert(translateEnglishPhrase('i am testing the new vowel system', rules).symbols.length > 0),
  );
  t('sentence: collapsed readability', () =>
    assert(translateEnglishPhrase('long vowels are collapsed for readability', rules).symbols.length > 0),
  );
  t('sentence: fonora description', () =>
    assert(
      translateEnglishPhrase('fonora is a simple writing system based on how sounds are made in the mouth', rules)
        .symbols.length > 0,
    ),
  );

  t('decode preserves word spaces', () => {
    const encPhrase = translateEnglishPhrase('pa pe', rules);
    assert(decodeText(encPhrase.symbols, rules).pronunciation.includes(' '));
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
