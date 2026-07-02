/**
 * Fonoran Gen 3 human-readability layer.
 * Browser + Node compatible (no fs). Does not modify root generation.
 */

export const PLACE_SYM = { '1': '∋', '2': '∩', '3': '⌓', '4': '∪', '5': '⊃' };
export const MANNER_SYM = {
  plain: '',
  voice: '⌇',
  friction: '⌀',
  nasal: '⏌',
  glide: 'ᵔ',
};

export const ASPECT_FONORA = {
  contact: '⚬∋',
  focal: '⚬∩',
  struct: '⚬⌓',
  field: '⚬∪',
  source: '⚬⊃',
  animated: '⚬⌇',
  turbulent: '⚬⌀',
  resonant: '⚬⏌',
};

export function fonoraConsonantSpell(manner, place) {
  const m = MANNER_SYM[manner] ?? '';
  const p = PLACE_SYM[place] ?? '?';
  return m ? m + p : p;
}

export function fonoraRootSpell(coords) {
  if (!coords) return null;
  const onset = fonoraConsonantSpell(coords.manner, coords.place);
  const vowel = ASPECT_FONORA[coords.A] ?? `⚬(${coords.A})`;
  return onset + vowel;
}

export function plainEnglish(coords, articulationMap) {
  if (!coords || !articulationMap) return '';
  const d = articulationMap.places?.[coords.place]?.name ?? coords.D;
  const m = articulationMap.manners?.[coords.manner]?.name ?? coords.M;
  const a = articulationMap.vowel_roles?.classes?.[coords.A]?.meaning ?? coords.A;
  return `${d} · ${m} · ${a}`;
}

export function explainCoordinates(coords, articulationMap) {
  if (!coords || !articulationMap) return '';
  const place = articulationMap.places?.[coords.place];
  const manner = articulationMap.manners?.[coords.manner];
  const aspect = articulationMap.vowel_roles?.classes?.[coords.A];
  const lines = [];
  if (place) {
    lines.push(`Depth ${place.name} (place ${coords.place}, ${place.symbol}): ${place.semantic_core}`);
  }
  if (manner) {
    const sym = manner.symbol === '(none)' ? 'plain stop' : manner.symbol;
    lines.push(`Mode ${manner.name} (${sym}): ${manner.semantic_core}`);
  }
  if (aspect) {
    lines.push(`Aspect ${coords.A} (${aspect.fonora}): ${aspect.meaning}`);
  }
  if (coords.fonora_onset) {
    lines.push(`Grid → onset ${coords.fonora_onset} + vowel ${coords.vowel} → ${coords.fonora_onset}${coords.vowel}`);
  }
  return lines.join('\n');
}

export function buildRootIndex(inventory) {
  const byRoot = new Map();
  const byId = new Map();
  for (const item of inventory) {
    byRoot.set(item.root, item);
    byId.set(item.id, item);
  }
  return { byRoot, byId };
}

export function sortedRoots(inventory) {
  return [...inventory].sort((a, b) => b.root.length - a.root.length);
}

export function segmentCompound(compound, inventory) {
  const roots = sortedRoots(inventory).map(r => r.root);
  const results = [];

  function walk(remaining, path) {
    if (remaining === '') {
      results.push([...path]);
      return;
    }
    for (const root of roots) {
      if (remaining.startsWith(root)) {
        path.push(root);
        walk(remaining.slice(root.length), path);
        path.pop();
      }
    }
  }

  walk(compound.toLowerCase(), []);
  return results;
}

export function parseCompound(compound, inventory, derivations = []) {
  const { byRoot } = buildRootIndex(inventory);
  const normalized = compound.trim().toLowerCase();
  const segmentations = segmentCompound(normalized, inventory);

  const known = derivations.find(d => d.compound === normalized);
  if (known) {
    return {
      compound: normalized,
      segmentations,
      parts: known.parts.map(p => ({
        root: p.root,
        id: p.id,
        gloss: byRoot.get(p.root)?.gloss ?? inventory.find(i => i.id === p.id)?.gloss,
        notation: p.notation,
        item: byRoot.get(p.root) ?? inventory.find(i => i.id === p.id),
      })),
      meaning: known.gloss,
      familiarConcept: known.concept,
      ambiguous: segmentations.length > 1,
      segmentationCount: segmentations.length,
      source: 'derivation',
    };
  }

  const best = [...segmentations].sort((a, b) => b.length - a.length)[0];
  if (!best) {
    return {
      compound: normalized,
      segmentations: [],
      parts: [],
      meaning: null,
      familiarConcept: null,
      ambiguous: true,
      segmentationCount: 0,
      source: 'unknown',
    };
  }

  const parts = best.map(root => {
    const item = byRoot.get(root);
    return {
      root,
      id: item?.id ?? '?',
      gloss: item?.gloss ?? 'unknown root',
      notation: item?.coordinates?.notation,
      item,
    };
  });

  return {
    compound: normalized,
    segmentations,
    parts,
    meaning: parts.map(p => p.gloss.split(';')[0].trim()).join(' + '),
    familiarConcept: null,
    ambiguous: segmentations.length > 1,
    segmentationCount: segmentations.length,
    source: 'parser',
  };
}

export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function rootSimilarity(a, b) {
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

export function pronounceabilityScore(text) {
  let score = 100;
  const issues = [];
  if (text.length <= 1) { score -= 40; issues.push('too short'); }
  if (text.length > 8) { score -= 25; issues.push('long compound'); }
  if (text.length > 12) { score -= 20; issues.push('very long compound'); }
  if (/([b-df-hj-np-tv-xz]){4,}/i.test(text)) { score -= 30; issues.push('consonant cluster'); }
  if (/^(gh|kh|ng|sh|ch)/.test(text) && text.length <= 4) { score -= 10; issues.push('heavy onset'); }
  if (/ee|ae|oh/.test(text) && text.length <= 4) { score -= 5; issues.push('digraph vowel'); }
  if (/ñ/.test(text)) { score -= 5; issues.push('non-ASCII onset'); }
  return { score: Math.max(0, score), issues };
}

export function analyzeAmbiguity(inventory, derivations = [], segByCompound = null) {
  const warnings = [];
  const segmentations = (compound) =>
    segByCompound?.get(compound) ?? segmentCompound(compound, inventory);

  for (let i = 0; i < inventory.length; i++) {
    for (let j = i + 1; j < inventory.length; j++) {
      const a = inventory[i];
      const b = inventory[j];
      const sim = rootSimilarity(a.root, b.root);
      if (sim >= 0.67) {
        warnings.push({
          type: 'similar_roots',
          severity: sim >= 0.85 ? 'high' : 'medium',
          message: `Roots "${a.root}" (${a.id}) and "${b.root}" (${b.id}) sound similar (${sim.toFixed(2)})`,
        });
      }
      if (a.root !== b.root && (a.root.startsWith(b.root) || b.root.startsWith(a.root))) {
        const shorter = a.root.length < b.root.length ? a : b;
        const longer = shorter === a ? b : a;
        warnings.push({
          type: 'prefix_overlap',
          severity: 'high',
          message: `"${shorter.root}" (${shorter.id}) prefixes "${longer.root}" (${longer.id}): segmentation risk`,
        });
      }
    }
  }

  const focalCluster = inventory.filter(i =>
    i.coordinates?.A === 'focal' && /ee$/.test(i.root),
  );
  if (focalCluster.length >= 4) {
    warnings.push({
      type: 'phonetic_cluster',
      severity: 'high',
      message: `Focal-aspect -ee rhyme cluster (${focalCluster.length} roots): ${focalCluster.map(i => `${i.root}=${i.id}`).join(', ')}`,
    });
  }

  const glideL = inventory.filter(i => /^l/.test(i.root) && i.coordinates?.manner === 'glide');
  if (glideL.length >= 2) {
    warnings.push({
      type: 'phonetic_cluster',
      severity: 'medium',
      message: `Glide l- onset cluster: ${glideL.map(i => `${i.root}(${i.id})`).join(', ')}`,
    });
  }

  for (const d of derivations) {
    if (!d.compound) continue;
    if (d.compound.length > 8) {
      warnings.push({
        type: 'compound_length',
        severity: d.compound.length > 12 ? 'high' : 'medium',
        message: `"${d.compound}" (${d.concept}) length ${d.compound.length}`,
      });
    }
    const segs = segmentations(d.compound);
    if (segs.length > 1) {
      warnings.push({
        type: 'segmentation_ambiguity',
        severity: 'high',
        message: `"${d.compound}" (${d.concept}): ${segs.length} valid segmentations`,
        segmentations: segs.slice(0, 5).map(s => s.join('+')),
      });
    }
    const pron = pronounceabilityScore(d.compound);
    if (pron.score < 60) {
      warnings.push({
        type: 'pronunciation',
        severity: pron.score < 40 ? 'high' : 'medium',
        message: `"${d.compound}" (${d.concept}): ${pron.issues.join(', ')}`,
      });
    }
  }

  const repaired = inventory.filter(i => (i.repair_steps ?? 0) > 0);
  if (repaired.length) {
    warnings.push({
      type: 'algorithmic_repair',
      severity: 'medium',
      message: `${repaired.length} roots used grid repair: ${repaired.map(i => i.id).join(', ')}`,
    });
  }

  return warnings;
}

export function auditScores(inventory, derivations, warnings, segByCompound = null) {
  const pronScores = inventory.map(i => pronounceabilityScore(i.root).score);
  const avgPron = pronScores.reduce((a, b) => a + b, 0) / pronScores.length;
  const highWarnings = warnings.filter(w => w.severity === 'high').length;
  const parseable = derivations.filter(d => {
    const segs = segByCompound?.get(d.compound) ?? segmentCompound(d.compound, inventory);
    return segs.length === 1;
  }).length;

  return {
    learnability: Math.round(Math.max(0, 100 - highWarnings * 8 - warnings.filter(w => w.type === 'similar_roots').length * 3)),
    pronounceability: Math.round(avgPron),
    memorability: Math.round(Math.max(0, 100 - warnings.filter(w => w.type === 'phonetic_cluster').length * 15 - warnings.filter(w => w.type === 'similar_roots').length * 5)),
    parseability: derivations.length ? Math.round((parseable / derivations.length) * 100) : 0,
    compoundLength: derivations.length ? Math.round(derivations.reduce((s, d) => s + d.compound.length, 0) / derivations.length) : 0,
    algorithmicFeel: Math.round((inventory.filter(i => (i.repair_steps ?? 0) > 0).length / inventory.length) * 100),
    warningCount: warnings.length,
    highSeverityCount: highWarnings,
  };
}

// ---------------------------------------------------------------------------
// Compound Boundary Constraint
// ---------------------------------------------------------------------------

// Phoneme tables for boundary analysis. Sorted longest-first so digraphs
// match before their constituent single characters.
const _CBC_CODAS = [
  'ch', 'sh', 'ng', 'kh', 'gh', 'th', 'dh',
  'p', 't', 'k', 'h', 'm', 'n', 's', 'd', 'b', 'g', 'v', 'z', 'l', 'r', 'x',
].sort((a, b) => b.length - a.length);

const _CBC_ONSETS = [
  'gh', 'kh', 'ng', 'sh', 'ch', 'th', 'dh', 'ñ',
  'x', 'p', 't', 'b', 'd', 'j', 'g', 'h', 'f', 's', 'v', 'z', 'm', 'n', 'w', 'l', 'r', 'y', 'k',
].sort((a, b) => b.length - a.length);

const _CBC_VOWELS = [
  'eye', 'ee', 'ae', 'oh', 'ow', 'oy', 'ay', 'a', 'e', 'i', 'o', 'u',
].sort((a, b) => b.length - a.length);

/** Extract the trailing phoneme of a roman-alphabet Fonoran string. */
function _trailingPhoneme(str) {
  const s = str.toLowerCase();
  for (const c of _CBC_CODAS) {
    if (s.endsWith(c)) return { phoneme: c, isConsonant: true, isVowel: false };
  }
  for (const v of _CBC_VOWELS) {
    if (s.endsWith(v)) return { phoneme: v, isConsonant: false, isVowel: true };
  }
  return { phoneme: s.slice(-1), isConsonant: false, isVowel: false };
}

/** Extract the leading phoneme of a roman-alphabet Fonoran string. */
function _leadingPhoneme(str) {
  const s = str.toLowerCase();
  for (const o of _CBC_ONSETS) {
    if (s.startsWith(o)) return { phoneme: o, isConsonant: true, isVowel: false };
  }
  for (const v of _CBC_VOWELS) {
    if (s.startsWith(v)) return { phoneme: v, isConsonant: false, isVowel: true };
  }
  return { phoneme: s[0] ?? '', isConsonant: false, isVowel: false };
}

/**
 * Check the Compound Boundary Constraint for an ordered array of morpheme
 * spellings. A compound is invalid when the trailing phoneme of a left
 * morpheme is the same consonant as the leading phoneme of the right
 * morpheme (e.g. bem + mam → m+m collision).
 *
 * @param {string[]} parts  Ordered morpheme spellings, e.g. ['bem', 'mam']
 * @returns {{ valid: boolean, violations: Array<{left, right, phoneme, position, reason}> }}
 */
export function checkCompoundBoundary(parts) {
  const violations = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const left = parts[i];
    const right = parts[i + 1];
    if (!left || !right) continue;
    const trailing = _trailingPhoneme(left);
    const leading = _leadingPhoneme(right);
    if (trailing.isConsonant && leading.isConsonant && trailing.phoneme === leading.phoneme) {
      violations.push({
        left,
        right,
        phoneme: trailing.phoneme,
        position: i,
        reason: `Rejected: identical consonant boundary ${trailing.phoneme} + ${leading.phoneme} between "${left}" and "${right}"`,
      });
    }
  }
  return { valid: violations.length === 0, violations };
}

export function generateAuditMarkdown({ inventory, derivations, warnings, scores, generatedAt }) {
  const lines = [];
  lines.push('# Fonoran Gen 3: Human Readability Audit');
  lines.push('');
  lines.push(`> Generated: ${generatedAt}`);
  lines.push('> Live lab health: `/language/` → Health');
  lines.push('> Regenerate (frozen Gen 3 JSON): `npm run fonoran:gen3:audit` → `reports/`');
  lines.push('> **Goal:** learnability through Fonoran internal logic: not English familiarity.');
  lines.push('');
  lines.push('## Executive summary');
  lines.push('');
  lines.push('| Dimension | Score | Notes |');
  lines.push('| --- | ---: | --- |');
  lines.push(`| Learnability | ${scores.learnability}/100 | Coordinate-first pedagogy |`);
  lines.push(`| Pronounceability | ${scores.pronounceability}/100 | Mean root pronounceability |`);
  lines.push(`| Memorability | ${scores.memorability}/100 | Root distinctiveness |`);
  lines.push(`| Parseability | ${scores.parseability}/100 | Unique segmentation of example compounds |`);
  lines.push(`| Avg compound length | ${scores.compoundLength} | Characters per derivation |`);
  lines.push(`| Algorithmic feel | ${scores.algorithmicFeel}% | Roots needing grid repair |`);
  lines.push('');
  lines.push(`**${scores.warningCount}** warnings (${scores.highSeverityCount} high).`);
  lines.push('');
  lines.push('## Learnability');
  lines.push('');
  lines.push('Gen 3 is learnable when the learner starts from **DDA coordinates** (depth · mode · aspect), not English glosses.');
  lines.push('');
  lines.push('- **Strength:** Every primitive is a named coordinate with grid explainability.');
  lines.push('- **Strength:** Lip-to-throat depth axis is a single consistent metaphor.');
  lines.push('- **Risk:** Focal `ee` roots rhyme: discrimination relies on onset consonants only.');
  lines.push('- **Risk:** Repair-shifted roots weaken strict coordinate→form teaching.');
  lines.push('- **Risk:** Familiar labels (planet, river) are reviewer aids: not translation pairs.');
  lines.push('');
  lines.push('## Pronounceability');
  lines.push('');
  lines.push('- CV roots are generally short and speakable.');
  lines.push('- Compounds stacking digraphs (`xoshaeko`, `keeriroh`) increase effort.');
  lines.push('- `ñ` and multi-char onsets need Fonora script or IPA for reliable production.');
  lines.push('');
  lines.push('## Memorability');
  lines.push('');
  const clusters = warnings.filter(w => w.type === 'phonetic_cluster' || w.type === 'similar_roots' || w.type === 'prefix_overlap');
  if (clusters.length) clusters.forEach(w => lines.push(`- ${w.message}`));
  else lines.push('- No major clusters flagged.');
  lines.push('');
  lines.push('## Parseability');
  lines.push('');
  for (const d of derivations) {
    const n = segmentCompound(d.compound, inventory).length;
    lines.push(`- **${d.compound}** (${d.concept}): ${n === 1 ? 'unique parse' : `${n} parses`}: ${d.composition.join(' + ')}`);
  }
  lines.push('');
  lines.push('## Compound length');
  lines.push('');
  lines.push('| Concept | Compound | Len | Parts |');
  lines.push('| --- | --- | ---: | ---: |');
  for (const d of derivations) {
    lines.push(`| ${d.concept} | ${d.compound} | ${d.compound.length} | ${d.composition.length} |`);
  }
  lines.push('');
  lines.push('Prefer **two-root** compounds for core vocabulary.');
  lines.push('');
  lines.push('## Algorithmic feel');
  lines.push('');
  const repaired = inventory.filter(i => (i.repair_steps ?? 0) > 0);
  lines.push(`${repaired.length}/${inventory.length} roots (${scores.algorithmicFeel}%) required repair.`);
  if (repaired.length) {
    lines.push('');
    lines.push('| Primitive | Root | Steps |');
    lines.push('| --- | --- | ---: |');
    for (const i of repaired) lines.push(`| ${i.id} | ${i.root} | ${i.repair_steps} |`);
  }
  lines.push('');
  lines.push('## All warnings');
  lines.push('');
  for (const w of warnings) {
    lines.push(`- **[${w.severity}/${w.type}]** ${w.message}`);
    if (w.segmentations) lines.push(`  - Parses: ${w.segmentations.join(' | ')}`);
  }
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  lines.push('1. Teach coordinate charts before root lists.');
  lines.push('2. Consider compound boundary grammar if ambiguity grows.');
  lines.push('3. Reduce focal-`ee` density in future generator revisions.');
  lines.push('4. Use Fonora script spellings in learning materials.');
  lines.push('5. Default to two-root compounds for human-facing vocabulary.');
  lines.push('');
  return lines.join('\n');
}
