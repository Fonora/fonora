/**
 * Shared vocabulary filter logic for Dictionary and Tools > Words.
 */

import { experienceMetaFor } from '../tools/fonoran-experience-tiers.js';

export const LAB_TYPE_FILTER_KEYS = ['core', 'roots', 'words', 'particles'];
export const LAB_STATUS_FILTER_KEYS = ['needs_review', 'approved', 'rejected', 'reconsider', 'proposals'];

export const UI_TIER_LABELS = {
  communicative_core: 'Core',
  extended_core: 'Ring 2',
  fluent_core: 'Ring 3',
  complete: 'Ring 3',
};

/** @typedef {'sound'|'compound'|'particle'|'proposal'} LabEntryKind */

/**
 * @param {'dictionary'|'words'} surface
 */
export function createDefaultFilterState(surface = 'dictionary') {
  if (surface === 'words') {
    return {
      showCore: true,
      showRoots: true,
      showWords: true,
      showParticles: false,
      showNeedsReview: false,
      showApproved: false,
      showRejected: false,
      showReconsider: false,
      showProposals: false,
    };
  }
  return {
    showCore: false,
    showRoots: true,
    showWords: true,
    showParticles: false,
    showNeedsReview: false,
    showApproved: false,
    showRejected: false,
    showReconsider: false,
    showProposals: false,
  };
}

/**
 * @param {string} key
 * @param {ReturnType<typeof createDefaultFilterState>} filterState
 */
export function toggleFilterKey(key, filterState) {
  const map = {
    core: 'showCore',
    roots: 'showRoots',
    words: 'showWords',
    particles: 'showParticles',
    needs_review: 'showNeedsReview',
    approved: 'showApproved',
    rejected: 'showRejected',
    reconsider: 'showReconsider',
    proposals: 'showProposals',
  };
  const field = map[key];
  if (!field) return false;
  filterState[field] = !filterState[field];
  return true;
}

/**
 * @param {string} key
 * @param {ReturnType<typeof createDefaultFilterState>} filterState
 */
export function isFilterActive(key, filterState) {
  const map = {
    core: 'showCore',
    roots: 'showRoots',
    words: 'showWords',
    particles: 'showParticles',
    needs_review: 'showNeedsReview',
    approved: 'showApproved',
    rejected: 'showRejected',
    reconsider: 'showReconsider',
    proposals: 'showProposals',
  };
  const field = map[key];
  return field ? Boolean(filterState[field]) : false;
}

/**
 * @param {string|null|undefined} conceptId
 * @param {(id: string) => { language_tier?: string } | null | undefined} tierFor
 */
export function isCoreConcept(conceptId, tierFor) {
  if (!conceptId) return false;
  const tier = tierFor(conceptId)?.language_tier
    ?? experienceMetaFor(conceptId)?.language_tier;
  return tier === 'communicative_core';
}

/**
 * @param {{ kind: LabEntryKind, state?: string, concept_id?: string, reconsider?: boolean, isProposal?: boolean }} entry
 * @param {ReturnType<typeof createDefaultFilterState>} filterState
 */
export function passesStatusFilter(entry, filterState) {
  if (entry.kind === 'proposal' || entry.isProposal) {
    return filterState.showProposals;
  }

  const active = [];
  if (filterState.showNeedsReview) active.push('needs_review', 'draft');
  if (filterState.showApproved) active.push('approved', 'revised');
  if (filterState.showRejected) active.push('rejected');
  const reconsiderActive = filterState.showReconsider;

  if (!active.length && !reconsiderActive) {
    if (entry.reconsider) return false;
    return entry.state !== 'rejected';
  }

  if (entry.reconsider && reconsiderActive) return true;

  if (active.length && active.includes(entry.state ?? '')) return true;

  return false;
}

/**
 * @param {{ kind: LabEntryKind, concept_id?: string }} entry
 * @param {ReturnType<typeof createDefaultFilterState>} filterState
 * @param {(id: string) => { language_tier?: string } | null | undefined} tierFor
 */
export function passesTypeFilter(entry, filterState, tierFor) {
  if (entry.kind === 'particle') return filterState.showParticles;
  if (entry.kind === 'proposal') return filterState.showProposals;
  if (entry.kind === 'compound') return filterState.showWords;
  if (entry.kind === 'sound') {
    if (!filterState.showRoots && !filterState.showCore) return false;
    if (filterState.showRoots && !filterState.showCore) return true;
    if (!filterState.showRoots && filterState.showCore) {
      return isCoreConcept(entry.concept_id, tierFor);
    }
    if (filterState.showRoots && filterState.showCore) {
      return isCoreConcept(entry.concept_id, tierFor);
    }
  }
  return false;
}

/**
 * @param {object} entry
 * @param {ReturnType<typeof createDefaultFilterState>} filterState
 * @param {(id: string) => object | null | undefined} tierFor
 */
export function passesLabFilters(entry, filterState, tierFor) {
  return passesTypeFilter(entry, filterState, tierFor)
    && passesStatusFilter(entry, filterState);
}

/**
 * Map legacy dictionary STATE fields into filter state object.
 */
export function dictStateToFilters(dictState) {
  return {
    showCore: Boolean(dictState.dictCoreOnly),
    showRoots: Boolean(dictState.dictShowRoots),
    showWords: Boolean(dictState.dictShowWords),
    showParticles: Boolean(dictState.dictShowParticles),
    showNeedsReview: Boolean(dictState.dictShowNeedsReview),
    showApproved: Boolean(dictState.dictShowApproved),
    showRejected: Boolean(dictState.dictShowRejected),
    showReconsider: Boolean(dictState.dictShowReconsider),
    showProposals: false,
  };
}

/**
 * Sync filter state back into dictionary STATE.
 */
export function filtersToDictState(filterState, dictState) {
  dictState.dictCoreOnly = filterState.showCore && filterState.showRoots
    ? filterState.showCore
    : filterState.showCore;
  dictState.dictShowRoots = filterState.showRoots;
  dictState.dictShowWords = filterState.showWords;
  dictState.dictShowParticles = filterState.showParticles;
  dictState.dictShowNeedsReview = filterState.showNeedsReview;
  dictState.dictShowApproved = filterState.showApproved;
  dictState.dictShowRejected = filterState.showRejected;
  dictState.dictShowReconsider = filterState.showReconsider;
}
