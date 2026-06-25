import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLanguageRulesFromString } from './load-language-rules.js';
import { registerIpaVowelMap, setActiveIpaVowelMap, registerConsonantMapFromRules } from './ipa-normalize.js';
import { LANGUAGE_RULES_PATH } from './fonora-config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Load a language-rules markdown file from the repo (Node tests/scripts).
 * @param {string} relativePath, path relative to repo root
 */
export function loadRulesFixture(relativePath, options = {}) {
  const repoPath = String(relativePath).replace(/^\//, '');
  const markdown = readFileSync(join(ROOT, repoPath), 'utf8');
  return loadLanguageRulesFromString(markdown, options);
}

export function loadActiveRulesFixture(options = {}) {
  return loadRulesFixture(LANGUAGE_RULES_PATH, options);
}

export function applyIpaVowelMap(bundle) {
  registerIpaVowelMap(bundle.ipaVowelMode, bundle.ipaVowelMap);
  setActiveIpaVowelMap(bundle.ipaVowelMap);
}

export function applyConsonantMap(bundle) {
  if (bundle?.rules) registerConsonantMapFromRules(bundle.rules);
}

export function applyBundleMaps(bundle) {
  applyIpaVowelMap(bundle);
  applyConsonantMap(bundle);
}
