/**
 * Root semantic fields — roots are IDEAS, not English words.
 *
 * Each primitive carries:
 *   - core_idea: what the root means as a concept
 *   - roles: communicative jobs it can anchor in compounds
 *   - association_ideas: recoverability hints (not lemmas / inflections)
 *
 * Used by campfire composition gates, vocab survey prompts, and seed audits
 * so we reject lazy glue (stone+make = hammer) before expensive LLM runs.
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

/** Prompt block for LLM proposers — roots as ideas, not words. */
export function semanticFieldsPromptBrief(fields) {
  const lazy = (fields?.lazy_glue_roots ?? [...LAZY_GLUE_ROOTS]).join(', ');
  const samples = ['stone', 'make', 'hand', 'use', 'water', 'feel']
    .map(id => {
      const f = fields?.roots?.[id];
      if (!f) return null;
      const ideas = (f.association_ideas ?? []).slice(0, 3).join('; ');
      return `  ${id}: ${f.core_idea}${ideas ? ` — evokes: ${ideas}` : ''}`;
    })
    .filter(Boolean)
    .join('\n');

  return [
    'ROOT SEMANTICS (roots are IDEAS, not English words):',
    '- Compose from what a root-knower would GUESS, not English etymology.',
    '- Each root evokes a cluster of ideas; pick roots whose ideas overlap the target concept.',
    '- Lazy glue roots (' + lazy + ') cannot carry a specific tool/object alone.',
    'Examples:',
    samples,
  ].join('\n');
}
