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
 *
 * Trailing space (after trimEnd of other whitespace is not applied to the
 * trailing marker): query "ye " → exact roman spelling match only.
 * Optional `script` / `scripts` fields enable Fonora glyph substring search.
 */
export function labEntryMatchesQuery(query, fields = {}) {
  const raw = String(query ?? '');
  const exactSpelling = /\s$/.test(raw);
  const q = raw.trim().toLowerCase();
  if (!q) return true;

  const spelling = String(fields.spelling ?? fields.word ?? '').toLowerCase();

  if (exactSpelling) {
    return Boolean(spelling) && spelling === q;
  }

  if (spelling && spelling.includes(q)) return true;

  const scriptFields = [];
  if (fields.script) scriptFields.push(fields.script);
  if (Array.isArray(fields.scripts)) scriptFields.push(...fields.scripts);
  else if (fields.scripts) scriptFields.push(fields.scripts);
  const scriptNeedle = raw.trim();
  if (scriptNeedle && scriptFields.some(s => String(s ?? '').includes(scriptNeedle))) return true;

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
