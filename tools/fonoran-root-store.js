/**
 * Store for Fonoran root candidate review workflow.
 */

import { romanToIpa, parseSyllable } from './fonoran-pronunciation.js';
import { readDoc, writeDoc } from './fonoran-store.js';
import {
  buildSyllablePool,
  easeLabel,
  pronunciationEaseScore,
  regenerateRoot,
  usefulnessLabel,
} from './fonoran-root-sound-assign.js';
import { addSound, patchSound, loadBucket, consolidateConceptSound } from './fonoran-sound-bucket.js';
import { labSoundsByConceptId, labSoundState } from './fonoran-concepts.js';
import { generateRootCandidates } from './fonoran-root-candidates.js';
import { loadCollisionProfile } from './fonoran-root-collision.js';
import { buildCompoundPartnerMap } from './fonoran-root-boundary-score.js';

function refreshSummary(store) {
  store.summary = {
    total: store.candidates.length,
    pending: store.candidates.filter(c => c.status === 'pending').length,
    approved: store.candidates.filter(c => c.status === 'approved').length,
    rejected: store.candidates.filter(c => c.status === 'rejected').length,
  };
  return store;
}

function findCandidate(store, id) {
  const c = store.candidates.find(x => x.id === id);
  if (!c) throw new Error(`Unknown root candidate: ${id}`);
  return c;
}

/**
 * Spellings that a regenerated root must avoid: every approved, pending, and
 * rejected spelling — including the candidate's own current spelling, so
 * regenerate always produces something different.
 */
function usedSpellings(store) {
  return store.candidates
    .filter(c => c.spelling && ['approved', 'pending', 'rejected'].includes(c.status))
    .map(c => c.spelling.toLowerCase());
}

function validateSpelling(spelling) {
  const sp = spelling?.trim().toLowerCase();
  if (!sp) throw new Error('spelling required');
  const syl = parseSyllable(sp);
  if (!syl || syl.unparsed) throw new Error(`Not a valid Fonoran syllable: ${sp}`);
  return sp;
}

async function syncToLab(candidate) {
  const meaning = candidate.concept?.trim() || candidate.id;
  try {
    await addSound({ spelling: candidate.spelling, meaning, concept_id: candidate.id });
  } catch (err) {
    if (!String(err.message).includes('already exists')) throw err;
  }
  await patchSound(candidate.spelling, { meaning, state: 'approved', concept_id: candidate.id });
  await consolidateConceptSound(candidate.id, candidate.spelling, { meaning, state: 'approved' });
}

async function writeCanonicalFromApproved(store) {
  const approved = store.candidates.filter(c => c.status === 'approved');
  const canonical = {
    version: '1.0-approved-roots',
    updated_at: new Date().toISOString(),
    philosophy: 'Only human-approved roots from Root Review are canonical.',
    root_count: approved.length,
    roots: approved.map(c => ({
      id: c.id,
      spelling: c.spelling,
      ipa: c.ipa,
      concept: c.concept,
      domain: c.domain,
      reason: c.reason,
      approved_at: c.review?.approved_at,
    })),
  };
  await writeDoc('approved_roots', canonical);
  return canonical;
}

export async function getRootCandidates({ status = null } = {}) {
  const store = await readDoc('root_candidates');
  if (!store) {
    return { version: '1.0-root-workflow', candidates: [], summary: { total: 0, pending: 0, approved: 0, rejected: 0 } };
  }
  let candidates = store.candidates ?? [];
  if (status) candidates = candidates.filter(c => c.status === status);
  return { ...store, candidates };
}

export async function getCanonicalRoots() {
  return (await readDoc('approved_roots')) ?? { version: '1.0-approved-roots', roots: [], root_count: 0 };
}

export async function getRootCandidate(id) {
  const store = await readDoc('root_candidates');
  if (!store) throw new Error('No root candidates file. Run npm run fonoran:root-candidates');
  return findCandidate(store, id);
}

export async function regenerateRootCandidate(id, { force = false } = {}) {
  const store = await readDoc('root_candidates');
  if (!store) throw new Error('No root candidates file');
  const candidate = findCandidate(store, id);
  if (!force && candidate.status === 'approved') throw new Error('Cannot regenerate an approved root');
  if (candidate.suggested_status === 'compound_candidate') {
    throw new Error('Compound candidates are not eligible for a root. Promote to a primitive first.');
  }

  const phoneticsConfig = await readDoc('phonetics_config');
  const pool = buildSyllablePool(phoneticsConfig);
  // Excludes the current spelling plus every other approved/pending/rejected form.
  const taken = usedSpellings(store);

  const profileId = phoneticsConfig.collision_profile ?? 'en';
  const collisionProfile = await loadCollisionProfile(profileId);
  const compoundsDoc = (await readDoc('compounds')) ?? { compounds: [] };
  const partnerMap = buildCompoundPartnerMap(compoundsDoc.compounds ?? []);
  const spellingByConcept = {};
  for (const c of store.candidates) {
    if (c.id !== id && c.spelling && c.status !== 'rejected') spellingByConcept[c.id] = c.spelling;
  }

  // Use the global priority span so cost targeting matches bulk generation.
  const priorities = store.candidates.map(c => c.priority).filter(p => typeof p === 'number');
  const minP = priorities.length ? Math.min(...priorities) : (candidate.priority ?? 0);
  const maxP = priorities.length ? Math.max(...priorities) : (candidate.priority ?? 1000);

  const concept = {
    id: candidate.id,
    gloss: candidate.concept,
    domain: candidate.domain,
    priority: candidate.priority ?? 500,
    priority_weight: candidate.priority_weight ?? null,
  };

  const best = regenerateRoot(concept, pool, phoneticsConfig, taken, {
    minP,
    maxP,
    collisionProfile,
    partnerMap,
    spellingByConcept,
  });
  const newSpelling = best.root;
  const template = best.template ?? 'CV';
  const cost = best.phonetic_cost ?? null;
  const pronScore = pronunciationEaseScore(cost, template);
  const scores = best.scores ?? {};

  candidate.spelling = newSpelling;
  candidate.ipa = romanToIpa(newSpelling);
  candidate.pronunciation_ease = pronScore;
  candidate.pronunciation_ease_label = easeLabel(pronScore);
  candidate.status = 'pending';
  candidate.generation = {
    phonetic_cost: cost,
    template,
    tier: best.tier ?? null,
    eligible: true,
    distinctiveness_score: scores.distinctiveness_score ?? null,
    editorial_collision_score: scores.editorial_collision_score ?? null,
    compound_flow_score: scores.compound_flow_score ?? null,
    collision_profile: profileId,
  };
  candidate.collision_warnings = scores.collision_warnings ?? [];
  candidate.boundary_warnings = scores.boundary_warnings ?? [];
  candidate.review = { ...candidate.review, edited_at: new Date().toISOString(), note: 'regenerated' };

  refreshSummary(store);
  await writeDoc('root_candidates', store);
  return candidate;
}

export async function patchRootCandidate(id, body) {
  const store = await readDoc('root_candidates');
  if (!store) throw new Error('No root candidates file');
  const candidate = findCandidate(store, id);
  const action = body.action;

  if (action === 'approve') {
    const spelling = validateSpelling(body.spelling ?? candidate.spelling);
    const dup = store.candidates.find(c => c.id !== id && c.spelling === spelling && c.status === 'approved');
    if (dup) throw new Error(`Spelling "${spelling}" already approved for ${dup.id}`);

    candidate.spelling = spelling;
    candidate.ipa = body.ipa?.trim() || romanToIpa(spelling);
    if (body.concept?.trim()) candidate.concept = body.concept.trim();
    candidate.status = 'approved';
    candidate.review = {
      ...candidate.review,
      approved_at: new Date().toISOString(),
      note: body.note?.trim() || candidate.review?.note || null,
    };
    await syncToLab(candidate);
    await writeCanonicalFromApproved(store);
  } else if (action === 'reject') {
    candidate.status = 'rejected';
    candidate.review = {
      ...candidate.review,
      rejected_at: new Date().toISOString(),
      note: body.note?.trim() || null,
    };
    try {
      await patchSound(candidate.spelling, { state: 'rejected' });
    } catch {
      /* lab sound may not exist yet */
    }
    await writeCanonicalFromApproved(store);
  } else if (action === 'edit') {
    const prevSpelling = candidate.spelling;
    if (body.spelling != null) candidate.spelling = validateSpelling(body.spelling);
    if (body.ipa?.trim()) candidate.ipa = body.ipa.trim();
    else if (body.spelling != null) candidate.ipa = romanToIpa(candidate.spelling);
    if (body.concept?.trim()) candidate.concept = body.concept.trim();
    if (body.reason?.trim()) candidate.reason = body.reason.trim();
    candidate.review = { ...candidate.review, edited_at: new Date().toISOString(), note: body.note?.trim() || null };
    if (candidate.status === 'rejected') candidate.status = 'pending';
    if (candidate.status === 'approved') {
      const spellingChanged = candidate.spelling !== prevSpelling;
      const meaning = candidate.concept?.trim() || candidate.id;
      if (spellingChanged) {
        try {
          await patchSound(prevSpelling, {
            new_spelling: candidate.spelling,
            meaning,
            state: 'approved',
            concept_id: candidate.id,
          });
        } catch (err) {
          if (String(err.message).includes('Unknown sound')) {
            await addSound({ spelling: candidate.spelling, meaning, concept_id: candidate.id });
            await patchSound(candidate.spelling, { meaning, state: 'approved', concept_id: candidate.id });
          } else {
            throw err;
          }
        }
      } else {
        await syncToLab(candidate);
      }
      await writeCanonicalFromApproved(store);
    }
  } else if (action === 'reopen') {
    candidate.status = 'pending';
    candidate.review = { ...candidate.review, rejected_at: null };
  } else {
    throw new Error('action must be approve, reject, edit, or reopen');
  }

  refreshSummary(store);
  await writeDoc('root_candidates', store);
  return candidate;
}

export async function runRootCandidateGeneration() {
  return generateRootCandidates({ preserveReview: true });
}

/**
 * Keep the candidate queue aligned when lab roots are approved/rejected.
 * Called from the lab API after sound state changes.
 */
export async function syncCandidateFromLab({ concept_id, spelling, state }) {
  if (!concept_id?.trim()) return null;
  const store = await readDoc('root_candidates');
  if (!store?.candidates?.length) return null;

  const candidate = store.candidates.find(c => c.id === concept_id.trim());
  if (!candidate) return null;

  const now = new Date().toISOString();
  if (state === 'approved' || state === 'revised') {
    if (spelling?.trim()) {
      candidate.spelling = validateSpelling(spelling);
      candidate.ipa = romanToIpa(candidate.spelling);
    }
    if (candidate.status !== 'approved') {
      candidate.status = 'approved';
      candidate.review = { ...candidate.review, approved_at: now };
    }
    await writeCanonicalFromApproved(store);
  } else if (state === 'rejected') {
    candidate.status = 'rejected';
    candidate.review = { ...candidate.review, rejected_at: now };
    await writeCanonicalFromApproved(store);
  } else if (spelling?.trim()) {
    candidate.spelling = validateSpelling(spelling);
    candidate.ipa = romanToIpa(candidate.spelling);
    candidate.review = { ...candidate.review, edited_at: now };
  }

  refreshSummary(store);
  await writeDoc('root_candidates', store);
  return candidate;
}

/** @deprecated Editorial state is unified in Postgres; kept as one-shot repair. */
export async function reconcileInventoryFromLab() {
  const bucket = await loadBucket();
  const items = [];
  for (const [conceptId, s] of labSoundsByConceptId(bucket)) {
    const state = labSoundState(s);
    if (state === 'rejected') continue;
    const synced = await syncCandidateFromLab({
      concept_id: conceptId,
      spelling: s.spelling,
      state,
    });
    if (synced) {
      items.push({ concept_id: conceptId, spelling: s.spelling, state });
    }
  }
  return { reconciled: items.length, items, deprecated: true };
}
