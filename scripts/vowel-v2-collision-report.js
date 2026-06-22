#!/usr/bin/env node
/**
 * Vowel minimal-pair collision report (current language-rules.md).
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
console.log(`Multilingual regression: fallbacks ${ml.fallbacks}/${ml.total}`);

writeFileSync(outPath, report, 'utf8');
console.log(report);
console.log(`\nReport written to ${outPath}`);
