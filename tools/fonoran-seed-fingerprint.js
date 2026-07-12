/**
 * Fingerprint for seed bank + preferred compounds — detects when LLM eval data is stale.
 */

import { createHash } from 'node:crypto';
import { readDoc } from './fonoran-store.js';
import { ASSOCIATION_SEEDS } from './fonoran-expression-candidates.js';
import { loadRootSemanticFields } from './fonoran-root-semantic-fields.js';

/** Stable JSON (sorted object keys) for hashing. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function digest(payload) {
  return createHash('sha256').update(stableStringify(payload)).digest('hex').slice(0, 16);
}

/**
 * Snapshot of inputs that affect LLM candidate pools and compound surfaces.
 * @returns {Promise<{ fingerprint: string, summary: object }>}
 */
export async function computeSeedBankFingerprint() {
  const [compoundsDoc, fields] = await Promise.all([
    readDoc('compounds'),
    loadRootSemanticFields(),
  ]);
  const live = (compoundsDoc?.compounds ?? []).filter(c => c.state !== 'rejected');
  const preferred = live
    .map(c => ({
      concept: c.concept,
      composition: c.preferred?.composition ?? c.composition ?? null,
      source: c.preferred_source ?? null,
    }))
    .sort((a, b) => a.concept.localeCompare(b.concept));

  const semanticRoots = {};
  for (const [id, entry] of Object.entries(fields?.roots ?? {})) {
    semanticRoots[id] = {
      association_ideas: [...(entry.association_ideas ?? [])].sort(),
      pairs_well_with: [...(entry.pairs_well_with ?? [])].sort(),
      lazy_glue: Boolean(entry.lazy_glue),
    };
  }

  const payload = {
    seeds: ASSOCIATION_SEEDS,
    semantic_version: fields?.version ?? null,
    semantic_roots: semanticRoots,
    preferred,
  };

  return {
    fingerprint: digest(payload),
    summary: {
      seed_concepts: Object.keys(ASSOCIATION_SEEDS).length,
      compound_count: preferred.length,
      semantic_version: fields?.version ?? null,
    },
  };
}

/** True when any stored eval round predates the current seed bank. */
export function isLlmEvalStale(evalDoc, currentFingerprint) {
  const rounds = evalDoc?.rounds ?? [];
  if (!rounds.length) return false;
  return rounds.some(r => r.seed_bank_fingerprint !== currentFingerprint);
}

/** True when a cached audit report predates the current seed bank. */
export function isReportStale(report, currentFingerprint) {
  if (!report) return false;
  return report.seed_bank_fingerprint !== currentFingerprint;
}
