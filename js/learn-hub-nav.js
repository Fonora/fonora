/**
 * Learn hub sub-navigation: About · Read & Write · Speak · Progress.
 */
import { LEARN_HUB_TAB, learnTrackForTab } from './learn-routing.js';

/** @type {(() => void) | null} */
let afterHubNavigate = null;

/** Register a callback after hub navigation (e.g. refresh header nav). */
export function registerLearnHubNavigateHook(fn) {
  afterHubNavigate = fn;
}

/** @typedef {'hub' | 'script' | 'fonoran' | 'progress'} LearnHubView */

/** Page toolbar copy per hub view (matches site page-toolbar pattern). */
const LEARN_PAGE_HEADERS = {
  hub: {
    title: 'Learn',
    lead: 'Two independent paths. Start with either one.',
  },
  script: {
    title: 'Read & Write',
    lead: 'Learn the Fonora script.',
  },
  fonoran: {
    title: 'Speak',
    lead: 'Learn the Fonoran language.',
  },
  progress: {
    title: 'Progress',
    lead: 'Your streak, XP, and learning paths.',
  },
};

/** @param {LearnHubView} view */
function updateLearnPageHeader(view) {
  const meta = LEARN_PAGE_HEADERS[view] ?? LEARN_PAGE_HEADERS.hub;
  if (view === 'hub') {
    const titleEl = document.getElementById('learn-home-title');
    const leadEl = document.getElementById('learn-home-lead');
    if (titleEl) titleEl.textContent = meta.title;
    if (leadEl) leadEl.textContent = meta.lead;
    return;
  }
  document.querySelectorAll('[data-learn-subview-title]').forEach((el) => {
    el.textContent = meta.title;
  });
  document.querySelectorAll('[data-learn-subview-lead]').forEach((el) => {
    el.textContent = meta.lead;
  });
}

/** @param {LearnHubView} view */
export function setLearnHubView(view) {
  document.documentElement.setAttribute('data-learn-hub-view', view);
  document.querySelectorAll('[data-learn-hub-panel]').forEach((el) => {
    const panel = el.getAttribute('data-learn-hub-panel');
    el.hidden = panel !== view;
  });
  updateLearnPageHeader(view);
}

/**
 * True when the user is on the Learn About hub (not a subview or active lesson).
 * @param {string} activeTab
 */
export function isOnLearnAbout(activeTab) {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path !== '/learn' && !path.startsWith('/learn/')) return false;
  const hash = window.location.hash.replace(/^#/, '');
  if (hash && hash !== 'learn-home') return false;
  if (activeTab !== LEARN_HUB_TAB) return false;
  return learnHubNavActive(activeTab) === 'hub';
}

/** Sync hub panels from the location hash (on Learn home only). */
export function syncLearnHubViewFromHash() {
  const hash = window.location.hash.replace(/^#/, '');
  /** @type {LearnHubView} */
  let view = 'hub';
  if (hash === 'fonora-script') view = 'script';
  else if (hash === 'fonoran-language') view = 'fonoran';
  else if (hash === 'learn-progress') view = 'progress';
  setLearnHubView(view);
}

/**
 * Which Learn sub-nav item is active for the current tab / hash.
 * @param {string} activeTab
 * @returns {LearnHubView}
 */
export function learnHubNavActive(activeTab) {
  if (activeTab === LEARN_HUB_TAB) {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash === 'fonora-script') return 'script';
    if (hash === 'fonoran-language') return 'fonoran';
    if (hash === 'learn-progress') return 'progress';
    return 'hub';
  }
  const track = learnTrackForTab(activeTab);
  if (track === 'script') return 'script';
  if (track === 'fonoran') return 'fonoran';
  return 'hub';
}

/**
 * Navigate to a Learn hub view (About, Script track list, Language track list, or Progress).
 * @param {LearnHubView} view
 */
export function navigateLearnHub(view) {
  const sectionHash = view === 'hub'
    ? ''
    : view === 'script'
      ? 'fonora-script'
      : view === 'fonoran'
        ? 'fonoran-language'
        : 'learn-progress';
  const url = `/learn${sectionHash ? `#${sectionHash}` : ''}${window.location.search}`;
  history.replaceState(null, '', url);
  setLearnHubView(view);

  const learnHomePanel = document.getElementById('tab-learn-home');
  const onLearnHome = learnHomePanel && !learnHomePanel.hidden;

  if (onLearnHome) {
    afterHubNavigate?.();
  } else if (typeof window.showTab === 'function') {
    window.showTab(LEARN_HUB_TAB);
  }

  window.scrollTo(0, 0);
}

/** Wire hub CTA buttons inside the Learn home panel. */
export function wireLearnHubControls() {
  document.querySelectorAll('[data-learn-hub-go]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      const view = el.getAttribute('data-learn-hub-go');
      if (view === 'script' || view === 'fonoran' || view === 'hub' || view === 'progress') {
        navigateLearnHub(view);
      }
    });
  });
}
