#!/usr/bin/env node
/**
 * Fonoran Primitive Root Capacity Test
 *
 * Design decision under test:
 *   - Primitive roots must be exactly one syllable.
 *   - Allowed templates: CV and CVC only.
 *   - CV-CV (disyllabic) forms are invalid for primitive roots.
 *
 * Run: npm run fonoran:root-capacity
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSyllable, isValidSyllable, ONSETS, VOWELS, CODAS } from '../tools/fonoran-pronunciation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Load data ─────────────────────────────────────────────────────────────────

const config = JSON.parse(await readFile(join(ROOT, 'data/fonoran-primitive-roots-config.json'), 'utf8'));
const candidates = JSON.parse(await readFile(join(ROOT, 'data/fonoran-root-candidates.json'), 'utf8'));
const approvedRoots = JSON.parse(await readFile(join(ROOT, 'data/fonoran-approved-roots.json'), 'utf8'));
// fonoran-concept-inventory.json is the authoritative concept list the generator reads from.
const conceptInventory = JSON.parse(await readFile(join(ROOT, 'data/fonoran-concept-inventory.json'), 'utf8'));

const { phonetics, reserved_particles, excluded_syllables } = config;

// ── 1–3: Phoneme inventories ──────────────────────────────────────────────────

// The parser's own inventories, so this audit can never disagree with it.
const ALL_ONSETS = ONSETS;
const ALL_VOWELS = VOWELS;
const ALL_CODAS = CODAS;

// Subset used by the generator (from config)
const GEN_ONSETS = [
  ...phonetics.preferred_onsets,
  ...phonetics.secondary_onsets,
  ...phonetics.tertiary_onsets,
];
const GEN_VOWELS = phonetics.vowels_by_cost;   // ["a","e","i","o","u"]
const GEN_CODA_ONSETS = phonetics.coda_onsets; // onsets permitted when adding a coda

// ── Reserved / excluded ────────────────────────────────────────────────────────

const RESERVED = new Set(reserved_particles.forms.map(s => s.toLowerCase()));
const EXCLUDED_PREFIXES = excluded_syllables.forms.map(s => s.toLowerCase());

function isReserved(sp) { return RESERVED.has(sp); }
function isExcluded(sp) {
  return EXCLUDED_PREFIXES.some(ex => sp === ex || sp.startsWith(ex));
}
function isBlockedByReservedOrExcluded(sp) {
  return isReserved(sp) || isExcluded(sp);
}

// ── 4–6: Count valid CV and CVC forms ────────────────────────────────────────

// CV: (onset or none) + vowel — must parse cleanly, no coda, not reserved/excluded.
const cvForms = [];
for (const onset of ['', ...ALL_ONSETS]) {
  for (const vowel of ALL_VOWELS) {
    const sp = onset + vowel;
    const parsed = parseSyllable(sp);
    if (!parsed || parsed.unparsed || !parsed.vowel || parsed.coda) continue;
    if (isBlockedByReservedOrExcluded(sp)) continue;
    cvForms.push(sp);
  }
}

// CVC: onset + vowel + coda — must parse cleanly, has coda, not reserved/excluded.
const cvcForms = [];
for (const onset of ['', ...ALL_ONSETS]) {
  for (const vowel of ALL_VOWELS) {
    for (const coda of ALL_CODAS) {
      const sp = onset + vowel + coda;
      const parsed = parseSyllable(sp);
      if (!parsed || parsed.unparsed || !parsed.vowel || !parsed.coda) continue;
      if (isBlockedByReservedOrExcluded(sp)) continue;
      cvcForms.push(sp);
    }
  }
}

const allValidForms = new Set([...cvForms, ...cvcForms]);

// Generator-constrained pool (what the build script actually draws from):
//   CV from preferred+secondary+tertiary onsets
//   CVC from coda_onsets x {a,e} x {n,m,t,k,s,l}
const GEN_CVC_CODAS = ['n', 'm', 't', 'k', 's', 'l'];
const GEN_CVC_VOWELS = ['a', 'e'];

const genCvForms = new Set();
for (const onset of GEN_ONSETS) {
  for (const vowel of GEN_VOWELS) {
    const sp = onset + vowel;
    if (isValidSyllable(sp) && !isBlockedByReservedOrExcluded(sp)) {
      genCvForms.add(sp);
    }
  }
}
const genCvcForms = new Set();
for (const onset of GEN_CODA_ONSETS) {
  for (const vowel of GEN_CVC_VOWELS) {
    for (const coda of GEN_CVC_CODAS) {
      const sp = onset + vowel + coda;
      if (isValidSyllable(sp) && !isBlockedByReservedOrExcluded(sp)) {
        genCvcForms.add(sp);
      }
    }
  }
}
const genPool = new Set([...genCvForms, ...genCvcForms]);

// ── 7: How many primitive concepts need roots? ────────────────────────────────

// The active generator reads fonoran-concept-inventory.json (118 primitives).
const conceptCount = conceptInventory.primitives?.length ?? conceptInventory.concepts?.length ?? 118;
const conceptCountNote = `(${conceptInventory.primitive_count ?? '?'} core + ${conceptInventory.extended_count ?? '?'} extended, from fonoran-concept-inventory.json)`;

// ── 8–11: Current assignment status ──────────────────────────────────────────

const allCandidates = candidates.candidates ?? [];
const approvedList = approvedRoots.roots ?? [];

const assigned = allCandidates.filter(c => c.status !== 'rejected');

const invalid = [];
const validAssigned = [];

for (const c of assigned) {
  const parsed = parseSyllable(c.spelling);
  const isCV_CVC = parsed && !parsed.unparsed && parsed.vowel;
  if (!isCV_CVC) invalid.push(c);
  else validAssigned.push(c);
}

const validAssignedSpellings = new Set(validAssigned.map(c => c.spelling));

// Unused forms = valid CV/CVC forms not currently assigned to any non-rejected concept.
const unused    = [...allValidForms].filter(sp => !validAssignedSpellings.has(sp));
const unusedGen = [...genPool].filter(sp => !validAssignedSpellings.has(sp));

// ── 12: Collision / reserved detail ──────────────────────────────────────────

const reservedForms = [...RESERVED].sort();
const excludedForms = EXCLUDED_PREFIXES.sort();

// CVC forms where the coda is the same single letter as the following syllable's
// onset — i.e. the root ends and the next root starts with the same consonant,
// creating an ambiguous double-consonant at a compound boundary.
// Example: root "gab" + root "ba" → "gabba"; is "b" the coda of "gab" or part of "bba"?
// We flag only the single-char codas (digraph codas are unambiguous).
const codaOnsetOverlap = cvcForms.filter(sp => {
  const parsed = parseSyllable(sp);
  return parsed?.coda?.length === 1 && ALL_ONSETS.includes(parsed.coda);
});

// ── Print report ──────────────────────────────────────────────────────────────

const hr = '─'.repeat(60);
const hr2 = '═'.repeat(60);

function section(title) {
  console.log(`\n${hr2}`);
  console.log(` ${title}`);
  console.log(hr2);
}

function sub(label, value) {
  const dots = '.'.repeat(Math.max(1, 42 - label.length));
  console.log(`  ${label} ${dots} ${value}`);
}

console.log(`\n${'═'.repeat(60)}`);
console.log(` FONORAN PRIMITIVE ROOT CAPACITY REPORT`);
console.log(` Design rule: roots = one syllable, CV or CVC only`);
console.log(` CV-CV forms are disallowed for primitives`);
console.log(`${'═'.repeat(60)}`);

// ── Section 1–3: Inventories ──────────────────────────────────────────────────
section('1–3  PHONEME INVENTORIES');

console.log(`\n  Onsets (initials) — full parser set (${ALL_ONSETS.length}):`);
console.log(`    Single:  ${ALL_ONSETS.filter(o => o.length === 1).join('  ')}`);
console.log(`    Digraph: ${ALL_ONSETS.filter(o => o.length > 1).join('  ')}`);

console.log(`\n  Generator subset — preferred (${phonetics.preferred_onsets.length}), secondary (${phonetics.secondary_onsets.length}), tertiary (${phonetics.tertiary_onsets.length}):`);
console.log(`    Preferred:  ${phonetics.preferred_onsets.join('  ')}`);
console.log(`    Secondary:  ${phonetics.secondary_onsets.join('  ')}`);
console.log(`    Tertiary:   ${phonetics.tertiary_onsets.join('  ')}`);

console.log(`\n  Vowels — full set (${ALL_VOWELS.length}):`);
console.log(`    ${ALL_VOWELS.join('  ')}`);
console.log(`  Generator vowels (${GEN_VOWELS.length}): ${GEN_VOWELS.join('  ')}`);

console.log(`\n  Codas (finals) — full set (${ALL_CODAS.length}):`);
console.log(`    Single:  ${ALL_CODAS.filter(c => c.length === 1).join('  ')}`);
console.log(`    Digraph: ${ALL_CODAS.filter(c => c.length > 1).join('  ')}`);
console.log(`  Generator coda-onset set (${GEN_CODA_ONSETS.length}): ${GEN_CODA_ONSETS.join('  ')}`);
console.log(`  Generator coda consonants (6): n  m  t  k  s  l`);

// ── Section 4–6: Capacity counts ─────────────────────────────────────────────
section('4–6  CV / CVC CAPACITY');

sub('Full-parser CV forms', cvForms.length.toLocaleString());
sub('Full-parser CVC forms', cvcForms.length.toLocaleString());
sub('Full-parser CV + CVC total', allValidForms.size.toLocaleString());
console.log();
sub('Generator-pool CV forms', genCvForms.size.toLocaleString());
sub('Generator-pool CVC forms', genCvcForms.size.toLocaleString());
sub('Generator-pool total', genPool.size.toLocaleString());

// ── Section 7–10: Assignment audit ───────────────────────────────────────────
section('7–10  CONCEPT DEMAND vs. SUPPLY');

const approvedCount = allCandidates.filter(c => c.status === 'approved').length;
const pendingCount  = allCandidates.filter(c => c.status === 'pending').length;
const rejectedCount = allCandidates.filter(c => c.status === 'rejected').length;

sub(`Primitive concepts needing roots`, `${conceptCount}  ${conceptCountNote}`);
sub('Total candidates (all statuses)', allCandidates.length);
sub('  → approved', approvedCount);
sub('  → pending review', pendingCount);
sub('  → rejected', rejectedCount);
sub('Assigned (non-rejected)', assigned.length);
console.log();
sub('Valid under CV/CVC rule', validAssigned.length);
sub('INVALID (CV-CV, not allowed)', invalid.length);
if (invalid.length === 0) console.log('  ✓ All assigned roots pass the one-syllable rule.');
console.log();
// Pool capacity vs. demand — critical distinction:
// pool size is total valid syllable forms; concept count is how many are needed.
sub('Full-parser pool (CV+CVC forms)', allValidForms.size.toLocaleString());
sub('Generator pool (restricted tier 1)', genPool.size.toLocaleString());
sub('Unused in full-parser pool', unused.length.toLocaleString());
sub('Unused in generator pool', unusedGen.length.toLocaleString());
console.log();
const genHeadroom = genPool.size - conceptCount;
sub('Generator headroom vs active concepts',
  `${genPool.size} pool − ${conceptCount} needed = ${genHeadroom >= 0 ? '+' : ''}${genHeadroom}`);

// ── Section 11: Invalid roots ─────────────────────────────────────────────────
section('11  INVALID ROOTS AUDIT');

if (invalid.length === 0) {
  console.log('\n  ✓ All primitive roots are valid CV or CVC syllables.');
  console.log('  Migration complete — no CV-CV roots remain.');
} else {
  console.log(`\n  ${invalid.length} root(s) are CV-CV (disyllabic) and must be migrated:\n`);
  console.log(`  ${'Concept ID'.padEnd(18)} ${'Spelling'.padEnd(10)} ${'Template'.padEnd(10)} Status  Concept gloss`);
  console.log(`  ${hr}`);
  for (const c of invalid) {
    const tpl = c.generation?.template ?? '?';
    const status = c.status.padEnd(8);
    const gloss = (c.concept ?? '').split(';')[0].slice(0, 40);
    console.log(`  ${c.id.padEnd(18)} ${c.spelling.padEnd(10)} ${tpl.padEnd(10)} ${status} ${gloss}`);
  }
  console.log();
  console.log('  Parsed analysis:');
  for (const c of invalid) {
    const p = parseSyllable(c.spelling);
    const why = p?.unparsed
      ? `parseSyllable fails: whole string is unparsed ("${p.unparsed}")`
      : `parsed as onset="${p?.onset}" vowel="${p?.vowel}" coda="${p?.coda}"`;
    console.log(`    ${c.spelling.padEnd(10)} ${why}`);
  }
}

// ── Section 12: Collision / reservation risks ─────────────────────────────────
section('12  COLLISION RISKS & RESERVED FORMS');

console.log(`\n  Grammar particle reserved forms (never assign as roots):`);
console.log(`    ${reservedForms.join('  ')}`);

console.log(`\n  Excluded syllable prefixes (awkward/humorous):`);
console.log(`    ${excludedForms.join('  ')}`);

  console.log(`\n  CVC roots where coda = a single-consonant onset (${codaOnsetOverlap.length} forms):`);
  console.log(`  At compound boundaries these share a letter with the next root's onset`);
  console.log(`  (e.g. "gab"+"ba" → "gabba"; segmenter must not misread the coda).`);
  console.log(`  All are parseable — just the highest ambiguity class. Sample (first 30):`);
  console.log(`    ${codaOnsetOverlap.slice(0, 30).join('  ')}`);

console.log(`\n  Note: onset-only forms without a vowel are already rejected by parseSyllable.`);
console.log(`  Note: vowel-only roots (e.g. "a", "eye") are valid CV — watch for grammar-particle`);
console.log(`        overlap if particles ever expand.`);

// ── Summary ───────────────────────────────────────────────────────────────────
section('SUMMARY');

const safeHeadroom = genPool.size - conceptCount;
const migrateNeeded = invalid.length;

console.log(`
  Design rule:  primitive roots = one syllable, CV or CVC only.
                CV-CV forms are reserved for compounds and derived words.

  Concept demand:    ${conceptCount} primitives ${conceptCountNote}
  Concept inventory: ${conceptCount} primitives ${conceptCountNote}

  ┌─ Pool vs. demand (these are different numbers — do not confuse them)
  │
  │  The POOL is every distinct valid CV/CVC syllable that could exist.
  │  The DEMAND is how many concepts currently need a root spelling.
  │
  │  Generator pool (tier 1, restricted):  ${genPool.size} usable forms
  │  Active concept demand:                ${conceptCount} roots needed
  │  Generator headroom:                   ${safeHeadroom >= 0 ? '+' : ''}${safeHeadroom} forms
  │
  │  Full-parser pool (all CV+CVC):        ${allValidForms.size.toLocaleString()} forms
  │  (Available if generator pool ever exhausts — no code changes needed)
  └─

  CV-CV invalid roots: ${migrateNeeded === 0 ? '0 — migration complete ✓' : `${migrateNeeded} remain — must migrate`}
  Verdict:  ${safeHeadroom >= 20
    ? '✓ SAFE — generator pool has ample headroom for CV/CVC-only rule'
    : safeHeadroom >= 0
      ? '⚠ MARGINAL — feasible; monitor as inventory grows'
      : '✗ GENERATOR POOL TOO SMALL — expand tier 1 or promote tier 2 forms'
  }
`);
