/**
 * Unit tests for course-phrase compile helpers.
 */
import { buildFonoranField, extractTokens } from './fonoran-course-phrases-compile.js';
import { isMainModule } from './is-main.js';

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

const extractTest = test('extractTokens splits roman surface', () => {
  assert(
    extractTokens({ surface: { roman: 'mi ba ye' } }).join('|') === 'mi|ba|ye',
    'expected three tokens',
  );
  assert(extractTokens({ surface: { roman: '' } }).length === 0, 'empty roman');
  assert(extractTokens(null).length === 0, 'null result');
});

const translatedTest = test('buildFonoranField marks clean roman as translated', () => {
  const field = buildFonoranField({
    surface: { roman: 'mi ba.' },
    unresolved: [],
  });
  assert(field.status === 'translated', `status=${field.status}`);
  assert(field.roman === 'mi ba.', 'roman preserved');
  assert(field.tokens.join('|') === 'mi|ba.', 'tokens');
});

const gapTest = test('buildFonoranField marks unresolved as gap', () => {
  const field = buildFonoranField({
    surface: { roman: 'mi X' },
    unresolved: ['X'],
  });
  assert(field.status === 'gap', `status=${field.status}`);
  assert(field.unresolved?.includes('X'), 'unresolved kept');
});

const cacheMissTest = test('buildFonoranField marks cache-miss as pending', () => {
  const field = buildFonoranField({
    ok: false,
    cache_miss: true,
    error: 'cache-miss: "Hello."',
  });
  assert(field.status === 'pending', `status=${field.status}`);
  assert(field.roman === '', 'empty roman on miss');
});

const hardFailTest = test('buildFonoranField marks hard failure as gap', () => {
  const field = buildFonoranField({ ok: false, error: 'boom' });
  assert(field.status === 'gap', `status=${field.status}`);
  assert(field.error === 'boom', 'error preserved');
});

const composedTest = test('buildFonoranField brackets a composition the lexicon does not own', () => {
  const field = buildFonoranField({
    surface: { roman: 'dan les kel kalfem.' },
    unresolved: ['cook', 'meat'],
    tokens: [
      { fonoran: 'kalfem', concept_id: 'animal+body', ad_hoc_composition: true },
    ],
  });
  assert(field.roman === 'dan les kel [animal+body].', `roman=${field.roman}`);
  assert(!field.roman.includes('kalfem'), 'invented word must not be taught');
  assert(field.status === 'gap', `status=${field.status}`);
});

const composedWithoutGapsTest = test('buildFonoranField gaps a composition even when nothing is unresolved', () => {
  const field = buildFonoranField({
    surface: { roman: 'mi nes testemkan wi be.' },
    unresolved: [],
    tokens: [
      { fonoran: 'testemkan', concept_id: 'pain+ending', ad_hoc_composition: true },
    ],
  });
  assert(field.status === 'gap', `status=${field.status}`);
  assert(field.roman === 'mi nes [pain+ending] wi be.', `roman=${field.roman}`);
});

const approvedWordKeptTest = test('buildFonoranField leaves approved compounds alone', () => {
  const field = buildFonoranField({
    surface: { roman: 'mi nes nesgu wi be.' },
    unresolved: [],
    tokens: [{ fonoran: 'nesgu', concept_id: 'relieved', kind: 'compound' }],
  });
  assert(field.status === 'translated', `status=${field.status}`);
  assert(field.roman === 'mi nes nesgu wi be.', `roman=${field.roman}`);
});

export function runFonoranCoursePhrasesCompileTests() {
  return [
    extractTest,
    translatedTest,
    gapTest,
    cacheMissTest,
    hardFailTest,
    composedTest,
    composedWithoutGapsTest,
    approvedWordKeptTest,
  ];
}

if (isMainModule(import.meta.url)) {
  const results = runFonoranCoursePhrasesCompileTests();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(r.ok ? `✓ ${r.name}` : `✗ ${r.name}: ${r.error}`);
  }
  if (failed.length) process.exitCode = 1;
}
