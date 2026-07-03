#!/usr/bin/env node
/**
 * Heroku release phase: upsert published research notes from git seed into Postgres.
 * Usage: node scripts/research-notes-sync-deploy.js
 */
import '../load-env.js';
import { syncResearchNotesFromSeed, closeResearchNotesStore } from '../tools/research-notes-store.js';

try {
  const result = await syncResearchNotesFromSeed();
  if (result.skipped) {
    console.log(`Research notes deploy sync skipped: ${result.reason}`);
    process.exit(0);
  }
  console.log(`Research notes deploy sync: upserted ${result.synced} published note(s) from ${result.source || 'seed'}`);
  process.exit(0);
} catch (err) {
  console.error('Research notes deploy sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeResearchNotesStore();
}
