/**
 * Grammar view: shows how Fonoran grammar works, visually.
 *
 * This is the rendering half only, same contract as the alignment view. Every
 * Fonoran spelling on this page is live engine output: the curated ENGLISH
 * prompts below are compiled through `POST /api/fonoran/translate` by the
 * caller, and the particle table is the seed inventory served by
 * `GET /api/fonoran/grammar-particles`. Nothing here hardcodes a Fonoran
 * spelling, so a respelled root or particle flows through untouched. The one
 * language fact consulted locally (the disjunction marker) comes from the
 * policy module, which is built from the seeds.
 */

import { functionWordLabelsByForm, disjunction } from '../tools/fonoran-language-policy.js';

// ── Curated English prompts ───────────────────────────────────────────────────
// English only: the prompts say what to translate, never what the answer is.

const P = {
  hero: 'do you want to go to the beach?',
  love: 'I love you',
  water: 'I go to the water',
  past: 'I loved you',
  future: 'I will love you',
  notSick: 'I am not sick',
  notSafe: 'not safe',
  hear: 'you hear me',
  hearQ: 'do you hear me?',
  who: 'who?',
  where: 'where?',
  when: 'when?',
  why: 'why?',
  wantGo: 'I want to go',
  makeFire: 'I can make fire',
  coldHungry: 'I am cold and hungry',
  foodOrWater: 'I want food or water',
};

/** Every prompt the view needs, so the caller can compile them all up front. */
export const GRAMMAR_EXAMPLE_PROMPTS = [...new Set(Object.values(P))];

// ── Roles ─────────────────────────────────────────────────────────────────────

/**
 * Teaching labels for the translator's token roles, matching the rulebook's
 * skeleton names (Actor · Action · Target · Place · Time). Particle roles that
 * mark the clause rather than fill a slot keep their own names.
 */
const ROLE_LABELS = {
  subject: 'Actor',
  event: 'Action',
  object: 'Target',
  path: 'Place',
  time: 'Time',
  modifier: 'Modifier',
  negation: 'Not',
  question: 'Question',
  affirmation: 'Yes',
  conditional: 'If',
};

/** Token role → colour family (CSS hook). */
const ROLE_CLASS = {
  subject: 'actor',
  event: 'action',
  object: 'target',
  path: 'place',
  time: 'time',
  modifier: 'modifier',
  negation: 'marker',
  question: 'marker',
  affirmation: 'marker',
  conditional: 'marker',
};

const PARTICLE_LABELS = functionWordLabelsByForm();
const DISJUNCTION_MARKER = disjunction().marker_form;

// ── Small helpers ─────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function normWord(w) {
  return String(w).replace(/[^\p{L}\p{N}']/gu, '').toLowerCase();
}

function isPunct(tok) {
  return tok.kind === 'punctuation' || tok.role === 'punctuation';
}

function roleLabel(tok) {
  return ROLE_LABELS[tok.role] ?? '';
}

function roleClass(tok) {
  return ROLE_CLASS[tok.role] ?? (tok.kind === 'particle' ? 'marker' : 'concept');
}

/** Meaning under a chip; curated label for function words, else the English. */
function displayGloss(tok) {
  const curated = PARTICLE_LABELS.get(tok.fonoran);
  if (curated) return curated;
  const eng = String(tok.english ?? '').trim();
  return eng && normWord(eng) !== normWord(tok.fonoran) ? eng : '';
}

// ── Sentence rendering ────────────────────────────────────────────────────────

function chipHtml(tok, opts = {}) {
  const roman = String(tok.fonoran ?? '').trim();

  if (!roman || tok.resolved === false) {
    const eng = String(tok.english ?? '?').trim();
    return `<span class="g-chip g-chip--gap">
      <span class="g-chip__roman">${esc(eng)}</span>
      <span class="g-chip__role">no form yet</span>
    </span>`;
  }

  const classes = ['g-chip', `g-chip--${roleClass(tok)}`];
  if (tok.kind === 'particle') classes.push('g-chip--particle');
  const emphasized =
    (opts.emphasizeParticles && tok.kind === 'particle') ||
    (opts.emphasizeRoles?.includes(tok.role)) ||
    (opts.emphasizeForms?.includes(roman));
  if (emphasized) classes.push('g-chip--em');

  const gloss = displayGloss(tok);
  const role = roleLabel(tok);
  return `<span class="${classes.join(' ')}">
    <span class="g-chip__roman">${esc(roman)}</span>
    ${role ? `<span class="g-chip__role">${esc(role)}</span>` : ''}
    ${gloss ? `<span class="g-chip__english">${esc(gloss)}</span>` : ''}
  </span>`;
}

/**
 * One sentence as a row of role chips. Optional visual grouping, all derived
 * from the roles the engine assigned:
 * - `scopeNegation`: underline the negation particle together with the one
 *   word to its right (rule 10: `no` denies exactly what follows it).
 * - `chainActions`: an arc over a run of consecutive Action tokens (rule 12).
 */
function sentenceHtml(result, opts = {}) {
  const toks = result.tokens ?? [];
  const parts = [];
  let i = 0;

  while (i < toks.length) {
    const tok = toks[i];

    if (isPunct(tok)) {
      const ch = String(tok.fonoran ?? tok.english ?? '').trim();
      if (ch) parts.push(`<span class="g-punct">${esc(ch)}</span>`);
      i += 1;
      continue;
    }

    if (opts.scopeNegation && tok.role === 'negation') {
      const scope = [chipHtml(tok, opts)];
      let j = i + 1;
      if (j < toks.length && !isPunct(toks[j])) {
        scope.push(chipHtml(toks[j], opts));
        j += 1;
      }
      parts.push(`<span class="g-scope">${scope.join('')}</span>`);
      i = j;
      continue;
    }

    if (opts.chainActions && tok.role === 'event' && toks[i + 1]?.role === 'event') {
      const chain = [];
      let j = i;
      while (j < toks.length && toks[j].role === 'event') {
        chain.push(chipHtml(toks[j], opts));
        j += 1;
      }
      parts.push(`<span class="g-chain">${chain.join('')}</span>`);
      i = j;
      continue;
    }

    parts.push(chipHtml(tok, opts));
    i += 1;
  }

  return parts.join('');
}

function exampleHtml(compiled, en, opts = {}) {
  const result = compiled?.get(en);
  const note = opts.note
    ? `<p class="g-example__note sans">${esc(opts.note)}</p>`
    : '';

  if (!result || !Array.isArray(result.tokens) || !result.tokens.length) {
    return `<figure class="g-example g-example--unavailable">
      <figcaption class="g-example__en sans">“${esc(en)}”</figcaption>
      <p class="g-example__missing sans">Live example unavailable: it compiles through the translator when the API is reachable.</p>
    </figure>`;
  }

  return `<figure class="g-example">
    <figcaption class="g-example__en sans">“${esc(en)}”</figcaption>
    <div class="g-sentence">${sentenceHtml(result, opts)}</div>
    ${note}
  </figure>`;
}

// ── Static teaching furniture (prose and slot names from the rulebook) ────────

const SKELETON = [
  { key: 'actor', label: 'Actor', desc: 'who acts, always spoken' },
  { key: 'action', label: 'Action', desc: 'what happens' },
  { key: 'target', label: 'Target', desc: 'what it acts on' },
  { key: 'place', label: 'Place', desc: 'where it points' },
  { key: 'time', label: 'Time', desc: 'floats where it reads naturally' },
];

function skeletonHtml() {
  return `<div class="g-skeleton" aria-label="Sentence skeleton">
    ${SKELETON.map((slot, i) => `
      ${i > 0 ? '<span class="g-skeleton__sep" aria-hidden="true">·</span>' : ''}
      <span class="g-skeleton__slot g-skeleton__slot--${slot.key}">
        <span class="g-skeleton__label">${esc(slot.label)}</span>
        <span class="g-skeleton__desc sans">${esc(slot.desc)}</span>
      </span>`).join('')}
  </div>`;
}

function particleTableHtml(particles) {
  const list = particles?.particles ?? [];
  if (!list.length) {
    return '<p class="g-example__missing sans">Particle inventory unavailable: it loads from the grammar seed when the API is reachable.</p>';
  }
  const rows = list.map((p) => `
    <tr>
      <td class="g-ptable__form">${p.form ? esc(p.form) : '<span class="g-ptable__none">(nothing)</span>'}</td>
      <td>${esc(p.gloss ?? '')}</td>
      <td class="g-ptable__group sans">${esc(p.group ?? '')}</td>
    </tr>`).join('');
  return `<table class="g-ptable" aria-label="The closed particle set">
    <thead><tr><th scope="col">Particle</th><th scope="col">Job</th><th scope="col">Group</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Sections ──────────────────────────────────────────────────────────────────

function sectionsHtml({ particles, compiled }) {
  const ex = (en, opts) => exampleHtml(compiled, en, opts);

  return `
  <section class="g-section" aria-labelledby="g-skeleton-h">
    <p class="g-section__rule sans">Rule 8</p>
    <h2 id="g-skeleton-h">One order, and the Actor is always spoken</h2>
    <p class="g-section__lead">Every sentence follows the same skeleton. There are no case endings, so the order is doing real work: it does not scramble.</p>
    ${skeletonHtml()}
    <div class="g-example-grid">
      ${ex(P.love)}
      ${ex(P.water)}
      ${ex(P.hero, { note: 'A question uses the same skeleton; only the opening marker changes.' })}
    </div>
  </section>

  <section class="g-section" aria-labelledby="g-particles-h">
    <p class="g-section__rule sans">Rule 9</p>
    <h2 id="g-particles-h">Words never change; particles do the work</h2>
    <p class="g-section__lead">Nothing conjugates, nothing declines, nothing agrees. Where English changes a word's shape, Fonoran adds a small separate word from a closed set. Present tense is the default: no particle at all.</p>
    <div class="g-example-grid">
      ${ex(P.love, { emphasizeParticles: true, note: 'Present: the Time slot is simply empty.' })}
      ${ex(P.past, { emphasizeRoles: ['time'], note: 'Past: one particle before the Action.' })}
      ${ex(P.future, { emphasizeRoles: ['time'], note: 'Future: swap the particle, nothing else moves.' })}
    </div>
    <h3 class="g-subhead">The whole closed set</h3>
    ${particleTableHtml(particles)}
  </section>

  <section class="g-section" aria-labelledby="g-negation-h">
    <p class="g-section__rule sans">Rule 10</p>
    <h2 id="g-negation-h">Negation sits immediately before what it denies</h2>
    <p class="g-section__lead">The position of the negation particle is its meaning: it scopes over exactly the word to its right. The underline shows the scope.</p>
    <div class="g-example-grid">
      ${ex(P.notSick, { scopeNegation: true, note: 'Before the Action: denies the doing.' })}
      ${ex(P.notSafe, { scopeNegation: true, note: 'Before a quality: denies just that quality.' })}
    </div>
  </section>

  <section class="g-section" aria-labelledby="g-questions-h">
    <p class="g-section__rule sans">Rule 11</p>
    <h2 id="g-questions-h">Questions open with a marker</h2>
    <p class="g-section__lead">Every question, yes/no or content, begins with the question particle. The script has no question mark, so the particle carries it, and the listener knows a question is coming before the sentence is assembled.</p>
    <div class="g-example-grid">
      ${ex(P.hear, { note: 'A statement.' })}
      ${ex(P.hearQ, { emphasizeRoles: ['question'], note: 'The same sentence as a question: one particle, in front.' })}
    </div>
    <h3 class="g-subhead">Content questions name the unknown</h3>
    <p class="g-section__lead">There is no special word for who or where. A content question composes “unknown” with the kind of thing that is missing, and still opens with the question particle.</p>
    <div class="g-example-grid g-example-grid--compact">
      ${ex(P.who, { emphasizeRoles: ['question'] })}
      ${ex(P.where, { emphasizeRoles: ['question'] })}
      ${ex(P.when, { emphasizeRoles: ['question'] })}
      ${ex(P.why, { emphasizeRoles: ['question'] })}
    </div>
  </section>

  <section class="g-section" aria-labelledby="g-chains-h">
    <p class="g-section__rule sans">Rule 12</p>
    <h2 id="g-chains-h">Actions chain, and modality is just a word in the chain</h2>
    <p class="g-section__lead">Verbs stack directly: no infinitive marker, no auxiliary. Ability is knowing how, necessity is needing. The arc shows a chain the engine built.</p>
    <div class="g-example-grid">
      ${ex(P.wantGo, { chainActions: true, note: 'Want plus go, with nothing between them.' })}
      ${ex(P.makeFire, { chainActions: true, note: 'Ability is “know how”: know chains onto make.' })}
    </div>
  </section>

  <section class="g-section" aria-labelledby="g-andor-h">
    <p class="g-section__rule sans">Rule 13</p>
    <h2 id="g-andor-h">“And” is nothing, “or” closes the group</h2>
    <p class="g-section__lead">Two things side by side already mean both, so conjunction needs no word. Choice needs a marker, because side by side would assert both: the group is closed with the word for “a single one”.</p>
    <div class="g-example-grid">
      ${ex(P.coldHungry, { note: 'And: plain juxtaposition, no connector at all.' })}
      ${ex(P.foodOrWater, { emphasizeForms: [DISJUNCTION_MARKER], note: 'Or: the highlighted marker closes the group of alternatives.' })}
    </div>
  </section>

  <footer class="g-footer sans">
    <p>Every Fonoran sentence above is compiled live by the deterministic translator from the English prompt shown with it, and the particle table is read from the grammar seed. Nothing on this page is hand-written Fonoran.</p>
    <p>Read the full syntax reference in the <a href="/?path=docs%2Ffonoran-grammar.md">grammar doc</a>, or try your own sentences in the <a href="#translator">Translator</a>.</p>
  </footer>`;
}

// ── Public mount ──────────────────────────────────────────────────────────────

/**
 * Render the visual grammar page into `host`.
 *
 * @param {HTMLElement} host
 * @param {{ particles: object | null, compiled: Map<string, object | null> }} data
 */
export function renderGrammarView(host, data) {
  host.innerHTML = `<div class="g-view">${sectionsHtml(data)}</div>`;
}
