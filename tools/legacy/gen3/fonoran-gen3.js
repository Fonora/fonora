#!/usr/bin/env node
/**
 * Fonoran Gen 3: grid-native root generator.
 * Roots emerge from DDA coordinates only. No human-language collision repair.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CONFIG_PATH = join(ROOT, 'data', 'fonoran-gen3-config.json');
const OUTPUT_PATH = join(ROOT, 'data', 'fonoran-gen3-roots.json');

const MANNER_ORDER = ['plain', 'voice', 'friction', 'nasal', 'glide'];
const PLACE_IDS = ['1', '2', '3', '4', '5'];

function primitiveHash(id) {
  let h = 0;
  for (const c of id) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function wrapPlace(n) {
  return String(((n - 1) % 5 + 5) % 5 + 1);
}

function rotateManner(m, steps) {
  return MANNER_ORDER[(MANNER_ORDER.indexOf(m) + steps) % MANNER_ORDER.length];
}

function rotatePlace(p, steps) {
  return PLACE_IDS[(PLACE_IDS.indexOf(p) + steps) % PLACE_IDS.length];
}

const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ee', 'ae', 'oh'];

function rotateVowel(v, steps) {
  const i = VOWELS.indexOf(v);
  return VOWELS[((i >= 0 ? i : 0) + steps) % VOWELS.length];
}

function resolveCoordinates(primitive, config) {
  const place = config.depth_to_place[primitive.D];
  const manner = config.mode_to_manner[primitive.M];
  const vowel = config.aspect_vowel[primitive.A];
  return { place, manner, vowel, D: primitive.D, M: primitive.M, A: primitive.A };
}

function buildSyllable(onset, vowel) {
  if (!onset) return null;
  return onset + vowel;
}

function generateRoot(primitive, config, manner, place, vowel) {
  const onset = config.sound_grid[manner]?.[place] ?? null;
  const root = buildSyllable(onset, vowel);
  return {
    root,
    coordinates: {
      id: primitive.id,
      gloss: primitive.gloss,
      D: primitive.D,
      M: primitive.M,
      A: primitive.A,
      place,
      manner,
      vowel,
      fonora_onset: onset,
      notation: `⟨${primitive.D}, ${primitive.M}, ${primitive.A}⟩`,
    },
  };
}

function generateWithRepair(primitive, config, usedRoots) {
  let { place, manner, vowel } = resolveCoordinates(primitive, config);
  const maxSteps = config.generation.max_repair_steps;
  let step = 0;
  let result = generateRoot(primitive, config, manner, place, vowel);

  while (step < maxSteps && (!result.root || usedRoots.has(result.root))) {
    step++;
    if (step <= 7) manner = rotateManner(manner, 1);
    else if (step <= 14) place = rotatePlace(place, 1);
    else vowel = rotateVowel(vowel, 1);
    result = generateRoot(primitive, config, manner, place, vowel);
  }

  if (result.root) usedRoots.add(result.root);
  return { ...result, repair_steps: step };
}

function composeDerivation(example, rootMap) {
  const parts = example.composition.map(id => ({
    id,
    root: rootMap[id]?.root ?? null,
    notation: rootMap[id]?.coordinates?.notation ?? null,
  }));
  const compound = parts.every(p => p.root) ? parts.map(p => p.root).join('') : null;
  return { ...example, parts, compound };
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const usedRoots = new Set();
  const inventory = config.primitives.map(p => generateWithRepair(p, config, usedRoots));

  const rootMap = Object.fromEntries(
    inventory.map(row => [row.coordinates.id, row]),
  );

  const derivations = config.example_derivations.map(ex => composeDerivation(ex, rootMap));

  const output = {
    version: config.version,
    generated_at: new Date().toISOString(),
    philosophy: config.philosophy.premise,
    coordinate_system: config.coordinate_system.name,
    primitive_count: inventory.length,
    unique_roots: usedRoots.size,
    inventory: inventory.map(({ root, coordinates, repair_steps }) => ({
      root,
      id: coordinates.id,
      gloss: coordinates.gloss,
      coordinates,
      repair_steps,
    })),
    derivations,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');

  const args = process.argv.slice(2);
  if (args.includes('--json')) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`Gen 3: ${output.primitive_count} primitives → ${output.unique_roots} unique roots`);
  console.log(`Written: ${OUTPUT_PATH}`);
  if (args.includes('--derivations')) {
    for (const d of derivations) {
      console.log(`${d.concept}: ${d.composition.join('+')} → ${d.compound} (${d.gloss})`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
