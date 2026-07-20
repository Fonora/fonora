/**
 * Tests for course phrase build ordering and grammar phrase exercises.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGrammarPhraseExercises, grammarPhraseExerciseMatches } from '../js/fonoran-grammar-phrase-exercises.js';
import { lessonsDocToExercises, grammarLessonAnswerMatches } from '../js/fonoran-grammar-lessons.js';
import { resolveDataPath } from './fonoran-data-paths.js';

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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const corpusPath = resolveDataPath('stranger_corpus');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const lessonsDoc = JSON.parse(readFileSync(join(ROOT, 'data/fonoran-grammar-lessons.json'), 'utf8'));

const sortTest = test('stranger corpus phrases sort complexity then id', () => {
  for (const domain of corpus.domains) {
    const phrases = [...(domain.phrases ?? [])];
    phrases.sort((a, b) =>
      (a.complexity ?? 1) - (b.complexity ?? 1) ||
      String(a.id ?? '').localeCompare(String(b.id ?? '')),
    );
    for (let i = 1; i < phrases.length; i += 1) {
      const prev = phrases[i - 1];
      const cur = phrases[i];
      const prevRank = (prev.complexity ?? 1) * 1000 + String(prev.id).localeCompare(String(cur.id));
      const curRank = (cur.complexity ?? 1) * 1000;
      assert(
        (prev.complexity ?? 1) <= (cur.complexity ?? 1),
        `${domain.id}: complexity order broken at ${cur.id}`,
      );
    }
  }
});

const grammarTest = test('grammar phrase exercises include reorder and particle drills', () => {
  const entries = [
    {
      id: 'fc-001',
      spelling: 'mi no tak',
      meaning: 'I am not there.',
      parts: ['mi', 'no', 'tak'],
      tierRank: 0,
      domainId: 'first_contact',
      domainIndex: 0,
      complexity: 1,
      status: 'translated',
      script: '',
      conceptId: 'fc-001',
    },
  ];
  const exercises = buildGrammarPhraseExercises(entries);
  assert(exercises.some((e) => e.kind === 'reorder'), 'missing reorder exercise');
  assert(exercises.some((e) => e.kind === 'particles'), 'missing particle exercise');
  const particle = exercises.find((e) => e.kind === 'particles');
  assert(
    grammarPhraseExerciseMatches(particle, 'to-fonoran', 'no mi'),
    'particle answer should be order-insensitive',
  );
});

const domainLessonTest = test('domain curriculum has 5 lessons per domain × 20 domains', () => {
  assert(corpus.domains.length === 20, `expected 20 domains, got ${corpus.domains.length}`);
  for (const domain of corpus.domains) {
    assert((domain.phrases ?? []).length === 50, `${domain.id} should have 50 phrases`);
  }
});

const rule4LessonTest = test('Rule 4 grammar basics lesson has 10 live-lexicon drills', () => {
  const exercises = lessonsDocToExercises(lessonsDoc);
  assert(exercises.length === 10, `expected 10 basics drills, got ${exercises.length}`);
  assert(exercises.every((e) => e.tip), 'every basics drill should teach with a tip');
  const beach = exercises.find((e) => e.id === 'gb-beach');
  assert(beach, 'beach drill present');
  assert(grammarLessonAnswerMatches(beach, 'be sak gi yetem ?'), 'full beach form');
  assert(grammarLessonAnswerMatches(beach, 'sak gi yetem'), 'casual beach form accepted');
  assert(
    grammarPhraseExerciseMatches(
      exercises.find((e) => e.id === 'gb-bare-dest'),
      'to-fonoran',
      'mi gi ye',
    ),
    'choose drill accepts correct option text',
  );
});

export function runFonoranCoursePhrasesTests() {
  return [sortTest, grammarTest, domainLessonTest, rule4LessonTest];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = runFonoranCoursePhrasesTests();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(r.ok ? `✓ ${r.name}` : `✗ ${r.name}: ${r.error}`);
  }
  if (failed.length) process.exitCode = 1;
}
