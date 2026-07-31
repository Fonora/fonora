#!/usr/bin/env node
/**
 * Fonoran Primitive Root Capacity — Tiered Pool Expansion Test
 *
 * Design rule under test:
 *   - Primitive roots must be exactly one syllable.
 *   - Allowed templates: CV and CVC.
 *   - CV-CV (disyllabic) forms are INVALID for primitive roots.
 *
 * Tests 5 generator pool tiers and reports capacity at each level
 * against both the current (118) and stress-test (251) concept targets.
 *
 * Run: npm run fonoran:root-capacity:tiers
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSyllable, isValidSyllable, ONSETS, VOWELS, CODAS } from '../tools/fonoran-pronunciation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Load data ──────────────────────────────────────────────────────────────────

const config       = JSON.parse(await readFile(join(ROOT, 'data/fonoran-primitive-roots-config.json'), 'utf8'));
const candidates   = JSON.parse(await readFile(join(ROOT, 'data/fonoran-root-candidates.json'), 'utf8'));
const conceptInv   = JSON.parse(await readFile(join(ROOT, 'data/fonoran-concept-inventory.json'), 'utf8'));
let stressConcepts = null;
try {
  stressConcepts = JSON.parse(await readFile(join(ROOT, 'data/fonoran-stress-test-concepts.json'), 'utf8'));
} catch { /* optional */ }

// Currently assigned (non-rejected) spellings
const assignedSpellings = new Set(
  (candidates.candidates ?? [])
    .filter(c => c.status !== 'rejected')
    .map(c => c.spelling)
);

// Invalid under CV/CVC rule (CV-CV roots currently approved)
const invalidSpellings = new Set(
  (candidates.candidates ?? [])
    .filter(c => c.status !== 'rejected')
    .filter(c => { const p = parseSyllable(c.spelling); return !p || p.unparsed; })
    .map(c => c.spelling)
);

// Valid currently assigned (no invalid CV-CV)
const validAssignedSpellings = new Set(
  [...assignedSpellings].filter(sp => !invalidSpellings.has(sp))
);

// ── Reserved / excluded (from config) ─────────────────────────────────────────

const RESERVED_SET  = new Set(config.reserved_particles.forms.map(s => s.toLowerCase()));
const EXCLUDED_PFXS = config.excluded_syllables.forms.map(s => s.toLowerCase());

function isBlocked(sp) {
  if (RESERVED_SET.has(sp)) return 'reserved-particle';
  if (EXCLUDED_PFXS.some(ex => sp === ex || sp.startsWith(ex))) return 'excluded-awkward';
  return null;
}

// ── Phoneme inventories ────────────────────────────────────────────────────────

// Full parser inventories, imported from fonoran-pronunciation.js so they cannot drift.
const ALL_ONSETS_FULL = ONSETS;
const ALL_VOWELS_FULL = VOWELS;
const ALL_CODAS_FULL = CODAS;

// Tier sub-inventories
const ONSETS_CURRENT   = ['b','d','f','g','k','l','m','n','s','t','h','w','y','p','ch','sh','j','r'];
const ONSETS_EXPANDED  = [...ONSETS_CURRENT, 'v','z','x','kh','gh','th','dh','ñ','ng']; // all parser onsets

const VOWELS_CURRENT   = ['a','e','i','o','u'];
const VOWELS_OPTIONAL  = ['a','e','i','o','u','ay','ee','oh'];

const CODAS_PREFERRED  = ['n','m','t','k','s','l'];
const CODAS_EXPANDED   = ['n','m','t','k','s','l','r','d','g','b','z','v'];
const CODAS_OPTIONAL   = ['n','m','t','k','s','l','r','d','g','b','z','v','ch','sh','ng'];

// ── Pool builder ───────────────────────────────────────────────────────────────

function buildPool({ onsets, vowels, codas, prevPool = null }) {
  const cv  = new Set();
  const cvc = new Set();

  // Vowel-only CV forms (no onset)
  for (const vowel of vowels) {
    const sp = vowel;
    if (isValidSyllable(sp) && !parseSyllable(sp)?.coda) cv.add(sp);
  }
  // Onset + vowel
  for (const onset of onsets) {
    for (const vowel of vowels) {
      const sp = onset + vowel;
      if (!isValidSyllable(sp)) continue;
      const p = parseSyllable(sp);
      if (p?.coda) continue; // digraph onset + vowel that got absorbed as coda — skip
      cv.add(sp);
    }
  }
  // CVC
  for (const onset of onsets) {
    for (const vowel of vowels) {
      for (const coda of codas) {
        const sp = onset + vowel + coda;
        if (!isValidSyllable(sp)) continue;
        const p = parseSyllable(sp);
        if (!p?.coda) continue;
        cvc.add(sp);
      }
    }
  }

  const allRaw = new Set([...cv, ...cvc]);

  let blockedReserved = 0;
  let blockedExcluded = 0;
  const usable = new Set();

  for (const sp of allRaw) {
    const reason = isBlocked(sp);
    if (reason === 'reserved-particle') { blockedReserved++; continue; }
    if (reason === 'excluded-awkward')  { blockedExcluded++; continue; }
    usable.add(sp);
  }

  // New forms added by this tier over the previous
  const newForms = prevPool
    ? new Set([...usable].filter(sp => !prevPool.usable.has(sp)))
    : usable;

  return { cv, cvc, allRaw, usable, newForms, blockedReserved, blockedExcluded };
}

// Pick sample roots: unused, not invalid CV-CV, preferring short/simple forms
function pickSamples(pool, n = 12) {
  const unused = [...pool.usable]
    .filter(sp => !validAssignedSpellings.has(sp))
    .filter(sp => {
      const p = parseSyllable(sp);
      return p && !p.unparsed && p.vowel; // valid CV or CVC
    });
  // Sort: CV before CVC, then by onset priority, then alphabetically
  const onsetOrder = Object.fromEntries(ONSETS_CURRENT.map((o, i) => [o, i]));
  unused.sort((a, b) => {
    const pa = parseSyllable(a), pb = parseSyllable(b);
    const aCvc = pa.coda ? 1 : 0, bCvc = pb.coda ? 1 : 0;
    if (aCvc !== bCvc) return aCvc - bCvc;
    const aOrd = onsetOrder[pa.onset] ?? 999;
    const bOrd = onsetOrder[pb.onset] ?? 999;
    if (aOrd !== bOrd) return aOrd - bOrd;
    return a.localeCompare(b);
  });
  return unused.slice(0, n);
}

// ── Build all five tiers ───────────────────────────────────────────────────────

const TIERS = [
  {
    label: '1 · Strict current pool',
    onsets: ONSETS_CURRENT,
    vowels: VOWELS_CURRENT,
    codas:  CODAS_PREFERRED,
    risks:  [
      'Tertiary onsets (p, ch, sh, j, r) are slightly less universally accessible',
      'CVC limited to 6 codas: n m t k s l — very clean set, minimal ambiguity',
      'No voiced-stop or voiced-fricative codas — safe for final-devoicing languages',
    ],
  },
  {
    label: '2 · Expanded codas only',
    onsets: ONSETS_CURRENT,
    vowels: VOWELS_CURRENT,
    codas:  CODAS_EXPANDED,
    risks:  [
      'd b g as codas: voiced stops — final-devoicing in many languages (Russian, German, Dutch)',
      '  will sound like t/p/k to many non-English speakers at word-final position',
      'z v as codas: voiced fricatives — same final-devoicing concern',
      'r as coda: rhoticity varies by dialect; "gir" sounds like "gear" in British English',
      'Segmentation risk unchanged — same onset set as tier 1',
    ],
  },
  {
    label: '3 · Expanded onsets + expanded codas',
    onsets: ONSETS_EXPANDED,
    vowels: VOWELS_CURRENT,
    codas:  CODAS_EXPANDED,
    risks:  [
      'v z as onsets: voiced fricatives — accessible but less common cross-linguistically as initials',
      'x (velar fricative /x/): exists in Arabic, Russian, Spanish (ca), not in standard English',
      'kh gh: uvular/velar fricatives — unfamiliar to many English speakers',
      'th dh: dental fricatives — absent in many world languages; two separate sounds (θ vs ð)',
      'ñ (palatal nasal): unfamiliar to English speakers; may read as "nj" or "n"',
      'ng as onset: unusual in English (only in coda); common in Swahili, Vietnamese, Chinese',
      'Digraph onsets increase parser lookup complexity at compound boundaries',
      'Recommendation: prefer v and z from this tier; treat kh/gh/ñ/ng as reserve',
    ],
  },
  {
    label: '4 · Expanded onsets + expanded codas + optional vowels',
    onsets: ONSETS_EXPANDED,
    vowels: VOWELS_OPTIONAL,
    codas:  CODAS_EXPANDED,
    risks:  [
      'ay: diphthong /eɪ/ — clear and globally accessible (similar to Spanish "ei")',
      'ee: long vowel /iː/ — unambiguous in pronunciation, but written digraph can look like CV+CV',
      'oh: diphthong /oʊ/ — familiar to most English speakers; may clash with "o" in some dialects',
      'CVC forms with diphthong vowels (e.g. "been", "bohl") are longer but still one syllable',
      'Digraph vowels require careful design in compound segmentation (longest-match handles this)',
      'All risks from tier 3 also apply',
    ],
  },
  {
    label: '5 · Full parser capacity',
    onsets: ALL_ONSETS_FULL,
    vowels: ALL_VOWELS_FULL,
    codas:  ALL_CODAS_FULL,
    risks:  [
      'ae /æ/: common in English but absent in many other language families',
      'eye /aɪ/, ow /aʊ/, oy /ɔɪ/: English diphthongs — clear but language-specific',
      'Digraph codas ch sh ng: excellent globally; kh gh th dh less so',
      'h as coda: aspirated endings are language-specific (Arabic, Hebrew); rare elsewhere',
      'x as coda: /ks/ cluster — effectively two phonemes, unusual as single coda',
      'Full inventory gives 7,560 forms — vastly more than needed; marginal forms unlikely to be chosen',
      'Parser already handles all of these — no code changes required to support any tier',
    ],
  },
];

// Build pools with previous-tier delta tracking
let prevPool = null;
const builtTiers = [];
for (const tier of TIERS) {
  const pool = buildPool({ ...tier, prevPool });
  builtTiers.push({ ...tier, pool });
  prevPool = pool;
}

// ── Concept demand targets ─────────────────────────────────────────────────────

const DEMAND_ACTIVE = conceptInv.primitives?.length ?? 118; // live generator inventory
const DEMAND_STRESS = stressConcepts?.concepts?.length ?? DEMAND_ACTIVE; // stress-test target

// ── Print helpers ──────────────────────────────────────────────────────────────

const W = 64;
const HR  = '─'.repeat(W);
const HR2 = '═'.repeat(W);

function banner(text) {
  console.log(`\n${HR2}\n ${text}\n${HR2}`);
}
function section(text) {
  console.log(`\n  ┌─ ${text}`);
}
function row(label, value, indent = 2) {
  const pad = ' '.repeat(indent);
  const dots = '.'.repeat(Math.max(1, 40 - label.length - indent));
  console.log(`${pad}  ${label} ${dots} ${value}`);
}
function verdict(headroom, demand) {
  if (headroom >= 50) return `✓ SAFE  (+${headroom} over ${demand})`;
  if (headroom >= 10) return `⚠ MARGINAL  (+${headroom} over ${demand} — tight)`;
  if (headroom >= 0)  return `⚠ BORDERLINE  (+${headroom} — expand soon)`;
  return `✗ INSUFFICIENT  (${headroom} short of ${demand})`;
}

// ── Main report ────────────────────────────────────────────────────────────────

console.log(`\n${HR2}`);
console.log(` FONORAN ROOT CAPACITY — TIERED POOL EXPANSION`);
console.log(` Design rule: primitive roots = one syllable, CV or CVC only`);
console.log(`${HR2}`);

console.log(`
  Concept demand targets
    Active inventory (fonoran-concept-inventory.json) .... ${DEMAND_ACTIVE} concepts
    Stress-test target (deprecated full config list) ..... ${DEMAND_STRESS} concepts

  Currently assigned roots ............................. ${assignedSpellings.size}
    Valid under CV/CVC rule ............................ ${validAssignedSpellings.size}
    INVALID (CV-CV, must migrate) ...................... ${invalidSpellings.size}

  Reserved particles (blocked): ${[...RESERVED_SET].join('  ')}
  Excluded prefixes  (blocked): ${EXCLUDED_PFXS.join('  ')}
`);

// ── Per-tier sections ──────────────────────────────────────────────────────────

for (const { label, pool, onsets, vowels, codas, risks } of builtTiers) {
  banner(label);

  // Inventory
  section('Phoneme inventory');
  console.log(`    Onsets (${onsets.length}): ${onsets.join(' ')}`);
  console.log(`    Vowels (${vowels.length}): ${vowels.join(' ')}`);
  console.log(`    Codas  (${codas.length}): ${codas.join(' ')}`);

  // Counts
  section('Capacity');
  row('CV forms (raw)',  pool.cv.size);
  row('CVC forms (raw)', pool.cvc.size);
  row('Total raw forms', pool.allRaw.size);
  row('Blocked — reserved particles', pool.blockedReserved);
  row('Blocked — excluded/awkward',   pool.blockedExcluded);
  row('USABLE forms (after exclusions)', pool.usable.size);
  if (pool.newForms.size > 0) {
    row(`New forms vs. previous tier`, `+${pool.newForms.size}`);
  }

  // Headroom
  section('Headroom');
  const h118  = pool.usable.size - DEMAND_ACTIVE;
  const h251  = pool.usable.size - DEMAND_STRESS;
  row(`vs. ${DEMAND_ACTIVE} active concepts`, verdict(h118, DEMAND_ACTIVE));
  row(`vs. ${DEMAND_STRESS} stress-test concepts`, verdict(h251, DEMAND_STRESS));

  // Sample roots
  const samples = pickSamples(pool);
  const cvSamples  = samples.filter(sp => !parseSyllable(sp)?.coda);
  const cvcSamples = samples.filter(sp =>  parseSyllable(sp)?.coda);
  section('Sample unused roots from this tier');
  if (cvSamples.length)  console.log(`    CV:  ${cvSamples.join('  ')}`);
  if (cvcSamples.length) console.log(`    CVC: ${cvcSamples.join('  ')}`);

  // Risks
  section('Pronunciation & segmentation risks');
  for (const risk of risks) {
    const indent = risk.startsWith(' ') ? '   ' : '    ';
    console.log(`${indent}${risk}`);
  }
  console.log();
}

// ── Comparative summary table ──────────────────────────────────────────────────

banner('COMPARATIVE SUMMARY');

const colW = [35, 8, 8, 8, 10, 10];
function tableRow(cells) {
  console.log('  ' + cells.map((c, i) => String(c).padEnd(colW[i])).join('  '));
}

console.log();
tableRow(['Tier', 'CV', 'CVC', 'Total', `vs ${DEMAND_ACTIVE}`, `vs ${DEMAND_STRESS}`]);
console.log('  ' + HR);
for (const { label, pool } of builtTiers) {
  const h118 = pool.usable.size - DEMAND_ACTIVE;
  const h251 = pool.usable.size - DEMAND_STRESS;
  tableRow([
    label.slice(0, colW[0] - 1),
    pool.cv.size,
    pool.cvc.size,
    pool.usable.size,
    (h118 >= 0 ? '+' : '') + h118,
    (h251 >= 0 ? '+' : '') + h251,
  ]);
}

// ── Recommendations ────────────────────────────────────────────────────────────

banner('RECOMMENDATIONS');

const tier1 = builtTiers[0].pool;
const tier2 = builtTiers[1].pool;
const tier3 = builtTiers[2].pool;
const tier4 = builtTiers[3].pool;

console.log(`
  Active demand (${DEMAND_ACTIVE} concepts):
    Tier 1 (strict current) already covers ${DEMAND_ACTIVE} with ${tier1.usable.size - DEMAND_ACTIVE >= 0 ? 'headroom of +' + (tier1.usable.size - DEMAND_ACTIVE) : 'shortfall of ' + (tier1.usable.size - DEMAND_ACTIVE)}.
    ✓ No expansion needed for the current inventory.

  Stress-test demand (${DEMAND_STRESS} concepts):
    Tier 1 falls short by ${Math.abs(tier1.usable.size - DEMAND_STRESS)} forms.
    Tier 2 (+ expanded codas r/d/g/b/z/v) ${tier2.usable.size >= DEMAND_STRESS ? `covers it with +${tier2.usable.size - DEMAND_STRESS} headroom` : `still short by ${Math.abs(tier2.usable.size - DEMAND_STRESS)}`}.
    Tier 3 (+ expanded onsets) ${tier3.usable.size >= DEMAND_STRESS ? `covers it with +${tier3.usable.size - DEMAND_STRESS} headroom` : `still short by ${Math.abs(tier3.usable.size - DEMAND_STRESS)}`}.
    Tier 4 (+ ay/ee/oh vowels) ${tier4.usable.size >= DEMAND_STRESS ? `covers it with +${tier4.usable.size - DEMAND_STRESS} headroom` : `still short by ${Math.abs(tier4.usable.size - DEMAND_STRESS)}`}.

  Recommended migration path for the 12 invalid CV-CV roots:
    Use Tier 2 expanded codas (r, d, g, b, z, v) sparingly — prioritize voiced stops
    only for lower-priority concepts where preferred pool is exhausted. Avoid d/b/g/z/v
    codas for high-frequency roots (final-devoicing risk in listener populations).
    Prefer Tier 1 CVC forms with codas n/m/t/k/s/l for the 12 replacements — the pool
    has ${tier1.usable.size - validAssignedSpellings.size} unused usable forms in tier 1 alone.
`);
