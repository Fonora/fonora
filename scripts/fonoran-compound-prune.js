#!/usr/bin/env node
/**
 * Remove compound rows that shadow primitive roots in concept-inventory.
 * Run automatically during fonoran:build; also: npm run fonoran:compound-prune
 */

import { pruneCompoundSeeds } from '../tools/fonoran-compound-prune.js';

const { pruned, remaining, wrote } = await pruneCompoundSeeds({ write: true });

if (!pruned.length) {
  console.log(`No shadow compounds to prune (${remaining} compound rows).`);
} else {
  console.log(`Pruned ${pruned.length} shadow compound(s) → ${remaining} remaining${wrote ? ' (seeds saved)' : ''}.`);
  for (const row of pruned) {
    console.log(`  - ${row.concept}: ${row.reason}`);
  }
}
