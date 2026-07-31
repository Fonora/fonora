/**
 * Defer expensive optional setup until someone is actually here.
 *
 * The neural voice is a 44 MB bundle plus a model fetched from a CDN, and three
 * pages warmed it while building the page. That put all of it in front of the
 * first paint for every visitor, including the many who never play a sound.
 *
 * Waiting for a pointer to cross the page or focus to land on a control still
 * fires well before anyone reaches the Listen button, so audio is normally ready
 * when it is finally asked for, and a visit that never touches audio never pays
 * for it. Playback does not depend on this: `synthesizePiperIpa` initialises the
 * voice itself, so the worst case is a short wait on the first play.
 */
/**
 * `focusin` is deliberately absent: an autofocused field fires it while the page is
 * still loading, which would make this warm immediately and defeat the point. A
 * keyboard user tabbing in produces `keydown` first, so nobody is left out.
 */
const INTENT_EVENTS = ['pointerover', 'pointerdown', 'keydown', 'touchstart'];

/**
 * Run `task` once, shortly after the first sign of a real visitor.
 *
 * @param {() => void} task
 */
export function warmOnEngage(task) {
  let started = false;

  const start = () => {
    if (started) return;
    started = true;
    for (const type of INTENT_EVENTS) document.removeEventListener(type, start, true);

    const run = () => { try { task(); } catch { /* warming is best effort */ } };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 300);
  };

  for (const type of INTENT_EVENTS) document.addEventListener(type, start, true);
}
