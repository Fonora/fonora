/**
 * Unified word view: merges concept inventory, root candidates, lab sounds/compounds, aliases.
 */

import { loadConceptInventory } from './fonoran-concepts.js';
import { getRootCandidates } from './fonoran-root-store.js';
import { getLab } from './fonoran-sound-bucket.js';
import { readDoc } from './fonoran-store.js';
import { loadParticles } from './fonoran-particles.js';
import { getVoteAggregate } from './fonoran-community-store.js';
import { listProposals } from './fonoran-community-store.js';

function lifecycleForConcept(concept, candidate, sound) {
  if (sound?.state === 'approved') return 'approved';
  if (sound?.state === 'rejected') return 'rejected';
  if (sound?.state === 'needs_review' || sound?.state === 'draft' || sound?.state === 'revised') {
    return 'in_lab_needs_review';
  }
  if (candidate?.status === 'pending') return 'candidate_pending';
  if (candidate?.status === 'approved' && !sound) return 'candidate_approved';
  if (candidate?.status === 'rejected') return 'rejected';
  return 'concept_only';
}

export async function listWordInventory({ filter = 'all', query = '' } = {}) {
  const [inventory, candidatesDoc, lab, localization, particlesDoc, openProposals] = await Promise.all([
    loadConceptInventory(),
    getRootCandidates({ status: null }),
    getLab(),
    readDoc('localization_en'),
    loadParticles(),
    listProposals({ status: 'open', limit: 500 }),
  ]);

  const concepts = inventory?.concepts ?? [];
  const candidates = candidatesDoc?.candidates ?? [];
  const candidateByConcept = new Map(candidates.map(c => [c.concept ?? c.id, c]));
  const soundByConcept = new Map(
    (lab?.sounds ?? []).filter(s => s.concept_id).map(s => [s.concept_id, s]),
  );
  const aliases = localization?.concepts ?? localization ?? {};

  /** @type {object[]} */
  const items = [];

  for (const concept of concepts) {
    const id = concept.id ?? concept.concept;
    if (!id) continue;
    const candidate = candidateByConcept.get(id) ?? null;
    const sound = soundByConcept.get(id) ?? null;
    const lifecycle = lifecycleForConcept(concept, candidate, sound);
    items.push({
      kind: 'root',
      id,
      ref: id,
      concept_id: id,
      spelling: sound?.spelling ?? candidate?.spelling ?? concept.spelling ?? '',
      meaning: concept.gloss ?? concept.meaning ?? id,
      domain: concept.domain ?? null,
      aliases: aliases[id]?.aliases ?? aliases[id] ?? [],
      lifecycle,
      state: sound?.state ?? candidate?.status ?? 'concept',
      candidate_id: candidate?.id ?? null,
      sound_id: sound?.id ?? null,
    });
  }

  for (const compound of lab?.compounds ?? []) {
    items.push({
      kind: 'compound',
      id: compound.id,
      ref: compound.id,
      spelling: compound.spelling ?? '',
      meaning: compound.meaning ?? '',
      aliases: compound.aliases ?? [],
      lifecycle: compound.state === 'approved' ? 'approved'
        : compound.state === 'rejected' ? 'rejected'
          : 'in_lab_needs_review',
      state: compound.state ?? 'needs_review',
      components: compound.components ?? [],
      parts: compound.parts ?? [],
      generator_hint: compound.generator_hint ?? null,
      concept_id: compound.concept_id ?? null,
    });
  }

  for (const p of particlesDoc?.particles ?? []) {
    items.push({
      kind: 'particle',
      id: p.id ?? p.spelling,
      ref: p.spelling ?? p.id,
      spelling: p.spelling ?? '',
      meaning: p.gloss ?? p.meaning ?? p.role ?? '',
      aliases: [],
      lifecycle: 'approved',
      state: 'approved',
      editable: false,
    });
  }

  for (const prop of openProposals) {
    items.push({
      kind: 'proposal',
      id: prop.id,
      ref: prop.id,
      target_type: prop.target_type,
      target_ref: prop.target_ref,
      proposal_kind: prop.kind,
      lifecycle: 'proposal_open',
      state: 'open',
      payload: prop.payload,
      rationale: prop.rationale,
      created_at: prop.created_at,
    });
  }

  const q = query.trim().toLowerCase();
  let filtered = items;
  if (filter === 'roots') filtered = items.filter(i => i.kind === 'root');
  else if (filter === 'compounds') filtered = items.filter(i => i.kind === 'compound');
  else if (filter === 'particles') filtered = items.filter(i => i.kind === 'particle');
  else if (filter === 'queue') {
    filtered = items.filter(i =>
      i.lifecycle === 'in_lab_needs_review'
      || i.lifecycle === 'candidate_pending'
      || i.lifecycle === 'proposal_open',
    );
  }

  if (q) {
    filtered = filtered.filter((i) => {
      const hay = [
        i.id,
        i.ref,
        i.spelling,
        i.meaning,
        i.concept_id,
        ...(i.aliases ?? []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  return { items: filtered, total: filtered.length };
}

export async function getWordDetail(ref, { kind = null } = {}) {
  const { items } = await listWordInventory({ filter: 'all' });
  let item = items.find(i => i.ref === ref || i.id === ref || i.concept_id === ref);
  if (!item && kind === 'compound') {
    item = items.find(i => i.kind === 'compound' && (i.spelling === ref || i.id === ref));
  }
  if (!item) {
    const err = new Error(`Word not found: ${ref}`);
    err.status = 404;
    throw err;
  }

  const voteRef = item.kind === 'root' ? (item.concept_id ?? item.ref) : item.ref;
  const votes = await getVoteAggregate(item.kind === 'proposal' ? 'proposal' : 'word', voteRef);

  const [inventory, candidatesDoc, lab, localization] = await Promise.all([
    loadConceptInventory(),
    getRootCandidates({ status: null }),
    getLab(),
    readDoc('localization_en'),
  ]);

  const concept = item.kind === 'root'
    ? (inventory?.concepts ?? []).find(c => (c.id ?? c.concept) === item.concept_id)
    : null;
  const candidate = item.kind === 'root'
    ? (candidatesDoc?.candidates ?? []).find(c => (c.concept ?? c.id) === item.concept_id)
    : null;
  const sound = item.kind === 'root'
    ? (lab?.sounds ?? []).find(s => s.concept_id === item.concept_id)
    : null;
  const compound = item.kind === 'compound'
    ? (lab?.compounds ?? []).find(c => c.id === item.id)
    : null;
  const aliasesDoc = localization?.concepts ?? localization ?? {};

  return {
    ...item,
    concept,
    candidate,
    sound,
    compound,
    aliases: item.aliases?.length
      ? item.aliases
      : aliasesDoc[item.concept_id ?? item.id]?.aliases ?? [],
    votes,
  };
}

export async function acceptProposal(proposal, adminEmail) {
  const { resolveProposal } = await import('./fonoran-community-store.js');
  const { addSound, addCompound, patchSound, recomposeCompound, assignCompoundMeaning } = await import('./fonoran-sound-bucket.js');
  const { patchRootCandidate } = await import('./fonoran-root-store.js');
  const { patchConcept } = await import('./fonoran-concept-store.js');

  const payload = proposal.payload ?? {};

  if (proposal.kind === 'alternate_spelling' && proposal.target_type === 'root') {
    if (payload.spelling) {
      await patchConcept(proposal.target_ref, { spelling: payload.spelling });
    }
    const candId = payload.candidate_id;
    if (candId) {
      await patchRootCandidate(candId, { action: 'approve', spelling: payload.spelling });
    }
  } else if (proposal.kind === 'new_compound' || proposal.kind === 'alternate_spelling') {
    if (payload.compound_id) {
      if (Array.isArray(payload.components) || Array.isArray(payload.parts)) {
        await recomposeCompound(payload.compound_id, payload);
      } else if (payload.meaning) {
        await assignCompoundMeaning(payload.compound_id, payload.meaning, {
          state: 'needs_review',
          aliases: payload.aliases,
        });
      }
    } else if (Array.isArray(payload.components) || Array.isArray(payload.parts)) {
      await addCompound({
        components: payload.components,
        parts: payload.parts,
        meaning: payload.meaning,
        aliases: payload.aliases,
        state: 'needs_review',
      });
    }
  } else if (proposal.kind === 'meaning_edit') {
    if (proposal.target_type === 'root') {
      await patchConcept(proposal.target_ref, {
        gloss: payload.meaning ?? payload.gloss,
        aliases: payload.aliases,
      });
    } else if (payload.compound_id) {
      await assignCompoundMeaning(payload.compound_id, payload.meaning, {
        state: payload.state ?? 'revised',
        aliases: payload.aliases,
      });
    }
  }

  return resolveProposal(proposal.id, { status: 'accepted', resolvedBy: adminEmail });
}
