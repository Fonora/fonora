/**
 * Learn section routing — ESM wrapper around learn-routing-data.js constants.
 */

const R = window.FONORA_LEARN_ROUTING;

if (!R) {
  throw new Error('learn-routing-data.js must load before learn-routing.js');
}

export const LEARN_HUB_TAB = R.LEARN_HUB_TAB;
export const LEARN_SCRIPT_SKILL_IDS = new Set(R.LEARN_SCRIPT_SKILL_IDS);
export const LEARN_FONORAN_SKILL_IDS = new Set(R.LEARN_FONORAN_SKILL_IDS);
export const LEARN_SKILL_IDS = new Set(R.LEARN_SKILL_IDS);
export const LEARN_PUZZLE_TAB = R.LEARN_PUZZLE_TAB;
export const LEARN_TAB_IDS = new Set(R.LEARN_TAB_IDS);
export const LEARN_PANEL_MAP = R.LEARN_PANEL_MAP;
export const LEARN_TO_TOOLS_REDIRECT = R.LEARN_TO_TOOLS_REDIRECT;
export const LEGACY_LEARN_HASH = R.LEGACY_LEARN_HASH;
export const LEARN_SECTION_HASHES = new Set(R.LEARN_SECTION_HASHES);
export const LEARN_LESSON_PANEL_IDS = new Set(
  Object.values(R.LEARN_PANEL_MAP).filter((id) => id !== R.LEARN_HUB_TAB),
);
export const LEARN_REDIRECT_HASHES = R.LEARN_REDIRECT_HASHES;
export const LEARN_DEFAULT_TAB = R.LEARN_DEFAULT_TAB;
export const LEARN_SCRIPT_SKILL_ORDER = R.LEARN_SCRIPT_SKILL_IDS;
export const LEARN_FONORAN_SKILL_ORDER = R.LEARN_FONORAN_SKILL_IDS;
export const learnTrackForTab = R.learnTrackForTab;

/** @param {string} tabId */
export function resolveLearnNavTab(tabId) {
  if (tabId === LEARN_HUB_TAB) return LEARN_HUB_TAB;
  if (LEARN_TAB_IDS.has(tabId)) return tabId;
  if (LEGACY_LEARN_HASH[tabId] && !LEARN_TO_TOOLS_REDIRECT[tabId]) {
    return LEGACY_LEARN_HASH[tabId];
  }
  return LEARN_DEFAULT_TAB;
}

/** @param {string} tabId */
export function resolveLearnPanelId(tabId) {
  const navTab = resolveLearnNavTab(tabId);
  return LEARN_PANEL_MAP[navTab] ?? LEARN_PANEL_MAP[LEARN_DEFAULT_TAB];
}

/** @param {string} tabId */
export function normalizeLearnTab(tabId) {
  const navTab = resolveLearnNavTab(tabId);
  return { navTab, panelId: LEARN_PANEL_MAP[navTab] ?? LEARN_PANEL_MAP[LEARN_DEFAULT_TAB] };
}

/** @param {string} hash */
export function learnHashToNavTab(hash) {
  if (!hash) return LEARN_DEFAULT_TAB;
  if (hash === LEARN_HUB_TAB) return LEARN_HUB_TAB;
  if (LEARN_SECTION_HASHES.has(hash)) return LEARN_HUB_TAB;
  if (LEARN_TAB_IDS.has(hash)) return hash;
  if (LEARN_TO_TOOLS_REDIRECT[hash]) return hash;
  if (LEGACY_LEARN_HASH[hash]) return LEGACY_LEARN_HASH[hash];
  return LEARN_DEFAULT_TAB;
}

/** @param {string} navTab */
export function learnNavTabToHash(navTab) {
  if (navTab === LEARN_DEFAULT_TAB) return '';
  return `#${navTab}`;
}

/** @param {string} hash */
export function learnHashRedirectsToTools(hash) {
  return Boolean(hash && LEARN_TO_TOOLS_REDIRECT[hash]);
}

/** @param {string} hash */
export function toolsTabForLearnLegacyHash(hash) {
  return LEARN_TO_TOOLS_REDIRECT[hash] ?? null;
}
