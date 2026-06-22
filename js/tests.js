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
import { loadActiveRulesFixture } from './load-rules-fixture.js';
import { runTests } from './tests-core.js';
import {
  resolveEspeakVoice,
  DEFAULT_ENGLISH_VOICE,
  ENGLISH_DIALECT_CODES,
} from './language-preferences.js';

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

const allFailed = [...failed, ...(parserResult.ok ? [] : [parserResult]), ...(composeResult.ok ? [] : [composeResult]), ...(derivedResult.ok ? [] : [derivedResult]), ...(voiceResult.ok ? [] : [voiceResult])];
const allPassed = passed + (parserResult.ok ? 1 : 0) + (composeResult.ok ? 1 : 0) + (derivedResult.ok ? 1 : 0) + (voiceResult.ok ? 1 : 0);
const allTotal = total + 4;

for (const f of allFailed) console.error('FAIL:', f.name, '-', f.error);
console.log(`${allPassed}/${allTotal} tests passed`);
process.exit(allFailed.length ? 1 : 0);
