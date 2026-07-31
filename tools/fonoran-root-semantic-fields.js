/**
 * Root semantic fields — roots are IDEAS, not English words.
 *
 * Each primitive carries:
 *   - core_idea: what the root means as a concept
 *   - roles: communicative jobs it can anchor in compounds
 *   - association_ideas: recoverability hints (not lemmas / inflections)
 *
 * Used by campfire composition gates and seed audits so we reject lazy glue
 * (stone+make = hammer) before it reaches the lexicon.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIELDS_PATH = join(ROOT, 'data/fonoran-root-semantic-fields.json');

/** Roots that act as vague glue when used as the only semantic anchor. */
export const LAZY_GLUE_ROOTS = new Set([
  'make', 'do', 'thing', 'form', 'part', 'change', 'source', 'substance', 'mark',
]);

/** Functional anchors for tool-like concepts — at least one required. */
export const TOOL_FUNCTION_ROOTS = new Set([
  'use', 'hand', 'hold', 'take', 'bound', 'conflict', 'help', 'give', 'move',
]);

let _cache = null;

export async function loadRootSemanticFields() {
  if (_cache) return _cache;
  const raw = await readFile(FIELDS_PATH, 'utf8');
  _cache = JSON.parse(raw);
  return _cache;
}

export function getRootField(fields, rootId) {
  return fields?.roots?.[rootId] ?? null;
}

export function isLazyGlueRoot(rootId, fields = null) {
  if (fields?.lazy_glue_roots?.includes(rootId)) return true;
  return LAZY_GLUE_ROOTS.has(rootId);
}

