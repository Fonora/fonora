/**
 * Campfire composition gate — reject compounds a root-knower would not guess.
 *
 * Complements phonetic/understandability scoring with semantic-role rules:
 *   - tool concepts need a functional anchor (use, hand, hold, …)
 *   - lazy glue (make, do, thing) cannot be the sole verb for specific objects
 *   - material + make patterns fail for named tools
 */

import {
  LAZY_GLUE_ROOTS,
  TOOL_FUNCTION_ROOTS,
  isLazyGlueRoot,
} from './fonoran-root-semantic-fields.js';

/** Strong concrete anchors — lazy glue paired with these is often recoverable. */
export const STRONG_ANCHORS = new Set([
  'person', 'body', 'hand', 'head', 'food', 'water', 'fire', 'stone', 'plant', 'animal',
  'inside', 'outside', 'place', 'path', 'move', 'light', 'dark', 'pain', 'feel', 'air',
  'earth', 'sky', 'eat', 'sleep', 'speak', 'see', 'hear', 'touch', 'smell', 'taste',
  'collective', 'good', 'bad', 'want', 'fear', 'know', 'near', 'far', 'up', 'down',
  'before', 'now', 'same', 'skin', 'bone', 'blood', 'breath',
]);

/** Concept category → composition requirements. */
export const CONCEPT_CATEGORIES = {
  tool: {
    label: 'tool or handheld object',
    suffixes: [],
    ids: new Set([
      'hammer', 'knife', 'rope', 'bag', 'bowl', 'cup', 'lamp', 'weapon', 'nail', 'needle',
      'hook', 'lever', 'mortar', 'plank', 'wheel', 'boat', 'bridge', 'door', 'window',
      'wall', 'floor', 'thread', 'vehicle', 'tool', 'spear', 'net', 'ladder',
    ]),
    requires_any: [...TOOL_FUNCTION_ROOTS],
    forbid_patterns: [
      { head: 'make', modifier_lazy: true, reason: 'material+make does not name a tool — use hand/use/hold/take/bound' },
      { head: 'do', modifier_lazy: true, reason: 'material+do is not a recoverable tool name' },
    ],
  },
  body_part: {
    label: 'body part',
    suffixes: [],
    ids: new Set([
      'nose', 'ear', 'foot', 'arm', 'shoulder', 'stomach', 'teeth', 'tongue', 'hip', 'knee',
      'lung', 'skin', 'bone', 'blood', 'breath', 'sweat', 'eye', 'mouth', 'head', 'hand',
    ]),
    requires_any: ['body', 'move', 'feel', 'touch', 'smell', 'hear', 'see', 'eat', 'air', 'skin'],
    forbid_head: ['make', 'do', 'thing'],
  },
  action_verb: {
    label: 'action verb',
    suffixes: ['_ing'],
    ids: new Set([
      'run', 'swim', 'fly', 'walk', 'climb', 'fall', 'throw', 'catch', 'push', 'pull',
      'cut', 'tie', 'wrap', 'open', 'close', 'spin', 'hide', 'chase', 'jump', 'dig',
      'lift', 'gather', 'introduce', 'negotiate', 'greet', 'forgive',
    ]),
    requires_any: ['move', 'give', 'take', 'hold', 'use', 'make', 'do', 'speak', 'eat', 'sleep', 'drink', 'see', 'hear', 'touch', 'feel', 'want', 'know', 'think'],
    forbid_head_only_lazy: true,
  },
};

function inferConceptCategory(conceptId) {
  for (const [key, cat] of Object.entries(CONCEPT_CATEGORIES)) {
    if (cat.ids?.has(conceptId)) return { key, ...cat };
    for (const suf of cat.suffixes ?? []) {
      if (conceptId.endsWith(suf)) return { key, ...cat };
    }
  }
  return null;
}

function headRoot(composition) {
  if (!composition?.length) return null;
  return composition[composition.length - 1];
}

function hasAny(composition, rootSet) {
  return (composition ?? []).some(id => rootSet.has(id));
}

/**
 * Evaluate whether a composition passes campfire semantic-role rules.
 * @returns {{ pass: boolean, score: number, category: string|null, issues: string[] }}
 */
export function evaluateCampfireComposition(conceptId, composition, opts = {}) {
  const issues = [];
  const comp = composition ?? [];
  if (comp.length < 2) {
    return { pass: false, score: 0, category: null, issues: ['composition needs at least 2 components'] };
  }

  const category = inferConceptCategory(conceptId);
  const head = headRoot(comp);
  let score = 1;

  // Global: lazy glue with no strong concrete anchor
  const lazyCount = comp.filter(id => isLazyGlueRoot(id, opts.fields)).length;
  if (lazyCount >= comp.length - 1 && !hasAny(comp, STRONG_ANCHORS)) {
    issues.push(`too many lazy-glue roots (${comp.join('+')}) — need a concrete functional anchor`);
    score -= 0.4;
  }

  // Global: make/do as head with only material/abstract modifier
  if ((head === 'make' || head === 'do') && comp.length === 2) {
    const mod = comp[0];
    const materialMods = new Set(['stone', 'plant', 'water', 'fire', 'earth', 'skin', 'thing', 'substance', 'form']);
    if (materialMods.has(mod) && category?.key === 'tool') {
      issues.push(`${mod}+${head} is not a recoverable name for ${conceptId} — strangers would not guess "${conceptId}"`);
      score -= 0.5;
    }
  }

  if (category) {
    if (category.requires_any && !hasAny(comp, new Set(category.requires_any))) {
      issues.push(`${conceptId} (${category.label}) needs one of: ${category.requires_any.slice(0, 8).join(', ')}…`);
      score -= 0.35;
    }
    if (category.forbid_head?.includes(head)) {
      issues.push(`head root "${head}" is too vague for ${category.label}`);
      score -= 0.3;
    }
    for (const pat of category.forbid_patterns ?? []) {
      if (head === pat.head) {
        issues.push(pat.reason);
        score -= 0.45;
      }
    }
  }

  score = Math.max(0, Math.min(1, score));
  const pass = issues.length === 0 && score >= 0.65;
  return {
    pass,
    score,
    category: category?.key ?? null,
    issues,
  };
}

/**
 * Audit all compounds in inventory for campfire composition quality.
 */
export function auditCompoundCampfireQuality(compounds, opts = {}) {
  const failures = [];
  const warnings = [];
  let passCount = 0;

  for (const row of compounds ?? []) {
    if (row.state === 'rejected') continue;
    const concept = row.concept;
    const comp = row.preferred?.composition ?? row.composition;
    if (!comp?.length) continue;

    const eval_ = evaluateCampfireComposition(concept, comp, opts);
    if (eval_.pass) {
      passCount += 1;
    } else if (eval_.score < 0.5) {
      failures.push({
        concept,
        composition: comp.join('+'),
        surface: comp.join(''),
        category: eval_.category,
        score: eval_.score,
        issues: eval_.issues,
        preferred_source: row.preferred_source ?? 'heuristic',
      });
    } else {
      warnings.push({
        concept,
        composition: comp.join('+'),
        score: eval_.score,
        issues: eval_.issues,
      });
    }
  }

  const total = passCount + failures.length + warnings.length;
  return {
    total,
    pass_count: passCount,
    failure_count: failures.length,
    warning_count: warnings.length,
    pass_rate: total ? passCount / total : 1,
    failures: failures.sort((a, b) => a.score - b.score),
    warnings: warnings.slice(0, 30),
    gate_pass: failures.length === 0 && (total ? passCount / total >= 0.92 : true),
  };
}
