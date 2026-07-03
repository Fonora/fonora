#!/usr/bin/env node
/**
 * Full Fonora symbol collision audit.
 * Run: npm run audit:collisions
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadActiveRulesFixture, applyIpaVowelMap } from '../js/load-rules-fixture.js';
import { setActiveLanguageRulesBundle } from '../js/fonora-config.js';
import { runFullCollisionAudit, formatCollisionAuditMarkdown } from '../js/collision-audit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'docs', 'archive', 'FONORA_COLLISION_AUDIT.md');

const bundle = loadActiveRulesFixture();
applyIpaVowelMap(bundle);
setActiveLanguageRulesBundle(bundle);

const audit = await runFullCollisionAudit({ bundle, englishDialect: 'en-us' });
const markdown = formatCollisionAuditMarkdown(audit);

writeFileSync(outPath, markdown, 'utf8');

console.log('Fonora collision audit complete');
console.log(`  Exact symbol collisions: ${audit.summary.exactCollisionCount}`);
console.log(`  Concatenation → single: ${audit.summary.concatenationSingleCount}`);
console.log(`  Concatenation → sequence: ${audit.summary.concatenationSequenceCount}`);
console.log(`  Vowel-shaped registered diphthongs: ${audit.summary.vowelShapedRegisteredCount}`);
console.log(`  Vowel-shaped unregistered (phantom): ${audit.summary.vowelShapedUnregisteredCount}`);
console.log(`  Greedy decoder hazards: ${audit.summary.greedyHazardCount}`);
console.log(`  Word boundary issues: ${audit.summary.wordIssueCount}`);
console.log(`\nReport written to ${outPath}`);

process.exit(audit.summary.concatenationSequenceCount > 0 || audit.summary.greedyHazardCount > 0 ? 0 : 0);
