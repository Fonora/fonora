/**
 * Fail loudly when paid LLM pipelines produce no durable editorial output.
 */

import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDITORIAL_DOCS } from './fonoran-store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_OUTPUT_RELS = [
  EDITORIAL_DOCS.compounds,
  EDITORIAL_DOCS.concept_inventory,
  'data/fonoran-compound-proposals.json',
];

/**
 * @param {string} filePath
 * @returns {Promise<number | null>} mtime ms or null if missing
 */
async function fileMtimeMs(filePath) {
  try {
    const st = await stat(filePath);
    return st.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Ensure at least one target file was modified after startMs.
 * @param {{ label: string, paths?: string[], startMs: number, proposalsAdded?: number }} opts
 */
export async function assertLlmPipelineWroteOutput({ label, paths, startMs, proposalsAdded = 0 }) {
  if (proposalsAdded > 0) return { ok: true, proposalsAdded };

  const rels = paths ?? DEFAULT_OUTPUT_RELS;
  const checked = [];
  for (const rel of rels) {
    const abs = join(ROOT, rel);
    const mtime = await fileMtimeMs(abs);
    checked.push({ path: rel, mtime });
    if (mtime != null && mtime >= startMs - 1000) {
      return { ok: true, path: rel, mtime };
    }
  }

  const err = new Error(
    `${label} finished but wrote no seeds or proposals. `
    + `Checked: ${checked.map(c => c.path).join(', ')}. `
    + 'No API spend should be considered successful until editorial files change.',
  );
  err.code = 'LLM_NO_OUTPUT';
  throw err;
}
