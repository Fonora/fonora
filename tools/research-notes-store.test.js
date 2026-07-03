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

  const { saveDraft, publishNote, readForEditor, readPublished, listPublished, syncResearchNotesFromSeed, publishedNotesFromSeed, warmPublishedCache, findSupersededPublishedSlugs } = await import(
    `./research-notes-store.js?test=${Date.now()}`
  );

  const results = [];

  try {
    results.push(
      await test('saveDraft and publishNote round-trip (editor store)', async () => {
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
        const row = await readForEditor('test-note');
        assert(row?.workflow === 'published');
        assert(row?.body.includes('Test Note'));
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
      await test('buildPublishedNotesFromMarkdown includes RN-22 and RN-23', async () => {
        const { buildPublishedNotesFromMarkdown } = await import('./research-notes-md-sync.js');
        const notes = await buildPublishedNotesFromMarkdown();
        assert(notes.length >= 23);
        const slugs = notes.map((n) => n.slug);
        assert(slugs.includes('mouth-intuitive-vowel-glyphs'));
        assert(slugs.includes('vowel-glide-phantom-diphthongs'));
        assert(slugs.includes('beginner-core-remediation'));
        for (const note of notes) {
          assert(note.workflow === 'published');
          assert(note.body.trim().length > 100);
        }
      }),
    );

    results.push(
      await test('findSupersededPublishedSlugs prunes legacy slugs with same code', async () => {
        const canonicalByCode = new Map([
          ['RN-04', 'vowels-as-grammar-the-v3-rebuild'],
          ['RN-06', 'hunting-ambiguity-in-the-script'],
        ]);
        const rows = [
          {
            slug: 'vowel-grammar-v3',
            workflow: 'published',
            metadata: { code: 'RN-04' },
          },
          {
            slug: 'vowels-as-grammar-the-v3-rebuild',
            workflow: 'published',
            metadata: { code: 'RN-04' },
          },
          {
            slug: 'collision-audit',
            workflow: 'published',
            metadata: { code: 'RN-06' },
          },
          {
            slug: 'prod-only-draft',
            workflow: 'draft',
            metadata: { code: 'RN-99' },
          },
          {
            slug: 'legacy-no-markdown',
            workflow: 'published',
            metadata: { code: 'RN-88' },
          },
        ];
        const pruned = findSupersededPublishedSlugs(rows, canonicalByCode);
        assert(pruned.length === 2);
        assert(pruned.includes('vowel-grammar-v3'));
        assert(pruned.includes('collision-audit'));
        assert(!pruned.includes('vowels-as-grammar-the-v3-rebuild'));
        assert(!pruned.includes('legacy-no-markdown'));
      }),
    );

    results.push(
      await test('syncResearchNotesFromSeed is deprecated (markdown canonical)', async () => {
        const result = await syncResearchNotesFromSeed();
        assert(result.skipped === true);
        assert(result.reason.includes('deprecated'));
      }),
    );

    results.push(
      await test('warmPublishedCache loads published notes from markdown', async () => {
        const warmed = await warmPublishedCache();
        assert(warmed.count >= 23);
        const list = await listPublished();
        assert(list.length >= 23);
        const codes = new Set(list.map((n) => n.code));
        assert(codes.size === list.length, 'each code appears once');
        const rn03 = list.find((n) => n.code === 'RN-03');
        assert(rn03?.status === 'Superseded');
        const pub = await readPublished('writing-sound-instead-of-spelling');
        assert(pub?.body.includes('Writing sound'));
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
