/**
 * Puzzle Conversation page — guess-the-meaning playtest UI.
 */

const FEEDBACK_TAG_LABELS = {
  too_long: 'Too long',
  unnatural: 'Unnatural',
  hard_pronounce: 'Hard to say',
  worked_well: 'Worked well',
};

/**
 * @param {{
 *   getState: () => object,
 *   api: (path: string, opts?: object) => Promise<unknown>,
 *   $: (id: string) => HTMLElement | null,
 *   escapeHtml: (s: unknown) => string,
 *   toast: (msg: string) => void,
 *   ensureRules: () => Promise<void>,
 *   romanToFonoraScript: (parts: string[], rules: object) => { phrase?: string },
 *   speakNeural?: (parts: string[]) => void | Promise<void>,
 * }} deps
 */
export function createPuzzlePage(deps) {
  const { getState, api, $, escapeHtml, toast, ensureRules, romanToFonoraScript, speakNeural } = deps;

  function puzzleScriptPhrase(challenge) {
    const STATE = getState();
    const parts = challenge?.parts ?? [];
    if (!parts.length || !STATE.rules) return '';
    try {
      const { phrase } = romanToFonoraScript(parts, STATE.rules);
      return phrase || '';
    } catch {
      return '';
    }
  }

  function puzzleEasyDisplay(challenge) {
    const parts = challenge?.parts ?? [];
    if (parts.length >= 2) return parts.join(' · ');
    return challenge?.spelling_display || challenge?.spelling || '';
  }

  function puzzleChallengeWordHtml(c, mode) {
    const spelling = c.spelling ?? '';

    if (mode === 'hard') {
      const script = puzzleScriptPhrase(c);
      return `<span class="puzzle-word__script symbol-text" aria-label="${escapeHtml(spelling)}">${escapeHtml(script)}</span>`;
    }

    if (mode === 'easy') {
      return `<span class="puzzle-word__roman mono puzzle-boundary">${escapeHtml(puzzleEasyDisplay(c))}</span>`;
    }

    return `<span class="puzzle-word__roman mono">${escapeHtml(spelling)}</span>`;
  }

  function puzzleBreakdownHtml(b, { reveal = false, parts = null } = {}) {
    if (!b?.spelling && !b?.spellings_line) return '';
    const cls = reveal ? ' puzzle-breakdown--reveal' : '';
    const word = b.spelling ?? '';
    const meaning = b.answer ?? '';
    const recipe = b.recipe ?? null;
    const showRecipe = Boolean(recipe) && (b.show_recipe || (b.levels?.length ?? 0) >= 2);
    const recipeLine = showRecipe
      ? `<p class="sans puzzle-breakdown__recipe">${escapeHtml(recipe)}</p>`
      : '';

    const levels = b.levels ?? [];
    const showLevels = levels.length > 0 && (b.nested || levels.some(l => l.is_compound));
    const levelsHtml = showLevels
      ? levels.map((lvl) => {
        const sub = lvl.recipe ? ` <span class="sans puzzle-breakdown__sub">(${escapeHtml(lvl.recipe)})</span>` : '';
        return `<p class="sans puzzle-breakdown__level"><span class="puzzle-breakdown__label">${escapeHtml(lvl.label)}:</span> <span class="mono puzzle-boundary">${escapeHtml(lvl.spelling_display)}</span>${sub}</p>`;
      }).join('')
      : '';

    const showAtomic = reveal && b.spellings_line && (partsCount(b) > (levels.length || 2));
    const atomicHtml = showAtomic
      ? `<p class="sans puzzle-breakdown__line puzzle-breakdown__line--atomic"><span class="puzzle-breakdown__label">all roots:</span> <span class="mono puzzle-boundary">${escapeHtml(b.spellings_line)}</span></p>`
      : '';

    return `<div class="puzzle-breakdown${cls}">
      <p class="sans puzzle-breakdown__headline"><span class="mono puzzle-breakdown__word">${escapeHtml(word)}</span><span class="puzzle-breakdown__arrow" aria-hidden="true">→</span><span class="puzzle-breakdown__meaning">${escapeHtml(meaning)}</span>${reveal && parts?.length ? ' <button type="button" class="hear-min puzzle-breakdown__hear" aria-label="Listen to breakdown">Listen</button>' : ''}</p>
      ${recipeLine}
      ${levelsHtml}
      ${atomicHtml}
    </div>`;
  }

  function wireBreakdownHear(root, parts) {
    if (!speakNeural || !parts?.length) return;
    root?.querySelector('.puzzle-breakdown__hear')?.addEventListener('click', () => {
      void speakNeural(parts);
    });
  }

  function partsCount(b) {
    if (!b?.spellings_line) return 0;
    return b.spellings_line.split('·').length;
  }

  function puzzleAlternatesHtml(alternateForms) {
    if (!alternateForms?.length) return '';
    return `<p class="sans puzzle-repair__alts">Other speakers might say: ${alternateForms.map((a) => `<span class="mono puzzle-boundary">${escapeHtml(a.spelling_display || a.spelling)}</span> <span class="sans">(${escapeHtml(a.readable)})</span>`).join(', ')}</p>`;
  }

  function puzzleFeedbackHtml(p, c) {
    if (!c) return '';
    const sent = p.feedbackSent;
    const busy = p.feedbackBusy;
    const selected = p.feedbackTag ?? null;
    const tagBtns = Object.entries(FEEDBACK_TAG_LABELS).map(([id, label]) => {
      const on = selected === id;
      const dis = sent || busy ? ' disabled' : '';
      return `<button type="button" class="puzzle-feedback-tag${on ? ' puzzle-feedback-tag--on' : ''}" data-feedback-tag="${id}"${dis}>${escapeHtml(label)}</button>`;
    }).join('');

    return `<div class="puzzle-feedback${sent ? ' puzzle-feedback--sent' : ''}">
      <p class="sans puzzle-feedback__lead">${sent ? 'Thanks — feedback recorded.' : busy ? 'Saving…' : 'How was this word?'}</p>
      <div class="puzzle-feedback__tags">${tagBtns}</div>
    </div>`;
  }

  function resetFeedback(p) {
    p.feedbackSent = false;
    p.feedbackTag = null;
    p.feedbackBusy = false;
    p.lastRoundId = null;
  }

  function puzzleConceptFromHash() {
    const raw = window.location.hash.replace(/^#/, '');
    const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
    return new URLSearchParams(query).get('concept')?.trim() || null;
  }

  function puzzleChallengeQuery(p) {
    const params = new URLSearchParams();
    if (p.coreOnly) params.set('core', '1');
    const concept = puzzleConceptFromHash();
    if (concept) params.set('concept', concept);
    const q = params.toString();
    return q ? `?${q}` : '';
  }

  async function loadPuzzleChallenge() {
    const STATE = getState();
    const p = STATE.puzzle;
    p.busy = true;
    p.revealed = false;
    p.recorded = false;
    p.repairTurns = 0;
    resetFeedback(p);
    renderPuzzle();
    try {
      await ensureRules();
    } catch {
      /* script preview is optional */
    }
    try {
      p.challenge = await api(`/api/fonoran/puzzle/challenge${puzzleChallengeQuery(p)}`);
    } catch (e) {
      p.challenge = null;
      toast(e.message);
    } finally {
      p.busy = false;
      renderPuzzle();
    }
  }

  async function recordPuzzleGuess(recovered, guess) {
    const STATE = getState();
    const p = STATE.puzzle;
    const c = p.challenge;
    if (!c || p.recorded) return;
    p.recorded = true;
    p.session.played += 1;
    if (recovered) p.session.recovered += 1;
    try {
      const res = await api('/api/fonoran/puzzle/guess', {
        method: 'POST',
        body: JSON.stringify({
          concept_id: c.concept_id,
          shown_spelling: c.spelling,
          shown_composition: c.parts,
          recovered,
          repair_turns: p.repairTurns,
          guess: guess ?? null,
          core_only: c.core_only,
          difficulty_mode: p.difficultyMode,
          source: 'puzzle',
        }),
      });
      p.lastRoundId = res?.round?.id ?? null;
    } catch (e) {
      toast(e.message);
    }
    try {
      p.summary = await api('/api/fonoran/playtests/summary');
    } catch {
      /* ignore */
    }
    renderPuzzle();
  }

  async function submitFeedbackTag(tag) {
    const STATE = getState();
    const p = STATE.puzzle;
    const c = p.challenge;
    if (!c || p.feedbackSent || p.feedbackBusy || !tag) return;
    p.feedbackTag = tag;
    p.feedbackBusy = true;
    renderPuzzle();
    try {
      await api('/api/fonoran/puzzle/guess', {
        method: 'POST',
        body: JSON.stringify({
          feedback_only: true,
          concept_id: c.concept_id,
          shown_spelling: c.spelling,
          round_id: p.lastRoundId,
          tags: [tag],
          difficulty_mode: p.difficultyMode,
        }),
      });
      p.feedbackSent = true;
    } catch (e) {
      p.feedbackTag = null;
      toast(e.message);
    } finally {
      p.feedbackBusy = false;
      renderPuzzle();
    }
  }

  function onPuzzleChoice(choice) {
    const STATE = getState();
    const p = STATE.puzzle;
    const c = p.challenge;
    if (!c || p.revealed || p.recorded) return;
    const correct = String(choice).toLowerCase() === String(c.answer).toLowerCase();
    if (correct) {
      p.revealed = true;
      p.lastGuess = choice;
      p.lastCorrect = true;
      renderPuzzle();
      void recordPuzzleGuess(true, choice);
      return;
    }
    if (p.repairTurns < 1) {
      p.repairTurns += 1;
      p.repairWrong = choice;
      renderPuzzle();
      return;
    }
    p.revealed = true;
    p.lastGuess = choice;
    p.lastCorrect = false;
    renderPuzzle();
    void recordPuzzleGuess(false, choice);
  }

  function renderPuzzle() {
    const STATE = getState();
    const host = $('puzzle-body');
    if (!host) return;
    const p = STATE.puzzle;
    const c = p.challenge;
    const mode = p.difficultyMode ?? 'normal';

    const session = p.session.played
      ? `<span class="puzzle-score">Session <strong>${p.session.recovered}</strong>/${p.session.played}</span>`
      : '';

    const summary = p.summary
      ? `<span class="puzzle-score puzzle-score--muted">All time ${p.summary.recovered}/${p.summary.total_rounds}${p.summary.overall_recovery_rate != null ? ` (${Math.round(p.summary.overall_recovery_rate * 100)}%)` : ''}</span>`
      : '';

    const modeRadios = ['easy', 'normal', 'hard'].map((m) => {
      const label = m === 'easy' ? 'Easy' : m === 'hard' ? 'Hard' : 'Normal';
      return `<label class="puzzle-mode-pill"><input type="radio" name="puzzle-mode" value="${m}"${mode === m ? ' checked' : ''}><span>${label}</span></label>`;
    }).join('');

    let card;
    if (p.busy && !c) {
      card = `<p class="sans puzzle-loading">Picking a word…</p>`;
    } else if (!c) {
      card = `<div class="puzzle-card"><p class="sans">No words to play yet. Run the converged build, then press <strong>New word</strong>.</p></div>`;
    } else {
      const choices = (c.choices ?? [])
        .map((ch) => {
          let cls = 'puzzle-choice';
          if (p.revealed) {
            if (String(ch).toLowerCase() === String(c.answer).toLowerCase()) cls += ' puzzle-choice--correct';
            else if (p.lastGuess && String(ch).toLowerCase() === String(p.lastGuess).toLowerCase()) cls += ' puzzle-choice--wrong';
          }
          const dis = p.revealed || p.recorded ? ' disabled' : '';
          return `<button type="button" class="${cls}" data-puzzle-choice="${escapeHtml(ch)}"${dis}>${escapeHtml(ch)}</button>`;
        })
        .join('');

      const repair =
        p.repairTurns > 0 && !p.revealed
          ? `<div class="puzzle-repair">
               <p class="sans puzzle-repair__lead">Not quite — you picked <strong>${escapeHtml(p.repairWrong ?? '')}</strong>. Here's the literal breakdown; try again.</p>
               ${puzzleBreakdownHtml(c.breakdown)}
               ${puzzleAlternatesHtml(c.alternate_forms)}
             </div>`
          : '';

      const reveal = p.revealed
        ? `<div class="puzzle-reveal ${p.lastCorrect ? 'puzzle-reveal--ok' : 'puzzle-reveal--miss'}">
               <p class="sans">${p.lastCorrect ? 'Recovered' : 'Not recovered'} ${p.repairTurns ? `after ${p.repairTurns} repair turn${p.repairTurns === 1 ? '' : 's'}` : 'on the first try'}. It means <strong>${escapeHtml(c.answer)}</strong>.</p>
               ${puzzleBreakdownHtml(c.breakdown, { reveal: true, parts: c.parts })}
               ${puzzleAlternatesHtml(c.alternate_forms)}
               ${puzzleFeedbackHtml(p, c)}
               <button type="button" class="btn btn--primary" id="puzzle-next">Next word</button>
             </div>`
          : '';

      const conceptFocus = puzzleConceptFromHash();
      const focusBanner = conceptFocus
        ? `<p class="sans puzzle-focus">Testing concept: <strong>${escapeHtml(conceptFocus)}</strong> · <a href="#puzzle">clear filter</a></p>`
        : '';

      card = `<div class="puzzle-card">
            <div class="puzzle-card__toolbar">
              <div class="puzzle-mode-group" role="radiogroup" aria-label="Difficulty">${modeRadios}</div>
              <label class="puzzle-toggle"><input type="checkbox" id="puzzle-core"${p.coreOnly ? ' checked' : ''}> 50-root</label>
              <button type="button" class="btn btn--primary" id="puzzle-new">New word</button>
            </div>
            ${focusBanner}
            <div class="puzzle-word">
              ${puzzleChallengeWordHtml(c, mode)}
            </div>
            <div class="puzzle-choices">${choices}</div>
            ${repair}
            ${reveal}
          </div>`;
    }

    host.innerHTML = `
        <div class="puzzle-layout content-page">
          <header class="puzzle-header">
            <div class="puzzle-header__text">
              <p class="puzzle-header__tag">Learn</p>
              <h1 class="puzzle-header__title">Puzzle Conversation</h1>
            </div>
            <div class="puzzle-header__stats">${session}${summary}</div>
          </header>
          ${card}
        </div>`;

    host.querySelectorAll('[data-puzzle-choice]').forEach((btn) => {
      btn.addEventListener('click', () => onPuzzleChoice(btn.dataset.puzzleChoice));
    });
    host.querySelectorAll('[data-feedback-tag]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void submitFeedbackTag(btn.dataset.feedbackTag);
      });
    });
    $('puzzle-new')?.addEventListener('click', () => {
      void loadPuzzleChallenge();
    });
    $('puzzle-next')?.addEventListener('click', () => {
      void loadPuzzleChallenge();
    });
    $('puzzle-core')?.addEventListener('change', (e) => {
      p.coreOnly = e.target.checked;
      void loadPuzzleChallenge();
    });
    host.querySelectorAll('input[name="puzzle-mode"]').forEach((input) => {
      input.addEventListener('change', (e) => {
        p.difficultyMode = e.target.value;
        if (p.difficultyMode === 'hard') void ensureRules().then(() => renderPuzzle());
        else renderPuzzle();
      });
    });
    if (p.revealed && c?.parts?.length) {
      wireBreakdownHear(host.querySelector('.puzzle-reveal'), c.parts);
    }
    if (!c && !p.busy && STATE.lab) {
      void loadPuzzleChallenge();
    }
  }

  return { renderPuzzle, loadPuzzleChallenge };
}
