#!/usr/bin/env node
/**
 * Vowel readability measurement — no mapping changes, report only.
 * Run: node scripts/vowel-readability-report.js
 *      npm run test:vowels
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runVowelReadabilitySuite, formatVowelReadabilityReport } from '../js/vowel-readability-suite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'reports', 'vowel-readability-report.md');

const result = await runVowelReadabilitySuite();
const report = formatVowelReadabilityReport(result);

writeFileSync(outPath, report, 'utf8');
console.log(report);
console.log(`\nReport written to ${outPath}`);
