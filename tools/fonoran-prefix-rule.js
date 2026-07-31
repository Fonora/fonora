/**
 * The prefix rule: no approved root may prefix, or be prefixed by, another.
 *
 * A leaf module on purpose. The rule is needed both by root assignment (so a colliding
 * form is never handed out) and by the prefix-safe inventory audit, and those two import
 * each other. Keeping the predicate here means there is one implementation rather than a
 * generator that permits what the audit later rejects.
 */

/**
 * @param {string} form
 * @param {Iterable<string>} taken
 * @returns {string[]} the taken forms that collide with `form`
 */
export function findPrefixConflicts(form, taken) {
  const f = String(form || '').toLowerCase();
  if (!f) return [];
  const hits = [];
  for (const other of taken) {
    const o = String(other || '').toLowerCase();
    if (!o || o === f) continue;
    if (o.startsWith(f) || f.startsWith(o)) hits.push(o);
  }
  return hits.sort();
}

/**
 * @param {string} form
 * @param {Iterable<string>} taken
 * @returns {boolean}
 */
export function isPrefixSafe(form, taken) {
  return findPrefixConflicts(form, taken).length === 0;
}
