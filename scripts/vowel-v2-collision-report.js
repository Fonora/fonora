#!/usr/bin/env node
/**
 * V1 vs V2 collision comparison report.
 * Run: node scripts/vowel-v2-collision-report.js
 *      npm run test:v2-collisions
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runV2CollisionSuite,
  runMultilingualRegression,
  formatV2CollisionReport,
} from '../js/vowel-v2-collision-suite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'reports', 'vowel-v2-collision-report.md');

const suite = await runV2CollisionSuite();
const report = formatV2CollisionReport(suite);

const ml = await runMultilingualRegression();
console.log(`Multilingual regression: V1 fallbacks ${ml.v1Fallbacks}/${ml.total}, V2 fallbacks ${ml.v2Fallbacks}/${ml.total}`);

writeFileSync(outPath, report, 'utf8');
console.log(report);
console.log(`\nReport written to ${outPath}`);
