#!/usr/bin/env node
/**
 * Fail CI when the committed lexicon breaks one of its own rules.
 *
 *   node scripts/fonoran-verify-invariants.js
 *
 * Waived findings are printed but do not fail: they are recorded exceptions in the
 * seed, kept visible so they get resolved rather than forgotten.
 */
import { runInvariants } from '../tools/fonoran-invariants.js';

const { violations, advisories, waived, rules } = await runInvariants();

console.log(`Lexicon invariants: ${rules.length} rule(s) — ${rules.join(', ')}.`);

for (const w of waived) {
  console.log(`  waived  ${w.subject} (${w.concept}): ${w.detail}`);
  if (w.reason) console.log(`          ${w.reason}`);
}

for (const a of advisories) {
  console.log(`  review  ${a.concept}: ${a.detail}`);
}
if (advisories.length) {
  console.log(`  ${advisories.length} advisory finding(s) need a human read; they do not fail this check.`);
}

if (!violations.length) {
  console.log(waived.length
    ? `✓ no new violations. ${waived.length} recorded exception(s) still open.`
    : '✓ no violations.');
  process.exit(0);
}

console.error(`\n✗ ${violations.length} invariant violation(s):\n`);
for (const v of violations) {
  console.error(`  [${v.rule}] ${v.subject} (${v.concept}): ${v.detail}`);
}
console.error(`
A spelling here breaks a rule the project already wrote down. Either respell the
concept, or, if the exception is deliberate, record it under known_violations in
data/fonoran-primitive-roots-config.json with a reason so it stays visible.
`);
process.exit(1);
