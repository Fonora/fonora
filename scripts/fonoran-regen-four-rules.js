#!/usr/bin/env node
/**
 * Deterministic four-rules compound regeneration (no LLM).
 *
 *   npm run fonoran:regen:four-rules -- --dry-run
 *   npm run fonoran:regen:four-rules -- --apply
 *   npm run fonoran:regen:four-rules -- --apply --concepts=law,government
 */

import '../load-env.js';
import { runFourRulesRegen } from '../tools/fonoran-regen-four-rules.js';

const result = await runFourRulesRegen(process.argv.slice(2));
if (!result.wrote && process.argv.includes('--apply')) {
  process.exit(1);
}
