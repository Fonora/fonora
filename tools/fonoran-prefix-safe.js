/**
 * Prefix-safe CV / CVC inventory helpers.
 *
 * Algorithmic approval (not Word Manager approval): a spelling is prefix-safe
 * against a taken set iff it neither prefixes nor is prefixed by any other
 * taken spelling. This is the same rule Health scores as `prefix_overlap`.
 */

import { parseSyllable } from './fonoran-pronunciation.js';
import { buildSyllablePool } from './fonoran-root-sound-assign.js';

export function findPrefixConflicts(form, taken) {
  const f = String(form || '').toLowerCase();
  if (!f) return [];
  const hits = [];
  for (const other of taken) {
    const o = String(other || '').toLowerCase();
    if (!o || o === f) continue;
    if (o.startsWith(f) || f.startsWith(o)) hits.push(o);
  }
  return hits.sort();
}

export function isPrefixSafe(form, taken) {
  return findPrefixConflicts(form, taken).length === 0;
}

/** Classify a root as CV / CVC / other using the pronunciation parser. */
export function syllableTemplate(form) {
  const parsed = parseSyllable(String(form || '').toLowerCase());
  if (!parsed || parsed.unparsed || !parsed.vowel) return 'other';
  return parsed.coda ? 'CVC' : 'CV';
}

/**
 * Build the prefix-safe inventory snapshot from approved roots + phonetics config.
 */
export function buildPrefixSafeInventory({ approvedRoots, phoneticsConfig }) {
  const roots = (approvedRoots?.roots ?? []).map((r) => ({
    id: r.id,
    spelling: String(r.spelling || '').toLowerCase(),
    concept: r.concept ?? r.id,
  })).filter((r) => r.spelling);

  const taken = roots.map((r) => r.spelling);
  const takenSet = new Set(taken);

  const prefixPairs = [];
  for (let i = 0; i < taken.length; i++) {
    for (let j = i + 1; j < taken.length; j++) {
      const a = taken[i];
      const b = taken[j];
      if (a.startsWith(b) || b.startsWith(a)) {
        const shorter = a.length <= b.length ? a : b;
        const longer = shorter === a ? b : a;
        prefixPairs.push({ shorter, longer });
      }
    }
  }

  const approved = { CV: [], CVC: [], other: [] };
  for (const r of roots) {
    const template = syllableTemplate(r.spelling);
    const conflicts = findPrefixConflicts(r.spelling, taken);
    const entry = {
      id: r.id,
      spelling: r.spelling,
      concept: r.concept,
      prefix_safe: conflicts.length === 0,
      blocked_by: conflicts,
    };
    (approved[template] ?? approved.other).push(entry);
  }
  for (const key of Object.keys(approved)) {
    approved[key].sort((a, b) => a.spelling.localeCompare(b.spelling));
  }

  const pool = buildSyllablePool(phoneticsConfig);
  const poolAvailable = {
    CV_prefix_safe: [],
    CV_blocked: [],
    CVC_prefix_safe: [],
    CVC_blocked: [],
  };

  for (const syl of pool) {
    if (takenSet.has(syl.form)) continue;
    const conflicts = findPrefixConflicts(syl.form, taken);
    const bucket = conflicts.length
      ? (syl.template === 'CV' ? 'CV_blocked' : 'CVC_blocked')
      : (syl.template === 'CV' ? 'CV_prefix_safe' : 'CVC_prefix_safe');
    if (conflicts.length) {
      poolAvailable[bucket].push({ form: syl.form, template: syl.template, blocked_by: conflicts });
    } else {
      poolAvailable[bucket].push(syl.form);
    }
  }
  for (const key of Object.keys(poolAvailable)) {
    if (typeof poolAvailable[key][0] === 'string') {
      poolAvailable[key].sort();
    } else {
      poolAvailable[key].sort((a, b) => a.form.localeCompare(b.form));
    }
  }

  const approvedSafeCv = approved.CV.filter((r) => r.prefix_safe).map((r) => r.spelling);
  const approvedSafeCvc = approved.CVC.filter((r) => r.prefix_safe).map((r) => r.spelling);
  const approvedUnsafe = [...approved.CV, ...approved.CVC, ...approved.other]
    .filter((r) => !r.prefix_safe)
    .map((r) => ({ spelling: r.spelling, id: r.id, blocked_by: r.blocked_by }));

  return {
    version: '1.0-prefix-safe',
    rule: 'A spelling is algorithmically prefix-safe iff it neither prefixes nor is prefixed by any other approved root. Same detector as Health prefix_overlap.',
    note: 'This is phonetic distinctiveness approval, not Word Manager human approval. Free CV forms that prefix taken CVCs are blocked until those CVCs move.',
    generated_at: new Date().toISOString(),
    summary: {
      approved_roots: roots.length,
      prefix_pairs: prefixPairs.length,
      approved_CV_prefix_safe: approvedSafeCv.length,
      approved_CVC_prefix_safe: approvedSafeCvc.length,
      approved_prefix_unsafe: approvedUnsafe.length,
      pool_CV_prefix_safe_free: poolAvailable.CV_prefix_safe.length,
      pool_CV_blocked_free: poolAvailable.CV_blocked.length,
      pool_CVC_prefix_safe_free: poolAvailable.CVC_prefix_safe.length,
      pool_CVC_blocked_free: poolAvailable.CVC_blocked.length,
    },
    prefix_pairs: prefixPairs,
    approved_prefix_safe: {
      CV: approvedSafeCv,
      CVC: approvedSafeCvc,
    },
    approved_prefix_unsafe: approvedUnsafe,
    approved_detail: approved,
    pool_available: poolAvailable,
  };
}
