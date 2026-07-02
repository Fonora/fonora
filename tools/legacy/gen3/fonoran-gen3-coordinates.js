/**
 * Shared DDA coordinate → phonetic root resolution.
 * Used by generators, stabilization, and audits.
 */

export const MANNER_ORDER = ['plain', 'voice', 'friction', 'nasal', 'glide'];
export const PLACE_IDS = ['1', '2', '3', '4', '5'];

export function resolveCanonical(primitive, config) {
  return {
    place: config.depth_to_place[primitive.D],
    manner: config.mode_to_manner[primitive.M],
    vowel: config.aspect_vowel[primitive.A],
    D: primitive.D,
    M: primitive.M,
    A: primitive.A,
    notation: `⟨${primitive.D}, ${primitive.M}, ${primitive.A}⟩`,
  };
}

export function buildSyllable(onset, vowel, coda = '') {
  if (!onset) return null;
  return coda ? onset + vowel + coda : onset + vowel;
}

export function plainCodas(config) {
  const row = config.sound_grid.plain;
  const out = [];
  for (const p of PLACE_IDS) {
    const c = row[p];
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

export function generateRoot(primitive, config, manner, place, vowel, coda = '') {
  const onset = config.sound_grid[manner]?.[place] ?? null;
  const root = buildSyllable(onset, vowel, coda);
  const canonical = config.aspect_vowel[primitive.A];
  return {
    root,
    coordinates: {
      id: primitive.id,
      gloss: primitive.gloss,
      D: primitive.D,
      M: primitive.M,
      A: primitive.A,
      place,
      manner,
      vowel,
      vowel_canonical: canonical,
      phonetic_spread: vowel !== canonical,
      syllable_template: coda ? 'CVC' : 'CV',
      coda: coda || null,
      fonora_onset: onset,
      notation: `⟨${primitive.D}, ${primitive.M}, ${primitive.A}⟩`,
    },
  };
}

/**
 * Enumerate coordinate-faithful candidates only (canonical place + manner).
 * No post-generation grid repair: vowel spread and CVC extension only.
 * When canonical place+manner yields null onset (throat hollow/glide), also yields
 * same-place manner alternatives as phonotactic options (not place rotation).
 */
export function* coordinateFaithfulCandidates(primitive, config) {
  const canon = resolveCanonical(primitive, config);
  const pool = config.phonetic_realization?.aspect_vowel_pools?.[primitive.A]
    ?? [canon.vowel];
  const seen = new Set();

  const push = (place, manner, vowel, coda = '', phonotactic_alt = false) => {
    const key = `${place}|${manner}|${vowel}|${coda}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return { place, manner, vowel, coda, canon, phonotactic_alt };
  };

  const phases = [];
  for (const vowel of pool) phases.push([canon.place, canon.manner, vowel, '', false]);
  for (const vowel of pool) {
    for (const coda of plainCodas(config)) {
      phases.push([canon.place, canon.manner, vowel, coda, false]);
    }
  }

  const canonOnset = config.sound_grid[canon.manner]?.[canon.place] ?? null;
  if (!canonOnset) {
    for (const manner of MANNER_ORDER) {
      if (manner === canon.manner) continue;
      const onset = config.sound_grid[manner]?.[canon.place];
      if (!onset) continue;
      for (const vowel of pool) phases.push([canon.place, manner, vowel, '', true]);
      for (const vowel of pool) {
        for (const coda of plainCodas(config)) {
          phases.push([canon.place, manner, vowel, coda, true]);
        }
      }
    }
  }

  for (const [place, manner, vowel, coda, phonotactic_alt] of phases) {
    const c = push(place, manner, vowel, coda, phonotactic_alt);
    if (c) yield c;
  }
}
