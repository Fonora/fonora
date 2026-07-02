/**
 * Tests for research note metadata helpers.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveMetadataFromBody,
  extractDescription,
  extractRelatedSlugs,
  extractTldr,
  formatNoteMarkdownExport,
  nextResearchCode,
  NEW_NOTE_STUB_TEMPLATE,
  RESEARCH_NOTE_SECTIONS,
  researchNoteBodyTemplate,
  resolveResearchNoteTitle,
  slugifyTitle,
  validateNoteMetadata,
} from './research-note-meta.js';
import { githubBlobUrl, githubCommitUrl } from './doc-urls.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function test(name, fn) {
  try {
    fn();
    return { name, ok: true };
  } catch (e) {
    return { name, ok: false, error: e.message };
  }
}

export function runResearchNoteMetaTests() {
  const sampleMd = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'data/research-notes-store.json'),
    'utf8',
  );
  const firstNote = JSON.parse(sampleMd).notes[0];

  return [
    test('slugifyTitle produces kebab-case', () => {
      assert(slugifyTitle('Writing Sound Instead!') === 'writing-sound-instead');
    }),
    test('extractTldr reads blockquote', () => {
      const md = '# Title\n\n> **TL;DR.** A short summary here.\n';
      assert(extractTldr(md) === 'A short summary here.');
    }),
    test('extractDescription prefers TL;DR', () => {
      const md = '# Title\n\n> **TL;DR.** Summary line.\n\nBody paragraph.';
      assert(extractDescription(md) === 'Summary line.');
    }),
    test('extractRelatedSlugs finds research links', () => {
      const md = 'See [RN-02](/research/notes/ipa-pipeline) and /research/notes/foo';
      const related = extractRelatedSlugs(md);
      assert(related.includes('ipa-pipeline'));
      assert(related.includes('foo'));
    }),
    test('deriveMetadataFromBody fills title and abstract', () => {
      const md = '# My Experiment\n\n> **TL;DR.** We tried something new today.';
      const derived = deriveMetadataFromBody(md, {});
      assert(derived.title === 'My Experiment');
      assert(derived.slug === 'my-experiment');
      assert(derived.abstract.includes('We tried'));
    }),
    test('deriveMetadataFromBody keeps metadata title without H1', () => {
      const md = '## Research Question\n\nNo top-level heading here.';
      const derived = deriveMetadataFromBody(md, { title: 'Writing sound instead of spelling' });
      assert(derived.title === 'Writing sound instead of spelling');
    }),
    test('resolveResearchNoteTitle prefers H1 then metadata', () => {
      assert(resolveResearchNoteTitle('# From body', 'From meta') === 'From body');
      assert(resolveResearchNoteTitle('## No H1', 'From meta') === 'From meta');
    }),
    test('nextResearchCode increments', () => {
      assert(nextResearchCode(['RN-01', 'RN-17']) === 'RN-18');
    }),
    test('validateNoteMetadata catches missing fields', () => {
      const errors = validateNoteMetadata({ slug: 'bad slug', status: 'Active' });
      assert(errors.length > 0);
    }),
    test('formatNoteMarkdownExport includes frontmatter', () => {
      const out = formatNoteMarkdownExport({
        metadata: { ...firstNote.metadata, git_commit: 'abc1234def' },
        body: '# Hello\n',
        published_at: '2026-06-20T12:00:00Z',
      });
      assert(out.startsWith('---\n'));
      assert(out.includes('git_commit_url:'));
      assert(out.includes('# Hello'));
    }),
    test('githubCommitUrl links to repo commit', () => {
      assert(githubCommitUrl('abc1234') === 'https://github.com/jamesc137/fonora/commit/abc1234');
    }),
    test('researchNoteBodyTemplate includes RN-01 sections', () => {
      const body = researchNoteBodyTemplate('Test');
      for (const section of RESEARCH_NOTE_SECTIONS) {
        assert(body.includes(`## ${section}`), `missing ## ${section}`);
      }
      assert(!body.includes('TL;DR'), 'expanded template should not include TL;DR blockquote');
    }),
    test('NEW_NOTE_STUB_TEMPLATE keeps short seed sections', () => {
      assert(NEW_NOTE_STUB_TEMPLATE.includes('## The question'));
      assert(NEW_NOTE_STUB_TEMPLATE.includes('## The question that followed'));
    }),
  ];
}
