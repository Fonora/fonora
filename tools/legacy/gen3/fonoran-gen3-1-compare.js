#!/usr/bin/env node
/** Regenerate Gen 3.1 roots + comparison audit snippet */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeAmbiguity, auditScores } from '../../fonoran-gen3-readability.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

async function load(name) {
  return JSON.parse(await readFile(join(ROOT, 'data', name), 'utf8'));
}

async function main() {
  const g3 = await load('fonoran-gen3-roots.json');
  const g31 = await load('fonoran-gen3-1-roots.json');

  const score = (data) => {
    const w = analyzeAmbiguity(data.inventory, data.derivations);
    return { warnings: w, scores: auditScores(data.inventory, data.derivations, w) };
  };

  const s3 = score(g3);
  const s31 = score(g31);

  console.log('Gen3 vs Gen3.1');
  console.table({
    Gen3: s3.scores,
    'Gen3.1': s31.scores,
  });
  console.log('Gen3.1 grid repair:', g31.grid_repair_rate + '%');
  console.log('Gen3.1 max rhyme:', g31.max_rhyme_count);
}

main();
