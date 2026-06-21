import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLanguageRulesFromString } from './load-language-rules.js';
import { registerIpaVowelMap, setActiveIpaVowelMap } from './ipa-normalize.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Load a language-rules markdown file from the repo (Node tests/scripts).
 * @param {string} relativePath — path relative to repo root
 */
export function loadRulesFixture(relativePath, options = {}) {
  const markdown = readFileSync(join(ROOT, relativePath), 'utf8');
  return loadLanguageRulesFromString(markdown, options);
}

export function loadActiveRulesFixture(options = {}) {
  return loadRulesFixture('language-rules.md', options);
}

export function loadV1RulesFixture(options = {}) {
  return loadRulesFixture('fixtures/language-rules-v1.md', { expectFullwidthLips: false, ...options });
}

export function applyIpaVowelMap(bundle) {
  registerIpaVowelMap(bundle.ipaVowelMode, bundle.ipaVowelMap);
  setActiveIpaVowelMap(bundle.ipaVowelMap);
}
