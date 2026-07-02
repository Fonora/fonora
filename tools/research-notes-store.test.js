/**
 * Research notes store round-trip tests (JSON mode).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      return { name, ok: true };
    } catch (e) {
      return { name, ok: false, error: e.message };
    }
  })();
}

export async function runResearchNotesStoreTests() {
  const prevStorage = process.env.FONORAN_STORAGE;
  const prevSkip = process.env.FONORAN_SKIP_JSON_MIRROR;
  const dir = await mkdtemp(join(tmpdir(), 'fonora-rn-'));
  process.env.FONORAN_STORAGE = 'json';
  process.env.FONORAN_SKIP_JSON_MIRROR = '1';
  process.env.RESEARCH_NOTES_STORE_PATH = join(dir, 'research-notes-store.json');

  const { saveDraft, publishNote, readPublished, listPublished, syncResearchNotesFromSeed, publishedNotesFromSeed, warmPublishedCache } = await import(
    `./research-notes-store.js?test=${Date.now()}`
  );

  const results = [];

  try {
    results.push(
      await test('saveDraft and publishNote round-trip', async () => {
        await saveDraft(
          'test-note',
          {
            metadata: {
              slug: 'test-note',
              code: 'RN-99',
              title: 'Test Note',
              status: 'Active',
              phase: 'phase-3',
              date: '2026-06-30',
              description: 'A test description for the note.',
              abstract: 'A test description.',
              related: [],
              docs: [],
              tools: [],
              source: [],
            },
            body: '# Test Note\n\n> **TL;DR.** Testing.',
          },
          'test@local',
        );
        await publishNote('test-note', 'test@local');
        const pub = await readPublished('test-note');
        assert(pub?.body.includes('Test Note'));
        const list = await listPublished();
        assert(list.some((n) => n.slug === 'test-note'));
      }),
    );

    results.push(
      await test('publishedNotesFromSeed keeps published workflow only', async () => {
        const filtered = publishedNotesFromSeed([
          { workflow: 'published', slug: 'a' },
          { workflow: 'draft', slug: 'b' },
          { workflow: 'published', slug: 'c' },
        ]);
        assert(filtered.length === 2);
        assert(filtered.every((n) => n.workflow === 'published'));
      }),
    );

    results.push(
      await test('syncResearchNotesFromSeed skips in json mode', async () => {
        const result = await syncResearchNotesFromSeed();
        assert(result.skipped === true);
        assert(result.reason === 'json mode');
      }),
    );

    results.push(
      await test('warmPublishedCache loads published notes into memory', async () => {
        const warmed = await warmPublishedCache();
        assert(warmed.count >= 1);
        const list = await listPublished();
        assert(list.some((n) => n.slug === 'test-note'));
        const pub = await readPublished('test-note');
        assert(pub?.body.includes('Test Note'));
      }),
    );
  } finally {
    process.env.FONORAN_STORAGE = prevStorage;
    process.env.FONORAN_SKIP_JSON_MIRROR = prevSkip;
    delete process.env.RESEARCH_NOTES_STORE_PATH;
    await rm(dir, { recursive: true, force: true });
  }

  return results;
}
