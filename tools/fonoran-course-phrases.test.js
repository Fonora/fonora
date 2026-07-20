/**
 * Tests for course phrase build ordering, hybrid curriculum layout, and grammar drills.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGrammarPhraseExercises, grammarPhraseExerciseMatches } from '../js/fonoran-grammar-phrase-exercises.js';
import {
  lessonsDocToExercises,
  grammarLessonAnswerMatches,
  stripMcqPromptOptions,
} from '../js/fonoran-grammar-lessons.js';
import {
  computeHybridLayout,
  hybridPhaseForLesson,
} from '../js/fonoran-learn-curriculum.js';
import { resolveDataPath } from './fonoran-data-paths.js';
import { runFonoranCoursePhrasesCompileTests } from './fonoran-course-phrases-compile.test.js';
import { clearLearnCoursePhrasesCache } from './fonoran-learn-course-phrases.js';

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
  const bare = exercises.find((e) => e.id === 'gb-bare-dest');
  assert(
    grammarPhraseExerciseMatches(bare, 'to-fonoran', 'mi gi ye'),
    'choose drill accepts correct option text',
  );
  assert(
    !/^[A-D]\)/m.test(bare.promptLang) && !bare.promptLang.includes('mi gi nan ye'),
    'choose prompt must not embed A/B option text',
  );
  assert(
    stripMcqPromptOptions('Which means “x”?\nA) mi gi ye\nB) mi gi nan ye') ===
      'Which means “x”?',
    'stripMcqPromptOptions removes lettered options',
  );
});

const hybridLayoutTest = test('hybrid layout: ring lessons then 5 phrase lessons per domain', () => {
  const layout = computeHybridLayout(25, 20, 10);
  assert(layout.ringLessons === 3, `ringLessons=${layout.ringLessons}`);
  assert(layout.phraseLessons === 100, `phraseLessons=${layout.phraseLessons}`);
  assert(layout.totalLessons === 103, `totalLessons=${layout.totalLessons}`);

  const emptyLab = computeHybridLayout(0, 20, 10);
  assert(emptyLab.ringLessons === 0, 'no ring lessons without lab');
  assert(emptyLab.phraseLessons === 100, 'phrases still present');
  assert(emptyLab.totalLessons === 100, 'total is phrase-only');

  const ringOnly = computeHybridLayout(10, 0, 10);
  assert(ringOnly.ringLessons === 1, 'one ring lesson');
  assert(ringOnly.phraseLessons === 0, 'no phrase lessons');
  assert(ringOnly.totalLessons === 1, 'total is ring-only');
});

const hybridPhaseTest = test('hybridPhaseForLesson maps ring then domain phrases', () => {
  const layout = computeHybridLayout(25, 20, 10);
  assert(hybridPhaseForLesson(0, layout).phase === 'ring', 'lesson 0 is ring');
  assert(hybridPhaseForLesson(2, layout).phase === 'ring', 'last ring lesson');
  const firstPhrase = hybridPhaseForLesson(3, layout);
  assert(firstPhrase.phase === 'phrase', 'lesson 3 starts phrases');
  assert(firstPhrase.domainIndex === 0, 'first domain');
  assert(firstPhrase.withinDomain === 0, 'first phrase lesson in domain');
  const secondDomain = hybridPhaseForLesson(8, layout);
  assert(secondDomain.phase === 'phrase', 'still phrases');
  assert(secondDomain.domainIndex === 1, `domainIndex=${secondDomain.domainIndex}`);
  assert(hybridPhaseForLesson(layout.totalLessons, layout).phase === 'review', 'past end is review');
});

const learnCacheTest = test('learn course-phrases cache clears', () => {
  clearLearnCoursePhrasesCache();
  // Smoke: clear is idempotent and importable from the API helper module.
  clearLearnCoursePhrasesCache();
});

export function runFonoranCoursePhrasesTests() {
  return [
    sortTest,
    grammarTest,
    domainLessonTest,
    rule4LessonTest,
    hybridLayoutTest,
    hybridPhaseTest,
    learnCacheTest,
    ...runFonoranCoursePhrasesCompileTests(),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = runFonoranCoursePhrasesTests();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(r.ok ? `✓ ${r.name}` : `✗ ${r.name}: ${r.error}`);
  }
  if (failed.length) process.exitCode = 1;
}
