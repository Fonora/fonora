/**
 * Fonoran grammar particles: loader + English->particle resolution.
 *
 * Particles are an invariant, closed class separate from lexical roots/compounds
 * (docs/fonoran-grammar.md Rule 3). This module exposes the inventory and a
 * trigger index used by the translator's grammar-particle stage and by the API.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARTICLES_PATH = join(ROOT, 'data/fonoran-grammar-particles.json');

let cache = null;
let triggerIndex = null;

/** Load the particle inventory (cached). */
export async function loadParticles() {
  if (cache) return cache;
  cache = JSON.parse(await readFile(PARTICLES_PATH, 'utf8'));
  return cache;
}

/** English trigger word -> particle entry { id, form, role, group, gloss }. */
export async function buildParticleIndex() {
  if (triggerIndex) return triggerIndex;
  const data = await loadParticles();
  const index = new Map();
  for (const p of data.particles ?? []) {
    if (!p.form || !Array.isArray(p.triggers)) continue;
    for (const trigger of p.triggers) {
      const key = String(trigger).trim().toLowerCase();
      if (!key || index.has(key)) continue;
      index.set(key, {
        id: p.id,
        form: p.form,
        role: p.role,
        group: p.group,
        gloss: p.gloss,
      });
    }
  }
  triggerIndex = index;
  return triggerIndex;
}

/** Resolve a single English word to a particle entry, or null. */
export async function resolveParticle(word) {
  const idx = await buildParticleIndex();
  return idx.get(String(word ?? '').trim().toLowerCase()) ?? null;
}

/** Find a particle entry by id. */
export async function particleById(id) {
  const data = await loadParticles();
  return (data.particles ?? []).find(p => p.id === id) ?? null;
}

/**
 * Quantifier-pronoun composition spec, or null.
 * Returns an ordered list of parts: { kind: 'particle'|'concept', ref }.
 * 'neg' maps to the negation particle; 'all'/'some' map to lexical roots.
 */
export async function quantifierExpansion(word) {
  const data = await loadParticles();
  const spec = data.quantifier_pronouns?.[String(word ?? '').trim().toLowerCase()];
  if (!Array.isArray(spec)) return null;
  return spec.map((piece) => {
    if (piece === 'neg') return { kind: 'particle', id: 'logic_not' };
    return { kind: 'concept', ref: piece };
  });
}

/**
 * Synchronous-friendly runtime bundle for the translator (cached via loaders):
 * { data, index: Map(trigger->entry), byId: Map(id->particle), quantifiers }.
 */
export async function getParticleRuntime() {
  const data = await loadParticles();
  const index = await buildParticleIndex();
  const byId = new Map((data.particles ?? []).map(p => [p.id, p]));
  return { data, index, byId, quantifiers: data.quantifier_pronouns ?? {} };
}

/** Reset caches (tests / cache invalidation). */
export function resetParticleCache() {
  cache = null;
  triggerIndex = null;
}
