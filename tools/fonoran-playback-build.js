/**
 * Server-side playback attachment for translator API / CLI.
 * Core builder lives in js/fonoran-playback-build.js (browser-safe).
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLanguageRulesFromString } from '../js/load-language-rules.js';
import {
  buildPlaybackFromTokens,
  encodePartsToScript,
  normalizeTokenParts,
} from '../js/fonoran-playback-build.js';

export { buildPlaybackFromTokens, encodePartsToScript, normalizeTokenParts };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGUAGE_RULES_PATH = join(ROOT, 'docs/language-rules.md');

let cachedLanguageRules = null;

/** Load Fonora symbol registry from language-rules.md (server-side, cached). */
export async function loadFonoraLanguageRules() {
  if (cachedLanguageRules) return cachedLanguageRules;
  const md = await readFile(LANGUAGE_RULES_PATH, 'utf8');
  cachedLanguageRules = loadLanguageRulesFromString(md).rules;
  return cachedLanguageRules;
}

export function resetFonoraLanguageRulesCache() {
  cachedLanguageRules = null;
}

/** Attach playback payload to a translator result object. */
export async function attachTranslatorPlayback(result, rules = null) {
  if (!result?.tokens?.length) {
    result.playback = { phrase: '', script: '', segments: [], wordSources: [], tokenIndices: [], wordCount: 0, playable: false };
    return result;
  }
  const langRules = rules ?? await loadFonoraLanguageRules();
  result.playback = buildPlaybackFromTokens(result.tokens, langRules);
  return result;
}
