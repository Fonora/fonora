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
}
