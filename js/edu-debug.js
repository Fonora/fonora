/**
 * EDU_DEBUG_MODE — server flag exposed to the browser for fast lesson QA.
 * When enabled, all learn answers count as correct and advance immediately.
 */

let eduDebugMode = false;

/** Load /api/learn/config once at startup. */
export async function initEduDebug() {
  try {
    const res = await fetch('/api/learn/config');
    if (!res.ok) return;
    const data = await res.json();
    eduDebugMode = Boolean(data.eduDebugMode);
    if (eduDebugMode) {
      document.documentElement.setAttribute('data-edu-debug', 'true');
    }
  } catch {
    /* offline or static preview */
  }
}

/** @returns {boolean} */
export function isEduDebugMode() {
  return eduDebugMode;
}

/** @param {boolean} correct */
export function effectiveAnswerCorrect(correct) {
  return eduDebugMode ? true : correct;
}

/** Auto-advance delay after a correct answer (ms). */
export function learnAutoAdvanceDelayMs() {
  if (eduDebugMode) return 0;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 800;
}
