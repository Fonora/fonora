#!/usr/bin/env node
/**
 * Idempotent maintenance: seed editorial workflow fields on concept-inventory
 * entries that are missing them (e.g. newly added concepts).
 *
 * Adds, without overwriting any values a human/LLM has already set:
 *   - plain_description    everyday gloss (seeded from description)
 *   - primitive_test_note  short rationale (seeded from a heuristic)
 *   - suggested_status     primitive | compound_candidate | unclear
 *   - priority_class       essential | common | useful | extended | questionable
 *
 * The migration only seeds safe defaults. The real editorial pass (rewriting
 * academic glosses, deciding compound candidates) happens afterward in JSON.
 *
 * Run: npm run fonoran:inventory-migrate
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PRIORITY_CLASS } from './fonoran-priority.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY_PATH = join(ROOT, 'data/fonoran-concept-inventory.json');
const COMPOUNDS_PATH = join(ROOT, 'data/fonoran-compounds.json');

// Concepts that appear frequently inside compounds — promoted to essential.
const ESSENTIAL_IDS = new Set([
  'person', 'self', 'thing', 'move', 'change', 'equal', 'strong', 'bond', 'conflict',
  'know', 'give', 'take', 'speak', 'water', 'life', 'empty', 'before', 'after',
]);

// Heuristics that flag an abstract / academic gloss for a human plain-language pass.
const ACADEMIC_PATTERNS = [
  /activated locus/i,
  /discrete emission/i,
  /communicative packet/i,
  /indexed truth/i,
  /generative kernel/i,
  /resonant interior/i,
  /distributed plurality/i,
  /\blocus\b/i,
  /\bpacket\b/i,
  /\bemanation\b/i,
  /ontolog/i,
];

function looksAcademic(text) {
  return ACADEMIC_PATTERNS.some(re => re.test(text ?? ''));
}

function defaultPriorityClass(primitive) {
  if (ESSENTIAL_IDS.has(primitive.id)) return 'essential';
  if (primitive.tier === 'extended') return 'extended';
  return DEFAULT_PRIORITY_CLASS; // 'common'
}

function defaultStatus(primitive, compoundHeads) {
  if (compoundHeads.has(primitive.id)) return 'compound_candidate';
  if (looksAcademic(primitive.description)) return 'unclear';
  return 'primitive';
}

function defaultNote(primitive, status) {
  if (status === 'compound_candidate') {
    return 'A curated compound recipe already exists; consider expressing this as a compound.';
  }
  if (status === 'unclear') {
    return 'Gloss is abstract; rewrite in plain language and confirm it is a true primitive.';
  }
  return 'Fundamental concept; cannot be reduced to simpler Fonoran roots.';
}

export async function migrateInventory({ write = true } = {}) {
  const inventory = JSON.parse(await readFile(INVENTORY_PATH, 'utf8'));
  let compoundHeads = new Set();
  try {
    const compounds = JSON.parse(await readFile(COMPOUNDS_PATH, 'utf8'));
    compoundHeads = new Set((compounds.compounds ?? []).map(c => c.concept));
  } catch {
    compoundHeads = new Set();
  }

  let added = 0;
  let flaggedUnclear = 0;
  let flaggedCompound = 0;

  for (const primitive of inventory.primitives ?? []) {
    let touched = false;

    if (primitive.plain_description == null) {
      primitive.plain_description = primitive.description ?? primitive.gloss ?? '';
      touched = true;
    }
    if (primitive.priority_class == null) {
      primitive.priority_class = defaultPriorityClass(primitive);
      touched = true;
    }
    if (primitive.suggested_status == null) {
      primitive.suggested_status = defaultStatus(primitive, compoundHeads);
      touched = true;
    }
    if (primitive.primitive_test_note == null) {
      primitive.primitive_test_note = defaultNote(primitive, primitive.suggested_status);
      touched = true;
    }

    if (primitive.suggested_status === 'unclear') flaggedUnclear++;
    if (primitive.suggested_status === 'compound_candidate') flaggedCompound++;
    if (touched) added++;
  }

  inventory.version = inventory.version?.includes('editorial')
    ? inventory.version
    : `${inventory.version ?? '1.0'}-editorial`;

  if (write) {
    await writeFile(INVENTORY_PATH, JSON.stringify(inventory, null, 2) + '\n');
  }

  return {
    total: inventory.primitives?.length ?? 0,
    migrated: added,
    flagged_unclear: flaggedUnclear,
    flagged_compound_candidate: flaggedCompound,
  };
}

async function main() {
  const result = await migrateInventory();
  console.log('Concept inventory migration complete.');
  console.log(`  Concepts:               ${result.total}`);
  console.log(`  Fields seeded on:       ${result.migrated}`);
  console.log(`  Flagged unclear:        ${result.flagged_unclear}`);
  console.log(`  Flagged compound cand.: ${result.flagged_compound_candidate}`);
  console.log(`  Written: ${INVENTORY_PATH}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
