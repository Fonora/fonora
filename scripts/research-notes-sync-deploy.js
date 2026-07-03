#!/usr/bin/env node
/**
 * @deprecated Published notes are served from docs/research-notes/*.md at runtime.
 * Kept for optional editor re-enable via RESEARCH_NOTES_EDITOR_ENABLED=1.
 */
import '../load-env.js';
import { syncResearchNotesFromSeed, closeResearchNotesStore } from '../tools/research-notes-store.js';

try {
  const result = await syncResearchNotesFromSeed();
  if (result.skipped) {
    console.log(`Research notes deploy sync skipped: ${result.reason}`);
    process.exit(0);
  }
  console.log(`Research notes deploy sync: upserted ${result.synced} published note(s)${result.pruned ? `, pruned ${result.pruned} superseded slug(s)` : ''} from ${result.source || 'seed'}`);
  process.exit(0);
} catch (err) {
  console.error('Research notes deploy sync failed:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeResearchNotesStore();
}
