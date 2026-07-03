/**
 * Resolve paths for optional research datasets in Fonora/fonora-data.
 * Core editorial seeds always stay under the main repo data/ directory.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SUBMODULE_DIR = join(ROOT, 'external/fonora-data');
const MANIFEST_PATH = join(ROOT, 'data/fonora-data.manifest.json');

/** Relative paths inside the data repo (or legacy in-repo data/). */
export const EXTERNAL_DATA_REL = {
  llm_evaluations: 'data/fonoran-llm-evaluations.json',
  playtests: 'data/fonoran-playtests.json',
  translation_test_latest: 'data/fonoran-translation-test-latest.json',
  research_notes_store: 'data/research-notes-store.json',
};

/** Editorial doc keys stored in fonora-data when external dir is active. */
export const EXTERNAL_EDITORIAL_KEYS = new Set(['llm_evaluations', 'playtests']);

/**
 * Root of Fonora/fonora-data: explicit env, or vendor/fonora-data submodule if present.
 * @returns {string | null}
 */
export function resolveDataDir() {
  const explicit = process.env.FONORAN_DATA_DIR?.trim();
  if (explicit) return explicit;
  if (existsSync(join(DEFAULT_SUBMODULE_DIR, 'manifest.json'))) {
    return DEFAULT_SUBMODULE_DIR;
  }
  return null;
}

/**
 * Absolute path for an external data file by logical key.
 * @param {keyof typeof EXTERNAL_DATA_REL} key
 */
export function resolveDataPath(key) {
  const rel = EXTERNAL_DATA_REL[key];
  if (!rel) throw new Error(`Unknown external data key: ${key}`);
  const dataDir = resolveDataDir();
  if (dataDir) return join(dataDir, rel);
  return join(ROOT, rel);
}

/**
 * Seed path for an editorial doc — external data dir for optional docs when configured.
 * @param {string} key
 * @param {string} rel  path relative to repo root (from EDITORIAL_DOCS)
 * @param {string} [baseDir]
 */
export function editorialSeedPath(key, rel, baseDir = ROOT) {
  if (EXTERNAL_EDITORIAL_KEYS.has(key)) {
    const dataDir = resolveDataDir();
    if (dataDir) return join(dataDir, rel);
  }
  return join(baseDir, rel);
}

export function manifestPath() {
  return MANIFEST_PATH;
}
