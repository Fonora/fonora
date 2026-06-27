#!/usr/bin/env node
/**
 * Generate ~100 Fonoran root candidates with phonetic forms for human review.
 * Words first — semantic refinement follows approval.
 *
 * Run: npm run fonoran:root-candidates
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { romanToIpa } from './fonoran-pronunciation.js';
import {
  assignRoots,
  buildSyllablePool,
  easeLabel,
  pronunciationEaseScore,
  usefulnessLabel,
} from './fonoran-root-sound-assign.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Converged source of truth: 99 core primitives + curated extended dimensions.
const SEMANTIC_PATH = join(ROOT, 'data/fonoran-concept-inventory.json');
const PHONETICS_PATH = join(ROOT, 'data/fonoran-primitive-roots-config.json');
const OUTPUT_PATH = join(ROOT, 'data/fonoran-root-candidates.json');

function buildReason(concept, highLeverage) {
  const lead = concept.gloss.split(';')[0].trim();
  if (highLeverage.has(concept.id)) {
    return `High-leverage root: ${lead}. Appears frequently inside compounds.`;
  }
  return `Fundamental ${concept.domain} concept: ${lead}. Cannot be naturally reduced into simpler Fonoran roots.`;
}

function semanticUsefulness(concept, highLeverage, rank, total) {
  if (highLeverage.has(concept.id)) return 5;
  const t = rank / total;
  if (['being', 'action', 'ontology', 'element'].includes(concept.domain) && t < 0.4) return 4;
  if (t < 0.6) return 4;
  if (t < 0.85) return 3;
  return 2;
}

function assignmentToCandidate(assignment, rank, total, highLeverage) {
  const spelling = assignment.root;
  const template = assignment.scoring?.template ?? 'CV';
  const cost = assignment.scoring?.phonetic_cost;
  const pronScore = pronunciationEaseScore(cost, template);
  const useScore = semanticUsefulness(assignment, highLeverage, rank, total);

  return {
    id: assignment.id,
    spelling,
    ipa: romanToIpa(spelling),
    concept: assignment.gloss,
    domain: assignment.domain,
    reason: buildReason(assignment, highLeverage),
    pronunciation_ease: pronScore,
    pronunciation_ease_label: easeLabel(pronScore),
    semantic_usefulness: useScore,
    semantic_usefulness_label: usefulnessLabel(useScore),
    priority: assignment.priority,
    status: 'pending',
    review: {
      approved_at: null,
      rejected_at: null,
      edited_at: null,
      note: null,
    },
    generation: {
      phonetic_cost: cost,
      template,
      tier: assignment.scoring?.tier ?? null,
    },
  };
}

export async function generateRootCandidates({ preserveReview = true } = {}) {
  const semantic = JSON.parse(await readFile(SEMANTIC_PATH, 'utf8'));
  const phoneticsConfig = JSON.parse(await readFile(PHONETICS_PATH, 'utf8'));

  const productiveIds = new Set(Object.keys(semantic.productive_dimensions ?? {}));
  const highLeverage = new Set([
    'person', 'self', 'thing', 'move', 'change', 'equal', 'strong', 'bond', 'conflict',
    'know', 'give', 'take', 'speak', 'water', 'life', 'empty', 'before', 'after',
    ...productiveIds,
  ]);
  const primitives = semantic.primitives ?? [];
  const concepts = primitives.map((p, i) => ({
    id: p.id,
    gloss: p.gloss,
    domain: p.domain,
    priority: 1000 - i,
  }));

  const pool = buildSyllablePool(phoneticsConfig);
  if (pool.length < concepts.length) {
    throw new Error(`Syllable pool (${pool.length}) smaller than concepts (${concepts.length})`);
  }

  let existing = null;
  try {
    existing = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  } catch {
    existing = null;
  }

  const lockedRoots = {};
  const preserved = new Map();

  if (preserveReview && existing?.candidates) {
    for (const c of existing.candidates) {
      if (c.status === 'approved') {
        lockedRoots[c.id] = c.spelling;
        preserved.set(c.id, c);
      } else if (c.status === 'rejected') {
        preserved.set(c.id, c);
      }
    }
  }

  const assignments = assignRoots(concepts, pool, phoneticsConfig, { lockedRoots });
  const total = assignments.length;

  const candidates = assignments.map((a, i) => {
    const preservedEntry = preserved.get(a.id);
    if (preservedEntry?.status === 'approved' || preservedEntry?.status === 'rejected') {
      return preservedEntry;
    }
    return assignmentToCandidate(a, i + 1, total, highLeverage);
  });

  const summary = {
    total: candidates.length,
    pending: candidates.filter(c => c.status === 'pending').length,
    approved: candidates.filter(c => c.status === 'approved').length,
    rejected: candidates.filter(c => c.status === 'rejected').length,
  };

  const output = {
    version: '1.0-root-workflow',
    status: 'proposal',
    generated_at: new Date().toISOString(),
    philosophy: {
      premise: 'Words come first. The semantic network evolves after roots are approved.',
      workflow: 'Generate candidates → human review → canonical roots → compounds later',
      source_concepts: 'data/fonoran-concept-inventory.json',
    },
    summary,
    candidates,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  return output;
}

async function main() {
  const output = await generateRootCandidates();
  console.log(`Root candidates: ${output.summary.total} (${output.summary.pending} pending, ${output.summary.approved} approved, ${output.summary.rejected} rejected)`);
  console.log(`Top five: ${output.candidates.slice(0, 5).map(c => `${c.spelling}=${c.id}`).join(', ')}`);
  console.log(`Written: ${OUTPUT_PATH}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
