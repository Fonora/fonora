#!/usr/bin/env node
/**
 * Report core human concepts vs fonoran-concept-inventory.json coverage.
 */

import '../load-env.js';
import { readDoc } from '../tools/fonoran-store.js';

const CORE_DOMAINS = {
  emotions: ['anger', 'aggression', 'sad', 'depression', 'happy', 'joyful', 'scared', 'fear', 'timid', 'love', 'calm'],
  space: ['up', 'down', 'left', 'right', 'around', 'far', 'close', 'near', 'inside', 'outside'],
  motion: ['move', 'motion', 'include', 'exclude'],
  path_family: ['straight', 'just', 'point', 'path', 'rule'],
  journey: ['journey', 'travel'],
  governance: ['law', 'justice', 'government', 'rule', 'leader'],
};

async function main() {
  const [inventory, compoundsDoc, approved] = await Promise.all([
    readDoc('concept_inventory'),
    readDoc('compounds'),
    readDoc('approved_roots'),
  ]);

  const primitiveIds = new Set((inventory?.primitives ?? []).map(p => p.id));
  const compoundIds = new Set((compoundsDoc?.compounds ?? []).map(c => c.concept));
  const rootIds = new Set((approved?.roots ?? []).map(r => r.id));

  console.log('Fonoran concept gap report\n');

  for (const [domain, ids] of Object.entries(CORE_DOMAINS)) {
    console.log(`## ${domain}`);
    for (const id of ids) {
      const inInv = primitiveIds.has(id);
      const hasRoot = rootIds.has(id);
      const hasCompound = compoundIds.has(id);
      let status = 'missing';
      if (hasCompound) status = 'compound';
      else if (hasRoot || inInv) status = inInv && !hasRoot ? 'inventory-only' : 'root';
      console.log(`  ${id.padEnd(14)} ${status}`);
    }
    console.log('');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
