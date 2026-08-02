/**
 * Tests for course phrase build ordering, the per-subject domain layout,
 * lesson-index migration, spaced repetition, and grammar drills.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './is-main.js';
import { buildGrammarPhraseExercises, grammarPhraseExerciseMatches } from '../js/fonoran-grammar-phrase-exercises.js';
import {
  grammarLessonExercisesFromCompiled,
  grammarLessonAnswerMatches,
  stripMcqPromptOptions,
} from '../js/fonoran-grammar-lessons.js';
import {
  computeDomainLayout,
  domainPhaseForLesson,
  migratedLessonIndex,
} from '../js/fonoran-learn-curriculum.js';
import { buildCourseItems } from '../js/fonoran-course-phrases.js';
import {
  applySrsResult,
  isItemDue,
  mergeItemStats,
  SRS_MAX_BOX,
} from '../js/learn-gamification.js';
import { particleForms } from './fonoran-language-policy.js';
import { resolveDataPath } from './fonoran-data-paths.js';
import { runFonoranCoursePhrasesCompileTests } from './fonoran-course-phrases-compile.test.js';
import { clearLearnCoursePhrasesCache } from './fonoran-learn-course-phrases.js';
import { compileGrammarLessonsDocument, loadGrammarLessonSeed } from './fonoran-grammar-lessons-compile.js';

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
const lessonsSeed = JSON.parse(readFileSync(join(ROOT, 'data/fonoran-grammar-lessons.json'), 'utf8'));

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

const corpusShapeTest = test('stranger corpus has 20 domains × 50 phrases', () => {
  assert(corpus.domains.length === 20, `expected 20 domains, got ${corpus.domains.length}`);
  for (const domain of corpus.domains) {
    assert((domain.phrases ?? []).length === 50, `${domain.id} should have 50 phrases`);
  }
});

// ─── Grammar lesson seed and compiled materialization ────────────────────────

const seedIsEnglishOnlyTest = test('grammar lesson seed stores no Fonoran', () => {
  const exercises = lessonsSeed.lessons.flatMap((l) => l.exercises ?? []);
  assert(exercises.length === 10, `expected 10 basics exercises, got ${exercises.length}`);
  for (const ex of exercises) {
    assert(ex.sourceText, `${ex.id}: sourceText required`);
    assert(ex.kind, `${ex.id}: kind required`);
    assert(ex.tip, `${ex.id}: tip required`);
    for (const banned of ['answerRoman', 'promptFonoran', 'parts', 'roman', 'choices', 'alternates']) {
      assert(!(banned in ex), `${ex.id}: seed must not hand-author "${banned}"`);
    }
    if (ex.distractor) {
      assert(
        ex.distractor.sourceText || ex.distractor.transform,
        `${ex.id}: distractor must be a compiled sentence or a token transform`,
      );
      assert(!('roman' in ex.distractor), `${ex.id}: distractor must not hand-author roman`);
    }
  }
});

const compiledGrammarDoc = await compileGrammarLessonsDocument(await loadGrammarLessonSeed());

const grammarCompileTest = test('grammar basics compile fully from the live lexicon', () => {
  const exercises = compiledGrammarDoc.lessons.flatMap((l) => l.exercises ?? []);
  assert(exercises.length === 10, `expected 10 compiled exercises, got ${exercises.length}`);
  for (const ex of exercises) {
    assert(ex.fonoran?.status === 'translated', `${ex.id}: not translated (${ex.fonoran?.status})`);
    assert(ex.fonoran.roman, `${ex.id}: empty roman`);
    assert(ex.tip && !ex.tip.includes('{'), `${ex.id}: tip placeholder unresolved: ${ex.tip}`);
  }
});

const grammarMaterializeTest = test('compiled grammar materializes procedural drills', () => {
  const drills = grammarLessonExercisesFromCompiled(compiledGrammarDoc);
  assert(drills.length === 10, `expected 10 drills, got ${drills.length}`);

  const particleSet = new Set(particleForms());
  const particlesDrill = drills.find((d) => d.kind === 'particles');
  assert(particlesDrill, 'particles drill present');
  for (const token of particlesDrill.answerRoman.split(' ')) {
    assert(particleSet.has(token), `particles answer contains non-particle "${token}"`);
  }

  const reorder = drills.find((d) => d.kind === 'reorder');
  assert(reorder, 'reorder drill present');
  assert(reorder.promptLang.startsWith('Put these tokens in order:'), 'reorder prompt generated');

  const chooses = drills.filter((d) => d.kind === 'choose');
  assert(chooses.length === 2, `expected 2 choose drills, got ${chooses.length}`);
  for (const choose of chooses) {
    assert(choose.choices?.length === 2, `${choose.id}: two choices`);
    assert(choose.choices[0] !== choose.choices[1], `${choose.id}: distinct choices`);
    assert(choose.choices.includes(choose.answerRoman), `${choose.id}: answer among choices`);
    assert(!/^[A-D]\)/m.test(choose.promptLang), `${choose.id}: options must not repeat in prompt`);
  }
  const dropToken = chooses.find((d) => d.id === 'gb-actor-spoken');
  const wrong = dropToken.choices.find((c) => c !== dropToken.answerRoman);
  assert(
    wrong.split(/\s+/).length === dropToken.answerRoman.split(/\s+/).length - 1,
    'drop-token distractor removes exactly one token',
  );

  const translate = drills.find((d) => d.kind === 'translate-to-fonoran');
  assert(translate, 'translate drill present');
  assert(
    grammarLessonAnswerMatches(translate, translate.answerRoman.replace(/\.$/, '')),
    'terminal punctuation optional in answers',
  );
  assert(
    stripMcqPromptOptions('Which means “x”?\nA) mi gi ye\nB) mi gi nan ye') === 'Which means “x”?',
    'stripMcqPromptOptions removes lettered options',
  );
});

const grammarGapDropTest = test('a gapped grammar sentence never reaches the learner', () => {
  const doc = {
    lessons: [{
      exercises: [
        {
          id: 'gap-1',
          kind: 'translate-to-fonoran',
          sourceText: 'I am not dangerous.',
          fonoran: { roman: 'mi no [dangerous].', tokens: ['mi', 'no', '[dangerous].'], status: 'gap' },
        },
        {
          id: 'gap-2',
          kind: 'choose',
          sourceText: 'Do you want food?',
          promptLang: 'Which asks the question?',
          fonoran: { roman: 'ka be sak lo.', tokens: ['ka', 'be', 'sak', 'lo.'], status: 'translated' },
          distractor: { sourceText: 'You want food.', roman: '', status: 'gap' },
        },
      ],
    }],
  };
  assert(grammarLessonExercisesFromCompiled(doc).length === 0, 'gapped exercises must be dropped');
});

// ─── Domain layout ────────────────────────────────────────────────────────────

/** Build a synthetic entry list: per domain, `words` word items and `phrases` phrase items. */
function syntheticEntries(spec) {
  const entries = [];
  spec.forEach(([words, phrases], domainIndex) => {
    for (let i = 0; i < words; i += 1) {
      entries.push({ id: `w-${domainIndex}-${i}`, itemType: 'word', domainIndex });
    }
    for (let i = 0; i < phrases; i += 1) {
      entries.push({ id: `p-${domainIndex}-${i}`, itemType: 'phrase', domainIndex });
    }
  });
  return entries;
}

const layoutTest = test('computeDomainLayout sizes lessons from content and covers every phrase', () => {
  const domains = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const entries = syntheticEntries([[23, 41], [7, 38], [0, 0]]);
  const layout = computeDomainLayout(entries, domains, { size: 10 });

  assert(layout.domains[0].wordLessons === 3, `a wordLessons=${layout.domains[0].wordLessons}`);
  assert(layout.domains[0].phraseLessons === 5, `a phraseLessons=${layout.domains[0].phraseLessons}`);
  assert(layout.domains[0].startLesson === 0, 'a starts at 0');
  assert(layout.domains[1].wordLessons === 1, `b wordLessons=${layout.domains[1].wordLessons}`);
  assert(layout.domains[1].phraseLessons === 4, `b phraseLessons=${layout.domains[1].phraseLessons}`);
  assert(layout.domains[1].startLesson === 8, `b startLesson=${layout.domains[1].startLesson}`);
  assert(layout.domains[2].lessons === 0, 'empty domain gets no lessons');
  assert(layout.totalLessons === 13, `totalLessons=${layout.totalLessons}`);

  // Every phrase has a slot: phrase lesson capacity ≥ phrase count per domain.
  assert(layout.domains[0].phraseLessons * 10 >= 41, 'domain a phrase coverage');
  assert(layout.domains[1].phraseLessons * 10 >= 38, 'domain b phrase coverage');
});

const phaseTest = test('domainPhaseForLesson maps words then phrases and skips empty domains', () => {
  const domains = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const entries = syntheticEntries([[12, 15], [0, 0], [5, 9]]);
  const layout = computeDomainLayout(entries, domains, { size: 10 });
  // a: 2 word + 2 phrase lessons (0–3); b: none; c: 1 word + 1 phrase (4–5).

  assert(domainPhaseForLesson(0, layout).phase === 'words', 'lesson 0 words');
  assert(domainPhaseForLesson(1, layout).phase === 'words', 'lesson 1 words');
  const firstPhrase = domainPhaseForLesson(2, layout);
  assert(firstPhrase.phase === 'phrases' && firstPhrase.domainIndex === 0, 'lesson 2 = a phrases');
  assert(firstPhrase.phaseLesson === 0 && firstPhrase.phaseTotal === 2, 'phrase counters');
  const cWords = domainPhaseForLesson(4, layout);
  assert(cWords.phase === 'words' && cWords.domainIndex === 2, 'empty domain b skipped');
  assert(domainPhaseForLesson(6, layout).phase === 'review', 'past end is review');
});

const dedupTest = test('buildCourseItems teaches each word once, in its first domain', () => {
  const data = {
    domains: [
      {
        id: 'one',
        label: 'One',
        phrases: [
          { id: 'p1', sourceText: 'I want food.', complexity: 1, fonoran: { roman: 'mi sak lo.', tokens: ['mi', 'sak', 'lo.'], status: 'translated' } },
        ],
      },
      {
        id: 'two',
        label: 'Two',
        phrases: [
          { id: 'p2', sourceText: 'I want water.', complexity: 1, fonoran: { roman: 'mi sak ye.', tokens: ['mi', 'sak', 'ye.'], status: 'translated' } },
          { id: 'p3', sourceText: 'Gap here.', complexity: 1, fonoran: { roman: '', tokens: [], status: 'gap' } },
        ],
      },
    ],
  };
  const labEntries = [
    { spelling: 'sak', meaning: 'to want', parts: ['sak'], script: '', conceptId: 'want', tierRank: 0 },
    { spelling: 'lo', meaning: 'food', parts: ['lo'], script: '', conceptId: 'food', tierRank: 0 },
    { spelling: 'ye', meaning: 'water', parts: ['ye'], script: '', conceptId: 'water', tierRank: 0 },
  ];
  const particles = { particles: [{ id: 'actor_self', form: 'mi', gloss: 'I / me (actor)' }] };

  const built = buildCourseItems(data, labEntries, particles, null);
  const words = built.items.filter((i) => i.itemType === 'word');

  // Domain one owns mi, sak, lo; domain two adds only the new word ye.
  const domainOneWords = words.filter((w) => w.domainIndex === 0).map((w) => w.spelling).sort();
  const domainTwoWords = words.filter((w) => w.domainIndex === 1).map((w) => w.spelling);
  assert(domainOneWords.join(',') === 'lo,mi,sak', `domain one words: ${domainOneWords}`);
  assert(domainTwoWords.join(',') === 'ye', `domain two words: ${domainTwoWords}`);

  // Stable, domain-independent keys so review mastery survives re-layout.
  assert(
    words.every((w) => w.id === `w-${w.spelling}` || w.id === `p-${w.spelling}`),
    'word ids are spelling-keyed, not domain-indexed',
  );

  // Gap phrases are excluded; translated ones adapt in corpus order.
  const phrases = built.items.filter((i) => i.itemType === 'phrase');
  assert(phrases.length === 2, `expected 2 phrases, got ${phrases.length}`);
  assert(built.phraseItems.length === 2, 'phraseItems mirrors translated phrases');
});

// ─── Lesson index migration ───────────────────────────────────────────────────

const migrationTest = test('migratedLessonIndex maps completed domains onto the new layout', () => {
  const domains = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}` }));
  const entries = syntheticEntries(domains.map((_, i) => (i % 3 === 0 ? [12, 20] : [5, 15])));
  const layout = computeDomainLayout(entries, domains, { size: 10 });

  // Fresh learner stays at zero.
  assert(migratedLessonIndex(0, 115, layout) === 0, 'zero stays zero');

  // Hybrid layout: 15 ring lessons + 20×5 phrase lessons = 115 total.
  // Lesson 10 was still inside the ring phase → restart at domain 0.
  assert(migratedLessonIndex(10, 115, layout) === 0, 'ring-phase learner restarts at domain 0');
  // Lesson 22 = 7 phrase lessons in → domain 1 completed count 1 → new domain 1 start.
  assert(
    migratedLessonIndex(22, 115, layout) === layout.domains[1].startLesson,
    'one hybrid domain done maps to new domain 1 start',
  );

  // Old fixed-5 domain layout (Speaking): totalLessons 100.
  assert(
    migratedLessonIndex(12, 100, layout) === layout.domains[2].startLesson,
    'two fixed-5 domains done maps to new domain 2 start',
  );

  // Finished course stays finished (review).
  assert(migratedLessonIndex(115, 115, layout) === layout.totalLessons, 'finished maps to review');
});

// ─── Spaced repetition ────────────────────────────────────────────────────────

const srsTest = test('SRS promotes on correct, demotes on wrong, schedules due dates', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = 1_000_000;

  const first = applySrsResult(undefined, true, now);
  assert(first.box === 1 && first.seen === 1 && first.correct === 1, 'first correct → box 1');
  assert(first.due === now, 'box 1 due immediately');

  const second = applySrsResult(first, true, now);
  assert(second.box === 2, 'promotes to box 2');
  assert(second.due === now + day, 'box 2 due in 1 day');

  let stats = second;
  for (let i = 0; i < 10; i += 1) stats = applySrsResult(stats, true, now);
  assert(stats.box === SRS_MAX_BOX, 'box caps at max');
  assert(stats.due === now + 21 * day, 'max box due in 21 days');

  const demoted = applySrsResult(stats, false, now);
  assert(demoted.box === 1, 'wrong answer demotes to box 1');
  assert(demoted.correct === stats.correct, 'correct count unchanged on wrong');

  assert(!isItemDue(undefined, now), 'unknown item never due');
  assert(!isItemDue({ seen: 3, correct: 0, box: 0, due: 0 }, now), 'box 0 never due');
  assert(isItemDue({ seen: 1, correct: 1, box: 2, due: now }, now), 'due at timestamp');
  assert(!isItemDue({ seen: 1, correct: 1, box: 2, due: now + 1 }, now), 'not yet due');
});

const srsMergeTest = test('SRS merge takes max box and earliest due', () => {
  const merged = mergeItemStats(
    { seen: 4, correct: 3, box: 3, due: 500 },
    { seen: 2, correct: 2, box: 4, due: 300 },
  );
  assert(merged.seen === 4 && merged.correct === 3, 'counters take max');
  assert(merged.box === 4, 'box takes max');
  assert(merged.due === 300, 'due takes earliest');

  // Legacy record without SRS fields merges cleanly.
  const legacy = mergeItemStats({ seen: 5, correct: 2 }, { seen: 1, correct: 1, box: 2, due: 900 });
  assert(legacy.box === 2 && legacy.due === 900, 'legacy record adopts the SRS side');
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
    corpusShapeTest,
    seedIsEnglishOnlyTest,
    grammarCompileTest,
    grammarMaterializeTest,
    grammarGapDropTest,
    layoutTest,
    phaseTest,
    dedupTest,
    migrationTest,
    srsTest,
    srsMergeTest,
    learnCacheTest,
    ...runFonoranCoursePhrasesCompileTests(),
  ];
}

if (isMainModule(import.meta.url)) {
  const results = runFonoranCoursePhrasesTests();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(r.ok ? `✓ ${r.name}` : `✗ ${r.name}: ${r.error}`);
  }
  if (failed.length) process.exitCode = 1;
}
