/**
 * Learn section routing constants (classic script — loaded before nav-boot.js).
 * ESM consumers: import from ./learn-routing.js
 */
(function () {
  const LEARN_HUB_TAB = 'learn-home';

  const LEARN_SCRIPT_SKILL_IDS = ['script-sounds', 'script-writing', 'script-words'];
  const LEARN_FONORAN_SKILL_IDS = [
    'fonoran-reading',
    'fonoran-writing',
    'fonoran-hearing',
    'fonoran-grammar',
    'fonoran-speaking',
  ];

  /** Learn home section anchors (scroll targets, not lesson tabs). */
  const LEARN_SECTION_HASHES = ['fonora-script', 'fonoran-language'];

  const LEARN_SKILL_IDS = [...LEARN_SCRIPT_SKILL_IDS, ...LEARN_FONORAN_SKILL_IDS];

  const LEARN_PANEL_MAP = {
    [LEARN_HUB_TAB]: LEARN_HUB_TAB,
    'script-writing': 'script-writing',
    'script-sounds': 'quiz',
    'script-words': 'script-reading-words',
    'fonoran-reading': 'fonoran-reading',
    'fonoran-writing': 'spelling-practice',
    'fonoran-hearing': 'fonoran-hearing',
    'fonoran-grammar': 'fonoran-grammar',
    'fonoran-speaking': 'fonoran-speaking',
  };

  /** Hashes that redirect from /learn to /tools */
  const LEARN_TO_TOOLS_REDIRECT = {
    breakdown: 'breakdown',
    speaking: 'breakdown',
    listening: 'samples',
    samples: 'samples',
  };

  /** @type {Record<string, string>} legacy hash → current nav tab id */
  const LEGACY_LEARN_HASH = {
    'learn-home': LEARN_HUB_TAB,
    quiz: 'script-sounds',
    reading: 'script-sounds',
    'script-reading': 'script-sounds',
    writing: 'fonoran-writing',
    'spelling-practice': 'fonoran-writing',
    breakdown: 'breakdown',
    listening: 'samples',
    samples: 'samples',
    speaking: 'breakdown',
  };

  const LEARN_LEGACY_HASHES = Object.keys(LEGACY_LEARN_HASH);

  const LEARN_REDIRECT_HASHES = [
    ...LEARN_LEGACY_HASHES,
    ...LEARN_SKILL_IDS,
    ...LEARN_SECTION_HASHES,
    LEARN_HUB_TAB,
    ...Object.keys(LEARN_TO_TOOLS_REDIRECT),
  ];

  /** @param {string} tabId */
  function learnTrackForTab(tabId) {
    if (tabId === LEARN_HUB_TAB) return 'hub';
    if (LEARN_SCRIPT_SKILL_IDS.includes(tabId)) return 'script';
    if (LEARN_FONORAN_SKILL_IDS.includes(tabId)) return 'fonoran';
    return 'hub';
  }

  window.FONORA_LEARN_ROUTING = {
    LEARN_HUB_TAB,
    LEARN_SCRIPT_SKILL_IDS,
    LEARN_FONORAN_SKILL_IDS,
    LEARN_SKILL_IDS,
    LEARN_PANEL_MAP,
    LEARN_TO_TOOLS_REDIRECT,
    LEGACY_LEARN_HASH,
    LEARN_LEGACY_HASHES,
    LEARN_SECTION_HASHES,
    LEARN_REDIRECT_HASHES,
    LEARN_DEFAULT_TAB: LEARN_HUB_TAB,
    learnTrackForTab,
  };
})();
