/** Split English-ish text into searchable word tokens (ids, gloss, aliases). */
export function englishSearchTokens(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
}

/**
 * Match lab/dictionary search without English substring false positives
 * (e.g. query "other" must not match alias "mother").
 * Fonoran spellings still use substring match for syllable-style lookup.
 */
export function labEntryMatchesQuery(query, fields = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;

  const spelling = String(fields.spelling ?? fields.word ?? '').toLowerCase();
  if (spelling && spelling.includes(q)) return true;

  const aliasField = fields.aliases;
  const aliasText = Array.isArray(aliasField) ? aliasField.join(' ') : aliasField;

  const englishParts = [
    fields.english,
    fields.meaning,
    fields.gloss,
    fields.legacy_label,
    fields.concept_id,
    fields.composition_readable,
    fields.generator_hint,
    fields.hint,
    aliasText,
    ...(fields.parts ?? []),
  ].filter(Boolean);

  const hayTokens = englishSearchTokens(englishParts.join(' '));
  const qTokens = q.split(/\s+/).filter(Boolean);
  return qTokens.every(qt => hayTokens.some(ht => ht.startsWith(qt)));
}
