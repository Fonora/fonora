/**
 * Puzzle display formatting — morpheme boundaries and nested breakdowns.
 */

/** Join items with middle-dot boundary separator. */
export function joinBoundaries(items, sep = ' · ') {
  return (items ?? []).filter(Boolean).join(sep);
}

/** Format root spellings with syllable boundaries, e.g. ba · kam · gu */
export function formatSpellingDisplay(parts) {
  return joinBoundaries(parts ?? []);
}

function meaningOf(item) {
  return (item?.meaning ?? item?.concept_id ?? item?.gloss ?? '').toString().trim();
}

function labelFromId(id) {
  return String(id).replace(/_/g, ' ');
}

/** Parse direct composition ids from composition_readable or direct_composition. */
export function directCompositionIds(compound) {
  if (Array.isArray(compound.direct_composition) && compound.direct_composition.length) {
    return compound.direct_composition;
  }
  const readable = compound.composition_readable?.trim();
  if (!readable) return [];
  const eq = readable.indexOf('=');
  if (eq < 0) return [];
  return readable.slice(eq + 1).split('+').map(s => s.trim()).filter(Boolean);
}

function isCompoundConcept(id, lab) {
  return (lab?.compounds ?? []).some(c => c.concept_id === id);
}

function directRecipeLabel(ids) {
  return ids.map(id => labelFromId(id)).join(' + ');
}

function compoundByConceptId(lab) {
  return new Map((lab?.compounds ?? []).map(c => [c.concept_id, c]));
}

function buildComponentLevel(id, lab, compoundById) {
  const child = compoundById.get(id);
  if (child) {
    const parts = child.parts ?? [];
    const directIds = directCompositionIds(child);
    return {
      id,
      label: labelFromId(id),
      spelling_display: formatSpellingDisplay(parts) || child.spelling || id,
      recipe: directIds.length ? directRecipeLabel(directIds) : null,
      is_compound: true,
    };
  }
  const snd = (lab?.sounds ?? []).find(s => s.concept_id === id);
  return {
    id,
    label: labelFromId(id),
    spelling_display: snd?.spelling ?? id,
    recipe: null,
    is_compound: false,
  };
}

/**
 * Build structured breakdown for puzzle repair/reveal surfaces.
 * @param {{ compound: object, lab: object }} opts
 */
export function buildPuzzleBreakdown({ compound, lab }) {
  const parts = compound.parts ?? [];
  const literalParts = parts.map(spelling => {
    const snd = (lab?.sounds ?? []).find(s => s.spelling === spelling);
    return { spelling, meaning: snd ? meaningOf(snd) : spelling };
  });

  const spellingsFlat = formatSpellingDisplay(literalParts.map(lp => lp.spelling));
  const conceptsFlat = joinBoundaries(literalParts.map(lp => lp.meaning));

  const directIds = directCompositionIds(compound);
  const compoundById = compoundByConceptId(lab);
  const hasCompoundComponent = directIds.some(id => isCompoundConcept(id, lab));
  const nested = hasCompoundComponent || (directIds.length > 0 && parts.length > directIds.length);

  const answer = meaningOf(compound);
  const spelling = compound.spelling ?? '';
  const recipe = directIds.length ? directRecipeLabel(directIds) : conceptsFlat.replace(/ · /g, ' + ');

  const levels = directIds.map(id => buildComponentLevel(id, lab, compoundById));

  return {
    spelling_display: spellingsFlat || spelling,
    nested,
    spelling,
    answer,
    recipe: directIds.length ? recipe : null,
    show_recipe: directIds.length >= 2,
    spellings_flat: spellingsFlat,
    concepts_flat: conceptsFlat,
    headline: `${spelling} → ${answer}`,
    spellings_line: spellingsFlat,
    concepts_line: conceptsFlat,
    levels,
  };
}
