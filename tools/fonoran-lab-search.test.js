import assert from 'node:assert/strict';
import { labEntryMatchesQuery } from './fonoran-lab-search.js';

export function runFonoranLabSearchTests() {
  assert.equal(
    labEntryMatchesQuery('other', {
      spelling: 'so',
      english: 'parent',
      gloss: 'a mother or father',
      aliases: ['parent', 'a mother or father', 'mother', 'father', 'parents'],
      concept_id: 'parent',
    }),
    false,
    'other must not match mother inside parent aliases',
  );

  assert.equal(
    labEntryMatchesQuery('other', { spelling: 'nu', english: 'other', concept_id: 'other' }),
    true,
    'other matches the other root by english label',
  );

  assert.equal(
    labEntryMatchesQuery('mother', {
      spelling: 'so',
      english: 'parent',
      aliases: ['mother', 'father'],
    }),
    true,
    'mother matches parent alias token',
  );

  assert.equal(
    labEntryMatchesQuery('so', { spelling: 'so', english: 'parent' }),
    true,
    'fonoran spelling substring still works',
  );

  assert.equal(
    labEntryMatchesQuery('oth', { spelling: 'nu', english: 'other' }),
    true,
    'english token prefix match',
  );

  assert.equal(
    labEntryMatchesQuery('ye', { spelling: 'yeba', english: 'river' }),
    true,
    'ye substring matches yeba without trailing space',
  );

  assert.equal(
    labEntryMatchesQuery('ye ', { spelling: 'ye', english: 'water' }),
    true,
    'ye with trailing space exact-matches ye',
  );

  assert.equal(
    labEntryMatchesQuery('ye ', { spelling: 'yeba', english: 'river' }),
    false,
    'ye with trailing space must not match yeba',
  );

  assert.equal(
    labEntryMatchesQuery('ye ', { spelling: 'mo', english: 'water' }),
    false,
    'trailing-space mode ignores english labels',
  );

  assert.equal(
    labEntryMatchesQuery('ᵔ∪⚬⌓', {
      spelling: 'ye',
      english: 'water',
      script: 'ᵔ∪⚬⌓',
    }),
    true,
    'fonora script substring matches morph script',
  );

  assert.equal(
    labEntryMatchesQuery('⚬⏌ᵔ∪', {
      spelling: 'moyi',
      english: 'again',
      scripts: ['⚬⊃ᵔ∪⚬∩', '⚬⊃⚬⏌ᵔ∪⚬∩'],
    }),
    true,
    'fonora script matches phonetic alt script list',
  );

  assert.equal(
    labEntryMatchesQuery('ᵔ∪⚬⌓', { spelling: 'mo', english: 'do' }),
    false,
    'unrelated entry does not match script query',
  );
}
