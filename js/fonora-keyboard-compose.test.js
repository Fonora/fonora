/**
 * Unit tests for Fonora keyboard roman composition.
 */
import { createFonoraKeyboardComposer } from './fonora-keyboard-compose.js';
import { deleteFonoraPhonemeBeforeCursor } from './utils.js';

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

function applyComposeToTextarea(textarea, result) {
  if (result.upgrade) {
    const pos = textarea.selectionStart;
    const before = textarea.value.slice(0, pos);
    const after = textarea.value.slice(pos);
    const { fromSymbols, toSymbols } = result.upgrade;
    if (before.endsWith(fromSymbols)) {
      const next = before.slice(0, -fromSymbols.length) + toSymbols;
      textarea.value = next + after;
      textarea.selectionStart = next.length;
      textarea.selectionEnd = next.length;
    }
  }
  for (const chunk of result.inserts ?? []) {
    if (!chunk) continue;
    const pos = textarea.selectionStart;
    textarea.value = textarea.value.slice(0, pos) + chunk + textarea.value.slice(pos);
    const newPos = pos + chunk.length;
    textarea.selectionStart = newPos;
    textarea.selectionEnd = newPos;
  }
}

function collectOutputs(composer, letters) {
  const textarea = { value: '', selectionStart: 0, selectionEnd: 0 };
  for (const letter of letters) {
    applyComposeToTextarea(textarea, composer.appendLetter(letter));
  }
  return textarea.value;
}

/**
 * @param {{ rules: object }} options
 */
export function runKeyboardComposeTests(options) {
  const { rules } = options;
  if (!rules) throw new Error('runKeyboardComposeTests requires rules');

  const results = [];
  const t = (name, fn) => results.push(test(name, fn));

  t('t prints immediately; t + h retroactively becomes th', () => {
    const c = createFonoraKeyboardComposer(rules);
    assert(collectOutputs(c, ['t']) === c.soundToSymbols.t, 't prints at once');
    assert(c.getBuffer() === '');
    assert(collectOutputs(c, ['t', 'h']) === c.soundToSymbols.th);
  });

  t('d prints immediately; d + h retroactively becomes dh', () => {
    const c = createFonoraKeyboardComposer(rules);
    assert(collectOutputs(c, ['d']) === c.soundToSymbols.d);
    assert(collectOutputs(c, ['d', 'h']) === c.soundToSymbols.dh);
  });

  t('s prints immediately; s + h retroactively becomes sh', () => {
    const c = createFonoraKeyboardComposer(rules);
    assert(collectOutputs(c, ['s']) === c.soundToSymbols.s, 's prints at once');
    assert(c.getBuffer() === '');
    const out = collectOutputs(c, ['s', 'h']);
    assert(out === c.soundToSymbols.sh);
  });

  t('compose ng digraph', () => {
    const c = createFonoraKeyboardComposer(rules);
    assert(collectOutputs(c, ['n', 'g']) === c.soundToSymbols.ng);
  });

  t('c prints ch', () => {
    const c = createFonoraKeyboardComposer(rules);
    assert(collectOutputs(c, ['c']) === c.soundToSymbols.ch);
    assert(c.getBuffer() === '');
  });

  t('k and g print immediately; h retroactively becomes kh and gh', () => {
    const c = createFonoraKeyboardComposer(rules);
    assert(collectOutputs(c, ['k']) === c.soundToSymbols.k);
    assert(collectOutputs(c, ['k', 'h']) === c.soundToSymbols.kh);

    const c2 = createFonoraKeyboardComposer(rules);
    assert(collectOutputs(c2, ['g']) === c2.soundToSymbols.g);
    assert(collectOutputs(c2, ['g', 'h']) === c2.soundToSymbols.gh);
  });

  t('compose vowel sequences ee, ae, oh, eye, ow, oy, ay', () => {
    const sequences = [
      [['e', 'e'], 'ee'],
      [['a', 'e'], 'ae'],
      [['o', 'h'], 'oh'],
      [['e', 'y'], 'eye'],
      [['o', 'w'], 'ow'],
      [['o', 'y'], 'oy'],
      [['a', 'y'], 'ay'],
    ];
    for (const [letters, phoneme] of sequences) {
      const c = createFonoraKeyboardComposer(rules);
      const out = collectOutputs(c, letters);
      assert(out === c.soundToSymbols[phoneme], `${letters.join('')} → ${phoneme}`);
    }
  });

  t('t then p keeps t and adds p', () => {
    const c = createFonoraKeyboardComposer(rules);
    const out = collectOutputs(c, ['t', 'p']);
    assert(out === c.soundToSymbols.t + c.soundToSymbols.p);
    assert(c.getBuffer() === '');
  });

  t('n + y is n then y, not ñ', () => {
    const c = createFonoraKeyboardComposer(rules);
    const out = collectOutputs(c, ['n', 'y']);
    assert(out === c.soundToSymbols.n + c.soundToSymbols.y);
    assert(c.getBuffer() === '');
  });

  t('ñ inserts via insertPhoneme', () => {
    const c = createFonoraKeyboardComposer(rules);
    const out = c.insertPhoneme('ñ').join('');
    assert(out === c.soundToSymbols['ñ']);
  });

  t('flush after t does not re-emit t', () => {
    const c = createFonoraKeyboardComposer(rules);
    collectOutputs(c, ['t']);
    const out = c.flushBuffer().join('');
    assert(out === '');
    assert(c.getBuffer() === '');
  });

  t('backspace after t removes printed t', () => {
    const c = createFonoraKeyboardComposer(rules);
    const textarea = { value: '', selectionStart: 0, selectionEnd: 0 };
    applyComposeToTextarea(textarea, c.appendLetter('t'));
    const result = c.backspace();
    assert(result.handled === true);
    assert(result.removeSymbols === c.soundToSymbols.t);
  });

  t('backspace after k removes printed k', () => {
    const c = createFonoraKeyboardComposer(rules);
    const textarea = { value: '', selectionStart: 0, selectionEnd: 0 };
    applyComposeToTextarea(textarea, c.appendLetter('k'));
    const result = c.backspace();
    assert(result.handled === true);
    assert(result.removeSymbols === c.soundToSymbols.k);
  });

  t('backspace after s removes printed s', () => {
    const c = createFonoraKeyboardComposer(rules);
    const textarea = { value: '', selectionStart: 0, selectionEnd: 0 };
    applyComposeToTextarea(textarea, c.appendLetter('s'));
    const result = c.backspace();
    assert(result.handled === true);
    assert(result.removeSymbols === c.soundToSymbols.s);
  });

  t('a + a prints two simple vowels when a has submenu', () => {
    const c = createFonoraKeyboardComposer(rules);
    if (c.getAlternatePhonemes('a').length === 0) return;
    const out = collectOutputs(c, ['a', 'a']);
    assert(out === c.soundToSymbols.a + c.soundToSymbols.a);
    assert(c.getBuffer() === '');
  });

  t('single a prints immediately when a has submenu', () => {
    const c = createFonoraKeyboardComposer(rules);
    if (c.getAlternatePhonemes('a').length === 0) return;
    const out = collectOutputs(c, ['a']);
    assert(out === c.soundToSymbols.a);
    assert(c.getBuffer() === '');
  });

  t('single o prints immediately', () => {
    const c = createFonoraKeyboardComposer(rules);
    if (c.getAlternatePhonemes('o').length === 0) return;
    const out = collectOutputs(c, ['o']);
    assert(out === c.soundToSymbols.o);
    assert(c.getBuffer() === '');
  });

  t('single e prints immediately', () => {
    const c = createFonoraKeyboardComposer(rules);
    const out = collectOutputs(c, ['e']);
    assert(out === c.soundToSymbols.e);
    assert(c.getBuffer() === '');
  });

  t('e + e composes ee (fast typing)', () => {
    const c = createFonoraKeyboardComposer(rules);
    const out = collectOutputs(c, ['e', 'e']);
    assert(out === c.soundToSymbols.ee);
    assert(c.getBuffer() === '');
  });

  t('e + y composes eye', () => {
    const c = createFonoraKeyboardComposer(rules);
    const out = collectOutputs(c, ['e', 'y']);
    assert(out === c.soundToSymbols.eye);
    assert(c.getBuffer() === '');
  });

  t('alternate phonemes for e exclude base e', () => {
    const c = createFonoraKeyboardComposer(rules);
    const alts = c.getAlternatePhonemes('e');
    assert(!alts.includes('e'));
    assert(alts.includes('ee'));
    assert(alts.includes('eye'));
  });

  t('alternate phonemes for n exclude base n', () => {
    const c = createFonoraKeyboardComposer(rules);
    const alts = c.getAlternatePhonemes('n');
    assert(!alts.includes('n'));
    assert(alts.includes('ng'));
    assert(alts.includes('ñ'));
  });

  t('commitPhoneme upgrades pending submenu letter to chosen phoneme', () => {
    const c = createFonoraKeyboardComposer(rules);
    const textarea = { value: '', selectionStart: 0, selectionEnd: 0 };
    applyComposeToTextarea(textarea, c.appendLetter('e'));
    applyComposeToTextarea(textarea, c.commitPhoneme('ee'));
    assert(textarea.value === c.soundToSymbols.ee);
    assert(c.getBuffer() === '');
  });

  t('single n prints immediately', () => {
    const c = createFonoraKeyboardComposer(rules);
    const out = collectOutputs(c, ['n']);
    assert(out === c.soundToSymbols.n);
    assert(c.getBuffer() === '');
  });

  t('n + n upgrades to ñ', () => {
    const c = createFonoraKeyboardComposer(rules);
    const out = collectOutputs(c, ['n', 'n']);
    assert(out === c.soundToSymbols['ñ']);
    assert(out !== c.soundToSymbols.n + c.soundToSymbols.n);
    assert(c.getBuffer() === '');
  });

  t('n + n + e is ñ then e', () => {
    const c = createFonoraKeyboardComposer(rules);
    const out = collectOutputs(c, ['n', 'n', 'e']);
    assert(out === c.soundToSymbols['ñ'] + c.soundToSymbols.e);
  });

  t('flush after n does not re-emit n', () => {
    const c = createFonoraKeyboardComposer(rules);
    collectOutputs(c, ['n']);
    const out = c.flushBuffer().join('');
    assert(out === '');
    assert(c.getBuffer() === '');
  });

  t('deleteFonoraPhonemeBeforeCursor removes whole phoneme glyph', () => {
    const ee = createFonoraKeyboardComposer(rules).soundToSymbols.ee;
    const textarea = {
      value: ee,
      selectionStart: ee.length,
      selectionEnd: ee.length,
      focus() {},
      dispatchEvent() {},
    };
    assert(deleteFonoraPhonemeBeforeCursor(textarea, rules) === true);
    assert(textarea.value === '');
  });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  return { passed, total: results.length, failed, results };
}
